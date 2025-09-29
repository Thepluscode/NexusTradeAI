"""
Example script demonstrating the usage of MarketDataCleaner.

This script shows how to load sample market data, clean it using the MarketDataCleaner,
and analyze the cleaning results.
"""
import os
import sys
import pandas as pd
import logging

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data_pipeline.preprocessing import MarketDataCleaner

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

def load_sample_data() -> pd.DataFrame:
    """Load sample market data for demonstration."""
    # Create sample data with some issues
    data = {
        'timestamp': pd.date_range(start='2023-01-01', periods=100, freq='T'),
        'open': [100.0 + i + (0.1 * (i % 10)) for i in range(100)],
        'high': [101.0 + i + (0.2 * (i % 10)) for i in range(100)],
        'low': [99.0 + i - (0.1 * (i % 10)) for i in range(100)],
        'close': [100.5 + i + (0.05 * (i % 10)) for i in range(100)],
        'volume': [1000 + (i * 10) for i in range(100)]
    }
    
    # Introduce some data issues
    df = pd.DataFrame(data)
    
    # Add some missing values
    df.loc[10:12, 'close'] = None
    
    # Add some outliers
    df.loc[20, 'high'] = 1000.0
    
    # Add some duplicates
    df = pd.concat([df, df.iloc[30:32]])
    
    return df

def main():
    """Main function to demonstrate data cleaning."""
    # Load sample data
    print("Loading sample data...")
    raw_data = load_sample_data()
    print(f"Raw data shape: {raw_data.shape}")
    
    # Initialize the data cleaner with default config
    cleaner = MarketDataCleaner()
    
    # Clean the data
    print("\nCleaning data...")
    cleaned_data = cleaner.clean_market_data(raw_data)
    print(f"Cleaned data shape: {cleaned_data.shape}")
    
    # Get cleaning report
    report = cleaner.get_cleaning_report()
    
    # Print summary
    print("\nCleaning Summary:")
    print(f"- Original records: {report['cleaning_stats']['original_records']}")
    print(f"- Final records: {report['cleaning_stats']['final_records']}")
    print(f"- Records removed: {report['cleaning_stats']['records_removed']}")
    print(f"- Data retention rate: {report['cleaning_stats']['data_retention_rate']:.2%}")
    print(f"- Outliers removed: {report['cleaning_stats']['outliers_removed']}")
    print(f"- Missing data points fixed: {report['cleaning_stats']['missing_data_fixed']}")
    print(f"- Duplicate records removed: {report['cleaning_stats']['duplicate_records_removed']}")
    
    # Show first few rows of cleaned data
    print("\nFirst few rows of cleaned data:")
    print(cleaned_data.head())
    
    # Show data quality score distribution
    if 'data_quality_score' in cleaned_data.columns:
        print("\nData quality score distribution:")
        print(cleaned_data['data_quality_score'].describe())

if __name__ == "__main__":
    main()
