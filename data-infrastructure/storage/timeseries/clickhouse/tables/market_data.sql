-- ClickHouse Table Definitions for Nexus Trade AI Market Data
-- Optimized for high-performance analytics and time-series queries

-- Create database
CREATE DATABASE IF NOT EXISTS nexus_trade_ai;
USE nexus_trade_ai;

-- Market Data Table (Real-time OHLCV data)
CREATE TABLE IF NOT EXISTS market_data
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    symbol LowCardinality(String) CODEC(ZSTD),
    exchange LowCardinality(String) CODEC(ZSTD),
    asset_type LowCardinality(String) CODEC(ZSTD),
    interval LowCardinality(String) CODEC(ZSTD),
    open Decimal64(8) CODEC(ZSTD),
    high Decimal64(8) CODEC(ZSTD),
    low Decimal64(8) CODEC(ZSTD),
    close Decimal64(8) CODEC(ZSTD),
    volume Decimal64(8) CODEC(ZSTD),
    quote_volume Decimal64(8) CODEC(ZSTD),
    trades_count UInt32 CODEC(ZSTD),
    vwap Decimal64(8) CODEC(ZSTD),
    bid Decimal64(8) CODEC(ZSTD),
    ask Decimal64(8) CODEC(ZSTD),
    spread Decimal64(8) CODEC(ZSTD),
    market_session LowCardinality(String) CODEC(ZSTD),
    is_snapshot UInt8 CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (symbol, exchange, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Trade Executions Table
CREATE TABLE IF NOT EXISTS trade_executions
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    trade_id String CODEC(ZSTD),
    order_id String CODEC(ZSTD),
    user_id String CODEC(ZSTD),
    symbol LowCardinality(String) CODEC(ZSTD),
    exchange LowCardinality(String) CODEC(ZSTD),
    side LowCardinality(String) CODEC(ZSTD),
    order_type LowCardinality(String) CODEC(ZSTD),
    quantity Decimal64(8) CODEC(ZSTD),
    price Decimal64(8) CODEC(ZSTD),
    executed_quantity Decimal64(8) CODEC(ZSTD),
    executed_price Decimal64(8) CODEC(ZSTD),
    commission Decimal64(8) CODEC(ZSTD),
    commission_asset LowCardinality(String) CODEC(ZSTD),
    status LowCardinality(String) CODEC(ZSTD),
    time_in_force LowCardinality(String) CODEC(ZSTD),
    slippage Decimal64(8) CODEC(ZSTD),
    execution_latency_ms UInt32 CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_id, symbol, timestamp)
TTL timestamp + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- Order Book Snapshots Table
CREATE TABLE IF NOT EXISTS orderbook_snapshots
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    symbol LowCardinality(String) CODEC(ZSTD),
    exchange LowCardinality(String) CODEC(ZSTD),
    bids Array(Tuple(Decimal64(8), Decimal64(8))) CODEC(ZSTD),
    asks Array(Tuple(Decimal64(8), Decimal64(8))) CODEC(ZSTD),
    best_bid Decimal64(8) CODEC(ZSTD),
    best_ask Decimal64(8) CODEC(ZSTD),
    spread Decimal64(8) CODEC(ZSTD),
    bid_depth Decimal64(8) CODEC(ZSTD),
    ask_depth Decimal64(8) CODEC(ZSTD),
    total_bid_volume Decimal64(8) CODEC(ZSTD),
    total_ask_volume Decimal64(8) CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (symbol, exchange, timestamp)
TTL timestamp + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

-- Portfolio Positions Table
CREATE TABLE IF NOT EXISTS portfolio_positions
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    user_id String CODEC(ZSTD),
    portfolio_id String CODEC(ZSTD),
    symbol LowCardinality(String) CODEC(ZSTD),
    exchange LowCardinality(String) CODEC(ZSTD),
    asset_type LowCardinality(String) CODEC(ZSTD),
    quantity Decimal64(8) CODEC(ZSTD),
    average_price Decimal64(8) CODEC(ZSTD),
    current_price Decimal64(8) CODEC(ZSTD),
    market_value Decimal64(8) CODEC(ZSTD),
    unrealized_pnl Decimal64(8) CODEC(ZSTD),
    realized_pnl Decimal64(8) CODEC(ZSTD),
    allocation_percentage Decimal64(4) CODEC(ZSTD),
    cost_basis Decimal64(8) CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = ReplacingMergeTree(created_at)
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_id, portfolio_id, symbol, timestamp)
TTL timestamp + INTERVAL 2555 DAY  -- 7 years for compliance
SETTINGS index_granularity = 8192;

-- Risk Metrics Table
CREATE TABLE IF NOT EXISTS risk_metrics
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    entity_id String CODEC(ZSTD),
    entity_type LowCardinality(String) CODEC(ZSTD), -- 'portfolio', 'position', 'user'
    symbol LowCardinality(String) CODEC(ZSTD),
    var_1d Decimal64(8) CODEC(ZSTD),
    var_5d Decimal64(8) CODEC(ZSTD),
    var_30d Decimal64(8) CODEC(ZSTD),
    cvar_1d Decimal64(8) CODEC(ZSTD),
    beta Decimal64(8) CODEC(ZSTD),
    alpha Decimal64(8) CODEC(ZSTD),
    sharpe_ratio Decimal64(8) CODEC(ZSTD),
    sortino_ratio Decimal64(8) CODEC(ZSTD),
    max_drawdown Decimal64(8) CODEC(ZSTD),
    volatility Decimal64(8) CODEC(ZSTD),
    correlation Decimal64(8) CODEC(ZSTD),
    tracking_error Decimal64(8) CODEC(ZSTD),
    information_ratio Decimal64(8) CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (entity_type, entity_id, timestamp)
TTL timestamp + INTERVAL 730 DAY  -- 2 years
SETTINGS index_granularity = 8192;

-- Technical Indicators Table
CREATE TABLE IF NOT EXISTS technical_indicators
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    symbol LowCardinality(String) CODEC(ZSTD),
    exchange LowCardinality(String) CODEC(ZSTD),
    timeframe LowCardinality(String) CODEC(ZSTD),
    sma_20 Decimal64(8) CODEC(ZSTD),
    sma_50 Decimal64(8) CODEC(ZSTD),
    sma_200 Decimal64(8) CODEC(ZSTD),
    ema_12 Decimal64(8) CODEC(ZSTD),
    ema_26 Decimal64(8) CODEC(ZSTD),
    rsi Decimal64(8) CODEC(ZSTD),
    macd Decimal64(8) CODEC(ZSTD),
    macd_signal Decimal64(8) CODEC(ZSTD),
    macd_histogram Decimal64(8) CODEC(ZSTD),
    bollinger_upper Decimal64(8) CODEC(ZSTD),
    bollinger_middle Decimal64(8) CODEC(ZSTD),
    bollinger_lower Decimal64(8) CODEC(ZSTD),
    stochastic_k Decimal64(8) CODEC(ZSTD),
    stochastic_d Decimal64(8) CODEC(ZSTD),
    williams_r Decimal64(8) CODEC(ZSTD),
    atr Decimal64(8) CODEC(ZSTD),
    adx Decimal64(8) CODEC(ZSTD),
    cci Decimal64(8) CODEC(ZSTD),
    momentum Decimal64(8) CODEC(ZSTD),
    roc Decimal64(8) CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (symbol, exchange, timeframe, timestamp)
TTL timestamp + INTERVAL 365 DAY
SETTINGS index_granularity = 8192;

-- News and Sentiment Table
CREATE TABLE IF NOT EXISTS news_sentiment
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    article_id String CODEC(ZSTD),
    title String CODEC(ZSTD),
    content String CODEC(ZSTD),
    summary String CODEC(ZSTD),
    source LowCardinality(String) CODEC(ZSTD),
    author String CODEC(ZSTD),
    url String CODEC(ZSTD),
    category LowCardinality(String) CODEC(ZSTD),
    language LowCardinality(String) CODEC(ZSTD),
    sentiment_score Decimal64(4) CODEC(ZSTD),
    sentiment_label LowCardinality(String) CODEC(ZSTD),
    relevance_score Decimal64(4) CODEC(ZSTD),
    symbols_mentioned Array(String) CODEC(ZSTD),
    tags Array(String) CODEC(ZSTD),
    published_at DateTime64(3) CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (source, category, timestamp)
TTL timestamp + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

-- System Metrics Table
CREATE TABLE IF NOT EXISTS system_metrics
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    service_name LowCardinality(String) CODEC(ZSTD),
    instance_id String CODEC(ZSTD),
    metric_name LowCardinality(String) CODEC(ZSTD),
    metric_value Decimal64(8) CODEC(ZSTD),
    unit LowCardinality(String) CODEC(ZSTD),
    tags Map(String, String) CODEC(ZSTD),
    region LowCardinality(String) CODEC(ZSTD),
    environment LowCardinality(String) CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_name, metric_name, timestamp)
TTL timestamp + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- User Activity Table
CREATE TABLE IF NOT EXISTS user_activity
(
    timestamp DateTime64(3) CODEC(Delta, ZSTD),
    user_id String CODEC(ZSTD),
    session_id String CODEC(ZSTD),
    action_type LowCardinality(String) CODEC(ZSTD),
    resource String CODEC(ZSTD),
    details Map(String, String) CODEC(ZSTD),
    ip_address IPv4 CODEC(ZSTD),
    user_agent String CODEC(ZSTD),
    success UInt8 CODEC(ZSTD),
    error_code String CODEC(ZSTD),
    latency_ms UInt32 CODEC(ZSTD),
    created_at DateTime DEFAULT now() CODEC(ZSTD)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (user_id, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

-- Create Materialized Views for Real-time Aggregations

-- 1-minute OHLCV aggregation from tick data
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data_1m_mv
TO market_data_1m
AS SELECT
    toStartOfMinute(timestamp) as timestamp,
    symbol,
    exchange,
    asset_type,
    '1m' as interval,
    argMin(close, timestamp) as open,
    max(close) as high,
    min(close) as low,
    argMax(close, timestamp) as close,
    sum(volume) as volume,
    sum(quote_volume) as quote_volume,
    sum(trades_count) as trades_count,
    sum(volume * close) / sum(volume) as vwap,
    argMax(bid, timestamp) as bid,
    argMax(ask, timestamp) as ask,
    argMax(spread, timestamp) as spread,
    any(market_session) as market_session,
    0 as is_snapshot,
    now() as created_at
FROM market_data
WHERE interval = 'tick'
GROUP BY timestamp, symbol, exchange, asset_type;

-- 5-minute OHLCV aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS market_data_5m_mv
TO market_data_5m
AS SELECT
    toStartOfFiveMinutes(timestamp) as timestamp,
    symbol,
    exchange,
    asset_type,
    '5m' as interval,
    argMin(open, timestamp) as open,
    max(high) as high,
    min(low) as low,
    argMax(close, timestamp) as close,
    sum(volume) as volume,
    sum(quote_volume) as quote_volume,
    sum(trades_count) as trades_count,
    sum(volume * vwap) / sum(volume) as vwap,
    argMax(bid, timestamp) as bid,
    argMax(ask, timestamp) as ask,
    argMax(spread, timestamp) as spread,
    any(market_session) as market_session,
    0 as is_snapshot,
    now() as created_at
FROM market_data_1m
GROUP BY timestamp, symbol, exchange, asset_type;

-- Trade volume aggregation by user
CREATE MATERIALIZED VIEW IF NOT EXISTS user_trade_volume_mv
TO user_trade_volume
AS SELECT
    toStartOfHour(timestamp) as timestamp,
    user_id,
    symbol,
    exchange,
    side,
    count() as trade_count,
    sum(executed_quantity) as total_quantity,
    sum(executed_quantity * executed_price) as total_value,
    avg(executed_price) as avg_price,
    sum(commission) as total_commission,
    avg(execution_latency_ms) as avg_latency_ms
FROM trade_executions
GROUP BY timestamp, user_id, symbol, exchange, side;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_market_data_symbol ON market_data (symbol) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_market_data_timestamp ON market_data (timestamp) TYPE minmax GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trade_executions (user_id) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio_positions (user_id) TYPE bloom_filter GRANULARITY 1;
CREATE INDEX IF NOT EXISTS idx_news_symbols ON news_sentiment (symbols_mentioned) TYPE bloom_filter GRANULARITY 1;
