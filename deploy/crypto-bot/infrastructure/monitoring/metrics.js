// Stub — local development only
// Provides no-op implementations of the metrics interface used by the trading bots.
//
// Methods called by stock bot:
//   metrics.updatePositions(positionsArray)
//   metrics.updatePerformance({ winRate, profitFactor, totalTrades, dailyPnL })
//   metrics.getMetrics()           — async, returns Prometheus-format text
//   metrics.recordError(type, severity)
//
// Methods called by forex bot:
//   metrics.tradingMetrics          — optional object, guarded with `if (metrics.tradingMetrics)`
//   metrics.tradingMetrics.tradesTotal?.inc({ strategy, tier })
//   metrics.getMetrics()
//
// createMetricsServer is imported in both bots but never called.

const metrics = {
    /** Optional trading metrics object (forex bot guards with `if (metrics.tradingMetrics)`). */
    tradingMetrics: null,

    /**
     * Update position snapshot.
     * @param {Array} positionsArray
     */
    updatePositions(positionsArray) {
        // no-op
    },

    /**
     * Update performance counters.
     * @param {Object} perf - { winRate, profitFactor, totalTrades, dailyPnL, ... }
     */
    updatePerformance(perf) {
        // no-op
    },

    /**
     * Record an error event.
     * @param {string} type
     * @param {string} severity
     */
    recordError(type, severity) {
        // no-op
    },

    /**
     * Return Prometheus-format metrics text.
     * @returns {Promise<string>}
     */
    async getMetrics() {
        return '# Prometheus metrics stub — no data\n';
    },
};

/**
 * Create and start a standalone Prometheus metrics HTTP server.
 * This function is imported but never called; included for completeness.
 * @param {number} port
 */
function createMetricsServer(port) {
    // no-op
}

module.exports = { metrics, createMetricsServer };
