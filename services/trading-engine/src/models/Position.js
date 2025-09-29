const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const positionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  symbol: {
    type: String,
    required: true,
    index: true
  },
  
  // Position details
  quantity: {
    type: String,
    required: true,
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  averagePrice: {
    type: String,
    required: true,
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  lastPrice: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  marketValue: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  
  // P&L tracking
  unrealizedPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  realizedPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  totalPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  
  // Cost basis and fees
  costBasis: {
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
  
  // Position status
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  side: {
    type: String,
    enum: ['long', 'short', 'flat'],
    default: function() {
      const qty = new Decimal(this.quantity || '0');
      if (qty.gt(0)) return 'long';
      if (qty.lt(0)) return 'short';
      return 'flat';
    }
  },
  
  // Risk metrics
  leverage: {
    type: Number,
    default: 1
  },
  marginUsed: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  maintenanceMargin: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  
  // Position timing
  openedAt: {
    type: Date,
    default: Date.now
  },
  closedAt: Date,
  lastTradeAt: {
    type: Date,
    default: Date.now
  },
  lastTradeId: String,
  
  // FIFO tracking for tax purposes
  lots: [{
    quantity: {
      type: String,
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    },
    price: {
      type: String,
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    tradeId: String
  }],
  
  // Performance metrics
  maxUnrealizedPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  minUnrealizedPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  maxFavorableExcursion: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  maxAdverseExcursion: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  
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
      const decimalFields = [
        'quantity', 'averagePrice', 'lastPrice', 'marketValue',
        'unrealizedPnL', 'realizedPnL', 'totalPnL', 'costBasis', 'totalFees',
        'marginUsed', 'maintenanceMargin', 'maxUnrealizedPnL', 'minUnrealizedPnL',
        'maxFavorableExcursion', 'maxAdverseExcursion'
      ];
      
      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'string') {
          ret[field] = parseFloat(ret[field]);
        }
      });
      
      // Convert lots
      if (ret.lots) {
        ret.lots = ret.lots.map(lot => ({
          ...lot,
          quantity: parseFloat(lot.quantity || 0),
          price: parseFloat(lot.price || 0)
        }));
      }
      
      return ret;
    }
  }
});

// Compound indexes
positionSchema.index({ userId: 1, symbol: 1 }, { unique: true });
positionSchema.index({ userId: 1, isActive: 1 });
positionSchema.index({ symbol: 1, isActive: 1 });
positionSchema.index({ side: 1, isActive: 1 });

// Virtual for position value in base currency
positionSchema.virtual('positionValue').get(function() {
  const quantity = new Decimal(this.quantity);
  const lastPrice = new Decimal(this.lastPrice);
  return quantity.abs().times(lastPrice).toNumber();
});

// Virtual for unrealized PnL percentage
positionSchema.virtual('unrealizedPnLPercent').get(function() {
  const costBasis = new Decimal(this.costBasis);
  const unrealizedPnL = new Decimal(this.unrealizedPnL);
  
  if (costBasis.eq(0)) return 0;
  return unrealizedPnL.dividedBy(costBasis).times(100).toNumber();
});

// Virtual for total return percentage
positionSchema.virtual('totalReturnPercent').get(function() {
  const costBasis = new Decimal(this.costBasis);
  const totalPnL = new Decimal(this.totalPnL);
  
  if (costBasis.eq(0)) return 0;
  return totalPnL.dividedBy(costBasis).times(100).toNumber();
});

// Virtual for days held
positionSchema.virtual('daysHeld').get(function() {
  const start = this.openedAt;
  const end = this.closedAt || new Date();
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Methods
positionSchema.methods.updateMarketValue = function(marketPrice) {
  const quantity = new Decimal(this.quantity);
  const price = new Decimal(marketPrice);
  
  this.lastPrice = price.toString();
  this.marketValue = quantity.times(price).toString();
  
  // Calculate unrealized P&L
  const avgPrice = new Decimal(this.averagePrice);
  this.unrealizedPnL = quantity.times(price.minus(avgPrice)).toString();
  
  // Update total P&L
  const realizedPnL = new Decimal(this.realizedPnL);
  const unrealizedPnL = new Decimal(this.unrealizedPnL);
  this.totalPnL = realizedPnL.plus(unrealizedPnL).toString();
  
  // Update performance metrics
  this.updatePerformanceMetrics();
  
  this.updatedAt = new Date();
};

positionSchema.methods.updatePerformanceMetrics = function() {
  const unrealizedPnL = new Decimal(this.unrealizedPnL);
  const maxUnrealizedPnL = new Decimal(this.maxUnrealizedPnL);
  const minUnrealizedPnL = new Decimal(this.minUnrealizedPnL);
  
  // Update max/min unrealized P&L
  if (unrealizedPnL.gt(maxUnrealizedPnL)) {
    this.maxUnrealizedPnL = unrealizedPnL.toString();
    this.maxFavorableExcursion = unrealizedPnL.toString();
  }
  
  if (unrealizedPnL.lt(minUnrealizedPnL)) {
    this.minUnrealizedPnL = unrealizedPnL.toString();
    this.maxAdverseExcursion = unrealizedPnL.abs().toString();
  }
};

positionSchema.methods.addTrade = function(tradeData) {
  const { quantity, price, side, fee, tradeId } = tradeData;
  const tradeQuantity = new Decimal(quantity);
  const tradePrice = new Decimal(price);
  const tradeFee = new Decimal(fee || '0');
  
  const currentQuantity = new Decimal(this.quantity);
  const currentAvgPrice = new Decimal(this.averagePrice);
  const currentFees = new Decimal(this.totalFees);
  
  // Determine if this is opening, adding to, or closing position
  const isOpening = currentQuantity.eq(0);
  const isSameSide = (currentQuantity.gt(0) && side === 'buy') || 
                     (currentQuantity.lt(0) && side === 'sell');
  
  let newQuantity, newAvgPrice, realizedPnL = new Decimal(0);
  
  if (isOpening || isSameSide) {
    // Opening new position or adding to existing position
    const signedQuantity = side === 'buy' ? tradeQuantity : tradeQuantity.negated();
    newQuantity = currentQuantity.plus(signedQuantity);
    
    // Calculate new average price
    const currentValue = currentQuantity.abs().times(currentAvgPrice);
    const tradeValue = tradeQuantity.times(tradePrice);
    const totalValue = currentValue.plus(tradeValue);
    const totalQuantity = currentQuantity.abs().plus(tradeQuantity);
    
    newAvgPrice = totalQuantity.gt(0) ? totalValue.dividedBy(totalQuantity) : new Decimal(0);
    
    // Add to lots for FIFO tracking
    this.lots.push({
      quantity: signedQuantity.toString(),
      price: tradePrice.toString(),
      timestamp: new Date(),
      tradeId
    });
    
  } else {
    // Closing or reducing position
    const closingQuantity = Decimal.min(currentQuantity.abs(), tradeQuantity);
    
    // Calculate realized P&L using FIFO
    realizedPnL = this.calculateRealizedPnLFIFO(closingQuantity, tradePrice);
    
    // Update position size
    const signedQuantity = side === 'buy' ? tradeQuantity : tradeQuantity.negated();
    newQuantity = currentQuantity.plus(signedQuantity);
    newAvgPrice = currentAvgPrice; // Average price doesn't change when closing
  }
  
  // Update position
  this.quantity = newQuantity.toString();
  this.averagePrice = newAvgPrice.toString();
  this.lastPrice = tradePrice.toString();
  this.realizedPnL = new Decimal(this.realizedPnL).plus(realizedPnL).toString();
  this.totalFees = currentFees.plus(tradeFee).toString();
  this.lastTradeAt = new Date();
  this.lastTradeId = tradeId;
  
  // Update cost basis
  this.costBasis = newQuantity.abs().times(newAvgPrice).toString();
  
  // Update market value
  this.marketValue = newQuantity.times(tradePrice).toString();
  
  // Calculate unrealized P&L
  this.unrealizedPnL = newQuantity.times(tradePrice.minus(newAvgPrice)).toString();
  
  // Update total P&L
  this.totalPnL = new Decimal(this.realizedPnL).plus(this.unrealizedPnL).toString();
  
  // Update side
  if (newQuantity.gt(0)) {
    this.side = 'long';
  } else if (newQuantity.lt(0)) {
    this.side = 'short';
  } else {
    this.side = 'flat';
    this.isActive = false;
    this.closedAt = new Date();
  }
  
  this.updatedAt = new Date();
  
  return realizedPnL.toNumber();
};

positionSchema.methods.calculateRealizedPnLFIFO = function(closingQuantity, closingPrice) {
  let remainingToClose = new Decimal(closingQuantity);
  let totalRealizedPnL = new Decimal(0);
  
  // Process lots in FIFO order
  for (let i = 0; i < this.lots.length && remainingToClose.gt(0); i++) {
    const lot = this.lots[i];
    const lotQuantity = new Decimal(lot.quantity).abs();
    const lotPrice = new Decimal(lot.price);
    
    if (lotQuantity.lte(0)) continue;
    
    const quantityToClose = Decimal.min(lotQuantity, remainingToClose);
    const pnl = quantityToClose.times(new Decimal(closingPrice).minus(lotPrice));
    
    // Adjust for position side
    const positionSide = new Decimal(this.quantity).gt(0) ? 1 : -1;
    totalRealizedPnL = totalRealizedPnL.plus(pnl.times(positionSide));
    
    // Update lot
    lot.quantity = lotQuantity.minus(quantityToClose).toString();
    remainingToClose = remainingToClose.minus(quantityToClose);
  }
  
  // Remove empty lots
  this.lots = this.lots.filter(lot => new Decimal(lot.quantity).abs().gt(0));
  
  return totalRealizedPnL;
};

positionSchema.methods.close = function(closingPrice, reason = 'manual') {
  const quantity = new Decimal(this.quantity);
  
  if (quantity.eq(0)) {
    throw new Error('Position is already closed');
  }
  
  // Calculate final realized P&L
  const finalRealizedPnL = this.calculateRealizedPnLFIFO(quantity.abs(), new Decimal(closingPrice));
  
  // Update position
  this.quantity = '0';
  this.marketValue = '0';
  this.unrealizedPnL = '0';
  this.realizedPnL = new Decimal(this.realizedPnL).plus(finalRealizedPnL).toString();
  this.totalPnL = this.realizedPnL;
  this.isActive = false;
  this.closedAt = new Date();
  this.side = 'flat';
  this.lots = [];
  
  this.metadata.set('closingReason', reason);
  this.metadata.set('closingPrice', closingPrice.toString());
  
  this.updatedAt = new Date();
  
  return finalRealizedPnL.toNumber();
};

// Static methods
positionSchema.statics.findActivePositions = function(userId) {
  const query = { isActive: true };
  if (userId) query.userId = userId;
  
  return this.find(query).sort({ lastTradeAt: -1 });
};

positionSchema.statics.getPortfolioSummary = function(userId) {
  return this.aggregate([
    {
      $match: { userId, isActive: true }
    },
    {
      $group: {
        _id: null,
        totalPositions: { $sum: 1 },
        totalMarketValue: { $sum: { $toDouble: '$marketValue' } },
        totalUnrealizedPnL: { $sum: { $toDouble: '$unrealizedPnL' } },
        totalRealizedPnL: { $sum: { $toDouble: '$realizedPnL' } },
        totalFees: { $sum: { $toDouble: '$totalFees' } },
        longPositions: {
          $sum: {
            $cond: [{ $eq: ['$side', 'long'] }, 1, 0]
          }
        },
        shortPositions: {
          $sum: {
            $cond: [{ $eq: ['$side', 'short'] }, 1, 0]
          }
        }
      }
    }
  ]);
};

positionSchema.statics.getPerformanceMetrics = function(userId, startDate, endDate) {
  const matchQuery = { userId };
  
  if (startDate && endDate) {
    matchQuery.updatedAt = {
      $gte: startDate,
      $lte: endDate
    };
  }
  
  return this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalTrades: { $sum: 1 },
        winningTrades: {
          $sum: {
            $cond: [{ $gt: [{ $toDouble: '$totalPnL' }, 0] }, 1, 0]
          }
        },
        losingTrades: {
          $sum: {
            $cond: [{ $lt: [{ $toDouble: '$totalPnL' }, 0] }, 1, 0]
          }
        },
        totalPnL: { $sum: { $toDouble: '$totalPnL' } },
        avgPnL: { $avg: { $toDouble: '$totalPnL' } },
        maxPnL: { $max: { $toDouble: '$totalPnL' } },
        minPnL: { $min: { $toDouble: '$totalPnL' } },
        totalFees: { $sum: { $toDouble: '$totalFees' } }
      }
    },
    {
      $addFields: {
        winRate: {
          $cond: [
            { $gt: ['$totalTrades', 0] },
            { $divide: ['$winningTrades', '$totalTrades'] },
            0
          ]
        },
        profitFactor: {
          $cond: [
            { $and: [{ $gt: ['$winningTrades', 0] }, { $gt: ['$losingTrades', 0] }] },
            { $divide: ['$maxPnL', { $abs: '$minPnL' }] },
            null
          ]
        }
      }
    }
  ]);
};

// Pre-save middleware
positionSchema.pre('save', function(next) {
  // Update side based on quantity
  const quantity = new Decimal(this.quantity || '0');
  
  if (quantity.gt(0)) {
    this.side = 'long';
  } else if (quantity.lt(0)) {
    this.side = 'short';
  } else {
    this.side = 'flat';
  }
  
  // Update active status
  if (quantity.eq(0) && this.isActive) {
    this.isActive = false;
    this.closedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model('Position', positionSchema);