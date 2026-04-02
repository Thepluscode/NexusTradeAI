/**
 * Prometheus Metrics - Production Grade
 * ====================================
 * Comprehensive metrics for trading bot monitoring
 */

const promClient = require('prom-client');
const express = require('express');
const memoryManager = require('../memory/MemoryManager');

class MetricsCollector {
  constructor() {
    // Enable default metrics (CPU, memory, event loop, etc.)
    promClient.collectDefaultMetrics({
      prefix: 'trading_bot_',
      gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
      timeout: 10000
    });

    this.registry = promClient.register;

    this.initializeMetrics();
  }

  /**
   * Initialize all custom metrics
   */
  initializeMetrics() {
    // ==== TRADING METRICS ====

    // Active positions
    this.activePositions = new promClient.Gauge({
      name: 'trading_bot_active_positions',
      help: 'Number of currently active positions',
      labelNames: ['strategy', 'symbol']
    });

    // Total P&L
    this.totalPnL = new promClient.Gauge({
      name: 'trading_bot_pnl_total_usd',
      help: 'Total profit/loss in USD',
      labelNames: ['account_id']
    });

    // Unrealized P&L
    this.unrealizedPnL = new promClient.Gauge({
      name: 'trading_bot_pnl_unrealized_usd',
      help: 'Unrealized profit/loss in USD',
      labelNames: ['account_id']
    });

    // Realized P&L
    this.realizedPnL = new promClient.Gauge({
      name: 'trading_bot_pnl_realized_usd',
      help: 'Realized profit/loss in USD',
      labelNames: ['account_id']
    });

    // Portfolio value
    this.portfolioValue = new promClient.Gauge({
      name: 'trading_bot_portfolio_value_usd',
      help: 'Total portfolio value in USD',
      labelNames: ['account_id']
    });

    // Win rate
    this.winRate = new promClient.Gauge({
      name: 'trading_bot_win_rate_percent',
      help: 'Percentage of winning trades',
      labelNames: ['strategy']
    });

    // Sharpe ratio
    this.sharpeRatio = new promClient.Gauge({
      name: 'trading_bot_sharpe_ratio',
      help: 'Risk-adjusted return metric',
      labelNames: ['account_id']
    });

    // Max drawdown
    this.maxDrawdown = new promClient.Gauge({
      name: 'trading_bot_max_drawdown_percent',
      help: 'Maximum drawdown percentage',
      labelNames: ['account_id']
    });

    // ==== TRADE EXECUTION METRICS ====

    // Trade counter
    this.tradesTotal = new promClient.Counter({
      name: 'trading_bot_trades_total',
      help: 'Total number of trades executed',
      labelNames: ['side', 'strategy', 'outcome']
    });

    // Trade latency
    this.tradeLatency = new promClient.Histogram({
      name: 'trading_bot_trade_latency_ms',
      help: 'Time from signal to execution in milliseconds',
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      labelNames: ['venue']
    });

    // Slippage
    this.slippage = new promClient.Histogram({
      name: 'trading_bot_slippage_bps',
      help: 'Slippage in basis points',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 25, 50],
      labelNames: ['symbol']
    });

    // Order fill rate
    this.orderFillRate = new promClient.Gauge({
      name: 'trading_bot_order_fill_rate_percent',
      help: 'Percentage of orders successfully filled',
      labelNames: ['order_type']
    });

    // ==== RISK METRICS ====

    // Position concentration
    this.positionConcentration = new promClient.Gauge({
      name: 'trading_bot_position_concentration_percent',
      help: 'Largest position as percentage of portfolio',
      labelNames: ['symbol']
    });

    // Leverage
    this.leverage = new promClient.Gauge({
      name: 'trading_bot_leverage_ratio',
      help: 'Current leverage ratio',
      labelNames: ['account_id']
    });

    // Value at Risk (VaR)
    this.valueAtRisk = new promClient.Gauge({
      name: 'trading_bot_var_95_usd',
      help: '95% Value at Risk in USD',
      labelNames: ['account_id']
    });

    // Risk limit breaches
    this.riskLimitBreaches = new promClient.Counter({
      name: 'trading_bot_risk_limit_breaches_total',
      help: 'Number of risk limit breaches',
      labelNames: ['limit_type']
    });

    // ==== SYSTEM METRICS ====

    // API health
    this.apiHealth = new promClient.Gauge({
      name: 'trading_bot_api_health',
      help: 'API health status (1 = healthy, 0 = unhealthy)',
      labelNames: ['api_name']
    });

    // API latency
    this.apiLatency = new promClient.Histogram({
      name: 'trading_bot_api_latency_ms',
      help: 'API request latency in milliseconds',
      buckets: [10, 25, 50, 100, 250, 500, 1000, 2500],
      labelNames: ['api_name', 'endpoint']
    });

    // Database query duration
    this.dbQueryDuration = new promClient.Histogram({
      name: 'trading_bot_db_query_duration_ms',
      help: 'Database query duration in milliseconds',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500],
      labelNames: ['query_type']
    });

    // Error counter
    this.errors = new promClient.Counter({
      name: 'trading_bot_errors_total',
      help: 'Total number of errors',
      labelNames: ['error_type', 'severity']
    });

    // Service uptime
    this.uptime = new promClient.Gauge({
      name: 'trading_bot_uptime_seconds',
      help: 'Service uptime in seconds'
    });

    // ==== STRATEGY METRICS ====

    // Signal strength
    this.signalStrength = new promClient.Histogram({
      name: 'trading_bot_signal_strength',
      help: 'ML model signal strength distribution',
      buckets: [0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0],
      labelNames: ['strategy', 'direction']
    });

    // Strategy performance
    this.strategyReturn = new promClient.Gauge({
      name: 'trading_bot_strategy_return_percent',
      help: 'Return by strategy in percent',
      labelNames: ['strategy', 'period']
    });

    // Model accuracy
    this.modelAccuracy = new promClient.Gauge({
      name: 'trading_bot_model_accuracy_percent',
      help: 'ML model prediction accuracy',
      labelNames: ['model_name']
    });

    console.log('✅ Prometheus metrics initialized');
  }

  /**
   * Record trade execution
   */
  recordTrade(trade) {
    this.tradesTotal.inc({
      side: trade.side,
      strategy: trade.strategy,
      outcome: trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : 'neutral'
    });

    if (trade.latency) {
      this.tradeLatency.observe(
        { venue: trade.venue || 'alpaca' },
        trade.latency
      );
    }

    if (trade.slippage) {
      this.slippage.observe(
        { symbol: trade.symbol },
        Math.abs(trade.slippage * 10000) // Convert to basis points
      );
    }
  }

  /**
   * Update position metrics
   */
  updatePositions(positions) {
    // Clear previous values
    this.activePositions.reset();

    let totalUnrealized = 0;

    positions.forEach(position => {
      this.activePositions.set(
        { strategy: position.strategy, symbol: position.symbol },
        1
      );

      totalUnrealized += position.unrealized_pnl || 0;
    });

    this.unrealizedPnL.set({ account_id: 'alpaca-paper' }, totalUnrealized);
  }

  /**
   * Update performance metrics
   */
  updatePerformance(performance) {
    const accountId = performance.account_id || 'alpaca-paper';

    if (performance.total_pnl !== undefined) {
      this.totalPnL.set({ account_id: accountId }, performance.total_pnl);
    }

    if (performance.realized_pnl !== undefined) {
      this.realizedPnL.set({ account_id: accountId }, performance.realized_pnl);
    }

    if (performance.portfolio_value !== undefined) {
      this.portfolioValue.set({ account_id: accountId }, performance.portfolio_value);
    }

    if (performance.win_rate !== undefined) {
      this.winRate.set(
        { strategy: performance.strategy || 'all' },
        performance.win_rate * 100
      );
    }

    if (performance.sharpe_ratio !== undefined) {
      this.sharpeRatio.set({ account_id: accountId }, performance.sharpe_ratio);
    }

    if (performance.max_drawdown !== undefined) {
      this.maxDrawdown.set({ account_id: accountId }, Math.abs(performance.max_drawdown) * 100);
    }
  }

  /**
   * Record API call
   */
  recordAPICall(apiName, endpoint, duration, success = true) {
    this.apiLatency.observe(
      { api_name: apiName, endpoint },
      duration
    );

    this.apiHealth.set(
      { api_name: apiName },
      success ? 1 : 0
    );
  }

  /**
   * Record error
   */
  recordError(errorType, severity = 'error') {
    this.errors.inc({ error_type: errorType, severity });
  }

  /**
   * Update uptime
   */
  updateUptime() {
    this.uptime.set(process.uptime());
  }

  /**
   * Get metrics for Prometheus scraping
   */
  async getMetrics() {
    // Update memory metrics from MemoryManager
    const memoryMetrics = memoryManager.getPrometheusMetrics();
    for (const [name, value] of Object.entries(memoryMetrics)) {
      const gauge = new promClient.Gauge({ name: `trading_bot_${name}`, help: name });
      gauge.set(value);
    }

    // Update uptime
    this.updateUptime();

    // Return all metrics
    return this.registry.metrics();
  }

  /**
   * Reset all metrics (for testing)
   */
  reset() {
    this.registry.clear();
    this.initializeMetrics();
  }
}

// Singleton instance
const metrics = new MetricsCollector();

/**
 * Create Express server for Prometheus scraping
 */
function createMetricsServer(port = 9091) {
  const app = express();

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', promClient.register.contentType);
      const metricsData = await metrics.getMetrics();
      res.end(metricsData);
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  const server = app.listen(port, () => {
    console.log(`📊 Metrics server listening on port ${port}`);
    console.log(`   Metrics: http://localhost:${port}/metrics`);
    console.log(`   Health:  http://localhost:${port}/health`);
  });

  return server;
}

module.exports = {
  metrics,
  createMetricsServer
};
