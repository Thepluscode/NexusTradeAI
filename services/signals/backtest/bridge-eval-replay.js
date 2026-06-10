// Rule 4 FP/FN replay for the strategy-bridge advisory verdicts.
//
// Measures whether the stored AI verdicts (trades.agent_approved /
// agent_confidence) discriminate winners from losers on REALIZED outcomes —
// the mandatory baseline before any change to the bridge's prompts or
// thresholds. Because the bridge is ADVISORY (rejections at confidence > 0.7
// get a 0.7x size reduction; approvals never boost — see
// unified-crypto-bot.js ~4085), rejected signals still executed, so both
// verdict classes have observable outcomes and there is no selection bias.
//
// Spec (Rule 1):
//   Inputs : array of trade rows ({ agent_approved, agent_confidence,
//            pnl_usd, status, close_reason }). Pure compute — callers fetch.
//   Output : per-dataset report (see replayBridgeVerdicts JSDoc).
//   Invariants: never throws on malformed rows (skipped + counted);
//            deterministic; degenerate verdict columns are REPORTED, not
//            silently analyzed (a single-class column cannot be scored).
//   Failure modes: missing/NaN pnl_usd or null agent_approved -> row skipped.
//
// FP/FN convention: the verdict "rejected" is treated as a prediction that
// the trade will LOSE. So:
//   TP = rejected & lost      FP = rejected & won
//   TN = approved & won       FN = approved & lost
// blockPrecision = TP/(TP+FP) must exceed the base loser rate for the verdict
// to carry any selection skill (same bar the kill-switch OOS test had to clear).

'use strict';

const ADVISORY_REDUCE_CONF = 0.7;  // mirror of the bot's advisory_reduce threshold
const ADVISORY_SIZE_MULT = 0.7;

function num(x) {
    const v = parseFloat(x);
    return Number.isFinite(v) ? v : null;
}

function tStat(values) {
    const n = values.length;
    if (n < 2) return null;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1));
    return sd > 0 ? mean / (sd / Math.sqrt(n)) : null;
}

function classStats(rows) {
    const pnls = rows.map(r => r._pnl);
    const wins = pnls.filter(p => p > 0).length;
    const total = pnls.reduce((a, b) => a + b, 0);
    return {
        n: rows.length,
        winRate: rows.length ? wins / rows.length : null,
        totalPnl: Math.round(total * 100) / 100,
        evPerTrade: rows.length ? Math.round((total / rows.length) * 1000) / 1000 : null,
    };
}

/**
 * Replay stored bridge verdicts against realized trade outcomes.
 * @param {Array<object>} trades  raw rows from GET /api/trades
 * @param {object} [opts]
 * @param {string} [opts.label]   dataset label for the report
 * @returns {object} report — { label, usable, skipped, dataQuality,
 *   verdictCounts, byVerdict: {approved, rejected}, confusion, blockPrecision,
 *   baseLoserRate, discriminates, evDiffTStat, calibration[],
 *   advisoryReduce: {n, pnlActual, pnlFullSizeCounterfactual, savedUsd} }
 */
function replayBridgeVerdicts(trades, opts = {}) {
    const label = opts.label || 'unknown';
    const usable = [];
    let skipped = 0;
    for (const t of trades || []) {
        if (!t || t.status !== 'closed' || t.close_reason === 'orphaned_restart') { skipped++; continue; }
        const pnl = num(t.pnl_usd);
        if (pnl === null || typeof t.agent_approved !== 'boolean') { skipped++; continue; }
        usable.push({ ...t, _pnl: pnl, _conf: num(t.agent_confidence) });
    }

    const approved = usable.filter(t => t.agent_approved === true);
    const rejected = usable.filter(t => t.agent_approved === false);
    const withConf = usable.filter(t => t._conf !== null);

    const dataQuality = {
        confidenceNonNull: withConf.length,
        degenerate: approved.length === 0 || rejected.length === 0,
        degenerateReason: approved.length === 0
            ? 'all stored verdicts are REJECTED (or default-false) — single class, unscoreable'
            : rejected.length === 0 ? 'all stored verdicts are APPROVED — single class, unscoreable' : null,
    };

    const report = {
        label,
        usable: usable.length,
        skipped,
        dataQuality,
        verdictCounts: { approved: approved.length, rejected: rejected.length },
        byVerdict: { approved: classStats(approved), rejected: classStats(rejected) },
    };

    if (!dataQuality.degenerate) {
        const tp = rejected.filter(t => t._pnl <= 0).length;  // rejected & lost
        const fp = rejected.length - tp;                       // rejected & won
        const fn = approved.filter(t => t._pnl <= 0).length;   // approved & lost
        const tn = approved.length - fn;                       // approved & won
        const losers = usable.filter(t => t._pnl <= 0).length;
        report.confusion = { tp, fp, fn, tn };
        report.blockPrecision = Math.round((tp / (tp + fp)) * 1000) / 1000;
        report.baseLoserRate = Math.round((losers / usable.length) * 1000) / 1000;
        // The kill-switch bar: a verdict only has selection skill if it
        // rejects losers at a higher rate than blind rejection would.
        report.discriminates = report.blockPrecision > report.baseLoserRate;
        report.lossRecall = Math.round((tp / Math.max(1, tp + fn)) * 1000) / 1000;

        // Welch-ish two-sample contrast via t on the per-class EV difference:
        // pool both classes' pnls, signed so >0 means "rejected did worse".
        const evDiffSamples = [
            ...rejected.map(t => -t._pnl),  // rejected trades losing -> positive
            ...approved.map(t => t._pnl),   // approved trades winning -> positive
        ];
        report.evDiffTStat = tStat(evDiffSamples) === null ? null
            : Math.round(tStat(evDiffSamples) * 100) / 100;
    }

    // Confidence calibration (only meaningful where confidence persisted).
    if (withConf.length >= 10) {
        const buckets = [[0, 0.5], [0.5, 0.7], [0.7, 0.85], [0.85, 1.01]];
        report.calibration = buckets.map(([lo, hi]) => {
            const rows = withConf.filter(t => t._conf >= lo && t._conf < hi);
            return { bucket: `[${lo},${hi})`, ...classStats(rows) };
        }).filter(b => b.n > 0);
    } else {
        report.calibration = null;
    }

    // Counterfactual on the only action the advisory takes: 0.7x sizing on
    // high-confidence rejections. Recorded pnl already includes the reduction;
    // full-size counterfactual = pnl / 0.7. savedUsd > 0 means the advisory
    // reduced losses (its sole mechanism for adding value).
    const reduced = rejected.filter(t => t._conf !== null && t._conf > ADVISORY_REDUCE_CONF);
    const pnlActual = reduced.reduce((a, t) => a + t._pnl, 0);
    const pnlFull = pnlActual / ADVISORY_SIZE_MULT;
    report.advisoryReduce = {
        n: reduced.length,
        pnlActual: Math.round(pnlActual * 100) / 100,
        pnlFullSizeCounterfactual: Math.round(pnlFull * 100) / 100,
        savedUsd: Math.round((pnlActual - pnlFull) * 100) / 100,
    };

    return report;
}

module.exports = { replayBridgeVerdicts, ADVISORY_REDUCE_CONF, ADVISORY_SIZE_MULT };
