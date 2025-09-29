/**
 * Market Constants for NexusTradeAI
 * Trading-specific constants and market parameters
 */

// Market Hours (Eastern Time)
const MARKET_HOURS = {
  NYSE: {
    REGULAR: {
      OPEN: '09:30',
      CLOSE: '16:00'
    },
    EXTENDED: {
      PRE_MARKET_OPEN: '04:00',
      PRE_MARKET_CLOSE: '09:30',
      AFTER_HOURS_OPEN: '16:00',
      AFTER_HOURS_CLOSE: '20:00'
    }
  },
  NASDAQ: {
    REGULAR: {
      OPEN: '09:30',
      CLOSE: '16:00'
    },
    EXTENDED: {
      PRE_MARKET_OPEN: '04:00',
      PRE_MARKET_CLOSE: '09:30',
      AFTER_HOURS_OPEN: '16:00',
      AFTER_HOURS_CLOSE: '20:00'
    }
  },
  CRYPTO: {
    REGULAR: {
      OPEN: '00:00',
      CLOSE: '23:59'
    }
  },
  FOREX: {
    REGULAR: {
      OPEN: '17:00', // Sunday
      CLOSE: '17:00'  // Friday
    }
  }
};

// Trading Limits and Regulations
const TRADING_LIMITS = {
  PDT: {
    MIN_EQUITY: 25000, // Pattern Day Trader minimum equity
    MAX_DAY_TRADES: 3, // For accounts under $25k
    BUYING_POWER_MULTIPLIER: 4
  },
  POSITION_LIMITS: {
    MAX_POSITION_SIZE_PERCENT: 20, // Max 20% of portfolio in single position
    MAX_SECTOR_CONCENTRATION: 40, // Max 40% in single sector
    MAX_SINGLE_ORDER_VALUE: 1000000 // $1M max single order
  },
  RISK_LIMITS: {
    MAX_DAILY_LOSS_PERCENT: 5, // Max 5% daily loss
    MAX_DRAWDOWN_PERCENT: 15, // Max 15% drawdown
    STOP_LOSS_PERCENT: 2, // Default 2% stop loss
    TAKE_PROFIT_PERCENT: 6 // Default 6% take profit
  }
};

// Asset Classes
const ASSET_CLASSES = {
  EQUITY: 'EQUITY',
  OPTION: 'OPTION',
  CRYPTO: 'CRYPTO',
  FOREX: 'FOREX',
  FUTURE: 'FUTURE',
  BOND: 'BOND',
  COMMODITY: 'COMMODITY',
  ETF: 'ETF',
  MUTUAL_FUND: 'MUTUAL_FUND'
};

// Order Types
const ORDER_TYPES = {
  MARKET: 'MARKET',
  LIMIT: 'LIMIT',
  STOP: 'STOP',
  STOP_LIMIT: 'STOP_LIMIT',
  TRAILING_STOP: 'TRAILING_STOP',
  TRAILING_STOP_LIMIT: 'TRAILING_STOP_LIMIT',
  BRACKET: 'BRACKET',
  OCO: 'OCO', // One-Cancels-Other
  OTO: 'OTO'  // One-Triggers-Other
};

// Time in Force
const TIME_IN_FORCE = {
  DAY: 'DAY',
  GTC: 'GTC', // Good Till Canceled
  IOC: 'IOC', // Immediate or Cancel
  FOK: 'FOK', // Fill or Kill
  GTD: 'GTD'  // Good Till Date
};

// Order Status
const ORDER_STATUS = {
  NEW: 'NEW',
  PARTIALLY_FILLED: 'PARTIALLY_FILLED',
  FILLED: 'FILLED',
  DONE_FOR_DAY: 'DONE_FOR_DAY',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
  REPLACED: 'REPLACED',
  PENDING_CANCEL: 'PENDING_CANCEL',
  PENDING_REPLACE: 'PENDING_REPLACE',
  PENDING_REVIEW: 'PENDING_REVIEW',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
  CALCULATED: 'CALCULATED'
};

// Exchanges
const EXCHANGES = {
  NYSE: 'NYSE',
  NASDAQ: 'NASDAQ',
  AMEX: 'AMEX',
  ARCA: 'ARCA',
  BATS: 'BATS',
  IEX: 'IEX',
  CBOE: 'CBOE',
  CME: 'CME',
  NYMEX: 'NYMEX',
  COMEX: 'COMEX',
  CBOT: 'CBOT',
  ICE: 'ICE'
};

// Timeframes
const TIMEFRAMES = {
  TICK: 'TICK',
  SECOND_1: '1s',
  SECOND_5: '5s',
  SECOND_15: '15s',
  SECOND_30: '30s',
  MINUTE_1: '1min',
  MINUTE_5: '5min',
  MINUTE_15: '15min',
  MINUTE_30: '30min',
  HOUR_1: '1hour',
  HOUR_4: '4hour',
  DAY_1: '1day',
  WEEK_1: '1week',
  MONTH_1: '1month',
  QUARTER_1: '1quarter',
  YEAR_1: '1year'
};

// Strategy Types
const STRATEGY_TYPES = {
  MOMENTUM: 'Momentum',
  MEAN_REVERSION: 'Mean Reversion',
  ARBITRAGE: 'Arbitrage',
  MARKET_MAKING: 'Market Making',
  TREND_FOLLOWING: 'Trend Following',
  PAIRS_TRADING: 'Pairs Trading',
  STATISTICAL_ARBITRAGE: 'Statistical Arbitrage',
  MACHINE_LEARNING: 'Machine Learning',
  DEEP_LEARNING: 'Deep Learning',
  REINFORCEMENT_LEARNING: 'Reinforcement Learning',
  CUSTOM: 'Custom'
};

module.exports = {
  MARKET_HOURS,
  TRADING_LIMITS,
  ASSET_CLASSES,
  ORDER_TYPES,
  TIME_IN_FORCE,
  ORDER_STATUS,
  EXCHANGES,
  TIMEFRAMES,
  STRATEGY_TYPES
};