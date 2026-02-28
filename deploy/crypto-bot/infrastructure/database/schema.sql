-- NexusTradeAI Production Database Schema
-- PostgreSQL 14+
-- Created: 2024-12-23
-- Purpose: Replace JSON file storage with relational database

-- ============================================
-- ENUMS & TYPES
-- ============================================

CREATE TYPE position_side AS ENUM ('long', 'short');
CREATE TYPE position_status AS ENUM ('open', 'closed');
CREATE TYPE order_type AS ENUM ('market', 'limit', 'stop', 'stop_limit');
CREATE TYPE order_status AS ENUM ('pending', 'submitted', 'filled', 'partial', 'cancelled', 'rejected');
CREATE TYPE strategy_type AS ENUM ('momentum', 'mean_reversion', 'volatility', 'pairs', 'ml_ensemble');

-- ============================================
-- CORE TABLES
-- ============================================

-- Accounts table (replaces accounts.json)
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(50) UNIQUE NOT NULL,
    account_type VARCHAR(20) NOT NULL, -- 'paper' or 'live'
    broker VARCHAR(50) NOT NULL,
    balance DECIMAL(15, 2) NOT NULL,
    equity DECIMAL(15, 2) NOT NULL,
    buying_power DECIMAL(15, 2) NOT NULL,
    cash DECIMAL(15, 2) NOT NULL,
    portfolio_value DECIMAL(15, 2) NOT NULL,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT positive_balance CHECK (balance >= 0),
    CONSTRAINT positive_equity CHECK (equity >= 0)
);

-- Create index for fast lookups
CREATE INDEX idx_accounts_account_id ON accounts(account_id);
CREATE INDEX idx_accounts_last_updated ON accounts(last_updated);

-- Positions table (replaces positions.json)
CREATE TABLE positions (
    id SERIAL PRIMARY KEY,
    position_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    account_id VARCHAR(50) NOT NULL REFERENCES accounts(account_id),

    -- Position details
    symbol VARCHAR(10) NOT NULL,
    side position_side NOT NULL,
    quantity INTEGER NOT NULL,

    -- Pricing
    entry_price DECIMAL(12, 4) NOT NULL,
    current_price DECIMAL(12, 4),
    average_entry_price DECIMAL(12, 4) NOT NULL,

    -- P&L
    unrealized_pnl DECIMAL(12, 2),
    realized_pnl DECIMAL(12, 2) DEFAULT 0,
    total_pnl DECIMAL(12, 2),

    -- Risk management
    stop_loss DECIMAL(12, 4),
    take_profit DECIMAL(12, 4),
    trailing_stop DECIMAL(12, 4),

    -- Strategy
    strategy strategy_type NOT NULL,
    confidence DECIMAL(3, 2), -- 0.00 to 1.00

    -- Status
    status position_status NOT NULL DEFAULT 'open',

    -- Timestamps
    opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMP,
    last_updated TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Metadata
    entry_conditions JSONB DEFAULT '{}',
    exit_conditions JSONB DEFAULT '{}',
    notes TEXT,

    -- Constraints
    CONSTRAINT positive_quantity CHECK (quantity > 0),
    CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT valid_status_transition CHECK (
        (status = 'open' AND closed_at IS NULL) OR
        (status = 'closed' AND closed_at IS NOT NULL)
    )
);

-- Indexes for performance
CREATE INDEX idx_positions_account ON positions(account_id);
CREATE INDEX idx_positions_symbol ON positions(symbol);
CREATE INDEX idx_positions_status ON positions(status);
CREATE INDEX idx_positions_strategy ON positions(strategy);
CREATE INDEX idx_positions_opened_at ON positions(opened_at);
CREATE INDEX idx_positions_composite ON positions(account_id, status, symbol);

-- Orders table (new, for audit trail)
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(50) UNIQUE NOT NULL,
    account_id VARCHAR(50) NOT NULL REFERENCES accounts(account_id),
    position_id UUID REFERENCES positions(position_id),

    -- Order details
    symbol VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL, -- 'buy' or 'sell'
    order_type order_type NOT NULL,
    quantity INTEGER NOT NULL,

    -- Pricing
    limit_price DECIMAL(12, 4),
    stop_price DECIMAL(12, 4),
    filled_price DECIMAL(12, 4),
    filled_quantity INTEGER DEFAULT 0,

    -- Status
    status order_status NOT NULL DEFAULT 'pending',

    -- Execution
    submitted_at TIMESTAMP,
    filled_at TIMESTAMP,
    cancelled_at TIMESTAMP,

    -- Broker details
    broker_order_id VARCHAR(100),
    broker_status VARCHAR(50),

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Metadata
    execution_details JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT positive_quantity_order CHECK (quantity > 0),
    CONSTRAINT valid_filled_quantity CHECK (filled_quantity >= 0 AND filled_quantity <= quantity)
);

-- Indexes
CREATE INDEX idx_orders_account ON orders(account_id);
CREATE INDEX idx_orders_position ON orders(position_id);
CREATE INDEX idx_orders_symbol ON orders(symbol);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Trades table (replaces trades.json)
CREATE TABLE trades (
    id SERIAL PRIMARY KEY,
    trade_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    account_id VARCHAR(50) NOT NULL REFERENCES accounts(account_id),
    position_id UUID REFERENCES positions(position_id),

    -- Trade details
    symbol VARCHAR(10) NOT NULL,
    side VARCHAR(4) NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(12, 4) NOT NULL,

    -- Costs
    commission DECIMAL(8, 4) DEFAULT 0,
    fees DECIMAL(8, 4) DEFAULT 0,

    -- P&L (for closed trades)
    pnl DECIMAL(12, 2),
    pnl_percentage DECIMAL(8, 4),

    -- Strategy
    strategy strategy_type NOT NULL,
    signal_strength DECIMAL(3, 2),

    -- Timestamps
    executed_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Metadata
    execution_metadata JSONB DEFAULT '{}',
    market_conditions JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT positive_quantity_trade CHECK (quantity > 0),
    CONSTRAINT positive_price CHECK (price > 0)
);

-- Indexes
CREATE INDEX idx_trades_account ON trades(account_id);
CREATE INDEX idx_trades_position ON trades(position_id);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_strategy ON trades(strategy);
CREATE INDEX idx_trades_executed_at ON trades(executed_at);

-- Performance metrics table (replaces performance.json)
CREATE TABLE performance_metrics (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(50) NOT NULL REFERENCES accounts(account_id),

    -- Period
    metric_date DATE NOT NULL,

    -- Returns
    daily_return DECIMAL(10, 6),
    cumulative_return DECIMAL(10, 6),

    -- Risk metrics
    volatility DECIMAL(10, 6),
    sharpe_ratio DECIMAL(8, 4),
    sortino_ratio DECIMAL(8, 4),
    max_drawdown DECIMAL(8, 4),

    -- Trading metrics
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    win_rate DECIMAL(5, 4),
    profit_factor DECIMAL(8, 4),

    -- P&L
    realized_pnl DECIMAL(12, 2) DEFAULT 0,
    unrealized_pnl DECIMAL(12, 2) DEFAULT 0,
    total_pnl DECIMAL(12, 2) DEFAULT 0,

    -- Positions
    avg_positions INTEGER,
    max_positions INTEGER,

    -- Timestamps
    calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Unique constraint on account + date
    UNIQUE(account_id, metric_date)
);

-- Indexes
CREATE INDEX idx_perf_account ON performance_metrics(account_id);
CREATE INDEX idx_perf_date ON performance_metrics(metric_date);
CREATE INDEX idx_perf_composite ON performance_metrics(account_id, metric_date DESC);

-- Market data table (for historical analysis)
CREATE TABLE market_data (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,

    -- OHLCV
    timestamp TIMESTAMP NOT NULL,
    open DECIMAL(12, 4) NOT NULL,
    high DECIMAL(12, 4) NOT NULL,
    low DECIMAL(12, 4) NOT NULL,
    close DECIMAL(12, 4) NOT NULL,
    volume BIGINT NOT NULL,

    -- Derived metrics
    vwap DECIMAL(12, 4),

    -- Metadata
    source VARCHAR(50) DEFAULT 'alpaca',

    -- Unique constraint
    UNIQUE(symbol, timestamp)
);

-- Hypertable for time-series optimization (TimescaleDB extension)
-- SELECT create_hypertable('market_data', 'timestamp');

-- Indexes
CREATE INDEX idx_market_symbol ON market_data(symbol);
CREATE INDEX idx_market_timestamp ON market_data(timestamp DESC);

-- Signals table (for ML model predictions)
CREATE TABLE signals (
    id BIGSERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    strategy strategy_type NOT NULL,

    -- Signal
    direction VARCHAR(10) NOT NULL, -- 'long', 'short', 'neutral'
    strength DECIMAL(3, 2) NOT NULL, -- 0.00 to 1.00
    confidence DECIMAL(3, 2) NOT NULL,

    -- Features used
    features JSONB NOT NULL,

    -- Model details
    model_version VARCHAR(20),

    -- Outcome tracking
    executed BOOLEAN DEFAULT FALSE,
    position_id UUID REFERENCES positions(position_id),

    -- Result (for model improvement)
    actual_return DECIMAL(8, 4),
    prediction_error DECIMAL(8, 4),

    -- Timestamps
    generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_strength CHECK (strength >= 0 AND strength <= 1),
    CONSTRAINT valid_confidence CHECK (confidence >= 0 AND confidence <= 1)
);

-- Indexes
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_strategy ON signals(strategy);
CREATE INDEX idx_signals_generated_at ON signals(generated_at DESC);
CREATE INDEX idx_signals_executed ON signals(executed);

-- System health metrics table
CREATE TABLE system_metrics (
    id BIGSERIAL PRIMARY KEY,

    -- Service
    service_name VARCHAR(50) NOT NULL,

    -- Metrics
    cpu_usage DECIMAL(5, 2),
    memory_usage_mb INTEGER,
    memory_usage_pct DECIMAL(5, 2),

    -- Performance
    active_positions INTEGER,
    pending_orders INTEGER,
    api_latency_ms INTEGER,

    -- Health
    status VARCHAR(20) NOT NULL, -- 'healthy', 'degraded', 'critical'
    errors_count INTEGER DEFAULT 0,

    -- Timestamp
    recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sysmetrics_service ON system_metrics(service_name);
CREATE INDEX idx_sysmetrics_recorded ON system_metrics(recorded_at DESC);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate position P&L
CREATE OR REPLACE FUNCTION calculate_position_pnl()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_price IS NOT NULL THEN
        IF NEW.side = 'long' THEN
            NEW.unrealized_pnl = (NEW.current_price - NEW.average_entry_price) * NEW.quantity;
        ELSE
            NEW.unrealized_pnl = (NEW.average_entry_price - NEW.current_price) * NEW.quantity;
        END IF;

        NEW.total_pnl = COALESCE(NEW.realized_pnl, 0) + COALESCE(NEW.unrealized_pnl, 0);
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER calculate_position_pnl_trigger BEFORE INSERT OR UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION calculate_position_pnl();

-- ============================================
-- VIEWS
-- ============================================

-- Active positions with current P&L
CREATE VIEW v_active_positions AS
SELECT
    p.*,
    a.account_type,
    ROUND((p.unrealized_pnl / (p.average_entry_price * p.quantity) * 100)::numeric, 2) as unrealized_pnl_pct,
    EXTRACT(EPOCH FROM (NOW() - p.opened_at))/86400 as days_held
FROM positions p
JOIN accounts a ON p.account_id = a.account_id
WHERE p.status = 'open';

-- Daily performance summary
CREATE VIEW v_daily_performance AS
SELECT
    pm.account_id,
    pm.metric_date,
    pm.daily_return,
    pm.total_trades,
    pm.win_rate,
    pm.total_pnl,
    a.portfolio_value,
    ROUND((pm.total_pnl / a.portfolio_value * 100)::numeric, 2) as pnl_pct
FROM performance_metrics pm
JOIN accounts a ON pm.account_id = a.account_id
ORDER BY pm.metric_date DESC;

-- Trade history with outcomes
CREATE VIEW v_trade_history AS
SELECT
    t.*,
    p.symbol as position_symbol,
    p.status as position_status,
    CASE
        WHEN t.pnl > 0 THEN 'win'
        WHEN t.pnl < 0 THEN 'loss'
        ELSE 'neutral'
    END as outcome
FROM trades t
LEFT JOIN positions p ON t.position_id = p.position_id
ORDER BY t.executed_at DESC;

-- ============================================
-- INITIAL DATA
-- ============================================

-- Create default account
INSERT INTO accounts (account_id, account_type, broker, balance, equity, buying_power, cash, portfolio_value)
VALUES ('alpaca-paper', 'paper', 'alpaca', 100000, 100000, 100000, 100000, 100000)
ON CONFLICT (account_id) DO NOTHING;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE accounts IS 'Trading accounts (paper and live)';
COMMENT ON TABLE positions IS 'Active and historical positions';
COMMENT ON TABLE orders IS 'Order lifecycle and execution details';
COMMENT ON TABLE trades IS 'Completed trade executions';
COMMENT ON TABLE performance_metrics IS 'Daily performance calculations';
COMMENT ON TABLE market_data IS 'Historical OHLCV data';
COMMENT ON TABLE signals IS 'ML model predictions and outcomes';
COMMENT ON TABLE system_metrics IS 'System health and resource usage';

COMMENT ON COLUMN positions.confidence IS 'Model confidence in position (0.00-1.00)';
COMMENT ON COLUMN positions.trailing_stop IS 'Dynamic trailing stop price';
COMMENT ON COLUMN performance_metrics.sharpe_ratio IS 'Risk-adjusted return metric';
COMMENT ON COLUMN signals.prediction_error IS 'Actual vs predicted return difference';
