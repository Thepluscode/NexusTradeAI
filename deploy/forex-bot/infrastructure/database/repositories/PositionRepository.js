/**
 * Position Repository - Production Grade
 * ======================================
 * Data access layer for positions with caching,
 * validation, and error handling
 */

const db = require('../db');

class PositionRepository {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 5000; // 5 seconds
  }

  /**
   * Create new position
   */
  async create(position) {
    // Validation
    this.validatePosition(position);

    const query = `
      INSERT INTO positions (
        account_id, symbol, side, quantity,
        entry_price, current_price, average_entry_price,
        stop_loss, take_profit, strategy, confidence,
        entry_conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const values = [
      position.account_id,
      position.symbol,
      position.side,
      position.quantity,
      position.entry_price,
      position.current_price || position.entry_price,
      position.average_entry_price || position.entry_price,
      position.stop_loss,
      position.take_profit,
      position.strategy,
      position.confidence,
      JSON.stringify(position.entry_conditions || {})
    ];

    const result = await db.query(query, values);

    // Clear cache
    this.clearCache();

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update position (price, P&L, stops)
   */
  async update(positionId, updates) {
    const allowedFields = [
      'current_price', 'stop_loss', 'take_profit',
      'trailing_stop', 'status'
    ];

    const setClause = [];
    const values = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(positionId);
    const query = `
      UPDATE positions
      SET ${setClause.join(', ')}, last_updated = NOW()
      WHERE position_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);

    if (result.rows.length === 0) {
      throw new Error(`Position not found: ${positionId}`);
    }

    // Clear cache
    this.clearCache();

    return this.mapRow(result.rows[0]);
  }

  /**
   * Close position
   */
  async close(positionId, closePrice, exitConditions = {}) {
    const query = `
      UPDATE positions
      SET
        status = 'closed',
        current_price = $1,
        closed_at = NOW(),
        exit_conditions = $2,
        last_updated = NOW()
      WHERE position_id = $3 AND status = 'open'
      RETURNING *
    `;

    const result = await db.query(query, [
      closePrice,
      JSON.stringify(exitConditions),
      positionId
    ]);

    if (result.rows.length === 0) {
      throw new Error(`Position not found or already closed: ${positionId}`);
    }

    // Clear cache
    this.clearCache();

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get active positions
   */
  async getActive(accountId = null) {
    const cacheKey = `active_${accountId || 'all'}`;

    // Check cache
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let query = `
      SELECT * FROM v_active_positions
    `;
    const params = [];

    if (accountId) {
      query += ' WHERE account_id = $1';
      params.push(accountId);
    }

    query += ' ORDER BY opened_at DESC';

    const result = await db.query(query, params);
    const positions = result.rows.map(row => this.mapRow(row));

    // Cache result
    this.setCache(cacheKey, positions);

    return positions;
  }

  /**
   * Get position by ID
   */
  async getById(positionId) {
    const query = `
      SELECT * FROM positions WHERE position_id = $1
    `;

    const result = await db.query(query, [positionId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get positions by symbol
   */
  async getBySymbol(symbol, includeC losed = false) {
    const cacheKey = `symbol_${symbol}_${includeClosed}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let query = `
      SELECT * FROM positions
      WHERE symbol = $1
    `;

    if (!includeClosed) {
      query += ` AND status = 'open'`;
    }

    query += ' ORDER BY opened_at DESC';

    const result = await db.query(query, [symbol]);
    const positions = result.rows.map(row => this.mapRow(row));

    this.setCache(cacheKey, positions);
    return positions;
  }

  /**
   * Get position statistics
   */
  async getStatistics(accountId, startDate = null, endDate = null) {
    let query = `
      SELECT
        COUNT(*) as total_positions,
        COUNT(CASE WHEN status = 'open' THEN 1 END) as open_positions,
        COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_positions,
        COUNT(CASE WHEN status = 'closed' AND total_pnl > 0 THEN 1 END) as winning_positions,
        COUNT(CASE WHEN status = 'closed' AND total_pnl < 0 THEN 1 END) as losing_positions,
        AVG(CASE WHEN status = 'closed' THEN total_pnl END) as avg_pnl,
        SUM(total_pnl) as total_pnl,
        AVG(EXTRACT(EPOCH FROM (closed_at - opened_at))/3600) as avg_hours_held
      FROM positions
      WHERE account_id = $1
    `;

    const params = [accountId];
    let paramCount = 2;

    if (startDate) {
      query += ` AND opened_at >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND opened_at <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    const result = await db.query(query, params);
    return result.rows[0];
  }

  /**
   * Bulk update trailing stops
   */
  async updateTrailingStops(updates) {
    // Build batch update query
    return await db.transaction(async (client) => {
      const results = [];

      for (const update of updates) {
        const query = `
          UPDATE positions
          SET trailing_stop = $1, last_updated = NOW()
          WHERE position_id = $2 AND status = 'open'
          RETURNING position_id, symbol, trailing_stop
        `;

        const result = await client.query(query, [
          update.trailing_stop,
          update.position_id
        ]);

        if (result.rows.length > 0) {
          results.push(result.rows[0]);
        }
      }

      this.clearCache();
      return results;
    });
  }

  /**
   * Validation
   */
  validatePosition(position) {
    const required = ['account_id', 'symbol', 'side', 'quantity', 'entry_price', 'strategy'];

    for (const field of required) {
      if (!position[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (position.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }

    if (position.entry_price <= 0) {
      throw new Error('Entry price must be positive');
    }

    if (!['long', 'short'].includes(position.side)) {
      throw new Error('Side must be long or short');
    }

    if (position.confidence && (position.confidence < 0 || position.confidence > 1)) {
      throw new Error('Confidence must be between 0 and 1');
    }
  }

  /**
   * Map database row to object
   */
  mapRow(row) {
    if (!row) return null;

    return {
      id: row.id,
      position_id: row.position_id,
      account_id: row.account_id,
      symbol: row.symbol,
      side: row.side,
      quantity: parseInt(row.quantity),
      entry_price: parseFloat(row.entry_price),
      current_price: row.current_price ? parseFloat(row.current_price) : null,
      average_entry_price: parseFloat(row.average_entry_price),
      unrealized_pnl: row.unrealized_pnl ? parseFloat(row.unrealized_pnl) : null,
      realized_pnl: row.realized_pnl ? parseFloat(row.realized_pnl) : 0,
      total_pnl: row.total_pnl ? parseFloat(row.total_pnl) : null,
      stop_loss: row.stop_loss ? parseFloat(row.stop_loss) : null,
      take_profit: row.take_profit ? parseFloat(row.take_profit) : null,
      trailing_stop: row.trailing_stop ? parseFloat(row.trailing_stop) : null,
      strategy: row.strategy,
      confidence: row.confidence ? parseFloat(row.confidence) : null,
      status: row.status,
      opened_at: row.opened_at,
      closed_at: row.closed_at,
      last_updated: row.last_updated,
      entry_conditions: row.entry_conditions || {},
      exit_conditions: row.exit_conditions || {},

      // View-specific fields
      unrealized_pnl_pct: row.unrealized_pnl_pct ? parseFloat(row.unrealized_pnl_pct) : null,
      days_held: row.days_held ? parseFloat(row.days_held) : null
    };
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
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Prevent memory leak - limit cache size
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

module.exports = new PositionRepository();
