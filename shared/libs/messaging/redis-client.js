/**
 * Redis Client for NexusTradeAI
 * High-performance Redis client for caching and pub/sub
 */

const Redis = require('ioredis');
const { EventEmitter } = require('events');

class RedisClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = {
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || process.env.REDIS_PORT || 6379,
      password: config.password || process.env.REDIS_PASSWORD,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'nexustrade:',
      retryDelayOnFailover: config.retryDelayOnFailover || 100,
      enableReadyCheck: config.enableReadyCheck !== false,
      maxRetriesPerRequest: config.maxRetriesPerRequest || 3,
      lazyConnect: config.lazyConnect !== false,
      keepAlive: config.keepAlive || 30000,
      family: config.family || 4,
      connectTimeout: config.connectTimeout || 10000,
      commandTimeout: config.commandTimeout || 5000,
      ...config
    };

    this.redis = null;
    this.subscriber = null;
    this.publisher = null;
    this.isConnected = false;
    this.subscriptions = new Map();
    this.metrics = {
      commandsExecuted: 0,
      errors: 0,
      lastActivity: null
    };
  }

  /**
   * Initialize Redis connections
   */
  async initialize() {
    try {
      console.log('Initializing Redis client...');

      // Main Redis connection
      this.redis = new Redis(this.config);

      // Separate connections for pub/sub
      this.subscriber = new Redis(this.config);
      this.publisher = new Redis(this.config);

      // Test connections
      await Promise.all([
        this.redis.ping(),
        this.subscriber.ping(),
        this.publisher.ping()
      ]);

      this.isConnected = true;
      this.setupEventHandlers();

      console.log('Redis client initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      throw error;
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Main connection events
    this.redis.on('connect', () => {
      console.log('Redis connected');
      this.emit('connect');
    });

    this.redis.on('ready', () => {
      console.log('Redis ready');
      this.emit('ready');
    });

    this.redis.on('error', (error) => {
      console.error('Redis error:', error);
      this.metrics.errors++;
      this.emit('error', error);
    });

    this.redis.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
      this.emit('close');
    });

    this.redis.on('reconnecting', () => {
      console.log('Redis reconnecting...');
      this.emit('reconnecting');
    });

    // Subscriber events
    this.subscriber.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.subscriber.on('pmessage', (pattern, channel, message) => {
      this.handlePatternMessage(pattern, channel, message);
    });
  }

  /**
   * Set key-value pair with optional expiration
   */
  async set(key, value, ttl = null) {
    try {
      const fullKey = this.config.keyPrefix + key;
      let result;

      if (ttl) {
        result = await this.redis.setex(fullKey, ttl, JSON.stringify(value));
      } else {
        result = await this.redis.set(fullKey, JSON.stringify(value));
      }

      this.updateMetrics();
      return result === 'OK';
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Redis SET failed: ${error.message}`);
    }
  }

  /**
   * Get value by key
   */
  async get(key) {
    try {
      const fullKey = this.config.keyPrefix + key;
      const value = await this.redis.get(fullKey);

      this.updateMetrics();
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Redis GET failed: ${error.message}`);
    }
  }

  /**
   * Delete key
   */
  async del(key) {
    try {
      const fullKey = this.config.keyPrefix + key;
      const result = await this.redis.del(fullKey);

      this.updateMetrics();
      return result > 0;
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Redis DEL failed: ${error.message}`);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key) {
    try {
      const fullKey = this.config.keyPrefix + key;
      const result = await this.redis.exists(fullKey);

      this.updateMetrics();
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Redis EXISTS failed: ${error.message}`);
    }
  }

  /**
   * Set expiration for key
   */
  async expire(key, ttl) {
    try {
      const fullKey = this.config.keyPrefix + key;
      const result = await this.redis.expire(fullKey, ttl);

      this.updateMetrics();
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Redis EXPIRE failed: ${error.message}`);
    }
  }

  /**
   * Increment counter
   */
  async incr(key, amount = 1) {
    try {
      const fullKey = this.config.keyPrefix + key;
      const result = await this.redis.incrby(fullKey, amount);

      this.updateMetrics();
      return result;
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Redis INCR failed: ${error.message}`);
    }
  }

  /**
   * Publish message to channel
   */
  async publish(channel, message) {
    try {
      const result = await this.publisher.publish(channel, JSON.stringify(message));
      this.updateMetrics();
      return result;
    } catch (error) {
      this.metrics.errors++;
      throw new Error(`Redis PUBLISH failed: ${error.message}`);
    }
  }

  /**
   * Subscribe to channel
   */
  async subscribe(channel, handler) {
    try {
      this.subscriptions.set(channel, handler);
      await this.subscriber.subscribe(channel);
      console.log(`Subscribed to channel: ${channel}`);
    } catch (error) {
      throw new Error(`Redis SUBSCRIBE failed: ${error.message}`);
    }
  }

  /**
   * Handle incoming messages
   */
  handleMessage(channel, message) {
    try {
      const handler = this.subscriptions.get(channel);
      if (handler) {
        const parsedMessage = JSON.parse(message);
        handler(parsedMessage, channel);
      }
    } catch (error) {
      console.error('Error handling Redis message:', error);
    }
  }

  /**
   * Handle pattern messages
   */
  handlePatternMessage(pattern, channel, message) {
    try {
      const handler = this.subscriptions.get(pattern);
      if (handler) {
        const parsedMessage = JSON.parse(message);
        handler(parsedMessage, channel, pattern);
      }
    } catch (error) {
      console.error('Error handling Redis pattern message:', error);
    }
  }

  /**
   * Update metrics
   */
  updateMetrics() {
    this.metrics.commandsExecuted++;
    this.metrics.lastActivity = new Date();
  }

  /**
   * Get client metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isConnected: this.isConnected,
      subscriptions: this.subscriptions.size
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { healthy: false, error: 'Not connected' };
      }

      await this.redis.ping();

      return {
        healthy: true,
        metrics: this.getMetrics(),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect() {
    try {
      console.log('Disconnecting from Redis...');

      if (this.subscriber) {
        await this.subscriber.disconnect();
        this.subscriber = null;
      }

      if (this.publisher) {
        await this.publisher.disconnect();
        this.publisher = null;
      }

      if (this.redis) {
        await this.redis.disconnect();
        this.redis = null;
      }

      this.isConnected = false;
      this.subscriptions.clear();

      console.log('Disconnected from Redis');
    } catch (error) {
      console.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }
}

module.exports = RedisClient;