const { v4: uuidv4 } = require('uuid');
const { nanoid } = require('nanoid');
const Decimal = require('decimal.js');

class FillGenerator {
  constructor(options = {}) {
    this.logger = options.logger;
    this.feeStructure = options.feeStructure || this.getDefaultFeeStructure();
    this.isInitialized = false;
    
    // Trade ID generation
    this.tradeSequence = 0;
    
    // Fill generation rules
    this.config = {
      enablePartialFills: true,
      minFillSize: 0.01,
      maxFillRatio: 1.0,
      fillLatencyRange: [1, 5],
      slippageRange: [0, 0.002]
    };
    
    // Fill statistics
    this.stats = {
      totalFills: 0,
      totalTradeValue: 0,
      avgFillSize: 0,
      avgSlippage: 0,
      fillsPerSecond: 0
    };
    
    this.lastFillTime = null;
  }

  async initialize() {
    this.logger?.info('Initializing FillGenerator...');
    this.isInitialized = true;
    this.logger?.info('FillGenerator initialized');
  }

  getDefaultFeeStructure() {
    return {
      maker: 0.001,  // 0.1% maker fee
      taker: 0.0015, // 0.15% taker fee
      minFee: 0.01,  // Minimum fee in base currency
      maxFee: 1000   // Maximum fee in base currency
    };
  }

  // Generate a complete trade with fills for both taker and maker
  async generateTrade(params) {
    try {
      const { takerOrder, makerOrder, quantity, price } = params;
      
      // Generate unique trade ID
      const tradeId = `T${Date.now()}${(this.tradeSequence++).toString().padStart(6, '0')}`;
      
      // Calculate trade details
      const trade = {
        id: tradeId,
        symbol: takerOrder.symbol,
        takerOrderId: takerOrder.id,
        makerOrderId: makerOrder.id,
        quantity: parseFloat(quantity),
        price: parseFloat(price),
        side: takerOrder.side.toLowerCase(),
        timestamp: new Date(),
        value: parseFloat(quantity) * parseFloat(price),
        sequence: this.tradeSequence
      };
      
      // Generate fills for both parties
      const takerFill = await this.generateFill({
        ...trade,
        order: takerOrder,
        role: 'taker'
      });
      
      const makerFill = await this.generateFill({
        ...trade,
        order: makerOrder,
        role: 'maker'
      });
      
      // Add fills to trade
      trade.fills = [takerFill, makerFill];
      
      // Calculate fees
      trade.takerFee = parseFloat(this.calculateFee(new Decimal(trade.value), 'taker', takerOrder.userId));
      trade.makerFee = parseFloat(this.calculateFee(new Decimal(trade.value), 'maker', makerOrder.userId));
      trade.totalFees = trade.takerFee + trade.makerFee;
      
      // Update statistics
      this.updateStats(trade);
      
      this.logger?.info(`Trade generated: ${tradeId}`, {
        symbol: trade.symbol,
        quantity: trade.quantity,
        price: trade.price,
        value: trade.value
      });
      
      return trade;
      
    } catch (error) {
      this.logger?.error('Error generating trade:', error);
      throw error;
    }
  }
  
  // Calculate slippage based on trade parameters
  calculateSlippage(trade, role) {
    const baseSlippage = this.config.slippageRange[0] + 
      Math.random() * (this.config.slippageRange[1] - this.config.slippageRange[0]);
    
    // Takers typically experience more slippage
    const roleMultiplier = role === 'taker' ? 1.0 : 0.3;
    
    // Larger trades experience more slippage
    const sizeMultiplier = Math.min(1.0 + (trade.quantity / 10000), 2.0);
    
    return baseSlippage * roleMultiplier * sizeMultiplier;
  }

  async generateFill(fillData) {
    try {
      // Support both old and new parameter formats
      if (fillData.order && fillData.role) {
        // New format from generateTrade
        const { order, role, ...tradeData } = fillData;
        const slippage = this.calculateSlippage(tradeData, role);
        const adjustedPrice = new Decimal(tradeData.price).times(1 + slippage);
        
        const fill = {
          id: nanoid(12),
          orderId: order.id,
          tradeId: tradeData.id,
          symbol: tradeData.symbol,
          side: tradeData.side,
          role: role,
          quantity: tradeData.quantity,
          price: adjustedPrice.toString(),
          value: (tradeData.quantity * adjustedPrice).toString(),
          slippage: slippage,
          timestamp: tradeData.timestamp,
          metadata: {
            ...(order.metadata || {}),
            executionAlgorithm: 'standard',
            fillType: 'complete'
          }
        };
        
        // Add user ID if available
        if (order.userId) {
          fill[`${role}Id`] = order.userId;
        }
        
        return fill;
      } else {
        // Original format (backward compatibility)
        const { takerOrder, makerPrice, quantity, venue = 'internal', makerOrderId = null } = fillData;
        
        const fillId = nanoid(12);
        const fillPrice = new Decimal(makerPrice);
        const fillQuantity = new Decimal(quantity);
        const fillValue = fillPrice.times(fillQuantity);
        
        // Calculate fees
        const takerFee = this.calculateFee(fillValue, 'taker', takerOrder.userId);
        const makerFee = makerOrderId ? this.calculateFee(fillValue, 'maker', null) : new Decimal(0);
        
        // Create fill object
        const fill = {
          id: fillId,
          takerOrderId: takerOrder.id,
          makerOrderId: makerOrderId,
          symbol: takerOrder.symbol,
          side: takerOrder.side,
          quantity: fillQuantity.toString(),
          price: fillPrice.toString(),
          value: fillValue.toString(),
          takerId: takerOrder.userId,
          makerId: makerOrderId ? await this.getMakerUserId(makerOrderId) : null,
          takerFee: takerFee.toString(),
          makerFee: makerFee.toString(),
          totalFee: takerFee.plus(makerFee).toString(),
          venue: venue,
          timestamp: new Date(),
          liquidity: makerOrderId ? 'taker' : 'maker',
          settlementStatus: 'pending',
          settlementDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          metadata: {
            orderType: takerOrder.type,
            timeInForce: takerOrder.timeInForce,
            executionAlgorithm: takerOrder.algorithm || 'standard'
          }
        };
        
        this.logger?.debug(`Generated fill ${fillId}`, {
          symbol: fill.symbol,
          quantity: fill.quantity,
          price: fill.price,
          value: fill.value,
          fee: fill.totalFee
        });
        
        return fill;
      }
    } catch (error) {
      this.logger?.error('Error generating fill:', error);
      throw error;
    }
  }

  calculateFee(tradeValue, feeType, userId = null) {
    try {
      // Get base fee rate
      let feeRate = this.feeStructure[feeType];
      
      // Apply user-specific fee discounts
      if (userId) {
        const userDiscount = this.getUserFeeDiscount(userId);
        feeRate = feeRate * (1 - userDiscount);
      }
      
      // Calculate fee
      let fee = tradeValue.times(feeRate);
      
      // Apply min/max fee limits
      fee = Decimal.max(fee, this.feeStructure.minFee);
      fee = Decimal.min(fee, this.feeStructure.maxFee);
      
      return fee;
      
    } catch (error) {
      this.logger?.error('Error calculating fee:', error);
      return new Decimal(0);
    }
  }

  getUserFeeDiscount(userId) {
    // This would typically look up user tier and trading volume
    // For now, return a basic discount structure
    const userTiers = {
      'retail': 0,     // No discount
      'bronze': 0.1,   // 10% discount
      'silver': 0.2,   // 20% discount
      'gold': 0.3,     // 30% discount
      'platinum': 0.4, // 40% discount
      'vip': 0.5       // 50% discount
    };
    
    // Default to retail
    return userTiers['retail'] || 0;
  }

  async getMakerUserId(makerOrderId) {
    // This would typically look up the maker order in the database
    // For now, return null
    return null;
  }

  async generatePartialFill(originalFill, partialQuantity) {
    try {
      const partialQuantityDecimal = new Decimal(partialQuantity);
      const originalQuantityDecimal = new Decimal(originalFill.quantity);
      const fillRatio = partialQuantityDecimal.dividedBy(originalQuantityDecimal);
      
      const partialFill = {
        ...originalFill,
        id: nanoid(12),
        quantity: partialQuantityDecimal.toString(),
        value: new Decimal(originalFill.value).times(fillRatio).toString(),
        takerFee: new Decimal(originalFill.takerFee).times(fillRatio).toString(),
        makerFee: new Decimal(originalFill.makerFee).times(fillRatio).toString(),
        totalFee: new Decimal(originalFill.totalFee).times(fillRatio).toString(),
        timestamp: new Date(),
        metadata: {
          ...originalFill.metadata,
          parentFillId: originalFill.id,
          fillType: 'partial'
        }
      };
      
      return partialFill;
      
    } catch (error) {
      this.logger?.error('Error generating partial fill:', error);
      throw error;
    }
  }

  async generateTradePair(fill) {
    try {
      // Generate corresponding maker fill if this was a taker fill
      if (fill.liquidity === 'taker' && fill.makerOrderId) {
        const makerFill = {
          ...fill,
          id: nanoid(12),
          takerOrderId: fill.makerOrderId,
          makerOrderId: fill.takerOrderId,
          takerId: fill.makerId,
          makerId: fill.takerId,
          side: fill.side === 'buy' ? 'sell' : 'buy',
          liquidity: 'maker',
          takerFee: fill.makerFee,
          makerFee: fill.takerFee,
          metadata: {
            ...fill.metadata,
            counterpartFillId: fill.id
          }
        };
        
        return {
          takerFill: fill,
          makerFill: makerFill
        };
      }
      
      return { takerFill: fill };
      
    } catch (error) {
      this.logger?.error('Error generating trade pair:', error);
      throw error;
    }
  }

  validateFill(fill) {
    const errors = [];
    
    // Required fields
    const requiredFields = [
      'id', 'takerOrderId', 'symbol', 'side', 'quantity', 
      'price', 'value', 'takerId', 'timestamp'
    ];
    
    for (const field of requiredFields) {
      if (!fill[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Validate numeric fields
    try {
      if (fill.quantity && new Decimal(fill.quantity).lte(0)) {
        errors.push('Quantity must be positive');
      }
      
      if (fill.price && new Decimal(fill.price).lte(0)) {
        errors.push('Price must be positive');
      }
      
      if (fill.value && new Decimal(fill.value).lte(0)) {
        errors.push('Value must be positive');
      }
    } catch (error) {
      errors.push('Invalid numeric values');
    }
    
    // Validate side
    if (fill.side && !['buy', 'sell'].includes(fill.side)) {
      errors.push('Side must be buy or sell');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Update trade statistics
  updateStats(trade) {
    this.stats.totalFills += 2; // Each trade has two fills (taker and maker)
    this.stats.totalTradeValue += trade.value;
    
    // Update average fill size
    this.stats.avgFillSize = this.stats.totalTradeValue / (this.stats.totalFills / 2);
    
    // Update average slippage if available
    if (trade.fills && trade.fills.length > 0) {
      const totalSlippage = trade.fills.reduce((sum, fill) => 
        sum + (fill.slippage || 0), 0);
      const avgSlippage = totalSlippage / trade.fills.length;
      
      // Update running average
      if (this.stats.totalFills === 2) {
        this.stats.avgSlippage = avgSlippage;
      } else {
        this.stats.avgSlippage = (this.stats.avgSlippage * (this.stats.totalFills - 2) + 
                                avgSlippage * 2) / this.stats.totalFills;
      }
    }
    
    // Update fills per second
    const now = Date.now();
    if (!this.lastFillTime) {
      this.lastFillTime = now;
      this.stats.fillsPerSecond = 2; // Initial value for first trade
    } else {
      const timeDiff = (now - this.lastFillTime) / 1000; // Convert to seconds
      this.stats.fillsPerSecond = 2 / timeDiff; // 2 fills per trade
      this.lastFillTime = now;
    }
  }

  getStats() {
    return {
      isInitialized: this.isInitialized,
      feeStructure: this.feeStructure,
      tradeStats: {
        totalFills: this.stats.totalFills,
        totalTradeValue: this.stats.totalTradeValue,
        avgFillSize: this.stats.avgFillSize,
        avgSlippage: this.stats.avgSlippage,
        fillsPerSecond: this.stats.fillsPerSecond,
        tradesGenerated: this.tradeSequence
      }
    };
  }
}

module.exports = FillGenerator;