//clients/web-app/src/store/store.ts
import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from '@reduxjs/toolkit';
import authSlice from './slices/authSlice';
import marketDataSlice from './slices/marketDataSlice';
import tradingSlice from './slices/tradingSlice';
import portfolioSlice from './slices/portfolioSlice';
import uiSlice from './slices/uiSlice';

// Combine all reducers
const rootReducer = combineReducers({
  auth: authSlice,
  marketData: marketDataSlice,
  trading: tradingSlice,
  portfolio: portfolioSlice,
  ui: uiSlice,
});

// Persist configuration
const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth', 'ui'], // Only persist auth and ui state
};

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

// Create persistor
export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;