'use strict';

const fs = require('fs');
const path = require('path');
const registry = require('../strategy-registry');

/**
 * Auto-loader: walks this directory, requires every .js file except
 * this index.js itself, and registers each as a strategy.
 * Each strategy module must export a valid strategy object.
 */
function loadAllStrategies() {
    const dir = __dirname;
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.js'))
        .filter(f => f !== 'index.js');

    for (const file of files) {
        const filePath = path.join(dir, file);
        try {
            const strategy = require(filePath);
            registry.register(strategy);
        } catch (e) {
            console.error(`[strategies/index] failed to load ${file}: ${e.message}`);
        }
    }
    return registry._getAll();
}

module.exports = { loadAllStrategies };
