const crypto = require('crypto');
const bcrypt = require('bcryptjs');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32;
    this.ivLength = 16;
    this.tagLength = 16;
    this.secretKey = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
  }

  // Hash data using bcrypt (for passwords)
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
  }

  // Verify hashed password
  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  // Hash data using crypto (for tokens)
  hash(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Generate random token
  generateToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  // Encrypt sensitive data
  encrypt(text) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, this.secretKey);
      cipher.setAAD(Buffer.from('auth-service'));
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
      };
    } catch (error) {
      throw new Error('Encryption failed');
    }
  }

  // Decrypt sensitive data
  decrypt(encryptedData) {
    try {
      const { encrypted, iv, tag } = encryptedData;
      const decipher = crypto.createDecipher(this.algorithm, this.secretKey);
      
      decipher.setAuthTag(Buffer.from(tag, 'hex'));
      decipher.setAAD(Buffer.from('auth-service'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed');
    }
  }

  // Generate secure random string
  generateSecureRandom(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      result += chars[randomIndex];
    }
    
    return result;
  }

  // Generate TOTP secret
  generateTOTPSecret() {
    return crypto.randomBytes(20).toString('base32');
  }

  // Generate backup codes
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      codes.push(this.generateSecureRandom(8));
    }
    return codes;
  }
}

module.exports = new EncryptionService();