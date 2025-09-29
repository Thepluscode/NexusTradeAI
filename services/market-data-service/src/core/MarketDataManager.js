const EventEmitter = require('events');
const StockCollector = require('../collectors/stockCollector');
const CryptoCollector = require('../collectors/cryptoCollector');
const ForexCollector = require('../collectors/forexCollector');
const CommoditiesCollector = require('../collectors/commoditiesCollector');
const PriceProcessor = require('../processors/priceProcessor');
const VolumeProcessor = require('../processors/volumeProcessor');
const CorrelationProcessor = require('../processors/correlationProcessor');

class MarketDataManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.collectors = new Map();
    this.processors = new Map();
    this.distributors = new Set();
    this.isRunning = false;
    this.subscriptions = new Map();
    this.dataBuffer = new Map();
    this.bufferSize = process.env.BUFFER_SIZE || 1000;
    this.flushInterval = process.env.FLUSH_INTERVAL || 100; // ms
    
    this.initializeCollectors();
    this.initializeProcessors();
    this.setupEventHandlers();
  }

  initializeCollectors() {
    this.collectors.set('stock', new StockCollector({
      logger: this.logger,
      metrics: this.metrics
    }));
    
    this.collectors.set('crypto', new CryptoCollector({
      logger: this.logger,
      metrics: this.metrics
    }));
    
    this.collectors.set('forex', new ForexCollector({
      logger: this.logger,
      metrics: this.metrics
    }));
    
    this.collectors.set('commodities', new CommoditiesCollector({
      logger: this.logger,
      metrics: this.metrics
    }));
  }

  initializeProcessors() {
    this.processors.set('price', new PriceProcessor({
      logger: this.logger
    }));
    
    this.processors.set('volume', new VolumeProcessor({
      logger: this.logger
    }));
    
    this.processors.set('correlation', new CorrelationProcessor({
      logger: this.logger
    }));
  }

  setupEventHandlers() {
    // Handle data from collectors
    for (const [type, collector] of this.collectors) {
      collector.on('data', (data) => {
        this.handleMarketData(type, data);
      });
      
      collector.on('error', (error) => {
        this.logger.error(`Collector error (${type}):`, error);
        this.emit('collector-error', { type, error });
      });
      
      collector.on('reconnect', (info) => {
        this.logger.info(`Collector reconnected (${type}):`, info);
      });
    }
  }

  async start() {
    if (this.isRunning) {
      throw new Error('MarketDataManager is already running');
    }

    this.logger.info('Starting MarketDataManager...');
    
    try {
      // Start all collectors
      const startPromises = Array.from(this.collectors.values()).map(collector => 
        collector.start()
      );
      
      await Promise.all(startPromises);
      
      // Start processors
      for (const processor of this.processors.values()) {
        await processor.start();
      }
      
      // Start buffer flushing
      this.startBufferFlushing();
      
      this.isRunning = true;
      this.logger.info('MarketDataManager started successfully');
      
    } catch (error) {
      this.logger.error('Failed to start MarketDataManager:', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping MarketDataManager...');
    
    try {
      // Stop collectors
      const stopPromises = Array.from(this.collectors.values()).map(collector => 
        collector.stop()
      );
      
      await Promise.all(stopPromises);
      
      // Stop processors
      for (const processor of this.processors.values()) {
        await processor.stop();
      }
      
      // Flush remaining data
      await this.flushAllBuffers();
      
      this.isRunning = false;
      this.logger.info('MarketDataManager stopped');
      
    } catch (error) {
      this.logger.error('Error stopping MarketDataManager:', error);
      throw error;
    }
  }

  addDistributor(distributor) {
    this.distributors.add(distributor);
    this.logger.info(`Added distributor: ${distributor.constructor.name}`);
  }

  removeDistributor(distributor) {
    this.distributors.delete(distributor);
    this.logger.info(`Removed distributor: ${distributor.constructor.name}`);
  }

  async handleMarketData(type, rawData) {
    const startTime = Date.now();
    
    try {
      // Process data through processors
      let processedData = rawData;
      
      for (const processor of this.processors.values()) {
        processedData = await processor.process(processedData);
      }
      
      // Add metadata
      const enrichedData = {
        ...processedData,
        type,
        receivedAt: new Date().toISOString(),
        processingTime: Date.now() - startTime
      };
      
      // Buffer data for batch distribution
      this.bufferData(enrichedData);
      
      // Update metrics
      if (this.metrics) {
        this.metrics.dataPointsCounter.inc({
          exchange: enrichedData.exchange,
          symbol: enrichedData.symbol,
          type: enrichedData.dataType
        });
        
        this.metrics.latencyHistogram.observe(
          { operation: 'process', exchange: enrichedData.exchange },
          (Date.now() - startTime) / 1000
        );
      }
      
      // Emit processed data event
      this.emit('processed-data', enrichedData);
      
    } catch (error) {
      this.logger.error('Error processing market data:', error);
      this.emit('processing-error', { type, error, data: rawData });
    }
  }

  bufferData(data) {
    const key = `${data.exchange}-${data.symbol}`;
    
    if (!this.dataBuffer.has(key)) {
      this.dataBuffer.set(key, []);
    }
    
    const buffer = this.dataBuffer.get(key);
    buffer.push(data);
    
    if (buffer.length >= this.bufferSize) {
      this.flushBuffer(key);
    }
  }

  startBufferFlushing() {
    this.flushTimer = setInterval(() => {
      this.flushAllBuffers();
    }, this.flushInterval);
  }

  async flushAllBuffers() {
    const flushPromises = Array.from(this.dataBuffer.keys()).map(key => 
      this.flushBuffer(key)
    );
    
    await Promise.all(flushPromises);
  }

  async flushBuffer(key) {
    const buffer = this.dataBuffer.get(key);
    
    if (!buffer || buffer.length === 0) {
      return;
    }
    
    const dataToFlush = [...buffer];
    this.dataBuffer.set(key, []);
    
    // Distribute to all registered distributors
    const distributionPromises = Array.from(this.distributors).map(distributor =>
      distributor.distribute(dataToFlush).catch(error => {
        this.logger.error(`Distribution error (${distributor.constructor.name}):`, error);
      })
    );
    
    await Promise.all(distributionPromises);
  }

  subscribe(symbol, exchange, dataTypes = ['tick', 'orderbook', 'trade']) {
    const subscriptionKey = `${exchange}-${symbol}`;
    
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    
    dataTypes.forEach(type => {
      this.subscriptions.get(subscriptionKey).add(type);
    });
    
    // Forward subscription to relevant collectors
    for (const [collectorType, collector] of this.collectors) {
      if (collector.supportsExchange(exchange)) {
        collector.subscribe(symbol, exchange, dataTypes);
      }
    }
    
    this.logger.info(`Subscribed to ${subscriptionKey} for ${dataTypes.join(', ')}`);
  }

  unsubscribe(symbol, exchange, dataTypes = ['tick', 'orderbook', 'trade']) {
    const subscriptionKey = `${exchange}-${symbol}`;
    const subscription = this.subscriptions.get(subscriptionKey);
    
    if (!subscription) {
      return;
    }
    
    dataTypes.forEach(type => {
      subscription.delete(type);
    });
    
    if (subscription.size === 0) {
      this.subscriptions.delete(subscriptionKey);
    }
    
    // Forward unsubscription to collectors
    for (const [collectorType, collector] of this.collectors) {
      if (collector.supportsExchange(exchange)) {
        collector.unsubscribe(symbol, exchange, dataTypes);
      }
    }
    
    this.logger.info(`Unsubscribed from ${subscriptionKey} for ${dataTypes.join(', ')}`);
  }

  getActiveSubscriptions() {
    const subscriptions = {};
    
    for (const [key, dataTypes] of this.subscriptions) {
      subscriptions[key] = Array.from(dataTypes);
    }
    
    return subscriptions;
  }

  getHealthStatus() {
    const status = {
      isRunning: this.isRunning,
      collectors: {},
      processors: {},
      subscriptions: this.subscriptions.size,
      bufferSize: Array.from(this.dataBuffer.values()).reduce((sum, buffer) => sum + buffer.length, 0)
    };
    
    for (const [type, collector] of this.collectors) {
      status.collectors[type] = collector.getStatus();
    }
    
    for (const [type, processor] of this.processors) {
      status.processors[type] = processor.getStatus();
    }
    
    return status;
  }
}

module.exports = MarketDataManager;
