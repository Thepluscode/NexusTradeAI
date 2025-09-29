import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

// Types
export interface MarketData {
  symbol: string;
  exchange: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap?: number;
  timestamp: number;
}

export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBookEntry {
  price: number;
  size: number;
  total: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export interface TechnicalIndicator {
  symbol: string;
  timeframe: string;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema26: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  timestamp: number;
}

export interface GlobalStats {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  activeSymbols: number;
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  fearGreedIndex: number;
  btc?: MarketData;
  eth?: MarketData;
}

export interface MarketDataState {
  // Current market data
  symbols: Record<string, MarketData>;
  watchlist: string[];

  // Historical data
  ohlcv: Record<string, OHLCV[]>;

  // Order books
  orderBooks: Record<string, OrderBook>;

  // Technical indicators
  indicators: Record<string, TechnicalIndicator>;

  // Global market statistics
  globalStats: GlobalStats | null;

  // UI state
  selectedSymbol: string | null;
  selectedTimeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w';
  isLoading: boolean;
  error: string | null;

  // WebSocket connection state
  isConnected: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastUpdate: number | null;
  latency: number;
}

// Initial state
const initialState: MarketDataState = {
  symbols: {},
  watchlist: ['BTC-USDT', 'ETH-USDT', 'ADA-USDT', 'SOL-USDT'],
  ohlcv: {},
  orderBooks: {},
  indicators: {},
  globalStats: null,
  selectedSymbol: null,
  selectedTimeframe: '1h',
  isLoading: false,
  error: null,
  isConnected: false,
  connectionStatus: 'disconnected',
  lastUpdate: null,
  latency: 0.8, // Default latency in milliseconds
};

// Market data slice
const marketDataSlice = createSlice({
  name: 'marketData',
  initialState,
  reducers: {
    // Real-time updates
    updateMarketData: (state, action: PayloadAction<MarketData>) => {
      const data = action.payload;
      state.symbols[data.symbol] = data;
      state.lastUpdate = Date.now();
    },

    updateMultipleMarketData: (state, action: PayloadAction<MarketData[]>) => {
      action.payload.forEach((data) => {
        state.symbols[data.symbol] = data;
      });
      state.lastUpdate = Date.now();
    },

    updateOrderBook: (state, action: PayloadAction<OrderBook>) => {
      const orderBook = action.payload;
      state.orderBooks[orderBook.symbol] = orderBook;
      state.lastUpdate = Date.now();
    },

    updateTechnicalIndicators: (state, action: PayloadAction<TechnicalIndicator>) => {
      const indicators = action.payload;
      const key = `${indicators.symbol}-${indicators.timeframe}`;
      state.indicators[key] = indicators;
    },

    updateGlobalStats: (state, action: PayloadAction<GlobalStats>) => {
      state.globalStats = action.payload;
    },

    updateLatency: (state, action: PayloadAction<number>) => {
      state.latency = action.payload;
    },

    // Watchlist management
    addToWatchlist: (state, action: PayloadAction<string>) => {
      const symbol = action.payload;
      if (!state.watchlist.includes(symbol)) {
        state.watchlist.push(symbol);
      }
    },

    removeFromWatchlist: (state, action: PayloadAction<string>) => {
      const symbol = action.payload;
      state.watchlist = state.watchlist.filter(s => s !== symbol);
    },

    reorderWatchlist: (state, action: PayloadAction<string[]>) => {
      state.watchlist = action.payload;
    },

    // UI state
    setSelectedSymbol: (state, action: PayloadAction<string | null>) => {
      state.selectedSymbol = action.payload;
    },

    setSelectedTimeframe: (state, action: PayloadAction<MarketDataState['selectedTimeframe']>) => {
      state.selectedTimeframe = action.payload;
    },

    // Connection state
    setConnectionStatus: (state, action: PayloadAction<MarketDataState['connectionStatus']>) => {
      state.connectionStatus = action.payload;
      state.isConnected = action.payload === 'connected';
    },

    // Error handling
    clearError: (state) => {
      state.error = null;
    },

    // Reset
    resetMarketData: (state) => {
      state.symbols = {};
      state.ohlcv = {};
      state.orderBooks = {};
      state.indicators = {};
      state.error = null;
    },
  },
});

// Export actions
export const {
  updateMarketData,
  updateMultipleMarketData,
  updateOrderBook,
  updateTechnicalIndicators,
  updateGlobalStats,
  addToWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  setSelectedSymbol,
  setSelectedTimeframe,
  setConnectionStatus,
  updateLatency,
  clearError,
  resetMarketData,
} = marketDataSlice.actions;

// Export reducer
export default marketDataSlice.reducer;

// Selectors
export const selectMarketData = (state: { marketData: MarketDataState }) => state.marketData;
export const selectSymbols = (state: { marketData: MarketDataState }) => state.marketData.symbols;
export const selectWatchlist = (state: { marketData: MarketDataState }) => state.marketData.watchlist;
export const selectSelectedSymbol = (state: { marketData: MarketDataState }) => state.marketData.selectedSymbol;
export const selectGlobalStats = (state: { marketData: MarketDataState }) => state.marketData.globalStats;
export const selectConnectionStatus = (state: { marketData: MarketDataState }) => state.marketData.connectionStatus;