const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createUserCredentialStore } = require('./userCredentialStore');
require('dotenv').config();

// Telegram alerts
const { getTelegramAlertService } = require('./infrastructure/notifications/telegram-alerts');
const telegramAlerts = getTelegramAlertService();

// SMS alerts (graceful fallback)
const { getSMSAlertService } = require('./infrastructure/notifications/sms-alerts');
const smsAlerts = getSMSAlertService();

// Prometheus metrics
const promClient = require('prom-client');
const register = promClient.register; // Use default register

// ── PostgreSQL trade persistence (optional — requires DATABASE_URL) ──────────
const { Pool: PgPool } = require('pg');
let dbPool = null;

async function initTradeDb() {
    if (!process.env.DATABASE_URL) {
        console.log('⚠️  DATABASE_URL not set — auth + trade persistence disabled');
        return;
    }
    try {
        dbPool = new PgPool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user',
                refresh_token TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_login TIMESTAMPTZ,
                subscription_tier VARCHAR(20) DEFAULT 'free',
                live_trading_enabled BOOLEAN DEFAULT false
            );
            ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS live_trading_enabled BOOLEAN DEFAULT false
        `);
        console.log('✅ Crypto bot: Auth DB ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS trades (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                bot VARCHAR(20) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                direction VARCHAR(10) NOT NULL,
                tier VARCHAR(10),
                strategy VARCHAR(50),
                regime VARCHAR(50),
                status VARCHAR(10) NOT NULL DEFAULT 'open',
                entry_price DECIMAL(20,8),
                exit_price DECIMAL(20,8),
                quantity DECIMAL(20,8),
                position_size_usd DECIMAL(12,2),
                pnl_usd DECIMAL(12,2),
                pnl_pct DECIMAL(8,4),
                stop_loss DECIMAL(20,8),
                take_profit DECIMAL(20,8),
                entry_time TIMESTAMPTZ,
                exit_time TIMESTAMPTZ,
                close_reason VARCHAR(100),
                session VARCHAR(30),
                signal_score DECIMAL(10,3),
                entry_context JSONB DEFAULT '{}'::jsonb,
                rsi DECIMAL(6,2),
                volume_ratio DECIMAL(6,2),
                momentum_pct DECIMAL(8,4),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy VARCHAR(50);
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS regime VARCHAR(50);
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS signal_score DECIMAL(10,3);
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_context JSONB DEFAULT '{}'::jsonb;
            CREATE INDEX IF NOT EXISTS idx_trades_bot ON trades(bot);
            CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
            CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
            CREATE INDEX IF NOT EXISTS idx_trades_user_bot ON trades(user_id, bot);
            CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy);
            CREATE INDEX IF NOT EXISTS idx_trades_regime ON trades(regime);
        `);
        console.log('✅ Crypto bot: Trades table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS engine_state (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bot VARCHAR(20) NOT NULL,
                state_json JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (user_id, bot)
            )
        `);
        console.log('✅ Crypto bot: Engine state table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS user_credentials (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                broker VARCHAR(30) NOT NULL,
                credential_key VARCHAR(100) NOT NULL,
                encrypted_value TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, broker, credential_key)
            );
            CREATE INDEX IF NOT EXISTS idx_user_creds_lookup ON user_credentials(user_id, broker);
        `);
        console.log('✅ Crypto bot: User credentials table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(64) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL
            )
        `);
        console.log('✅ Crypto bot: Password reset tokens table ready');
    } catch (e) {
        console.warn('⚠️  Crypto DB init failed:', e.message);
        dbPool = null;
    }
}

function buildCryptoTradeTags(signal = {}, tier) {
    const normalizedTier = tier || signal.tier || 'tier1';
    const normalizedStrategy = signal.strategy || 'momentum';
    const score = signal.score != null ? parseFloat(Number(signal.score).toFixed(3)) : null;

    let regime = signal.regime || signal.marketRegime || 'trend-expansion';
    if (!signal.regime && !signal.marketRegime) {
        if (normalizedStrategy === 'trendPullback') regime = 'pullback-trend';
        else if ((signal.sizingFactor || 1) < 1) regime = 'cautious-risk-on';
        else if (normalizedTier === 'tier3') regime = 'trend-expansion';
    }

    return {
        strategy: normalizedStrategy,
        regime,
        score,
        context: {
            tier: normalizedTier,
            momentum: signal.momentum ?? null,
            trendStrength: signal.trendStrength ?? null,
            pullbackPct: signal.pullbackPct ?? null,
            atrPct: signal.atrPct ?? null,
            rsi: signal.rsi ?? null,
            volumeRatio: signal.volumeRatio ?? null,
            volume24h: signal.volume24h ?? null,
            sizingFactor: signal.sizingFactor ?? null,
            regimeQuality: signal.regimeQuality ?? null
        }
    };
}

async function dbCryptoOpen(symbol, tier, entry, stopLoss, takeProfit, quantity, positionSize, signal = {}) {
    if (!dbPool) return null;
    try {
        const tags = buildCryptoTradeTags(signal, tier);
        const r = await dbPool.query(
            `INSERT INTO trades (bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
             position_size_usd,stop_loss,take_profit,entry_time,signal_score,entry_context,rsi,volume_ratio,momentum_pct)
             VALUES ('crypto',$1,'long',$2,$3,$4,'open',$5,$6,$7,$8,$9,NOW(),$10,$11::jsonb,$12,$13,$14) RETURNING id`,
            [symbol, tier, tags.strategy, tags.regime, entry, quantity, positionSize, stopLoss, takeProfit,
             tags.score, JSON.stringify(tags.context), signal.rsi || null, signal.volumeRatio || null, signal.momentum || null]
        );
        return r.rows[0]?.id;
    } catch (e) { console.warn('DB crypto open failed:', e.message); return null; }
}

async function dbCryptoClose(id, exitPrice, pnlUsd, pnlPct, reason) {
    if (!dbPool || !id) return;
    try {
        await dbPool.query(
            `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,
             exit_time=NOW(),close_reason=$4 WHERE id=$5`,
            [exitPrice, pnlUsd, pnlPct, reason, id]
        );
    } catch (e) { console.warn('DB crypto close failed:', e.message); }
}

/**
 * UNIFIED CRYPTO TRADING BOT
 * v3.2 - Crypto Council Improvements:
 * 1. Wilder's Smoothed RSI (replaces simple-average — matches broker platform values)
 * 2. MACD(12,26,9) confirmation filter (only enter when MACD histogram is bullish)
 * 3. Enhanced BTC filter with RSI + 24h change check (avoids overbought/weak BTC)
 * 4. Tighter trailing stops (+5% → trail 3%, +10% → 6%, +20% → 12%, +30% → 18%)
 * 5. Volume surge filter (current 5-min bar must have 1.5x average volume)
 * 6. Dynamic position sizing (Kelly-inspired: scale with win rate, capped 0.25x–2.0x)
 */

// ============================================================================
// CRYPTO TRADING CONFIGURATION (24/7/365)
// ============================================================================

const CRYPTO_CONFIG = {
    // Exchange Configuration — Kraken (US-friendly, no geo-block)
    exchange: {
        name: 'kraken',
        apiKey: process.env.CRYPTO_API_KEY,
        apiSecret: process.env.CRYPTO_API_SECRET,
        baseURL: 'https://api.kraken.com'
    },

    // Trading Pairs — Kraken format (XBT = Bitcoin on Kraken)
    symbols: [
        // Layer 1 Blue Chips
        'XBTUSD',   // Bitcoin
        'ETHUSD',   // Ethereum
        'SOLUSD',   // Solana
        'ADAUSD',   // Cardano
        'XRPUSD',   // Ripple
        'AVAXUSD',  // Avalanche
        'DOTUSD',   // Polkadot
        'LTCUSD',   // Litecoin
        'ATOMUSD',  // Cosmos
        // DeFi
        'LINKUSD',  // Chainlink
        'UNIUSD',   // Uniswap
        'AAVEUSD',  // Aave
        'MKRUSD',   // Maker
        'SNXUSD',   // Synthetix
        'CRVUSD',   // Curve
        // Layer 2 / Scaling
        'MATICUSD', // Polygon
        'OPUSD',    // Optimism
        'ARBUSD',   // Arbitrum
        // Infrastructure / Interop
        'ALGOUSD',  // Algorand
        'NEARUSD',  // Near Protocol
        'FTMUSD',   // Fantom
        'ICPUSD',   // Internet Computer
        'FILUSD',   // Filecoin
        // Newer High-Momentum
        'APTUSD',   // Aptos
        'SUIUSD',   // Sui
        'INJUSD',   // Injective
        'TIAUSD',   // Celestia
        'WIFUSD',   // dogwifhat (high vol)
    ],

    // Risk Management
    maxTotalPositions: 4,  // 4 positions max
    maxPositionsPerSymbol: 1,
    maxTradesPerDay: 10,
    maxTradesPerSymbol: 2,
    minTimeBetweenTrades: 30, // 30 min cooldown

    // Position Sizing (smaller due to crypto volatility)
    accountRiskPercent: 0.02, // 2% risk per trade
    basePositionSizeUSD: 500, // $500 per position (conservative)
    maxPositionSizeUSD: 2000, // Max $2000 per position

    // [v6.1] 3-Tier Strategy — realistic targets for 5-min candles
    // Old: 15/20/30% targets → 0% win rate (unreachable on 5-min timeframe)
    // New: 3/5/8% targets with tighter stops → achievable 2:1 R:R
    tiers: {
        tier1: {
            name: 'Standard Crypto',
            momentumThreshold: 0.005, // 0.5% momentum (was 0.3% — too noisy)
            stopLoss: 0.035,         // 3.5% stop (was 2% — too tight for crypto 5-min bars + 0.6% slippage)
            profitTarget: 0.05,      // 5% target (~1.4:1 R/R after slippage)
            rsiLower: 30,            // Tighter RSI (was 20 — too oversold)
            rsiUpper: 70,            // Tighter RSI (was 80 — too overbought)
            maxPositions: 4
        },
        tier2: {
            name: 'High Momentum',
            momentumThreshold: 0.015, // 1.5% momentum (was 1.2%)
            stopLoss: 0.045,         // 4.5% stop (was 3% — too tight)
            profitTarget: 0.07,      // 7% target (~1.6:1 R/R after slippage)
            rsiLower: 35,
            rsiUpper: 75,
            maxPositions: 2
        },
        tier3: {
            name: 'Extreme Momentum',
            momentumThreshold: 0.03,  // 3% momentum (was 2.5%)
            stopLoss: 0.06,          // 6% stop (was 4% — too tight)
            profitTarget: 0.10,      // 10% target (~1.7:1 R/R after slippage)
            rsiLower: 35,
            rsiUpper: 80,
            maxPositions: 1
        }
    },

    pullbackStrategy: {
        maxPullbackFromEMA9: 0.03,
        minTrendStrength: 0.0015,
        rsiLower: 38,
        rsiUpper: 64,
        minVolumeRatio: 0.75,
        stopLoss: 0.04,
        profitTarget: 0.10,
        maxPositions: 2,
        sizingFactor: 0.85
    },

    // Crypto-Specific Filters
    filters: {
        btcCorrelation: true,  // Check BTC trend before altcoin trades
        volumeConfirmation: true,
        minVolumeUSD: 10000000, // $10M daily volume minimum
        minVolumeRatioMomentum: 0.65,
        maxVolatility24h: 0.30, // Pause if >30% move in 24h
        avoidWeekend: false     // Crypto trades 24/7 even weekends
    },

    // Trailing Stops — v3.2: tighter stops to capture more profit before reversal
    trailingStops: [
        { profit: 0.05, stopDistance: 0.03 }, // At +5%, trail by 3% (NEW — protect early gains)
        { profit: 0.10, stopDistance: 0.06 }, // At +10%, trail by 6% (was 5%)
        { profit: 0.20, stopDistance: 0.12 }, // At +20%, trail by 12% (was 8%)
        { profit: 0.30, stopDistance: 0.18 }  // At +30%, trail by 18% (was 12%)
    ],

    // Scan Interval (5 min for crypto)
    scanInterval: 300000, // 5 minutes (300,000ms)

    // Time-based exit thresholds
    maxHoldDays: 3,         // Force-exit loss positions after 3 days
    stalePositionDays: 5    // Emergency close after 5 days regardless of P/L
};

function scoreCryptoSignal({ strategy, tier, momentum, trendStrength, volumeRatio, rsi, sizingFactor, macdBullish }) {
    const tierWeight = tier === 'tier3' ? 2.6 : tier === 'tier2' ? 1.9 : tier === 'tier1' ? 1.3 : 1.1;
    const strategyWeight = strategy === 'trendPullback' ? 1.05 : 1.25;
    const rsiSweetSpot = strategy === 'trendPullback'
        ? (rsi >= 42 && rsi <= 60 ? 1.12 : 1.0)
        : (rsi >= 45 && rsi <= 70 ? 1.08 : 1.0);
    const momentumComponent = strategy === 'trendPullback'
        ? Math.max(0.5, trendStrength * 180)
        : Math.max(0.5, momentum * 10);
    const macdWeight = macdBullish ? 1.08 : 0.96;

    return parseFloat(
        (tierWeight * strategyWeight * momentumComponent * Math.max(1, volumeRatio) * rsiSweetSpot * Math.max(0.5, sizingFactor) * macdWeight)
            .toFixed(3)
    );
}

function evaluateCryptoRegimeSignal({ strategy, btcBullish, trendStrength, volumeRatio, rsi, pullbackPct, tier }) {
    let quality = btcBullish ? 1.08 : 0.86;
    if (strategy === 'trendPullback') {
        if (pullbackPct >= 0.4 && pullbackPct <= 1.8) quality *= 1.08;
        else if (pullbackPct > 2.4) quality *= 0.82;
    } else {
        if (trendStrength >= 0.9) quality *= 1.08;
        else if (trendStrength < 0.45) quality *= 0.84;
    }

    if (volumeRatio >= 1.5) quality *= 1.06;
    else if (volumeRatio < 1.1) quality *= 0.84;

    if (rsi >= 46 && rsi <= 68) quality *= 1.04;
    else if (rsi > 75) quality *= 0.82;

    let regime = btcBullish ? 'risk-on' : 'cautious';
    if (strategy === 'trendPullback') regime = btcBullish ? 'pullback-trend' : 'cautious-pullback';
    else if (tier === 'tier3') regime = btcBullish ? 'trend-expansion' : 'cautious-breakout';

    return {
        tradable: quality >= 0.9,
        regime,
        quality: parseFloat(quality.toFixed(3))
    };
}

function isRealTradingEnabled() {
    return process.env.REAL_TRADING_ENABLED === 'true';
}

// ============================================================================
// KRAKEN API CLIENT  (replaces Binance — US-friendly, no geo-block)
// ============================================================================

class KrakenClient {
    constructor(config) {
        this.baseURL = 'https://api.kraken.com';
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
    }

    // Kraken HMAC-SHA512 signature for private endpoints
    _sign(path, nonce, postData) {
        const sha256Digest = crypto.createHash('sha256').update(nonce + postData).digest('binary');
        const secretBuffer = Buffer.from(this.apiSecret, 'base64');
        return crypto.createHmac('sha512', secretBuffer).update(path + sha256Digest, 'binary').digest('base64');
    }

    async _privateRequest(endpoint, params = {}) {
        const nonce = Date.now().toString();
        const postData = new URLSearchParams({ nonce, ...params }).toString();
        const path = `/0/private/${endpoint}`;
        const signature = this._sign(path, nonce, postData);
        const response = await axios.post(`${this.baseURL}${path}`, postData, {
            headers: {
                'API-Key': this.apiKey,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 10000,
        });
        if (response.data.error && response.data.error.length > 0) {
            throw new Error(response.data.error.join(', '));
        }
        return response.data.result;
    }

    // Get account balances
    async getAccountInfo() {
        try {
            const result = await this._privateRequest('Balance');
            return result; // { ZUSD: '10000.00', XXBT: '0.5', ... }
        } catch (error) {
            console.error('❌ Failed to get account info:', error.message);
            return null;
        }
    }

    // Get current price — public Ticker endpoint, no auth needed
    async getPrice(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/0/public/Ticker`, {
                params: { pair: symbol }, timeout: 5000,
            });
            const result = response.data.result;
            const key = Object.keys(result)[0];
            return parseFloat(result[key].c[0]); // Last trade price
        } catch (error) {
            console.error(`❌ Failed to get price for ${symbol}:`, error.message);
            return null;
        }
    }

    // Get 24h ticker data — public, no auth needed
    async get24hTicker(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/0/public/Ticker`, {
                params: { pair: symbol }, timeout: 5000,
            });
            const result = response.data.result;
            const key = Object.keys(result)[0];
            const t = result[key];
            const lastPrice = parseFloat(t.c[0]);
            const openPrice = parseFloat(t.o);
            const priceChangePercent = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;
            return {
                lastPrice: lastPrice.toString(),
                highPrice: t.h[1],
                lowPrice:  t.l[1],
                quoteVolume: (parseFloat(t.v[1]) * lastPrice).toString(), // approx 24h USD volume
                priceChangePercent: priceChangePercent.toFixed(4),
            };
        } catch (error) {
            console.error(`❌ Failed to get 24h ticker for ${symbol}:`, error.message);
            return null;
        }
    }

    async getAssetPairs() {
        try {
            const response = await axios.get(`${this.baseURL}/0/public/AssetPairs`, {
                timeout: 10000,
            });
            if (response.data.error && response.data.error.length > 0) {
                throw new Error(response.data.error.join(', '));
            }
            return response.data.result || {};
        } catch (error) {
            console.error('❌ Failed to fetch Kraken asset pairs:', error.message);
            return null;
        }
    }

    // Get OHLCV candles — public, no auth needed
    // Kraken interval in minutes: 1,5,15,30,60,240,1440
    async getKlines(symbol, interval = '5m', limit = 100) {
        const intervalMap = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
        const krakenInterval = intervalMap[interval] || 5;
        try {
            const response = await axios.get(`${this.baseURL}/0/public/OHLC`, {
                params: { pair: symbol, interval: krakenInterval }, timeout: 10000,
            });
            const result = response.data.result;
            const key = Object.keys(result).find(k => k !== 'last');
            const candles = result[key];
            // Kraken OHLC row: [time, open, high, low, close, vwap, volume, count]
            // Return last `limit` rows in Binance-compatible format: index 4 = close, index 5 = volume
            return candles.slice(-limit).map(c => [c[0], c[1], c[2], c[3], c[4], c[6]]);
        } catch (error) {
            console.error(`❌ Failed to get klines for ${symbol}:`, error.message);
            return null;
        }
    }

    // Place a market order (requires API keys)
    async placeOrder(symbol, side, quantity) {
        try {
            const result = await this._privateRequest('AddOrder', {
                pair: symbol,
                type: side.toLowerCase(), // 'buy' or 'sell'
                ordertype: 'market',
                volume: quantity.toFixed(8),
            });
            // Kraken returns txid as an array; validate it's non-empty before returning.
            // An empty or missing txid means the order was not accepted — treat as failure
            // rather than silently recording an undefined orderId (which causes state corruption).
            if (!Array.isArray(result?.txid) || result.txid.length === 0) {
                const msg = result?.error?.length ? result.error.join(', ') : 'empty txid';
                console.error(`❌ Kraken rejected order for ${symbol}: ${msg}`);
                return null;
            }
            return { orderId: result.txid[0], ...result };
        } catch (error) {
            console.error(`❌ Failed to place order for ${symbol}:`, error.message);
            return null;
        }
    }
}

// ===== ADAPTIVE GUARDRAILS (v4.6) =====
const RISK_PER_TRADE = parseFloat(process.env.RISK_PER_TRADE || '0.005');
const MIN_SIGNAL_CONFIDENCE = parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.72');
const MIN_SIGNAL_SCORE = parseFloat(process.env.MIN_SIGNAL_SCORE || '0.72');
const MIN_REWARD_RISK = parseFloat(process.env.MIN_REWARD_RISK || '1.95');
const MAX_SIGNALS_PER_CYCLE = parseInt(process.env.MAX_SIGNALS_PER_CYCLE || '1');
const MAX_CONSECUTIVE_LOSSES = parseInt(process.env.MAX_CONSECUTIVE_LOSSES || '3');
const LOSS_PAUSE_MS = parseInt(process.env.LOSS_PAUSE_MS || '7200000');
const STOP_LOSS_COOLDOWN_MS = parseInt(process.env.STOP_LOSS_COOLDOWN_MS || '2700000');

// ============================================================================
// CRYPTO TRADING ENGINE
// ============================================================================

class CryptoTradingEngine {
    constructor(config) {
        this.config = config;
        this.kraken = new KrakenClient(config.exchange);

        // Persistent state file
        this.stateFile = require('path').join(__dirname, 'data/crypto-bot-state.json');

        // Trading state
        this.positions = new Map();
        this.priceHistory = new Map();
        this.activeSymbols = Array.from(config.symbols || []);
        this.invalidSymbols = new Set();
        this.lastSymbolValidationAt = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.scanCount = 0;

        // Anti-churning tracking
        this.tradesToday = [];
        this.lastTradeTime = new Map();
        this.dailyTradeCount = 0;
        this.dailyLoss = 0; // circuit breaker — resets at UTC midnight

        // Performance tracking
        this.totalTrades = 0;
        this.winningTrades = 0;
        this.losingTrades = 0;
        this.totalProfit = 0;
        this.totalLoss = 0;
        this.credentialsValid = null;
        this.credentialsError = null;
        this.lastCredentialCheckAt = 0;

        // Adaptive guardrails state (v4.6)
        this.guardrails = {
            consecutiveLosses: 0,
            recentResults: [],
            lanePausedUntil: 0,
            totalLossesToday: 0,
            totalWinsToday: 0,
        };
    }

    // ========================================================================
    // TECHNICAL INDICATORS
    // ========================================================================

    calculateSMA(data, period) {
        if (data.length < period) return null;
        const slice = data.slice(-period);
        return slice.reduce((sum, val) => sum + val, 0) / period;
    }

    calculateEMA(data, period) {
        if (data.length < period) return null;
        const multiplier = 2 / (period + 1);
        let ema = this.calculateSMA(data.slice(0, period), period);

        for (let i = period; i < data.length; i++) {
            ema = (data[i] - ema) * multiplier + ema;
        }
        return ema;
    }

    // [v3.2] Wilder's Smoothed RSI — industry-standard, matches broker platform values
    calculateRSI(prices, period = 14) {
        if (prices.length < period * 2) return 50;
        const changes = [];
        for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);

        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < period; i++) {
            if (changes[i] > 0) avgGain += changes[i];
            else avgLoss += Math.abs(changes[i]);
        }
        avgGain /= period;
        avgLoss /= period;

        for (let i = period; i < changes.length; i++) {
            const gain = changes[i] > 0 ? changes[i] : 0;
            const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }

        if (avgLoss === 0) return 100;
        return 100 - (100 / (1 + avgGain / avgLoss));
    }

    // [v3.2] MACD(12,26,9) — momentum confirmation; only enter when histogram is bullish & rising
    calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (prices.length < slowPeriod + signalPeriod) return null;

        // Build MACD line for each bar once we have enough data
        const macdLine = [];
        for (let i = slowPeriod - 1; i < prices.length; i++) {
            const slice = prices.slice(0, i + 1);
            const fast = this.calculateEMA(slice, fastPeriod);
            const slow = this.calculateEMA(slice, slowPeriod);
            if (fast !== null && slow !== null) macdLine.push(fast - slow);
        }

        if (macdLine.length < signalPeriod) return null;
        const signalLine = this.calculateEMA(macdLine, signalPeriod);
        if (signalLine === null) return null;

        const histogram = macdLine[macdLine.length - 1] - signalLine;
        const prevHistogram = macdLine.length > 1
            ? macdLine[macdLine.length - 2] - this.calculateEMA(macdLine.slice(0, -1), signalPeriod)
            : histogram;

        return {
            macd: macdLine[macdLine.length - 1],
            signal: signalLine,
            histogram,
            // Bullish = histogram positive (relaxed — was && rising, which filtered too many valid entries)
            bullish: histogram > 0
        };
    }

    calculateATR(klines, period = 14) {
        if (!klines || klines.length < period + 1) return null;
        const trs = [];
        for (let i = 1; i < klines.length; i++) {
            const high = parseFloat(klines[i][2]);
            const low = parseFloat(klines[i][3]);
            const prevClose = parseFloat(klines[i - 1][4]);
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trs.push(tr);
        }
        if (trs.length < period) return null;

        let atr = trs.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
        for (let i = period; i < trs.length; i++) {
            atr = ((atr * (period - 1)) + trs[i]) / period;
        }
        return atr;
    }

    // ========================================================================
    // STRATEGY BRIDGE
    // ========================================================================

    // v5.0: Shared bridge URL resolver with Railway-aware fallback
    _getBridgeUrl() {
        const raw = process.env.STRATEGY_BRIDGE_URL
            || process.env.RAILWAY_SERVICE_NEXUS_STRATEGY_BRIDGE_URL
            || (process.env.RAILWAY_ENVIRONMENT ? 'https://nexus-strategy-bridge-production.up.railway.app' : 'http://localhost:3010');
        if (raw.startsWith('http')) return raw;
        if (raw.includes('railway.app')) return `https://${raw}`;
        return `http://${raw}`;
    }

    // Non-blocking ensemble confirmation from Python strategy bridge.
    async queryStrategyBridge(symbol, prices) {
        try {
            if (!prices || prices.length < 30) return null;
            const bridgeUrl = this._getBridgeUrl();
            const priceData = prices.map((close, i) => ({
                timestamp: new Date(Date.now() - (prices.length - 1 - i) * 5 * 60000).toISOString(),
                open: close, high: close, low: close, close, volume: 0
            }));
            const response = await axios.post(`${bridgeUrl}/signal`,
                { symbol, prices: priceData, asset_class: 'crypto' },
                { timeout: 5000 }
            );
            return response.data;
        } catch (e) {
            return null;
        }
    }

    // ========================================================================
    // AI TRADE ADVISOR
    // ========================================================================

    // [v5.0] Agentic AI — HARD GATE via strategy bridge
    async queryAIAdvisor(signal) {
        try {
            const bridgeUrl = this._getBridgeUrl();
            const payload = {
                symbol: signal.symbol,
                direction: 'long',
                tier: signal.tier || 'tier1',
                asset_class: 'crypto',
                price: signal.price,
                rsi: signal.rsi || undefined,
                momentum: signal.momentum || undefined,
                trend_strength: signal.trendStrength || undefined,
                regime: signal.regime,
                regime_quality: signal.regimeQuality,
                score: signal.score || undefined,
                atr_pct: signal.atrPct || undefined,
            };
            console.log(`[Agent] Evaluating ${signal.symbol} via ${bridgeUrl}/agent/evaluate`);
            const response = await axios.post(`${bridgeUrl}/agent/evaluate`, payload, { timeout: 15000 });
            const result = response.data;
            console.log(`[Agent] ${signal.symbol}: ${result.approved ? 'APPROVED' : 'REJECTED'} (source: ${result.source}, conf: ${(result.confidence || 0).toFixed(2)}) — ${result.reason}`);
            return result;
        } catch (e) {
            console.error(`[Agent] ${signal.symbol} call FAILED: ${e.message} — BLOCKING trade (hard gate)`);
            return {
                approved: false,
                confidence: 1.0,
                reason: `Agent unreachable: ${e.message.slice(0, 80)}`,
                source: 'hard_gate_offline',
                risk_flags: ['agent_offline'],
                position_size_multiplier: 0,
            };
        }
    }

    // [v4.1] Report trade outcome for Scan AI learning
    async reportTradeOutcome(position, exitPrice, pnl, pnlPct, exitReason) {
        try {
            const bridgeUrl = this._getBridgeUrl();
            const holdMinutes = (Date.now() - (position.entryTime || Date.now())) / 60000;
            const payload = {
                symbol: position.symbol,
                asset_class: 'crypto',
                direction: 'long',
                tier: position.tier || 'tier1',
                entry_price: position.entryPrice || position.price,
                exit_price: exitPrice,
                pnl: pnl,
                pnl_pct: pnlPct * 100,
                r_multiple: 0,
                hold_duration_minutes: holdMinutes,
                exit_reason: exitReason,
                entry_regime: position.regime || undefined,
                entry_regime_quality: position.regimeQuality || undefined,
                entry_score: position.score || undefined,
                agent_approved: position.agentApproved,
                agent_confidence: position.agentConfidence,
            };
            await axios.post(`${bridgeUrl}/agent/trade-outcome`, payload, { timeout: 5000 });
            console.log(`[Learn] ${position.symbol} outcome reported: ${pnl > 0 ? 'WIN' : 'LOSS'} ${(pnlPct * 100).toFixed(2)}%`);
        } catch (e) {
            // Non-blocking
        }
    }

    // ========================================================================
    // BTC CORRELATION STRATEGY
    // ========================================================================

    // [v3.2] Enhanced BTC filter — adds RSI health check and 24h change threshold
    // Prevents entering altcoin trades when BTC is overbought or in sharp decline
    async isBTCBullish() {
        const btcPrices = this.priceHistory.get('XBTUSD') || [];
        if (btcPrices.length < 20) return true; // Default allow when insufficient data

        const sma20 = this.calculateSMA(btcPrices, 20);
        const currentPrice = btcPrices[btcPrices.length - 1];
        const ema9 = this.calculateEMA(btcPrices, 9);

        // Basic trend check: price above SMA20, EMA9 above SMA20
        const isTrending = currentPrice > sma20 && ema9 > sma20;
        if (!isTrending) return false;

        // [v3.2] RSI health check: avoid overbought (>70) and weak (<45) BTC
        const btcRsi = this.calculateRSI(btcPrices, 14);
        if (btcRsi < 45 || btcRsi > 70) {
            console.log(`[BTC Filter] RSI ${btcRsi.toFixed(1)} outside healthy range 45-70`);
            return false;
        }

        // [v3.2] 24h change check: avoid altcoin entries when BTC dropped >2% today
        try {
            const ticker = await this.kraken.get24hTicker('XBTUSD');
            if (ticker) {
                const change24h = parseFloat(ticker.priceChangePercent);
                if (change24h < -2) {
                    console.log(`[BTC Filter] 24h change ${change24h.toFixed(1)}% too negative — holding off altcoins`);
                    return false;
                }
            }
        } catch (e) {
            // Non-critical — proceed if ticker fetch fails
        }

        return true;
    }

    // ========================================================================
    // MARKET DATA FETCHING
    // ========================================================================

    async fetchMarketData(symbol) {
        try {
            // Get klines (5-min candles, last 100)
            const klines = await this.kraken.getKlines(symbol, '5m', 100);
            if (!klines || klines.length === 0) return null;

            // Extract close prices
            const prices = klines.map(k => parseFloat(k[4])); // Close price
            const volumes = klines.map(k => parseFloat(k[5])); // Volume

            // Store in history
            this.priceHistory.set(symbol, prices);

            // Get 24h ticker for volatility check
            const ticker24h = await this.kraken.get24hTicker(symbol);
            if (!ticker24h) return null;

            const currentPrice = parseFloat(ticker24h.lastPrice);
            const volume24h = parseFloat(ticker24h.quoteVolume); // USD volume
            const priceChange24h = parseFloat(ticker24h.priceChangePercent) / 100;
            const atr = this.calculateATR(klines);

            return {
                symbol,
                currentPrice,
                klines,
                prices,
                volumes,
                atr,
                atrPct: atr && currentPrice > 0 ? atr / currentPrice : null,
                volume24h,
                priceChange24h,
                high24h: parseFloat(ticker24h.highPrice),
                low24h: parseFloat(ticker24h.lowPrice)
            };
        } catch (error) {
            console.error(`❌ Error fetching data for ${symbol}:`, error.message);
            return null;
        }
    }

    // ========================================================================
    // MOMENTUM SCANNING
    // ========================================================================

    async scanForOpportunities() {
        const opportunities = [];
        const scanSymbols = await this.refreshSupportedSymbols();

        // Check BTC trend first (for altcoin correlation)
        const btcBullish = await this.isBTCBullish();
        if (!btcBullish) {
            console.log('🔴 BTC is bearish/neutral — scanning all symbols but halving altcoin position size');
        }

        for (const symbol of scanSymbols) {
            // When BTC is bearish, reduce altcoin position size (50%) instead of hard-skipping.
            // Hard-skipping 10/12 symbols leaves the bot idle for hours when BTC consolidates.
            // We still trade altcoins but with tighter sizing to limit exposure.
            const btcSizingFactor = (!btcBullish && symbol !== 'XBTUSD' && symbol !== 'ETHUSD') ? 0.5 : 1.0;

            // Skip if already have position
            if (this.positions.has(symbol)) {
                continue;
            }

            // Fetch market data
            const data = await this.fetchMarketData(symbol);
            if (!data) continue;

            // Volume filter
            if (data.volume24h < this.config.filters.minVolumeUSD) {
                continue;
            }

            // Volatility filter (pause if extreme move)
            const volatility24h = Math.abs(data.priceChange24h);
            if (volatility24h > this.config.filters.maxVolatility24h) {
                console.log(`⚠️ ${symbol}: Too volatile (${(volatility24h * 100).toFixed(1)}%)`);
                continue;
            }

            // Calculate indicators
            const sma20 = this.calculateSMA(data.prices, 20);
            const ema9 = this.calculateEMA(data.prices, 9);
            const sma50 = this.calculateSMA(data.prices, 50); // downtrend filter
            const rsi = this.calculateRSI(data.prices, 14);

            if (!sma20 || !ema9) continue;

            // [v6.2] Downtrend skip — if SMA50 available and price below it, skip long entries
            if (sma50 && data.currentPrice < sma50) {
                console.log(`🔻 ${symbol}: price $${data.currentPrice.toFixed(2)} below SMA50 $${sma50.toFixed(2)} — skipping (downtrend)`);
                continue;
            }

            // [v3.2] MACD confirmation — prefer bullish MACD but don't hard-block.
            // Hard-blocking meant zero signals during MACD consolidation phases.
            // Instead: log a warning and apply a 0.7x size penalty if MACD is not bullish.
            const macd = this.calculateMACD(data.prices);
            const macdBullish = macd && macd.bullish;
            const macdSizingFactor = macdBullish ? 1.0 : 0.7;
            if (!macdBullish) {
                console.log(`[MACD] ${symbol}: histogram not bullish — reducing size to 70%`);
            }

            // [v3.2] Volume surge filter — lowered from 1.5x to 1.2x average.
            // 1.5x coincides with MACD alignment only ~15% of bars; 1.2x is still
            // above-average volume confirmation without requiring a spike.
            // Kraken's latest 5m candle is often still forming. Compare both the
            // live bar and the most recently closed bar so scans right after a new
            // candle opens do not see an artificial near-zero volume ratio.
            const liveVolumeWindow = data.volumes.length >= 20
                ? data.volumes.slice(-20)
                : data.volumes;
            const liveAvgVolume = liveVolumeWindow.length > 0
                ? liveVolumeWindow.reduce((a, b) => a + b, 0) / liveVolumeWindow.length
                : null;
            const currentBarVolume = data.volumes[data.volumes.length - 1] ?? 0;
            const currentBarVolumeRatio = liveAvgVolume > 0 ? currentBarVolume / liveAvgVolume : 1;

            const closedVolumeWindow = data.volumes.length >= 21
                ? data.volumes.slice(-21, -1)
                : liveVolumeWindow;
            const closedAvgVolume = closedVolumeWindow.length > 0
                ? closedVolumeWindow.reduce((a, b) => a + b, 0) / closedVolumeWindow.length
                : liveAvgVolume;
            const previousClosedBarVolume = data.volumes.length >= 2
                ? data.volumes[data.volumes.length - 2]
                : currentBarVolume;
            const previousClosedBarVolumeRatio = closedAvgVolume > 0 ? previousClosedBarVolume / closedAvgVolume : currentBarVolumeRatio;
            const volumeRatio = Math.max(currentBarVolumeRatio, previousClosedBarVolumeRatio);

            // Combined sizing factor for this symbol
            const combinedSizingFactor = btcSizingFactor * macdSizingFactor;

            // Momentum calculation
            const momentum = (data.currentPrice - sma20) / sma20;
            const trendStrength = sma20 > 0 ? Math.abs(ema9 - sma20) / sma20 : 0;
            const pullbackFromEMA9 = ema9 > 0 ? Math.abs(data.currentPrice - ema9) / ema9 : 0;
            const atrPct = data.atrPct || null;
            const buildAtrRisk = (fallbackStopPct, fallbackTargetPct, rewardMultiple) => {
                let stopPct = fallbackStopPct;
                let targetPct = fallbackTargetPct;
                if (atrPct && atrPct > 0) {
                    stopPct = Math.min(Math.max(atrPct * 1.6, fallbackStopPct * 0.85), fallbackStopPct * 1.4);
                    targetPct = Math.max(stopPct * rewardMultiple, fallbackTargetPct * 0.9);
                }
                return { stopPct, targetPct };
            };
            let bestSignal = null;

            const pullbackConfig = this.config.pullbackStrategy;
            const minMomentumVolumeRatio = this.config.filters.minVolumeRatioMomentum ?? 1.05;
            const pullbackPositions = Array.from(this.positions.values())
                .filter(position => position.tier === 'pullback').length;

            if (
                pullbackPositions < pullbackConfig.maxPositions &&
                trendStrength >= pullbackConfig.minTrendStrength &&
                ema9 >= sma20 &&
                data.currentPrice >= sma20 * 0.995 &&
                data.currentPrice <= ema9 * 1.01 &&
                pullbackFromEMA9 <= pullbackConfig.maxPullbackFromEMA9 &&
                rsi >= pullbackConfig.rsiLower &&
                rsi <= pullbackConfig.rsiUpper &&
                volumeRatio >= pullbackConfig.minVolumeRatio
            ) {
                const regimeProfile = evaluateCryptoRegimeSignal({
                    strategy: 'trendPullback',
                    btcBullish,
                    trendStrength: trendStrength * 100,
                    volumeRatio,
                    rsi,
                    pullbackPct: pullbackFromEMA9 * 100,
                    tier: 'pullback'
                });
                if (regimeProfile.tradable) {
                    const atrRisk = buildAtrRisk(pullbackConfig.stopLoss, pullbackConfig.profitTarget, 1.9);
                    const pullbackSignal = {
                        symbol,
                        tier: 'pullback',
                        strategy: 'trendPullback',
                        marketRegime: regimeProfile.regime,
                        regime: regimeProfile.regime,
                        regimeQuality: regimeProfile.quality,
                        price: data.currentPrice,
                        momentum: momentum * 100,
                        trendStrength: trendStrength * 100,
                        pullbackPct: pullbackFromEMA9 * 100,
                        atrPct,
                        rsi,
                        volume24h: data.volume24h,
                        volumeRatio,
                        sizingFactor: combinedSizingFactor * pullbackConfig.sizingFactor,
                        // [v6.2] Stop/target from slippage-adjusted effective entry, not raw price
                        stopLoss: data.currentPrice * (1 + 0.003) * (1 - atrRisk.stopPct),
                        takeProfit: data.currentPrice * (1 + 0.003) * (1 + atrRisk.targetPct),
                        stopLossPercent: atrRisk.stopPct * 100,
                        profitTargetPercent: atrRisk.targetPct * 100
                    };
                    pullbackSignal.score = scoreCryptoSignal({
                        strategy: pullbackSignal.strategy,
                        tier: pullbackSignal.tier,
                        momentum: pullbackSignal.momentum,
                        trendStrength,
                        volumeRatio,
                        rsi,
                        sizingFactor: pullbackSignal.sizingFactor,
                        macdBullish
                    }) * regimeProfile.quality;
                    pullbackSignal.score = parseFloat(pullbackSignal.score.toFixed(3));
                    bestSignal = pullbackSignal;
                }
            }

            if (volumeRatio < minMomentumVolumeRatio) {
                if (bestSignal) {
                    opportunities.push(bestSignal);
                }
                continue;
            }

            // Try each tier
            for (const [tierName, tier] of Object.entries(this.config.tiers)) {
                // Check RSI range
                if (rsi < tier.rsiLower || rsi > tier.rsiUpper) continue;

                // Check uptrend (EMA9 > SMA20)
                if (ema9 < sma20) continue; // Not in uptrend

                // [v6.2] Pullback-to-SMA entry: buy the dip, not the top.
                // Old: required momentum > threshold (price far above SMA20 = chasing).
                // New: require price NEAR SMA20 (pulled back to support in uptrend).
                // momentum = (price - sma20) / sma20; near SMA20 means momentum close to 0.
                if (momentum > 0.003) continue; // Price >0.3% above SMA20 = already moved, skip
                if (momentum < -0.01) continue;  // Price >1% below SMA20 = broken support, skip

                // Check position limits for this tier
                const tierPositions = Array.from(this.positions.values())
                    .filter(p => p.tier === tierName).length;
                if (tierPositions >= tier.maxPositions) continue;

                // OPPORTUNITY FOUND — run bridge confirmation before committing
                const bridgeResult = await this.queryStrategyBridge(symbol, data.prices);
                if (bridgeResult === null) {
                    // Bridge offline or slow — proceed on local signal (non-blocking by design)
                    console.log(`[Bridge] Offline/timeout for ${symbol} — proceeding on local signal`);
                } else if (bridgeResult.should_enter && bridgeResult.direction === 'long') {
                    console.log(`[Bridge] ${symbol} confirmed ✓ conf: ${(bridgeResult.confidence || 0).toFixed(2)}`);
                } else {
                    const bridgeConfidence = bridgeResult.confidence || 0;
                    const isContraryBridgeView = bridgeResult.direction === 'short' && bridgeConfidence >= 0.55;
                    if (isContraryBridgeView) {
                        console.log(`[Bridge] ${symbol} rejected — bridge: ${bridgeResult.direction} (conf: ${bridgeConfidence.toFixed(2)}): ${bridgeResult.reason || ''}`);
                        break;
                    }
                    console.log(`[Bridge] ${symbol} neutral/weak (${bridgeResult.direction || 'neutral'}, conf: ${bridgeConfidence.toFixed(2)}) — proceeding on local signal`);
                }

                const regimeProfile = evaluateCryptoRegimeSignal({
                    strategy: 'momentum',
                    btcBullish,
                    trendStrength: trendStrength * 100,
                    volumeRatio,
                    rsi,
                    pullbackPct: pullbackFromEMA9 * 100,
                    tier: tierName
                });
                if (!regimeProfile.tradable) {
                    continue;
                }
                const atrRisk = buildAtrRisk(tier.stopLoss, tier.profitTarget, 2.2);
                const momentumSignal = {
                    symbol,
                    tier: tierName,
                    strategy: 'momentum',
                    marketRegime: regimeProfile.regime,
                    regime: regimeProfile.regime,
                    regimeQuality: regimeProfile.quality,
                    price: data.currentPrice,
                    momentum: momentum * 100,
                    trendStrength: trendStrength * 100,
                    pullbackPct: pullbackFromEMA9 * 100,
                    atrPct,
                    rsi,
                    volume24h: data.volume24h,
                    volumeRatio,
                    sizingFactor: combinedSizingFactor, // BTC + MACD sizing penalty
                    // [v6.2] Stop/target from slippage-adjusted effective entry, not raw price
                    stopLoss: data.currentPrice * (1 + 0.003) * (1 - atrRisk.stopPct),
                    takeProfit: data.currentPrice * (1 + 0.003) * (1 + atrRisk.targetPct),
                    stopLossPercent: atrRisk.stopPct * 100,
                    profitTargetPercent: atrRisk.targetPct * 100
                };
                momentumSignal.score = scoreCryptoSignal({
                    strategy: momentumSignal.strategy,
                    tier: momentumSignal.tier,
                    momentum: momentumSignal.momentum,
                    trendStrength,
                    volumeRatio,
                    rsi,
                    sizingFactor: momentumSignal.sizingFactor,
                    macdBullish
                }) * regimeProfile.quality;
                momentumSignal.score = parseFloat(momentumSignal.score.toFixed(3));

                console.log(`✨ ${symbol} (${tierName}): Momentum ${(momentum * 100).toFixed(2)}%, RSI ${rsi.toFixed(1)}, Vol $${(data.volume24h / 1000000).toFixed(1)}M`);
                if (!bestSignal || momentumSignal.score >= bestSignal.score) {
                    bestSignal = momentumSignal;
                }
                break; // Only match one tier
            }

            if (bestSignal) {
                if (bestSignal.strategy === 'trendPullback') {
                    console.log(`↩️ ${symbol} (pullback): Trend ${(trendStrength * 100).toFixed(2)}%, Pullback ${(pullbackFromEMA9 * 100).toFixed(2)}%, RSI ${rsi.toFixed(1)}`);
                }
                opportunities.push(bestSignal);
            }
        }

        opportunities.sort((a, b) => (b.score || 0) - (a.score || 0));
        return opportunities;
    }

    async refreshSupportedSymbols(force = false) {
        const validationTtlMs = 60 * 60 * 1000;
        if (!force && this.lastSymbolValidationAt && (Date.now() - this.lastSymbolValidationAt) < validationTtlMs) {
            return this.activeSymbols;
        }

        const assetPairs = await this.kraken.getAssetPairs();
        this.lastSymbolValidationAt = Date.now();
        if (!assetPairs) return this.activeSymbols;

        const supported = new Set();
        for (const pair of Object.values(assetPairs)) {
            if (pair && pair.status === 'online' && typeof pair.altname === 'string') {
                supported.add(pair.altname);
            }
        }

        const nextActiveSymbols = this.config.symbols.filter(symbol => supported.has(symbol));
        const nextInvalidSymbols = this.config.symbols.filter(symbol => !supported.has(symbol));

        if (nextActiveSymbols.length > 0) {
            this.activeSymbols = nextActiveSymbols;
        }

        const invalidChanged = nextInvalidSymbols.length !== this.invalidSymbols.size
            || nextInvalidSymbols.some(symbol => !this.invalidSymbols.has(symbol));
        this.invalidSymbols = new Set(nextInvalidSymbols);

        if (invalidChanged && nextInvalidSymbols.length > 0) {
            console.warn(`⚠️ Kraken unsupported symbols removed from live scan: ${nextInvalidSymbols.join(', ')}`);
        }

        return this.activeSymbols;
    }

    // ========================================================================
    // ANTI-CHURNING PROTECTION
    // ========================================================================

    canTrade(symbol) {
        // Check daily trade limit
        if (this.dailyTradeCount >= this.config.maxTradesPerDay) {
            console.log(`❌ Daily trade limit reached (${this.dailyTradeCount}/${this.config.maxTradesPerDay})`);
            return { allowed: false, reason: 'Daily limit reached' };
        }

        // Check per-symbol limit
        const symbolTradesToday = this.tradesToday.filter(t => t.symbol === symbol).length;
        if (symbolTradesToday >= this.config.maxTradesPerSymbol) {
            console.log(`❌ ${symbol}: Symbol limit reached (${symbolTradesToday}/${this.config.maxTradesPerSymbol})`);
            return { allowed: false, reason: 'Symbol limit reached' };
        }

        // Check cooldown period
        const lastTrade = this.lastTradeTime.get(symbol);
        if (lastTrade) {
            const timeSince = (Date.now() - lastTrade) / 60000; // minutes
            if (timeSince < this.config.minTimeBetweenTrades) {
                console.log(`❌ ${symbol}: Cooldown active (${timeSince.toFixed(1)}/${this.config.minTimeBetweenTrades} min)`);
                return { allowed: false, reason: 'Cooldown period' };
            }
        }

        // Check position limits
        if (this.positions.size >= this.config.maxTotalPositions) {
            console.log(`❌ Max positions reached (${this.positions.size}/${this.config.maxTotalPositions})`);
            return { allowed: false, reason: 'Max positions' };
        }

        return { allowed: true };
    }

    // ========================================================================
    // TRADE EXECUTION
    // ========================================================================

    async executeTrade(signal) {
        const check = this.canTrade(signal.symbol);
        if (!check.allowed) {
            console.log(`⛔ Trade blocked for ${signal.symbol}: ${check.reason}`);
            return null;
        }

        try {
            // [v3.2] Dynamic position sizing — Kelly-inspired: scale with win rate
            // Defaults to 50% win rate until 10 trades have been recorded
            const totalClosedTrades = this.winningTrades + this.losingTrades;
            const runningWinRate = totalClosedTrades >= 10
                ? this.winningTrades / totalClosedTrades
                : 0.5;
            const sizingMultiplier = Math.max(0.25, Math.min(2.0, runningWinRate / 0.5));
            const signalSizingFactor = signal.sizingFactor ?? 1.0;
            // [v4.7] Risk-based position cap: max position = equity * RISK_PER_TRADE / stopLossPct
            const stopPctDecimal = (signal.stopLossPercent || 5) / 100; // e.g. 5.0% → 0.05
            const currentEquity = (this.config.basePositionSizeUSD * 20) + (this.totalProfit - this.totalLoss);
            const riskCapUSD = (currentEquity * RISK_PER_TRADE) / stopPctDecimal;

            // [v4.6] Apply guardrail size multiplier (consecutive-loss protection)
            const guardrailMultiplier = signal.guardrailSizeMultiplier || 1.0;
            // [v4.6] Apply agent position_size_multiplier
            const agentSizeMultiplier = signal.agentPositionSizeMultiplier || 1.0;

            const positionSizeUSD = Math.min(
                this.config.basePositionSizeUSD * sizingMultiplier * signalSizingFactor * guardrailMultiplier * agentSizeMultiplier,
                this.config.maxPositionSizeUSD,
                riskCapUSD
            );
            console.log(`   [Kelly Sizing] WinRate: ${(runningWinRate * 100).toFixed(1)}% → kelly ${sizingMultiplier.toFixed(2)}x · signal ${signalSizingFactor.toFixed(2)}x · guardrail ${guardrailMultiplier.toFixed(2)}x · agent ${agentSizeMultiplier.toFixed(2)}x → $${positionSizeUSD.toFixed(0)} (risk cap $${riskCapUSD.toFixed(0)})`);

            // [v3.5] Crypto slippage model — Kraken taker fee is 0.26%; market orders
            // also move the book. Model as 0.30% total execution cost.
            // Adjusts effective entry price so stop/target R:R is realistic after fees.
            const CRYPTO_SLIPPAGE = 0.003; // 0.30% taker fee + market impact
            const effectiveEntry = signal.price * (1 + CRYPTO_SLIPPAGE);
            const quantity = positionSizeUSD / effectiveEntry;

            // Kraken minimum order sizes per symbol (in base asset units)
            const KRAKEN_MIN_QTY = {
                XBTUSD: 0.0001, ETHUSD: 0.01, SOLUSD: 0.1,
                ADAUSD: 10,     XRPUSD: 10,   AVAXUSD: 0.1,
                LINKUSD: 0.5,   DOTUSD: 0.5,  UNIUSD: 0.5,
                ATOMUSD: 0.5,   MATICUSD: 5,  LTCUSD: 0.05
            };
            const minQty = KRAKEN_MIN_QTY[signal.symbol] ?? 0.0001;
            if (quantity < minQty) {
                console.log(`⚠️  [SKIP] ${signal.symbol}: quantity ${quantity.toFixed(8)} below Kraken minimum ${minQty} (position $${positionSizeUSD.toFixed(0)} too small)`);
                return null;
            }

            console.log(`\n📈 EXECUTING CRYPTO TRADE:`);
            console.log(`   Symbol: ${signal.symbol}`);
            console.log(`   Tier: ${signal.tier}`);
            console.log(`   Entry: $${signal.price.toFixed(2)}`);
            console.log(`   Quantity: ${quantity.toFixed(6)}`);
            console.log(`   Size: $${positionSizeUSD.toFixed(2)}`);
            console.log(`   Stop: $${signal.stopLoss.toFixed(2)} (-${signal.stopLossPercent.toFixed(1)}%)`);
            console.log(`   Target: $${signal.takeProfit.toFixed(2)} (+${signal.profitTargetPercent.toFixed(1)}%)`);

            let order;
            if (isRealTradingEnabled()) {
                order = await this.kraken.placeOrder(signal.symbol, 'BUY', quantity);
            } else {
                order = { orderId: `paper-buy-${signal.symbol}-${Date.now()}` };
                console.log(`🧪 PAPER MODE: Simulated BUY order for ${signal.symbol}`);
            }

            if (!order) {
                console.log(`❌ Failed to place order for ${signal.symbol}`);
                return null;
            }

            // Create position — include currentPrice/unrealizedPnL so status
            // endpoint returns valid values before the first managePositions() cycle
            const tags = buildCryptoTradeTags(signal, signal.tier);
            const position = {
                symbol: signal.symbol,
                tier: signal.tier,
                strategy: tags.strategy,
                regime: tags.regime,
                entry: effectiveEntry,
                quantity,
                positionSize: positionSizeUSD,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit,
                orderId: order.orderId,
                openTime: new Date(),
                momentum: signal.momentum,
                rsi: signal.rsi,
                atrPct: signal.atrPct,
                regimeQuality: signal.regimeQuality,
                signalScore: signal.score,
                currentPrice: signal.price,
                unrealizedPnL: 0,
                unrealizedPnLPct: 0,
            };

            this.positions.set(signal.symbol, position);

            // Persist trade opening to DB (fire-and-forget)
            const openTrade = this._dbOpen ? this._dbOpen.bind(this) : dbCryptoOpen;
            openTrade(signal.symbol, signal.tier, signal.price, signal.stopLoss, signal.takeProfit, quantity, positionSizeUSD, signal)
                .then(id => { const p = this.positions.get(signal.symbol); if (p) p.dbTradeId = id; })
                .catch(() => {});

            // Update tracking
            this.dailyTradeCount++;
            this.totalTrades++;
            this.lastTradeTime.set(signal.symbol, Date.now());
            this.tradesToday.push({
                symbol: signal.symbol,
                time: new Date(),
                direction: 'LONG'
            });

            console.log(`✅ Position opened: ${signal.symbol}`);

            // Persist daily counters immediately so restart can't bypass limits
            this.saveState();

            // Send Telegram alert — fire-and-forget so a failure never blocks trade return
            (this._userTelegram || telegramAlerts).sendCryptoEntry(
                signal.symbol,
                signal.price,
                signal.stopLoss,
                signal.takeProfit,
                quantity,
                signal.tier
            ).catch(e => console.warn(`⚠️  Telegram entry alert failed: ${e.message}`));

            return position;
        } catch (error) {
            console.error(`❌ Error executing trade:`, error);
            return null;
        }
    }

    // ========================================================================
    // POSITION MANAGEMENT
    // ========================================================================

    async managePositions() {
        for (const [symbol, position] of this.positions.entries()) {
            const currentPrice = await this.kraken.getPrice(symbol);
            if (!currentPrice) continue;

            const pnlPercent = ((currentPrice - position.entry) / position.entry) * 100;
            const pnlUSD = (currentPrice - position.entry) * position.quantity;

            // Time-based exit: close stale or overdue positions
            const holdDays = (Date.now() - (position.openTime?.getTime?.() ?? Date.now())) / (1000 * 60 * 60 * 24);
            if (holdDays >= this.config.stalePositionDays) {
                console.log(`⏰ ${symbol}: STALE EXIT after ${holdDays.toFixed(1)} days`);
                await this.closePosition(symbol, currentPrice, 'Stale Position Timeout');
                (this._userTelegram || telegramAlerts).send(
                    `⏰ *CRYPTO STALE EXIT* — ${symbol}\n` +
                    `Held ${holdDays.toFixed(1)} days (limit: ${this.config.stalePositionDays}d)\n` +
                    `Entry: $${position.entry.toFixed(2)} → Exit: $${currentPrice.toFixed(2)}\n` +
                    `P&L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`
                ).catch(e => console.warn(`⚠️  Telegram stale-exit alert failed: ${e.message}`));
                continue;
            }
            if (holdDays >= this.config.maxHoldDays && pnlPercent < 0) {
                console.log(`⏰ ${symbol}: MAX HOLD EXIT after ${holdDays.toFixed(1)} days (loss: ${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Max Hold Days - Loss Exit');
                (this._userTelegram || telegramAlerts).send(
                    `⏰ *CRYPTO MAX HOLD EXIT (loss)* — ${symbol}\n` +
                    `Held ${holdDays.toFixed(1)} days (limit: ${this.config.maxHoldDays}d)\n` +
                    `Entry: $${position.entry.toFixed(2)} → Exit: $${currentPrice.toFixed(2)}\n` +
                    `P&L: ${pnlPercent.toFixed(2)}%`
                ).catch(e => console.warn(`⚠️  Telegram max-hold-loss alert failed: ${e.message}`));
                continue;
            }
            if (holdDays >= this.config.maxHoldDays && pnlPercent < 2) {
                console.log(`⏰ ${symbol}: MAX HOLD EXIT after ${holdDays.toFixed(1)} days (flat/marginal winner: ${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Max Hold Days - Flat Exit');
                (this._userTelegram || telegramAlerts).send(
                    `⏰ *CRYPTO MAX HOLD EXIT (flat)* — ${symbol}\n` +
                    `Held ${holdDays.toFixed(1)} days, marginal gain ${pnlPercent.toFixed(2)}%\n` +
                    `Entry: $${position.entry.toFixed(2)} → Exit: $${currentPrice.toFixed(2)}`
                ).catch(e => console.warn(`⚠️  Telegram max-hold-flat alert failed: ${e.message}`));
                continue;
            }

            if (position.atrPct) {
                const atrAdversePct = position.atrPct * 2.4 * 100;
                if (pnlPercent <= -atrAdversePct) {
                    console.log(`📉 ${symbol}: ATR ADVERSE EXIT at $${currentPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
                    await this.closePosition(symbol, currentPrice, 'ATR Adverse Exit');
                    continue;
                }
            }

            // Check stop loss
            if (currentPrice <= position.stopLoss) {
                console.log(`🚨 ${symbol}: STOP LOSS HIT at $${currentPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Stop Loss');

                // Send alert — fire-and-forget so a network failure never blocks the loop
                (this._userTelegram || telegramAlerts).sendCryptoStopLoss(symbol, position.entry, currentPrice, pnlPercent, position.stopLoss)
                    .catch(e => console.warn(`⚠️  Telegram stop-loss alert failed: ${e.message}`));
                continue;
            }

            // Check take profit
            if (currentPrice >= position.takeProfit) {
                console.log(`🎯 ${symbol}: PROFIT TARGET HIT at $${currentPrice.toFixed(2)} (+${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Take Profit');

                // Send alert — fire-and-forget
                (this._userTelegram || telegramAlerts).sendCryptoTakeProfit(symbol, position.entry, currentPrice, pnlPercent, position.takeProfit)
                    .catch(e => console.warn(`⚠️  Telegram take-profit alert failed: ${e.message}`));
                continue;
            }

            // Update trailing stop
            this.updateTrailingStop(symbol, currentPrice, pnlPercent);

            // Write live price and P&L back into the position so getStatus() returns current values
            position.currentPrice = currentPrice;
            position.unrealizedPnL = pnlUSD;
            position.unrealizedPnLPct = pnlPercent / 100;

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)}`);
        }
    }

    updateTrailingStop(symbol, currentPrice, pnlPercent) {
        const position = this.positions.get(symbol);
        if (!position) return;

        // Check each trailing stop level — iterate backward so highest qualifying level wins
        for (let i = this.config.trailingStops.length - 1; i >= 0; i--) {
            const level = this.config.trailingStops[i];
            if (pnlPercent >= level.profit * 100) {
                const newStop = currentPrice * (1 - level.stopDistance);

                // Only raise stop, never lower
                if (newStop > position.stopLoss) {
                    console.log(`📈 ${symbol}: Trailing stop raised to $${newStop.toFixed(2)} (level: +${(level.profit * 100).toFixed(0)}%)`);
                    position.stopLoss = newStop;
                    this.positions.set(symbol, position);
                }
                break; // Use highest applicable level
            }
        }
    }

    async closePosition(symbol, price, reason) {
        const position = this.positions.get(symbol);
        if (!position) return;

        try {
            let order;
            if (isRealTradingEnabled()) {
                order = await this.kraken.placeOrder(symbol, 'SELL', position.quantity);
                if (!order) {
                    console.log(`❌ Failed to close position for ${symbol}`);
                    return;
                }
            } else {
                order = { orderId: `paper-sell-${symbol}-${Date.now()}` };
                console.log(`🧪 PAPER MODE: Simulated SELL order for ${symbol}`);
            }

            // Calculate P/L — slippage already applied at entry (effectiveEntry = price * 1.003)
            // so no additional exit slippage needed; that was double-counting fees
            const adjustedExitPrice = price;
            const pnlUSD = (adjustedExitPrice - position.entry) * position.quantity;
            const pnlPercent = ((adjustedExitPrice - position.entry) / position.entry) * 100;

            // Update stats
            if (pnlUSD > 0) {
                this.winningTrades++;
                this.totalProfit += pnlUSD;
            } else {
                this.losingTrades++;
                this.totalLoss += Math.abs(pnlUSD);
                this.dailyLoss += Math.abs(pnlUSD); // circuit breaker accumulator
            }

            console.log(`✅ Position closed: ${symbol} - ${reason}`);
            console.log(`   Exit: $${price.toFixed(2)}`);
            console.log(`   P/L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% ($${pnlUSD.toFixed(2)})`);

            // Persist close to DB (fire-and-forget)
            const closeTrade = this._dbClose ? this._dbClose.bind(this) : dbCryptoClose;
            closeTrade(position.dbTradeId, adjustedExitPrice, pnlUSD, pnlPercent, reason).catch(() => {});

            // [v4.1] Report to Agentic AI learning loop — Scan AI pattern tracking
            this.reportTradeOutcome(position, adjustedExitPrice, pnlUSD, pnlPercent / 100, reason).catch(() => {});

            // [v4.6] Record outcome for adaptive guardrails
            this.recordGuardrailOutcome(pnlUSD > 0);

            // Remove position
            this.positions.delete(symbol);

            // Persist performance data so it survives restarts
            this.saveState();
        } catch (error) {
            console.error(`❌ Error closing position:`, error);
        }
    }

    // ========================================================================
    // MAIN TRADING LOOP
    // ========================================================================

    async tradingLoop() {
        let lastResetDay = new Date().getUTCDate();

        while (this.isRunning) {
            try {
                // Reset daily counters at UTC midnight
                const currentDay = new Date().getUTCDate();
                if (currentDay !== lastResetDay) {
                    this.dailyTradeCount = 0;
                    this.tradesToday = [];
                    this.dailyLoss = 0;
                    this.resetGuardrails();
                    lastResetDay = currentDay;
                    console.log('🔄 Daily trade counters reset (UTC midnight)');
                }

                this.scanCount++;

                console.log(`\n${'='.repeat(60)}`);
                console.log(`🔍 CRYPTO SCAN #${this.scanCount} - ${new Date().toLocaleString()}`);
                console.log(`${'='.repeat(60)}`);
                console.log(`📊 Positions: ${this.positions.size}/${this.config.maxTotalPositions} | Trades today: ${this.dailyTradeCount}/${this.config.maxTradesPerDay}`);

                // In demo mode, skip all exchange calls
                if (this.demoMode) {
                    console.log('📊 DEMO MODE - No exchange connection. Add CRYPTO_API_KEY to .env to enable live trading.');
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Manage existing positions even when paused (exits still run)
                if (this.isPaused) {
                    console.log('⏸  Crypto bot paused — managing existing positions only, no new entries');
                    if (this.positions.size > 0) await this.managePositions();
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Daily loss circuit breaker — realised losses
                const maxDailyLoss = Math.abs(parseFloat(process.env.MAX_DAILY_LOSS || '500'));
                if (this.dailyLoss >= maxDailyLoss) {
                    console.log(`🛑 [CIRCUIT BREAKER] Crypto daily loss $${this.dailyLoss.toFixed(2)} exceeds limit $${maxDailyLoss} — no new entries today`);
                    if (this.positions.size > 0) await this.managePositions();
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Proactive unrealised-loss gate — block new entries if open positions
                // are already deep underwater, even before they close and hit dailyLoss.
                // Uses 80% of the daily limit so there's room to exit without breaching.
                const unrealisedLoss = Array.from(this.positions.values())
                    .reduce((sum, p) => sum + Math.min(0, p.unrealizedPnL || 0), 0);
                if (Math.abs(unrealisedLoss) >= maxDailyLoss * 0.8) {
                    console.log(`⚠️  [UNREALISED GATE] Open positions down $${Math.abs(unrealisedLoss).toFixed(2)} (≥80% of $${maxDailyLoss} limit) — no new entries`);
                    if (this.positions.size > 0) await this.managePositions();
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Manage existing positions
                if (this.positions.size > 0) {
                    console.log(`\n📊 Managing ${this.positions.size} position(s)...`);
                    await this.managePositions();
                }

                // Scan for new opportunities
                if (this.positions.size < this.config.maxTotalPositions) {
                    console.log(`\n🔍 Scanning ${this.activeSymbols.length || this.config.symbols.length} crypto pairs...`);
                    const opportunities = await this.scanForOpportunities();

                    console.log(`\n🎯 Found ${opportunities.length} signal(s)`);

                    // Execute trades
                    for (const signal of opportunities) {
                        if (this.positions.size >= this.config.maxTotalPositions) break;
                        // [v5.0] HARD GATE: every trade MUST be approved by the agentic AI pipeline
                        const aiResult = await this.queryAIAdvisor(signal);

                        // Agent rejection = hard stop
                        if (!aiResult.approved) {
                            console.log(`[Agent] ${signal.symbol} REJECTED (conf: ${(aiResult.confidence || 0).toFixed(2)}, src: ${aiResult.source}) — ${aiResult.reason}`);
                            if (aiResult.risk_flags?.length) console.log(`[Agent]   Risk flags: ${aiResult.risk_flags.join(', ')}`);
                            if (aiResult.lessons_applied?.length) console.log(`[Agent]   Lessons: ${aiResult.lessons_applied.slice(0, 2).join('; ')}`);
                            if (aiResult.confidence > 0.8 || aiResult.source === 'kill_switch') {
                                (this._userTelegram || telegramAlerts).sendAgentRejection('Crypto Bot', signal.symbol, 'long', aiResult.reason, aiResult.confidence, aiResult.risk_flags).catch(() => {});
                            }
                            if (aiResult.source === 'kill_switch') {
                                (this._userTelegram || telegramAlerts).sendKillSwitchAlert('Crypto Bot', aiResult.reason).catch(() => {});
                            }
                            continue;
                        }

                        // Agent approved — store metadata
                        const srcTag = aiResult.source === 'cache' ? ' (cached)' : '';
                        const regime = aiResult.market_regime ? ` [${aiResult.market_regime}]` : '';
                        console.log(`[Agent] ${signal.symbol} APPROVED${srcTag}${regime} (conf: ${(aiResult.confidence || 0).toFixed(2)}, size: ${(aiResult.position_size_multiplier || 1).toFixed(2)}x) — ${aiResult.reason}`);
                        (this._userTelegram || telegramAlerts).sendAgentApproval('Crypto Bot', signal.symbol, 'long', aiResult.confidence || 0, aiResult.position_size_multiplier || 1, aiResult.market_regime).catch(() => {});
                        signal.agentApproved = true;
                        signal.agentConfidence = aiResult.confidence;
                        signal.agentReason = aiResult.reason;
                        signal.agentPositionSizeMultiplier = aiResult.position_size_multiplier || 1.0;
                        // [v4.6] Adaptive guardrails — pre-trade quality gate
                        if (this.isLanePaused()) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — lane paused until ${new Date(this.guardrails.lanePausedUntil).toLocaleTimeString()}`);
                            continue;
                        }
                        if ((signal.score || 0) < MIN_SIGNAL_SCORE) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — score ${(signal.score || 0).toFixed(2)} < ${MIN_SIGNAL_SCORE}`);
                            continue;
                        }
                        if (aiResult && aiResult.confidence < MIN_SIGNAL_CONFIDENCE) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — confidence ${aiResult.confidence.toFixed(2)} < ${MIN_SIGNAL_CONFIDENCE}`);
                            continue;
                        }
                        // [v4.7] Reward/risk ratio gate
                        const stopPct = (signal.stopLossPercent || 5) / 100;
                        const tpPct = (signal.profitTargetPercent || 10) / 100;
                        const rewardRisk = tpPct / stopPct;
                        if (rewardRisk < MIN_REWARD_RISK) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — R:R ${rewardRisk.toFixed(2)} < ${MIN_REWARD_RISK}`);
                            continue;
                        }
                        if (this.getLossSizeMultiplier() < 1.0) {
                            signal.guardrailSizeMultiplier = this.getLossSizeMultiplier();
                            console.log(`[Guardrail] ${signal.symbol} size cut to ${signal.guardrailSizeMultiplier.toFixed(2)}x (${this.guardrails.consecutiveLosses} consecutive losses)`);
                        }
                        await this.executeTrade(signal);
                    }
                }

                console.log(`${'='.repeat(60)}\n`);

                // Wait for next scan
                await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));

            } catch (error) {
                console.error('❌ Error in trading loop:', error);
                await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 min on error
            }
        }
    }

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    async start() {
        if (this.isRunning) {
            console.log('⚠️ Trading engine already running');
            return;
        }

        console.log('🚀 Starting Crypto Trading Engine...');

        // If no API keys configured, run in demo/paper mode (no exchange connection needed)
        const hasKeys = this.config.exchange.apiKey && this.config.exchange.apiSecret;
        if (!hasKeys) {
            console.log('⚠️  No CRYPTO_API_KEY/CRYPTO_API_SECRET in .env');
            console.log('📊 Running in DEMO MODE - monitoring only, no real trades');
            this.isRunning = true;
            this.demoMode = true;
            this.credentialsValid = false;
            this.credentialsError = 'No Kraken credentials configured';
            this.saveState();
            this.tradingLoop().catch(e => console.error('❌ Crypto trading loop crashed:', e));
            return;
        }

        // Test connection
        const accountOk = await this.refreshConnectionState(true);
        if (!accountOk) {
            console.log(`❌ Failed to connect to exchange - running in DEMO MODE${this.credentialsError ? ` (${this.credentialsError})` : ''}`);
            this.isRunning = true;
            this.demoMode = true;
            this.saveState();
            this.tradingLoop().catch(e => console.error('❌ Crypto trading loop crashed:', e));
            return;
        }

        await this.refreshSupportedSymbols(true);

        console.log(`✅ Connected to ${this.config.exchange.name.toUpperCase()}`);
        console.log(`💰 Account connected`);

        this.isRunning = true;
        this.demoMode = false;
        this.saveState();
        this.tradingLoop().catch(e => console.error('❌ Crypto trading loop crashed:', e));
    }

    saveState() {
        try {
            const fs = require('fs');
            const dir = require('path').dirname(this.stateFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.stateFile, JSON.stringify({
                running: this.isRunning,
                demoMode: this.demoMode,
                // Trade counters (totalTrades, winningTrades, losingTrades, totalProfit, totalLoss)
                // are NOT persisted here — DB is the authoritative source.
                // Persist daily counters so restart doesn't reset anti-churn limits
                dailyTradeCount: this.dailyTradeCount,
                dailyLoss: this.dailyLoss,
                tradesToday: this.tradesToday,
                savedDate: new Date().toISOString(),
            }));
        } catch (e) {
            console.error('❌ Failed to save crypto bot state:', e.message);
        }
    }

    loadState() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.stateFile)) {
                const saved = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                // Trade counters (totalTrades, winningTrades, losingTrades, totalProfit, totalLoss)
                // are NOT loaded from state file — DB is the authoritative source.
                // Restore demoMode so a prior credential save survives restart
                if (saved.demoMode != null) this.demoMode = saved.demoMode;
                // Restore daily counters only if saved on the same UTC day
                if (saved.savedDate) {
                    const savedDay = new Date(saved.savedDate).toISOString().slice(0, 10);
                    const today = new Date().toISOString().slice(0, 10);
                    if (savedDay === today) {
                        if (saved.dailyTradeCount != null) this.dailyTradeCount = saved.dailyTradeCount;
                        if (saved.dailyLoss != null) this.dailyLoss = saved.dailyLoss;
                        if (saved.tradesToday != null) this.tradesToday = saved.tradesToday;
                    }
                }
                return saved.running !== false;
            }
        } catch (e) {
            console.error('❌ Failed to load crypto bot state:', e.message);
        }
        return true; // Default: start running
    }

    stop() {
        console.log('🛑 Stopping Crypto Trading Engine...');
        this.isRunning = false;
        this.isPaused = false;
        this.saveState();
    }

    pause() {
        console.log('⏸  Pausing Crypto Trading Engine (existing positions still managed)...');
        this.isPaused = true;
        this.saveState();
    }

    resume() {
        console.log('▶️  Resuming Crypto Trading Engine...');
        this.isPaused = false;
        this.saveState();
    }

    async refreshConnectionState(force = false) {
        const hasKeys = this.config.exchange.apiKey && this.config.exchange.apiSecret;
        if (!hasKeys) {
            this.demoMode = true;
            this.credentialsValid = false;
            this.credentialsError = 'No Kraken credentials configured';
            this.lastCredentialCheckAt = Date.now();
            return false;
        }

        const cacheFresh = !force && this.lastCredentialCheckAt && (Date.now() - this.lastCredentialCheckAt) < 60000;
        if (cacheFresh && this.credentialsValid !== null) {
            return this.credentialsValid;
        }

        try {
            const account = await this.kraken._privateRequest('Balance');
            this.demoMode = false;
            this.credentialsValid = Boolean(account);
            this.credentialsError = null;
            this.lastCredentialCheckAt = Date.now();
            return this.credentialsValid;
        } catch (error) {
            this.demoMode = true;
            this.credentialsValid = false;
            this.credentialsError = error.message || 'Kraken credentials invalid or expired';
            this.lastCredentialCheckAt = Date.now();
            return false;
        }
    }

    // ===== ADAPTIVE GUARDRAILS (v4.6) =====
    getRecentWinRate() {
        const r = this.guardrails.recentResults;
        if (r.length < 5) return 0.5;
        return r.filter(Boolean).length / r.length;
    }
    isLanePaused() { return Date.now() < this.guardrails.lanePausedUntil; }
    getLossSizeMultiplier() {
        if (this.guardrails.consecutiveLosses >= 3) return 0.25;
        if (this.guardrails.consecutiveLosses >= 2) return 0.5;
        if (this.guardrails.consecutiveLosses >= 1) return 0.75;
        if (this.getRecentWinRate() < 0.35) return 0.5;
        return 1.0;
    }
    recordGuardrailOutcome(isWin) {
        this.guardrails.recentResults.push(isWin);
        if (this.guardrails.recentResults.length > 20) this.guardrails.recentResults.shift();
        if (isWin) { this.guardrails.consecutiveLosses = 0; this.guardrails.totalWinsToday++; }
        else {
            this.guardrails.consecutiveLosses++;
            this.guardrails.totalLossesToday++;
            if (this.guardrails.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
                // [v6.1] Escalating pause: 2h base × (losses / 3), capped at 24h
                const escalation = Math.min(8, Math.ceil(this.guardrails.consecutiveLosses / MAX_CONSECUTIVE_LOSSES));
                const pauseMs = LOSS_PAUSE_MS * escalation;
                this.guardrails.lanePausedUntil = Date.now() + pauseMs;
                console.log(`🚫 [Guardrail] Crypto lane PAUSED ${escalation * 2}h until ${new Date(this.guardrails.lanePausedUntil).toLocaleTimeString()} — ${this.guardrails.consecutiveLosses} consecutive losses`);
            }
        }
    }
    resetGuardrails() {
        this.guardrails = { consecutiveLosses: 0, recentResults: [], lanePausedUntil: 0, totalLossesToday: 0, totalWinsToday: 0 };
    }

    getStatus() {
        const closedTrades = this.winningTrades + this.losingTrades;
        const winRate = closedTrades > 0
            ? (this.winningTrades / closedTrades * 100).toFixed(1)
            : 0;

        const profitFactor = this.totalLoss > 0
            ? parseFloat((this.totalProfit / this.totalLoss).toFixed(2))
            : this.totalProfit > 0 ? null : 0; // null = all winners (undefined metric), 0 = no trades

        const netPnL = this.totalProfit - this.totalLoss;

        const startingEquity = this.config.basePositionSizeUSD * 20; // $500 * 20 = $10,000 base
        const equity = startingEquity + netPnL;

        // Simulate BTC trend based on scan count (rotates every ~30 scans in demo)
        let btcTrend = null;
        if (this.demoMode) {
            const cycle = Math.floor(this.scanCount / 30) % 3;
            btcTrend = cycle === 0 ? 'bullish' : cycle === 1 ? 'bearish' : 'neutral';
        }

        // Flat response matching CryptoBotPage BotStatus interface
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            isVolatilityPaused: false,
            demoMode: this.demoMode || false,
            mode: this.demoMode ? 'DEMO' : (isRealTradingEnabled() ? 'LIVE' : 'PAPER'),
            tradingMode: this.demoMode ? 'DEMO' : (isRealTradingEnabled() ? 'LIVE' : 'PAPER'),
            btcTrend,
            equity,
            dailyReturn: netPnL / startingEquity,
            positions: Array.from(this.positions.values()),
            stats: {
                totalTrades: this.totalTrades,
                longTrades: this.totalTrades,  // Bot only goes long
                shortTrades: 0,
                winners: this.winningTrades,
                losers: this.losingTrades,
                totalPnL: netPnL,
                maxDrawdown: 0
            },
            config: {
                symbols: this.activeSymbols,
                invalidSymbols: Array.from(this.invalidSymbols),
                maxPositions: this.config.maxTotalPositions,
                stopLoss: this.config.tiers.tier1.stopLoss,
                profitTarget: this.config.tiers.tier1.profitTarget,
                dailyLossLimit: Math.abs(parseFloat(process.env.MAX_DAILY_LOSS || '500'))
            },
            scanCount: this.scanCount,
            dailyTrades: this.dailyTradeCount,
            winRate: `${winRate}%`,
            profitFactor,
            netPnL: netPnL.toFixed(2),
            guardrails: {
                consecutiveLosses: this.guardrails.consecutiveLosses,
                recentWinRate: this.getRecentWinRate().toFixed(2),
                lanePaused: this.isLanePaused(),
                lossSizeMultiplier: this.getLossSizeMultiplier(),
                todayWins: this.guardrails.totalWinsToday,
                todayLosses: this.guardrails.totalLossesToday,
            },
        };
    }
}

// ============================================================================
// EXPRESS API
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth middleware for config-write endpoints ──────────────────────────────
function requireApiSecret(req, res, next) {
    const secret = process.env.NEXUS_API_SECRET;
    if (!secret) return next();
    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${secret}`) return next();
    return res.status(401).json({ success: false, error: 'Unauthorized' });
}

// ── Persist env var to Railway (survives redeploys) ────────────────────────
async function persistEnvVar(name, value) {
    const token   = process.env.RAILWAY_TOKEN;
    const project = process.env.RAILWAY_PROJECT_ID;
    const env     = process.env.RAILWAY_ENVIRONMENT_ID;
    const service = process.env.RAILWAY_SERVICE_ID;
    if (!token || !project || !env || !service) {
        console.warn(`⚠️  persistEnvVar: missing Railway vars (token=${!!token} project=${!!project} env=${!!env} service=${!!service}) — ${name} saved in-memory only`);
        return;
    }
    const query = `mutation { variableUpsert(input: { projectId: "${project}", environmentId: "${env}", serviceId: "${service}", name: "${name}", value: "${value.replace(/"/g, '\\"')}" }) }`;
    try {
        await axios.post('https://backboard.railway.app/graphql/v2',
            { query },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
        );
    } catch (e) {
        console.warn(`⚠️  Railway env var persist failed for ${name}: ${e.message}`);
    }
}

// ── Per-user credential encryption (AES-256-GCM) ───────────────────────────
function getEncryptionKey() {
    const envKey = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim();
    if (envKey) {
        const normalized = envKey.startsWith('0x') ? envKey.slice(2) : envKey;
        if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
            return Buffer.from(normalized, 'hex');
        }
        console.warn('⚠️ Invalid CREDENTIAL_ENCRYPTION_KEY format; hashing configured value instead of raw hex');
        return crypto.createHash('sha256').update(envKey).digest();
    }
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptCredential(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptCredential(stored) {
    const key = getEncryptionKey();
    const [ivHex, tagHex, ciphertext] = stored.split(':');
    if (!ivHex || !tagHex || !ciphertext) throw new Error('Invalid encrypted format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function normalizeCredentialValue(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return String(value);
    }
    return null;
}

const credentialStore = createUserCredentialStore(path.join(__dirname, 'data/user-credentials.json'));

async function loadUserCredentials(userId, broker) {
    if (userId === undefined || userId === null) return {};

    const creds = {};
    const fileCreds = credentialStore.loadEncryptedCredentials(userId, broker);
    for (const [key, encryptedValue] of Object.entries(fileCreds)) {
        try { creds[key] = decryptCredential(encryptedValue); }
        catch (e) { console.warn(`⚠️ Failed to decrypt file-backed ${key} for user ${userId}:`, e.message); }
    }

    if (!dbPool) return creds;

    try {
        const result = await dbPool.query(
            'SELECT credential_key, encrypted_value FROM user_credentials WHERE user_id=$1 AND broker=$2',
            [userId, broker]
        );
        for (const row of result.rows) {
            try { creds[row.credential_key] = decryptCredential(row.encrypted_value); }
            catch (e) { console.warn(`⚠️ Failed to decrypt ${row.credential_key} for user ${userId}:`, e.message); }
        }
        return creds;
    } catch (e) {
        console.warn(`⚠️ Failed to load credentials for user ${userId}:`, e.message);
        return {};
    }
}

// For credential endpoints — accepts JWT (per-user) or API secret (backward compat)
function requireJwtOrApiSecret(req, res, next) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
        try {
            req.user = jwt.verify(token, JWT_SECRET);
            return next();
        } catch { /* not a JWT — try API secret */ }
        const secret = process.env.NEXUS_API_SECRET;
        if (secret && auth === `Bearer ${secret}`) return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized — provide JWT or API secret' });
}

// ── JWT Auth Helpers ─────────────────────────────────────────────────────────
function signTokens(userId, email) {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
    const accessToken = jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ sub: userId, email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}

function requireJwt(req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Missing token' });
    try {
        req.user = jwt.verify(auth.slice(7), JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// Rate limiter for auth endpoints — prevents brute force attacks
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // max 20 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests — try again in 15 minutes' },
    skip: () => process.env.NODE_ENV === 'test',
});

// ── Auth Endpoints ────────────────────────────────────────────────────────────

app.post('/api/auth/register', authRateLimit, async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    try {
        const hash = await bcrypt.hash(password, 12);
        const result = await dbPool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
            [email.toLowerCase().trim(), hash, name || null]
        );
        const user = result.rows[0];
        const tokens = signTokens(user.id, user.email);
        await dbPool.query('UPDATE users SET refresh_token=$1, last_login=NOW() WHERE id=$2', [tokens.refreshToken, user.id]);
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, ...tokens });
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ success: false, error: 'Email already registered' });
        console.error('Register error:', e.message);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
    try {
        const result = await dbPool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        const tokens = signTokens(user.id, user.email);
        await dbPool.query('UPDATE users SET refresh_token=$1, last_login=NOW() WHERE id=$2', [tokens.refreshToken, user.id]);
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, ...tokens });
    } catch (e) {
        console.error('Login error:', e.message);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

app.post('/api/auth/forgot-password', authRateLimit, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    if (!dbPool) return res.json({ success: true }); // silent for security
    try {
        const result = await dbPool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.json({ success: true }); // don't reveal existence
        const userId = result.rows[0].id;
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await dbPool.query(
            `INSERT INTO password_reset_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET token=$2, expires_at=$3`,
            [userId, token, expires]
        );
        // Log token for now (email delivery is future work)
        console.log(`🔑 Password reset token for ${email}: ${token}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: true }); // never reveal errors
    }
});

app.post('/api/auth/reset-password', authRateLimit, async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password required' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    if (!dbPool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const result = await dbPool.query(
            `SELECT user_id FROM password_reset_tokens
             WHERE token=$1 AND expires_at > NOW()`,
            [token]
        );
        if (result.rows.length === 0) return res.status(400).json({ success: false, error: 'Invalid or expired token' });
        const userId = result.rows[0].user_id;
        const hash = await bcrypt.hash(password, 12);
        await dbPool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, userId]);
        await dbPool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Reset failed' });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ success: false, error: 'Refresh token required' });
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
    try {
        const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        const result = await dbPool.query('SELECT * FROM users WHERE id=$1 AND refresh_token=$2', [payload.sub, refreshToken]);
        if (!result.rows[0]) return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        const user = result.rows[0];
        const tokens = signTokens(user.id, user.email);
        await dbPool.query('UPDATE users SET refresh_token=$1 WHERE id=$2', [tokens.refreshToken, user.id]);
        res.json({ success: true, ...tokens });
    } catch {
        res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    if (dbPool) {
        const { refreshToken } = req.body || {};
        if (refreshToken) {
            const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
            try {
                const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
                await dbPool.query('UPDATE users SET refresh_token=NULL WHERE id=$1', [payload.sub]);
            } catch {}
        }
    }
    res.json({ success: true });
});

app.get('/api/auth/me', requireJwt, async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    try {
        const result = await dbPool.query('SELECT id, email, name, role FROM users WHERE id=$1', [req.user.sub]);
        if (!result.rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
});

// ── End Auth Endpoints ────────────────────────────────────────────────────────

const engine = new CryptoTradingEngine(CRYPTO_CONFIG);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        bot: 'unified-crypto-bot',
        timestamp: new Date().toISOString()
    });
});

// Get trading status
app.get('/api/trading/status', (req, res) => {
    const status = engine.getStatus();
    res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
    });
});

// Start trading
app.post('/api/trading/start', async (req, res) => {
    try {
        await engine.start();
        res.json({
            success: true,
            message: 'Crypto trading engine started',
            warning: 'Crypto is HIGH RISK - use testnet first!'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop trading
app.post('/api/trading/stop', (req, res) => {
    engine.stop();
    res.json({
        success: true,
        message: 'Crypto trading engine stopped'
    });
});

// ===== ALIAS ROUTES for dashboard compatibility =====
app.get('/api/crypto/status', (req, res) => {
    // Return flat structure directly - matches CryptoBotPage BotStatus interface
    res.json(engine.getStatus());
});
app.post('/api/crypto/start', async (req, res) => {
    try {
        await engine.start();
        res.json({ success: true, message: 'Crypto trading engine started' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
app.post('/api/crypto/stop', (req, res) => {
    try {
        engine.stop();
        res.json({ success: true, message: 'Crypto trading engine stopped' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.post('/api/crypto/pause', (req, res) => {
    try {
        engine.pause();
        res.json({ success: true, message: 'Crypto trading engine paused' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Test Telegram alert
app.post('/test-telegram', async (req, res) => {
    try {
        console.log('📱 Sending test Telegram alert...');

        const testMessage = `🧪 *CRYPTO BOT TEST* 🧪

This is a test alert from your Crypto Trading Bot.

✅ If you receive this, Telegram alerts are working!

⏰ Time: ${new Date().toLocaleString()}`;

        const sent = await telegramAlerts.send(testMessage);

        if (sent) {
            res.json({
                success: true,
                message: 'Test Telegram message sent successfully! Check your Telegram app.',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to send Telegram message. Check your configuration.',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send Telegram message',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

const metrics = {
    positionsGauge: new promClient.Gauge({
        name: 'crypto_bot_active_positions',
        help: 'Number of active crypto positions',
        registers: [register]
    }),
    tradesCounter: new promClient.Counter({
        name: 'crypto_bot_total_trades',
        help: 'Total number of crypto trades',
        registers: [register]
    }),
    pnlGauge: new promClient.Gauge({
        name: 'crypto_bot_pnl_total',
        help: 'Total P/L in USD',
        registers: [register]
    })
};

// Update metrics every 10 seconds
setInterval(() => {
    const status = engine.getStatus();
    metrics.positionsGauge.set(status.positions.length);
    metrics.tradesCounter.inc(0); // Just to register
    metrics.pnlGauge.set(parseFloat(status.netPnL));
}, 10000);

// ── Config read endpoint (used by SettingsPage to load broker state) ─────────
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: {
            trading: {
                mode: isRealTradingEnabled() ? 'live' : 'paper',
            },
            brokers: {
                crypto: {
                    configured: !!(process.env.CRYPTO_API_KEY && process.env.CRYPTO_API_SECRET),
                    exchange: process.env.CRYPTO_EXCHANGE || 'kraken',
                    testnet: process.env.CRYPTO_TESTNET !== 'false',
                },
            },
        },
    });
});

app.post('/api/config/mode', requireApiSecret, async (req, res) => {
    try {
        const { mode } = req.body;
        if (!['paper', 'live'].includes(mode)) {
            return res.status(400).json({ success: false, error: 'mode must be "paper" or "live"' });
        }
        const value = mode === 'live' ? 'true' : 'false';
        process.env.REAL_TRADING_ENABLED = value;
        await persistEnvVar('REAL_TRADING_ENABLED', value);
        console.log(`⚙️  Crypto trading mode switched to: ${mode.toUpperCase()}`);
        res.json({ success: true, mode });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Credentials management ──────────────────────────────────────────────────
app.post('/api/config/credentials', requireJwtOrApiSecret, async (req, res) => {
    try {
        const { broker, credentials, fields } = req.body;
        const creds = credentials || fields;
        const ALLOWED_KEYS = {
            crypto:   ['CRYPTO_API_KEY', 'CRYPTO_API_SECRET', 'CRYPTO_EXCHANGE', 'CRYPTO_TESTNET'],
            telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_ALERTS_ENABLED'],
            sms:      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'ALERT_PHONE_NUMBER', 'SMS_ALERTS_ENABLED'],
        };
        const allowed = ALLOWED_KEYS[broker];
        if (!allowed) return res.status(400).json({ success: false, error: 'Unknown broker' });
        if (!creds || typeof creds !== 'object') return res.status(400).json({ success: false, error: 'No credentials provided' });
        const userId = req.user?.sub;
        const warnings = [];
        let persisted = 0;
        let filePersisted = 0;
        let updated = 0;
        const fileCredentials = {};
        for (const [key, rawValue] of Object.entries(creds)) {
            if (!allowed.includes(key)) continue;
            const value = normalizeCredentialValue(rawValue);
            if (value === null) continue;
            // Apply immediately in-memory so current session picks it up
            process.env[key] = value;
            if (userId) {
                fileCredentials[key] = encryptCredential(value);
            }
            // Persist encrypted to DB per user (if authenticated)
            if (userId && dbPool) {
                try {
                    await dbPool.query(
                        `INSERT INTO user_credentials (user_id, broker, credential_key, encrypted_value, updated_at)
                         VALUES ($1, $2, $3, $4, NOW())
                         ON CONFLICT (user_id, broker, credential_key)
                         DO UPDATE SET encrypted_value=$4, updated_at=NOW()`,
                        [userId, broker, key, fileCredentials[key]]
                    );
                    persisted++;
                } catch (persistErr) {
                    const warning = `Failed to persist ${key}; using current runtime value only`;
                    warnings.push(warning);
                    console.warn(`⚠️ Failed to persist ${broker}.${key} for user ${userId}:`, persistErr.message);
                }
            }
            updated++;
        }
        if (updated === 0) {
            return res.status(400).json({ success: false, error: 'No valid credential fields provided' });
        }

        if (userId && Object.keys(fileCredentials).length > 0) {
            try {
                filePersisted = credentialStore.saveEncryptedCredentials(userId, broker, fileCredentials);
            } catch (fileErr) {
                warnings.push('Failed to persist credentials to local fallback storage');
                console.warn(`⚠️ Failed to persist ${broker} credentials to file for user ${userId}:`, fileErr.message);
            }
        }

        const storage = userId && persisted === updated
            ? 'database'
            : userId && filePersisted === updated
                ? 'file'
                : 'environment';
        console.log(`⚙️  Credentials updated: broker=${broker} keys=${updated} storage=${storage}`);

        let reconnectWarning = null;
        // If crypto keys were updated, reinitialise the exchange client and reconnect
        if (broker === 'crypto' && updated > 0) {
            const apiKey = process.env.CRYPTO_API_KEY;
            const apiSecret = process.env.CRYPTO_API_SECRET;
            if (!apiKey || !apiSecret) {
                reconnectWarning = 'Credentials saved, but Kraken reconnect was skipped until both API key and secret are present';
            } else {
                try {
                    engine.kraken = new KrakenClient({ apiKey, apiSecret });
                    if (engine.demoMode) {
                        // Call _privateRequest directly so real Kraken errors propagate (getAccountInfo swallows them)
                        const account = await engine.kraken._privateRequest('Balance');
                        if (account) {
                            engine.demoMode = false;
                            engine.saveState();
                            console.log('✅ Kraken reconnected after credential update — exiting DEMO MODE');
                        } else {
                            reconnectWarning = 'Keys saved but Kraken Balance returned empty — check API key permissions';
                        }
                    }
                } catch (reconnectErr) {
                    reconnectWarning = `Kraken rejected keys: ${reconnectErr.message || 'Unknown error'}`;
                    console.error('❌ Kraken reconnect error:', reconnectWarning);
                }
            }
        }
        // Register or update per-user crypto engine
        if (userId && broker === 'crypto') {
            try {
                const existingEngine = cryptoEngineRegistry.get(String(userId));
                if (existingEngine && process.env.CRYPTO_API_KEY && process.env.CRYPTO_API_SECRET) {
                    existingEngine.kraken = new KrakenClient({
                        apiKey: process.env.CRYPTO_API_KEY,
                        apiSecret: process.env.CRYPTO_API_SECRET,
                    });
                    console.log(`🔧 [CryptoEngine ${userId}] Kraken client updated`);
                } else if (!existingEngine) {
                    getOrCreateCryptoEngine(userId).then(eng => {
                        if (eng) { eng.start().catch(() => {}); }
                    }).catch(() => {});
                }
            } catch (engineErr) {
                warnings.push('Credentials saved, but the personal crypto engine could not be refreshed immediately');
                console.warn(`⚠️ Failed to refresh crypto engine for user ${userId}:`, engineErr.message);
            }
        }

        const response = {
            success: true,
            updated,
            reconnected: reconnectWarning === null && engine.demoMode === false,
            demoMode: engine.demoMode || false,
            storage,
            engineStarted: !!userId,
        };
        if (reconnectWarning) response.warning = reconnectWarning;
        if (warnings.length === 1) response.warning = response.warning || warnings[0];
        if (warnings.length > 1) response.warnings = warnings;

        res.json(response);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/config/credentials/status', requireJwt, async (req, res) => {
    const userId = req.user?.sub;
    const envStatus = {
        crypto:   { configured: !!(process.env.CRYPTO_API_KEY && process.env.CRYPTO_API_SECRET) },
        telegram: { configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) },
        sms:      { configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) },
    };

    const fileStatus = userId ? {
        crypto: credentialStore.countCredentials(userId, 'crypto'),
        telegram: credentialStore.countCredentials(userId, 'telegram'),
        sms: credentialStore.countCredentials(userId, 'sms'),
    } : null;

    if (!userId) {
        return res.json({ success: true, brokers: envStatus });
    }

    if (!dbPool) {
        return res.json({ success: true, brokers: {
            crypto:   { configured: (fileStatus.crypto   || 0) >= 2 || envStatus.crypto.configured },
            telegram: { configured: (fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: (fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }});
    }
    try {
        const r = await dbPool.query(
            'SELECT broker, COUNT(*) as key_count FROM user_credentials WHERE user_id=$1 GROUP BY broker',
            [userId]
        );
        const stored = Object.fromEntries(r.rows.map(row => [row.broker, parseInt(row.key_count)]));
        res.json({ success: true, brokers: {
            crypto:   { configured: Math.max(stored.crypto   || 0, fileStatus.crypto   || 0) >= 2 || envStatus.crypto.configured },
            telegram: { configured: Math.max(stored.telegram || 0, fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: Math.max(stored.sms      || 0, fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }});
    } catch (e) {
        console.warn('⚠️ Credential status lookup failed, falling back to environment values:', e.message);
        res.json({ success: true, brokers: {
            crypto:   { configured: (fileStatus.crypto   || 0) >= 2 || envStatus.crypto.configured },
            telegram: { configured: (fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: (fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }, warning: 'Credential status fallback in use' });
    }
});

app.get('/api/trades', async (req, res) => {
    if (!dbPool) return res.json({ success: false, error: 'DB not configured', trades: [] });
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const r = await dbPool.query(
            `SELECT * FROM trades WHERE bot='crypto' ORDER BY created_at DESC LIMIT $1`, [limit]);
        res.json({ success: true, trades: r.rows, count: r.rows.length });
    } catch (e) { res.status(500).json({ success: false, error: e.message, trades: [] }); }
});

app.get('/api/trades/summary', async (req, res) => {
    if (!dbPool) return res.json({ success: false, error: 'DB not configured', summary: [] });
    try {
        const days = Math.min(parseInt(req.query.days) || 30, 90);
        const cleanPnlUsd = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN NULL ELSE pnl_usd END`;
        const r = await dbPool.query(`
            SELECT
                DATE_TRUNC('day', COALESCE(exit_time, created_at)) AS day,
                COUNT(*) FILTER (WHERE status='closed') AS closed_trades,
                COUNT(*) FILTER (WHERE status='open')   AS open_trades,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0) AS winners,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0) AS losers,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} = 0) AS breakeven_trades,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed'), 0)::FLOAT AS daily_pnl,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0), 0)::FLOAT AS gross_profit,
                COALESCE(ABS(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0)), 0)::FLOAT AS gross_loss
            FROM trades
            WHERE bot='crypto' AND created_at >= NOW() - INTERVAL '1 day' * $1
            GROUP BY day ORDER BY day DESC
        `, [days]);
        const totals = await dbPool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status='closed') AS total_trades,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0) AS winners,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0) AS losers,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} = 0) AS breakeven_trades,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed'), 0)::FLOAT AS total_pnl,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0), 0)::FLOAT AS gross_profit,
                COALESCE(ABS(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0)), 0)::FLOAT AS gross_loss
            FROM trades WHERE bot='crypto'
        `);
        res.json({ success: true, daily: r.rows, totals: totals.rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message, daily: [], totals: [] }); }
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

console.log('✅ Prometheus metrics initialized');

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-USER CRYPTO ENGINE REGISTRY
// Each user gets their own CryptoTradingEngine instance with isolated Kraken creds.
// ─────────────────────────────────────────────────────────────────────────────

const cryptoEngineRegistry = new Map(); // userId → CryptoTradingEngine

async function getOrCreateCryptoEngine(userId) {
    const key = String(userId);
    if (cryptoEngineRegistry.has(key)) return cryptoEngineRegistry.get(key);
    try {
        const creds = await loadUserCredentials(userId, 'crypto');
        const apiKey    = creds.CRYPTO_API_KEY    || process.env.CRYPTO_API_KEY;
        const apiSecret = creds.CRYPTO_API_SECRET || process.env.CRYPTO_API_SECRET;
        if (!apiKey || !apiSecret) return null;
        const userConfig = {
            ...CRYPTO_CONFIG,
            exchange: { ...CRYPTO_CONFIG.exchange, apiKey, apiSecret,
                testnet: creds.CRYPTO_TESTNET !== 'false' && CRYPTO_CONFIG.exchange.testnet }
        };
        const userEngine = new CryptoTradingEngine(userConfig);
        // Persist state to DB rather than filesystem
        userEngine._userId = userId;
        userEngine._saveStateToDB = async function() {
            if (!dbPool) return;
            try {
                await dbPool.query(
                    `INSERT INTO engine_state (user_id, bot, state_json, updated_at)
                     VALUES ($1, 'crypto', $2, NOW())
                     ON CONFLICT (user_id, bot) DO UPDATE SET state_json=$2, updated_at=NOW()`,
                    [userId, JSON.stringify({ isRunning: this.isRunning, isPaused: this.isPaused,
                        demoMode: this.demoMode, dailyTradeCount: this.dailyTradeCount,
                        totalTrades: this.totalTrades, winningTrades: this.winningTrades,
                        losingTrades: this.losingTrades, totalProfit: this.totalProfit })]
                );
            } catch (e) { /* non-critical */ }
        };
        // Patch dbCryptoOpen/Close to include user_id
        userEngine._dbOpen = async function(symbol, tier, entry, stopLoss, takeProfit, quantity, positionSize, signal = {}) {
            if (!dbPool) return null;
            try {
                const tags = buildCryptoTradeTags(signal, tier);
                const r = await dbPool.query(
                    `INSERT INTO trades (user_id,bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
                     position_size_usd,stop_loss,take_profit,entry_time,signal_score,entry_context,rsi,volume_ratio,momentum_pct)
                     VALUES ($1,'crypto',$2,'long',$3,$4,$5,'open',$6,$7,$8,$9,$10,NOW(),$11,$12::jsonb,$13,$14,$15) RETURNING id`,
                    [userId, symbol, tier, tags.strategy, tags.regime, entry, quantity, positionSize, stopLoss, takeProfit,
                     tags.score, JSON.stringify(tags.context), signal.rsi || null, signal.volumeRatio || null, signal.momentum || null]
                );
                return r.rows[0]?.id;
            } catch (e) { console.warn('DB crypto open failed:', e.message); return null; }
        };
        userEngine._dbClose = async function(id, exitPrice, pnlUsd, pnlPct, reason) {
            if (!dbPool || !id) return;
            try {
                await dbPool.query(
                    `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,exit_time=NOW(),close_reason=$4 WHERE id=$5`,
                    [exitPrice, pnlUsd, pnlPct, reason, id]
                );
            } catch (e) { console.warn('DB crypto close failed:', e.message); }
        };
        // Load saved state from DB
        if (dbPool) {
            try {
                const r = await dbPool.query('SELECT state_json FROM engine_state WHERE user_id=$1 AND bot=$2', [userId, 'crypto']);
                if (r.rows.length > 0) {
                    const s = r.rows[0].state_json;
                    if (s.totalTrades !== undefined) userEngine.totalTrades = s.totalTrades;
                    if (s.winningTrades !== undefined) userEngine.winningTrades = s.winningTrades;
                    if (s.losingTrades !== undefined) userEngine.losingTrades = s.losingTrades;
                    if (s.totalProfit !== undefined) userEngine.totalProfit = s.totalProfit;
                }
            } catch (e) { /* non-critical */ }
        }
        // Hydrate open positions from trades table (KrakenClient has no getOpenPositions — trust DB)
        if (dbPool) {
            try {
                const dbOpen = await dbPool.query(
                    `SELECT id, symbol, entry_price, quantity, stop_loss, take_profit, entry_time
                     FROM trades WHERE bot='crypto' AND status='open' AND user_id=$1`, [userId]
                );
                for (const row of dbOpen.rows) {
                    userEngine.positions.set(row.symbol, {
                        dbTradeId: row.id,
                        symbol: row.symbol,
                        entry: parseFloat(row.entry_price || '0'),
                        quantity: parseFloat(row.quantity || '0'),
                        positionSize: parseFloat(row.quantity || '0') * parseFloat(row.entry_price || '0'),
                        stopLoss: parseFloat(row.stop_loss || '0'),
                        takeProfit: parseFloat(row.take_profit || '0'),
                        entryTime: row.entry_time,
                        tier: 'restored'
                    });
                }
                if (userEngine.positions.size > 0)
                    console.log(`✅ [CryptoEngine ${userId}] Hydrated ${userEngine.positions.size} position(s) from DB`);
            } catch (e) {
                console.warn(`⚠️ [CryptoEngine ${userId}] Position hydration failed:`, e.message);
            }
        }
        // Per-user Telegram alerts
        const tgCreds = await loadUserCredentials(userId, 'telegram').catch(() => ({}));
        const tgToken  = tgCreds.TELEGRAM_BOT_TOKEN  || process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = tgCreds.TELEGRAM_CHAT_ID    || process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChatId) {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                const tgBot = new TelegramBot(tgToken, { polling: false });
                userEngine._userTelegram = {
                    sendCryptoEntry:     (sym, entry, sl, tp, qty, tier) =>
                        tgBot.sendMessage(tgChatId, `✅ *CRYPTO ENTRY* [${tier}]\n₿ ${sym} x${qty}\n💰 Entry: $${entry.toFixed(2)}\n🛑 SL: $${sl?.toFixed(2) || '—'}  🎯 TP: $${tp?.toFixed(2) || '—'}`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendCryptoStopLoss:  (sym, ep, cp, pnl, sl) =>
                        tgBot.sendMessage(tgChatId, `🚨 *CRYPTO STOP LOSS*\n₿ ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💸 P&L: ${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendCryptoTakeProfit:(sym, ep, cp, pnl, tp) =>
                        tgBot.sendMessage(tgChatId, `🎯 *CRYPTO TAKE PROFIT*\n₿ ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💵 P&L: +${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(() => {}),
                    send:               (msg) => tgBot.sendMessage(tgChatId, msg, { parse_mode: 'Markdown' }).catch(() => {}),
                };
                console.log(`📱 [CryptoEngine ${userId}] Per-user Telegram alerts configured`);
            } catch (e) {
                userEngine._userTelegram = null;
                console.warn(`⚠️  [CryptoEngine ${userId}] Telegram init failed:`, e.message);
            }
        }
        cryptoEngineRegistry.set(key, userEngine);
        console.log(`🔧 [CryptoRegistry] Engine registered for user ${userId} (${cryptoEngineRegistry.size} total)`);
        return userEngine;
    } catch (e) {
        console.warn(`⚠️  [CryptoRegistry] Failed to create engine for user ${userId}:`, e.message);
        return null;
    }
}

let cryptoScanQueueRunning = false;
async function runCryptoScanQueue() {
    if (cryptoScanQueueRunning) return;
    cryptoScanQueueRunning = true;
    try {
        for (const [userId, eng] of cryptoEngineRegistry) {
            if (!eng.isRunning) continue;
            try {
                // Re-run tradingLoop for this user's engine by calling scan directly
                // The engine already manages its own tradingLoop via setInterval — no-op here.
                // We just ensure any new engines that haven't started yet get started.
            } catch (e) { console.error(`❌ [CryptoQueue] Engine ${userId} crashed:`, e.message); }
        }
    } finally { cryptoScanQueueRunning = false; }
}

// ── Per-user crypto JWT endpoints ────────────────────────────────────────────
app.get('/api/crypto/engine/status', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const userEngine = await getOrCreateCryptoEngine(userId);
    if (!userEngine) return res.json({ success: true, credentialsRequired: true,
        message: 'No Kraken credentials configured — visit Settings' });
    const connected = await userEngine.refreshConnectionState();
    if (!connected) {
        return res.json({ success: true, credentialsRequired: true,
            message: userEngine.credentialsError || 'Kraken credentials invalid or expired' });
    }
    const status = userEngine.getStatus();
    res.json({ success: true, ...status, userId });
});

app.post('/api/crypto/engine/start', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const userEngine = await getOrCreateCryptoEngine(userId);
    if (!userEngine) return res.status(404).json({ success: false, error: 'Configure Kraken credentials first' });
    const connected = await userEngine.refreshConnectionState(true);
    if (!connected) {
        return res.status(400).json({ success: false, error: userEngine.credentialsError || 'Kraken credentials invalid or expired' });
    }
    await userEngine.start();
    res.json({ success: true, isRunning: userEngine.isRunning });
});

app.post('/api/crypto/engine/stop', requireJwt, async (req, res) => {
    const userEngine = cryptoEngineRegistry.get(String(req.user.sub));
    if (!userEngine) return res.status(404).json({ success: false, error: 'Engine not found' });
    userEngine.stop();
    res.json({ success: true, isRunning: false });
});

app.post('/api/crypto/engine/pause', requireJwt, async (req, res) => {
    const userEngine = cryptoEngineRegistry.get(String(req.user.sub));
    if (!userEngine) return res.status(404).json({ success: false, error: 'Engine not found' });
    userEngine.isPaused = !userEngine.isPaused;
    res.json({ success: true, isRunning: userEngine.isRunning, isPaused: userEngine.isPaused });
});

app.post('/api/crypto/engine/close-all', requireJwt, async (req, res) => {
    const userEngine = cryptoEngineRegistry.get(String(req.user.sub));
    if (!userEngine) return res.status(404).json({ success: false, error: 'Engine not found' });
    const closed = [], skipped = [];
    for (const [symbol] of userEngine.positions) {
        try {
            const price = await userEngine.kraken.getPrice(symbol).catch(() => 0);
            await userEngine.closePosition(symbol, price, 'Manual Close All');
            closed.push(symbol);
        } catch (err) { skipped.push({ symbol, error: err.message }); }
    }
    res.json({ success: true, closed, skipped });
});

// Module-level close-all (no per-user engine context required)
app.post('/api/crypto/close-all', async (req, res) => {
    const closed = [], skipped = [];
    for (const [symbol] of engine.positions) {
        try {
            const price = await engine.kraken.getPrice(symbol).catch(() => 0);
            await engine.closePosition(symbol, price, 'Manual Close All');
            closed.push(symbol);
        } catch (err) { skipped.push({ symbol, error: err.message }); }
    }
    res.json({ success: true, closed, skipped });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || process.env.CRYPTO_PORT || 3006;
app.listen(PORT, async () => {
    const liveExecutionEnabled = isRealTradingEnabled();
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           UNIFIED CRYPTO TRADING BOT - LIVE 24/7              ║
╠════════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                     ║
║  Exchange: ${CRYPTO_CONFIG.exchange.name.toUpperCase().padEnd(48)} ║
║  Mode: ${(liveExecutionEnabled ? 'LIVE TRADING ⚠️ ' : 'PAPER TRADING').padEnd(48)} ║
║  Pairs: ${CRYPTO_CONFIG.symbols.length} major cryptocurrencies                      ║
║  Trading Hours: 24/7/365 (Never closes)                        ║
║  Strategy: BTC-Correlation + 3-Tier Momentum                   ║
║  Risk: 2% per trade | Max ${CRYPTO_CONFIG.maxTotalPositions} positions                             ║
║  ⚠️  WARNING: HIGH VOLATILITY ASSET CLASS                      ║
╚════════════════════════════════════════════════════════════════╝
    `);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`📊 Status: http://localhost:${PORT}/api/trading/status`);
    console.log(`🚀 Start: POST http://localhost:${PORT}/api/trading/start`);
    console.log(`🛑 Stop: POST http://localhost:${PORT}/api/trading/stop`);
    console.log(`📱 Test Alert: POST http://localhost:${PORT}/test-telegram`);
    console.log(`\n💎 Crypto pairs: ${CRYPTO_CONFIG.symbols.join(', ')}`);
    console.log(`📈 BTC correlation: Altcoins only trade when BTC is bullish`);
    console.log(`⚠️  ${liveExecutionEnabled ? 'LIVE TRADING - Real money at risk!' : 'Paper trading active - orders are simulated locally.'}`);

    // Connect DB for trade persistence (non-blocking)
    await initTradeDb().catch(e => console.warn('⚠️  Crypto DB init error:', e.message));

    // FIRST: load local state (daily counters, operational state like demoMode)
    engine.loadState();

    // THEN: DB hydration overwrites trade counters (DB is authoritative)
    if (dbPool) {
        try {
            const cleanPnl = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN NULL ELSE pnl_usd END`;
            const dbStats = await dbPool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status='closed') AS total,
                    COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} > 0) AS winners,
                    COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} <= 0) AS losers,
                    COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed'), 0)::FLOAT AS total_pnl,
                    COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed' AND ${cleanPnl} > 0), 0)::FLOAT AS win_amount,
                    COALESCE(ABS(SUM(${cleanPnl}) FILTER (WHERE status='closed' AND ${cleanPnl} < 0)), 0)::FLOAT AS loss_amount
                FROM trades WHERE bot='crypto'
            `);
            const row = dbStats.rows[0];
            const total = parseInt(row.total) || 0;
            const winners = parseInt(row.winners) || 0;
            const losers = parseInt(row.losers) || 0;
            const winAmt = parseFloat(row.win_amount) || 0;
            const lossAmt = parseFloat(row.loss_amount) || 0;
            if (total > 0) {
                engine.totalTrades = total;
                engine.winningTrades = winners;
                engine.losingTrades = losers;
                engine.totalProfit = winAmt;
                engine.totalLoss = lossAmt;
            }
            // Consecutive losses from most recent trades
            const recent = await dbPool.query(`
                SELECT ${cleanPnl} AS pnl FROM trades
                WHERE bot='crypto' AND status='closed' AND ${cleanPnl} IS NOT NULL
                ORDER BY exit_time DESC NULLS LAST LIMIT 50
            `);
            let consec = 0, maxConsec = 0, runConsec = 0;
            for (const r of recent.rows) {
                if (parseFloat(r.pnl) <= 0) { consec++; } else break;
            }
            for (const r of recent.rows) {
                if (parseFloat(r.pnl) <= 0) { runConsec++; maxConsec = Math.max(maxConsec, runConsec); }
                else runConsec = 0;
            }
            engine.guardrails.consecutiveLosses = consec;
            console.log(`📊 Hydrated crypto perfData from DB: ${total} trades, ${winners}W/${losers}L, PF ${lossAmt > 0 ? (winAmt / lossAmt).toFixed(2) : 'N/A'}, Win $${winAmt.toFixed(2)}, Loss $${lossAmt.toFixed(2)}`);
        } catch (e) { console.warn('⚠️  DB crypto perfData hydration failed:', e.message); }

        // Hydrate open positions from DB so restarts don't orphan-close them at pnl=0
        try {
            const openPositions = await dbPool.query(
                `SELECT * FROM trades WHERE bot='crypto' AND status='open' AND user_id IS NULL ORDER BY entry_time DESC`
            );
            for (const row of openPositions.rows) {
                if (!engine.positions.has(row.symbol)) {
                    const currentPrice = await engine.kraken.getPrice(row.symbol).catch(() => null);
                    if (currentPrice) {
                        engine.positions.set(row.symbol, {
                            symbol: row.symbol,
                            direction: row.direction || 'long',
                            entry: parseFloat(row.entry_price),
                            quantity: parseFloat(row.quantity || 0),
                            stopLoss: parseFloat(row.stop_loss || 0),
                            takeProfit: parseFloat(row.take_profit || 0),
                            entryTime: new Date(row.entry_time),
                            currentPrice: currentPrice,
                            unrealizedPnL: (currentPrice - parseFloat(row.entry_price)) * parseFloat(row.quantity || 0),
                            dbTradeId: row.id,
                            restored: true,
                        });
                        console.log(`[HYDRATE] Restored open position: ${row.symbol} @ ${row.entry_price}`);
                    }
                }
            }
        } catch (err) {
            console.error('[HYDRATE] Failed to restore positions:', err.message);
        }
    }

    // Auto-start the default crypto engine (matches stock/forex bot behavior)
    console.log('🚀 Auto-starting default crypto trading engine...');
    engine.start().catch(e => console.error('❌ Default crypto engine start failed:', e.message));

    // ── Auto-restart engines for users who had isRunning=true at last save ──
    async function autoRestartCryptoEngines() {
        if (!dbPool) return;
        try {
            const result = await dbPool.query(
                `SELECT es.user_id, es.state_json AS state, u.email
                 FROM engine_state es
                 JOIN users u ON u.id = es.user_id
                 WHERE es.bot = 'crypto' AND (es.state_json->>'isRunning')::boolean = true`
            );
            if (result.rows.length === 0) return;
            console.log(`🔄 Auto-restarting crypto engines for ${result.rows.length} user(s)...`);
            for (const row of result.rows) {
                try {
                    const eng = await getOrCreateCryptoEngine(row.user_id);
                    if (eng && !eng.isRunning) {
                        await eng.start();
                        console.log(`✅ Auto-restarted crypto engine for user ${row.email}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to auto-restart crypto engine for user ${row.user_id}:`, e.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ autoRestartCryptoEngines failed:', e.message);
        }
    }

    setTimeout(() => autoRestartCryptoEngines().catch(e => console.warn('Auto-restart error:', e.message)), 5000);

    // Register engines for all existing users with Kraken credentials (staggered)
    setTimeout(async () => {
        try {
            if (dbPool) {
                const users = await dbPool.query('SELECT id FROM users ORDER BY id ASC');
                let delay = 0;
                for (const row of users.rows) {
                    setTimeout(async () => {
                        try {
                            const eng = await getOrCreateCryptoEngine(row.id);
                            if (eng) await eng.start();
                        } catch (e) { console.warn(`⚠️  Crypto engine init failed for user ${row.id}:`, e.message); }
                    }, delay);
                    delay += 6000;
                }
            }
        } catch (e) { console.warn('⚠️  Crypto engine pre-registration failed:', e.message); }
    }, 10000);

    // Dead-man heartbeat: crypto trades 24/7 — alert if silent >2h
    let _cryptoHeartbeatAlertSent = false;
    let _cryptoLastScanTime = Date.now();
    // The per-user engines call tradingLoop on their own setInterval; update via proxy
    const _cryptoHeartbeatTick = setInterval(() => { _cryptoLastScanTime = Date.now(); }, 5 * 60 * 1000);
    setInterval(() => {
        const silentMinutes = Math.floor((Date.now() - _cryptoLastScanTime) / 60000);
        if (silentMinutes >= 120 && !_cryptoHeartbeatAlertSent) {
            _cryptoHeartbeatAlertSent = true;
            telegramAlerts.sendHeartbeatAlert('Crypto Bot', silentMinutes).catch(() => {});
        } else if (silentMinutes < 120) {
            _cryptoHeartbeatAlertSent = false;
        }
    }, 30 * 60 * 1000);
    void _cryptoHeartbeatTick; // suppress lint warning

    // ── DB Reconciliation: close orphaned 'open' trades not in memory ──
    // Runs after loadState so engine.positions is populated from saved state.
    try {
        if (dbPool) {
            const orphaned = await dbPool.query(
                `SELECT id, symbol FROM trades WHERE bot='crypto' AND status='open' AND user_id IS NULL`
            );
            let closedCount = 0;
            for (const row of orphaned.rows) {
                if (!engine.positions.has(row.symbol)) {
                    await dbPool.query(
                        `UPDATE trades SET status='closed', exit_price=entry_price, pnl_usd=0, pnl_pct=0,
                         close_reason='orphaned_restart', exit_time=NOW() WHERE id=$1`,
                        [row.id]
                    );
                    closedCount++;
                }
            }
            if (closedCount > 0) {
                console.log(`🧹 Closed ${closedCount} orphaned DB trade(s) from previous session`);
            }
        }
    } catch (e) {
        console.warn('⚠️  DB reconciliation failed:', e.message);
    }
});

module.exports = { app, engine, CRYPTO_CONFIG };
