import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ApiService } from '../../services/api';

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue: number;
  percentage: number;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  percentage: number;
  leverage: number;
  margin: number;
  timestamp: number;
}

export interface PerformanceData {
  period: string;
  returns: number;
  volatility: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  totalTrades: number;
  avgTradeSize: number;
  bestTrade: number;
  worstTrade: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

export interface PortfolioSnapshot {
  timestamp: number;
  totalValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  dayChange: number;
  dayChangePercentage: number;
}

export interface PortfolioState {
  // Current portfolio data
  totalValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  dayChange: number;
  dayChangePercentage: number;
  
  // Assets and positions
  balances: Record<string, Balance>;
  positions: Record<string, Position>;
  
  // Performance analytics
  performance: Record<string, PerformanceData>; // period -> data
  
  // Historical data
  snapshots: PortfolioSnapshot[];
  
  // Allocation analysis
  allocation: {
    byAsset: Record<string, number>;
    byCategory: Record<string, number>;
    diversificationScore: number;
    concentrationRisk: number;
  };
  
  // Risk metrics
  riskMetrics: {
    var95: number;
    var99: number;
    expectedShortfall: number;
    beta: number;
    correlation: Record<string, number>;
    volatility: number;
    lastUpdated: number;
  };
  
  // Loading states
  isLoading: boolean;
  isLoadingPerformance: boolean;
  error: string | null;
  lastUpdate: number;
}

const initialState: PortfolioState = {
  totalValue: 0,
  totalPnl: 0,
  totalPnlPercentage: 0,
  dayChange: 0,
  dayChangePercentage: 0,
  balances: {},
  positions: {},
  performance: {},
  snapshots: [],
  allocation: {
    byAsset: {},
    byCategory: {},
    diversificationScore: 0,
    concentrationRisk: 0,
  },
  riskMetrics: {
    var95: 0,
    var99: 0,
    expectedShortfall: 0,
    beta: 1,
    correlation: {},
    volatility: 0,
    lastUpdated: 0,
  },
  isLoading: false,
  isLoadingPerformance: false,
  error: null,
  lastUpdate: 0,
};

// Async thunks
export const fetchPortfolio = createAsyncThunk(
  'portfolio/fetchPortfolio',
  async (_, { rejectWithValue }) => {
    try {
      const response = await ApiService.getPortfolio();
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch portfolio');
    }
  }
);

export const fetchBalances = createAsyncThunk(
  'portfolio/fetchBalances',
  async (_, { rejectWithValue }) => {
    try {
      const response = await ApiService.getBalances();
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch balances');
    }
  }
);

export const fetchPositions = createAsyncThunk(
  'portfolio/fetchPositions',
  async (_, { rejectWithValue }) => {
    try {
      const response = await ApiService.getPositions();
      return response;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch positions');
    }
  }
);

export const fetchPerformance = createAsyncThunk(
  'portfolio/fetchPerformance',
  async (period = '30d', { rejectWithValue }) => {
    try {
      const response = await ApiService.getPerformance(period);
      return { period, data: response };
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch performance');
    }
  }
);

// Portfolio slice
const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    updateBalance: (state, action: PayloadAction<Balance>) => {
      const balance = action.payload;
      state.balances[balance.asset] = balance;
      state.lastUpdate = Date.now();
      
      // Recalculate total value
      state.totalValue = Object.values(state.balances).reduce(
        (sum, bal) => sum + bal.usdValue, 0
      );
      
      // Update allocation
      state.allocation.byAsset = {};
      Object.values(state.balances).forEach(bal => {
        if (bal.usdValue > 0) {
          state.allocation.byAsset[bal.asset] = (bal.usdValue / state.totalValue) * 100;
        }
      });
    },

    updatePosition: (state, action: PayloadAction<Position>) => {
      const position = action.payload;
      state.positions[position.symbol] = position;
      state.lastUpdate = Date.now();
    },

    removePosition: (state, action: PayloadAction<string>) => {
      delete state.positions[action.payload];
      state.lastUpdate = Date.now();
    },

    updatePortfolioValue: (state, action: PayloadAction<{ totalValue: number; dayChange: number }>) => {
      const { totalValue, dayChange } = action.payload;
      const previousValue = state.totalValue;
      
      state.totalValue = totalValue;
      state.dayChange = dayChange;
      state.dayChangePercentage = previousValue > 0 ? (dayChange / previousValue) * 100 : 0;
      
      // Calculate total P&L
      const initialValue = 100000; // Mock initial investment
      state.totalPnl = totalValue - initialValue;
      state.totalPnlPercentage = (state.totalPnl / initialValue) * 100;
      
      state.lastUpdate = Date.now();
    },

    addSnapshot: (state, action: PayloadAction<PortfolioSnapshot>) => {
      state.snapshots.unshift(action.payload);
      
      // Keep only last 1000 snapshots
      if (state.snapshots.length > 1000) {
        state.snapshots = state.snapshots.slice(0, 1000);
      }
    },

    updateRiskMetrics: (state, action: PayloadAction<Partial<PortfolioState['riskMetrics']>>) => {
      state.riskMetrics = {
        ...state.riskMetrics,
        ...action.payload,
        lastUpdated: Date.now(),
      };
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
        const portfolio = action.payload;
        
        state.totalValue = portfolio.totalValue;
        state.totalPnl = portfolio.totalPnl;
        state.totalPnlPercentage = portfolio.totalPnlPercentage;
        state.dayChange = portfolio.dayChange;
        state.dayChangePercentage = portfolio.dayChangePercentage;
        
        state.lastUpdate = Date.now();
      })
      .addCase(fetchPortfolio.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Fetch balances
    builder
      .addCase(fetchBalances.fulfilled, (state, action) => {
        const balances = action.payload;
        state.balances = {};
        
        balances.forEach((balance: Balance) => {
          state.balances[balance.asset] = balance;
        });
        
        // Recalculate total value and allocation
        state.totalValue = balances.reduce((sum: number, bal: Balance) => sum + bal.usdValue, 0);
        
        state.allocation.byAsset = {};
        balances.forEach((bal: Balance) => {
          if (bal.usdValue > 0) {
            state.allocation.byAsset[bal.asset] = (bal.usdValue / state.totalValue) * 100;
          }
        });
        
        state.lastUpdate = Date.now();
      });

    // Fetch positions
    builder
      .addCase(fetchPositions.fulfilled, (state, action) => {
        const positions = action.payload;
        state.positions = {};
        
        positions.forEach((position: Position) => {
          state.positions[position.symbol] = position;
        });
        
        state.lastUpdate = Date.now();
      });

    // Fetch performance
    builder
      .addCase(fetchPerformance.pending, (state) => {
        state.isLoadingPerformance = true;
      })
      .addCase(fetchPerformance.fulfilled, (state, action) => {
        state.isLoadingPerformance = false;
        const { period, data } = action.payload;
        state.performance[period] = data;
      })
      .addCase(fetchPerformance.rejected, (state, action) => {
        state.isLoadingPerformance = false;
        state.error = action.payload as string;
      });
  },
});

// Export actions
export const {
  updateBalance,
  updatePosition,
  removePosition,
  updatePortfolioValue,
  addSnapshot,
  updateRiskMetrics,
  updateAllocation,
  clearError,
  reset,
} = portfolioSlice.actions;

// Export selectors
export const selectPortfolio = (state: { portfolio: PortfolioState }) => state.portfolio;
export const selectTotalValue = (state: { portfolio: PortfolioState }) => state.portfolio.totalValue;
export const selectBalances = (state: { portfolio: PortfolioState }) => state.portfolio.balances;
export const selectPositions = (state: { portfolio: PortfolioState }) => state.portfolio.positions;
export const selectPerformance = (period: string) => (state: { portfolio: PortfolioState }) => 
  state.portfolio.performance[period];
export const selectAllocation = (state: { portfolio: PortfolioState }) => state.portfolio.allocation;
export const selectRiskMetrics = (state: { portfolio: PortfolioState }) => state.portfolio.riskMetrics;
export const selectSnapshots = (state: { portfolio: PortfolioState }) => state.portfolio.snapshots;

// Export reducer
export default portfolioSlice.reducer;
