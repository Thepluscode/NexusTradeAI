const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
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
                last_login TIMESTAMPTZ
            )
        `);
        console.log('✅ Auth DB ready');
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

const alpacaConfig = {
    baseURL: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    apiKey: process.env.ALPACA_API_KEY,
    secretKey: process.env.ALPACA_SECRET_KEY,
    dataURL: 'https://data.alpaca.markets'
};

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

    perfData.profitFactor = perfData.totalLossAmount > 0
        ? perfData.totalWinAmount / perfData.totalLossAmount
        : perfData.totalWinAmount > 0 ? 999 : 0;

    console.log(`📈 TRADE CLOSED: ${symbol} | ${isWin ? 'WIN' : 'LOSS'} ${pnlPct.toFixed(2)}% ($${pnlDollar.toFixed(2)}) | Reason: ${reason}`);
    console.log(`📊 Running stats: ${perfData.winningTrades}W/${perfData.losingTrades}L | WR: ${perfData.winRate.toFixed(1)}% | PF: ${perfData.profitFactor.toFixed(2)}`);

    savePerfData();
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

// ===== NEW: TIME-BASED EXIT CONFIGURATION =====
const EXIT_CONFIG = {
    maxHoldDays: 7,           // Max 7 days per position
    idealHoldDays: 3,         // Ideal 3-day momentum trades
    stalePositionDays: 10,    // Force close after 10 days

    // Dynamic profit targets based on hold time (v3.2: lowered to 5% day 0-2 for higher hit rate)
    profitTargetByDay: {
        0: 0.05,  // Day 0-1: 5% target (reduced from 8% — more achievable, higher win rate)
        1: 0.05,  // Day 1-2: 5% target
        2: 0.05,  // Day 2-3: 5% target
        3: 0.04,  // Day 3-4: 4% target
        4: 0.03,  // Day 4-5: 3% target
        5: 0.02,  // Day 5-6: 2% target
        6: 0.015, // Day 6-7: 1.5% target
        7: 0.01   // Day 7+: ANY profit
    },

    // Aggressive trailing stops (lock more profit) — v3.2: added early lock at +2%
    trailingStopLevels: [
        { gainThreshold: 0.02, lockPercent: 0.40 },  // +2%: lock 40% (NEW — protect early gains)
        { gainThreshold: 0.03, lockPercent: 0.60 },  // +3%: lock 60%
        { gainThreshold: 0.05, lockPercent: 0.75 },  // +5%: lock 75%
        { gainThreshold: 0.07, lockPercent: 0.85 },  // +7%: lock 85%
        { gainThreshold: 0.10, lockPercent: 0.92 }   // +10%: lock 92%
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
        threshold: 2.5,
        minVolume: 500000,
        volumeRatio: 1.5,
        rsiMax: 65,  // v3.2: tightened from 70 — avoid overbought exhaustion
        rsiMin: 40,  // v3.2: tightened from 30 — avoid oversold reversals
        positionSize: 0.005,
        stopLoss: 0.04,
        profitTarget: 0.08,
        maxPositions: 6
    },
    tier2: {
        threshold: 5.0,
        minVolume: 750000,
        volumeRatio: 2.0,
        rsiMax: 65,  // v3.2: tightened from 70
        rsiMin: 40,  // v3.2: tightened from 30
        positionSize: 0.0075,
        stopLoss: 0.05,
        profitTarget: 0.10,
        maxPositions: 3
    },
    tier3: {
        threshold: 10.0,
        minVolume: 1000000,
        volumeRatio: 2.5,
        rsiMax: 65,
        rsiMin: 40,  // v3.2: tightened from 35
        positionSize: 0.01,
        stopLoss: 0.06,
        profitTarget: 0.15,
        maxPositions: 2
    }
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
    avoidFirstMinutes: 30,
    avoidLastMinutes: 30
};

function getESTDate() {
    // Always use America/New_York (handles EST/EDT automatically)
    const estStr = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    return new Date(estStr);
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

    return isMarketDay && isGoodTime;
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

        const plusDI = (smoothPlusDM / smoothTR) * 100;
        const minusDI = (smoothMinusDM / smoothTR) * 100;
        const diSum = plusDI + minusDI;
        dxValues.push(diSum > 0 ? Math.abs(plusDI - minusDI) / diSum * 100 : 0);
    }

    if (dxValues.length < period) return null;
    const adx = dxValues.slice(-period).reduce((a, b) => a + b, 0) / period;
    return adx;
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

// ===== STRATEGY BRIDGE (port 3010) =====
// Non-blocking ensemble confirmation — if bridge is offline, local signals are used as-is

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
        const response = await axios.post('http://localhost:3010/signal',
            { symbol, prices, asset_class: assetClass },
            { timeout: 3000 }
        );
        return response.data; // { should_enter, direction, confidence, reason, strategies }
    } catch (e) {
        // Bridge offline or slow — non-blocking, proceed on local signals alone
        return null;
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
async function shouldExitPosition(position, currentPrice, alpacaPos) {
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

    // Find the highest applicable trailing stop level
    for (let i = EXIT_CONFIG.trailingStopLevels.length - 1; i >= 0; i--) {
        const level = EXIT_CONFIG.trailingStopLevels[i];

        if (gainDecimal >= level.gainThreshold) {
            // Calculate new stop (lock in X% of gains)
            const totalGain = currentPrice - position.entry;
            const lockedGain = totalGain * level.lockPercent;
            const newStop = position.entry + lockedGain;

            if (newStop > position.stopLoss) {
                console.log(`🔒 ${position.symbol}: AGGRESSIVE trailing stop raised to $${newStop.toFixed(2)} (locking in ${(level.lockPercent * 100).toFixed(0)}% of +${unrealizedPL.toFixed(2)}% gain)`);
                position.stopLoss = newStop;
                stopUpdated = true;
            }
            break; // Only apply highest level
        }
    }

    return stopUpdated;
}

async function managePositions() {
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
                position = {
                    symbol,
                    entry: avgEntry,
                    shares: parseFloat(alpacaPos.qty),
                    stopLoss: avgEntry * 0.93,
                    target: avgEntry * 1.20,
                    strategy: 'existing',
                    entryTime: new Date()
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

            // Traditional exits with ENHANCED ALERTS + SMS
            if (currentPrice <= position.stopLoss) {
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

async function scanMomentumBreakouts() {
    try {
        const symbols = popularStocks.getAllSymbols();
        console.log(`\n🔍 Momentum Scan: Checking ${symbols.length} stocks...`);

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

            // Cap at 8 positions for focus + better per-trade sizing
            const maxPositions = 8;
            if (positions.size < maxPositions) {
                const available = maxPositions - positions.size;
                // Sort: prefer higher tiers (bigger moves) and higher volume ratio
                const ranked = movers
                    .filter(m => !positions.has(m.symbol) && canTrade(m.symbol, 'buy'))
                    .sort((a, b) => {
                        const tierScore = { tier3: 3, tier2: 2, tier1: 1 };
                        const scoreDiff = (tierScore[b.tier] || 0) - (tierScore[a.tier] || 0);
                        if (scoreDiff !== 0) return scoreDiff;
                        return parseFloat(b.volumeRatio) - parseFloat(a.volumeRatio);
                    });

                for (const mover of ranked.slice(0, available)) {
                    await executeTrade(mover, 'momentum');
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

async function analyzeMomentum(symbol) {
    try {
        if (!isGoodTradingTime()) return null;

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
                limit: 10000
            }
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
            }
        });

        const prevVolume = prevBarResponse.data?.bars?.[0]?.v || volumeToday;
        const percentChange = ((current - todayOpen) / todayOpen) * 100;
        const volumeRatio = volumeToday / (prevVolume || 1);

        const rsi = calculateRSI(bars);

        if (current < 1.0 || current > 1000) return null;
        if (volumeToday < 500000) return null;

        // VWAP filter: price must be at or above VWAP (not just 0.5% below)
        const vwap = calculateVWAP(bars);
        if (vwap && current < vwap) {
            // Price trading below VWAP = distribution/weakness, skip
            return null;
        }

        // Avoid chasing: if price is >92% through daily range, skip regardless of move size
        const dailyHigh = Math.max(...bars.map(b => b.h));
        const dailyLow = Math.min(...bars.map(b => b.l));
        const dailyRange = dailyHigh - dailyLow;
        if (dailyRange > 0) {
            const positionInRange = (current - dailyLow) / dailyRange;
            if (positionInRange > 0.92) {
                return null;
            }
        }

        // [v3.2] EMA 9/21 crossover filter — only enter in confirmed uptrends
        const closes = bars.map(b => b.c);
        const ema9 = calculateEMA(closes, 9);
        const ema21 = calculateEMA(closes, 21);
        if (ema9 !== null && ema21 !== null && ema9 <= ema21) {
            // EMA9 below EMA21 = downtrend or no trend — skip
            return null;
        }

        // [v3.2] ADX filter — only trade trending markets (ADX > 20), skip choppy/ranging
        const adx = calculateADX(bars);
        if (adx !== null && adx < 20) {
            return null;
        }

        // [v3.2] ATR-based stop/target — adapts to each stock's volatility
        const atr = calculateATR(bars);
        let atrStop = null, atrTarget = null;
        if (atr !== null && current > 0) {
            const atrPct = atr / current;
            const candidateStop = current * (1 - atrPct * 1.5);
            const candidateTarget = current * (1 + atrPct * 3.0);
            const rr = (candidateTarget - current) / (current - candidateStop);
            if (rr >= 1.8) {
                atrStop = candidateStop;
                atrTarget = candidateTarget;
            }
        }

        let tier = null;
        let config = null;

        if (percentChange >= MOMENTUM_CONFIG.tier3.threshold) {
            if (volumeRatio >= MOMENTUM_CONFIG.tier3.volumeRatio &&
                volumeToday >= MOMENTUM_CONFIG.tier3.minVolume &&
                rsi >= MOMENTUM_CONFIG.tier3.rsiMin &&
                rsi <= MOMENTUM_CONFIG.tier3.rsiMax) {
                tier = 'tier3';
                config = MOMENTUM_CONFIG.tier3;
            }
        } else if (percentChange >= MOMENTUM_CONFIG.tier2.threshold) {
            if (volumeRatio >= MOMENTUM_CONFIG.tier2.volumeRatio &&
                volumeToday >= MOMENTUM_CONFIG.tier2.minVolume &&
                rsi >= MOMENTUM_CONFIG.tier2.rsiMin &&
                rsi <= MOMENTUM_CONFIG.tier2.rsiMax) {
                tier = 'tier2';
                config = MOMENTUM_CONFIG.tier2;
            }
        } else if (percentChange >= MOMENTUM_CONFIG.tier1.threshold) {
            if (volumeRatio >= MOMENTUM_CONFIG.tier1.volumeRatio &&
                volumeToday >= MOMENTUM_CONFIG.tier1.minVolume &&
                rsi >= MOMENTUM_CONFIG.tier1.rsiMin &&
                rsi <= MOMENTUM_CONFIG.tier1.rsiMax) {
                tier = 'tier1';
                config = MOMENTUM_CONFIG.tier1;
            }
        }

        if (!tier || !config) return null;

        const tierPositions = Array.from(positions.values())
            .filter(p => p.tier === tier).length;

        if (tierPositions >= config.maxPositions) return null;

        // [v3.2] Strategy Bridge confirmation — ensemble signal from Python strategies
        const bridgeResult = await queryStrategyBridge(symbol, bars, 'stock');
        if (bridgeResult !== null) {
            if (!bridgeResult.should_enter || bridgeResult.direction !== 'long') {
                console.log(`[Bridge] ${symbol} rejected — bridge says ${bridgeResult.direction} (conf: ${(bridgeResult.confidence || 0).toFixed(2)}): ${bridgeResult.reason || ''}`);
                return null;
            }
            console.log(`[Bridge] ${symbol} confirmed ✓ conf: ${(bridgeResult.confidence || 0).toFixed(2)}`);
        }

        return {
            symbol,
            price: current,
            percentChange: percentChange.toFixed(2),
            volumeRatio: volumeRatio.toFixed(2),
            volume: volumeToday,
            rsi: rsi.toFixed(2),
            vwap: vwap ? vwap.toFixed(2) : null,
            tier,
            strategy: 'momentum',
            config,
            entryVolume: volumeToday,
            atrStop,    // [v3.2] ATR-based stop price (null if not applicable)
            atrTarget   // [v3.2] ATR-based target price (null if not applicable)
        };

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
        const positionSize = equity * config.positionSize;
        if (!signal.price || signal.price <= 0) {
            console.log(`⚠️  [SKIP] ${signal.symbol}: invalid price ${signal.price}`);
            return null;
        }
        const shares = Math.floor(positionSize / signal.price);

        if (shares < 1) {
            console.log(`⚠️  [SKIP] ${signal.symbol}: position size $${positionSize.toFixed(0)} too small to buy 1 share @ $${signal.price} (need $${Math.ceil(signal.price)} min)`);
            return null;
        }

        // [v3.2] Prefer ATR-based stops when they provide >= 1.8:1 R:R, else use config defaults
        const stopPrice = (signal.atrStop || signal.price * (1 - config.stopLoss)).toFixed(2);
        const targetPrice = (signal.atrTarget || signal.price * (1 + config.profitTarget)).toFixed(2);
        if (signal.atrStop) console.log(`   [ATR Stops] Using volatility-adapted: Stop $${stopPrice}, Target $${targetPrice}`);

        const orderUrl = `${alpacaConfig.baseURL}/v2/orders`;
        const orderResponse = await axios.post(orderUrl, {
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

        const entryTime = new Date();
        positions.set(signal.symbol, {
            symbol: signal.symbol,
            shares,
            entry: signal.price,
            stopLoss: parseFloat(stopPrice),
            target: parseFloat(targetPrice),
            strategy,
            tier,
            config,
            entryTime,                          // FIX: stored as Date object
            entryVolume: signal.entryVolume,
            rsi: signal.rsi,
            vwap: signal.vwap,
            volumeRatio: signal.volumeRatio,
            percentChange: signal.percentChange
        });
        savePositions();

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

        tradesPerSymbol.set(signal.symbol, (tradesPerSymbol.get(signal.symbol) || 0) + 1);
        totalTradesToday++;

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

        // Record performance data (fix: now tracks wins/losses)
        if (position && currentPrice) {
            recordTradeClose(symbol, position.entry, currentPrice, parseFloat(qty), reason);
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

        positions.delete(symbol);
        savePositions();
        savePerfData();

    } catch (error) {
        console.error(`❌ Error closing ${symbol}:`, error.message);
    }
}

// API Routes (same as before)
app.get('/api/trading/status', async (req, res) => {
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
                strategy: 'improved-unified',
                openTime: entryTime,
                confidence: 0.85
            };
        });

        // Update perf data with live equity
        perfData.activePositions = positionsData.length;
        savePerfData();

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

        for (const [symbol, pos] of positions) {
            try {
                const posUrl = `${alpacaConfig.baseURL}/v2/positions/${symbol}`;
                const posRes = await axios.get(posUrl, {
                    headers: {
                        'APCA-API-KEY-ID': alpacaConfig.apiKey,
                        'APCA-API-SECRET-KEY': alpacaConfig.secretKey,
                    },
                });
                const currentPrice = parseFloat(posRes.data.current_price);
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
        if (maxDailyLoss !== undefined && typeof maxDailyLoss === 'number' && maxDailyLoss > 0) {
            MAX_DAILY_LOSS = maxDailyLoss;
        }
        if (maxDrawdown !== undefined && typeof maxDrawdown === 'number' && maxDrawdown > 0 && maxDrawdown <= 100) {
            MAX_DRAWDOWN_PCT = maxDrawdown;
        }
        if (maxTradesPerDay !== undefined && typeof maxTradesPerDay === 'number' && maxTradesPerDay > 0) {
            MAX_TRADES_PER_DAY = maxTradesPerDay;
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

app.post('/api/config/credentials', requireApiSecret, async (req, res) => {
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

        let updated = 0;
        for (const [key, value] of Object.entries(creds)) {
            if (!allowed.includes(key)) continue;
            if (typeof value !== 'string' || value === '') continue;
            // Apply immediately in-memory
            process.env[key] = value;
            // Persist to Railway env vars so they survive redeploys
            await persistEnvVar(key, value);
            updated++;
        }

        console.log(`⚙️  Credentials updated: broker=${broker} keys=${updated}`);

        // Refresh in-memory broker config
        if (broker === 'alpaca') {
            if (creds.ALPACA_API_KEY)    alpacaConfig.apiKey    = creds.ALPACA_API_KEY;
            if (creds.ALPACA_SECRET_KEY) alpacaConfig.secretKey = creds.ALPACA_SECRET_KEY;
            if (creds.ALPACA_BASE_URL)   alpacaConfig.baseURL   = creds.ALPACA_BASE_URL;
        }

        res.json({ success: true, updated });
    } catch (err) {
        console.error('Credentials update error:', err.message);
        res.status(500).json({ success: false, error: 'Failed to save credentials' });
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
    try {
        const reportPath = path.join(DATA_DIR, 'backtest-report.json');
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        res.json({ success: true, data: report });
    } catch {
        res.status(404).json({ success: false, error: 'No backtest report found' });
    }
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
            for (const [symbol, pos] of positions) {
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

async function tradingLoop() {
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
                console.log(`⏸  Market not in optimal trading window (${now.toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} EST) - skipping scan`);
            }
        }
    } catch (err) {
        console.error('❌ Stock trading loop error:', err.message);
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

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

    initDb().catch(e => console.warn('Auth DB init error:', e.message));
    await tradingLoop();
    setInterval(() => tradingLoop().catch(e => console.error('❌ Stock loop crashed:', e)), 60000);
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
