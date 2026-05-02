const {
    evaluateStrategyEvidence,
    summarizeStrategyEvidence,
} = require('../strategy-evidence');

describe('evaluateStrategyEvidence', () => {
    const passingBacktest = {
        trade_count: 42,
        win_rate: 0.48,
        profit_factor: 1.42,
        passed_gate_a: true,
        passed_walk_forward: true,
    };

    const passingWalkForward = {
        foldCount: 4,
        totalOOSTrades: 44,
        medianOOSSharpe: 0.72,
        worstFoldSharpe: 0.12,
        passed: true,
    };

    const passingLivePaper = {
        tradeCount: 34,
        winRate: 0.44,
        profitFactor: 1.24,
        totalPnl: 18.5,
    };

    test('allows live when backtest, walk-forward, and live-paper gates pass', () => {
        const result = evaluateStrategyEvidence({
            requestedState: 'live',
            backtest: passingBacktest,
            walkForward: passingWalkForward,
            livePaper: passingLivePaper,
        });

        expect(result.allowed).toBe(true);
        expect(result.reasons).toEqual([]);
    });

    test('blocks live when live-paper sample is missing', () => {
        const result = evaluateStrategyEvidence({
            requestedState: 'live',
            backtest: passingBacktest,
            walkForward: passingWalkForward,
            livePaper: { tradeCount: 0, winRate: 0, profitFactor: 0, totalPnl: 0 },
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('live_paper_insufficient_trades (0 < 30)');
    });

    test('blocks shadow when backtest or walk-forward evidence fails', () => {
        const result = evaluateStrategyEvidence({
            requestedState: 'shadow',
            backtest: { ...passingBacktest, passed_gate_a: false, profit_factor: 0.8 },
            walkForward: passingWalkForward,
            livePaper: passingLivePaper,
        });

        expect(result.allowed).toBe(false);
        expect(result.reasons).toContain('backtest_gate_a_failed');
    });

    test('does not require live-paper trades for shadow state', () => {
        const result = evaluateStrategyEvidence({
            requestedState: 'shadow',
            backtest: passingBacktest,
            walkForward: passingWalkForward,
            livePaper: null,
        });

        expect(result.allowed).toBe(true);
    });
});

describe('summarizeStrategyEvidence', () => {
    test('returns disabled reason for dashboard/operator surfaces', () => {
        const summary = summarizeStrategyEvidence({
            name: 'openingRangeBreakout',
            state: 'live',
            assetClass: 'stock',
            evaluation: {
                allowed: false,
                reasons: ['live_paper_profit_factor_low (0.92 < 1.00)'],
                gates: {
                    backtest: { passed: true },
                    walkForward: { passed: true },
                    livePaper: { passed: false },
                },
            },
        });

        expect(summary.enabled).toBe(false);
        expect(summary.reason).toBe('live_paper_profit_factor_low (0.92 < 1.00)');
        expect(summary.gates.livePaper.passed).toBe(false);
    });
});
