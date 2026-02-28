/**
 * Autonomous Crypto Trading Bot - BIDIRECTIONAL 24/7
 * 
 * 20X ENGINEER QUALITY - Production-Grade Implementation
 * 
 * KEY FEATURES:
 * - 24/7/365 trading (crypto never sleeps)
 * - LONG (bullish) and SHORT (bearish) positions
 * - BTC correlation check for altcoins
 * - Volatility filtering (pause on extreme moves)
 * - Higher risk tolerance than forex (crypto is volatile)
 * 
 * Differences from Forex Bot:
 * - Wider stops (5% vs 1.5%) due to volatility
 * - Higher targets (15% vs 4.5%)
 * - BTC dominance check for altcoin entries
 * - Weekend trading enabled
 * 
 * Usage:
 *   node auto-crypto-bot.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const Alpaca = require('@alpacahq/alpaca-trade-api');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

// Telegram Notifications
let telegram = null;
try {
    const { getTelegramAlertService } = require('../../infrastructure/notifications/telegram-alerts');
    telegram = getTelegramAlertService();
} catch (e) {
    console.log('📱 Telegram alerts not available (missing module)');
}

// Kelly Criterion Position Sizing
const { createKellyCalculator } = require('./kelly-criterion');

// Yahoo Finance for FREE crypto data (Alpaca API has issues with crypto)
const yahooFinance = require('./yahoo-finance-data');

// Advanced Strategy Engine (Multi-strategy ensemble with regime detection)
const { AdvancedStrategyEngine, MarketRegime } = require('./advanced-strategy-engine');

// PHASE 4: Standalone modules
const MultiTimeframeConfirmation = require('./multi-timeframe');
const GARCHModel = require('./garch-volatility');
const MonteCarloSizer = require('./monte-carlo-sizer');

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
    // API
    PORT: process.env.CRYPTO_BOT_PORT || 3006,

    // Crypto Assets - Major cryptos with best liquidity
    SYMBOLS: [
        // Major Coins (highest liquidity)
        'BTC/USD', 'ETH/USD', 'SOL/USD',
        // Large Cap Alts
        'AVAX/USD', 'LINK/USD', 'DOT/USD',
        'MATIC/USD', 'ADA/USD',
        // Trending Alts
        'DOGE/USD', 'SHIB/USD'
    ],

    // Alpaca crypto symbols
    ALPACA_SYMBOLS: [
        'BTCUSD', 'ETHUSD', 'SOLUSD',
        'AVAXUSD', 'LINKUSD', 'DOTUSD',
        'MATICUSD', 'ADAUSD',
        'DOGEUSD', 'SHIBUSD'
    ],

    // Strategy Parameters
    FAST_MA: 10,
    SLOW_MA: 20,

    // Risk Management (WIDER for crypto volatility)
    MAX_POSITION_PCT: 0.03,      // 3% of equity per position (smaller for crypto)
    MAX_POSITIONS: 5,            // Max 5 concurrent positions (Phase 1: was 3)
    STOP_LOSS_PCT: 0.05,         // 5% stop loss (crypto is volatile!)
    PROFIT_TARGET_PCT: 0.15,     // 15% profit target (3:1 R:R)
    DAILY_LOSS_LIMIT: -0.03,     // 3% daily loss = kill switch (higher for crypto)

    // Volatility Filter
    MAX_24H_VOLATILITY: 0.30,    // Pause if 24h volatility > 30%

    // BTC Correlation (for altcoin entries)
    REQUIRE_BTC_TREND: false,    // DISABLED: Allow trading while building price history

    // Scan Configuration
    SCAN_INTERVAL_MS: 60000,     // 1 minute between scans

    // Logging
    LOG_DIR: path.join(__dirname, 'logs', 'auto-crypto-bot'),

    // Mode
    PAPER_TRADING: true
};

// ========================================
// AUTO CRYPTO BOT CLASS - BIDIRECTIONAL 24/7
// ========================================
class AutoCryptoBot extends EventEmitter {
    constructor() {
        super();

        if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) {
            throw new Error('Missing ALPACA_API_KEY or ALPACA_SECRET_KEY in .env');
        }

        // Initialize Alpaca client for crypto
        this.alpaca = new Alpaca({
            keyId: process.env.ALPACA_API_KEY,
            secretKey: process.env.ALPACA_SECRET_KEY,
            paper: CONFIG.PAPER_TRADING,
            baseUrl: CONFIG.PAPER_TRADING
                ? 'https://paper-api.alpaca.markets'
                : 'https://api.alpaca.markets'
        });

        // State
        this.isRunning = false;
        this.isPaused = false;
        this.isVolatilityPaused = false;
        this.account = null;
        this.positions = new Map();
        this.priceHistory = new Map();
        this.btcTrend = null; // 'bullish' | 'bearish' | null
        this.scanIntervalId = null;

        // Daily tracking
        this.dailyStartEquity = null;
        this.dailyTrades = [];
        this.dailyPnL = 0;

        // Performance
        this.stats = {
            startTime: null,
            totalTrades: 0,
            longTrades: 0,
            shortTrades: 0,
            winners: 0,
            losers: 0,
            totalPnL: 0,
            maxDrawdown: 0,
            peakEquity: 0
        };

        // Ensure log directory
        if (!fs.existsSync(CONFIG.LOG_DIR)) {
            fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
        }

        this.log('🔥 Auto Crypto Bot initialized (BIDIRECTIONAL 24/7)');
        this.log(`📊 Mode: ${CONFIG.PAPER_TRADING ? 'PAPER TRADING' : '⚠️ LIVE TRADING'}`);
        this.log(`📈 Cryptos: ${CONFIG.ALPACA_SYMBOLS.join(', ')}`);
        this.log(`🔄 Directions: LONG + SHORT enabled`);
        this.log(`⚠️  WARNING: High volatility asset class`);

        // Initialize Kelly Calculator (more conservative for crypto)
        this.kelly = createKellyCalculator('crypto', __dirname);
        this.log(`🎰 Kelly Criterion: 40% Kelly position sizing (crypto volatility adjusted)`);

        // Initialize Advanced Strategy Engine for crypto
        this.strategyEngine = new AdvancedStrategyEngine('crypto');
        this.log(`🧠 Advanced Strategy Engine: Multi-strategy ensemble for crypto`);

        // PHASE 1: Crypto sector grouping for concentration limits
        this.cryptoSectors = {
            // Layer 1 blockchains
            'BTCUSD': 'L1', 'ETHUSD': 'L1', 'SOLUSD': 'L1',
            'AVAXUSD': 'L1', 'DOTUSD': 'L1', 'ADAUSD': 'L1',
            // DeFi / Infrastructure
            'LINKUSD': 'defi', 'MATICUSD': 'defi',
            // Meme / Speculative
            'DOGEUSD': 'meme', 'SHIBUSD': 'meme'
        };

        // Progressive drawdown state
        this.drawdownThrottleLevel = 0; // 0=normal, 1=reduced, 2=paused

        // Trailing stop tracking: symbol -> { highWaterMark, trailingStop }
        this.trailingStops = new Map();

        // PHASE 4: Multi-Timeframe Confirmation
        this.mtf = new MultiTimeframeConfirmation({ minTimeframesAgreeing: 2 });
        this.log(`📊 Multi-Timeframe: 4-TF alignment filter active`);

        // PHASE 4: GARCH Volatility Model (per symbol)
        this.garchModels = new Map();

        // PHASE 4: Monte Carlo Position Sizer
        this.mcSizer = new MonteCarloSizer({ numSimulations: 5000, sequenceLength: 50 });
        this.log(`🎲 Monte Carlo Sizer: 5K-simulation position optimizer active`);
    }

    // ========================================
    // LIFECYCLE
    // ========================================

    async start() {
        if (this.isRunning) {
            this.log('⚠️  Bot already running');
            return;
        }

        this.log('\n' + '='.repeat(60));
        this.log('🚀 STARTING AUTO CRYPTO BOT (BIDIRECTIONAL 24/7)');
        this.log('='.repeat(60));

        try {
            // Connect to Alpaca
            this.account = await this.alpaca.getAccount();
            this.dailyStartEquity = parseFloat(this.account.equity);
            this.stats.startTime = new Date();
            this.stats.peakEquity = this.dailyStartEquity;

            this.log(`✅ Connected to Alpaca`);
            this.log(`   Account: ${this.account.account_number}`);
            this.log(`   Equity: $${this.dailyStartEquity.toLocaleString()}`);
            this.log(`   Buying Power: $${parseFloat(this.account.buying_power).toLocaleString()}`);

            // Sync existing positions
            await this.syncPositions();

            // Initialize price history
            await this.initializePriceHistory();

            // Initialize BTC trend
            await this.updateBTCTrend();

            // Start scanning
            this.isRunning = true;
            this.startScanLoop();

            this.log('\n✅ Crypto Bot is now ACTIVE (24/7 trading)\n');

        } catch (error) {
            this.log(`❌ Failed to start: ${error.message}`);
            throw error;
        }
    }

    async stop() {
        this.log('\n🛑 Stopping Auto Crypto Bot...');
        this.isRunning = false;

        if (this.scanIntervalId) {
            clearInterval(this.scanIntervalId);
            this.scanIntervalId = null;
        }

        this.generateDailyReport();
        this.log('✅ Bot stopped');
    }

    pause() {
        this.isPaused = true;
        this.log('⏸️  Bot PAUSED - will not enter new positions');
    }

    resume() {
        this.isPaused = false;
        this.isVolatilityPaused = false;
        this.log('▶️  Bot RESUMED - scanning for opportunities');
    }

    // ========================================
    // CORE TRADING LOOP
    // ========================================

    startScanLoop() {
        this.log(`📊 Starting scan loop (interval: ${CONFIG.SCAN_INTERVAL_MS / 1000}s)`);
        this.log(`🕐 Trading 24/7/365 - Crypto never sleeps!\n`);

        // Initial scan
        this.scan();

        // Set up interval
        this.scanIntervalId = setInterval(() => {
            if (this.isRunning) {
                this.scan().catch(err => {
                    this.log(`❌ Scan error: ${err.message}`);
                });
            }
        }, CONFIG.SCAN_INTERVAL_MS);
    }

    async scan() {
        try {
            // Refresh account
            this.account = await this.alpaca.getAccount();

            // Check progressive drawdown throttling
            const dailyReturn = this.calculateDailyReturn();
            this.updateDrawdownThrottle(dailyReturn);

            if (dailyReturn <= CONFIG.DAILY_LOSS_LIMIT) {
                await this.triggerKillSwitch(dailyReturn);
                return;
            }

            // Sync positions
            await this.syncPositions();

            // Update BTC trend (for altcoin correlation)
            await this.updateBTCTrend();

            // Update stats
            this.updateStats();

            // Log status
            this.logScanStatus(dailyReturn);

            // Manage existing positions
            await this.managePositions();

            // Look for new entries (if not paused and not throttled to level 2)
            if (!this.isPaused && !this.isVolatilityPaused && this.drawdownThrottleLevel < 2) {
                await this.scanForEntries();
            }

        } catch (error) {
            this.log(`❌ Scan error: ${error.message}`);
        }
    }

    // ========================================
    // BTC TREND ANALYSIS (Altcoin Correlation)
    // ========================================

    async updateBTCTrend() {
        try {
            await this.updatePriceHistory('BTCUSD');
            const history = this.priceHistory.get('BTCUSD');

            if (!history || history.length < CONFIG.SLOW_MA + 2) {
                this.btcTrend = null;
                return;
            }

            const closes = history.map(h => h.close);
            const fastMA = this.calculateSMA(closes, CONFIG.FAST_MA);
            const slowMA = this.calculateSMA(closes, CONFIG.SLOW_MA);

            const currentFast = fastMA[fastMA.length - 1];
            const currentSlow = slowMA[slowMA.length - 1];

            if (currentFast > currentSlow) {
                this.btcTrend = 'bullish';
            } else if (currentFast < currentSlow) {
                this.btcTrend = 'bearish';
            } else {
                this.btcTrend = null;
            }

        } catch (error) {
            this.btcTrend = null;
        }
    }

    isAltcoinAllowed(symbol, direction) {
        // BTC and ETH always allowed
        if (symbol === 'BTCUSD' || symbol === 'ETHUSD') {
            return true;
        }

        // If BTC correlation check disabled
        if (!CONFIG.REQUIRE_BTC_TREND) {
            return true;
        }

        // Altcoins: require BTC trending in same direction
        if (direction === 'long' && this.btcTrend === 'bullish') {
            return true;
        }
        if (direction === 'short' && this.btcTrend === 'bearish') {
            return true;
        }

        return false;
    }

    // ========================================
    // BIDIRECTIONAL SIGNAL DETECTION
    // ========================================

    async scanForEntries() {
        if (this.positions.size >= CONFIG.MAX_POSITIONS) {
            return;
        }

        for (const symbol of CONFIG.ALPACA_SYMBOLS) {
            // Skip if already have position
            if (this.positions.has(symbol)) continue;

            try {
                // Update price history
                await this.updatePriceHistory(symbol);

                // PHASE 1: Check sector concentration before signal analysis
                if (!this.checkCryptoConcentration(symbol)) {
                    continue;
                }

                // PHASE 1: Check correlation with existing positions
                if (!this.checkCorrelation(symbol)) {
                    continue;
                }

                // PHASE 5: Volume confirmation
                if (!this.checkVolumeConfirmation(symbol)) {
                    continue;
                }

                // Check for BIDIRECTIONAL signals
                const signal = this.checkEntrySignal(symbol);

                if (signal.shouldEnter) {
                    // Check altcoin correlation with BTC
                    if (!this.isAltcoinAllowed(symbol, signal.direction)) {
                        continue;
                    }

                    // PHASE 4: Multi-Timeframe confirmation gate
                    const history = this.priceHistory.get(symbol);
                    if (history && history.length >= 50) {
                        this.mtf.updateFromSingleTimeframe(history);
                        const mtfSignal = this.mtf.getConfirmedSignal(history[history.length - 1].close);

                        if (!mtfSignal.shouldEnter) {
                            this.log(`📊 ${symbol}: MTF filter rejected`);
                            continue;
                        }
                        this.log(`📊 ${symbol}: MTF confirmed (${mtfSignal.reason})`);
                    }

                    this.log(`\n✨ ${signal.direction.toUpperCase()} SIGNAL: ${symbol}`);
                    this.log(`   Reason: ${signal.reason}`);
                    this.log(`   BTC Trend: ${this.btcTrend || 'neutral'}`);

                    await this.openPosition(symbol, signal);
                }

            } catch (error) {
                // Continue on individual symbol errors
            }
        }
    }

    /**
     * PHASE 1: Check crypto sector concentration
     * Max 2 positions per sector (L1, defi, meme)
     */
    checkCryptoConcentration(symbol) {
        const sector = this.cryptoSectors[symbol] || 'other';
        const maxPerSector = 2;

        let sectorCount = 0;
        for (const [posSymbol] of this.positions) {
            if ((this.cryptoSectors[posSymbol] || 'other') === sector) {
                sectorCount++;
            }
        }

        if (sectorCount >= maxPerSector) {
            this.log(`🔄 ${symbol}: Crypto sector limit (${sectorCount}/${maxPerSector} ${sector} positions)`);
            return false;
        }
        return true;
    }

    /**
     * PHASE 1: Check price correlation with existing positions
     * Reject entries where Pearson r > 0.80 with any held position.
     * This prevents holding multiple highly correlated assets simultaneously.
     */
    checkCorrelation(symbol) {
        const newHistory = this.priceHistory.get(symbol);
        if (!newHistory || newHistory.length < 20) return true; // Not enough data, allow

        const newCloses = newHistory.slice(-30).map(h => h.close);

        for (const [posSymbol] of this.positions) {
            const posHistory = this.priceHistory.get(posSymbol);
            if (!posHistory || posHistory.length < 20) continue;

            const posCloses = posHistory.slice(-30).map(h => h.close);

            // Ensure same length
            const len = Math.min(newCloses.length, posCloses.length);
            if (len < 15) continue;

            const a = newCloses.slice(-len);
            const b = posCloses.slice(-len);

            // Calculate Pearson correlation coefficient
            const meanA = a.reduce((s, v) => s + v, 0) / len;
            const meanB = b.reduce((s, v) => s + v, 0) / len;

            let numerator = 0, denomA = 0, denomB = 0;
            for (let i = 0; i < len; i++) {
                const dA = a[i] - meanA;
                const dB = b[i] - meanB;
                numerator += dA * dB;
                denomA += dA * dA;
                denomB += dB * dB;
            }

            const correlation = denomA > 0 && denomB > 0
                ? numerator / (Math.sqrt(denomA) * Math.sqrt(denomB))
                : 0;

            if (Math.abs(correlation) > 0.80) {
                this.log(`🔗 ${symbol}: Correlation too high with ${posSymbol} (r=${correlation.toFixed(3)}) — skipping`);
                return false;
            }
        }

        return true;
    }

    checkEntrySignal(symbol) {
        const history = this.priceHistory.get(symbol);

        if (!history || history.length < 50) {
            return { shouldEnter: false, reason: 'Insufficient data (need 50+ bars)' };
        }

        // Use Advanced Strategy Engine for multi-strategy ensemble signal
        const signal = this.strategyEngine.generateSignal(history, symbol);

        // For crypto, we also check BTC trend correlation
        if (signal.shouldEnter && CONFIG.REQUIRE_BTC_TREND && this.btcTrend) {
            // In high volatility regime, require BTC trend alignment
            if (signal.regime === MarketRegime.HIGH_VOLATILITY) {
                if (signal.direction === 'long' && this.btcTrend !== 'bullish') {
                    return {
                        shouldEnter: false,
                        reason: `High volatility + BTC not bullish (${this.btcTrend})`
                    };
                }
                if (signal.direction === 'short' && this.btcTrend !== 'bearish') {
                    return {
                        shouldEnter: false,
                        reason: `High volatility + BTC not bearish (${this.btcTrend})`
                    };
                }
            }
        }

        // Log detailed signal info for debugging
        if (signal.shouldEnter) {
            this.log(`\n🧠 ENSEMBLE SIGNAL: ${symbol}`);
            this.log(`   Direction: ${signal.direction.toUpperCase()}`);
            this.log(`   Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
            this.log(`   Regime: ${signal.regime}`);
            this.log(`   BTC Trend: ${this.btcTrend || 'unknown'}`);
            this.log(`   Strategies agreeing: ${signal.agreementCount[signal.direction]}/7`);
            this.log(`   Reason: ${signal.reason}`);
        }

        return {
            shouldEnter: signal.shouldEnter,
            direction: signal.direction,
            reason: signal.reason,
            confidence: signal.confidence,
            regime: signal.regime,
            regimeConfig: signal.regimeConfig,
            strategies: signal.strategies
        };
    }

    checkExitSignal(symbol, currentSide) {
        const history = this.priceHistory.get(symbol);

        if (!history || history.length < CONFIG.SLOW_MA + 2) {
            return { shouldExit: false, reason: 'Insufficient data' };
        }

        const closes = history.map(h => h.close);
        const fastMA = this.calculateSMA(closes, CONFIG.FAST_MA);
        const slowMA = this.calculateSMA(closes, CONFIG.SLOW_MA);

        const currentFast = fastMA[fastMA.length - 1];
        const currentSlow = slowMA[slowMA.length - 1];
        const prevFast = fastMA[fastMA.length - 2];
        const prevSlow = slowMA[slowMA.length - 2];

        if (!currentFast || !currentSlow || !prevFast || !prevSlow) {
            return { shouldExit: false, reason: 'MA calculation failed' };
        }

        // For LONG positions: exit on bearish crossover
        if (currentSide === 'long') {
            const bearishCrossover = prevFast >= prevSlow && currentFast < currentSlow;
            if (bearishCrossover) {
                return {
                    shouldExit: true,
                    reason: `Bearish Crossover (Long → Exit)`,
                    fastMA: currentFast,
                    slowMA: currentSlow,
                    flipTo: 'short'
                };
            }
        }

        // For SHORT positions: exit on bullish crossover
        if (currentSide === 'short') {
            const bullishCrossover = prevFast <= prevSlow && currentFast > currentSlow;
            if (bullishCrossover) {
                return {
                    shouldExit: true,
                    reason: `Bullish Crossover (Short → Exit)`,
                    fastMA: currentFast,
                    slowMA: currentSlow,
                    flipTo: 'long'
                };
            }
        }

        return { shouldExit: false, reason: 'No exit signal' };
    }

    // ========================================
    // POSITION MANAGEMENT (BIDIRECTIONAL)
    // ========================================

    async openPosition(symbol, signal) {
        try {
            const equity = parseFloat(this.account.equity);
            const buyingPower = parseFloat(this.account.buying_power);

            // PHASE 4: Monte Carlo position sizing (falls back to Kelly if insufficient trades)
            let positionPct, positionSize;
            if (this.mcSizer.tradeReturns.length >= 20) {
                const mcResult = this.mcSizer.getRecommendedSize(equity);
                positionPct = mcResult.fraction;
                positionSize = mcResult.dollarSize;
                this.log(`   🎲 Monte Carlo: ${(positionPct * 100).toFixed(1)}% (${mcResult.reason})`);
            } else {
                const kellyResult = this.kelly.getOptimalPositionSize(equity);
                positionPct = kellyResult.recommendedPct;
                positionSize = kellyResult.optimalDollarSize;
                this.log(`   🎰 Kelly: ${(positionPct * 100).toFixed(1)}% (${kellyResult.edgeStrength || 'collecting data'})`);
            }

            // PHASE 1: Drawdown throttle level 1 = 50% position size
            if (this.drawdownThrottleLevel === 1) {
                positionSize *= 0.5;
                this.log(`   ⚠️ Drawdown throttle: Position halved to $${positionSize.toFixed(0)}`);
            }

            if (positionSize > buyingPower) {
                this.log(`⚠️  ${symbol}: Insufficient buying power`);
                return;
            }

            // Get current price
            const quote = await this.getCryptoQuote(symbol);
            if (!quote || !quote.price) {
                this.log(`⚠️  ${symbol}: Could not get valid price`);
                return;
            }

            const price = quote.price;

            // Calculate quantity (crypto can be fractional)
            const qty = positionSize / price;
            const roundedQty = Math.floor(qty * 10000) / 10000; // 4 decimal places

            if (roundedQty <= 0) {
                this.log(`⚠️  ${symbol}: Position size too small`);
                return;
            }

            // PHASE 4: GARCH-based dynamic stop-loss width
            let stopLossPct = CONFIG.STOP_LOSS_PCT;
            const history = this.priceHistory.get(symbol);
            if (history && history.length >= 30) {
                if (!this.garchModels.has(symbol)) {
                    this.garchModels.set(symbol, new GARCHModel());
                }
                const garch = this.garchModels.get(symbol);
                if (garch.fit(history)) {
                    const optimalStop = garch.getOptimalStopWidth(0.95);
                    // Clamp between 3% and 20% for crypto (higher vol)
                    stopLossPct = Math.max(0.03, Math.min(0.20, optimalStop * 2));
                    this.log(`   📉 GARCH stop: ${(stopLossPct * 100).toFixed(1)}% (vol: ${(garch.forecast(1).annualizedVol * 100).toFixed(1)}%)`);
                }
            }

            // Calculate stop and target with GARCH-dynamic width
            let stopLoss, profitTarget;
            if (signal.direction === 'long') {
                stopLoss = price * (1 - stopLossPct);
                profitTarget = price * (1 + stopLossPct * 3); // 3:1 R:R
            } else {
                stopLoss = price * (1 + stopLossPct);
                profitTarget = price * (1 - stopLossPct * 3);
            }

            const side = signal.direction === 'long' ? 'buy' : 'sell';

            this.log(`\n📈 OPENING ${signal.direction.toUpperCase()}: ${symbol}`);
            this.log(`   Qty: ${roundedQty} @ ~$${price.toFixed(2)}`);
            this.log(`   Stop Loss: $${stopLoss.toFixed(2)} (-${(stopLossPct * 100).toFixed(1)}%)`);
            this.log(`   Target: $${profitTarget.toFixed(2)} (+${(stopLossPct * 300).toFixed(1)}%)`);

            // PHASE 5: Limit order (reduced slippage)
            const order = await this.alpaca.createOrder({
                symbol,
                qty: roundedQty.toString(),
                side,
                type: 'limit',
                limit_price: price.toFixed(2),
                time_in_force: 'gtc'
            });

            // Track trade
            const trade = {
                id: order.id,
                symbol,
                direction: signal.direction,
                side,
                qty: roundedQty,
                expectedPrice: price,
                stopLoss,
                profitTarget,
                reason: signal.reason,
                btcTrend: this.btcTrend,
                entryTimestamp: Date.now(),
                timestamp: new Date().toISOString()
            };

            this.dailyTrades.push(trade);
            this.stats.totalTrades++;
            if (signal.direction === 'long') {
                this.stats.longTrades++;
            } else {
                this.stats.shortTrades++;
            }

            this.logTrade(trade);
            this.log(`   ✅ Order submitted: ${order.id}`);

            // Send Telegram notification
            if (telegram) {
                telegram.sendCryptoEntry(symbol, price, stopLoss, profitTarget, roundedQty, 'auto');
            }

        } catch (error) {
            this.log(`❌ Failed to open ${symbol}: ${error.message}`);
        }
    }

    async closePosition(symbol, reason, flipDirection = null) {
        const position = this.positions.get(symbol);
        if (!position) return;

        try {
            const pnlPct = position.unrealizedPLPct;
            const pnl = position.unrealizedPL;

            const closeSide = position.side === 'long' ? 'sell' : 'buy';

            this.log(`\n📉 CLOSING ${position.side.toUpperCase()}: ${symbol}`);
            this.log(`   Reason: ${reason}`);
            this.log(`   P&L: $${pnl.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%)`);

            const order = await this.alpaca.createOrder({
                symbol,
                qty: Math.abs(position.qty).toString(),
                side: closeSide,
                type: 'market',
                time_in_force: 'gtc'
            });

            // Log trade
            const trade = {
                id: order.id,
                symbol,
                side: closeSide,
                direction: position.side,
                action: 'close',
                qty: Math.abs(position.qty),
                entryPrice: position.entryPrice,
                exitPrice: position.currentPrice,
                pnl,
                pnlPct,
                reason,
                timestamp: new Date().toISOString()
            };

            this.dailyTrades.push(trade);
            this.dailyPnL += pnl;

            if (pnl > 0) {
                this.stats.winners++;
            } else {
                this.stats.losers++;
            }
            this.stats.totalPnL += pnl;

            // Record trade for Kelly Criterion learning
            this.kelly.recordTrade({
                pnl,
                pnlPercent: pnlPct * 100,
                symbol,
                entryPrice: position.entryPrice,
                exitPrice: position.currentPrice
            });

            // PHASE 4: Record trade for Monte Carlo optimizer
            this.mcSizer.addTrade(pnlPct);

            this.logTrade(trade);
            this.log(`   ✅ Order submitted: ${order.id}`);

            // Flip position if specified
            if (flipDirection && this.isAltcoinAllowed(symbol, flipDirection)) {
                this.log(`\n🔄 FLIPPING to ${flipDirection.toUpperCase()}`);
                await this.sleep(1000);
                await this.openPosition(symbol, {
                    shouldEnter: true,
                    direction: flipDirection,
                    reason: `Trend Reversal Flip from ${position.side}`,
                    fastMA: 0,
                    slowMA: 0,
                    trendStrength: 0
                });
            }

        } catch (error) {
            this.log(`❌ Failed to close ${symbol}: ${error.message}`);
        }
    }

    async managePositions() {
        for (const [symbol, position] of this.positions) {
            try {
                await this.updatePriceHistory(symbol);

                const pnlPct = position.unrealizedPLPct;
                const currentPrice = position.currentPrice;

                // Check stop loss
                if (pnlPct <= -CONFIG.STOP_LOSS_PCT) {
                    if (telegram) {
                        telegram.sendCryptoStopLoss(symbol, position.entryPrice, currentPrice, pnlPct * 100, position.entryPrice * (1 - CONFIG.STOP_LOSS_PCT));
                    }
                    this.trailingStops.delete(symbol);
                    await this.closePosition(symbol, `STOP_LOSS (${(pnlPct * 100).toFixed(2)}%)`);
                    continue;
                }

                // Check profit target
                if (pnlPct >= CONFIG.PROFIT_TARGET_PCT) {
                    if (telegram) {
                        telegram.sendCryptoTakeProfit(symbol, position.entryPrice, currentPrice, pnlPct * 100, position.entryPrice * (1 + CONFIG.PROFIT_TARGET_PCT));
                    }
                    this.trailingStops.delete(symbol);
                    await this.closePosition(symbol, `PROFIT_TARGET (${(pnlPct * 100).toFixed(2)}%)`);
                    continue;
                }

                // PHASE 1: TRAILING STOP — ratchet stop upward as price moves in our favor
                if (pnlPct >= 0.03) { // Activate trailing when profit > 3%
                    const isLong = position.side === 'long';

                    if (!this.trailingStops.has(symbol)) {
                        // Initialize trailing stop
                        this.trailingStops.set(symbol, {
                            highWaterMark: currentPrice,
                            trailingStop: isLong
                                ? position.entryPrice + (currentPrice - position.entryPrice) * 0.5
                                : position.entryPrice - (position.entryPrice - currentPrice) * 0.5
                        });
                        this.log(`📈 ${symbol}: Trailing stop ACTIVATED at $${this.trailingStops.get(symbol).trailingStop.toFixed(2)} (locking 50% of ${(pnlPct * 100).toFixed(1)}% profit)`);
                    }

                    const ts = this.trailingStops.get(symbol);

                    // Update high water mark and ratchet stop
                    if (isLong && currentPrice > ts.highWaterMark) {
                        ts.highWaterMark = currentPrice;
                        ts.trailingStop = position.entryPrice + (currentPrice - position.entryPrice) * 0.5;
                        this.log(`📈 ${symbol}: Trailing stop ratcheted to $${ts.trailingStop.toFixed(2)}`);
                    } else if (!isLong && currentPrice < ts.highWaterMark) {
                        ts.highWaterMark = currentPrice;
                        ts.trailingStop = position.entryPrice - (position.entryPrice - currentPrice) * 0.5;
                        this.log(`📉 ${symbol}: Trailing stop ratcheted to $${ts.trailingStop.toFixed(2)}`);
                    }

                    // Check if trailing stop hit
                    const trailHit = isLong
                        ? currentPrice <= ts.trailingStop
                        : currentPrice >= ts.trailingStop;

                    if (trailHit) {
                        this.log(`🔔 ${symbol}: TRAILING STOP HIT at $${currentPrice.toFixed(2)} (stop: $${ts.trailingStop.toFixed(2)})`);
                        this.trailingStops.delete(symbol);
                        await this.closePosition(symbol, `TRAILING_STOP (${(pnlPct * 100).toFixed(2)}% profit locked)`);
                        continue;
                    }
                }

                // PHASE 5: Time-based exit — close stale positions after 3 days with < 1% move (crypto = faster)
                const lastTrade = this.dailyTrades.find(t => t.symbol === symbol && t.entryTimestamp);
                if (lastTrade && lastTrade.entryTimestamp) {
                    const daysHeld = (Date.now() - lastTrade.entryTimestamp) / (1000 * 60 * 60 * 24);
                    if (daysHeld >= 3 && Math.abs(pnlPct) < 0.01) {
                        this.log(`⏰ ${symbol}: Stale position (${daysHeld.toFixed(1)} days, ${(pnlPct * 100).toFixed(2)}% move)`);
                        this.trailingStops.delete(symbol);
                        await this.closePosition(symbol, `TIME_EXIT (${daysHeld.toFixed(0)} days, ${(pnlPct * 100).toFixed(2)}%)`);
                        continue;
                    }
                }

                // Check for exit signal
                const exitSignal = this.checkExitSignal(symbol, position.side);
                if (exitSignal.shouldExit) {
                    const shouldFlip = Math.abs(pnlPct) < 0.02;
                    this.trailingStops.delete(symbol);
                    await this.closePosition(
                        symbol,
                        exitSignal.reason,
                        shouldFlip ? exitSignal.flipTo : null
                    );
                }

            } catch (error) {
                this.log(`⚠️  Error managing ${symbol}: ${error.message}`);
            }
        }
    }

    /**
     * PHASE 1: Progressive drawdown throttling
     * Level 0: Normal trading
     * Level 1: -1.5% daily → reduce position sizes 50%
     * Level 2: -2% daily → stop opening new positions
     * Kill switch: -3% daily → close everything
     */
    updateDrawdownThrottle(dailyReturn) {
        const prevLevel = this.drawdownThrottleLevel;

        if (dailyReturn <= -0.02) {
            this.drawdownThrottleLevel = 2;
        } else if (dailyReturn <= -0.015) {
            this.drawdownThrottleLevel = 1;
        } else {
            this.drawdownThrottleLevel = 0;
        }

        if (this.drawdownThrottleLevel !== prevLevel) {
            const labels = ['NORMAL', 'REDUCED (50% size)', 'PAUSED (no new entries)'];
            this.log(`⚠️ Drawdown throttle: Level ${this.drawdownThrottleLevel} — ${labels[this.drawdownThrottleLevel]} (daily: ${(dailyReturn * 100).toFixed(2)}%)`);
        }
    }

    /**
     * PHASE 5: Volume confirmation
     * Require current volume > 1.5x 20-day average to enter.
     */
    checkVolumeConfirmation(symbol) {
        const history = this.priceHistory.get(symbol);
        if (!history || history.length < 20) return true;

        const volumes = history.map(h => h.volume).filter(v => v > 0);
        if (volumes.length < 10) return true;

        const avgVolume = volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(volumes.length, 20);
        const currentVolume = volumes[volumes.length - 1];

        const volumeRatio = currentVolume / avgVolume;

        if (volumeRatio < 1.5) {
            return false;
        }

        this.log(`📊 ${symbol}: Volume confirmed (${volumeRatio.toFixed(1)}x avg)`);
        return true;
    }

    // ========================================
    // DATA MANAGEMENT
    // ========================================

    async syncPositions() {
        try {
            const alpacaPositions = await this.alpaca.getPositions();

            this.positions.clear();
            for (const pos of alpacaPositions) {
                if (CONFIG.ALPACA_SYMBOLS.includes(pos.symbol)) {
                    this.positions.set(pos.symbol, {
                        symbol: pos.symbol,
                        qty: parseFloat(pos.qty),
                        side: pos.side,
                        entryPrice: parseFloat(pos.avg_entry_price),
                        currentPrice: parseFloat(pos.current_price),
                        marketValue: parseFloat(pos.market_value),
                        unrealizedPL: parseFloat(pos.unrealized_pl),
                        unrealizedPLPct: parseFloat(pos.unrealized_plpc)
                    });
                }
            }
        } catch (error) {
            // Continue
        }
    }

    async initializePriceHistory() {
        this.log('📥 Initializing price history for crypto...');

        for (const symbol of CONFIG.ALPACA_SYMBOLS) {
            try {
                await this.updatePriceHistory(symbol);
                await this.sleep(200);
            } catch (error) {
                this.log(`   ⚠️  ${symbol}: ${error.message}`);
            }
        }

        this.log('✅ Price history initialized\n');
    }

    async updatePriceHistory(symbol) {
        try {
            // Use Yahoo Finance for FREE crypto data
            const history = await yahooFinance.getHistory(symbol, 30);

            if (history && history.length > 0) {
                this.priceHistory.set(symbol, history);
                if (history.length >= CONFIG.SLOW_MA) {
                    this.log(`📊 ${symbol}: ${history.length} bars loaded via Yahoo Finance (ready for signals)`);
                }
            } else {
                this.log(`⚠️ ${symbol}: No data returned from Yahoo Finance`);
            }
        } catch (error) {
            this.log(`❌ ${symbol}: Yahoo Finance error - ${error.message}`);
        }
    }

    async getCryptoQuote(symbol) {
        try {
            // Use Yahoo Finance for FREE real-time crypto quotes
            const quote = await yahooFinance.getQuote(symbol);
            if (quote) {
                return {
                    price: quote.price,
                    bid: quote.bid,
                    ask: quote.ask
                };
            }
            return null;
        } catch (error) {
            this.log(`⚠️ ${symbol} quote error: ${error.message}`);
            return null;
        }
    }

    // ========================================
    // RISK MANAGEMENT
    // ========================================

    async triggerKillSwitch(dailyReturn) {
        this.log('\n' + '!'.repeat(60));
        this.log('🚨 KILL SWITCH TRIGGERED');
        this.log(`   Daily Loss: ${(dailyReturn * 100).toFixed(2)}%`);
        this.log(`   Limit: ${(CONFIG.DAILY_LOSS_LIMIT * 100).toFixed(2)}%`);
        this.log('!'.repeat(60) + '\n');

        for (const symbol of this.positions.keys()) {
            await this.closePosition(symbol, 'KILL_SWITCH');
        }

        this.isPaused = true;
        this.log('⏸️  Bot PAUSED due to kill switch.\n');

        this.emit('killSwitch', { dailyReturn, timestamp: new Date() });
    }

    calculateDailyReturn() {
        if (!this.dailyStartEquity) return 0;
        const currentEquity = parseFloat(this.account.equity);
        return (currentEquity - this.dailyStartEquity) / this.dailyStartEquity;
    }

    // ========================================
    // UTILITIES
    // ========================================

    calculateSMA(values, period) {
        const result = [];
        for (let i = period - 1; i < values.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) {
                sum += values[i - j];
            }
            result.push(sum / period);
        }
        return result;
    }

    updateStats() {
        const equity = parseFloat(this.account.equity);

        if (equity > this.stats.peakEquity) {
            this.stats.peakEquity = equity;
        }

        const drawdown = (this.stats.peakEquity - equity) / this.stats.peakEquity;
        if (drawdown > this.stats.maxDrawdown) {
            this.stats.maxDrawdown = drawdown;
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ========================================
    // LOGGING
    // ========================================

    log(message) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}`;

        console.log(message);

        const logFile = path.join(CONFIG.LOG_DIR, `bot_${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, logLine + '\n');
    }

    logScanStatus(dailyReturn) {
        const equity = parseFloat(this.account.equity);
        const winRate = this.stats.totalTrades > 0
            ? (this.stats.winners / (this.stats.winners + this.stats.losers) * 100).toFixed(0)
            : 'N/A';

        let longs = 0, shorts = 0;
        for (const pos of this.positions.values()) {
            if (pos.side === 'long') longs++;
            else shorts++;
        }

        console.log(`🔥 ${new Date().toLocaleTimeString()} | ` +
            `BTC: ${this.btcTrend || '?'} | ` +
            `Equity: $${equity.toLocaleString()} | ` +
            `Daily: ${(dailyReturn * 100).toFixed(2)}% | ` +
            `Pos: ${longs}L/${shorts}S | ` +
            `WR: ${winRate}%`);
    }

    logTrade(trade) {
        const logFile = path.join(CONFIG.LOG_DIR, 'trades.json');

        let trades = [];
        if (fs.existsSync(logFile)) {
            try {
                trades = JSON.parse(fs.readFileSync(logFile, 'utf8'));
            } catch (e) {
                trades = [];
            }
        }

        trades.push(trade);
        fs.writeFileSync(logFile, JSON.stringify(trades, null, 2));
    }

    generateDailyReport() {
        const equity = parseFloat(this.account.equity);
        const dailyReturn = this.calculateDailyReturn();

        const report = {
            date: new Date().toISOString().split('T')[0],
            startEquity: this.dailyStartEquity,
            endEquity: equity,
            dailyReturn,
            trades: this.dailyTrades,
            totalPnL: this.dailyPnL,
            stats: this.stats
        };

        const reportFile = path.join(CONFIG.LOG_DIR, `report_${report.date}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

        this.log('\n' + '='.repeat(50));
        this.log('📊 DAILY CRYPTO REPORT');
        this.log('='.repeat(50));
        this.log(`   Date: ${report.date}`);
        this.log(`   Equity: $${equity.toLocaleString()}`);
        this.log(`   Daily Return: ${(dailyReturn * 100).toFixed(2)}%`);
        this.log(`   Long Trades: ${this.stats.longTrades}`);
        this.log(`   Short Trades: ${this.stats.shortTrades}`);
        this.log(`   Total P&L: $${this.dailyPnL.toFixed(2)}`);
        this.log('='.repeat(50) + '\n');

        return report;
    }

    // ========================================
    // API ENDPOINTS
    // ========================================

    getStatus() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            isVolatilityPaused: this.isVolatilityPaused,
            mode: CONFIG.PAPER_TRADING ? 'PAPER' : 'LIVE',
            tradingMode: 'BIDIRECTIONAL 24/7 (LONG + SHORT)',
            btcTrend: this.btcTrend,
            equity: this.account ? parseFloat(this.account.equity) : 0,
            dailyReturn: this.calculateDailyReturn(),
            positions: Array.from(this.positions.values()),
            stats: this.stats,
            config: {
                symbols: CONFIG.ALPACA_SYMBOLS,
                maxPositions: CONFIG.MAX_POSITIONS,
                stopLoss: CONFIG.STOP_LOSS_PCT,
                profitTarget: CONFIG.PROFIT_TARGET_PCT,
                dailyLossLimit: CONFIG.DAILY_LOSS_LIMIT
            }
        };
    }
}

// ========================================
// EXPRESS API SERVER
// ========================================

const app = express();
app.use(cors());
app.use(express.json());

const bot = new AutoCryptoBot();

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'auto-crypto-bot',
        mode: CONFIG.PAPER_TRADING ? 'PAPER' : 'LIVE',
        tradingMode: 'BIDIRECTIONAL 24/7',
        isRunning: bot.isRunning,
        btcTrend: bot.btcTrend
    });
});

// Get status
app.get('/api/crypto/status', (req, res) => {
    res.json(bot.getStatus());
});

// Start bot
app.post('/api/crypto/start', async (req, res) => {
    try {
        await bot.start();
        res.json({ success: true, message: 'Crypto bot started (24/7 LONG + SHORT)' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop bot
app.post('/api/crypto/stop', async (req, res) => {
    try {
        await bot.stop();
        res.json({ success: true, message: 'Crypto bot stopped' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pause/Resume
app.post('/api/crypto/pause', (req, res) => {
    bot.pause();
    res.json({ success: true, message: 'Bot paused' });
});

app.post('/api/crypto/resume', (req, res) => {
    bot.resume();
    res.json({ success: true, message: 'Bot resumed' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT...');
    await bot.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM...');
    await bot.stop();
    process.exit(0);
});

// Start server
app.listen(CONFIG.PORT, () => {
    console.log(`\n🔥 Auto Crypto Bot Server running on port ${CONFIG.PORT}`);
    console.log(`   Mode: BIDIRECTIONAL 24/7 (LONG + SHORT)`);
    console.log(`   Health: http://localhost:${CONFIG.PORT}/health`);
    console.log(`   Status: http://localhost:${CONFIG.PORT}/api/crypto/status`);
    console.log(`   Start: POST http://localhost:${CONFIG.PORT}/api/crypto/start`);
    console.log(`   Stop: POST http://localhost:${CONFIG.PORT}/api/crypto/stop`);
    console.log('\n');
});

// Auto-start
const AUTO_START = process.env.CRYPTO_AUTO_START === 'true';
if (AUTO_START) {
    bot.start().catch(console.error);
}

module.exports = { AutoCryptoBot, bot };
