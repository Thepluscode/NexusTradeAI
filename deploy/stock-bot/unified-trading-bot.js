const express = require('express');
const cors = require('cors');
const axios = require('axios');
axios.defaults.timeout = 15000; // 15 second default timeout
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const { requireApiSecret, requireJwt, requireJwtOrApiSecret, getEncryptionKey, encryptCredential, decryptCredential, signTokens, registerAuthRoutes } = require('./shared/auth');
const { createUserCredentialStore } = require('./userCredentialStore');
// Signal modules — try local signal-analytics (ships with deploy), fall back to no-op
let createSignalEndpoints;
try { createSignalEndpoints = require('./signal-analytics').createSignalEndpoints; } catch (_) { createSignalEndpoints = () => {}; }
let BOT_COMPONENTS = { stock: { components: ['momentum','orderFlow','displacement','volumeProfile','fvg','volumeRatio','mtfConfluence'] } };
let computeCorrelationGuard = () => ({ blocked: false });
let optimize = () => ({ improved: false });
let evaluateStrategies = () => ({});
let lastStrategyPerf = {}; // [v14.1] Stores latest evaluateStrategies() output for INACTIVE enforcement
let checkScanHealth = (lastScanAt, intervalMs) => {
    const elapsed = Date.now() - (lastScanAt || 0);
    return { healthy: elapsed < intervalMs * 3, lastScanMs: elapsed, threshold: intervalMs * 3 };
};
let checkErrorRate = (errors) => {
    const recent = (errors || []).filter(e => Date.now() - e.timestamp < 300000);
    return { healthy: recent.length < 10, recentErrors: recent.length, window: '5m' };
};
let checkTradingHealth = (opts) => {
    return { healthy: true, positions: opts?.positionCount || 0, tradesToday: opts?.tradesToday || 0 };
};
let checkMemoryHealth = () => {
    const mem = process.memoryUsage();
    const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
    return { healthy: heapMB < 512, heapUsedMB: heapMB, rss: Math.round(mem.rss / 1024 / 1024) };
};
let aggregateHealth = (checks) => {
    const allHealthy = Object.values(checks).every(c => c.healthy !== false);
    return { status: allHealthy ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() };
};
try {
  ({ createSignalEndpoints } = require('../../services/signals/api-handlers'));
  ({ BOT_COMPONENTS } = require('../../services/signals/committee-scorer'));
  ({ computeCorrelationGuard } = require('../../services/signals/exit-manager'));
  ({ checkScanHealth, checkErrorRate, checkTradingHealth, checkMemoryHealth, aggregateHealth } = require('../../services/signals/health-monitor'));
  ({ optimize, evaluateStrategies } = require('../../services/signals/auto-optimizer'));
} catch (e) {
  console.log('[INIT] Signal modules not available — trying local fallbacks');
  // [v17.1] On Railway, auto-optimizer ships alongside bot.js
  try { ({ optimize, evaluateStrategies } = require('./auto-optimizer')); console.log('[INIT] auto-optimizer loaded from local'); } catch (_) {}
}
// Shared signal functions (compat wrappers preserve old interface)
let sharedSignals;
try {
    sharedSignals = require('./signals/compat');
    console.log('[INIT] sharedSignals loaded from ./signals/compat');
} catch (e) {
    try { sharedSignals = require('../../services/signals/compat');
        console.log('[INIT] sharedSignals loaded from ../../services/signals/compat');
    } catch (_) {
        console.log('[INIT] sharedSignals NOT available — order flow/displacement/volume-profile gates disabled');
        sharedSignals = null;
    }
}
// Shared indicator calculations — delegate to centralized module, inline fallback for Railway
let sharedIndicators;
try {
    sharedIndicators = require('./signals/indicators');
} catch (e) {
    try { sharedIndicators = require('../../services/signals/indicators'); } catch (_) {
        sharedIndicators = null;
    }
}
// Load .env from project root (Railway injects env vars directly, so dotenv is a no-op there)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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
const monteCarloSizer = new MonteCarloSizer();

// ===== PRODUCTION INFRASTRUCTURE =====
const memoryManager = require('./infrastructure/memory/MemoryManager');
const { metrics, createMetricsServer } = require('./infrastructure/monitoring/metrics');
const { getSMSAlertService } = require('./infrastructure/notifications/sms-alerts');
const { getTelegramAlertService } = require('./infrastructure/notifications/telegram-alerts');

/**
 * IMPROVED UNIFIED TRADING BOT - v3.2 (Quant Council Improvements)
 *
 * FIXES IN v3.1:
 * 1. Fixed RSI calculation - now uses Wilder's smoothed EMA (standard)
 * 2. Fixed entryTime default bug - was always using new Date() = 0 holdDays
 * 3. Fixed profit target comparison bug - profitTargetByDay values are decimals, unrealizedPL is already %
 * 4. Fixed performance.json - now updates on every trade close (wins/losses tracked)
 * 5. Fixed win rate always 0 - now computed from closed trade history
 * 6. Added VWAP-based entry filter (avoid chasing at intraday extremes)
 * 7. Added market breadth check - avoids entering into extreme sell-offs
 * 8. Added better logging of trade decisions
 *
 * NEW IN v3.2 (Quant Council):
 * 1. ATR-based dynamic stop loss & profit target (1.5x ATR stop, 3x ATR target → 2:1 R:R adapted to volatility)
 * 2. EMA 9/21 crossover entry filter (uptrend confirmation, avoids entering against trend)
 * 3. ADX filter (minimum ADX 20 — only trade trending markets, not choppy/ranging)
 * 4. Tighter RSI entry bands (40-65 instead of 30-70 — avoids exhaustion zones)
 * 5. Lower profit targets + earlier trailing stop (5% day-0 target, lock 40% at +2%)
 */

const app = express();
app.set('trust proxy', 1); // Railway runs behind a reverse proxy
const PORT = process.env.PORT || process.env.TRADING_PORT || 3002;

// [Phase 3.5] Cross-bot portfolio risk URLs (for co-located or Railway deployment)
const FOREX_BOT_URL = process.env.FOREX_BOT_URL || 'http://localhost:3005';
const CRYPTO_BOT_URL = process.env.CRYPTO_BOT_URL || 'http://localhost:3006';

app.use(cors({
    origin: [
        ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
        'https://nexus-dashboard-production-e6e6.up.railway.app',
        'http://localhost:3000', 'http://localhost:5173',
    ],
    credentials: true
}));
app.use(express.json());

// Rate limit all API endpoints (60 req/min per IP)
const apiRateLimit = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false,
    message: { success: false, error: 'Too many requests, try again later' } });
app.use('/api/', apiRateLimit);

// ── Persist env var to Railway (survives redeploys) ────────────────────────
async function persistEnvVar(name, value) {
    const token   = process.env.RAILWAY_TOKEN;
    const project = process.env.RAILWAY_PROJECT_ID;
    const env     = process.env.RAILWAY_ENVIRONMENT_ID;
    const service = process.env.RAILWAY_SERVICE_ID;
    if (!token || !project || !env || !service) return; // not on Railway — skip
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

// ── PostgreSQL + Auth Setup ─────────────────────────────────────────────────
let dbPool = null;

async function initDb() {
    if (!process.env.DATABASE_URL) {
        console.log('⚠️  DATABASE_URL not set — auth endpoints disabled');
        return;
    }
    try {
        dbPool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
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
            )
        `);
        console.log('✅ Auth DB ready');
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
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS agent_approved BOOLEAN DEFAULT false;
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS agent_confidence REAL;
            ALTER TABLE trades ADD COLUMN IF NOT EXISTS agent_reason TEXT;
            CREATE INDEX IF NOT EXISTS idx_trades_bot ON trades(bot);
            CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
            CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time);
            CREATE INDEX IF NOT EXISTS idx_trades_user_id ON trades(user_id);
            CREATE INDEX IF NOT EXISTS idx_trades_user_bot ON trades(user_id, bot);
            CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy);
            CREATE INDEX IF NOT EXISTS idx_trades_regime ON trades(regime);
        `);
        console.log('✅ Trades table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS engine_state (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bot VARCHAR(20) NOT NULL,
                state_json JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (user_id, bot)
            )
        `);
        console.log('✅ Engine state table ready');
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
        console.log('✅ User credentials table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(64) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL
            )
        `);
        console.log('✅ Password reset tokens table ready');
    } catch (e) {
        console.warn('⚠️  Auth DB init failed:', e.message);
        dbPool = null;
    }
}

// Auth routes provided by shared module
registerAuthRoutes(app, () => dbPool);

const alpacaConfig = {
    baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    apiKey: process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY,
    dataURL: 'https://data.alpaca.markets'
};

function hasGlobalAlpacaCredentials() {
    return Boolean(alpacaConfig.apiKey && alpacaConfig.secretKey);
}

// Returns the correct Alpaca base URL, reflecting runtime changes to REAL_TRADING_ENABLED.
// alpacaConfig.baseURL is the startup default; this getter re-evaluates the env var each call.
function getAlpacaBaseURL() {
    if (process.env.REAL_TRADING_ENABLED === 'true') return 'https://api.alpaca.markets';
    return process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';
}

const popularStocks = require('./services/trading/popular-stocks-list');

// Initialize Alert Services
const smsAlerts = getSMSAlertService();
let telegramAlerts = getTelegramAlertService();

const positions = new Map();
let scanCount = 0;
let lastScanTime = null;
let lastScanCompletedAt = 0; // for health monitor
const recentErrors = []; // { timestamp, error } for health monitoring

// Scan diagnostics — tracks which gates block trades each cycle
const scanDiagnostics = {
    lastCycleTime: null,
    signalsFound: 0,
    gateBlocks: {}, // gate name → count of blocks this cycle
    history: [],     // last 10 cycles for trend analysis
    _reset() {
        this.signalsFound = 0;
        this.gateBlocks = {};
        this.lastCycleTime = new Date().toISOString();
    },
    _block(gate) {
        this.gateBlocks[gate] = (this.gateBlocks[gate] || 0) + 1;
    },
    _save() {
        this.history.push({
            time: this.lastCycleTime,
            signals: this.signalsFound,
            blocks: { ...this.gateBlocks },
            totalBlocked: Object.values(this.gateBlocks).reduce((a, b) => a + b, 0),
        });
        if (this.history.length > 10) this.history.shift();
    },
};
const MAX_ERROR_HISTORY = 100;

// Persistent bot state (survives restarts)
const BOT_STATE_FILE = path.join(__dirname, 'data/stock-bot-state.json');
function loadBotState() {
    try {
        if (require('fs').existsSync(BOT_STATE_FILE)) {
            const saved = JSON.parse(require('fs').readFileSync(BOT_STATE_FILE, 'utf8'));
            return { running: saved.running !== false, paused: saved.paused === true };
        }
    } catch {}
    return { running: true, paused: false };
}
function saveBotState() {
    try {
        const dir = require('path').dirname(BOT_STATE_FILE);
        if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
        require('fs').writeFileSync(BOT_STATE_FILE, JSON.stringify({ running: botRunning, paused: botPaused }));
    } catch {}
}
const _initState = loadBotState();
let botRunning = _initState.running;
let botPaused = _initState.paused;

// Persist open positions so entry params survive a restart
const POSITIONS_FILE = path.join(__dirname, 'data/positions-state.json');
function savePositions() {
    try {
        const dir = require('path').dirname(POSITIONS_FILE);
        if (!require('fs').existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
        const snapshot = {};
        for (const [symbol, pos] of positions) {
            snapshot[symbol] = {
                ...pos,
                entryTime: pos.entryTime instanceof Date ? pos.entryTime.toISOString() : pos.entryTime,
            };
        }
        require('fs').writeFileSync(POSITIONS_FILE, JSON.stringify(snapshot, null, 2));
    } catch {}
}
function loadPositions() {
    try {
        if (require('fs').existsSync(POSITIONS_FILE)) {
            const saved = JSON.parse(require('fs').readFileSync(POSITIONS_FILE, 'utf8'));
            for (const [symbol, pos] of Object.entries(saved)) {
                positions.set(symbol, {
                    ...pos,
                    entryTime: pos.entryTime ? new Date(pos.entryTime) : new Date(),
                    // [Profit Protection] Ensure fields exist for positions saved before this feature
                    peakUnrealizedPL: pos.peakUnrealizedPL || 0,
                    wasPositive: pos.wasPositive || false,
                });
            }
            if (positions.size > 0) {
                console.log(`📂 Restored ${positions.size} position(s) from disk: ${[...positions.keys()].join(', ')}`);
            }
        }
    } catch {}
}
loadPositions();

// [v6.2] Hydrate agent metadata from DB after startup (survives ephemeral filesystem wipes)
async function hydrateAgentMetadataFromDB() {
    if (!dbPool) return;
    try {
        const dbResult = await dbPool.query(
            'SELECT id, symbol, agent_approved, agent_confidence, agent_reason FROM trades WHERE bot=$1 AND status=$2',
            ['stock', 'open']
        );
        let hydrated = 0;
        for (const row of dbResult.rows) {
            const existing = positions.get(row.symbol);
            if (existing && !existing.agentConfidence) {
                existing.agentApproved = row.agent_approved;
                existing.agentConfidence = row.agent_confidence;
                existing.agentReason = row.agent_reason;
                if (!existing.dbTradeId) existing.dbTradeId = row.id;
                hydrated++;
            }
        }
        if (hydrated > 0) {
            console.log(`🧠 Hydrated agent metadata for ${hydrated} position(s) from DB`);
        }
    } catch (e) {
        console.warn('Agent metadata hydration skipped:', e.message);
    }
}

// Anti-churning protection
const recentTrades = new Map();
const stoppedOutSymbols = new Map();
const tradesPerSymbol = new Map();
let totalTradesToday = 0;

// [v11.0] SPY Trend Hard Gate — reject all LONG entries when SPY is bearish
let spyBullish = true; // default true until first update (avoid blocking at startup)

// [Tier3 Fix] Aggregate 1-min SPY bars to 5-min for less noise
function aggregateTo5Min(bars1m) {
    const bars5m = [];
    for (let i = 0; i + 4 < bars1m.length; i += 5) {
        const chunk = bars1m.slice(i, i + 5);
        bars5m.push({
            o: chunk[0].o,
            h: Math.max(...chunk.map(b => b.h)),
            l: Math.min(...chunk.map(b => b.l)),
            c: chunk[chunk.length - 1].c,
            v: chunk.reduce((s, b) => s + (b.v || 0), 0),
        });
    }
    return bars5m;
}

// [v11.0] ORB trade limit — max 2 ORB trades per day (focus on best setups)
let orbTradesToday = 0;

// [v11.0] Symbol quality filter — ban known meme/penny stocks
const BANNED_SYMBOLS = new Set(['MVIS', 'HUT', 'RIOT', 'MARA', 'CLSK', 'LCID']);

// ===== PROFIT PROTECTION SYSTEM =====
// Tracks symbols closed via profit-protect that are eligible for re-entry (bypasses cooldown)
const profitProtectReentrySymbols = new Map(); // symbol -> { timestamp, direction, entry }
const PROFIT_PROTECT_REENTRY_WINDOW = 30 * 60 * 1000; // 30 minutes

// Daily loss circuit breaker — updated by the status endpoint each poll
let cachedDailyPnL = 0;
// [v19.1] Cached account equity — updated on every Alpaca account fetch, replaces hardcoded 100000
let cachedAccountEquity = 0;

// Performance tracking (in-memory, persisted to performance.json)
const fs = require('fs');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const PERF_FILE = path.join(DATA_DIR, 'performance.json');
const RISK_CONFIG_FILE = path.join(DATA_DIR, 'risk-config.json');

// ── [Improvement 1] Evaluation Persistence ────────────────────────────────
const EVAL_FILE = path.join(__dirname, 'data', 'stock-evaluations.json');

async function loadEvaluationsFromDB() {
    if (!dbPool) {
        console.log('[Persistence] No DB — starting with empty evaluations');
        return [];
    }
    try {
        const result = await dbPool.query(`
            SELECT symbol, direction, entry_price, exit_price, pnl_usd, pnl_pct,
                   entry_time, exit_time, close_reason, signal_score, entry_context,
                   strategy, regime, rsi, volume_ratio, momentum_pct
            FROM trades
            WHERE bot = 'stock' AND status = 'closed' AND pnl_usd IS NOT NULL AND close_reason != 'orphaned_restart'
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
                    // [v17.1] Don't fall back to signal_score — that's raw momentum score (100+), not committee confidence (0-1)
                    committeeConfidence: ctx.committeeConfidence ?? 0,
                    components: ctx.committeeComponents || {},
                    regime: row.regime || ctx.marketRegime || 'unknown',
                    score: parseFloat(row.signal_score) || 0
                },
                exitReason: row.close_reason || 'unknown',
                timestamp: exitTime
            };
        });

        console.log(`[Persistence] Loaded ${evals.length} stock evaluations from DB`);
        return evals;
    } catch (e) {
        console.error('[Persistence] DB eval load failed:', e.message);
        return [];
    }
}

// Make saveEvaluations a no-op (DB handles persistence via dbTradeClose)
function saveEvaluations(evals) {
    // No-op: trades persisted to PostgreSQL via dbTradeClose()
}

// Evaluations will be loaded from DB after initDb() completes (see app.listen startup block)
globalThis._tradeEvaluations = [];

// ── [Improvement 2] Weight Auto-Learning ─────────────────────────────────
const WEIGHTS_FILE = path.join(__dirname, 'data', 'stock-weights.json');
const DEFAULT_WEIGHTS = { momentum: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, volumeRatio: 0.15 };

function loadWeights() {
    try {
        if (fs.existsSync(WEIGHTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
            if (data.weights && typeof data.weights === 'object') {
                console.log(`[AutoLearn] Loaded optimized weights:`, JSON.stringify(data.weights));
                return data.weights;
            }
        }
    } catch (e) {
        console.error('[AutoLearn] Failed to load weights:', e.message);
    }
    return { ...DEFAULT_WEIGHTS };
}

function saveWeights(weights, meta) {
    try {
        const dir = path.dirname(WEIGHTS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(WEIGHTS_FILE, JSON.stringify({ weights, ...meta, updatedAt: new Date().toISOString() }, null, 2));
        console.log(`[AutoLearn] Saved optimized weights:`, JSON.stringify(weights));
    } catch (e) {
        console.error('[AutoLearn] Failed to save weights:', e.message);
    }
}

function optimizeCommitteeWeights() {
    const evals = globalThis._tradeEvaluations || [];
    if (evals.length < 30) {
        console.log(`[AutoLearn] Need ${30 - evals.length} more trades for weight optimization (have ${evals.length})`);
        return null;
    }

    const signalKeys = ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio'];
    const edges = {};

    for (const key of signalKeys) {
        // Split trades into "signal present/strong" vs "signal absent/weak"
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

        // Edge = how much better trades are when this signal is strong
        edges[key] = Math.max(0, avgWith - avgWithout);
    }

    // Normalize edges to weights (minimum 0.05, maximum 0.40)
    const MIN_WEIGHT = 0.05;
    const MAX_WEIGHT = 0.40;
    const totalEdge = Object.values(edges).reduce((s, e) => s + e, 0);

    if (totalEdge <= 0) {
        console.log('[AutoLearn] No positive edges detected, keeping default weights');
        return null;
    }

    const rawWeights = {};
    for (const key of signalKeys) {
        rawWeights[key] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, edges[key] / totalEdge));
    }

    // Renormalize to sum to 1.0
    const sum = Object.values(rawWeights).reduce((s, w) => s + w, 0);
    const optimizedWeights = {};
    for (const key of signalKeys) {
        optimizedWeights[key] = parseFloat((rawWeights[key] / sum).toFixed(3));
    }

    // Ensure sum is exactly 1.0 (fix rounding)
    const finalSum = Object.values(optimizedWeights).reduce((s, w) => s + w, 0);
    if (Math.abs(finalSum - 1.0) > 0.001) {
        optimizedWeights.momentum += parseFloat((1.0 - finalSum).toFixed(3));
    }

    console.log(`[AutoLearn] Optimized weights from ${evals.length} trades:`, JSON.stringify(optimizedWeights));
    console.log(`[AutoLearn] Signal edges:`, JSON.stringify(edges));

    saveWeights(optimizedWeights, { edges, tradeCount: evals.length, signalKeys });
    return optimizedWeights;
}

let committeeWeights = loadWeights();

// ── [Improvement 3] Transaction Cost Filter ───────────────────────────────
const TRANSACTION_COSTS = {
    spreadPct: 0.0005,    // 0.05% estimated spread (stocks)
    slippagePct: 0.0003,  // 0.03% estimated slippage
    commissionPct: 0.0000 // $0 commission (Alpaca)
};
const TOTAL_ROUND_TRIP_COST = 2 * (TRANSACTION_COSTS.spreadPct + TRANSACTION_COSTS.slippagePct + TRANSACTION_COSTS.commissionPct);

function isPositiveEV(committeeConfidence) {
    const evals = globalThis._tradeEvaluations || [];
    if (evals.length < 10) return true; // Not enough data, allow trading

    const recent = evals.slice(-50);
    const wins = recent.filter(e => e.pnl > 0);
    const losses = recent.filter(e => e.pnl <= 0);

    const avgWinPct = wins.length > 0 ? wins.reduce((s, e) => s + Math.abs(e.pnlPct || 0), 0) / wins.length : 0.02;
    const avgLossPct = losses.length > 0 ? losses.reduce((s, e) => s + Math.abs(e.pnlPct || 0), 0) / losses.length : 0.02;

    // Expected value = (confidence × avgWin) - ((1 - confidence) × avgLoss) - roundTripCosts
    const ev = (committeeConfidence * avgWinPct) - ((1 - committeeConfidence) * avgLossPct) - TOTAL_ROUND_TRIP_COST;

    if (ev <= 0) {
        console.log(`[CostFilter] REJECTED: EV=${(ev * 100).toFixed(3)}% (conf=${committeeConfidence.toFixed(3)}, avgWin=${(avgWinPct * 100).toFixed(2)}%, avgLoss=${(avgLossPct * 100).toFixed(2)}%, costs=${(TOTAL_ROUND_TRIP_COST * 100).toFixed(3)}%)`);
        return false;
    }
    return true;
}

// ── [Improvement 4] Signal Decay Detection ───────────────────────────────
function detectSignalDecay() {
    const evals = globalThis._tradeEvaluations || [];
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
                // Auto-reduce this signal's weight by 40%
                if (committeeWeights[key]) {
                    const reduced = committeeWeights[key] * 0.6;
                    const minWeight = 0.03;
                    committeeWeights[key] = Math.max(minWeight, reduced);
                    console.log(`[DecayDetect] ⚠️ ${key} signal decaying (winRate=${(winRate * 100).toFixed(1)}% over ${withSignal.length} trades) — weight reduced to ${committeeWeights[key].toFixed(3)}`);
                }
            }
        }
    }

    // Renormalize weights after decay adjustments
    if (decayWarnings.length > 0) {
        const sum = Object.values(committeeWeights).reduce((s, w) => s + w, 0);
        for (const key of signalKeys) {
            committeeWeights[key] = parseFloat((committeeWeights[key] / sum).toFixed(3));
        }
        // Fix rounding
        const finalSum = Object.values(committeeWeights).reduce((s, w) => s + w, 0);
        if (Math.abs(finalSum - 1.0) > 0.001) {
            committeeWeights.momentum += parseFloat((1.0 - finalSum).toFixed(3));
        }
        saveWeights(committeeWeights, { decayWarnings, updatedAt: new Date().toISOString() });
    }

    // Global pause check: if overall win rate < 30% on last 20 trades
    const overallWinRate = recent.filter(e => e.pnl > 0).length / recent.length;
    if (overallWinRate < 0.30) {
        console.log(`[DecayDetect] 🚨 CRITICAL: Overall win rate ${(overallWinRate * 100).toFixed(1)}% — consider pausing bot`);
    }

    return decayWarnings.length > 0 ? decayWarnings : null;
}
let perfData = {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    totalProfit: 0,
    totalWinAmount: 0,
    totalLossAmount: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    winRate: 0,
    profitFactor: 0,
    consecutiveLosses: 0,
    maxConsecutiveLosses: 0,
    circuitBreakerStatus: 'OK',
    circuitBreakerReason: null,
    isRunning: true,
    activePositions: 0,
    lastUpdate: new Date().toISOString()
};

try {
    const existing = JSON.parse(fs.readFileSync(PERF_FILE, 'utf8'));
    perfData = { ...perfData, ...existing, isRunning: true };
    console.log(`📊 Loaded performance history: ${perfData.totalTrades} trades, ${(perfData.winRate ?? 0).toFixed(1)}% win rate`);
} catch (e) {
    console.log('📊 Starting fresh performance tracking');
}

function savePerfData() {
    try {
        perfData.lastUpdate = new Date().toISOString();
        perfData.activePositions = positions.size;
        fs.writeFileSync(PERF_FILE, JSON.stringify(perfData, null, 2));
    } catch (e) {
        console.error('Failed to save performance data:', e.message);
    }
}

function recordTradeClose(symbol, entryPrice, exitPrice, shares, reason) {
    if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(shares) || entryPrice <= 0 || shares <= 0) {
        console.warn(`⚠️ Skipping trade-close stats for ${symbol}: invalid metrics entry=${entryPrice} exit=${exitPrice} shares=${shares}`);
        return;
    }
    const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
    const pnlDollar = (exitPrice - entryPrice) * shares;
    const isWin = pnlPct > 0;

    perfData.totalTrades++;
    perfData.totalProfit += pnlDollar;

    if (isWin) {
        perfData.winningTrades++;
        perfData.totalWinAmount += pnlDollar;
        perfData.consecutiveLosses = 0;
    } else {
        perfData.losingTrades++;
        perfData.totalLossAmount += Math.abs(pnlDollar);
        perfData.consecutiveLosses++;
        perfData.maxConsecutiveLosses = Math.max(perfData.maxConsecutiveLosses, perfData.consecutiveLosses);
    }

    perfData.winRate = perfData.totalTrades > 0
        ? (perfData.winningTrades / perfData.totalTrades) * 100
        : 0;

    // Profit factor: show 0 when there's insufficient data (<5 trades) to avoid misleading
    // 999x or 0x readings in the UI during the bot's first few trades.
    perfData.profitFactor = perfData.totalTrades < 5
        ? 0
        : perfData.totalLossAmount > 0
            ? perfData.totalWinAmount / perfData.totalLossAmount
            : perfData.totalWinAmount > 0 ? 9.99 : 0; // cap at 9.99 (no losses yet)

    console.log(`📈 TRADE CLOSED: ${symbol} | ${isWin ? 'WIN' : 'LOSS'} ${pnlPct.toFixed(2)}% ($${pnlDollar.toFixed(2)}) | Reason: ${reason}`);
    console.log(`📊 Running stats: ${perfData.winningTrades}W/${perfData.losingTrades}L | WR: ${perfData.winRate.toFixed(1)}% | PF: ${perfData.profitFactor.toFixed(2)}`);

    // Feed trade outcome to Monte Carlo position sizer (as decimal, e.g. 0.05 for +5%)
    monteCarloSizer.addTrade(pnlPct / 100);

    savePerfData();
}

// ===== DB TRADE HELPERS =====

async function dbTradeOpen(symbol, entryPrice, shares, config, signal, tier, strategy) {
    if (!dbPool) return null;
    try {
        const tags = buildStockTradeTags(signal, strategy, tier);
        const r = await dbPool.query(
            `INSERT INTO trades (bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
             position_size_usd,stop_loss,take_profit,entry_time,signal_score,entry_context,rsi,volume_ratio,momentum_pct,
             agent_approved,agent_confidence,agent_reason)
             VALUES ('stock',$1,'long',$2,$3,$4,'open',$5,$6,$7,$8,$9,NOW(),$10,$11::jsonb,$12,$13,$14,$15,$16,$17) RETURNING id`,
            [symbol, tier, tags.strategy, tags.regime, entryPrice, shares, shares * entryPrice,
             config.stopLoss ? entryPrice * (1 - config.stopLoss) : null,
             config.profitTarget ? entryPrice * (1 + config.profitTarget) : null,
             tags.score, JSON.stringify(tags.context),
             signal.rsi || null, signal.volumeRatio || null, signal.percentChange || null,
             signal.agentApproved || false, signal.agentConfidence || null, signal.agentReason || null]
        );
        return r.rows[0]?.id;
    } catch (e) { console.warn('DB open failed:', e.message); return null; }
}

async function dbTradeClose(id, exitPrice, pnlUsd, pnlPct, reason) {
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
        await client.query('ROLLBACK').catch(err => console.warn('[ALERT]', err.message));
        console.warn('DB close failed (rolled back):', e.message);
    } finally {
        client.release();
    }
}

function resolveClosedTradeMetrics(position, qty, exitPrice) {
    const entryPrice = parseFloat(position?.entry ?? position?.entryPrice ?? '0');
    const shares = parseFloat(qty ?? position?.shares ?? position?.quantity ?? '0');
    const normalizedExitPrice = parseFloat(exitPrice ?? '0');
    if (!Number.isFinite(entryPrice) || entryPrice <= 0) return null;
    if (!Number.isFinite(shares) || shares <= 0) return null;
    if (!Number.isFinite(normalizedExitPrice) || normalizedExitPrice <= 0) return null;
    const pnlUsd = (normalizedExitPrice - entryPrice) * shares;
    const pnlPct = ((normalizedExitPrice - entryPrice) / entryPrice) * 100;
    if (!Number.isFinite(pnlUsd) || !Number.isFinite(pnlPct)) return null;
    return { entryPrice, shares, exitPrice: normalizedExitPrice, pnlUsd, pnlPct };
}

async function repairInvalidTradePnL({ limit = 1000 } = {}) {
    if (!dbPool) return { scanned: 0, repaired: 0, rows: [] };
    const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 0, 1), 5000);
    const result = await dbPool.query(
        `WITH invalid AS (
            SELECT id
            FROM trades
            WHERE status='closed'
              AND exit_price IS NOT NULL
              AND entry_price IS NOT NULL
              AND quantity IS NOT NULL
              AND (
                    pnl_usd IS NULL OR pnl_pct IS NULL
                 OR pnl_usd::text = 'NaN'
                 OR pnl_pct::text = 'NaN'
              )
            ORDER BY exit_time DESC NULLS LAST, id DESC
            LIMIT $1
        )
        UPDATE trades t
        SET pnl_usd = ROUND((
                CASE
                    WHEN LOWER(COALESCE(t.direction, 'long')) = 'short'
                        THEN (t.entry_price - t.exit_price) * t.quantity
                    ELSE (t.exit_price - t.entry_price) * t.quantity
                END
            )::numeric, 2),
            pnl_pct = ROUND((
                CASE
                    WHEN t.entry_price > 0 THEN
                        CASE
                            WHEN LOWER(COALESCE(t.direction, 'long')) = 'short'
                                THEN (t.entry_price - t.exit_price) / t.entry_price
                            ELSE (t.exit_price - t.entry_price) / t.entry_price
                        END
                    ELSE 0
                END
            )::numeric, 6)
        FROM invalid
        WHERE t.id = invalid.id
        RETURNING t.id, t.bot, t.symbol, t.pnl_usd, t.pnl_pct`,
        [cappedLimit]
    );
    return {
        scanned: cappedLimit,
        repaired: result.rows.length,
        rows: result.rows,
    };
}

// [v17.1] One-time migration: normalize pnl_pct from percentage (5.0) to decimal (0.05)
// Historical stock/forex trades stored pnl_pct as percentage. Crypto was already decimal.
// Any row with |pnl_pct| > 1 is almost certainly a percentage (a real >100% decimal return is
// extremely unlikely for these position sizes). Safe because no trade should have pnl_pct > 1.0
// as a decimal (100%+ return on a single momentum/ORB trade doesn't happen with our position sizes).
async function migratePnlPctToDecimal() {
    if (!dbPool) return;
    try {
        const result = await dbPool.query(`
            UPDATE trades
            SET pnl_pct = pnl_pct / 100
            WHERE status = 'closed'
              AND pnl_pct IS NOT NULL
              AND ABS(pnl_pct) > 1
            RETURNING id, bot, symbol, pnl_pct
        `);
        if (result.rows.length > 0) {
            console.log(`[Migration] Normalized ${result.rows.length} trades from percentage to decimal pnl_pct`);
        }
    } catch (e) {
        console.warn('[Migration] pnl_pct normalization failed:', e.message);
    }
}

function buildStockTradeTags(signal = {}, strategy, tier) {
    const normalizedStrategy = strategy || signal.strategy || 'momentum';
    const percentChange = parseFloat(signal.percentChange ?? '0');
    const volumeRatio = parseFloat(signal.volumeRatio ?? '0');
    const score = signal.score != null ? parseFloat(Number(signal.score).toFixed(3)) : null;

    let regime = signal.regime || 'intraday-momentum';
    if (!signal.regime) {
        if (normalizedStrategy === 'openingRangeBreakout') {
            regime = 'opening-range';
        } else if (percentChange >= MOMENTUM_CONFIG.tier2.threshold || volumeRatio >= 3) {
            regime = 'trend-expansion';
        }
    }

    return {
        strategy: normalizedStrategy,
        regime,
        score,
        context: {
            tier: tier || signal.tier || null,
            percentChange: signal.percentChange ?? null,
            volumeRatio: signal.volumeRatio ?? null,
            rsi: signal.rsi ?? null,
            vwap: signal.vwap ?? null,
            breakoutTrigger: signal.breakoutTrigger ?? null,
            openingRangeHigh: signal.openingRangeHigh ?? null,
            atrStop: signal.atrStop ?? null,
            atrTarget: signal.atrTarget ?? null,
            atrPct: signal.atrPct ?? null,
            regimeScore: signal.regimeScore ?? null,
            // NEW: committee data for evaluation auto-learning
            committeeConfidence: signal.committeeConfidence ?? null,
            committeeComponents: signal.committeeComponents ?? null,
            orderFlowImbalance: signal.orderFlowImbalance ?? null,
            hasDisplacement: signal.hasDisplacement ?? false,
            fvgCount: signal.fvgCount ?? 0,
            marketRegime: signal.marketRegime ?? null,
        }
    };
}

// ===== SMOOTH INTERPOLATION UTILITIES (v5.1) =====
// Replace hard cliff-edge thresholds with smooth sigmoid/ramp scoring.
// Each function maps an indicator value to a 0.0–1.0 quality multiplier.

/**
 * Sigmoid ramp: smoothly transitions from `low` quality to `high` quality
 * around `center` with given `width` (steepness).
 * At center: returns midpoint. At center ± 2*width: nearly at limits.
 */
function sigmoidRamp(value, center, width, low = 0.0, high = 1.0) {
    const x = (value - center) / Math.max(width, 0.001);
    const sig = 1.0 / (1.0 + Math.exp(-x));
    return low + (high - low) * sig;
}

/**
 * Bell curve: peaks at `center`, falls off symmetrically.
 * Returns 1.0 at center, approaches `floor` at center ± 2*width.
 */
function bellScore(value, center, width, floor = 0.5) {
    const z = (value - center) / Math.max(width, 0.001);
    return floor + (1.0 - floor) * Math.exp(-0.5 * z * z);
}

/**
 * RSI quality: bell-shaped peak at ideal RSI (55), smooth penalty toward extremes.
 * RSI 55 → 1.0 (ideal), RSI 40/70 → ~0.7, RSI 30/80 → ~0.4
 */
function rsiQuality(rsi) {
    if (rsi == null) return 0.85; // neutral if unknown
    return bellScore(rsi, 55, 12, 0.3);
}

/**
 * Volume quality: sigmoid ramp — low volume penalized, high volume rewarded.
 * volRatio 1.0 → 0.5, 1.5 → 0.75, 2.0 → 0.9, 3.0+ → ~1.0
 */
function volumeQuality(volumeRatio) {
    if (volumeRatio == null) return 0.7;
    return sigmoidRamp(volumeRatio, 1.5, 0.6, 0.3, 1.05);
}

/**
 * ATR quality: ideal range 0.02–0.05, penalize extremes.
 * Too low = no movement, too high = erratic.
 */
function atrQuality(atrPct) {
    if (atrPct == null) return 0.9;
    return bellScore(atrPct, 0.035, 0.025, 0.5);
}

/**
 * VWAP quality: above VWAP = good, well above = bonus, below = penalty.
 * vwapDelta -0.002 → 0.3, 0 → 0.7, +0.003 → 1.0
 */
function vwapQuality(current, vwap) {
    if (!vwap || !current || current <= 0) return 0.85;
    const delta = (current - vwap) / vwap;
    return sigmoidRamp(delta, 0.0, 0.002, 0.2, 1.05);
}

function evaluateStockRegimeSignal({ strategy, percentChange, volumeRatio, rsi, current, vwap, atrPct = null, breakoutPct = 0 }) {
    const normalizedStrategy = strategy || 'momentum';
    let regime = normalizedStrategy === 'openingRangeBreakout' ? 'opening-range' : 'intraday-momentum';

    const numericPercentChange = parseFloat(percentChange ?? '0');
    const numericVolumeRatio = parseFloat(volumeRatio ?? '0');
    const numericRsi = parseFloat(rsi ?? '50');
    const numericCurrent = parseFloat(current ?? '0');
    const numericVwap = vwap != null ? parseFloat(vwap) : null;
    const numericBreakoutPct = parseFloat(breakoutPct ?? '0');
    const numericAtrPct = atrPct != null ? parseFloat(atrPct) : null;

    // [v18.0] Block mean-reversion entries in trending or high-volatility markets
    // Mean reversion loses money when the market is directionally moving — trades get stopped out
    if (normalizedStrategy === 'rsi2MeanReversion') {
        const marketRegime = globalThis._marketRegime;
        if (marketRegime) {
            if (marketRegime.regime === 'high') {
                return { tradable: false, regime: 'mean-revert-blocked-vol', quality: 0, requirePullback: false, components: {} };
            }
            if (marketRegime.isTrending) {
                return { tradable: false, regime: 'mean-revert-blocked-trend', quality: 0, requirePullback: false, components: {} };
            }
        }
    }

    // [Tier3 Fix] Trend-expansion: don't hard-block, require pullback to VWAP or EMA9
    // These are the strongest movers — the edge is in the timing, not in blocking them.
    // Historical 14.3% WR was from chasing peaks, not from the signal category being bad.
    let requirePullback = false;
    if (normalizedStrategy === 'openingRangeBreakout') {
        regime = 'opening-range';
    } else if (numericPercentChange >= MOMENTUM_CONFIG.tier2.threshold || numericVolumeRatio >= 3) {
        regime = 'trend-expansion';
        if (normalizedStrategy === 'momentum') {
            requirePullback = true; // signal consumer must verify pullback before entry
        }
    }

    // v5.1: Smooth interpolation — multiply quality factors instead of hard if/else
    let quality = 1.0;

    // ORB-specific adjustments (keep hard logic for breakout overextension)
    if (normalizedStrategy === 'openingRangeBreakout') {
        if (numericBreakoutPct > OPENING_RANGE_BREAKOUT_CONFIG.maxBreakoutPct * 0.85) quality *= 0.82;
        if (numericVolumeRatio < OPENING_RANGE_BREAKOUT_CONFIG.minBreakoutVolumeRatio + 0.2) quality *= 0.9;
    }

    // Smooth VWAP scoring (replaces hard -0.0015 cutoff)
    const vwapScore = vwapQuality(numericCurrent, numericVwap);
    quality *= vwapScore;

    // Smooth RSI scoring (replaces hard 42/69 cutoff + 47-63 bonus)
    quality *= rsiQuality(numericRsi);

    // Smooth volume scoring (replaces hard 1.35/3.5 cutoffs)
    quality *= volumeQuality(numericVolumeRatio);

    // Smooth ATR scoring (replaces hard 0.02/0.05/0.09 cutoffs)
    if (numericAtrPct != null) {
        quality *= atrQuality(numericAtrPct);
    }

    // Normalize: the product of 4 factors (each 0.3–1.05) can be very low.
    // Rescale so the median trade gets quality ~0.85, not ~0.5.
    // Geometric mean of 4 factors: quality^(1/4) then scale back.
    const factorCount = numericAtrPct != null ? 4 : 3;
    const geoMean = Math.pow(Math.max(quality, 0.01), 1 / factorCount);
    quality = geoMean; // Now in 0.3–1.05 range, matching old quality semantics

    // [Tier3 Fix] For trend-expansion signals, cap quality at 0.65 to reduce position size
    // relative to standard momentum entries. The signal is valid but entry timing needs refinement.
    const effectiveQuality = requirePullback ? Math.min(quality, 0.65) : quality;

    return {
        tradable: effectiveQuality >= (normalizedStrategy === 'openingRangeBreakout' ? 0.70 : 0.65),
        regime,
        quality: parseFloat(effectiveQuality.toFixed(3)),
        requirePullback,
        // v5.1: Expose component scores for backtest UI
        components: {
            rsi: parseFloat(rsiQuality(numericRsi).toFixed(3)),
            volume: parseFloat(volumeQuality(numericVolumeRatio).toFixed(3)),
            vwap: parseFloat(vwapScore.toFixed(3)),
            atr: numericAtrPct != null ? parseFloat(atrQuality(numericAtrPct).toFixed(3)) : null,
        }
    };
}

function inferBackfillTradeTags(trade) {
    const bot = trade.bot;
    const tier = trade.tier || null;
    const score = trade.signal_score != null
        ? parseFloat(Number(trade.signal_score).toFixed(3))
        : null;
    const baseContext = trade.entry_context && typeof trade.entry_context === 'object'
        ? trade.entry_context
        : {};

    let strategy = trade.strategy || null;
    let regime = trade.regime || null;

    if (bot === 'stock') {
        strategy = strategy || (tier === 'orb' ? 'openingRangeBreakout' : 'momentum');
        if (!regime) {
            const percentChange = parseFloat(trade.momentum_pct ?? '0');
            const volumeRatio = parseFloat(trade.volume_ratio ?? '0');
            regime = strategy === 'openingRangeBreakout'
                ? 'opening-range'
                : (percentChange >= MOMENTUM_CONFIG.tier2.threshold || volumeRatio >= 3 ? 'trend-expansion' : 'intraday-momentum');
        }
    } else if (bot === 'forex') {
        strategy = strategy || (parseFloat(trade.momentum_pct ?? '0') > 0.0035 ? 'trendContinuation' : 'pullbackContinuation');
        if (!regime) {
            if (trade.session === 'London/NY Overlap') regime = 'overlap-expansion';
            else if (trade.session === 'London') regime = 'london-trend';
            else if (trade.session === 'New York') regime = 'new-york-trend';
            else regime = 'session-trend';
        }
    } else if (bot === 'crypto') {
        strategy = strategy || (tier === 'pullback' ? 'trendPullback' : 'momentum');
        if (!regime) {
            regime = strategy === 'trendPullback'
                ? 'pullback-trend'
                : (parseFloat(trade.volume_ratio ?? '0') >= 1.5 ? 'trend-expansion' : 'risk-on');
        }
    }

    return {
        strategy: strategy || 'unlabeled',
        regime: regime || 'unlabeled',
        score,
        context: {
            ...baseContext,
            tier,
            session: trade.session ?? baseContext.session ?? null,
            inferred: true,
            backfillVersion: 'phase2-2026-03-09'
        }
    };
}

async function backfillTradeTags({ limit = 500, userId = null } = {}) {
    if (!dbPool) return { scanned: 0, updated: 0 };
    const params = [Math.max(1, Math.min(parseInt(limit, 10) || 500, 5000))];
    const filters = [
        `(strategy IS NULL OR regime IS NULL OR entry_context IS NULL OR entry_context = '{}'::jsonb)`
    ];
    if (userId != null) {
        params.push(userId);
        filters.push(`user_id = $${params.length}`);
    }

    const result = await dbPool.query(
        `SELECT id, bot, tier, session, momentum_pct, volume_ratio, signal_score, entry_context, strategy, regime
         FROM trades
         WHERE ${filters.join(' AND ')}
         ORDER BY created_at DESC
         LIMIT $1`,
        params
    );

    let updated = 0;
    for (const row of result.rows) {
        const tags = inferBackfillTradeTags(row);
        await dbPool.query(
            `UPDATE trades
             SET strategy = COALESCE(strategy, $1),
                 regime = COALESCE(regime, $2),
                 signal_score = COALESCE(signal_score, $3),
                 entry_context = CASE
                    WHEN entry_context IS NULL OR entry_context = '{}'::jsonb THEN $4::jsonb
                    ELSE entry_context || $4::jsonb
                 END
             WHERE id = $5`,
            [tags.strategy, tags.regime, tags.score, JSON.stringify(tags.context), row.id]
        );
        updated++;
    }

    return { scanned: result.rows.length, updated };
}

// ===== REGISTER DATA STRUCTURES WITH MEMORY MANAGER =====
memoryManager.register('positions', positions, { maxSize: 100, maxAge: 7 * 24 * 60 * 60 * 1000 }); // 7 days
memoryManager.register('recentTrades', recentTrades, { maxSize: 500, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
memoryManager.register('stoppedOutSymbols', stoppedOutSymbols, { maxSize: 200, maxAge: 60 * 60 * 1000 }); // 1 hour
memoryManager.register('tradesPerSymbol', tradesPerSymbol, { maxSize: 200, maxAge: 24 * 60 * 60 * 1000 }); // 1 day

// Start memory manager if in production
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_MEMORY_MANAGER === 'true') {
    memoryManager.start();
    console.log('🧠 Memory Manager started');
}

// Memory warning handlers
memoryManager.on('warning', (data) => {
    console.warn(`⚠️  MEMORY WARNING: ${data.heapUsedMB}MB / ${data.heapLimitMB}MB (${data.usagePercent.toFixed(1)}%)`);
});

memoryManager.on('critical', (data) => {
    console.error(`🚨 CRITICAL MEMORY: ${data.heapUsedMB}MB - forcing cleanup`);
});

let MAX_TRADES_PER_DAY = parseInt(process.env.MAX_TRADES_PER_DAY || '15');
const MAX_TRADES_PER_SYMBOL = 3;
const MIN_TIME_BETWEEN_TRADES = 10 * 60 * 1000;
const MIN_TIME_AFTER_STOP = 60 * 60 * 1000;
let MAX_DAILY_LOSS = Math.abs(parseFloat(process.env.MAX_DAILY_LOSS || '500'));   // $ amount (always positive)
let MAX_DRAWDOWN_PCT = parseFloat(process.env.MAX_DRAWDOWN_PCT || '10'); // percent

// ===== ADAPTIVE GUARDRAILS (v4.6) =====
// Env-overridable thresholds — stricter than legacy defaults
const RISK_PER_TRADE = parseFloat(process.env.RISK_PER_TRADE || '0.0025');      // [v19.0] 0.25% per trade (was 0.75% — theplus-bot proven sizing)
// [v19.1] Lowered from 0.68 → 0.45: orchestrator blends agent confidence with
// analyst track record, producing final values of 0.49-0.63. Old threshold blocked all trades.
const MIN_SIGNAL_CONFIDENCE = parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.45');
const MIN_SIGNAL_SCORE = parseFloat(process.env.MIN_SIGNAL_SCORE || '0.20');  // [v19.1] was 0.65, regime multipliers reduce scores to 0.25-0.35 range
const MIN_REWARD_RISK = parseFloat(process.env.MIN_REWARD_RISK || '1.75');

// Auto-optimizer state — runs every 4 hours
let optimizedParams = null;
let lastOptimizationTime = 0;
const OPTIMIZATION_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours
const MAX_SIGNALS_PER_CYCLE = parseInt(process.env.MAX_SIGNALS_PER_CYCLE || '1');
const MAX_CONSECUTIVE_LOSSES = parseInt(process.env.MAX_CONSECUTIVE_LOSSES || '3');
const LOSS_PAUSE_MS = parseInt(process.env.LOSS_PAUSE_MS || '7200000');          // 2h pause after N consecutive losses
const STOP_LOSS_COOLDOWN_MS = parseInt(process.env.STOP_LOSS_COOLDOWN_MS || '2700000'); // 45min after stop loss

// Adaptive guardrail state
const guardrails = {
    consecutiveLosses: 0,
    recentResults: [],          // last 20 trade results: true=win, false=loss
    lanePausedUntil: 0,         // timestamp when lane resumes
    totalLossesToday: 0,
    totalWinsToday: 0,

    get recentWinRate() {
        if (this.recentResults.length < 5) return 0.5;
        const wins = this.recentResults.filter(Boolean).length;
        return wins / this.recentResults.length;
    },
    get recentProfitFactor() {
        // Rough proxy: wins/losses ratio
        const wins = this.recentResults.filter(Boolean).length;
        const losses = this.recentResults.length - wins;
        if (losses === 0) return 3.0;
        return wins / losses;
    },
    get isPaused() {
        return Date.now() < this.lanePausedUntil;
    },
    recordOutcome(isWin) {
        this.recentResults.push(isWin);
        if (this.recentResults.length > 20) this.recentResults.shift();
        if (isWin) {
            this.consecutiveLosses = 0;
            this.totalWinsToday++;
        } else {
            this.consecutiveLosses++;
            this.totalLossesToday++;
            if (this.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
                // [v6.1] Escalating pause: 2h base × (losses / 3), capped at 24h
                const escalation = Math.min(8, Math.ceil(this.consecutiveLosses / MAX_CONSECUTIVE_LOSSES));
                this.lanePausedUntil = Date.now() + LOSS_PAUSE_MS * escalation;
                console.log(`🚫 [Guardrail] Stock lane PAUSED until ${new Date(this.lanePausedUntil).toLocaleTimeString()} — ${this.consecutiveLosses} consecutive losses`);
            }
        }
    },
    resetDaily() {
        this.consecutiveLosses = 0;
        this.recentResults = [];
        this.lanePausedUntil = 0;
        this.totalLossesToday = 0;
        this.totalWinsToday = 0;
    },
    // Position size multiplier: cut aggressively after losses
    get lossSizeMultiplier() {
        if (this.consecutiveLosses >= 3) return 0.25;
        if (this.consecutiveLosses >= 2) return 0.5;
        if (this.consecutiveLosses >= 1) return 0.75;
        if (this.recentWinRate < 0.35) return 0.5;
        return 1.0;
    },
};

// ===== NEW: TIME-BASED EXIT CONFIGURATION =====
const EXIT_CONFIG = {
    maxHoldDays: 7,           // Max 7 days per position
    idealHoldDays: 3,         // Ideal 3-day momentum trades
    stalePositionDays: 10,    // Force close after 10 days

    // [v9.0] Profit targets aligned with new tier configs (3.5-6% targets)
    // Old 8% day-0 target was never hit — winners closed end-of-day at +1.4%
    profitTargetByDay: {
        0: 0.06,  // Day 0: 6% — match new tier1 profitTarget (v17.0)
        1: 0.03,  // Day 1: 3%
        2: 0.025, // Day 2: 2.5%
        3: 0.02,  // Day 3: 2%
        4: 0.015, // Day 4: 1.5%
        5: 0.01,  // Day 5: 1%
        6: 0.005, // Day 6: 0.5%
        7: 0.003  // Day 7+: any green
    },

    // [v9.0] Trailing stops — protect gains early, let profit protection handle the rest
    // Start at +0.5% (stocks move more than forex but still need early protection)
    // [v13.0] Trailing starts at 1x risk (2% stop → trail from +2%)
    // Old +0.5% start was 0.25x risk — too tight, noise-triggered exits
    trailingStopLevels: [
        { gainThreshold: 0.03,  lockPercent: 0.30 },   // +3.0% (1.2x risk): lock 30% → stop at +0.9% (v17.0: was +2%, too tight)
        { gainThreshold: 0.035, lockPercent: 0.45 },   // +3.5% (1.75x): lock 45%
        { gainThreshold: 0.05,  lockPercent: 0.60 },   // +5.0%: lock 60%
        { gainThreshold: 0.08,  lockPercent: 0.75 },   // +8.0%: lock 75%
        { gainThreshold: 0.12,  lockPercent: 0.85 },   // +12.0%: lock 85%
    ],

    // Momentum reversal thresholds
    momentumReversal: {
        rsiOverbought: 72,        // RSI > 72 = overbought
        volumeDropPercent: 0.50,  // 50% volume drop = fading
        dailyHighDropPercent: 0.02, // 2% from daily high = reversal
        supportBreakPercent: 0.015  // Break 1.5% below entry low
    }
};

// [v9.0] Momentum tiers recalibrated — tighter stops, realistic targets
// Old: 4% stop / 8% target → losses at -2.7% while wins close at +1.4% end-of-day
// New: Risk less, take profit earlier, let profit protection handle runners
const MOMENTUM_CONFIG = {
    tier1: {
        threshold: 3.5,
        minVolume: 500000,
        volumeRatio: 1.8,
        rsiMax: 66,
        rsiMin: 40,
        positionSize: 0.005,
        stopLoss: 0.025,       // [v17.0] 2.5% stop (was 2%) — wider to reduce noise stops
        profitTarget: 0.06,    // [v17.0] 6% target (was 3.5%) — 2.4:1 R:R, profitable at 33% WR
        maxPositions: 4
    },
    tier2: {
        threshold: 5.0,
        minVolume: 750000,
        volumeRatio: 2.0,
        rsiMax: 66,
        rsiMin: 40,
        positionSize: 0.0075,
        stopLoss: 0.03,        // [v17.0] 3% stop (was 2.5%) — 5%+ movers need wider stops
        profitTarget: 0.07,    // [v17.0] 7% target (was 4.5%) — 2.33:1 R:R, profitable at 33% WR
        maxPositions: 3
    },
    tier3: {
        threshold: 10.0,
        minVolume: 1000000,
        volumeRatio: 2.2,
        rsiMax: 68,
        rsiMin: 40,
        positionSize: 0.01,
        stopLoss: 0.03,        // [v9.0] 3% stop (was 6%)
        profitTarget: 0.06,    // [v9.0] 6% target (was 15%) — 2:1 R:R
        maxPositions: 2
    }
};

// [v13.2] ORB recalibrated — 1.2% stop was too tight for opening range volatility
// PLTR/INTC both stopped at -1.3% within minutes. Opening 30min has 2-3x normal vol.
// Widened to 2.0% stop / 3.5% target (1.75:1 R:R) — gives room for opening shakeouts.
const OPENING_RANGE_BREAKOUT_CONFIG = {
    openingRangeMinutes: 15,
    entryCutoffHour: 11,
    breakoutBufferDollars: 0.10,
    breakoutBufferPct: 0.001,
    minBreakoutVolumeRatio: 1.8,
    rsiMin: 48,
    rsiMax: 68,             // [v9.0] tightened from 72 — reject overbought entries
    maxBreakoutPct: 0.03,
    positionSize: 0.004,
    stopLoss: 0.025,        // [v17.0] 2.5% stop (was 2.0%) — opening range has 2-3x normal volatility
    profitTarget: 0.050,    // [v17.0] 5.0% target (was 3.5%) — 2:1 R:R, profitable at 33% WR
    maxPositions: 2
};

// Load persisted risk config overrides (survives restarts)
try {
    if (fs.existsSync(RISK_CONFIG_FILE)) {
        const saved = JSON.parse(fs.readFileSync(RISK_CONFIG_FILE, 'utf8'));
        ['tier1', 'tier2', 'tier3'].forEach(tier => {
            if (saved[tier]) Object.assign(MOMENTUM_CONFIG[tier], saved[tier]);
        });
        console.log('⚙️  Loaded persisted risk config overrides');
    }
} catch (e) {
    console.log('⚙️  No persisted risk config found, using defaults');
}

function saveRiskConfig() {
    try {
        const dir = path.dirname(RISK_CONFIG_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const snapshot = {
            tier1: { stopLoss: MOMENTUM_CONFIG.tier1.stopLoss, profitTarget: MOMENTUM_CONFIG.tier1.profitTarget, positionSize: MOMENTUM_CONFIG.tier1.positionSize, maxPositions: MOMENTUM_CONFIG.tier1.maxPositions },
            tier2: { stopLoss: MOMENTUM_CONFIG.tier2.stopLoss, profitTarget: MOMENTUM_CONFIG.tier2.profitTarget, positionSize: MOMENTUM_CONFIG.tier2.positionSize, maxPositions: MOMENTUM_CONFIG.tier2.maxPositions },
            tier3: { stopLoss: MOMENTUM_CONFIG.tier3.stopLoss, profitTarget: MOMENTUM_CONFIG.tier3.profitTarget, positionSize: MOMENTUM_CONFIG.tier3.positionSize, maxPositions: MOMENTUM_CONFIG.tier3.maxPositions },
        };
        fs.writeFileSync(RISK_CONFIG_FILE, JSON.stringify(snapshot, null, 2));
    } catch (e) {
        console.error('Failed to save risk config:', e.message);
    }
}

const TRADING_HOURS = {
    marketOpen: { hour: 9, minute: 30 },
    marketClose: { hour: 16, minute: 0 },
    avoidFirstMinutes: 0,
    avoidLastMinutes: 30  // v6.0: back to 30 — recapture 2:30-3:00 PM window (stronger than 3-4 PM)
};

function getESTDate() {
    // Build a Date whose .getHours()/.getMinutes()/.getDay() return EST/EDT values
    // toLocaleString gives e.g. "3/3/2026, 9:05:00 AM" in NY time.
    // Re-parsing that string with new Date() would treat it as LOCAL (UTC on Railway),
    // so we extract the parts manually instead.
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    }).formatToParts(now);
    const get = type => parseInt(parts.find(p => p.type === type).value, 10);
    // Construct a plain Date in local time using NY values — only used for .getHours() etc.
    return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

function isGoodTradingTime() {
    const now = getESTDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeInMinutes = hour * 60 + minute;

    const marketOpenTime = TRADING_HOURS.marketOpen.hour * 60 + TRADING_HOURS.marketOpen.minute;
    const marketCloseTime = TRADING_HOURS.marketClose.hour * 60 + TRADING_HOURS.marketClose.minute;

    const tradingStart = marketOpenTime + TRADING_HOURS.avoidFirstMinutes;
    const tradingEnd = marketCloseTime - TRADING_HOURS.avoidLastMinutes;

    const isMarketDay = now.getDay() >= 1 && now.getDay() <= 5;
    const isGoodTime = timeInMinutes >= tradingStart && timeInMinutes <= tradingEnd;

    // Midday dead zone: 11:30 AM - 1:30 PM EST (0% WR at noon, historically net-negative)
    const middayStart = 11 * 60 + 30; // 11:30 AM
    const middayEnd   = 13 * 60 + 30; // 1:30 PM
    const isMiddayDeadZone = timeInMinutes >= middayStart && timeInMinutes <= middayEnd;

    return isMarketDay && isGoodTime && !isMiddayDeadZone;
}

function isOpeningRangeBreakoutWindow(now = getESTDate()) {
    const isMarketDay = now.getDay() >= 1 && now.getDay() <= 5;
    if (!isMarketDay) return false;

    const hour = now.getHours();
    const minute = now.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    const openingRangeEnd = (TRADING_HOURS.marketOpen.hour * 60 + TRADING_HOURS.marketOpen.minute)
        + OPENING_RANGE_BREAKOUT_CONFIG.openingRangeMinutes;
    const entryCutoff = OPENING_RANGE_BREAKOUT_CONFIG.entryCutoffHour * 60;

    return timeInMinutes >= openingRangeEnd && timeInMinutes <= entryCutoff;
}

function buildOpeningRangeBreakoutCandidate({ symbol, bars, current, rsi, vwap, volumeToday, positionsMap, atrPct = null }) {
    if (!isOpeningRangeBreakoutWindow()) return null;
    if (!bars || bars.length < OPENING_RANGE_BREAKOUT_CONFIG.openingRangeMinutes + 3) return null;

    const openingRangeBars = bars.slice(0, OPENING_RANGE_BREAKOUT_CONFIG.openingRangeMinutes);
    if (openingRangeBars.length < OPENING_RANGE_BREAKOUT_CONFIG.openingRangeMinutes) return null;

    const orbPositions = Array.from((positionsMap || new Map()).values())
        .filter(position => position.strategy === 'openingRangeBreakout' || position.tier === 'orb')
        .length;
    if (orbPositions >= OPENING_RANGE_BREAKOUT_CONFIG.maxPositions) return null;

    const openingRangeHigh = Math.max(...openingRangeBars.map(bar => bar.h));
    const breakoutBuffer = Math.max(
        OPENING_RANGE_BREAKOUT_CONFIG.breakoutBufferDollars,
        openingRangeHigh * OPENING_RANGE_BREAKOUT_CONFIG.breakoutBufferPct
    );
    const breakoutTrigger = openingRangeHigh + breakoutBuffer;
    if (current <= breakoutTrigger) return null;

    const breakoutPct = (current - breakoutTrigger) / openingRangeHigh;
    if (breakoutPct <= 0 || breakoutPct > OPENING_RANGE_BREAKOUT_CONFIG.maxBreakoutPct) return null;

    const recentBars = bars.slice(-3);
    const bullishCloses = recentBars.filter(bar => bar.c > bar.o).length;
    if (bullishCloses < 2) return null;

    const avgOpeningRangeVolume = openingRangeBars.reduce((sum, bar) => sum + bar.v, 0) / openingRangeBars.length;
    const recentBreakoutVolume = recentBars.reduce((sum, bar) => sum + bar.v, 0) / recentBars.length;
    const breakoutVolumeRatio = avgOpeningRangeVolume > 0 ? recentBreakoutVolume / avgOpeningRangeVolume : 0;
    if (breakoutVolumeRatio < OPENING_RANGE_BREAKOUT_CONFIG.minBreakoutVolumeRatio) return null;

    if (vwap && current < vwap) return null;
    if (rsi < OPENING_RANGE_BREAKOUT_CONFIG.rsiMin || rsi > OPENING_RANGE_BREAKOUT_CONFIG.rsiMax) return null;

    const rsiBonus = 1 + Math.max(0, 1 - Math.abs(rsi - 60) / 20) * 0.15;
    const regimeProfile = evaluateStockRegimeSignal({
        strategy: 'openingRangeBreakout',
        percentChange: ((current - bars[0].o) / bars[0].o) * 100,
        volumeRatio: breakoutVolumeRatio,
        rsi,
        current,
        vwap,
        atrPct,
        breakoutPct
    });
    if (!regimeProfile.tradable) return null;
    // [Tier3 Fix] Normalized ORB score — prevents chasing the most extended breakouts.
    // The old formula (8 + breakoutPct*1000 + ...) * rsiBonus * regimeQuality produced unbounded scores
    // dominated by breakoutPct magnitude. Each component is now capped to [0,1] and combined as a
    // weighted average. rsiBonus (continuous 1.0–1.15) is mapped to a 0–1 norm via (rsiBonus - 1) / 0.15.
    const normBreakout = Math.min(breakoutPct / 0.05, 1.0);          // caps at 5% above ORB trigger
    const normVolume   = Math.min(breakoutVolumeRatio / 4, 1.0);     // caps at 4× opening-range volume
    const normRsi      = (rsiBonus - 1.0) / 0.15;                    // maps [1.0, 1.15] → [0, 1]
    const normRegime   = regimeProfile.quality;                        // already [0,1]
    const score = (normBreakout * 0.35 + normVolume * 0.30 + normRsi * 0.20 + normRegime * 0.15);

    return {
        symbol,
        price: current,
        percentChange: (((current - bars[0].o) / bars[0].o) * 100).toFixed(2),
        volumeRatio: breakoutVolumeRatio.toFixed(2),
        volume: volumeToday,
        rsi: rsi.toFixed(2),
        vwap: vwap ? vwap.toFixed(2) : null,
        tier: 'orb',
        score: parseFloat(score.toFixed(3)),
        strategy: 'openingRangeBreakout',
        regime: regimeProfile.regime,
        regimeScore: regimeProfile.quality,
        config: OPENING_RANGE_BREAKOUT_CONFIG,
        entryVolume: recentBreakoutVolume,
        breakoutTrigger: breakoutTrigger.toFixed(2),
        openingRangeHigh: openingRangeHigh.toFixed(2)
    };
}

// Wilder's Smoothed RSI (industry standard, more accurate than simple average)
function calculateRSI(bars, period = 14) {
    try {
        if (bars.length < period * 2) return 50; // Need more data for smoothed RSI

        const closes = bars.map(bar => bar.c);
        if (sharedIndicators) return sharedIndicators.calculateRSI(closes, period);
        const changes = [];
        for (let i = 1; i < closes.length; i++) {
            changes.push(closes[i] - closes[i - 1]);
        }

        // Seed with simple average for first period
        let avgGain = 0;
        let avgLoss = 0;
        for (let i = 0; i < period; i++) {
            if (changes[i] > 0) avgGain += changes[i];
            else avgLoss += Math.abs(changes[i]);
        }
        avgGain /= period;
        avgLoss /= period;

        // Wilder's smoothing for the rest
        for (let i = period; i < changes.length; i++) {
            const gain = changes[i] > 0 ? changes[i] : 0;
            const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
        }

        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    } catch (error) {
        return 50;
    }
}

// [v3.2] EMA helper — used by EMA crossover and ADX filters
function calculateEMA(closes, period) {
    if (sharedIndicators) return sharedIndicators.calculateEMA(closes, period);
    if (closes.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < closes.length; i++) {
        ema = (closes[i] - ema) * multiplier + ema;
    }
    return ema;
}

// [v3.2] ATR (Wilder's smoothing) — measures volatility for adaptive stop/target sizing
function calculateATR(bars, period = 14) {
    if (bars.length < period + 1) return null;
    const trValues = [];
    for (let i = 1; i < bars.length; i++) {
        const high = bars[i].h, low = bars[i].l, prevClose = bars[i - 1].c;
        trValues.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    // Seed with simple average
    let atr = trValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    // Wilder's smoothing
    for (let i = period; i < trValues.length; i++) {
        atr = (atr * (period - 1) + trValues[i]) / period;
    }
    return atr;
}

// [v3.2] ADX — measures trend strength (0-100). >20 = trending, >25 = strong trend
// Only enter when market is trending, not ranging/choppy
function calculateADX(bars, period = 14) {
    if (bars.length < period * 2 + 1) return null;
    const plusDM = [], minusDM = [], tr = [];

    for (let i = 1; i < bars.length; i++) {
        const upMove = bars[i].h - bars[i - 1].h;
        const downMove = bars[i - 1].l - bars[i].l;
        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
        tr.push(Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c)));
    }

    // Wilder smoothing seed
    let smoothTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothPlusDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
    let smoothMinusDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);

    const dxValues = [];
    for (let i = period; i < tr.length; i++) {
        smoothTR = smoothTR - smoothTR / period + tr[i];
        smoothPlusDM = smoothPlusDM - smoothPlusDM / period + plusDM[i];
        smoothMinusDM = smoothMinusDM - smoothMinusDM / period + minusDM[i];

        if (smoothTR === 0) return null; // Guard against division by zero

        const plusDI = (smoothPlusDM / smoothTR) * 100;
        const minusDI = (smoothMinusDM / smoothTR) * 100;
        const diSum = plusDI + minusDI;
        dxValues.push(diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0);
    }

    if (dxValues.length < period) return null;
    const adx = dxValues.slice(-period).reduce((a, b) => a + b, 0) / period;
    return adx;
}

// [v3.4] MACD(12,26,9) — momentum confirmation; enter only when histogram is bullish & rising
// Identical logic to crypto bot's implementation, adapted for bar objects {c: close}
function calculateMACD(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (bars.length < slowPeriod + signalPeriod) return null;
    const closes = bars.map(b => b.c);
    if (sharedIndicators) {
        const result = sharedIndicators.calculateMACD(closes, fastPeriod, slowPeriod, signalPeriod);
        if (result) return { macd: result.macd, signal: result.signal, histogram: result.histogram, bullish: result.histogram > 0 };
        return null;
    }
    // Build MACD line over entire bar history (skip first slowPeriod-1 bars)
    const macdLine = [];
    for (let i = slowPeriod - 1; i < closes.length; i++) {
        const slice = closes.slice(0, i + 1);
        const fast = calculateEMA(slice, fastPeriod);
        const slow = calculateEMA(slice, slowPeriod);
        if (fast !== null && slow !== null) macdLine.push(fast - slow);
    }
    if (macdLine.length < signalPeriod + 1) return null; // need at least 2 bars for prevHistogram
    const signalLine = calculateEMA(macdLine, signalPeriod);
    if (signalLine === null) return null;
    const histogram = macdLine[macdLine.length - 1] - signalLine;

    // prevHistogram: signal line one bar back, computed from macdLine without the latest value.
    // Using macdLine.slice(0,-1) with its own EMA gives the correct prior signal value —
    // the key fix is we use macdLine[length-2] against THIS prior signal (not recombined with current).
    const prevSignalLine = calculateEMA(macdLine.slice(0, -1), signalPeriod);
    const prevHistogram = prevSignalLine !== null
        ? macdLine[macdLine.length - 2] - prevSignalLine
        : histogram;

    return {
        macd: macdLine[macdLine.length - 1],
        signal: signalLine,
        histogram,
        // Require histogram strictly positive AND rising — both conditions must be true
        bullish: histogram > 0  // positive histogram = bullish momentum; rising check removed (too restrictive)
    };
}

// Signal functions — delegated to shared library (services/signals/)
const calculateOrderFlowImbalance = sharedSignals
    ? (klines, lookback) => sharedSignals.calculateOrderFlowImbalance(klines, lookback, 'stock')
    : (klines, lookback) => undefined; // undefined = gate skipped (no signal data available)

const isDisplacementCandle = sharedSignals
    ? (klines, atr, lookback) => sharedSignals.isDisplacementCandle(klines, atr, lookback, 'stock')
    : () => false;

const calculateVolumeProfile = sharedSignals
    ? (klines, numBuckets) => sharedSignals.calculateVolumeProfile(klines, numBuckets, 'stock')
    : () => null;

const detectFairValueGaps = sharedSignals
    ? (klines, lookback) => sharedSignals.detectFairValueGaps(klines, lookback, 'stock')
    : () => ({ bullish: [], bearish: [] });

// [Phase 3] Committee Aggregator — combines multiple signal confirmations into unified confidence
// Each signal source contributes independently; more confirmations = higher confidence
// [v13.1] Threshold lowered from 0.50 to 0.45 — binary components (displacement, FVG) rarely fire,
// making 0.50 nearly unreachable. Neutral defaults (0.3) + 0.45 threshold still filters weak signals.
function computeCommitteeScore(signal) {
    let confirmations = 0;
    let totalWeight = 0;

    // [v22.0] EVIDENCE-BASED SCORING: absent signals = 0 (no evidence), not 0.5 (neutral).
    // Only count components that have actual data. This prevents confidence inflation
    // from missing data — data showed high confidence (0.585) had 6% WR while low (0.492) had 33%.
    // Root cause: 0.5 defaults inflated scores for trades missing order flow, VP, FVG, displacement.

    // 1. Momentum strength — always available
    const momentumScore = Math.min(parseFloat(signal.percentChange || 0) / 10, 1.0);
    confirmations += momentumScore * committeeWeights.momentum;
    totalWeight += committeeWeights.momentum;

    // 2. Order flow — only count if data present
    const flowScore = signal.orderFlowImbalance !== undefined
        ? Math.max(0, signal.orderFlowImbalance)
        : 0;
    if (signal.orderFlowImbalance !== undefined) {
        confirmations += flowScore * committeeWeights.orderFlow;
        totalWeight += committeeWeights.orderFlow;
    }

    // 3. Displacement candle — only count if displacement detected
    const displacementScore = signal.hasDisplacement ? 1.0 : 0;
    if (signal.hasDisplacement) {
        confirmations += displacementScore * committeeWeights.displacement;
        totalWeight += committeeWeights.displacement;
    }

    // 4. Volume Profile — only count if VP data present
    let vpScore = 0;
    if (signal.volumeProfile) {
        const price = parseFloat(signal.price);
        const { vah, val } = signal.volumeProfile;
        const range = vah - val;
        if (range > 0) {
            const positionInRange = (price - val) / range;
            vpScore = Math.max(0, 1.0 - positionInRange);
        }
        confirmations += vpScore * committeeWeights.volumeProfile;
        totalWeight += committeeWeights.volumeProfile;
    }

    // 5. FVG confirmation — only count if FVGs present
    const fvgScore = (signal.fvgCount || 0) > 0 ? 1.0 : 0;
    if ((signal.fvgCount || 0) > 0) {
        confirmations += fvgScore * committeeWeights.fvg;
        totalWeight += committeeWeights.fvg;
    }

    // 6. Volume ratio — always available
    const volRatioScore = Math.min(parseFloat(signal.volumeRatio || 1) / 3, 1.0);
    confirmations += volRatioScore * committeeWeights.volumeRatio;
    totalWeight += committeeWeights.volumeRatio;

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

// [Phase 3] Market Regime Detection — classifies current market conditions
// Uses realized volatility from bar data to bucket into low/medium/high regimes
// Each regime adjusts position sizing and score thresholds
const REGIME_ADJUSTMENTS = {
    low: {
        label: 'Low Volatility',
        positionSizeMultiplier: 1.2,   // Can size up in calm markets
        scoreThresholdMultiplier: 0.9, // Slightly lower bar (fewer signals, take what comes)
        maxPositions: 8                // Can hold more in stable markets
    },
    medium: {
        label: 'Normal',
        positionSizeMultiplier: 1.0,   // Default sizing
        scoreThresholdMultiplier: 1.0, // Default thresholds
        maxPositions: 6
    },
    high: {
        label: 'High Volatility',
        positionSizeMultiplier: 0.6,   // Reduce size in volatile markets
        scoreThresholdMultiplier: 1.2, // Raise the bar (only best signals)
        maxPositions: 4                // Fewer positions to control risk
    }
};

function detectMarketRegime(bars) {
    if (!bars || bars.length < 20) return { regime: 'medium', adjustments: REGIME_ADJUSTMENTS.medium };

    // Calculate realized volatility from last 20 bars
    const recent = bars.slice(-20);
    let sumTR = 0;
    for (let i = 1; i < recent.length; i++) {
        const high = parseFloat(recent[i].h);
        const low = parseFloat(recent[i].l);
        const prevClose = parseFloat(recent[i - 1].c);
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        sumTR += tr;
    }
    const avgTR = sumTR / (recent.length - 1);
    const lastClose = parseFloat(recent[recent.length - 1].c);
    const atrPct = lastClose > 0 ? avgTR / lastClose : 0;

    // Bucket into regimes (based on typical intraday 1-min ATR% for equities)
    // Low: < 0.15% ATR (calm/range-bound), Medium: 0.15-0.35%, High: > 0.35% (volatile/news-driven)
    let regime;
    if (atrPct < 0.0015) {
        regime = 'low';
    } else if (atrPct > 0.0035) {
        regime = 'high';
    } else {
        regime = 'medium';
    }

    // [v18.0] Trend strength detection — blocks mean-reversion in trending markets
    const firstClose = parseFloat(recent[0].c);
    const dirMove = Math.abs(lastClose - firstClose);
    const trendRatio = avgTR > 0 ? dirMove / (avgTR * recent.length) : 0;
    const isTrending = trendRatio > 0.4;

    return {
        regime,
        atrPct: parseFloat((atrPct * 100).toFixed(3)),
        trendRatio: parseFloat(trendRatio.toFixed(3)),
        isTrending,
        adjustments: REGIME_ADJUSTMENTS[regime]
    };
}

// [v3.4] Bullish RSI divergence — price makes a lower low but RSI makes a higher low
// Signals exhaustion of selling pressure and probable reversal — strong entry confirmation
function detectRSIBullishDivergence(bars, lookback = 20) {
    if (bars.length < lookback + 5) return false;
    const window = bars.slice(-lookback);
    const closes = window.map(b => b.c);

    // Find the two lowest price points in window
    let low1Idx = 0, low2Idx = 0;
    for (let i = 1; i < closes.length - 1; i++) {
        if (closes[i] < closes[low1Idx]) { low2Idx = low1Idx; low1Idx = i; }
        else if (closes[i] < closes[low2Idx] && i !== low1Idx) low2Idx = i;
    }
    if (low1Idx === low2Idx) return false;

    // Ensure low1 is earlier, low2 is later
    const earlyIdx = Math.min(low1Idx, low2Idx);
    const lateIdx  = Math.max(low1Idx, low2Idx);
    if (lateIdx - earlyIdx < 3) return false; // Must be separated by at least 3 bars

    // Price must have made a lower low (bearish price structure)
    if (closes[lateIdx] >= closes[earlyIdx]) return false;

    // Calculate RSI at each swing low (need surrounding bars for proper RSI)
    const barsAtEarly = bars.slice(Math.max(0, bars.length - lookback + earlyIdx - 14), bars.length - lookback + earlyIdx + 1);
    const barsAtLate  = bars.slice(Math.max(0, bars.length - lookback + lateIdx - 14),  bars.length - lookback + lateIdx + 1);
    const rsiEarly = calculateRSI(barsAtEarly);
    const rsiLate  = calculateRSI(barsAtLate);

    // RSI must have made a higher low (bullish momentum structure) while price made lower low
    const hasDivergence = rsiLate > rsiEarly + 2; // Require meaningful RSI improvement (2+ pts)
    if (hasDivergence) console.log(`[RSI Divergence] Bullish divergence detected: price ${closes[earlyIdx].toFixed(2)}→${closes[lateIdx].toFixed(2)}, RSI ${rsiEarly.toFixed(1)}→${rsiLate.toFixed(1)}`);
    return hasDivergence;
}

// Calculate VWAP for today's bars
function calculateVWAP(bars) {
    try {
        if (!bars || bars.length === 0) return null;
        let cumulativeTPV = 0;
        let cumulativeVolume = 0;
        let cumulativeTPV2 = 0; // for variance calculation
        for (const bar of bars) {
            const typicalPrice = (bar.h + bar.l + bar.c) / 3;
            cumulativeTPV += typicalPrice * bar.v;
            cumulativeTPV2 += typicalPrice * typicalPrice * bar.v;
            cumulativeVolume += bar.v;
        }
        if (cumulativeVolume <= 0) return null;
        const vwap = cumulativeTPV / cumulativeVolume;
        // [v19.0] VWAP with sigma bands for mean-reversion entries
        const variance = (cumulativeTPV2 / cumulativeVolume) - (vwap * vwap);
        const stdDev = Math.sqrt(Math.max(variance, 0));
        return {
            vwap,
            upperBand: vwap + 1.5 * stdDev,
            lowerBand: vwap - 1.5 * stdDev,
            stdDev
        };
    } catch {
        return null;
    }
}

// ===== STRATEGY BRIDGE =====
// Non-blocking ensemble confirmation — if bridge is offline, local signals are used as-is

// Resolve bridge URL: Railway injects RAILWAY_SERVICE_NEXUS_STRATEGY_BRIDGE_URL automatically
const BRIDGE_URL = (() => {
    const raw = process.env.STRATEGY_BRIDGE_URL
        || process.env.RAILWAY_SERVICE_NEXUS_STRATEGY_BRIDGE_URL
        // v5.0: Railway-aware fallback — on Railway, default to production bridge (was localhost:3010 = unreachable)
        || (process.env.RAILWAY_ENVIRONMENT ? 'https://nexus-strategy-bridge-production.up.railway.app' : 'http://localhost:3010');
    if (raw.startsWith('http')) return raw;
    if (raw.includes('railway.app')) return `https://${raw}`;
    return `http://${raw}`;
})();
console.log(`🤖 Strategy Bridge URL: ${BRIDGE_URL}`);

async function queryStrategyBridge(symbol, bars, assetClass = 'stock') {
    try {
        if (!bars || bars.length < 30) return null; // Bridge needs at least 30 bars
        const prices = bars.map(b => ({
            timestamp: b.t || new Date().toISOString(),
            open: parseFloat(b.o) || 0,
            high: parseFloat(b.h) || 0,
            low:  parseFloat(b.l) || 0,
            close: parseFloat(b.c) || 0,
            volume: parseFloat(b.v) || 0
        }));
        const response = await axios.post(`${BRIDGE_URL}/signal`,
            { symbol, prices, asset_class: assetClass },
            { timeout: 5000 }
        );
        return response.data; // { should_enter, direction, confidence, reason, strategies }
    } catch (e) {
        // Bridge offline or slow — non-blocking, proceed on local signals alone
        return null;
    }
}

// ===== AI TRADE ADVISOR =====
// [v5.0] Agentic AI — Claude-powered trade evaluation via strategy bridge
// HARD GATE: every trade MUST be approved by the agent pipeline. No AI = no trade.
// [v6.3] Agent decision cache — avoids redundant Claude API calls for same symbol
const _stockAgentCache = new Map();
const _STOCK_AGENT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _STOCK_AGENT_CACHE_PRICE_DRIFT = 0.01; // 1% price change invalidates

async function queryAIAdvisor(signal) {
    // Cache key includes direction+tier to prevent collisions between different signal paths
    const cacheKey = `${signal.symbol}:${signal.direction || 'long'}:${signal.tier || 'tier1'}`;
    // Check cache first
    const cached = _stockAgentCache.get(cacheKey);
    if (cached && cached.price > 0) {
        const age = Date.now() - cached.timestamp;
        const priceDrift = Math.abs(signal.price - cached.price) / cached.price;
        if (age < _STOCK_AGENT_CACHE_TTL_MS && priceDrift < _STOCK_AGENT_CACHE_PRICE_DRIFT) {
            // Only reuse REJECTED decisions — approvals must re-evaluate so each trade
            // gets its own decision_run_id (outcome learning loop depends on 1:1 linkage).
            if (cached.result.approved === false) {
                console.log(`[Agent] ${signal.symbol}: using cached REJECTION (${(age / 1000).toFixed(0)}s old)`);
                return { ...cached.result, source: 'cache' };
            }
            console.log(`[Agent] ${signal.symbol}: cache hit but APPROVED — re-evaluating for fresh decision_run_id`);
        }
        _stockAgentCache.delete(cacheKey);
    }

    try {
        const payload = {
            symbol: signal.symbol,
            direction: 'long',
            tier: signal.tier || 'tier1',
            asset_class: 'stock',
            price: signal.price,
            rsi: parseFloat(signal.rsi) || undefined,
            percent_change: parseFloat(signal.percentChange) || undefined,
            volume_ratio: parseFloat(signal.volumeRatio) || undefined,
            regime: signal.regime,
            regime_quality: signal.regimeScore,
            score: signal.score,
            atr_pct: signal.atrPct || undefined,
            vwap: signal.vwap ? parseFloat(signal.vwap) : undefined,
        };
        console.log(`[Agent] Evaluating ${signal.symbol} via ${BRIDGE_URL}/agent/evaluate`);
        const response = await axios.post(`${BRIDGE_URL}/agent/evaluate`, payload, { timeout: 15000 });
        const result = response.data;
        console.log(`[Agent] ${signal.symbol}: ${result.approved ? 'APPROVED' : 'REJECTED'} (source: ${result.source}, conf: ${(result.confidence || 0).toFixed(2)}) — ${result.reason}`);

        // [v15.0] Detect rubber-stamp pass-through from strategy bridge
        const isRubberStamp = result.approved === true
            && result.confidence >= 1.0
            && typeof result.reason === 'string'
            && result.reason.toLowerCase().includes('rule-based');
        if (isRubberStamp) {
            const freshCommittee = computeCommitteeScore(signal);
            result.confidence = freshCommittee.confidence;
            result.reason = `${result.reason} [rubber-stamp: replaced 1.0 with committee ${freshCommittee.confidence.toFixed(2)}]`;
            result.source = 'rule_based_downgraded';
            console.log(`[Agent] ${signal.symbol}: rubber-stamp detected — confidence downgraded to committee:${freshCommittee.confidence.toFixed(2)}`);
        }

        // Cache the result
        _stockAgentCache.set(cacheKey, {
            result,
            price: signal.price,
            timestamp: Date.now(),
        });

        return result;
    } catch (e) {
        // v5.0 HARD GATE: agent offline → BLOCK trade (was fail-open → null → trade proceeds)
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

// [v4.1] Report trade outcome to learning agent for Scan AI pattern tracking
async function reportTradeOutcome(position, exitPrice, pnl, pnlPct, exitReason) {
    try {
        const entryPrice = position.entry || position.entryPrice;
        const rMultiple = position.atrStop
            ? pnl / Math.abs(entryPrice - position.atrStop)
            : pnlPct / (position.config?.stopLoss || 0.07);
        const entryTs = position.entryTime instanceof Date ? position.entryTime.getTime()
            : typeof position.entryTime === 'number' ? position.entryTime : Date.now();
        const holdMinutes = (Date.now() - entryTs) / 60000;
        const payload = {
            symbol: position.symbol,
            asset_class: 'stock',
            direction: 'long',
            tier: position.tier || 'tier1',
            entry_price: entryPrice,
            exit_price: exitPrice,
            pnl: pnl,
            pnl_pct: pnlPct * 100,
            r_multiple: rMultiple,
            hold_duration_minutes: holdMinutes,
            exit_reason: exitReason,
            entry_rsi: position.entryRsi || undefined,
            entry_regime: position.regime || undefined,
            entry_regime_quality: position.regimeScore || undefined,
            entry_momentum: position.entryMomentum || undefined,
            entry_volume_ratio: position.entryVolumeRatio || undefined,
            entry_atr_pct: position.atrPct || undefined,
            entry_score: position.score || undefined,
            agent_approved: position.agentApproved,
            agent_confidence: position.agentConfidence,
            agent_reason: position.agentReason,
            decision_run_id: position.decisionRunId || null,
            bandit_arm: position.banditArm || null,
        };
        await axios.post(`${BRIDGE_URL}/agent/trade-outcome`, payload, { timeout: 5000 });
        console.log(`[Learn] ${position.symbol} outcome reported: ${pnlPct > 0 ? 'WIN' : 'LOSS'} ${(pnlPct * 100).toFixed(1)}%`);
    } catch (e) {
        console.warn(`[Learn] ${position.symbol} outcome report FAILED: ${e.message}`);
    }
}

function canTrade(symbol, side = 'buy') {
    // [Profit Protection] Check if this symbol has a valid re-entry flag (bypasses cooldowns)
    const reentryData = profitProtectReentrySymbols.get(symbol);
    const reentryTime = reentryData ? reentryData.timestamp : null;
    const hasReentryFlag = reentryTime && (Date.now() - reentryTime) < PROFIT_PROTECT_REENTRY_WINDOW;

    // Clean up expired re-entry flags
    if (reentryTime && !hasReentryFlag) {
        profitProtectReentrySymbols.delete(symbol);
    }

    const stopTime = stoppedOutSymbols.get(symbol);
    if (stopTime && !hasReentryFlag) {
        const timeSinceStop = Date.now() - stopTime;
        if (timeSinceStop < MIN_TIME_AFTER_STOP) {
            return false;
        } else {
            stoppedOutSymbols.delete(symbol);
        }
    }

    if (totalTradesToday >= MAX_TRADES_PER_DAY) return false;

    // Re-entry flag bypasses per-symbol limit and time cooldowns
    if (hasReentryFlag) {
        console.log(`[RE-ENTRY] ${symbol}: profit-protect re-entry flag active — bypassing cooldowns`);
        profitProtectReentrySymbols.delete(symbol); // consume the flag
        return true;
    }

    const symbolTrades = tradesPerSymbol.get(symbol) || 0;
    if (symbolTrades >= MAX_TRADES_PER_SYMBOL) return false;

    const recent = recentTrades.get(symbol) || [];
    if (recent.length > 0) {
        const lastTrade = recent[recent.length - 1];
        const timeSince = Date.now() - lastTrade.time;

        if (timeSince < MIN_TIME_BETWEEN_TRADES) return false;
        if (lastTrade.side !== side && timeSince < MIN_TIME_BETWEEN_TRADES * 1.5) return false;
    }

    return true;
}

// [v10.1] Re-entry validation — only allow re-entry if conditions still favor the original direction
function isStockReentryValid(symbol, signal) {
    const reentryData = profitProtectReentrySymbols.get(symbol);
    if (!reentryData) return { valid: true, reason: 'no re-entry flag' };

    const { direction: origDirection } = reentryData;

    // Stock bot is long-only, so direction should always match. But validate anyway.
    const signalDirection = 'long'; // stock bot only buys
    if (signalDirection !== origDirection) {
        console.log(`[RE-ENTRY CHECK] ${symbol}: direction mismatch (was ${origDirection}, now ${signalDirection}) — REJECTED`);
        profitProtectReentrySymbols.delete(symbol);
        return { valid: false, reason: `direction mismatch` };
    }

    // Trend must still be up (EMA crossover or percentChange positive)
    const percentChange = parseFloat(signal.percentChange || 0);
    const trendAligned = percentChange > 0;

    // RSI must not be overbought for longs
    const rsi = parseFloat(signal.rsi || 50);
    const rsiExhausted = rsi > 70;

    // Momentum must still be positive
    const momentumAligned = percentChange > 0;

    const pass = trendAligned && !rsiExhausted && momentumAligned;
    console.log(`[RE-ENTRY CHECK] ${symbol}: trend=${percentChange > 0 ? 'up' : 'down'}(${trendAligned ? 'OK' : 'FAIL'}), rsi=${rsi.toFixed(1)}(${rsiExhausted ? 'EXHAUSTED' : 'OK'}), momentum=${percentChange}%(${momentumAligned ? 'OK' : 'FAIL'}) — ${pass ? 'APPROVED' : 'REJECTED'}`);

    if (!pass) {
        profitProtectReentrySymbols.delete(symbol);
    }
    return { valid: pass, reason: pass ? 'conditions still favorable' : `trend=${!trendAligned ? 'down' : 'ok'}, rsi=${rsiExhausted ? 'overbought' : 'ok'}, momentum=${!momentumAligned ? 'negative' : 'ok'}` };
}

// [v10.1] Entry quality gate — every stock signal must pass before execution
function isStockEntryQualified(signal, committee) {
    const reasons = [];
    const symbol = signal.symbol;
    const direction = 'long'; // stock bot is long-only

    // 1. Signal score must be above minimum threshold
    const score = signal.score || 0;
    if (score <= 0) {
        reasons.push(`score=${score.toFixed(2)} <= 0`);
    }

    // 2. Volume must confirm breakout but not be extreme (chasing spikes = buying tops)
    // Data: vol < 1.5x = 57% WR +$63, vol 1.5-3x = 54% WR +$70, vol 3-10x = 21% WR -$148
    // [v22.0] Added max cap at 10x — extreme volume spikes are institutional exits, not entries
    const volRatio = parseFloat(signal.volumeRatio || 0);
    const isORB = signal.tier === 'orb' || signal.strategy === 'openingRangeBreakout';
    const minVolRatio = isORB ? 1.5 : 1.0;
    const maxVolRatio = 10.0;
    if (volRatio < minVolRatio) {
        reasons.push(`volumeRatio=${volRatio.toFixed(2)} < ${minVolRatio} (${isORB ? 'ORB needs 1.5x' : 'min 1.0x'})`);
    }
    if (volRatio > maxVolRatio) {
        reasons.push(`volumeRatio=${volRatio.toFixed(2)} > ${maxVolRatio} (extreme volume spike — likely buying tops)`);
    }

    // 3. Trend must align with direction (percentChange must be positive for longs)
    const percentChange = parseFloat(signal.percentChange || 0);
    if (percentChange <= 0) {
        reasons.push(`percentChange=${percentChange.toFixed(2)}% not positive`);
    }

    // 4. RSI must be between 40-60 (data: RSI 45-55 = 62% WR +$101, RSI 65+ = 34% WR -$160)
    // [v22.0] Tightened from 30-65 — overbought entries (>60) consistently lose money
    const rsi = parseFloat(signal.rsi || 50);
    if (rsi < 40 || rsi > 60) {
        reasons.push(`rsi=${rsi.toFixed(1)} outside 40-60`);
    }

    // 5. Not entering against a strong move (don't buy after a -3% day)
    if (percentChange < -3) {
        reasons.push(`strong counter-move ${percentChange.toFixed(1)}% (don't buy dips > -3%)`);
    }

    const pass = reasons.length === 0;
    console.log(`[QUALITY GATE] ${symbol} ${direction}: score=${score.toFixed(2)}, volume=${volRatio.toFixed(2)}, rsi=${rsi.toFixed(1)}, change=${percentChange.toFixed(1)}% — ${pass ? 'PASS' : 'FAIL: ' + reasons.join(', ')}`);

    return { qualified: pass, reason: pass ? 'all checks passed' : reasons.join(', ') };
}

// ===== NEW: GET CURRENT MARKET DATA FOR POSITION =====
async function getCurrentMarketData(symbol) {
    try {
        const today = new Date().toISOString().split('T')[0];
        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;

        const barResponse = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: today,
                timeframe: '1Min',
                feed: 'sip',
                limit: 1000
            }
        });

        if (!barResponse.data?.bars || barResponse.data.bars.length === 0) {
            return null;
        }

        const bars = barResponse.data.bars;
        const rsi = calculateRSI(bars);

        // Calculate today's volume and daily high
        const volumeToday = bars.reduce((sum, bar) => sum + bar.v, 0);
        const dailyHigh = Math.max(...bars.map(bar => bar.h));
        const dailyLow = Math.min(...bars.map(bar => bar.l));

        return {
            rsi,
            volumeToday,
            dailyHigh,
            dailyLow,
            bars
        };
    } catch (error) {
        return null;
    }
}

// ===== CHECK IF SHOULD EXIT POSITION =====
// FIX: entryTime was defaulting to new Date() which made holdDays always 0
// FIX: profitTargetByDay values are 0-1 decimals, unrealizedPL is already a % value
async function shouldExitPosition(position, currentPrice, alpacaPos, overrideAlpacaConfig) {
    const _alpacaConfig = overrideAlpacaConfig || alpacaConfig; // eslint-disable-line no-unused-vars
    // Use stored entryTime, or fall back to a safe timestamp (1 day ago as worst case)
    const entryTime = position.entryTime instanceof Date
        ? position.entryTime
        : new Date(position.entryTime || (Date.now() - 24 * 60 * 60 * 1000));
    const holdDays = (Date.now() - entryTime.getTime()) / (1000 * 60 * 60 * 24);

    // unrealizedPL is already a percentage (e.g., 5.09 means +5.09%)
    const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;

    const marketData = await getCurrentMarketData(position.symbol);

    let exitReason = null;

    // 1. TIME-BASED EXITS
    if (holdDays >= EXIT_CONFIG.stalePositionDays) {
        exitReason = `Stale position (${holdDays.toFixed(1)} days - forced exit)`;
    } else if (holdDays >= EXIT_CONFIG.maxHoldDays && unrealizedPL > 0) {
        exitReason = `Max hold time (${holdDays.toFixed(1)} days) - taking ${unrealizedPL.toFixed(2)}% profit`;
    } else if (holdDays >= 5 && unrealizedPL > 1) {
        exitReason = `5+ days old - taking ${unrealizedPL.toFixed(2)}% profit`;
    }

    // 1b. EARLY LOSS CUT — removed in v6.0
    // Old rule: cut at -2% after 1 day. Problem: this tightened the effective stop from
    // tier stop (4-6%) to 2%, destroying R:R. The tier stop loss already handles risk.
    // Positions that are -2% after 1 day still have room to recover within the tier stop.

    // 2. DYNAMIC PROFIT TARGET (FIX: profitTargetByDay is 0.08 = 8%, unrealizedPL is already 5.09 not 0.0509)
    if (!exitReason) {
        const dayIndex = Math.min(Math.floor(holdDays), 7);
        const currentTarget = EXIT_CONFIG.profitTargetByDay[dayIndex] * 100; // Convert to percentage
        if (unrealizedPL >= currentTarget) {
            exitReason = `Hit day-${dayIndex} profit target (${currentTarget.toFixed(1)}%) with ${unrealizedPL.toFixed(2)}%`;
        }
    }

    if (!exitReason && marketData) {
        // 3. RSI OVERBOUGHT - exit only when significantly in profit
        if (marketData.rsi > EXIT_CONFIG.momentumReversal.rsiOverbought && unrealizedPL > 3) {
            exitReason = `Overbought RSI ${marketData.rsi.toFixed(0)} > ${EXIT_CONFIG.momentumReversal.rsiOverbought} with ${unrealizedPL.toFixed(2)}% profit`;
        }

        // 4. VOLUME FADE - only exit if in profit or holding a long time
        if (!exitReason && position.entryVolume && marketData.volumeToday < position.entryVolume * EXIT_CONFIG.momentumReversal.volumeDropPercent) {
            if (unrealizedPL > 2 || holdDays > 3) {
                exitReason = `Volume faded to ${((marketData.volumeToday / position.entryVolume) * 100).toFixed(0)}% of entry - momentum dying`;
            }
        }

        // 5. DAILY HIGH REVERSAL - only exit if in profit (avoid exiting losing positions early)
        if (!exitReason) {
            const dropFromHighPct = ((marketData.dailyHigh - currentPrice) / marketData.dailyHigh) * 100;
            if (dropFromHighPct >= EXIT_CONFIG.momentumReversal.dailyHighDropPercent * 100 && unrealizedPL > 2) {
                exitReason = `Reversed ${dropFromHighPct.toFixed(2)}% from daily high with ${unrealizedPL.toFixed(2)}% profit`;
            }
        }

        // 6. EXIT MANAGER — momentum fade + reversal candle detection
        if (!exitReason && marketData.bars && marketData.bars.length >= 20) {
            const { evaluateExit } = require('../../services/signals/exit-manager');
            const klines = marketData.bars.map(b => ({ open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));
            const exitEval = evaluateExit({
                entryPrice: position.entry,
                currentPrice,
                currentStop: position.stopLoss,
                direction: 'long',
                klines,
            });
            if (exitEval.action === 'exit') {
                exitReason = `Smart Exit: ${exitEval.reason}`;
            } else if (exitEval.action === 'tighten' && exitEval.newStop > position.stopLoss) {
                console.log(`[EXIT-MGR] ${position.symbol}: ${exitEval.reason} — stop raised to $${exitEval.newStop.toFixed(2)}`);
                position.stopLoss = exitEval.newStop;
            }
        }
    }

    return exitReason;
}

// ===== IMPROVED: AGGRESSIVE TRAILING STOPS =====
function updateTrailingStop(position, currentPrice, unrealizedPL) {
    let stopUpdated = false;
    const gainDecimal = unrealizedPL / 100;

    // Find the highest applicable trailing stop level (iterate forward, keep best match)
    let bestLevel = null;
    for (const level of EXIT_CONFIG.trailingStopLevels) {
        if (gainDecimal >= level.gainThreshold) bestLevel = level;
    }

    if (bestLevel) {
        // Calculate new stop (lock in X% of gains)
        const totalGain = currentPrice - position.entry;
        const lockedGain = totalGain * bestLevel.lockPercent;
        const newStop = position.entry + lockedGain;

        if (newStop > position.stopLoss) {
            console.log(`🔒 ${position.symbol}: AGGRESSIVE trailing stop raised to $${newStop.toFixed(2)} (locking in ${(bestLevel.lockPercent * 100).toFixed(0)}% of +${unrealizedPL.toFixed(2)}% gain)`);
            position.stopLoss = newStop;
            stopUpdated = true;
        }
    }

    return stopUpdated;
}

async function managePositions() {
    if (!hasGlobalAlpacaCredentials()) {
        return;
    }
    try {
        const positionsUrl = `${alpacaConfig.baseURL}/v2/positions`;
        const response = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        if (response.data.length === 0) return;

        console.log(`\n📊 Managing ${response.data.length} positions...`);

        for (const alpacaPos of response.data) {
            const symbol = alpacaPos.symbol;
            const currentPrice = parseFloat(alpacaPos.current_price);
            const avgEntry = parseFloat(alpacaPos.avg_entry_price);
            const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;

            let position = positions.get(symbol);
            if (!position) {
                // Position exists on Alpaca but not in our Map (e.g. after restart).
                // Reconstruct with sensible defaults; real entry params are persisted
                // to positions-state.json so this fallback should rarely fire.
                // Use Alpaca's created_at for entryTime — new Date() would make holdDays=0 forever
                // and break all time-based exit logic. Fall back to 1 day ago as a safe estimate.
                const restoredEntry = alpacaPos.created_at
                    ? new Date(alpacaPos.created_at)
                    : new Date(Date.now() - 24 * 60 * 60 * 1000);
                const restoredUnrealizedPL = parseFloat(alpacaPos.unrealized_pl) || 0;
                position = {
                    symbol,
                    entry: avgEntry,
                    shares: parseFloat(alpacaPos.qty),
                    stopLoss: avgEntry * 0.93,
                    target: avgEntry * 1.20,
                    strategy: 'existing',
                    entryTime: restoredEntry,
                    // [Profit Protection] Initialize peak from current state
                    peakUnrealizedPL: Math.max(0, restoredUnrealizedPL),
                    wasPositive: restoredUnrealizedPL > 3
                };
                positions.set(symbol, position);
                savePositions();
            }

            // Calculate hold time
            const holdDays = (Date.now() - position.entryTime.getTime()) / (1000 * 60 * 60 * 24);

            // Update trailing stops (aggressive)
            updateTrailingStop(position, currentPrice, unrealizedPL);

            // ===== PROFIT PROTECTION SYSTEM =====
            // Uses dollar P&L from Alpaca for precise breakeven/drawback tracking
            const unrealizedPLDollar = parseFloat(alpacaPos.unrealized_pl) || 0;

            // Initialize peakUnrealizedPL if missing (e.g. positions from before this feature)
            if (position.peakUnrealizedPL === undefined || position.peakUnrealizedPL === null) {
                position.peakUnrealizedPL = Math.max(0, unrealizedPLDollar);
                position.wasPositive = unrealizedPLDollar > 3;
            }

            // Track peak P&L — only ratchets up, never down
            if (unrealizedPLDollar > position.peakUnrealizedPL) {
                position.peakUnrealizedPL = unrealizedPLDollar;
            }

            // Mark position as "was positive" once it exceeds meaningful threshold (0.5% of position or $8 min)
            const stockPosValue = (position.shares || 1) * currentPrice;
            const stockProfitThreshold = Math.max(20, stockPosValue * 0.015); // [v17.0] was $8/0.5% — too tight, armed on noise
            if (unrealizedPLDollar > stockProfitThreshold && !position.wasPositive) {
                position.wasPositive = true;
                console.log(`[PROFIT-PROTECT] ${symbol}: position now profitable (+$${unrealizedPLDollar.toFixed(2)}, threshold $${stockProfitThreshold.toFixed(2)}) — breakeven lock ARMED`);
            }

            // Breakeven lock: if was profitable but now losing, close immediately
            if (position.wasPositive && unrealizedPLDollar < -5) { // [v17.0] was -$3, too tight for bid-ask noise
                console.log(`[PROFIT-PROTECT] ${symbol}: was +$${position.peakUnrealizedPL.toFixed(2)}, now $${unrealizedPLDollar.toFixed(2)} — closing to protect capital`);
                // Set re-entry flag before closing (stock bot is long-only)
                profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: 'long', entry: position.entryPrice || currentPrice });
                console.log(`[RE-ENTRY] ${symbol} eligible for re-entry (direction: long) after profit-protect close`);
                await closePosition(symbol, alpacaPos.qty, 'Profit Protection - Breakeven Lock');
                continue;
            }

            // Peak drawback protection: if peak > $15 and dropped > 40% from peak, take remaining profit
            if (position.peakUnrealizedPL > 15 && unrealizedPLDollar > 0) {
                const dropFromPeak = position.peakUnrealizedPL - unrealizedPLDollar;
                const dropPct = (dropFromPeak / position.peakUnrealizedPL) * 100;
                if (dropPct > 40) { // [v18.0] was 55% — too loose, let profits bleed. Now protects 60% of peak
                    console.log(`[PROFIT-PROTECT] ${symbol}: peak +$${position.peakUnrealizedPL.toFixed(2)}, now +$${unrealizedPLDollar.toFixed(2)} (${dropPct.toFixed(1)}% drawback) — taking profit`);
                    // Set re-entry flag before closing (stock bot is long-only)
                    profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: 'long', entry: position.entryPrice || currentPrice });
                    console.log(`[RE-ENTRY] ${symbol} eligible for re-entry (direction: long) after profit-protect close`);
                    await closePosition(symbol, alpacaPos.qty, `Profit Protection - ${dropPct.toFixed(0)}% Drawback from Peak`);
                    continue;
                }
            }
            // ===== END PROFIT PROTECTION =====

            // ===== [v18.0] TWO-PHASE TIME STOP (replicates theplus-bot) =====
            // Stock market: Phase 1 at 4 hours (trail to breakeven), Phase 2 at 6.5 hours (full session hard close)
            if (position.entryBars === undefined) position.entryBars = 0;
            position.entryBars++;
            const minutesHeld = position.entryBars;

            // Phase 1: Soft time stop at 240 min (4 hours) — trail to breakeven
            if (minutesHeld >= 240 && !position.timeStopTrailed) {
                position.timeStopTrailed = true;
                if (unrealizedPLDollar > 0) {
                    const beStop = position.entry || (currentPrice - unrealizedPLDollar / (position.shares || 1));
                    if (beStop > position.stopLoss) {
                        position.stopLoss = beStop;
                        console.log(`⏰ [TIME-STOP] ${symbol}: 4h elapsed — stop trailed to BREAKEVEN ($${beStop.toFixed(2)}), P&L +$${unrealizedPLDollar.toFixed(2)}`);
                    }
                } else {
                    console.log(`⏰ [TIME-STOP] ${symbol}: 4h elapsed — P&L $${unrealizedPLDollar.toFixed(2)} (negative), stop unchanged`);
                }
            }

            // Phase 2: Hard time stop at 390 min (6.5 hours = full trading session)
            if (minutesHeld >= 390) {
                console.log(`⏰ [TIME-STOP] ${symbol}: FULL SESSION HARD CLOSE — held ${minutesHeld} min, P&L $${unrealizedPLDollar.toFixed(2)}`);
                profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: 'long', entry: position.entryPrice || currentPrice });
                await closePosition(symbol, alpacaPos.qty, `Time Stop (${minutesHeld} min, P&L $${unrealizedPLDollar.toFixed(2)})`);
                continue;
            }
            // ===== END TIME STOP =====

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)} | Hold: ${holdDays.toFixed(1)}d | Peak: +$${position.peakUnrealizedPL.toFixed(2)}${position.wasPositive ? ' [BEL]' : ''}`);

            // NEW: Check multiple exit conditions
            const exitReason = await shouldExitPosition(position, currentPrice, alpacaPos);

            if (exitReason) {
                console.log(`\n🚪 SMART EXIT: ${symbol} - ${exitReason}`);
                await closePosition(symbol, alpacaPos.qty, exitReason);
                continue;
            }

            // v5.0: 3-minute grace period — new entries get micro-pullback tolerance
            // Data: many stop-outs happen within seconds of entry due to normal volatility
            const holdMinutes = (Date.now() - new Date(position.entryTime).getTime()) / (1000 * 60);
            const gracePeriodActive = holdMinutes < 3;

            // Traditional exits with ENHANCED ALERTS + SMS
            if (currentPrice <= position.stopLoss && !gracePeriodActive) {
                console.log('\n' + '🚨'.repeat(30));
                console.log('║                    STOP LOSS ALERT                    ║');
                console.log('🚨'.repeat(30));
                console.log(`📛 Symbol: ${symbol}`);
                console.log(`💰 Entry Price: $${position.entry.toFixed(2)}`);
                console.log(`📉 Current Price: $${currentPrice.toFixed(2)}`);
                console.log(`🔻 Stop Loss: $${position.stopLoss.toFixed(2)}`);
                console.log(`💸 Loss: ${unrealizedPL.toFixed(2)}%`);
                console.log(`⏰ Time: ${new Date().toLocaleString()}`);
                console.log('🚨'.repeat(30));

                // Send alerts — fire-and-forget so a network failure never blocks the close
                smsAlerts.sendStockStopLoss(symbol, position.entry, currentPrice, unrealizedPL, position.stopLoss)
                    .catch(e => console.warn(`⚠️  SMS stop-loss alert failed: ${e.message}`));
                telegramAlerts.sendStockStopLoss(symbol, position.entry, currentPrice, unrealizedPL, position.stopLoss)
                    .catch(e => console.warn(`⚠️  Telegram stop-loss alert failed: ${e.message}`));

                await closePosition(symbol, alpacaPos.qty, 'Stop Loss');
            } else if (currentPrice >= position.target) {
                console.log('\n' + '🎯'.repeat(30));
                console.log('║                 PROFIT TARGET HIT                     ║');
                console.log('🎯'.repeat(30));
                console.log(`💎 Symbol: ${symbol}`);
                console.log(`💰 Entry Price: $${position.entry.toFixed(2)}`);
                console.log(`📈 Current Price: $${currentPrice.toFixed(2)}`);
                console.log(`🎯 Target Price: $${position.target.toFixed(2)}`);
                console.log(`💵 Profit: +${unrealizedPL.toFixed(2)}%`);
                console.log(`⏰ Time: ${new Date().toLocaleString()}`);
                console.log('🎯'.repeat(30));

                // Send alerts — fire-and-forget so a network failure never blocks the close
                smsAlerts.sendStockTakeProfit(symbol, position.entry, currentPrice, unrealizedPL, position.target)
                    .catch(e => console.warn(`⚠️  SMS take-profit alert failed: ${e.message}`));
                telegramAlerts.sendStockTakeProfit(symbol, position.entry, currentPrice, unrealizedPL, position.target)
                    .catch(e => console.warn(`⚠️  Telegram take-profit alert failed: ${e.message}`));

                await closePosition(symbol, alpacaPos.qty, 'Profit Target');
            }
        }

    } catch (error) {
        console.error('❌ Position management error:', error.message);
    }
}

// [Phase 3.5] Portfolio Risk Engine — cross-bot position correlation and exposure check
// Queries other bots to prevent correlated exposure across the portfolio
async function checkPortfolioRisk() {
    const risks = { totalPositions: 0, totalExposure: 0, warnings: [] };

    // Count local positions
    risks.totalPositions += positions.size;

    // Query forex bot positions
    try {
        const forexRes = await axios.get(`${FOREX_BOT_URL}/api/forex/status`, { timeout: 2000 });
        const forexPositions = forexRes.data?.data?.positions || forexRes.data?.positions || [];
        risks.totalPositions += forexPositions.length;

        // Check USD exposure — if forex is heavily long USD pairs, stock bot should be cautious
        const usdLongs = forexPositions.filter(p =>
            (p.symbol || '').includes('USD') && p.side === 'long'
        ).length;
        if (usdLongs >= 3) {
            risks.warnings.push('Heavy USD long exposure in forex bot');
        }
    } catch { /* forex bot offline — non-blocking */ }

    // Query crypto bot positions
    try {
        const cryptoRes = await axios.get(`${CRYPTO_BOT_URL}/api/crypto/status`, { timeout: 2000 });
        const cryptoPositions = cryptoRes.data?.data?.positions || cryptoRes.data?.positions || [];
        risks.totalPositions += cryptoPositions.length;
    } catch { /* crypto bot offline — non-blocking */ }

    // Portfolio-wide limits
    if (risks.totalPositions >= 12) {
        risks.warnings.push(`Portfolio has ${risks.totalPositions} positions across all bots (limit: 12)`);
    }

    return risks;
}

async function scanMomentumBreakouts() {
    try {
        // Drawdown circuit breaker — block new entries if drawdown limit exceeded
        if (perfData.maxDrawdown >= MAX_DRAWDOWN_PCT) {
            console.log(`🛑 [DRAWDOWN BREAKER] ${perfData.maxDrawdown.toFixed(1)}% >= limit ${MAX_DRAWDOWN_PCT}% — no new entries`);
            perfData.circuitBreakerStatus = 'TRIPPED';
            perfData.circuitBreakerReason = `Max drawdown ${perfData.maxDrawdown.toFixed(1)}% exceeded`;
            return [];
        }
        if (perfData.circuitBreakerStatus === 'TRIPPED' && perfData.maxDrawdown < MAX_DRAWDOWN_PCT * 0.8) {
            perfData.circuitBreakerStatus = 'OK';
            perfData.circuitBreakerReason = null;
            console.log(`✅ [DRAWDOWN BREAKER] Drawdown recovered — trading resumed`);
        }

        // [Phase 3] Detect market regime from SPY bars — refreshes every 5 minutes
        // Applied as position sizing and threshold adjustments throughout the scan
        if (!globalThis._marketRegime || Date.now() - (globalThis._marketRegimeUpdated || 0) > 5 * 60 * 1000) {
            try {
                // [Tier3 Fix] Fetch 200 x 1-min bars so we have enough to build 20+ five-min bars
                const spyBars1m = await fetchBarsWithCache('SPY', alpacaConfig, {
                    start: new Date().toISOString().split('T')[0],
                    timeframe: '1Min',
                    feed: 'sip',
                    limit: 200
                });
                if (spyBars1m && spyBars1m.length > 20) {
                    // Pass 1-min bars to regime detector (ATR-based; fine-grained resolution is OK there)
                    globalThis._marketRegime = detectMarketRegime(spyBars1m);
                    globalThis._marketRegimeUpdated = Date.now();
                    console.log(`[Regime] Market: ${globalThis._marketRegime.adjustments.label} (ATR: ${globalThis._marketRegime.atrPct}%) — size:x${globalThis._marketRegime.adjustments.positionSizeMultiplier} threshold:x${globalThis._marketRegime.adjustments.scoreThresholdMultiplier} maxPos:${globalThis._marketRegime.adjustments.maxPositions}`);

                    // [Tier3 Fix] SPY Trend Hard Gate — aggregate to 5-min bars to reduce noise
                    // SMA20 on 5-min = 100 minutes of trend context (vs noisy 20-minute SMA on 1-min bars)
                    // Momentum: 5-bar lookback on 5-min bars = 25-minute comparison window
                    const spyBars5m = aggregateTo5Min(spyBars1m);
                    if (spyBars5m.length >= 20) {
                        const spyCloses5m = spyBars5m.map(b => b.c);
                        const spyPrice = spyCloses5m[spyCloses5m.length - 1];
                        const spySma20 = spyCloses5m.slice(-20).reduce((a, b) => a + b, 0) / 20;
                        // 5-bar lookback on 5-min bars = 25 minutes of momentum context
                        const spyPrice5Ago = spyCloses5m.length >= 6 ? spyCloses5m[spyCloses5m.length - 6] : spyPrice;
                        const spyRsi = calculateRSI(spyBars5m);
                        const spyHasMomentum = spyPrice > spyPrice5Ago;
                        spyBullish = (spyPrice > spySma20) && spyHasMomentum && (spyRsi > 40);
                        // Also mark bearish on extreme weakness
                        if (spyPrice < spySma20 || spyRsi < 35) spyBullish = false;
                        console.log(`[SPY GATE][5m] SPY $${spyPrice.toFixed(2)} vs SMA20(5m) $${spySma20.toFixed(2)} | RSI(5m) ${spyRsi.toFixed(1)} | Momentum ${spyHasMomentum ? '+' : '-'} [${spyBars5m.length} 5-min bars] -> ${spyBullish ? 'BULLISH' : 'BEARISH'}`);
                    } else {
                        // Not enough 5-min bars yet (early in the session) — fall back gracefully to 1-min
                        const spyCloses1m = spyBars1m.map(b => b.c);
                        const spyPrice = spyCloses1m[spyCloses1m.length - 1];
                        const spySma20 = spyCloses1m.length >= 20
                            ? spyCloses1m.slice(-20).reduce((a, b) => a + b, 0) / 20
                            : null;
                        const spyPrice5Ago = spyCloses1m.length >= 6 ? spyCloses1m[spyCloses1m.length - 6] : spyPrice;
                        const spyRsi = calculateRSI(spyBars1m);
                        const spyHasMomentum = spyPrice > spyPrice5Ago;
                        if (spySma20 !== null) {
                            spyBullish = (spyPrice > spySma20) && spyHasMomentum && (spyRsi > 40);
                            if (spyPrice < spySma20 || spyRsi < 35) spyBullish = false;
                            console.log(`[SPY GATE][1m fallback] SPY $${spyPrice.toFixed(2)} vs SMA20 $${spySma20.toFixed(2)} | RSI ${spyRsi.toFixed(1)} | Momentum ${spyHasMomentum ? '+' : '-'} -> ${spyBullish ? 'BULLISH' : 'BEARISH'}`);
                        }
                    }
                }
            } catch (e) {
                // Non-blocking — use default medium regime
            }
        }
        const regime = globalThis._marketRegime || { regime: 'medium', adjustments: REGIME_ADJUSTMENTS.medium };

        // [Phase 3.5] Portfolio-level risk check (cross-bot)
        const portfolioRisk = await checkPortfolioRisk();
        if (portfolioRisk.totalPositions >= 12) {
            console.log(`[Portfolio Risk] ${portfolioRisk.totalPositions} total positions across all bots — at portfolio limit, skipping new entries`);
            return [];
        }
        if (portfolioRisk.warnings.length > 0) {
            console.log(`[Portfolio Risk] Warnings: ${portfolioRisk.warnings.join('; ')}`);
        }

        // [v11.0] SPY Trend Hard Gate — log status each cycle
        if (!spyBullish) {
            console.log(`[SPY GATE] Market bearish — LONG momentum and ORB entries will be rejected this cycle`);
        }

        const symbols = popularStocks.getAllSymbols();
        console.log(`\n🔍 Momentum Scan: Checking ${symbols.length} stocks... [Regime: ${regime.adjustments.label}${regime.isTrending ? ' TRENDING' : ''}] [SPY: ${spyBullish ? 'BULLISH' : 'BEARISH'}]${regime.isTrending ? ' [MeanRev: BLOCKED]' : ''}`);
        scanDiagnostics._reset();

        const movers = [];
        const batchSize = 20;

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const promises = batch.map(symbol => analyzeMomentum(symbol));
            const results = await Promise.allSettled(promises);

            for (const result of results) {
                if (result.status === 'fulfilled' && result.value) {
                    movers.push(result.value);
                }
            }

            await new Promise(resolve => setTimeout(resolve, 500));
        }

        movers.sort((a, b) => parseFloat(b.percentChange) - parseFloat(a.percentChange));

        scanDiagnostics.signalsFound = movers.length;
        if (movers.length > 0) {
            console.log(`🚀 Found ${movers.length} momentum signals!`);
            for (const mover of movers.slice(0, 5)) {
                console.log(`   📈 ${mover.symbol} [${mover.tier}]: +${mover.percentChange}% | Vol: ${mover.volumeRatio}x | RSI: ${mover.rsi}`);
            }

            // Cap positions based on market regime (low vol: 8, normal: 6, high vol: 4)
            const maxPositions = regime.adjustments.maxPositions;
            if (positions.size < maxPositions) {
                const available = maxPositions - positions.size;
                // Sort: by composite score (tier × momentum × volumeRatio × rsi bonus), desc
                const ranked = movers
                    .filter(m => !positions.has(m.symbol) && canTrade(m.symbol, 'buy'))
                    .sort((a, b) => (b.score || 0) - (a.score || 0));

                // ORB window gets 2 signals/cycle; otherwise 1 (data: ORB = 59% WR, +$85)
                const effectiveMaxSignals = isOpeningRangeBreakoutWindow() ? 2 : MAX_SIGNALS_PER_CYCLE;
                for (const mover of ranked.slice(0, Math.min(available, effectiveMaxSignals))) {
                    // [v14.1] Strategy INACTIVE gate — skip strategies that evaluateStrategies() marked as underperforming
                    const moverStrategy = mover.strategy || (mover.tier === 'orb' ? 'openingRangeBreakout' : 'momentum');
                    const stratStatus = lastStrategyPerf[moverStrategy];
                    if (stratStatus && !stratStatus.active && stratStatus.trades >= 10) {
                        scanDiagnostics._block('strategy_inactive');
                        console.log(`[STRATEGY GATE] ${mover.symbol}: ${moverStrategy} is INACTIVE (WR ${(stratStatus.winRate*100).toFixed(0)}%, PF ${stratStatus.profitFactor.toFixed(2)}, ${stratStatus.trades} trades) — skipping`);
                        continue;
                    }
                    // [v11.0] SPY Trend Gate — block weak LONG entries when SPY is bearish
                    // [v21.0] Softened: allow through strong individual signals (relative strength override)
                    // A stock breaking out on 2x+ volume with high committee confidence likely has a
                    // catalyst independent of the broad market (earnings, news, sector rotation).
                    if (!spyBullish) {
                        const volRatio = parseFloat(mover.volumeRatio || 0);
                        const pctChange = parseFloat(mover.percentChange || 0);
                        const hasRelativeStrength = volRatio >= 2.0 && pctChange >= 3.0;
                        if (!hasRelativeStrength) {
                            scanDiagnostics._block('spy_bearish');
                            console.log(`[SPY GATE] ${mover.symbol}: Market bearish — skipping LONG entry (vol=${volRatio.toFixed(1)}x, chg=${pctChange.toFixed(1)}%)`);
                            continue;
                        }
                        // SAFETY-REVIEWED: relative strength override — strong individual catalyst overrides broad market weakness
                        console.log(`[SPY GATE] ${mover.symbol}: Market bearish but RELATIVE STRENGTH detected (vol=${volRatio.toFixed(1)}x, chg=${pctChange.toFixed(1)}%) — allowing through`);
                    }
                    // [v11.0] ORB daily limit — max 2 ORB trades per day
                    if ((mover.tier === 'orb' || mover.strategy === 'openingRangeBreakout') && orbTradesToday >= 2) {
                        scanDiagnostics._block('orb_limit');
                        console.log(`[ORB LIMIT] ${mover.symbol}: Already ${orbTradesToday} ORB trades today (max 2) — skipping`);
                        continue;
                    }
                    // [v22.0] AI advisor — ADVISORY MODE (data: 17% WR when approved vs 29% overall)
                    // Evaluate for metadata + learning loop, but never block trades.
                    // Kill switch is the only hard gate — protects against catastrophic scenarios.
                    const aiResult = await queryAIAdvisor(mover);
                    if (aiResult.source === 'kill_switch') {
                        scanDiagnostics._block('kill_switch');
                        console.log(`[Agent] ${mover.symbol} KILL SWITCH — ${aiResult.reason}`);
                        telegramAlerts.sendKillSwitchAlert('Stock Bot', aiResult.reason).catch(err => console.warn('[ALERT]', err.message));
                        continue;
                    }
                    // Store metadata for learning loop — approval/rejection is logged but not enforced
                    const srcTag = aiResult.source === 'cache' ? ' (cached)' : '';
                    const agentVerdict = aiResult.approved ? 'AGREES' : 'DISAGREES';
                    console.log(`[Agent] ${mover.symbol} ${agentVerdict}${srcTag} (conf: ${(aiResult.confidence || 0).toFixed(2)}) — ${aiResult.reason}`);
                    mover.agentApproved = aiResult.approved;
                    mover.agentConfidence = aiResult.confidence;
                    mover.agentReason = aiResult.reason;
                    mover.decisionRunId = aiResult.decision_run_id || null;
                    mover.banditArm = aiResult.bandit_arm || 'moderate';
                    if (aiResult.approved && aiResult.position_size_multiplier && aiResult.position_size_multiplier !== 1.0) {
                        mover.agentSizeMultiplier = aiResult.position_size_multiplier;
                    }
                    // [v4.6] Adaptive guardrails — pre-trade quality gate
                    if (guardrails.isPaused) {
                        scanDiagnostics._block('guardrail_paused');
                        console.log(`[Guardrail] ${mover.symbol} BLOCKED — lane paused until ${new Date(guardrails.lanePausedUntil).toLocaleTimeString()}`);
                        continue;
                    }
                    // [Phase 3] Regime-adjusted score threshold — high vol raises the bar, low vol lowers it
                    const regimeScoreThreshold = MIN_SIGNAL_SCORE * regime.adjustments.scoreThresholdMultiplier;
                    if ((mover.score || 0) < regimeScoreThreshold) {
                        scanDiagnostics._block('score_threshold');
                        console.log(`[Guardrail] ${mover.symbol} BLOCKED — score ${(mover.score || 0).toFixed(2)} < ${regimeScoreThreshold.toFixed(2)} (regime: ${regime.adjustments.label})`);
                        continue;
                    }
                    // [v22.0] Agent confidence gate REMOVED — data showed agent approval was anti-predictive (17% WR)
                    // Agent confidence is still logged on position for learning loop analysis
                    // [v4.7] Check reward/risk ratio meets minimum threshold
                    const tierCfg = MOMENTUM_CONFIG[mover.tier] || MOMENTUM_CONFIG.tier1;
                    const rewardRisk = (tierCfg.profitTarget || 0.08) / (tierCfg.stopLoss || 0.04);
                    const effectiveMinRR = optimizedParams?.minRewardRisk || MIN_REWARD_RISK;
                    if (rewardRisk < effectiveMinRR) {
                        scanDiagnostics._block('reward_risk');
                        console.log(`[Guardrail] ${mover.symbol} BLOCKED — R:R ${rewardRisk.toFixed(2)} < ${effectiveMinRR}`);
                        continue;
                    }
                    // [Phase 1] Order flow confirmation — block only when flow actively opposes trade direction
                    if (mover.orderFlowImbalance !== undefined) {
                        const dir = mover.direction || 'long';
                        const ofi = mover.orderFlowImbalance;
                        if ((dir === 'long' && ofi < -0.05) || (dir === 'short' && ofi > 0.05)) {
                            scanDiagnostics._block('order_flow');
                            console.log(`[FILTER] ${mover.symbol}: Order flow opposes ${dir} (imbalance=${ofi.toFixed(2)}), skipping`);
                            continue;
                        }
                    }
                    // [Phase 3] Committee aggregator — unified confidence from all signal sources
                    const committee = computeCommitteeScore(mover);
                    const committeeThreshold = optimizedParams?.committeeThreshold || 0.25; // [v22.0] lowered from 0.40 — absent signals now score 0 not 0.5
                    if (committee.confidence < committeeThreshold) {
                        scanDiagnostics._block('committee_threshold');
                        console.log(`[Committee] ${mover.symbol}: Confidence ${committee.confidence} < ${committeeThreshold} threshold — ${JSON.stringify(committee.components)}`);
                        continue;
                    }
                    // [v11.0] Require 2+ positive components — prevents marginal single-signal entries
                    const positiveComponents = Object.values(committee.components).filter(v => v > 0).length;
                    if (positiveComponents < 2) {
                        scanDiagnostics._block('committee_components');
                        console.log(`[Committee] ${mover.symbol}: Only ${positiveComponents} positive component(s) (need 2+) — ${JSON.stringify(committee.components)}`);
                        continue;
                    }
                    // [Improvement 3] Transaction cost filter — reject negative EV trades
                    if (!isPositiveEV(committee.confidence)) {
                        scanDiagnostics._block('negative_ev');
                        continue;
                    }
                    console.log(`[Committee] ${mover.symbol}: APPROVED conf:${committee.confidence} (${positiveComponents}/6 positive) — momentum:${committee.components.momentum} flow:${committee.components.orderFlow} displacement:${committee.components.displacement} VP:${committee.components.volumeProfile} FVG:${committee.components.fvg}`);
                    mover.committeeConfidence = committee.confidence;
                    mover.committeeComponents = committee.components;
                    // Apply loss-adjusted position sizing
                    if (guardrails.lossSizeMultiplier < 1.0) {
                        mover.agentSizeMultiplier = (mover.agentSizeMultiplier || 1.0) * guardrails.lossSizeMultiplier;
                        console.log(`[Guardrail] ${mover.symbol} size cut to ${mover.agentSizeMultiplier.toFixed(2)}x (${guardrails.consecutiveLosses} consecutive losses)`);
                    }
                    // [Phase 3] Apply market regime adjustments — size and threshold scaling
                    mover.marketRegime = regime.regime;
                    mover.regimeAdjustments = regime.adjustments;
                    mover.agentSizeMultiplier = (mover.agentSizeMultiplier || 1.0) * regime.adjustments.positionSizeMultiplier;
                    if (regime.regime !== 'medium') {
                        console.log(`[Regime] ${mover.symbol} size adjusted to ×${mover.agentSizeMultiplier.toFixed(2)} (${regime.adjustments.label})`);
                    }
                    // [v10.1] Re-entry validation — if this is a re-entry, require extra confirmation
                    if (profitProtectReentrySymbols.has(mover.symbol)) {
                        const reentryCheck = isStockReentryValid(mover.symbol, mover);
                        if (!reentryCheck.valid) {
                            scanDiagnostics._block('reentry_blocked');
                            console.log(`[RE-ENTRY] ${mover.symbol}: re-entry BLOCKED — ${reentryCheck.reason}`);
                            continue;
                        }
                    }
                    // [v10.1] Entry quality gate — final profitability checklist
                    const qualityCheck = isStockEntryQualified(mover, committee);
                    if (!qualityCheck.qualified) {
                        scanDiagnostics._block('quality_gate');
                        console.log(`[QUALITY GATE] ${mover.symbol}: BLOCKED — ${qualityCheck.reason}`);
                        continue;
                    }
                    // [Correlation Guard] Check own-position concentration before executing
                    try {
                        const ownPositions = Array.from(positions.values());
                        const guard = computeCorrelationGuard(ownPositions);
                        if (guard.isConcentrated) {
                            const signalDir = 'long'; // stock bot is long-only
                            if (!guard.canOpenLong) {
                                scanDiagnostics._block('correlation_guard');
                                console.log(`[CORRELATION] ${mover.symbol} ${signalDir} BLOCKED — portfolio ${(guard.exposureRatio * 100).toFixed(0)}% ${guard.directionBias} (${guard.longCount}L/${guard.shortCount}S)`);
                                continue;
                            }
                        }
                    } catch (_guardErr) { /* guard is optional — never block trading on error */ }
                    await executeTrade(mover, mover.strategy || 'momentum');
                }
            } else {
                scanDiagnostics._block('max_positions');
                console.log(`⏸  Max positions (${maxPositions}) reached - not entering new trades`);
            }
        } else {
            console.log(`   No qualifying momentum signals found this scan`);
        }
        scanDiagnostics._save();
        // Log diagnostics summary each cycle
        const blocks = scanDiagnostics.history[scanDiagnostics.history.length - 1];
        if (blocks && blocks.totalBlocked > 0) {
            const topGates = Object.entries(blocks.blocks).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g, c]) => `${g}:${c}`).join(', ');
            console.log(`[DIAGNOSTICS] ${blocks.signals} signals, ${blocks.totalBlocked} blocked — top gates: ${topGates}`);
        }

        return movers;

    } catch (error) {
        console.error('❌ Momentum scan error:', error.message);
        return [];
    }
}

async function analyzeMomentum(symbol, { backtestMode = false } = {}) {
    try {
        // [v11.0] Symbol quality filter — skip banned meme/penny stocks early
        if (BANNED_SYMBOLS.has(symbol)) return null;
        if (!backtestMode && !isGoodTradingTime()) return null;

        // For backtest mode outside market hours, use last 2 trading days so we get bars
        const scanDate = new Date();
        if (backtestMode) {
            // Go back up to 7 calendar days to find a trading day with data
            scanDate.setDate(scanDate.getDate() - 1);
            // Skip weekends
            while (scanDate.getDay() === 0 || scanDate.getDay() === 6) {
                scanDate.setDate(scanDate.getDate() - 1);
            }
        }
        const today = scanDate.toISOString().split('T')[0];
        const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;

        const barResponse = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: today,
                timeframe: '1Min',
                feed: 'sip',
                limit: 10000
            },
            timeout: 12000  // 12s — prevent scan loop from hanging on slow Alpaca responses
        });

        if (!barResponse.data?.bars || barResponse.data.bars.length === 0) return null;

        const bars = barResponse.data.bars;
        const firstBar = bars[0];
        const lastBar = bars[bars.length - 1];

        const todayOpen = firstBar.o;
        const current = lastBar.c;
        const volumeToday = bars.reduce((sum, bar) => sum + bar.v, 0);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const prevDate = yesterday.toISOString().split('T')[0];

        const prevBarResponse = await axios.get(barUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            },
            params: {
                start: prevDate,
                end: prevDate,
                timeframe: '1Day',
                feed: 'sip',
                limit: 1
            },
            timeout: 8000
        });

        const prevVolume = prevBarResponse.data?.bars?.[0]?.v || volumeToday;
        const percentChange = ((current - todayOpen) / todayOpen) * 100;
        const volumeRatio = volumeToday / (prevVolume || 1);

        const rsi = calculateRSI(bars);

        // [v11.0] Minimum price $20 — removes penny stock noise
        if (current < 20) return null;
        if (current > 1000) return null;
        if (volumeToday < 500000) return null;

        // [v19.0] VWAP with sigma bands — used for mean-reversion entries
        const vwapData = calculateVWAP(bars);
        const vwap = vwapData ? vwapData.vwap : null;
        // Relaxed: allow below-VWAP entries for VWAP Reversal strategy (mean-reversion)
        // Old: hard-block all below-VWAP. New: flag it, let individual strategies decide.
        const belowVwap = vwap && current < vwap;

        // [v3.2] EMA 9/21 crossover filter — only enter in confirmed uptrends
        // Converted to a boolean flag so VWAP reclaim can bypass it.
        // Reclaim is a mean-reversion setup that fires during EMA compression.
        const closes = bars.map(b => b.c);
        const ema9 = calculateEMA(closes, 9);
        const ema21 = calculateEMA(closes, 21);
        const emaUptrend = !(ema9 !== null && ema21 !== null && ema9 <= ema21);
        // Momentum + ORB still require emaUptrend; VWAP reclaim does not.
        if (!emaUptrend) { /* fall through — only VWAP reclaim built below */ }

        const atr = calculateATR(bars);
        const atrPct = atr !== null && current > 0 ? atr / current : null;

        const candidates = [];
        const orbCandidate = buildOpeningRangeBreakoutCandidate({
            symbol,
            bars,
            current,
            rsi,
            vwap,
            volumeToday,
            positionsMap: positions,
            atrPct
        });
        if (orbCandidate) candidates.push(orbCandidate);

        let momentumAllowed = emaUptrend;  // [VWAP Reclaim] requires emaUptrend; reclaim does not

        // v5.0: Tightened from 90% to 82%; v14.0: further to 65%
        // Data: 36% WR with 82% filter. Entries above 65% of daily range are chasing extended moves.
        const dailyHigh = Math.max(...bars.map(b => b.h));
        const dailyLow = Math.min(...bars.map(b => b.l));
        const dailyRange = dailyHigh - dailyLow;
        if (dailyRange > 0) {
            const positionInRange = (current - dailyLow) / dailyRange;
            if (positionInRange > 0.65) {
                momentumAllowed = false;
            }
        }

        // v5.0: Raised from 15 → 20 — data shows ADX < 20 entries = noise, not real trends
        // 30% momentum WR is partly caused by entering before trend is established
        const adx = calculateADX(bars);
        if (momentumAllowed && adx !== null && adx < 20) {
            momentumAllowed = false;
        }

        // v5.0: MACD confirmation tightened — require histogram > 0 (truly bullish)
        // Old logic allowed nearly-flat OR RSI divergence override, which caught falling knives
        // Now: only proceed if histogram is positive, OR if BOTH nearly flat AND RSI divergence confirm
        const macd = calculateMACD(bars);
        if (momentumAllowed && macd !== null && !macd.bullish) {
            const nearlyFlat = macd.histogram > -0.001;
            const rsiDivergence = detectRSIBullishDivergence(bars);
            if (nearlyFlat && rsiDivergence) {
                console.log(`[MACD Override] ${symbol} — nearly flat histogram + RSI divergence, proceeding cautiously`);
            } else {
                momentumAllowed = false;
            }
        }

        // [v3.5] Multi-timeframe filter — require intraday momentum to align with daily uptrend
        // Fetch last 20 daily bars; current price must be above 20-day SMA
        // Prevents buying intraday momentum that fights the larger trend
        if (momentumAllowed) {
            try {
                const dailyResp = await axios.get(barUrl, {
                    headers: { 'APCA-API-KEY-ID': alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': alpacaConfig.secretKey },
                    params: { timeframe: '1Day', limit: 20, feed: 'sip' }
                });
                const dailyBars = dailyResp.data?.bars || [];
                if (dailyBars.length >= 5) {
                    // v5.0: Tightened from 3% to 1.5% tolerance — 3% allowed entries far below trend
                    // that were fighting the daily downtrend and hitting stops
                    const lookback = Math.min(9, dailyBars.length);
                    const sma9d = dailyBars.slice(-lookback).map(b => b.c).reduce((a, v) => a + v, 0) / lookback;
                    if (current < sma9d * 0.985) {
                        console.log(`[Daily Filter] ${symbol} below 9-day SMA ($${sma9d.toFixed(2)}) — counter-trend, skipping`);
                        momentumAllowed = false;
                    }
                }
            } catch { /* daily bars unavailable — proceed on intraday signal */ }
        }

        // ATR-based stop/target — adapts to each stock's volatility.
        // Hard cap: ATR stop must not exceed 1.5× the tier's config stopLoss.
        // Without this cap, volatile stocks (ATR 10%+) get stops 2-3x wider than intended,
        // breaking position sizing assumptions (sized for a 4-6% stop, not a 15% stop).
        let atrStop = null, atrTarget = null;
        if (atr !== null && current > 0) {
            let candidateStop = current * (1 - atrPct * 1.5);
            const candidateTarget = current * (1 + atrPct * 3.0);
            // Ensure minimum stop distance of 1.5% to avoid noise hits
            const minStopPrice = current * (1 - 0.015); // 1.5% minimum distance
            if (candidateStop > minStopPrice) {
                candidateStop = minStopPrice; // Widen stop if ATR is too tight
            }
            const rr = candidateStop > 0
                ? (candidateTarget - current) / (current - candidateStop)
                : 0;
            if (rr >= 1.8) {
                atrStop = candidateStop;
                atrTarget = candidateTarget;
            }
            // If R:R too low, fall through to tier config defaults (atrStop stays null)
        }

        // [Tier3] Cross-check stops with shared stop-manager module (diagnostic only — no behavior change)
        // Logs when the shared module's regime-aware stop differs from the inline ATR stop by >0.5%.
        // Data from these logs will inform whether to migrate to the shared module.
        if (atrStop !== null && atrPct !== null && current > 0) {
            try {
                const { computeStops: sharedComputeStops } = require('../../services/signals/stop-manager');
                // Derive a lightweight regime hint from available signal vars (same inputs used later
                // for regimeProfile, but evaluated here so we don't duplicate the full call).
                const earlyRegimeHint = evaluateStockRegimeSignal({
                    strategy: 'momentum',
                    percentChange,
                    volumeRatio,
                    rsi,
                    current,
                    vwap,
                    atrPct
                });
                const regime = earlyRegimeHint?.regime || 'trending';
                const sharedStops = sharedComputeStops(bars, regime, 'long', current);
                if (sharedStops && sharedStops.stopLoss != null) {
                    const sharedStopPct = (current - sharedStops.stopLoss) / current;
                    const inlineStopPct = (current - atrStop) / current;
                    if (Math.abs(sharedStopPct - inlineStopPct) > 0.005) {
                        console.log(`[STOP CROSS-CHECK] ${symbol}: inline=${(inlineStopPct * 100).toFixed(2)}% vs shared=${(sharedStopPct * 100).toFixed(2)}% (regime: ${regime}, atrPct: ${(atrPct * 100).toFixed(2)}%)`);
                    }
                }
            } catch (e) { /* shared stop-manager is optional — never block signal on its failure */ }
        }

        // [Phase 1] Signal quality filters — order flow imbalance and displacement candle
        const orderFlowImbalance = calculateOrderFlowImbalance(bars, 20);
        const hasDisplacement = isDisplacementCandle(bars, atr, 3);

        // [Phase 2] Volume Profile and Fair Value Gap analysis
        const volumeProfile = calculateVolumeProfile(bars, 50);
        const fvg = detectFairValueGaps(bars, 20);

        // ===== [v19.0] VWAP REVERSAL — PRIMARY STRATEGY (backtested 52.69% CAGR, Sharpe 3.48) =====
        // Mean-reversion: buy when price drops below VWAP lower band (1.5σ) with RSI oversold
        // Target: VWAP midline. This is the highest-Sharpe strategy from theplus-bot backtesting.
        let vwapReversalCandidate = null;
        if (vwapData && vwapData.lowerBand && belowVwap && spyBullish) {
            if (current < vwapData.lowerBand && rsi < 40 && volumeRatio >= 0.8) {
                // Need to be above daily SMA50 to confirm structural uptrend (not catching falling knives)
                let aboveSma50 = false;
                try {
                    const dailyResp50 = await axios.get(barUrl, {
                        headers: { 'APCA-API-KEY-ID': alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': alpacaConfig.secretKey },
                        params: { timeframe: '1Day', limit: 55, feed: 'sip' }
                    });
                    const dBars = dailyResp50.data?.bars || [];
                    if (dBars.length >= 50) {
                        const sma50 = dBars.slice(-50).map(b => b.c).reduce((s, v) => s + v, 0) / 50;
                        aboveSma50 = current > sma50;
                    }
                } catch { /* skip if daily bars unavailable */ }

                if (aboveSma50) {
                    const stopLoss = current - (atr * 2.0);
                    const takeProfit = vwap; // Mean reversion target: VWAP midline
                    const risk = current - stopLoss;
                    const reward = takeProfit - current;
                    if (risk > 0 && reward / risk >= 1.5) {
                        const regimeProfile = evaluateStockRegimeSignal({
                            strategy: 'vwapReversal', percentChange, volumeRatio, rsi, current, vwap, atrPct
                        });
                        if (regimeProfile.tradable) {
                            const normOversold = Math.min((40 - rsi) / 20, 1.0);        // RSI distance from 40
                            const normVwapDist = Math.min(Math.abs(current - vwapData.lowerBand) / vwapData.stdDev, 1.0);
                            const normVolume = Math.min(volumeRatio / 2, 1.0);
                            const normRegime = regimeProfile.quality;
                            let score = normOversold * 0.35 + normVwapDist * 0.25 + normVolume * 0.20 + normRegime * 0.20;
                            // VP/FVG bonuses
                            if (volumeProfile) {
                                const distToVAL = Math.abs(current - volumeProfile.val) / current;
                                if (distToVAL < 0.01) score *= 1.12;
                            }
                            if (fvg.bullish.length > 0) score *= 1.08;
                            score *= 1.10; // Priority boost over momentum entries
                            vwapReversalCandidate = {
                                symbol, price: current,
                                percentChange: percentChange.toFixed(2),
                                volumeRatio: volumeRatio.toFixed(2),
                                volume: volumeToday,
                                rsi: rsi.toFixed(2),
                                vwap: vwap ? vwap.toFixed(2) : null,
                                tier: 'tier1',
                                score: parseFloat(score.toFixed(3)),
                                strategy: 'vwapReversal',
                                regime: regimeProfile.regime,
                                regimeScore: regimeProfile.quality,
                                config: MOMENTUM_CONFIG.tier1,
                                entryVolume: volumeToday,
                                atrStop: stopLoss, atrTarget: takeProfit, atrPct,
                                orderFlowImbalance, hasDisplacement,
                                volumeProfile: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                                fvgCount: fvg.bullish.length + fvg.bearish.length,
                                vwapLowerBand: vwapData.lowerBand,
                                vwapUpperBand: vwapData.upperBand
                            };
                            candidates.push(vwapReversalCandidate);
                            console.log(`📊 [VWAP REV] ${symbol}: $${current.toFixed(2)} below VWAP lower band $${vwapData.lowerBand.toFixed(2)} | RSI ${rsi.toFixed(1)} | target: VWAP $${vwap.toFixed(2)} | R:R ${(reward/risk).toFixed(1)} | score ${score.toFixed(3)}`);
                        }
                    }
                }
            }
        }

        // ===== MOMENTUM ENTRIES — DISABLED (30% WR, -$43.84 over 10 trades, Apr 2 2026) =====
        // Data: 3W/7L, avg loss > avg win. ORB is 36.9% WR and nearly breakeven — focus there.
        if (false && momentumAllowed && !vwapReversalCandidate && !belowVwap) {
            // Tier assignment with fallback: start at the highest qualifying tier,
            // fall back to lower tiers if secondary filters (volume ratio, RSI) fail.
            // Prevents a strong Tier3 move from being rejected just because ADX is 16 not 20.
            let tier = null;
            let config = null;

            const tierCandidates = [];
            if (percentChange >= MOMENTUM_CONFIG.tier3.threshold) tierCandidates.push('tier3');
            if (percentChange >= MOMENTUM_CONFIG.tier2.threshold) tierCandidates.push('tier2');
            if (percentChange >= MOMENTUM_CONFIG.tier1.threshold) tierCandidates.push('tier1');

            for (const candidate of tierCandidates) {
                const c = MOMENTUM_CONFIG[candidate];
                if (volumeRatio >= c.volumeRatio &&
                    volumeToday >= c.minVolume &&
                    rsi >= c.rsiMin &&
                    rsi <= c.rsiMax) {
                    tier = candidate;
                    config = c;
                    break; // use the highest qualifying tier
                }
            }

            if (tier && config) {
                const tierPositions = Array.from(positions.values())
                    .filter(p => p.tier === tier).length;

                if (tierPositions < config.maxPositions) {
                    // [v3.3] Strategy Bridge advisory — only block if bridge explicitly signals SHORT with high confidence
                    const bridgeResult = await queryStrategyBridge(symbol, bars, 'stock');
                    if (bridgeResult !== null) {
                        if (bridgeResult.direction === 'short' && bridgeResult.confidence > 0.7) {
                            console.log(`[Bridge] ${symbol} rejected — bridge explicit SHORT conf:${bridgeResult.confidence.toFixed(2)}`);
                        } else {
                            console.log(`[Bridge] ${symbol} advisory: ${bridgeResult.direction} conf:${(bridgeResult.confidence || 0).toFixed(2)}`);
                            const tierMultiplier = { tier1: 1, tier2: 2, tier3: 3 }[tier] || 1;
                            const rsiBonus = rsi >= 45 && rsi <= 65 ? 1.15 : 1.0; // reward "goldilocks" RSI zone
                            const regimeProfile = evaluateStockRegimeSignal({
                                strategy: 'momentum',
                                percentChange,
                                volumeRatio,
                                rsi,
                                current,
                                vwap,
                                atrPct
                            });
                            if (regimeProfile.tradable) {
                                // [Tier3 Fix] Trend-expansion pullback gate: don't chase peaks —
                                // require price to have pulled back at least 1% from the session high.
                                if (regimeProfile.requirePullback) {
                                    const recentHigh = Math.max(...bars.slice(-20).map(b => b.h));
                                    const pullbackFromHigh = (recentHigh - current) / recentHigh;
                                    if (pullbackFromHigh < 0.01) {
                                        console.log(`[REGIME] ${symbol} trend-expansion: waiting for pullback (only ${(pullbackFromHigh * 100).toFixed(2)}% from high)`);
                                        return null;
                                    }
                                }
                                // [Tier3 Fix] Normalized momentum score — prevents chasing the most extended movers.
                                // Raw product (percentChange * volumeRatio * ...) was unbounded and dominated by
                                // percentChange, causing the bot to rank overextended stocks highest. Each core
                                // component is now capped to [0,1] and combined as a weighted average, then
                                // scaled by tierMultiplier. Displacement/VP/FVG bonuses remain multiplicative.
                                const normMomentum = Math.min(Math.abs(parseFloat(percentChange)) / 8, 1.0); // caps at 8% move
                                const normVolume   = Math.min(parseFloat(volumeRatio.toFixed(2)) / 4, 1.0);  // caps at 4× avg volume
                                const normRsi      = rsiBonus > 1.0 ? 1.0 : 0.7;                             // goldilocks RSI zone → 1.0, else 0.7
                                const normRegime   = regimeProfile.quality;                                    // already [0,1]
                                let score = (normMomentum * 0.30 + normVolume * 0.25 + normRsi * 0.25 + normRegime * 0.20) * tierMultiplier;
                                // Displacement candle bonus
                                if (hasDisplacement) {
                                    score *= 1.15; // 15% score bonus for displacement confirmation
                                }

                                // Volume Profile bonus — price near VAL (value) gets a boost
                                if (volumeProfile) {
                                    const distToVAL = Math.abs(current - volumeProfile.val) / current;
                                    const distToVAH = Math.abs(current - volumeProfile.vah) / current;
                                    if (distToVAL < 0.01) {
                                        score *= 1.10; // 10% bonus: buying near value area low (discount zone)
                                    } else if (distToVAH < 0.005) {
                                        score *= 0.90; // 10% penalty: buying near value area high (premium zone)
                                    }
                                }

                                // FVG confirmation bonus — bullish FVG at low-volume node = high conviction
                                if (fvg.bullish.length > 0 && volumeProfile && volumeProfile.lowVolumeNodes.length > 0) {
                                    const hasConfirmedFVG = fvg.bullish.some(gap =>
                                        volumeProfile.lowVolumeNodes.some(node =>
                                            gap.gapMid >= node.pricelow && gap.gapMid <= node.priceHigh
                                        )
                                    );
                                    if (hasConfirmedFVG) {
                                        score *= 1.12; // 12% bonus: FVG at low-volume node = strong institutional footprint
                                    }
                                }

                                candidates.push({
                                    symbol,
                                    price: current,
                                    percentChange: percentChange.toFixed(2),
                                    volumeRatio: volumeRatio.toFixed(2),
                                    volume: volumeToday,
                                    rsi: rsi.toFixed(2),
                                    vwap: vwap ? vwap.toFixed(2) : null,
                                    tier,
                                    score: parseFloat(score.toFixed(3)),
                                    strategy: 'momentum',
                                    regime: regimeProfile.regime,
                                    regimeScore: regimeProfile.quality,
                                    config,
                                    entryVolume: volumeToday,
                                    atrStop,    // [v3.2] ATR-based stop price (null if not applicable)
                                    atrTarget,  // [v3.2] ATR-based target price (null if not applicable)
                                    atrPct,
                                    orderFlowImbalance,
                                    hasDisplacement,
                                    volumeProfile: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                                    fvgCount: fvg.bullish.length + fvg.bearish.length
                                });
                            }
                        }
                    } else {
                        const tierMultiplier = { tier1: 1, tier2: 2, tier3: 3 }[tier] || 1;
                        const rsiBonus = rsi >= 45 && rsi <= 65 ? 1.15 : 1.0;
                        const regimeProfile = evaluateStockRegimeSignal({
                            strategy: 'momentum',
                            percentChange,
                            volumeRatio,
                            rsi,
                            current,
                            vwap,
                            atrPct
                        });
                        if (regimeProfile.tradable) {
                            // [Tier3 Fix] Trend-expansion pullback gate: don't chase peaks —
                            // require price to have pulled back at least 1% from the session high.
                            if (regimeProfile.requirePullback) {
                                const recentHigh = Math.max(...bars.slice(-20).map(b => b.h));
                                const pullbackFromHigh = (recentHigh - current) / recentHigh;
                                if (pullbackFromHigh < 0.01) {
                                    console.log(`[REGIME] ${symbol} trend-expansion: waiting for pullback (only ${(pullbackFromHigh * 100).toFixed(2)}% from high)`);
                                    return null;
                                }
                            }
                            // [Tier3 Fix] Normalized momentum score — prevents chasing the most extended movers.
                            // Raw product (percentChange * volumeRatio * ...) was unbounded and dominated by
                            // percentChange, causing the bot to rank overextended stocks highest. Each core
                            // component is now capped to [0,1] and combined as a weighted average, then
                            // scaled by tierMultiplier. Displacement/VP/FVG bonuses remain multiplicative.
                            const normMomentum = Math.min(Math.abs(parseFloat(percentChange)) / 8, 1.0); // caps at 8% move
                            const normVolume   = Math.min(parseFloat(volumeRatio.toFixed(2)) / 4, 1.0);  // caps at 4× avg volume
                            const normRsi      = rsiBonus > 1.0 ? 1.0 : 0.7;                             // goldilocks RSI zone → 1.0, else 0.7
                            const normRegime   = regimeProfile.quality;                                    // already [0,1]
                            let score = (normMomentum * 0.30 + normVolume * 0.25 + normRsi * 0.25 + normRegime * 0.20) * tierMultiplier;
                            // Displacement candle bonus
                            if (hasDisplacement) {
                                score *= 1.15; // 15% score bonus for displacement confirmation
                            }

                            // Volume Profile bonus — price near VAL (value) gets a boost
                            if (volumeProfile) {
                                const distToVAL = Math.abs(current - volumeProfile.val) / current;
                                const distToVAH = Math.abs(current - volumeProfile.vah) / current;
                                if (distToVAL < 0.01) {
                                    score *= 1.10; // 10% bonus: buying near value area low (discount zone)
                                } else if (distToVAH < 0.005) {
                                    score *= 0.90; // 10% penalty: buying near value area high (premium zone)
                                }
                            }

                            // FVG confirmation bonus — bullish FVG at low-volume node = high conviction
                            if (fvg.bullish.length > 0 && volumeProfile && volumeProfile.lowVolumeNodes.length > 0) {
                                const hasConfirmedFVG = fvg.bullish.some(gap =>
                                    volumeProfile.lowVolumeNodes.some(node =>
                                        gap.gapMid >= node.pricelow && gap.gapMid <= node.priceHigh
                                    )
                                );
                                if (hasConfirmedFVG) {
                                    score *= 1.12; // 12% bonus: FVG at low-volume node = strong institutional footprint
                                }
                            }

                            candidates.push({
                                symbol,
                                price: current,
                                percentChange: percentChange.toFixed(2),
                                volumeRatio: volumeRatio.toFixed(2),
                                volume: volumeToday,
                                rsi: rsi.toFixed(2),
                                vwap: vwap ? vwap.toFixed(2) : null,
                                tier,
                                score: parseFloat(score.toFixed(3)),
                                strategy: 'momentum',
                                regime: regimeProfile.regime,
                                regimeScore: regimeProfile.quality,
                                config,
                                entryVolume: volumeToday,
                                atrStop,
                                atrTarget,
                                atrPct,
                                orderFlowImbalance,
                                hasDisplacement,
                                volumeProfile: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                                fvgCount: fvg.bullish.length + fvg.bearish.length
                            });
                        }
                    }
                }
            }
        }


        // [VWAP Reclaim] — price dropped below VWAP then crossed back above with volume.
        // Research: VWAP trend strategies achieve 2.1 Sharpe on QQQ (2018-2023).
        // This is a lower-priority, mean-reversion entry that fires when price reclaims VWAP
        // with momentum confirmation. It runs even when the EMA uptrend filter fails,
        // because reclaims often happen as price recovers from a brief dip.
        if (vwap > 0 && current > vwap) {
            const vwapDistance = (current - vwap) / vwap;
            // Must be a fresh reclaim: within 0.5% above VWAP — not an extended chase.
            if (vwapDistance >= 0 && vwapDistance <= 0.005) {
                // Confirm price was below VWAP in the last 10 bars (the "dip").
                const recentBelowVwap = bars.slice(-10).some(b => (b.c) < vwap);
                // Require volume confirmation (1.2× avg) and RSI not overbought.
                const numericRsi = parseFloat(rsi);
                if (recentBelowVwap && volumeRatio >= 1.2 && numericRsi < 68) {
                    // Use tier1 config — conservative sizing for this lower-conviction setup.
                    const vwapReclaimConfig = MOMENTUM_CONFIG.tier1;

                    // Check position limit against tier1 cap.
                    const tier1Positions = Array.from(positions.values())
                        .filter(p => p.tier === 'tier1').length;
                    if (tier1Positions < vwapReclaimConfig.maxPositions) {
                        const regimeProfile = evaluateStockRegimeSignal({
                            strategy: 'vwapReclaim',
                            percentChange,
                            volumeRatio,
                            rsi,
                            current,
                            vwap,
                            atrPct
                        });

                        if (regimeProfile.tradable) {
                            // Score components — weighted toward reclaim quality (vwapDistance proximity)
                            // and volume confirmation. Momentum weight is lower: this is mean-reversion.
                            const normVwapProximity = Math.max(0, 1 - vwapDistance / 0.005); // 1.0 at exact VWAP, 0 at 0.5%
                            const normVolume = Math.min(volumeRatio / 4, 1.0);
                            const normRsiScore = numericRsi >= 45 && numericRsi <= 65 ? 1.0 : 0.7;
                            const normRegime = regimeProfile.quality;
                            let score = (normVwapProximity * 0.35 + normVolume * 0.30 + normRsiScore * 0.20 + normRegime * 0.15);

                            // Displacement candle bonus — confirms institutional buying at VWAP.
                            if (hasDisplacement) score *= 1.10;

                            // Volume Profile bonus — reclaim near POC is highest-conviction.
                            if (volumeProfile) {
                                const distToPOC = Math.abs(current - volumeProfile.poc) / current;
                                if (distToPOC < 0.005) score *= 1.12; // near point of control
                            }

                            candidates.push({
                                symbol,
                                price: current,
                                percentChange: percentChange.toFixed(2),
                                volumeRatio: volumeRatio.toFixed(2),
                                volume: volumeToday,
                                rsi: rsi.toFixed(2),
                                vwap: vwap.toFixed(2),
                                tier: 'tier1',
                                score: parseFloat(score.toFixed(3)),
                                strategy: 'vwapReclaim',
                                regime: regimeProfile.regime,
                                regimeScore: regimeProfile.quality,
                                config: vwapReclaimConfig,
                                entryVolume: volumeToday,
                                atrStop,
                                atrTarget,
                                atrPct,
                                orderFlowImbalance,
                                hasDisplacement,
                                volumeProfile: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                                fvgCount: fvg.bullish.length + fvg.bearish.length,
                                vwapDistance: parseFloat(vwapDistance.toFixed(5))
                            });
                            console.log(`[VWAP Reclaim] ${symbol} — reclaimed VWAP ($${vwap.toFixed(2)}) within ${(vwapDistance * 100).toFixed(3)}%, vol ${volumeRatio.toFixed(2)}x, RSI ${numericRsi.toFixed(1)}, score ${score.toFixed(3)}`);
                        }
                    }
                }
            }
        }
        // [RSI(2) Mean Reversion] — buy extreme short-term oversold pullbacks in structural uptrends.
        // Research: 71% win rate on QQQ; works on large-cap stocks trading above their 50-day SMA.
        // Entry: RSI(2) < 15, price above SMA50 (daily) AND above VWAP (intraday uptrend intact).
        // Exit: handled by exit manager (ratchet stops + momentum fade detection).
        // Uses tier1 config for conservative position sizing — this is mean-reversion, not breakout.
        if (bars.length >= 10) {
            const rsi2 = calculateRSI(bars, 2);

            // Fetch daily bars to compute SMA50 — needed to confirm structural uptrend.
            let sma50Daily = null;
            try {
                const dailyResp50 = await axios.get(barUrl, {
                    headers: { 'APCA-API-KEY-ID': alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': alpacaConfig.secretKey },
                    params: { timeframe: '1Day', limit: 55, feed: 'sip' }
                });
                const dBars50 = dailyResp50.data?.bars || [];
                if (dBars50.length >= 50) {
                    sma50Daily = dBars50.slice(-50).map(b => b.c).reduce((s, v) => s + v, 0) / 50;
                }
            } catch { /* daily bars unavailable — skip RSI(2) for this symbol */ }

            if (rsi2 < 15 && sma50Daily !== null && current > sma50Daily && vwap && current > vwap) {
                const rsi2Config = MOMENTUM_CONFIG.tier1;
                const tier1Positions = Array.from(positions.values()).filter(p => p.tier === 'tier1').length;

                if (tier1Positions < rsi2Config.maxPositions) {
                    const regimeProfile = evaluateStockRegimeSignal({
                        strategy: 'rsi2MeanReversion',
                        percentChange,
                        volumeRatio,
                        rsi,
                        current,
                        vwap,
                        atrPct
                    });

                    if (!regimeProfile.tradable) {
                        console.log(`[Regime] ${symbol} RSI(2) MeanRev BLOCKED — ${regimeProfile.regime} (RSI2: ${rsi2.toFixed(1)})`);
                    }
                    if (regimeProfile.tradable) {
                        // Score components — weighted toward how oversold RSI(2) is and structural trend strength.
                        // Volume weight is lower: mean-reversion entries don't require high volume.
                        const normOversold  = Math.min((15 - rsi2) / 15, 1.0);                    // 1.0 at RSI(2)=0, 0 at RSI(2)=15
                        const normTrend     = Math.min((current / sma50Daily - 1) * 10, 1.0);     // % above SMA50, capped at 10%
                        const normVolume    = Math.min(volumeRatio / 3, 1.0);                      // 3× avg volume = max
                        const normRegime    = regimeProfile.quality;
                        let score = normOversold * 0.40 + normTrend * 0.30 + normVolume * 0.15 + normRegime * 0.15;

                        // Volume Profile bonus — price near VAL is a high-conviction mean-reversion entry.
                        if (volumeProfile) {
                            const distToVAL = Math.abs(current - volumeProfile.val) / current;
                            if (distToVAL < 0.01) score *= 1.12; // 12% bonus: buying at value area low
                        }

                        // FVG confirmation bonus — bullish FVG near current price raises conviction.
                        if (fvg.bullish.length > 0) {
                            const nearFVG = fvg.bullish.some(gap =>
                                current >= gap.gapMid * 0.99 && current <= gap.gapMid * 1.01
                            );
                            if (nearFVG) score *= 1.08;
                        }

                        candidates.push({
                            symbol,
                            price: current,
                            percentChange: percentChange.toFixed(2),
                            volumeRatio: volumeRatio.toFixed(2),
                            volume: volumeToday,
                            rsi: rsi.toFixed(2),
                            vwap: vwap ? vwap.toFixed(2) : null,
                            tier: 'tier1',
                            score: parseFloat(score.toFixed(3)),
                            strategy: 'rsi2MeanReversion',
                            regime: regimeProfile.regime,
                            regimeScore: regimeProfile.quality,
                            config: rsi2Config,
                            entryVolume: volumeToday,
                            atrStop,
                            atrTarget,
                            atrPct,
                            orderFlowImbalance,
                            hasDisplacement,
                            volumeProfile: volumeProfile ? { vah: volumeProfile.vah, val: volumeProfile.val, poc: volumeProfile.poc } : null,
                            fvgCount: fvg.bullish.length + fvg.bearish.length,
                            rsi2  // expose for logging / monitoring
                        });
                        console.log(`[RSI(2) MeanRev] ${symbol} — RSI(2) ${rsi2.toFixed(1)} (oversold), price $${current.toFixed(2)} vs SMA50 $${sma50Daily.toFixed(2)} (+${((current / sma50Daily - 1) * 100).toFixed(1)}%), score ${score.toFixed(3)}`);
                    }
                }
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
        return candidates[0];

    } catch (error) {
        return null;
    }
}

async function executeTrade(signal, strategy) {
    try {
        const tier = signal.tier || 'tier1';
        const config = signal.config || MOMENTUM_CONFIG.tier1;

        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const equity = parseFloat(accountResponse.data.equity);
        if (!equity || equity <= 0) {
            console.log(`⚠️  [SKIP] ${signal.symbol}: account equity $${equity} is invalid — skipping trade`);
            return null;
        }

        // Kelly-criterion position sizing — scales with bot performance after 10+ trades.
        // fracKelly is the optimal fraction of equity to risk. We express it as a multiplier
        // relative to config.positionSize so it plugs cleanly into positionSize below.
        // Critically: clamp the multiplier DIRECTLY to [0.25x, 2.0x] — never divide an
        // unclamped fracKelly by positionSize, which can produce 50x+ intermediate values.
        let kellyMultiplier = 1.0;
        if (perfData.totalTrades >= 10 && perfData.winRate > 0 && perfData.profitFactor > 0) {
            const w = perfData.winRate / 100;
            const avgWin  = perfData.totalWinAmount  / Math.max(perfData.winningTrades, 1);
            const avgLoss = perfData.totalLossAmount / Math.max(perfData.losingTrades, 1);
            const b = avgLoss > 0 ? avgWin / avgLoss : 1;
            const fullKelly = (w * b - (1 - w)) / b;        // optimal fraction of equity
            const fracKelly = fullKelly * 0.5;               // 50% Kelly for safety (can be negative)
            // Express as a multiplier: fracKelly / config.positionSize tells us "how many
            // config-sized units to risk". Clamp to [0.0, 2.0] and guard against NaN/Infinity
            // (e.g. if avgLoss=0 or winRate=100%). Floor is 0.0 so negative expectancy = no trade.
            const rawMultiplier = fracKelly > 0 ? fracKelly / config.positionSize : 0.0;
            const safeMultiplier = isFinite(rawMultiplier) && !isNaN(rawMultiplier) ? rawMultiplier : 1.0;
            kellyMultiplier = Math.max(0.0, Math.min(2.0, safeMultiplier));
        }

        // [Tier1 Fix] Kelly says don't trade → don't trade
        if (kellyMultiplier <= 0) {
            console.log(`⚠️  [SKIP] ${signal.symbol}: Kelly multiplier ${kellyMultiplier.toFixed(2)} — negative expectancy, skipping trade`);
            return null;
        }

        // Validate price BEFORE any arithmetic that depends on it
        if (!signal.price || signal.price <= 0) {
            console.log(`⚠️  [SKIP] ${signal.symbol}: invalid price ${signal.price}`);
            return null;
        }

        // [v3.5] Slippage model — market orders typically fill ~0.05% above ask for stocks
        // Adjusts effective entry price so stop/target calculations are realistic
        const STOCK_SLIPPAGE = 0.0005; // 0.05% — conservative estimate for liquid stocks
        const effectiveEntry = signal.price * (1 + STOCK_SLIPPAGE);

        // [v9.0] Monte Carlo position sizing — override Kelly when we have 20+ trade samples
        let mcMultiplier = 1.0;
        if (monteCarloSizer.tradeReturns.length >= 50) {
            const mcResult = monteCarloSizer.optimize();
            const halfKelly = mcResult.halfKelly;
            mcMultiplier = Math.min(halfKelly / 0.01, 2.0); // cap at 2x base
            mcMultiplier = Math.max(mcMultiplier, 0.25);     // floor at 0.25x
            console.log(`[MONTE-CARLO] Using optimized position size: multiplier ${mcMultiplier.toFixed(2)}x (halfKelly: ${(halfKelly * 100).toFixed(1)}%, samples: ${mcResult.sampleSize}, confidence: ${mcResult.confidence})`);
        }

        // [Tier1 Fix] Volatility-adaptive position sizing — equal dollar risk per trade
        // Instead of fixed % of equity, size by: maxRiskDollars / (entryPrice × stopDistance)
        // This equalizes risk whether the stock has 2% or 8% ATR
        const stopLossPct = config.stopLoss || 0.04;
        const atrPct = signal.atrPct || stopLossPct; // fallback to config stop if no ATR
        const dollarRiskPerShare = effectiveEntry * atrPct;
        const maxDollarRisk = equity * RISK_PER_TRADE * kellyMultiplier * mcMultiplier;
        let shares = dollarRiskPerShare > 0 ? Math.floor(maxDollarRisk / dollarRiskPerShare) : 0;
        console.log(`   [VolSize] ${signal.symbol}: atrPct=${(atrPct * 100).toFixed(2)}% | dollarRisk/share=$${dollarRiskPerShare.toFixed(2)} | maxDollarRisk=$${maxDollarRisk.toFixed(0)} | shares=${shares}`);

        // Cap by old fixed % method as upper bound — safety backstop to prevent oversizing
        // (now redundant since we size by risk, but guards against edge cases with tiny ATR)
        const maxSharesByEquity = Math.floor((equity * config.positionSize * kellyMultiplier * mcMultiplier) / effectiveEntry);
        if (shares > maxSharesByEquity) {
            console.log(`   [VolSize] ${signal.symbol}: capped ${shares} → ${maxSharesByEquity} shares (equity % ceiling)`);
            shares = maxSharesByEquity;
        }

        if (shares < 1) {
            console.log(`⚠️  [SKIP] ${signal.symbol}: position too small — 0 shares (atrPct=${(atrPct * 100).toFixed(2)}%, maxDollarRisk=$${maxDollarRisk.toFixed(0)}, price=$${signal.price})`);
            return null;
        }

        // [v12.0] ATR-based stops: 1.5x ATR minimum distance, 3x ATR target for 2:1 R:R
        const atrStopPct = signal.atrPct ? Math.max(config.stopLoss, signal.atrPct * 1.5) : config.stopLoss;
        const atrTargetPct = signal.atrPct ? Math.max(config.profitTarget, signal.atrPct * 3.0) : config.profitTarget;
        const stopPrice = (signal.atrStop || effectiveEntry * (1 - atrStopPct)).toFixed(2);
        const targetPrice = (signal.atrTarget || effectiveEntry * (1 + atrTargetPct)).toFixed(2);
        if (signal.atrPct) console.log(`   [ATR Stops] atrPct=${(signal.atrPct*100).toFixed(2)}% | Stop: ${(atrStopPct*100).toFixed(2)}% ($${stopPrice}) | Target: ${(atrTargetPct*100).toFixed(2)}% ($${targetPrice})`);
        if (kellyMultiplier !== 1.0) console.log(`   [Kelly] Size multiplier: ${kellyMultiplier.toFixed(2)}x (winRate:${perfData.winRate.toFixed(1)}% pf:${perfData.profitFactor.toFixed(2)})`);

        // [v7.0] Update anti-churning state BEFORE API call to prevent race-condition duplicates.
        // If the order succeeds but the response fails (network timeout, etc.), we already
        // consumed the trade slot. On API failure we roll back below.
        totalTradesToday++;
        // [v11.0] Track ORB trades separately for daily limit
        if (tier === 'orb' || strategy === 'openingRangeBreakout') orbTradesToday++;
        tradesPerSymbol.set(signal.symbol, (tradesPerSymbol.get(signal.symbol) || 0) + 1);
        const tradeRecord = {
            time: Date.now(),
            side: 'buy',
            price: signal.price,
            shares,
            tier
        };
        const recent = recentTrades.get(signal.symbol) || [];
        recent.push(tradeRecord);
        if (recent.length > 10) recent.shift();
        recentTrades.set(signal.symbol, recent);

        let orderResponse;
        const orderUrl = `${alpacaConfig.baseURL}/v2/orders`;
        try {
            orderResponse = await axios.post(orderUrl, {
                symbol: signal.symbol,
                qty: shares,
                side: 'buy',
                type: 'market',
                time_in_force: 'day'
            }, {
                headers: {
                    'APCA-API-KEY-ID': alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': alpacaConfig.secretKey
                }
            });
        } catch (orderError) {
            // Rollback anti-churning state on API failure
            totalTradesToday = Math.max(0, totalTradesToday - 1);
            if (tier === 'orb' || strategy === 'openingRangeBreakout') orbTradesToday = Math.max(0, orbTradesToday - 1);
            tradesPerSymbol.set(signal.symbol, Math.max(0, (tradesPerSymbol.get(signal.symbol) || 1) - 1));
            recent.pop();
            console.error(`❌ Order API failed for ${signal.symbol} (anti-churning rolled back):`, orderError.message);
            return null;
        }

        const entryTime = new Date();
        positions.set(signal.symbol, {
            symbol: signal.symbol,
            shares,
            entry: effectiveEntry,                // [v6.3] Use slippage-adjusted entry, matches stop/target calc
            stopLoss: parseFloat(stopPrice),
            target: parseFloat(targetPrice),
            strategy,
            regime: signal.regime,
            tier,
            config,
            entryTime,
            // [Profit Protection] Track peak unrealized P&L for breakeven lock + drawback protection
            peakUnrealizedPL: 0,
            wasPositive: false,
            // [v18.0] Time stop tracking (replicates theplus-bot)
            entryBars: 0,
            timeStopTrailed: false,
            initialRisk: Math.abs(effectiveEntry - parseFloat(stopPrice)),
            entryVolume: signal.entryVolume,
            rsi: signal.rsi,
            vwap: signal.vwap,
            volumeRatio: signal.volumeRatio,
            percentChange: signal.percentChange,
            regimeScore: signal.regimeScore,
            atrPct: signal.atrPct,
            // [v6.1] Persist agent metadata — enables learning loop feedback
            agentApproved: signal.agentApproved || false,
            agentConfidence: signal.agentConfidence || null,
            agentReason: signal.agentReason || null,
            agentSizeMultiplier: signal.agentSizeMultiplier || 1.0,
            decisionRunId: signal.decisionRunId || null,
            banditArm: signal.banditArm || 'moderate',
            // [Phase 4] Signal snapshot for trade evaluation loop
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
            }
        });
        savePositions();

        // Persist trade opening to DB (fire-and-forget)
        dbTradeOpen(signal.symbol, signal.price, shares, config, signal, tier, strategy)
            .then(id => { const p = positions.get(signal.symbol); if (p) p.dbTradeId = id; })
            .catch(e => console.warn('⚠️  DB operation failed:', e?.message || String(e)));

        console.log(`\n✅ TRADE ENTRY: ${signal.symbol} [${tier.toUpperCase()}]`);
        console.log(`   Price: $${signal.price} | Shares: ${shares} | Size: $${(shares * signal.price).toFixed(0)}`);
        console.log(`   Stop: $${stopPrice} (-${(config.stopLoss * 100).toFixed(1)}%) | Target: $${targetPrice} (+${(config.profitTarget * 100).toFixed(1)}%)`);
        console.log(`   RSI: ${signal.rsi} | Volume Ratio: ${signal.volumeRatio}x | Momentum: +${signal.percentChange}%`);
        if (signal.vwap) console.log(`   VWAP: $${signal.vwap} (price ${signal.price > parseFloat(signal.vwap) ? 'ABOVE' : 'BELOW'} VWAP)`);

        // Send entry alert — fire-and-forget so a network failure never aborts the trade record
        telegramAlerts.sendStockEntry(signal.symbol, signal.price, parseFloat(stopPrice), parseFloat(targetPrice), shares, tier)
            .catch(e => console.warn(`⚠️  Telegram entry alert failed: ${e.message}`));

        // [v21.0] Report execution to strategy bridge learning loop
        axios.post(`${BRIDGE_URL}/agent/execution`, {
            symbol: signal.symbol,
            asset_class: 'stock',
            direction: 'long',
            tier,
            decision_run_id: signal.decisionRunId || null,
            fill_price: effectiveEntry,
            intended_price: signal.price,
            quantity: shares,
            position_size_usd: shares * effectiveEntry,
            strategy,
            agent_approved: signal.agentApproved || false,
            agent_confidence: signal.agentConfidence || null,
        }, { timeout: 5000 }).then(() => {
            console.log(`[Learn] ${signal.symbol} execution reported to bridge`);
        }).catch(e => console.warn(`[Learn] ${signal.symbol} execution report failed: ${e.message}`));

        return orderResponse.data;

    } catch (error) {
        console.error(`❌ Trade execution failed for ${signal.symbol}:`, error.message);
        return null;
    }
}

async function closePosition(symbol, qty, reason = 'Manual') {
    try {
        // Get current price for P&L recording before closing
        let currentPrice = null;
        const position = positions.get(symbol);

        // FIX 1 & 2: Capture snapshot and positionCopy BEFORE any async/fallible operations,
        // then delete from Map EARLY so the position is never stuck if downstream steps throw.
        const positionCopy = position ? { ...position } : null;
        const snapshot = position ? (position.signalSnapshot ? { ...position.signalSnapshot } : null) : null;

        // CRITICAL: Delete from Map immediately — prevents stuck positions even if
        // DB operations, evaluation, or savePositions fail below.
        positions.delete(symbol);

        try {
            const posUrl = `${alpacaConfig.baseURL}/v2/positions/${symbol}`;
            const posRes = await axios.get(posUrl, {
                headers: {
                    'APCA-API-KEY-ID': alpacaConfig.apiKey,
                    'APCA-API-SECRET-KEY': alpacaConfig.secretKey
                }
            });
            currentPrice = parseFloat(posRes.data.current_price);
        } catch (e) {
            // Not critical - just can't record P&L
        }

        // Crypto assets need 'gtc' time-in-force; stocks use 'day'
        const isCrypto = /USD$/.test(symbol) && symbol.length <= 8;
        const orderUrl = `${alpacaConfig.baseURL}/v2/orders`;
        await axios.post(orderUrl, {
            symbol,
            qty: parseFloat(qty),   // Alpaca requires a number, not a string
            side: 'sell',
            type: 'market',
            time_in_force: isCrypto ? 'gtc' : 'day'
        }, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        console.log(`✅ Position closed: ${symbol} (${reason})`);

        const tradeRecord = { time: Date.now(), side: 'sell', reason };
        const recent = recentTrades.get(symbol) || [];
        recent.push(tradeRecord);
        if (recent.length > 10) recent.shift();
        recentTrades.set(symbol, recent);

        // Stop-loss cooldown: prevents re-entering a losing symbol too quickly
        if (reason && (reason.includes('Stop') || reason.toLowerCase().includes('stop loss'))) {
            stoppedOutSymbols.set(symbol, Date.now());
            console.log(`⏸  ${symbol} in stop-loss cooldown for 1 hour`);
        }

        // DB / eval operations use positionCopy and snapshot (captured before deletion).
        // Wrapped in try-catch so failures here never affect position lifecycle.
        try {
            // Record performance data — apply exit slippage (market sell fills ~0.05% below bid)
            if (positionCopy && currentPrice) {
                const STOCK_EXIT_SLIPPAGE = 0.0005; // 0.05% — matches entry slippage assumption
                const adjustedExitPrice = currentPrice * (1 - STOCK_EXIT_SLIPPAGE);
                const closeMetrics = resolveClosedTradeMetrics(positionCopy, qty, adjustedExitPrice);
                if (closeMetrics) {
                    recordTradeClose(symbol, closeMetrics.entryPrice, closeMetrics.exitPrice, closeMetrics.shares, reason);
                    // [v17.1] Store decimal pnlPct in DB (0.05 = 5%), not percentage (5.0)
                    // resolveClosedTradeMetrics returns percentage (*100), divide back to decimal
                    const pnlPctDecimal = closeMetrics.pnlPct / 100;
                    dbTradeClose(positionCopy?.dbTradeId, closeMetrics.exitPrice, closeMetrics.pnlUsd, pnlPctDecimal, reason).catch(e => console.warn('⚠️  DB operation failed:', e?.message || String(e)));
                    // [v4.1] Report to Agentic AI learning loop — Scan AI pattern tracking
                    reportTradeOutcome(positionCopy, closeMetrics.exitPrice, closeMetrics.pnlUsd, pnlPctDecimal, reason).catch(e => console.warn('⚠️  DB operation failed:', e?.message || String(e)));
                        // [v4.6] Feed outcome into adaptive guardrails
                        guardrails.recordOutcome(closeMetrics.pnlUsd > 0);
                } else {
                    console.warn(`⚠️ Skipping stock DB close write for ${symbol}: unresolved close metrics`);
                }
            }

            // [Phase 4] Trade evaluation — log signal effectiveness for weight optimization
            // FIX 2: Uses pre-captured snapshot so evaluation works even if position was
            // already removed from the Map (e.g. race condition or re-entrant close).
            if (snapshot) {
                // [v17.1] Use closeMetrics when available for consistent pnl values
                const evalExitPrice = closeMetrics ? closeMetrics.exitPrice : (currentPrice || 0);
                const evalPnl = closeMetrics ? closeMetrics.pnlUsd : (currentPrice ? (currentPrice - positionCopy.entry) * parseFloat(qty) : 0);
                const evalPnlPct = closeMetrics ? closeMetrics.pnlPct / 100 : ((currentPrice && positionCopy.entry) ? (currentPrice - positionCopy.entry) / positionCopy.entry : 0);
                const outcome = {
                    symbol: positionCopy.symbol || symbol,
                    direction: positionCopy.direction || 'long',
                    strategy: positionCopy.strategy || (positionCopy.tier === 'orb' ? 'openingRangeBreakout' : 'momentum'),
                    tier: positionCopy.tier || 'tier1',
                    entryPrice: positionCopy.entry,
                    exitPrice: evalExitPrice,
                    pnl: evalPnl,
                    pnlPct: evalPnlPct,
                    holdTimeMs: Date.now() - (snapshot.timestamp || positionCopy.entryTime?.getTime?.() || Date.now()),
                    signals: {
                        orderFlow: snapshot.orderFlowImbalance,
                        displacement: snapshot.hasDisplacement,
                        vpPosition: snapshot.volumeProfile,
                        fvgCount: snapshot.fvgCount,
                        committeeConfidence: snapshot.committeeConfidence,
                        components: snapshot.committeeComponents,
                        regime: snapshot.marketRegime,
                        score: snapshot.score
                    },
                    exitReason: reason || 'unknown',
                    timestamp: Date.now()
                };

                if (!globalThis._tradeEvaluations) globalThis._tradeEvaluations = [];
                globalThis._tradeEvaluations.push(outcome);
                if (globalThis._tradeEvaluations.length > 500) {
                    globalThis._tradeEvaluations = globalThis._tradeEvaluations.slice(-500);
                }
                // [Improvement 1] Persist to disk (saveEvaluations keeps last 500)
                saveEvaluations(globalThis._tradeEvaluations);

                const winLoss = evalPnl >= 0 ? 'WIN' : 'LOSS';
                console.log(`[Evaluation] ${outcome.symbol} ${winLoss} ${evalPnlPct >= 0 ? '+' : ''}${(evalPnlPct * 100).toFixed(2)}% — committee:${snapshot.committeeConfidence?.toFixed?.(3) || snapshot.committeeConfidence || 'N/A'} flow:${snapshot.orderFlowImbalance?.toFixed?.(2) || '?'} displacement:${snapshot.hasDisplacement} regime:${snapshot.marketRegime}`);
            }
        } catch (evalError) {
            console.error(`[ClosePosition] Post-close operations failed for ${symbol}:`, evalError.message);
        }

        savePositions();
        savePerfData();

    } catch (error) {
        console.error(`❌ Error closing ${symbol}:`, error.message);
        // Ensure position is removed from Map even if Alpaca order submission fails,
        // so the bot is not permanently blocked from re-entering this symbol.
        positions.delete(symbol);
    }
}

// [Phase 4] Trade evaluation summary endpoint
app.get('/api/trading/evaluations', (req, res) => {
    const rawEvals = (globalThis._tradeEvaluations || []).filter(e => e.exitReason !== 'orphaned_restart');
    if (rawEvals.length === 0) {
        return res.json({ success: true, data: { totalTrades: 0, message: 'No evaluations yet' } });
    }

    // [v17.1] After DB migration, pnl_pct is decimal. Safety guard for any stragglers.
    const evals = rawEvals.map(e => {
        let pnlPct = e.pnlPct || 0;
        if (Math.abs(pnlPct) > 2) pnlPct = pnlPct / 100; // >200% per trade = clearly percentage not decimal
        return { ...e, pnlPct };
    });

    const wins = evals.filter(e => e.pnl > 0);
    const losses = evals.filter(e => e.pnl <= 0);

    // Signal effectiveness: average P&L when signal was present vs absent
    const signalEffectiveness = {};
    const signals = ['orderFlow', 'displacement', 'fvgCount'];
    for (const sig of signals) {
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

        const avgPnlWith = withSignal.length > 0 ? withSignal.reduce((s, e) => s + (e.pnlPct || 0), 0) / withSignal.length : 0;
        const avgPnlWithout = withoutSignal.length > 0 ? withoutSignal.reduce((s, e) => s + (e.pnlPct || 0), 0) / withoutSignal.length : 0;

        signalEffectiveness[sig] = {
            withSignal: { count: withSignal.length, avgPnlPct: parseFloat((avgPnlWith * 100).toFixed(3)) },
            withoutSignal: { count: withoutSignal.length, avgPnlPct: parseFloat((avgPnlWithout * 100).toFixed(3)) },
            edge: parseFloat(((avgPnlWith - avgPnlWithout) * 100).toFixed(3))
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
createSignalEndpoints(app, 'trading', 'stock',
  () => globalThis._tradeEvaluations || [],
  () => BOT_COMPONENTS.stock.components
);

// [Improvement 2] Committee weights endpoint
app.get('/api/trading/weights', (req, res) => {
    res.json({
        success: true,
        data: {
            weights: committeeWeights,
            defaults: DEFAULT_WEIGHTS,
            tradeCount: (globalThis._tradeEvaluations || []).length,
            lastOptimized: 'check weights file'
        }
    });
});

// Scan diagnostics — shows which gates are blocking trades
app.get('/api/scan/diagnostics', (req, res) => {
    const latest = scanDiagnostics.history[scanDiagnostics.history.length - 1] || null;
    // Aggregate gate blocks across last 10 cycles
    const aggregated = {};
    let totalSignals = 0;
    for (const cycle of scanDiagnostics.history) {
        totalSignals += cycle.signals;
        for (const [gate, count] of Object.entries(cycle.blocks)) {
            aggregated[gate] = (aggregated[gate] || 0) + count;
        }
    }
    res.json({
        success: true,
        spyBullish,
        botRunning,
        botPaused,
        lastCycle: latest,
        recentCycles: scanDiagnostics.history.length,
        aggregated: Object.entries(aggregated)
            .sort((a, b) => b[1] - a[1])
            .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {}),
        totalSignalsScanned: totalSignals,
    });
});

// API Routes (same as before)
app.get('/api/trading/status', async (req, res) => {
    if (!hasGlobalAlpacaCredentials()) {
        return res.json({
            success: true,
            data: {
                isRunning: botRunning,
                mode: 'PAPER',
                credentialsRequired: true,
                account: { equity: 0, cash: 0, buyingPower: 0 },
                performance: { totalTrades: totalTradesToday, winRate: 0, profitFactor: 0, activePositions: 0 },
                positions: [],
                portfolioValue: 0,
                dailyPnL: 0,
                lastUpdate: lastScanTime
            }
        });
    }
    try {
        const positionsUrl = `${alpacaConfig.baseURL}/v2/positions`;
        const positionsResponse = await axios.get(positionsUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const account = accountResponse.data;
        const equity = parseFloat(account.equity);
        const lastEquity = parseFloat(account.last_equity);
        cachedDailyPnL = equity - lastEquity;  // update circuit breaker cache
        cachedAccountEquity = equity;  // [v19.1] keep equity current from broker

        const positionsData = positionsResponse.data.map(pos => {
            const tracked = positions.get(pos.symbol);
            const entryTime = tracked?.entryTime instanceof Date
                ? tracked.entryTime.getTime()
                : (tracked?.entryTime ? new Date(tracked.entryTime).getTime() : null);
            return {
                id: pos.asset_id || pos.symbol,
                symbol: pos.symbol,
                side: pos.side || 'long',
                quantity: parseFloat(pos.qty),
                entryPrice: parseFloat(pos.avg_entry_price),
                currentPrice: parseFloat(pos.current_price),
                unrealizedPnL: parseFloat(pos.unrealized_pl),
                pnl: parseFloat(pos.unrealized_pl),
                strategy: tracked?.strategy || 'improved-unified',
                openTime: entryTime,
                confidence: tracked?.agentConfidence || null,
                agentApproved: tracked?.agentApproved || false,
                agentReason: tracked?.agentReason || null
            };
        });

        // Update perf data with live equity
        perfData.activePositions = positionsData.length;
        savePerfData();

        // If global perfData shows 0 trades, hydrate ALL fields from DB
        if (perfData.totalTrades === 0 && dbPool) {
            try {
                const cleanPnl = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN NULL ELSE pnl_usd END`;
                const dbStats = await dbPool.query(`
                    SELECT
                        COUNT(*) FILTER (WHERE status='closed') AS total,
                        COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} > 0) AS winners,
                        COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} <= 0) AS losers,
                        COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed'), 0)::FLOAT AS total_pnl,
                        COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed' AND ${cleanPnl} > 0), 0)::FLOAT AS win_amount,
                        COALESCE(ABS(SUM(${cleanPnl}) FILTER (WHERE status='closed' AND ${cleanPnl} < 0)), 0)::FLOAT AS loss_amount,
                        COUNT(*) FILTER (WHERE status='open') AS open_count
                    FROM trades WHERE bot='stock'
                `);
                const row = dbStats.rows[0];
                const total = parseInt(row.total) || 0;
                const winners = parseInt(row.winners) || 0;
                const losers = parseInt(row.losers) || 0;
                const winAmt = parseFloat(row.win_amount) || 0;
                const lossAmt = parseFloat(row.loss_amount) || 0;
                if (total > 0) {
                    perfData.totalTrades = total;
                    perfData.winningTrades = winners;
                    perfData.losingTrades = losers;
                    perfData.winRate = parseFloat(((winners / total) * 100).toFixed(1));
                    perfData.totalProfit = parseFloat(row.total_pnl) || 0;
                    perfData.totalWinAmount = winAmt;
                    perfData.totalLossAmount = lossAmt;
                    perfData.profitFactor = total < 5 ? 0
                        : lossAmt > 0 ? parseFloat((winAmt / lossAmt).toFixed(2))
                        : winAmt > 0 ? 9.99 : 0;
                }
                // Compute consecutive losses from most recent trades
                const recent = await dbPool.query(`
                    SELECT ${cleanPnl} AS pnl FROM trades
                    WHERE bot='stock' AND status='closed' AND ${cleanPnl} IS NOT NULL
                    ORDER BY exit_time DESC NULLS LAST LIMIT 50
                `);
                let consec = 0, maxConsec = 0;
                for (const r of recent.rows) {
                    if (parseFloat(r.pnl) <= 0) { consec++; maxConsec = Math.max(maxConsec, consec); }
                    else break; // stop at first win (counting from most recent)
                }
                // Also scan full sequence for max consecutive
                let runConsec = 0;
                for (const r of recent.rows) {
                    if (parseFloat(r.pnl) <= 0) { runConsec++; maxConsec = Math.max(maxConsec, runConsec); }
                    else runConsec = 0;
                }
                perfData.consecutiveLosses = consec;
                perfData.maxConsecutiveLosses = Math.max(perfData.maxConsecutiveLosses, maxConsec);
            } catch (e) { console.warn('DB perfData hydration failed:', e.message); }
        }

        // Flat response matching StockBotPage BotStatus interface
        res.json({
            isRunning: botRunning,
            isPaused: botPaused,
            mode: 'PAPER',
            equity,
            dailyReturn: (lastEquity > 0) ? ((equity - lastEquity) / lastEquity) * 100 : 0,
            positions: positionsData,
            stats: {
                totalTrades: perfData.totalTrades,
                winners: perfData.winningTrades,
                losers: perfData.losingTrades,
                totalPnL: perfData.totalProfit,
                totalWinAmount: perfData.totalWinAmount,
                totalLossAmount: perfData.totalLossAmount,
                maxDrawdown: perfData.maxDrawdown,
                winRate: parseFloat(perfData.winRate.toFixed(1)),
                profitFactor: parseFloat(perfData.profitFactor.toFixed(2)),
                totalTradesToday
            },
            config: {
                symbols: popularStocks.getAllSymbols(),
                maxPositions: MOMENTUM_CONFIG.tier1.maxPositions,
                stopLoss: MOMENTUM_CONFIG.tier1.stopLoss * 100,
                profitTarget: MOMENTUM_CONFIG.tier1.profitTarget * 100,
                dailyLossLimit: MAX_DAILY_LOSS
            },
            guardrails: {
                consecutiveLosses: guardrails.consecutiveLosses,
                recentWinRate: guardrails.recentWinRate.toFixed(2),
                lanePaused: guardrails.isPaused,
                lanePausedUntil: guardrails.isPaused ? new Date(guardrails.lanePausedUntil).toISOString() : null,
                lossSizeMultiplier: guardrails.lossSizeMultiplier,
                todayWins: guardrails.totalWinsToday,
                todayLosses: guardrails.totalLossesToday,
            },
            // v5.0: Agent pipeline status
            agentPipeline: {
                bridgeUrl: BRIDGE_URL,
                hardGate: true,
                note: 'All trades require AI approval since v5.0',
            },
            portfolioValue: equity,
            dailyPnL: equity - lastEquity,
            lastUpdate: lastScanTime,
            // Keep nested data for other consumers (api.ts)
            data: {
                isRunning: botRunning,
                performance: {
                    totalTrades: perfData.totalTrades,
                    totalTradesToday,
                    activePositions: positionsData.length,
                    totalProfit: perfData.totalProfit,
                    winRate: parseFloat(perfData.winRate.toFixed(1)),
                    profitFactor: parseFloat(perfData.profitFactor.toFixed(2)),
                    winningTrades: perfData.winningTrades,
                    losingTrades: perfData.losingTrades,
                    consecutiveLosses: perfData.consecutiveLosses
                },
                positions: positionsData,
                portfolioValue: equity,
                dailyPnL: equity - lastEquity,
                lastUpdate: lastScanTime
            }
        });

    } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            return res.json({
                success: true,
                data: {
                    isRunning: botRunning,
                    mode: 'PAPER',
                    credentialsRequired: true,
                    account: { equity: 0, cash: 0, buyingPower: 0 },
                    performance: { totalTrades: totalTradesToday, winRate: 0, profitFactor: 0, activePositions: 0 },
                    positions: [],
                    portfolioValue: 0,
                    dailyPnL: 0,
                    lastUpdate: lastScanTime
                }
            });
        }
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ── Per-user engine status (JWT-scoped) ──────────────────────────────────────
app.get('/api/trading/engine/status', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const engine = await getOrCreateEngine(userId);
    if (!engine) {
        return res.json({ success: true, credentialsRequired: true,
            message: 'No Alpaca credentials configured — visit Settings to add your API keys' });
    }
    try {
        const response = await axios.get(`${engine.alpacaConfig.baseURL}/v2/positions`, {
            headers: { 'APCA-API-KEY-ID': engine.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': engine.alpacaConfig.secretKey }
        });
        const accountResponse = await axios.get(`${engine.alpacaConfig.baseURL}/v2/account`, {
            headers: { 'APCA-API-KEY-ID': engine.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': engine.alpacaConfig.secretKey }
        });
        const account = accountResponse.data;
        const equity = parseFloat(account.equity);
        const lastEquity = parseFloat(account.last_equity);
        engine.cachedDailyPnL = equity - lastEquity;
        const positionsData = response.data.map(pos => {
            const tracked = engine.positions.get(pos.symbol);
            return {
                id: pos.asset_id || pos.symbol, symbol: pos.symbol, side: pos.side || 'long',
                quantity: parseFloat(pos.qty), entryPrice: parseFloat(pos.avg_entry_price),
                currentPrice: parseFloat(pos.current_price), unrealizedPnL: parseFloat(pos.unrealized_pl),
                pnl: parseFloat(pos.unrealized_pl),
                openTime: tracked?.entryTime instanceof Date ? tracked.entryTime.getTime() : null
            };
        });
        res.json({
            success: true, isRunning: engine.botRunning, isPaused: engine.botPaused,
            mode: 'PAPER', equity, dailyReturn: lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0,
            positions: positionsData, stats: {
                totalTrades: engine.perfData.totalTrades, winners: engine.perfData.winningTrades,
                losers: engine.perfData.losingTrades, totalPnL: engine.perfData.totalProfit,
                winRate: parseFloat(engine.perfData.winRate.toFixed(1)),
                profitFactor: parseFloat(engine.perfData.profitFactor.toFixed(2)),
                totalTradesToday: engine.totalTradesToday
            }, portfolioValue: equity, dailyPnL: equity - lastEquity, lastUpdate: engine.lastScanTime
        });
    } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            return res.json({ success: true, credentialsRequired: true,
                message: 'Alpaca credentials invalid or expired' });
        }
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/trading/engine/start', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const engine = await getOrCreateEngine(userId);
    if (!engine) return res.status(404).json({ success: false, error: 'No engine found — configure credentials first' });
    try {
        await axios.get(`${engine.alpacaConfig.baseURL}/v2/account`, {
            headers: {
                'APCA-API-KEY-ID': engine.alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': engine.alpacaConfig.secretKey
            }
        });
    } catch (error) {
        const status = error?.response?.status;
        if (status === 401 || status === 403) {
            return res.status(400).json({ success: false, error: 'Alpaca credentials invalid or expired' });
        }
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
    engine.botRunning = true; engine.botPaused = false; engine.savePerfData();
    res.json({ success: true, isRunning: true, isPaused: false });
});

app.post('/api/trading/engine/stop', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const engine = engineRegistry.get(String(userId));
    if (!engine) return res.status(404).json({ success: false, error: 'Engine not found' });
    engine.botRunning = false; engine.botPaused = false; engine.savePerfData();
    res.json({ success: true, isRunning: false, isPaused: false });
});

app.post('/api/trading/engine/pause', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const engine = engineRegistry.get(String(userId));
    if (!engine) return res.status(404).json({ success: false, error: 'Engine not found' });
    engine.botPaused = !engine.botPaused; engine.savePerfData();
    res.json({ success: true, isRunning: engine.botRunning, isPaused: engine.botPaused });
});

app.post('/api/trading/engine/close-all', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const engine = engineRegistry.get(String(userId));
    if (!engine) return res.status(404).json({ success: false, error: 'Engine not found' });
    const closed = [], skipped = [];
    for (const [symbol] of engine.positions) {
        try {
            const posRes = await axios.get(`${engine.alpacaConfig.baseURL}/v2/positions/${symbol}`, {
                headers: { 'APCA-API-KEY-ID': engine.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': engine.alpacaConfig.secretKey }
            });
            await engine.closePosition(symbol, posRes.data.qty, 'Manual Close All');
            closed.push(symbol);
        } catch (err) { skipped.push({ symbol, error: 'Internal server error' }); }
    }
    res.json({ success: true, closed, skipped });
});

app.get('/api/accounts/summary', async (req, res) => {
    try {
        const accountUrl = `${alpacaConfig.baseURL}/v2/account`;
        const accountResponse = await axios.get(accountUrl, {
            headers: {
                'APCA-API-KEY-ID': alpacaConfig.apiKey,
                'APCA-API-SECRET-KEY': alpacaConfig.secretKey
            }
        });

        const account = accountResponse.data;
        const equity = parseFloat(account.equity);
        const cash = parseFloat(account.cash);
        cachedAccountEquity = equity;  // [v19.1] keep equity current from broker

        res.json({
            success: true,
            data: {
                activeAccount: process.env.ACTIVE_ACCOUNT || 'demo',
                realAccount: {
                    balance: cash,
                    equity,
                    pnl: perfData.totalProfit || 0,
                    pnlPercent: equity > 0 ? ((perfData.totalProfit || 0) / equity) * 100 : 0
                },
                demoAccount: {
                    balance: cash,
                    equity,
                    canReset: true
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// [Phase 3.5] Portfolio-level risk status endpoint (cross-bot)
app.get('/api/portfolio/risk', async (req, res) => {
    try {
        const risk = await checkPortfolioRisk();
        res.json({ success: true, data: risk });
    } catch (error) {
        res.json({ success: false, data: { totalPositions: positions.size, warnings: ['Cross-bot check failed'] } });
    }
});

app.get('/health', (req, res) => {
    const health = aggregateHealth({
        scan: checkScanHealth(lastScanCompletedAt, 60000),
        errors: checkErrorRate(recentErrors),
        trading: checkTradingHealth({
            totalTrades: perfData.totalTrades || 0,
            winRate: (perfData.winRate || 50) / 100,
            profitFactor: perfData.profitFactor || 1.0,
            maxDrawdownPct: perfData.maxDrawdown || 0,
            consecutiveLosses: perfData.consecutiveLosses || 0,
        }),
        memory: checkMemoryHealth(),
    });
    res.json(health);
});

// Trading bot start/stop/pause endpoints (for dashboard compatibility)
app.post('/api/trading/start', (req, res) => {
    try {
        botRunning = true;
        botPaused = false;
        saveBotState();
        res.json({ success: true, message: 'Stock trading bot started', isRunning: true, isPaused: false });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/trading/stop', (req, res) => {
    try {
        botRunning = false;
        botPaused = false;
        saveBotState();
        res.json({ success: true, message: 'Stock trading bot stopped', isRunning: false, isPaused: false });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Realize profits — close all open positions that are currently profitable
app.post('/api/trading/realize-profits', async (req, res) => {
    try {
        const closed = [];
        const skipped = [];

        for (const [symbol] of positions) {
            try {
                const posUrl = `${alpacaConfig.baseURL}/v2/positions/${symbol}`;
                const posRes = await axios.get(posUrl, {
                    headers: {
                        'APCA-API-KEY-ID': alpacaConfig.apiKey,
                        'APCA-API-SECRET-KEY': alpacaConfig.secretKey,
                    },
                });
                const qty = posRes.data.qty;
                const unrealizedPnL = parseFloat(posRes.data.unrealized_pl);

                if (unrealizedPnL > 0) {
                    await closePosition(symbol, qty, 'Realize Profits');
                    closed.push({ symbol, pnl: unrealizedPnL });
                } else {
                    skipped.push({ symbol, pnl: unrealizedPnL });
                }
            } catch (err) {
                skipped.push({ symbol, error: 'Internal server error' });
            }
        }

        res.json({
            success: true,
            message: `Closed ${closed.length} profitable position(s), skipped ${skipped.length}`,
            closed,
            skipped,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Switch between real/demo account view
app.post('/api/accounts/switch', (req, res) => {
    const { type } = req.body;
    if (!['real', 'demo'].includes(type)) {
        return res.status(400).json({ success: false, error: 'type must be "real" or "demo"' });
    }
    // For paper trading, both accounts point to the same Alpaca paper account.
    // We track the preference in memory so the dashboard can reflect it.
    process.env.ACTIVE_ACCOUNT = type;
    res.json({ success: true, activeAccount: type });
});

// Reset demo account — resets local performance stats (does not affect Alpaca paper account)
app.post('/api/accounts/demo/reset', (req, res) => {
    try {
        // Reset anti-churning state
        totalTradesToday = 0;
        orbTradesToday = 0;
        recentTrades.clear();
        tradesPerSymbol.clear();      // was missing — prevented new trades after reset
        stoppedOutSymbols.clear();    // was missing — cooldowns persisted after reset
        profitProtectReentrySymbols.clear();
        guardrails.resetDaily();

        // Reset the global perfData in memory (use Object.assign, not const — don't shadow)
        Object.assign(perfData, {
            totalTrades: 0, winningTrades: 0, losingTrades: 0,
            totalProfit: 0, totalWinAmount: 0, totalLossAmount: 0,
            profitFactor: 0, winRate: 0, maxDrawdown: 0,
            lastReset: new Date().toISOString(),
        });
        fs.writeFileSync(PERF_FILE, JSON.stringify(perfData, null, 2));

        console.log('🔄 Demo account stats reset');
        res.json({ success: true, message: 'Demo account statistics reset' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/trading/pause', (req, res) => {
    try {
        botPaused = !botPaused;
        saveBotState();
        res.json({ success: true, message: botPaused ? 'Stock trading bot paused' : 'Stock trading bot resumed', isRunning: botRunning, isPaused: botPaused });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Test SMS Alerts
app.post('/test-sms', async (req, res) => {
    try {
        console.log('📱 Sending test SMS alert...');
        const result = await smsAlerts.sendTestAlert();

        if (result) {
            res.json({
                success: true,
                message: 'Test SMS sent successfully! Check your phone.',
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: false,
                message: 'SMS alerts are disabled. Set SMS_ALERTS_ENABLED=true in .env',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// Test Telegram Alerts
app.post('/test-telegram', async (req, res) => {
    try {
        console.log('📱 Sending test Telegram alert...');
        const result = await telegramAlerts.sendTestAlert();

        if (result) {
            res.json({
                success: true,
                message: 'Test Telegram message sent successfully! Check your Telegram app.',
                timestamp: new Date().toISOString()
            });
        } else {
            res.json({
                success: false,
                message: 'Telegram alerts are disabled. Set TELEGRAM_ALERTS_ENABLED=true in .env',
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    }
});

// ===== CONFIG READ / UPDATE ENDPOINTS =====
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: {
            trading: {
                mode: process.env.REAL_TRADING_ENABLED === 'true' ? 'live' : 'paper',
                maxTradesPerDay: MAX_TRADES_PER_DAY,
                maxTradesPerSymbol: MAX_TRADES_PER_SYMBOL,
                minTimeBetweenTradesMins: Math.round(MIN_TIME_BETWEEN_TRADES / 60000),
                stopOutCooldownMins: 60,
            },
            risk: {
                tier1: { stopLoss: MOMENTUM_CONFIG.tier1.stopLoss, profitTarget: MOMENTUM_CONFIG.tier1.profitTarget, positionSize: MOMENTUM_CONFIG.tier1.positionSize, maxPositions: MOMENTUM_CONFIG.tier1.maxPositions },
                tier2: { stopLoss: MOMENTUM_CONFIG.tier2.stopLoss, profitTarget: MOMENTUM_CONFIG.tier2.profitTarget, positionSize: MOMENTUM_CONFIG.tier2.positionSize, maxPositions: MOMENTUM_CONFIG.tier2.maxPositions },
                tier3: { stopLoss: MOMENTUM_CONFIG.tier3.stopLoss, profitTarget: MOMENTUM_CONFIG.tier3.profitTarget, positionSize: MOMENTUM_CONFIG.tier3.positionSize, maxPositions: MOMENTUM_CONFIG.tier3.maxPositions },
            },
            brokers: {
                alpaca: {
                    configured: !!(alpacaConfig.apiKey && alpacaConfig.secretKey),
                    mode: alpacaConfig.baseURL.includes('paper') ? 'paper' : 'live',
                    baseURL: alpacaConfig.baseURL,
                },
                oanda: {
                    configured: !!(process.env.OANDA_ACCOUNT_ID && process.env.OANDA_ACCESS_TOKEN),
                    mode: process.env.OANDA_PRACTICE === 'false' ? 'live' : 'practice',
                },
                crypto: {
                    configured: !!(process.env.CRYPTO_API_KEY && process.env.CRYPTO_API_SECRET),
                    exchange: process.env.CRYPTO_EXCHANGE || 'kraken',
                    testnet: process.env.CRYPTO_TESTNET !== 'false',
                },
            },
            notifications: {
                telegram: {
                    enabled: process.env.TELEGRAM_ALERTS_ENABLED === 'true',
                    configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
                    chatId: process.env.TELEGRAM_CHAT_ID ? `...${process.env.TELEGRAM_CHAT_ID.slice(-4)}` : null,
                },
                sms: {
                    enabled: process.env.SMS_ALERTS_ENABLED === 'true',
                    configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
                    phone: process.env.ALERT_PHONE_NUMBER ? `***${process.env.ALERT_PHONE_NUMBER.slice(-4)}` : null,
                },
            },
            riskLimits: {
                maxDailyLoss: MAX_DAILY_LOSS,
                maxDrawdown: MAX_DRAWDOWN_PCT,
                maxTradesPerDay: MAX_TRADES_PER_DAY,
            },
        }
    });
});

// Update live risk parameters (no restart needed)
app.post('/api/config/risk', requireApiSecret, (req, res) => {
    try {
        const { tier, stopLoss, profitTarget, positionSize, maxPositions } = req.body;
        if (!['tier1', 'tier2', 'tier3'].includes(tier)) {
            return res.status(400).json({ success: false, error: 'Invalid tier' });
        }
        if (stopLoss != null) MOMENTUM_CONFIG[tier].stopLoss = Math.max(0.01, Math.min(0.20, stopLoss));
        if (profitTarget != null) MOMENTUM_CONFIG[tier].profitTarget = Math.max(0.01, Math.min(0.50, profitTarget));
        if (positionSize != null) MOMENTUM_CONFIG[tier].positionSize = Math.max(0.001, Math.min(0.05, positionSize));
        if (maxPositions != null) MOMENTUM_CONFIG[tier].maxPositions = Math.max(1, Math.min(10, Math.round(maxPositions)));
        saveRiskConfig();
        console.log(`⚙️  Config updated: ${tier} → stopLoss=${MOMENTUM_CONFIG[tier].stopLoss} profitTarget=${MOMENTUM_CONFIG[tier].profitTarget}`);
        res.json({ success: true, data: MOMENTUM_CONFIG[tier] });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// ===== BROKER CREDENTIALS ENDPOINT =====
// Writes keys to .env file on the local machine. Never logs key values.
app.post('/api/config/mode', requireApiSecret, async (req, res) => {
    try {
        const { mode } = req.body;
        if (!['paper', 'live'].includes(mode)) {
            return res.status(400).json({ success: false, error: 'mode must be "paper" or "live"' });
        }
        const value = mode === 'live' ? 'true' : 'false';
        process.env.REAL_TRADING_ENABLED = value;
        await persistEnvVar('REAL_TRADING_ENABLED', value);
        console.log(`⚙️  Trading mode switched to: ${mode.toUpperCase()}`);
        res.json({ success: true, mode });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/config/risk-limits', requireApiSecret, (req, res) => {
    try {
        const { maxDailyLoss, maxDrawdown, maxTradesPerDay } = req.body;
        if (maxDailyLoss !== undefined && typeof maxDailyLoss === 'number') {
            MAX_DAILY_LOSS = Math.max(50, Math.min(50000, Math.abs(maxDailyLoss)));
        }
        if (maxDrawdown !== undefined && typeof maxDrawdown === 'number') {
            MAX_DRAWDOWN_PCT = Math.max(1, Math.min(50, maxDrawdown));
        }
        if (maxTradesPerDay !== undefined && typeof maxTradesPerDay === 'number') {
            MAX_TRADES_PER_DAY = Math.max(1, Math.min(30, Math.floor(maxTradesPerDay)));
        }

        // Persist to .env
        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        try { envContent = fs.readFileSync(envPath, 'utf8'); } catch { envContent = ''; }

        const updates = {
            MAX_DAILY_LOSS: String(MAX_DAILY_LOSS),
            MAX_DRAWDOWN_PCT: String(MAX_DRAWDOWN_PCT),
            MAX_TRADES_PER_DAY: String(MAX_TRADES_PER_DAY),
        };
        for (const [key, value] of Object.entries(updates)) {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const line = `${key}=${value}`;
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, line);
            } else {
                envContent += `\n${line}`;
            }
            process.env[key] = value;
        }
        fs.writeFileSync(envPath, envContent);

        console.log(`⚙️  Risk limits updated: maxDailyLoss=$${MAX_DAILY_LOSS} maxDrawdown=${MAX_DRAWDOWN_PCT}% maxTrades=${MAX_TRADES_PER_DAY}`);
        res.json({ success: true, riskLimits: { maxDailyLoss: MAX_DAILY_LOSS, maxDrawdown: MAX_DRAWDOWN_PCT, maxTradesPerDay: MAX_TRADES_PER_DAY } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/config/credentials', requireJwtOrApiSecret, async (req, res) => {
    try {
        const { broker, credentials, fields } = req.body;
        const creds = credentials || fields;
        const ALLOWED_KEYS = {
            alpaca:   ['ALPACA_API_KEY', 'ALPACA_SECRET_KEY', 'ALPACA_BASE_URL'],
            oanda:    ['OANDA_ACCOUNT_ID', 'OANDA_ACCESS_TOKEN', 'OANDA_PRACTICE'],
            crypto:   ['CRYPTO_API_KEY', 'CRYPTO_API_SECRET', 'CRYPTO_EXCHANGE', 'CRYPTO_TESTNET'],
            telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_ALERTS_ENABLED'],
            sms:      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'ALERT_PHONE_NUMBER', 'SMS_ALERTS_ENABLED'],
        };

        const allowed = ALLOWED_KEYS[broker];
        if (!allowed) return res.status(400).json({ success: false, error: 'Unknown broker' });
        if (!creds || typeof creds !== 'object') return res.status(400).json({ success: false, error: 'No credentials provided' });

        const userId = req.user?.sub;

        // Gate: block live Alpaca URL for free-tier users
        if (broker === 'alpaca' && creds.ALPACA_BASE_URL &&
            creds.ALPACA_BASE_URL.includes('api.alpaca.markets') &&
            !creds.ALPACA_BASE_URL.includes('paper')) {
            if (userId && dbPool) {
                const tierRow = await dbPool.query('SELECT subscription_tier FROM users WHERE id=$1', [userId]);
                const tier = tierRow.rows[0]?.subscription_tier || 'free';
                if (tier === 'free') {
                    return res.status(403).json({
                        success: false,
                        error: 'Live trading requires a paid subscription. Please upgrade your plan.',
                        code: 'SUBSCRIPTION_REQUIRED'
                    });
                }
            }
        }

        let updated = 0;
        let persisted = 0;
        let filePersisted = 0;
        const warnings = [];
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

        // Refresh in-memory broker config
        if (broker === 'alpaca') {
            if (process.env.ALPACA_API_KEY)    alpacaConfig.apiKey    = process.env.ALPACA_API_KEY;
            if (process.env.ALPACA_SECRET_KEY) alpacaConfig.secretKey = process.env.ALPACA_SECRET_KEY;
            if (process.env.ALPACA_BASE_URL)   alpacaConfig.baseURL   = process.env.ALPACA_BASE_URL;
            // Register or update per-user engine if this is an Alpaca credential save
            if (userId) {
                const existingEngine = engineRegistry.get(String(userId));
                if (existingEngine) {
                    existingEngine.updateCredentials(process.env.ALPACA_API_KEY, process.env.ALPACA_SECRET_KEY, process.env.ALPACA_BASE_URL);
                    console.log(`🔧 [Engine ${userId}] Credentials updated in running engine`);
                } else {
                    // Create engine in background — don't block the response
                    getOrCreateEngine(userId).then(engine => {
                        if (engine) console.log(`🔧 [Engine ${userId}] Engine created after credential save`);
                    }).catch(err => console.warn('[ALERT]', err.message));
                }
            }
        }

        const response = { success: true, updated, storage, engineStarted: !!userId };
        if (warnings.length === 1) response.warning = warnings[0];
        if (warnings.length > 1) response.warnings = warnings;
        res.json(response);
    } catch (err) {
        console.error('Credentials update error:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' || 'Failed to save credentials' });
    }
});

app.get('/api/config/credentials/status', requireJwt, async (req, res) => {
    const userId = req.user?.sub;
    const envStatus = {
        alpaca:   { configured: !!(process.env.ALPACA_API_KEY && process.env.ALPACA_SECRET_KEY) },
        telegram: { configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) },
        sms:      { configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) },
    };

    const fileStatus = userId ? {
        alpaca: credentialStore.countCredentials(userId, 'alpaca'),
        telegram: credentialStore.countCredentials(userId, 'telegram'),
        sms: credentialStore.countCredentials(userId, 'sms'),
    } : null;

    if (!userId) {
        return res.json({ success: true, brokers: envStatus });
    }

    if (!dbPool) {
        return res.json({ success: true, brokers: {
            alpaca:   { configured: (fileStatus.alpaca   || 0) >= 2 || envStatus.alpaca.configured },
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
            alpaca:   { configured: Math.max(stored.alpaca   || 0, fileStatus.alpaca   || 0) >= 2 || envStatus.alpaca.configured },
            telegram: { configured: Math.max(stored.telegram || 0, fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: Math.max(stored.sms      || 0, fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }});
    } catch (e) {
        console.warn('⚠️ Credential status lookup failed, falling back to environment values:', e.message);
        res.json({ success: true, brokers: {
            alpaca:   { configured: (fileStatus.alpaca   || 0) >= 2 || envStatus.alpaca.configured },
            telegram: { configured: (fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: (fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }, warning: 'Credential status fallback in use' });
    }
});

app.post('/api/config/test-notification', requireApiSecret, async (req, res) => {
    const { channel } = req.body;
    try {
        if (channel === 'telegram') {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID;
            if (!token || !chatId) {
                return res.status(400).json({ success: false, error: 'Telegram not configured' });
            }
            await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
                chat_id: chatId,
                text: '✅ NexusTradeAI: Test notification — Telegram alerts are working.',
            }, { timeout: 8000 });
            return res.json({ success: true });
        }
        if (channel === 'sms') {
            const sid  = process.env.TWILIO_ACCOUNT_SID;
            const auth = process.env.TWILIO_AUTH_TOKEN;
            const from = process.env.TWILIO_PHONE_NUMBER;
            const to   = process.env.ALERT_PHONE_NUMBER;
            if (!sid || !auth || !from || !to) {
                return res.status(400).json({ success: false, error: 'SMS not fully configured' });
            }
            await axios.post(
                `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
                new URLSearchParams({ From: from, To: to, Body: 'NexusTradeAI: Test SMS — alerts are working.' }).toString(),
                { auth: { username: sid, password: auth }, timeout: 8000 }
            );
            return res.json({ success: true });
        }
        res.status(400).json({ success: false, error: 'Unknown channel' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.get('/api/backtest/report', (req, res) => {
    // Try static file first (generated by enhanced-backtester.js),
    // but skip it if it has no real trades (stale/empty report)
    try {
        const reportPath = path.join(DATA_DIR, 'backtest-report.json');
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        const hasTrades = (report.summary?.totalTrades ?? 0) > 0 || (report.trades?.length ?? 0) > 0;
        if (hasTrades) return res.json({ success: true, data: report });
    } catch {}

    // Fall back: return live performance stats so the dashboard always has data
    const pf = perfData.profitFactor || 0;
    const wr = perfData.winRate || 0;
    const liveReport = {
        type: 'live',
        timestamp: new Date().toISOString(),
        summary: {
            totalTrades: perfData.totalTrades,
            winningTrades: perfData.winningTrades,
            losingTrades: perfData.losingTrades,
            overallWinRate: wr / 100,
            profitFactor: pf,
            totalProfit: perfData.totalProfit,
            totalWinAmount: perfData.totalWinAmount,
            totalLossAmount: perfData.totalLossAmount,
            avgSharpe: perfData.sharpeRatio || 0,
            avgDrawdown: perfData.maxDrawdown || 0,
            expectancy: perfData.totalTrades > 0
                ? perfData.totalProfit / perfData.totalTrades / 100
                : 0,
            symbolsTested: positions.size,
            consecutiveLosses: perfData.consecutiveLosses,
            maxConsecutiveLosses: perfData.maxConsecutiveLosses,
        },
        validation: {
            passed: wr >= 45 && pf >= 1.2 && perfData.totalTrades >= 5,
            passedChecks: [wr >= 45, pf >= 1.2, (perfData.maxDrawdown || 0) <= 0.2, perfData.totalProfit > 0].filter(Boolean).length,
            totalChecks: 4,
            checks: {
                sufficientTrades: perfData.totalTrades >= 30,
                winRateOK: wr >= 45,
                profitFactorOK: pf >= 1.2,
                drawdownOK: (perfData.maxDrawdown || 0) <= 0.2,
                profitPositive: perfData.totalProfit > 0,
                noCircuitBreaker: perfData.circuitBreakerStatus === 'OK',
            },
        },
        config: {
            fastMA: 9, slowMA: 21,
            stopLossPct: MOMENTUM_CONFIG.tier1.stopLoss,
            profitTargetPct: MOMENTUM_CONFIG.tier1.profitTarget,
            positionSizePct: MOMENTUM_CONFIG.tier1.positionSize,
            initialCapital: cachedAccountEquity || 100000,  // [v19.1] from broker, fallback if not yet fetched
            walkForwardWindows: 5,
            inSampleRatio: 0.7,
        },
        symbolResults: [],
        trades: [],
    };
    res.json({ success: true, data: liveReport });
});

// ===== PROMETHEUS METRICS ENDPOINT =====
app.get('/metrics', async (req, res) => {
    try {
        // Update trading-specific metrics
        metrics.updatePositions(Array.from(positions.values()).map(p => ({
            strategy: p.strategy || 'momentum',
            symbol: p.symbol,
            unrealized_pnl: 0  // Will be updated from Alpaca
        })));

        metrics.updatePerformance({
            account_id: 'alpaca-paper',
            total_pnl: 0,  // Updated from external data
            trades_today: totalTradesToday
        });

        const promClient = require('prom-client');
        res.set('Content-Type', promClient.register.contentType);
        res.end(await metrics.getMetrics());
    } catch (error) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Reset daily counters at midnight (or when a new trading day starts)
let lastResetDate = getESTDate().toDateString();
function resetDailyCounters() {
    const today = getESTDate().toDateString();
    if (today !== lastResetDate) {
        console.log(`\n📅 New trading day: ${today} - resetting daily counters`);
        totalTradesToday = 0;
        orbTradesToday = 0;
        tradesPerSymbol.clear();
        stoppedOutSymbols.clear();
        profitProtectReentrySymbols.clear();
        guardrails.resetDaily();
        lastResetDate = today;
    }
}

async function checkEndOfDay() {
    const now = getESTDate();
    const hour = now.getHours();
    const minute = now.getMinutes();
    // Close all positions between 3:50 PM and 4:00 PM EST
    if (hour === 15 && minute >= 50) {
        if (positions.size > 0) {
            console.log(`\n⚠️  [EOD] Market closing soon (${hour}:${String(minute).padStart(2, '0')} EST) - closing all ${positions.size} positions`);
            for (const [symbol] of positions) {
                try {
                    // Get current qty from Alpaca
                    const posUrl = `${alpacaConfig.baseURL}/v2/positions/${symbol}`;
                    const posRes = await axios.get(posUrl, {
                        headers: {
                            'APCA-API-KEY-ID': alpacaConfig.apiKey,
                            'APCA-API-SECRET-KEY': alpacaConfig.secretKey
                        }
                    });
                    const qty = posRes.data.qty;
                    await closePosition(symbol, qty, 'End of Day');
                } catch (err) {
                    console.error(`❌ [EOD] Failed to close ${symbol}:`, err.message);
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-USER TRADING ENGINE
// Each user who saves credentials gets their own isolated trading engine instance.
// EngineRegistry manages lifecycle; ScanQueue drives all engines from one interval.
// ─────────────────────────────────────────────────────────────────────────────

// Module-level shared 45-second bar cache — single set of Alpaca API calls for all users
const BAR_CACHE = new Map(); // symbol → { bars, fetchedAt }
const BAR_CACHE_TTL_MS = 45 * 1000;
const BAR_CACHE_EVICT_MS = 5 * 60 * 1000; // evict entries older than 5 minutes
let _lastBarCacheCleanup = 0;

function evictStaleBarCache() {
    const now = Date.now();
    if (now - _lastBarCacheCleanup < 60_000) return; // run at most once per minute
    _lastBarCacheCleanup = now;
    for (const [key, entry] of BAR_CACHE) {
        if (now - entry.fetchedAt > BAR_CACHE_EVICT_MS) {
            BAR_CACHE.delete(key);
        }
    }
}

async function fetchBarsWithCache(symbol, cfg, params) {
    evictStaleBarCache();
    const cacheKey = `${symbol}:${JSON.stringify(params)}`;
    const cached = BAR_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < BAR_CACHE_TTL_MS) return cached.bars;
    const barUrl = `${cfg.dataURL}/v2/stocks/${symbol}/bars`;
    const barResponse = await axios.get(barUrl, {
        headers: { 'APCA-API-KEY-ID': cfg.apiKey, 'APCA-API-SECRET-KEY': cfg.secretKey },
        params,
        timeout: 12000
    });
    const bars = barResponse.data?.bars || null;
    if (bars) {
        BAR_CACHE.set(cacheKey, { bars, fetchedAt: Date.now() });
        // Evict oldest entries when cache exceeds max size to prevent memory leak
        if (BAR_CACHE.size > 500) {
            const entriesToDelete = BAR_CACHE.size - 400; // trim down to 400
            let deleted = 0;
            for (const [key] of BAR_CACHE) {
                if (deleted >= entriesToDelete) break;
                BAR_CACHE.delete(key);
                deleted++;
            }
        }
    }
    return bars;
}

class UserTradingEngine {
    constructor(userId, alpacaApiKey, alpacaSecretKey, alpacaBaseURL) {
        this.userId = userId;
        this.alpacaConfig = {
            baseURL: alpacaBaseURL || 'https://paper-api.alpaca.markets',
            apiKey: alpacaApiKey,
            secretKey: alpacaSecretKey,
            dataURL: 'https://data.alpaca.markets'
        };
        // Per-user trading state
        this.positions = new Map();
        this.recentTrades = new Map();
        this.stoppedOutSymbols = new Map();
        this.tradesPerSymbol = new Map();
        this.profitProtectReentrySymbols = new Map();
        this.totalTradesToday = 0;
        this.orbTradesToday = 0;
        this.cachedDailyPnL = 0;
        this.scanCount = 0;
        this.lastScanTime = null;
        this.botRunning = false;
        this.botPaused = false;
        this.lastResetDate = getESTDate().toDateString();
        this.perfData = {
            totalTrades: 0, winningTrades: 0, losingTrades: 0,
            totalProfit: 0, totalWinAmount: 0, totalLossAmount: 0,
            maxDrawdown: 0, sharpeRatio: 0, winRate: 0, profitFactor: 0,
            consecutiveLosses: 0, maxConsecutiveLosses: 0,
            circuitBreakerStatus: 'OK', circuitBreakerReason: null,
            isRunning: false, activePositions: 0, lastUpdate: new Date().toISOString()
        };
        console.log(`🔧 [Engine] Created engine for user ${userId}`);
    }

    updateCredentials(alpacaApiKey, alpacaSecretKey, alpacaBaseURL, extraCreds) {
        if (alpacaApiKey)    this.alpacaConfig.apiKey    = alpacaApiKey;
        if (alpacaSecretKey) this.alpacaConfig.secretKey = alpacaSecretKey;
        if (alpacaBaseURL)   this.alpacaConfig.baseURL   = alpacaBaseURL;
        // Per-user Telegram: use user's own bot token+chatId if stored, else fall back to shared
        const tgToken  = extraCreds?.TELEGRAM_BOT_TOKEN  || process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = extraCreds?.TELEGRAM_CHAT_ID    || process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChatId) {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                const bot = new TelegramBot(tgToken, { polling: false });
                this._telegram = {
                    sendStockEntry:     (sym, ep, sl, tp, qty, tier) =>
                        bot.sendMessage(tgChatId, `✅ *STOCK ENTRY* [${tier}]\n📛 ${sym} x${qty}\n💰 Entry: $${ep.toFixed(2)}\n🛑 SL: $${sl.toFixed(2)}  🎯 TP: $${tp.toFixed(2)}`, { parse_mode: 'Markdown' }).catch(err => console.warn('[ALERT]', err.message)),
                    sendStockStopLoss:  (sym, ep, cp, pnl, sl) =>
                        bot.sendMessage(tgChatId, `🚨 *STOP LOSS* ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💸 P&L: ${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(err => console.warn('[ALERT]', err.message)),
                    sendStockTakeProfit:(sym, ep, cp, pnl, tp) =>
                        bot.sendMessage(tgChatId, `🎯 *TAKE PROFIT* ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💵 P&L: +${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(err => console.warn('[ALERT]', err.message)),
                };
                console.log(`📱 [Engine ${this.userId}] Per-user Telegram alerts configured`);
            } catch (e) {
                this._telegram = null;
                console.warn(`⚠️  [Engine ${this.userId}] Telegram init failed:`, e.message);
            }
        } else {
            this._telegram = null; // will fall back to shared telegramAlerts
        }
    }

    savePerfData() {
        this.perfData.lastUpdate = new Date().toISOString();
        this.perfData.activePositions = this.positions.size;
        // Persist to engine_state table in DB
        if (dbPool) {
            dbPool.query(
                `INSERT INTO engine_state (user_id, bot, state_json, updated_at)
                 VALUES ($1, 'stock', $2, NOW())
                 ON CONFLICT (user_id, bot) DO UPDATE SET state_json=$2, updated_at=NOW()`,
                [this.userId, JSON.stringify({ perfData: this.perfData,
                    totalTradesToday: this.totalTradesToday, botRunning: this.botRunning,
                    botPaused: this.botPaused, lastResetDate: this.lastResetDate })]
            ).catch(err => console.warn('[ALERT]', err.message));
        }
    }

    async loadStateFromDb() {
        if (!dbPool) return;
        try {
            const r = await dbPool.query(
                'SELECT state_json FROM engine_state WHERE user_id=$1 AND bot=$2',
                [this.userId, 'stock']
            );
            if (r.rows.length > 0) {
                const s = r.rows[0].state_json;
                if (s.perfData)        Object.assign(this.perfData, s.perfData);
                if (s.totalTradesToday !== undefined) this.totalTradesToday = s.totalTradesToday;
                if (s.botRunning !== undefined)       this.botRunning = s.botRunning;
                if (s.botPaused !== undefined)        this.botPaused = s.botPaused;
                if (s.lastResetDate)                  this.lastResetDate = s.lastResetDate;
                console.log(`📂 [Engine ${this.userId}] State restored from DB`);
            }
        } catch (e) {
            console.warn(`⚠️  [Engine ${this.userId}] State load failed:`, e.message);
        }
        // Hydrate open positions from trades table + cross-reference with Alpaca
        try {
            const dbOpen = await dbPool.query(
                `SELECT id, symbol, direction, entry_price, quantity, stop_loss, take_profit, entry_time
                 FROM trades WHERE bot='stock' AND status='open' AND user_id=$1`, [this.userId]
            );
            if (dbOpen.rows.length > 0) {
                let alpacaSymbols = new Set();
                try {
                    const resp = await axios.get(`${this.alpacaConfig.baseURL}/v2/positions`, {
                        headers: { 'APCA-API-KEY-ID': this.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey }
                    });
                    alpacaSymbols = new Set(resp.data.map(p => p.symbol));
                } catch (e) { console.warn(`⚠️ [Engine ${this.userId}] Alpaca position fetch failed:`, e.message); }

                for (const row of dbOpen.rows) {
                    if (alpacaSymbols.size === 0 || alpacaSymbols.has(row.symbol)) {
                        const entryPrice = parseFloat(row.entry_price || '0');
                        const quantity = parseFloat(row.quantity || '0');
                        const stopLoss = parseFloat(row.stop_loss || '0');
                        const takeProfit = parseFloat(row.take_profit || '0');
                        this.positions.set(row.symbol, {
                            dbTradeId: row.id,
                            symbol: row.symbol,
                            side: row.direction || 'long',
                            entry: entryPrice,
                            entryPrice,
                            shares: quantity,
                            quantity,
                            stopLoss,
                            target: takeProfit,
                            takeProfit,
                            entryTime: row.entry_time ? new Date(row.entry_time) : new Date(),
                            tier: 'restored'
                        });
                    }
                }
                if (this.positions.size > 0)
                    console.log(`✅ [Engine ${this.userId}] Hydrated ${this.positions.size} position(s) from DB/Alpaca`);
            }
        } catch (e) {
            console.warn(`⚠️ [Engine ${this.userId}] Position hydration failed:`, e.message);
        }
    }

    recordTradeClose(symbol, entryPrice, exitPrice, shares, reason) {
        const pnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
        const pnlDollar = (exitPrice - entryPrice) * shares;
        const isWin = pnlPct > 0;
        this.perfData.totalTrades++;
        this.perfData.totalProfit += pnlDollar;
        if (isWin) {
            this.perfData.winningTrades++;
            this.perfData.totalWinAmount += pnlDollar;
            this.perfData.consecutiveLosses = 0;
        } else {
            this.perfData.losingTrades++;
            this.perfData.totalLossAmount += Math.abs(pnlDollar);
            this.perfData.consecutiveLosses++;
            this.perfData.maxConsecutiveLosses = Math.max(this.perfData.maxConsecutiveLosses, this.perfData.consecutiveLosses);
        }
        this.perfData.winRate = this.perfData.totalTrades > 0
            ? (this.perfData.winningTrades / this.perfData.totalTrades) * 100 : 0;
        this.perfData.profitFactor = this.perfData.totalTrades < 5 ? 0
            : this.perfData.totalLossAmount > 0
                ? this.perfData.totalWinAmount / this.perfData.totalLossAmount
                : this.perfData.totalWinAmount > 0 ? 9.99 : 0;
        this.savePerfData();
    }

    async dbTradeOpen(symbol, entryPrice, shares, config, signal, tier, strategy) {
        if (!dbPool) return null;
        try {
            const tags = buildStockTradeTags(signal, strategy, tier);
            const r = await dbPool.query(
                `INSERT INTO trades (user_id,bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
                 position_size_usd,stop_loss,take_profit,entry_time,signal_score,entry_context,rsi,volume_ratio,momentum_pct,
                 agent_approved,agent_confidence,agent_reason)
                 VALUES ($1,'stock',$2,'long',$3,$4,$5,'open',$6,$7,$8,$9,$10,NOW(),$11,$12::jsonb,$13,$14,$15,$16,$17,$18) RETURNING id`,
                [this.userId, symbol, tier, tags.strategy, tags.regime, entryPrice, shares, shares * entryPrice,
                 config.stopLoss ? entryPrice * (1 - config.stopLoss) : null,
                 config.profitTarget ? entryPrice * (1 + config.profitTarget) : null,
                 tags.score, JSON.stringify(tags.context),
                 signal.rsi || null, signal.volumeRatio || null, signal.percentChange || null,
                 signal.agentApproved || false, signal.agentConfidence || null, signal.agentReason || null]
            );
            return r.rows[0]?.id;
        } catch (e) { console.warn('DB open failed:', e.message); return null; }
    }

    async dbTradeClose(id, exitPrice, pnlUsd, pnlPct, reason) {
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
            await client.query('ROLLBACK').catch(err => console.warn('[ALERT]', err.message));
            console.warn('DB close failed (rolled back):', e.message);
        } finally {
            client.release();
        }
    }

    canTrade(symbol, side = 'buy') {
        // [Profit Protection] Check re-entry flag
        const reentryData = this.profitProtectReentrySymbols.get(symbol);
        const reentryTime = reentryData ? reentryData.timestamp : null;
        const hasReentryFlag = reentryTime && (Date.now() - reentryTime) < PROFIT_PROTECT_REENTRY_WINDOW;
        if (reentryTime && !hasReentryFlag) this.profitProtectReentrySymbols.delete(symbol);

        const stopTime = this.stoppedOutSymbols.get(symbol);
        if (stopTime && !hasReentryFlag) {
            const timeSinceStop = Date.now() - stopTime;
            if (timeSinceStop < MIN_TIME_AFTER_STOP) return false;
            else this.stoppedOutSymbols.delete(symbol);
        }
        if (this.totalTradesToday >= MAX_TRADES_PER_DAY) return false;
        if (hasReentryFlag) {
            console.log(`[RE-ENTRY] [Engine ${this.userId}] ${symbol}: profit-protect re-entry flag active — bypassing cooldowns`);
            this.profitProtectReentrySymbols.delete(symbol);
            return true;
        }
        const symbolTrades = this.tradesPerSymbol.get(symbol) || 0;
        if (symbolTrades >= MAX_TRADES_PER_SYMBOL) return false;
        const recent = this.recentTrades.get(symbol) || [];
        if (recent.length > 0) {
            const lastTrade = recent[recent.length - 1];
            const timeSince = Date.now() - lastTrade.time;
            if (timeSince < MIN_TIME_BETWEEN_TRADES) return false;
            if (lastTrade.side !== side && timeSince < MIN_TIME_BETWEEN_TRADES * 1.5) return false;
        }
        return true;
    }

    resetDailyCounters() {
        const today = getESTDate().toDateString();
        if (today !== this.lastResetDate) {
            console.log(`\n📅 [Engine ${this.userId}] New trading day — resetting counters`);
            this.totalTradesToday = 0;
            this.orbTradesToday = 0;
            this.tradesPerSymbol.clear();
            this.stoppedOutSymbols.clear();
            this.profitProtectReentrySymbols.clear();
            this.lastResetDate = today;
        }
    }

    async checkEndOfDay() {
        const now = getESTDate();
        const hour = now.getHours();
        const minute = now.getMinutes();
        if (hour === 15 && minute >= 50) {
            if (this.positions.size > 0) {
                console.log(`\n⚠️  [EOD][Engine ${this.userId}] Closing all ${this.positions.size} positions`);
                for (const [symbol] of this.positions) {
                    try {
                        const posUrl = `${this.alpacaConfig.baseURL}/v2/positions/${symbol}`;
                        const posRes = await axios.get(posUrl, {
                            headers: { 'APCA-API-KEY-ID': this.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey }
                        });
                        await this.closePosition(symbol, posRes.data.qty, 'End of Day');
                    } catch (err) {
                        console.error(`❌ [EOD][Engine ${this.userId}] Failed to close ${symbol}:`, err.message);
                    }
                }
            }
        }
    }

    async closePosition(symbol, qty, reason = 'Manual') {
        let currentPrice = null;
        const position = this.positions.get(symbol);
        try {
            const posUrl = `${this.alpacaConfig.baseURL}/v2/positions/${symbol}`;
            const posRes = await axios.get(posUrl, {
                headers: { 'APCA-API-KEY-ID': this.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey }
            });
            currentPrice = parseFloat(posRes.data.current_price);
        } catch {}
        const isCrypto = /USD$/.test(symbol) && symbol.length <= 8;
        await axios.post(`${this.alpacaConfig.baseURL}/v2/orders`, {
            symbol, qty: parseFloat(qty), side: 'sell', type: 'market',
            time_in_force: isCrypto ? 'gtc' : 'day'
        }, {
            headers: { 'APCA-API-KEY-ID': this.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey }
        });
        if (position && currentPrice) {
            const STOCK_EXIT_SLIPPAGE = 0.0005;
            const adjustedExitPrice = currentPrice * (1 - STOCK_EXIT_SLIPPAGE);
            const closeMetrics = resolveClosedTradeMetrics(position, qty, adjustedExitPrice);
            if (closeMetrics) {
                this.recordTradeClose(symbol, closeMetrics.entryPrice, closeMetrics.exitPrice, closeMetrics.shares, reason);
                // [v17.1] Store decimal pnlPct in DB (0.05 = 5%), not percentage (5.0)
                this.dbTradeClose(position?.dbTradeId, closeMetrics.exitPrice, closeMetrics.pnlUsd, closeMetrics.pnlPct / 100, reason).catch(e => console.warn('⚠️  DB operation failed:', e?.message || String(e)));
            } else {
                console.warn(`⚠️ [Engine ${this.userId}] Skipping DB close write for ${symbol}: unresolved close metrics`);
            }
        }
        const tradeRecord = { time: Date.now(), side: 'sell', reason };
        const recent = this.recentTrades.get(symbol) || [];
        recent.push(tradeRecord);
        if (recent.length > 10) recent.shift();
        this.recentTrades.set(symbol, recent);
        if (reason && (reason.includes('Stop') || reason.toLowerCase().includes('stop loss'))) {
            this.stoppedOutSymbols.set(symbol, Date.now());
        }
        this.positions.delete(symbol);
        this.savePerfData();
        console.log(`✅ [Engine ${this.userId}] Position closed: ${symbol} (${reason})`);
    }

    async managePositions() {
        try {
            const response = await axios.get(`${this.alpacaConfig.baseURL}/v2/positions`, {
                headers: { 'APCA-API-KEY-ID': this.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey }
            });
            if (response.data.length === 0) return;
            for (const alpacaPos of response.data) {
                const symbol = alpacaPos.symbol;
                const currentPrice = parseFloat(alpacaPos.current_price);
                const avgEntry = parseFloat(alpacaPos.avg_entry_price);
                const unrealizedPL = parseFloat(alpacaPos.unrealized_plpc) * 100;
                let position = this.positions.get(symbol);
                if (!position) {
                    const restoredEntry = alpacaPos.created_at ? new Date(alpacaPos.created_at) : new Date(Date.now() - 86400000);
                    const restoredPL = parseFloat(alpacaPos.unrealized_pl) || 0;
                    position = { symbol, entry: avgEntry, shares: parseFloat(alpacaPos.qty),
                        stopLoss: avgEntry * 0.93, target: avgEntry * 1.20,
                        strategy: 'existing', entryTime: restoredEntry,
                        peakUnrealizedPL: Math.max(0, restoredPL), wasPositive: restoredPL > 3 };
                    this.positions.set(symbol, position);
                }
                updateTrailingStop(position, currentPrice, unrealizedPL);

                // ===== PROFIT PROTECTION (per-user engine) =====
                const unrealizedPLDollar = parseFloat(alpacaPos.unrealized_pl) || 0;
                if (position.peakUnrealizedPL === undefined) {
                    position.peakUnrealizedPL = Math.max(0, unrealizedPLDollar);
                    position.wasPositive = unrealizedPLDollar > 3;
                }
                if (unrealizedPLDollar > position.peakUnrealizedPL) position.peakUnrealizedPL = unrealizedPLDollar;
                const enginePosValue = (parseInt(alpacaPos.qty) || 1) * currentPrice;
                const engineProfitThreshold = Math.max(20, enginePosValue * 0.015); // [v17.0] match main engine
                if (unrealizedPLDollar > engineProfitThreshold && !position.wasPositive) {
                    position.wasPositive = true;
                    console.log(`[PROFIT-PROTECT] [Engine ${this.userId}] ${symbol}: breakeven lock ARMED (+$${unrealizedPLDollar.toFixed(2)}, threshold $${engineProfitThreshold.toFixed(2)})`);
                }
                if (position.wasPositive && unrealizedPLDollar < -5) { // [v17.0] was -$3, too tight for bid-ask noise
                    console.log(`[PROFIT-PROTECT] [Engine ${this.userId}] ${symbol}: was +$${position.peakUnrealizedPL.toFixed(2)}, now $${unrealizedPLDollar.toFixed(2)} — closing to protect capital`);
                    this.profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: 'long', entry: position.entryPrice || currentPrice });
                    console.log(`[RE-ENTRY] [Engine ${this.userId}] ${symbol} eligible for re-entry (direction: long) after profit-protect close`);
                    await this.closePosition(symbol, alpacaPos.qty, 'Profit Protection - Breakeven Lock');
                    continue;
                }
                if (position.peakUnrealizedPL > 15 && unrealizedPLDollar > 0) {
                    const dropPct = ((position.peakUnrealizedPL - unrealizedPLDollar) / position.peakUnrealizedPL) * 100;
                    if (dropPct > 40) { // [v18.0] was 55% — too loose, let profits bleed. Now protects 60% of peak
                        console.log(`[PROFIT-PROTECT] [Engine ${this.userId}] ${symbol}: peak +$${position.peakUnrealizedPL.toFixed(2)}, now +$${unrealizedPLDollar.toFixed(2)} (${dropPct.toFixed(1)}% drawback) — taking profit`);
                        this.profitProtectReentrySymbols.set(symbol, { timestamp: Date.now(), direction: 'long', entry: position.entryPrice || currentPrice });
                        console.log(`[RE-ENTRY] [Engine ${this.userId}] ${symbol} eligible for re-entry (direction: long) after profit-protect close`);
                        await this.closePosition(symbol, alpacaPos.qty, `Profit Protection - ${dropPct.toFixed(0)}% Drawback from Peak`);
                        continue;
                    }
                }
                // ===== END PROFIT PROTECTION =====

                const exitReason = await shouldExitPosition(position, currentPrice, alpacaPos, this.alpacaConfig);
                if (exitReason) { await this.closePosition(symbol, alpacaPos.qty, exitReason); continue; }
                if (currentPrice <= position.stopLoss) {
                    (this._telegram || telegramAlerts).sendStockStopLoss(symbol, position.entry, currentPrice, unrealizedPL, position.stopLoss).catch(err => console.warn('[ALERT]', err.message));
                    await this.closePosition(symbol, alpacaPos.qty, 'Stop Loss');
                } else if (currentPrice >= position.target) {
                    (this._telegram || telegramAlerts).sendStockTakeProfit(symbol, position.entry, currentPrice, unrealizedPL, position.target).catch(err => console.warn('[ALERT]', err.message));
                    await this.closePosition(symbol, alpacaPos.qty, 'Profit Target');
                }
            }
        } catch (error) {
            console.error(`❌ [Engine ${this.userId}] Position management error:`, error.message);
        }
    }

    async executeTrade(signal, strategy) {
        try {
            const tier = signal.tier || 'tier1';
            const config = signal.config || MOMENTUM_CONFIG.tier1;
            const accountResponse = await axios.get(`${this.alpacaConfig.baseURL}/v2/account`, {
                headers: { 'APCA-API-KEY-ID': this.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey }
            });
            const equity = parseFloat(accountResponse.data.equity);
            if (!equity || equity <= 0) return null;
            let kellyMultiplier = 1.0;
            if (this.perfData.totalTrades >= 10 && this.perfData.winRate > 0 && this.perfData.profitFactor > 0) {
                const w = this.perfData.winRate / 100;
                const avgWin  = this.perfData.totalWinAmount  / Math.max(this.perfData.winningTrades, 1);
                const avgLoss = this.perfData.totalLossAmount / Math.max(this.perfData.losingTrades, 1);
                const b = avgLoss > 0 ? avgWin / avgLoss : 1;
                const fullKelly = (w * b - (1 - w)) / b;
                const fracKelly = Math.max(0, fullKelly) * 0.5;
                const rawMultiplier = fracKelly > 0 ? fracKelly / config.positionSize : 1.0;
                const safeMultiplier = isFinite(rawMultiplier) && !isNaN(rawMultiplier) ? rawMultiplier : 1.0;
                kellyMultiplier = Math.max(0.5, Math.min(2.0, safeMultiplier));
            }
            const STOCK_SLIPPAGE = 0.0005;
            const effectiveEntry = signal.price * (1 + STOCK_SLIPPAGE);
            // [v9.0] Monte Carlo position sizing for multi-user engine
            let mcMultiplier = 1.0;
            if (monteCarloSizer.tradeReturns.length >= 20) {
                const mcResult = monteCarloSizer.optimize();
                mcMultiplier = Math.min(mcResult.halfKelly / 0.01, 2.0);
                mcMultiplier = Math.max(mcMultiplier, 0.25);
            }
            const positionSize = equity * config.positionSize * kellyMultiplier * mcMultiplier;
            if (!signal.price || signal.price <= 0) return null;
            let shares = Math.floor(positionSize / effectiveEntry);
            // [v4.7] Cap shares by RISK_PER_TRADE
            const stopLossPct = config.stopLoss || 0.04;
            const maxRiskShares = Math.floor((equity * RISK_PER_TRADE) / (effectiveEntry * stopLossPct));
            if (maxRiskShares > 0 && shares > maxRiskShares) shares = maxRiskShares;
            if (shares < 1) return null;
            // [v12.0] ATR-based stops: 1.5x ATR min distance, 3x ATR target for 2:1 R:R
            const eAtrStopPct = signal.atrPct ? Math.max(config.stopLoss, signal.atrPct * 1.5) : config.stopLoss;
            const eAtrTargetPct = signal.atrPct ? Math.max(config.profitTarget, signal.atrPct * 3.0) : config.profitTarget;
            const stopPrice  = (signal.atrStop  || effectiveEntry * (1 - eAtrStopPct)).toFixed(2);
            const targetPrice = (signal.atrTarget || effectiveEntry * (1 + eAtrTargetPct)).toFixed(2);
            if (signal.atrPct) console.log(`   [ATR Stops] [Engine ${this.userId}] atrPct=${(signal.atrPct*100).toFixed(2)}% | Stop: ${(eAtrStopPct*100).toFixed(2)}% ($${stopPrice}) | Target: ${(eAtrTargetPct*100).toFixed(2)}% ($${targetPrice})`);
            const orderResponse = await axios.post(`${this.alpacaConfig.baseURL}/v2/orders`, {
                symbol: signal.symbol, qty: shares, side: 'buy', type: 'market', time_in_force: 'day'
            }, {
                headers: { 'APCA-API-KEY-ID': this.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': this.alpacaConfig.secretKey }
            });
            const entryTime = new Date();
            this.positions.set(signal.symbol, {
                symbol: signal.symbol, shares, entry: effectiveEntry,  // [v6.3] slippage-adjusted
                stopLoss: parseFloat(stopPrice), target: parseFloat(targetPrice),
                strategy, regime: signal.regime, tier, config, entryTime, entryVolume: signal.entryVolume,
                rsi: signal.rsi, vwap: signal.vwap, volumeRatio: signal.volumeRatio,
                percentChange: signal.percentChange, signalScore: signal.score,
                regimeScore: signal.regimeScore, atrPct: signal.atrPct,
                agentApproved: signal.agentApproved || false,
                agentConfidence: signal.agentConfidence || null,
                agentReason: signal.agentReason || null,
                agentSizeMultiplier: signal.agentSizeMultiplier || 1.0,
                decisionRunId: signal.decisionRunId || null,
                banditArm: signal.banditArm || 'moderate',
                // [Profit Protection]
                peakUnrealizedPL: 0,
                wasPositive: false,
            });
            this.dbTradeOpen(signal.symbol, effectiveEntry, shares, config, signal, tier, strategy)
                .then(id => { const p = this.positions.get(signal.symbol); if (p) p.dbTradeId = id; })
                .catch(e => console.warn(`⚠️  DB trade open failed: ${e.message}`));
            const tradeRecord = { time: Date.now(), side: 'buy', price: signal.price, shares, tier };
            const recent = this.recentTrades.get(signal.symbol) || [];
            recent.push(tradeRecord);
            if (recent.length > 10) recent.shift();
            this.recentTrades.set(signal.symbol, recent);
            this.tradesPerSymbol.set(signal.symbol, (this.tradesPerSymbol.get(signal.symbol) || 0) + 1);
            this.totalTradesToday++;
            if (tier === 'orb' || strategy === 'openingRangeBreakout') this.orbTradesToday++;
            (this._telegram || telegramAlerts).sendStockEntry(signal.symbol, signal.price, parseFloat(stopPrice), parseFloat(targetPrice), shares, tier).catch(err => console.warn('[ALERT]', err.message));
            // [v21.0] Report execution to strategy bridge learning loop
            axios.post(`${BRIDGE_URL}/agent/execution`, {
                symbol: signal.symbol, asset_class: 'stock', direction: 'long', tier,
                decision_run_id: signal.decisionRunId || null, fill_price: effectiveEntry,
                intended_price: signal.price, quantity: shares, position_size_usd: shares * effectiveEntry,
                strategy, agent_approved: signal.agentApproved || false, agent_confidence: signal.agentConfidence || null,
            }, { timeout: 5000 }).catch(e => console.warn(`[Learn] ${signal.symbol} execution report failed: ${e.message}`));
            console.log(`✅ [Engine ${this.userId}] TRADE: ${signal.symbol} [${tier}] x${shares} @ $${signal.price}`);
            return orderResponse.data;
        } catch (error) {
            console.error(`❌ [Engine ${this.userId}] Trade failed for ${signal.symbol}:`, error.message);
            return null;
        }
    }

    async scanMomentumBreakouts() {
        if (this.perfData.maxDrawdown >= MAX_DRAWDOWN_PCT) return [];
        // [Guardrail] Check if trading is paused by adaptive guardrails
        if (guardrails.isPaused) {
            console.log(`[Engine ${this.userId}][Guardrail] BLOCKED — lane paused until ${new Date(guardrails.lanePausedUntil).toLocaleTimeString()}`);
            return [];
        }
        const symbols = popularStocks.getAllSymbols();
        const movers = [];
        const batchSize = 20;
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const results = await Promise.allSettled(batch.map(s => analyzeMomentumForEngine(s, this)));
            for (const r of results) { if (r.status === 'fulfilled' && r.value) movers.push(r.value); }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        movers.sort((a, b) => (b.score || 0) - (a.score || 0));
        const regime = globalThis._marketRegime || { adjustments: { maxPositions: 6 } };
        const maxPositions = regime.adjustments.maxPositions || 6;
        if (this.positions.size < maxPositions) {
            const available = maxPositions - this.positions.size;
            const ranked = movers.filter(m => !this.positions.has(m.symbol) && this.canTrade(m.symbol, 'buy'))
                .sort((a, b) => (b.score || 0) - (a.score || 0));
            const engineMaxSignals = isOpeningRangeBreakoutWindow() ? 2 : MAX_SIGNALS_PER_CYCLE;
            for (const mover of ranked.slice(0, Math.min(available, engineMaxSignals))) {
                // [v14.1] Strategy INACTIVE gate — skip strategies that evaluateStrategies() marked as underperforming
                const moverStrategy = mover.strategy || (mover.tier === 'orb' ? 'openingRangeBreakout' : 'momentum');
                const stratStatus = lastStrategyPerf[moverStrategy];
                if (stratStatus && !stratStatus.active && stratStatus.trades >= 10) {
                    console.log(`[Engine ${this.userId}][STRATEGY GATE] ${mover.symbol}: ${moverStrategy} is INACTIVE (WR ${(stratStatus.winRate*100).toFixed(0)}%, PF ${stratStatus.profitFactor.toFixed(2)}) — skipping`);
                    continue;
                }
                // [v11.0] SPY Trend Gate — block weak LONG entries when SPY is bearish
                // [v21.0] Softened: allow through strong individual signals (relative strength override)
                if (!spyBullish) {
                    const volRatio = parseFloat(mover.volumeRatio || 0);
                    const pctChange = parseFloat(mover.percentChange || 0);
                    const hasRelativeStrength = volRatio >= 2.0 && pctChange >= 3.0;
                    if (!hasRelativeStrength) {
                        console.log(`[Engine ${this.userId}][SPY GATE] ${mover.symbol}: Market bearish — skipping LONG entry (vol=${volRatio.toFixed(1)}x, chg=${pctChange.toFixed(1)}%)`);
                        continue;
                    }
                    // SAFETY-REVIEWED: relative strength override — strong individual catalyst overrides broad market weakness
                    console.log(`[Engine ${this.userId}][SPY GATE] ${mover.symbol}: Market bearish but RELATIVE STRENGTH (vol=${volRatio.toFixed(1)}x, chg=${pctChange.toFixed(1)}%) — allowing`);
                }
                // [v11.0] ORB daily limit — max 2 ORB trades per day
                if ((mover.tier === 'orb' || mover.strategy === 'openingRangeBreakout') && this.orbTradesToday >= 2) {
                    console.log(`[Engine ${this.userId}][ORB LIMIT] ${mover.symbol}: Already ${this.orbTradesToday} ORB trades today (max 2) — skipping`);
                    continue;
                }
                // [Phase 1] Order flow confirmation — block only when flow actively opposes trade direction
                if (mover.orderFlowImbalance !== undefined) {
                    const dir = mover.direction || 'long';
                    const ofi = mover.orderFlowImbalance;
                    if ((dir === 'long' && ofi < -0.05) || (dir === 'short' && ofi > 0.05)) {
                        console.log(`[Engine ${this.userId}][FILTER] ${mover.symbol}: Order flow opposes ${dir} (imbalance=${ofi.toFixed(2)}), skipping`);
                        continue;
                    }
                }
                // [Phase 3] Committee aggregator — unified confidence from all signal sources
                const committee = computeCommitteeScore(mover);
                // [v14.0] Raised default from 0.50 → 0.60 — 0.50 passed too many low-conviction signals
                const committeeThreshold = optimizedParams?.committeeThreshold || 0.25; // [v22.0] lowered from 0.40 — absent signals now score 0 not 0.5 // [v20.1] was 0.50, too high with neutral-default scoring (absent=0.5 not 0.1)
                if (committee.confidence < committeeThreshold) {
                    console.log(`[Engine ${this.userId}][Committee] ${mover.symbol}: Confidence ${committee.confidence} < ${committeeThreshold} — skipping`);
                    continue;
                }
                const positiveComponents = Object.values(committee.components).filter(v => v > 0).length;
                if (positiveComponents < 2) {
                    console.log(`[Engine ${this.userId}][Committee] ${mover.symbol}: Only ${positiveComponents} positive component(s) (need 2+) — skipping`);
                    continue;
                }
                // [Improvement 3] Transaction cost filter — reject negative EV trades
                if (!isPositiveEV(committee.confidence)) {
                    console.log(`[Engine ${this.userId}][EV] ${mover.symbol}: Negative EV after costs — skipping`);
                    continue;
                }
                mover.committeeConfidence = committee.confidence;
                mover.committeeComponents = committee.components;
                // [Guardrail] Apply loss-adjusted position sizing
                if (guardrails.lossSizeMultiplier < 1.0) {
                    mover.agentSizeMultiplier = (mover.agentSizeMultiplier || 1.0) * guardrails.lossSizeMultiplier;
                    console.log(`[Engine ${this.userId}][Guardrail] ${mover.symbol} size cut to ${mover.agentSizeMultiplier.toFixed(2)}x (${guardrails.consecutiveLosses} consecutive losses)`);
                }
                // [v5.0] HARD GATE: every trade MUST be approved by the agentic AI pipeline
                const aiResult = await queryAIAdvisor(mover);

                // Agent rejection = hard stop (no trade without AI approval)
                if (!aiResult.approved) {
                    console.log(`[Engine ${this.userId}][Agent] ${mover.symbol} REJECTED (conf: ${(aiResult.confidence || 0).toFixed(2)}, src: ${aiResult.source}) — ${aiResult.reason}`);
                    if (aiResult.risk_flags?.length) console.log(`[Engine ${this.userId}][Agent]   Risk flags: ${aiResult.risk_flags.join(', ')}`);
                    if (aiResult.lessons_applied?.length) console.log(`[Engine ${this.userId}][Agent]   Lessons: ${aiResult.lessons_applied.slice(0, 2).join('; ')}`);
                    if (aiResult.confidence > 0.8 || aiResult.source === 'kill_switch') {
                        (this._telegram || telegramAlerts).sendAgentRejection('Stock Bot', mover.symbol, 'long', aiResult.reason, aiResult.confidence, aiResult.risk_flags).catch(err => console.warn('[ALERT]', err.message));
                    }
                    if (aiResult.source === 'kill_switch') {
                        (this._telegram || telegramAlerts).sendKillSwitchAlert('Stock Bot', aiResult.reason).catch(err => console.warn('[ALERT]', err.message));
                    }
                    continue;
                }

                // Agent approved — log and store metadata
                const srcTag = aiResult.source === 'cache' ? ' (cached)' : '';
                const regime = aiResult.market_regime ? ` [${aiResult.market_regime}]` : '';
                console.log(`[Engine ${this.userId}][Agent] ${mover.symbol} APPROVED${srcTag}${regime} (conf: ${(aiResult.confidence || 0).toFixed(2)}, size: ${(aiResult.position_size_multiplier || 1).toFixed(2)}x) — ${aiResult.reason}`);
                (this._telegram || telegramAlerts).sendAgentApproval('Stock Bot', mover.symbol, 'long', aiResult.confidence || 0, aiResult.position_size_multiplier || 1, aiResult.market_regime).catch(err => console.warn('[ALERT]', err.message));
                mover.agentApproved = true;
                mover.agentConfidence = aiResult.confidence;
                mover.agentReason = aiResult.reason;
                mover.decisionRunId = aiResult.decision_run_id || null;
                mover.banditArm = aiResult.bandit_arm || 'moderate';
                if (aiResult.position_size_multiplier && aiResult.position_size_multiplier !== 1.0) {
                    mover.agentSizeMultiplier = (mover.agentSizeMultiplier || 1.0) * aiResult.position_size_multiplier;
                }

                // [v10.1] Re-entry validation — if this is a re-entry, require extra confirmation
                if (this.profitProtectReentrySymbols.has(mover.symbol)) {
                    const reentryCheck = isStockReentryValid(mover.symbol, mover);
                    if (!reentryCheck.valid) {
                        console.log(`[Engine ${this.userId}][RE-ENTRY] ${mover.symbol}: re-entry BLOCKED — ${reentryCheck.reason}`);
                        continue;
                    }
                }
                // [v10.1] Entry quality gate — final profitability checklist
                const qualityCheck = isStockEntryQualified(mover, null);
                if (!qualityCheck.qualified) {
                    console.log(`[Engine ${this.userId}][QUALITY GATE] ${mover.symbol}: BLOCKED — ${qualityCheck.reason}`);
                    continue;
                }
                // [Correlation Guard] Check own-position concentration before executing
                try {
                    const ownPositions = Array.from(this.positions.values());
                    const guard = computeCorrelationGuard(ownPositions);
                    if (guard.isConcentrated && !guard.canOpenLong) {
                        console.log(`[Engine ${this.userId}][CORRELATION] ${mover.symbol} long BLOCKED — portfolio ${(guard.exposureRatio * 100).toFixed(0)}% ${guard.directionBias} (${guard.longCount}L/${guard.shortCount}S)`);
                        continue;
                    }
                } catch (_guardErr) { /* guard is optional — never block trading on error */ }

                await this.executeTrade(mover, mover.strategy || 'momentum');
            }
        }
        return movers;
    }

    async tradingLoop() {
        this.resetDailyCounters();
        this.scanCount++;
        this.lastScanTime = new Date();
        await this.checkEndOfDay();
        await this.managePositions();
        if (!this.botRunning || this.botPaused) return;
        if (this.cachedDailyPnL < -MAX_DAILY_LOSS) return;
        if (isGoodTradingTime()) await this.scanMomentumBreakouts();
    }

    getStatus() {
        return {
            userId: this.userId,
            isRunning: this.botRunning,
            isPaused: this.botPaused,
            scanCount: this.scanCount,
            lastScanTime: this.lastScanTime,
            totalTradesToday: this.totalTradesToday,
            positions: this.positions.size,
            perfData: this.perfData,
            alpacaConfigured: !!(this.alpacaConfig.apiKey && this.alpacaConfig.secretKey)
        };
    }
}

// ── Engine-aware analyzeMomentum: same logic but uses engine's alpacaConfig & positions ──
async function analyzeMomentumForEngine(symbol, engine) {
    try {
        // [v11.0] Symbol quality filter — skip banned meme/penny stocks early
        if (BANNED_SYMBOLS.has(symbol)) return null;
        if (!isGoodTradingTime()) return null;
        const today = new Date().toISOString().split('T')[0];
        const bars = await fetchBarsWithCache(symbol, engine.alpacaConfig,
            { start: today, timeframe: '1Min', feed: 'sip', limit: 10000 });
        if (!bars || bars.length === 0) return null;
        const firstBar = bars[0];
        const lastBar = bars[bars.length - 1];
        const todayOpen = firstBar.o;
        const current = lastBar.c;
        const volumeToday = bars.reduce((sum, b) => sum + b.v, 0);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const prevDate = yesterday.toISOString().split('T')[0];
        const prevBars = await fetchBarsWithCache(symbol, engine.alpacaConfig,
            { start: prevDate, end: prevDate, timeframe: '1Day', feed: 'sip', limit: 1 });
        const prevVolume = prevBars?.[0]?.v || volumeToday;
        const percentChange = ((current - todayOpen) / todayOpen) * 100;
        const volumeRatio = volumeToday / (prevVolume || 1);
        const rsi = calculateRSI(bars);
        // [v11.0] Minimum price $20 — removes penny stock noise
        if (current < 20 || current > 1000) return null;
        if (volumeToday < 500000) return null;
        const vwap = calculateVWAP(bars);
        if (vwap && current < vwap) return null;
        const closes = bars.map(b => b.c);
        const ema9 = calculateEMA(closes, 9);
        const ema21 = calculateEMA(closes, 21);
        if (ema9 !== null && ema21 !== null && ema9 <= ema21) return null;
        const atr = calculateATR(bars);
        const atrPct = atr !== null && current > 0 ? atr / current : null;
        const candidates = [];
        const orbCandidate = buildOpeningRangeBreakoutCandidate({
            symbol,
            bars,
            current,
            rsi,
            vwap,
            volumeToday,
            positionsMap: engine.positions,
            atrPct
        });
        if (orbCandidate) candidates.push(orbCandidate);

        let momentumAllowed = true;
        const dailyHigh = Math.max(...bars.map(b => b.h));
        const dailyLow = Math.min(...bars.map(b => b.l));
        const dailyRange = dailyHigh - dailyLow;
        // [v14.0] Tightened from 0.90 → 0.65 — don't chase extended moves (matches global loop)
        if (dailyRange > 0 && (current - dailyLow) / dailyRange > 0.65) momentumAllowed = false;

        const adx = calculateADX(bars);
        // [v14.0] Raised from 15 → 20 — align with global loop; ADX < 20 = noise
        if (momentumAllowed && adx !== null && adx < 20) momentumAllowed = false;

        const macd = calculateMACD(bars);
        if (momentumAllowed && macd !== null && !macd.bullish) {
            const nearlyFlat = macd.histogram > -0.001;
            if (!nearlyFlat && !detectRSIBullishDivergence(bars)) momentumAllowed = false;
        }

        if (momentumAllowed) {
            try {
                const barUrl = `${engine.alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
                const dailyResp = await axios.get(barUrl, {
                    headers: { 'APCA-API-KEY-ID': engine.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': engine.alpacaConfig.secretKey },
                    params: { timeframe: '1Day', limit: 20, feed: 'sip' }
                });
                const dailyBars = dailyResp.data?.bars || [];
                if (dailyBars.length >= 5) {
                    const lookback = Math.min(9, dailyBars.length);
                    const sma9d = dailyBars.slice(-lookback).map(b => b.c).reduce((a, v) => a + v, 0) / lookback;
                    if (current < sma9d * 0.97) momentumAllowed = false;
                }
            } catch {}
        }
        let atrStop = null, atrTarget = null;
        if (atr !== null && current > 0) {
            let candidateStop   = current * (1 - atrPct * 1.5);
            const candidateTarget = current * (1 + atrPct * 3.0);
            // Ensure minimum stop distance of 1.5% to avoid noise hits
            const minStopPrice = current * (1 - 0.015); // 1.5% minimum distance
            if (candidateStop > minStopPrice) {
                candidateStop = minStopPrice; // Widen stop if ATR is too tight
            }
            const rr = candidateStop > 0 ? (candidateTarget - current) / (current - candidateStop) : 0;
            if (rr >= 1.8) { atrStop = candidateStop; atrTarget = candidateTarget; }
        }
        if (momentumAllowed) {
            let tier = null, config = null;
            const tierCandidates = [];
            if (percentChange >= MOMENTUM_CONFIG.tier3.threshold) tierCandidates.push('tier3');
            if (percentChange >= MOMENTUM_CONFIG.tier2.threshold) tierCandidates.push('tier2');
            if (percentChange >= MOMENTUM_CONFIG.tier1.threshold) tierCandidates.push('tier1');
            for (const candidate of tierCandidates) {
                const c = MOMENTUM_CONFIG[candidate];
                if (volumeRatio >= c.volumeRatio && volumeToday >= c.minVolume && rsi >= c.rsiMin && rsi <= c.rsiMax) {
                    tier = candidate; config = c; break;
                }
            }
            if (tier && config) {
                const tierPositions = Array.from(engine.positions.values()).filter(p => p.tier === tier).length;
                if (tierPositions < config.maxPositions) {
                    const bridgeResult = await queryStrategyBridge(symbol, bars, 'stock');
                    if (bridgeResult === null || !(bridgeResult.direction === 'short' && bridgeResult.confidence > 0.7)) {
                        const tierMultiplier = { tier1: 1, tier2: 2, tier3: 3 }[tier] || 1;
                        const rsiBonus = rsi >= 45 && rsi <= 65 ? 1.15 : 1.0;
                        const regimeProfile = evaluateStockRegimeSignal({
                            strategy: 'momentum',
                            percentChange,
                            volumeRatio,
                            rsi,
                            current,
                            vwap,
                            atrPct
                        });
                        if (regimeProfile.tradable) {
                            // [Tier3 Fix] Trend-expansion pullback gate: don't chase peaks —
                            // require price to have pulled back at least 1% from the session high.
                            if (regimeProfile.requirePullback) {
                                const recentHigh = Math.max(...bars.slice(-20).map(b => b.h));
                                const pullbackFromHigh = (recentHigh - current) / recentHigh;
                                if (pullbackFromHigh < 0.01) {
                                    console.log(`[REGIME] ${symbol} trend-expansion: waiting for pullback (only ${(pullbackFromHigh * 100).toFixed(2)}% from high)`);
                                    return null;
                                }
                            }
                            // [Tier3 Fix] Normalized momentum score — prevents chasing the most extended movers.
                            // Raw product (percentChange * volumeRatio * ...) was unbounded and dominated by
                            // percentChange, causing the bot to rank overextended stocks highest. Each core
                            // component is now capped to [0,1] and combined as a weighted average, then
                            // scaled by tierMultiplier.
                            const normMomentum = Math.min(Math.abs(parseFloat(percentChange)) / 8, 1.0); // caps at 8% move
                            const normVolume   = Math.min(parseFloat(volumeRatio.toFixed(2)) / 4, 1.0);  // caps at 4× avg volume
                            const normRsi      = rsiBonus > 1.0 ? 1.0 : 0.7;                             // goldilocks RSI zone → 1.0, else 0.7
                            const normRegime   = regimeProfile.quality;                                    // already [0,1]
                            const score = (normMomentum * 0.30 + normVolume * 0.25 + normRsi * 0.25 + normRegime * 0.20) * tierMultiplier;
                            candidates.push({
                                symbol, price: current, percentChange: percentChange.toFixed(2), volumeRatio: volumeRatio.toFixed(2),
                                volume: volumeToday, rsi: rsi.toFixed(2), vwap: vwap ? vwap.toFixed(2) : null,
                                tier, score: parseFloat(score.toFixed(3)), strategy: 'momentum', regime: regimeProfile.regime,
                                regimeScore: regimeProfile.quality, config,
                                entryVolume: volumeToday, atrStop, atrTarget, atrPct
                            });
                        }
                    }
                }
            }
        }
        // [RSI(2) Mean Reversion] — buy extreme short-term oversold pullbacks in structural uptrends.
        // Research: 71% win rate on QQQ; works on large-cap stocks trading above their 50-day SMA.
        // Entry: RSI(2) < 15, price above SMA50 (daily) AND above VWAP (intraday uptrend intact).
        // Exit: handled by exit manager (ratchet stops + momentum fade detection).
        // Uses tier1 config for conservative position sizing — this is mean-reversion, not breakout.
        if (bars.length >= 10) {
            const rsi2 = calculateRSI(bars, 2);

            // Fetch daily bars to compute SMA50 — needed to confirm structural uptrend.
            let sma50Daily = null;
            try {
                const barUrl50 = `${engine.alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
                const dailyResp50 = await axios.get(barUrl50, {
                    headers: { 'APCA-API-KEY-ID': engine.alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': engine.alpacaConfig.secretKey },
                    params: { timeframe: '1Day', limit: 55, feed: 'sip' }
                });
                const dBars50 = dailyResp50.data?.bars || [];
                if (dBars50.length >= 50) {
                    sma50Daily = dBars50.slice(-50).map(b => b.c).reduce((s, v) => s + v, 0) / 50;
                }
            } catch { /* daily bars unavailable — skip RSI(2) for this symbol */ }

            if (rsi2 < 15 && sma50Daily !== null && current > sma50Daily && vwap && current > vwap) {
                const rsi2Config = MOMENTUM_CONFIG.tier1;
                const tier1Positions = Array.from(engine.positions.values()).filter(p => p.tier === 'tier1').length;

                if (tier1Positions < rsi2Config.maxPositions) {
                    const regimeProfile = evaluateStockRegimeSignal({
                        strategy: 'rsi2MeanReversion',
                        percentChange,
                        volumeRatio,
                        rsi,
                        current,
                        vwap,
                        atrPct
                    });

                    if (!regimeProfile.tradable) {
                        console.log(`[Regime] ${symbol} RSI(2) MeanRev BLOCKED — ${regimeProfile.regime} (RSI2: ${rsi2.toFixed(1)})`);
                    }
                    if (regimeProfile.tradable) {
                        const normOversold = Math.min((15 - rsi2) / 15, 1.0);
                        const normTrend    = Math.min((current / sma50Daily - 1) * 10, 1.0);
                        const normVolume   = Math.min(volumeRatio / 3, 1.0);
                        const normRegime   = regimeProfile.quality;
                        const score = normOversold * 0.40 + normTrend * 0.30 + normVolume * 0.15 + normRegime * 0.15;

                        candidates.push({
                            symbol, price: current, percentChange: percentChange.toFixed(2),
                            volumeRatio: volumeRatio.toFixed(2), volume: volumeToday,
                            rsi: rsi.toFixed(2), vwap: vwap ? vwap.toFixed(2) : null,
                            tier: 'tier1', score: parseFloat(score.toFixed(3)),
                            strategy: 'rsi2MeanReversion', regime: regimeProfile.regime,
                            regimeScore: regimeProfile.quality, config: rsi2Config,
                            entryVolume: volumeToday, atrStop, atrTarget, atrPct,
                            rsi2
                        });
                        console.log(`[RSI(2) MeanRev] ${symbol} — RSI(2) ${rsi2.toFixed(1)}, price $${current.toFixed(2)} vs SMA50 $${sma50Daily.toFixed(2)}, score ${score.toFixed(3)}`);
                    }
                }
            }
        }

        if (candidates.length === 0) return null;
        candidates.sort((a, b) => (b.score || 0) - (a.score || 0));
        return candidates[0];
    } catch { return null; }
}

// ── EngineRegistry: userId → UserTradingEngine ──────────────────────────────
const engineRegistry = new Map(); // userId (string) → UserTradingEngine

async function getOrCreateEngine(userId) {
    const key = String(userId);
    if (engineRegistry.has(key)) return engineRegistry.get(key);
    try {
        const creds = await loadUserCredentials(userId, 'alpaca');
        const apiKey    = creds.ALPACA_API_KEY    || process.env.ALPACA_API_KEY;
        const secretKey = creds.ALPACA_SECRET_KEY || process.env.ALPACA_SECRET_KEY;
        const baseURL   = creds.ALPACA_BASE_URL   || process.env.ALPACA_BASE_URL;
        if (!apiKey || !secretKey) return null; // no creds yet
        const engine = new UserTradingEngine(userId, apiKey, secretKey, baseURL);
        await engine.loadStateFromDb();
        const tgCreds = await loadUserCredentials(userId, 'telegram');
        engine.updateCredentials(creds.ALPACA_API_KEY || process.env.ALPACA_API_KEY,
            creds.ALPACA_SECRET_KEY || process.env.ALPACA_SECRET_KEY,
            creds.ALPACA_BASE_URL || process.env.ALPACA_BASE_URL,
            { TELEGRAM_BOT_TOKEN: tgCreds.TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID: tgCreds.TELEGRAM_CHAT_ID });
        engineRegistry.set(key, engine);
        console.log(`🔧 [EngineRegistry] Engine registered for user ${userId} (${engineRegistry.size} total)`);
        return engine;
    } catch (e) {
        console.warn(`⚠️  [EngineRegistry] Failed to create engine for user ${userId}:`, e.message);
        return null;
    }
}

// ── ScanQueue: single interval drives all registered engines ─────────────────
// Engines run sequentially (not in parallel) to avoid rate limit spikes.
// Each engine gets an independent 60-second slot; staggered 6s apart on startup.
let scanQueueRunning = false;
let globalCredentialWarningShown = false;

// Dead-man heartbeat tracking
let _heartbeatAlertSent = false;
let _lastHeartbeatScanTime = Date.now();
function updateHeartbeatTimestamp() { _lastHeartbeatScanTime = Date.now(); _heartbeatAlertSent = false; }

async function runScanQueue() {
    updateHeartbeatTimestamp();
    if (scanQueueRunning) return; // previous cycle still running — skip
    scanQueueRunning = true;
    try {
        const engines = Array.from(engineRegistry.values());
        for (const engine of engines) {
            try { await engine.tradingLoop(); }
            catch (e) { console.error(`❌ [ScanQueue] Engine ${engine.userId} crashed:`, e.message); }
        }
        // Always run the default module-level loop (for env-var-only mode / backward compat)
        if (engines.length === 0) {
            // will be handled by the existing tradingLoop() call below
        }
        // Keep global lastScanTime in sync so /api/trading/status shows a live timestamp
        // even when user engines are handling the scans (engineRegistry.size > 0)
        if (engines.length > 0) {
            lastScanTime = new Date();
            lastScanCompletedAt = Date.now(); // health check uses this — must update when engines handle scanning
        }
    } finally {
        scanQueueRunning = false;
    }
}

async function tradingLoop() {
    updateHeartbeatTimestamp();
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`⏰ Trading Loop #${scanCount + 1} - ${new Date().toLocaleTimeString()} | Trades today: ${totalTradesToday}/${MAX_TRADES_PER_DAY} | Positions: ${positions.size}`);

    resetDailyCounters();
    scanCount++;
    lastScanTime = new Date();

    // Auto-optimizer: re-evaluate parameters every 4 hours
    if (Date.now() - lastOptimizationTime > OPTIMIZATION_INTERVAL) {
        try {
            const trades = globalThis._tradeEvaluations || [];
            const result = optimize(trades);
            if (result.improved) {
                optimizedParams = result.params;
                console.log(`[AUTO-OPTIMIZE] New params adopted: committee=${result.params.committeeThreshold}, R:R=${result.params.minRewardRisk} (WFE: ${result.wfe}, PF: ${result.metrics.profitFactor.toFixed(2)})`);
            } else {
                optimizedParams = null;
                console.log(`[AUTO-OPTIMIZE] Keeping defaults — ${result.reason}`);
            }
            // Log strategy performance
            const stratPerf = evaluateStrategies(trades);
            lastStrategyPerf = stratPerf; // [v14.1] Store globally for INACTIVE enforcement in trading loop
            for (const [strat, perf] of Object.entries(stratPerf)) {
                console.log(`[STRATEGY] ${strat}: ${perf.trades} trades, WR ${(perf.winRate*100).toFixed(0)}%, PF ${perf.profitFactor.toFixed(2)}, ${perf.active ? 'ACTIVE' : 'INACTIVE'}`);
            }
            lastOptimizationTime = Date.now();
        } catch (e) {
            console.log(`[AUTO-OPTIMIZE] Error: ${e.message}`);
            lastOptimizationTime = Date.now(); // don't retry immediately
        }
    }

    // Always manage existing positions (stop losses / trailing stops / EOD) even when
    // stopped or paused — we never want to be stuck in a position we can't exit.
    await checkEndOfDay();
    await managePositions();

    // Only scan for NEW entries when the bot is running and not paused.
    if (!botRunning) {
        console.log('⛔ Bot stopped — skipping new entry scan');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
    }
    if (botPaused) {
        console.log('⏸  Bot paused — skipping new entry scan');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
    }

    if (!hasGlobalAlpacaCredentials()) {
        if (!globalCredentialWarningShown) {
            console.log('🔑 Alpaca credentials not configured for the global stock bot — skipping module-level scans');
            globalCredentialWarningShown = true;
        }
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
    }
    globalCredentialWarningShown = false;

    // Daily loss circuit breaker — halt new entries if loss exceeds limit
    if (cachedDailyPnL < -MAX_DAILY_LOSS) {
        console.log(`🛑 [CIRCUIT BREAKER] Daily loss $${Math.abs(cachedDailyPnL).toFixed(2)} exceeds limit $${MAX_DAILY_LOSS} — no new entries today`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return;
    }

    try {
        if (isGoodTradingTime()) {
            await scanMomentumBreakouts();
        } else {
            const now = getESTDate();
            const isWeekend = now.getDay() === 0 || now.getDay() === 6;
            if (!isWeekend) {
                console.log(`⏸  Market not in optimal trading window (${now.toLocaleTimeString()} EST) - skipping scan`);
            }
        }
    } catch (err) {
        console.error('❌ Stock trading loop error:', err.message);
        recentErrors.push({ timestamp: Date.now(), error: 'Internal server error' });
        if (recentErrors.length > MAX_ERROR_HISTORY) recentErrors.shift();
    }

    lastScanCompletedAt = Date.now();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

app.get('/api/trades', async (req, res) => {
    if (!dbPool) return res.json({ success: false, error: 'DB not configured', trades: [] });
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const bot = req.query.bot || 'stock'; // default to this bot's trades, not all bots
        // Optional: filter to the calling user's trades when JWT is present
        const mine = req.query.mine === 'true';
        let userId = null;
        if (mine) {
            try {
                const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
                const auth = req.headers.authorization || '';
                if (auth.startsWith('Bearer ')) {
                    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
                    userId = decoded.sub;
                }
            } catch { /* ignore — fall back to all */ }
        }
        let q, params;
        if (userId && bot) {
            q = 'SELECT * FROM trades WHERE user_id=$1 AND bot=$2 ORDER BY created_at DESC LIMIT $3';
            params = [userId, bot, limit];
        } else if (userId) {
            q = 'SELECT * FROM trades WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2';
            params = [userId, limit];
        } else if (bot) {
            q = 'SELECT * FROM trades WHERE bot=$1 ORDER BY created_at DESC LIMIT $2';
            params = [bot, limit];
        } else {
            q = 'SELECT * FROM trades ORDER BY created_at DESC LIMIT $1';
            params = [limit];
        }
        const r = await dbPool.query(q, params);
        res.json({ success: true, trades: r.rows, count: r.rows.length });
    } catch (e) { res.status(500).json({ success: false, error: 'Internal server error', trades: [] }); }
});

function getOptionalTradeUserId(req) {
    if (req.query.mine !== 'true') return null;
    try {
        const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
        const auth = req.headers.authorization || '';
        if (!auth.startsWith('Bearer ')) return null;
        const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
        return decoded?.sub || null;
    } catch {
        return null;
    }
}

// Weekly / daily P&L summary across all bots
app.get('/api/trades/summary', async (req, res) => {
    if (!dbPool) return res.json({ success: false, error: 'DB not configured', summary: [] });
    try {
        const days = Math.min(parseInt(req.query.days) || 30, 90);
        const userId = getOptionalTradeUserId(req);
        const cleanPnlUsd = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN NULL ELSE pnl_usd END`;
        const whereClause = userId
            ? `WHERE user_id = $2 AND created_at >= NOW() - INTERVAL '1 day' * $1`
            : `WHERE created_at >= NOW() - INTERVAL '1 day' * $1`;
        const r = await dbPool.query(`
            SELECT
                bot,
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
            ${whereClause}
            GROUP BY bot, day
            ORDER BY day DESC, bot
        `, userId ? [days, userId] : [days]);
        // Also compute totals
        const totals = await dbPool.query(`
            SELECT
                bot,
                COUNT(*) AS total_all_trades,
                COUNT(*) FILTER (WHERE status='open') AS open_trades,
                COUNT(*) FILTER (WHERE status='closed') AS total_trades,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0) AS winners,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0) AS losers,
                COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnlUsd} = 0) AS breakeven_trades,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed'), 0)::FLOAT AS total_pnl,
                COALESCE(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} > 0), 0)::FLOAT AS gross_profit,
                COALESCE(ABS(SUM(${cleanPnlUsd}) FILTER (WHERE status='closed' AND ${cleanPnlUsd} < 0)), 0)::FLOAT AS gross_loss
            FROM trades
            ${userId ? 'WHERE user_id = $1' : ''}
            GROUP BY bot
        `, userId ? [userId] : []);
        res.json({ success: true, daily: r.rows, totals: totals.rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Internal server error', daily: [], totals: [] }); }
});

// Equity curve: daily cumulative P&L for charting
app.get('/api/performance/equity', async (req, res) => {
    if (!dbPool) return res.json({ success: true, data: [] });
    const days = Math.min(parseInt(req.query.days) || 90, 365);
    const botFilter = req.query.bot; // optional: 'stock', 'forex', 'crypto'
    try {
        const params = [days];
        let whereClauses = [`status = 'closed'`, `exit_time > NOW() - INTERVAL '1 day' * $1`];
        if (botFilter) { params.push(botFilter); whereClauses.push(`bot = $${params.length}`); }
        const result = await dbPool.query(`
            SELECT
                DATE_TRUNC('day', exit_time AT TIME ZONE 'America/New_York')::date AS date,
                ROUND(SUM(pnl_usd)::numeric, 2)                                    AS daily_pnl,
                COUNT(*)                                                            AS trades_closed,
                COUNT(*) FILTER (WHERE pnl_usd > 0)                                AS winners
            FROM trades
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY 1
            ORDER BY 1 ASC`, params);

        // Build cumulative sum in JS (simple fold)
        let cumulative = 0;
        const data = result.rows.map(r => {
            cumulative = Math.round((cumulative + parseFloat(r.daily_pnl)) * 100) / 100;
            return {
                date:           r.date,
                daily_pnl:      parseFloat(r.daily_pnl),
                cumulative_pnl: cumulative,
                trades_closed:  parseInt(r.trades_closed),
                winners:        parseInt(r.winners),
            };
        });
        res.json({ success: true, data });
    } catch (e) { res.status(500).json({ success: false, error: 'Internal server error' }); }
});

// Trade analytics: win rate by hour, symbol breakdown, tier breakdown
app.get('/api/trades/analytics', async (req, res) => {
    if (!dbPool) return res.json({ success: true, data: { byHour: [], bySymbol: [], byTier: [], byStrategy: [], byRegime: [] } });
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    try {
        const userId = getOptionalTradeUserId(req);
        const cleanPnlUsd = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN NULL ELSE pnl_usd END`;
        const cleanPnlPct = `CASE WHEN pnl_pct IS NULL OR pnl_pct::text = 'NaN' THEN NULL ELSE pnl_pct END`;
        const botFilter = req.query.bot; // optional: 'stock', 'forex', 'crypto'
        let filterClauses = [`status='closed'`, `COALESCE(close_reason, '') <> 'orphaned_restart'`, `entry_time > NOW() - INTERVAL '1 day' * $1`];
        const analyticsParams = [days];
        if (userId) { analyticsParams.push(userId); filterClauses.push(`user_id = $${analyticsParams.length}`); }
        if (botFilter) { analyticsParams.push(botFilter); filterClauses.push(`bot = $${analyticsParams.length}`); }
        const analyticsFilter = `WHERE ${filterClauses.join(' AND ')}`;
        const byHour = await dbPool.query(`
            SELECT EXTRACT(HOUR FROM entry_time AT TIME ZONE 'America/New_York') AS hour,
                   COUNT(*) FILTER (WHERE ${cleanPnlUsd} > 0) AS winners,
                   COUNT(*) AS total,
                   ROUND(AVG(${cleanPnlPct})::numeric, 2) AS avg_pnl_pct
            FROM trades
            ${analyticsFilter}
            GROUP BY 1 ORDER BY 1`, analyticsParams);

        const bySymbol = await dbPool.query(`
            SELECT symbol, bot,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE ${cleanPnlUsd} > 0) AS winners,
                   ROUND(AVG(${cleanPnlPct})::numeric, 2) AS avg_pnl_pct,
                   ROUND(AVG(EXTRACT(EPOCH FROM (exit_time - entry_time))/3600)::numeric, 1) AS avg_hold_hours
            FROM trades
            ${analyticsFilter}
            GROUP BY symbol, bot ORDER BY total DESC LIMIT 20`, analyticsParams);

        const byTier = await dbPool.query(`
            SELECT COALESCE(tier,'—') AS tier, bot,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE ${cleanPnlUsd} > 0) AS winners,
                   ROUND(AVG(${cleanPnlPct})::numeric, 2) AS avg_pnl_pct,
                   ROUND(SUM(${cleanPnlUsd})::numeric, 2) AS total_pnl
            FROM trades
            ${analyticsFilter}
            GROUP BY tier, bot ORDER BY total DESC`, analyticsParams);

        const byStrategy = await dbPool.query(`
            SELECT COALESCE(strategy,'unlabeled') AS strategy, bot,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE ${cleanPnlUsd} > 0) AS winners,
                   ROUND(AVG(${cleanPnlPct})::numeric, 2) AS avg_pnl_pct,
                   ROUND(SUM(${cleanPnlUsd})::numeric, 2) AS total_pnl
            FROM trades
            ${analyticsFilter}
            GROUP BY strategy, bot ORDER BY total DESC`, analyticsParams);

        const byRegime = await dbPool.query(`
            SELECT COALESCE(regime,'unlabeled') AS regime, bot,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE ${cleanPnlUsd} > 0) AS winners,
                   ROUND(AVG(${cleanPnlPct})::numeric, 2) AS avg_pnl_pct,
                   ROUND(SUM(${cleanPnlUsd})::numeric, 2) AS total_pnl
            FROM trades
            ${analyticsFilter}
            GROUP BY regime, bot ORDER BY total DESC`, analyticsParams);

        res.json({
            success: true,
            data: {
                byHour: byHour.rows,
                bySymbol: bySymbol.rows,
                byTier: byTier.rows,
                byStrategy: byStrategy.rows,
                byRegime: byRegime.rows
            }
        });
    } catch (e) { res.status(500).json({ success: false, error: 'Internal server error' }); }
});

app.post('/api/admin/trades/backfill-tags', requireJwtOrApiSecret, async (req, res) => {
    if (req.user?.role && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin only' });
    }
    try {
        const limit = Math.min(parseInt(req.body?.limit || req.query.limit || '500', 10), 5000);
        const result = await backfillTradeTags({ limit });
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

app.post('/api/admin/trades/repair-pnl', requireJwtOrApiSecret, async (req, res) => {
    if (req.user?.role && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Admin only' });
    }
    try {
        const limit = Math.min(parseInt(req.body?.limit || req.query.limit || '1000', 10), 5000);
        const result = await repairInvalidTradePnL({ limit });
        res.json({ success: true, ...result });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Admin: list all users + their engine status (admin role required)
app.get('/api/admin/users', requireJwt, async (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
    if (!dbPool) return res.json({ success: true, users: [] });
    try {
        const users = await dbPool.query(
            `SELECT u.id, u.email, u.name, u.role, u.created_at,
                    COUNT(DISTINCT uc.broker) AS brokers_configured,
                    es.state_json AS engine_state
             FROM users u
             LEFT JOIN user_credentials uc ON uc.user_id = u.id
             LEFT JOIN engine_state es ON es.user_id = u.id AND es.bot = 'stock'
             GROUP BY u.id, u.email, u.name, u.role, u.created_at, es.state_json
             ORDER BY u.created_at DESC`
        );
        const rows = users.rows.map(r => ({
            id: r.id,
            email: r.email,
            name: r.name,
            role: r.role,
            createdAt: r.created_at,
            brokersConfigured: parseInt(r.brokers_configured),
            engineRunning: r.engine_state?.botRunning ?? false,
            enginePaused:  r.engine_state?.botPaused  ?? false,
            totalTrades:   r.engine_state?.totalTradesToday ?? 0,
            activeInRegistry: engineRegistry.has(String(r.id)),
        }));
        res.json({ success: true, users: rows });
    } catch (e) { res.status(500).json({ success: false, error: 'Internal server error', users: [] }); }
});

// Admin: force-close stuck open trades (no matching exit recorded)
app.post('/api/admin/trades/fix-stuck', requireJwt, async (req, res) => {
    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin only' });
    if (!dbPool) return res.status(503).json({ success: false, error: 'No DB' });
    try {
        const { symbols, bot } = req.body || {};
        let query = `UPDATE trades SET status='closed', exit_price=entry_price, pnl_usd=0, pnl_pct=0,
                     close_reason='admin_cleanup', exit_time=NOW()
                     WHERE status='open' AND exit_time IS NULL`;
        const params = [];
        if (bot)             { params.push(bot);     query += ` AND bot=$${params.length}`; }
        if (symbols?.length) { params.push(symbols); query += ` AND symbol = ANY($${params.length})`; }
        query += ' RETURNING id, symbol, bot';
        const result = await dbPool.query(query, params);
        res.json({ success: true, fixed: result.rows.length, trades: result.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Trigger a live backtest scan (runs analyzeMomentum on all symbols, returns signals without executing trades)
let backtestRunning = false;
app.post('/api/backtest/run', async (req, res) => {
    if (backtestRunning) return res.status(409).json({ success: false, error: 'Backtest already running' });
    backtestRunning = true;
    const started = Date.now();
    try {
        const results = [];
        const symbols = popularStocks.getAllSymbols().slice(0, 50); // cap at 50 to avoid rate limits
        const batchSize = 10; // parallel batches — same pattern as scanMomentumBreakouts
        for (let i = 0; i < symbols.length; i += batchSize) {
            const batch = symbols.slice(i, i + batchSize);
            const settled = await Promise.allSettled(batch.map(s => analyzeMomentum(s, { backtestMode: true })));
            for (const r of settled) {
                if (r.status === 'fulfilled' && r.value) {
                    const signal = r.value;
                    results.push({ symbol: signal.symbol, tier: signal.tier, score: signal.score || 0,
                        rsi: signal.rsi, volumeRatio: signal.volumeRatio, percentChange: signal.percentChange,
                        price: signal.price });
                }
            }
            if (i + batchSize < symbols.length) await new Promise(r => setTimeout(r, 300)); // rate-limit pause
        }
        results.sort((a, b) => (b.score || 0) - (a.score || 0));
        const elapsed = ((Date.now() - started) / 1000).toFixed(1);
        res.json({ success: true, signals: results, scanned: symbols.length, elapsed: `${elapsed}s`,
            timestamp: new Date().toISOString() });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    } finally {
        backtestRunning = false;
    }
});

// ===== THRESHOLD ANALYSIS / BACKTEST SIMULATOR (v5.1) =====
// Reads historical trades from DB, re-scores them with adjustable thresholds,
// and returns projected win rates for the frontend backtest tool.
app.post('/api/backtest/threshold-analysis', async (req, res) => {
    if (!dbPool) return res.status(503).json({ success: false, error: 'Database not available' });

    try {
        const {
            // Adjustable thresholds (current defaults if not provided)
            rsiMin = 40, rsiMax = 66,
            volumeRatioMin = 1.8,
            minSignalScore = 0.75,
            minQuality = 0.65,
            adxMin = 20,
            days = 90,
            bot = 'stock',
        } = req.body || {};

        // Fetch closed trades with entry context
        const result = await dbPool.query(`
            SELECT symbol, direction, tier, strategy, regime, status,
                   entry_price, exit_price, pnl_usd, pnl_pct,
                   stop_loss, close_reason, entry_time, exit_time,
                   signal_score, rsi, volume_ratio, momentum_pct,
                   entry_context
            FROM trades
            WHERE status = 'closed' AND bot = $1
              AND pnl_pct IS NOT NULL AND exit_price IS NOT NULL
              AND entry_time > NOW() - INTERVAL '1 day' * $2
            ORDER BY entry_time ASC
        `, [bot, days]);

        const trades = result.rows;
        if (trades.length === 0) {
            return res.json({ success: true, trades: 0, message: 'No closed trades found' });
        }

        // Re-evaluate each trade against the proposed thresholds
        const evaluated = trades.map(t => {
            const ctx = t.entry_context || {};
            const tradeRsi = parseFloat(t.rsi || ctx.rsi || 0);
            const tradeVolRatio = parseFloat(t.volume_ratio || ctx.volumeRatio || 0);
            const tradeScore = parseFloat(t.signal_score || ctx.score || 0);
            const tradePnl = parseFloat(t.pnl_usd || 0);
            const tradePnlPct = parseFloat(t.pnl_pct || 0);
            const tradeAtrPct = parseFloat(ctx.atrPct || 0) || null;

            const isWin = tradePnl > 0;

            // Smooth quality score using the new interpolation functions
            const rsiScore = rsiQuality(tradeRsi || null);
            const volScore = volumeQuality(tradeVolRatio || null);
            const atrScore = tradeAtrPct ? atrQuality(tradeAtrPct) : 0.9;
            const factorCount = tradeAtrPct ? 3 : 2;
            const smoothQuality = Math.pow(rsiScore * volScore * atrScore, 1 / factorCount);

            // Apply threshold filters
            const passesRsi = tradeRsi >= rsiMin && tradeRsi <= rsiMax;
            const passesVolume = tradeVolRatio >= volumeRatioMin;
            const passesScore = tradeScore >= minSignalScore || tradeScore === 0; // 0 = no score recorded
            const passesQuality = smoothQuality >= minQuality;

            const wouldPass = passesRsi && passesVolume && passesScore && passesQuality;

            return {
                symbol: t.symbol,
                tier: t.tier,
                regime: t.regime,
                closeReason: t.close_reason,
                pnl: tradePnl,
                pnlPct: tradePnlPct,
                isWin,
                rsi: tradeRsi,
                volumeRatio: tradeVolRatio,
                signalScore: tradeScore,
                smoothQuality: parseFloat(smoothQuality.toFixed(3)),
                components: {
                    rsi: parseFloat(rsiScore.toFixed(3)),
                    volume: parseFloat(volScore.toFixed(3)),
                    atr: parseFloat(atrScore.toFixed(3)),
                },
                passesRsi, passesVolume, passesScore, passesQuality,
                wouldPass,
                entryTime: t.entry_time,
            };
        });

        // Calculate stats for all trades vs. filtered trades
        const allTrades = evaluated;
        const passingTrades = evaluated.filter(t => t.wouldPass);
        const filteredOut = evaluated.filter(t => !t.wouldPass);

        const calcStats = (arr) => {
            if (arr.length === 0) return { count: 0, wins: 0, winRate: 0, avgPnl: 0, totalPnl: 0, profitFactor: 0 };
            const wins = arr.filter(t => t.isWin).length;
            const totalPnl = arr.reduce((s, t) => s + t.pnl, 0);
            const grossWin = arr.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0);
            const grossLoss = Math.abs(arr.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0));
            return {
                count: arr.length,
                wins,
                winRate: parseFloat(((wins / arr.length) * 100).toFixed(1)),
                avgPnl: parseFloat((totalPnl / arr.length).toFixed(2)),
                totalPnl: parseFloat(totalPnl.toFixed(2)),
                profitFactor: grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : grossWin > 0 ? 999 : 0,
            };
        };

        // Sensitivity analysis: vary each threshold and show impact
        const sensitivity = {};
        const thresholdRanges = {
            rsiMin: [30, 35, 38, 40, 42, 45, 48],
            rsiMax: [60, 63, 66, 68, 70, 72, 75],
            volumeRatioMin: [1.0, 1.2, 1.5, 1.8, 2.0, 2.2, 2.5],
            minQuality: [0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80],
        };

        for (const [param, values] of Object.entries(thresholdRanges)) {
            sensitivity[param] = values.map(val => {
                const filtered = allTrades.filter(t => {
                    if (param === 'rsiMin') return t.rsi >= val && t.rsi <= rsiMax && t.passesVolume && t.passesQuality;
                    if (param === 'rsiMax') return t.rsi >= rsiMin && t.rsi <= val && t.passesVolume && t.passesQuality;
                    if (param === 'volumeRatioMin') return t.passesRsi && t.volumeRatio >= val && t.passesQuality;
                    if (param === 'minQuality') return t.passesRsi && t.passesVolume && t.smoothQuality >= val;
                    return t.wouldPass;
                });
                const stats = calcStats(filtered);
                return { value: val, ...stats };
            });
        }

        // By close reason breakdown
        const byCloseReason = {};
        for (const t of allTrades) {
            const reason = t.closeReason || 'unknown';
            if (!byCloseReason[reason]) byCloseReason[reason] = { total: 0, wins: 0, totalPnl: 0 };
            byCloseReason[reason].total++;
            if (t.isWin) byCloseReason[reason].wins++;
            byCloseReason[reason].totalPnl += t.pnl;
        }
        for (const r of Object.values(byCloseReason)) {
            r.winRate = r.total > 0 ? parseFloat(((r.wins / r.total) * 100).toFixed(1)) : 0;
            r.totalPnl = parseFloat(r.totalPnl.toFixed(2));
        }

        res.json({
            success: true,
            thresholds: { rsiMin, rsiMax, volumeRatioMin, minSignalScore, minQuality, adxMin },
            current: calcStats(allTrades),
            projected: calcStats(passingTrades),
            filteredOut: calcStats(filteredOut),
            sensitivity,
            byCloseReason,
            trades: evaluated,
            timestamp: new Date().toISOString(),
        });
    } catch (e) {
        console.error('[ThresholdAnalysis] Error:', e.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Pre-seed strategy bridge _price_cache for all KNOWN_PAIRS symbols + major forex pairs
// so pairs trading and forex bridge advisory activates immediately on startup
// All unique symbols from KNOWN_PAIRS in strategy_bridge.py — keep in sync
const KNOWN_PAIRS_SYMBOLS = [
    'XOM','CVX','JPM','BAC','AAPL','MSFT','KO','PEP','HD','LOW','V','MA',
    'GS','MS','T','VZ','WMT','TGT','GLD','SLV','SPY','QQQ','DAL','UAL'
];
const FOREX_WARMUP_PAIRS  = ['EUR_USD','GBP_USD','USD_JPY','USD_CHF','AUD_USD','USD_CAD','NZD_USD','EUR_JPY','GBP_JPY','EUR_GBP','AUD_JPY','EUR_AUD'];

app.post('/api/bridge/warmup', async (req, res) => {
    const results = { seeded: [], failed: [], bridgeUrl: BRIDGE_URL };

    // ── Stock pairs (Alpaca daily bars) — parallel fetches ──────────────────
    // Must supply start= — Alpaca returns null bars without it
    const warmupStart = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await Promise.allSettled(KNOWN_PAIRS_SYMBOLS.map(async (symbol) => {
        try {
            const barUrl = `${alpacaConfig.dataURL}/v2/stocks/${symbol}/bars`;
            const barResp = await axios.get(barUrl, {
                headers: { 'APCA-API-KEY-ID': alpacaConfig.apiKey, 'APCA-API-SECRET-KEY': alpacaConfig.secretKey },
                params: { timeframe: '1Day', limit: 100, start: warmupStart, feed: 'sip' }
            });
            const bars = barResp.data?.bars || [];
            if (bars.length < 30) { results.failed.push(`${symbol}: only ${bars.length} bars`); return; }
            const prices = bars.map(b => ({
                timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v
            }));
            await axios.post(`${BRIDGE_URL}/signal`, { symbol, prices, asset_class: 'stock' }, { timeout: 8000 });
            results.seeded.push(symbol);
        } catch (e) {
            results.failed.push(`${symbol}: ${e.message}`);
        }
    }));

    // ── Forex pairs (OANDA H1 candles — only if creds available) ────────────
    const oandaToken   = process.env.OANDA_ACCESS_TOKEN;
    const oandaBase    = process.env.OANDA_PRACTICE !== 'false'
        ? 'https://api-fxpractice.oanda.com'
        : 'https://api-fxtrade.oanda.com';

    if (oandaToken) {
        await Promise.allSettled(FOREX_WARMUP_PAIRS.map(async (pair) => {
            try {
                const candleResp = await axios.get(
                    `${oandaBase}/v3/instruments/${pair}/candles?granularity=H1&count=100&price=M`,
                    { headers: { 'Authorization': `Bearer ${oandaToken}` }, timeout: 8000 }
                );
                const candles = candleResp.data?.candles || [];
                if (candles.length < 30) { results.failed.push(`${pair}: only ${candles.length} candles`); return; }
                const prices = candles.map(c => ({
                    timestamp: c.time,
                    open:   parseFloat(c.mid.o),
                    high:   parseFloat(c.mid.h),
                    low:    parseFloat(c.mid.l),
                    close:  parseFloat(c.mid.c),
                    volume: c.volume || 1
                }));
                await axios.post(`${BRIDGE_URL}/signal`, { symbol: pair, prices, asset_class: 'forex' }, { timeout: 8000 });
                results.seeded.push(pair);
            } catch (e) {
                results.failed.push(`${pair}: ${e.message}`);
            }
        }));
    } else {
        results.failed.push('forex: OANDA_ACCESS_TOKEN not set — skipped forex pairs');
    }

    res.json({ success: true, ...results });
});

// [Alpha] Portfolio allocation signal — exposes bot's current edge for capital allocation
app.get('/api/trading/alpha-signal', (req, res) => {
    const evals = globalThis._tradeEvaluations || [];
    const recent = evals.slice(-20); // last 20 trades

    if (recent.length < 3) {
        return res.json({ success: true, data: { edge: 0.5, confidence: 0, sampleSize: recent.length, message: 'Insufficient data' } });
    }

    const winRate = recent.filter(e => e.pnl > 0).length / recent.length;
    const avgPnl = recent.reduce((s, e) => s + (e.pnlPct || 0), 0) / recent.length;
    const avgCommittee = recent.reduce((s, e) => s + (e.signals?.committeeConfidence || 0), 0) / recent.length;

    // Edge score 0-1: combines win rate, average P&L direction, and signal confidence
    const edge = Math.max(0, Math.min(1,
        (winRate * 0.4) +
        (Math.min(1, Math.max(0, avgPnl * 10 + 0.5)) * 0.3) +
        (avgCommittee * 0.3)
    ));

    const regime = globalThis._marketRegime || { regime: 'medium' };

    res.json({
        success: true,
        data: {
            bot: 'stock',
            edge: parseFloat(edge.toFixed(3)),
            winRate: parseFloat((winRate * 100).toFixed(1)),
            avgPnlPct: parseFloat((avgPnl * 100).toFixed(3)),
            avgCommitteeConfidence: parseFloat(avgCommittee.toFixed(3)),
            regime: regime.regime,
            activePositions: positions.size,
            sampleSize: recent.length,
            recommendation: edge > 0.6 ? 'increase_allocation' : edge < 0.4 ? 'decrease_allocation' : 'maintain'
        }
    });
});

// [Alpha] Combined portfolio allocation signal — aggregates edge from all bots
app.get('/api/portfolio/alpha', async (req, res) => {
    const signals = [];

    // Local stock bot edge
    try {
        const stockEvals = globalThis._tradeEvaluations || [];
        const recent = stockEvals.slice(-20);
        if (recent.length >= 3) {
            const winRate = recent.filter(e => e.pnl > 0).length / recent.length;
            const avgPnl = recent.reduce((s, e) => s + (e.pnlPct || 0), 0) / recent.length;
            signals.push({ bot: 'stock', edge: winRate * 0.5 + Math.min(1, avgPnl * 10 + 0.5) * 0.5, sampleSize: recent.length });
        }
    } catch {}

    // Query forex bot
    try {
        const forexRes = await axios.get((process.env.FOREX_BOT_URL || 'http://localhost:3005') + '/api/forex/alpha-signal', { timeout: 2000 });
        if (forexRes.data?.data) signals.push({ bot: 'forex', ...forexRes.data.data });
    } catch {}

    // Query crypto bot
    try {
        const cryptoRes = await axios.get((process.env.CRYPTO_BOT_URL || 'http://localhost:3006') + '/api/crypto/alpha-signal', { timeout: 2000 });
        if (cryptoRes.data?.data) signals.push({ bot: 'crypto', ...cryptoRes.data.data });
    } catch {}

    // Calculate recommended allocation weights
    const totalEdge = signals.reduce((s, sig) => s + (sig.edge || 0.5), 0);
    const allocations = signals.map(sig => ({
        bot: sig.bot,
        edge: sig.edge || 0.5,
        allocationPct: totalEdge > 0 ? parseFloat(((sig.edge || 0.5) / totalEdge * 100).toFixed(1)) : 33.3,
        recommendation: sig.recommendation || 'maintain'
    }));

    res.json({
        success: true,
        data: {
            allocations,
            totalEdge: parseFloat(totalEdge.toFixed(3)),
            timestamp: Date.now()
        }
    });
});

app.listen(PORT, async () => {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║     🚀 IMPROVED UNIFIED TRADING BOT - STARTED             ║');
    console.log('╠════════════════════════════════════════════════════════════╣');
    console.log('║  NEW FEATURES:                                             ║');
    console.log('║  ✅ Time-Based Exits (max 7 days)                          ║');
    console.log('║  ✅ Momentum Reversal Detection                            ║');
    console.log('║  ✅ Aggressive Trailing Stops (lock 85-92%)                ║');
    console.log('║  ✅ Dynamic Profit Targets                                 ║');
    console.log('║  ✅ Volume Confirmation                                    ║');
    console.log('║  ✅ JWT Auth + PostgreSQL Users                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    await initDb().catch(e => console.warn('Auth DB init error:', e.message));

    // [v6.2] Hydrate agent metadata from DB (survives Railway ephemeral FS wipes)
    await hydrateAgentMetadataFromDB().catch(e => console.warn('Agent hydration error:', e.message));

    // [Persistence] Load evaluations from DB so weight optimizer survives Railway redeploys
    globalThis._tradeEvaluations = await loadEvaluationsFromDB().catch(e => {
        console.warn('[Persistence] Evaluation load failed, starting empty:', e.message);
        return [];
    });

    // ── Hydrate perfData from DB so stats survive redeploys ──
    if (dbPool && perfData.totalTrades === 0) {
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
                FROM trades WHERE bot='stock'
            `);
            const row = dbStats.rows[0];
            const total = parseInt(row.total) || 0;
            const winners = parseInt(row.winners) || 0;
            const losers = parseInt(row.losers) || 0;
            const winAmt = parseFloat(row.win_amount) || 0;
            const lossAmt = parseFloat(row.loss_amount) || 0;
            if (total > 0) {
                perfData.totalTrades = total;
                perfData.winningTrades = winners;
                perfData.losingTrades = losers;
                perfData.winRate = parseFloat(((winners / total) * 100).toFixed(1));
                perfData.totalProfit = parseFloat(row.total_pnl) || 0;
                perfData.totalWinAmount = winAmt;
                perfData.totalLossAmount = lossAmt;
                perfData.profitFactor = total < 5 ? 0
                    : lossAmt > 0 ? parseFloat((winAmt / lossAmt).toFixed(2))
                    : winAmt > 0 ? 9.99 : 0;
            }
            // Consecutive losses from most recent trades
            const recent = await dbPool.query(`
                SELECT ${cleanPnl} AS pnl FROM trades
                WHERE bot='stock' AND status='closed' AND ${cleanPnl} IS NOT NULL
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
            perfData.consecutiveLosses = consec;
            perfData.maxConsecutiveLosses = Math.max(perfData.maxConsecutiveLosses, maxConsec);
            savePerfData();
            console.log(`📊 Hydrated perfData from DB: ${total} trades, ${winners}W/${losers}L, PF ${perfData.profitFactor}, Win $${winAmt.toFixed(2)}, Loss $${lossAmt.toFixed(2)}`);
        } catch (e) { console.warn('⚠️  DB perfData hydration failed:', e.message); }
    }

    // ── Load credentials from DB into process.env (fallback: env vars already set) ──
    // Loads the first registered user's keys so the bot can trade immediately after restart.
    try {
        if (dbPool) {
            const firstUser = await dbPool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
            if (firstUser.rows.length > 0) {
                const userId = firstUser.rows[0].id;
                for (const broker of ['alpaca', 'telegram', 'sms']) {
                    const creds = await loadUserCredentials(userId, broker);
                    for (const [key, value] of Object.entries(creds)) {
                        if (!process.env[key]) process.env[key] = value; // don't overwrite Railway env vars
                    }
                    if (Object.keys(creds).length > 0) console.log(`🔑 Loaded ${broker} credentials from DB for user ${userId}`);
                }
                // Refresh in-memory alpaca config
                if (process.env.ALPACA_API_KEY)    alpacaConfig.apiKey    = process.env.ALPACA_API_KEY;
                if (process.env.ALPACA_SECRET_KEY) alpacaConfig.secretKey = process.env.ALPACA_SECRET_KEY;
                if (process.env.ALPACA_BASE_URL)   alpacaConfig.baseURL   = process.env.ALPACA_BASE_URL;
                // Reinitialize Telegram after DB credentials are loaded
                if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                    if (!process.env.TELEGRAM_ALERTS_ENABLED) process.env.TELEGRAM_ALERTS_ENABLED = 'true';
                    telegramAlerts = getTelegramAlertService();
                    if (telegramAlerts.enabled) {
                        console.log('📱 [TELEGRAM] Reinitialized with DB credentials - stock alerts enabled');
                    }
                }
            }
        }
    } catch (e) {
        console.warn('⚠️  Startup credential load failed:', e.message);
    }

    // ── DB Reconciliation: close orphaned 'open' trades not in memory ──
    // Runs at startup after positions are loaded from disk.
    // Any DB row still 'open' for a symbol we don't track = orphaned on restart.
    // Two passes: (1) system-level orphans (user_id IS NULL), (2) stale orphans from any user.
    try {
        if (dbPool) {
            const orphaned = await dbPool.query(
                `SELECT id, symbol FROM trades WHERE bot='stock' AND status='open'
                 AND (user_id IS NULL OR entry_time < NOW() - make_interval(days => $1))`,
                [EXIT_CONFIG.stalePositionDays]
            );
            let closedCount = 0;
            for (const row of orphaned.rows) {
                if (!positions.has(row.symbol)) {
                    await dbPool.query(
                        `UPDATE trades SET status='closed', exit_price=entry_price, pnl_usd=0, pnl_pct=0,
                         close_reason='orphaned_restart', exit_time=NOW() WHERE id=$1`,
                        [row.id]
                    );
                    closedCount++;
                }
            }
            if (closedCount > 0) {
                console.log(`🧹 Closed ${closedCount} orphaned DB trade(s) from previous session`);
            }
        }
    } catch (e) {
        console.warn('⚠️  DB reconciliation failed:', e.message);
    }

    if (process.env.AUTO_REPAIR_TRADE_PNL !== 'false') {
        setTimeout(async () => {
            try {
                // [v17.1] First normalize percentage pnl_pct to decimal across all bots
                await migratePnlPctToDecimal();
                const repaired = await repairInvalidTradePnL({ limit: 5000 });
                if (repaired.repaired > 0) {
                    console.log(`🩹 Repaired ${repaired.repaired} trade(s) with invalid stored P&L`);
                }
            } catch (e) {
                console.warn('⚠️  Trade P&L repair failed:', e.message);
            }
        }, 15000);
    }

    // Pre-seed strategy bridge pairs cache 30s after startup (non-blocking).
    // Use the Railway public URL if available so this works on Railway where
    // localhost:<PORT> is not reachable from the same container via HTTP.
    // Also re-runs every 2h so bridge cache stays warm after bridge restarts.
    if (process.env.AUTO_BACKFILL_TRADE_TAGS !== 'false') {
        setTimeout(async () => {
            try {
                const result = await backfillTradeTags({
                    limit: parseInt(process.env.TRADE_TAG_BACKFILL_LIMIT || '1500', 10)
                });
                if (result.updated > 0) {
                    console.log(`🏷️ Backfilled trade tags: ${result.updated}/${result.scanned}`);
                }
            } catch (e) {
                console.warn('⚠️  Trade tag backfill failed:', e.message);
            }
        }, 8000);
    }

    function runBridgeWarmup() {
        const selfUrl = process.env.RAILWAY_PUBLIC_DOMAIN
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
            : `http://localhost:${PORT}`;
        axios.post(`${selfUrl}/api/bridge/warmup`, {}, { timeout: 120000 })
            .then(r => console.log(`✅ Bridge warm-up: seeded ${r.data?.seeded?.length ?? 0} symbols, failed ${r.data?.failed?.length ?? 0}`))
            .catch(e => console.warn('⚠️  Bridge warm-up failed:', e.message));
    }
    setTimeout(runBridgeWarmup, 30000);
    setInterval(runBridgeWarmup, 2 * 60 * 60 * 1000); // re-seed every 2h

    await tradingLoop();

    // ── Auto-restart engines for users who had isRunning=true at last save ──
    async function autoRestartEngines() {
        if (!dbPool) return;
        try {
            const result = await dbPool.query(
                `SELECT es.user_id, es.state_json AS state, u.email
                 FROM engine_state es
                 JOIN users u ON u.id = es.user_id
                 WHERE es.bot = 'stock' AND (es.state_json->>'botRunning')::boolean = true`
            );
            if (result.rows.length === 0) return;
            console.log(`🔄 Auto-restarting engines for ${result.rows.length} user(s)...`);
            for (const row of result.rows) {
                try {
                    const engine = await getOrCreateEngine(row.user_id);
                    if (engine && !engine.botRunning) {
                        engine.botRunning = true;
                        engine.botPaused = false;
                        engine.savePerfData();
                        console.log(`✅ Auto-restarted engine for user ${row.email}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to auto-restart engine for user ${row.user_id}:`, e.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ autoRestartEngines failed:', e.message);
        }
    }

    setTimeout(() => autoRestartEngines().catch(e => console.warn('Auto-restart error:', e.message)), 5000);

    // ── Register engines for all existing users with Alpaca credentials ──────
    // Staggered 6s apart to avoid burst API calls; runs 5s after startup so DB is warm
    setTimeout(async () => {
        try {
            if (dbPool) {
                const users = await dbPool.query('SELECT id FROM users ORDER BY id ASC');
                let delay = 0;
                for (const row of users.rows) {
                    setTimeout(async () => {
                        try { await getOrCreateEngine(row.id); }
                        catch (e) { console.warn(`⚠️  Engine init failed for user ${row.id}:`, e.message); }
                    }, delay);
                    delay += 6000; // 6s stagger between users
                }
            }
        } catch (e) { console.warn('⚠️  User engine pre-registration failed:', e.message); }
    }, 5000);

    // Default single-loop for env-var-only mode + multi-user ScanQueue
    setInterval(async () => {
        try {
            // Run ScanQueue with timeout — if a broker API hangs, don't block forever
            const scanTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('ScanQueue timeout (90s)')), 90000));
            await Promise.race([runScanQueue(), scanTimeout]).catch(e => {
                console.error('❌ ScanQueue error:', e.message);
                scanQueueRunning = false; // reset stuck flag
            });
            // Always run global tradingLoop when no per-user engine is active
            const anyEngineRunning = Array.from(engineRegistry.values()).some(e => e.botRunning);
            if (engineRegistry.size === 0 || !anyEngineRunning) {
                await tradingLoop();
            }
        } catch (e) { console.error('❌ Stock loop crashed:', e); }
    }, 60000);

    // Dead-man heartbeat: alert if no scan in >2h during market hours
    setInterval(() => {
        const now = new Date();
        const estHour = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(now));
        const estDay = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
        const isMarketHours = !['Sat', 'Sun'].includes(estDay) && estHour >= 10 && estHour < 16;
        if (!isMarketHours) return;
        const silentMinutes = Math.floor((Date.now() - _lastHeartbeatScanTime) / 60000);
        if (silentMinutes >= 120 && !_heartbeatAlertSent) {
            _heartbeatAlertSent = true;
            telegramAlerts.sendHeartbeatAlert('Stock Bot', silentMinutes).catch(err => console.warn('[ALERT]', err.message));
        }
    }, 30 * 60 * 1000);

    // [Improvement 2] Run weight optimization every 4 hours
    setInterval(() => {
        const newWeights = optimizeCommitteeWeights();
        if (newWeights) {
            committeeWeights = newWeights;
            console.log('[AutoLearn] Committee weights updated');
        }
    }, 4 * 60 * 60 * 1000);

    // [Improvement 4] Run signal decay detection every 2 hours
    setInterval(() => {
        detectSignalDecay();
    }, 2 * 60 * 60 * 1000);

    // [Improvement 2] Initial optimization run after 10s (bot fully initialized)
    setTimeout(() => {
        const newWeights = optimizeCommitteeWeights();
        if (newWeights) committeeWeights = newWeights;
    }, 10000);
});

// ===== GRACEFUL SHUTDOWN =====
const gracefulShutdown = (signal) => {
    console.log(`\n👋 Received ${signal}. Shutting down gracefully...`);

    // Stop memory manager
    memoryManager.stop();

    // Log final memory state
    const finalReport = memoryManager.getReport();
    console.log(`📊 Final Memory: ${finalReport.heap.used}MB used, ${finalReport.metrics.totalGCs} GCs performed`);
    console.log(`📈 Active Positions: ${positions.size}`);
    console.log(`📊 Total Trades Today: ${totalTradesToday}`);

    // Give time for cleanup
    setTimeout(() => {
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
    }, 1000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    metrics.recordError('uncaught_exception', 'critical');
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    metrics.recordError('unhandled_rejection', 'error');
});
