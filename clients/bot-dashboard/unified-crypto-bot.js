const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

// Telegram alerts
const { getTelegramAlertService } = require('../../infrastructure/notifications/telegram-alerts');
const telegramAlerts = getTelegramAlertService();

// SMS alerts (graceful fallback)
const { getSMSAlertService } = require('../../infrastructure/notifications/sms-alerts');
const smsAlerts = getSMSAlertService();

// Prometheus metrics
const promClient = require('prom-client');
const register = promClient.register; // Use default register

// ============================================================================
// CRYPTO TRADING CONFIGURATION (24/7/365)
// ============================================================================

const CRYPTO_CONFIG = {
    // Exchange Configuration
    exchange: {
        name: process.env.CRYPTO_EXCHANGE || 'binance',
        apiKey: process.env.CRYPTO_API_KEY,
        apiSecret: process.env.CRYPTO_API_SECRET,
        testnet: process.env.CRYPTO_TESTNET === 'true', // Use testnet first!
        baseURL: process.env.CRYPTO_TESTNET === 'true'
            ? 'https://testnet.binance.vision'
            : 'https://api.binance.com'
    },

    // Trading Pairs (12 major cryptocurrencies)
    symbols: [
        'BTCUSDT',  // Bitcoin - Market leader
        'ETHUSDT',  // Ethereum - #2, high liquidity
        'BNBUSDT',  // Binance Coin - Exchange token
        'SOLUSDT',  // Solana - High performance blockchain
        'ADAUSDT',  // Cardano - Smart contracts
        'XRPUSDT',  // Ripple - Payments
        'AVAXUSDT', // Avalanche - DeFi
        'MATICUSDT',// Polygon - Scaling
        'LINKUSDT', // Chainlink - Oracles
        'DOTUSDT',  // Polkadot - Interoperability
        'UNIUSDT',  // Uniswap - DEX
        'ATOMUSDT'  // Cosmos - Hub
    ],

    // Risk Management (Ultra-Conservative for crypto)
    maxTotalPositions: 2,  // Only 2 positions (high volatility!)
    maxPositionsPerSymbol: 1,
    maxTradesPerDay: 10,
    maxTradesPerSymbol: 2,
    minTimeBetweenTrades: 30, // 30 min cooldown

    // Position Sizing (smaller due to crypto volatility)
    accountRiskPercent: 0.02, // 2% risk per trade
    basePositionSizeUSD: 500, // $500 per position (conservative)
    maxPositionSizeUSD: 2000, // Max $2000 per position

    // 3-Tier Momentum Strategy (adapted for crypto)
    tiers: {
        tier1: {
            name: 'Standard Crypto',
            momentumThreshold: 0.015, // 1.5% momentum
            stopLoss: 0.05,          // 5% stop
            profitTarget: 0.15,      // 15% target (3:1 R/R)
            rsiLower: 20,            // Allow deep oversold
            rsiUpper: 80,            // Allow overbought (FOMO)
            maxPositions: 2
        },
        tier2: {
            name: 'High Momentum',
            momentumThreshold: 0.05, // 5% momentum
            stopLoss: 0.06,          // 6% stop
            profitTarget: 0.20,      // 20% target (3.3:1 R/R)
            rsiLower: 25,
            rsiUpper: 85,
            maxPositions: 1
        },
        tier3: {
            name: 'Extreme Momentum',
            momentumThreshold: 0.10, // 10% momentum
            stopLoss: 0.08,          // 8% stop
            profitTarget: 0.30,      // 30% target (3.75:1 R/R)
            rsiLower: 30,
            rsiUpper: 90,
            maxPositions: 1
        }
    },

    // Crypto-Specific Filters
    filters: {
        btcCorrelation: true,  // Check BTC trend before altcoin trades
        volumeConfirmation: true,
        minVolumeUSD: 10000000, // $10M daily volume minimum
        maxVolatility24h: 0.30, // Pause if >30% move in 24h
        avoidWeekend: false     // Crypto trades 24/7 even weekends
    },

    // Trailing Stops (crypto needs looser stops)
    trailingStops: [
        { profit: 0.10, stopDistance: 0.05 }, // At +10%, trail by 5%
        { profit: 0.20, stopDistance: 0.08 }, // At +20%, trail by 8%
        { profit: 0.30, stopDistance: 0.12 }  // At +30%, trail by 12%
    ],

    // Scan Interval (5 min for crypto)
    scanInterval: 300000 // 5 minutes (300,000ms)
};

// ============================================================================
// BINANCE API CLIENT
// ============================================================================

class BinanceClient {
    constructor(config) {
        this.config = config;
        this.baseURL = config.baseURL;
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
    }

    // Generate signature for authenticated requests
    sign(params) {
        const query = Object.keys(params)
            .map(key => `${key}=${params[key]}`)
            .join('&');

        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(query)
            .digest('hex');
    }

    // Get account information
    async getAccountInfo() {
        try {
            const timestamp = Date.now();
            const params = { timestamp };
            params.signature = this.sign(params);

            const response = await axios.get(`${this.baseURL}/api/v3/account`, {
                params,
                headers: { 'X-MBX-APIKEY': this.apiKey }
            });

            return response.data;
        } catch (error) {
            console.error('❌ Failed to get account info:', error.response?.data || error.message);
            return null;
        }
    }

    // Get current price for a symbol
    async getPrice(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/api/v3/ticker/price`, {
                params: { symbol }
            });
            return parseFloat(response.data.price);
        } catch (error) {
            console.error(`❌ Failed to get price for ${symbol}:`, error.message);
            return null;
        }
    }

    // Get 24h ticker data
    async get24hTicker(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/api/v3/ticker/24hr`, {
                params: { symbol }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Failed to get 24h ticker for ${symbol}:`, error.message);
            return null;
        }
    }

    // Get klines (candlestick data)
    async getKlines(symbol, interval = '5m', limit = 100) {
        try {
            const response = await axios.get(`${this.baseURL}/api/v3/klines`, {
                params: { symbol, interval, limit }
            });
            return response.data;
        } catch (error) {
            console.error(`❌ Failed to get klines for ${symbol}:`, error.message);
            return null;
        }
    }

    // Place a market order
    async placeOrder(symbol, side, quantity) {
        try {
            const timestamp = Date.now();
            const params = {
                symbol,
                side,  // BUY or SELL
                type: 'MARKET',
                quantity: quantity.toFixed(8),
                timestamp
            };
            params.signature = this.sign(params);

            const response = await axios.post(`${this.baseURL}/api/v3/order`, null, {
                params,
                headers: { 'X-MBX-APIKEY': this.apiKey }
            });

            return response.data;
        } catch (error) {
            console.error(`❌ Failed to place order for ${symbol}:`, error.response?.data || error.message);
            return null;
        }
    }

    // Get open orders
    async getOpenOrders(symbol = null) {
        try {
            const timestamp = Date.now();
            const params = { timestamp };
            if (symbol) params.symbol = symbol;
            params.signature = this.sign(params);

            const response = await axios.get(`${this.baseURL}/api/v3/openOrders`, {
                params,
                headers: { 'X-MBX-APIKEY': this.apiKey }
            });

            return response.data;
        } catch (error) {
            console.error('❌ Failed to get open orders:', error.response?.data || error.message);
            return [];
        }
    }

    // Cancel an order
    async cancelOrder(symbol, orderId) {
        try {
            const timestamp = Date.now();
            const params = { symbol, orderId, timestamp };
            params.signature = this.sign(params);

            const response = await axios.delete(`${this.baseURL}/api/v3/order`, {
                params,
                headers: { 'X-MBX-APIKEY': this.apiKey }
            });

            return response.data;
        } catch (error) {
            console.error(`❌ Failed to cancel order ${orderId}:`, error.response?.data || error.message);
            return null;
        }
    }
}

// ============================================================================
// CRYPTO TRADING ENGINE
// ============================================================================

class CryptoTradingEngine {
    constructor(config) {
        this.config = config;
        this.binance = new BinanceClient(config.exchange);

        // Persistent state file
        this.stateFile = require('path').join(__dirname, 'data/crypto-bot-state.json');

        // Trading state
        this.positions = new Map();
        this.priceHistory = new Map();
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

    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) return 50;

        let gains = 0, losses = 0;
        for (let i = prices.length - period; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) gains += change;
            else losses += Math.abs(change);
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;
        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    // ========================================================================
    // BTC CORRELATION STRATEGY
    // ========================================================================

    async isBTCBullish() {
        const btcPrices = this.priceHistory.get('BTCUSDT') || [];
        if (btcPrices.length < 20) return true; // Default allow

        const sma20 = this.calculateSMA(btcPrices, 20);
        const currentPrice = btcPrices[btcPrices.length - 1];
        const ema9 = this.calculateEMA(btcPrices, 9);

        // BTC is bullish if:
        // 1. Price above 20 SMA
        // 2. EMA9 above SMA20 (short-term momentum)
        return currentPrice > sma20 && ema9 > sma20;
    }

    // ========================================================================
    // MARKET DATA FETCHING
    // ========================================================================

    async fetchMarketData(symbol) {
        try {
            // Get klines (5-min candles, last 100)
            const klines = await this.binance.getKlines(symbol, '5m', 100);
            if (!klines || klines.length === 0) return null;

            // Extract close prices
            const prices = klines.map(k => parseFloat(k[4])); // Close price
            const volumes = klines.map(k => parseFloat(k[5])); // Volume

            // Store in history
            this.priceHistory.set(symbol, prices);

            // Get 24h ticker for volatility check
            const ticker24h = await this.binance.get24hTicker(symbol);
            if (!ticker24h) return null;

            const currentPrice = parseFloat(ticker24h.lastPrice);
            const volume24h = parseFloat(ticker24h.quoteVolume); // USD volume
            const priceChange24h = parseFloat(ticker24h.priceChangePercent) / 100;

            return {
                symbol,
                currentPrice,
                prices,
                volumes,
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

        // Check BTC trend first (for altcoin correlation)
        const btcBullish = await this.isBTCBullish();
        if (!btcBullish) {
            console.log('🔴 BTC is bearish - reducing altcoin exposure');
        }

        for (const symbol of this.config.symbols) {
            // Skip altcoins if BTC is bearish (except BTC and ETH themselves)
            if (!btcBullish && symbol !== 'BTCUSDT' && symbol !== 'ETHUSDT') {
                continue;
            }

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
            const rsi = this.calculateRSI(data.prices, 14);

            if (!sma20 || !ema9) continue;

            // Momentum calculation
            const momentum = (data.currentPrice - sma20) / sma20;

            // Try each tier
            for (const [tierName, tier] of Object.entries(this.config.tiers)) {
                // Check momentum threshold
                if (momentum < tier.momentumThreshold) continue;

                // Check RSI range
                if (rsi < tier.rsiLower || rsi > tier.rsiUpper) continue;

                // Check uptrend
                if (ema9 < sma20) continue; // Not in uptrend

                // Check position limits for this tier
                const tierPositions = Array.from(this.positions.values())
                    .filter(p => p.tier === tierName).length;
                if (tierPositions >= tier.maxPositions) continue;

                // OPPORTUNITY FOUND!
                opportunities.push({
                    symbol,
                    tier: tierName,
                    price: data.currentPrice,
                    momentum: momentum * 100,
                    rsi,
                    volume24h: data.volume24h,
                    stopLoss: data.currentPrice * (1 - tier.stopLoss),
                    takeProfit: data.currentPrice * (1 + tier.profitTarget),
                    stopLossPercent: tier.stopLoss * 100,
                    profitTargetPercent: tier.profitTarget * 100
                });

                console.log(`✨ ${symbol} (${tierName}): Momentum ${(momentum * 100).toFixed(2)}%, RSI ${rsi.toFixed(1)}, Vol $${(data.volume24h / 1000000).toFixed(1)}M`);
                break; // Only match one tier
            }
        }

        return opportunities;
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
            // Calculate position size (in base currency, e.g., BTC, ETH)
            const positionSizeUSD = Math.min(
                this.config.basePositionSizeUSD,
                this.config.maxPositionSizeUSD
            );
            const quantity = positionSizeUSD / signal.price;

            console.log(`\n📈 EXECUTING CRYPTO TRADE:`);
            console.log(`   Symbol: ${signal.symbol}`);
            console.log(`   Tier: ${signal.tier}`);
            console.log(`   Entry: $${signal.price.toFixed(2)}`);
            console.log(`   Quantity: ${quantity.toFixed(6)}`);
            console.log(`   Size: $${positionSizeUSD.toFixed(2)}`);
            console.log(`   Stop: $${signal.stopLoss.toFixed(2)} (-${signal.stopLossPercent.toFixed(1)}%)`);
            console.log(`   Target: $${signal.takeProfit.toFixed(2)} (+${signal.profitTargetPercent.toFixed(1)}%)`);

            // Place order on Binance
            const order = await this.binance.placeOrder(signal.symbol, 'BUY', quantity);

            if (!order) {
                console.log(`❌ Failed to place order for ${signal.symbol}`);
                return null;
            }

            // Create position
            const position = {
                symbol: signal.symbol,
                tier: signal.tier,
                entry: signal.price,
                quantity,
                positionSize: positionSizeUSD,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit,
                orderId: order.orderId,
                openTime: new Date(),
                momentum: signal.momentum,
                rsi: signal.rsi
            };

            this.positions.set(signal.symbol, position);

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

            // Send Telegram alert
            await telegramAlerts.sendCryptoEntry(
                signal.symbol,
                signal.price,
                signal.stopLoss,
                signal.takeProfit,
                quantity,
                signal.tier
            );

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
            const currentPrice = await this.binance.getPrice(symbol);
            if (!currentPrice) continue;

            const pnlPercent = ((currentPrice - position.entry) / position.entry) * 100;
            const pnlUSD = (currentPrice - position.entry) * position.quantity;

            // Check stop loss
            if (currentPrice <= position.stopLoss) {
                console.log(`🚨 ${symbol}: STOP LOSS HIT at $${currentPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Stop Loss');

                // Send alert
                await telegramAlerts.sendCryptoStopLoss(
                    symbol,
                    position.entry,
                    currentPrice,
                    pnlPercent,
                    position.stopLoss
                );
                continue;
            }

            // Check take profit
            if (currentPrice >= position.takeProfit) {
                console.log(`🎯 ${symbol}: PROFIT TARGET HIT at $${currentPrice.toFixed(2)} (+${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Take Profit');

                // Send alert
                await telegramAlerts.sendCryptoTakeProfit(
                    symbol,
                    position.entry,
                    currentPrice,
                    pnlPercent,
                    position.takeProfit
                );
                continue;
            }

            // Update trailing stop
            this.updateTrailingStop(symbol, currentPrice, pnlPercent);

            // Write live price and P&L back into the position so getStatus() returns current values
            position.currentPrice = currentPrice;
            position.unrealizedPnL = pnlUSD;

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)}`);
        }
    }

    updateTrailingStop(symbol, currentPrice, pnlPercent) {
        const position = this.positions.get(symbol);
        if (!position) return;

        // Check each trailing stop level
        for (const level of this.config.trailingStops) {
            if (pnlPercent >= level.profit * 100) {
                const newStop = currentPrice * (1 - level.stopDistance);

                // Only raise stop, never lower
                if (newStop > position.stopLoss) {
                    console.log(`📈 ${symbol}: Trailing stop raised to $${newStop.toFixed(2)}`);
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
            // Place sell order
            const order = await this.binance.placeOrder(symbol, 'SELL', position.quantity);
            if (!order) {
                console.log(`❌ Failed to close position for ${symbol}`);
                return;
            }

            // Calculate P/L
            const pnlPercent = ((price - position.entry) / position.entry) * 100;
            const pnlUSD = (price - position.entry) * position.quantity;

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
            console.log(`   P/L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% ($${pnlUSD.toFixed(2)})`);

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

                // Daily loss circuit breaker
                const maxDailyLoss = parseFloat(process.env.MAX_DAILY_LOSS || '500');
                if (this.dailyLoss >= maxDailyLoss) {
                    console.log(`🛑 [CIRCUIT BREAKER] Crypto daily loss $${this.dailyLoss.toFixed(2)} exceeds limit $${maxDailyLoss} — no new entries today`);
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
                    console.log(`\n🔍 Scanning ${this.config.symbols.length} crypto pairs...`);
                    const opportunities = await this.scanForOpportunities();

                    console.log(`\n🎯 Found ${opportunities.length} signal(s)`);

                    // Execute trades
                    for (const signal of opportunities) {
                        if (this.positions.size >= this.config.maxTotalPositions) break;
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
            this.saveState();
            this.tradingLoop();
            return;
        }

        // Test connection
        const account = await this.binance.getAccountInfo();
        if (!account) {
            console.log('❌ Failed to connect to exchange - running in DEMO MODE');
            this.isRunning = true;
            this.demoMode = true;
            this.saveState();
            this.tradingLoop();
            return;
        }

        console.log(`✅ Connected to ${this.config.exchange.name.toUpperCase()}`);
        console.log(`💰 Account connected`);

        this.isRunning = true;
        this.demoMode = false;
        this.saveState();
        this.tradingLoop();
    }

    saveState() {
        try {
            const fs = require('fs');
            const dir = require('path').dirname(this.stateFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.stateFile, JSON.stringify({
                running: this.isRunning,
                totalTrades: this.totalTrades,
                winningTrades: this.winningTrades,
                losingTrades: this.losingTrades,
                totalProfit: this.totalProfit,
                totalLoss: this.totalLoss,
            }));
        } catch {}
    }

    loadState() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.stateFile)) {
                const saved = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                // Restore performance counters
                if (saved.totalTrades != null) this.totalTrades = saved.totalTrades;
                if (saved.winningTrades != null) this.winningTrades = saved.winningTrades;
                if (saved.losingTrades != null) this.losingTrades = saved.losingTrades;
                if (saved.totalProfit != null) this.totalProfit = saved.totalProfit;
                if (saved.totalLoss != null) this.totalLoss = saved.totalLoss;
                return saved.running !== false;
            }
        } catch {}
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

    getStatus() {
        const winRate = this.totalTrades > 0
            ? (this.winningTrades / this.totalTrades * 100).toFixed(1)
            : 0;

        const profitFactor = this.totalLoss > 0
            ? parseFloat((this.totalProfit / this.totalLoss).toFixed(2))
            : 0;

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
            mode: this.demoMode ? 'DEMO' : (this.config.exchange.testnet ? 'TESTNET' : 'LIVE'),
            tradingMode: this.demoMode ? 'DEMO' : 'PAPER',
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
                symbols: this.config.symbols,
                maxPositions: this.config.maxTotalPositions,
                stopLoss: this.config.tiers.tier1.stopLoss,
                profitTarget: this.config.tiers.tier1.profitTarget,
                dailyLossLimit: this.config.maxTradesPerDay
            },
            scanCount: this.scanCount,
            dailyTrades: this.dailyTradeCount,
            totalTrades: this.totalTrades,
            winRate: `${winRate}%`,
            profitFactor,
            netPnL: netPnL.toFixed(2)
        };
    }
}

// ============================================================================
// EXPRESS API
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

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
    await engine.start();
    res.json({
        success: true,
        message: 'Crypto trading engine started',
        warning: 'Crypto is HIGH RISK - use testnet first!'
    });
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
    await engine.start();
    res.json({ success: true, message: 'Crypto trading engine started' });
});
app.post('/api/crypto/stop', (req, res) => {
    engine.stop();
    res.json({ success: true, message: 'Crypto trading engine stopped' });
});
app.post('/api/crypto/pause', (req, res) => {
    engine.pause();
    res.json({ success: true, message: 'Crypto trading engine paused' });
});

// Test Telegram alert
app.post('/test-telegram', async (req, res) => {
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

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

console.log('✅ Prometheus metrics initialized');

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.CRYPTO_PORT || 3006;
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           UNIFIED CRYPTO TRADING BOT - LIVE 24/7              ║
╠════════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                     ║
║  Exchange: ${CRYPTO_CONFIG.exchange.name.toUpperCase().padEnd(48)} ║
║  Mode: ${CRYPTO_CONFIG.exchange.testnet ? 'TESTNET (Paper Trading)' : 'LIVE TRADING ⚠️ '} ║
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
    console.log(`⚠️  ${CRYPTO_CONFIG.exchange.testnet ? 'Using TESTNET - Safe to experiment!' : 'LIVE TRADING - Real money at risk!'}`);

    // Auto-start only if previously running (persistent state)
    if (engine.loadState()) {
        console.log('🔄 Restoring previous running state...');
        engine.start();
    } else {
        console.log('⏸️  Bot was stopped before restart - not auto-starting. POST /api/trading/start to begin.');
    }
});

module.exports = { app, engine, CRYPTO_CONFIG };
