/**
 * Safe Trading Configuration
 * Conservative settings to prevent over-trading and losses
 */

module.exports = {
    // CRITICAL: Position Limits
    maxTotalPositions: 10, // Maximum 10 positions at once
    maxPositionsPerSymbol: 1, // Only 1 position per symbol
    maxPositionsPerStrategy: 5, // Maximum 5 per strategy

    // Risk Management
    basePositionSize: 5000, // $5K per position (was $12.5K)
    riskPerTrade: 0.01, // 1% risk per trade (was 2%)
    maxDailyLoss: -5000, // Stop trading if lose $5K in a day
    maxPositionSize: 10000, // Maximum $10K per position

    // Strategy Settings
    enabledStrategies: ['aiSignals'], // Only use AI signals

    // AI Settings
    aiEnabled: false, // Use fallback AI (mock predictions)
    minAIConfidence: 0.80, // Require 80% confidence minimum

    // Trading Controls
    realTradingEnabled: false, // Paper trading only
    tradingPaused: false,

    // Profit/Loss Targets
    profitTarget: 0.05, // 5% profit target
    stopLoss: 0.012, // 1.2% stop loss (4.17:1 R:R)

    // Minimum wait between trades
    minTimeBetweenTrades: 30000, // 30 seconds between trades

    // Circuit breakers
    stopTradingOnDrawdown: true,
    maxDrawdownPercent: 0.10, // Stop if 10% drawdown

    // Performance targets
    targetWinRate: 0.50, // Target 50%+ win rate
    targetSharpeRatio: 1.5,
    maxDrawdown: 0.10
};
