# Market Data Preprocessing

This module provides tools for cleaning and preprocessing financial market data to ensure high-quality input for analysis and modeling.

## Features

- **Data Validation**: Ensures data integrity by validating price relationships and types.
- **Duplicate Removal**: Identifies and removes duplicate records.
- **Missing Data Handling**: Provides multiple strategies for handling missing values (interpolation, forward fill, or drop).
- **Outlier Detection**: Implements multiple outlier detection methods (IQR, Z-score, Isolation Forest).
- **Time Series Validation**: Ensures proper time ordering and can filter to market hours.
- **Quality Indicators**: Adds data quality metrics to the output.

## Installation

1. Ensure you have Python 3.8+ installed.
2. Install the required dependencies:

```bash
pip install -r requirements.txt
```

## Usage

### Basic Usage

```python
from data_pipeline.preprocessing import MarketDataCleaner
import pandas as pd

# Sample data
data = {
    'timestamp': pd.date_range(start='2023-01-01', periods=10, freq='T'),
    'open': [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0, 109.0],
    'high': [101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0, 109.0, 110.0],
    'low': [99.0, 100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0, 108.0],
    'close': [100.5, 101.5, 102.5, 103.5, 104.5, 105.5, 106.5, 107.5, 108.5, 109.5],
    'volume': [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900]
}

df = pd.DataFrame(data)

# Initialize the cleaner with default configuration
cleaner = MarketDataCleaner()

# Clean the data
cleaned_data = cleaner.clean_market_data(df)

# Get cleaning report
report = cleaner.get_cleaning_report()
print(f"Records processed: {report['cleaning_stats']['original_records']}")
print(f"Records after cleaning: {report['cleaning_stats']['final_records']}")
```

### Custom Configuration

You can customize the cleaning process by providing a configuration dictionary:

```python
config = {
    'outlier_detection': {
        'method': 'zscore',  # Options: 'iqr', 'zscore', 'isolation_forest'
        'zscore_threshold': 3.0,
    },
    'missing_data': {
        'method': 'interpolation',  # Options: 'forward_fill', 'interpolation', 'drop'
        'max_consecutive_missing': 5
    },
    'time_series': {
        'market_hours_only': False,
        'timezone': 'America/New_York'
    }
}

cleaner = MarketDataCleaner(config=config)
```

## API Reference

### `MarketDataCleaner`

#### `__init__(self, config: Dict = None)`

Initialize the MarketDataCleaner with an optional configuration.

**Parameters:**
- `config`: Optional dictionary with cleaning configuration. If not provided, uses default settings.

#### `clean_market_data(self, df: pd.DataFrame) -> pd.DataFrame`

Run the complete data cleaning pipeline on the input DataFrame.

**Parameters:**
- `df`: Input DataFrame with market data.

**Returns:**
- Cleaned DataFrame with quality indicators.

#### `get_cleaning_report(self) -> Dict`

Get a report of the cleaning operations performed.

**Returns:**
- Dictionary with cleaning statistics and configuration.

## Running Tests

To run the unit tests:

```bash
pytest tests/test_data_cleaner.py -v
```

## Example

See the example script at `examples/example_data_cleaning.py` for a complete working example.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
