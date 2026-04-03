#!/usr/bin/env node
/**
 * Railway entry point for nexus-stock-bot.
 * DO NOT EDIT — source of truth is clients/bot-dashboard/unified-trading-bot.js
 *
 * This thin loader makes the deploy dir's node_modules visible to the source
 * file (which lives in clients/bot-dashboard/ but needs deps from here).
 */
const path = require('path');
process.env.NODE_PATH = [
    process.env.NODE_PATH,
    path.join(__dirname, 'node_modules'),
].filter(Boolean).join(path.delimiter);
require('module').Module._initPaths();

require('../../clients/bot-dashboard/unified-trading-bot.js');
