/**
 * Exchange Configurations for NexusTradeAI
 */

const EXCHANGE_CONFIG = {
  ALPACA: {
    name: 'Alpaca Markets',
    baseUrl: {
      paper: 'https://paper-api.alpaca.markets',
      live: 'https://api.alpaca.markets'
    },
    dataUrl: 'https://data.alpaca.markets',
    supportedAssets: ['EQUITY', 'CRYPTO'],
    tradingHours: {
      regular: { open: '09:30', close: '16:00' },
      extended: { preOpen: '04:00', afterClose: '20:00' }
    },
    commissions: { equity: 0, crypto: 0.0025 }
  },

  POLYGON: {
    name: 'Polygon.io',
    baseUrl: 'https://api.polygon.io',
    supportedAssets: ['EQUITY', 'OPTION', 'FOREX', 'CRYPTO'],
    dataTypes: ['real-time', 'delayed', 'historical'],
    rateLimit: { requests: 5, per: 'minute' }
  },

  IEX: {
    name: 'IEX Cloud',
    baseUrl: 'https://cloud.iexapis.com',
    supportedAssets: ['EQUITY'],
    dataTypes: ['real-time', 'delayed', 'historical'],
    rateLimit: { requests: 100, per: 'second' }
  }
};

const MARKET_HOURS = {
  NYSE: {
    timezone: 'America/New_York',
    regular: { open: '09:30', close: '16:00' },
    extended: { preOpen: '04:00', afterClose: '20:00' }
  },
  NASDAQ: {
    timezone: 'America/New_York',
    regular: { open: '09:30', close: '16:00' },
    extended: { preOpen: '04:00', afterClose: '20:00' }
  }
};

function getExchangeConfig(exchange) {
  return EXCHANGE_CONFIG[exchange.toUpperCase()];
}

module.exports = {
  EXCHANGE_CONFIG,
  MARKET_HOURS,
  getExchangeConfig
};