// Realistic Dashboard 1 Performance Configuration
// Based on industry standards and achievable trading results

const REALISTIC_PERFORMANCE_CONFIG = {
  // Account Information (Realistic for successful trader)
  account: {
    initialBalance: 2500000.00,      // $2.5M starting capital
    currentBalance: 2650000.00,      // $2.65M current balance
    equity: 2825200.50,              // Including unrealized P&L
    margin: 125000.00,               // Margin used
    freeMargin: 2700200.50,          // Available margin
    marginLevel: 2260.16             // Healthy margin level
  },

  // Realistic Performance Metrics
  performance: {
    // Profit Metrics
    totalProfit: 487650.75,          // $487K total profit (19.5% return)
    realizedProfits: 312450.25,      // $312K realized
    unrealizedProfits: 175200.50,    // $175K unrealized
    dailyPnL: 3850.75,               // $3.8K daily average
    monthlyReturn: 0.185,            // 18.5% monthly return
    annualizedReturn: 0.245,         // 24.5% annualized (excellent)
    
    // Trading Statistics
    totalTrades: 2174,               // Total trades executed
    winningTrades: 1474,             // Winning trades
    losingTrades: 700,               // Losing trades
    winRate: 67.8,                   // 67.8% win rate (realistic)
    
    // Risk Metrics
    sharpeRatio: 2.34,               // 2.34 Sharpe (excellent)
    maxDrawdown: 0.085,              // 8.5% max drawdown
    profitFactor: 2.8,               // 2.8 profit factor
    avgWin: 485.30,                  // Average winning trade
    avgLoss: 173.25,                 // Average losing trade
    maxConsecutiveLosses: 7,         // Max consecutive losses
    
    // Position Management
    activePositions: 47,             // Current open positions
    maxPositions: 75,                // Maximum allowed positions
    avgPositionSize: 12500.00,       // Average position size
    maxPositionSize: 50000.00        // Maximum single position
  },

  // Strategy Performance (Realistic Win Rates)
  strategies: {
    trendFollowing: {
      name: "Trend Following",
      winRate: 72.5,                 // 72.5% win rate
      profit: 185420.30,             // $185K profit
      trades: 856,                   // Total trades
      confidence: 85,                // 85% confidence
      avgReturn: 0.0285,             // 2.85% avg return
      maxDrawdown: 0.065,            // 6.5% max drawdown
      sharpeRatio: 2.1               // 2.1 Sharpe ratio
    },
    
    meanReversion: {
      name: "Mean Reversion", 
      winRate: 68.2,                 // 68.2% win rate
      profit: 98750.25,              // $98K profit
      trades: 654,                   // Total trades
      confidence: 72,                // 72% confidence
      avgReturn: 0.0195,             // 1.95% avg return
      maxDrawdown: 0.045,            // 4.5% max drawdown
      sharpeRatio: 1.8               // 1.8 Sharpe ratio
    },
    
    volatilityBreakout: {
      name: "Volatility Breakout",
      winRate: 64.8,                 // 64.8% win rate
      profit: 78050.95,              // $78K profit
      trades: 432,                   // Total trades
      confidence: 91,                // 91% confidence
      avgReturn: 0.0425,             // 4.25% avg return
      maxDrawdown: 0.095,            // 9.5% max drawdown
      sharpeRatio: 2.6               // 2.6 Sharpe ratio
    },
    
    aiSignals: {
      name: "AI Signals",
      winRate: 71.3,                 // 71.3% win rate
      profit: 125430.25,             // $125K profit
      trades: 232,                   // Total trades
      confidence: 88,                // 88% confidence (LSTM + RL)
      avgReturn: 0.0385,             // 3.85% avg return
      maxDrawdown: 0.055,            // 5.5% max drawdown
      sharpeRatio: 2.9               // 2.9 Sharpe ratio
    }
  },

  // Daily Performance Breakdown
  dailyPerformance: {
    "2025-08-08": { pnl: 3850.75, trades: 12, winRate: 75.0 },
    "2025-08-07": { pnl: 2850.25, trades: 8, winRate: 62.5 },
    "2025-08-06": { pnl: 2450.50, trades: 10, winRate: 70.0 },
    "2025-08-05": { pnl: 4125.80, trades: 15, winRate: 80.0 },
    "2025-08-04": { pnl: 1875.30, trades: 6, winRate: 66.7 },
    "2025-08-03": { pnl: -1250.75, trades: 9, winRate: 44.4 },
    "2025-08-02": { pnl: 3275.45, trades: 11, winRate: 72.7 }
  },

  // Risk Management Settings
  riskManagement: {
    maxRiskPerTrade: 0.02,          // 2% max risk per trade
    maxDailyLoss: 0.05,             // 5% max daily loss
    maxDrawdown: 0.15,              // 15% max drawdown limit
    positionSizeLimit: 0.25,        // 25% max position size
    correlationLimit: 0.7,          // 70% max correlation
    leverageLimit: 3.0,             // 3:1 max leverage
    stopLossRequired: true,         // Stop loss mandatory
    takeProfitRatio: 2.5            // 2.5:1 reward:risk ratio
  },

  // Market Conditions
  marketConditions: {
    volatility: "MEDIUM",           // Current market volatility
    trend: "BULLISH",               // Overall market trend
    regime: "TRENDING",             // Market regime
    sentiment: 0.65,                // Market sentiment (0-1)
    liquidityScore: 0.85,           // Market liquidity
    correlationLevel: 0.45          // Cross-asset correlation
  },

  // Execution Metrics
  execution: {
    avgLatency: 125,                // 125μs average latency (realistic)
    p95Latency: 250,                // 250μs 95th percentile
    p99Latency: 450,                // 450μs 99th percentile
    slippageBps: 1.2,               // 1.2 bps average slippage
    fillRate: 0.987,                // 98.7% fill rate
    rejectionRate: 0.013,           // 1.3% rejection rate
    ordersPerSecond: 150,           // 150 orders/second (realistic)
    uptime: 0.9995                  // 99.95% uptime
  },

  // Benchmark Comparisons
  benchmarks: {
    sp500YTD: 0.125,                // S&P 500 YTD return
    outperformance: 0.12,           // 12% outperformance
    industryAvgSharpe: 1.2,         // Industry average Sharpe
    topQuartileReturn: 0.18,        // Top quartile return
    riskAdjustedRank: 15            // Top 15% risk-adjusted
  },

  // Realistic Targets
  targets: {
    monthlyReturn: 0.15,            // 15% monthly target
    annualReturn: 0.30,             // 30% annual target
    maxDrawdown: 0.12,              // 12% max drawdown target
    sharpeRatio: 2.5,               // 2.5 Sharpe target
    winRate: 0.70,                  // 70% win rate target
    profitFactor: 3.0,              // 3.0 profit factor target
    calmarRatio: 2.0                // 2.0 Calmar ratio target
  }
};

// Export configuration
module.exports = REALISTIC_PERFORMANCE_CONFIG;

// Helper functions for dashboard display
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

const formatPercentage = (value) => {
  return `${(value * 100).toFixed(2)}%`;
};

const getPerformanceColor = (value, benchmark) => {
  return value >= benchmark ? '#22c55e' : value >= benchmark * 0.8 ? '#f59e0b' : '#ef4444';
};

// Performance validation
const validatePerformance = (metrics) => {
  const warnings = [];
  
  if (metrics.winRate < 0.55) {
    warnings.push('Win rate below 55% - consider strategy adjustment');
  }
  
  if (metrics.sharpeRatio < 1.0) {
    warnings.push('Sharpe ratio below 1.0 - risk-adjusted returns need improvement');
  }
  
  if (metrics.maxDrawdown > 0.20) {
    warnings.push('Max drawdown exceeds 20% - implement stronger risk controls');
  }
  
  return warnings;
};

module.exports = {
  REALISTIC_PERFORMANCE_CONFIG,
  formatCurrency,
  formatPercentage,
  getPerformanceColor,
  validatePerformance
};
