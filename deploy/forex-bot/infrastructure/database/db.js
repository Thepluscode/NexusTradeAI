/**
 * Database Layer - Production Grade
 * ==================================
 * PostgreSQL connection pool with proper error handling,
 * connection management, and query optimization
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.metrics = {
      queries: 0,
      errors: 0,
      avgLatency: 0,
      connections: 0
    };
  }

  /**
   * Initialize connection pool
   */
  async connect() {
    if (this.isConnected) {
      return this.pool;
    }

    try {
      this.pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'nexustradeai',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,

        // Connection pool settings
        max: 20,                    // Max connections
        min: 2,                     // Min connections
        idleTimeoutMillis: 30000,   // Close idle connections after 30s
        connectionTimeoutMillis: 5000, // Fail fast if can't connect

        // Performance
        statement_timeout: 30000,   // Kill queries after 30s
        query_timeout: 30000,

        // SSL for production
        ssl: process.env.NODE_ENV === 'production' ? {
          rejectUnauthorized: false
        } : false
      });

      // Test connection
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();

      this.isConnected = true;
      console.log(`✅ Database connected: ${result.rows[0].now}`);

      // Setup error handlers
      this.pool.on('error', (err) => {
        console.error('❌ Unexpected database error:', err);
        this.metrics.errors++;
        this.isConnected = false;
      });

      this.pool.on('connect', () => {
        this.metrics.connections++;
      });

      return this.pool;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      this.metrics.errors++;
      throw error;
    }
  }

  /**
   * Execute query with metrics
   */
  async query(text, params = []) {
    const startTime = Date.now();

    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const result = await this.pool.query(text, params);

      // Update metrics
      const latency = Date.now() - startTime;
      this.metrics.queries++;
      this.metrics.avgLatency = (
        (this.metrics.avgLatency * (this.metrics.queries - 1) + latency) /
        this.metrics.queries
      );

      // Log slow queries
      if (latency > 1000) {
        console.warn(`⚠️ Slow query (${latency}ms):`, text.substring(0, 100));
      }

      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error('❌ Query error:', error);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * Transaction wrapper
   */
  async transaction(callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Transaction rolled back:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      poolSize: this.pool?.totalCount || 0,
      idleConnections: this.pool?.idleCount || 0,
      waitingClients: this.pool?.waitingCount || 0
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const result = await this.query('SELECT 1');
      return {
        status: 'healthy',
        connected: this.isConnected,
        latency: this.metrics.avgLatency,
        metrics: this.getMetrics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Close all connections
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('✅ Database connections closed');
    }
  }
}

// Singleton instance
const db = new Database();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await db.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await db.close();
  process.exit(0);
});

module.exports = db;
