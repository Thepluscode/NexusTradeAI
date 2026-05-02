function buildOpsStatus({
    bot,
    now = Date.now(),
    lastScanAt = null,
    scanThresholdMs = 180000,
    isRunning = false,
    isPaused = false,
    strategies = [],
    tradeRejections = {},
    db = { healthy: true },
    bridge = { healthy: true },
    queue = { healthy: true },
    extra = {},
}) {
    const ageMs = lastScanAt ? Math.max(0, now - lastScanAt) : null;
    const scanHealthy = !isRunning || (ageMs !== null && ageMs <= scanThresholdMs);
    const disabled = strategies
        .filter(strategy => strategy && strategy.enabled === false)
        .map(strategy => ({ name: strategy.name, reason: strategy.reason || 'not specified' }));
    const dependencies = { db, bridge, queue };
    const dependencyHealthy = Object.values(dependencies).every(dep => dep && dep.healthy !== false);
    const overall = scanHealthy && dependencyHealthy ? 'ok' : 'degraded';

    return {
        bot,
        overall,
        timestamp: new Date(now).toISOString(),
        runtime: {
            isRunning,
            isPaused,
        },
        scan: {
            healthy: scanHealthy,
            lastScanAt: lastScanAt ? new Date(lastScanAt).toISOString() : null,
            ageMs,
            thresholdMs: scanThresholdMs,
        },
        strategies: {
            total: strategies.length,
            enabled: strategies.filter(strategy => strategy && strategy.enabled !== false).map(strategy => strategy.name),
            disabled,
        },
        tradeRejections,
        dependencies,
        extra,
    };
}

function createLatencyRecorder() {
    const records = [];
    return {
        record({ latencyMs, ok }) {
            records.push({ latencyMs: Number(latencyMs) || 0, ok: ok !== false });
        },
        snapshot() {
            if (records.length === 0) {
                return { count: 0, avgLatencyMs: 0, errorRate: 0 };
            }
            const totalLatency = records.reduce((sum, record) => sum + record.latencyMs, 0);
            const errors = records.filter(record => !record.ok).length;
            return {
                count: records.length,
                avgLatencyMs: Math.round(totalLatency / records.length),
                errorRate: errors / records.length,
            };
        },
    };
}

module.exports = {
    buildOpsStatus,
    createLatencyRecorder,
};
