/**
 * NexusTradeAI - Advanced Strategy Engine
 * =========================================
 * Multi-strategy ensemble system with:
 * - Regime Detection (bull/bear/sideways/volatile)
 * - Multiple Signals: MA, RSI, MACD, Momentum, Volume
 * - Weighted Voting: Only enter when multiple strategies agree
 * - Confidence Threshold: Require 60%+ confidence
 * - Adaptive Position Sizing: Smaller positions in volatile regimes
 * 
 * Usage:
 *   const { AdvancedStrategyEngine } = require('./advanced-strategy-engine');
 *   const engine = new AdvancedStrategyEngine();
 *   const signal = engine.generateSignal(priceHistory);
 */

// ========================================
// MARKET REGIME TYPES
// ========================================
const MarketRegime = {
    TRENDING_UP: 'TRENDING_UP',
    TRENDING_DOWN: 'TRENDING_DOWN',
    MEAN_REVERTING: 'MEAN_REVERTING',
    HIGH_VOLATILITY: 'HIGH_VOLATILITY',
    LOW_VOLATILITY: 'LOW_VOLATILITY'
};

// ========================================
// REGIME-SPECIFIC CONFIGURATIONS
// ========================================
const REGIME_CONFIGS = {
    [MarketRegime.TRENDING_UP]: {
        entryThreshold: 0.02,      // 2% for breakout
        stopLossPct: 0.04,         // 4% stop
        takeProfitPct: 0.12,       // 12% target (3:1)
        positionSizeMultiplier: 1.0,
        maxPositions: 5,
        requiredConfidence: 0.55   // Lower threshold in trends
    },
    [MarketRegime.TRENDING_DOWN]: {
        entryThreshold: 0.03,      // 3% pullback for shorts
        stopLossPct: 0.05,
        takeProfitPct: 0.10,
        positionSizeMultiplier: 0.7, // Smaller positions
        maxPositions: 3,
        requiredConfidence: 0.65
    },
    [MarketRegime.MEAN_REVERTING]: {
        entryThreshold: 0.015,     // Fade extremes
        stopLossPct: 0.03,
        takeProfitPct: 0.06,
        positionSizeMultiplier: 0.8,
        maxPositions: 4,
        requiredConfidence: 0.60
    },
    [MarketRegime.HIGH_VOLATILITY]: {
        entryThreshold: 0.05,      // Very high threshold
        stopLossPct: 0.06,         // Wider stops
        takeProfitPct: 0.15,
        positionSizeMultiplier: 0.3, // MUCH smaller positions
        maxPositions: 2,
        requiredConfidence: 0.75   // Very high confidence required
    },
    [MarketRegime.LOW_VOLATILITY]: {
        entryThreshold: 0.01,
        stopLossPct: 0.02,
        takeProfitPct: 0.04,
        positionSizeMultiplier: 1.2, // Can take larger positions
        maxPositions: 5,
        requiredConfidence: 0.50
    }
};

// ========================================
// ADVANCED STRATEGY ENGINE CLASS
// ========================================
class AdvancedStrategyEngine {
    constructor(assetClass = 'stock') {
        this.assetClass = assetClass;
        this.currentRegime = MarketRegime.MEAN_REVERTING;
        this.regimeHistory = [];

        // Strategy weights (auto-adjusted based on performance)
        this.strategyWeights = {
            maCrossover: 0.20,
            rsi: 0.15,
            macd: 0.20,
            momentum: 0.10,
            volume: 0.10,
            bollingerSqueeze: 0.15,
            rsiDivergence: 0.10
        };

        // Performance tracking for auto-adjustment
        this.strategyPerformance = {
            maCrossover: { wins: 0, losses: 0, pnl: 0 },
            rsi: { wins: 0, losses: 0, pnl: 0 },
            macd: { wins: 0, losses: 0, pnl: 0 },
            momentum: { wins: 0, losses: 0, pnl: 0 },
            volume: { wins: 0, losses: 0, pnl: 0 },
            bollingerSqueeze: { wins: 0, losses: 0, pnl: 0 },
            rsiDivergence: { wins: 0, losses: 0, pnl: 0 }
        };

        // Bollinger Band history for squeeze detection
        this.bbWidthHistory = [];

        console.log(`🧠 Advanced Strategy Engine initialized (${assetClass})`);
    }

    // ========================================
    // REGIME DETECTION
    // ========================================

    detectRegime(priceHistory) {
        if (!priceHistory || priceHistory.length < 50) {
            return MarketRegime.MEAN_REVERTING;
        }

        const closes = priceHistory.map(h => h.close);

        // Calculate indicators for regime detection
        const sma20 = this.calculateSMA(closes, 20);
        const sma50 = this.calculateSMA(closes, 50);
        const volatility = this.calculateVolatility(closes, 20);
        const trend = this.calculateTrendStrength(closes);

        // High volatility check (> 3% daily moves)
        const avgVolatility = volatility[volatility.length - 1];
        if (avgVolatility > 0.03) {
            this.currentRegime = MarketRegime.HIGH_VOLATILITY;
            return this.currentRegime;
        }

        // Low volatility (< 0.5% daily moves)
        if (avgVolatility < 0.005) {
            this.currentRegime = MarketRegime.LOW_VOLATILITY;
            return this.currentRegime;
        }

        // Trend detection
        const currentSMA20 = sma20[sma20.length - 1];
        const currentSMA50 = sma50[sma50.length - 1];

        if (currentSMA20 > currentSMA50 * 1.01 && trend > 0.02) {
            this.currentRegime = MarketRegime.TRENDING_UP;
        } else if (currentSMA20 < currentSMA50 * 0.99 && trend < -0.02) {
            this.currentRegime = MarketRegime.TRENDING_DOWN;
        } else {
            this.currentRegime = MarketRegime.MEAN_REVERTING;
        }

        this.regimeHistory.push({
            timestamp: new Date(),
            regime: this.currentRegime,
            volatility: avgVolatility,
            trend
        });

        // Keep only last 100 regime detections
        if (this.regimeHistory.length > 100) {
            this.regimeHistory.shift();
        }

        return this.currentRegime;
    }

    // ========================================
    // INDIVIDUAL STRATEGY SIGNALS
    // ========================================

    // Strategy 1: MA Crossover
    getMACrossoverSignal(priceHistory) {
        const closes = priceHistory.map(h => h.close);
        const fastMA = this.calculateSMA(closes, 10);
        const slowMA = this.calculateSMA(closes, 20);

        const currentFast = fastMA[fastMA.length - 1];
        const currentSlow = slowMA[slowMA.length - 1];
        const prevFast = fastMA[fastMA.length - 2];
        const prevSlow = slowMA[slowMA.length - 2];

        const strength = Math.abs(currentFast - currentSlow) / currentSlow;

        // Bullish crossover
        if (prevFast <= prevSlow && currentFast > currentSlow) {
            return { signal: 'LONG', confidence: Math.min(0.9, strength * 50), reason: 'Bullish MA Crossover' };
        }
        // Bearish crossover
        if (prevFast >= prevSlow && currentFast < currentSlow) {
            return { signal: 'SHORT', confidence: Math.min(0.9, strength * 50), reason: 'Bearish MA Crossover' };
        }
        // Trend continuation
        if (currentFast > currentSlow && strength > 0.01) {
            return { signal: 'LONG', confidence: 0.4, reason: 'Bullish Trend' };
        }
        if (currentFast < currentSlow && strength > 0.01) {
            return { signal: 'SHORT', confidence: 0.4, reason: 'Bearish Trend' };
        }

        return { signal: 'NEUTRAL', confidence: 0, reason: 'No MA Signal' };
    }

    // Strategy 2: RSI
    getRSISignal(priceHistory) {
        const closes = priceHistory.map(h => h.close);
        const rsi = this.calculateRSI(closes, 14);
        const currentRSI = rsi[rsi.length - 1];
        const prevRSI = rsi[rsi.length - 2];

        // Oversold bounce
        if (currentRSI < 30 && currentRSI > prevRSI) {
            const confidence = (30 - currentRSI) / 30;
            return { signal: 'LONG', confidence: Math.min(0.85, confidence + 0.3), reason: `RSI Oversold (${currentRSI.toFixed(1)})` };
        }
        // Overbought reversal
        if (currentRSI > 70 && currentRSI < prevRSI) {
            const confidence = (currentRSI - 70) / 30;
            return { signal: 'SHORT', confidence: Math.min(0.85, confidence + 0.3), reason: `RSI Overbought (${currentRSI.toFixed(1)})` };
        }
        // Neutral zone with direction
        if (currentRSI > 50 && currentRSI < 70) {
            return { signal: 'LONG', confidence: 0.3, reason: 'RSI Bullish Zone' };
        }
        if (currentRSI < 50 && currentRSI > 30) {
            return { signal: 'SHORT', confidence: 0.3, reason: 'RSI Bearish Zone' };
        }

        return { signal: 'NEUTRAL', confidence: 0, reason: 'RSI Neutral' };
    }

    // Strategy 3: MACD
    getMACDSignal(priceHistory) {
        const closes = priceHistory.map(h => h.close);
        const { macd, signal, histogram } = this.calculateMACD(closes);

        const currentHist = histogram[histogram.length - 1];
        const prevHist = histogram[histogram.length - 2];

        // MACD histogram crossover
        if (prevHist <= 0 && currentHist > 0) {
            return { signal: 'LONG', confidence: 0.7, reason: 'MACD Bullish Crossover' };
        }
        if (prevHist >= 0 && currentHist < 0) {
            return { signal: 'SHORT', confidence: 0.7, reason: 'MACD Bearish Crossover' };
        }
        // Divergence strength
        if (currentHist > 0 && currentHist > prevHist) {
            return { signal: 'LONG', confidence: 0.4, reason: 'MACD Bullish Momentum' };
        }
        if (currentHist < 0 && currentHist < prevHist) {
            return { signal: 'SHORT', confidence: 0.4, reason: 'MACD Bearish Momentum' };
        }

        return { signal: 'NEUTRAL', confidence: 0, reason: 'No MACD Signal' };
    }

    // Strategy 4: Price Momentum
    getMomentumSignal(priceHistory) {
        const closes = priceHistory.map(h => h.close);
        const currentPrice = closes[closes.length - 1];
        const price5DaysAgo = closes[closes.length - 6] || closes[0];
        const price10DaysAgo = closes[closes.length - 11] || closes[0];

        const momentum5 = (currentPrice - price5DaysAgo) / price5DaysAgo;
        const momentum10 = (currentPrice - price10DaysAgo) / price10DaysAgo;

        // Strong positive momentum
        if (momentum5 > 0.03 && momentum10 > 0.05) {
            return { signal: 'LONG', confidence: 0.75, reason: `Strong Momentum (+${(momentum5 * 100).toFixed(1)}%)` };
        }
        if (momentum5 < -0.03 && momentum10 < -0.05) {
            return { signal: 'SHORT', confidence: 0.75, reason: `Negative Momentum (${(momentum5 * 100).toFixed(1)}%)` };
        }
        // Moderate momentum
        if (momentum5 > 0.01) {
            return { signal: 'LONG', confidence: 0.35, reason: 'Positive Momentum' };
        }
        if (momentum5 < -0.01) {
            return { signal: 'SHORT', confidence: 0.35, reason: 'Negative Momentum' };
        }

        return { signal: 'NEUTRAL', confidence: 0, reason: 'No Momentum' };
    }

    // Strategy 5: Volume Analysis
    getVolumeSignal(priceHistory) {
        if (!priceHistory[0].volume) {
            return { signal: 'NEUTRAL', confidence: 0, reason: 'No Volume Data' };
        }

        const volumes = priceHistory.map(h => h.volume);
        const closes = priceHistory.map(h => h.close);

        const avgVolume = this.calculateSMA(volumes, 20);
        const currentVolume = volumes[volumes.length - 1];
        const prevVolume = volumes[volumes.length - 2];
        const avgVol = avgVolume[avgVolume.length - 1];

        const priceChange = (closes[closes.length - 1] - closes[closes.length - 2]) / closes[closes.length - 2];

        // High volume with price increase = bullish
        if (currentVolume > avgVol * 1.5 && priceChange > 0.01) {
            return { signal: 'LONG', confidence: 0.6, reason: 'Volume Breakout' };
        }
        // High volume with price decrease = bearish
        if (currentVolume > avgVol * 1.5 && priceChange < -0.01) {
            return { signal: 'SHORT', confidence: 0.6, reason: 'Volume Breakdown' };
        }

        return { signal: 'NEUTRAL', confidence: 0, reason: 'Normal Volume' };
    }

    // Strategy 6: Bollinger Band Squeeze
    getBollingerSqueezeSignal(priceHistory) {
        const closes = priceHistory.map(h => h.close);
        if (closes.length < 25) {
            return { signal: 'NEUTRAL', confidence: 0, reason: 'Insufficient data for BB' };
        }

        const { upper, middle, lower, width } = this.calculateBollingerBands(closes, 20, 2);
        const currentWidth = width[width.length - 1];
        const prevWidth = width[width.length - 2];
        const currentPrice = closes[closes.length - 1];

        // Track BB width history for percentile calculation
        this.bbWidthHistory.push(currentWidth);
        if (this.bbWidthHistory.length > 100) this.bbWidthHistory.shift();

        if (this.bbWidthHistory.length < 20) {
            return { signal: 'NEUTRAL', confidence: 0, reason: 'Building BB history' };
        }

        // Calculate percentile of current bandwidth
        const sorted = [...this.bbWidthHistory].sort((a, b) => a - b);
        const rank = sorted.filter(v => v <= currentWidth).length;
        const percentile = rank / sorted.length;

        // SQUEEZE DETECTION: Width was below 20th percentile and now expanding
        const wasSqueezed = prevWidth <= sorted[Math.floor(sorted.length * 0.20)];
        const isExpanding = currentWidth > prevWidth * 1.05; // 5%+ expansion

        if (wasSqueezed && isExpanding) {
            // Breakout direction: price above/below middle band
            if (currentPrice > middle[middle.length - 1]) {
                return {
                    signal: 'LONG',
                    confidence: Math.min(0.85, 0.5 + (1 - percentile) * 0.5),
                    reason: `BB Squeeze Breakout UP (width pctl: ${(percentile * 100).toFixed(0)}%)`
                };
            } else {
                return {
                    signal: 'SHORT',
                    confidence: Math.min(0.85, 0.5 + (1 - percentile) * 0.5),
                    reason: `BB Squeeze Breakout DOWN (width pctl: ${(percentile * 100).toFixed(0)}%)`
                };
            }
        }

        // Price touching/exceeding upper band = overbought
        if (currentPrice >= upper[upper.length - 1]) {
            return { signal: 'SHORT', confidence: 0.4, reason: 'Price at Upper BB' };
        }
        // Price touching/below lower band = oversold
        if (currentPrice <= lower[lower.length - 1]) {
            return { signal: 'LONG', confidence: 0.4, reason: 'Price at Lower BB' };
        }

        return { signal: 'NEUTRAL', confidence: 0, reason: 'No BB Signal' };
    }

    // Strategy 7: RSI Divergence
    getRSIDivergenceSignal(priceHistory) {
        const closes = priceHistory.map(h => h.close);
        if (closes.length < 30) {
            return { signal: 'NEUTRAL', confidence: 0, reason: 'Insufficient data for RSI Divergence' };
        }

        const rsi = this.calculateRSI(closes, 14);

        // Find recent swing highs/lows in price and RSI (lookback 15 bars)
        const lookback = 15;
        const recentCloses = closes.slice(-lookback);
        const recentRSI = rsi.slice(-lookback);

        // Find local maxima and minima
        const priceHighs = [];
        const priceLows = [];
        const rsiHighs = [];
        const rsiLows = [];

        for (let i = 1; i < recentCloses.length - 1; i++) {
            if (recentCloses[i] > recentCloses[i - 1] && recentCloses[i] > recentCloses[i + 1]) {
                priceHighs.push({ idx: i, value: recentCloses[i] });
                rsiHighs.push({ idx: i, value: recentRSI[i] });
            }
            if (recentCloses[i] < recentCloses[i - 1] && recentCloses[i] < recentCloses[i + 1]) {
                priceLows.push({ idx: i, value: recentCloses[i] });
                rsiLows.push({ idx: i, value: recentRSI[i] });
            }
        }

        // BEARISH DIVERGENCE: Price making higher high, RSI making lower high
        if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
            const lastPH = priceHighs[priceHighs.length - 1];
            const prevPH = priceHighs[priceHighs.length - 2];
            const lastRH = rsiHighs[rsiHighs.length - 1];
            const prevRH = rsiHighs[rsiHighs.length - 2];

            if (lastPH.value > prevPH.value && lastRH.value < prevRH.value) {
                const divergenceStrength = (prevRH.value - lastRH.value) / prevRH.value;
                return {
                    signal: 'SHORT',
                    confidence: Math.min(0.80, 0.5 + divergenceStrength * 5),
                    reason: `Bearish RSI Divergence (RSI: ${lastRH.value.toFixed(1)} < ${prevRH.value.toFixed(1)})`
                };
            }
        }

        // BULLISH DIVERGENCE: Price making lower low, RSI making higher low
        if (priceLows.length >= 2 && rsiLows.length >= 2) {
            const lastPL = priceLows[priceLows.length - 1];
            const prevPL = priceLows[priceLows.length - 2];
            const lastRL = rsiLows[rsiLows.length - 1];
            const prevRL = rsiLows[rsiLows.length - 2];

            if (lastPL.value < prevPL.value && lastRL.value > prevRL.value) {
                const divergenceStrength = (lastRL.value - prevRL.value) / prevRL.value;
                return {
                    signal: 'LONG',
                    confidence: Math.min(0.80, 0.5 + divergenceStrength * 5),
                    reason: `Bullish RSI Divergence (RSI: ${lastRL.value.toFixed(1)} > ${prevRL.value.toFixed(1)})`
                };
            }
        }

        return { signal: 'NEUTRAL', confidence: 0, reason: 'No RSI Divergence' };
    }

    // ========================================
    // ENSEMBLE SIGNAL GENERATION
    // ========================================

    generateSignal(priceHistory, symbol = 'UNKNOWN') {
        if (!priceHistory || priceHistory.length < 50) {
            return {
                shouldEnter: false,
                direction: null,
                confidence: 0,
                reason: 'Insufficient data (need 50+ bars)',
                regime: this.currentRegime,
                strategies: {}
            };
        }

        // Step 1: Detect market regime
        const regime = this.detectRegime(priceHistory);
        const config = REGIME_CONFIGS[regime];

        // Step 2: Get signals from all strategies
        const signals = {
            maCrossover: this.getMACrossoverSignal(priceHistory),
            rsi: this.getRSISignal(priceHistory),
            macd: this.getMACDSignal(priceHistory),
            momentum: this.getMomentumSignal(priceHistory),
            volume: this.getVolumeSignal(priceHistory),
            bollingerSqueeze: this.getBollingerSqueezeSignal(priceHistory),
            rsiDivergence: this.getRSIDivergenceSignal(priceHistory)
        };

        // Step 3: Weighted voting
        let longScore = 0;
        let shortScore = 0;
        let totalWeight = 0;
        let agreementCount = { long: 0, short: 0, neutral: 0 };
        const reasons = [];

        for (const [strategy, signal] of Object.entries(signals)) {
            const weight = this.strategyWeights[strategy];
            totalWeight += weight;

            if (signal.signal === 'LONG') {
                longScore += weight * signal.confidence;
                agreementCount.long++;
                if (signal.confidence > 0.5) reasons.push(signal.reason);
            } else if (signal.signal === 'SHORT') {
                shortScore += weight * signal.confidence;
                agreementCount.short++;
                if (signal.confidence > 0.5) reasons.push(signal.reason);
            } else {
                agreementCount.neutral++;
            }
        }

        // Normalize scores
        const normalizedLong = longScore / totalWeight;
        const normalizedShort = shortScore / totalWeight;

        // Step 4: Determine final signal with regime-adjusted threshold
        const requiredConfidence = config.requiredConfidence;
        const minStrategiesAgreeing = 2;

        let shouldEnter = false;
        let direction = null;
        let confidence = 0;
        let reason = 'No consensus signal';

        if (normalizedLong > normalizedShort && normalizedLong >= requiredConfidence && agreementCount.long >= minStrategiesAgreeing) {
            shouldEnter = true;
            direction = 'long';
            confidence = normalizedLong;
            reason = `LONG: ${reasons.slice(0, 3).join(', ')} [${agreementCount.long}/7 strategies agree]`;
        } else if (normalizedShort > normalizedLong && normalizedShort >= requiredConfidence && agreementCount.short >= minStrategiesAgreeing) {
            shouldEnter = true;
            direction = 'short';
            confidence = normalizedShort;
            reason = `SHORT: ${reasons.slice(0, 3).join(', ')} [${agreementCount.short}/7 strategies agree]`;
        }

        // Step 5: Regime override - block trades in HIGH_VOLATILITY unless very confident
        if (regime === MarketRegime.HIGH_VOLATILITY && confidence < 0.80) {
            shouldEnter = false;
            reason = `⚠️ High volatility regime - confidence ${(confidence * 100).toFixed(0)}% < 80% required`;
        }

        return {
            shouldEnter,
            direction,
            confidence,
            reason,
            regime,
            regimeConfig: config,
            strategies: signals,
            scores: {
                longScore: normalizedLong,
                shortScore: normalizedShort
            },
            agreementCount,
            symbol
        };
    }

    // ========================================
    // POSITION SIZING
    // ========================================

    getPositionSize(baseSize, regime = null) {
        const currentRegime = regime || this.currentRegime;
        const config = REGIME_CONFIGS[currentRegime];
        return baseSize * config.positionSizeMultiplier;
    }

    getRiskParameters(regime = null) {
        const currentRegime = regime || this.currentRegime;
        return REGIME_CONFIGS[currentRegime];
    }

    // ========================================
    // PERFORMANCE TRACKING
    // ========================================

    recordTradeResult(strategy, won, pnl) {
        if (this.strategyPerformance[strategy]) {
            if (won) {
                this.strategyPerformance[strategy].wins++;
            } else {
                this.strategyPerformance[strategy].losses++;
            }
            this.strategyPerformance[strategy].pnl += pnl;

            // Auto-adjust weights every 20 trades
            const totalTrades = Object.values(this.strategyPerformance)
                .reduce((sum, s) => sum + s.wins + s.losses, 0);

            if (totalTrades > 0 && totalTrades % 20 === 0) {
                this.autoAdjustWeights();
            }
        }
    }

    autoAdjustWeights() {
        const performances = {};
        let totalPerformance = 0;

        for (const [strategy, stats] of Object.entries(this.strategyPerformance)) {
            const total = stats.wins + stats.losses;
            const winRate = total > 0 ? stats.wins / total : 0.5;
            const performance = winRate * (1 + Math.max(-0.5, Math.min(0.5, stats.pnl / 1000)));
            performances[strategy] = performance;
            totalPerformance += performance;
        }

        // Normalize to new weights
        if (totalPerformance > 0) {
            for (const strategy of Object.keys(this.strategyWeights)) {
                this.strategyWeights[strategy] = performances[strategy] / totalPerformance;
            }
            console.log('🔄 Strategy weights auto-adjusted:', this.strategyWeights);
        }
    }

    // ========================================
    // TECHNICAL INDICATOR CALCULATIONS
    // ========================================

    calculateSMA(data, period) {
        const result = [];
        for (let i = 0; i < data.length; i++) {
            if (i < period - 1) {
                result.push(null);
            } else {
                const slice = data.slice(i - period + 1, i + 1);
                const sum = slice.reduce((a, b) => a + b, 0);
                result.push(sum / period);
            }
        }
        return result;
    }

    calculateEMA(data, period) {
        const result = [];
        const multiplier = 2 / (period + 1);

        // First EMA is SMA
        let sum = 0;
        for (let i = 0; i < period && i < data.length; i++) {
            sum += data[i];
        }
        result.push(sum / Math.min(period, data.length));

        // Rest are EMA
        for (let i = 1; i < data.length; i++) {
            const ema = (data[i] - result[i - 1]) * multiplier + result[i - 1];
            result.push(ema);
        }
        return result;
    }

    calculateRSI(data, period = 14) {
        const changes = [];
        for (let i = 1; i < data.length; i++) {
            changes.push(data[i] - data[i - 1]);
        }

        const gains = changes.map(c => c > 0 ? c : 0);
        const losses = changes.map(c => c < 0 ? -c : 0);

        const avgGain = this.calculateSMA(gains, period);
        const avgLoss = this.calculateSMA(losses, period);

        const rsi = [];
        for (let i = 0; i < avgGain.length; i++) {
            if (avgGain[i] === null || avgLoss[i] === null) {
                rsi.push(50);
            } else if (avgLoss[i] === 0) {
                rsi.push(100);
            } else {
                const rs = avgGain[i] / avgLoss[i];
                rsi.push(100 - (100 / (1 + rs)));
            }
        }
        return rsi;
    }

    calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        const emaFast = this.calculateEMA(data, fastPeriod);
        const emaSlow = this.calculateEMA(data, slowPeriod);

        const macd = emaFast.map((fast, i) => fast - emaSlow[i]);
        const signal = this.calculateEMA(macd, signalPeriod);
        const histogram = macd.map((m, i) => m - signal[i]);

        return { macd, signal, histogram };
    }

    calculateVolatility(data, period = 20) {
        const returns = [];
        for (let i = 1; i < data.length; i++) {
            returns.push((data[i] - data[i - 1]) / data[i - 1]);
        }

        const volatility = [];
        for (let i = 0; i < returns.length; i++) {
            if (i < period - 1) {
                volatility.push(0);
            } else {
                const slice = returns.slice(i - period + 1, i + 1);
                const mean = slice.reduce((a, b) => a + b, 0) / period;
                const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
                volatility.push(Math.sqrt(variance));
            }
        }
        return volatility;
    }

    calculateTrendStrength(data) {
        if (data.length < 20) return 0;

        const first = data.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
        const last = data.slice(-5).reduce((a, b) => a + b, 0) / 5;

        return (last - first) / first;
    }

    // Bollinger Bands calculation
    calculateBollingerBands(data, period = 20, stdDevMultiplier = 2) {
        const middle = this.calculateSMA(data, period);
        const upper = [];
        const lower = [];
        const width = [];

        for (let i = 0; i < data.length; i++) {
            if (i < period - 1 || middle[i] === null) {
                upper.push(null);
                lower.push(null);
                width.push(null);
            } else {
                const slice = data.slice(i - period + 1, i + 1);
                const mean = middle[i];
                const variance = slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period;
                const stdDev = Math.sqrt(variance);

                upper.push(mean + stdDev * stdDevMultiplier);
                lower.push(mean - stdDev * stdDevMultiplier);
                width.push((upper[upper.length - 1] - lower[lower.length - 1]) / mean);
            }
        }

        return { upper, middle, lower, width };
    }

    // ========================================
    // STATUS & DIAGNOSTICS
    // ========================================

    getStatus() {
        return {
            assetClass: this.assetClass,
            currentRegime: this.currentRegime,
            strategyWeights: this.strategyWeights,
            strategyPerformance: this.strategyPerformance,
            recentRegimes: this.regimeHistory.slice(-10)
        };
    }
}

// ========================================
// EXPORTS
// ========================================

module.exports = {
    AdvancedStrategyEngine,
    MarketRegime,
    REGIME_CONFIGS
};
