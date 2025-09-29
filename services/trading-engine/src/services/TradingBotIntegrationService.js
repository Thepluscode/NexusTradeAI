// Trading Bot Integration Service
// Orchestrates Smart Alerts, Paper Trading, and Portfolio Automation

const EventEmitter = require('events');
const SmartAlertsService = require('./SmartAlertsService');
const PaperTradingService = require('./PaperTradingService');
const PortfolioAutomationService = require('../automation/PortfolioAutomationService');

class TradingBotIntegrationService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    
    // Initialize core services
    this.smartAlerts = new SmartAlertsService(options);
    this.paperTrading = new PaperTradingService(options);
    this.portfolioAutomation = new PortfolioAutomationService(options);
    
    // Integration state
    this.activeIntegrations = new Map();
    this.performanceAggregator = new Map();
    
    // Setup event listeners for service integration
    this.setupEventListeners();
    
    this.logger?.info('🤖 Trading Bot Integration Service initialized');
  }

  /**
   * Setup event listeners between services
   */
  setupEventListeners() {
    // Smart Alerts → Paper Trading integration
    this.smartAlerts.on('smartAlert', async (alert) => {
      await this.processSmartAlertForPaperTrading(alert);
    });

    // Smart Alerts → Portfolio Automation integration
    this.smartAlerts.on('smartAlert', async (alert) => {
      await this.processSmartAlertForPortfolios(alert);
    });

    // Paper Trading → Smart Alerts feedback
    this.paperTrading.on('paperTradeClosed', (event) => {
      this.updateSmartAlertPerformance(event);
    });

    // Portfolio Automation → Smart Alerts feedback
    this.portfolioAutomation.on('portfolioTradeClosed', (event) => {
      this.updateSmartAlertPerformance(event);
    });

    // Performance aggregation
    this.paperTrading.on('paperTradeExecuted', (event) => {
      this.aggregatePerformanceMetrics('paper', event);
    });

    this.portfolioAutomation.on('portfolioTradeExecuted', (event) => {
      this.aggregatePerformanceMetrics('portfolio', event);
    });
  }

  /**
   * Create integrated trading bot configuration
   */
  async createIntegratedTradingBot(userId, config) {
    try {
      const {
        name,
        description,
        initialBalance,
        tradingMode, // 'paper' | 'live' | 'both'
        strategies,
        riskSettings,
        alertSettings,
        autoExecution
      } = config;

      const botId = `bot_${userId}_${Date.now()}`;
      
      const botConfig = {
        id: botId,
        userId,
        name,
        description,
        tradingMode,
        strategies,
        riskSettings,
        alertSettings,
        autoExecution,
        createdAt: new Date(),
        isActive: false,
        components: {}
      };

      // Create paper trading account if needed
      if (tradingMode === 'paper' || tradingMode === 'both') {
        const paperAccountResult = await this.paperTrading.createPaperAccount(userId, {
          name: `${name} - Paper Account`,
          initialBalance,
          tradingPairs: config.tradingPairs || ['BTC/USD', 'ETH/USD', 'AAPL', 'GOOGL'],
          strategies,
          riskSettings,
          autoTrading: autoExecution
        });

        if (paperAccountResult.success) {
          botConfig.components.paperAccountId = paperAccountResult.accountId;
        }
      }

      // Create portfolio automation if needed
      if (tradingMode === 'live' || tradingMode === 'both') {
        const portfolioResult = await this.portfolioAutomation.createAutomatedPortfolio(userId, {
          name: `${name} - Live Portfolio`,
          description,
          strategies,
          allocation: this.calculateStrategyAllocation(strategies),
          riskSettings,
          autoRebalance: true,
          rebalanceFrequency: 'daily',
          initialCapital: initialBalance,
          userSubscription: { plan: 'professional' } // Default for integrated bots
        });

        if (portfolioResult.success) {
          botConfig.components.portfolioId = portfolioResult.portfolioId;
        }
      }

      // Store integration configuration
      this.activeIntegrations.set(botId, botConfig);

      this.logger?.info(`Created integrated trading bot ${botId} for user ${userId}`);
      this.emit('botCreated', { botId, userId, config: botConfig });

      return {
        success: true,
        botId,
        config: this.sanitizeBotConfigForClient(botConfig)
      };

    } catch (error) {
      this.logger?.error('Error creating integrated trading bot:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start integrated trading bot
   */
  async startIntegratedBot(botId, userId) {
    try {
      const botConfig = this.activeIntegrations.get(botId);
      
      if (!botConfig || botConfig.userId !== userId) {
        throw new Error('Bot not found or access denied');
      }

      if (botConfig.isActive) {
        throw new Error('Bot is already active');
      }

      // Start paper trading if configured
      if (botConfig.components.paperAccountId) {
        await this.paperTrading.startPaperTrading(botConfig.components.paperAccountId, userId);
      }

      // Start portfolio automation if configured
      if (botConfig.components.portfolioId) {
        await this.portfolioAutomation.startPortfolio(botConfig.components.portfolioId, userId);
      }

      botConfig.isActive = true;
      botConfig.startedAt = new Date();

      this.logger?.info(`Started integrated trading bot ${botId}`);
      this.emit('botStarted', { botId, userId });

      return { success: true, message: 'Integrated trading bot started successfully' };

    } catch (error) {
      this.logger?.error('Error starting integrated bot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop integrated trading bot
   */
  async stopIntegratedBot(botId, userId) {
    try {
      const botConfig = this.activeIntegrations.get(botId);
      
      if (!botConfig || botConfig.userId !== userId) {
        throw new Error('Bot not found or access denied');
      }

      // Stop paper trading if active
      if (botConfig.components.paperAccountId) {
        await this.paperTrading.stopPaperTrading(botConfig.components.paperAccountId, userId);
      }

      // Stop portfolio automation if active
      if (botConfig.components.portfolioId) {
        await this.portfolioAutomation.stopPortfolio(botConfig.components.portfolioId, userId);
      }

      botConfig.isActive = false;
      botConfig.stoppedAt = new Date();

      this.logger?.info(`Stopped integrated trading bot ${botId}`);
      this.emit('botStopped', { botId, userId });

      return { success: true, message: 'Integrated trading bot stopped successfully' };

    } catch (error) {
      this.logger?.error('Error stopping integrated bot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process smart alert for paper trading accounts
   */
  async processSmartAlertForPaperTrading(alert) {
    try {
      // Find bots that should process this alert for paper trading
      for (const [botId, botConfig] of this.activeIntegrations) {
        if (!botConfig.isActive || !botConfig.components.paperAccountId) continue;
        
        // Check if alert matches bot's strategies
        if (!botConfig.strategies.includes(alert.strategy)) continue;
        
        // Check alert settings
        if (alert.confidence < (botConfig.alertSettings?.minConfidence || 0.7)) continue;
        
        // The paper trading service will handle the alert automatically
        // through its smart alerts integration
        this.logger?.info(`Processing smart alert ${alert.id} for paper trading bot ${botId}`);
      }
      
    } catch (error) {
      this.logger?.error('Error processing smart alert for paper trading:', error);
    }
  }

  /**
   * Process smart alert for portfolio automation
   */
  async processSmartAlertForPortfolios(alert) {
    try {
      // Find bots that should process this alert for live trading
      for (const [botId, botConfig] of this.activeIntegrations) {
        if (!botConfig.isActive || !botConfig.components.portfolioId) continue;
        
        // Check if alert matches bot's strategies
        if (!botConfig.strategies.includes(alert.strategy)) continue;
        
        // Check alert settings
        if (alert.confidence < (botConfig.alertSettings?.minConfidence || 0.7)) continue;
        
        // Portfolio automation will handle the alert automatically
        // through its signal processing
        this.logger?.info(`Processing smart alert ${alert.id} for portfolio bot ${botId}`);
      }
      
    } catch (error) {
      this.logger?.error('Error processing smart alert for portfolios:', error);
    }
  }

  /**
   * Update smart alert performance based on trade results
   */
  updateSmartAlertPerformance(tradeEvent) {
    try {
      const { trade, pnl } = tradeEvent;
      
      // Find associated alert if trade has strategy information
      if (trade.strategy && trade.alertId) {
        const pnlPercent = (pnl / (trade.positionSize || trade.quantity * trade.executionPrice)) * 100;
        this.smartAlerts.updateSignalPerformance(trade.alertId, pnl, pnlPercent);
      }
      
    } catch (error) {
      this.logger?.error('Error updating smart alert performance:', error);
    }
  }

  /**
   * Aggregate performance metrics across services
   */
  aggregatePerformanceMetrics(serviceType, event) {
    try {
      const { trade, accountId, portfolioId } = event;
      const key = accountId || portfolioId;
      
      if (!this.performanceAggregator.has(key)) {
        this.performanceAggregator.set(key, {
          serviceType,
          totalTrades: 0,
          totalVolume: 0,
          totalPnL: 0,
          strategies: new Map()
        });
      }
      
      const metrics = this.performanceAggregator.get(key);
      metrics.totalTrades++;
      metrics.totalVolume += trade.quantity * trade.executionPrice;
      
      // Track strategy performance
      if (!metrics.strategies.has(trade.strategy)) {
        metrics.strategies.set(trade.strategy, {
          trades: 0,
          volume: 0,
          pnl: 0
        });
      }
      
      const strategyMetrics = metrics.strategies.get(trade.strategy);
      strategyMetrics.trades++;
      strategyMetrics.volume += trade.quantity * trade.executionPrice;
      
    } catch (error) {
      this.logger?.error('Error aggregating performance metrics:', error);
    }
  }

  /**
   * Get integrated bot performance
   */
  getIntegratedBotPerformance(botId) {
    const botConfig = this.activeIntegrations.get(botId);
    if (!botConfig) return null;

    const performance = {
      bot: this.sanitizeBotConfigForClient(botConfig),
      paper: null,
      portfolio: null,
      aggregated: null
    };

    // Get paper trading performance
    if (botConfig.components.paperAccountId) {
      performance.paper = this.paperTrading.getPaperAccountPerformance(
        botConfig.components.paperAccountId
      );
    }

    // Get portfolio performance
    if (botConfig.components.portfolioId) {
      performance.portfolio = this.portfolioAutomation.getPortfolioPerformance(
        botConfig.components.portfolioId
      );
    }

    // Calculate aggregated metrics
    performance.aggregated = this.calculateAggregatedMetrics(performance);

    return performance;
  }

  /**
   * Calculate strategy allocation for portfolio
   */
  calculateStrategyAllocation(strategies) {
    const allocation = {};
    const equalWeight = 100 / strategies.length;
    
    strategies.forEach(strategy => {
      allocation[strategy] = equalWeight;
    });
    
    return allocation;
  }

  /**
   * Calculate aggregated performance metrics
   */
  calculateAggregatedMetrics(performance) {
    const aggregated = {
      totalTrades: 0,
      totalPnL: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0
    };

    let totalWins = 0;
    let totalProfit = 0;
    let totalLoss = 0;

    // Aggregate paper trading metrics
    if (performance.paper?.account?.performance) {
      const p = performance.paper.account.performance;
      aggregated.totalTrades += p.totalTrades;
      aggregated.totalPnL += p.totalPnL;
      totalWins += p.winningTrades;
      totalProfit += p.averageWin * p.winningTrades;
      totalLoss += Math.abs(p.averageLoss * p.losingTrades);
      aggregated.maxDrawdown = Math.max(aggregated.maxDrawdown, p.maxDrawdown);
    }

    // Aggregate portfolio metrics
    if (performance.portfolio?.performance) {
      const p = performance.portfolio.performance;
      aggregated.totalTrades += p.totalTrades;
      aggregated.totalPnL += p.totalPnL;
      totalWins += p.winningTrades;
      // Add portfolio-specific metrics if available
    }

    // Calculate derived metrics
    if (aggregated.totalTrades > 0) {
      aggregated.winRate = totalWins / aggregated.totalTrades;
    }

    if (totalLoss > 0) {
      aggregated.profitFactor = totalProfit / totalLoss;
    }

    return aggregated;
  }

  /**
   * Sanitize bot config for client
   */
  sanitizeBotConfigForClient(botConfig) {
    return {
      id: botConfig.id,
      name: botConfig.name,
      description: botConfig.description,
      tradingMode: botConfig.tradingMode,
      strategies: botConfig.strategies,
      riskSettings: botConfig.riskSettings,
      alertSettings: botConfig.alertSettings,
      isActive: botConfig.isActive,
      createdAt: botConfig.createdAt,
      startedAt: botConfig.startedAt,
      stoppedAt: botConfig.stoppedAt
    };
  }

  /**
   * Get user's integrated bots
   */
  getUserIntegratedBots(userId) {
    return Array.from(this.activeIntegrations.values())
      .filter(bot => bot.userId === userId)
      .map(bot => this.sanitizeBotConfigForClient(bot));
  }
}

module.exports = TradingBotIntegrationService;
