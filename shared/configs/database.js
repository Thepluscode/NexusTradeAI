/**
 * Database Configuration for NexusTradeAI
 * Centralized database configuration for all environments
 */

const DATABASE_CONFIG = {
  development: {
    postgres: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || 'nexustrade_dev',
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      max: 10,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: false
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    },
    mongodb: {
      url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
      database: process.env.MONGODB_DB || 'nexustrade_dev',
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000
    },
    influxdb: {
      url: process.env.INFLUXDB_URL || 'http://localhost:8086',
      token: process.env.INFLUXDB_TOKEN || '',
      org: process.env.INFLUXDB_ORG || 'nexustrade',
      bucket: process.env.INFLUXDB_BUCKET || 'trading_data_dev'
    }
  },

  staging: {
    postgres: {
      host: process.env.POSTGRES_HOST || 'staging-postgres.nexustrade.ai',
      port: parseInt(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || 'nexustrade_staging',
      user: process.env.POSTGRES_USER || 'nexustrade_user',
      password: process.env.POSTGRES_PASSWORD,
      max: 15,
      min: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: {
        rejectUnauthorized: false
      }
    },
    redis: {
      host: process.env.REDIS_HOST || 'staging-redis.nexustrade.ai',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      tls: {}
    },
    mongodb: {
      url: process.env.MONGODB_URL || 'mongodb://staging-mongo.nexustrade.ai:27017',
      database: process.env.MONGODB_DB || 'nexustrade_staging',
      maxPoolSize: 15,
      minPoolSize: 3,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      ssl: true
    },
    influxdb: {
      url: process.env.INFLUXDB_URL || 'https://staging-influx.nexustrade.ai',
      token: process.env.INFLUXDB_TOKEN,
      org: process.env.INFLUXDB_ORG || 'nexustrade',
      bucket: process.env.INFLUXDB_BUCKET || 'trading_data_staging'
    }
  },

  production: {
    postgres: {
      host: process.env.POSTGRES_HOST || 'prod-postgres.nexustrade.ai',
      port: parseInt(process.env.POSTGRES_PORT) || 5432,
      database: process.env.POSTGRES_DB || 'nexustrade_production',
      user: process.env.POSTGRES_USER || 'nexustrade_user',
      password: process.env.POSTGRES_PASSWORD,
      max: 25,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
      ssl: {
        rejectUnauthorized: true,
        ca: process.env.POSTGRES_CA_CERT,
        cert: process.env.POSTGRES_CLIENT_CERT,
        key: process.env.POSTGRES_CLIENT_KEY
      }
    },
    redis: {
      host: process.env.REDIS_HOST || 'prod-redis.nexustrade.ai',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: 0,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      family: 4,
      connectTimeout: 10000,
      commandTimeout: 5000,
      tls: {
        rejectUnauthorized: true,
        ca: process.env.REDIS_CA_CERT,
        cert: process.env.REDIS_CLIENT_CERT,
        key: process.env.REDIS_CLIENT_KEY
      }
    },
    mongodb: {
      url: process.env.MONGODB_URL || 'mongodb://prod-mongo.nexustrade.ai:27017',
      database: process.env.MONGODB_DB || 'nexustrade_production',
      maxPoolSize: 25,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 5000,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      ssl: true,
      sslValidate: true,
      sslCA: process.env.MONGODB_CA_CERT,
      sslCert: process.env.MONGODB_CLIENT_CERT,
      sslKey: process.env.MONGODB_CLIENT_KEY
    },
    influxdb: {
      url: process.env.INFLUXDB_URL || 'https://prod-influx.nexustrade.ai',
      token: process.env.INFLUXDB_TOKEN,
      org: process.env.INFLUXDB_ORG || 'nexustrade',
      bucket: process.env.INFLUXDB_BUCKET || 'trading_data_production',
      timeout: 30000
    }
  }
};

/**
 * Get database configuration for current environment
 */
function getDatabaseConfig(environment = null) {
  const env = environment || process.env.NODE_ENV || 'development';

  if (!DATABASE_CONFIG[env]) {
    throw new Error(`Database configuration not found for environment: ${env}`);
  }

  return DATABASE_CONFIG[env];
}

/**
 * Get specific database configuration
 */
function getSpecificDatabaseConfig(database, environment = null) {
  const config = getDatabaseConfig(environment);

  if (!config[database]) {
    throw new Error(`Configuration not found for database: ${database}`);
  }

  return config[database];
}

module.exports = {
  DATABASE_CONFIG,
  getDatabaseConfig,
  getSpecificDatabaseConfig
};