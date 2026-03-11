const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { createUserCredentialStore } = require('./userCredentialStore');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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
            macdHistogram: signal.macdHistogram ?? null
        }
    };
}

async function dbForexOpen(pair, direction, tier, entry, stopLoss, takeProfit, units, session, signal = {}) {
    if (!dbPool) return null;
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
    try {
        await dbPool.query(
            `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,
             exit_time=NOW(),close_reason=$4 WHERE id=$5`,
            [exitPrice, pnlUsd, pnlPct, reason, id]
        );
    } catch (e) { console.warn('DB forex close failed:', e.message); }
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
const telegramAlerts = getTelegramAlertService();

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
const tradesPerPair = new Map();
let totalTradesToday = 0;
let scanCount = 0;
let lastScanTime = null;
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

// ===== FOREX PERFORMANCE PERSISTENCE =====
const fs = require('fs');
const FOREX_PERF_FILE = path.join(__dirname, 'data/forex-performance.json');

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
            lastUpdate: new Date().toISOString()
        }));
    } catch {}
}

// Load on startup
loadForexPerf();

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
const MIN_SIGNAL_CONFIDENCE = parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.74');
const MIN_SIGNAL_SCORE = parseFloat(process.env.MIN_SIGNAL_SCORE || '0.74');
const MIN_REWARD_RISK = parseFloat(process.env.MIN_REWARD_RISK || '2.1');
const MAX_SIGNALS_PER_CYCLE = parseInt(process.env.MAX_SIGNALS_PER_CYCLE || '1');
const MAX_CONSECUTIVE_LOSSES = parseInt(process.env.MAX_CONSECUTIVE_LOSSES || '3');
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

    // Dynamic profit targets (forex has tighter ranges)
    profitTargetByDay: {
        0: 0.025,  // Day 0-1: 2.5% (250 pips on EUR/USD)
        1: 0.025,
        2: 0.02,   // Day 2-3: 2%
        3: 0.015,  // Day 3-4: 1.5%
        4: 0.01,   // Day 4-5: 1%
        5: 0.005   // Day 5+: 0.5%
    },

    // Trailing stops (same as stock bot)
    trailingStopLevels: [
        { gainThreshold: 0.01, lockPercent: 0.50 },  // +1%: lock 50%
        { gainThreshold: 0.015, lockPercent: 0.65 }, // +1.5%: lock 65%
        { gainThreshold: 0.02, lockPercent: 0.75 },  // +2%: lock 75%
        { gainThreshold: 0.03, lockPercent: 0.85 },  // +3%: lock 85%
        { gainThreshold: 0.04, lockPercent: 0.92 }   // +4%: lock 92%
    ],

    // Momentum reversal
    momentumReversal: {
        rsiOverbought: 72,
        rsiOversold: 28,
        atrMultipleExit: 2.5  // Exit if price moves 2.5x ATR against
    }
};

// ===== TIERED MOMENTUM CONFIG (Forex) =====
const MOMENTUM_CONFIG = {
    tier1: {
        threshold: 0.004,       // 0.4% (40 pips) — raised from 0.3% to filter noise
        rsiMax: 65,             // tightened from 70
        rsiMin: 35,             // tightened from 30
        positionSize: 0.008,    // 0.8% of account (cut from 1%)
        stopLoss: 0.02,         // 2.0%
        profitTarget: 0.04,     // 4% (2:1 R/R)
        maxPositions: 3         // reduced from 4
    },
    tier2: {
        threshold: 0.006,       // 0.6% (60 pips) — raised from 0.5%
        rsiMax: 68,             // tightened from 72
        rsiMin: 32,             // tightened from 28
        positionSize: 0.012,    // 1.2% (cut from 1.5%)
        stopLoss: 0.02,         // 2%
        profitTarget: 0.045,    // 4.5% (2.25:1 R/R)
        maxPositions: 2
    },
    tier3: {
        threshold: 0.010,       // 1.0% (100 pips) — raised from 0.8% to require real moves
        rsiMax: 72,             // tightened from 75
        rsiMin: 28,             // tightened from 25
        positionSize: 0.015,    // 1.5% (cut from 2%)
        stopLoss: 0.025,        // 2.5%
        profitTarget: 0.06,     // 6% (2.4:1 R/R)
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
    // [v3.9] Tighter RSI sweet spots matching new entry bounds
    const rsiSweetSpot = direction === 'long'
        ? (rsi >= 45 && rsi <= 58 ? 1.12 : 1.0)
        : (rsi >= 42 && rsi <= 55 ? 1.12 : 1.0);
    const macdStrength = macd ? Math.min(Math.abs(macd.histogram) * 100000, 3) : 1;

    return parseFloat(
        (tierWeight * sessionWeight * (trendStrength * 1000) * pullbackQuality * rsiSweetSpot + macdStrength)
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

    if (trendStrength >= (MOMENTUM_CONFIG[tier]?.threshold || MOMENTUM_CONFIG.tier1.threshold) * 1.15) quality *= 1.08;
    else if (trendStrength < (MOMENTUM_CONFIG[tier]?.threshold || MOMENTUM_CONFIG.tier1.threshold)) quality *= 0.9;

    // [v3.9] Tighter regime RSI bands
    const rsiSweetSpot = direction === 'long'
        ? (rsi >= 45 && rsi <= 58)
        : (rsi >= 42 && rsi <= 55);
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
        tradable: quality >= 0.92,
        regime,
        quality: parseFloat(quality.toFixed(3))
    };
}

function getForexAtrExitReason(position, currentPrice) {
    const atrPct = parseFloat(position?.atrPct || 0);
    if (!atrPct || !currentPrice || !position?.entry) return null;
    const adverseMovePct = position.direction === 'long'
        ? (position.entry - currentPrice) / position.entry
        : (currentPrice - position.entry) / position.entry;
    if (adverseMovePct >= atrPct * EXIT_CONFIG.momentumReversal.atrMultipleExit) {
        return `ATR adverse exit (${(adverseMovePct * 100).toFixed(2)}%)`;
    }
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
    // Check stop-out cooldown (dynamic: 30min for small losses, 2h for large)
    const stopEntry = stoppedOutPairs.get(pair);
    if (stopEntry) {
        const { time, cooldownMs } = typeof stopEntry === 'object' ? stopEntry : { time: stopEntry, cooldownMs: MIN_TIME_AFTER_STOP };
        if (Date.now() - time < cooldownMs) {
            const minsLeft = Math.ceil((cooldownMs - (Date.now() - time)) / 60000);
            return { allowed: false, reason: `Stop-out cooldown (${minsLeft}m left)` };
        }
    }

    // Check daily limit
    if (totalTradesToday >= MAX_TRADES_PER_DAY) {
        return { allowed: false, reason: `Daily limit (${MAX_TRADES_PER_DAY})` };
    }

    // Check per-pair limit
    const pairTrades = tradesPerPair.get(pair) || 0;
    if (pairTrades >= MAX_TRADES_PER_PAIR) {
        return { allowed: false, reason: `Pair limit (${MAX_TRADES_PER_PAIR})` };
    }

    // Check time between trades
    const recent = recentTrades.get(pair) || [];
    if (recent.length > 0) {
        const lastTrade = recent[recent.length - 1];
        const timeSince = Date.now() - lastTrade.time;
        if (timeSince < MIN_TIME_BETWEEN_TRADES) {
            const minsLeft = Math.ceil((MIN_TIME_BETWEEN_TRADES - timeSince) / 60000);
            return { allowed: false, reason: `Cooldown (${minsLeft} min)` };
        }
    }

    // Check correlation
    const correlatedPositions = getCorrelatedPositions(pair, direction);
    if (correlatedPositions.length >= 2) {
        return { allowed: false, reason: 'Correlation limit' };
    }

    return { allowed: true };
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
    return await oandaRequest('put', `/v3/accounts/${oandaConfig.accountId}/positions/${instrument}/close`, {
        longUnits: 'ALL',
        shortUnits: 'ALL'
    });
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

// [v3.2] H1 Trend Filter — only trade M15 signals that align with H1 direction
async function getH1Trend(pair) {
    try {
        const h1Candles = await getCandles(pair, 'H1', 30);
        if (h1Candles.length < 22) return 'neutral';
        const closes = h1Candles.map(c => parseFloat(c.mid.c));
        const period = 20;
        const sma20 = closes.slice(-period).reduce((a, b) => a + b, 0) / period;
        const last3 = closes.slice(-3);
        // Majority rule: 2-of-3 closes above/below SMA20 + slope confirms direction.
        // Requiring ALL 3 is too strict — a single hourly dip during a clear uptrend
        // would mark the pair 'neutral' and block a valid LONG signal.
        const aboveCount = last3.filter(c => c > sma20).length;
        const belowCount = last3.filter(c => c < sma20).length;
        const risingSlope = last3[2] > last3[0];
        if (aboveCount >= 2 && risingSlope) return 'up';
        if (belowCount >= 2 && !risingSlope) return 'down';
        return 'neutral';
    } catch (e) {
        console.warn(`[H1 Trend] ${pair}: ${e.message}`);
        return 'neutral';
    }
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

async function queryAIAdvisor(signal) {
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
        };
        await axios.post(`${BRIDGE_URL}/agent/trade-outcome`, payload, { timeout: 5000 });
        console.log(`[Learn] ${position.pair} outcome reported: ${pnl > 0 ? 'WIN' : 'LOSS'} ${(pnlPct * 100).toFixed(2)}%`);
    } catch (e) {
        // Non-blocking
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
                console.log(`🔒 ${position.instrument}: Trailing stop raised to ${newStop.toFixed(5)} (locking ${(level.lockPercent * 100).toFixed(0)}% of +${(gainPct * 100).toFixed(2)}%)`);
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
    if (candles.length < 50) return null;

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
    const trendStrength = Math.abs(currentPrice - sma50) / sma50;
    const pullback = sma10 > 0 ? Math.abs(currentPrice - sma10) / sma10 : 0;

    // [v3.2] Entry candle direction — last completed M15 candle must align with signal
    const lastCandle = candles[candles.length - 1];
    const lastCandleBullish = parseFloat(lastCandle.mid.c) > parseFloat(lastCandle.mid.o);
    const lastCandleBearish = parseFloat(lastCandle.mid.c) < parseFloat(lastCandle.mid.o);

    // [v3.4] MACD(12,26,9) confirmation — momentum must be accelerating in signal direction
    const macd = calculateMACDForex(candles);

    return {
        pair, currentPrice, sma10, sma20, sma50, rsi, atr,
        atrPct, bb, macd, pullback,
        isUptrend, isDowntrend, trendStrength,
        lastCandleBullish, lastCandleBearish
    };
}

async function scanForSignals(heldPositions = positions) {
    const signals = [];
    const session = getCurrentSession();

    // [v3.9] Only enter during London or London/NY Overlap — highest-quality setups
    // Tokyo, Sydney, standalone NY, and off-peak are now blocked for new entries
    const allowedSessions = ['London', 'London/NY Overlap'];
    if (!allowedSessions.includes(session.name)) {
        console.log(`⏸️ ${session.name} — restricted to London/Overlap only, skipping new entries`);
        return signals;
    }

    // [v3.4] Parallelize M15 analysis + H1 trend fetch for all pairs simultaneously
    // Previously sequential (~2s × 12 pairs = 24s lag); now concurrent (~2-3s total)
    const tradablePairs = FOREX_PAIRS.filter(pair => !heldPositions.has(pair) && canTrade(pair).allowed);

    const pairResults = await Promise.allSettled(
        tradablePairs.map(async pair => {
            const [analysis, h1Trend] = await Promise.all([
                analyzePair(pair),
                getH1Trend(pair)
            ]);
            return { pair, analysis, h1Trend };
        })
    );

    for (const result of pairResults) {
        if (result.status === 'rejected' || !result.value.analysis) continue;

        const { pair, analysis, h1Trend } = result.value;
        const {
            currentPrice, rsi, isUptrend, isDowntrend, trendStrength,
            atrPct, bb, macd, pullback, lastCandleBullish, lastCandleBearish
        } = analysis;

        // Determine tier
        let tier = null;
        if (trendStrength >= MOMENTUM_CONFIG.tier3.threshold) tier = 'tier3';
        else if (trendStrength >= MOMENTUM_CONFIG.tier2.threshold) tier = 'tier2';
        else if (trendStrength >= MOMENTUM_CONFIG.tier1.threshold) tier = 'tier1';
        if (!tier) continue;

        const config = MOMENTUM_CONFIG[tier];
        const maxPullback = FOREX_PULLBACK_CONFIG[tier] || FOREX_PULLBACK_CONFIG.tier1;
        const tierPositions = Array.from(positions.values()).filter(p => p.tier === tier).length;
        if (tierPositions >= config.maxPositions) continue;
        if (pullback > maxPullback) {
            console.log(`[Pullback Filter] ${pair} skipped — extended ${ (pullback * 100).toFixed(2)}% from M15 trend anchor (max ${(maxPullback * 100).toFixed(2)}%)`);
            continue;
        }

        // [v3.9] Require real pullback — reject pure trend continuations that catch tops/bottoms
        const minPullbackRatio = 0.20; // Must have retraced at least 20% of the move
        if (maxPullback > 0 && pullback < maxPullback * minPullbackRatio) {
            console.log(`[Pullback Depth] ${pair} skipped — pullback ${(pullback * 100).toFixed(2)}% < ${(maxPullback * minPullbackRatio * 100).toFixed(2)}% min (${(minPullbackRatio * 100).toFixed(0)}% of max)`);
            continue;
        }

        // [v3.9] ATR noise cap — skip choppy/volatile pairs where stops get hunted
        const MAX_ATR_PCT = 0.012; // 1.2% — pairs above this are too noisy for reliable signals
        if (atrPct > MAX_ATR_PCT) {
            console.log(`[ATR Cap] ${pair} skipped — ATR ${(atrPct * 100).toFixed(2)}% > ${(MAX_ATR_PCT * 100).toFixed(1)}% cap (too volatile)`);
            continue;
        }

        // [v3.9] Minimum trend strength — require stronger directional conviction
        const MIN_TREND_STRENGTH = MOMENTUM_CONFIG[tier].threshold * 1.15;
        if (trendStrength < MIN_TREND_STRENGTH) {
            console.log(`[Trend Strength] ${pair} skipped — strength ${(trendStrength * 100).toFixed(2)}% < ${(MIN_TREND_STRENGTH * 100).toFixed(2)}% min for ${tier}`);
            continue;
        }

        // [v6.1] ATR-based stops/targets — adapts to each pair's volatility
        // v3.2 had 2.0x ATR for BOTH stop and target (1:1 R:R) → 0% win rate.
        // Fix: 2.5x ATR stop (wider to avoid noise sweep) + 5.0x ATR target (2:1 R:R minimum)
        const atrStop   = atrPct > 0 ? atrPct * 2.5 : config.stopLoss;
        const atrTarget = atrPct > 0 ? atrPct * 5.0 : config.profitTarget;

        // LONG Signal — [v6.1] tighter RSI: must be 45-65 (was 40-65; RSI 40-44 is noise)
        if (isUptrend && rsi < config.rsiMax && rsi >= 45) {
            if (h1Trend !== 'up') {
                console.log(`[H1 Filter] ${pair} LONG skipped — H1 trend is ${h1Trend}`);
                continue;
            }
            if (!lastCandleBullish) {
                console.log(`[Candle Filter] ${pair} LONG skipped — last candle not bullish`);
                continue;
            }
            if (bb && currentPrice < bb.middle) {
                console.log(`[BB Filter] ${pair} LONG skipped — below BB midline ${bb.middle.toFixed(5)}`);
                continue;
            }
            // [v3.4] MACD confirmation — only enter when momentum is accelerating bullishly
            if (macd !== null && !macd.bullish) {
                console.log(`[MACD Filter] ${pair} LONG skipped — MACD histogram not bullish/rising (${macd.histogram.toFixed(6)})`);
                continue;
            }
            // [v3.3] Strategy Bridge advisory — only block if bridge explicitly signals SHORT with high confidence
            const bridgeLong = await queryStrategyBridge(pair, 'long');
            if (bridgeLong !== null && bridgeLong.direction === 'short' && bridgeLong.confidence > 0.7) {
                console.log(`[Bridge] ${pair} LONG rejected — bridge explicit SHORT conf:${bridgeLong.confidence.toFixed(2)}`);
                // fall through to SHORT check
            } else {
                if (bridgeLong !== null) {
                    console.log(`[Bridge] ${pair} LONG advisory: ${bridgeLong.direction} conf:${(bridgeLong.confidence || 0).toFixed(2)}`);
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
                const strategy = pullback >= maxPullback * 0.55 ? 'pullbackContinuation' : 'trendContinuation';
                // Data: pullbackContinuation = 0% WR, -$308 across 5 trades. Block it.
                if (strategy === 'pullbackContinuation') {
                    console.log(`[Strategy Block] ${pair} LONG skipped — pullbackContinuation disabled (0% WR)`);
                    continue;
                }
                signals.push({
                    pair, direction: 'long', tier,
                    entry: currentPrice,
                    stopLoss:   currentPrice * (1 - atrStop),
                    takeProfit: currentPrice * (1 + atrTarget),
                    rsi, trendStrength, atrPct, h1Trend, pullback,
                    score: parseFloat((score * regimeProfile.quality).toFixed(3)),
                    strategy,
                    regime: regimeProfile.regime,
                    regimeQuality: regimeProfile.quality,
                    macdHistogram: macd ? macd.histogram : null,
                    session: session.name
                });
            }
        }

        // SHORT Signal — [v6.1] tighter RSI: must be 35-55 (was 35-60; RSI 56-60 is noise)
        if (isDowntrend && rsi > (100 - config.rsiMax) && rsi <= 55) {
            if (h1Trend !== 'down') {
                console.log(`[H1 Filter] ${pair} SHORT skipped — H1 trend is ${h1Trend}`);
                continue;
            }
            if (!lastCandleBearish) {
                console.log(`[Candle Filter] ${pair} SHORT skipped — last candle not bearish`);
                continue;
            }
            if (bb && currentPrice > bb.middle) {
                console.log(`[BB Filter] ${pair} SHORT skipped — above BB midline ${bb.middle.toFixed(5)}`);
                continue;
            }
            // [v3.4] MACD confirmation — only enter when momentum is accelerating bearishly
            if (macd !== null && !macd.bearish) {
                console.log(`[MACD Filter] ${pair} SHORT skipped — MACD histogram not bearish/falling (${macd.histogram.toFixed(6)})`);
                continue;
            }
            // [v3.3] Strategy Bridge advisory — only block if bridge explicitly signals LONG with high confidence
            const bridgeShort = await queryStrategyBridge(pair, 'short');
            if (bridgeShort !== null && bridgeShort.direction === 'long' && bridgeShort.confidence > 0.7) {
                console.log(`[Bridge] ${pair} SHORT rejected — bridge explicit LONG conf:${bridgeShort.confidence.toFixed(2)}`);
            } else {
                if (bridgeShort !== null) {
                    console.log(`[Bridge] ${pair} SHORT advisory: ${bridgeShort.direction} conf:${(bridgeShort.confidence || 0).toFixed(2)}`);
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
                const strategy = pullback >= maxPullback * 0.55 ? 'pullbackContinuation' : 'trendContinuation';
                if (strategy === 'pullbackContinuation') {
                    console.log(`[Strategy Block] ${pair} SHORT skipped — pullbackContinuation disabled (0% WR)`);
                    continue;
                }
                signals.push({
                    pair, direction: 'short', tier,
                    entry: currentPrice,
                    stopLoss:   currentPrice * (1 + atrStop),
                    takeProfit: currentPrice * (1 - atrTarget),
                    rsi, trendStrength, atrPct, h1Trend, pullback,
                    score: parseFloat((score * regimeProfile.quality).toFixed(3)),
                    strategy,
                    regime: regimeProfile.regime,
                    regimeQuality: regimeProfile.quality,
                    macdHistogram: macd ? macd.histogram : null,
                    session: session.name
                });
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
    const positionValue = balance * config.positionSize * sessionMultiplier;

    // [v3.9] Calculate units — reduced multiplier from 10000→7000 (smaller lots = smaller losses)
    let units = signal.direction === 'long'
        ? Math.floor(positionValue / effectiveEntry * 7000)
        : -Math.floor(positionValue / effectiveEntry * 7000);

    // [v4.7] Cap units via RISK_PER_TRADE — never risk more than 0.35% of equity per trade
    const stopDistPct = Math.abs(signal.entry - signal.stopLoss) / signal.entry;
    if (stopDistPct > 0) {
        const maxRiskUnits = Math.floor((balance * RISK_PER_TRADE) / (signal.entry * stopDistPct));
        if (Math.abs(units) > maxRiskUnits) {
            console.log(`   [RiskCap] Units capped: ${Math.abs(units)} → ${maxRiskUnits} (RISK_PER_TRADE=${RISK_PER_TRADE})`);
            units = signal.direction === 'long' ? maxRiskUnits : -maxRiskUnits;
        }
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
            atrPct: signal.atrPct
        });

        // Persist trade opening to DB (fire-and-forget)
        dbForexOpen(signal.pair, signal.direction, signal.tier, signal.entry, signal.stopLoss, signal.takeProfit, units, signal.session, signal)
            .then(id => { const p = positions.get(signal.pair); if (p) p.dbTradeId = id; })
            .catch(() => {});

        // Update tracking
        totalTradesToday++;
        tradesPerPair.set(signal.pair, (tradesPerPair.get(signal.pair) || 0) + 1);

        const trades = recentTrades.get(signal.pair) || [];
        trades.push({ time: Date.now(), side: signal.direction });
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

    console.log(`❌ ORDER FAILED: ${signal.pair}`);
    return false;
}

async function closePositionWithReason(pair, reason) {
    const pos = positions.get(pair);

    // Enhanced alert based on reason type
    if (reason.toLowerCase().includes('stop') || reason.toLowerCase().includes('loss')) {
        // STOP LOSS ALERT
        console.log('\n' + '🚨'.repeat(30));
        console.log('║                 FOREX STOP LOSS ALERT                 ║');
        console.log('🚨'.repeat(30));
        console.log(`📛 Pair: ${pair}`);
        console.log(`💰 Entry: ${pos?.entry?.toFixed(5) || 'N/A'}`);
        console.log(`🔻 Stop Loss Triggered`);
        console.log(`📉 Reason: ${reason}`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log('🚨'.repeat(30));

        // Send SMS Alert — fire-and-forget so network failure never blocks position close
        smsAlerts.sendForexStopLoss(pair, pos?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  SMS stop-loss alert failed: ${e.message}`));

        // Send Telegram Alert — fire-and-forget
        telegramAlerts.sendForexStopLoss(pair, pos?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  Telegram stop-loss alert failed: ${e.message}`));

    } else if (reason.toLowerCase().includes('target') || reason.toLowerCase().includes('profit')) {
        // TAKE PROFIT ALERT
        console.log('\n' + '🎯'.repeat(30));
        console.log('║              FOREX PROFIT TARGET HIT                  ║');
        console.log('🎯'.repeat(30));
        console.log(`💎 Pair: ${pair}`);
        console.log(`💰 Entry: ${pos?.entry?.toFixed(5) || 'N/A'}`);
        console.log(`🎯 Take Profit Hit`);
        console.log(`📈 Reason: ${reason}`);
        console.log(`⏰ Time: ${new Date().toLocaleString()}`);
        console.log('🎯'.repeat(30));

        // Send SMS Alert — fire-and-forget
        smsAlerts.sendForexTakeProfit(pair, pos?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  SMS take-profit alert failed: ${e.message}`));

        // Send Telegram Alert — fire-and-forget
        telegramAlerts.sendForexTakeProfit(pair, pos?.entry?.toFixed(5) || 'N/A', reason)
            .catch(e => console.warn(`⚠️  Telegram take-profit alert failed: ${e.message}`));

    } else {
        // TIME-BASED / OTHER EXITS — log and send alert
        const pos = positions.get(pair);
        const pnlPct = pos?.unrealizedPL && pos?.entry && pos?.units
            ? ((pos.unrealizedPL / (pos.entry * Math.abs(pos.units))) * 100).toFixed(2)
            : '?';
        console.log(`\n⏰ CLOSING ${pair}: ${reason} (P&L: ${pnlPct}%)`);

        telegramAlerts.send(
            `⏰ *FOREX TIME EXIT* — ${pair}\n` +
            `Reason: ${reason}\n` +
            `Entry: ${pos?.entry?.toFixed(5) ?? 'N/A'} → Current: ${pos?.currentPrice?.toFixed(5) ?? 'N/A'}\n` +
            `P&L: ${pnlPct}%`
        ).catch(e => console.warn(`⚠️  Telegram time-exit alert failed: ${e.message}`));
    }

    const result = await closePosition(pair);

    if (result) {
        // Update sim performance stats — use pos captured BEFORE closePosition() since
        // closePosition() deletes the entry from the Map
        simTotalTrades++;
        if (pos) {
            const isWin = reason.toLowerCase().includes('target') || reason.toLowerCase().includes('profit');
            const isLoss = reason.toLowerCase().includes('stop');
            if (isWin) simWinners++;
            else if (isLoss) simLosers++;
            // Update daily P&L so the circuit breaker has real data
            const tradePnL = pos.unrealizedPL ?? 0;
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

        // Persist close to DB — use unrealizedPL as proxy for exit PnL
        if (pos) {
            const exitPnl = pos.unrealizedPL ?? 0;
            const exitEntry = pos.entry ?? 0;
            const exitPct = exitEntry > 0 ? (exitPnl / (exitEntry * Math.abs(pos.units ?? 1))) * 100 : 0;
            const exitPrice = pos.currentPrice ?? exitEntry;
            dbForexClose(pos.dbTradeId, exitPrice, exitPnl, exitPct, reason).catch(() => {});
            // [v4.1] Report to Agentic AI learning loop — Scan AI pattern tracking
            reportForexTradeOutcome(pos, exitPrice, exitPnl, exitPct / 100, reason).catch(() => {});
            // [v4.6] Record outcome into adaptive guardrails
            guardrails.recordOutcome(exitPnl > 0);
        }

        positions.delete(pair);

        if (reason.toLowerCase().includes('stop')) {
            // Dynamic cooldown: small loss (<1%) → 30 min; large loss (>2%) → 2h
            const lossPct = pos ? Math.abs(pos.unrealizedPL ?? 0) / (parseFloat(pos.entry ?? 1) * Math.abs(pos.units ?? 1)) * 100 : 1;
            const cooldownMs = lossPct >= 2 ? MIN_TIME_AFTER_STOP : 30 * 60 * 1000;
            stoppedOutPairs.set(pair, { time: Date.now(), cooldownMs });
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

        const isLong = oandaPos.long?.units > 0;
        const units = Math.abs(parseInt(oandaPos.long?.units || oandaPos.short?.units || 0));
        const entryPrice = parseFloat(isLong ? oandaPos.long?.averagePrice : oandaPos.short?.averagePrice || 0);
        const unrealizedPL = parseFloat(oandaPos.unrealizedPL || 0);
        // Derive current price from unrealizedPL so trailing stops use real market movement
        const currentPrice = (entryPrice > 0 && units > 0)
            ? entryPrice + (isLong ? 1 : -1) * (unrealizedPL / units)
            : entryPrice;
        const holdDays = (Date.now() - new Date(localPos.entryTime).getTime()) / (1000 * 60 * 60 * 24);

        // Write live market values back so status endpoint returns them for demo positions
        localPos.currentPrice = currentPrice;
        localPos.unrealizedPL = unrealizedPL;

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

        const atrExitReason = getForexAtrExitReason(localPos, currentPrice);
        if (atrExitReason) {
            await closePositionWithReason(pair, atrExitReason);
            continue;
        }

        // Check time-based exit
        if (holdDays >= EXIT_CONFIG.stalePositionDays) {
            await closePositionWithReason(pair, `Stale position (${holdDays.toFixed(1)} days)`);
            continue;
        }

        // Check profit target by day
        const dayIndex = Math.min(Math.floor(holdDays), 5);
        const targetPct = EXIT_CONFIG.profitTargetByDay[dayIndex];
        // plPct = P/L as fraction of position notional value (entryPrice × units)
        const plPct = (entryPrice > 0 && units > 0) ? unrealizedPL / (entryPrice * units) : 0;

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
                    const exitPct   = exitEntry > 0 ? (realPnl / (exitEntry * exitUnits)) * 100 : 0;
                    const reason    = trade.closingTransactionIDs?.length
                        ? (realPnl < 0 ? 'Stop Loss' : 'Take Profit')
                        : 'Broker Closed';
                    dbForexClose(localPos.dbTradeId, exitPrice, realPnl, exitPct, reason).catch(() => {});
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

    console.log('\n' + '='.repeat(60));
    console.log(`[${lastScanTime.toISOString()}] FOREX SCAN #${scanCount}`);
    console.log('='.repeat(60));

    const session = getCurrentSession();
    console.log(`📊 Session: ${session.name} (${session.quality})`);
    console.log(`📈 Positions: ${positions.size} | Trades today: ${totalTradesToday}/${MAX_TRADES_PER_DAY}`);

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

        // Execute top signals
        const maxNewPositions = 5 - positions.size;
        const signalsToExecute = signals.slice(0, Math.min(maxNewPositions, MAX_SIGNALS_PER_CYCLE));

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
            if (signal.stopLoss && signal.takeProfit && signal.entry) {
                const rewardRisk = Math.abs(signal.takeProfit - signal.entry) / Math.abs(signal.entry - signal.stopLoss);
                if (rewardRisk < MIN_REWARD_RISK) {
                    console.log(`[Guardrail] ${signal.pair} BLOCKED — R:R ${rewardRisk.toFixed(2)} < ${MIN_REWARD_RISK}`);
                    continue;
                }
            }
            // Apply loss-adjusted position sizing
            if (guardrails.lossSizeMultiplier < 1.0) {
                signal.agentSizeMultiplier = (signal.agentSizeMultiplier || 1.0) * guardrails.lossSizeMultiplier;
                console.log(`[Guardrail] ${signal.pair} size cut to ${signal.agentSizeMultiplier.toFixed(2)}x (${guardrails.consecutiveLosses} consecutive losses)`);
            }
            await executeTrade(signal);
        }
    } catch (err) {
        console.error('❌ Forex trading loop error:', err.message);
    }
}

// Reset daily counters at midnight UTC
function resetDailyCounters() {
    const now = new Date();
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
        totalTradesToday = 0;
        tradesPerPair.clear();
        stoppedOutPairs.clear();
        simDailyPnL = 0;
        lastEquity = null; // reset daily baseline for LIVE mode too
        guardrails.resetDaily();
        console.log('🔄 Daily counters reset');
    }
}

// ===== API ROUTES =====

app.get('/health', (req, res) => {
    const memoryReport = memoryManager.getReport();
    res.json({
        status: 'ok',
        bot: 'unified-forex-bot',
        memory: {
            heapUsedMB: memoryReport.heap.used,
            heapLimitMB: memoryReport.heap.limit,
            usagePercent: (memoryReport.heap.used / memoryReport.heap.limit * 100).toFixed(1)
        },
        uptime: process.uptime()
    });
});

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
            const isLong = pos.long?.units > 0;
            const units = Math.abs(parseInt(pos.long?.units || pos.short?.units || 0));
            const entryPrice = parseFloat(isLong ? pos.long?.averagePrice : pos.short?.averagePrice || 0);
            const unrealizedPL = parseFloat(pos.unrealizedPL || 0);
            // Derive approximate current price from unrealized P/L
            // For long:  currentPrice = entryPrice + (unrealizedPL / units)
            // For short: currentPrice = entryPrice - (unrealizedPL / units)
            const currentPrice = (entryPrice > 0 && units > 0)
                ? entryPrice + (isLong ? 1 : -1) * (unrealizedPL / units)
                : entryPrice;
            const unrealizedPLPct = (entryPrice > 0 && units > 0)
                ? unrealizedPL / (entryPrice * units)
                : 0;
            return {
                symbol: pos.instrument,
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
        this.lastResetDate = new Date().toUTCDate ? new Date().toUTCString().slice(0, 16) : new Date().toDateString();
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
        return await this.oandaReq('put', `/v3/accounts/${this.oandaConfig.accountId}/positions/${instrument}/close`,
            { longUnits: 'ALL', shortUnits: 'ALL' });
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
        try {
            await dbPool.query(
                `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,exit_time=NOW(),close_reason=$4 WHERE id=$5`,
                [exitPrice, pnlUsd, pnlPct, reason, id]
            );
        } catch (e) { console.warn('DB forex close failed:', e.message); }
    }

    canTrade(pair, direction) {
        const stopTime = this.stoppedOutPairs.get(pair);
        if (stopTime && Date.now() - stopTime < 60 * 60 * 1000) return false;
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
            const exitPct = exitEntry > 0 ? (exitPnl / (exitEntry * Math.abs(pos.units ?? 1))) * 100 : 0;
            const exitPrice = pos.currentPrice ?? exitEntry;
            this.dbForexClose(pos.dbTradeId, exitPrice, exitPnl, exitPct, reason).catch(() => {});
        }
        await this.closeOandaPosition(pair);
        if (reason.toLowerCase().includes('stop')) this.stoppedOutPairs.set(pair, Date.now());
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
                        const exitPct   = exitEntry > 0 ? (realPnl / (exitEntry * Math.abs(localPos.units ?? 1))) * 100 : 0;
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
            const unrealizedPL = parseFloat(isLong ? p.long?.unrealizedPL : p.short?.unrealizedPL) || 0;
            const currentPrice = parseFloat(isLong ? p.long?.averagePrice : p.short?.averagePrice) || position.entry;
            position.unrealizedPL = unrealizedPL;
            position.currentPrice = currentPrice;
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
        const positionValue = balance * config.positionSize * sessionMultiplier;
        const units = signal.direction === 'long'
            ? Math.floor(positionValue / effectiveEntry * 7000)
            : -Math.floor(positionValue / effectiveEntry * 7000);
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
        const maxNewPos = 5 - this.positions.size;
        for (const signal of signals.slice(0, Math.min(maxNewPos, MAX_SIGNALS_PER_CYCLE))) {
            if (!this.positions.has(signal.pair) && this.canTrade(signal.pair, signal.direction)) {
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
        for (const engine of forexEngineRegistry.values()) {
            try { await engine.tradingLoop(); }
            catch (e) { console.error(`❌ [ForexQueue] Engine ${engine.userId} crashed:`, e.message); }
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
                positions.set(instrument, {
                    instrument, direction: 'long', tier: 'tier1',
                    entry: avgPrice, stopLoss: avgPrice * 0.985, takeProfit: avgPrice * 1.03,
                    units: longUnits, entryTime: new Date(), session: 'restored'
                });
                tradesPerPair.set(instrument, MAX_TRADES_PER_PAIR); // block further entries
                console.log(`🔄 Restored position: ${instrument} LONG ${longUnits} units @ ${avgPrice}`);
            } else if (shortUnits < 0) {
                const avgPrice = parseFloat(p.short.averagePrice || '0');
                positions.set(instrument, {
                    instrument, direction: 'short', tier: 'tier1',
                    entry: avgPrice, stopLoss: avgPrice * 1.015, takeProfit: avgPrice * 0.97,
                    units: shortUnits, entryTime: new Date(), session: 'restored'
                });
                tradesPerPair.set(instrument, MAX_TRADES_PER_PAIR);
                console.log(`🔄 Restored position: ${instrument} SHORT ${Math.abs(shortUnits)} units @ ${avgPrice}`);
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
            // Consecutive losses from most recent trades
            const recent = await dbPool.query(`
                SELECT ${cleanPnl} AS pnl FROM trades
                WHERE bot='forex' AND status='closed' AND ${cleanPnl} IS NOT NULL
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
        if (forexEngineRegistry.size === 0) {
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

module.exports = { app, positions, FOREX_PAIRS, MOMENTUM_CONFIG };
