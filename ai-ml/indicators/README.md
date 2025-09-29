# NexusTradeAI Technical Indicators

A comprehensive library of technical analysis indicators for financial markets, with specialized support for both stock and forex trading. The library includes a wide range of indicators, from basic moving averages to advanced forex-specific metrics.

## Key Features

- **Comprehensive Indicator Library**: Over 30+ technical indicators
- **Forex-Specific Tools**: Currency strength meters, session analysis, and correlation tools
- **High Performance**: Optimized for real-time and historical analysis
- **Modular Design**: Easy to extend and customize
- **Detailed Documentation**: Complete API reference with examples

## Installation

```bash
npm install @nexustradeai/indicators
```

## Quick Start

```javascript
const { indicators, patternRecognition } = require('@nexustradeai/indicators');

// Example 1: Basic indicator usage
const prices = [/* array of closing prices */];
const rsi = indicators.rsi(prices, 14);

// Example 2: Forex currency strength
const currencyPairs = {
  'EUR/USD': { price: 1.0850, change24h: 0.0025 },
  'USD/JPY': { price: 150.25, change24h: -0.15 },
  'GBP/USD': { price: 1.2650, change24h: 0.0010 },
  // ... more pairs
};
const strength = indicators.currencyStrength(currencyPairs, 'USD');

// Example 3: Market session analysis
const sessionAnalysis = indicators.forexSessionStrength(ohlcData);
```

## Installation

```bash
npm install @nexustradeai/indicators
```

## Usage

```javascript
const { indicators, patternRecognition, performanceUtils } = require('@nexustradeai/indicators');

// Example: Calculate RSI
const prices = [/* array of closing prices */];
const rsi = indicators.rsi(prices, 14);

// Example: Detect candlestick patterns
const patterns = patternRecognition.detectCandlestickPatterns(opens, highs, lows, closes);

// Example: Use performance utilities for heavy calculations
const processData = async (data) => {
  return performanceUtils.processInBatches(
    data,
    chunk => heavyComputation(chunk),
    { batchSize: 100, parallel: true }
  );
};
```

## Available Indicators

### Cryptocurrency Indicators

- **Bitcoin Dominance** - `bitcoinDominance(btcMarketCap, totalCryptoMarketCap, history)`
  - Tracks Bitcoin's market share across all cryptocurrencies
  - Includes trend analysis and 24h change metrics

- **NVT Ratio** - `nvtRatio(marketCap, dailyTxVolume, options)`
  - Network Value to Transactions ratio
  - Identifies overbought/oversold conditions based on network usage

- **Realized Price** - `realizedPrice(utxos)`
  - Calculates the average price at which coins last moved
  - Helps identify support/resistance levels

- **SOPR** - `sopr(spentOutputs)`
  - Spent Output Profit Ratio
  - Measures whether coins are being moved at a profit or loss

- **MVRV Ratio** - `mvrvRatio(marketCap, realizedCap)`
  - Market Value to Realized Value ratio
  - Identifies market tops and bottoms

- **Hash Rate Difficulty** - `hashRateDifficulty(hashRate, difficulty, options)`
  - Analyzes miner profitability and network health
  - Includes hash price and mining cost calculations

### Forex-Specific Indicators

- **Currency Strength Meter** - `currencyStrength(currencyPairs, baseCurrency)`
  - Measures relative strength of currencies across multiple pairs
  - Identifies strongest/weakest currencies in real-time

- **Market Session Analysis** - `forexSessionStrength(prices)`
  - Analyzes price action during different Forex market sessions
  - Identifies most active and volatile trading sessions

- **Currency Correlation** - `forexCorrelationMatrix(priceData, period)`
  - Calculates correlation between multiple currency pairs
  - Helps in portfolio diversification and risk management

- **ATR Trailing Stops** - `atrTrailingStops(highs, lows, closes, period, multiplier)`
  - Dynamic stop-loss based on market volatility
  - Adjusts to changing market conditions

- **Carry Trade Analysis** - `carryTrade(baseRate, quoteRate, price, period)`
  - Calculates potential carry trade returns
  - Considers interest rate differentials and expected price changes

### Trend Indicators
- **SMA (Simple Moving Average)** - `sma(prices, period)`
- **EMA (Exponential Moving Average)** - `ema(prices, period)`
- **Ichimoku Cloud** - `ichimoku(highs, lows, closes, conversionPeriod, basePeriod, spanBPeriod, displacement)`
- **Parabolic SAR** - `parabolicSAR(highs, lows, acceleration, maximum)`

### Momentum Indicators
- **RSI (Relative Strength Index)** - `rsi(prices, period)`
- **MACD (Moving Average Convergence Divergence)** - `macd(prices, fastPeriod, slowPeriod, signalPeriod)`
- **Stochastic Oscillator** - `stochastic(highs, lows, closes, kPeriod, kSlowing, dPeriod)`
- **CMO (Chande Momentum Oscillator)** - `cmo(prices, period)`

### Volatility Indicators
- **Bollinger Bands** - `bollingerBands(prices, period, stdDev)`
- **ATR (Average True Range)** - `atr(highs, lows, closes, period)`
- **Keltner Channels** - `keltnerChannels(highs, lows, closes, period, multiplier, atrPeriod)`

### Volume Indicators
- **Volume Profile** - `volumeProfile(prices, volumes, numBins)`
- **OBV (On-Balance Volume)** - `obv(closes, volumes)`

### Support & Resistance
- **Pivot Points** - `pivotPoints(high, low, close, type)`
- **Fibonacci Retracement** - `fibonacciRetracement(high, low, levels)`
- **Demarker Indicator** - `demarker(highs, lows, period)`

### Other Indicators
- **CCI (Commodity Channel Index)** - `cci(highs, lows, closes, period)`
- **Supertrend** - `supertrend(highs, lows, closes, period, multiplier)`

## Pattern Recognition

### Candlestick Patterns
- Single Candle: Doji, Hammer, Shooting Star
- Two Candle: Engulfing, Harami, Piercing Line, Dark Cloud Cover
- Three Candle: Morning/Evening Star, Three White Soldiers, Three Black Crows

```javascript
const patterns = patternRecognition.detectCandlestickPatterns(opens, highs, lows, closes);
```

## Cryptocurrency Examples

### 1. Bitcoin Dominance Analysis

```javascript
// Track Bitcoin dominance
const dominance = indicators.bitcoinDominance(
  800000000000,  // BTC market cap
  2000000000000, // Total crypto market cap
  historicalDominanceData // Optional: array of past dominance values
);

console.log(`BTC Dominance: ${dominance.dominance}%`);
console.log(`24h Change: ${dominance.change24h}%`);
console.log(`Trend: ${dominance.trend}`);
```

### 2. On-Chain Analysis with MVRV and SOPR

```javascript
// Calculate MVRV Ratio
const mvrv = indicators.mvrvRatio(
  800000000000,  // Current market cap
  500000000000   // Realized cap (sum of all coins * price at last move)
);

console.log(`MVRV Ratio: ${mvrv.mvrv}`);
console.log(`Market Phase: ${mvrv.zone}`);

// Calculate SOPR
const sopr = indicators.sopr([
  { value: 1.5, acquisitionPrice: 45000, currentPrice: 60000 },
  { value: 2.1, acquisitionPrice: 58000, currentPrice: 60000 },
  // ... more spent outputs
]);

console.log(`SOPR: ${sopr.sopr}`);
console.log(`Profit/Loss Ratio: ${sopr.profitVolume / sopr.lossVolume}`);
```

### 3. Mining Profitability Analysis

```javascript
// Analyze mining profitability
const miningStats = indicators.hashRateDifficulty(
  150e18,  // Current hash rate in H/s
  25000000000000,  // Current difficulty
  { blockTime: 600, blockReward: 6.25, electricityCost: 0.05 }
);

console.log(`Hash Price: $${miningStats.hashPrice}/TH/day`);
console.log(`Daily Revenue: $${miningStats.dailyRevenue}`);
console.log(`Profit Margin: ${miningStats.profitMargin}%`);
console.log(`Is Profitable: ${miningStats.isProfitable ? 'Yes' : 'No'}`);
```

## Advanced Usage Examples

### 1. Currency Strength Dashboard

```javascript
// Create a currency strength dashboard
const { indicators } = require('@nexustradeai/indicators');

// Get real-time currency pairs data
const currencyPairs = {
  'EUR/USD': { price: 1.0850, change24h: 0.0025 },
  'USD/JPY': { price: 150.25, change24h: -0.15 },
  'GBP/USD': { price: 1.2650, change24h: 0.0010 },
  'USD/CHF': { price: 0.9150, change24h: -0.0010 },
  'AUD/USD': { price: 0.6550, change24h: 0.0005 },
  'USD/CAD': { price: 1.3550, change24h: -0.0020 },
  'NZD/USD': { price: 0.6120, change24h: 0.0008 }
};

// Calculate currency strength
const strength = indicators.currencyStrength(currencyPairs, 'USD');
console.log('Currency Strength:', strength);
```

### 2. Market Session Analysis

```javascript
// Analyze market session strength
const sessionAnalysis = indicators.forexSessionStrength(ohlcData);

// Find strongest session
const strongestSession = Object.entries(sessionAnalysis)
  .sort((a, b) => b[1].strength - a[1].strength)[0];

console.log(`Strongest session: ${strongestSession[1].name} (${strongestSession[1].strength}/100)`);
console.log(`Price change: ${strongestSession[1].priceChange.toFixed(2)}%`);
console.log(`Average range: ${strongestSession[1].avgRange.toFixed(2)}%`);
```

### 3. Correlation Trading

```javascript
// Find trading opportunities using correlation
const correlationMatrix = indicators.forexCorrelationMatrix({
  'EUR/USD': eurUsdPrices,
  'GBP/USD': gbpUsdPrices,
  'USD/JPY': usdJpyPrices,
  'AUD/USD': audUsdPrices,
  'USD/CAD': usdCadPrices
}, 50);

// Find highly correlated pairs
const pairs = Object.keys(correlationMatrix);
for (let i = 0; i < pairs.length; i++) {
  for (let j = i + 1; j < pairs.length; j++) {
    const correlation = correlationMatrix[pairs[i]][pairs[j]];
    if (Math.abs(correlation) > 0.8) {
      console.log(`${pairs[i]} vs ${pairs[j]}: ${correlation.toFixed(2)}`);
    }
  }
}
```

## Performance Optimization

### Batch Processing
Process large datasets in chunks to prevent blocking the main thread:

```javascript
const results = await performanceUtils.processInBatches(
  largeDataset,
  processChunk,
  { 
    batchSize: 100,    // Items per batch
    delay: 0,          // Delay between batches (ms)
    parallel: true     // Process batches in parallel
  }
);
```

### Web Workers
Offload CPU-intensive calculations to background threads:

```javascript
// In your worker file (e.g., worker.js)
const { indicators } = require('@nexustradeai/indicators');

self.onmessage = (e) => {
  const { method, args, id } = e.data;
  try {
    const result = indicators[method](...args);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};

// In your main application
const worker = new Worker('worker.js');
worker.postMessage({
  method: 'rsi',
  args: [[/* prices */], 14],
  id: 1
});
```

## Testing

Run the test suite:

```bash
npm test
```

## License

MIT
