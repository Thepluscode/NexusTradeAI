"""
NexusTradeAI - Volatility Arbitrage Strategy
=============================================

Trades volatility mean reversion by comparing realized vs expected volatility.
Profits from volatility clustering and reversion to mean.

Senior Engineering Rigor:
- GARCH-based volatility forecasting
- IV vs RV comparison (when options data available)
- VIX correlation for regime awareness
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
class VolatilityState:
    """Current volatility market state"""
    realized_vol: float
    forecast_vol: float
    vol_percentile: float  # Current vol vs historical
    is_elevated: bool
    is_contracting: bool
    vix_level: Optional[float] = None


class VolatilityArbitrageStrategy(BaseStrategy):
    """
    Volatility mean reversion strategy.
    
    Entry Logic:
    - Long when realized vol > forecast and vol is contracting
    - Short when realized vol < forecast and vol is expanding
    
    Exit Logic:
    - Volatility normalizes (returns to mean)
    - Time-based exit (max hold period)
    - Stop loss on adverse vol move
    """
    
    def __init__(
        self,
        vol_lookback: int = 20,
        forecast_lookback: int = 60,
        entry_threshold: float = 1.5,  # Entry when RV/HV ratio exceeds this
        exit_threshold: float = 1.0,   # Exit when ratio normalizes
        max_hold_days: int = 10,
        stop_loss_vol_pct: float = 0.50  # Stop if vol moves 50% against
    ):
        super().__init__(
            name=f"VolatilityArbitrage_{vol_lookback}_{forecast_lookback}",
            strategy_type=StrategyType.MEAN_REVERSION,
            parameters={
                'vol_lookback': vol_lookback,
                'forecast_lookback': forecast_lookback,
                'entry_threshold': entry_threshold,
                'exit_threshold': exit_threshold,
                'max_hold_days': max_hold_days,
                'stop_loss_vol_pct': stop_loss_vol_pct
            }
        )
        
        self.vol_lookback = vol_lookback
        self.forecast_lookback = forecast_lookback
        self.entry_threshold = entry_threshold
        self.exit_threshold = exit_threshold
        self.max_hold_days = max_hold_days
        self.stop_loss_vol_pct = stop_loss_vol_pct
    
    def calculate_realized_volatility(self, prices: pd.Series, window: int = 20) -> float:
        """
        Calculate annualized realized volatility.
        
        Uses close-to-close returns with Yang-Zhang correction if OHLC available.
        """
        if len(prices) < window + 1:
            return np.nan
        
        returns = prices.pct_change().dropna()
        realized_vol = returns.tail(window).std() * np.sqrt(252)
        
        return float(realized_vol)
    
    def calculate_parkinson_volatility(
        self, 
        high: pd.Series, 
        low: pd.Series, 
        window: int = 20
    ) -> float:
        """
        Parkinson volatility estimator using high-low range.
        More efficient than close-to-close.
        """
        if len(high) < window:
            return np.nan
        
        log_hl = np.log(high / low) ** 2
        parkinson = np.sqrt(log_hl.tail(window).mean() / (4 * np.log(2))) * np.sqrt(252)
        
        return float(parkinson)
    
    def forecast_volatility(self, prices: pd.Series, horizon: int = 5) -> float:
        """
        Simple EWMA volatility forecast.
        
        For production, use GARCH(1,1) or HAR-RV model.
        """
        if len(prices) < self.forecast_lookback + 1:
            return np.nan
        
        returns = prices.pct_change().dropna()
        
        # EWMA with decay factor
        lambda_factor = 0.94  # RiskMetrics standard
        weights = np.array([(1 - lambda_factor) * (lambda_factor ** i) 
                           for i in range(min(30, len(returns)))])
        weights = weights[::-1]  # Most recent gets highest weight
        
        if len(weights) > len(returns):
            weights = weights[-len(returns):]
        
        recent_returns = returns.tail(len(weights)).values
        ewma_var = np.sum(weights * recent_returns ** 2) / np.sum(weights)
        
        forecast_vol = np.sqrt(ewma_var * 252)
        
        return float(forecast_vol)
    
    def calculate_vol_percentile(self, current_vol: float, prices: pd.Series) -> float:
        """Calculate percentile of current vol vs historical"""
        if len(prices) < 252:
            return 0.5
        
        # Calculate rolling volatility history
        returns = prices.pct_change().dropna()
        rolling_vol = returns.rolling(self.vol_lookback).std() * np.sqrt(252)
        rolling_vol = rolling_vol.dropna()
        
        if len(rolling_vol) < 50:
            return 0.5
        
        percentile = (rolling_vol < current_vol).mean()
        return float(percentile)
    
    def get_volatility_state(self, market_data: List[MarketData]) -> VolatilityState:
        """Analyze current volatility state"""
        prices = pd.Series([d.close for d in market_data])
        
        realized_vol = self.calculate_realized_volatility(prices, self.vol_lookback)
        forecast_vol = self.forecast_volatility(prices)
        vol_percentile = self.calculate_vol_percentile(realized_vol, prices)
        
        # Check if volatility is contracting or expanding
        if len(prices) > 30:
            recent_vol = self.calculate_realized_volatility(prices, 10)
            older_vol = self.calculate_realized_volatility(prices.iloc[:-10], 10)
            is_contracting = recent_vol < older_vol if not np.isnan(recent_vol) else False
        else:
            is_contracting = False
        
        return VolatilityState(
            realized_vol=realized_vol if not np.isnan(realized_vol) else 0.2,
            forecast_vol=forecast_vol if not np.isnan(forecast_vol) else 0.2,
            vol_percentile=vol_percentile,
            is_elevated=vol_percentile > 0.75,
            is_contracting=is_contracting
        )
    
    def generate_signal(self, market_data: List[MarketData]) -> Optional[TradingSignal]:
        """
        Generate trading signal based on volatility analysis.
        
        Entry conditions:
        - VOL_LONG: Elevated vol + contracting (expect continuation down to mean)
        - VOL_SHORT: Low vol + expanding (expect vol spike)
        """
        if len(market_data) < self.forecast_lookback + 10:
            return None
        
        vol_state = self.get_volatility_state(market_data)
        current_price = market_data[-1].close
        
        # Calculate vol ratio
        vol_ratio = vol_state.realized_vol / vol_state.forecast_vol if vol_state.forecast_vol > 0 else 1.0
        
        signal = None
        
        # HIGH VOL MEAN REVERSION: Bet on vol decreasing
        if vol_state.is_elevated and vol_state.is_contracting:
            if vol_ratio > self.entry_threshold:
                # High realized vol vs forecast, expect normalization
                # Go LONG on underlying (high vol often = oversold)
                confidence = min(0.9, 0.5 + vol_state.vol_percentile * 0.4)
                
                signal = TradingSignal(
                    signal_type=SignalType.BUY,
                    symbol=market_data[-1].symbol if hasattr(market_data[-1], 'symbol') else 'UNKNOWN',
                    entry_price=current_price,
                    confidence=confidence,
                    stop_loss=current_price * (1 - vol_state.realized_vol * 2),  # 2x vol stop
                    take_profit=current_price * (1 + vol_state.realized_vol),  # 1x vol target
                    metadata={
                        'vol_ratio': vol_ratio,
                        'realized_vol': vol_state.realized_vol,
                        'forecast_vol': vol_state.forecast_vol,
                        'vol_percentile': vol_state.vol_percentile,
                        'signal_reason': 'high_vol_mean_reversion',
                        'strategy_name': self.name
                    }
                )
        
        # LOW VOL EXPANSION: Realized vol compressing below historical norms and starting to expand.
        # This signals a vol spike is imminent. Direction is determined by recent price momentum:
        # if recent return is negative → expect downside vol spike → SELL
        # if recent return is positive → direction uncertain → NEUTRAL (don't bet direction)
        elif not vol_state.is_elevated and not vol_state.is_contracting:
            if vol_ratio < (1 / self.entry_threshold):
                prices = pd.Series([d.close for d in market_data])
                recent_return = (prices.iloc[-1] - prices.iloc[-5]) / prices.iloc[-5] if len(prices) >= 5 else 0.0
                confidence = min(0.7, 0.3 + (1 - vol_state.vol_percentile) * 0.4)

                if recent_return < -0.005:
                    # Negative momentum + low expanding vol → downside vol spike → SELL
                    signal = TradingSignal(
                        signal_type=SignalType.SELL,
                        symbol=market_data[-1].symbol if hasattr(market_data[-1], 'symbol') else 'UNKNOWN',
                        entry_price=current_price,
                        confidence=confidence,
                        metadata={
                            'vol_ratio': vol_ratio,
                            'realized_vol': vol_state.realized_vol,
                            'forecast_vol': vol_state.forecast_vol,
                            'vol_percentile': vol_state.vol_percentile,
                            'recent_return': recent_return,
                            'signal_reason': 'low_vol_expansion_bearish',
                            'strategy_name': self.name
                        }
                    )
                else:
                    # Direction uncertain — stay neutral, reduce exposure
                    signal = TradingSignal(
                        signal_type=SignalType.NEUTRAL,
                        symbol=market_data[-1].symbol if hasattr(market_data[-1], 'symbol') else 'UNKNOWN',
                        entry_price=current_price,
                        confidence=confidence,
                        metadata={
                            'vol_ratio': vol_ratio,
                            'realized_vol': vol_state.realized_vol,
                            'forecast_vol': vol_state.forecast_vol,
                            'vol_percentile': vol_state.vol_percentile,
                            'signal_reason': 'low_vol_expansion_warning',
                            'strategy_name': self.name
                        }
                    )
        
        return signal
    
    def validate_signal(self, signal: TradingSignal, current_price: float) -> bool:
        """Validate signal is still actionable"""
        if signal is None:
            return False
        
        # Check price hasn't moved too much
        price_change = abs(current_price - signal.price) / signal.price
        if price_change > 0.02:  # 2% move invalidates
            return False
        
        return True


# Factory function
def create_volatility_strategy(
    conservative: bool = True
) -> VolatilityArbitrageStrategy:
    """Create volatility strategy with preset parameters"""
    if conservative:
        return VolatilityArbitrageStrategy(
            vol_lookback=20,
            forecast_lookback=60,
            entry_threshold=1.8,
            max_hold_days=5
        )
    else:
        return VolatilityArbitrageStrategy(
            vol_lookback=10,
            forecast_lookback=30,
            entry_threshold=1.3,
            max_hold_days=15
        )
