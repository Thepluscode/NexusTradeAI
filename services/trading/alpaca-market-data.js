/**
 * Alpaca Market Data Integration
 * Real-time market data using Alpaca API
 */

const Alpaca = require('@alpacahq/alpaca-trade-api');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

class AlpacaMarketData {
    constructor() {
        // Initialize Alpaca client with paper trading credentials
        this.alpaca = new Alpaca({
            keyId: process.env.ALPACA_API_KEY,
            secretKey: process.env.ALPACA_SECRET_KEY,
            paper: true, // Always use paper trading
            baseUrl: 'https://paper-api.alpaca.markets', // Explicit paper trading URL
            usePolygon: false // Use Alpaca's own data feed
        });

        this.priceCache = new Map();
        this.cacheExpiry = 5000; // Cache prices for 5 seconds
        this.isInitialized = false;
    }

    async initialize() {
        try {
            // Test connection by getting account info
            const account = await this.alpaca.getAccount();
            console.log(`✅ Connected to Alpaca Paper Trading`);
            console.log(`   Account: ${account.account_number}`);
            console.log(`   Balance: $${parseFloat(account.equity).toFixed(2)}`);
            console.log(`   Buying Power: $${parseFloat(account.buying_power).toFixed(2)}`);

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('❌ Failed to connect to Alpaca:', error.message);
            this.isInitialized = false;
            return false;
        }
    }

    async getCurrentPrice(symbol) {
        try {
            // Check cache first
            const cached = this.priceCache.get(symbol);
            if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
                return cached.price;
            }

            // Get latest trade from Alpaca
            const latestTrade = await this.alpaca.getLatestTrade(symbol);

            if (latestTrade && latestTrade.Price) {
                const price = latestTrade.Price;

                // Cache the price
                this.priceCache.set(symbol, {
                    price: price,
                    timestamp: Date.now()
                });

                return price;
            }

            throw new Error(`No price data available for ${symbol}`);
        } catch (error) {
            console.warn(`⚠️  Alpaca price fetch failed for ${symbol}:`, error.message);

            // Return cached price if available, even if expired
            const cached = this.priceCache.get(symbol);
            if (cached) {
                return cached.price;
            }

            throw error;
        }
    }

    async getMarketData(symbol) {
        try {
            // Get latest quote (bid/ask)
            const quote = await this.alpaca.getLatestQuote(symbol);

            // Get latest trade
            const trade = await this.alpaca.getLatestTrade(symbol);

            // Get snapshot for additional data
            const snapshot = await this.alpaca.getSnapshot(symbol);

            const price = trade?.Price || quote?.BidPrice || 0;
            const volume = snapshot?.DailyBar?.Volume || 0;
            const open = snapshot?.DailyBar?.OpenPrice || price;
            const changePercent = open > 0 ? ((price - open) / open) : 0;

            return {
                symbol: symbol,
                price: price,
                bid: quote?.BidPrice || price,
                ask: quote?.AskPrice || price,
                volume: volume,
                open: open,
                changePercent: changePercent,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.warn(`⚠️  Failed to get market data for ${symbol}:`, error.message);
            throw error;
        }
    }

    async getBulkMarketData(symbols) {
        const results = {};
        const batchSize = 10; // Process 10 symbols at a time to avoid rate limits

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);

            const promises = batch.map(async (symbol) => {
                try {
                    const data = await this.getMarketData(symbol);
                    results[symbol] = data;
                } catch (error) {
                    // Skip symbols that fail
                    console.warn(`Skipping ${symbol}:`, error.message);
                }
            });

            await Promise.all(promises);

            // Rate limiting: wait 100ms between batches
            if (i + batchSize < symbols.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        return results;
    }

    async getAccount() {
        try {
            const account = await this.alpaca.getAccount();
            return {
                equity: parseFloat(account.equity),
                cash: parseFloat(account.cash),
                buying_power: parseFloat(account.buying_power),
                portfolio_value: parseFloat(account.portfolio_value || account.equity),
                daytrade_count: parseInt(account.daytrade_count || 0)
            };
        } catch (error) {
            console.error('❌ Failed to get account info:', error.message);
            throw error;
        }
    }

    async getPositions() {
        try {
            const positions = await this.alpaca.getPositions();
            return positions.map(pos => ({
                symbol: pos.symbol,
                qty: parseFloat(pos.qty),
                side: pos.side,
                entry_price: parseFloat(pos.avg_entry_price),
                current_price: parseFloat(pos.current_price),
                market_value: parseFloat(pos.market_value),
                unrealized_pl: parseFloat(pos.unrealized_pl),
                unrealized_plpc: parseFloat(pos.unrealized_plpc)
            }));
        } catch (error) {
            console.error('❌ Failed to get positions:', error.message);
            return [];
        }
    }

    async placeOrder(symbol, qty, side, type = 'market') {
        try {
            const order = await this.alpaca.createOrder({
                symbol: symbol,
                qty: Math.abs(qty),
                side: side, // 'buy' or 'sell'
                type: type, // 'market', 'limit', 'stop', 'stop_limit'
                time_in_force: 'day'
            });

            console.log(`✅ Order placed: ${side.toUpperCase()} ${qty} ${symbol}`);

            return {
                success: true,
                orderId: order.id,
                symbol: symbol,
                qty: qty,
                side: side,
                status: order.status
            };
        } catch (error) {
            console.error(`❌ Order failed: ${side} ${qty} ${symbol}:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    isConnected() {
        return this.isInitialized;
    }

    /**
     * FIX #4: Get historical bars for trend analysis
     * CHANGED: Uses 1-minute bars for REAL-TIME trend detection (was 5-minute)
     * This gives 30-minute lookback for fresh momentum signals
     */
    async getHistoricalBars(symbol, limit = 30) {
        try {
            const axios = require('axios');

            // Calculate date range (last 1 day for 1-minute bars)
            const end = new Date();
            const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

            const response = await axios.get(
                `https://data.alpaca.markets/v2/stocks/${symbol}/bars`,
                {
                    headers: {
                        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
                        'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY
                    },
                    params: {
                        timeframe: '1Min',  // FIX #4: Changed from 5Min to 1Min for real-time trend
                        start: start.toISOString(),
                        end: end.toISOString(),
                        limit: limit,
                        adjustment: 'raw',
                        feed: 'iex'  // Use IEX data feed (free tier compatible)
                    }
                }
            );

            if (response.data && response.data.bars) {
                return response.data.bars.map(bar => ({
                    price: bar.c, // close price
                    open: bar.o,
                    high: bar.h,
                    low: bar.l,
                    volume: bar.v,
                    timestamp: new Date(bar.t).getTime()
                }));
            }

            return [];
        } catch (error) {
            console.warn(`⚠️  Failed to get historical bars for ${symbol}:`, error.message);
            return [];
        }
    }
}

module.exports = AlpacaMarketData;
