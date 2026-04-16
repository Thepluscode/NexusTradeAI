'use strict';

const strat = require('../../strategies/forex-london-breakout');

function ctx(overrides = {}) {
    return {
        pair: 'GBP_USD',
        currentPrice: 1.3002,
        box: { isComplete: true, high: 1.3100, low: 1.3000, range: 0.0100, midline: 1.3050 },
        d1Trend: 'neutral',
        h4Trend: 'neutral',
        rsi: 30,
        macd: { histogram: 0.00005 },
        orderFlowImbalance: 0.03,
        bb: { upper: 1.3050, middle: 1.3025, lower: 1.3000 },
        atrPct: 0.008,
        ...overrides,
    };
}

describe('forexLondonBreakout strategy', () => {
    describe('registry interface', () => {
        test('exports correct metadata', () => {
            expect(strat.name).toBe('forexLondonBreakout');
            expect(strat.assetClass).toBe('forex');
            expect(strat.regimes).toEqual(expect.arrayContaining(['london-breakout', 'box-long', 'box-short']));
            expect(typeof strat.evaluate).toBe('function');
        });
    });

    describe('pair eligibility', () => {
        test('rejects EUR_USD (not a breakout pair)', () => {
            const result = strat.evaluate([], ctx({ pair: 'EUR_USD' }));
            expect(result.killedBy).toBe('pair_not_eligible');
        });
        test('accepts GBP_USD', () => {
            const result = strat.evaluate([], ctx({ pair: 'GBP_USD' }));
            expect(result.candidate).toBeDefined();
        });
        test('accepts USD_CHF', () => {
            const result = strat.evaluate([], ctx({ pair: 'USD_CHF' }));
            expect(result.candidate).toBeDefined();
        });
    });

    describe('box validation', () => {
        test('rejects missing box', () => {
            const r = strat.evaluate([], ctx({ box: null }));
            expect(r.killedBy).toBe('no_box');
        });
        test('rejects incomplete box', () => {
            const r = strat.evaluate([], ctx({ box: { isComplete: false, high: 1, low: 1, range: 0 } }));
            expect(r.killedBy).toBe('no_box');
        });
        test('rejects zero range', () => {
            const r = strat.evaluate([], ctx({ box: { isComplete: true, high: 1, low: 1, range: 0 } }));
            expect(r.killedBy).toBe('invalid_box_range');
        });
    });

    describe('entry zones', () => {
        test('long when price in bottom 20% of box', () => {
            // box 1.30-1.31, bottom 20% = 1.3000 to 1.3020
            const r = strat.evaluate([], ctx({ currentPrice: 1.3010 }));
            expect(r.candidate.direction).toBe('long');
        });
        test('short when price in top 20% of box', () => {
            // box 1.30-1.31, top 20% = 1.3080 to 1.3100
            const r = strat.evaluate([], ctx({
                currentPrice: 1.3090,
                rsi: 70,
                macd: { histogram: -0.00005 },
                orderFlowImbalance: -0.03,
            }));
            expect(r.candidate.direction).toBe('short');
        });
        test('rejects middle of box (no entry zone)', () => {
            const r = strat.evaluate([], ctx({ currentPrice: 1.3050 }));
            expect(r.killedBy).toBe('outside_entry_zones');
        });
    });

    describe('trend filters', () => {
        test('rejects long when D1 down', () => {
            const r = strat.evaluate([], ctx({ d1Trend: 'down' }));
            expect(r.killedBy).toBe('d1_trend_mismatch');
        });
        test('rejects long when H4 down', () => {
            const r = strat.evaluate([], ctx({ h4Trend: 'down' }));
            expect(r.killedBy).toBe('h4_trend_mismatch');
        });
        test('allows long when both up', () => {
            const r = strat.evaluate([], ctx({ d1Trend: 'up', h4Trend: 'up' }));
            expect(r.candidate).toBeDefined();
        });
    });

    describe('confirmation score', () => {
        test('rejects below 0.55', () => {
            // Weak setup: RSI neutral, no MACD alignment, neutral flow
            const r = strat.evaluate([], ctx({
                rsi: 50, macd: { histogram: 0 }, orderFlowImbalance: 0,
                bb: { upper: 1.35, middle: 1.3, lower: 1.25 }, // wide bands
            }));
            expect(r.killedBy).toBe('low_confirmation');
        });
    });

    describe('candidate output', () => {
        test('long candidate has stop below box low, target above entry', () => {
            const r = strat.evaluate([], ctx({ currentPrice: 1.3010 }));
            expect(r.candidate.stopLoss).toBeLessThan(1.3000);
            expect(r.candidate.takeProfit).toBeGreaterThan(1.3010);
            expect(r.candidate.dynamicRR).toBeGreaterThan(1.5);
        });
        test('short candidate has stop above box high, target below entry', () => {
            const r = strat.evaluate([], ctx({
                currentPrice: 1.3090,
                rsi: 70,
                macd: { histogram: -0.00005 },
                orderFlowImbalance: -0.03,
            }));
            expect(r.candidate.stopLoss).toBeGreaterThan(1.3100);
            expect(r.candidate.takeProfit).toBeLessThan(1.3090);
        });
    });

    describe('dynamic R:R helper', () => {
        test('high vol (>1.2% ATR) → 1.5', () => {
            expect(strat._calculateDynamicRR(0.015)).toBe(1.5);
        });
        test('low vol (<0.3% ATR) → 3.0', () => {
            expect(strat._calculateDynamicRR(0.002)).toBe(3.0);
        });
        test('mid vol interpolates', () => {
            const rr = strat._calculateDynamicRR(0.0075);
            expect(rr).toBeGreaterThan(1.5);
            expect(rr).toBeLessThan(3.0);
        });
    });

    describe('edge cases', () => {
        test('handles null context', () => {
            expect(strat.evaluate([], null).killedBy).toBe('no_context');
        });
        test('handles missing RSI', () => {
            const r = strat.evaluate([], ctx({ rsi: null }));
            expect(r.killedBy).toBe('no_rsi');
        });
    });
});
