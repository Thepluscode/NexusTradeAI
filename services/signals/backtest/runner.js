'use strict';

const { computeContext } = require('../strategy-context');
const { getRoundTripCost } = require('../cost-model');

/**
 * Simulate trades for a strategy against historical bars.
 *
 * Walks through bars one at a time (starting at `lookback`), calls
 * strategy.evaluate() at each bar, and simulates position management
 * (stop loss / take profit / time stop).
 *
 * Returns full performance metrics including Sharpe, Sortino, max drawdown,
 * and cost-adjusted P&L.
 *
 * @param {Object} strategy — strategy module with evaluate(bars, context)
 * @param {Array<{t,o,h,l,c,v}>} bars — full historical bars array
 * @param {{ lookback?: number, maxHoldBars?: number, assetClass?: string }} options
 * @returns {{ trades, winRate, profitFactor, sharpe, sortino, maxDrawdownPct, totalPnl, ... }}
 */
function simulateTrades(strategy, bars, options = {}) {
    const { lookback = 30, maxHoldBars = 60, contextOverrides = {}, assetClass = 'stock' } = options;

    if (!bars || bars.length <= lookback) {
        return { trades: [], winRate: 0, profitFactor: 0, sharpe: 0, sortino: 0, maxDrawdownPct: 0, totalPnl: 0, totalWin: 0, totalLoss: 0 };
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

    // Apply transaction costs to each trade's P&L
    for (const trade of trades) {
        const cost = getRoundTripCost(assetClass, trade.entry_price);
        trade.costPct = cost.costPct;
        trade.costUsd = (cost.costPct / 100) * trade.entry_price;
        trade.pnlGross = trade.pnl;
        trade.pnl = trade.pnl - trade.costUsd;
        trade.pnlPct = trade.entry_price > 0 ? (trade.pnl / trade.entry_price) * 100 : 0;
    }

    // Compute aggregate stats
    const stats = computeStats(trades);
    return { trades, ...stats };
}

/**
 * Compute performance statistics from a list of trades.
 * Separated so walk-forward harness can reuse it on arbitrary trade slices.
 */
function computeStats(trades) {
    if (!trades || trades.length === 0) {
        return { winRate: 0, profitFactor: 0, sharpe: 0, sortino: 0, maxDrawdownPct: 0, totalPnl: 0, totalWin: 0, totalLoss: 0, avgWin: 0, avgLoss: 0, expectancy: 0 };
    }

    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const totalPnl = totalWin - totalLoss;
    const winRate = trades.length > 0 ? wins.length / trades.length : 0;
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : 0;
    const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
    const expectancy = trades.length > 0 ? totalPnl / trades.length : 0;

    // Per-trade return percentages for Sharpe/Sortino
    const returns = trades.map(t => t.pnlPct != null ? t.pnlPct : (t.entry_price > 0 ? (t.pnl / t.entry_price) * 100 : 0));
    const sharpe = computeSharpe(returns);
    const sortino = computeSortino(returns);
    const maxDrawdownPct = computeMaxDrawdown(trades);

    return { winRate, profitFactor, sharpe, sortino, maxDrawdownPct, totalPnl, totalWin, totalLoss, avgWin, avgLoss, expectancy };
}

/**
 * Annualized Sharpe ratio from per-trade return percentages.
 * Assumes ~252 trading days, ~6.5 trades/day average = ~1638 trades/year.
 * Uses trades/year = max(trades.length, 1) scaled to annualize.
 */
function computeSharpe(returns) {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    if (std === 0) return 0;
    // Per-trade Sharpe × sqrt(N) for annualization
    return (mean / std) * Math.sqrt(Math.min(returns.length, 252));
}

/**
 * Sortino ratio — like Sharpe but only penalizes downside deviation.
 */
function computeSortino(returns) {
    if (returns.length < 2) return 0;
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const downsideReturns = returns.filter(r => r < 0);
    if (downsideReturns.length === 0) return mean > 0 ? Infinity : 0;
    const downsideVariance = downsideReturns.reduce((s, r) => s + r ** 2, 0) / downsideReturns.length;
    const downsideStd = Math.sqrt(downsideVariance);
    if (downsideStd === 0) return 0;
    return (mean / downsideStd) * Math.sqrt(Math.min(returns.length, 252));
}

/**
 * Maximum drawdown as a percentage of peak equity.
 * Builds an equity curve from cumulative trade P&L.
 */
function computeMaxDrawdown(trades) {
    if (trades.length === 0) return 0;
    let equity = 0;
    let peak = 0;
    let maxDD = 0;
    for (const t of trades) {
        equity += t.pnl;
        if (equity > peak) peak = equity;
        const dd = peak > 0 ? (peak - equity) / peak : 0;
        if (dd > maxDD) maxDD = dd;
    }
    return maxDD * 100; // as percentage
}

module.exports = { simulateTrades, computeStats, computeSharpe, computeSortino, computeMaxDrawdown };
