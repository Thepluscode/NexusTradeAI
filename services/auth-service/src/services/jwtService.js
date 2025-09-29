const jwt = require('jsonwebtoken');

class JWTService {
  constructor() {
    this.accessTokenSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.refreshTokenSecret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
    this.accessTokenExpiry = process.env.JWT_EXPIRY || '15m';
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d';
  }

  generateTokens(user) {
    const payload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role
    };

    const accessToken = jwt.sign(payload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'auth-service',
      subject: user._id.toString()
    });

    const refreshToken = jwt.sign(
      { userId: user._id.toString() },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
        issuer: 'auth-service',
        subject: user._id.toString()
      }
    );

    return { accessToken, refreshToken };
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.accessTokenSecret);
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.refreshTokenSecret);
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  decodeToken(token) {
    return jwt.decode(token);
  }
}

module.exports = new JWTService();