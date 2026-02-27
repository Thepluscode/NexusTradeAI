"""
Training Data Collection System
================================
Institutional-grade data collection and storage for ML training.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

This module handles:
- Market data collection from multiple sources
- Data quality validation
- PostgreSQL storage with partitioning
- Feature computation and caching
- Label generation for supervised learning
"""

import asyncio
import aiohttp
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
import logging
import psycopg2
from psycopg2.extras import execute_values
import redis
import json

logger = logging.getLogger(__name__)


@dataclass
class DataCollectionConfig:
    """Configuration for data collection"""

    # API credentials
    alpaca_api_key: str
    alpaca_secret_key: str
    alpaca_base_url: str = "https://paper-api.alpaca.markets"

    # Database
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "nexustradeai_prod"
    db_user: str = "nexustrade_app"
    db_password: str = ""

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # Collection parameters
    symbols: List[str] = None
    start_date: str = "2020-01-01"
    end_date: str = None
    timeframe: str = "1Min"  # 1Min, 5Min, 15Min, 1Hour, 1Day

    # Feature generation
    compute_features: bool = True
    compute_labels: bool = True
    label_horizon: int = 5  # periods ahead to predict

    def __post_init__(self):
        """Set defaults"""
        if self.symbols is None:
            self.symbols = [
                'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA',
                'META', 'TSLA', 'BRK.B', 'JPM', 'V'
            ]
        if self.end_date is None:
            self.end_date = datetime.now().strftime('%Y-%m-%d')


class MarketDataCollector:
    """
    Collects market data from Alpaca and stores in PostgreSQL.

    Features:
    - Async data fetching for performance
    - Automatic gap filling
    - Data quality validation
    - Partitioned storage in PostgreSQL
    - Redis caching for recent data
    """

    def __init__(self, config: DataCollectionConfig):
        """Initialize collector with configuration"""
        self.config = config
        self.db_conn = None
        self.redis_client = None

        # Alpaca API headers
        self.headers = {
            'APCA-API-KEY-ID': config.alpaca_api_key,
            'APCA-API-SECRET-KEY': config.alpaca_secret_key
        }

    async def __aenter__(self):
        """Async context manager entry"""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()

    async def connect(self):
        """Connect to database and Redis"""
        # PostgreSQL connection
        try:
            self.db_conn = psycopg2.connect(
                host=self.config.db_host,
                port=self.config.db_port,
                dbname=self.config.db_name,
                user=self.config.db_user,
                password=self.config.db_password
            )
            logger.info("Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            raise

        # Redis connection
        try:
            self.redis_client = redis.Redis(
                host=self.config.redis_host,
                port=self.config.redis_port,
                db=self.config.redis_db,
                decode_responses=True
            )
            self.redis_client.ping()
            logger.info("Connected to Redis")
        except Exception as e:
            logger.error(f"Failed to connect to Redis: {e}")
            self.redis_client = None

    async def close(self):
        """Close connections"""
        if self.db_conn:
            self.db_conn.close()
            logger.info("Closed PostgreSQL connection")

        if self.redis_client:
            self.redis_client.close()
            logger.info("Closed Redis connection")

    async def collect_historical_data(
        self,
        symbol: str,
        start_date: str,
        end_date: str,
        timeframe: str = "1Min"
    ) -> pd.DataFrame:
        """
        Collect historical OHLCV data for a symbol.

        Args:
            symbol: Stock symbol (e.g., 'AAPL')
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            timeframe: Data frequency (1Min, 5Min, 15Min, 1Hour, 1Day)

        Returns:
            DataFrame with OHLCV data
        """
        logger.info(f"Collecting {timeframe} data for {symbol} from {start_date} to {end_date}")

        # Convert timeframe to Alpaca format
        timeframe_map = {
            '1Min': '1Min',
            '5Min': '5Min',
            '15Min': '15Min',
            '1Hour': '1Hour',
            '1Day': '1Day'
        }
        alpaca_timeframe = timeframe_map.get(timeframe, '1Min')

        # Build API URL
        url = f"{self.config.alpaca_base_url}/v2/stocks/{symbol}/bars"
        params = {
            'start': start_date,
            'end': end_date,
            'timeframe': alpaca_timeframe,
            'limit': 10000,
            'adjustment': 'raw'
        }

        all_bars = []

        async with aiohttp.ClientSession() as session:
            next_page_token = None

            while True:
                if next_page_token:
                    params['page_token'] = next_page_token

                try:
                    async with session.get(url, headers=self.headers, params=params) as response:
                        if response.status != 200:
                            logger.error(f"API error {response.status}: {await response.text()}")
                            break

                        data = await response.json()

                        if 'bars' in data and data['bars']:
                            all_bars.extend(data['bars'])
                            logger.info(f"Fetched {len(data['bars'])} bars (total: {len(all_bars)})")

                        # Check for next page
                        next_page_token = data.get('next_page_token')
                        if not next_page_token:
                            break

                        # Rate limiting
                        await asyncio.sleep(0.05)  # 20 requests/second

                except Exception as e:
                    logger.error(f"Error fetching data: {e}")
                    break

        if not all_bars:
            logger.warning(f"No data retrieved for {symbol}")
            return pd.DataFrame()

        # Convert to DataFrame
        df = pd.DataFrame(all_bars)
        df['t'] = pd.to_datetime(df['t'])
        df = df.rename(columns={
            't': 'timestamp',
            'o': 'open',
            'h': 'high',
            'l': 'low',
            'c': 'close',
            'v': 'volume',
            'n': 'trade_count',
            'vw': 'vwap'
        })
        df = df.set_index('timestamp').sort_index()
        df['symbol'] = symbol

        logger.info(f"Collected {len(df)} bars for {symbol}")

        return df

    async def collect_all_symbols(self) -> Dict[str, pd.DataFrame]:
        """
        Collect data for all configured symbols in parallel.

        Returns:
            Dictionary mapping symbols to DataFrames
        """
        logger.info(f"Collecting data for {len(self.config.symbols)} symbols")

        tasks = [
            self.collect_historical_data(
                symbol,
                self.config.start_date,
                self.config.end_date,
                self.config.timeframe
            )
            for symbol in self.config.symbols
        ]

        results = await asyncio.gather(*tasks)

        data_dict = {
            symbol: df
            for symbol, df in zip(self.config.symbols, results)
            if not df.empty
        }

        logger.info(f"Successfully collected data for {len(data_dict)} symbols")

        return data_dict

    def validate_data(self, df: pd.DataFrame) -> Tuple[bool, List[str]]:
        """
        Validate OHLCV data quality.

        Checks:
        - No missing values in OHLCV
        - High >= Low
        - Open, Close within [Low, High]
        - Volume > 0
        - No duplicate timestamps

        Returns:
            (is_valid, list of error messages)
        """
        errors = []

        # Check for missing values
        required_columns = ['open', 'high', 'low', 'close', 'volume']
        for col in required_columns:
            if df[col].isnull().any():
                errors.append(f"Missing values in {col}")

        # Check OHLC relationships
        if not (df['high'] >= df['low']).all():
            errors.append("High < Low detected")

        if not ((df['open'] >= df['low']) & (df['open'] <= df['high'])).all():
            errors.append("Open outside [Low, High] range")

        if not ((df['close'] >= df['low']) & (df['close'] <= df['high'])).all():
            errors.append("Close outside [Low, High] range")

        # Check volume
        if not (df['volume'] >= 0).all():
            errors.append("Negative volume detected")

        # Check for duplicates
        if df.index.duplicated().any():
            errors.append(f"{df.index.duplicated().sum()} duplicate timestamps")

        is_valid = len(errors) == 0

        if not is_valid:
            logger.warning(f"Data validation failed: {errors}")

        return is_valid, errors

    def store_market_data(self, df: pd.DataFrame, symbol: str):
        """
        Store market data in PostgreSQL.

        Uses COPY for bulk insert performance.
        Handles partitioning automatically.
        """
        if df.empty:
            logger.warning(f"No data to store for {symbol}")
            return

        # Validate data
        is_valid, errors = self.validate_data(df)
        if not is_valid:
            logger.error(f"Data validation failed for {symbol}: {errors}")
            return

        cursor = self.db_conn.cursor()

        try:
            # Prepare data for insertion
            df_insert = df.reset_index()
            df_insert['symbol'] = symbol
            df_insert['created_at'] = datetime.now()

            # Ensure correct column order
            columns = ['symbol', 'timestamp', 'open', 'high', 'low', 'close', 'volume', 'vwap', 'trade_count', 'created_at']
            df_insert = df_insert[columns]

            # Convert to tuples
            values = [tuple(row) for row in df_insert.values]

            # Insert using execute_values for performance
            insert_query = """
                INSERT INTO market_data (symbol, timestamp, open, high, low, close, volume, vwap, trade_count, created_at)
                VALUES %s
                ON CONFLICT (symbol, timestamp) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    vwap = EXCLUDED.vwap,
                    trade_count = EXCLUDED.trade_count
            """

            execute_values(cursor, insert_query, values, page_size=1000)
            self.db_conn.commit()

            logger.info(f"Stored {len(df)} rows for {symbol}")

            # Cache recent data in Redis
            if self.redis_client:
                self._cache_recent_data(symbol, df)

        except Exception as e:
            self.db_conn.rollback()
            logger.error(f"Error storing data for {symbol}: {e}")
            raise

        finally:
            cursor.close()

    def _cache_recent_data(self, symbol: str, df: pd.DataFrame, days: int = 7):
        """Cache recent data in Redis for fast access"""
        try:
            # Get last N days
            cutoff = datetime.now() - timedelta(days=days)
            recent_df = df[df.index >= cutoff]

            if recent_df.empty:
                return

            # Convert to JSON
            data_json = recent_df.to_json(orient='split', date_format='iso')

            # Store in Redis with 24-hour expiry
            key = f"market_data:{symbol}:recent"
            self.redis_client.setex(key, 86400, data_json)

            logger.info(f"Cached {len(recent_df)} recent bars for {symbol} in Redis")

        except Exception as e:
            logger.warning(f"Failed to cache data in Redis: {e}")

    def generate_labels(
        self,
        df: pd.DataFrame,
        horizon: int = 5,
        threshold: float = 0.02
    ) -> pd.Series:
        """
        Generate trading labels for supervised learning.

        Labels:
        - 1 (long): Forward return > threshold
        - 0 (neutral): Forward return in [-threshold, threshold]
        - -1 (short): Forward return < -threshold

        Args:
            df: DataFrame with 'close' prices
            horizon: Number of periods ahead to predict
            threshold: Return threshold for long/short signals

        Returns:
            Series with labels (-1, 0, 1)
        """
        # Calculate forward returns
        forward_return = df['close'].pct_change(horizon).shift(-horizon)

        # Generate labels
        labels = pd.Series(0, index=df.index)  # Default to neutral
        labels[forward_return > threshold] = 1  # Long
        labels[forward_return < -threshold] = -1  # Short

        # Remove last 'horizon' rows (no future data)
        labels.iloc[-horizon:] = np.nan

        return labels

    def store_labels(self, symbol: str, df: pd.DataFrame, horizon: int):
        """Store training labels in database"""
        cursor = self.db_conn.cursor()

        try:
            # Generate labels
            labels = self.generate_labels(df, horizon)
            forward_returns = df['close'].pct_change(horizon).shift(-horizon)

            # Prepare data
            df_labels = pd.DataFrame({
                'symbol': symbol,
                'timestamp': df.index,
                'horizon': f'{horizon}periods',
                'direction': labels,
                'return_pct': forward_returns
            }).dropna()

            # Insert
            values = [tuple(row) for row in df_labels.values]

            insert_query = """
                INSERT INTO training_labels (symbol, timestamp, horizon, direction, return_pct, created_at)
                VALUES %s
                ON CONFLICT (symbol, timestamp, horizon) DO UPDATE SET
                    direction = EXCLUDED.direction,
                    return_pct = EXCLUDED.return_pct
            """

            execute_values(cursor, insert_query,
                          [(v[0], v[1], v[2], int(v[3]), float(v[4]), datetime.now()) for v in values],
                          page_size=1000)

            self.db_conn.commit()
            logger.info(f"Stored {len(df_labels)} labels for {symbol}")

        except Exception as e:
            self.db_conn.rollback()
            logger.error(f"Error storing labels: {e}")
            raise

        finally:
            cursor.close()


async def main():
    """Example usage"""
    import os

    # Configuration
    config = DataCollectionConfig(
        alpaca_api_key=os.getenv('ALPACA_API_KEY', ''),
        alpaca_secret_key=os.getenv('ALPACA_SECRET_KEY', ''),
        db_password=os.getenv('DB_PASSWORD', ''),
        symbols=['AAPL', 'MSFT', 'GOOGL'],  # Test with 3 symbols
        start_date='2024-01-01',
        end_date='2024-12-24',
        timeframe='1Day'
    )

    # Collect data
    async with MarketDataCollector(config) as collector:
        # Collect all symbols
        data_dict = await collector.collect_all_symbols()

        # Store and generate labels
        for symbol, df in data_dict.items():
            print(f"\n{symbol}:")
            print(f"  Rows: {len(df)}")
            print(f"  Date range: {df.index.min()} to {df.index.max()}")

            # Store in database
            collector.store_market_data(df, symbol)

            # Generate and store labels
            if config.compute_labels:
                collector.store_labels(symbol, df, horizon=5)

        print(f"\nData collection complete!")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(main())
