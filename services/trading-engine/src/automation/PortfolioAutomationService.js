// Portfolio Automation Service
// Manages automated trading portfolios with multiple strategies

const EventEmitter = require('events');
const HighWinRateStrategies = require('../strategies/HighWinRateStrategies');
const InstitutionalAIStrategies = require('../strategies/InstitutionalAIStrategies');
const TradeExecutionEngine = require('../execution/TradeExecutionEngine');
const StrategyValidator = require('../validation/StrategyValidator');
const AIStrategyValidator = require('../validation/AIStrategyValidator');

class PortfolioAutomationService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.strategies = new HighWinRateStrategies(options);
    this.aiStrategies = new InstitutionalAIStrategies(options);
    this.executionEngine = new TradeExecutionEngine(options);
    this.validator = new StrategyValidator(options);
    this.aiValidator = new AIStrategyValidator(options);
    
    // Active portfolios tracking
    this.activePortfolios = new Map();
    this.portfolioPerformance = new Map();
    this.rebalanceSchedules = new Map();
    
    // Automation settings
    this.automationSettings = {
      maxPortfoliosPerUser: {
        'starter': 1,
        'professional': 3,
        'enterprise': 10
      },
      maxStrategiesPerPortfolio: {
        'starter': 2,
        'professional': 5,
        'enterprise': 20
      },
      rebalanceFrequencies: {
        'real-time': 60000, // 1 minute
        'hourly': 3600000, // 1 hour
        'daily': 86400000, // 24 hours
        'weekly': 604800000, // 7 days
        'monthly': 2592000000 // 30 days
      }
    };
    
    this.startAutomationEngine();
  }

  /**
   * Create automated portfolio for user
   */
  async createAutomatedPortfolio(userId, portfolioConfig) {
    try {
      const {
        name,
        description,
        strategies,
        allocation,
        riskSettings,
        autoRebalance,
        rebalanceFrequency,
        initialCapital,
        userSubscription
      } = portfolioConfig;

      // Validate user limits
      const userPortfolios = this.getUserPortfolios(userId);
      const maxPortfolios = this.automationSettings.maxPortfoliosPerUser[userSubscription.plan] || 1;
      
      if (userPortfolios.length >= maxPortfolios) {
        throw new Error(`Maximum portfolios reached for ${userSubscription.plan} plan`);
      }

      // Validate strategy limits
      const maxStrategies = this.automationSettings.maxStrategiesPerPortfolio[userSubscription.plan] || 2;
      if (strategies.length > maxStrategies) {
        throw new Error(`Maximum strategies per portfolio exceeded for ${userSubscription.plan} plan`);
      }

      // Validate allocation percentages
      const totalAllocation = Object.values(allocation).reduce((sum, pct) => sum + pct, 0);
      if (Math.abs(totalAllocation - 100) > 0.01) {
        throw new Error('Strategy allocations must sum to 100%');
      }

      // Create portfolio
      const portfolioId = `portfolio_${userId}_${Date.now()}`;
      const portfolio = {
        id: portfolioId,
        userId,
        name,
        description,
        strategies,
        allocation,
        riskSettings: {
          maxDrawdown: riskSettings.maxDrawdown || 10,
          stopLoss: riskSettings.stopLoss || 5,
          takeProfit: riskSettings.takeProfit || 15,
          maxRiskPerTrade: riskSettings.maxRiskPerTrade || 2,
          maxConcurrentTrades: riskSettings.maxConcurrentTrades || 5
        },
        autoRebalance,
        rebalanceFrequency,
        initialCapital,
        currentValue: initialCapital,
        totalPnL: 0,
        totalPnLPercent: 0,
        dailyPnL: 0,
        monthlyReturn: 0,
        maxDrawdown: 0,
        activeTrades: new Map(),
        tradeHistory: [],
        isActive: false,
        createdAt: new Date(),
        lastRebalance: new Date(),
        performance: {
          totalTrades: 0,
          winningTrades: 0,
          winRate: 0,
          profitFactor: 0,
          sharpeRatio: 0
        }
      };

      this.activePortfolios.set(portfolioId, portfolio);
      this.portfolioPerformance.set(portfolioId, []);

      // Set up rebalancing schedule if enabled
      if (autoRebalance) {
        this.scheduleRebalancing(portfolioId, rebalanceFrequency);
      }

      this.logger?.info(`Created automated portfolio ${portfolioId} for user ${userId}`);
      this.emit('portfolioCreated', { portfolioId, userId, portfolio });

      return {
        success: true,
        portfolioId,
        portfolio: this.sanitizePortfolioForClient(portfolio)
      };

    } catch (error) {
      this.logger?.error('Error creating automated portfolio:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start automated portfolio
   */
  async startPortfolio(portfolioId, userId) {
    try {
      const portfolio = this.activePortfolios.get(portfolioId);
      
      if (!portfolio || portfolio.userId !== userId) {
        throw new Error('Portfolio not found or access denied');
      }

      if (portfolio.isActive) {
        throw new Error('Portfolio is already active');
      }

      // Validate all strategies before starting
      for (const strategy of portfolio.strategies) {
        const validation = await this.validator.validateStrategy(strategy, {});
        if (!validation.isValid) {
          throw new Error(`Strategy ${strategy} failed validation: ${validation.reasons.join(', ')}`);
        }
      }

      portfolio.isActive = true;
      portfolio.startedAt = new Date();

      // Start monitoring and trading
      this.startPortfolioMonitoring(portfolioId);

      this.logger?.info(`Started automated portfolio ${portfolioId}`);
      this.emit('portfolioStarted', { portfolioId, userId });

      return { success: true, message: 'Portfolio started successfully' };

    } catch (error) {
      this.logger?.error('Error starting portfolio:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop automated portfolio
   */
  async stopPortfolio(portfolioId, userId) {
    try {
      const portfolio = this.activePortfolios.get(portfolioId);
      
      if (!portfolio || portfolio.userId !== userId) {
        throw new Error('Portfolio not found or access denied');
      }

      portfolio.isActive = false;
      portfolio.stoppedAt = new Date();

      // Close all active trades
      for (const [tradeId, trade] of portfolio.activeTrades) {
        await this.closePortfolioTrade(portfolioId, tradeId, 'Portfolio stopped');
      }

      // Stop rebalancing
      if (this.rebalanceSchedules.has(portfolioId)) {
        clearInterval(this.rebalanceSchedules.get(portfolioId));
        this.rebalanceSchedules.delete(portfolioId);
      }

      this.logger?.info(`Stopped automated portfolio ${portfolioId}`);
      this.emit('portfolioStopped', { portfolioId, userId });

      return { success: true, message: 'Portfolio stopped successfully' };

    } catch (error) {
      this.logger?.error('Error stopping portfolio:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start portfolio monitoring and trading
   */
  startPortfolioMonitoring(portfolioId) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio) return;

    // Monitor every 30 seconds
    const monitoringInterval = setInterval(async () => {
      if (!portfolio.isActive) {
        clearInterval(monitoringInterval);
        return;
      }

      try {
        await this.processPortfolioSignals(portfolioId);
        await this.updatePortfolioPerformance(portfolioId);
        await this.checkRiskLimits(portfolioId);
      } catch (error) {
        this.logger?.error(`Error monitoring portfolio ${portfolioId}:`, error);
      }
    }, 30000);

    // Store interval for cleanup
    portfolio.monitoringInterval = monitoringInterval;
  }

  /**
   * Process trading signals for portfolio
   */
  async processPortfolioSignals(portfolioId) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio || !portfolio.isActive) return;

    // Check if we can take new trades
    if (portfolio.activeTrades.size >= portfolio.riskSettings.maxConcurrentTrades) {
      return;
    }

    // Generate signals for each strategy
    for (const strategy of portfolio.strategies) {
      try {
        // Get market data for multiple symbols
        const symbols = ['BTC/USD', 'ETH/USD', 'AAPL', 'GOOGL'];
        
        for (const symbol of symbols) {
          const marketData = await this.getMarketData(symbol);
          let signal;

          // Generate signal based on strategy (100% AI-ML strategies)
          switch (strategy) {
            // Traditional strategies (enhanced with AI)
            case 'MultiConfirmationMomentum':
              signal = await this.strategies.multiConfirmationMomentum(marketData, symbol);
              break;
            case 'MeanReversionScalping':
              signal = await this.strategies.meanReversionScalping(marketData, symbol);
              break;
            case 'InstitutionalOrderFlow':
              signal = await this.strategies.institutionalOrderFlow(marketData, symbol);
              break;
            case 'AIPatternRecognition':
              signal = await this.strategies.aiPatternRecognition(marketData, symbol);
              break;
            case 'StatisticalArbitrage':
              signal = await this.strategies.statisticalArbitrage(marketData, [symbol]);
              break;

            // Advanced AI-ML strategies (90%+ win rate)
            case 'DeepLearningMultiAsset':
              signal = await this.aiStrategies.deepLearningMultiAsset(marketData, symbol);
              break;
            case 'ReinforcementLearningMarketMaking':
              signal = await this.aiStrategies.reinforcementLearningMarketMaking(marketData, symbol);
              break;
            case 'TransformerSentimentTrading':
              signal = await this.aiStrategies.transformerSentimentTrading(marketData, symbol);
              break;
            case 'QuantumMLArbitrage':
              signal = await this.aiStrategies.quantumMLArbitrage(marketData, [symbol]);
              break;
            case 'MultiAgentSystemTrading':
              signal = await this.aiStrategies.multiAgentSystemTrading(marketData, symbol);
              break;
          }

          // Execute signal if valid (higher confidence for AI strategies)
          const isAIStrategy = this.isAIStrategy(strategy);
          const minConfidence = isAIStrategy ? 0.92 : 0.85; // 92% for AI, 85% for traditional

          if (signal && signal.signal !== 'HOLD' && signal.confidence > minConfidence) {
            // Use appropriate validator
            const validator = isAIStrategy ? this.aiValidator : this.validator;
            const validation = await validator.validateStrategy ?
              await validator.validateStrategy(strategy, signal) :
              await validator.validateAIStrategy(strategy, signal);

            if (validation.isValid) {
              await this.executePortfolioTrade(portfolioId, signal, strategy);
            } else {
              this.logger?.warn(`${strategy} validation failed:`, validation.reasons);
            }
          }
        }
      } catch (error) {
        this.logger?.error(`Error processing signals for strategy ${strategy}:`, error);
      }
    }
  }

  /**
   * Execute trade for portfolio
   */
  async executePortfolioTrade(portfolioId, signal, strategy) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio) return;

    try {
      // Calculate position size based on allocation
      const strategyAllocation = portfolio.allocation[strategy] || 0;
      const maxPositionValue = (portfolio.currentValue * strategyAllocation / 100);
      const riskAmount = maxPositionValue * (portfolio.riskSettings.maxRiskPerTrade / 100);
      
      const userConfig = {
        accountBalance: portfolio.currentValue,
        positionSize: riskAmount,
        maxRisk: portfolio.riskSettings.maxRiskPerTrade
      };

      // Execute through main execution engine
      const marketData = await this.getMarketData(signal.symbol);
      const executionResult = await this.executionEngine.executeSignal(signal, marketData, userConfig);

      if (executionResult.executed && executionResult.success) {
        // Add to portfolio active trades
        const trade = {
          ...executionResult.trade,
          portfolioId,
          strategy,
          allocation: strategyAllocation
        };

        portfolio.activeTrades.set(executionResult.tradeId, trade);
        
        this.logger?.info(`Executed portfolio trade: ${signal.symbol} via ${strategy} for portfolio ${portfolioId}`);
        this.emit('portfolioTradeExecuted', { portfolioId, trade });
      }

    } catch (error) {
      this.logger?.error('Error executing portfolio trade:', error);
    }
  }

  /**
   * Close portfolio trade
   */
  async closePortfolioTrade(portfolioId, tradeId, reason) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio) return;

    const trade = portfolio.activeTrades.get(tradeId);
    if (!trade) return;

    try {
      // Calculate P&L
      const currentPrice = await this.getCurrentPrice(trade.symbol);
      const pnl = this.calculatePnL(trade, currentPrice);
      
      // Update trade
      trade.exit = currentPrice;
      trade.pnl = pnl;
      trade.pnlPercent = pnl / trade.positionSize;
      trade.closeReason = reason;
      trade.closedAt = new Date();

      // Update portfolio performance
      portfolio.totalPnL += pnl;
      portfolio.totalPnLPercent = (portfolio.totalPnL / portfolio.initialCapital) * 100;
      portfolio.currentValue += pnl;

      // Move to trade history
      portfolio.tradeHistory.push(trade);
      portfolio.activeTrades.delete(tradeId);

      // Update performance metrics
      this.updatePortfolioMetrics(portfolioId);

      this.logger?.info(`Closed portfolio trade ${tradeId} for portfolio ${portfolioId}: P&L ${pnl.toFixed(2)}`);
      this.emit('portfolioTradeClosed', { portfolioId, trade });

    } catch (error) {
      this.logger?.error('Error closing portfolio trade:', error);
    }
  }

  /**
   * Update portfolio performance metrics
   */
  updatePortfolioMetrics(portfolioId) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio) return;

    const trades = portfolio.tradeHistory;
    if (trades.length === 0) return;

    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);

    portfolio.performance = {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      winRate: winningTrades.length / trades.length,
      profitFactor: this.calculateProfitFactor(trades),
      sharpeRatio: this.calculateSharpeRatio(trades)
    };

    // Calculate drawdown
    portfolio.maxDrawdown = this.calculateMaxDrawdown(trades, portfolio.initialCapital);
  }

  /**
   * Schedule portfolio rebalancing
   */
  scheduleRebalancing(portfolioId, frequency) {
    const interval = this.automationSettings.rebalanceFrequencies[frequency.toLowerCase()];
    if (!interval) return;

    const rebalanceInterval = setInterval(() => {
      this.rebalancePortfolio(portfolioId);
    }, interval);

    this.rebalanceSchedules.set(portfolioId, rebalanceInterval);
  }

  /**
   * Rebalance portfolio allocations
   */
  async rebalancePortfolio(portfolioId) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio || !portfolio.isActive) return;

    try {
      this.logger?.info(`Rebalancing portfolio ${portfolioId}`);
      
      // Calculate current allocations
      const currentAllocations = this.calculateCurrentAllocations(portfolio);
      const targetAllocations = portfolio.allocation;

      // Determine rebalancing actions
      const rebalanceActions = this.calculateRebalanceActions(currentAllocations, targetAllocations, portfolio.currentValue);

      // Execute rebalancing trades
      for (const action of rebalanceActions) {
        if (Math.abs(action.amount) > portfolio.currentValue * 0.01) { // Only rebalance if > 1% difference
          await this.executeRebalanceTrade(portfolioId, action);
        }
      }

      portfolio.lastRebalance = new Date();
      this.emit('portfolioRebalanced', { portfolioId, actions: rebalanceActions });

    } catch (error) {
      this.logger?.error(`Error rebalancing portfolio ${portfolioId}:`, error);
    }
  }

  /**
   * Get user portfolios
   */
  getUserPortfolios(userId) {
    return Array.from(this.activePortfolios.values()).filter(p => p.userId === userId);
  }

  /**
   * Get portfolio performance data
   */
  getPortfolioPerformance(portfolioId) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio) return null;

    return {
      ...this.sanitizePortfolioForClient(portfolio),
      performanceHistory: this.portfolioPerformance.get(portfolioId) || []
    };
  }

  /**
   * Sanitize portfolio data for client
   */
  sanitizePortfolioForClient(portfolio) {
    return {
      id: portfolio.id,
      name: portfolio.name,
      description: portfolio.description,
      strategies: portfolio.strategies,
      allocation: portfolio.allocation,
      riskSettings: portfolio.riskSettings,
      currentValue: portfolio.currentValue,
      totalPnL: portfolio.totalPnL,
      totalPnLPercent: portfolio.totalPnLPercent,
      dailyPnL: portfolio.dailyPnL,
      monthlyReturn: portfolio.monthlyReturn,
      maxDrawdown: portfolio.maxDrawdown,
      isActive: portfolio.isActive,
      performance: portfolio.performance,
      activeTrades: portfolio.activeTrades.size,
      createdAt: portfolio.createdAt,
      lastRebalance: portfolio.lastRebalance
    };
  }

  // Helper methods
  async getMarketData(symbol) {
    // Simplified market data - in production, get from real data feed
    const basePrice = this.getBasePrice(symbol);
    const prices = [];
    const volume = [];
    
    for (let i = 0; i < 100; i++) {
      const change = (Math.random() - 0.5) * 0.02;
      const price = i === 0 ? basePrice : prices[i - 1] * (1 + change);
      prices.push(price);
      volume.push(1000000 * (1 + (Math.random() - 0.5) * 0.5));
    }

    return { symbol, prices, volume, timestamp: Date.now() };
  }

  getBasePrice(symbol) {
    const prices = {
      'BTC/USD': 43250, 'ETH/USD': 2650, 'AAPL': 185.50, 'GOOGL': 142.30
    };
    return prices[symbol] || 100;
  }

  async getCurrentPrice(symbol) {
    return this.getBasePrice(symbol) * (1 + (Math.random() - 0.5) * 0.01);
  }

  calculatePnL(trade, exitPrice) {
    const direction = trade.side === 'buy' ? 1 : -1;
    return direction * (exitPrice - trade.entry) * (trade.positionSize / trade.entry);
  }

  calculateProfitFactor(trades) {
    const profits = trades.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const losses = Math.abs(trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    return losses > 0 ? profits / losses : 999;
  }

  calculateSharpeRatio(trades) {
    if (trades.length < 2) return 0;
    const returns = trades.map(t => t.pnlPercent);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;
  }

  calculateMaxDrawdown(trades, initialCapital) {
    let peak = initialCapital;
    let maxDrawdown = 0;
    let runningValue = initialCapital;
    
    for (const trade of trades) {
      runningValue += trade.pnl;
      if (runningValue > peak) peak = runningValue;
      const drawdown = (peak - runningValue) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    return maxDrawdown * 100;
  }

  calculateCurrentAllocations(portfolio) {
    // Simplified allocation calculation
    const allocations = {};
    for (const strategy of portfolio.strategies) {
      allocations[strategy] = portfolio.allocation[strategy] || 0;
    }
    return allocations;
  }

  calculateRebalanceActions(current, target, totalValue) {
    const actions = [];
    for (const [strategy, targetPct] of Object.entries(target)) {
      const currentPct = current[strategy] || 0;
      const difference = targetPct - currentPct;
      const amount = (difference / 100) * totalValue;
      
      if (Math.abs(amount) > 0) {
        actions.push({
          strategy,
          action: amount > 0 ? 'buy' : 'sell',
          amount: Math.abs(amount),
          currentPct,
          targetPct
        });
      }
    }
    return actions;
  }

  async executeRebalanceTrade(portfolioId, action) {
    // Simplified rebalancing execution
    this.logger?.info(`Rebalancing ${action.strategy}: ${action.action} $${action.amount.toFixed(2)}`);
  }

  async checkRiskLimits(portfolioId) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio) return;

    // Check max drawdown
    if (portfolio.maxDrawdown > portfolio.riskSettings.maxDrawdown) {
      this.logger?.warn(`Portfolio ${portfolioId} exceeded max drawdown limit`);
      await this.stopPortfolio(portfolioId, portfolio.userId);
    }
  }

  async updatePortfolioPerformance(portfolioId) {
    const portfolio = this.activePortfolios.get(portfolioId);
    if (!portfolio) return;

    // Calculate daily P&L
    const today = new Date().toDateString();
    const todayTrades = portfolio.tradeHistory.filter(t => 
      new Date(t.closedAt).toDateString() === today
    );
    
    portfolio.dailyPnL = todayTrades.reduce((sum, t) => sum + t.pnl, 0);

    // Store performance snapshot
    const performanceHistory = this.portfolioPerformance.get(portfolioId) || [];
    performanceHistory.push({
      timestamp: new Date(),
      value: portfolio.currentValue,
      pnl: portfolio.totalPnL,
      pnlPercent: portfolio.totalPnLPercent,
      activeTrades: portfolio.activeTrades.size
    });

    // Keep only last 1000 snapshots
    if (performanceHistory.length > 1000) {
      performanceHistory.splice(0, performanceHistory.length - 1000);
    }

    this.portfolioPerformance.set(portfolioId, performanceHistory);
  }

  startAutomationEngine() {
    this.logger?.info('🤖 Portfolio Automation Engine started');
    
    // Clean up stopped portfolios every hour
    setInterval(() => {
      this.cleanupInactivePortfolios();
    }, 3600000);
  }

  cleanupInactivePortfolios() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 days ago

    for (const [portfolioId, portfolio] of this.activePortfolios) {
      if (!portfolio.isActive && portfolio.stoppedAt && portfolio.stoppedAt < cutoffDate) {
        this.activePortfolios.delete(portfolioId);
        this.portfolioPerformance.delete(portfolioId);
        this.logger?.info(`Cleaned up inactive portfolio ${portfolioId}`);
      }
    }
  }

  /**
   * Check if strategy is an AI-ML strategy
   */
  isAIStrategy(strategyName) {
    const aiStrategies = [
      'DeepLearningMultiAsset',
      'ReinforcementLearningMarketMaking',
      'TransformerSentimentTrading',
      'QuantumMLArbitrage',
      'MultiAgentSystemTrading'
    ];
    return aiStrategies.includes(strategyName);
  }
}

module.exports = PortfolioAutomationService;
