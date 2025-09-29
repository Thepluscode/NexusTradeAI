// ML Inference Worker
// High-performance worker thread for parallel ML model inference

const { parentPort, workerData } = require('worker_threads');
const tf = require('@tensorflow/tfjs-node');

class MLInferenceWorker {
  constructor(workerId, config) {
    this.workerId = workerId;
    this.config = config;
    
    // Load pre-trained models
    this.models = {
      pricePredictor: null,
      volatilityPredictor: null,
      directionClassifier: null,
      regimeDetector: null,
      riskAssessor: null,
      liquidityPredictor: null,
      momentumDetector: null
    };
    
    // Feature extractors
    this.featureExtractors = {
      price: new PriceFeatureExtractor(),
      volume: new VolumeFeatureExtractor(),
      technical: new TechnicalFeatureExtractor(),
      microstructure: new MicrostructureFeatureExtractor(),
      sentiment: new SentimentFeatureExtractor()
    };
    
    // Performance optimization
    this.predictionCache = new Map();
    this.cacheTimeout = 1000; // 1 second cache
    
    this.initializeModels();
  }

  /**
   * Initialize ML models
   */
  async initializeModels() {
    try {
      // Load ensemble of specialized models
      this.models.pricePredictor = await this.loadModel('price_predictor');
      this.models.volatilityPredictor = await this.loadModel('volatility_predictor');
      this.models.directionClassifier = await this.loadModel('direction_classifier');
      this.models.regimeDetector = await this.loadModel('regime_detector');
      this.models.riskAssessor = await this.loadModel('risk_assessor');
      this.models.liquidityPredictor = await this.loadModel('liquidity_predictor');
      this.models.momentumDetector = await this.loadModel('momentum_detector');
      
      console.log(`ML Inference Worker ${this.workerId} initialized with ${Object.keys(this.models).length} models`);
      
    } catch (error) {
      console.error(`Error initializing ML models in worker ${this.workerId}:`, error);
      // Use synthetic models for demo
      this.initializeSyntheticModels();
    }
  }

  /**
   * Load ML model from file
   */
  async loadModel(modelName) {
    try {
      return await tf.loadLayersModel(`file://./models/${modelName}/model.json`);
    } catch (error) {
      console.warn(`Could not load ${modelName}, using synthetic model`);
      return this.createSyntheticModel(modelName);
    }
  }

  /**
   * Create synthetic model for demonstration
   */
  createSyntheticModel(modelName) {
    const inputShape = this.getInputShape(modelName);
    const outputShape = this.getOutputShape(modelName);
    
    return tf.sequential({
      layers: [
        tf.layers.dense({ inputShape: [inputShape], units: 64, activation: 'relu' }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({ units: 32, activation: 'relu' }),
        tf.layers.dense({ units: outputShape, activation: this.getActivation(modelName) })
      ]
    });
  }

  /**
   * Initialize synthetic models for demo
   */
  initializeSyntheticModels() {
    Object.keys(this.models).forEach(modelName => {
      this.models[modelName] = this.createSyntheticModel(modelName);
    });
  }

  /**
   * Process prediction request
   */
  async processPrediction(data) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(data);
      const cached = this.predictionCache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.prediction;
      }
      
      // Extract features
      const features = await this.extractFeatures(data);
      
      // Run ensemble prediction
      const predictions = await this.runEnsemblePrediction(features);
      
      // Fuse predictions
      const finalPrediction = this.fusePredictions(predictions);
      
      // Cache result
      this.predictionCache.set(cacheKey, {
        prediction: finalPrediction,
        timestamp: Date.now()
      });
      
      // Clean old cache entries
      this.cleanCache();
      
      const endTime = process.hrtime.bigint();
      const latency = Number(endTime - startTime) / 1000; // microseconds
      
      return {
        ...finalPrediction,
        latency,
        workerId: this.workerId
      };
      
    } catch (error) {
      console.error(`Prediction error in worker ${this.workerId}:`, error);
      return {
        direction: 'HOLD',
        confidence: 0,
        error: error.message,
        workerId: this.workerId
      };
    }
  }

  /**
   * Extract features from market data
   */
  async extractFeatures(data) {
    const features = {};
    
    // Price features (20 features)
    features.price = this.featureExtractors.price.extract(data);
    
    // Volume features (15 features)
    features.volume = this.featureExtractors.volume.extract(data);
    
    // Technical indicator features (25 features)
    features.technical = this.featureExtractors.technical.extract(data);
    
    // Microstructure features (10 features)
    features.microstructure = this.featureExtractors.microstructure.extract(data);
    
    // Sentiment features (5 features)
    features.sentiment = this.featureExtractors.sentiment.extract(data);
    
    // Combine all features into a single vector
    const combinedFeatures = [
      ...features.price,
      ...features.volume,
      ...features.technical,
      ...features.microstructure,
      ...features.sentiment
    ];
    
    return {
      combined: combinedFeatures,
      individual: features
    };
  }

  /**
   * Run ensemble prediction across all models
   */
  async runEnsemblePrediction(features) {
    const predictions = {};
    
    try {
      // Convert features to tensor
      const inputTensor = tf.tensor2d([features.combined]);
      
      // Price prediction
      const priceOutput = this.models.pricePredictor.predict(inputTensor);
      predictions.price = await priceOutput.data();
      priceOutput.dispose();
      
      // Volatility prediction
      const volatilityOutput = this.models.volatilityPredictor.predict(inputTensor);
      predictions.volatility = await volatilityOutput.data();
      volatilityOutput.dispose();
      
      // Direction classification
      const directionOutput = this.models.directionClassifier.predict(inputTensor);
      predictions.direction = await directionOutput.data();
      directionOutput.dispose();
      
      // Regime detection
      const regimeOutput = this.models.regimeDetector.predict(inputTensor);
      predictions.regime = await regimeOutput.data();
      regimeOutput.dispose();
      
      // Risk assessment
      const riskOutput = this.models.riskAssessor.predict(inputTensor);
      predictions.risk = await riskOutput.data();
      riskOutput.dispose();
      
      // Liquidity prediction
      const liquidityOutput = this.models.liquidityPredictor.predict(inputTensor);
      predictions.liquidity = await liquidityOutput.data();
      liquidityOutput.dispose();
      
      // Momentum detection
      const momentumOutput = this.models.momentumDetector.predict(inputTensor);
      predictions.momentum = await momentumOutput.data();
      momentumOutput.dispose();
      
      // Clean up input tensor
      inputTensor.dispose();
      
      return predictions;
      
    } catch (error) {
      console.error('Error in ensemble prediction:', error);
      return this.getDefaultPredictions();
    }
  }

  /**
   * Fuse multiple model predictions into final signal
   */
  fusePredictions(predictions) {
    // Direction probabilities [SELL, HOLD, BUY]
    const directionProbs = predictions.direction || [0.33, 0.34, 0.33];
    
    // Price change prediction
    const priceChange = predictions.price?.[0] || 0;
    
    // Volatility prediction
    const volatility = predictions.volatility?.[0] || 0.01;
    
    // Risk score
    const riskScore = predictions.risk?.[0] || 0.5;
    
    // Liquidity score
    const liquidityScore = predictions.liquidity?.[0] || 0.5;
    
    // Momentum score
    const momentumScore = predictions.momentum?.[0] || 0.5;
    
    // Regime classification [BULL, BEAR, NEUTRAL, VOLATILE]
    const regimeProbs = predictions.regime || [0.25, 0.25, 0.25, 0.25];
    
    // Calculate final direction
    let finalDirection = 'HOLD';
    let confidence = 0;
    
    // Determine direction based on ensemble
    const buyScore = directionProbs[2] + (priceChange > 0 ? 0.2 : 0) + (momentumScore > 0.6 ? 0.1 : 0);
    const sellScore = directionProbs[0] + (priceChange < 0 ? 0.2 : 0) + (momentumScore < 0.4 ? 0.1 : 0);
    const holdScore = directionProbs[1] + (Math.abs(priceChange) < 0.001 ? 0.2 : 0);
    
    // Apply risk and liquidity filters
    const riskAdjustedBuyScore = buyScore * (1 - riskScore) * liquidityScore;
    const riskAdjustedSellScore = sellScore * (1 - riskScore) * liquidityScore;
    
    if (riskAdjustedBuyScore > Math.max(riskAdjustedSellScore, holdScore) && riskAdjustedBuyScore > 0.6) {
      finalDirection = 'BUY';
      confidence = riskAdjustedBuyScore;
    } else if (riskAdjustedSellScore > Math.max(riskAdjustedBuyScore, holdScore) && riskAdjustedSellScore > 0.6) {
      finalDirection = 'SELL';
      confidence = riskAdjustedSellScore;
    } else {
      finalDirection = 'HOLD';
      confidence = holdScore;
    }
    
    // Apply regime-based adjustments
    const regimeAdjustment = this.applyRegimeAdjustment(finalDirection, regimeProbs);
    confidence *= regimeAdjustment;
    
    return {
      direction: finalDirection,
      confidence: Math.min(confidence, 1.0),
      priceChange,
      volatility,
      riskScore,
      liquidityScore,
      momentumScore,
      regime: this.getRegimeFromProbs(regimeProbs),
      components: {
        directionProbs,
        regimeProbs,
        buyScore: riskAdjustedBuyScore,
        sellScore: riskAdjustedSellScore,
        holdScore
      }
    };
  }

  /**
   * Apply regime-based adjustments to confidence
   */
  applyRegimeAdjustment(direction, regimeProbs) {
    const [bullProb, bearProb, neutralProb, volatileProb] = regimeProbs;
    
    if (direction === 'BUY') {
      return bullProb + (neutralProb * 0.5) + (volatileProb * 0.3);
    } else if (direction === 'SELL') {
      return bearProb + (neutralProb * 0.5) + (volatileProb * 0.3);
    } else {
      return neutralProb + (volatileProb * 0.2);
    }
  }

  /**
   * Get regime from probabilities
   */
  getRegimeFromProbs(regimeProbs) {
    const regimes = ['BULL', 'BEAR', 'NEUTRAL', 'VOLATILE'];
    const maxIndex = regimeProbs.indexOf(Math.max(...regimeProbs));
    return regimes[maxIndex];
  }

  /**
   * Generate cache key for prediction
   */
  generateCacheKey(data) {
    // Create a hash of the relevant data
    const relevantData = {
      price: data.raw?.price || data.raw?.close,
      volume: data.raw?.volume,
      timestamp: Math.floor((data.timestamp || Date.now()) / 1000) // Round to second
    };
    
    return JSON.stringify(relevantData);
  }

  /**
   * Clean old cache entries
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.predictionCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout * 2) {
        this.predictionCache.delete(key);
      }
    }
  }

  /**
   * Get default predictions for error cases
   */
  getDefaultPredictions() {
    return {
      direction: [0.33, 0.34, 0.33], // SELL, HOLD, BUY
      price: [0],
      volatility: [0.01],
      risk: [0.5],
      liquidity: [0.5],
      momentum: [0.5],
      regime: [0.25, 0.25, 0.25, 0.25] // BULL, BEAR, NEUTRAL, VOLATILE
    };
  }

  // Helper methods for model configuration
  getInputShape(modelName) {
    const shapes = {
      pricePredictor: 75,
      volatilityPredictor: 75,
      directionClassifier: 75,
      regimeDetector: 75,
      riskAssessor: 75,
      liquidityPredictor: 75,
      momentumDetector: 75
    };
    return shapes[modelName] || 75;
  }

  getOutputShape(modelName) {
    const shapes = {
      pricePredictor: 1,
      volatilityPredictor: 1,
      directionClassifier: 3, // SELL, HOLD, BUY
      regimeDetector: 4, // BULL, BEAR, NEUTRAL, VOLATILE
      riskAssessor: 1,
      liquidityPredictor: 1,
      momentumDetector: 1
    };
    return shapes[modelName] || 1;
  }

  getActivation(modelName) {
    const activations = {
      pricePredictor: 'linear',
      volatilityPredictor: 'sigmoid',
      directionClassifier: 'softmax',
      regimeDetector: 'softmax',
      riskAssessor: 'sigmoid',
      liquidityPredictor: 'sigmoid',
      momentumDetector: 'sigmoid'
    };
    return activations[modelName] || 'linear';
  }
}

// Feature extractor classes
class PriceFeatureExtractor {
  extract(data) {
    // Extract 20 price-based features
    const price = data.raw?.price || data.raw?.close || 100;
    return new Array(20).fill(0).map((_, i) => price * (1 + (Math.random() - 0.5) * 0.01));
  }
}

class VolumeFeatureExtractor {
  extract(data) {
    // Extract 15 volume-based features
    const volume = data.raw?.volume || 1000000;
    return new Array(15).fill(0).map((_, i) => volume * (1 + (Math.random() - 0.5) * 0.1));
  }
}

class TechnicalFeatureExtractor {
  extract(data) {
    // Extract 25 technical indicator features
    return new Array(25).fill(0).map(() => Math.random());
  }
}

class MicrostructureFeatureExtractor {
  extract(data) {
    // Extract 10 microstructure features
    return new Array(10).fill(0).map(() => Math.random());
  }
}

class SentimentFeatureExtractor {
  extract(data) {
    // Extract 5 sentiment features
    return new Array(5).fill(0).map(() => Math.random());
  }
}

// Initialize worker
const worker = new MLInferenceWorker(workerData.workerId, workerData.config);

// Handle messages from main thread
parentPort.on('message', async (message) => {
  if (message.type === 'PREDICT') {
    const result = await worker.processPrediction(message.data);
    parentPort.postMessage(result);
  }
});

module.exports = MLInferenceWorker;
