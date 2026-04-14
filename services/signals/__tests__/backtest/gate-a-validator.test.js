const { validateGateA } = require('../../backtest/gate-a-validator');

describe('validateGateA', () => {
    test('passes with 15 trades, 40% WR, PF 1.1', () => {
        const trades = [];
        for (let i = 0; i < 6; i++) trades.push({ pnl: 10 });   // 6 wins
        for (let i = 0; i < 9; i++) trades.push({ pnl: -5 });    // 9 losses
        // WR = 6/15 = 40%, PF = 60/45 = 1.33
        const result = validateGateA(trades);
        expect(result.passed).toBe(true);
        expect(result.reasons).toEqual([]);
    });

    test('fails with 14 trades (insufficient sample)', () => {
        const trades = Array(14).fill({ pnl: 10 });
        const result = validateGateA(trades);
        expect(result.passed).toBe(false);
        expect(result.reasons[0]).toMatch(/insufficient_trades/);
    });

    test('fails with 15 trades, 39% WR', () => {
        const trades = [];
        for (let i = 0; i < 5; i++) trades.push({ pnl: 10 });
        for (let i = 0; i < 10; i++) trades.push({ pnl: -5 });
        // WR = 5/15 = 33%
        const result = validateGateA(trades);
        expect(result.passed).toBe(false);
        expect(result.reasons.some(r => r.includes('low_win_rate'))).toBe(true);
    });

    test('fails with PF < 1.1', () => {
        const trades = [];
        for (let i = 0; i < 7; i++) trades.push({ pnl: 5 });
        for (let i = 0; i < 8; i++) trades.push({ pnl: -5 });
        // WR = 46%, PF = 35/40 = 0.875
        const result = validateGateA(trades);
        expect(result.passed).toBe(false);
        expect(result.reasons.some(r => r.includes('low_profit_factor'))).toBe(true);
    });

    test('handles empty trades array', () => {
        const result = validateGateA([]);
        expect(result.passed).toBe(false);
    });

    test('handles trades with zero pnl', () => {
        const trades = Array(20).fill({ pnl: 0 });
        const result = validateGateA(trades);
        expect(result.passed).toBe(false);
    });

    test('returns multiple reasons when multiple gates fail', () => {
        // 15 trades: 4W (27% WR) at $2 each, 11L at $-5 each → PF = 8/55 = 0.15
        const trades = [];
        for (let i = 0; i < 4; i++) trades.push({ pnl: 2 });
        for (let i = 0; i < 11; i++) trades.push({ pnl: -5 });
        const result = validateGateA(trades);
        expect(result.passed).toBe(false);
        expect(result.reasons.length).toBeGreaterThanOrEqual(2);
    });

    test('passes exact boundary: 15 trades, exactly 40% WR, PF exactly 1.1', () => {
        // 6 wins at $11, 9 losses at $-10 → WR=40%, PF = 66/90 = 0.733 — fails PF
        // Need: 6 wins at $16.5, 9 losses at $-10 → PF = 99/90 = 1.1
        const trades = [];
        for (let i = 0; i < 6; i++) trades.push({ pnl: 16.5 });
        for (let i = 0; i < 9; i++) trades.push({ pnl: -10 });
        const result = validateGateA(trades);
        expect(result.passed).toBe(true);
    });
});
