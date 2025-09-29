import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../store/slices/authSlice';

// API Configuration
const API_BASE_URL = 'http://localhost:3001'; // Replace with your API URL
const API_TIMEOUT = 30000;

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Types
export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
  twoFactorCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
  username: string;
  firstName?: string;
  lastName?: string;
  accountType?: 'retail' | 'professional' | 'institutional';
  agreeToTerms: boolean;
  agreeToPrivacy: boolean;
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: number;
  requiresTwoFactor?: boolean;
}

// Authentication Service
export class AuthenticationService {
  /**
   * Login user with email and password
   */
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/api/auth/login', {
        email: credentials.email.toLowerCase().trim(),
        password: credentials.password,
        rememberMe: credentials.rememberMe || false,
        twoFactorCode: credentials.twoFactorCode,
      });

      // Store tokens securely
      if (credentials.rememberMe) {
        await AsyncStorage.setItem('nexus_refresh_token', response.data.refreshToken);
      }
      await AsyncStorage.setItem('nexus_token', response.data.token);

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  }

  /**
   * Register new user account
   */
  async register(userData: RegisterData): Promise<AuthResponse> {
    try {
      // Validate password strength
      this.validatePassword(userData.password);

      const response = await apiClient.post<AuthResponse>('/api/auth/register', {
        email: userData.email.toLowerCase().trim(),
        password: userData.password,
        username: userData.username.trim(),
        firstName: userData.firstName?.trim(),
        lastName: userData.lastName?.trim(),
        accountType: userData.accountType || 'retail',
        agreeToTerms: userData.agreeToTerms,
        agreeToPrivacy: userData.agreeToPrivacy,
      });

      // Store tokens securely
      await AsyncStorage.setItem('nexus_token', response.data.token);
      await AsyncStorage.setItem('nexus_refresh_token', response.data.refreshToken);

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Registration failed');
    }
  }

  /**
   * Logout user
   */
  async logout(token: string): Promise<void> {
    try {
      await apiClient.post('/api/auth/logout', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      // Continue with logout even if API call fails
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear stored tokens
      await AsyncStorage.multiRemove([
        'nexus_token',
        'nexus_refresh_token',
        'nexus_user_data',
      ]);
    }
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/api/auth/refresh', {
        refreshToken,
      });

      // Update stored token
      await AsyncStorage.setItem('nexus_token', response.data.token);
      if (response.data.refreshToken) {
        await AsyncStorage.setItem('nexus_refresh_token', response.data.refreshToken);
      }

      return response.data;
    } catch (error: any) {
      // Clear invalid refresh token
      await AsyncStorage.removeItem('nexus_refresh_token');
      throw new Error(error.response?.data?.message || 'Token refresh failed');
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(token: string): Promise<{ user: User }> {
    try {
      const response = await apiClient.post<{ user: User }>('/api/auth/verify', {
        token,
      });

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Email verification failed');
    }
  }

  /**
   * Request password reset
   */
  async resetPassword(email: string): Promise<void> {
    try {
      await apiClient.post('/api/auth/reset-password', {
        email: email.toLowerCase().trim(),
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Password reset request failed');
    }
  }

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string, token: string): Promise<void> {
    try {
      // Validate new password
      this.validatePassword(newPassword);

      await apiClient.post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Password change failed');
    }
  }

  /**
   * Enable two-factor authentication
   */
  async enable2FA(token: string): Promise<{ qrCode: string; secret: string; backupCodes: string[] }> {
    try {
      const response = await apiClient.post<{ qrCode: string; secret: string; backupCodes: string[] }>(
        '/api/auth/2fa/enable',
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to enable 2FA');
    }
  }

  /**
   * Verify and complete 2FA setup
   */
  async verify2FA(code: string, token: string): Promise<{ backupCodes: string[] }> {
    try {
      const response = await apiClient.post<{ backupCodes: string[] }>(
        '/api/auth/2fa/verify',
        { code },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || '2FA verification failed');
    }
  }

  /**
   * Disable two-factor authentication
   */
  async disable2FA(password: string, token: string): Promise<void> {
    try {
      await apiClient.post('/api/auth/2fa/disable', {
        password,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to disable 2FA');
    }
  }

  /**
   * Get stored tokens
   */
  async getStoredTokens(): Promise<{ token: string | null; refreshToken: string | null }> {
    try {
      const [token, refreshToken] = await AsyncStorage.multiGet([
        'nexus_token',
        'nexus_refresh_token',
      ]);

      return {
        token: token[1],
        refreshToken: refreshToken[1],
      };
    } catch (error) {
      return { token: null, refreshToken: null };
    }
  }

  /**
   * Validate password strength
   */
  private validatePassword(password: string): void {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      throw new Error(`Password must be at least ${minLength} characters long`);
    }

    if (!hasUpperCase) {
      throw new Error('Password must contain at least one uppercase letter');
    }

    if (!hasLowerCase) {
      throw new Error('Password must contain at least one lowercase letter');
    }

    if (!hasNumbers) {
      throw new Error('Password must contain at least one number');
    }

    if (!hasSpecialChar) {
      throw new Error('Password must contain at least one special character');
    }
  }
}

// Export singleton instance
export const authService = new AuthenticationService();
