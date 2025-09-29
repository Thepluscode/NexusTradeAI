/**
 * Kafka Configuration for NexusTradeAI
 */

const KAFKA_CONFIG = {
  development: {
    clientId: 'nexustrade-dev',
    brokers: [process.env.KAFKA_BROKERS || 'localhost:9092'],
    groupId: 'nexustrade-dev-group',
    ssl: false,
    sasl: null
  },

  production: {
    clientId: 'nexustrade-prod',
    brokers: process.env.KAFKA_BROKERS?.split(',') || ['prod-kafka.nexustrade.ai:9092'],
    groupId: 'nexustrade-prod-group',
    ssl: true,
    sasl: {
      mechanism: 'plain',
      username: process.env.KAFKA_USERNAME,
      password: process.env.KAFKA_PASSWORD
    }
  }
};

const TOPICS = {
  MARKET_DATA: 'market-data',
  ORDER_UPDATES: 'order-updates',
  TRADE_EXECUTIONS: 'trade-executions',
  PORTFOLIO_UPDATES: 'portfolio-updates',
  ALERTS: 'alerts',
  NOTIFICATIONS: 'notifications'
};

function getKafkaConfig(environment = null) {
  const env = environment || process.env.NODE_ENV || 'development';
  return KAFKA_CONFIG[env] || KAFKA_CONFIG.development;
}

module.exports = {
  KAFKA_CONFIG,
  TOPICS,
  getKafkaConfig
};