'use strict';

/**
 * Signal-related Postgres schema — idempotent CREATE TABLE statements.
 * Called once at bot startup from initDb() after core tables exist.
 *
 * Tables created:
 * - historical_bars_cache: cached 1-min bars for backtest
 * - backtest_results: strategy backtest outputs + gate pass/fail
 * - shadow_signals: shadow-mode entries (no execution, tracks would-have-pnl)
 * - strategy_enabled: per-strategy state machine (disabled/backtest/shadow/live)
 */

async function initSignalSchema(dbPool) {
    if (!dbPool) {
        console.log('[signals/schema] no dbPool provided — skipping schema init');
        return;
    }

    // 1. historical_bars_cache — cached market data for backtests
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS historical_bars_cache (
            id SERIAL PRIMARY KEY,
            symbol TEXT NOT NULL,
            date DATE NOT NULL,
            interval TEXT NOT NULL,
            bars JSONB NOT NULL,
            source TEXT NOT NULL,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (symbol, date, interval, source)
        );
        CREATE INDEX IF NOT EXISTS idx_bars_cache_lookup
            ON historical_bars_cache (symbol, date, interval);
    `);
    console.log('✅ historical_bars_cache table ready');

    // 2. backtest_results — strategy validation outputs
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS backtest_results (
            id SERIAL PRIMARY KEY,
            strategy_name TEXT NOT NULL,
            asset_class TEXT NOT NULL,
            date_range_start DATE NOT NULL,
            date_range_end DATE NOT NULL,
            trade_count INT NOT NULL,
            win_rate NUMERIC(5,4),
            profit_factor NUMERIC(6,2),
            sharpe NUMERIC(6,2),
            max_drawdown_pct NUMERIC(5,2),
            coverage NUMERIC(4,3),
            passed_gate_a BOOLEAN NOT NULL,
            passed_walk_forward BOOLEAN,
            trades_sample JSONB,
            tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_backtest_strategy
            ON backtest_results (strategy_name, tested_at DESC);
    `);
    console.log('✅ backtest_results table ready');

    // 3. shadow_signals — shadow-mode signals (logged, not executed)
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS shadow_signals (
            id SERIAL PRIMARY KEY,
            strategy_name TEXT NOT NULL,
            symbol TEXT NOT NULL,
            asset_class TEXT NOT NULL,
            entry_time TIMESTAMPTZ NOT NULL,
            entry_price NUMERIC(12,6) NOT NULL,
            stop_loss NUMERIC(12,6) NOT NULL,
            take_profit NUMERIC(12,6) NOT NULL,
            tier TEXT,
            regime TEXT,
            context_snapshot JSONB,
            exit_time TIMESTAMPTZ,
            exit_price NUMERIC(12,6),
            exit_reason TEXT,
            would_have_pnl_usd NUMERIC(12,4),
            would_have_pnl_pct NUMERIC(8,4)
        );
        CREATE INDEX IF NOT EXISTS idx_shadow_open
            ON shadow_signals (strategy_name, exit_time)
            WHERE exit_time IS NULL;
    `);
    console.log('✅ shadow_signals table ready');

    // 4. strategy_enabled — per-strategy state machine
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS strategy_enabled (
            id SERIAL PRIMARY KEY,
            strategy_name TEXT NOT NULL UNIQUE,
            asset_class TEXT NOT NULL,
            state TEXT NOT NULL CHECK (state IN ('disabled','backtest','shadow','live')),
            reason TEXT,
            updated_by TEXT,
            last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    console.log('✅ strategy_enabled table ready');

    // 5. walk_forward_results — per-fold metrics from walk-forward validation
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS walk_forward_results (
            id SERIAL PRIMARY KEY,
            strategy_name TEXT NOT NULL,
            asset_class TEXT NOT NULL,
            fold_index INT NOT NULL,
            train_sharpe NUMERIC(8,3),
            test_sharpe NUMERIC(8,3),
            sharpe_decay NUMERIC(8,3),
            test_win_rate NUMERIC(5,4),
            test_profit_factor NUMERIC(8,3),
            test_trade_count INT,
            test_total_pnl NUMERIC(12,4),
            test_max_drawdown_pct NUMERIC(8,3),
            run_id TEXT NOT NULL,
            tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_wf_strategy_run
            ON walk_forward_results (strategy_name, run_id);
    `);
    console.log('✅ walk_forward_results table ready');

    // 6. strategy_alerts — auto-generated alerts for strategy health
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS strategy_alerts (
            id SERIAL PRIMARY KEY,
            strategy_name TEXT NOT NULL,
            alert_type TEXT NOT NULL,
            severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
            message TEXT NOT NULL,
            details JSONB,
            acknowledged BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_alerts_unacked
            ON strategy_alerts (strategy_name, acknowledged)
            WHERE acknowledged = FALSE;
    `);
    console.log('✅ strategy_alerts table ready');
}

module.exports = { initSignalSchema };
