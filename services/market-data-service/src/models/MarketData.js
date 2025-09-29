const mongoose = require('mongoose');

const marketDataSchema = new mongoose.Schema({
  exchange: {
    type: String,
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    index: true
  },
  dataType: {
    type: String,
    enum: ['tick', 'trade', 'quote', 'orderbook', 'bar', 'ticker'],
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    index: true
  },
  price: {
    type: Number,
    required: function() {
      return ['tick', 'trade', 'quote', 'ticker'].includes(this.dataType);
    }
  },
  volume: {
    type: Number,
    required: function() {
      return ['trade', 'bar', 'ticker'].includes(this.dataType);
    }
  },
  size: {
    type: Number,
    required: function() {
      return this.dataType === 'trade';
    }
  },
  side: {
    type: String,
    enum: ['buy', 'sell'],
    required: function() {
      return this.dataType === 'trade';
    }
  },
  // Quote data
  bid: {
    type: Number,
    required: function() {
      return this.dataType === 'quote';
    }
  },
  ask: {
    type: Number,
    required: function() {
      return this.dataType === 'quote';
    }
  },
  bidSize: {
    type: Number,
    required: function() {
      return this.dataType === 'quote';
    }
  },
  askSize: {
    type: Number,
    required: function() {
      return this.dataType === 'quote';
    }
  },
  // OHLC data for bars
  open: {
    type: Number,
    required: function() {
      return this.dataType === 'bar';
    }
  },
  high: {
    type: Number,
    required: function() {
      return this.dataType === 'bar';
    }
  },
  low: {
    type: Number,
    required: function() {
      return this.dataType === 'bar';
    }
  },
  close: {
    type: Number,
    required: function() {
      return this.dataType === 'bar';
    }
  },
  // Order book data
  bids: [{
    price: Number,
    size: Number
  }],
  asks: [{
    price: Number,
    size: Number
  }],
  // Analytics data
  priceAnalytics: {
    change: Number,
    changePercent: Number,
    volatility: Number,
    vwap: Number
  },
  technicalIndicators: {
    sma20: Number,
    sma50: Number,
    rsi: Number,
    bollingerBands: {
      upper: Number,
      middle: Number,
      lower: Number
    }
  },
  orderBookAnalytics: {
    spread: Number,
    spreadPercent: Number,
    bidDepth: Number,
    askDepth: Number,
    imbalance: Number,
    bestBid: Number,
    bestAsk: Number
  },
  // Anomaly detection
  anomaly: {
    type: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    change: Number,
    description: String
  },
  // Metadata
  receivedAt: {
    type: Date,
    default: Date.now
  },
  processingTime: Number,
  source: String,
  conditions: [String],
  tradeId: String
}, {
  timestamps: true,
  collection: 'market_data'
});

// Compound indexes for efficient queries
marketDataSchema.index({ exchange: 1, symbol: 1, timestamp: -1 });
marketDataSchema.index({ exchange: 1, symbol: 1, dataType: 1, timestamp: -1 });
marketDataSchema.index({ timestamp: -1 });
marketDataSchema.index({ 'anomaly.severity': 1, timestamp: -1 });

// TTL index for automatic data cleanup (keep data for 30 days)
marketDataSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Virtual for spread calculation
marketDataSchema.virtual('spread').get(function() {
  if (this.bid && this.ask) {
    return this.ask - this.bid;
  }
  return null;
});

// Static methods
marketDataSchema.statics.getLatestPrice = function(exchange, symbol) {
  return this.findOne({
    exchange,
    symbol,
    dataType: { $in: ['tick', 'trade', 'ticker'] },
    price: { $exists: true }
  })
  .sort({ timestamp: -1 })
  .select('price timestamp');
};

marketDataSchema.statics.getPriceHistory = function(exchange, symbol, from, to, limit = 1000) {
  const query = {
    exchange,
    symbol,
    dataType: { $in: ['tick', 'trade', 'ticker'] },
    price: { $exists: true }
  };
  
  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = new Date(from);
    if (to) query.timestamp.$lte = new Date(to);
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('price timestamp volume');
};

marketDataSchema.statics.getOrderBook = function(exchange, symbol) {
  return this.findOne({
    exchange,
    symbol,
    dataType: 'orderbook',
    bids: { $exists: true },
    asks: { $exists: true }
  })
  .sort({ timestamp: -1 })
  .select('bids asks timestamp orderBookAnalytics');
};

marketDataSchema.statics.getAnomalies = function(exchange, symbol, severity, from, to) {
  const query = {
    anomaly: { $exists: true }
  };
  
  if (exchange) query.exchange = exchange;
  if (symbol) query.symbol = symbol;
  if (severity) query['anomaly.severity'] = severity;
  
  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = new Date(from);
    if (to) query.timestamp.$lte = new Date(to);
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .select('exchange symbol anomaly timestamp price');
};

// Instance methods
marketDataSchema.methods.toPublic = function() {
  const obj = this.toObject();
  
  // Remove sensitive or unnecessary fields
  delete obj._id;
  delete obj.__v;
  delete obj.receivedAt;
  delete obj.processingTime;
  
  return obj;
};

module.exports = mongoose.model('MarketData', marketDataSchema);