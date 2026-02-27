"""
NexusTradeAI - Historical Data Fetcher
=======================================

Fetch REAL historical market data for backtesting.
This is critical - synthetic data cannot prove alpha.

Data Sources:
- yfinance (free, 10+ years)
- Alpaca API (if configured)

Senior Engineering Rigor:
- Data quality validation
- Caching for performance
- Multiple asset classes
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta
from pathlib import Path
import logging
import time

logger = logging.getLogger(__name__)

# Try to import yfinance
try:
    import yfinance as yf
    HAS_YFINANCE = True
except ImportError:
    HAS_YFINANCE = False
    logger.warning("yfinance not installed. Run: pip install yfinance")


class HistoricalDataFetcher:
    """
    Fetch real historical market data.
    
    Uses yfinance for free historical data.
    """
    
    # Default universe - liquid, tradeable assets
    DEFAULT_UNIVERSE = [
        # Large cap tech
        'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
        # ETFs
        'SPY', 'QQQ', 'IWM', 'DIA', 'VTI',
        # Sectors
        'XLF', 'XLK', 'XLE', 'XLV', 'XLI',
        # Volatility
        'VXX',
        # Bonds
        'TLT', 'IEF', 'SHY',
        # Commodities
        'GLD', 'SLV', 'USO'
    ]
    
    def __init__(
        self,
        data_dir: str = "data/historical",
        cache_days: int = 1
    ):
        """
        Initialize HistoricalDataFetcher.
        
        Args:
            data_dir: Directory to cache data
            cache_days: Days before cache expires
        """
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.cache_days = cache_days
        
        if not HAS_YFINANCE:
            logger.error("yfinance required. Install with: pip install yfinance")
    
    def fetch_symbol(
        self,
        symbol: str,
        start_date: str = "2014-01-01",
        end_date: str = None,
        use_cache: bool = True
    ) -> Optional[pd.DataFrame]:
        """
        Fetch historical data for a single symbol.
        
        Args:
            symbol: Stock/ETF symbol
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (defaults to today)
            use_cache: Use cached data if available
            
        Returns:
            DataFrame with OHLCV data
        """
        if end_date is None:
            end_date = datetime.now().strftime('%Y-%m-%d')
        
        cache_file = self.data_dir / f"{symbol}.parquet"
        
        # Check cache
        if use_cache and cache_file.exists():
            cache_age = (datetime.now() - datetime.fromtimestamp(cache_file.stat().st_mtime)).days
            if cache_age < self.cache_days:
                logger.info(f"Loading {symbol} from cache")
                df = pd.read_parquet(cache_file)
                return self._filter_dates(df, start_date, end_date)
        
        # Fetch from yfinance
        if not HAS_YFINANCE:
            logger.error("Cannot fetch data - yfinance not installed")
            return None
        
        try:
            logger.info(f"Fetching {symbol} from Yahoo Finance...")
            ticker = yf.Ticker(symbol)
            df = ticker.history(start=start_date, end=end_date, auto_adjust=True)
            
            if df.empty:
                logger.warning(f"No data returned for {symbol}")
                return None
            
            # Standardize columns
            df.columns = df.columns.str.lower()
            df = df.rename(columns={'stock splits': 'splits'})
            
            # Keep only OHLCV
            df = df[['open', 'high', 'low', 'close', 'volume']].copy()
            
            # Validate data
            df = self._validate_data(df, symbol)
            
            # Cache
            df.to_parquet(cache_file)
            logger.info(f"Cached {len(df)} days of {symbol} data")
            
            return df
            
        except Exception as e:
            logger.error(f"Error fetching {symbol}: {e}")
            return None
    
    def fetch_universe(
        self,
        symbols: List[str] = None,
        start_date: str = "2014-01-01",
        end_date: str = None,
        min_history_days: int = 252 * 5  # 5 years minimum
    ) -> Dict[str, pd.DataFrame]:
        """
        Fetch data for multiple symbols.
        
        Args:
            symbols: List of symbols (defaults to DEFAULT_UNIVERSE)
            start_date: Start date
            end_date: End date
            min_history_days: Minimum days of history required
            
        Returns:
            Dict of symbol -> DataFrame
        """
        if symbols is None:
            symbols = self.DEFAULT_UNIVERSE
        
        data = {}
        failed = []
        
        for symbol in symbols:
            df = self.fetch_symbol(symbol, start_date, end_date)
            
            if df is not None and len(df) >= min_history_days:
                data[symbol] = df
                logger.info(f"✓ {symbol}: {len(df)} days")
            else:
                failed.append(symbol)
                logger.warning(f"✗ {symbol}: insufficient data")
            
            # Rate limiting
            time.sleep(0.5)
        
        logger.info(f"Fetched {len(data)}/{len(symbols)} symbols successfully")
        
        if failed:
            logger.warning(f"Failed/insufficient: {failed}")
        
        return data
    
    def _validate_data(self, df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Validate and clean data"""
        initial_len = len(df)
        
        # Remove NaN
        df = df.dropna()
        
        # Remove zero/negative prices
        df = df[(df['close'] > 0) & (df['volume'] >= 0)]
        
        # Fix OHLC consistency
        df['high'] = df[['open', 'high', 'low', 'close']].max(axis=1)
        df['low'] = df[['open', 'high', 'low', 'close']].min(axis=1)
        
        # Check for gaps > 5 days
        if len(df) > 1:
            gaps = df.index.to_series().diff().dt.days
            large_gaps = gaps[gaps > 5]
            if len(large_gaps) > 0:
                logger.warning(f"{symbol} has {len(large_gaps)} gaps > 5 days")
        
        if len(df) < initial_len:
            logger.info(f"Cleaned {initial_len - len(df)} invalid rows from {symbol}")
        
        return df
    
    def _filter_dates(
        self,
        df: pd.DataFrame,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Filter DataFrame to date range"""
        mask = (df.index >= start_date) & (df.index <= end_date)
        return df[mask]
    
    def get_benchmark(
        self,
        symbol: str = "SPY",
        start_date: str = "2014-01-01"
    ) -> Optional[pd.DataFrame]:
        """Get benchmark data (SPY by default)"""
        return self.fetch_symbol(symbol, start_date)
    
    def calculate_returns(
        self,
        data: Dict[str, pd.DataFrame]
    ) -> pd.DataFrame:
        """Calculate daily returns for all symbols"""
        returns = {}
        
        for symbol, df in data.items():
            returns[symbol] = df['close'].pct_change()
        
        return pd.DataFrame(returns).dropna()
    
    def get_data_summary(self, data: Dict[str, pd.DataFrame]) -> Dict:
        """Get summary statistics of fetched data"""
        summary = {
            'total_symbols': len(data),
            'date_range': {},
            'symbols': {}
        }
        
        all_starts = []
        all_ends = []
        
        for symbol, df in data.items():
            start = df.index[0]
            end = df.index[-1]
            all_starts.append(start)
            all_ends.append(end)
            
            summary['symbols'][symbol] = {
                'days': len(df),
                'start': start.strftime('%Y-%m-%d'),
                'end': end.strftime('%Y-%m-%d'),
                'avg_volume': int(df['volume'].mean())
            }
        
        if all_starts:
            summary['date_range'] = {
                'common_start': max(all_starts).strftime('%Y-%m-%d'),
                'common_end': min(all_ends).strftime('%Y-%m-%d')
            }
        
        return summary


def create_data_fetcher(data_dir: str = "data/historical") -> HistoricalDataFetcher:
    """Factory function"""
    return HistoricalDataFetcher(data_dir=data_dir)


# Quick test
if __name__ == "__main__":
    fetcher = HistoricalDataFetcher()
    
    # Fetch just SPY to test
    spy = fetcher.fetch_symbol('SPY', '2014-01-01')
    
    if spy is not None:
        print(f"✓ Fetched SPY: {len(spy)} days")
        print(f"  Date range: {spy.index[0].date()} to {spy.index[-1].date()}")
        print(f"  Latest close: ${spy['close'].iloc[-1]:.2f}")
    else:
        print("✗ Failed to fetch SPY - check yfinance installation")
