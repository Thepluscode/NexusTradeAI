/**
 * Smart AI Predictor
 * Uses technical analysis instead of random predictions
 * Improves win rate by analyzing actual price trends
 */

class SmartAIPredictor {
    constructor() {
        this.priceHistory = new Map(); // Store price history for each symbol
        this.predictions = new Map(); // Cache recent predictions
    }

    /**
     * Add price data point for a symbol
     */
    addPriceData(symbol, price, timestamp = Date.now()) {
        if (!this.priceHistory.has(symbol)) {
            this.priceHistory.set(symbol, []);
        }

        const history = this.priceHistory.get(symbol);
        history.push({ price, timestamp });

        // Keep only last 50 data points
        if (history.length > 50) {
            history.shift();
        }
    }

    /**
     * Generate smart prediction based on technical analysis
     */
    getPrediction(symbol, strategy = 'ensemble') {
        const history = this.priceHistory.get(symbol);

        if (!history || history.length < 10) {
            // Not enough data - return neutral/low confidence
            return {
                direction: Math.random() > 0.5 ? 'up' : 'down',
                confidence: 0.60, // Low confidence
                tradable: false,
                reason: 'Insufficient price history'
            };
        }

        // Calculate technical indicators
        const indicators = this.calculateIndicators(history);

        // Determine direction based on multiple factors
        let upScore = 0;
        let downScore = 0;

        // 1. Trend Analysis (40% weight)
        if (indicators.trend === 'bullish') {
            upScore += 0.40;
        } else if (indicators.trend === 'bearish') {
            downScore += 0.40;
        } else {
            upScore += 0.20;
            downScore += 0.20;
        }

        // 2. Momentum Analysis (30% weight)
        if (indicators.momentum > 0.01) {
            upScore += 0.30;
        } else if (indicators.momentum < -0.01) {
            downScore += 0.30;
        } else {
            upScore += 0.15;
            downScore += 0.15;
        }

        // 3. Mean Reversion Analysis (20% weight)
        if (indicators.meanReversion === 'oversold') {
            upScore += 0.20;
        } else if (indicators.meanReversion === 'overbought') {
            downScore += 0.20;
        } else {
            upScore += 0.10;
            downScore += 0.10;
        }

        // 4. Volatility Analysis (10% weight)
        if (indicators.volatility < 0.015) {
            // Low volatility - neutral
            upScore += 0.05;
            downScore += 0.05;
        } else if (indicators.volatility < 0.05) {
            // Normal volatility - slight bonus
            upScore += 0.10;
            downScore += 0.10;
        }
        // High volatility - no bonus

        // Determine final prediction
        const direction = upScore > downScore ? 'up' : 'down';
        const confidence = Math.max(upScore, downScore);

        // Quality check - only trade high-confidence signals
        const tradable = confidence >= 0.75 && indicators.volatility < 0.06;

        const prediction = {
            direction,
            confidence: Math.min(0.95, confidence + 0.05), // Add small bonus, cap at 95%
            tradable,
            reason: tradable ? 'High quality signal' : 'Signal quality insufficient',
            indicators: {
                trend: indicators.trend,
                momentum: indicators.momentum.toFixed(4),
                meanReversion: indicators.meanReversion,
                volatility: indicators.volatility.toFixed(4)
            }
        };

        // Cache prediction
        this.predictions.set(symbol, {
            prediction,
            timestamp: Date.now()
        });

        return prediction;
    }

    /**
     * Calculate technical indicators from price history
     */
    calculateIndicators(history) {
        const prices = history.map(h => h.price);
        const currentPrice = prices[prices.length - 1];

        // 1. Trend Analysis (using SMA)
        const sma20 = this.calculateSMA(prices, 20);
        const sma10 = this.calculateSMA(prices, 10);

        let trend = 'neutral';
        if (currentPrice > sma20 && sma10 > sma20) {
            trend = 'bullish';
        } else if (currentPrice < sma20 && sma10 < sma20) {
            trend = 'bearish';
        }

        // 2. Momentum (rate of change)
        const momentum = prices.length >= 5
            ? (currentPrice - prices[prices.length - 5]) / prices[prices.length - 5]
            : 0;

        // 3. Mean Reversion (RSI-like)
        const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
        const deviation = (currentPrice - avgPrice) / avgPrice;

        let meanReversion = 'neutral';
        if (deviation > 0.03) {
            meanReversion = 'overbought';
        } else if (deviation < -0.03) {
            meanReversion = 'oversold';
        }

        // 4. Volatility (standard deviation)
        const variance = prices.reduce((sum, p) =>
            sum + Math.pow(p - avgPrice, 2), 0) / prices.length;
        const volatility = Math.sqrt(variance) / avgPrice;

        return {
            trend,
            momentum,
            meanReversion,
            volatility,
            sma20,
            sma10,
            currentPrice
        };
    }

    /**
     * Calculate Simple Moving Average
     */
    calculateSMA(prices, period) {
        if (prices.length < period) {
            period = prices.length;
        }

        const slice = prices.slice(-period);
        return slice.reduce((sum, p) => sum + p, 0) / slice.length;
    }

    /**
     * Get cached prediction if recent (< 30 seconds old)
     */
    getCachedPrediction(symbol) {
        const cached = this.predictions.get(symbol);

        if (cached && (Date.now() - cached.timestamp < 30000)) {
            return cached.prediction;
        }

        return null;
    }

    /**
     * Clear old price history (for memory management)
     */
    clearOldHistory(maxAgeMs = 3600000) { // 1 hour
        const now = Date.now();

        for (const [symbol, history] of this.priceHistory) {
            const filtered = history.filter(h => now - h.timestamp < maxAgeMs);

            if (filtered.length === 0) {
                this.priceHistory.delete(symbol);
            } else {
                this.priceHistory.set(symbol, filtered);
            }
        }
    }
}

module.exports = SmartAIPredictor;
