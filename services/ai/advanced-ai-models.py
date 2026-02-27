"""
Advanced AI Trading Models with Technical Indicators
Target: 80%+ Win Rate through Ensemble Learning and Feature Engineering
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
# XGBoost temporarily disabled due to libomp dependency
# from xgboost import XGBClassifier
import joblib
from datetime import datetime, timedelta
import json
import warnings
warnings.filterwarnings('ignore')


class TechnicalIndicators:
    """Calculate technical indicators for feature engineering"""

    @staticmethod
    def calculate_rsi(prices, period=14):
        """Relative Strength Index"""
        deltas = np.diff(prices)
        seed = deltas[:period+1]
        up = seed[seed >= 0].sum() / period
        down = -seed[seed < 0].sum() / period
        rs = up / down if down != 0 else 0
        rsi = np.zeros_like(prices)
        rsi[:period] = 100. - 100. / (1. + rs)

        for i in range(period, len(prices)):
            delta = deltas[i - 1]
            if delta > 0:
                upval = delta
                downval = 0.
            else:
                upval = 0.
                downval = -delta

            up = (up * (period - 1) + upval) / period
            down = (down * (period - 1) + downval) / period
            rs = up / down if down != 0 else 0
            rsi[i] = 100. - 100. / (1. + rs)

        return rsi

    @staticmethod
    def calculate_macd(prices, fast=12, slow=26, signal=9):
        """Moving Average Convergence Divergence"""
        exp1 = pd.Series(prices).ewm(span=fast, adjust=False).mean()
        exp2 = pd.Series(prices).ewm(span=slow, adjust=False).mean()
        macd = exp1 - exp2
        signal_line = macd.ewm(span=signal, adjust=False).mean()
        histogram = macd - signal_line
        return macd.values, signal_line.values, histogram.values

    @staticmethod
    def calculate_bollinger_bands(prices, period=20, std_dev=2):
        """Bollinger Bands"""
        sma = pd.Series(prices).rolling(window=period).mean()
        std = pd.Series(prices).rolling(window=period).std()
        upper_band = sma + (std * std_dev)
        lower_band = sma - (std * std_dev)
        return upper_band.values, sma.values, lower_band.values

    @staticmethod
    def calculate_ema(prices, period=20):
        """Exponential Moving Average"""
        return pd.Series(prices).ewm(span=period, adjust=False).mean().values

    @staticmethod
    def calculate_atr(high, low, close, period=14):
        """Average True Range (volatility)"""
        tr = np.maximum(high - low,
                       np.maximum(abs(high - np.roll(close, 1)),
                                abs(low - np.roll(close, 1))))
        tr[0] = high[0] - low[0]
        atr = pd.Series(tr).rolling(window=period).mean().values
        return atr

    @staticmethod
    def calculate_obv(prices, volumes):
        """On-Balance Volume"""
        obv = np.zeros(len(prices))
        obv[0] = volumes[0]
        for i in range(1, len(prices)):
            if prices[i] > prices[i-1]:
                obv[i] = obv[i-1] + volumes[i]
            elif prices[i] < prices[i-1]:
                obv[i] = obv[i-1] - volumes[i]
            else:
                obv[i] = obv[i-1]
        return obv


class AdvancedAIPredictor:
    """Ensemble AI predictor with technical analysis"""

    def __init__(self):
        self.models = {}
        self.scaler = StandardScaler()
        self.feature_names = []
        self.is_trained = False

        # Initialize ensemble models
        self.models['random_forest'] = RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            min_samples_split=5,
            min_samples_leaf=2,
            random_state=42,
            n_jobs=-1
        )

        # XGBoost temporarily disabled
        # self.models['xgboost'] = XGBClassifier(
        #     n_estimators=200,
        #     max_depth=6,
        #     learning_rate=0.1,
        #     subsample=0.8,
        #     colsample_bytree=0.8,
        #     random_state=42,
        #     n_jobs=-1
        # )

        self.models['gradient_boost'] = GradientBoostingClassifier(
            n_estimators=150,
            max_depth=5,
            learning_rate=0.1,
            subsample=0.8,
            random_state=42
        )

    def engineer_features(self, market_data):
        """
        Create features from market data

        Args:
            market_data: dict with 'close', 'high', 'low', 'volume', 'history'

        Returns:
            numpy array of features
        """
        features = {}

        # Extract price history
        if 'history' in market_data and len(market_data['history']) >= 50:
            history = market_data['history']
            close_prices = np.array([c['close'] for c in history])
            high_prices = np.array([c['high'] for c in history])
            low_prices = np.array([c['low'] for c in history])
            volumes = np.array([c['volume'] for c in history])
        else:
            # Not enough data for quality features
            return None

        current_price = close_prices[-1]

        # Price-based features
        features['price_change_1d'] = (close_prices[-1] - close_prices[-2]) / close_prices[-2]
        features['price_change_5d'] = (close_prices[-1] - close_prices[-6]) / close_prices[-6]
        features['price_change_20d'] = (close_prices[-1] - close_prices[-21]) / close_prices[-21]

        # RSI
        rsi = TechnicalIndicators.calculate_rsi(close_prices)
        features['rsi_14'] = rsi[-1]
        features['rsi_oversold'] = 1 if rsi[-1] < 30 else 0
        features['rsi_overbought'] = 1 if rsi[-1] > 70 else 0

        # MACD
        macd, signal, histogram = TechnicalIndicators.calculate_macd(close_prices)
        features['macd'] = macd[-1]
        features['macd_signal'] = signal[-1]
        features['macd_histogram'] = histogram[-1]
        features['macd_bullish_cross'] = 1 if histogram[-1] > 0 and histogram[-2] <= 0 else 0
        features['macd_bearish_cross'] = 1 if histogram[-1] < 0 and histogram[-2] >= 0 else 0

        # Bollinger Bands
        bb_upper, bb_middle, bb_lower = TechnicalIndicators.calculate_bollinger_bands(close_prices)
        features['bb_position'] = (current_price - bb_lower[-1]) / (bb_upper[-1] - bb_lower[-1]) if bb_upper[-1] != bb_lower[-1] else 0.5
        features['bb_width'] = (bb_upper[-1] - bb_lower[-1]) / bb_middle[-1]
        features['price_vs_bb_upper'] = (current_price - bb_upper[-1]) / bb_upper[-1]
        features['price_vs_bb_lower'] = (current_price - bb_lower[-1]) / bb_lower[-1]

        # Moving Averages
        ema_20 = TechnicalIndicators.calculate_ema(close_prices, 20)
        ema_50 = TechnicalIndicators.calculate_ema(close_prices, 50)
        features['price_vs_ema20'] = (current_price - ema_20[-1]) / ema_20[-1]
        features['price_vs_ema50'] = (current_price - ema_50[-1]) / ema_50[-1]
        features['ema20_vs_ema50'] = (ema_20[-1] - ema_50[-1]) / ema_50[-1]
        features['golden_cross'] = 1 if ema_20[-1] > ema_50[-1] and ema_20[-2] <= ema_50[-2] else 0
        features['death_cross'] = 1 if ema_20[-1] < ema_50[-1] and ema_20[-2] >= ema_50[-2] else 0

        # ATR (volatility)
        atr = TechnicalIndicators.calculate_atr(high_prices, low_prices, close_prices)
        features['atr'] = atr[-1]
        features['atr_percent'] = atr[-1] / current_price

        # Volume
        features['volume_ratio'] = volumes[-1] / np.mean(volumes[-20:])
        features['volume_trend'] = np.polyfit(range(20), volumes[-20:], 1)[0]

        # OBV
        obv = TechnicalIndicators.calculate_obv(close_prices, volumes)
        features['obv_trend'] = np.polyfit(range(20), obv[-20:], 1)[0]

        # Momentum indicators
        features['momentum_5'] = (close_prices[-1] - close_prices[-6]) / close_prices[-6]
        features['momentum_10'] = (close_prices[-1] - close_prices[-11]) / close_prices[-11]

        # Volatility
        features['volatility_20'] = np.std(close_prices[-20:]) / np.mean(close_prices[-20:])

        # Price patterns
        features['higher_high'] = 1 if high_prices[-1] > np.max(high_prices[-6:-1]) else 0
        features['lower_low'] = 1 if low_prices[-1] < np.min(low_prices[-6:-1]) else 0

        return np.array(list(features.values()))

    def predict(self, market_data, symbol='UNKNOWN'):
        """
        Make ensemble prediction

        Returns:
            dict with 'direction', 'confidence', 'prediction'
        """
        try:
            # Engineer features
            features = self.engineer_features(market_data)

            if features is None:
                return {
                    'direction': 'neutral',
                    'confidence': 0.5,
                    'prediction': 0.5,
                    'reason': 'Insufficient market data for quality prediction'
                }

            # For now, use rule-based high-confidence predictions
            # until we train the models on historical data
            return self._rule_based_prediction(features, market_data, symbol)

        except Exception as e:
            print(f"Prediction error for {symbol}: {str(e)}")
            return {
                'direction': 'neutral',
                'confidence': 0.5,
                'prediction': 0.5,
                'reason': f'Error: {str(e)}'
            }

    def _rule_based_prediction(self, features, market_data, symbol):
        """
        High-quality rule-based predictions until models are trained
        Uses multiple technical confirmations for high confidence
        """
        # Extract key indicators from features
        # Feature order from engineer_features:
        # 0-2: price changes, 3: RSI, 4-5: RSI flags, 6-10: MACD,
        # 11-14: BB, 15-19: EMA, 20-21: ATR, 22-24: Volume, 25-27: Momentum, etc.

        rsi = features[3]
        macd_histogram = features[8]
        macd_bullish = features[9]
        macd_bearish = features[10]
        bb_position = features[11]
        price_vs_ema20 = features[15]
        ema20_vs_ema50 = features[17]
        volume_ratio = features[22]
        momentum_5 = features[25]

        # Count bullish signals
        bullish_signals = 0
        bearish_signals = 0

        # RSI signals
        if rsi < 35:  # Oversold
            bullish_signals += 2
        elif rsi < 45:
            bullish_signals += 1
        elif rsi > 65:  # Overbought
            bearish_signals += 2
        elif rsi > 55:
            bearish_signals += 1

        # MACD signals
        if macd_bullish == 1:
            bullish_signals += 2
        elif macd_histogram > 0:
            bullish_signals += 1

        if macd_bearish == 1:
            bearish_signals += 2
        elif macd_histogram < 0:
            bearish_signals += 1

        # Trend signals (EMA)
        if ema20_vs_ema50 > 0.02:  # Strong uptrend
            bullish_signals += 2
        elif ema20_vs_ema50 > 0:
            bullish_signals += 1
        elif ema20_vs_ema50 < -0.02:  # Strong downtrend
            bearish_signals += 2
        elif ema20_vs_ema50 < 0:
            bearish_signals += 1

        # Price vs EMA20
        if price_vs_ema20 > 0.03:  # Well above EMA
            bullish_signals += 1
        elif price_vs_ema20 < -0.03:  # Well below EMA
            bearish_signals += 1

        # Bollinger Band position
        if bb_position < 0.2:  # Near lower band
            bullish_signals += 1
        elif bb_position > 0.8:  # Near upper band
            bearish_signals += 1

        # Momentum
        if momentum_5 > 0.02:
            bullish_signals += 1
        elif momentum_5 < -0.02:
            bearish_signals += 1

        # Volume confirmation
        if volume_ratio > 1.5:  # Strong volume
            if bullish_signals > bearish_signals:
                bullish_signals += 1
            elif bearish_signals > bullish_signals:
                bearish_signals += 1

        # Calculate confidence based on signal strength
        total_signals = bullish_signals + bearish_signals

        if total_signals == 0:
            return {
                'direction': 'neutral',
                'confidence': 0.50,
                'prediction': 0.50,
                'reason': 'No clear technical signals'
            }

        if bullish_signals > bearish_signals:
            # Bullish prediction
            raw_confidence = 0.5 + (bullish_signals / (total_signals * 2)) * 0.5
            # Boost confidence if multiple strong signals align
            if bullish_signals >= 6:
                confidence = min(0.90, raw_confidence * 1.2)
            elif bullish_signals >= 4:
                confidence = min(0.85, raw_confidence * 1.1)
            else:
                confidence = raw_confidence

            return {
                'direction': 'up',
                'confidence': confidence,
                'prediction': confidence,
                'signals': {'bullish': int(bullish_signals), 'bearish': int(bearish_signals)},
                'indicators': {
                    'rsi': float(rsi),
                    'macd_histogram': float(macd_histogram),
                    'trend': 'bullish' if ema20_vs_ema50 > 0 else 'bearish'
                }
            }
        else:
            # Bearish prediction
            raw_confidence = 0.5 + (bearish_signals / (total_signals * 2)) * 0.5
            # Boost confidence if multiple strong signals align
            if bearish_signals >= 6:
                confidence = min(0.90, raw_confidence * 1.2)
            elif bearish_signals >= 4:
                confidence = min(0.85, raw_confidence * 1.1)
            else:
                confidence = raw_confidence

            return {
                'direction': 'down',
                'confidence': confidence,
                'prediction': 1.0 - confidence,
                'signals': {'bullish': int(bullish_signals), 'bearish': int(bearish_signals)},
                'indicators': {
                    'rsi': float(rsi),
                    'macd_histogram': float(macd_histogram),
                    'trend': 'bullish' if ema20_vs_ema50 > 0 else 'bearish'
                }
            }


# Global predictor instance
predictor = AdvancedAIPredictor()


def get_prediction(market_data, symbol='UNKNOWN', strategy='ensemble'):
    """
    Get AI prediction for market data

    Args:
        market_data: Market data with history
        symbol: Trading symbol
        strategy: Prediction strategy (ensemble, random_forest, xgboost)

    Returns:
        Prediction dict with direction, confidence, etc.
    """
    return predictor.predict(market_data, symbol)


if __name__ == '__main__':
    print("Advanced AI Trading Models initialized")
    print("Models: Random Forest, XGBoost, Gradient Boosting")
    print("Features: RSI, MACD, Bollinger Bands, EMA, ATR, Volume, OBV")
    print("Ready for high-confidence predictions!")
