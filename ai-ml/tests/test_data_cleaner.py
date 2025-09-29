"""
Unit tests for the MarketDataCleaner class.
"""
import unittest
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

from data_pipeline.preprocessing import MarketDataCleaner

class TestMarketDataCleaner(unittest.TestCase):
    """Test cases for MarketDataCleaner class."""
    
    def setUp(self):
        """Set up test data."""
        # Create sample data with various issues
        self.sample_data = {
            'timestamp': [
                datetime(2023, 1, 1, 9, 30),
                datetime(2023, 1, 1, 9, 31),
                datetime(2023, 1, 1, 9, 32),  # Will be a duplicate
                datetime(2023, 1, 1, 9, 32),  # Duplicate
                datetime(2023, 1, 1, 9, 33),  # Will have invalid prices
                datetime(2023, 1, 1, 9, 34),  # Will have missing values
                datetime(2023, 1, 1, 9, 35),  # Will be an outlier
                datetime(2023, 1, 1, 9, 36),  # Normal data point
            ],
            'open': [100.0, 101.0, 102.0, 102.0, 1000.0, 103.0, 105.0, 104.0],
            'high': [101.0, 102.0, 103.0, 103.0, 2000.0, 104.0, 1000.0, 105.0],  # Outlier at index 6
            'low': [99.0, 100.0, 101.0, 101.0, 500.0, 102.0, 104.0, 103.0],
            'close': [100.5, 101.5, 102.5, 102.5, 1500.0, None, 105.0, 104.5],  # Missing at index 5
            'volume': [1000, 1100, 1200, 1200, 1300, 1400, 1500, 1600]
        }
        
        self.df = pd.DataFrame(self.sample_data)
        self.cleaner = MarketDataCleaner()
    
    def test_initialization(self):
        """Test that the cleaner initializes with default config."""
        self.assertIsNotNone(self.cleaner.config)
        self.assertEqual(self.cleaner.config['outlier_detection']['method'], 'iqr')
    
    def test_validate_and_convert_types(self):
        """Test type validation and conversion."""
        # Convert a copy with string timestamps to test conversion
        df = self.df.copy()
        df['timestamp'] = df['timestamp'].astype(str)
        
        cleaned = self.cleaner.validate_and_convert_types(df)
        
        # Check timestamp conversion
        self.assertTrue(pd.api.types.is_datetime64_any_dtype(cleaned['timestamp']))
        
        # Check numeric types
        self.assertTrue(pd.api.types.is_float_dtype(cleaned['open']))
        self.assertTrue(pd.api.types.is_integer_dtype(cleaned['volume']))
    
    def test_remove_duplicates(self):
        """Test duplicate removal."""
        cleaned = self.cleaner.remove_duplicates(self.df)
        
        # Should remove one duplicate record (index 3)
        self.assertEqual(len(cleaned), len(self.df) - 1)
        
        # Check that the last duplicate was kept (last occurrence)
        self.assertEqual(cleaned.iloc[2]['timestamp'], self.df.iloc[3]['timestamp'])
    
    def test_validate_price_relationships(self):
        """Test price relationship validation."""
        # Index 4 has invalid relationships (high < low, etc.)
        cleaned = self.cleaner.validate_price_relationships(self.df)
        
        # Should remove the invalid record at index 4
        self.assertEqual(len(cleaned), len(self.df) - 1)
        self.assertNotIn(4, cleaned.index)
    
    def test_handle_missing_data(self):
        """Test handling of missing data."""
        # Index 5 has a missing close price
        cleaned = self.cleaner.handle_missing_data(self.df)
        
        # Should remove the record with missing data
        self.assertEqual(len(cleaned), len(self.df) - 1)
        self.assertNotIn(5, cleaned.index)
    
    def test_detect_outliers(self):
        """Test outlier detection."""
        # Index 6 has an extreme high value
        cleaned = self.cleaner.detect_and_handle_outliers(self.df)
        
        # Should remove the outlier at index 6
        self.assertEqual(len(cleaned), len(self.df) - 1)
        self.assertNotIn(6, cleaned.index)
    
    def test_clean_market_data(self):
        """Test the complete cleaning pipeline."""
        cleaned = self.cleaner.clean_market_data(self.df)
        report = self.cleaner.get_cleaning_report()
        
        # Should remove:
        # - 1 duplicate (index 3)
        # - 1 invalid price (index 4)
        # - 1 missing data (index 5)
        # - 1 outlier (index 6)
        # Total removed: 4, kept: 4
        self.assertEqual(len(cleaned), 4)
        self.assertEqual(report['cleaning_stats']['records_removed'], 4)
        
        # Check that the remaining data is clean
        self.assertTrue((cleaned['high'] >= cleaned['low']).all())
        self.assertTrue((cleaned['high'] >= cleaned['open']).all())
        self.assertTrue((cleaned['high'] >= cleaned['close']).all())
        self.assertTrue((cleaned['low'] <= cleaned['open']).all())
        self.assertTrue((cleaned['low'] <= cleaned['close']).all())
        self.assertTrue(cleaned['open'].notna().all())
        self.assertTrue(cleaned['volume'].notna().all())
    
    def test_empty_dataframe(self):
        """Test with an empty DataFrame."""
        empty_df = pd.DataFrame(columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        cleaned = self.cleaner.clean_market_data(empty_df)
        
        self.assertTrue(cleaned.empty)
        self.assertEqual(self.cleaner.get_cleaning_report()['cleaning_stats']['original_records'], 0)
    
    def test_filter_market_hours(self):
        """Test filtering to market hours."""
        # Create data with timestamps outside market hours
        timestamps = [
            datetime(2023, 1, 2, 9, 0),    # Before market open
            datetime(2023, 1, 2, 9, 30),   # Market open
            datetime(2023, 1, 2, 16, 0),   # Market close
            datetime(2023, 1, 2, 17, 0),   # After market close
            datetime(2023, 1, 1, 10, 0),   # Sunday (weekend)
            datetime(2023, 1, 2, 12, 0),   # Monday during market hours
        ]
        
        df = pd.DataFrame({
            'timestamp': timestamps,
            'open': [100] * len(timestamps),
            'high': [101] * len(timestamps),
            'low': [99] * len(timestamps),
            'close': [100.5] * len(timestamps),
            'volume': [1000] * len(timestamps)
        })
        
        # Configure cleaner to filter market hours
        config = self.cleaner.default_config()
        config['time_series']['market_hours_only'] = True
        cleaner = MarketDataCleaner(config)
        
        cleaned = cleaner.filter_market_hours(df)
        
        # Should only keep the market hours on weekdays
        self.assertEqual(len(cleaned), 2)  # Only 9:30 and 12:00 on Monday
        self.assertEqual(cleaned['timestamp'].dt.hour.min(), 9)
        self.assertEqual(cleaned['timestamp'].dt.hour.max(), 12)
        self.assertTrue((cleaned['timestamp'].dt.dayofweek < 5).all())  # Weekdays only

if __name__ == '__main__':
    unittest.main()
