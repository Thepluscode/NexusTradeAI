import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// API Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api';
const API_TIMEOUT = 30000; // 30 seconds

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add desktop app identifier
    config.headers['X-Client-Type'] = 'desktop';
    config.headers['X-Client-Version'] = process.env.REACT_APP_VERSION || '1.0.0';

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

// API Service Class
export class ApiService {
  // Authentication
  static async login(email: string, password: string) {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  }

  static async logout() {
    const response = await apiClient.post('/auth/logout');
    return response.data;
  }

  static async refreshToken() {
    const response = await apiClient.post('/auth/refresh');
    return response.data;
  }

  // User Profile
  static async getProfile() {
    const response = await apiClient.get('/user/profile');
    return response.data;
  }

  static async updateProfile(data: any) {
    const response = await apiClient.put('/user/profile', data);
    return response.data;
  }

  // Market Data
  static async getSymbols() {
    const response = await apiClient.get('/market/symbols');
    return response.data;
  }

  static async getTicker(symbol: string) {
    const response = await apiClient.get(`/market/ticker/${symbol}`);
    return response.data;
  }

  static async getOrderBook(symbol: string, limit = 100) {
    const response = await apiClient.get(`/market/orderbook/${symbol}?limit=${limit}`);
    return response.data;
  }

  static async getCandles(symbol: string, interval: string, limit = 500) {
    const response = await apiClient.get(`/market/candles/${symbol}?interval=${interval}&limit=${limit}`);
    return response.data;
  }

  // Trading
  static async placeOrder(orderData: any) {
    const response = await apiClient.post('/trading/orders', orderData);
    return response.data;
  }

  static async cancelOrder(orderId: string) {
    const response = await apiClient.delete(`/trading/orders/${orderId}`);
    return response.data;
  }

  static async getOrders(status?: string) {
    const params = status ? `?status=${status}` : '';
    const response = await apiClient.get(`/trading/orders${params}`);
    return response.data;
  }

  static async getOrderHistory(limit = 100) {
    const response = await apiClient.get(`/trading/orders/history?limit=${limit}`);
    return response.data;
  }

  static async getTrades(limit = 100) {
    const response = await apiClient.get(`/trading/trades?limit=${limit}`);
    return response.data;
  }

  // Portfolio
  static async getPortfolio() {
    const response = await apiClient.get('/portfolio');
    return response.data;
  }

  static async getBalances() {
    const response = await apiClient.get('/portfolio/balances');
    return response.data;
  }

  static async getPositions() {
    const response = await apiClient.get('/portfolio/positions');
    return response.data;
  }

  static async getPerformance(period = '30d') {
    const response = await apiClient.get(`/portfolio/performance?period=${period}`);
    return response.data;
  }

  // Analytics
  static async getTechnicalAnalysis(symbol: string, interval = '1d') {
    const response = await apiClient.get(`/analytics/technical/${symbol}?interval=${interval}`);
    return response.data;
  }

  static async getSentimentAnalysis(symbol: string) {
    const response = await apiClient.get(`/analytics/sentiment/${symbol}`);
    return response.data;
  }

  static async getRecommendations() {
    const response = await apiClient.get('/analytics/recommendations');
    return response.data;
  }

  // Risk Management
  static async getRiskMetrics() {
    const response = await apiClient.get('/risk/metrics');
    return response.data;
  }

  static async getVaRAnalysis(confidence = 0.95) {
    const response = await apiClient.get(`/risk/var?confidence=${confidence}`);
    return response.data;
  }

  // Notifications
  static async getNotifications(limit = 50) {
    const response = await apiClient.get(`/notifications?limit=${limit}`);
    return response.data;
  }

  static async markNotificationRead(notificationId: string) {
    const response = await apiClient.put(`/notifications/${notificationId}/read`);
    return response.data;
  }

  // Settings
  static async getSettings() {
    const response = await apiClient.get('/settings');
    return response.data;
  }

  static async updateSettings(settings: any) {
    const response = await apiClient.put('/settings', settings);
    return response.data;
  }

  // Desktop-specific endpoints
  static async syncDesktopState(state: any) {
    const response = await apiClient.post('/desktop/sync', state);
    return response.data;
  }

  static async getDesktopConfig() {
    const response = await apiClient.get('/desktop/config');
    return response.data;
  }

  // Health check
  static async healthCheck() {
    const response = await apiClient.get('/health');
    return response.data;
  }
}

// WebSocket Service for real-time data
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private subscriptions = new Set<string>();

  connect(token?: string) {
    const wsUrl = API_BASE_URL.replace('http', 'ws') + '/ws';
    const url = token ? `${wsUrl}?token=${token}` : wsUrl;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Resubscribe to previous subscriptions
      this.subscriptions.forEach(subscription => {
        this.send({ type: 'subscribe', channel: subscription });
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.subscriptions.clear();
  }

  subscribe(channel: string) {
    this.subscriptions.add(channel);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'subscribe', channel });
    }
  }

  unsubscribe(channel: string) {
    this.subscriptions.delete(channel);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', channel });
    }
  }

  private send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private handleMessage(data: any) {
    // Emit custom events for different message types
    const event = new CustomEvent('websocket-message', { detail: data });
    window.dispatchEvent(event);
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }
}

// Export singleton instance
export const wsService = new WebSocketService();

export default ApiService;
