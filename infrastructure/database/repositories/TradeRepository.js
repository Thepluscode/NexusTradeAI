/**
 * Trade Repository - Production Grade
 * ====================================
 * Manages trade history with advanced querying and analytics
 */

const db = require('../db');

class TradeRepository {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 60000; // 1 minute cache
  }

  /**
   * Create a new trade record
   */
  async create(trade) {
    this.validateTrade(trade);

    const query = `
      INSERT INTO trades (
        account_id,
        order_id,
        symbol,
        side,
        quantity,
        entry_price,
        exit_price,
        entry_time,
        exit_time,
        pnl,
        pnl_percent,
        fees,
        strategy,
        signal_id,
        status,
        stop_loss,
        take_profit,
        exit_reason,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const values = [
      trade.account_id,
      trade.order_id,
      trade.symbol,
      trade.side,
      trade.quantity,
      trade.entry_price,
      trade.exit_price || null,
      trade.entry_time,
      trade.exit_time || null,
      trade.pnl || 0,
      trade.pnl_percent || 0,
      trade.fees || 0,
      trade.strategy,
      trade.signal_id || null,
      trade.status || 'open',
      trade.stop_loss || null,
      trade.take_profit || null,
      trade.exit_reason || null,
      trade.metadata ? JSON.stringify(trade.metadata) : null
    ];

    const result = await db.query(query, values);
    this.clearCache();

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update an existing trade
   */
  async update(tradeId, updates) {
    const allowedFields = [
      'exit_price', 'exit_time', 'pnl', 'pnl_percent',
      'fees', 'status', 'exit_reason', 'metadata'
    ];

    const fields = Object.keys(updates).filter(f => allowedFields.includes(f));
    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
    const values = [tradeId, ...fields.map(f =>
      f === 'metadata' && updates[f] ? JSON.stringify(updates[f]) : updates[f]
    )];

    const query = `
      UPDATE trades
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, values);
    this.clearCache();

    if (result.rows.length === 0) {
      throw new Error(`Trade ${tradeId} not found`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Close a trade
   */
  async close(tradeId, exitPrice, exitReason = 'manual') {
    const query = `
      UPDATE trades
      SET
        exit_price = $2,
        exit_time = NOW(),
        pnl = (exit_price - entry_price) * quantity * CASE WHEN side = 'sell' THEN -1 ELSE 1 END,
        pnl_percent = ((exit_price - entry_price) / entry_price) * 100 * CASE WHEN side = 'sell' THEN -1 ELSE 1 END,
        status = 'closed',
        exit_reason = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, [tradeId, exitPrice, exitReason]);
    this.clearCache();

    if (result.rows.length === 0) {
      throw new Error(`Trade ${tradeId} not found`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get trade by ID
   */
  async getById(tradeId) {
    const cacheKey = `trade:${tradeId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const query = 'SELECT * FROM trades WHERE id = $1';
    const result = await db.query(query, [tradeId]);

    if (result.rows.length === 0) {
      return null;
    }

    const trade = this.mapRow(result.rows[0]);
    this.setCache(cacheKey, trade);
    return trade;
  }

  /**
   * Get trades by account
   */
  async getByAccount(accountId, options = {}) {
    const {
      status = null,
      symbol = null,
      strategy = null,
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0
    } = options;

    let query = 'SELECT * FROM trades WHERE account_id = $1';
    const params = [accountId];
    let paramCount = 1;

    if (status) {
      params.push(status);
      query += ` AND status = $${++paramCount}`;
    }

    if (symbol) {
      params.push(symbol);
      query += ` AND symbol = $${++paramCount}`;
    }

    if (strategy) {
      params.push(strategy);
      query += ` AND strategy = $${++paramCount}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND entry_time >= $${++paramCount}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND entry_time <= $${++paramCount}`;
    }

    query += ' ORDER BY entry_time DESC';

    if (limit) {
      params.push(limit);
      query += ` LIMIT $${++paramCount}`;
    }

    if (offset) {
      params.push(offset);
      query += ` OFFSET $${++paramCount}`;
    }

    const result = await db.query(query, params);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Get open trades
   */
  async getOpen(accountId, symbol = null) {
    const cacheKey = `open_trades:${accountId}:${symbol || 'all'}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let query = `
      SELECT * FROM trades
      WHERE account_id = $1 AND status = 'open'
    `;
    const params = [accountId];

    if (symbol) {
      query += ' AND symbol = $2';
      params.push(symbol);
    }

    query += ' ORDER BY entry_time DESC';

    const result = await db.query(query, params);
    const trades = result.rows.map(row => this.mapRow(row));

    this.setCache(cacheKey, trades);
    return trades;
  }

  /**
   * Get trade statistics
   */
  async getStatistics(accountId, options = {}) {
    const {
      strategy = null,
      symbol = null,
      startDate = null,
      endDate = null
    } = options;

    let query = `
      SELECT
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE status = 'closed') as closed_trades,
        COUNT(*) FILTER (WHERE status = 'open') as open_trades,
        COUNT(*) FILTER (WHERE pnl > 0) as winning_trades,
        COUNT(*) FILTER (WHERE pnl < 0) as losing_trades,
        COUNT(*) FILTER (WHERE pnl = 0) as breakeven_trades,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(SUM(pnl) FILTER (WHERE pnl > 0), 0) as total_profit,
        COALESCE(SUM(ABS(pnl)) FILTER (WHERE pnl < 0), 0) as total_loss,
        COALESCE(AVG(pnl), 0) as avg_pnl,
        COALESCE(AVG(pnl_percent), 0) as avg_pnl_percent,
        COALESCE(MAX(pnl), 0) as max_profit,
        COALESCE(MIN(pnl), 0) as max_loss,
        COALESCE(SUM(fees), 0) as total_fees,
        COALESCE(AVG(EXTRACT(EPOCH FROM (exit_time - entry_time))), 0) as avg_hold_time_seconds
      FROM trades
      WHERE account_id = $1
    `;

    const params = [accountId];
    let paramCount = 1;

    if (strategy) {
      params.push(strategy);
      query += ` AND strategy = $${++paramCount}`;
    }

    if (symbol) {
      params.push(symbol);
      query += ` AND symbol = $${++paramCount}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND entry_time >= $${++paramCount}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND entry_time <= $${++paramCount}`;
    }

    const result = await db.query(query, params);
    const stats = result.rows[0];

    // Calculate derived metrics
    const winRate = stats.closed_trades > 0
      ? (parseInt(stats.winning_trades) / parseInt(stats.closed_trades)) * 100
      : 0;

    const profitFactor = parseFloat(stats.total_loss) > 0
      ? parseFloat(stats.total_profit) / parseFloat(stats.total_loss)
      : parseFloat(stats.total_profit) > 0 ? Infinity : 0;

    return {
      total_trades: parseInt(stats.total_trades),
      closed_trades: parseInt(stats.closed_trades),
      open_trades: parseInt(stats.open_trades),
      winning_trades: parseInt(stats.winning_trades),
      losing_trades: parseInt(stats.losing_trades),
      breakeven_trades: parseInt(stats.breakeven_trades),
      win_rate: winRate,
      total_pnl: parseFloat(stats.total_pnl),
      total_profit: parseFloat(stats.total_profit),
      total_loss: parseFloat(stats.total_loss),
      profit_factor: profitFactor,
      avg_pnl: parseFloat(stats.avg_pnl),
      avg_pnl_percent: parseFloat(stats.avg_pnl_percent),
      max_profit: parseFloat(stats.max_profit),
      max_loss: parseFloat(stats.max_loss),
      total_fees: parseFloat(stats.total_fees),
      avg_hold_time_seconds: parseFloat(stats.avg_hold_time_seconds)
    };
  }

  /**
   * Get daily P&L
   */
  async getDailyPnL(accountId, startDate, endDate) {
    const query = `
      SELECT
        DATE(entry_time) as date,
        COUNT(*) as trades,
        SUM(pnl) as pnl,
        SUM(fees) as fees
      FROM trades
      WHERE account_id = $1
        AND entry_time >= $2
        AND entry_time <= $3
        AND status = 'closed'
      GROUP BY DATE(entry_time)
      ORDER BY date DESC
    `;

    const result = await db.query(query, [accountId, startDate, endDate]);
    return result.rows.map(row => ({
      date: row.date,
      trades: parseInt(row.trades),
      pnl: parseFloat(row.pnl),
      fees: parseFloat(row.fees)
    }));
  }

  /**
   * Validation
   */
  validateTrade(trade) {
    if (!trade.account_id) throw new Error('account_id is required');
    if (!trade.symbol) throw new Error('symbol is required');
    if (!trade.side) throw new Error('side is required');
    if (!trade.quantity || trade.quantity <= 0) throw new Error('quantity must be > 0');
    if (!trade.entry_price || trade.entry_price <= 0) throw new Error('entry_price must be > 0');
    if (!trade.entry_time) throw new Error('entry_time is required');
    if (!trade.strategy) throw new Error('strategy is required');
  }

  /**
   * Cache management
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const age = Date.now() - cached.timestamp;
    if (age > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  clearCache() {
    this.cache.clear();
  }

  /**
   * Map database row to trade object
   */
  mapRow(row) {
    return {
      id: row.id,
      account_id: row.account_id,
      order_id: row.order_id,
      symbol: row.symbol,
      side: row.side,
      quantity: parseFloat(row.quantity),
      entry_price: parseFloat(row.entry_price),
      exit_price: row.exit_price ? parseFloat(row.exit_price) : null,
      entry_time: row.entry_time,
      exit_time: row.exit_time,
      pnl: parseFloat(row.pnl),
      pnl_percent: parseFloat(row.pnl_percent),
      fees: parseFloat(row.fees),
      strategy: row.strategy,
      signal_id: row.signal_id,
      status: row.status,
      stop_loss: row.stop_loss ? parseFloat(row.stop_loss) : null,
      take_profit: row.take_profit ? parseFloat(row.take_profit) : null,
      exit_reason: row.exit_reason,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

// Singleton instance
module.exports = new TradeRepository();
