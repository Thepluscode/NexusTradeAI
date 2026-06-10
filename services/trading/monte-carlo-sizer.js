/**
 * PHASE 3: Monte Carlo Position Sizing
 * 
 * Replaces fixed Kelly with Monte Carlo simulation to find optimal f*.
 * 
 * Algorithm:
 *   1. Collect historical trade returns
 *   2. Bootstrap 10,000 trade sequences (with replacement)
 *   3. For each f (fraction), simulate geometric equity growth
 *   4. Find f-star that maximizes terminal wealth median
 *   5. Use f-star / 2 (half-Kelly) for safety
    * 
 * Usage:
 *   const mc = new MonteCarloSizer();
 * mc.addTrade(0.02);   // +2% return
 * mc.addTrade(-0.01);  // -1% return
 *   const result = mc.optimize();
 *   // result.optimalFraction, result.halfKelly, result.maxDrawdownAtOptimal
 */

class MonteCarloSizer {
    constructor(config = {}) {
        this.config = {
            numSimulations: config.numSimulations || 10000,
            sequenceLength: config.sequenceLength || 100,  // trades per simulation
            fractionGrid: config.fractionGrid || this._generateFractionGrid(),
            maxFraction: config.maxFraction || 0.25,  // Never risk more than 25%
            minTrades: config.minTrades || 20          // Need 20+ trades to optimize
        };

        this.tradeReturns = [];
        this.lastOptimization = null;
    }

    /**
     * Generate fraction grid from 1% to 25% in 1% steps
     */
    _generateFractionGrid() {
        const grid = [];
        for (let f = 0.01; f <= 0.25; f += 0.01) {
            grid.push(Math.round(f * 100) / 100);
        }
        return grid;
    }

    /**
     * Add a trade return (as decimal, e.g., 0.02 for +2%)
     */
    addTrade(returnPct) {
        this.tradeReturns.push(returnPct);
        // Keep last 500 trades
        if (this.tradeReturns.length > 500) {
            this.tradeReturns.shift();
        }
    }

    /**
     * Add multiple trade returns
     */
    addTrades(returns) {
        for (const r of returns) {
            this.addTrade(r);
        }
    }

    /**
     * Run Monte Carlo optimization
     * @returns {{ optimalFraction, halfKelly, medianReturn, maxDrawdownAtOptimal, confidence }}
     */
    optimize() {
        if (this.tradeReturns.length < this.config.minTrades) {
            return {
                optimalFraction: 0.02,  // Default 2%
                halfKelly: 0.01,
                medianReturn: 0,
                maxDrawdownAtOptimal: 0,
                confidence: 'low',
                reason: `Need ${this.config.minTrades}+ trades (have ${this.tradeReturns.length})`
            };
        }

        const results = {};

        for (const f of this.config.fractionGrid) {
            const terminalWealths = [];
            const maxDrawdowns = [];

            for (let sim = 0; sim < this.config.numSimulations; sim++) {
                const { terminalWealth, maxDrawdown } = this._simulateSequence(f);
                terminalWealths.push(terminalWealth);
                maxDrawdowns.push(maxDrawdown);
            }

            // Use MEDIAN terminal wealth (robust to outliers)
            terminalWealths.sort((a, b) => a - b);
            const median = terminalWealths[Math.floor(terminalWealths.length / 2)];

            // Median max drawdown
            maxDrawdowns.sort((a, b) => a - b);
            const medianDD = maxDrawdowns[Math.floor(maxDrawdowns.length / 2)];

            // Probability of ruin (equity dropping below 50%)
            const ruinCount = terminalWealths.filter(w => w < 0.5).length;
            const ruinProb = ruinCount / this.config.numSimulations;

            results[f] = {
                fraction: f,
                medianTerminalWealth: median,
                medianMaxDrawdown: medianDD,
                ruinProbability: ruinProb,
                medianReturn: (median - 1) * 100  // As percentage
            };
        }

        // Find optimal: highest median terminal wealth with ruin prob < 5%
        let best = null;
        for (const r of Object.values(results)) {
            if (r.ruinProbability < 0.05) {
                if (!best || r.medianTerminalWealth > best.medianTerminalWealth) {
                    best = r;
                }
            }
        }

        // Fallback to lowest fraction if all have high ruin
        if (!best) {
            best = results[this.config.fractionGrid[0]];
        }

        const result = {
            optimalFraction: best.fraction,
            halfKelly: best.fraction / 2,
            medianReturn: best.medianReturn,
            maxDrawdownAtOptimal: best.medianMaxDrawdown,
            ruinProbability: best.ruinProbability,
            confidence: this.tradeReturns.length >= 50 ? 'high' : 'medium',
            sampleSize: this.tradeReturns.length,
            winRate: this.tradeReturns.filter(r => r > 0).length / this.tradeReturns.length
        };

        this.lastOptimization = result;
        return result;
    }

    /**
     * Simulate one sequence of trades with fraction f
     */
    _simulateSequence(fraction) {
        let equity = 1.0;
        let peak = 1.0;
        let maxDrawdown = 0;

        for (let i = 0; i < this.config.sequenceLength; i++) {
            // Bootstrap: random trade from history
            const idx = Math.floor(Math.random() * this.tradeReturns.length);
            const tradeReturn = this.tradeReturns[idx];

            // Apply fraction: equity change = f * tradeReturn
            equity *= (1 + fraction * tradeReturn);

            // Prevent negative equity
            if (equity <= 0) {
                return { terminalWealth: 0, maxDrawdown: 1.0 };
            }

            // Track drawdown
            if (equity > peak) peak = equity;
            const drawdown = (peak - equity) / peak;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }

        return { terminalWealth: equity, maxDrawdown };
    }

    /**
     * Get recommended position size for given equity
     */
    getRecommendedSize(equity) {
        const opt = this.lastOptimization || this.optimize();
        return {
            fraction: opt.halfKelly,
            dollarSize: equity * opt.halfKelly,
            reason: `Monte Carlo half-Kelly: ${(opt.halfKelly * 100).toFixed(1)}% (optimal: ${(opt.optimalFraction * 100).toFixed(1)}%)`,
            confidence: opt.confidence
        };
    }
}

module.exports = MonteCarloSizer;
