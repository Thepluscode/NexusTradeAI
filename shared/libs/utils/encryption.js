/**
 * Encryption Utilities for NexusTradeAI
 */

const crypto = require('crypto');

class Encryption {
  static algorithm = 'aes-256-gcm';
  static keyLength = 32;
  static ivLength = 16;

  /**
   * Generate encryption key
   */
  static generateKey() {
    return crypto.randomBytes(this.keyLength);
  }

  /**
   * Encrypt data
   */
  static encrypt(text, key = null) {
    try {
      const encryptionKey = key || this.generateKey();
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, encryptionKey);

      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        key: key ? null : encryptionKey.toString('hex')
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data
   */
  static decrypt(encryptedData, key) {
    try {
      const keyBuffer = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
      const decipher = crypto.createDecipher(this.algorithm, keyBuffer);

      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Hash data
   */
  static hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Generate HMAC
   */
  static hmac(data, secret, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  /**
   * Generate random string
   */
  static randomString(length = 32, encoding = 'hex') {
    return crypto.randomBytes(length).toString(encoding);
  }
}

module.exports = Encryption;