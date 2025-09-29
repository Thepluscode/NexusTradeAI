// src/services/positionService.js
const EventEmitter = require('events');
const Position = require('../models/Position');
const Decimal = require('decimal.js');

class PositionService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Position cache
    this.positionCache = new Map();
    this.cacheTimeout = 2 * 60 * 1000; // 2 minutes
    
    // Performance tracking
    this.stats = {
      totalPositions: 0,
      openPositions: 0,
      closedPositions: 0,
      totalValue: 0,
      totalPnL: 0
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing PositionService...');
      
      // Load position statistics
      await this.loadPositionStats();
      
      this.logger?.info('PositionService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize PositionService:', error);
      throw error;
    }
  }

  async loadPositionStats() {
    try {
      const stats = await Position.aggregate([
        {
          $group: {
            _id: null,
            totalPositions: { $sum: 1 },
            openPositions: { 
              $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
            },
            closedPositions: { 
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
            },
            totalValue: { $sum: '$marketValue' },
            totalPnL: { $sum: '$totalPnL' }
          }
        }
      ]);
      
      if (stats.length > 0) {
        this.stats = stats[0];
        delete this.stats._id;
      }
      
    } catch (error) {
      this.logger?.error('Error loading position statistics:', error);
    }
  }

  async createPosition(positionData) {
    try {
      // Check if position already exists
      const existingPosition = await Position.findOne({
        portfolioId: positionData.portfolioId,
        symbol: positionData.symbol,
        status: 'open'
      });
      
      if (existingPosition) {
        // Update existing position
        return await this.updatePosition(existingPosition.id, positionData);
      }
      
      // Create new position
      const position = new Position({
        ...positionData,
        id: require('uuid').v4(),
        marketValue: positionData.quantity * positionData.avgPrice,
        costBasis: Math.abs(positionData.quantity * positionData.avgPrice),
        currentPrice: positionData.avgPrice,
        firstTradeDate: new Date(),
        lastTradeDate: new Date(),
        totalTrades: 1
      });
      
      await position.save();
      
      // Update cache
      this.updatePositionCache(position);
      
      // Update metrics
      if (this.metrics?.positionCounter) {
        this.metrics.positionCounter.inc({
          symbol: position.symbol,
          side: position.quantity > 0 ? 'long' : 'short',
          status: 'created'
        });
      }
      
      // Emit event
      this.emit('position_created', {
        positionId: position.id,
        portfolioId: position.portfolioId,
        position
      });
      
      this.logger?.info(`Position created: ${position.id} for ${position.symbol}`);
      
      return position;
      
    } catch (error) {
      this.logger?.error('Error creating position:', error);
      throw error;
    }
  }

  async updatePositionFromTrade(trade) {
    try {
      const { portfolioId, symbol, side, quantity, price } = trade;
      
      // Find existing position
      let position = await Position.findOne({
        portfolioId,
        symbol,
        status: 'open'
      });
      
      if (!position) {
        // Create new position
        return await this.createPosition({
          portfolioId,
          userId: trade.userId,
          symbol,
          instrumentType: trade.instrumentType || 'stock',
          quantity: side === 'buy' ? quantity : -quantity,
          avgPrice: price,
          currentPrice: price
        });
      }
      
      // Update existing position
      const tradeQuantity = new Decimal(side === 'buy' ? quantity : -quantity);
      const currentQuantity = new Decimal(position.quantity);
      const currentAvgPrice = new Decimal(position.avgPrice);
      const tradePrice = new Decimal(price);
      
      let newQuantity, newAvgPrice, realizedPnL = new Decimal(0);
      
      if (currentQuantity.times(tradeQuantity).gte(0)) {
        // Adding to position
        const totalCost = currentQuantity.times(currentAvgPrice).plus(tradeQuantity.times(tradePrice));
        newQuantity = currentQuantity.plus(tradeQuantity);
        newAvgPrice = newQuantity.eq(0) ? new Decimal(0) : totalCost.dividedBy(newQuantity.abs());
      } else {
        // Reducing position
        const closeQuantity = Decimal.min(currentQuantity.abs(), tradeQuantity.abs());
        realizedPnL = closeQuantity.times(
          currentQuantity.gt(0) ? 
            tradePrice.minus(currentAvgPrice) : 
            currentAvgPrice.minus(tradePrice)
        );
        
        newQuantity = currentQuantity.plus(tradeQuantity);
        newAvgPrice = newQuantity.eq(0) ? new Decimal(0) : currentAvgPrice;
      }
      
      // Update position
      position.quantity = newQuantity.toNumber();
      position.avgPrice = newAvgPrice.toNumber();
      position.realizedPnL += realizedPnL.toNumber();
      position.totalTrades += 1;
      position.lastTradeDate = new Date();
      
      // Update market values
      position.updatePnL(position.currentPrice);
      
      // Close position if quantity is zero
      if (Math.abs(position.quantity) < 0.000001) {
        position.status = 'closed';
        position.closeDate = new Date();
      }
      
      await position.save();
      
      // Update cache
      this.updatePositionCache(position);
      
      // Emit event
      this.emit('position_updated', {
        positionId: position.id,
        portfolioId: position.portfolioId,
        position,
        trade
      });
      
      return position;
      
    } catch (error) {
      this.logger?.error('Error updating position from trade:', error);
      throw error;
    }
  }

  async updatePositionPrices(symbol, newPrice) {
    try {
      // Update all open positions for this symbol
      const positions = await Position.find({
        symbol,
        status: 'open'
      });
      
      const updatePromises = positions.map(async (position) => {
        position.updatePnL(newPrice);
        await position.save();
        
        // Update cache
        this.updatePositionCache(position);
        
        return position;
      });
      
      const updatedPositions = await Promise.all(updatePromises);
      
      // Emit bulk update event
      this.emit('positions_price_updated', {
        symbol,
        newPrice,
        positions: updatedPositions
      });
      
      return updatedPositions;
      
    } catch (error) {
      this.logger?.error(`Error updating position prices for ${symbol}:`, error);
      throw error;
    }
  }

  async getPosition(positionId) {
    try {
      // Check cache first
      const cached = this.getFromCache(positionId);
      if (cached) {
        return cached;
      }
      
      // Fetch from database
      const position = await Position.findOne({ id: positionId });
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }
      
      // Update cache
      this.updatePositionCache(position);
      
      return position;
      
    } catch (error) {
      this.logger?.error(`Error fetching position ${positionId}:`, error);
      throw error;
    }
  }

  async getPortfolioPositions(portfolioId, options = {}) {
    try {
      const query = { portfolioId };
      
      if (options.status) {
        query.status = options.status;
      }
      
      if (options.symbol) {
        query.symbol = options.symbol;
      }
      
      let positionsQuery = Position.find(query);
      
      if (options.sortBy) {
        positionsQuery = positionsQuery.sort(options.sortBy);
      } else {
        positionsQuery = positionsQuery.sort({ marketValue: -1 });
      }
      
      if (options.limit) {
        positionsQuery = positionsQuery.limit(options.limit);
      }
      
      const positions = await positionsQuery.exec();
      
      return positions;
      
    } catch (error) {
      this.logger?.error(`Error fetching positions for portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  async getUserPositions(userId, options = {}) {
    try {
      const query = { userId };
      
      if (options.status) {
        query.status = options.status;
      }
      
      if (options.symbols && options.symbols.length > 0) {
        query.symbol = { $in: options.symbols };
      }
      
      const positions = await Position.find(query).sort({ marketValue: -1 });
      
      return positions;
      
    } catch (error) {
      this.logger?.error(`Error fetching positions for user ${userId}:`, error);
      throw error;
    }
  }

  async getPositionPerformance(positionId, timeframe = '1d') {
    try {
      const position = await this.getPosition(positionId);
      
      // Calculate performance metrics
      const performance = {
        positionId,
        symbol: position.symbol,
        totalReturnPercent: position.getPnLPercent(),
        totalReturn: position.totalPnL,
        unrealizedReturn: position.unrealizedPnL,
        realizedReturn: position.realizedPnL,
        dayReturn: position.dayPnL,
        costBasis: position.costBasis,
        marketValue: position.marketValue,
        timeframe,
        timestamp: new Date()
      };
      
      return performance;
      
    } catch (error) {
      this.logger?.error(`Error calculating position performance for ${positionId}:`, error);
      throw error;
    }
  }

  // Helper methods
  updatePositionCache(position) {
    this.positionCache.set(position.id, {
      data: position,
      timestamp: Date.now()
    });
  }

  getFromCache(positionId) {
    const cached = this.positionCache.get(positionId);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.positionCache.delete(positionId);
      return null;
    }
    
    return cached.data;
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.positionCache.size
    };
  }
}

module.exports = PositionService;