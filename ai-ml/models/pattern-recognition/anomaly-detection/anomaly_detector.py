"""
Anomaly detection for financial time series data.

This module provides various anomaly detection techniques specifically designed
for financial market data, including statistical methods, isolation forests, and autoencoders.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional
import logging
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from scipy import stats
import tensorflow as tf
from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, Dense, LSTM
import joblib

class MarketAnomalyDetector:
    """
    Advanced anomaly detection for financial markets using multiple techniques
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize anomaly detector
        
        Args:
            config: Detection configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Detection methods
        self.methods = config.get('methods', ['isolation_forest', 'statistical', 'autoencoder'])
        self.contamination = config.get('contamination', 0.1)
        self.window_size = config.get('window_size', 20)
        
        # Models
        self.isolation_forest = None
        self.autoencoder = None
        self.scaler = StandardScaler()
        self.pca = PCA(n_components=0.95)
        
        # Statistical thresholds
        self.z_threshold = config.get('z_threshold', 3.0)
        self.iqr_factor = config.get('iqr_factor', 1.5)
        
        # Historical statistics
        self.historical_stats = {}
        
        self.fitted_ = False
    
    def fit(self, df: pd.DataFrame):
        """
        Fit anomaly detection models
        
        Args:
            df: Training data
        """
        self.logger.info("Fitting anomaly detection models...")
        
        # Prepare features
        features = self.extract_anomaly_features(df)
        
        # Scale features
        scaled_features = self.scaler.fit_transform(features)
        
        # Fit PCA for dimensionality reduction
        reduced_features = self.pca.fit_transform(scaled_features)
        
        # Fit models
        if 'isolation_forest' in self.methods:
            self.fit_isolation_forest(reduced_features)
        
        if 'autoencoder' in self.methods:
            self.fit_autoencoder(reduced_features)
        
        if 'statistical' in self.methods:
            self.fit_statistical_models(df)
        
        self.fitted_ = True
        self.logger.info("Anomaly detection models fitted successfully")
    
    def detect_anomalies(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Detect anomalies in market data
        
        Args:
            df: Market data DataFrame
            
        Returns:
            Anomaly detection results
        """
        if not self.fitted_:
            raise ValueError("Models must be fitted before detection")
        
        anomalies = {
            'timestamps': df.index if hasattr(df, 'index') else range(len(df)),
            'isolation_forest': [],
            'statistical': [],
            'autoencoder': [],
            'combined': [],
            'anomaly_scores': {},
            'anomaly_types': []
        }
        
        # Extract features
        features = self.extract_anomaly_features(df)
        scaled_features = self.scaler.transform(features)
        reduced_features = self.pca.transform(scaled_features)
        
        # Detect using each method
        if 'isolation_forest' in self.methods and self.isolation_forest:
            if_anomalies = self.detect_isolation_forest_anomalies(reduced_features)
            anomalies['isolation_forest'] = if_anomalies
            anomalies['anomaly_scores']['isolation_forest'] = self.isolation_forest.decision_function(reduced_features).tolist()
        
        if 'statistical' in self.methods:
            stat_anomalies = self.detect_statistical_anomalies(df)
            anomalies['statistical'] = stat_anomalies
        
        if 'autoencoder' in self.methods and self.autoencoder:
            ae_anomalies, ae_scores = self.detect_autoencoder_anomalies(reduced_features)
            anomalies['autoencoder'] = ae_anomalies
            anomalies['anomaly_scores']['autoencoder'] = ae_scores
        
        # Combine results
        anomalies['combined'] = self.combine_anomaly_results(anomalies)
        
        # Classify anomaly types
        anomalies['anomaly_types'] = self.classify_anomaly_types(df, anomalies['combined'])
        
        return anomalies
    
    def extract_anomaly_features(self, df: pd.DataFrame) -> np.ndarray:
        """
        Extract comprehensive features for anomaly detection in financial time series.
        
        Args:
            df: DataFrame containing market data with OHLCV columns
            
        Returns:
            numpy.ndarray: Feature matrix for anomaly detection
        """
        features = []
        
        # 1. Basic Price Features
        if 'close' in df.columns:
            close = df['close']
            returns = close.pct_change().fillna(0)
            
            # Price momentum and volatility
            features.extend([
                returns,  # Raw returns
                returns.rolling(window=5).mean().fillna(0),  # Short-term momentum
                returns.rolling(window=20).mean().fillna(0),  # Medium-term momentum
                returns.rolling(window=5).std().fillna(0),  # Short-term volatility
                returns.rolling(window=20).std().fillna(0),  # Medium-term volatility
                np.log(close).diff().fillna(0),  # Log returns
                close.rolling(window=5).mean().pct_change().fillna(0),  # Moving average momentum
            ])
            
            # Price acceleration (second derivative)
            if len(close) > 2:
                price_acceleration = np.gradient(np.gradient(close))
                features.append(pd.Series(price_acceleration, index=df.index).fillna(0))
        
        # 2. Volume Analysis
        if 'volume' in df.columns:
            volume = df['volume']
            log_volume = np.log(volume.replace(0, np.nan)).fillna(method='ffill').fillna(0)
            
            features.extend([
                log_volume,  # Log volume (handles large ranges better)
                volume.pct_change().fillna(0),  # Volume change
                volume.rolling(window=5).mean().pct_change().fillna(0),  # Volume momentum
                (volume > volume.rolling(window=20).mean()).astype(float),  # Volume above MA
            ])
            
            # Volume-return correlation
            if 'close' in df.columns:
                volume_return_corr = volume.rolling(window=20).corr(returns).fillna(0)
                features.append(volume_return_corr)
        
        # 3. Technical Indicators
        if all(col in df.columns for col in ['high', 'low', 'close']):
            high, low, close = df['high'], df['low'], df['close']
            
            # Price range features
            price_range = high - low
            normalized_range = price_range / close
            features.extend([
                price_range.fillna(0),
                normalized_range.fillna(0),
                ((close - low) / (high - low)).replace([np.inf, -np.inf], 0).fillna(0.5)  # Price position
            ])
            
            # Volatility measures
            for window in [5, 10, 20]:
                atr = self._calculate_atr(high, low, close, window)
                features.append(atr.fillna(0))
            
            # Momentum indicators
            rsi = self._calculate_rsi(close, window=14)
            features.append(rsi.fillna(50))  # Fill NA with neutral 50
            
            # Trend indicators
            ema_fast = close.ewm(span=12, adjust=False).mean()
            ema_slow = close.ewm(span=26, adjust=False).mean()
            macd = ema_fast - ema_slow
            features.extend([
                macd.fillna(0),
                (ema_fast / ema_slow - 1).fillna(0)  # EMA ratio
            ])
            
            # Support/Resistance levels
            if len(close) >= 20:
                resistance = high.rolling(window=20).max()
                support = low.rolling(window=20).min()
                features.extend([
                    ((close - support) / (resistance - support)).replace([np.inf, -np.inf], 0.5).fillna(0.5),
                    (close > resistance).astype(float),
                    (close < support).astype(float)
                ])
        
        # 4. Order Book Features (if available)
        for col in ['bid', 'ask', 'bid_volume', 'ask_volume']:
            if col in df.columns:
                features.append(df[col].pct_change().fillna(0))
        
        if all(col in df.columns for col in ['bid', 'ask']):
            spread = (df['ask'] - df['bid']) / ((df['ask'] + df['bid']) / 2)
            features.append(spread.fillna(0))
        
        # 5. Time-Based Features
        if hasattr(df, 'index'):
            index = df.index
            
            # Cyclical time features
            if hasattr(index, 'hour'):
                hour = index.hour
                features.extend([
                    np.sin(2 * np.pi * hour / 24),  # Hour of day (sine)
                    np.cos(2 * np.pi * hour / 24),  # Hour of day (cosine)
                    (hour >= 9) & (hour < 16)  # Market hours flag
                ])
            
            if hasattr(index, 'dayofweek'):
                dayofweek = index.dayofweek
                features.extend([
                    np.sin(2 * np.pi * dayofweek / 7),  # Day of week (sine)
                    np.cos(2 * np.pi * dayofweek / 7)   # Day of week (cosine)
                ])
        
        # 6. Statistical Features
        if len(df) >= 20:
            if 'close' in df.columns:
                returns = df['close'].pct_change().dropna()
                if len(returns) > 0:
                    # Higher moments
                    for window in [5, 10, 20]:
                        if len(returns) >= window:
                            rolling_returns = returns.rolling(window=window)
                            features.extend([
                                rolling_returns.skew().fillna(0),  # Skewness
                                rolling_returns.kurt().fillna(0),  # Kurtosis
                                rolling_returns.apply(self._calculate_hurst, raw=True).fillna(0.5),  # Hurst exponent
                                rolling_returns.apply(self._calculate_lyapunov, raw=True).fillna(0)  # Lyapunov exponent
                            ])
        
        # 7. Market Regime Features
        if 'close' in df.columns and len(df) >= 20:
            close = df['close']
            returns = close.pct_change().dropna()
            
            # Volatility regime
            short_vol = returns.rolling(window=5).std()
            long_vol = returns.rolling(window=20).std()
            volatility_ratio = (short_vol / long_vol).fillna(1)
            features.append(volatility_ratio.fillna(1))
            
            # Trend strength
            adx = self._calculate_adx(df, window=14)
            features.append(adx.fillna(0) / 100)  # Normalize to [0,1]
        
        # Stack all features
        feature_matrix = np.column_stack(features) if features else np.zeros((len(df), 1))
        
        # Handle any remaining NaN/Inf values
        feature_matrix = np.nan_to_num(feature_matrix, nan=0.0, posinf=0.0, neginf=0.0)
        
        # Ensure we don't return any NaN values
        if np.any(np.isnan(feature_matrix)):
            self.logger.warning("NaN values detected in feature matrix after processing")
            feature_matrix = np.nan_to_num(feature_matrix, nan=0.0)
        
        return feature_matrix
    
    def fit_isolation_forest(self, features: np.ndarray):
        """Fit Isolation Forest model"""
        self.isolation_forest = IsolationForest(
            contamination=self.contamination,
            random_state=42,
            n_estimators=100
        )
        self.isolation_forest.fit(features)
        self.logger.info("Isolation Forest model fitted")
    
    def fit_autoencoder(self, features: np.ndarray):
        """Fit autoencoder model"""
        input_dim = features.shape[1]
        encoding_dim = max(2, input_dim // 2)
        
        # Autoencoder architecture
        input_layer = Input(shape=(input_dim,))
        encoded = Dense(encoding_dim, activation='relu')(input_layer)
        encoded = Dense(encoding_dim // 2, activation='relu')(encoded)
        decoded = Dense(encoding_dim, activation='relu')(encoded)
        decoded = Dense(input_dim, activation='linear')(decoded)
        
        self.autoencoder = Model(input_layer, decoded)
        self.autoencoder.compile(optimizer='adam', loss='mse')
        
        # Train autoencoder
        self.autoencoder.fit(
            features, features,
            epochs=50,
            batch_size=32,
            verbose=0,
            validation_split=0.2
        )
        
        self.logger.info("Autoencoder model fitted")
    
    def fit_statistical_models(self, df: pd.DataFrame):
        """Fit statistical models and calculate thresholds"""
        # Calculate historical statistics for each feature
        if 'close' in df.columns:
            returns = df['close'].pct_change().dropna()
            self.historical_stats['returns'] = {
                'mean': returns.mean(),
                'std': returns.std(),
                'q1': returns.quantile(0.25),
                'q3': returns.quantile(0.75),
                'iqr': returns.quantile(0.75) - returns.quantile(0.25)
            }
        
        if 'volume' in df.columns:
            volume = df['volume']
            self.historical_stats['volume'] = {
                'mean': volume.mean(),
                'std': volume.std(),
                'q1': volume.quantile(0.25),
                'q3': volume.quantile(0.75),
                'iqr': volume.quantile(0.75) - volume.quantile(0.25)
            }
        
        self.logger.info("Statistical models fitted")
    
    def detect_isolation_forest_anomalies(self, features: np.ndarray) -> List[bool]:
        """Detect anomalies using Isolation Forest"""
        predictions = self.isolation_forest.predict(features)
        return (predictions == -1).tolist()
    
    def detect_statistical_anomalies(self, df: pd.DataFrame) -> List[bool]:
        """Detect anomalies using statistical methods"""
        anomalies = [False] * len(df)
        
        # Return-based anomalies
        if 'close' in df.columns and 'returns' in self.historical_stats:
            returns = df['close'].pct_change()
            stats = self.historical_stats['returns']
            
            # Z-score method
            z_scores = np.abs((returns - stats['mean']) / stats['std'])
            z_anomalies = z_scores > self.z_threshold
            
            # IQR method
            iqr_lower = stats['q1'] - self.iqr_factor * stats['iqr']
            iqr_upper = stats['q3'] + self.iqr_factor * stats['iqr']
            iqr_anomalies = (returns < iqr_lower) | (returns > iqr_upper)
            
            # Combine methods
            for i in range(len(anomalies)):
                if i < len(z_anomalies) and (z_anomalies.iloc[i] or iqr_anomalies.iloc[i]):
                    anomalies[i] = True
        
        # Volume-based anomalies
        if 'volume' in df.columns and 'volume' in self.historical_stats:
            volume = df['volume']
            stats = self.historical_stats['volume']
            
            # Volume spikes
            volume_threshold = stats['mean'] + 3 * stats['std']
            volume_anomalies = volume > volume_threshold
            
            for i in range(len(anomalies)):
                if volume_anomalies.iloc[i]:
                    anomalies[i] = True
        
        return anomalies
    
    def detect_autoencoder_anomalies(self, features: np.ndarray) -> Tuple[List[bool], List[float]]:
        """Detect anomalies using autoencoder"""
        # Get reconstruction
        reconstructed = self.autoencoder.predict(features, verbose=0)
        
        # Calculate reconstruction error
        mse = np.mean(np.square(features - reconstructed), axis=1)
        
        # Determine threshold (e.g., 95th percentile)
        threshold = np.percentile(mse, 95)
        
        anomalies = (mse > threshold).tolist()
        scores = mse.tolist()
        
        return anomalies, scores
    
    def _calculate_atr(self, high: pd.Series, low: pd.Series, close: pd.Series, window: int = 14) -> pd.Series:
        """
        Calculate Average True Range (ATR)
        
        Args:
            high: High prices
            low: Low prices
            close: Close prices
            window: Lookback window
            
        Returns:
            Series containing ATR values
        """
        tr1 = high - low
        tr2 = (high - close.shift()).abs()
        tr3 = (low - close.shift()).abs()
        true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return true_range.rolling(window=window).mean()
    
    def _calculate_rsi(self, close: pd.Series, window: int = 14) -> pd.Series:
        """
        Calculate Relative Strength Index (RSI)
        
        Args:
            close: Close prices
            window: Lookback window
            
        Returns:
            Series containing RSI values
        """
        delta = close.diff()
        gain = delta.where(delta > 0, 0)
        loss = -delta.where(delta < 0, 0)
        
        avg_gain = gain.rolling(window=window, min_periods=1).mean()
        avg_loss = loss.rolling(window=window, min_periods=1).mean()
        
        rs = avg_gain / avg_loss.replace(0, np.nan).fillna(1)
        return 100 - (100 / (1 + rs))
    
    def _calculate_hurst(self, x: np.ndarray) -> float:
        """
        Calculate the Hurst exponent using Rescaled Range (R/S) analysis
        
        Args:
            x: Time series data
            
        Returns:
            Hurst exponent value
        """
        if len(x) < 10:
            return 0.5  # Neutral value for short series
            
        lags = range(2, min(20, len(x) // 2))
        tau = [np.std(np.subtract(x[lag:], x[:-lag])) for lag in lags]
        m = np.polyfit(np.log(lags), np.log(tau), 1)
        return m[0]
    
    def _calculate_lyapunov(self, x: np.ndarray) -> float:
        """
        Estimate the Lyapunov exponent (measure of chaos in time series)
        
        Args:
            x: Time series data
            
        Returns:
            Estimated Lyapunov exponent
        """
        if len(x) < 10:
            return 0.0  # Neutral value for short series
            
        # Simple implementation - in practice, more sophisticated methods are used
        # This is a placeholder that returns a measure of divergence
        x = np.asarray(x)
        diff = np.diff(x)
        return np.mean(np.log1p(np.abs(diff)))
    
    def _calculate_adx(self, df: pd.DataFrame, window: int = 14) -> pd.Series:
        """
        Calculate Average Directional Index (ADX)
        
        Args:
            df: DataFrame with high, low, close columns
            window: Lookback window
            
        Returns:
            Series containing ADX values
        """
        high, low, close = df['high'], df['low'], df['close']
        
        # Calculate +DM and -DM
        up = high.diff()
        down = -low.diff()
        
        plus_dm = np.where((up > down) & (up > 0), up, 0.0)
        minus_dm = np.where((down > up) & (down > 0), down, 0.0)
        
        # Calculate True Range
        tr1 = high - low
        tr2 = (high - close.shift()).abs()
        tr3 = (low - close.shift()).abs()
        true_range = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        
        # Smooth the values
        atr = true_range.rolling(window=window).mean()
        plus_di = 100 * (plus_dm.rolling(window=window).mean() / atr)
        minus_di = 100 * (minus_dm.rolling(window=window).mean() / atr)
        
        # Calculate DX and ADX
        dx = 100 * (np.abs(plus_di - minus_di) / (plus_di + minus_di)).replace([np.inf, -np.inf], 100)
        adx = dx.rolling(window=window).mean()
        
        return adx
    
    def combine_anomaly_results(self, anomalies: Dict[str, Any]) -> List[bool]:
        """Combine results from different methods"""
        n_samples = len(anomalies['timestamps'])
        combined = [False] * n_samples
        
        # Voting approach
        for i in range(n_samples):
            votes = 0
            total_methods = 0
            
            if anomalies['isolation_forest']:
                if i < len(anomalies['isolation_forest']):
                    votes += anomalies['isolation_forest'][i]
                total_methods += 1
            
            if anomalies['statistical']:
                if i < len(anomalies['statistical']):
                    votes += anomalies['statistical'][i]
                total_methods += 1
            
            if anomalies['autoencoder']:
                if i < len(anomalies['autoencoder']):
                    votes += anomalies['autoencoder'][i]
                total_methods += 1
            
            # Anomaly if majority of methods agree
            if total_methods > 0:
                combined[i] = votes > (total_methods / 2)
        
        return combined
    
    def classify_anomaly_types(self, df: pd.DataFrame, anomalies: List[bool]) -> List[str]:
        """Classify types of detected anomalies"""
        anomaly_types = ['normal'] * len(df)
        
        for i, is_anomaly in enumerate(anomalies):
            if is_anomaly:
                anomaly_type = self.determine_anomaly_type(df, i)
                anomaly_types[i] = anomaly_type
        
        return anomaly_types
    
    def determine_anomaly_type(self, df: pd.DataFrame, idx: int) -> str:
        """Determine specific type of anomaly"""
        if idx >= len(df):
            return 'unknown'
        
        # Price-based anomalies
        if 'close' in df.columns:
            if idx > 0:
                price_change = (df['close'].iloc[idx] - df['close'].iloc[idx-1]) / df['close'].iloc[idx-1]
                
                if price_change > 0.1:  # 10% jump
                    return 'price_spike'
                elif price_change < -0.1:  # 10% drop
                    return 'price_crash'
        
        # Volume-based anomalies
        if 'volume' in df.columns and 'volume' in self.historical_stats:
            volume = df['volume'].iloc[idx]
            avg_volume = self.historical_stats['volume']['mean']
            
            if volume > 5 * avg_volume:
                return 'volume_spike'
        
        # Volatility anomalies
        if 'close' in df.columns and idx >= self.window_size:
            recent_returns = df['close'].iloc[idx-self.window_size:idx].pct_change()
            current_vol = recent_returns.std()
            
            if 'returns' in self.historical_stats:
                avg_vol = self.historical_stats['returns']['std']
                if current_vol > 3 * avg_vol:
                    return 'high_volatility'
        
        return 'unknown_anomaly'
    
    def save_detector(self, filepath: str):
        """
        Save anomaly detector to disk
        
        Args:
            filepath: Path to save the detector
        """
        detector_data = {
            'config': self.config,
            'isolation_forest': self.isolation_forest,
            'autoencoder_weights': self.autoencoder.get_weights() if self.autoencoder else None,
            'autoencoder_config': self.autoencoder.get_config() if self.autoencoder else None,
            'scaler': self.scaler,
            'pca': self.pca,
            'historical_stats': self.historical_stats,
            'fitted_': self.fitted_
        }
        
        joblib.dump(detector_data, filepath)
        self.logger.info(f"Anomaly detector saved to {filepath}")
    
    @classmethod
    def load_detector(cls, filepath: str) -> 'MarketAnomalyDetector':
        """
        Load anomaly detector from disk
        
        Args:
            filepath: Path to saved detector
            
        Returns:
            Loaded MarketAnomalyDetector instance
        """
        detector_data = joblib.load(filepath)
        
        # Create new instance
        detector = cls(detector_data['config'])
        
        # Restore state
        detector.isolation_forest = detector_data['isolation_forest']
        detector.scaler = detector_data['scaler']
        detector.pca = detector_data['pca']
        detector.historical_stats = detector_data['historical_stats']
        detector.fitted_ = detector_data['fitted_']
        
        # Rebuild autoencoder if it existed
        if detector_data['autoencoder_config'] is not None:
            detector.autoencoder = Model.from_config(detector_data['autoencoder_config'])
            detector.autoencoder.set_weights(detector_data['autoencoder_weights'])
        
        return detector
