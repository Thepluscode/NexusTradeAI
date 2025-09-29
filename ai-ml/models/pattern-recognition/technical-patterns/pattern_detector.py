"""
Technical pattern detection for financial time series data.

This module detects various technical patterns in price data that are commonly used in technical analysis.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional
import logging
from scipy.signal import find_peaks, argrelextrema
from sklearn.preprocessing import StandardScaler
import talib

class TechnicalPatternDetector:
    """
    Advanced technical pattern detection for financial markets
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize pattern detector
        
        Args:
            config: Pattern detection configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Pattern detection parameters
        self.min_pattern_length = config.get('min_pattern_length', 20)
        self.max_pattern_length = config.get('max_pattern_length', 100)
        self.price_tolerance = config.get('price_tolerance', 0.02)  # 2% tolerance
        self.volume_threshold = config.get('volume_threshold', 0.5)
        
        # Pattern confidence thresholds
        self.confidence_thresholds = config.get('confidence_thresholds', {
            'high': 0.8,
            'medium': 0.6,
            'low': 0.4
        })
    
    def detect_patterns(self, df: pd.DataFrame) -> Dict[str, List[Dict]]:
        """
        Detect all technical patterns in price data
        
        Args:
            df: OHLCV DataFrame
            
        Returns:
            Dictionary of detected patterns by type
        """
        patterns = {
            'head_and_shoulders': [],
            'double_top': [],
            'double_bottom': [],
            'triangle': [],
            'wedge': [],
            'channel': [],
            'flag': [],
            'pennant': [],
            'cup_and_handle': [],
            'rounding_bottom': []
        }
        
        # Detect each pattern type
        patterns['head_and_shoulders'] = self.detect_head_and_shoulders(df)
        patterns['double_top'] = self.detect_double_top(df)
        patterns['double_bottom'] = self.detect_double_bottom(df)
        patterns['triangle'] = self.detect_triangles(df)
        patterns['wedge'] = self.detect_wedges(df)
        patterns['channel'] = self.detect_channels(df)
        patterns['flag'] = self.detect_flags(df)
        patterns['pennant'] = self.detect_pennants(df)
        patterns['cup_and_handle'] = self.detect_cup_and_handle(df)
        patterns['rounding_bottom'] = self.detect_rounding_bottom(df)
        
        return patterns
    
    def detect_head_and_shoulders(self, df: pd.DataFrame) -> List[Dict]:
        """Detect head and shoulders patterns"""
        patterns = []
        prices = df['close'].values
        
        # Find peaks and valleys
        peaks, _ = find_peaks(prices, distance=self.min_pattern_length//3)
        valleys, _ = find_peaks(-prices, distance=self.min_pattern_length//3)
        
        # Look for head and shoulders pattern
        for i in range(len(peaks) - 2):
            left_shoulder = peaks[i]
            head = peaks[i + 1]
            right_shoulder = peaks[i + 2]
            
            # Find valleys between peaks
            left_valley = None
            right_valley = None
            
            for v in valleys:
                if left_shoulder < v < head and left_valley is None:
                    left_valley = v
                elif head < v < right_shoulder and right_valley is None:
                    right_valley = v
            
            if left_valley is not None and right_valley is not None:
                # Check pattern criteria
                left_shoulder_price = prices[left_shoulder]
                head_price = prices[head]
                right_shoulder_price = prices[right_shoulder]
                
                # Head should be higher than shoulders
                if (head_price > left_shoulder_price and 
                    head_price > right_shoulder_price):
                    
                    # Shoulders should be roughly equal
                    shoulder_diff = abs(left_shoulder_price - right_shoulder_price) / head_price
                    
                    if shoulder_diff < self.price_tolerance:
                        # Calculate neckline
                        neckline_price = (prices[left_valley] + prices[right_valley]) / 2
                        
                        pattern = {
                            'type': 'head_and_shoulders',
                            'start_idx': left_shoulder,
                            'end_idx': right_shoulder,
                            'left_shoulder': {'idx': left_shoulder, 'price': left_shoulder_price},
                            'head': {'idx': head, 'price': head_price},
                            'right_shoulder': {'idx': right_shoulder, 'price': right_shoulder_price},
                            'neckline': neckline_price,
                            'confidence': self.calculate_pattern_confidence(
                                df, left_shoulder, right_shoulder, 'head_and_shoulders'
                            ),
                            'target_price': neckline_price - (head_price - neckline_price),
                            'breakout_level': neckline_price
                        }
                        
                        patterns.append(pattern)
        
        return patterns
    
    def detect_double_top(self, df: pd.DataFrame) -> List[Dict]:
        """Detect double top patterns"""
        patterns = []
        prices = df['close'].values
        
        peaks, _ = find_peaks(prices, distance=self.min_pattern_length//2)
        
        for i in range(len(peaks) - 1):
            peak1 = peaks[i]
            peak2 = peaks[i + 1]
            
            # Check if peaks are roughly equal
            price1 = prices[peak1]
            price2 = prices[peak2]
            price_diff = abs(price1 - price2) / max(price1, price2)
            
            if price_diff < self.price_tolerance:
                # Find valley between peaks
                valley_idx = np.argmin(prices[peak1:peak2]) + peak1
                valley_price = prices[valley_idx]
                
                # Check pattern validity
                if (peak2 - peak1) >= self.min_pattern_length:
                    pattern = {
                        'type': 'double_top',
                        'start_idx': peak1,
                        'end_idx': peak2,
                        'peak1': {'idx': peak1, 'price': price1},
                        'peak2': {'idx': peak2, 'price': price2},
                        'valley': {'idx': valley_idx, 'price': valley_price},
                        'confidence': self.calculate_pattern_confidence(
                            df, peak1, peak2, 'double_top'
                        ),
                        'target_price': valley_price - (max(price1, price2) - valley_price),
                        'breakout_level': valley_price
                    }
                    
                    patterns.append(pattern)
        
        return patterns
    
    def detect_double_bottom(self, df: pd.DataFrame) -> List[Dict]:
        """Detect double bottom patterns"""
        patterns = []
        prices = df['close'].values
        
        valleys, _ = find_peaks(-prices, distance=self.min_pattern_length//2)
        
        for i in range(len(valleys) - 1):
            valley1 = valleys[i]
            valley2 = valleys[i + 1]
            
            # Check if valleys are roughly equal
            price1 = prices[valley1]
            price2 = prices[valley2]
            price_diff = abs(price1 - price2) / min(price1, price2)
            
            if price_diff < self.price_tolerance:
                # Find peak between valleys
                peak_idx = np.argmax(prices[valley1:valley2]) + valley1
                peak_price = prices[peak_idx]
                
                # Check pattern validity
                if (valley2 - valley1) >= self.min_pattern_length:
                    pattern = {
                        'type': 'double_bottom',
                        'start_idx': valley1,
                        'end_idx': valley2,
                        'valley1': {'idx': valley1, 'price': price1},
                        'valley2': {'idx': valley2, 'price': price2},
                        'peak': {'idx': peak_idx, 'price': peak_price},
                        'confidence': self.calculate_pattern_confidence(
                            df, valley1, valley2, 'double_bottom'
                        ),
                        'target_price': peak_price + (peak_price - min(price1, price2)),
                        'breakout_level': peak_price
                    }
                    
                    patterns.append(pattern)
        
        return patterns
    
    def detect_triangles(self, df: pd.DataFrame) -> List[Dict]:
        """Detect triangle patterns (ascending, descending, symmetrical)"""
        patterns = []
        prices = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        
        # Sliding window approach
        window_size = self.min_pattern_length
        
        for start in range(len(prices) - window_size):
            end = start + window_size
            
            # Get highs and lows in window
            window_highs = highs[start:end]
            window_lows = lows[start:end]
            
            # Find trend lines
            high_trend = self.fit_trend_line(window_highs)
            low_trend = self.fit_trend_line(window_lows)
            
            if high_trend is not None and low_trend is not None:
                high_slope = high_trend['slope']
                low_slope = low_trend['slope']
                
                # Classify triangle type
                triangle_type = None
                if abs(high_slope) < 0.001 and low_slope > 0.001:  # Ascending
                    triangle_type = 'ascending_triangle'
                elif high_slope < -0.001 and abs(low_slope) < 0.001:  # Descending
                    triangle_type = 'descending_triangle'
                elif high_slope < -0.001 and low_slope > 0.001:  # Symmetrical
                    triangle_type = 'symmetrical_triangle'
                
                if triangle_type:
                    # Calculate convergence point
                    convergence_x = self.calculate_convergence_point(high_trend, low_trend)
                    
                    if convergence_x > end:  # Convergence should be in future
                        pattern = {
                            'type': triangle_type,
                            'start_idx': start,
                            'end_idx': end,
                            'upper_trendline': high_trend,
                            'lower_trendline': low_trend,
                            'convergence_point': convergence_x,
                            'confidence': self.calculate_pattern_confidence(
                                df, start, end, triangle_type
                            )
                        }
                        
                        patterns.append(pattern)
        
        return patterns
    
    def detect_wedges(self, df: pd.DataFrame) -> List[Dict]:
        """Detect wedge patterns (rising and falling)"""
        patterns = []
        prices = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        
        window_size = self.min_pattern_length
        
        for start in range(len(prices) - window_size):
            end = start + window_size
            
            window_highs = highs[start:end]
            window_lows = lows[start:end]
            
            high_trend = self.fit_trend_line(window_highs)
            low_trend = self.fit_trend_line(window_lows)
            
            if high_trend is not None and low_trend is not None:
                high_slope = high_trend['slope']
                low_slope = low_trend['slope']
                
                # Rising wedge: both slopes positive, high slope < low slope
                if (high_slope > 0 and low_slope > 0 and 
                    high_slope < low_slope * 0.8):
                    
                    pattern = {
                        'type': 'rising_wedge',
                        'start_idx': start,
                        'end_idx': end,
                        'upper_trendline': high_trend,
                        'lower_trendline': low_trend,
                        'confidence': self.calculate_pattern_confidence(
                            df, start, end, 'rising_wedge'
                        )
                    }
                    patterns.append(pattern)
                
                # Falling wedge: both slopes negative, low slope > high slope
                elif (high_slope < 0 and low_slope < 0 and 
                      low_slope > high_slope * 0.8):
                    
                    pattern = {
                        'type': 'falling_wedge',
                        'start_idx': start,
                        'end_idx': end,
                        'upper_trendline': high_trend,
                        'lower_trendline': low_trend,
                        'confidence': self.calculate_pattern_confidence(
                            df, start, end, 'falling_wedge'
                        )
                    }
                    patterns.append(pattern)
        
        return patterns
    
    def detect_channels(self, df: pd.DataFrame) -> List[Dict]:
        """Detect channel patterns"""
        patterns = []
        highs = df['high'].values
        lows = df['low'].values
        
        window_size = self.min_pattern_length
        
        for start in range(len(highs) - window_size):
            end = start + window_size
            
            window_highs = highs[start:end]
            window_lows = lows[start:end]
            
            high_trend = self.fit_trend_line(window_highs)
            low_trend = self.fit_trend_line(window_lows)
            
            if high_trend is not None and low_trend is not None:
                high_slope = high_trend['slope']
                low_slope = low_trend['slope']
                
                # Parallel lines (similar slopes)
                slope_diff = abs(high_slope - low_slope)
                if slope_diff < 0.001:  # Nearly parallel
                    
                    channel_type = 'horizontal_channel'
                    if high_slope > 0.001:
                        channel_type = 'ascending_channel'
                    elif high_slope < -0.001:
                        channel_type = 'descending_channel'
                    
                    pattern = {
                        'type': channel_type,
                        'start_idx': start,
                        'end_idx': end,
                        'upper_trendline': high_trend,
                        'lower_trendline': low_trend,
                        'channel_width': abs(high_trend['intercept'] - low_trend['intercept']),
                        'confidence': self.calculate_pattern_confidence(
                            df, start, end, channel_type
                        )
                    }
                    patterns.append(pattern)
        
        return patterns
    
    def detect_flags(self, df: pd.DataFrame) -> List[Dict]:
        """Detect flag patterns"""
        patterns = []
        prices = df['close'].values
        volume = df['volume'].values
        
        # Find strong moves (flagpoles)
        price_changes = np.diff(prices) / prices[:-1]
        
        for i in range(len(price_changes) - self.min_pattern_length):
            # Look for strong initial move
            flagpole_length = 10  # Length of flagpole
            if i >= flagpole_length:
                flagpole_change = (prices[i] - prices[i - flagpole_length]) / prices[i - flagpole_length]
                
                if abs(flagpole_change) > 0.05:  # 5% move for flagpole
                    # Look for consolidation after flagpole
                    flag_start = i
                    flag_end = min(i + self.min_pattern_length, len(prices))
                    
                    flag_prices = prices[flag_start:flag_end]
                    flag_volatility = np.std(flag_prices) / np.mean(flag_prices)
                    
                    # Flag should have low volatility
                    if flag_volatility < 0.02:  # 2% volatility
                        flag_trend = self.fit_trend_line(flag_prices)
                        
                        if flag_trend is not None:
                            pattern = {
                                'type': 'bull_flag' if flagpole_change > 0 else 'bear_flag',
                                'flagpole_start': i - flagpole_length,
                                'flagpole_end': i,
                                'flag_start': flag_start,
                                'flag_end': flag_end,
                                'flagpole_change': flagpole_change,
                                'flag_trend': flag_trend,
                                'confidence': self.calculate_pattern_confidence(
                                    df, flag_start, flag_end, 'flag'
                                )
                            }
                            patterns.append(pattern)
        
        return patterns
    
    def detect_pennants(self, df: pd.DataFrame) -> List[Dict]:
        """Detect pennant patterns"""
        patterns = []
        prices = df['close'].values
        highs = df['high'].values
        lows = df['low'].values
        
        # Similar to flags but with converging trend lines
        price_changes = np.diff(prices) / prices[:-1]
        
        for i in range(len(price_changes) - self.min_pattern_length):
            flagpole_length = 10
            if i >= flagpole_length:
                flagpole_change = (prices[i] - prices[i - flagpole_length]) / prices[i - flagpole_length]
                
                if abs(flagpole_change) > 0.05:
                    pennant_start = i
                    pennant_end = min(i + self.min_pattern_length, len(prices))
                    
                    pennant_highs = highs[pennant_start:pennant_end]
                    pennant_lows = lows[pennant_start:pennant_end]
                    
                    high_trend = self.fit_trend_line(pennant_highs)
                    low_trend = self.fit_trend_line(pennant_lows)
                    
                    if high_trend is not None and low_trend is not None:
                        # Check for converging lines
                        if ((high_trend['slope'] < 0 and low_trend['slope'] > 0) or
                            (high_trend['slope'] > 0 and low_trend['slope'] < 0 and 
                             abs(high_trend['slope']) < abs(low_trend['slope']))):
                            
                            pattern = {
                                'type': 'bull_pennant' if flagpole_change > 0 else 'bear_pennant',
                                'flagpole_start': i - flagpole_length,
                                'flagpole_end': i,
                                'pennant_start': pennant_start,
                                'pennant_end': pennant_end,
                                'flagpole_change': flagpole_change,
                                'upper_trendline': high_trend,
                                'lower_trendline': low_trend,
                                'confidence': self.calculate_pattern_confidence(
                                    df, pennant_start, pennant_end, 'pennant'
                                )
                            }
                            patterns.append(pattern)
        
        return patterns
    
    def detect_cup_and_handle(self, df: pd.DataFrame) -> List[Dict]:
        """Detect cup and handle patterns"""
        patterns = []
        prices = df['close'].values
        
        min_cup_length = max(self.min_pattern_length, 50)
        
        for start in range(len(prices) - min_cup_length):
            end = start + min_cup_length
            if end >= len(prices):
                break
            
            cup_prices = prices[start:end]
            
            # Find potential cup shape
            cup_left_high = np.max(cup_prices[:10])
            cup_right_high = np.max(cup_prices[-10:])
            cup_bottom = np.min(cup_prices[10:-10])
            
            # Check cup criteria
            cup_depth = min(cup_left_high, cup_right_high) - cup_bottom
            if (cup_depth > 0.1 * cup_left_high and  # At least 10% deep
                abs(cup_left_high - cup_right_high) < 0.05 * cup_left_high):  # Rims roughly equal
                
                # Look for handle after cup
                handle_start = end
                handle_end = min(end + 20, len(prices))
                
                if handle_end < len(prices):
                    handle_prices = prices[handle_start:handle_end]
                    handle_high = np.max(handle_prices)
                    handle_low = np.min(handle_prices)
                    
                    # Handle should be smaller pullback
                    if (handle_high < cup_right_high and
                        (handle_high - handle_low) < cup_depth * 0.5):
                        
                        pattern = {
                            'type': 'cup_and_handle',
                            'cup_start': start,
                            'cup_end': end,
                            'handle_start': handle_start,
                            'handle_end': handle_end,
                            'cup_depth': cup_depth,
                            'cup_left_high': cup_left_high,
                            'cup_right_high': cup_right_high,
                            'cup_bottom': cup_bottom,
                            'confidence': self.calculate_pattern_confidence(
                                df, start, handle_end, 'cup_and_handle'
                            )
                        }
                        patterns.append(pattern)
        
        return patterns
    
    def detect_rounding_bottom(self, df: pd.DataFrame) -> List[Dict]:
        """Detect rounding bottom patterns"""
        patterns = []
        prices = df['close'].values
        
        window_size = max(self.min_pattern_length, 40)
        
        for start in range(len(prices) - window_size):
            end = start + window_size
            
            window_prices = prices[start:end]
            
            # Fit polynomial to check for U-shape
            x = np.arange(len(window_prices))
            
            try:
                # Fit quadratic polynomial
                coeffs = np.polyfit(x, window_prices, 2)
                
                # Check if it's U-shaped (positive coefficient for x^2)
                if coeffs[0] > 0:
                    # Calculate goodness of fit
                    fitted_prices = np.polyval(coeffs, x)
                    r_squared = 1 - (np.sum((window_prices - fitted_prices) ** 2) / 
                                   np.sum((window_prices - np.mean(window_prices)) ** 2))
                    
                    if r_squared > 0.7:  # Good fit
                        pattern = {
                            'type': 'rounding_bottom',
                            'start_idx': start,
                            'end_idx': end,
                            'polynomial_coeffs': coeffs.tolist(),
                            'r_squared': r_squared,
                            'confidence': self.calculate_pattern_confidence(
                                df, start, end, 'rounding_bottom'
                            )
                        }
                        patterns.append(pattern)
            
            except np.linalg.LinAlgError:
                continue
        
        return patterns
    
    def fit_trend_line(self, prices: np.ndarray) -> Optional[Dict[str, float]]:
        """Fit trend line to price data"""
        if len(prices) < 3:
            return None
        
        try:
            x = np.arange(len(prices))
            coeffs = np.polyfit(x, prices, 1)
            
            # Calculate R-squared
            fitted_prices = np.polyval(coeffs, x)
            ss_res = np.sum((prices - fitted_prices) ** 2)
            ss_tot = np.sum((prices - np.mean(prices)) ** 2)
            r_squared = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
            
            return {
                'slope': coeffs[0],
                'intercept': coeffs[1],
                'r_squared': r_squared
            }
        
        except np.linalg.LinAlgError:
            return None
    
    def calculate_convergence_point(self, trend1: Dict, trend2: Dict) -> float:
        """Calculate where two trend lines converge"""
        # y = mx + b for both lines
        # At convergence: m1*x + b1 = m2*x + b2
        # x = (b2 - b1) / (m1 - m2)
        
        slope_diff = trend1['slope'] - trend2['slope']
        if abs(slope_diff) < 1e-10:  # Parallel lines
            return float('inf')
        
        convergence_x = (trend2['intercept'] - trend1['intercept']) / slope_diff
        return convergence_x
    
    def calculate_pattern_confidence(self, df: pd.DataFrame, start: int, end: int, pattern_type: str) -> float:
        """Calculate confidence score for detected pattern"""
        confidence_factors = []
        
        # Volume confirmation
        if 'volume' in df.columns:
            volume_section = df['volume'].iloc[start:end]
            volume_trend = np.corrcoef(np.arange(len(volume_section)), volume_section)[0, 1]
            
            # For breakout patterns, increasing volume is positive
            if pattern_type in ['triangle', 'wedge', 'flag', 'pennant']:
                confidence_factors.append(max(0, volume_trend))
            else:
                confidence_factors.append(0.5)  # Neutral
        
        # Pattern length factor
        pattern_length = end - start
        length_factor = min(1.0, pattern_length / self.max_pattern_length)
        confidence_factors.append(length_factor)
        
        # Price action quality
        prices = df['close'].iloc[start:end]
        price_volatility = prices.std() / prices.mean()
        volatility_factor = 1 - min(1.0, price_volatility / 0.1)  # Lower volatility = higher confidence
        confidence_factors.append(volatility_factor)
        
        # Average confidence
        confidence = np.mean(confidence_factors)
        
        return float(confidence)
    
    def get_pattern_signals(self, patterns: Dict[str, List[Dict]]) -> List[Dict]:
        """Convert patterns to trading signals"""
        signals = []
        
        for pattern_type, pattern_list in patterns.items():
            for pattern in pattern_list:
                signal = self.pattern_to_signal(pattern_type, pattern)
                if signal:
                    signals.append(signal)
        
        return signals
    
    def pattern_to_signal(self, pattern_type: str, pattern: Dict) -> Optional[Dict]:
        """Convert a pattern to a trading signal"""
        if pattern['confidence'] < self.confidence_thresholds['low']:
            return None
        
        signal = {
            'pattern_type': pattern_type,
            'signal_type': None,
            'entry_price': None,
            'stop_loss': None,
            'target_price': None,
            'confidence': pattern['confidence'],
            'timestamp': pattern.get('end_idx', pattern.get('flag_end', 0))
        }
        
        # Pattern-specific signal logic
        if pattern_type == 'head_and_shoulders':
            signal['signal_type'] = 'sell'
            signal['entry_price'] = pattern['breakout_level']
            signal['target_price'] = pattern['target_price']
            signal['stop_loss'] = pattern['head']['price']
        
        elif pattern_type in ['double_top']:
            signal['signal_type'] = 'sell'
            signal['entry_price'] = pattern['breakout_level']
            signal['target_price'] = pattern['target_price']
            signal['stop_loss'] = max(pattern['peak1']['price'], pattern['peak2']['price'])
        
        elif pattern_type in ['double_bottom']:
            signal['signal_type'] = 'buy'
            signal['entry_price'] = pattern['breakout_level']
            signal['target_price'] = pattern['target_price']
            signal['stop_loss'] = min(pattern['valley1']['price'], pattern['valley2']['price'])
        
        elif pattern_type in ['ascending_triangle', 'cup_and_handle', 'rounding_bottom']:
            signal['signal_type'] = 'buy'
        
        elif pattern_type in ['descending_triangle', 'rising_wedge']:
            signal['signal_type'] = 'sell'
        
        elif pattern_type in ['bull_flag', 'bull_pennant']:
            signal['signal_type'] = 'buy'
        
        elif pattern_type in ['bear_flag', 'bear_pennant']:
            signal['signal_type'] = 'sell'
        
        return signal if signal['signal_type'] else None
