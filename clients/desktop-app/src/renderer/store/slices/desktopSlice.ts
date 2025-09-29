import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// Types
export interface WindowState {
  isMaximized: boolean;
  isMinimized: boolean;
  isFullscreen: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface HotkeyConfig {
  key: string;
  modifiers: string[];
  action: string;
  enabled: boolean;
}

export interface DesktopSettings {
  autoStart: boolean;
  minimizeToTray: boolean;
  closeToTray: boolean;
  notifications: {
    desktop: boolean;
    sound: boolean;
    priceAlerts: boolean;
    orderFills: boolean;
    systemUpdates: boolean;
  };
  performance: {
    hardwareAcceleration: boolean;
    backgroundThrottling: boolean;
    maxMemoryUsage: number;
  };
  security: {
    autoLock: boolean;
    lockTimeout: number; // minutes
    requirePasswordOnWake: boolean;
  };
}

export interface DesktopState {
  window: WindowState;
  hotkeys: HotkeyConfig[];
  settings: DesktopSettings;
  updateStatus: {
    checking: boolean;
    available: boolean;
    downloading: boolean;
    downloaded: boolean;
    error: string | null;
    progress: number;
  };
  systemInfo: {
    platform: string;
    arch: string;
    version: string;
    memory: {
      total: number;
      used: number;
    };
    cpu: {
      usage: number;
      cores: number;
    };
  } | null;
  isOnline: boolean;
  lastSyncTime: number | null;
}

// Initial state
const initialState: DesktopState = {
  window: {
    isMaximized: false,
    isMinimized: false,
    isFullscreen: false,
    bounds: {
      x: 0,
      y: 0,
      width: 1400,
      height: 900,
    },
  },
  hotkeys: [
    { key: 'N', modifiers: ['CmdOrCtrl'], action: 'new-order', enabled: true },
    { key: 'B', modifiers: ['CmdOrCtrl'], action: 'quick-buy', enabled: true },
    { key: 'S', modifiers: ['CmdOrCtrl'], action: 'quick-sell', enabled: true },
    { key: 'C', modifiers: ['CmdOrCtrl', 'Shift'], action: 'cancel-all', enabled: true },
    { key: 'X', modifiers: ['CmdOrCtrl', 'Shift'], action: 'close-all', enabled: true },
    { key: '1', modifiers: ['CmdOrCtrl'], action: 'navigate-dashboard', enabled: true },
    { key: '2', modifiers: ['CmdOrCtrl'], action: 'navigate-trading', enabled: true },
    { key: '3', modifiers: ['CmdOrCtrl'], action: 'navigate-portfolio', enabled: true },
    { key: '4', modifiers: ['CmdOrCtrl'], action: 'navigate-markets', enabled: true },
  ],
  settings: {
    autoStart: false,
    minimizeToTray: true,
    closeToTray: false,
    notifications: {
      desktop: true,
      sound: true,
      priceAlerts: true,
      orderFills: true,
      systemUpdates: true,
    },
    performance: {
      hardwareAcceleration: true,
      backgroundThrottling: false,
      maxMemoryUsage: 1024, // MB
    },
    security: {
      autoLock: false,
      lockTimeout: 15,
      requirePasswordOnWake: false,
    },
  },
  updateStatus: {
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    progress: 0,
  },
  systemInfo: null,
  isOnline: true,
  lastSyncTime: null,
};

// Desktop slice
const desktopSlice = createSlice({
  name: 'desktop',
  initialState,
  reducers: {
    // Window state
    setWindowState: (state, action: PayloadAction<Partial<WindowState>>) => {
      state.window = { ...state.window, ...action.payload };
    },
    
    setWindowBounds: (state, action: PayloadAction<WindowState['bounds']>) => {
      state.window.bounds = action.payload;
    },

    // Hotkeys
    updateHotkey: (state, action: PayloadAction<{ index: number; hotkey: Partial<HotkeyConfig> }>) => {
      const { index, hotkey } = action.payload;
      if (state.hotkeys[index]) {
        state.hotkeys[index] = { ...state.hotkeys[index], ...hotkey };
      }
    },

    addHotkey: (state, action: PayloadAction<HotkeyConfig>) => {
      state.hotkeys.push(action.payload);
    },

    removeHotkey: (state, action: PayloadAction<number>) => {
      state.hotkeys.splice(action.payload, 1);
    },

    resetHotkeys: (state) => {
      state.hotkeys = initialState.hotkeys;
    },

    // Settings
    updateDesktopSettings: (state, action: PayloadAction<Partial<DesktopSettings>>) => {
      state.settings = { ...state.settings, ...action.payload };
    },

    updateNotificationSettings: (state, action: PayloadAction<Partial<DesktopSettings['notifications']>>) => {
      state.settings.notifications = { ...state.settings.notifications, ...action.payload };
    },

    updatePerformanceSettings: (state, action: PayloadAction<Partial<DesktopSettings['performance']>>) => {
      state.settings.performance = { ...state.settings.performance, ...action.payload };
    },

    updateSecuritySettings: (state, action: PayloadAction<Partial<DesktopSettings['security']>>) => {
      state.settings.security = { ...state.settings.security, ...action.payload };
    },

    // Update status
    setUpdateStatus: (state, action: PayloadAction<Partial<DesktopState['updateStatus']>>) => {
      state.updateStatus = { ...state.updateStatus, ...action.payload };
    },

    setUpdateProgress: (state, action: PayloadAction<number>) => {
      state.updateStatus.progress = action.payload;
    },

    clearUpdateError: (state) => {
      state.updateStatus.error = null;
    },

    // System info
    setSystemInfo: (state, action: PayloadAction<DesktopState['systemInfo']>) => {
      state.systemInfo = action.payload;
    },

    updateSystemMemory: (state, action: PayloadAction<{ total: number; used: number }>) => {
      if (state.systemInfo) {
        state.systemInfo.memory = action.payload;
      }
    },

    updateSystemCpu: (state, action: PayloadAction<{ usage: number; cores: number }>) => {
      if (state.systemInfo) {
        state.systemInfo.cpu = action.payload;
      }
    },

    // Connection status
    setOnlineStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },

    setLastSyncTime: (state, action: PayloadAction<number>) => {
      state.lastSyncTime = action.payload;
    },

    // Reset
    resetDesktopState: () => initialState,
  },
});

// Export actions
export const {
  setWindowState,
  setWindowBounds,
  updateHotkey,
  addHotkey,
  removeHotkey,
  resetHotkeys,
  updateDesktopSettings,
  updateNotificationSettings,
  updatePerformanceSettings,
  updateSecuritySettings,
  setUpdateStatus,
  setUpdateProgress,
  clearUpdateError,
  setSystemInfo,
  updateSystemMemory,
  updateSystemCpu,
  setOnlineStatus,
  setLastSyncTime,
  resetDesktopState,
} = desktopSlice.actions;

// Export reducer
export default desktopSlice.reducer;
