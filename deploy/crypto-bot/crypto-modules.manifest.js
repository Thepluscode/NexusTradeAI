// Crypto bot module manifest (RFC #46) — plain data consumed by
// shared/module-loader.js. Every `from` chain and stub value below is a
// VERBATIM transcription of the inline try/require/stub chains that used to
// occupy unified-crypto-bot.js lines ~15-210. Resolution outcomes must not
// change (golden parity test: shared/__tests__/module-loader-parity.test.js).
//
// Layout reality this encodes: Railway serves the bot from deploy/crypto-bot/
// where './signals/<X>' is synced by deploy.yml and '../../services/...' does
// NOT resolve; in dev (clients/bot-dashboard/) it's the reverse. A `from`
// chain that only lists '../../services/...' therefore resolves in dev ONLY —
// that asymmetry is deliberate where noted.

'use strict';

module.exports = {
    bot: 'crypto',
    groups: [
        // Local signal-analytics ships with the deploy dir; the shared block
        // below overwrites createSignalEndpoints when it resolves (dev).
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

        // The "big block": one logical try around six shared modules —
        // services-layout ONLY (no './signals/' candidates) so in prod ALL SIX
        // stay stubbed. DELIBERATE, evidence-backed: enabling qualifyEntry /
        // heat / calibration was evaluated and rejected (EDGE_FINDINGS.md
        // addendum 2026-06-04). De-coupling = manifest edit + new evidence.
        {
            name: 'shared-block',
            mode: 'chain',
            chainFailLog: '[INIT] Signal modules not available — trying local fallbacks',
            entries: [
                {
                    name: 'api-handlers',
                    from: ['../../services/signals/api-handlers'],
                    picks: { createSignalEndpoints: 'createSignalEndpoints' },
                    stubs: {}, // on failure, signal-analytics binding stands (original line 16-17)
                },
                {
                    name: 'committee-scorer',
                    from: ['../../services/signals/committee-scorer'],
                    picks: { BOT_COMPONENTS: 'BOT_COMPONENTS', sharedCommitteeScore: 'computeCommitteeScore' },
                    stubs: {
                        BOT_COMPONENTS: { crypto: { components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence'] } },
                        sharedCommitteeScore: undefined, // bot falls back to its inline scorer
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
                    picks: { sharedCalibrateConfidence: 'calibrateConfidence', sharedFitPlattScaling: 'fitPlattScaling' },
                    stubs: { sharedCalibrateConfidence: (raw) => raw, sharedFitPlattScaling: () => null },
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
                        computePortfolioHeat: () => ({ heat: 0, canOpen: true }),
                        computeEquityCurveMultiplier: () => ({ multiplier: 1.0, aboveMA: true }),
                        // Inline fallback guard (count-based, not correlation-based) —
                        // moved verbatim from the bot file's original lines 25-34.
                        computeCorrelationGuard: (positions) => {
                            const longs = positions.filter(p => (p.direction || 'long') === 'long').length;
                            const shorts = positions.filter(p => (p.direction || 'long') === 'short').length;
                            const total = positions.length;
                            const exposureRatio = total > 0 ? Math.max(longs, shorts) / total : 0;
                            const isConcentrated = exposureRatio > 0.75 && total >= 2;
                            const bias = longs >= shorts ? 'long' : 'short';
                            return { isConcentrated, canOpenLong: !isConcentrated || bias !== 'long', canOpenShort: !isConcentrated || bias !== 'short', exposureRatio, directionBias: bias, longCount: longs, shortCount: shorts };
                        },
                    },
                },
                {
                    name: 'auto-optimizer',
                    from: ['../../services/signals/auto-optimizer'],
                    picks: { autoOptimize: 'optimize', autoEvalStrategies: 'evaluateStrategies', AUTO_PARAM_BOUNDS: 'PARAM_BOUNDS' },
                    stubs: { autoOptimize: () => ({ improved: false }), autoEvalStrategies: () => ({}), AUTO_PARAM_BOUNDS: {} },
                },
            ],
            // [v17.1] On Railway, auto-optimizer ships alongside bot.js — the
            // original catch block's local rescue.
            onChainFail: [{
                name: 'auto-optimizer-local',
                from: ['./auto-optimizer'],
                picks: { autoOptimize: 'optimize', autoEvalStrategies: 'evaluateStrategies', AUTO_PARAM_BOUNDS: 'PARAM_BOUNDS' },
                stubs: {}, // chain entry's stubs already applied
            }],
        },

        // Local-first modules: synced into deploy/<bot>/signals/ by deploy.yml,
        // fall back to ../../services/signals/ in dev. These are what make
        // /health, /api/health/detailed and kill-switch enforcement real in prod.
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
                    name: 'account-snapshot',
                    from: ['./signals/account-snapshot', '../../services/signals/account-snapshot'],
                    picks: { buildAccountSnapshot: 'buildAccountSnapshot' },
                    stubs: { buildAccountSnapshot: () => null },
                    note: 'per-trade account-state snapshots; stub returns null and persistence omits the column value (Rule 9)',
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
                { name: 'cross-asset', from: ['./signals/cross-asset', '../../services/signals/cross-asset'], bind: 'crossAssetModule', stub: null },
                { name: 'microstructure', from: ['./signals/microstructure', '../../services/signals/microstructure'], bind: 'microstructureModule', stub: null },
                { name: 'liquidity-sweep', from: ['./signals/liquidity-sweep', '../../services/signals/liquidity-sweep'], bind: 'liquiditySweepModule', stub: null },
                {
                    name: 'normalizers',
                    from: ['./signals/normalizers', '../../services/signals/normalizers'],
                    picks: { normalizeCryptoBars: 'normalizeCryptoBars' },
                    // [2026-05-14] Stub is the CORRECTED Kraken array-shape normalizer —
                    // the old object-shape fallback silently produced all-zero bars
                    // (ATR=0, ADX=0, "everything MEAN_REVERTING @ 0.80").
                    stubs: {
                        normalizeCryptoBars: (klines) => (klines || []).map(k => ({
                            open: parseFloat(k[1]) || 0, high: parseFloat(k[2]) || 0,
                            low: parseFloat(k[3]) || 0, close: parseFloat(k[4]) || 0,
                            volume: parseFloat(k[5]) || 0,
                        })),
                    },
                },
            ],
        },

        // Monte Carlo position sizer — services-layout only (never synced into
        // deploy dirs), so prod always uses the inline Kelly fallback. Original
        // lines 187-210, class moved verbatim.
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
