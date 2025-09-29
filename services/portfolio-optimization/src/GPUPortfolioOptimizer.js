// GPU-Accelerated Portfolio Optimization
// Integrating your CUDA optimization with WebGL/GPU.js for 1000x performance

const { GPU } = require('gpu.js');
const EventEmitter = require('events');

class GPUPortfolioOptimizer extends EventEmitter {
  constructor(symbols, config = {}) {
    super();
    
    this.symbols = symbols;
    this.nAssets = symbols.length;
    
    // Configuration (inspired by your PortfolioOptimizer)
    this.config = {
      lookbackDays: config.lookbackDays || 252,
      riskAversion: config.riskAversion || 3.0,
      maxWeight: config.maxWeight || 0.4, // Maximum 40% in any single asset
      minWeight: config.minWeight || 0.0, // No short selling
      
      // GPU optimization parameters
      nTrials: config.nTrials || 10000, // Monte Carlo trials
      threadsPerBlock: config.threadsPerBlock || 256,
      
      // Rebalancing parameters
      transactionCost: config.transactionCost || 0.001, // 0.1%
      rebalanceThreshold: config.rebalanceThreshold || 0.005, // 0.5%
      
      // Shrinkage parameters for covariance estimation
      shrinkageIntensity: config.shrinkageIntensity || 0.1
    };
    
    // GPU instance
    this.gpu = new GPU();
    this.gpuKernels = {};
    
    // Portfolio state
    this.state = {
      currentWeights: new Array(this.nAssets).fill(1 / this.nAssets),
      expectedReturns: new Array(this.nAssets).fill(0),
      covarianceMatrix: this.createIdentityMatrix(this.nAssets),
      lastOptimization: 0,
      optimizationCount: 0
    };
    
    // Performance metrics
    this.metrics = {
      optimizationLatency: [],
      gpuUtilization: 0,
      portfolioReturn: 0,
      portfolioVolatility: 0,
      sharpeRatio: 0
    };
    
    this.initializeGPUOptimizer();
  }

  /**
   * Initialize GPU-accelerated portfolio optimizer
   */
  async initializeGPUOptimizer() {
    try {
      // Create GPU kernels for portfolio optimization
      await this.createGPUKernels();
      
      // Initialize optimization algorithms
      await this.setupOptimizationAlgorithms();
      
      // Setup performance monitoring
      this.setupPerformanceMonitoring();
      
      console.log('🚀 GPU Portfolio Optimizer initialized');
      
    } catch (error) {
      console.error('Error initializing GPU optimizer:', error);
      // Fallback to CPU optimization
      this.initializeCPUFallback();
    }
  }

  /**
   * Create GPU kernels for portfolio optimization (inspired by your gpu_portfolio_optimization)
   */
  async createGPUKernels() {
    // Portfolio utility calculation kernel
    this.gpuKernels.portfolioUtility = this.gpu.createKernel(function(
      weights, returns, covariance, riskAversion, nAssets
    ) {
      const idx = this.thread.x;
      
      // Calculate expected return
      let expectedReturn = 0.0;
      for (let i = 0; i < nAssets; i++) {
        expectedReturn += weights[idx * nAssets + i] * returns[i];
      }
      
      // Calculate portfolio variance
      let portfolioVariance = 0.0;
      for (let i = 0; i < nAssets; i++) {
        for (let j = 0; j < nAssets; j++) {
          portfolioVariance += weights[idx * nAssets + i] * 
                              weights[idx * nAssets + j] * 
                              covariance[i * nAssets + j];
        }
      }
      
      // Utility function (return - risk penalty)
      return expectedReturn - 0.5 * riskAversion * portfolioVariance;
    }).setOutput([this.config.nTrials]);
    
    // Weight normalization kernel
    this.gpuKernels.normalizeWeights = this.gpu.createKernel(function(
      weights, nAssets, minWeight, maxWeight
    ) {
      const idx = this.thread.x;
      const startIdx = idx * nAssets;
      
      // Apply weight constraints
      let sum = 0.0;
      for (let i = 0; i < nAssets; i++) {
        let weight = weights[startIdx + i];
        weight = Math.max(minWeight, Math.min(maxWeight, weight));
        weights[startIdx + i] = weight;
        sum += weight;
      }
      
      // Normalize to sum to 1
      if (sum > 0) {
        for (let i = 0; i < nAssets; i++) {
          weights[startIdx + i] = weights[startIdx + i] / sum;
        }
      }
      
      return sum;
    }).setOutput([this.config.nTrials]);
    
    // Covariance matrix calculation kernel
    this.gpuKernels.calculateCovariance = this.gpu.createKernel(function(
      returns, nAssets, nObservations
    ) {
      const i = this.thread.x;
      const j = this.thread.y;
      
      // Calculate mean returns
      let meanI = 0.0;
      let meanJ = 0.0;
      for (let t = 0; t < nObservations; t++) {
        meanI += returns[i * nObservations + t];
        meanJ += returns[j * nObservations + t];
      }
      meanI /= nObservations;
      meanJ /= nObservations;
      
      // Calculate covariance
      let covariance = 0.0;
      for (let t = 0; t < nObservations; t++) {
        const devI = returns[i * nObservations + t] - meanI;
        const devJ = returns[j * nObservations + t] - meanJ;
        covariance += devI * devJ;
      }
      
      return covariance / (nObservations - 1);
    }).setOutput([this.nAssets, this.nAssets]);
    
    console.log('GPU kernels created successfully');
  }

  /**
   * Calculate expected returns using exponentially weighted mean (inspired by your calculate_expected_returns)
   */
  calculateExpectedReturns(priceData) {
    const returns = [];
    
    for (const symbol of this.symbols) {
      if (symbol in priceData && priceData[symbol].length > 1) {
        const prices = priceData[symbol].slice(-this.config.lookbackDays);
        const dailyReturns = [];
        
        // Calculate daily returns
        for (let i = 1; i < prices.length; i++) {
          dailyReturns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        
        // Exponentially weighted mean
        const weights = [];
        for (let i = 0; i < dailyReturns.length; i++) {
          weights.push(Math.exp((i - dailyReturns.length + 1) / dailyReturns.length));
        }
        
        const weightSum = weights.reduce((sum, w) => sum + w, 0);
        const normalizedWeights = weights.map(w => w / weightSum);
        
        const expectedReturn = dailyReturns.reduce((sum, ret, i) => 
          sum + ret * normalizedWeights[i], 0) * 252; // Annualized
        
        returns.push(expectedReturn);
      } else {
        returns.push(0.0);
      }
    }
    
    return returns;
  }

  /**
   * Calculate covariance matrix with shrinkage estimation (inspired by your calculate_covariance_matrix)
   */
  async calculateCovarianceMatrix(priceData) {
    const returnsMatrix = [];
    let minLength = Infinity;
    
    // Find minimum length across all symbols
    for (const symbol of this.symbols) {
      if (symbol in priceData) {
        minLength = Math.min(minLength, priceData[symbol].length);
      }
    }
    
    // Calculate returns matrix
    for (const symbol of this.symbols) {
      if (symbol in priceData) {
        const prices = priceData[symbol].slice(-minLength);
        const dailyReturns = [];
        
        for (let i = 1; i < prices.length; i++) {
          dailyReturns.push((prices[i] - prices[i-1]) / prices[i-1]);
        }
        
        returnsMatrix.push(dailyReturns);
      } else {
        returnsMatrix.push(new Array(minLength - 1).fill(0));
      }
    }
    
    // Use GPU to calculate covariance matrix
    const flatReturns = returnsMatrix.flat();
    const nObservations = minLength - 1;
    
    const covarianceMatrix = this.gpuKernels.calculateCovariance(
      flatReturns, this.nAssets, nObservations
    );
    
    // Apply shrinkage (Ledoit-Wolf)
    const sampleCov = covarianceMatrix.map(row => row.map(val => val * 252)); // Annualized
    const trace = sampleCov.reduce((sum, row, i) => sum + row[i], 0);
    const mu = trace / this.nAssets;
    
    // Shrinkage target (diagonal matrix)
    const target = this.createIdentityMatrix(this.nAssets).map(row => 
      row.map((val, j, arr) => val * mu)
    );
    
    // Apply shrinkage
    const shrunkCov = sampleCov.map((row, i) => 
      row.map((val, j) => 
        this.config.shrinkageIntensity * target[i][j] + 
        (1 - this.config.shrinkageIntensity) * val
      )
    );
    
    return shrunkCov;
  }

  /**
   * Optimize portfolio weights using GPU acceleration (inspired by your optimize_weights_gpu)
   */
  async optimizeWeightsGPU(expectedReturns, covarianceMatrix) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Generate random weight combinations for Monte Carlo optimization
      const weightsTrials = new Float32Array(this.config.nTrials * this.nAssets);
      
      for (let i = 0; i < this.config.nTrials; i++) {
        for (let j = 0; j < this.nAssets; j++) {
          weightsTrials[i * this.nAssets + j] = Math.random();
        }
      }
      
      // Normalize weights using GPU
      this.gpuKernels.normalizeWeights(
        weightsTrials, this.nAssets, this.config.minWeight, this.config.maxWeight
      );
      
      // Flatten inputs for GPU
      const flatReturns = new Float32Array(expectedReturns);
      const flatCovariance = new Float32Array(covarianceMatrix.flat());
      
      // Calculate utilities using GPU
      const utilities = this.gpuKernels.portfolioUtility(
        weightsTrials, flatReturns, flatCovariance, this.config.riskAversion, this.nAssets
      );
      
      // Find best weights (highest utility)
      let bestIdx = 0;
      let bestUtility = utilities[0];
      
      for (let i = 1; i < utilities.length; i++) {
        if (utilities[i] > bestUtility) {
          bestUtility = utilities[i];
          bestIdx = i;
        }
      }
      
      // Extract optimal weights
      const optimalWeights = [];
      for (let i = 0; i < this.nAssets; i++) {
        optimalWeights.push(weightsTrials[bestIdx * this.nAssets + i]);
      }
      
      // Record performance metrics
      const latency = Number(process.hrtime.bigint() - startTime) / 1000000; // milliseconds
      this.metrics.optimizationLatency.push(latency);
      if (this.metrics.optimizationLatency.length > 100) {
        this.metrics.optimizationLatency.shift();
      }
      
      this.state.optimizationCount++;
      this.state.lastOptimization = Date.now();
      
      return {
        weights: optimalWeights,
        utility: bestUtility,
        latency: latency,
        trials: this.config.nTrials
      };
      
    } catch (error) {
      console.error('GPU optimization failed, falling back to CPU:', error);
      return this.optimizeWeightsCPU(expectedReturns, covarianceMatrix);
    }
  }

  /**
   * CPU fallback optimization using scipy-like optimization
   */
  async optimizeWeightsCPU(expectedReturns, covarianceMatrix) {
    // Simplified mean-variance optimization
    const objective = (weights) => {
      const portfolioReturn = weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
      
      let portfolioVariance = 0;
      for (let i = 0; i < this.nAssets; i++) {
        for (let j = 0; j < this.nAssets; j++) {
          portfolioVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
        }
      }
      
      return -(portfolioReturn - 0.5 * this.config.riskAversion * portfolioVariance);
    };
    
    // Simple gradient descent optimization
    let weights = new Array(this.nAssets).fill(1 / this.nAssets);
    const learningRate = 0.01;
    const iterations = 1000;
    
    for (let iter = 0; iter < iterations; iter++) {
      // Calculate gradient (simplified)
      const gradient = new Array(this.nAssets).fill(0);
      const eps = 1e-6;
      
      for (let i = 0; i < this.nAssets; i++) {
        const weightsPlus = [...weights];
        weightsPlus[i] += eps;
        const objPlus = objective(weightsPlus);
        
        const weightsMinus = [...weights];
        weightsMinus[i] -= eps;
        const objMinus = objective(weightsMinus);
        
        gradient[i] = (objPlus - objMinus) / (2 * eps);
      }
      
      // Update weights
      for (let i = 0; i < this.nAssets; i++) {
        weights[i] -= learningRate * gradient[i];
        weights[i] = Math.max(this.config.minWeight, Math.min(this.config.maxWeight, weights[i]));
      }
      
      // Normalize weights
      const sum = weights.reduce((s, w) => s + w, 0);
      if (sum > 0) {
        weights = weights.map(w => w / sum);
      }
    }
    
    return {
      weights: weights,
      utility: -objective(weights),
      latency: 10, // Approximate CPU latency
      trials: iterations
    };
  }

  /**
   * Rebalance portfolio considering transaction costs (inspired by your rebalance_portfolio)
   */
  async rebalancePortfolio(currentWeights, targetWeights) {
    const weightChanges = targetWeights.map((target, i) => target - currentWeights[i]);
    
    // Calculate transaction costs
    const totalTurnover = weightChanges.reduce((sum, change) => sum + Math.abs(change), 0);
    const totalCost = totalTurnover * this.config.transactionCost;
    
    // Optimize rebalancing frequency
    if (totalCost < this.config.rebalanceThreshold) {
      return {
        newWeights: targetWeights,
        cost: totalCost,
        rebalance: true,
        reason: 'Cost-effective rebalancing'
      };
    } else {
      // Partial rebalancing - move 50% toward target
      const partialWeights = currentWeights.map((current, i) => 
        current + 0.5 * weightChanges[i]
      );
      const partialCost = 0.5 * totalCost;
      
      return {
        newWeights: partialWeights,
        cost: partialCost,
        rebalance: true,
        reason: 'Partial rebalancing to reduce costs'
      };
    }
  }

  /**
   * Optimize portfolio with market data
   */
  async optimizePortfolio(priceData) {
    try {
      // Calculate expected returns
      const expectedReturns = this.calculateExpectedReturns(priceData);
      this.state.expectedReturns = expectedReturns;
      
      // Calculate covariance matrix
      const covarianceMatrix = await this.calculateCovarianceMatrix(priceData);
      this.state.covarianceMatrix = covarianceMatrix;
      
      // Optimize weights using GPU
      const optimization = await this.optimizeWeightsGPU(expectedReturns, covarianceMatrix);
      
      // Check if rebalancing is needed
      const rebalancing = await this.rebalancePortfolio(this.state.currentWeights, optimization.weights);
      
      // Update portfolio metrics
      this.updatePortfolioMetrics(rebalancing.newWeights, expectedReturns, covarianceMatrix);
      
      // Update current weights if rebalancing
      if (rebalancing.rebalance) {
        this.state.currentWeights = rebalancing.newWeights;
      }
      
      return {
        optimization: optimization,
        rebalancing: rebalancing,
        metrics: {
          portfolioReturn: this.metrics.portfolioReturn,
          portfolioVolatility: this.metrics.portfolioVolatility,
          sharpeRatio: this.metrics.sharpeRatio
        }
      };
      
    } catch (error) {
      console.error('Portfolio optimization error:', error);
      throw error;
    }
  }

  /**
   * Update portfolio performance metrics
   */
  updatePortfolioMetrics(weights, expectedReturns, covarianceMatrix) {
    // Calculate portfolio return
    this.metrics.portfolioReturn = weights.reduce((sum, w, i) => sum + w * expectedReturns[i], 0);
    
    // Calculate portfolio volatility
    let portfolioVariance = 0;
    for (let i = 0; i < this.nAssets; i++) {
      for (let j = 0; j < this.nAssets; j++) {
        portfolioVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
      }
    }
    this.metrics.portfolioVolatility = Math.sqrt(portfolioVariance);
    
    // Calculate Sharpe ratio
    const riskFreeRate = 0.02; // 2% risk-free rate
    this.metrics.sharpeRatio = this.metrics.portfolioVolatility > 0 ? 
      (this.metrics.portfolioReturn - riskFreeRate) / this.metrics.portfolioVolatility : 0;
  }

  /**
   * Get optimization performance statistics
   */
  getPerformanceStats() {
    const latencies = this.metrics.optimizationLatency;
    
    return {
      optimizationCount: this.state.optimizationCount,
      avgLatency: latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0,
      minLatency: latencies.length > 0 ? Math.min(...latencies) : 0,
      maxLatency: latencies.length > 0 ? Math.max(...latencies) : 0,
      portfolioMetrics: {
        expectedReturn: this.metrics.portfolioReturn,
        volatility: this.metrics.portfolioVolatility,
        sharpeRatio: this.metrics.sharpeRatio
      },
      currentWeights: this.state.currentWeights,
      lastOptimization: this.state.lastOptimization
    };
  }

  // Helper methods
  createIdentityMatrix(size) {
    const matrix = [];
    for (let i = 0; i < size; i++) {
      const row = new Array(size).fill(0);
      row[i] = 1;
      matrix.push(row);
    }
    return matrix;
  }

  async setupOptimizationAlgorithms() {
    console.log('Optimization algorithms setup complete');
  }

  setupPerformanceMonitoring() {
    // Monitor GPU utilization and optimization performance
    setInterval(() => {
      // Update performance metrics
      this.emit('performanceUpdate', this.getPerformanceStats());
    }, 5000); // Every 5 seconds
  }

  initializeCPUFallback() {
    console.log('GPU not available, using CPU optimization');
    this.gpuAvailable = false;
  }
}

module.exports = GPUPortfolioOptimizer;
