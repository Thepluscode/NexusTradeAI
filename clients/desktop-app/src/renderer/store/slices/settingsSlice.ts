import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ApiService } from '../../services/api';

export interface UserSettings {
  // Display preferences
  theme: 'light' | 'dark' | 'system';
  language: string;
  currency: string;
  timezone: string;
  
  // Trading preferences
  trading: {
    defaultOrderType: 'market' | 'limit';
    defaultTimeInForce: 'GTC' | 'IOC' | 'FOK';
    confirmOrders: boolean;
    soundAlerts: boolean;
    maxOrderValue: number;
    slippageTolerance: number;
  };
  
  // Chart preferences
  charts: {
    defaultInterval: string;
    chartType: 'candlestick' | 'line' | 'area';
    showVolume: boolean;
    showGrid: boolean;
    colorScheme: 'green-red' | 'blue-orange';
  };
  
  // Notification preferences
  notifications: {
    desktop: boolean;
    email: boolean;
    push: boolean;
    priceAlerts: boolean;
    orderFills: boolean;
    newsUpdates: boolean;
    systemUpdates: boolean;
  };
  
  // Privacy and security
  privacy: {
    hideBalances: boolean;
    hidePositions: boolean;
    requirePasswordForTrades: boolean;
    sessionTimeout: number; // minutes
    twoFactorEnabled: boolean;
  };
  
  // API settings
  api: {
    endpoints: Record<string, string>;
    timeouts: Record<string, number>;
    retryAttempts: number;
  };
}

export interface SettingsState {
  settings: UserSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastSaved: number | null;
  hasUnsavedChanges: boolean;
}

const defaultSettings: UserSettings = {
  theme: 'system',
  language: 'en',
  currency: 'USD',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  trading: {
    defaultOrderType: 'limit',
    defaultTimeInForce: 'GTC',
    confirmOrders: true,
    soundAlerts: true,
    maxOrderValue: 10000,
    slippageTolerance: 0.5,
  },
  charts: {
    defaultInterval: '1h',
    chartType: 'candlestick',
    showVolume: true,
    showGrid: true,
    colorScheme: 'green-red',
  },
  notifications: {
    desktop: true,
    email: true,
    push: false,
    priceAlerts: true,
    orderFills: true,
    newsUpdates: false,
    systemUpdates: true,
  },
  privacy: {
    hideBalances: false,
    hidePositions: false,
    requirePasswordForTrades: false,
    sessionTimeout: 30,
    twoFactorEnabled: false,
  },
  api: {
    endpoints: {
      trading: '/api/v1/trading',
      market: '/api/v1/market',
      portfolio: '/api/v1/portfolio',
    },
    timeouts: {
      default: 30000,
      trading: 10000,
      market: 5000,
    },
    retryAttempts: 3,
  },
};

const initialState: SettingsState = {
  settings: defaultSettings,
  isLoading: false,
  isSaving: false,
  error: null,
  lastSaved: null,
  hasUnsavedChanges: false,
};

// Async thunks
export const loadSettings = createAsyncThunk(
  'settings/loadSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await ApiService.getSettings();
      return response;
    } catch (error: any) {
      // If loading fails, use local storage as fallback
      const localSettings = localStorage.getItem('userSettings');
      if (localSettings) {
        return JSON.parse(localSettings);
      }
      return rejectWithValue(error.response?.data?.message || 'Failed to load settings');
    }
  }
);

export const saveSettings = createAsyncThunk(
  'settings/saveSettings',
  async (settings: UserSettings, { rejectWithValue }) => {
    try {
      const response = await ApiService.updateSettings(settings);
      
      // Also save to local storage as backup
      localStorage.setItem('userSettings', JSON.stringify(settings));
      
      return response;
    } catch (error: any) {
      // Save to local storage even if API fails
      localStorage.setItem('userSettings', JSON.stringify(settings));
      return rejectWithValue(error.response?.data?.message || 'Failed to save settings');
    }
  }
);

export const resetSettings = createAsyncThunk(
  'settings/resetSettings',
  async (_, { rejectWithValue }) => {
    try {
      // Clear local storage
      localStorage.removeItem('userSettings');
      
      // Reset on server
      await ApiService.updateSettings(defaultSettings);
      
      return defaultSettings;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to reset settings');
    }
  }
);

// Settings slice
const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    updateSettings: (state, action: PayloadAction<Partial<UserSettings>>) => {
      state.settings = { ...state.settings, ...action.payload };
      state.hasUnsavedChanges = true;
    },

    updateTradingSettings: (state, action: PayloadAction<Partial<UserSettings['trading']>>) => {
      state.settings.trading = { ...state.settings.trading, ...action.payload };
      state.hasUnsavedChanges = true;
    },

    updateChartSettings: (state, action: PayloadAction<Partial<UserSettings['charts']>>) => {
      state.settings.charts = { ...state.settings.charts, ...action.payload };
      state.hasUnsavedChanges = true;
    },

    updateNotificationSettings: (state, action: PayloadAction<Partial<UserSettings['notifications']>>) => {
      state.settings.notifications = { ...state.settings.notifications, ...action.payload };
      state.hasUnsavedChanges = true;
    },

    updatePrivacySettings: (state, action: PayloadAction<Partial<UserSettings['privacy']>>) => {
      state.settings.privacy = { ...state.settings.privacy, ...action.payload };
      state.hasUnsavedChanges = true;
    },

    updateApiSettings: (state, action: PayloadAction<Partial<UserSettings['api']>>) => {
      state.settings.api = { ...state.settings.api, ...action.payload };
      state.hasUnsavedChanges = true;
    },

    setTheme: (state, action: PayloadAction<UserSettings['theme']>) => {
      state.settings.theme = action.payload;
      state.hasUnsavedChanges = true;
      
      // Apply theme immediately
      if (typeof window !== 'undefined') {
        const root = window.document.documentElement;
        if (action.payload === 'dark') {
          root.classList.add('dark');
        } else if (action.payload === 'light') {
          root.classList.remove('dark');
        } else {
          // System theme
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          if (prefersDark) {
            root.classList.add('dark');
          } else {
            root.classList.remove('dark');
          }
        }
      }
    },

    markSaved: (state) => {
      state.hasUnsavedChanges = false;
      state.lastSaved = Date.now();
    },

    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Load settings
    builder
      .addCase(loadSettings.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadSettings.fulfilled, (state, action) => {
        state.isLoading = false;
        state.settings = { ...defaultSettings, ...action.payload };
        state.hasUnsavedChanges = false;
        
        // Apply theme
        if (typeof window !== 'undefined') {
          const root = window.document.documentElement;
          const theme = state.settings.theme;
          if (theme === 'dark') {
            root.classList.add('dark');
          } else if (theme === 'light') {
            root.classList.remove('dark');
          } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
              root.classList.add('dark');
            } else {
              root.classList.remove('dark');
            }
          }
        }
      })
      .addCase(loadSettings.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Save settings
    builder
      .addCase(saveSettings.pending, (state) => {
        state.isSaving = true;
        state.error = null;
      })
      .addCase(saveSettings.fulfilled, (state, action) => {
        state.isSaving = false;
        state.settings = action.payload;
        state.hasUnsavedChanges = false;
        state.lastSaved = Date.now();
      })
      .addCase(saveSettings.rejected, (state, action) => {
        state.isSaving = false;
        state.error = action.payload as string;
        // Still mark as saved since we saved to localStorage
        state.hasUnsavedChanges = false;
        state.lastSaved = Date.now();
      });

    // Reset settings
    builder
      .addCase(resetSettings.fulfilled, (state, action) => {
        state.settings = action.payload;
        state.hasUnsavedChanges = false;
        state.lastSaved = Date.now();
      });
  },
});

// Export actions
export const {
  updateSettings,
  updateTradingSettings,
  updateChartSettings,
  updateNotificationSettings,
  updatePrivacySettings,
  updateApiSettings,
  setTheme,
  markSaved,
  clearError,
} = settingsSlice.actions;

// Export selectors
export const selectSettings = (state: { settings: SettingsState }) => state.settings.settings;
export const selectTradingSettings = (state: { settings: SettingsState }) => state.settings.settings.trading;
export const selectChartSettings = (state: { settings: SettingsState }) => state.settings.settings.charts;
export const selectNotificationSettings = (state: { settings: SettingsState }) => state.settings.settings.notifications;
export const selectPrivacySettings = (state: { settings: SettingsState }) => state.settings.settings.privacy;
export const selectApiSettings = (state: { settings: SettingsState }) => state.settings.settings.api;
export const selectTheme = (state: { settings: SettingsState }) => state.settings.settings.theme;
export const selectHasUnsavedChanges = (state: { settings: SettingsState }) => state.settings.hasUnsavedChanges;
export const selectIsLoading = (state: { settings: SettingsState }) => state.settings.isLoading;
export const selectIsSaving = (state: { settings: SettingsState }) => state.settings.isSaving;

// Export reducer
export default settingsSlice.reducer;
