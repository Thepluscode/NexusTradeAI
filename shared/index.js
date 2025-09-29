/**
 * NexusTradeAI Shared Library
 * Main entry point for shared utilities and libraries
 */

// Authentication
const JWTHandler = require('./libs/authentication/jwt-handler');
const OAuthClient = require('./libs/authentication/oauth-client');
const SecurityUtils = require('./libs/authentication/security-utils');

// Database
const { DatabaseConnectionPools, getInstance: getDbInstance } = require('./libs/database/connection-pools');
const QueryBuilders = require('./libs/database/query-builders');
const Migrations = require('./libs/database/migrations');

// Messaging
const KafkaClient = require('./libs/messaging/kafka-client');
const RedisClient = require('./libs/messaging/redis-client');
const WebSocketClient = require('./libs/messaging/websocket-client');

// Monitoring
const MetricsCollector = require('./libs/monitoring/metrics-collector');
const ErrorTracker = require('./libs/monitoring/error-tracker');
const PerformanceMonitor = require('./libs/monitoring/performance-monitor');

// Trading
const OrderTypes = require('./libs/trading/order-types');
const MarketCalculations = require('./libs/trading/market-calculations');
const TechnicalIndicators = require('./libs/trading/technical-indicators');
const RiskCalculations = require('./libs/trading/risk-calculations');

// Utilities
const DateTime = require('./libs/utils/date-time');
const Formatters = require('./libs/utils/formatters');
const Validators = require('./libs/utils/validators');
const Encryption = require('./libs/utils/encryption');

// Constants
const MarketConstants = require('./constants/market-constants');
const ErrorCodes = require('./constants/error-codes');
const ApiEndpoints = require('./constants/api-endpoints');

// Configurations
const DatabaseConfig = require('./configs/database');
const RedisConfig = require('./configs/redis');
const KafkaConfig = require('./configs/kafka');
const ExchangesConfig = require('./configs/exchanges');

// Export all modules
module.exports = {
  // Authentication
  auth: {
    JWTHandler,
    OAuthClient,
    SecurityUtils
  },

  // Database
  database: {
    ConnectionPools: DatabaseConnectionPools,
    getConnectionPools: getDbInstance,
    QueryBuilders,
    Migrations
  },

  // Messaging
  messaging: {
    KafkaClient,
    RedisClient,
    WebSocketClient
  },

  // Monitoring
  monitoring: {
    MetricsCollector,
    ErrorTracker,
    PerformanceMonitor
  },

  // Trading
  trading: {
    OrderTypes,
    MarketCalculations,
    TechnicalIndicators,
    RiskCalculations
  },

  // Utilities
  utils: {
    DateTime,
    Formatters,
    Validators,
    Encryption
  },

  // Constants
  constants: {
    Market: MarketConstants,
    ErrorCodes,
    ApiEndpoints
  },

  // Configurations
  configs: {
    Database: DatabaseConfig,
    Redis: RedisConfig,
    Kafka: KafkaConfig,
    Exchanges: ExchangesConfig
  },

  // Version information
  version: require('./package.json').version,
  name: require('./package.json').name
};

// Export individual modules for direct import
module.exports.JWTHandler = JWTHandler;
module.exports.DatabaseConnectionPools = DatabaseConnectionPools;
module.exports.KafkaClient = KafkaClient;
module.exports.MarketCalculations = MarketCalculations;
module.exports.TechnicalIndicators = TechnicalIndicators;
module.exports.MarketConstants = MarketConstants;
module.exports.Formatters = Formatters;
module.exports.Validators = Validators;
module.exports.DateTime = DateTime;
module.exports.Encryption = Encryption;
