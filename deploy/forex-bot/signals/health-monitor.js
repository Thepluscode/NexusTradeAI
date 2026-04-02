/**
 * Health Monitor — self-monitoring utilities for trading bots.
 *
 * Detects: stalled scan loops, excessive errors, memory leaks,
 * degraded performance, and anomalous trading patterns.
 *
 * Pure functions — no side effects. Callers decide what to do with results.
 */

/**
 * Check if the scan loop has stalled.
 * @param {number} lastScanTime - timestamp of last completed scan
 * @param {number} expectedIntervalMs - expected scan interval (e.g., 60000)
 * @param {number} toleranceMultiplier - how many intervals before "stalled" (default: 3)
 * @returns {{ healthy: bool, stalledMs: number, reason: string }}
 */
function checkScanHealth(lastScanTime, expectedIntervalMs = 60000, toleranceMultiplier = 3) {
  if (!lastScanTime) {
    return { healthy: false, stalledMs: Infinity, reason: 'No scan recorded yet' };
  }
  const elapsed = Date.now() - lastScanTime;
  const threshold = expectedIntervalMs * toleranceMultiplier;
  const healthy = elapsed < threshold;
  return {
    healthy,
    stalledMs: elapsed,
    stalledMinutes: Math.round(elapsed / 60000 * 10) / 10,
    threshold,
    reason: healthy ? 'Scan loop running normally' : `Scan stalled for ${Math.round(elapsed / 60000)} minutes (threshold: ${Math.round(threshold / 60000)} min)`,
  };
}

/**
 * Check error rate over recent period.
 * @param {Array<{timestamp: number, error: string}>} errors - recent errors
 * @param {number} windowMs - time window to check (default: 15 min)
 * @param {number} maxErrors - max errors before unhealthy (default: 10)
 * @returns {{ healthy: bool, errorCount: number, errorRate: number, reason: string }}
 */
function checkErrorRate(errors, windowMs = 15 * 60 * 1000, maxErrors = 10) {
  if (!errors || errors.length === 0) {
    return { healthy: true, errorCount: 0, errorRate: 0, reason: 'No errors' };
  }
  const cutoff = Date.now() - windowMs;
  const recent = errors.filter(e => e.timestamp > cutoff);
  const errorRate = recent.length / (windowMs / 60000); // errors per minute
  const healthy = recent.length < maxErrors;
  return {
    healthy,
    errorCount: recent.length,
    errorRate: Math.round(errorRate * 100) / 100,
    reason: healthy ? `${recent.length} errors in ${windowMs/60000}min window` : `Error spike: ${recent.length} errors in ${windowMs/60000}min (max: ${maxErrors})`,
  };
}

/**
 * Check trading performance for anomalies.
 * @param {Object} metrics - { totalTrades, winRate, profitFactor, maxDrawdownPct, consecutiveLosses }
 * @returns {{ healthy: bool, warnings: string[], severity: 'ok'|'warning'|'critical' }}
 */
function checkTradingHealth(metrics) {
  const warnings = [];
  let severity = 'ok';

  if (!metrics) {
    return { healthy: true, warnings: ['No metrics available'], severity: 'ok' };
  }

  // Consecutive losses
  if (metrics.consecutiveLosses >= 5) {
    warnings.push(`${metrics.consecutiveLosses} consecutive losses — consider pausing`);
    severity = 'critical';
  } else if (metrics.consecutiveLosses >= 3) {
    warnings.push(`${metrics.consecutiveLosses} consecutive losses`);
    if (severity !== 'critical') severity = 'warning';
  }

  // Win rate collapse (need minimum sample)
  if (metrics.totalTrades >= 20 && metrics.winRate < 0.30) {
    warnings.push(`Win rate ${(metrics.winRate * 100).toFixed(1)}% — below 30% threshold`);
    severity = 'critical';
  } else if (metrics.totalTrades >= 20 && metrics.winRate < 0.40) {
    warnings.push(`Win rate ${(metrics.winRate * 100).toFixed(1)}% — below 40%`);
    if (severity !== 'critical') severity = 'warning';
  }

  // Drawdown
  if (metrics.maxDrawdownPct > 15) {
    warnings.push(`Max drawdown ${metrics.maxDrawdownPct.toFixed(1)}% — exceeds 15% limit`);
    severity = 'critical';
  } else if (metrics.maxDrawdownPct > 10) {
    warnings.push(`Max drawdown ${metrics.maxDrawdownPct.toFixed(1)}% — approaching limit`);
    if (severity !== 'critical') severity = 'warning';
  }

  // Profit factor
  if (metrics.totalTrades >= 20 && metrics.profitFactor < 1.0) {
    warnings.push(`Profit factor ${metrics.profitFactor.toFixed(2)} — negative expectancy`);
    if (severity !== 'critical') severity = 'critical';
  }

  return {
    healthy: severity !== 'critical',
    warnings,
    severity,
  };
}

/**
 * Check memory usage.
 * @param {number} maxHeapMB - max heap before warning (default: 512MB)
 * @returns {{ healthy: bool, heapUsedMB: number, heapTotalMB: number, reason: string }}
 */
function checkMemoryHealth(maxHeapMB = 512) {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const healthy = heapUsedMB < maxHeapMB;
  return {
    healthy,
    heapUsedMB,
    heapTotalMB,
    rssMB: Math.round(mem.rss / 1024 / 1024),
    reason: healthy ? `Heap: ${heapUsedMB}MB / ${heapTotalMB}MB` : `High memory: ${heapUsedMB}MB exceeds ${maxHeapMB}MB limit`,
  };
}

/**
 * Aggregate all health checks into a single status.
 * @param {Object} checks - { scan, errors, trading, memory }
 * @returns {{ healthy: bool, checks: Object, summary: string }}
 */
function aggregateHealth(checks) {
  const allHealthy = Object.values(checks).every(c => c && c.healthy !== false);
  const failing = Object.entries(checks)
    .filter(([, c]) => c && c.healthy === false)
    .map(([name]) => name);

  return {
    healthy: allHealthy,
    checks,
    failing,
    summary: allHealthy
      ? 'All systems healthy'
      : `Unhealthy: ${failing.join(', ')}`,
    timestamp: Date.now(),
  };
}

module.exports = {
  checkScanHealth,
  checkErrorRate,
  checkTradingHealth,
  checkMemoryHealth,
  aggregateHealth,
};
