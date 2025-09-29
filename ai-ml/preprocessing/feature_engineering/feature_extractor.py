"""
Feature extraction for financial time series data.

This module provides comprehensive feature extraction capabilities for financial time series,
including technical indicators, market microstructure features, and time-based features.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Any
import logging
from scipy import stats
import talib
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler
from sklearn.base import BaseEstimator, TransformerMixin
import joblib

class FinancialFeatureExtractor(BaseEstimator, TransformerMixin):
    """
    Comprehensive feature extraction pipeline for financial time series
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize feature extractor
        
        Args:
            config: Feature extraction configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Feature categories
        self.technical_indicators = config.get('technical_indicators', [])
        self.market_microstructure = config.get('market_microstructure', [])
        self.time_features = config.get('time_features', [])
        self.lag_features = config.get('lag_features', {})
        
        # Scaling
        self.scaler_type = config.get('scaler', 'robust')
        self.scaler = None
        
        # Feature names
        self.feature_names_ = None
        self.n_features_ = None
        
        # Fitted indicators
        self.fitted_ = False
    
    def fit(self, X: pd.DataFrame, y=None):
        """
        Fit feature extractor on training data
        
        Args:
            X: Training data DataFrame
            y: Target values (not used)
            
        Returns:
            Self
        """
        self.logger.info("Fitting feature extractor...")
        
        # Extract all features
        features_df = self.extract_all_features(X)
        
        # Initialize scaler
        if self.scaler_type == 'standard':
            self.scaler = StandardScaler()
        elif self.scaler_type == 'minmax':
            self.scaler = MinMaxScaler()
        elif self.scaler_type == 'robust':
            self.scaler = RobustScaler()
        else:
            self.scaler = None
        
        # Fit scaler if provided
        if self.scaler is not None:
            self.scaler.fit(features_df.select_dtypes(include=[np.number]))
        
        # Store feature information
        self.feature_names_ = features_df.columns.tolist()
        self.n_features_ = len(self.feature_names_)
        self.fitted_ = True
        
        self.logger.info(f"Feature extractor fitted with {self.n_features_} features")
        
        return self
    
    def transform(self, X: pd.DataFrame) -> np.ndarray:
        """
        Transform data using fitted feature extractor
        
        Args:
            X: Input data DataFrame
            
        Returns:
            Feature array
        """
        if not self.fitted_:
            raise ValueError("Feature extractor must be fitted before transform")
        
        # Extract features
        features_df = self.extract_all_features(X)
        
        # Ensure same features as training
        features_df = features_df.reindex(columns=self.feature_names_, fill_value=0)
        
        # Convert to numeric
        features_array = features_df.select_dtypes(include=[np.number]).values
        
        # Scale if scaler is fitted
        if self.scaler is not None:
            features_array = self.scaler.transform(features_array)
        
        return features_array
    
    def extract_all_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract all configured features"""
        feature_df = df.copy()
        
        # Technical indicators
        if self.technical_indicators:
            feature_df = self.add_technical_indicators(feature_df)
        
        # Market microstructure features
        if self.market_microstructure:
            feature_df = self.add_market_microstructure_features(feature_df)
        
        # Time-based features
        if self.time_features:
            feature_df = self.add_time_features(feature_df)
        
        # Lag features
        if self.lag_features:
            feature_df = self.add_lag_features(feature_df)
        
        # Statistical features
        feature_df = self.add_statistical_features(feature_df)
        
        # Remove non-feature columns
        feature_columns = [col for col in feature_df.columns 
                          if col not in ['timestamp', 'symbol', 'target']]
        
        return feature_df[feature_columns].fillna(0)
    
    def add_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add technical indicators"""
        
        # Price arrays
        high = df['high'].values
        low = df['low'].values
        close = df['close'].values
        volume = df['volume'].values
        
        # Simple Moving Averages
        for period in [5, 10, 20, 50, 200]:
            if f'sma_{period}' in self.technical_indicators:
                df[f'sma_{period}'] = talib.SMA(close, timeperiod=period)
        
        # Exponential Moving Averages
        for period in [5, 10, 20, 50]:
            if f'ema_{period}' in self.technical_indicators:
                df[f'ema_{period}'] = talib.EMA(close, timeperiod=period)
        
        # RSI
        if 'rsi' in self.technical_indicators:
            df['rsi'] = talib.RSI(close, timeperiod=14)
            df['rsi_normalized'] = (df['rsi'] - 50) / 50  # Normalize to [-1, 1]
        
        # MACD
        if 'macd' in self.technical_indicators:
            macd, macdsignal, macdhist = talib.MACD(close)
            df['macd'] = macd
            df['macd_signal'] = macdsignal
            df['macd_histogram'] = macdhist
        
        # Bollinger Bands
        if 'bollinger_bands' in self.technical_indicators:
            upper, middle, lower = talib.BBANDS(close, timeperiod=20, nbdevup=2, nbdevdn=2)
            df['bb_upper'] = upper
            df['bb_middle'] = middle
            df['bb_lower'] = lower
            df['bb_width'] = (upper - lower) / middle
            df['bb_position'] = (close - lower) / (upper - lower)
        
        # Stochastic Oscillator
        if 'stochastic' in self.technical_indicators:
            slowk, slowd = talib.STOCH(high, low, close)
            df['stoch_k'] = slowk
            df['stoch_d'] = slowd
        
        # ATR (Average True Range)
        if 'atr' in self.technical_indicators:
            df['atr'] = talib.ATR(high, low, close, timeperiod=14)
            df['atr_percent'] = df['atr'] / close
        
        # Volume indicators
        if 'volume_indicators' in self.technical_indicators:
            df['volume_sma'] = talib.SMA(volume.astype(float), timeperiod=20)
            df['volume_ratio'] = volume / df['volume_sma']
            df['ad_line'] = talib.AD(high, low, close, volume.astype(float))
            df['obv'] = talib.OBV(close, volume.astype(float))
        
        # Momentum indicators
        if 'momentum' in self.technical_indicators:
            df['momentum'] = talib.MOM(close, timeperiod=10)
            df['roc'] = talib.ROC(close, timeperiod=10)
            df['williams_r'] = talib.WILLR(high, low, close, timeperiod=14)
        
        return df
    
    def add_market_microstructure_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add market microstructure features"""
        
        # Bid-ask spread
        if 'bid_ask_spread' in self.market_microstructure:
            if 'bid' in df.columns and 'ask' in df.columns:
                df['bid_ask_spread'] = (df['ask'] - df['bid']) / df['close']
                df['bid_ask_midpoint'] = (df['ask'] + df['bid']) / 2
                df['price_vs_midpoint'] = (df['close'] - df['bid_ask_midpoint']) / df['bid_ask_midpoint']
        
        # Order imbalance
        if 'order_imbalance' in self.market_microstructure:
            if 'bid_size' in df.columns and 'ask_size' in df.columns:
                total_size = df['bid_size'] + df['ask_size']
                df['order_imbalance'] = (df['bid_size'] - df['ask_size']) / total_size
        
        # High-low spread
        if 'high_low_spread' in self.market_microstructure:
            df['high_low_spread'] = (df['high'] - df['low']) / df['close']
        
        # Volume-weighted metrics
        if 'volume_weighted' in self.market_microstructure:
            df['vwap'] = (df['high'] + df['low'] + df['close']) / 3 * df['volume']
            df['vwap'] = df['vwap'].rolling(20).sum() / df['volume'].rolling(20).sum()
            df['price_vs_vwap'] = (df['close'] - df['vwap']) / df['vwap']
        
        return df
    
    def add_time_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add time-based features"""
        
        if 'timestamp' not in df.columns:
            return df
        
        # Ensure timestamp is datetime
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # Hour of day
        if 'hour' in self.time_features:
            df['hour'] = df['timestamp'].dt.hour
            df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
            df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
        
        # Day of week
        if 'day_of_week' in self.time_features:
            df['day_of_week'] = df['timestamp'].dt.dayofweek
            df['dow_sin'] = np.sin(2 * np.pi * df['day_of_week'] / 7)
            df['dow_cos'] = np.cos(2 * np.pi * df['day_of_week'] / 7)
        
        # Month
        if 'month' in self.time_features:
            df['month'] = df['timestamp'].dt.month
            df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
            df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
        
        # Market session
        if 'market_session' in self.time_features:
            df['is_market_open'] = (df['timestamp'].dt.hour >= 9) & (df['timestamp'].dt.hour < 16)
            df['is_pre_market'] = (df['timestamp'].dt.hour >= 4) & (df['timestamp'].dt.hour < 9)
            df['is_after_hours'] = (df['timestamp'].dt.hour >= 16) | (df['timestamp'].dt.hour < 4)
        
        return df
    
    def add_lag_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add lagged features"""
        
        lag_windows = self.lag_features.get('windows', [1, 2, 3, 5, 10])
        lag_columns = ['close', 'volume', 'high', 'low']
        
        for col in lag_columns:
            if col in df.columns:
                for lag in lag_windows:
                    df[f'{col}_lag_{lag}'] = df[col].shift(lag)
                
                # Rolling statistics
                for window in [5, 10, 20]:
                    df[f'{col}_mean_{window}'] = df[col].rolling(window).mean()
                    df[f'{col}_std_{window}'] = df[col].rolling(window).std()
                    df[f'{col}_min_{window}'] = df[col].rolling(window).min()
                    df[f'{col}_max_{window}'] = df[col].rolling(window).max()
        
        return df
    
    def add_statistical_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add statistical features"""
        
        # Returns
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        
        # Volatility
        for window in [5, 10, 20]:
            df[f'volatility_{window}'] = df['returns'].rolling(window).std()
            df[f'realized_vol_{window}'] = np.sqrt(252) * df[f'volatility_{window}']
        
        # Skewness and Kurtosis
        for window in [20, 60]:
            df[f'skewness_{window}'] = df['returns'].rolling(window).skew()
            df[f'kurtosis_{window}'] = df['returns'].rolling(window).kurt()
        
        # Price ratios
        df['open_close_ratio'] = df['open'] / df['close']
        df['high_close_ratio'] = df['high'] / df['close']
        df['low_close_ratio'] = df['low'] / df['close']
        
        return df
    
    def get_feature_names(self) -> List[str]:
        """Get list of feature names"""
        if not self.fitted_:
            raise ValueError("Feature extractor must be fitted first")
        return self.feature_names_
    
    def save_extractor(self, filepath: str):
        """Save feature extractor"""
        extractor_data = {
            'config': self.config,
            'scaler': self.scaler,
            'feature_names_': self.feature_names_,
            'n_features_': self.n_features_,
            'fitted_': self.fitted_
        }
        
        joblib.dump(extractor_data, filepath)
        self.logger.info(f"Feature extractor saved to {filepath}")
    
    def load_extractor(self, filepath: str):
        """Load feature extractor"""
        extractor_data = joblib.load(filepath)
        
        self.config = extractor_data['config']
        self.scaler = extractor_data['scaler']
        self.feature_names_ = extractor_data['feature_names_']
        self.n_features_ = extractor_data['n_features_']
        self.fitted_ = extractor_data['fitted_']
        
        # Recreate feature categories from config
        self.technical_indicators = self.config.get('technical_indicators', [])
        self.market_microstructure = self.config.get('market_microstructure', [])
        self.time_features = self.config.get('time_features', [])
        self.lag_features = self.config.get('lag_features', {})
        
        self.logger.info(f"Feature extractor loaded from {filepath}")

# Example configuration
DEFAULT_FEATURE_CONFIG = {
    'technical_indicators': [
        'sma_20', 'sma_50', 'sma_200',
        'ema_10', 'ema_20', 'rsi', 'macd',
        'bollinger_bands', 'atr', 'volume_indicators'
    ],
    'market_microstructure': [
        'bid_ask_spread', 'order_imbalance',
        'high_low_spread', 'volume_weighted'
    ],
    'time_features': ['hour', 'day_of_week', 'month', 'market_session'],
    'lag_features': {
        'windows': [1, 2, 3, 5, 10, 20],
        'columns': ['close', 'volume', 'high', 'low']
    },
    'scaler': 'robust'
}
