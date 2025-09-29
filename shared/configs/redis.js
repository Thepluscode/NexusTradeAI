/**
 * Redis Configuration for NexusTradeAI
 * Redis-specific configuration for caching and pub/sub
 */

const REDIS_CONFIG = {
  development: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || '',
    db: 0,
    keyPrefix: 'nexustrade:dev:',
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
    connectTimeout: 10000,
    commandTimeout: 5000
  },

  staging: {
    host: process.env.REDIS_HOST || 'staging-redis.nexustrade.ai',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    keyPrefix: 'nexustrade:staging:',
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
    connectTimeout: 10000,
    commandTimeout: 5000,
    tls: {}
  },

  production: {
    host: process.env.REDIS_HOST || 'prod-redis.nexustrade.ai',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    keyPrefix: 'nexustrade:prod:',
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
    connectTimeout: 10000,
    commandTimeout: 5000,
    enableOfflineQueue: false,
    tls: {
      rejectUnauthorized: true,
      ca: process.env.REDIS_CA_CERT,
      cert: process.env.REDIS_CLIENT_CERT,
      key: process.env.REDIS_CLIENT_KEY
    }
  }
};

// Cache TTL configurations
const CACHE_TTL = {
  SHORT: 300,      // 5 minutes
  MEDIUM: 1800,    // 30 minutes
  LONG: 3600,      // 1 hour
  DAILY: 86400,    // 24 hours
  WEEKLY: 604800   // 7 days
};

// Redis key patterns
const KEY_PATTERNS = {
  USER_SESSION: 'session:user:{userId}',
  TRADING_SESSION: 'session:trading:{userId}:{sessionId}',
  MARKET_DATA: 'market:{symbol}:{timeframe}',
  ORDER_CACHE: 'order:{orderId}',
  POSITION_CACHE: 'position:{accountId}:{symbol}',
  RATE_LIMIT: 'ratelimit:{userId}:{endpoint}',
  API_CACHE: 'api:{endpoint}:{hash}',
  NOTIFICATION: 'notification:{userId}',
  ALERT: 'alert:{userId}:{alertId}'
};

function getRedisConfig(environment = null) {
  const env = environment || process.env.NODE_ENV || 'development';

  if (!REDIS_CONFIG[env]) {
    throw new Error(`Redis configuration not found for environment: ${env}`);
  }

  return REDIS_CONFIG[env];
}

module.exports = {
  REDIS_CONFIG,
  CACHE_TTL,
  KEY_PATTERNS,
  getRedisConfig
};