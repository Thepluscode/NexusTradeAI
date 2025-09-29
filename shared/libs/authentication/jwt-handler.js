/**
 * JWT Handler for NexusTradeAI
 * High-performance JWT token management with trading-specific features
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { promisify } = require('util');
const Redis = require('ioredis');

class JWTHandler {
  constructor(options = {}) {
    this.secretKey = options.secretKey || process.env.JWT_SECRET_KEY;
    this.refreshSecretKey = options.refreshSecretKey || process.env.JWT_REFRESH_SECRET_KEY;
    this.issuer = options.issuer || 'nexustrade-ai';
    this.audience = options.audience || 'nexustrade-users';
    this.accessTokenExpiry = options.accessTokenExpiry || '15m';
    this.refreshTokenExpiry = options.refreshTokenExpiry || '7d';
    this.algorithm = options.algorithm || 'HS256';

    // Redis client for token blacklisting and session management
    this.redis = options.redis || new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Trading-specific token features
    this.tradingSessionTimeout = options.tradingSessionTimeout || '1h';
    this.maxConcurrentSessions = options.maxConcurrentSessions || 3;

    if (!this.secretKey || !this.refreshSecretKey) {
      throw new Error('JWT secret keys are required');
    }
  }

  /**
   * Generate access token with trading permissions
   */
  async generateAccessToken(payload, options = {}) {
    try {
      const tokenPayload = {
        ...payload,
        iss: this.issuer,
        aud: this.audience,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        type: 'access'
      };

      // Add trading-specific claims
      if (payload.tradingPermissions) {
        tokenPayload.trading = {
          permissions: payload.tradingPermissions,
          riskLevel: payload.riskLevel || 'standard',
          maxOrderValue: payload.maxOrderValue || 10000,
          allowedExchanges: payload.allowedExchanges || ['NYSE', 'NASDAQ'],
          sessionId: crypto.randomUUID()
        };
      }

      const token = jwt.sign(tokenPayload, this.secretKey, {
        expiresIn: options.expiresIn || this.accessTokenExpiry,
        algorithm: this.algorithm
      });

      // Store token metadata in Redis for session management
      await this.storeTokenMetadata(tokenPayload.jti, {
        userId: payload.sub || payload.userId,
        sessionId: tokenPayload.trading?.sessionId,
        type: 'access',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.parseExpiry(this.accessTokenExpiry)).toISOString()
      });

      return {
        token,
        tokenId: tokenPayload.jti,
        expiresIn: this.parseExpiry(this.accessTokenExpiry),
        sessionId: tokenPayload.trading?.sessionId
      };
    } catch (error) {
      throw new Error(`Failed to generate access token: ${error.message}`);
    }
  }

  /**
   * Generate refresh token
   */
  async generateRefreshToken(payload, options = {}) {
    try {
      const tokenPayload = {
        sub: payload.sub || payload.userId,
        iss: this.issuer,
        aud: this.audience,
        iat: Math.floor(Date.now() / 1000),
        jti: crypto.randomUUID(),
        type: 'refresh'
      };

      const token = jwt.sign(tokenPayload, this.refreshSecretKey, {
        expiresIn: options.expiresIn || this.refreshTokenExpiry,
        algorithm: this.algorithm
      });

      // Store refresh token metadata
      await this.storeTokenMetadata(tokenPayload.jti, {
        userId: payload.sub || payload.userId,
        type: 'refresh',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + this.parseExpiry(this.refreshTokenExpiry)).toISOString()
      });

      return {
        token,
        tokenId: tokenPayload.jti,
        expiresIn: this.parseExpiry(this.refreshTokenExpiry)
      };
    } catch (error) {
      throw new Error(`Failed to generate refresh token: ${error.message}`);
    }
  }

  /**
   * Verify and decode token
   */
  async verifyToken(token, options = {}) {
    try {
      const secretKey = options.type === 'refresh' ? this.refreshSecretKey : this.secretKey;

      const decoded = jwt.verify(token, secretKey, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: [this.algorithm]
      });

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(decoded.jti);
      if (isBlacklisted) {
        throw new Error('Token has been revoked');
      }

      // Validate trading session if applicable
      if (decoded.trading && decoded.trading.sessionId) {
        const isValidSession = await this.validateTradingSession(decoded.trading.sessionId, decoded.sub);
        if (!isValidSession) {
          throw new Error('Trading session is invalid or expired');
        }
      }

      return {
        valid: true,
        decoded,
        tokenId: decoded.jti
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        code: this.getErrorCode(error)
      };
    }
  }
}

module.exports = JWTHandler;