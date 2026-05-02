'use strict';

const DEFAULT_THRESHOLDS = {
    backtestMinTrades: 15,
    backtestMinWinRate: 0.40,
    backtestMinProfitFactor: 1.10,
    walkForwardMinOOSTrades: 30,
    walkForwardMinMedianOOSSharpe: 0.50,
    livePaperMinTrades: 30,
    livePaperMinWinRate: 0.35,
    livePaperMinProfitFactor: 1.00,
    livePaperMinTotalPnl: 0,
};

function asNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function evaluateBacktest(backtest, thresholds) {
    const reasons = [];
    if (!backtest) {
        return { passed: false, reasons: ['backtest_missing'] };
    }

    const tradeCount = asNumber(backtest.trade_count ?? backtest.tradeCount);
    const winRate = asNumber(backtest.win_rate ?? backtest.winRate);
    const profitFactor = asNumber(backtest.profit_factor ?? backtest.profitFactor);
    const passedGateA = backtest.passed_gate_a === true || backtest.passedGateA === true;

    if (!passedGateA) reasons.push('backtest_gate_a_failed');
    if (tradeCount < thresholds.backtestMinTrades) {
        reasons.push(`backtest_insufficient_trades (${tradeCount} < ${thresholds.backtestMinTrades})`);
    }
    if (winRate < thresholds.backtestMinWinRate) {
        reasons.push(`backtest_win_rate_low (${winRate.toFixed(2)} < ${thresholds.backtestMinWinRate.toFixed(2)})`);
    }
    if (profitFactor < thresholds.backtestMinProfitFactor) {
        reasons.push(`backtest_profit_factor_low (${profitFactor.toFixed(2)} < ${thresholds.backtestMinProfitFactor.toFixed(2)})`);
    }

    return {
        passed: reasons.length === 0,
        reasons,
        tradeCount,
        winRate,
        profitFactor,
        testedAt: backtest.tested_at ?? backtest.testedAt ?? null,
    };
}

function evaluateWalkForward(walkForward, thresholds) {
    const reasons = [];
    if (!walkForward) {
        return { passed: false, reasons: ['walk_forward_missing'] };
    }

    const explicitPass = walkForward.passed === true || walkForward.passed_gate_b === true || walkForward.passedGateB === true;
    const totalOOSTrades = asNumber(walkForward.totalOOSTrades ?? walkForward.total_oos_trades ?? walkForward.test_trade_count);
    const medianOOSSharpe = asNumber(walkForward.medianOOSSharpe ?? walkForward.median_oos_sharpe ?? walkForward.test_sharpe);
    const worstFoldSharpe = asNumber(walkForward.worstFoldSharpe ?? walkForward.worst_fold_sharpe ?? medianOOSSharpe);

    if (!explicitPass) reasons.push('walk_forward_gate_b_failed');
    if (totalOOSTrades < thresholds.walkForwardMinOOSTrades) {
        reasons.push(`walk_forward_insufficient_oos_trades (${totalOOSTrades} < ${thresholds.walkForwardMinOOSTrades})`);
    }
    if (medianOOSSharpe < thresholds.walkForwardMinMedianOOSSharpe) {
        reasons.push(`walk_forward_oos_sharpe_low (${medianOOSSharpe.toFixed(2)} < ${thresholds.walkForwardMinMedianOOSSharpe.toFixed(2)})`);
    }

    return {
        passed: reasons.length === 0,
        reasons,
        totalOOSTrades,
        medianOOSSharpe,
        worstFoldSharpe,
        foldCount: asNumber(walkForward.foldCount ?? walkForward.fold_count),
        runId: walkForward.run_id ?? walkForward.runId ?? null,
        testedAt: walkForward.tested_at ?? walkForward.testedAt ?? null,
    };
}

function evaluateLivePaper(livePaper, thresholds) {
    const reasons = [];
    if (!livePaper) {
        return { passed: false, reasons: ['live_paper_missing'] };
    }

    const tradeCount = asNumber(livePaper.tradeCount ?? livePaper.trade_count);
    const winRate = asNumber(livePaper.winRate ?? livePaper.win_rate);
    const profitFactor = asNumber(livePaper.profitFactor ?? livePaper.profit_factor);
    const totalPnl = asNumber(livePaper.totalPnl ?? livePaper.total_pnl);

    if (tradeCount < thresholds.livePaperMinTrades) {
        reasons.push(`live_paper_insufficient_trades (${tradeCount} < ${thresholds.livePaperMinTrades})`);
    }
    if (winRate < thresholds.livePaperMinWinRate) {
        reasons.push(`live_paper_win_rate_low (${winRate.toFixed(2)} < ${thresholds.livePaperMinWinRate.toFixed(2)})`);
    }
    if (profitFactor < thresholds.livePaperMinProfitFactor) {
        reasons.push(`live_paper_profit_factor_low (${profitFactor.toFixed(2)} < ${thresholds.livePaperMinProfitFactor.toFixed(2)})`);
    }
    if (totalPnl <= thresholds.livePaperMinTotalPnl) {
        reasons.push(`live_paper_pnl_not_positive (${totalPnl.toFixed(2)} <= ${thresholds.livePaperMinTotalPnl.toFixed(2)})`);
    }

    return {
        passed: reasons.length === 0,
        reasons,
        tradeCount,
        winRate,
        profitFactor,
        totalPnl,
        evaluatedAt: livePaper.evaluatedAt ?? livePaper.evaluated_at ?? null,
    };
}

function evaluateStrategyEvidence({ requestedState, backtest, walkForward, livePaper, thresholds = {} }) {
    const mergedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    const state = String(requestedState || 'disabled').toLowerCase();
    const gates = {
        backtest: evaluateBacktest(backtest, mergedThresholds),
        walkForward: evaluateWalkForward(walkForward, mergedThresholds),
        livePaper: evaluateLivePaper(livePaper, mergedThresholds),
    };

    const reasons = [];
    if (state === 'shadow' || state === 'live') {
        reasons.push(...gates.backtest.reasons, ...gates.walkForward.reasons);
    }
    if (state === 'live') {
        reasons.push(...gates.livePaper.reasons);
    }

    return {
        allowed: reasons.length === 0,
        state,
        reasons,
        gates,
        thresholds: mergedThresholds,
    };
}

function summarizeStrategyEvidence({ name, state, assetClass, evaluation }) {
    return {
        name,
        state,
        assetClass,
        enabled: Boolean(evaluation.allowed),
        reason: evaluation.allowed ? null : (evaluation.reasons[0] || 'strategy_evidence_failed'),
        reasons: evaluation.reasons,
        gates: evaluation.gates,
    };
}

module.exports = {
    DEFAULT_THRESHOLDS,
    evaluateStrategyEvidence,
    summarizeStrategyEvidence,
};
