import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { authService } from '../../services/authService';

// Types
export interface User {
  id: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  isEmailVerified: boolean;
  isTwoFactorEnabled: boolean;
  accountType: 'retail' | 'professional' | 'institutional';
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  biometricEnabled: boolean;
  lastLoginMethod: 'password' | 'biometric' | null;
}

// Initial state
const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  biometricEnabled: false,
  lastLoginMethod: null,
};

// Async thunks
export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async (credentials: { email: string; password: string; rememberMe?: boolean }, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/registerUser',
  async (userData: {
    email: string;
    password: string;
    username: string;
    firstName?: string;
    lastName?: string;
  }, { rejectWithValue }) => {
    try {
      const response = await authService.register({
        ...userData,
        agreeToTerms: true,
        agreeToPrivacy: true,
      });
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const logoutUser = createAsyncThunk(
  'auth/logoutUser',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      if (state.auth.token) {
        await authService.logout(state.auth.token);
      }
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const refreshUserToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      if (!state.auth.refreshToken) {
        throw new Error('No refresh token available');
      }
      const response = await authService.refreshToken(state.auth.refreshToken);
      return response;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const verifyBiometric = createAsyncThunk(
  'auth/verifyBiometric',
  async (_, { rejectWithValue }) => {
    try {
      // This would integrate with react-native-biometrics
      // For now, we'll simulate the process
      return { success: true };
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Auth slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
      }
    },
    setBiometricEnabled: (state, action: PayloadAction<boolean>) => {
      state.biometricEnabled = action.payload;
    },
    setLastLoginMethod: (state, action: PayloadAction<'password' | 'biometric'>) => {
      state.lastLoginMethod = action.payload;
    },
    resetAuth: () => initialState,
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.isAuthenticated = true;
        state.lastLoginMethod = 'password';
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Register
    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.isAuthenticated = true;
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Logout
    builder
      .addCase(logoutUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutUser.fulfilled, () => initialState)
      .addCase(logoutUser.rejected, () => initialState);

    // Refresh token
    builder
      .addCase(refreshUserToken.fulfilled, (state, action) => {
        state.token = action.payload.token;
        state.refreshToken = action.payload.refreshToken;
        state.user = action.payload.user;
      })
      .addCase(refreshUserToken.rejected, () => initialState);

    // Biometric verification
    builder
      .addCase(verifyBiometric.fulfilled, (state) => {
        state.lastLoginMethod = 'biometric';
      });
  },
});

// Export actions
export const {
  clearError,
  updateUser,
  setBiometricEnabled,
  setLastLoginMethod,
  resetAuth,
} = authSlice.actions;

// Export reducer
export default authSlice.reducer;
