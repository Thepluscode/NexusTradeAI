-- ================================================================
-- NexusTradeAI — Four-Learner Agentic AI Data Schema
-- ================================================================
-- Tables: decision_runs, executions, outcomes, rewards
-- These four tables form the shared outcome store for all learners.
-- ================================================================

-- 1. DECISION RUNS — What each agent proposed, with inputs and timestamps
CREATE TABLE IF NOT EXISTS decision_runs (
    id              SERIAL PRIMARY KEY,
    run_id          UUID DEFAULT gen_random_uuid() NOT NULL,
    timestamp       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    asset_class     VARCHAR(10) NOT NULL,  -- stock, forex, crypto
    direction       VARCHAR(10) NOT NULL,  -- long, short
    tier            VARCHAR(10) NOT NULL,
    -- Agent inputs
    price           DECIMAL(20,8),
    rsi             DECIMAL(6,2),
    momentum_pct    DECIMAL(8,4),
    volume_ratio    DECIMAL(6,2),
    trend_strength  DECIMAL(6,4),
    atr_pct         DECIMAL(8,4),
    regime          VARCHAR(50),
    regime_quality  DECIMAL(6,4),
    signal_score    DECIMAL(10,3),
    h1_trend        VARCHAR(10),
    session         VARCHAR(30),
    macd_histogram  DECIMAL(12,8),
    -- Agent outputs
    approved        BOOLEAN NOT NULL,
    confidence      DECIMAL(4,3) NOT NULL,  -- 0.000 - 1.000
    reason          TEXT,
    risk_flags      JSONB DEFAULT '[]',
    position_size_multiplier DECIMAL(4,2) DEFAULT 1.00,
    market_regime   VARCHAR(30),
    -- Agent metadata
    source          VARCHAR(30),  -- pipeline, cache, pass-through, killed, rule_based_fallback
    agents_consulted JSONB DEFAULT '[]',
    lessons_applied JSONB DEFAULT '[]',
    latency_ms      DECIMAL(8,2),
    -- Bridge context
    bridge_direction VARCHAR(10),
    bridge_confidence DECIMAL(4,3)
);
CREATE INDEX IF NOT EXISTS idx_decision_runs_symbol ON decision_runs(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_decision_runs_regime ON decision_runs(regime, approved);
CREATE INDEX IF NOT EXISTS idx_decision_runs_asset ON decision_runs(asset_class, timestamp);

-- 2. EXECUTIONS — What was actually traded, including slippage and fills
CREATE TABLE IF NOT EXISTS executions (
    id              SERIAL PRIMARY KEY,
    decision_run_id INTEGER REFERENCES decision_runs(id),
    timestamp       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    asset_class     VARCHAR(10) NOT NULL,
    direction       VARCHAR(10) NOT NULL,
    tier            VARCHAR(10) NOT NULL,
    strategy        VARCHAR(50),
    -- Order details
    intended_price  DECIMAL(20,8),
    fill_price      DECIMAL(20,8),
    slippage_pct    DECIMAL(8,6),
    quantity        DECIMAL(20,8),
    position_size_usd DECIMAL(12,2),
    -- Stop/target
    stop_loss       DECIMAL(20,8),
    take_profit     DECIMAL(20,8),
    -- Context at entry
    entry_rsi       DECIMAL(6,2),
    entry_regime    VARCHAR(50),
    entry_regime_quality DECIMAL(6,4),
    entry_momentum  DECIMAL(8,4),
    entry_volume_ratio DECIMAL(6,2),
    entry_atr_pct   DECIMAL(8,4),
    entry_score     DECIMAL(10,3),
    -- Agent decision
    agent_approved  BOOLEAN,
    agent_confidence DECIMAL(4,3),
    agent_reason    TEXT,
    agent_size_multiplier DECIMAL(4,2)
);
CREATE INDEX IF NOT EXISTS idx_executions_symbol ON executions(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_executions_decision ON executions(decision_run_id);

-- 3. OUTCOMES — Return, drawdown, holding period, volatility, rule breaches
CREATE TABLE IF NOT EXISTS outcomes (
    id              SERIAL PRIMARY KEY,
    execution_id    INTEGER REFERENCES executions(id),
    timestamp       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    asset_class     VARCHAR(10) NOT NULL,
    -- Exit details
    exit_price      DECIMAL(20,8) NOT NULL,
    exit_reason     VARCHAR(100) NOT NULL,  -- stop_loss, take_profit, trailing_stop, time_exit, manual
    exit_slippage_pct DECIMAL(8,6),
    -- Return metrics
    pnl_usd         DECIMAL(12,2),
    pnl_pct         DECIMAL(8,4),
    r_multiple      DECIMAL(8,4),  -- actual gain / risk taken
    -- Time metrics
    hold_duration_minutes DECIMAL(12,2),
    -- Risk metrics
    max_drawdown_pct DECIMAL(8,4),  -- worst intra-trade drawdown
    max_favorable_pct DECIMAL(8,4),  -- best intra-trade excursion
    -- Context
    exit_regime     VARCHAR(50),
    regime_changed  BOOLEAN DEFAULT FALSE,  -- did regime change during hold?
    -- Rule compliance
    rule_breaches   JSONB DEFAULT '[]',  -- anti-churning violations, size limit breaches, etc.
    -- Learning agent output
    pattern_type    VARCHAR(50),
    actionable_lesson TEXT,
    lesson_confidence DECIMAL(4,3)
);
CREATE INDEX IF NOT EXISTS idx_outcomes_symbol ON outcomes(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_outcomes_execution ON outcomes(execution_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_pattern ON outcomes(pattern_type);

-- 4. REWARDS — One final score derived from outcome, not just LLM judgment
CREATE TABLE IF NOT EXISTS rewards (
    id              SERIAL PRIMARY KEY,
    outcome_id      INTEGER REFERENCES outcomes(id),
    execution_id    INTEGER REFERENCES executions(id),
    decision_run_id INTEGER REFERENCES decision_runs(id),
    timestamp       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    asset_class     VARCHAR(10) NOT NULL,
    -- Component scores (each 0.0 - 1.0, weighted)
    realized_return_score   DECIMAL(6,4),  -- normalized P&L
    risk_adjusted_score     DECIMAL(6,4),  -- return / max drawdown
    drawdown_penalty        DECIMAL(6,4),  -- penalty for large drawdowns
    turnover_penalty        DECIMAL(6,4),  -- penalty for excessive trading
    research_quality_score  DECIMAL(6,4),  -- LLM judge on reasoning quality
    compliance_penalty      DECIMAL(6,4),  -- penalty for rule breaches
    -- Weights applied
    weights                 JSONB DEFAULT '{"return":0.30,"risk_adj":0.25,"drawdown":0.15,"turnover":0.10,"research":0.10,"compliance":0.10}',
    -- Final blended reward
    reward_score            DECIMAL(6,4) NOT NULL,  -- weighted blend, -1.0 to 1.0
    -- Regime segmentation
    regime_at_entry         VARCHAR(50),
    regime_at_exit          VARCHAR(50),
    -- Metadata
    calculated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rewards_symbol ON rewards(symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_rewards_outcome ON rewards(outcome_id);
CREATE INDEX IF NOT EXISTS idx_rewards_regime ON rewards(regime_at_entry, reward_score);
CREATE INDEX IF NOT EXISTS idx_rewards_score ON rewards(reward_score);

-- 4b. SCAN PATTERNS — Persistent pattern tracking (survives redeploys)
CREATE TABLE IF NOT EXISTS scan_patterns (
    id              SERIAL PRIMARY KEY,
    pattern_id      VARCHAR(100) NOT NULL UNIQUE,
    pattern_type    VARCHAR(50) NOT NULL,
    asset_class     VARCHAR(10) NOT NULL,
    description     TEXT,
    occurrences     INTEGER DEFAULT 0,
    wins            INTEGER DEFAULT 0,
    losses          INTEGER DEFAULT 0,
    win_rate        DECIMAL(6,4),
    avg_pnl         DECIMAL(8,4),
    avg_r_multiple  DECIMAL(8,4),
    confidence      DECIMAL(6,4),
    actionable_lesson TEXT,
    symbols         JSONB DEFAULT '[]',
    last_seen       TIMESTAMPTZ,
    last_updated    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_patterns_type ON scan_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_scan_patterns_asset ON scan_patterns(asset_class);

-- 4c. AGENT LESSONS — Persistent lesson storage (survives redeploys)
CREATE TABLE IF NOT EXISTS agent_lessons (
    id              SERIAL PRIMARY KEY,
    timestamp       TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    symbol          VARCHAR(20) NOT NULL,
    asset_class     VARCHAR(10) NOT NULL,
    direction       VARCHAR(10),
    pnl_pct         DECIMAL(8,4),
    pattern_type    VARCHAR(50),
    actionable_lesson TEXT,
    confidence      DECIMAL(4,3),
    regime          VARCHAR(50),
    exit_reason     VARCHAR(100)
);
CREATE INDEX IF NOT EXISTS idx_agent_lessons_asset ON agent_lessons(asset_class, timestamp);
CREATE INDEX IF NOT EXISTS idx_agent_lessons_regime ON agent_lessons(regime);

-- 5. SUPERVISOR BANDIT STATE — Contextual bandit for analyst/strategy selection
CREATE TABLE IF NOT EXISTS supervisor_state (
    id              SERIAL PRIMARY KEY,
    context_key     VARCHAR(100) NOT NULL UNIQUE, -- regime:asset_class:tier
    -- Arm stats (which agent/strategy combination to favor)
    arm_stats       JSONB NOT NULL DEFAULT '{}',
    -- UCB1 / Thompson sampling state
    total_pulls     INTEGER DEFAULT 0,
    last_updated    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supervisor_context ON supervisor_state(context_key);

-- 6. ANALYST RANKINGS — Track analyst (agent) performance by regime
CREATE TABLE IF NOT EXISTS analyst_rankings (
    id              SERIAL PRIMARY KEY,
    analyst_name    VARCHAR(50) NOT NULL,  -- decision_agent, market_agent, learning_agent
    asset_class     VARCHAR(10) NOT NULL,
    regime          VARCHAR(50) NOT NULL,
    -- Performance stats
    total_decisions INTEGER DEFAULT 0,
    correct_decisions INTEGER DEFAULT 0,  -- approved trades that won, rejected trades that would have lost
    accuracy        DECIMAL(6,4),
    avg_reward      DECIMAL(6,4),
    -- Time window
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    last_updated    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(analyst_name, asset_class, regime)
);
