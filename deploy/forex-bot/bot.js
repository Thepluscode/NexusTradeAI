const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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
                last_login TIMESTAMPTZ
            )
        `);
        console.log('✅ Forex bot: Auth DB ready');
    } catch (e) {
        console.warn('⚠️  Forex DB init failed:', e.message);
        dbPool = null;
    }
}

async function dbForexOpen(pair, direction, tier, entry, stopLoss, takeProfit, units, session) {
    if (!dbPool) return null;
    try {
        const absUnits = Math.abs(units);
        const positionSizeUsd = entry > 0 ? parseFloat((absUnits * entry).toFixed(2)) : null;
        const r = await dbPool.query(
            `INSERT INTO trades (bot,symbol,direction,tier,status,entry_price,quantity,
             position_size_usd,stop_loss,take_profit,entry_time,session)
             VALUES ('forex',$1,$2,$3,'open',$4,$5,$6,$7,$8,NOW(),$9) RETURNING id`,
            [pair, direction, tier, entry, absUnits, positionSizeUsd, stopLoss, takeProfit, session || null]
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

// ── Auth Endpoints ────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
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

// ===== FOREX PAIRS =====
const FOREX_PAIRS = [
    // Major Pairs (highest liquidity, tightest spreads)
    'EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'AUD_USD', 'USD_CAD', 'NZD_USD',
    // Cross Pairs (good liquidity)
    'EUR_JPY', 'GBP_JPY', 'EUR_GBP', 'AUD_JPY', 'EUR_AUD'
];

// Correlation groups - avoid same-direction trades on correlated pairs
const CORRELATION_GROUPS = {
    USD_LONG: ['EUR_USD', 'GBP_USD', 'AUD_USD', 'NZD_USD'], // If short EUR_USD, don't short GBP_USD
    USD_SHORT: ['USD_JPY', 'USD_CHF', 'USD_CAD'],
    JPY_PAIRS: ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY'],
    EUR_PAIRS: ['EUR_USD', 'EUR_JPY', 'EUR_GBP', 'EUR_AUD']
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
            // Don't restore equity or dailyPnL — those are session-specific
            console.log(`📊 Forex perf restored: ${simTotalTrades} trades, ${simWinners}W/${simLosers}L`);
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
        threshold: 0.003,       // 0.3% (30 pips)
        rsiMax: 70,
        rsiMin: 30,
        positionSize: 0.01,     // 1% of account
        stopLoss: 0.015,        // 1.5%
        profitTarget: 0.03,     // 3% (2:1 R/R)
        maxPositions: 4
    },
    tier2: {
        threshold: 0.005,       // 0.5% (50 pips)
        rsiMax: 72,
        rsiMin: 28,
        positionSize: 0.015,    // 1.5%
        stopLoss: 0.02,         // 2%
        profitTarget: 0.045,    // 4.5% (2.25:1 R/R)
        maxPositions: 2
    },
    tier3: {
        threshold: 0.008,       // 0.8% (80 pips) - strong move
        rsiMax: 75,
        rsiMin: 25,
        positionSize: 0.02,     // 2%
        stopLoss: 0.025,        // 2.5%
        profitTarget: 0.06,     // 6% (2.4:1 R/R)
        maxPositions: 1
    }
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
    // Check stop-out cooldown
    const stopTime = stoppedOutPairs.get(pair);
    if (stopTime && Date.now() - stopTime < MIN_TIME_AFTER_STOP) {
        return { allowed: false, reason: 'Stop-out cooldown' };
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
        const allAbove = last3.every(c => c > sma20);
        const allBelow = last3.every(c => c < sma20);
        const risingSlope = last3[2] > last3[0];
        if (allAbove && risingSlope) return 'up';
        if (allBelow && !risingSlope) return 'down';
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
        || 'localhost:3010';
    if (raw.startsWith('http')) return raw;
    if (raw.includes('railway.app')) return `https://${raw}`;
    return `http://${raw}`;
})();

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

    // [v3.2] Entry candle direction — last completed M15 candle must align with signal
    const lastCandle = candles[candles.length - 1];
    const lastCandleBullish = parseFloat(lastCandle.mid.c) > parseFloat(lastCandle.mid.o);
    const lastCandleBearish = parseFloat(lastCandle.mid.c) < parseFloat(lastCandle.mid.o);

    return {
        pair, currentPrice, sma10, sma20, sma50, rsi, atr,
        atrPct, bb,
        isUptrend, isDowntrend, trendStrength,
        lastCandleBullish, lastCandleBearish
    };
}

async function scanForSignals() {
    const signals = [];
    const session = getCurrentSession();

    // Skip low liquidity sessions
    if (session.quality === 'poor') {
        console.log(`⏸️ ${session.name} - Low liquidity, skipping`);
        return signals;
    }

    for (const pair of FOREX_PAIRS) {
        const canTradeResult = canTrade(pair);
        if (!canTradeResult.allowed) continue;
        if (positions.has(pair)) continue;

        const analysis = await analyzePair(pair);
        if (!analysis) continue;

        const {
            currentPrice, rsi, isUptrend, isDowntrend, trendStrength,
            atrPct, bb, lastCandleBullish, lastCandleBearish
        } = analysis;

        // [v3.2] H1 trend confirmation — fetch once per pair
        const h1Trend = await getH1Trend(pair);

        // Determine tier
        let tier = null;
        if (trendStrength >= MOMENTUM_CONFIG.tier3.threshold) tier = 'tier3';
        else if (trendStrength >= MOMENTUM_CONFIG.tier2.threshold) tier = 'tier2';
        else if (trendStrength >= MOMENTUM_CONFIG.tier1.threshold) tier = 'tier1';
        if (!tier) continue;

        const config = MOMENTUM_CONFIG[tier];
        const tierPositions = Array.from(positions.values()).filter(p => p.tier === tier).length;
        if (tierPositions >= config.maxPositions) continue;

        // [v3.2] ATR-based stops/targets — adapts to each pair's volatility
        const atrStop  = atrPct > 0 ? atrPct * 1.5 : config.stopLoss;
        const atrTarget = atrPct > 0 ? atrPct * 3.0 : config.profitTarget;

        // LONG Signal
        if (isUptrend && rsi < config.rsiMax && rsi > config.rsiMin - 10) {
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
            // [v3.3] Strategy Bridge advisory — only block if bridge explicitly signals SHORT with high confidence
            const bridgeLong = await queryStrategyBridge(pair, 'long');
            if (bridgeLong !== null && bridgeLong.direction === 'short' && bridgeLong.confidence > 0.7) {
                console.log(`[Bridge] ${pair} LONG rejected — bridge explicit SHORT conf:${bridgeLong.confidence.toFixed(2)}`);
                // fall through to SHORT check
            } else {
                if (bridgeLong !== null) {
                    console.log(`[Bridge] ${pair} LONG advisory: ${bridgeLong.direction} conf:${(bridgeLong.confidence || 0).toFixed(2)}`);
                }
                signals.push({
                    pair, direction: 'long', tier,
                    entry: currentPrice,
                    stopLoss:   currentPrice * (1 - atrStop),
                    takeProfit: currentPrice * (1 + atrTarget),
                    rsi, trendStrength, atrPct, h1Trend,
                    session: session.name
                });
            }
        }

        // SHORT Signal
        if (isDowntrend && rsi > (100 - config.rsiMax) && rsi < (100 - config.rsiMin + 10)) {
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
            // [v3.3] Strategy Bridge advisory — only block if bridge explicitly signals LONG with high confidence
            const bridgeShort = await queryStrategyBridge(pair, 'short');
            if (bridgeShort !== null && bridgeShort.direction === 'long' && bridgeShort.confidence > 0.7) {
                console.log(`[Bridge] ${pair} SHORT rejected — bridge explicit LONG conf:${bridgeShort.confidence.toFixed(2)}`);
            } else {
                if (bridgeShort !== null) {
                    console.log(`[Bridge] ${pair} SHORT advisory: ${bridgeShort.direction} conf:${(bridgeShort.confidence || 0).toFixed(2)}`);
                }
                signals.push({
                    pair, direction: 'short', tier,
                    entry: currentPrice,
                    stopLoss:   currentPrice * (1 + atrStop),
                    takeProfit: currentPrice * (1 - atrTarget),
                    rsi, trendStrength, atrPct, h1Trend,
                    session: session.name
                });
            }
        }
    }

    return signals;
}

// ===== TRADE EXECUTION =====

async function executeTrade(signal) {
    const account = await getAccount();
    if (!account) {
        console.log('❌ Cannot get account info');
        return false;
    }

    const balance = parseFloat(account.balance);
    const config = MOMENTUM_CONFIG[signal.tier];
    const positionValue = balance * config.positionSize;

    // Calculate units (forex uses lot sizes)
    const units = signal.direction === 'long'
        ? Math.floor(positionValue / signal.entry * 10000)  // Mini lots
        : -Math.floor(positionValue / signal.entry * 10000);

    console.log(`\n🎯 EXECUTING ${signal.direction.toUpperCase()} ${signal.pair} (${signal.tier})`);
    console.log(`   Entry: ${signal.entry.toFixed(5)}, Stop: ${signal.stopLoss.toFixed(5)}, Target: ${signal.takeProfit.toFixed(5)}`);
    console.log(`   Units: ${units}, Session: ${signal.session}`);

    const result = await createOrder(signal.pair, units, signal.stopLoss, signal.takeProfit);

    if (result?.orderFillTransaction) {
        console.log(`✅ ORDER FILLED: ${signal.pair}`);

        // Record position
        positions.set(signal.pair, {
            instrument: signal.pair,
            direction: signal.direction,
            tier: signal.tier,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            takeProfit: signal.takeProfit,
            units,
            entryTime: new Date(),
            session: signal.session
        });

        // Persist trade opening to DB (fire-and-forget)
        dbForexOpen(signal.pair, signal.direction, signal.tier, signal.entry, signal.stopLoss, signal.takeProfit, units, signal.session)
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
        // OTHER EXITS
        console.log(`\n🔴 CLOSING ${pair}: ${reason}`);
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
        }
        saveForexPerf();

        // Persist close to DB — use unrealizedPL as proxy for exit PnL
        if (pos) {
            const exitPnl = pos.unrealizedPL ?? 0;
            const exitEntry = pos.entry ?? 0;
            const exitPct = exitEntry > 0 ? (exitPnl / (exitEntry * Math.abs(pos.units ?? 1))) * 100 : 0;
            const exitPrice = pos.currentPrice ?? exitEntry;
            dbForexClose(pos.dbTradeId, exitPrice, exitPnl, exitPct, reason).catch(() => {});
        }

        positions.delete(pair);

        if (reason.toLowerCase().includes('stop')) {
            stoppedOutPairs.set(pair, Date.now());
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

    // Sync positions Map with OANDA
    const oandaInstruments = oandaPositions.map(p => p.instrument);
    for (const [pair] of positions) {
        if (!oandaInstruments.includes(pair)) {
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

    try {
        // Scan for new signals
        const signals = await scanForSignals();
        console.log(`🔍 Signals found: ${signals.length}`);

        // Execute top signals
        const maxNewPositions = 5 - positions.size;
        const signalsToExecute = signals.slice(0, Math.min(maxNewPositions, 2));

        for (const signal of signalsToExecute) {
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
                    totalPnL: simEquity - SIM_STARTING_EQUITY,
                    maxDrawdown: 0
                },
                config: {
                    symbols: FOREX_PAIRS,
                    maxPositions: 5,
                    stopLoss: MOMENTUM_CONFIG.tier1.stopLoss,
                    profitTarget: MOMENTUM_CONFIG.tier1.profitTarget,
                    dailyLossLimit: -MAX_DAILY_LOSS_FOREX
                }
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
                totalPnL: dailyPnL,
                maxDrawdown: 0
            },
            config: {
                symbols: FOREX_PAIRS,
                maxPositions: 5,
                stopLoss: MOMENTUM_CONFIG.tier1.stopLoss,
                profitTarget: MOMENTUM_CONFIG.tier1.profitTarget,
                dailyLossLimit: -500
            }
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
app.post('/api/config/credentials', requireApiSecret, async (req, res) => {
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
        let updated = 0;
        for (const [key, value] of Object.entries(creds)) {
            if (!allowed.includes(key)) continue;
            if (typeof value !== 'string' || value === '') continue;
            process.env[key] = value;
            await persistEnvVar(key, value);
            updated++;
        }
        console.log(`⚙️  Credentials updated: broker=${broker} keys=${updated}`);
        res.json({ success: true, updated });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
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
    initTradeDb().catch(e => console.warn('⚠️  Forex DB init error:', e.message));

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
        if (openPos.length > 0) console.log(`✅ Hydrated ${positions.size} position(s) from OANDA`);
    } catch (e) {
        console.warn('⚠️  Position hydration failed (will proceed):', e.message);
    }

    // Initial scan
    setTimeout(() => tradingLoop().catch(e => console.error('❌ Forex loop crashed:', e)), 5000);

    // Main loop: every 5 minutes
    setInterval(() => {
        resetDailyCounters();
        tradingLoop().catch(e => console.error('❌ Forex loop crashed:', e));
    }, 5 * 60 * 1000);

    console.log(`\n✅ Forex bot started - scanning every 5 minutes\n`);
});

module.exports = { app, positions, FOREX_PAIRS, MOMENTUM_CONFIG };
