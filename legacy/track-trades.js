#!/usr/bin/env node
/**
 * Trade Tracker - Live Performance Monitoring
 * ============================================
 * 
 * Tracks paper trading performance against backtested expectations:
 * - Expected: 65.7% win rate, 2.28 profit factor
 * - Monitors deviation from backtest
 * 
 * Usage: node track-trades.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const TRADING_API = 'http://localhost:3002';
const LOG_DIR = path.join(__dirname, 'logs', 'paper_trading');
const TRACKING_FILE = path.join(LOG_DIR, 'performance_tracking.json');

// Expected metrics from backtest
const EXPECTED = {
    winRate: 0.657,
    profitFactor: 2.28,
    avgWin: 2009,
    avgLoss: 1681,
    sharpe: 1.17
};

// Track actual performance
let tracking = {
    startDate: new Date().toISOString(),
    trades: [],
    stats: {
        totalTrades: 0,
        wins: 0,
        losses: 0,
        totalProfit: 0,
        totalLoss: 0,
        winRate: 0,
        profitFactor: 0
    }
};

// Load existing tracking if available
function loadTracking() {
    try {
        if (fs.existsSync(TRACKING_FILE)) {
            tracking = JSON.parse(fs.readFileSync(TRACKING_FILE, 'utf8'));
            console.log(`📊 Loaded ${tracking.trades.length} existing trades`);
        }
    } catch (e) {
        console.log('Starting fresh tracking');
    }
}

// Save tracking
function saveTracking() {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(TRACKING_FILE, JSON.stringify(tracking, null, 2));
}

// Fetch current positions from trading server
async function fetchPositions() {
    return new Promise((resolve, reject) => {
        http.get(`${TRADING_API}/api/trading/debug-positions`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', reject);
    });
}

// Fetch trading status
async function fetchStatus() {
    return new Promise((resolve, reject) => {
        http.get(`${TRADING_API}/api/trading/status`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', reject);
    });
}

// Calculate current stats
function calculateStats() {
    const wins = tracking.trades.filter(t => t.profit > 0);
    const losses = tracking.trades.filter(t => t.profit <= 0);

    const totalProfit = wins.reduce((sum, t) => sum + t.profit, 0);
    const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit, 0));

    tracking.stats = {
        totalTrades: tracking.trades.length,
        wins: wins.length,
        losses: losses.length,
        totalProfit,
        totalLoss,
        winRate: tracking.trades.length > 0 ? wins.length / tracking.trades.length : 0,
        profitFactor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? Infinity : 0,
        avgWin: wins.length > 0 ? totalProfit / wins.length : 0,
        avgLoss: losses.length > 0 ? totalLoss / losses.length : 0,
        netPnL: totalProfit - totalLoss
    };
}

// Print performance report
function printReport() {
    console.clear();
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║           PAPER TRADING PERFORMANCE TRACKER                   ║');
    console.log('╟────────────────────────────────────────────────────────────────╢');
    console.log('║  BACKTESTED STRATEGY: SMA10/SMA20 Crossover                   ║');
    console.log('╚════════════════════════════════════════════════════════════════╝');
    console.log('');

    console.log('📊 CURRENT PERFORMANCE vs EXPECTED');
    console.log('────────────────────────────────────────');

    const s = tracking.stats;

    console.log(`   Trades:        ${s.totalTrades.toString().padEnd(10)} (tracking since ${tracking.startDate.slice(0, 10)})`);
    console.log(`   Wins:          ${s.wins.toString().padEnd(10)} | Losses: ${s.losses}`);
    console.log('');

    // Win Rate comparison
    const wrDiff = s.winRate - EXPECTED.winRate;
    const wrStatus = wrDiff >= 0 ? '✅' : '⚠️';
    console.log(`   Win Rate:      ${(s.winRate * 100).toFixed(1)}%      ${wrStatus} (expected: ${(EXPECTED.winRate * 100).toFixed(1)}%)`);

    // Profit Factor comparison
    const pfDiff = s.profitFactor - EXPECTED.profitFactor;
    const pfStatus = pfDiff >= 0 ? '✅' : '⚠️';
    console.log(`   Profit Factor: ${s.profitFactor.toFixed(2)}       ${pfStatus} (expected: ${EXPECTED.profitFactor.toFixed(2)})`);

    console.log('');
    console.log('💰 P&L SUMMARY');
    console.log('────────────────────────────────────────');
    console.log(`   Total Profit:  $${s.totalProfit.toFixed(0)}`);
    console.log(`   Total Loss:    $${s.totalLoss.toFixed(0)}`);
    console.log(`   Net P&L:       $${s.netPnL.toFixed(0)} ${s.netPnL >= 0 ? '📈' : '📉'}`);
    console.log('');

    // Show last 5 trades
    if (tracking.trades.length > 0) {
        console.log('📋 RECENT TRADES');
        console.log('────────────────────────────────────────');
        const recent = tracking.trades.slice(-5).reverse();
        for (const t of recent) {
            const status = t.profit > 0 ? '✅' : '❌';
            const pnl = t.profit > 0 ? `+$${t.profit.toFixed(0)}` : `-$${Math.abs(t.profit).toFixed(0)}`;
            console.log(`   ${status} ${t.symbol.padEnd(6)} ${t.side.padEnd(5)} @ $${t.price.toFixed(2).padEnd(8)} ${pnl}`);
        }
        console.log('');
    }

    console.log('Press Ctrl+C to exit | Refreshes every 30s');
    console.log(`Last update: ${new Date().toLocaleTimeString()}`);
}

// Record a new trade (call this when trades complete)
function recordTrade(trade) {
    tracking.trades.push({
        ...trade,
        timestamp: new Date().toISOString()
    });
    calculateStats();
    saveTracking();
    console.log(`📝 Recorded trade: ${trade.symbol} ${trade.side} ${trade.profit > 0 ? '✅' : '❌'} $${trade.profit.toFixed(0)}`);
}

// Main monitoring loop
async function monitor() {
    loadTracking();

    console.log('🔄 Starting performance tracker...');
    console.log('   Connecting to trading server...');

    // Initial check
    try {
        const status = await fetchStatus();
        if (status) {
            console.log(`   ✅ Connected! Trading: ${status.isRunning ? 'ACTIVE' : 'STOPPED'}`);
        }
    } catch (e) {
        console.log('   ⚠️ Trading server not running. Start it with: ./start-paper-trading.sh');
    }

    // Print initial report
    calculateStats();
    printReport();

    // Update every 30 seconds
    setInterval(async () => {
        try {
            await fetchStatus();
            calculateStats();
            printReport();
        } catch (e) {
            console.log('⚠️ Connection lost to trading server');
        }
    }, 30000);
}

// CLI for manual trade recording
if (process.argv[2] === 'add') {
    // Usage: node track-trades.js add AAPL buy 150 200
    loadTracking();
    const [symbol, side, price, profit] = process.argv.slice(3);
    recordTrade({
        symbol: symbol || 'UNKNOWN',
        side: side || 'buy',
        price: parseFloat(price) || 0,
        profit: parseFloat(profit) || 0
    });
    calculateStats();
    printReport();
} else if (process.argv[2] === 'stats') {
    loadTracking();
    calculateStats();
    printReport();
} else {
    monitor();
}
