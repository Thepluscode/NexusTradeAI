/**
 * MetaTrader 4/5 Broker Adapter
 * Connects to MT4/MT5 via ZeroMQ bridge or REST API
 *
 * Prerequisites:
 * 1. Install MetaTrader Expert Advisor (EA) with ZeroMQ or REST API support
 * 2. Popular options:
 *    - MT4/MT5 ZMQ EA: https://github.com/dingmaotu/mql-zmq
 *    - MetaApi: https://metaapi.cloud (REST API - recommended for ease)
 * 3. npm install zeromq (for direct ZMQ) OR axios (for MetaApi)
 */

const EventEmitter = require('events');
const axios = require('axios');

class MetaTraderAdapter extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // MetaApi cloud service (easiest option)
            useMetaApi: config.useMetaApi !== false, // Default to MetaApi
            metaApiToken: config.metaApiToken || process.env.METAAPI_TOKEN,
            accountId: config.accountId || process.env.MT_ACCOUNT_ID,

            // Direct ZeroMQ connection (advanced)
            zmqHost: config.zmqHost || process.env.MT_ZMQ_HOST || 'localhost',
            zmqRequestPort: config.zmqRequestPort || process.env.MT_ZMQ_REQ_PORT || 5555,
            zmqPushPort: config.zmqPushPort || process.env.MT_ZMQ_PUSH_PORT || 5556,

            platform: config.platform || 'MT5', // MT4 or MT5

            // Trading settings
            magic: config.magic || 123456, // Magic number for this bot's trades
            slippage: config.slippage || 3,
            lotSize: config.lotSize || 0.01,
        };

        this.connected = false;
        this.positions = new Map();
        this.api = null;
    }

    /**
     * Connect to MetaTrader
     */
    async connect() {
        try {
            if (this.config.useMetaApi) {
                await this.connectMetaApi();
            } else {
                await this.connectZMQ();
            }

            this.connected = true;
            console.log(`✅ Connected to ${this.config.platform} via ${this.config.useMetaApi ? 'MetaApi' : 'ZeroMQ'}`);

            // Start position sync
            await this.syncPositions();

            return true;
        } catch (error) {
            console.error('❌ MetaTrader connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Connect via MetaApi cloud service (recommended)
     */
    async connectMetaApi() {
        if (!this.config.metaApiToken || !this.config.accountId) {
            throw new Error('MetaApi token and account ID required. Get them from https://metaapi.cloud');
        }

        const MetaApi = require('metaapi.cloud-sdk').default;

        this.api = new MetaApi(this.config.metaApiToken);

        const account = await this.api.metatraderAccountApi.getAccount(this.config.accountId);

        // Wait until account is deployed and connected
        await account.deploy();
        await account.waitConnected();

        // Connect to MetaApi
        const connection = account.getStreamingConnection();
        await connection.connect();

        // Wait until terminal state synchronized to the local state
        await connection.waitSynchronized();

        this.connection = connection;

        // Subscribe to market data for positions
        connection.subscribeToMarketData('EURUSD');

        console.log('✅ MetaApi connection established');
    }

    /**
     * Connect via ZeroMQ (requires EA installed in MT4/MT5)
     */
    async connectZMQ() {
        const zmq = require('zeromq');

        // Request socket for sending commands
        this.reqSocket = new zmq.Request();
        await this.reqSocket.connect(`tcp://${this.config.zmqHost}:${this.config.zmqRequestPort}`);

        // Subscribe socket for receiving market data
        this.subSocket = new zmq.Subscriber();
        await this.subSocket.connect(`tcp://${this.config.zmqHost}:${this.config.zmqPushPort}`);
        this.subSocket.subscribe('');

        // Test connection
        const testResponse = await this.sendCommand({ action: 'ACCOUNT_INFO' });

        if (!testResponse || testResponse.error) {
            throw new Error('ZMQ connection test failed');
        }

        console.log('✅ ZeroMQ connection established');

        // Start listening for market data
        this.startMarketDataListener();
    }

    /**
     * Send command via ZeroMQ
     */
    async sendCommand(command) {
        if (!this.reqSocket) {
            throw new Error('ZMQ not connected');
        }

        await this.reqSocket.send(JSON.stringify(command));
        const [response] = await this.reqSocket.receive();

        return JSON.parse(response.toString());
    }

    /**
     * Start listening for market data via ZMQ
     */
    async startMarketDataListener() {
        for await (const [msg] of this.subSocket) {
            try {
                const data = JSON.parse(msg.toString());
                this.emit('marketData', data);
            } catch (error) {
                console.error('Error parsing market data:', error);
            }
        }
    }

    /**
     * Get account information
     */
    async getAccountInfo() {
        if (this.config.useMetaApi) {
            const accountInfo = await this.connection.getAccountInformation();

            return {
                balance: accountInfo.balance,
                equity: accountInfo.equity,
                margin: accountInfo.margin,
                freeMargin: accountInfo.freeMargin,
                leverage: accountInfo.leverage,
                profit: accountInfo.profit,
                currency: accountInfo.currency
            };
        } else {
            const response = await this.sendCommand({ action: 'ACCOUNT_INFO' });
            return response.data;
        }
    }

    /**
     * Open a position
     */
    async openPosition(symbol, direction, params = {}) {
        try {
            const orderType = direction === 'long' ? 'BUY' : 'SELL';
            const lotSize = params.lotSize || this.config.lotSize;
            const stopLoss = params.stopLoss || 0;
            const takeProfit = params.takeProfit || 0;

            let result;

            if (this.config.useMetaApi) {
                // MetaApi order
                result = await this.connection.createMarketBuyOrder(
                    symbol,
                    lotSize,
                    stopLoss,
                    takeProfit,
                    {
                        comment: `NexusTradeAI-${params.strategy || 'auto'}`,
                        magic: this.config.magic
                    }
                );
            } else {
                // ZeroMQ order
                result = await this.sendCommand({
                    action: 'TRADE',
                    actionType: orderType,
                    symbol: symbol,
                    volume: lotSize,
                    stopLoss: stopLoss,
                    takeProfit: takeProfit,
                    magic: this.config.magic,
                    comment: `NexusTradeAI-${params.strategy || 'auto'}`
                });
            }

            console.log(`✅ Opened ${direction} position on ${symbol}: ${JSON.stringify(result)}`);

            // Store position
            const position = {
                id: result.orderId || result.ticket,
                symbol,
                direction,
                lotSize,
                entry: result.price || params.entry,
                stopLoss,
                takeProfit,
                openTime: new Date(),
                strategy: params.strategy
            };

            this.positions.set(position.id, position);
            this.emit('positionOpened', position);

            return position;

        } catch (error) {
            console.error(`❌ Failed to open ${direction} position on ${symbol}:`, error.message);
            throw error;
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

            let result;

            if (this.config.useMetaApi) {
                // MetaApi close
                result = await this.connection.closePosition(positionId);
            } else {
                // ZeroMQ close
                result = await this.sendCommand({
                    action: 'TRADE',
                    actionType: 'CLOSE',
                    ticket: positionId
                });
            }

            console.log(`✅ Closed position ${positionId} on ${position.symbol}`);

            this.positions.delete(positionId);
            this.emit('positionClosed', { position, result });

            return result;

        } catch (error) {
            console.error(`❌ Failed to close position ${positionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Modify position (update SL/TP)
     */
    async modifyPosition(positionId, stopLoss, takeProfit) {
        try {
            const position = this.positions.get(positionId);

            if (!position) {
                throw new Error(`Position ${positionId} not found`);
            }

            let result;

            if (this.config.useMetaApi) {
                result = await this.connection.modifyPosition(positionId, stopLoss, takeProfit);
            } else {
                result = await this.sendCommand({
                    action: 'MODIFY',
                    ticket: positionId,
                    stopLoss: stopLoss,
                    takeProfit: takeProfit
                });
            }

            // Update local position
            position.stopLoss = stopLoss;
            position.takeProfit = takeProfit;

            console.log(`✅ Modified position ${positionId}: SL=${stopLoss}, TP=${takeProfit}`);

            return result;

        } catch (error) {
            console.error(`❌ Failed to modify position ${positionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get current price for a symbol
     */
    async getCurrentPrice(symbol) {
        try {
            if (this.config.useMetaApi) {
                const price = await this.connection.getSymbolPrice(symbol);
                return (price.ask + price.bid) / 2;
            } else {
                const response = await this.sendCommand({
                    action: 'GET_PRICE',
                    symbol: symbol
                });
                return response.price;
            }
        } catch (error) {
            console.error(`Error getting price for ${symbol}:`, error.message);
            return null;
        }
    }

    /**
     * Sync positions from MetaTrader
     */
    async syncPositions() {
        try {
            let mtPositions;

            if (this.config.useMetaApi) {
                mtPositions = await this.connection.getPositions();
            } else {
                const response = await this.sendCommand({ action: 'GET_POSITIONS' });
                mtPositions = response.positions || [];
            }

            // Filter positions with our magic number
            const ourPositions = mtPositions.filter(p => p.magic === this.config.magic);

            // Update local position map
            this.positions.clear();

            for (const pos of ourPositions) {
                this.positions.set(pos.id || pos.ticket, {
                    id: pos.id || pos.ticket,
                    symbol: pos.symbol,
                    direction: pos.type === 'POSITION_TYPE_BUY' ? 'long' : 'short',
                    lotSize: pos.volume,
                    entry: pos.openPrice,
                    stopLoss: pos.stopLoss,
                    takeProfit: pos.takeProfit,
                    currentPrice: pos.currentPrice,
                    profit: pos.profit,
                    openTime: pos.time
                });
            }

            console.log(`📊 Synced ${this.positions.size} positions from MetaTrader`);

        } catch (error) {
            console.error('Error syncing positions:', error.message);
        }
    }

    /**
     * Get all open positions
     */
    getPositions() {
        return Array.from(this.positions.values());
    }

    /**
     * Disconnect from MetaTrader
     */
    async disconnect() {
        try {
            if (this.config.useMetaApi && this.connection) {
                await this.connection.close();
            }

            if (this.reqSocket) {
                this.reqSocket.close();
            }

            if (this.subSocket) {
                this.subSocket.close();
            }

            this.connected = false;
            console.log('✅ Disconnected from MetaTrader');

        } catch (error) {
            console.error('Error disconnecting:', error.message);
        }
    }
}

module.exports = MetaTraderAdapter;
