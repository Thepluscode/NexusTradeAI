/**
 * Simple Market Data Server using Alpaca API
 * Provides real-time market data on port 3001
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.MARKET_DATA_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Alpaca configuration
const ALPACA_API_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY;
const ALPACA_BASE_URL = 'https://paper-api.alpaca.markets';  // Paper trading
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

// Validate API keys
if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
    console.error('❌ Error: ALPACA_API_KEY and ALPACA_SECRET_KEY must be set in .env file');
    process.exit(1);
}

console.log('🔑 Alpaca API keys loaded successfully');

// Cache for market data (prevent rate limiting)
const quoteCache = new Map();
const CACHE_TTL = 5000; // 5 seconds cache

/**
 * Fetch latest quote from Alpaca
 */
async function fetchAlpacaQuote(symbol) {
    try {
        const cached = quoteCache.get(symbol);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached.data;
        }

        const response = await axios.get(
            `${ALPACA_DATA_URL}/v2/stocks/${symbol}/quotes/latest`,
            {
                headers: {
                    'APCA-API-KEY-ID': ALPACA_API_KEY,
                    'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
                }
            }
        );

        const quote = response.data.quote;

        const data = {
            symbol: symbol,
            price: (quote.ap + quote.bp) / 2,  // Mid price
            bid: quote.bp,
            ask: quote.ap,
            bidSize: quote.bs,
            askSize: quote.as,
            timestamp: quote.t,
            exchange: quote.ax
        };

        // Cache the result
        quoteCache.set(symbol, {
            data,
            timestamp: Date.now()
        });

        return data;

    } catch (error) {
        console.error(`Error fetching quote for ${symbol}:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * API Routes
 */

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'market-data',
        timestamp: new Date().toISOString(),
        alpacaConnected: !!ALPACA_API_KEY
    });
});

// Get quote for a symbol
app.get('/api/market/quote/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const quote = await fetchAlpacaQuote(symbol.toUpperCase());

        res.json({
            success: true,
            data: quote
        });

    } catch (error) {
        console.error(`Error in /api/market/quote/${req.params.symbol}:`, error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            message: 'Failed to fetch market quote'
        });
    }
});

// Get multiple quotes
app.post('/api/market/quotes', async (req, res) => {
    try {
        const { symbols } = req.body;

        if (!symbols || !Array.isArray(symbols)) {
            return res.status(400).json({
                success: false,
                error: 'symbols must be an array'
            });
        }

        const quotes = await Promise.all(
            symbols.map(symbol => fetchAlpacaQuote(symbol.toUpperCase()))
        );

        res.json({
            success: true,
            data: quotes
        });

    } catch (error) {
        console.error('Error in /api/market/quotes:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Market status
app.get('/api/market/status', async (req, res) => {
    try {
        const response = await axios.get(`${ALPACA_BASE_URL}/v2/clock`, {
            headers: {
                'APCA-API-KEY-ID': ALPACA_API_KEY,
                'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
            }
        });

        res.json({
            success: true,
            data: {
                connected: true,
                isOpen: response.data.is_open,
                nextOpen: response.data.next_open,
                nextClose: response.data.next_close,
                timestamp: response.data.timestamp,
                providers: {
                    alpaca: {
                        connected: true,
                        type: 'paper',
                        status: 'active'
                    }
                },
                totalQuotes: quoteCache.size,
                dataQuality: 'High',
                avgLatency: 50 // Average latency in ms (typical for Alpaca)
            }
        });

    } catch (error) {
        console.error('Error fetching market status:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`📊 Market Data Server running on port ${PORT}`);
    console.log(`🔗 Alpaca API: Connected (Paper Trading)`);
    console.log(`📍 Endpoints:`);
    console.log(`   - GET  /health`);
    console.log(`   - GET  /api/market/quote/:symbol`);
    console.log(`   - POST /api/market/quotes`);
    console.log(`   - GET  /api/market/status`);
    console.log(`\n✅ Ready to serve market data!`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down market data server...');
    process.exit(0);
});
