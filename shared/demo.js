#!/usr/bin/env node
/**
 * NexusTradeAI Shared Library Demo
 * Demonstrates the functionality of the shared trading library
 */

const { 
  MarketCalculations, 
  TechnicalIndicators, 
  Validators,
  Formatters,
  DateTime,
  MarketConstants 
} = require('./index');

console.log('🚀 NexusTradeAI Shared Library Demo\n');

// Demo 1: Market Calculations
console.log('📊 Market Calculations Demo:');
console.log('================================');

// Position sizing calculation
const positionSize = MarketCalculations.calculatePositionSize(
  100000, // $100k account
  2,      // 2% risk
  150.50, // Entry price
  147.00  // Stop loss
);

console.log('Position Size Calculation:');
console.log(`- Account Balance: ${Formatters.currency(100000)}`);
console.log(`- Risk Percentage: 2%`);
console.log(`- Entry Price: ${Formatters.price(150.50)}`);
console.log(`- Stop Loss: ${Formatters.price(147.00)}`);
console.log(`- Recommended Shares: ${Math.round(positionSize.shares)}`);
console.log(`- Risk Amount: ${Formatters.currency(positionSize.riskAmount)}`);
console.log(`- Position Value: ${Formatters.currency(positionSize.positionValue)}\n`);

// Portfolio metrics
const positions = [
  { symbol: 'AAPL', entryPrice: 150, currentPrice: 155, quantity: 100, side: 'long' },
  { symbol: 'GOOGL', entryPrice: 2800, currentPrice: 2750, quantity: 10, side: 'long' },
  { symbol: 'MSFT', entryPrice: 300, currentPrice: 310, quantity: 50, side: 'long' }
];

const portfolio = MarketCalculations.calculatePortfolioMetrics(positions);
console.log('Portfolio Metrics:');
console.log(`- Total Value: ${Formatters.currency(portfolio.totalValue)}`);
console.log(`- Total P&L: ${Formatters.currency(portfolio.totalPnL)}`);
console.log(`- Total Return: ${Formatters.percentage(portfolio.totalReturn)}`);
console.log(`- Position Count: ${portfolio.positionCount}\n`);

// Demo 2: Technical Indicators
console.log('📈 Technical Indicators Demo:');
console.log('==============================');

// Generate more price data for MACD calculation (needs at least 26 periods)
const prices = [
  45.15, 46.26, 46.50, 46.23, 46.08, 46.03, 46.83, 47.69, 47.54, 47.70,
  48.15, 48.61, 48.75, 49.20, 49.35, 49.05, 48.75, 49.15, 49.35, 49.80,
  50.12, 49.95, 50.25, 50.45, 50.15, 49.85, 50.35, 50.65, 50.95, 51.25,
  51.05, 50.85, 51.15, 51.45, 51.75, 52.05, 51.85, 51.65, 51.95, 52.25
];

// Simple Moving Average
const sma5 = TechnicalIndicators.sma(prices, 5);
console.log('Simple Moving Average (5-period):');
console.log(`- Latest SMA: ${Formatters.price(sma5[sma5.length - 1])}`);

// Exponential Moving Average
const ema5 = TechnicalIndicators.ema(prices, 5);
console.log(`- Latest EMA: ${Formatters.price(ema5[ema5.length - 1])}`);

// RSI
const rsi = TechnicalIndicators.rsi(prices, 14);
if (rsi.length > 0) {
  console.log(`- Latest RSI: ${rsi[rsi.length - 1].toFixed(2)}`);
}

// MACD
const macd = TechnicalIndicators.macd(prices, 12, 26, 9);
if (macd.macd.length > 0) {
  console.log(`- Latest MACD: ${macd.macd[macd.macd.length - 1].toFixed(4)}`);
}

// Bollinger Bands
const bb = TechnicalIndicators.bollingerBands(prices, 10, 2);
if (bb.upper.length > 0) {
  console.log(`- Bollinger Upper: ${Formatters.price(bb.upper[bb.upper.length - 1])}`);
  console.log(`- Bollinger Middle: ${Formatters.price(bb.middle[bb.middle.length - 1])}`);
  console.log(`- Bollinger Lower: ${Formatters.price(bb.lower[bb.lower.length - 1])}\n`);
}

// Demo 3: Validation
console.log('✅ Validation Demo:');
console.log('===================');

const orderData = {
  symbol: 'AAPL',
  side: 'BUY',
  orderType: 'LIMIT',
  timeInForce: 'DAY',
  quantity: 100,
  limitPrice: 150.50
};

const validation = Validators.validateOrder(orderData);
console.log('Order Validation:');
console.log(`- Valid: ${validation.valid}`);
if (!validation.valid) {
  console.log(`- Errors: ${validation.errors.join(', ')}`);
} else {
  console.log('- Order data is valid ✓');
}

// Email validation
const email = 'trader@nexustrade.ai';
console.log(`- Email "${email}" valid: ${Validators.isValidEmail(email)}`);

// Symbol validation
const symbol = 'AAPL';
console.log(`- Symbol "${symbol}" valid: ${Validators.isValidSymbol(symbol)}\n`);

// Demo 4: Market Constants
console.log('🏛️ Market Constants Demo:');
console.log('==========================');

console.log('Market Hours:');
console.log(`- NYSE Regular: ${MarketConstants.MARKET_HOURS.NYSE.REGULAR.OPEN} - ${MarketConstants.MARKET_HOURS.NYSE.REGULAR.CLOSE}`);
console.log(`- NYSE Extended: ${MarketConstants.MARKET_HOURS.NYSE.EXTENDED.PRE_MARKET_OPEN} - ${MarketConstants.MARKET_HOURS.NYSE.EXTENDED.AFTER_HOURS_CLOSE}`);

console.log('\nOrder Types:');
Object.values(MarketConstants.ORDER_TYPES).forEach(type => {
  console.log(`- ${type}`);
});

console.log('\nAsset Classes:');
Object.values(MarketConstants.ASSET_CLASSES).forEach(asset => {
  console.log(`- ${asset}`);
});

console.log('\nTrading Limits:');
console.log(`- PDT Min Equity: ${Formatters.currency(MarketConstants.TRADING_LIMITS.PDT.MIN_EQUITY)}`);
console.log(`- Max Position Size: ${MarketConstants.TRADING_LIMITS.POSITION_LIMITS.MAX_POSITION_SIZE_PERCENT}%`);
console.log(`- Max Daily Loss: ${MarketConstants.TRADING_LIMITS.RISK_LIMITS.MAX_DAILY_LOSS_PERCENT}%\n`);

// Demo 5: Date/Time Utilities
console.log('🕐 Date/Time Demo:');
console.log('==================');

const marketTime = DateTime.getMarketTime();
console.log(`- Current Market Time: ${DateTime.format(marketTime, DateTime.formatters.MARKET)}`);
console.log(`- Market Open: ${DateTime.isMarketOpen()}`);

const nextTradingDay = DateTime.getNextTradingDay();
console.log(`- Next Trading Day: ${DateTime.format(nextTradingDay, DateTime.formatters.DATE)}`);

const tradingDays = DateTime.getTradingDaysBetween('2024-01-01', '2024-01-31');
console.log(`- Trading Days in January 2024: ${tradingDays}\n`);

console.log('🎉 Demo completed successfully!');
console.log('📚 NexusTradeAI Shared Library is ready for production use!');
