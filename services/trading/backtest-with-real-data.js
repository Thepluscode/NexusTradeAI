/**
 * Real Data Backtesting Engine
 * 
 * CRITICAL: This is the ONLY way to validate strategy edge.
 * 
 * Features:
 * - Fetches REAL historical data from Polygon.io or Alpaca
 * - Walk-forward validation (70% train, 30% test by default)
 * - Transaction cost modeling (slippage + fees)
 * - Statistical evidence generation
 * - Comparison vs buy-and-hold baseline
 * 
 * Usage:
 *   node backtest-with-real-data.js --symbols SPY,QQQ,AAPL --years 5
 *   node backtest-with-real-data.js --help
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const EventEmitter = require('events');

// Try to load Polygon client (optional)
let PolygonClient = null;
try {
    const polygon = require('@polygon.io/client-js');
    PolygonClient = polygon.restClient;
} catch (e) {
    console.log('⚠️  Polygon.io client not installed. Using Alpaca for data.');
}

// Load Alpaca client
const Alpaca = require('@alpacahq/alpaca-trade-api');

class RealDataBacktester extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Data sources
            polygonApiKey: process.env.POLYGON_API_KEY || config.polygonApiKey,
            alpacaApiKey: process.env.ALPACA_API_KEY || config.alpacaApiKey,
            alpacaSecretKey: process.env.ALPACA_SECRET_KEY || config.alpacaSecretKey,

            // Walk-forward settings
            inSampleRatio: config.inSampleRatio || 0.70,
            walkForwardWindows: config.walkForwardWindows || 5,

            // Transaction costs (REALISTIC)
            slippagePct: config.slippagePct || 0.001,  // 0.1% slippage per trade
            commissionPerShare: config.commissionPerShare || 0.0,  // Most brokers free now
            minCommission: config.minCommission || 0.0,

            // Strategy parameters (SMA crossover defaults)
            fastMA: config.fastMA || 10,
            slowMA: config.slowMA || 20,
            stopLossPct: config.stopLossPct || 0.10,  // 10%
            profitTargetPct: config.profitTargetPct || 0.15,  // 15%

            // Risk parameters
            positionSizePct: config.positionSizePct || 0.10,  // 10% per position
            initialCapital: config.initialCapital || 100000,

            // Minimum requirements for statistical significance
            minTradesRequired: config.minTradesRequired || 30,

            ...config
        };

        // Initialize data client
        this.alpaca = new Alpaca({
            keyId: this.config.alpacaApiKey,
            secretKey: this.config.alpacaSecretKey,
            paper: true
        });

        if (PolygonClient && this.config.polygonApiKey) {
            this.polygon = PolygonClient(this.config.polygonApiKey);
            console.log('✅ Polygon.io client initialized');
        }

        // State
        this.historicalData = new Map();
        this.results = [];
    }

    /**
     * Fetch historical data from Polygon.io or Alpaca
     */
    async fetchHistoricalData(symbol, startDate, endDate) {
        console.log(`📊 Fetching ${symbol} data from ${startDate} to ${endDate}...`);

        try {
            // Try Polygon first (better data quality)
            if (this.polygon) {
                return await this.fetchFromPolygon(symbol, startDate, endDate);
            }

            // Fallback to Alpaca
            return await this.fetchFromAlpaca(symbol, startDate, endDate);

        } catch (error) {
            console.error(`❌ Error fetching ${symbol}:`, error.message);
            throw error;
        }
    }

    async fetchFromPolygon(symbol, startDate, endDate) {
        const bars = [];
        const start = new Date(startDate).toISOString().split('T')[0];
        const end = new Date(endDate).toISOString().split('T')[0];

        try {
            const response = await this.polygon.stocks.aggregates(
                symbol,
                1,
                'day',
                start,
                end,
                { limit: 50000 }
            );

            if (response.results) {
                for (const bar of response.results) {
                    bars.push({
                        date: new Date(bar.t),
                        timestamp: bar.t,
                        open: bar.o,
                        high: bar.h,
                        low: bar.l,
                        close: bar.c,
                        volume: bar.v,
                        vwap: bar.vw || bar.c
                    });
                }
            }

            console.log(`   ✅ Polygon: ${bars.length} bars fetched`);
            return bars;

        } catch (error) {
            console.log(`   ⚠️  Polygon failed, trying Alpaca: ${error.message}`);
            return await this.fetchFromAlpaca(symbol, startDate, endDate);
        }
    }

    async fetchFromAlpaca(symbol, startDate, endDate) {
        const bars = [];

        try {
            const alpacaBars = this.alpaca.getBarsV2(
                symbol,
                {
                    start: new Date(startDate).toISOString(),
                    end: new Date(endDate).toISOString(),
                    timeframe: '1Day',
                    limit: 10000,
                    feed: 'iex'  // Use IEX feed (free tier) instead of SIP (paid)
                }
            );

            for await (const bar of alpacaBars) {
                bars.push({
                    date: new Date(bar.Timestamp),
                    timestamp: new Date(bar.Timestamp).getTime(),
                    open: bar.OpenPrice,
                    high: bar.HighPrice,
                    low: bar.LowPrice,
                    close: bar.ClosePrice,
                    volume: bar.Volume,
                    vwap: bar.VWAP || bar.ClosePrice
                });
            }

            console.log(`   ✅ Alpaca: ${bars.length} bars fetched`);
            return bars;

        } catch (error) {
            throw new Error(`Failed to fetch data for ${symbol}: ${error.message}`);
        }
    }

    /**
     * Run comprehensive walk-forward backtest
     */
    async runWalkForwardBacktest(symbols, yearsOfData = 5) {
        console.log('\n' + '='.repeat(70));
        console.log('🎯 WALK-FORWARD BACKTEST WITH REAL DATA');
        console.log('='.repeat(70));
        console.log(`Symbols: ${symbols.join(', ')}`);
        console.log(`Period: ${yearsOfData} years`);
        console.log(`Walk-forward windows: ${this.config.walkForwardWindows}`);
        console.log(`Transaction costs: ${(this.config.slippagePct * 100).toFixed(2)}% slippage`);
        console.log('='.repeat(70) + '\n');

        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - yearsOfData);

        // Fetch data for all symbols
        console.log('📥 Phase 1: Fetching Historical Data\n');

        for (const symbol of symbols) {
            try {
                const data = await this.fetchHistoricalData(symbol, startDate, endDate);

                if (data.length < 252) {
                    console.log(`   ⚠️  ${symbol}: Insufficient data (${data.length} bars, need 252+)`);
                    continue;
                }

                this.historicalData.set(symbol, data);
            } catch (error) {
                console.log(`   ❌ ${symbol}: ${error.message}`);
            }

            // Rate limiting for free API tiers
            await this.sleep(200);
        }

        if (this.historicalData.size === 0) {
            throw new Error('No valid historical data fetched. Check API keys.');
        }

        console.log(`\n✅ Data loaded for ${this.historicalData.size} symbols\n`);

        // Run walk-forward for each symbol
        console.log('📈 Phase 2: Walk-Forward Validation\n');

        const allResults = [];

        for (const [symbol, data] of this.historicalData) {
            console.log(`\n--- ${symbol} ---`);

            const symbolResults = await this.runSymbolWalkForward(symbol, data);
            allResults.push({
                symbol,
                ...symbolResults
            });
        }

        // Generate aggregate report
        console.log('\n📊 Phase 3: Statistical Analysis\n');

        const report = this.generateEvidenceReport(allResults);

        return report;
    }

    /**
     * Run walk-forward backtest on single symbol
     */
    async runSymbolWalkForward(symbol, data) {
        const windowSize = Math.floor(data.length / this.config.walkForwardWindows);
        const inSampleSize = Math.floor(windowSize * this.config.inSampleRatio);
        const outSampleSize = windowSize - inSampleSize;

        const windowResults = [];
        let allTrades = [];

        for (let i = 0; i < this.config.walkForwardWindows; i++) {
            const windowStart = i * windowSize;
            const inSampleEnd = windowStart + inSampleSize;
            const outSampleEnd = Math.min(windowStart + windowSize, data.length);

            // In-sample: optimize parameters (for now, use fixed params)
            const inSampleData = data.slice(windowStart, inSampleEnd);

            // Out-of-sample: test with optimized params
            const outSampleData = data.slice(inSampleEnd, outSampleEnd);

            if (outSampleData.length < 20) continue;

            // Run backtest on out-of-sample period
            const result = this.runBacktest(symbol, outSampleData);

            windowResults.push({
                window: i + 1,
                startDate: outSampleData[0].date,
                endDate: outSampleData[outSampleData.length - 1].date,
                ...result
            });

            allTrades = allTrades.concat(result.trades);

            console.log(`   Window ${i + 1}: ${result.trades.length} trades, ` +
                `Return: ${(result.totalReturn * 100).toFixed(2)}%, ` +
                `WR: ${(result.winRate * 100).toFixed(1)}%`);
        }

        // Aggregate results
        return this.aggregateWindowResults(windowResults, allTrades);
    }

    /**
     * Run single backtest on data period
     */
    runBacktest(symbol, data) {
        let capital = this.config.initialCapital;
        const equityCurve = [capital];
        const trades = [];
        let position = null;
        let peakEquity = capital;
        let maxDrawdown = 0;

        // Pre-calculate indicators
        const closes = data.map(d => d.close);
        const fastMA = this.calculateSMA(closes, this.config.fastMA);
        const slowMA = this.calculateSMA(closes, this.config.slowMA);

        // Need enough data for indicators
        const startIndex = this.config.slowMA;

        for (let i = startIndex; i < data.length; i++) {
            const bar = data[i];
            const prevBar = data[i - 1];
            const fast = fastMA[i - startIndex];
            const slow = slowMA[i - startIndex];
            const prevFast = fastMA[i - startIndex - 1] || fast;
            const prevSlow = slowMA[i - startIndex - 1] || slow;

            // Manage existing position
            if (position) {
                const currentPnL = (bar.close - position.entry) / position.entry;

                // Check stop loss
                if (currentPnL <= -this.config.stopLossPct) {
                    const exitPrice = position.entry * (1 - this.config.stopLossPct);
                    const exitPriceWithSlippage = exitPrice * (1 - this.config.slippagePct);
                    const profit = (exitPriceWithSlippage - position.entryWithCosts) * position.shares;

                    capital += profit + (position.shares * exitPriceWithSlippage);

                    trades.push({
                        type: 'STOP_LOSS',
                        symbol,
                        entryDate: position.entryDate,
                        exitDate: bar.date,
                        entry: position.entry,
                        exit: exitPriceWithSlippage,
                        shares: position.shares,
                        profit,
                        returnPct: profit / (position.shares * position.entryWithCosts),
                        holdingDays: Math.floor((bar.date - position.entryDate) / (1000 * 60 * 60 * 24))
                    });

                    position = null;
                }
                // Check profit target
                else if (currentPnL >= this.config.profitTargetPct) {
                    const exitPrice = position.entry * (1 + this.config.profitTargetPct);
                    const exitPriceWithSlippage = exitPrice * (1 - this.config.slippagePct);
                    const profit = (exitPriceWithSlippage - position.entryWithCosts) * position.shares;

                    capital += profit + (position.shares * exitPriceWithSlippage);

                    trades.push({
                        type: 'PROFIT_TARGET',
                        symbol,
                        entryDate: position.entryDate,
                        exitDate: bar.date,
                        entry: position.entry,
                        exit: exitPriceWithSlippage,
                        shares: position.shares,
                        profit,
                        returnPct: profit / (position.shares * position.entryWithCosts),
                        holdingDays: Math.floor((bar.date - position.entryDate) / (1000 * 60 * 60 * 24))
                    });

                    position = null;
                }
                // Check MA crossover exit (bearish crossover)
                else if (prevFast >= prevSlow && fast < slow) {
                    const exitPriceWithSlippage = bar.close * (1 - this.config.slippagePct);
                    const profit = (exitPriceWithSlippage - position.entryWithCosts) * position.shares;

                    capital += profit + (position.shares * exitPriceWithSlippage);

                    trades.push({
                        type: 'SIGNAL_EXIT',
                        symbol,
                        entryDate: position.entryDate,
                        exitDate: bar.date,
                        entry: position.entry,
                        exit: exitPriceWithSlippage,
                        shares: position.shares,
                        profit,
                        returnPct: profit / (position.shares * position.entryWithCosts),
                        holdingDays: Math.floor((bar.date - position.entryDate) / (1000 * 60 * 60 * 24))
                    });

                    position = null;
                }
            }

            // Check for entry (bullish crossover)
            if (!position && prevFast <= prevSlow && fast > slow) {
                const positionSize = capital * this.config.positionSizePct;
                const entryWithSlippage = bar.close * (1 + this.config.slippagePct);
                const shares = Math.floor(positionSize / entryWithSlippage);

                if (shares > 0) {
                    const cost = shares * entryWithSlippage;
                    capital -= cost;

                    position = {
                        symbol,
                        entry: bar.close,
                        entryWithCosts: entryWithSlippage,
                        entryDate: bar.date,
                        shares,
                        cost
                    };
                }
            }

            // Update equity curve
            const positionValue = position ? position.shares * bar.close : 0;
            const equity = capital + positionValue;
            equityCurve.push(equity);

            // Track drawdown
            if (equity > peakEquity) {
                peakEquity = equity;
            }
            const drawdown = (peakEquity - equity) / peakEquity;
            if (drawdown > maxDrawdown) {
                maxDrawdown = drawdown;
            }
        }

        // Close any remaining position at end
        if (position) {
            const finalPrice = data[data.length - 1].close * (1 - this.config.slippagePct);
            const profit = (finalPrice - position.entryWithCosts) * position.shares;
            capital += profit + (position.shares * finalPrice);

            trades.push({
                type: 'END_OF_DATA',
                symbol,
                entryDate: position.entryDate,
                exitDate: data[data.length - 1].date,
                entry: position.entry,
                exit: finalPrice,
                shares: position.shares,
                profit,
                returnPct: profit / (position.shares * position.entryWithCosts),
                holdingDays: Math.floor((data[data.length - 1].date - position.entryDate) / (1000 * 60 * 60 * 24))
            });
        }

        // Calculate metrics
        const finalEquity = equityCurve[equityCurve.length - 1];
        const totalReturn = (finalEquity - this.config.initialCapital) / this.config.initialCapital;

        // Buy and hold comparison
        const buyHoldReturn = (data[data.length - 1].close - data[0].close) / data[0].close;

        const winners = trades.filter(t => t.profit > 0);
        const losers = trades.filter(t => t.profit <= 0);
        const winRate = trades.length > 0 ? winners.length / trades.length : 0;

        const avgWin = winners.length > 0
            ? winners.reduce((sum, t) => sum + t.returnPct, 0) / winners.length
            : 0;
        const avgLoss = losers.length > 0
            ? Math.abs(losers.reduce((sum, t) => sum + t.returnPct, 0) / losers.length)
            : 0;

        const profitFactor = avgLoss > 0
            ? (winRate * avgWin) / ((1 - winRate) * avgLoss)
            : avgWin > 0 ? Infinity : 0;

        // Calculate Sharpe ratio (annualized)
        const returns = [];
        for (let i = 1; i < equityCurve.length; i++) {
            returns.push((equityCurve[i] - equityCurve[i - 1]) / equityCurve[i - 1]);
        }
        const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const stdReturn = Math.sqrt(
            returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
        );
        const sharpeRatio = stdReturn > 0
            ? (avgReturn / stdReturn) * Math.sqrt(252)
            : 0;

        return {
            trades,
            totalReturn,
            buyHoldReturn,
            winRate,
            avgWin,
            avgLoss,
            profitFactor,
            sharpeRatio,
            maxDrawdown,
            finalEquity,
            tradesPerYear: trades.length / (data.length / 252)
        };
    }

    /**
     * Aggregate walk-forward window results
     */
    aggregateWindowResults(windowResults, allTrades) {
        if (windowResults.length === 0) {
            return {
                valid: false,
                reason: 'No walk-forward windows completed'
            };
        }

        const avgReturn = windowResults.reduce((sum, w) => sum + w.totalReturn, 0) / windowResults.length;
        const avgBuyHold = windowResults.reduce((sum, w) => sum + w.buyHoldReturn, 0) / windowResults.length;
        const avgSharpe = windowResults.reduce((sum, w) => sum + w.sharpeRatio, 0) / windowResults.length;
        const avgDrawdown = windowResults.reduce((sum, w) => sum + w.maxDrawdown, 0) / windowResults.length;

        const totalWinners = allTrades.filter(t => t.profit > 0).length;
        const overallWinRate = allTrades.length > 0 ? totalWinners / allTrades.length : 0;

        // Calculate profit factor
        const totalWins = allTrades.filter(t => t.profit > 0).reduce((sum, t) => sum + t.profit, 0);
        const totalLosses = Math.abs(allTrades.filter(t => t.profit <= 0).reduce((sum, t) => sum + t.profit, 0));
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

        // Consistency: how many windows were profitable?
        const profitableWindows = windowResults.filter(w => w.totalReturn > 0).length;
        const consistency = profitableWindows / windowResults.length;

        // Beat buy-and-hold count
        const beatBuyHold = windowResults.filter(w => w.totalReturn > w.buyHoldReturn).length;

        return {
            windowResults,
            allTrades,
            metrics: {
                totalTrades: allTrades.length,
                avgReturn,
                avgBuyHold,
                overallWinRate,
                avgSharpe,
                avgDrawdown,
                profitFactor,
                consistency,
                beatBuyHoldCount: beatBuyHold,
                beatBuyHoldPct: beatBuyHold / windowResults.length
            },
            valid: true
        };
    }

    /**
     * Generate comprehensive evidence report
     */
    generateEvidenceReport(allResults) {
        console.log('\n' + '='.repeat(70));
        console.log('📊 STRATEGY EVIDENCE REPORT');
        console.log('='.repeat(70));

        const validResults = allResults.filter(r => r.valid);

        if (validResults.length === 0) {
            console.log('\n❌ NO VALID RESULTS - Cannot generate report\n');
            return { valid: false, reason: 'No valid backtest results' };
        }

        // Aggregate across all symbols
        const allTrades = validResults.flatMap(r => r.allTrades);
        const allMetrics = validResults.map(r => r.metrics);

        const totalTrades = allTrades.length;
        const winners = allTrades.filter(t => t.profit > 0);
        const losers = allTrades.filter(t => t.profit <= 0);
        const overallWinRate = totalTrades > 0 ? winners.length / totalTrades : 0;

        const totalWins = winners.reduce((sum, t) => sum + t.profit, 0);
        const totalLosses = Math.abs(losers.reduce((sum, t) => sum + t.profit, 0));
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : Infinity;

        const avgSharpe = allMetrics.reduce((sum, m) => sum + m.avgSharpe, 0) / allMetrics.length;
        const avgDrawdown = allMetrics.reduce((sum, m) => sum + m.avgDrawdown, 0) / allMetrics.length;
        const avgConsistency = allMetrics.reduce((sum, m) => sum + m.consistency, 0) / allMetrics.length;

        // Calculate average return per trade
        const avgReturnPerTrade = allTrades.reduce((sum, t) => sum + t.returnPct, 0) / totalTrades;

        // Expectancy
        const avgWin = winners.length > 0
            ? winners.reduce((sum, t) => sum + t.returnPct, 0) / winners.length
            : 0;
        const avgLoss = losers.length > 0
            ? Math.abs(losers.reduce((sum, t) => sum + t.returnPct, 0) / losers.length)
            : 0;
        const expectancy = (overallWinRate * avgWin) - ((1 - overallWinRate) * avgLoss);

        // Print summary
        console.log('\n📈 OVERALL METRICS');
        console.log('-'.repeat(50));
        console.log(`   Total Trades:         ${totalTrades}`);
        console.log(`   Symbols Tested:       ${validResults.length}`);
        console.log(`   Win Rate:             ${(overallWinRate * 100).toFixed(1)}%`);
        console.log(`   Profit Factor:        ${profitFactor.toFixed(2)}`);
        console.log(`   Sharpe Ratio (avg):   ${avgSharpe.toFixed(2)}`);
        console.log(`   Max Drawdown (avg):   ${(avgDrawdown * 100).toFixed(1)}%`);
        console.log(`   Expectancy:           ${(expectancy * 100).toFixed(2)}% per trade`);
        console.log(`   Consistency:          ${(avgConsistency * 100).toFixed(0)}% profitable windows`);

        // Validation checks
        console.log('\n✅ VALIDATION CRITERIA');
        console.log('-'.repeat(50));

        const checks = {
            sufficientTrades: totalTrades >= this.config.minTradesRequired,
            winRateOK: overallWinRate > 0.45,
            sharpeOK: avgSharpe > 1.0,
            drawdownOK: avgDrawdown < 0.15,
            profitFactorOK: profitFactor > 1.3,
            expectancyPositive: expectancy > 0
        };

        console.log(`   Minimum Trades (${this.config.minTradesRequired}):    ${checks.sufficientTrades ? '✅ PASS' : '❌ FAIL'} (${totalTrades})`);
        console.log(`   Win Rate > 45%:       ${checks.winRateOK ? '✅ PASS' : '❌ FAIL'} (${(overallWinRate * 100).toFixed(1)}%)`);
        console.log(`   Sharpe > 1.0:         ${checks.sharpeOK ? '✅ PASS' : '❌ FAIL'} (${avgSharpe.toFixed(2)})`);
        console.log(`   Max DD < 15%:         ${checks.drawdownOK ? '✅ PASS' : '❌ FAIL'} (${(avgDrawdown * 100).toFixed(1)}%)`);
        console.log(`   Profit Factor > 1.3:  ${checks.profitFactorOK ? '✅ PASS' : '❌ FAIL'} (${profitFactor.toFixed(2)})`);
        console.log(`   Positive Expectancy:  ${checks.expectancyPositive ? '✅ PASS' : '❌ FAIL'} (${(expectancy * 100).toFixed(2)}%)`);

        const passedChecks = Object.values(checks).filter(v => v).length;
        const totalChecks = Object.keys(checks).length;
        const overallPass = passedChecks >= Math.ceil(totalChecks * 0.67);  // 67% must pass

        console.log('\n' + '='.repeat(70));
        console.log(`\n${overallPass ? '🎯 STRATEGY VALIDATED' : '⚠️  STRATEGY NEEDS IMPROVEMENT'}`);
        console.log(`   Passed ${passedChecks}/${totalChecks} validation criteria`);
        console.log('='.repeat(70) + '\n');

        // Per-symbol breakdown
        console.log('📊 PER-SYMBOL BREAKDOWN');
        console.log('-'.repeat(50));

        for (const result of validResults) {
            console.log(`   ${result.symbol}: ` +
                `${result.metrics.totalTrades} trades, ` +
                `WR: ${(result.metrics.overallWinRate * 100).toFixed(0)}%, ` +
                `Sharpe: ${result.metrics.avgSharpe.toFixed(2)}, ` +
                `DD: ${(result.metrics.avgDrawdown * 100).toFixed(1)}%`);
        }

        // Build report object
        const report = {
            timestamp: new Date().toISOString(),
            config: this.config,
            summary: {
                symbolsTested: validResults.length,
                totalTrades,
                overallWinRate,
                profitFactor,
                avgSharpe,
                avgDrawdown,
                expectancy,
                avgReturnPerTrade,
                consistency: avgConsistency
            },
            validation: {
                passed: overallPass,
                passedChecks,
                totalChecks,
                checks
            },
            symbolResults: validResults.map(r => ({
                symbol: r.symbol,
                ...r.metrics
            })),
            trades: allTrades
        };

        // Save report to file
        const fs = require('fs');
        const reportPath = require('path').join(__dirname, 'backtest-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Full report saved to: ${reportPath}\n`);

        return report;
    }

    /**
     * Calculate Simple Moving Average
     */
    calculateSMA(values, period) {
        const sma = [];
        for (let i = 0; i < values.length; i++) {
            if (i < period - 1) {
                sma.push(null);
            } else {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += values[i - j];
                }
                sma.push(sum / period);
            }
        }
        return sma;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI interface
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--help')) {
        console.log(`
Real Data Backtester - Prove Your Strategy Edge

Usage:
  node backtest-with-real-data.js [options]

Options:
  --symbols SYMS    Comma-separated symbols (default: SPY,QQQ)
  --years N         Years of historical data (default: 5)
  --fast-ma N       Fast MA period (default: 10)
  --slow-ma N       Slow MA period (default: 20)
  --stop-loss PCT   Stop loss percentage (default: 0.10)
  --profit-target   Profit target percentage (default: 0.15)
  --help            Show this help

Environment variables required:
  ALPACA_API_KEY       Alpaca API key
  ALPACA_SECRET_KEY    Alpaca secret key
  POLYGON_API_KEY      (Optional) Polygon.io API key for better data

Example:
  node backtest-with-real-data.js --symbols SPY,QQQ,AAPL --years 3
        `);
        process.exit(0);
    }

    // Parse arguments
    const symbolsIdx = args.indexOf('--symbols');
    const symbols = symbolsIdx >= 0
        ? args[symbolsIdx + 1].split(',')
        : ['SPY', 'QQQ'];

    const yearsIdx = args.indexOf('--years');
    const years = yearsIdx >= 0 ? parseInt(args[yearsIdx + 1]) : 5;

    const fastIdx = args.indexOf('--fast-ma');
    const fastMA = fastIdx >= 0 ? parseInt(args[fastIdx + 1]) : 10;

    const slowIdx = args.indexOf('--slow-ma');
    const slowMA = slowIdx >= 0 ? parseInt(args[slowIdx + 1]) : 20;

    const stopIdx = args.indexOf('--stop-loss');
    const stopLoss = stopIdx >= 0 ? parseFloat(args[stopIdx + 1]) : 0.10;

    const targetIdx = args.indexOf('--profit-target');
    const profitTarget = targetIdx >= 0 ? parseFloat(args[targetIdx + 1]) : 0.15;

    console.log('\n🚀 Starting Real Data Backtester...\n');

    const backtester = new RealDataBacktester({
        fastMA,
        slowMA,
        stopLossPct: stopLoss,
        profitTargetPct: profitTarget
    });

    try {
        const report = await backtester.runWalkForwardBacktest(symbols, years);

        if (report.validation?.passed) {
            console.log('🎯 Strategy shows statistical edge! Ready for paper trading.\n');
        } else {
            console.log('⚠️  Strategy needs improvement before live trading.\n');
        }

    } catch (error) {
        console.error('❌ Backtest failed:', error.message);
        console.error('\nMake sure your API keys are set in .env file:');
        console.error('  ALPACA_API_KEY=your_key');
        console.error('  ALPACA_SECRET_KEY=your_secret');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = RealDataBacktester;
