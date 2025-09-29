/**
 * Nexus Trade AI - Database Service
 * 
 * Comprehensive database service for historical analysis and data persistence
 * Supports PostgreSQL with automatic schema creation and data management
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

class DatabaseService {
  constructor(config = {}) {
    this.config = {
      connectionString: config.connectionString || process.env.DATABASE_URL,
      host: config.host || process.env.DB_HOST || 'localhost',
      port: config.port || process.env.DB_PORT || 5432,
      database: config.database || process.env.DB_NAME || 'nexustradeai',
      user: config.user || process.env.DB_USER || 'postgres',
      password: config.password || process.env.DB_PASSWORD || 'postgres',
      ssl: config.ssl || false,
      max: config.max || 20,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    };

    this.pool = null;
    this.isConnected = false;
    
    console.log('🗄️  Database Service initializing...');
  }

  /**
   * Initialize database connection and create tables
   */
  async initialize() {
    try {
      // Create connection pool
      this.pool = new Pool(this.config);
      
      // Test connection
      const client = await this.pool.connect();
      console.log('✅ Database connection established');
      client.release();
      
      // Create tables if they don't exist
      await this.createTables();
      
      this.isConnected = true;
      console.log('🗄️  Database Service ready');
      
      return true;
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Market data table
      await client.query(`
        CREATE TABLE IF NOT EXISTS market_data (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL,
          price DECIMAL(10,2) NOT NULL,
          open_price DECIMAL(10,2),
          high_price DECIMAL(10,2),
          low_price DECIMAL(10,2),
          close_price DECIMAL(10,2),
          volume BIGINT,
          change_amount DECIMAL(10,2),
          change_percent DECIMAL(5,2),
          source VARCHAR(20),
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Trading signals table
      await client.query(`
        CREATE TABLE IF NOT EXISTS trading_signals (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL,
          strategy VARCHAR(50) NOT NULL,
          action VARCHAR(10) NOT NULL,
          confidence DECIMAL(3,2),
          strength DECIMAL(3,2),
          expected_return DECIMAL(5,4),
          risk_score DECIMAL(3,2),
          price DECIMAL(10,2),
          quantity INTEGER,
          stop_loss DECIMAL(10,2),
          take_profit DECIMAL(10,2),
          metadata JSONB,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Trades table
      await client.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id SERIAL PRIMARY KEY,
          signal_id INTEGER REFERENCES trading_signals(id),
          symbol VARCHAR(10) NOT NULL,
          side VARCHAR(10) NOT NULL,
          quantity INTEGER NOT NULL,
          entry_price DECIMAL(10,2) NOT NULL,
          exit_price DECIMAL(10,2),
          stop_loss DECIMAL(10,2),
          take_profit DECIMAL(10,2),
          strategy VARCHAR(50),
          status VARCHAR(20) DEFAULT 'OPEN',
          pnl DECIMAL(10,2),
          pnl_percent DECIMAL(5,2),
          commission DECIMAL(8,2) DEFAULT 0,
          opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          closed_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Performance metrics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS performance_metrics (
          id SERIAL PRIMARY KEY,
          strategy VARCHAR(50),
          symbol VARCHAR(10),
          total_trades INTEGER DEFAULT 0,
          winning_trades INTEGER DEFAULT 0,
          losing_trades INTEGER DEFAULT 0,
          total_pnl DECIMAL(12,2) DEFAULT 0,
          max_drawdown DECIMAL(10,2) DEFAULT 0,
          sharpe_ratio DECIMAL(6,4),
          win_rate DECIMAL(5,2),
          avg_win DECIMAL(10,2),
          avg_loss DECIMAL(10,2),
          profit_factor DECIMAL(6,2),
          period_start TIMESTAMP WITH TIME ZONE,
          period_end TIMESTAMP WITH TIME ZONE,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Risk events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS risk_events (
          id SERIAL PRIMARY KEY,
          event_type VARCHAR(50) NOT NULL,
          severity VARCHAR(20) NOT NULL,
          symbol VARCHAR(10),
          description TEXT,
          risk_amount DECIMAL(10,2),
          portfolio_impact DECIMAL(5,2),
          action_taken VARCHAR(100),
          metadata JSONB,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // System logs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS system_logs (
          id SERIAL PRIMARY KEY,
          level VARCHAR(10) NOT NULL,
          service VARCHAR(50),
          message TEXT NOT NULL,
          metadata JSONB,
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create indexes for better performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timestamp 
        ON market_data(symbol, timestamp DESC)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_trading_signals_symbol_timestamp 
        ON trading_signals(symbol, timestamp DESC)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_trades_symbol_status 
        ON trades(symbol, status)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_performance_metrics_strategy 
        ON performance_metrics(strategy, updated_at DESC)
      `);

      await client.query('COMMIT');
      console.log('✅ Database tables created/verified');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Save market data
   */
  async saveMarketData(marketData) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO market_data (
          symbol, price, open_price, high_price, low_price, close_price,
          volume, change_amount, change_percent, source, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `;
      
      const values = [
        marketData.symbol,
        marketData.price,
        marketData.open,
        marketData.high,
        marketData.low,
        marketData.close,
        marketData.volume,
        marketData.change,
        marketData.changePercent,
        marketData.source,
        marketData.timestamp || new Date()
      ];
      
      const result = await client.query(query, values);
      return result.rows[0].id;
      
    } finally {
      client.release();
    }
  }

  /**
   * Save trading signal
   */
  async saveTradingSignal(signal) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO trading_signals (
          symbol, strategy, action, confidence, strength, expected_return,
          risk_score, price, quantity, stop_loss, take_profit, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id
      `;
      
      const values = [
        signal.symbol,
        signal.strategy,
        signal.action,
        signal.confidence,
        signal.strength,
        signal.expectedReturn,
        signal.riskScore,
        signal.price,
        signal.quantity,
        signal.stopLoss,
        signal.takeProfit,
        JSON.stringify(signal.metadata || {})
      ];
      
      const result = await client.query(query, values);
      return result.rows[0].id;
      
    } finally {
      client.release();
    }
  }

  /**
   * Save trade execution
   */
  async saveTrade(trade) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO trades (
          signal_id, symbol, side, quantity, entry_price, stop_loss,
          take_profit, strategy, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id
      `;
      
      const values = [
        trade.signalId,
        trade.symbol,
        trade.side,
        trade.quantity,
        trade.entryPrice,
        trade.stopLoss,
        trade.takeProfit,
        trade.strategy,
        trade.status || 'OPEN'
      ];
      
      const result = await client.query(query, values);
      return result.rows[0].id;
      
    } finally {
      client.release();
    }
  }

  /**
   * Update trade when closed
   */
  async closeTrade(tradeId, exitPrice, pnl, commission = 0) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        UPDATE trades 
        SET exit_price = $2, pnl = $3, pnl_percent = $4, commission = $5,
            status = 'CLOSED', closed_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      
      // Calculate PnL percentage
      const trade = await this.getTrade(tradeId);
      const pnlPercent = (pnl / (trade.entry_price * trade.quantity)) * 100;
      
      const values = [tradeId, exitPrice, pnl, pnlPercent, commission];
      const result = await client.query(query, values);
      
      return result.rows[0];
      
    } finally {
      client.release();
    }
  }

  /**
   * Get historical market data
   */
  async getMarketData(symbol, startDate, endDate, limit = 1000) {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT * FROM market_data 
        WHERE symbol = $1
      `;
      const values = [symbol];
      
      if (startDate) {
        query += ` AND timestamp >= $${values.length + 1}`;
        values.push(startDate);
      }
      
      if (endDate) {
        query += ` AND timestamp <= $${values.length + 1}`;
        values.push(endDate);
      }
      
      query += ` ORDER BY timestamp DESC LIMIT $${values.length + 1}`;
      values.push(limit);
      
      const result = await client.query(query, values);
      return result.rows;
      
    } finally {
      client.release();
    }
  }

  /**
   * Get trading performance analytics
   */
  async getPerformanceAnalytics(strategy = null, symbol = null, days = 30) {
    const client = await this.pool.connect();
    
    try {
      let query = `
        SELECT 
          strategy,
          symbol,
          COUNT(*) as total_trades,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
          SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
          SUM(pnl) as total_pnl,
          AVG(pnl) as avg_pnl,
          AVG(CASE WHEN pnl > 0 THEN pnl END) as avg_win,
          AVG(CASE WHEN pnl < 0 THEN pnl END) as avg_loss,
          MIN(pnl) as max_loss,
          MAX(pnl) as max_win,
          ROUND(
            SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)::DECIMAL / COUNT(*) * 100, 2
          ) as win_rate
        FROM trades 
        WHERE status = 'CLOSED' 
        AND closed_at >= NOW() - INTERVAL '${days} days'
      `;
      
      const values = [];
      
      if (strategy) {
        query += ` AND strategy = $${values.length + 1}`;
        values.push(strategy);
      }
      
      if (symbol) {
        query += ` AND symbol = $${values.length + 1}`;
        values.push(symbol);
      }
      
      query += ` GROUP BY strategy, symbol ORDER BY total_pnl DESC`;
      
      const result = await client.query(query, values);
      return result.rows;
      
    } finally {
      client.release();
    }
  }

  /**
   * Log system events
   */
  async logEvent(level, service, message, metadata = {}) {
    const client = await this.pool.connect();
    
    try {
      const query = `
        INSERT INTO system_logs (level, service, message, metadata)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;
      
      const values = [level, service, message, JSON.stringify(metadata)];
      const result = await client.query(query, values);
      
      return result.rows[0].id;
      
    } finally {
      client.release();
    }
  }

  /**
   * Get recent system logs
   */
  async getSystemLogs(level = null, service = null, limit = 100) {
    const client = await this.pool.connect();
    
    try {
      let query = `SELECT * FROM system_logs WHERE 1=1`;
      const values = [];
      
      if (level) {
        query += ` AND level = $${values.length + 1}`;
        values.push(level);
      }
      
      if (service) {
        query += ` AND service = $${values.length + 1}`;
        values.push(service);
      }
      
      query += ` ORDER BY timestamp DESC LIMIT $${values.length + 1}`;
      values.push(limit);
      
      const result = await client.query(query, values);
      return result.rows;
      
    } finally {
      client.release();
    }
  }

  /**
   * Get trade by ID
   */
  async getTrade(tradeId) {
    const client = await this.pool.connect();
    
    try {
      const query = `SELECT * FROM trades WHERE id = $1`;
      const result = await client.query(query, [tradeId]);
      
      return result.rows[0];
      
    } finally {
      client.release();
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      
      return {
        status: 'healthy',
        connected: true,
        timestamp: result.rows[0].now,
        poolSize: this.pool.totalCount,
        idleConnections: this.pool.idleCount,
        waitingClients: this.pool.waitingCount
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
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('🗄️  Database connection closed');
    }
  }
}

module.exports = DatabaseService;
