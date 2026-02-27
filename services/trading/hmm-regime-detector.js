/**
 * WEEK 4+ IMPROVEMENT: Hidden Markov Model for Market Regime Detection
 *
 * Uses HMM to detect market regimes (bull, bear, sideways) more accurately
 * than simple VIX-based detection.
 */

class HMMRegimeDetector {
    constructor(config = {}) {
        this.config = {
            states: config.states || ['bull', 'bear', 'sideways'],
            historyLength: config.historyLength || 50,
            updateInterval: config.updateInterval || 300000 // 5 minutes
        };

        this.priceHistory = [];
        this.currentRegime = 'sideways';
        this.regimeProbabilities = {
            bull: 0.33,
            bear: 0.33,
            sideways: 0.34
        };
        this.lastUpdate = null;

        // HMM parameters (simplified Baum-Welch would calibrate these)
        this.transitionMatrix = {
            bull: { bull: 0.7, bear: 0.1, sideways: 0.2 },
            bear: { bull: 0.1, bear: 0.7, sideways: 0.2 },
            sideways: { bull: 0.25, bear: 0.25, sideways: 0.5 }
        };

        // Emission probabilities (what we observe in each state)
        this.emissionParams = {
            bull: { meanReturn: 0.001, volatility: 0.015 },     // Positive returns, moderate vol
            bear: { meanReturn: -0.001, volatility: 0.025 },    // Negative returns, high vol
            sideways: { meanReturn: 0.0001, volatility: 0.010 } // Near-zero returns, low vol
        };
    }

    /**
     * Update regime detection with new price data
     */
    update(price) {
        const now = Date.now();

        // Add price to history
        this.priceHistory.push({ price, timestamp: now });

        // Keep only recent history
        if (this.priceHistory.length > this.config.historyLength) {
            this.priceHistory.shift();
        }

        // Only update regime if enough time has passed
        if (this.lastUpdate && now - this.lastUpdate < this.config.updateInterval) {
            return this.currentRegime;
        }

        // Need enough data to detect regime
        if (this.priceHistory.length < 20) {
            return this.currentRegime;
        }

        this.lastUpdate = now;

        // Calculate features from price history
        const features = this.calculateFeatures();

        // Run Viterbi algorithm to find most likely state
        const newRegime = this.viterbiDecode(features);

        // Log regime changes
        if (newRegime !== this.currentRegime) {
            console.log(`\n🔮 HMM Regime Change: ${this.currentRegime} → ${newRegime}`);
            console.log(`   Probabilities: Bull=${(this.regimeProbabilities.bull * 100).toFixed(1)}% | Bear=${(this.regimeProbabilities.bear * 100).toFixed(1)}% | Sideways=${(this.regimeProbabilities.sideways * 100).toFixed(1)}%`);
            this.currentRegime = newRegime;
        }

        return this.currentRegime;
    }

    /**
     * Calculate features from price history
     */
    calculateFeatures() {
        const prices = this.priceHistory.map(h => h.price);
        const returns = [];

        // Calculate returns
        for (let i = 1; i < prices.length; i++) {
            returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
        }

        // Feature 1: Mean return
        const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;

        // Feature 2: Volatility (standard deviation of returns)
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
        const volatility = Math.sqrt(variance);

        // Feature 3: Trend strength (linear regression slope)
        const trendStrength = this.calculateTrendStrength(prices);

        return {
            meanReturn,
            volatility,
            trendStrength
        };
    }

    /**
     * Calculate trend strength using linear regression
     */
    calculateTrendStrength(prices) {
        const n = prices.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = prices;

        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
        const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const avgPrice = sumY / n;

        // Normalize slope by average price
        return slope / avgPrice;
    }

    /**
     * Simplified Viterbi algorithm for regime detection
     */
    viterbiDecode(features) {
        const states = this.config.states;
        const probabilities = {};

        // Calculate emission probabilities for each state
        for (const state of states) {
            const params = this.emissionParams[state];

            // Gaussian probability for mean return
            const returnProb = this.gaussianProb(features.meanReturn, params.meanReturn, params.volatility);

            // Volatility match (lower is better for predicted volatility)
            const volDiff = Math.abs(features.volatility - params.volatility);
            const volProb = Math.exp(-volDiff * 20); // Exponential decay

            // Combine probabilities
            probabilities[state] = returnProb * volProb * this.regimeProbabilities[state];
        }

        // Update regime probabilities (Bayesian update)
        const totalProb = Object.values(probabilities).reduce((sum, p) => sum + p, 0);
        for (const state of states) {
            this.regimeProbabilities[state] = probabilities[state] / totalProb;
        }

        // Return state with highest probability
        return Object.keys(probabilities).reduce((a, b) =>
            probabilities[a] > probabilities[b] ? a : b
        );
    }

    /**
     * Gaussian probability density function
     */
    gaussianProb(x, mean, stdDev) {
        const exponent = -Math.pow(x - mean, 2) / (2 * Math.pow(stdDev, 2));
        return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(exponent);
    }

    /**
     * Get current regime
     */
    getCurrentRegime() {
        return {
            regime: this.currentRegime,
            probabilities: { ...this.regimeProbabilities },
            confidence: Math.max(...Object.values(this.regimeProbabilities))
        };
    }

    /**
     * Get regime-specific trading parameters
     */
    getRegimeParameters() {
        const regime = this.currentRegime;

        switch (regime) {
            case 'bull':
                return {
                    regime: 'bull',
                    biasDirection: 'long',
                    positionSizeMultiplier: 1.2,
                    stopLossMultiplier: 0.9,    // Tighter stops in bull market
                    profitTargetMultiplier: 1.3, // Higher targets
                    maxPositions: 12
                };

            case 'bear':
                return {
                    regime: 'bear',
                    biasDirection: 'short',
                    positionSizeMultiplier: 0.6,
                    stopLossMultiplier: 1.5,     // Wider stops in bear market
                    profitTargetMultiplier: 1.2,
                    maxPositions: 5
                };

            case 'sideways':
            default:
                return {
                    regime: 'sideways',
                    biasDirection: 'neutral',
                    positionSizeMultiplier: 0.8,
                    stopLossMultiplier: 1.0,
                    profitTargetMultiplier: 0.9,  // Lower targets in range
                    maxPositions: 8
                };
        }
    }
}

module.exports = HMMRegimeDetector;
