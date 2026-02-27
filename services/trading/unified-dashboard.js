/**
 * UNIFIED TRADING DASHBOARD
 * 
 * 20X ENGINEER QUALITY - Professional Dashboard Server
 * 
 * Features:
 * - Real-time status for all 3 bots (Stock, Forex, Crypto)
 * - Live P&L tracking and equity display
 * - Kelly Criterion statistics
 * - Quick controls (Start/Stop/Pause)
 * - Modern dark-themed UI
 * - WebSocket for live updates
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');

const app = express();
const server = http.createServer(app);

const PORT = process.env.DASHBOARD_PORT || 3010;

// Bot endpoints
const BOTS = {
    stock: { name: 'Stock Bot', port: 3002, color: '#10b981' },
    forex: { name: 'Forex Bot', port: 3005, color: '#3b82f6' },
    crypto: { name: 'Crypto Bot', port: 3006, color: '#f59e0b' }
};

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dashboard-public')));

// Proxy API calls to individual bots
const axios = require('axios').default;

// Aggregate status from all bots
app.get('/api/status/all', async (req, res) => {
    const results = {};

    for (const [key, bot] of Object.entries(BOTS)) {
        try {
            const response = await axios.get(`http://localhost:${bot.port}/health`, { timeout: 2000 });
            results[key] = {
                ...response.data,
                online: true,
                port: bot.port,
                color: bot.color
            };
        } catch (error) {
            results[key] = {
                online: false,
                error: error.message,
                port: bot.port,
                color: bot.color
            };
        }
    }

    res.json(results);
});

// Get detailed status for a specific bot
app.get('/api/status/:bot', async (req, res) => {
    const bot = BOTS[req.params.bot];
    if (!bot) {
        return res.status(404).json({ error: 'Bot not found' });
    }

    try {
        const response = await axios.get(`http://localhost:${bot.port}/api/${req.params.bot === 'stock' ? 'trading' : req.params.bot}/status`, { timeout: 5000 });
        res.json({ ...response.data, online: true });
    } catch (error) {
        res.status(503).json({ online: false, error: error.message });
    }
});

// Control endpoints (start/stop/pause)
app.post('/api/control/:bot/:action', async (req, res) => {
    const bot = BOTS[req.params.bot];
    const action = req.params.action;

    if (!bot) {
        return res.status(404).json({ error: 'Bot not found' });
    }

    const apiPath = req.params.bot === 'stock' ? 'trading' : req.params.bot;

    try {
        const response = await axios.post(`http://localhost:${bot.port}/api/${apiPath}/${action}`, {}, { timeout: 10000 });
        res.json(response.data);
    } catch (error) {
        res.status(503).json({ error: error.message });
    }
});

// Serve dashboard HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard-public', 'index.html'));
});

// Start server
server.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎯 UNIFIED TRADING DASHBOARD');
    console.log('='.repeat(60));
    console.log(`\n✅ Dashboard running at: http://localhost:${PORT}`);
    console.log('\n📊 Monitoring bots:');
    for (const [key, bot] of Object.entries(BOTS)) {
        console.log(`   • ${bot.name}: http://localhost:${bot.port}`);
    }
    console.log('\n' + '='.repeat(60) + '\n');
});

module.exports = app;
