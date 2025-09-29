/**
 * OAuth Client for NexusTradeAI
 * OAuth 2.0 authentication client for third-party integrations
 */

const axios = require('axios');
const crypto = require('crypto');
const { URLSearchParams } = require('url');

class OAuthClient {
  constructor(config = {}) {
    this.clientId = config.clientId || process.env.OAUTH_CLIENT_ID;
    this.clientSecret = config.clientSecret || process.env.OAUTH_CLIENT_SECRET;
    this.redirectUri = config.redirectUri || process.env.OAUTH_REDIRECT_URI;
    this.scope = config.scope || 'read write';
    this.authorizationUrl = config.authorizationUrl;
    this.tokenUrl = config.tokenUrl;
    this.userInfoUrl = config.userInfoUrl;
    this.revokeUrl = config.revokeUrl;

    if (!this.clientId || !this.clientSecret) {
      throw new Error('OAuth client ID and secret are required');
    }
  }

  /**
   * Generate authorization URL with PKCE
   */
  generateAuthorizationUrl(state = null, codeChallenge = null) {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: this.scope,
      state: state || this.generateState(),
    });

    if (codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    return `${this.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code, codeVerifier = null) {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        redirect_uri: this.redirectUri,
      });

      if (codeVerifier) {
        params.append('code_verifier', codeVerifier);
      }

      const response = await axios.post(this.tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      return {
        success: true,
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        tokenType: response.data.token_type || 'Bearer',
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken) {
    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      });

      const response = await axios.post(this.tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      });

      return {
        success: true,
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken,
        tokenType: response.data.token_type || 'Bearer',
        expiresIn: response.data.expires_in,
        scope: response.data.scope
      };
    } catch (error) {
      throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Get user information using access token
   */
  async getUserInfo(accessToken) {
    try {
      const response = await axios.get(this.userInfoUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      });

      return {
        success: true,
        user: response.data
      };
    } catch (error) {
      throw new Error(`Failed to get user info: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Revoke access token
   */
  async revokeToken(token, tokenTypeHint = 'access_token') {
    try {
      const params = new URLSearchParams({
        token: token,
        token_type_hint: tokenTypeHint,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      await axios.post(this.revokeUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Token revocation failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCE() {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    return {
      codeVerifier,
      codeChallenge
    };
  }

  /**
   * Generate random state parameter
   */
  generateState() {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Validate state parameter
   */
  validateState(receivedState, expectedState) {
    return receivedState === expectedState;
  }
}

module.exports = OAuthClient;