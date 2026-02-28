/**
 * Order Repository - Production Grade
 * ====================================
 * Manages order lifecycle and execution tracking
 */

const db = require('../db');

class OrderRepository {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 30000; // 30 second cache (orders change frequently)
  }

  /**
   * Create a new order
   */
  async create(order) {
    this.validateOrder(order);

    const query = `
      INSERT INTO orders (
        account_id,
        symbol,
        side,
        type,
        quantity,
        limit_price,
        stop_price,
        time_in_force,
        status,
        filled_quantity,
        filled_avg_price,
        submitted_at,
        strategy,
        signal_id,
        parent_order_id,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      order.account_id,
      order.symbol,
      order.side,
      order.type,
      order.quantity,
      order.limit_price || null,
      order.stop_price || null,
      order.time_in_force || 'day',
      order.status || 'pending',
      order.filled_quantity || 0,
      order.filled_avg_price || null,
      order.submitted_at || new Date(),
      order.strategy,
      order.signal_id || null,
      order.parent_order_id || null,
      order.metadata ? JSON.stringify(order.metadata) : null
    ];

    const result = await db.query(query, values);
    this.clearCache();

    return this.mapRow(result.rows[0]);
  }

  /**
   * Update order status
   */
  async updateStatus(orderId, status, updates = {}) {
    const validStatuses = ['pending', 'submitted', 'partial', 'filled', 'cancelled', 'rejected', 'expired'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const fields = ['status'];
    const values = [orderId, status];
    let paramCount = 2;

    if (updates.filled_quantity !== undefined) {
      fields.push('filled_quantity');
      values.push(updates.filled_quantity);
      paramCount++;
    }

    if (updates.filled_avg_price !== undefined) {
      fields.push('filled_avg_price');
      values.push(updates.filled_avg_price);
      paramCount++;
    }

    if (updates.filled_at !== undefined) {
      fields.push('filled_at');
      values.push(updates.filled_at);
      paramCount++;
    }

    if (updates.cancelled_at !== undefined) {
      fields.push('cancelled_at');
      values.push(updates.cancelled_at);
      paramCount++;
    }

    if (updates.rejected_reason !== undefined) {
      fields.push('rejected_reason');
      values.push(updates.rejected_reason);
      paramCount++;
    }

    const setClause = fields.slice(1).map((f, i) => `${f} = $${i + 2}`).join(', ');

    const query = `
      UPDATE orders
      SET status = $2${setClause ? ', ' + setClause : ''}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.query(query, values);
    this.clearCache();

    if (result.rows.length === 0) {
      throw new Error(`Order ${orderId} not found`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get order by ID
   */
  async getById(orderId) {
    const cacheKey = `order:${orderId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await db.query(query, [orderId]);

    if (result.rows.length === 0) {
      return null;
    }

    const order = this.mapRow(result.rows[0]);
    this.setCache(cacheKey, order);
    return order;
  }

  /**
   * Get order by broker order ID
   */
  async getByBrokerOrderId(brokerOrderId) {
    const query = `
      SELECT * FROM orders
      WHERE metadata->>'broker_order_id' = $1
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const result = await db.query(query, [brokerOrderId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get orders by account
   */
  async getByAccount(accountId, options = {}) {
    const {
      status = null,
      symbol = null,
      side = null,
      strategy = null,
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0
    } = options;

    let query = 'SELECT * FROM orders WHERE account_id = $1';
    const params = [accountId];
    let paramCount = 1;

    if (status) {
      if (Array.isArray(status)) {
        params.push(status);
        query += ` AND status = ANY($${++paramCount})`;
      } else {
        params.push(status);
        query += ` AND status = $${++paramCount}`;
      }
    }

    if (symbol) {
      params.push(symbol);
      query += ` AND symbol = $${++paramCount}`;
    }

    if (side) {
      params.push(side);
      query += ` AND side = $${++paramCount}`;
    }

    if (strategy) {
      params.push(strategy);
      query += ` AND strategy = $${++paramCount}`;
    }

    if (startDate) {
      params.push(startDate);
      query += ` AND submitted_at >= $${++paramCount}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND submitted_at <= $${++paramCount}`;
    }

    query += ' ORDER BY submitted_at DESC';

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
   * Get pending orders
   */
  async getPending(accountId, symbol = null) {
    const cacheKey = `pending_orders:${accountId}:${symbol || 'all'}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    let query = `
      SELECT * FROM orders
      WHERE account_id = $1
        AND status IN ('pending', 'submitted', 'partial')
    `;
    const params = [accountId];

    if (symbol) {
      query += ' AND symbol = $2';
      params.push(symbol);
    }

    query += ' ORDER BY submitted_at DESC';

    const result = await db.query(query, params);
    const orders = result.rows.map(row => this.mapRow(row));

    this.setCache(cacheKey, orders);
    return orders;
  }

  /**
   * Get order statistics
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
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE status = 'filled') as filled_orders,
        COUNT(*) FILTER (WHERE status = 'partial') as partial_orders,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_orders,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_orders,
        COUNT(*) FILTER (WHERE status IN ('pending', 'submitted')) as pending_orders,
        COALESCE(AVG(EXTRACT(EPOCH FROM (filled_at - submitted_at))), 0) as avg_fill_time_seconds,
        COUNT(*) FILTER (WHERE side = 'buy') as buy_orders,
        COUNT(*) FILTER (WHERE side = 'sell') as sell_orders
      FROM orders
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
      query += ` AND submitted_at >= $${++paramCount}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND submitted_at <= $${++paramCount}`;
    }

    const result = await db.query(query, params);
    const stats = result.rows[0];

    const fillRate = parseInt(stats.total_orders) > 0
      ? (parseInt(stats.filled_orders) / parseInt(stats.total_orders)) * 100
      : 0;

    const rejectionRate = parseInt(stats.total_orders) > 0
      ? (parseInt(stats.rejected_orders) / parseInt(stats.total_orders)) * 100
      : 0;

    return {
      total_orders: parseInt(stats.total_orders),
      filled_orders: parseInt(stats.filled_orders),
      partial_orders: parseInt(stats.partial_orders),
      cancelled_orders: parseInt(stats.cancelled_orders),
      rejected_orders: parseInt(stats.rejected_orders),
      pending_orders: parseInt(stats.pending_orders),
      fill_rate: fillRate,
      rejection_rate: rejectionRate,
      avg_fill_time_seconds: parseFloat(stats.avg_fill_time_seconds),
      buy_orders: parseInt(stats.buy_orders),
      sell_orders: parseInt(stats.sell_orders)
    };
  }

  /**
   * Cancel order
   */
  async cancel(orderId, reason = 'user_requested') {
    const query = `
      UPDATE orders
      SET
        status = 'cancelled',
        cancelled_at = NOW(),
        rejected_reason = $2,
        updated_at = NOW()
      WHERE id = $1 AND status IN ('pending', 'submitted', 'partial')
      RETURNING *
    `;

    const result = await db.query(query, [orderId, reason]);
    this.clearCache();

    if (result.rows.length === 0) {
      throw new Error(`Order ${orderId} not found or cannot be cancelled`);
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get orders by parent (for bracket orders)
   */
  async getByParent(parentOrderId) {
    const query = `
      SELECT * FROM orders
      WHERE parent_order_id = $1
      ORDER BY created_at ASC
    `;

    const result = await db.query(query, [parentOrderId]);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Validation
   */
  validateOrder(order) {
    if (!order.account_id) throw new Error('account_id is required');
    if (!order.symbol) throw new Error('symbol is required');
    if (!order.side) throw new Error('side is required');
    if (!['buy', 'sell'].includes(order.side)) throw new Error('side must be buy or sell');
    if (!order.type) throw new Error('type is required');
    if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type)) {
      throw new Error('Invalid order type');
    }
    if (!order.quantity || order.quantity <= 0) throw new Error('quantity must be > 0');
    if (order.type === 'limit' && !order.limit_price) throw new Error('limit_price required for limit orders');
    if (['stop', 'stop_limit'].includes(order.type) && !order.stop_price) {
      throw new Error('stop_price required for stop orders');
    }
    if (!order.strategy) throw new Error('strategy is required');
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
   * Map database row to order object
   */
  mapRow(row) {
    return {
      id: row.id,
      account_id: row.account_id,
      symbol: row.symbol,
      side: row.side,
      type: row.type,
      quantity: parseFloat(row.quantity),
      limit_price: row.limit_price ? parseFloat(row.limit_price) : null,
      stop_price: row.stop_price ? parseFloat(row.stop_price) : null,
      time_in_force: row.time_in_force,
      status: row.status,
      filled_quantity: parseFloat(row.filled_quantity),
      filled_avg_price: row.filled_avg_price ? parseFloat(row.filled_avg_price) : null,
      submitted_at: row.submitted_at,
      filled_at: row.filled_at,
      cancelled_at: row.cancelled_at,
      rejected_reason: row.rejected_reason,
      strategy: row.strategy,
      signal_id: row.signal_id,
      parent_order_id: row.parent_order_id,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

// Singleton instance
module.exports = new OrderRepository();
