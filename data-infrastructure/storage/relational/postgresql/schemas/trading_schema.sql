-- data-infrastructure/storage/relational/postgresql/schemas/trading_schema.sql

-- Create main database and extensions
CREATE DATABASE nexus_trade_db;

\c nexus_trade_db;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS market_data;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS risk_management;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS notifications;

-- =====================================================
-- AUTH SCHEMA - User management and authentication
-- =====================================================

-- Users table
CREATE TABLE auth.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    country_code VARCHAR(3),
    timezone VARCHAR(50) DEFAULT 'UTC',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending', 'closed')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    two_factor_secret VARCHAR(255),
    failed_login_attempts INTEGER DEFAULT 0,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User profiles with additional information
CREATE TABLE auth.user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    date_of_birth DATE,
    occupation VARCHAR(100),
    annual_income DECIMAL(15,2),
    net_worth DECIMAL(15,2),
    trading_experience VARCHAR(20) CHECK (trading_experience IN ('beginner', 'intermediate', 'advanced', 'professional')),
    risk_tolerance VARCHAR(20) CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
    investment_goals TEXT[],
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'in_review', 'approved', 'rejected')),
    kyc_documents JSONB,
    accredited_investor BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions
CREATE TABLE auth.user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    device_id VARCHAR(255),
    device_type VARCHAR(50),
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User permissions and roles
CREATE TABLE auth.user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    permissions JSONB,
    granted_by UUID REFERENCES auth.users(id),
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE
);

-- =====================================================
-- TRADING SCHEMA - Orders, trades, and portfolios
-- =====================================================

-- Instruments (stocks, ETFs, crypto, etc.)
CREATE TABLE trading.instruments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    symbol VARCHAR(20) NOT NULL,
    name VARCHAR(255) NOT NULL,
    exchange VARCHAR(10) NOT NULL,
    instrument_type VARCHAR(20) NOT NULL CHECK (instrument_type IN ('stock', 'etf', 'crypto', 'forex', 'option', 'future')),
    sector VARCHAR(50),
    industry VARCHAR(100),
    country VARCHAR(3),
    currency VARCHAR(3) NOT NULL,
    lot_size INTEGER DEFAULT 1,
    tick_size DECIMAL(10,8) DEFAULT 0.01,
    trading_hours JSONB,
    is_tradable BOOLEAN DEFAULT TRUE,
    margin_requirement DECIMAL(5,4) DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(symbol, exchange)
);

-- User accounts and portfolios
CREATE TABLE trading.accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('cash', 'margin', 'retirement')),
    account_name VARCHAR(100),
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    cash_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
    margin_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
    buying_power DECIMAL(18,2) NOT NULL DEFAULT 0,
    day_trading_buying_power DECIMAL(18,2) NOT NULL DEFAULT 0,
    maintenance_margin DECIMAL(18,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'restricted', 'closed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Orders
CREATE TABLE trading.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES trading.accounts(id),
    instrument_id UUID NOT NULL REFERENCES trading.instruments(id),
    order_type VARCHAR(20) NOT NULL CHECK (order_type IN ('market', 'limit', 'stop', 'stop_limit', 'trailing_stop')),
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity DECIMAL(18,8) NOT NULL,
    price DECIMAL(18,8),
    stop_price DECIMAL(18,8),
    time_in_force VARCHAR(10) NOT NULL DEFAULT 'GTC' CHECK (time_in_force IN ('GTC', 'IOC', 'FOK', 'DAY')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'accepted', 'filled', 'partially_filled', 'cancelled', 'rejected', 'expired')),
    filled_quantity DECIMAL(18,8) NOT NULL DEFAULT 0,
    average_fill_price DECIMAL(18,8),
    commission DECIMAL(10,2) DEFAULT 0,
    fees DECIMAL(10,2) DEFAULT 0,
    error_message TEXT,
    external_order_id VARCHAR(100),
    source VARCHAR(20) DEFAULT 'web' CHECK (source IN ('web', 'mobile', 'api', 'algorithm')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    filled_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- Trade executions
CREATE TABLE trading.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES trading.orders(id),
    account_id UUID NOT NULL REFERENCES trading.accounts(id),
    instrument_id UUID NOT NULL REFERENCES trading.instruments(id),
    side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
    quantity DECIMAL(18,8) NOT NULL,
    price DECIMAL(18,8) NOT NULL,
    value DECIMAL(18,2) NOT NULL,
    commission DECIMAL(10,2) DEFAULT 0,
    fees DECIMAL(10,2) DEFAULT 0,
    exchange_fee DECIMAL(10,2) DEFAULT 0,
    regulatory_fee DECIMAL(10,2) DEFAULT 0,
    external_trade_id VARCHAR(100),
    execution_venue VARCHAR(50),
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    settlement_date DATE
);

-- Positions
CREATE TABLE trading.positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES trading.accounts(id),
    instrument_id UUID NOT NULL REFERENCES trading.instruments(id),
    quantity DECIMAL(18,8) NOT NULL DEFAULT 0,
    average_cost DECIMAL(18,8) NOT NULL DEFAULT 0,
    market_value DECIMAL(18,2) NOT NULL DEFAULT 0,
    unrealized_pnl DECIMAL(18,2) NOT NULL DEFAULT 0,
    realized_pnl DECIMAL(18,2) NOT NULL DEFAULT 0,
    day_pnl DECIMAL(18,2) NOT NULL DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, instrument_id)
);

-- =====================================================
-- MARKET DATA SCHEMA - Prices, quotes, and market info
-- =====================================================

-- Real-time market data
CREATE TABLE market_data.quotes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_id UUID NOT NULL REFERENCES trading.instruments(id),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    bid_price DECIMAL(18,8),
    ask_price DECIMAL(18,8),
    bid_size DECIMAL(18,8),
    ask_size DECIMAL(18,8),
    last_price DECIMAL(18,8),
    last_size DECIMAL(18,8),
    volume BIGINT,
    open_price DECIMAL(18,8),
    high_price DECIMAL(18,8),
    low_price DECIMAL(18,8),
    previous_close DECIMAL(18,8),
    change_amount DECIMAL(18,8),
    change_percent DECIMAL(8,4)
);

-- Historical price data (OHLCV)
CREATE TABLE market_data.price_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_id UUID NOT NULL REFERENCES trading.instruments(id),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    interval_type VARCHAR(10) NOT NULL CHECK (interval_type IN ('1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M')),
    open_price DECIMAL(18,8) NOT NULL,
    high_price DECIMAL(18,8) NOT NULL,
    low_price DECIMAL(18,8) NOT NULL,
    close_price DECIMAL(18,8) NOT NULL,
    volume BIGINT NOT NULL DEFAULT 0,
    vwap DECIMAL(18,8),
    number_of_trades INTEGER DEFAULT 0,
    UNIQUE(instrument_id, timestamp, interval_type)
);

-- Order book data
CREATE TABLE market_data.order_book (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_id UUID NOT NULL REFERENCES trading.instruments(id),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    side VARCHAR(4) NOT NULL CHECK (side IN ('bid', 'ask')),
    price DECIMAL(18,8) NOT NULL,
    size DECIMAL(18,8) NOT NULL,
    level INTEGER NOT NULL,
    exchange VARCHAR(10)
);

-- News and announcements
CREATE TABLE market_data.news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    headline VARCHAR(500) NOT NULL,
    summary TEXT,
    content TEXT,
    source VARCHAR(100) NOT NULL,
    author VARCHAR(100),
    symbols TEXT[],
    categories TEXT[],
    sentiment_score DECIMAL(3,2),
    sentiment_label VARCHAR(20) CHECK (sentiment_label IN ('positive', 'negative', 'neutral')),
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    url TEXT,
    image_url TEXT
);

-- =====================================================
-- ANALYTICS SCHEMA - Technical indicators and analysis
-- =====================================================

-- Market analytics and technical indicators
CREATE TABLE analytics.market_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    instrument_id UUID NOT NULL REFERENCES trading.instruments(id),
    symbol VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    price DECIMAL(18,8) NOT NULL,
    volume BIGINT NOT NULL,
    volatility DECIMAL(8,6),
    moving_avg_5 DECIMAL(18,8),
    moving_avg_10 DECIMAL(18,8),
    moving_avg_20 DECIMAL(18,8),
    moving_avg_50 DECIMAL(18,8),
    moving_avg_200 DECIMAL(18,8),
    rsi DECIMAL(5,2),
    macd DECIMAL(18,8),
    macd_signal DECIMAL(18,8),
    macd_histogram DECIMAL(18,8),
    bollinger_upper DECIMAL(18,8),
    bollinger_middle DECIMAL(18,8),
    bollinger_lower DECIMAL(18,8),
    stochastic_k DECIMAL(5,2),
    stochastic_d DECIMAL(5,2),
    williams_r DECIMAL(5,2),
    atr DECIMAL(18,8),
    support_level DECIMAL(18,8),
    resistance_level DECIMAL(18,8),
    trend_direction VARCHAR(10) CHECK (trend_direction IN ('up', 'down', 'sideways')),
    UNIQUE(symbol, timestamp)
);

-- Portfolio analytics
CREATE TABLE analytics.portfolio_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES trading.accounts(id),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    total_value DECIMAL(18,2) NOT NULL,
    cash_value DECIMAL(18,2) NOT NULL,
    equity_value DECIMAL(18,2) NOT NULL,
    day_pnl DECIMAL(18,2) NOT NULL,
    total_pnl DECIMAL(18,2) NOT NULL,
    day_pnl_percent DECIMAL(8,4),
    total_pnl_percent DECIMAL(8,4),
    beta DECIMAL(6,4),
    sharpe_ratio DECIMAL(6,4),
    sortino_ratio DECIMAL(6,4),
    max_drawdown DECIMAL(8,4),
    var_95 DECIMAL(18,2),
    var_99 DECIMAL(18,2),
    volatility DECIMAL(8,6),
    concentration_risk DECIMAL(8,4),
    sector_exposure JSONB,
    country_exposure JSONB
);

-- Backtesting results
CREATE TABLE analytics.backtest_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    strategy_name VARCHAR(100) NOT NULL,
    strategy_config JSONB NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    initial_capital DECIMAL(18,2) NOT NULL,
    final_value DECIMAL(18,2) NOT NULL,
    total_return DECIMAL(8,4) NOT NULL,
    annualized_return DECIMAL(8,4),
    volatility DECIMAL(8,6),
    sharpe_ratio DECIMAL(6,4),
    max_drawdown DECIMAL(8,4),
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(6,4),
    total_trades INTEGER,
    winning_trades INTEGER,
    losing_trades INTEGER,
    avg_win DECIMAL(18,2),
    avg_loss DECIMAL(18,2),
    largest_win DECIMAL(18,2),
    largest_loss DECIMAL(18,2),
    results_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- RISK MANAGEMENT SCHEMA - Risk metrics and limits
-- =====================================================

-- Risk limits and controls
CREATE TABLE risk_management.risk_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES trading.accounts(id),
    limit_type VARCHAR(30) NOT NULL CHECK (limit_type IN ('position_size', 'daily_loss', 'total_exposure', 'concentration', 'leverage')),
    limit_value DECIMAL(18,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    instrument_filter JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    breach_action VARCHAR(20) DEFAULT 'alert' CHECK (breach_action IN ('alert', 'block', 'liquidate')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Risk events and alerts
CREATE TABLE risk_management.risk_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES trading.accounts(id),
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('limit_breach', 'margin_call', 'stop_loss', 'circuit_breaker')),
    severity VARCHAR(10) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description TEXT NOT NULL,
    risk_metric VARCHAR(30),
    current_value DECIMAL(18,2),
    threshold_value DECIMAL(18,2),
    instrument_id UUID REFERENCES trading.instruments(id),
    order_id UUID REFERENCES trading.orders(id),
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- VaR calculations
CREATE TABLE risk_management.var_calculations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES trading.accounts(id),
    calculation_date DATE NOT NULL,
    confidence_level DECIMAL(3,2) NOT NULL,
    time_horizon INTEGER NOT NULL,
    var_amount DECIMAL(18,2) NOT NULL,
    portfolio_value DECIMAL(18,2) NOT NULL,
    var_percentage DECIMAL(8,4) NOT NULL,
    method VARCHAR(20) NOT NULL CHECK (method IN ('historical', 'parametric', 'monte_carlo')),
    calculation_details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, calculation_date, confidence_level, time_horizon)
);

-- =====================================================
-- COMPLIANCE SCHEMA - Regulatory and audit data
-- =====================================================

-- Audit trail for all trading activities
CREATE TABLE compliance.audit_trail (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id),
    account_id UUID REFERENCES trading.accounts(id),
    action_type VARCHAR(50) NOT NULL,
    entity_type VARCHAR(30) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id UUID,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    description TEXT
);

-- Regulatory reports
CREATE TABLE compliance.regulatory_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL,
    report_period_start DATE NOT NULL,
    report_period_end DATE NOT NULL,
    file_path TEXT,
    file_hash VARCHAR(64),
    status VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('generated', 'submitted', 'acknowledged', 'rejected')),
    submission_id VARCHAR(100),
    generated_by UUID REFERENCES auth.users(id),
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE
);

-- KYC/AML monitoring
CREATE TABLE compliance.kyc_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    check_type VARCHAR(30) NOT NULL CHECK (check_type IN ('identity', 'address', 'sanctions', 'pep', 'adverse_media')),
    provider VARCHAR(30) NOT NULL,
    request_data JSONB,
    response_data JSONB,
    result VARCHAR(20) NOT NULL CHECK (result IN ('pass', 'fail', 'review', 'pending')),
    confidence_score DECIMAL(3,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- NOTIFICATIONS SCHEMA - Alerts and notifications
-- =====================================================

-- User notification preferences
CREATE TABLE notifications.notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    notification_type VARCHAR(30) NOT NULL,
    email_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    push_enabled BOOLEAN DEFAULT TRUE,
    in_app_enabled BOOLEAN DEFAULT TRUE,
    threshold_values JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, notification_type)
);

-- Notification queue
CREATE TABLE notifications.notification_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    notification_type VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    delivery_channels TEXT[] NOT NULL,
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    scheduled_for TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Authentication indexes
CREATE INDEX idx_users_email ON auth.users(email);
CREATE INDEX idx_users_username ON auth.users(username);
CREATE INDEX idx_users_status ON auth.users(status);
CREATE INDEX idx_user_sessions_token ON auth.user_sessions(session_token);
CREATE INDEX idx_user_sessions_user_id ON auth.user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON auth.user_sessions(expires_at);

-- Trading indexes
CREATE INDEX idx_instruments_symbol ON trading.instruments(symbol);
CREATE INDEX idx_instruments_exchange ON trading.instruments(exchange);
CREATE INDEX idx_instruments_type ON trading.instruments(instrument_type);
CREATE INDEX idx_accounts_user_id ON trading.accounts(user_id);
CREATE INDEX idx_accounts_account_number ON trading.accounts(account_number);
CREATE INDEX idx_orders_account_id ON trading.orders(account_id);
CREATE INDEX idx_orders_instrument_id ON trading.orders(instrument_id);
CREATE INDEX idx_orders_status ON trading.orders(status);
CREATE INDEX idx_orders_created_at ON trading.orders(created_at);
CREATE INDEX idx_trades_order_id ON trading.trades(order_id);
CREATE INDEX idx_trades_account_id ON trading.trades(account_id);
CREATE INDEX idx_trades_executed_at ON trading.trades(executed_at);
CREATE INDEX idx_positions_account_id ON trading.positions(account_id);

-- Market data indexes
CREATE INDEX idx_quotes_instrument_id ON market_data.quotes(instrument_id);
CREATE INDEX idx_quotes_timestamp ON market_data.quotes(timestamp);
CREATE INDEX idx_price_history_instrument_id ON market_data.price_history(instrument_id);
CREATE INDEX idx_price_history_timestamp ON market_data.price_history(timestamp);
CREATE INDEX idx_price_history_interval ON market_data.price_history(interval_type);
CREATE INDEX idx_order_book_instrument_id ON market_data.order_book(instrument_id);
CREATE INDEX idx_order_book_timestamp ON market_data.order_book(timestamp);
CREATE INDEX idx_news_symbols ON market_data.news USING GIN(symbols);
CREATE INDEX idx_news_published_at ON market_data.news(published_at);

-- Analytics indexes
CREATE INDEX idx_market_analytics_symbol ON analytics.market_analytics(symbol);
CREATE INDEX idx_market_analytics_timestamp ON analytics.market_analytics(timestamp);
CREATE INDEX idx_portfolio_analytics_account_id ON analytics.portfolio_analytics(account_id);
CREATE INDEX idx_portfolio_analytics_timestamp ON analytics.portfolio_analytics(timestamp);
CREATE INDEX idx_backtest_results_user_id ON analytics.backtest_results(user_id);

-- Risk management indexes
CREATE INDEX idx_risk_limits_account_id ON risk_management.risk_limits(account_id);
CREATE INDEX idx_risk_events_account_id ON risk_management.risk_events(account_id);
CREATE INDEX idx_risk_events_created_at ON risk_management.risk_events(created_at);
CREATE INDEX idx_var_calculations_account_id ON risk_management.var_calculations(account_id);

-- Compliance indexes
CREATE INDEX idx_audit_trail_user_id ON compliance.audit_trail(user_id);
CREATE INDEX idx_audit_trail_timestamp ON compliance.audit_trail(timestamp);
CREATE INDEX idx_audit_trail_action_type ON compliance.audit_trail(action_type);
CREATE INDEX idx_kyc_checks_user_id ON compliance.kyc_checks(user_id);

-- Notification indexes
CREATE INDEX idx_notification_queue_user_id ON notifications.notification_queue(user_id);
CREATE INDEX idx_notification_queue_status ON notifications.notification_queue(status);
CREATE INDEX idx_notification_queue_scheduled_for ON notifications.notification_queue(scheduled_for);

-- =====================================================
-- PARTITIONING FOR LARGE TABLES
-- =====================================================

-- Partition market data tables by date
CREATE TABLE market_data.quotes_y2024m01 PARTITION OF market_data.quotes
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE market_data.quotes_y2024m02 PARTITION OF market_data.quotes
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Add more partitions as needed...

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON auth.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON auth.user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON trading.accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON trading.orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_instruments_updated_at BEFORE UPDATE ON trading.instruments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate position values
CREATE OR REPLACE FUNCTION calculate_position_value(
    p_quantity DECIMAL,
    p_average_cost DECIMAL,
    p_current_price DECIMAL
)
RETURNS TABLE(
    market_value DECIMAL(18,2),
    unrealized_pnl DECIMAL(18,2)
) AS $
BEGIN
    RETURN QUERY SELECT 
        (p_quantity * p_current_price)::DECIMAL(18,2) as market_value,
        ((p_quantity * p_current_price) - (p_quantity * p_average_cost))::DECIMAL(18,2) as unrealized_pnl;
END;
$ LANGUAGE plpgsql;

-- Function to validate order quantities and prices
CREATE OR REPLACE FUNCTION validate_order()
RETURNS TRIGGER AS $
BEGIN
    -- Check quantity is positive
    IF NEW.quantity <= 0 THEN
        RAISE EXCEPTION 'Order quantity must be positive';
    END IF;
    
    -- Check price is positive for limit orders
    IF NEW.order_type IN ('limit', 'stop_limit') AND (NEW.price IS NULL OR NEW.price <= 0) THEN
        RAISE EXCEPTION 'Limit orders must have a positive price';
    END IF;
    
    -- Check stop price for stop orders
    IF NEW.order_type IN ('stop', 'stop_limit') AND (NEW.stop_price IS NULL OR NEW.stop_price <= 0) THEN
        RAISE EXCEPTION 'Stop orders must have a positive stop price';
    END IF;
    
    RETURN NEW;
END;
$ LANGUAGE plpgsql;

CREATE TRIGGER validate_order_trigger BEFORE INSERT OR UPDATE ON trading.orders
    FOR EACH ROW EXECUTE FUNCTION validate_order();

-- =====================================================
-- VIEWS FOR COMMON QUERIES
-- =====================================================

-- View for portfolio summary
CREATE VIEW trading.portfolio_summary AS
SELECT 
    a.id as account_id,
    a.account_number,
    a.cash_balance,
    COALESCE(SUM(p.market_value), 0) as equity_value,
    a.cash_balance + COALESCE(SUM(p.market_value), 0) as total_value,
    COALESCE(SUM(p.unrealized_pnl), 0) as unrealized_pnl,
    COALESCE(SUM(p.realized_pnl), 0) as realized_pnl,
    COUNT(p.id) as position_count
FROM trading.accounts a
LEFT JOIN trading.positions p ON a.id = p.account_id AND p.quantity != 0
GROUP BY a.id, a.account_number, a.cash_balance;

-- View for open orders
CREATE VIEW trading.open_orders AS
SELECT 
    o.*,
    i.symbol,
    i.name as instrument_name,
    a.account_number
FROM trading.orders o
JOIN trading.instruments i ON o.instrument_id = i.id
JOIN trading.accounts a ON o.account_id = a.id
WHERE o.status IN ('pending', 'submitted', 'accepted', 'partially_filled');

-- View for recent trades
CREATE VIEW trading.recent_trades AS
SELECT 
    t.*,
    i.symbol,
    i.name as instrument_name,
    a.account_number,
    o.order_type
FROM trading.trades t
JOIN trading.instruments i ON t.instrument_id = i.id
JOIN trading.accounts a ON t.account_id = a.id
JOIN trading.orders o ON t.order_id = o.id
ORDER BY t.executed_at DESC;

-- View for current positions
CREATE VIEW trading.current_positions AS
SELECT 
    p.*,
    i.symbol,
    i.name as instrument_name,
    i.instrument_type,
    a.account_number
FROM trading.positions p
JOIN trading.instruments i ON p.instrument_id = i.id
JOIN trading.accounts a ON p.account_id = a.id
WHERE p.quantity != 0;

-- =====================================================
-- SECURITY POLICIES (ROW LEVEL SECURITY)
-- =====================================================

-- Enable RLS on sensitive tables
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading.positions ENABLE ROW LEVEL SECURITY;

-- Policy for users to see only their own data
CREATE POLICY user_isolation_policy ON auth.users
    FOR ALL USING (id = current_setting('app.current_user_id')::UUID);

CREATE POLICY account_isolation_policy ON trading.accounts
    FOR ALL USING (user_id = current_setting('app.current_user_id')::UUID);

CREATE POLICY order_isolation_policy ON trading.orders
    FOR ALL USING (account_id IN (
        SELECT id FROM trading.accounts 
        WHERE user_id = current_setting('app.current_user_id')::UUID
    ));

-- Grant appropriate permissions
GRANT USAGE ON SCHEMA auth TO trading_app_role;
GRANT USAGE ON SCHEMA trading TO trading_app_role;
GRANT USAGE ON SCHEMA market_data TO trading_app_role;
GRANT USAGE ON SCHEMA analytics TO trading_app_role;
GRANT USAGE ON SCHEMA risk_management TO trading_app_role;
GRANT USAGE ON SCHEMA compliance TO trading_app_role;
GRANT USAGE ON SCHEMA notifications TO trading_app_role;

-- Grant table permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA auth TO trading_app_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA trading TO trading_app_role;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA market_data TO trading_app_role;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA analytics TO trading_app_role;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA risk_management TO trading_app_role;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA compliance TO trading_app_role;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA notifications TO trading_app_role;

-- Grant sequence permissions
GRANT USAGE ON ALL SEQUENCES IN SCHEMA auth TO trading_app_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA trading TO trading_app_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA market_data TO trading_app_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA analytics TO trading_app_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA risk_management TO trading_app_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA compliance TO trading_app_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA notifications TO trading_app_role;