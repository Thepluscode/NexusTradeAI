/**
 * Paper Trading Harness
 * 
 * Production-ready paper trading wrapper that:
 * - Connects to Alpaca paper trading API
 * - Integrates with WinningStrategy for signal generation
 * - Logs all trades with detailed reasoning
 * - Tracks equity curve in real-time
 * - Compares fills to expected prices (slippage measurement)
 * - Exports daily performance reports
 * - Implements kill switch for risk management
 * 
 * Usage:
 *   node paper-trading-harness.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const Alpaca = require('@alpacahq/alpaca-trade-api');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class PaperTradingHarness extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // API Configuration
            alpacaApiKey: process.env.ALPACA_API_KEY || config.alpacaApiKey,
            alpacaSecretKey: process.env.ALPACA_SECRET_KEY || config.alpacaSecretKey,
            paperMode: true,  // ALWAYS paper mode

            // Strategy Configuration
            symbols: config.symbols || ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA'],
            fastMA: config.fastMA || 10,
            slowMA: config.slowMA || 20,

            // Risk Management
            maxPositionPct: config.maxPositionPct || 0.10,  // 10% per position
            maxPositions: config.maxPositions || 5,
            stopLossPct: config.stopLossPct || 0.10,  // 10%
            profitTargetPct: config.profitTargetPct || 0.15,  // 15%
            dailyLossLimit: config.dailyLossLimit || -0.02,  // -2% daily kill switch

            // Logging
            logDir: config.logDir || path.join(__dirname, 'logs', 'paper-trading'),

            // Scan interval
            scanIntervalMs: config.scanIntervalMs || 60000,  // 1 minute

            ...config
        };

        // Initialize Alpaca client (PAPER MODE)
        this.alpaca = new Alpaca({
            keyId: this.config.alpacaApiKey,
            secretKey: this.config.alpacaSecretKey,
            paper: true,
            baseUrl: 'https://paper-api.alpaca.markets'
        });

        // State
        this.isRunning = false;
        this.account = null;
        this.positions = new Map();
        this.priceHistory = new Map();
        this.trades = [];
        this.dailyStartEquity = null;
        this.scanInterval = null;

        // Performance tracking
        this.performance = {
            startDate: null,
            trades: [],
            equityCurve: [],
            dailyReturns: [],
            peakEquity: 0,
            maxDrawdown: 0
        };

        // Ensure log directory exists
        if (!fs.existsSync(this.config.logDir)) {
            fs.mkdirSync(this.config.logDir, { recursive: true });
        }

        console.log('🎮 Paper Trading Harness initialized (PAPER MODE ONLY)');
    }

    /**
     * Start paper trading
     */
    async start() {
        console.log('\n' + '='.repeat(70));
        console.log('🚀 STARTING PAPER TRADING SESSION');
        console.log('='.repeat(70));

        try {
            // Verify API connection
            this.account = await this.alpaca.getAccount();
            console.log(`✅ Connected to Alpaca (Paper Mode)`);
            console.log(`   Account: ${this.account.account_number}`);
            console.log(`   Equity: $${parseFloat(this.account.equity).toLocaleString()}`);
            console.log(`   Buying Power: $${parseFloat(this.account.buying_power).toLocaleString()}`);

            // Set daily start equity
            this.dailyStartEquity = parseFloat(this.account.equity);
            this.performance.startDate = new Date();
            this.performance.peakEquity = this.dailyStartEquity;

            // Load existing positions
            await this.syncPositions();

            // Start scanning
            this.isRunning = true;
            await this.runScanLoop();

        } catch (error) {
            console.error('❌ Failed to start:', error.message);
            throw error;
        }
    }

    /**
     * Stop paper trading
     */
    async stop() {
        console.log('\n🛑 Stopping paper trading...');
        this.isRunning = false;

        if (this.scanInterval) {
            clearInterval(this.scanInterval);
        }

        // Generate final report
        await this.generateDailyReport();

        console.log('✅ Paper trading stopped');
    }

    /**
     * Main scanning loop
     */
    async runScanLoop() {
        console.log(`\n📊 Starting scan loop (interval: ${this.config.scanIntervalMs / 1000}s)\n`);

        // Initial scan
        await this.scan();

        // Set up interval
        this.scanInterval = setInterval(async () => {
            if (!this.isRunning) return;

            try {
                await this.scan();
            } catch (error) {
                console.error('Scan error:', error.message);
            }
        }, this.config.scanIntervalMs);
    }

    /**
     * Perform market scan and trading decisions
     */
    async scan() {
        // Check if market is open
        const clock = await this.alpaca.getClock();
        if (!clock.is_open) {
            const nextOpen = new Date(clock.next_open);
            console.log(`⏰ Market closed. Next open: ${nextOpen.toLocaleString()}`);
            return;
        }

        // Refresh account and positions
        this.account = await this.alpaca.getAccount();
        await this.syncPositions();

        // Check kill switch
        const dailyReturn = (parseFloat(this.account.equity) - this.dailyStartEquity) / this.dailyStartEquity;
        if (dailyReturn <= this.config.dailyLossLimit) {
            console.log(`\n🚨 KILL SWITCH TRIGGERED: Daily loss ${(dailyReturn * 100).toFixed(2)}% exceeds limit`);
            await this.emergencyLiquidate();
            return;
        }

        // Update equity curve
        const currentEquity = parseFloat(this.account.equity);
        this.performance.equityCurve.push({
            timestamp: new Date(),
            equity: currentEquity
        });

        // Track drawdown
        if (currentEquity > this.performance.peakEquity) {
            this.performance.peakEquity = currentEquity;
        }
        const drawdown = (this.performance.peakEquity - currentEquity) / this.performance.peakEquity;
        if (drawdown > this.performance.maxDrawdown) {
            this.performance.maxDrawdown = drawdown;
        }

        console.log(`\n📈 Scan at ${new Date().toLocaleTimeString()} | ` +
            `Equity: $${currentEquity.toLocaleString()} | ` +
            `Daily: ${(dailyReturn * 100).toFixed(2)}% | ` +
            `Positions: ${this.positions.size}/${this.config.maxPositions}`);

        // Manage existing positions
        await this.managePositions();

        // Look for new opportunities
        await this.scanForEntries();
    }

    /**
     * Sync positions with Alpaca
     */
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

    /**
     * Manage existing positions (check stops/targets)
     */
    async managePositions() {
        for (const [symbol, position] of this.positions) {
            const pnlPct = position.unrealizedPLPct;

            // Check stop loss
            if (pnlPct <= -this.config.stopLossPct) {
                console.log(`🛑 STOP LOSS: ${symbol} at ${(pnlPct * 100).toFixed(2)}%`);
                await this.closePosition(symbol, 'STOP_LOSS');
                continue;
            }

            // Check profit target
            if (pnlPct >= this.config.profitTargetPct) {
                console.log(`🎯 PROFIT TARGET: ${symbol} at ${(pnlPct * 100).toFixed(2)}%`);
                await this.closePosition(symbol, 'PROFIT_TARGET');
                continue;
            }

            // Check MA crossover exit
            const shouldExit = await this.checkExitSignal(symbol);
            if (shouldExit) {
                console.log(`📉 SIGNAL EXIT: ${symbol}`);
                await this.closePosition(symbol, 'SIGNAL_EXIT');
            }
        }
    }

    /**
     * Scan for new entry opportunities
     */
    async scanForEntries() {
        if (this.positions.size >= this.config.maxPositions) {
            console.log(`   Max positions reached (${this.positions.size}/${this.config.maxPositions})`);
            return;
        }

        for (const symbol of this.config.symbols) {
            if (this.positions.has(symbol)) continue;

            try {
                const shouldEnter = await this.checkEntrySignal(symbol);

                if (shouldEnter) {
                    await this.openPosition(symbol);
                }
            } catch (error) {
                console.error(`   Error checking ${symbol}:`, error.message);
            }
        }
    }

    /**
     * Check for entry signal (MA crossover)
     */
    async checkEntrySignal(symbol) {
        // Get recent bars
        const bars = await this.getRecentBars(symbol, this.config.slowMA + 5);
        if (!bars || bars.length < this.config.slowMA) return false;

        // Calculate MAs
        const closes = bars.map(b => b.close);
        const fastMA = this.calculateSMA(closes, this.config.fastMA);
        const slowMA = this.calculateSMA(closes, this.config.slowMA);

        const currentFast = fastMA[fastMA.length - 1];
        const currentSlow = slowMA[slowMA.length - 1];
        const prevFast = fastMA[fastMA.length - 2];
        const prevSlow = slowMA[slowMA.length - 2];

        if (!currentFast || !currentSlow || !prevFast || !prevSlow) return false;

        // Bullish crossover
        const isCrossover = prevFast <= prevSlow && currentFast > currentSlow;

        if (isCrossover) {
            console.log(`   ✨ ${symbol}: Bullish MA crossover detected`);
        }

        return isCrossover;
    }

    /**
     * Check for exit signal (MA crossover)
     */
    async checkExitSignal(symbol) {
        const bars = await this.getRecentBars(symbol, this.config.slowMA + 5);
        if (!bars || bars.length < this.config.slowMA) return false;

        const closes = bars.map(b => b.close);
        const fastMA = this.calculateSMA(closes, this.config.fastMA);
        const slowMA = this.calculateSMA(closes, this.config.slowMA);

        const currentFast = fastMA[fastMA.length - 1];
        const currentSlow = slowMA[slowMA.length - 1];
        const prevFast = fastMA[fastMA.length - 2];
        const prevSlow = slowMA[slowMA.length - 2];

        if (!currentFast || !currentSlow || !prevFast || !prevSlow) return false;

        // Bearish crossover
        return prevFast >= prevSlow && currentFast < currentSlow;
    }

    /**
     * Open new position
     */
    async openPosition(symbol) {
        const buyingPower = parseFloat(this.account.buying_power);
        const equity = parseFloat(this.account.equity);
        const positionSize = equity * this.config.maxPositionPct;

        if (positionSize > buyingPower) {
            console.log(`   ⚠️  ${symbol}: Insufficient buying power`);
            return;
        }

        try {
            // Get current price
            const quote = await this.alpaca.getLatestQuote(symbol);
            const price = quote.AskPrice || quote.Price;

            const qty = Math.floor(positionSize / price);
            if (qty < 1) {
                console.log(`   ⚠️  ${symbol}: Position size too small`);
                return;
            }

            console.log(`\n📈 OPENING: ${symbol} - ${qty} shares @ ~$${price.toFixed(2)}`);

            const order = await this.alpaca.createOrder({
                symbol,
                qty,
                side: 'buy',
                type: 'market',
                time_in_force: 'day'
            });

            // Log trade
            const trade = {
                id: order.id,
                timestamp: new Date(),
                symbol,
                side: 'buy',
                qty,
                expectedPrice: price,
                status: 'submitted',
                reason: 'MA_CROSSOVER_ENTRY'
            };

            this.trades.push(trade);
            this.performance.trades.push(trade);

            // Wait for fill and log actual price
            setTimeout(async () => {
                try {
                    const filledOrder = await this.alpaca.getOrder(order.id);
                    if (filledOrder.status === 'filled') {
                        const fillPrice = parseFloat(filledOrder.filled_avg_price);
                        const slippage = (fillPrice - price) / price;

                        trade.fillPrice = fillPrice;
                        trade.slippage = slippage;
                        trade.status = 'filled';

                        console.log(`   ✅ Filled @ $${fillPrice.toFixed(2)} (slippage: ${(slippage * 100).toFixed(3)}%)`);

                        this.logTrade(trade);
                    }
                } catch (e) {
                    console.error('   Error checking fill:', e.message);
                }
            }, 2000);

        } catch (error) {
            console.error(`   ❌ Order failed:`, error.message);
        }
    }

    /**
     * Close existing position
     */
    async closePosition(symbol, reason) {
        const position = this.positions.get(symbol);
        if (!position) return;

        try {
            console.log(`\n📉 CLOSING: ${symbol} - ${position.qty} shares (${reason})`);

            const order = await this.alpaca.createOrder({
                symbol,
                qty: position.qty,
                side: 'sell',
                type: 'market',
                time_in_force: 'day'
            });

            const trade = {
                id: order.id,
                timestamp: new Date(),
                symbol,
                side: 'sell',
                qty: position.qty,
                expectedPrice: position.currentPrice,
                entryPrice: position.entryPrice,
                unrealizedPL: position.unrealizedPL,
                status: 'submitted',
                reason
            };

            this.trades.push(trade);
            this.performance.trades.push(trade);

            // Wait for fill
            setTimeout(async () => {
                try {
                    const filledOrder = await this.alpaca.getOrder(order.id);
                    if (filledOrder.status === 'filled') {
                        const fillPrice = parseFloat(filledOrder.filled_avg_price);
                        const slippage = (position.currentPrice - fillPrice) / position.currentPrice;
                        const realizedPL = (fillPrice - position.entryPrice) * position.qty;

                        trade.fillPrice = fillPrice;
                        trade.slippage = slippage;
                        trade.realizedPL = realizedPL;
                        trade.status = 'filled';

                        console.log(`   ✅ Filled @ $${fillPrice.toFixed(2)} | P&L: $${realizedPL.toFixed(2)}`);

                        this.logTrade(trade);
                    }
                } catch (e) {
                    console.error('   Error checking fill:', e.message);
                }
            }, 2000);

        } catch (error) {
            console.error(`   ❌ Close order failed:`, error.message);
        }
    }

    /**
     * Emergency liquidate all positions
     */
    async emergencyLiquidate() {
        console.log('\n🚨 EMERGENCY LIQUIDATION - Closing all positions');

        for (const symbol of this.positions.keys()) {
            await this.closePosition(symbol, 'KILL_SWITCH');
        }

        this.isRunning = false;
        await this.stop();
    }

    /**
     * Get recent bars for a symbol
     */
    async getRecentBars(symbol, count) {
        try {
            const end = new Date();
            const start = new Date();
            start.setDate(start.getDate() - count * 2);  // Account for weekends

            const bars = this.alpaca.getBarsV2(symbol, {
                start: start.toISOString(),
                end: end.toISOString(),
                timeframe: '1Day',
                limit: count
            });

            const result = [];
            for await (const bar of bars) {
                result.push({
                    timestamp: new Date(bar.Timestamp),
                    open: bar.OpenPrice,
                    high: bar.HighPrice,
                    low: bar.LowPrice,
                    close: bar.ClosePrice,
                    volume: bar.Volume
                });
            }

            return result.slice(-count);

        } catch (error) {
            console.error(`Error fetching bars for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Calculate Simple Moving Average
     */
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

    /**
     * Log trade to file
     */
    logTrade(trade) {
        const logFile = path.join(this.config.logDir, 'trades.json');

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

    /**
     * Generate daily performance report
     */
    async generateDailyReport() {
        const equity = parseFloat(this.account.equity);
        const dailyReturn = (equity - this.dailyStartEquity) / this.dailyStartEquity;

        const report = {
            date: new Date().toISOString().split('T')[0],
            startEquity: this.dailyStartEquity,
            endEquity: equity,
            dailyReturn,
            trades: this.performance.trades.filter(t =>
                new Date(t.timestamp).toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
            ),
            maxDrawdown: this.performance.maxDrawdown,
            peakEquity: this.performance.peakEquity
        };

        const reportFile = path.join(this.config.logDir, `report_${report.date}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

        console.log('\n' + '='.repeat(50));
        console.log('📊 DAILY PERFORMANCE REPORT');
        console.log('='.repeat(50));
        console.log(`   Date: ${report.date}`);
        console.log(`   Start Equity: $${this.dailyStartEquity.toLocaleString()}`);
        console.log(`   End Equity: $${equity.toLocaleString()}`);
        console.log(`   Daily Return: ${(dailyReturn * 100).toFixed(2)}%`);
        console.log(`   Trades Today: ${report.trades.length}`);
        console.log(`   Max Drawdown: ${(this.performance.maxDrawdown * 100).toFixed(2)}%`);
        console.log(`   Report saved: ${reportFile}`);
        console.log('='.repeat(50) + '\n');

        return report;
    }

    /**
     * Get cumulative performance stats
     */
    getPerformanceStats() {
        const completedTrades = this.performance.trades.filter(t => t.realizedPL !== undefined);

        if (completedTrades.length === 0) {
            return { trades: 0, message: 'No completed trades yet' };
        }

        const winners = completedTrades.filter(t => t.realizedPL > 0);
        const losers = completedTrades.filter(t => t.realizedPL <= 0);

        const totalPL = completedTrades.reduce((sum, t) => sum + t.realizedPL, 0);
        const avgWin = winners.length > 0
            ? winners.reduce((sum, t) => sum + t.realizedPL, 0) / winners.length
            : 0;
        const avgLoss = losers.length > 0
            ? losers.reduce((sum, t) => sum + t.realizedPL, 0) / losers.length
            : 0;

        const avgSlippage = completedTrades
            .filter(t => t.slippage !== undefined)
            .reduce((sum, t) => sum + Math.abs(t.slippage), 0) / completedTrades.length;

        return {
            trades: completedTrades.length,
            winRate: winners.length / completedTrades.length,
            totalPL,
            avgWin,
            avgLoss,
            profitFactor: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : Infinity,
            avgSlippage,
            maxDrawdown: this.performance.maxDrawdown
        };
    }
}

// CLI entry point
async function main() {
    console.log('\n🎮 Paper Trading Harness');
    console.log('='.repeat(50));
    console.log('⚠️  This runs in PAPER MODE ONLY');
    console.log('='.repeat(50) + '\n');

    const harness = new PaperTradingHarness({
        symbols: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL'],
        scanIntervalMs: 60000  // 1 minute
    });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n\nReceived SIGINT...');
        await harness.stop();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('\n\nReceived SIGTERM...');
        await harness.stop();
        process.exit(0);
    });

    try {
        await harness.start();
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = PaperTradingHarness;
