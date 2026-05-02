const {
    buildOpsStatus,
    createLatencyRecorder,
} = require('../ops-status');

describe('ops status', () => {
    test('reports stale scan as unhealthy with age and threshold', () => {
        const status = buildOpsStatus({
            bot: 'stock',
            now: 1_000_000,
            lastScanAt: 700_000,
            scanThresholdMs: 180_000,
            isRunning: true,
            isPaused: false,
        });

        expect(status.bot).toBe('stock');
        expect(status.scan).toMatchObject({
            healthy: false,
            ageMs: 300_000,
            thresholdMs: 180_000,
        });
        expect(status.overall).toBe('degraded');
    });

    test('includes strategy disabled reasons and trade rejection counts', () => {
        const status = buildOpsStatus({
            bot: 'crypto',
            now: 1_000_000,
            lastScanAt: 990_000,
            scanThresholdMs: 180_000,
            isRunning: true,
            strategies: [
                { name: 'momentum', enabled: true },
                { name: 'trend_pullback', enabled: false, reason: 'poor live win rate' },
            ],
            tradeRejections: {
                cooldown: 3,
                daily_limit: 1,
            },
        });

        expect(status.strategies.disabled).toEqual([
            { name: 'trend_pullback', reason: 'poor live win rate' },
        ]);
        expect(status.tradeRejections).toEqual({ cooldown: 3, daily_limit: 1 });
    });

    test('reports DB and bridge dependency health', () => {
        const status = buildOpsStatus({
            bot: 'stock',
            now: 1_000_000,
            lastScanAt: 990_000,
            scanThresholdMs: 180_000,
            db: { healthy: false, error: 'connection refused' },
            bridge: { healthy: false, latencyMs: 1200, errorRate: 0.25 },
        });

        expect(status.dependencies.db).toEqual({ healthy: false, error: 'connection refused' });
        expect(status.dependencies.bridge).toEqual({ healthy: false, latencyMs: 1200, errorRate: 0.25 });
        expect(status.overall).toBe('degraded');
    });

    test('latency recorder tracks count, average latency, and error rate', () => {
        const recorder = createLatencyRecorder();

        recorder.record({ latencyMs: 100, ok: true });
        recorder.record({ latencyMs: 300, ok: false });

        expect(recorder.snapshot()).toEqual({
            count: 2,
            avgLatencyMs: 200,
            errorRate: 0.5,
        });
    });
});
