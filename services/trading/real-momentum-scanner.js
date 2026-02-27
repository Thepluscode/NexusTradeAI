const axios = require('axios');
const popularStocks = require('./popular-stocks-list');

/**
 * REAL MOMENTUM SCANNER
 *
 * Scans a curated list of volatile stocks that frequently make big moves
 * SMX, QUBT, SMCI, and other runners are included
 */

class RealMomentumScanner {
    constructor(config = {}) {
        this.config = {
            minVolumeSpike: 3.0,           // 3x normal volume
            minPercentGain: 5.0,            // 5% minimum gain
            minPrice: 1.0,                  // Min $1
            maxPrice: 1000,                 // Max $1000
            profitTarget: 0.10,             // 10% profit
            stopLoss: 0.05,                 // 5% stop
            maxPositions: 5,
            ...config
        };

        this.alpacaConfig = {
            baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
            apiKey: process.env.ALPACA_API_KEY,
            secretKey: process.env.ALPACA_SECRET_KEY,
            dataURL: 'https://data.alpaca.markets',
            wsURL: 'wss://stream.data.alpaca.markets/v2/iex'
        };

        this.stockData = new Map(); // Track volume and price for each stock
        this.positions = new Map();
        this.watchlist = new Set(); // Stocks showing interesting activity
    }

    /**
     * Scan curated list of volatile stocks
     */
    async getMarketMovers() {
        try {
            const symbols = popularStocks.getAllSymbols();
            console.log(`🔍 Scanning ${symbols.length} volatile stocks (including SMX)...`);

            const movers = [];
            const batchSize = 20;

            // Process in batches to avoid overwhelming the API
            for (let i = 0; i < symbols.length; i += batchSize) {
                const batch = symbols.slice(i, i + batchSize);

                const promises = batch.map(symbol => this.analyzeStock(symbol));
                const results = await Promise.allSettled(promises);

                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value) {
                        movers.push(result.value);
                    }
                }

                // Rate limit between batches
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Sort by percent change
            movers.sort((a, b) => parseFloat(b.percentChange) - parseFloat(a.percentChange));

            return movers;

        } catch (error) {
            console.error('❌ Error scanning stocks:', error.message);
            return [];
        }
    }

    /**
     * Analyze a single stock for breakout
     */
    async analyzeStock(symbol) {
        try {
            // Get today's intraday bars to calculate true intraday change
            const today = new Date().toISOString().split('T')[0];
            const barUrl = `${this.alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
            const barResponse = await axios.get(barUrl, {
                headers: {
                    'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey
                },
                params: {
                    start: today,
                    timeframe: '1Min',
                    feed: 'iex',
                    limit: 10000 // Get all bars for today
                }
            });

            if (!barResponse.data || !barResponse.data.bars || barResponse.data.bars.length === 0) {
                return null;
            }

            const bars = barResponse.data.bars;
            const firstBar = bars[0]; // Market open bar
            const lastBar = bars[bars.length - 1]; // Most recent bar

            const todayOpen = firstBar.o;
            const current = lastBar.c;

            // Calculate total volume so far today
            const volumeToday = bars.reduce((sum, bar) => sum + bar.v, 0);

            // Get previous day's bar for volume comparison
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const prevDate = yesterday.toISOString().split('T')[0];

            const prevBarUrl = `${this.alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
            const prevBarResponse = await axios.get(prevBarUrl, {
                headers: {
                    'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey
                },
                params: {
                    start: prevDate,
                    end: prevDate,
                    timeframe: '1Day',
                    feed: 'iex',
                    limit: 1
                }
            });

            const prevVolume = prevBarResponse.data?.bars?.[0]?.v || volumeToday;

            const percentChange = ((current - todayOpen) / todayOpen) * 100;
            const volumeRatio = volumeToday / (prevVolume || 1);

            // DEBUG: Log top movers even if they don't meet criteria
            if (percentChange >= 2.0 || volumeRatio >= 1.2) {
                console.log(`🔍 DEBUG ${symbol}: Price $${current.toFixed(2)}, Open $${todayOpen.toFixed(2)}, Change ${percentChange.toFixed(2)}%, Vol ${volumeToday.toLocaleString()}, PrevVol ${prevVolume.toLocaleString()}, Ratio ${volumeRatio.toFixed(2)}x`);
            }

            // Check criteria
            if (
                percentChange >= this.config.minPercentGain &&
                volumeRatio >= this.config.minVolumeSpike &&
                current >= this.config.minPrice &&
                current <= this.config.maxPrice
            ) {
                return {
                    symbol,
                    price: current,
                    percentChange: percentChange.toFixed(2),
                    volumeRatio: volumeRatio.toFixed(2),
                    volume: volumeToday,
                    prevVolume
                };
            }

            return null;

        } catch (error) {
            // Silently skip stocks with no data
            return null;
        }
    }

    /**
     * Get detailed quote for a symbol
     */
    async getQuote(symbol) {
        try {
            const url = `${this.alpacaConfig.dataURL}/v2/stocks/${symbol}/quotes/latest`;
            const response = await axios.get(url, {
                headers: {
                    'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey
                },
                params: {
                    feed: 'iex'
                }
            });

            return response.data.quote;
        } catch (error) {
            console.error(`❌ Error getting quote for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Execute a breakout trade
     */
    async executeTrade(mover) {
        try {
            console.log(`\n💰 Executing trade for ${mover.symbol}...`);

            // Get account info
            const accountUrl = `${this.alpacaConfig.baseURL}/v2/account`;
            const accountResponse = await axios.get(accountUrl, {
                headers: {
                    'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey
                }
            });

            const equity = parseFloat(accountResponse.data.equity);
            const positionSize = equity * 0.01; // 1% per trade
            const shares = Math.floor(positionSize / mover.price);

            if (shares < 1) {
                console.log(`⚠️  Position too small for ${mover.symbol}`);
                return null;
            }

            // Place market order
            const orderUrl = `${this.alpacaConfig.baseURL}/v2/orders`;
            const order = {
                symbol: mover.symbol,
                qty: shares,
                side: 'buy',
                type: 'market',
                time_in_force: 'day'
            };

            const orderResponse = await axios.post(orderUrl, order, {
                headers: {
                    'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey
                }
            });

            const stopLoss = mover.price * (1 - this.config.stopLoss);
            const target = mover.price * (1 + this.config.profitTarget);

            console.log(`✅ ORDER PLACED: ${mover.symbol}`);
            console.log(`   Shares: ${shares}`);
            console.log(`   Entry: $${mover.price}`);
            console.log(`   Gain: ${mover.percentChange}%`);
            console.log(`   Volume: ${mover.volumeRatio}x`);
            console.log(`   Stop Loss: $${stopLoss.toFixed(2)}`);
            console.log(`   Target: $${target.toFixed(2)}`);

            this.positions.set(mover.symbol, {
                ...mover,
                shares,
                entry: mover.price,
                stopLoss,
                target,
                orderId: orderResponse.data.id,
                entryTime: new Date()
            });

            return orderResponse.data;

        } catch (error) {
            console.error(`❌ Error executing trade:`, error.message);
            if (error.response) {
                console.error('Response:', error.response.data);
            }
            return null;
        }
    }

    /**
     * Main scanning loop
     */
    async scan() {
        console.log('\n🔍 Scanning for momentum breakouts...');
        console.log(`📋 Criteria: ${this.config.minPercentGain}%+ gain, ${this.config.minVolumeSpike}x volume`);

        try {
            const movers = await this.getMarketMovers();

            if (movers.length === 0) {
                console.log('⏳ No breakouts found this cycle');
                return;
            }

            console.log(`\n🚀 Found ${movers.length} potential breakouts:`);
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Display top movers
            for (const mover of movers.slice(0, 10)) {
                console.log(`📈 ${mover.symbol.padEnd(6)} +${mover.percentChange}%  (Vol: ${mover.volumeRatio}x)  $${mover.price}`);
            }

            // Execute trades for top movers if we have room
            if (this.positions.size < this.config.maxPositions) {
                const available = this.config.maxPositions - this.positions.size;
                const toTrade = movers.slice(0, available);

                for (const mover of toTrade) {
                    // Check if we already have this position
                    if (!this.positions.has(mover.symbol)) {
                        await this.executeTrade(mover);
                        // Rate limit
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }
            } else {
                console.log(`\n⏸️  Max positions (${this.config.maxPositions}) reached`);
            }

        } catch (error) {
            console.error('❌ Scan error:', error.message);
        }
    }

    /**
     * Monitor and manage open positions with trailing stops
     */
    async managePositions() {
        if (this.positions.size === 0) return;

        console.log('\n📊 Monitoring open positions...');

        for (const [symbol, position] of this.positions.entries()) {
            try {
                // Get current price
                const quote = await this.getQuote(symbol);
                if (!quote) continue;

                const currentPrice = quote.ap; // Ask price
                const entryPrice = position.entry;
                const currentGain = ((currentPrice - entryPrice) / entryPrice) * 100;

                // Update high water mark
                if (!position.highPrice || currentPrice > position.highPrice) {
                    position.highPrice = currentPrice;
                    position.highGain = currentGain;
                }

                // Calculate trailing stop (lock in 50% of gains after hitting +10%)
                let trailingStop = position.stopLoss;
                if (currentGain >= 10) {
                    // Lock in half the gains - if stock went to +15%, stop is at +7.5%
                    const gainAboveEntry = currentGain / 2;
                    trailingStop = entryPrice * (1 + gainAboveEntry / 100);

                    // Update if this is a new high
                    if (trailingStop > position.stopLoss) {
                        console.log(`📈 ${symbol}: Trailing stop raised to $${trailingStop.toFixed(2)} (was $${position.stopLoss.toFixed(2)})`);
                        position.stopLoss = trailingStop;
                    }
                }

                console.log(`   ${symbol}: Entry $${entryPrice.toFixed(2)} → Current $${currentPrice.toFixed(2)} (${currentGain >= 0 ? '+' : ''}${currentGain.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)} | Target: $${position.target.toFixed(2)}`);

                // Check exit conditions
                if (currentPrice <= position.stopLoss) {
                    console.log(`\n🛑 STOP LOSS HIT: ${symbol} at $${currentPrice.toFixed(2)}`);
                    await this.closePosition(symbol, currentPrice, 'Stop Loss');
                } else if (currentPrice >= position.target) {
                    console.log(`\n💰 PROFIT TARGET HIT: ${symbol} at $${currentPrice.toFixed(2)}`);
                    await this.closePosition(symbol, currentPrice, 'Profit Target');
                }

            } catch (error) {
                console.error(`❌ Error monitoring ${symbol}:`, error.message);
            }
        }
    }

    /**
     * Close a position
     */
    async closePosition(symbol, exitPrice, reason) {
        try {
            const position = this.positions.get(symbol);
            if (!position) return;

            const profitLoss = ((exitPrice - position.entry) / position.entry) * 100;
            const plAmount = position.shares * (exitPrice - position.entry);

            // Place sell order
            const orderUrl = `${this.alpacaConfig.baseURL}/v2/orders`;
            const order = {
                symbol: symbol,
                qty: position.shares,
                side: 'sell',
                type: 'market',
                time_in_force: 'day'
            };

            await axios.post(orderUrl, order, {
                headers: {
                    'APCA-API-KEY-ID': this.alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey
                }
            });

            console.log(`✅ POSITION CLOSED: ${symbol}`);
            console.log(`   Reason: ${reason}`);
            console.log(`   Entry: $${position.entry.toFixed(2)}`);
            console.log(`   Exit: $${exitPrice.toFixed(2)}`);
            console.log(`   Shares: ${position.shares}`);
            console.log(`   P/L: ${profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)}% ($${plAmount >= 0 ? '+' : ''}${plAmount.toFixed(2)})`);

            // Remove from positions
            this.positions.delete(symbol);

        } catch (error) {
            console.error(`❌ Error closing position ${symbol}:`, error.message);
        }
    }

    /**
     * Start continuous scanning
     */
    async start() {
        console.log('\n🚀 REAL MOMENTUM SCANNER STARTING...');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`📊 Strategy: Catch stocks like SMX (+150%)`);
        console.log(`🎯 Min Gain: ${this.config.minPercentGain}%`);
        console.log(`📈 Min Volume: ${this.config.minVolumeSpike}x`);
        console.log(`💰 Profit Target: ${this.config.profitTarget * 100}%`);
        console.log(`🛑 Stop Loss: ${this.config.stopLoss * 100}%`);
        console.log(`📈 Trailing Stop: Locks in 50% of gains after +10%`);
        console.log(`🎲 Max Positions: ${this.config.maxPositions}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

        // Run initial scan
        await this.scan();

        // Set up interval scanning (scan for new entries + manage positions)
        setInterval(async () => {
            await this.managePositions(); // Monitor existing positions first
            await this.scan(); // Then look for new entries
        }, 60000); // Every 60 seconds
    }

    /**
     * Get current status
     */
    getStatus() {
        return {
            isRunning: true,
            strategy: 'Real Momentum Scanner',
            activePositions: this.positions.size,
            maxPositions: this.config.maxPositions,
            positions: Array.from(this.positions.entries()).map(([symbol, pos]) => ({
                symbol,
                entry: pos.entry,
                current: pos.price,
                gain: pos.percentChange,
                volumeSpike: pos.volumeRatio,
                shares: pos.shares,
                stopLoss: pos.stopLoss,
                target: pos.target
            })),
            config: this.config
        };
    }
}

module.exports = RealMomentumScanner;
