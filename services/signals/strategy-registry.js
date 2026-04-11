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

// Test-only helpers — not part of the public API
function _reset() {
    strategies.clear();
}
function _getAll() {
    return Array.from(strategies.values());
}

module.exports = {
    register,
    _reset,
    _getAll,
};
