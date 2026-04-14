'use strict';

/**
 * Gate A Validator — fast pass/fail check for strategy backtests.
 *
 * Requirements (all must be met):
 *   - At least 15 trades (statistical minimum)
 *   - Win rate >= 40%
 *   - Profit factor >= 1.1 (total wins / total losses)
 *
 * @param {Array<{pnl: number}>} trades — closed trades with P&L
 * @returns {{ passed: boolean, reasons: string[] }}
 */
function validateGateA(trades) {
    const reasons = [];

    if (!Array.isArray(trades) || trades.length < 15) {
        reasons.push(`insufficient_trades (${trades ? trades.length : 0} < 15)`);
    }

    const wins = (trades || []).filter(t => t.pnl > 0);
    const losses = (trades || []).filter(t => t.pnl <= 0);
    const winRate = trades && trades.length > 0 ? wins.length / trades.length : 0;
    const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : 0;

    if (trades && trades.length >= 15) {
        if (winRate < 0.40) {
            reasons.push(`low_win_rate (${(winRate * 100).toFixed(0)}% < 40%)`);
        }
        if (profitFactor < 1.1) {
            reasons.push(`low_profit_factor (${profitFactor.toFixed(2)} < 1.1)`);
        }
    }

    return {
        passed: reasons.length === 0,
        reasons,
        stats: { winRate, profitFactor, tradeCount: trades ? trades.length : 0, totalWin, totalLoss },
    };
}

module.exports = { validateGateA };
