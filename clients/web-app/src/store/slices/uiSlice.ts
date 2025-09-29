import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Types
export type Theme = 'light' | 'dark' | 'system';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'ja' | 'zh';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'BTC' | 'ETH';

export interface UIState {
  theme: Theme;
  language: Language;
  currency: Currency;
  sidebarCollapsed: boolean;
  sidebarOpen: boolean;
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    email: boolean;
    trading: boolean;
    news: boolean;
    price: boolean;
  };
  layout: {
    density: 'compact' | 'comfortable' | 'spacious';
    chartType: 'candlestick' | 'line' | 'area';
    showGrid: boolean;
    showVolume: boolean;
    autoRefresh: boolean;
    refreshInterval: number; // in seconds
  };
  preferences: {
    showWelcome: boolean;
    showTips: boolean;
    confirmOrders: boolean;
    soundEffects: boolean;
    animations: boolean;
    highContrast: boolean;
    reducedMotion: boolean;
  };
  modals: {
    [key: string]: boolean;
  };
  loading: {
    [key: string]: boolean;
  };
  errors: {
    [key: string]: string | null;
  };
}

// Initial state
const initialState: UIState = {
  theme: 'system',
  language: 'en',
  currency: 'USD',
  sidebarCollapsed: false,
  sidebarOpen: true,
  notifications: {
    enabled: true,
    sound: true,
    desktop: true,
    email: true,
    trading: true,
    news: true,
    price: true,
  },
  layout: {
    density: 'comfortable',
    chartType: 'candlestick',
    showGrid: true,
    showVolume: true,
    autoRefresh: true,
    refreshInterval: 5,
  },
  preferences: {
    showWelcome: true,
    showTips: true,
    confirmOrders: true,
    soundEffects: true,
    animations: true,
    highContrast: false,
    reducedMotion: false,
  },
  modals: {},
  loading: {},
  errors: {},
};

// UI slice
const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Theme actions
    setTheme: (state, action: PayloadAction<Theme>) => {
      state.theme = action.payload;
    },
    toggleTheme: (state) => {
      state.theme = state.theme === 'light' ? 'dark' : 'light';
    },

    // Language actions
    setLanguage: (state, action: PayloadAction<Language>) => {
      state.language = action.payload;
    },

    // Currency actions
    setCurrency: (state, action: PayloadAction<Currency>) => {
      state.currency = action.payload;
    },

    // Sidebar actions
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
    },
    toggleSidebarCollapsed: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    toggleSidebarOpen: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },

    // Notification actions
    setNotifications: (state, action: PayloadAction<Partial<UIState['notifications']>>) => {
      state.notifications = { ...state.notifications, ...action.payload };
    },
    toggleNotification: (state, action: PayloadAction<keyof UIState['notifications']>) => {
      const key = action.payload;
      state.notifications[key] = !state.notifications[key];
    },

    // Layout actions
    setLayout: (state, action: PayloadAction<Partial<UIState['layout']>>) => {
      state.layout = { ...state.layout, ...action.payload };
    },
    setDensity: (state, action: PayloadAction<UIState['layout']['density']>) => {
      state.layout.density = action.payload;
    },
    setChartType: (state, action: PayloadAction<UIState['layout']['chartType']>) => {
      state.layout.chartType = action.payload;
    },
    toggleGrid: (state) => {
      state.layout.showGrid = !state.layout.showGrid;
    },
    toggleVolume: (state) => {
      state.layout.showVolume = !state.layout.showVolume;
    },
    setAutoRefresh: (state, action: PayloadAction<boolean>) => {
      state.layout.autoRefresh = action.payload;
    },
    setRefreshInterval: (state, action: PayloadAction<number>) => {
      state.layout.refreshInterval = action.payload;
    },

    // Preference actions
    setPreferences: (state, action: PayloadAction<Partial<UIState['preferences']>>) => {
      state.preferences = { ...state.preferences, ...action.payload };
    },
    togglePreference: (state, action: PayloadAction<keyof UIState['preferences']>) => {
      const key = action.payload;
      state.preferences[key] = !state.preferences[key];
    },
    setShowWelcome: (state, action: PayloadAction<boolean>) => {
      state.preferences.showWelcome = action.payload;
    },
    setConfirmOrders: (state, action: PayloadAction<boolean>) => {
      state.preferences.confirmOrders = action.payload;
    },

    // Modal actions
    openModal: (state, action: PayloadAction<string>) => {
      state.modals[action.payload] = true;
    },
    closeModal: (state, action: PayloadAction<string>) => {
      state.modals[action.payload] = false;
    },
    toggleModal: (state, action: PayloadAction<string>) => {
      const modalKey = action.payload;
      state.modals[modalKey] = !state.modals[modalKey];
    },
    closeAllModals: (state) => {
      state.modals = {};
    },

    // Loading actions
    setLoading: (state, action: PayloadAction<{ key: string; loading: boolean }>) => {
      const { key, loading } = action.payload;
      state.loading[key] = loading;
    },
    clearLoading: (state, action: PayloadAction<string>) => {
      delete state.loading[action.payload];
    },
    clearAllLoading: (state) => {
      state.loading = {};
    },

    // Error actions
    setError: (state, action: PayloadAction<{ key: string; error: string | null }>) => {
      const { key, error } = action.payload;
      state.errors[key] = error;
    },
    clearError: (state, action: PayloadAction<string>) => {
      delete state.errors[action.payload];
    },
    clearAllErrors: (state) => {
      state.errors = {};
    },

    // Reset actions
    resetUI: (state) => {
      return { ...initialState, theme: state.theme, language: state.language };
    },
    resetLayout: (state) => {
      state.layout = initialState.layout;
    },
    resetPreferences: (state) => {
      state.preferences = initialState.preferences;
    },
    resetNotifications: (state) => {
      state.notifications = initialState.notifications;
    },
  },
});

// Export actions
export const {
  setTheme,
  toggleTheme,
  setLanguage,
  setCurrency,
  setSidebarCollapsed,
  toggleSidebarCollapsed,
  setSidebarOpen,
  toggleSidebarOpen,
  setNotifications,
  toggleNotification,
  setLayout,
  setDensity,
  setChartType,
  toggleGrid,
  toggleVolume,
  setAutoRefresh,
  setRefreshInterval,
  setPreferences,
  togglePreference,
  setShowWelcome,
  setConfirmOrders,
  openModal,
  closeModal,
  toggleModal,
  closeAllModals,
  setLoading,
  clearLoading,
  clearAllLoading,
  setError,
  clearError,
  clearAllErrors,
  resetUI,
  resetLayout,
  resetPreferences,
  resetNotifications,
} = uiSlice.actions;

// Export reducer
export default uiSlice.reducer;

// Selectors
export const selectUI = (state: { ui: UIState }) => state.ui;
export const selectTheme = (state: { ui: UIState }) => state.ui.theme;
export const selectLanguage = (state: { ui: UIState }) => state.ui.language;
export const selectCurrency = (state: { ui: UIState }) => state.ui.currency;
export const selectSidebarCollapsed = (state: { ui: UIState }) => state.ui.sidebarCollapsed;
export const selectSidebarOpen = (state: { ui: UIState }) => state.ui.sidebarOpen;
export const selectNotifications = (state: { ui: UIState }) => state.ui.notifications;
export const selectLayout = (state: { ui: UIState }) => state.ui.layout;
export const selectPreferences = (state: { ui: UIState }) => state.ui.preferences;
export const selectModals = (state: { ui: UIState }) => state.ui.modals;
export const selectLoading = (state: { ui: UIState }) => state.ui.loading;
export const selectErrors = (state: { ui: UIState }) => state.ui.errors;
