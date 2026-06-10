// Forex bot module manifest (RFC #46) — plain data consumed by
// shared/module-loader.js. Every `from` chain and stub value is a VERBATIM
// transcription of the inline chains that occupied unified-forex-bot.js
// lines ~13-166. Resolution outcomes must not change (golden parity test:
// shared/__tests__/module-loader.test.js). See crypto-modules.manifest.js
// for the layout-reality notes; the same asymmetries apply.

'use strict';

module.exports = {
    bot: 'forex',
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
                        BOT_COMPONENTS: { forex: { components: ['trend', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'macd', 'mtfConfluence'] } },
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
                    picks: { autoOptimize: 'optimize', autoEvaluateStrategies: 'evaluateStrategies', AUTO_PARAM_BOUNDS: 'PARAM_BOUNDS' },
                    stubs: { autoOptimize: () => ({ improved: false }), autoEvaluateStrategies: () => ({}), AUTO_PARAM_BOUNDS: {} },
                },
            ],
            onChainFail: [{
                name: 'auto-optimizer-local',
                from: ['./auto-optimizer'],
                picks: { autoOptimize: 'optimize', autoEvaluateStrategies: 'evaluateStrategies', AUTO_PARAM_BOUNDS: 'PARAM_BOUNDS' },
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
                    stubs: { checkScanHealth: () => ({ healthy: true }), checkErrorRate: () => ({ healthy: true }), checkTradingHealth: () => ({ healthy: true }), checkMemoryHealth: () => ({ healthy: true }), aggregateHealth: () => ({ status: 'ok' }) },
                    note: 'an always-healthy stub here is the 06-04 incident class — must never be silent',
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
                    name: 'engine-registry-summary',
                    from: ['./signals/engine-registry-summary', '../../services/signals/engine-registry-summary'],
                    picks: { summarizeRegistry: 'summarizeRegistry', operationalStatus: 'operationalStatus', listEngineCredentials: 'listEngineCredentials' },
                    stubs: { summarizeRegistry: () => ({ total: 0, running: 0, validCreds: 0, demo: 0, openPositions: 0, lastScanAt: null, lastScanAgeSec: null }), operationalStatus: () => 'unknown', listEngineCredentials: () => [] },
                },
                { name: 'compat', from: ['./signals/compat', '../../services/signals/compat'], bind: 'sharedSignals', stub: null },
                { name: 'indicators', from: ['./signals/indicators', '../../services/signals/indicators'], bind: 'sharedIndicators', stub: null },
                { name: 'edge-stats', from: ['./signals/edge-stats', '../../services/signals/edge-stats'], bind: 'edgeStats', stub: null },
                { name: 'regime-detector', from: ['./signals/regime-detector', '../../services/signals/regime-detector'], bind: 'sharedRegimeDetector', stub: null },
                { name: 'portfolio-intelligence', from: ['./signals/portfolio-intelligence', '../../services/signals/portfolio-intelligence'], bind: 'portfolioIntelligence', stub: null },
                { name: 'event-calendar', from: ['./signals/event-calendar', '../../services/signals/event-calendar'], bind: 'eventCalendar', stub: null },
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
