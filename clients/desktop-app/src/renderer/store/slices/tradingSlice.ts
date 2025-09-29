import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ApiService } from '../../services/api';

export interface Order {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTD';
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected' | 'expired';
  executedQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  fees: number;
  timestamp: number;
  updateTime: number;
}

export interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  fee: number;
  feeAsset: string;
  timestamp: number;
  isMaker: boolean;
}

export interface OrderFormData {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: string;
  price: string;
  stopPrice: string;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTD';
  postOnly: boolean;
  reduceOnly: boolean;
}

export interface TradingState {
  orders: Record<string, Order>;
  trades: Record<string, Trade>;
  orderHistory: Order[];
  tradeHistory: Trade[];
  
  // Order form state
  orderForm: OrderFormData;
  
  // Quick trading
  quickTrading: {
    enabled: boolean;
    defaultQuantity: number;
    confirmations: boolean;
  };
  
  // Loading states
  isLoading: boolean;
  isPlacingOrder: boolean;
  isCancellingOrder: boolean;
  
  // Error handling
  error: string | null;
  orderErrors: Record<string, string>;
  
  // Statistics
  stats: {
    totalOrders: number;
    totalTrades: number;
    totalVolume: number;
    totalFees: number;
    winRate: number;
    profitLoss: number;
  };
}

const initialOrderForm: OrderFormData = {
  symbol: 'BTC-USDT',
  side: 'buy',
  type: 'limit',
  quantity: '',
  price: '',
  stopPrice: '',
  timeInForce: 'GTC',
  postOnly: false,
  reduceOnly: false,
};

const initialState: TradingState = {
  orders: {},
  trades: {},
  orderHistory: [],
  tradeHistory: [],
  orderForm: initialOrderForm,
  quickTrading: {
    enabled: false,
    defaultQuantity: 0.001,
    confirmations: true,
  },
  isLoading: false,
  isPlacingOrder: false,
  isCancellingOrder: false,
  error: null,
  orderErrors: {},
  stats: {
    totalOrders: 0,
    totalTrades: 0,
    totalVolume: 0,
    totalFees: 0,
    winRate: 0,
    profitLoss: 0,
  },
};

// Async thunks
export const placeOrder = createAsyncThunk(
  'trading/placeOrder',
  async (orderData: Partial<Order>, { rejectWithValue }) => {
    try {
      const response = await ApiService.placeOrder(orderData);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to place order');
    }
  }
);

export const cancelOrder = createAsyncThunk(
  'trading/cancelOrder',
  async (orderId: string, { rejectWithValue }) => {
    try {
      const response = await ApiService.cancelOrder(orderId);
      return { orderId, ...response };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to cancel order');
    }
  }
);

export const fetchOrders = createAsyncThunk(
  'trading/fetchOrders',
  async (status?: string, { rejectWithValue }) => {
    try {
      const response = await ApiService.getOrders(status);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch orders');
    }
  }
);

export const fetchOrderHistory = createAsyncThunk(
  'trading/fetchOrderHistory',
  async (limit = 100, { rejectWithValue }) => {
    try {
      const response = await ApiService.getOrderHistory(limit);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch order history');
    }
  }
);

export const fetchTrades = createAsyncThunk(
  'trading/fetchTrades',
  async (limit = 100, { rejectWithValue }) => {
    try {
      const response = await ApiService.getTrades(limit);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch trades');
    }
  }
);

// Trading slice
const tradingSlice = createSlice({
  name: 'trading',
  initialState,
  reducers: {
    updateOrderForm: (state, action: PayloadAction<Partial<OrderFormData>>) => {
      state.orderForm = { ...state.orderForm, ...action.payload };
    },

    resetOrderForm: (state) => {
      state.orderForm = initialOrderForm;
    },

    updateOrder: (state, action: PayloadAction<Order>) => {
      const order = action.payload;
      state.orders[order.id] = order;
      
      // Update order history if order is completed
      if (['filled', 'cancelled', 'rejected', 'expired'].includes(order.status)) {
        const existingIndex = state.orderHistory.findIndex(o => o.id === order.id);
        if (existingIndex >= 0) {
          state.orderHistory[existingIndex] = order;
        } else {
          state.orderHistory.unshift(order);
        }
        
        // Remove from active orders
        delete state.orders[order.id];
      }
    },

    addTrade: (state, action: PayloadAction<Trade>) => {
      const trade = action.payload;
      state.trades[trade.id] = trade;
      state.tradeHistory.unshift(trade);
      
      // Keep only last 1000 trades in history
      if (state.tradeHistory.length > 1000) {
        state.tradeHistory = state.tradeHistory.slice(0, 1000);
      }
      
      // Update statistics
      state.stats.totalTrades += 1;
      state.stats.totalVolume += trade.quantity * trade.price;
      state.stats.totalFees += trade.fee;
    },

    updateQuickTrading: (state, action: PayloadAction<Partial<TradingState['quickTrading']>>) => {
      state.quickTrading = { ...state.quickTrading, ...action.payload };
    },

    setOrderError: (state, action: PayloadAction<{ orderId: string; error: string }>) => {
      const { orderId, error } = action.payload;
      state.orderErrors[orderId] = error;
    },

    clearOrderError: (state, action: PayloadAction<string>) => {
      delete state.orderErrors[action.payload];
    },

    clearError: (state) => {
      state.error = null;
    },

    updateStats: (state, action: PayloadAction<Partial<TradingState['stats']>>) => {
      state.stats = { ...state.stats, ...action.payload };
    },

    reset: (state) => {
      state.orders = {};
      state.trades = {};
      state.orderHistory = [];
      state.tradeHistory = [];
      state.orderForm = initialOrderForm;
      state.error = null;
      state.orderErrors = {};
    },
  },
  extraReducers: (builder) => {
    // Place order
    builder
      .addCase(placeOrder.pending, (state) => {
        state.isPlacingOrder = true;
        state.error = null;
      })
      .addCase(placeOrder.fulfilled, (state, action) => {
        state.isPlacingOrder = false;
        const order = action.payload;
        state.orders[order.id] = order;
        state.stats.totalOrders += 1;
      })
      .addCase(placeOrder.rejected, (state, action) => {
        state.isPlacingOrder = false;
        state.error = action.payload as string;
      });

    // Cancel order
    builder
      .addCase(cancelOrder.pending, (state) => {
        state.isCancellingOrder = true;
      })
      .addCase(cancelOrder.fulfilled, (state, action) => {
        state.isCancellingOrder = false;
        const { orderId } = action.payload;
        
        if (state.orders[orderId]) {
          state.orders[orderId].status = 'cancelled';
          state.orders[orderId].updateTime = Date.now();
        }
      })
      .addCase(cancelOrder.rejected, (state, action) => {
        state.isCancellingOrder = false;
        state.error = action.payload as string;
      });

    // Fetch orders
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.isLoading = false;
        const orders = action.payload;
        
        // Clear existing orders and populate with fresh data
        state.orders = {};
        orders.forEach((order: Order) => {
          if (['pending', 'open'].includes(order.status)) {
            state.orders[order.id] = order;
          }
        });
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Fetch order history
    builder
      .addCase(fetchOrderHistory.fulfilled, (state, action) => {
        state.orderHistory = action.payload;
      });

    // Fetch trades
    builder
      .addCase(fetchTrades.fulfilled, (state, action) => {
        const trades = action.payload;
        state.tradeHistory = trades;
        
        // Update trades lookup
        state.trades = {};
        trades.forEach((trade: Trade) => {
          state.trades[trade.id] = trade;
        });
        
        // Recalculate statistics
        state.stats.totalTrades = trades.length;
        state.stats.totalVolume = trades.reduce((sum: number, trade: Trade) => 
          sum + (trade.quantity * trade.price), 0);
        state.stats.totalFees = trades.reduce((sum: number, trade: Trade) => 
          sum + trade.fee, 0);
      });
  },
});

// Export actions
export const {
  updateOrderForm,
  resetOrderForm,
  updateOrder,
  addTrade,
  updateQuickTrading,
  setOrderError,
  clearOrderError,
  clearError,
  updateStats,
  reset,
} = tradingSlice.actions;

// Export selectors
export const selectTrading = (state: { trading: TradingState }) => state.trading;
export const selectOrders = (state: { trading: TradingState }) => state.trading.orders;
export const selectOrderHistory = (state: { trading: TradingState }) => state.trading.orderHistory;
export const selectTrades = (state: { trading: TradingState }) => state.trading.trades;
export const selectTradeHistory = (state: { trading: TradingState }) => state.trading.tradeHistory;
export const selectOrderForm = (state: { trading: TradingState }) => state.trading.orderForm;
export const selectQuickTrading = (state: { trading: TradingState }) => state.trading.quickTrading;
export const selectTradingStats = (state: { trading: TradingState }) => state.trading.stats;
export const selectIsPlacingOrder = (state: { trading: TradingState }) => state.trading.isPlacingOrder;
export const selectIsCancellingOrder = (state: { trading: TradingState }) => state.trading.isCancellingOrder;

// Export reducer
export default tradingSlice.reducer;
