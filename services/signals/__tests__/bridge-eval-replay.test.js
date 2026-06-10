// Tests for the Rule 4 bridge-verdict FP/FN replay (bridge-eval-replay.js).
// Categories per Rule 2: normal, boundary, malformed, adversarial, regression.

'use strict';

const { replayBridgeVerdicts } = require('../backtest/bridge-eval-replay');

const T = (approved, pnl, conf = null, over = {}) => ({
    status: 'closed', close_reason: 'Take Profit',
    agent_approved: approved, agent_confidence: conf, pnl_usd: pnl, ...over,
});

describe('bridge-eval-replay: normal cases', () => {
    test('perfect discriminator: rejected all lose, approved all win', () => {
        const trades = [
            T(false, -5), T(false, -3), T(false, -1),
            T(true, 4), T(true, 2), T(true, 6),
        ];
        const r = replayBridgeVerdicts(trades, { label: 't' });
        expect(r.confusion).toEqual({ tp: 3, fp: 0, fn: 0, tn: 3 });
        expect(r.blockPrecision).toBe(1);
        expect(r.baseLoserRate).toBe(0.5);
        expect(r.discriminates).toBe(true);
        expect(r.lossRecall).toBe(1);
    });

    test('zero-skill verdict: classes mirror the base rate', () => {
        // 50% losers in both classes -> blockPrecision == baseLoserRate
        const trades = [
            T(false, -1), T(false, 2), T(true, -1), T(true, 2),
        ];
        const r = replayBridgeVerdicts(trades);
        expect(r.blockPrecision).toBe(0.5);
        expect(r.baseLoserRate).toBe(0.5);
        expect(r.discriminates).toBe(false);
    });

    test('per-class stats are computed on pnl', () => {
        const r = replayBridgeVerdicts([T(true, 10), T(true, -4), T(false, -6)]);
        expect(r.byVerdict.approved).toMatchObject({ n: 2, winRate: 0.5, totalPnl: 6, evPerTrade: 3 });
        expect(r.byVerdict.rejected).toMatchObject({ n: 1, winRate: 0, totalPnl: -6 });
    });

    test('advisory-reduce counterfactual: 0.7x sizing on high-conf rejections', () => {
        // rejected at conf 0.9 with recorded pnl -7 -> full size would be -10;
        // the advisory saved $3.
        const r = replayBridgeVerdicts([T(false, -7, 0.9), T(false, -2, 0.5), T(true, 3, 0.8)]);
        expect(r.advisoryReduce).toEqual({ n: 1, pnlActual: -7, pnlFullSizeCounterfactual: -10, savedUsd: 3 });
    });
});

describe('bridge-eval-replay: boundary cases', () => {
    test('pnl exactly 0 counts as a loss (matches loser-rate convention)', () => {
        const r = replayBridgeVerdicts([T(false, 0), T(true, 1)]);
        expect(r.confusion.tp).toBe(1);
    });

    test('confidence exactly at the 0.7 threshold is NOT advisory-reduce (strict >)', () => {
        const r = replayBridgeVerdicts([T(false, -7, 0.7), T(true, 1)]);
        expect(r.advisoryReduce.n).toBe(0);
    });

    test('calibration requires >= 10 confidence rows', () => {
        const few = Array.from({ length: 9 }, () => T(true, 1, 0.8));
        expect(replayBridgeVerdicts([...few, T(false, -1)]).calibration).toBeNull();
        const enough = Array.from({ length: 10 }, () => T(true, 1, 0.8));
        const r = replayBridgeVerdicts([...enough, T(false, -1)]);
        expect(r.calibration).toEqual([expect.objectContaining({ bucket: '[0.7,0.85)', n: 10 })]);
    });
});

describe('bridge-eval-replay: malformed + adversarial cases', () => {
    test('skips open trades, orphans, NaN pnl, and non-boolean verdicts — never throws', () => {
        const r = replayBridgeVerdicts([
            T(true, 5),
            { ...T(true, 5), status: 'open' },
            { ...T(true, 5), close_reason: 'orphaned_restart' },
            T(true, 'not-a-number'),
            T('yes', 5),               // non-boolean verdict
            T(null, 5),                // null verdict (crypto/forex degenerate rows are false, not null)
            null, undefined, 42,       // garbage rows
            T(false, -1),
        ]);
        expect(r.usable).toBe(2);
        expect(r.skipped).toBe(8);
    });

    test('degenerate single-class column is reported, not scored', () => {
        const r = replayBridgeVerdicts([T(false, -1), T(false, 2), T(false, -3)]);
        expect(r.dataQuality.degenerate).toBe(true);
        expect(r.dataQuality.degenerateReason).toMatch(/REJECTED/);
        expect(r.confusion).toBeUndefined();
        expect(r.blockPrecision).toBeUndefined();
    });

    test('empty input produces an honest empty report', () => {
        const r = replayBridgeVerdicts([]);
        expect(r.usable).toBe(0);
        expect(r.dataQuality.degenerate).toBe(true);
    });

    test('string pnl values are parsed (API returns numerics as strings)', () => {
        const r = replayBridgeVerdicts([T(true, '5.50'), T(false, '-2.25')]);
        expect(r.byVerdict.approved.totalPnl).toBe(5.5);
        expect(r.byVerdict.rejected.totalPnl).toBe(-2.25);
    });
});
