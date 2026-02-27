"""
NexusTradeAI - Regime-Based Momentum Strategy
==============================================

Adaptive momentum strategy that adjusts parameters based on market regime.
Aggressive in trending markets, defensive in mean-reverting/high-vol regimes.

Senior Engineering Rigor:
- Integration with RegimeDetector
- Dynamic parameter tuning
- Risk-adjusted position sizing per regime
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import logging

# Import base framework and regime detector
import sys
sys.path.append('..')
from strategy_framework import BaseStrategy, TradingSignal, MarketData, SignalType, StrategyType

# Import regime detector
try:
    sys.path.insert(0, '../../ai-ml/models/regime')
    from RegimeDetector import RegimeDetector, MarketRegime, RegimeState, get_regime_detector
    REGIME_AVAILABLE = True
except ImportError:
    REGIME_AVAILABLE = False
    logging.warning("RegimeDetector not available")

logger = logging.getLogger(__name__)


@dataclass
class RegimeMomentumConfig:
    """Configuration for momentum in specific regime"""
    lookback_fast: int
    lookback_slow: int
    entry_threshold: float
    stop_loss_pct: float
    take_profit_pct: float
    position_size_multiplier: float
    max_positions: int


# Default configs per regime
REGIME_CONFIGS: Dict[MarketRegime, RegimeMomentumConfig] = {
    MarketRegime.TRENDING_UP: RegimeMomentumConfig(
        lookback_fast=10,
        lookback_slow=30,
        entry_threshold=0.02,  # 2% breakout
        stop_loss_pct=0.04,
        take_profit_pct=0.12,  # Let winners run
        position_size_multiplier=1.2,  # Larger positions
        max_positions=8
    ),
    MarketRegime.TRENDING_DOWN: RegimeMomentumConfig(
        lookback_fast=10,
        lookback_slow=30,
        entry_threshold=0.02,
        stop_loss_pct=0.03,  # Tighter stops
        take_profit_pct=0.08,
        position_size_multiplier=0.8,  # Smaller positions
        max_positions=4
    ),
    MarketRegime.MEAN_REVERTING: RegimeMomentumConfig(
        lookback_fast=5,
        lookback_slow=15,
        entry_threshold=0.03,  # Higher threshold (fewer trades)
        stop_loss_pct=0.025,  # Very tight stops
        take_profit_pct=0.04,  # Quick profits
        position_size_multiplier=0.5,
        max_positions=3
    ),
    MarketRegime.HIGH_VOLATILITY: RegimeMomentumConfig(
        lookback_fast=20,  # Slower signals
        lookback_slow=50,
        entry_threshold=0.05,  # Much higher threshold
        stop_loss_pct=0.06,  # Wider stops
        take_profit_pct=0.10,
        position_size_multiplier=0.3,  # Very small positions
        max_positions=2
    ),
}


class RegimeBasedMomentumStrategy(BaseStrategy):
    """
    Momentum strategy that adapts to market regime.
    
    Key adaptations:
    - TRENDING_UP: Aggressive, ride the trend
    - TRENDING_DOWN: Defensive, smaller positions
    - MEAN_REVERTING: Quick scalps, tight stops
    - HIGH_VOLATILITY: Very selective, wide stops
    """
    
    def __init__(
        self,
        base_lookback: int = 20,
        use_regime_detector: bool = True,
        regime_detector: Optional[Any] = None
    ):
        super().__init__(
            name="RegimeBasedMomentum",
            strategy_type=StrategyType.MOMENTUM,
            config={
                'base_lookback': base_lookback,
                'use_regime_detector': use_regime_detector,
                'adaptive': True
            }
        )
        
        self.base_lookback = base_lookback
        self.use_regime_detector = use_regime_detector and REGIME_AVAILABLE
        
        if regime_detector:
            self.regime_detector = regime_detector
        elif self.use_regime_detector:
            self.regime_detector = RegimeDetector()
        else:
            self.regime_detector = None
        
        self.current_regime = MarketRegime.MEAN_REVERTING  # Default
        self.current_config = REGIME_CONFIGS.get(
            self.current_regime,
            REGIME_CONFIGS[MarketRegime.MEAN_REVERTING]
        )
    
    def update_regime(self, prices: pd.Series) -> RegimeState:
        """Update current market regime"""
        if not self.use_regime_detector or self.regime_detector is None:
            return self._fallback_regime_detection(prices)
        
        regime_state = self.regime_detector.detect(prices)
        self.current_regime = regime_state.current_regime
        self.current_config = REGIME_CONFIGS.get(
            self.current_regime,
            REGIME_CONFIGS[MarketRegime.MEAN_REVERTING]
        )
        
        logger.info(
            f"Regime updated: {self.current_regime.name} "
            f"(confidence: {regime_state.confidence:.2f})"
        )
        
        return regime_state
    
    def _fallback_regime_detection(self, prices: pd.Series) -> RegimeState:
        """Simple rule-based regime detection"""
        if len(prices) < 60:
            self.current_regime = MarketRegime.MEAN_REVERTING
            self.current_config = REGIME_CONFIGS[MarketRegime.MEAN_REVERTING]
            return None
        
        # Calculate trend and volatility
        ret_20d = prices.pct_change(20).iloc[-1] if len(prices) > 20 else 0
        vol = prices.pct_change().rolling(20).std().iloc[-1] * np.sqrt(252)
        
        if vol > 0.35:
            regime = MarketRegime.HIGH_VOLATILITY
        elif ret_20d > 0.05:
            regime = MarketRegime.TRENDING_UP
        elif ret_20d < -0.05:
            regime = MarketRegime.TRENDING_DOWN
        else:
            regime = MarketRegime.MEAN_REVERTING
        
        self.current_regime = regime
        self.current_config = REGIME_CONFIGS[regime]
        
        return None
    
    def calculate_momentum_signal(
        self,
        market_data: List[MarketData]
    ) -> Dict[str, Any]:
        """Calculate momentum indicators"""
        prices = pd.Series([d.close for d in market_data])
        
        if len(prices) < self.current_config.lookback_slow + 10:
            return {'valid': False}
        
        # Moving averages
        ma_fast = prices.rolling(self.current_config.lookback_fast).mean()
        ma_slow = prices.rolling(self.current_config.lookback_slow).mean()
        
        # Current values
        current_price = prices.iloc[-1]
        current_ma_fast = ma_fast.iloc[-1]
        current_ma_slow = ma_slow.iloc[-1]
        
        # Momentum metrics
        price_vs_ma_fast = (current_price / current_ma_fast - 1) if current_ma_fast > 0 else 0
        price_vs_ma_slow = (current_price / current_ma_slow - 1) if current_ma_slow > 0 else 0
        ma_crossover = (current_ma_fast / current_ma_slow - 1) if current_ma_slow > 0 else 0
        
        # Rate of change
        roc_fast = prices.pct_change(self.current_config.lookback_fast).iloc[-1]
        roc_slow = prices.pct_change(self.current_config.lookback_slow).iloc[-1]
        
        # Breakout detection
        high_lookback = prices.tail(self.current_config.lookback_slow).max()
        low_lookback = prices.tail(self.current_config.lookback_slow).min()
        
        is_breakout_high = current_price >= high_lookback * 0.99
        is_breakout_low = current_price <= low_lookback * 1.01
        
        return {
            'valid': True,
            'current_price': current_price,
            'ma_fast': current_ma_fast,
            'ma_slow': current_ma_slow,
            'price_vs_ma_fast': price_vs_ma_fast,
            'price_vs_ma_slow': price_vs_ma_slow,
            'ma_crossover': ma_crossover,
            'roc_fast': roc_fast,
            'roc_slow': roc_slow,
            'is_breakout_high': is_breakout_high,
            'is_breakout_low': is_breakout_low,
            'high_lookback': high_lookback,
            'low_lookback': low_lookback
        }
    
    def generate_signal(self, market_data: List[MarketData]) -> Optional[TradingSignal]:
        """Generate regime-adaptive momentum signal"""
        if len(market_data) < 60:
            return None
        
        # Update regime
        prices = pd.Series([d.close for d in market_data])
        self.update_regime(prices)
        
        # Calculate momentum
        momentum = self.calculate_momentum_signal(market_data)
        
        if not momentum['valid']:
            return None
        
        config = self.current_config
        current_price = momentum['current_price']
        symbol = market_data[-1].symbol if hasattr(market_data[-1], 'symbol') else 'UNKNOWN'
        
        signal = None
        
        # BULLISH SIGNAL
        if (momentum['is_breakout_high'] and 
            momentum['ma_crossover'] > 0 and
            momentum['roc_fast'] > config.entry_threshold):
            
            # Stronger signal in trending up regime
            base_confidence = 0.6
            if self.current_regime == MarketRegime.TRENDING_UP:
                base_confidence = 0.75
            elif self.current_regime == MarketRegime.HIGH_VOLATILITY:
                base_confidence = 0.45
            
            confidence = min(0.9, base_confidence + momentum['roc_fast'] * 2)
            
            signal = TradingSignal(
                signal_type=SignalType.BUY,
                symbol=symbol,
                price=current_price,
                confidence=confidence,
                strategy_name=self.name,
                stop_loss=current_price * (1 - config.stop_loss_pct),
                take_profit=current_price * (1 + config.take_profit_pct),
                metadata={
                    'regime': self.current_regime.name,
                    'position_size_mult': config.position_size_multiplier,
                    'max_positions': config.max_positions,
                    'roc_fast': momentum['roc_fast'],
                    'ma_crossover': momentum['ma_crossover'],
                    'breakout_level': momentum['high_lookback']
                }
            )
        
        # BEARISH SIGNAL (only in trending down or high vol regimes)
        elif (self.current_regime in [MarketRegime.TRENDING_DOWN, MarketRegime.HIGH_VOLATILITY] and
              momentum['is_breakout_low'] and
              momentum['ma_crossover'] < 0 and
              momentum['roc_fast'] < -config.entry_threshold):
            
            confidence = min(0.8, 0.5 + abs(momentum['roc_fast']) * 2)
            
            signal = TradingSignal(
                signal_type=SignalType.SELL,
                symbol=symbol,
                price=current_price,
                confidence=confidence,
                strategy_name=self.name,
                stop_loss=current_price * (1 + config.stop_loss_pct),
                take_profit=current_price * (1 - config.take_profit_pct),
                metadata={
                    'regime': self.current_regime.name,
                    'position_size_mult': config.position_size_multiplier,
                    'roc_fast': momentum['roc_fast'],
                    'ma_crossover': momentum['ma_crossover'],
                    'breakdown_level': momentum['low_lookback']
                }
            )
        
        return signal
    
    def get_position_size_multiplier(self) -> float:
        """Get position size multiplier for current regime"""
        return self.current_config.position_size_multiplier
    
    def get_max_positions(self) -> int:
        """Get max positions for current regime"""
        return self.current_config.max_positions
    
    def validate_signal(self, signal: TradingSignal, current_price: float) -> bool:
        if signal is None:
            return False
        
        price_change = abs(current_price - signal.price) / signal.price
        max_slippage = 0.01 if self.current_regime == MarketRegime.HIGH_VOLATILITY else 0.02
        
        return price_change < max_slippage


# Factory function
def create_regime_momentum_strategy(
    use_pretrained_detector: bool = False
) -> RegimeBasedMomentumStrategy:
    """Create regime-based momentum strategy"""
    return RegimeBasedMomentumStrategy(
        base_lookback=20,
        use_regime_detector=REGIME_AVAILABLE
    )
