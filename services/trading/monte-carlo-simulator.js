/**
 * Monte Carlo Simulation Engine
 *
 * Simulates thousands of possible trading outcomes to estimate:
 * 1. Probability distributions of returns
 * 2. Risk of ruin
 * 3. Expected drawdown ranges
 * 4. Confidence intervals for performance metrics
 * 5. Optimal position sizing
 *
 * Uses historical trade data to generate realistic future scenarios.
 */

class MonteCarloSimulator {
    constructor(config = {}) {
        this.config = {
            simulations: config.simulations || 10000, // Number of Monte Carlo runs
            trades: config.trades || 252, // Number of trades to simulate per run
            initialCapital: config.initialCapital || 100000,
            confidenceLevels: config.confidenceLevels || [0.90, 0.95, 0.99], // 90%, 95%, 99%
            riskFreeRate: config.riskFreeRate || 0.02, // 2% annual risk-free rate
            ...config
        };

        this.simulationResults = [];
    }

    /**
     * Run Monte Carlo simulation based on historical trade distribution
     * @param {Array} historicalTrades - Array of past trade results {profit, returnPct}
     * @param {Number} tradesToSimulate - Number of trades to simulate (default: 252 - one year)
     */
    async runSimulation(historicalTrades, tradesToSimulate = null) {
        const numTrades = tradesToSimulate || this.config.trades;
        const numSims = this.config.simulations;

        console.log(`\n🎲 Running Monte Carlo Simulation...`);
        console.log(`   Simulations: ${numSims.toLocaleString()}`);
        console.log(`   Trades per simulation: ${numTrades}`);
        console.log(`   Historical sample: ${historicalTrades.length} trades`);
        console.log(`   Initial Capital: $${this.config.initialCapital.toLocaleString()}\n`);

        this.simulationResults = [];

        // Extract trade statistics from historical data
        const tradeStats = this.extractTradeStatistics(historicalTrades);

        // Run simulations
        for (let i = 0; i < numSims; i++) {
            const result = this.simulateTradingSequence(tradeStats, numTrades);
            this.simulationResults.push(result);

            if ((i + 1) % 1000 === 0) {
                console.log(`   Progress: ${i + 1}/${numSims} simulations completed`);
            }
        }

        // Analyze results
        const analysis = this.analyzeSimulationResults();

        // Print report
        this.printSimulationReport(analysis);

        return analysis;
    }

    /**
     * Extract statistical properties from historical trades
     */
    extractTradeStatistics(trades) {
        const wins = trades.filter(t => t.profit > 0);
        const losses = trades.filter(t => t.profit <= 0);

        const winRate = wins.length / trades.length;
        const avgWin = wins.reduce((sum, t) => sum + t.profit, 0) / Math.max(wins.length, 1);
        const avgLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0)) / Math.max(losses.length, 1);

        // Calculate distribution parameters
        const winReturns = wins.map(t => t.profit);
        const lossReturns = losses.map(t => Math.abs(t.profit));

        return {
            winRate,
            avgWin,
            avgLoss,
            winStdDev: this.calculateStdDev(winReturns),
            lossStdDev: this.calculateStdDev(lossReturns),
            profitFactor: avgLoss > 0 ? avgWin / avgLoss : 1,
            expectancy: (winRate * avgWin) - ((1 - winRate) * avgLoss),
            historicalTrades: trades // Store for bootstrap sampling
        };
    }

    /**
     * Simulate a sequence of trades
     */
    simulateTradingSequence(stats, numTrades) {
        let capital = this.config.initialCapital;
        let peakCapital = capital;
        let maxDrawdown = 0;
        let maxDrawdownDuration = 0;
        let currentDrawdownDuration = 0;

        const equity = [capital];
        const returns = [];
        const trades = [];

        for (let i = 0; i < numTrades; i++) {
            // Bootstrap sampling: randomly select a trade from historical distribution
            const isWin = Math.random() < stats.winRate;

            let profit;
            if (isWin) {
                // Sample from win distribution (assume normal distribution)
                profit = this.sampleNormal(stats.avgWin, stats.winStdDev);
                profit = Math.max(0, profit); // Ensure positive
            } else {
                // Sample from loss distribution
                profit = -this.sampleNormal(stats.avgLoss, stats.lossStdDev);
                profit = Math.min(0, profit); // Ensure negative
            }

            // Apply profit to capital
            capital += profit;
            equity.push(capital);
            returns.push(profit / Math.max(capital - profit, 1));

            trades.push({ profit, capital });

            // Track drawdown
            if (capital > peakCapital) {
                peakCapital = capital;
                currentDrawdownDuration = 0;
            } else {
                const drawdown = (peakCapital - capital) / peakCapital;
                maxDrawdown = Math.max(maxDrawdown, drawdown);
                currentDrawdownDuration++;
                maxDrawdownDuration = Math.max(maxDrawdownDuration, currentDrawdownDuration);
            }

            // Risk of ruin check
            if (capital <= 0) {
                return {
                    finalCapital: 0,
                    totalReturn: -100,
                    maxDrawdown: 1.0,
                    maxDrawdownDuration,
                    sharpeRatio: -999,
                    ruined: true,
                    tradesCompleted: i + 1,
                    equity,
                    returns
                };
            }
        }

        // Calculate performance metrics
        const totalReturn = ((capital - this.config.initialCapital) / this.config.initialCapital) * 100;

        // Sharpe ratio
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const returnStdDev = this.calculateStdDev(returns);
        const sharpeRatio = returnStdDev > 0
            ? ((avgReturn - this.config.riskFreeRate / 252) / returnStdDev) * Math.sqrt(252)
            : 0;

        return {
            finalCapital: capital,
            totalReturn,
            maxDrawdown,
            maxDrawdownDuration,
            sharpeRatio,
            ruined: false,
            tradesCompleted: numTrades,
            equity,
            returns
        };
    }

    /**
     * Analyze simulation results and generate statistics
     */
    analyzeSimulationResults() {
        const results = this.simulationResults;

        // Final capital distribution
        const finalCapitals = results.map(r => r.finalCapital).sort((a, b) => a - b);
        const returns = results.map(r => r.totalReturn).sort((a, b) => a - b);
        const drawdowns = results.map(r => r.maxDrawdown * 100).sort((a, b) => b - a);
        const sharpes = results.map(r => r.sharpeRatio).sort((a, b) => a - b);

        // Risk of ruin
        const ruinedCount = results.filter(r => r.ruined).length;
        const riskOfRuin = ruinedCount / results.length;

        // Percentiles
        const getPercentile = (arr, percentile) => {
            const index = Math.floor(arr.length * percentile);
            return arr[index];
        };

        // Calculate for each confidence level
        const confidenceIntervals = {};
        for (const level of this.config.confidenceLevels) {
            const lowerPercentile = (1 - level) / 2;
            const upperPercentile = level + lowerPercentile;

            confidenceIntervals[level] = {
                return: {
                    lower: getPercentile(returns, lowerPercentile),
                    median: getPercentile(returns, 0.5),
                    upper: getPercentile(returns, upperPercentile)
                },
                drawdown: {
                    best: getPercentile(drawdowns, 1 - upperPercentile),
                    median: getPercentile(drawdowns, 0.5),
                    worst: getPercentile(drawdowns, upperPercentile)
                },
                sharpe: {
                    lower: getPercentile(sharpes, lowerPercentile),
                    median: getPercentile(sharpes, 0.5),
                    upper: getPercentile(sharpes, upperPercentile)
                }
            };
        }

        // Probabilities
        const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const probProfit = results.filter(r => r.totalReturn > 0).length / results.length;
        const probDoubling = results.filter(r => r.finalCapital >= this.config.initialCapital * 2).length / results.length;
        const probHalving = results.filter(r => r.finalCapital <= this.config.initialCapital * 0.5).length / results.length;

        // Expected values
        const expectedFinalCapital = finalCapitals.reduce((sum, c) => sum + c, 0) / finalCapitals.length;
        const expectedReturn = avgReturn;
        const expectedDrawdown = drawdowns.reduce((sum, d) => sum + d, 0) / drawdowns.length;
        const expectedSharpe = sharpes.reduce((sum, s) => sum + s, 0) / sharpes.length;

        return {
            summary: {
                simulations: results.length,
                ruinedSimulations: ruinedCount,
                riskOfRuin: (riskOfRuin * 100).toFixed(2) + '%',
                probProfit: (probProfit * 100).toFixed(2) + '%',
                probDoubling: (probDoubling * 100).toFixed(2) + '%',
                probHalving: (probHalving * 100).toFixed(2) + '%'
            },
            expected: {
                finalCapital: expectedFinalCapital.toFixed(2),
                return: expectedReturn.toFixed(2) + '%',
                drawdown: expectedDrawdown.toFixed(2) + '%',
                sharpe: expectedSharpe.toFixed(2)
            },
            confidenceIntervals,
            distributions: {
                returns,
                drawdowns,
                sharpes,
                finalCapitals
            }
        };
    }

    /**
     * Print comprehensive simulation report
     */
    printSimulationReport(analysis) {
        console.log('\n' + '='.repeat(70));
        console.log('🎲 MONTE CARLO SIMULATION REPORT');
        console.log('='.repeat(70));

        console.log(`\n📊 SIMULATION SUMMARY:`);
        console.log(`   Total Simulations: ${analysis.summary.simulations.toLocaleString()}`);
        console.log(`   Risk of Ruin: ${analysis.summary.riskOfRuin}`);
        console.log(`   Probability of Profit: ${analysis.summary.probProfit}`);
        console.log(`   Probability of Doubling Capital: ${analysis.summary.probDoubling}`);
        console.log(`   Probability of Halving Capital: ${analysis.summary.probHalving}`);

        console.log(`\n💰 EXPECTED VALUES:`);
        console.log(`   Expected Final Capital: $${Number(analysis.expected.finalCapital).toLocaleString()}`);
        console.log(`   Expected Return: ${analysis.expected.return}`);
        console.log(`   Expected Max Drawdown: ${analysis.expected.drawdown}`);
        console.log(`   Expected Sharpe Ratio: ${analysis.expected.sharpe}`);

        for (const [level, intervals] of Object.entries(analysis.confidenceIntervals)) {
            const pct = (level * 100).toFixed(0);
            console.log(`\n📈 ${pct}% CONFIDENCE INTERVALS:`);

            console.log(`   Total Return:`);
            console.log(`      Lower: ${intervals.return.lower.toFixed(2)}%`);
            console.log(`      Median: ${intervals.return.median.toFixed(2)}%`);
            console.log(`      Upper: ${intervals.return.upper.toFixed(2)}%`);

            console.log(`   Max Drawdown:`);
            console.log(`      Best: ${intervals.drawdown.best.toFixed(2)}%`);
            console.log(`      Median: ${intervals.drawdown.median.toFixed(2)}%`);
            console.log(`      Worst: ${intervals.drawdown.worst.toFixed(2)}%`);

            console.log(`   Sharpe Ratio:`);
            console.log(`      Lower: ${intervals.sharpe.lower.toFixed(2)}`);
            console.log(`      Median: ${intervals.sharpe.median.toFixed(2)}`);
            console.log(`      Upper: ${intervals.sharpe.upper.toFixed(2)}`);
        }

        console.log('\n' + '='.repeat(70) + '\n');
    }

    /**
     * Calculate optimal position size using Monte Carlo
     * Tests different position sizes and finds the one with best risk-adjusted returns
     */
    async optimizePositionSize(historicalTrades, positionSizes = [0.02, 0.05, 0.10, 0.15, 0.20]) {
        console.log('\n🎯 Optimizing Position Size using Monte Carlo...\n');

        const results = [];

        for (const size of positionSizes) {
            // Adjust trade sizes
            const scaledTrades = historicalTrades.map(t => ({
                ...t,
                profit: t.profit * (size / 0.10) // Assume base is 10% position
            }));

            // Run simulation
            const original = this.config.trades;
            this.config.trades = 100; // Shorter simulation for optimization

            const analysis = await this.runSimulation(scaledTrades, 100);

            this.config.trades = original;

            results.push({
                positionSize: size,
                expectedReturn: parseFloat(analysis.expected.return),
                expectedDrawdown: parseFloat(analysis.expected.drawdown),
                expectedSharpe: parseFloat(analysis.expected.sharpe),
                riskOfRuin: parseFloat(analysis.summary.riskOfRuin),
                score: parseFloat(analysis.expected.sharpe) * (1 - parseFloat(analysis.summary.riskOfRuin) / 100)
            });

            console.log(`   Position Size ${(size * 100).toFixed(0)}%:`);
            console.log(`      Expected Return: ${results[results.length - 1].expectedReturn.toFixed(2)}%`);
            console.log(`      Expected Drawdown: ${results[results.length - 1].expectedDrawdown.toFixed(2)}%`);
            console.log(`      Sharpe Ratio: ${results[results.length - 1].expectedSharpe.toFixed(2)}`);
            console.log(`      Risk of Ruin: ${results[results.length - 1].riskOfRuin.toFixed(2)}%`);
            console.log(`      Score: ${results[results.length - 1].score.toFixed(2)}\n`);
        }

        // Find optimal size (highest score)
        const optimal = results.reduce((best, curr) => curr.score > best.score ? curr : best);

        console.log(`\n✅ Optimal Position Size: ${(optimal.positionSize * 100).toFixed(0)}%`);
        console.log(`   Expected Return: ${optimal.expectedReturn.toFixed(2)}%`);
        console.log(`   Expected Sharpe: ${optimal.expectedSharpe.toFixed(2)}`);
        console.log(`   Risk of Ruin: ${optimal.riskOfRuin.toFixed(2)}%\n`);

        return {
            optimalSize: optimal.positionSize,
            results
        };
    }

    /**
     * Sample from normal distribution (Box-Muller transform)
     */
    sampleNormal(mean, stdDev) {
        const u1 = Math.random();
        const u2 = Math.random();

        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

        return mean + z0 * stdDev;
    }

    /**
     * Calculate standard deviation
     */
    calculateStdDev(values) {
        if (values.length === 0) return 0;

        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

        return Math.sqrt(variance);
    }

    /**
     * Generate histogram of distribution
     */
    generateHistogram(data, bins = 20) {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const binWidth = (max - min) / bins;

        const histogram = new Array(bins).fill(0);

        for (const value of data) {
            const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
            histogram[binIndex]++;
        }

        return {
            bins: histogram,
            binWidth,
            min,
            max
        };
    }

    /**
     * Visualize return distribution (ASCII histogram)
     */
    visualizeReturns(analysis) {
        const returns = analysis.distributions.returns;
        const histogram = this.generateHistogram(returns, 20);

        console.log('\n📊 RETURN DISTRIBUTION:');
        console.log('─'.repeat(60));

        const maxCount = Math.max(...histogram.bins);

        for (let i = 0; i < histogram.bins.length; i++) {
            const binStart = histogram.min + i * histogram.binWidth;
            const binEnd = binStart + histogram.binWidth;
            const count = histogram.bins[i];
            const barLength = Math.floor((count / maxCount) * 40);
            const bar = '█'.repeat(barLength);

            console.log(`${binStart.toFixed(1).padStart(6)}% to ${binEnd.toFixed(1).padEnd(6)}% | ${bar} ${count}`);
        }

        console.log('─'.repeat(60) + '\n');
    }
}

module.exports = MonteCarloSimulator;
