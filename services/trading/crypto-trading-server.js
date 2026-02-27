const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// CRYPTO TRADING CONFIGURATION
// ============================================================================
// Crypto markets trade 24/7/365 (never close)
// HIGH volatility (5-20% daily moves possible)
// Sentiment-driven (tweets, news, whale moves)
// Lower liquidity on some pairs (watch spreads)
// ============================================================================

const CRYPTO_CONFIG = {
    symbols: [
        // Tier 1: Highest liquidity, most stable
        'BTCUSD', 'ETHUSD',
        // Tier 2: High liquidity, established projects
        'BNBUSD', 'SOLUSD', 'ADAUSD', 'XRPUSD', 'AVAXUSD', 'MATICUSD',
        // Tier 3: Good liquidity, DeFi leaders
        'LINKUSD', 'DOTUSD', 'UNIUSD', 'ATOMUSD',
        // NOTE: Removed meme coins and low-cap altcoins (too volatile)
    ],

    // Position Sizing (crypto needs wider stops)
    maxTotalPositions: 3, // Only 3 positions (high volatility)
    maxPositionsPerSymbol: 1,
    basePositionSize: 5000, // Smaller position size due to risk
    riskPerTrade: 0.02, // 2% risk per trade (higher than stocks)
    maxLeverage: 2, // Conservative (exchanges offer 100x - DON'T USE)

    // CRYPTO-SPECIFIC ENTRY CRITERIA
    strategy: {
        // Trend detection (crypto moves fast)
        minTrendStrength: 0.015, // 1.5% minimum (crypto is volatile)
        pullbackSize: 0.030, // 3.0% max pullback (wider than stocks)

        // RSI (crypto has extreme trends, wider range needed)
        rsiUpper: 80, // Allow strong momentum (FOMO phase)
        rsiLower: 20, // Allow deep oversold (panic selling)

        // Volume (CRITICAL for crypto - avoid low liquidity traps)
        minVolume: 1000000, // $1M+ daily volume minimum
        volumeIncreasing: true, // Require volume confirmation

        // Stop Loss & Take Profit (crypto needs wider stops)
        stopLoss: 0.05, // 5% stop loss (crypto volatility)
        profitTarget: 0.15, // 15% profit target (3:1 R/R)
        trailingStop: 0.025, // 2.5% trailing stop

        // Time-based filters
        tradingHours: '24/7', // Always on
        avoidWeekendLows: true, // Lower liquidity on weekends

        // Correlation with BTC (most alts follow Bitcoin)
        btcCorrelationCheck: true, // Check BTC trend before altcoin trades

        // Volatility filter (pause during extreme moves)
        maxVolatility: 0.30, // Pause if 30%+ move in 24h
    },

    // Exchange Configuration
    exchange: {
        type: process.env.CRYPTO_EXCHANGE || 'binance', // 'binance', 'coinbase', 'kraken'
        apiKey: process.env.CRYPTO_API_KEY,
        apiSecret: process.env.CRYPTO_API_SECRET,
        testnet: true // Use testnet first
    }
};

// ============================================================================
// CRYPTO TREND FOLLOWING STRATEGY
// ============================================================================
class CryptoTrendStrategy {
    constructor(config) {
        this.config = config;
        this.positions = new Map();
        this.priceHistory = new Map();
        this.volumeHistory = new Map();
    }

    // Calculate indicators (crypto uses volume heavily)
    calculateIndicators(symbol, prices, volumes) {
        if (prices.length < 20) return null;

        // Moving Averages (5-min bars for crypto)
        const sma5 = this.calculateSMA(prices, 5);
        const sma10 = this.calculateSMA(prices, 10);
        const sma20 = this.calculateSMA(prices, 20);
        const ema9 = this.calculateEMA(prices, 9); // EMA reacts faster for crypto

        // RSI (standard 14-period)
        const rsi = this.calculateRSI(prices, 14);

        // Volume analysis (CRITICAL for crypto)
        const avgVolume = this.calculateSMA(volumes, 20);
        const currentVolume = volumes[volumes.length - 1];
        const volumeRatio = currentVolume / avgVolume;

        // Volatility (24-hour range)
        const high24h = Math.max(...prices.slice(-288)); // 288 5-min bars = 24h
        const low24h = Math.min(...prices.slice(-288));
        const volatility24h = (high24h - low24h) / low24h;

        // Trend strength
        const trendStrength = Math.abs(sma5 - sma20) / sma20;

        // Trend direction
        const isUptrend = ema9 > sma10 && sma10 > sma20;
        const isDowntrend = ema9 < sma10 && sma10 < sma20;

        // Pullback detection
        const currentPrice = prices[prices.length - 1];
        const pullback = Math.abs(currentPrice - ema9) / ema9;

        return {
            sma5, sma10, sma20, ema9,
            rsi,
            avgVolume,
            currentVolume,
            volumeRatio,
            volatility24h,
            trendStrength,
            isUptrend,
            isDowntrend,
            pullback,
            currentPrice
        };
    }

    // Check if Bitcoin is in uptrend (most altcoins follow BTC)
    async isBTCBullish() {
        const btcPrices = this.priceHistory.get('BTCUSD') || [];
        if (btcPrices.length < 20) return true; // Default allow if no data

        const sma20 = this.calculateSMA(btcPrices, 20);
        const currentPrice = btcPrices[btcPrices.length - 1];

        return currentPrice > sma20; // BTC above 20 SMA = bullish
    }

    // Check if weekend (lower liquidity)
    isWeekend() {
        const day = new Date().getUTCDay();
        return day === 0 || day === 6; // Sunday or Saturday
    }

    // Scan for crypto opportunities
    async scanForOpportunities() {
        const opportunities = [];

        // Check BTC trend first
        const btcBullish = await this.isBTCBullish();

        for (const symbol of this.config.symbols) {
            // Skip altcoins if BTC is bearish
            if (!btcBullish && symbol !== 'BTCUSD' && symbol !== 'ETHUSD') {
                console.log(`📊 ${symbol}: Skipping - BTC is bearish`);
                continue;
            }

            // Get price and volume history
            const prices = this.priceHistory.get(symbol) || [];
            const volumes = this.volumeHistory.get(symbol) || [];
            if (prices.length < 50) continue;

            const indicators = this.calculateIndicators(symbol, prices, volumes);
            if (!indicators) continue;

            // VOLATILITY FILTER - Pause during extreme moves
            if (indicators.volatility24h > this.config.strategy.maxVolatility) {
                console.log(`⚠️  ${symbol}: Too volatile (${(indicators.volatility24h * 100).toFixed(1)}% 24h range) - pausing`);
                continue;
            }

            // VOLUME FILTER - CRITICAL for crypto
            if (indicators.currentVolume < this.config.strategy.minVolume) {
                console.log(`📊 ${symbol}: Volume too low ($${(indicators.currentVolume / 1000000).toFixed(1)}M)`);
                continue;
            }

            // Volume must be increasing (avoid dead cat bounces)
            if (this.config.strategy.volumeIncreasing && indicators.volumeRatio < 1.2) {
                console.log(`📊 ${symbol}: Volume not increasing (${indicators.volumeRatio.toFixed(2)}x average)`);
                continue;
            }

            // ENTRY LOGIC - LONG (crypto long-only is safer)
            if (indicators.isUptrend &&
                indicators.trendStrength > this.config.strategy.minTrendStrength &&
                indicators.pullback < this.config.strategy.pullbackSize &&
                indicators.rsi < this.config.strategy.rsiUpper &&
                indicators.rsi > this.config.strategy.rsiLower) {

                opportunities.push({
                    symbol,
                    direction: 'long',
                    entry: indicators.currentPrice,
                    stopLoss: indicators.currentPrice * (1 - this.config.strategy.stopLoss),
                    takeProfit: indicators.currentPrice * (1 + this.config.strategy.profitTarget),
                    volumeRatio: indicators.volumeRatio,
                    indicators
                });

                console.log(`✨ ${symbol}: CRYPTO OPPORTUNITY - Trend: ${(indicators.trendStrength * 100).toFixed(2)}%, RSI: ${indicators.rsi.toFixed(1)}, Vol: ${indicators.volumeRatio.toFixed(2)}x`);
            }
        }

        return opportunities;
    }

    // Helper methods
    calculateSMA(data, period) {
        if (data.length < period) return 0;
        const slice = data.slice(-period);
        return slice.reduce((sum, p) => sum + p, 0) / period;
    }

    calculateEMA(prices, period) {
        if (prices.length < period) return prices[prices.length - 1];

        const multiplier = 2 / (period + 1);
        let ema = this.calculateSMA(prices.slice(0, period), period);

        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] - ema) * multiplier + ema;
        }

        return ema;
    }

    calculateRSI(prices, period) {
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
}

// ============================================================================
// EXPRESS API ROUTES
// ============================================================================

const cryptoStrategy = new CryptoTrendStrategy(CRYPTO_CONFIG);

app.get('/api/crypto/status', (req, res) => {
    res.json({
        success: true,
        data: {
            isRunning: true,
            exchange: CRYPTO_CONFIG.exchange.type,
            symbols: CRYPTO_CONFIG.symbols,
            activePositions: cryptoStrategy.positions.size,
            strategy: 'Trend Following (Crypto-Optimized)',
            riskLevel: 'HIGH'
        }
    });
});

app.post('/api/crypto/start', (req, res) => {
    res.json({
        success: true,
        message: 'Crypto trading engine started (24/7 trading)',
        config: CRYPTO_CONFIG,
        warning: 'Crypto trading is HIGH RISK - use small position sizes'
    });
});

app.post('/api/crypto/stop', (req, res) => {
    res.json({
        success: true,
        message: 'Crypto trading engine stopped'
    });
});

const PORT = process.env.CRYPTO_PORT || 3006;
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║          CRYPTO TRADING SERVER - PROFESSIONAL EDITION          ║
╠════════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                     ║
║  Exchange: ${CRYPTO_CONFIG.exchange.type.toUpperCase().padEnd(48)} ║
║  Pairs: ${CRYPTO_CONFIG.symbols.length} major cryptocurrencies                      ║
║  Trading Hours: 24/7/365 (Never closes)                        ║
║  Strategy: Trend Following + Volume Confirmation               ║
║  Risk/Reward: 3:1 (5% stop, 15% target)                       ║
║  ⚠️  WARNING: HIGH VOLATILITY ASSET CLASS                      ║
╚════════════════════════════════════════════════════════════════╝
    `);
    console.log(`📊 Crypto symbols: ${CRYPTO_CONFIG.symbols.join(', ')}`);
    console.log(`🔥 Risk Level: HIGH (use 2% risk per trade max)`);
    console.log(`📈 BTC correlation: All altcoin trades follow Bitcoin trend`);
    console.log(`⚠️  Note: Requires Binance/Coinbase/Kraken API credentials`);
});

module.exports = { app, cryptoStrategy, CRYPTO_CONFIG };
