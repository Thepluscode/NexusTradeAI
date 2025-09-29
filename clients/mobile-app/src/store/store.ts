import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import slices
import authSlice from './slices/authSlice';
import marketDataSlice from './slices/marketDataSlice';
import tradingSlice from './slices/tradingSlice';
import portfolioSlice from './slices/portfolioSlice';
import settingsSlice from './slices/settingsSlice';
import notificationsSlice from './slices/notificationsSlice';

// Persist configuration
const persistConfig = {
  key: 'root',
  storage: AsyncStorage,
  whitelist: ['auth', 'settings'], // Only persist auth and settings
  blacklist: ['marketData', 'trading'], // Don't persist real-time data
};

// Root reducer
const rootReducer = combineReducers({
  auth: authSlice,
  marketData: marketDataSlice,
  trading: tradingSlice,
  portfolio: portfolioSlice,
  settings: settingsSlice,
  notifications: notificationsSlice,
});

// Persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store
export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
  devTools: __DEV__,
});

// Create persistor
export const persistor = persistStore(store);

// Types
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
