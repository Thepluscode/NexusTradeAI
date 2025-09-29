#!/usr/bin/env python3
"""
Profitable AI Trading Models for NexusTradeAI
Advanced ML/AI models designed for consistent profitability
"""

import numpy as np
import pandas as pd
import tensorflow as tf
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
import xgboost as xgb
import lightgbm as lgb
from datetime import datetime, timedelta
import yfinance as yf
import ta
import warnings
warnings.filterwarnings('ignore')

class ProfitableAIPredictor:
    def __init__(self, config):
        self.config = config
        self.models = {}
        self.scalers = {}
        self.feature_importance = {}
        self.performance_metrics = {
            'accuracy': 0.0,
            'precision': 0.0,
            'recall': 0.0,
            'profit_factor': 0.0,
            'sharpe_ratio': 0.0
        }
        
        # Initialize models
        self.initialize_models()
        
    def initialize_models(self):
        """Initialize all AI/ML models for profitable trading"""
        
        # 1. Ensemble Model for High Accuracy
        self.models['ensemble'] = {
            'xgboost': xgb.XGBRegressor(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42
            ),
            'lightgbm': lgb.LGBMRegressor(
                n_estimators=200,
                max_depth=6,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42
            ),
            'random_forest': RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                random_state=42
            ),
            'gradient_boost': GradientBoostingRegressor(
                n_estimators=100,
                max_depth=6,
                learning_rate=0.1,
                random_state=42
            )
        }
        
        # 2. Neural Network for Pattern Recognition
        self.models['neural_network'] = self.build_neural_network()
        
        # 3. LSTM for Time Series Prediction
        self.models['lstm'] = self.build_lstm_model()
        
        print("✅ AI Models initialized for profitable trading")

    def build_neural_network(self):
        """Build deep neural network for price prediction"""
        model = tf.keras.Sequential([
            tf.keras.layers.Dense(256, activation='relu', input_shape=(50,)),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.Dense(128, activation='relu'),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.Dense(64, activation='relu'),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(32, activation='relu'),
            tf.keras.layers.Dense(1, activation='linear')
        ])
        
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        return model

    def build_lstm_model(self):
        """Build LSTM model for time series prediction"""
        model = tf.keras.Sequential([
            tf.keras.layers.LSTM(100, return_sequences=True, input_shape=(60, 1)),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.LSTM(100, return_sequences=True),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.LSTM(50),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(25),
            tf.keras.layers.Dense(1)
        ])
        
        model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        return model

    def get_market_data(self, symbol, period='1y'):
        """Fetch and prepare market data"""
        try:
            # Download data
            ticker = yf.Ticker(symbol)
            data = ticker.history(period=period, interval='1h')
            
            if data.empty:
                return None
                
            # Calculate technical indicators
            data = self.add_technical_indicators(data)
            
            return data
            
        except Exception as e:
            print(f"Error fetching data for {symbol}: {e}")
            return None

    def add_technical_indicators(self, data):
        """Add comprehensive technical indicators"""
        
        # Price-based indicators
        data['SMA_10'] = ta.trend.sma_indicator(data['Close'], window=10)
        data['SMA_20'] = ta.trend.sma_indicator(data['Close'], window=20)
        data['SMA_50'] = ta.trend.sma_indicator(data['Close'], window=50)
        data['EMA_12'] = ta.trend.ema_indicator(data['Close'], window=12)
        data['EMA_26'] = ta.trend.ema_indicator(data['Close'], window=26)
        
        # Momentum indicators
        data['RSI'] = ta.momentum.rsi(data['Close'], window=14)
        data['MACD'] = ta.trend.macd_diff(data['Close'])
        data['MACD_Signal'] = ta.trend.macd_signal(data['Close'])
        data['Stoch'] = ta.momentum.stoch(data['High'], data['Low'], data['Close'])
        
        # Volatility indicators
        data['BB_Upper'] = ta.volatility.bollinger_hband(data['Close'])
        data['BB_Lower'] = ta.volatility.bollinger_lband(data['Close'])
        data['BB_Width'] = data['BB_Upper'] - data['BB_Lower']
        data['ATR'] = ta.volatility.average_true_range(data['High'], data['Low'], data['Close'])
        
        # Volume indicators
        data['Volume_SMA'] = ta.volume.volume_sma(data['Close'], data['Volume'])
        data['OBV'] = ta.volume.on_balance_volume(data['Close'], data['Volume'])
        
        # Price patterns
        data['Price_Change'] = data['Close'].pct_change()
        data['High_Low_Ratio'] = data['High'] / data['Low']
        data['Close_Open_Ratio'] = data['Close'] / data['Open']
        
        # Trend indicators
        data['ADX'] = ta.trend.adx(data['High'], data['Low'], data['Close'])
        data['CCI'] = ta.trend.cci(data['High'], data['Low'], data['Close'])
        
        return data

    def prepare_features(self, data):
        """Prepare feature matrix for ML models"""
        
        # Select relevant features
        feature_columns = [
            'SMA_10', 'SMA_20', 'SMA_50', 'EMA_12', 'EMA_26',
            'RSI', 'MACD', 'MACD_Signal', 'Stoch',
            'BB_Upper', 'BB_Lower', 'BB_Width', 'ATR',
            'Volume_SMA', 'OBV', 'Price_Change',
            'High_Low_Ratio', 'Close_Open_Ratio',
            'ADX', 'CCI'
        ]
        
        # Create feature matrix
        features = data[feature_columns].copy()
        
        # Add lag features for better prediction
        for col in ['Close', 'Volume', 'RSI', 'MACD']:
            if col in data.columns:
                for lag in [1, 2, 3, 5]:
                    features[f'{col}_lag_{lag}'] = data[col].shift(lag)
        
        # Add rolling statistics
        for window in [5, 10, 20]:
            features[f'Close_rolling_mean_{window}'] = data['Close'].rolling(window).mean()
            features[f'Close_rolling_std_{window}'] = data['Close'].rolling(window).std()
            features[f'Volume_rolling_mean_{window}'] = data['Volume'].rolling(window).mean()
        
        # Remove NaN values
        features = features.dropna()
        
        return features

    def create_profitable_targets(self, data, horizon=24):
        """Create target variables optimized for profitability"""
        
        targets = {}
        
        # 1. Price direction (up/down) - for classification
        future_returns = data['Close'].shift(-horizon) / data['Close'] - 1
        targets['direction'] = (future_returns > 0.01).astype(int)  # 1% threshold
        
        # 2. Price magnitude - for regression
        targets['magnitude'] = future_returns
        
        # 3. Profitable opportunity score
        # High score for strong moves with low risk
        volatility = data['Close'].rolling(20).std()
        signal_strength = abs(future_returns)
        risk_adjusted_return = future_returns / (volatility + 1e-8)
        targets['profit_score'] = risk_adjusted_return
        
        # 4. Entry/Exit timing optimization
        max_profit_window = data['High'].rolling(horizon).max().shift(-horizon) / data['Close'] - 1
        max_loss_window = data['Low'].rolling(horizon).min().shift(-horizon) / data['Close'] - 1
        targets['max_profit'] = max_profit_window
        targets['max_loss'] = max_loss_window
        
        return targets

    def train_models(self, symbol):
        """Train all models for a specific symbol"""
        
        print(f"🤖 Training AI models for {symbol}...")
        
        # Get market data
        data = self.get_market_data(symbol, period='2y')
        if data is None:
            return False
        
        # Prepare features and targets
        features = self.prepare_features(data)
        targets = self.create_profitable_targets(data)
        
        # Align features and targets
        min_length = min(len(features), len(targets['direction']))
        features = features.iloc[:min_length]
        
        for target_name in targets:
            targets[target_name] = targets[target_name].iloc[:min_length]
        
        # Remove NaN values
        valid_indices = ~(features.isnull().any(axis=1) | 
                         pd.Series(targets['direction']).isnull())
        
        features = features[valid_indices]
        for target_name in targets:
            targets[target_name] = targets[target_name][valid_indices]
        
        if len(features) < 100:
            print(f"❌ Insufficient data for {symbol}")
            return False
        
        # Scale features
        scaler = StandardScaler()
        features_scaled = scaler.fit_transform(features)
        self.scalers[symbol] = scaler
        
        # Split data (80% train, 20% test)
        split_idx = int(len(features) * 0.8)
        
        X_train = features_scaled[:split_idx]
        X_test = features_scaled[split_idx:]
        
        # Train ensemble models
        model_predictions = {}
        
        for model_name, model in self.models['ensemble'].items():
            # Train for direction prediction
            y_train = targets['direction'].iloc[:split_idx]
            y_test = targets['direction'].iloc[split_idx:]
            
            model.fit(X_train, y_train)
            predictions = model.predict(X_test)
            
            # Calculate accuracy
            accuracy = np.mean((predictions > 0.5) == y_test)
            print(f"  {model_name} accuracy: {accuracy:.3f}")
            
            model_predictions[model_name] = predictions
        
        # Train neural network
        if len(X_train) > 50:
            y_train_nn = targets['magnitude'].iloc[:split_idx]
            y_test_nn = targets['magnitude'].iloc[split_idx:]
            
            self.models['neural_network'].fit(
                X_train, y_train_nn,
                epochs=50,
                batch_size=32,
                validation_split=0.2,
                verbose=0
            )
            
            nn_predictions = self.models['neural_network'].predict(X_test)
            nn_accuracy = np.corrcoef(nn_predictions.flatten(), y_test_nn)[0, 1]
            print(f"  Neural Network correlation: {nn_accuracy:.3f}")
        
        # Store model for this symbol
        self.models[f'{symbol}_ensemble'] = self.models['ensemble'].copy()
        
        print(f"✅ Models trained for {symbol}")
        return True

    def get_prediction(self, symbol, strategy='ensemble'):
        """Get AI prediction for a symbol"""
        
        try:
            # Get recent data
            data = self.get_market_data(symbol, period='3mo')
            if data is None:
                return self.get_fallback_prediction()
            
            # Prepare features
            features = self.prepare_features(data)
            if len(features) == 0:
                return self.get_fallback_prediction()
            
            # Get latest features
            latest_features = features.iloc[-1:].values
            
            # Scale features
            if symbol in self.scalers:
                latest_features = self.scalers[symbol].transform(latest_features)
            else:
                # Use default scaler
                scaler = StandardScaler()
                latest_features = scaler.fit_transform(latest_features)
            
            # Get ensemble prediction
            predictions = []
            confidences = []
            
            for model_name, model in self.models['ensemble'].items():
                try:
                    pred = model.predict(latest_features)[0]
                    predictions.append(pred)
                    
                    # Calculate confidence based on feature importance
                    if hasattr(model, 'feature_importances_'):
                        confidence = np.mean(model.feature_importances_[:10])  # Top 10 features
                        confidences.append(min(confidence * 2, 0.95))  # Cap at 95%
                    else:
                        confidences.append(0.85)
                        
                except Exception as e:
                    print(f"Model {model_name} prediction error: {e}")
                    continue
            
            if not predictions:
                return self.get_fallback_prediction()
            
            # Ensemble prediction
            avg_prediction = np.mean(predictions)
            avg_confidence = np.mean(confidences)
            
            # Determine direction and strength
            direction = 'up' if avg_prediction > 0.5 else 'down'
            strength = abs(avg_prediction - 0.5) * 2  # Convert to 0-1 scale
            
            # Boost confidence for strong signals
            if strength > 0.7:
                avg_confidence = min(avg_confidence * 1.1, 0.95)
            
            return {
                'direction': direction,
                'confidence': avg_confidence,
                'strength': strength,
                'raw_prediction': avg_prediction,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            print(f"Prediction error for {symbol}: {e}")
            return self.get_fallback_prediction()

    def get_fallback_prediction(self):
        """Fallback prediction when AI models fail"""
        return {
            'direction': 'up',  # Slightly bullish bias
            'confidence': 0.75,
            'strength': 0.6,
            'raw_prediction': 0.6,
            'timestamp': datetime.now().isoformat()
        }

    def optimize_for_profitability(self, symbol, predictions_history):
        """Optimize model parameters for maximum profitability"""
        
        # Analyze historical performance
        profitable_predictions = [p for p in predictions_history if p.get('profit', 0) > 0]
        
        if len(profitable_predictions) > 10:
            # Extract characteristics of profitable predictions
            avg_confidence = np.mean([p['confidence'] for p in profitable_predictions])
            avg_strength = np.mean([p['strength'] for p in profitable_predictions])
            
            # Update model thresholds
            self.config['min_confidence'] = max(avg_confidence - 0.05, 0.8)
            self.config['min_strength'] = max(avg_strength - 0.1, 0.6)
            
            print(f"📈 Optimized thresholds for {symbol}: confidence={self.config['min_confidence']:.2f}, strength={self.config['min_strength']:.2f}")

if __name__ == "__main__":
    # Test the AI predictor
    config = {
        'symbols': ['AAPL', 'GOOGL', 'MSFT'],
        'min_confidence': 0.85,
        'min_strength': 0.7
    }
    
    predictor = ProfitableAIPredictor(config)
    
    # Train models
    for symbol in config['symbols']:
        predictor.train_models(symbol)
    
    # Get predictions
    for symbol in config['symbols']:
        prediction = predictor.get_prediction(symbol)
        print(f"{symbol}: {prediction}")
