// /clients/web-app/src/services/authentication.ts
import { apiClient } from './api';

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
  rememberMe?: boolean;
}

export interface RegisterData {
  email: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  country: string;
  termsAccepted: boolean;
  marketingConsent?: boolean;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  accountType: 'retail' | 'professional' | 'institutional';
  subscriptionTier: 'basic' | 'premium' | 'pro' | 'enterprise';
  permissions: string[];
  kycStatus: 'pending' | 'approved' | 'rejected';
  twoFactorEnabled: boolean;
  lastLogin: string;
  createdAt: string;
  profile: {
    avatar?: string;
    timezone: string;
    language: string;
    currency: string;
    tradingExperience: 'beginner' | 'intermediate' | 'advanced' | 'professional';
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  };
}

export interface AuthResponse {
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: number;
  permissions: string[];
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordReset {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

export interface TwoFactorSetup {
  secret: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

class AuthenticationService {
  private tokenKey = 'nexus_auth_token';
  private refreshTokenKey = 'nexus_refresh_token';
  private userKey = 'nexus_user';
  private tokenExpiryKey = 'nexus_token_expiry';

  // Authentication
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const response = await apiClient.post('/auth/login', credentials);
      const authData: AuthResponse = response.data;
      
      this.storeAuthData(authData);
      this.scheduleTokenRefresh(authData.expiresAt);
      
      return authData;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Login failed');
    }
  }

  async register(userData: RegisterData): Promise<{ message: string; requiresVerification: boolean }> {
    try {
      const response = await apiClient.post('/auth/register', userData);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Registration failed');
    }
  }

  async logout(): Promise<void> {
    try {
      const refreshToken = this.getRefreshToken();
      if (refreshToken) {
        await apiClient.post('/auth/logout', { refreshToken });
      }
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      this.clearAuthData();
    }
  }

  async refreshToken(): Promise<AuthResponse> {
    try {
      const refreshToken = this.getRefreshToken();
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await apiClient.post('/auth/refresh', { refreshToken });
      const authData: AuthResponse = response.data;
      
      this.storeAuthData(authData);
      this.scheduleTokenRefresh(authData.expiresAt);
      
      return authData;
    } catch (error: any) {
      this.clearAuthData();
      throw new Error(error.response?.data?.message || 'Token refresh failed');
    }
  }

  // Password Management
  async requestPasswordReset(data: PasswordResetRequest): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/forgot-password', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Password reset request failed');
    }
  }

  async resetPassword(data: PasswordReset): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/reset-password', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Password reset failed');
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/change-password', {
        currentPassword,
        newPassword
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Password change failed');
    }
  }

  // Two-Factor Authentication
  async enable2FA(): Promise<TwoFactorSetup> {
    try {
      const response = await apiClient.post('/auth/2fa/enable');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to enable 2FA');
    }
  }

  async verify2FA(code: string, secret: string): Promise<{ success: boolean; backupCodes: string[] }> {
    try {
      const response = await apiClient.post('/auth/2fa/verify', { code, secret });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || '2FA verification failed');
    }
  }

  async disable2FA(code: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/2fa/disable', { code });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to disable 2FA');
    }
  }

  async regenerateBackupCodes(): Promise<string[]> {
    try {
      const response = await apiClient.post('/auth/2fa/regenerate-backup-codes');
      return response.data.backupCodes;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to regenerate backup codes');
    }
  }

  // Email Verification
  async verifyEmail(token: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/verify-email', { token });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Email verification failed');
    }
  }

  async resendVerificationEmail(): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/resend-verification');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to resend verification email');
    }
  }

  // Profile Management
  async updateProfile(updates: Partial<User['profile']>): Promise<User> {
    try {
      const response = await apiClient.put('/auth/profile', updates);
      const updatedUser = response.data;
      this.storeUser(updatedUser);
      return updatedUser;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Profile update failed');
    }
  }

  async uploadAvatar(file: File): Promise<{ avatarUrl: string }> {
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await apiClient.post('/auth/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Avatar upload failed');
    }
  }

  // Session Management
  async getActiveSessions(): Promise<Array<{
    id: string;
    device: string;
    location: string;
    ipAddress: string;
    lastActivity: string;
    current: boolean;
  }>> {
    try {
      const response = await apiClient.get('/auth/sessions');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch sessions');
    }
  }

  async revokeSession(sessionId: string): Promise<{ message: string }> {
    try {
      const response = await apiClient.delete(`/auth/sessions/${sessionId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to revoke session');
    }
  }

  async revokeAllSessions(): Promise<{ message: string }> {
    try {
      const response = await apiClient.delete('/auth/sessions');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to revoke all sessions');
    }
  }

  // Token Management
  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.tokenKey);
  }

  getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.refreshTokenKey);
  }

  getUser(): User | null {
    if (typeof window === 'undefined') return null;
    const userJson = localStorage.getItem(this.userKey);
    return userJson ? JSON.parse(userJson) : null;
  }

  isAuthenticated(): boolean {
    const token = this.getToken();
    const expiry = this.getTokenExpiry();
    
    if (!token || !expiry) return false;
    
    return Date.now() < expiry;
  }

  isTokenExpiringSoon(): boolean {
    const expiry = this.getTokenExpiry();
    if (!expiry) return false;
    
    // Check if token expires within 5 minutes
    return Date.now() > (expiry - 5 * 60 * 1000);
  }

  hasPermission(permission: string): boolean {
    const user = this.getUser();
    return user?.permissions?.includes(permission) || false;
  }

  hasRole(role: string): boolean {
    const user = this.getUser();
    return user?.accountType === role;
  }

  // Private methods
  private storeAuthData(authData: AuthResponse): void {
    if (typeof window === 'undefined') return;
    
    localStorage.setItem(this.tokenKey, authData.token);
    localStorage.setItem(this.refreshTokenKey, authData.refreshToken);
    localStorage.setItem(this.userKey, JSON.stringify(authData.user));
    localStorage.setItem(this.tokenExpiryKey, authData.expiresAt.toString());
  }

  private storeUser(user: User): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.userKey, JSON.stringify(user));
  }

  private clearAuthData(): void {
    if (typeof window === 'undefined') return;
    
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem(this.tokenExpiryKey);
  }

  private getTokenExpiry(): number | null {
    if (typeof window === 'undefined') return null;
    const expiry = localStorage.getItem(this.tokenExpiryKey);
    return expiry ? parseInt(expiry, 10) : null;
  }

  private scheduleTokenRefresh(expiresAt: number): void {
    // Schedule refresh 5 minutes before expiry
    const refreshTime = expiresAt - Date.now() - (5 * 60 * 1000);
    
    if (refreshTime > 0) {
      setTimeout(() => {
        this.refreshToken().catch(error => {
          console.error('Automatic token refresh failed:', error);
          // Trigger logout if refresh fails
          this.logout();
        });
      }, refreshTime);
    }
  }

  // Security utilities
  async validateToken(): Promise<boolean> {
    try {
      const response = await apiClient.get('/auth/validate');
      return response.data.valid;
    } catch (error) {
      return false;
    }
  }

  async checkSecurityQuestions(): Promise<boolean> {
    try {
      const response = await apiClient.get('/auth/security-questions/check');
      return response.data.hasQuestions;
    } catch (error) {
      return false;
    }
  }

  async setupSecurityQuestions(questions: Array<{
    question: string;
    answer: string;
  }>): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/security-questions', { questions });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to setup security questions');
    }
  }

  // Account security
  async getSecurityLog(): Promise<Array<{
    id: string;
    action: string;
    timestamp: string;
    ipAddress: string;
    device: string;
    location: string;
    status: 'success' | 'failed' | 'blocked';
  }>> {
    try {
      const response = await apiClient.get('/auth/security-log');
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch security log');
    }
  }

  async reportSuspiciousActivity(details: {
    description: string;
    timestamp?: string;
    additionalInfo?: string;
  }): Promise<{ message: string }> {
    try {
      const response = await apiClient.post('/auth/report-suspicious', details);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to report suspicious activity');
    }
  }
}

// Export singleton instance
export const authService = new AuthenticationService();
export default AuthenticationService;