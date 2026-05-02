// services/signals/strategy-registry.js
'use strict';

const {
    evaluateStrategyEvidence,
    summarizeStrategyEvidence,
} = require('./strategy-evidence');

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

async function getEnabledStrategies(assetClass, regime, dbPool, options = {}) {
    const age = Date.now() - enabledCacheFetchedAt;
    const shouldRefresh = enabledCache === null || age > ENABLED_CACHE_TTL_MS;

    if (shouldRefresh) {
        try {
            const result = await dbPool.query(
                `SELECT strategy_name, asset_class, state, reason FROM strategy_enabled
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

    const rows = enabledCache
        .map(row => {
            const strategy = strategies.get(row.strategy_name);
            if (!strategy) return null;
            return { ...strategy, state: row.state };
        })
        .filter(s => s !== null)
        .filter(s => s.assetClass === assetClass)
        .filter(s => s.regimes.includes(regime) || s.regimes.includes('any'));

    if (!shouldEnforceEvidence(options)) return rows;

    const gated = await Promise.all(rows.map(async strategy => {
        const evidence = await getStrategyEvidence(strategy.name, strategy.assetClass, strategy.state, dbPool, options);
        if (!evidence.allowed) return null;
        return { ...strategy, evidence };
    }));

    return gated.filter(Boolean);
}

function shouldEnforceEvidence(options = {}) {
    if (options.enforceEvidence === true) return true;
    if (options.enforceEvidence === false) return false;
    return process.env.STRATEGY_EVIDENCE_GATE === 'true';
}

function botForAssetClass(assetClass, options = {}) {
    if (options.bot) return options.bot;
    if (assetClass === 'stock') return 'stock';
    if (assetClass === 'forex') return 'forex';
    if (assetClass === 'crypto') return 'crypto';
    return assetClass;
}

async function getStrategyEvidence(strategyName, assetClass, requestedState, dbPool, options = {}) {
    const [backtest, walkForward, livePaper] = await Promise.all([
        fetchLatestBacktest(dbPool, strategyName, assetClass),
        fetchLatestWalkForward(dbPool, strategyName, assetClass),
        fetchLivePaper(dbPool, strategyName, botForAssetClass(assetClass, options)),
    ]);

    return evaluateStrategyEvidence({
        requestedState,
        backtest,
        walkForward,
        livePaper,
        thresholds: options.thresholds || {},
    });
}

async function getStrategyEvidenceSummaries(assetClass, dbPool, options = {}) {
    if (!dbPool) return [];

    const result = await dbPool.query(
        `SELECT strategy_name, asset_class, state, reason
         FROM strategy_enabled
         WHERE asset_class = $1
         ORDER BY strategy_name`,
        [assetClass]
    );

    const summaries = await Promise.all(result.rows.map(async row => {
        const evaluation = await getStrategyEvidence(row.strategy_name, row.asset_class || assetClass, row.state, dbPool, options);
        return summarizeStrategyEvidence({
            name: row.strategy_name,
            state: row.state,
            assetClass: row.asset_class || assetClass,
            evaluation,
        });
    }));

    return summaries;
}

async function fetchLatestBacktest(dbPool, strategyName, assetClass) {
    const result = await dbPool.query(
        `SELECT strategy_name, asset_class, trade_count, win_rate, profit_factor,
                passed_gate_a, passed_walk_forward, tested_at
         FROM backtest_results
         WHERE strategy_name = $1 AND asset_class = $2
         ORDER BY tested_at DESC
         LIMIT 1`,
        [strategyName, assetClass]
    );
    return result.rows[0] || null;
}

async function fetchLatestWalkForward(dbPool, strategyName, assetClass) {
    const result = await dbPool.query(
        `WITH latest_run AS (
            SELECT run_id
            FROM walk_forward_results
            WHERE strategy_name = $1 AND asset_class = $2
            ORDER BY tested_at DESC
            LIMIT 1
         )
         SELECT run_id,
                COUNT(*)::int AS fold_count,
                COALESCE(SUM(test_trade_count), 0)::int AS total_oos_trades,
                COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY test_sharpe), 0)::float AS median_oos_sharpe,
                COALESCE(MIN(test_sharpe), 0)::float AS worst_fold_sharpe,
                (
                    COUNT(*) >= 2
                    AND COALESCE(SUM(test_trade_count), 0) >= 30
                    AND COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY test_sharpe), 0) >= 0.5
                    AND COALESCE(MIN(test_sharpe), 0) >= -0.5
                ) AS passed_gate_b,
                MAX(tested_at) AS tested_at
         FROM walk_forward_results
         WHERE strategy_name = $1
           AND asset_class = $2
           AND run_id = (SELECT run_id FROM latest_run)
         GROUP BY run_id`,
        [strategyName, assetClass]
    );
    return result.rows[0] || null;
}

async function fetchLivePaper(dbPool, strategyName, bot) {
    const result = await dbPool.query(
        `WITH closed AS (
            SELECT COALESCE(pnl_usd, 0)::float AS pnl
            FROM trades
            WHERE strategy = $1
              AND bot = $2
              AND status = 'closed'
              AND exit_time >= NOW() - INTERVAL '90 days'
            ORDER BY exit_time DESC
            LIMIT 100
         )
         SELECT COUNT(*)::int AS trade_count,
                COALESCE(AVG(CASE WHEN pnl > 0 THEN 1.0 ELSE 0.0 END), 0)::float AS win_rate,
                CASE
                    WHEN ABS(SUM(CASE WHEN pnl <= 0 THEN pnl ELSE 0 END)) > 0
                    THEN (SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) / ABS(SUM(CASE WHEN pnl <= 0 THEN pnl ELSE 0 END)))::float
                    WHEN SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) > 0 THEN 10.0
                    ELSE 0.0
                END AS profit_factor,
                COALESCE(SUM(pnl), 0)::float AS total_pnl,
                NOW() AS evaluated_at
         FROM closed`,
        [strategyName, bot]
    );
    return result.rows[0] || null;
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
        ).catch(e => {
            // Non-fatal: alerts table may not exist yet on fresh deploys.
            // Code-quality rule #1: never silent. Log so we can spot a real failure.
            if (!/relation .* does not exist/i.test(e.message || '')) {
                console.warn(`[strategy-registry] Failed to log promotion alert for ${strategyName}: ${e.message}`);
            }
        });

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
        ).catch(e => {
            if (!/relation .* does not exist/i.test(e.message || '')) {
                console.warn(`[strategy-registry] Failed to log demotion alert for ${strategyName}: ${e.message}`);
            }
        });

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
    getStrategyEvidence,
    getStrategyEvidenceSummaries,
    promoteStrategy,
    demoteStrategy,
    evaluateStrategyHealth,
    _reset,
    _getAll,
    _resetEnabledCache,
    _forceCacheExpiry,
};
