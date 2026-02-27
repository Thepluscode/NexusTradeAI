/**
 * Interactive Brokers (IBKR) Adapter
 * Connects to IBKR via TWS API or Client Portal API
 *
 * Prerequisites:
 * 1. Install Trader Workstation (TWS) or IB Gateway
 * 2. Enable API connections in TWS: Configure -> API -> Settings
 * 3. npm install @stoqey/ib
 *
 * Best for: Stocks, Options, Futures, Forex, Bonds
 */

const EventEmitter = require('events');
const { IBApiNext, Contract, SecType, OrderAction, OrderType } = require('@stoqey/ib');

class IBKRAdapter extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            host: config.host || process.env.IBKR_HOST || '127.0.0.1',
            port: config.port || parseInt(process.env.IBKR_PORT) || 7497, // 7497 for TWS paper, 4001 for IB Gateway paper
            clientId: config.clientId || parseInt(process.env.IBKR_CLIENT_ID) || 0,

            // Account
            accountId: config.accountId || process.env.IBKR_ACCOUNT_ID,

            // Paper trading
            isPaper: config.isPaper !== false, // Default to paper trading
        };

        this.connected = false;
        this.positions = new Map();
        this.orders = new Map();
        this.marketData = new Map();
        this.ib = null;
        this.nextOrderId = 1;
    }

    /**
     * Connect to Interactive Brokers
     */
    async connect() {
        try {
            this.ib = new IBApiNext({
                host: this.config.host,
                port: this.config.port
            });

            // Set up event handlers
            this.setupEventHandlers();

            // Connect to TWS/Gateway
            await this.ib.connect(this.config.clientId);

            // Wait for next valid order ID
            await new Promise((resolve) => {
                this.ib.once('nextValidId', (orderId) => {
                    this.nextOrderId = orderId;
                    resolve();
                });
            });

            this.connected = true;
            console.log(`✅ Connected to Interactive Brokers (${this.config.isPaper ? 'Paper' : 'Live'} Trading)`);

            // Request account updates
            await this.requestAccountUpdates();

            // Sync positions
            await this.syncPositions();

            return true;

        } catch (error) {
            console.error('❌ IBKR connection failed:', error.message);
            throw error;
        }
    }

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Connection events
        this.ib.on('connected', () => {
            console.log('📡 IBKR connection established');
        });

        this.ib.on('disconnected', () => {
            console.log('📡 IBKR disconnected');
            this.connected = false;
        });

        this.ib.on('error', (error, code, reqId) => {
            if (code === 2104 || code === 2106 || code === 2158) {
                // Informational messages, not errors
                return;
            }
            console.error(`IBKR Error ${code}:`, error.message);
            this.emit('error', error);
        });

        // Position updates
        this.ib.on('position', (account, contract, pos, avgCost) => {
            if (pos === 0) return; // Skip closed positions

            const positionId = `${contract.symbol}-${contract.conId}`;

            this.positions.set(positionId, {
                id: positionId,
                symbol: contract.symbol,
                direction: pos > 0 ? 'long' : 'short',
                quantity: Math.abs(pos),
                entry: avgCost,
                contract: contract
            });
        });

        // Market data updates
        this.ib.on('priceSizeTick', (reqId, tickType, price, size) => {
            const symbol = this.marketData.get(reqId);
            if (symbol) {
                this.emit('price', { symbol, price, size, tickType });
            }
        });

        // Order status updates
        this.ib.on('orderStatus', (orderId, status, filled, remaining, avgFillPrice) => {
            const order = this.orders.get(orderId);
            if (order) {
                order.status = status;
                order.filled = filled;
                order.avgFillPrice = avgFillPrice;

                console.log(`📊 Order ${orderId} status: ${status} (Filled: ${filled})`);

                if (status === 'Filled') {
                    this.emit('orderFilled', order);
                }
            }
        });
    }

    /**
     * Request account updates
     */
    async requestAccountUpdates() {
        if (this.config.accountId) {
            this.ib.reqAccountUpdates(true, this.config.accountId);
        } else {
            this.ib.reqAccountUpdates(true, '');
        }
    }

    /**
     * Get account information
     */
    async getAccountInfo() {
        return new Promise((resolve) => {
            const accountData = {};

            const handler = (key, value, currency, accountName) => {
                if (key === 'NetLiquidation') accountData.equity = parseFloat(value);
                if (key === 'TotalCashValue') accountData.balance = parseFloat(value);
                if (key === 'BuyingPower') accountData.buyingPower = parseFloat(value);
                if (key === 'GrossPositionValue') accountData.positionValue = parseFloat(value);
                if (key === 'UnrealizedPnL') accountData.unrealizedPnL = parseFloat(value);
            };

            this.ib.on('accountSummary', handler);

            this.ib.reqAccountSummary(1, 'All', 'NetLiquidation,TotalCashValue,BuyingPower,GrossPositionValue,UnrealizedPnL');

            setTimeout(() => {
                this.ib.off('accountSummary', handler);
                resolve(accountData);
            }, 2000);
        });
    }

    /**
     * Create contract for symbol
     */
    createContract(symbol, secType = 'STK', exchange = 'SMART', currency = 'USD') {
        // Detect security type based on symbol
        if (symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP')) {
            // Forex pair
            secType = 'CASH';
            exchange = 'IDEALPRO';
            const base = symbol.substring(0, 3);
            const quote = symbol.substring(3, 6);
            return {
                symbol: base,
                secType: SecType.CASH,
                exchange: exchange,
                currency: quote
            };
        }

        return {
            symbol: symbol,
            secType: SecType.STK,
            exchange: exchange,
            currency: currency
        };
    }

    /**
     * Open a position
     */
    async openPosition(symbol, direction, params = {}) {
        try {
            const contract = this.createContract(symbol);
            const action = direction === 'long' ? OrderAction.BUY : OrderAction.SELL;

            // Calculate quantity
            const accountInfo = await this.getAccountInfo();
            const accountEquity = accountInfo.equity || 100000;
            const riskAmount = accountEquity * (params.riskPercent || 0.02);
            const entryPrice = params.entry || await this.getCurrentPrice(symbol);
            const stopDistance = Math.abs(entryPrice - (params.stopLoss || entryPrice * 0.98));
            const quantity = Math.floor(riskAmount / stopDistance);

            // Create order
            const order = {
                action: action,
                orderType: OrderType.MKT,
                totalQuantity: quantity,
                transmit: true
            };

            // Add stop loss if provided
            if (params.stopLoss) {
                order.auxPrice = params.stopLoss; // Stop price
            }

            // Place order
            const orderId = this.nextOrderId++;

            this.ib.placeOrder(orderId, contract, order);

            // Store order info
            this.orders.set(orderId, {
                id: orderId,
                symbol,
                direction,
                quantity,
                entry: entryPrice,
                stopLoss: params.stopLoss,
                takeProfit: params.takeProfit,
                strategy: params.strategy,
                status: 'Submitted'
            });

            console.log(`✅ Placed ${direction} order for ${quantity} ${symbol} @ market`);

            // Create position object
            const position = {
                id: `${symbol}-${orderId}`,
                orderId: orderId,
                symbol,
                direction,
                quantity,
                entry: entryPrice,
                stopLoss: params.stopLoss,
                takeProfit: params.takeProfit,
                openTime: new Date(),
                strategy: params.strategy
            };

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

            const contract = position.contract || this.createContract(position.symbol);

            // Reverse the action to close
            const action = position.direction === 'long' ? OrderAction.SELL : OrderAction.BUY;

            const order = {
                action: action,
                orderType: OrderType.MKT,
                totalQuantity: position.quantity,
                transmit: true
            };

            const orderId = this.nextOrderId++;

            this.ib.placeOrder(orderId, contract, order);

            console.log(`✅ Closing position ${positionId} for ${position.symbol}`);

            this.positions.delete(positionId);
            this.emit('positionClosed', { position, orderId });

            return { orderId };

        } catch (error) {
            console.error(`❌ Failed to close position ${positionId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get current price for a symbol
     */
    async getCurrentPrice(symbol) {
        return new Promise((resolve, reject) => {
            const contract = this.createContract(symbol);
            const reqId = Math.floor(Math.random() * 10000);

            let price = null;

            const priceHandler = (tickerId, tickType, priceValue) => {
                if (tickerId === reqId && (tickType === 1 || tickType === 2)) { // ASK or BID
                    price = priceValue;
                }
            };

            this.ib.on('priceSizeTick', priceHandler);

            this.ib.reqMktData(reqId, contract, '', false, false);

            setTimeout(() => {
                this.ib.cancelMktData(reqId);
                this.ib.off('priceSizeTick', priceHandler);

                if (price) {
                    resolve(price);
                } else {
                    reject(new Error(`No price data received for ${symbol}`));
                }
            }, 2000);
        });
    }

    /**
     * Subscribe to market data
     */
    subscribeMarketData(symbol) {
        const contract = this.createContract(symbol);
        const reqId = Math.floor(Math.random() * 10000);

        this.marketData.set(reqId, symbol);
        this.ib.reqMktData(reqId, contract, '', false, false);

        console.log(`📊 Subscribed to market data for ${symbol}`);

        return reqId;
    }

    /**
     * Unsubscribe from market data
     */
    unsubscribeMarketData(reqId) {
        this.ib.cancelMktData(reqId);
        this.marketData.delete(reqId);
    }

    /**
     * Sync positions from IBKR
     */
    async syncPositions() {
        return new Promise((resolve) => {
            this.ib.reqPositions();

            setTimeout(() => {
                console.log(`📊 Synced ${this.positions.size} positions from IBKR`);
                resolve();
            }, 2000);
        });
    }

    /**
     * Get all open positions
     */
    getPositions() {
        return Array.from(this.positions.values());
    }

    /**
     * Cancel an order
     */
    cancelOrder(orderId) {
        this.ib.cancelOrder(orderId);
        console.log(`❌ Cancelled order ${orderId}`);
    }

    /**
     * Disconnect from IBKR
     */
    async disconnect() {
        try {
            if (this.ib) {
                this.ib.disconnect();
            }

            this.connected = false;
            console.log('✅ Disconnected from IBKR');

        } catch (error) {
            console.error('Error disconnecting:', error.message);
        }
    }
}

module.exports = IBKRAdapter;
