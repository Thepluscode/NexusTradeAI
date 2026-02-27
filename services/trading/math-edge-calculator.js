/**
 * Mathematical Edge Calculator
 *
 * Quantifies trading edge using statistical and probability-based methods.
 * Ensures every trade has positive expected value (EV) before execution.
 *
 * Key Concepts:
 * 1. Expected Value (EV) = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)
 * 2. Kelly Criterion = (p × r - q) / r where p=win rate, q=loss rate, r=win/loss ratio
 * 3. Probability of Profit = P(price reaches target before stop)
 * 4. Edge Ratio = EV / Risk
 * 5. Statistical Significance = Z-score confidence level
 */

const EventEmitter = require('events');

class MathEdgeCalculator extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            minSampleSize: config.minSampleSize || 30, // Minimum trades for statistical validity
            minWinRate: config.minWinRate || 0.45, // 45% minimum win rate
            minRewardRisk: config.minRewardRisk || 1.5, // 1.5:1 minimum R:R
            minExpectedValue: config.minExpectedValue || 0.02, // 2% minimum EV
            minConfidenceLevel: config.minConfidenceLevel || 0.90, // 90% confidence
            minEdgeRatio: config.minEdgeRatio || 0.5, // 50% edge ratio
            decayFactor: config.decayFactor || 0.95, // Recent trades weighted more heavily
            ...config
        };

        // Store performance history by strategy and symbol
        this.performanceHistory = new Map();

        // Store edge calculations
        this.currentEdge = new Map();

        // Store probability models
        this.probabilityModels = new Map();
    }

    /**
     * Calculate mathematical edge for a proposed trade
     * Returns edge metrics and approval decision
     */
    calculateTradeEdge(signal) {
        const { symbol, strategy, entry, stopLoss, takeProfit, confidence } = signal;

        // Get historical performance for this strategy/symbol
        const history = this.getStrategyHistory(strategy, symbol);

        // Calculate core metrics
        const expectedValue = this.calculateExpectedValue(history, signal);
        const probabilityOfProfit = this.calculateProbabilityOfProfit(signal, history);
        const rewardRiskRatio = this.calculateRewardRisk(entry, stopLoss, takeProfit);
        const kellyFraction = this.calculateKellyCriterion(history);
        const edgeRatio = this.calculateEdgeRatio(expectedValue, signal);
        const confidenceInterval = this.calculateConfidenceInterval(history);
        const statisticalSignificance = this.calculateStatisticalSignificance(history);

        // Edge validation checks
        const validations = {
            sufficientSampleSize: history.totalTrades >= this.config.minSampleSize,
            positiveEV: expectedValue > this.config.minExpectedValue,
            adequateWinRate: history.winRate >= this.config.minWinRate,
            goodRewardRisk: rewardRiskRatio >= this.config.minRewardRisk,
            significantEdge: edgeRatio >= this.config.minEdgeRatio,
            statisticallySignificant: statisticalSignificance.pValue < (1 - this.config.minConfidenceLevel)
        };

        const hasEdge = Object.values(validations).every(v => v === true);

        const edge = {
            symbol,
            strategy,
            // Core edge metrics
            expectedValue: expectedValue.toFixed(4),
            probabilityOfProfit: probabilityOfProfit.toFixed(4),
            rewardRiskRatio: rewardRiskRatio.toFixed(2),
            kellyFraction: kellyFraction.toFixed(4),
            edgeRatio: edgeRatio.toFixed(4),

            // Statistical validity
            sampleSize: history.totalTrades,
            confidenceInterval: {
                lower: confidenceInterval.lower.toFixed(4),
                upper: confidenceInterval.upper.toFixed(4),
                level: confidenceInterval.level
            },
            statisticalSignificance: {
                zScore: statisticalSignificance.zScore.toFixed(2),
                pValue: statisticalSignificance.pValue.toFixed(4),
                significant: statisticalSignificance.significant
            },

            // Historical performance
            historicalWinRate: history.winRate.toFixed(4),
            historicalAvgWin: history.avgWin.toFixed(2),
            historicalAvgLoss: history.avgLoss.toFixed(2),
            historicalProfitFactor: history.profitFactor.toFixed(2),

            // Validation results
            validations,
            hasEdge,
            approved: hasEdge,

            // Recommended position size (Kelly)
            recommendedPositionSize: kellyFraction > 0 ? kellyFraction : 0,

            timestamp: Date.now()
        };

        // Store edge calculation
        const key = `${strategy}-${symbol}`;
        this.currentEdge.set(key, edge);

        // Emit edge calculation event
        this.emit('edgeCalculated', edge);

        return edge;
    }

    /**
     * Calculate Expected Value (EV) of a trade
     * EV = (Win Rate × Average Win) - (Loss Rate × Average Loss)
     */
    calculateExpectedValue(history, signal) {
        if (history.totalTrades === 0) {
            // No history - use theoretical EV based on R:R and confidence
            const { entry, stopLoss, takeProfit, confidence } = signal;
            const riskAmount = Math.abs(entry - stopLoss);
            const rewardAmount = Math.abs(takeProfit - entry);

            // Assume win rate based on confidence
            const estimatedWinRate = Math.max(0.45, confidence * 0.9);
            const estimatedLossRate = 1 - estimatedWinRate;

            return (estimatedWinRate * rewardAmount) - (estimatedLossRate * riskAmount);
        }

        // Use historical data with recency weighting
        const winRate = history.winRate;
        const lossRate = 1 - winRate;
        const avgWin = history.avgWin;
        const avgLoss = history.avgLoss;

        const ev = (winRate * avgWin) - (lossRate * avgLoss);
        return ev;
    }

    /**
     * Calculate Probability of Profit using distance to target vs distance to stop
     * Uses log-normal distribution assumption for price movements
     */
    calculateProbabilityOfProfit(signal, history) {
        const { entry, stopLoss, takeProfit, direction } = signal;

        // Calculate distance to target and stop
        const distanceToTarget = Math.abs(takeProfit - entry);
        const distanceToStop = Math.abs(entry - stopLoss);

        // Get volatility from history
        const volatility = this.estimateVolatility(history);

        // Use probability calculation based on win rate and distances
        if (history.totalTrades >= this.config.minSampleSize) {
            // Use historical win rate adjusted for current R:R
            const historicalRR = history.avgWin / Math.max(history.avgLoss, 1);
            const currentRR = distanceToTarget / Math.max(distanceToStop, 1);

            // Adjust historical win rate based on R:R difference
            const adjustment = Math.sqrt(historicalRR / Math.max(currentRR, 0.1));
            const adjustedWinRate = Math.min(0.95, Math.max(0.05, history.winRate * adjustment));

            return adjustedWinRate;
        }

        // No history - use theoretical model
        // Simplified: probability inversely related to R:R (higher target = lower probability)
        const rr = distanceToTarget / Math.max(distanceToStop, 1);
        const theoreticalWinRate = 1 / (1 + Math.sqrt(rr));

        return Math.max(0.35, Math.min(0.65, theoreticalWinRate));
    }

    /**
     * Calculate Reward:Risk Ratio
     */
    calculateRewardRisk(entry, stopLoss, takeProfit) {
        const risk = Math.abs(entry - stopLoss);
        const reward = Math.abs(takeProfit - entry);

        if (risk === 0) return 0;
        return reward / risk;
    }

    /**
     * Calculate Kelly Criterion for optimal position sizing
     * Kelly = (p × r - q) / r
     * where p = win probability, q = loss probability, r = win/loss ratio
     */
    calculateKellyCriterion(history) {
        if (history.totalTrades < this.config.minSampleSize) {
            return 0.02; // Conservative 2% if not enough data
        }

        const p = history.winRate;
        const q = 1 - p;
        const r = history.avgWin / Math.max(history.avgLoss, 1);

        // Kelly formula
        const kelly = (p * r - q) / r;

        // Return fractional Kelly (25% of full Kelly for safety)
        return Math.max(0, Math.min(0.2, kelly * 0.25));
    }

    /**
     * Calculate Edge Ratio = Expected Value / Risk
     * Measures how much edge you have per unit of risk
     */
    calculateEdgeRatio(expectedValue, signal) {
        const { entry, stopLoss } = signal;
        const risk = Math.abs(entry - stopLoss);

        if (risk === 0) return 0;
        return expectedValue / risk;
    }

    /**
     * Calculate Confidence Interval for win rate
     * Uses Wilson score interval for binomial proportion
     */
    calculateConfidenceInterval(history, confidenceLevel = 0.95) {
        if (history.totalTrades < 10) {
            return { lower: 0, upper: 1, level: confidenceLevel };
        }

        const n = history.totalTrades;
        const p = history.winRate;

        // Z-score for confidence level (95% = 1.96, 90% = 1.645)
        const z = confidenceLevel === 0.95 ? 1.96 : confidenceLevel === 0.90 ? 1.645 : 1.282;

        // Wilson score interval
        const denominator = 1 + (z * z) / n;
        const center = (p + (z * z) / (2 * n)) / denominator;
        const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;

        return {
            lower: Math.max(0, center - margin),
            upper: Math.min(1, center + margin),
            level: confidenceLevel
        };
    }

    /**
     * Calculate Statistical Significance (Z-test for proportion)
     * Tests if win rate is significantly different from 50% (coin flip)
     */
    calculateStatisticalSignificance(history) {
        if (history.totalTrades < this.config.minSampleSize) {
            return { zScore: 0, pValue: 1, significant: false };
        }

        const n = history.totalTrades;
        const p = history.winRate;
        const p0 = 0.5; // Null hypothesis: 50% win rate (no edge)

        // Z-score calculation
        const standardError = Math.sqrt((p0 * (1 - p0)) / n);
        const zScore = (p - p0) / standardError;

        // P-value (two-tailed test)
        const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

        // Significant if p-value < 0.05 (95% confidence) or 0.10 (90% confidence)
        const significant = pValue < (1 - this.config.minConfidenceLevel);

        return { zScore, pValue, significant };
    }

    /**
     * Normal cumulative distribution function (CDF)
     * Approximation using error function
     */
    normalCDF(x) {
        // Approximation of normal CDF
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

        return x > 0 ? 1 - prob : prob;
    }

    /**
     * Estimate volatility from trade history
     */
    estimateVolatility(history) {
        if (!history.recentTrades || history.recentTrades.length < 10) {
            return 0.25; // Default 25% annualized volatility
        }

        // Calculate standard deviation of returns
        const returns = history.recentTrades.map(t => t.returnPct);
        const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
        const stdDev = Math.sqrt(variance);

        // Annualize (assuming daily returns)
        return stdDev * Math.sqrt(252);
    }

    /**
     * Get strategy/symbol historical performance
     */
    getStrategyHistory(strategy, symbol = null) {
        const key = symbol ? `${strategy}-${symbol}` : strategy;

        if (this.performanceHistory.has(key)) {
            return this.performanceHistory.get(key);
        }

        // Return default empty history
        return {
            strategy,
            symbol,
            totalTrades: 0,
            winningTrades: 0,
            losingTrades: 0,
            winRate: 0.5, // Assume 50% initially
            avgWin: 100,
            avgLoss: 100,
            profitFactor: 1.0,
            expectancy: 0,
            recentTrades: []
        };
    }

    /**
     * Update strategy performance history with new trade result
     */
    updateStrategyHistory(trade) {
        const { strategy, symbol, profit, entry, exit } = trade;
        const key = symbol ? `${strategy}-${symbol}` : strategy;

        let history = this.performanceHistory.get(key) || this.getStrategyHistory(strategy, symbol);

        // Update trade counts
        history.totalTrades++;
        if (profit > 0) {
            history.winningTrades++;
        } else {
            history.losingTrades++;
        }

        // Calculate return percentage
        const returnPct = profit / (Math.abs(entry - exit) * 100); // Simplified

        // Add to recent trades (keep last 100)
        history.recentTrades.push({
            profit,
            returnPct,
            timestamp: Date.now()
        });

        if (history.recentTrades.length > 100) {
            history.recentTrades.shift();
        }

        // Recalculate metrics with recency weighting
        this.recalculateMetrics(history);

        // Store updated history
        this.performanceHistory.set(key, history);

        // Emit update event
        this.emit('historyUpdated', { strategy, symbol, history });
    }

    /**
     * Recalculate performance metrics with exponential weighting
     */
    recalculateMetrics(history) {
        // Apply exponential decay to give more weight to recent trades
        const trades = history.recentTrades;
        const decayFactor = this.config.decayFactor;

        let totalWeight = 0;
        let weightedWins = 0;
        let weightedLosses = 0;
        let weightedWinSum = 0;
        let weightedLossSum = 0;

        for (let i = 0; i < trades.length; i++) {
            const weight = Math.pow(decayFactor, trades.length - 1 - i);
            totalWeight += weight;

            if (trades[i].profit > 0) {
                weightedWins += weight;
                weightedWinSum += trades[i].profit * weight;
            } else {
                weightedLosses += weight;
                weightedLossSum += Math.abs(trades[i].profit) * weight;
            }
        }

        // Calculate weighted metrics
        history.winRate = totalWeight > 0 ? weightedWins / totalWeight : 0.5;
        history.avgWin = weightedWins > 0 ? weightedWinSum / weightedWins : 100;
        history.avgLoss = weightedLosses > 0 ? weightedLossSum / weightedLosses : 100;
        history.profitFactor = weightedLossSum > 0 ? weightedWinSum / weightedLossSum : 1.0;
        history.expectancy = (history.winRate * history.avgWin) - ((1 - history.winRate) * history.avgLoss);
    }

    /**
     * Get current edge for a strategy/symbol
     */
    getCurrentEdge(strategy, symbol = null) {
        const key = symbol ? `${strategy}-${symbol}` : strategy;
        return this.currentEdge.get(key);
    }

    /**
     * Get comprehensive edge report
     */
    getEdgeReport() {
        const report = {
            strategies: [],
            overallEdge: this.calculateOverallEdge(),
            timestamp: Date.now()
        };

        for (const [key, history] of this.performanceHistory) {
            const edge = this.currentEdge.get(key);
            report.strategies.push({
                key,
                history,
                currentEdge: edge,
                hasEdge: edge ? edge.hasEdge : false
            });
        }

        return report;
    }

    /**
     * Calculate overall portfolio edge across all strategies
     */
    calculateOverallEdge() {
        let totalTrades = 0;
        let totalWins = 0;
        let totalExpectancy = 0;

        for (const [key, history] of this.performanceHistory) {
            totalTrades += history.totalTrades;
            totalWins += history.winningTrades;
            totalExpectancy += history.expectancy * history.totalTrades;
        }

        const overallWinRate = totalTrades > 0 ? totalWins / totalTrades : 0;
        const overallExpectancy = totalTrades > 0 ? totalExpectancy / totalTrades : 0;

        return {
            overallWinRate: overallWinRate.toFixed(4),
            overallExpectancy: overallExpectancy.toFixed(2),
            totalStrategies: this.performanceHistory.size,
            totalTrades
        };
    }

    /**
     * Validate if trade meets minimum edge requirements
     */
    validateTradeEdge(signal) {
        const edge = this.calculateTradeEdge(signal);

        if (!edge.hasEdge) {
            const failedChecks = Object.entries(edge.validations)
                .filter(([key, value]) => !value)
                .map(([key]) => key);

            console.log(`❌ Trade rejected - insufficient edge for ${signal.symbol}`);
            console.log(`   Failed checks: ${failedChecks.join(', ')}`);
            console.log(`   Expected Value: ${edge.expectedValue} (min: ${this.config.minExpectedValue})`);
            console.log(`   Edge Ratio: ${edge.edgeRatio} (min: ${this.config.minEdgeRatio})`);
        } else {
            console.log(`✅ Trade approved - strong edge for ${signal.symbol}`);
            console.log(`   Expected Value: ${edge.expectedValue}`);
            console.log(`   Probability of Profit: ${(parseFloat(edge.probabilityOfProfit) * 100).toFixed(1)}%`);
            console.log(`   Edge Ratio: ${edge.edgeRatio}`);
            console.log(`   Kelly Position Size: ${(parseFloat(edge.recommendedPositionSize) * 100).toFixed(1)}%`);
        }

        return edge;
    }

    /**
     * Reset history (for testing)
     */
    reset() {
        this.performanceHistory.clear();
        this.currentEdge.clear();
        this.probabilityModels.clear();
    }
}

module.exports = MathEdgeCalculator;
