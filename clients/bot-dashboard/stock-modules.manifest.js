// Stock bot module manifest (RFC #46) — plain data consumed by
// shared/module-loader.js. Every `from` chain and stub value is a VERBATIM
// transcription of the inline chains that occupied unified-trading-bot.js
// lines ~15-239. Resolution outcomes must not change (golden parity test:
// shared/__tests__/module-loader.test.js).
//
// NOT migrated (stays inline in the bot): the [v23.1] strategy-registry
// block — it CALLS loadAllStrategies() at load time with paired-layout
// coupling (registry + strategies must come from the SAME layout), which is
// behavior, not module binding. The loader binds modules; it doesn't run them.

'use strict';

module.exports = {
    bot: 'stock',
    groups: [
        {
            name: 'signal-analytics',
            mode: 'independent',
            entries: [{
                name: 'signal-analytics',
                from: ['./signal-analytics'],
                picks: { createSignalEndpoints: 'createSignalEndpoints' },
                stubs: { createSignalEndpoints: () => {} },
            }],
        },

        // Big block — services-layout only, one logical try: all six stay
        // stubbed in prod by design (EDGE_FINDINGS.md addendum 2026-06-04).
        // Stock's auto-optimizer picks differ from forex/crypto: plain
        // `optimize`/`evaluateStrategies` names, no PARAM_BOUNDS.
        {
            name: 'shared-block',
            mode: 'chain',
            chainFailLog: '[INIT] Signal modules not available — trying local fallbacks',
            entries: [
                {
                    name: 'api-handlers',
                    from: ['../../services/signals/api-handlers'],
                    picks: { createSignalEndpoints: 'createSignalEndpoints' },
                    stubs: {},
                },
                {
                    name: 'committee-scorer',
                    from: ['../../services/signals/committee-scorer'],
                    picks: { BOT_COMPONENTS: 'BOT_COMPONENTS', sharedCommitteeScore: 'computeCommitteeScore' },
                    stubs: {
                        BOT_COMPONENTS: { stock: { components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence'] } },
                        sharedCommitteeScore: undefined,
                    },
                },
                {
                    name: 'entry-qualifier',
                    from: ['../../services/signals/entry-qualifier'],
                    picks: { qualifyEntry: 'qualifyEntry' },
                    stubs: { qualifyEntry: () => ({ qualified: true, reason: 'no-qualifier', ev: 0, allocationFactor: 1.0 }) },
                    note: 'prod stub deliberate — EDGE_FINDINGS 2026-06-04 (no discriminative power)',
                },
                {
                    name: 'confidence-calibrator',
                    from: ['../../services/signals/confidence-calibrator'],
                    picks: { calibrateConfidence: 'calibrateConfidence', fitPlattScaling: 'fitPlattScaling' },
                    stubs: { calibrateConfidence: (raw) => raw, fitPlattScaling: () => null },
                },
                {
                    name: 'exit-manager',
                    from: ['../../services/signals/exit-manager'],
                    picks: {
                        computeCorrelationGuard: 'computeCorrelationGuard',
                        computePortfolioHeat: 'computePortfolioHeat',
                        computeEquityCurveMultiplier: 'computeEquityCurveMultiplier',
                    },
                    stubs: {
                        computeCorrelationGuard: () => ({ blocked: false }),
                        computePortfolioHeat: () => ({ heat: 0, canOpen: true }),
                        computeEquityCurveMultiplier: () => ({ multiplier: 1.0, aboveMA: true }),
                    },
                },
                {
                    name: 'auto-optimizer',
                    from: ['../../services/signals/auto-optimizer'],
                    picks: { optimize: 'optimize', evaluateStrategies: 'evaluateStrategies' },
                    stubs: { optimize: () => ({ improved: false }), evaluateStrategies: () => ({}) },
                },
            ],
            onChainFail: [{
                name: 'auto-optimizer-local',
                from: ['./auto-optimizer'],
                picks: { optimize: 'optimize', evaluateStrategies: 'evaluateStrategies' },
                stubs: {},
            }],
        },

        {
            name: 'local-first',
            mode: 'independent',
            entries: [
                {
                    name: 'health-monitor',
                    from: ['./signals/health-monitor', '../../services/signals/health-monitor'],
                    picks: { checkScanHealth: 'checkScanHealth', checkErrorRate: 'checkErrorRate', checkTradingHealth: 'checkTradingHealth', checkMemoryHealth: 'checkMemoryHealth', aggregateHealth: 'aggregateHealth' },
                    // Stock's original fallbacks are FUNCTIONAL local implementations
                    // (not always-healthy no-ops) — transcribed verbatim.
                    stubs: {
                        checkScanHealth: (lastScanAt, intervalMs) => {
                            const elapsed = Date.now() - (lastScanAt || 0);
                            return { healthy: elapsed < intervalMs * 3, lastScanMs: elapsed, threshold: intervalMs * 3 };
                        },
                        checkErrorRate: (errors) => {
                            const recent = (errors || []).filter(e => Date.now() - e.timestamp < 300000);
                            return { healthy: recent.length < 10, recentErrors: recent.length, window: '5m' };
                        },
                        checkTradingHealth: (opts) => {
                            return { healthy: true, positions: opts?.positionCount || 0, tradesToday: opts?.tradesToday || 0 };
                        },
                        checkMemoryHealth: () => {
                            const mem = process.memoryUsage();
                            const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
                            return { healthy: heapMB < 512, heapUsedMB: heapMB, rss: Math.round(mem.rss / 1024 / 1024) };
                        },
                        aggregateHealth: (checks) => {
                            const allHealthy = Object.values(checks).every(c => c.healthy !== false);
                            return { status: allHealthy ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() };
                        },
                    },
                },
                {
                    name: 'health-pnl',
                    from: ['./signals/health-pnl', '../../services/signals/health-pnl'],
                    picks: { getPnlSummary: 'getPnlSummary' },
                    stubs: { getPnlSummary: async () => ({ available: false, error: 'health-pnl module not loaded', pnlToday: 0, pnlTotal: 0, tradesToday: 0, tradesTotal: 0, winnersTotal: 0, losersTotal: 0, winRatePct: null, openPositions: 0 }) },
                },
                {
                    name: 'kill-switch',
                    from: ['./signals/kill-switch', '../../services/signals/kill-switch'],
                    picks: { createKillSwitchGate: 'createKillSwitchGate' },
                    stubs: { createKillSwitchGate: () => ({ isKilled: async () => null, refresh: async () => {} }) },
                    note: 'fallback gate never blocks — a load failure cannot halt trading (Rule 9)',
                },
                {
                    name: 'order-intent',
                    from: ['./signals/order-intent', '../../services/signals/order-intent'],
                    picks: { computeOrderIntentId: 'computeOrderIntentId' },
                    stubs: { computeOrderIntentId: () => null },
                    note: 'idempotency keys for broker orders; stub returns null and call sites omit the field (Rule 9)',
                },
                {
                    name: 'engine-registry-summary',
                    from: ['./signals/engine-registry-summary', '../../services/signals/engine-registry-summary'],
                    picks: { summarizeRegistry: 'summarizeRegistry', operationalStatus: 'operationalStatus', listEngineCredentials: 'listEngineCredentials' },
                    stubs: { summarizeRegistry: () => ({ total: 0, running: 0, validCreds: 0, demo: 0, openPositions: 0, lastScanAt: null, lastScanAgeSec: null }), operationalStatus: () => 'unknown', listEngineCredentials: () => [] },
                },
                { name: 'compat', from: ['./signals/compat', '../../services/signals/compat'], bind: 'sharedSignals', stub: null },
                { name: 'indicators', from: ['./signals/indicators', '../../services/signals/indicators'], bind: 'sharedIndicators', stub: null },
                { name: 'regime-detector', from: ['./signals/regime-detector', '../../services/signals/regime-detector'], bind: 'sharedRegimeDetector', stub: null },
                { name: 'portfolio-intelligence', from: ['./signals/portfolio-intelligence', '../../services/signals/portfolio-intelligence'], bind: 'portfolioIntelligence', stub: null },
                { name: 'event-calendar', from: ['./signals/event-calendar', '../../services/signals/event-calendar'], bind: 'eventCalendar', stub: null },
                { name: 'cross-asset', from: ['./signals/cross-asset', '../../services/signals/cross-asset'], bind: 'crossAssetModule', stub: null },
                { name: 'microstructure', from: ['./signals/microstructure', '../../services/signals/microstructure'], bind: 'microstructureModule', stub: null },
                { name: 'liquidity-sweep', from: ['./signals/liquidity-sweep', '../../services/signals/liquidity-sweep'], bind: 'liquiditySweepModule', stub: null },
            ],
        },

        // Stock-only, services-layout-only chains (resolve in dev, undefined in prod —
        // both originals log and leave the binding undefined on failure).
        {
            name: 'stock-extras',
            mode: 'independent',
            entries: [
                {
                    name: 'signal-schema',
                    from: ['../../services/signals/schema'],
                    picks: { initSignalSchema: 'initSignalSchema' },
                    stubs: { initSignalSchema: undefined },
                },
                {
                    name: 'vwap-reversal-strategy',
                    from: ['../../services/signals/strategies/stock-vwap-reversal'],
                    bind: 'vwapReversalStrategy',
                    // no stub — binding stays undefined on failure, as in the original
                },
            ],
        },

        // Services-layout only — prod always uses the inline Kelly fallback.
        {
            name: 'trading',
            mode: 'independent',
            entries: [{
                name: 'monte-carlo-sizer',
                from: ['../../services/trading/monte-carlo-sizer'],
                bind: 'MonteCarloSizer',
                stub: class MonteCarloSizer {
                    constructor() { this.tradeReturns = []; this.lastOptimization = null; }
                    addTrade(r) { this.tradeReturns.push(r); if (this.tradeReturns.length > 500) this.tradeReturns.shift(); }
                    optimize() {
                        if (this.tradeReturns.length < 20) return { optimalFraction: 0.02, halfKelly: 0.01, medianReturn: 0, confidence: 'low' };
                        const wins = this.tradeReturns.filter(r => r > 0);
                        const losses = this.tradeReturns.filter(r => r <= 0);
                        const winRate = wins.length / this.tradeReturns.length;
                        const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
                        const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 1;
                        const kelly = avgLoss > 0 ? Math.max(0, (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin) : 0.01;
                        const halfKelly = Math.min(Math.max(kelly / 2, 0.005), 0.125);
                        this.lastOptimization = { optimalFraction: kelly, halfKelly, medianReturn: 0, confidence: this.tradeReturns.length >= 50 ? 'high' : 'medium' };
                        return this.lastOptimization;
                    }
                },
                note: 'prod uses inline Kelly fallback by design (module not in deploy sync)',
            }],
        },
    ],
};
