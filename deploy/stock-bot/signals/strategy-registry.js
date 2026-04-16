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
    _reset,
    _getAll,
    _resetEnabledCache,
    _forceCacheExpiry,
};
