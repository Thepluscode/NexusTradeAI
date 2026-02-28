/**
 * PHASE 3: GARCH(1,1) Volatility Forecasting
 * 
 * Estimates forward-looking volatility using Generalized Autoregressive
 * Conditional Heteroskedasticity model.
 * 
 * Model: σ²(t) = ω + α·ε²(t-1) + β·σ²(t-1)
 * 
 * Where:
 *   ω = long-run variance weight
 *   α = ARCH coefficient (reaction to recent shocks)
 *   β = GARCH coefficient (persistence of volatility)
 *   ε = return residual (innovation)
 * 
 * Usage:
 *   const garch = new GARCHModel();
 *   garch.fit(priceHistory);
 *   const forecast = garch.forecast(5); // 5-period ahead
 */

class GARCHModel {
    constructor(config = {}) {
        // GARCH(1,1) parameters — initialized to common equity defaults
        this.omega = config.omega || 0.00001;   // ~0.001% long-run variance
        this.alpha = config.alpha || 0.10;       // Reaction to shocks
        this.beta = config.beta || 0.85;       // Persistence

        // Constraints: α + β < 1 for stationarity
        this.maxPersistence = 0.99;

        this.returns = [];
        this.conditionalVariances = [];
        this.isFitted = false;
        this.annualizationFactor = 252; // Trading days per year
    }

    /**
     * Fit GARCH(1,1) model to price data using Quasi-MLE
     */
    fit(priceHistory) {
        if (!priceHistory || priceHistory.length < 30) return false;

        const prices = priceHistory.map(h => h.close || h.price);

        // Calculate log returns
        this.returns = [];
        for (let i = 1; i < prices.length; i++) {
            this.returns.push(Math.log(prices[i] / prices[i - 1]));
        }

        if (this.returns.length < 20) return false;

        // Sample variance as initial σ²
        const meanReturn = this.returns.reduce((s, r) => s + r, 0) / this.returns.length;
        const sampleVar = this.returns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / this.returns.length;

        // Grid search for optimal parameters (simplified QMLE)
        let bestLogLik = -Infinity;
        let bestParams = { omega: this.omega, alpha: this.alpha, beta: this.beta };

        const alphaGrid = [0.05, 0.08, 0.10, 0.12, 0.15, 0.20];
        const betaGrid = [0.75, 0.80, 0.83, 0.85, 0.87, 0.90];

        for (const a of alphaGrid) {
            for (const b of betaGrid) {
                if (a + b >= this.maxPersistence) continue;

                const w = sampleVar * (1 - a - b); // Target unconditional variance
                if (w <= 0) continue;

                const logLik = this._logLikelihood(this.returns, w, a, b, sampleVar);
                if (logLik > bestLogLik) {
                    bestLogLik = logLik;
                    bestParams = { omega: w, alpha: a, beta: b };
                }
            }
        }

        this.omega = bestParams.omega;
        this.alpha = bestParams.alpha;
        this.beta = bestParams.beta;

        // Compute conditional variance series with optimal params
        this.conditionalVariances = this._computeVariances(this.returns, this.omega, this.alpha, this.beta, sampleVar);
        this.isFitted = true;

        return true;
    }

    /**
     * Gaussian log-likelihood for GARCH(1,1)
     */
    _logLikelihood(returns, omega, alpha, beta, initVar) {
        const variances = this._computeVariances(returns, omega, alpha, beta, initVar);
        let logLik = 0;

        for (let i = 0; i < returns.length; i++) {
            const v = variances[i];
            if (v <= 0) return -Infinity;
            logLik += -0.5 * (Math.log(2 * Math.PI) + Math.log(v) + Math.pow(returns[i], 2) / v);
        }

        return logLik;
    }

    /**
     * Compute conditional variance series
     */
    _computeVariances(returns, omega, alpha, beta, initVar) {
        const variances = new Array(returns.length);
        variances[0] = initVar;

        for (let i = 1; i < returns.length; i++) {
            variances[i] = omega + alpha * Math.pow(returns[i - 1], 2) + beta * variances[i - 1];
            // Floor at a small positive number
            if (variances[i] <= 0) variances[i] = 1e-8;
        }

        return variances;
    }

    /**
     * Forecast volatility h periods ahead
     * @returns {{ volatility, annualizedVol, confidenceInterval }}
     */
    forecast(horizon = 1) {
        if (!this.isFitted || this.conditionalVariances.length === 0) {
            return { volatility: 0.02, annualizedVol: 0.32, confidenceInterval: [0.20, 0.45] };
        }

        const lastVar = this.conditionalVariances[this.conditionalVariances.length - 1];
        const lastReturn = this.returns[this.returns.length - 1];

        // One-step ahead forecast
        let forecastVar = this.omega + this.alpha * Math.pow(lastReturn, 2) + this.beta * lastVar;

        // Multi-step forecast: convergence to unconditional variance
        const unconditionalVar = this.omega / (1 - this.alpha - this.beta);

        if (horizon > 1) {
            const persistence = this.alpha + this.beta;
            forecastVar = unconditionalVar + Math.pow(persistence, horizon) * (forecastVar - unconditionalVar);
        }

        const dailyVol = Math.sqrt(forecastVar);
        const annualizedVol = dailyVol * Math.sqrt(this.annualizationFactor);

        return {
            volatility: dailyVol,
            annualizedVol,
            variance: forecastVar,
            unconditionalVol: Math.sqrt(unconditionalVar),
            persistence: this.alpha + this.beta,
            confidenceInterval: [
                annualizedVol * 0.7,  // Lower bound (rough)
                annualizedVol * 1.4   // Upper bound (rough)
            ],
            parameters: {
                omega: this.omega,
                alpha: this.alpha,
                beta: this.beta
            }
        };
    }

    /**
     * Get optimal position size multiplier based on GARCH forecast
     * High vol forecast → smaller position, Low vol → larger
     */
    getPositionSizeMultiplier(targetVol = 0.15) {
        const forecast = this.forecast(1);
        if (forecast.annualizedVol <= 0) return 1.0;

        // Scale position to target constant portfolio volatility
        const multiplier = targetVol / forecast.annualizedVol;
        return Math.max(0.2, Math.min(2.0, multiplier)); // Clamp [0.2, 2.0]
    }

    /**
     * Get optimal stop-loss width based on GARCH forecast
     */
    getOptimalStopWidth(confidenceLevel = 0.95) {
        const forecast = this.forecast(1);
        // Z-score for confidence level (1.65 for 95%, 2.33 for 99%)
        const zScore = confidenceLevel >= 0.99 ? 2.33 : 1.65;
        return forecast.volatility * zScore;
    }
}

module.exports = GARCHModel;
