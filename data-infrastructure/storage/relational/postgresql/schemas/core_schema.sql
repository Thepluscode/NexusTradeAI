-- PostgreSQL Core Schema for Nexus Trade AI
-- Handles user management, configuration, and relational data

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Create schemas
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS trading;
CREATE SCHEMA IF NOT EXISTS risk;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS system;

-- Users Schema

-- User accounts table
CREATE TABLE IF NOT EXISTS users.accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    date_of_birth DATE,
    country_code CHAR(2),
    timezone VARCHAR(50) DEFAULT 'UTC',
    language_code CHAR(2) DEFAULT 'en',
    account_type VARCHAR(20) DEFAULT 'retail' CHECK (account_type IN ('retail', 'professional', 'institutional')),
    subscription_tier VARCHAR(20) DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'premium', 'pro', 'enterprise')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
    email_verified BOOLEAN DEFAULT FALSE,
    phone_verified BOOLEAN DEFAULT FALSE,
    kyc_status VARCHAR(20) DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'in_progress', 'approved', 'rejected')),
    kyc_level INTEGER DEFAULT 0 CHECK (kyc_level BETWEEN 0 AND 3),
    risk_tolerance VARCHAR(20) DEFAULT 'moderate' CHECK (risk_tolerance IN ('conservative', 'moderate', 'aggressive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    login_count INTEGER DEFAULT 0,
    failed_login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- User profiles table
CREATE TABLE IF NOT EXISTS users.profiles (
    user_id UUID PRIMARY KEY REFERENCES users.accounts(id) ON DELETE CASCADE,
    avatar_url VARCHAR(500),
    bio TEXT,
    website VARCHAR(255),
    social_links JSONB DEFAULT '{}'::jsonb,
    trading_experience VARCHAR(20) CHECK (trading_experience IN ('beginner', 'intermediate', 'advanced', 'expert')),
    investment_goals TEXT[],
    preferred_assets TEXT[],
    notification_preferences JSONB DEFAULT '{}'::jsonb,
    privacy_settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions table
CREATE TABLE IF NOT EXISTS users.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.accounts(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    refresh_token VARCHAR(255) UNIQUE,
    ip_address INET,
    user_agent TEXT,
    device_info JSONB,
    location JSONB,
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- KYC documents table
CREATE TABLE IF NOT EXISTS users.kyc_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.accounts(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('passport', 'drivers_license', 'national_id', 'utility_bill', 'bank_statement')),
    document_number VARCHAR(100),
    file_url VARCHAR(500) NOT NULL,
    file_hash VARCHAR(64),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by UUID REFERENCES users.accounts(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trading Schema

-- Exchanges table
CREATE TABLE IF NOT EXISTS trading.exchanges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    website VARCHAR(255),
    api_url VARCHAR(255),
    websocket_url VARCHAR(255),
    supported_assets TEXT[],
    supported_order_types TEXT[],
    trading_fees JSONB DEFAULT '{}'::jsonb,
    withdrawal_fees JSONB DEFAULT '{}'::jsonb,
    min_order_sizes JSONB DEFAULT '{}'::jsonb,
    max_order_sizes JSONB DEFAULT '{}'::jsonb,
    rate_limits JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    requires_kyc BOOLEAN DEFAULT TRUE,
    supported_countries TEXT[],
    restricted_countries TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trading pairs table
CREATE TABLE IF NOT EXISTS trading.pairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exchange_id UUID NOT NULL REFERENCES trading.exchanges(id),
    symbol VARCHAR(20) NOT NULL,
    base_asset VARCHAR(10) NOT NULL,
    quote_asset VARCHAR(10) NOT NULL,
    display_name VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    min_quantity DECIMAL(20,8),
    max_quantity DECIMAL(20,8),
    quantity_precision INTEGER DEFAULT 8,
    price_precision INTEGER DEFAULT 8,
    min_notional DECIMAL(20,8),
    maker_fee DECIMAL(6,4),
    taker_fee DECIMAL(6,4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exchange_id, symbol)
);

-- User API keys table
CREATE TABLE IF NOT EXISTS trading.api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.accounts(id) ON DELETE CASCADE,
    exchange_id UUID NOT NULL REFERENCES trading.exchanges(id),
    name VARCHAR(100) NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    api_secret_encrypted TEXT NOT NULL,
    passphrase_encrypted TEXT,
    permissions TEXT[] DEFAULT ARRAY['read'],
    is_active BOOLEAN DEFAULT TRUE,
    is_testnet BOOLEAN DEFAULT FALSE,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Portfolios table
CREATE TABLE IF NOT EXISTS trading.portfolios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.accounts(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    base_currency VARCHAR(10) DEFAULT 'USD',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    total_value DECIMAL(20,8) DEFAULT 0,
    total_pnl DECIMAL(20,8) DEFAULT 0,
    total_pnl_percentage DECIMAL(8,4) DEFAULT 0,
    risk_score DECIMAL(4,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Risk Schema

-- Risk profiles table
CREATE TABLE IF NOT EXISTS risk.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.accounts(id) ON DELETE CASCADE,
    portfolio_id UUID REFERENCES trading.portfolios(id),
    max_position_size DECIMAL(8,4) DEFAULT 0.1, -- 10% max position
    max_daily_loss DECIMAL(8,4) DEFAULT 0.05, -- 5% max daily loss
    max_drawdown DECIMAL(8,4) DEFAULT 0.2, -- 20% max drawdown
    var_limit DECIMAL(8,4) DEFAULT 0.05, -- 5% VaR limit
    leverage_limit DECIMAL(4,2) DEFAULT 1.0, -- No leverage by default
    allowed_asset_types TEXT[] DEFAULT ARRAY['crypto', 'stocks'],
    restricted_symbols TEXT[] DEFAULT ARRAY[]::TEXT[],
    max_order_value DECIMAL(20,8),
    max_daily_trades INTEGER DEFAULT 100,
    cooling_period_minutes INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Risk limits table
CREATE TABLE IF NOT EXISTS risk.limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.accounts(id),
    limit_type VARCHAR(50) NOT NULL,
    limit_value DECIMAL(20,8) NOT NULL,
    current_value DECIMAL(20,8) DEFAULT 0,
    period VARCHAR(20) DEFAULT 'daily' CHECK (period IN ('daily', 'weekly', 'monthly', 'yearly')),
    reset_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Compliance Schema

-- Audit logs table
CREATE TABLE IF NOT EXISTS compliance.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users.accounts(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    session_id UUID REFERENCES users.sessions(id),
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Regulatory reports table
CREATE TABLE IF NOT EXISTS compliance.regulatory_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_type VARCHAR(50) NOT NULL,
    jurisdiction VARCHAR(10) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    file_url VARCHAR(500),
    file_hash VARCHAR(64),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'generated', 'submitted', 'approved')),
    submitted_at TIMESTAMP WITH TIME ZONE,
    submitted_by UUID REFERENCES users.accounts(id),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analytics Schema

-- User analytics table
CREATE TABLE IF NOT EXISTS analytics.user_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users.accounts(id),
    metric_date DATE NOT NULL,
    total_trades INTEGER DEFAULT 0,
    total_volume DECIMAL(20,8) DEFAULT 0,
    total_pnl DECIMAL(20,8) DEFAULT 0,
    win_rate DECIMAL(5,4) DEFAULT 0,
    avg_trade_size DECIMAL(20,8) DEFAULT 0,
    max_drawdown DECIMAL(8,4) DEFAULT 0,
    sharpe_ratio DECIMAL(8,4),
    active_positions INTEGER DEFAULT 0,
    portfolio_value DECIMAL(20,8) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, metric_date)
);

-- System Schema

-- Configuration table
CREATE TABLE IF NOT EXISTS system.configuration (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_encrypted BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Feature flags table
CREATE TABLE IF NOT EXISTS system.feature_flags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT FALSE,
    rollout_percentage INTEGER DEFAULT 0 CHECK (rollout_percentage BETWEEN 0 AND 100),
    target_users UUID[],
    target_groups TEXT[],
    conditions JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_email ON users.accounts(email);
CREATE INDEX IF NOT EXISTS idx_accounts_username ON users.accounts(username);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON users.accounts(status);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON users.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON users.sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_kyc_user_id ON users.kyc_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON trading.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON trading.portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON compliance.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON compliance.audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_user_metrics_user_date ON analytics.user_metrics(user_id, metric_date);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON users.accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON users.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_exchanges_updated_at BEFORE UPDATE ON trading.exchanges FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_pairs_updated_at BEFORE UPDATE ON trading.pairs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON trading.api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_portfolios_updated_at BEFORE UPDATE ON trading.portfolios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_risk_profiles_updated_at BEFORE UPDATE ON risk.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_risk_limits_updated_at BEFORE UPDATE ON risk.limits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_configuration_updated_at BEFORE UPDATE ON system.configuration FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON system.feature_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
