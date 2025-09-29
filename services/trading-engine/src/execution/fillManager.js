// src/execution/fillManager.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');

class FillManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Fill tracking
    this.fills = new Map(); // fillId -> fill
    this.fillsByOrder = new Map(); // orderId -> fill[]
    this.fillsByTrade = new Map(); // tradeId -> fill[]
    
    // Fill validation rules
    this.validationRules = {
      maxFillSize: 1000000, // Max fill size
      priceDeviationThreshold: 0.05, // 5% price deviation
      timeThreshold: 60000, // 1 minute max age for fills
      duplicateCheckWindow: 5000 // 5 seconds for duplicate detection
    };
    
    // Performance tracking
    this.fillStats = {
      totalFills: 0,
      totalVolume: 0,
      avgFillSize: 0,
      fillsPerSecond: 0,
      rejectedFills: 0
    };
  }

  async processFill(fillData) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Validate fill data
      await this.validateFill(fillData);
      
      // Check for duplicates
      if (await this.isDuplicateFill(fillData)) {
        this.logger?.warn('Duplicate fill detected:', fillData);
        return { status: 'duplicate', fillId: fillData.id };
      }
      
      // Create fill record
      const fill = this.createFillRecord(fillData);
      
      // Store fill
      this.storeFill(fill);
      
      // Update order state
      await this.updateOrderWithFill(fill);
      
      // Calculate settlement
      const settlement = await this.calculateSettlement(fill);
      
      // Update metrics
      this.updateFillMetrics(fill);
      
      // Emit events
      this.emit('fill_processed', { fill, settlement });
      
      const processingTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      
      this.logger?.info(`Fill processed: ${fill.id}`, {
        orderId: fill.orderId,
        quantity: fill.quantity,
        price: fill.price,
        processingTime: `${processingTime.toFixed(3)}ms`
      });
      
      return {
        status: 'processed',
        fillId: fill.id,
        settlement,
        processingTime
      };
      
    } catch (error) {
      this.fillStats.rejectedFills++;
      this.logger?.error('Error processing fill:', error);
      throw error;
    }
  }

  async validateFill(fillData) {
    // Required fields
    const requiredFields = ['id', 'orderId', 'quantity', 'price', 'timestamp'];
    for (const field of requiredFields) {
      if (!fillData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Quantity validation
    const quantity = new Decimal(fillData.quantity);
    if (quantity.lte(0)) {
      throw new Error('Fill quantity must be positive');
    }
    
    if (quantity.gt(this.validationRules.maxFillSize)) {
      throw new Error('Fill quantity exceeds maximum allowed');
    }
    
    // Price validation
    const price = new Decimal(fillData.price);
    if (price.lte(0)) {
      throw new Error('Fill price must be positive');
    }
    
    // Time validation
    const fillTime = new Date(fillData.timestamp);
    const ageMs = Date.now() - fillTime.getTime();
    if (ageMs > this.validationRules.timeThreshold) {
      throw new Error('Fill is too old');
    }
    
    // Price deviation check
    if (fillData.marketPrice) {
      const marketPrice = new Decimal(fillData.marketPrice);
      const deviation = price.minus(marketPrice).abs().dividedBy(marketPrice);
      
      if (deviation.gt(this.validationRules.priceDeviationThreshold)) {
        throw new Error(`Fill price deviates too much from market price: ${deviation.times(100).toFixed(2)}%`);
      }
    }
    
    return true;
  }

  async isDuplicateFill(fillData) {
    const existingFill = this.fills.get(fillData.id);
    if (existingFill) {
      return true;
    }
    
    // Check for similar fills within time window
    const recentFills = Array.from(this.fills.values()).filter(fill => {
      const timeDiff = Math.abs(new Date(fillData.timestamp) - fill.timestamp);
      return timeDiff < this.validationRules.duplicateCheckWindow &&
             fill.orderId === fillData.orderId &&
             Math.abs(fill.quantity - fillData.quantity) < 0.000001 &&
             Math.abs(fill.price - fillData.price) < 0.000001;
    });
    
    return recentFills.length > 0;
  }

  createFillRecord(fillData) {
    return {
      id: fillData.id,
      orderId: fillData.orderId,
      tradeId: fillData.tradeId,
      symbol: fillData.symbol,
      side: fillData.side,
      quantity: parseFloat(fillData.quantity),
      price: parseFloat(fillData.price),
      timestamp: new Date(fillData.timestamp),
      exchange: fillData.exchange,
      feeAmount: parseFloat(fillData.feeAmount || 0),
      feeCurrency: fillData.feeCurrency || 'USD',
      settlementDate: fillData.settlementDate ? new Date(fillData.settlementDate) : this.calculateSettlementDate(),
      status: 'pending_settlement',
      metadata: fillData.metadata || {}
    };
  }

  storeFill(fill) {
    // Store by fill ID
    this.fills.set(fill.id, fill);
    
    // Index by order ID
    if (!this.fillsByOrder.has(fill.orderId)) {
      this.fillsByOrder.set(fill.orderId, []);
    }
    this.fillsByOrder.get(fill.orderId).push(fill);
    
    // Index by trade ID
    if (fill.tradeId) {
      if (!this.fillsByTrade.has(fill.tradeId)) {
        this.fillsByTrade.set(fill.tradeId, []);
      }
      this.fillsByTrade.get(fill.tradeId).push(fill);
    }
  }

  async updateOrderWithFill(fill) {
    // This would integrate with OrderManager to update order state
    this.emit('order_fill_update', {
      orderId: fill.orderId,
      fill: {
        id: fill.id,
        quantity: fill.quantity,
        price: fill.price,
        timestamp: fill.timestamp
      }
    });
  }

  async calculateSettlement(fill) {
    const grossAmount = new Decimal(fill.quantity).times(fill.price);
    const feeAmount = new Decimal(fill.feeAmount);
    const netAmount = grossAmount.minus(feeAmount);
    
    return {
      fillId: fill.id,
      grossAmount: grossAmount.toNumber(),
      feeAmount: feeAmount.toNumber(),
      netAmount: netAmount.toNumber(),
      currency: fill.feeCurrency,
      settlementDate: fill.settlementDate,
      status: 'pending'
    };
  }

  calculateSettlementDate() {
    // T+2 settlement for most instruments
    const settlementDate = new Date();
    settlementDate.setDate(settlementDate.getDate() + 2);
    
    // Skip weekends
    if (settlementDate.getDay() === 6) { // Saturday
      settlementDate.setDate(settlementDate.getDate() + 2);
    } else if (settlementDate.getDay() === 0) { // Sunday
      settlementDate.setDate(settlementDate.getDate() + 1);
    }
    
    return settlementDate;
  }

  updateFillMetrics(fill) {
    this.fillStats.totalFills++;
    this.fillStats.totalVolume += fill.quantity;
    this.fillStats.avgFillSize = this.fillStats.totalVolume / this.fillStats.totalFills;
    
    // Update fills per second (simple moving average)
    const now = Date.now();
    if (!this.lastFillTime) {
      this.lastFillTime = now;
      this.fillStats.fillsPerSecond = 1;
    } else {
      const timeDiff = (now - this.lastFillTime) / 1000;
      this.fillStats.fillsPerSecond = 1 / timeDiff;
      this.lastFillTime = now;
    }
  }

  getFill(fillId) {
    return this.fills.get(fillId);
  }

  getFillsByOrder(orderId) {
    return this.fillsByOrder.get(orderId) || [];
  }

  getFillsByTrade(tradeId) {
    return this.fillsByTrade.get(tradeId) || [];
  }

  getRecentFills(limit = 100) {
    return Array.from(this.fills.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getFillsInTimeRange(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    return Array.from(this.fills.values()).filter(fill =>
      fill.timestamp >= start && fill.timestamp <= end
    );
  }

  getFillStats() {
    return {
      ...this.fillStats,
      totalFills: this.fills.size,
      rejectionRate: this.fillStats.totalFills > 0 ? 
        this.fillStats.rejectedFills / (this.fillStats.totalFills + this.fillStats.rejectedFills) : 0
    };
  }

  getFillsBySymbol(symbol) {
    return Array.from(this.fills.values()).filter(fill => fill.symbol === symbol);
  }

  calculateVWAP(orderId) {
    const fills = this.getFillsByOrder(orderId);
    
    if (fills.length === 0) return null;
    
    let totalValue = new Decimal(0);
    let totalQuantity = new Decimal(0);
    
    fills.forEach(fill => {
      const value = new Decimal(fill.quantity).times(fill.price);
      totalValue = totalValue.plus(value);
      totalQuantity = totalQuantity.plus(fill.quantity);
    });
    
    return totalQuantity.gt(0) ? totalValue.dividedBy(totalQuantity).toNumber() : 0;
  }

  // Cleanup old fills to manage memory
  cleanup(maxAge = 24 * 60 * 60 * 1000) { // 24 hours default
    const cutoffTime = new Date(Date.now() - maxAge);
    const fillsToRemove = [];
    
    this.fills.forEach((fill, fillId) => {
      if (fill.timestamp < cutoffTime) {
        fillsToRemove.push(fillId);
      }
    });
    
    fillsToRemove.forEach(fillId => {
      const fill = this.fills.get(fillId);
      this.fills.delete(fillId);
      
      // Clean up indexes
      const orderFills = this.fillsByOrder.get(fill.orderId);
      if (orderFills) {
        const index = orderFills.findIndex(f => f.id === fillId);
        if (index >= 0) {
          orderFills.splice(index, 1);
        }
        if (orderFills.length === 0) {
          this.fillsByOrder.delete(fill.orderId);
        }
      }
      
      if (fill.tradeId) {
        const tradeFills = this.fillsByTrade.get(fill.tradeId);
        if (tradeFills) {
          const index = tradeFills.findIndex(f => f.id === fillId);
          if (index >= 0) {
            tradeFills.splice(index, 1);
          }
          if (tradeFills.length === 0) {
            this.fillsByTrade.delete(fill.tradeId);
          }
        }
      }
    });
    
    this.logger?.info(`Cleaned up ${fillsToRemove.length} old fills`);
  }
}

module.exports = FillManager;