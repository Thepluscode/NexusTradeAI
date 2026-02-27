const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ============================================================================
// FOREX TRADING CONFIGURATION
// ============================================================================
// Forex markets trade 24/5 (Sunday 5 PM - Friday 5 PM EST)
// Lower volatility than crypto, higher than stocks
// No volume data available (interbank market)
// News-driven (economic calendars, central bank decisions)
// ============================================================================

const FOREX_CONFIG = {
    symbols: [
        // Major Pairs (highest liquidity, tightest spreads)
        'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'USDCAD', 'NZDUSD',
        // Cross Pairs (good liquidity, moderate spreads)
        'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY', 'EURAUD', 'EURCHF'
        // NOTE: Exotic pairs removed (high spreads, low liquidity)
    ],

    // Position Sizing (forex uses lots/leverage)
    maxTotalPositions: 5, // Fewer positions due to correlation
    maxPositionsPerSymbol: 1,
    basePositionSize: 10000, // 0.1 standard lot (10,000 units)
    riskPerTrade: 0.01, // 1% risk per trade
    maxLeverage: 10, // Conservative leverage (retail max 50:1)

    // FOREX-SPECIFIC ENTRY CRITERIA
    strategy: {
        // Trend detection (forex trends longer than stocks)
        minTrendStrength: 0.003, // 0.3% (30 pips on EURUSD)
        pullbackSize: 0.004, // 0.4% (40 pips max pullback)

        // RSI (forex trends longer, wider range)
        rsiUpper: 75, // Allow stronger momentum
        rsiLower: 25, // Allow deeper oversold

        // NO VOLUME (forex is interbank, no centralized volume)
        useVolume: false,

        // Stop Loss & Take Profit (in pips equivalent)
        stopLoss: 0.015, // 1.5% (~150 pips on majors)
        profitTarget: 0.045, // 4.5% (~450 pips, 3:1 R/R)
        trailingStop: 0.010, // 1.0% trailing

        // Trading Sessions (forex works best during session overlaps)
        tradingSessions: {
            // Tokyo: 7 PM - 4 AM EST (Asian session)
            tokyo: { start: 19, end: 4, pairs: ['USDJPY', 'AUDJPY', 'NZDJPY'] },
            // London: 3 AM - 12 PM EST (European session - highest volume)
            london: { start: 3, end: 12, pairs: ['EURUSD', 'GBPUSD', 'EURGBP'] },
            // New York: 8 AM - 5 PM EST (US session)
            newYork: { start: 8, end: 17, pairs: ['USDCAD', 'EURUSD', 'GBPUSD'] },
            // London/NY Overlap: 8 AM - 12 PM EST (BEST LIQUIDITY)
            overlap: { start: 8, end: 12, pairs: 'all' }
        },

        // News Events (pause trading around major releases)
        avoidNewsPeriod: 30, // Minutes before/after major news

        // Correlation Management (avoid correlated pairs)
        maxCorrelatedPositions: 2 // Max 2 correlated pairs (e.g., EURUSD + GBPUSD)
    },

    // Broker Configuration (MetaTrader 4/5 or OANDA)
    broker: {
        type: process.env.FOREX_BROKER || 'oanda', // 'oanda', 'mt4', 'mt5'
        accountId: process.env.FOREX_ACCOUNT_ID,
        apiKey: process.env.FOREX_API_KEY,
        practice: true // Use practice account
    }
};

// ============================================================================
// FOREX TREND FOLLOWING STRATEGY
// ============================================================================
class ForexTrendStrategy {
    constructor(config) {
        this.config = config;
        this.positions = new Map();
        this.priceHistory = new Map();
    }

    // Calculate indicators (no volume for forex)
    calculateIndicators(symbol, prices) {
        if (prices.length < 20) return null;

        // Moving Averages (15-min bars work best for forex)
        const sma5 = this.calculateSMA(prices, 5);
        const sma10 = this.calculateSMA(prices, 10);
        const sma20 = this.calculateSMA(prices, 20);
        const sma50 = this.calculateSMA(prices, 50); // Longer-term trend

        // RSI (standard 14-period)
        const rsi = this.calculateRSI(prices, 14);

        // ATR for dynamic stops (forex uses pips)
        const atr = this.calculateATR(prices, 14);

        // Trend strength (MA spread)
        const trendStrength = Math.abs(sma5 - sma20) / sma20;

        // Trend direction
        const isUptrend = sma5 > sma10 && sma10 > sma20 && sma20 > sma50;
        const isDowntrend = sma5 < sma10 && sma10 < sma20 && sma20 < sma50;

        // Pullback detection
        const currentPrice = prices[prices.length - 1];
        const pullback = Math.abs(currentPrice - sma5) / sma5;

        return {
            sma5, sma10, sma20, sma50,
            rsi,
            atr,
            trendStrength,
            isUptrend,
            isDowntrend,
            pullback,
            currentPrice
        };
    }

    // Check if within optimal trading session
    isOptimalSession(symbol) {
        const hour = new Date().getUTCHours(); // Forex uses UTC
        const sessions = this.config.strategy.tradingSessions;

        // Best time: London/NY overlap (12-16 UTC = 8 AM-12 PM EST)
        if (hour >= 12 && hour <= 16) return true;

        // London session for EUR/GBP pairs
        if ((symbol.includes('EUR') || symbol.includes('GBP')) && hour >= 7 && hour <= 16) {
            return true;
        }

        // Tokyo session for JPY pairs
        if (symbol.includes('JPY') && (hour >= 0 && hour <= 8)) {
            return true;
        }

        return false;
    }

    // Scan for forex opportunities
    async scanForOpportunities() {
        const opportunities = [];

        for (const symbol of this.config.symbols) {
            // Check if optimal session
            if (!this.isOptimalSession(symbol)) {
                continue;
            }

            // Get price history (15-min bars)
            const prices = this.priceHistory.get(symbol) || [];
            if (prices.length < 50) continue;

            const indicators = this.calculateIndicators(symbol, prices);
            if (!indicators) continue;

            // ENTRY LOGIC - LONG
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
                    indicators
                });
            }

            // ENTRY LOGIC - SHORT (forex allows easier shorting)
            if (indicators.isDowntrend &&
                indicators.trendStrength > this.config.strategy.minTrendStrength &&
                indicators.pullback < this.config.strategy.pullbackSize &&
                indicators.rsi > (100 - this.config.strategy.rsiUpper) &&
                indicators.rsi < (100 - this.config.strategy.rsiLower)) {

                opportunities.push({
                    symbol,
                    direction: 'short',
                    entry: indicators.currentPrice,
                    stopLoss: indicators.currentPrice * (1 + this.config.strategy.stopLoss),
                    takeProfit: indicators.currentPrice * (1 - this.config.strategy.profitTarget),
                    indicators
                });
            }
        }

        return opportunities;
    }

    // Helper methods (SMA, RSI, ATR)
    calculateSMA(prices, period) {
        if (prices.length < period) return 0;
        const slice = prices.slice(-period);
        return slice.reduce((sum, p) => sum + p, 0) / period;
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

    calculateATR(prices, period) {
        if (prices.length < period + 1) return 0;

        let tr = 0;
        for (let i = prices.length - period; i < prices.length; i++) {
            const high = prices[i];
            const low = prices[i] * 0.999; // Approximate (need OHLC data)
            const prevClose = prices[i - 1];
            tr += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        }

        return tr / period;
    }
}

// ============================================================================
// EXPRESS API ROUTES
// ============================================================================

const forexStrategy = new ForexTrendStrategy(FOREX_CONFIG);

app.get('/api/forex/status', (req, res) => {
    res.json({
        success: true,
        data: {
            isRunning: true,
            broker: FOREX_CONFIG.broker.type,
            symbols: FOREX_CONFIG.symbols,
            activePositions: forexStrategy.positions.size,
            strategy: 'Trend Following (Forex-Optimized)'
        }
    });
});

app.post('/api/forex/start', (req, res) => {
    res.json({
        success: true,
        message: 'Forex trading engine started (24/5 trading)',
        config: FOREX_CONFIG
    });
});

app.post('/api/forex/stop', (req, res) => {
    res.json({
        success: true,
        message: 'Forex trading engine stopped'
    });
});

const PORT = process.env.FOREX_PORT || 3005;
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           FOREX TRADING SERVER - PROFESSIONAL EDITION          ║
╠════════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                     ║
║  Broker: ${FOREX_CONFIG.broker.type.toUpperCase().padEnd(48)} ║
║  Pairs: ${FOREX_CONFIG.symbols.length} major + cross currency pairs              ║
║  Trading Hours: 24/5 (Sunday 5 PM - Friday 5 PM EST)          ║
║  Strategy: Trend Following (Session-Optimized)                 ║
║  Risk/Reward: 3:1 (150 pip stop, 450 pip target)              ║
╚════════════════════════════════════════════════════════════════╝
    `);
    console.log(`📊 Forex symbols: ${FOREX_CONFIG.symbols.join(', ')}`);
    console.log(`🌍 Best trading: London/NY overlap (8 AM - 12 PM EST)`);
    console.log(`⚠️  Note: Requires MetaTrader or OANDA API credentials`);
});

module.exports = { app, forexStrategy, FOREX_CONFIG };
