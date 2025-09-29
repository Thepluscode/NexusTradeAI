/**
 * Nexus Alpha - Super-Efficient Trading Algorithm
 * 
 * Multi-strategy ensemble with ML/RL optimization for FCT-style automation
 * Features: Trend-following, Mean-reversion, Volatility breakout, AI-driven signals
 */

const EventEmitter = require('events');
const Redis = require('ioredis');
const { 
  calculateATR, 
  calculateMACD, 
  calculateRSI, 
  calculateBollingerBands,
  calculateEMA 
} = require('../../shared/libs/trading/technical-indicators');

class NexusAlpha extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Strategy configuration
      strategies: config.strategies || ['trend', 'mean_reversion', 'volatility_breakout', 'ai_signals'],
      riskPerTrade: config.riskPerTrade || 0.01, // 1% equity risk
      minConfidence: config.minConfidence || 0.7,
      maxPortfolioRisk: config.maxPortfolioRisk || 0.05, // 5% total portfolio risk
      
      // Technical indicator periods
      atrPeriod: config.atrPeriod || 14,
      rsiPeriod: config.rsiPeriod || 14,
      macdFast: config.macdFast || 12,
      macdSlow: config.macdSlow || 26,
      macdSignal: config.macdSignal || 9,
      
      // Risk management
      stopLossMultiplier: config.stopLossMultiplier || 1.0,
      takeProfitMultiplier: config.takeProfitMultiplier || 2.0,
      trailingStopMultiplier: config.trailingStopMultiplier || 1.5,
      
      // AI/ML settings
      enableAI: config.enableAI || true,
      confidenceThreshold: config.confidenceThreshold || 0.6,
      
      // Redis connection
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'
    };
    
    // Initialize Redis connection
    this.redis = new Redis(this.config.redisUrl);
    
    // Strategy weights for ensemble
    this.strategyWeights = {
      trend: 0.3,
      mean_reversion: 0.25,
      volatility_breakout: 0.25,
      ai_signals: 0.2
    };
    
    // Performance tracking
    this.performance = {
      totalTrades: 0,
      winningTrades: 0,
      totalPnL: 0,
      sharpeRatio: 0,
      maxDrawdown: 0
    };
    
    console.log('🧠 Nexus Alpha algorithm initialized');
  }

  /**
   * Generate trading signal using multi-strategy ensemble
   */
  async generateSignal(instrument, marketData, aiPrediction = null) {
    try {
      // Calculate technical indicators
      const indicators = this.calculateIndicators(marketData);
      
      // Generate signals from each strategy
      const signals = {
        trend: this.generateTrendSignal(instrument, marketData, indicators),
        mean_reversion: this.generateMeanReversionSignal(instrument, marketData, indicators),
        volatility_breakout: this.generateVolatilityBreakoutSignal(instrument, marketData, indicators),
        ai_signals: this.generateAISignal(instrument, marketData, aiPrediction)
      };
      
      // Combine signals using ensemble approach
      const ensembleSignal = this.combineSignals(instrument, signals, marketData, indicators);
      
      if (ensembleSignal) {
        // Publish signal to Redis for other services
        await this.redis.publish('nexus_signals', JSON.stringify(ensembleSignal));
        
        this.emit('signalGenerated', ensembleSignal);
        
        console.log(`📊 Nexus Alpha signal: ${ensembleSignal.action} ${instrument} (Confidence: ${ensembleSignal.confidence.toFixed(2)})`);
      }
      
      return ensembleSignal;
      
    } catch (error) {
      console.error('❌ Error generating Nexus Alpha signal:', error);
      this.emit('error', error);
      return null;
    }
  }

  /**
   * Calculate technical indicators
   */
  calculateIndicators(marketData) {
    const prices = marketData.map(candle => candle.close);
    const highs = marketData.map(candle => candle.high);
    const lows = marketData.map(candle => candle.low);
    const volumes = marketData.map(candle => candle.volume);
    
    return {
      atr: calculateATR(marketData, this.config.atrPeriod),
      macd: calculateMACD(prices, this.config.macdFast, this.config.macdSlow, this.config.macdSignal),
      rsi: calculateRSI(prices, this.config.rsiPeriod),
      bollinger: calculateBollingerBands(prices, 20, 2),
      ema20: calculateEMA(prices, 20),
      ema50: calculateEMA(prices, 50),
      currentPrice: prices[prices.length - 1],
      volume: volumes[volumes.length - 1],
      avgVolume: volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
    };
  }

  /**
   * Generate trend-following signal
   */
  generateTrendSignal(instrument, marketData, indicators) {
    const { macd, ema20, ema50, currentPrice } = indicators;
    
    // MACD crossover strategy
    const macdBullish = macd.macd > macd.signal && macd.histogram > 0;
    const macdBearish = macd.macd < macd.signal && macd.histogram < 0;
    
    // EMA trend confirmation
    const uptrend = ema20 > ema50 && currentPrice > ema20;
    const downtrend = ema20 < ema50 && currentPrice < ema20;
    
    let signal = null;
    let confidence = 0;
    
    if (macdBullish && uptrend) {
      confidence = 0.8;
      signal = {
        action: 'BUY',
        strategy: 'trend',
        confidence: confidence,
        reason: 'MACD bullish crossover with EMA uptrend'
      };
    } else if (macdBearish && downtrend) {
      confidence = 0.8;
      signal = {
        action: 'SELL',
        strategy: 'trend',
        confidence: confidence,
        reason: 'MACD bearish crossover with EMA downtrend'
      };
    }
    
    return signal;
  }

  /**
   * Generate mean-reversion signal
   */
  generateMeanReversionSignal(instrument, marketData, indicators) {
    const { rsi, bollinger, currentPrice } = indicators;
    
    let signal = null;
    let confidence = 0;
    
    // RSI oversold/overbought with Bollinger Bands confirmation
    if (rsi < 30 && currentPrice < bollinger.lower) {
      confidence = 0.75;
      signal = {
        action: 'BUY',
        strategy: 'mean_reversion',
        confidence: confidence,
        reason: `RSI oversold (${rsi.toFixed(1)}) + price below lower Bollinger Band`
      };
    } else if (rsi > 70 && currentPrice > bollinger.upper) {
      confidence = 0.75;
      signal = {
        action: 'SELL',
        strategy: 'mean_reversion',
        confidence: confidence,
        reason: `RSI overbought (${rsi.toFixed(1)}) + price above upper Bollinger Band`
      };
    }
    
    return signal;
  }

  /**
   * Generate volatility breakout signal
   */
  generateVolatilityBreakoutSignal(instrument, marketData, indicators) {
    const { atr, currentPrice, volume, avgVolume } = indicators;
    
    // Get previous candle data
    const prevCandle = marketData[marketData.length - 2];
    const currentCandle = marketData[marketData.length - 1];
    
    let signal = null;
    let confidence = 0;
    
    // Volume confirmation
    const volumeConfirmation = volume > avgVolume * 1.5;
    
    // Breakout above previous high + ATR
    if (currentPrice > prevCandle.high + atr && volumeConfirmation) {
      confidence = 0.7;
      signal = {
        action: 'BUY',
        strategy: 'volatility_breakout',
        confidence: confidence,
        reason: `Upward breakout above ${prevCandle.high.toFixed(2)} + ATR with volume confirmation`
      };
    }
    // Breakdown below previous low - ATR
    else if (currentPrice < prevCandle.low - atr && volumeConfirmation) {
      confidence = 0.7;
      signal = {
        action: 'SELL',
        strategy: 'volatility_breakout',
        confidence: confidence,
        reason: `Downward breakdown below ${prevCandle.low.toFixed(2)} - ATR with volume confirmation`
      };
    }
    
    return signal;
  }

  /**
   * Generate AI-driven signal
   */
  generateAISignal(instrument, marketData, aiPrediction) {
    if (!this.config.enableAI || !aiPrediction) {
      return null;
    }
    
    let signal = null;
    
    if (aiPrediction.confidence > this.config.confidenceThreshold) {
      const action = aiPrediction.direction > 0 ? 'BUY' : 'SELL';
      
      signal = {
        action: action,
        strategy: 'ai_signals',
        confidence: aiPrediction.confidence,
        reason: `AI prediction: ${aiPrediction.direction > 0 ? 'bullish' : 'bearish'} (${(aiPrediction.confidence * 100).toFixed(1)}% confidence)`
      };
    }
    
    return signal;
  }

  /**
   * Combine signals using ensemble approach
   */
  combineSignals(instrument, signals, marketData, indicators) {
    const validSignals = Object.values(signals).filter(s => s !== null);
    
    if (validSignals.length === 0) {
      return null;
    }
    
    // Calculate weighted scores
    let buyScore = 0;
    let sellScore = 0;
    let totalWeight = 0;
    let reasons = [];
    
    for (const signal of validSignals) {
      const weight = this.strategyWeights[signal.strategy] || 0.25;
      const score = signal.confidence * weight;
      
      if (signal.action === 'BUY') {
        buyScore += score;
      } else if (signal.action === 'SELL') {
        sellScore += score;
      }
      
      totalWeight += weight;
      reasons.push(`${signal.strategy}: ${signal.reason}`);
    }
    
    // Determine final action
    let finalAction = 'HOLD';
    let finalConfidence = 0;
    
    if (buyScore > sellScore && buyScore > this.config.minConfidence) {
      finalAction = 'BUY';
      finalConfidence = buyScore;
    } else if (sellScore > buyScore && sellScore > this.config.minConfidence) {
      finalAction = 'SELL';
      finalConfidence = sellScore;
    }
    
    if (finalAction === 'HOLD') {
      return null;
    }
    
    // Calculate position sizing and risk management levels
    const { stopLoss, takeProfit } = this.calculateRiskLevels(
      finalAction, 
      indicators.currentPrice, 
      indicators.atr,
      finalConfidence
    );
    
    return {
      instrument,
      action: finalAction,
      price: indicators.currentPrice,
      stopLoss,
      takeProfit,
      confidence: finalConfidence,
      timestamp: new Date().toISOString(),
      strategies: validSignals.map(s => s.strategy),
      reasons: reasons,
      atr: indicators.atr,
      riskReward: Math.abs(takeProfit - indicators.currentPrice) / Math.abs(indicators.currentPrice - stopLoss)
    };
  }

  /**
   * Calculate risk management levels
   */
  calculateRiskLevels(action, currentPrice, atr, confidence) {
    // Adjust stop loss based on confidence
    const stopMultiplier = this.config.stopLossMultiplier * (2 - confidence); // Higher confidence = tighter stops
    const profitMultiplier = this.config.takeProfitMultiplier;
    
    let stopLoss, takeProfit;
    
    if (action === 'BUY') {
      stopLoss = currentPrice - (atr * stopMultiplier);
      takeProfit = currentPrice + (atr * profitMultiplier);
    } else { // SELL
      stopLoss = currentPrice + (atr * stopMultiplier);
      takeProfit = currentPrice - (atr * profitMultiplier);
    }
    
    return { stopLoss, takeProfit };
  }

  /**
   * Calculate position size using Kelly Criterion
   */
  calculatePositionSize(equity, stopLoss, currentPrice, winRate = 0.6, avgWin = 1.5, avgLoss = 1.0) {
    // Kelly Criterion: f = (bp - q) / b
    // where b = odds (avgWin/avgLoss), p = win rate, q = loss rate
    const b = avgWin / avgLoss;
    const p = winRate;
    const q = 1 - winRate;
    
    const kellyFraction = (b * p - q) / b;
    
    // Cap Kelly fraction at risk per trade setting
    const safeFraction = Math.min(kellyFraction, this.config.riskPerTrade);
    
    // Calculate position size
    const riskAmount = equity * safeFraction;
    const stopDistance = Math.abs(currentPrice - stopLoss);
    const positionSize = Math.floor(riskAmount / stopDistance);
    
    return Math.max(1, positionSize); // Minimum 1 share/unit
  }

  /**
   * Update trailing stops based on current price and confidence
   */
  async updateTrailingStops(instrument, currentPrice, confidence) {
    try {
      const tradeKey = `trade:${instrument}:*`;
      const trades = await this.redis.keys(tradeKey);
      
      for (const tradeKey of trades) {
        const tradeData = JSON.parse(await this.redis.get(tradeKey));
        
        if (tradeData && tradeData.status === 'OPEN') {
          const atr = tradeData.atr || 1.0; // Fallback ATR
          let newStopLoss = tradeData.stopLoss;
          
          // Adjust trailing stop based on confidence
          const trailingMultiplier = confidence > 0.8 ? 
            this.config.trailingStopMultiplier * 1.5 : // Wider stop for high confidence
            this.config.trailingStopMultiplier * 0.75;  // Tighter stop for low confidence
          
          if (tradeData.side === 'BUY' && currentPrice > tradeData.entryPrice) {
            // Trail stop up for long positions in profit
            const trailingStop = currentPrice - (atr * trailingMultiplier);
            newStopLoss = Math.max(tradeData.stopLoss, trailingStop);
          } else if (tradeData.side === 'SELL' && currentPrice < tradeData.entryPrice) {
            // Trail stop down for short positions in profit
            const trailingStop = currentPrice + (atr * trailingMultiplier);
            newStopLoss = Math.min(tradeData.stopLoss, trailingStop);
          }
          
          // Update if stop loss changed
          if (newStopLoss !== tradeData.stopLoss) {
            tradeData.stopLoss = newStopLoss;
            await this.redis.set(tradeKey, JSON.stringify(tradeData));
            
            this.emit('stopLossUpdated', {
              instrument,
              oldStopLoss: tradeData.stopLoss,
              newStopLoss: newStopLoss,
              currentPrice,
              confidence
            });
          }
        }
      }
    } catch (error) {
      console.error('❌ Error updating trailing stops:', error);
    }
  }

  /**
   * Get algorithm performance metrics
   */
  getPerformance() {
    const winRate = this.performance.totalTrades > 0 ? 
      this.performance.winningTrades / this.performance.totalTrades : 0;
    
    return {
      ...this.performance,
      winRate: winRate,
      avgPnLPerTrade: this.performance.totalTrades > 0 ? 
        this.performance.totalPnL / this.performance.totalTrades : 0
    };
  }

  /**
   * Update performance tracking
   */
  updatePerformance(trade) {
    this.performance.totalTrades++;
    this.performance.totalPnL += trade.pnl;
    
    if (trade.pnl > 0) {
      this.performance.winningTrades++;
    }
    
    // Update max drawdown if needed
    if (trade.pnl < 0) {
      this.performance.maxDrawdown = Math.min(this.performance.maxDrawdown, trade.pnl);
    }
  }

  /**
   * Cleanup Redis connections
   */
  async cleanup() {
    if (this.redis) {
      await this.redis.disconnect();
    }
  }
}

module.exports = NexusAlpha;
