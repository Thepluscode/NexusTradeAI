/**
 * PHASE 2: Multi-Timeframe Confirmation Module
 * 
 * Only enters trades when multiple timeframes agree on direction.
 * Higher timeframe = trend filter, lower timeframe = entry timing.
 * 
 * Timeframe hierarchy:
 *   Daily  → Primary trend direction (mandatory filter)
 *   4H     → Swing direction confirmation
 *   1H     → Entry timing via pullback to EMA21
 *   15m    → Precise entry trigger (RSI oversold in uptrend)
 * 
 * Usage:
 *   const mtf = new MultiTimeframeConfirmation();
 *   mtf.updateTimeframe('daily', priceHistory);
 *   mtf.updateTimeframe('4h', priceHistory4h);
 *   const signal = mtf.getConfirmedSignal(currentPrice);
 */

class MultiTimeframeConfirmation {
    constructor(config = {}) {
        this.config = {
            emaFast: config.emaFast || 10,
            emaSlow: config.emaSlow || 21,
            rsiPeriod: config.rsiPeriod || 14,
            rsiOversold: config.rsiOversold || 35,
            rsiOverbought: config.rsiOverbought || 65,
            minTimeframesAgreeing: config.minTimeframesAgreeing || 2
        };

        // Timeframe data stores
        this.timeframes = {
            daily: { trend: 'neutral', strength: 0, ema10: 0, ema21: 0, lastUpdate: 0 },
            '4h': { trend: 'neutral', strength: 0, ema10: 0, ema21: 0, lastUpdate: 0 },
            '1h': { trend: 'neutral', strength: 0, ema10: 0, ema21: 0, rsi: 50, lastUpdate: 0 },
            '15m': { trend: 'neutral', strength: 0, ema10: 0, ema21: 0, rsi: 50, lastUpdate: 0 }
        };
    }

    /**
     * Update a specific timeframe with price data
     * @param {string} timeframe - 'daily', '4h', '1h', '15m'
     * @param {Array} priceHistory - Array of { close, high, low, timestamp }
     */
    updateTimeframe(timeframe, priceHistory) {
        if (!this.timeframes[timeframe]) return;
        if (!priceHistory || priceHistory.length < 25) return;

        const closes = priceHistory.map(h => h.close);

        // Calculate EMAs
        const ema10 = this.calculateEMA(closes, this.config.emaFast);
        const ema21 = this.calculateEMA(closes, this.config.emaSlow);

        // Determine trend
        let trend = 'neutral';
        const spread = (ema10 - ema21) / ema21;

        if (ema10 > ema21 && spread > 0.001) {
            trend = 'bullish';
        } else if (ema10 < ema21 && spread < -0.001) {
            trend = 'bearish';
        }

        // Calculate RSI for lower timeframes
        let rsi = 50;
        if (timeframe === '1h' || timeframe === '15m') {
            rsi = this.calculateRSI(closes, this.config.rsiPeriod);
        }

        // Trend strength: how far apart the EMAs are
        const strength = Math.abs(spread);

        this.timeframes[timeframe] = {
            trend,
            strength,
            ema10,
            ema21,
            rsi,
            lastUpdate: Date.now(),
            currentPrice: closes[closes.length - 1]
        };
    }

    /**
     * Simulate multi-timeframe from single-timeframe data
     * Creates pseudo-higher timeframes by resampling the hourly data
     */
    updateFromSingleTimeframe(priceHistory) {
        if (!priceHistory || priceHistory.length < 50) return;

        // Use full history as "daily" trend
        this.updateTimeframe('daily', priceHistory);

        // Use last 30 bars as "4h" swing
        const bars4h = priceHistory.slice(-30);
        this.updateTimeframe('4h', bars4h);

        // Use last 20 bars as "1h" entry timing
        const bars1h = priceHistory.slice(-20);
        this.updateTimeframe('1h', bars1h);

        // Use last 10 bars as "15m" precision entry
        // Weight more recent data
        const bars15m = priceHistory.slice(-15);
        this.updateTimeframe('15m', bars15m);
    }

    /**
     * Get confirmed signal — only fires when multiple timeframes agree
     * @returns {{ shouldEnter, direction, confidence, reason, timeframeAlignment }}
     */
    getConfirmedSignal(currentPrice) {
        const tf = this.timeframes;

        // Count bullish and bearish timeframes
        const bullish = [];
        const bearish = [];

        for (const [name, data] of Object.entries(tf)) {
            if (data.trend === 'bullish') bullish.push(name);
            if (data.trend === 'bearish') bearish.push(name);
        }

        const result = {
            shouldEnter: false,
            direction: 'neutral',
            confidence: 0,
            reason: '',
            timeframeAlignment: {
                daily: tf.daily.trend,
                '4h': tf['4h'].trend,
                '1h': tf['1h'].trend,
                '15m': tf['15m'].trend,
                bullishCount: bullish.length,
                bearishCount: bearish.length
            }
        };

        const minAgreeing = this.config.minTimeframesAgreeing;

        // LONG SIGNAL: Multiple timeframes bullish + lower TF has entry setup
        if (bullish.length >= minAgreeing && tf.daily.trend === 'bullish') {
            // Entry timing: RSI pullback on lower timeframe
            const entryOK = tf['1h'].rsi < this.config.rsiOversold + 15 || // Pullback
                tf['15m'].rsi < this.config.rsiOversold;        // Strong pullback

            if (entryOK || bullish.length >= 3) {
                result.shouldEnter = true;
                result.direction = 'long';
                result.confidence = Math.min(0.95, 0.5 + bullish.length * 0.12);
                result.reason = `MTF LONG: ${bullish.join('+')} aligned (RSI 1h=${tf['1h'].rsi.toFixed(0)})`;
            }
        }

        // SHORT SIGNAL: Multiple timeframes bearish + lower TF has entry setup
        if (bearish.length >= minAgreeing && tf.daily.trend === 'bearish') {
            const entryOK = tf['1h'].rsi > this.config.rsiOverbought - 15 ||
                tf['15m'].rsi > this.config.rsiOverbought;

            if (entryOK || bearish.length >= 3) {
                result.shouldEnter = true;
                result.direction = 'short';
                result.confidence = Math.min(0.95, 0.5 + bearish.length * 0.12);
                result.reason = `MTF SHORT: ${bearish.join('+')} aligned (RSI 1h=${tf['1h'].rsi.toFixed(0)})`;
            }
        }

        return result;
    }

    /**
     * Calculate Exponential Moving Average
     */
    calculateEMA(data, period) {
        if (data.length < period) return data[data.length - 1] || 0;

        const multiplier = 2 / (period + 1);
        let ema = data.slice(0, period).reduce((s, v) => s + v, 0) / period;

        for (let i = period; i < data.length; i++) {
            ema = (data[i] - ema) * multiplier + ema;
        }

        return ema;
    }

    /**
     * Calculate RSI
     */
    calculateRSI(data, period = 14) {
        if (data.length < period + 1) return 50;

        const changes = [];
        for (let i = 1; i < data.length; i++) {
            changes.push(data[i] - data[i - 1]);
        }

        const recent = changes.slice(-period);
        const gains = recent.map(c => c > 0 ? c : 0);
        const losses = recent.map(c => c < 0 ? Math.abs(c) : 0);

        const avgGain = gains.reduce((s, g) => s + g, 0) / period;
        const avgLoss = losses.reduce((s, l) => s + l, 0) / period;

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Get status for logging
     */
    getStatus() {
        const tf = this.timeframes;
        return {
            daily: tf.daily.trend,
            '4h': tf['4h'].trend,
            '1h': { trend: tf['1h'].trend, rsi: tf['1h'].rsi },
            '15m': { trend: tf['15m'].trend, rsi: tf['15m'].rsi }
        };
    }
}

module.exports = MultiTimeframeConfirmation;
