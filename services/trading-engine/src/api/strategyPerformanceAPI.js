// Strategy Performance API
// Provides real-time strategy performance data to frontend

const express = require('express');
const router = express.Router();
const StrategyValidator = require('../validation/StrategyValidator');
const HighWinRateStrategies = require('../strategies/HighWinRateStrategies');

class StrategyPerformanceAPI {
  constructor(options = {}) {
    this.validator = new StrategyValidator(options);
    this.strategies = new HighWinRateStrategies(options);
    this.logger = options.logger;
    
    // Initialize with mock historical data for demonstration
    this.initializeMockData();
    
    // Set up real-time updates
    this.setupRealTimeUpdates();
  }

  /**
   * Initialize mock historical data for demonstration
   */
  initializeMockData() {
    const mockTrades = this.generateMockTradeHistory();
    
    // Record mock trades for each strategy
    Object.entries(mockTrades).forEach(([strategyName, trades]) => {
      trades.forEach(trade => {
        this.validator.recordTradeResult(strategyName, trade);
      });
    });
  }

  /**
   * Generate realistic mock trade history
   */
  generateMockTradeHistory() {
    const strategies = {
      'MultiConfirmationMomentum': { winRate: 0.873, avgWin: 0.0375, avgLoss: -0.015 },
      'MeanReversionScalping': { winRate: 0.912, avgWin: 0.012, avgLoss: -0.008 },
      'InstitutionalOrderFlow': { winRate: 0.847, avgWin: 0.06, avgLoss: -0.02 },
      'AIPatternRecognition': { winRate: 0.889, avgWin: 0.044, avgLoss: -0.018 },
      'StatisticalArbitrage': { winRate: 0.934, avgWin: 0.018, avgLoss: -0.012 }
    };

    const mockTrades = {};

    Object.entries(strategies).forEach(([strategyName, config]) => {
      const trades = [];
      const numTrades = Math.floor(Math.random() * 500) + 200; // 200-700 trades
      
      for (let i = 0; i < numTrades; i++) {
        const isWin = Math.random() < config.winRate;
        const baseCapital = 10000;
        
        const pnlPercent = isWin 
          ? config.avgWin * (0.8 + Math.random() * 0.4) // ±20% variation
          : config.avgLoss * (0.8 + Math.random() * 0.4);
        
        const pnl = baseCapital * pnlPercent;
        
        // Generate timestamp (last 90 days)
        const timestamp = new Date();
        timestamp.setDate(timestamp.getDate() - Math.floor(Math.random() * 90));
        
        trades.push({
          id: `${strategyName}_${i}`,
          symbol: this.getRandomSymbol(),
          side: Math.random() > 0.5 ? 'buy' : 'sell',
          entry: 100 + Math.random() * 50,
          exit: 100 + Math.random() * 50,
          pnl,
          pnlPercent,
          capital: baseCapital,
          timestamp,
          duration: Math.floor(Math.random() * 3600) + 300 // 5 minutes to 1 hour
        });
      }
      
      // Sort by timestamp
      trades.sort((a, b) => a.timestamp - b.timestamp);
      mockTrades[strategyName] = trades;
    });

    return mockTrades;
  }

  getRandomSymbol() {
    const symbols = ['BTC/USD', 'ETH/USD', 'AAPL', 'GOOGL', 'TSLA', 'SPY', 'QQQ', 'SOL/USD', 'ADA/USD'];
    return symbols[Math.floor(Math.random() * symbols.length)];
  }

  /**
   * Set up real-time performance updates
   */
  setupRealTimeUpdates() {
    // Simulate real-time trades every 30 seconds
    setInterval(() => {
      this.simulateRealTimeTrade();
    }, 30000);
  }

  /**
   * Simulate a real-time trade for demonstration
   */
  simulateRealTimeTrade() {
    const strategies = ['MultiConfirmationMomentum', 'MeanReversionScalping', 'InstitutionalOrderFlow', 'AIPatternRecognition', 'StatisticalArbitrage'];
    const strategyName = strategies[Math.floor(Math.random() * strategies.length)];
    
    const strategyConfigs = {
      'MultiConfirmationMomentum': { winRate: 0.873, avgWin: 0.0375, avgLoss: -0.015 },
      'MeanReversionScalping': { winRate: 0.912, avgWin: 0.012, avgLoss: -0.008 },
      'InstitutionalOrderFlow': { winRate: 0.847, avgWin: 0.06, avgLoss: -0.02 },
      'AIPatternRecognition': { winRate: 0.889, avgWin: 0.044, avgLoss: -0.018 },
      'StatisticalArbitrage': { winRate: 0.934, avgWin: 0.018, avgLoss: -0.012 }
    };
    
    const config = strategyConfigs[strategyName];
    const isWin = Math.random() < config.winRate;
    const baseCapital = 10000;
    
    const pnlPercent = isWin 
      ? config.avgWin * (0.8 + Math.random() * 0.4)
      : config.avgLoss * (0.8 + Math.random() * 0.4);
    
    const trade = {
      id: `live_${Date.now()}`,
      symbol: this.getRandomSymbol(),
      side: Math.random() > 0.5 ? 'buy' : 'sell',
      entry: 100 + Math.random() * 50,
      exit: 100 + Math.random() * 50,
      pnl: baseCapital * pnlPercent,
      pnlPercent,
      capital: baseCapital,
      timestamp: new Date(),
      duration: Math.floor(Math.random() * 1800) + 300
    };
    
    this.validator.recordTradeResult(strategyName, trade);
    
    this.logger?.info(`Simulated trade for ${strategyName}:`, {
      symbol: trade.symbol,
      pnl: trade.pnl.toFixed(2),
      pnlPercent: (trade.pnlPercent * 100).toFixed(2) + '%'
    });
  }

  /**
   * Get API routes
   */
  getRoutes() {
    // Get all strategy performances
    router.get('/strategies/performance', async (req, res) => {
      try {
        const performances = await this.validator.getAllStrategyPerformances();
        
        // Add additional metrics for frontend display
        const enhancedPerformances = {};
        Object.entries(performances).forEach(([strategyName, performance]) => {
          enhancedPerformances[strategyName] = {
            ...performance,
            healthScore: this.validator.getStrategyHealthScore(strategyName),
            shouldPause: this.validator.shouldPauseStrategy(strategyName),
            recentPerformance: this.validator.getRecentPerformance(strategyName, 7)
          };
        });
        
        res.json({
          success: true,
          data: enhancedPerformances,
          timestamp: new Date()
        });
      } catch (error) {
        this.logger?.error('Error getting strategy performances:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get specific strategy performance
    router.get('/strategies/:strategyName/performance', async (req, res) => {
      try {
        const { strategyName } = req.params;
        const performance = await this.validator.getStrategyPerformance(strategyName);
        
        if (!performance) {
          return res.status(404).json({
            success: false,
            error: 'Strategy not found'
          });
        }
        
        const recentPerformance = await this.validator.getRecentPerformance(strategyName, 7);
        const trades = this.validator.getTradeHistory(strategyName);
        
        res.json({
          success: true,
          data: {
            ...performance,
            healthScore: this.validator.getStrategyHealthScore(strategyName),
            shouldPause: this.validator.shouldPauseStrategy(strategyName),
            recentPerformance,
            recentTrades: trades.slice(-20), // Last 20 trades
            monthlyReturns: this.calculateMonthlyReturns(trades)
          }
        });
      } catch (error) {
        this.logger?.error('Error getting strategy performance:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get live trading results
    router.get('/strategies/live-results', async (req, res) => {
      try {
        const performances = await this.validator.getAllStrategyPerformances();
        const liveResults = {};
        
        Object.entries(performances).forEach(([strategyName, performance]) => {
          const trades = this.validator.getTradeHistory(strategyName);
          const todayTrades = trades.filter(trade => {
            const today = new Date();
            const tradeDate = new Date(trade.timestamp);
            return tradeDate.toDateString() === today.toDateString();
          });
          
          const todayPnL = todayTrades.reduce((sum, trade) => sum + trade.pnl, 0);
          const todayWinRate = todayTrades.length > 0 
            ? todayTrades.filter(trade => trade.pnl > 0).length / todayTrades.length 
            : 0;
          
          liveResults[strategyName] = {
            todayPnL,
            todayWinRate,
            todayTrades: todayTrades.length,
            recentTrades: trades.slice(-5),
            performance: {
              winRate: performance.winRate,
              totalTrades: performance.totalTrades,
              profitFactor: performance.profitFactor
            }
          };
        });
        
        res.json({
          success: true,
          data: liveResults,
          timestamp: new Date()
        });
      } catch (error) {
        this.logger?.error('Error getting live results:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Validate strategy before trade execution
    router.post('/strategies/:strategyName/validate', async (req, res) => {
      try {
        const { strategyName } = req.params;
        const { signal } = req.body;
        
        const validation = await this.validator.validateStrategy(strategyName, signal);
        
        res.json({
          success: true,
          data: validation
        });
      } catch (error) {
        this.logger?.error('Error validating strategy:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Record trade result
    router.post('/strategies/:strategyName/trades', async (req, res) => {
      try {
        const { strategyName } = req.params;
        const tradeResult = req.body;
        
        this.validator.recordTradeResult(strategyName, tradeResult);
        
        res.json({
          success: true,
          message: 'Trade result recorded successfully'
        });
      } catch (error) {
        this.logger?.error('Error recording trade result:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get strategy health scores
    router.get('/strategies/health', async (req, res) => {
      try {
        const performances = await this.validator.getAllStrategyPerformances();
        const healthScores = {};
        
        Object.keys(performances).forEach(strategyName => {
          healthScores[strategyName] = {
            score: this.validator.getStrategyHealthScore(strategyName),
            shouldPause: this.validator.shouldPauseStrategy(strategyName),
            performance: performances[strategyName]
          };
        });
        
        res.json({
          success: true,
          data: healthScores
        });
      } catch (error) {
        this.logger?.error('Error getting strategy health:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    return router;
  }

  /**
   * Calculate monthly returns for charting
   */
  calculateMonthlyReturns(trades) {
    const monthlyData = {};
    
    trades.forEach(trade => {
      const date = new Date(trade.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { pnl: 0, trades: 0 };
      }
      
      monthlyData[monthKey].pnl += trade.pnl;
      monthlyData[monthKey].trades += 1;
    });
    
    return Object.entries(monthlyData)
      .map(([month, data]) => ({
        month,
        return: (data.pnl / 10000) * 100, // Convert to percentage
        trades: data.trades
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }
}

module.exports = StrategyPerformanceAPI;
