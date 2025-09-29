// src/models/Position.js
const mongoose = require('mongoose');

const positionSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  portfolioId: {
    type: String,
    required: true,
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
  instrumentType: {
    type: String,
    enum: ['stock', 'bond', 'etf', 'mutual_fund', 'option', 'future', 'crypto', 'forex'],
    required: true
  },
  
  // Position data
  quantity: {
    type: Number,
    required: true
  },
  avgPrice: {
    type: Number,
    required: true
  },
  currentPrice: {
    type: Number,
    default: 0
  },
  marketValue: {
    type: Number,
    default: 0
  },
  costBasis: {
    type: Number,
    required: true
  },
  
  // P&L tracking
  unrealizedPnL: {
    type: Number,
    default: 0
  },
  realizedPnL: {
    type: Number,
    default: 0
  },
  totalPnL: {
    type: Number,
    default: 0
  },
  dayPnL: {
    type: Number,
    default: 0
  },
  
  // Trade history summary
  totalTrades: {
    type: Number,
    default: 0
  },
  firstTradeDate: {
    type: Date,
    required: true
  },
  lastTradeDate: {
    type: Date,
    required: true
  },
  
  // Risk metrics
  beta: {
    type: Number,
    default: 1
  },
  volatility: {
    type: Number,
    default: 0
  },
  
  // Status
  status: {
    type: String,
    enum: ['open', 'closed'],
    default: 'open'
  },
  
  // Metadata
  sector: String,
  industry: String,
  country: String,
  currency: String,
  exchange: String,
  
  // Timestamps
  openDate: {
    type: Date,
    default: Date.now
  },
  closeDate: Date,
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
positionSchema.index({ portfolioId: 1, status: 1 });
positionSchema.index({ userId: 1, symbol: 1 });
positionSchema.index({ symbol: 1, status: 1 });

// Methods
positionSchema.methods.updatePnL = function(newPrice) {
  this.currentPrice = newPrice;
  this.marketValue = this.quantity * newPrice;
  this.unrealizedPnL = this.marketValue - this.costBasis;
  this.totalPnL = this.realizedPnL + this.unrealizedPnL;
  this.updatedAt = new Date();
};

positionSchema.methods.getPnLPercent = function() {
  if (this.costBasis === 0) return 0;
  return (this.totalPnL / Math.abs(this.costBasis)) * 100;
};

module.exports = mongoose.model('Position', positionSchema);