// src/models/RiskMetrics.js
const mongoose = require('mongoose');

const riskMetricsSchema = new mongoose.Schema({
  portfolioId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true
  },
  portfolioValue: {
    type: Number,
    required: true
  },
  var95: {
    type: Number,
    required: true
  },
  var99: {
    type: Number,
    required: true
  },
  expectedShortfall95: {
    type: Number,
    required: true
  },
  expectedShortfall99: {
    type: Number,
    required: true
  },
  leverage: {
    type: Number,
    required: true
  },
  concentration: {
    type: Number,
    required: true
  },
  liquidityScore: {
    type: Number,
    required: true
  },
  componentVaRs: [{
    symbol: String,
    componentVaR: Number,
    contribution: Number,
    weight: Number
  }],
  alerts: [{
    type: String,
    severity: String,
    message: String,
    timestamp: Date
  }],
  stressTestResults: {
    marketCrash: {
      impact: Number,
      impactPercent: Number
    },
    interestRateShock: {
      impact: Number,
      impactPercent: Number
    },
    liquidityCrisis: {
      impact: Number,
      impactPercent: Number
    }
  },
  riskFactors: {
    equityRisk: Number,
    creditRisk: Number,
    interestRateRisk: Number,
    fxRisk: Number,
    commodityRisk: Number,
    cryptoRisk: Number
  },
  diversificationMetrics: {
    herfindahlIndex: Number,
    effectivePositions: Number,
    diversificationRatio: Number
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
riskMetricsSchema.index({ portfolioId: 1, timestamp: -1 });
riskMetricsSchema.index({ timestamp: -1 });

module.exports = mongoose.model('RiskMetrics', riskMetricsSchema);