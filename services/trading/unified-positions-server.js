const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

/**
 * Unified Positions API
 *
 * Pulls REAL positions from Alpaca account
 * This is the source of truth - not the individual bot's internal state
 */

const app = express();
const PORT = 3005;

app.use(cors());
app.use(express.json());

const alpacaConfig = {
    baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    apiKey: process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY
};

// Get real positions from Alpaca
app.get('/api/positions', async (req, res) => {
    try {
        const positionsUrl = `${alpacaConfig.baseURL}/v2/positions`;
        const response = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const positions = response.data.map(pos => ({
            symbol: pos.symbol,
            qty: parseFloat(pos.qty),
            side: pos.side,
            avgEntry: parseFloat(pos.avg_entry_price),
            currentPrice: parseFloat(pos.current_price),
            marketValue: parseFloat(pos.market_value),
            unrealizedPL: parseFloat(pos.unrealized_pl),
            unrealizedPLPercent: parseFloat(pos.unrealized_plpc) * 100,
            costBasis: parseFloat(pos.cost_basis),
            changeToday: parseFloat(pos.change_today) * 100
        }));

        res.json({
            success: true,
            count: positions.length,
            positions: positions
        });

    } catch (error) {
        console.error('Error fetching positions:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get account summary
app.get('/api/account', async (req, res) => {
    try {
        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const response = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const account = response.data;

        res.json({
            success: true,
            account: {
                equity: parseFloat(account.equity),
                cash: parseFloat(account.cash),
                buyingPower: parseFloat(account.buying_power),
                portfolioValue: parseFloat(account.portfolio_value),
                lastEquity: parseFloat(account.last_equity),
                profitToday: parseFloat(account.equity) - parseFloat(account.last_equity),
                profitTodayPercent: ((parseFloat(account.equity) - parseFloat(account.last_equity)) / parseFloat(account.last_equity)) * 100
            }
        });

    } catch (error) {
        console.error('Error fetching account:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Combined dashboard data
app.get('/api/dashboard', async (req, res) => {
    try {
        // Get positions
        const positionsUrl = `${alpacaConfig.baseURL}/v2/positions`;
        const positionsResponse = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        // Get account
        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const positions = positionsResponse.data.map(pos => ({
            symbol: pos.symbol,
            qty: parseFloat(pos.qty),
            avgEntry: parseFloat(pos.avg_entry_price),
            currentPrice: parseFloat(pos.current_price),
            unrealizedPL: parseFloat(pos.unrealized_pl),
            unrealizedPLPercent: parseFloat(pos.unrealized_plpc) * 100,
            marketValue: parseFloat(pos.market_value)
        }));

        const account = accountResponse.data;
        const equity = parseFloat(account.equity);
        const lastEquity = parseFloat(account.last_equity);

        res.json({
            success: true,
            data: {
                activePositions: positions.length,
                positions: positions,
                account: {
                    equity: equity,
                    cash: parseFloat(account.cash),
                    buyingPower: parseFloat(account.buying_power),
                    profitToday: equity - lastEquity,
                    profitTodayPercent: ((equity - lastEquity) / lastEquity) * 100
                },
                isRunning: true,
                strategy: 'All Active Bots (Real Alpaca Data)'
            }
        });

    } catch (error) {
        console.error('Error fetching dashboard data:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`\n📊 Unified Positions API running on port ${PORT}`);
    console.log(`🔗 Real Alpaca Data: http://localhost:${PORT}/api/dashboard`);
    console.log(`📈 Positions: http://localhost:${PORT}/api/positions`);
    console.log(`💰 Account: http://localhost:${PORT}/api/account\n`);
});
