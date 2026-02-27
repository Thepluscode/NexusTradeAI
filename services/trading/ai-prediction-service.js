/**
 * AI Prediction Service
 *
 * Integrates real AI/ML models with the trading engine
 * Replaces mock predictions with actual model inference
 */

const { spawn } = require('child_process');
const axios = require('axios');
const EventEmitter = require('events');
const winston = require('winston');
const path = require('path');

class AIPredictionService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Python AI service settings
            pythonExecutable: config.pythonExecutable || 'python3',
            aiServicePath: config.aiServicePath || path.join(__dirname, '../../ai-ml'),
            aiServiceScript: config.aiServiceScript || 'inference/model_inference.py',

            // AI service API (if running as separate service)
            aiServiceUrl: config.aiServiceUrl || process.env.AI_SERVICE_URL || 'http://localhost:5000',
            useHttpApi: config.useHttpApi || true, // Use HTTP API instead of subprocess

            // Model settings
            models: {
                momentum: 'momentum_model',
                meanReversion: 'mean_reversion_model',
                volatility: 'volatility_model',
                ensemble: 'ensemble_model'
            },

            // Prediction thresholds
            minConfidence: config.minConfidence || 0.65,

            // Caching
            enableCache: config.enableCache !== false,
            cacheTTL: config.cacheTTL || 60000, // 1 minute

            // Timeouts
            predictionTimeout: config.predictionTimeout || 5000, // 5 seconds

            // Fallback settings
            useFallback: config.useFallback !== false,
            fallbackToTechnical: config.fallbackToTechnical !== false,

            ...config
        };

        this.setupLogger();
        this.initializeState();
    }

    setupLogger() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            defaultMeta: { service: 'ai-prediction' },
            transports: [
                new winston.transports.File({
                    filename: 'logs/ai-predictions.log',
                    maxsize: 10485760,
                    maxFiles: 5
                }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    initializeState() {
        this.pythonProcess = null;
        this.predictionCache = new Map();
        this.isInitialized = false;
        this.failureCount = 0;
        this.lastSuccessTime = null;

        // Performance tracking
        this.stats = {
            totalPredictions: 0,
            successfulPredictions: 0,
            failedPredictions: 0,
            cacheHits: 0,
            avgLatency: 0
        };
    }

    /**
     * Initialize AI service
     */
    async initialize() {
        this.logger.info('Initializing AI Prediction Service', {
            method: this.config.useHttpApi ? 'HTTP API' : 'Subprocess',
            url: this.config.aiServiceUrl
        });

        try {
            if (this.config.useHttpApi) {
                await this.initializeHttpApi();
            } else {
                await this.initializePythonProcess();
            }

            this.isInitialized = true;
            this.logger.info('AI Prediction Service initialized successfully');
            this.emit('initialized');

        } catch (error) {
            this.logger.error('Failed to initialize AI Prediction Service', { error });

            if (this.config.useFallback) {
                this.logger.warn('Using fallback technical analysis predictions');
            } else {
                throw error;
            }
        }
    }

    /**
     * Initialize HTTP API connection
     */
    async initializeHttpApi() {
        try {
            // Check if AI service is running
            const response = await axios.get(`${this.config.aiServiceUrl}/health`, {
                timeout: 5000
            });

            if (response.data.status !== 'healthy') {
                throw new Error('AI service is not healthy');
            }

            // Get available models
            const modelsResponse = await axios.get(`${this.config.aiServiceUrl}/models`);
            this.availableModels = modelsResponse.data.models || [];

            this.logger.info('Connected to AI service via HTTP', {
                url: this.config.aiServiceUrl,
                models: this.availableModels
            });

        } catch (error) {
            throw new Error(`Cannot connect to AI service at ${this.config.aiServiceUrl}: ${error.message}`);
        }
    }

    /**
     * Initialize Python subprocess
     */
    async initializePythonProcess() {
        return new Promise((resolve, reject) => {
            const scriptPath = path.join(this.config.aiServicePath, this.config.aiServiceScript);

            this.logger.info('Starting Python AI process', { scriptPath });

            this.pythonProcess = spawn(this.config.pythonExecutable, [scriptPath], {
                cwd: this.config.aiServicePath,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            this.pythonProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                this.logger.debug('AI process output:', output);

                // Look for initialization complete message
                if (output.includes('Models loaded successfully')) {
                    resolve();
                }
            });

            this.pythonProcess.stderr.on('data', (data) => {
                this.logger.error('AI process error:', data.toString());
            });

            this.pythonProcess.on('close', (code) => {
                this.logger.warn('AI process exited', { code });
                this.isInitialized = false;

                if (this.config.useFallback) {
                    this.logger.info('Switching to fallback predictions');
                }
            });

            this.pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to start Python process: ${error.message}`));
            });

            // Timeout for initialization
            setTimeout(() => {
                if (!this.isInitialized) {
                    reject(new Error('Python AI process initialization timeout'));
                }
            }, 30000);
        });
    }

    /**
     * Get AI prediction for a symbol and strategy
     */
    async getPrediction(symbol, strategy, marketData = {}) {
        const startTime = Date.now();

        try {
            // Check cache
            if (this.config.enableCache) {
                const cached = this.getCachedPrediction(symbol, strategy);
                if (cached) {
                    this.stats.cacheHits++;
                    return cached;
                }
            }

            // Get prediction
            let prediction;

            if (!this.isInitialized || this.failureCount > 5) {
                // Use fallback
                prediction = await this.getFallbackPrediction(symbol, strategy, marketData);
            } else if (this.config.useHttpApi) {
                prediction = await this.getPredictionViaHttp(symbol, strategy, marketData);
            } else {
                prediction = await this.getPredictionViaSubprocess(symbol, strategy, marketData);
            }

            // Validate prediction
            if (!this.isValidPrediction(prediction)) {
                throw new Error('Invalid prediction format');
            }

            // Apply confidence threshold
            if (prediction.confidence < this.config.minConfidence) {
                this.logger.debug('Prediction below confidence threshold', {
                    symbol,
                    confidence: prediction.confidence,
                    threshold: this.config.minConfidence
                });

                prediction.tradable = false;
            } else {
                prediction.tradable = true;
            }

            // Cache prediction
            if (this.config.enableCache) {
                this.cachePrediction(symbol, strategy, prediction);
            }

            // Update stats
            const latency = Date.now() - startTime;
            this.updateStats(true, latency);

            return prediction;

        } catch (error) {
            this.logger.error('Prediction failed', { symbol, strategy, error: error.message });
            this.updateStats(false, Date.now() - startTime);
            this.failureCount++;

            // Return fallback
            if (this.config.useFallback) {
                return await this.getFallbackPrediction(symbol, strategy, marketData);
            }

            throw error;
        }
    }

    /**
     * Get prediction via HTTP API
     */
    async getPredictionViaHttp(symbol, strategy, marketData) {
        try {
            const response = await axios.post(
                `${this.config.aiServiceUrl}/predict`,
                {
                    symbol,
                    strategy,
                    marketData,
                    model: this.config.models[strategy] || this.config.models.ensemble
                },
                {
                    timeout: this.config.predictionTimeout,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.success) {
                this.failureCount = 0;
                this.lastSuccessTime = Date.now();
                return this.normalizePrediction(response.data.prediction);
            } else {
                throw new Error(response.data.error || 'Prediction failed');
            }

        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error('AI service is not running. Start it with: python3 ai-ml/services/api_server.py');
            }
            throw error;
        }
    }

    /**
     * Get prediction via Python subprocess
     */
    async getPredictionViaSubprocess(symbol, strategy, marketData) {
        return new Promise((resolve, reject) => {
            if (!this.pythonProcess || !this.isInitialized) {
                reject(new Error('Python process not initialized'));
                return;
            }

            const request = JSON.stringify({
                type: 'prediction',
                symbol,
                strategy,
                marketData
            });

            const timeout = setTimeout(() => {
                reject(new Error('Prediction timeout'));
            }, this.config.predictionTimeout);

            // Send request to Python process
            this.pythonProcess.stdin.write(request + '\n');

            // Listen for response (one-time listener)
            const responseHandler = (data) => {
                clearTimeout(timeout);

                try {
                    const response = JSON.parse(data.toString());

                    if (response.type === 'prediction_result') {
                        this.pythonProcess.stdout.off('data', responseHandler);
                        resolve(this.normalizePrediction(response.prediction));
                    }
                } catch (error) {
                    reject(new Error('Failed to parse prediction response'));
                }
            };

            this.pythonProcess.stdout.on('data', responseHandler);
        });
    }

    /**
     * Fallback prediction using technical analysis
     */
    async getFallbackPrediction(symbol, strategy, marketData) {
        this.logger.debug('Using fallback technical analysis', { symbol, strategy });

        const {
            price,
            sma20,
            sma50,
            rsi,
            volume,
            avgVolume,
            volatility
        } = marketData;

        let direction = 'neutral';
        let confidence = 0.5;
        let strength = 0.5;

        switch (strategy) {
            case 'momentum':
                // Momentum strategy based on price vs SMAs and volume
                if (price > sma20 && sma20 > sma50 && volume > avgVolume * 1.2) {
                    direction = 'up';
                    confidence = 0.70;
                    strength = Math.min(0.9, (volume / avgVolume - 1) / 2 + 0.5);
                } else if (price < sma20 && sma20 < sma50 && volume > avgVolume * 1.2) {
                    direction = 'down';
                    confidence = 0.70;
                    strength = Math.min(0.9, (volume / avgVolume - 1) / 2 + 0.5);
                }
                break;

            case 'meanReversion':
                // Mean reversion based on RSI
                if (rsi < 30 && price < sma20 * 0.95) {
                    direction = 'up';
                    confidence = 0.72;
                    strength = Math.min(0.9, (30 - rsi) / 30 + 0.5);
                } else if (rsi > 70 && price > sma20 * 1.05) {
                    direction = 'down';
                    confidence = 0.72;
                    strength = Math.min(0.9, (rsi - 70) / 30 + 0.5);
                }
                break;

            case 'volatility':
                // Volatility breakout
                if (volatility > 0.30 && volume > avgVolume * 1.5) {
                    direction = price > sma20 ? 'up' : 'down';
                    confidence = 0.68;
                    strength = Math.min(0.9, volatility / 0.5);
                }
                break;

            default:
                // Ensemble approach
                const momentumScore = price > sma20 ? 1 : -1;
                const meanRevScore = rsi < 40 ? 1 : rsi > 60 ? -1 : 0;
                const totalScore = momentumScore + meanRevScore;

                if (totalScore > 0) {
                    direction = 'up';
                    confidence = 0.65;
                } else if (totalScore < 0) {
                    direction = 'down';
                    confidence = 0.65;
                }
        }

        return {
            symbol,
            strategy,
            direction,
            confidence,
            strength,
            method: 'technical_fallback',
            timestamp: Date.now(),
            features: marketData,
            tradable: confidence >= this.config.minConfidence
        };
    }

    /**
     * Normalize prediction format
     */
    normalizePrediction(prediction) {
        return {
            symbol: prediction.symbol,
            strategy: prediction.strategy,
            direction: prediction.direction || prediction.signal, // 'up', 'down', 'neutral'
            confidence: prediction.confidence || 0.5,
            strength: prediction.strength || 0.5,
            expectedReturn: prediction.expectedReturn || 0,
            risk: prediction.risk || 0,
            timeHorizon: prediction.timeHorizon || '1d',
            method: prediction.method || 'ml_model',
            timestamp: prediction.timestamp || Date.now(),
            features: prediction.features || {},
            modelVersion: prediction.modelVersion,
            tradable: true
        };
    }

    /**
     * Validate prediction
     */
    isValidPrediction(prediction) {
        return prediction &&
               typeof prediction.symbol === 'string' &&
               typeof prediction.confidence === 'number' &&
               prediction.confidence >= 0 && prediction.confidence <= 1 &&
               ['up', 'down', 'neutral', 'buy', 'sell', 'hold'].includes(prediction.direction?.toLowerCase());
    }

    /**
     * Cache management
     */
    getCachedPrediction(symbol, strategy) {
        const key = `${symbol}-${strategy}`;
        const cached = this.predictionCache.get(key);

        if (cached && Date.now() - cached.cachedAt < this.config.cacheTTL) {
            this.logger.debug('Cache hit', { symbol, strategy });
            return cached.prediction;
        }

        return null;
    }

    cachePrediction(symbol, strategy, prediction) {
        const key = `${symbol}-${strategy}`;
        this.predictionCache.set(key, {
            prediction,
            cachedAt: Date.now()
        });

        // Limit cache size
        if (this.predictionCache.size > 1000) {
            const firstKey = this.predictionCache.keys().next().value;
            this.predictionCache.delete(firstKey);
        }
    }

    /**
     * Batch predictions for multiple symbols
     */
    async getBatchPredictions(symbols, strategy, marketDataMap = {}) {
        const predictions = await Promise.allSettled(
            symbols.map(symbol =>
                this.getPrediction(symbol, strategy, marketDataMap[symbol] || {})
            )
        );

        return predictions.map((result, index) => ({
            symbol: symbols[index],
            success: result.status === 'fulfilled',
            prediction: result.status === 'fulfilled' ? result.value : null,
            error: result.status === 'rejected' ? result.reason.message : null
        }));
    }

    /**
     * Update statistics
     */
    updateStats(success, latency) {
        this.stats.totalPredictions++;

        if (success) {
            this.stats.successfulPredictions++;
        } else {
            this.stats.failedPredictions++;
        }

        // Update average latency
        this.stats.avgLatency =
            (this.stats.avgLatency * (this.stats.totalPredictions - 1) + latency) /
            this.stats.totalPredictions;
    }

    /**
     * Get service status and statistics
     */
    getStatus() {
        return {
            initialized: this.isInitialized,
            method: this.config.useHttpApi ? 'HTTP API' : 'Subprocess',
            url: this.config.useHttpApi ? this.config.aiServiceUrl : null,
            failureCount: this.failureCount,
            lastSuccessTime: this.lastSuccessTime,
            usingFallback: this.failureCount > 5,
            stats: {
                ...this.stats,
                successRate: this.stats.totalPredictions > 0
                    ? (this.stats.successfulPredictions / this.stats.totalPredictions * 100).toFixed(2) + '%'
                    : 'N/A',
                cacheHitRate: this.stats.totalPredictions > 0
                    ? (this.stats.cacheHits / this.stats.totalPredictions * 100).toFixed(2) + '%'
                    : 'N/A'
            }
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            if (this.config.useHttpApi) {
                const response = await axios.get(`${this.config.aiServiceUrl}/health`, {
                    timeout: 3000
                });
                return response.data.status === 'healthy';
            } else {
                return this.pythonProcess && !this.pythonProcess.killed && this.isInitialized;
            }
        } catch (error) {
            return false;
        }
    }

    /**
     * Cleanup
     */
    async cleanup() {
        this.logger.info('Cleaning up AI Prediction Service');

        if (this.pythonProcess) {
            this.pythonProcess.kill();
            this.pythonProcess = null;
        }

        this.predictionCache.clear();
        this.isInitialized = false;

        this.emit('cleanup');
    }
}

module.exports = AIPredictionService;
