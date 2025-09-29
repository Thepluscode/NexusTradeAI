// src/models/Portfolio.js
const mongoose = require('mongoose');

const portfolioSchema = new mongoose.Schema({
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
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['individual', 'joint', 'corporate', 'trust', 'retirement'],
    default: 'individual'
  },
  currency: {
    type: String,
    required: true,
    default: 'USD'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'closed', 'deleted'],
    default: 'active'
  },
  riskProfile: {
    type: String,
    enum: ['conservative', 'moderate', 'aggressive', 'speculative'],
    default: 'moderate'
  },
  benchmarkIndex: {
    type: String,
    default: 'SPY'
  },
  
  // Financial data
  totalValue: {
    type: Number,
    default: 0
  },
  totalCost: {
    type: Number,
    default: 0
  },
  cashBalance: {
    type: Number,
    default: 0
  },
  marginBalance: {
    type: Number,
    default: 0
  },
  totalUnrealizedPnL: {
    type: Number,
    default: 0
  },
  totalRealizedPnL: {
    type: Number,
    default: 0
  },
  
  // Performance metrics
  performance: {
    totalReturn: { type: Number, default: 0 },
    totalReturnPercent: { type: Number, default: 0 },
    dayReturn: { type: Number, default: 0 },
    dayReturnPercent: { type: Number, default: 0 },
    weekReturn: { type: Number, default: 0 },
    weekReturnPercent: { type: Number, default: 0 },
    monthReturn: { type: Number, default: 0 },
    monthReturnPercent: { type: Number, default: 0 },
    yearReturn: { type: Number, default: 0 },
    yearReturnPercent: { type: Number, default: 0 },
    annualizedReturn: { type: Number, default: 0 },
    sharpeRatio: { type: Number, default: 0 },
    maxDrawdown: { type: Number, default: 0 },
    volatility: { type: Number, default: 0 },
    beta: { type: Number, default: 1 },
    alpha: { type: Number, default: 0 }
  },
  
  // Risk metrics
  riskMetrics: {
    var95: { type: Number, default: 0 },
    var99: { type: Number, default: 0 },
    expectedShortfall: { type: Number, default: 0 },
    leverage: { type: Number, default: 0 },
    concentration: { type: Number, default: 0 },
    diversificationRatio: { type: Number, default: 1 }
  },
  
  // Position summary
  positionSummary: {
    totalPositions: { type: Number, default: 0 },
    longPositions: { type: Number, default: 0 },
    shortPositions: { type: Number, default: 0 },
    sectors: [{ 
      name: String, 
      allocation: Number,
      value: Number
    }],
    assetClasses: [{
      name: String,
      allocation: Number,
      value: Number
    }]
  },
  
  // Settings
  settings: {
    autoRebalance: { type: Boolean, default: false },
    rebalanceThreshold: { type: Number, default: 0.05 },
    dividendReinvestment: { type: Boolean, default: true },
    taxLossHarvesting: { type: Boolean, default: false },
    notifications: {
      priceAlerts: { type: Boolean, default: true },
      performanceUpdates: { type: Boolean, default: true },
      riskAlerts: { type: Boolean, default: true }
    }
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastValuationAt: {
    type: Date,
    default: Date.now
  },
  lastTradeAt: Date,
  
  // Metadata
  metadata: {
    tags: [String],
    notes: String,
    createdBy: String,
    lastModifiedBy: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
portfolioSchema.index({ userId: 1, status: 1 });
portfolioSchema.index({ createdAt: -1 });
portfolioSchema.index({ totalValue: -1 });
portfolioSchema.index({ 'performance.totalReturnPercent': -1 });

// Virtual for positions
portfolioSchema.virtual('positions', {
  ref: 'Position',
  localField: 'id',
  foreignField: 'portfolioId'
});

// Methods
portfolioSchema.methods.calculateAllocation = function(symbol) {
  const position = this.positions.find(p => p.symbol === symbol);
  if (!position || this.totalValue === 0) return 0;
  
  const positionValue = position.quantity * (position.currentPrice || position.avgPrice);
  return positionValue / this.totalValue;
};

portfolioSchema.methods.getDiversificationMetrics = function() {
  if (!this.positions || this.positions.length === 0) {
    return { concentration: 0, diversificationRatio: 1 };
  }
  
  // Calculate Herfindahl index
  let herfindahlIndex = 0;
  this.positions.forEach(position => {
    const allocation = this.calculateAllocation(position.symbol);
    herfindahlIndex += allocation * allocation;
  });
  
  return {
    concentration: Math.max(...this.positions.map(p => this.calculateAllocation(p.symbol))),
    diversificationRatio: this.positions.length > 0 ? 1 / Math.sqrt(herfindahlIndex) : 1,
    herfindahlIndex
  };
};

module.exports = mongoose.model('Portfolio', portfolioSchema);