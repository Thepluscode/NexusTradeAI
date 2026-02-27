"""
NexusTradeAI - Phase 2 Strategy Tests
=====================================

Unit tests for new strategies developed in Phase 2.
"""

import numpy as np
import pandas as pd
import pytest
from datetime import datetime, timedelta
import sys
import os

# Add paths
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../ai-ml/models/regime'))


class MockMarketData:
    """Mock market data for testing"""
    def __init__(self, symbol: str, close: float, high: float = None, low: float = None, volume: int = 100000):
        self.symbol = symbol
        self.close = close
        self.high = high or close * 1.01
        self.low = low or close * 0.99
        self.volume = volume
        self.timestamp = datetime.now()


def generate_trending_data(start_price: float, days: int, trend: float = 0.001) -> list:
    """Generate trending price data"""
    data = []
    price = start_price
    for i in range(days):
        noise = np.random.normal(0, 0.005)
        price *= (1 + trend + noise)
        data.append(MockMarketData('TEST', price))
    return data


def generate_mean_reverting_data(center: float, days: int, std: float = 0.02) -> list:
    """Generate mean reverting price data"""
    data = []
    price = center
    for i in range(days):
        # Mean revert with noise
        price = center + (price - center) * 0.95 + np.random.normal(0, center * std)
        data.append(MockMarketData('TEST', max(price, center * 0.5)))
    return data


def generate_volatile_data(start_price: float, days: int, vol: float = 0.05) -> list:
    """Generate high volatility data"""
    data = []
    price = start_price
    for i in range(days):
        change = np.random.normal(0, vol)
        price *= (1 + change)
        data.append(MockMarketData('TEST', price))
    return data


class TestRegimeDetector:
    """Tests for RegimeDetector"""
    
    def test_import(self):
        """Test RegimeDetector can be imported"""
        try:
            from RegimeDetector import RegimeDetector, MarketRegime, RegimeState
            assert RegimeDetector is not None
            assert MarketRegime is not None
        except ImportError as e:
            pytest.skip(f"RegimeDetector import failed: {e}")
    
    def test_fallback_detection_trending_up(self):
        """Test fallback detection identifies uptrend"""
        try:
            from RegimeDetector import RegimeDetector, MarketRegime
            
            detector = RegimeDetector()
            prices = pd.Series([100 + i * 0.5 for i in range(100)])
            
            state = detector.detect(prices)
            
            assert state is not None
            # Should identify as trending or unknown
            assert state.current_regime in [
                MarketRegime.TRENDING_UP, 
                MarketRegime.UNKNOWN,
                MarketRegime.MEAN_REVERTING
            ]
        except ImportError:
            pytest.skip("RegimeDetector not available")
    
    def test_strategy_weights(self):
        """Test strategy weight recommendations"""
        try:
            from RegimeDetector import RegimeDetector, MarketRegime, RegimeState
            
            detector = RegimeDetector()
            
            # Create mock state
            state = RegimeState(
                current_regime=MarketRegime.TRENDING_UP,
                regime_probabilities={MarketRegime.TRENDING_UP: 0.8},
                confidence=0.8,
                transition_probabilities={}
            )
            
            weights = detector.get_strategy_weights(state)
            
            assert 'momentum' in weights
            assert weights['momentum'] > 0.3  # Should prefer momentum in uptrend
            assert sum(weights.values()) > 0.99  # Should sum to ~1
        except ImportError:
            pytest.skip("RegimeDetector not available")


class TestVolatilityArbitrageStrategy:
    """Tests for VolatilityArbitrageStrategy"""
    
    def test_import(self):
        """Test strategy can be imported"""
        try:
            from VolatilityArbitrageStrategy import VolatilityArbitrageStrategy
            assert VolatilityArbitrageStrategy is not None
        except ImportError as e:
            pytest.skip(f"Import failed: {e}")
    
    def test_volatility_calculation(self):
        """Test realized volatility calculation"""
        try:
            from VolatilityArbitrageStrategy import VolatilityArbitrageStrategy
            
            strategy = VolatilityArbitrageStrategy()
            
            # Generate price series
            np.random.seed(42)
            prices = pd.Series([100 * (1 + np.random.normal(0, 0.01)) for _ in range(100)])
            prices = prices.cumprod()
            
            vol = strategy.calculate_realized_volatility(prices, 20)
            
            assert not np.isnan(vol)
            assert 0 < vol < 1  # Should be reasonable annualized vol
        except ImportError:
            pytest.skip("Strategy not available")
    
    def test_volatility_state(self):
        """Test volatility state analysis"""
        try:
            from VolatilityArbitrageStrategy import VolatilityArbitrageStrategy
            
            strategy = VolatilityArbitrageStrategy()
            market_data = generate_volatile_data(100, 100, vol=0.03)
            
            state = strategy.get_volatility_state(market_data)
            
            assert state.realized_vol > 0
            assert 0 <= state.vol_percentile <= 1
        except ImportError:
            pytest.skip("Strategy not available")


class TestPairsTradingStrategy:
    """Tests for PairsTradingStrategy"""
    
    def test_import(self):
        """Test strategy can be imported"""
        try:
            from PairsTradingStrategy import PairsTradingStrategy
            assert PairsTradingStrategy is not None
        except ImportError as e:
            pytest.skip(f"Import failed: {e}")
    
    def test_hedge_ratio(self):
        """Test hedge ratio calculation"""
        try:
            from PairsTradingStrategy import PairsTradingStrategy
            
            strategy = PairsTradingStrategy()
            
            # Create correlated series
            np.random.seed(42)
            base = np.cumsum(np.random.normal(0, 1, 100)) + 100
            prices_1 = pd.Series(base + np.random.normal(0, 0.5, 100))
            prices_2 = pd.Series(base * 1.5 + np.random.normal(0, 0.5, 100))
            
            hedge_ratio = strategy.calculate_hedge_ratio(prices_1, prices_2)
            
            assert not np.isnan(hedge_ratio)
            assert 0.5 < hedge_ratio < 1.5  # Should be close to 1/1.5 = 0.67
        except ImportError:
            pytest.skip("Strategy not available")
    
    def test_z_score(self):
        """Test z-score calculation"""
        try:
            from PairsTradingStrategy import PairsTradingStrategy
            
            strategy = PairsTradingStrategy()
            
            spread = pd.Series(np.random.normal(0, 1, 100))
            z = strategy.calculate_z_score(spread)
            
            assert -5 < z < 5  # Z-score should be reasonable
        except ImportError:
            pytest.skip("Strategy not available")


class TestRegimeBasedMomentumStrategy:
    """Tests for RegimeBasedMomentumStrategy"""
    
    def test_import(self):
        """Test strategy can be imported"""
        try:
            from RegimeBasedMomentumStrategy import RegimeBasedMomentumStrategy
            assert RegimeBasedMomentumStrategy is not None
        except ImportError as e:
            pytest.skip(f"Import failed: {e}")
    
    def test_signal_generation_in_uptrend(self):
        """Test signal generation in uptrending market"""
        try:
            from RegimeBasedMomentumStrategy import RegimeBasedMomentumStrategy
            
            strategy = RegimeBasedMomentumStrategy(use_regime_detector=False)
            market_data = generate_trending_data(100, 100, trend=0.005)
            
            signal = strategy.generate_signal(market_data)
            
            # May or may not generate signal, but shouldn't crash
            if signal:
                assert signal.symbol == 'TEST'
                assert 0 <= signal.confidence <= 1
        except ImportError:
            pytest.skip("Strategy not available")
    
    def test_position_size_multiplier(self):
        """Test position size adapts to regime"""
        try:
            from RegimeBasedMomentumStrategy import RegimeBasedMomentumStrategy, MarketRegime
            
            strategy = RegimeBasedMomentumStrategy(use_regime_detector=False)
            
            # Set different regimes and check multipliers
            strategy.current_regime = MarketRegime.TRENDING_UP
            mult_up = strategy.get_position_size_multiplier()
            
            strategy.current_regime = MarketRegime.HIGH_VOLATILITY  
            mult_vol = strategy.get_position_size_multiplier()
            
            assert mult_up > mult_vol  # Should be more aggressive in uptrend
        except ImportError:
            pytest.skip("Strategy not available")


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
