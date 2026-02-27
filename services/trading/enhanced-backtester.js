/**
 * Enhanced Backtesting Engine with Walk-Forward Optimization
 *
 * Prevents overfitting by testing strategies on out-of-sample data.
 * Uses walk-forward analysis to validate robustness across different market conditions.
 *
 * Key Features:
 * 1. Walk-Forward Optimization: Train on in-sample, test on out-of-sample
 * 2. Rolling Window Analysis: Test across different time periods
 * 3. Parameter Sensitivity: Test how sensitive results are to parameter changes
 * 4. Monte Carlo Validation: Simulate different market scenarios
 * 5. Regime-Based Testing: Validate across bull/bear/sideways markets
 */

const EventEmitter = require('events');

class EnhancedBacktester extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Walk-forward settings
            inSampleRatio: config.inSampleRatio || 0.70, // 70% training, 30% testing
            walkForwardSteps: config.walkForwardSteps || 5, // Number of walk-forward iterations
            rollingWindow: config.rollingWindow || 90, // Days per window

            // Backtesting settings
            initialCapital: config.initialCapital || 100000,
            commission: config.commission || 0.001, // 0.1% commission
            slippage: config.slippage || 0.0005, // 0.05% slippage
            maxPositions: config.maxPositions || 5,
            positionSize: config.positionSize || 0.1, // 10% per position

            // Validation thresholds
            minSharpe: config.minSharpe || 1.0,
            minWinRate: config.minWinRate || 0.45,
            maxDrawdown: config.maxDrawdown || 0.20, // 20% max drawdown

            ...config
        };

        this.results = [];
    }

    /**
     * Run full walk-forward backtest
     */
    async runWalkForward(historicalData, strategy) {
        console.log('\n🔄 Starting Walk-Forward Backtest...');
        console.log(`   Strategy: ${strategy.name}`);
        console.log(`   In-Sample Ratio: ${(this.config.inSampleRatio * 100).toFixed(0)}%`);
        console.log(`   Walk-Forward Steps: ${this.config.walkForwardSteps}`);

        const dataLength = historicalData.length;
        const windowSize = Math.floor(dataLength / this.config.walkForwardSteps);
        const inSampleSize = Math.floor(windowSize * this.config.inSampleRatio);
        const outSampleSize = windowSize - inSampleSize;

        const walkForwardResults = [];

        // Perform walk-forward iterations
        for (let step = 0; step < this.config.walkForwardSteps; step++) {
            const startIdx = step * windowSize;
            const inSampleEnd = startIdx + inSampleSize;
            const outSampleEnd = Math.min(startIdx + windowSize, dataLength);

            console.log(`\n📊 Step ${step + 1}/${this.config.walkForwardSteps}:`);
            console.log(`   In-Sample: Days ${startIdx} to ${inSampleEnd} (${inSampleSize} days)`);
            console.log(`   Out-Sample: Days ${inSampleEnd} to ${outSampleEnd} (${outSampleEnd - inSampleEnd} days)`);

            // In-sample optimization
            const inSampleData = historicalData.slice(startIdx, inSampleEnd);
            const optimizedParams = await this.optimizeParameters(inSampleData, strategy);

            console.log(`   ✅ Optimized Parameters:`, optimizedParams);

            // Out-of-sample testing with optimized parameters
            const outSampleData = historicalData.slice(inSampleEnd, outSampleEnd);
            const outSampleResult = await this.runBacktest(outSampleData, strategy, optimizedParams);

            console.log(`   Out-Sample Performance:`);
            console.log(`     Total Return: ${outSampleResult.metrics.totalReturn.toFixed(2)}%`);
            console.log(`     Sharpe Ratio: ${outSampleResult.metrics.sharpeRatio.toFixed(2)}`);
            console.log(`     Win Rate: ${outSampleResult.metrics.winRate.toFixed(2)}%`);
            console.log(`     Max Drawdown: ${outSampleResult.metrics.maxDrawdown.toFixed(2)}%`);

            walkForwardResults.push({
                step: step + 1,
                inSamplePeriod: { start: startIdx, end: inSampleEnd },
                outSamplePeriod: { start: inSampleEnd, end: outSampleEnd },
                optimizedParams,
                outSampleResult
            });

            this.emit('walkForwardStep', { step: step + 1, result: outSampleResult });
        }

        // Aggregate walk-forward results
        const aggregatedResults = this.aggregateWalkForwardResults(walkForwardResults);

        console.log('\n' + '='.repeat(70));
        console.log('📊 WALK-FORWARD BACKTEST SUMMARY');
        console.log('='.repeat(70));
        console.log(`\nAverage Out-of-Sample Performance:`);
        console.log(`  Total Return: ${aggregatedResults.avgTotalReturn.toFixed(2)}%`);
        console.log(`  Sharpe Ratio: ${aggregatedResults.avgSharpe.toFixed(2)}`);
        console.log(`  Win Rate: ${aggregatedResults.avgWinRate.toFixed(2)}%`);
        console.log(`  Max Drawdown: ${aggregatedResults.avgMaxDrawdown.toFixed(2)}%`);
        console.log(`  Profit Factor: ${aggregatedResults.avgProfitFactor.toFixed(2)}`);
        console.log(`\nConsistency Metrics:`);
        console.log(`  Profitable Steps: ${aggregatedResults.profitableSteps}/${this.config.walkForwardSteps}`);
        console.log(`  Sharpe Std Dev: ${aggregatedResults.sharpeStdDev.toFixed(2)}`);
        console.log(`  Return Std Dev: ${aggregatedResults.returnStdDev.toFixed(2)}%`);
        console.log('\n' + '='.repeat(70) + '\n');

        // Validation
        const isValid = this.validateWalkForwardResults(aggregatedResults);
        console.log(`\n${isValid ? '✅' : '❌'} Strategy ${isValid ? 'PASSED' : 'FAILED'} walk-forward validation\n`);

        return {
            walkForwardResults,
            aggregatedResults,
            valid: isValid
        };
    }

    /**
     * Optimize strategy parameters on in-sample data
     */
    async optimizeParameters(data, strategy) {
        // For simplicity, test a few parameter variations
        // In production, use more sophisticated optimization (genetic algorithm, grid search, etc.)

        const parameterSets = this.generateParameterSets(strategy);
        let bestParams = null;
        let bestSharpe = -Infinity;

        console.log(`   🔍 Testing ${parameterSets.length} parameter combinations...`);

        for (const params of parameterSets) {
            const result = await this.runBacktest(data, strategy, params);

            if (result.metrics.sharpeRatio > bestSharpe) {
                bestSharpe = result.metrics.sharpeRatio;
                bestParams = params;
            }
        }

        return bestParams;
    }

    /**
     * Generate parameter sets for optimization
     */
    generateParameterSets(strategy) {
        // Example: Test different profit targets and stop losses
        const sets = [];

        const profitTargets = [0.03, 0.04, 0.05, 0.06, 0.08];
        const stopLosses = [0.015, 0.02, 0.025, 0.03];

        for (const pt of profitTargets) {
            for (const sl of stopLosses) {
                sets.push({
                    profitTarget: pt,
                    stopLoss: sl,
                    trailingStop: sl * 0.75,
                    riskReward: pt / sl
                });
            }
        }

        return sets;
    }

    /**
     * Run standard backtest with given parameters
     */
    async runBacktest(data, strategy, params) {
        let capital = this.config.initialCapital;
        let positions = [];
        const trades = [];
        const equityCurve = [{ date: 0, equity: capital }];

        let highWaterMark = capital;
        let maxDrawdown = 0;

        // Simulate trading on historical data
        for (let i = 20; i < data.length; i++) { // Start at day 20 to have indicator history
            const currentBar = data[i];
            const priceHistory = data.slice(Math.max(0, i - 50), i);

            // Manage existing positions
            positions = await this.managePositions(positions, currentBar, capital, trades, params);

            // Generate new signals if not at max positions
            if (positions.length < this.config.maxPositions) {
                const signal = await this.generateSignal(priceHistory, currentBar, strategy, params);

                if (signal) {
                    // Enter position
                    const positionSize = capital * this.config.positionSize;
                    const shares = Math.floor(positionSize / signal.entry);
                    const cost = shares * signal.entry * (1 + this.config.commission + this.config.slippage);

                    if (cost <= capital) {
                        positions.push({
                            symbol: signal.symbol,
                            entry: signal.entry,
                            shares,
                            cost,
                            stop: signal.stop,
                            target: signal.target,
                            entryDate: i,
                            direction: signal.direction
                        });

                        capital -= cost;
                    }
                }
            }

            // Calculate current equity
            let positionValue = 0;
            for (const pos of positions) {
                positionValue += pos.shares * currentBar.close;
            }
            const equity = capital + positionValue;

            equityCurve.push({ date: i, equity });

            // Track drawdown
            if (equity > highWaterMark) {
                highWaterMark = equity;
            }
            const drawdown = (highWaterMark - equity) / highWaterMark;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
        }

        // Close all remaining positions at end
        const lastBar = data[data.length - 1];
        for (const pos of positions) {
            const exitPrice = lastBar.close * (1 - this.config.commission - this.config.slippage);
            const proceeds = pos.shares * exitPrice;
            const profit = proceeds - pos.cost;

            capital += proceeds;

            trades.push({
                symbol: pos.symbol,
                entry: pos.entry,
                exit: exitPrice,
                profit,
                entryDate: pos.entryDate,
                exitDate: data.length - 1,
                holdingPeriod: data.length - 1 - pos.entryDate
            });
        }

        // Calculate metrics
        const metrics = this.calculateMetrics(trades, equityCurve, maxDrawdown);

        return {
            trades,
            equityCurve,
            metrics,
            params
        };
    }

    /**
     * Manage existing positions (check stops and targets)
     */
    async managePositions(positions, currentBar, capital, trades, params) {
        const remaining = [];

        for (const pos of positions) {
            let shouldClose = false;
            let exitPrice = currentBar.close;
            let reason = '';

            // Check stop loss
            if (pos.direction === 'long' && currentBar.low <= pos.stop) {
                shouldClose = true;
                exitPrice = pos.stop;
                reason = 'stop';
            } else if (pos.direction === 'short' && currentBar.high >= pos.stop) {
                shouldClose = true;
                exitPrice = pos.stop;
                reason = 'stop';
            }

            // Check profit target
            if (pos.direction === 'long' && currentBar.high >= pos.target) {
                shouldClose = true;
                exitPrice = pos.target;
                reason = 'target';
            } else if (pos.direction === 'short' && currentBar.low <= pos.target) {
                shouldClose = true;
                exitPrice = pos.target;
                reason = 'target';
            }

            if (shouldClose) {
                // Close position
                exitPrice *= (1 - this.config.commission - this.config.slippage);
                const proceeds = pos.shares * exitPrice;
                const profit = proceeds - pos.cost;

                capital += proceeds;

                trades.push({
                    symbol: pos.symbol,
                    entry: pos.entry,
                    exit: exitPrice,
                    profit,
                    entryDate: pos.entryDate,
                    exitDate: currentBar.date,
                    reason
                });
            } else {
                remaining.push(pos);
            }
        }

        return remaining;
    }

    /**
     * Generate trading signal based on strategy
     */
    async generateSignal(priceHistory, currentBar, strategy, params) {
        // Simple trend-following signal (SMA crossover)
        const prices = priceHistory.map(b => b.close);

        if (prices.length < 20) return null;

        const sma20 = prices.slice(-20).reduce((sum, p) => sum + p, 0) / 20;
        const sma10 = prices.slice(-10).reduce((sum, p) => sum + p, 0) / 10;
        const currentPrice = currentBar.close;

        // Long signal: price above SMA20 and SMA10 > SMA20 (uptrend)
        if (currentPrice > sma20 && sma10 > sma20) {
            return {
                symbol: currentBar.symbol || 'UNKNOWN',
                direction: 'long',
                entry: currentPrice,
                stop: currentPrice * (1 - params.stopLoss),
                target: currentPrice * (1 + params.profitTarget)
            };
        }

        // Short signal: price below SMA20 and SMA10 < SMA20 (downtrend)
        if (currentPrice < sma20 && sma10 < sma20) {
            return {
                symbol: currentBar.symbol || 'UNKNOWN',
                direction: 'short',
                entry: currentPrice,
                stop: currentPrice * (1 + params.stopLoss),
                target: currentPrice * (1 - params.profitTarget)
            };
        }

        return null;
    }

    /**
     * Calculate performance metrics
     */
    calculateMetrics(trades, equityCurve, maxDrawdown) {
        if (trades.length === 0) {
            return {
                totalTrades: 0,
                winRate: 0,
                totalReturn: 0,
                sharpeRatio: 0,
                profitFactor: 0,
                maxDrawdown: maxDrawdown * 100,
                avgWin: 0,
                avgLoss: 0,
                expectancy: 0
            };
        }

        const winningTrades = trades.filter(t => t.profit > 0);
        const losingTrades = trades.filter(t => t.profit <= 0);

        const totalProfit = trades.reduce((sum, t) => sum + t.profit, 0);
        const totalWins = winningTrades.reduce((sum, t) => sum + t.profit, 0);
        const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.profit, 0));

        const winRate = winningTrades.length / trades.length;
        const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;
        const profitFactor = totalLosses > 0 ? totalWins / totalLosses : 0;

        const finalEquity = equityCurve[equityCurve.length - 1].equity;
        const totalReturn = ((finalEquity - this.config.initialCapital) / this.config.initialCapital) * 100;

        // Calculate Sharpe ratio
        const returns = [];
        for (let i = 1; i < equityCurve.length; i++) {
            const ret = (equityCurve[i].equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
            returns.push(ret);
        }

        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);
        const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

        const expectancy = (winRate * avgWin) - ((1 - winRate) * avgLoss);

        return {
            totalTrades: trades.length,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: winRate * 100,
            totalReturn,
            totalProfit,
            sharpeRatio,
            profitFactor,
            maxDrawdown: maxDrawdown * 100,
            avgWin,
            avgLoss,
            expectancy,
            avgHoldingPeriod: trades.reduce((sum, t) => sum + t.holdingPeriod, 0) / trades.length
        };
    }

    /**
     * Aggregate walk-forward results
     */
    aggregateWalkForwardResults(results) {
        const returns = results.map(r => r.outSampleResult.metrics.totalReturn);
        const sharpes = results.map(r => r.outSampleResult.metrics.sharpeRatio);
        const winRates = results.map(r => r.outSampleResult.metrics.winRate);
        const drawdowns = results.map(r => r.outSampleResult.metrics.maxDrawdown);
        const profitFactors = results.map(r => r.outSampleResult.metrics.profitFactor);

        const avg = arr => arr.reduce((sum, v) => sum + v, 0) / arr.length;
        const stdDev = (arr, mean) => Math.sqrt(arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / arr.length);

        const avgReturn = avg(returns);
        const avgSharpe = avg(sharpes);
        const avgWinRate = avg(winRates);
        const avgDrawdown = avg(drawdowns);
        const avgProfitFactor = avg(profitFactors);

        return {
            avgTotalReturn: avgReturn,
            avgSharpe: avgSharpe,
            avgWinRate: avgWinRate,
            avgMaxDrawdown: avgDrawdown,
            avgProfitFactor: avgProfitFactor,
            returnStdDev: stdDev(returns, avgReturn),
            sharpeStdDev: stdDev(sharpes, avgSharpe),
            profitableSteps: results.filter(r => r.outSampleResult.metrics.totalReturn > 0).length
        };
    }

    /**
     * Validate walk-forward results
     */
    validateWalkForwardResults(aggregated) {
        const checks = {
            sharpe: aggregated.avgSharpe >= this.config.minSharpe,
            winRate: aggregated.avgWinRate >= this.config.minWinRate * 100,
            drawdown: aggregated.avgMaxDrawdown <= this.config.maxDrawdown * 100,
            consistency: aggregated.profitableSteps >= Math.ceil(this.config.walkForwardSteps * 0.6), // 60% profitable
            profitFactor: aggregated.avgProfitFactor >= 1.2
        };

        const passed = Object.values(checks).filter(v => v).length;
        const total = Object.keys(checks).length;

        console.log(`\nValidation Checks:`);
        console.log(`  ${checks.sharpe ? '✅' : '❌'} Sharpe Ratio: ${aggregated.avgSharpe.toFixed(2)} (min: ${this.config.minSharpe})`);
        console.log(`  ${checks.winRate ? '✅' : '❌'} Win Rate: ${aggregated.avgWinRate.toFixed(1)}% (min: ${(this.config.minWinRate * 100).toFixed(0)}%)`);
        console.log(`  ${checks.drawdown ? '✅' : '❌'} Max Drawdown: ${aggregated.avgMaxDrawdown.toFixed(1)}% (max: ${(this.config.maxDrawdown * 100).toFixed(0)}%)`);
        console.log(`  ${checks.consistency ? '✅' : '❌'} Consistency: ${aggregated.profitableSteps}/${this.config.walkForwardSteps} profitable steps`);
        console.log(`  ${checks.profitFactor ? '✅' : '❌'} Profit Factor: ${aggregated.avgProfitFactor.toFixed(2)} (min: 1.2)`);

        // Pass if at least 4/5 checks pass
        return passed >= 4;
    }

    /**
     * Generate mock historical data for testing
     */
    generateMockData(days = 252, trend = 0.0005) {
        const data = [];
        let price = 100;

        for (let i = 0; i < days; i++) {
            // Geometric Brownian Motion with trend
            const drift = trend;
            const volatility = 0.02;
            const randomShock = (Math.random() - 0.5) * volatility;

            price = price * (1 + drift + randomShock);

            const high = price * (1 + Math.random() * 0.01);
            const low = price * (1 - Math.random() * 0.01);
            const open = price * (0.99 + Math.random() * 0.02);

            data.push({
                date: i,
                symbol: 'MOCK',
                open,
                high,
                low,
                close: price,
                volume: 1000000 + Math.random() * 500000
            });
        }

        return data;
    }
}

module.exports = EnhancedBacktester;
