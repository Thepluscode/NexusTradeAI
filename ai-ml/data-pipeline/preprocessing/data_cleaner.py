import pandas as pd
import numpy as np
from typing import Dict, List, Tuple, Optional
import logging
from scipy import stats
from sklearn.preprocessing import RobustScaler
import warnings
warnings.filterwarnings('ignore')

class MarketDataCleaner:
    """
    Advanced data cleaning pipeline for financial market data
    """
    
    def __init__(self, config: Dict = None):
        """
        Initialize data cleaner with configuration
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or self.default_config()
        self.logger = logging.getLogger(__name__)
        self.cleaning_stats = {}
        
    def default_config(self) -> Dict:
        """Default cleaning configuration"""
        return {
            'outlier_detection': {
                'method': 'iqr',  # 'iqr', 'zscore', 'isolation_forest'
                'iqr_factor': 1.5,
                'zscore_threshold': 3.0,
                'isolation_contamination': 0.1
            },
            'missing_data': {
                'method': 'interpolation',  # 'forward_fill', 'interpolation', 'drop'
                'max_consecutive_missing': 5
            },
            'price_validation': {
                'min_price': 0.01,
                'max_price_change': 0.5,  # 50% in single period
                'min_volume': 0
            },
            'time_series': {
                'frequency': '1min',
                'market_hours_only': True,
                'timezone': 'America/New_York'
            }
        }
    
    def clean_market_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Complete data cleaning pipeline
        
        Args:
            df: Raw market data DataFrame
            
        Returns:
            Cleaned DataFrame
        """
        self.logger.info(f"Starting data cleaning for {len(df)} records")
        original_size = len(df)
        
        # Initialize cleaning stats
        self.cleaning_stats = {
            'original_records': original_size,
            'outliers_removed': 0,
            'missing_data_fixed': 0,
            'invalid_prices_removed': 0,
            'duplicate_records_removed': 0
        }
        
        try:
            # Step 1: Basic validation and type conversion
            df = self.validate_and_convert_types(df)
            
            # Step 2: Remove duplicates
            df = self.remove_duplicates(df)
            
            # Step 3: Validate price relationships
            df = self.validate_price_relationships(df)
            
            # Step 4: Handle missing data
            df = self.handle_missing_data(df)
            
            # Step 5: Detect and handle outliers
            df = self.detect_and_handle_outliers(df)
            
            # Step 6: Validate time series continuity
            df = self.validate_time_series(df)
            
            # Step 7: Add quality indicators
            df = self.add_quality_indicators(df)
            
            final_size = len(df)
            self.cleaning_stats.update({
                'final_records': final_size,
                'records_removed': original_size - final_size,
                'data_retention_rate': final_size / original_size if original_size > 0 else 0
            })
            
            self.logger.info(
                f"Data cleaning completed. Retained {final_size}/{original_size} records "
                f"({self.cleaning_stats['data_retention_rate']:.2%})"
            )
            
            return df
            
        except Exception as e:
            self.logger.error(f"Error during data cleaning: {str(e)}")
            raise
    
    def validate_and_convert_types(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Validate and convert data types
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with validated types
        """
        # Make a copy to avoid SettingWithCopyWarning
        df = df.copy()
        
        # Ensure required columns exist
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        missing_columns = [col for col in required_columns if col not in df.columns]
        
        if missing_columns:
            raise ValueError(f"Missing required columns: {missing_columns}")
        
        # Convert timestamp
        if not pd.api.types.is_datetime64_any_dtype(df['timestamp']):
            df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # Convert price columns to float
        price_columns = ['open', 'high', 'low', 'close']
        for col in price_columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        # Convert volume to integer
        df['volume'] = pd.to_numeric(df['volume'], errors='coerce').fillna(0).astype(int)
        
        # Sort by timestamp
        df = df.sort_values('timestamp').reset_index(drop=True)
        
        return df
    
    def remove_duplicates(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Remove duplicate records
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame without duplicates
        """
        initial_size = len(df)
        
        # Remove exact duplicates
        df = df.drop_duplicates()
        
        # Remove timestamp duplicates (keep last)
        if 'symbol' in df.columns:
            df = df.drop_duplicates(subset=['symbol', 'timestamp'], keep='last')
        else:
            df = df.drop_duplicates(subset=['timestamp'], keep='last')
        
        duplicates_removed = initial_size - len(df)
        self.cleaning_stats['duplicate_records_removed'] = duplicates_removed
        
        if duplicates_removed > 0:
            self.logger.info(f"Removed {duplicates_removed} duplicate records")
        
        return df
    
    def validate_price_relationships(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Validate price relationships (high >= low, etc.)
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with valid price relationships
        """
        if df.empty:
            return df
            
        initial_size = len(df)
        
        # Remove records with invalid price relationships
        valid_mask = (
            (df['high'] >= df['low']) &
            (df['high'] >= df['open']) &
            (df['high'] >= df['close']) &
            (df['low'] <= df['open']) &
            (df['low'] <= df['close']) &
            (df['open'] > 0) &
            (df['high'] > 0) &
            (df['low'] > 0) &
            (df['close'] > 0)
        )
        
        df = df[valid_mask]
        
        # Remove extreme price changes
        if len(df) > 1:
            price_change = df['close'].pct_change().abs()
            max_change = self.config['price_validation']['max_price_change']
            valid_prices = (price_change <= max_change) | price_change.isna()
            df = df[valid_prices]
        
        invalid_removed = initial_size - len(df)
        self.cleaning_stats['invalid_prices_removed'] = invalid_removed
        
        if invalid_removed > 0:
            self.logger.info(f"Removed {invalid_removed} records with invalid prices")
        
        return df
    
    def handle_missing_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Handle missing data in time series
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with missing data handled
        """
        if df.empty:
            return df
            
        initial_missing = df.isnull().sum().sum()
        
        method = self.config['missing_data']['method']
        max_consecutive = self.config['missing_data']['max_consecutive_missing']
        
        price_columns = ['open', 'high', 'low', 'close']
        
        if method == 'forward_fill':
            # Forward fill with limit
            df[price_columns] = df[price_columns].fillna(method='ffill', limit=max_consecutive)
            
        elif method == 'interpolation':
            # Linear interpolation
            df[price_columns] = df[price_columns].interpolate(method='linear', limit=max_consecutive)
            
        elif method == 'drop':
            # Drop rows with missing data
            df = df.dropna(subset=price_columns)
        
        # Fill remaining volume missing values with 0
        df['volume'] = df['volume'].fillna(0)
        
        # Drop rows that still have missing critical data
        df = df.dropna(subset=price_columns)
        
        final_missing = df.isnull().sum().sum()
        self.cleaning_stats['missing_data_fixed'] = initial_missing - final_missing
        
        if initial_missing > 0:
            self.logger.info(f"Fixed {initial_missing - final_missing} missing data points")
        
        return df
    
    def detect_and_handle_outliers(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Detect and handle outliers in market data
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with outliers handled
        """
        if df.empty:
            return df
            
        initial_size = len(df)
        method = self.config['outlier_detection']['method']
        
        price_columns = ['open', 'high', 'low', 'close']
        
        try:
            outlier_mask = pd.Series([False] * len(df), index=df.index)
            
            if method == 'iqr':
                outlier_mask = self.detect_outliers_iqr(df, price_columns)
            elif method == 'zscore':
                outlier_mask = self.detect_outliers_zscore(df, price_columns)
            elif method == 'isolation_forest':
                outlier_mask = self.detect_outliers_isolation_forest(df, price_columns)
            
            # Remove outliers
            df = df[~outlier_mask]
            
            outliers_removed = initial_size - len(df)
            self.cleaning_stats['outliers_removed'] = outliers_removed
            
            if outliers_removed > 0:
                self.logger.info(f"Removed {outliers_removed} outlier records")
                
        except Exception as e:
            self.logger.error(f"Error during outlier detection: {str(e)}")
            # Return the original dataframe if outlier detection fails
            
        return df
    
    def detect_outliers_iqr(self, df: pd.DataFrame, columns: List[str]) -> pd.Series:
        """
        Detect outliers using IQR method
        
        Args:
            df: Input DataFrame
            columns: Columns to check for outliers
            
        Returns:
            Boolean Series indicating outliers
        """
        factor = self.config['outlier_detection']['iqr_factor']
        outlier_mask = pd.Series([False] * len(df), index=df.index)
        
        for col in columns:
            if col in df.columns:
                Q1 = df[col].quantile(0.25)
                Q3 = df[col].quantile(0.75)
                IQR = Q3 - Q1
                
                if IQR > 0:  # Only apply IQR if there's variation in the data
                    lower_bound = Q1 - factor * IQR
                    upper_bound = Q3 + factor * IQR
                    
                    col_outliers = (df[col] < lower_bound) | (df[col] > upper_bound)
                    outlier_mask |= col_outliers
        
        return outlier_mask
    
    def detect_outliers_zscore(self, df: pd.DataFrame, columns: List[str]) -> pd.Series:
        """
        Detect outliers using Z-score method
        
        Args:
            df: Input DataFrame
            columns: Columns to check for outliers
            
        Returns:
            Boolean Series indicating outliers
        """
        threshold = self.config['outlier_detection']['zscore_threshold']
        outlier_mask = pd.Series([False] * len(df), index=df.index)
        
        for col in columns:
            if col in df.columns and df[col].std() > 0:  # Only if there's variation
                z_scores = np.abs(stats.zscore(df[col]))
                col_outliers = z_scores > threshold
                outlier_mask |= col_outliers
        
        return outlier_mask
    
    def detect_outliers_isolation_forest(self, df: pd.DataFrame, columns: List[str]) -> pd.Series:
        """
        Detect outliers using Isolation Forest
        
        Args:
            df: Input DataFrame
            columns: Columns to check for outliers
            
        Returns:
            Boolean Series indicating outliers
        """
        from sklearn.ensemble import IsolationForest
        
        contamination = self.config['outlier_detection']['isolation_contamination']
        
        try:
            # Prepare data
            data = df[columns].copy()
            
            # Check if we have enough data points
            if len(data) < 10:  # Minimum samples for Isolation Forest
                return pd.Series([False] * len(df), index=df.index)
                
            # Fill any remaining NaN values with column means
            data = data.fillna(data.mean())
            
            # Scale data
            scaler = RobustScaler()
            scaled_data = scaler.fit_transform(data)
            
            # Fit Isolation Forest
            iso_forest = IsolationForest(
                contamination=contamination, 
                random_state=42,
                n_estimators=100
            )
            outlier_labels = iso_forest.fit_predict(scaled_data)
            
            # Convert to boolean mask (outliers are labeled as -1)
            outlier_mask = outlier_labels == -1
            
            return pd.Series(outlier_mask, index=df.index)
            
        except Exception as e:
            self.logger.error(f"Error in Isolation Forest: {str(e)}")
            # Return no outliers if there's an error
            return pd.Series([False] * len(df), index=df.index)
    
    def validate_time_series(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Validate time series continuity and frequency
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with validated time series
        """
        if len(df) < 2:
            return df
        
        # Make a copy to avoid SettingWithCopyWarning
        df = df.copy()
        
        # Check for proper time ordering
        if not df['timestamp'].is_monotonic_increasing:
            df = df.sort_values('timestamp')
        
        # Optionally filter to market hours only
        if self.config['time_series']['market_hours_only']:
            df = self.filter_market_hours(df)
        
        return df
    
    def filter_market_hours(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Filter data to market hours only
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame filtered to market hours
        """
        if df.empty:
            return df
            
        # Make a copy to avoid SettingWithCopyWarning
        df = df.copy()
        
        try:
            # Set timezone
            timezone = self.config['time_series']['timezone']
            
            # Ensure timestamp is timezone-aware
            if df['timestamp'].dt.tz is None:
                df['timestamp'] = df['timestamp'].dt.tz_localize(timezone)
            else:
                df['timestamp'] = df['timestamp'].dt.tz_convert(timezone)
            
            # Filter to market hours (9:30 AM - 4:00 PM ET)
            market_open = df['timestamp'].dt.time >= pd.Timestamp('09:30').time()
            market_close = df['timestamp'].dt.time <= pd.Timestamp('16:00').time()
            weekday = df['timestamp'].dt.dayofweek < 5  # Monday=0, Friday=4
            
            market_hours_mask = market_open & market_close & weekday
            df = df[market_hours_mask]
            
        except Exception as e:
            self.logger.error(f"Error filtering market hours: {str(e)}")
            
        return df
    
    def add_quality_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Add data quality indicators
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with quality indicators
        """
        if df.empty:
            return df
            
        # Make a copy to avoid SettingWithCopyWarning
        df = df.copy()
        
        # Add data quality score (0-1)
        df['data_quality_score'] = 1.0
        
        # Reduce quality score for various issues
        if len(df) > 1:
            # Large price gaps
            price_change = df['close'].pct_change().abs()
            large_gaps = price_change > 0.1  # 10% change
            df.loc[large_gaps, 'data_quality_score'] *= 0.8
            
            # Low volume periods
            if 'volume' in df.columns and df['volume'].gt(0).any():
                volume_threshold = df['volume'].quantile(0.1)
                low_volume = df['volume'] < volume_threshold
                df.loc[low_volume, 'data_quality_score'] *= 0.9
            
            # Wide bid-ask spreads (if available)
            if 'bid' in df.columns and 'ask' in df.columns and 'close' in df.columns:
                spread = (df['ask'] - df['bid']) / df['close']
                wide_spreads = spread > 0.01  # 1% spread
                df.loc[wide_spreads, 'data_quality_score'] *= 0.9
        
        # Ensure quality score is between 0 and 1
        df['data_quality_score'] = df['data_quality_score'].clip(0, 1)
        
        # Add cleaning metadata
        df['cleaned_timestamp'] = pd.Timestamp.now()
        df['cleaning_version'] = '1.0'
        
        return df
    
    def get_cleaning_report(self) -> Dict:
        """
        Get detailed cleaning report
        
        Returns:
            Dictionary with cleaning statistics
        """
        original_records = self.cleaning_stats.get('original_records', 1)
        
        return {
            'cleaning_stats': self.cleaning_stats,
            'config_used': self.config,
            'data_quality_summary': {
                'retention_rate': self.cleaning_stats.get('data_retention_rate', 0),
                'outlier_rate': self.cleaning_stats.get('outliers_removed', 0) / original_records,
                'duplicate_rate': self.cleaning_stats.get('duplicate_records_removed', 0) / original_records,
                'invalid_price_rate': self.cleaning_stats.get('invalid_prices_removed', 0) / original_records,
                'missing_data_fixed': self.cleaning_stats.get('missing_data_fixed', 0)
            }
        }
