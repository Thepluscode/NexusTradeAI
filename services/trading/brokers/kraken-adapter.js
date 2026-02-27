/**
 * Kraken Exchange Adapter
 * Connects to Kraken for crypto and forex trading
 *
 * Prerequisites:
 * 1. Create Kraken account at https://www.kraken.com
 * 2. Generate API keys in Settings -> API
 * 3. npm install kraken-api
 *
 * Best for: Cryptocurrency and some forex pairs
 */

const EventEmitter = require('events');
const KrakenClient = require('kraken-api');

class KrakenAdapter extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            apiKey: config.apiKey || process.env.KRAKEN_API_KEY,
            apiSecret: config.apiSecret || process.env.KRAKEN_API_SECRET,

            // Trading settings
            defaultVolume: config.defaultVolume || 0.001,
            otp: config.otp || process.env.KRAKEN_OTP, // 2FA if enabled
        };

        this.connected = false;
        this.positions = new Map();
        this.client = null;
        this.assetPairs = new Map();
    }

    /**
     * Connect to Kraken
     */
    async connect() {
        try {
            if (!this.config.apiKey || !this.config.apiSecret) {
                throw new Error('Kraken API key and secret required');
            }

            // Initialize Kraken client
            this.client = new KrakenClient(this.config.apiKey, this.config.apiSecret);

            // Test connection
            const serverTime = await this.client.api('Time');
            console.log(`✅ Connected to Kraken`);
            console.log(`   Server time: ${new Date(serverTime.result.unixtime * 1000).toISOString()}`);

            // Get account balance
            const balance = await this.getAccountInfo();
            console.log(`   Account has ${Object.keys(balance.balances).length} assets`);

            // Load tradeable asset pairs
            await this.loadAssetPairs();

            this.connected = true;

            // Sync open orders
            await this.syncPositions();

            return true;

        } catch (error) {
            console.error('❌ Kraken connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Load tradeable asset pairs from Kraken
     */
    async loadAssetPairs() {
        try {
            const response = await this.client.api('AssetPairs');

            for (const [pair, info] of Object.entries(response.result)) {
                this.assetPairs.set(pair, info);
            }

            console.log(`   Loaded ${this.assetPairs.size} tradeable pairs`);

        } catch (error) {
            console.error('Error loading asset pairs:', error.message);
        }
    }

    /**
     * Convert symbol to Kraken format
     */
    symbolToKrakenPair(symbol) {
        // Common conversions
        const conversions = {
            'BTCUSD': 'XXBTZUSD',
            'ETHUSD': 'XETHZUSD',
            'XRPUSD': 'XXRPZUSD',
            'ADAUSD': 'ADAUSD',
            'SOLUSD': 'SOLUSD',
            'DOGEUSD': 'XDGUSD',
            'LINKUSD': 'LINKUSD',
            'DOTUSD': 'DOTUSD',
            'MATICUSD': 'MATICUSD',
            'AVAXUSD': 'AVAXUSD',
            'UNIUSD': 'UNIUSD',
            'ATOMUSD': 'ATOMUSD',
            'LTCUSD': 'XLTCZUSD',
            'EURUSD': 'ZEURZUSD',
            'GBPUSD': 'ZGBPZUSD',
        };

        return conversions[symbol] || symbol;
    }

    /**
     * Get account information
     */
    async getAccountInfo() {
        try {
            const balance = await this.client.api('Balance', { nonce: Date.now() });

            const balances = {};
            let totalValueUSD = 0;

            for (const [asset, amount] of Object.entries(balance.result)) {
                const value = parseFloat(amount);
                if (value > 0) {
                    balances[asset] = value;
                }
            }

            return {
                balances,
                totalValueUSD
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
            const pair = this.symbolToKrakenPair(symbol);
            const orderType = direction === 'long' ? 'buy' : 'sell';
            const volume = params.volume || this.config.defaultVolume;

            // Build order parameters
            const orderParams = {
                nonce: Date.now(),
                pair: pair,
                type: orderType,
                ordertype: 'market',
                volume: volume.toString(),
            };

            // Add optional parameters
            if (params.leverage) {
                orderParams.leverage = params.leverage.toString();
            }

            if (this.config.otp) {
                orderParams.otp = this.config.otp;
            }

            // Place order
            const order = await this.client.api('AddOrder', orderParams);

            if (order.error && order.error.length > 0) {
                throw new Error(order.error.join(', '));
            }

            console.log(`✅ Opened ${direction} position on ${pair}:`);
            console.log(`   Volume: ${volume}`);
            console.log(`   Order ID: ${order.result.txid[0]}`);

            // Get order details
            const orderInfo = await this.getOrderInfo(order.result.txid[0]);

            // Create position object
            const position = {
                id: `kraken-${order.result.txid[0]}`,
                orderId: order.result.txid[0],
                symbol: pair,
                direction,
                volume: parseFloat(volume),
                entry: orderInfo.price || 0,
                stopLoss: params.stopLoss,
                takeProfit: params.takeProfit,
                openTime: new Date(),
                strategy: params.strategy,
                status: orderInfo.status
            };

            this.positions.set(position.id, position);

            // Place stop loss if specified
            if (params.stopLoss) {
                await this.placeStopLoss(pair, orderType === 'buy' ? 'sell' : 'buy', volume, params.stopLoss);
            }

            // Place take profit if specified
            if (params.takeProfit) {
                await this.placeTakeProfit(pair, orderType === 'buy' ? 'sell' : 'buy', volume, params.takeProfit);
            }

            this.emit('positionOpened', position);

            return position;

        } catch (error) {
            console.error(`❌ Failed to open ${direction} position on ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * Get order information
     */
    async getOrderInfo(orderId) {
        try {
            const response = await this.client.api('QueryOrders', {
                nonce: Date.now(),
                txid: orderId
            });

            const orderData = response.result[orderId];

            return {
                status: orderData.status,
                price: parseFloat(orderData.price),
                volume: parseFloat(orderData.vol),
                executedVolume: parseFloat(orderData.vol_exec),
                cost: parseFloat(orderData.cost),
                fee: parseFloat(orderData.fee)
            };

        } catch (error) {
            console.error('Error getting order info:', error.message);
            return { status: 'unknown', price: 0 };
        }
    }

    /**
     * Close a position
     */
    async closePosition(positionId) {
        try {
            const position = this.positions.get(positionId);

            if (!position) {
                throw new Error(`Position ${positionId} not found`);
            }

            // Reverse the order type to close
            const orderType = position.direction === 'long' ? 'sell' : 'buy';

            // Place market order to close
            const closeOrder = await this.client.api('AddOrder', {
                nonce: Date.now(),
                pair: position.symbol,
                type: orderType,
                ordertype: 'market',
                volume: position.volume.toString()
            });

            if (closeOrder.error && closeOrder.error.length > 0) {
                throw new Error(closeOrder.error.join(', '));
            }

            console.log(`✅ Closed position ${positionId} for ${position.symbol}`);

            this.positions.delete(positionId);
            this.emit('positionClosed', { position, closeOrder });

            return closeOrder;

        } catch (error) {
            console.error(`❌ Failed to close position ${positionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Place stop loss order
     */
    async placeStopLoss(pair, side, volume, stopPrice) {
        try {
            const stopOrder = await this.client.api('AddOrder', {
                nonce: Date.now(),
                pair: pair,
                type: side,
                ordertype: 'stop-loss',
                volume: volume.toString(),
                price: stopPrice.toString()
            });

            console.log(`📉 Stop loss placed at $${stopPrice} for ${pair}`);

            return stopOrder;

        } catch (error) {
            console.error('Error placing stop loss:', error.message);
        }
    }

    /**
     * Place take profit order
     */
    async placeTakeProfit(pair, side, volume, takeProfitPrice) {
        try {
            const tpOrder = await this.client.api('AddOrder', {
                nonce: Date.now(),
                pair: pair,
                type: side,
                ordertype: 'take-profit',
                volume: volume.toString(),
                price: takeProfitPrice.toString()
            });

            console.log(`📈 Take profit placed at $${takeProfitPrice} for ${pair}`);

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
            const pair = this.symbolToKrakenPair(symbol);

            const ticker = await this.client.api('Ticker', { pair });

            const pairData = ticker.result[Object.keys(ticker.result)[0]];

            // Return last trade price
            return parseFloat(pairData.c[0]);

        } catch (error) {
            console.error(`Error getting price for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Get ticker information
     */
    async getTickerInfo(symbol) {
        try {
            const pair = this.symbolToKrakenPair(symbol);

            const ticker = await this.client.api('Ticker', { pair });

            const pairData = ticker.result[Object.keys(ticker.result)[0]];

            return {
                symbol: pair,
                ask: parseFloat(pairData.a[0]),
                bid: parseFloat(pairData.b[0]),
                last: parseFloat(pairData.c[0]),
                volume: parseFloat(pairData.v[1]), // 24hr volume
                high: parseFloat(pairData.h[1]), // 24hr high
                low: parseFloat(pairData.l[1]), // 24hr low
                open: parseFloat(pairData.o)
            };

        } catch (error) {
            console.error(`Error getting ticker for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Get OHLC data (candlestick data)
     */
    async getOHLC(symbol, interval = 60) {
        try {
            const pair = this.symbolToKrakenPair(symbol);

            const ohlc = await this.client.api('OHLC', {
                pair: pair,
                interval: interval // in minutes: 1, 5, 15, 30, 60, 240, 1440, 10080, 21600
            });

            const pairKey = Object.keys(ohlc.result).find(k => k !== 'last');
            const candles = ohlc.result[pairKey];

            return candles.map(candle => ({
                time: candle[0],
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[6])
            }));

        } catch (error) {
            console.error(`Error getting OHLC for ${symbol}:`, error.message);
            return [];
        }
    }

    /**
     * Sync positions (open orders)
     */
    async syncPositions() {
        try {
            const openOrders = await this.client.api('OpenOrders', {
                nonce: Date.now()
            });

            const orders = openOrders.result.open || {};

            console.log(`📊 Found ${Object.keys(orders).length} open orders on Kraken`);

            // Track open orders as positions
            for (const [orderId, orderData] of Object.entries(orders)) {
                const position = {
                    id: `kraken-${orderId}`,
                    orderId: orderId,
                    symbol: orderData.descr.pair,
                    direction: orderData.descr.type === 'buy' ? 'long' : 'short',
                    volume: parseFloat(orderData.vol),
                    entry: parseFloat(orderData.descr.price),
                    status: orderData.status
                };

                this.positions.set(position.id, position);
            }

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
     * Cancel an order
     */
    async cancelOrder(orderId) {
        try {
            const result = await this.client.api('CancelOrder', {
                nonce: Date.now(),
                txid: orderId
            });

            console.log(`❌ Cancelled order ${orderId}`);

            return result;

        } catch (error) {
            console.error(`Error cancelling order ${orderId}:`, error.message);
            throw error;
        }
    }

    /**
     * Disconnect from Kraken
     */
    async disconnect() {
        try {
            this.connected = false;
            console.log('✅ Disconnected from Kraken');

        } catch (error) {
            console.error('Error disconnecting:', error.message);
        }
    }
}

module.exports = KrakenAdapter;
