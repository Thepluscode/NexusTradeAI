// src/models/RiskAlert.js
const mongoose = require('mongoose');

const riskAlertSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  type: {
    type: String,
    required: true,
    enum: ['var_breach', 'stress_test_failure', 'liquidity_warning', 'concentration_risk', 'counterparty_risk']
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical']
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
  message: {
    type: String,
    required: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed
  },
  status: {
    type: String,
    default: 'active',
    enum: ['active', 'acknowledged', 'resolved']
  },
  deliveryResults: [{
    channel: String,
    success: Boolean,
    timestamp: Date,
    error: String
  }],
  acknowledgedAt: Date,
  resolvedAt: Date
}, {
  timestamps: true
});

// Indexes
riskAlertSchema.index({ portfolioId: 1, timestamp: -1 });
riskAlertSchema.index({ userId: 1, timestamp: -1 });
riskAlertSchema.index({ severity: 1, status: 1 });

module.exports = mongoose.model('RiskAlert', riskAlertSchema);