const express = require('express');
const cors = require('cors');
require('dotenv').config();

const RealMomentumScanner = require('./real-momentum-scanner');

const app = express();
const PORT = 3004; // Different port

app.use(cors());
app.use(express.json());

// Initialize scanner - ULTRA AGGRESSIVE: Ignore volume, focus on price action
const scanner = new RealMomentumScanner({
    minVolumeSpike: 0.05,      // 0.05x volume (basically ignore volume)
    minPercentGain: 10.0,      // 10%+ gain (VERY strong move = high conviction)
    minPrice: 1.0,             // $1 minimum
    maxPrice: 1000,            // $1000 maximum
    profitTarget: 0.20,        // 20% target (ride big momentum)
    stopLoss: 0.07,            // 7% stop (wider for volatility)
    maxPositions: 3            // Max 3 positions (concentrated bets)
});

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', scanner: 'real-momentum' });
});

app.get('/api/status', (req, res) => {
    res.json({
        success: true,
        data: scanner.getStatus()
    });
});

app.post('/api/scan', async (req, res) => {
    try {
        await scanner.scan();
        res.json({
            success: true,
            message: 'Scan completed',
            positions: scanner.positions.size
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
    console.log(`\n🚀 Real Momentum Scanner running on port ${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/status\n`);

    // Start scanner
    await scanner.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    process.exit(0);
});
