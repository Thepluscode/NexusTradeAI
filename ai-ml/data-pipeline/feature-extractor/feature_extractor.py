"""
Feature Extractor for Financial Time Series Data

This module provides functionality to extract various technical indicators and features
from financial time series data for use in machine learning models.
"""

import numpy as np
import pandas as pd
import talib
from typing import Dict, List, Optional, Union, Tuple, Any, Callable
from dataclasses import dataclass, field
from enum import Enum, auto
import logging
from abc import ABC, abstractmethod
import warnings

# Suppress warnings from TA-Lib
warnings.filterwarnings('ignore', category=RuntimeWarning)

logger = logging.getLogger(__name__)

class FeatureType(Enum):
    """Enumeration of different feature types."""
    PRICE = auto()
    VOLUME = auto()
    VOLATILITY = auto()
    MOMENTUM = auto()
    TREND = auto()
    CYCLE = auto()
    STATISTICAL = auto()
    PATTERN = auto()
    TRANSFORM = auto()

@dataclass
class FeatureConfig:
    """Configuration for feature extraction."""
    # General parameters
    lookback_period: int = 14
    target_column: str = 'close'
    volume_column: str = 'volume'
    
    # Feature toggles
    enable_price_features: bool = True
    enable_volume_features: bool = True
    enable_volatility_features: bool = True
    enable_momentum_features: bool = True
    enable_trend_features: bool = True
    enable_cycle_features: bool = False
    enable_statistical_features: bool = True
    enable_pattern_features: bool = False
    
    # Specific feature toggles
    enable_rsi: bool = True
    enable_macd: bool = True
    enable_bollinger_bands: bool = True
    enable_atr: bool = True
    enable_obv: bool = True
    enable_adx: bool = True
    enable_aroon: bool = True
    enable_cci: bool = True
    enable_stoch: bool = True
    
    # Feature scaling
    scale_features: bool = True
    scaler_type: str = 'standard'  # 'standard', 'minmax', 'robust', or None
    
    # Feature selection
    feature_importance_threshold: Optional[float] = None

class BaseFeatureExtractor(ABC):
    """Abstract base class for feature extractors."""
    
    @abstractmethod
    def extract_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Extract features from the input data."""
        pass

class TechnicalFeatureExtractor(BaseFeatureExtractor):
    """Extracts technical indicators as features from financial time series data."""
    
    def __init__(self, config: Optional[FeatureConfig] = None):
        """Initialize the TechnicalFeatureExtractor.
        
        Args:
            config: Configuration for feature extraction.
        """
        self.config = config or FeatureConfig()
        self.features_: List[Dict[str, Any]] = []
        self.feature_names_: List[str] = []
    
    def extract_features(self, data: pd.DataFrame) -> pd.DataFrame:
        """Extract technical indicators as features.
        
        Args:
            data: DataFrame with OHLCV data.
            
        Returns:
            DataFrame with extracted features.
        """
        if not isinstance(data, pd.DataFrame):
            raise ValueError("Input data must be a pandas DataFrame")
            
        if len(data) < self.config.lookback_period * 2:
            raise ValueError(
                f"Insufficient data points. Need at least {self.config.lookback_period * 2} "
                f"points, got {len(data)}"
            )
        
        # Create a copy to avoid modifying the original data
        df = data.copy()
        features = pd.DataFrame(index=df.index)
        
        # Extract price features
        if self.config.enable_price_features:
            price_features = self._extract_price_features(df)
            features = pd.concat([features, price_features], axis=1)
        
        # Extract volume features
        if self.config.enable_volume_features and self.config.volume_column in df.columns:
            volume_features = self._extract_volume_features(df)
            features = pd.concat([features, volume_features], axis=1)
        
        # Extract volatility features
        if self.config.enable_volatility_features:
            volatility_features = self._extract_volatility_features(df)
            features = pd.concat([features, volatility_features], axis=1)
        
        # Extract momentum features
        if self.config.enable_momentum_features:
            momentum_features = self._extract_momentum_features(df)
            features = pd.concat([features, momentum_features], axis=1)
        
        # Extract trend features
        if self.config.enable_trend_features:
            trend_features = self._extract_trend_features(df)
            features = pd.concat([features, trend_features], axis=1)
        
        # Extract cycle features
        if self.config.enable_cycle_features:
            cycle_features = self._extract_cycle_features(df)
            features = pd.concat([features, cycle_features], axis=1)
        
        # Extract statistical features
        if self.config.enable_statistical_features:
            stat_features = self._extract_statistical_features(df)
            features = pd.concat([features, stat_features], axis=1)
        
        # Extract pattern features
        if self.config.enable_pattern_features:
            pattern_features = self._extract_pattern_features(df)
            features = pd.concat([features, pattern_features], axis=1)
        
        # Drop any rows with NaN values that may have been introduced
        features = features.dropna()
        
        return features
    
    def _extract_price_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract price-based features."""
        features = pd.DataFrame(index=df.index)
        
        # Basic price features
        if 'open' in df.columns:
            features['open'] = df['open']
        
        if 'high' in df.columns:
            features['high'] = df['high']
        
        if 'low' in df.columns:
            features['low'] = df['low']
        
        if 'close' in df.columns:
            close = df['close']
            features['close'] = close
            
            # Price changes
            for period in [1, 5, self.config.lookback_period]:
                if len(df) > period:
                    col_name = f'price_change_{period}'
                    features[col_name] = close.pct_change(periods=period)
            
            # Moving averages
            for period in [5, 10, 20, 50, 100, 200]:
                if len(df) >= period:
                    col_name = f'sma_{period}'
                    features[col_name] = close.rolling(window=period).mean()
                    
                    # Price relative to moving average
                    rel_col = f'close_ma_ratio_{period}'
                    features[rel_col] = close / features[col_name] - 1
            
            # Exponential moving averages
            for period in [9, 12, 26]:
                if len(df) >= period:
                    col_name = f'ema_{period}'
                    features[col_name] = close.ewm(span=period, adjust=False).mean()
        
        return features
    
    def _extract_volume_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract volume-based features."""
        features = pd.DataFrame(index=df.index)
        
        if self.config.volume_column not in df.columns:
            return features
        
        volume = df[self.config.volume_column]
        
        # Basic volume features
        features['volume'] = volume
        
        # Volume changes
        for period in [1, 5, self.config.lookback_period]:
            if len(df) > period:
                col_name = f'volume_change_{period}'
                features[col_name] = volume.pct_change(periods=period)
        
        # Volume moving averages
        for period in [5, 10, 20]:
            if len(df) >= period:
                col_name = f'volume_ma_{period}'
                features[col_name] = volume.rolling(window=period).mean()
                
                # Volume relative to moving average
                rel_col = f'volume_ma_ratio_{period}'
                features[rel_col] = volume / features[col_name] - 1
        
        # On-Balance Volume (OBV)
        if self.config.enable_obv and 'close' in df.columns:
            obv = [0]
            for i in range(1, len(df)):
                if df['close'].iloc[i] > df['close'].iloc[i-1]:
                    obv.append(obv[-1] + volume.iloc[i])
                elif df['close'].iloc[i] < df['close'].iloc[i-1]:
                    obv.append(obv[-1] - volume.iloc[i])
                else:
                    obv.append(obv[-1])
            
            features['obv'] = obv
        
        return features
    
    def _extract_volatility_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract volatility-based features."""
        features = pd.DataFrame(index=df.index)
        
        if 'close' not in df.columns:
            return features
        
        close = df['close']
        returns = close.pct_change()
        
        # Historical volatility (standard deviation of returns)
        for period in [5, 10, 20, self.config.lookback_period]:
            if len(df) > period:
                col_name = f'volatility_{period}'
                features[col_name] = returns.rolling(window=period).std() * np.sqrt(252)  # Annualized
        
        # Average True Range (ATR)
        if self.config.enable_atr and all(col in df.columns for col in ['high', 'low', 'close']):
            high, low, close = df['high'], df['low'], df['close']
            
            # Calculate True Range
            tr1 = high - low
            tr2 = (high - close.shift(1)).abs()
            tr3 = (low - close.shift(1)).abs()
            true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
            
            # Calculate ATR
            atr_period = self.config.atr_period if hasattr(self.config, 'atr_period') else 14
            if len(df) >= atr_period:
                atr = true_range.rolling(window=atr_period).mean()
                features['atr'] = atr
                
                # ATR as percentage of price
                features['atr_pct'] = atr / close
        
        # Bollinger Bands
        if self.config.enable_bollinger_bands and 'close' in df.columns:
            period = self.config.bollinger_period if hasattr(self.config, 'bollinger_period') else 20
            std_dev = self.config.bollinger_std if hasattr(self.config, 'bollinger_std') else 2.0
            
            if len(df) >= period:
                sma = close.rolling(window=period).mean()
                rolling_std = close.rolling(window=period).std()
                
                upper_band = sma + (rolling_std * std_dev)
                lower_band = sma - (rolling_std * std_dev)
                
                features['bb_upper'] = upper_band
                features['bb_middle'] = sma
                features['bb_lower'] = lower_band
                
                # Bollinger Band Width
                features['bb_width'] = (upper_band - lower_band) / sma
                
                # %B (percent b)
                features['bb_pct_b'] = (close - lower_band) / (upper_band - lower_band)
        
        return features
    
    def _extract_momentum_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract momentum-based features."""
        features = pd.DataFrame(index=df.index)
        
        if 'close' not in df.columns:
            return features
        
        close = df['close']
        
        # Relative Strength Index (RSI)
        if self.config.enable_rsi:
            rsi_period = self.config.rsi_period if hasattr(self.config, 'rsi_period') else 14
            if len(df) > rsi_period:
                delta = close.diff()
                gain = (delta.where(delta > 0, 0)).rolling(window=rsi_period).mean()
                loss = (-delta.where(delta < 0, 0)).rolling(window=rsi_period).mean()
                rs = gain / loss
                rsi = 100 - (100 / (1 + rs))
                
                features['rsi'] = rsi
        
        # Moving Average Convergence Divergence (MACD)
        if self.config.enable_macd and len(df) >= 26:  # MACD slow period is typically 26
            fast = self.config.macd_fast if hasattr(self.config, 'macd_fast') else 12
            slow = self.config.macd_slow if hasattr(self.config, 'macd_slow') else 26
            signal = self.config.macd_signal if hasattr(self.config, 'macd_signal') else 9
            
            exp1 = close.ewm(span=fast, adjust=False).mean()
            exp2 = close.ewm(span=slow, adjust=False).mean()
            macd = exp1 - exp2
            signal_line = macd.ewm(span=signal, adjust=False).mean()
            
            features['macd'] = macd
            features['macd_signal'] = signal_line
            features['macd_hist'] = macd - signal_line
        
        # Rate of Change (ROC)
        for period in [5, 10, 20]:
            if len(df) > period:
                col_name = f'roc_{period}'
                features[col_name] = (close / close.shift(period) - 1) * 100
        
        # Stochastic Oscillator
        if self.config.enable_stoch and all(col in df.columns for col in ['high', 'low', 'close']):
            high, low, close = df['high'], df['low'], df['close']
            k_period = self.config.stoch_k_period if hasattr(self.config, 'stoch_k_period') else 14
            d_period = self.config.stoch_d_period if hasattr(self.config, 'stoch_d_period') else 3
            slowk_period = self.config.stoch_slowk_period if hasattr(self.config, 'stoch_slowk_period') else 3
            
            if len(df) >= k_period + d_period + slowk_period:
                # Fast %K
                lowest_low = low.rolling(window=k_period).min()
                highest_high = high.rolling(window=k_period).max()
                fast_k = 100 * ((close - lowest_low) / (highest_high - lowest_low))
                
                # Slow %K (simple moving average of %K)
                slow_k = fast_k.rolling(window=slowk_period).mean()
                
                # %D (simple moving average of slow %K)
                slow_d = slow_k.rolling(window=d_period).mean()
                
                features['stoch_k'] = slow_k
                features['stoch_d'] = slow_d
        
        # Commodity Channel Index (CCI)
        if self.config.enable_cci and all(col in df.columns for col in ['high', 'low', 'close']):
            cci_period = self.config.cci_period if hasattr(self.config, 'cci_period') else 20
            if len(df) >= cci_period:
                tp = (df['high'] + df['low'] + df['close']) / 3
                sma = tp.rolling(window=cci_period).mean()
                mad = lambda x: np.fabs(x - x.mean()).mean()
                mean_dev = tp.rolling(window=cci_period).apply(mad, raw=True)
                cci = (tp - sma) / (0.015 * mean_dev)
                
                features['cci'] = cci
        
        return features
    
    def _extract_trend_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract trend-based features."""
        features = pd.DataFrame(index=df.index)
        
        if 'close' not in df.columns:
            return features
        
        close = df['close']
        
        # Average Directional Index (ADX)
        if self.config.enable_adx and all(col in df.columns for col in ['high', 'low', 'close']):
            adx_period = self.config.adx_period if hasattr(self.config, 'adx_period') else 14
            if len(df) >= 2 * adx_period:
                high, low, close = df['high'], df['low'], df['close']
                
                # Calculate +DM and -DM
                up = high.diff()
                down = -low.diff()
                
                plus_dm = up.where((up > down) & (up > 0), 0)
                minus_dm = down.where((down > up) & (down > 0), 0)
                
                # Calculate True Range (TR)
                tr1 = high - low
                tr2 = (high - close.shift(1)).abs()
                tr3 = (low - close.shift(1)).abs()
                tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
                
                # Smooth the TR, +DM, and -DM
                tr_smooth = tr.rolling(window=adx_period).sum()
                plus_dm_smooth = plus_dm.rolling(window=adx_period).sum()
                minus_dm_smooth = minus_dm.rolling(window=adx_period).sum()
                
                # Calculate +DI and -DI
                plus_di = 100 * (plus_dm_smooth / tr_smooth)
                minus_di = 100 * (minus_dm_smooth / tr_smooth)
                
                # Calculate DX
                dx = 100 * (np.abs(plus_di - minus_di) / (plus_di + minus_di)).fillna(0)
                
                # Calculate ADX
                adx = dx.rolling(window=adx_period).mean()
                
                features['adx'] = adx
                features['plus_di'] = plus_di
                features['minus_di'] = minus_di
        
        # Aroon Indicator
        if self.config.enable_aroon and all(col in df.columns for col in ['high', 'low']):
            aroon_period = self.config.aroon_period if hasattr(self.config, 'aroon_period') else 14
            if len(df) >= aroon_period:
                high, low = df['high'], df['low']
                
                # Calculate Aroon Up
                rolling_high = high.rolling(window=aroon_period + 1)
                days_since_high = rolling_high.apply(
                    lambda x: aroon_period - x.argmax() if not x.isna().all() else np.nan,
                    raw=True
                )
                aroon_up = 100 * (1 - (days_since_high / aroon_period))
                
                # Calculate Aroon Down
                rolling_low = low.rolling(window=aroon_period + 1)
                days_since_low = rolling_low.apply(
                    lambda x: aroon_period - x.argmin() if not x.isna().all() else np.nan,
                    raw=True
                )
                aroon_down = 100 * (1 - (days_since_low / aroon_period))
                
                features['aroon_up'] = aroon_up
                features['aroon_down'] = aroon_down
                features['aroon_osc'] = aroon_up - aroon_down
        
        return features
    
    def _extract_cycle_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract cycle-based features."""
        features = pd.DataFrame(index=df.index)
        
        if 'close' not in df.columns:
            return features
        
        # Hilbert Transform - Sine Wave
        if len(df) >= 5:  # Minimum required for Hilbert transform
            close = df['close']
            
            # Simple detrending
            detrended = close - close.rolling(window=5).mean()
            
            # Apply Hilbert Transform
            from scipy.signal import hilbert
            
            analytic_signal = hilbert(detrended.dropna())
            instantaneous_phase = np.unwrap(np.angle(analytic_signal))
            instantaneous_frequency = (np.diff(instantaneous_phase) / (2.0 * np.pi) * 252)  # Annualized
            
            # Align the frequency data with the original index
            freq_series = pd.Series(instantaneous_frequency, index=detrended.index[1:detrended.index.get_loc(detrended.last_valid_index())+1])
            features['cycle_frequency'] = freq_series.reindex(df.index)
        
        return features
    
    def _extract_statistical_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract statistical features."""
        features = pd.DataFrame(index=df.index)
        
        if 'close' not in df.columns:
            return features
        
        close = df['close']
        returns = close.pct_change()
        
        # Rolling statistics
        for period in [5, 10, 20, self.config.lookback_period]:
            if len(df) > period:
                # Rolling mean
                features[f'rolling_mean_{period}'] = close.rolling(window=period).mean()
                
                # Rolling standard deviation
                features[f'rolling_std_{period}'] = close.rolling(window=period).std()
                
                # Rolling skewness
                features[f'rolling_skew_{period}'] = close.rolling(window=period).skew()
                
                # Rolling kurtosis
                features[f'rolling_kurt_{period}'] = close.rolling(window=period).kurt()
                
                # Rolling min/max
                features[f'rolling_min_{period}'] = close.rolling(window=period).min()
                features[f'rolling_max_{period}'] = close.rolling(window=period).max()
                
                # Rolling quantiles
                for q in [0.1, 0.25, 0.5, 0.75, 0.9]:
                    features[f'rolling_q{int(q*100)}_{period}'] = close.rolling(window=period).quantile(q)
        
        # Volatility clustering
        if len(df) > 20:  # Minimum required for meaningful volatility clustering
            # GARCH-like volatility (simplified)
            squared_returns = returns ** 2
            features['volatility_cluster'] = squared_returns.rolling(window=20).mean()
        
        return features
    
    def _extract_pattern_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract candlestick pattern features."""
        features = pd.DataFrame(index=df.index)
        
        if not all(col in df.columns for col in ['open', 'high', 'low', 'close']):
            return features
        
        # Get all pattern functions from TA-Lib
        pattern_functions = [func for func in dir(talib) if func.startswith('CDL')]
        
        # Apply each pattern function
        for pattern in pattern_functions:
            try:
                pattern_func = getattr(talib, pattern)
                result = pattern_func(df['open'], df['high'], df['low'], df['close'])
                features[f'pattern_{pattern[3:].lower()}'] = result
            except Exception as e:
                logger.warning(f"Error calculating pattern {pattern}: {e}")
        
        return features

class FeaturePipeline:
    """Pipeline for feature extraction and transformation."""
    
    def __init__(self, extractors: Optional[List[BaseFeatureExtractor]] = None):
        """Initialize the feature pipeline.
        
        Args:
            extractors: List of feature extractors to use in the pipeline.
        """
        self.extractors = extractors or []
        self.feature_names_ = []
    
    def add_extractor(self, extractor: BaseFeatureExtractor) -> 'FeaturePipeline':
        """Add a feature extractor to the pipeline.
        
        Args:
            extractor: Feature extractor to add.
            
        Returns:
            self: For method chaining.
        """
        self.extractors.append(extractor)
        return self
    
    def fit(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> 'FeaturePipeline':
        """Fit the feature extractors.
        
        Args:
            X: Input data.
            y: Target variable (optional).
            
        Returns:
            self: The fitted feature pipeline.
        """
        # No fitting needed for basic technical indicators
        return self
    
    def transform(self, X: pd.DataFrame) -> pd.DataFrame:
        """Transform the input data by extracting features.
        
        Args:
            X: Input data.
            
        Returns:
            DataFrame with extracted features.
        """
        if not self.extractors:
            raise ValueError("No feature extractors have been added to the pipeline")
        
        features_list = []
        
        for extractor in self.extractors:
            try:
                extracted = extractor.extract_features(X)
                features_list.append(extracted)
                
                # Update feature names
                if hasattr(extractor, 'feature_names_'):
                    self.feature_names_.extend(extractor.feature_names_)
                else:
                    self.feature_names_.extend(extracted.columns.tolist())
            except Exception as e:
                logger.error(f"Error in feature extractor {extractor.__class__.__name__}: {e}")
                continue
        
        # Combine all features
        if features_list:
            return pd.concat(features_list, axis=1)
        return pd.DataFrame(index=X.index)
    
    def fit_transform(self, X: pd.DataFrame, y: Optional[pd.Series] = None) -> pd.DataFrame:
        """Fit the pipeline and transform the data.
        
        Args:
            X: Input data.
            y: Target variable (optional).
            
        Returns:
            DataFrame with extracted features.
        """
        return self.fit(X, y).transform(X)

# Example usage
if __name__ == "__main__":
    import yfinance as yf
    import matplotlib.pyplot as plt
    
    # Download sample data
    print("Downloading sample data...")
    data = yf.download('AAPL', start='2020-01-01', end='2021-01-01')
    
    # Initialize feature extractor with default configuration
    extractor = TechnicalFeatureExtractor()
    
    # Extract features
    print("Extracting features...")
    features = extractor.extract_features(data)
    
    # Display some basic information
    print(f"\nExtracted {features.shape[1]} features:")
    print(features.head())
    
    # Plot some features
    plt.figure(figsize=(12, 8))
    
    # Plot price and moving averages
    plt.subplot(3, 1, 1)
    plt.plot(data.index, data['close'], label='Close Price', color='black')
    if 'sma_20' in features.columns:
        plt.plot(features.index, features['sma_20'], label='20-day SMA', color='blue')
    if 'sma_50' in features.columns:
        plt.plot(features.index, features['sma_50'], label='50-day SMA', color='red')
    plt.title('Price and Moving Averages')
    plt.legend()
    
    # Plot RSI
    if 'rsi' in features.columns:
        plt.subplot(3, 1, 2)
        plt.plot(features.index, features['rsi'], label='RSI', color='purple')
        plt.axhline(70, color='red', linestyle='--', alpha=0.5)
        plt.axhline(30, color='green', linestyle='--', alpha=0.5)
        plt.title('Relative Strength Index (RSI)')
        plt.ylim(0, 100)
    
    # Plot MACD
    if all(col in features.columns for col in ['macd', 'macd_signal']):
        plt.subplot(3, 1, 3)
        plt.plot(features.index, features['macd'], label='MACD', color='blue')
        plt.plot(features.index, features['macd_signal'], label='Signal', color='red')
        plt.bar(features.index, features['macd_hist'], label='Histogram', color='gray', alpha=0.3)
        plt.title('MACD')
        plt.legend()
    
    plt.tight_layout()
    plt.show()