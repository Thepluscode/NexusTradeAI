// src/models/Portfolio.js
const mongoose = require('mongoose');
const Decimal = require('decimal.js');

const portfolioSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Portfolio identification
  portfolioName: {
    type: String,
    default: 'Main Portfolio'
  },
  portfolioType: {
    type: String,
    enum: ['individual', 'corporate', 'fund', 'institutional'],
    default: 'individual'
  },
  baseCurrency: {
    type: String,
    default: 'USD'
  },
  
  // Portfolio values
  totalValue: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  cashBalance: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  positionsValue: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  marginUsed: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  marginAvailable: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  
  // P&L tracking
  dayPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  weekPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  monthPnL: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  yearPnL: {
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
  
  // Risk metrics
  leverage: {
    type: Number,
    default: 1.0
  },
  var95: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  var99: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  maxDrawdown: {
    type: String,
    default: '0',
    get: v => v ? new Decimal(v) : new Decimal(0),
    set: v => v ? new Decimal(v).toString() : '0'
  },
  sharpeRatio: {
    type: Number,
    default: 0
  },
  
  // Portfolio composition
  positions: [{
    symbol: String,
    quantity: {
      type: String,
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    },
    marketValue: {
      type: String,
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    },
    weight: Number, // Percentage of portfolio
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Asset allocation
  assetAllocation: {
    equity: {
      type: Number,
      default: 0
    },
    fixedIncome: {
      type: Number,
      default: 0
    },
    commodities: {
      type: Number,
      default: 0
    },
    cryptocurrency: {
      type: Number,
      default: 0
    },
    cash: {
      type: Number,
      default: 0
    },
    other: {
      type: Number,
      default: 0
    }
  },
  
  // Geographic allocation
  geographicAllocation: {
    domestic: {
      type: Number,
      default: 0
    },
    international: {
      type: Number,
      default: 0
    },
    emerging: {
      type: Number,
      default: 0
    }
  },
  
  // Portfolio settings
  settings: {
    riskTolerance: {
      type: String,
      enum: ['conservative', 'moderate', 'aggressive'],
      default: 'moderate'
    },
    autoRebalance: {
      type: Boolean,
      default: false
    },
    rebalanceThreshold: {
      type: Number,
      default: 0.05 // 5%
    },
    maxPositionSize: {
      type: Number,
      default: 0.1 // 10%
    },
    allowMargin: {
      type: Boolean,
      default: false
    },
    maxLeverage: {
      type: Number,
      default: 1.0
    }
  },
  
  // Performance benchmarks
  benchmarks: [{
    name: String,
    symbol: String,
    weight: Number
  }],
  
  // Historical performance
  performanceHistory: [{
    date: {
      type: Date,
      default: Date.now
    },
    totalValue: String,
    dayReturn: String,
    cumulativeReturn: String,
    benchmark: String
  }],
  
  // Fees and costs
  fees: {
    totalFees: {
      type: String,
      default: '0',
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    },
    managementFees: {
      type: String,
      default: '0',
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    },
    transactionFees: {
      type: String,
      default: '0',
      get: v => v ? new Decimal(v) : new Decimal(0),
      set: v => v ? new Decimal(v).toString() : '0'
    }
  },
  
  // Risk limits
  riskLimits: {
    maxDailyLoss: {
      type: String,
      default: '10000'
    },
    maxPositionValue: {
      type: String,
      default: '100000'
    },
    maxVaR: {
      type: String,
      default: '5000'
    }
  },
  
  // Last update timestamps
  lastPositionUpdate: {
    type: Date,
    default: Date.now
  },
  lastPnLCalculation: {
    type: Date,
    default: Date.now
  },
  lastRiskUpdate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Convert Decimal strings to numbers for JSON output
      const decimalFields = [
        'totalValue', 'cashBalance', 'positionsValue', 'marginUsed', 'marginAvailable',
        'dayPnL', 'weekPnL', 'monthPnL', 'yearPnL', 'totalPnL',
        'var95', 'var99', 'maxDrawdown'
      ];
      
      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'string') {
          ret[field] = parseFloat(ret[field]);
        }
      });
      
      // Convert positions
      if (ret.positions) {
        ret.positions = ret.positions.map(pos => ({
          ...pos,
          quantity: parseFloat(pos.quantity || 0),
          marketValue: parseFloat(pos.marketValue || 0)
        }));
      }
      
      // Convert fees
      if (ret.fees) {
        Object.keys(ret.fees).forEach(key => {
          if (typeof ret.fees[key] === 'string') {
            ret.fees[key] = parseFloat(ret.fees[key]);
          }
        });
      }
      
      return ret;
    }
  }
});

// Indexes
portfolioSchema.index({ userId: 1 });
portfolioSchema.index({ portfolioType: 1 });
portfolioSchema.index({ 'positions.symbol': 1 });

// Virtual for total return percentage
portfolioSchema.virtual('totalReturnPercent').get(function() {
  const totalValue = new Decimal(this.totalValue);
  const totalPnL = new Decimal(this.totalPnL);
  const initialValue = totalValue.minus(totalPnL);
  
  if (initialValue.lte(0)) return 0;
  return totalPnL.dividedBy(initialValue).times(100).toNumber();
});

// Virtual for current leverage
portfolioSchema.virtual('currentLeverage').get(function() {
  const totalValue = new Decimal(this.totalValue);
  const positionsValue = new Decimal(this.positionsValue);
  
  if (totalValue.lte(0)) return 1;
  return positionsValue.dividedBy(totalValue).toNumber();
});

// Methods
portfolioSchema.methods.updatePositions = async function(positions) {
  try {
    this.positions = positions.map(pos => ({
      symbol: pos.symbol,
      quantity: pos.quantity,
      marketValue: pos.marketValue,
      weight: 0, // Will calculate after
      lastUpdated: new Date()
    }));
    
    // Calculate total positions value
    this.positionsValue = positions.reduce((total, pos) => {
      return total.plus(Math.abs(parseFloat(pos.marketValue || 0)));
    }, new Decimal(0)).toString();
    
    // Calculate weights
    const totalPosValue = new Decimal(this.positionsValue);
    if (totalPosValue.gt(0)) {
      this.positions.forEach(pos => {
        const posValue = new Decimal(pos.marketValue).abs();
        pos.weight = posValue.dividedBy(totalPosValue).times(100).toNumber();
      });
    }
    
    // Update total value
    this.totalValue = new Decimal(this.cashBalance).plus(this.positionsValue).toString();
    
    // Update asset allocation
    this.updateAssetAllocation();
    
    this.lastPositionUpdate = new Date();
    
  } catch (error) {
    throw new Error(`Error updating positions: ${error.message}`);
  }
};

portfolioSchema.methods.updateAssetAllocation = function() {
  const totalValue = new Decimal(this.totalValue);
  if (totalValue.lte(0)) return;
  
  const allocation = {
    equity: 0,
    fixedIncome: 0,
    commodities: 0,
    cryptocurrency: 0,
    cash: new Decimal(this.cashBalance).dividedBy(totalValue).times(100).toNumber(),
    other: 0
  };
  
  this.positions.forEach(pos => {
    const assetClass = this.getAssetClass(pos.symbol);
    const weight = parseFloat(pos.weight || 0);
    allocation[assetClass] += weight;
  });
  
  this.assetAllocation = allocation;
};

portfolioSchema.methods.getAssetClass = function(symbol) {
  // Simplified asset class mapping
  const assetClassMap = {
    'BTC': 'cryptocurrency',
    'ETH': 'cryptocurrency',
    'AAPL': 'equity',
    'GOOGL': 'equity',
    'MSFT': 'equity',
    'TSLA': 'equity',
    'GLD': 'commodities',
    'USO': 'commodities',
    'TLT': 'fixedIncome',
    'IEF': 'fixedIncome'
  };
  
  const baseSymbol = symbol.replace(/USDT?$/, '').replace(/USD$/, '');
  return assetClassMap[baseSymbol] || 'other';
};

portfolioSchema.methods.calculateDayPnL = function() {
  // This would calculate day P&L based on position changes and price movements
  // Simplified calculation for demo
  const positions = this.positions || [];
  let dayPnL = new Decimal(0);
  
  // In production, would compare current value to start-of-day value
  positions.forEach(pos => {
    // Assume 1% random daily movement for demo
    const dayChange = (Math.random() - 0.5) * 0.02; // ±1%
    const posValue = new Decimal(pos.marketValue || 0);
    dayPnL = dayPnL.plus(posValue.times(dayChange));
  });
  
  this.dayPnL = dayPnL.toString();
  return dayPnL.toNumber();
};

portfolioSchema.methods.calculateRiskMetrics = async function() {
  try {
    const positions = this.positions || [];
    const totalValue = new Decimal(this.totalValue);
    
    if (positions.length === 0 || totalValue.lte(0)) {
      this.var95 = '0';
      this.var99 = '0';
      this.leverage = 1.0;
      return;
    }
    
    // Calculate portfolio volatility (simplified)
    const portfolioVolatility = this.calculatePortfolioVolatility(positions);
    
    // Calculate VaR (parametric method)
    const var95 = totalValue.times(portfolioVolatility).times(1.645); // 95% confidence
    const var99 = totalValue.times(portfolioVolatility).times(2.326); // 99% confidence
    
    this.var95 = var95.toString();
    this.var99 = var99.toString();
    
    // Calculate leverage
    const positionsValue = new Decimal(this.positionsValue);
    this.leverage = totalValue.gt(0) ? positionsValue.dividedBy(totalValue).toNumber() : 1.0;
    
    this.lastRiskUpdate = new Date();
    
  } catch (error) {
    throw new Error(`Error calculating risk metrics: ${error.message}`);
  }
};

portfolioSchema.methods.calculatePortfolioVolatility = function(positions) {
  // Simplified portfolio volatility calculation
  // In production, would use proper covariance matrix
  
  let weightedVolatility = 0;
  const totalWeight = positions.reduce((sum, pos) => sum + (pos.weight || 0), 0);
  
  positions.forEach(pos => {
    const weight = (pos.weight || 0) / 100; // Convert percentage to decimal
    const assetVol = this.getAssetVolatility(pos.symbol);
    weightedVolatility += weight * assetVol;
  });
  
  // Add correlation effects (simplified)
  const correlationAdjustment = 0.8; // Assume 80% correlation
  return weightedVolatility * Math.sqrt(correlationAdjustment);
};

portfolioSchema.methods.getAssetVolatility = function(symbol) {
  // Simplified volatility mapping
  const volatilityMap = {
    'BTCUSDT': 0.04, // 4% daily vol
    'ETHUSDT': 0.045,
    'AAPL': 0.02,
    'GOOGL': 0.025,
    'MSFT': 0.02,
    'TSLA': 0.035,
    'GLD': 0.015,
    'TLT': 0.01
  };
  
  return volatilityMap[symbol] || 0.025; // Default 2.5%
};

portfolioSchema.methods.addPerformanceSnapshot = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Check if we already have today's snapshot
  const existingSnapshot = this.performanceHistory.find(p => 
    p.date.getTime() === today.getTime()
  );
  
  if (!existingSnapshot) {
    const dayReturn = this.calculateDayReturn();
    const cumulativeReturn = this.calculateCumulativeReturn();
    
    this.performanceHistory.push({
      date: today,
      totalValue: this.totalValue,
      dayReturn: dayReturn.toString(),
      cumulativeReturn: cumulativeReturn.toString(),
      benchmark: '0' // Would compare to benchmark
    });
    
    // Keep only last 365 days
    if (this.performanceHistory.length > 365) {
      this.performanceHistory = this.performanceHistory.slice(-365);
    }
  }
};

portfolioSchema.methods.calculateDayReturn = function() {
  const currentValue = new Decimal(this.totalValue);
  
  // Get yesterday's value from performance history
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const yesterdaySnapshot = this.performanceHistory.find(p => 
    p.date.getTime() === yesterday.getTime()
  );
  
  if (yesterdaySnapshot) {
    const yesterdayValue = new Decimal(yesterdaySnapshot.totalValue);
    if (yesterdayValue.gt(0)) {
      return currentValue.minus(yesterdayValue).dividedBy(yesterdayValue);
    }
  }
  
  return new Decimal(0);
};

portfolioSchema.methods.calculateCumulativeReturn = function() {
  if (this.performanceHistory.length === 0) {
    return new Decimal(0);
  }
  
  const firstSnapshot = this.performanceHistory[0];
  const initialValue = new Decimal(firstSnapshot.totalValue);
  const currentValue = new Decimal(this.totalValue);
  
  if (initialValue.gt(0)) {
    return currentValue.minus(initialValue).dividedBy(initialValue);
  }
  
  return new Decimal(0);
};

portfolioSchema.methods.rebalance = async function(targetAllocation) {
  try {
    const totalValue = new Decimal(this.totalValue);
    const rebalanceOrders = [];
    
    // Calculate target values for each asset class
    Object.keys(targetAllocation).forEach(assetClass => {
      const targetPercent = targetAllocation[assetClass] / 100;
      const targetValue = totalValue.times(targetPercent);
      const currentValue = this.getCurrentAllocationValue(assetClass);
      const difference = targetValue.minus(currentValue);
      
      if (difference.abs().gt(totalValue.times(this.settings.rebalanceThreshold))) {
        rebalanceOrders.push({
          assetClass,
          currentValue: currentValue.toNumber(),
          targetValue: targetValue.toNumber(),
          difference: difference.toNumber(),
          action: difference.gt(0) ? 'buy' : 'sell'
        });
      }
    });
    
    return rebalanceOrders;
    
  } catch (error) {
    throw new Error(`Error calculating rebalance: ${error.message}`);
  }
};

portfolioSchema.methods.getCurrentAllocationValue = function(assetClass) {
  const positions = this.positions || [];
  let value = new Decimal(0);
  
  if (assetClass === 'cash') {
    return new Decimal(this.cashBalance);
  }
  
  positions.forEach(pos => {
    if (this.getAssetClass(pos.symbol) === assetClass) {
      value = value.plus(Math.abs(parseFloat(pos.marketValue || 0)));
    }
  });
  
  return value;
};

// Static methods
portfolioSchema.statics.createPortfolio = function(userId, initialCash = 100000) {
  return new this({
    userId,
    cashBalance: initialCash.toString(),
    totalValue: initialCash.toString()
  });
};

portfolioSchema.statics.getPortfolioSummary = function(userId) {
  return this.findOne({ userId }).lean();
};

// Pre-save middleware
portfolioSchema.pre('save', function(next) {
  // Ensure total value is sum of cash and positions
  const cash = new Decimal(this.cashBalance || '0');
  const positions = new Decimal(this.positionsValue || '0');
  this.totalValue = cash.plus(positions).toString();
  
  // Update asset allocation if positions changed
  if (this.isModified('positions')) {
    this.updateAssetAllocation();
  }
  
  next();
});

module.exports = mongoose.model('Portfolio', portfolioSchema);