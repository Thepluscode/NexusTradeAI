// Ultra-High Speed Trading Engine
// Integrating your advanced HFT strategies with nanosecond precision

const EventEmitter = require('events');
const { Worker } = require('worker_threads');
const cluster = require('cluster');

class UltraHighSpeedEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Ultra-high speed configuration
    this.config = {
      // Performance targets (enhanced from your code)
      performance: {
        maxLatency: 0.05, // <50μs execution target (2x faster than your 100μs)
        minSignalInterval: 1000000, // 1ms minimum between signals (from your code)
        minArbitrageInterval: 10000000, // 10ms minimum arbitrage (from your code)
        maxPositionSize: 10000, // From your risk management
        maxDailyLoss: -50000 // From your risk management
      },
      
      // Order book configuration
      orderBooks: new Map(),
      strategies: new Map(),
      positions: new Map(),
      pnl: new Map(),
      
      // Performance monitoring (inspired by your PerformanceMonitor)
      monitoring: {
        latencyStats: [],
        orderCount: 0,
        tradeCount: 0,
        dailyPnl: 0.0,
        maxStatsSize: 10000
      }
    };
    
    // Threading for concurrent processing (from your code)
    this.processingLock = false;
    this.orderIdCounter = 0;
    this.tradeHistory = [];
    
    // Performance monitoring
    this.performanceMonitor = new UltraFastPerformanceMonitor();
    
    this.initializeEngine();
  }

  /**
   * Initialize ultra-high speed trading engine
   */
  async initializeEngine() {
    try {
      // Initialize order books for symbols
      await this.initializeOrderBooks();
      
      // Setup high-frequency strategies
      await this.setupHFStrategies();
      
      // Initialize performance monitoring
      await this.startPerformanceMonitoring();
      
      // Setup risk management
      await this.initializeRiskManagement();
      
      console.log('🚀 Ultra-High Speed Trading Engine initialized');
      
    } catch (error) {
      console.error('Error initializing engine:', error);
      throw error;
    }
  }

  /**
   * Submit order with ultra-low latency (inspired by your submit_order)
   */
  async submitOrderUltraFast(symbol, side, orderType, quantity, price = 0.0, clientId = 'default', strategyId = 'manual') {
    const startTime = process.hrtime.bigint();
    
    try {
      // Ultra-fast risk check (from your _risk_check)
      if (!this.riskCheckUltraFast(symbol, side, quantity, price)) {
        return { orderId: null, trades: [] };
      }
      
      // Generate order ID with nanosecond precision
      this.orderIdCounter++;
      const orderId = `ord_${this.orderIdCounter}_${process.hrtime.bigint()}`;
      
      // Create order object
      const order = {
        id: orderId,
        symbol,
        side,
        type: orderType,
        quantity,
        price,
        timestamp: process.hrtime.bigint(),
        clientId,
        strategyId
      };
      
      // Process order with minimal locking (inspired by your processing_lock)
      const trades = await this.processOrderConcurrent(order);
      
      // Update positions and PnL (from your update methods)
      for (const trade of trades) {
        this.updatePositionUltraFast(trade);
        this.updatePnLUltraFast(trade);
      }
      
      // Update performance metrics
      this.config.monitoring.tradeCount += trades.length;
      this.config.monitoring.orderCount++;
      
      // Record latency in nanoseconds
      const endTime = process.hrtime.bigint();
      const latencyNs = Number(endTime - startTime);
      const latencyUs = latencyNs / 1000; // Convert to microseconds
      
      this.config.monitoring.latencyStats.push(latencyUs);
      if (this.config.monitoring.latencyStats.length > this.config.performance.maxStatsSize) {
        this.config.monitoring.latencyStats.shift();
      }
      
      // Emit trade events for real-time processing
      for (const trade of trades) {
        this.emit('trade', trade);
      }
      
      return { orderId, trades, latency: latencyUs };
      
    } catch (error) {
      console.error('Error submitting order:', error);
      return { orderId: null, trades: [], error: error.message };
    }
  }

  /**
   * Ultra-fast risk check (inspired by your _risk_check)
   */
  riskCheckUltraFast(symbol, side, quantity, price) {
    // Position size check
    const currentPosition = this.config.positions.get(symbol) || 0;
    const newPosition = currentPosition + (side === 'BUY' ? quantity : -quantity);
    
    if (Math.abs(newPosition) > this.config.performance.maxPositionSize) {
      return false;
    }
    
    // Daily loss check
    if (this.config.monitoring.dailyPnl < this.config.performance.maxDailyLoss) {
      return false;
    }
    
    return true;
  }

  /**
   * Process order with concurrent execution
   */
  async processOrderConcurrent(order) {
    // Simulate order book processing
    const orderBook = this.config.orderBooks.get(order.symbol);
    if (!orderBook) {
      return [];
    }
    
    // Simulate trade execution
    const trade = {
      id: `trade_${process.hrtime.bigint()}`,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      price: order.price,
      timestamp: process.hrtime.bigint(),
      commission: order.quantity * order.price * 0.001 // 0.1% commission
    };
    
    return [trade];
  }

  /**
   * Update position from trade (inspired by your _update_position)
   */
  updatePositionUltraFast(trade) {
    const currentPosition = this.config.positions.get(trade.symbol) || 0;
    const positionChange = trade.side === 'BUY' ? trade.quantity : -trade.quantity;
    this.config.positions.set(trade.symbol, currentPosition + positionChange);
  }

  /**
   * Update PnL from trade (inspired by your _update_pnl)
   */
  updatePnLUltraFast(trade) {
    const currentPnL = this.config.pnl.get(trade.symbol) || 0;
    let pnlChange = trade.quantity * trade.price;
    
    if (trade.side === 'SELL') {
      pnlChange = -pnlChange;
    }
    
    const newPnL = currentPnL + pnlChange - trade.commission;
    this.config.pnl.set(trade.symbol, newPnL);
    this.config.monitoring.dailyPnl += pnlChange - trade.commission;
  }

  /**
   * Get performance statistics (inspired by your get_performance_stats)
   */
  getPerformanceStats() {
    const latencies = this.config.monitoring.latencyStats;
    
    if (latencies.length === 0) {
      return {};
    }
    
    // Calculate percentiles
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p99Index = Math.floor(sortedLatencies.length * 0.99);
    
    return {
      avgLatencyUs: latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length,
      p95LatencyUs: sortedLatencies[p95Index],
      p99LatencyUs: sortedLatencies[p99Index],
      maxLatencyUs: Math.max(...latencies),
      ordersProcessed: this.config.monitoring.orderCount,
      tradesExecuted: this.config.monitoring.tradeCount,
      dailyPnl: this.config.monitoring.dailyPnl,
      activePositions: Array.from(this.config.positions.values()).filter(p => p !== 0).length
    };
  }

  /**
   * Setup high-frequency strategies
   */
  async setupHFStrategies() {
    // High-frequency mean reversion strategy (from your code)
    const meanReversionStrategy = new HighFrequencyMeanReversionJS('AAPL', 20, 2.0);
    meanReversionStrategy.setEngine(this);
    this.config.strategies.set('mean_reversion', meanReversionStrategy);
    
    // Ultra-fast arbitrage strategy (from your code)
    const arbitrageStrategy = new ArbitrageStrategyJS('AAPL', ['NYSE', 'NASDAQ'], 5);
    arbitrageStrategy.setEngine(this);
    this.config.strategies.set('arbitrage', arbitrageStrategy);
    
    console.log('High-frequency strategies initialized');
  }

  /**
   * Initialize order books for symbols
   */
  async initializeOrderBooks() {
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN'];
    
    for (const symbol of symbols) {
      this.config.orderBooks.set(symbol, new UltraFastOrderBook(symbol));
      this.config.positions.set(symbol, 0);
      this.config.pnl.set(symbol, 0);
    }
    
    console.log('Order books initialized');
  }

  /**
   * Start performance monitoring
   */
  async startPerformanceMonitoring() {
    this.performanceMonitor.startMonitoring();
    
    // Performance reporting every 10 seconds
    setInterval(() => {
      const stats = this.getPerformanceStats();
      console.log(`Performance Stats:
        Avg Latency: ${stats.avgLatencyUs?.toFixed(2)}μs
        P95 Latency: ${stats.p95LatencyUs?.toFixed(2)}μs
        P99 Latency: ${stats.p99LatencyUs?.toFixed(2)}μs
        Orders/sec: ${(stats.ordersProcessed / 10).toFixed(0)}
        Trades/sec: ${(stats.tradesExecuted / 10).toFixed(0)}
        Daily PnL: $${stats.dailyPnl?.toFixed(2)}
      `);
      
      // Reset counters
      this.config.monitoring.orderCount = 0;
      this.config.monitoring.tradeCount = 0;
    }, 10000);
  }

  /**
   * Initialize risk management
   */
  async initializeRiskManagement() {
    // Real-time risk monitoring
    setInterval(() => {
      this.performRiskChecks();
    }, 1000); // Every second
    
    console.log('Risk management initialized');
  }

  /**
   * Perform comprehensive risk checks
   */
  performRiskChecks() {
    // Check daily loss limit
    if (this.config.monitoring.dailyPnl < this.config.performance.maxDailyLoss) {
      console.warn('Daily loss limit reached, halting trading');
      this.emit('riskAlert', { type: 'DAILY_LOSS_LIMIT', value: this.config.monitoring.dailyPnl });
    }
    
    // Check position sizes
    for (const [symbol, position] of this.config.positions.entries()) {
      if (Math.abs(position) > this.config.performance.maxPositionSize) {
        console.warn(`Position size limit exceeded for ${symbol}: ${position}`);
        this.emit('riskAlert', { type: 'POSITION_SIZE_LIMIT', symbol, position });
      }
    }
  }
}

// High-Frequency Mean Reversion Strategy (JavaScript version of your Python code)
class HighFrequencyMeanReversionJS {
  constructor(symbol, lookbackPeriod = 20, zScoreThreshold = 2.0) {
    this.symbol = symbol;
    this.lookbackPeriod = lookbackPeriod;
    this.zScoreThreshold = zScoreThreshold;
    this.engine = null;
    this.lastSignalTime = 0;
    this.minSignalIntervalNs = 1000000; // 1ms (from your code)
    
    // Pre-allocated circular buffer (from your optimization)
    this.priceBuffer = new Float64Array(lookbackPeriod);
    this.bufferIndex = 0;
    this.bufferFull = false;
  }
  
  setEngine(engine) {
    this.engine = engine;
    // Register for market data callbacks
    this.engine.on('marketTick', (data) => {
      if (data.symbol === this.symbol) {
        this.onTick(data.symbol, data.price, data.volume, data.timestamp);
      }
    });
  }
  
  onTick(symbol, price, volume, timestamp) {
    if (timestamp - this.lastSignalTime < this.minSignalIntervalNs) {
      return;
    }
    
    // Update circular buffer (from your optimization)
    this.priceBuffer[this.bufferIndex] = price;
    this.bufferIndex = (this.bufferIndex + 1) % this.lookbackPeriod;
    
    if (!this.bufferFull && this.bufferIndex === 0) {
      this.bufferFull = true;
    }
    
    if (!this.bufferFull) {
      return;
    }
    
    // Calculate z-score using circular buffer
    const meanPrice = this.calculateMean();
    const stdPrice = this.calculateStd(meanPrice);
    
    if (stdPrice === 0) {
      return;
    }
    
    const zScore = (price - meanPrice) / stdPrice;
    
    // Generate signals (from your logic)
    if (zScore > this.zScoreThreshold) {
      this.executeSellSignal(price, timestamp);
    } else if (zScore < -this.zScoreThreshold) {
      this.executeBuySignal(price, timestamp);
    }
  }
  
  calculateMean() {
    let sum = 0;
    for (let i = 0; i < this.lookbackPeriod; i++) {
      sum += this.priceBuffer[i];
    }
    return sum / this.lookbackPeriod;
  }
  
  calculateStd(mean) {
    let sumSquares = 0;
    for (let i = 0; i < this.lookbackPeriod; i++) {
      const diff = this.priceBuffer[i] - mean;
      sumSquares += diff * diff;
    }
    return Math.sqrt(sumSquares / this.lookbackPeriod);
  }
  
  async executeBuySignal(price, timestamp) {
    const quantity = 100; // Fixed quantity
    await this.engine.submitOrderUltraFast(
      this.symbol, 'BUY', 'MARKET', quantity, 0, 'hf_strategy', 'mean_reversion'
    );
    this.lastSignalTime = timestamp;
  }
  
  async executeSellSignal(price, timestamp) {
    const quantity = 100; // Fixed quantity
    await this.engine.submitOrderUltraFast(
      this.symbol, 'SELL', 'MARKET', quantity, 0, 'hf_strategy', 'mean_reversion'
    );
    this.lastSignalTime = timestamp;
  }
}

// Arbitrage Strategy (JavaScript version of your Python code)
class ArbitrageStrategyJS {
  constructor(symbol, exchanges, minProfitBps = 5) {
    this.symbol = symbol;
    this.exchanges = exchanges;
    this.minProfitBps = minProfitBps / 10000.0; // Convert basis points to decimal
    this.engine = null;
    
    // Track prices across exchanges
    this.exchangePrices = new Map();
    this.exchangeTimestamps = new Map();
    this.lastArbitrageTime = 0;
    this.minArbitrageIntervalNs = 10000000; // 10ms (from your code)
  }
  
  setEngine(engine) {
    this.engine = engine;
    
    // Register for market data from all exchanges
    for (const exchange of this.exchanges) {
      this.engine.on('marketTick', (data) => {
        if (data.symbol === this.symbol && data.exchange === exchange) {
          this.onTick(exchange, data.price, data.timestamp);
        }
      });
    }
  }
  
  onTick(exchange, price, timestamp) {
    this.exchangePrices.set(exchange, price);
    this.exchangeTimestamps.set(exchange, timestamp);
    
    // Check for arbitrage opportunities
    if (this.exchangePrices.size >= 2) {
      this.checkArbitrage(timestamp);
    }
  }
  
  checkArbitrage(timestamp) {
    if (timestamp - this.lastArbitrageTime < this.minArbitrageIntervalNs) {
      return;
    }
    
    const prices = Array.from(this.exchangePrices.values());
    const exchanges = Array.from(this.exchangePrices.keys());
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // Calculate profit percentage
    const profitPct = (maxPrice - minPrice) / minPrice;
    
    if (profitPct >= this.minProfitBps) {
      // Found arbitrage opportunity
      const buyExchange = exchanges[prices.indexOf(minPrice)];
      const sellExchange = exchanges[prices.indexOf(maxPrice)];
      
      this.executeArbitrage(buyExchange, sellExchange, minPrice, maxPrice, timestamp);
    }
  }
  
  async executeArbitrage(buyExchange, sellExchange, buyPrice, sellPrice, timestamp) {
    const quantity = 100; // Fixed quantity
    
    // Simultaneously buy on cheap exchange and sell on expensive exchange (from your code)
    const buyTask = this.engine.submitOrderUltraFast(
      `${this.symbol}_${buyExchange}`, 'BUY', 'MARKET', quantity, 0, 'arbitrage', 'cross_exchange_arb'
    );
    
    const sellTask = this.engine.submitOrderUltraFast(
      `${this.symbol}_${sellExchange}`, 'SELL', 'MARKET', quantity, 0, 'arbitrage', 'cross_exchange_arb'
    );
    
    // Execute both orders simultaneously
    await Promise.all([buyTask, sellTask]);
    this.lastArbitrageTime = timestamp;
  }
}

// Ultra-Fast Performance Monitor (inspired by your PerformanceMonitor)
class UltraFastPerformanceMonitor {
  constructor() {
    this.metrics = {
      ordersPerSecond: [],
      tradesPerSecond: [],
      latencyUs: [],
      memoryUsageMb: [],
      cpuUsagePct: []
    };
    this.startTime = Date.now();
    this.monitoringActive = false;
  }
  
  startMonitoring() {
    this.monitoringActive = true;
    
    // Monitor system resources every second
    setInterval(() => {
      if (!this.monitoringActive) return;
      
      // Get memory usage
      const memUsage = process.memoryUsage();
      const memoryMb = memUsage.rss / 1024 / 1024;
      this.metrics.memoryUsageMb.push(memoryMb);
      
      // Keep only last 60 measurements (1 minute)
      if (this.metrics.memoryUsageMb.length > 60) {
        this.metrics.memoryUsageMb.shift();
      }
    }, 1000);
  }
  
  stopMonitoring() {
    this.monitoringActive = false;
  }
  
  recordLatency(latencyUs) {
    this.metrics.latencyUs.push(latencyUs);
    if (this.metrics.latencyUs.length > 1000) {
      this.metrics.latencyUs.shift();
    }
  }
  
  getStats() {
    const stats = {};
    
    for (const [metricName, values] of Object.entries(this.metrics)) {
      if (values.length > 0) {
        const sortedValues = [...values].sort((a, b) => a - b);
        stats[metricName] = {
          current: values[values.length - 1],
          avg: values.reduce((sum, val) => sum + val, 0) / values.length,
          max: Math.max(...values),
          min: Math.min(...values),
          p95: sortedValues[Math.floor(sortedValues.length * 0.95)],
          p99: sortedValues[Math.floor(sortedValues.length * 0.99)]
        };
      }
    }
    
    stats.uptimeSeconds = (Date.now() - this.startTime) / 1000;
    return stats;
  }
}

module.exports = UltraHighSpeedEngine;
