const express = require('express');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const { createUserCredentialStore } = require('./userCredentialStore');
require('dotenv').config({ path: path.join(__dirname, '.env') });

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
const PORT = process.env.PORT || process.env.TRADING_PORT || 3002;

// [Phase 3.5] Cross-bot portfolio risk URLs (for co-located or Railway deployment)
const FOREX_BOT_URL = process.env.FOREX_BOT_URL || 'http://localhost:3005';
const CRYPTO_BOT_URL = process.env.CRYPTO_BOT_URL || 'http://localhost:3006';

app.use(cors());
app.use(express.json());

// ── Auth middleware for config-write endpoints ──────────────────────────────
// All POST /api/config/* routes require: Authorization: Bearer <NEXUS_API_SECRET>
function requireApiSecret(req, res, next) {
    const secret = process.env.NEXUS_API_SECRET;
    if (!secret) return next(); // not configured — allow (startup / local dev)
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

app.post('/api/auth/dev-login', authRateLimit, async (req, res) => {
    if (dbPool) {
        return res.status(404).json({ success: false, error: 'Dev login is disabled when DATABASE_URL is configured' });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || '').trim();
    if (!email) {
        return res.status(400).json({ success: false, error: 'Email is required for local dev login' });
    }

    const tokens = signTokens(email, email);
    res.json({
        success: true,
        localDev: true,
        user: {
            id: email,
            email,
            name: name || email.split('@')[0],
            role: 'user'
        },
        ...tokens
    });
});

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
        if (!result.rows || result.rows.length === 0) {
            return res.status(500).json({ success: false, error: 'Registration failed' });
        }
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
        if (!result.rows || result.rows.length === 0) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }
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
        // Token generated (email delivery is future work)
        console.log(`🔑 Password reset token generated for ${email}`);
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
const telegramAlerts = getTelegramAlertService();

const positions = new Map();
let scanCount = 0;
let lastScanTime = null;

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

// Daily loss circuit breaker — updated by the status endpoint each poll
let cachedDailyPnL = 0;

// Performance tracking (in-memory, persisted to performance.json)
const fs = require('fs');
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const PERF_FILE = path.join(DATA_DIR, 'performance.json');
const RISK_CONFIG_FILE = path.join(DATA_DIR, 'risk-config.json');
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
    try {
        await dbPool.query(
            `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,
             exit_time=NOW(),close_reason=$4 WHERE id=$5`,
            [exitPrice, pnlUsd, pnlPct, reason, id]
        );
    } catch (e) { console.warn('DB close failed:', e.message); }
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
                                THEN ((t.entry_price - t.exit_price) / t.entry_price) * 100
                            ELSE ((t.exit_price - t.entry_price) / t.entry_price) * 100
                        END
                    ELSE 0
                END
            )::numeric, 4)
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

    // Hard reject: trend-expansion momentum (14.3% WR historically — not fixable with smooth scoring)
    if (normalizedStrategy === 'openingRangeBreakout') {
        regime = 'opening-range';
    } else if (numericPercentChange >= MOMENTUM_CONFIG.tier2.threshold || numericVolumeRatio >= 3) {
        regime = 'trend-expansion';
        if (normalizedStrategy === 'momentum') {
            return { tradable: false, regime, quality: 0, reason: 'momentum_blocked_in_trend_expansion' };
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

    return {
        tradable: quality >= (normalizedStrategy === 'openingRangeBreakout' ? 0.70 : 0.65),
        regime,
        quality: parseFloat(quality.toFixed(3)),
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
const RISK_PER_TRADE = parseFloat(process.env.RISK_PER_TRADE || '0.0075');      // 0.75% per trade (was 2%)
const MIN_SIGNAL_CONFIDENCE = parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.68');
const MIN_SIGNAL_SCORE = parseFloat(process.env.MIN_SIGNAL_SCORE || '0.75');  // v5.0: raised from 0.68 — filter out low-conviction entries
const MIN_REWARD_RISK = parseFloat(process.env.MIN_REWARD_RISK || '1.75');
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

    // Dynamic profit targets based on hold time (v6.0: aligned with tier targets — day-0 was 5% which overrode tier1's 8%)
    profitTargetByDay: {
        0: 0.08,  // Day 0-1: 8% target — match tier1 target, let winners run
        1: 0.07,  // Day 1-2: 7% target — still strong momentum
        2: 0.06,  // Day 2-3: 6% target — momentum still intact
        3: 0.05,  // Day 3-4: 5% target — start relaxing
        4: 0.04,  // Day 4-5: 4% target
        5: 0.03,  // Day 5-6: 3% target
        6: 0.02,  // Day 6-7: 2% target
        7: 0.01   // Day 7+: ANY profit
    },

    // Trailing stops (v6.0: widened — old levels locked profit too early, converting winners to micro-wins)
    // Realized R:R was ~1:1 instead of configured 2:1 because +2%/+3% locks triggered too aggressively
    trailingStopLevels: [
        { gainThreshold: 0.03, lockPercent: 0.50 },  // +3%: lock 50% — first lock at meaningful gain
        { gainThreshold: 0.05, lockPercent: 0.65 },  // +5%: lock 65%
        { gainThreshold: 0.08, lockPercent: 0.80 },  // +8%: lock 80%
        { gainThreshold: 0.12, lockPercent: 0.90 },  // +12%: lock 90%
        { gainThreshold: 0.15, lockPercent: 0.95 }   // +15%: lock 95%
    ],

    // Momentum reversal thresholds
    momentumReversal: {
        rsiOverbought: 72,        // RSI > 72 = overbought
        volumeDropPercent: 0.50,  // 50% volume drop = fading
        dailyHighDropPercent: 0.02, // 2% from daily high = reversal
        supportBreakPercent: 0.015  // Break 1.5% below entry low
    }
};

const MOMENTUM_CONFIG = {
    tier1: {
        threshold: 3.5,       // raised from 2.5 — 2.5% catches noise; 3.5% is real momentum
        minVolume: 500000,    // raised from 300k — require meaningful liquidity
        volumeRatio: 1.8,     // v5.0: raised from 1.5 — higher volume = higher conviction (30% WR at 1.5x)
        rsiMax: 66,           // v5.0: tightened from 68 — avoid approaching overbought
        rsiMin: 40,           // v5.0: tightened from 38 — avoid deeply oversold mean-reversion traps
        positionSize: 0.005,
        stopLoss: 0.04,
        profitTarget: 0.08,
        maxPositions: 5       // reduced from 6 — fewer, higher-quality positions
    },
    tier2: {
        threshold: 5.0,
        minVolume: 750000,    // raised from 500k
        volumeRatio: 2.0,     // v5.0: raised from 1.5 — require strong volume surge
        rsiMax: 66,           // v5.0: tightened from 68
        rsiMin: 40,           // v5.0: tightened from 38
        positionSize: 0.0075,
        stopLoss: 0.05,
        profitTarget: 0.10,
        maxPositions: 3
    },
    tier3: {
        threshold: 10.0,
        minVolume: 1000000,   // raised from 750k — high-momentum moves need high volume
        volumeRatio: 2.2,     // v5.0: raised from 1.8 — extreme moves need extreme volume
        rsiMax: 68,           // v5.0: tightened from 70
        rsiMin: 40,           // v5.0: tightened from 38
        positionSize: 0.01,
        stopLoss: 0.06,
        profitTarget: 0.15,
        maxPositions: 2
    }
};

const OPENING_RANGE_BREAKOUT_CONFIG = {
    openingRangeMinutes: 15,
    entryCutoffHour: 11,
    breakoutBufferDollars: 0.10,
    breakoutBufferPct: 0.001,
    minBreakoutVolumeRatio: 1.8,
    rsiMin: 48,
    rsiMax: 72,
    maxBreakoutPct: 0.03,
    positionSize: 0.004,
    stopLoss: 0.015,
    profitTarget: 0.03,   // v6.0: raised from 0.02 — R:R goes from 1.33:1 to 2:1 with 1.5% stop
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
    const score = (8 + breakoutPct * 1000 + breakoutVolumeRatio * 4) * rsiBonus * regimeProfile.quality;

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

// [Phase 1] Order Flow Imbalance — approximates buy/sell pressure from OHLCV bars
// Returns -1 to +1: positive = buy pressure dominant, negative = sell pressure dominant
function calculateOrderFlowImbalance(bars, lookback = 20) {
    const recent = bars.slice(-lookback);
    let buyVolume = 0, sellVolume = 0;
    for (const bar of recent) {
        const close = parseFloat(bar.c);
        const open = parseFloat(bar.o);
        const volume = parseFloat(bar.v) || 0;
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

// [Phase 1] Displacement Candle Detection — checks if recent bars show strong directional conviction
// Large body (>70% of range) with range exceeding 1.5x ATR signals institutional commitment
function isDisplacementCandle(bars, atr, lookback = 3) {
    if (!bars || bars.length < lookback || !atr || atr <= 0) return false;
    const recent = bars.slice(-lookback);
    for (const bar of recent) {
        const open = parseFloat(bar.o);
        const high = parseFloat(bar.h);
        const low = parseFloat(bar.l);
        const close = parseFloat(bar.c);
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

// [Phase 2] Volume Profile — calculates VAH, VAL, POC from OHLCV bars
// VAH = Value Area High, VAL = Value Area Low, POC = Point of Control (highest volume price)
// Value Area contains 70% of total volume, centered around POC
function calculateVolumeProfile(bars, numBuckets = 50) {
    if (!bars || bars.length < 20) return null;

    // Find price range
    let minPrice = Infinity, maxPrice = -Infinity;
    for (const bar of bars) {
        const high = parseFloat(bar.h);
        const low = parseFloat(bar.l);
        if (low < minPrice) minPrice = low;
        if (high > maxPrice) maxPrice = high;
    }

    const priceRange = maxPrice - minPrice;
    if (priceRange <= 0) return null;
    const bucketSize = priceRange / numBuckets;

    // Build volume-at-price histogram
    const volumeByBucket = new Array(numBuckets).fill(0);
    let totalVolume = 0;

    for (const bar of bars) {
        const open = parseFloat(bar.o);
        const high = parseFloat(bar.h);
        const low = parseFloat(bar.l);
        const close = parseFloat(bar.c);
        const volume = parseFloat(bar.v) || 0;

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
                pricelow: minPrice + i * bucketSize,
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
function detectFairValueGaps(bars, lookback = 20) {
    if (!bars || bars.length < 3) return { bullish: [], bearish: [] };

    const recent = bars.slice(-lookback);
    const bullishGaps = [];
    const bearishGaps = [];

    for (let i = 1; i < recent.length - 1; i++) {
        const prev = recent[i - 1];
        const curr = recent[i];
        const next = recent[i + 1];

        const prevHigh = parseFloat(prev.h);
        const prevLow = parseFloat(prev.l);
        const nextHigh = parseFloat(next.h);
        const nextLow = parseFloat(next.l);
        const currClose = parseFloat(curr.c);
        const currOpen = parseFloat(curr.o);

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

// [Phase 3] Committee Aggregator — combines multiple signal confirmations into unified confidence
// Each signal source contributes independently; more confirmations = higher confidence
// Minimum threshold: 0.45 confidence required to trade (prevents marginal entries)
function computeCommitteeScore(signal) {
    let confirmations = 0;
    let totalWeight = 0;

    // 1. Momentum strength (weight: 0.25)
    const momentumScore = Math.min(parseFloat(signal.percentChange || 0) / 10, 1.0);
    confirmations += momentumScore * 0.25;
    totalWeight += 0.25;

    // 2. Order flow confirmation (weight: 0.20)
    const flowScore = signal.orderFlowImbalance !== undefined
        ? Math.max(0, signal.orderFlowImbalance) // 0 to 1 for longs
        : 0.5; // neutral if unavailable
    confirmations += flowScore * 0.20;
    totalWeight += 0.20;

    // 3. Displacement candle (weight: 0.15)
    const displacementScore = signal.hasDisplacement ? 1.0 : 0.0;
    confirmations += displacementScore * 0.15;
    totalWeight += 0.15;

    // 4. Volume Profile position (weight: 0.15)
    let vpScore = 0.5; // neutral default
    if (signal.volumeProfile) {
        const price = parseFloat(signal.price);
        const { vah, val, poc } = signal.volumeProfile;
        const range = vah - val;
        if (range > 0) {
            // Score higher when closer to VAL (buying at discount)
            const positionInRange = (price - val) / range;
            vpScore = Math.max(0, 1.0 - positionInRange); // 1.0 at VAL, 0.0 at VAH
        }
    }
    confirmations += vpScore * 0.15;
    totalWeight += 0.15;

    // 5. FVG confirmation (weight: 0.10)
    const fvgScore = (signal.fvgCount || 0) > 0 ? 1.0 : 0.0;
    confirmations += fvgScore * 0.10;
    totalWeight += 0.10;

    // 6. Volume ratio (weight: 0.15)
    const volRatioScore = Math.min(parseFloat(signal.volumeRatio || 1) / 3, 1.0);
    confirmations += volRatioScore * 0.15;
    totalWeight += 0.15;

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

    return {
        regime,
        atrPct: parseFloat((atrPct * 100).toFixed(3)),
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
        for (const bar of bars) {
            const typicalPrice = (bar.h + bar.l + bar.c) / 3;
            cumulativeTPV += typicalPrice * bar.v;
            cumulativeVolume += bar.v;
        }
        return cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : null;
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
    // Check cache first
    const cached = _stockAgentCache.get(signal.symbol);
    if (cached && cached.price > 0) {
        const age = Date.now() - cached.timestamp;
        const priceDrift = Math.abs(signal.price - cached.price) / cached.price;
        if (age < _STOCK_AGENT_CACHE_TTL_MS && priceDrift < _STOCK_AGENT_CACHE_PRICE_DRIFT) {
            console.log(`[Agent] ${signal.symbol}: using cached decision (${(age / 1000).toFixed(0)}s old, drift ${(priceDrift * 100).toFixed(2)}%)`);
            return { ...cached.result, source: 'cache' };
        }
        _stockAgentCache.delete(signal.symbol);
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

        // Cache the result
        _stockAgentCache.set(signal.symbol, {
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
        };
        await axios.post(`${BRIDGE_URL}/agent/trade-outcome`, payload, { timeout: 5000 });
        console.log(`[Learn] ${position.symbol} outcome reported: ${pnlPct > 0 ? 'WIN' : 'LOSS'} ${(pnlPct * 100).toFixed(1)}%`);
    } catch (e) {
        // Non-blocking — learning is best-effort
    }
}

function canTrade(symbol, side = 'buy') {
    const stopTime = stoppedOutSymbols.get(symbol);
    if (stopTime) {
        const timeSinceStop = Date.now() - stopTime;
        if (timeSinceStop < MIN_TIME_AFTER_STOP) {
            return false;
        } else {
            stoppedOutSymbols.delete(symbol);
        }
    }

    if (totalTradesToday >= MAX_TRADES_PER_DAY) return false;

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
                position = {
                    symbol,
                    entry: avgEntry,
                    shares: parseFloat(alpacaPos.qty),
                    stopLoss: avgEntry * 0.93,
                    target: avgEntry * 1.20,
                    strategy: 'existing',
                    entryTime: restoredEntry
                };
                positions.set(symbol, position);
                savePositions();
            }

            // Calculate hold time
            const holdDays = (Date.now() - position.entryTime.getTime()) / (1000 * 60 * 60 * 24);

            // Update trailing stops (aggressive)
            updateTrailingStop(position, currentPrice, unrealizedPL);

            console.log(`   ${symbol}: $${currentPrice.toFixed(2)} (${unrealizedPL >= 0 ? '+' : ''}${unrealizedPL.toFixed(2)}%) | Stop: $${position.stopLoss.toFixed(2)} | Hold: ${holdDays.toFixed(1)}d`);

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
                const spyBars = await fetchBarsWithCache('SPY', alpacaConfig, {
                    start: new Date().toISOString().split('T')[0],
                    timeframe: '1Min',
                    feed: 'sip',
                    limit: 100
                });
                if (spyBars && spyBars.length > 20) {
                    globalThis._marketRegime = detectMarketRegime(spyBars);
                    globalThis._marketRegimeUpdated = Date.now();
                    console.log(`[Regime] Market: ${globalThis._marketRegime.adjustments.label} (ATR: ${globalThis._marketRegime.atrPct}%) — size:×${globalThis._marketRegime.adjustments.positionSizeMultiplier} threshold:×${globalThis._marketRegime.adjustments.scoreThresholdMultiplier} maxPos:${globalThis._marketRegime.adjustments.maxPositions}`);
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

        const symbols = popularStocks.getAllSymbols();
        console.log(`\n🔍 Momentum Scan: Checking ${symbols.length} stocks... [Regime: ${regime.adjustments.label}]`);

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
                    // [v5.0] HARD GATE: every trade MUST be approved by the agentic AI pipeline
                    const aiResult = await queryAIAdvisor(mover);

                    // Agent rejection = hard stop (no trade without AI approval)
                    if (!aiResult.approved) {
                        console.log(`[Agent] ${mover.symbol} REJECTED (conf: ${(aiResult.confidence || 0).toFixed(2)}, src: ${aiResult.source}) — ${aiResult.reason}`);
                        if (aiResult.risk_flags?.length) console.log(`[Agent]   Risk flags: ${aiResult.risk_flags.join(', ')}`);
                        if (aiResult.lessons_applied?.length) console.log(`[Agent]   Lessons: ${aiResult.lessons_applied.slice(0, 2).join('; ')}`);
                        // Telegram alerts for rejections
                        if (aiResult.confidence > 0.8 || aiResult.source === 'kill_switch') {
                            telegramAlerts.sendAgentRejection('Stock Bot', mover.symbol, 'long', aiResult.reason, aiResult.confidence, aiResult.risk_flags).catch(() => {});
                        }
                        if (aiResult.source === 'kill_switch') {
                            telegramAlerts.sendKillSwitchAlert('Stock Bot', aiResult.reason).catch(() => {});
                        }
                        continue;
                    }

                    // Agent approved — log and store metadata
                    const srcTag = aiResult.source === 'cache' ? ' (cached)' : '';
                    const regime = aiResult.market_regime ? ` [${aiResult.market_regime}]` : '';
                    console.log(`[Agent] ${mover.symbol} APPROVED${srcTag}${regime} (conf: ${(aiResult.confidence || 0).toFixed(2)}, size: ${(aiResult.position_size_multiplier || 1).toFixed(2)}x) — ${aiResult.reason}`);
                    telegramAlerts.sendAgentApproval('Stock Bot', mover.symbol, 'long', aiResult.confidence || 0, aiResult.position_size_multiplier || 1, aiResult.market_regime).catch(() => {});
                    mover.agentApproved = true;
                    mover.agentConfidence = aiResult.confidence;
                    mover.agentReason = aiResult.reason;
                    if (aiResult.position_size_multiplier && aiResult.position_size_multiplier !== 1.0) {
                        mover.agentSizeMultiplier = aiResult.position_size_multiplier;
                    }
                    // [v4.6] Adaptive guardrails — pre-trade quality gate
                    if (guardrails.isPaused) {
                        console.log(`[Guardrail] ${mover.symbol} BLOCKED — lane paused until ${new Date(guardrails.lanePausedUntil).toLocaleTimeString()}`);
                        continue;
                    }
                    // [Phase 3] Regime-adjusted score threshold — high vol raises the bar, low vol lowers it
                    const regimeScoreThreshold = MIN_SIGNAL_SCORE * regime.adjustments.scoreThresholdMultiplier;
                    if ((mover.score || 0) < regimeScoreThreshold) {
                        console.log(`[Guardrail] ${mover.symbol} BLOCKED — score ${(mover.score || 0).toFixed(2)} < ${regimeScoreThreshold.toFixed(2)} (regime: ${regime.adjustments.label})`);
                        continue;
                    }
                    if (aiResult && aiResult.confidence < MIN_SIGNAL_CONFIDENCE) {
                        console.log(`[Guardrail] ${mover.symbol} BLOCKED — confidence ${aiResult.confidence.toFixed(2)} < ${MIN_SIGNAL_CONFIDENCE}`);
                        continue;
                    }
                    // [v4.7] Check reward/risk ratio meets minimum threshold
                    const tierCfg = MOMENTUM_CONFIG[mover.tier] || MOMENTUM_CONFIG.tier1;
                    const rewardRisk = (tierCfg.profitTarget || 0.08) / (tierCfg.stopLoss || 0.04);
                    if (rewardRisk < MIN_REWARD_RISK) {
                        console.log(`[Guardrail] ${mover.symbol} BLOCKED — R:R ${rewardRisk.toFixed(2)} < ${MIN_REWARD_RISK}`);
                        continue;
                    }
                    // [Phase 1] Order flow confirmation — skip if flow opposes trade direction
                    if (mover.orderFlowImbalance !== undefined && mover.orderFlowImbalance < 0.1) {
                        console.log(`[FILTER] ${mover.symbol}: Order flow imbalance too weak (${mover.orderFlowImbalance.toFixed(2)}), skipping`);
                        continue;
                    }
                    // [Phase 3] Committee aggregator — unified confidence from all signal sources
                    const committee = computeCommitteeScore(mover);
                    if (committee.confidence < 0.45) {
                        console.log(`[Committee] ${mover.symbol}: Confidence ${committee.confidence} < 0.45 threshold — ${JSON.stringify(committee.components)}`);
                        continue;
                    }
                    console.log(`[Committee] ${mover.symbol}: APPROVED conf:${committee.confidence} — momentum:${committee.components.momentum} flow:${committee.components.orderFlow} displacement:${committee.components.displacement} VP:${committee.components.volumeProfile} FVG:${committee.components.fvg}`);
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
                    await executeTrade(mover, mover.strategy || 'momentum');
                }
            } else {
                console.log(`⏸  Max positions (${maxPositions}) reached - not entering new trades`);
            }
        } else {
            console.log(`   No qualifying momentum signals found this scan`);
        }

        return movers;

    } catch (error) {
        console.error('❌ Momentum scan error:', error.message);
        return [];
    }
}

async function analyzeMomentum(symbol, { backtestMode = false } = {}) {
    try {
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

        if (current < 1.0 || current > 1000) return null;
        if (volumeToday < 500000) return null;

        // VWAP filter: price must be at or above VWAP — only buy strength, not weakness
        const vwap = calculateVWAP(bars);
        if (vwap && current < vwap) {
            return null;
        }

        // [v3.2] EMA 9/21 crossover filter — only enter in confirmed uptrends
        const closes = bars.map(b => b.c);
        const ema9 = calculateEMA(closes, 9);
        const ema21 = calculateEMA(closes, 21);
        if (ema9 !== null && ema21 !== null && ema9 <= ema21) {
            // EMA9 below EMA21 = downtrend or no trend — skip
            return null;
        }

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

        let momentumAllowed = true;

        // v5.0: Tightened from 90% to 82% — data shows buying near daily highs = stop-outs
        // 53% of all trades exit via stop loss; most entered at extended levels
        const dailyHigh = Math.max(...bars.map(b => b.h));
        const dailyLow = Math.min(...bars.map(b => b.l));
        const dailyRange = dailyHigh - dailyLow;
        if (dailyRange > 0) {
            const positionInRange = (current - dailyLow) / dailyRange;
            if (positionInRange > 0.82) {
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
            const candidateStop = current * (1 - atrPct * 1.5);
            const candidateTarget = current * (1 + atrPct * 3.0);
            const rr = candidateStop > 0
                ? (candidateTarget - current) / (current - candidateStop)
                : 0;
            if (rr >= 1.8) {
                atrStop = candidateStop;
                atrTarget = candidateTarget;
            }
            // If R:R too low, fall through to tier config defaults (atrStop stays null)
        }

        // [Phase 1] Signal quality filters — order flow imbalance and displacement candle
        const orderFlowImbalance = calculateOrderFlowImbalance(bars, 20);
        const hasDisplacement = isDisplacementCandle(bars, atr, 3);

        // [Phase 2] Volume Profile and Fair Value Gap analysis
        const volumeProfile = calculateVolumeProfile(bars, 50);
        const fvg = detectFairValueGaps(bars, 20);

        if (momentumAllowed) {
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
                                let score = tierMultiplier * parseFloat(percentChange) * parseFloat(volumeRatio.toFixed(2)) * rsiBonus * regimeProfile.quality;
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
                            let score = tierMultiplier * parseFloat(percentChange) * parseFloat(volumeRatio.toFixed(2)) * rsiBonus * regimeProfile.quality;
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
            const fracKelly = Math.max(0, fullKelly) * 0.5;  // 50% Kelly for safety
            // Express as a multiplier: fracKelly / config.positionSize tells us "how many
            // config-sized units to risk". Clamp to [0.5, 2.0] and guard against NaN/Infinity
            // (e.g. if avgLoss=0 or winRate=100%).
            const rawMultiplier = fracKelly > 0 ? fracKelly / config.positionSize : 1.0;
            const safeMultiplier = isFinite(rawMultiplier) && !isNaN(rawMultiplier) ? rawMultiplier : 1.0;
            kellyMultiplier = Math.max(0.5, Math.min(2.0, safeMultiplier));
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

        const positionSize = equity * config.positionSize * kellyMultiplier;
        let shares = Math.floor(positionSize / effectiveEntry);

        // [v4.7] Cap shares by RISK_PER_TRADE — max dollar risk per trade = equity * RISK_PER_TRADE
        const stopLossPct = config.stopLoss || 0.04;
        const maxRiskShares = Math.floor((equity * RISK_PER_TRADE) / (effectiveEntry * stopLossPct));
        if (maxRiskShares > 0 && shares > maxRiskShares) {
            console.log(`   [RiskCap] ${signal.symbol}: capped ${shares} → ${maxRiskShares} shares (RISK_PER_TRADE=${(RISK_PER_TRADE * 100).toFixed(2)}%, stopLoss=${(stopLossPct * 100).toFixed(1)}%)`);
            shares = maxRiskShares;
        }

        if (shares < 1) {
            console.log(`⚠️  [SKIP] ${signal.symbol}: position size $${positionSize.toFixed(0)} too small to buy 1 share @ $${signal.price} (need $${Math.ceil(signal.price)} min)`);
            return null;
        }

        // [v3.2] Prefer ATR-based stops when they provide >= 1.8:1 R:R, else use config defaults
        // [v3.5] Stops/targets computed from effectiveEntry (includes slippage) for realistic R:R
        const stopPrice = (signal.atrStop || effectiveEntry * (1 - config.stopLoss)).toFixed(2);
        const targetPrice = (signal.atrTarget || effectiveEntry * (1 + config.profitTarget)).toFixed(2);
        if (signal.atrStop) console.log(`   [ATR Stops] Using volatility-adapted: Stop $${stopPrice}, Target $${targetPrice}`);
        if (kellyMultiplier !== 1.0) console.log(`   [Kelly] Size multiplier: ${kellyMultiplier.toFixed(2)}x (winRate:${perfData.winRate.toFixed(1)}% pf:${perfData.profitFactor.toFixed(2)})`);

        // [v7.0] Update anti-churning state BEFORE API call to prevent race-condition duplicates.
        // If the order succeeds but the response fails (network timeout, etc.), we already
        // consumed the trade slot. On API failure we roll back below.
        totalTradesToday++;
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

        // Record performance data — apply exit slippage (market sell fills ~0.05% below bid)
        if (position && currentPrice) {
            const STOCK_EXIT_SLIPPAGE = 0.0005; // 0.05% — matches entry slippage assumption
            const adjustedExitPrice = currentPrice * (1 - STOCK_EXIT_SLIPPAGE);
            const closeMetrics = resolveClosedTradeMetrics(position, qty, adjustedExitPrice);
            if (closeMetrics) {
                recordTradeClose(symbol, closeMetrics.entryPrice, closeMetrics.exitPrice, closeMetrics.shares, reason);
                dbTradeClose(position?.dbTradeId, closeMetrics.exitPrice, closeMetrics.pnlUsd, closeMetrics.pnlPct, reason).catch(e => console.warn('⚠️  DB operation failed:', e?.message || String(e)));
                // [v4.1] Report to Agentic AI learning loop — Scan AI pattern tracking
                reportTradeOutcome(position, closeMetrics.exitPrice, closeMetrics.pnlUsd, closeMetrics.pnlPct / 100, reason).catch(e => console.warn('⚠️  DB operation failed:', e?.message || String(e)));
                    // [v4.6] Feed outcome into adaptive guardrails
                    guardrails.recordOutcome(closeMetrics.pnlUsd > 0);
            } else {
                console.warn(`⚠️ Skipping stock DB close write for ${symbol}: unresolved close metrics`);
            }
        }

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

        // [Phase 4] Trade evaluation — log signal effectiveness for weight optimization
        if (position && position.signalSnapshot) {
            const snapshot = position.signalSnapshot;
            const evalExitPrice = currentPrice || 0;
            const evalPnl = currentPrice ? (currentPrice - position.entry) * parseFloat(qty) : 0;
            const evalPnlPct = (currentPrice && position.entry) ? (currentPrice - position.entry) / position.entry : 0;
            const outcome = {
                symbol: position.symbol,
                direction: 'long',
                entryPrice: position.entry,
                exitPrice: evalExitPrice,
                pnl: evalPnl,
                pnlPct: evalPnlPct,
                holdTimeMs: Date.now() - (snapshot.timestamp || position.entryTime?.getTime?.() || Date.now()),
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

            // Keep last 200 evaluations in memory
            if (globalThis._tradeEvaluations.length > 200) {
                globalThis._tradeEvaluations = globalThis._tradeEvaluations.slice(-200);
            }

            const winLoss = evalPnl > 0 ? 'WIN' : 'LOSS';
            console.log(`[Evaluation] ${outcome.symbol} ${winLoss} ${evalPnlPct > 0 ? '+' : ''}${(evalPnlPct * 100).toFixed(2)}% — committee:${snapshot.committeeConfidence} flow:${snapshot.orderFlowImbalance?.toFixed?.(2) || '?'} displacement:${snapshot.hasDisplacement} regime:${snapshot.marketRegime}`);
        }

        positions.delete(symbol);
        savePositions();
        savePerfData();

    } catch (error) {
        console.error(`❌ Error closing ${symbol}:`, error.message);
    }
}

// [Phase 4] Trade evaluation summary endpoint
app.get('/api/trading/evaluations', (req, res) => {
    const evals = globalThis._tradeEvaluations || [];
    if (evals.length === 0) {
        return res.json({ success: true, data: { totalTrades: 0, message: 'No evaluations yet' } });
    }

    const wins = evals.filter(e => e.pnl > 0);
    const losses = evals.filter(e => e.pnl <= 0);

    // Signal effectiveness: average P&L when signal was present vs absent
    const signalEffectiveness = {};
    const signals = ['orderFlow', 'displacement', 'fvgCount'];
    for (const sig of signals) {
        const withSignal = evals.filter(e => {
            if (sig === 'orderFlow') return (e.signals.orderFlow || 0) > 0.1;
            if (sig === 'displacement') return e.signals.displacement === true;
            if (sig === 'fvgCount') return (e.signals.fvgCount || 0) > 0;
            return false;
        });
        const withoutSignal = evals.filter(e => {
            if (sig === 'orderFlow') return (e.signals.orderFlow || 0) <= 0.1;
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
        res.status(500).json({ success: false, error: error.message });
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
        res.status(500).json({ success: false, error: error.message });
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
        return res.status(500).json({ success: false, error: error.message });
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
        } catch (err) { skipped.push({ symbol, error: err.message }); }
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

        res.json({
            success: true,
            data: {
                activeAccount: process.env.ACTIVE_ACCOUNT || 'demo',
                realAccount: {
                    balance: cash,
                    equity,
                    pnl: equity - 100000,
                    pnlPercent: ((equity - 100000) / 100000) * 100
                },
                demoAccount: {
                    balance: cash,
                    equity,
                    canReset: true
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
    const memoryReport = memoryManager.getReport();
    res.json({
        status: 'ok',
        bot: 'unified-trading-bot-improved',
        memory: {
            heapUsedMB: memoryReport.heap.used,
            heapLimitMB: memoryReport.heap.limit,
            usagePercent: memoryReport.heap.usagePercent
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Trading bot start/stop/pause endpoints (for dashboard compatibility)
app.post('/api/trading/start', (req, res) => {
    try {
        botRunning = true;
        botPaused = false;
        saveBotState();
        res.json({ success: true, message: 'Stock trading bot started', isRunning: true, isPaused: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/trading/stop', (req, res) => {
    try {
        botRunning = false;
        botPaused = false;
        saveBotState();
        res.json({ success: true, message: 'Stock trading bot stopped', isRunning: false, isPaused: false });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
                skipped.push({ symbol, error: err.message });
            }
        }

        res.json({
            success: true,
            message: `Closed ${closed.length} profitable position(s), skipped ${skipped.length}`,
            closed,
            skipped,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
        recentTrades.clear();
        tradesPerSymbol.clear();      // was missing — prevented new trades after reset
        stoppedOutSymbols.clear();    // was missing — cooldowns persisted after reset
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
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/trading/pause', (req, res) => {
    try {
        botPaused = !botPaused;
        saveBotState();
        res.json({ success: true, message: botPaused ? 'Stock trading bot paused' : 'Stock trading bot resumed', isRunning: botRunning, isPaused: botPaused });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
            error: error.message
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
            error: error.message
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
        res.status(500).json({ success: false, error: err.message });
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
        res.status(500).json({ success: false, error: err.message });
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
        res.status(500).json({ success: false, error: err.message });
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
                    }).catch(() => {});
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
        res.status(500).json({ success: false, error: err.message });
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
            initialCapital: 100000,
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
        res.status(500).end(error.message);
    }
});

// Reset daily counters at midnight (or when a new trading day starts)
let lastResetDate = getESTDate().toDateString();
function resetDailyCounters() {
    const today = getESTDate().toDateString();
    if (today !== lastResetDate) {
        console.log(`\n📅 New trading day: ${today} - resetting daily counters`);
        totalTradesToday = 0;
        tradesPerSymbol.clear();
        stoppedOutSymbols.clear();
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
        this.totalTradesToday = 0;
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
                        bot.sendMessage(tgChatId, `✅ *STOCK ENTRY* [${tier}]\n📛 ${sym} x${qty}\n💰 Entry: $${ep.toFixed(2)}\n🛑 SL: $${sl.toFixed(2)}  🎯 TP: $${tp.toFixed(2)}`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendStockStopLoss:  (sym, ep, cp, pnl, sl) =>
                        bot.sendMessage(tgChatId, `🚨 *STOP LOSS* ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💸 P&L: ${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(() => {}),
                    sendStockTakeProfit:(sym, ep, cp, pnl, tp) =>
                        bot.sendMessage(tgChatId, `🎯 *TAKE PROFIT* ${sym}\n💰 Entry $${ep.toFixed(2)} → $${cp.toFixed(2)}\n💵 P&L: +${pnl.toFixed(2)}%`, { parse_mode: 'Markdown' }).catch(() => {}),
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
            ).catch(() => {});
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
        try {
            await dbPool.query(
                `UPDATE trades SET status='closed',exit_price=$1,pnl_usd=$2,pnl_pct=$3,
                 exit_time=NOW(),close_reason=$4 WHERE id=$5`,
                [exitPrice, pnlUsd, pnlPct, reason, id]
            );
        } catch (e) { console.warn('DB close failed:', e.message); }
    }

    canTrade(symbol, side = 'buy') {
        const stopTime = this.stoppedOutSymbols.get(symbol);
        if (stopTime) {
            const timeSinceStop = Date.now() - stopTime;
            if (timeSinceStop < MIN_TIME_AFTER_STOP) return false;
            else this.stoppedOutSymbols.delete(symbol);
        }
        if (this.totalTradesToday >= MAX_TRADES_PER_DAY) return false;
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
            this.tradesPerSymbol.clear();
            this.stoppedOutSymbols.clear();
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
                this.dbTradeClose(position?.dbTradeId, closeMetrics.exitPrice, closeMetrics.pnlUsd, closeMetrics.pnlPct, reason).catch(e => console.warn('⚠️  DB operation failed:', e?.message || String(e)));
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
                    position = { symbol, entry: avgEntry, shares: parseFloat(alpacaPos.qty),
                        stopLoss: avgEntry * 0.93, target: avgEntry * 1.20,
                        strategy: 'existing', entryTime: restoredEntry };
                    this.positions.set(symbol, position);
                }
                updateTrailingStop(position, currentPrice, unrealizedPL);
                const exitReason = await shouldExitPosition(position, currentPrice, alpacaPos, this.alpacaConfig);
                if (exitReason) { await this.closePosition(symbol, alpacaPos.qty, exitReason); continue; }
                if (currentPrice <= position.stopLoss) {
                    (this._telegram || telegramAlerts).sendStockStopLoss(symbol, position.entry, currentPrice, unrealizedPL, position.stopLoss).catch(() => {});
                    await this.closePosition(symbol, alpacaPos.qty, 'Stop Loss');
                } else if (currentPrice >= position.target) {
                    (this._telegram || telegramAlerts).sendStockTakeProfit(symbol, position.entry, currentPrice, unrealizedPL, position.target).catch(() => {});
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
            const positionSize = equity * config.positionSize * kellyMultiplier;
            if (!signal.price || signal.price <= 0) return null;
            let shares = Math.floor(positionSize / effectiveEntry);
            // [v4.7] Cap shares by RISK_PER_TRADE
            const stopLossPct = config.stopLoss || 0.04;
            const maxRiskShares = Math.floor((equity * RISK_PER_TRADE) / (effectiveEntry * stopLossPct));
            if (maxRiskShares > 0 && shares > maxRiskShares) shares = maxRiskShares;
            if (shares < 1) return null;
            const stopPrice  = (signal.atrStop  || effectiveEntry * (1 - config.stopLoss)).toFixed(2);
            const targetPrice = (signal.atrTarget || effectiveEntry * (1 + config.profitTarget)).toFixed(2);
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
            (this._telegram || telegramAlerts).sendStockEntry(signal.symbol, signal.price, parseFloat(stopPrice), parseFloat(targetPrice), shares, tier).catch(() => {});
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
        const maxPositions = 8;
        if (this.positions.size < maxPositions) {
            const available = maxPositions - this.positions.size;
            const ranked = movers.filter(m => !this.positions.has(m.symbol) && this.canTrade(m.symbol, 'buy'))
                .sort((a, b) => (b.score || 0) - (a.score || 0));
            const engineMaxSignals = isOpeningRangeBreakoutWindow() ? 2 : MAX_SIGNALS_PER_CYCLE;
            for (const mover of ranked.slice(0, Math.min(available, engineMaxSignals))) {
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
                        (this._telegram || telegramAlerts).sendAgentRejection('Stock Bot', mover.symbol, 'long', aiResult.reason, aiResult.confidence, aiResult.risk_flags).catch(() => {});
                    }
                    if (aiResult.source === 'kill_switch') {
                        (this._telegram || telegramAlerts).sendKillSwitchAlert('Stock Bot', aiResult.reason).catch(() => {});
                    }
                    continue;
                }

                // Agent approved — log and store metadata
                const srcTag = aiResult.source === 'cache' ? ' (cached)' : '';
                const regime = aiResult.market_regime ? ` [${aiResult.market_regime}]` : '';
                console.log(`[Engine ${this.userId}][Agent] ${mover.symbol} APPROVED${srcTag}${regime} (conf: ${(aiResult.confidence || 0).toFixed(2)}, size: ${(aiResult.position_size_multiplier || 1).toFixed(2)}x) — ${aiResult.reason}`);
                (this._telegram || telegramAlerts).sendAgentApproval('Stock Bot', mover.symbol, 'long', aiResult.confidence || 0, aiResult.position_size_multiplier || 1, aiResult.market_regime).catch(() => {});
                mover.agentApproved = true;
                mover.agentConfidence = aiResult.confidence;
                mover.agentReason = aiResult.reason;
                if (aiResult.position_size_multiplier && aiResult.position_size_multiplier !== 1.0) {
                    mover.agentSizeMultiplier = (mover.agentSizeMultiplier || 1.0) * aiResult.position_size_multiplier;
                }

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
        if (current < 1.0 || current > 1000) return null;
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
        if (dailyRange > 0 && (current - dailyLow) / dailyRange > 0.90) momentumAllowed = false;

        const adx = calculateADX(bars);
        if (momentumAllowed && adx !== null && adx < 15) momentumAllowed = false;

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
            const candidateStop   = current * (1 - atrPct * 1.5);
            const candidateTarget = current * (1 + atrPct * 3.0);
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
                            const score = tierMultiplier * parseFloat(percentChange) * parseFloat(volumeRatio.toFixed(2)) * rsiBonus * regimeProfile.quality;
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
        if (engines.length > 0) lastScanTime = new Date();
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
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

app.get('/api/trades', async (req, res) => {
    if (!dbPool) return res.json({ success: false, error: 'DB not configured', trades: [] });
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const bot = req.query.bot;
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
    } catch (e) { res.status(500).json({ success: false, error: e.message, trades: [] }); }
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
    } catch (e) { res.status(500).json({ success: false, error: e.message, daily: [], totals: [] }); }
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
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
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
        res.status(500).json({ success: false, error: e.message });
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
        res.status(500).json({ success: false, error: e.message });
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
    } catch (e) { res.status(500).json({ success: false, error: e.message, users: [] }); }
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
        res.status(500).json({ success: false, error: e.message });
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
        res.status(500).json({ success: false, error: e.message });
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
        res.status(500).json({ success: false, error: e.message });
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
            }
        }
    } catch (e) {
        console.warn('⚠️  Startup credential load failed:', e.message);
    }

    // ── DB Reconciliation: close orphaned 'open' trades not in memory ──
    // Runs at startup after positions are loaded from disk.
    // Any DB row still 'open' for a symbol we don't track = orphaned on restart.
    try {
        if (dbPool) {
            const orphaned = await dbPool.query(
                `SELECT id, symbol FROM trades WHERE bot='stock' AND status='open' AND user_id IS NULL`
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
            // Run ScanQueue for all registered user engines
            await runScanQueue();
            // Also run the default module-level loop (for env-var / admin mode backward compat)
            // Skip it if there are registered user engines already trading
            if (engineRegistry.size === 0) {
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
            telegramAlerts.sendHeartbeatAlert('Stock Bot', silentMinutes).catch(() => {});
        }
    }, 30 * 60 * 1000);
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
