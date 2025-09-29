import { configureStore, combineReducers } from '@reduxjs/toolkit';

// Import slices (reuse from web-app with desktop-specific modifications)
import authSlice from './slices/authSlice';
import marketDataSlice from './slices/marketDataSlice';
import tradingSlice from './slices/tradingSlice';
import portfolioSlice from './slices/portfolioSlice';
import settingsSlice from './slices/settingsSlice';
import notificationsSlice from './slices/notificationsSlice';
import desktopSlice from './slices/desktopSlice';

// Root reducer
const rootReducer = combineReducers({
  auth: authSlice,
  marketData: marketDataSlice,
  trading: tradingSlice,
  portfolio: portfolioSlice,
  settings: settingsSlice,
  notifications: notificationsSlice,
  desktop: desktopSlice, // Desktop-specific state
});

// Configure store with desktop-specific middleware
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }).concat([
      // Add desktop-specific middleware here
    ]),
  devTools: process.env.NODE_ENV !== 'production',
});

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Desktop-specific store persistence using electron-store
export const persistDesktopState = async (state: Partial<RootState>) => {
  try {
    await window.electronAPI?.storeSet('app-state', state);
  } catch (error) {
    console.error('Failed to persist desktop state:', error);
  }
};

export const loadDesktopState = async (): Promise<Partial<RootState> | null> => {
  try {
    return await window.electronAPI?.storeGet('app-state');
  } catch (error) {
    console.error('Failed to load desktop state:', error);
    return null;
  }
};

// Auto-save state changes (debounced)
let saveTimeout: NodeJS.Timeout;
store.subscribe(() => {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const state = store.getState();
    // Only persist certain slices for desktop
    const persistableState = {
      auth: {
        user: state.auth.user,
        isAuthenticated: state.auth.isAuthenticated,
      },
      settings: state.settings,
      desktop: state.desktop,
    };
    persistDesktopState(persistableState);
  }, 1000);
});

export default store;
