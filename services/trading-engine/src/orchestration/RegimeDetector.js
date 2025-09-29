// Market Regime Detection System
// Advanced ML-based system for detecting market regimes and transitions

const EventEmitter = require('events');
const tf = require('@tensorflow/tfjs-node');

class RegimeDetector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.marketDataService = options.marketDataService;
    
    // Regime types and characteristics
    this.regimeTypes = {
      BULL: {
        name: 'Bull Market',
        characteristics: {
          trend: 'UP',
          volatility: 'LOW_TO_MEDIUM',
          volume: 'INCREASING',
          sentiment: 'POSITIVE'
        }
      },
      BEAR: {
        name: 'Bear Market',
        characteristics: {
          trend: 'DOWN',
          volatility: 'HIGH',
          volume: 'DECREASING',
          sentiment: 'NEGATIVE'
        }
      },
      NEUTRAL: {
        name: 'Sideways Market',
        characteristics: {
          trend: 'SIDEWAYS',
          volatility: 'LOW',
          volume: 'STABLE',
          sentiment: 'NEUTRAL'
        }
      },
      VOLATILE: {
        name: 'High Volatility',
        characteristics: {
          trend: 'MIXED',
          volatility: 'VERY_HIGH',
          volume: 'HIGH',
          sentiment: 'UNCERTAIN'
        }
      },
      TREND: {
        name: 'Strong Trend',
        characteristics: {
          trend: 'STRONG_DIRECTIONAL',
          volatility: 'MEDIUM',
          volume: 'HIGH',
          sentiment: 'CONFIDENT'
        }
      }
    };
    
    // Detection parameters
    this.config = {
      lookbackPeriod: options.lookbackPeriod || 252, // 1 year of daily data
      updateFrequency: options.updateFrequency || 60000, // 1 minute
      confidenceThreshold: options.confidenceThreshold || 0.6,
      transitionSmoothingPeriod: options.transitionSmoothingPeriod || 5,
      featureWeights: {
        price: 0.25,
        volatility: 0.20,
        volume: 0.15,
        momentum: 0.20,
        sentiment: 0.10,
        correlation: 0.10
      }
    };
    
    // ML model for regime classification
    this.regimeModel = null;
    this.isModelTrained = false;
    
    // Feature extractors
    this.featureExtractors = {
      price: new PriceFeatureExtractor(),
      volatility: new VolatilityFeatureExtractor(),
      volume: new VolumeFeatureExtractor(),
      momentum: new MomentumFeatureExtractor(),
      sentiment: new SentimentFeatureExtractor(),
      correlation: new CorrelationFeatureExtractor()
    };
    
    // Historical data and regime tracking
    this.marketData = new Map();
    this.regimeHistory = [];
    this.currentRegime = null;
    this.regimeTransitionProbabilities = new Map();
    
    // Performance tracking
    this.metrics = {
      accuracy: 0,
      precision: {},
      recall: {},
      f1Score: {},
      totalPredictions: 0,
      correctPredictions: 0,
      lastUpdate: null
    };
  }

  /**
   * Initialize the regime detector
   */
  async initialize() {
    try {
      // Load historical market data
      await this.loadHistoricalData();
      
      // Train or load the regime classification model
      await this.initializeModel();
      
      // Calculate initial regime transition probabilities
      this.calculateTransitionProbabilities();
      
      // Detect initial regime
      this.currentRegime = await this.detectCurrentRegime();
      
      this.logger?.info('📊 Regime Detector initialized');
      
    } catch (error) {
      this.logger?.error('Failed to initialize regime detector:', error);
      throw error;
    }
  }

  /**
   * Load historical market data for training
   */
  async loadHistoricalData() {
    try {
      // Load data for major market indices and assets
      const symbols = ['SPY', 'QQQ', 'VIX', 'DXY', 'GLD', 'BTC/USD', 'EUR/USD'];
      
      for (const symbol of symbols) {
        const data = await this.getHistoricalData(symbol, this.config.lookbackPeriod);
        this.marketData.set(symbol, data);
      }
      
      this.logger?.info(`Loaded historical data for ${symbols.length} symbols`);
      
    } catch (error) {
      this.logger?.error('Error loading historical data:', error);
      throw error;
    }
  }

  /**
   * Get historical data for a symbol
   */
  async getHistoricalData(symbol, periods) {
    // In production, this would fetch from your market data service
    // For now, generate synthetic data
    const data = [];
    let price = 100;
    
    for (let i = 0; i < periods; i++) {
      const change = (Math.random() - 0.5) * 0.04; // ±2% daily change
      price *= (1 + change);
      
      data.push({
        timestamp: Date.now() - (periods - i) * 24 * 60 * 60 * 1000,
        open: price * 0.999,
        high: price * 1.002,
        low: price * 0.998,
        close: price,
        volume: 1000000 * (1 + (Math.random() - 0.5) * 0.5)
      });
    }
    
    return data;
  }

  /**
   * Initialize or load the regime classification model
   */
  async initializeModel() {
    try {
      // Try to load existing model
      try {
        this.regimeModel = await tf.loadLayersModel('file://./models/regime_detector.json');
        this.isModelTrained = true;
        this.logger?.info('Loaded existing regime detection model');
      } catch (loadError) {
        // Train new model if loading fails
        await this.trainRegimeModel();
      }
      
    } catch (error) {
      this.logger?.error('Error initializing regime model:', error);
      throw error;
    }
  }

  /**
   * Train the regime classification model
   */
  async trainRegimeModel() {
    try {
      this.logger?.info('Training regime detection model...');
      
      // Extract features from historical data
      const { features, labels } = await this.prepareTrainingData();
      
      // Create neural network model
      this.regimeModel = tf.sequential({
        layers: [
          tf.layers.dense({
            inputShape: [features.shape[1]],
            units: 128,
            activation: 'relu'
          }),
          tf.layers.dropout({ rate: 0.3 }),
          tf.layers.dense({
            units: 64,
            activation: 'relu'
          }),
          tf.layers.dropout({ rate: 0.2 }),
          tf.layers.dense({
            units: 32,
            activation: 'relu'
          }),
          tf.layers.dense({
            units: Object.keys(this.regimeTypes).length,
            activation: 'softmax'
          })
        ]
      });
      
      // Compile model
      this.regimeModel.compile({
        optimizer: tf.train.adam(0.001),
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy']
      });
      
      // Train model
      const history = await this.regimeModel.fit(features, labels, {
        epochs: 100,
        batchSize: 32,
        validationSplit: 0.2,
        verbose: 0,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            if (epoch % 20 === 0) {
              this.logger?.info(`Training epoch ${epoch}: loss=${logs.loss.toFixed(4)}, accuracy=${logs.acc.toFixed(4)}`);
            }
          }
        }
      });
      
      // Save model
      await this.regimeModel.save('file://./models/regime_detector');
      
      this.isModelTrained = true;
      this.logger?.info('Regime detection model trained successfully');
      
      // Clean up tensors
      features.dispose();
      labels.dispose();
      
    } catch (error) {
      this.logger?.error('Error training regime model:', error);
      throw error;
    }
  }

  /**
   * Prepare training data with features and labels
   */
  async prepareTrainingData() {
    const features = [];
    const labels = [];
    
    // Extract features for each time period
    const spyData = this.marketData.get('SPY');
    const windowSize = 20; // 20-day feature window
    
    for (let i = windowSize; i < spyData.length - 1; i++) {
      const window = spyData.slice(i - windowSize, i);
      const nextPeriod = spyData.slice(i, i + 5); // Look ahead 5 days for labeling
      
      // Extract features
      const featureVector = await this.extractFeatures(window, i);
      
      // Generate label based on future market behavior
      const label = this.generateRegimeLabel(window, nextPeriod);
      
      features.push(featureVector);
      labels.push(label);
    }
    
    // Convert to tensors
    const featureTensor = tf.tensor2d(features);
    const labelTensor = tf.tensor2d(labels);
    
    return { features: featureTensor, labels: labelTensor };
  }

  /**
   * Extract features for a given time window
   */
  async extractFeatures(window, currentIndex) {
    const features = [];
    
    // Price features
    const priceFeatures = this.featureExtractors.price.extract(window);
    features.push(...priceFeatures);
    
    // Volatility features
    const volatilityFeatures = this.featureExtractors.volatility.extract(window);
    features.push(...volatilityFeatures);
    
    // Volume features
    const volumeFeatures = this.featureExtractors.volume.extract(window);
    features.push(...volumeFeatures);
    
    // Momentum features
    const momentumFeatures = this.featureExtractors.momentum.extract(window);
    features.push(...momentumFeatures);
    
    // Cross-asset correlation features
    const correlationFeatures = await this.featureExtractors.correlation.extract(currentIndex);
    features.push(...correlationFeatures);
    
    return features;
  }

  /**
   * Generate regime label based on market behavior
   */
  generateRegimeLabel(window, nextPeriod) {
    const returns = nextPeriod.map((candle, i) => {
      if (i === 0) return 0;
      return (candle.close - nextPeriod[i-1].close) / nextPeriod[i-1].close;
    });
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const volatility = this.calculateVolatility(returns);
    
    // Classify regime based on return and volatility
    let regimeIndex = 0; // Default to BULL
    
    if (avgReturn > 0.01 && volatility < 0.02) {
      regimeIndex = 0; // BULL
    } else if (avgReturn < -0.01 && volatility > 0.03) {
      regimeIndex = 1; // BEAR
    } else if (Math.abs(avgReturn) < 0.005 && volatility < 0.015) {
      regimeIndex = 2; // NEUTRAL
    } else if (volatility > 0.04) {
      regimeIndex = 3; // VOLATILE
    } else {
      regimeIndex = 4; // TREND
    }
    
    // Convert to one-hot encoding
    const label = new Array(Object.keys(this.regimeTypes).length).fill(0);
    label[regimeIndex] = 1;
    
    return label;
  }

  /**
   * Detect current market regime
   */
  async detectCurrentRegime() {
    try {
      if (!this.isModelTrained) {
        return {
          type: 'NEUTRAL',
          confidence: 0.5,
          characteristics: this.regimeTypes.NEUTRAL.characteristics,
          timestamp: Date.now()
        };
      }
      
      // Get recent market data
      const recentData = await this.getRecentMarketData();
      
      // Extract features
      const features = await this.extractCurrentFeatures(recentData);
      
      // Make prediction
      const featureTensor = tf.tensor2d([features]);
      const prediction = this.regimeModel.predict(featureTensor);
      const probabilities = await prediction.data();
      
      // Find regime with highest probability
      const regimeNames = Object.keys(this.regimeTypes);
      let maxProb = 0;
      let predictedRegime = 'NEUTRAL';
      
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          predictedRegime = regimeNames[i];
        }
      }
      
      // Clean up tensors
      featureTensor.dispose();
      prediction.dispose();
      
      const regime = {
        type: predictedRegime,
        confidence: maxProb,
        characteristics: this.regimeTypes[predictedRegime].characteristics,
        probabilities: Object.fromEntries(
          regimeNames.map((name, i) => [name, probabilities[i]])
        ),
        timestamp: Date.now()
      };
      
      // Update regime history
      this.regimeHistory.push(regime);
      if (this.regimeHistory.length > 1000) {
        this.regimeHistory.shift();
      }
      
      // Emit regime update
      this.emit('regimeUpdate', regime);
      
      return regime;
      
    } catch (error) {
      this.logger?.error('Error detecting current regime:', error);
      return {
        type: 'NEUTRAL',
        confidence: 0.5,
        characteristics: this.regimeTypes.NEUTRAL.characteristics,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get recent market data for current regime detection
   */
  async getRecentMarketData() {
    // Get last 20 periods of data for each symbol
    const recentData = new Map();
    
    for (const [symbol, data] of this.marketData) {
      recentData.set(symbol, data.slice(-20));
    }
    
    return recentData;
  }

  /**
   * Extract features from current market data
   */
  async extractCurrentFeatures(recentData) {
    const spyData = recentData.get('SPY');
    return await this.extractFeatures(spyData, spyData.length - 1);
  }

  /**
   * Calculate transition probabilities between regimes
   */
  calculateTransitionProbabilities() {
    if (this.regimeHistory.length < 10) return;
    
    const transitions = new Map();
    
    // Count transitions
    for (let i = 1; i < this.regimeHistory.length; i++) {
      const fromRegime = this.regimeHistory[i-1].type;
      const toRegime = this.regimeHistory[i].type;
      
      const key = `${fromRegime}_${toRegime}`;
      transitions.set(key, (transitions.get(key) || 0) + 1);
    }
    
    // Calculate probabilities
    const regimeNames = Object.keys(this.regimeTypes);
    
    for (const fromRegime of regimeNames) {
      const fromCount = this.regimeHistory.filter(r => r.type === fromRegime).length;
      
      if (fromCount > 0) {
        const probabilities = {};
        
        for (const toRegime of regimeNames) {
          const transitionCount = transitions.get(`${fromRegime}_${toRegime}`) || 0;
          probabilities[toRegime] = transitionCount / fromCount;
        }
        
        this.regimeTransitionProbabilities.set(fromRegime, probabilities);
      }
    }
  }

  /**
   * Calculate volatility
   */
  calculateVolatility(returns) {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    
    return Math.sqrt(variance);
  }

  /**
   * Get regime detection metrics
   */
  getRegimeMetrics() {
    return {
      ...this.metrics,
      currentRegime: this.currentRegime,
      regimeHistory: this.regimeHistory.slice(-50), // Last 50 regimes
      transitionProbabilities: Object.fromEntries(this.regimeTransitionProbabilities),
      modelTrained: this.isModelTrained
    };
  }
}

// Feature extractor classes
class PriceFeatureExtractor {
  extract(window) {
    const closes = window.map(candle => candle.close);
    const returns = closes.slice(1).map((price, i) => (price - closes[i]) / closes[i]);
    
    return [
      returns.reduce((sum, r) => sum + r, 0) / returns.length, // Average return
      Math.max(...returns), // Max return
      Math.min(...returns), // Min return
      (closes[closes.length - 1] - closes[0]) / closes[0] // Total return
    ];
  }
}

class VolatilityFeatureExtractor {
  extract(window) {
    const closes = window.map(candle => candle.close);
    const returns = closes.slice(1).map((price, i) => (price - closes[i]) / closes[i]);
    
    const volatility = this.calculateVolatility(returns);
    const garchVolatility = this.calculateGARCHVolatility(returns);
    
    return [volatility, garchVolatility];
  }
  
  calculateVolatility(returns) {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    return Math.sqrt(variance);
  }
  
  calculateGARCHVolatility(returns) {
    // Simplified GARCH(1,1) volatility
    let variance = 0.01; // Initial variance
    const alpha = 0.1;
    const beta = 0.85;
    const omega = 0.000001;
    
    for (const ret of returns) {
      variance = omega + alpha * ret * ret + beta * variance;
    }
    
    return Math.sqrt(variance);
  }
}

class VolumeFeatureExtractor {
  extract(window) {
    const volumes = window.map(candle => candle.volume);
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const currentVolume = volumes[volumes.length - 1];
    
    return [
      currentVolume / avgVolume, // Volume ratio
      Math.max(...volumes) / avgVolume, // Max volume ratio
      Math.min(...volumes) / avgVolume  // Min volume ratio
    ];
  }
}

class MomentumFeatureExtractor {
  extract(window) {
    const closes = window.map(candle => candle.close);
    
    // RSI
    const rsi = this.calculateRSI(closes, 14);
    
    // MACD
    const macd = this.calculateMACD(closes);
    
    return [rsi, macd.macd, macd.signal, macd.histogram];
  }
  
  calculateRSI(prices, period) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }
  
  calculateMACD(prices) {
    const ema12 = this.calculateEMA(prices, 12);
    const ema26 = this.calculateEMA(prices, 26);
    const macd = ema12 - ema26;
    const signal = this.calculateEMA([macd], 9);
    
    return {
      macd,
      signal,
      histogram: macd - signal
    };
  }
  
  calculateEMA(prices, period) {
    if (prices.length === 0) return 0;
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }
}

class SentimentFeatureExtractor {
  extract(window) {
    // Simplified sentiment features
    // In production, this would integrate with news/social sentiment APIs
    return [
      0.5 + (Math.random() - 0.5) * 0.4, // News sentiment
      0.5 + (Math.random() - 0.5) * 0.3, // Social sentiment
      0.5 + (Math.random() - 0.5) * 0.2  // Options sentiment
    ];
  }
}

class CorrelationFeatureExtractor {
  async extract(currentIndex) {
    // Simplified correlation features
    // In production, this would calculate real correlations between assets
    return [
      0.6 + (Math.random() - 0.5) * 0.3, // Stock-bond correlation
      0.3 + (Math.random() - 0.5) * 0.4, // Stock-commodity correlation
      -0.2 + (Math.random() - 0.5) * 0.3 // Stock-VIX correlation
    ];
  }
}

module.exports = RegimeDetector;
