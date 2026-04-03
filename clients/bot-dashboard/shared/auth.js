/**
 * Shared authentication and encryption module.
 *
 * Extracted from inline code in unified-trading-bot.js, unified-crypto-bot.js,
 * and unified-forex-bot.js. All three bots had byte-identical implementations
 * of these 7 functions and 8 auth routes.
 *
 * Usage in bots:
 *   const { requireApiSecret, requireJwt, requireJwtOrApiSecret,
 *           encryptCredential, decryptCredential, signTokens,
 *           registerAuthRoutes } = require('./shared/auth');
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

// ── Middleware ────────────────────────────────────────────────────────────────

function requireApiSecret(req, res, next) {
    const secret = process.env.NEXUS_API_SECRET;
    if (!secret) return next(); // not configured — allow (startup / local dev)
    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${secret}`) return next();
    return res.status(401).json({ success: false, error: 'Unauthorized' });
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

// ── Encryption (AES-256-GCM) ─────────────────────────────────────────────────

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

// ── Token signing ────────────────────────────────────────────────────────────

function signTokens(userId, email) {
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';
    const accessToken = jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = jwt.sign({ sub: userId, email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    return { accessToken, refreshToken };
}

// ── Auth route registration ──────────────────────────────────────────────────

/**
 * Registers all auth endpoints on the given Express app.
 * @param {import('express').Application} app - Express app
 * @param {Function} getDbPool - Returns current dbPool (or null)
 */
function registerAuthRoutes(app, getDbPool) {
    const authRateLimit = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error: 'Too many requests — try again in 15 minutes' },
        skip: () => process.env.NODE_ENV === 'test',
    });

    // Dev-only login for local development without DATABASE_URL
    app.post('/api/auth/dev-login', authRateLimit, async (req, res) => {
        const dbPool = getDbPool();
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
            user: { id: email, email, name: name || email.split('@')[0], role: 'user' },
            ...tokens
        });
    });

    app.post('/api/auth/register', authRateLimit, async (req, res) => {
        const dbPool = getDbPool();
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
        const dbPool = getDbPool();
        if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
        const { email, password } = req.body || {};
        if (!email || !password) return res.status(400).json({ success: false, error: 'Email and password required' });
        try {
            const result = await dbPool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase().trim()]);
            if (!result.rows || result.rows.length === 0) {
                return res.status(401).json({ success: false, error: 'Invalid email or password' });
            }
            const user = result.rows[0];
            if (!(await bcrypt.compare(password, user.password_hash))) {
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
        const dbPool = getDbPool();
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
        const dbPool = getDbPool();
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
        const dbPool = getDbPool();
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
        const dbPool = getDbPool();
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
        const dbPool = getDbPool();
        if (!dbPool) return res.status(503).json({ success: false, error: 'Auth service unavailable' });
        try {
            const result = await dbPool.query('SELECT id, email, name, role FROM users WHERE id=$1', [req.user.sub]);
            if (!result.rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
            res.json({ success: true, user: result.rows[0] });
        } catch (e) {
            res.status(500).json({ success: false, error: 'Failed to fetch user' });
        }
    });
}

module.exports = {
    requireApiSecret,
    requireJwt,
    requireJwtOrApiSecret,
    getEncryptionKey,
    encryptCredential,
    decryptCredential,
    signTokens,
    registerAuthRoutes,
};
