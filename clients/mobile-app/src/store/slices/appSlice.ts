import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  brand: string;
  model: string;
  systemName: string;
  systemVersion: string;
  appVersion: string;
  buildNumber: string;
  bundleId: string;
  isTablet: boolean;
  hasNotch: boolean;
  isEmulator: boolean;
  totalMemory: number;
  usedMemory: number;
  batteryLevel: number;
  isLandscape: boolean;
  carrier: string;
  ipAddress: string;
  macAddress: string;
  userAgent: string;
}

export interface NetworkStatus {
  isConnected: boolean | null;
  type: string;
  isInternetReachable: boolean | null;
  details: any;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  currency: string;
  notifications: {
    priceAlerts: boolean;
    tradeUpdates: boolean;
    newsUpdates: boolean;
    sound: boolean;
    vibration: boolean;
  };
  security: {
    biometricEnabled: boolean;
    autoLockEnabled: boolean;
    autoLockTimeout: number; // minutes
  };
  trading: {
    confirmOrders: boolean;
    defaultOrderType: 'market' | 'limit';
    soundEffects: boolean;
    hapticFeedback: boolean;
  };
  display: {
    hideBalances: boolean;
    showPercentages: boolean;
    compactMode: boolean;
  };
}

export interface AppState {
  // App lifecycle
  isInitialized: boolean;
  isActive: boolean;
  isBackground: boolean;
  
  // Device information
  deviceInfo: DeviceInfo | null;
  
  // Network status
  networkStatus: NetworkStatus;
  
  // App settings
  settings: AppSettings;
  
  // UI state
  orientation: 'portrait' | 'landscape';
  keyboardVisible: boolean;
  safeAreaInsets: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  
  // Performance
  performance: {
    memoryUsage: number;
    batteryLevel: number;
    isLowPowerMode: boolean;
    lastUpdated: number;
  };
  
  // Notifications
  pushToken: string | null;
  notificationPermission: 'granted' | 'denied' | 'not-determined';
  
  // Error tracking
  errors: Array<{
    id: string;
    message: string;
    stack?: string;
    timestamp: number;
    resolved: boolean;
  }>;
}

const defaultSettings: AppSettings = {
  theme: 'system',
  language: 'en',
  currency: 'USD',
  notifications: {
    priceAlerts: true,
    tradeUpdates: true,
    newsUpdates: false,
    sound: true,
    vibration: true,
  },
  security: {
    biometricEnabled: false,
    autoLockEnabled: true,
    autoLockTimeout: 5,
  },
  trading: {
    confirmOrders: true,
    defaultOrderType: 'limit',
    soundEffects: true,
    hapticFeedback: true,
  },
  display: {
    hideBalances: false,
    showPercentages: true,
    compactMode: false,
  },
};

const initialState: AppState = {
  isInitialized: false,
  isActive: true,
  isBackground: false,
  deviceInfo: null,
  networkStatus: {
    isConnected: null,
    type: 'unknown',
    isInternetReachable: null,
    details: null,
  },
  settings: defaultSettings,
  orientation: 'portrait',
  keyboardVisible: false,
  safeAreaInsets: {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  performance: {
    memoryUsage: 0,
    batteryLevel: 1,
    isLowPowerMode: false,
    lastUpdated: Date.now(),
  },
  pushToken: null,
  notificationPermission: 'not-determined',
  errors: [],
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setInitialized: (state, action: PayloadAction<boolean>) => {
      state.isInitialized = action.payload;
    },

    setAppState: (state, action: PayloadAction<{ isActive: boolean; isBackground: boolean }>) => {
      state.isActive = action.payload.isActive;
      state.isBackground = action.payload.isBackground;
    },

    setDeviceInfo: (state, action: PayloadAction<DeviceInfo>) => {
      state.deviceInfo = action.payload;
    },

    setNetworkStatus: (state, action: PayloadAction<NetworkStatus>) => {
      state.networkStatus = action.payload;
    },

    updateSettings: (state, action: PayloadAction<Partial<AppSettings>>) => {
      state.settings = { ...state.settings, ...action.payload };
    },

    updateNotificationSettings: (state, action: PayloadAction<Partial<AppSettings['notifications']>>) => {
      state.settings.notifications = { ...state.settings.notifications, ...action.payload };
    },

    updateSecuritySettings: (state, action: PayloadAction<Partial<AppSettings['security']>>) => {
      state.settings.security = { ...state.settings.security, ...action.payload };
    },

    updateTradingSettings: (state, action: PayloadAction<Partial<AppSettings['trading']>>) => {
      state.settings.trading = { ...state.settings.trading, ...action.payload };
    },

    updateDisplaySettings: (state, action: PayloadAction<Partial<AppSettings['display']>>) => {
      state.settings.display = { ...state.settings.display, ...action.payload };
    },

    setOrientation: (state, action: PayloadAction<'portrait' | 'landscape'>) => {
      state.orientation = action.payload;
    },

    setKeyboardVisible: (state, action: PayloadAction<boolean>) => {
      state.keyboardVisible = action.payload;
    },

    setSafeAreaInsets: (state, action: PayloadAction<AppState['safeAreaInsets']>) => {
      state.safeAreaInsets = action.payload;
    },

    updatePerformance: (state, action: PayloadAction<Partial<AppState['performance']>>) => {
      state.performance = {
        ...state.performance,
        ...action.payload,
        lastUpdated: Date.now(),
      };
    },

    setPushToken: (state, action: PayloadAction<string>) => {
      state.pushToken = action.payload;
    },

    setNotificationPermission: (state, action: PayloadAction<AppState['notificationPermission']>) => {
      state.notificationPermission = action.payload;
    },

    addError: (state, action: PayloadAction<Omit<AppState['errors'][0], 'id' | 'timestamp' | 'resolved'>>) => {
      const error = {
        ...action.payload,
        id: Date.now().toString(),
        timestamp: Date.now(),
        resolved: false,
      };
      state.errors.unshift(error);
      
      // Keep only last 50 errors
      if (state.errors.length > 50) {
        state.errors = state.errors.slice(0, 50);
      }
    },

    resolveError: (state, action: PayloadAction<string>) => {
      const error = state.errors.find(e => e.id === action.payload);
      if (error) {
        error.resolved = true;
      }
    },

    clearErrors: (state) => {
      state.errors = [];
    },

    resetSettings: (state) => {
      state.settings = defaultSettings;
    },
  },
});

// Export actions
export const {
  setInitialized,
  setAppState,
  setDeviceInfo,
  setNetworkStatus,
  updateSettings,
  updateNotificationSettings,
  updateSecuritySettings,
  updateTradingSettings,
  updateDisplaySettings,
  setOrientation,
  setKeyboardVisible,
  setSafeAreaInsets,
  updatePerformance,
  setPushToken,
  setNotificationPermission,
  addError,
  resolveError,
  clearErrors,
  resetSettings,
} = appSlice.actions;

// Export selectors
export const selectApp = (state: { app: AppState }) => state.app;
export const selectIsInitialized = (state: { app: AppState }) => state.app.isInitialized;
export const selectDeviceInfo = (state: { app: AppState }) => state.app.deviceInfo;
export const selectNetworkStatus = (state: { app: AppState }) => state.app.networkStatus;
export const selectSettings = (state: { app: AppState }) => state.app.settings;
export const selectNotificationSettings = (state: { app: AppState }) => state.app.settings.notifications;
export const selectSecuritySettings = (state: { app: AppState }) => state.app.settings.security;
export const selectTradingSettings = (state: { app: AppState }) => state.app.settings.trading;
export const selectDisplaySettings = (state: { app: AppState }) => state.app.settings.display;
export const selectOrientation = (state: { app: AppState }) => state.app.orientation;
export const selectKeyboardVisible = (state: { app: AppState }) => state.app.keyboardVisible;
export const selectSafeAreaInsets = (state: { app: AppState }) => state.app.safeAreaInsets;
export const selectPerformance = (state: { app: AppState }) => state.app.performance;
export const selectIsOnline = (state: { app: AppState }) => state.app.networkStatus.isConnected;
export const selectErrors = (state: { app: AppState }) => state.app.errors;
export const selectUnresolvedErrors = (state: { app: AppState }) => 
  state.app.errors.filter(error => !error.resolved);

// Export reducer
export default appSlice.reducer;
