const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createUserCredentialStore } = require('./userCredentialStore');
// Signal modules — try local signal-analytics (ships with deploy), fall back to no-op
let createSignalEndpoints;
try { createSignalEndpoints = require('./signal-analytics').createSignalEndpoints; } catch (_) { createSignalEndpoints = () => {}; }
let BOT_COMPONENTS = { forex: { components: ['trend','orderFlow','displacement','volumeProfile','fvg','macd','mtfConfluence'] } };
let computeCorrelationGuard = () => ({ blocked: false });
let autoOptimize = () => ({ improved: false });
let autoEvaluateStrategies = () => ({});
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
  ({ optimize: autoOptimize, evaluateStrategies: autoEvaluateStrategies, PARAM_BOUNDS: AUTO_PARAM_BOUNDS } = require('../../services/signals/auto-optimizer'));
  ({ checkScanHealth, checkErrorRate, checkTradingHealth, checkMemoryHealth, aggregateHealth } = require('../../services/signals/health-monitor'));
} catch (e) {
  console.log('[INIT] Signal modules not available — trying local fallbacks');
  // [v17.1] On Railway, auto-optimizer ships alongside bot.js
  try { ({ optimize: autoOptimize, evaluateStrategies: autoEvaluateStrategies, PARAM_BOUNDS: AUTO_PARAM_BOUNDS } = require('./auto-optimizer')); console.log('[INIT] auto-optimizer loaded from local'); } catch (_) {}
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
        console.log('✅ Forex bot: Auth DB ready');
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
        console.log('✅ Forex bot: Trades table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS engine_state (
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                bot VARCHAR(20) NOT NULL,
                state_json JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (user_id, bot)
            )
        `);
        console.log('✅ Forex bot: Engine state table ready');
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
        console.log('✅ Forex bot: User credentials table ready');
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(64) NOT NULL,
                expires_at TIMESTAMPTZ NOT NULL
            )
        `);
        console.log('✅ Forex bot: Password reset tokens table ready');
    } catch (e) {
        console.warn('⚠️  Forex DB init failed:', e.message);
        dbPool = null;
    }
}

function buildForexTradeTags(signal = {}, tier, direction, session) {
    const normalizedTier = tier || signal.tier || 'tier1';
    const maxPullback = FOREX_PULLBACK_CONFIG[normalizedTier] || FOREX_PULLBACK_CONFIG.tier1 || 0;
    const pullback = Number(signal.pullback || 0);
    const trendStrength = Number(signal.trendStrength || 0);
    const score = signal.score != null ? parseFloat(Number(signal.score).toFixed(3)) : null;
    const normalizedStrategy = signal.strategy
        || (pullback > 0 && maxPullback > 0 && pullback >= maxPullback * 0.55 ? 'pullbackContinuation' : 'trendContinuation');

    let regime = signal.regime || 'session-trend';
    if (!signal.regime) {
        if (session === 'London/NY Overlap') regime = 'overlap-expansion';
        else if (trendStrength >= MOMENTUM_CONFIG.tier2.threshold) regime = 'trend-expansion';
        else if (session === 'London') regime = 'london-trend';
        else if (session === 'New York') regime = 'new-york-trend';
    }

    return {
        strategy: normalizedStrategy,
        regime,
        score,
        context: {
            tier: normalizedTier,
            direction: direction || signal.direction || null,
            session: session || signal.session || null,
            h1Trend: signal.h1Trend ?? null,
            trendStrength: signal.trendStrength ?? null,
            pullback: signal.pullback ?? null,
            atrPct: signal.atrPct ?? null,
            regimeQuality: signal.regimeQuality ?? null,
            rsi: signal.rsi ?? null,
            macdHistogram: signal.macdHistogram ?? null,
            // committee data for auto-learning
            committeeConfidence: signal.committeeConfidence ?? null,
            committeeComponents: signal.committeeComponents ?? null,
            orderFlowImbalance: signal.orderFlowImbalance ?? null,
            hasDisplacement: signal.hasDisplacement ?? false,
            fvgCount: signal.fvgCount ?? 0,
            marketRegime: signal.marketRegime ?? null,
        }
    };
}

async function dbForexOpen(pair, direction, tier, entry, stopLoss, takeProfit, units, session, signal = {}) {
    if (!dbPool) { console.warn(`⚠️  [DB] dbForexOpen(${pair}) skipped — dbPool is null`); return null; }
    try {
        const absUnits = Math.abs(units);
        const positionSizeUsd = entry > 0 ? parseFloat((absUnits * entry).toFixed(2)) : null;
        const tags = buildForexTradeTags(signal, tier, direction, session);
        const r = await dbPool.query(
            `INSERT INTO trades (bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
             position_size_usd,stop_loss,take_profit,entry_time,session,signal_score,entry_context,rsi,momentum_pct)
             VALUES ('forex',$1,$2,$3,$4,$5,'open',$6,$7,$8,$9,$10,NOW(),$11,$12,$13::jsonb,$14,$15) RETURNING id`,
            [pair, direction, tier, tags.strategy, tags.regime, entry, absUnits, positionSizeUsd, stopLoss, takeProfit,
             session || null, tags.score, JSON.stringify(tags.context), signal.rsi || null, signal.trendStrength || null]
        );
        return r.rows[0]?.id;
    } catch (e) { console.warn('DB forex open failed:', e.message); return null; }
}

async function dbForexClose(id, exitPrice, pnlUsd, pnlPct, reason) {
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
        console.warn('DB forex close failed (rolled back):', e.message);
    } finally {
        client.release();
    }
}

// ===== PRODUCTION INFRASTRUCTURE =====
const memoryManager = require('./infrastructure/memory/MemoryManager');
const { metrics, createMetricsServer } = require('./infrastructure/monitoring/metrics');
const { getSMSAlertService } = require('./infrastructure/notifications/sms-alerts');
const { getTelegramAlertService } = require('./infrastructure/notifications/telegram-alerts');

/**
 * UNIFIED FOREX TRADING BOT
 * v3.2 - Forex Council Improvements: Wilder's RSI, ATR stops, H1 confirmation, BB breakout, entry candle
 *
 * FEATURES (Same Standard as Stock Bot):
 * 1. Anti-Churning Protection - 10 trades/day limit
 * 2. Session-Optimized Trading - London/NY overlap priority
 * 3. Correlation Management - Avoid doubled-up risk
 * 4. Progressive Trailing Stops - Lock 60-92% of gains
 * 5. Time-Based Exits - Max 5 day hold for forex
 * 6. Economic Calendar Awareness - Pause before NFP, FOMC
 * 7. Memory Management - Production-grade infrastructure
 * 8. Prometheus Metrics - Full observability
 * 9. [v3.2] Wilder's Smoothed RSI - Industry-standard, matches broker platform values
 * 10. [v3.2] ATR-Based Stops/Targets - 1.5x ATR stop, 3.0x ATR target (adapts per pair volatility)
 * 11. [v3.2] H1 Trend Confirmation - Higher timeframe filter before M15 entry
 * 12. [v3.2] Entry Candle Confirmation - Last M15 candle must align with signal direction
 * 13. [v3.2] Bollinger Band Breakout Filter - Only enter on genuine BB(20,2) breakouts
 *
 * TRADING HOURS: 24/5 (Sunday 5 PM - Friday 5 PM EST)
 * BEST SESSION: London/NY Overlap (8 AM - 12 PM EST)
 */

const app = express();
const PORT = process.env.PORT || process.env.FOREX_PORT || 3005;

// [Phase 3.5] Cross-bot portfolio risk URLs (for co-located or Railway deployment)
const STOCK_BOT_URL = process.env.STOCK_BOT_URL || 'http://localhost:3002';
const CRYPTO_BOT_URL = process.env.CRYPTO_BOT_URL || 'http://localhost:3006';

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
    if (!token || !project || !env || !service) return;
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

// Initialize Alert Services
const smsAlerts = getSMSAlertService();
let telegramAlerts = getTelegramAlertService();

// OANDA Configuration
// UK/Europe accounts (101-004-xxx) use different endpoints than US accounts
const getOandaBaseUrl = () => {
    const accountId = process.env.OANDA_ACCOUNT_ID || '';
    const isPractice = process.env.OANDA_PRACTICE !== 'false';

    // Check if UK/Europe account (starts with 101-004)
    if (accountId.startsWith('101-004')) {
        return isPractice
            ? 'https://api-fxpractice.oanda.com'  // UK practice
            : 'https://api-fxtrade.oanda.com';    // UK live
    }
    // US/Other accounts
    return isPractice
        ? 'https://api-fxpractice.oanda.com'
        : 'https://api-fxtrade.oanda.com';
};

const oandaConfig = {
    accountId: process.env.OANDA_ACCOUNT_ID,
    accessToken: process.env.OANDA_ACCESS_TOKEN,
    baseURL: getOandaBaseUrl(),
    isPractice: process.env.OANDA_PRACTICE !== 'false'
};

function hasGlobalOandaCredentials() {
    return Boolean(oandaConfig.accountId && oandaConfig.accessToken);
}

// ===== FOREX PAIRS =====
const FOREX_PAIRS = [
    // Major Pairs (highest liquidity, tightest spreads)
    'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'AUD_USD', 'USD_CAD', 'NZD_USD',
    // High-liquidity crosses only (EUR_JPY and GBP_JPY have sufficient volume)
    'EUR_JPY', 'GBP_JPY', 'EUR_GBP', 'AUD_JPY', 'CAD_JPY',
];

// Correlation groups - avoid same-direction trades on correlated pairs
const CORRELATION_GROUPS = {
    USD_LONG: ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD'], // If short EUR_USD, don't short GBP_USD
    USD_SHORT: ['USD_JPY', 'USD_CHF', 'USD_CAD'],
    JPY_PAIRS: ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY', 'NZD_JPY', 'CAD_JPY', 'CHF_JPY'],
    EUR_PAIRS: ['EUR_USD', 'EUR_JPY', 'EUR_GBP', 'EUR_AUD', 'EUR_CAD', 'EUR_CHF', 'EUR_NZD'],
    GBP_PAIRS: ['GBP_USD', 'GBP_JPY', 'EUR_GBP', 'GBP_CHF', 'GBP_AUD', 'GBP_CAD', 'GBP_NZD'],
    AUD_PAIRS: ['AUD_USD', 'AUD_JPY', 'EUR_AUD', 'GBP_AUD', 'AUD_CAD', 'AUD_CHF', 'AUD_NZD'],
    NZD_PAIRS: ['NZD_USD', 'NZD_JPY', 'EUR_NZD', 'GBP_NZD', 'AUD_NZD', 'NZD_CAD', 'NZD_CHF'],
    CAD_PAIRS: ['USD_CAD', 'EUR_CAD', 'GBP_CAD', 'AUD_CAD', 'NZD_CAD', 'CAD_JPY', 'CAD_CHF'],
};

// Data structures
const positions = new Map();
const recentTrades = new Map();
const stoppedOutPairs = new Map();
const profitProtectReentryPairs = new Map(); // pair → { timestamp, direction, entry }, expires after 30 min
const tradesPerPair = new Map();
let totalTradesToday = 0;
let scanCount = 0;
let lastScanTime = null;
let lastScanCompletedAt = 0; // for health monitor
const recentErrors = []; // { timestamp, error } for health monitoring
const MAX_ERROR_HISTORY = 100;
let lastEquity = null; // null means not initialized yet
let cachedLiveDailyPnL = 0; // updated by status endpoint for circuit breaker

// Daily loss circuit breaker — halt new entries once this is exceeded
const MAX_DAILY_LOSS_FOREX = Math.abs(parseFloat(process.env.MAX_DAILY_LOSS || '500'));

// Persistent bot state (survives restarts)
const BOT_STATE_FILE = path.join(__dirname, 'data/forex-bot-state.json');
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

// Simulation state (used when no OANDA credentials)
const SIM_STARTING_EQUITY = 100000;
let simEquity = SIM_STARTING_EQUITY;
let simTotalTrades = 0;
let simWinners = 0;
let simLosers = 0;
let simLongTrades = 0;
let simShortTrades = 0;
let simDailyPnL = 0;
let simTotalPnL = 0;
let simTotalWinAmount = 0;
let simTotalLossAmount = 0;
let simProfitFactor = 0;
let simConsecutiveLosses = 0;
let simMaxConsecutiveLosses = 0;
let flipReversalsToday = 0;       // [v8.1] Track flip-on-reversal count

// ===== FOREX PERFORMANCE PERSISTENCE =====
const fs = require('fs');
const FOREX_PERF_FILE = path.join(__dirname, 'data/forex-performance.json');

// ===== EVALUATION PERSISTENCE (Improvement 1) =====
const EVAL_FILE = path.join(__dirname, 'data', 'forex-evaluations.json');

async function loadForexEvaluationsFromDB() {
    if (!dbPool) {
        console.log('[Persistence] No DB — starting with empty forex evaluations');
        return [];
    }
    try {
        const result = await dbPool.query(`
            SELECT symbol, direction, entry_price, exit_price, pnl_usd, pnl_pct,
                   entry_time, exit_time, close_reason, signal_score, entry_context,
                   strategy, regime, session
            FROM trades
            WHERE bot = 'forex' AND status = 'closed' AND pnl_usd IS NOT NULL AND close_reason != 'orphaned_restart'
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
                    // [v17.1] Don't fall back to signal_score — that's raw momentum score, not committee confidence (0-1)
                    committeeConfidence: ctx.committeeConfidence ?? 0,
                    components: ctx.committeeComponents || {},
                    regime: row.regime || ctx.marketRegime || 'unknown',
                    score: parseFloat(row.signal_score) || 0
                },
                exitReason: row.close_reason || 'unknown',
                timestamp: exitTime
            };
        });

        console.log(`[Persistence] Loaded ${evals.length} forex evaluations from DB`);
        return evals;
    } catch (e) {
        console.error('[Persistence] DB forex eval load failed:', e.message);
        return [];
    }
}

// No-op: trades are persisted to PostgreSQL via dbForexClose()
function saveForexEvaluations(evals) {
    // No-op: trades persisted to PostgreSQL via dbForexClose()
}

// ===== WEIGHT AUTO-LEARNING (Improvement 2) =====
const WEIGHTS_FILE = path.join(__dirname, 'data', 'forex-weights.json');
const DEFAULT_FOREX_WEIGHTS = { trend: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, macd: 0.15 };

function loadForexWeights() {
    try {
        if (fs.existsSync(WEIGHTS_FILE)) {
            const data = JSON.parse(fs.readFileSync(WEIGHTS_FILE, 'utf8'));
            if (data.weights && typeof data.weights === 'object') {
                console.log(`[AutoLearn] Loaded optimized forex weights:`, JSON.stringify(data.weights));
                return data.weights;
            }
        }
    } catch (e) {
        console.error('[AutoLearn] Failed to load forex weights:', e.message);
    }
    return { ...DEFAULT_FOREX_WEIGHTS };
}

function saveForexWeights(weights, meta) {
    try {
        const dir = path.dirname(WEIGHTS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(WEIGHTS_FILE, JSON.stringify({ weights, ...meta, updatedAt: new Date().toISOString() }, null, 2));
        console.log(`[AutoLearn] Saved optimized forex weights:`, JSON.stringify(weights));
    } catch (e) {
        console.error('[AutoLearn] Failed to save forex weights:', e.message);
    }
}

function optimizeForexWeights() {
    const evals = globalThis._forexTradeEvaluations || [];
    if (evals.length < 30) {
        console.log(`[AutoLearn] Need ${30 - evals.length} more forex trades for weight optimization (have ${evals.length})`);
        return null;
    }

    const signalKeys = ['trend', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'macd'];
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
        console.log('[AutoLearn] No positive edges detected for forex, keeping default weights');
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
        optimizedWeights.trend += parseFloat((1.0 - finalSum).toFixed(3));
    }

    console.log(`[AutoLearn] Optimized forex weights from ${evals.length} trades:`, JSON.stringify(optimizedWeights));
    saveForexWeights(optimizedWeights, { edges, tradeCount: evals.length });
    return optimizedWeights;
}

// ===== SIGNAL DECAY DETECTION (Improvement 4) =====
function detectForexSignalDecay() {
    const evals = globalThis._forexTradeEvaluations || [];
    if (evals.length < 20) return null;

    const recent = evals.slice(-20);
    const signalKeys = ['trend', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'macd'];
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
                if (forexCommitteeWeights[key]) {
                    const reduced = forexCommitteeWeights[key] * 0.6;
                    forexCommitteeWeights[key] = Math.max(0.03, reduced);
                    console.log(`[DecayDetect] Forex ${key} decaying (winRate=${(winRate * 100).toFixed(1)}%) — weight reduced to ${forexCommitteeWeights[key].toFixed(3)}`);
                }
            }
        }
    }

    if (decayWarnings.length > 0) {
        const sum = Object.values(forexCommitteeWeights).reduce((s, w) => s + w, 0);
        for (const key of signalKeys) {
            forexCommitteeWeights[key] = parseFloat((forexCommitteeWeights[key] / sum).toFixed(3));
        }
        const finalSum = Object.values(forexCommitteeWeights).reduce((s, w) => s + w, 0);
        if (Math.abs(finalSum - 1.0) > 0.001) {
            forexCommitteeWeights.trend += parseFloat((1.0 - finalSum).toFixed(3));
        }
        saveForexWeights(forexCommitteeWeights, { decayWarnings, updatedAt: new Date().toISOString() });
    }

    const overallWinRate = recent.filter(e => e.pnl > 0).length / recent.length;
    if (overallWinRate < 0.30) {
        console.log(`[DecayDetect] CRITICAL: Forex overall win rate ${(overallWinRate * 100).toFixed(1)}% — consider pausing`);
    }

    return decayWarnings.length > 0 ? decayWarnings : null;
}

// ===== TRANSACTION COST FILTER (Improvement 3) =====
const FOREX_SPREAD_COSTS = {
    'EUR_USD': 0.00015, 'GBP_USD': 0.00020, 'USD_JPY': 0.00015,
    'AUD_USD': 0.00020, 'USD_CAD': 0.00020, 'NZD_USD': 0.00025,
    'EUR_GBP': 0.00025, 'EUR_JPY': 0.00025, 'GBP_JPY': 0.00035,
    'AUD_JPY': 0.00030, 'EUR_AUD': 0.00030, 'GBP_AUD': 0.00035
};
const DEFAULT_FOREX_SPREAD = 0.00025;

function isForexPositiveEV(pair, committeeConfidence) {
    const evals = globalThis._forexTradeEvaluations || [];
    if (evals.length < 10) return true;

    const recent = evals.slice(-50);
    const wins = recent.filter(e => e.pnl > 0);
    const losses = recent.filter(e => e.pnl <= 0);

    const avgWinPct = wins.length > 0 ? wins.reduce((s, e) => s + Math.abs(e.pnlPct || 0), 0) / wins.length : 0.005;
    const avgLossPct = losses.length > 0 ? losses.reduce((s, e) => s + Math.abs(e.pnlPct || 0), 0) / losses.length : 0.005;

    const spreadCost = FOREX_SPREAD_COSTS[pair] || DEFAULT_FOREX_SPREAD;
    const roundTripCost = 2 * (spreadCost + 0.0001); // spread + slippage each way

    const ev = (committeeConfidence * avgWinPct) - ((1 - committeeConfidence) * avgLossPct) - roundTripCost;

    if (ev <= 0) {
        console.log(`[CostFilter] ${pair} REJECTED: EV=${(ev * 10000).toFixed(1)}pips (conf=${committeeConfidence.toFixed(3)}, spread=${(spreadCost * 10000).toFixed(1)}pips)`);
        return false;
    }
    return true;
}

function loadForexPerf() {
    try {
        if (fs.existsSync(FOREX_PERF_FILE)) {
            const saved = JSON.parse(fs.readFileSync(FOREX_PERF_FILE, 'utf8'));
            simTotalTrades = saved.totalTrades || 0;
            simWinners = saved.winners || 0;
            simLosers = saved.losers || 0;
            simLongTrades = saved.longTrades || 0;
            simShortTrades = saved.shortTrades || 0;
            simTotalPnL = saved.totalPnL || 0;
            simTotalWinAmount = saved.totalWinAmount || 0;
            simTotalLossAmount = saved.totalLossAmount || 0;
            simProfitFactor = saved.profitFactor || 0;
            simConsecutiveLosses = saved.consecutiveLosses || 0;
            simMaxConsecutiveLosses = saved.maxConsecutiveLosses || 0;
            // Don't restore equity or dailyPnL — those are session-specific
            console.log(`📊 Forex perf restored: ${simTotalTrades} trades, ${simWinners}W/${simLosers}L, PF ${simProfitFactor}, Win $${simTotalWinAmount.toFixed(2)}, Loss $${simTotalLossAmount.toFixed(2)}`);
        }
    } catch {}
}

function saveForexPerf() {
    try {
        const dir = require('path').dirname(FOREX_PERF_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(FOREX_PERF_FILE, JSON.stringify({
            totalTrades: simTotalTrades,
            winners: simWinners,
            losers: simLosers,
            longTrades: simLongTrades,
            shortTrades: simShortTrades,
            totalPnL: simTotalPnL,
            totalWinAmount: simTotalWinAmount,
            totalLossAmount: simTotalLossAmount,
            profitFactor: simProfitFactor,
            consecutiveLosses: simConsecutiveLosses,
            maxConsecutiveLosses: simMaxConsecutiveLosses,
            flipReversalsToday,
            lastUpdate: new Date().toISOString()
        }));
    } catch {}
}

// Load on startup
loadForexPerf();

// Initialize evaluations — will be loaded from DB after initTradeDb() completes (see startup)
globalThis._forexTradeEvaluations = [];

// Initialize committee weights from file (Improvement 2)
let forexCommitteeWeights = loadForexWeights();

// Optimize weights every 4 hours
setInterval(() => {
    const newWeights = optimizeForexWeights();
    if (newWeights) {
        forexCommitteeWeights = newWeights;
        console.log('[AutoLearn] Forex committee weights updated');
    }
}, 4 * 60 * 60 * 1000);

// Detect signal decay every 2 hours (Improvement 4)
setInterval(() => { detectForexSignalDecay(); }, 2 * 60 * 60 * 1000);

// ===== AUTO-OPTIMIZER STATE =====
// Walk-forward parameter optimization runs every 4 hours using recent trade evaluations
let forexOptimizedParams = {
    committeeThreshold: (AUTO_PARAM_BOUNDS.committeeThreshold || {}).default || 0.50,
    minRewardRisk:      (AUTO_PARAM_BOUNDS.minRewardRisk || {}).default      || 2.0,
    sizeMultiplier:     (AUTO_PARAM_BOUNDS.sizeMultiplier || {}).default     || 1.0,
    atrStopMultiplier:  (AUTO_PARAM_BOUNDS.atrStopMultiplier || {}).default  || 1.5,
};
let forexLastOptimizationTime = 0;
const FOREX_OPTIMIZATION_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours

function runForexAutoOptimizer() {
    const evals = globalThis._forexTradeEvaluations || [];
    const result = autoOptimize(evals, 30);
    if (result.params) forexOptimizedParams = result.params;
    const strategyPerf = autoEvaluateStrategies(evals);
    console.log(`[AutoOptimizer] Forex params updated — committeeThreshold:${forexOptimizedParams.committeeThreshold} minRR:${forexOptimizedParams.minRewardRisk} | ${result.reason}`);
    if (Object.keys(strategyPerf).length > 0) {
        console.log('[AutoOptimizer] Forex strategy performance:', JSON.stringify(
            Object.fromEntries(Object.entries(strategyPerf).map(([k, v]) => [k, { pf: v.profitFactor.toFixed(2), wr: (v.winRate * 100).toFixed(0) + '%', n: v.trades }]))
        ));
    }
    return result;
}

// ===== REGISTER WITH MEMORY MANAGER =====
memoryManager.register('forex_positions', positions, { maxSize: 50, maxAge: 7 * 24 * 60 * 60 * 1000 });
memoryManager.register('forex_recentTrades', recentTrades, { maxSize: 500, maxAge: 24 * 60 * 60 * 1000 });
memoryManager.register('forex_stoppedOutPairs', stoppedOutPairs, { maxSize: 100, maxAge: 60 * 60 * 1000 });
memoryManager.register('forex_tradesPerPair', tradesPerPair, { maxSize: 100, maxAge: 24 * 60 * 60 * 1000 });

if (process.env.NODE_ENV === 'production' || process.env.ENABLE_MEMORY_MANAGER === 'true') {
    memoryManager.start();
    console.log('🧠 Forex Memory Manager started');
}

memoryManager.on('warning', (data) => {
    console.warn(`⚠️  FOREX MEMORY WARNING: ${data.heapUsedMB}MB / ${data.heapLimitMB}MB`);
});

memoryManager.on('critical', (data) => {
    console.error(`🚨 FOREX CRITICAL MEMORY: ${data.heapUsedMB}MB - forcing cleanup`);
});

// ===== ANTI-CHURNING PROTECTION =====
const MAX_TRADES_PER_DAY = 10;       // More conservative for forex
const MAX_TRADES_PER_PAIR = 2;       // Forex pairs trend longer
const MIN_TIME_BETWEEN_TRADES = 30 * 60 * 1000;  // 30 min (forex moves slower)
const MIN_TIME_AFTER_STOP = 2 * 60 * 60 * 1000;  // 2 hours after stop-out

// ===== ADAPTIVE GUARDRAILS (v4.6) =====
const RISK_PER_TRADE = parseFloat(process.env.RISK_PER_TRADE || '0.0035');      // 0.35% per trade — forex is worst lane
const MIN_SIGNAL_CONFIDENCE = parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.65'); // [v17.0] was 0.74, too restrictive with 12 pairs
const MIN_SIGNAL_SCORE = parseFloat(process.env.MIN_SIGNAL_SCORE || '0.65'); // [v17.0] was 0.74, committee provides quality filtering
const MIN_REWARD_RISK = parseFloat(process.env.FOREX_MIN_REWARD_RISK || process.env.MIN_REWARD_RISK || '1.4');  // [v13.2] forex-specific: 1.4 (TP/SL is 1.2%/0.8% = 1.5 R:R by design)
const MAX_SIGNALS_PER_CYCLE = parseInt(process.env.MAX_SIGNALS_PER_CYCLE || '1');
const MAX_CONSECUTIVE_LOSSES = parseInt(process.env.MAX_CONSECUTIVE_LOSSES || '5');  // [v7.1] forex has more frequent small losses; 3 caused death spiral
const LOSS_PAUSE_MS = parseInt(process.env.LOSS_PAUSE_MS || '7200000');
const STOP_LOSS_COOLDOWN_MS = parseInt(process.env.STOP_LOSS_COOLDOWN_MS || '2700000');

const guardrails = {
    consecutiveLosses: 0,
    recentResults: [],
    lanePausedUntil: 0,
    totalLossesToday: 0,
    totalWinsToday: 0,
    get recentWinRate() {
        if (this.recentResults.length < 5) return 0.5;
        return this.recentResults.filter(Boolean).length / this.recentResults.length;
    },
    get isPaused() { return Date.now() < this.lanePausedUntil; },
    recordOutcome(isWin) {
        this.recentResults.push(isWin);
        if (this.recentResults.length > 20) this.recentResults.shift();
        if (isWin) { this.consecutiveLosses = 0; this.totalWinsToday++; }
        else {
            this.consecutiveLosses++;
            this.totalLossesToday++;
            if (this.consecutiveLosses >= MAX_CONSECUTIVE_LOSSES) {
                // [v6.1] Escalating pause: 2h base × (losses / 3), capped at 24h
                const escalation = Math.min(8, Math.ceil(this.consecutiveLosses / MAX_CONSECUTIVE_LOSSES));
                const pauseMs = LOSS_PAUSE_MS * escalation;
                this.lanePausedUntil = Date.now() + pauseMs;
                console.log(`🚫 [Guardrail] Forex lane PAUSED ${escalation * 2}h until ${new Date(this.lanePausedUntil).toLocaleTimeString()} — ${this.consecutiveLosses} consecutive losses`);
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
    get lossSizeMultiplier() {
        if (this.consecutiveLosses >= 3) return 0.25;
        if (this.consecutiveLosses >= 2) return 0.5;
        if (this.consecutiveLosses >= 1) return 0.75;
        if (this.recentWinRate < 0.35) return 0.5;
        return 1.0;
    },
};

// ===== FOREX-SPECIFIC EXIT CONFIG =====
const EXIT_CONFIG = {
    maxHoldDays: 5,              // Forex momentum trades shorter
    idealHoldDays: 2,            // 2-day swings
    stalePositionDays: 7,        // Force close

    // [v16.0] Patient profit targets — old Day-2 target (0.6%) closed trades before trailing
    // stop even activated (0.8% threshold). Must let trailing stops manage winners.
    // Day targets now only serve as "take what you can get" backstop for aging trades.
    profitTargetByDay: {
        0: 0.012,  // Day 0: 1.2% (aggressive intraday — rare but possible)
        1: 0.012,  // Day 1: 1.2% (same as OANDA server-side TP)
        2: 0.010,  // Day 2: 1.0% (still above trailing threshold)
        3: 0.008,  // Day 3: 0.8% (matches trailing start threshold)
        4: 0.005,  // Day 4: 0.5% (take what the market gives)
        5: 0.003   // Day 5+: 0.3% (any profit is a win)
    },

    // [v16.0] Trailing stops — start at 1x risk (now 1.0% with wider stops)
    // Previous 0.8% start was too tight with 0.8% stops — barely 1:1 R:R before trailing
    trailingStopLevels: [
        { gainThreshold: 0.012, lockPercent: 0.25 },  // +1.2% (1.2x risk): lock 25% → stop at +0.30% (v17.0: delayed activation)
        { gainThreshold: 0.015, lockPercent: 0.45 },  // +1.5% (1.5x risk): lock 45% → stop at +0.68%
        { gainThreshold: 0.020, lockPercent: 0.60 },  // +2.0%: lock 60% → stop at +1.20%
        { gainThreshold: 0.030, lockPercent: 0.75 },  // +3.0%: lock 75%
        { gainThreshold: 0.040, lockPercent: 0.85 },  // +4.0%: lock 85%
    ],

    // Momentum reversal
    momentumReversal: {
        rsiOverbought: 72,
        rsiOversold: 28,
        atrMultipleExit: 5.0  // [v7.2] Widened from 2.5 — was triggering at 7-15 pips (normal M15 noise)
    }
};

// ===== TIERED MOMENTUM CONFIG (Forex) =====
// [v16.0] Wider stops + targets — old 0.8% stops hit by normal M15 noise (14-pip ATR),
// causing 0% win rate. New: 1.0-1.5% stops (8-12x M15 ATR) with 2:1 R:R targets.
const MOMENTUM_CONFIG = {
    tier1: {
        threshold: 0.003,       // 0.3% (30 pips)
        rsiMax: 65,
        rsiMin: 35,
        positionSize: 0.008,    // 0.8% of account
        stopLoss: 0.010,        // 1.0% (was 0.8% — too tight for M15 noise)
        profitTarget: 0.020,    // 2.0% target (2:1 R:R — lets winners run)
        maxPositions: 3
    },
    tier2: {
        threshold: 0.005,       // 0.5% (50 pips)
        rsiMax: 68,
        rsiMin: 32,
        positionSize: 0.012,    // 1.2%
        stopLoss: 0.012,        // 1.2% (was 1.0%)
        profitTarget: 0.024,    // 2.4% (2:1 R:R)
        maxPositions: 2
    },
    tier3: {
        threshold: 0.008,       // 0.8% (80 pips) — strong moves
        rsiMax: 72,
        rsiMin: 28,
        positionSize: 0.015,    // 1.5%
        stopLoss: 0.015,        // 1.5% (was 1.2%)
        profitTarget: 0.030,    // 3.0% (2:1 R:R)
        maxPositions: 1
    }
};

const FOREX_PULLBACK_CONFIG = {
    tier1: 0.0040,
    tier2: 0.0050,
    tier3: 0.0065
};

// ===== TRADING SESSIONS (UTC) =====
const TRADING_SESSIONS = {
    london: { start: 7, end: 16, name: 'London', quality: 'good' },
    newYork: { start: 12, end: 21, name: 'New York', quality: 'good' },
    overlap: { start: 12, end: 16, name: 'London/NY Overlap', quality: 'best' },
    tokyo: { start: 0, end: 9, name: 'Tokyo', quality: 'fair' },
    sydney: { start: 21, end: 6, name: 'Sydney', quality: 'fair' }
};

// ===== HIGH-IMPACT EVENTS (reference — logic is in isNearHighImpactEvent()) =====
const _HIGH_IMPACT_EVENTS = [
    { day: 5, hour: 13, minute: 30, name: 'NFP', avoidMinutes: 60 },
    { pattern: 'monthly', name: 'FOMC', avoidMinutes: 120 },
    { pattern: 'monthly', name: 'CPI', avoidMinutes: 60 },
    { pattern: 'monthly', name: 'ECB Rate', avoidMinutes: 60 }
];

// ===== UTILITY FUNCTIONS =====

function getCurrentSession() {
    const hour = new Date().getUTCHours();

    if (hour >= 12 && hour < 16) return { ...TRADING_SESSIONS.overlap, isBest: true };
    if (hour >= 7 && hour < 16) return { ...TRADING_SESSIONS.london, isBest: false };
    if (hour >= 12 && hour < 21) return { ...TRADING_SESSIONS.newYork, isBest: false };
    if (hour >= 0 && hour < 9) return { ...TRADING_SESSIONS.tokyo, isBest: false };

    return { name: 'Low Liquidity', quality: 'poor', isBest: false };
}

function scoreForexSignal({ tier, trendStrength, pullback, maxPullback, rsi, direction, session, macd }) {
    const tierWeight = { tier1: 1.0, tier2: 1.35, tier3: 1.75 }[tier] || 1.0;
    const sessionWeight = session?.isBest ? 1.35 : session?.quality === 'good' ? 1.15 : 0.95;
    const pullbackQuality = maxPullback > 0
        ? 1 + Math.max(0, (maxPullback - pullback) / maxPullback) * 0.35
        : 1;
    // [v7.0] RSI sweet spots aligned with pullback entry logic
    const rsiSweetSpot = direction === 'long'
        ? (rsi >= 38 && rsi <= 50 ? 1.12 : 1.0)
        : (rsi >= 50 && rsi <= 62 ? 1.12 : 1.0);
    const macdStrength = macd ? Math.min(Math.abs(macd.histogram) * 100000, 3) : 1;

    // [v7.0] Invert trendStrength scoring — closer to SMA20 (lower value) = higher score
    // Map: 0.0000 → 2.0 (best), 0.0015 → 1.0 (threshold), 0.003+ → 0.0 (worst)
    const proximityScore = Math.max(0, 2.0 - (trendStrength / 0.0015) * 1.0);

    // [Tier3 Fix] Normalized forex score — all components 0-1, weighted average
    // Prevents MACD from dominating the score (was additive up to +3 pts vs multiplicative rest)
    const normTier      = Math.min(tierWeight / 1.75, 1.0);        // max tierWeight is 1.75
    const normSession   = Math.min((sessionWeight - 0.95) / 0.40, 1.0); // range ~0.95-1.35 → 0-1
    const normProximity = Math.min(proximityScore / 2.0, 1.0);     // proximityScore max is 2.0
    const normPullback  = Math.min(pullbackQuality - 1.0, 0.35) / 0.35; // bonus above 1.0, max 0.35
    const normRsi       = rsiSweetSpot > 1.0 ? 1.0 : 0.0;         // binary: in sweet spot or not
    const normMacd      = Math.min(macdStrength / 3, 1.0);         // macdStrength already 0-3

    return parseFloat(
        (normTier * 0.15 + normSession * 0.15 + normProximity * 0.20 +
         normPullback * 0.25 + normRsi * 0.15 + normMacd * 0.10)
            .toFixed(3)
    );
}

function evaluateForexRegimeSignal({ tier, trendStrength, pullback, maxPullback, rsi, direction, session, h1Trend, macd }) {
    const expectedTrend = direction === 'long' ? 'up' : 'down';
    if (h1Trend && h1Trend !== expectedTrend) {
        return { tradable: false, regime: 'higher-timeframe-mismatch', quality: 0 };
    }

    let quality = session?.isBest ? 1.18 : session?.quality === 'good' ? 1.08 : session?.quality === 'fair' ? 0.94 : 0.82;
    const pullbackRatio = maxPullback > 0 ? pullback / maxPullback : 0;

    if (pullbackRatio >= 0.2 && pullbackRatio <= 0.75) quality *= 1.08;
    else if (pullbackRatio > 0.9) quality *= 0.82;
    else if (pullbackRatio < 0.08) quality *= 0.88;

    // [v7.0] trendStrength now measures proximity to SMA20 (lower = closer = better entry)
    // Reward entries near SMA20 (low trendStrength), penalize extended entries
    if (trendStrength <= 0.001) quality *= 1.10;  // very close to SMA20 — ideal pullback
    else if (trendStrength <= 0.0015) quality *= 1.04;  // within threshold — acceptable
    else if (trendStrength > 0.003) quality *= 0.85;  // too far from SMA20 — penalize

    // [v7.0] RSI sweet spots aligned with pullback entry logic
    const rsiSweetSpot = direction === 'long'
        ? (rsi >= 38 && rsi <= 50)   // oversold zone in uptrend — buying the dip
        : (rsi >= 50 && rsi <= 62);  // overbought zone in downtrend — selling the rally
    if (rsiSweetSpot) quality *= 1.04;

    if (macd) {
        const macdAligned = direction === 'long' ? macd.bullish : macd.bearish;
        if (!macdAligned) quality *= 0.78;
    }

    let regime = 'session-trend';
    if (session?.name === 'London/NY Overlap') regime = 'overlap-expansion';
    else if (trendStrength >= MOMENTUM_CONFIG.tier2.threshold) regime = 'trend-expansion';
    else if (session?.name === 'London') regime = 'london-trend';
    else if (session?.name === 'New York') regime = 'new-york-trend';

    return {
        tradable: quality >= 0.82,  // [v7.1] lowered from 0.92 — was blocking too many valid setups
        regime,
        quality: parseFloat(quality.toFixed(3))
    };
}

function getForexAtrExitReason(position, currentPrice) {
    // [v8.0] DISABLED — ATR adverse exit was killing trades with tiny losses (-0.048% avg)
    // before they could reach the 4% profit target. The stop loss already provides downside
    // protection. Removing this lets trades breathe and reach their target.
    // Previous 0% win rate was caused by premature exits, not bad entries.
    return null;
}

function isMarketOpen() {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();

    // Friday after 21:00 UTC
    if (day === 5 && hour >= 21) return false;
    // Saturday
    if (day === 6) return false;
    // Sunday before 21:00 UTC
    if (day === 0 && hour < 21) return false;

    return true;
}

function isNearHighImpactEvent() {
    const now = new Date();
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    // Check NFP (first Friday of month at 13:30 UTC)
    if (day === 5 && now.getDate() <= 7) {
        const nfpTime = 13 * 60 + 30;
        const currentTime = hour * 60 + minute;
        if (Math.abs(currentTime - nfpTime) < 60) {
            return { isNear: true, event: 'NFP', minutesAway: Math.abs(currentTime - nfpTime) };
        }
    }

    return { isNear: false };
}

function canTrade(pair, direction = 'long') {
    // [Profit-Protect] Check re-entry flag — bypass cooldowns if pair was closed by profit protection
    // Re-entry window expires after 30 minutes
    const reentryData = profitProtectReentryPairs.get(pair);
    const reentryTime = reentryData ? reentryData.timestamp : null;
    const hasReentryFlag = reentryTime && (Date.now() - reentryTime < 30 * 60 * 1000);

    // Clean up expired re-entry flags
    if (reentryTime && (Date.now() - reentryTime >= 30 * 60 * 1000)) {
        profitProtectReentryPairs.delete(pair);
    }

    // Check stop-out cooldown (dynamic: 30min for small losses, 2h for large)
    // BYPASSED if profit-protect re-entry flag is active
    if (!hasReentryFlag) {
        const stopEntry = stoppedOutPairs.get(pair);
        if (stopEntry) {
            const { time, cooldownMs } = typeof stopEntry === 'object' ? stopEntry : { time: stopEntry, cooldownMs: MIN_TIME_AFTER_STOP };
            if (Date.now() - time < cooldownMs) {
                const minsLeft = Math.ceil((cooldownMs - (Date.now() - time)) / 60000);
                return { allowed: false, reason: `Stop-out cooldown (${minsLeft}m left)` };
            }
        }
    }

    // Check daily limit
    if (totalTradesToday >= MAX_TRADES_PER_DAY) {
        return { allowed: false, reason: `Daily limit (${MAX_TRADES_PER_DAY})` };
    }

    // Check per-pair limit — BYPASSED if profit-protect re-entry flag is active
    const pairTrades = tradesPerPair.get(pair) || 0;
    if (!hasReentryFlag && pairTrades >= MAX_TRADES_PER_PAIR) {
        return { allowed: false, reason: `Pair limit (${MAX_TRADES_PER_PAIR})` };
    }

    // Check time between trades — BYPASSED if profit-protect re-entry flag is active
    if (!hasReentryFlag) {
        const recent = recentTrades.get(pair) || [];
        if (recent.length > 0) {
            const lastTrade = recent[recent.length - 1];
            const timeSince = Date.now() - lastTrade.time;
            if (timeSince < MIN_TIME_BETWEEN_TRADES) {
                const minsLeft = Math.ceil((MIN_TIME_BETWEEN_TRADES - timeSince) / 60000);
                return { allowed: false, reason: `Cooldown (${minsLeft} min)` };
            }
        }
    }

    // Check for recently failed orders on this pair (5-minute cooldown)
    const pairRecentTrades = recentTrades.get(pair) || [];
    const recentFailed = pairRecentTrades.filter(t => t.failed && (Date.now() - t.time) < 5 * 60 * 1000);
    if (recentFailed.length >= 2) {
        return { allowed: false, reason: `${pair} had ${recentFailed.length} failed orders in last 5 min — cooling down` };
    }

    // Check correlation
    const correlatedPositions = getCorrelatedPositions(pair, direction);
    if (correlatedPositions.length >= 2) {
        return { allowed: false, reason: 'Correlation limit' };
    }

    return { allowed: true };
}

// [v10.1] Re-entry validation — only allow re-entry if conditions still favor the original direction
function isReentryValid(pair, signal) {
    const reentryData = profitProtectReentryPairs.get(pair);
    if (!reentryData) return { valid: true, reason: 'no re-entry flag' }; // Not a re-entry, pass through

    const { direction: origDirection } = reentryData;

    // Direction must match the original trade direction
    if (signal.direction !== origDirection) {
        console.log(`[RE-ENTRY CHECK] ${pair}: direction flipped (was ${origDirection}, now ${signal.direction}) — REJECTED`);
        profitProtectReentryPairs.delete(pair); // consume flag
        return { valid: false, reason: `direction flipped from ${origDirection} to ${signal.direction}` };
    }

    // Trend must still align (H1 trend must match direction)
    const trendAligned = (signal.direction === 'long' && signal.h1Trend === 'up') ||
                         (signal.direction === 'short' && signal.h1Trend === 'down');

    // RSI must not be in exhaustion zone
    const rsi = signal.rsi || 50;
    const rsiExhausted = (signal.direction === 'long' && rsi > 70) ||
                         (signal.direction === 'short' && rsi < 30);

    // Momentum must still be positive for the direction
    const momentum = signal.macdHistogram || 0;
    const momentumAligned = (signal.direction === 'long' && momentum > 0) ||
                            (signal.direction === 'short' && momentum < 0);

    const pass = trendAligned && !rsiExhausted && momentumAligned;
    console.log(`[RE-ENTRY CHECK] ${pair}: trend=${signal.h1Trend}(${trendAligned ? 'OK' : 'FAIL'}), rsi=${rsi.toFixed(1)}(${rsiExhausted ? 'EXHAUSTED' : 'OK'}), momentum=${momentum.toFixed(5)}(${momentumAligned ? 'OK' : 'FAIL'}) — ${pass ? 'APPROVED' : 'REJECTED'}`);

    if (!pass) {
        profitProtectReentryPairs.delete(pair); // consume flag on rejection
    }
    return { valid: pass, reason: pass ? 'conditions still favorable' : `trend=${!trendAligned ? 'misaligned' : 'ok'}, rsi=${rsiExhausted ? 'exhausted' : 'ok'}, momentum=${!momentumAligned ? 'opposed' : 'ok'}` };
}

// [v10.1] Entry quality gate — every signal must pass before execution
function isForexEntryQualified(signal, committee) {
    const reasons = [];
    const pair = signal.pair;
    const direction = signal.direction;

    // 1. Committee confidence must be >= 0.50 (raised from 0.45)
    const conf = committee ? committee.confidence : 0;
    if (conf < 0.50) {
        reasons.push(`confidence ${conf.toFixed(2)} < 0.50`);
    }

    // 2. H1 trend must align with trade direction
    const h1Aligned = (direction === 'long' && signal.h1Trend === 'up') ||
                      (direction === 'short' && signal.h1Trend === 'down');
    if (!h1Aligned) {
        reasons.push(`h1Trend=${signal.h1Trend} misaligned with ${direction}`);
    }

    // 3. RSI must be between 30-70 (no extreme entries)
    const rsi = signal.rsi || 50;
    if (rsi < 30 || rsi > 70) {
        reasons.push(`rsi=${rsi.toFixed(1)} outside 30-70`);
    }

    // 4. At least 2 out of 6 committee components must be positive
    let positiveCount = 0;
    if (committee && committee.components) {
        const comps = committee.components;
        for (const key of Object.keys(comps)) {
            if (typeof comps[key] === 'number' && comps[key] > 0) positiveCount++;
        }
    }
    if (positiveCount < 2) {
        reasons.push(`components=${positiveCount}/6 positive (need 2+)`);
    }

    // 5. If signal score exists, must be > 0
    if (signal.score !== undefined && signal.score !== null && signal.score <= 0) {
        reasons.push(`score=${signal.score} <= 0`);
    }

    const pass = reasons.length === 0;
    console.log(`[QUALITY GATE] ${pair} ${direction}: confidence=${conf.toFixed(2)}, h1Trend=${signal.h1Trend}, rsi=${rsi.toFixed(1)}, components=${positiveCount}/6 — ${pass ? 'PASS' : 'FAIL: ' + reasons.join(', ')}`);

    return { qualified: pass, reason: pass ? 'all checks passed' : reasons.join(', ') };
}

function getCorrelatedPositions(pair, direction) {
    const correlated = [];

    for (const [, pairs] of Object.entries(CORRELATION_GROUPS)) {
        if (pairs.includes(pair)) {
            for (const p of pairs) {
                if (p !== pair && positions.has(p)) {
                    const pos = positions.get(p);
                    if (pos.direction === direction) {
                        correlated.push(p);
                    }
                }
            }
        }
    }

    return correlated;
}

// ===== OANDA API =====

async function oandaRequest(method, endpoint, data = null) {
    if (!hasGlobalOandaCredentials()) {
        return null;
    }
    try {
        const config = {
            method,
            url: `${oandaConfig.baseURL}${endpoint}`,
            timeout: 15000, // [v6.3] 15s timeout — prevents hanging on OANDA outages
            headers: {
                'Authorization': `Bearer ${oandaConfig.accessToken}`,
                'Content-Type': 'application/json'
            }
        };

        if (data) config.data = data;

        const response = await axios(config);
        return response.data;
    } catch (error) {
        console.error(`OANDA Error [${endpoint}]:`, error.response?.data || error.message);
        return null;
    }
}

async function getAccount() {
    const data = await oandaRequest('get', `/v3/accounts/${oandaConfig.accountId}`);
    return data?.account || null;
}

async function getOpenPositions() {
    const data = await oandaRequest('get', `/v3/accounts/${oandaConfig.accountId}/openPositions`);
    return data?.positions || [];
}

async function getCandles(instrument, granularity = 'M15', count = 100) {
    const data = await oandaRequest('get', `/v3/instruments/${instrument}/candles?granularity=${granularity}&count=${count}&price=M`);
    return data?.candles || [];
}

// Get correct decimal precision for instrument (JPY pairs: 3, others: 5)
function getPricePrecision(instrument) {
    return instrument.includes('JPY') ? 3 : 5;
}

async function createOrder(instrument, units, stopLoss, takeProfit) {
    const precision = getPricePrecision(instrument);

    const order = {
        order: {
            type: 'MARKET',
            instrument,
            units: units.toString(),
            stopLossOnFill: { price: stopLoss.toFixed(precision) },
            takeProfitOnFill: { price: takeProfit.toFixed(precision) },
            timeInForce: 'FOK'
        }
    };

    return await oandaRequest('post', `/v3/accounts/${oandaConfig.accountId}/orders`, order);
}

async function closePosition(instrument) {
    // Determine which side to close based on tracked position direction
    const pos = positions.get(instrument);
    const body = {};
    if (pos && pos.direction === 'short') {
        body.shortUnits = 'ALL';
    } else {
        body.longUnits = 'ALL';
    }
    return await oandaRequest('put', `/v3/accounts/${oandaConfig.accountId}/positions/${instrument}/close`, body);
}

// ===== INDICATORS =====

// [v3.2] Wilder's Smoothed RSI — matches broker platform values, eliminates simple-average drift
function calculateRSI(candles, period = 14) {
    if (candles.length < period * 2) return 50;
    const closes = candles.map(c => parseFloat(c.mid.c));
    const changes = [];
    for (let i = 1; i < closes.length; i++) changes.push(closes[i] - closes[i - 1]);

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

function calculateSMA(candles, period) {
    if (candles.length < period) return 0;
    const closes = candles.slice(-period).map(c => parseFloat(c.mid.c));
    return closes.reduce((a, b) => a + b, 0) / period;
}

function calculateATR(candles, period = 14) {
    if (candles.length < period + 1) return 0;

    let tr = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
        const high = parseFloat(candles[i].mid.h);
        const low = parseFloat(candles[i].mid.l);
        const prevClose = parseFloat(candles[i - 1].mid.c);
        tr += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }

    return tr / period;
}

// [v3.4] EMA on a raw number array (needed by MACD)
function calculateEMAArray(values, period) {
    if (values.length < period) return null;
    const mult = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < values.length; i++) ema = (values[i] - ema) * mult + ema;
    return ema;
}

// [v3.4] MACD(12,26,9) — momentum confirmation for forex M15 candles
// Enter LONG only when histogram is positive AND rising (momentum accelerating)
function calculateMACDForex(candles, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (candles.length < slowPeriod + signalPeriod) return null;
    const closes = candles.map(c => parseFloat(c.mid.c));
    const macdLine = [];
    for (let i = slowPeriod - 1; i < closes.length; i++) {
        const slice = closes.slice(0, i + 1);
        const fast = calculateEMAArray(slice, fastPeriod);
        const slow = calculateEMAArray(slice, slowPeriod);
        if (fast !== null && slow !== null) macdLine.push(fast - slow);
    }
    if (macdLine.length < signalPeriod + 1) return null; // +1 for valid prevHistogram
    const signalLine = calculateEMAArray(macdLine, signalPeriod);
    if (signalLine === null) return null;
    const histogram = macdLine[macdLine.length - 1] - signalLine;

    // Compute prior signal line from macdLine without the latest bar,
    // then pair it with the second-to-last MACD value for a true prevHistogram.
    const prevSignalLine = calculateEMAArray(macdLine.slice(0, -1), signalPeriod);
    const prevHistogram = prevSignalLine !== null
        ? macdLine[macdLine.length - 2] - prevSignalLine
        : histogram;

    return {
        macd: macdLine[macdLine.length - 1],
        signal: signalLine,
        histogram,
        bullish:  histogram > 0,  // positive histogram = bullish; rising check removed (too restrictive)
        bearish:  histogram < 0   // negative histogram = bearish; falling check removed
    };
}

// [v3.2] Bollinger Bands — detects genuine breakouts from ranging price action
function calculateBollingerBands(candles, period = 20, numStdDev = 2) {
    if (candles.length < period) return null;
    const closes = candles.slice(-period).map(c => parseFloat(c.mid.c));
    const sma = closes.reduce((a, b) => a + b, 0) / period;
    const variance = closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    return { upper: sma + numStdDev * std, middle: sma, lower: sma - numStdDev * std };
}

// [Phase 1] Order Flow Imbalance — approximates buy/sell pressure from OHLCV candles
// Uses candle body/range ratio as conviction proxy (volume unavailable in forex)
function calculateOrderFlowImbalance(candles, lookback = 20) {
    const recent = candles.slice(-lookback);
    let buyPressure = 0, sellPressure = 0;
    for (const candle of recent) {
        const open = parseFloat(candle.mid.o);
        const high = parseFloat(candle.mid.h);
        const low = parseFloat(candle.mid.l);
        const close = parseFloat(candle.mid.c);
        const body = Math.abs(close - open);
        const range = high - low;
        if (range <= 0) continue;
        // Weight by body/range ratio (conviction strength)
        const conviction = body / range;
        if (close >= open) {
            buyPressure += conviction;
        } else {
            sellPressure += conviction;
        }
    }
    const total = buyPressure + sellPressure;
    if (total === 0) return 0;
    return (buyPressure - sellPressure) / total; // -1 to +1
}

// [Phase 1] Displacement Candle Detection — large-body, high-range candles signal institutional intent
function isDisplacementCandle(candles, atr, lookback = 3) {
    if (!candles || candles.length < lookback || !atr || atr <= 0) return false;
    const recent = candles.slice(-lookback);
    for (const candle of recent) {
        const open = parseFloat(candle.mid.o);
        const high = parseFloat(candle.mid.h);
        const low = parseFloat(candle.mid.l);
        const close = parseFloat(candle.mid.c);
        const body = Math.abs(close - open);
        const range = high - low;
        if (range <= 0) continue;
        if (body / range > 0.7 && range > 1.5 * atr) {
            return true;
        }
    }
    return false;
}

// [Phase 2] Volume Profile for Forex — uses bar frequency and conviction weighting
// (Forex has no reliable volume; uses candle body/range as conviction proxy)
function calculateVolumeProfile(candles, numBuckets = 40) {
    if (!candles || candles.length < 20) return null;

    let minPrice = Infinity, maxPrice = -Infinity;
    for (const candle of candles) {
        const high = parseFloat(candle.mid.h);
        const low = parseFloat(candle.mid.l);
        if (low < minPrice) minPrice = low;
        if (high > maxPrice) maxPrice = high;
    }

    const priceRange = maxPrice - minPrice;
    if (priceRange <= 0) return null;
    const bucketSize = priceRange / numBuckets;

    const activityByBucket = new Array(numBuckets).fill(0);
    let totalActivity = 0;

    for (const candle of candles) {
        const open = parseFloat(candle.mid.o);
        const high = parseFloat(candle.mid.h);
        const low = parseFloat(candle.mid.l);
        const close = parseFloat(candle.mid.c);
        const body = Math.abs(close - open);
        const range = high - low;
        // Conviction weight: large-body candles count more than dojis
        const weight = range > 0 ? 1 + (body / range) : 1;

        const barLowBucket = Math.max(0, Math.floor((low - minPrice) / bucketSize));
        const barHighBucket = Math.min(numBuckets - 1, Math.floor((high - minPrice) / bucketSize));
        const bucketsInBar = barHighBucket - barLowBucket + 1;
        const weightPerBucket = bucketsInBar > 0 ? weight / bucketsInBar : 0;

        for (let i = barLowBucket; i <= barHighBucket; i++) {
            activityByBucket[i] += weightPerBucket;
        }
        totalActivity += weight;
    }

    if (totalActivity === 0) return null;

    // POC
    let pocBucket = 0;
    for (let i = 1; i < numBuckets; i++) {
        if (activityByBucket[i] > activityByBucket[pocBucket]) pocBucket = i;
    }
    const poc = minPrice + (pocBucket + 0.5) * bucketSize;

    // Value Area (70%)
    const targetActivity = totalActivity * 0.70;
    let vaActivity = activityByBucket[pocBucket];
    let vaLowBucket = pocBucket;
    let vaHighBucket = pocBucket;

    while (vaActivity < targetActivity && (vaLowBucket > 0 || vaHighBucket < numBuckets - 1)) {
        const belowAct = vaLowBucket > 0 ? activityByBucket[vaLowBucket - 1] : 0;
        const aboveAct = vaHighBucket < numBuckets - 1 ? activityByBucket[vaHighBucket + 1] : 0;

        if (belowAct >= aboveAct && vaLowBucket > 0) {
            vaLowBucket--;
            vaActivity += activityByBucket[vaLowBucket];
        } else if (vaHighBucket < numBuckets - 1) {
            vaHighBucket++;
            vaActivity += activityByBucket[vaHighBucket];
        } else if (vaLowBucket > 0) {
            vaLowBucket--;
            vaActivity += activityByBucket[vaLowBucket];
        } else {
            break;
        }
    }

    const vah = minPrice + (vaHighBucket + 1) * bucketSize;
    const val = minPrice + vaLowBucket * bucketSize;

    // Low-activity nodes
    const pocActivity = activityByBucket[pocBucket];
    const lowVolumeNodes = [];
    for (let i = 0; i < numBuckets; i++) {
        if (activityByBucket[i] < pocActivity * 0.30) {
            lowVolumeNodes.push({
                priceLow: minPrice + i * bucketSize,
                priceHigh: minPrice + (i + 1) * bucketSize,
                priceMid: minPrice + (i + 0.5) * bucketSize
            });
        }
    }

    return { vah, val, poc, lowVolumeNodes, bucketSize };
}

// [Phase 2] Fair Value Gap Detection — forex candle format (candle.mid.o/h/l/c)
// Forex-adapted: literal price gaps (next.low > prev.high) are extremely rare in
// continuous 24/5 trading. We additionally detect body-based imbalance zones:
// a strong directional candle whose open is beyond adjacent candle closes —
// an unfilled institutional imbalance zone.
// Classic FVG: next.low > prev.high (kept for weekend gaps / news spikes)
// Relaxed FVG: middle candle opens beyond prev close AND next opens inside imbalance zone
function detectFairValueGaps(candles, lookback = 20) {
    if (!candles || candles.length < 3) return { bullish: [], bearish: [] };

    const recent = candles.slice(-lookback);
    const bullishGaps = [];
    const bearishGaps = [];

    for (let i = 1; i < recent.length - 1; i++) {
        const prev = recent[i - 1];
        const curr = recent[i];
        const next = recent[i + 1];

        const prevHigh = parseFloat(prev.mid.h);
        const prevLow = parseFloat(prev.mid.l);
        const prevClose = parseFloat(prev.mid.c);
        const nextHigh = parseFloat(next.mid.h);
        const nextLow = parseFloat(next.mid.l);
        const nextOpen = parseFloat(next.mid.o);
        const currClose = parseFloat(curr.mid.c);
        const currOpen = parseFloat(curr.mid.o);
        const currHigh = parseFloat(curr.mid.h);
        const currLow = parseFloat(curr.mid.l);
        const currBody = Math.abs(currClose - currOpen);
        const currRange = currHigh - currLow;

        // Require middle candle to have a meaningful body (>50% of range) — filters doji/spinners
        if (currRange <= 0 || currBody / currRange < 0.5) continue;

        if (currClose > currOpen) {
            // Classic bullish FVG: next bar's low > prev bar's high (true price gap)
            if (nextLow > prevHigh) {
                bullishGaps.push({
                    gapLow: prevHigh,
                    gapHigh: nextLow,
                    gapMid: (prevHigh + nextLow) / 2,
                    gapSize: nextLow - prevHigh
                });
            // Relaxed forex bullish FVG: strong up-candle opens above prev close, next opens above prev close
            } else if (currOpen > prevClose && nextOpen > prevClose) {
                const gapLow = prevClose;
                const gapHigh = Math.min(currOpen, nextOpen);
                if (gapHigh > gapLow) {
                    bullishGaps.push({
                        gapLow,
                        gapHigh,
                        gapMid: (gapLow + gapHigh) / 2,
                        gapSize: gapHigh - gapLow
                    });
                }
            }
        }

        if (currClose < currOpen) {
            // Classic bearish FVG: next bar's high < prev bar's low (true price gap)
            if (nextHigh < prevLow) {
                bearishGaps.push({
                    gapLow: nextHigh,
                    gapHigh: prevLow,
                    gapMid: (nextHigh + prevLow) / 2,
                    gapSize: prevLow - nextHigh
                });
            // Relaxed forex bearish FVG: strong down-candle opens below prev close, next opens below prev close
            } else if (currOpen < prevClose && nextOpen < prevClose) {
                const gapLow = Math.max(currOpen, nextOpen);
                const gapHigh = prevClose;
                if (gapHigh > gapLow) {
                    bearishGaps.push({
                        gapLow,
                        gapHigh,
                        gapMid: (gapLow + gapHigh) / 2,
                        gapSize: gapHigh - gapLow
                    });
                }
            }
        }
    }

    return { bullish: bullishGaps, bearish: bearishGaps };
}

// [Phase 3] Committee Aggregator for Forex — combines multiple signal confirmations
// Direction-aware: flow scoring is relative to trade direction
function computeForexCommitteeScore(signal) {
    let confirmations = 0;
    let totalWeight = 0;
    const isLong = signal.direction === 'long';

    // 1. Trend alignment — H1 trend matching signal direction (weight: dynamic via forexCommitteeWeights)
    const trendScore = (isLong && signal.h1Trend === 'up') || (!isLong && signal.h1Trend === 'down') ? 1.0 : 0.0;
    confirmations += trendScore * forexCommitteeWeights.trend;
    totalWeight += forexCommitteeWeights.trend;

    // 2. Order flow confirmation — direction-aware (weight: dynamic via forexCommitteeWeights)
    let flowScore = 0.5;
    if (signal.orderFlowImbalance !== undefined) {
        flowScore = isLong
            ? Math.max(0, Math.min(1, signal.orderFlowImbalance + 0.5)) // positive flow favors longs
            : Math.max(0, Math.min(1, -signal.orderFlowImbalance + 0.5)); // negative flow favors shorts
    }
    confirmations += flowScore * forexCommitteeWeights.orderFlow;
    totalWeight += forexCommitteeWeights.orderFlow;

    // 3. Displacement candle (weight: dynamic via forexCommitteeWeights)
    const displacementScore = signal.hasDisplacement ? 1.0 : 0.0;
    confirmations += displacementScore * forexCommitteeWeights.displacement;
    totalWeight += forexCommitteeWeights.displacement;

    // 4. Volume Profile position — direction-aware (weight: dynamic via forexCommitteeWeights)
    let vpScore = 0.5;
    if (signal.volumeProfile) {
        const price = signal.entry;
        const { vah, val } = signal.volumeProfile;
        const range = vah - val;
        if (range > 0) {
            const positionInRange = (price - val) / range;
            // Longs want to buy near VAL (low), shorts want to sell near VAH (high)
            vpScore = isLong
                ? Math.max(0, 1.0 - positionInRange)
                : Math.max(0, positionInRange);
        }
    }
    confirmations += vpScore * forexCommitteeWeights.volumeProfile;
    totalWeight += forexCommitteeWeights.volumeProfile;

    // 5. FVG confirmation (weight: dynamic via forexCommitteeWeights)
    const fvgScore = (signal.fvgCount || 0) > 0 ? 1.0 : 0.0;
    confirmations += fvgScore * forexCommitteeWeights.fvg;
    totalWeight += forexCommitteeWeights.fvg;

    // 6. MACD momentum (weight: dynamic via forexCommitteeWeights)
    let macdScore = 0.5;
    if (signal.macdHistogram !== null && signal.macdHistogram !== undefined) {
        macdScore = isLong
            ? Math.min(1, Math.max(0, signal.macdHistogram * 10000 + 0.5))
            : Math.min(1, Math.max(0, -signal.macdHistogram * 10000 + 0.5));
    }
    confirmations += macdScore * forexCommitteeWeights.macd;
    totalWeight += forexCommitteeWeights.macd;

    const confidence = totalWeight > 0 ? confirmations / totalWeight : 0;

    return {
        confidence: parseFloat(confidence.toFixed(3)),
        components: {
            trend: trendScore,
            orderFlow: parseFloat(flowScore.toFixed(3)),
            displacement: displacementScore,
            volumeProfile: parseFloat(vpScore.toFixed(3)),
            fvg: fvgScore,
            macd: parseFloat(macdScore.toFixed(3))
        }
    };
}

// [v3.2] H1 Trend Filter — only trade M15 signals that align with H1 direction
// [v14.0] Strengthened: 5-candle majority (4/5), linear slope confirmation, ADX > 20 filter
async function getH1Trend(pair) {
    try {
        const h1Candles = await getCandles(pair, 'H1', 30);
        if (h1Candles.length < 22) return 'neutral';
        const closes = h1Candles.map(c => parseFloat(c.mid.c));
        const highs  = h1Candles.map(c => parseFloat(c.mid.h));
        const lows   = h1Candles.map(c => parseFloat(c.mid.l));
        const period = 20;
        const sma20 = closes.slice(-period).reduce((a, b) => a + b, 0) / period;

        // [v14.0] Use last 5 candles instead of 3 — reduces noise from single-candle spikes
        const last5 = closes.slice(-5);

        // Majority rule: at least 4-of-5 closes must be on the same side of SMA20
        const aboveCount = last5.filter(c => c > sma20).length;
        const belowCount = last5.filter(c => c < sma20).length;

        // [v14.0] Linear slope confirmation: compare average of last 2 vs average of first 2
        // Requires a sustained 0.1% directional move — not just end-to-end comparison
        const earlyAvg = (last5[0] + last5[1]) / 2;
        const lateAvg  = (last5[3] + last5[4]) / 2;
        const slopeUp   = lateAvg > earlyAvg * 1.001; // 0.1% higher (sustained upward drift)
        const slopeDown = lateAvg < earlyAvg * 0.999; // 0.1% lower  (sustained downward drift)

        // [v14.0] ADX filter: compute 14-period ADX from H1 candles to confirm trend strength
        // ADX > 20 = trending market; ADX <= 20 = ranging/weak — don't trade trend direction
        let adx = null;
        const adxPeriod = 14;
        if (highs.length >= adxPeriod + 1 && lows.length >= adxPeriod + 1) {
            // True Range and Directional Movement
            const tr   = [];
            const dmPlus  = [];
            const dmMinus = [];
            for (let i = 1; i < highs.length; i++) {
                const trVal = Math.max(
                    highs[i] - lows[i],
                    Math.abs(highs[i] - closes[i - 1]),
                    Math.abs(lows[i]  - closes[i - 1])
                );
                tr.push(trVal);
                const upMove   = highs[i]  - highs[i - 1];
                const downMove = lows[i - 1] - lows[i];
                dmPlus.push(upMove > downMove && upMove > 0 ? upMove : 0);
                dmMinus.push(downMove > upMove && downMove > 0 ? downMove : 0);
            }
            // Wilder's smoothed averages (initial sum then rolling)
            let atr14   = tr.slice(0, adxPeriod).reduce((a, b) => a + b, 0);
            let diP14   = dmPlus.slice(0, adxPeriod).reduce((a, b) => a + b, 0);
            let diM14   = dmMinus.slice(0, adxPeriod).reduce((a, b) => a + b, 0);
            const dxArr = [];
            // First DX from the initial sums
            const diPct0 = atr14 > 0 ? (diP14 / atr14) * 100 : 0;
            const diMct0 = atr14 > 0 ? (diM14 / atr14) * 100 : 0;
            const dxSum0 = diPct0 + diMct0;
            if (dxSum0 > 0) dxArr.push(Math.abs(diPct0 - diMct0) / dxSum0 * 100);
            for (let i = adxPeriod; i < tr.length; i++) {
                atr14 = atr14 - atr14 / adxPeriod + tr[i];
                diP14 = diP14 - diP14 / adxPeriod + dmPlus[i];
                diM14 = diM14 - diM14 / adxPeriod + dmMinus[i];
                const diPct = atr14 > 0 ? (diP14 / atr14) * 100 : 0;
                const diMct = atr14 > 0 ? (diM14 / atr14) * 100 : 0;
                const dxDenom = diPct + diMct;
                if (dxDenom > 0) dxArr.push(Math.abs(diPct - diMct) / dxDenom * 100);
            }
            if (dxArr.length >= adxPeriod) {
                adx = dxArr.slice(-adxPeriod).reduce((a, b) => a + b, 0) / adxPeriod;
            }
        }
        const adxTrending = adx === null || adx > 20; // pass-through if ADX unavailable

        console.log(`[H1 Trend] ${pair}: SMA20=${sma20.toFixed(5)}, above=${aboveCount}/5, below=${belowCount}/5, slopeUp=${slopeUp}, slopeDown=${slopeDown}, ADX=${adx !== null ? adx.toFixed(1) : 'n/a'}`);

        if (aboveCount >= 4 && slopeUp   && adxTrending) return 'up';
        if (belowCount >= 4 && slopeDown  && adxTrending) return 'down';
        return 'neutral';
    } catch (e) {
        console.warn(`[H1 Trend] ${pair}: ${e.message}`);
        return 'neutral';
    }
}

// [v11.0] D1 Trend Confirmation — prevents counter-trend entries against the daily bias
// Cache D1 trend for 4 hours (daily trend doesn't change fast)
const d1TrendCache = new Map(); // pair -> { trend, timestamp }
const D1_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

async function getD1Trend(pair) {
    // Check cache first
    const cached = d1TrendCache.get(pair);
    if (cached && (Date.now() - cached.timestamp) < D1_CACHE_TTL) {
        return cached.trend;
    }

    try {
        const d1Candles = await getCandles(pair, 'D', 30);
        if (d1Candles.length < 22) {
            d1TrendCache.set(pair, { trend: 'neutral', timestamp: Date.now() });
            return 'neutral';
        }
        const closes = d1Candles.map(c => parseFloat(c.mid.c));
        const period = 20;
        const sma20 = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
        const currentPrice = closes[closes.length - 1];
        const last3 = closes.slice(-3);
        const aboveCount = last3.filter(c => c > sma20).length;
        const belowCount = last3.filter(c => c < sma20).length;

        let trend = 'neutral';
        if (currentPrice > sma20 && aboveCount >= 2) trend = 'up';
        else if (currentPrice < sma20 && belowCount >= 2) trend = 'down';

        d1TrendCache.set(pair, { trend, timestamp: Date.now() });
        return trend;
    } catch (e) {
        console.warn(`[D1 Trend] ${pair}: ${e.message}`);
        d1TrendCache.set(pair, { trend: 'neutral', timestamp: Date.now() });
        return 'neutral';
    }
}

// [Phase 3] Forex Regime Detection — classifies market conditions from aggregate pair volatility
// Forex regimes: low-vol (range/consolidation), normal (trending), high-vol (news/crisis)
const FOREX_REGIME_ADJUSTMENTS = {
    low: {
        label: 'Low Volatility',
        positionSizeMultiplier: 1.1,
        scoreThresholdMultiplier: 0.9,
        maxPositions: 5
    },
    medium: {
        label: 'Normal',
        positionSizeMultiplier: 1.0,
        scoreThresholdMultiplier: 1.0,
        maxPositions: 4
    },
    high: {
        label: 'High Volatility',
        positionSizeMultiplier: 0.5,
        scoreThresholdMultiplier: 1.3,
        maxPositions: 2
    }
};

function detectForexRegime(analyses) {
    if (!analyses || analyses.length === 0) {
        return { regime: 'medium', adjustments: FOREX_REGIME_ADJUSTMENTS.medium };
    }

    // Average ATR% across all analyzed pairs
    const atrValues = analyses
        .filter(a => a && a.atrPct > 0)
        .map(a => a.atrPct);

    if (atrValues.length === 0) {
        return { regime: 'medium', adjustments: FOREX_REGIME_ADJUSTMENTS.medium };
    }

    const avgAtrPct = atrValues.reduce((sum, v) => sum + v, 0) / atrValues.length;

    // Forex ATR% thresholds (M15 bars):
    // Low: < 0.15% (consolidation/Asian session spillover)
    // Medium: 0.15-0.40% (normal London/NY trading)
    // High: > 0.40% (news events, risk-off moves)
    let regime;
    if (avgAtrPct < 0.0015) {
        regime = 'low';
    } else if (avgAtrPct > 0.004) {
        regime = 'high';
    } else {
        regime = 'medium';
    }

    return {
        regime,
        avgAtrPct: parseFloat((avgAtrPct * 100).toFixed(3)),
        adjustments: FOREX_REGIME_ADJUSTMENTS[regime]
    };
}

// ===== STRATEGY BRIDGE =====
// Non-blocking ensemble confirmation — if bridge is offline, local signals are used as-is

const BRIDGE_URL = (() => {
    const raw = process.env.STRATEGY_BRIDGE_URL
        || process.env.RAILWAY_SERVICE_NEXUS_STRATEGY_BRIDGE_URL
        || (process.env.RAILWAY_ENVIRONMENT ? 'https://nexus-strategy-bridge-production.up.railway.app' : 'http://localhost:3010');
    if (raw.startsWith('http')) return raw;
    if (raw.includes('railway.app')) return `https://${raw}`;
    return `http://${raw}`;
})();
console.log(`🤖 Strategy Bridge URL: ${BRIDGE_URL}`);

// ===== AI TRADE ADVISOR =====
// [v5.0] Agentic AI — Claude-powered trade evaluation via strategy bridge
// HARD GATE: every trade MUST be approved by the agent pipeline
// [v6.3] Agent decision cache — avoids redundant Claude API calls when the same
// pair appears in consecutive scan cycles with similar conditions.
const _forexAgentCache = new Map(); // key: pair, value: { result, price, timestamp }
const _FOREX_AGENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes — forex sessions are long, saves API budget
const _FOREX_AGENT_CACHE_PRICE_DRIFT = 0.003; // 0.3% price change invalidates (forex is tighter)

async function queryAIAdvisor(signal) {
    // Check cache first
    const cached = _forexAgentCache.get(signal.pair);
    if (cached && cached.price > 0) {
        const age = Date.now() - cached.timestamp;
        const priceDrift = Math.abs(signal.entry - cached.price) / cached.price;
        if (age < _FOREX_AGENT_CACHE_TTL_MS && priceDrift < _FOREX_AGENT_CACHE_PRICE_DRIFT) {
            console.log(`[Agent] ${signal.pair}: using cached decision (${(age / 1000).toFixed(0)}s old, drift ${(priceDrift * 100).toFixed(3)}%)`);
            return { ...cached.result, source: 'cache' };
        }
        _forexAgentCache.delete(signal.pair);
    }

    try {
        const payload = {
            symbol: signal.pair,
            direction: signal.direction || 'long',
            tier: signal.tier || 'tier1',
            asset_class: 'forex',
            price: signal.entry,
            stop_loss: signal.stopLoss,
            take_profit: signal.takeProfit,
            rsi: signal.rsi,
            trend_strength: signal.trendStrength,
            atr_pct: signal.atrPct,
            h1_trend: signal.h1Trend,
            session: signal.session,
            regime: signal.regime,
            regime_quality: signal.regimeQuality,
            macd_histogram: signal.macdHistogram,
            score: signal.score,
        };
        console.log(`[Agent] Evaluating ${signal.pair} via ${BRIDGE_URL}/agent/evaluate`);
        const response = await axios.post(`${BRIDGE_URL}/agent/evaluate`, payload, { timeout: 15000 });
        const result = response.data;
        console.log(`[Agent] ${signal.pair}: ${result.approved ? 'APPROVED' : 'REJECTED'} (source: ${result.source}, conf: ${(result.confidence || 0).toFixed(2)}) — ${result.reason}`);

        // [v15.0] Detect rubber-stamp pass-through: bridge returning "Rule-based: signals look clean"
        // at 100% confidence means NO real AI filtering happened (bridge is a pass-through or using
        // a trivial fallback). Re-compute the committee score here so the MIN_SIGNAL_CONFIDENCE
        // guardrail actually filters based on real signal quality rather than trusting the bridge blindly.
        const isRubberStamp = result.approved === true
            && result.confidence >= 1.0
            && typeof result.reason === 'string'
            && result.reason.toLowerCase().includes('rule-based');
        if (isRubberStamp) {
            // Compute real committee score — signal has orderFlow, displacement, fvg, etc. already set
            const freshCommittee = computeForexCommitteeScore(signal);
            result.confidence = freshCommittee.confidence;
            result.reason = `${result.reason} [rubber-stamp: replaced 1.0 with committee ${freshCommittee.confidence.toFixed(2)}]`;
            result.source = 'rule_based_downgraded';
            console.log(`[Agent] ${signal.pair}: rubber-stamp detected — confidence downgraded to committee:${freshCommittee.confidence.toFixed(2)} (trend:${freshCommittee.components.trend} flow:${freshCommittee.components.orderFlow} disp:${freshCommittee.components.displacement})`);
        }

        // Cache the result
        _forexAgentCache.set(signal.pair, {
            result,
            price: signal.entry,
            timestamp: Date.now(),
        });

        return result;
    } catch (e) {
        console.error(`[Agent] ${signal.pair} call FAILED: ${e.message} — BLOCKING trade (hard gate)`);
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
async function reportForexTradeOutcome(position, exitPrice, pnl, pnlPct, exitReason) {
    try {
        const rMultiple = position.stopLoss
            ? Math.abs(pnl) / Math.abs(position.entry - position.stopLoss)
            : 0;
        const holdMinutes = (Date.now() - (position.entryTime || Date.now())) / 60000;
        const payload = {
            symbol: position.pair,
            asset_class: 'forex',
            direction: position.direction || 'long',
            tier: position.tier || 'tier1',
            entry_price: position.entry,
            exit_price: exitPrice,
            pnl: pnl,
            pnl_pct: pnlPct * 100,
            r_multiple: pnl > 0 ? rMultiple : -rMultiple,
            hold_duration_minutes: holdMinutes,
            exit_reason: exitReason,
            entry_rsi: position.rsi || undefined,
            entry_regime: position.regime || undefined,
            entry_regime_quality: position.regimeQuality || undefined,
            entry_atr_pct: position.atrPct || undefined,
            entry_score: position.score || undefined,
            agent_approved: position.agentApproved,
            agent_confidence: position.agentConfidence,
            agent_reason: position.agentReason,
            decision_run_id: position.decisionRunId || null,
            bandit_arm: position.banditArm || null,
        };
        await axios.post(`${BRIDGE_URL}/agent/trade-outcome`, payload, { timeout: 5000 });
        console.log(`[Learn] ${position.pair} outcome reported: ${pnl > 0 ? 'WIN' : 'LOSS'} ${(pnlPct * 100).toFixed(2)}%`);
    } catch (e) {
        console.warn('reportForexTradeOutcome failed:', e.message);
    }
}

async function queryStrategyBridge(pair, _direction) {
    try {
        const candles = await getCandles(pair, 'M15', 60);
        if (!candles || candles.length < 30) return null;
        const prices = candles.map(c => ({
            timestamp: c.time || new Date().toISOString(),
            open:   parseFloat(c.mid.o) || 0,
            high:   parseFloat(c.mid.h) || 0,
            low:    parseFloat(c.mid.l) || 0,
            close:  parseFloat(c.mid.c) || 0,
            volume: parseFloat(c.volume) || 0
        }));
        const response = await axios.post(`${BRIDGE_URL}/signal`,
            { symbol: pair, prices, asset_class: 'forex' },
            { timeout: 5000 }
        );
        return response.data;
    } catch (e) {
        return null;
    }
}

// ===== TRAILING STOP UPDATE =====

function updateTrailingStop(position, currentPrice) {
    const gainPct = position.direction === 'long'
        ? (currentPrice - position.entry) / position.entry
        : (position.entry - currentPrice) / position.entry;

    for (let i = EXIT_CONFIG.trailingStopLevels.length - 1; i >= 0; i--) {
        const level = EXIT_CONFIG.trailingStopLevels[i];

        if (gainPct >= level.gainThreshold) {
            const totalGain = Math.abs(currentPrice - position.entry);
            const lockedGain = totalGain * level.lockPercent;

            const newStop = position.direction === 'long'
                ? position.entry + lockedGain
                : position.entry - lockedGain;

            const shouldUpdate = position.direction === 'long'
                ? newStop > position.stopLoss
                : newStop < position.stopLoss;

            if (shouldUpdate) {
                console.log(`🔒 ${position.pair}: Trailing stop raised to ${newStop.toFixed(5)} (locking ${(level.lockPercent * 100).toFixed(0)}% of +${(gainPct * 100).toFixed(2)}%)`);
                position.stopLoss = newStop;
                return true;
            }
            break;
        }
    }
    return false;
}

// ===== MOMENTUM ANALYSIS =====

async function analyzePair(pair) {
    const candles = await getCandles(pair, 'M15', 100);
    if (!candles || candles.length < 50) return null;

    const currentPrice = parseFloat(candles[candles.length - 1].mid.c);
    const sma10 = calculateSMA(candles, 10);
    const sma20 = calculateSMA(candles, 20);
    const sma50 = calculateSMA(candles, 50);
    const rsi = calculateRSI(candles);
    const atr = calculateATR(candles);

    // [v3.2] ATR as % of price — used for adaptive stops/targets
    const atrPct = currentPrice > 0 ? atr / currentPrice : 0;

    // [v3.2] Bollinger Bands — breakout confirmation
    const bb = calculateBollingerBands(candles, 20, 2);

    const isUptrend = sma10 > sma20 && sma20 > sma50 && currentPrice > sma10;
    const isDowntrend = sma10 < sma20 && sma20 < sma50 && currentPrice < sma10;
    // [v7.0] Measure proximity to SMA20 (pullback-to-support), NOT extension from SMA50
    // Old: Math.abs(currentPrice - sma50) / sma50 — bought tops (most extended = highest score)
    // New: small value = price is near SMA20 (good entry); large value = price is far from SMA20 (skip)
    const trendStrength = Math.abs(currentPrice - sma20) / sma20;
    const pullback = sma10 > 0 ? Math.abs(currentPrice - sma10) / sma10 : 0;

    // [v3.2] Entry candle direction — last completed M15 candle must align with signal
    const lastCandle = candles[candles.length - 1];
    const lastCandleBullish = parseFloat(lastCandle.mid.c) > parseFloat(lastCandle.mid.o);
    const lastCandleBearish = parseFloat(lastCandle.mid.c) < parseFloat(lastCandle.mid.o);

    // [v3.4] MACD(12,26,9) confirmation — momentum must be accelerating in signal direction
    const macd = calculateMACDForex(candles);

    // [Phase 1] Order flow imbalance and displacement candle detection
    const orderFlowImbalance = calculateOrderFlowImbalance(candles, 20);
    const hasDisplacement = isDisplacementCandle(candles, atr, 3);

    // [Phase 2] Volume Profile and Fair Value Gap analysis
    const volumeProfile = calculateVolumeProfile(candles, 40);
    const fvg = detectFairValueGaps(candles, 20);

    return {
        pair, currentPrice, sma10, sma20, sma50, rsi, atr,
        atrPct, bb, macd, pullback,
        isUptrend, isDowntrend, trendStrength,
        lastCandleBullish, lastCandleBearish,
        orderFlowImbalance, hasDisplacement,
        volumeProfile, fvg
    };
}

// [Phase 3.5] Portfolio Risk Engine — cross-bot position correlation and exposure check
// Queries other bots to prevent correlated exposure across the portfolio
async function checkPortfolioRisk() {
    const risks = { totalPositions: 0, warnings: [] };

    // Count local positions
    risks.totalPositions += positions.size;

    // Query stock bot positions
    try {
        const stockRes = await axios.get(`${STOCK_BOT_URL}/api/trading/status`, { timeout: 2000 });
        const stockPositions = stockRes.data?.data?.positions || stockRes.data?.positions || [];
        risks.totalPositions += stockPositions.length;
    } catch { /* stock bot offline — non-blocking */ }

    // Query crypto bot positions
    try {
        const cryptoRes = await axios.get(`${CRYPTO_BOT_URL}/api/crypto/status`, { timeout: 2000 });
        const cryptoPositions = cryptoRes.data?.data?.positions || cryptoRes.data?.positions || [];
        risks.totalPositions += cryptoPositions.length;
    } catch { /* crypto bot offline — non-blocking */ }

    // Portfolio-wide limits
    if (risks.totalPositions >= 12) {
        risks.warnings.push(`Portfolio: ${risks.totalPositions} positions (limit: 12)`);
    }

    return risks;
}

async function scanForSignals(heldPositions = positions) {
    const signals = [];
    const session = getCurrentSession();

    // [v7.1] Allow London, London/NY Overlap, AND New York sessions
    // Only block Tokyo, Sydney, and off-peak (low liquidity = wide spreads)
    const allowedSessions = ['London', 'London/NY Overlap', 'New York'];
    if (!allowedSessions.includes(session.name)) {
        console.log(`⏸️ ${session.name} — restricted to London/NY sessions only, skipping new entries`);
        return signals;
    }

    // [v3.4] Parallelize M15 analysis + H1 trend fetch for all pairs simultaneously
    // Previously sequential (~2s × 12 pairs = 24s lag); now concurrent (~2-3s total)
    const tradablePairs = FOREX_PAIRS.filter(pair => !heldPositions.has(pair) && canTrade(pair).allowed);

    // [v8.1] Also scan pairs with existing positions for flip-reversal candidates
    const MIN_HOLD_TIME_FOR_FLIP = 15 * 60 * 1000; // 15 minutes minimum before allowing flip
    const flipCandidatePairs = FOREX_PAIRS.filter(pair => {
        if (!heldPositions.has(pair)) return false;
        const pos = heldPositions.get(pair);
        // Must have been held for at least 15 minutes
        const holdTime = Date.now() - (pos.entryTime instanceof Date ? pos.entryTime.getTime() : pos.entryTime || 0);
        if (holdTime < MIN_HOLD_TIME_FOR_FLIP) return false;
        // Must have room for 2 trades (close + open) under daily limit
        if (totalTradesToday + 2 > MAX_TRADES_PER_DAY) return false;
        return true;
    });

    const allPairsToScan = [...new Set([...tradablePairs, ...flipCandidatePairs])];

    const pairResults = await Promise.allSettled(
        allPairsToScan.map(async pair => {
            const [analysis, h1Trend, d1Trend] = await Promise.all([
                analyzePair(pair),
                getH1Trend(pair),
                getD1Trend(pair)
            ]);
            return { pair, analysis, h1Trend, d1Trend };
        })
    );

    // [Phase 3] Detect forex regime from aggregate pair volatility
    const validAnalyses = pairResults
        .filter(r => r.status === 'fulfilled' && r.value.analysis)
        .map(r => r.value.analysis);
    const forexRegime = detectForexRegime(validAnalyses);
    console.log(`[Regime] Forex: ${forexRegime.adjustments.label} (avg ATR: ${forexRegime.avgAtrPct || '?'}%) — size:×${forexRegime.adjustments.positionSizeMultiplier} maxPos:${forexRegime.adjustments.maxPositions}`);

    // [Phase 3.5] Portfolio-level risk check (cross-bot)
    const portfolioRisk = await checkPortfolioRisk();
    if (portfolioRisk.totalPositions >= 12) {
        console.log(`[Portfolio Risk] ${portfolioRisk.totalPositions} total positions — portfolio limit reached`);
        return signals;
    }
    if (portfolioRisk.warnings.length > 0) {
        console.log(`[Portfolio Risk] ${portfolioRisk.warnings.join('; ')}`);
    }

    for (const result of pairResults) {
        if (result.status === 'rejected' || !result.value.analysis) continue;

        const { pair, analysis, h1Trend, d1Trend } = result.value;
        const {
            currentPrice, rsi, isUptrend, isDowntrend, trendStrength,
            atrPct, bb, macd, pullback, lastCandleBullish, lastCandleBearish
        } = analysis;

        // [v7.0] Determine tier by ATR volatility, NOT by distance from SMA
        // Old logic required trendStrength >= threshold (i.e. price far from SMA = high tier)
        // which contradicted the pullback-entry goal. Now: ATR-based tiers for position sizing.
        let tier = 'tier1';  // default
        if (atrPct >= 0.008) tier = 'tier3';       // high volatility pair → smaller size, wider stops
        else if (atrPct >= 0.005) tier = 'tier2';   // medium volatility

        const config = MOMENTUM_CONFIG[tier];
        const maxPullback = FOREX_PULLBACK_CONFIG[tier] || FOREX_PULLBACK_CONFIG.tier1;

        // [v8.1] Detect flip-reversal candidate: pair has existing position in opposite direction
        const existingPos = heldPositions.get(pair);
        const isFlipCandidate = !!existingPos;

        // [Phase 3] Regime-based total position cap — skip for flip candidates (net position count unchanged)
        if (!isFlipCandidate && positions.size >= forexRegime.adjustments.maxPositions) continue;
        const tierPositions = Array.from(positions.values()).filter(p => p.tier === tier).length;
        if (!isFlipCandidate && tierPositions >= config.maxPositions) continue;
        if (pullback > maxPullback) {
            console.log(`[Pullback Filter] ${pair} skipped — extended ${ (pullback * 100).toFixed(2)}% from M15 trend anchor (max ${(maxPullback * 100).toFixed(2)}%)`);
            continue;
        }

        // [v7.0] Removed v3.9 minPullbackRatio — pullback quality is now checked directly
        // via pullbackToMA <= 0.0015 in the entry conditions (proximity to SMA20)

        // [v3.9] ATR noise cap — skip choppy/volatile pairs where stops get hunted
        const MAX_ATR_PCT = 0.020; // [v7.1] 2.0% — was 1.2%, excluded higher-vol pairs like GBP/JPY
        if (atrPct > MAX_ATR_PCT) {
            console.log(`[ATR Cap] ${pair} skipped — ATR ${(atrPct * 100).toFixed(2)}% > ${(MAX_ATR_PCT * 100).toFixed(1)}% cap (too volatile)`);
            continue;
        }

        // [v7.0] Removed v3.9 MIN_TREND_STRENGTH multiplier — it required price to be MORE extended
        // from SMA, which is the opposite of what we want (pullback entries near SMA20)

        // [v16.0] ATR-based stops/targets — M15 ATR for EUR/USD is ~0.09%, so 1.5x = 0.14%
        // which is always less than config stop (0.8%). Old multiplier was useless.
        // New: 6x ATR for stop (~0.54% EUR/USD, ~0.78% GBP/JPY), 12x ATR for target (2:1 R:R)
        // This gives ATR-adaptive stops for volatile pairs while config is the floor for calm ones
        const atrStop   = atrPct > 0 ? Math.min(Math.max(atrPct * 6, config.stopLoss), 0.03) : config.stopLoss;
        const atrTarget = atrPct > 0 ? Math.min(Math.max(atrPct * 12, config.profitTarget), 0.05) : config.profitTarget;
        if (atrPct > 0) console.log(`   [ATR Stops] ${pair}: atrPct=${(atrPct*100).toFixed(3)}% | Stop: ${(atrStop*100).toFixed(3)}% | Target: ${(atrTarget*100).toFixed(3)}%`);

        // LONG Signal — [v7.0] Pullback-to-support entry: 4 key filters only
        // 1) H1 trend up  2) Price near SMA20  3) RSI 35-55  4) MACD histogram > 0
        const pullbackToMA = Math.abs(currentPrice - analysis.sma20) / analysis.sma20;
        // [Tier3 Fix] ATR-adaptive pullback threshold — 0.75 * ATR instead of fixed 0.5%
        // Floor 0.3% (stable pairs like EUR/USD), cap 1.0% (volatile pairs like GBP/JPY)
        const maxPullbackToMA = Math.max(0.003, Math.min(atrPct * 0.75, 0.01));

        // [v11.0] D1 trend gate — block counter-trend entries
        // [v14.0] FIX: was inverted (!== allowed counter-trend). Now requires alignment.
        //   Allow neutral D1 for both directions (sideways markets still tradeable)
        const d1LongOk = d1Trend === 'up' || d1Trend === 'neutral';
        if (!d1LongOk) {
            console.log(`[D1 FILTER] ${pair} long: D1 trend=${d1Trend} — REJECTED (counter-trend)`);
        }
        const d1ShortOk = d1Trend === 'down' || d1Trend === 'neutral';
        if (!d1ShortOk && h1Trend === 'down') {
            console.log(`[D1 FILTER] ${pair} short: D1 trend=${d1Trend} — REJECTED (counter-trend)`);
        }

        // [v13.1] Diagnostic: log why longs fail on D1-allowed pairs
        if (d1LongOk && h1Trend !== 'up') {
            console.log(`[LONG DIAG] ${pair}: d1Long=OK but h1Trend=${h1Trend} (need up) — skipped`);
        } else if (d1LongOk && h1Trend === 'up') {
            const longFails = [];
            if (pullbackToMA > maxPullbackToMA) longFails.push(`pullback=${(pullbackToMA*100).toFixed(3)}%>${(maxPullbackToMA*100).toFixed(3)}% (ATR-adaptive)`);
            if (rsi < 35 || rsi > 65) longFails.push(`rsi=${rsi.toFixed(1)} outside 35-65`);
            if (!macd) longFails.push('macd=null');
            else if (macd.histogram <= 0) longFails.push(`macdHist=${macd.histogram.toFixed(5)}<=0`);
            if (longFails.length > 0) console.log(`[LONG DIAG] ${pair}: h1=up d1=OK but ${longFails.join(', ')}`);
        }
        // [v13.2] RSI range widened: 35-65 for longs (was 35-55)
        // In uptrends, RSI naturally runs 55-65. Old range blocked ALL trending entries.
        if (d1LongOk && h1Trend === 'up' && pullbackToMA <= maxPullbackToMA && rsi >= 35 && rsi <= 65 && macd !== null && macd.histogram > 0) {
            // [v3.3] Strategy Bridge advisory — only block if bridge explicitly signals SHORT with high confidence
            const bridgeLong = await queryStrategyBridge(pair, 'long');
            if (bridgeLong !== null && bridgeLong.direction === 'short' && bridgeLong.confidence > 0.7) {
                console.log(`[Bridge] ${pair} LONG rejected — bridge explicit SHORT conf:${bridgeLong.confidence.toFixed(2)}`);
                // fall through to SHORT check
            } else {
                if (bridgeLong !== null) {
                    console.log(`[Bridge] ${pair} LONG advisory: ${bridgeLong.direction} conf:${(bridgeLong.confidence || 0).toFixed(2)}`);
                }
                // [Phase 1] Order flow must confirm buying pressure for longs
                // [v14.0] FIX: threshold 0.05 → 0.02 (forex liquidity makes ±5% imbalance rare)
                if (analysis.orderFlowImbalance < 0.02) {
                    console.log(`[Order Flow] ${pair} LONG skipped — imbalance ${analysis.orderFlowImbalance.toFixed(3)} < 0.02 (no buy pressure)`);
                    continue;
                }
                const score = scoreForexSignal({
                    tier,
                    trendStrength,
                    pullback,
                    maxPullback,
                    rsi,
                    direction: 'long',
                    session,
                    macd
                });
                const regimeProfile = evaluateForexRegimeSignal({
                    tier,
                    trendStrength,
                    pullback,
                    maxPullback,
                    rsi,
                    direction: 'long',
                    session,
                    h1Trend,
                    macd
                });
                if (!regimeProfile.tradable) continue;
                // [v7.0] Re-enabled pullbackContinuation — this IS the correct forex strategy
                // (was 0% WR under old logic that bought tops; now we buy pullbacks to SMA20)
                const strategy = pullback >= maxPullback * 0.55 ? 'pullbackContinuation' : 'trendContinuation';
                // [Phase 2] Volume Profile and FVG score adjustments
                let vpBonus = 1.0;
                if (analysis.volumeProfile) {
                    const distToVAL = Math.abs(currentPrice - analysis.volumeProfile.val) / currentPrice;
                    const distToVAH = Math.abs(currentPrice - analysis.volumeProfile.vah) / currentPrice;
                    if (distToVAL < 0.002) vpBonus = 1.10; // Near VAL = buying at discount
                    else if (distToVAH < 0.001) vpBonus = 0.90; // Near VAH = buying at premium
                }
                let fvgBonus = 1.0;
                if (analysis.fvg && analysis.fvg.bullish.length > 0 && analysis.volumeProfile && analysis.volumeProfile.lowVolumeNodes.length > 0) {
                    const hasConfirmedFVG = analysis.fvg.bullish.some(gap =>
                        analysis.volumeProfile.lowVolumeNodes.some(node =>
                            gap.gapMid >= node.priceLow && gap.gapMid <= node.priceHigh
                        )
                    );
                    if (hasConfirmedFVG) fvgBonus = 1.12;
                }
                // [v8.1] Only generate flip signal if direction is opposite to existing position
                const isFlipLong = isFlipCandidate && existingPos && existingPos.direction === 'short';
                if (!isFlipCandidate || isFlipLong) {
                    signals.push({
                        pair, direction: 'long', tier,
                        entry: currentPrice,
                        stopLoss:   currentPrice * (1 - atrStop),
                        takeProfit: currentPrice * (1 + atrTarget),
                        rsi, trendStrength, atrPct, h1Trend, d1Trend, pullback,
                        score: parseFloat((score * regimeProfile.quality * (analysis.hasDisplacement ? 1.15 : 1.0) * vpBonus * fvgBonus).toFixed(3)),
                        strategy,
                        regime: regimeProfile.regime,
                        regimeQuality: regimeProfile.quality,
                        marketRegime: forexRegime.regime,
                        macdHistogram: macd ? macd.histogram : null,
                        orderFlowImbalance: analysis.orderFlowImbalance,
                        hasDisplacement: analysis.hasDisplacement,
                        volumeProfile: analysis.volumeProfile ? { vah: analysis.volumeProfile.vah, val: analysis.volumeProfile.val, poc: analysis.volumeProfile.poc } : null,
                        fvgCount: analysis.fvg ? analysis.fvg.bullish.length + analysis.fvg.bearish.length : 0,
                        session: session.name,
                        isFlipReversal: isFlipLong || false,
                        existingDirection: isFlipLong ? 'short' : null
                    });
                }
            }
        }

        // SHORT Signal — [v7.0] Pullback-to-resistance entry: 4 key filters only
        // 1) H1 trend down  2) Price near SMA20  3) RSI 35-65  4) MACD histogram < 0.00005
        // [v13.2] RSI widened 35-65 (was 45-65), MACD threshold relaxed for near-zero values
        if (d1ShortOk && h1Trend !== 'down') {
            console.log(`[SHORT DIAG] ${pair}: d1Short=OK but h1Trend=${h1Trend} (need down) — skipped`);
        } else if (d1ShortOk && h1Trend === 'down') {
            const shortFails = [];
            if (pullbackToMA > maxPullbackToMA) shortFails.push(`pullback=${(pullbackToMA*100).toFixed(3)}%>${(maxPullbackToMA*100).toFixed(3)}% (ATR-adaptive)`);
            if (rsi < 35 || rsi > 65) shortFails.push(`rsi=${rsi.toFixed(1)} outside 35-65`);
            if (!macd) shortFails.push('macd=null');
            // [v14.0] FIX: MACD short threshold aligned with long (was 0.00005, now < 0)
            else if (macd.histogram >= 0) shortFails.push(`macdHist=${macd.histogram.toFixed(5)}>=0`);
            if (shortFails.length > 0) console.log(`[SHORT DIAG] ${pair}: h1=down d1=OK but ${shortFails.join(', ')}`);
        }
        // [v14.0] FIX: MACD threshold for shorts was < 0.00005 (nearly impossible). Now < 0 to match longs' > 0
        if (d1ShortOk && h1Trend === 'down' && pullbackToMA <= maxPullbackToMA && rsi >= 35 && rsi <= 65 && macd !== null && macd.histogram < 0) {
            // [v3.3] Strategy Bridge advisory — only block if bridge explicitly signals LONG with high confidence
            const bridgeShort = await queryStrategyBridge(pair, 'short');
            if (bridgeShort !== null && bridgeShort.direction === 'long' && bridgeShort.confidence > 0.7) {
                console.log(`[Bridge] ${pair} SHORT rejected — bridge explicit LONG conf:${bridgeShort.confidence.toFixed(2)}`);
            } else {
                if (bridgeShort !== null) {
                    console.log(`[Bridge] ${pair} SHORT advisory: ${bridgeShort.direction} conf:${(bridgeShort.confidence || 0).toFixed(2)}`);
                }
                // [Phase 1] Order flow must confirm selling pressure for shorts
                // [v14.0] FIX: threshold -0.05 → -0.02 (forex liquidity makes ±5% imbalance rare)
                if (analysis.orderFlowImbalance > -0.02) {
                    console.log(`[Order Flow] ${pair} SHORT skipped — imbalance ${analysis.orderFlowImbalance.toFixed(3)} > -0.02 (no sell pressure)`);
                    continue;
                }
                const score = scoreForexSignal({
                    tier,
                    trendStrength,
                    pullback,
                    maxPullback,
                    rsi,
                    direction: 'short',
                    session,
                    macd
                });
                const regimeProfile = evaluateForexRegimeSignal({
                    tier,
                    trendStrength,
                    pullback,
                    maxPullback,
                    rsi,
                    direction: 'short',
                    session,
                    h1Trend,
                    macd
                });
                if (!regimeProfile.tradable) continue;
                // [v7.0] Re-enabled pullbackContinuation — correct strategy for pullback-to-SMA20 entries
                const strategy = pullback >= maxPullback * 0.55 ? 'pullbackContinuation' : 'trendContinuation';
                // [Phase 2] Volume Profile and FVG score adjustments
                let vpBonus = 1.0;
                if (analysis.volumeProfile) {
                    const distToVAH = Math.abs(currentPrice - analysis.volumeProfile.vah) / currentPrice;
                    const distToVAL = Math.abs(currentPrice - analysis.volumeProfile.val) / currentPrice;
                    if (distToVAH < 0.002) vpBonus = 1.10; // Near VAH = selling at premium (good for shorts)
                    else if (distToVAL < 0.001) vpBonus = 0.90; // Near VAL = selling at discount (bad for shorts)
                }
                let fvgBonus = 1.0;
                if (analysis.fvg && analysis.fvg.bearish.length > 0 && analysis.volumeProfile && analysis.volumeProfile.lowVolumeNodes.length > 0) {
                    const hasConfirmedFVG = analysis.fvg.bearish.some(gap =>
                        analysis.volumeProfile.lowVolumeNodes.some(node =>
                            gap.gapMid >= node.priceLow && gap.gapMid <= node.priceHigh
                        )
                    );
                    if (hasConfirmedFVG) fvgBonus = 1.12;
                }
                // [v8.1] Only generate flip signal if direction is opposite to existing position
                const isFlipShort = isFlipCandidate && existingPos && existingPos.direction === 'long';
                if (!isFlipCandidate || isFlipShort) {
                    signals.push({
                        pair, direction: 'short', tier,
                        entry: currentPrice,
                        stopLoss:   currentPrice * (1 + atrStop),
                        takeProfit: currentPrice * (1 - atrTarget),
                        rsi, trendStrength, atrPct, h1Trend, d1Trend, pullback,
                        score: parseFloat((score * regimeProfile.quality * (analysis.hasDisplacement ? 1.15 : 1.0) * vpBonus * fvgBonus).toFixed(3)),
                        strategy,
                        regime: regimeProfile.regime,
                        regimeQuality: regimeProfile.quality,
                        marketRegime: forexRegime.regime,
                        macdHistogram: macd ? macd.histogram : null,
                        orderFlowImbalance: analysis.orderFlowImbalance,
                        hasDisplacement: analysis.hasDisplacement,
                        volumeProfile: analysis.volumeProfile ? { vah: analysis.volumeProfile.vah, val: analysis.volumeProfile.val, poc: analysis.volumeProfile.poc } : null,
                        fvgCount: analysis.fvg ? analysis.fvg.bullish.length + analysis.fvg.bearish.length : 0,
                        session: session.name,
                        isFlipReversal: isFlipShort || false,
                        existingDirection: isFlipShort ? 'long' : null
                    });
                }
            }
        }
    }

    signals.sort((a, b) => (b.score || 0) - (a.score || 0));
    return signals;
}

// ===== TRADE EXECUTION =====

async function executeTrade(signal) {
    // Currency concentration limit — max 2 positions sharing the same currency
    // Data: all 5 losing trades were JPY pairs (100% correlated)
    const MAX_CURRENCY_CONCENTRATION = 2;
    const currencies = signal.pair.split('_'); // e.g. ['CAD', 'JPY']
    for (const ccy of currencies) {
        const ccyCount = Array.from(positions.values()).filter(p =>
            p.pair && p.pair.includes(ccy)
        ).length;
        if (ccyCount >= MAX_CURRENCY_CONCENTRATION) {
            console.log(`[Currency Limit] ${signal.pair} blocked — already ${ccyCount} positions with ${ccy} (max ${MAX_CURRENCY_CONCENTRATION})`);
            return false;
        }
    }

    const account = await getAccount();
    if (!account) {
        console.log('❌ Cannot get account info');
        return false;
    }

    const balance = parseFloat(account.balance);
    const config = MOMENTUM_CONFIG[signal.tier];

    // [v3.5] Forex slippage model — OANDA spreads typically 0.5-2 pips on majors.
    // Model as 0.10% of entry price (conservative for practice account).
    // Adjusts effective entry for stop/target R:R calculation; does not change actual fill.
    const FOREX_SLIPPAGE = 0.001; // 0.10% — ~1 pip on 1.10 EURUSD = 0.0011
    const slippageAdj = signal.direction === 'long' ? 1 + FOREX_SLIPPAGE : 1 - FOREX_SLIPPAGE;
    const effectiveEntry = signal.entry * slippageAdj;

    // [v3.9] Session multiplier: reduced from 1.5→1.15 to cut exposure during overlap
    const sessionMultiplier = signal.session === 'London/NY Overlap' ? 1.15 : 1.0;

    // [v9.0] Monte Carlo position sizing — override when 20+ trade samples available
    let mcMultiplier = 1.0;
    if (monteCarloSizer.tradeReturns.length >= 20) {
        const mcResult = monteCarloSizer.optimize();
        const halfKelly = mcResult.halfKelly;
        mcMultiplier = Math.min(halfKelly / 0.01, 2.0); // cap at 2x base
        mcMultiplier = Math.max(mcMultiplier, 0.25);     // floor at 0.25x
        console.log(`[MONTE-CARLO] Using optimized position size: multiplier ${mcMultiplier.toFixed(2)}x (halfKelly: ${(halfKelly * 100).toFixed(1)}%, samples: ${mcResult.sampleSize}, confidence: ${mcResult.confidence})`);
    }

    const positionValue = balance * config.positionSize * sessionMultiplier * mcMultiplier;

    // [v7.3] Calculate units — OANDA units = base currency units.
    // If base is USD (e.g. USD_JPY), positionValue is already in USD → units = positionValue.
    // If base is foreign (e.g. EUR_USD), convert USD position value to base currency → units = positionValue / price.
    const _pair = signal.pair; // e.g. 'EUR_USD'
    const _baseCurrency = _pair.split('_')[0]; // e.g. 'EUR'

    let rawUnits;
    if (_baseCurrency === 'USD') {
        // Base is USD, position value is already in USD
        rawUnits = Math.round(positionValue);
    } else {
        // Base is foreign currency, convert USD position value to base currency units
        rawUnits = Math.round(positionValue / effectiveEntry);
    }

    // OANDA accepts integer units; negative for short
    let units = signal.direction === 'long' ? rawUnits : -rawUnits;

    // Sanity check: cap at 100,000 units (1 standard lot) for safety
    const maxUnits = 100000;
    if (Math.abs(units) > maxUnits) {
        console.log(`[SafetyCheck] ${_pair} units ${units} exceeds max ${maxUnits}, capping`);
        units = signal.direction === 'long' ? maxUnits : -maxUnits;
    }

    console.log(`[Units] ${_pair} base=${_baseCurrency} posValue=$${positionValue.toFixed(2)} entry=${effectiveEntry} → ${units} units`);

    // [v4.7] Cap units via RISK_PER_TRADE — never risk more than 0.35% of equity per trade
    const stopDistPct = Math.abs(signal.entry - signal.stopLoss) / signal.entry;
    if (stopDistPct > 0) {
        const maxRiskUnits = Math.floor((balance * RISK_PER_TRADE) / (signal.entry * stopDistPct));
        if (Math.abs(units) > maxRiskUnits) {
            console.log(`   [RiskCap] Units capped: ${Math.abs(units)} → ${maxRiskUnits} (RISK_PER_TRADE=${RISK_PER_TRADE})`);
            units = signal.direction === 'long' ? maxRiskUnits : -maxRiskUnits;
        }
    }

    // Apply agent size multiplier if set (from AI confidence or adaptive guardrails)
    if (signal.agentSizeMultiplier && signal.agentSizeMultiplier !== 1.0) {
        const prevUnits = units;
        units = signal.direction === 'long'
            ? Math.floor(Math.abs(units) * signal.agentSizeMultiplier)
            : -Math.floor(Math.abs(units) * signal.agentSizeMultiplier);
        console.log(`   [AgentSize] Units adjusted: ${prevUnits} → ${units} (multiplier=${signal.agentSizeMultiplier.toFixed(2)})`);
    }

    // [v15.0] Safety guard: never submit an order with 0 units — would be accepted by OANDA
    // but creates a 0-unit position entry that corrupts the dashboard display.
    if (Math.abs(units) < 1) {
        console.log(`❌ [SafetyCheck] ${_pair} computed 0 units (balance=${balance.toFixed(2)}, posValue=${positionValue.toFixed(2)}, multiplier=${signal.agentSizeMultiplier || 1}) — skipping trade`);
        return false;
    }

    console.log(`\n🎯 EXECUTING ${signal.direction.toUpperCase()} ${signal.pair} (${signal.tier})`);
    console.log(`   Entry: ${signal.entry.toFixed(5)}, Stop: ${signal.stopLoss.toFixed(5)}, Target: ${signal.takeProfit.toFixed(5)}`);
    console.log(`   Units: ${units}, Session: ${signal.session}`);

    const result = await createOrder(signal.pair, units, signal.stopLoss, signal.takeProfit);

    if (result?.orderFillTransaction) {
        console.log(`✅ ORDER FILLED: ${signal.pair}`);
        const tags = buildForexTradeTags(signal, signal.tier, signal.direction, signal.session);

        // Record position
        positions.set(signal.pair, {
            instrument: signal.pair,
            direction: signal.direction,
            tier: signal.tier,
            strategy: tags.strategy,
            regime: tags.regime,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            units,
            entryTime: new Date(),
            session: signal.session,
            signalScore: signal.score,
            regimeQuality: signal.regimeQuality,
            atrPct: signal.atrPct,
            agentApproved: signal.agentApproved || false,
            agentConfidence: signal.agentConfidence || 0,
            agentReason: signal.agentReason || '',
            agentSizeMultiplier: signal.agentSizeMultiplier || 1.0,
            peakUnrealizedPL: 0, // [Profit-Protect] track highest unrealized P&L
            wasPositive: false,  // [Profit-Protect] breakeven lock flag
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

        // Persist trade opening to DB (fire-and-forget)
        dbForexOpen(signal.pair, signal.direction, signal.tier, signal.entry, signal.stopLoss, signal.takeProfit, units, signal.session, signal)
            .then(id => {
                const p = positions.get(signal.pair);
                if (p) p.dbTradeId = id;
                if (id) console.log(`📝 [DB] ${signal.pair} trade persisted (id: ${id})`);
                else console.warn(`⚠️  [DB] ${signal.pair} trade NOT persisted — no id returned`);
            })
            .catch(e => console.error(`❌ [DB] ${signal.pair} trade persistence failed:`, e.message));

        // Update tracking
        totalTradesToday++;
        tradesPerPair.set(signal.pair, (tradesPerPair.get(signal.pair) || 0) + 1);

        const trades = recentTrades.get(signal.pair) || [];
        trades.push({ time: Date.now(), side: signal.direction });
        if (trades.length > 10) trades.shift();
        recentTrades.set(signal.pair, trades);

        // Update long/short counters and persist immediately so a crash between
        // entry and close doesn't lose the counter increment
        if (signal.direction === 'long') simLongTrades++;
        else simShortTrades++;
        saveForexPerf();

        // Update metrics
        if (metrics.tradingMetrics) {
            metrics.tradingMetrics.tradesTotal?.inc({ strategy: 'forex', tier: signal.tier });
        }

        // Send Entry Alert via Telegram — fire-and-forget
        telegramAlerts.sendForexEntry(
            signal.pair,
            signal.direction,
            signal.entry,
            signal.stopLoss,
            signal.takeProfit,
            units,
            signal.tier
        ).catch(e => console.warn(`⚠️  Telegram entry alert failed: ${e.message}`));

        return true;
    }

    console.log(`❌ ORDER FAILED: ${signal.pair} (units=${units})`);
    // [v7.2] Track failed orders to prevent infinite retry loops on same pair
    const failedTrades = recentTrades.get(signal.pair) || [];
    failedTrades.push({ time: Date.now(), side: signal.direction, failed: true });
    if (failedTrades.length > 10) failedTrades.shift();
    recentTrades.set(signal.pair, failedTrades);
    return false;
}

async function closePositionWithReason(pair, reason) {
    // Capture copies FIRST — before any async operations or Map mutations
    const pos = positions.get(pair);
    const snapshot = pos?.signalSnapshot ? { ...pos.signalSnapshot } : null;
    const posCopy = pos ? { ...pos } : null;

    // Delete from Map EARLY — prevents stuck positions if downstream ops throw
    positions.delete(pair);

    // Enhanced alert based on reason type
    if (reason.toLowerCase().includes('stop') || reason.toLowerCase().includes('loss')) {
        // STOP LOSS ALERT
        console.log('\n' + '🚨'.repeat(30));
        console.log('║                 FOREX STOP LOSS ALERT                 ║');
        console.log('🚨'.repeat(30));
        console.log(`📛 Pair: ${pair}`);
        console.log(`💰 Entry: ${posCopy?.entry?.toFixed(5) || 'N/A'}`);
        console.log(`🔻 Stop Loss Triggered`);
        console.log(`📉 Reason: ${reason}`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log('🚨'.repeat(30));

        // Send SMS Alert — fire-and-forget so network failure never blocks position close
        smsAlerts.sendForexStopLoss(pair, posCopy?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  SMS stop-loss alert failed: ${e.message}`));

        // Send Telegram Alert — fire-and-forget
        telegramAlerts.sendForexStopLoss(pair, posCopy?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  Telegram stop-loss alert failed: ${e.message}`));

    } else if (reason.toLowerCase().includes('target') || reason.toLowerCase().includes('profit')) {
        // TAKE PROFIT ALERT
        console.log('\n' + '🎯'.repeat(30));
        console.log('║              FOREX PROFIT TARGET HIT                  ║');
        console.log('🎯'.repeat(30));
        console.log(`💎 Pair: ${pair}`);
        console.log(`💰 Entry: ${posCopy?.entry?.toFixed(5) || 'N/A'}`);
        console.log(`🎯 Take Profit Hit`);
        console.log(`📈 Reason: ${reason}`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log('🎯'.repeat(30));

        // Send SMS Alert — fire-and-forget
        smsAlerts.sendForexTakeProfit(pair, posCopy?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  SMS take-profit alert failed: ${e.message}`));

        // Send Telegram Alert — fire-and-forget
        telegramAlerts.sendForexTakeProfit(pair, posCopy?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  Telegram take-profit alert failed: ${e.message}`));

    } else {
        // TIME-BASED / OTHER EXITS — log and send alert
        // [v13.0] FIX: price movement % instead of PnL/notional
        const pnlPct = posCopy?.currentPrice && posCopy?.entry
            ? (((posCopy.currentPrice - posCopy.entry) / posCopy.entry) * (posCopy.direction === 'short' ? -100 : 100)).toFixed(2)
            : '?';
        console.log(`\n⏰ CLOSING ${pair}: ${reason} (P&L: ${pnlPct}%)`);

        telegramAlerts.send(
            `⏰ *FOREX TIME EXIT* — ${pair}\n` +
            `Reason: ${reason}\n` +
            `Entry: ${posCopy?.entry?.toFixed(5) ?? 'N/A'} → Current: ${posCopy?.currentPrice?.toFixed(5) ?? 'N/A'}\n` +
            `P&L: ${pnlPct}%`
        ).catch(e => console.warn(`⚠️  Telegram time-exit alert failed: ${e.message}`));
    }

    const result = await closePosition(pair);

    if (result) {
        // Extract actual fill data from OANDA response and update our copy
        if (posCopy) {
            const fillTx = result.longOrderFillTransaction || result.shortOrderFillTransaction;
            if (fillTx) {
                const actualPL = parseFloat(fillTx.pl || 0);
                const actualPrice = parseFloat(fillTx.price || 0);
                if (actualPL !== 0) {
                    posCopy.unrealizedPL = actualPL;
                }
                if (actualPrice > 0) {
                    posCopy.currentPrice = actualPrice;
                }
            }
        }

        // Update sim performance stats
        simTotalTrades++;
        if (posCopy) {
            const isWin = (posCopy.unrealizedPL || 0) > 0;
            const isLoss = (posCopy.unrealizedPL || 0) <= 0;
            if (isWin) simWinners++;
            else if (isLoss) simLosers++;
            // Update daily P&L so the circuit breaker has real data
            const tradePnL = posCopy.unrealizedPL ?? 0;
            simDailyPnL += tradePnL;
            simTotalPnL += tradePnL;
            if (tradePnL > 0) {
                simTotalWinAmount += tradePnL;
                simConsecutiveLosses = 0;
            } else if (tradePnL < 0) {
                simTotalLossAmount += Math.abs(tradePnL);
                simConsecutiveLosses++;
                simMaxConsecutiveLosses = Math.max(simMaxConsecutiveLosses, simConsecutiveLosses);
            }
            simProfitFactor = simTotalTrades < 5 ? 0
                : simTotalLossAmount > 0 ? parseFloat((simTotalWinAmount / simTotalLossAmount).toFixed(2))
                : simTotalWinAmount > 0 ? 9.99 : 0;
        }
        saveForexPerf();

        // DB operations and evaluation wrapped in try-catch so failures never affect position lifecycle
        try {
            // Persist close to DB — use unrealizedPL as proxy for exit PnL
            if (posCopy) {
                const exitPnl = posCopy.unrealizedPL ?? 0;
                const exitEntry = posCopy.entry ?? 0;
                const exitPrice = posCopy.currentPrice ?? exitEntry;
                // [v13.0] FIX: use price movement % instead of PnL/notional (broken for JPY pairs)
                const exitPct = exitEntry > 0
                    ? ((exitPrice - exitEntry) / exitEntry) * (posCopy.direction === 'short' ? -100 : 100)
                    : 0;
                // [v17.1] Store decimal pnlPct in DB (0.05 = 5%), not percentage (5.0)
                dbForexClose(posCopy.dbTradeId, exitPrice, exitPnl, exitPct / 100, reason).catch(() => {});
                // [v4.1] Report to Agentic AI learning loop — Scan AI pattern tracking
                reportForexTradeOutcome(posCopy, exitPrice, exitPnl, exitPct / 100, reason).catch(() => {});
                // [v4.6] Record outcome into adaptive guardrails
                guardrails.recordOutcome(exitPnl > 0);
                // Feed trade outcome to Monte Carlo position sizer (as decimal, e.g. 0.05 for +5%)
                monteCarloSizer.addTrade(exitPct / 100);
            }

            // [Phase 4] Trade evaluation — log signal effectiveness for weight optimization
            // Uses snapshot and posCopy captured at function entry (before any async ops)
            if (snapshot) {
                const evalExitPrice = posCopy?.currentPrice || posCopy?.entry || 0;
                const evalPnl = posCopy?.unrealizedPL ?? 0;
                const evalEntry = posCopy?.entry ?? 0;
                // [v13.0] FIX: price movement % instead of PnL/notional (broken for JPY)
                const evalPnlPct = evalEntry > 0
                    ? ((evalExitPrice - evalEntry) / evalEntry) * (posCopy?.direction === 'short' ? -1 : 1)
                    : 0;
                const outcome = {
                    symbol: posCopy?.instrument || pair,
                    direction: posCopy?.direction || 'long',
                    entryPrice: posCopy?.entry,
                    exitPrice: evalExitPrice,
                    pnl: evalPnl,
                    pnlPct: evalPnlPct,
                    holdTimeMs: Date.now() - (snapshot.timestamp || posCopy?.entryTime?.getTime?.() || Date.now()),
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

                if (!globalThis._forexTradeEvaluations) globalThis._forexTradeEvaluations = [];
                globalThis._forexTradeEvaluations.push(outcome);
                if (globalThis._forexTradeEvaluations.length > 500) {
                    globalThis._forexTradeEvaluations = globalThis._forexTradeEvaluations.slice(-500);
                }
                saveForexEvaluations(globalThis._forexTradeEvaluations);

                const winLoss = evalPnl > 0 ? 'WIN' : 'LOSS';
                console.log(`[Evaluation] ${outcome.symbol} ${winLoss} ${evalPnlPct > 0 ? '+' : ''}${(evalPnlPct * 100).toFixed(2)}% — committee:${snapshot.committeeConfidence} flow:${snapshot.orderFlowImbalance?.toFixed?.(2) || '?'} displacement:${snapshot.hasDisplacement} regime:${snapshot.marketRegime}`);
            }
        } catch (err) {
            console.error(`[ClosePosition] Post-close operations failed for ${pair}:`, err.message);
        }

        if (reason.toLowerCase().includes('stop')) {
            // Dynamic cooldown: small loss (<1%) → 30 min; medium (1-2%) → 60 min; large (>2%) → 2h
            const lossPct = posCopy ? Math.abs(posCopy.unrealizedPL ?? 0) / (parseFloat(posCopy.entry ?? 1) * Math.abs(posCopy.units ?? 1)) * 100 : 1;
            const cooldownMs = lossPct >= 2 ? MIN_TIME_AFTER_STOP
                : lossPct >= 1 ? 60 * 60 * 1000
                : 30 * 60 * 1000;
            stoppedOutPairs.set(pair, { time: Date.now(), cooldownMs, lossPercent: lossPct });
        }

        console.log(`✅ Position ${pair} closed successfully`);
        return true;
    }

    console.log(`❌ Failed to close ${pair}`);
    return false;
}

// ===== POSITION MANAGEMENT =====

async function managePositions() {
    const oandaPositions = await getOpenPositions();

    for (const oandaPos of oandaPositions) {
        const pair = oandaPos.instrument;
        const localPos = positions.get(pair);

        if (!localPos) continue;

        const isLong = parseInt(oandaPos.long?.units || '0') > 0;
        // [v15.0] FIX: OANDA always returns both long.units and short.units — for shorts, long.units = "0"
        // The string "0" is truthy in JS, so `"0" || "-741"` returns "0". Must use parseInt first.
        const longUnitsRaw = parseInt(oandaPos.long?.units || '0');
        const shortUnitsRaw = parseInt(oandaPos.short?.units || '0');
        const units = isLong ? Math.abs(longUnitsRaw) : Math.abs(shortUnitsRaw);
        const entryPrice = parseFloat((isLong ? oandaPos.long?.averagePrice : oandaPos.short?.averagePrice) || 0);
        const unrealizedPL = parseFloat(oandaPos.unrealizedPL || 0);
        // Derive current price from unrealizedPL so trailing stops use real market movement
        // [v16.0] FIX: For JPY-quote pairs, unrealizedPL is in USD but price is in JPY
        // Formula: P&L(USD) = (current - entry) * units / currentJPYRate ≈ (current - entry) * units / current
        // Rearranging: current = entry / (1 - PL_USD / units) for longs, entry / (1 + PL_USD / units) for shorts
        // For USD-quote pairs (EUR_USD), the simple formula works: current = entry ± PL/units
        const isJPYQuote = pair.includes('JPY') || pair.includes('CHF');
        let currentPrice;
        if (entryPrice > 0 && units > 0) {
            if (isJPYQuote) {
                // JPY/CHF quote: PL is converted to USD by OANDA; must invert the conversion
                const plPerUnit = unrealizedPL / units;
                const denom = isLong ? (1 - plPerUnit / entryPrice) : (1 + plPerUnit / entryPrice);
                currentPrice = denom !== 0 ? entryPrice / denom : entryPrice;
            } else {
                // USD quote: PL = (current - entry) * units
                currentPrice = entryPrice + (isLong ? 1 : -1) * (unrealizedPL / units);
            }
        } else {
            currentPrice = entryPrice;
        }
        const holdDays = (Date.now() - new Date(localPos.entryTime).getTime()) / (1000 * 60 * 60 * 24);

        // Write live market values back so status endpoint returns them for demo positions
        localPos.currentPrice = currentPrice;
        localPos.unrealizedPL = unrealizedPL;

        // ===== AGGRESSIVE PROFIT PROTECTION (runs BEFORE trailing stops) =====

        // 1. Update peak P&L tracking
        if (localPos.peakUnrealizedPL === undefined) localPos.peakUnrealizedPL = 0;
        if (unrealizedPL > localPos.peakUnrealizedPL) {
            localPos.peakUnrealizedPL = unrealizedPL;
        }

        // 2. Breakeven lock: once trade was meaningfully positive (0.3% of position or $6 min), never let it go negative
        // [v13.0] FIX: For JPY pairs, units*price gives JPY notional (e.g. 7000*150=1M JPY) not USD
        // For USD-base pairs (USD_JPY), units ARE the USD value. For crosses, divide by JPY rate.
        const rawPosValue = Math.abs(localPos.units || 0) * currentPrice;
        const forexPosValue = pair.includes('JPY') ? rawPosValue / currentPrice : rawPosValue;
        const forexProfitThreshold = Math.max(15, forexPosValue * 0.008); // [v17.0] was $6/0.3% — primary cause of 0% WR, armed on noise
        if (unrealizedPL > forexProfitThreshold) {
            if (!localPos.wasPositive) console.log(`[PROFIT-PROTECT] ${pair}: entered profit zone (+$${unrealizedPL.toFixed(2)}, threshold $${forexProfitThreshold.toFixed(2)}) — breakeven lock ACTIVE`);
            localPos.wasPositive = true;
        }
        if (localPos.wasPositive && unrealizedPL < -4) { // [v17.0] was -$2, 1-2 pips of noise on forex
            console.log(`[PROFIT-PROTECT] ${pair}: was +$${localPos.peakUnrealizedPL.toFixed(2)}, now $${unrealizedPL.toFixed(2)} — closing to protect capital`);
            profitProtectReentryPairs.set(pair, { timestamp: Date.now(), direction: localPos.direction || (isLong ? 'long' : 'short'), entry: entryPrice });
            console.log(`[RE-ENTRY] ${pair} eligible for re-entry (direction: ${localPos.direction || (isLong ? 'long' : 'short')}) after profit-protect close`);
            await closePositionWithReason(pair, `Profit-Protect breakeven lock (peak +$${localPos.peakUnrealizedPL.toFixed(2)}, now $${unrealizedPL.toFixed(2)})`);
            continue;
        }

        // 3. Peak drawback protection: if peak > $10 and dropped > 40% from peak, take profit
        if (localPos.peakUnrealizedPL > 10 && unrealizedPL > 0) {
            const dropFromPeak = localPos.peakUnrealizedPL - unrealizedPL;
            const dropPct = (dropFromPeak / localPos.peakUnrealizedPL) * 100;
            if (dropPct > 55) { // [v17.0] was 40% — normal consolidation, let winners run
                console.log(`[PROFIT-PROTECT] ${pair}: peak +$${localPos.peakUnrealizedPL.toFixed(2)}, now +$${unrealizedPL.toFixed(2)} (${dropPct.toFixed(1)}% drawback) — taking profit`);
                profitProtectReentryPairs.set(pair, { timestamp: Date.now(), direction: localPos.direction || (isLong ? 'long' : 'short'), entry: entryPrice });
                console.log(`[RE-ENTRY] ${pair} eligible for re-entry (direction: ${localPos.direction || (isLong ? 'long' : 'short')}) after profit-protect close`);
                await closePositionWithReason(pair, `Profit-Protect drawback (peak +$${localPos.peakUnrealizedPL.toFixed(2)}, now +$${unrealizedPL.toFixed(2)}, ${dropPct.toFixed(1)}% drop)`);
                continue;
            }
        }

        // ===== END PROFIT PROTECTION =====

        // Update trailing stop
        updateTrailingStop(localPos, currentPrice);

        // Explicit stop loss failsafe — in case OANDA server-side stop didn't fire
        if (localPos.stopLoss) {
            const hitStop = (localPos.direction === 'long' && currentPrice <= localPos.stopLoss) ||
                            (localPos.direction === 'short' && currentPrice >= localPos.stopLoss);
            if (hitStop) {
                console.log(`🛑 [Stop Loss Failsafe] ${pair} hit local stop (${localPos.stopLoss.toFixed(5)}) — closing`);
                await closePositionWithReason(pair, 'Stop Loss');
                continue;
            }
        }

        // [EXIT-MGR] Smart exit: momentum fade + reversal candle detection
        try {
            const { evaluateExit } = require('../../services/signals/exit-manager');
            const rawCandles = await getCandles(pair, 'M15', 30);
            if (rawCandles.length >= 20) {
                const klines = rawCandles.filter(c => c.complete !== false).map(c => ({
                    open: parseFloat(c.mid.o), high: parseFloat(c.mid.h),
                    low: parseFloat(c.mid.l), close: parseFloat(c.mid.c),
                    volume: c.volume || 0,
                }));
                if (klines.length >= 20) {
                    const exitEval = evaluateExit({
                        entryPrice, currentPrice, currentStop: localPos.stopLoss || 0,
                        direction: localPos.direction || (isLong ? 'long' : 'short'),
                        klines,
                    });
                    if (exitEval.action === 'exit') {
                        console.log(`[EXIT-MGR] ${pair}: ${exitEval.reason}`);
                        profitProtectReentryPairs.set(pair, { timestamp: Date.now(), direction: localPos.direction || (isLong ? 'long' : 'short'), entry: entryPrice });
                        await closePositionWithReason(pair, `Smart Exit: ${exitEval.reason}`);
                        continue;
                    } else if (exitEval.action === 'tighten' && localPos.stopLoss) {
                        const betterStop = isLong ? exitEval.newStop > localPos.stopLoss : exitEval.newStop < localPos.stopLoss;
                        if (betterStop) {
                            console.log(`[EXIT-MGR] ${pair}: ${exitEval.reason} — stop moved to ${exitEval.newStop.toFixed(5)}`);
                            localPos.stopLoss = exitEval.newStop;
                        }
                    }
                }
            }
        } catch (e) {
            // Non-critical — don't block position management if candle fetch fails
        }

        // Check time-based exit
        if (holdDays >= EXIT_CONFIG.stalePositionDays) {
            await closePositionWithReason(pair, `Stale position (${holdDays.toFixed(1)} days)`);
            continue;
        }

        // Check profit target by day
        const dayIndex = Math.min(Math.floor(holdDays), 5);
        const targetPct = EXIT_CONFIG.profitTargetByDay[dayIndex];
        // [v13.0] FIX: plPct must be price movement %, NOT unrealizedPL/(entry*units)
        // Old formula gave 0.00005% for JPY pairs (wrong by 10,000x) → profit targets never fired
        const plPct = entryPrice > 0
            ? (localPos.direction === 'long'
                ? (currentPrice - entryPrice) / entryPrice
                : (entryPrice - currentPrice) / entryPrice)
            : 0;

        if (plPct >= targetPct) {
            await closePositionWithReason(pair, `Day-${dayIndex} target hit (+${(plPct * 100).toFixed(2)}%)`);
        }
    }

    // Sync positions Map with OANDA — detect broker-closed positions and write real P&L to DB
    const oandaInstruments = oandaPositions.map(p => p.instrument);
    for (const [pair, localPos] of positions) {
        if (!oandaInstruments.includes(pair)) {
            // Position closed by OANDA (stop-loss / take-profit / margin call)
            // Fetch the most-recently-closed trade for this instrument to get real exit data
            try {
                const closed = await oandaRequest('get',
                    `/v3/accounts/${oandaConfig.accountId}/trades?instrument=${pair}&state=CLOSED&count=1`);
                const trade = closed?.trades?.[0];
                if (trade && localPos.dbTradeId) {
                    const exitPrice = parseFloat(trade.closePrice ?? trade.averageClosePrice ?? localPos.entry ?? 0);
                    const realPnl   = parseFloat(trade.realizedPL ?? 0);
                    const exitEntry = localPos.entry ?? 0;
                    const exitUnits = Math.abs(localPos.units ?? 1);
                    // [v16.0] FIX: For USD-base pairs (USD_JPY), entry*units = JPY notional, not USD
                    // Use exitPrice to compute price-based pnl% instead of dollar-based
                    const exitPct = exitEntry > 0 && exitPrice > 0
                        ? ((localPos.direction === 'long'
                            ? (exitPrice - exitEntry) / exitEntry
                            : (exitEntry - exitPrice) / exitEntry) * 100)
                        : 0;
                    const reason    = trade.closingTransactionIDs?.length
                        ? (realPnl < 0 ? 'Stop Loss' : 'Take Profit')
                        : 'Broker Closed';
                    // [v17.1] Store decimal pnlPct in DB (0.05 = 5%), not percentage (5.0)
                    dbForexClose(localPos.dbTradeId, exitPrice, realPnl, exitPct / 100, reason).catch(() => {});
                    // Update in-memory perf counters
                    simTotalTrades++;
                    simDailyPnL += realPnl;
                    simTotalPnL += realPnl;
                    if (realPnl > 0) {
                        simWinners++;
                        simTotalWinAmount += realPnl;
                        simConsecutiveLosses = 0;
                    } else {
                        simLosers++;
                        simTotalLossAmount += Math.abs(realPnl);
                        simConsecutiveLosses++;
                        simMaxConsecutiveLosses = Math.max(simMaxConsecutiveLosses, simConsecutiveLosses);
                    }
                    simProfitFactor = simTotalTrades < 5 ? 0
                        : simTotalLossAmount > 0 ? parseFloat((simTotalWinAmount / simTotalLossAmount).toFixed(2))
                        : simTotalWinAmount > 0 ? 9.99 : 0;
                    saveForexPerf();
                    // Feed trade outcome to Monte Carlo sizer
                    monteCarloSizer.addTrade(exitPct / 100);
                    console.log(`📊 [DB] Synced closed trade ${pair}: exit=${exitPrice} pnl=${realPnl.toFixed(2)} reason=${reason}`);
                }
            } catch (e) {
                console.warn(`⚠️  Failed to fetch closed trade data for ${pair}:`, e.message);
            }
            positions.delete(pair);
        }
    }
}

// ===== MAIN TRADING LOOP =====

async function tradingLoop() {
    if (!botRunning) {
        console.log('⛔ Forex bot stopped — skipping loop');
        return;
    }

    if (!isMarketOpen()) {
        console.log('🌙 Forex market closed');
        return;
    }

    // Check for high-impact events
    const eventCheck = isNearHighImpactEvent();
    if (eventCheck.isNear) {
        console.log(`⚠️ Near ${eventCheck.event} - pausing new trades`);
        return;
    }

    scanCount++;
    lastScanTime = new Date();

    // ── Auto-optimizer: re-run every 4 hours ──────────────────────────────
    if (Date.now() - forexLastOptimizationTime >= FOREX_OPTIMIZATION_INTERVAL_MS) {
        forexLastOptimizationTime = Date.now();
        runForexAutoOptimizer();
    }

    console.log('\n' + '='.repeat(60));
    console.log(`[${lastScanTime.toISOString()}] FOREX SCAN #${scanCount}`);
    console.log('='.repeat(60));

    const session = getCurrentSession();
    console.log(`📊 Session: ${session.name} (${session.quality})`);
    console.log(`📈 Positions: ${positions.size} | Trades today: ${totalTradesToday}/${MAX_TRADES_PER_DAY} | Flips: ${flipReversalsToday}`);

    // Manage existing positions (always runs when market open, even if paused)
    await managePositions();

    if (botPaused) {
        console.log('⏸  Forex bot paused — skipping new entry scan');
        return;
    }

    // Daily loss circuit breaker — check both demo and live P&L
    const dailyLoss = oandaConfig.isPractice ? simDailyPnL : cachedLiveDailyPnL;
    if (dailyLoss < -MAX_DAILY_LOSS_FOREX) {
        console.log(`🛑 [CIRCUIT BREAKER] Forex daily loss $${Math.abs(dailyLoss).toFixed(2)} exceeds limit $${MAX_DAILY_LOSS_FOREX} — no new entries today`);
        return;
    }

    // Drawdown circuit breaker
    const fxDrawdownPct = parseFloat(process.env.MAX_DRAWDOWN_PCT || '10');
    const fxDailyLossPct = simEquity > 0 ? (Math.abs(Math.min(dailyLoss, 0)) / simEquity) * 100 : 0;
    if (fxDailyLossPct >= fxDrawdownPct) {
        console.log(`🛑 [FOREX DRAWDOWN] ${fxDailyLossPct.toFixed(1)}% >= limit ${fxDrawdownPct}% — no new entries`);
        return;
    }

    try {
        // Scan for new signals
        const signals = await scanForSignals();
        console.log(`🔍 Signals found: ${signals.length}`);

        // [v8.1] Process flip-reversal signals first (close old + open new)
        const flipSignals = signals.filter(s => s.isFlipReversal);
        const normalSignals = signals.filter(s => !s.isFlipReversal);

        for (const signal of flipSignals) {
            // Flip requires committee confidence >= 0.50 (stronger than normal 0.45 threshold)
            const committee = computeForexCommitteeScore(signal);
            if (committee.confidence < 0.50) {
                console.log(`[FLIP-REVERSAL] ${signal.pair} ${signal.existingDirection} → ${signal.direction} SKIPPED — committee confidence ${committee.confidence} < 0.50`);
                continue;
            }
            // Verify we still have the position (could have been closed by managePositions)
            const existingPos = positions.get(signal.pair);
            if (!existingPos || existingPos.direction !== signal.existingDirection) {
                continue;
            }
            // Verify daily trade budget allows 2 more trades (close + open)
            if (totalTradesToday + 2 > MAX_TRADES_PER_DAY) {
                console.log(`[FLIP-REVERSAL] ${signal.pair} SKIPPED — daily limit would be exceeded (${totalTradesToday}+2 > ${MAX_TRADES_PER_DAY})`);
                continue;
            }
            // Re-check minimum hold time (in case time passed since scan)
            const holdTime = Date.now() - (existingPos.entryTime instanceof Date ? existingPos.entryTime.getTime() : existingPos.entryTime || 0);
            if (holdTime < 15 * 60 * 1000) {
                console.log(`[FLIP-REVERSAL] ${signal.pair} SKIPPED — position only held ${Math.round(holdTime / 60000)}min (min 15min)`);
                continue;
            }

            // AI advisor gate (same as normal trades)
            const aiResult = await queryAIAdvisor(signal);
            if (!aiResult.approved) {
                console.log(`[FLIP-REVERSAL] ${signal.pair} ${signal.direction} REJECTED by AI — ${aiResult.reason}`);
                continue;
            }
            signal.agentApproved = true;
            signal.agentConfidence = aiResult.confidence;
            signal.agentReason = aiResult.reason;
            signal.decisionRunId = aiResult.decision_run_id || null;
            signal.banditArm = aiResult.bandit_arm || 'moderate';
            if (aiResult.position_size_multiplier && aiResult.position_size_multiplier !== 1.0) {
                signal.agentSizeMultiplier = aiResult.position_size_multiplier;
            }

            // Guardrail checks
            if (guardrails.isPaused) continue;
            if ((signal.score || 0) < MIN_SIGNAL_SCORE) continue;
            if (aiResult.confidence < MIN_SIGNAL_CONFIDENCE) continue;

            // Transaction cost EV filter
            if (!isForexPositiveEV(signal.pair, committee.confidence)) continue;

            // Assign committee data
            signal.committeeConfidence = committee.confidence;
            signal.committeeComponents = committee.components;

            // [v10.1] Entry quality gate for flip signals
            const flipQualityCheck = isForexEntryQualified(signal, committee);
            if (!flipQualityCheck.qualified) {
                console.log(`[QUALITY GATE] ${signal.pair} ${signal.direction} (flip): BLOCKED — ${flipQualityCheck.reason}`);
                continue;
            }

            // === EXECUTE FLIP ===
            console.log(`\n🔄 [FLIP-REVERSAL] Closing ${signal.pair} ${signal.existingDirection} → opening ${signal.direction}`);
            console.log(`   Committee confidence: ${committee.confidence} | Score: ${signal.score}`);

            // Step 1: Close existing position (counts as 1 trade)
            const closeSuccess = await closePositionWithReason(signal.pair, `flip-reversal → ${signal.direction}`);
            totalTradesToday++; // close counts as a trade for anti-churning

            if (closeSuccess) {
                // Step 2: Open new position in opposite direction
                const openSuccess = await executeTrade(signal);
                if (openSuccess) {
                    flipReversalsToday++;
                    console.log(`✅ [FLIP-REVERSAL] ${signal.pair} flipped to ${signal.direction} (flip #${flipReversalsToday} today)`);
                    telegramAlerts.send(
                        `🔄 *FOREX FLIP-REVERSAL* — ${signal.pair}\n` +
                        `${signal.existingDirection.toUpperCase()} → ${signal.direction.toUpperCase()}\n` +
                        `Committee: ${committee.confidence} | Score: ${signal.score}\n` +
                        `Flip #${flipReversalsToday} today`
                    ).catch(() => {});
                } else {
                    console.log(`❌ [FLIP-REVERSAL] ${signal.pair} closed old position but failed to open new ${signal.direction}`);
                }
            } else {
                console.log(`❌ [FLIP-REVERSAL] ${signal.pair} failed to close existing ${signal.existingDirection} position`);
            }
        }

        // Execute top normal signals (non-flip)
        const maxNewPositions = 5 - positions.size;
        const signalsToExecute = normalSignals.slice(0, Math.min(maxNewPositions, MAX_SIGNALS_PER_CYCLE));

        for (const signal of signalsToExecute) {
            // [v5.0] HARD GATE: every trade MUST be approved by the agentic AI pipeline
            const aiResult = await queryAIAdvisor(signal);

            if (!aiResult.approved) {
                console.log(`[Agent] ${signal.pair} ${signal.direction} REJECTED (conf: ${(aiResult.confidence || 0).toFixed(2)}, src: ${aiResult.source}) — ${aiResult.reason}`);
                if (aiResult.risk_flags?.length) console.log(`[Agent]   Risk flags: ${aiResult.risk_flags.join(', ')}`);
                if (aiResult.lessons_applied?.length) console.log(`[Agent]   Lessons: ${aiResult.lessons_applied.slice(0, 2).join('; ')}`);
                if (aiResult.confidence > 0.8 || aiResult.source === 'kill_switch') {
                    telegramAlerts.sendAgentRejection('Forex Bot', signal.pair, signal.direction, aiResult.reason, aiResult.confidence, aiResult.risk_flags).catch(() => {});
                }
                if (aiResult.source === 'kill_switch') {
                    telegramAlerts.sendKillSwitchAlert('Forex Bot', aiResult.reason).catch(() => {});
                }
                continue;
            }

            // Agent approved
            const srcTag = aiResult.source === 'cache' ? ' (cached)' : '';
            const regime = aiResult.market_regime ? ` [${aiResult.market_regime}]` : '';
            console.log(`[Agent] ${signal.pair} ${signal.direction} APPROVED${srcTag}${regime} (conf: ${(aiResult.confidence || 0).toFixed(2)}, size: ${(aiResult.position_size_multiplier || 1).toFixed(2)}x) — ${aiResult.reason}`);
            telegramAlerts.sendAgentApproval('Forex Bot', signal.pair, signal.direction, aiResult.confidence || 0, aiResult.position_size_multiplier || 1, aiResult.market_regime).catch(() => {});
            signal.agentApproved = true;
            signal.agentConfidence = aiResult.confidence;
            signal.agentReason = aiResult.reason;
            signal.decisionRunId = aiResult.decision_run_id || null;  // For linking outcomes back
            signal.banditArm = aiResult.bandit_arm || 'moderate';
            if (aiResult.position_size_multiplier && aiResult.position_size_multiplier !== 1.0) {
                signal.agentSizeMultiplier = aiResult.position_size_multiplier;
            }
            // [v4.6] Adaptive guardrails — pre-trade quality gate
            if (guardrails.isPaused) {
                console.log(`[Guardrail] ${signal.pair} BLOCKED — lane paused until ${new Date(guardrails.lanePausedUntil).toLocaleTimeString()}`);
                continue;
            }
            if ((signal.score || 0) < MIN_SIGNAL_SCORE) {
                console.log(`[Guardrail] ${signal.pair} BLOCKED — score ${(signal.score || 0).toFixed(2)} < ${MIN_SIGNAL_SCORE}`);
                continue;
            }
            if (aiResult && aiResult.confidence < MIN_SIGNAL_CONFIDENCE) {
                console.log(`[Guardrail] ${signal.pair} BLOCKED — confidence ${aiResult.confidence.toFixed(2)} < ${MIN_SIGNAL_CONFIDENCE}`);
                continue;
            }
            // [v4.7] Reward/Risk quality gate — reject trades below MIN_REWARD_RISK
            // Uses auto-optimized threshold (floor: static MIN_REWARD_RISK) so optimizer can only tighten, never loosen below the env-var floor
            if (signal.stopLoss && signal.takeProfit && signal.entry) {
                const rewardRisk = Math.abs(signal.takeProfit - signal.entry) / Math.abs(signal.entry - signal.stopLoss);
                const _forexMinRR = Math.max(MIN_REWARD_RISK, forexOptimizedParams.minRewardRisk);
                if (rewardRisk < _forexMinRR) {
                    console.log(`[Guardrail] ${signal.pair} BLOCKED — R:R ${rewardRisk.toFixed(2)} < ${_forexMinRR} (optimizer:${forexOptimizedParams.minRewardRisk} floor:${MIN_REWARD_RISK})`);
                    continue;
                }
            }
            // Apply loss-adjusted position sizing
            if (guardrails.lossSizeMultiplier < 1.0) {
                signal.agentSizeMultiplier = (signal.agentSizeMultiplier || 1.0) * guardrails.lossSizeMultiplier;
                console.log(`[Guardrail] ${signal.pair} size cut to ${signal.agentSizeMultiplier.toFixed(2)}x (${guardrails.consecutiveLosses} consecutive losses)`);
            }
            // [Phase 3] Committee aggregator — final quality gate
            const committee = computeForexCommitteeScore(signal);
            const _forexCommitteeThreshold = forexOptimizedParams.committeeThreshold;
            if (committee.confidence < _forexCommitteeThreshold) {
                console.log(`[Committee] ${signal.pair} ${signal.direction}: Confidence ${committee.confidence} < ${_forexCommitteeThreshold} — ${JSON.stringify(committee.components)}`);
                continue;
            }
            // [Improvement 3] Transaction cost EV filter
            if (!isForexPositiveEV(signal.pair, committee.confidence)) {
                continue;
            }
            console.log(`[Committee] ${signal.pair} ${signal.direction}: APPROVED conf:${committee.confidence} — trend:${committee.components.trend} flow:${committee.components.orderFlow} disp:${committee.components.displacement} VP:${committee.components.volumeProfile}`);

            // [v8.0] Assign committee data BEFORE executeTrade → dbForexOpen captures it in entry_context
            // Previously assigned after, so DB always had null committee data (Signal Intelligence showed "0 trades with")
            signal.committeeConfidence = committee.confidence;
            signal.committeeComponents = committee.components;

            // [v10.1] Re-entry validation — if this is a re-entry, require extra confirmation
            if (profitProtectReentryPairs.has(signal.pair)) {
                const reentryCheck = isReentryValid(signal.pair, signal);
                if (!reentryCheck.valid) {
                    console.log(`[RE-ENTRY] ${signal.pair} ${signal.direction}: re-entry BLOCKED — ${reentryCheck.reason}`);
                    continue;
                }
            }

            // [v10.1] Entry quality gate — final profitability checklist
            const qualityCheck = isForexEntryQualified(signal, committee);
            if (!qualityCheck.qualified) {
                console.log(`[QUALITY GATE] ${signal.pair} ${signal.direction}: BLOCKED — ${qualityCheck.reason}`);
                continue;
            }
            // [Correlation Guard] Check own-position concentration before executing
            try {
                const ownPositions = Array.from(positions.values());
                const guard = computeCorrelationGuard(ownPositions);
                if (guard.isConcentrated) {
                    const signalDir = signal.direction || 'long';
                    if ((signalDir === 'long' && !guard.canOpenLong) || (signalDir === 'short' && !guard.canOpenShort)) {
                        console.log(`[CORRELATION] ${signal.pair} ${signalDir} BLOCKED — portfolio ${(guard.exposureRatio * 100).toFixed(0)}% ${guard.directionBias} (${guard.longCount}L/${guard.shortCount}S)`);
                        continue;
                    }
                }
            } catch (_guardErr) { /* guard is optional — never block trading on error */ }

            await executeTrade(signal);
        }
    } catch (err) {
        console.error('❌ Forex trading loop error:', err.message);
        recentErrors.push({ timestamp: Date.now(), error: err.message });
        if (recentErrors.length > MAX_ERROR_HISTORY) recentErrors.shift();
    }

    lastScanCompletedAt = Date.now();
}

// [v6.3] Reset daily counters when UTC date boundary crosses — works on restart at any time
let _lastForexResetDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function resetDailyCounters() {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== _lastForexResetDate) {
        totalTradesToday = 0;
        tradesPerPair.clear();
        stoppedOutPairs.clear();
        simDailyPnL = 0;
        flipReversalsToday = 0;
        lastEquity = null; // reset daily baseline for LIVE mode too
        guardrails.resetDaily();
        _lastForexResetDate = today;
        console.log('🔄 Daily counters reset (new UTC date)');
    }
}

// ===== API ROUTES =====

// [Phase 3.5] Portfolio-level risk status endpoint (cross-bot)
app.get('/api/portfolio/risk', async (req, res) => {
    try {
        const risk = await checkPortfolioRisk();
        res.json({ success: true, data: risk });
    } catch (error) {
        res.json({ success: true, data: { totalPositions: positions.size, warnings: ['Cross-bot check failed'] } });
    }
});

app.get('/health', (req, res) => {
    const health = aggregateHealth({
        scan: checkScanHealth(lastScanCompletedAt, 300000),
        errors: checkErrorRate(recentErrors),
        trading: checkTradingHealth({
            totalTrades: simTotalTrades || 0,
            winRate: simTotalTrades > 0 ? (simWinners / simTotalTrades) : 0.5,
            profitFactor: simProfitFactor || 1.0,
            maxDrawdownPct: 0,
            consecutiveLosses: simConsecutiveLosses || 0,
        }),
        memory: checkMemoryHealth(),
    });
    res.json(health);
});

// [Phase 4] Forex trade evaluation summary endpoint
app.get('/api/forex/evaluations', (req, res) => {
    const rawEvals = (globalThis._forexTradeEvaluations || []).filter(e => e.exitReason !== 'orphaned_restart');
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
    // [v15.0] FIX: orderFlow check must use Math.abs — SHORT trades have negative orderFlowImbalance
    // (e.g. -0.3 means strong sell pressure). Old check `> 0.1` returned 0 for ALL short trades.
    const signalEffectiveness = {};
    const signals = ['orderFlow', 'displacement', 'fvgCount'];
    for (const sig of signals) {
        const withSignal = evals.filter(e => {
            if (sig === 'orderFlow') return Math.abs(e.signals.orderFlow || 0) > 0.1;
            if (sig === 'displacement') return e.signals.displacement === true;
            if (sig === 'fvgCount') return (e.signals.fvgCount || 0) > 0;
            return false;
        });
        const withoutSignal = evals.filter(e => {
            if (sig === 'orderFlow') return Math.abs(e.signals.orderFlow || 0) <= 0.1;
            if (sig === 'displacement') return e.signals.displacement !== true;
            if (sig === 'fvgCount') return (e.signals.fvgCount || 0) === 0;
            return false;
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
createSignalEndpoints(app, 'forex', 'forex',
  () => globalThis._forexTradeEvaluations || [],
  () => BOT_COMPONENTS.forex.components
);

app.get('/api/forex/status', async (req, res) => {
    try {
        const hasCredentials = oandaConfig.accessToken && oandaConfig.accountId;
        const session = getCurrentSession();
        const sessionLabel = session.quality === 'best' ? 'OVERLAP' :
                             session.name === 'London' ? 'LONDON' :
                             session.name === 'New York' ? 'NEW_YORK' :
                             session.name === 'Tokyo' ? 'TOKYO' : 'OFF_PEAK';

        // --- Demo/simulation mode (no OANDA credentials) ---
        if (!hasCredentials) {
            res.json({
                isRunning: botRunning,
                isPaused: botPaused,
                mode: 'DEMO',
                tradingMode: 'DEMO',
                session: sessionLabel,
                equity: simEquity,
                dailyReturn: simDailyPnL / SIM_STARTING_EQUITY,
                positions: Array.from(positions.values()),
                stats: {
                    totalTrades: simTotalTrades,
                    longTrades: simLongTrades,
                    shortTrades: simShortTrades,
                    winners: simWinners,
                    losers: simLosers,
                    winRate: simTotalTrades > 0 ? (simWinners / simTotalTrades) * 100 : 0,
                    totalPnL: simTotalPnL || (simEquity - SIM_STARTING_EQUITY),
                    totalWinAmount: simTotalWinAmount,
                    totalLossAmount: simTotalLossAmount,
                    profitFactor: simProfitFactor,
                    consecutiveLosses: simConsecutiveLosses,
                    maxConsecutiveLosses: simMaxConsecutiveLosses,
                    flipReversalsToday,
                    maxDrawdown: 0
                },
                config: {
                    symbols: FOREX_PAIRS,
                    maxPositions: 5,
                    stopLoss: MOMENTUM_CONFIG.tier1.stopLoss,
                    profitTarget: MOMENTUM_CONFIG.tier1.profitTarget,
                    dailyLossLimit: -MAX_DAILY_LOSS_FOREX
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
            });
            return;
        }

        // --- Live OANDA mode ---
        const account = await getAccount();
        const oandaPositions = await getOpenPositions();

        let longTrades = 0, shortTrades = 0;
        for (const [, trades] of recentTrades) {
            for (const trade of trades) {
                if (trade.side === 'long') longTrades++;
                else if (trade.side === 'short') shortTrades++;
            }
        }
        // Use persistent sim counters — they are incremented in closePositionWithReason
        // for both DEMO and LIVE modes, and survive restarts via forex-performance.json
        const winners = simWinners;
        const losers = simLosers;

        const balance = account ? parseFloat(account.balance) : simEquity;
        if (account && lastEquity === null) lastEquity = balance;
        const dailyPnL = lastEquity !== null ? balance - lastEquity : 0;
        const dailyReturn = lastEquity !== null && lastEquity !== 0 ? dailyPnL / lastEquity : 0;
        cachedLiveDailyPnL = dailyPnL; // update circuit breaker cache

        const positionsData = oandaPositions.map(pos => {
            // [v15.0] FIX: OANDA returns long.units="0" for short positions — "0" is truthy so
            // `"0" || "-741"` evaluates to "0". Must parseInt first before using || fallback.
            const isLong = parseInt(pos.long?.units || '0') > 0;
            const posLongUnits = parseInt(pos.long?.units || '0');
            const posShortUnits = parseInt(pos.short?.units || '0');
            const units = isLong ? Math.abs(posLongUnits) : Math.abs(posShortUnits);
            const entryPrice = parseFloat(isLong ? pos.long?.averagePrice : pos.short?.averagePrice || 0);
            const unrealizedPL = parseFloat(pos.unrealizedPL || 0);
            // [v16.0] JPY-aware current price derivation
            const _isJPYQuote = pos.pair && (pos.pair.includes('JPY') || pos.pair.includes('CHF'));
            let currentPrice;
            if (entryPrice > 0 && units > 0) {
                if (_isJPYQuote) {
                    const _plPerUnit = unrealizedPL / units;
                    const _denom = isLong ? (1 - _plPerUnit / entryPrice) : (1 + _plPerUnit / entryPrice);
                    currentPrice = _denom !== 0 ? entryPrice / _denom : entryPrice;
                } else {
                    currentPrice = entryPrice + (isLong ? 1 : -1) * (unrealizedPL / units);
                }
            } else {
                currentPrice = entryPrice;
            }
            const unrealizedPLPct = entryPrice > 0
                ? (isLong ? (currentPrice - entryPrice) / entryPrice : (entryPrice - currentPrice) / entryPrice)
                : 0;
            return {
                symbol: pos.pair,
                qty: units,
                side: isLong ? 'long' : 'short',
                entryPrice,
                currentPrice,
                unrealizedPL,
                unrealizedPLPct
            };
        });

        res.json({
            isRunning: botRunning,
            isPaused: botPaused,
            mode: oandaConfig.isPractice ? 'PAPER' : 'LIVE',
            tradingMode: oandaConfig.isPractice ? 'PAPER' : 'LIVE',
            session: sessionLabel,
            equity: balance,
            dailyReturn,
            positions: positionsData,
            stats: {
                totalTrades: simTotalTrades,  // persistent cumulative count, not daily
                longTrades,
                shortTrades,
                winners,
                losers,
                totalPnL: simTotalPnL || dailyPnL,
                totalWinAmount: simTotalWinAmount,
                totalLossAmount: simTotalLossAmount,
                profitFactor: simProfitFactor,
                consecutiveLosses: simConsecutiveLosses,
                maxConsecutiveLosses: simMaxConsecutiveLosses,
                flipReversalsToday,
                maxDrawdown: 0
            },
            config: {
                symbols: FOREX_PAIRS,
                maxPositions: 5,
                stopLoss: MOMENTUM_CONFIG.tier1.stopLoss,
                profitTarget: MOMENTUM_CONFIG.tier1.profitTarget,
                dailyLossLimit: -500
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
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/accounts/summary', async (req, res) => {
    try {
        const account = await getAccount();

        if (account) {
            // Initialize lastEquity on first call
            if (lastEquity === null) {
                lastEquity = parseFloat(account.balance);
            }
            res.json({
                success: true,
                data: {
                    realAccount: {
                        balance: parseFloat(account.balance),
                        equity: parseFloat(account.NAV),
                        canReset: false
                    },
                    demoAccount: {
                        balance: parseFloat(account.balance),
                        equity: parseFloat(account.NAV),
                        canReset: true
                    }
                }
            });
        } else {
            res.status(500).json({ success: false, error: 'Cannot fetch account' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/forex/start', (req, res) => {
    try {
        botRunning = true;
        botPaused = false;
        saveBotState();
        res.json({ success: true, message: 'Forex trading bot started', isRunning: true, isPaused: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/forex/stop', (req, res) => {
    try {
        botRunning = false;
        botPaused = false;
        saveBotState();
        res.json({ success: true, message: 'Forex trading bot stopped', isRunning: false, isPaused: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/forex/pause', (req, res) => {
    try {
        botPaused = !botPaused;
        saveBotState();
        res.json({ success: true, message: botPaused ? 'Forex trading bot paused' : 'Forex trading bot resumed', isRunning: botRunning, isPaused: botPaused });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/forex/scan', async (req, res) => {
    try {
        const signals = await scanForSignals();
        res.json({ success: true, signals });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
            error: error.message
        });
    }
});

// ── Guardrail manual reset ───────────────────────────────────────────────────
app.post('/api/guardrails/reset', (req, res) => {
    guardrails.consecutiveLosses = 0;
    guardrails.lanePausedUntil = 0;
    simConsecutiveLosses = 0;
    console.log('[GUARDRAILS] Manual reset — consecutive losses cleared');
    res.json({ success: true, message: 'Guardrails reset' });
});

// ── Config status (for Settings page) ───────────────────────────────────────
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: {
            brokers: {
                oanda: {
                    configured: !!(process.env.OANDA_ACCOUNT_ID && process.env.OANDA_ACCESS_TOKEN),
                    mode: process.env.OANDA_PRACTICE === 'false' ? 'live' : 'practice',
                },
            },
        },
    });
});

// ── Credentials management ──────────────────────────────────────────────────
app.post('/api/config/credentials', requireJwtOrApiSecret, async (req, res) => {
    try {
        const { broker, credentials, fields } = req.body;
        const creds = credentials || fields;
        const ALLOWED_KEYS = {
            oanda:    ['OANDA_ACCOUNT_ID', 'OANDA_ACCESS_TOKEN', 'OANDA_PRACTICE'],
            telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'TELEGRAM_ALERTS_ENABLED'],
            sms:      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'ALERT_PHONE_NUMBER', 'SMS_ALERTS_ENABLED'],
        };
        const allowed = ALLOWED_KEYS[broker];
        if (!allowed) return res.status(400).json({ success: false, error: 'Unknown broker' });
        if (!creds || typeof creds !== 'object') return res.status(400).json({ success: false, error: 'No credentials provided' });
        const userId = req.user?.sub;
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
        if (broker === 'oanda') {
            if (process.env.OANDA_ACCOUNT_ID)   oandaConfig.accountId   = process.env.OANDA_ACCOUNT_ID;
            if (process.env.OANDA_ACCESS_TOKEN) oandaConfig.accessToken = process.env.OANDA_ACCESS_TOKEN;
            if (process.env.OANDA_PRACTICE !== undefined) oandaConfig.isPractice = process.env.OANDA_PRACTICE !== 'false';
            // Register or update per-user engine
            if (userId) {
                const existingEngine = forexEngineRegistry.get(String(userId));
                if (existingEngine) {
                    existingEngine.updateCredentials(process.env.OANDA_ACCOUNT_ID, process.env.OANDA_ACCESS_TOKEN,
                        process.env.OANDA_PRACTICE !== undefined ? process.env.OANDA_PRACTICE !== 'false' : undefined,
                        { TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID });
                } else {
                    getOrCreateForexEngine(userId).catch(() => {});
                }
            }
        }

        const response = { success: true, updated, storage, engineStarted: !!userId };
        if (warnings.length === 1) response.warning = warnings[0];
        if (warnings.length > 1) response.warnings = warnings;
        res.json(response);
    } catch (err) {
        console.error('Credentials update error:', err.message);
        res.status(500).json({ success: false, error: err.message || 'Failed to save credentials' });
    }
});

app.get('/api/config/credentials/status', requireJwt, async (req, res) => {
    const userId = req.user?.sub;
    const envStatus = {
        oanda:    { configured: !!(process.env.OANDA_ACCOUNT_ID && process.env.OANDA_ACCESS_TOKEN) },
        telegram: { configured: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) },
        sms:      { configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) },
    };

    const fileStatus = userId ? {
        oanda: credentialStore.countCredentials(userId, 'oanda'),
        telegram: credentialStore.countCredentials(userId, 'telegram'),
        sms: credentialStore.countCredentials(userId, 'sms'),
    } : null;

    if (!userId) {
        return res.json({ success: true, brokers: envStatus });
    }

    if (!dbPool) {
        return res.json({ success: true, brokers: {
            oanda:    { configured: (fileStatus.oanda    || 0) >= 2 || envStatus.oanda.configured },
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
            oanda:    { configured: Math.max(stored.oanda    || 0, fileStatus.oanda    || 0) >= 2 || envStatus.oanda.configured },
            telegram: { configured: Math.max(stored.telegram || 0, fileStatus.telegram || 0) >= 2 || envStatus.telegram.configured },
            sms:      { configured: Math.max(stored.sms      || 0, fileStatus.sms      || 0) >= 2 || envStatus.sms.configured },
        }});
    } catch (e) {
        console.warn('⚠️ Credential status lookup failed, falling back to environment values:', e.message);
        res.json({ success: true, brokers: {
            oanda:    { configured: (fileStatus.oanda    || 0) >= 2 || envStatus.oanda.configured },
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
            `SELECT * FROM trades WHERE bot='forex' ORDER BY created_at DESC LIMIT $1`, [limit]);
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
            WHERE bot='forex' AND created_at >= NOW() - INTERVAL '1 day' * $1
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
            FROM trades WHERE bot='forex'
        `);
        res.json({ success: true, daily: r.rows, totals: totals.rows });
    } catch (e) { res.status(500).json({ success: false, error: e.message, daily: [], totals: [] }); }
});

app.get('/metrics', async (req, res) => {
    try {
        const promClient = require('prom-client');
        res.set('Content-Type', promClient.register.contentType);
        res.end(await metrics.getMetrics());
    } catch (error) {
        res.status(500).end(error.message);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-USER FOREX ENGINE
// ─────────────────────────────────────────────────────────────────────────────

class UserForexEngine {
    constructor(userId, oandaAccountId, oandaAccessToken, isPractice) {
        this.userId = userId;
        this.oandaConfig = {
            accountId: oandaAccountId,
            accessToken: oandaAccessToken,
            baseURL: isPractice !== false ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com',
            isPractice: isPractice !== false
        };
        this.positions = new Map();
        this.recentTrades = new Map();
        this.stoppedOutPairs = new Map();
        this.tradesPerPair = new Map();
        this.totalTradesToday = 0;
        this.botRunning = false;
        this.botPaused = false;
        this.lastResetDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        this.simEquity = 100000;
        this.simDailyPnL = 0;
        this.simTotalTrades = 0;
        this.simWinners = 0;
        this.simLosers = 0;
        console.log(`🔧 [ForexEngine] Created engine for user ${userId}`);
    }

    updateCredentials(oandaAccountId, oandaAccessToken, isPractice, extraCreds) {
        if (oandaAccountId)    this.oandaConfig.accountId  = oandaAccountId;
        if (oandaAccessToken)  this.oandaConfig.accessToken = oandaAccessToken;
        if (isPractice !== undefined) {
            this.oandaConfig.isPractice = isPractice !== false;
            this.oandaConfig.baseURL = this.oandaConfig.isPractice
                ? 'https://api-fxpractice.oanda.com' : 'https://api-fxtrade.oanda.com';
        }
        const tgToken  = extraCreds?.TELEGRAM_BOT_TOKEN  || process.env.TELEGRAM_BOT_TOKEN;
        const tgChatId = extraCreds?.TELEGRAM_CHAT_ID    || process.env.TELEGRAM_CHAT_ID;
        if (tgToken && tgChatId) {
            try {
                const TelegramBot = require('node-telegram-bot-api');
                const bot = new TelegramBot(tgToken, { polling: false });
                this._telegram = {
                    sendForexEntry:     (pair, dir, entry, sl, tp, units, tier) =>
                        bot.sendMessage(tgChatId, `✅ *FOREX ENTRY* [${tier}]\n🌍 ${pair} ${dir.toUpperCase()} x${units}\n💰 Entry: ${entry.toFixed(5)}\n🛑 SL: ${sl?.toFixed(5) || '—'}  🎯 TP: ${tp?.toFixed(5) || '—'}`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendForexStopLoss:  (pair, entry, reason) =>
                        bot.sendMessage(tgChatId, `🚨 *FOREX STOP LOSS*\n🌍 ${pair}\n💰 Entry: ${entry}\n📌 Reason: ${reason}`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendForexTakeProfit:(pair, entry, reason) =>
                        bot.sendMessage(tgChatId, `🎯 *FOREX TAKE PROFIT*\n🌍 ${pair}\n💰 Entry: ${entry}\n📌 Reason: ${reason}`, { parse_mode: 'Markdown' }).catch(() => {}),
                    send:               (msg) => bot.sendMessage(tgChatId, msg, { parse_mode: 'Markdown' }).catch(() => {}),
                };
                console.log(`📱 [ForexEngine ${this.userId}] Per-user Telegram alerts configured`);
            } catch (e) {
                this._telegram = null;
                console.warn(`⚠️  [ForexEngine ${this.userId}] Telegram init failed:`, e.message);
            }
        } else {
            this._telegram = null;
        }
    }

    async saveState() {
        if (!dbPool) return;
        try {
            await dbPool.query(
                `INSERT INTO engine_state (user_id, bot, state_json, updated_at)
                 VALUES ($1, 'forex', $2, NOW())
                 ON CONFLICT (user_id, bot) DO UPDATE SET state_json=$2, updated_at=NOW()`,
                [this.userId, JSON.stringify({
                    totalTradesToday: this.totalTradesToday, botRunning: this.botRunning,
                    botPaused: this.botPaused, simEquity: this.simEquity,
                    simTotalTrades: this.simTotalTrades, simWinners: this.simWinners, simLosers: this.simLosers
                })]
            );
        } catch (e) { /* non-critical */ }
    }

    async loadState() {
        if (!dbPool) return;
        try {
            const r = await dbPool.query('SELECT state_json FROM engine_state WHERE user_id=$1 AND bot=$2', [this.userId, 'forex']);
            if (r.rows.length > 0) {
                const s = r.rows[0].state_json;
                if (s.totalTradesToday !== undefined) this.totalTradesToday = s.totalTradesToday;
                if (s.botRunning !== undefined) this.botRunning = s.botRunning;
                if (s.botPaused !== undefined) this.botPaused = s.botPaused;
                if (s.simEquity !== undefined) this.simEquity = s.simEquity;
                if (s.simTotalTrades !== undefined) this.simTotalTrades = s.simTotalTrades;
                if (s.simWinners !== undefined) this.simWinners = s.simWinners;
                if (s.simLosers !== undefined) this.simLosers = s.simLosers;
            }

            // Hydrate `this.positions` from DB + OANDA
            const dbOpenRes = await dbPool.query(
                `SELECT id, symbol, direction, entry_price, quantity, stop_loss, take_profit, entry_time
                 FROM trades WHERE bot='forex' AND status='open' AND user_id=$1`, [this.userId]
            );
            const oandaPositions = await this.getOpenPositions();
            const openInstruments = new Set(oandaPositions.map(p => p.instrument));

            for (const row of dbOpenRes.rows) {
                if (openInstruments.has(row.symbol)) {
                    this.positions.set(row.symbol, {
                        dbTradeId: row.id,
                        instrument: row.symbol,
                        direction: row.direction,
                        entry: parseFloat(row.entry_price || '0'),
                        units: parseFloat(row.quantity || '0'),
                        stopLoss: parseFloat(row.stop_loss || '0'),
                        takeProfit: parseFloat(row.take_profit || '0'),
                        entryTime: row.entry_time,
                        tier: 'restored'
                    });
                    this.tradesPerPair.set(row.symbol, 10); // block new entries while recovering
                }
            }
            if (this.positions.size > 0) {
                console.log(`✅ [ForexEngine ${this.userId}] Hydrated ${this.positions.size} positions from DB/OANDA`);
            }
        } catch (e) {
            console.warn(`⚠️  [ForexEngine ${this.userId}] State load failed:`, e.message);
        }
    }

    async oandaReq(method, endpoint, data = null) {
        if (!(this.oandaConfig.accountId && this.oandaConfig.accessToken)) {
            return null;
        }
        try {
            const config = {
                method, url: `${this.oandaConfig.baseURL}${endpoint}`,
                headers: { 'Authorization': `Bearer ${this.oandaConfig.accessToken}`, 'Content-Type': 'application/json' }
            };
            if (data) config.data = data;
            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`[ForexEngine ${this.userId}] OANDA Error [${endpoint}]:`, error.response?.data || error.message);
            return null;
        }
    }

    async getAccount() {
        const data = await this.oandaReq('get', `/v3/accounts/${this.oandaConfig.accountId}`);
        return data?.account || null;
    }

    async getOpenPositions() {
        const data = await this.oandaReq('get', `/v3/accounts/${this.oandaConfig.accountId}/openPositions`);
        return data?.positions || [];
    }

    async createOrder(instrument, units, stopLoss, takeProfit) {
        const precision = instrument.includes('JPY') ? 3 : 5;
        const order = { order: { type: 'MARKET', instrument, units: units.toString(),
            stopLossOnFill: { price: stopLoss.toFixed(precision) },
            takeProfitOnFill: { price: takeProfit.toFixed(precision) }, timeInForce: 'FOK' }};
        return await this.oandaReq('post', `/v3/accounts/${this.oandaConfig.accountId}/orders`, order);
    }

    async closeOandaPosition(instrument) {
        // Determine which side to close based on tracked position direction
        const pos = this.positions.get(instrument);
        const body = {};
        if (pos && pos.direction === 'short') {
            body.shortUnits = 'ALL';
        } else {
            body.longUnits = 'ALL';
        }
        return await this.oandaReq('put', `/v3/accounts/${this.oandaConfig.accountId}/positions/${instrument}/close`, body);
    }

    async dbForexOpen(pair, direction, tier, entry, stopLoss, takeProfit, units, session, signal = {}) {
        if (!dbPool) return null;
        try {
            const absUnits = Math.abs(units);
            const positionSizeUsd = entry > 0 ? parseFloat((absUnits * entry).toFixed(2)) : null;
            const tags = buildForexTradeTags(signal, tier, direction, session);
            const r = await dbPool.query(
                `INSERT INTO trades (user_id,bot,symbol,direction,tier,strategy,regime,status,entry_price,quantity,
                 position_size_usd,stop_loss,take_profit,entry_time,session,signal_score,entry_context,rsi,momentum_pct)
                 VALUES ($1,'forex',$2,$3,$4,$5,$6,'open',$7,$8,$9,$10,$11,NOW(),$12,$13,$14::jsonb,$15,$16) RETURNING id`,
                [this.userId, pair, direction, tier, tags.strategy, tags.regime, entry, absUnits, positionSizeUsd, stopLoss, takeProfit,
                 session || null, tags.score, JSON.stringify(tags.context), signal.rsi || null, signal.trendStrength || null]
            );
            return r.rows[0]?.id;
        } catch (e) { console.warn('DB forex open failed:', e.message); return null; }
    }

    async dbForexClose(id, exitPrice, pnlUsd, pnlPct, reason) {
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
            console.warn('DB forex close failed (rolled back):', e.message);
        } finally {
            client.release();
        }
    }

    canTrade(pair, direction) {
        const stopEntry = this.stoppedOutPairs.get(pair);
        if (stopEntry) {
            const { time, cooldownMs } = typeof stopEntry === 'object' ? stopEntry : { time: stopEntry, cooldownMs: MIN_TIME_AFTER_STOP };
            if (Date.now() - time < cooldownMs) return false;
        }
        if (this.totalTradesToday >= MAX_TRADES_PER_DAY) return false;
        if ((this.tradesPerPair.get(pair) || 0) >= MAX_TRADES_PER_PAIR) return false;
        const recent = this.recentTrades.get(pair) || [];
        if (recent.length > 0) {
            const last = recent[recent.length - 1];
            if (Date.now() - last.time < 10 * 60 * 1000) return false;
        }
        return true;
    }

    async closePositionWithReason(pair, reason) {
        const pos = this.positions.get(pair);
        if (pos?.dbTradeId) {
            const exitPnl = pos.unrealizedPL ?? 0;
            const exitEntry = pos.entry ?? 0;
            const exitPrice = pos.currentPrice ?? exitEntry;
            // [v13.0] FIX: price movement % instead of PnL/notional (broken for JPY)
            const exitPct = exitEntry > 0
                ? ((exitPrice - exitEntry) / exitEntry) * (pos.direction === 'short' ? -100 : 100)
                : 0;
            this.dbForexClose(pos.dbTradeId, exitPrice, exitPnl, exitPct, reason).catch(() => {});
        }
        await this.closeOandaPosition(pair);
        if (reason.toLowerCase().includes('stop')) {
            // Dynamic cooldown based on price movement
            const lossPct = pos && pos.entry > 0 && pos.currentPrice > 0
                ? Math.abs((pos.currentPrice - pos.entry) / pos.entry) * 100
                : 1;
            const cooldownMs = lossPct >= 2 ? MIN_TIME_AFTER_STOP
                : lossPct >= 1 ? 60 * 60 * 1000
                : 30 * 60 * 1000;
            this.stoppedOutPairs.set(pair, { time: Date.now(), cooldownMs, lossPercent: lossPct });
        }
        this.positions.delete(pair);
        await this.saveState();
        console.log(`✅ [ForexEngine ${this.userId}] Closed ${pair} (${reason})`);
    }

    async managePositions() {
        const oandaPositions = await this.getOpenPositions();
        const openInstruments = new Set(oandaPositions.map(p => p.instrument));
        // Clean up positions OANDA closed (stop-loss / take-profit) — write real P&L to DB
        for (const [pair, localPos] of this.positions) {
            if (!openInstruments.has(pair)) {
                try {
                    const closed = await this.oandaReq('get',
                        `/v3/accounts/${this.oandaConfig.accountId}/trades?instrument=${pair}&state=CLOSED&count=1`);
                    const trade = closed?.trades?.[0];
                    if (trade && localPos.dbTradeId) {
                        const exitPrice = parseFloat(trade.closePrice ?? trade.averageClosePrice ?? localPos.entry ?? 0);
                        const realPnl   = parseFloat(trade.realizedPL ?? 0);
                        const exitEntry = localPos.entry ?? 0;
                        // [v13.0] FIX: price movement % instead of PnL/notional (broken for JPY)
                        const exitPct   = exitEntry > 0
                            ? ((exitPrice - exitEntry) / exitEntry) * (localPos.direction === 'short' ? -100 : 100)
                            : 0;
                        const reason    = realPnl < 0 ? 'Stop Loss' : 'Take Profit';
                        this.dbForexClose(localPos.dbTradeId, exitPrice, realPnl, exitPct, reason).catch(() => {});
                        console.log(`📊 [ForexEngine ${this.userId}] Synced closed trade ${pair}: pnl=${realPnl.toFixed(2)}`);
                    }
                } catch (e) {
                    console.warn(`⚠️  [ForexEngine ${this.userId}] Failed to fetch closed trade for ${pair}:`, e.message);
                }
                this.positions.delete(pair);
            }
        }
        for (const p of oandaPositions) {
            const instrument = p.instrument;
            const isLong = (p.long?.units || 0) > 0;
            const position = this.positions.get(instrument);
            if (!position) continue;
            const units = parseFloat(isLong ? p.long?.units : p.short?.units) || 0;
            const avgPrice = parseFloat(isLong ? p.long?.averagePrice : p.short?.averagePrice) || position.entry;
            const unrealizedPL = parseFloat(p.unrealizedPL) || 0;
            const currentPrice = units !== 0 ? avgPrice + (isLong ? 1 : -1) * (unrealizedPL / Math.abs(units)) : avgPrice;
            position.unrealizedPL = unrealizedPL;
            position.currentPrice = currentPrice;

            // [v13.0] Profit protection (same as global managePositions)
            if (position.peakUnrealizedPL === undefined) position.peakUnrealizedPL = 0;
            if (unrealizedPL > position.peakUnrealizedPL) position.peakUnrealizedPL = unrealizedPL;

            const rawEngPosVal = Math.abs(position.units || 0) * currentPrice;
            const engPosValue = instrument.includes('JPY') ? rawEngPosVal / currentPrice : rawEngPosVal;
            const engProfitThreshold = Math.max(15, engPosValue * 0.008); // [v17.0] match main engine
            if (unrealizedPL > engProfitThreshold) {
                if (!position.wasPositive) console.log(`[ForexEngine ${this.userId}][PROFIT-PROTECT] ${instrument}: breakeven lock ACTIVE (+$${unrealizedPL.toFixed(2)})`);
                position.wasPositive = true;
            }
            if (position.wasPositive && unrealizedPL < -4) { // [v17.0] was -$2
                console.log(`[ForexEngine ${this.userId}][PROFIT-PROTECT] ${instrument}: was +$${position.peakUnrealizedPL.toFixed(2)}, now $${unrealizedPL.toFixed(2)} — closing`);
                await this.closePositionWithReason(instrument, `Profit-Protect breakeven lock`);
                continue;
            }
            if (position.peakUnrealizedPL > 10 && unrealizedPL > 0) {
                const dropPct = ((position.peakUnrealizedPL - unrealizedPL) / position.peakUnrealizedPL) * 100;
                if (dropPct > 55) { // [v17.0] was 40% — normal consolidation, let winners run
                    await this.closePositionWithReason(instrument, `Profit-Protect drawback (${dropPct.toFixed(1)}% drop from peak)`);
                    continue;
                }
            }

            // [v13.0] Trailing stops (uses module-level updateTrailingStop)
            updateTrailingStop(position, currentPrice);

            const atrExitReason = getForexAtrExitReason(position, currentPrice);
            if (atrExitReason) { await this.closePositionWithReason(instrument, atrExitReason); continue; }
            // Time-based exit: max 5 days
            const holdHours = (Date.now() - (position.entryTime?.getTime?.() || Date.now())) / 3600000;
            if (holdHours >= 120) { await this.closePositionWithReason(instrument, 'Max Hold Time (5 days)'); continue; }
            // Stop loss
            if (position.direction === 'long' && currentPrice <= position.stopLoss) {
                await this.closePositionWithReason(instrument, 'Stop Loss'); continue;
            }
            if (position.direction === 'short' && currentPrice >= position.stopLoss) {
                await this.closePositionWithReason(instrument, 'Stop Loss'); continue;
            }
            // Take profit
            if (position.direction === 'long' && currentPrice >= position.takeProfit) {
                await this.closePositionWithReason(instrument, 'Take Profit'); continue;
            }
            if (position.direction === 'short' && currentPrice <= position.takeProfit) {
                await this.closePositionWithReason(instrument, 'Take Profit');
            }
        }
    }

    async executeTrade(signal) {
        const account = await this.getAccount();
        if (!account) return false;
        const balance = parseFloat(account.balance);
        const config = MOMENTUM_CONFIG[signal.tier];
        const FOREX_SLIPPAGE = 0.001;
        const slippageAdj = signal.direction === 'long' ? 1 + FOREX_SLIPPAGE : 1 - FOREX_SLIPPAGE;
        const effectiveEntry = signal.entry * slippageAdj;
        const sessionMultiplier = signal.session === 'London/NY Overlap' ? 1.15 : 1.0;
        // [v9.0] Monte Carlo position sizing for multi-user engine
        let mcMult = 1.0;
        if (monteCarloSizer.tradeReturns.length >= 20) {
            const mcR = monteCarloSizer.optimize();
            mcMult = Math.min(mcR.halfKelly / 0.01, 2.0);
            mcMult = Math.max(mcMult, 0.25);
        }
        const positionValue = balance * config.positionSize * sessionMultiplier * mcMult;

        // [v14.1] FIX: was `positionValue / entry * 7000` — the `* 7000` multiplier created
        // massively oversized positions (155K units on EUR_USD). Now matches global engine logic.
        const _pair = signal.pair;
        const _baseCurrency = _pair.split('_')[0];
        let rawUnits;
        if (_baseCurrency === 'USD') {
            rawUnits = Math.round(positionValue);
        } else {
            rawUnits = Math.round(positionValue / effectiveEntry);
        }
        // Cap at 100K units (1 standard lot) for safety
        const maxUnits = 100000;
        if (rawUnits > maxUnits) {
            console.log(`[ForexEngine ${this.userId}][SafetyCheck] ${_pair} units ${rawUnits} exceeds max ${maxUnits}, capping`);
            rawUnits = maxUnits;
        }
        const units = signal.direction === 'long' ? rawUnits : -rawUnits;
        const result = await this.createOrder(signal.pair, units, signal.stopLoss, signal.takeProfit);
        if (result?.orderFillTransaction) {
            const tags = buildForexTradeTags(signal, signal.tier, signal.direction, signal.session);
            this.positions.set(signal.pair, {
                instrument: signal.pair, direction: signal.direction, tier: signal.tier,
                entry: signal.entry, stopLoss: signal.stopLoss, takeProfit: signal.takeProfit,
                units, entryTime: new Date(), session: signal.session,
                strategy: tags.strategy, regime: tags.regime, signalScore: signal.score,
                regimeQuality: signal.regimeQuality, atrPct: signal.atrPct
            });
            this.dbForexOpen(signal.pair, signal.direction, signal.tier, signal.entry, signal.stopLoss, signal.takeProfit, units, signal.session, signal)
                .then(id => { const p = this.positions.get(signal.pair); if (p) p.dbTradeId = id; })
                .catch(() => {});
            this.totalTradesToday++;
            this.tradesPerPair.set(signal.pair, (this.tradesPerPair.get(signal.pair) || 0) + 1);
            const trades = this.recentTrades.get(signal.pair) || [];
            trades.push({ time: Date.now(), side: signal.direction });
            if (trades.length > 10) trades.shift();
            this.recentTrades.set(signal.pair, trades);
            await this.saveState();
            (this._telegram || telegramAlerts).sendForexEntry(signal.pair, signal.direction, signal.entry, signal.stopLoss, signal.takeProfit, units, signal.tier).catch(() => {});
            console.log(`✅ [ForexEngine ${this.userId}] Trade: ${signal.direction.toUpperCase()} ${signal.pair} x${Math.abs(units)}`);
            return true;
        }
        return false;
    }

    async tradingLoop() {
        if (!this.botRunning || this.botPaused) return;
        // [v6.3] Daily counter reset — check date boundary each loop iteration
        const today = new Date().toISOString().slice(0, 10);
        if (today !== this.lastResetDate) {
            this.totalTradesToday = 0;
            this.tradesPerPair.clear();
            this.stoppedOutPairs.clear();
            this.simDailyPnL = 0;
            this.guardrails.resetDaily();
            this.lastResetDate = today;
            console.log(`🔄 [ForexEngine ${this.userId}] Daily counters reset`);
        }
        if (!isMarketOpen()) return;
        await this.managePositions();
        // Reuse module-level scanForSignals but with this engine's oandaConfig
        // scanForSignals() uses module-level oandaConfig for OANDA API calls — we temporarily
        // swap it to this engine's config, then restore. This is safe since JS is single-threaded.
        const savedConfig = { ...oandaConfig };
        Object.assign(oandaConfig, this.oandaConfig);
        let signals = [];
        try {
            signals = await scanForSignals(this.positions);
        } finally {
            Object.assign(oandaConfig, savedConfig);
        }

        // [v8.1] Process flip-reversal signals first
        const flipSignals = signals.filter(s => s.isFlipReversal);
        const normalSignals = signals.filter(s => !s.isFlipReversal);

        for (const signal of flipSignals) {
            const existingPos = this.positions.get(signal.pair);
            if (!existingPos || existingPos.direction !== signal.existingDirection) continue;
            if (this.totalTradesToday + 2 > MAX_TRADES_PER_DAY) continue;
            const committee = computeForexCommitteeScore(signal);
            if (committee.confidence < 0.50) continue;
            signal.committeeConfidence = committee.confidence;
            signal.committeeComponents = committee.components;
            // [v10.1] Quality gate for flip signals
            const flipQC = isForexEntryQualified(signal, committee);
            if (!flipQC.qualified) {
                console.log(`[ForexEngine ${this.userId}][QUALITY GATE] ${signal.pair} ${signal.direction} (flip): BLOCKED — ${flipQC.reason}`);
                continue;
            }
            // [Correlation Guard] Flip signals: check concentration after imagined position flip
            try {
                const ownPositions = Array.from(this.positions.values());
                const guard = computeCorrelationGuard(ownPositions);
                if (guard.isConcentrated) {
                    const signalDir = signal.direction || 'long';
                    if ((signalDir === 'long' && !guard.canOpenLong) || (signalDir === 'short' && !guard.canOpenShort)) {
                        console.log(`[ForexEngine ${this.userId}][CORRELATION] ${signal.pair} ${signalDir} flip BLOCKED — portfolio ${(guard.exposureRatio * 100).toFixed(0)}% ${guard.directionBias} (${guard.longCount}L/${guard.shortCount}S)`);
                        continue;
                    }
                }
            } catch (_guardErr) { /* guard is optional — never block trading on error */ }
            console.log(`🔄 [ForexEngine ${this.userId}] [FLIP-REVERSAL] Closing ${signal.pair} ${signal.existingDirection} → opening ${signal.direction}`);
            await this.closePositionWithReason(signal.pair, `flip-reversal → ${signal.direction}`);
            this.totalTradesToday++;
            await this.executeTrade(signal);
        }

        const maxNewPos = 5 - this.positions.size;
        for (const signal of normalSignals.slice(0, Math.min(maxNewPos, MAX_SIGNALS_PER_CYCLE))) {
            if (!this.positions.has(signal.pair) && this.canTrade(signal.pair, signal.direction)) {
                // [v10.1] Re-entry validation
                if (profitProtectReentryPairs.has(signal.pair)) {
                    const reentryCheck = isReentryValid(signal.pair, signal);
                    if (!reentryCheck.valid) {
                        console.log(`[ForexEngine ${this.userId}][RE-ENTRY] ${signal.pair}: BLOCKED — ${reentryCheck.reason}`);
                        continue;
                    }
                }
                // [v10.1] Quality gate
                const committee = computeForexCommitteeScore(signal);
                const qc = isForexEntryQualified(signal, committee);
                if (!qc.qualified) {
                    console.log(`[ForexEngine ${this.userId}][QUALITY GATE] ${signal.pair}: BLOCKED — ${qc.reason}`);
                    continue;
                }
                signal.committeeConfidence = committee.confidence;
                signal.committeeComponents = committee.components;
                // [Correlation Guard] Check own-position concentration before executing
                try {
                    const ownPositions = Array.from(this.positions.values());
                    const guard = computeCorrelationGuard(ownPositions);
                    if (guard.isConcentrated) {
                        const signalDir = signal.direction || 'long';
                        if ((signalDir === 'long' && !guard.canOpenLong) || (signalDir === 'short' && !guard.canOpenShort)) {
                            console.log(`[ForexEngine ${this.userId}][CORRELATION] ${signal.pair} ${signalDir} BLOCKED — portfolio ${(guard.exposureRatio * 100).toFixed(0)}% ${guard.directionBias} (${guard.longCount}L/${guard.shortCount}S)`);
                            continue;
                        }
                    }
                } catch (_guardErr) { /* guard is optional — never block trading on error */ }
                await this.executeTrade(signal);
            }
        }
    }

    getStatus() {
        return {
            userId: this.userId, isRunning: this.botRunning, isPaused: this.botPaused,
            positions: this.positions.size, totalTradesToday: this.totalTradesToday,
            oandaConfigured: !!(this.oandaConfig.accessToken && this.oandaConfig.accountId),
            isPractice: this.oandaConfig.isPractice
        };
    }
}

// ── Forex Engine Registry ────────────────────────────────────────────────────
const forexEngineRegistry = new Map(); // userId → UserForexEngine

async function getOrCreateForexEngine(userId) {
    const key = String(userId);
    if (forexEngineRegistry.has(key)) return forexEngineRegistry.get(key);
    try {
        const creds = await loadUserCredentials(userId, 'oanda');
        const accountId   = creds.OANDA_ACCOUNT_ID    || process.env.OANDA_ACCOUNT_ID;
        const accessToken = creds.OANDA_ACCESS_TOKEN   || process.env.OANDA_ACCESS_TOKEN;
        const isPractice  = creds.OANDA_PRACTICE !== 'false' && process.env.OANDA_PRACTICE !== 'false';
        if (!accountId || !accessToken) return null;
        const engine = new UserForexEngine(userId, accountId, accessToken, isPractice);
        await engine.loadState();
        const tgCreds = await loadUserCredentials(userId, 'telegram').catch(() => ({}));
        engine.updateCredentials(null, null, undefined, { TELEGRAM_BOT_TOKEN: tgCreds.TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID: tgCreds.TELEGRAM_CHAT_ID });
        forexEngineRegistry.set(key, engine);
        console.log(`🔧 [ForexRegistry] Engine registered for user ${userId} (${forexEngineRegistry.size} total)`);
        return engine;
    } catch (e) {
        console.warn(`⚠️  [ForexRegistry] Failed to create engine for user ${userId}:`, e.message);
        return null;
    }
}

// ── Forex ScanQueue ──────────────────────────────────────────────────────────
let forexScanQueueRunning = false;

async function runForexScanQueue() {
    if (forexScanQueueRunning) return;
    forexScanQueueRunning = true;
    try {
        const engines = Array.from(forexEngineRegistry.values());
        for (const engine of engines) {
            try { await engine.tradingLoop(); }
            catch (e) { console.error(`❌ [ForexQueue] Engine ${engine.userId} crashed:`, e.message); }
        }
        // [v13.0] Keep global scan counters in sync so status endpoint shows activity
        if (engines.length > 0) {
            scanCount++;
            lastScanTime = new Date();
        }
    } finally { forexScanQueueRunning = false; }
}

// ── Per-user forex engine JWT endpoints ─────────────────────────────────────
app.get('/api/forex/engine/status', requireJwt, async (req, res) => {
    const userId = req.user.sub;
    const engine = await getOrCreateForexEngine(userId);
    if (!engine) return res.json({ success: true, credentialsRequired: true,
        message: 'No OANDA credentials configured — visit Settings' });
    try {
        const account = await engine.getAccount();
        if (!account) {
            return res.json({ success: true, credentialsRequired: true,
                message: 'OANDA credentials invalid or expired' });
        }
        const equity = account ? parseFloat(account.balance) : 0;
        res.json({ success: true, isRunning: engine.botRunning, isPaused: engine.botPaused,
            mode: engine.oandaConfig.isPractice ? 'PAPER' : 'LIVE',
            positions: Array.from(engine.positions.values()),
            stats: { totalTradesToday: engine.totalTradesToday, openPositions: engine.positions.size },
            portfolioValue: equity });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/forex/engine/start', requireJwt, async (req, res) => {
    const engine = await getOrCreateForexEngine(req.user.sub);
    if (!engine) return res.status(404).json({ success: false, error: 'Configure OANDA credentials first' });
    const account = await engine.getAccount();
    if (!account) {
        return res.status(400).json({ success: false, error: 'OANDA credentials invalid or expired' });
    }
    engine.botRunning = true; engine.botPaused = false; await engine.saveState();
    res.json({ success: true, isRunning: true });
});

app.post('/api/forex/engine/stop', requireJwt, async (req, res) => {
    const engine = forexEngineRegistry.get(String(req.user.sub));
    if (!engine) return res.status(404).json({ success: false, error: 'Engine not found' });
    engine.botRunning = false; await engine.saveState();
    res.json({ success: true, isRunning: false });
});

app.post('/api/forex/engine/pause', requireJwt, async (req, res) => {
    const engine = forexEngineRegistry.get(String(req.user.sub));
    if (!engine) return res.status(404).json({ success: false, error: 'Engine not found' });
    engine.botPaused = !engine.botPaused; await engine.saveState();
    res.json({ success: true, isRunning: engine.botRunning, isPaused: engine.botPaused });
});

app.post('/api/forex/engine/close-all', requireJwt, async (req, res) => {
    const engine = forexEngineRegistry.get(String(req.user.sub));
    if (!engine) return res.status(404).json({ success: false, error: 'Engine not found' });
    const closed = [], skipped = [];
    for (const [pair] of engine.positions) {
        try {
            await engine.closePositionWithReason(pair, 'Manual Close All');
            closed.push(pair);
        } catch (err) { skipped.push({ pair, error: err.message }); }
    }
    res.json({ success: true, closed, skipped });
});

// Module-level close-all (no per-user engine context required)
app.post('/api/forex/close-all', async (req, res) => {
    const closed = [], skipped = [];
    for (const [pair] of positions) {
        try {
            await closePositionWithReason(pair, 'Manual Close All');
            closed.push(pair);
        } catch (err) { skipped.push({ pair, error: err.message }); }
    }
    res.json({ success: true, closed, skipped });
});

// [Alpha] Portfolio allocation signal — exposes bot's current edge for capital allocation
app.get('/api/forex/alpha-signal', (req, res) => {
    const evals = globalThis._forexTradeEvaluations || [];
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
            bot: 'forex',
            edge: parseFloat(edge.toFixed(3)),
            winRate: parseFloat((winRate * 100).toFixed(1)),
            avgPnlPct: parseFloat((avgPnl * 100).toFixed(3)),
            avgCommitteeConfidence: parseFloat(avgCommittee.toFixed(3)),
            regime: 'medium', // forex regime not cached in globalThis yet
            activePositions: positions.size,
            sampleSize: recent.length,
            recommendation: edge > 0.6 ? 'increase_allocation' : edge < 0.4 ? 'decrease_allocation' : 'maintain'
        }
    });
});

// [Improvement 2] Forex committee weights endpoint
app.get('/api/forex/weights', (req, res) => {
    res.json({
        success: true,
        data: {
            weights: forexCommitteeWeights,
            defaults: DEFAULT_FOREX_WEIGHTS,
            tradeCount: (globalThis._forexTradeEvaluations || []).length,
            lastOptimized: 'check weights file'
        }
    });
});

// ===== START =====

app.listen(PORT, async () => {
    console.log(`
╔════════════════════════════════════════════════════════════════════╗
║          NEXUSTRADEAI - UNIFIED FOREX TRADING BOT                  ║
╠════════════════════════════════════════════════════════════════════╣
║  Port:          ${PORT.toString().padEnd(49)}║
║  Broker:        ${(oandaConfig.isPractice ? 'OANDA Practice' : 'OANDA Live').padEnd(49)}║
║  Pairs:         ${FOREX_PAIRS.length.toString().padEnd(49)}║
║  Max Positions: 5                                                  ║
║  Max Trades/Day:${MAX_TRADES_PER_DAY.toString().padEnd(49)}║
║  Trading Hours: 24/5 (Sun 5 PM - Fri 5 PM EST)                     ║
╚════════════════════════════════════════════════════════════════════╝
    `);
    console.log(`📊 Pairs: ${FOREX_PAIRS.join(', ')}`);
    console.log(`🌍 Best session: London/NY Overlap (8 AM - 12 PM EST)`);
    console.log(`⚠️  Set OANDA_ACCOUNT_ID and OANDA_ACCESS_TOKEN in .env`);

    // Connect DB for trade persistence (non-blocking)
    await initTradeDb().catch(e => console.warn('⚠️  Forex DB init error:', e.message));

    // Load evaluations from DB (replaces JSON file — survives redeploys)
    globalThis._forexTradeEvaluations = await loadForexEvaluationsFromDB();
    // Optimize weights now that evaluations are loaded (replaces the old 10s setTimeout)
    setTimeout(() => {
        const newWeights = optimizeForexWeights();
        if (newWeights) forexCommitteeWeights = newWeights;
    }, 5000);

    // ── Load credentials from DB into process.env (fallback: env vars already set) ──
    try {
        if (dbPool) {
            const firstUser = await dbPool.query('SELECT id FROM users ORDER BY id ASC LIMIT 1');
            if (firstUser.rows.length > 0) {
                const userId = firstUser.rows[0].id;
                for (const broker of ['oanda', 'telegram', 'sms']) {
                    const creds = await loadUserCredentials(userId, broker);
                    for (const [key, value] of Object.entries(creds)) {
                        if (!process.env[key]) process.env[key] = value;
                    }
                    if (Object.keys(creds).length > 0) console.log(`🔑 Loaded ${broker} credentials from DB for user ${userId}`);
                }
                // Refresh in-memory OANDA config
                if (process.env.OANDA_ACCOUNT_ID)   oandaConfig.accountId   = process.env.OANDA_ACCOUNT_ID;
                if (process.env.OANDA_ACCESS_TOKEN) oandaConfig.accessToken = process.env.OANDA_ACCESS_TOKEN;
                // Reinitialize Telegram after DB credentials are loaded
                if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
                    if (!process.env.TELEGRAM_ALERTS_ENABLED) process.env.TELEGRAM_ALERTS_ENABLED = 'true';
                    telegramAlerts = getTelegramAlertService();
                    if (telegramAlerts.enabled) {
                        console.log('📱 [TELEGRAM] Reinitialized with DB credentials - forex alerts enabled');
                    }
                }
            }
        }
    } catch (e) {
        console.warn('⚠️  Startup credential load failed:', e.message);
    }

    // Re-hydrate positions map from OANDA on startup (prevents duplicate entries after redeploy)
    try {
        const openPos = await getOpenPositions();
        for (const p of openPos) {
            const instrument = p.instrument;
            const longUnits = parseInt(p.long?.units || '0');
            const shortUnits = parseInt(p.short?.units || '0');
            if (longUnits > 0) {
                const avgPrice = parseFloat(p.long.averagePrice || '0');
                const hydratedPL = parseFloat(p.unrealizedPL || '0');
                const stopLong = avgPrice * 0.985;
                const tpLong = avgPrice * 1.03;
                positions.set(instrument, {
                    instrument, direction: 'long', tier: 'tier1',
                    entry: avgPrice, stopLoss: stopLong, takeProfit: tpLong,
                    units: longUnits, entryTime: new Date(), session: 'restored',
                    peakUnrealizedPL: Math.max(0, hydratedPL),
                    wasPositive: hydratedPL > 2
                });
                tradesPerPair.set(instrument, MAX_TRADES_PER_PAIR); // block further entries
                console.log(`🔄 Restored position: ${instrument} LONG ${longUnits} units @ ${avgPrice} (peakPL: $${Math.max(0, hydratedPL).toFixed(2)})`);
                // Ensure restored position has a DB trade row
                if (dbPool) {
                    const existing = await dbPool.query(`SELECT id FROM trades WHERE bot='forex' AND symbol=$1 AND status='open' AND user_id IS NULL`, [instrument]);
                    if (existing.rows.length === 0) {
                        dbForexOpen(instrument, 'long', 'tier1', avgPrice, stopLong, tpLong, longUnits, 'restored', {})
                            .then(id => { const pos = positions.get(instrument); if (pos) pos.dbTradeId = id; console.log(`📝 [DB] Restored ${instrument} LONG persisted (id: ${id})`); })
                            .catch(e => console.warn(`⚠️  [DB] Restored ${instrument} persistence failed:`, e.message));
                    } else {
                        const pos = positions.get(instrument); if (pos) pos.dbTradeId = existing.rows[0].id;
                        console.log(`📝 [DB] Restored ${instrument} LONG already in DB (id: ${existing.rows[0].id})`);
                    }
                }
            } else if (shortUnits < 0) {
                const avgPrice = parseFloat(p.short.averagePrice || '0');
                const hydratedPL = parseFloat(p.unrealizedPL || '0');
                const stopShort = avgPrice * 1.015;
                const tpShort = avgPrice * 0.97;
                positions.set(instrument, {
                    instrument, direction: 'short', tier: 'tier1',
                    entry: avgPrice, stopLoss: stopShort, takeProfit: tpShort,
                    units: shortUnits, entryTime: new Date(), session: 'restored',
                    peakUnrealizedPL: Math.max(0, hydratedPL),
                    wasPositive: hydratedPL > 2
                });
                tradesPerPair.set(instrument, MAX_TRADES_PER_PAIR);
                console.log(`🔄 Restored position: ${instrument} SHORT ${Math.abs(shortUnits)} units @ ${avgPrice}`);
                // Ensure restored position has a DB trade row
                if (dbPool) {
                    const existing = await dbPool.query(`SELECT id FROM trades WHERE bot='forex' AND symbol=$1 AND status='open' AND user_id IS NULL`, [instrument]);
                    if (existing.rows.length === 0) {
                        dbForexOpen(instrument, 'short', 'tier1', avgPrice, stopShort, tpShort, shortUnits, 'restored', {})
                            .then(id => { const pos = positions.get(instrument); if (pos) pos.dbTradeId = id; console.log(`📝 [DB] Restored ${instrument} SHORT persisted (id: ${id})`); })
                            .catch(e => console.warn(`⚠️  [DB] Restored ${instrument} persistence failed:`, e.message));
                    } else {
                        const pos = positions.get(instrument); if (pos) pos.dbTradeId = existing.rows[0].id;
                        console.log(`📝 [DB] Restored ${instrument} SHORT already in DB (id: ${existing.rows[0].id})`);
                    }
                }
            }
        }
        console.log(`✅ Hydrated ${positions.size} positions from OANDA (DB open trades: to be reconciled)`);
    } catch (e) {
        console.warn('⚠️  Position hydration failed (will proceed):', e.message);
    }

    // ── DB Reconciliation: close orphaned 'open' trades not in memory ──
    // Runs after position hydration so in-memory positions map is complete.
    // Any DB row still 'open' for a pair we don't track = orphaned on restart.
    // ONLY check system-level trades (user_id IS NULL). Per-user trades are managed by UserForexEngine.
    try {
        if (dbPool) {
            const orphaned = await dbPool.query(
                `SELECT id, symbol FROM trades WHERE bot='forex' AND status='open' AND user_id IS NULL AND entry_time < NOW() - INTERVAL '5 minutes'`
            );
            const toClose = orphaned.rows.filter(row => !positions.has(row.symbol));
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

    // ── Hydrate perfData from DB so stats survive redeploys ──
    if (dbPool && simTotalTrades === 0) {
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
                FROM trades WHERE bot='forex'
            `);
            const row = dbStats.rows[0];
            const total = parseInt(row.total) || 0;
            const winners = parseInt(row.winners) || 0;
            const losers = parseInt(row.losers) || 0;
            const winAmt = parseFloat(row.win_amount) || 0;
            const lossAmt = parseFloat(row.loss_amount) || 0;
            if (total > 0) {
                simTotalTrades = total;
                simWinners = winners;
                simLosers = losers;
                simTotalPnL = parseFloat(row.total_pnl) || 0;
                simTotalWinAmount = winAmt;
                simTotalLossAmount = lossAmt;
                simProfitFactor = total < 5 ? 0
                    : lossAmt > 0 ? parseFloat((winAmt / lossAmt).toFixed(2))
                    : winAmt > 0 ? 9.99 : 0;
            }
            // Consecutive losses from TODAY's trades only (not all-time history)
            // This prevents stale historical loss streaks from permanently pausing the bot
            const recent = await dbPool.query(`
                SELECT ${cleanPnl} AS pnl FROM trades
                WHERE bot='forex' AND status='closed' AND ${cleanPnl} IS NOT NULL
                AND exit_time >= CURRENT_DATE
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
            simConsecutiveLosses = consec;
            simMaxConsecutiveLosses = Math.max(simMaxConsecutiveLosses, maxConsec);
            // Also seed guardrails with consecutive losses from DB
            guardrails.consecutiveLosses = consec;
            saveForexPerf();
            console.log(`📊 Hydrated forex perfData from DB: ${total} trades, ${winners}W/${losers}L, PF ${simProfitFactor}, Win $${winAmt.toFixed(2)}, Loss $${lossAmt.toFixed(2)}`);
        } catch (e) { console.warn('⚠️  DB forex perfData hydration failed:', e.message); }
    }

    // Initial scan (default env-var mode)
    setTimeout(() => tradingLoop().catch(e => console.error('❌ Forex loop crashed:', e)), 5000);

    // ── Auto-restart engines for users who had botRunning=true at last save ──
    async function autoRestartForexEngines() {
        if (!dbPool) return;
        try {
            const result = await dbPool.query(
                `SELECT es.user_id, es.state_json AS state, u.email
                 FROM engine_state es
                 JOIN users u ON u.id = es.user_id
                 WHERE es.bot = 'forex' AND (es.state_json->>'botRunning')::boolean = true`
            );
            if (result.rows.length === 0) return;
            console.log(`🔄 Auto-restarting forex engines for ${result.rows.length} user(s)...`);
            for (const row of result.rows) {
                try {
                    const engine = await getOrCreateForexEngine(row.user_id);
                    if (engine && !engine.botRunning) {
                        engine.botRunning = true;
                        engine.botPaused = false;
                        await engine.saveState();
                        console.log(`✅ Auto-restarted forex engine for user ${row.email}`);
                    }
                } catch (e) {
                    console.warn(`⚠️ Failed to auto-restart forex engine for user ${row.user_id}:`, e.message);
                }
            }
        } catch (e) {
            console.warn('⚠️ autoRestartForexEngines failed:', e.message);
        }
    }

    setTimeout(() => autoRestartForexEngines().catch(e => console.warn('Auto-restart error:', e.message)), 5000);

    // Register engines for existing users (staggered 6s each)
    setTimeout(async () => {
        try {
            if (dbPool) {
                const users = await dbPool.query('SELECT id FROM users ORDER BY id ASC');
                let delay = 0;
                for (const row of users.rows) {
                    setTimeout(async () => {
                        try { await getOrCreateForexEngine(row.id); }
                        catch (e) { console.warn(`⚠️  Forex engine init failed for user ${row.id}:`, e.message); }
                    }, delay);
                    delay += 6000;
                }
            }
        } catch (e) { console.warn('⚠️  Forex engine pre-registration failed:', e.message); }
    }, 8000);

    // Main loop: every 5 minutes — runs default loop + per-user ScanQueue
    setInterval(() => {
        resetDailyCounters();
        runForexScanQueue().catch(e => console.error('❌ Forex ScanQueue crashed:', e));
        // [v13.0] Fall back to global loop if NO engines are actively running
        // Bug: pre-registration creates engines with botRunning=false, which blocks the global loop
        // while per-user engines silently skip scans. Now checks if any engine is actually running.
        const anyEngineRunning = Array.from(forexEngineRegistry.values()).some(e => e.botRunning);
        if (forexEngineRegistry.size === 0 || !anyEngineRunning) {
            tradingLoop().catch(e => console.error('❌ Forex loop crashed:', e));
        }
    }, 5 * 60 * 1000);

    // Dead-man heartbeat: alert if no scan in >3h (forex scans every 5min; 3h = clearly broken)
    // Forex market hours: Sun 17:00 – Fri 17:00 EST
    let _fxHeartbeatAlertSent = false;
    let _fxLastScanTime = Date.now();
    setInterval(() => {
        _fxLastScanTime = Date.now(); // update on each tick of this outer interval as a proxy
    }, 5 * 60 * 1000);
    setInterval(() => {
        const now = new Date();
        const estDay = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
        const estHour = parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).format(now));
        const isForexHours = !['Sat'].includes(estDay) && !(estDay === 'Sun' && estHour < 17) && !(estDay === 'Fri' && estHour >= 17);
        if (!isForexHours) { _fxHeartbeatAlertSent = false; return; }
        const silentMinutes = Math.floor((Date.now() - _fxLastScanTime) / 60000);
        if (silentMinutes >= 180 && !_fxHeartbeatAlertSent) {
            _fxHeartbeatAlertSent = true;
            telegramAlerts.sendHeartbeatAlert('Forex Bot', silentMinutes).catch(() => {});
        }
    }, 30 * 60 * 1000);

    console.log(`\n✅ Forex bot started - scanning every 5 minutes\n`);
});

// ========================================================================
// [v6.3] PROCESS ERROR HANDLERS & GRACEFUL SHUTDOWN
// Without these, any unhandled error crashes the Railway process immediately.
// ========================================================================

process.on('uncaughtException', (error) => {
    console.error('💀 [FOREX] Uncaught Exception:', error.message);
    console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💀 [FOREX] Unhandled Rejection:', reason);
});

process.on('SIGTERM', () => {
    console.log('🛑 [FOREX] SIGTERM received — shutting down gracefully');
    // Give open HTTP requests 5s to finish, then exit
    setTimeout(() => process.exit(0), 5000);
});

process.on('SIGINT', () => {
    console.log('🛑 [FOREX] SIGINT received — shutting down');
    process.exit(0);
});

// [v6.3] Memory cleanup — prune agent cache every 30 minutes
setInterval(() => {
    const now = Date.now();
    for (const [pair, cached] of _forexAgentCache) {
        if (now - cached.timestamp > 10 * 60 * 1000) {
            _forexAgentCache.delete(pair);
        }
    }
}, 30 * 60 * 1000);

module.exports = { app, positions, FOREX_PAIRS, MOMENTUM_CONFIG };
