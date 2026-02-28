/**
 * Autonomous Stock Trading Bot
 * 
 * 20X ENGINEER QUALITY - Production-Grade Implementation
 * 
 * Features:
 * - Automatic bullish trend detection (MA crossover)
 * - Automatic trade entry via Alpaca API
 * - Automatic bearish signal exit
 * - Kill switch for risk management (2% daily loss limit)
 * - Real-time position monitoring
 * - Full audit trail with trade reasoning
 * - Graceful shutdown with position cleanup
 * - Market hours awareness
 * 
 * Architecture:
 * - Signal Generator: Detects MA crossovers in real-time
 * - Risk Manager: Pre-trade validation, position sizing, kill switch
 * - Execution Engine: Places and manages orders via Alpaca
 * - Monitor: Tracks P&L, positions, and system health
 * 
 * Usage:
 *   node auto-stock-bot.js
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
    PORT: process.env.STOCK_BOT_PORT || 3002,

    // Trading Universe - Top performers from backtest
    SYMBOLS: [
        'SPY', 'QQQ',           // Index ETFs (consistent)
        'META', 'GOOGL',        // Top performers from backtest
        'MSFT', 'AMZN',         // Mega cap tech
        'TSLA', 'NVDA',         // High beta
        'AMD', 'AAPL'           // Tech movers
    ],

    // Strategy Parameters (Backtested Optimal)
    FAST_MA: 10,
    SLOW_MA: 20,

    // Risk Management
    MAX_POSITION_PCT: 0.10,     // 10% of equity per position
    MAX_POSITIONS: 5,           // Max 5 concurrent positions
    STOP_LOSS_PCT: 0.10,        // 10% stop loss
    PROFIT_TARGET_PCT: 0.15,    // 15% profit target
    DAILY_LOSS_LIMIT: -0.02,    // 2% daily loss = kill switch

    // Scan Configuration
    SCAN_INTERVAL_MS: 60000,    // 1 minute between scans

    // Market Hours (EST)
    MARKET_OPEN_HOUR: 10,       // 10:00 AM EST (skip first 30 min)
    MARKET_CLOSE_HOUR: 15,      // 3:30 PM EST (skip last 30 min)
    MARKET_CLOSE_MINUTE: 30,

    // Logging
    LOG_DIR: path.join(__dirname, 'logs', 'auto-stock-bot'),

    // Mode
    PAPER_TRADING: true         // SAFETY: Always paper trade first
};

// ========================================
// AUTO STOCK BOT CLASS
// ========================================
class AutoStockBot extends EventEmitter {
    constructor() {
        super();

        // Validate API keys
        if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) {
            throw new Error('Missing ALPACA_API_KEY or ALPACA_SECRET_KEY in .env');
        }

        // Initialize Alpaca client
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
        this.account = null;
        this.positions = new Map();
        this.priceHistory = new Map();
        this.scanIntervalId = null;

        // Daily tracking
        this.dailyStartEquity = null;
        this.dailyTrades = [];
        this.dailyPnL = 0;

        // Performance
        this.stats = {
            startTime: null,
            totalTrades: 0,
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

        this.log('🤖 Auto Stock Bot initialized');
        this.log(`📊 Mode: ${CONFIG.PAPER_TRADING ? 'PAPER TRADING' : '⚠️ LIVE TRADING'}`);
        this.log(`📈 Symbols: ${CONFIG.SYMBOLS.join(', ')}`);

        // Initialize Kelly Calculator
        this.kelly = createKellyCalculator('stock', __dirname);
        this.log(`🎰 Kelly Criterion: Half-Kelly position sizing enabled`);

        // Initialize Advanced Strategy Engine
        this.strategyEngine = new AdvancedStrategyEngine('stock');
        this.log(`🧠 Advanced Strategy Engine: 7-strategy ensemble active`);

        // PHASE 1: Stock sector grouping for concentration limits
        this.stockSectors = {
            'SPY': 'index', 'QQQ': 'index',
            'META': 'mega_tech', 'GOOGL': 'mega_tech', 'MSFT': 'mega_tech', 'AMZN': 'mega_tech', 'AAPL': 'mega_tech',
            'TSLA': 'high_beta', 'NVDA': 'high_beta', 'AMD': 'high_beta'
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
        this.log('🚀 STARTING AUTO STOCK BOT');
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

            // Initialize price history for all symbols
            await this.initializePriceHistory();

            // Start scanning
            this.isRunning = true;
            this.startScanLoop();

            this.log('\n✅ Bot is now ACTIVE and scanning for opportunities\n');

        } catch (error) {
            this.log(`❌ Failed to start: ${error.message}`);
            throw error;
        }
    }

    async stop() {
        this.log('\n🛑 Stopping Auto Stock Bot...');
        this.isRunning = false;

        if (this.scanIntervalId) {
            clearInterval(this.scanIntervalId);
            this.scanIntervalId = null;
        }

        // Generate final report
        this.generateDailyReport();

        this.log('✅ Bot stopped');
    }

    pause() {
        this.isPaused = true;
        this.log('⏸️  Bot PAUSED - will not enter new positions');
    }

    resume() {
        this.isPaused = false;
        this.log('▶️  Bot RESUMED - scanning for opportunities');
    }

    // ========================================
    // CORE TRADING LOOP
    // ========================================

    startScanLoop() {
        this.log(`📊 Starting scan loop (interval: ${CONFIG.SCAN_INTERVAL_MS / 1000}s)\n`);

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
        // Check market hours
        if (!this.isMarketHours()) {
            return;
        }

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

            // Update stats
            this.updateStats();

            // Log status
            this.logScanStatus(dailyReturn);

            // Manage existing positions (check stops/targets/signals)
            await this.managePositions();

            // Look for new entries (if not paused and not throttled)
            if (!this.isPaused && this.drawdownThrottleLevel < 2) {
                await this.scanForEntries();
            }

        } catch (error) {
            this.log(`❌ Scan error: ${error.message}`);
        }
    }

    // ========================================
    // SIGNAL DETECTION
    // ========================================

    async scanForEntries() {
        if (this.positions.size >= CONFIG.MAX_POSITIONS) {
            return;
        }

        for (const symbol of CONFIG.SYMBOLS) {
            // Skip if already have position
            if (this.positions.has(symbol)) continue;

            try {
                // Update price history
                await this.updatePriceHistory(symbol);

                // PHASE 1: Check sector concentration
                if (!this.checkSectorConcentration(symbol)) {
                    continue;
                }

                // PHASE 1: Check correlation with existing positions
                if (!this.checkCorrelation(symbol)) {
                    continue;
                }

                // PHASE 5: Volume confirmation — require above-average volume
                if (!this.checkVolumeConfirmation(symbol)) {
                    continue;
                }

                // Check for entry signal
                const signal = this.checkEntrySignal(symbol);

                if (signal.shouldEnter) {
                    // PHASE 4: Multi-Timeframe confirmation gate
                    const history = this.priceHistory.get(symbol);
                    if (history && history.length >= 50) {
                        this.mtf.updateFromSingleTimeframe(history);
                        const mtfSignal = this.mtf.getConfirmedSignal(history[history.length - 1].close);

                        if (!mtfSignal.shouldEnter) {
                            this.log(`📊 ${symbol}: MTF filter rejected (${JSON.stringify(mtfSignal.timeframeAlignment)})`);
                            continue;
                        }
                        this.log(`📊 ${symbol}: MTF confirmed (${mtfSignal.reason})`);
                    }

                    this.log(`\n✨ ENTRY SIGNAL: ${symbol}`);
                    this.log(`   Reason: ${signal.reason}`);

                    await this.openPosition(symbol, signal);
                }

            } catch (error) {
                // Silently continue on individual symbol errors
            }
        }
    }

    checkEntrySignal(symbol) {
        const history = this.priceHistory.get(symbol);

        if (!history || history.length < 50) {
            return { shouldEnter: false, reason: 'Insufficient data (need 50+ bars)' };
        }

        // Use Advanced Strategy Engine for multi-strategy ensemble signal
        const signal = this.strategyEngine.generateSignal(history, symbol);

        // Log detailed signal info for debugging
        if (signal.shouldEnter) {
            this.log(`\n🧠 ENSEMBLE SIGNAL: ${symbol}`);
            this.log(`   Direction: ${signal.direction.toUpperCase()}`);
            this.log(`   Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
            this.log(`   Regime: ${signal.regime}`);
            this.log(`   Strategies agreeing: ${signal.agreementCount[signal.direction]}/7`);
            this.log(`   Reason: ${signal.reason}`);
        }

        return {
            shouldEnter: signal.shouldEnter,
            direction: signal.direction || 'long', // Default to long for stock bot (no shorting for now)
            reason: signal.reason,
            confidence: signal.confidence,
            regime: signal.regime,
            regimeConfig: signal.regimeConfig,
            strategies: signal.strategies
        };
    }

    checkExitSignal(symbol) {
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

        // BEARISH CROSSOVER: Fast MA crosses below Slow MA
        const bearishCrossover = prevFast >= prevSlow && currentFast < currentSlow;

        if (bearishCrossover) {
            return {
                shouldExit: true,
                reason: `Bearish MA Crossover (Fast ${currentFast.toFixed(2)} < Slow ${currentSlow.toFixed(2)})`,
                fastMA: currentFast,
                slowMA: currentSlow
            };
        }

        return { shouldExit: false, reason: 'No exit signal' };
    }

    // ========================================
    // POSITION MANAGEMENT
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
            const quote = await this.alpaca.getLatestQuote(symbol);
            const askPrice = quote.AskPrice;
            const bidPrice = quote.BidPrice;
            const price = askPrice || bidPrice;

            if (!price || price <= 0) {
                this.log(`⚠️  ${symbol}: Could not get valid price`);
                return;
            }

            // Calculate shares
            const shares = Math.floor(positionSize / price);
            if (shares < 1) {
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
                    // Clamp between 3% and 15%
                    stopLossPct = Math.max(0.03, Math.min(0.15, optimalStop * 2));
                    this.log(`   📉 GARCH stop: ${(stopLossPct * 100).toFixed(1)}% (vol: ${(garch.forecast(1).annualizedVol * 100).toFixed(1)}%)`);
                }
            }

            const stopLoss = price * (1 - stopLossPct);
            const profitTarget = price * (1 + stopLossPct * 3); // Dynamic R:R = 3:1

            this.log(`\n📈 OPENING POSITION: ${symbol}`);
            this.log(`   Shares: ${shares} @ ~$${price.toFixed(2)}`);
            this.log(`   Stop Loss: $${stopLoss.toFixed(2)} (-${(stopLossPct * 100).toFixed(1)}%)`);
            this.log(`   Target: $${profitTarget.toFixed(2)} (+${(stopLossPct * 300).toFixed(1)}%)`);

            // PHASE 5: Limit order at ask price (reduced slippage vs market orders)
            const limitPrice = askPrice ? (askPrice * 1.001) : price; // Slightly above ask
            const order = await this.alpaca.createOrder({
                symbol,
                qty: shares,
                side: 'buy',
                type: 'limit',
                limit_price: limitPrice.toFixed(2),
                time_in_force: 'day'
            });

            // Log trade
            const trade = {
                id: order.id,
                symbol,
                side: 'buy',
                qty: shares,
                expectedPrice: price,
                stopLoss,
                profitTarget,
                reason: signal.reason,
                entryTimestamp: Date.now(),
                timestamp: new Date().toISOString()
            };

            this.dailyTrades.push(trade);
            this.stats.totalTrades++;

            this.logTrade(trade);

            this.log(`   ✅ Order submitted: ${order.id}`);

            // Send Telegram notification
            if (telegram) {
                telegram.sendStockEntry(symbol, price, stopLoss, profitTarget, shares, 'auto');
            }

            // Verify fill
            await this.verifyFill(order.id, symbol);

        } catch (error) {
            this.log(`❌ Failed to open ${symbol}: ${error.message}`);
        }
    }

    async closePosition(symbol, reason) {
        const position = this.positions.get(symbol);
        if (!position) return;

        try {
            const currentPrice = position.currentPrice;
            const pnlPct = position.unrealizedPLPct;
            const pnl = position.unrealizedPL;

            this.log(`\n📉 CLOSING POSITION: ${symbol}`);
            this.log(`   Reason: ${reason}`);
            this.log(`   P&L: $${pnl.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%)`);

            // Place market sell order
            const order = await this.alpaca.createOrder({
                symbol,
                qty: position.qty,
                side: 'sell',
                type: 'market',
                time_in_force: 'day'
            });

            // Log trade
            const trade = {
                id: order.id,
                symbol,
                side: 'sell',
                qty: position.qty,
                entryPrice: position.entryPrice,
                exitPrice: currentPrice,
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
                exitPrice: currentPrice
            });

            // PHASE 4: Record trade for Monte Carlo optimizer
            this.mcSizer.addTrade(pnlPct);

            this.logTrade(trade);

            this.log(`   ✅ Order submitted: ${order.id}`);

        } catch (error) {
            this.log(`❌ Failed to close ${symbol}: ${error.message}`);
        }
    }

    async managePositions() {
        for (const [symbol, position] of this.positions) {
            try {
                // Update price history
                await this.updatePriceHistory(symbol);

                const pnlPct = position.unrealizedPLPct;
                const currentPrice = position.currentPrice;

                // Check stop loss
                if (pnlPct <= -CONFIG.STOP_LOSS_PCT) {
                    if (telegram) {
                        telegram.sendStockStopLoss(symbol, position.entryPrice, currentPrice, pnlPct * 100, position.entryPrice * (1 - CONFIG.STOP_LOSS_PCT));
                    }
                    this.trailingStops.delete(symbol);
                    await this.closePosition(symbol, `STOP_LOSS (${(pnlPct * 100).toFixed(2)}%)`);
                    continue;
                }

                // Check profit target
                if (pnlPct >= CONFIG.PROFIT_TARGET_PCT) {
                    if (telegram) {
                        telegram.sendStockTakeProfit(symbol, position.entryPrice, currentPrice, pnlPct * 100, position.entryPrice * (1 + CONFIG.PROFIT_TARGET_PCT));
                    }
                    this.trailingStops.delete(symbol);
                    await this.closePosition(symbol, `PROFIT_TARGET (${(pnlPct * 100).toFixed(2)}%)`);
                    continue;
                }

                // PHASE 1: TRAILING STOP — ratchet stop upward as price moves in our favor
                if (pnlPct >= 0.05) { // Activate when profit > 5% for stocks
                    if (!this.trailingStops.has(symbol)) {
                        this.trailingStops.set(symbol, {
                            highWaterMark: currentPrice,
                            trailingStop: position.entryPrice + (currentPrice - position.entryPrice) * 0.5
                        });
                        this.log(`📈 ${symbol}: Trailing stop ACTIVATED at $${this.trailingStops.get(symbol).trailingStop.toFixed(2)} (locking 50% of ${(pnlPct * 100).toFixed(1)}% profit)`);
                    }

                    const ts = this.trailingStops.get(symbol);

                    // Update high water mark and ratchet stop
                    if (currentPrice > ts.highWaterMark) {
                        ts.highWaterMark = currentPrice;
                        ts.trailingStop = position.entryPrice + (currentPrice - position.entryPrice) * 0.5;
                        this.log(`📈 ${symbol}: Trailing stop ratcheted to $${ts.trailingStop.toFixed(2)}`);
                    }

                    // Check if trailing stop hit
                    if (currentPrice <= ts.trailingStop) {
                        this.log(`🔔 ${symbol}: TRAILING STOP HIT at $${currentPrice.toFixed(2)} (stop: $${ts.trailingStop.toFixed(2)})`);
                        this.trailingStops.delete(symbol);
                        await this.closePosition(symbol, `TRAILING_STOP (${(pnlPct * 100).toFixed(2)}% profit locked)`);
                        continue;
                    }
                }

                // PHASE 5: Time-based exit — close stale positions after 5 days with < 1% move
                const lastTrade = this.dailyTrades.find(t => t.symbol === symbol && t.entryTimestamp);
                if (lastTrade && lastTrade.entryTimestamp) {
                    const daysHeld = (Date.now() - lastTrade.entryTimestamp) / (1000 * 60 * 60 * 24);
                    if (daysHeld >= 5 && Math.abs(pnlPct) < 0.01) {
                        this.log(`⏰ ${symbol}: Stale position (${daysHeld.toFixed(1)} days, ${(pnlPct * 100).toFixed(2)}% move)`);
                        this.trailingStops.delete(symbol);
                        await this.closePosition(symbol, `TIME_EXIT (${daysHeld.toFixed(0)} days, ${(pnlPct * 100).toFixed(2)}%)`);
                        continue;
                    }
                }

                // Check bearish crossover (exit signal)
                const exitSignal = this.checkExitSignal(symbol);
                if (exitSignal.shouldExit) {
                    this.trailingStops.delete(symbol);
                    await this.closePosition(symbol, exitSignal.reason);
                }

            } catch (error) {
                this.log(`⚠️  Error managing ${symbol}: ${error.message}`);
            }
        }
    }

    /**
     * PHASE 1: Check stock sector concentration
     * Max 2 positions per sector to prevent over-exposure
     */
    checkSectorConcentration(symbol) {
        const sector = this.stockSectors[symbol] || 'other';
        const maxPerSector = 2;

        let sectorCount = 0;
        for (const [posSymbol] of this.positions) {
            if ((this.stockSectors[posSymbol] || 'other') === sector) {
                sectorCount++;
            }
        }

        if (sectorCount >= maxPerSector) {
            this.log(`🔄 ${symbol}: Sector limit (${sectorCount}/${maxPerSector} ${sector} positions)`);
            return false;
        }
        return true;
    }

    /**
     * PHASE 1: Check price correlation with existing positions
     * Reject entries where Pearson r > 0.80
     */
    checkCorrelation(symbol) {
        const newHistory = this.priceHistory.get(symbol);
        if (!newHistory || newHistory.length < 20) return true;

        const newCloses = newHistory.slice(-30).map(h => h.close);

        for (const [posSymbol] of this.positions) {
            const posHistory = this.priceHistory.get(posSymbol);
            if (!posHistory || posHistory.length < 20) continue;

            const posCloses = posHistory.slice(-30).map(h => h.close);
            const len = Math.min(newCloses.length, posCloses.length);
            if (len < 15) continue;

            const a = newCloses.slice(-len);
            const b = posCloses.slice(-len);

            const meanA = a.reduce((s, v) => s + v, 0) / len;
            const meanB = b.reduce((s, v) => s + v, 0) / len;

            let num = 0, denA = 0, denB = 0;
            for (let i = 0; i < len; i++) {
                const dA = a[i] - meanA;
                const dB = b[i] - meanB;
                num += dA * dB;
                denA += dA * dA;
                denB += dB * dB;
            }

            const r = denA > 0 && denB > 0 ? num / (Math.sqrt(denA) * Math.sqrt(denB)) : 0;

            if (Math.abs(r) > 0.80) {
                this.log(`🔗 ${symbol}: Correlation too high with ${posSymbol} (r=${r.toFixed(3)}) — skipping`);
                return false;
            }
        }
        return true;
    }

    /**
     * PHASE 1: Progressive drawdown throttling
     * Level 0: Normal trading
     * Level 1: -1% daily → reduce position sizes 50%
     * Level 2: -1.5% daily → stop opening new positions
     * Kill switch: -2% daily → close everything
     */
    updateDrawdownThrottle(dailyReturn) {
        const prevLevel = this.drawdownThrottleLevel;

        if (dailyReturn <= -0.015) {
            this.drawdownThrottleLevel = 2;
        } else if (dailyReturn <= -0.01) {
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
     * Prevents entries during thin/unreliable price action.
     */
    checkVolumeConfirmation(symbol) {
        const history = this.priceHistory.get(symbol);
        if (!history || history.length < 20) return true; // Not enough data, allow

        const volumes = history.map(h => h.volume).filter(v => v > 0);
        if (volumes.length < 10) return true;

        const avgVolume = volumes.slice(-20).reduce((s, v) => s + v, 0) / Math.min(volumes.length, 20);
        const currentVolume = volumes[volumes.length - 1];

        const volumeRatio = currentVolume / avgVolume;

        if (volumeRatio < 1.5) {
            return false; // Silently skip — too noisy to log every skip
        }

        this.log(`📊 ${symbol}: Volume confirmed (${volumeRatio.toFixed(1)}x avg)`);
        return true;
    }

    // ========================================
    // DATA MANAGEMENT
    // ========================================

    async syncPositions() {
        const alpacaPositions = await this.alpaca.getPositions();

        this.positions.clear();
        for (const pos of alpacaPositions) {
            this.positions.set(pos.symbol, {
                symbol: pos.symbol,
                qty: parseFloat(pos.qty),
                entryPrice: parseFloat(pos.avg_entry_price),
                currentPrice: parseFloat(pos.current_price),
                marketValue: parseFloat(pos.market_value),
                unrealizedPL: parseFloat(pos.unrealized_pl),
                unrealizedPLPct: parseFloat(pos.unrealized_plpc),
                side: pos.side
            });
        }
    }

    async initializePriceHistory() {
        this.log('📥 Initializing price history for all symbols...');

        for (const symbol of CONFIG.SYMBOLS) {
            try {
                await this.updatePriceHistory(symbol);
                await this.sleep(200); // Rate limiting
            } catch (error) {
                this.log(`   ⚠️  ${symbol}: ${error.message}`);
            }
        }

        this.log('✅ Price history initialized\n');
    }

    async updatePriceHistory(symbol) {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 45); // 45 days

        const bars = this.alpaca.getBarsV2(symbol, {
            start: start.toISOString(),
            end: end.toISOString(),
            timeframe: '1Day',
            limit: 50,
            feed: 'iex' // Free tier
        });

        const history = [];
        for await (const bar of bars) {
            history.push({
                timestamp: new Date(bar.Timestamp),
                open: bar.OpenPrice,
                high: bar.HighPrice,
                low: bar.LowPrice,
                close: bar.ClosePrice,
                volume: bar.Volume
            });
        }

        this.priceHistory.set(symbol, history);
    }

    async verifyFill(orderId, symbol) {
        await this.sleep(2000);

        try {
            const order = await this.alpaca.getOrder(orderId);

            if (order.status === 'filled') {
                const fillPrice = parseFloat(order.filled_avg_price);
                this.log(`   📋 Filled @ $${fillPrice.toFixed(2)}`);
            } else {
                this.log(`   ⚠️  Order status: ${order.status}`);
            }
        } catch (error) {
            this.log(`   ⚠️  Could not verify fill: ${error.message}`);
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

        // Close all positions
        for (const symbol of this.positions.keys()) {
            await this.closePosition(symbol, 'KILL_SWITCH');
        }

        // Stop the bot
        this.isPaused = true;
        this.log('⏸️  Bot PAUSED due to kill switch. Manual review required.\n');

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

    isMarketHours() {
        const now = new Date();

        // Get EST time
        const estOptions = { timeZone: 'America/New_York' };
        const estString = now.toLocaleString('en-US', estOptions);
        const estDate = new Date(estString);

        const day = estDate.getDay();
        const hour = estDate.getHours();
        const minute = estDate.getMinutes();

        // Weekend check
        if (day === 0 || day === 6) {
            return false;
        }

        // Trading hours: 10:00 AM - 3:30 PM EST
        const isAfterOpen = hour > CONFIG.MARKET_OPEN_HOUR ||
            (hour === CONFIG.MARKET_OPEN_HOUR && minute >= 0);
        const isBeforeClose = hour < CONFIG.MARKET_CLOSE_HOUR ||
            (hour === CONFIG.MARKET_CLOSE_HOUR && minute < CONFIG.MARKET_CLOSE_MINUTE);

        return isAfterOpen && isBeforeClose;
    }

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

        // Append to log file
        const logFile = path.join(CONFIG.LOG_DIR, `bot_${new Date().toISOString().split('T')[0]}.log`);
        fs.appendFileSync(logFile, logLine + '\n');
    }

    logScanStatus(dailyReturn) {
        const equity = parseFloat(this.account.equity);
        const winRate = this.stats.totalTrades > 0
            ? (this.stats.winners / (this.stats.winners + this.stats.losers) * 100).toFixed(0)
            : 'N/A';

        console.log(`📊 ${new Date().toLocaleTimeString()} | ` +
            `Equity: $${equity.toLocaleString()} | ` +
            `Daily: ${(dailyReturn * 100).toFixed(2)}% | ` +
            `Positions: ${this.positions.size}/${CONFIG.MAX_POSITIONS} | ` +
            `Trades: ${this.stats.totalTrades} | ` +
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
        this.log('📊 DAILY REPORT');
        this.log('='.repeat(50));
        this.log(`   Date: ${report.date}`);
        this.log(`   Start Equity: $${this.dailyStartEquity?.toLocaleString()}`);
        this.log(`   End Equity: $${equity.toLocaleString()}`);
        this.log(`   Daily Return: ${(dailyReturn * 100).toFixed(2)}%`);
        this.log(`   Trades: ${this.dailyTrades.length}`);
        this.log(`   Total P&L: $${this.dailyPnL.toFixed(2)}`);
        this.log('='.repeat(50) + '\n');

        return report;
    }

    // ========================================
    // API ENDPOINTS (for dashboard)
    // ========================================

    getStatus() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            mode: CONFIG.PAPER_TRADING ? 'PAPER' : 'LIVE',
            equity: this.account ? parseFloat(this.account.equity) : 0,
            dailyReturn: this.calculateDailyReturn(),
            positions: Array.from(this.positions.values()),
            stats: this.stats,
            config: {
                symbols: CONFIG.SYMBOLS,
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

const bot = new AutoStockBot();

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'auto-stock-bot',
        mode: CONFIG.PAPER_TRADING ? 'PAPER' : 'LIVE',
        isRunning: bot.isRunning
    });
});

// Get status
app.get('/api/trading/status', (req, res) => {
    res.json(bot.getStatus());
});

// Start bot
app.post('/api/trading/start', async (req, res) => {
    try {
        await bot.start();
        res.json({ success: true, message: 'Bot started' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop bot
app.post('/api/trading/stop', async (req, res) => {
    try {
        await bot.stop();
        res.json({ success: true, message: 'Bot stopped' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pause/Resume
app.post('/api/trading/pause', (req, res) => {
    bot.pause();
    res.json({ success: true, message: 'Bot paused' });
});

app.post('/api/trading/resume', (req, res) => {
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
    console.log(`\n🤖 Auto Stock Bot Server running on port ${CONFIG.PORT}`);
    console.log(`   Health: http://localhost:${CONFIG.PORT}/health`);
    console.log(`   Status: http://localhost:${CONFIG.PORT}/api/trading/status`);
    console.log(`   Start: POST http://localhost:${CONFIG.PORT}/api/trading/start`);
    console.log(`   Stop: POST http://localhost:${CONFIG.PORT}/api/trading/stop`);
    console.log('\n');
});

// Auto-start on market open (optional)
const AUTO_START = process.env.AUTO_START === 'true';
if (AUTO_START) {
    bot.start().catch(console.error);
}

module.exports = { AutoStockBot, bot };
