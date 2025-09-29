/**
 * Database Connection Pools for NexusTradeAI
 * High-performance connection management for trading applications
 */

const { Pool } = require('pg');
const Redis = require('ioredis');
const { MongoClient } = require('mongodb');
const { InfluxDB } = require('@influxdata/influxdb-client');

class DatabaseConnectionPools {
  constructor(config = {}) {
    this.config = {
      postgres: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: process.env.POSTGRES_PORT || 5432,
        database: process.env.POSTGRES_DB || 'nexustrade',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || '',
        max: 20, // Maximum number of connections
        min: 5,  // Minimum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
        acquireTimeoutMillis: 60000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200,
        ...config.postgres
      },
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || '',
        db: 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        ...config.redis
      },
      mongodb: {
        url: process.env.MONGODB_URL || 'mongodb://localhost:27017',
        database: process.env.MONGODB_DB || 'nexustrade',
        maxPoolSize: 20,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 5000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        heartbeatFrequencyMS: 10000,
        ...config.mongodb
      },
      influxdb: {
        url: process.env.INFLUXDB_URL || 'http://localhost:8086',
        token: process.env.INFLUXDB_TOKEN || '',
        org: process.env.INFLUXDB_ORG || 'nexustrade',
        bucket: process.env.INFLUXDB_BUCKET || 'trading_data',
        timeout: 30000,
        ...config.influxdb
      }
    };

    this.pools = {
      postgres: null,
      redis: null,
      mongodb: null,
      influxdb: null
    };

    this.isInitialized = false;
    this.healthCheckInterval = null;
  }

  /**
   * Initialize all database connections
   */
  async initialize() {
    try {
      console.log('Initializing database connection pools...');

      // Initialize PostgreSQL pool
      await this.initializePostgreSQL();

      // Initialize Redis pool
      await this.initializeRedis();

      // Initialize MongoDB pool
      await this.initializeMongoDB();

      // Initialize InfluxDB client
      await this.initializeInfluxDB();

      this.isInitialized = true;

      // Start health checks
      this.startHealthChecks();

      console.log('All database connection pools initialized successfully');
      return true;
    } catch (error) {
      console.error('Failed to initialize database pools:', error);
      throw error;
    }
  }

  /**
   * Initialize PostgreSQL connection pool
   */
  async initializePostgreSQL() {
    try {
      this.pools.postgres = new Pool({
        ...this.config.postgres,
        // Performance optimizations for trading
        statement_timeout: 30000,
        query_timeout: 30000,
        application_name: 'nexustrade-ai',
        // SSL configuration for production
        ssl: process.env.NODE_ENV === 'production' ? {
          rejectUnauthorized: false
        } : false
      });

      // Test connection
      const client = await this.pools.postgres.connect();
      await client.query('SELECT NOW()');
      client.release();

      // Event handlers
      this.pools.postgres.on('error', (err) => {
        console.error('PostgreSQL pool error:', err);
      });

      this.pools.postgres.on('connect', (client) => {
        console.log('New PostgreSQL client connected');

        // Set session parameters for trading optimization
        client.query(`
          SET statement_timeout = '30s';
          SET lock_timeout = '10s';
          SET idle_in_transaction_session_timeout = '60s';
          SET timezone = 'UTC';
        `).catch(err => console.error('Failed to set session parameters:', err));
      });

      console.log('PostgreSQL connection pool initialized');
    } catch (error) {
      throw new Error(`PostgreSQL initialization failed: ${error.message}`);
    }
  }

  /**
   * Initialize Redis connection pool
   */
  async initializeRedis() {
    try {
      this.pools.redis = new Redis({
        ...this.config.redis,
        // Performance optimizations
        enableOfflineQueue: false,
        connectTimeout: 10000,
        commandTimeout: 5000,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        // Cluster support for high availability
        enableReadyCheck: true,
        lazyConnect: true
      });

      // Test connection
      await this.pools.redis.ping();

      // Event handlers
      this.pools.redis.on('error', (err) => {
        console.error('Redis connection error:', err);
      });

      this.pools.redis.on('connect', () => {
        console.log('Redis connected');
      });

      this.pools.redis.on('ready', () => {
        console.log('Redis ready');
      });

      this.pools.redis.on('close', () => {
        console.log('Redis connection closed');
      });

      this.pools.redis.on('reconnecting', () => {
        console.log('Redis reconnecting...');
      });

      console.log('Redis connection pool initialized');
    } catch (error) {
      throw new Error(`Redis initialization failed: ${error.message}`);
    }
  }
}