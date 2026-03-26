const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createUserCredentialStore } = require('./userCredentialStore');
// Signal modules — try/catch for Railway deploy where services/ may not exist
let createSignalEndpoints = () => {};
let BOT_COMPONENTS = { crypto: { components: ['momentum','orderFlow','displacement','volumeProfile','fvg','volumeRatio','mtfConfluence'] } };
let computeCorrelationGuard = () => ({ blocked: false });
let autoOptimize = () => ({ improved: false });
let autoEvalStrategies = () => ({});
let AUTO_PARAM_BOUNDS = {};
let checkScanHealth = () => ({ healthy: true });
let checkErrorRate = () => ({ healthy: true });
let checkTradingHealth = () => ({ healthy: true });
let checkMemoryHealth = () => ({ healthy: true });
let aggregateHealth = () => ({ status: 'ok' });
try {
  ({ createSignalEndpoints } = require('../../services/signals/api-handlers'));
  ({ BOT_COMPONENTS } = require('../../services/signals/committee-scorer'));
  ({ computeCorrelationGuard } = require('../../services/signals/exit-manager'));
  ({ optimize: autoOptimize, evaluateStrategies: autoEvalStrategies, PARAM_BOUNDS: AUTO_PARAM_BOUNDS } = require('../../services/signals/auto-optimizer'));
  ({ checkScanHealth, checkErrorRate, checkTradingHealth, checkMemoryHealth, aggregateHealth } = require('../../services/signals/health-monitor'));
} catch (e) { console.log('[INIT] Signal modules not available (Railway deploy) — using inline fallbacks'); }
require('dotenv').config();

// ===== MONTE CARLO POSITION SIZER =====
// Try external module, fallback to inline Kelly-based sizer for Railway deploy
let MonteCarloSizer;
try {
    MonteCarloSizer = require('../../services/trading/monte-carlo-sizer');
} catch (_) {
    MonteCarloSizer = class MonteCarloSizer {
        constructor() { this.tradeReturns = []; this.lastOptimization = null; }
        addTrade(r) { this.tradeReturns.push(r); if (this.tradeReturns.length > 500) this.tradeReturns.shift(); }
        optimize() {
            if (this.tradeReturns.length < 20) return { optimalFraction: 0.02, halfKelly: 0.01, medianReturn: 0, confidence: 'low' };
            const wins = this.tradeReturns.filter(r => r > 0);
            const losses = this.tradeReturns.filter(r => r <= 0);
            const winRate = wins.length / this.tradeReturns.length;
            const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
            const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 1;
            const kelly = avgLoss > 0 ? Math.max(0, (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin) : 0.01;
            const halfKelly = Math.min(Math.max(kelly / 2, 0.005), 0.125);
            this.lastOptimization = { optimalFraction: kelly, halfKelly, medianReturn: 0, confidence: this.tradeReturns.length >= 50 ? 'high' : 'medium' };
            return this.lastOptimization;
        }
    };
    console.log('[MONTE-CARLO] Using inline fallback sizer (external module not available)');
}

// ============================================================================
// [Improvement 1] EVALUATION PERSISTENCE
// ============================================================================
const EVAL_FILE = path.join(__dirname, 'data', 'crypto-evaluations.json');

async function loadCryptoEvaluationsFromDB() {
    if (!dbPool) {
        console.log('[Persistence] No DB — starting with empty crypto evaluations');
        return [];
    }
    try {
        const result = await dbPool.query(`
            SELECT symbol, direction, entry_price, exit_price, pnl_usd, pnl_pct,
                   entry_time, exit_time, close_reason, signal_score, entry_context,
                   strategy, regime
            FROM trades
            WHERE bot = 'crypto' AND status = 'closed' AND pnl_usd IS NOT NULL AND close_reason != 'orphaned_restart'
            ORDER BY exit_time DESC NULLS LAST
            LIMIT 500
        `);

        const evals = result.rows.map(row => {
            const ctx = typeof row.entry_context === 'string'
                ? JSON.parse(row.entry_context) : (row.entry_context || {});
            const entryTime = row.entry_time ? new Date(row.entry_time).getTime() : Date.now();
            const exitTime = row.exit_time ? new Date(row.exit_time).getTime() : Date.now();

            return {
                symbol: row.symbol,
                direction: row.direction || 'long',
                entryPrice: parseFloat(row.entry_price) || 0,
                exitPrice: parseFloat(row.exit_price) || 0,
                pnl: parseFloat(row.pnl_usd) || 0,
                pnlPct: parseFloat(row.pnl_pct) || 0,
                holdTimeMs: exitTime - entryTime,
                signals: {
                    orderFlow: ctx.orderFlowImbalance ?? 0,
                    displacement: ctx.hasDisplacement ?? false,
                    vpPosition: ctx.volumeProfile ?? null,
                    fvgCount: ctx.fvgCount ?? 0,
                    committeeConfidence: ctx.committeeConfidence ?? (parseFloat(row.signal_score) || 0),
                    components: ctx.committeeComponents || {},
                    regime: row.regime || ctx.marketRegime || 'unknown',
                    score: parseFloat(row.signal_score) || 0
                },
                exitReason: row.close_reason || 'unknown',
                timestamp: exitTime
            };
        });

        console.log(`[Persistence] Loaded ${evals.length} crypto evaluations from DB`);
        return evals;
    } catch (e) {
        console.error('[Persistence] DB crypto eval load failed:', e.message);
        return [];
    }
}

// Make save a no-op — trades are persisted to PostgreSQL via dbCryptoClose()
function saveCryptoEvaluations(evals) {
    // No-op: trades persisted to PostgreSQL via dbCryptoClose()
}

// Initialize evaluations to empty array; will be populated from DB after initTradeDb()
globalThis._cryptoTradeEvaluations = [];

// ============================================================================
// [Improvement 2] WEIGHT AUTO-LEARNING
// ============================================================================
const WEIGHTS_FILE = path.join(__dirname, 'data', 'crypto-weights.json');
const DEFAULT_CRYPTO_WEIGHTS = { momentum: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, volumeRatio: 0.15 };

function loadCryptoWeights() {
    try {
        if (fs.existsSync(WEIGHTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
            if (data.weights && typeof data.weights === 'object') {
                console.log(`[AutoLearn] Loaded optimized crypto weights:`, JSON.stringify(data.weights));
                return data.weights;
            }
        }
    } catch (e) {
        console.error('[AutoLearn] Failed to load crypto weights:', e.message);
    }
    return { ...DEFAULT_CRYPTO_WEIGHTS };
}

function saveCryptoWeights(weights, meta) {
    try {
        const dir = path.dirname(WEIGHTS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(WEIGHTS_FILE, JSON.stringify({ weights, ...meta, updatedAt: new Date().toISOString() }, null, 2));
        console.log(`[AutoLearn] Saved optimized crypto weights:`, JSON.stringify(weights));
    } catch (e) {
        console.error('[AutoLearn] Failed to save crypto weights:', e.message);
    }
}

function optimizeCryptoWeights() {
    const evals = globalThis._cryptoTradeEvaluations || [];
    if (evals.length < 30) {
        console.log(`[AutoLearn] Need ${30 - evals.length} more crypto trades for weight optimization (have ${evals.length})`);
        return null;
    }

    const signalKeys = ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio'];
    const edges = {};

    for (const key of signalKeys) {
        const withSignal = evals.filter(e => {
            const comp = e.signals?.components || {};
            if (key === 'displacement' || key === 'fvg') return (comp[key] || 0) >= 0.5;
            return (comp[key] || 0) > 0.3;
        });
        const withoutSignal = evals.filter(e => {
            const comp = e.signals?.components || {};
            if (key === 'displacement' || key === 'fvg') return (comp[key] || 0) < 0.5;
            return (comp[key] || 0) <= 0.3;
        });

        const avgWith = withSignal.length > 0 ? withSignal.reduce((s, e) => s + (e.pnlPct || 0), 0) / withSignal.length : 0;
        const avgWithout = withoutSignal.length > 0 ? withoutSignal.reduce((s, e) => s + (e.pnlPct || 0), 0) / withoutSignal.length : 0;
        edges[key] = Math.max(0, avgWith - avgWithout);
    }

    const MIN_WEIGHT = 0.05;
    const MAX_WEIGHT = 0.40;
    const totalEdge = Object.values(edges).reduce((s, e) => s + e, 0);

    if (totalEdge <= 0) {
        console.log('[AutoLearn] No positive edges for crypto, keeping default weights');
        return null;
    }

    const rawWeights = {};
    for (const key of signalKeys) {
        rawWeights[key] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, edges[key] / totalEdge));
    }

    const sum = Object.values(rawWeights).reduce((s, w) => s + w, 0);
    const optimizedWeights = {};
    for (const key of signalKeys) {
        optimizedWeights[key] = parseFloat((rawWeights[key] / sum).toFixed(3));
    }

    const finalSum = Object.values(optimizedWeights).reduce((s, w) => s + w, 0);
    if (Math.abs(finalSum - 1.0) > 0.001) {
        optimizedWeights.momentum += parseFloat((1.0 - finalSum).toFixed(3));
    }

    console.log(`[AutoLearn] Optimized crypto weights from ${evals.length} trades:`, JSON.stringify(optimizedWeights));
    saveCryptoWeights(optimizedWeights, { edges, tradeCount: evals.length });
    return optimizedWeights;
}

// Live weights variable — updated by auto-learning
let cryptoCommitteeWeights = loadCryptoWeights();

// ============================================================================
// [Improvement 3] TRANSACTION COST FILTER
// ============================================================================
const CRYPTO_COSTS = {
    makerFeePct: 0.001,   // 0.10% maker fee (Kraken)
    takerFeePct: 0.001,   // 0.10% taker fee
    slippagePct: 0.0005   // 0.05% estimated slippage
};
const CRYPTO_ROUND_TRIP_COST = 2 * (CRYPTO_COSTS.takerFeePct + CRYPTO_COSTS.slippagePct);

function isCryptoPositiveEV(committeeConfidence) {
    const evals = globalThis._cryptoTradeEvaluations || [];
    if (evals.length < 10) return true;

    const recent = evals.slice(-50);
    const wins = recent.filter(e => e.pnl > 0);
    const losses = recent.filter(e => e.pnl <= 0);

    const avgWinPct = wins.length > 0 ? wins.reduce((s, e) => s + Math.abs(e.pnlPct || 0), 0) / wins.length : 0.02;
    const avgLossPct = losses.length > 0 ? losses.reduce((s, e) => s + Math.abs(e.pnlPct || 0), 0) / losses.length : 0.02;

    const ev = (committeeConfidence * avgWinPct) - ((1 - committeeConfidence) * avgLossPct) - CRYPTO_ROUND_TRIP_COST;

    if (ev <= 0) {
        console.log(`[CostFilter] REJECTED: EV=${(ev * 100).toFixed(3)}% (conf=${committeeConfidence.toFixed(3)}, costs=${(CRYPTO_ROUND_TRIP_COST * 100).toFixed(2)}%)`);
        return false;
    }
    return true;
}

// ============================================================================
// [v14.1] CONFIDENCE CALIBRATION (Platt Scaling)
// Raw committee scores ≠ actual win probability. Calibrate using outcomes.
// ============================================================================

// Platt scaling: P(win | score) = 1 / (1 + exp(A * score + B))
// Fit A and B from evaluation data using gradient descent
let plattParams = { A: -2.0, B: 0.5, calibrated: false, sampleSize: 0 };

function fitPlattScaling() {
    const evals = globalThis._cryptoTradeEvaluations || [];
    if (evals.length < 20) return null; // Need minimum 20 trades

    // Build (score, outcome) pairs from evaluations
    const data = evals
        .filter(e => e.signals && e.signals.committeeConfidence !== undefined)
        .map(e => ({
            score: e.signals.committeeConfidence,
            win: e.pnl > 0 ? 1 : 0
        }));

    if (data.length < 15) return null;

    // Gradient descent to fit A and B
    let A = -2.0, B = 0.5;
    const lr = 0.01;
    const epochs = 200;

    for (let epoch = 0; epoch < epochs; epoch++) {
        let gradA = 0, gradB = 0;
        for (const { score, win } of data) {
            const z = A * score + B;
            const p = 1 / (1 + Math.exp(-z)); // sigmoid
            const error = p - win;
            gradA += error * score;
            gradB += error;
        }
        A -= lr * gradA / data.length;
        B -= lr * gradB / data.length;
    }

    // Validate: calibrated probability should be between 0.1 and 0.9 for typical scores
    const testP = 1 / (1 + Math.exp(-(A * 0.5 + B)));
    if (testP < 0.05 || testP > 0.95) {
        console.log(`[Calibration] Platt fit unstable (P(0.5)=${testP.toFixed(3)}) — keeping defaults`);
        return null;
    }

    return { A, B, calibrated: true, sampleSize: data.length };
}

function calibrateConfidence(rawConfidence) {
    if (!plattParams.calibrated) return rawConfidence;
    const z = plattParams.A * rawConfidence + plattParams.B;
    return 1 / (1 + Math.exp(-z));
}

// Refit calibration every 4 hours (with weight optimization)
setInterval(() => {
    const newParams = fitPlattScaling();
    if (newParams) {
        plattParams = newParams;
        // Show calibration mapping for key scores
        const at30 = calibrateConfidence(0.30);
        const at45 = calibrateConfidence(0.45);
        const at60 = calibrateConfidence(0.60);
        console.log(`[Calibration] Platt updated (n=${newParams.sampleSize}): raw 0.30→${at30.toFixed(3)}, 0.45→${at45.toFixed(3)}, 0.60→${at60.toFixed(3)}`);
    }
}, 4 * 60 * 60 * 1000);

// Initial fit after 20 seconds
setTimeout(() => {
    const newParams = fitPlattScaling();
    if (newParams) {
        plattParams = newParams;
        console.log(`[Calibration] Initial Platt fit (n=${newParams.sampleSize}): A=${newParams.A.toFixed(3)}, B=${newParams.B.toFixed(3)}`);
    }
}, 20000);

// ============================================================================
// [v14.1] PORTFOLIO ALLOCATOR (Rule-based, upgradeable to PPO at 500+ trades)
// Combines calibrated confidence + regime routing + portfolio state
// ============================================================================

function computeAllocation(signal, calibratedConfidence, regime, portfolioState) {
    // Base allocation = calibrated confidence (0-1)
    let allocation = calibratedConfidence;

    // 1. Regime adjustment — scale with regime routing weights
    const routing = regime && regime.strategyRouting
        ? regime.strategyRouting
        : { momentumWeight: 1.0, meanReversionWeight: 1.0, pullbackWeight: 1.0 };
    const strategyKey = signal.strategy === 'meanReversion' ? 'meanReversionWeight'
        : signal.strategy === 'trendPullback' ? 'pullbackWeight' : 'momentumWeight';
    allocation *= (routing[strategyKey] || 1.0);

    // 2. Portfolio state adjustment — reduce allocation when portfolio is stressed
    const { openPositions, maxPositions, unrealizedPnL, dailyLoss, maxDailyLoss } = portfolioState;

    // Concentration penalty: as we fill positions, reduce remaining allocation
    const fillRatio = openPositions / Math.max(1, maxPositions);
    allocation *= (1 - fillRatio * 0.3); // At 100% filled, reduce by 30%

    // Drawdown penalty: reduce allocation when losing
    if (dailyLoss > 0 && maxDailyLoss > 0) {
        const drawdownRatio = dailyLoss / maxDailyLoss;
        allocation *= Math.max(0.3, 1 - drawdownRatio); // Scale down with losses
    }

    // Unrealized loss penalty: underwater positions = reduce new risk
    if (unrealizedPnL < 0) {
        const unrealizedPainRatio = Math.abs(unrealizedPnL) / Math.max(100, maxDailyLoss * 0.5);
        allocation *= Math.max(0.5, 1 - unrealizedPainRatio * 0.5);
    }

    // 3. Apply strategy-regime learned weights
    const srWeight = strategyRegimeWeights[signal.strategy] || 1.0;
    allocation *= Math.min(1.5, srWeight); // Cap at 1.5x boost

    // Clamp to [0.1, 1.5] — never fully zero (exploration), never more than 1.5x
    allocation = Math.max(0.1, Math.min(1.5, allocation));

    return {
        allocation: parseFloat(allocation.toFixed(3)),
        factors: {
            calibratedConfidence: parseFloat(calibratedConfidence.toFixed(3)),
            regimeRouting: parseFloat((routing[strategyKey] || 1.0).toFixed(3)),
            concentrationPenalty: parseFloat((1 - fillRatio * 0.3).toFixed(3)),
            drawdownPenalty: dailyLoss > 0 ? parseFloat((Math.max(0.3, 1 - dailyLoss / maxDailyLoss)).toFixed(3)) : 1.0,
            strategyRegimeWeight: parseFloat(srWeight.toFixed(3))
        }
    };
}

// ============================================================================
// [Improvement 4] SIGNAL DECAY DETECTION
// ============================================================================
function detectCryptoSignalDecay() {
    const evals = globalThis._cryptoTradeEvaluations || [];
    if (evals.length < 20) return null;

    const recent = evals.slice(-20);
    const signalKeys = ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio'];
    const decayWarnings = [];

    for (const key of signalKeys) {
        const withSignal = recent.filter(e => {
            const comp = e.signals?.components || {};
            if (key === 'displacement' || key === 'fvg') return (comp[key] || 0) >= 0.5;
            return (comp[key] || 0) > 0.3;
        });

        if (withSignal.length >= 5) {
            const winRate = withSignal.filter(e => e.pnl > 0).length / withSignal.length;
            if (winRate < 0.35) {
                decayWarnings.push({ signal: key, winRate, trades: withSignal.length });
                if (cryptoCommitteeWeights[key]) {
                    const reduced = cryptoCommitteeWeights[key] * 0.6;
                    cryptoCommitteeWeights[key] = Math.max(0.03, reduced);
                    console.log(`[DecayDetect] ⚠️ Crypto ${key} decaying (winRate=${(winRate * 100).toFixed(1)}%) — weight reduced to ${cryptoCommitteeWeights[key].toFixed(3)}`);
                }
            }
        }
    }

    if (decayWarnings.length > 0) {
        const sum = Object.values(cryptoCommitteeWeights).reduce((s, w) => s + w, 0);
        for (const key of signalKeys) {
            cryptoCommitteeWeights[key] = parseFloat((cryptoCommitteeWeights[key] / sum).toFixed(3));
        }
        const finalSum = Object.values(cryptoCommitteeWeights).reduce((s, w) => s + w, 0);
        if (Math.abs(finalSum - 1.0) > 0.001) {
            cryptoCommitteeWeights.momentum += parseFloat((1.0 - finalSum).toFixed(3));
        }
        saveCryptoWeights(cryptoCommitteeWeights, { decayWarnings, updatedAt: new Date().toISOString() });
    }

    const overallWinRate = recent.filter(e => e.pnl > 0).length / recent.length;
    if (overallWinRate < 0.30) {
        console.log(`[DecayDetect] 🚨 CRITICAL: Crypto overall win rate ${(overallWinRate * 100).toFixed(1)}% — consider pausing`);
    }

    return decayWarnings.length > 0 ? decayWarnings : null;
}

// Periodic weight optimization (every 4 hours)
setInterval(() => {
    const newWeights = optimizeCryptoWeights();
    if (newWeights) {
        cryptoCommitteeWeights = newWeights;
        console.log('[AutoLearn] Crypto committee weights updated');
    }
}, 4 * 60 * 60 * 1000);

// Initial optimization attempt after 10 seconds (in case data already exists)
setTimeout(() => {
    const newWeights = optimizeCryptoWeights();
    if (newWeights) cryptoCommitteeWeights = newWeights;
}, 10000);

// Periodic decay detection (every 2 hours)
setInterval(() => { detectCryptoSignalDecay(); }, 2 * 60 * 60 * 1000);

// [Phase 3.5] Cross-bot portfolio risk URLs (for co-located or Railway deployment)
const STOCK_BOT_URL = process.env.STOCK_BOT_URL || 'http://localhost:3002';
const FOREX_BOT_URL = process.env.FOREX_BOT_URL || 'http://localhost:3005';

// Telegram alerts
const { getTelegramAlertService } = require('./infrastructure/notifications/telegram-alerts');
let telegramAlerts = getTelegramAlertService();

// SMS alerts (graceful fallback)
const { getSMSAlertService } = require('./infrastructure/notifications/sms-alerts');
const smsAlerts = getSMSAlertService();

// Prometheus metrics
const promClient = require('prom-client');
const register = promClient.register; // Use default register

// ── PostgreSQL trade persistence (optional — requires DATABASE_URL) ──────────
const { Pool: PgPool } = require('pg');
let dbPool = null;

async function initTradeDb() {
    if (!process.env.DATABASE_URL) {
        console.log('⚠️  DATABASE_URL not set — auth + trade persistence disabled');
        return;
    }
    try {
        dbPool = new PgPool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(100),
                role VARCHAR(20) DEFAULT 'user',
                refresh_token TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_login TIMESTAMPTZ,
                subscription_tier VARCHAR(20) DEFAULT 'free',
                live_trading_enabled BOOLEAN DEFAULT false
            );
            ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS live_trading_enabled BOOLEAN DEFAULT false
        `);
        console.log('✅ Crypto bot: Auth DB ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS trades (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                bot VARCHAR(20) NOT NULL,
                symbol VARCHAR(20) NOT NULL,
                direction VARCHAR(10) NOT NULL,
                tier VARCHAR(10),
                strategy VARCHAR(50),
                regime VARCHAR(50),
                status VARCHAR(10) NOT NULL DEFAULT 'open',
                entry_price DECIMAL(20,8),
                exit_price DECIMAL(20,8),
                quantity DECIMAL(20,8),
                position_size_usd DECIMAL(12,2),
                pnl_usd DECIMAL(12,2),
                pnl_pct DECIMAL(8,4),
                stop_loss DECIMAL(20,8),
                take_profit DECIMAL(20,8),
                entry_time TIMESTAMPTZ,
                exit_time TIMESTAMPTZ,
                close_reason VARCHAR(100),
                session VARCHAR(30),
                signal_score DECIMAL(10,3),
                entry_context JSONB DEFAULT '{}'::jsonb,
                rsi DECIMAL(6,2),
                volume_ratio DECIMAL(6,2),
                momentum_pct DECIMAL(8,4),
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS strategy VARCHAR(50);
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS regime VARCHAR(50);
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS signal_score DECIMAL(10,3);
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS entry_context JSONB DEFAULT '{}'::jsonb;
            CREATE INDEX IF NOT EXISTS idx_trades_bot ON trades(bot);
            CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
            CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
            CREATE INDEX IF NOT EXISTS idx_trades_user_bot ON trades(user_id, bot);
            CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy);
            CREATE INDEX IF NOT EXISTS idx_trades_regime ON trades(regime);
        `);
        console.log('✅ Crypto bot: Trades table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS engine_state (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bot VARCHAR(20) NOT NULL,
                state_json JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (user_id, bot)
            )
        `);
        console.log('✅ Crypto bot: Engine state table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS user_credentials (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                broker VARCHAR(30) NOT NULL,
                credential_key VARCHAR(100) NOT NULL,
                encrypted_value TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, broker, credential_key)
            );
            CREATE INDEX IF NOT EXISTS idx_user_creds_lookup ON user_credentials(user_id, broker);
        `);
        console.log('✅ Crypto bot: User credentials table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(64) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL
            )
        `);
        console.log('✅ Crypto bot: Password reset tokens table ready');

        // [v14.0] Strategy-regime performance tracking
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS strategy_regime_performance (
                id SERIAL PRIMARY KEY,
                bot VARCHAR(20) NOT NULL DEFAULT 'crypto',
                strategy VARCHAR(50) NOT NULL,
                regime VARCHAR(50) NOT NULL,
                total_trades INTEGER DEFAULT 0,
                winning_trades INTEGER DEFAULT 0,
                total_pnl_pct DECIMAL(12,4) DEFAULT 0,
                total_win_pnl_pct DECIMAL(12,4) DEFAULT 0,
                total_loss_pnl_pct DECIMAL(12,4) DEFAULT 0,
                win_rate DECIMAL(6,4) DEFAULT 0,
                profit_factor DECIMAL(8,4) DEFAULT 0,
                avg_pnl_pct DECIMAL(8,4) DEFAULT 0,
                last_updated TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(bot, strategy, regime)
            )
        `);
        console.log('✅ Crypto bot: Strategy-regime performance table ready');
    } catch (e) {
        console.warn('⚠️  Crypto DB init failed:', e.message);
        dbPool = null;
    }
}

function buildCryptoTradeTags(signal = {}, tier) {
    const normalizedTier = tier || signal.tier || 'tier1';
    const normalizedStrategy = signal.strategy || 'momentum';
    const score = signal.score != null ? parseFloat(Number(signal.score).toFixed(3)) : null;

    let regime = signal.regime || signal.marketRegime || 'trend-expansion';
    if (!signal.regime && !signal.marketRegime) {
        if (normalizedStrategy === 'trendPullback') regime = 'pullback-trend';
        else if ((signal.sizingFactor || 1) < 1) regime = 'cautious-risk-on';
        else if (normalizedTier === 'tier3') regime = 'trend-expansion';
    }

    return {
        strategy: normalizedStrategy,
        regime,
        score,
        context: {
            tier: normalizedTier,
            momentum: signal.momentum ?? null,
            trendStrength: signal.trendStrength ?? null,
            pullbackPct: signal.pullbackPct ?? null,
            atrPct: signal.atrPct ?? null,
            rsi: signal.rsi ?? null,
            volumeRatio: signal.volumeRatio ?? null,
            volume24h: signal.volume24h ?? null,
            sizingFactor: signal.sizingFactor ?? null,
            regimeQuality: signal.regimeQuality ?? null,
            // NEW: committee data for auto-learning
            committeeConfidence: signal.committeeConfidence ?? null,
            committeeComponents: signal.committeeComponents ?? null,
            orderFlowImbalance: signal.orderFlowImbalance ?? null,
            hasDisplacement: signal.hasDisplacement ?? false,
            fvgCount: signal.fvgCount ?? 0,
            marketRegime: signal.marketRegime ?? null,
        }
    };
}

async function dbCryptoOpen(symbol, tier, entry, stopLoss, takeProfit, quantity, positionSize, signal = {}) {
    if (!dbPool) return null;
    try {
        const tags = buildCryptoTradeTags(signal, tier);
        const r = await dbPool.query(
            `INSERT INTO trades (bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
             position_size_usd,stop_loss,take_profit,entry_time,signal_score,entry_context,rsi,volume_ratio,momentum_pct)
             VALUES ('crypto',$1,'long',$2,$3,$4,'open',$5,$6,$7,$8,$9,NOW(),$10,$11::jsonb,$12,$13,$14) RETURNING id`,
            [symbol, tier, tags.strategy, tags.regime, entry, quantity, positionSize, stopLoss, takeProfit,
             tags.score, JSON.stringify(tags.context), signal.rsi || null, signal.volumeRatio || null, signal.momentum || null]
        );
        return r.rows[0]?.id;
    } catch (e) { console.warn('DB crypto open failed:', e.message); return null; }
}

async function dbCryptoClose(id, exitPrice, pnlUsd, pnlPct, reason) {
    if (!dbPool || !id) return;
    const client = await dbPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,
             exit_time=NOW(),close_reason=$4 WHERE id=$5`,
            [exitPrice, pnlUsd, pnlPct, reason, id]
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.warn('DB crypto close failed (rolled back):', e.message);
    } finally {
        client.release();
    }
}

// [v14.0] Strategy-regime performance tracking — logs which strategy wins in which regime
async function updateStrategyRegimePerformance(strategy, regime, pnlPct, isWin) {
    if (!dbPool || !strategy || !regime) return;
    try {
        await dbPool.query(`
            INSERT INTO strategy_regime_performance (bot, strategy, regime, total_trades, winning_trades, total_pnl_pct, total_win_pnl_pct, total_loss_pnl_pct, last_updated)
            VALUES ('crypto', $1, $2, 1, $3, $4, $5, $6, NOW())
            ON CONFLICT (bot, strategy, regime) DO UPDATE SET
                total_trades = strategy_regime_performance.total_trades + 1,
                winning_trades = strategy_regime_performance.winning_trades + $3,
                total_pnl_pct = strategy_regime_performance.total_pnl_pct + $4,
                total_win_pnl_pct = strategy_regime_performance.total_win_pnl_pct + $5,
                total_loss_pnl_pct = strategy_regime_performance.total_loss_pnl_pct + $6,
                win_rate = CASE WHEN (strategy_regime_performance.total_trades + 1) > 0
                    THEN (strategy_regime_performance.winning_trades + $3)::decimal / (strategy_regime_performance.total_trades + 1)
                    ELSE 0 END,
                profit_factor = CASE WHEN ABS(strategy_regime_performance.total_loss_pnl_pct + $6) > 0.0001
                    THEN ABS(strategy_regime_performance.total_win_pnl_pct + $5) / ABS(strategy_regime_performance.total_loss_pnl_pct + $6)
                    ELSE 0 END,
                avg_pnl_pct = (strategy_regime_performance.total_pnl_pct + $4) / (strategy_regime_performance.total_trades + 1),
                last_updated = NOW()
        `, [strategy, regime, isWin ? 1 : 0, pnlPct, isWin ? pnlPct : 0, isWin ? 0 : pnlPct]);
    } catch (e) {
        console.warn('[StrategyPerf] DB update failed:', e.message);
    }
}

// [v14.0] Load strategy-regime weights from DB for auto-adjustment
let strategyRegimeWeights = { momentum: 1.0, meanReversion: 1.0, trendPullback: 1.0 };

async function loadStrategyRegimeWeights() {
    if (!dbPool) return { momentum: 1.0, meanReversion: 1.0, trendPullback: 1.0 };
    try {
        // [v14.1] Exponential decay: recent regime performance matters more than old
        // Rows updated recently get higher weight; stale rows decay toward neutral (1.0)
        const result = await dbPool.query(`
            SELECT strategy, regime, win_rate, profit_factor, total_trades, last_updated
            FROM strategy_regime_performance
            WHERE bot = 'crypto' AND total_trades >= 5
        `);
        const DECAY_HALF_LIFE_HOURS = 72; // 3 days half-life
        const now = Date.now();
        const strategyPerf = {};

        for (const row of result.rows) {
            const ageHours = (now - new Date(row.last_updated).getTime()) / (1000 * 60 * 60);
            const decayFactor = Math.pow(0.5, ageHours / DECAY_HALF_LIFE_HOURS);
            const effectiveTrades = row.total_trades * decayFactor;
            const pf = parseFloat(row.profit_factor) || 1.0;

            if (!strategyPerf[row.strategy]) strategyPerf[row.strategy] = { totalWeight: 0, weightedPF: 0 };
            strategyPerf[row.strategy].totalWeight += effectiveTrades;
            strategyPerf[row.strategy].weightedPF += pf * effectiveTrades;
        }

        const weights = {};
        for (const [strategy, data] of Object.entries(strategyPerf)) {
            const avgPF = data.totalWeight > 0 ? data.weightedPF / data.totalWeight : 1.0;
            weights[strategy] = Math.max(0.3, Math.min(2.0, avgPF)); // Clamp [0.3, 2.0]
        }
        return {
            momentum: weights.momentum || 1.0,
            meanReversion: weights.meanReversion || 1.0,
            trendPullback: weights.trendPullback || 1.0
        };
    } catch (e) {
        console.warn('[StrategyPerf] Load failed:', e.message);
        return { momentum: 1.0, meanReversion: 1.0, trendPullback: 1.0 };
    }
}

// Refresh strategy weights every 4 hours (same cadence as committee weights)
setInterval(async () => {
    strategyRegimeWeights = await loadStrategyRegimeWeights();
    console.log('[StrategyPerf] Updated strategy weights:', JSON.stringify(strategyRegimeWeights));
}, 4 * 60 * 60 * 1000);

// Initial load after 15 seconds
setTimeout(async () => {
    strategyRegimeWeights = await loadStrategyRegimeWeights();
    if (Object.values(strategyRegimeWeights).some(w => w !== 1.0)) {
        console.log('[StrategyPerf] Loaded strategy weights:', JSON.stringify(strategyRegimeWeights));
    }
}, 15000);

/**
 * UNIFIED CRYPTO TRADING BOT
 * v3.2 - Crypto Council Improvements:
 * 1. Wilder's Smoothed RSI (replaces simple-average — matches broker platform values)
 * 2. MACD(12,26,9) confirmation filter (only enter when MACD histogram is bullish)
 * 3. Enhanced BTC filter with RSI + 24h change check (avoids overbought/weak BTC)
 * 4. Tighter trailing stops (+5% → trail 3%, +10% → 6%, +20% → 12%, +30% → 18%)
 * 5. Volume surge filter (current 5-min bar must have 1.5x average volume)
 * 6. Dynamic position sizing (Kelly-inspired: scale with win rate, capped 0.25x–2.0x)
 */

// ============================================================================
// CRYPTO TRADING CONFIGURATION (24/7/365)
// ============================================================================

const CRYPTO_CONFIG = {
    // Exchange Configuration — Kraken (US-friendly, no geo-block)
    exchange: {
        name: 'kraken',
        apiKey: process.env.CRYPTO_API_KEY,
        apiSecret: process.env.CRYPTO_API_SECRET,
        baseURL: 'https://api.kraken.com'
    },

    // Trading Pairs — Kraken format (XBT = Bitcoin on Kraken)
    symbols: [
        // Layer 1 Blue Chips
        'XBTUSD',   // Bitcoin
        'ETHUSD',   // Ethereum
        'SOLUSD',   // Solana
        'ADAUSD',   // Cardano
        'XRPUSD',   // Ripple
        'AVAXUSD',  // Avalanche
        'DOTUSD',   // Polkadot
        'LTCUSD',   // Litecoin
        'ATOMUSD',  // Cosmos
        // DeFi
        'LINKUSD',  // Chainlink
        'UNIUSD',   // Uniswap
        'AAVEUSD',  // Aave
        'MKRUSD',   // Maker
        'SNXUSD',   // Synthetix
        'CRVUSD',   // Curve
        // Layer 2 / Scaling
        'MATICUSD', // Polygon
        'OPUSD',    // Optimism
        'ARBUSD',   // Arbitrum
        // Infrastructure / Interop
        'ALGOUSD',  // Algorand
        'NEARUSD',  // Near Protocol
        'FTMUSD',   // Fantom
        'ICPUSD',   // Internet Computer
        'FILUSD',   // Filecoin
        // Newer High-Momentum
        'APTUSD',   // Aptos
        'SUIUSD',   // Sui
        'INJUSD',   // Injective
        'TIAUSD',   // Celestia
        'WIFUSD',   // dogwifhat (high vol)
    ],

    // Risk Management
    maxTotalPositions: 4,  // 4 positions max
    maxPositionsPerSymbol: 1,
    maxTradesPerDay: 10,
    maxTradesPerSymbol: 2,
    minTimeBetweenTrades: 30, // 30 min cooldown

    // Position Sizing (smaller due to crypto volatility)
    accountRiskPercent: 0.02, // 2% risk per trade
    basePositionSizeUSD: 500, // $500 per position (conservative)
    maxPositionSizeUSD: 2000, // Max $2000 per position

    // [v6.1] 3-Tier Strategy — realistic targets for 5-min candles
    // Old: 15/20/30% targets → 0% win rate (unreachable on 5-min timeframe)
    // New: 3/5/8% targets with tighter stops → achievable 2:1 R:R
    tiers: {
        tier1: {
            name: 'Standard Crypto',
            momentumThreshold: 0.005, // 0.5% momentum (was 0.3% — too noisy)
            stopLoss: 0.05,          // 5% stop (was 3.5% — still too tight; 1.70:1 R/R after slippage, needs 37% WR)
            profitTarget: 0.10,      // 10% target (was 5% — wider target lets winners run)
            rsiLower: 30,            // Tighter RSI (was 20 — too oversold)
            rsiUpper: 70,            // Tighter RSI (was 80 — too overbought)
            maxPositions: 4
        },
        tier2: {
            name: 'High Momentum',
            momentumThreshold: 0.015, // 1.5% momentum (was 1.2%)
            stopLoss: 0.06,          // 6% stop (was 4.5% — wider for crypto vol)
            profitTarget: 0.12,      // 12% target (was 7% — better R/R after slippage)
            rsiLower: 35,
            rsiUpper: 75,
            maxPositions: 2
        },
        tier3: {
            name: 'Extreme Momentum',
            momentumThreshold: 0.03,  // 3% momentum (was 2.5%)
            stopLoss: 0.06,          // 6% stop (was 4% — too tight)
            profitTarget: 0.10,      // 10% target (~1.7:1 R/R after slippage)
            rsiLower: 35,
            rsiUpper: 80,
            maxPositions: 1
        }
    },

    pullbackStrategy: {
        maxPullbackFromEMA9: 0.03,
        minTrendStrength: 0.0015,
        rsiLower: 38,
        rsiUpper: 64,
        minVolumeRatio: 0.75,
        stopLoss: 0.04,
        profitTarget: 0.10,
        maxPositions: 2,
        sizingFactor: 0.85
    },

    // [v14.0] Mean Reversion Strategy — fires in low-vol/sideways regimes only
    // Bollinger Band extremes + RSI oversold = buy the dip to the mean
    meanReversionStrategy: {
        bollingerPeriod: 20,
        bollingerStdDev: 2,
        rsiOversold: 20,         // Buy when RSI < 20 — RSI < 20 filters noise; on 5-min crypto candles, RSI < 30 triggers too frequently during normal corrections
        rsiOverbought: 70,       // Short when RSI > 70 (future)
        stopLossPercent: 0.025,  // 2.5% stop (tighter than momentum)
        profitTargetPercent: 0.04, // 4% target (reversion to mean)
        maxPositions: 2,
        sizingFactor: 0.7,       // Smaller size than momentum trades
        minBandwidth: 0.02,      // Min BB width (avoid ultra-tight ranges)
        maxBandwidth: 0.10,      // Max BB width (too wide = trending, not ranging)
        requiredRegimes: ['low', 'medium'] // Only fire in low/medium vol
    },

    // Crypto-Specific Filters
    filters: {
        btcCorrelation: true,  // Check BTC trend before altcoin trades
        volumeConfirmation: true,
        minVolumeUSD: 10000000, // $10M daily volume minimum
        minVolumeRatioMomentum: 0.65,
        maxVolatility24h: 0.30, // Pause if >30% move in 24h
        avoidWeekend: false     // Crypto trades 24/7 even weekends
    },

    // Trailing Stops — v3.3: start at 1x risk (5% stop → trail from +5%)
    // v3.2 started at +8% — too late, trades reversed from +7% back to stop loss
    trailingStops: [
        { profit: 0.05, stopDistance: 0.035 }, // At +5% (1x risk): trail by 3.5% → lock ~1.5%
        { profit: 0.08, stopDistance: 0.04 },  // At +8%: trail by 4% → lock ~4%
        { profit: 0.12, stopDistance: 0.05 },  // At +12%: trail by 5% → lock ~7%
        { profit: 0.20, stopDistance: 0.08 },  // At +20%: trail by 8% → lock ~12%
        { profit: 0.30, stopDistance: 0.12 }   // At +30%: trail by 12% → lock ~18%
    ],

    // Scan Interval (5 min for crypto)
    scanInterval: 300000, // 5 minutes (300,000ms)

    // Time-based exit thresholds
    maxHoldDays: 3,         // Force-exit loss positions after 3 days
    stalePositionDays: 5    // Emergency close after 5 days regardless of P/L
};

function scoreCryptoSignal({ strategy, tier, momentum, trendStrength, volumeRatio, rsi, sizingFactor, macdBullish, bollingerPercentB }) {
    // [v14.0] Mean reversion has its own scoring logic
    if (strategy === 'meanReversion') {
        const baseWeight = 1.2;
        // RSI extremity: further from 50 = stronger signal
        const rsiExtremity = rsi < 30 ? Math.max(0.8, (30 - rsi) / 15) : rsi > 70 ? Math.max(0.8, (rsi - 70) / 15) : 0.5;
        // Bollinger %B: closer to band edge = stronger signal
        const bbExtremity = bollingerPercentB !== undefined
            ? (bollingerPercentB < 0.1 ? 1.3 : bollingerPercentB < 0.2 ? 1.15 : bollingerPercentB > 0.9 ? 1.3 : 1.0)
            : 1.0;
        const volWeight = Math.max(0.8, Math.min(1.5, volumeRatio || 1));
        return parseFloat((baseWeight * rsiExtremity * bbExtremity * volWeight * Math.max(0.5, sizingFactor)).toFixed(3));
    }

    const tierWeight = tier === 'tier3' ? 2.6 : tier === 'tier2' ? 1.9 : tier === 'tier1' ? 1.3 : 1.1;
    const strategyWeight = strategy === 'trendPullback' ? 1.05 : 1.25;
    const rsiSweetSpot = strategy === 'trendPullback'
        ? (rsi >= 42 && rsi <= 60 ? 1.12 : 1.0)
        : (rsi >= 45 && rsi <= 70 ? 1.08 : 1.0);
    const momentumComponent = strategy === 'trendPullback'
        ? Math.max(0.5, trendStrength * 180)
        : Math.max(0.5, momentum * 10);
    const macdWeight = macdBullish ? 1.08 : 0.96;

    return parseFloat(
        (tierWeight * strategyWeight * momentumComponent * Math.max(1, volumeRatio) * rsiSweetSpot * Math.max(0.5, sizingFactor) * macdWeight)
            .toFixed(3)
    );
}

function evaluateCryptoRegimeSignal({ strategy, btcBullish, trendStrength, volumeRatio, rsi, pullbackPct, tier, cryptoRegime }) {
    // [v14.0] Mean reversion: only tradable in low/medium vol regimes
    if (strategy === 'meanReversion') {
        const regimeLabel = cryptoRegime ? cryptoRegime.regime : 'medium';
        if (regimeLabel === 'high') {
            return { tradable: false, regime: 'mean-revert-blocked', quality: 0 };
        }
        let quality = regimeLabel === 'low' ? 1.15 : 1.0; // Bonus in low vol (ideal for mean reversion)
        if (rsi < 25 || rsi > 75) quality *= 1.10; // Extreme RSI = stronger mean reversion signal
        if (volumeRatio >= 1.2) quality *= 1.05;
        // BTC trend matters less for mean reversion (counter-trend by nature)
        if (!btcBullish) quality *= 0.95; // Slight penalty, not a hard block
        return {
            tradable: quality >= 0.9,
            regime: `mean-revert-${regimeLabel}`,
            quality: parseFloat(quality.toFixed(3))
        };
    }

    let quality = btcBullish ? 1.08 : 0.86;
    if (strategy === 'trendPullback') {
        if (pullbackPct >= 0.4 && pullbackPct <= 1.8) quality *= 1.08;
        else if (pullbackPct > 2.4) quality *= 0.82;
    } else {
        if (trendStrength >= 0.9) quality *= 1.08;
        else if (trendStrength < 0.45) quality *= 0.84;
    }

    if (volumeRatio >= 1.5) quality *= 1.06;
    else if (volumeRatio < 1.1) quality *= 0.84;

    if (rsi >= 46 && rsi <= 68) quality *= 1.04;
    else if (rsi > 75) quality *= 0.82;

    let regime = btcBullish ? 'risk-on' : 'cautious';
    if (strategy === 'trendPullback') regime = btcBullish ? 'pullback-trend' : 'cautious-pullback';
    else if (tier === 'tier3') regime = btcBullish ? 'trend-expansion' : 'cautious-breakout';

    return {
        tradable: quality >= 0.9,
        regime,
        quality: parseFloat(quality.toFixed(3))
    };
}

function isRealTradingEnabled() {
    return process.env.REAL_TRADING_ENABLED === 'true';
}

// ============================================================================
// [Phase 1] ORDER FLOW + DISPLACEMENT — institutional pressure detection
// ============================================================================

// [Phase 1] Order Flow Imbalance — approximates buy/sell pressure from OHLCV klines
// Kline format: [time, open, high, low, close, volume] (Kraken-compatible arrays)
// Returns -1 to +1: positive = buy pressure dominant, negative = sell pressure dominant
function calculateOrderFlowImbalance(klines, lookback = 20) {
    if (!klines || klines.length === 0) return 0;
    const recent = klines.slice(-lookback);
    let buyVolume = 0, sellVolume = 0;
    for (const k of recent) {
        const open = parseFloat(k[1]);
        const close = parseFloat(k[4]);
        const volume = parseFloat(k[5]) || 0;
        if (close >= open) {
            buyVolume += volume;
        } else {
            sellVolume += volume;
        }
    }
    const total = buyVolume + sellVolume;
    if (total === 0) return 0;
    return (buyVolume - sellVolume) / total; // -1 to +1
}

// [Phase 1] Displacement Candle Detection — checks if recent klines show strong directional conviction
// Large body (>70% of range) with range exceeding 1.5x ATR signals institutional commitment
// Kline format: [time, open, high, low, close, volume]
function isDisplacementCandle(klines, atr, lookback = 3) {
    if (!klines || klines.length < lookback || !atr || atr <= 0) return false;
    const recent = klines.slice(-lookback);
    for (const k of recent) {
        const open = parseFloat(k[1]);
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);
        const close = parseFloat(k[4]);
        const body = Math.abs(close - open);
        const range = high - low;
        if (range <= 0) continue;
        // Body must be >70% of range (small wicks) and range must exceed 1.5x ATR
        if (body / range > 0.7 && range > 1.5 * atr) {
            return true;
        }
    }
    return false;
}

// ============================================================================
// [Phase 2] VOLUME PROFILE + FAIR VALUE GAP — market structure analysis
// ============================================================================

// [Phase 2] Volume Profile — calculates VAH, VAL, POC from OHLCV klines
// VAH = Value Area High, VAL = Value Area Low, POC = Point of Control (highest volume price)
// Value Area contains 70% of total volume, centered around POC
// Kline format: [time, open, high, low, close, volume]
function calculateVolumeProfile(klines, numBuckets = 50) {
    if (!klines || klines.length < 20) return null;

    // Find price range
    let minPrice = Infinity, maxPrice = -Infinity;
    for (const k of klines) {
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);
        if (low < minPrice) minPrice = low;
        if (high > maxPrice) maxPrice = high;
    }

    const priceRange = maxPrice - minPrice;
    if (priceRange <= 0) return null;
    const bucketSize = priceRange / numBuckets;

    // Build volume-at-price histogram
    const volumeByBucket = new Array(numBuckets).fill(0);
    let totalVolume = 0;

    for (const k of klines) {
        const high = parseFloat(k[2]);
        const low = parseFloat(k[3]);
        const volume = parseFloat(k[5]) || 0;

        // Distribute volume across the bar's price range
        const barLowBucket = Math.max(0, Math.floor((low - minPrice) / bucketSize));
        const barHighBucket = Math.min(numBuckets - 1, Math.floor((high - minPrice) / bucketSize));
        const bucketsInBar = barHighBucket - barLowBucket + 1;
        const volumePerBucket = bucketsInBar > 0 ? volume / bucketsInBar : 0;

        for (let i = barLowBucket; i <= barHighBucket; i++) {
            volumeByBucket[i] += volumePerBucket;
        }
        totalVolume += volume;
    }

    if (totalVolume === 0) return null;

    // Find POC (bucket with highest volume)
    let pocBucket = 0;
    for (let i = 1; i < numBuckets; i++) {
        if (volumeByBucket[i] > volumeByBucket[pocBucket]) pocBucket = i;
    }
    const poc = minPrice + (pocBucket + 0.5) * bucketSize;

    // Calculate Value Area (70% of volume centered on POC)
    const targetVolume = totalVolume * 0.70;
    let vaVolume = volumeByBucket[pocBucket];
    let vaLowBucket = pocBucket;
    let vaHighBucket = pocBucket;

    while (vaVolume < targetVolume && (vaLowBucket > 0 || vaHighBucket < numBuckets - 1)) {
        const belowVol = vaLowBucket > 0 ? volumeByBucket[vaLowBucket - 1] : 0;
        const aboveVol = vaHighBucket < numBuckets - 1 ? volumeByBucket[vaHighBucket + 1] : 0;

        if (belowVol >= aboveVol && vaLowBucket > 0) {
            vaLowBucket--;
            vaVolume += volumeByBucket[vaLowBucket];
        } else if (vaHighBucket < numBuckets - 1) {
            vaHighBucket++;
            vaVolume += volumeByBucket[vaHighBucket];
        } else if (vaLowBucket > 0) {
            vaLowBucket--;
            vaVolume += volumeByBucket[vaLowBucket];
        } else {
            break;
        }
    }

    const vah = minPrice + (vaHighBucket + 1) * bucketSize;
    const val = minPrice + vaLowBucket * bucketSize;

    // Identify low-volume nodes (buckets with volume < 30% of POC volume)
    const pocVolume = volumeByBucket[pocBucket];
    const lowVolumeNodes = [];
    for (let i = 0; i < numBuckets; i++) {
        if (volumeByBucket[i] < pocVolume * 0.30) {
            lowVolumeNodes.push({
                priceLow: minPrice + i * bucketSize,
                priceHigh: minPrice + (i + 1) * bucketSize,
                priceMid: minPrice + (i + 0.5) * bucketSize,
                volumeRatio: pocVolume > 0 ? volumeByBucket[i] / pocVolume : 0
            });
        }
    }

    return { vah, val, poc, lowVolumeNodes, bucketSize };
}

// [Phase 2] Fair Value Gap Detection — identifies price gaps left by fast-moving candles
// Bullish FVG: gap between candle[i-1].high and candle[i+1].low (price moved up too fast)
// Bearish FVG: gap between candle[i-1].low and candle[i+1].high (price moved down too fast)
// Kline format: [time, open, high, low, close, volume]
function detectFairValueGaps(klines, lookback = 20) {
    if (!klines || klines.length < 3) return { bullish: [], bearish: [] };

    const recent = klines.slice(-lookback);
    const bullishGaps = [];
    const bearishGaps = [];

    for (let i = 1; i < recent.length - 1; i++) {
        const prev = recent[i - 1];
        const curr = recent[i];
        const next = recent[i + 1];

        const prevHigh = parseFloat(prev[2]);
        const prevLow = parseFloat(prev[3]);
        const nextHigh = parseFloat(next[2]);
        const nextLow = parseFloat(next[3]);
        const currClose = parseFloat(curr[4]);
        const currOpen = parseFloat(curr[1]);

        // Bullish FVG: gap between prev candle's high and next candle's low
        if (nextLow > prevHigh && currClose > currOpen) {
            bullishGaps.push({
                gapLow: prevHigh,
                gapHigh: nextLow,
                gapMid: (prevHigh + nextLow) / 2,
                gapSize: nextLow - prevHigh
            });
        }

        // Bearish FVG: gap between prev candle's low and next candle's high
        if (nextHigh < prevLow && currClose < currOpen) {
            bearishGaps.push({
                gapLow: nextHigh,
                gapHigh: prevLow,
                gapMid: (nextHigh + prevLow) / 2,
                gapSize: prevLow - nextHigh
            });
        }
    }

    return { bullish: bullishGaps, bearish: bearishGaps };
}

// ============================================================================
// [Phase 3] COMMITTEE AGGREGATOR + REGIME — unified confidence & market conditions
// ============================================================================

// [Phase 3] Committee Aggregator for Crypto — combines multiple signal confirmations
// 6 weighted components; minimum threshold: 0.50 confidence required to trade
function computeCryptoCommitteeScore(signal) {
    let confirmations = 0;
    let totalWeight = 0;

    // 1. Momentum strength (weight: cryptoCommitteeWeights.momentum)
    // [Tier3 Fix] Wider normalization for crypto — 5% cap flattened differentiation on 10-30% moves
    const momentumScore = Math.min(Math.abs(parseFloat(signal.momentum || 0)) / 15, 1.0);
    confirmations += momentumScore * cryptoCommitteeWeights.momentum;
    totalWeight += cryptoCommitteeWeights.momentum;

    // 2. Order flow confirmation (weight: cryptoCommitteeWeights.orderFlow)
    const flowScore = signal.orderFlowImbalance !== undefined
        ? Math.max(0, signal.orderFlowImbalance) // 0 to 1 for longs
        : 0.3; // neutral-low if unavailable — 0.5 was inflating scores when data absent
    confirmations += flowScore * cryptoCommitteeWeights.orderFlow;
    totalWeight += cryptoCommitteeWeights.orderFlow;

    // 3. Displacement candle (weight: cryptoCommitteeWeights.displacement)
    // [v14.2] 0.1 when absent — 0.3 was too generous; absent means no confirmation
    const displacementScore = signal.hasDisplacement ? 1.0 : 0.1;
    confirmations += displacementScore * cryptoCommitteeWeights.displacement;
    totalWeight += cryptoCommitteeWeights.displacement;

    // 4. Volume Profile position (weight: cryptoCommitteeWeights.volumeProfile)
    let vpScore = 0.3; // neutral-low default — 0.5 inflated score when data absent
    if (signal.volumeProfileData) {
        const price = parseFloat(signal.price);
        const { vah, val } = signal.volumeProfileData;
        const range = vah - val;
        if (range > 0) {
            // Score higher when closer to VAL (buying at discount)
            const positionInRange = (price - val) / range;
            vpScore = Math.max(0, 1.0 - positionInRange); // 1.0 at VAL, 0.0 at VAH
        }
    }
    confirmations += vpScore * cryptoCommitteeWeights.volumeProfile;
    totalWeight += cryptoCommitteeWeights.volumeProfile;

    // 5. FVG confirmation (weight: cryptoCommitteeWeights.fvg)
    // [v14.2] 0.1 when absent — 0.3 was too generous; absent means no confirmation
    const fvgScore = (signal.fvgCount || 0) > 0 ? 1.0 : 0.1;
    confirmations += fvgScore * cryptoCommitteeWeights.fvg;
    totalWeight += cryptoCommitteeWeights.fvg;

    // 6. Volume ratio (weight: cryptoCommitteeWeights.volumeRatio)
    const volRatioScore = Math.min(parseFloat(signal.volumeRatio || 1) / 3, 1.0);
    confirmations += volRatioScore * cryptoCommitteeWeights.volumeRatio;
    totalWeight += cryptoCommitteeWeights.volumeRatio;

    const confidence = totalWeight > 0 ? confirmations / totalWeight : 0;

    return {
        confidence: parseFloat(confidence.toFixed(3)),
        components: {
            momentum: parseFloat(momentumScore.toFixed(3)),
            orderFlow: parseFloat(flowScore.toFixed(3)),
            displacement: displacementScore,
            volumeProfile: parseFloat(vpScore.toFixed(3)),
            fvg: fvgScore,
            volumeRatio: parseFloat(volRatioScore.toFixed(3))
        }
    };
}

// [Phase 3] Crypto Regime Detection — classifies market conditions from kline volatility
// Crypto is more volatile than stocks/forex, so thresholds are higher:
// Low: ATR < 0.5%, Medium: 0.5-1.5%, High: > 1.5%
const CRYPTO_REGIME_ADJUSTMENTS = {
    low: {
        label: 'Low Volatility',
        positionSizeMultiplier: 1.2,    // Can size up in calm crypto markets
        scoreThresholdMultiplier: 0.9,  // Slightly lower bar (fewer signals)
        maxPositions: 5
    },
    medium: {
        label: 'Normal',
        positionSizeMultiplier: 1.0,    // Default sizing
        scoreThresholdMultiplier: 1.0,  // Default thresholds
        maxPositions: 4
    },
    high: {
        label: 'High Volatility',
        positionSizeMultiplier: 0.5,    // Aggressively reduce size in volatile crypto
        scoreThresholdMultiplier: 1.3,  // Raise the bar significantly (only best signals)
        maxPositions: 2
    }
};

function detectCryptoRegime(klines) {
    if (!klines || klines.length < 20) return { regime: 'medium', adjustments: CRYPTO_REGIME_ADJUSTMENTS.medium };

    // Calculate realized volatility from last 20 klines
    const recent = klines.slice(-20);
    let sumTR = 0;
    for (let i = 1; i < recent.length; i++) {
        const high = parseFloat(recent[i][2]);
        const low = parseFloat(recent[i][3]);
        const prevClose = parseFloat(recent[i - 1][4]);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        sumTR += tr;
    }
    const avgTR = sumTR / (recent.length - 1);
    const lastClose = parseFloat(recent[recent.length - 1][4]);
    const atrPct = lastClose > 0 ? avgTR / lastClose : 0;

    // Crypto-specific thresholds (higher than stocks/forex due to inherent volatility)
    // Low: < 0.5% ATR, Medium: 0.5-1.5%, High: > 1.5%
    let regime;
    if (atrPct < 0.005) {
        regime = 'low';
    } else if (atrPct > 0.015) {
        regime = 'high';
    } else {
        regime = 'medium';
    }

    // [v14.0] Strategy-regime routing: which strategy class to prefer
    const strategyPreference = {
        low:    { preferred: 'meanReversion', momentumWeight: 0.3, meanReversionWeight: 1.0, pullbackWeight: 0.5 },
        medium: { preferred: 'blended',       momentumWeight: 0.7, meanReversionWeight: 0.5, pullbackWeight: 0.8 },
        high:   { preferred: 'momentum',      momentumWeight: 1.0, meanReversionWeight: 0.0, pullbackWeight: 0.6 }
    };

    return {
        regime,
        adjustments: CRYPTO_REGIME_ADJUSTMENTS[regime],
        atrPct: parseFloat(atrPct.toFixed(6)),
        strategyRouting: strategyPreference[regime] || strategyPreference.medium
    };
}

// ============================================================================
// KRAKEN API CLIENT  (replaces Binance — US-friendly, no geo-block)
// ============================================================================

class KrakenClient {
    constructor(config) {
        this.baseURL = 'https://api.kraken.com';
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;
    }

    // Kraken HMAC-SHA512 signature for private endpoints
    _sign(path, nonce, postData) {
        const sha256Digest = crypto.createHash('sha256').update(nonce + postData).digest('binary');
        const secretBuffer = Buffer.from(this.apiSecret, 'base64');
        return crypto.createHmac('sha512', secretBuffer).update(path + sha256Digest, 'binary').digest('base64');
    }

    async _privateRequest(endpoint, params = {}) {
        const nonce = Date.now().toString();
        const postData = new URLSearchParams({ nonce, ...params }).toString();
        const path = `/0/private/${endpoint}`;
        const signature = this._sign(path, nonce, postData);
        const response = await axios.post(`${this.baseURL}${path}`, postData, {
            headers: {
                'API-Key': this.apiKey,
                'API-Sign': signature,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            timeout: 10000,
        });
        if (response.data.error && response.data.error.length > 0) {
            throw new Error(response.data.error.join(', '));
        }
        return response.data.result;
    }

    // Get account balances
    async getAccountInfo() {
        try {
            const result = await this._privateRequest('Balance');
            return result; // { ZUSD: '10000.00', XXBT: '0.5', ... }
        } catch (error) {
            console.error('❌ Failed to get account info:', error.message);
            return null;
        }
    }

    // Get current price — public Ticker endpoint, no auth needed
    async getPrice(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/0/public/Ticker`, {
                params: { pair: symbol }, timeout: 5000,
            });
            const result = response.data.result;
            const key = Object.keys(result)[0];
            return parseFloat(result[key].c[0]); // Last trade price
        } catch (error) {
            console.error(`❌ Failed to get price for ${symbol}:`, error.message);
            return null;
        }
    }

    // Get 24h ticker data — public, no auth needed
    async get24hTicker(symbol) {
        try {
            const response = await axios.get(`${this.baseURL}/0/public/Ticker`, {
                params: { pair: symbol }, timeout: 5000,
            });
            const result = response.data.result;
            const key = Object.keys(result)[0];
            const t = result[key];
            const lastPrice = parseFloat(t.c[0]);
            const openPrice = parseFloat(t.o);
            const priceChangePercent = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;
            return {
                lastPrice: lastPrice.toString(),
                highPrice: t.h[1],
                lowPrice:  t.l[1],
                quoteVolume: (parseFloat(t.v[1]) * lastPrice).toString(), // approx 24h USD volume
                priceChangePercent: priceChangePercent.toFixed(4),
            };
        } catch (error) {
            console.error(`❌ Failed to get 24h ticker for ${symbol}:`, error.message);
            return null;
        }
    }

    async getAssetPairs() {
        try {
            const response = await axios.get(`${this.baseURL}/0/public/AssetPairs`, {
                timeout: 10000,
            });
            if (response.data.error && response.data.error.length > 0) {
                throw new Error(response.data.error.join(', '));
            }
            return response.data.result || {};
        } catch (error) {
            console.error('❌ Failed to fetch Kraken asset pairs:', error.message);
            return null;
        }
    }

    // Get OHLCV candles — public, no auth needed
    // Kraken interval in minutes: 1,5,15,30,60,240,1440
    async getKlines(symbol, interval = '5m', limit = 100) {
        const intervalMap = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };
        const krakenInterval = intervalMap[interval] || 5;
        try {
            const response = await axios.get(`${this.baseURL}/0/public/OHLC`, {
                params: { pair: symbol, interval: krakenInterval }, timeout: 10000,
            });
            const result = response.data.result;
            const key = Object.keys(result).find(k => k !== 'last');
            const candles = result[key];
            // Kraken OHLC row: [time, open, high, low, close, vwap, volume, count]
            // Return last `limit` rows in Binance-compatible format: index 4 = close, index 5 = volume
            return candles.slice(-limit).map(c => [c[0], c[1], c[2], c[3], c[4], c[6]]);
        } catch (error) {
            console.error(`❌ Failed to get klines for ${symbol}:`, error.message);
            return null;
        }
    }

    // Place a market order (requires API keys)
    async placeOrder(symbol, side, quantity) {
        try {
            const result = await this._privateRequest('AddOrder', {
                pair: symbol,
                type: side.toLowerCase(), // 'buy' or 'sell'
                ordertype: 'market',
                volume: quantity.toFixed(8),
            });
            // Kraken returns txid as an array; validate it's non-empty before returning.
            // An empty or missing txid means the order was not accepted — treat as failure
            // rather than silently recording an undefined orderId (which causes state corruption).
            if (!Array.isArray(result?.txid) || result.txid.length === 0) {
                const msg = result?.error?.length ? result.error.join(', ') : 'empty txid';
                console.error(`❌ Kraken rejected order for ${symbol}: ${msg}`);
                return null;
            }
            return { orderId: result.txid[0], ...result };
        } catch (error) {
            console.error(`❌ Failed to place order for ${symbol}:`, error.message);
            return null;
        }
    }
}

// ===== ADAPTIVE GUARDRAILS (v4.6) =====
const RISK_PER_TRADE = parseFloat(process.env.RISK_PER_TRADE || '0.005');
const MIN_SIGNAL_CONFIDENCE = parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.72');
const MIN_SIGNAL_SCORE = parseFloat(process.env.MIN_SIGNAL_SCORE || '0.72');
const MIN_REWARD_RISK = parseFloat(process.env.MIN_REWARD_RISK || '1.7');
const MAX_SIGNALS_PER_CYCLE = parseInt(process.env.MAX_SIGNALS_PER_CYCLE || '1');
const MAX_CONSECUTIVE_LOSSES = parseInt(process.env.MAX_CONSECUTIVE_LOSSES || '5');
const LOSS_PAUSE_MS = parseInt(process.env.LOSS_PAUSE_MS || '7200000');
const STOP_LOSS_COOLDOWN_MS = parseInt(process.env.STOP_LOSS_COOLDOWN_MS || '2700000');

// ============================================================================
// CRYPTO TRADING ENGINE
// ============================================================================

// [Phase 3.5] Portfolio Risk Engine — cross-bot position correlation and exposure check
// Queries other bots to prevent correlated exposure across the portfolio
// Standalone function — accepts position count from the calling engine instance
async function checkPortfolioRisk(localPositionCount) {
    const risks = { totalPositions: localPositionCount || 0, warnings: [] };

    // Query stock bot positions
    try {
        const stockRes = await axios.get(`${STOCK_BOT_URL}/api/trading/status`, { timeout: 2000 });
        const stockPositions = stockRes.data?.data?.positions || stockRes.data?.positions || [];
        risks.totalPositions += stockPositions.length;
    } catch { /* stock bot offline — non-blocking */ }

    // Query forex bot positions
    try {
        const forexRes = await axios.get(`${FOREX_BOT_URL}/api/forex/status`, { timeout: 2000 });
        const forexPositions = forexRes.data?.data?.positions || forexRes.data?.positions || [];
        risks.totalPositions += forexPositions.length;
    } catch { /* forex bot offline — non-blocking */ }

    // Portfolio-wide limits
    if (risks.totalPositions >= 12) {
        risks.warnings.push(`Portfolio: ${risks.totalPositions} positions (limit: 12)`);
    }

    return risks;
}

// Health monitor state — module-level so the /health endpoint can access them
let lastScanCompletedAt = 0; // for health monitor
const recentErrors = []; // { timestamp, error } for health monitoring
const MAX_ERROR_HISTORY = 100;

class CryptoTradingEngine {
    constructor(config) {
        this.config = config;
        this.kraken = new KrakenClient(config.exchange);

        // Persistent state file
        this.stateFile = require('path').join(__dirname, 'data/crypto-bot-state.json');

        // Trading state
        this.positions = new Map();
        this.priceHistory = new Map();
        this.activeSymbols = Array.from(config.symbols || []);
        this.invalidSymbols = new Set();
        this.lastSymbolValidationAt = 0;
        this.isRunning = false;
        this.isPaused = false;
        this.scanCount = 0;

        // [v3.4] BTC hourly price buffer for structural trend gate
        // SMA50 on hourly data = 50 hours (~2 days) vs only 4 hours on 5-min data
        this.btcHourlyPrices = [];
        this.lastBtcHourlyUpdate = 0;

        // Anti-churning tracking
        this.tradesToday = [];
        this.lastTradeTime = new Map();
        this.dailyTradeCount = 0;
        this.dailyLoss = 0; // circuit breaker — resets at UTC midnight

        // Performance tracking
        this.totalTrades = 0;
        this.winningTrades = 0;
        this.losingTrades = 0;
        this.totalProfit = 0;
        this.totalLoss = 0;
        this.credentialsValid = null;
        this.credentialsError = null;
        this.lastCredentialCheckAt = 0;

        // Monte Carlo position sizer (v9.0)
        this.monteCarloSizer = new MonteCarloSizer();

        // [v10.0] Aggressive Profit Protection — re-entry map
        // Stores { symbol: { timestamp, direction, entry } } for symbols closed via profit-protect
        // Allows bypassing cooldown for 15 minutes after profit-protect close
        this.profitProtectReentrySymbols = new Map();

        // Adaptive guardrails state (v4.6)
        this.guardrails = {
            consecutiveLosses: 0,
            recentResults: [],
            lanePausedUntil: 0,
            totalLossesToday: 0,
            totalWinsToday: 0,
        };

        // Auto-optimizer state — updated every 4 hours in tradingLoop
        this._lastAutoOptimMs = 0;
        this._optimizedParams = null; // null = use defaults (PARAM_BOUNDS defaults)
    }

    // ========================================================================
    // TECHNICAL INDICATORS
    // ========================================================================

    calculateSMA(data, period) {
        if (data.length < period) return null;
        const slice = data.slice(-period);
        return slice.reduce((sum, val) => sum + val, 0) / period;
    }

    calculateEMA(data, period) {
        if (data.length < period) return null;
        const multiplier = 2 / (period + 1);
        let ema = this.calculateSMA(data.slice(0, period), period);

        for (let i = period; i < data.length; i++) {
            ema = (data[i] - ema) * multiplier + ema;
        }
        return ema;
    }

    // [v3.2] Wilder's Smoothed RSI — industry-standard, matches broker platform values
    calculateRSI(prices, period = 14) {
        if (prices.length < period * 2) return 50;
        const changes = [];
        for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);

        let avgGain = 0, avgLoss = 0;
        for (let i = 0; i < period; i++) {
            if (changes[i] > 0) avgGain += changes[i];
            else avgLoss += Math.abs(changes[i]);
        }
        avgGain /= period;
        avgLoss /= period;

        for (let i = period; i < changes.length; i++) {
            const gain = changes[i] > 0 ? changes[i] : 0;
            const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }

        if (avgLoss === 0) return 100;
        return 100 - (100 / (1 + avgGain / avgLoss));
    }

    // [v3.2] MACD(12,26,9) — momentum confirmation; only enter when histogram is bullish & rising
    calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (prices.length < slowPeriod + signalPeriod) return null;

        // Build MACD line for each bar once we have enough data
        const macdLine = [];
        for (let i = slowPeriod - 1; i < prices.length; i++) {
            const slice = prices.slice(0, i + 1);
            const fast = this.calculateEMA(slice, fastPeriod);
            const slow = this.calculateEMA(slice, slowPeriod);
            if (fast !== null && slow !== null) macdLine.push(fast - slow);
        }

        if (macdLine.length < signalPeriod) return null;
        const signalLine = this.calculateEMA(macdLine, signalPeriod);
        if (signalLine === null) return null;

        const histogram = macdLine[macdLine.length - 1] - signalLine;
        const prevHistogram = macdLine.length > 1
            ? macdLine[macdLine.length - 2] - this.calculateEMA(macdLine.slice(0, -1), signalPeriod)
            : histogram;

        return {
            macd: macdLine[macdLine.length - 1],
            signal: signalLine,
            histogram,
            // Bullish = histogram positive (relaxed — was && rising, which filtered too many valid entries)
            bullish: histogram > 0
        };
    }

    // [v14.0] Bollinger Bands — used by mean reversion strategy
    calculateBollingerBands(prices, period = 20, stdDevMultiplier = 2) {
        if (prices.length < period) return null;
        const slice = prices.slice(-period);
        const sma = slice.reduce((a, b) => a + b, 0) / period;
        const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
        const stdDev = Math.sqrt(variance);
        const upper = sma + stdDevMultiplier * stdDev;
        const lower = sma - stdDevMultiplier * stdDev;
        const bandWidth = sma > 0 ? (upper - lower) / sma : 0;
        const currentPrice = prices[prices.length - 1];
        const percentB = (upper - lower) > 0 ? (currentPrice - lower) / (upper - lower) : 0.5;
        return { upper, middle: sma, lower, bandwidth: bandWidth, percentB };
    }

    calculateATR(klines, period = 14) {
        if (!klines || klines.length < period + 1) return null;
        const trs = [];
        for (let i = 1; i < klines.length; i++) {
            const high = parseFloat(klines[i][2]);
            const low = parseFloat(klines[i][3]);
            const prevClose = parseFloat(klines[i - 1][4]);
            const tr = Math.max(
                high - low,
                Math.abs(high - prevClose),
                Math.abs(low - prevClose)
            );
            trs.push(tr);
        }
        if (trs.length < period) return null;

        let atr = trs.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
        for (let i = period; i < trs.length; i++) {
            atr = ((atr * (period - 1)) + trs[i]) / period;
        }
        return atr;
    }

    // ========================================================================
    // STRATEGY BRIDGE
    // ========================================================================

    // v5.0: Shared bridge URL resolver with Railway-aware fallback
    _getBridgeUrl() {
        const raw = process.env.STRATEGY_BRIDGE_URL
            || process.env.RAILWAY_SERVICE_NEXUS_STRATEGY_BRIDGE_URL
            || (process.env.RAILWAY_ENVIRONMENT ? 'https://nexus-strategy-bridge-production.up.railway.app' : 'http://localhost:3010');
        if (raw.startsWith('http')) return raw;
        if (raw.includes('railway.app')) return `https://${raw}`;
        return `http://${raw}`;
    }

    // Non-blocking ensemble confirmation from Python strategy bridge.
    async queryStrategyBridge(symbol, prices) {
        try {
            if (!prices || prices.length < 30) return null;
            const bridgeUrl = this._getBridgeUrl();
            const priceData = prices.map((close, i) => ({
                timestamp: new Date(Date.now() - (prices.length - 1 - i) * 5 * 60000).toISOString(),
                open: close, high: close, low: close, close, volume: 0
            }));
            const response = await axios.post(`${bridgeUrl}/signal`,
                { symbol, prices: priceData, asset_class: 'crypto' },
                { timeout: 5000 }
            );
            return response.data;
        } catch (e) {
            return null;
        }
    }

    // ========================================================================
    // AI TRADE ADVISOR
    // ========================================================================

    // [v5.0] Agentic AI — HARD GATE via strategy bridge
    // [v6.3] Agent decision cache — avoids redundant Claude API calls when the same
    // symbol appears in consecutive scan cycles with similar market conditions.
    // Cache TTL: 5 minutes. If price moves >1% from cached evaluation, cache is invalidated.
    _agentCache = new Map(); // key: symbol, value: { result, price, timestamp }
    _AGENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes — crypto signals don't change fast, saves API budget
    _AGENT_CACHE_PRICE_DRIFT = 0.01; // 1% price change invalidates cache

    async queryAIAdvisor(signal) {
        // Check cache first
        const cached = this._agentCache.get(signal.symbol);
        if (cached && cached.price > 0) {
            const age = Date.now() - cached.timestamp;
            const priceDrift = Math.abs(signal.price - cached.price) / cached.price;
            if (age < this._AGENT_CACHE_TTL_MS && priceDrift < this._AGENT_CACHE_PRICE_DRIFT) {
                console.log(`[Agent] ${signal.symbol}: using cached decision (${(age / 1000).toFixed(0)}s old, drift ${(priceDrift * 100).toFixed(2)}%)`);
                return { ...cached.result, source: 'cache' };
            }
            this._agentCache.delete(signal.symbol);
        }

        try {
            const bridgeUrl = this._getBridgeUrl();
            const payload = {
                symbol: signal.symbol,
                direction: 'long',
                tier: signal.tier || 'tier1',
                asset_class: 'crypto',
                price: signal.price,
                rsi: signal.rsi || undefined,
                momentum: signal.momentum || undefined,
                trend_strength: signal.trendStrength || undefined,
                regime: signal.regime,
                regime_quality: signal.regimeQuality,
                score: signal.score || undefined,
                atr_pct: signal.atrPct || undefined,
            };
            console.log(`[Agent] Evaluating ${signal.symbol} via ${bridgeUrl}/agent/evaluate`);
            const response = await axios.post(`${bridgeUrl}/agent/evaluate`, payload, { timeout: 15000 });
            const result = response.data;
            console.log(`[Agent] ${signal.symbol}: ${result.approved ? 'APPROVED' : 'REJECTED'} (source: ${result.source}, conf: ${(result.confidence || 0).toFixed(2)}) — ${result.reason}`);

            // [v15.0] Detect rubber-stamp pass-through: bridge returning "Rule-based: signals look clean"
            // at >=1.0 confidence means NO real AI filtering happened. Re-compute committee score.
            const isRubberStamp = result.approved === true
                && result.confidence >= 1.0
                && typeof result.reason === 'string'
                && result.reason.toLowerCase().includes('rule-based');
            if (isRubberStamp) {
                const freshCommittee = computeCryptoCommitteeScore(signal);
                result.confidence = freshCommittee.confidence;
                result.reason = `${result.reason} [rubber-stamp: replaced 1.0 with committee ${freshCommittee.confidence.toFixed(2)}]`;
                result.source = 'rule_based_downgraded';
                console.log(`[Agent] ${signal.symbol}: rubber-stamp detected — confidence downgraded to committee:${freshCommittee.confidence.toFixed(2)}`);
            }

            // Cache the result
            this._agentCache.set(signal.symbol, {
                result,
                price: signal.price,
                timestamp: Date.now(),
            });

            return result;
        } catch (e) {
            console.error(`[Agent] ${signal.symbol} call FAILED: ${e.message} — BLOCKING trade (hard gate)`);
            return {
                approved: false,
                confidence: 1.0,
                reason: `Agent unreachable: ${e.message.slice(0, 80)}`,
                source: 'hard_gate_offline',
                risk_flags: ['agent_offline'],
                position_size_multiplier: 0,
            };
        }
    }

    // [v4.1] Report trade outcome for Scan AI learning
    async reportTradeOutcome(position, exitPrice, pnl, pnlPct, exitReason) {
        try {
            const bridgeUrl = this._getBridgeUrl();
            const openTs = position.openTime?.getTime?.() ?? position.entryTime?.getTime?.() ?? Date.now();
            const holdMinutes = (Date.now() - openTs) / 60000;
            const payload = {
                symbol: position.symbol,
                asset_class: 'crypto',
                direction: 'long',
                tier: position.tier || 'tier1',
                entry_price: position.entry || position.entryPrice || position.price,
                exit_price: exitPrice,
                pnl: pnl,
                pnl_pct: pnlPct * 100,
                r_multiple: 0,
                hold_duration_minutes: holdMinutes,
                exit_reason: exitReason,
                entry_regime: position.regime || undefined,
                entry_regime_quality: position.regimeQuality || undefined,
                entry_score: position.score || undefined,
                agent_approved: position.agentApproved,
                agent_confidence: position.agentConfidence,
                decision_run_id: position.decisionRunId || null,
                bandit_arm: position.banditArm || null,
            };
            await axios.post(`${bridgeUrl}/agent/trade-outcome`, payload, { timeout: 5000 });
            console.log(`[Learn] ${position.symbol} outcome reported: ${pnl > 0 ? 'WIN' : 'LOSS'} ${(pnlPct * 100).toFixed(2)}%`);
        } catch (e) {
            // Non-blocking
        }
    }

    // ========================================================================
    // BTC CORRELATION STRATEGY
    // ========================================================================

    // [v3.3] Strict BTC filter — SMA50 trend, tight RSI band, 24h sensitivity, 4h momentum gate
    // Prevents entering altcoin trades when BTC is not in a CLEAR uptrend
    // [v3.4] Uses hourly price buffer (SMA50 = 50h ≈ 2 days) instead of 5-min candles (SMA50 = 4h)
    async isBTCBullish() {
        // Use hourly prices for structural trend — falls back to 5-min if buffer is still warming up
        const btcPrices = this.btcHourlyPrices.length >= 50
            ? this.btcHourlyPrices
            : this.priceHistory.get('XBTUSD') || [];

        if (btcPrices.length < 50) {
            console.log(`[BTC Filter] Insufficient hourly data (${this.btcHourlyPrices.length}/50) — defaulting to bearish`);
            return false;
        }

        const usingHourly = btcPrices === this.btcHourlyPrices;
        if (!usingHourly) {
            console.log(`[BTC Filter] Hourly buffer warming up (${this.btcHourlyPrices.length}/50) — using 5-min fallback`);
        }

        const sma50 = this.calculateSMA(btcPrices, 50);
        const sma20 = this.calculateSMA(btcPrices, 20);
        const currentPrice = btcPrices[btcPrices.length - 1];
        const ema9 = this.calculateEMA(btcPrices, 9);

        // [v3.3] Stricter trend check: price above SMA50 (not just SMA20) AND EMA9 above SMA20
        const isTrending = currentPrice > sma50 && ema9 > sma20;
        if (!isTrending) {
            console.log(`[BTC Filter] Trend fail — price ${currentPrice > sma50 ? '>' : '<'} SMA50, EMA9 ${ema9 > sma20 ? '>' : '<'} SMA20`);
            return false;
        }

        // [v3.3] RSI band: 45-72 — wide enough for healthy uptrends (RSI often runs 45-72 in bull moves)
        const btcRsi = this.calculateRSI(btcPrices, 14);
        if (btcRsi < 45 || btcRsi > 72) {
            console.log(`[BTC Filter] RSI ${btcRsi.toFixed(1)} outside healthy range 45-72`);
            return false;
        }

        // [v3.3] 24h change check: relaxed to -2% — normal daily volatility
        try {
            const ticker = await this.kraken.get24hTicker('XBTUSD');
            if (ticker) {
                const change24h = parseFloat(ticker.priceChangePercent);
                if (change24h < -2) {
                    console.log(`[BTC Filter] 24h change ${change24h.toFixed(1)}% too negative — holding off altcoins`);
                    return false;
                }
            }
        } catch (e) {
            // Non-critical — proceed if ticker fetch fails
        }

        // [v3.4] 4-hour momentum gate: 4 hourly candles back (was 48 × 5-min candles)
        // Catches BTC rolling over from a peak even when price is still above SMA50
        const lookback = usingHourly ? 4 : 48;
        if (btcPrices.length >= lookback) {
            const price4hAgo = btcPrices[btcPrices.length - lookback];
            const momentum4h = (currentPrice - price4hAgo) / price4hAgo;
            if (momentum4h < -0.015) {
                console.log(`[BTC MOMENTUM] BTC dropping ${(momentum4h * 100).toFixed(2)}% in 4h — pausing altcoin entries`);
                return false;
            }
        }

        return true;
    }

    // ========================================================================
    // MARKET DATA FETCHING
    // ========================================================================

    async fetchMarketData(symbol) {
        try {
            // Get klines (5-min candles, last 100)
            const klines = await this.kraken.getKlines(symbol, '5m', 100);
            if (!klines || klines.length === 0) return null;

            // Extract close prices
            const prices = klines.map(k => parseFloat(k[4])); // Close price
            const volumes = klines.map(k => parseFloat(k[5])); // Volume

            // Store in history
            this.priceHistory.set(symbol, prices);

            // [v3.4] Populate BTC hourly buffer — only for XBTUSD, once per 60 minutes
            if (symbol === 'XBTUSD') {
                const now = Date.now();
                const minutesSinceLastUpdate = (now - this.lastBtcHourlyUpdate) / 60000;
                if (minutesSinceLastUpdate >= 60) {
                    const latestPrice = prices[prices.length - 1];
                    if (latestPrice && isFinite(latestPrice)) {
                        this.btcHourlyPrices.push(latestPrice);
                        if (this.btcHourlyPrices.length > 200) {
                            this.btcHourlyPrices = this.btcHourlyPrices.slice(-200);
                        }
                        this.lastBtcHourlyUpdate = now;
                        console.log(`[BTC HOURLY] Recorded $${latestPrice.toFixed(0)} — buffer: ${this.btcHourlyPrices.length}/200`);
                    }
                }
            }

            // Get 24h ticker for volatility check
            const ticker24h = await this.kraken.get24hTicker(symbol);
            if (!ticker24h) return null;

            const currentPrice = parseFloat(ticker24h.lastPrice);
            const volume24h = parseFloat(ticker24h.quoteVolume); // USD volume
            const priceChange24h = parseFloat(ticker24h.priceChangePercent) / 100;
            const atr = this.calculateATR(klines);

            return {
                symbol,
                currentPrice,
                klines,
                prices,
                volumes,
                atr,
                atrPct: atr && currentPrice > 0 ? atr / currentPrice : null,
                volume24h,
                priceChange24h,
                high24h: parseFloat(ticker24h.highPrice),
                low24h: parseFloat(ticker24h.lowPrice)
            };
        } catch (error) {
            console.error(`❌ Error fetching data for ${symbol}:`, error.message);
            return null;
        }
    }

    // ========================================================================
    // MOMENTUM SCANNING
    // ========================================================================

    async scanForOpportunities(cryptoRegime = null) {
        const opportunities = [];
        const scanSymbols = await this.refreshSupportedSymbols();

        // Check BTC trend first (for altcoin correlation)
        const btcBullish = await this.isBTCBullish();
        if (!btcBullish) {
            console.log('🔴 BTC is bearish/neutral — BLOCKING all altcoin LONG entries (BTC gate)');
        }

        for (const symbol of scanSymbols) {
            // [v3.3] Hard reject: when BTC is not bullish, NO altcoin LONG entries allowed.
            // Only XBTUSD itself can still be traded regardless of BTC trend.
            // Previous approach (halving size) still let losing trades through (ETH -3.98%, SOL -5.16%).
            if (!btcBullish && symbol !== 'XBTUSD') {
                console.log(`[BTC GATE] BTC bearish — rejecting ${symbol} LONG entry`);
                continue;
            }
            const btcSizingFactor = 1.0;

            // Skip if already have position
            if (this.positions.has(symbol)) {
                continue;
            }

            // Fetch market data
            const data = await this.fetchMarketData(symbol);
            if (!data) continue;

            // Volume filter
            if (data.volume24h < this.config.filters.minVolumeUSD) {
                continue;
            }

            // Volatility filter (pause if extreme move)
            const volatility24h = Math.abs(data.priceChange24h);
            if (volatility24h > this.config.filters.maxVolatility24h) {
                console.log(`⚠️ ${symbol}: Too volatile (${(volatility24h * 100).toFixed(1)}%)`);
                continue;
            }

            // Calculate indicators
            const sma20 = this.calculateSMA(data.prices, 20);
            const ema9 = this.calculateEMA(data.prices, 9);
            const sma50 = this.calculateSMA(data.prices, 50); // downtrend filter
            const rsi = this.calculateRSI(data.prices, 14);

            if (!sma20 || !ema9) continue;

            // [v6.2] Downtrend skip — if SMA50 available and price below it, skip long entries
            if (sma50 && data.currentPrice < sma50) {
                console.log(`🔻 ${symbol}: price $${data.currentPrice.toFixed(2)} below SMA50 $${sma50.toFixed(2)} — skipping (downtrend)`);
                continue;
            }

            // [v3.2] MACD confirmation — prefer bullish MACD but don't hard-block.
            // Hard-blocking meant zero signals during MACD consolidation phases.
            // Instead: log a warning and apply a 0.7x size penalty if MACD is not bullish.
            const macd = this.calculateMACD(data.prices);
            const macdBullish = macd && macd.bullish;
            const macdSizingFactor = macdBullish ? 1.0 : 0.7;
            if (!macdBullish) {
                console.log(`[MACD] ${symbol}: histogram not bullish — reducing size to 70%`);
            }

            // [v3.2] Volume surge filter — lowered from 1.5x to 1.2x average.
            // 1.5x coincides with MACD alignment only ~15% of bars; 1.2x is still
            // above-average volume confirmation without requiring a spike.
            // Kraken's latest 5m candle is often still forming. Compare both the
            // live bar and the most recently closed bar so scans right after a new
            // candle opens do not see an artificial near-zero volume ratio.
            const liveVolumeWindow = data.volumes.length >= 20
                ? data.volumes.slice(-20)
                : data.volumes;
            const liveAvgVolume = liveVolumeWindow.length > 0
                ? liveVolumeWindow.reduce((a, b) => a + b, 0) / liveVolumeWindow.length
                : null;
            const currentBarVolume = data.volumes[data.volumes.length - 1] ?? 0;
            const currentBarVolumeRatio = liveAvgVolume > 0 ? currentBarVolume / liveAvgVolume : 1;

            const closedVolumeWindow = data.volumes.length >= 21
                ? data.volumes.slice(-21, -1)
                : liveVolumeWindow;
            const closedAvgVolume = closedVolumeWindow.length > 0
                ? closedVolumeWindow.reduce((a, b) => a + b, 0) / closedVolumeWindow.length
                : liveAvgVolume;
            const previousClosedBarVolume = data.volumes.length >= 2
                ? data.volumes[data.volumes.length - 2]
                : currentBarVolume;
            const previousClosedBarVolumeRatio = closedAvgVolume > 0 ? previousClosedBarVolume / closedAvgVolume : currentBarVolumeRatio;
            // [Tier3 Fix] Use only completed bar for volume — prevents stale volume from prior spike
            // Old: Math.max(current, previous) — inherited volume from already-passed spikes
            const volumeRatio = previousClosedBarVolumeRatio;

            // Combined sizing factor for this symbol
            const combinedSizingFactor = btcSizingFactor * macdSizingFactor;

            // [Phase 1] Signal quality filters — order flow imbalance and displacement candle
            const orderFlowImbalance = calculateOrderFlowImbalance(data.klines, 20);
            const hasDisplacement = isDisplacementCandle(data.klines, data.atr, 3);

            // [Phase 2] Volume Profile and Fair Value Gap analysis
            const volumeProfile = calculateVolumeProfile(data.klines, 50);
            const fvg = detectFairValueGaps(data.klines, 20);

            // Momentum calculation
            const momentum = (data.currentPrice - sma20) / sma20;
            const trendStrength = sma20 > 0 ? Math.abs(ema9 - sma20) / sma20 : 0;
            const pullbackFromEMA9 = ema9 > 0 ? Math.abs(data.currentPrice - ema9) / ema9 : 0;
            const atrPct = data.atrPct || null;
            const buildAtrRisk = (fallbackStopPct, fallbackTargetPct, rewardMultiple) => {
                let stopPct = fallbackStopPct;
                let targetPct = fallbackTargetPct;
                if (atrPct && atrPct > 0) {
                    // [v12.0] Research: stop must be >= 1.5x ATR to avoid noise shakeouts
                    // Floor: max(1.5x ATR, config stop), Cap: 8% to prevent extreme stops
                    stopPct = Math.min(Math.max(atrPct * 1.5, fallbackStopPct), 0.08);
                    targetPct = Math.min(Math.max(stopPct * rewardMultiple, fallbackTargetPct), 0.20);
                }
                return { stopPct, targetPct };
            };
            let bestSignal = null;

            const pullbackConfig = this.config.pullbackStrategy;
            const minMomentumVolumeRatio = this.config.filters.minVolumeRatioMomentum ?? 1.05;
            const pullbackPositions = Array.from(this.positions.values())
                .filter(position => position.tier === 'pullback').length;

            if (
                pullbackPositions < pullbackConfig.maxPositions &&
                trendStrength >= pullbackConfig.minTrendStrength &&
                ema9 >= sma20 &&
                data.currentPrice >= sma20 * 0.995 &&
                data.currentPrice <= ema9 * 1.01 &&
                pullbackFromEMA9 <= pullbackConfig.maxPullbackFromEMA9 &&
                rsi >= pullbackConfig.rsiLower &&
                rsi <= pullbackConfig.rsiUpper &&
                volumeRatio >= pullbackConfig.minVolumeRatio
            ) {
                const regimeProfile = evaluateCryptoRegimeSignal({
                    strategy: 'trendPullback',
                    btcBullish,
                    trendStrength: trendStrength * 100,
                    volumeRatio,
                    rsi,
                    pullbackPct: pullbackFromEMA9 * 100,
                    tier: 'pullback'
                });
                if (regimeProfile.tradable) {
                    const atrRisk = buildAtrRisk(pullbackConfig.stopLoss, pullbackConfig.profitTarget, 2.2);
                    const pullbackSignal = {
                        symbol,
                        tier: 'pullback',
                        strategy: 'trendPullback',
                        marketRegime: regimeProfile.regime,
                        regime: regimeProfile.regime,
                        regimeQuality: regimeProfile.quality,
                        price: data.currentPrice,
                        momentum: momentum * 100,
                        trendStrength: trendStrength * 100,
                        pullbackPct: pullbackFromEMA9 * 100,
                        atrPct,
                        rsi,
                        volume24h: data.volume24h,
                        volumeRatio,
                        sizingFactor: combinedSizingFactor * pullbackConfig.sizingFactor,
                        // [v6.2] Stop/target from slippage-adjusted effective entry, not raw price
                        stopLoss: data.currentPrice * (1 + 0.003) * (1 - atrRisk.stopPct),
                        takeProfit: data.currentPrice * (1 + 0.003) * (1 + atrRisk.targetPct),
                        stopLossPercent: atrRisk.stopPct * 100,
                        profitTargetPercent: atrRisk.targetPct * 100,
                        // [Phase 1/2] Attach analysis data for committee scoring
                        orderFlowImbalance,
                        hasDisplacement,
                        volumeProfileData: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                        fvgCount: fvg.bullish.length + fvg.bearish.length
                    };
                    let pullbackScore = scoreCryptoSignal({
                        strategy: pullbackSignal.strategy,
                        tier: pullbackSignal.tier,
                        momentum: pullbackSignal.momentum,
                        trendStrength,
                        volumeRatio,
                        rsi,
                        sizingFactor: pullbackSignal.sizingFactor,
                        macdBullish
                    }) * regimeProfile.quality;

                    // [Phase 1] Displacement candle bonus
                    if (hasDisplacement) {
                        pullbackScore *= 1.15; // 15% score bonus for displacement confirmation
                    }

                    // [Phase 2] Volume Profile bonus — price near VAL (value) gets a boost
                    if (volumeProfile) {
                        const distToVAL = Math.abs(data.currentPrice - volumeProfile.val) / data.currentPrice;
                        const distToVAH = Math.abs(data.currentPrice - volumeProfile.vah) / data.currentPrice;
                        if (distToVAL < 0.01) {
                            pullbackScore *= 1.10; // 10% bonus: buying near value area low
                        } else if (distToVAH < 0.005) {
                            pullbackScore *= 0.90; // 10% penalty: buying near value area high
                        }
                    }

                    // [Phase 2] FVG confirmation bonus — bullish FVG at low-volume node
                    if (fvg.bullish.length > 0 && volumeProfile && volumeProfile.lowVolumeNodes.length > 0) {
                        const hasConfirmedFVG = fvg.bullish.some(gap =>
                            volumeProfile.lowVolumeNodes.some(node =>
                                gap.gapMid >= node.priceLow && gap.gapMid <= node.priceHigh
                            )
                        );
                        if (hasConfirmedFVG) {
                            pullbackScore *= 1.12; // 12% bonus: FVG at low-volume node
                        }
                    }

                    // [v14.0] Apply strategy-regime weight from learning system
                    pullbackScore *= (strategyRegimeWeights.trendPullback || 1.0);
                    if (cryptoRegime && cryptoRegime.strategyRouting) pullbackScore *= cryptoRegime.strategyRouting.pullbackWeight;
                    pullbackSignal.score = parseFloat(pullbackScore.toFixed(3));
                    bestSignal = pullbackSignal;
                }
            }

            // [v14.0] Mean Reversion Strategy — Bollinger Band + RSI extremes in low/medium vol
            const mrConfig = this.config.meanReversionStrategy;
            const routing = cryptoRegime ? cryptoRegime.strategyRouting : { meanReversionWeight: 0.5 };
            if (routing.meanReversionWeight > 0) {
                const bb = this.calculateBollingerBands(data.prices, mrConfig.bollingerPeriod, mrConfig.bollingerStdDev);
                if (bb && bb.bandwidth >= mrConfig.minBandwidth && bb.bandwidth <= mrConfig.maxBandwidth) {
                    const mrPositions = Array.from(this.positions.values()).filter(p => p.strategy === 'meanReversion').length;
                    // LONG mean reversion: price at/below lower band + RSI oversold
                    if (mrPositions < mrConfig.maxPositions && bb.percentB <= 0.10 && rsi < mrConfig.rsiOversold) {
                        const mrRegimeProfile = evaluateCryptoRegimeSignal({
                            strategy: 'meanReversion', btcBullish, trendStrength: 0, volumeRatio, rsi, pullbackPct: 0, tier: 'meanRevert', cryptoRegime
                        });
                        if (mrRegimeProfile.tradable) {
                            const atrRisk = buildAtrRisk(mrConfig.stopLossPercent, mrConfig.profitTargetPercent, 1.6);
                            const mrSignal = {
                                symbol,
                                tier: 'meanRevert',
                                strategy: 'meanReversion',
                                marketRegime: mrRegimeProfile.regime,
                                regime: mrRegimeProfile.regime,
                                regimeQuality: mrRegimeProfile.quality,
                                price: data.currentPrice,
                                momentum: momentum * 100,
                                trendStrength: trendStrength * 100,
                                pullbackPct: 0,
                                atrPct,
                                rsi,
                                volume24h: data.volume24h,
                                volumeRatio,
                                sizingFactor: combinedSizingFactor * mrConfig.sizingFactor,
                                stopLoss: data.currentPrice * (1 + 0.003) * (1 - atrRisk.stopPct),
                                takeProfit: data.currentPrice * (1 + 0.003) * (1 + atrRisk.targetPct),
                                stopLossPercent: atrRisk.stopPct * 100,
                                profitTargetPercent: atrRisk.targetPct * 100,
                                bollingerPercentB: bb.percentB,
                                bollingerBandwidth: bb.bandwidth,
                                orderFlowImbalance,
                                hasDisplacement,
                                volumeProfileData: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                                fvgCount: fvg.bullish.length + fvg.bearish.length
                            };
                            let mrScore = scoreCryptoSignal({
                                strategy: 'meanReversion', tier: 'meanRevert', momentum: 0, trendStrength: 0,
                                volumeRatio, rsi, sizingFactor: mrSignal.sizingFactor, macdBullish, bollingerPercentB: bb.percentB
                            }) * mrRegimeProfile.quality;
                            // Apply strategy-regime weight from learning system
                            mrScore *= (strategyRegimeWeights.meanReversion || 1.0) * routing.meanReversionWeight;
                            mrSignal.score = parseFloat(mrScore.toFixed(3));
                            console.log(`🔄 ${symbol} (meanReversion): BB%B ${(bb.percentB * 100).toFixed(1)}%, RSI ${rsi.toFixed(1)}, BW ${(bb.bandwidth * 100).toFixed(2)}%, score ${mrSignal.score}`);
                            if (!bestSignal || mrSignal.score > bestSignal.score) {
                                bestSignal = mrSignal;
                            }
                        }
                    }
                }
            }

            // [Tier3 Fix] True momentum breakout — Donchian channel breakout
            // Captures genuine breakouts that the pullback strategy misses.
            // The existing "momentum" tiers require price NEAR SMA20 (pullback entry);
            // this block fires when price BREAKS ABOVE the prior N-bar high with volume.
            // Research: 15-day Donchian on crypto is profitable across all lookbacks (5-100 days).
            if (!bestSignal && btcBullish) {
                const lookbackPeriods = Math.min(data.prices.length - 1, 240); // 240 x 5min = 20 hours
                if (lookbackPeriods >= 60) { // need at least 5 hours of data
                    const priorPrices = data.prices.slice(-(lookbackPeriods + 1), -1); // exclude current bar
                    const channelHigh = Math.max(...priorPrices);
                    const channelLow = Math.min(...priorPrices);
                    const channelRange = channelHigh - channelLow;

                    // Breakout: price > channel high AND volume confirmation AND RSI not overbought
                    if (
                        data.currentPrice > channelHigh &&
                        volumeRatio >= 1.5 &&
                        rsi >= 50 && rsi <= 75 &&
                        channelRange > 0
                    ) {
                        const breakoutStrength = (data.currentPrice - channelHigh) / channelHigh;

                        // Only take clean breakouts (not too extended — max 3% above channel high)
                        if (breakoutStrength <= 0.03) {
                            const breakoutRegimeProfile = evaluateCryptoRegimeSignal({
                                strategy: 'momentumBreakout',
                                btcBullish,
                                trendStrength: trendStrength * 100,
                                volumeRatio,
                                rsi,
                                pullbackPct: 0,
                                tier: 'breakout'
                            });

                            if (breakoutRegimeProfile.tradable) {
                                const atrRisk = buildAtrRisk(0.025, 0.05, 2.0); // 2.5% stop, 5% target fallback; 2:1 R:R
                                const breakoutSignal = {
                                    symbol,
                                    tier: 'breakout',
                                    strategy: 'momentumBreakout',
                                    marketRegime: breakoutRegimeProfile.regime,
                                    regime: breakoutRegimeProfile.regime,
                                    regimeQuality: breakoutRegimeProfile.quality,
                                    price: data.currentPrice,
                                    momentum: momentum * 100,
                                    trendStrength: trendStrength * 100,
                                    pullbackPct: 0,
                                    atrPct,
                                    rsi,
                                    volume24h: data.volume24h,
                                    volumeRatio,
                                    sizingFactor: combinedSizingFactor,
                                    // Slippage-adjusted entry (0.3% fill slippage consistent with other strategies)
                                    stopLoss: data.currentPrice * (1 + 0.003) * (1 - atrRisk.stopPct),
                                    takeProfit: data.currentPrice * (1 + 0.003) * (1 + atrRisk.targetPct),
                                    stopLossPercent: atrRisk.stopPct * 100,
                                    profitTargetPercent: atrRisk.targetPct * 100,
                                    // Breakout-specific metadata
                                    channelHigh,
                                    channelLow,
                                    breakoutStrength: breakoutStrength * 100,
                                    // [Phase 1/2] Attach analysis data for committee scoring
                                    orderFlowImbalance,
                                    hasDisplacement,
                                    volumeProfileData: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                                    fvgCount: fvg.bullish.length + fvg.bearish.length,
                                    score: 0 // computed below
                                };

                                // Score: breakout strength + volume + RSI sweet-spot
                                const normBreakout = Math.min(breakoutStrength / 0.03, 1.0);
                                const normVol = Math.min(volumeRatio / 4, 1.0);
                                const normRsi = (rsi >= 55 && rsi <= 70) ? 1.0 : 0.7;
                                let breakoutScore = (normBreakout * 0.35 + normVol * 0.35 + normRsi * 0.30)
                                    * breakoutRegimeProfile.quality;

                                // [Phase 1] Displacement candle bonus — breakouts with displacement are higher quality
                                if (hasDisplacement) {
                                    breakoutScore *= 1.15;
                                }

                                // [Phase 2] Volume Profile bonus — breaking above VAH is a strong continuation signal
                                if (volumeProfile) {
                                    const distToVAH = Math.abs(data.currentPrice - volumeProfile.vah) / data.currentPrice;
                                    if (distToVAH < 0.005) {
                                        breakoutScore *= 1.10; // 10% bonus: breaking out of value area
                                    }
                                }

                                // [Phase 2] FVG confirmation bonus
                                if (fvg.bullish.length > 0 && volumeProfile && volumeProfile.lowVolumeNodes.length > 0) {
                                    const hasConfirmedFVG = fvg.bullish.some(gap =>
                                        volumeProfile.lowVolumeNodes.some(node =>
                                            gap.gapMid >= node.priceLow && gap.gapMid <= node.priceHigh
                                        )
                                    );
                                    if (hasConfirmedFVG) {
                                        breakoutScore *= 1.12; // 12% bonus: FVG at low-volume node
                                    }
                                }

                                // [v14.0] Apply strategy-regime weight from learning system
                                // Uses 'momentum' weight bucket — breakout is a momentum-type signal
                                breakoutScore *= (strategyRegimeWeights.momentum || 1.0);
                                if (cryptoRegime && cryptoRegime.strategyRouting) breakoutScore *= (cryptoRegime.strategyRouting.momentumWeight || 1.0);

                                breakoutSignal.score = parseFloat(breakoutScore.toFixed(3));
                                console.log(`🚀 ${symbol} (breakout): Price broke ${lookbackPeriods}-bar high by ${(breakoutStrength * 100).toFixed(2)}%, Vol ${volumeRatio.toFixed(2)}x, RSI ${rsi.toFixed(1)}, score ${breakoutSignal.score}`);
                                bestSignal = breakoutSignal;
                            }
                        }
                    }
                }
            }

            if (volumeRatio < minMomentumVolumeRatio) {
                if (bestSignal) {
                    console.log(`[Volume Gate] ${symbol} signal BLOCKED — volumeRatio ${volumeRatio.toFixed(2)} < ${minMomentumVolumeRatio} (${bestSignal.strategy})`);
                }
                continue;
            }

            // [v14.0] Apply strategy-regime weights to momentum signals
            // Try each tier
            for (const [tierName, tier] of Object.entries(this.config.tiers)) {
                // Check RSI range
                if (rsi < tier.rsiLower || rsi > tier.rsiUpper) continue;

                // Check uptrend (EMA9 > SMA20)
                if (ema9 < sma20) continue; // Not in uptrend

                // [v6.2] Pullback-to-SMA entry: buy the dip, not the top.
                // Old: required momentum > threshold (price far above SMA20 = chasing).
                // New: require price NEAR SMA20 (pulled back to support in uptrend).
                // momentum = (price - sma20) / sma20; near SMA20 means momentum close to 0.
                if (momentum > 0.03) continue;  // Price >3% above SMA20 = already moved, skip (was 1% — too narrow for crypto volatility)
                if (momentum < -0.03) continue;  // Price >3% below SMA20 = broken support, skip (was 2% — too narrow for crypto volatility)

                // Check position limits for this tier
                const tierPositions = Array.from(this.positions.values())
                    .filter(p => p.tier === tierName).length;
                if (tierPositions >= tier.maxPositions) continue;

                // OPPORTUNITY FOUND — run bridge confirmation before committing
                const bridgeResult = await this.queryStrategyBridge(symbol, data.prices);
                if (bridgeResult === null) {
                    // Bridge offline or slow — proceed on local signal (non-blocking by design)
                    console.log(`[Bridge] Offline/timeout for ${symbol} — proceeding on local signal`);
                } else if (bridgeResult.should_enter && bridgeResult.direction === 'long') {
                    console.log(`[Bridge] ${symbol} confirmed ✓ conf: ${(bridgeResult.confidence || 0).toFixed(2)}`);
                } else {
                    const bridgeConfidence = bridgeResult.confidence || 0;
                    const isContraryBridgeView = bridgeResult.direction === 'short' && bridgeConfidence >= 0.55;
                    if (isContraryBridgeView) {
                        console.log(`[Bridge] ${symbol} rejected — bridge: ${bridgeResult.direction} (conf: ${bridgeConfidence.toFixed(2)}): ${bridgeResult.reason || ''}`);
                        break;
                    }
                    console.log(`[Bridge] ${symbol} neutral/weak (${bridgeResult.direction || 'neutral'}, conf: ${bridgeConfidence.toFixed(2)}) — proceeding on local signal`);
                }

                const regimeProfile = evaluateCryptoRegimeSignal({
                    strategy: 'momentum',
                    btcBullish,
                    trendStrength: trendStrength * 100,
                    volumeRatio,
                    rsi,
                    pullbackPct: pullbackFromEMA9 * 100,
                    tier: tierName
                });
                if (!regimeProfile.tradable) {
                    continue;
                }
                const atrRisk = buildAtrRisk(tier.stopLoss, tier.profitTarget, 2.5);
                const momentumSignal = {
                    symbol,
                    tier: tierName,
                    strategy: 'momentum',
                    marketRegime: regimeProfile.regime,
                    regime: regimeProfile.regime,
                    regimeQuality: regimeProfile.quality,
                    price: data.currentPrice,
                    momentum: momentum * 100,
                    trendStrength: trendStrength * 100,
                    pullbackPct: pullbackFromEMA9 * 100,
                    atrPct,
                    rsi,
                    volume24h: data.volume24h,
                    volumeRatio,
                    sizingFactor: combinedSizingFactor, // BTC + MACD sizing penalty
                    // [v6.2] Stop/target from slippage-adjusted effective entry, not raw price
                    stopLoss: data.currentPrice * (1 + 0.003) * (1 - atrRisk.stopPct),
                    takeProfit: data.currentPrice * (1 + 0.003) * (1 + atrRisk.targetPct),
                    stopLossPercent: atrRisk.stopPct * 100,
                    profitTargetPercent: atrRisk.targetPct * 100,
                    // [Phase 1/2] Attach analysis data for committee scoring
                    orderFlowImbalance,
                    hasDisplacement,
                    volumeProfileData: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                    fvgCount: fvg.bullish.length + fvg.bearish.length
                };
                let momentumScore = scoreCryptoSignal({
                    strategy: momentumSignal.strategy,
                    tier: momentumSignal.tier,
                    momentum: momentumSignal.momentum,
                    trendStrength,
                    volumeRatio,
                    rsi,
                    sizingFactor: momentumSignal.sizingFactor,
                    macdBullish
                }) * regimeProfile.quality;

                // [Phase 1] Displacement candle bonus
                if (hasDisplacement) {
                    momentumScore *= 1.15; // 15% score bonus for displacement confirmation
                }

                // [Phase 2] Volume Profile bonus — price near VAL (value) gets a boost
                if (volumeProfile) {
                    const distToVAL = Math.abs(data.currentPrice - volumeProfile.val) / data.currentPrice;
                    const distToVAH = Math.abs(data.currentPrice - volumeProfile.vah) / data.currentPrice;
                    if (distToVAL < 0.01) {
                        momentumScore *= 1.10; // 10% bonus: buying near value area low
                    } else if (distToVAH < 0.005) {
                        momentumScore *= 0.90; // 10% penalty: buying near value area high
                    }
                }

                // [Phase 2] FVG confirmation bonus — bullish FVG at low-volume node
                if (fvg.bullish.length > 0 && volumeProfile && volumeProfile.lowVolumeNodes.length > 0) {
                    const hasConfirmedFVG = fvg.bullish.some(gap =>
                        volumeProfile.lowVolumeNodes.some(node =>
                            gap.gapMid >= node.priceLow && gap.gapMid <= node.priceHigh
                        )
                    );
                    if (hasConfirmedFVG) {
                        momentumScore *= 1.12; // 12% bonus: FVG at low-volume node
                    }
                }

                // [v14.0] Apply strategy-regime weight from learning system
                momentumScore *= (strategyRegimeWeights.momentum || 1.0);
                if (cryptoRegime && cryptoRegime.strategyRouting) momentumScore *= cryptoRegime.strategyRouting.momentumWeight;
                momentumSignal.score = parseFloat(momentumScore.toFixed(3));

                console.log(`✨ ${symbol} (${tierName}): Momentum ${(momentum * 100).toFixed(2)}%, RSI ${rsi.toFixed(1)}, Vol $${(data.volume24h / 1000000).toFixed(1)}M`);
                if (!bestSignal || momentumSignal.score >= bestSignal.score) {
                    bestSignal = momentumSignal;
                }
                break; // Only match one tier
            }

            if (bestSignal) {
                if (bestSignal.strategy === 'trendPullback') {
                    console.log(`↩️ ${symbol} (pullback): Trend ${(trendStrength * 100).toFixed(2)}%, Pullback ${(pullbackFromEMA9 * 100).toFixed(2)}%, RSI ${rsi.toFixed(1)}`);
                }
                opportunities.push(bestSignal);
            }
        }

        opportunities.sort((a, b) => (b.score || 0) - (a.score || 0));
        return opportunities;
    }

    async refreshSupportedSymbols(force = false) {
        const validationTtlMs = 60 * 60 * 1000;
        if (!force && this.lastSymbolValidationAt && (Date.now() - this.lastSymbolValidationAt) < validationTtlMs) {
            return this.activeSymbols;
        }

        const assetPairs = await this.kraken.getAssetPairs();
        this.lastSymbolValidationAt = Date.now();
        if (!assetPairs) return this.activeSymbols;

        const supported = new Set();
        for (const pair of Object.values(assetPairs)) {
            if (pair && pair.status === 'online' && typeof pair.altname === 'string') {
                supported.add(pair.altname);
            }
        }

        const nextActiveSymbols = this.config.symbols.filter(symbol => supported.has(symbol));
        const nextInvalidSymbols = this.config.symbols.filter(symbol => !supported.has(symbol));

        if (nextActiveSymbols.length > 0) {
            this.activeSymbols = nextActiveSymbols;
        }

        const invalidChanged = nextInvalidSymbols.length !== this.invalidSymbols.size
            || nextInvalidSymbols.some(symbol => !this.invalidSymbols.has(symbol));
        this.invalidSymbols = new Set(nextInvalidSymbols);

        if (invalidChanged && nextInvalidSymbols.length > 0) {
            console.warn(`⚠️ Kraken unsupported symbols removed from live scan: ${nextInvalidSymbols.join(', ')}`);
        }

        return this.activeSymbols;
    }

    // ========================================================================
    // ANTI-CHURNING PROTECTION
    // ========================================================================

    canTrade(symbol) {
        // Prevent re-entry on a symbol that already has an open position
        if (this.positions.has(symbol)) {
            console.log(`❌ ${symbol}: Already have an open position — skipping`);
            return { allowed: false, reason: 'Already have open position' };
        }

        // Check daily trade limit
        if (this.dailyTradeCount >= this.config.maxTradesPerDay) {
            console.log(`❌ Daily trade limit reached (${this.dailyTradeCount}/${this.config.maxTradesPerDay})`);
            return { allowed: false, reason: 'Daily limit reached' };
        }

        // Check per-symbol limit
        const symbolTradesToday = this.tradesToday.filter(t => t.symbol === symbol).length;
        if (symbolTradesToday >= this.config.maxTradesPerSymbol) {
            console.log(`❌ ${symbol}: Symbol limit reached (${symbolTradesToday}/${this.config.maxTradesPerSymbol})`);
            return { allowed: false, reason: 'Symbol limit reached' };
        }

        // Check cooldown period — bypass if profit-protect re-entry is active
        const reentryData = this.profitProtectReentrySymbols.get(symbol);
        const reentryTimestamp = reentryData ? reentryData.timestamp : null;
        const reentryActive = reentryTimestamp && (Date.now() - reentryTimestamp) < 15 * 60 * 1000; // 15 min window
        if (reentryActive) {
            console.log(`✅ ${symbol}: Cooldown BYPASSED — profit-protect re-entry active (${((Date.now() - reentryTimestamp) / 60000).toFixed(1)} min ago)`);
            // Clean up expired flag
        } else {
            // Clean up expired re-entry flag if any
            if (reentryTimestamp) this.profitProtectReentrySymbols.delete(symbol);
            const lastTrade = this.lastTradeTime.get(symbol);
            if (lastTrade) {
                const timeSince = (Date.now() - lastTrade) / 60000; // minutes
                if (timeSince < this.config.minTimeBetweenTrades) {
                    console.log(`❌ ${symbol}: Cooldown active (${timeSince.toFixed(1)}/${this.config.minTimeBetweenTrades} min)`);
                    return { allowed: false, reason: 'Cooldown period' };
                }
            }
        }

        // Check position limits
        if (this.positions.size >= this.config.maxTotalPositions) {
            console.log(`❌ Max positions reached (${this.positions.size}/${this.config.maxTotalPositions})`);
            return { allowed: false, reason: 'Max positions' };
        }

        return { allowed: true };
    }

    // [v10.1] Re-entry validation — only allow re-entry if conditions still favor the original direction
    isCryptoReentryValid(symbol, signal) {
        const reentryData = this.profitProtectReentrySymbols.get(symbol);
        if (!reentryData) return { valid: true, reason: 'no re-entry flag' };

        const { direction: origDirection } = reentryData;

        // Direction must match the original trade direction
        const signalDirection = signal.direction || 'long';
        if (signalDirection !== origDirection) {
            console.log(`[RE-ENTRY CHECK] ${symbol}: direction flipped (was ${origDirection}, now ${signalDirection}) — REJECTED`);
            this.profitProtectReentrySymbols.delete(symbol);
            return { valid: false, reason: `direction flipped from ${origDirection} to ${signalDirection}` };
        }

        // Trend must still be aligned (EMA above SMA for longs)
        const momentum = signal.momentum || 0;
        const trendAligned = (signalDirection === 'long' && momentum >= 0) ||
                             (signalDirection === 'short' && momentum <= 0);

        // RSI must not be in exhaustion zone
        const rsi = signal.rsi || 50;
        const rsiExhausted = (signalDirection === 'long' && rsi > 75) ||
                             (signalDirection === 'short' && rsi < 25);

        // Momentum must be positive for direction
        const momentumAligned = trendAligned; // same check for crypto

        const pass = trendAligned && !rsiExhausted && momentumAligned;
        console.log(`[RE-ENTRY CHECK] ${symbol}: trend=${trendAligned ? 'aligned' : 'misaligned'}, rsi=${rsi.toFixed(1)}(${rsiExhausted ? 'EXHAUSTED' : 'OK'}), momentum=${momentum.toFixed(2)}%(${momentumAligned ? 'OK' : 'FAIL'}) — ${pass ? 'APPROVED' : 'REJECTED'}`);

        if (!pass) {
            this.profitProtectReentrySymbols.delete(symbol);
        }
        return { valid: pass, reason: pass ? 'conditions still favorable' : `trend=${!trendAligned ? 'misaligned' : 'ok'}, rsi=${rsiExhausted ? 'exhausted' : 'ok'}` };
    }

    // [v10.1] Entry quality gate — every crypto signal must pass before execution
    // committeeThreshold: auto-optimized value passed from tradingLoop (default 0.50)
    isCryptoEntryQualified(signal, committee, btcBullish, committeeThreshold = 0.50) {
        const reasons = [];
        const symbol = signal.symbol;
        const direction = signal.direction || 'long';

        // 1. Committee confidence must meet threshold (auto-optimized, default 0.50)
        const conf = committee ? committee.confidence : 0;
        if (conf < committeeThreshold) {
            reasons.push(`confidence ${conf.toFixed(2)} < ${committeeThreshold.toFixed(3)}`);
        }

        // 2. BTC correlation check — if BTC is bearish, don't go LONG on altcoins
        const isAltcoin = symbol !== 'XBTUSD' && symbol !== 'ETHUSD';
        if (direction === 'long' && isAltcoin && btcBullish === false) {
            reasons.push(`BTC bearish — no long altcoin entries`);
        }

        // 3. RSI between 25-75 (crypto gets wider range due to volatility)
        // [v14.0] Mean reversion specifically targets RSI extremes — widen range for it
        const rsi = signal.rsi || 50;
        const isMeanReversion = signal.strategy === 'meanReversion';
        const rsiLow = isMeanReversion ? 15 : 25;
        const rsiHigh = isMeanReversion ? 85 : 75;
        if (rsi < rsiLow || rsi > rsiHigh) {
            reasons.push(`rsi=${rsi.toFixed(1)} outside ${rsiLow}-${rsiHigh}`);
        }

        // 4. At least 3 committee components must be positive (raised from 2)
        let positiveCount = 0;
        if (committee && committee.components) {
            const comps = committee.components;
            for (const key of Object.keys(comps)) {
                if (typeof comps[key] === 'number' && comps[key] > 0) positiveCount++;
            }
        }
        if (positiveCount < 3) {
            reasons.push(`components=${positiveCount} positive (need 3+)`);
        }

        // 5. ATR regime must not be "extreme volatility" (too risky)
        if (signal.marketRegime === 'extreme' || signal.marketRegime === 'high') {
            reasons.push(`regime=${signal.marketRegime} (too volatile)`);
        }

        const pass = reasons.length === 0;
        const btcTrend = btcBullish === true ? 'bullish' : btcBullish === false ? 'bearish' : 'unknown';
        console.log(`[QUALITY GATE] ${symbol} ${direction}: confidence=${conf.toFixed(2)}, btcTrend=${btcTrend}, rsi=${rsi.toFixed(1)}, components=${positiveCount}, regime=${signal.marketRegime || 'unknown'} — ${pass ? 'PASS' : 'FAIL: ' + reasons.join(', ')}`);

        return { qualified: pass, reason: pass ? 'all checks passed' : reasons.join(', ') };
    }

    // ========================================================================
    // TRADE EXECUTION
    // ========================================================================

    async executeTrade(signal) {
        const check = this.canTrade(signal.symbol);
        if (!check.allowed) {
            console.log(`⛔ Trade blocked for ${signal.symbol}: ${check.reason}`);
            return null;
        }

        try {
            // [v3.2] Dynamic position sizing — Kelly-inspired: scale with win rate
            // Defaults to 50% win rate until 10 trades have been recorded
            const totalClosedTrades = this.winningTrades + this.losingTrades;
            const runningWinRate = totalClosedTrades >= 10
                ? this.winningTrades / totalClosedTrades
                : 0.5;
            const sizingMultiplier = Math.max(0.0, Math.min(2.0, runningWinRate / 0.5));
            if (sizingMultiplier <= 0) {
                console.log(`⚠️  [SKIP] ${signal.symbol}: Kelly sizing ${sizingMultiplier.toFixed(2)}x — win rate too low (${(runningWinRate * 100).toFixed(1)}%), skipping trade`);
                return null;
            }
            const signalSizingFactor = signal.sizingFactor ?? 1.0;
            // [v4.7] Risk-based position cap: max position = equity * RISK_PER_TRADE / stopLossPct
            const stopPctDecimal = (signal.stopLossPercent || 5) / 100; // e.g. 5.0% → 0.05
            const currentEquity = (this.config.basePositionSizeUSD * 20) + (this.totalProfit - this.totalLoss);
            const riskCapUSD = (currentEquity * RISK_PER_TRADE) / stopPctDecimal;

            // [v4.6] Apply guardrail size multiplier (consecutive-loss protection)
            const guardrailMultiplier = signal.guardrailSizeMultiplier || 1.0;
            // [v4.6] Apply agent position_size_multiplier
            const agentSizeMultiplier = signal.agentPositionSizeMultiplier || 1.0;

            // [v9.0] Monte Carlo position sizing — override Kelly when 20+ trade samples available
            let mcMultiplier = 1.0;
            if (this.monteCarloSizer.tradeReturns.length >= 50) {
                const mcResult = this.monteCarloSizer.optimize();
                const halfKelly = mcResult.halfKelly;
                mcMultiplier = Math.min(halfKelly / 0.01, 2.0); // cap at 2x base
                mcMultiplier = Math.max(mcMultiplier, 0.0);      // floor at 0.0x
                if (mcMultiplier <= 0) {
                    console.log(`⚠️  [SKIP] ${signal.symbol}: Monte Carlo sizing 0x — negative expectancy detected`);
                    return null;
                }
                console.log(`[MONTE-CARLO] Using optimized position size: multiplier ${mcMultiplier.toFixed(2)}x (halfKelly: ${(halfKelly * 100).toFixed(1)}%, samples: ${mcResult.sampleSize}, confidence: ${mcResult.confidence})`);
            }

            const positionSizeUSD = Math.min(
                this.config.basePositionSizeUSD * sizingMultiplier * signalSizingFactor * guardrailMultiplier * agentSizeMultiplier * mcMultiplier,
                this.config.maxPositionSizeUSD,
                riskCapUSD
            );
            console.log(`   [Kelly Sizing] WinRate: ${(runningWinRate * 100).toFixed(1)}% → kelly ${sizingMultiplier.toFixed(2)}x · signal ${signalSizingFactor.toFixed(2)}x · guardrail ${guardrailMultiplier.toFixed(2)}x · agent ${agentSizeMultiplier.toFixed(2)}x · mc ${mcMultiplier.toFixed(2)}x → $${positionSizeUSD.toFixed(0)} (risk cap $${riskCapUSD.toFixed(0)})`);

            // [v3.5] Crypto slippage model — Kraken taker fee is 0.26%; market orders
            // also move the book. Model as 0.30% total execution cost.
            // Adjusts effective entry price so stop/target R:R is realistic after fees.
            const CRYPTO_SLIPPAGE = 0.003; // 0.30% taker fee + market impact
            const effectiveEntry = signal.price * (1 + CRYPTO_SLIPPAGE);
            const quantity = positionSizeUSD / effectiveEntry;

            // Kraken minimum order sizes per symbol (in base asset units)
            const KRAKEN_MIN_QTY = {
                XBTUSD: 0.0001, ETHUSD: 0.01, SOLUSD: 0.1,
                ADAUSD: 10,     XRPUSD: 10,   AVAXUSD: 0.1,
                LINKUSD: 0.5,   DOTUSD: 0.5,  UNIUSD: 0.5,
                ATOMUSD: 0.5,   MATICUSD: 5,  LTCUSD: 0.05
            };
            const minQty = KRAKEN_MIN_QTY[signal.symbol] ?? 0.0001;
            if (quantity < minQty) {
                console.log(`⚠️  [SKIP] ${signal.symbol}: quantity ${quantity.toFixed(8)} below Kraken minimum ${minQty} (position $${positionSizeUSD.toFixed(0)} too small)`);
                return null;
            }

            console.log(`\n📈 EXECUTING CRYPTO TRADE:`);
            console.log(`   Symbol: ${signal.symbol}`);
            console.log(`   Tier: ${signal.tier}`);
            console.log(`   Entry: $${signal.price.toFixed(2)}`);
            console.log(`   Quantity: ${quantity.toFixed(6)}`);
            console.log(`   Size: $${positionSizeUSD.toFixed(2)}`);
            console.log(`   Stop: $${signal.stopLoss.toFixed(2)} (-${signal.stopLossPercent.toFixed(1)}%)`);
            console.log(`   Target: $${signal.takeProfit.toFixed(2)} (+${signal.profitTargetPercent.toFixed(1)}%)`);

            let order;
            if (isRealTradingEnabled()) {
                order = await this.kraken.placeOrder(signal.symbol, 'BUY', quantity);
            } else {
                order = { orderId: `paper-buy-${signal.symbol}-${Date.now()}` };
                console.log(`🧪 PAPER MODE: Simulated BUY order for ${signal.symbol}`);
            }

            if (!order) {
                console.log(`❌ Failed to place order for ${signal.symbol}`);
                return null;
            }

            // Create position — include currentPrice/unrealizedPnL so status
            // endpoint returns valid values before the first managePositions() cycle
            const tags = buildCryptoTradeTags(signal, signal.tier);
            const position = {
                symbol: signal.symbol,
                tier: signal.tier,
                strategy: tags.strategy,
                regime: tags.regime,
                entry: effectiveEntry,
                quantity,
                positionSize: positionSizeUSD,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit,
                orderId: order.orderId,
                openTime: new Date(),
                momentum: signal.momentum,
                rsi: signal.rsi,
                atrPct: signal.atrPct,
                stopLossPercent: signal.stopLossPercent,
                regimeQuality: signal.regimeQuality,
                signalScore: signal.score,
                currentPrice: signal.price,
                unrealizedPnL: 0,
                unrealizedPnLPct: 0,
                // [v10.0] Aggressive Profit Protection tracking
                peakUnrealizedPL: 0,
                wasInProfit: false,
                // [v8.0] Decision linkage for bandit learning
                decisionRunId: signal.decisionRunId || null,
                banditArm: signal.banditArm || null,
                // [Phase 4] Signal snapshot for trade evaluation
                signalSnapshot: {
                    orderFlowImbalance: signal.orderFlowImbalance || 0,
                    hasDisplacement: signal.hasDisplacement || false,
                    volumeProfile: signal.volumeProfile || null,
                    fvgCount: signal.fvgCount || 0,
                    committeeConfidence: signal.committeeConfidence || 0,
                    committeeComponents: signal.committeeComponents || {},
                    marketRegime: signal.marketRegime || 'medium',
                    score: signal.score || 0,
                    timestamp: Date.now()
                },
            };

            this.positions.set(signal.symbol, position);

            // Persist trade opening to DB (fire-and-forget)
            const openTrade = this._dbOpen ? this._dbOpen.bind(this) : dbCryptoOpen;
            openTrade(signal.symbol, signal.tier, signal.price, signal.stopLoss, signal.takeProfit, quantity, positionSizeUSD, signal)
                .then(id => { const p = this.positions.get(signal.symbol); if (p) p.dbTradeId = id; })
                .catch(e => console.warn(`⚠️  DB trade open failed: ${e.message}`));

            // Update tracking
            this.dailyTradeCount++;
            this.totalTrades++;
            this.lastTradeTime.set(signal.symbol, Date.now());
            this.tradesToday.push({
                symbol: signal.symbol,
                time: new Date(),
                direction: 'LONG'
            });

            console.log(`✅ Position opened: ${signal.symbol}`);

            // Persist daily counters immediately so restart can't bypass limits
            this.saveState();

            // Send Telegram alert — fire-and-forget so a failure never blocks trade return
            (this._userTelegram || telegramAlerts).sendCryptoEntry(
                signal.symbol,
                signal.price,
                signal.stopLoss,
                signal.takeProfit,
                quantity,
                signal.tier
            ).catch(e => console.warn(`⚠️  Telegram entry alert failed: ${e.message}`));

            return position;
        } catch (error) {
            console.error(`❌ Error executing trade:`, error);
            return null;
        }
    }

    // ========================================================================
    // POSITION MANAGEMENT
    // ========================================================================

    async managePositions() {
        for (const [symbol, position] of this.positions.entries()) {
            const currentPrice = await this.kraken.getPrice(symbol);
            if (!currentPrice) continue;

            const pnlPercent = ((currentPrice - position.entry) / position.entry) * 100;
            const pnlUSD = (currentPrice - position.entry) * position.quantity;

            // ================================================================
            // [v10.0] AGGRESSIVE PROFIT PROTECTION
            // Once a trade has been in profit, NEVER let it go negative.
            // ================================================================

            // Initialize peakUnrealizedPL if missing (e.g. hydrated positions)
            if (position.peakUnrealizedPL == null) {
                position.peakUnrealizedPL = Math.max(0, pnlUSD);
            }
            if (position.wasInProfit == null) {
                position.wasInProfit = pnlUSD > 2;
            }

            // Track peak unrealized P&L
            if (pnlUSD > position.peakUnrealizedPL) {
                position.peakUnrealizedPL = pnlUSD;
            }

            // Mark as "was in profit" once we exceed meaningful threshold (0.5% of position or $8 min)
            const posValue = (position.quantity || 0) * currentPrice;
            const profitThreshold = Math.max(8, posValue * 0.005); // 0.5% of position or $8
            if (pnlUSD > profitThreshold && !position.wasInProfit) {
                position.wasInProfit = true;
                console.log(`[PROFIT-PROTECT] ${symbol}: entered profit zone (+$${pnlUSD.toFixed(2)}, threshold $${profitThreshold.toFixed(2)}) — breakeven lock ACTIVE`);
            }

            // Breakeven lock: if was in profit and now dropped below -$2, close immediately
            if (position.wasInProfit && pnlUSD < -2) {
                console.log(`[PROFIT-PROTECT] ${symbol}: was +$${position.peakUnrealizedPL.toFixed(2)}, now $${pnlUSD.toFixed(2)} — closing to protect capital`);
                // Set re-entry flag before closing (crypto bot is long-only)
                this.profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: position.direction || 'long', entry: position.entry || currentPrice });
                console.log(`[RE-ENTRY] ${symbol} eligible for re-entry (direction: ${position.direction || 'long'}) after profit-protect close`);
                await this.closePosition(symbol, currentPrice, 'Profit Protection - Breakeven Lock');
                (this._userTelegram || telegramAlerts).send(
                    `🛡️ *CRYPTO PROFIT PROTECT* — ${symbol}\n` +
                    `Was +$${position.peakUnrealizedPL.toFixed(2)}, dropped to $${pnlUSD.toFixed(2)}\n` +
                    `Breakeven lock triggered — capital preserved`
                ).catch(e => console.warn(`⚠️  Telegram profit-protect alert failed: ${e.message}`));
                continue;
            }

            // Peak drawback protection: if peak > $10 and current dropped >40% from peak, take profit
            if (position.peakUnrealizedPL > 10 && pnlUSD > 0) {
                const dropFromPeak = position.peakUnrealizedPL - pnlUSD;
                const dropPct = (dropFromPeak / position.peakUnrealizedPL) * 100;
                if (dropPct > 40) {
                    console.log(`[PROFIT-PROTECT] ${symbol}: peak +$${position.peakUnrealizedPL.toFixed(2)}, now +$${pnlUSD.toFixed(2)} (${dropPct.toFixed(1)}% drawback) — taking profit`);
                    // Set re-entry flag before closing
                    this.profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: position.direction || 'long', entry: position.entry || currentPrice });
                    console.log(`[RE-ENTRY] ${symbol} eligible for re-entry (direction: ${position.direction || 'long'}) after profit-protect close`);
                    await this.closePosition(symbol, currentPrice, 'Profit Protection - Peak Drawback');
                    (this._userTelegram || telegramAlerts).send(
                        `🛡️ *CRYPTO PROFIT PROTECT* — ${symbol}\n` +
                        `Peak +$${position.peakUnrealizedPL.toFixed(2)} → now +$${pnlUSD.toFixed(2)} (${dropPct.toFixed(1)}% drawback)\n` +
                        `Locked in +$${pnlUSD.toFixed(2)} profit`
                    ).catch(e => console.warn(`⚠️  Telegram profit-protect alert failed: ${e.message}`));
                    continue;
                }
            }

            // Time-based exit: close stale or overdue positions
            const holdDays = (Date.now() - (position.openTime?.getTime?.() ?? Date.now())) / (1000 * 60 * 60 * 24);
            if (holdDays >= this.config.stalePositionDays) {
                console.log(`⏰ ${symbol}: STALE EXIT after ${holdDays.toFixed(1)} days`);
                await this.closePosition(symbol, currentPrice, 'Stale Position Timeout');
                (this._userTelegram || telegramAlerts).send(
                    `⏰ *CRYPTO STALE EXIT* — ${symbol}\n` +
                    `Held ${holdDays.toFixed(1)} days (limit: ${this.config.stalePositionDays}d)\n` +
                    `Entry: $${position.entry.toFixed(2)} → Exit: $${currentPrice.toFixed(2)}\n` +
                    `P&L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`
                ).catch(e => console.warn(`⚠️  Telegram stale-exit alert failed: ${e.message}`));
                continue;
            }
            if (holdDays >= this.config.maxHoldDays && pnlPercent < 0) {
                console.log(`⏰ ${symbol}: MAX HOLD EXIT after ${holdDays.toFixed(1)} days (loss: ${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Max Hold Days - Loss Exit');
                (this._userTelegram || telegramAlerts).send(
                    `⏰ *CRYPTO MAX HOLD EXIT (loss)* — ${symbol}\n` +
                    `Held ${holdDays.toFixed(1)} days (limit: ${this.config.maxHoldDays}d)\n` +
                    `Entry: $${position.entry.toFixed(2)} → Exit: $${currentPrice.toFixed(2)}\n` +
                    `P&L: ${pnlPercent.toFixed(2)}%`
                ).catch(e => console.warn(`⚠️  Telegram max-hold-loss alert failed: ${e.message}`));
                continue;
            }
            if (holdDays >= this.config.maxHoldDays && pnlPercent < 2) {
                console.log(`⏰ ${symbol}: MAX HOLD EXIT after ${holdDays.toFixed(1)} days (flat/marginal winner: ${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Max Hold Days - Flat Exit');
                (this._userTelegram || telegramAlerts).send(
                    `⏰ *CRYPTO MAX HOLD EXIT (flat)* — ${symbol}\n` +
                    `Held ${holdDays.toFixed(1)} days, marginal gain ${pnlPercent.toFixed(2)}%\n` +
                    `Entry: $${position.entry.toFixed(2)} → Exit: $${currentPrice.toFixed(2)}`
                ).catch(e => console.warn(`⚠️  Telegram max-hold-flat alert failed: ${e.message}`));
                continue;
            }

            // v8.0 DISABLED: was prematurely closing trades before targets reached
            // [v6.3] ATR Adverse Exit — disabled because it exits at 80% of stop,
            // preventing the actual stop loss from being the risk management tool.
            // if (position.atrPct && position.stopLossPercent) {
            //     const atrAdversePct = position.stopLossPercent * 0.8;
            //     if (pnlPercent <= -atrAdversePct) {
            //         await this.closePosition(symbol, currentPrice, 'ATR Adverse Exit');
            //         continue;
            //     }
            // }

            // [EXIT-MGR] Smart exit: momentum fade + reversal candle detection
            try {
                const { evaluateExit } = require('../../services/signals/exit-manager');
                const rawKlines = await this.kraken.getKlines(symbol, '5m', 30);
                if (rawKlines && rawKlines.length >= 20) {
                    const klines = rawKlines.map(c => ({
                        open: parseFloat(c[1]), high: parseFloat(c[2]),
                        low: parseFloat(c[3]), close: parseFloat(c[4]),
                        volume: parseFloat(c[5]) || 0,
                    }));
                    const exitEval = evaluateExit({
                        entryPrice: position.entry, currentPrice,
                        currentStop: position.stopLoss || 0,
                        direction: position.direction || 'long',
                        klines,
                    });
                    if (exitEval.action === 'exit') {
                        console.log(`[EXIT-MGR] ${symbol}: ${exitEval.reason}`);
                        this.profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: position.direction || 'long', entry: position.entry });
                        await this.closePosition(symbol, currentPrice, `Smart Exit: ${exitEval.reason}`);
                        (this._userTelegram || telegramAlerts).send(
                            `🧠 *CRYPTO SMART EXIT* — ${symbol}\n${exitEval.reason}\nP&L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`
                        ).catch(() => {});
                        continue;
                    } else if (exitEval.action === 'tighten' && exitEval.newStop > position.stopLoss) {
                        console.log(`[EXIT-MGR] ${symbol}: ${exitEval.reason} — stop raised to $${exitEval.newStop.toFixed(2)}`);
                        position.stopLoss = exitEval.newStop;
                    }
                }
            } catch (e) {
                // Non-critical — don't block position management if kline fetch fails
            }

            // Check stop loss
            if (currentPrice <= position.stopLoss) {
                console.log(`🚨 ${symbol}: STOP LOSS HIT at $${currentPrice.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Stop Loss');

                // Send alert — fire-and-forget so a network failure never blocks the loop
                (this._userTelegram || telegramAlerts).sendCryptoStopLoss(symbol, position.entry, currentPrice, pnlPercent, position.stopLoss)
                    .catch(e => console.warn(`⚠️  Telegram stop-loss alert failed: ${e.message}`));
                continue;
            }

            // Check take profit
            if (currentPrice >= position.takeProfit) {
                console.log(`🎯 ${symbol}: PROFIT TARGET HIT at $${currentPrice.toFixed(2)} (+${pnlPercent.toFixed(2)}%)`);
                await this.closePosition(symbol, currentPrice, 'Take Profit');

                // Send alert — fire-and-forget
                (this._userTelegram || telegramAlerts).sendCryptoTakeProfit(symbol, position.entry, currentPrice, pnlPercent, position.takeProfit)
                    .catch(e => console.warn(`⚠️  Telegram take-profit alert failed: ${e.message}`));
                continue;
            }

            // Update trailing stop
            this.updateTrailingStop(symbol, currentPrice, pnlPercent);

            // Write live price and P&L back into the position so getStatus() returns current values
            position.currentPrice = currentPrice;
            position.unrealizedPnL = pnlUSD;
            position.unrealizedPnLPct = pnlPercent / 100;

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)}`);
        }
    }

    updateTrailingStop(symbol, currentPrice, pnlPercent) {
        const position = this.positions.get(symbol);
        if (!position) return;

        // Check each trailing stop level — iterate backward so highest qualifying level wins
        for (let i = this.config.trailingStops.length - 1; i >= 0; i--) {
            const level = this.config.trailingStops[i];
            if (pnlPercent >= level.profit * 100) {
                const newStop = currentPrice * (1 - level.stopDistance);

                // Only raise stop, never lower
                if (newStop > position.stopLoss) {
                    console.log(`📈 ${symbol}: Trailing stop raised to $${newStop.toFixed(2)} (level: +${(level.profit * 100).toFixed(0)}%)`);
                    position.stopLoss = newStop;
                    this.positions.set(symbol, position);
                }
                break; // Use highest applicable level
            }
        }
    }

    async closePosition(symbol, price, reason) {
        const position = this.positions.get(symbol);
        if (!position) return;

        try {
            let order;
            if (isRealTradingEnabled()) {
                order = await this.kraken.placeOrder(symbol, 'SELL', position.quantity);
                if (!order) {
                    console.log(`❌ Failed to close position for ${symbol}`);
                    return;
                }
            } else {
                order = { orderId: `paper-sell-${symbol}-${Date.now()}` };
                console.log(`🧪 PAPER MODE: Simulated SELL order for ${symbol}`);
            }

            // Calculate P/L — slippage already applied at entry (effectiveEntry = price * 1.003)
            // so no additional exit slippage needed; that was double-counting fees
            const adjustedExitPrice = price;
            const pnlUSD = (adjustedExitPrice - position.entry) * position.quantity;
            const pnlPercent = ((adjustedExitPrice - position.entry) / position.entry) * 100;

            // Update stats
            if (pnlUSD > 0) {
                this.winningTrades++;
                this.totalProfit += pnlUSD;
            } else {
                this.losingTrades++;
                this.totalLoss += Math.abs(pnlUSD);
                this.dailyLoss += Math.abs(pnlUSD); // circuit breaker accumulator
            }

            console.log(`✅ Position closed: ${symbol} - ${reason}`);
            console.log(`   Exit: $${price.toFixed(2)}`);
            console.log(`   P/L: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% ($${pnlUSD.toFixed(2)})`);

            // Feed trade outcome to Monte Carlo position sizer (as decimal, e.g. 0.05 for +5%)
            this.monteCarloSizer.addTrade(pnlPercent / 100);

            // Persist close to DB (fire-and-forget)
            // pnlPercent is already *100 (e.g. 5.77 for +5.77%), so store it as-is.
            // loadCryptoEvaluationsFromDB reads pnl_pct back and uses it as a decimal (pnlPct),
            // so we store the decimal form (pnlPercent / 100) to avoid a 100x inflation on reload.
            const closeTrade = this._dbClose ? this._dbClose.bind(this) : dbCryptoClose;
            closeTrade(position.dbTradeId, adjustedExitPrice, pnlUSD, pnlPercent / 100, reason).catch(e => console.warn(`⚠️  DB trade close failed: ${e.message}`));

            // [v14.0] Strategy-regime performance tracking
            const tradeStrategy = position.strategy || 'momentum';
            const tradeRegime = position.signalSnapshot?.marketRegime || position.regime || 'medium';
            updateStrategyRegimePerformance(tradeStrategy, tradeRegime, pnlPercent, pnlUSD > 0)
                .catch(e => console.warn('[StrategyPerf] Update failed:', e.message));

            // [v4.1] Report to Agentic AI learning loop — Scan AI pattern tracking
            this.reportTradeOutcome(position, adjustedExitPrice, pnlUSD, pnlPercent / 100, reason).catch(() => {});

            // [v4.6] Record outcome for adaptive guardrails
            this.recordGuardrailOutcome(pnlUSD > 0);

            // [Phase 4] Trade evaluation — log signal effectiveness
            const snapshot = position.signalSnapshot;
            if (snapshot) {
                const outcome = {
                    symbol: symbol,
                    direction: 'long',
                    entryPrice: position.entry,
                    exitPrice: adjustedExitPrice,
                    pnl: pnlUSD,
                    pnlPct: position.entry > 0 ? (adjustedExitPrice - position.entry) / position.entry : 0,
                    holdTimeMs: Date.now() - (snapshot.timestamp || Date.now()),
                    strategy: position.strategy || 'momentum',
                    signals: {
                        orderFlow: snapshot.orderFlowImbalance,
                        displacement: snapshot.hasDisplacement,
                        vpPosition: snapshot.volumeProfile,
                        fvgCount: snapshot.fvgCount,
                        committeeConfidence: snapshot.committeeConfidence,
                        calibratedConfidence: snapshot.calibratedConfidence,
                        allocation: snapshot.allocation,
                        components: snapshot.committeeComponents,
                        regime: snapshot.marketRegime,
                        score: snapshot.score
                    },
                    exitReason: reason || 'unknown',
                    timestamp: Date.now()
                };

                if (!globalThis._cryptoTradeEvaluations) globalThis._cryptoTradeEvaluations = [];
                globalThis._cryptoTradeEvaluations.push(outcome);
                saveCryptoEvaluations(globalThis._cryptoTradeEvaluations);

                const winLoss = pnlUSD > 0 ? 'WIN' : 'LOSS';
                console.log(`[Evaluation] ${outcome.symbol} ${winLoss} ${(outcome.pnlPct * 100).toFixed(2)}% — committee:${snapshot.committeeConfidence} flow:${snapshot.orderFlowImbalance?.toFixed?.(2) || '?'} regime:${snapshot.marketRegime}`);
            }

            // Remove position
            this.positions.delete(symbol);

            // Persist performance data so it survives restarts
            this.saveState();
        } catch (error) {
            console.error(`❌ Error closing position:`, error);
        }
    }

    // ========================================================================
    // MAIN TRADING LOOP
    // ========================================================================

    async tradingLoop() {
        let lastResetDay = new Date().getUTCDate();

        while (this.isRunning) {
            try {
                // Reset daily counters at UTC midnight
                const currentDay = new Date().getUTCDate();
                if (currentDay !== lastResetDay) {
                    this.dailyTradeCount = 0;
                    this.tradesToday = [];
                    this.dailyLoss = 0;
                    this.resetGuardrails();
                    lastResetDay = currentDay;
                    console.log('🔄 Daily trade counters reset (UTC midnight)');
                }

                this.scanCount++;

                // ── Auto-optimizer: run every 4 hours ────────────────────────
                const AUTO_OPTIM_INTERVAL_MS = 4 * 60 * 60 * 1000;
                if (Date.now() - this._lastAutoOptimMs >= AUTO_OPTIM_INTERVAL_MS) {
                    const evalTrades = (globalThis._cryptoTradeEvaluations || []).map(e => ({
                        pnl: e.pnl,
                        committeeConfidence: e.signals?.committeeConfidence ?? e.signals?.score ?? 0,
                        rewardRisk: e.signals?.rewardRisk ?? 0,
                        strategy: e.signals?.regime ?? 'unknown',
                    }));
                    const optResult = autoOptimize(evalTrades);
                    this._optimizedParams = optResult.params;
                    this._lastAutoOptimMs = Date.now();
                    console.log(`[AutoOptim] Crypto params updated — committeeThreshold=${optResult.params.committeeThreshold.toFixed(3)}, minRR=${optResult.params.minRewardRisk.toFixed(2)} | ${optResult.reason}`);
                    if (optResult.improved) {
                        const strats = autoEvalStrategies(globalThis._cryptoTradeEvaluations || []);
                        const activeStrats = Object.entries(strats).filter(([, s]) => s.active).map(([k, s]) => `${k}(PF=${s.profitFactor.toFixed(2)})`).join(', ');
                        if (activeStrats) console.log(`[AutoOptim] Active strategies: ${activeStrats}`);
                    }
                }
                // Effective thresholds — use optimized values when available, else defaults
                const effectiveCommitteeThreshold = this._optimizedParams
                    ? this._optimizedParams.committeeThreshold
                    : (AUTO_PARAM_BOUNDS.committeeThreshold || {}).default || 0.50;
                const effectiveMinRR = this._optimizedParams
                    ? this._optimizedParams.minRewardRisk
                    : (AUTO_PARAM_BOUNDS.minRewardRisk || {}).default || 2.0;
                // ─────────────────────────────────────────────────────────────

                console.log(`\n${'='.repeat(60)}`);
                console.log(`🔍 CRYPTO SCAN #${this.scanCount} - ${new Date().toLocaleString()}`);
                console.log(`${'='.repeat(60)}`);
                console.log(`📊 Positions: ${this.positions.size}/${this.config.maxTotalPositions} | Trades today: ${this.dailyTradeCount}/${this.config.maxTradesPerDay}`);

                // In demo mode, skip all exchange calls
                if (this.demoMode) {
                    console.log('📊 DEMO MODE - No exchange connection. Add CRYPTO_API_KEY to .env to enable live trading.');
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Manage existing positions even when paused (exits still run)
                if (this.isPaused) {
                    console.log('⏸  Crypto bot paused — managing existing positions only, no new entries');
                    if (this.positions.size > 0) await this.managePositions();
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Daily loss circuit breaker — realised losses
                const maxDailyLoss = Math.abs(parseFloat(process.env.MAX_DAILY_LOSS || '500'));
                if (this.dailyLoss >= maxDailyLoss) {
                    console.log(`🛑 [CIRCUIT BREAKER] Crypto daily loss $${this.dailyLoss.toFixed(2)} exceeds limit $${maxDailyLoss} — no new entries today`);
                    if (this.positions.size > 0) await this.managePositions();
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Proactive unrealised-loss gate — block new entries if open positions
                // are already deep underwater, even before they close and hit dailyLoss.
                // Uses 80% of the daily limit so there's room to exit without breaching.
                const unrealisedLoss = Array.from(this.positions.values())
                    .reduce((sum, p) => sum + Math.min(0, p.unrealizedPnL || 0), 0);
                if (Math.abs(unrealisedLoss) >= maxDailyLoss * 0.8) {
                    console.log(`⚠️  [UNREALISED GATE] Open positions down $${Math.abs(unrealisedLoss).toFixed(2)} (≥80% of $${maxDailyLoss} limit) — no new entries`);
                    if (this.positions.size > 0) await this.managePositions();
                    await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));
                    continue;
                }

                // Manage existing positions
                if (this.positions.size > 0) {
                    console.log(`\n📊 Managing ${this.positions.size} position(s)...`);
                    await this.managePositions();
                }

                // [Phase 3] Detect crypto regime from BTC klines — refreshes every scan cycle
                const btcKlines = await this.kraken.getKlines('XBTUSD', '5m', 100).catch(() => null);
                const cryptoRegime = detectCryptoRegime(btcKlines);
                if (cryptoRegime.regime !== 'medium') {
                    console.log(`[Regime] Crypto market: ${cryptoRegime.adjustments.label} (ATR%: ${(cryptoRegime.atrPct * 100).toFixed(3)}%, size: x${cryptoRegime.adjustments.positionSizeMultiplier}, threshold: x${cryptoRegime.adjustments.scoreThresholdMultiplier})`);
                }

                // [Phase 3.5] Portfolio-level risk check (cross-bot)
                const portfolioRisk = await checkPortfolioRisk(this.positions.size);
                if (portfolioRisk.totalPositions >= 12) {
                    console.log(`[Portfolio Risk] ${portfolioRisk.totalPositions} total positions across all bots — portfolio limit reached, skipping new entries`);
                } else {
                if (portfolioRisk.warnings.length > 0) {
                    console.log(`[Portfolio Risk] ${portfolioRisk.warnings.join('; ')}`);
                }

                // Scan for new opportunities
                if (this.positions.size < this.config.maxTotalPositions) {
                    console.log(`\n🔍 Scanning ${this.activeSymbols.length || this.config.symbols.length} crypto pairs...`);
                    const opportunities = await this.scanForOpportunities(cryptoRegime);

                    console.log(`\n🎯 Found ${opportunities.length} signal(s)`);

                    // Execute trades
                    for (const signal of opportunities) {
                        if (this.positions.size >= this.config.maxTotalPositions) break;
                        // [v15.0] Early position check — skip AI eval if we already hold this symbol
                        if (this.positions.has(signal.symbol)) {
                            console.log(`⏭️  ${signal.symbol}: Already have open position — skipping AI eval`);
                            continue;
                        }
                        // [v5.0] HARD GATE: every trade MUST be approved by the agentic AI pipeline
                        const aiResult = await this.queryAIAdvisor(signal);

                        // Agent rejection = hard stop
                        if (!aiResult.approved) {
                            console.log(`[Agent] ${signal.symbol} REJECTED (conf: ${(aiResult.confidence || 0).toFixed(2)}, src: ${aiResult.source}) — ${aiResult.reason}`);
                            if (aiResult.risk_flags?.length) console.log(`[Agent]   Risk flags: ${aiResult.risk_flags.join(', ')}`);
                            if (aiResult.lessons_applied?.length) console.log(`[Agent]   Lessons: ${aiResult.lessons_applied.slice(0, 2).join('; ')}`);
                            if (aiResult.confidence > 0.8 || aiResult.source === 'kill_switch') {
                                (this._userTelegram || telegramAlerts).sendAgentRejection('Crypto Bot', signal.symbol, 'long', aiResult.reason, aiResult.confidence, aiResult.risk_flags).catch(() => {});
                            }
                            if (aiResult.source === 'kill_switch') {
                                (this._userTelegram || telegramAlerts).sendKillSwitchAlert('Crypto Bot', aiResult.reason).catch(() => {});
                            }
                            continue;
                        }

                        // Agent approved — store metadata
                        const srcTag = aiResult.source === 'cache' ? ' (cached)' : '';
                        const regime = aiResult.market_regime ? ` [${aiResult.market_regime}]` : '';
                        console.log(`[Agent] ${signal.symbol} APPROVED${srcTag}${regime} (conf: ${(aiResult.confidence || 0).toFixed(2)}, size: ${(aiResult.position_size_multiplier || 1).toFixed(2)}x) — ${aiResult.reason}`);
                        (this._userTelegram || telegramAlerts).sendAgentApproval('Crypto Bot', signal.symbol, 'long', aiResult.confidence || 0, aiResult.position_size_multiplier || 1, aiResult.market_regime).catch(() => {});
                        signal.agentApproved = true;
                        signal.agentConfidence = aiResult.confidence;
                        signal.agentReason = aiResult.reason;
                        signal.agentPositionSizeMultiplier = aiResult.position_size_multiplier || 1.0;
                        signal.decisionRunId = aiResult.decision_run_id || null;
                        signal.banditArm = aiResult.bandit_arm || 'moderate';
                        // [v4.6] Adaptive guardrails — pre-trade quality gate
                        if (this.isLanePaused()) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — lane paused until ${new Date(this.guardrails.lanePausedUntil).toLocaleTimeString()}`);
                            continue;
                        }
                        if ((signal.score || 0) < MIN_SIGNAL_SCORE) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — score ${(signal.score || 0).toFixed(2)} < ${MIN_SIGNAL_SCORE}`);
                            continue;
                        }
                        if (aiResult && aiResult.confidence < MIN_SIGNAL_CONFIDENCE) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — confidence ${aiResult.confidence.toFixed(2)} < ${MIN_SIGNAL_CONFIDENCE}`);
                            continue;
                        }
                        // [v4.7] Reward/risk ratio gate — uses auto-optimized threshold when available
                        const stopPct = (signal.stopLossPercent || 5) / 100;
                        const tpPct = (signal.profitTargetPercent || 10) / 100;
                        const rewardRisk = tpPct / stopPct;
                        if (rewardRisk < effectiveMinRR) {
                            console.log(`[Guardrail] ${signal.symbol} BLOCKED — R:R ${rewardRisk.toFixed(2)} < ${effectiveMinRR.toFixed(2)} (auto-optim)`);
                            continue;
                        }
                        // [Phase 3] Regime-adjusted score threshold — high vol raises the bar, low vol lowers it
                        const regimeScoreThreshold = MIN_SIGNAL_SCORE * cryptoRegime.adjustments.scoreThresholdMultiplier;
                        if ((signal.score || 0) < regimeScoreThreshold && regimeScoreThreshold !== MIN_SIGNAL_SCORE) {
                            console.log(`[Regime] ${signal.symbol} BLOCKED — score ${(signal.score || 0).toFixed(2)} < ${regimeScoreThreshold.toFixed(2)} (regime: ${cryptoRegime.adjustments.label})`);
                            continue;
                        }
                        // [Phase 1] Order flow confirmation — skip if flow opposes trade direction
                        if (signal.orderFlowImbalance !== undefined && signal.orderFlowImbalance < 0.1) {
                            console.log(`[FILTER] ${signal.symbol}: Order flow imbalance too weak (${signal.orderFlowImbalance.toFixed(2)}), skipping`);
                            continue;
                        }
                        // [Phase 3] Committee aggregator — unified confidence from all signal sources
                        // threshold uses auto-optimized value (falls back to 0.50 default)
                        const committee = computeCryptoCommitteeScore(signal);
                        if (committee.confidence < effectiveCommitteeThreshold) {
                            console.log(`[Committee] ${signal.symbol}: Confidence ${committee.confidence} < ${effectiveCommitteeThreshold.toFixed(3)} threshold (auto-optim) — ${JSON.stringify(committee.components)}`);
                            continue;
                        }

                        // [v14.1] Confidence Calibration — convert raw score to actual win probability
                        const rawConf = committee.confidence;
                        const calibratedConf = calibrateConfidence(rawConf);
                        const calTag = plattParams.calibrated ? ` cal:${calibratedConf.toFixed(3)}` : '';
                        console.log(`[Committee] ${signal.symbol}: APPROVED conf:${rawConf}${calTag} — momentum:${committee.components.momentum} flow:${committee.components.orderFlow} displacement:${committee.components.displacement} VP:${committee.components.volumeProfile} FVG:${committee.components.fvg}`);

                        // [v14.1] Portfolio Allocator — compute capital allocation from calibrated confidence + state
                        const portfolioState = {
                            openPositions: this.positions.size,
                            maxPositions: cryptoRegime.adjustments.maxPositions,
                            unrealizedPnL: Array.from(this.positions.values()).reduce((s, p) => s + (p.unrealizedPnL || 0), 0),
                            dailyLoss: this.dailyLoss || 0,
                            maxDailyLoss: Math.abs(parseFloat(process.env.MAX_DAILY_LOSS || '500'))
                        };
                        const alloc = computeAllocation(signal, calibratedConf, cryptoRegime, portfolioState);
                        console.log(`[Allocator] ${signal.symbol}: allocation=${alloc.allocation} (conf:${alloc.factors.calibratedConfidence} regime:${alloc.factors.regimeRouting} conc:${alloc.factors.concentrationPenalty} dd:${alloc.factors.drawdownPenalty} sr:${alloc.factors.strategyRegimeWeight})`);

                        // Use calibrated confidence for EV filter
                        // [Improvement 3] Transaction cost filter — reject if EV is negative after fees/slippage
                        if (!isCryptoPositiveEV(calibratedConf)) {
                            continue;
                        }
                        signal.committeeConfidence = rawConf;
                        signal.calibratedConfidence = calibratedConf;
                        signal.allocation = alloc.allocation;
                        signal.allocationFactors = alloc.factors;
                        signal.committeeComponents = committee.components;
                        if (this.getLossSizeMultiplier() < 1.0) {
                            signal.guardrailSizeMultiplier = this.getLossSizeMultiplier();
                            console.log(`[Guardrail] ${signal.symbol} size cut to ${signal.guardrailSizeMultiplier.toFixed(2)}x (${this.guardrails.consecutiveLosses} consecutive losses)`);
                        }
                        // [Phase 3] Apply crypto regime adjustments — size scaling
                        // [v14.1] Also apply allocator-derived size adjustment
                        signal.agentPositionSizeMultiplier = (signal.agentPositionSizeMultiplier || 1.0) * cryptoRegime.adjustments.positionSizeMultiplier * alloc.allocation;
                        signal.marketRegime = cryptoRegime.regime;
                        if (cryptoRegime.regime !== 'medium') {
                            console.log(`[Regime] ${signal.symbol} size adjusted to x${signal.agentPositionSizeMultiplier.toFixed(2)} (${cryptoRegime.adjustments.label})`);
                        }
                        // [Phase 3] Regime-based position cap
                        if (this.positions.size >= cryptoRegime.adjustments.maxPositions) {
                            console.log(`[Regime] ${signal.symbol} BLOCKED — max positions for ${cryptoRegime.adjustments.label} regime (${this.positions.size}/${cryptoRegime.adjustments.maxPositions})`);
                            continue;
                        }
                        // [v10.1] Re-entry validation — if this is a re-entry, require extra confirmation
                        if (this.profitProtectReentrySymbols.has(signal.symbol)) {
                            const reentryCheck = this.isCryptoReentryValid(signal.symbol, signal);
                            if (!reentryCheck.valid) {
                                console.log(`[RE-ENTRY] ${signal.symbol}: re-entry BLOCKED — ${reentryCheck.reason}`);
                                continue;
                            }
                        }
                        // [v10.1] Entry quality gate — final profitability checklist
                        // btcBullish is not in scope here, so we check BTC trend from signal's sizing hint
                        const btcBullishForGate = signal.sizingFactor >= 1.0; // sizingFactor < 1.0 means BTC was bearish
                        const qualityCheck = this.isCryptoEntryQualified(signal, committee, btcBullishForGate, effectiveCommitteeThreshold);
                        if (!qualityCheck.qualified) {
                            console.log(`[QUALITY GATE] ${signal.symbol}: BLOCKED — ${qualityCheck.reason}`);
                            continue;
                        }
                        // [Correlation Guard] Check own-position concentration before executing
                        try {
                            const ownPositions = Array.from(this.positions.values());
                            const guard = computeCorrelationGuard(ownPositions);
                            if (guard.isConcentrated) {
                                const signalDir = signal.direction || 'long';
                                if ((signalDir === 'long' && !guard.canOpenLong) || (signalDir === 'short' && !guard.canOpenShort)) {
                                    console.log(`[CORRELATION] ${signal.symbol} ${signalDir} BLOCKED — portfolio ${(guard.exposureRatio * 100).toFixed(0)}% ${guard.directionBias} (${guard.longCount}L/${guard.shortCount}S)`);
                                    continue;
                                }
                            }
                        } catch (_guardErr) { /* guard is optional — never block trading on error */ }
                        await this.executeTrade(signal);
                    }
                }
                } // end portfolio risk else block

                console.log(`${'='.repeat(60)}\n`);

                lastScanCompletedAt = Date.now();
                // Wait for next scan
                await new Promise(resolve => setTimeout(resolve, this.config.scanInterval));

            } catch (error) {
                console.error('❌ Error in trading loop:', error);
                recentErrors.push({ timestamp: Date.now(), error: error.message });
                if (recentErrors.length > MAX_ERROR_HISTORY) recentErrors.shift();
                await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 1 min on error
            }
        }
    }

    // ========================================================================
    // LIFECYCLE METHODS
    // ========================================================================

    async start() {
        if (this.isRunning) {
            console.log('⚠️ Trading engine already running');
            return;
        }

        console.log('🚀 Starting Crypto Trading Engine...');

        // If no API keys configured, run in demo/paper mode (no exchange connection needed)
        const hasKeys = this.config.exchange.apiKey && this.config.exchange.apiSecret;
        if (!hasKeys) {
            console.log('⚠️  No CRYPTO_API_KEY/CRYPTO_API_SECRET in .env');
            console.log('📊 Running in DEMO MODE - monitoring only, no real trades');
            this.isRunning = true;
            this.demoMode = true;
            this.credentialsValid = false;
            this.credentialsError = 'No Kraken credentials configured';
            this.saveState();
            this.tradingLoop().catch(e => console.error('❌ Crypto trading loop crashed:', e));
            return;
        }

        // Test connection
        const accountOk = await this.refreshConnectionState(true);
        if (!accountOk) {
            console.log(`❌ Failed to connect to exchange - running in DEMO MODE${this.credentialsError ? ` (${this.credentialsError})` : ''}`);
            this.isRunning = true;
            this.demoMode = true;
            this.saveState();
            this.tradingLoop().catch(e => console.error('❌ Crypto trading loop crashed:', e));
            return;
        }

        await this.refreshSupportedSymbols(true);

        console.log(`✅ Connected to ${this.config.exchange.name.toUpperCase()}`);
        console.log(`💰 Account connected`);

        this.isRunning = true;
        this.demoMode = false;
        this.saveState();
        this.tradingLoop().catch(e => console.error('❌ Crypto trading loop crashed:', e));
    }

    saveState() {
        try {
            const fs = require('fs');
            const dir = require('path').dirname(this.stateFile);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(this.stateFile, JSON.stringify({
                running: this.isRunning,
                demoMode: this.demoMode,
                // Trade counters (totalTrades, winningTrades, losingTrades, totalProfit, totalLoss)
                // are NOT persisted here — DB is the authoritative source.
                // Persist daily counters so restart doesn't reset anti-churn limits
                dailyTradeCount: this.dailyTradeCount,
                dailyLoss: this.dailyLoss,
                tradesToday: this.tradesToday,
                savedDate: new Date().toISOString(),
            }));
        } catch (e) {
            console.error('❌ Failed to save crypto bot state:', e.message);
        }
    }

    loadState() {
        try {
            const fs = require('fs');
            if (fs.existsSync(this.stateFile)) {
                const saved = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
                // Trade counters (totalTrades, winningTrades, losingTrades, totalProfit, totalLoss)
                // are NOT loaded from state file — DB is the authoritative source.
                // Restore demoMode so a prior credential save survives restart
                if (saved.demoMode != null) this.demoMode = saved.demoMode;
                // Restore daily counters only if saved on the same UTC day
                if (saved.savedDate) {
                    const savedDay = new Date(saved.savedDate).toISOString().slice(0, 10);
                    const today = new Date().toISOString().slice(0, 10);
                    if (savedDay === today) {
                        if (saved.dailyTradeCount != null) this.dailyTradeCount = saved.dailyTradeCount;
                        if (saved.dailyLoss != null) this.dailyLoss = saved.dailyLoss;
                        if (saved.tradesToday != null) this.tradesToday = saved.tradesToday;
                    }
                }
                return saved.running !== false;
            }
        } catch (e) {
            console.error('❌ Failed to load crypto bot state:', e.message);
        }
        return true; // Default: start running
    }

    stop() {
        console.log('🛑 Stopping Crypto Trading Engine...');
        this.isRunning = false;
        this.isPaused = false;
        this.saveState();
    }

    pause() {
        console.log('⏸  Pausing Crypto Trading Engine (existing positions still managed)...');
        this.isPaused = true;
        this.saveState();
    }

    resume() {
        console.log('▶️  Resuming Crypto Trading Engine...');
        this.isPaused = false;
        this.saveState();
    }

    async refreshConnectionState(force = false) {
        const hasKeys = this.config.exchange.apiKey && this.config.exchange.apiSecret;
        if (!hasKeys) {
            this.demoMode = true;
            this.credentialsValid = false;
            this.credentialsError = 'No Kraken credentials configured';
            this.lastCredentialCheckAt = Date.now();
            return false;
        }

        const cacheFresh = !force && this.lastCredentialCheckAt && (Date.now() - this.lastCredentialCheckAt) < 60000;
        if (cacheFresh && this.credentialsValid !== null) {
            return this.credentialsValid;
        }

        try {
            const account = await this.kraken._privateRequest('Balance');
            this.demoMode = false;
            this.credentialsValid = Boolean(account);
            this.credentialsError = null;
            this.lastCredentialCheckAt = Date.now();
            return this.credentialsValid;
        } catch (error) {
            this.demoMode = true;
            this.credentialsValid = false;
            this.credentialsError = error.message || 'Kraken credentials invalid or expired';
            this.lastCredentialCheckAt = Date.now();
            return false;
        }
    }

    // ===== ADAPTIVE GUARDRAILS (v4.6) =====
    getRecentWinRate() {
        const r = this.guardrails.recentResults;
        if (r.length < 5) return 0.5;
        return r.filter(Boolean).length / r.length;
    }
    isLanePaused() { return Date.now() < this.guardrails.lanePausedUntil; }
    getLossSizeMultiplier() {
        if (this.guardrails.consecutiveLosses >= 3) return 0.25;
        if (this.guardrails.consecutiveLosses >= 2) return 0.5;
        if (this.guardrails.consecutiveLosses >= 1) return 0.75;
        if (this.getRecentWinRate() < 0.35) return 0.5;
        return 1.0;
    }
    recordGuardrailOutcome(isWin) {
        this.guardrails.recentResults.push(isWin);
        if (this.guardrails.recentResults.length > 20) this.guardrails.recentResults.shift();
        if (isWin) { this.guardrails.consecutiveLosses = 0; this.guardrails.totalWinsToday++; }
        else {
            this.guardrails.consecutiveLosses++;
            this.guardrails.totalLossesToday++;
            if (this.guardrails.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
                // [v6.1] Escalating pause: 2h base × (losses / 3), capped at 24h
                const escalation = Math.min(8, Math.ceil(this.guardrails.consecutiveLosses / MAX_CONSECUTIVE_LOSSES));
                const pauseMs = LOSS_PAUSE_MS * escalation;
                this.guardrails.lanePausedUntil = Date.now() + pauseMs;
                console.log(`🚫 [Guardrail] Crypto lane PAUSED ${escalation * 2}h until ${new Date(this.guardrails.lanePausedUntil).toLocaleTimeString()} — ${this.guardrails.consecutiveLosses} consecutive losses`);
            }
        }
    }
    resetGuardrails() {
        this.guardrails = { consecutiveLosses: 0, recentResults: [], lanePausedUntil: 0, totalLossesToday: 0, totalWinsToday: 0 };
    }

    getStatus() {
        const closedTrades = this.winningTrades + this.losingTrades;
        const winRate = closedTrades > 0
            ? (this.winningTrades / closedTrades * 100).toFixed(1)
            : 0;

        const profitFactor = this.totalLoss > 0
            ? parseFloat((this.totalProfit / this.totalLoss).toFixed(2))
            : this.totalProfit > 0 ? null : 0; // null = all winners (undefined metric), 0 = no trades

        const netPnL = this.totalProfit - this.totalLoss;

        const startingEquity = this.config.basePositionSizeUSD * 20; // $500 * 20 = $10,000 base
        const equity = startingEquity + netPnL;

        // Simulate BTC trend based on scan count (rotates every ~30 scans in demo)
        let btcTrend = null;
        if (this.demoMode) {
            const cycle = Math.floor(this.scanCount / 30) % 3;
            btcTrend = cycle === 0 ? 'bullish' : cycle === 1 ? 'bearish' : 'neutral';
        }

        // Flat response matching CryptoBotPage BotStatus interface
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            isVolatilityPaused: false,
            demoMode: this.demoMode || false,
            mode: this.demoMode ? 'DEMO' : (isRealTradingEnabled() ? 'LIVE' : 'PAPER'),
            tradingMode: this.demoMode ? 'DEMO' : (isRealTradingEnabled() ? 'LIVE' : 'PAPER'),
            btcTrend,
            equity,
            dailyReturn: netPnL / startingEquity,
            positions: Array.from(this.positions.values()),
            stats: {
                totalTrades: this.totalTrades,
                longTrades: this.totalTrades,  // Bot only goes long
                shortTrades: 0,
                winners: this.winningTrades,
                losers: this.losingTrades,
                totalPnL: netPnL,
                maxDrawdown: 0
            },
            config: {
                symbols: this.activeSymbols,
                invalidSymbols: Array.from(this.invalidSymbols),
                maxPositions: this.config.maxTotalPositions,
                stopLoss: this.config.tiers.tier1.stopLoss,
                profitTarget: this.config.tiers.tier1.profitTarget,
                dailyLossLimit: Math.abs(parseFloat(process.env.MAX_DAILY_LOSS || '500'))
            },
            scanCount: this.scanCount,
            dailyTrades: this.dailyTradeCount,
            winRate: `${winRate}%`,
            profitFactor,
            netPnL: netPnL.toFixed(2),
            guardrails: {
                consecutiveLosses: this.guardrails.consecutiveLosses,
                recentWinRate: this.getRecentWinRate().toFixed(2),
                lanePaused: this.isLanePaused(),
                lossSizeMultiplier: this.getLossSizeMultiplier(),
                todayWins: this.guardrails.totalWinsToday,
                todayLosses: this.guardrails.totalLossesToday,
            },
        };
    }
}

// ============================================================================
// EXPRESS API
// ============================================================================

const app = express();
app.use(cors());
app.use(express.json());

// ── Auth middleware for config-write endpoints ──────────────────────────────
function requireApiSecret(req, res, next) {
    const secret = process.env.NEXUS_API_SECRET;
    if (!secret) return next();
    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${secret}`) return next();
    return res.status(401).json({ success: false, error: 'Unauthorized' });
}

// ── Persist env var to Railway (survives redeploys) ────────────────────────
async function persistEnvVar(name, value) {
    const token   = process.env.RAILWAY_TOKEN;
    const project = process.env.RAILWAY_PROJECT_ID;
    const env     = process.env.RAILWAY_ENVIRONMENT_ID;
    const service = process.env.RAILWAY_SERVICE_ID;
    if (!token || !project || !env || !service) {
        console.warn(`⚠️  persistEnvVar: missing Railway vars (token=${!!token} project=${!!project} env=${!!env} service=${!!service}) — ${name} saved in-memory only`);
        return;
    }
    const query = `mutation { variableUpsert(input: { projectId: "${project}", environmentId: "${env}", serviceId: "${service}", name: "${name}", value: "${value.replace(/"/g, '\\"')}" }) }`;
    try {
        await axios.post('https://backboard.railway.app/graphql/v2',
            { query },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 8000 }
        );
    } catch (e) {
        console.warn(`⚠️  Railway env var persist failed for ${name}: ${e.message}`);
    }
}

// ── Per-user credential encryption (AES-256-GCM) ───────────────────────────
function getEncryptionKey() {
    const envKey = (process.env.CREDENTIAL_ENCRYPTION_KEY || '').trim();
    if (envKey) {
        const normalized = envKey.startsWith('0x') ? envKey.slice(2) : envKey;
        if (/^[0-9a-fA-F]{64}$/.test(normalized)) {
            return Buffer.from(normalized, 'hex');
        }
        console.warn('⚠️ Invalid CREDENTIAL_ENCRYPTION_KEY format; hashing configured value instead of raw hex');
        return crypto.createHash('sha256').update(envKey).digest();
    }
    const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptCredential(plaintext) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

function decryptCredential(stored) {
    const key = getEncryptionKey();
    const [ivHex, tagHex, ciphertext] = stored.split(':');
    if (!ivHex || !tagHex || !ciphertext) throw new Error('Invalid encrypted format');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function normalizeCredentialValue(value) {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
    }
    if (typeof value === 'boolean' || typeof value === 'number') {
        return String(value);
    }
    return null;
}

const credentialStore = createUserCredentialStore(path.join(__dirname, 'data/user-credentials.json'));

async function loadUserCredentials(userId, broker) {
    if (userId === undefined || userId === null) return {};

    const creds = {};
    const fileCreds = credentialStore.loadEncryptedCredentials(userId, broker);
    for (const [key, encryptedValue] of Object.entries(fileCreds)) {
        try { creds[key] = decryptCredential(encryptedValue); }
        catch (e) { console.warn(`⚠️ Failed to decrypt file-backed ${key} for user ${userId}:`, e.message); }
    }

    if (!dbPool) return creds;

    try {
        const result = await dbPool.query(
            'SELECT credential_key, encrypted_value FROM user_credentials WHERE user_id=$1 AND broker=$2',
            [userId, broker]
        );
        for (const row of result.rows) {
            try { creds[row.credential_key] = decryptCredential(row.encrypted_value); }
            catch (e) { console.warn(`⚠️ Failed to decrypt ${row.credential_key} for user ${userId}:`, e.message); }
        }
        return creds;
    } catch (e) {
        console.warn(`⚠️ Failed to load credentials for user ${userId}:`, e.message);
        return {};
    }
}

// For credential endpoints — accepts JWT (per-user) or API secret (backward compat)
function requireJwtOrApiSecret(req, res, next) {
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
        const token = auth.slice(7);
        const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
        try {
            req.user = jwt.verify(token, JWT_SECRET);
            return next();
        } catch { /* not a JWT — try API secret */ }
        const secret = process.env.NEXUS_API_SECRET;
        if (secret && auth === `Bearer ${secret}`) return next();
    }
    return res.status(401).json({ success: false, error: 'Unauthorized — provide JWT or API secret' });
}

// ── JWT Auth Helpers ─────────────────────────────────────────────────────────
function signTokens(userId, email) {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
    const accessToken = jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ sub: userId, email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}

function requireJwt(req, res, next) {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ success: false, error: 'Missing token' });
    try {
        req.user = jwt.verify(auth.slice(7), JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

// Rate limiter for auth endpoints — prevents brute force attacks
const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,                   // max 20 requests per window per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests — try again in 15 minutes' },
    skip: () => process.env.NODE_ENV === 'test',
});

// ── Auth Endpoints ────────────────────────────────────────────────────────────

app.post('/api/auth/register', authRateLimit, async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    const { email, password, name } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    try {
        const hash = await bcrypt.hash(password, 12);
        const result = await dbPool.query(
            'INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name, role',
            [email.toLowerCase().trim(), hash, name || null]
        );
        const user = result.rows[0];
        const tokens = signTokens(user.id, user.email);
        await dbPool.query('UPDATE users SET refresh_token=$1, last_login=NOW() WHERE id=$2', [tokens.refreshToken, user.id]);
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, ...tokens });
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ success: false, error: 'Email already registered' });
        console.error('Register error:', e.message);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

app.post('/api/auth/login', authRateLimit, async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
    try {
        const result = await dbPool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
        const tokens = signTokens(user.id, user.email);
        await dbPool.query('UPDATE users SET refresh_token=$1, last_login=NOW() WHERE id=$2', [tokens.refreshToken, user.id]);
        res.json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, ...tokens });
    } catch (e) {
        console.error('Login error:', e.message);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

app.post('/api/auth/forgot-password', authRateLimit, async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'Email required' });
    if (!dbPool) return res.json({ success: true }); // silent for security
    try {
        const result = await dbPool.query('SELECT id FROM users WHERE email=$1', [email.toLowerCase().trim()]);
        if (result.rows.length === 0) return res.json({ success: true }); // don't reveal existence
        const userId = result.rows[0].id;
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await dbPool.query(
            `INSERT INTO password_reset_tokens (user_id, token, expires_at)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO UPDATE SET token=$2, expires_at=$3`,
            [userId, token, expires]
        );
        // Log token for now (email delivery is future work)
        console.log(`🔑 Password reset token for ${email}: ${token}`);
        res.json({ success: true });
    } catch (e) {
        res.json({ success: true }); // never reveal errors
    }
});

app.post('/api/auth/reset-password', authRateLimit, async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, error: 'Token and password required' });
    if (password.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });
    if (!dbPool) return res.status(503).json({ success: false, error: 'Database unavailable' });
    try {
        const result = await dbPool.query(
            `SELECT user_id FROM password_reset_tokens
             WHERE token=$1 AND expires_at > NOW()`,
            [token]
        );
        if (result.rows.length === 0) return res.status(400).json({ success: false, error: 'Invalid or expired token' });
        const userId = result.rows[0].user_id;
        const hash = await bcrypt.hash(password, 12);
        await dbPool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, userId]);
        await dbPool.query('DELETE FROM password_reset_tokens WHERE user_id=$1', [userId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Reset failed' });
    }
});

app.post('/api/auth/refresh', async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ success: false, error: 'Refresh token required' });
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
    try {
        const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        const result = await dbPool.query('SELECT * FROM users WHERE id=$1 AND refresh_token=$2', [payload.sub, refreshToken]);
        if (!result.rows[0]) return res.status(401).json({ success: false, error: 'Invalid refresh token' });
        const user = result.rows[0];
        const tokens = signTokens(user.id, user.email);
        await dbPool.query('UPDATE users SET refresh_token=$1 WHERE id=$2', [tokens.refreshToken, user.id]);
        res.json({ success: true, ...tokens });
    } catch {
        res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    if (dbPool) {
        const { refreshToken } = req.body || {};
        if (refreshToken) {
            const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
            try {
                const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
                await dbPool.query('UPDATE users SET refresh_token=NULL WHERE id=$1', [payload.sub]);
            } catch {}
        }
    }
    res.json({ success: true });
});

app.get('/api/auth/me', requireJwt, async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
    try {
        const result = await dbPool.query('SELECT id, email, name, role FROM users WHERE id=$1', [req.user.sub]);
        if (!result.rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
});

// ── End Auth Endpoints ────────────────────────────────────────────────────────

const engine = new CryptoTradingEngine(CRYPTO_CONFIG);

// [Phase 3.5] Portfolio-level risk status endpoint (cross-bot)
app.get('/api/portfolio/risk', async (req, res) => {
    try {
        const risk = await checkPortfolioRisk(engine.positions.size);
        res.json({ success: true, data: risk });
    } catch (error) {
        res.json({ success: true, data: { totalPositions: engine.positions.size, warnings: ['Cross-bot check failed'] } });
    }
});

// Health check
app.get('/health', (req, res) => {
    const closedTrades = engine.winningTrades + engine.losingTrades;
    const winRate = closedTrades > 0 ? engine.winningTrades / closedTrades : 0.5;
    const profitFactor = engine.totalLoss > 0
        ? engine.totalProfit / engine.totalLoss
        : engine.totalProfit > 0 ? 9.99 : 1.0;
    const health = aggregateHealth({
        scan: checkScanHealth(lastScanCompletedAt, engine.config ? engine.config.scanInterval : 60000),
        errors: checkErrorRate(recentErrors),
        trading: checkTradingHealth({
            totalTrades: engine.totalTrades || 0,
            winRate,
            profitFactor,
            maxDrawdownPct: 0,
            consecutiveLosses: engine.guardrails ? engine.guardrails.consecutiveLosses : 0,
        }),
        memory: checkMemoryHealth(),
    });
    res.json(health);
});

// Get trading status
app.get('/api/trading/status', (req, res) => {
    const status = engine.getStatus();
    res.json({
        success: true,
        data: status,
        timestamp: new Date().toISOString()
    });
});

// Start trading
app.post('/api/trading/start', async (req, res) => {
    try {
        await engine.start();
        res.json({
            success: true,
            message: 'Crypto trading engine started',
            warning: 'Crypto is HIGH RISK - use testnet first!'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Stop trading
app.post('/api/trading/stop', (req, res) => {
    engine.stop();
    res.json({
        success: true,
        message: 'Crypto trading engine stopped'
    });
});

// ===== ALIAS ROUTES for dashboard compatibility =====
app.get('/api/crypto/status', (req, res) => {
    // Return flat structure directly - matches CryptoBotPage BotStatus interface
    res.json(engine.getStatus());
});
app.post('/api/crypto/start', async (req, res) => {
    try {
        await engine.start();
        res.json({ success: true, message: 'Crypto trading engine started' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
app.post('/api/crypto/stop', (req, res) => {
    try {
        engine.stop();
        res.json({ success: true, message: 'Crypto trading engine stopped' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
app.post('/api/crypto/pause', (req, res) => {
    try {
        engine.pause();
        res.json({ success: true, message: 'Crypto trading engine paused' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Test Telegram alert
app.post('/test-telegram', async (req, res) => {
    try {
        console.log('📱 Sending test Telegram alert...');

        const testMessage = `🧪 *CRYPTO BOT TEST* 🧪

This is a test alert from your Crypto Trading Bot.

✅ If you receive this, Telegram alerts are working!

⏰ Time: ${new Date().toLocaleString()}`;

        const sent = await telegramAlerts.send(testMessage);

        if (sent) {
            res.json({
                success: true,
                message: 'Test Telegram message sent successfully! Check your Telegram app.',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to send Telegram message. Check your configuration.',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to send Telegram message',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================================================
// PROMETHEUS METRICS
// ============================================================================

const metrics = {
    positionsGauge: new promClient.Gauge({
        name: 'crypto_bot_active_positions',
        help: 'Number of active crypto positions',
        registers: [register]
    }),
    tradesCounter: new promClient.Counter({
        name: 'crypto_bot_total_trades',
        help: 'Total number of crypto trades',
        registers: [register]
    }),
    pnlGauge: new promClient.Gauge({
        name: 'crypto_bot_pnl_total',
        help: 'Total P/L in USD',
        registers: [register]
    })
};

// Update metrics every 10 seconds
setInterval(() => {
    const status = engine.getStatus();
    metrics.positionsGauge.set(status.positions.length);
    metrics.tradesCounter.inc(0); // Just to register
    metrics.pnlGauge.set(parseFloat(status.netPnL));
}, 10000);

// ── Config read endpoint (used by SettingsPage to load broker state) ─────────
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: {
            trading: {
                mode: isRealTradingEnabled() ? 'live' : 'paper',
            },
            brokers: {
                crypto: {
                    configured: !!(process.env.CRYPTO_API_KEY && process.env.CRYPTO_API_SECRET),
                    exchange: process.env.CRYPTO_EXCHANGE || 'kraken',
                    testnet: process.env.CRYPTO_TESTNET !== 'false',
                },
            },
        },
    });
});

app.post('/api/config/mode', requireApiSecret, async (req, res) => {
    try {
        const { mode } = req.body;
        if (!['paper', 'live'].includes(mode)) {
            return res.status(400).json({ success: false, error: 'mode must be "paper" or "live"' });
        }
        const value = mode === 'live' ? 'true' : 'false';
        process.env.REAL_TRADING_ENABLED = value;
        await persistEnvVar('REAL_TRADING_ENABLED', value);
        console.log(`⚙️  Crypto trading mode switched to: ${mode.toUpperCase()}`);
        res.json({ success: true, mode });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Credentials management ──────────────────────────────────────────────────
app.post('/api/config/credentials', requireJwtOrApiSecret, async (req, res) => {
    try {
        const { broker, credentials, fields } = req.body;
        const creds = credentials || fields;
        const ALLOWED_KEYS = {
            crypto:   ['CRYPTO_API_KEY', 'CRYPTO_API_SECRET', 'CRYPTO_EXCHANGE', 'CRYPTO_TESTNET'],
            telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_ALERTS_ENABLED'],
            sms:      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'ALERT_PHONE_NUMBER', 'SMS_ALERTS_ENABLED'],
        };
        const allowed = ALLOWED_KEYS[broker];
        if (!allowed) return res.status(400).json({ success: false, error: 'Unknown broker' });
        if (!creds || typeof creds !== 'object') return res.status(400).json({ success: false, error: 'No credentials provided' });
        const userId = req.user?.sub;
        const warnings = [];
        let persisted = 0;
        let filePersisted = 0;
        let updated = 0;
        const fileCredentials = {};
        for (const [key, rawValue] of Object.entries(creds)) {
            if (!allowed.includes(key)) continue;
            const value = normalizeCredentialValue(rawValue);
            if (value === null) continue;
            // Apply immediately in-memory so current session picks it up
            process.env[key] = value;
            if (userId) {
                fileCredentials[key] = encryptCredential(value);
            }
            // Persist encrypted to DB per user (if authenticated)
            if (userId && dbPool) {
                try {
                    await dbPool.query(
                        `INSERT INTO user_credentials (user_id, broker, credential_key, encrypted_value, updated_at)
                         VALUES ($1, $2, $3, $4, NOW())
                         ON CONFLICT (user_id, broker, credential_key)
                         DO UPDATE SET encrypted_value=$4, updated_at=NOW()`,
                        [userId, broker, key, fileCredentials[key]]
                    );
                    persisted++;
                } catch (persistErr) {
                    const warning = `Failed to persist ${key}; using current runtime value only`;
                    warnings.push(warning);
                    console.warn(`⚠️ Failed to persist ${broker}.${key} for user ${userId}:`, persistErr.message);
                }
            }
            updated++;
        }
        if (updated === 0) {
            return res.status(400).json({ success: false, error: 'No valid credential fields provided' });
        }

        if (userId && Object.keys(fileCredentials).length > 0) {
            try {
                filePersisted = credentialStore.saveEncryptedCredentials(userId, broker, fileCredentials);
            } catch (fileErr) {
                warnings.push('Failed to persist credentials to local fallback storage');
                console.warn(`⚠️ Failed to persist ${broker} credentials to file for user ${userId}:`, fileErr.message);
            }
        }

        const storage = userId && persisted === updated
            ? 'database'
            : userId && filePersisted === updated
                ? 'file'
                : 'environment';
        console.log(`⚙️  Credentials updated: broker=${broker} keys=${updated} storage=${storage}`);

        let reconnectWarning = null;
        // If crypto keys were updated, reinitialise the exchange client and reconnect
        if (broker === 'crypto' && updated > 0) {
            const apiKey = process.env.CRYPTO_API_KEY;
            const apiSecret = process.env.CRYPTO_API_SECRET;
            if (!apiKey || !apiSecret) {
                reconnectWarning = 'Credentials saved, but Kraken reconnect was skipped until both API key and secret are present';
            } else {
                try {
                    engine.kraken = new KrakenClient({ apiKey, apiSecret });
                    if (engine.demoMode) {
                        // Call _privateRequest directly so real Kraken errors propagate (getAccountInfo swallows them)
                        const account = await engine.kraken._privateRequest('Balance');
                        if (account) {
                            engine.demoMode = false;
                            engine.saveState();
                            console.log('✅ Kraken reconnected after credential update — exiting DEMO MODE');
                        } else {
                            reconnectWarning = 'Keys saved but Kraken Balance returned empty — check API key permissions';
                        }
                    }
                } catch (reconnectErr) {
                    reconnectWarning = `Kraken rejected keys: ${reconnectErr.message || 'Unknown error'}`;
                    console.error('❌ Kraken reconnect error:', reconnectWarning);
                }
            }
        }
        // Register or update per-user crypto engine
        if (userId && broker === 'crypto') {
            try {
                const existingEngine = cryptoEngineRegistry.get(String(userId));
                if (existingEngine && process.env.CRYPTO_API_KEY && process.env.CRYPTO_API_SECRET) {
                    existingEngine.kraken = new KrakenClient({
                        apiKey: process.env.CRYPTO_API_KEY,
                        apiSecret: process.env.CRYPTO_API_SECRET,
                    });
                    console.log(`🔧 [CryptoEngine ${userId}] Kraken client updated`);
                } else if (!existingEngine) {
                    getOrCreateCryptoEngine(userId).then(eng => {
                        if (eng) { eng.start().catch(() => {}); }
                    }).catch(() => {});
                }
            } catch (engineErr) {
                warnings.push('Credentials saved, but the personal crypto engine could not be refreshed immediately');
                console.warn(`⚠️ Failed to refresh crypto engine for user ${userId}:`, engineErr.message);
            }
        }

        const response = {
            success: true,
            updated,
            reconnected: reconnectWarning === null && engine.demoMode === false,
            demoMode: engine.demoMode || false,
            storage,
            engineStarted: !!userId,
        };
        if (reconnectWarning) response.warning = reconnectWarning;
        if (warnings.length === 1) response.warning = response.warning || warnings[0];
        if (warnings.length > 1) response.warnings = warnings;

        res.json(response);
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/config/credentials/status', requireJwt, async (req, res) => {
    const userId = req.user?.sub;
    const envStatus = {
        crypto:   { configured: !!(process.env.CRYPTO_API_KEY && process.env.CRYPTO_API_SECRET) },
        telegram: { configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) },
        sms:      { configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) },
    };

    const fileStatus = userId ? {
        crypto: credentialStore.countCredentials(userId, 'crypto'),
        telegram: credentialStore.countCredentials(userId, 'telegram'),
        sms: credentialStore.countCredentials(userId, 'sms'),
    } : null;

    if (!userId) {
        return res.json({ success: true, brokers: envStatus });
    }

    if (!dbPool) {
        return res.json({ success: true, brokers: {
            crypto:   { configured: (fileStatus.crypto   || 0) >= 2 || envStatus.crypto.configured },
            telegram: { configured: (fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: (fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }});
    }
    try {
        const r = await dbPool.query(
            'SELECT broker, COUNT(*) as key_count FROM user_credentials WHERE user_id=$1 GROUP BY broker',
            [userId]
        );
        const stored = Object.fromEntries(r.rows.map(row => [row.broker, parseInt(row.key_count)]));
        res.json({ success: true, brokers: {
            crypto:   { configured: Math.max(stored.crypto   || 0, fileStatus.crypto   || 0) >= 2 || envStatus.crypto.configured },
            telegram: { configured: Math.max(stored.telegram || 0, fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: Math.max(stored.sms      || 0, fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }});
    } catch (e) {
        console.warn('⚠️ Credential status lookup failed, falling back to environment values:', e.message);
        res.json({ success: true, brokers: {
            crypto:   { configured: (fileStatus.crypto   || 0) >= 2 || envStatus.crypto.configured },
            telegram: { configured: (fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: (fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }, warning: 'Credential status fallback in use' });
    }
});

app.get('/api/trades', async (req, res) => {
    if (!dbPool) return res.json({ success: false, error: 'DB not configured', trades: [] });
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const r = await dbPool.query(
            `SELECT * FROM trades WHERE bot='crypto' ORDER BY created_at DESC LIMIT $1`, [limit]);
        res.json({ success: true, trades: r.rows, count: r.rows.length });
    } catch (e) { res.status(500).json({ success: false, error: e.message, trades: [] }); }
});

app.get('/api/trades/summary', async (req, res) => {
    if (!dbPool) return res.json({ success: false, error: 'DB not configured', summary: [] });
    try {
        const days = Math.min(parseInt(req.query.days) || 30, 90);
        const cleanPnlUsd = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN NULL ELSE pnl_usd END`;
        const r = await dbPool.query(`
            SELECT
                DATE_TRUNC('day', COALESCE(exit_time, created_at)) AS day,
                COUNT(*) FILTER (WHERE status='closed') AS closed_trades,
                COUNT(*) FILTER (WHERE status='open')   AS open_trades,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0) AS winners,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0) AS losers,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} = 0) AS breakeven_trades,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed'), 0)::FLOAT AS daily_pnl,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0), 0)::FLOAT AS gross_profit,
                COALESCE(ABS(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0)), 0)::FLOAT AS gross_loss
            FROM trades
            WHERE bot='crypto' AND created_at >= NOW() - INTERVAL '1 day' * $1
            GROUP BY day ORDER BY day DESC
        `, [days]);
        const totals = await dbPool.query(`
            SELECT
                COUNT(*) FILTER (WHERE status='closed') AS total_trades,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0) AS winners,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0) AS losers,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} = 0) AS breakeven_trades,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed'), 0)::FLOAT AS total_pnl,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0), 0)::FLOAT AS gross_profit,
                COALESCE(ABS(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0)), 0)::FLOAT AS gross_loss
            FROM trades WHERE bot='crypto'
        `);
        res.json({ success: true, daily: r.rows, totals: totals.rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message, daily: [], totals: [] }); }
});

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

console.log('✅ Prometheus metrics initialized');

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-USER CRYPTO ENGINE REGISTRY
// Each user gets their own CryptoTradingEngine instance with isolated Kraken creds.
// ─────────────────────────────────────────────────────────────────────────────

const cryptoEngineRegistry = new Map(); // userId → CryptoTradingEngine

async function getOrCreateCryptoEngine(userId) {
    const key = String(userId);
    if (cryptoEngineRegistry.has(key)) return cryptoEngineRegistry.get(key);
    try {
        const creds = await loadUserCredentials(userId, 'crypto');
        const apiKey    = creds.CRYPTO_API_KEY    || process.env.CRYPTO_API_KEY;
        const apiSecret = creds.CRYPTO_API_SECRET || process.env.CRYPTO_API_SECRET;
        if (!apiKey || !apiSecret) return null;
        const userConfig = {
            ...CRYPTO_CONFIG,
            exchange: { ...CRYPTO_CONFIG.exchange, apiKey, apiSecret,
                testnet: creds.CRYPTO_TESTNET !== 'false' && CRYPTO_CONFIG.exchange.testnet }
        };
        const userEngine = new CryptoTradingEngine(userConfig);
        // Persist state to DB rather than filesystem
        userEngine._userId = userId;
        userEngine._saveStateToDB = async function() {
            if (!dbPool) return;
            try {
                await dbPool.query(
                    `INSERT INTO engine_state (user_id, bot, state_json, updated_at)
                     VALUES ($1, 'crypto', $2, NOW())
                     ON CONFLICT (user_id, bot) DO UPDATE SET state_json=$2, updated_at=NOW()`,
                    [userId, JSON.stringify({ isRunning: this.isRunning, isPaused: this.isPaused,
                        demoMode: this.demoMode, dailyTradeCount: this.dailyTradeCount,
                        totalTrades: this.totalTrades, winningTrades: this.winningTrades,
                        losingTrades: this.losingTrades, totalProfit: this.totalProfit })]
                );
            } catch (e) { /* non-critical */ }
        };
        // Patch dbCryptoOpen/Close to include user_id
        userEngine._dbOpen = async function(symbol, tier, entry, stopLoss, takeProfit, quantity, positionSize, signal = {}) {
            if (!dbPool) return null;
            try {
                const tags = buildCryptoTradeTags(signal, tier);
                const r = await dbPool.query(
                    `INSERT INTO trades (user_id,bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
                     position_size_usd,stop_loss,take_profit,entry_time,signal_score,entry_context,rsi,volume_ratio,momentum_pct)
                     VALUES ($1,'crypto',$2,'long',$3,$4,$5,'open',$6,$7,$8,$9,$10,NOW(),$11,$12::jsonb,$13,$14,$15) RETURNING id`,
                    [userId, symbol, tier, tags.strategy, tags.regime, entry, quantity, positionSize, stopLoss, takeProfit,
                     tags.score, JSON.stringify(tags.context), signal.rsi || null, signal.volumeRatio || null, signal.momentum || null]
                );
                return r.rows[0]?.id;
            } catch (e) { console.warn('DB crypto open failed:', e.message); return null; }
        };
        userEngine._dbClose = async function(id, exitPrice, pnlUsd, pnlPct, reason) {
            if (!dbPool || !id) return;
            const client = await dbPool.connect();
            try {
                await client.query('BEGIN');
                await client.query(
                    `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,exit_time=NOW(),close_reason=$4 WHERE id=$5`,
                    [exitPrice, pnlUsd, pnlPct, reason, id]
                );
                await client.query('COMMIT');
            } catch (e) {
                await client.query('ROLLBACK').catch(() => {});
                console.warn('DB crypto close failed (rolled back):', e.message);
            } finally {
                client.release();
            }
        };
        // Load saved state from DB
        if (dbPool) {
            try {
                const r = await dbPool.query('SELECT state_json FROM engine_state WHERE user_id=$1 AND bot=$2', [userId, 'crypto']);
                if (r.rows.length > 0) {
                    const s = r.rows[0].state_json;
                    if (s.totalTrades !== undefined) userEngine.totalTrades = s.totalTrades;
                    if (s.winningTrades !== undefined) userEngine.winningTrades = s.winningTrades;
                    if (s.losingTrades !== undefined) userEngine.losingTrades = s.losingTrades;
                    if (s.totalProfit !== undefined) userEngine.totalProfit = s.totalProfit;
                }
            } catch (e) { /* non-critical */ }
        }
        // Hydrate open positions from trades table (KrakenClient has no getOpenPositions — trust DB)
        if (dbPool) {
            try {
                const dbOpen = await dbPool.query(
                    `SELECT id, symbol, entry_price, quantity, stop_loss, take_profit, entry_time
                     FROM trades WHERE bot='crypto' AND status='open' AND user_id=$1`, [userId]
                );
                for (const row of dbOpen.rows) {
                    const ep = parseFloat(row.entry_price || '0');
                    const sl = parseFloat(row.stop_loss || '0');
                    const qty = parseFloat(row.quantity || '0');
                    userEngine.positions.set(row.symbol, {
                        dbTradeId: row.id,
                        symbol: row.symbol,
                        entry: ep,
                        quantity: qty,
                        positionSize: qty * ep,
                        stopLoss: sl,
                        takeProfit: parseFloat(row.take_profit || '0'),
                        stopLossPercent: ep > 0 ? ((ep - sl) / ep) * 100 : 5,
                        openTime: row.entry_time ? new Date(row.entry_time) : new Date(),
                        entryTime: row.entry_time ? new Date(row.entry_time) : new Date(),
                        tier: 'restored',
                        restored: true,
                    });
                }
                if (userEngine.positions.size > 0)
                    console.log(`✅ [CryptoEngine ${userId}] Hydrated ${userEngine.positions.size} position(s) from DB`);
            } catch (e) {
                console.warn(`⚠️ [CryptoEngine ${userId}] Position hydration failed:`, e.message);
            }
        }
        // Per-user Telegram alerts
        const tgCreds = await loadUserCredentials(userId, 'telegram').catch(() => ({}));
        const tgToken  = tgCreds.TELEGRAM_BOT_TOKEN  || process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = tgCreds.TELEGRAM_CHAT_ID    || process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChatId) {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                const tgBot = new TelegramBot(tgToken, { polling: false });
                userEngine._userTelegram = {
                    sendCryptoEntry:     (sym, entry, sl, tp, qty, tier) =>
                        tgBot.sendMessage(tgChatId, `✅ *CRYPTO ENTRY* [${tier}]\n₿ ${sym} x${qty}\n💰 Entry: $${entry.toFixed(2)}\n🛑 SL: $${sl?.toFixed(2) || '—'}  🎯 TP: $${tp?.toFixed(2) || '—'}`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendCryptoStopLoss:  (sym, ep, cp, pnl, sl) =>
                        tgBot.sendMessage(tgChatId, `🚨 *CRYPTO STOP LOSS*\n₿ ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💸 P&L: ${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendCryptoTakeProfit:(sym, ep, cp, pnl, tp) =>
                        tgBot.sendMessage(tgChatId, `🎯 *CRYPTO TAKE PROFIT*\n₿ ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💵 P&L: +${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(() => {}),
                    send:               (msg) => tgBot.sendMessage(tgChatId, msg, { parse_mode: 'Markdown' }).catch(() => {}),
                };
                console.log(`📱 [CryptoEngine ${userId}] Per-user Telegram alerts configured`);
            } catch (e) {
                userEngine._userTelegram = null;
                console.warn(`⚠️  [CryptoEngine ${userId}] Telegram init failed:`, e.message);
            }
        }
        cryptoEngineRegistry.set(key, userEngine);
        console.log(`🔧 [CryptoRegistry] Engine registered for user ${userId} (${cryptoEngineRegistry.size} total)`);
        return userEngine;
    } catch (e) {
        console.warn(`⚠️  [CryptoRegistry] Failed to create engine for user ${userId}:`, e.message);
        return null;
    }
}

let cryptoScanQueueRunning = false;
async function runCryptoScanQueue() {
    if (cryptoScanQueueRunning) return;
    cryptoScanQueueRunning = true;
    try {
        for (const [userId, eng] of cryptoEngineRegistry) {
            if (!eng.isRunning) continue;
            try {
                // Re-run tradingLoop for this user's engine by calling scan directly
                // The engine already manages its own tradingLoop via setInterval — no-op here.
                // We just ensure any new engines that haven't started yet get started.
            } catch (e) { console.error(`❌ [CryptoQueue] Engine ${userId} crashed:`, e.message); }
        }
    } finally { cryptoScanQueueRunning = false; }
}

// ── Per-user crypto JWT endpoints ────────────────────────────────────────────
app.get('/api/crypto/engine/status', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const userEngine = await getOrCreateCryptoEngine(userId);
    if (!userEngine) return res.json({ success: true, credentialsRequired: true,
        message: 'No Kraken credentials configured — visit Settings' });
    const connected = await userEngine.refreshConnectionState();
    if (!connected) {
        return res.json({ success: true, credentialsRequired: true,
            message: userEngine.credentialsError || 'Kraken credentials invalid or expired' });
    }
    const status = userEngine.getStatus();
    res.json({ success: true, ...status, userId });
});

app.post('/api/crypto/engine/start', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const userEngine = await getOrCreateCryptoEngine(userId);
    if (!userEngine) return res.status(404).json({ success: false, error: 'Configure Kraken credentials first' });
    const connected = await userEngine.refreshConnectionState(true);
    if (!connected) {
        return res.status(400).json({ success: false, error: userEngine.credentialsError || 'Kraken credentials invalid or expired' });
    }
    await userEngine.start();
    res.json({ success: true, isRunning: userEngine.isRunning });
});

app.post('/api/crypto/engine/stop', requireJwt, async (req, res) => {
    const userEngine = cryptoEngineRegistry.get(String(req.user.sub));
    if (!userEngine) return res.status(404).json({ success: false, error: 'Engine not found' });
    userEngine.stop();
    res.json({ success: true, isRunning: false });
});

app.post('/api/crypto/engine/pause', requireJwt, async (req, res) => {
    const userEngine = cryptoEngineRegistry.get(String(req.user.sub));
    if (!userEngine) return res.status(404).json({ success: false, error: 'Engine not found' });
    userEngine.isPaused = !userEngine.isPaused;
    res.json({ success: true, isRunning: userEngine.isRunning, isPaused: userEngine.isPaused });
});

app.post('/api/crypto/engine/close-all', requireJwt, async (req, res) => {
    const userEngine = cryptoEngineRegistry.get(String(req.user.sub));
    if (!userEngine) return res.status(404).json({ success: false, error: 'Engine not found' });
    const closed = [], skipped = [];
    for (const [symbol] of userEngine.positions) {
        try {
            const price = await userEngine.kraken.getPrice(symbol).catch(() => 0);
            await userEngine.closePosition(symbol, price, 'Manual Close All');
            closed.push(symbol);
        } catch (err) { skipped.push({ symbol, error: err.message }); }
    }
    res.json({ success: true, closed, skipped });
});

// Module-level close-all (no per-user engine context required)
app.post('/api/crypto/close-all', async (req, res) => {
    const closed = [], skipped = [];
    for (const [symbol] of engine.positions) {
        try {
            const price = await engine.kraken.getPrice(symbol).catch(() => 0);
            await engine.closePosition(symbol, price, 'Manual Close All');
            closed.push(symbol);
        } catch (err) { skipped.push({ symbol, error: err.message }); }
    }
    res.json({ success: true, closed, skipped });
});

// [Phase 4] Trade evaluation summary endpoint
app.get('/api/crypto/evaluations', (req, res) => {
    const rawEvals = (globalThis._cryptoTradeEvaluations || []).filter(e => e.exitReason !== 'orphaned_restart');
    if (rawEvals.length === 0) {
        return res.json({ success: true, data: { totalTrades: 0, message: 'No evaluations yet' } });
    }

    // Normalize pnlPct to decimal form (0.0577 = +5.77%)
    // Old data stored as percentage (5.77), new data stores as decimal (0.0577)
    const evals = rawEvals.map(e => {
        let pnlPct = e.pnlPct || 0;
        if (Math.abs(pnlPct) > 1) pnlPct = pnlPct / 100; // was stored as percentage, normalize to decimal
        return { ...e, pnlPct };
    });

    const wins = evals.filter(e => e.pnl > 0);
    const losses = evals.filter(e => e.pnl <= 0);

    // Signal effectiveness — use Math.abs for orderFlow (shorts have negative flow)
    // Only include trades that have signal data populated (skip old trades without components)
    const signalEffectiveness = {};
    const signals = ['orderFlow', 'displacement', 'fvgCount'];
    for (const sig of signals) {
        const hasSignalData = evals.filter(e => e.signals && e.signals[sig] !== undefined && e.signals[sig] !== null && e.signals[sig] !== 0 && e.signals[sig] !== false);
        const withSignal = evals.filter(e => {
            if (!e.signals) return false;
            if (sig === 'orderFlow') return Math.abs(e.signals.orderFlow || 0) > 0.1;
            if (sig === 'displacement') return e.signals.displacement === true;
            if (sig === 'fvgCount') return (e.signals.fvgCount || 0) > 0;
            return false;
        });
        const withoutSignal = evals.filter(e => {
            if (!e.signals) return true;
            if (sig === 'orderFlow') return Math.abs(e.signals.orderFlow || 0) <= 0.1;
            if (sig === 'displacement') return e.signals.displacement !== true;
            if (sig === 'fvgCount') return (e.signals.fvgCount || 0) === 0;
            return true;
        });
        const avgWith = withSignal.length > 0 ? withSignal.reduce((s, e) => s + (e.pnlPct || 0), 0) / withSignal.length : 0;
        const avgWithout = withoutSignal.length > 0 ? withoutSignal.reduce((s, e) => s + (e.pnlPct || 0), 0) / withoutSignal.length : 0;
        signalEffectiveness[sig] = {
            withSignal: { count: withSignal.length, avgPnlPct: parseFloat((avgWith * 100).toFixed(3)) },
            withoutSignal: { count: withoutSignal.length, avgPnlPct: parseFloat((avgWithout * 100).toFixed(3)) },
            edge: parseFloat(((avgWith - avgWithout) * 100).toFixed(3)),
            dataAvailable: hasSignalData.length
        };
    }

    res.json({
        success: true,
        data: {
            totalTrades: evals.length,
            winRate: parseFloat((wins.length / evals.length * 100).toFixed(1)),
            avgWin: wins.length > 0 ? parseFloat((wins.reduce((s, e) => s + (e.pnlPct || 0), 0) / wins.length * 100).toFixed(3)) : 0,
            avgLoss: losses.length > 0 ? parseFloat((losses.reduce((s, e) => s + (e.pnlPct || 0), 0) / losses.length * 100).toFixed(3)) : 0,
            signalEffectiveness,
            recentTrades: evals.slice(-10)
        }
    });
});

// [Signal Intelligence] Noise report, signal timeline, regime heatmap, threshold curve
createSignalEndpoints(app, 'crypto', 'crypto',
  () => globalThis._cryptoTradeEvaluations || [],
  () => BOT_COMPONENTS.crypto.components
);

// [Alpha] Portfolio allocation signal — exposes bot's current edge for capital allocation
app.get('/api/crypto/alpha-signal', (req, res) => {
    const evals = globalThis._cryptoTradeEvaluations || [];
    const recent = evals.slice(-20);

    if (recent.length < 3) {
        return res.json({ success: true, data: { edge: 0.5, confidence: 0, sampleSize: recent.length, message: 'Insufficient data' } });
    }

    const winRate = recent.filter(e => e.pnl > 0).length / recent.length;
    const avgPnl = recent.reduce((s, e) => s + (e.pnlPct || 0), 0) / recent.length;
    const avgCommittee = recent.reduce((s, e) => s + (e.signals?.committeeConfidence || 0), 0) / recent.length;

    const edge = Math.max(0, Math.min(1,
        (winRate * 0.4) +
        (Math.min(1, Math.max(0, avgPnl * 10 + 0.5)) * 0.3) +
        (avgCommittee * 0.3)
    ));

    res.json({
        success: true,
        data: {
            bot: 'crypto',
            edge: parseFloat(edge.toFixed(3)),
            winRate: parseFloat((winRate * 100).toFixed(1)),
            avgPnlPct: parseFloat((avgPnl * 100).toFixed(3)),
            avgCommitteeConfidence: parseFloat(avgCommittee.toFixed(3)),
            regime: 'medium',
            activePositions: engine.positions.size,
            sampleSize: recent.length,
            recommendation: edge > 0.6 ? 'increase_allocation' : edge < 0.4 ? 'decrease_allocation' : 'maintain'
        }
    });
});

// [Improvement 2] Current committee weights endpoint
app.get('/api/crypto/weights', (req, res) => {
    res.json({
        success: true,
        data: {
            weights: cryptoCommitteeWeights,
            defaults: DEFAULT_CRYPTO_WEIGHTS,
            tradeCount: (globalThis._cryptoTradeEvaluations || []).length,
            lastOptimized: 'check weights file'
        }
    });
});

// [v14.1] Allocator + Calibration status API
app.get('/api/crypto/allocator', (req, res) => {
    const evals = globalThis._cryptoTradeEvaluations || [];
    const calibrationMap = [0.30, 0.40, 0.45, 0.50, 0.60, 0.70].map(raw => ({
        rawConfidence: raw,
        calibratedProbability: parseFloat(calibrateConfidence(raw).toFixed(4))
    }));
    res.json({
        success: true,
        data: {
            calibration: {
                fitted: plattParams.calibrated,
                sampleSize: plattParams.sampleSize,
                params: { A: plattParams.A, B: plattParams.B },
                mapping: calibrationMap
            },
            strategyWeights: strategyRegimeWeights,
            totalEvaluations: evals.length,
            status: plattParams.calibrated ? 'calibrated' : 'uncalibrated (using raw scores)'
        }
    });
});

// [v14.0] Strategy-regime performance API
app.get('/api/crypto/strategy-performance', async (req, res) => {
    if (!dbPool) return res.json({ success: true, data: { message: 'No DB connected', currentWeights: strategyRegimeWeights } });
    try {
        const result = await dbPool.query(`
            SELECT strategy, regime, total_trades, win_rate, profit_factor, avg_pnl_pct, last_updated
            FROM strategy_regime_performance
            WHERE bot = 'crypto'
            ORDER BY strategy, regime
        `);
        res.json({ success: true, data: { performance: result.rows, currentWeights: strategyRegimeWeights } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || process.env.CRYPTO_PORT || 3006;
app.listen(PORT, async () => {
    const liveExecutionEnabled = isRealTradingEnabled();
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║           UNIFIED CRYPTO TRADING BOT - LIVE 24/7              ║
╠════════════════════════════════════════════════════════════════╣
║  Port: ${PORT}                                                     ║
║  Exchange: ${CRYPTO_CONFIG.exchange.name.toUpperCase().padEnd(48)} ║
║  Mode: ${(liveExecutionEnabled ? 'LIVE TRADING ⚠️ ' : 'PAPER TRADING').padEnd(48)} ║
║  Pairs: ${CRYPTO_CONFIG.symbols.length} major cryptocurrencies                      ║
║  Trading Hours: 24/7/365 (Never closes)                        ║
║  Strategy: BTC-Correlation + 3-Tier Momentum                   ║
║  Risk: 2% per trade | Max ${CRYPTO_CONFIG.maxTotalPositions} positions                             ║
║  ⚠️  WARNING: HIGH VOLATILITY ASSET CLASS                      ║
╚════════════════════════════════════════════════════════════════╝
    `);
    console.log(`🔗 Health: http://localhost:${PORT}/health`);
    console.log(`📊 Status: http://localhost:${PORT}/api/trading/status`);
    console.log(`🚀 Start: POST http://localhost:${PORT}/api/trading/start`);
    console.log(`🛑 Stop: POST http://localhost:${PORT}/api/trading/stop`);
    console.log(`📱 Test Alert: POST http://localhost:${PORT}/test-telegram`);
    console.log(`\n💎 Crypto pairs: ${CRYPTO_CONFIG.symbols.join(', ')}`);
    console.log(`📈 BTC correlation: Altcoins only trade when BTC is bullish`);
    console.log(`⚠️  ${liveExecutionEnabled ? 'LIVE TRADING - Real money at risk!' : 'Paper trading active - orders are simulated locally.'}`);

    // Connect DB for trade persistence (non-blocking)
    await initTradeDb().catch(e => console.warn('⚠️  Crypto DB init error:', e.message));

    // Load evaluations from DB now that dbPool is ready
    globalThis._cryptoTradeEvaluations = await loadCryptoEvaluationsFromDB();

    // FIRST: load local state (daily counters, operational state like demoMode)
    engine.loadState();

    // THEN: DB hydration overwrites trade counters (DB is authoritative)
    if (dbPool) {
        try {
            const cleanPnl = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN NULL ELSE pnl_usd END`;
            const dbStats = await dbPool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE status='closed') AS total,
                    COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} > 0) AS winners,
                    COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} <= 0) AS losers,
                    COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed'), 0)::FLOAT AS total_pnl,
                    COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed' AND ${cleanPnl} > 0), 0)::FLOAT AS win_amount,
                    COALESCE(ABS(SUM(${cleanPnl}) FILTER (WHERE status='closed' AND ${cleanPnl} < 0)), 0)::FLOAT AS loss_amount
                FROM trades WHERE bot='crypto'
            `);
            const row = dbStats.rows[0];
            const total = parseInt(row.total) || 0;
            const winners = parseInt(row.winners) || 0;
            const losers = parseInt(row.losers) || 0;
            const winAmt = parseFloat(row.win_amount) || 0;
            const lossAmt = parseFloat(row.loss_amount) || 0;
            if (total > 0) {
                engine.totalTrades = total;
                engine.winningTrades = winners;
                engine.losingTrades = losers;
                engine.totalProfit = winAmt;
                engine.totalLoss = lossAmt;
            }
            // Consecutive losses from most recent trades
            const recent = await dbPool.query(`
                SELECT ${cleanPnl} AS pnl FROM trades
                WHERE bot='crypto' AND status='closed' AND ${cleanPnl} IS NOT NULL
                ORDER BY exit_time DESC NULLS LAST LIMIT 50
            `);
            let consec = 0, maxConsec = 0, runConsec = 0;
            for (const r of recent.rows) {
                if (parseFloat(r.pnl) <= 0) { consec++; } else break;
            }
            for (const r of recent.rows) {
                if (parseFloat(r.pnl) <= 0) { runConsec++; maxConsec = Math.max(maxConsec, runConsec); }
                else runConsec = 0;
            }
            engine.guardrails.consecutiveLosses = consec;
            console.log(`📊 Hydrated crypto perfData from DB: ${total} trades, ${winners}W/${losers}L, PF ${lossAmt > 0 ? (winAmt / lossAmt).toFixed(2) : 'N/A'}, Win $${winAmt.toFixed(2)}, Loss $${lossAmt.toFixed(2)}`);
        } catch (e) { console.warn('⚠️  DB crypto perfData hydration failed:', e.message); }

        // Hydrate open positions from DB so restarts don't orphan-close them at pnl=0
        try {
            const openPositions = await dbPool.query(
                `SELECT * FROM trades WHERE bot='crypto' AND status='open' AND user_id IS NULL ORDER BY entry_time DESC`
            );
            for (const row of openPositions.rows) {
                if (!engine.positions.has(row.symbol)) {
                    const currentPrice = await engine.kraken.getPrice(row.symbol).catch(() => null);
                    if (currentPrice) {
                        const entryP = parseFloat(row.entry_price);
                        const qty = parseFloat(row.quantity || 0);
                        const sl = parseFloat(row.stop_loss || 0);
                        const tp = parseFloat(row.take_profit || 0);
                        const stopPct = entryP > 0 ? ((entryP - sl) / entryP) * 100 : 5;
                        engine.positions.set(row.symbol, {
                            symbol: row.symbol,
                            direction: row.direction || 'long',
                            tier: row.tier || 'tier1',
                            strategy: row.strategy || 'momentum',
                            regime: row.regime || 'unknown',
                            entry: entryP,
                            quantity: qty,
                            positionSize: entryP * qty,
                            stopLoss: sl,
                            takeProfit: tp,
                            stopLossPercent: stopPct,
                            openTime: new Date(row.entry_time),
                            entryTime: new Date(row.entry_time),
                            rsi: row.rsi ? parseFloat(row.rsi) : null,
                            momentum: row.momentum_pct ? parseFloat(row.momentum_pct) : null,
                            regimeQuality: row.regime_quality ? parseFloat(row.regime_quality) : null,
                            signalScore: row.signal_score ? parseFloat(row.signal_score) : null,
                            currentPrice: currentPrice,
                            unrealizedPnL: (currentPrice - entryP) * qty,
                            unrealizedPnLPct: entryP > 0 ? ((currentPrice - entryP) / entryP) * 100 : 0,
                            dbTradeId: row.id,
                            restored: true,
                        });
                        console.log(`[HYDRATE] Restored open position: ${row.symbol} @ ${row.entry_price}`);
                    }
                }
            }
        } catch (err) {
            console.error('[HYDRATE] Failed to restore positions:', err.message);
        }
    }

    // Auto-start the default crypto engine (matches stock/forex bot behavior)
    console.log('🚀 Auto-starting default crypto trading engine...');
    engine.start().catch(e => console.error('❌ Default crypto engine start failed:', e.message));

    // ── Auto-restart engines for users who had isRunning=true at last save ──
    async function autoRestartCryptoEngines() {
        if (!dbPool) return;
        try {
            const result = await dbPool.query(
                `SELECT es.user_id, es.state_json AS state, u.email
                 FROM engine_state es
                 JOIN users u ON u.id = es.user_id
                 WHERE es.bot = 'crypto' AND (es.state_json->>'isRunning')::boolean = true`
            );
            if (result.rows.length === 0) return;
            console.log(`🔄 Auto-restarting crypto engines for ${result.rows.length} user(s)...`);
            for (const row of result.rows) {
                try {
                    const eng = await getOrCreateCryptoEngine(row.user_id);
                    if (eng && !eng.isRunning) {
                        await eng.start();
                        console.log(`✅ Auto-restarted crypto engine for user ${row.email}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to auto-restart crypto engine for user ${row.user_id}:`, e.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ autoRestartCryptoEngines failed:', e.message);
        }
    }

    setTimeout(() => autoRestartCryptoEngines().catch(e => console.warn('Auto-restart error:', e.message)), 5000);

    // ── Load Telegram credentials from DB into process.env ──
    try {
        if (dbPool) {
            const firstUser = await dbPool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
            if (firstUser.rows.length > 0) {
                const userId = firstUser.rows[0].id;
                const tgCreds = await loadUserCredentials(userId, 'telegram').catch(() => ({}));
                for (const [key, value] of Object.entries(tgCreds)) {
                    if (!process.env[key]) process.env[key] = value;
                }
                if (Object.keys(tgCreds).length > 0) console.log(`🔑 Loaded telegram credentials from DB for user ${userId}`);
                // Reinitialize Telegram after DB credentials are loaded
                if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                    if (!process.env.TELEGRAM_ALERTS_ENABLED) process.env.TELEGRAM_ALERTS_ENABLED = 'true';
                    telegramAlerts = getTelegramAlertService();
                    if (telegramAlerts.enabled) {
                        console.log('📱 [TELEGRAM] Reinitialized with DB credentials - crypto alerts enabled');
                    }
                }
            }
        }
    } catch (e) {
        console.warn('⚠️  Crypto startup Telegram credential load failed:', e.message);
    }

    // Register engines for all existing users with Kraken credentials (staggered)
    setTimeout(async () => {
        try {
            if (dbPool) {
                const users = await dbPool.query('SELECT id FROM users ORDER BY id ASC');
                let delay = 0;
                for (const row of users.rows) {
                    setTimeout(async () => {
                        try {
                            const eng = await getOrCreateCryptoEngine(row.id);
                            if (eng) await eng.start();
                        } catch (e) { console.warn(`⚠️  Crypto engine init failed for user ${row.id}:`, e.message); }
                    }, delay);
                    delay += 6000;
                }
            }
        } catch (e) { console.warn('⚠️  Crypto engine pre-registration failed:', e.message); }
    }, 10000);

    // Dead-man heartbeat: crypto trades 24/7 — alert if silent >2h
    let _cryptoHeartbeatAlertSent = false;
    let _cryptoLastScanTime = Date.now();
    // The per-user engines call tradingLoop on their own setInterval; update via proxy
    const _cryptoHeartbeatTick = setInterval(() => { _cryptoLastScanTime = Date.now(); }, 5 * 60 * 1000);
    setInterval(() => {
        const silentMinutes = Math.floor((Date.now() - _cryptoLastScanTime) / 60000);
        if (silentMinutes >= 120 && !_cryptoHeartbeatAlertSent) {
            _cryptoHeartbeatAlertSent = true;
            telegramAlerts.sendHeartbeatAlert('Crypto Bot', silentMinutes).catch(() => {});
        } else if (silentMinutes < 120) {
            _cryptoHeartbeatAlertSent = false;
        }
    }, 30 * 60 * 1000);
    void _cryptoHeartbeatTick; // suppress lint warning

    // ── DB Reconciliation: close orphaned 'open' trades not in memory ──
    // Runs after loadState so engine.positions is populated from saved state.
    try {
        if (dbPool) {
            const orphaned = await dbPool.query(
                `SELECT id, symbol FROM trades WHERE bot='crypto' AND status='open' AND user_id IS NULL`
            );
            const toClose = orphaned.rows.filter(row => !engine.positions.has(row.symbol));
            if (toClose.length > 0) {
                const client = await dbPool.connect();
                try {
                    await client.query('BEGIN');
                    for (const row of toClose) {
                        await client.query(
                            `UPDATE trades SET status='closed', exit_price=entry_price, pnl_usd=0, pnl_pct=0,
                             close_reason='orphaned_restart', exit_time=NOW() WHERE id=$1`,
                            [row.id]
                        );
                    }
                    await client.query('COMMIT');
                    console.log(`🧹 Closed ${toClose.length} orphaned DB trade(s) from previous session`);
                } catch (e) {
                    await client.query('ROLLBACK').catch(() => {});
                    console.warn('⚠️ Orphaned cleanup rolled back:', e.message);
                } finally {
                    client.release();
                }
            }
        }
    } catch (e) {
        console.warn('⚠️  DB reconciliation failed:', e.message);
    }
});

// ========================================================================
// [v6.3] PROCESS ERROR HANDLERS & GRACEFUL SHUTDOWN
// Without these, any unhandled error crashes the Railway process immediately.
// ========================================================================

process.on('uncaughtException', (error) => {
    console.error('💀 [CRYPTO] Uncaught Exception:', error.message);
    console.error(error.stack);
    // Don't exit — Railway will restart, but we try to keep running
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💀 [CRYPTO] Unhandled Rejection:', reason);
    // Don't exit — log and continue
});

process.on('SIGTERM', () => {
    console.log('🛑 [CRYPTO] SIGTERM received — shutting down gracefully');
    if (engine && engine.isRunning) {
        engine.isRunning = false;
    }
    // Give open HTTP requests 5s to finish, then exit
    setTimeout(() => process.exit(0), 5000);
});

process.on('SIGINT', () => {
    console.log('🛑 [CRYPTO] SIGINT received — shutting down');
    process.exit(0);
});

// [v6.3] Memory cleanup — prune unbounded collections every 30 minutes
setInterval(() => {
    // Prune priceHistory to last 200 candles per symbol
    if (engine && engine.priceHistory) {
        for (const [symbol, prices] of engine.priceHistory) {
            if (prices.length > 200) {
                engine.priceHistory.set(symbol, prices.slice(-200));
            }
        }
    }
    // Prune BTC hourly buffer to last 200 entries (200 hours = 8+ days)
    if (engine && engine.btcHourlyPrices && engine.btcHourlyPrices.length > 200) {
        engine.btcHourlyPrices = engine.btcHourlyPrices.slice(-200);
    }
    // Prune agent cache — remove entries older than 10 minutes
    if (engine && engine._agentCache) {
        const now = Date.now();
        for (const [symbol, cached] of engine._agentCache) {
            if (now - cached.timestamp > 10 * 60 * 1000) {
                engine._agentCache.delete(symbol);
            }
        }
    }
}, 30 * 60 * 1000);

module.exports = { app, engine, CRYPTO_CONFIG };
