/**
 * Autonomous Forex Trading Bot - BIDIRECTIONAL
 * 
 * 20X ENGINEER QUALITY - Production-Grade Implementation
 * 
 * KEY DIFFERENCE FROM STOCK BOT:
 * - Can go LONG (bullish) AND SHORT (bearish)
 * - 24/5 trading (no market hour restrictions)
 * - Session-aware (London/NY overlap optimization)
 * - Uses Alpaca or OANDA for execution
 * 
 * Features:
 * - Automatic bullish trend detection → LONG entry
 * - Automatic bearish trend detection → SHORT entry
 * - Automatic reversal detection → position flip
 * - Kill switch for risk management (2% daily loss limit)
 * - Real-time position monitoring
 * - Full audit trail with trade reasoning
 * - Session optimization (best during London/NY overlap)
 * 
 * Usage:
 *   node auto-forex-bot.js
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

// Yahoo Finance for FREE forex data (since Alpaca requires paid subscription)
const yahooFinance = require('./yahoo-finance-data');

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
    // API
    PORT: process.env.FOREX_BOT_PORT || 3005,

    // Forex Pairs - Major pairs with best liquidity
    SYMBOLS: [
        // Major Pairs (highest liquidity)
        'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF',
        'AUD/USD', 'USD/CAD', 'NZD/USD',
        // Cross Pairs (good liquidity)
        'EUR/GBP', 'EUR/JPY', 'GBP/JPY'
    ],

    // Alpaca forex symbols (different format)
    ALPACA_SYMBOLS: [
        'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF',
        'AUDUSD', 'USDCAD', 'NZDUSD',
        'EURGBP', 'EURJPY', 'GBPJPY'
    ],

    // Strategy Parameters
    FAST_MA: 10,
    SLOW_MA: 20,

    // Risk Management (BIDIRECTIONAL)
    MAX_POSITION_PCT: 0.05,      // 5% of equity per position (lower for forex)
    MAX_POSITIONS: 3,            // Max 3 concurrent positions
    STOP_LOSS_PCT: 0.015,        // 1.5% stop loss (forex moves less)
    PROFIT_TARGET_PCT: 0.045,    // 4.5% profit target (3:1 R:R)
    DAILY_LOSS_LIMIT: -0.02,     // 2% daily loss = kill switch

    // Leverage (conservative)
    MAX_LEVERAGE: 10,

    // Scan Configuration
    SCAN_INTERVAL_MS: 60000,     // 1 minute between scans

    // Session Optimization (EST hours)
    SESSIONS: {
        LONDON: { start: 3, end: 12, pairs: ['EUR', 'GBP', 'CHF'] },
        NEW_YORK: { start: 8, end: 17, pairs: ['USD', 'CAD'] },
        TOKYO: { start: 19, end: 4, pairs: ['JPY', 'AUD', 'NZD'] },
        OVERLAP: { start: 8, end: 12, best: true } // London/NY overlap = BEST
    },

    // Logging
    LOG_DIR: path.join(__dirname, 'logs', 'auto-forex-bot'),

    // Mode
    PAPER_TRADING: true
};

// ========================================
// AUTO FOREX BOT CLASS - BIDIRECTIONAL
// ========================================
class AutoForexBot extends EventEmitter {
    constructor() {
        super();

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
        this.positions = new Map(); // symbol -> { side: 'long'|'short', qty, entryPrice }
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

        this.log('🌍 Auto Forex Bot initialized (BIDIRECTIONAL)');
        this.log(`📊 Mode: ${CONFIG.PAPER_TRADING ? 'PAPER TRADING' : '⚠️ LIVE TRADING'}`);
        this.log(`📈 Pairs: ${CONFIG.ALPACA_SYMBOLS.join(', ')}`);
        this.log(`🔄 Directions: LONG + SHORT enabled`);

        // Initialize Kelly Calculator
        this.kelly = createKellyCalculator('forex', __dirname);
        this.log(`🎰 Kelly Criterion: Half-Kelly position sizing enabled`);
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
        this.log('🚀 STARTING AUTO FOREX BOT (BIDIRECTIONAL)');
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

            // Start scanning
            this.isRunning = true;
            this.startScanLoop();

            this.log('\n✅ Forex Bot is now ACTIVE (24/5 trading)\n');

        } catch (error) {
            this.log(`❌ Failed to start: ${error.message}`);
            throw error;
        }
    }

    async stop() {
        this.log('\n🛑 Stopping Auto Forex Bot...');
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
        this.log('▶️  Bot RESUMED - scanning for opportunities');
    }

    // ========================================
    // CORE TRADING LOOP
    // ========================================

    startScanLoop() {
        this.log(`📊 Starting scan loop (interval: ${CONFIG.SCAN_INTERVAL_MS / 1000}s)`);
        this.log(`🕐 Trading 24/5 - Best during London/NY overlap (8 AM - 12 PM EST)\n`);

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
        // Check if forex market is open (24/5)
        if (!this.isForexMarketOpen()) {
            return;
        }

        try {
            // Refresh account
            this.account = await this.alpaca.getAccount();

            // Check kill switch
            const dailyReturn = this.calculateDailyReturn();
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

            // Manage existing positions
            await this.managePositions();

            // Look for new entries (if not paused)
            if (!this.isPaused) {
                await this.scanForEntries();
            }

        } catch (error) {
            this.log(`❌ Scan error: ${error.message}`);
        }
    }

    // ========================================
    // BIDIRECTIONAL SIGNAL DETECTION
    // ========================================

    async scanForEntries() {
        if (this.positions.size >= CONFIG.MAX_POSITIONS) {
            return;
        }

        // Get current session for pair optimization
        const session = this.getCurrentSession();

        for (const symbol of CONFIG.ALPACA_SYMBOLS) {
            // Skip if already have position in this pair
            if (this.positions.has(symbol)) continue;

            // Prioritize pairs for current session
            const isPairOptimal = this.isPairOptimalForSession(symbol, session);
            if (!isPairOptimal && this.positions.size > 0) {
                continue; // Skip non-optimal pairs if we have positions
            }

            try {
                // Update price history
                await this.updatePriceHistory(symbol);

                // Check for BIDIRECTIONAL signals
                const signal = this.checkEntrySignal(symbol);

                if (signal.shouldEnter) {
                    this.log(`\n✨ ${signal.direction.toUpperCase()} SIGNAL: ${symbol}`);
                    this.log(`   Reason: ${signal.reason}`);
                    this.log(`   Fast MA: ${signal.fastMA.toFixed(5)} | Slow MA: ${signal.slowMA.toFixed(5)}`);
                    this.log(`   Session: ${session} ${isPairOptimal ? '(OPTIMAL)' : ''}`);

                    await this.openPosition(symbol, signal);
                }

            } catch (error) {
                // Continue on individual pair errors
            }
        }
    }

    checkEntrySignal(symbol) {
        const history = this.priceHistory.get(symbol);

        if (!history || history.length < CONFIG.SLOW_MA + 2) {
            return { shouldEnter: false, reason: 'Insufficient data' };
        }

        // Calculate MAs
        const closes = history.map(h => h.close);
        const fastMA = this.calculateSMA(closes, CONFIG.FAST_MA);
        const slowMA = this.calculateSMA(closes, CONFIG.SLOW_MA);

        const currentFast = fastMA[fastMA.length - 1];
        const currentSlow = slowMA[slowMA.length - 1];
        const prevFast = fastMA[fastMA.length - 2];
        const prevSlow = slowMA[slowMA.length - 2];

        if (!currentFast || !currentSlow || !prevFast || !prevSlow) {
            return { shouldEnter: false, reason: 'MA calculation failed' };
        }

        // Calculate trend strength
        const trendStrength = Math.abs(currentFast - currentSlow) / currentSlow;
        const minStrength = 0.0002; // 0.02% minimum spread for forex (loosened)

        // ===== BULLISH CROSSOVER (LONG) =====
        const bullishCrossover = prevFast <= prevSlow && currentFast > currentSlow;
        if (bullishCrossover && trendStrength > minStrength) {
            return {
                shouldEnter: true,
                direction: 'long',
                reason: `Bullish MA Crossover (Fast ${currentFast.toFixed(5)} > Slow ${currentSlow.toFixed(5)})`,
                fastMA: currentFast,
                slowMA: currentSlow,
                trendStrength
            };
        }

        // ===== BULLISH TREND CONTINUATION (LONG) =====
        // Enter on strong existing uptrend, not just crossover
        const strongUptrend = currentFast > currentSlow && trendStrength > 0.001; // 0.1% spread
        const gettingStronger = currentFast - currentSlow > prevFast - prevSlow;
        if (strongUptrend && gettingStronger) {
            return {
                shouldEnter: true,
                direction: 'long',
                reason: `Bullish Trend Acceleration (strength: ${(trendStrength * 100).toFixed(3)}%)`,
                fastMA: currentFast,
                slowMA: currentSlow,
                trendStrength
            };
        }

        // ===== BEARISH CROSSOVER (SHORT) =====
        const bearishCrossover = prevFast >= prevSlow && currentFast < currentSlow;
        if (bearishCrossover && trendStrength > minStrength) {
            return {
                shouldEnter: true,
                direction: 'short',
                reason: `Bearish MA Crossover (Fast ${currentFast.toFixed(5)} < Slow ${currentSlow.toFixed(5)})`,
                fastMA: currentFast,
                slowMA: currentSlow,
                trendStrength
            };
        }

        // ===== BEARISH TREND CONTINUATION (SHORT) =====
        const strongDowntrend = currentFast < currentSlow && trendStrength > 0.001;
        const gettingWeaker = currentSlow - currentFast > prevSlow - prevFast;
        if (strongDowntrend && gettingWeaker) {
            return {
                shouldEnter: true,
                direction: 'short',
                reason: `Bearish Trend Acceleration (strength: ${(trendStrength * 100).toFixed(3)}%)`,
                fastMA: currentFast,
                slowMA: currentSlow,
                trendStrength
            };
        }

        return { shouldEnter: false, reason: 'No signal' };
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
                    flipTo: 'short' // Can flip to short
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
                    flipTo: 'long' // Can flip to long
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

            // Get Kelly-optimized position size
            const kellyResult = this.kelly.getOptimalPositionSize(equity);
            const positionPct = kellyResult.recommendedPct;
            const positionSize = kellyResult.optimalDollarSize;

            this.log(`   🎰 Kelly: ${(positionPct * 100).toFixed(1)}% (${kellyResult.edgeStrength || 'collecting data'})`);

            if (positionSize > buyingPower) {
                this.log(`⚠️  ${symbol}: Insufficient buying power`);
                return;
            }

            // Get current price
            const quote = await this.getForexQuote(symbol);
            if (!quote || !quote.price) {
                this.log(`⚠️  ${symbol}: Could not get valid price`);
                return;
            }

            const price = quote.price;

            // Calculate position size (forex uses units, not shares)
            const units = Math.floor(positionSize / price);
            if (units < 100) {
                this.log(`⚠️  ${symbol}: Position size too small`);
                return;
            }

            // Calculate stop and target based on direction
            let stopLoss, profitTarget;
            if (signal.direction === 'long') {
                stopLoss = price * (1 - CONFIG.STOP_LOSS_PCT);
                profitTarget = price * (1 + CONFIG.PROFIT_TARGET_PCT);
            } else { // short
                stopLoss = price * (1 + CONFIG.STOP_LOSS_PCT);
                profitTarget = price * (1 - CONFIG.PROFIT_TARGET_PCT);
            }

            const side = signal.direction === 'long' ? 'buy' : 'sell';

            this.log(`\n📈 OPENING ${signal.direction.toUpperCase()}: ${symbol}`);
            this.log(`   Units: ${units} @ ~${price.toFixed(5)}`);
            this.log(`   Stop Loss: ${stopLoss.toFixed(5)}`);
            this.log(`   Target: ${profitTarget.toFixed(5)}`);

            // Place order
            const order = await this.alpaca.createOrder({
                symbol,
                qty: units,
                side,
                type: 'market',
                time_in_force: 'gtc' // Good till cancelled for forex
            });

            // Track position
            const trade = {
                id: order.id,
                symbol,
                direction: signal.direction,
                side,
                qty: units,
                expectedPrice: price,
                stopLoss,
                profitTarget,
                reason: signal.reason,
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
                telegram.sendForexEntry(symbol, signal.direction, price, stopLoss, profitTarget, units, 'auto');
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

            // Close existing position
            const closeSide = position.side === 'long' ? 'sell' : 'buy';

            this.log(`\n📉 CLOSING ${position.side.toUpperCase()}: ${symbol}`);
            this.log(`   Reason: ${reason}`);
            this.log(`   P&L: $${pnl.toFixed(2)} (${(pnlPct * 100).toFixed(2)}%)`);

            const order = await this.alpaca.createOrder({
                symbol,
                qty: Math.abs(position.qty),
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

            this.logTrade(trade);

            this.log(`   ✅ Order submitted: ${order.id}`);

            // Flip position if specified (trend reversal)
            if (flipDirection) {
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
                // Update price history
                await this.updatePriceHistory(symbol);

                const pnlPct = position.unrealizedPLPct;
                const isLong = position.side === 'long';

                // Check stop loss (works for both directions)
                if (pnlPct <= -CONFIG.STOP_LOSS_PCT) {
                    // Send Telegram notification
                    if (telegram) {
                        telegram.sendForexStopLoss(symbol, position.entryPrice, `Loss: ${(pnlPct * 100).toFixed(2)}%`);
                    }
                    await this.closePosition(symbol, `STOP_LOSS (${(pnlPct * 100).toFixed(2)}%)`);
                    continue;
                }

                // Check profit target
                if (pnlPct >= CONFIG.PROFIT_TARGET_PCT) {
                    // Send Telegram notification
                    if (telegram) {
                        telegram.sendForexTakeProfit(symbol, position.entryPrice, `Profit: +${(pnlPct * 100).toFixed(2)}%`);
                    }
                    await this.closePosition(symbol, `PROFIT_TARGET (${(pnlPct * 100).toFixed(2)}%)`);
                    continue;
                }

                // Check for crossover exit (and optionally flip)
                const exitSignal = this.checkExitSignal(symbol, position.side);
                if (exitSignal.shouldExit) {
                    // Option to flip position on reversal
                    const shouldFlip = Math.abs(pnlPct) < 0.01; // Only flip if not heavily underwater
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

    // ========================================
    // DATA MANAGEMENT
    // ========================================

    async syncPositions() {
        try {
            const alpacaPositions = await this.alpaca.getPositions();

            this.positions.clear();
            for (const pos of alpacaPositions) {
                // Only track forex pairs
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
            // Continue on sync error
        }
    }

    async initializePriceHistory() {
        this.log('📥 Initializing price history for forex pairs...');

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
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 45);

        try {
            // Use Yahoo Finance for FREE forex data (Alpaca requires paid subscription)
            const history = await yahooFinance.getHistory(symbol, 45);

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

    async getForexQuote(symbol) {
        try {
            // Use Yahoo Finance for FREE real-time forex quotes
            const quote = await yahooFinance.getQuote(symbol);
            if (quote) {
                return {
                    price: quote.price,
                    bid: quote.bid,
                    ask: quote.ask,
                    spread: quote.ask - quote.bid
                };
            }
            return null;
        } catch (error) {
            this.log(`⚠️ ${symbol} quote error: ${error.message}`);
            return null;
        }
    }

    // ========================================
    // SESSION MANAGEMENT
    // ========================================

    getCurrentSession() {
        const now = new Date();
        const estOptions = { timeZone: 'America/New_York' };
        const estString = now.toLocaleString('en-US', estOptions);
        const estDate = new Date(estString);
        const hour = estDate.getHours();

        // Check for London/NY overlap (BEST)
        if (hour >= 8 && hour < 12) {
            return 'OVERLAP';
        }

        // London session
        if (hour >= 3 && hour < 12) {
            return 'LONDON';
        }

        // New York session
        if (hour >= 8 && hour < 17) {
            return 'NEW_YORK';
        }

        // Tokyo session (evening in EST)
        if (hour >= 19 || hour < 4) {
            return 'TOKYO';
        }

        return 'OFF_PEAK';
    }

    isPairOptimalForSession(symbol, session) {
        if (session === 'OVERLAP') return true; // All pairs good during overlap

        const sessionConfig = CONFIG.SESSIONS[session];
        if (!sessionConfig || !sessionConfig.pairs) return true;

        for (const currency of sessionConfig.pairs) {
            if (symbol.includes(currency)) {
                return true;
            }
        }

        return false;
    }

    isForexMarketOpen() {
        const now = new Date();
        const day = now.getUTCDay();
        const hour = now.getUTCHours();

        // Forex closed: Friday 9 PM UTC to Sunday 9 PM UTC
        if (day === 6) return false; // Saturday
        if (day === 0 && hour < 21) return false; // Sunday before 9 PM UTC
        if (day === 5 && hour >= 21) return false; // Friday after 9 PM UTC

        return true;
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
        const session = this.getCurrentSession();
        const winRate = this.stats.totalTrades > 0
            ? (this.stats.winners / (this.stats.winners + this.stats.losers) * 100).toFixed(0)
            : 'N/A';

        // Count longs and shorts
        let longs = 0, shorts = 0;
        for (const pos of this.positions.values()) {
            if (pos.side === 'long') longs++;
            else shorts++;
        }

        console.log(`🌍 ${new Date().toLocaleTimeString()} | ` +
            `Session: ${session} | ` +
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
        this.log('📊 DAILY FOREX REPORT');
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
            mode: CONFIG.PAPER_TRADING ? 'PAPER' : 'LIVE',
            tradingMode: 'BIDIRECTIONAL (LONG + SHORT)',
            currentSession: this.getCurrentSession(),
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

const bot = new AutoForexBot();

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'auto-forex-bot',
        mode: CONFIG.PAPER_TRADING ? 'PAPER' : 'LIVE',
        tradingMode: 'BIDIRECTIONAL',
        isRunning: bot.isRunning,
        session: bot.getCurrentSession()
    });
});

// Get status
app.get('/api/forex/status', (req, res) => {
    res.json(bot.getStatus());
});

// Start bot
app.post('/api/forex/start', async (req, res) => {
    try {
        await bot.start();
        res.json({ success: true, message: 'Forex bot started (LONG + SHORT)' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop bot
app.post('/api/forex/stop', async (req, res) => {
    try {
        await bot.stop();
        res.json({ success: true, message: 'Forex bot stopped' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Pause/Resume
app.post('/api/forex/pause', (req, res) => {
    bot.pause();
    res.json({ success: true, message: 'Bot paused' });
});

app.post('/api/forex/resume', (req, res) => {
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
    console.log(`\n🌍 Auto Forex Bot Server running on port ${CONFIG.PORT}`);
    console.log(`   Mode: BIDIRECTIONAL (LONG + SHORT)`);
    console.log(`   Session: ${bot.getCurrentSession()}`);
    console.log(`   Health: http://localhost:${CONFIG.PORT}/health`);
    console.log(`   Status: http://localhost:${CONFIG.PORT}/api/forex/status`);
    console.log(`   Start: POST http://localhost:${CONFIG.PORT}/api/forex/start`);
    console.log(`   Stop: POST http://localhost:${CONFIG.PORT}/api/forex/stop`);
    console.log('\n');
});

// Auto-start
const AUTO_START = process.env.FOREX_AUTO_START === 'true';
if (AUTO_START) {
    bot.start().catch(console.error);
}

module.exports = { AutoForexBot, bot };
