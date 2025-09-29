"""
Advanced data normalization for financial time series data.

This module provides various normalization techniques specifically designed
for financial data, including price, volume, and feature normalization.
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Any, Optional
import logging
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler, PowerTransformer
import joblib

class AdvancedNormalizer:
    """
    Advanced data normalization for financial time series
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize normalizer
        
        Args:
            config: Normalization configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Normalization methods
        self.price_method = config.get('price_normalization', 'log_returns')
        self.volume_method = config.get('volume_normalization', 'log_transform')
        self.feature_method = config.get('feature_normalization', 'robust')
        
        # Scalers
        self.price_scaler = None
        self.volume_scaler = None
        self.feature_scaler = None
        
        # Statistics
        self.price_stats = {}
        self.volume_stats = {}
        self.feature_stats = {}
        
        self.fitted_ = False
    
    def fit(self, df: pd.DataFrame) -> 'AdvancedNormalizer':
        """
        Fit normalizer on training data
        
        Args:
            df: Training data DataFrame
            
        Returns:
            Self
        """
        self.logger.info("Fitting advanced normalizer...")
        
        # Fit price normalization
        self._fit_price_normalization(df)
        
        # Fit volume normalization
        self._fit_volume_normalization(df)
        
        # Fit feature normalization
        self._fit_feature_normalization(df)
        
        self.fitted_ = True
        self.logger.info("Advanced normalizer fitted successfully")
        
        return self
    
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Transform data using fitted normalizer
        
        Args:
            df: Input DataFrame
            
        Returns:
            Normalized DataFrame
        """
        if not self.fitted_:
            raise ValueError("Normalizer must be fitted before transform")
        
        df_normalized = df.copy()
        
        # Transform prices
        df_normalized = self._transform_prices(df_normalized)
        
        # Transform volume
        df_normalized = self._transform_volume(df_normalized)
        
        # Transform features
        df_normalized = self._transform_features(df_normalized)
        
        return df_normalized
    
    def _fit_price_normalization(self, df: pd.DataFrame):
        """Fit price normalization"""
        price_columns = ['open', 'high', 'low', 'close']
        available_price_cols = [col for col in price_columns if col in df.columns]
        
        if self.price_method == 'log_returns':
            # Calculate log returns for fitting scaler
            returns_data = []
            for col in available_price_cols:
                returns = np.log(df[col] / df[col].shift(1)).dropna()
                returns_data.extend(returns.values)
            
            if returns_data:
                self.price_scaler = RobustScaler()
                self.price_scaler.fit(np.array(returns_data).reshape(-1, 1))
        
        elif self.price_method == 'percent_change':
            # Calculate percent changes for fitting
            returns_data = []
            for col in available_price_cols:
                returns = df[col].pct_change().dropna()
                returns_data.extend(returns.values)
            
            if returns_data:
                self.price_scaler = RobustScaler()
                self.price_scaler.fit(np.array(returns_data).reshape(-1, 1))
        
        elif self.price_method == 'price_relative':
            # Use first price as reference
            if available_price_cols:
                reference_price = df[available_price_cols[0]].iloc[0]
                self.price_stats['reference_price'] = reference_price
        
        elif self.price_method == 'z_score':
            # Fit standard scaler on prices
            if available_price_cols:
                price_data = df[available_price_cols].values.flatten()
                price_data = price_data[~np.isnan(price_data)]
                if len(price_data) > 0:
                    self.price_scaler = StandardScaler()
                    self.price_scaler.fit(price_data.reshape(-1, 1))
    
    def _fit_volume_normalization(self, df: pd.DataFrame):
        """Fit volume normalization"""
        if 'volume' not in df.columns:
            return
        
        volume_data = df['volume'].dropna()
        
        if self.volume_method == 'log_transform':
            # Log transform with small constant to handle zeros
            log_volume = np.log(volume_data + 1)
            self.volume_scaler = StandardScaler()
            self.volume_scaler.fit(log_volume.values.reshape(-1, 1))
        
        elif self.volume_method == 'power_transform':
            # Box-Cox or Yeo-Johnson transformation
            self.volume_scaler = PowerTransformer(method='yeo-johnson')
            self.volume_scaler.fit(volume_data.values.reshape(-1, 1))
        
        elif self.volume_method == 'quantile_transform':
            from sklearn.preprocessing import QuantileTransformer
            self.volume_scaler = QuantileTransformer(output_distribution='normal')
            self.volume_scaler.fit(volume_data.values.reshape(-1, 1))
        
        elif self.volume_method == 'rolling_zscore':
            # Store rolling statistics
            window = self.config.get('volume_window', 20)
            rolling_mean = volume_data.rolling(window).mean()
            rolling_std = volume_data.rolling(window).std()
            
            self.volume_stats = {
                'rolling_mean': rolling_mean.mean(),
                'rolling_std': rolling_std.mean(),
                'window': window
            }
    
    def _fit_feature_normalization(self, df: pd.DataFrame):
        """Fit feature normalization"""
        # Select numeric columns (excluding price and volume)
        exclude_cols = ['open', 'high', 'low', 'close', 'volume', 'timestamp', 'symbol']
        feature_cols = [col for col in df.columns 
                       if col not in exclude_cols and df[col].dtype in [np.float64, np.int64]]
        
        if not feature_cols:
            return
        
        feature_data = df[feature_cols].dropna()
        
        if self.feature_method == 'robust':
            self.feature_scaler = RobustScaler()
            self.feature_scaler.fit(feature_data)
        
        elif self.feature_method == 'standard':
            self.feature_scaler = StandardScaler()
            self.feature_scaler.fit(feature_data)
        
        elif self.feature_method == 'minmax':
            self.feature_scaler = MinMaxScaler()
            self.feature_scaler.fit(feature_data)
        
        # Store feature column names
        self.feature_stats['feature_columns'] = feature_cols
    
    def _transform_prices(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform price columns"""
        price_columns = ['open', 'high', 'low', 'close']
        available_price_cols = [col for col in price_columns if col in df.columns]
        
        if self.price_method == 'log_returns':
            for col in available_price_cols:
                returns = np.log(df[col] / df[col].shift(1))
                if self.price_scaler:
                    returns_scaled = self.price_scaler.transform(returns.dropna().values.reshape(-1, 1))
                    df[f'{col}_normalized'] = np.concatenate([[np.nan], returns_scaled.flatten()])
                else:
                    df[f'{col}_normalized'] = returns
        
        elif self.price_method == 'percent_change':
            for col in available_price_cols:
                returns = df[col].pct_change()
                if self.price_scaler:
                    returns_scaled = self.price_scaler.transform(returns.dropna().values.reshape(-1, 1))
                    df[f'{col}_normalized'] = np.concatenate([[np.nan], returns_scaled.flatten()])
                else:
                    df[f'{col}_normalized'] = returns
        
        elif self.price_method == 'price_relative':
            reference_price = self.price_stats.get('reference_price', 1.0)
            for col in available_price_cols:
                df[f'{col}_normalized'] = df[col] / reference_price
        
        elif self.price_method == 'z_score':
            if self.price_scaler:
                for col in available_price_cols:
                    df[f'{col}_normalized'] = self.price_scaler.transform(df[col].values.reshape(-1, 1)).flatten()
        
        return df
    
    def _transform_volume(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform volume column"""
        if 'volume' not in df.columns:
            return df
        
        if self.volume_method == 'log_transform':
            log_volume = np.log(df['volume'] + 1)
            if self.volume_scaler:
                df['volume_normalized'] = self.volume_scaler.transform(log_volume.values.reshape(-1, 1)).flatten()
            else:
                df['volume_normalized'] = log_volume
        
        elif self.volume_method in ['power_transform', 'quantile_transform']:
            if self.volume_scaler:
                df['volume_normalized'] = self.volume_scaler.transform(df['volume'].values.reshape(-1, 1)).flatten()
        
        elif self.volume_method == 'rolling_zscore':
            window = self.volume_stats.get('window', 20)
            rolling_mean = df['volume'].rolling(window).mean()
            rolling_std = df['volume'].rolling(window).std()
            
            # Use global stats for early periods
            global_mean = self.volume_stats.get('rolling_mean', df['volume'].mean())
            global_std = self.volume_stats.get('rolling_std', df['volume'].std())
            
            rolling_mean = rolling_mean.fillna(global_mean)
            rolling_std = rolling_std.fillna(global_std)
            
            df['volume_normalized'] = (df['volume'] - rolling_mean) / (rolling_std + 1e-8)
        
        return df
    
    def _transform_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform feature columns"""
        if not self.feature_scaler or 'feature_columns' not in self.feature_stats:
            return df
        
        feature_cols = self.feature_stats['feature_columns']
        available_feature_cols = [col for col in feature_cols if col in df.columns]
        
        if available_feature_cols:
            # Ensure same column order as training
            feature_data = df[available_feature_cols].reindex(columns=feature_cols, fill_value=0)
            
            # Transform features
            transformed_features = self.feature_scaler.transform(feature_data.fillna(0))
            
            # Add normalized features to dataframe
            for i, col in enumerate(feature_cols):
                if col in df.columns:
                    df[f'{col}_normalized'] = transformed_features[:, i]
        
        return df
    
    def inverse_transform_prices(self, df: pd.DataFrame, price_col: str = 'close') -> pd.DataFrame:
        """
        Inverse transform price normalization
        
        Args:
            df: DataFrame with normalized prices
            price_col: Original price column name
            
        Returns:
            DataFrame with inverse-transformed prices
        """
        df_inv = df.copy()
        normalized_col = f'{price_col}_normalized'
        
        if normalized_col not in df_inv.columns:
            return df_inv
        
        if self.price_method == 'log_returns':
            if self.price_scaler:
                # Inverse scale
                returns_inv = self.price_scaler.inverse_transform(
                    df_inv[normalized_col].dropna().values.reshape(-1, 1)
                ).flatten()
                
                # Convert back to prices (assuming first price is available)
                if price_col in df_inv.columns:
                    prices_inv = [df_inv[price_col].iloc[0]]  # Start with first price
                    for ret in returns_inv:
                        prices_inv.append(prices_inv[-1] * np.exp(ret))
                    
                    df_inv[f'{price_col}_inverse'] = prices_inv[:len(df_inv)]
        
        elif self.price_method == 'price_relative':
            reference_price = self.price_stats.get('reference_price', 1.0)
            df_inv[f'{price_col}_inverse'] = df_inv[normalized_col] * reference_price
        
        return df_inv
    
    def save_normalizer(self, filepath: str):
        """Save normalizer"""
        normalizer_data = {
            'config': self.config,
            'price_scaler': self.price_scaler,
            'volume_scaler': self.volume_scaler,
            'feature_scaler': self.feature_scaler,
            'price_stats': self.price_stats,
            'volume_stats': self.volume_stats,
            'feature_stats': self.feature_stats,
            'fitted_': self.fitted_
        }
        
        joblib.dump(normalizer_data, filepath)
        self.logger.info(f"Normalizer saved to {filepath}")
    
    def load_normalizer(self, filepath: str):
        """Load normalizer"""
        normalizer_data = joblib.load(filepath)
        
        self.config = normalizer_data['config']
        self.price_scaler = normalizer_data['price_scaler']
        self.volume_scaler = normalizer_data['volume_scaler']
        self.feature_scaler = normalizer_data['feature_scaler']
        self.price_stats = normalizer_data['price_stats']
        self.volume_stats = normalizer_data['volume_stats']
        self.feature_stats = normalizer_data['feature_stats']
        self.fitted_ = normalizer_data['fitted_']
        
        # Recreate normalization methods from config
        self.price_method = self.config.get('price_normalization', 'log_returns')
        self.volume_method = self.config.get('volume_normalization', 'log_transform')
        self.feature_method = self.config.get('feature_normalization', 'robust')
        
        self.logger.info(f"Normalizer loaded from {filepath}")

# Example configuration
DEFAULT_NORMALIZATION_CONFIG = {
    'price_normalization': 'log_returns',  # Options: log_returns, percent_change, price_relative, z_score
    'volume_normalization': 'log_transform',  # Options: log_transform, power_transform, quantile_transform, rolling_zscore
    'feature_normalization': 'robust',  # Options: robust, standard, minmax
    'volume_window': 20  # For rolling_zscore method
}
