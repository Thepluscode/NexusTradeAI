/**
 * Real-Time Market Data Handler
 *
 * Features:
 * - WebSocket connections to multiple data providers
 * - Data aggregation and normalization
 * - Real-time quote updates
 * - Order book depth tracking
 * - Historical data caching
 * - Automatic reconnection
 * - Data quality monitoring
 * - Latency tracking
 */

const EventEmitter = require('events');
const WebSocket = require('ws');
const axios = require('axios');
const winston = require('winston');

class RealTimeMarketData extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Data providers
            providers: config.providers || ['alpaca', 'polygon', 'finnhub'],
            primaryProvider: config.primaryProvider || 'alpaca',

            // API keys (should be in environment variables)
            alpacaKey: process.env.ALPACA_API_KEY,
            alpacaSecret: process.env.ALPACA_SECRET_KEY,
            polygonKey: process.env.POLYGON_API_KEY,
            finnhubKey: process.env.FINNHUB_API_KEY,

            // WebSocket settings
            reconnectDelay: 5000,
            maxReconnectAttempts: 10,
            heartbeatInterval: 30000,

            // Data settings
            quoteCacheSize: 1000,
            historicalCacheSize: 100,
            orderBookDepth: 20,

            // Quality monitoring
            enableQualityMonitoring: true,
            maxLatency: 1000, // 1 second
            minUpdateFrequency: 1000, // 1 second

            ...config
        };

        this.setupLogger();
        this.initializeState();
    }

    setupLogger() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            defaultMeta: { service: 'market-data' },
            transports: [
                new winston.transports.File({
                    filename: 'logs/market-data.log',
                    maxsize: 10485760,
                    maxFiles: 5
                }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    initializeState() {
        this.connections = new Map();
        this.subscriptions = new Map();
        this.quotes = new Map();
        this.orderBooks = new Map();
        this.trades = new Map();
        this.bars = new Map();

        // Connection state
        this.reconnectAttempts = new Map();
        this.heartbeats = new Map();

        // Performance tracking
        this.latencies = new Map();
        this.updateCounts = new Map();
        this.lastUpdateTimes = new Map();

        // Data quality
        this.dataQuality = new Map();
    }

    /**
     * Connect to market data providers
     */
    async connect() {
        this.logger.info('Connecting to market data providers', {
            providers: this.config.providers
        });

        const connectionPromises = this.config.providers.map(provider =>
            this.connectProvider(provider)
        );

        await Promise.allSettled(connectionPromises);

        this.startHeartbeat();
        this.startQualityMonitoring();

        this.emit('connected');
    }

    async connectProvider(provider) {
        try {
            switch (provider) {
                case 'alpaca':
                    await this.connectAlpaca();
                    break;
                case 'polygon':
                    await this.connectPolygon();
                    break;
                case 'finnhub':
                    await this.connectFinnhub();
                    break;
                default:
                    this.logger.warn(`Unknown provider: ${provider}`);
            }
        } catch (error) {
            this.logger.error(`Failed to connect to ${provider}`, { error });
        }
    }

    /**
     * Alpaca WebSocket Connection
     */
    async connectAlpaca() {
        const wsUrl = 'wss://stream.data.alpaca.markets/v2/iex';

        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            this.logger.info('Alpaca WebSocket connected');

            // Authenticate
            ws.send(JSON.stringify({
                action: 'auth',
                key: this.config.alpacaKey,
                secret: this.config.alpacaSecret
            }));
        });

        ws.on('message', (data) => {
            this.handleAlpacaMessage(JSON.parse(data.toString()));
        });

        ws.on('error', (error) => {
            this.logger.error('Alpaca WebSocket error', { error });
        });

        ws.on('close', () => {
            this.logger.warn('Alpaca WebSocket closed');
            this.reconnectProvider('alpaca');
        });

        this.connections.set('alpaca', ws);
    }

    handleAlpacaMessage(message) {
        const messageType = message[0]?.T;

        if (messageType === 'success' && message[0]?.msg === 'authenticated') {
            this.logger.info('Alpaca authenticated');
            this.resubscribeAll('alpaca');
        } else if (messageType === 'q') {
            // Quote update
            message.forEach(quote => this.handleQuote('alpaca', quote));
        } else if (messageType === 't') {
            // Trade update
            message.forEach(trade => this.handleTrade('alpaca', trade));
        } else if (messageType === 'b') {
            // Bar update
            message.forEach(bar => this.handleBar('alpaca', bar));
        }
    }

    /**
     * Polygon WebSocket Connection
     */
    async connectPolygon() {
        const wsUrl = `wss://socket.polygon.io/stocks`;

        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            this.logger.info('Polygon WebSocket connected');

            // Authenticate
            ws.send(JSON.stringify({
                action: 'auth',
                params: this.config.polygonKey
            }));
        });

        ws.on('message', (data) => {
            this.handlePolygonMessage(JSON.parse(data.toString()));
        });

        ws.on('error', (error) => {
            this.logger.error('Polygon WebSocket error', { error });
        });

        ws.on('close', () => {
            this.logger.warn('Polygon WebSocket closed');
            this.reconnectProvider('polygon');
        });

        this.connections.set('polygon', ws);
    }

    handlePolygonMessage(message) {
        const [{ ev, status }] = message;

        if (status === 'auth_success') {
            this.logger.info('Polygon authenticated');
            this.resubscribeAll('polygon');
        } else {
            message.forEach(item => {
                if (item.ev === 'Q') {
                    // Quote
                    this.handleQuote('polygon', item);
                } else if (item.ev === 'T') {
                    // Trade
                    this.handleTrade('polygon', item);
                } else if (item.ev === 'AM' || item.ev === 'A') {
                    // Aggregate (minute bar)
                    this.handleBar('polygon', item);
                }
            });
        }
    }

    /**
     * Finnhub WebSocket Connection
     */
    async connectFinnhub() {
        const wsUrl = `wss://ws.finnhub.io?token=${this.config.finnhubKey}`;

        const ws = new WebSocket(wsUrl);

        ws.on('open', () => {
            this.logger.info('Finnhub WebSocket connected');
            this.resubscribeAll('finnhub');
        });

        ws.on('message', (data) => {
            this.handleFinnhubMessage(JSON.parse(data.toString()));
        });

        ws.on('error', (error) => {
            this.logger.error('Finnhub WebSocket error', { error });
        });

        ws.on('close', () => {
            this.logger.warn('Finnhub WebSocket closed');
            this.reconnectProvider('finnhub');
        });

        this.connections.set('finnhub', ws);
    }

    handleFinnhubMessage(message) {
        if (message.type === 'trade') {
            message.data.forEach(trade => this.handleTrade('finnhub', trade));
        } else if (message.type === 'ping') {
            // Respond to ping
            const ws = this.connections.get('finnhub');
            if (ws) {
                ws.send(JSON.stringify({ type: 'pong' }));
            }
        }
    }

    /**
     * Subscribe to market data
     */
    subscribe(symbols, dataTypes = ['quotes', 'trades']) {
        symbols = Array.isArray(symbols) ? symbols : [symbols];

        symbols.forEach(symbol => {
            if (!this.subscriptions.has(symbol)) {
                this.subscriptions.set(symbol, new Set());
            }

            dataTypes.forEach(type => {
                this.subscriptions.get(symbol).add(type);
            });

            // Subscribe on all active connections
            this.connections.forEach((ws, provider) => {
                this.subscribeOnProvider(provider, symbol, dataTypes);
            });
        });

        this.logger.info('Subscribed to symbols', { symbols, dataTypes });
    }

    subscribeOnProvider(provider, symbol, dataTypes) {
        const ws = this.connections.get(provider);

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }

        switch (provider) {
            case 'alpaca':
                const alpacaChannels = [];
                if (dataTypes.includes('quotes')) alpacaChannels.push('quotes');
                if (dataTypes.includes('trades')) alpacaChannels.push('trades');
                if (dataTypes.includes('bars')) alpacaChannels.push('bars');

                ws.send(JSON.stringify({
                    action: 'subscribe',
                    quotes: dataTypes.includes('quotes') ? [symbol] : [],
                    trades: dataTypes.includes('trades') ? [symbol] : [],
                    bars: dataTypes.includes('bars') ? [symbol] : []
                }));
                break;

            case 'polygon':
                dataTypes.forEach(type => {
                    let channel;
                    if (type === 'quotes') channel = 'Q';
                    else if (type === 'trades') channel = 'T';
                    else if (type === 'bars') channel = 'AM';

                    if (channel) {
                        ws.send(JSON.stringify({
                            action: 'subscribe',
                            params: `${channel}.${symbol}`
                        }));
                    }
                });
                break;

            case 'finnhub':
                ws.send(JSON.stringify({
                    type: 'subscribe',
                    symbol: symbol
                }));
                break;
        }
    }

    unsubscribe(symbols) {
        symbols = Array.isArray(symbols) ? symbols : [symbols];

        symbols.forEach(symbol => {
            this.subscriptions.delete(symbol);

            this.connections.forEach((ws, provider) => {
                this.unsubscribeOnProvider(provider, symbol);
            });
        });

        this.logger.info('Unsubscribed from symbols', { symbols });
    }

    unsubscribeOnProvider(provider, symbol) {
        const ws = this.connections.get(provider);

        if (!ws || ws.readyState !== WebSocket.OPEN) {
            return;
        }

        switch (provider) {
            case 'alpaca':
                ws.send(JSON.stringify({
                    action: 'unsubscribe',
                    quotes: [symbol],
                    trades: [symbol],
                    bars: [symbol]
                }));
                break;

            case 'polygon':
                ws.send(JSON.stringify({
                    action: 'unsubscribe',
                    params: `Q.${symbol},T.${symbol},AM.${symbol}`
                }));
                break;

            case 'finnhub':
                ws.send(JSON.stringify({
                    type: 'unsubscribe',
                    symbol: symbol
                }));
                break;
        }
    }

    /**
     * Handle incoming market data
     */
    handleQuote(provider, quote) {
        const symbol = this.normalizeSymbol(quote, provider);
        const normalizedQuote = this.normalizeQuote(quote, provider);

        // Track latency
        this.trackLatency(provider, symbol, normalizedQuote.timestamp);

        // Update quote cache
        if (!this.quotes.has(symbol)) {
            this.quotes.set(symbol, []);
        }

        const quotes = this.quotes.get(symbol);
        quotes.push(normalizedQuote);

        // Keep only recent quotes
        if (quotes.length > this.config.quoteCacheSize) {
            quotes.shift();
        }

        // Update order book
        this.updateOrderBook(symbol, normalizedQuote);

        // Track update
        this.trackUpdate(symbol);

        // Emit quote event
        this.emit('quote', {
            symbol,
            provider,
            ...normalizedQuote
        });
    }

    handleTrade(provider, trade) {
        const symbol = this.normalizeSymbol(trade, provider);
        const normalizedTrade = this.normalizeTrade(trade, provider);

        // Track latency
        this.trackLatency(provider, symbol, normalizedTrade.timestamp);

        // Update trade cache
        if (!this.trades.has(symbol)) {
            this.trades.set(symbol, []);
        }

        const trades = this.trades.get(symbol);
        trades.push(normalizedTrade);

        // Keep only recent trades
        if (trades.length > this.config.quoteCacheSize) {
            trades.shift();
        }

        // Track update
        this.trackUpdate(symbol);

        // Emit trade event
        this.emit('trade', {
            symbol,
            provider,
            ...normalizedTrade
        });
    }

    handleBar(provider, bar) {
        const symbol = this.normalizeSymbol(bar, provider);
        const normalizedBar = this.normalizeBar(bar, provider);

        // Update bar cache
        if (!this.bars.has(symbol)) {
            this.bars.set(symbol, []);
        }

        const bars = this.bars.get(symbol);
        bars.push(normalizedBar);

        // Keep only recent bars
        if (bars.length > this.config.historicalCacheSize) {
            bars.shift();
        }

        // Emit bar event
        this.emit('bar', {
            symbol,
            provider,
            ...normalizedBar
        });
    }

    /**
     * Data normalization
     */
    normalizeSymbol(data, provider) {
        switch (provider) {
            case 'alpaca':
                return data.S;
            case 'polygon':
                return data.sym || data.T;
            case 'finnhub':
                return data.s;
            default:
                return data.symbol;
        }
    }

    normalizeQuote(quote, provider) {
        switch (provider) {
            case 'alpaca':
                return {
                    bid: quote.bp,
                    ask: quote.ap,
                    bidSize: quote.bs,
                    askSize: quote.as,
                    timestamp: quote.t
                };
            case 'polygon':
                return {
                    bid: quote.bp,
                    ask: quote.ap,
                    bidSize: quote.bs,
                    askSize: quote.as,
                    timestamp: quote.t
                };
            case 'finnhub':
                return {
                    bid: quote.b,
                    ask: quote.a,
                    bidSize: quote.bv,
                    askSize: quote.av,
                    timestamp: quote.t
                };
            default:
                return quote;
        }
    }

    normalizeTrade(trade, provider) {
        switch (provider) {
            case 'alpaca':
                return {
                    price: trade.p,
                    size: trade.s,
                    timestamp: trade.t,
                    conditions: trade.c
                };
            case 'polygon':
                return {
                    price: trade.p,
                    size: trade.s,
                    timestamp: trade.t,
                    conditions: trade.c
                };
            case 'finnhub':
                return {
                    price: trade.p,
                    size: trade.v,
                    timestamp: trade.t,
                    conditions: trade.c
                };
            default:
                return trade;
        }
    }

    normalizeBar(bar, provider) {
        switch (provider) {
            case 'alpaca':
                return {
                    open: bar.o,
                    high: bar.h,
                    low: bar.l,
                    close: bar.c,
                    volume: bar.v,
                    timestamp: bar.t
                };
            case 'polygon':
                return {
                    open: bar.o,
                    high: bar.h,
                    low: bar.l,
                    close: bar.c,
                    volume: bar.v,
                    timestamp: bar.s
                };
            default:
                return bar;
        }
    }

    /**
     * Order book management
     */
    updateOrderBook(symbol, quote) {
        if (!this.orderBooks.has(symbol)) {
            this.orderBooks.set(symbol, {
                bids: [],
                asks: [],
                lastUpdate: Date.now()
            });
        }

        const orderBook = this.orderBooks.get(symbol);

        // Simplified order book update
        // In production, maintain full depth with price levels
        orderBook.bids = [{ price: quote.bid, size: quote.bidSize }];
        orderBook.asks = [{ price: quote.ask, size: quote.askSize }];
        orderBook.lastUpdate = Date.now();
    }

    getOrderBook(symbol) {
        return this.orderBooks.get(symbol);
    }

    /**
     * Get latest quote
     */
    getQuote(symbol) {
        const quotes = this.quotes.get(symbol);
        if (!quotes || quotes.length === 0) {
            return null;
        }

        return quotes[quotes.length - 1];
    }

    /**
     * Get latest trade
     */
    getTrade(symbol) {
        const trades = this.trades.get(symbol);
        if (!trades || trades.length === 0) {
            return null;
        }

        return trades[trades.length - 1];
    }

    /**
     * Get historical bars
     */
    getBars(symbol, count = 100) {
        const bars = this.bars.get(symbol);
        if (!bars) {
            return [];
        }

        return bars.slice(-count);
    }

    /**
     * Fetch historical data via REST API
     */
    async fetchHistoricalBars(symbol, timeframe = '1D', limit = 100) {
        try {
            // Use Alpaca as default provider
            const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars`;

            const response = await axios.get(url, {
                params: {
                    timeframe,
                    limit
                },
                headers: {
                    'APCA-API-KEY-ID': this.config.alpacaKey,
                    'APCA-API-SECRET-KEY': this.config.alpacaSecret
                }
            });

            return response.data.bars || [];

        } catch (error) {
            this.logger.error('Failed to fetch historical bars', { symbol, error });
            return [];
        }
    }

    /**
     * Performance tracking
     */
    trackLatency(provider, symbol, messageTime) {
        const now = Date.now();
        const latency = now - messageTime;

        const key = `${provider}-${symbol}`;
        if (!this.latencies.has(key)) {
            this.latencies.set(key, []);
        }

        const latencies = this.latencies.get(key);
        latencies.push(latency);

        // Keep only recent latencies
        if (latencies.length > 100) {
            latencies.shift();
        }

        // Check if latency exceeds threshold
        if (latency > this.config.maxLatency) {
            this.logger.warn('High latency detected', {
                provider,
                symbol,
                latency
            });
        }
    }

    trackUpdate(symbol) {
        const now = Date.now();
        this.lastUpdateTimes.set(symbol, now);

        if (!this.updateCounts.has(symbol)) {
            this.updateCounts.set(symbol, 0);
        }

        this.updateCounts.set(symbol, this.updateCounts.get(symbol) + 1);
    }

    /**
     * Data quality monitoring
     */
    startQualityMonitoring() {
        if (!this.config.enableQualityMonitoring) {
            return;
        }

        setInterval(() => {
            this.checkDataQuality();
        }, 60000); // Every minute
    }

    checkDataQuality() {
        const now = Date.now();

        this.subscriptions.forEach((dataTypes, symbol) => {
            const lastUpdate = this.lastUpdateTimes.get(symbol);

            if (!lastUpdate) {
                return;
            }

            const timeSinceUpdate = now - lastUpdate;

            // Check if updates are too infrequent
            if (timeSinceUpdate > this.config.minUpdateFrequency * 10) {
                this.logger.warn('Stale data detected', {
                    symbol,
                    timeSinceUpdate
                });

                this.emit('dataQualityIssue', {
                    symbol,
                    issue: 'stale_data',
                    timeSinceUpdate
                });
            }

            // Calculate average latency
            const latencyKey = `${this.config.primaryProvider}-${symbol}`;
            const latencies = this.latencies.get(latencyKey) || [];

            if (latencies.length > 0) {
                const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;

                this.dataQuality.set(symbol, {
                    avgLatency,
                    updateFrequency: this.updateCounts.get(symbol) || 0,
                    lastUpdate,
                    quality: avgLatency < 500 ? 'good' : avgLatency < 1000 ? 'fair' : 'poor'
                });
            }
        });
    }

    getDataQuality(symbol) {
        return this.dataQuality.get(symbol);
    }

    /**
     * Connection management
     */
    startHeartbeat() {
        setInterval(() => {
            this.connections.forEach((ws, provider) => {
                if (ws.readyState === WebSocket.OPEN) {
                    // Send ping/heartbeat based on provider
                    if (provider === 'alpaca') {
                        ws.ping();
                    }
                }
            });
        }, this.config.heartbeatInterval);
    }

    async reconnectProvider(provider) {
        const attempts = this.reconnectAttempts.get(provider) || 0;

        if (attempts >= this.config.maxReconnectAttempts) {
            this.logger.error(`Max reconnect attempts reached for ${provider}`);
            this.emit('providerDisconnected', provider);
            return;
        }

        this.reconnectAttempts.set(provider, attempts + 1);

        this.logger.info(`Reconnecting to ${provider}`, {
            attempt: attempts + 1,
            maxAttempts: this.config.maxReconnectAttempts
        });

        await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelay));

        await this.connectProvider(provider);
    }

    resubscribeAll(provider) {
        this.subscriptions.forEach((dataTypes, symbol) => {
            this.subscribeOnProvider(provider, symbol, Array.from(dataTypes));
        });
    }

    /**
     * Get connection status
     */
    getStatus() {
        const providerStatus = {};

        this.connections.forEach((ws, provider) => {
            providerStatus[provider] = {
                connected: ws.readyState === WebSocket.OPEN,
                reconnectAttempts: this.reconnectAttempts.get(provider) || 0
            };
        });

        return {
            providers: providerStatus,
            subscriptions: Array.from(this.subscriptions.keys()),
            totalQuotes: Array.from(this.quotes.values()).reduce((sum, q) => sum + q.length, 0),
            totalTrades: Array.from(this.trades.values()).reduce((sum, t) => sum + t.length, 0),
            dataQuality: Object.fromEntries(this.dataQuality)
        };
    }

    /**
     * Cleanup
     */
    disconnect() {
        this.connections.forEach((ws, provider) => {
            ws.close();
        });

        this.connections.clear();
        this.logger.info('Disconnected from all providers');
    }
}

module.exports = RealTimeMarketData;
