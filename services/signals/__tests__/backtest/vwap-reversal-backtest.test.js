const { simulateTrades } = require('../../backtest/runner');
const { validateGateA } = require('../../backtest/gate-a-validator');
const vwapReversal = require('../../strategies/stock-vwap-reversal');

/**
 * Integration test: run VWAP Reversal through the backtest harness
 * with synthetic bars that create the right conditions.
 */

// Bars that create a VWAP Reversal setup:
// - Rising first 40 bars (establishes VWAP above current)
// - Drop below VWAP lower band with RSI < 40
// - Recover to VWAP (mean reversion target)
function makeVwapReversalBars(count = 120) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        let price;
        if (i < 40) {
            price = 100 + i * 0.3; // rising phase: 100 → 112
        } else if (i < 70) {
            price = 112 - (i - 40) * 0.6; // drop phase: 112 → 94
        } else {
            price = 94 + (i - 70) * 0.36; // recovery phase: 94 → 112
        }
        bars.push({
            t: `2026-04-01T09:${String(30 + (i % 30)).padStart(2, '0')}:00Z`,
            o: price - 0.1,
            h: price + 0.5,
            l: price - 0.5,
            c: price,
            v: 200000,
        });
    }
    return bars;
}

describe('VWAP Reversal backtest integration', () => {
    test('produces at least 1 trade on synthetic mean-reversion bars', () => {
        const bars = makeVwapReversalBars(120);
        const result = simulateTrades(vwapReversal, bars, {
            lookback: 35, maxHoldBars: 40,
            contextOverrides: { volumeRatio: 1.5, spyBullish: true },
        });
        // The strategy should fire during the drop phase when price < VWAP lower band
        expect(result.trades.length).toBeGreaterThanOrEqual(1);
    });

    test('winning trades exit at take profit (VWAP midline)', () => {
        const bars = makeVwapReversalBars(120);
        const result = simulateTrades(vwapReversal, bars, {
            lookback: 35, maxHoldBars: 40,
            contextOverrides: { volumeRatio: 1.5, spyBullish: true },
        });
        const tpTrades = result.trades.filter(t => t.exit_reason === 'take_profit');
        // Recovery phase should push price back to VWAP → take profit
        for (const t of tpTrades) {
            expect(t.pnl).toBeGreaterThan(0);
        }
    });

    test('backtest result shape is compatible with gate-a validator', () => {
        const bars = makeVwapReversalBars(120);
        const result = simulateTrades(vwapReversal, bars, {
            lookback: 35, maxHoldBars: 40,
            contextOverrides: { volumeRatio: 1.5, spyBullish: true },
        });
        // gate-a expects {pnl} on each trade
        const gateResult = validateGateA(result.trades);
        expect(gateResult).toHaveProperty('passed');
        expect(gateResult).toHaveProperty('reasons');
        expect(gateResult).toHaveProperty('stats');
    });
});
