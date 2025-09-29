//clients/web-app/src/store/slices/tradingSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Order, Position, Portfolio } from '../../../shared/types/typescript/trading';
import api from '../../services/api';

interface TradingState {
  orders: Order[];
  positions: Position[];
  portfolio: Portfolio | null;
  activeOrder: Partial<Order> | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: TradingState = {
  orders: [],
  positions: [],
  portfolio: null,
  activeOrder: null,
  isLoading: false,
  error: null,
};

// Async thunks
export const submitOrder = createAsyncThunk(
  'trading/submitOrder',
  async (order: Partial<Order>) => {
    const response = await api.submitOrder(order);
    return response.data;
  }
);

export const fetchOrders = createAsyncThunk(
  'trading/fetchOrders',
  async (status?: string) => {
    const response = await api.getOrders(status);
    return response.data;
  }
);

export const fetchPositions = createAsyncThunk(
  'trading/fetchPositions',
  async () => {
    const response = await api.getPositions();
    return response.data;
  }
);

export const fetchPortfolio = createAsyncThunk(
  'trading/fetchPortfolio',
  async () => {
    const response = await api.getPortfolio();
    return response.data;
  }
);

export const cancelOrder = createAsyncThunk(
  'trading/cancelOrder',
  async (orderId: string) => {
    await api.cancelOrder(orderId);
    return orderId;
  }
);

const tradingSlice = createSlice({
  name: 'trading',
  initialState,
  reducers: {
    setActiveOrder: (state, action: PayloadAction<Partial<Order> | null>) => {
      state.activeOrder = action.payload;
    },
    updateOrderStatus: (state, action: PayloadAction<{ id: string; status: Order['status'] }>) => {
      const order = state.orders.find(o => o.id === action.payload.id);
      if (order) {
        order.status = action.payload.status;
      }
    },
    addOrder: (state, action: PayloadAction<Order>) => {
      state.orders.unshift(action.payload);
    },
    updatePosition: (state, action: PayloadAction<Position>) => {
      const index = state.positions.findIndex(p => p.symbol === action.payload.symbol);
      if (index >= 0) {
        state.positions[index] = action.payload;
      } else {
        state.positions.push(action.payload);
      }
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Submit Order
      .addCase(submitOrder.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(submitOrder.fulfilled, (state, action) => {
        state.isLoading = false;
        state.orders.unshift(action.payload);
        state.activeOrder = null;
      })
      .addCase(submitOrder.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to submit order';
      })
      // Fetch Orders
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.orders = action.payload;
      })
      // Fetch Positions
      .addCase(fetchPositions.fulfilled, (state, action) => {
        state.positions = action.payload;
      })
      // Fetch Portfolio
      .addCase(fetchPortfolio.fulfilled, (state, action) => {
        state.portfolio = action.payload;
      })
      // Cancel Order
      .addCase(cancelOrder.fulfilled, (state, action) => {
        const order = state.orders.find(o => o.id === action.payload);
        if (order) {
          order.status = 'cancelled';
        }
      });
  },
});

export const { 
  setActiveOrder, 
  updateOrderStatus, 
  addOrder, 
  updatePosition, 
  clearError 
} = tradingSlice.actions;

export default tradingSlice.reducer;