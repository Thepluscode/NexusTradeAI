// Real-Time Market Data Engine
// High-performance market data processing with sub-millisecond latency and multi-asset support

const EventEmitter = require('events');
const WebSocket = require('ws');
const Redis = require('ioredis');
const { Worker } = require('worker_threads');

class RealTimeMarketDataEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    this.redis = new Redis(process.env.REDIS_URL);
    
    // Market data configuration
    this.config = {
      // Data sources
      dataSources: {
        alpaca: {
          enabled: true,
          websocketUrl: 'wss://stream.data.alpaca.markets/v2/iex',
          apiKey: process.env.ALPACA_KEY,
          secretKey: process.env.ALPACA_SECRET,
          assetClasses: ['stocks']
        },
        binance: {
          enabled: true,
          websocketUrl: 'wss://stream.binance.com:9443/ws',
          assetClasses: ['crypto']
        },
        oanda: {
          enabled: true,
          websocketUrl: 'wss://stream-fxpractice.oanda.com/v3/accounts',
          apiKey: process.env.OANDA_API_KEY,
          assetClasses: ['forex']
        },
        polygon: {
          enabled: true,
          websocketUrl: 'wss://socket.polygon.io',
          apiKey: process.env.POLYGON_API_KEY,
          assetClasses: ['stocks', 'crypto', 'forex', 'commodities']
        }
      },
      
      // Performance settings
      performance: {
        maxLatency: 1, // 1 millisecond target
        bufferSize: 10000,
        batchSize: 100,
        compressionEnabled: true,
        cacheEnabled: true,
        cacheTTL: 60 // 60 seconds
      },
      
      // Supported asset classes
      assetClasses: {
        stocks: {
          exchanges: ['NYSE', 'NASDAQ', 'AMEX'],
          dataTypes: ['trades', 'quotes', 'bars', 'orderbook'],
          updateFrequency: 'real-time'
        },
        crypto: {
          exchanges: ['BINANCE', 'COINBASE', 'KRAKEN', 'BITFINEX'],
          dataTypes: ['trades', 'quotes', 'bars', 'orderbook', 'funding'],
          updateFrequency: 'real-time'
        },
        forex: {
          exchanges: ['OANDA', 'FXCM', 'IG'],
          dataTypes: ['trades', 'quotes', 'bars'],
          updateFrequency: 'real-time'
        },
        commodities: {
          exchanges: ['CME', 'ICE', 'LME'],
          dataTypes: ['trades', 'quotes', 'bars'],
          updateFrequency: 'real-time'
        }
      },
      
      // Data processing
      processing: {
        enableNormalization: true,
        enableAggregation: true,
        enableFiltering: true,
        enableValidation: true,
        enableEnrichment: true
      }
    };
    
    // Connection management
    this.connections = new Map();
    this.subscriptions = new Map();
    this.dataBuffer = new Map();
    
    // Performance metrics
    this.metrics = {
      totalMessages: 0,
      messagesPerSecond: 0,
      averageLatency: 0,
      connectionCount: 0,
      errorCount: 0,
      lastUpdate: Date.now()
    };
    
    // Worker pool for data processing
    this.workerPool = [];
    this.initializeWorkerPool();
    
    this.initializeEngine();
  }

  /**
   * Initialize the market data engine
   */
  async initializeEngine() {
    try {
      // Initialize data source connections
      await this.initializeDataSources();
      
      // Start performance monitoring
      this.startPerformanceMonitoring();
      
      // Start data processing
      this.startDataProcessing();
      
      this.logger.info('📊 Real-Time Market Data Engine initialized');
      
    } catch (error) {
      this.logger.error('Failed to initialize market data engine:', error);
      throw error;
    }
  }

  /**
   * Initialize worker pool for parallel data processing
   */
  initializeWorkerPool() {
    const numWorkers = require('os').cpus().length;
    
    for (let i = 0; i < numWorkers; i++) {
      const worker = new Worker('./MarketDataWorker.js', {
        workerData: { workerId: i, config: this.config }
      });
      
      worker.on('message', (result) => {
        this.handleWorkerResult(result);
      });
      
      worker.on('error', (error) => {
        this.logger.error(`Worker ${i} error:`, error);
      });
      
      this.workerPool.push({
        worker,
        busy: false,
        lastUsed: Date.now()
      });
    }
  }

  /**
   * Initialize connections to data sources
   */
  async initializeDataSources() {
    for (const [sourceName, sourceConfig] of Object.entries(this.config.dataSources)) {
      if (sourceConfig.enabled) {
        try {
          await this.connectToDataSource(sourceName, sourceConfig);
        } catch (error) {
          this.logger.error(`Failed to connect to ${sourceName}:`, error);
        }
      }
    }
  }

  /**
   * Connect to a specific data source
   */
  async connectToDataSource(sourceName, sourceConfig) {
    const ws = new WebSocket(sourceConfig.websocketUrl);
    
    ws.on('open', () => {
      this.logger.info(`Connected to ${sourceName} market data`);
      this.connections.set(sourceName, ws);
      this.metrics.connectionCount++;
      
      // Authenticate if required
      this.authenticateDataSource(sourceName, ws, sourceConfig);
    });
    
    ws.on('message', (data) => {
      this.handleMarketDataMessage(sourceName, data);
    });
    
    ws.on('error', (error) => {
      this.logger.error(`${sourceName} WebSocket error:`, error);
      this.metrics.errorCount++;
    });
    
    ws.on('close', () => {
      this.logger.warn(`${sourceName} connection closed, attempting reconnect...`);
      this.connections.delete(sourceName);
      this.metrics.connectionCount--;
      
      // Attempt reconnection after delay
      setTimeout(() => {
        this.connectToDataSource(sourceName, sourceConfig);
      }, 5000);
    });
  }

  /**
   * Authenticate with data source
   */
  authenticateDataSource(sourceName, ws, sourceConfig) {
    switch (sourceName) {
      case 'alpaca':
        ws.send(JSON.stringify({
          action: 'auth',
          key: sourceConfig.apiKey,
          secret: sourceConfig.secretKey
        }));
        break;
        
      case 'polygon':
        ws.send(JSON.stringify({
          action: 'auth',
          params: sourceConfig.apiKey
        }));
        break;
        
      case 'oanda':
        // OANDA uses HTTP headers for auth
        break;
        
      default:
        // Binance doesn't require auth for public streams
        break;
    }
  }

  /**
   * Handle incoming market data message
   */
  async handleMarketDataMessage(sourceName, data) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Parse message
      const message = JSON.parse(data);
      
      // Normalize message format
      const normalizedData = this.normalizeMarketData(sourceName, message);
      
      if (normalizedData) {
        // Add to buffer for batch processing
        this.addToBuffer(normalizedData);
        
        // Emit real-time event
        this.emit('marketData', normalizedData);
        
        // Update metrics
        this.metrics.totalMessages++;
        const latency = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to milliseconds
        this.updateLatencyMetrics(latency);
      }
      
    } catch (error) {
      this.logger.error(`Error processing message from ${sourceName}:`, error);
      this.metrics.errorCount++;
    }
  }

  /**
   * Normalize market data from different sources
   */
  normalizeMarketData(sourceName, message) {
    switch (sourceName) {
      case 'alpaca':
        return this.normalizeAlpacaData(message);
      case 'binance':
        return this.normalizeBinanceData(message);
      case 'oanda':
        return this.normalizeOandaData(message);
      case 'polygon':
        return this.normalizePolygonData(message);
      default:
        return null;
    }
  }

  /**
   * Normalize Alpaca market data
   */
  normalizeAlpacaData(message) {
    if (message.T === 't') { // Trade
      return {
        source: 'alpaca',
        type: 'trade',
        symbol: message.S,
        price: message.p,
        size: message.s,
        timestamp: new Date(message.t).getTime(),
        exchange: message.x,
        assetClass: 'stocks'
      };
    } else if (message.T === 'q') { // Quote
      return {
        source: 'alpaca',
        type: 'quote',
        symbol: message.S,
        bidPrice: message.bp,
        bidSize: message.bs,
        askPrice: message.ap,
        askSize: message.as,
        timestamp: new Date(message.t).getTime(),
        exchange: message.bx,
        assetClass: 'stocks'
      };
    }
    return null;
  }

  /**
   * Normalize Binance market data
   */
  normalizeBinanceData(message) {
    if (message.e === 'trade') {
      return {
        source: 'binance',
        type: 'trade',
        symbol: message.s,
        price: parseFloat(message.p),
        size: parseFloat(message.q),
        timestamp: message.T,
        exchange: 'BINANCE',
        assetClass: 'crypto'
      };
    } else if (message.e === '24hrTicker') {
      return {
        source: 'binance',
        type: 'ticker',
        symbol: message.s,
        price: parseFloat(message.c),
        change: parseFloat(message.P),
        volume: parseFloat(message.v),
        timestamp: message.E,
        exchange: 'BINANCE',
        assetClass: 'crypto'
      };
    }
    return null;
  }

  /**
   * Normalize Polygon market data
   */
  normalizePolygonData(message) {
    if (message.ev === 'T') { // Trade
      return {
        source: 'polygon',
        type: 'trade',
        symbol: message.sym,
        price: message.p,
        size: message.s,
        timestamp: message.t,
        exchange: message.x,
        assetClass: this.determineAssetClass(message.sym)
      };
    } else if (message.ev === 'Q') { // Quote
      return {
        source: 'polygon',
        type: 'quote',
        symbol: message.sym,
        bidPrice: message.bp,
        bidSize: message.bs,
        askPrice: message.ap,
        askSize: message.as,
        timestamp: message.t,
        exchange: message.x,
        assetClass: this.determineAssetClass(message.sym)
      };
    }
    return null;
  }

  /**
   * Add data to processing buffer
   */
  addToBuffer(data) {
    const symbol = data.symbol;
    
    if (!this.dataBuffer.has(symbol)) {
      this.dataBuffer.set(symbol, []);
    }
    
    const buffer = this.dataBuffer.get(symbol);
    buffer.push(data);
    
    // Limit buffer size
    if (buffer.length > this.config.performance.bufferSize) {
      buffer.shift();
    }
    
    // Process batch if buffer is full
    if (buffer.length >= this.config.performance.batchSize) {
      this.processBatch(symbol, [...buffer]);
      buffer.length = 0; // Clear buffer
    }
  }

  /**
   * Process batch of market data
   */
  async processBatch(symbol, batch) {
    // Find available worker
    const availableWorker = this.workerPool.find(w => !w.busy);
    
    if (availableWorker) {
      availableWorker.busy = true;
      availableWorker.lastUsed = Date.now();
      
      availableWorker.worker.postMessage({
        type: 'PROCESS_BATCH',
        symbol,
        batch,
        config: this.config.processing
      });
    } else {
      // No available workers, process synchronously
      await this.processBatchSync(symbol, batch);
    }
  }

  /**
   * Process batch synchronously
   */
  async processBatchSync(symbol, batch) {
    try {
      // Aggregate data
      const aggregated = this.aggregateData(batch);
      
      // Store in Redis
      await this.storeAggregatedData(symbol, aggregated);
      
      // Emit aggregated data event
      this.emit('aggregatedData', { symbol, data: aggregated });
      
    } catch (error) {
      this.logger.error('Error processing batch:', error);
    }
  }

  /**
   * Aggregate market data
   */
  aggregateData(batch) {
    const trades = batch.filter(d => d.type === 'trade');
    const quotes = batch.filter(d => d.type === 'quote');
    
    if (trades.length === 0) return null;
    
    // Calculate OHLCV
    const prices = trades.map(t => t.price);
    const volumes = trades.map(t => t.size);
    
    return {
      symbol: batch[0].symbol,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: volumes.reduce((sum, v) => sum + v, 0),
      vwap: this.calculateVWAP(trades),
      tradeCount: trades.length,
      timestamp: batch[batch.length - 1].timestamp,
      timeframe: '1m'
    };
  }

  /**
   * Calculate Volume Weighted Average Price
   */
  calculateVWAP(trades) {
    let totalVolume = 0;
    let totalValue = 0;
    
    for (const trade of trades) {
      totalVolume += trade.size;
      totalValue += trade.price * trade.size;
    }
    
    return totalVolume > 0 ? totalValue / totalVolume : 0;
  }

  /**
   * Store aggregated data in Redis
   */
  async storeAggregatedData(symbol, data) {
    const key = `market_data:${symbol}:1m`;
    
    // Store as sorted set with timestamp as score
    await this.redis.zadd(key, data.timestamp, JSON.stringify(data));
    
    // Keep only last 1000 entries
    await this.redis.zremrangebyrank(key, 0, -1001);
    
    // Set expiration
    await this.redis.expire(key, this.config.performance.cacheTTL);
  }

  /**
   * Subscribe to market data for symbols
   */
  async subscribeToSymbols(symbols, dataTypes = ['trades', 'quotes']) {
    for (const symbol of symbols) {
      for (const [sourceName, connection] of this.connections) {
        if (connection.readyState === WebSocket.OPEN) {
          await this.subscribeToSymbol(sourceName, symbol, dataTypes);
        }
      }
    }
  }

  /**
   * Subscribe to market data for a specific symbol
   */
  async subscribeToSymbol(sourceName, symbol, dataTypes) {
    const sourceConfig = this.config.dataSources[sourceName];
    const connection = this.connections.get(sourceName);
    
    if (!connection || connection.readyState !== WebSocket.OPEN) {
      this.logger.warn(`Cannot subscribe to ${symbol} on ${sourceName}: connection not ready`);
      return;
    }
    
    let subscriptionMessage;
    
    switch (sourceName) {
      case 'alpaca':
        subscriptionMessage = {
          action: 'subscribe',
          trades: dataTypes.includes('trades') ? [symbol] : [],
          quotes: dataTypes.includes('quotes') ? [symbol] : [],
          bars: dataTypes.includes('bars') ? [symbol] : []
        };
        break;
        
      case 'binance':
        const streams = [];
        if (dataTypes.includes('trades')) streams.push(`${symbol.toLowerCase()}@trade`);
        if (dataTypes.includes('quotes')) streams.push(`${symbol.toLowerCase()}@ticker`);
        
        subscriptionMessage = {
          method: 'SUBSCRIBE',
          params: streams,
          id: Date.now()
        };
        break;
        
      case 'polygon':
        subscriptionMessage = {
          action: 'subscribe',
          params: dataTypes.includes('trades') ? `T.${symbol}` : `Q.${symbol}`
        };
        break;
    }
    
    if (subscriptionMessage) {
      connection.send(JSON.stringify(subscriptionMessage));
      
      // Track subscription
      const subscriptionKey = `${sourceName}:${symbol}`;
      this.subscriptions.set(subscriptionKey, {
        source: sourceName,
        symbol,
        dataTypes,
        subscribedAt: Date.now()
      });
      
      this.logger.info(`Subscribed to ${symbol} on ${sourceName}`);
    }
  }

  /**
   * Get latest market data for symbol
   */
  async getLatestData(symbol, limit = 100) {
    const key = `market_data:${symbol}:1m`;
    
    // Get latest data from Redis
    const data = await this.redis.zrevrange(key, 0, limit - 1);
    
    return data.map(item => JSON.parse(item));
  }

  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    setInterval(() => {
      this.updatePerformanceMetrics();
    }, 1000); // Update every second
  }

  /**
   * Update performance metrics
   */
  updatePerformanceMetrics() {
    const now = Date.now();
    const timeDiff = (now - this.metrics.lastUpdate) / 1000;
    
    this.metrics.messagesPerSecond = this.metrics.totalMessages / timeDiff;
    this.metrics.lastUpdate = now;
    
    // Reset counters
    this.metrics.totalMessages = 0;
    
    // Emit metrics
    this.emit('metrics', this.metrics);
  }

  /**
   * Update latency metrics
   */
  updateLatencyMetrics(latency) {
    // Simple moving average
    this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (latency * 0.1);
  }

  /**
   * Handle worker result
   */
  handleWorkerResult(result) {
    // Find the worker and mark as not busy
    const worker = this.workerPool.find(w => w.busy);
    if (worker) {
      worker.busy = false;
    }
    
    if (result.success) {
      this.emit('workerResult', result);
    } else {
      this.logger.error('Worker processing error:', result.error);
    }
  }

  /**
   * Start data processing
   */
  startDataProcessing() {
    // Process buffered data every 100ms
    setInterval(() => {
      for (const [symbol, buffer] of this.dataBuffer) {
        if (buffer.length > 0) {
          this.processBatch(symbol, [...buffer]);
          buffer.length = 0;
        }
      }
    }, 100);
  }

  /**
   * Get engine status
   */
  getEngineStatus() {
    return {
      status: 'operational',
      connections: this.connections.size,
      subscriptions: this.subscriptions.size,
      metrics: this.metrics,
      dataSources: Object.keys(this.config.dataSources).filter(
        source => this.config.dataSources[source].enabled
      ),
      assetClasses: Object.keys(this.config.assetClasses),
      lastUpdate: new Date().toISOString()
    };
  }

  // Helper methods
  determineAssetClass(symbol) {
    if (symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP')) {
      return 'forex';
    } else if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('USDT')) {
      return 'crypto';
    } else {
      return 'stocks';
    }
  }

  normalizeOandaData(message) {
    // Placeholder for OANDA data normalization
    return null;
  }
}

module.exports = RealTimeMarketDataEngine;
