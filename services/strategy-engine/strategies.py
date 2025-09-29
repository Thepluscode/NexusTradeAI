"""
NexusTradeAI - Trading Strategy Implementations
==============================================

Collection of specific trading strategy implementations.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime

from strategy_framework import (
    BaseStrategy, TradingSignal, MarketData, SignalType, 
    StrategyType, TechnicalIndicators
)

class RSIMeanReversionStrategy(BaseStrategy):
    """
    RSI-based Mean Reversion Strategy
    Buys when RSI is oversold, sells when overbought
    """
    
    def __init__(self, rsi_period: int = 14, oversold: int = 30, overbought: int = 70):
        super().__init__(
            name=f"RSI_MeanReversion_{rsi_period}",
            strategy_type=StrategyType.MEAN_REVERSION,
            parameters={
                'rsi_period': rsi_period,
                'oversold_threshold': oversold,
                'overbought_threshold': overbought,
                'bollinger_confirmation': True
            }
        )
    
    def generate_signal(self, market_data: List[MarketData]) -> Optional[TradingSignal]:
        if len(market_data) < max(self.parameters['rsi_period'], 20):
            return None
        
        df = pd.DataFrame([data.to_dict() for data in market_data])
        closes = df['close'].values
        
        # Calculate RSI
        rsi = TechnicalIndicators.rsi(closes, self.parameters['rsi_period'])
        current_rsi = rsi[-1]
        
        signal_type = None
        confidence = 0.0
        
        # Oversold condition
        if current_rsi < self.parameters['oversold_threshold']:
            signal_type = SignalType.BUY
            # Higher confidence for more extreme oversold conditions
            confidence = 0.5 + (self.parameters['oversold_threshold'] - current_rsi) / 100
        
        # Overbought condition
        elif current_rsi > self.parameters['overbought_threshold']:
            signal_type = SignalType.SELL
            # Higher confidence for more extreme overbought conditions
            confidence = 0.5 + (current_rsi - self.parameters['overbought_threshold']) / 100
        
        if signal_type is None:
            return None
        
        # Bollinger Bands confirmation
        if self.parameters['bollinger_confirmation']:
            upper, middle, lower = TechnicalIndicators.bollinger_bands(closes)
            current_price = closes[-1]
            
            if signal_type == SignalType.BUY and current_price < lower[-1]:
                confidence += 0.2
            elif signal_type == SignalType.SELL and current_price > upper[-1]:
                confidence += 0.2
        
        current_price = closes[-1]
        stop_loss = current_price * 0.97 if signal_type == SignalType.BUY else current_price * 1.03
        take_profit = current_price * 1.06 if signal_type == SignalType.BUY else current_price * 0.94
        
        return TradingSignal(
            symbol=market_data[-1].symbol,
            signal_type=signal_type,
            confidence=min(confidence, 1.0),
            entry_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            metadata={'rsi': current_rsi}
        )
    
    def validate_signal(self, signal: TradingSignal, current_price: float) -> bool:
        return signal.confidence > 0.6  # Only execute high-confidence signals

class MomentumBreakoutStrategy(BaseStrategy):
    """
    Momentum Breakout Strategy
    Identifies breakouts with volume confirmation
    """
    
    def __init__(self, period: int = 20, volume_multiplier: float = 1.5):
        super().__init__(
            name=f"Momentum_Breakout_{period}",
            strategy_type=StrategyType.MOMENTUM,
            parameters={
                'period': period,
                'volume_multiplier': volume_multiplier,
                'atr_multiplier': 2.0
            }
        )
    
    def generate_signal(self, market_data: List[MarketData]) -> Optional[TradingSignal]:
        if len(market_data) < self.parameters['period']:
            return None
        
        df = pd.DataFrame([data.to_dict() for data in market_data])
        highs = df['high'].values
        lows = df['low'].values
        closes = df['close'].values
        volumes = df['volume'].values
        
        # Calculate resistance and support levels
        resistance = np.max(highs[-self.parameters['period']:])
        support = np.min(lows[-self.parameters['period']:])
        
        current_price = closes[-1]
        current_volume = volumes[-1]
        avg_volume = np.mean(volumes[-self.parameters['period']:])
        
        # Calculate ATR for stop loss
        atr = TechnicalIndicators.atr(highs, lows, closes)[-1]
        
        signal_type = None
        confidence = 0.0
        
        # Breakout above resistance with volume
        if (current_price > resistance and 
            current_volume > avg_volume * self.parameters['volume_multiplier']):
            signal_type = SignalType.BUY
            confidence = 0.7
            
            # Higher confidence for stronger breakouts
            breakout_strength = (current_price - resistance) / resistance
            confidence += min(breakout_strength * 10, 0.2)
        
        # Breakdown below support with volume
        elif (current_price < support and 
              current_volume > avg_volume * self.parameters['volume_multiplier']):
            signal_type = SignalType.SELL
            confidence = 0.7
            
            # Higher confidence for stronger breakdowns
            breakdown_strength = (support - current_price) / support
            confidence += min(breakdown_strength * 10, 0.2)
        
        if signal_type is None:
            return None
        
        # Set stop loss using ATR
        atr_distance = atr * self.parameters['atr_multiplier']
        stop_loss = (current_price - atr_distance if signal_type == SignalType.BUY 
                    else current_price + atr_distance)
        take_profit = (current_price + atr_distance * 2 if signal_type == SignalType.BUY
                      else current_price - atr_distance * 2)
        
        return TradingSignal(
            symbol=market_data[-1].symbol,
            signal_type=signal_type,
            confidence=min(confidence, 1.0),
            entry_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            metadata={
                'resistance': resistance,
                'support': support,
                'volume_ratio': current_volume / avg_volume,
                'atr': atr
            }
        )
    
    def validate_signal(self, signal: TradingSignal, current_price: float) -> bool:
        # Validate that the breakout is still valid
        if signal.entry_price is None:
            return False
        
        # Check if price is still in breakout direction
        if signal.signal_type == SignalType.BUY:
            return current_price >= signal.entry_price * 0.998  # Allow 0.2% pullback
        else:
            return current_price <= signal.entry_price * 1.002  # Allow 0.2% bounce

class ScalpingStrategy(BaseStrategy):
    """
    High-frequency scalping strategy for quick profits
    """
    
    def __init__(self, fast_ema: int = 5, slow_ema: int = 13):
        super().__init__(
            name=f"Scalping_EMA_{fast_ema}_{slow_ema}",
            strategy_type=StrategyType.SCALPING,
            parameters={
                'fast_ema': fast_ema,
                'slow_ema': slow_ema,
                'min_spread': 0.001,  # Minimum 0.1% spread
                'max_hold_time': 300,  # 5 minutes max hold time
                'volume_threshold': 1.2
            }
        )
    
    def generate_signal(self, market_data: List[MarketData]) -> Optional[TradingSignal]:
        if len(market_data) < self.parameters['slow_ema']:
            return None
        
        df = pd.DataFrame([data.to_dict() for data in market_data])
        closes = df['close'].values
        volumes = df['volume'].values
        
        # Calculate EMAs
        fast_ema = TechnicalIndicators.ema(closes, self.parameters['fast_ema'])
        slow_ema = TechnicalIndicators.ema(closes, self.parameters['slow_ema'])
        
        current_price = closes[-1]
        current_volume = volumes[-1]
        avg_volume = np.mean(volumes[-10:])  # Short-term volume average
        
        # Check for EMA crossover
        signal_type = None
        confidence = 0.0
        
        # Fast EMA above slow EMA (bullish)
        if fast_ema[-1] > slow_ema[-1] and fast_ema[-2] <= slow_ema[-2]:
            signal_type = SignalType.BUY
            confidence = 0.6
        
        # Fast EMA below slow EMA (bearish)
        elif fast_ema[-1] < slow_ema[-1] and fast_ema[-2] >= slow_ema[-2]:
            signal_type = SignalType.SELL
            confidence = 0.6
        
        if signal_type is None:
            return None
        
        # Volume confirmation
        volume_ratio = current_volume / avg_volume
        if volume_ratio > self.parameters['volume_threshold']:
            confidence += 0.2
        
        # Tight stop-loss and take-profit for scalping
        spread = self.parameters['min_spread']
        stop_loss = current_price * (1 - spread) if signal_type == SignalType.BUY else current_price * (1 + spread)
        take_profit = current_price * (1 + spread * 2) if signal_type == SignalType.BUY else current_price * (1 - spread * 2)
        
        return TradingSignal(
            symbol=market_data[-1].symbol,
            signal_type=signal_type,
            confidence=min(confidence, 1.0),
            entry_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            metadata={
                'fast_ema': fast_ema[-1],
                'slow_ema': slow_ema[-1],
                'volume_ratio': volume_ratio,
                'max_hold_time': self.parameters['max_hold_time']
            }
        )
    
    def validate_signal(self, signal: TradingSignal, current_price: float) -> bool:
        # Quick validation for scalping
        if signal.entry_price is None:
            return False
        
        # Check if signal is still fresh (within 1 minute)
        time_diff = (datetime.now() - signal.timestamp).total_seconds()
        if time_diff > 60:  # 1 minute
            return False
        
        # Price shouldn't have moved too much
        price_change = abs(current_price - signal.entry_price) / signal.entry_price
        return price_change < 0.005  # Less than 0.5% price change

class AIEnhancedStrategy(BaseStrategy):
    """
    AI-Enhanced Trading Strategy
    Combines multiple indicators with machine learning predictions
    """

    def __init__(self, model_path: Optional[str] = None):
        super().__init__(
            name="AI_Enhanced_Multi_Factor",
            strategy_type=StrategyType.AI_POWERED,
            parameters={
                'feature_window': 50,
                'confidence_threshold': 0.6,
                'ensemble_weight': 0.4,  # Weight for AI vs technical indicators
                'volatility_adjustment': True
            }
        )
        self.model = None  # Placeholder for ML model
        self.feature_scaler = None

    def extract_features(self, market_data: List[MarketData]) -> np.ndarray:
        """Extract features for ML model"""
        if len(market_data) < self.parameters['feature_window']:
            return None

        df = pd.DataFrame([data.to_dict() for data in market_data])
        closes = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        volumes = df['volume'].values

        features = []

        # Price-based features
        returns = np.diff(closes) / closes[:-1]
        features.extend([
            np.mean(returns[-10:]),  # 10-period return
            np.std(returns[-10:]),   # 10-period volatility
            np.mean(returns[-20:]),  # 20-period return
            np.std(returns[-20:])    # 20-period volatility
        ])

        # Technical indicators
        rsi = TechnicalIndicators.rsi(closes)[-1]
        features.append((rsi - 50) / 50)  # Normalized RSI

        macd, macd_signal, macd_hist = TechnicalIndicators.macd(closes)
        features.extend([
            macd[-1] / closes[-1],  # Normalized MACD
            macd_hist[-1] / closes[-1]  # Normalized MACD histogram
        ])

        # Volume features
        volume_ratio = volumes[-1] / np.mean(volumes[-20:])
        features.append(np.log(volume_ratio))  # Log volume ratio

        # Bollinger Bands position
        upper, middle, lower = TechnicalIndicators.bollinger_bands(closes)
        bb_position = (closes[-1] - lower[-1]) / (upper[-1] - lower[-1])
        features.append(bb_position)

        # ATR-based volatility
        atr = TechnicalIndicators.atr(highs, lows, closes)[-1]
        atr_ratio = atr / closes[-1]
        features.append(atr_ratio)

        return np.array(features)

    def get_technical_signal(self, market_data: List[MarketData]) -> Tuple[SignalType, float]:
        """Get signal from traditional technical analysis"""
        if len(market_data) < 50:
            return SignalType.HOLD, 0.0

        df = pd.DataFrame([data.to_dict() for data in market_data])
        closes = df['close'].values

        # Combine multiple technical signals
        signals = []
        confidences = []

        # RSI signal
        rsi = TechnicalIndicators.rsi(closes)[-1]
        if rsi < 30:
            signals.append(SignalType.BUY)
            confidences.append(0.7)
        elif rsi > 70:
            signals.append(SignalType.SELL)
            confidences.append(0.7)

        # MACD signal
        macd, macd_signal, macd_hist = TechnicalIndicators.macd(closes)
        if macd_hist[-1] > 0 and macd_hist[-2] <= 0:  # MACD crossover
            signals.append(SignalType.BUY)
            confidences.append(0.6)
        elif macd_hist[-1] < 0 and macd_hist[-2] >= 0:
            signals.append(SignalType.SELL)
            confidences.append(0.6)

        # Moving average signal
        sma_20 = TechnicalIndicators.sma(closes, 20)[-1]
        sma_50 = TechnicalIndicators.sma(closes, 50)[-1]
        if sma_20 > sma_50:
            signals.append(SignalType.BUY)
            confidences.append(0.5)
        else:
            signals.append(SignalType.SELL)
            confidences.append(0.5)

        if not signals:
            return SignalType.HOLD, 0.0

        # Aggregate signals
        buy_weight = sum(conf for sig, conf in zip(signals, confidences) if sig == SignalType.BUY)
        sell_weight = sum(conf for sig, conf in zip(signals, confidences) if sig == SignalType.SELL)

        if buy_weight > sell_weight:
            return SignalType.BUY, buy_weight / len(signals)
        elif sell_weight > buy_weight:
            return SignalType.SELL, sell_weight / len(signals)
        else:
            return SignalType.HOLD, 0.0

    def generate_signal(self, market_data: List[MarketData]) -> Optional[TradingSignal]:
        features = self.extract_features(market_data)
        if features is None:
            return None

        # Get technical analysis signal
        tech_signal, tech_confidence = self.get_technical_signal(market_data)

        # Simulate AI prediction (replace with actual ML model)
        ai_prediction = self._simulate_ai_prediction(features)
        ai_signal, ai_confidence = ai_prediction

        # Ensemble prediction
        ensemble_weight = self.parameters['ensemble_weight']
        if tech_signal == ai_signal:
            # Both agree - high confidence
            final_signal = tech_signal
            final_confidence = (tech_confidence * (1 - ensemble_weight) +
                              ai_confidence * ensemble_weight) * 1.2  # Boost for agreement
        elif tech_signal == SignalType.HOLD:
            # Use AI signal
            final_signal = ai_signal
            final_confidence = ai_confidence * ensemble_weight
        elif ai_signal == SignalType.HOLD:
            # Use technical signal
            final_signal = tech_signal
            final_confidence = tech_confidence * (1 - ensemble_weight)
        else:
            # Conflict - be cautious
            final_signal = SignalType.HOLD
            final_confidence = 0.0

        if (final_signal == SignalType.HOLD or
            final_confidence < self.parameters['confidence_threshold']):
            return None

        # Adjust for volatility
        if self.parameters['volatility_adjustment']:
            df = pd.DataFrame([data.to_dict() for data in market_data])
            closes = df['close'].values
            volatility = np.std(np.diff(closes) / closes[:-1])

            # Reduce confidence in high volatility environments
            if volatility > 0.05:  # 5% daily volatility
                final_confidence *= 0.8

        current_price = market_data[-1].close

        # Dynamic stop loss based on volatility
        df = pd.DataFrame([data.to_dict() for data in market_data])
        atr = TechnicalIndicators.atr(df['high'].values, df['low'].values, df['close'].values)[-1]

        if final_signal == SignalType.BUY:
            stop_loss = current_price - (atr * 2)
            take_profit = current_price + (atr * 3)
        else:
            stop_loss = current_price + (atr * 2)
            take_profit = current_price - (atr * 3)

        return TradingSignal(
            symbol=market_data[-1].symbol,
            signal_type=final_signal,
            confidence=min(final_confidence, 1.0),
            entry_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            metadata={
                'technical_signal': tech_signal.value,
                'technical_confidence': tech_confidence,
                'ai_signal': ai_signal.value,
                'ai_confidence': ai_confidence,
                'features': features.tolist()
            }
        )

    def _simulate_ai_prediction(self, features: np.ndarray) -> Tuple[SignalType, float]:
        """
        Simulate AI model prediction (replace with actual model inference)
        """
        # Simple simulation based on feature values
        feature_sum = np.sum(features)

        if feature_sum > 0.5:
            return SignalType.BUY, 0.8
        elif feature_sum < -0.5:
            return SignalType.SELL, 0.8
        else:
            return SignalType.HOLD, 0.3

    def validate_signal(self, signal: TradingSignal, current_price: float) -> bool:
        return signal.confidence > self.parameters['confidence_threshold']
