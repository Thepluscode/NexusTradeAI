//clients/web-app/src/services/api.ts
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

interface APIConfig {
  baseURL: string;
  timeout: number;
  retries: number;
}

interface APIResponse<T = any> {
  data: T;
  message: string;
  success: boolean;
  timestamp: number;
}

class APIService {
  private instance: AxiosInstance;
  private config: APIConfig;

  constructor(config: APIConfig) {
    this.config = config;
    this.instance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.instance.interceptors.request.use(
      (config) => {
        // Add auth token if available
        const token = localStorage.getItem('access_token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add request timestamp
        config.headers['X-Request-Timestamp'] = Date.now().toString();

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.instance.interceptors.response.use(
      (response: AxiosResponse<APIResponse>) => {
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 (Unauthorized)
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          
          try {
            await this.refreshToken();
            return this.instance(originalRequest);
          } catch (refreshError) {
            // Redirect to login
            window.location.href = '/login';
            return Promise.reject(refreshError);
          }
        }

        // Handle 429 (Rate Limit)
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 1;
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.instance(originalRequest);
        }

        return Promise.reject(error);
      }
    );
  }

  private async refreshToken(): Promise<void> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post(`${this.config.baseURL}/auth/refresh`, {
      refreshToken
    });

    const { accessToken, refreshToken: newRefreshToken } = response.data.data;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', newRefreshToken);
  }

  // Generic request method with retry logic
  private async request<T = any>(
    config: AxiosRequestConfig,
    retries = this.config.retries
  ): Promise<APIResponse<T>> {
    try {
      const response = await this.instance.request<APIResponse<T>>(config);
      return response.data;
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.request(config, retries - 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    return (
      error.code === 'NETWORK_ERROR' ||
      error.code === 'TIMEOUT' ||
      (error.response && error.response.status >= 500)
    );
  }

  // Authentication
  async login(email: string, password: string) {
    return this.request({
      method: 'POST',
      url: '/auth/login',
      data: { email, password }
    });
  }

  async logout() {
    return this.request({
      method: 'POST',
      url: '/auth/logout'
    });
  }

  // Market Data
  async getMarketData(symbols: string[]) {
    return this.request({
      method: 'GET',
      url: '/market-data',
      params: { symbols: symbols.join(',') }
    });
  }

  async getHistoricalData(symbol: string, timeframe: string, limit: number = 1000) {
    return this.request({
      method: 'GET',
      url: `/market-data/${symbol}/history`,
      params: { timeframe, limit }
    });
  }

  async getOrderBook(symbol: string, depth: number = 20) {
    return this.request({
      method: 'GET',
      url: `/market-data/${symbol}/orderbook`,
      params: { depth }
    });
  }

  // Trading
  async submitOrder(order: any) {
    return this.request({
      method: 'POST',
      url: '/trading/orders',
      data: order
    });
  }

  async cancelOrder(orderId: string) {
    return this.request({
      method: 'DELETE',
      url: `/trading/orders/${orderId}`
    });
  }

  async getOrders(status?: string) {
    return this.request({
      method: 'GET',
      url: '/trading/orders',
      params: { status }
    });
  }

  async getPositions() {
    return this.request({
      method: 'GET',
      url: '/trading/positions'
    });
  }

  async getPortfolio() {
    return this.request({
      method: 'GET',
      url: '/trading/portfolio'
    });
  }

  // AI & Analytics
  async getAIInsights(symbol?: string) {
    return this.request({
      method: 'GET',
      url: '/ai/insights',
      params: { symbol }
    });
  }

  async getRiskMetrics() {
    return this.request({
      method: 'GET',
      url: '/analytics/risk'
    });
  }

  async getPerformanceAnalytics(period: string = '1M') {
    return this.request({
      method: 'GET',
      url: '/analytics/performance',
      params: { period }
    });
  }

  // User Management
  async getProfile() {
    return this.request({
      method: 'GET',
      url: '/user/profile'
    });
  }

  async updateProfile(data: any) {
    return this.request({
      method: 'PUT',
      url: '/user/profile',
      data
    });
  }

  async updatePreferences(preferences: any) {
    return this.request({
      method: 'PUT',
      url: '/user/preferences',
      data: preferences
    });
  }
}

// Create API instance
const apiConfig: APIConfig = {
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3001/api',
  timeout: 30000,
  retries: 3
};

export const api = new APIService(apiConfig);
export default api;