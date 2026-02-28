/**
 * Performance Repository - Production Grade
 * ==========================================
 * Manages performance metrics and analytics
 */

const db = require('../db');

class PerformanceRepository {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 120000; // 2 minute cache (performance data doesn't change rapidly)
  }

  /**
   * Record performance snapshot
   */
  async create(metrics) {
    this.validateMetrics(metrics);

    const query = `
      INSERT INTO performance_metrics (
        account_id,
        period_start,
        period_end,
        total_pnl,
        realized_pnl,
        unrealized_pnl,
        total_return_percent,
        total_trades,
        winning_trades,
        losing_trades,
        win_rate,
        profit_factor,
        sharpe_ratio,
        max_drawdown,
        max_drawdown_percent,
        avg_win,
        avg_loss,
        largest_win,
        largest_loss,
        avg_hold_time_minutes,
        total_fees,
        net_pnl,
        equity_curve,
        drawdown_curve,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *
    `;

    const values = [
      metrics.account_id,
      metrics.period_start,
      metrics.period_end,
      metrics.total_pnl,
      metrics.realized_pnl || 0,
      metrics.unrealized_pnl || 0,
      metrics.total_return_percent || 0,
      metrics.total_trades || 0,
      metrics.winning_trades || 0,
      metrics.losing_trades || 0,
      metrics.win_rate || 0,
      metrics.profit_factor || 0,
      metrics.sharpe_ratio || 0,
      metrics.max_drawdown || 0,
      metrics.max_drawdown_percent || 0,
      metrics.avg_win || 0,
      metrics.avg_loss || 0,
      metrics.largest_win || 0,
      metrics.largest_loss || 0,
      metrics.avg_hold_time_minutes || 0,
      metrics.total_fees || 0,
      metrics.net_pnl || 0,
      metrics.equity_curve ? JSON.stringify(metrics.equity_curve) : null,
      metrics.drawdown_curve ? JSON.stringify(metrics.drawdown_curve) : null,
      metrics.metadata ? JSON.stringify(metrics.metadata) : null
    ];

    const result = await db.query(query, values);
    this.clearCache();

    return this.mapRow(result.rows[0]);
  }

  /**
   * Get latest performance snapshot
   */
  async getLatest(accountId) {
    const cacheKey = `latest_performance:${accountId}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const query = `
      SELECT * FROM performance_metrics
      WHERE account_id = $1
      ORDER BY period_end DESC
      LIMIT 1
    `;

    const result = await db.query(query, [accountId]);

    if (result.rows.length === 0) {
      return null;
    }

    const metrics = this.mapRow(result.rows[0]);
    this.setCache(cacheKey, metrics);
    return metrics;
  }

  /**
   * Get performance history
   */
  async getHistory(accountId, options = {}) {
    const {
      startDate = null,
      endDate = null,
      limit = 100,
      offset = 0
    } = options;

    let query = 'SELECT * FROM performance_metrics WHERE account_id = $1';
    const params = [accountId];
    let paramCount = 1;

    if (startDate) {
      params.push(startDate);
      query += ` AND period_end >= $${++paramCount}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND period_end <= $${++paramCount}`;
    }

    query += ' ORDER BY period_end DESC';

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
   * Calculate real-time performance from trades
   */
  async calculateFromTrades(accountId, periodStart, periodEnd) {
    const query = `
      WITH trade_stats AS (
        SELECT
          COUNT(*) as total_trades,
          COUNT(*) FILTER (WHERE pnl > 0) as winning_trades,
          COUNT(*) FILTER (WHERE pnl < 0) as losing_trades,
          COALESCE(SUM(pnl), 0) as total_pnl,
          COALESCE(SUM(pnl) FILTER (WHERE status = 'closed'), 0) as realized_pnl,
          COALESCE(SUM(pnl) FILTER (WHERE status = 'open'), 0) as unrealized_pnl,
          COALESCE(AVG(pnl) FILTER (WHERE pnl > 0), 0) as avg_win,
          COALESCE(AVG(ABS(pnl)) FILTER (WHERE pnl < 0), 0) as avg_loss,
          COALESCE(MAX(pnl), 0) as largest_win,
          COALESCE(MIN(pnl), 0) as largest_loss,
          COALESCE(SUM(fees), 0) as total_fees,
          COALESCE(AVG(EXTRACT(EPOCH FROM (exit_time - entry_time)) / 60), 0) as avg_hold_time_minutes,
          COALESCE(SUM(pnl) FILTER (WHERE pnl > 0), 0) as total_profit,
          COALESCE(SUM(ABS(pnl)) FILTER (WHERE pnl < 0), 0) as total_loss
        FROM trades
        WHERE account_id = $1
          AND entry_time >= $2
          AND entry_time <= $3
      ),
      returns AS (
        SELECT
          entry_time::date as date,
          SUM(pnl) as daily_pnl
        FROM trades
        WHERE account_id = $1
          AND entry_time >= $2
          AND entry_time <= $3
          AND status = 'closed'
        GROUP BY entry_time::date
        ORDER BY date
      )
      SELECT
        ts.*,
        CASE
          WHEN ts.total_loss > 0 THEN ts.total_profit / ts.total_loss
          WHEN ts.total_profit > 0 THEN 999.99
          ELSE 0
        END as profit_factor,
        CASE
          WHEN ts.total_trades > 0 THEN (ts.winning_trades::float / ts.total_trades::float * 100)
          ELSE 0
        END as win_rate,
        json_agg(json_build_object('date', r.date, 'pnl', r.daily_pnl) ORDER BY r.date) as equity_curve
      FROM trade_stats ts
      LEFT JOIN returns r ON true
      GROUP BY ts.total_trades, ts.winning_trades, ts.losing_trades, ts.total_pnl,
               ts.realized_pnl, ts.unrealized_pnl, ts.avg_win, ts.avg_loss,
               ts.largest_win, ts.largest_loss, ts.total_fees, ts.avg_hold_time_minutes,
               ts.total_profit, ts.total_loss
    `;

    const result = await db.query(query, [accountId, periodStart, periodEnd]);

    if (result.rows.length === 0) {
      return this.getEmptyMetrics(accountId, periodStart, periodEnd);
    }

    const data = result.rows[0];

    // Calculate Sharpe ratio from returns
    const equityCurve = data.equity_curve || [];
    const returns = equityCurve.map(e => parseFloat(e.pnl));
    const sharpeRatio = this.calculateSharpeRatio(returns);

    // Calculate max drawdown from equity curve
    const { maxDrawdown, maxDrawdownPercent } = this.calculateMaxDrawdown(equityCurve);

    return {
      account_id: accountId,
      period_start: periodStart,
      period_end: periodEnd,
      total_pnl: parseFloat(data.total_pnl),
      realized_pnl: parseFloat(data.realized_pnl),
      unrealized_pnl: parseFloat(data.unrealized_pnl),
      total_return_percent: 0, // Would need initial capital to calculate
      total_trades: parseInt(data.total_trades),
      winning_trades: parseInt(data.winning_trades),
      losing_trades: parseInt(data.losing_trades),
      win_rate: parseFloat(data.win_rate),
      profit_factor: parseFloat(data.profit_factor),
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      max_drawdown_percent: maxDrawdownPercent,
      avg_win: parseFloat(data.avg_win),
      avg_loss: parseFloat(data.avg_loss),
      largest_win: parseFloat(data.largest_win),
      largest_loss: parseFloat(data.largest_loss),
      avg_hold_time_minutes: parseFloat(data.avg_hold_time_minutes),
      total_fees: parseFloat(data.total_fees),
      net_pnl: parseFloat(data.total_pnl) - parseFloat(data.total_fees),
      equity_curve: equityCurve
    };
  }

  /**
   * Get strategy comparison
   */
  async getStrategyComparison(accountId, periodStart, periodEnd) {
    const query = `
      SELECT
        strategy,
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE pnl > 0) as winning_trades,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        MAX(pnl) as max_win,
        MIN(pnl) as max_loss,
        SUM(fees) as total_fees,
        (COUNT(*) FILTER (WHERE pnl > 0)::float / COUNT(*)::float * 100) as win_rate
      FROM trades
      WHERE account_id = $1
        AND entry_time >= $2
        AND entry_time <= $3
        AND status = 'closed'
      GROUP BY strategy
      ORDER BY total_pnl DESC
    `;

    const result = await db.query(query, [accountId, periodStart, periodEnd]);

    return result.rows.map(row => ({
      strategy: row.strategy,
      total_trades: parseInt(row.total_trades),
      winning_trades: parseInt(row.winning_trades),
      total_pnl: parseFloat(row.total_pnl),
      avg_pnl: parseFloat(row.avg_pnl),
      max_win: parseFloat(row.max_win),
      max_loss: parseFloat(row.max_loss),
      total_fees: parseFloat(row.total_fees),
      win_rate: parseFloat(row.win_rate) || 0
    }));
  }

  /**
   * Calculate Sharpe ratio
   */
  calculateSharpeRatio(returns) {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // Annualized Sharpe (assuming daily returns, risk-free rate = 0)
    return (mean / stdDev) * Math.sqrt(252);
  }

  /**
   * Calculate max drawdown
   */
  calculateMaxDrawdown(equityCurve) {
    if (equityCurve.length === 0) {
      return { maxDrawdown: 0, maxDrawdownPercent: 0 };
    }

    let peak = 0;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;
    let cumulativePnl = 0;

    for (const point of equityCurve) {
      cumulativePnl += parseFloat(point.pnl);

      if (cumulativePnl > peak) {
        peak = cumulativePnl;
      }

      const drawdown = peak - cumulativePnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = peak > 0 ? (drawdown / peak) * 100 : 0;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  /**
   * Get empty metrics template
   */
  getEmptyMetrics(accountId, periodStart, periodEnd) {
    return {
      account_id: accountId,
      period_start: periodStart,
      period_end: periodEnd,
      total_pnl: 0,
      realized_pnl: 0,
      unrealized_pnl: 0,
      total_return_percent: 0,
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      profit_factor: 0,
      sharpe_ratio: 0,
      max_drawdown: 0,
      max_drawdown_percent: 0,
      avg_win: 0,
      avg_loss: 0,
      largest_win: 0,
      largest_loss: 0,
      avg_hold_time_minutes: 0,
      total_fees: 0,
      net_pnl: 0,
      equity_curve: [],
      drawdown_curve: []
    };
  }

  /**
   * Validation
   */
  validateMetrics(metrics) {
    if (!metrics.account_id) throw new Error('account_id is required');
    if (!metrics.period_start) throw new Error('period_start is required');
    if (!metrics.period_end) throw new Error('period_end is required');
    if (metrics.total_pnl === undefined) throw new Error('total_pnl is required');
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
   * Map database row to performance object
   */
  mapRow(row) {
    return {
      id: row.id,
      account_id: row.account_id,
      period_start: row.period_start,
      period_end: row.period_end,
      total_pnl: parseFloat(row.total_pnl),
      realized_pnl: parseFloat(row.realized_pnl),
      unrealized_pnl: parseFloat(row.unrealized_pnl),
      total_return_percent: parseFloat(row.total_return_percent),
      total_trades: parseInt(row.total_trades),
      winning_trades: parseInt(row.winning_trades),
      losing_trades: parseInt(row.losing_trades),
      win_rate: parseFloat(row.win_rate),
      profit_factor: parseFloat(row.profit_factor),
      sharpe_ratio: parseFloat(row.sharpe_ratio),
      max_drawdown: parseFloat(row.max_drawdown),
      max_drawdown_percent: parseFloat(row.max_drawdown_percent),
      avg_win: parseFloat(row.avg_win),
      avg_loss: parseFloat(row.avg_loss),
      largest_win: parseFloat(row.largest_win),
      largest_loss: parseFloat(row.largest_loss),
      avg_hold_time_minutes: parseFloat(row.avg_hold_time_minutes),
      total_fees: parseFloat(row.total_fees),
      net_pnl: parseFloat(row.net_pnl),
      equity_curve: row.equity_curve,
      drawdown_curve: row.drawdown_curve,
      metadata: row.metadata,
      created_at: row.created_at
    };
  }
}

// Singleton instance
module.exports = new PerformanceRepository();
