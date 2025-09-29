// src/services/portfolioService.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');
const Portfolio = require('../models/Portfolio');
const Position = require('../models/Position');

class PortfolioService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Portfolio cache for fast access
    this.portfolioCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Configuration
    this.config = {
      defaultCurrency: 'USD',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CHF'],
      maxPortfoliosPerUser: 10,
      enableRealTimeUpdates: true,
      enablePerformanceTracking: true
    };
    
    // Performance tracking
    this.stats = {
      totalPortfolios: 0,
      activePortfolios: 0,
      totalValue: 0,
      avgPortfolioValue: 0,
      lastUpdate: null
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing PortfolioService...');
      
      // Load portfolio statistics
      await this.loadPortfolioStats();
      
      // Setup event listeners
      this.setupEventListeners();
      
      this.logger?.info('PortfolioService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize PortfolioService:', error);
      throw error;
    }
  }

  async loadPortfolioStats() {
    try {
      const stats = await Portfolio.aggregate([
        {
          $group: {
            _id: null,
            totalPortfolios: { $sum: 1 },
            activePortfolios: { 
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            totalValue: { $sum: '$totalValue' },
            avgValue: { $avg: '$totalValue' }
          }
        }
      ]);
      
      if (stats.length > 0) {
        this.stats = {
          ...this.stats,
          totalPortfolios: stats[0].totalPortfolios,
          activePortfolios: stats[0].activePortfolios,
          totalValue: stats[0].totalValue,
          avgPortfolioValue: stats[0].avgValue
        };
      }
      
      this.logger?.info('Portfolio statistics loaded:', this.stats);
    } catch (error) {
      this.logger?.error('Error loading portfolio statistics:', error);
    }
  }

  setupEventListeners() {
    // Listen for position updates
    this.on('position_updated', async (data) => {
      await this.handlePositionUpdate(data);
    });
    
    // Listen for trade executions
    this.on('trade_executed', async (data) => {
      await this.handleTradeExecution(data);
    });
  }

  async createPortfolio(portfolioData) {
    try {
      // Validate user portfolio limit
      const userPortfolios = await Portfolio.countDocuments({ 
        userId: portfolioData.userId,
        status: { $ne: 'deleted' }
      });
      
      if (userPortfolios >= this.config.maxPortfoliosPerUser) {
        throw new Error(`User already has maximum ${this.config.maxPortfoliosPerUser} portfolios`);
      }
      
      // Create portfolio
      const portfolio = new Portfolio({
        ...portfolioData,
        id: require('uuid').v4(),
        currency: portfolioData.currency || this.config.defaultCurrency,
        status: 'active',
        createdAt: new Date(),
        totalValue: 0,
        cashBalance: portfolioData.initialCash || 0,
        positions: [],
        performance: {
          totalReturn: 0,
          totalReturnPercent: 0,
          dayReturn: 0,
          dayReturnPercent: 0,
          annualizedReturn: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          volatility: 0
        }
      });
      
      await portfolio.save();
      
      // Update cache
      this.updatePortfolioCache(portfolio);
      
      // Update metrics
      if (this.metrics?.portfolioCounter) {
        this.metrics.portfolioCounter.inc({
          status: 'created',
          user_type: portfolioData.userType || 'individual'
        });
      }
      
      // Emit event
      this.emit('portfolio_created', {
        portfolioId: portfolio.id,
        userId: portfolio.userId,
        portfolio
      });
      
      this.logger?.info(`Portfolio created: ${portfolio.id} for user ${portfolio.userId}`);
      
      return portfolio;
      
    } catch (error) {
      this.logger?.error('Error creating portfolio:', error);
      throw error;
    }
  }

  async getPortfolio(portfolioId, options = {}) {
    try {
      // Check cache first
      if (!options.skipCache) {
        const cached = this.getFromCache(portfolioId);
        if (cached) {
          return cached;
        }
      }
      
      // Fetch from database
      const portfolio = await Portfolio.findOne({ id: portfolioId });
      if (!portfolio) {
        throw new Error(`Portfolio not found: ${portfolioId}`);
      }
      
      // Include detailed positions if requested
      if (options.includePositions) {
        await portfolio.populate('positions');
      }
      
      // Include performance history if requested
      if (options.includePerformance) {
        await portfolio.populate('performanceHistory');
      }
      
      // Update cache
      this.updatePortfolioCache(portfolio);
      
      return portfolio;
      
    } catch (error) {
      this.logger?.error(`Error fetching portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  async getUserPortfolios(userId, options = {}) {
    try {
      const query = { 
        userId,
        status: { $ne: 'deleted' }
      };
      
      if (options.status) {
        query.status = options.status;
      }
      
      let portfoliosQuery = Portfolio.find(query);
      
      if (options.includePositions) {
        portfoliosQuery = portfoliosQuery.populate('positions');
      }
      
      if (options.sortBy) {
        portfoliosQuery = portfoliosQuery.sort(options.sortBy);
      } else {
        portfoliosQuery = portfoliosQuery.sort({ createdAt: -1 });
      }
      
      if (options.limit) {
        portfoliosQuery = portfoliosQuery.limit(options.limit);
      }
      
      const portfolios = await portfoliosQuery.exec();
      
      return portfolios;
      
    } catch (error) {
      this.logger?.error(`Error fetching portfolios for user ${userId}:`, error);
      throw error;
    }
  }

  async updatePortfolio(portfolioId, updates) {
    try {
      // Validate updates
      const allowedUpdates = ['name', 'description', 'currency', 'riskProfile', 'benchmarkIndex'];
      const validUpdates = {};
      
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          validUpdates[key] = updates[key];
        }
      });
      
      if (Object.keys(validUpdates).length === 0) {
        throw new Error('No valid updates provided');
      }
      
      // Update portfolio
      validUpdates.updatedAt = new Date();
      
      const portfolio = await Portfolio.findOneAndUpdate(
        { id: portfolioId },
        { $set: validUpdates },
        { new: true }
      );
      
      if (!portfolio) {
        throw new Error(`Portfolio not found: ${portfolioId}`);
      }
      
      // Update cache
      this.updatePortfolioCache(portfolio);
      
      // Emit event
      this.emit('portfolio_updated', {
        portfolioId,
        updates: validUpdates,
        portfolio
      });
      
      this.logger?.info(`Portfolio updated: ${portfolioId}`, validUpdates);
      
      return portfolio;
      
    } catch (error) {
      this.logger?.error(`Error updating portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  async calculatePortfolioValue(portfolioId) {
    try {
      const portfolio = await this.getPortfolio(portfolioId, { includePositions: true });
      
      let totalValue = new Decimal(portfolio.cashBalance || 0);
      let totalCost = new Decimal(0);
      let totalUnrealizedPnL = new Decimal(0);
      
      // Calculate value from positions
      for (const position of portfolio.positions) {
        const positionValue = new Decimal(position.quantity).times(position.currentPrice || position.avgPrice);
        const positionCost = new Decimal(position.quantity).times(position.avgPrice);
        const positionPnL = positionValue.minus(positionCost);
        
        totalValue = totalValue.plus(positionValue);
        totalCost = totalCost.plus(positionCost);
        totalUnrealizedPnL = totalUnrealizedPnL.plus(positionPnL);
      }
      
      // Update portfolio with new values
      const valuationUpdate = {
        totalValue: totalValue.toNumber(),
        totalCost: totalCost.toNumber(),
        totalUnrealizedPnL: totalUnrealizedPnL.toNumber(),
        lastValuationAt: new Date()
      };
      
      await Portfolio.findOneAndUpdate(
        { id: portfolioId },
        { $set: valuationUpdate }
      );
      
      // Update metrics
      if (this.metrics?.valuationGauge) {
        this.metrics.valuationGauge.set(
          { portfolio_id: portfolioId, currency: portfolio.currency },
          totalValue.toNumber()
        );
      }
      
      // Update cache
      this.invalidateCache(portfolioId);
      
      return {
        portfolioId,
        ...valuationUpdate,
        currency: portfolio.currency
      };
      
    } catch (error) {
      this.logger?.error(`Error calculating portfolio value for ${portfolioId}:`, error);
      throw error;
    }
  }

  async getCurrentPrice(symbol) {
    // Mock implementation - would integrate with market data service
    const mockPrices = {
      'AAPL': 150.25,
      'GOOGL': 2750.50,
      'MSFT': 330.75,
      'TSLA': 850.00,
      'AMZN': 3200.00
    };
    return mockPrices[symbol] || 100.00;
  }

  async addPosition(portfolioId, positionData) {
    try {
      const portfolio = await Portfolio.findOne({ id: portfolioId });
      if (!portfolio) {
        throw new Error('Portfolio not found');
      }

      const position = new Position({
        id: require('uuid').v4(),
        portfolioId,
        ...positionData,
        createdAt: new Date()
      });

      await position.save();
      
      // Update portfolio
      await this.updatePortfolioValues(portfolio);
      
      this.logger?.info(`Position added: ${position.id}`, { portfolioId, symbol: position.symbol });
      
      return position;
    } catch (error) {
      this.logger?.error('Error adding position:', error);
      throw error;
    }
  }

  async removePosition(portfolioId, positionId) {
    try {
      const position = await Position.findOneAndDelete({ 
        id: positionId, 
        portfolioId 
      });
      
      if (!position) {
        throw new Error('Position not found');
      }

      // Update portfolio
      const portfolio = await Portfolio.findOne({ id: portfolioId });
      if (portfolio) {
        await this.updatePortfolioValues(portfolio);
      }
      
      this.logger?.info(`Position removed: ${positionId}`, { portfolioId });
      
      return position;
    } catch (error) {
      this.logger?.error('Error removing position:', error);
      throw error;
    }
  }

  async rebalancePortfolio(portfolioId, targetAllocations) {
    try {
      const portfolio = await this.getPortfolio(portfolioId);
      const positions = await Position.find({ portfolioId });

      const rebalanceActions = [];
      const totalValue = portfolio.totalValue;

      for (const allocation of targetAllocations) {
        const { symbol, targetPercent } = allocation;
        const targetValue = totalValue * (targetPercent / 100);
        
        const currentPosition = positions.find(p => p.symbol === symbol);
        const currentValue = currentPosition ? currentPosition.marketValue : 0;
        
        const difference = targetValue - currentValue;
        const currentPrice = await this.getCurrentPrice(symbol);
        const sharesDifference = Math.round(difference / currentPrice);

        if (Math.abs(sharesDifference) > 0) {
          rebalanceActions.push({
            symbol,
            action: sharesDifference > 0 ? 'buy' : 'sell',
            shares: Math.abs(sharesDifference),
            estimatedValue: Math.abs(difference)
          });
        }
      }

      this.logger?.info(`Rebalance calculated for portfolio: ${portfolioId}`, {
        actions: rebalanceActions.length
      });

      return {
        portfolioId,
        currentValue: totalValue,
        rebalanceActions,
        estimatedCost: rebalanceActions.reduce((sum, action) => sum + action.estimatedValue, 0)
      };

    } catch (error) {
      this.logger?.error('Error rebalancing portfolio:', error);
      throw error;
    }
  }


  async rebalancePortfolio(portfolioId, targetAllocations) {
    try {
      const portfolio = await this.getPortfolio(portfolioId, { includePositions: true });
      
      // Calculate current allocations
      const currentAllocations = this.calculateCurrentAllocations(portfolio);
      
      // Calculate required trades for rebalancing
      const rebalancingTrades = this.calculateRebalancingTrades(
        currentAllocations,
        targetAllocations,
        portfolio.totalValue
      );
      
      // Validate rebalancing trades
      this.validateRebalancingTrades(rebalancingTrades, portfolio);
      
      // Create rebalancing plan
      const rebalancingPlan = {
        portfolioId,
        currentAllocations,
        targetAllocations,
        trades: rebalancingTrades,
        estimatedCost: this.calculateRebalancingCost(rebalancingTrades),
        createdAt: new Date(),
        status: 'pending'
      };
      
      // Emit rebalancing event
      this.emit('rebalancing_plan_created', rebalancingPlan);
      
      return rebalancingPlan;
      
    } catch (error) {
      this.logger?.error(`Error rebalancing portfolio ${portfolioId}:`, error);
      throw error;
    }
  }

  async performDailySync() {
    try {
      this.logger?.info('Starting daily portfolio sync...');
      
      const activePortfolios = await Portfolio.find({ 
        status: 'active' 
      }).select('id userId');
      
      let processedCount = 0;
      let errorCount = 0;
      
      for (const portfolio of activePortfolios) {
        try {
          // Update portfolio valuation
          await this.calculatePortfolioValue(portfolio.id);
          
          // Calculate performance metrics
          await this.calculatePortfolioPerformance(portfolio.id);
          
          processedCount++;
        } catch (error) {
          this.logger?.error(`Error syncing portfolio ${portfolio.id}:`, error);
          errorCount++;
        }
      }
      
      this.logger?.info(`Daily sync completed: ${processedCount} portfolios processed, ${errorCount} errors`);
      
      return {
        processed: processedCount,
        errors: errorCount,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger?.error('Error in daily portfolio sync:', error);
      throw error;
    }
  }

  async handlePositionUpdate(data) {
    const { portfolioId, position } = data;
    
    try {
      // Recalculate portfolio value
      await this.calculatePortfolioValue(portfolioId);
      
      // Emit portfolio update event
      this.emit('portfolio_value_updated', {
        portfolioId,
        position,
        timestamp: new Date()
      });
      
    } catch (error) {
      this.logger?.error(`Error handling position update for portfolio ${portfolioId}:`, error);
    }
  }

  async handleTradeExecution(data) {
    const { portfolioId, trade } = data;
    
    try {
      // Update cash balance based on trade
      await this.updateCashBalance(portfolioId, trade);
      
      // Recalculate portfolio value
      await this.calculatePortfolioValue(portfolioId);
      
    } catch (error) {
      this.logger?.error(`Error handling trade execution for portfolio ${portfolioId}:`, error);
    }
  }

  // Helper methods
  updatePortfolioCache(portfolio) {
    this.portfolioCache.set(portfolio.id, {
      data: portfolio,
      timestamp: Date.now()
    });
  }

  getFromCache(portfolioId) {
    const cached = this.portfolioCache.get(portfolioId);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.portfolioCache.delete(portfolioId);
      return null;
    }
    
    return cached.data;
  }

  invalidateCache(portfolioId) {
    this.portfolioCache.delete(portfolioId);
  }

  calculateCurrentAllocations(portfolio) {
    const allocations = {};
    const totalValue = portfolio.totalValue || 0;
    
    if (totalValue === 0) return allocations;
    
    portfolio.positions.forEach(position => {
      const positionValue = position.quantity * (position.currentPrice || position.avgPrice);
      allocations[position.symbol] = positionValue / totalValue;
    });
    
    // Add cash allocation
    allocations['CASH'] = (portfolio.cashBalance || 0) / totalValue;
    
    return allocations;
  }

  calculateRebalancingTrades(currentAllocations, targetAllocations, portfolioValue) {
    const trades = [];
    
    Object.entries(targetAllocations).forEach(([symbol, targetPercent]) => {
      const currentPercent = currentAllocations[symbol] || 0;
      const difference = targetPercent - currentPercent;
      
      if (Math.abs(difference) > 0.001) { // 0.1% threshold
        const tradeValue = difference * portfolioValue;
        
        trades.push({
          symbol,
          side: tradeValue > 0 ? 'buy' : 'sell',
          value: Math.abs(tradeValue),
          currentAllocation: currentPercent,
          targetAllocation: targetPercent
        });
      }
    });
    
    return trades;
  }

  validateRebalancingTrades(trades, portfolio) {
    // Validate sufficient cash for buy orders
    const totalBuyValue = trades
      .filter(trade => trade.side === 'buy')
      .reduce((sum, trade) => sum + trade.value, 0);
    
    if (totalBuyValue > portfolio.cashBalance) {
      throw new Error('Insufficient cash balance for rebalancing');
    }
    
    // Add more validation logic as needed
  }

  calculateRebalancingCost(trades) {
    // Simplified cost calculation
    const tradingFeeRate = 0.001; // 0.1% trading fee
    
    return trades.reduce((sum, trade) => {
      return sum + (trade.value * tradingFeeRate);
    }, 0);
  }

  async updateCashBalance(portfolioId, trade) {
    const tradeValue = trade.quantity * trade.price;
    const cashChange = trade.side === 'buy' ? -tradeValue : tradeValue;
    
    await Portfolio.findOneAndUpdate(
      { id: portfolioId },
      { 
        $inc: { cashBalance: cashChange },
        $set: { updatedAt: new Date() }
      }
    );
  }

  async calculatePortfolioPerformance(portfolioId) {
    // This would integrate with PerformanceService
    // Simplified implementation for now
    return {
      portfolioId,
      performance: 'calculated',
      timestamp: new Date()
    };
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.portfolioCache.size,
      lastUpdate: new Date()
    };
  }
}

module.exports = PortfolioService;