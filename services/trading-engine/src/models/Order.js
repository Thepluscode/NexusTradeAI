const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const orderSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
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
  side: {
    type: String,
    enum: ['buy', 'sell'],
    required: true
  },
  type: {
    type: String,
    enum: ['market', 'limit', 'stop', 'stop_limit', 'iceberg', 'twap', 'vwap'],
    required: true
  },
  quantity: {
    type: String, // Using String to preserve decimal precision
    required: true,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  originalQuantity: {
    type: String,
    required: true,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  price: {
    type: String,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  stopPrice: {
    type: String,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  timeInForce: {
    type: String,
    enum: ['GTC', 'IOC', 'FOK', 'DAY'],
    default: 'GTC'
  },
  status: {
    type: String,
    enum: ['pending', 'partial', 'filled', 'cancelled', 'rejected', 'expired'],
    default: 'pending',
    index: true
  },
  filledQuantity: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  remainingQuantity: {
    type: String,
    get: v => v ? new Decimal(v) : v,
    set: v => v ? new Decimal(v).toString() : v
  },
  averageFillPrice: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  fees: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    index: true
  },
  executionStartTime: Date,
  executionEndTime: Date,
  
  // Additional fields
  clientOrderId: {
    type: String,
    index: true
  },
  source: {
    type: String,
    enum: ['api', 'web', 'mobile', 'algorithm', 'liquidation'],
    default: 'api'
  },
  algorithm: {
    type: String,
    enum: ['twap', 'vwap', 'implementation_shortfall', 'market_making']
  },
  parentOrderId: {
    type: String,
    index: true
  },
  
  // Risk and compliance
  riskChecked: {
    type: Boolean,
    default: false
  },
  complianceChecked: {
    type: Boolean,
    default: false
  },
  riskScore: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Execution details
  venue: {
    type: String,
    default: 'internal'
  },
  externalOrderId: String,
  routingStrategy: String,
  slippageOptimization: {
    enabled: {
      type: Boolean,
      default: false
    },
    type: String,
    expectedSlippage: Number,
    actualSlippage: Number
  },
  
  // Fills array
  fills: [{
    id: String,
    quantity: {
      type: String,
      get: v => v ? new Decimal(v) : v,
      set: v => v ? new Decimal(v).toString() : v
    },
    price: {
      type: String,
      get: v => v ? new Decimal(v) : v,
      set: v => v ? new Decimal(v).toString() : v
    },
    fee: {
      type: String,
      default: '0',
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    venue: {
      type: String,
      default: 'internal'
    },
    tradeId: String,
    liquidity: {
      type: String,
      enum: ['maker', 'taker']
    }
  }],
  
  // Rejection/cancellation details
  rejectionReason: String,
  cancellationReason: String,
  
  // Metadata
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Audit trail
  auditTrail: [{
    action: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: String,
    details: mongoose.Schema.Types.Mixed
  }]
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Convert Decimal strings to numbers for JSON output
      const decimalFields = ['quantity', 'originalQuantity', 'price', 'stopPrice', 
                            'filledQuantity', 'remainingQuantity', 'averageFillPrice', 'fees'];
      
      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'string') {
          ret[field] = parseFloat(ret[field]);
        }
      });
      
      // Convert fills
      if (ret.fills) {
        ret.fills = ret.fills.map(fill => ({
          ...fill,
          quantity: parseFloat(fill.quantity || 0),
          price: parseFloat(fill.price || 0),
          fee: parseFloat(fill.fee || 0)
        }));
      }
      
      return ret;
    }
  }
});

// Indexes
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ symbol: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ venue: 1, status: 1 });
orderSchema.index({ expiresAt: 1 }, { sparse: true });

// Virtual for fill percentage
orderSchema.virtual('fillPercentage').get(function() {
  if (!this.originalQuantity || this.originalQuantity === '0') return 0;
  const original = new Decimal(this.originalQuantity);
  const filled = new Decimal(this.filledQuantity || '0');
  return filled.dividedBy(original).times(100).toNumber();
});

// Virtual for order value
orderSchema.virtual('orderValue').get(function() {
  if (!this.quantity || !this.price) return 0;
  const quantity = new Decimal(this.quantity);
  const price = new Decimal(this.price);
  return quantity.times(price).toNumber();
});

// Virtual for remaining value
orderSchema.virtual('remainingValue').get(function() {
  if (!this.remainingQuantity || !this.price) return 0;
  const remaining = new Decimal(this.remainingQuantity);
  const price = new Decimal(this.price);
  return remaining.times(price).toNumber();
});

// Methods
orderSchema.methods.addFill = function(fillData) {
  const fill = {
    id: fillData.id,
    quantity: fillData.quantity,
    price: fillData.price,
    fee: fillData.fee || '0',
    timestamp: fillData.timestamp || new Date(),
    venue: fillData.venue || 'internal',
    tradeId: fillData.tradeId,
    liquidity: fillData.liquidity
  };
  
  this.fills.push(fill);
  
  // Update aggregated values
  const fillQuantity = new Decimal(fillData.quantity);
  const fillPrice = new Decimal(fillData.price);
  const fillFee = new Decimal(fillData.fee || '0');
  
  const currentFilled = new Decimal(this.filledQuantity || '0');
  const currentFees = new Decimal(this.fees || '0');
  const currentAvgPrice = new Decimal(this.averageFillPrice || '0');
  
  // Update filled quantity
  const newFilledQuantity = currentFilled.plus(fillQuantity);
  this.filledQuantity = newFilledQuantity.toString();
  
  // Update remaining quantity
  const original = new Decimal(this.originalQuantity);
  this.remainingQuantity = original.minus(newFilledQuantity).toString();
  
  // Update average fill price
  if (currentFilled.eq(0)) {
    this.averageFillPrice = fillPrice.toString();
  } else {
    const totalValue = currentFilled.times(currentAvgPrice).plus(fillQuantity.times(fillPrice));
    this.averageFillPrice = totalValue.dividedBy(newFilledQuantity).toString();
  }
  
  // Update fees
  this.fees = currentFees.plus(fillFee).toString();
  
  // Update status
  if (this.remainingQuantity === '0' || new Decimal(this.remainingQuantity).lte(0)) {
    this.status = 'filled';
    this.executionEndTime = new Date();
  } else if (currentFilled.eq(0)) {
    this.status = 'partial';
  }
  
  this.updatedAt = new Date();
};

orderSchema.methods.cancel = function(reason) {
  if (!['pending', 'partial'].includes(this.status)) {
    throw new Error('Order cannot be cancelled in current status');
  }
  
  this.status = 'cancelled';
  this.cancellationReason = reason;
  this.executionEndTime = new Date();
  this.updatedAt = new Date();
  
  this.auditTrail.push({
    action: 'cancelled',
    details: { reason }
  });
};

orderSchema.methods.reject = function(reason) {
  this.status = 'rejected';
  this.rejectionReason = reason;
  this.executionEndTime = new Date();
  this.updatedAt = new Date();
  
  this.auditTrail.push({
    action: 'rejected',
    details: { reason }
  });
};

orderSchema.methods.expire = function() {
  this.status = 'expired';
  this.executionEndTime = new Date();
  this.updatedAt = new Date();
  
  this.auditTrail.push({
    action: 'expired',
    details: { expiredAt: new Date() }
  });
};

// Static methods
orderSchema.statics.findActiveOrders = function(userId, symbol) {
  const query = {
    status: { $in: ['pending', 'partial'] }
  };
  
  if (userId) query.userId = userId;
  if (symbol) query.symbol = symbol;
  
  return this.find(query).sort({ createdAt: -1 });
};

orderSchema.statics.findOrdersByDateRange = function(userId, startDate, endDate) {
  return this.find({
    userId,
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ createdAt: -1 });
};

orderSchema.statics.getOrderStats = function(userId, timeframe = '24h') {
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
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }
  
  return this.aggregate([
    {
      $match: {
        userId,
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalQuantity: { 
          $sum: { $toDouble: '$originalQuantity' }
        },
        totalValue: {
          $sum: {
            $multiply: [
              { $toDouble: '$originalQuantity' },
              { $ifNull: [{ $toDouble: '$price' }, 0] }
            ]
          }
        }
      }
    }
  ]);
};

// Pre-save middleware
orderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Validate quantity relationships
  const original = new Decimal(this.originalQuantity);
  const filled = new Decimal(this.filledQuantity || '0');
  const remaining = new Decimal(this.remainingQuantity || this.originalQuantity);
  
  if (filled.plus(remaining).gt(original.times(1.001))) { // Allow small rounding errors
    return next(new Error('Filled + Remaining quantity cannot exceed original quantity'));
  }
  
  next();
});

// Post-save middleware for audit logging
orderSchema.post('save', function(doc) {
  // This could trigger external audit logging
  console.log(`Order ${doc.id} saved with status: ${doc.status}`);
});

module.exports = mongoose.model('Order', orderSchema);