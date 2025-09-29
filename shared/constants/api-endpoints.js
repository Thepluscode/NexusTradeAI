/**
 * API Endpoints for NexusTradeAI
 */

const API_ENDPOINTS = {
  // Authentication
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    LOGOUT: '/api/v1/auth/logout',
    REFRESH: '/api/v1/auth/refresh',
    REGISTER: '/api/v1/auth/register',
    VERIFY: '/api/v1/auth/verify',
    RESET_PASSWORD: '/api/v1/auth/reset-password'
  },

  // User Management
  USERS: {
    PROFILE: '/api/v1/users/profile',
    UPDATE_PROFILE: '/api/v1/users/profile',
    PREFERENCES: '/api/v1/users/preferences',
    NOTIFICATIONS: '/api/v1/users/notifications'
  },

  // Trading
  TRADING: {
    ACCOUNTS: '/api/v1/trading/accounts',
    ORDERS: '/api/v1/trading/orders',
    POSITIONS: '/api/v1/trading/positions',
    PORTFOLIO: '/api/v1/trading/portfolio',
    TRADES: '/api/v1/trading/trades'
  },

  // Market Data
  MARKET_DATA: {
    QUOTES: '/api/v1/market/quotes',
    BARS: '/api/v1/market/bars',
    TRADES: '/api/v1/market/trades',
    OPTIONS: '/api/v1/market/options',
    NEWS: '/api/v1/market/news'
  },

  // Strategies
  STRATEGIES: {
    LIST: '/api/v1/strategies',
    CREATE: '/api/v1/strategies',
    UPDATE: '/api/v1/strategies/:id',
    DELETE: '/api/v1/strategies/:id',
    BACKTEST: '/api/v1/strategies/:id/backtest',
    DEPLOY: '/api/v1/strategies/:id/deploy'
  },

  // Alerts
  ALERTS: {
    LIST: '/api/v1/alerts',
    CREATE: '/api/v1/alerts',
    UPDATE: '/api/v1/alerts/:id',
    DELETE: '/api/v1/alerts/:id'
  },

  // Watchlists
  WATCHLISTS: {
    LIST: '/api/v1/watchlists',
    CREATE: '/api/v1/watchlists',
    UPDATE: '/api/v1/watchlists/:id',
    DELETE: '/api/v1/watchlists/:id',
    SYMBOLS: '/api/v1/watchlists/:id/symbols'
  },

  // Analytics
  ANALYTICS: {
    PERFORMANCE: '/api/v1/analytics/performance',
    RISK: '/api/v1/analytics/risk',
    REPORTS: '/api/v1/analytics/reports'
  },

  // Admin
  ADMIN: {
    USERS: '/api/v1/admin/users',
    SYSTEM: '/api/v1/admin/system',
    LOGS: '/api/v1/admin/logs',
    METRICS: '/api/v1/admin/metrics'
  }
};

module.exports = API_ENDPOINTS;