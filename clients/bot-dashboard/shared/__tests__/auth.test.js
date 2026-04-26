const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const {
    requireApiSecret,
    requireJwt,
    requireJwtOrApiSecret,
    getEncryptionKey,
    encryptCredential,
    decryptCredential,
    signTokens,
    registerAuthRoutes,
} = require('../auth');

// ── Test helpers ─────────────────────────────────────────────────────────────

function mockReqRes(headers = {}, body = {}) {
    const req = { headers, body, user: null };
    const res = {
        _status: null,
        _json: null,
        status(code) { res._status = code; return res; },
        json(data) { res._json = data; return res; },
    };
    return { req, res };
}

// ── requireApiSecret ─────────────────────────────────────────────────────────

describe('requireApiSecret', () => {
    const origEnv = process.env.NEXUS_API_SECRET;
    afterEach(() => { process.env.NEXUS_API_SECRET = origEnv; });

    test('rejects request when NEXUS_API_SECRET is not configured (fail-closed)', () => {
        delete process.env.NEXUS_API_SECRET;
        const { req, res } = mockReqRes();
        requireApiSecret(req, res, () => { throw new Error('should not call next'); });
        expect(res._status).toBe(401);
    });

    test('allows request with correct Bearer secret', (done) => {
        process.env.NEXUS_API_SECRET = 'test-secret-123';
        const { req, res } = mockReqRes({ authorization: 'Bearer test-secret-123' });
        requireApiSecret(req, res, () => done());
    });

    test('rejects request with wrong secret', () => {
        process.env.NEXUS_API_SECRET = 'test-secret-123';
        const { req, res } = mockReqRes({ authorization: 'Bearer wrong' });
        requireApiSecret(req, res, () => { throw new Error('should not call next'); });
        expect(res._status).toBe(401);
    });

    test('rejects request with no auth header', () => {
        process.env.NEXUS_API_SECRET = 'test-secret-123';
        const { req, res } = mockReqRes();
        requireApiSecret(req, res, () => { throw new Error('should not call next'); });
        expect(res._status).toBe(401);
    });
});

// ── requireJwt ───────────────────────────────────────────────────────────────

describe('requireJwt', () => {
    const origEnv = process.env.JWT_SECRET;
    afterEach(() => { process.env.JWT_SECRET = origEnv; });

    test('sets req.user and calls next for valid token', (done) => {
        process.env.JWT_SECRET = 'test-jwt-secret';
        const token = jwt.sign({ sub: 1, email: 'a@b.com' }, 'test-jwt-secret', { expiresIn: '1h' });
        const { req, res } = mockReqRes({ authorization: `Bearer ${token}` });
        requireJwt(req, res, () => {
            expect(req.user.sub).toBe(1);
            expect(req.user.email).toBe('a@b.com');
            done();
        });
    });

    test('rejects missing Bearer header', () => {
        const { req, res } = mockReqRes();
        requireJwt(req, res, () => { throw new Error('should not call next'); });
        expect(res._status).toBe(401);
        expect(res._json.error).toMatch(/Missing token/);
    });

    test('rejects expired token', () => {
        process.env.JWT_SECRET = 'test-jwt-secret';
        const token = jwt.sign({ sub: 1 }, 'test-jwt-secret', { expiresIn: '-1s' });
        const { req, res } = mockReqRes({ authorization: `Bearer ${token}` });
        requireJwt(req, res, () => { throw new Error('should not call next'); });
        expect(res._status).toBe(401);
        expect(res._json.error).toMatch(/Invalid or expired/);
    });
});

// ── requireJwtOrApiSecret ────────────────────────────────────────────────────

describe('requireJwtOrApiSecret', () => {
    const origJwt = process.env.JWT_SECRET;
    const origApi = process.env.NEXUS_API_SECRET;
    afterEach(() => {
        process.env.JWT_SECRET = origJwt;
        process.env.NEXUS_API_SECRET = origApi;
    });

    test('accepts valid JWT', (done) => {
        process.env.JWT_SECRET = 'test-jwt-secret';
        const token = jwt.sign({ sub: 1, email: 'a@b.com' }, 'test-jwt-secret', { expiresIn: '1h' });
        const { req, res } = mockReqRes({ authorization: `Bearer ${token}` });
        requireJwtOrApiSecret(req, res, () => {
            expect(req.user.sub).toBe(1);
            done();
        });
    });

    test('accepts valid API secret when JWT is invalid', (done) => {
        process.env.NEXUS_API_SECRET = 'my-secret';
        const { req, res } = mockReqRes({ authorization: 'Bearer my-secret' });
        requireJwtOrApiSecret(req, res, () => done());
    });

    test('rejects when neither JWT nor API secret matches', () => {
        process.env.JWT_SECRET = 'test-jwt-secret';
        process.env.NEXUS_API_SECRET = 'my-secret';
        const { req, res } = mockReqRes({ authorization: 'Bearer garbage' });
        requireJwtOrApiSecret(req, res, () => { throw new Error('should not call next'); });
        expect(res._status).toBe(401);
    });
});

// ── Encryption ───────────────────────────────────────────────────────────────

describe('encryption', () => {
    const origKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    const origJwt = process.env.JWT_SECRET;
    afterEach(() => {
        process.env.CREDENTIAL_ENCRYPTION_KEY = origKey;
        process.env.JWT_SECRET = origJwt;
    });

    test('getEncryptionKey returns 32-byte buffer from hex key', () => {
        process.env.CREDENTIAL_ENCRYPTION_KEY = 'a'.repeat(64);
        const key = getEncryptionKey();
        expect(Buffer.isBuffer(key)).toBe(true);
        expect(key.length).toBe(32);
    });

    test('getEncryptionKey hashes non-hex key', () => {
        process.env.CREDENTIAL_ENCRYPTION_KEY = 'not-hex-but-still-a-key';
        const key = getEncryptionKey();
        expect(key.length).toBe(32);
    });

    test('getEncryptionKey falls back to JWT_SECRET hash', () => {
        delete process.env.CREDENTIAL_ENCRYPTION_KEY;
        process.env.JWT_SECRET = 'test-secret';
        const key = getEncryptionKey();
        expect(key.length).toBe(32);
    });

    test('encrypt/decrypt roundtrip preserves plaintext', () => {
        process.env.CREDENTIAL_ENCRYPTION_KEY = 'b'.repeat(64);
        const plaintext = 'my-super-secret-api-key';
        const encrypted = encryptCredential(plaintext);
        expect(encrypted).not.toBe(plaintext);
        expect(encrypted.split(':').length).toBe(3);
        const decrypted = decryptCredential(encrypted);
        expect(decrypted).toBe(plaintext);
    });

    test('decrypt throws on malformed input', () => {
        process.env.CREDENTIAL_ENCRYPTION_KEY = 'c'.repeat(64);
        expect(() => decryptCredential('not-valid')).toThrow('Invalid encrypted format');
    });

    test('decrypt throws on tampered ciphertext', () => {
        process.env.CREDENTIAL_ENCRYPTION_KEY = 'd'.repeat(64);
        const encrypted = encryptCredential('test');
        const parts = encrypted.split(':');
        parts[2] = 'ff' + parts[2].slice(2); // tamper
        expect(() => decryptCredential(parts.join(':'))).toThrow();
    });
});

// ── signTokens ───────────────────────────────────────────────────────────────

describe('signTokens', () => {
    const origJwt = process.env.JWT_SECRET;
    const origRefresh = process.env.JWT_REFRESH_SECRET;
    afterEach(() => {
        process.env.JWT_SECRET = origJwt;
        process.env.JWT_REFRESH_SECRET = origRefresh;
    });

    test('returns accessToken and refreshToken', () => {
        process.env.JWT_SECRET = 'test-jwt';
        process.env.JWT_REFRESH_SECRET = 'test-refresh';
        const tokens = signTokens(42, 'user@test.com');
        expect(tokens).toHaveProperty('accessToken');
        expect(tokens).toHaveProperty('refreshToken');

        const access = jwt.verify(tokens.accessToken, 'test-jwt');
        expect(access.sub).toBe(42);
        expect(access.email).toBe('user@test.com');

        const refresh = jwt.verify(tokens.refreshToken, 'test-refresh');
        expect(refresh.sub).toBe(42);
    });
});

// ── registerAuthRoutes ───────────────────────────────────────────────────────

describe('registerAuthRoutes', () => {
    test('registers 8 routes on the app', () => {
        const routes = [];
        const fakeApp = {
            post: (path, ...handlers) => routes.push({ method: 'POST', path }),
            get: (path, ...handlers) => routes.push({ method: 'GET', path }),
        };
        registerAuthRoutes(fakeApp, () => null);
        expect(routes).toEqual(expect.arrayContaining([
            expect.objectContaining({ method: 'POST', path: '/api/auth/dev-login' }),
            expect.objectContaining({ method: 'POST', path: '/api/auth/register' }),
            expect.objectContaining({ method: 'POST', path: '/api/auth/login' }),
            expect.objectContaining({ method: 'POST', path: '/api/auth/forgot-password' }),
            expect.objectContaining({ method: 'POST', path: '/api/auth/reset-password' }),
            expect.objectContaining({ method: 'POST', path: '/api/auth/refresh' }),
            expect.objectContaining({ method: 'POST', path: '/api/auth/logout' }),
            expect.objectContaining({ method: 'GET', path: '/api/auth/me' }),
        ]));
        expect(routes.length).toBe(8);
    });
});
