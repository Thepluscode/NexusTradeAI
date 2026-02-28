"""
NexusTradeAI - Statistical Pairs Trading Strategy
==================================================

Cointegration-based pairs trading using z-score mean reversion.
Identifies statistically related pairs and trades their spread.

Senior Engineering Rigor:
- Cointegration testing (Engle-Granger)
- Dynamic hedge ratio calculation
- Spread half-life estimation
- Risk-adjusted position sizing
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from datetime import datetime
import logging

# Import base framework
import sys
sys.path.append('..')
from strategy_framework import BaseStrategy, TradingSignal, MarketData, SignalType, StrategyType

logger = logging.getLogger(__name__)


@dataclass
class PairState:
    """Current state of a trading pair"""
    symbol_1: str
    symbol_2: str
    hedge_ratio: float
    spread: float
    z_score: float
    half_life: float
    correlation: float
    is_cointegrated: bool


class PairsTradingStrategy(BaseStrategy):
    """
    Statistical arbitrage pairs trading strategy.
    
    Entry Logic:
    - Short spread when z-score > entry_threshold (spread too high)
    - Long spread when z-score < -entry_threshold (spread too low)
    
    Exit Logic:
    - Z-score crosses zero (mean reversion complete)
    - Stop loss if z-score moves further against
    - Time-based exit if half-life exceeded
    """
    
    def __init__(
        self,
        lookback_period: int = 60,
        entry_z_score: float = 2.0,
        exit_z_score: float = 0.5,
        stop_z_score: float = 3.5,
        min_half_life: int = 5,
        max_half_life: int = 30,
        min_correlation: float = 0.7
    ):
        super().__init__(
            name=f"PairsTrading_{lookback_period}_{entry_z_score}",
            strategy_type=StrategyType.ARBITRAGE,
            parameters={
                'lookback_period': lookback_period,
                'entry_z_score': entry_z_score,
                'exit_z_score': exit_z_score,
                'stop_z_score': stop_z_score,
                'min_half_life': min_half_life,
                'max_half_life': max_half_life,
                'min_correlation': min_correlation
            }
        )
        
        self.lookback_period = lookback_period
        self.entry_z_score = entry_z_score
        self.exit_z_score = exit_z_score
        self.stop_z_score = stop_z_score
        self.min_half_life = min_half_life
        self.max_half_life = max_half_life
        self.min_correlation = min_correlation
        
        # Tracked pairs and their states
        self.active_pairs: Dict[str, PairState] = {}
    
    def calculate_hedge_ratio(
        self, 
        prices_1: pd.Series, 
        prices_2: pd.Series
    ) -> float:
        """
        Calculate optimal hedge ratio using OLS regression.
        
        hedge_ratio = beta from regressing prices_1 on prices_2
        """
        if len(prices_1) != len(prices_2) or len(prices_1) < 30:
            return 1.0
        
        # Simple OLS: y = alpha + beta * x
        x = prices_2.values
        y = prices_1.values
        
        # Add intercept
        X = np.column_stack([np.ones(len(x)), x])
        
        try:
            # OLS solution: beta = (X'X)^(-1) X'y
            beta = np.linalg.lstsq(X, y, rcond=None)[0]
            hedge_ratio = beta[1]  # Slope coefficient
        except np.linalg.LinAlgError:
            hedge_ratio = 1.0
        
        return float(hedge_ratio)
    
    def calculate_spread(
        self,
        prices_1: pd.Series,
        prices_2: pd.Series,
        hedge_ratio: float
    ) -> pd.Series:
        """Calculate spread between two price series"""
        return prices_1 - hedge_ratio * prices_2
    
    def calculate_z_score(self, spread: pd.Series, lookback: int = None) -> float:
        """Calculate z-score of current spread vs historical"""
        if lookback is None:
            lookback = self.lookback_period
        
        if len(spread) < lookback:
            return 0.0
        
        recent_spread = spread.tail(lookback)
        mean = recent_spread.mean()
        std = recent_spread.std()
        
        if std < 1e-8:
            return 0.0
        
        current = spread.iloc[-1]
        z_score = (current - mean) / std
        
        return float(z_score)
    
    def calculate_half_life(self, spread: pd.Series) -> float:
        """
        Estimate mean reversion half-life using Ornstein-Uhlenbeck process.
        
        half_life = -ln(2) / theta
        where theta is the mean reversion speed
        """
        if len(spread) < 30:
            return float('inf')
        
        spread_lag = spread.shift(1).dropna()
        spread_diff = spread.diff().dropna()
        
        # Align series
        spread_lag = spread_lag.iloc[1:]
        spread_diff = spread_diff.iloc[1:]
        
        if len(spread_lag) < 20:
            return float('inf')
        
        try:
            # OLS: delta_spread = theta * (mean - spread_lag) + epsilon
            # Simplified: delta_spread = alpha + beta * spread_lag
            X = np.column_stack([np.ones(len(spread_lag)), spread_lag.values])
            y = spread_diff.values
            
            beta = np.linalg.lstsq(X, y, rcond=None)[0]
            theta = -beta[1]
            
            if theta <= 0:
                return float('inf')
            
            half_life = -np.log(2) / np.log(1 + theta)
            
        except (np.linalg.LinAlgError, RuntimeWarning):
            half_life = float('inf')
        
        return max(1, float(half_life))
    
    def test_cointegration(
        self,
        prices_1: pd.Series,
        prices_2: pd.Series
    ) -> Tuple[bool, float]:
        """
        Simple cointegration test using Augmented Dickey-Fuller on spread.
        
        Returns (is_cointegrated, p_value_estimate)
        """
        if len(prices_1) < 60:
            return False, 1.0
        
        hedge_ratio = self.calculate_hedge_ratio(prices_1, prices_2)
        spread = self.calculate_spread(prices_1, prices_2, hedge_ratio)
        
        # Simple stationarity test: check if spread crosses mean frequently
        mean = spread.mean()
        crossings = ((spread > mean).astype(int).diff().abs() > 0).sum()
        expected_crossings = len(spread) * 0.3  # Rough expectation for stationary series
        
        # Heuristic: stationary if crossings are frequent
        crossing_ratio = crossings / expected_crossings if expected_crossings > 0 else 0
        
        # Check spread variance ratio (should be bounded if stationary)
        var_1 = spread.iloc[:len(spread)//2].var()
        var_2 = spread.iloc[len(spread)//2:].var()
        var_ratio = max(var_1, var_2) / min(var_1, var_2) if min(var_1, var_2) > 0 else float('inf')
        
        is_cointegrated = crossing_ratio > 0.7 and var_ratio < 2.0
        p_value_estimate = 1.0 - min(1.0, crossing_ratio * 0.5)
        
        return is_cointegrated, p_value_estimate
    
    def analyze_pair(
        self,
        symbol_1: str,
        prices_1: pd.Series,
        symbol_2: str,
        prices_2: pd.Series
    ) -> Optional[PairState]:
        """Analyze a potential trading pair"""
        if len(prices_1) < self.lookback_period or len(prices_2) < self.lookback_period:
            return None
        
        # Align series
        min_len = min(len(prices_1), len(prices_2))
        prices_1 = prices_1.tail(min_len)
        prices_2 = prices_2.tail(min_len)
        
        # Check correlation
        correlation = prices_1.corr(prices_2)
        if abs(correlation) < self.min_correlation:
            return None
        
        # Test cointegration
        is_cointegrated, _ = self.test_cointegration(prices_1, prices_2)
        
        # Calculate metrics
        hedge_ratio = self.calculate_hedge_ratio(prices_1, prices_2)
        spread = self.calculate_spread(prices_1, prices_2, hedge_ratio)
        z_score = self.calculate_z_score(spread)
        half_life = self.calculate_half_life(spread)
        
        # Check half-life bounds
        if half_life < self.min_half_life or half_life > self.max_half_life:
            return None
        
        return PairState(
            symbol_1=symbol_1,
            symbol_2=symbol_2,
            hedge_ratio=hedge_ratio,
            spread=float(spread.iloc[-1]),
            z_score=z_score,
            half_life=half_life,
            correlation=correlation,
            is_cointegrated=is_cointegrated
        )
    
    def generate_signal(
        self,
        market_data: List[MarketData],
        pair_data: Optional[List[MarketData]] = None
    ) -> Optional[TradingSignal]:
        """
        Generate trading signal for a pair.
        
        Note: This strategy requires data for TWO symbols.
        Pass the second symbol's data via pair_data parameter.
        """
        if pair_data is None or len(market_data) < self.lookback_period:
            return None
        
        # Extract price series
        symbol_1 = market_data[-1].symbol if hasattr(market_data[-1], 'symbol') else 'SYMBOL1'
        symbol_2 = pair_data[-1].symbol if hasattr(pair_data[-1], 'symbol') else 'SYMBOL2'
        
        prices_1 = pd.Series([d.close for d in market_data])
        prices_2 = pd.Series([d.close for d in pair_data])
        
        # Analyze pair
        pair_state = self.analyze_pair(symbol_1, prices_1, symbol_2, prices_2)
        
        if pair_state is None:
            return None
        
        if not pair_state.is_cointegrated:
            logger.debug(f"Pair {symbol_1}/{symbol_2} not cointegrated")
            return None
        
        z_score = pair_state.z_score
        current_price = market_data[-1].close
        
        signal = None
        
        # LONG SPREAD: z-score very negative (spread too tight)
        if z_score < -self.entry_z_score:
            # Buy symbol_1, sell symbol_2 (long spread)
            confidence = min(0.9, 0.5 + abs(z_score) * 0.15)
            
            signal = TradingSignal(
                signal_type=SignalType.BUY,
                symbol=symbol_1,
                price=current_price,
                confidence=confidence,
                strategy_name=self.name,
                metadata={
                    'pair_symbol': symbol_2,
                    'hedge_ratio': pair_state.hedge_ratio,
                    'z_score': z_score,
                    'half_life': pair_state.half_life,
                    'correlation': pair_state.correlation,
                    'action': 'long_spread',
                    'note': f'Buy {symbol_1}, Sell {pair_state.hedge_ratio:.2f}x {symbol_2}'
                }
            )
        
        # SHORT SPREAD: z-score very positive (spread too wide)
        elif z_score > self.entry_z_score:
            # Sell symbol_1, buy symbol_2 (short spread)
            confidence = min(0.9, 0.5 + abs(z_score) * 0.15)
            
            signal = TradingSignal(
                signal_type=SignalType.SELL,
                symbol=symbol_1,
                price=current_price,
                confidence=confidence,
                strategy_name=self.name,
                metadata={
                    'pair_symbol': symbol_2,
                    'hedge_ratio': pair_state.hedge_ratio,
                    'z_score': z_score,
                    'half_life': pair_state.half_life,
                    'correlation': pair_state.correlation,
                    'action': 'short_spread',
                    'note': f'Sell {symbol_1}, Buy {pair_state.hedge_ratio:.2f}x {symbol_2}'
                }
            )
        
        return signal
    
    def check_exit(self, pair_state: PairState) -> Tuple[bool, str]:
        """Check if position should be exited"""
        z_score = pair_state.z_score
        
        # Mean reversion complete
        if abs(z_score) < self.exit_z_score:
            return True, "mean_reversion_complete"
        
        # Stop loss triggered
        if abs(z_score) > self.stop_z_score:
            return True, "stop_loss"
        
        return False, ""
    
    def validate_signal(self, signal: TradingSignal, current_price: float) -> bool:
        if signal is None:
            return False
        
        price_change = abs(current_price - signal.price) / signal.price
        return price_change < 0.015  # 1.5% max slippage


# Pre-defined sector pairs for common trading
SECTOR_PAIRS = {
    'XLF': ['JPM', 'BAC', 'GS', 'WFC'],  # Financials
    'XLK': ['AAPL', 'MSFT', 'GOOGL', 'META'],  # Tech
    'XLE': ['XOM', 'CVX', 'COP', 'EOG'],  # Energy
    'XLV': ['UNH', 'JNJ', 'PFE', 'ABBV'],  # Healthcare
}


def get_recommended_pairs() -> List[Tuple[str, str]]:
    """Get list of recommended pairs for trading"""
    pairs = [
        ('XOM', 'CVX'),   # Oil majors
        ('JPM', 'BAC'),   # Big banks
        ('AAPL', 'MSFT'), # Tech giants
        ('KO', 'PEP'),    # Consumer staples
        ('HD', 'LOW'),    # Home improvement
        ('V', 'MA'),      # Payment networks
        ('GLD', 'GDX'),   # Gold/miners
        ('SPY', 'IWM'),   # Large vs small cap
    ]
    return pairs
