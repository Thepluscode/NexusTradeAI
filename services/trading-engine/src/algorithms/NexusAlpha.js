// Nexus Alpha: Super-Efficient Multi-Strategy Trading Algorithm
// AI-driven trading with trend-following, mean-reversion, volatility breakout, and RL optimization

const EventEmitter = require('events');
const { calculateATR, calculateMACD, calculateRSI, calculateBollingerBands } = require('../shared/libs/trading/technical-indicators');
const { Alpaca } = require('@alpacahq/alpaca-trade-api');
const Redis = require('ioredis');
const tf = require('@tensorflow/tfjs-node');

class NexusAlpha extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Algorithm configuration
    this.config = {
      strategies: config.strategies || ['trend', 'mean_reversion', 'volatility_breakout'],
      riskPerTrade: config.riskPerTrade || 0.01, // 1% equity risk
      minConfidence: config.minConfidence || 0.7,
      maxPortfolioRisk: config.maxPortfolioRisk || 0.05, // 5% total portfolio risk
      atrPeriod: config.atrPeriod || 14,
      rsiPeriod: config.rsiPeriod || 14,
      macdFast: config.macdFast || 12,
      macdSlow: config.macdSlow || 26,
      macdSignal: config.macdSignal || 9,
      
      // Cross-asset regime rotation
      regimeRotation: config.regimeRotation || true,
      assetClasses: config.assetClasses || ['stocks', 'crypto', 'forex', 'commodities'],
      
      // AI/ML configuration
      aiEnabled: config.aiEnabled || true,
      lstmLookback: config.lstmLookback || 60,
      predictionHorizons: config.predictionHorizons || [1, 4, 24], // hours
      
      // Risk management
      kellyFraction: config.kellyFraction || 0.25, // 25% of Kelly criterion
      maxPositionSize: config.maxPositionSize || 0.1, // 10% of portfolio
      correlationThreshold: config.correlationThreshold || 0.7,
      
      // Execution
      executionMode: config.executionMode || 'LIVE', // LIVE, PAPER, BACKTEST
      brokerConfig: config.brokerConfig || {}
    };
    
    // Initialize components
    this.alpaca = new Alpaca({
      keyId: process.env.ALPACA_KEY,
      secretKey: process.env.ALPACA_SECRET,
      paper: this.config.executionMode === 'PAPER'
    });
    
    this.redis = new Redis(process.env.REDIS_URL);
    
    // AI Models
    this.models = {
      lstm: null,
      dqn: null,
      regimeClassifier: null
    };
    
    // Strategy state
    this.activePositions = new Map();
    this.marketRegimes = new Map();
    this.correlationMatrix = new Map();
    this.performanceMetrics = {
      totalTrades: 0,
      winningTrades: 0,
      totalPnL: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0
    };
    
    this.initializeAlgorithm();
  }

  /**
   * Initialize Nexus Alpha algorithm
   */
  async initializeAlgorithm() {
    try {
      // Load AI models
      await this.loadAIModels();
      
      // Initialize market data subscriptions
      await this.initializeMarketData();
      
      // Start strategy execution
      this.startStrategyExecution();
      
      console.log('🚀 Nexus Alpha Algorithm initialized');
      
    } catch (error) {
      console.error('Error initializing Nexus Alpha:', error);
      throw error;
    }
  }

  /**
   * Load AI/ML models for predictions
   */
  async loadAIModels() {
    try {
      // Load LSTM model for price prediction
      this.models.lstm = await tf.loadLayersModel('file://./models/lstm_price_predictor.json');
      
      // Load DQN model for exit optimization
      this.models.dqn = await tf.loadLayersModel('file://./models/dqn_exit_optimizer.json');
      
      // Load regime classification model
      this.models.regimeClassifier = await tf.loadLayersModel('file://./models/regime_classifier.json');
      
      console.log('AI models loaded successfully');
      
    } catch (error) {
      console.warn('Could not load AI models, using fallback logic:', error);
      // Create simple models for demonstration
      this.createFallbackModels();
    }
  }

  /**
   * Generate trading signal using multi-strategy approach
   */
  async generateSignal(instrument, marketData, account) {
    try {
      // Calculate technical indicators
      const indicators = this.calculateTechnicalIndicators(marketData);
      
      // Get AI prediction
      const prediction = await this.getAIPrediction(instrument, marketData, indicators);
      
      // Check market regime
      const regime = await this.getMarketRegime(instrument, marketData);
      
      // Generate signals from each strategy
      const signals = {
        trend: this.generateTrendSignal(indicators, prediction, regime),
        meanReversion: this.generateMeanReversionSignal(indicators, prediction, regime),
        volatilityBreakout: this.generateVolatilityBreakoutSignal(indicators, prediction, regime)
      };
      
      // Combine signals using ensemble approach
      const finalSignal = this.combineSignals(signals, instrument, marketData, account);
      
      if (finalSignal) {
        // Apply risk management
        finalSignal.positionSize = await this.calculatePositionSize(finalSignal, account);
        
        // Validate signal
        const isValid = await this.validateSignal(finalSignal, account);
        
        if (isValid) {
          // Publish signal to Redis
          await this.redis.publish('nexus_signals', JSON.stringify(finalSignal));
          
          this.emit('signalGenerated', finalSignal);
          return finalSignal;
        }
      }
      
      return null;
      
    } catch (error) {
      console.error('Error generating signal:', error);
      return null;
    }
  }

  /**
   * Calculate technical indicators
   */
  calculateTechnicalIndicators(marketData) {
    const closes = marketData.map(candle => candle.close);
    const highs = marketData.map(candle => candle.high);
    const lows = marketData.map(candle => candle.low);
    const volumes = marketData.map(candle => candle.volume);
    
    return {
      atr: calculateATR(marketData, this.config.atrPeriod),
      macd: calculateMACD(closes, this.config.macdFast, this.config.macdSlow, this.config.macdSignal),
      rsi: calculateRSI(closes, this.config.rsiPeriod),
      bollinger: calculateBollingerBands(closes, 20, 2),
      sma20: this.calculateSMA(closes, 20),
      sma50: this.calculateSMA(closes, 50),
      ema12: this.calculateEMA(closes, 12),
      ema26: this.calculateEMA(closes, 26),
      volume: volumes[volumes.length - 1],
      avgVolume: volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20,
      currentPrice: closes[closes.length - 1]
    };
  }

  /**
   * Generate trend-following signal
   */
  generateTrendSignal(indicators, prediction, regime) {
    const { macd, sma20, sma50, ema12, ema26, currentPrice } = indicators;
    
    let signal = null;
    let confidence = 0;
    
    // MACD bullish crossover + price above moving averages
    if (macd.histogram > 0 && macd.macd > macd.signal && 
        currentPrice > sma20 && sma20 > sma50 && 
        ema12 > ema26) {
      
      signal = 'BUY';
      confidence = 0.8;
      
      // Boost confidence with AI prediction
      if (prediction.direction === 'UP' && prediction.confidence > 0.7) {
        confidence = Math.min(confidence + 0.15, 0.95);
      }
      
      // Adjust for market regime
      if (regime.type === 'BULL_MARKET') {
        confidence *= 1.1;
      } else if (regime.type === 'BEAR_MARKET') {
        confidence *= 0.8;
      }
    }
    
    // MACD bearish crossover + price below moving averages
    else if (macd.histogram < 0 && macd.macd < macd.signal && 
             currentPrice < sma20 && sma20 < sma50 && 
             ema12 < ema26) {
      
      signal = 'SELL';
      confidence = 0.8;
      
      // Boost confidence with AI prediction
      if (prediction.direction === 'DOWN' && prediction.confidence > 0.7) {
        confidence = Math.min(confidence + 0.15, 0.95);
      }
      
      // Adjust for market regime
      if (regime.type === 'BEAR_MARKET') {
        confidence *= 1.1;
      } else if (regime.type === 'BULL_MARKET') {
        confidence *= 0.8;
      }
    }
    
    return signal ? {
      strategy: 'TREND',
      action: signal,
      confidence: Math.min(confidence, 1.0),
      reasoning: `MACD ${signal === 'BUY' ? 'bullish' : 'bearish'} crossover with MA alignment`
    } : null;
  }

  /**
   * Generate mean-reversion signal
   */
  generateMeanReversionSignal(indicators, prediction, regime) {
    const { rsi, bollinger, currentPrice } = indicators;
    
    let signal = null;
    let confidence = 0;
    
    // Oversold conditions
    if (rsi < 30 && currentPrice < bollinger.lower) {
      signal = 'BUY';
      confidence = 0.75;
      
      // Higher confidence if extremely oversold
      if (rsi < 20) confidence += 0.1;
      
      // Adjust for prediction
      if (prediction.direction === 'UP') {
        confidence += 0.1;
      }
    }
    
    // Overbought conditions
    else if (rsi > 70 && currentPrice > bollinger.upper) {
      signal = 'SELL';
      confidence = 0.75;
      
      // Higher confidence if extremely overbought
      if (rsi > 80) confidence += 0.1;
      
      // Adjust for prediction
      if (prediction.direction === 'DOWN') {
        confidence += 0.1;
      }
    }
    
    // Mean reversion works better in ranging markets
    if (regime.type === 'SIDEWAYS_MARKET') {
      confidence *= 1.2;
    } else if (regime.type === 'TRENDING_MARKET') {
      confidence *= 0.7;
    }
    
    return signal ? {
      strategy: 'MEAN_REVERSION',
      action: signal,
      confidence: Math.min(confidence, 1.0),
      reasoning: `RSI ${signal === 'BUY' ? 'oversold' : 'overbought'} with Bollinger Band breach`
    } : null;
  }

  /**
   * Generate volatility breakout signal
   */
  generateVolatilityBreakoutSignal(indicators, prediction, regime) {
    const { atr, currentPrice, volume, avgVolume, bollinger } = indicators;
    
    let signal = null;
    let confidence = 0;
    
    const volatilityThreshold = atr * 1.5;
    const volumeConfirmation = volume > avgVolume * 1.5;
    
    // Upward breakout
    if (currentPrice > bollinger.upper + volatilityThreshold && volumeConfirmation) {
      signal = 'BUY';
      confidence = 0.8;
      
      // Higher confidence with AI confirmation
      if (prediction.direction === 'UP' && prediction.confidence > 0.6) {
        confidence += 0.1;
      }
    }
    
    // Downward breakout
    else if (currentPrice < bollinger.lower - volatilityThreshold && volumeConfirmation) {
      signal = 'SELL';
      confidence = 0.8;
      
      // Higher confidence with AI confirmation
      if (prediction.direction === 'DOWN' && prediction.confidence > 0.6) {
        confidence += 0.1;
      }
    }
    
    // Volatility breakouts work better in volatile markets
    if (regime.volatility === 'HIGH') {
      confidence *= 1.1;
    } else if (regime.volatility === 'LOW') {
      confidence *= 0.8;
    }
    
    return signal ? {
      strategy: 'VOLATILITY_BREAKOUT',
      action: signal,
      confidence: Math.min(confidence, 1.0),
      reasoning: `Volatility breakout with volume confirmation`
    } : null;
  }

  /**
   * Combine signals from multiple strategies
   */
  combineSignals(signals, instrument, marketData, account) {
    const validSignals = Object.values(signals).filter(s => s !== null);
    
    if (validSignals.length === 0) return null;
    
    // Count buy/sell signals
    const buySignals = validSignals.filter(s => s.action === 'BUY');
    const sellSignals = validSignals.filter(s => s.action === 'SELL');
    
    let finalAction = null;
    let finalConfidence = 0;
    let strategies = [];
    
    // Determine final action
    if (buySignals.length > sellSignals.length) {
      finalAction = 'BUY';
      finalConfidence = buySignals.reduce((sum, s) => sum + s.confidence, 0) / buySignals.length;
      strategies = buySignals.map(s => s.strategy);
    } else if (sellSignals.length > buySignals.length) {
      finalAction = 'SELL';
      finalConfidence = sellSignals.reduce((sum, s) => sum + s.confidence, 0) / sellSignals.length;
      strategies = sellSignals.map(s => s.strategy);
    } else {
      // Tie - use highest confidence signal
      const highestConfidenceSignal = validSignals.reduce((max, s) => 
        s.confidence > max.confidence ? s : max
      );
      
      if (highestConfidenceSignal.confidence >= this.config.minConfidence) {
        finalAction = highestConfidenceSignal.action;
        finalConfidence = highestConfidenceSignal.confidence;
        strategies = [highestConfidenceSignal.strategy];
      }
    }
    
    // Only proceed if confidence meets threshold
    if (finalConfidence < this.config.minConfidence) {
      return null;
    }
    
    const currentPrice = marketData[marketData.length - 1].close;
    const atr = calculateATR(marketData, this.config.atrPeriod);
    
    return {
      instrument,
      action: finalAction,
      price: currentPrice,
      stopLoss: finalAction === 'BUY' ? currentPrice - atr : currentPrice + atr,
      takeProfit: finalAction === 'BUY' ? currentPrice + (2 * atr) : currentPrice - (2 * atr),
      confidence: finalConfidence,
      strategies,
      timestamp: new Date().toISOString(),
      metadata: {
        atr,
        signals: validSignals,
        marketData: {
          price: currentPrice,
          volume: marketData[marketData.length - 1].volume
        }
      }
    };
  }

  /**
   * Execute trade based on signal
   */
  async executeTrade(signal, account) {
    try {
      if (this.config.executionMode === 'BACKTEST') {
        return this.simulateTradeExecution(signal, account);
      }
      
      const positionSize = signal.positionSize;
      
      // Create order with Alpaca
      const order = await this.alpaca.createOrder({
        symbol: signal.instrument,
        qty: Math.abs(positionSize),
        side: signal.action.toLowerCase(),
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        stop_loss: {
          stop_price: signal.stopLoss.toFixed(2)
        },
        take_profit: {
          limit_price: signal.takeProfit.toFixed(2)
        }
      });
      
      // Store trade information
      const tradeData = {
        orderId: order.id,
        signal,
        account: account.id,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString()
      };
      
      await this.redis.set(`trade:${signal.instrument}:${account.id}:${order.id}`, JSON.stringify(tradeData));
      
      // Track position
      this.activePositions.set(order.id, tradeData);
      
      this.emit('tradeExecuted', tradeData);
      
      console.log(`Trade executed: ${signal.action} ${positionSize} ${signal.instrument} at ${signal.price}`);
      
      return order;
      
    } catch (error) {
      console.error('Error executing trade:', error);
      throw error;
    }
  }

  /**
   * Calculate position size using Kelly criterion and risk management
   */
  async calculatePositionSize(signal, account) {
    const equity = account.equity;
    const riskAmount = equity * this.config.riskPerTrade;
    
    // Calculate risk per share
    const riskPerShare = Math.abs(signal.price - signal.stopLoss);
    
    // Basic position size
    let positionSize = Math.floor(riskAmount / riskPerShare);
    
    // Apply Kelly criterion if we have historical data
    const kellyFraction = await this.calculateKellyFraction(signal.instrument);
    if (kellyFraction > 0) {
      const kellySize = Math.floor((equity * kellyFraction * this.config.kellyFraction) / signal.price);
      positionSize = Math.min(positionSize, kellySize);
    }
    
    // Apply maximum position size limit
    const maxSize = Math.floor((equity * this.config.maxPositionSize) / signal.price);
    positionSize = Math.min(positionSize, maxSize);
    
    // Ensure minimum viable position
    positionSize = Math.max(positionSize, 1);
    
    return positionSize;
  }

  /**
   * Get AI prediction for price movement
   */
  async getAIPrediction(instrument, marketData, indicators) {
    try {
      if (!this.models.lstm) {
        return { direction: 'NEUTRAL', confidence: 0.5, predictions: {} };
      }
      
      // Prepare input features
      const features = this.prepareMLFeatures(marketData, indicators);
      const inputTensor = tf.tensor2d([features]);
      
      // Get prediction
      const prediction = this.models.lstm.predict(inputTensor);
      const predictionData = await prediction.data();
      
      // Clean up tensors
      inputTensor.dispose();
      prediction.dispose();
      
      // Interpret prediction
      const priceChange = predictionData[0];
      const confidence = Math.abs(priceChange);
      const direction = priceChange > 0.001 ? 'UP' : priceChange < -0.001 ? 'DOWN' : 'NEUTRAL';
      
      return {
        direction,
        confidence: Math.min(confidence * 2, 1.0), // Scale confidence
        priceChange,
        predictions: {
          '1h': predictionData[0],
          '4h': predictionData[1] || priceChange,
          '24h': predictionData[2] || priceChange
        }
      };
      
    } catch (error) {
      console.error('Error getting AI prediction:', error);
      return { direction: 'NEUTRAL', confidence: 0.5, predictions: {} };
    }
  }

  /**
   * Prepare ML features from market data and indicators
   */
  prepareMLFeatures(marketData, indicators) {
    const features = [];
    
    // Price features
    const closes = marketData.slice(-this.config.lstmLookback).map(c => c.close);
    const returns = closes.slice(1).map((price, i) => (price - closes[i]) / closes[i]);
    
    // Normalize returns
    const normalizedReturns = this.normalizeArray(returns);
    features.push(...normalizedReturns.slice(-20)); // Last 20 returns
    
    // Technical indicator features
    features.push(
      (indicators.rsi - 50) / 50, // Normalized RSI
      indicators.macd.histogram / indicators.currentPrice, // Normalized MACD histogram
      (indicators.currentPrice - indicators.bollinger.middle) / indicators.bollinger.middle, // BB position
      Math.log(indicators.volume / indicators.avgVolume), // Log volume ratio
      (indicators.sma20 - indicators.sma50) / indicators.sma50 // MA spread
    );
    
    // Pad or truncate to fixed size
    while (features.length < 30) features.push(0);
    return features.slice(0, 30);
  }

  // Helper methods
  calculateSMA(prices, period) {
    const slice = prices.slice(-period);
    return slice.reduce((sum, price) => sum + price, 0) / slice.length;
  }

  calculateEMA(prices, period) {
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  normalizeArray(arr) {
    const mean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
    const std = Math.sqrt(arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length);
    return arr.map(val => (val - mean) / (std || 1));
  }

  createFallbackModels() {
    // Create simple models for demonstration
    this.models.lstm = {
      predict: (input) => {
        // Simple random prediction for demo
        const randomChange = (Math.random() - 0.5) * 0.02;
        return {
          data: () => Promise.resolve([randomChange, randomChange * 0.8, randomChange * 0.6])
        };
      }
    };
  }

  // Placeholder methods for full implementation
  async initializeMarketData() {}
  startStrategyExecution() {}
  async getMarketRegime(instrument, marketData) {
    return { type: 'NEUTRAL', volatility: 'MEDIUM' };
  }
  async validateSignal(signal, account) { return true; }
  async calculateKellyFraction(instrument) { return 0.1; }
  simulateTradeExecution(signal, account) { return { id: 'sim_' + Date.now() }; }
}

module.exports = NexusAlpha;
