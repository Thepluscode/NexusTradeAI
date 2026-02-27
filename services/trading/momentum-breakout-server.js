const express = require('express');
const cors = require('cors');
require('dotenv').config();

const MomentumBreakoutStrategy = require('./momentum-breakout-strategy');

const app = express();
const PORT = 3003; // Different port from main trading bot

app.use(cors());
app.use(express.json());

// Initialize strategy
const strategy = new MomentumBreakoutStrategy({
    minVolumeMultiplier: 3.0,     // 3x volume spike
    minPercentGain: 5.0,           // 5%+ intraday gain
    minPrice: 1.0,                 // Min $1
    maxPrice: 500,                 // Max $500
    maxRSI: 80,                    // Not extremely overbought
    profitTarget: 0.10,            // 10% profit target
    stopLoss: 0.05,                // 5% stop loss
    trailingStopDistance: 0.03,    // 3% trailing
    trailingStopActivation: 0.07,  // After 7% profit
    maxPositions: 5,               // Max 5 positions
    scanInterval: 60000            // Scan every 60 seconds
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', strategy: 'momentum-breakout' });
});

// Get current status
app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        data: {
            isRunning: true,
            strategy: 'Momentum Breakout',
            activePositions: strategy.positions.size,
            maxPositions: strategy.config.maxPositions,
            watchlistSize: strategy.watchlist.size,
            positions: Array.from(strategy.positions.entries()).map(([symbol, pos]) => ({
                symbol,
                entry: pos.price,
                shares: pos.shares,
                stopLoss: pos.stopLoss,
                target: pos.target,
                entryTime: pos.entryTime
            })),
            config: {
                minVolumeMultiplier: strategy.config.minVolumeMultiplier,
                minPercentGain: strategy.config.minPercentGain,
                profitTarget: strategy.config.profitTarget * 100,
                stopLoss: strategy.config.stopLoss * 100
            }
        }
    });
});

// Manual scan endpoint
app.post('/api/scan', async (req, res) => {
    try {
        console.log('🔍 Manual scan requested...');
        const breakouts = await strategy.scanForBreakouts();

        res.json({
            success: true,
            breakouts: breakouts,
            count: breakouts.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Execute specific trade
app.post('/api/trade/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;

        // Get snapshot and analyze
        const snapshot = await strategy.getSnapshot(symbol);
        if (!snapshot) {
            return res.status(404).json({
                success: false,
                error: 'Symbol not found or no data available'
            });
        }

        const analysis = strategy.analyzeBreakout(snapshot, symbol);

        if (!analysis.isBreakout) {
            return res.json({
                success: false,
                reason: 'Does not meet breakout criteria',
                analysis: analysis
            });
        }

        // Execute trade
        const order = await strategy.executeBreakout(analysis.signal);

        res.json({
            success: true,
            order: order,
            signal: analysis.signal
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, async () => {
    console.log(`\n🚀 Momentum Breakout Scanner running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}/api/status`);
    console.log(`\n🎯 Strategy: Catch explosive movers like SMX (+110%)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Start the scanner
    await strategy.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Momentum Breakout Scanner...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down Momentum Breakout Scanner...');
    process.exit(0);
});
