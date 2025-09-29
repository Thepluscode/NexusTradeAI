// Smart Alerts Service with Confidence-Based Signal Generation
// Implements the research-based signal recommendation engine with ATR-based entry/exit points

const EventEmitter = require('events');
const TechnicalIndicators = require('../../../ai-ml/indicators/technical-indicators');

class SmartAlertsService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.indicators = new TechnicalIndicators();
    this.notificationService = options.notificationService;
    this.marketDataService = options.marketDataService;
    
    // Signal configuration based on research
    this.signalConfig = {
      minConfidence: 0.70, // 70% minimum confidence threshold
      atrPeriod: 14, // 14-period ATR for stop/take profit calculation
      riskRewardRatio: 2, // 2:1 reward-to-risk ratio
      maxSignalsPerSymbol: 3, // Maximum concurrent signals per symbol
      signalCooldown: 300000, // 5 minutes between signals for same symbol
    };
    
    // Active signals tracking
    this.activeSignals = new Map();
    this.signalHistory = new Map();
    this.performanceMetrics = new Map();
    this.lastSignalTime = new Map();
    
    // Confidence scoring weights (based on research)
    this.confidenceWeights = {
      modelProbability: 0.40, // AI model prediction probability
      technicalConfirmation: 0.25, // Technical indicator alignment
      volumeConfirmation: 0.15, // Volume analysis
      sentimentScore: 0.10, // Market sentiment
      historicalPerformance: 0.10 // Strategy historical performance
    };
    
    this.startSignalEngine();
  }

  /**
   * Generate smart alert signal with confidence-based entry/exit points
   * Implements the research methodology for signal generation
   */
  async generateSmartAlert(symbol, marketData, aiPrediction) {
    try {
      const { prices, highs, lows, closes, volume, timestamp } = marketData;
      const currentPrice = closes[closes.length - 1];
      
      // Check cooldown period
      if (this.isInCooldown(symbol)) {
        return null;
      }
      
      // Calculate ATR for dynamic stop/take profit
      const atrValues = this.indicators.atr(highs, lows, closes, this.signalConfig.atrPeriod);
      const currentATR = atrValues[atrValues.length - 1];
      
      if (!currentATR || currentATR <= 0) {
        return null;
      }
      
      // Generate signal based on AI prediction and technical analysis
      const signal = await this.generateSignalRecommendation(
        symbol, 
        currentPrice, 
        currentATR, 
        aiPrediction, 
        marketData
      );
      
      if (!signal || signal.confidence < this.signalConfig.minConfidence) {
        return null;
      }
      
      // Create smart alert with entry/exit points
      const smartAlert = this.createSmartAlert(signal, symbol, currentPrice, currentATR, timestamp);
      
      // Store and track signal
      this.storeSignal(smartAlert);
      
      // Emit alert for real-time delivery
      this.emit('smartAlert', smartAlert);
      
      // Send notification if service available
      if (this.notificationService) {
        await this.sendAlertNotification(smartAlert);
      }
      
      this.logger?.info(`Generated smart alert for ${symbol}: ${signal.direction} at ${currentPrice} (confidence: ${signal.confidence.toFixed(3)})`);
      
      return smartAlert;
      
    } catch (error) {
      this.logger?.error('Error generating smart alert:', error);
      return null;
    }
  }

  /**
   * Generate signal recommendation with confidence scoring
   */
  async generateSignalRecommendation(symbol, currentPrice, atr, aiPrediction, marketData) {
    try {
      const { closes, highs, lows, volume } = marketData;
      
      // 1. AI Model Probability Score (40% weight)
      const modelScore = this.calculateModelConfidence(aiPrediction);
      
      // 2. Technical Confirmation Score (25% weight)
      const technicalScore = await this.calculateTechnicalConfirmation(closes, highs, lows, volume);
      
      // 3. Volume Confirmation Score (15% weight)
      const volumeScore = this.calculateVolumeConfirmation(volume, closes);
      
      // 4. Sentiment Score (10% weight)
      const sentimentScore = await this.calculateSentimentScore(symbol);
      
      // 5. Historical Performance Score (10% weight)
      const performanceScore = this.calculateHistoricalPerformance(symbol, aiPrediction.strategy);
      
      // Calculate weighted confidence score
      const confidence = (
        modelScore * this.confidenceWeights.modelProbability +
        technicalScore * this.confidenceWeights.technicalConfirmation +
        volumeScore * this.confidenceWeights.volumeConfirmation +
        sentimentScore * this.confidenceWeights.sentimentScore +
        performanceScore * this.confidenceWeights.historicalPerformance
      );
      
      // Determine signal direction
      let direction = 'HOLD';
      if (confidence > this.signalConfig.minConfidence) {
        if (aiPrediction.direction === 'BUY' && technicalScore > 0.6) {
          direction = 'BUY';
        } else if (aiPrediction.direction === 'SELL' && technicalScore > 0.6) {
          direction = 'SELL';
        }
      }
      
      return {
        direction,
        confidence,
        scores: {
          model: modelScore,
          technical: technicalScore,
          volume: volumeScore,
          sentiment: sentimentScore,
          performance: performanceScore
        },
        strategy: aiPrediction.strategy,
        reasoning: this.generateSignalReasoning(direction, confidence, {
          model: modelScore,
          technical: technicalScore,
          volume: volumeScore,
          sentiment: sentimentScore,
          performance: performanceScore
        })
      };
      
    } catch (error) {
      this.logger?.error('Error generating signal recommendation:', error);
      return null;
    }
  }

  /**
   * Create smart alert with ATR-based entry/exit points
   */
  createSmartAlert(signal, symbol, currentPrice, atr, timestamp) {
    const alertId = `alert_${symbol}_${Date.now()}`;
    
    // Calculate entry trigger (immediate for high confidence signals)
    const entryTrigger = signal.confidence > 0.85 ? currentPrice : this.calculateEntryTrigger(currentPrice, signal.direction, atr);
    
    // Calculate stop-loss (1x ATR from entry)
    const stopLoss = signal.direction === 'BUY' 
      ? entryTrigger - atr 
      : entryTrigger + atr;
    
    // Calculate take-profit (2x ATR from entry for 2:1 R:R)
    const takeProfit = signal.direction === 'BUY'
      ? entryTrigger + (atr * this.signalConfig.riskRewardRatio)
      : entryTrigger - (atr * this.signalConfig.riskRewardRatio);
    
    // Calculate position sizing recommendation
    const positionSize = this.calculatePositionSize(signal.confidence, atr, currentPrice);
    
    const smartAlert = {
      id: alertId,
      symbol,
      signal: signal.direction,
      confidence: signal.confidence,
      strategy: signal.strategy,
      
      // Entry/Exit Points (from research)
      entry: {
        trigger: entryTrigger,
        price: currentPrice,
        condition: signal.confidence > 0.85 ? 'IMMEDIATE' : 'ON_TRIGGER'
      },
      
      stopLoss: {
        price: stopLoss,
        atrMultiplier: 1.0,
        type: 'FIXED'
      },
      
      takeProfit: {
        price: takeProfit,
        atrMultiplier: this.signalConfig.riskRewardRatio,
        type: 'FIXED'
      },
      
      // Risk Management
      riskReward: Math.abs(takeProfit - entryTrigger) / Math.abs(entryTrigger - stopLoss),
      positionSize: positionSize,
      maxRisk: 0.02, // 2% max risk per trade
      
      // Metadata
      timestamp,
      atr: atr,
      scores: signal.scores,
      reasoning: signal.reasoning,
      status: 'ACTIVE',
      
      // Performance tracking
      performance: {
        triggered: false,
        executed: false,
        closed: false,
        pnl: 0,
        pnlPercent: 0
      }
    };
    
    return smartAlert;
  }

  /**
   * Calculate AI model confidence score
   */
  calculateModelConfidence(aiPrediction) {
    if (!aiPrediction || !aiPrediction.confidence) {
      return 0;
    }

    // Normalize AI prediction confidence to 0-1 scale
    let modelScore = Math.min(Math.max(aiPrediction.confidence, 0), 1);

    // Apply confidence boost for institutional-grade strategies
    if (aiPrediction.institutionalGrade) {
      modelScore = Math.min(modelScore * 1.1, 1.0);
    }

    // Apply penalty for low expected win rates
    if (aiPrediction.expectedWinRate && aiPrediction.expectedWinRate < 0.7) {
      modelScore *= 0.8;
    }

    return modelScore;
  }

  /**
   * Calculate technical confirmation score
   */
  async calculateTechnicalConfirmation(closes, highs, lows, volume) {
    try {
      let confirmationScore = 0;
      let indicators = 0;

      // RSI confirmation
      const rsi = this.indicators.rsi(closes, 14);
      const currentRSI = rsi[rsi.length - 1];
      if (currentRSI) {
        if (currentRSI < 30) confirmationScore += 0.8; // Oversold - bullish
        else if (currentRSI > 70) confirmationScore += 0.8; // Overbought - bearish
        else if (currentRSI >= 40 && currentRSI <= 60) confirmationScore += 0.6; // Neutral
        else confirmationScore += 0.4;
        indicators++;
      }

      // MACD confirmation
      const macd = this.indicators.macd(closes, 12, 26, 9);
      if (macd.histogram && macd.histogram.length > 1) {
        const currentHist = macd.histogram[macd.histogram.length - 1];
        const prevHist = macd.histogram[macd.histogram.length - 2];
        if (currentHist > 0 && currentHist > prevHist) confirmationScore += 0.7; // Bullish momentum
        else if (currentHist < 0 && currentHist < prevHist) confirmationScore += 0.7; // Bearish momentum
        else confirmationScore += 0.3;
        indicators++;
      }

      // Bollinger Bands confirmation
      const bb = this.indicators.bollingerBands(closes, 20, 2);
      if (bb.upper && bb.lower && bb.middle) {
        const currentPrice = closes[closes.length - 1];
        const upper = bb.upper[bb.upper.length - 1];
        const lower = bb.lower[bb.lower.length - 1];
        const middle = bb.middle[bb.middle.length - 1];

        if (currentPrice <= lower) confirmationScore += 0.8; // Oversold
        else if (currentPrice >= upper) confirmationScore += 0.8; // Overbought
        else if (Math.abs(currentPrice - middle) / middle < 0.01) confirmationScore += 0.6; // Near middle
        else confirmationScore += 0.4;
        indicators++;
      }

      // Volume confirmation
      if (volume && volume.length >= 20) {
        const avgVolume = volume.slice(-20).reduce((sum, v) => sum + v, 0) / 20;
        const currentVolume = volume[volume.length - 1];
        if (currentVolume > avgVolume * 1.5) confirmationScore += 0.6; // High volume
        else if (currentVolume > avgVolume) confirmationScore += 0.4; // Above average
        else confirmationScore += 0.2; // Below average
        indicators++;
      }

      return indicators > 0 ? confirmationScore / indicators : 0;

    } catch (error) {
      this.logger?.error('Error calculating technical confirmation:', error);
      return 0;
    }
  }

  /**
   * Calculate volume confirmation score
   */
  calculateVolumeConfirmation(volume, closes) {
    if (!volume || volume.length < 20) return 0.5;

    try {
      const recentVolume = volume.slice(-10);
      const avgVolume = volume.slice(-20, -10).reduce((sum, v) => sum + v, 0) / 10;
      const currentVolume = volume[volume.length - 1];

      // Price-volume relationship
      const priceChange = closes[closes.length - 1] - closes[closes.length - 2];
      const volumeRatio = currentVolume / avgVolume;

      let score = 0.5; // Base score

      // High volume with price movement
      if (volumeRatio > 1.5 && Math.abs(priceChange) > 0) {
        score = 0.9;
      } else if (volumeRatio > 1.2) {
        score = 0.7;
      } else if (volumeRatio > 0.8) {
        score = 0.6;
      } else {
        score = 0.3; // Low volume
      }

      return Math.min(Math.max(score, 0), 1);

    } catch (error) {
      this.logger?.error('Error calculating volume confirmation:', error);
      return 0.5;
    }
  }

  /**
   * Calculate sentiment score (simplified for demo)
   */
  async calculateSentimentScore(symbol) {
    try {
      // In production, this would integrate with news/social sentiment APIs
      // For now, return a simulated sentiment score
      const baseScore = 0.5 + (Math.random() - 0.5) * 0.4; // 0.3 to 0.7 range
      return Math.min(Math.max(baseScore, 0), 1);
    } catch (error) {
      this.logger?.error('Error calculating sentiment score:', error);
      return 0.5;
    }
  }

  /**
   * Calculate historical performance score
   */
  calculateHistoricalPerformance(symbol, strategy) {
    try {
      const key = `${symbol}_${strategy}`;
      const metrics = this.performanceMetrics.get(key);

      if (!metrics || metrics.totalSignals < 10) {
        return 0.5; // Default score for new strategies
      }

      const winRate = metrics.winningSignals / metrics.totalSignals;
      const profitFactor = metrics.totalProfit / Math.abs(metrics.totalLoss || 1);

      // Combine win rate and profit factor
      let score = (winRate * 0.7) + (Math.min(profitFactor / 2, 1) * 0.3);

      // Boost score for consistently profitable strategies
      if (winRate > 0.7 && profitFactor > 1.5) {
        score = Math.min(score * 1.2, 1.0);
      }

      return score;

    } catch (error) {
      this.logger?.error('Error calculating historical performance:', error);
      return 0.5;
    }
  }

  /**
   * Generate signal reasoning text
   */
  generateSignalReasoning(direction, confidence, scores) {
    const reasons = [];

    if (scores.model > 0.8) reasons.push('Strong AI model prediction');
    if (scores.technical > 0.7) reasons.push('Technical indicators aligned');
    if (scores.volume > 0.7) reasons.push('Volume confirmation present');
    if (scores.sentiment > 0.6) reasons.push('Positive market sentiment');
    if (scores.performance > 0.7) reasons.push('Strong historical performance');

    const confidenceLevel = confidence > 0.85 ? 'Very High' : confidence > 0.75 ? 'High' : 'Moderate';

    return `${direction} signal with ${confidenceLevel} confidence (${(confidence * 100).toFixed(1)}%). ${reasons.join(', ')}.`;
  }

  /**
   * Calculate entry trigger price
   */
  calculateEntryTrigger(currentPrice, direction, atr) {
    // For moderate confidence signals, wait for slight price movement confirmation
    const triggerOffset = atr * 0.1; // 10% of ATR

    if (direction === 'BUY') {
      return currentPrice + triggerOffset;
    } else if (direction === 'SELL') {
      return currentPrice - triggerOffset;
    }

    return currentPrice;
  }

  /**
   * Calculate position size based on confidence and volatility
   */
  calculatePositionSize(confidence, atr, currentPrice) {
    // Base position size: 1-3% based on confidence
    const baseSize = 0.01 + (confidence - 0.7) * 0.067; // 1% to 3% range

    // Adjust for volatility (lower size for higher volatility)
    const volatilityRatio = atr / currentPrice;
    const volatilityAdjustment = Math.max(0.5, 1 - volatilityRatio * 10);

    return Math.min(baseSize * volatilityAdjustment, 0.03); // Max 3%
  }

  /**
   * Check if symbol is in cooldown period
   */
  isInCooldown(symbol) {
    const lastTime = this.lastSignalTime.get(symbol);
    if (!lastTime) return false;

    return (Date.now() - lastTime) < this.signalConfig.signalCooldown;
  }

  /**
   * Store signal for tracking and analysis
   */
  storeSignal(smartAlert) {
    // Store active signal
    this.activeSignals.set(smartAlert.id, smartAlert);

    // Update last signal time
    this.lastSignalTime.set(smartAlert.symbol, Date.now());

    // Add to history
    const history = this.signalHistory.get(smartAlert.symbol) || [];
    history.push({
      id: smartAlert.id,
      timestamp: smartAlert.timestamp,
      signal: smartAlert.signal,
      confidence: smartAlert.confidence,
      strategy: smartAlert.strategy
    });

    // Keep only last 100 signals per symbol
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    this.signalHistory.set(smartAlert.symbol, history);
  }

  /**
   * Send alert notification
   */
  async sendAlertNotification(smartAlert) {
    try {
      const notification = {
        type: 'SMART_ALERT',
        title: `${smartAlert.symbol} ${smartAlert.signal} Signal`,
        message: `${smartAlert.reasoning}`,
        data: {
          symbol: smartAlert.symbol,
          signal: smartAlert.signal,
          confidence: smartAlert.confidence,
          entry: smartAlert.entry.trigger,
          stopLoss: smartAlert.stopLoss.price,
          takeProfit: smartAlert.takeProfit.price,
          riskReward: smartAlert.riskReward
        },
        priority: smartAlert.confidence > 0.85 ? 'HIGH' : 'NORMAL',
        timestamp: smartAlert.timestamp
      };

      await this.notificationService.sendNotification(notification);

    } catch (error) {
      this.logger?.error('Error sending alert notification:', error);
    }
  }

  /**
   * Update signal performance when trade is closed
   */
  updateSignalPerformance(alertId, pnl, pnlPercent) {
    const signal = this.activeSignals.get(alertId);
    if (!signal) return;

    // Update signal performance
    signal.performance.closed = true;
    signal.performance.pnl = pnl;
    signal.performance.pnlPercent = pnlPercent;
    signal.status = 'CLOSED';

    // Update strategy performance metrics
    const key = `${signal.symbol}_${signal.strategy}`;
    const metrics = this.performanceMetrics.get(key) || {
      totalSignals: 0,
      winningSignals: 0,
      totalProfit: 0,
      totalLoss: 0
    };

    metrics.totalSignals++;
    if (pnl > 0) {
      metrics.winningSignals++;
      metrics.totalProfit += pnl;
    } else {
      metrics.totalLoss += Math.abs(pnl);
    }

    this.performanceMetrics.set(key, metrics);

    // Remove from active signals
    this.activeSignals.delete(alertId);

    this.emit('signalClosed', { alertId, signal, pnl, pnlPercent });
  }

  /**
   * Get active signals for a symbol
   */
  getActiveSignals(symbol = null) {
    if (symbol) {
      return Array.from(this.activeSignals.values()).filter(s => s.symbol === symbol);
    }
    return Array.from(this.activeSignals.values());
  }

  /**
   * Get signal history for a symbol
   */
  getSignalHistory(symbol, limit = 50) {
    const history = this.signalHistory.get(symbol) || [];
    return history.slice(-limit);
  }

  /**
   * Get performance metrics for a strategy
   */
  getPerformanceMetrics(symbol, strategy) {
    const key = `${symbol}_${strategy}`;
    return this.performanceMetrics.get(key) || null;
  }

  /**
   * Start the signal engine
   */
  startSignalEngine() {
    this.logger?.info('🚨 Smart Alerts Service started');

    // Clean up old signals every hour
    setInterval(() => {
      this.cleanupOldSignals();
    }, 3600000);
  }

  /**
   * Clean up old inactive signals
   */
  cleanupOldSignals() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago

    for (const [alertId, signal] of this.activeSignals) {
      if (signal.timestamp < cutoffTime && signal.status === 'ACTIVE') {
        signal.status = 'EXPIRED';
        this.activeSignals.delete(alertId);
        this.logger?.info(`Expired old signal: ${alertId}`);
      }
    }
  }
}

module.exports = SmartAlertsService;
