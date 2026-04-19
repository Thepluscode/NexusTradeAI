// services/signals/strategy-registry.js
'use strict';

const strategies = new Map();

function register(strategy) {
    if (!strategy || typeof strategy !== 'object') {
        throw new Error('register: strategy must be an object');
    }
    if (!strategy.name || typeof strategy.name !== 'string') {
        throw new Error('register: strategy.name (string) is required');
    }
    if (!strategy.assetClass || typeof strategy.assetClass !== 'string') {
        throw new Error('register: strategy.assetClass (string) is required');
    }
    if (typeof strategy.evaluate !== 'function') {
        throw new Error('register: strategy.evaluate (function) is required');
    }
    if (strategies.has(strategy.name)) {
        throw new Error(`register: duplicate strategy name "${strategy.name}"`);
    }
    // Default regimes to ['any'] if not specified
    const normalized = {
        ...strategy,
        regimes: Array.isArray(strategy.regimes) && strategy.regimes.length > 0
            ? strategy.regimes
            : ['any'],
    };
    strategies.set(strategy.name, normalized);
}

/**
 * Run a set of strategies against the same bars + context.
 * Fault-isolated: one strategy crashing never affects others.
 * @returns {{ candidates: Array, diagnostics: Object }}
 */
function runStrategies(enabledStrategies, symbol, bars, context) {
    const candidates = [];
    const diagnostics = {};

    for (const strategy of enabledStrategies) {
        try {
            const result = strategy.evaluate(bars, context);
            if (result && result.candidate) {
                candidates.push({
                    ...result.candidate,
                    strategy: strategy.name,
                });
            } else if (result && result.killedBy) {
                if (!diagnostics[strategy.name]) diagnostics[strategy.name] = {};
                diagnostics[strategy.name][result.killedBy] =
                    (diagnostics[strategy.name][result.killedBy] || 0) + 1;
            }
        } catch (e) {
            console.error(`[strategy ${strategy.name}] ${symbol} crashed: ${e.message}`);
            if (!diagnostics[strategy.name]) diagnostics[strategy.name] = {};
            diagnostics[strategy.name]._error = e.message;
        }
    }

    return { candidates, diagnostics };
}

// DB-backed enablement cache
let enabledCache = null;
let enabledCacheFetchedAt = 0;
const ENABLED_CACHE_TTL_MS = 60_000;

async function getEnabledStrategies(assetClass, regime, dbPool) {
    const age = Date.now() - enabledCacheFetchedAt;
    const shouldRefresh = enabledCache === null || age > ENABLED_CACHE_TTL_MS;

    if (shouldRefresh) {
        try {
            const result = await dbPool.query(
                `SELECT strategy_name, state FROM strategy_enabled
                 WHERE asset_class = $1 AND state IN ('shadow','live')`,
                [assetClass]
            );
            enabledCache = result.rows;
            enabledCacheFetchedAt = Date.now();
        } catch (e) {
            console.error(`[strategy-registry] DB query failed: ${e.message} — using cached (${enabledCache === null ? 'NO CACHE' : 'stale'})`);
            if (enabledCache === null) return [];
        }
    }

    return enabledCache
        .map(row => {
            const strategy = strategies.get(row.strategy_name);
            if (!strategy) return null;
            return { ...strategy, state: row.state };
        })
        .filter(s => s !== null)
        .filter(s => s.assetClass === assetClass)
        .filter(s => s.regimes.includes(regime) || s.regimes.includes('any'));
}

// ── Strategy lifecycle management (v24.6 Phase 6) ───────────────────────────

const VALID_STATES = ['disabled', 'backtest', 'shadow', 'live'];
const PROMOTION_ORDER = { disabled: 0, backtest: 1, shadow: 2, live: 3 };

/**
 * Promote a strategy to the next lifecycle state.
 * disabled → backtest → shadow → live
 *
 * Requirements for each promotion:
 *   backtest → shadow: Gate A passed (WR ≥ 40%, PF ≥ 1.1, 15+ trades)
 *   shadow → live:     Gate B passed (OOS Sharpe ≥ 0.5) + 30 shadow trades with net positive PnL
 *
 * @param {string} strategyName
 * @param {string} reason — why this promotion is happening
 * @param {Object} dbPool — PostgreSQL connection pool
 * @returns {{ success: boolean, newState: string, error?: string }}
 */
async function promoteStrategy(strategyName, reason, dbPool) {
    if (!dbPool) return { success: false, error: 'No database connection' };

    try {
        const result = await dbPool.query(
            'SELECT state FROM strategy_enabled WHERE strategy_name = $1',
            [strategyName]
        );
        if (result.rows.length === 0) {
            return { success: false, error: `Strategy "${strategyName}" not found in strategy_enabled` };
        }

        const currentState = result.rows[0].state;
        const currentOrder = PROMOTION_ORDER[currentState] ?? -1;
        const nextState = VALID_STATES[currentOrder + 1];

        if (!nextState) {
            return { success: false, error: `Strategy "${strategyName}" is already at max state: ${currentState}` };
        }

        await dbPool.query(
            `UPDATE strategy_enabled SET state = $1, reason = $2, updated_by = 'auto-lifecycle', last_updated = NOW()
             WHERE strategy_name = $3`,
            [nextState, reason, strategyName]
        );

        // Log the transition
        await dbPool.query(
            `INSERT INTO strategy_alerts (strategy_name, alert_type, severity, message, details)
             VALUES ($1, 'lifecycle_promotion', 'info', $2, $3)`,
            [strategyName, `Promoted: ${currentState} → ${nextState}`, JSON.stringify({ reason, previousState: currentState })]
        ).catch(() => {}); // non-fatal if alerts table doesn't exist yet

        _forceCacheExpiry(); // force re-read on next getEnabledStrategies call
        return { success: true, newState: nextState, previousState: currentState };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Demote a strategy to a lower lifecycle state.
 * live → shadow → backtest → disabled
 *
 * Auto-demote triggers:
 *   - Rolling 30-trade Sharpe < 0 → demote from live to shadow
 *   - Shadow PnL negative after 30 trades → demote to backtest
 *
 * @param {string} strategyName
 * @param {string} reason
 * @param {Object} dbPool
 * @returns {{ success: boolean, newState: string, error?: string }}
 */
async function demoteStrategy(strategyName, reason, dbPool) {
    if (!dbPool) return { success: false, error: 'No database connection' };

    try {
        const result = await dbPool.query(
            'SELECT state FROM strategy_enabled WHERE strategy_name = $1',
            [strategyName]
        );
        if (result.rows.length === 0) {
            return { success: false, error: `Strategy "${strategyName}" not found` };
        }

        const currentState = result.rows[0].state;
        const currentOrder = PROMOTION_ORDER[currentState] ?? 0;
        const prevState = VALID_STATES[Math.max(0, currentOrder - 1)];

        await dbPool.query(
            `UPDATE strategy_enabled SET state = $1, reason = $2, updated_by = 'auto-lifecycle', last_updated = NOW()
             WHERE strategy_name = $3`,
            [prevState, reason, strategyName]
        );

        await dbPool.query(
            `INSERT INTO strategy_alerts (strategy_name, alert_type, severity, message, details)
             VALUES ($1, 'lifecycle_demotion', 'warning', $2, $3)`,
            [strategyName, `Demoted: ${currentState} → ${prevState}`, JSON.stringify({ reason, previousState: currentState })]
        ).catch(() => {});

        _forceCacheExpiry();
        return { success: true, newState: prevState, previousState: currentState };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * Evaluate strategy health and auto-demote if degraded.
 * Called periodically from auto-optimizer cycle.
 *
 * @param {string} strategyName
 * @param {Array} recentTrades — last 30 closed trades for this strategy
 * @param {Object} dbPool
 * @returns {{ action: string, details: Object }}
 */
function evaluateStrategyHealth(strategyName, recentTrades) {
    if (!recentTrades || recentTrades.length < 10) {
        return { action: 'none', details: { reason: 'insufficient_trades', tradeCount: recentTrades?.length || 0 } };
    }

    const wins = recentTrades.filter(t => (t.pnl || 0) > 0);
    const winRate = wins.length / recentTrades.length;
    const totalPnl = recentTrades.reduce((s, t) => s + (t.pnl || 0), 0);

    // Compute rolling Sharpe
    const returns = recentTrades.map(t => {
        const entry = t.entry_price || t.entryPrice || 1;
        return entry > 0 ? (t.pnl || 0) / entry * 100 : 0;
    });
    const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
    const std = Math.sqrt(variance);
    const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

    const details = {
        tradeCount: recentTrades.length,
        winRate: parseFloat(winRate.toFixed(3)),
        totalPnl: parseFloat(totalPnl.toFixed(2)),
        sharpe: parseFloat(sharpe.toFixed(3)),
    };

    // Decision thresholds
    if (sharpe < 0) {
        return { action: 'demote', details: { ...details, reason: `Rolling Sharpe ${sharpe.toFixed(2)} < 0 — strategy is losing money` } };
    }
    if (sharpe < 0.3) {
        return { action: 'reduce_size', details: { ...details, reason: `Rolling Sharpe ${sharpe.toFixed(2)} < 0.3 — reduce position size 50%`, sizeMultiplier: 0.5 } };
    }
    if (winRate < 0.25 && recentTrades.length >= 20) {
        return { action: 'demote', details: { ...details, reason: `Win rate ${(winRate * 100).toFixed(0)}% < 25% over ${recentTrades.length} trades` } };
    }

    return { action: 'none', details };
}

// Test-only helpers — not part of the public API
function _reset() {
    strategies.clear();
}
function _getAll() {
    return Array.from(strategies.values());
}
function _resetEnabledCache() {
    enabledCache = null;
    enabledCacheFetchedAt = 0;
}
function _forceCacheExpiry() {
    enabledCacheFetchedAt = 0;
}

module.exports = {
    register,
    runStrategies,
    getEnabledStrategies,
    promoteStrategy,
    demoteStrategy,
    evaluateStrategyHealth,
    _reset,
    _getAll,
    _resetEnabledCache,
    _forceCacheExpiry,
};
