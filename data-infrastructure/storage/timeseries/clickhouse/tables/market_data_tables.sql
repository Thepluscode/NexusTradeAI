-- data-infrastructure/storage/timeseries/clickhouse/tables/market_data_tables.sql

-- Create database
CREATE DATABASE IF NOT EXISTS nexus_analytics
ENGINE = Atomic;

USE nexus_analytics;

-- =====================================================
-- MARKET DATA TABLES
-- =====================================================

-- Raw tick data table (partitioned by date)
CREATE TABLE IF NOT EXISTS market_ticks
(
    timestamp DateTime64(9),
    symbol String,
    exchange String,
    price Decimal64(8),
    bid Decimal64(8),
    ask Decimal64(8),
    bid_size UInt64,
    ask_size UInt64,
    volume UInt64,
    trade_id String,
    conditions Array(String),
    tape String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (symbol, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Aggregated OHLCV bars
CREATE TABLE IF NOT EXISTS ohlcv_bars
(
    timestamp DateTime,
    symbol String,
    exchange String,
    interval Enum8('1m' = 1, '5m' = 2, '15m' = 3, '30m' = 4, '1h' = 5, '4h' = 6, '1d' = 7),
    open Decimal64(8),
    high Decimal64(8),
    low Decimal64(8),
    close Decimal64(8),
    volume UInt64,
    vwap Decimal64(8),
    trades_count UInt32,
    quote_volume Decimal64(2)
)
ENGINE = ReplacingMergeTree()
PARTITION BY (toYYYYMM(timestamp), interval)
ORDER BY (symbol, timestamp, interval)
TTL timestamp + INTERVAL 2 YEAR;

-- Order book snapshots
CREATE TABLE IF NOT EXISTS order_book_snapshots
(
    timestamp DateTime64(3),
    symbol String,
    exchange String,
    bid_prices Array(Decimal64(8)),
    bid_sizes Array(UInt64),
    ask_prices Array(Decimal64(8)),
    ask_sizes Array(UInt64),
    mid_price Decimal64(8),
    spread Decimal64(8),
    imbalance Float32,
    depth_10_bid Decimal64(2),
    depth_10_ask Decimal64(2)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (symbol, timestamp)
TTL timestamp + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

-- Trade flow metrics
CREATE TABLE IF NOT EXISTS trade_flow_metrics
(
    timestamp DateTime,
    symbol String,
    interval Enum8('1m' = 1, '5m' = 2, '15m' = 3),
    buy_volume UInt64,
    sell_volume UInt64,
    buy_trades UInt32,
    sell_trades UInt32,
    large_buy_volume UInt64,
    large_sell_volume UInt64,
    order_flow_imbalance Float32,
    toxic_flow_score Float32,
    aggressor_ratio Float32
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (symbol, timestamp, interval);

-- =====================================================
-- MATERIALIZED VIEWS FOR REAL-TIME AGGREGATION
-- =====================================================

-- Real-time 1-minute bars from ticks
CREATE MATERIALIZED VIEW ohlcv_1m_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(bar_time)
ORDER BY (symbol, bar_time)
AS
SELECT
    toStartOfMinute(timestamp) AS bar_time,
    symbol,
    exchange,
    argMin(price, timestamp) AS open,
    max(price) AS high,
    min(price) AS low,
    argMax(price, timestamp) AS close,
    sum(volume) AS volume,
    sum(price * volume) / sum(volume) AS vwap,
    count() AS trades_count,
    sum(price * volume) AS quote_volume
FROM market_ticks
GROUP BY bar_time, symbol, exchange;

-- Real-time 5-minute bars
CREATE MATERIALIZED VIEW ohlcv_5m_mv
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMMDD(bar_time)
ORDER BY (symbol, bar_time)
AS
SELECT
    toStartOfFiveMinute(timestamp) AS bar_time,
    symbol,
    exchange,
    argMin(open, timestamp) AS open,
    max(high) AS high,
    min(low) AS low,
    argMax(close, timestamp) AS close,
    sum(volume) AS volume,
    sum(vwap * volume) / sum(volume) AS vwap,
    sum(trades_count) AS trades_count,
    sum(quote_volume) AS quote_volume
FROM ohlcv_bars
WHERE interval = '1m'
GROUP BY bar_time, symbol, exchange;

-- Volume profile by price level
CREATE MATERIALIZED VIEW volume_profile_mv
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMMDD(date)
ORDER BY (symbol, price_level)
AS
SELECT
    toDate(timestamp) AS date,
    symbol,
    round(price, 2) AS price_level,
    sum(volume) AS total_volume,
    countIf(price >= ask) AS buy_volume,
    countIf(price <= bid) AS sell_volume,
    avg(price) AS avg_price,
    max(timestamp) AS last_update
FROM market_ticks
GROUP BY date, symbol, price_level;

-- Market microstructure metrics
CREATE MATERIALIZED VIEW microstructure_metrics_mv
ENGINE = ReplacingMergeTree(last_update)
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (symbol, timestamp)
AS
SELECT
    toStartOfMinute(timestamp) AS timestamp,
    symbol,
    avg(ask - bid) AS avg_spread,
    stddevPop(ask - bid) AS spread_volatility,
    avg((ask + bid) / 2) AS avg_mid_price,
    max(ask - bid) AS max_spread,
    min(ask - bid) AS min_spread,
    avg(bid_size + ask_size) AS avg_depth,
    sum(volume) / count() AS avg_trade_size,
    now() AS last_update
FROM market_ticks
WHERE bid > 0 AND ask > 0
GROUP BY timestamp, symbol;

-- =====================================================
-- ANALYTICS TABLES
-- =====================================================

-- Technical indicators
CREATE TABLE IF NOT EXISTS technical_indicators
(
    timestamp DateTime,
    symbol String,
    timeframe Enum8('5m' = 1, '15m' = 2, '1h' = 3, '4h' = 4, '1d' = 5),
    -- Moving averages
    sma_10 Decimal64(8),
    sma_20 Decimal64(8),
    sma_50 Decimal64(8),
    sma_200 Decimal64(8),
    ema_12 Decimal64(8),
    ema_26 Decimal64(8),
    -- Momentum indicators
    rsi_14 Float32,
    macd_line Float32,
    macd_signal Float32,
    macd_histogram Float32,
    stochastic_k Float32,
    stochastic_d Float32,
    -- Volatility indicators
    atr_14 Decimal64(8),
    bollinger_upper Decimal64(8),
    bollinger_middle Decimal64(8),
    bollinger_lower Decimal64(8),
    -- Volume indicators
    obv Int64,
    vwap Decimal64(8),
    volume_sma_20 UInt64,
    -- Trend indicators
    adx Float32,
    plus_di Float32,
    minus_di Float32,
    -- Support/Resistance
    pivot_point Decimal64(8),
    resistance_1 Decimal64(8),
    resistance_2 Decimal64(8),
    support_1 Decimal64(8),
    support_2 Decimal64(8)
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (symbol, timeframe, timestamp);

-- Market regime detection
CREATE TABLE IF NOT EXISTS market_regimes
(
    timestamp DateTime,
    symbol String,
    regime Enum8('trending_up' = 1, 'trending_down' = 2, 'ranging' = 3, 'volatile' = 4),
    regime_strength Float32,
    volatility_percentile Float32,
    trend_strength Float32,
    mean_reversion_score Float32,
    breakout_probability Float32,
    regime_change_probability Float32,
    supporting_indicators Array(String)
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (symbol, timestamp);

-- Correlation matrix snapshots
CREATE TABLE IF NOT EXISTS correlation_matrix
(
    timestamp DateTime,
    timeframe Enum8('1h' = 1, '1d' = 2, '1w' = 3),
    symbol_1 String,
    symbol_2 String,
    correlation Float32,
    rolling_correlation_30d Float32,
    correlation_stability Float32,
    lead_lag_correlation Float32,
    optimal_lag Int16
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, timeframe, symbol_1, symbol_2);

-- =====================================================
-- PERFORMANCE OPTIMIZATION TABLES
-- =====================================================

-- Pre-aggregated statistics for fast queries
CREATE TABLE IF NOT EXISTS market_stats_daily
(
    date Date,
    symbol String,
    open Decimal64(8),
    high Decimal64(8),
    low Decimal64(8),
    close Decimal64(8),
    volume UInt64,
    dollar_volume Decimal64(2),
    trades_count UInt32,
    vwap Decimal64(8),
    volatility_daily Float32,
    average_spread Decimal64(8),
    -- Performance metrics
    daily_return Float32,
    cumulative_return Float32,
    max_drawdown Float32,
    sharpe_ratio Float32,
    -- Market microstructure
    avg_trade_size UInt64,
    large_trade_ratio Float32,
    quote_stuffing_score Float32
)
ENGINE = ReplacingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (symbol, date);

-- Hot data cache for ultra-low latency queries
CREATE TABLE IF NOT EXISTS market_data_cache
(
    symbol String,
    data_type Enum8('last_price' = 1, 'bid_ask' = 2, 'volume' = 3, 'indicators' = 4),
    timestamp DateTime64(3),
    data String,  -- JSON encoded data
    ttl DateTime DEFAULT now() + INTERVAL 5 MINUTE
)
ENGINE = Memory;

-- =====================================================
-- DISTRIBUTED TABLES FOR CLUSTER DEPLOYMENT
-- =====================================================

-- Distributed market ticks table
CREATE TABLE IF NOT EXISTS market_ticks_distributed AS market_ticks
ENGINE = Distributed('market_data_cluster', 'nexus_analytics', 'market_ticks', sipHash64(symbol));

-- Distributed OHLCV bars
CREATE TABLE IF NOT EXISTS ohlcv_bars_distributed AS ohlcv_bars
ENGINE = Distributed('market_data_cluster', 'nexus_analytics', 'ohlcv_bars', sipHash64(symbol));

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to calculate VWAP over custom period
CREATE FUNCTION calculate_vwap AS (symbol, start_time, end_time) ->
(
    SELECT sum(price * volume) / sum(volume) AS vwap
    FROM market_ticks
    WHERE symbol = symbol 
      AND timestamp >= start_time 
      AND timestamp <= end_time
);

-- Function to get market depth metrics
CREATE FUNCTION market_depth_metrics AS (symbol) ->
(
    SELECT
        avg(depth_10_bid + depth_10_ask) AS total_depth,
        avg(depth_10_bid) / avg(depth_10_ask) AS bid_ask_depth_ratio,
        stddevPop(depth_10_bid + depth_10_ask) AS depth_volatility
    FROM order_book_snapshots
    WHERE symbol = symbol
      AND timestamp >= now() - INTERVAL 1 HOUR
);

-- =====================================================
-- MONITORING AND MAINTENANCE
-- =====================================================

-- Table for monitoring data quality
CREATE TABLE IF NOT EXISTS data_quality_metrics
(
    check_time DateTime DEFAULT now(),
    table_name String,
    symbol String,
    missing_data_points UInt32,
    outlier_count UInt32,
    latency_ms UInt32,
    data_freshness_seconds UInt32,
    quality_score Float32
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(check_time)
ORDER BY (check_time, table_name, symbol)
TTL check_time + INTERVAL 30 DAY;

-- Create indexes for optimal query performance
ALTER TABLE market_ticks ADD INDEX idx_symbol_time (symbol, timestamp) TYPE minmax GRANULARITY 4;
ALTER TABLE ohlcv_bars ADD INDEX idx_symbol_interval (symbol, interval) TYPE set(100) GRANULARITY 4;
ALTER TABLE order_book_snapshots ADD INDEX idx_mid_price (mid_price) TYPE minmax GRANULARITY 4;

-- Create projections for common query patterns
ALTER TABLE market_ticks ADD PROJECTION proj_symbol_daily
(
    SELECT 
        symbol,
        toDate(timestamp) as date,
        min(price) as low,
        max(price) as high,
        sum(volume) as volume
    GROUP BY symbol, date
);

ALTER TABLE ohlcv_bars ADD PROJECTION proj_daily_ohlcv
(
    SELECT 
        symbol,
        toDate(timestamp) as date,
        argMin(open, timestamp) as open,
        max(high) as high,
        min(low) as low,
        argMax(close, timestamp) as close,
        sum(volume) as volume
    WHERE interval = '1d'
    GROUP BY symbol, date
);