// Paper Trading Service with Realistic Simulation
// Implements paper trading with slippage, realistic P&L tracking, and performance metrics

const EventEmitter = require('events');
const SmartAlertsService = require('./SmartAlertsService');

class PaperTradingService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.smartAlerts = new SmartAlertsService(options);
    this.marketDataService = options.marketDataService;
    
    // Paper trading configuration based on research
    this.config = {
      slippage: {
        stocks: 0.001, // 0.1% slippage for stocks
        crypto: 0.005, // 0.5% slippage for crypto
        forex: 0.0002, // 0.02% slippage for forex
        commodities: 0.003 // 0.3% slippage for commodities
      },
      latency: {
        min: 50, // 50ms minimum execution delay
        max: 200 // 200ms maximum execution delay
      },
      fees: {
        stocks: 0.0005, // 0.05% trading fee
        crypto: 0.001, // 0.1% trading fee
        forex: 0.0001, // 0.01% trading fee
        commodities: 0.0008 // 0.08% trading fee
      }
    };
    
    // Active paper trading accounts
    this.paperAccounts = new Map();
    this.paperTrades = new Map();
    this.paperPositions = new Map();
    this.performanceHistory = new Map();
    
    // Initialize smart alerts integration
    this.smartAlerts.on('smartAlert', (alert) => {
      this.processPaperAlert(alert);
    });
    
    this.startPaperTradingEngine();
  }

  /**
   * Create paper trading account
   */
  async createPaperAccount(userId, accountConfig) {
    try {
      const {
        name,
        initialBalance,
        tradingPairs,
        strategies,
        riskSettings,
        autoTrading
      } = accountConfig;

      const accountId = `paper_${userId}_${Date.now()}`;
      
      const paperAccount = {
        id: accountId,
        userId,
        name,
        initialBalance,
        currentBalance: initialBalance,
        equity: initialBalance,
        margin: 0,
        freeMargin: initialBalance,
        tradingPairs: tradingPairs || ['BTC/USD', 'ETH/USD', 'AAPL', 'GOOGL'],
        strategies: strategies || [],
        riskSettings: {
          maxRiskPerTrade: riskSettings?.maxRiskPerTrade || 2, // 2%
          maxDrawdown: riskSettings?.maxDrawdown || 10, // 10%
          maxConcurrentTrades: riskSettings?.maxConcurrentTrades || 5,
          stopLoss: riskSettings?.stopLoss || 5, // 5%
          takeProfit: riskSettings?.takeProfit || 15 // 15%
        },
        autoTrading: autoTrading || false,
        
        // Performance tracking
        performance: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          totalPnL: 0,
          totalPnLPercent: 0,
          maxDrawdown: 0,
          profitFactor: 0,
          sharpeRatio: 0,
          averageWin: 0,
          averageLoss: 0,
          largestWin: 0,
          largestLoss: 0
        },
        
        // Account status
        isActive: false,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.paperAccounts.set(accountId, paperAccount);
      this.paperPositions.set(accountId, new Map());
      this.performanceHistory.set(accountId, []);

      this.logger?.info(`Created paper trading account ${accountId} for user ${userId}`);
      this.emit('paperAccountCreated', { accountId, userId, account: paperAccount });

      return {
        success: true,
        accountId,
        account: this.sanitizeAccountForClient(paperAccount)
      };

    } catch (error) {
      this.logger?.error('Error creating paper account:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Start paper trading for an account
   */
  async startPaperTrading(accountId, userId) {
    try {
      const account = this.paperAccounts.get(accountId);
      
      if (!account || account.userId !== userId) {
        throw new Error('Paper account not found or access denied');
      }

      if (account.isActive) {
        throw new Error('Paper trading is already active');
      }

      account.isActive = true;
      account.startedAt = new Date();
      account.lastActivity = new Date();

      // Start monitoring for auto trading
      if (account.autoTrading) {
        this.startAccountMonitoring(accountId);
      }

      this.logger?.info(`Started paper trading for account ${accountId}`);
      this.emit('paperTradingStarted', { accountId, userId });

      return { success: true, message: 'Paper trading started successfully' };

    } catch (error) {
      this.logger?.error('Error starting paper trading:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Execute paper trade with realistic simulation
   */
  async executePaperTrade(accountId, tradeRequest) {
    try {
      const account = this.paperAccounts.get(accountId);
      if (!account || !account.isActive) {
        throw new Error('Paper account not found or inactive');
      }

      const {
        symbol,
        side, // 'BUY' or 'SELL'
        quantity,
        orderType, // 'MARKET', 'LIMIT', 'STOP'
        price,
        stopLoss,
        takeProfit,
        strategy
      } = tradeRequest;

      // Get current market data
      const marketData = await this.getMarketData(symbol);
      const currentPrice = marketData.price;

      // Calculate realistic execution price with slippage
      const executionPrice = this.calculateExecutionPrice(currentPrice, side, symbol, quantity);
      
      // Simulate execution delay
      await this.simulateExecutionDelay();

      // Calculate position size and validate
      const positionValue = quantity * executionPrice;
      const requiredMargin = this.calculateRequiredMargin(symbol, positionValue);

      if (requiredMargin > account.freeMargin) {
        throw new Error('Insufficient margin for trade');
      }

      // Calculate fees
      const fees = this.calculateTradingFees(symbol, positionValue);

      // Create paper trade
      const tradeId = `trade_${accountId}_${Date.now()}`;
      const paperTrade = {
        id: tradeId,
        accountId,
        symbol,
        side,
        quantity,
        orderType,
        requestedPrice: price,
        executionPrice,
        slippage: Math.abs(executionPrice - currentPrice) / currentPrice,
        fees,
        stopLoss,
        takeProfit,
        strategy: strategy || 'Manual',
        
        // Trade status
        status: 'OPEN',
        openTime: new Date(),
        closeTime: null,
        
        // P&L tracking
        unrealizedPnL: 0,
        realizedPnL: 0,
        commission: fees,
        
        // Performance
        maxFavorableExcursion: 0,
        maxAdverseExcursion: 0
      };

      // Update account balances
      account.currentBalance -= fees;
      account.freeMargin -= requiredMargin;
      account.lastActivity = new Date();

      // Store trade and position
      this.paperTrades.set(tradeId, paperTrade);
      const positions = this.paperPositions.get(accountId);
      positions.set(tradeId, paperTrade);

      // Update account performance
      account.performance.totalTrades++;

      this.logger?.info(`Executed paper trade ${tradeId}: ${side} ${quantity} ${symbol} at ${executionPrice}`);
      this.emit('paperTradeExecuted', { tradeId, trade: paperTrade, accountId });

      return {
        success: true,
        tradeId,
        trade: this.sanitizeTradeForClient(paperTrade)
      };

    } catch (error) {
      this.logger?.error('Error executing paper trade:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Close paper trade
   */
  async closePaperTrade(tradeId, accountId, closePrice = null) {
    try {
      const trade = this.paperTrades.get(tradeId);
      if (!trade || trade.accountId !== accountId) {
        throw new Error('Trade not found or access denied');
      }

      if (trade.status !== 'OPEN') {
        throw new Error('Trade is not open');
      }

      const account = this.paperAccounts.get(accountId);
      if (!account) {
        throw new Error('Account not found');
      }

      // Get current market price if not provided
      if (!closePrice) {
        const marketData = await this.getMarketData(trade.symbol);
        closePrice = marketData.price;
      }

      // Calculate realistic close price with slippage
      const executionClosePrice = this.calculateExecutionPrice(closePrice, trade.side === 'BUY' ? 'SELL' : 'BUY', trade.symbol, trade.quantity);
      
      // Simulate execution delay
      await this.simulateExecutionDelay();

      // Calculate P&L
      const pnl = this.calculatePnL(trade, executionClosePrice);
      const fees = this.calculateTradingFees(trade.symbol, trade.quantity * executionClosePrice);
      const netPnL = pnl - fees;

      // Update trade
      trade.status = 'CLOSED';
      trade.closeTime = new Date();
      trade.closePrice = executionClosePrice;
      trade.realizedPnL = netPnL;
      trade.commission += fees;

      // Update account balances
      const positionValue = trade.quantity * trade.executionPrice;
      const requiredMargin = this.calculateRequiredMargin(trade.symbol, positionValue);
      
      account.currentBalance += netPnL;
      account.equity = account.currentBalance;
      account.freeMargin += requiredMargin;
      account.lastActivity = new Date();

      // Update performance metrics
      this.updateAccountPerformance(accountId, trade, netPnL);

      // Remove from active positions
      const positions = this.paperPositions.get(accountId);
      positions.delete(tradeId);

      this.logger?.info(`Closed paper trade ${tradeId}: P&L ${netPnL.toFixed(2)}`);
      this.emit('paperTradeClosed', { tradeId, trade, accountId, pnl: netPnL });

      return {
        success: true,
        trade: this.sanitizeTradeForClient(trade),
        pnl: netPnL
      };

    } catch (error) {
      this.logger?.error('Error closing paper trade:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Process smart alert for paper trading
   */
  async processPaperAlert(alert) {
    try {
      // Find accounts that should trade this alert
      for (const [accountId, account] of this.paperAccounts) {
        if (!account.isActive || !account.autoTrading) continue;

        // Check if symbol is in trading pairs
        if (!account.tradingPairs.includes(alert.symbol)) continue;

        // Check if strategy is enabled
        if (account.strategies.length > 0 && !account.strategies.includes(alert.strategy)) continue;

        // Check risk limits
        const positions = this.paperPositions.get(accountId);
        if (positions.size >= account.riskSettings.maxConcurrentTrades) continue;

        // Calculate position size based on risk settings
        const riskAmount = account.currentBalance * (account.riskSettings.maxRiskPerTrade / 100);
        const stopDistance = Math.abs(alert.entry.trigger - alert.stopLoss.price);
        const quantity = stopDistance > 0 ? riskAmount / stopDistance : 0;

        if (quantity <= 0) continue;

        // Execute paper trade
        const tradeRequest = {
          symbol: alert.symbol,
          side: alert.signal,
          quantity,
          orderType: 'MARKET',
          price: alert.entry.trigger,
          stopLoss: alert.stopLoss.price,
          takeProfit: alert.takeProfit.price,
          strategy: alert.strategy
        };

        await this.executePaperTrade(accountId, tradeRequest);
      }

    } catch (error) {
      this.logger?.error('Error processing paper alert:', error);
    }
  }

  /**
   * Calculate execution price with realistic slippage
   */
  calculateExecutionPrice(marketPrice, side, symbol, quantity) {
    const assetType = this.getAssetType(symbol);
    const slippageRate = this.config.slippage[assetType] || 0.001;

    // Increase slippage for larger orders
    const sizeMultiplier = Math.min(1 + (quantity / 1000000), 2); // Max 2x slippage
    const totalSlippage = slippageRate * sizeMultiplier;

    if (side === 'BUY') {
      return marketPrice * (1 + totalSlippage);
    } else {
      return marketPrice * (1 - totalSlippage);
    }
  }

  /**
   * Simulate realistic execution delay
   */
  async simulateExecutionDelay() {
    const delay = this.config.latency.min +
      Math.random() * (this.config.latency.max - this.config.latency.min);

    return new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Calculate trading fees
   */
  calculateTradingFees(symbol, positionValue) {
    const assetType = this.getAssetType(symbol);
    const feeRate = this.config.fees[assetType] || 0.001;
    return positionValue * feeRate;
  }

  /**
   * Calculate required margin
   */
  calculateRequiredMargin(symbol, positionValue) {
    const assetType = this.getAssetType(symbol);

    // Different margin requirements by asset type
    const marginRates = {
      stocks: 0.5, // 50% margin for stocks
      crypto: 1.0, // 100% margin for crypto (no leverage)
      forex: 0.02, // 2% margin for forex (50:1 leverage)
      commodities: 0.1 // 10% margin for commodities
    };

    const marginRate = marginRates[assetType] || 1.0;
    return positionValue * marginRate;
  }

  /**
   * Calculate P&L for a trade
   */
  calculatePnL(trade, closePrice) {
    const direction = trade.side === 'BUY' ? 1 : -1;
    const priceDiff = closePrice - trade.executionPrice;
    return direction * priceDiff * trade.quantity;
  }

  /**
   * Get asset type from symbol
   */
  getAssetType(symbol) {
    if (symbol.includes('/')) {
      if (symbol.includes('USD') || symbol.includes('EUR') || symbol.includes('GBP')) {
        if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('ADA')) {
          return 'crypto';
        }
        return 'forex';
      }
      return 'crypto';
    } else if (symbol.includes('Gold') || symbol.includes('Oil') || symbol.includes('Silver')) {
      return 'commodities';
    }
    return 'stocks';
  }

  /**
   * Update account performance metrics
   */
  updateAccountPerformance(accountId, trade, pnl) {
    const account = this.paperAccounts.get(accountId);
    if (!account) return;

    const perf = account.performance;

    // Update trade counts
    if (pnl > 0) {
      perf.winningTrades++;
      perf.averageWin = ((perf.averageWin * (perf.winningTrades - 1)) + pnl) / perf.winningTrades;
      perf.largestWin = Math.max(perf.largestWin, pnl);
    } else {
      perf.losingTrades++;
      perf.averageLoss = ((perf.averageLoss * (perf.losingTrades - 1)) + Math.abs(pnl)) / perf.losingTrades;
      perf.largestLoss = Math.min(perf.largestLoss, pnl);
    }

    // Update overall metrics
    perf.winRate = perf.winningTrades / perf.totalTrades;
    perf.totalPnL += pnl;
    perf.totalPnLPercent = (perf.totalPnL / account.initialBalance) * 100;

    // Calculate profit factor
    const totalProfit = perf.averageWin * perf.winningTrades;
    const totalLoss = perf.averageLoss * perf.losingTrades;
    perf.profitFactor = totalLoss > 0 ? totalProfit / totalLoss : 999;

    // Update drawdown
    const currentEquity = account.currentBalance;
    const peak = Math.max(account.initialBalance, currentEquity);
    const drawdown = ((peak - currentEquity) / peak) * 100;
    perf.maxDrawdown = Math.max(perf.maxDrawdown, drawdown);

    // Store performance snapshot
    const history = this.performanceHistory.get(accountId) || [];
    history.push({
      timestamp: new Date(),
      balance: account.currentBalance,
      equity: account.equity,
      pnl: perf.totalPnL,
      pnlPercent: perf.totalPnLPercent,
      drawdown: drawdown,
      winRate: perf.winRate
    });

    // Keep only last 1000 snapshots
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    this.performanceHistory.set(accountId, history);
  }

  /**
   * Get market data (simplified for demo)
   */
  async getMarketData(symbol) {
    // In production, this would fetch real market data
    const basePrice = this.getBasePrice(symbol);
    const price = basePrice * (1 + (Math.random() - 0.5) * 0.02); // ±1% random movement

    return {
      symbol,
      price,
      bid: price * 0.9995,
      ask: price * 1.0005,
      timestamp: Date.now()
    };
  }

  /**
   * Get base price for symbol
   */
  getBasePrice(symbol) {
    const prices = {
      'BTC/USD': 43250,
      'ETH/USD': 2650,
      'AAPL': 185.50,
      'GOOGL': 142.30,
      'TSLA': 248.50,
      'MSFT': 378.85,
      'EUR/USD': 1.0850,
      'GBP/USD': 1.2720,
      'Gold': 2020.50,
      'Oil': 78.25
    };
    return prices[symbol] || 100;
  }

  /**
   * Start account monitoring for auto trading
   */
  startAccountMonitoring(accountId) {
    const account = this.paperAccounts.get(accountId);
    if (!account) return;

    // Monitor every 30 seconds
    const monitoringInterval = setInterval(async () => {
      if (!account.isActive) {
        clearInterval(monitoringInterval);
        return;
      }

      try {
        await this.updateOpenPositions(accountId);
        await this.checkStopLossAndTakeProfit(accountId);
        await this.checkRiskLimits(accountId);
      } catch (error) {
        this.logger?.error(`Error monitoring paper account ${accountId}:`, error);
      }
    }, 30000);

    // Store interval for cleanup
    account.monitoringInterval = monitoringInterval;
  }

  /**
   * Update open positions with current market prices
   */
  async updateOpenPositions(accountId) {
    const positions = this.paperPositions.get(accountId);
    if (!positions) return;

    for (const [tradeId, trade] of positions) {
      if (trade.status !== 'OPEN') continue;

      try {
        const marketData = await this.getMarketData(trade.symbol);
        const currentPrice = marketData.price;

        // Calculate unrealized P&L
        const unrealizedPnL = this.calculatePnL(trade, currentPrice);
        trade.unrealizedPnL = unrealizedPnL;

        // Track max favorable/adverse excursion
        if (unrealizedPnL > trade.maxFavorableExcursion) {
          trade.maxFavorableExcursion = unrealizedPnL;
        }
        if (unrealizedPnL < trade.maxAdverseExcursion) {
          trade.maxAdverseExcursion = unrealizedPnL;
        }

      } catch (error) {
        this.logger?.error(`Error updating position ${tradeId}:`, error);
      }
    }
  }

  /**
   * Check stop loss and take profit levels
   */
  async checkStopLossAndTakeProfit(accountId) {
    const positions = this.paperPositions.get(accountId);
    if (!positions) return;

    for (const [tradeId, trade] of positions) {
      if (trade.status !== 'OPEN') continue;

      try {
        const marketData = await this.getMarketData(trade.symbol);
        const currentPrice = marketData.price;

        let shouldClose = false;
        let closeReason = '';

        // Check stop loss
        if (trade.stopLoss) {
          if ((trade.side === 'BUY' && currentPrice <= trade.stopLoss) ||
              (trade.side === 'SELL' && currentPrice >= trade.stopLoss)) {
            shouldClose = true;
            closeReason = 'Stop Loss';
          }
        }

        // Check take profit
        if (trade.takeProfit && !shouldClose) {
          if ((trade.side === 'BUY' && currentPrice >= trade.takeProfit) ||
              (trade.side === 'SELL' && currentPrice <= trade.takeProfit)) {
            shouldClose = true;
            closeReason = 'Take Profit';
          }
        }

        if (shouldClose) {
          trade.closeReason = closeReason;
          await this.closePaperTrade(tradeId, accountId, currentPrice);
        }

      } catch (error) {
        this.logger?.error(`Error checking SL/TP for trade ${tradeId}:`, error);
      }
    }
  }

  /**
   * Check risk limits for account
   */
  async checkRiskLimits(accountId) {
    const account = this.paperAccounts.get(accountId);
    if (!account) return;

    // Check max drawdown
    const currentEquity = account.currentBalance;
    const peak = Math.max(account.initialBalance, currentEquity);
    const drawdown = ((peak - currentEquity) / peak) * 100;

    if (drawdown > account.riskSettings.maxDrawdown) {
      this.logger?.warn(`Account ${accountId} exceeded max drawdown limit`);
      await this.stopPaperTrading(accountId, account.userId);
    }
  }

  /**
   * Stop paper trading
   */
  async stopPaperTrading(accountId, userId) {
    try {
      const account = this.paperAccounts.get(accountId);

      if (!account || account.userId !== userId) {
        throw new Error('Account not found or access denied');
      }

      account.isActive = false;
      account.stoppedAt = new Date();

      // Close all open positions
      const positions = this.paperPositions.get(accountId);
      if (positions) {
        for (const [tradeId] of positions) {
          await this.closePaperTrade(tradeId, accountId);
        }
      }

      // Stop monitoring
      if (account.monitoringInterval) {
        clearInterval(account.monitoringInterval);
        delete account.monitoringInterval;
      }

      this.logger?.info(`Stopped paper trading for account ${accountId}`);
      this.emit('paperTradingStopped', { accountId, userId });

      return { success: true, message: 'Paper trading stopped successfully' };

    } catch (error) {
      this.logger?.error('Error stopping paper trading:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get paper account performance
   */
  getPaperAccountPerformance(accountId) {
    const account = this.paperAccounts.get(accountId);
    if (!account) return null;

    const history = this.performanceHistory.get(accountId) || [];
    const positions = this.paperPositions.get(accountId) || new Map();

    return {
      account: this.sanitizeAccountForClient(account),
      performanceHistory: history,
      openPositions: Array.from(positions.values()).map(trade => this.sanitizeTradeForClient(trade))
    };
  }

  /**
   * Sanitize account data for client
   */
  sanitizeAccountForClient(account) {
    return {
      id: account.id,
      name: account.name,
      initialBalance: account.initialBalance,
      currentBalance: account.currentBalance,
      equity: account.equity,
      freeMargin: account.freeMargin,
      performance: account.performance,
      riskSettings: account.riskSettings,
      isActive: account.isActive,
      createdAt: account.createdAt,
      lastActivity: account.lastActivity
    };
  }

  /**
   * Sanitize trade data for client
   */
  sanitizeTradeForClient(trade) {
    return {
      id: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      quantity: trade.quantity,
      executionPrice: trade.executionPrice,
      currentPrice: trade.currentPrice,
      unrealizedPnL: trade.unrealizedPnL,
      realizedPnL: trade.realizedPnL,
      stopLoss: trade.stopLoss,
      takeProfit: trade.takeProfit,
      status: trade.status,
      openTime: trade.openTime,
      closeTime: trade.closeTime,
      strategy: trade.strategy
    };
  }

  /**
   * Start the paper trading engine
   */
  startPaperTradingEngine() {
    this.logger?.info('📊 Paper Trading Service started');

    // Clean up inactive accounts every hour
    setInterval(() => {
      this.cleanupInactiveAccounts();
    }, 3600000);
  }

  /**
   * Clean up inactive accounts
   */
  cleanupInactiveAccounts() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30); // 30 days ago

    for (const [accountId, account] of this.paperAccounts) {
      if (!account.isActive && account.stoppedAt && account.stoppedAt < cutoffDate) {
        this.paperAccounts.delete(accountId);
        this.paperPositions.delete(accountId);
        this.performanceHistory.delete(accountId);
        this.logger?.info(`Cleaned up inactive paper account ${accountId}`);
      }
    }
  }
}

module.exports = PaperTradingService;
