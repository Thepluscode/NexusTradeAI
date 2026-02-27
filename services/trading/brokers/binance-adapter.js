/**
 * Binance Crypto Exchange Adapter
 * Connects to Binance for cryptocurrency trading
 *
 * Prerequisites:
 * 1. Create Binance account at https://www.binance.com
 * 2. Generate API keys in Account -> API Management
 * 3. npm install binance-api-node
 *
 * Best for: Cryptocurrency spot and futures trading
 */

const EventEmitter = require('events');
const Binance = require('binance-api-node').default;

class BinanceAdapter extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            apiKey: config.apiKey || process.env.BINANCE_API_KEY,
            apiSecret: config.apiSecret || process.env.BINANCE_API_SECRET,

            // Use testnet for paper trading
            useTestnet: config.useTestnet !== false, // Default to testnet
            testnetUrl: 'https://testnet.binance.vision',

            // Trading settings
            defaultQuantity: config.defaultQuantity || 0.001, // BTC amount
            recvWindow: config.recvWindow || 60000,
        };

        this.connected = false;
        this.positions = new Map();
        this.client = null;
        this.priceStreams = new Map();
    }

    /**
     * Connect to Binance
     */
    async connect() {
        try {
            if (!this.config.apiKey || !this.config.apiSecret) {
                throw new Error('Binance API key and secret required');
            }

            // Initialize Binance client
            const clientConfig = {
                apiKey: this.config.apiKey,
                apiSecret: this.config.apiSecret,
            };

            if (this.config.useTestnet) {
                clientConfig.httpBase = this.config.testnetUrl;
                clientConfig.wsBase = 'wss://testnet.binance.vision/ws';
            }

            this.client = Binance(clientConfig);

            // Test connection
            const serverTime = await this.client.time();
            console.log(`✅ Connected to Binance ${this.config.useTestnet ? 'Testnet' : 'Live'}`);
            console.log(`   Server time: ${new Date(serverTime).toISOString()}`);

            // Get account info
            const accountInfo = await this.getAccountInfo();
            console.log(`   Account balances: ${accountInfo.balances.length} assets`);

            this.connected = true;

            // Sync open orders as positions
            await this.syncPositions();

            return true;

        } catch (error) {
            console.error('❌ Binance connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Get account information
     */
    async getAccountInfo() {
        try {
            const accountInfo = await this.client.accountInfo({
                recvWindow: this.config.recvWindow
            });

            // Calculate total balance in USDT
            let totalBalanceUSDT = 0;
            const balances = accountInfo.balances
                .filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
                .map(b => {
                    const free = parseFloat(b.free);
                    const locked = parseFloat(b.locked);
                    const total = free + locked;

                    return {
                        asset: b.asset,
                        free,
                        locked,
                        total
                    };
                });

            return {
                balances,
                canTrade: accountInfo.canTrade,
                canWithdraw: accountInfo.canWithdraw,
                canDeposit: accountInfo.canDeposit,
                totalBalanceUSDT
            };

        } catch (error) {
            console.error('Error getting account info:', error.message);
            throw error;
        }
    }

    /**
     * Open a position (place market order)
     */
    async openPosition(symbol, direction, params = {}) {
        try {
            // Convert symbol format (BTCUSD -> BTCUSDT for Binance)
            const binanceSymbol = symbol.replace('USD', 'USDT');

            const side = direction === 'long' ? 'BUY' : 'SELL';

            // Calculate quantity
            let quantity = params.quantity || this.config.defaultQuantity;

            // If using USDT amount instead of base quantity
            if (params.usdtAmount) {
                const currentPrice = await this.getCurrentPrice(symbol);
                quantity = params.usdtAmount / currentPrice;
            }

            // Round quantity to proper precision
            quantity = this.roundQuantity(binanceSymbol, quantity);

            // Place market order
            const order = await this.client.order({
                symbol: binanceSymbol,
                side: side,
                type: 'MARKET',
                quantity: quantity.toString(),
                recvWindow: this.config.recvWindow
            });

            console.log(`✅ Opened ${direction} position on ${binanceSymbol}:`);
            console.log(`   Quantity: ${quantity}`);
            console.log(`   Avg Price: ${order.price || order.fills[0]?.price}`);
            console.log(`   Order ID: ${order.orderId}`);

            // Calculate average fill price
            let avgPrice = 0;
            let totalQty = 0;

            if (order.fills && order.fills.length > 0) {
                for (const fill of order.fills) {
                    avgPrice += parseFloat(fill.price) * parseFloat(fill.qty);
                    totalQty += parseFloat(fill.qty);
                }
                avgPrice = avgPrice / totalQty;
            } else {
                avgPrice = parseFloat(order.price);
            }

            // Create position object
            const position = {
                id: `binance-${order.orderId}`,
                orderId: order.orderId,
                symbol: binanceSymbol,
                direction,
                quantity: parseFloat(order.executedQty || quantity),
                entry: avgPrice,
                stopLoss: params.stopLoss,
                takeProfit: params.takeProfit,
                openTime: new Date(order.transactTime),
                strategy: params.strategy,
                status: order.status
            };

            this.positions.set(position.id, position);

            // Place stop loss order if specified
            if (params.stopLoss) {
                await this.placeStopLoss(position, params.stopLoss);
            }

            // Place take profit order if specified
            if (params.takeProfit) {
                await this.placeTakeProfit(position, params.takeProfit);
            }

            this.emit('positionOpened', position);

            return position;

        } catch (error) {
            console.error(`❌ Failed to open ${direction} position on ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * Close a position (reverse order)
     */
    async closePosition(positionId) {
        try {
            const position = this.positions.get(positionId);

            if (!position) {
                throw new Error(`Position ${positionId} not found`);
            }

            // Reverse the side to close
            const side = position.direction === 'long' ? 'SELL' : 'BUY';

            // Place market order to close
            const order = await this.client.order({
                symbol: position.symbol,
                side: side,
                type: 'MARKET',
                quantity: position.quantity.toString(),
                recvWindow: this.config.recvWindow
            });

            console.log(`✅ Closed position ${positionId} for ${position.symbol}`);

            // Calculate P&L
            const avgClosePrice = order.fills ?
                order.fills.reduce((sum, fill) => sum + parseFloat(fill.price) * parseFloat(fill.qty), 0) / parseFloat(order.executedQty)
                : parseFloat(order.price);

            const pnl = position.direction === 'long'
                ? (avgClosePrice - position.entry) * position.quantity
                : (position.entry - avgClosePrice) * position.quantity;

            console.log(`   Entry: $${position.entry.toFixed(2)}`);
            console.log(`   Exit: $${avgClosePrice.toFixed(2)}`);
            console.log(`   P&L: $${pnl.toFixed(2)}`);

            this.positions.delete(positionId);
            this.emit('positionClosed', { position, order, pnl });

            return { order, pnl };

        } catch (error) {
            console.error(`❌ Failed to close position ${positionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Place stop loss order
     */
    async placeStopLoss(position, stopPrice) {
        try {
            const side = position.direction === 'long' ? 'SELL' : 'BUY';

            const stopOrder = await this.client.order({
                symbol: position.symbol,
                side: side,
                type: 'STOP_LOSS_LIMIT',
                quantity: position.quantity.toString(),
                price: stopPrice.toString(),
                stopPrice: stopPrice.toString(),
                timeInForce: 'GTC',
                recvWindow: this.config.recvWindow
            });

            console.log(`📉 Stop loss placed at $${stopPrice} for ${position.symbol}`);

            return stopOrder;

        } catch (error) {
            console.error('Error placing stop loss:', error.message);
        }
    }

    /**
     * Place take profit order
     */
    async placeTakeProfit(position, takeProfitPrice) {
        try {
            const side = position.direction === 'long' ? 'SELL' : 'BUY';

            const tpOrder = await this.client.order({
                symbol: position.symbol,
                side: side,
                type: 'TAKE_PROFIT_LIMIT',
                quantity: position.quantity.toString(),
                price: takeProfitPrice.toString(),
                stopPrice: takeProfitPrice.toString(),
                timeInForce: 'GTC',
                recvWindow: this.config.recvWindow
            });

            console.log(`📈 Take profit placed at $${takeProfitPrice} for ${position.symbol}`);

            return tpOrder;

        } catch (error) {
            console.error('Error placing take profit:', error.message);
        }
    }

    /**
     * Get current price for a symbol
     */
    async getCurrentPrice(symbol) {
        try {
            // Convert symbol format
            const binanceSymbol = symbol.replace('USD', 'USDT');

            const ticker = await this.client.prices({ symbol: binanceSymbol });

            return parseFloat(ticker[binanceSymbol]);

        } catch (error) {
            console.error(`Error getting price for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Subscribe to real-time price updates
     */
    subscribeMarketData(symbol) {
        const binanceSymbol = symbol.replace('USD', 'USDT').toLowerCase();

        const clean = this.client.ws.ticker(binanceSymbol, ticker => {
            this.emit('price', {
                symbol: binanceSymbol.toUpperCase(),
                price: parseFloat(ticker.curDayClose),
                bid: parseFloat(ticker.bestBid),
                ask: parseFloat(ticker.bestAsk),
                volume: parseFloat(ticker.volume),
                priceChange: parseFloat(ticker.priceChange),
                priceChangePercent: parseFloat(ticker.priceChangePercent)
            });
        });

        this.priceStreams.set(symbol, clean);

        console.log(`📊 Subscribed to market data for ${binanceSymbol}`);

        return clean;
    }

    /**
     * Unsubscribe from market data
     */
    unsubscribeMarketData(symbol) {
        const clean = this.priceStreams.get(symbol);
        if (clean) {
            clean();
            this.priceStreams.delete(symbol);
        }
    }

    /**
     * Round quantity to proper precision for symbol
     */
    roundQuantity(symbol, quantity) {
        // Simple rounding for now - in production, fetch from exchange info
        const precision = symbol.includes('BTC') ? 6 : 2;
        return parseFloat(quantity.toFixed(precision));
    }

    /**
     * Sync positions (open orders)
     */
    async syncPositions() {
        try {
            const openOrders = await this.client.openOrders({
                recvWindow: this.config.recvWindow
            });

            console.log(`📊 Found ${openOrders.length} open orders on Binance`);

            // Note: Binance spot doesn't have "positions" like futures
            // We track filled orders as positions

        } catch (error) {
            console.error('Error syncing positions:', error.message);
        }
    }

    /**
     * Get all tracked positions
     */
    getPositions() {
        return Array.from(this.positions.values());
    }

    /**
     * Get order book
     */
    async getOrderBook(symbol, limit = 10) {
        try {
            const binanceSymbol = symbol.replace('USD', 'USDT');

            const orderBook = await this.client.book({
                symbol: binanceSymbol,
                limit: limit
            });

            return {
                symbol: binanceSymbol,
                bids: orderBook.bids.map(b => ({ price: parseFloat(b.price), quantity: parseFloat(b.quantity) })),
                asks: orderBook.asks.map(a => ({ price: parseFloat(a.price), quantity: parseFloat(a.quantity) }))
            };

        } catch (error) {
            console.error(`Error getting order book for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Get 24hr ticker statistics
     */
    async get24hrStats(symbol) {
        try {
            const binanceSymbol = symbol.replace('USD', 'USDT');

            const stats = await this.client.dailyStats({ symbol: binanceSymbol });

            return {
                symbol: binanceSymbol,
                priceChange: parseFloat(stats.priceChange),
                priceChangePercent: parseFloat(stats.priceChangePercent),
                weightedAvgPrice: parseFloat(stats.weightedAvgPrice),
                lastPrice: parseFloat(stats.lastPrice),
                volume: parseFloat(stats.volume),
                high: parseFloat(stats.highPrice),
                low: parseFloat(stats.lowPrice)
            };

        } catch (error) {
            console.error(`Error getting 24hr stats for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Disconnect from Binance
     */
    async disconnect() {
        try {
            // Close all websocket streams
            for (const [symbol, clean] of this.priceStreams) {
                clean();
            }

            this.priceStreams.clear();
            this.connected = false;

            console.log('✅ Disconnected from Binance');

        } catch (error) {
            console.error('Error disconnecting:', error.message);
        }
    }
}

module.exports = BinanceAdapter;
