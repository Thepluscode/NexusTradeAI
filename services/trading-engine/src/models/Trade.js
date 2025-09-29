const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const tradeSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Order references
  buyOrderId: {
    type: String,
    required: true,
    index: true
  },
  sellOrderId: {
    type: String,
    required: true,
    index: true
  },
  
  // User references
  buyerId: {
    type: String,
    required: true,
    index: true
  },
  sellerId: {
    type: String,
    required: true,
    index: true
  },
  
  // Trade details
  symbol: {
    type: String,
    required: true,
    index: true
  },
  quantity: {
    type: String,
    required: true,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  price: {
    type: String,
    required: true,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  value: {
    type: String,
    required: true,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  
  // Fees
  buyerFee: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  sellerFee: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  totalFees: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  
  // Execution details
  venue: {
    type: String,
    default: 'internal',
    index: true
  },
  matchingAlgorithm: {
    type: String,
    enum: ['price_time', 'pro_rata', 'size_time', 'custom'],
    default: 'price_time'
  },
  
  // Liquidity indication
  buyerLiquidity: {
    type: String,
    enum: ['maker', 'taker'],
    required: true
  },
  sellerLiquidity: {
    type: String,
    enum: ['maker', 'taker'],
    required: true
  },
  
  // Settlement details
  settlementStatus: {
    type: String,
    enum: ['pending', 'settled', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  settlementDate: {
    type: Date,
    required: true
  },
  actualSettlementDate: Date,
  
  // Market data at execution
  marketData: {
    bestBid: String,
    bestAsk: String,
    spread: String,
    volume24h: String,
    volatility: Number
  },
  
  // Cross-trade detection
  isCrossTrade: {
    type: Boolean,
    default: function() {
      return this.buyerId === this.sellerId;
    },
    index: true
  },
  
  // Regulatory reporting
  reportingRequired: {
    type: Boolean,
    default: true
  },
  reportedToRegulator: {
    type: Boolean,
    default: false
  },
  regulatoryReportId: String,
  
  // Block trade indicator
  isBlockTrade: {
    type: Boolean,
    default: false
  },
  blockTradeThreshold: {
    type: String,
    default: '10000' // $10,000 default threshold
  },
  
  // Trade timing
  executionTime: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // External venue details (if applicable)
  externalTradeId: String,
  externalVenue: String,
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Convert Decimal strings to numbers for JSON output
      const decimalFields = ['quantity', 'price', 'value', 'buyerFee', 'sellerFee', 'totalFees'];
      
      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'string') {
          ret[field] = parseFloat(ret[field]);
        }
      });
      
      return ret;
    }
  }
});

// Compound indexes for performance
tradeSchema.index({ symbol: 1, executionTime: -1 });
tradeSchema.index({ buyerId: 1, executionTime: -1 });
tradeSchema.index({ sellerId: 1, executionTime: -1 });
tradeSchema.index({ venue: 1, executionTime: -1 });
tradeSchema.index({ settlementStatus: 1, settlementDate: 1 });
tradeSchema.index({ isCrossTrade: 1, executionTime: -1 });

// Virtual for net value (value + fees)
tradeSchema.virtual('netValue').get(function() {
  const value = new Decimal(this.value);
  const totalFees = new Decimal(this.totalFees);
  return value.plus(totalFees).toNumber();
});

// Virtual for spread at execution
tradeSchema.virtual('spreadAtExecution').get(function() {
  if (!this.marketData.bestBid || !this.marketData.bestAsk) return null;
  
  const bid = new Decimal(this.marketData.bestBid);
  const ask = new Decimal(this.marketData.bestAsk);
  const spread = ask.minus(bid);
  const midPrice = bid.plus(ask).dividedBy(2);
  
  return {
    absolute: spread.toNumber(),
    percentage: spread.dividedBy(midPrice).times(100).toNumber()
  };
});

// Methods
tradeSchema.methods.settle = function() {
  this.settlementStatus = 'settled';
  this.actualSettlementDate = new Date();
  this.updatedAt = new Date();
};

tradeSchema.methods.failSettlement = function(reason) {
  this.settlementStatus = 'failed';
  this.metadata.set('settlementFailureReason', reason);
  this.updatedAt = new Date();
};

tradeSchema.methods.calculateTotalFees = function() {
  const buyerFee = new Decimal(this.buyerFee || '0');
  const sellerFee = new Decimal(this.sellerFee || '0');
  this.totalFees = buyerFee.plus(sellerFee).toString();
  return this.totalFees;
};

tradeSchema.methods.markAsBlockTrade = function() {
  const value = new Decimal(this.value);
  const threshold = new Decimal(this.blockTradeThreshold);
  
  this.isBlockTrade = value.gte(threshold);
  return this.isBlockTrade;
};

tradeSchema.methods.generateRegulatoryReport = function() {
  return {
    tradeId: this.id,
    symbol: this.symbol,
    quantity: this.quantity,
    price: this.price,
    value: this.value,
    executionTime: this.executionTime,
    venue: this.venue,
    buyerId: this.buyerId,
    sellerId: this.sellerId,
    isCrossTrade: this.isCrossTrade,
    isBlockTrade: this.isBlockTrade,
    fees: {
      buyer: this.buyerFee,
      seller: this.sellerFee,
      total: this.totalFees
    }
  };
};

// Static methods
tradeSchema.statics.findTradesByUser = function(userId, startDate, endDate, limit = 100) {
  const query = {
    $or: [
      { buyerId: userId },
      { sellerId: userId }
    ]
  };
  
  if (startDate && endDate) {
    query.executionTime = {
      $gte: startDate,
      $lte: endDate
    };
  }
  
  return this.find(query)
    .sort({ executionTime: -1 })
    .limit(limit);
};

tradeSchema.statics.findTradesBySymbol = function(symbol, startDate, endDate, limit = 100) {
  const query = { symbol };
  
  if (startDate && endDate) {
    query.executionTime = {
      $gte: startDate,
      $lte: endDate
    };
  }
  
  return this.find(query)
    .sort({ executionTime: -1 })
    .limit(limit);
};

tradeSchema.statics.getVolumeStats = function(symbol, timeframe = '24h') {
  const now = new Date();
  let startDate;
  
  switch (timeframe) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return this.aggregate([
    {
      $match: {
        symbol,
        executionTime: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: null,
        totalVolume: { $sum: { $toDouble: '$quantity' } },
        totalValue: { $sum: { $toDouble: '$value' } },
        tradeCount: { $sum: 1 },
        avgPrice: { $avg: { $toDouble: '$price' } },
        minPrice: { $min: { $toDouble: '$price' } },
        maxPrice: { $max: { $toDouble: '$price' } },
        totalFees: { $sum: { $toDouble: '$totalFees' } }
      }
    }
  ]);
};

tradeSchema.statics.getPriceHistory = function(symbol, interval = '1h', limit = 100) {
  let groupBy;
  
  switch (interval) {
    case '1m':
      groupBy = {
        year: { $year: '$executionTime' },
        month: { $month: '$executionTime' },
        day: { $dayOfMonth: '$executionTime' },
        hour: { $hour: '$executionTime' },
        minute: { $minute: '$executionTime' }
      };
      break;
    case '1h':
      groupBy = {
        year: { $year: '$executionTime' },
        month: { $month: '$executionTime' },
        day: { $dayOfMonth: '$executionTime' },
        hour: { $hour: '$executionTime' }
      };
      break;
    case '1d':
      groupBy = {
        year: { $year: '$executionTime' },
        month: { $month: '$executionTime' },
        day: { $dayOfMonth: '$executionTime' }
      };
      break;
    default:
      groupBy = {
        year: { $year: '$executionTime' },
        month: { $month: '$executionTime' },
        day: { $dayOfMonth: '$executionTime' },
        hour: { $hour: '$executionTime' }
      };
  }
  
  return this.aggregate([
    {
      $match: { symbol }
    },
    {
      $group: {
        _id: groupBy,
        open: { $first: { $toDouble: '$price' } },
        high: { $max: { $toDouble: '$price' } },
        low: { $min: { $toDouble: '$price' } },
        close: { $last: { $toDouble: '$price' } },
        volume: { $sum: { $toDouble: '$quantity' } },
        trades: { $sum: 1 }
      }
    },
    {
      $sort: { '_id': -1 }
    },
    {
      $limit: limit
    }
  ]);
};

tradeSchema.statics.findCrossTrades = function(startDate, endDate) {
  const query = { isCrossTrade: true };
  
  if (startDate && endDate) {
    query.executionTime = {
      $gte: startDate,
      $lte: endDate
    };
  }
  
  return this.find(query).sort({ executionTime: -1 });
};

tradeSchema.statics.findPendingSettlements = function() {
  return this.find({
    settlementStatus: 'pending',
    settlementDate: { $lte: new Date() }
  }).sort({ settlementDate: 1 });
};

// Pre-save middleware
tradeSchema.pre('save', function(next) {
  // Calculate total fees if not set
  if (!this.totalFees || this.totalFees === '0') {
    this.calculateTotalFees();
  }
  
  // Mark as block trade if applicable
  this.markAsBlockTrade();
  
  // Set default settlement date (T+1)
  if (!this.settlementDate) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    this.settlementDate = tomorrow;
  }
  
  next();
});

// Post-save middleware
tradeSchema.post('save', function(doc) {
  // Trigger regulatory reporting if required
  if (doc.reportingRequired && !doc.reportedToRegulator) {
    // This would trigger an async job to report to regulators
    console.log(`Trade ${doc.id} requires regulatory reporting`);
  }
  
  // Trigger settlement processing
  if (doc.settlementStatus === 'pending') {
    // This would trigger settlement processing
    console.log(`Trade ${doc.id} pending settlement on ${doc.settlementDate}`);
  }
});

module.exports = mongoose.model('Trade', tradeSchema);