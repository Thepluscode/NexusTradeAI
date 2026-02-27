/**
 * Broker Factory - Unified Broker Adapter System
 * Creates and manages connections to different trading platforms
 *
 * Supported Brokers:
 * - MetaTrader 4/5 (Forex, CFDs)
 * - Interactive Brokers (Stocks, Options, Futures, Forex)
 * - Binance (Cryptocurrency)
 * - Kraken (Cryptocurrency, Forex)
 * - Alpaca (Stocks, paper trading)
 */

const MetaTraderAdapter = require('./metatrader-adapter');
const IBKRAdapter = require('./ibkr-adapter');
const BinanceAdapter = require('./binance-adapter');
const KrakenAdapter = require('./kraken-adapter');

class BrokerFactory {
    constructor() {
        this.brokers = new Map();
        this.activeBroker = null;
    }

    /**
     * Create a broker adapter
     */
    createBroker(brokerType, config = {}) {
        let broker;

        switch (brokerType.toLowerCase()) {
            case 'metatrader':
            case 'mt4':
            case 'mt5':
                broker = new MetaTraderAdapter(config);
                break;

            case 'ibkr':
            case 'interactivebrokers':
                broker = new IBKRAdapter(config);
                break;

            case 'binance':
                broker = new BinanceAdapter(config);
                break;

            case 'kraken':
                broker = new KrakenAdapter(config);
                break;

            case 'alpaca':
                // Use existing Alpaca integration from profitable-strategies
                console.log('ℹ️  Alpaca broker uses existing integration in profitable-strategies.js');
                return null;

            default:
                throw new Error(`Unknown broker type: ${brokerType}. Supported: metatrader, ibkr, binance, kraken, alpaca`);
        }

        this.brokers.set(brokerType, broker);
        return broker;
    }

    /**
     * Get or create a broker adapter
     */
    getBroker(brokerType, config = {}) {
        if (this.brokers.has(brokerType)) {
            return this.brokers.get(brokerType);
        }

        return this.createBroker(brokerType, config);
    }

    /**
     * Connect to a broker
     */
    async connect(brokerType, config = {}) {
        try {
            const broker = this.getBroker(brokerType, config);

            if (!broker) {
                throw new Error(`Failed to create ${brokerType} broker`);
            }

            await broker.connect();

            this.activeBroker = broker;

            console.log(`✅ Active broker set to: ${brokerType}`);

            return broker;

        } catch (error) {
            console.error(`❌ Failed to connect to ${brokerType}:`, error.message);
            throw error;
        }
    }

    /**
     * Connect to multiple brokers
     */
    async connectMultiple(brokerConfigs) {
        const connections = [];

        for (const { type, config } of brokerConfigs) {
            try {
                const broker = await this.connect(type, config);
                connections.push({ type, broker, success: true });
            } catch (error) {
                console.error(`Failed to connect to ${type}:`, error.message);
                connections.push({ type, broker: null, success: false, error: error.message });
            }
        }

        return connections;
    }

    /**
     * Set active broker
     */
    setActiveBroker(brokerType) {
        const broker = this.brokers.get(brokerType);

        if (!broker) {
            throw new Error(`Broker ${brokerType} not initialized`);
        }

        if (!broker.connected) {
            throw new Error(`Broker ${brokerType} not connected`);
        }

        this.activeBroker = broker;
        console.log(`🔄 Switched active broker to: ${brokerType}`);

        return broker;
    }

    /**
     * Get active broker
     */
    getActiveBroker() {
        if (!this.activeBroker) {
            throw new Error('No active broker set');
        }

        return this.activeBroker;
    }

    /**
     * Open position on active broker
     */
    async openPosition(symbol, direction, params = {}) {
        const broker = this.getActiveBroker();
        return await broker.openPosition(symbol, direction, params);
    }

    /**
     * Close position on active broker
     */
    async closePosition(positionId) {
        const broker = this.getActiveBroker();
        return await broker.closePosition(positionId);
    }

    /**
     * Get current price from active broker
     */
    async getCurrentPrice(symbol) {
        const broker = this.getActiveBroker();
        return await broker.getCurrentPrice(symbol);
    }

    /**
     * Get account info from active broker
     */
    async getAccountInfo() {
        const broker = this.getActiveBroker();
        return await broker.getAccountInfo();
    }

    /**
     * Get all positions from active broker
     */
    getPositions() {
        const broker = this.getActiveBroker();
        return broker.getPositions();
    }

    /**
     * Get positions from all connected brokers
     */
    getAllPositions() {
        const allPositions = [];

        for (const [type, broker] of this.brokers) {
            if (broker.connected) {
                const positions = broker.getPositions();
                allPositions.push({
                    broker: type,
                    positions
                });
            }
        }

        return allPositions;
    }

    /**
     * Disconnect from a broker
     */
    async disconnect(brokerType) {
        const broker = this.brokers.get(brokerType);

        if (broker) {
            await broker.disconnect();
            this.brokers.delete(brokerType);

            if (this.activeBroker === broker) {
                this.activeBroker = null;
            }

            console.log(`✅ Disconnected from ${brokerType}`);
        }
    }

    /**
     * Disconnect from all brokers
     */
    async disconnectAll() {
        const promises = [];

        for (const [type, broker] of this.brokers) {
            promises.push(broker.disconnect());
        }

        await Promise.all(promises);

        this.brokers.clear();
        this.activeBroker = null;

        console.log('✅ Disconnected from all brokers');
    }

    /**
     * Get broker configuration from environment
     */
    static getConfigFromEnv() {
        const brokerType = process.env.BROKER_TYPE || 'paper';

        const configs = {
            metatrader: {
                type: 'metatrader',
                config: {
                    useMetaApi: process.env.MT_USE_METAAPI === 'true',
                    metaApiToken: process.env.METAAPI_TOKEN,
                    accountId: process.env.MT_ACCOUNT_ID,
                    zmqHost: process.env.MT_ZMQ_HOST,
                    platform: process.env.MT_PLATFORM || 'MT5'
                }
            },
            ibkr: {
                type: 'ibkr',
                config: {
                    host: process.env.IBKR_HOST,
                    port: parseInt(process.env.IBKR_PORT) || 7497,
                    clientId: parseInt(process.env.IBKR_CLIENT_ID) || 0,
                    accountId: process.env.IBKR_ACCOUNT_ID,
                    isPaper: process.env.IBKR_IS_PAPER !== 'false'
                }
            },
            binance: {
                type: 'binance',
                config: {
                    apiKey: process.env.BINANCE_API_KEY,
                    apiSecret: process.env.BINANCE_API_SECRET,
                    useTestnet: process.env.BINANCE_USE_TESTNET !== 'false'
                }
            },
            kraken: {
                type: 'kraken',
                config: {
                    apiKey: process.env.KRAKEN_API_KEY,
                    apiSecret: process.env.KRAKEN_API_SECRET,
                    otp: process.env.KRAKEN_OTP
                }
            },
            paper: {
                type: 'paper',
                config: {
                    // Use paper trading (mock prices)
                }
            }
        };

        return configs[brokerType] || configs.paper;
    }

    /**
     * Create broker from environment configuration
     */
    static async createFromEnv() {
        const factory = new BrokerFactory();
        const config = BrokerFactory.getConfigFromEnv();

        if (config.type !== 'paper') {
            try {
                await factory.connect(config.type, config.config);
                return factory;
            } catch (error) {
                console.error(`Failed to connect to ${config.type}, falling back to paper trading`);
            }
        }

        console.log('ℹ️  Using paper trading mode (mock prices)');
        return factory;
    }
}

module.exports = BrokerFactory;
