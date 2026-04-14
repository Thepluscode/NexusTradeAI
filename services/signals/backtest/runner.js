'use strict';

const { computeContext } = require('../strategy-context');

/**
 * Simulate trades for a strategy against historical bars.
 *
 * Walks through bars one at a time (starting at `lookback`), calls
 * strategy.evaluate() at each bar, and simulates position management
 * (stop loss / take profit / time stop).
 *
 * @param {Object} strategy — strategy module with evaluate(bars, context)
 * @param {Array<{t,o,h,l,c,v}>} bars — full historical bars array
 * @param {{ lookback?: number, maxHoldBars?: number }} options
 * @returns {{ trades: Array, winRate: number, profitFactor: number }}
 */
function simulateTrades(strategy, bars, options = {}) {
    const { lookback = 30, maxHoldBars = 60, contextOverrides = {} } = options;

    if (!bars || bars.length <= lookback) {
        return { trades: [], winRate: 0, profitFactor: 0 };
    }

    const trades = [];
    let position = null; // { entry_price, stopLoss, takeProfit, entry_bar_index }

    for (let i = lookback; i < bars.length; i++) {
        const currentBar = bars[i];

        // Manage open position
        if (position) {
            // Check stop loss (did bar low breach stop?)
            if (currentBar.l <= position.stopLoss) {
                trades.push({
                    entry_price: position.entry_price,
                    exit_price: position.stopLoss,
                    pnl: position.stopLoss - position.entry_price,
                    exit_reason: 'stop_loss',
                    entry_bar_index: position.entry_bar_index,
                    exit_bar_index: i,
                    hold_bars: i - position.entry_bar_index,
                });
                position = null;
                continue;
            }

            // Check take profit (did bar high reach target?)
            if (currentBar.h >= position.takeProfit) {
                trades.push({
                    entry_price: position.entry_price,
                    exit_price: position.takeProfit,
                    pnl: position.takeProfit - position.entry_price,
                    exit_reason: 'take_profit',
                    entry_bar_index: position.entry_bar_index,
                    exit_bar_index: i,
                    hold_bars: i - position.entry_bar_index,
                });
                position = null;
                continue;
            }

            // Check time stop (held too long)
            if (i - position.entry_bar_index >= maxHoldBars) {
                const exitPrice = currentBar.c;
                trades.push({
                    entry_price: position.entry_price,
                    exit_price: exitPrice,
                    pnl: exitPrice - position.entry_price,
                    exit_reason: 'time_stop',
                    entry_bar_index: position.entry_bar_index,
                    exit_bar_index: i,
                    hold_bars: i - position.entry_bar_index,
                });
                position = null;
                continue;
            }

            // Position still open — skip to next bar
            continue;
        }

        // No open position — evaluate strategy for new entry
        const barsUntilNow = bars.slice(0, i + 1);
        const baseContext = computeContext(barsUntilNow, 'backtest');
        if (!baseContext) continue;
        const context = { ...baseContext, ...contextOverrides };

        const result = strategy.evaluate(barsUntilNow, context);
        if (result && result.candidate) {
            position = {
                entry_price: result.candidate.price || currentBar.c,
                stopLoss: result.candidate.stopLoss,
                takeProfit: result.candidate.takeProfit,
                entry_bar_index: i,
            };
        }
    }

    // Close any remaining position at last bar
    if (position) {
        const lastBar = bars[bars.length - 1];
        trades.push({
            entry_price: position.entry_price,
            exit_price: lastBar.c,
            pnl: lastBar.c - position.entry_price,
            exit_reason: 'end_of_data',
            entry_bar_index: position.entry_bar_index,
            exit_bar_index: bars.length - 1,
            hold_bars: bars.length - 1 - position.entry_bar_index,
        });
    }

    // Compute aggregate stats
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const winRate = trades.length > 0 ? wins.length / trades.length : 0;
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : 0;

    return { trades, winRate, profitFactor, totalWin, totalLoss };
}

module.exports = { simulateTrades };
