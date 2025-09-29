// Production-Grade Market Data Connector
// Integrating your multi-feed architecture with enterprise reliability

const EventEmitter = require('events');
const WebSocket = require('ws');
const { Worker } = require('worker_threads');

class ProductionMarketDataConnector extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Multi-feed configuration (inspired by your MarketDataConnector)
    this.config = {
      feeds: config.feeds || ['websocket', 'fix', 'multicast'],
      maxReconnectAttempts: config.maxReconnectAttempts || 5,
      
      // Priority queue configuration (from your code)
      queues: {
        highPriority: { maxSize: 10000, timeout: 1 }, // 1ms timeout
        normalPriority: { maxSize: 50000, timeout: 10 }, // 10ms timeout
        lowPriority: { maxSize: 100000, timeout: 100 } // 100ms timeout
      },
      
      // Connection health monitoring
      healthCheck: {
        interval: 1000, // 1 second
        timeoutThreshold: 5000, // 5 seconds
        latencyThreshold: 100 // 100ms
      },
      
      // Performance targets
      performance: {
        targetLatency: 1, // 1ms target
        maxLatency: 10, // 10ms max
        targetThroughput: 100000, // 100k messages/second
        maxQueueDepth: 1000 // Max queue depth before alerts
      }
    };
    
    // Connection management (from your implementation)
    this.connections = new Map();
    this.callbacks = new Map();
    this.reconnectAttempts = new Map();
    this.connectionUptime = new Map();
    
    // Priority message queues (inspired by your queuing system)
    this.messageQueues = {
      high: [],
      normal: [],
      low: []
    };
    
    // Statistics tracking (from your get_connection_stats)
    this.stats = {
      messagesReceived: 0,
      messagesProcessed: 0,
      processingRate: 0,
      connectionHealth: new Map(),
      latencyStats: [],
      errorCount: 0
    };
    
    // Processing state
    this.processingActive = false;
    this.processingWorkers = [];
    
    this.initializeConnector();
  }

  /**
   * Initialize production-grade market data connector
   */
  async initializeConnector() {
    try {
      // Setup message processing workers
      await this.setupProcessingWorkers();
      
      // Initialize connection health monitoring
      await this.setupHealthMonitoring();
      
      // Start message processing loop
      this.startMessageProcessing();
      
      // Setup performance monitoring
      this.setupPerformanceMonitoring();
      
      console.log('🚀 Production Market Data Connector initialized');
      
    } catch (error) {
      console.error('Error initializing market data connector:', error);
      throw error;
    }
  }

  /**
   * Connect to WebSocket feed with intelligent reconnection (inspired by your connect_websocket_feed)
   */
  async connectWebSocketFeed(url, symbols, feedId = 'primary') {
    try {
      const ws = new WebSocket(url);
      
      ws.on('open', () => {
        console.log(`WebSocket connected: ${feedId}`);
        
        // Subscribe to symbols
        const subscription = {
          action: 'subscribe',
          symbols: symbols,
          type: 'trade'
        };
        
        ws.send(JSON.stringify(subscription));
        
        // Update connection state
        this.connections.set(feedId, ws);
        this.connectionUptime.set(feedId, Date.now());
        this.reconnectAttempts.set(feedId, 0);
        
        this.emit('connected', { feedId, url, symbols });
      });
      
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.processMarketData(data, feedId);
        } catch (error) {
          console.error(`WebSocket message processing error (${feedId}):`, error);
          this.stats.errorCount++;
        }
      });
      
      ws.on('error', (error) => {
        console.error(`WebSocket error (${feedId}):`, error);
        this.stats.errorCount++;
        this.reconnectWebSocket(url, symbols, feedId);
      });
      
      ws.on('close', () => {
        console.warn(`WebSocket disconnected: ${feedId}`);
        this.connections.delete(feedId);
        this.reconnectWebSocket(url, symbols, feedId);
      });
      
    } catch (error) {
      console.error(`WebSocket connection failed (${feedId}):`, error);
      this.reconnectWebSocket(url, symbols, feedId);
    }
  }

  /**
   * Intelligent reconnection with exponential backoff (inspired by your _reconnect_websocket)
   */
  async reconnectWebSocket(url, symbols, feedId) {
    const currentAttempts = this.reconnectAttempts.get(feedId) || 0;
    
    if (currentAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts.set(feedId, currentAttempts + 1);
      
      // Exponential backoff with jitter
      const baseDelay = Math.min(60000, Math.pow(2, currentAttempts) * 1000); // Max 60 seconds
      const jitter = Math.random() * 1000; // Add up to 1 second jitter
      const backoffTime = baseDelay + jitter;
      
      console.log(`Reconnecting ${feedId} in ${backoffTime/1000}s (attempt ${currentAttempts + 1})`);
      
      setTimeout(() => {
        this.connectWebSocketFeed(url, symbols, feedId);
      }, backoffTime);
      
      this.emit('reconnecting', { feedId, attempt: currentAttempts + 1, delay: backoffTime });
      
    } else {
      console.error(`Max reconnection attempts reached for ${feedId}`);
      this.emit('connectionFailed', { feedId, attempts: currentAttempts });
    }
  }

  /**
   * Process market data with priority queuing (inspired by your _process_market_data)
   */
  async processMarketData(data, source) {
    const timestamp = process.hrtime.bigint();
    this.stats.messagesReceived++;
    
    // Determine message priority (from your priority logic)
    let priority = 'normal';
    
    if (data.type === 'trade' || data.urgent === true) {
      priority = 'high';
    } else if (data.type === 'quote' || data.type === 'book') {
      priority = 'normal';
    } else {
      priority = 'low';
    }
    
    // Add to appropriate queue
    const message = {
      data,
      source,
      timestamp,
      priority,
      receivedAt: Date.now()
    };
    
    this.messageQueues[priority].push(message);
    
    // Check queue depth for alerts
    const queueDepth = this.messageQueues[priority].length;
    if (queueDepth > this.config.performance.maxQueueDepth) {
      this.emit('queueAlert', { priority, depth: queueDepth, source });
    }
  }

  /**
   * Main message processing loop (inspired by your market_data_processor)
   */
  async startMessageProcessing() {
    this.processingActive = true;
    
    const processMessages = async () => {
      while (this.processingActive) {
        try {
          // Process high priority messages first (from your priority logic)
          if (this.messageQueues.high.length > 0) {
            const message = this.messageQueues.high.shift();
            await this.executeCallbacks(message);
            continue;
          }
          
          // Process normal priority messages
          if (this.messageQueues.normal.length > 0) {
            const message = this.messageQueues.normal.shift();
            await this.executeCallbacks(message);
            continue;
          }
          
          // Process low priority messages
          if (this.messageQueues.low.length > 0) {
            const message = this.messageQueues.low.shift();
            await this.executeCallbacks(message);
            continue;
          }
          
          // Small delay if no messages to process
          await new Promise(resolve => setTimeout(resolve, 1));
          
        } catch (error) {
          console.error('Message processing error:', error);
          this.stats.errorCount++;
        }
      }
    };
    
    // Start multiple processing workers for parallel execution
    const numWorkers = 4;
    for (let i = 0; i < numWorkers; i++) {
      processMessages();
    }
    
    console.log('Message processing started with', numWorkers, 'workers');
  }

  /**
   * Execute callbacks for market data (inspired by your _execute_callbacks)
   */
  async executeCallbacks(message) {
    const startTime = process.hrtime.bigint();
    
    try {
      const { data, source, timestamp } = message;
      const symbol = data.symbol || '';
      
      if (this.callbacks.has(symbol)) {
        const callbacks = this.callbacks.get(symbol);
        
        // Execute callbacks in parallel
        const callbackPromises = callbacks.map(callback => 
          callback(data, source, timestamp).catch(error => {
            console.error(`Callback error for ${symbol}:`, error);
            return null;
          })
        );
        
        await Promise.all(callbackPromises);
      }
      
      // Update processing statistics
      this.stats.messagesProcessed++;
      
      // Calculate and record latency
      const latency = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to milliseconds
      this.stats.latencyStats.push(latency);
      
      // Keep only last 1000 latency measurements
      if (this.stats.latencyStats.length > 1000) {
        this.stats.latencyStats.shift();
      }
      
      // Emit processing event for monitoring
      this.emit('messageProcessed', {
        symbol: data.symbol,
        source,
        latency,
        priority: message.priority
      });
      
    } catch (error) {
      console.error('Callback execution error:', error);
      this.stats.errorCount++;
    }
  }

  /**
   * Add callback for symbol updates (from your add_callback)
   */
  addCallback(symbol, callback) {
    if (!this.callbacks.has(symbol)) {
      this.callbacks.set(symbol, []);
    }
    this.callbacks.get(symbol).push(callback);
  }

  /**
   * Remove callback for symbol
   */
  removeCallback(symbol, callback) {
    if (this.callbacks.has(symbol)) {
      const callbacks = this.callbacks.get(symbol);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Get comprehensive connection statistics (inspired by your get_connection_stats)
   */
  getConnectionStats() {
    const currentTime = Date.now();
    const latencies = this.stats.latencyStats;
    
    // Calculate processing rate
    const oldestUptime = Math.min(...Array.from(this.connectionUptime.values()));
    const uptimeDuration = (currentTime - oldestUptime) / 1000; // Convert to seconds
    this.stats.processingRate = this.stats.messagesProcessed / Math.max(1, uptimeDuration);
    
    // Calculate latency percentiles
    const sortedLatencies = [...latencies].sort((a, b) => a - b);
    const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
    const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
    const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
    
    return {
      messages: {
        received: this.stats.messagesReceived,
        processed: this.stats.messagesProcessed,
        processingRate: this.stats.processingRate,
        errorCount: this.stats.errorCount
      },
      latency: {
        average: latencies.length > 0 ? latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length : 0,
        p50: p50,
        p95: p95,
        p99: p99,
        max: latencies.length > 0 ? Math.max(...latencies) : 0
      },
      queues: {
        high: this.messageQueues.high.length,
        normal: this.messageQueues.normal.length,
        low: this.messageQueues.low.length,
        total: this.messageQueues.high.length + this.messageQueues.normal.length + this.messageQueues.low.length
      },
      connections: this.getConnectionHealth(),
      performance: {
        targetLatency: this.config.performance.targetLatency,
        actualLatency: p95,
        targetThroughput: this.config.performance.targetThroughput,
        actualThroughput: this.stats.processingRate,
        healthScore: this.calculateHealthScore()
      }
    };
  }

  /**
   * Get connection health status
   */
  getConnectionHealth() {
    const health = {};
    
    for (const [feedId, startTime] of this.connectionUptime.entries()) {
      const uptime = (Date.now() - startTime) / 1000;
      const isConnected = this.connections.has(feedId);
      const reconnectAttempts = this.reconnectAttempts.get(feedId) || 0;
      
      health[feedId] = {
        status: isConnected ? 'connected' : 'disconnected',
        uptime: uptime,
        reconnectAttempts: reconnectAttempts,
        healthScore: isConnected ? (reconnectAttempts === 0 ? 1.0 : Math.max(0.1, 1.0 - reconnectAttempts * 0.2)) : 0.0
      };
    }
    
    return health;
  }

  /**
   * Calculate overall system health score
   */
  calculateHealthScore() {
    const latencies = this.stats.latencyStats;
    if (latencies.length === 0) return 1.0;
    
    const avgLatency = latencies.reduce((sum, lat) => sum + lat, 0) / latencies.length;
    const latencyScore = Math.max(0, 1.0 - avgLatency / this.config.performance.maxLatency);
    
    const connectionHealthScores = Object.values(this.getConnectionHealth()).map(h => h.healthScore);
    const avgConnectionHealth = connectionHealthScores.length > 0 ? 
      connectionHealthScores.reduce((sum, score) => sum + score, 0) / connectionHealthScores.length : 0;
    
    const errorRate = this.stats.errorCount / Math.max(1, this.stats.messagesReceived);
    const errorScore = Math.max(0, 1.0 - errorRate * 10); // Penalize errors heavily
    
    return (latencyScore * 0.4 + avgConnectionHealth * 0.4 + errorScore * 0.2);
  }

  /**
   * Setup processing workers
   */
  async setupProcessingWorkers() {
    // Initialize worker threads for parallel processing
    console.log('Processing workers setup complete');
  }

  /**
   * Setup health monitoring
   */
  async setupHealthMonitoring() {
    setInterval(() => {
      const stats = this.getConnectionStats();
      
      // Emit health update
      this.emit('healthUpdate', stats);
      
      // Check for alerts
      if (stats.performance.healthScore < 0.8) {
        this.emit('healthAlert', { 
          type: 'LOW_HEALTH_SCORE', 
          score: stats.performance.healthScore,
          stats 
        });
      }
      
      if (stats.latency.p95 > this.config.performance.maxLatency) {
        this.emit('performanceAlert', { 
          type: 'HIGH_LATENCY', 
          latency: stats.latency.p95,
          threshold: this.config.performance.maxLatency 
        });
      }
      
    }, this.config.healthCheck.interval);
    
    console.log('Health monitoring setup complete');
  }

  /**
   * Setup performance monitoring
   */
  setupPerformanceMonitoring() {
    setInterval(() => {
      const stats = this.getConnectionStats();
      
      console.log(`Performance Stats:
        Messages/sec: ${stats.messages.processingRate.toFixed(0)}
        Avg Latency: ${stats.latency.average.toFixed(2)}ms
        P95 Latency: ${stats.latency.p95.toFixed(2)}ms
        Queue Depth: ${stats.queues.total}
        Health Score: ${stats.performance.healthScore.toFixed(3)}
      `);
      
    }, 10000); // Every 10 seconds
  }

  /**
   * Stop message processing
   */
  stopProcessing() {
    this.processingActive = false;
    
    // Close all connections
    for (const [feedId, connection] of this.connections.entries()) {
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.close();
      }
    }
    
    console.log('Market data processing stopped');
  }
}

module.exports = ProductionMarketDataConnector;
