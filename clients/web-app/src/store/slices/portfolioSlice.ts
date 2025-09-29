import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Types
export interface PortfolioAsset {
  symbol: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercentage: number;
  allocation: number;
}

export interface PortfolioPerformance {
  totalValue: number;
  totalPnl: number;
  totalPnlPercentage: number;
  dayChange: number;
  dayChangePercentage: number;
  weekChange: number;
  weekChangePercentage: number;
  monthChange: number;
  monthChangePercentage: number;
  yearChange: number;
  yearChangePercentage: number;
}

export interface PortfolioState {
  assets: Record<string, PortfolioAsset>;
  performance: PortfolioPerformance;
  isLoading: boolean;
  error: string | null;
}

// Initial state
const initialState: PortfolioState = {
  assets: {},
  performance: {
    totalValue: 0,
    totalPnl: 0,
    totalPnlPercentage: 0,
    dayChange: 0,
    dayChangePercentage: 0,
    weekChange: 0,
    weekChangePercentage: 0,
    monthChange: 0,
    monthChangePercentage: 0,
    yearChange: 0,
    yearChangePercentage: 0,
  },
  isLoading: false,
  error: null,
};

// Portfolio slice
const portfolioSlice = createSlice({
  name: 'portfolio',
  initialState,
  reducers: {
    updateAsset: (state, action: PayloadAction<PortfolioAsset>) => {
      const asset = action.payload;
      state.assets[asset.symbol] = asset;
    },

    updatePerformance: (state, action: PayloadAction<PortfolioPerformance>) => {
      state.performance = action.payload;
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    resetPortfolio: (state) => {
      return initialState;
    },
  },
});

// Export actions
export const {
  updateAsset,
  updatePerformance,
  setLoading,
  setError,
  resetPortfolio,
} = portfolioSlice.actions;

// Export reducer
export default portfolioSlice.reducer;