import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';

export interface Asset {
  symbol: string;
  name: string;
  balance: number;
  value: number;
  price: number;
  change24h: number;
  changePercent24h: number;
  allocation: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  margin: number;
  leverage: number;
  timestamp: number;
}

export interface Transaction {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'transfer';
  symbol: string;
  amount: number;
  price: number;
  value: number;
  fee: number;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  timestamp: number;
  txHash?: string;
}

export interface PortfolioPerformance {
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  weekChange: number;
  weekChangePercent: number;
  monthChange: number;
  monthChangePercent: number;
  yearChange: number;
  yearChangePercent: number;
  allTimeHigh: number;
  allTimeLow: number;
  maxDrawdown: number;
  sharpeRatio: number;
  volatility: number;
}

export interface PortfolioState {
  // Portfolio overview
  totalBalance: number;
  availableBalance: number;
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  
  // Assets and positions
  assets: Record<string, Asset>;
  positions: Record<string, Position>;
  
  // Transaction history
  transactions: Transaction[];
  
  // Performance data
  performance: PortfolioPerformance;
  
  // Historical data for charts
  valueHistory: Array<{
    timestamp: number;
    value: number;
  }>;
  
  // Allocation data
  allocation: {
    byAsset: Record<string, number>;
    byCategory: Record<string, number>;
  };
  
  // Loading states
  isLoading: boolean;
  isLoadingTransactions: boolean;
  isLoadingPerformance: boolean;
  
  // Error handling
  error: string | null;
  
  // Last update timestamp
  lastUpdate: number;
}

const initialState: PortfolioState = {
  totalBalance: 0,
  availableBalance: 0,
  totalValue: 0,
  dayChange: 0,
  dayChangePercent: 0,
  assets: {},
  positions: {},
  transactions: [],
  performance: {
    totalValue: 0,
    totalPnl: 0,
    totalPnlPercent: 0,
    dayChange: 0,
    dayChangePercent: 0,
    weekChange: 0,
    weekChangePercent: 0,
    monthChange: 0,
    monthChangePercent: 0,
    yearChange: 0,
    yearChangePercent: 0,
    allTimeHigh: 0,
    allTimeLow: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    volatility: 0,
  },
  valueHistory: [],
  allocation: {
    byAsset: {},
    byCategory: {},
  },
  isLoading: false,
  isLoadingTransactions: false,
  isLoadingPerformance: false,
  error: null,
  lastUpdate: 0,
};

// Async thunks
export const fetchPortfolio = createAsyncThunk(
  'portfolio/fetchPortfolio',
  async (_, { rejectWithValue }) => {
    try {
      // Mock API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        totalBalance: 125847.32,
        availableBalance: 45230.12,
        totalValue: 125847.32,
        dayChange: 2847.21,
        dayChangePercent: 2.31,
        assets: {
          'BTC': {
            symbol: 'BTC',
            name: 'Bitcoin',
            balance: 1.05,
            value: 45367.50,
            price: 43207.14,
            change24h: 1250.50,
            changePercent24h: 2.98,
            allocation: 36.1,
          },
          'ETH': {
            symbol: 'ETH',
            name: 'Ethereum',
            balance: 10.5,
            value: 28147.88,
            price: 2680.75,
            change24h: 85.25,
            changePercent24h: 3.28,
            allocation: 22.4,
          },
          'SOL': {
            symbol: 'SOL',
            name: 'Solana',
            balance: 152.3,
            value: 15001.55,
            price: 98.50,
            change24h: -1.75,
            changePercent24h: -1.74,
            allocation: 11.9,
          },
        },
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch portfolio');
    }
  }
);

export const fetchTransactions = createAsyncThunk(
  'portfolio/fetchTransactions',
  async (limit: number = 50, { rejectWithValue }) => {
    try {
      // Mock API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const mockTransactions: Transaction[] = [];
      for (let i = 0; i < limit; i++) {
        mockTransactions.push({
          id: `tx_${i + 1}`,
          type: Math.random() > 0.5 ? 'buy' : 'sell',
          symbol: ['BTC', 'ETH', 'SOL', 'ADA'][Math.floor(Math.random() * 4)],
          amount: Math.random() * 10,
          price: Math.random() * 50000 + 1000,
          value: Math.random() * 10000 + 100,
          fee: Math.random() * 50 + 1,
          status: 'completed',
          timestamp: Date.now() - (i * 3600000),
        });
      }
      
      return mockTransactions;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch transactions');
    }
  }
);

export const fetchPerformance = createAsyncThunk(
  'portfolio/fetchPerformance',
  async (period: string = '30d', { rejectWithValue }) => {
    try {
      // Mock API call - replace with actual API
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      return {
        totalValue: 125847.32,
        totalPnl: 25847.32,
        totalPnlPercent: 25.85,
        dayChange: 2847.21,
        dayChangePercent: 2.31,
        weekChange: 5234.12,
        weekChangePercent: 4.34,
        monthChange: 12456.78,
        monthChangePercent: 10.98,
        yearChange: 45678.90,
        yearChangePercent: 57.12,
        allTimeHigh: 145000.00,
        allTimeLow: 85000.00,
        maxDrawdown: -15.5,
        sharpeRatio: 1.85,
        volatility: 0.45,
      };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to fetch performance');
    }
  }
);

const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    updateAsset: (state, action: PayloadAction<Asset>) => {
      const asset = action.payload;
      state.assets[asset.symbol] = asset;
      state.lastUpdate = Date.now();
    },

    updatePosition: (state, action: PayloadAction<Position>) => {
      const position = action.payload;
      state.positions[position.id] = position;
      state.lastUpdate = Date.now();
    },

    removePosition: (state, action: PayloadAction<string>) => {
      delete state.positions[action.payload];
      state.lastUpdate = Date.now();
    },

    addTransaction: (state, action: PayloadAction<Transaction>) => {
      state.transactions.unshift(action.payload);
      
      // Keep only last 1000 transactions
      if (state.transactions.length > 1000) {
        state.transactions = state.transactions.slice(0, 1000);
      }
    },

    updateTransaction: (state, action: PayloadAction<Transaction>) => {
      const index = state.transactions.findIndex(tx => tx.id === action.payload.id);
      if (index !== -1) {
        state.transactions[index] = action.payload;
      }
    },

    updatePortfolioValue: (state, action: PayloadAction<{ totalValue: number; dayChange: number }>) => {
      const { totalValue, dayChange } = action.payload;
      state.totalValue = totalValue;
      state.dayChange = dayChange;
      state.dayChangePercent = state.totalValue > 0 ? (dayChange / state.totalValue) * 100 : 0;
      state.lastUpdate = Date.now();
    },

    addValueHistoryPoint: (state, action: PayloadAction<{ timestamp: number; value: number }>) => {
      state.valueHistory.unshift(action.payload);
      
      // Keep only last 1000 points
      if (state.valueHistory.length > 1000) {
        state.valueHistory = state.valueHistory.slice(0, 1000);
      }
    },

    updateAllocation: (state, action: PayloadAction<Partial<PortfolioState['allocation']>>) => {
      state.allocation = { ...state.allocation, ...action.payload };
    },

    clearError: (state) => {
      state.error = null;
    },

    reset: (state) => {
      Object.assign(state, initialState);
    },
  },
  extraReducers: (builder) => {
    // Fetch portfolio
    builder
      .addCase(fetchPortfolio.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchPortfolio.fulfilled, (state, action) => {
        state.isLoading = false;
        const { totalBalance, availableBalance, totalValue, dayChange, dayChangePercent, assets } = action.payload;
        
        state.totalBalance = totalBalance;
        state.availableBalance = availableBalance;
        state.totalValue = totalValue;
        state.dayChange = dayChange;
        state.dayChangePercent = dayChangePercent;
        state.assets = assets;
        state.lastUpdate = Date.now();
      })
      .addCase(fetchPortfolio.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Fetch transactions
    builder
      .addCase(fetchTransactions.pending, (state) => {
        state.isLoadingTransactions = true;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.isLoadingTransactions = false;
        state.transactions = action.payload;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.isLoadingTransactions = false;
        state.error = action.payload as string;
      });

    // Fetch performance
    builder
      .addCase(fetchPerformance.pending, (state) => {
        state.isLoadingPerformance = true;
      })
      .addCase(fetchPerformance.fulfilled, (state, action) => {
        state.isLoadingPerformance = false;
        state.performance = action.payload;
      })
      .addCase(fetchPerformance.rejected, (state, action) => {
        state.isLoadingPerformance = false;
        state.error = action.payload as string;
      });
  },
});

// Export actions
export const {
  updateAsset,
  updatePosition,
  removePosition,
  addTransaction,
  updateTransaction,
  updatePortfolioValue,
  addValueHistoryPoint,
  updateAllocation,
  clearError,
  reset,
} = portfolioSlice.actions;

// Export selectors
export const selectPortfolio = (state: { portfolio: PortfolioState }) => state.portfolio;
export const selectTotalValue = (state: { portfolio: PortfolioState }) => state.portfolio.totalValue;
export const selectAssets = (state: { portfolio: PortfolioState }) => state.portfolio.assets;
export const selectPositions = (state: { portfolio: PortfolioState }) => state.portfolio.positions;
export const selectTransactions = (state: { portfolio: PortfolioState }) => state.portfolio.transactions;
export const selectPerformance = (state: { portfolio: PortfolioState }) => state.portfolio.performance;
export const selectValueHistory = (state: { portfolio: PortfolioState }) => state.portfolio.valueHistory;
export const selectAllocation = (state: { portfolio: PortfolioState }) => state.portfolio.allocation;
export const selectIsLoading = (state: { portfolio: PortfolioState }) => state.portfolio.isLoading;

// Export reducer
export default portfolioSlice.reducer;
