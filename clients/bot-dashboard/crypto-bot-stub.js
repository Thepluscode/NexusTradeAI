const express = require('express');
const cors = require('cors');

/**
 * CRYPTO BOT STUB
 * Placeholder server to prevent frontend errors
 * Full implementation coming soon!
 */

const app = express();
const PORT = 3006;

app.use(cors());
app.use(express.json());

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        bot: 'crypto-bot-stub',
        message: 'Crypto bot coming soon!',
        uptime: process.uptime()
    });
});

// Status endpoint (returns placeholder data)
app.get('/api/crypto/status', (req, res) => {
    res.json({
        isRunning: false,
        isPaused: true,
        mode: 'DEVELOPMENT',
        tradingMode: 'PAPER',
        session: 'INACTIVE',
        equity: 0,
        dailyReturn: 0,
        positions: [],
        stats: {
            totalTrades: 0,
            longTrades: 0,
            shortTrades: 0,
            winners: 0,
            losers: 0,
            totalPnL: 0,
            maxDrawdown: 0
        },
        config: {
            symbols: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
            maxPositions: 3,
            stopLoss: 0.05,
            profitTarget: 0.15,
            dailyLossLimit: -1000
        },
        message: 'Crypto bot is not yet implemented. Coming soon!'
    });
});

// Start endpoint
app.post('/api/crypto/start', (req, res) => {
    res.json({
        success: false,
        message: 'Crypto bot is not yet implemented. Coming soon!'
    });
});

// Stop endpoint
app.post('/api/crypto/stop', (req, res) => {
    res.json({
        success: false,
        message: 'Crypto bot is not yet implemented. Coming soon!'
    });
});

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║          CRYPTO BOT STUB - PORT ${PORT}               ║
╠════════════════════════════════════════════════════╣
║  Status: Placeholder (not yet implemented)         ║
║  Purpose: Prevent frontend connection errors       ║
╚════════════════════════════════════════════════════╝
    `);
    console.log(`✅ Crypto bot stub running on port ${PORT}`);
    console.log(`📝 This is a placeholder - full implementation coming soon!\n`);
});
