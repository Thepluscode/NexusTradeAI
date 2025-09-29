import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ApiService } from '../../services/api';

export interface Symbol {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  status: 'TRADING' | 'BREAK' | 'HALT';
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  volumeUsd24h: number;
  marketCap?: number;
  lastUpdate: number;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  total: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdate: number;
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  quantity: number;
  side: 'buy' | 'sell';
  timestamp: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataState {
  symbols: Record<string, Symbol>;
  orderBooks: Record<string, OrderBook>;
  recentTrades: Record<string, Trade[]>;
  candles: Record<string, Record<string, Candle[]>>; // symbol -> interval -> candles
  subscriptions: Set<string>;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  lastUpdate: number;
}

const initialState: MarketDataState = {
  symbols: {},
  orderBooks: {},
  recentTrades: {},
  candles: {},
  subscriptions: new Set(),
  isConnected: false,
  isLoading: false,
  error: null,
  lastUpdate: 0,
};

// Async thunks
export const fetchSymbols = createAsyncThunk(
  'marketData/fetchSymbols',
  async (_, { rejectWithValue }) => {
    try {
      const response = await ApiService.getSymbols();
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch symbols');
    }
  }
);

export const fetchTicker = createAsyncThunk(
  'marketData/fetchTicker',
  async (symbol: string, { rejectWithValue }) => {
    try {
      const response = await ApiService.getTicker(symbol);
      return { symbol, data: response };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch ticker');
    }
  }
);

export const fetchOrderBook = createAsyncThunk(
  'marketData/fetchOrderBook',
  async ({ symbol, limit = 100 }: { symbol: string; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await ApiService.getOrderBook(symbol, limit);
      return { symbol, data: response };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch order book');
    }
  }
);

export const fetchCandles = createAsyncThunk(
  'marketData/fetchCandles',
  async ({ symbol, interval, limit = 500 }: { symbol: string; interval: string; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await ApiService.getCandles(symbol, interval, limit);
      return { symbol, interval, data: response };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch candles');
    }
  }
);

// Market data slice
const marketDataSlice = createSlice({
  name: 'marketData',
  initialState,
  reducers: {
    setConnectionStatus: (state, action: PayloadAction<boolean>) => {
      state.isConnected = action.payload;
      if (!action.payload) {
        state.subscriptions.clear();
      }
    },

    updateSymbol: (state, action: PayloadAction<Symbol>) => {
      const symbol = action.payload;
      state.symbols[symbol.symbol] = symbol;
      state.lastUpdate = Date.now();
    },

    updateOrderBook: (state, action: PayloadAction<OrderBook>) => {
      const orderBook = action.payload;
      state.orderBooks[orderBook.symbol] = orderBook;
      state.lastUpdate = Date.now();
    },

    addTrade: (state, action: PayloadAction<Trade>) => {
      const trade = action.payload;
      if (!state.recentTrades[trade.symbol]) {
        state.recentTrades[trade.symbol] = [];
      }
      
      state.recentTrades[trade.symbol].unshift(trade);
      
      // Keep only last 100 trades per symbol
      if (state.recentTrades[trade.symbol].length > 100) {
        state.recentTrades[trade.symbol] = state.recentTrades[trade.symbol].slice(0, 100);
      }
      
      state.lastUpdate = Date.now();
    },

    updateCandle: (state, action: PayloadAction<{ symbol: string; interval: string; candle: Candle }>) => {
      const { symbol, interval, candle } = action.payload;
      
      if (!state.candles[symbol]) {
        state.candles[symbol] = {};
      }
      if (!state.candles[symbol][interval]) {
        state.candles[symbol][interval] = [];
      }
      
      const candles = state.candles[symbol][interval];
      const existingIndex = candles.findIndex(c => c.timestamp === candle.timestamp);
      
      if (existingIndex >= 0) {
        // Update existing candle
        candles[existingIndex] = candle;
      } else {
        // Add new candle and sort by timestamp
        candles.push(candle);
        candles.sort((a, b) => a.timestamp - b.timestamp);
        
        // Keep only last 1000 candles
        if (candles.length > 1000) {
          state.candles[symbol][interval] = candles.slice(-1000);
        }
      }
      
      state.lastUpdate = Date.now();
    },

    subscribe: (state, action: PayloadAction<string>) => {
      state.subscriptions.add(action.payload);
    },

    unsubscribe: (state, action: PayloadAction<string>) => {
      state.subscriptions.delete(action.payload);
    },

    clearError: (state) => {
      state.error = null;
    },

    reset: (state) => {
      state.symbols = {};
      state.orderBooks = {};
      state.recentTrades = {};
      state.candles = {};
      state.subscriptions.clear();
      state.error = null;
      state.lastUpdate = 0;
    },
  },
  extraReducers: (builder) => {
    // Fetch symbols
    builder
      .addCase(fetchSymbols.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchSymbols.fulfilled, (state, action) => {
        state.isLoading = false;
        action.payload.forEach((symbol: Symbol) => {
          state.symbols[symbol.symbol] = symbol;
        });
        state.lastUpdate = Date.now();
      })
      .addCase(fetchSymbols.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Fetch ticker
    builder
      .addCase(fetchTicker.fulfilled, (state, action) => {
        const { symbol, data } = action.payload;
        state.symbols[symbol] = { ...state.symbols[symbol], ...data };
        state.lastUpdate = Date.now();
      })
      .addCase(fetchTicker.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Fetch order book
    builder
      .addCase(fetchOrderBook.fulfilled, (state, action) => {
        const { symbol, data } = action.payload;
        state.orderBooks[symbol] = data;
        state.lastUpdate = Date.now();
      })
      .addCase(fetchOrderBook.rejected, (state, action) => {
        state.error = action.payload as string;
      });

    // Fetch candles
    builder
      .addCase(fetchCandles.fulfilled, (state, action) => {
        const { symbol, interval, data } = action.payload;
        if (!state.candles[symbol]) {
          state.candles[symbol] = {};
        }
        state.candles[symbol][interval] = data;
        state.lastUpdate = Date.now();
      })
      .addCase(fetchCandles.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

// Export actions
export const {
  setConnectionStatus,
  updateSymbol,
  updateOrderBook,
  addTrade,
  updateCandle,
  subscribe,
  unsubscribe,
  clearError,
  reset,
} = marketDataSlice.actions;

// Export selectors
export const selectMarketData = (state: { marketData: MarketDataState }) => state.marketData;
export const selectSymbols = (state: { marketData: MarketDataState }) => state.marketData.symbols;
export const selectSymbol = (symbol: string) => (state: { marketData: MarketDataState }) => 
  state.marketData.symbols[symbol];
export const selectOrderBook = (symbol: string) => (state: { marketData: MarketDataState }) => 
  state.marketData.orderBooks[symbol];
export const selectRecentTrades = (symbol: string) => (state: { marketData: MarketDataState }) => 
  state.marketData.recentTrades[symbol] || [];
export const selectCandles = (symbol: string, interval: string) => (state: { marketData: MarketDataState }) => 
  state.marketData.candles[symbol]?.[interval] || [];
export const selectIsConnected = (state: { marketData: MarketDataState }) => state.marketData.isConnected;
export const selectSubscriptions = (state: { marketData: MarketDataState }) => state.marketData.subscriptions;

// Export reducer
export default marketDataSlice.reducer;
