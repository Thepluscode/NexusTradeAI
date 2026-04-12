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

// Test-only helpers — not part of the public API
function _reset() {
    strategies.clear();
}
function _getAll() {
    return Array.from(strategies.values());
}

module.exports = {
    register,
    runStrategies,
    _reset,
    _getAll,
};
