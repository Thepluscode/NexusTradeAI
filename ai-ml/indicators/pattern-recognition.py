"""
Candlestick Pattern Recognition Module
Supports detection of various candlestick patterns
"""

from typing import List, Dict, Any, Optional, Tuple
import math


class PatternRecognition:
    """
    Candlestick pattern recognition class for detecting various trading patterns
    in OHLC (Open, High, Low, Close) price data.
    """
    
    def __init__(self):
        """Initialize the pattern recognition with an empty cache."""
        # Cache for pattern detection results
        self.pattern_cache: Dict[str, List[Dict[str, Any]]] = {}
    
    def detect_candlestick_patterns(self, opens: List[float], highs: List[float], 
                                  lows: List[float], closes: List[float]) -> List[Dict[str, Any]]:
        """
        Detect candlestick patterns in OHLC data.
        
        Args:
            opens: Array of open prices
            highs: Array of high prices
            lows: Array of low prices
            closes: Array of close prices
            
        Returns:
            List of detected patterns with their positions
        """
        cache_key = f"{len(opens)}_{len(highs)}_{len(lows)}_{len(closes)}"
        
        # Return cached result if available
        if cache_key in self.pattern_cache:
            return self.pattern_cache[cache_key]
        
        patterns = []
        
        # Need at least 3 candles for most patterns
        if len(opens) < 3 or len(highs) < 3 or len(lows) < 3 or len(closes) < 3:
            return patterns
        
        for i in range(2, len(closes)):
            current = {
                'open': opens[i], 
                'high': highs[i], 
                'low': lows[i], 
                'close': closes[i]
            }
            prev = {
                'open': opens[i-1], 
                'high': highs[i-1], 
                'low': lows[i-1], 
                'close': closes[i-1]
            }
            prev2 = {
                'open': opens[i-2], 
                'high': highs[i-2], 
                'low': lows[i-2], 
                'close': closes[i-2]
            }
            
            # Single candle patterns
            if self._is_doji(current):
                patterns.append({'index': i, 'pattern': 'doji', 'signal': 'neutral'})
            
            if self._is_hammer(current):
                patterns.append({'index': i, 'pattern': 'hammer', 'signal': 'bullish'})
            
            if self._is_shooting_star(current):
                patterns.append({'index': i, 'pattern': 'shooting_star', 'signal': 'bearish'})
            
            # Two-candle patterns
            if self._is_bullish_engulfing(prev, current):
                patterns.append({'index': i, 'pattern': 'bullish_engulfing', 'signal': 'bullish'})
            
            if self._is_bearish_engulfing(prev, current):
                patterns.append({'index': i, 'pattern': 'bearish_engulfing', 'signal': 'bearish'})
            
            if self._is_piercing_line(prev, current):
                patterns.append({'index': i, 'pattern': 'piercing_line', 'signal': 'bullish'})
            
            if self._is_dark_cloud_cover(prev, current):
                patterns.append({'index': i, 'pattern': 'dark_cloud_cover', 'signal': 'bearish'})
            
            # Three-candle patterns
            if self._is_morning_star(prev2, prev, current):
                patterns.append({'index': i, 'pattern': 'morning_star', 'signal': 'bullish'})
            
            if self._is_evening_star(prev2, prev, current):
                patterns.append({'index': i, 'pattern': 'evening_star', 'signal': 'bearish'})
            
            if self._is_three_white_soldiers(prev2, prev, current):
                patterns.append({'index': i, 'pattern': 'three_white_soldiers', 'signal': 'bullish'})
            
            if self._is_three_black_crows(prev2, prev, current):
                patterns.append({'index': i, 'pattern': 'three_black_crows', 'signal': 'bearish'})
            
            # Additional patterns
            if self._is_bullish_harami(prev, current):
                patterns.append({'index': i, 'pattern': 'bullish_harami', 'signal': 'bullish'})
            
            if self._is_bearish_harami(prev, current):
                patterns.append({'index': i, 'pattern': 'bearish_harami', 'signal': 'bearish'})
            
            if self._is_tweezer_bottom(prev, current):
                patterns.append({'index': i, 'pattern': 'tweezer_bottom', 'signal': 'bullish'})
            
            if self._is_tweezer_top(prev, current):
                patterns.append({'index': i, 'pattern': 'tweezer_top', 'signal': 'bearish'})
        
        # Cache the result
        self.pattern_cache[cache_key] = patterns
        
        return patterns
    
    def clear_cache(self) -> None:
        """Clear the pattern cache."""
        self.pattern_cache.clear()
    
    def get_pattern_statistics(self, patterns: List[Dict[str, Any]]) -> Dict[str, int]:
        """
        Get statistics about detected patterns.
        
        Args:
            patterns: List of detected patterns
            
        Returns:
            Dictionary with pattern counts
        """
        stats = {}
        for pattern in patterns:
            pattern_name = pattern['pattern']
            stats[pattern_name] = stats.get(pattern_name, 0) + 1
        return stats
    
    # Helper methods for pattern detection
    def _is_doji(self, candle: Dict[str, float], threshold: float = 0.1) -> bool:
        """Check if candle is a doji pattern."""
        body_size = abs(candle['open'] - candle['close'])
        total_size = candle['high'] - candle['low']
        return total_size > 0 and (body_size / total_size) < threshold
    
    def _is_hammer(self, candle: Dict[str, float]) -> bool:
        """Check if candle is a hammer pattern."""
        body_size = abs(candle['open'] - candle['close'])
        upper_wick = candle['high'] - max(candle['open'], candle['close'])
        lower_wick = min(candle['open'], candle['close']) - candle['low']
        
        return (lower_wick > (2 * body_size) and 
                upper_wick < (0.1 * (candle['high'] - candle['low'])))
    
    def _is_shooting_star(self, candle: Dict[str, float]) -> bool:
        """Check if candle is a shooting star pattern."""
        body_size = abs(candle['open'] - candle['close'])
        upper_wick = candle['high'] - max(candle['open'], candle['close'])
        lower_wick = min(candle['open'], candle['close']) - candle['low']
        
        return (upper_wick > (2 * body_size) and 
                lower_wick < (0.1 * (candle['high'] - candle['low'])))
    
    def _is_bullish_engulfing(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is bullish engulfing."""
        return (prev['close'] < prev['open'] and  # Previous candle is bearish
                current['close'] > current['open'] and  # Current candle is bullish
                current['open'] < prev['close'] and  # Current open below previous close
                current['close'] > prev['open'])  # Current close above previous open
    
    def _is_bearish_engulfing(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is bearish engulfing."""
        return (prev['close'] > prev['open'] and  # Previous candle is bullish
                current['close'] < current['open'] and  # Current candle is bearish
                current['open'] > prev['close'] and  # Current open above previous close
                current['close'] < prev['open'])  # Current close below previous open
    
    def _is_piercing_line(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is piercing line."""
        prev_mid = (prev['open'] + prev['close']) / 2
        return (prev['close'] < prev['open'] and  # Previous candle is bearish
                current['close'] > current['open'] and  # Current candle is bullish
                current['open'] < prev['low'] and  # Current open below previous low
                current['close'] > prev_mid and  # Current close above previous mid-point
                current['close'] < prev['open'])  # Current close below previous open
    
    def _is_dark_cloud_cover(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is dark cloud cover."""
        prev_mid = (prev['open'] + prev['close']) / 2
        return (prev['close'] > prev['open'] and  # Previous candle is bullish
                current['close'] < current['open'] and  # Current candle is bearish
                current['open'] > prev['high'] and  # Current open above previous high
                current['close'] > prev['close'] and  # Current close above previous close
                current['close'] < prev_mid)  # Current close below previous mid-point
    
    def _is_morning_star(self, prev2: Dict[str, float], prev: Dict[str, float], 
                        current: Dict[str, float]) -> bool:
        """Check if pattern is morning star."""
        # First candle is bearish
        first_candle_bearish = prev2['close'] < prev2['open']
        
        # Second candle gaps down and has small body
        second_candle_gap_down = min(prev['open'], prev['close']) < prev2['close']
        second_candle_small_body = (abs(prev['open'] - prev['close']) < 
                                   (0.1 * (prev['high'] - prev['low'])))
        
        # Third candle is bullish and closes into the first candle's body
        third_candle_bullish = current['close'] > current['open']
        third_candle_closes_in_body = current['close'] > (prev2['open'] + prev2['close']) / 2
        
        return (first_candle_bearish and second_candle_gap_down and 
                second_candle_small_body and third_candle_bullish and 
                third_candle_closes_in_body)
    
    def _is_evening_star(self, prev2: Dict[str, float], prev: Dict[str, float], 
                        current: Dict[str, float]) -> bool:
        """Check if pattern is evening star."""
        # First candle is bullish
        first_candle_bullish = prev2['close'] > prev2['open']
        
        # Second candle gaps up and has small body
        second_candle_gap_up = max(prev['open'], prev['close']) > prev2['close']
        second_candle_small_body = (abs(prev['open'] - prev['close']) < 
                                   (0.1 * (prev['high'] - prev['low'])))
        
        # Third candle is bearish and closes into the first candle's body
        third_candle_bearish = current['close'] < current['open']
        third_candle_closes_in_body = current['close'] < (prev2['open'] + prev2['close']) / 2
        
        return (first_candle_bullish and second_candle_gap_up and 
                second_candle_small_body and third_candle_bearish and 
                third_candle_closes_in_body)
    
    def _is_three_white_soldiers(self, prev2: Dict[str, float], prev: Dict[str, float], 
                                current: Dict[str, float]) -> bool:
        """Check if pattern is three white soldiers."""
        # All three candles are bullish
        all_bullish = (prev2['close'] > prev2['open'] and 
                      prev['close'] > prev['open'] and 
                      current['close'] > current['open'])
        
        # Each candle opens within the previous candle's body
        proper_opens = (prev2['close'] < prev['open'] and 
                       prev['open'] < prev['close'] and 
                       prev['close'] < current['open'])
        
        # Each close is higher than the previous close
        higher_closes = (prev2['close'] < prev['close'] and 
                        prev['close'] < current['close'])
        
        return all_bullish and proper_opens and higher_closes
    
    def _is_three_black_crows(self, prev2: Dict[str, float], prev: Dict[str, float], 
                             current: Dict[str, float]) -> bool:
        """Check if pattern is three black crows."""
        # All three candles are bearish
        all_bearish = (prev2['close'] < prev2['open'] and 
                      prev['close'] < prev['open'] and 
                      current['close'] < current['open'])
        
        # Each candle opens within the previous candle's body
        proper_opens = (prev2['close'] > prev['open'] and 
                       prev['open'] > prev['close'] and 
                       prev['close'] > current['open'])
        
        # Each close is lower than the previous close
        lower_closes = (prev2['close'] > prev['close'] and 
                       prev['close'] > current['close'])
        
        return all_bearish and proper_opens and lower_closes
    
    def _is_bullish_harami(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is bullish harami."""
        # Previous candle is bearish and large
        prev_bearish = prev['close'] < prev['open']
        prev_large = abs(prev['open'] - prev['close']) > (prev['high'] - prev['low']) * 0.6
        
        # Current candle is small and within previous candle's body
        current_small = (abs(current['open'] - current['close']) < 
                        (current['high'] - current['low']) * 0.4)
        within_prev_body = (current['high'] < prev['open'] and 
                           current['low'] > prev['close'])
        
        return prev_bearish and prev_large and current_small and within_prev_body
    
    def _is_bearish_harami(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is bearish harami."""
        # Previous candle is bullish and large
        prev_bullish = prev['close'] > prev['open']
        prev_large = abs(prev['open'] - prev['close']) > (prev['high'] - prev['low']) * 0.6
        
        # Current candle is small and within previous candle's body
        current_small = (abs(current['open'] - current['close']) < 
                        (current['high'] - current['low']) * 0.4)
        within_prev_body = (current['high'] < prev['close'] and 
                           current['low'] > prev['open'])
        
        return prev_bullish and prev_large and current_small and within_prev_body
    
    def _is_tweezer_bottom(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is tweezer bottom."""
        # Both candles have similar lows
        similar_lows = (abs(prev['low'] - current['low']) < 
                       (prev['high'] - prev['low']) * 0.05)
        
        # First candle is bearish, second is bullish
        first_bearish = prev['close'] < prev['open']
        second_bullish = current['close'] > current['open']
        
        return similar_lows and first_bearish and second_bullish
    
    def _is_tweezer_top(self, prev: Dict[str, float], current: Dict[str, float]) -> bool:
        """Check if pattern is tweezer top."""
        # Both candles have similar highs
        similar_highs = (abs(prev['high'] - current['high']) < 
                        (prev['high'] - prev['low']) * 0.05)
        
        # First candle is bullish, second is bearish
        first_bullish = prev['close'] > prev['open']
        second_bearish = current['close'] < current['open']
        
        return similar_highs and first_bullish and second_bearish
    
    def get_available_patterns(self) -> List[str]:
        """Get list of all available pattern types."""
        return [
            'doji', 'hammer', 'shooting_star',
            'bullish_engulfing', 'bearish_engulfing',
            'piercing_line', 'dark_cloud_cover',
            'morning_star', 'evening_star',
            'three_white_soldiers', 'three_black_crows',
            'bullish_harami', 'bearish_harami',
            'tweezer_bottom', 'tweezer_top'
        ]
    
    def filter_patterns_by_signal(self, patterns: List[Dict[str, Any]], 
                                 signal: str) -> List[Dict[str, Any]]:
        """
        Filter patterns by signal type.
        
        Args:
            patterns: List of detected patterns
            signal: Signal type ('bullish', 'bearish', 'neutral')
            
        Returns:
            Filtered list of patterns
        """
        return [p for p in patterns if p['signal'] == signal]
    
    def get_pattern_strength(self, pattern: Dict[str, Any]) -> str:
        """
        Get the strength classification of a pattern.
        
        Args:
            pattern: Pattern dictionary
            
        Returns:
            Strength classification ('strong', 'moderate', 'weak')
        """
        strong_patterns = [
            'bullish_engulfing', 'bearish_engulfing',
            'morning_star', 'evening_star',
            'three_white_soldiers', 'three_black_crows'
        ]
        
        moderate_patterns = [
            'hammer', 'shooting_star',
            'piercing_line', 'dark_cloud_cover',
            'bullish_harami', 'bearish_harami'
        ]
        
        pattern_name = pattern['pattern']
        
        if pattern_name in strong_patterns:
            return 'strong'
        elif pattern_name in moderate_patterns:
            return 'moderate'
        else:
            return 'weak'


# Convenience function for quick pattern detection
def detect_patterns(opens: List[float], highs: List[float], 
                   lows: List[float], closes: List[float]) -> List[Dict[str, Any]]:
    """
    Convenience function to detect patterns without creating a class instance.
    
    Args:
        opens: Array of open prices
        highs: Array of high prices
        lows: Array of low prices
        closes: Array of close prices
        
    Returns:
        List of detected patterns
    """
    recognizer = PatternRecognition()
    return recognizer.detect_candlestick_patterns(opens, highs, lows, closes)


if __name__ == "__main__":
    # Example usage
    import random
    
    # Generate sample OHLC data
    n = 100
    opens = [100 + random.uniform(-2, 2) for _ in range(n)]
    closes = [opens[i] + random.uniform(-3, 3) for i in range(n)]
    highs = [max(opens[i], closes[i]) + random.uniform(0, 2) for i in range(n)]
    lows = [min(opens[i], closes[i]) - random.uniform(0, 2) for i in range(n)]
    
    # Detect patterns
    recognizer = PatternRecognition()
    patterns = recognizer.detect_candlestick_patterns(opens, highs, lows, closes)
    
    print(f"Detected {len(patterns)} patterns:")
    for pattern in patterns[:10]:  # Show first 10 patterns
        strength = recognizer.get_pattern_strength(pattern)
        print(f"Index {pattern['index']}: {pattern['pattern']} "
              f"({pattern['signal']}, {strength})")
    
    # Get statistics
    stats = recognizer.get_pattern_statistics(patterns)
    print(f"\nPattern statistics: {stats}")
