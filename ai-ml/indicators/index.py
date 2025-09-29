"""
NexusTradeAI Technical Indicators Library
Main entry point for all technical indicators and utilities
"""

from typing import Any, Callable, Dict, List, Optional, Union
import sys
from pathlib import Path

# Add current directory to path for relative imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Core indicators
from technical_indicators import TechnicalIndicators
from pattern_recognition import PatternRecognition
import performance_utils

# Package metadata
__version__ = '1.0.0'
__description__ = 'NexusTradeAI Technical Indicators Library'
__author__ = 'NexusTradeAI'

class NexusTradeAI:
    """
    Main class that provides access to all technical indicators and pattern recognition.
    This class acts as a facade for the entire library.
    """
    
    def __init__(self):
        """Initialize default instances of core classes."""
        self.indicators = TechnicalIndicators()
        self.pattern_recognition = PatternRecognition()
        self.performance_utils = performance_utils
    
    # Trend Indicators
    def sma(self, *args, **kwargs):
        """Simple Moving Average - delegates to indicators instance."""
        return self.indicators.sma(*args, **kwargs)
    
    def ema(self, *args, **kwargs):
        """Exponential Moving Average - delegates to indicators instance."""
        return self.indicators.ema(*args, **kwargs)
    
    # Momentum Indicators
    def rsi(self, *args, **kwargs):
        """Relative Strength Index - delegates to indicators instance."""
        return self.indicators.rsi(*args, **kwargs)
    
    def macd(self, *args, **kwargs):
        """MACD - delegates to indicators instance."""
        return self.indicators.macd(*args, **kwargs)
    
    def stochastic(self, *args, **kwargs):
        """Stochastic Oscillator - delegates to indicators instance."""
        return self.indicators.stochastic(*args, **kwargs)
    
    def cmo(self, *args, **kwargs):
        """Chande Momentum Oscillator - delegates to indicators instance."""
        return self.indicators.cmo(*args, **kwargs)
    
    # Volatility Indicators
    def bollinger_bands(self, *args, **kwargs):
        """Bollinger Bands - delegates to indicators instance."""
        return self.indicators.bollinger_bands(*args, **kwargs)
    
    def atr(self, *args, **kwargs):
        """Average True Range - delegates to indicators instance."""
        return self.indicators.atr(*args, **kwargs)
    
    def keltner_channels(self, *args, **kwargs):
        """Keltner Channels - delegates to indicators instance."""
        return self.indicators.keltner_channels(*args, **kwargs)
    
    # Trend Following
    def supertrend(self, *args, **kwargs):
        """Supertrend - delegates to indicators instance."""
        return self.indicators.supertrend(*args, **kwargs)
    
    def ichimoku(self, *args, **kwargs):
        """Ichimoku Cloud - delegates to indicators instance."""
        return self.indicators.ichimoku(*args, **kwargs)
    
    def parabolic_sar(self, *args, **kwargs):
        """Parabolic SAR - delegates to indicators instance."""
        return self.indicators.parabolic_sar(*args, **kwargs)
    
    # Volume
    def volume_profile(self, *args, **kwargs):
        """Volume Profile - delegates to indicators instance."""
        return self.indicators.volume_profile(*args, **kwargs)
    
    # Support & Resistance
    def fibonacci_retracement(self, *args, **kwargs):
        """Fibonacci Retracement - delegates to indicators instance."""
        return self.indicators.fibonacci_retracement(*args, **kwargs)
    
    def pivot_points(self, *args, **kwargs):
        """Pivot Points - delegates to indicators instance."""
        return self.indicators.pivot_points(*args, **kwargs)
    
    # Other
    def demarker(self, *args, **kwargs):
        """DeMarker - delegates to indicators instance."""
        return self.indicators.demarker(*args, **kwargs)
    
    def cci(self, *args, **kwargs):
        """Commodity Channel Index - delegates to indicators instance."""
        return self.indicators.cci(*args, **kwargs)
    
    # Pattern Recognition
    def detect_candlestick_patterns(self, *args, **kwargs):
        """Detect Candlestick Patterns - delegates to pattern recognition instance."""
        return self.pattern_recognition.detect_candlestick_patterns(*args, **kwargs)
    
    # Combined Analysis
    def calculate_all_indicators(self, *args, **kwargs):
        """Calculate All Indicators - delegates to indicators instance."""
        return self.indicators.calculate_all_indicators(*args, **kwargs)
    
    # Utility methods
    def get_available_indicators(self) -> List[str]:
        """Get list of all available indicator methods."""
        indicator_methods = [method for method in dir(self.indicators) 
                           if not method.startswith('_') and callable(getattr(self.indicators, method))]
        pattern_methods = [method for method in dir(self.pattern_recognition) 
                         if not method.startswith('_') and callable(getattr(self.pattern_recognition, method))]
        return sorted(indicator_methods + pattern_methods)
    
    def get_version_info(self) -> Dict[str, str]:
        """Get version and package information."""
        return {
            'version': __version__,
            'description': __description__,
            'author': __author__
        }

# Create default instances
_default_nexus = NexusTradeAI()
indicators = _default_nexus.indicators
pattern_recognition = _default_nexus.pattern_recognition

# Direct function access (delegates to default instances)
# Trend Indicators
def sma(*args, **kwargs):
    """Simple Moving Average"""
    return _default_nexus.sma(*args, **kwargs)

def ema(*args, **kwargs):
    """Exponential Moving Average"""
    return _default_nexus.ema(*args, **kwargs)

# Momentum Indicators
def rsi(*args, **kwargs):
    """Relative Strength Index"""
    return _default_nexus.rsi(*args, **kwargs)

def macd(*args, **kwargs):
    """MACD"""
    return _default_nexus.macd(*args, **kwargs)

def stochastic(*args, **kwargs):
    """Stochastic Oscillator"""
    return _default_nexus.stochastic(*args, **kwargs)

def cmo(*args, **kwargs):
    """Chande Momentum Oscillator"""
    return _default_nexus.cmo(*args, **kwargs)

# Volatility Indicators
def bollinger_bands(*args, **kwargs):
    """Bollinger Bands"""
    return _default_nexus.bollinger_bands(*args, **kwargs)

def atr(*args, **kwargs):
    """Average True Range"""
    return _default_nexus.atr(*args, **kwargs)

def keltner_channels(*args, **kwargs):
    """Keltner Channels"""
    return _default_nexus.keltner_channels(*args, **kwargs)

# Trend Following
def supertrend(*args, **kwargs):
    """Supertrend"""
    return _default_nexus.supertrend(*args, **kwargs)

def ichimoku(*args, **kwargs):
    """Ichimoku Cloud"""
    return _default_nexus.ichimoku(*args, **kwargs)

def parabolic_sar(*args, **kwargs):
    """Parabolic SAR"""
    return _default_nexus.parabolic_sar(*args, **kwargs)

# Volume
def volume_profile(*args, **kwargs):
    """Volume Profile"""
    return _default_nexus.volume_profile(*args, **kwargs)

# Support & Resistance
def fibonacci_retracement(*args, **kwargs):
    """Fibonacci Retracement"""
    return _default_nexus.fibonacci_retracement(*args, **kwargs)

def pivot_points(*args, **kwargs):
    """Pivot Points"""
    return _default_nexus.pivot_points(*args, **kwargs)

# Other
def demarker(*args, **kwargs):
    """DeMarker"""
    return _default_nexus.demarker(*args, **kwargs)

def cci(*args, **kwargs):
    """Commodity Channel Index"""
    return _default_nexus.cci(*args, **kwargs)

# Pattern Recognition
def detect_candlestick_patterns(*args, **kwargs):
    """Detect Candlestick Patterns"""
    return _default_nexus.detect_candlestick_patterns(*args, **kwargs)

# Combined Analysis
def calculate_all_indicators(*args, **kwargs):
    """Calculate All Indicators"""
    return _default_nexus.calculate_all_indicators(*args, **kwargs)

# Convenience functions
def get_available_indicators() -> List[str]:
    """Get list of all available indicator functions."""
    return _default_nexus.get_available_indicators()

def get_version_info() -> Dict[str, str]:
    """Get version and package information."""
    return _default_nexus.get_version_info()

# Export all classes and functions
__all__ = [
    # Core classes
    'TechnicalIndicators',
    'PatternRecognition',
    'NexusTradeAI',
    
    # Default instances
    'indicators',
    'pattern_recognition',
    
    # Performance utilities
    'performance_utils',
    
    # Trend Indicators
    'sma',
    'ema',
    
    # Momentum Indicators
    'rsi',
    'macd',
    'stochastic',
    'cmo',
    
    # Volatility Indicators
    'bollinger_bands',
    'atr',
    'keltner_channels',
    
    # Trend Following
    'supertrend',
    'ichimoku',
    'parabolic_sar',
    
    # Volume
    'volume_profile',
    
    # Support & Resistance
    'fibonacci_retracement',
    'pivot_points',
    
    # Other
    'demarker',
    'cci',
    
    # Pattern Recognition
    'detect_candlestick_patterns',
    
    # Combined Analysis
    'calculate_all_indicators',
    
    # Utility functions
    'get_available_indicators',
    'get_version_info',
]

# Alternative import style for backward compatibility with JavaScript naming
class JSCompatibility:
    """Provides JavaScript-style naming for backward compatibility."""
    
    @staticmethod
    def bollingerBands(*args, **kwargs):
        return bollinger_bands(*args, **kwargs)
    
    @staticmethod
    def keltnerChannels(*args, **kwargs):
        return keltner_channels(*args, **kwargs)
    
    @staticmethod
    def parabolicSAR(*args, **kwargs):
        return parabolic_sar(*args, **kwargs)
    
    @staticmethod
    def volumeProfile(*args, **kwargs):
        return volume_profile(*args, **kwargs)
    
    @staticmethod
    def fibonacciRetracement(*args, **kwargs):
        return fibonacci_retracement(*args, **kwargs)
    
    @staticmethod
    def pivotPoints(*args, **kwargs):
        return pivot_points(*args, **kwargs)
    
    @staticmethod
    def detectCandlestickPatterns(*args, **kwargs):
        return detect_candlestick_patterns(*args, **kwargs)
    
    @staticmethod
    def calculateAllIndicators(*args, **kwargs):
        return calculate_all_indicators(*args, **kwargs)

# Create JS compatibility instance
js_compat = JSCompatibility()

# Add JS-style names to module level
bollingerBands = js_compat.bollingerBands
keltnerChannels = js_compat.keltnerChannels
parabolicSAR = js_compat.parabolicSAR
volumeProfile = js_compat.volumeProfile
fibonacciRetracement = js_compat.fibonacciRetracement
pivotPoints = js_compat.pivotPoints
detectCandlestickPatterns = js_compat.detectCandlestickPatterns
calculateAllIndicators = js_compat.calculateAllIndicators

# Module info
version = __version__
description = __description__
