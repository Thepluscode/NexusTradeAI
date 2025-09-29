const EventEmitter = require('events');
const Decimal = require('decimal.js');
const Position = require('../models/Position');
const Trade = require('../models/Trade');

/**
 * PositionManager handles position tracking, P&L calculation, and risk management
 * for trading positions across multiple users and symbols.
 */
class PositionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    this.metrics = options.metrics;
    this.marketDataService = options.marketDataService;
    
    // Position storage
    this.positions = new Map(); // userId -> Map(symbol -> position)
    this.positionHistory = new Map(); // userId -> historical positions
    this.isInitialized = false;
    
    // Position calculation settings
    this.markToMarketInterval = 5000; // 5 seconds
    this.realizationThreshold = new Decimal(0.01); // Minimum quantity for realization
    this.markToMarketIntervalId = null;
    
    // Configuration
    this.config = {
      calculateUnrealizedPnL: true,
      enablePositionLimits: true,
      autoRebalancing: false,
      riskLimits: {
        maxPositionSize: 10000000,    // $10M max position
        maxConcentration: 0.25,       // 25% max concentration
        maxLeverage: 5.0,            // 5x max leverage
        maxDrawdown: 0.2,            // 20% max drawdown
        minPositionValue: 100         // $100 minimum position value
      }
    };
    
    // Performance tracking
    this.stats = {
      totalPositions: 0,
      activePositions: 0,
      totalTrades: 0,
      avgPositionSize: 0,
      totalPnL: 0,
      lastUpdate: null
    };
    
    // Bind methods
    this.markToMarket = this.markToMarket.bind(this);
  }

  /**
   * Initialize the PositionManager
   */
  async initialize() {
    try {
      this.logger.info('Initializing PositionManager...');
      
      // Load existing positions from storage
      await this.loadPositions();
      
      // Setup market data listeners
      this.setupMarketDataListeners();
      
      // Start mark-to-market updates
      this.startMarkToMarket();
      
      this.isInitialized = true;
      this.stats.lastUpdate = new Date();
      this.logger.info('PositionManager initialized successfully');
      
      return true;
    } catch (error) {
      this.logger.error('Failed to initialize PositionManager:', error);
      throw error;
    }
  }

  async loadPositions() {
    try {
      this.logger.info('Loading positions from storage...');
      // Implementation would fetch from database
      // For now, just initialize with empty state
      this.stats.lastUpdate = new Date();
    } catch (error) {
      this.logger.error('Error loading positions:', error);
      throw error;
    }
  }

  /**
   * Add or update a position in the cache
   * @private
   */
  addToCache(position) {
    try {
      if (!this.positions.has(position.userId)) {
        this.positions.set(position.userId, new Map());
      }
      this.positions.get(position.userId).set(position.symbol, position);
    } catch (error) {
      this.logger.error('Error adding position to cache:', error);
      throw error;
    }
  }

  /**
   * Update position based on a new fill
   * @param {Object} fill - The fill/trade to process
   * @returns {Object} The updated position
   */
  async updatePosition(fill) {
    try {
      const { userId, symbol, quantity, price, side } = fill;
      
      // Get or create position
      let position = this.getPosition(userId, symbol);
      if (!position) {
        position = this.createPosition(userId, symbol);
      }
      
      // Update position based on fill
      const updatedPosition = await this.applyTradeToPosition(position, {
        side,
        quantity: Math.abs(quantity),
        price
      });
      
      // Update cache
      this.addToCache(updatedPosition);
      
      // Update statistics
      this.stats.totalTrades++;
      this.stats.lastUpdate = new Date();
      
      // Check position limits
      if (this.config.enablePositionLimits) {
        await this.checkPositionLimits(userId, symbol, updatedPosition);
      }
      
      // Update portfolio metrics
      await this.updatePortfolioMetrics(userId);
      
      // Emit events
      this.emit('position_updated', updatedPosition);
      this.emit('portfolio_updated', this.getPortfolioSummary(userId));
      
      return updatedPosition;
      
    } catch (error) {
      this.logger.error('Error updating position:', error);
      throw error;
    }
  }

  async createPosition(userId, symbol) {
    const position = {
      userId,
      symbol,
      quantity: '0',
      averagePrice: '0',
      lastPrice: '0',
      marketValue: '0',
      unrealizedPnL: '0',
      realizedPnL: '0',
      totalFees: '0',
      isActive: true,
      openedAt: new Date(),
      updatedAt: new Date()
    };
    
    const savedPosition = await new Position(position).save();
    this.addToCache(savedPosition.toObject());
    
    return savedPosition.toObject();
  }

  async getPosition(userId, symbol) {
    // Try cache first
    const userPositions = this.positions.get(userId);
    if (userPositions && userPositions.has(symbol)) {
      return userPositions.get(symbol);
    }
    
    // Fallback to database
    try {
      const position = await Position.findOne({ 
        userId, 
        symbol, 
        isActive: true 
      }).lean();
      
      if (position) {
        this.addToCache(position);
      }
      
      return position;
      
    } catch (error) {
      this.logger.error(`Error getting position for ${userId}-${symbol}:`, error);
      return null;
    }
  }

  async getUserPositions(userId) {
    try {
      const positions = await Position.find({ 
        userId, 
        isActive: true 
      }).lean();
      
      // Update cache
      positions.forEach(position => this.addToCache(position));
      
      return positions;
      
    } catch (error) {
      this.logger.error(`Error getting positions for user ${userId}:`, error);
      throw error;
    }
  }

  async getPortfolioSummary(userId) {
    try {
      const positions = await this.getUserPositions(userId);
      
      let totalMarketValue = new Decimal(0);
      let totalUnrealizedPnL = new Decimal(0);
      let totalRealizedPnL = new Decimal(0);
      let totalFees = new Decimal(0);
      
      const summary = {
        userId,
        positionCount: positions.length,
        positions: [],
        totalMarketValue: '0',
        totalUnrealizedPnL: '0',
        totalRealizedPnL: '0',
        totalFees: '0',
        totalPnL: '0',
        lastUpdated: new Date()
      };
      
      for (const position of positions) {
        // Get current market price and update unrealized P&L
        const marketPrice = await this.getMarketPrice(position.symbol);
        const quantity = new Decimal(position.quantity);
        const avgPrice = new Decimal(position.averagePrice);
        
        const marketValue = quantity.times(marketPrice);
        const unrealizedPnL = this.calculateUnrealizedPnL(quantity, avgPrice, new Decimal(marketPrice));
        
        const positionSummary = {
          symbol: position.symbol,
          quantity: position.quantity,
          averagePrice: position.averagePrice,
          marketPrice: marketPrice.toString(),
          marketValue: marketValue.toString(),
          unrealizedPnL: unrealizedPnL.toString(),
          realizedPnL: position.realizedPnL,
          totalFees: position.totalFees,
          percentageOfPortfolio: '0', // Will calculate after totals
          side: new Decimal(position.quantity).gte(0) ? 'long' : 'short'
        };
        
        summary.positions.push(positionSummary);
        
        totalMarketValue = totalMarketValue.plus(marketValue.abs());
        totalUnrealizedPnL = totalUnrealizedPnL.plus(unrealizedPnL);
        totalRealizedPnL = totalRealizedPnL.plus(position.realizedPnL);
        totalFees = totalFees.plus(position.totalFees);
      }
      
      // Calculate percentages
      if (totalMarketValue.gt(0)) {
        summary.positions.forEach(pos => {
          const posValue = new Decimal(pos.marketValue);
          const percentage = posValue.dividedBy(totalMarketValue).times(100);
          pos.percentageOfPortfolio = percentage.toFixed(2) + '%';
        });
      }
      
      summary.totalMarketValue = totalMarketValue.toString();
      summary.totalUnrealizedPnL = totalUnrealizedPnL.toString();
      summary.totalRealizedPnL = totalRealizedPnL.toString();
      summary.totalFees = totalFees.toString();
      summary.totalPnL = totalUnrealizedPnL.plus(totalRealizedPnL).toString();
      
      return summary;
      
    } catch (error) {
      this.logger.error(`Error getting portfolio summary for ${userId}:`, error);
      throw error;
    }
  }

  async liquidatePositions(userId, requiredAmount) {
    try {
      this.logger.warn(`Starting liquidation for user ${userId}, required: ${requiredAmount}`);
      
      const positions = await this.getUserPositions(userId);
      
      // Sort positions by risk (largest losing positions first)
      const sortedPositions = positions
        .map(pos => ({
          ...pos,
          unrealizedPnLDecimal: new Decimal(pos.unrealizedPnL)
        }))
        .sort((a, b) => a.unrealizedPnLDecimal.cmp(b.unrealizedPnLDecimal));
      
      let liquidatedValue = new Decimal(0);
      const liquidatedPositions = [];
      
      for (const position of sortedPositions) {
        if (liquidatedValue.gte(requiredAmount)) {
          break;
        }
        
        // Create liquidation order
        const liquidationOrder = {
          userId,
          symbol: position.symbol,
          side: new Decimal(position.quantity).gt(0) ? 'sell' : 'buy',
          quantity: new Decimal(position.quantity).abs().toString(),
          type: 'market',
          source: 'liquidation',
          metadata: {
            liquidation: true,
            originalPositionId: position._id
          }
        };
        
        // Submit liquidation order
        // This would typically go through the order manager
        this.emit('liquidation_order_created', liquidationOrder);
        
        liquidatedPositions.push({
          symbol: position.symbol,
          quantity: position.quantity,
          estimatedValue: position.marketValue
        });
        
        liquidatedValue = liquidatedValue.plus(new Decimal(position.marketValue).abs());
      }
      
      this.emit('liquidation_completed', {
        userId,
        requiredAmount,
        liquidatedValue: liquidatedValue.toString(),
        liquidatedPositions
      });
      
      this.logger.warn(`Liquidation completed for user ${userId}`, {
        requiredAmount,
        liquidatedValue: liquidatedValue.toString(),
        positionsLiquidated: liquidatedPositions.length
      });
      
      return {
        success: true,
        liquidatedValue: liquidatedValue.toString(),
        liquidatedPositions
      };
      
    } catch (error) {
      this.logger.error(`Error liquidating positions for user ${userId}:`, error);
      throw error;
    }
  }

  calculateUnrealizedPnL(quantity, avgPrice, marketPrice) {
    if (quantity.eq(0)) {
      return new Decimal(0);
    }
    
    return quantity.times(marketPrice.minus(avgPrice));
  }

  isSameSide(currentQuantity, newQuantity) {
    if (currentQuantity.eq(0)) {
      return true; // Opening position
    }
    
    return (currentQuantity.gt(0) && newQuantity.gt(0)) || 
           (currentQuantity.lt(0) && newQuantity.lt(0));
  }

  /**
   * Start the mark-to-market process
   */
  async getPortfolioSummary(userId) {
    try {
      const positions = this.getUserPositions(userId);
      let totalValue = new Decimal(0);
      let totalUnrealizedPnL = new Decimal(0);
      let totalRealizedPnL = new Decimal(0);
      let totalFees = new Decimal(0);
      
      const summary = {
        userId,
        positions: [],
        timestamp: new Date()
      };
      
      for (const position of positions) {
        const positionValue = new Decimal(position.marketValue || 0);
        totalValue = totalValue.plus(positionValue.abs());
        totalUnrealizedPnL = totalUnrealizedPnL.plus(position.unrealizedPnL || 0);
        totalRealizedPnL = totalRealizedPnL.plus(position.realizedPnL || 0);
        totalFees = totalFees.plus(position.totalFees || 0);
        
        summary.positions.push({
          symbol: position.symbol,
          quantity: position.quantity,
          avgPrice: position.avgPrice,
          marketValue: position.marketValue,
          unrealizedPnL: position.unrealizedPnL,
          realizedPnL: position.realizedPnL
        });
      }
      
      summary.totalValue = totalValue.toString();
      summary.totalUnrealizedPnL = totalUnrealizedPnL.toString();
      summary.totalRealizedPnL = totalRealizedPnL.toString();
      summary.totalFees = totalFees.toString();
      summary.totalPnL = totalUnrealizedPnL.plus(totalRealizedPnL).toString();
      
      return summary;
      
    } catch (error) {
      this.logger.error(`Error getting portfolio summary for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Liquidate positions for a user
   */
  async liquidatePositions(userId, requiredAmount) {
    try {
      this.logger.warn(`Starting liquidation for user ${userId}, required: ${requiredAmount}`);
      
      const positions = await this.getUserPositions(userId);
      
      // Sort positions by risk (largest losing positions first)
      const sortedPositions = positions
        .map(pos => ({
          ...pos,
          unrealizedPnLDecimal: new Decimal(pos.unrealizedPnL || 0)
        }))
        .sort((a, b) => a.unrealizedPnLDecimal.cmp(b.unrealizedPnLDecimal));
      
      let liquidatedValue = new Decimal(0);
      const liquidatedPositions = [];
      
      for (const position of sortedPositions) {
        if (liquidatedValue.gte(requiredAmount)) {
          break;
        }
        
        // Create liquidation order
        const liquidationOrder = {
          userId,
          symbol: position.symbol,
          side: new Decimal(position.quantity).gt(0) ? 'sell' : 'buy',
          quantity: new Decimal(position.quantity).abs().toString(),
          type: 'market',
          source: 'liquidation',
          metadata: {
            liquidation: true,
            originalPositionId: position.id
          }
        };
        
        // Submit liquidation order
        this.emit('liquidation_order_created', liquidationOrder);
        
        liquidatedPositions.push({
          symbol: position.symbol,
          quantity: position.quantity,
          estimatedValue: position.marketValue
        });
        
        liquidatedValue = liquidatedValue.plus(new Decimal(position.marketValue || 0).abs());
      }
      
      this.emit('liquidation_completed', {
        userId,
        requiredAmount,
        liquidatedValue: liquidatedValue.toString(),
        liquidatedPositions
      });
      
      this.logger.warn(`Liquidation completed for user ${userId}`, {
        requiredAmount,
        liquidatedValue: liquidatedValue.toString(),
        positionsLiquidated: liquidatedPositions.length
      });
      
      return {
        success: true,
        liquidatedValue: liquidatedValue.toString(),
        liquidatedPositions
      };
      
    } catch (error) {
      this.logger.error(`Error liquidating positions for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate unrealized P&L for a position
   */
  calculateUnrealizedPnL(quantity, avgPrice, marketPrice) {
    const qty = new Decimal(quantity);
    const avg = new Decimal(avgPrice);
    const mkt = new Decimal(marketPrice);
    
    if (qty.eq(0)) {
      return new Decimal(0);
    }
    
    return qty.times(mkt.minus(avg));
  }

  /**
   * Check if two quantities are on the same side (both long or both short)
   */
  isSameSide(currentQuantity, newQuantity) {
    const current = new Decimal(currentQuantity);
    const next = new Decimal(newQuantity);
    
    if (current.eq(0)) {
      return true; // Opening position
    }
    
    return (current.gt(0) && next.gt(0)) || 
           (current.lt(0) && next.lt(0));
  }



  /**
   * Perform mark-to-market on all positions
   */
  async markToMarket() {
    try {
      // Update all positions with current market prices
      for (const [userId, userPositions] of this.positions) {
        for (const [symbol, position] of userPositions) {
          if (!position.isActive) continue;
          
          const marketPrice = await this.getMarketPrice(symbol);
          const quantity = new Decimal(position.quantity);
          const avgPrice = new Decimal(position.avgPrice || 0);
          
          const newUnrealizedPnL = this.calculateUnrealizedPnL(quantity, avgPrice, marketPrice);
          const newMarketValue = quantity.times(marketPrice);
          
          // Update position
          position.lastPrice = marketPrice;
          position.unrealizedPnL = newUnrealizedPnL.toNumber();
          position.marketValue = newMarketValue.toNumber();
          position.updatedAt = new Date();
          
          // Update metrics
          if (this.metrics?.positionValue) {
            const side = quantity.gte(0) ? 'long' : 'short';
            this.metrics.positionValue.set(
              { symbol, side },
              newMarketValue.abs().toNumber()
            );
          }
        }
      }
      
      this.emit('mark_to_market', { timestamp: new Date() });
      
    } catch (error) {
      this.logger.error('Error in mark-to-market update:', error);
    }
  }

  /**
   * Apply a trade to a position and calculate P&L
   */
  async applyTradeToPosition(position, trade) {
    const { side, quantity, price } = trade;
    const tradeQuantity = new Decimal(quantity);
    const tradePrice = new Decimal(price);
    const currentQuantity = new Decimal(position.quantity);
    const currentAvgPrice = new Decimal(position.avgPrice || 0); // Calculate new position values based on trade
    let newQuantity, newAvgPrice, realizedPnL = new Decimal(0);
    
    if (side.toLowerCase() === 'buy') {
      // Adding to position (or reducing short position)
      if (currentQuantity.gte(0)) {
        // Adding to long position
        const totalCost = currentQuantity.times(currentAvgPrice).plus(tradeQuantity.times(tradePrice));
        newQuantity = currentQuantity.plus(tradeQuantity);
        newAvgPrice = newQuantity.gt(0) ? totalCost.dividedBy(newQuantity) : new Decimal(0);
      } else {
        // Reducing short position
        if (tradeQuantity.gte(currentQuantity.abs())) {
          // Closing short and potentially going long
          const closingQuantity = currentQuantity.abs();
          realizedPnL = closingQuantity.times(currentAvgPrice.minus(tradePrice));
          
          const remainingQuantity = tradeQuantity.minus(closingQuantity);
          newQuantity = remainingQuantity;
          newAvgPrice = remainingQuantity.gt(0) ? tradePrice : new Decimal(0);
        } else {
          // Partially reducing short position
          realizedPnL = tradeQuantity.times(currentAvgPrice.minus(tradePrice));
          newQuantity = currentQuantity.plus(tradeQuantity);
          newAvgPrice = currentAvgPrice; // Average price stays same for short reduction
        }
      }
    } else {
      // Selling (reducing long position or adding to short position)
      if (currentQuantity.lte(0)) {
        // Adding to short position
        const totalCost = currentQuantity.abs().times(currentAvgPrice).plus(tradeQuantity.times(tradePrice));
        newQuantity = currentQuantity.minus(tradeQuantity);
        newAvgPrice = newQuantity.lt(0) ? totalCost.dividedBy(newQuantity.abs()) : new Decimal(0);
      } else {
        // Reducing long position
        if (tradeQuantity.gte(currentQuantity)) {
          // Closing long and potentially going short
          const closingQuantity = currentQuantity;
          realizedPnL = closingQuantity.times(tradePrice.minus(currentAvgPrice));
          
          const remainingQuantity = tradeQuantity.minus(closingQuantity);
          newQuantity = remainingQuantity.gt(0) ? remainingQuantity.negated() : new Decimal(0);
          newAvgPrice = remainingQuantity.gt(0) ? tradePrice : new Decimal(0);
        } else {
          // Partially reducing long position
          realizedPnL = tradeQuantity.times(tradePrice.minus(currentAvgPrice));
          newQuantity = currentQuantity.minus(tradeQuantity);
          newAvgPrice = currentAvgPrice; // Average price stays same for long reduction
        }
      }
    }
    
    // Update position
    position.quantity = newQuantity.toNumber();
    position.avgPrice = newAvgPrice.toNumber();
    position.costBasis = Math.abs(position.quantity) * position.avgPrice;
    position.realizedPnL += realizedPnL.toNumber();
    position.lastTradeDate = new Date();
    position.tradeCount++;
    
    // Update market value and unrealized P&L
    await this.updatePositionMarketValue(position);
    
    // Calculate total P&L
    position.totalPnL = position.realizedPnL + position.unrealizedPnL;
    
    // Update position status
    if (Math.abs(position.quantity) < this.realizationThreshold) {
      position.status = 'closed';
      position.closeDate = new Date();
      this.stats.activePositions--;
    } else if (position.status !== 'open') {
      position.status = 'open';
      this.stats.activePositions++;
    }
    
    // Update statistics
    this.stats.totalTrades++;
    this.stats.totalPnL = position.totalPnL;
    this.stats.lastUpdate = new Date();
    
    return position;
  }

  /**
   * Update position's market value and unrealized P&L
   */
  async updatePositionMarketValue(position) {
    try {
      // Get current market price
      const marketData = await this.getMarketData(position.symbol);
      const marketPrice = marketData.lastPrice || position.avgPrice;
      
      position.marketPrice = marketPrice;
      position.marketValue = position.quantity * marketPrice;
      
      // Calculate unrealized P&L
      if (position.quantity !== 0) {
        position.unrealizedPnL = (marketPrice - position.avgPrice) * position.quantity;
      } else {
        position.unrealizedPnL = 0;
      }
      
    } catch (error) {
      this.logger?.error(`Error updating market value for ${position.symbol}:`, error);
      // Use last known values if market data unavailable
    }
  }

  /**
   * Update all positions for a given symbol with new market price
   */
  async updatePositionValues(symbol, newPrice) {
    // Update all positions for this symbol with new market price
    for (const [userId, userPositions] of this.positions) {
      const position = userPositions.get(symbol);
      if (position && position.status === 'open') {
        position.marketPrice = newPrice;
        position.marketValue = position.quantity * newPrice;
        position.unrealizedPnL = (newPrice - position.avgPrice) * position.quantity;
        position.totalPnL = position.realizedPnL + position.unrealizedPnL;
        
        this.emit('position_value_updated', {
          userId,
          symbol,
          position: { ...position }
        });
      }
    }
  }

  // ======================
  // Portfolio Management
  // ======================

  /**
   * Calculate and update portfolio metrics for a user
   */
  async updatePortfolioMetrics(userId) {
    const userPositions = this.positions.get(userId);
    if (!userPositions) return;
    
    let totalValue = 0;
    let totalPnL = 0;
    let totalRealizedPnL = 0;
    let totalUnrealizedPnL = 0;
    let activePositions = 0;
    
    for (const position of userPositions.values()) {
      if (position.status === 'open' && Math.abs(position.quantity) > 0.000001) {
        totalValue += Math.abs(position.marketValue);
        totalPnL += position.totalPnL;
        totalRealizedPnL += position.realizedPnL;
        totalUnrealizedPnL += position.unrealizedPnL;
        activePositions++;
      }
    }
    
    const portfolioMetrics = {
      userId,
      totalValue,
      totalPnL,
      totalRealizedPnL,
      totalUnrealizedPnL,
      activePositions,
      pnlPercent: totalValue > 0 ? totalPnL / totalValue : 0,
      timestamp: new Date()
    };
    
    this.emit('portfolio_updated', portfolioMetrics);
    
    return portfolioMetrics;
  }

  // ======================
  // Risk Management
  // ======================

  /**
   * Check if position exceeds risk limits
   */
  async checkPositionLimits(userId, symbol, position) {
    const warnings = [];
    const violations = [];
    
    // Position size check
    const positionValue = Math.abs(position.marketValue);
    if (positionValue > this.config.riskLimits.maxPositionSize) {
      violations.push({
        type: 'position_size',
        message: `Position size ${positionValue} exceeds limit ${this.config.riskLimits.maxPositionSize}`,
        value: positionValue,
        limit: this.config.riskLimits.maxPositionSize
      });
    }
    
    // Concentration check
    const portfolioMetrics = await this.updatePortfolioMetrics(userId);
    const concentration = portfolioMetrics.totalValue > 0 ? 
      positionValue / portfolioMetrics.totalValue : 0;
    
    if (concentration > this.config.riskLimits.maxConcentration) {
      warnings.push({
        type: 'concentration',
        message: `Position concentration ${(concentration * 100).toFixed(1)}% exceeds recommended limit`,
        value: concentration,
        limit: this.config.riskLimits.maxConcentration
      });
    }
    
    // Emit limit check results
    if (violations.length > 0 || warnings.length > 0) {
      this.emit('position_limit_check', {
        userId,
        symbol,
        warnings,
        violations,
        timestamp: new Date()
      });
    }
  }

  // ======================
  // Query Methods
  // ======================

  getPosition(userId, symbol) {
    const userPositions = this.positions.get(userId);
    return userPositions ? userPositions.get(symbol) : null;
  }

  getUserPositions(userId) {
    const userPositions = this.positions.get(userId);
    return userPositions ? Array.from(userPositions.values()) : [];
  }

  getActivePositions(userId) {
    return this.getUserPositions(userId).filter(pos => 
      pos.status === 'open' && Math.abs(pos.quantity) > 0.000001
    );
  }

  getAllPositions() {
    const allPositions = [];
    for (const userPositions of this.positions.values()) {
      allPositions.push(...userPositions.values());
    }
    return allPositions;
  }

  getPositionsBySymbol(symbol) {
    const symbolPositions = [];
    for (const userPositions of this.positions.values()) {
      const position = userPositions.get(symbol);
      if (position) {
        symbolPositions.push(position);
      }
    }
    return symbolPositions;
  }

  // ======================
  // Analytics Methods
  // ======================

  calculatePositionMetrics(userId, symbol) {
    const position = this.getPosition(userId, symbol);
    if (!position) return null;
    
    const daysSinceOpen = (Date.now() - position.openDate.getTime()) / (24 * 60 * 60 * 1000);
    const avgDailyPnL = daysSinceOpen > 0 ? position.totalPnL / daysSinceOpen : 0;
    
    return {
      ...position,
      daysSinceOpen,
      avgDailyPnL,
      pnlPercent: position.costBasis > 0 ? position.totalPnL / position.costBasis : 0,
      winLossRatio: position.totalPnL > 0 ? 'win' : 'loss'
    };
  }

  // ======================
  // Helper Methods
  // ======================

  async getMarketData(symbol) {
    try {
      if (this.marketDataService) {
        return await this.marketDataService.getMarketData(symbol);
      }
      
      // Fallback mock data if market data service is not available
      const prices = {
        'AAPL': 150.00,
        'GOOGL': 2500.00,
        'MSFT': 300.00,
        'TSLA': 800.00,
        'BTCUSDT': 45000.00
      };
      
      return {
        symbol,
        lastPrice: prices[symbol] || 100.00,
        bid: (prices[symbol] || 100.00) * 0.999,
        ask: (prices[symbol] || 100.00) * 1.001,
        timestamp: new Date()
      };
    } catch (error) {
      this.logger?.error(`Error fetching market data for ${symbol}:`, error);
      // Return default values if market data fetch fails
      return {
        symbol,
        lastPrice: 0,
        bid: 0,
        ask: 0,
        timestamp: new Date()
      };
    }
  }

  // ======================
  // Statistics & Reporting
  // ======================

  getStats() {
    const allPositions = this.getAllPositions();
    const activePositions = allPositions.filter(pos => pos.status === 'open');
    
    return {
      totalPositions: allPositions.length,
      activePositions: activePositions.length,
      totalUsers: this.positions.size,
      avgPositionValue: activePositions.length > 0 ? 
        activePositions.reduce((sum, pos) => sum + Math.abs(pos.marketValue), 0) / activePositions.length : 0,
      totalUnrealizedPnL: activePositions.reduce((sum, pos) => sum + pos.unrealizedPnL, 0),
      lastUpdate: this.stats.lastUpdate || new Date()
    };
  }

  // ======================
  // Configuration Management
  // ======================

  updateConfiguration(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    this.logger.info('Position manager configuration updated:', newConfig);
    
    // Emit event for configuration changes
    this.emit('configuration_updated', {
      timestamp: new Date(),
      config: this.config
    });
    
    return this.config;
  }

  // ======================
  // Status & Health Checks
  // ======================

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      lastUpdate: this.stats.lastUpdate,
      stats: this.getStats(),
      config: this.config,
      timestamp: new Date()
    };
  }
}

module.exports = PositionManager;