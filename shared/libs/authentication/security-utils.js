/**
 * Security Utilities for NexusTradeAI
 * Comprehensive security functions for trading platform
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

class SecurityUtils {
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password, saltRounds = 12) {
    try {
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      throw new Error(`Password hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      throw new Error(`Password verification failed: ${error.message}`);
    }
  }

  /**
   * Generate secure random string
   */
  static generateSecureRandom(length = 32, encoding = 'hex') {
    return crypto.randomBytes(length).toString(encoding);
  }

  /**
   * Generate API key
   */
  static generateApiKey(prefix = 'nta', length = 32) {
    const randomPart = crypto.randomBytes(length).toString('hex');
    return `${prefix}_${randomPart}`;
  }

  /**
   * Hash API key for storage
   */
  static hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Generate TOTP secret for 2FA
   */
  static generateTOTPSecret(name = 'NexusTradeAI', issuer = 'NexusTradeAI') {
    const secret = speakeasy.generateSecret({
      name: name,
      issuer: issuer,
      length: 32
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
      qrCodeUrl: secret.otpauth_url
    };
  }

  /**
   * Verify TOTP token
   */
  static verifyTOTP(token, secret, window = 2) {
    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: token,
      window: window
    });
  }

  /**
   * Generate QR code for TOTP setup
   */
  static async generateQRCode(otpauthUrl) {
    try {
      return await qrcode.toDataURL(otpauthUrl);
    } catch (error) {
      throw new Error(`QR code generation failed: ${error.message}`);
    }
  }

  /**
   * Encrypt sensitive data
   */
  static encrypt(text, key = null) {
    try {
      const encryptionKey = key || process.env.ENCRYPTION_KEY || this.generateSecureRandom(32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', encryptionKey);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        key: key ? null : encryptionKey
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt sensitive data
   */
  static decrypt(encryptedData, key) {
    try {
      const decipher = crypto.createDecipher('aes-256-gcm', key);
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate secure session ID
   */
  static generateSessionId() {
    return crypto.randomUUID();
  }

  /**
   * Create HMAC signature
   */
  static createHMACSignature(data, secret, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  static verifyHMACSignature(data, signature, secret, algorithm = 'sha256') {
    const expectedSignature = this.createHMACSignature(data, secret, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Rate limiting token bucket
   */
  static createRateLimiter(maxTokens = 100, refillRate = 10) {
    return {
      tokens: maxTokens,
      maxTokens: maxTokens,
      refillRate: refillRate,
      lastRefill: Date.now(),

      consume(tokens = 1) {
        const now = Date.now();
        const timePassed = (now - this.lastRefill) / 1000;

        this.tokens = Math.min(
          this.maxTokens,
          this.tokens + (timePassed * this.refillRate)
        );
        this.lastRefill = now;

        if (this.tokens >= tokens) {
          this.tokens -= tokens;
          return true;
        }
        return false;
      }
    };
  }

  /**
   * Sanitize input to prevent injection attacks
   */
  static sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .replace(/[;]/g, '') // Remove semicolons
      .replace(/[\\]/g, '') // Remove backslashes
      .trim();
  }

  /**
   * Validate IP address against whitelist
   */
  static validateIPWhitelist(clientIP, whitelist = []) {
    if (whitelist.length === 0) {
      return true; // No whitelist means all IPs allowed
    }

    return whitelist.some(allowedIP => {
      if (allowedIP.includes('/')) {
        // CIDR notation
        return this.isIPInCIDR(clientIP, allowedIP);
      }
      return clientIP === allowedIP;
    });
  }

  /**
   * Check if IP is in CIDR range
   */
  static isIPInCIDR(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - bits) - 1);
    return (this.ip2int(ip) & mask) === (this.ip2int(range) & mask);
  }

  /**
   * Convert IP to integer
   */
  static ip2int(ip) {
    return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0;
  }
}

module.exports = SecurityUtils;