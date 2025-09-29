// InfluxDB Schema for Nexus Trade AI Market Data
// This file defines the data structure and retention policies for market data storage

// Bucket Configuration
// Primary bucket for real-time market data
option task = {
    name: "market-data-schema",
    every: 1h,
}

// Market Data Measurement Schema
// Fields:
// - price: Current price (float)
// - volume: Trading volume (float)
// - bid: Bid price (float)
// - ask: Ask price (float)
// - high: High price in period (float)
// - low: Low price in period (float)
// - open: Opening price (float)
// - close: Closing price (float)
// - vwap: Volume weighted average price (float)
// - trades_count: Number of trades (int)

// Tags:
// - symbol: Trading symbol (string)
// - exchange: Exchange name (string)
// - asset_type: Type of asset (crypto, stock, forex, commodity)
// - interval: Time interval (1m, 5m, 15m, 1h, 1d)
// - market_session: Market session (pre, regular, post, extended)

// Example query to create market data point
market_data_example = {
    _measurement: "market_data",
    _time: now(),
    _field: "price",
    _value: 50000.0,
    symbol: "BTC-USDT",
    exchange: "binance",
    asset_type: "crypto",
    interval: "1m",
    market_session: "regular"
}

// Trade Data Measurement Schema
// Fields:
// - price: Trade price (float)
// - quantity: Trade quantity (float)
// - value: Trade value (price * quantity) (float)
// - commission: Commission paid (float)
// - slippage: Price slippage (float)

// Tags:
// - symbol: Trading symbol (string)
// - exchange: Exchange name (string)
// - side: Trade side (buy, sell)
// - order_type: Order type (market, limit, stop)
// - user_id: User identifier (string)
// - trade_id: Unique trade identifier (string)

trade_data_example = {
    _measurement: "trades",
    _time: now(),
    _field: "price",
    _value: 50000.0,
    symbol: "BTC-USDT",
    exchange: "binance",
    side: "buy",
    order_type: "market",
    user_id: "user123",
    trade_id: "trade456"
}

// Analytics Measurement Schema
// Fields:
// - rsi: Relative Strength Index (float)
// - macd: MACD indicator (float)
// - bollinger_upper: Upper Bollinger Band (float)
// - bollinger_lower: Lower Bollinger Band (float)
// - sma_20: 20-period Simple Moving Average (float)
// - ema_12: 12-period Exponential Moving Average (float)
// - volatility: Price volatility (float)
// - volume_ratio: Volume ratio to average (float)
// - support_level: Support level (float)
// - resistance_level: Resistance level (float)

analytics_example = {
    _measurement: "analytics",
    _time: now(),
    _field: "rsi",
    _value: 65.5,
    symbol: "BTC-USDT",
    exchange: "binance",
    timeframe: "1h",
    indicator_type: "momentum"
}

// Risk Metrics Measurement Schema
// Fields:
// - var_1d: 1-day Value at Risk (float)
// - var_5d: 5-day Value at Risk (float)
// - beta: Beta coefficient (float)
// - sharpe_ratio: Sharpe ratio (float)
// - max_drawdown: Maximum drawdown (float)
// - correlation: Correlation coefficient (float)

risk_metrics_example = {
    _measurement: "risk_metrics",
    _time: now(),
    _field: "var_1d",
    _value: 0.05,
    symbol: "BTC-USDT",
    portfolio_id: "portfolio123",
    risk_model: "historical",
    confidence_level: "95"
}

// Portfolio Performance Measurement Schema
// Fields:
// - total_value: Total portfolio value (float)
// - pnl_realized: Realized P&L (float)
// - pnl_unrealized: Unrealized P&L (float)
// - return_daily: Daily return (float)
// - return_total: Total return (float)
// - allocation_percentage: Asset allocation percentage (float)

portfolio_example = {
    _measurement: "portfolio_performance",
    _time: now(),
    _field: "total_value",
    _value: 100000.0,
    user_id: "user123",
    portfolio_id: "portfolio456",
    asset_class: "crypto",
    strategy: "momentum"
}

// Order Book Measurement Schema
// Fields:
// - bid_price_1: Best bid price (float)
// - bid_size_1: Best bid size (float)
// - ask_price_1: Best ask price (float)
// - ask_size_1: Best ask size (float)
// - spread: Bid-ask spread (float)
// - depth_bid: Total bid depth (float)
// - depth_ask: Total ask depth (float)

orderbook_example = {
    _measurement: "orderbook",
    _time: now(),
    _field: "bid_price_1",
    _value: 49995.0,
    symbol: "BTC-USDT",
    exchange: "binance",
    level: "1",
    side: "bid"
}

// News Sentiment Measurement Schema
// Fields:
// - sentiment_score: Sentiment score (-1 to 1) (float)
// - relevance_score: Relevance score (0 to 1) (float)
// - impact_score: Predicted impact score (float)
// - article_count: Number of articles (int)

news_sentiment_example = {
    _measurement: "news_sentiment",
    _time: now(),
    _field: "sentiment_score",
    _value: 0.75,
    symbol: "BTC-USDT",
    source: "reuters",
    category: "cryptocurrency",
    language: "en"
}

// System Metrics Measurement Schema
// Fields:
// - latency_ms: Processing latency in milliseconds (float)
// - throughput_msg_sec: Messages per second (float)
// - error_rate: Error rate percentage (float)
// - cpu_usage: CPU usage percentage (float)
// - memory_usage: Memory usage percentage (float)
// - disk_usage: Disk usage percentage (float)

system_metrics_example = {
    _measurement: "system_metrics",
    _time: now(),
    _field: "latency_ms",
    _value: 5.2,
    service: "market-data-service",
    instance: "instance-1",
    region: "us-east-1",
    environment: "production"
}

// Continuous Queries for Downsampling
// Downsample 1-minute data to 5-minute intervals
option task = {
    name: "downsample-5m",
    every: 5m,
}

from(bucket: "market-data-realtime")
    |> range(start: -5m)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
    |> set(key: "interval", value: "5m")
    |> to(bucket: "market-data-5m")

// Downsample 5-minute data to 1-hour intervals
option task = {
    name: "downsample-1h",
    every: 1h,
}

from(bucket: "market-data-5m")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
    |> set(key: "interval", value: "1h")
    |> to(bucket: "market-data-1h")

// Downsample 1-hour data to daily intervals
option task = {
    name: "downsample-1d",
    every: 1d,
}

from(bucket: "market-data-1h")
    |> range(start: -1d)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(every: 1d, fn: mean, createEmpty: false)
    |> set(key: "interval", value: "1d")
    |> to(bucket: "market-data-1d")

// Data Retention Policies
// Real-time data: 7 days
// 5-minute data: 30 days
// 1-hour data: 1 year
// Daily data: 10 years

// Alert Rules
// High volatility alert
option task = {
    name: "high-volatility-alert",
    every: 1m,
}

from(bucket: "market-data-realtime")
    |> range(start: -5m)
    |> filter(fn: (r) => r._measurement == "analytics" and r._field == "volatility")
    |> filter(fn: (r) => r._value > 0.1)  // 10% volatility threshold
    |> yield(name: "high_volatility")

// Price spike alert
option task = {
    name: "price-spike-alert",
    every: 1m,
}

from(bucket: "market-data-realtime")
    |> range(start: -2m)
    |> filter(fn: (r) => r._measurement == "market_data" and r._field == "price")
    |> derivative(unit: 1m, nonNegative: false)
    |> map(fn: (r) => ({r with _value: math.abs(x: r._value)}))
    |> filter(fn: (r) => r._value > 1000.0)  // Price change > $1000
    |> yield(name: "price_spike")

// Volume anomaly alert
option task = {
    name: "volume-anomaly-alert",
    every: 5m,
}

from(bucket: "market-data-realtime")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "market_data" and r._field == "volume")
    |> aggregateWindow(every: 5m, fn: mean)
    |> movingAverage(n: 12)  // 1-hour moving average
    |> yield(name: "volume_baseline")

// Data Quality Checks
option task = {
    name: "data-quality-check",
    every: 10m,
}

// Check for missing data points
from(bucket: "market-data-realtime")
    |> range(start: -10m)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(every: 1m, fn: count)
    |> filter(fn: (r) => r._value < 50)  // Less than 50 data points per minute
    |> yield(name: "missing_data")

// Check for price anomalies
from(bucket: "market-data-realtime")
    |> range(start: -10m)
    |> filter(fn: (r) => r._measurement == "market_data" and r._field == "price")
    |> filter(fn: (r) => r._value <= 0.0 or r._value > 1000000.0)  // Invalid prices
    |> yield(name: "price_anomaly")

// Performance Monitoring Queries
// Calculate average processing latency
from(bucket: "system-metrics")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "system_metrics" and r._field == "latency_ms")
    |> aggregateWindow(every: 5m, fn: mean)
    |> yield(name: "avg_latency")

// Calculate message throughput
from(bucket: "system-metrics")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "system_metrics" and r._field == "throughput_msg_sec")
    |> aggregateWindow(every: 5m, fn: sum)
    |> yield(name: "total_throughput")
