const Redis = require('ioredis');

class RedisDistributor {
  constructor(options = {}) {
    this.logger = options.logger;
    this.config = {
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || process.env.REDIS_PORT || 6379,
      password: options.password || process.env.REDIS_PASSWORD,
      db: options.db || process.env.REDIS_DB || 0,
      keyPrefix: options.keyPrefix || 'market-data:',
      ttl: options.ttl || 3600 // 1 hour default TTL
    };
    
    this.redis = null;
    this.subscriber = null;
    this.isConnected = false;
    this.messageBuffer = [];
    this.bufferSize = options.bufferSize || 1000;
    this.flushInterval = options.flushInterval || 1000; // 1 second
    this.compressionEnabled = options.compression !== false;
  }

  async initialize() {
    try {
      this.logger?.info('Initializing Redis distributor...');
      
      // Main Redis connection for writing
      this.redis = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      // Separate connection for pub/sub
      this.subscriber = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });

      // Connect both clients
      await this.redis.connect();
      await this.subscriber.connect();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      this.isConnected = true;
      
      // Start buffer flushing
      this.startBufferFlushing();
      
      this.logger?.info('Redis distributor initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize Redis distributor:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      this.logger?.info('Disconnecting Redis distributor...');
      
      // Flush remaining messages
      await this.flushBuffer();
      
      // Stop buffer flushing
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }
      
      if (this.redis) {
        await this.redis.disconnect();
      }
      
      if (this.subscriber) {
        await this.subscriber.disconnect();
      }
      
      this.isConnected = false;
      this.logger?.info('Redis distributor disconnected');
      
    } catch (error) {
      this.logger?.error('Error disconnecting Redis distributor:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    this.redis.on('error', (error) => {
      this.logger?.error('Redis connection error:', error);
    });

    this.redis.on('connect', () => {
      this.logger?.info('Redis connected');
    });

    this.redis.on('reconnecting', () => {
      this.logger?.info('Redis reconnecting...');
    });

    this.subscriber.on('error', (error) => {
      this.logger?.error('Redis subscriber error:', error);
    });
  }

  async distribute(dataArray) {
    if (!this.isConnected || !Array.isArray(dataArray) || dataArray.length === 0) {
      return;
    }

    try {
      // Add data to buffer
      for (const data of dataArray) {
        this.bufferMessage(data);
      }
      
      // Flush if buffer is full
      if (this.messageBuffer.length >= this.bufferSize) {
        await this.flushBuffer();
      }
      
    } catch (error) {
      this.logger?.error('Error distributing to Redis:', error);
    }
  }

  bufferMessage(data) {
    const processedData = this.processDataForRedis(data);
    this.messageBuffer.push(processedData);
  }

  processDataForRedis(data) {
    return {
      key: this.generateKey(data),
      value: JSON.stringify({
        ...data,
        distributedAt: Date.now()
      }),
      channelKey: this.generateChannelKey(data),
      ttl: this.config.ttl
    };
  }

  generateKey(data) {
    const exchange = data.exchange || 'unknown';
    const symbol = data.symbol || 'unknown';
    const dataType = data.dataType || 'tick';
    
    return `${this.config.keyPrefix}${exchange}:${symbol}:${dataType}:latest`;
  }

  generateChannelKey(data) {
    const exchange = data.exchange || 'unknown';
    const symbol = data.symbol || 'unknown';
    const dataType = data.dataType || 'tick';
    
    return `${this.config.keyPrefix}channel:${exchange}:${symbol}:${dataType}`;
  }

  startBufferFlushing() {
    this.flushTimer = setInterval(async () => {
      if (this.messageBuffer.length > 0) {
        await this.flushBuffer();
      }
    }, this.flushInterval);
  }

  async flushBuffer() {
    if (this.messageBuffer.length === 0 || !this.isConnected) {
      return;
    }

    const messages = [...this.messageBuffer];
    this.messageBuffer = [];

    try {
      // Use pipeline for better performance
      const pipeline = this.redis.pipeline();
      
      for (const message of messages) {
        // Store latest data
        pipeline.setex(message.key, message.ttl, message.value);
        
        // Publish to channel
        pipeline.publish(message.channelKey, message.value);
        
        // Store in time series (sorted set)
        const timeSeriesKey = message.key.replace(':latest', ':timeseries');
        const score = Date.now();
        pipeline.zadd(timeSeriesKey, score, message.value);
        
        // Keep only recent time series data (last 1000 entries)
        pipeline.zremrangebyrank(timeSeriesKey, 0, -1001);
        pipeline.expire(timeSeriesKey, message.ttl);
      }
      
      await pipeline.exec();
      
      this.logger?.debug(`Flushed ${messages.length} messages to Redis`);
      
    } catch (error) {
      this.logger?.error('Error flushing messages to Redis:', error);
      
      // Re-add messages to buffer on failure (with limit)
      if (this.messageBuffer.length < this.bufferSize) {
        this.messageBuffer.unshift(...messages.slice(0, this.bufferSize - this.messageBuffer.length));
      }
    }
  }

  async getLatestData(exchange, symbol, dataType = 'tick') {
    try {
      const key = `${this.config.keyPrefix}${exchange}:${symbol}:${dataType}:latest`;
      const data = await this.redis.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger?.error('Error getting latest data from Redis:', error);
      return null;
    }
  }

  async getTimeSeriesData(exchange, symbol, dataType = 'tick', limit = 100) {
    try {
      const key = `${this.config.keyPrefix}${exchange}:${symbol}:${dataType}:timeseries`;
      const data = await this.redis.zrevrange(key, 0, limit - 1);
      
      return data.map(item => JSON.parse(item));
    } catch (error) {
      this.logger?.error('Error getting time series data from Redis:', error);
      return [];
    }
  }

  async subscribeToChannel(exchange, symbol, dataType, callback) {
    try {
      const channelKey = `${this.config.keyPrefix}channel:${exchange}:${symbol}:${dataType}`;
      
      this.subscriber.subscribe(channelKey);
      this.subscriber.on('message', (channel, message) => {
        if (channel === channelKey) {
          try {
            const data = JSON.parse(message);
            callback(data);
          } catch (error) {
            this.logger?.error('Error parsing subscription message:', error);
          }
        }
      });
      
      this.logger?.info(`Subscribed to Redis channel: ${channelKey}`);
    } catch (error) {
      this.logger?.error('Error subscribing to Redis channel:', error);
    }
  }

  async unsubscribeFromChannel(exchange, symbol, dataType) {
    try {
      const channelKey = `${this.config.keyPrefix}channel:${exchange}:${symbol}:${dataType}`;
      await this.subscriber.unsubscribe(channelKey);
      
      this.logger?.info(`Unsubscribed from Redis channel: ${channelKey}`);
    } catch (error) {
      this.logger?.error('Error unsubscribing from Redis channel:', error);
    }
  }

  async storeOrderBook(exchange, symbol, orderBook) {
    try {
      const key = `${this.config.keyPrefix}${exchange}:${symbol}:orderbook`;
      const value = JSON.stringify({
        ...orderBook,
        timestamp: Date.now()
      });
      
      await this.redis.setex(key, this.config.ttl, value);
    } catch (error) {
      this.logger?.error('Error storing order book:', error);
    }
  }

  async getOrderBook(exchange, symbol) {
    try {
      const key = `${this.config.keyPrefix}${exchange}:${symbol}:orderbook`;
      const data = await this.redis.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger?.error('Error getting order book:', error);
      return null;
    }
  }

  async storeMarketSummary(exchange, summary) {
    try {
      const key = `${this.config.keyPrefix}${exchange}:summary`;
      const value = JSON.stringify({
        ...summary,
        timestamp: Date.now()
      });
      
      await this.redis.setex(key, this.config.ttl, value);
    } catch (error) {
      this.logger?.error('Error storing market summary:', error);
    }
  }

  async getMarketSummary(exchange) {
    try {
      const key = `${this.config.keyPrefix}${exchange}:summary`;
      const data = await this.redis.get(key);
      
      return data ? JSON.parse(data) : null;
    } catch (error) {
      this.logger?.error('Error getting market summary:', error);
      return null;
    }
  }

  async storeSymbolList(exchange, symbols) {
    try {
      const key = `${this.config.keyPrefix}${exchange}:symbols`;
      const value = JSON.stringify(symbols);
      
      await this.redis.setex(key, 24 * 3600, value); // 24 hours TTL
    } catch (error) {
      this.logger?.error('Error storing symbol list:', error);
    }
  }

  async getSymbolList(exchange) {
    try {
      const key = `${this.config.keyPrefix}${exchange}:symbols`;
      const data = await this.redis.get(key);
      
      return data ? JSON.parse(data) : [];
    } catch (error) {
      this.logger?.error('Error getting symbol list:', error);
      return [];
    }
  }

  async clearData(exchange, symbol = null, dataType = null) {
    try {
      let pattern = `${this.config.keyPrefix}${exchange}`;
      
      if (symbol) {
        pattern += `:${symbol}`;
        if (dataType) {
          pattern += `:${dataType}`;
        }
      }
      
      pattern += ':*';
      
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
        this.logger?.info(`Cleared ${keys.length} keys matching pattern: ${pattern}`);
      }
    } catch (error) {
      this.logger?.error('Error clearing Redis data:', error);
    }
  }

  async getStats() {
    try {
      const info = await this.redis.info('memory');
      const keyspaceInfo = await this.redis.info('keyspace');
      
      return {
        isConnected: this.isConnected,
        bufferSize: this.messageBuffer.length,
        maxBufferSize: this.bufferSize,
        redisInfo: {
          memory: this.parseRedisInfo(info),
          keyspace: this.parseRedisInfo(keyspaceInfo)
        }
      };
    } catch (error) {
      this.logger?.error('Error getting Redis stats:', error);
      return {
        isConnected: this.isConnected,
        bufferSize: this.messageBuffer.length,
        maxBufferSize: this.bufferSize,
        error: error.message
      };
    }
  }

  parseRedisInfo(info) {
    const lines = info.split('\r\n');
    const result = {};
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':');
        result[key] = isNaN(value) ? value : parseFloat(value);
      }
    }
    
    return result;
  }
}

module.exports = RedisDistributor;