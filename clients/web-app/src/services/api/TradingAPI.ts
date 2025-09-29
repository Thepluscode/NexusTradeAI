// Trading API Service - Centralized API integration for all trading operations

import axios, { AxiosInstance, AxiosResponse } from 'axios';

// API Configuration
const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};

// API Response Types
interface APIResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  timestamp: string;
}

// Trading Data Types
interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high24h: number;
  low24h: number;
  timestamp: number;
}

interface OrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'bracket' | 'oco';
  quantity: number;
  price?: number;
  stopPrice?: number;
  takeProfitPrice?: number;
  stopLossPrice?: number;
  timeInForce: 'DAY' | 'GTC' | 'IOC' | 'FOK';
  assetType: 'crypto' | 'forex' | 'stocks' | 'options';
  // Options specific
  optionType?: 'call' | 'put';
  strike?: number;
  expiration?: string;
}

interface OrderResponse {
  orderId: string;
  clientOrderId: string;
  symbol: string;
  status: 'NEW' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELED' | 'REJECTED';
  executedQty: number;
  cummulativeQuoteQty: number;
  avgPrice: number;
  timestamp: number;
}

interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  margin: number;
  leverage: number;
  liquidationPrice?: number;
  timestamp: number;
}

interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  timestamp: number;
  status: 'filled' | 'partial' | 'cancelled';
}

interface Portfolio {
  totalValue: number;
  availableBalance: number;
  marginUsed: number;
  unrealizedPnl: number;
  realizedPnl: number;
  positions: Position[];
}

interface RiskMetrics {
  portfolioVaR: number;
  marginUtilization: number;
  liquidationRisk: 'low' | 'medium' | 'high' | 'critical';
  concentrationRisk: number;
  maxDrawdown: number;
}

// Trading API Service Class
class TradingAPIService {
  private api: AxiosInstance;
  private authToken: string | null = null;

  constructor() {
    this.api = axios.create(API_CONFIG);
    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor for auth
    this.api.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling
    this.api.interceptors.response.use(
      (response: AxiosResponse<APIResponse<any>>) => response,
      (error) => {
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  // Authentication
  async authenticate(apiKey: string, apiSecret: string): Promise<boolean> {
    try {
      const response = await this.api.post<APIResponse<{ token: string }>>('/auth/login', {
        apiKey,
        apiSecret,
      });
      
      if (response.data.success) {
        this.authToken = response.data.data.token;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Authentication failed:', error);
      return false;
    }
  }

  // Market Data
  async getMarketData(symbol: string): Promise<MarketData | null> {
    try {
      const response = await this.api.get<APIResponse<MarketData>>(`/market/ticker/${symbol}`);
      return response.data.success ? response.data.data : null;
    } catch (error) {
      console.error('Failed to fetch market data:', error);
      return null;
    }
  }

  async getMultipleMarketData(symbols: string[]): Promise<MarketData[]> {
    try {
      const response = await this.api.post<APIResponse<MarketData[]>>('/market/tickers', {
        symbols,
      });
      return response.data.success ? response.data.data : [];
    } catch (error) {
      console.error('Failed to fetch multiple market data:', error);
      return [];
    }
  }

  // Order Management
  async submitOrder(orderRequest: OrderRequest): Promise<OrderResponse | null> {
    try {
      const response = await this.api.post<APIResponse<OrderResponse>>('/orders', orderRequest);
      return response.data.success ? response.data.data : null;
    } catch (error) {
      console.error('Failed to submit order:', error);
      return null;
    }
  }

  async cancelOrder(orderId: string): Promise<boolean> {
    try {
      const response = await this.api.delete<APIResponse<any>>(`/orders/${orderId}`);
      return response.data.success;
    } catch (error) {
      console.error('Failed to cancel order:', error);
      return false;
    }
  }

  async getOrderStatus(orderId: string): Promise<OrderResponse | null> {
    try {
      const response = await this.api.get<APIResponse<OrderResponse>>(`/orders/${orderId}`);
      return response.data.success ? response.data.data : null;
    } catch (error) {
      console.error('Failed to get order status:', error);
      return null;
    }
  }

  async getOpenOrders(symbol?: string): Promise<OrderResponse[]> {
    try {
      const url = symbol ? `/orders/open?symbol=${symbol}` : '/orders/open';
      const response = await this.api.get<APIResponse<OrderResponse[]>>(url);
      return response.data.success ? response.data.data : [];
    } catch (error) {
      console.error('Failed to get open orders:', error);
      return [];
    }
  }

  // Position Management
  async getPositions(): Promise<Position[]> {
    try {
      const response = await this.api.get<APIResponse<Position[]>>('/positions');
      return response.data.success ? response.data.data : [];
    } catch (error) {
      console.error('Failed to get positions:', error);
      return [];
    }
  }

  async closePosition(symbol: string, quantity?: number): Promise<boolean> {
    try {
      const response = await this.api.post<APIResponse<any>>(`/positions/${symbol}/close`, {
        quantity,
      });
      return response.data.success;
    } catch (error) {
      console.error('Failed to close position:', error);
      return false;
    }
  }

  // Portfolio & Account
  async getPortfolio(): Promise<Portfolio | null> {
    try {
      const response = await this.api.get<APIResponse<Portfolio>>('/account/portfolio');
      return response.data.success ? response.data.data : null;
    } catch (error) {
      console.error('Failed to get portfolio:', error);
      return null;
    }
  }

  async getRiskMetrics(): Promise<RiskMetrics | null> {
    try {
      const response = await this.api.get<APIResponse<RiskMetrics>>('/account/risk');
      return response.data.success ? response.data.data : null;
    } catch (error) {
      console.error('Failed to get risk metrics:', error);
      return null;
    }
  }

  // Trade History
  async getTradeHistory(params?: {
    symbol?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<Trade[]> {
    try {
      const response = await this.api.get<APIResponse<Trade[]>>('/trades/history', {
        params,
      });
      return response.data.success ? response.data.data : [];
    } catch (error) {
      console.error('Failed to get trade history:', error);
      return [];
    }
  }

  // WebSocket for Real-time Data
  connectWebSocket(onMessage: (data: any) => void, onError?: (error: any) => void): WebSocket | null {
    try {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        // Subscribe to real-time data
        ws.send(JSON.stringify({
          action: 'subscribe',
          channels: ['market_data', 'orders', 'positions'],
          token: this.authToken,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
      };

      return ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      return null;
    }
  }
}

// Export singleton instance
export const tradingAPI = new TradingAPIService();

// Export types for use in components
export type {
  MarketData,
  OrderRequest,
  OrderResponse,
  Position,
  Trade,
  Portfolio,
  RiskMetrics,
  APIResponse,
};
