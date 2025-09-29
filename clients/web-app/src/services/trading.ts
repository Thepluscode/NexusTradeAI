import { api, endpoints } from './api';
import { Order, Position, Balance, Trade } from '@/store/slices/tradingSlice';

// Types
export interface PlaceOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
  clientOrderId?: string;
}

export interface ModifyOrderRequest {
  orderId: string;
  quantity?: number;
  price?: number;
  stopPrice?: number;
}

export interface OrderResponse {
  order: Order;
  fills?: Trade[];
}

export interface PositionResponse {
  positions: Position[];
}

export interface BalanceResponse {
  balances: Balance[];
}

export interface TradingLimits {
  maxOrderSize: number;
  minOrderSize: number;
  maxOpenOrders: number;
  dailyOrderLimit: number;
  maxLeverage: number;
}

export interface TradingFees {
  makerFee: number;
  takerFee: number;
  withdrawalFee: number;
}

// Trading Service
export class TradingService {
  /**
   * Place a new order
   */
  async placeOrder(orderData: PlaceOrderRequest, token: string): Promise<Order> {
    try {
      const response = await api.post<OrderResponse>(endpoints.trading.orders, {
        ...orderData,
        clientOrderId: orderData.clientOrderId || `client_${Date.now()}`,
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.order;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to place order');
    }
  }

  /**
   * Cancel an existing order
   */
  async cancelOrder(orderId: string, token: string): Promise<void> {
    try {
      await api.delete(`${endpoints.trading.orders}/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to cancel order');
    }
  }

  /**
   * Modify an existing order
   */
  async modifyOrder(modifyData: ModifyOrderRequest, token: string): Promise<Order> {
    try {
      const { orderId, ...updateData } = modifyData;
      const response = await api.patch<{ order: Order }>(`${endpoints.trading.orders}/${orderId}`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.order;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to modify order');
    }
  }

  /**
   * Cancel all orders for a symbol or all symbols
   */
  async cancelAllOrders(symbol?: string, token?: string): Promise<void> {
    try {
      const params = symbol ? { symbol } : {};
      await api.delete(endpoints.trading.orders, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to cancel orders');
    }
  }

  /**
   * Get all orders (open and historical)
   */
  async getOrders(params: {
    symbol?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}, token: string): Promise<Order[]> {
    try {
      const response = await api.get<{ orders: Order[] }>(endpoints.trading.orders, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.orders;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch orders');
    }
  }

  /**
   * Get open orders only
   */
  async getOpenOrders(symbol?: string, token?: string): Promise<Order[]> {
    const params: any = { status: 'open' };
    if (symbol) params.symbol = symbol;
    return this.getOrders(params, token!);
  }

  /**
   * Get order history
   */
  async getOrderHistory(params: {
    symbol?: string;
    limit?: number;
    offset?: number;
  } = {}, token: string): Promise<Order[]> {
    try {
      const response = await api.get<{ orders: Order[] }>(`${endpoints.trading.history}/orders`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.orders;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch order history');
    }
  }

  /**
   * Get current positions
   */
  async getPositions(token: string): Promise<Position[]> {
    try {
      const response = await api.get<PositionResponse>(endpoints.trading.positions, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.positions;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch positions');
    }
  }

  /**
   * Get account balances
   */
  async getBalances(token: string): Promise<Balance[]> {
    try {
      const response = await api.get<BalanceResponse>(endpoints.trading.balances, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.balances;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch balances');
    }
  }

  /**
   * Get trade history
   */
  async getTradeHistory(params: {
    symbol?: string;
    limit?: number;
    offset?: number;
    startTime?: number;
    endTime?: number;
  } = {}, token: string): Promise<Trade[]> {
    try {
      const response = await api.get<{ trades: Trade[] }>(`${endpoints.trading.history}/trades`, {
        params,
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.trades;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch trade history');
    }
  }

  /**
   * Get trading limits for account
   */
  async getTradingLimits(token: string): Promise<TradingLimits> {
    try {
      const response = await api.get<TradingLimits>(endpoints.trading.limits, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch trading limits');
    }
  }

  /**
   * Get trading fees
   */
  async getTradingFees(token: string): Promise<TradingFees> {
    try {
      const response = await api.get<TradingFees>(endpoints.trading.fees, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch trading fees');
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string, token: string): Promise<Order> {
    try {
      const response = await api.get<{ order: Order }>(`${endpoints.trading.orders}/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      return response.order;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch order');
    }
  }

  /**
   * Calculate order cost (including fees)
   */
  calculateOrderCost(quantity: number, price: number, side: 'buy' | 'sell', fees: TradingFees): {
    subtotal: number;
    fee: number;
    total: number;
  } {
    const subtotal = quantity * price;
    const feeRate = side === 'buy' ? fees.takerFee : fees.makerFee; // Simplified
    const fee = subtotal * feeRate;
    const total = side === 'buy' ? subtotal + fee : subtotal - fee;

    return { subtotal, fee, total };
  }

  /**
   * Validate order parameters
   */
  validateOrder(orderData: PlaceOrderRequest, limits: TradingLimits): string | null {
    if (orderData.quantity < limits.minOrderSize) {
      return `Order size too small. Minimum: ${limits.minOrderSize}`;
    }

    if (orderData.quantity > limits.maxOrderSize) {
      return `Order size too large. Maximum: ${limits.maxOrderSize}`;
    }

    if (orderData.type === 'limit' && !orderData.price) {
      return 'Price is required for limit orders';
    }

    if (orderData.type === 'stop' && !orderData.stopPrice) {
      return 'Stop price is required for stop orders';
    }

    if (orderData.type === 'stop_limit') {
      if (!orderData.price) return 'Price is required for stop limit orders';
      if (!orderData.stopPrice) return 'Stop price is required for stop limit orders';
    }

    return null;
  }
}

// Export singleton instance
export const tradingService = new TradingService();