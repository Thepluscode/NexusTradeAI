# /ai-ml/feature-engineering/technical_indicators.py
import pandas as pd
import numpy as np
import talib
from typing import List, Dict, Any

class TechnicalIndicators:
    @staticmethod
    def add_bollinger_bands(df: pd.DataFrame, window: int = 20, num_std: int = 2) -> pd.DataFrame:
        df = df.copy()
        df['bb_middle'] = df['close'].rolling(window=window).mean()
        df['bb_upper'] = df['bb_middle'] + num_std * df['close'].rolling(window=window).std()
        df['bb_lower'] = df['bb_middle'] - num_std * df['close'].rolling(window=window).std()
        return df

    @staticmethod
    def add_rsi(df: pd.DataFrame, window: int = 14) -> pd.DataFrame:
        df = df.copy()
        df['rsi'] = talib.RSI(df['close'], timeperiod=window)
        return df

    @staticmethod
    def add_macd(df: pd.DataFrame, 
                fast_period: int = 12, 
                slow_period: int = 26, 
                signal_period: int = 9) -> pd.DataFrame:
        df = df.copy()
        df['macd'], df['macd_signal'], df['macd_hist'] = talib.MACD(
            df['close'], 
            fastperiod=fast_period, 
            slowperiod=slow_period, 
            signalperiod=signal_period
        )
        return df

    @staticmethod
    def add_atr(df: pd.DataFrame, window: int = 14) -> pd.DataFrame:
        df = df.copy()
        df['atr'] = talib.ATR(
            df['high'], 
            df['low'], 
            df['close'], 
            timeperiod=window
        )
        return df

    @staticmethod
    def add_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
        df = TechnicalIndicators.add_bollinger_bands(df)
        df = TechnicalIndicators.add_rsi(df)
        df = TechnicalIndicators.add_macd(df)
        df = TechnicalIndicators.add_atr(df)
        return df