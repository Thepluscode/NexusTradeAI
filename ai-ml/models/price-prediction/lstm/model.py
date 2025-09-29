import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau, ModelCheckpoint
from sklearn.preprocessing import MinMaxScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error
import joblib
import json
import logging
import os
from datetime import datetime, timedelta
import asyncio
import aioredis
import aiohttp
from typing import List, Dict, Any, Optional, Tuple

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class PricePredictionModel:
    """LSTM-based price prediction model for financial time series data."""
    
    def __init__(self, symbol: str, sequence_length: int = 60, 
                 features: List[str] = None):
        """
        Initialize the LSTM price prediction model.
        
        Args:
            symbol: Trading symbol (e.g., 'BTC/USDT', 'AAPL')
            sequence_length: Number of time steps to look back
            features: List of features to use for prediction
        """
        self.symbol = symbol
        self.sequence_length = sequence_length
        self.features = features or ['close', 'volume', 'high', 'low']
        self.model = None
        self.scaler = MinMaxScaler()
        self.feature_scalers = {}
        self.is_trained = False
        
        # Initialize feature scalers
        for feature in self.features:
            self.feature_scalers[feature] = MinMaxScaler()
    
    def create_model(self, input_shape: Tuple[int, int]) -> Sequential:
        """
        Create LSTM model architecture.
        
        Args:
            input_shape: Shape of input data (sequence_length, n_features)
            
        Returns:
            Compiled Keras model
        """
        model = Sequential([
            # First LSTM layer
            LSTM(128, return_sequences=True, input_shape=input_shape),
            Dropout(0.2),
            BatchNormalization(),
            
            # Second LSTM layer
            LSTM(64, return_sequences=True),
            Dropout(0.2),
            BatchNormalization(),
            
            # Third LSTM layer
            LSTM(32, return_sequences=False),
            Dropout(0.2),
            BatchNormalization(),
            
            # Dense layers
            Dense(50, activation='relu'),
            Dropout(0.2),
            Dense(25, activation='relu'),
            Dense(1, activation='linear')  # Single output for price prediction
        ])
        
        # Compile model
        model.compile(
            optimizer=Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        self.model = model
        return model
    
    def prepare_data(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prepare data for training/prediction.
        
        Args:
            data: Historical price data as DataFrame
            
        Returns:
            Tuple of (X, y) training data
        """
        # Ensure we have all required features
        for feature in self.features:
            if feature not in data.columns:
                raise ValueError(f"Feature '{feature}' not found in data")
        
        # Scale features
        scaled_features = {}
        for feature in self.features:
            scaled_features[feature] = self.feature_scalers[feature].fit_transform(
                data[feature].values.reshape(-1, 1)
            ).flatten()
        
        # Create feature matrix
        feature_matrix = np.column_stack([scaled_features[f] for f in self.features])
        
        # Create sequences
        X, y = [], []
        for i in range(self.sequence_length, len(feature_matrix)):
            X.append(feature_matrix[i-self.sequence_length:i])
            y.append(scaled_features['close'][i])  # Predict close price
        
        return np.array(X), np.array(y)
    
    def train(self, training_data: pd.DataFrame, validation_split: float = 0.2, 
              epochs: int = 100, batch_size: int = 32) -> dict:
        """
        Train the LSTM model.
        
        Args:
            training_data: Historical price data
            validation_split: Fraction of data to use for validation
            epochs: Number of training epochs
            batch_size: Training batch size
            
        Returns:
            Training history
        """
        logger.info(f"Training model for {self.symbol}")
        
        # Prepare training data
        X, y = self.prepare_data(training_data)
        
        # Create model if not exists
        if self.model is None:
            self.create_model((self.sequence_length, len(self.features)))
        
        # Define callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss',
                patience=20,
                restore_best_weights=True
            ),
            ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=10,
                min_lr=1e-7
            )
        ]
        
        # Train model
        history = self.model.fit(
            X, y,
            validation_split=validation_split,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        self.is_trained = True
        logger.info(f"Model training completed for {self.symbol}")
        
        return history.history
    
    def predict(self, recent_data: pd.DataFrame, steps_ahead: int = 1) -> np.ndarray:
        """
        Make price predictions.
        
        Args:
            recent_data: Recent price data
            steps_ahead: Number of steps to predict ahead
            
        Returns:
            Array of predicted prices
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before making predictions")
        
        # Prepare input data
        scaled_features = {}
        for feature in self.features:
            scaled_features[feature] = self.feature_scalers[feature].transform(
                recent_data[feature].values.reshape(-1, 1)
            ).flatten()
        
        # Get last sequence
        feature_matrix = np.column_stack([scaled_features[f] for f in self.features])
        last_sequence = feature_matrix[-self.sequence_length:]
        
        predictions = []
        current_sequence = last_sequence.copy()
        
        for _ in range(steps_ahead):
            # Reshape for prediction
            prediction_input = current_sequence.reshape(1, self.sequence_length, len(self.features))
            
            # Make prediction
            scaled_prediction = self.model.predict(prediction_input, verbose=0)[0][0]
            
            # Inverse transform to get actual price
            actual_prediction = self.feature_scalers['close'].inverse_transform(
                [[scaled_prediction]]
            )[0][0]
            
            predictions.append(actual_prediction)
            
            # Update sequence for next prediction
            new_row = current_sequence[-1].copy()
            new_row[self.features.index('close')] = scaled_prediction
            
            # Shift sequence and add new row
            current_sequence = np.roll(current_sequence, -1, axis=0)
            current_sequence[-1] = new_row
        
        return np.array(predictions)
    
    def evaluate(self, test_data: pd.DataFrame) -> Dict[str, float]:
        """
        Evaluate model performance.
        
        Args:
            test_data: Test data
            
        Returns:
            Dictionary of performance metrics
        """
        X_test, y_test = self.prepare_data(test_data)
        
        # Make predictions
        y_pred = self.model.predict(X_test)
        
        # Inverse transform
        y_test_actual = self.feature_scalers['close'].inverse_transform(y_test.reshape(-1, 1)).flatten()
        y_pred_actual = self.feature_scalers['close'].inverse_transform(y_pred).flatten()
        
        # Calculate metrics
        mse = mean_squared_error(y_test_actual, y_pred_actual)
        mae = mean_absolute_error(y_test_actual, y_pred_actual)
        rmse = np.sqrt(mse)
        
        # Calculate directional accuracy
        actual_direction = np.diff(y_test_actual) > 0
        pred_direction = np.diff(y_pred_actual) > 0
        directional_accuracy = np.mean(actual_direction == pred_direction)
        
        return {
            'mse': mse,
            'mae': mae,
            'rmse': rmse,
            'directional_accuracy': directional_accuracy,
            'mean_price': float(np.mean(y_test_actual)),
            'std_price': float(np.std(y_test_actual))
        }
    
    def save_model(self, filepath: str) -> None:
        """
        Save model and scalers.
        
        Args:
            filepath: Base path to save model files
        """
        if self.model is None:
            raise ValueError("No model to save")
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Save Keras model
        self.model.save(f"{filepath}_model.keras")
        
        # Save scalers
        joblib.dump(self.scaler, f"{filepath}_scaler.pkl")
        for feature, scaler in self.feature_scalers.items():
            joblib.dump(scaler, f"{filepath}_{feature}_scaler.pkl")
        
        # Save metadata
        metadata = {
            'symbol': self.symbol,
            'sequence_length': self.sequence_length,
            'features': self.features,
            'is_trained': self.is_trained
        }
        with open(f"{filepath}_metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"Model saved to {filepath}")
    
    def load_model(self, filepath: str) -> None:
        """
        Load model and scalers.
        
        Args:
            filepath: Base path to load model files from
        """
        # Load metadata
        with open(f"{filepath}_metadata.json", 'r') as f:
            metadata = json.load(f)
        
        self.symbol = metadata['symbol']
        self.sequence_length = metadata['sequence_length']
        self.features = metadata['features']
        self.is_trained = metadata['is_trained']
        
        # Load Keras model
        self.model = load_model(f"{filepath}_model.keras")
        
        # Load scalers
        self.scaler = joblib.load(f"{filepath}_scaler.pkl")
        for feature in self.features:
            self.feature_scalers[feature] = joblib.load(f"{filepath}_{feature}_scaler.pkl")
        
        logger.info(f"Model loaded from {filepath}")


class PredictionService:
    """Real-time prediction service for multiple symbols."""
    
    def __init__(self, redis_url: str = 'redis://localhost:6379'):
        """
        Initialize the prediction service.
        
        Args:
            redis_url: Redis connection URL
        """
        self.redis_url = redis_url
        self.models = {}
        self.redis = None
    
    async def connect(self) -> None:
        """Connect to Redis."""
        self.redis = await aioredis.from_url(self.redis_url)
    
    async def load_models(self, symbols: List[str]) -> None:
        """
        Load trained models for symbols.
        
        Args:
            symbols: List of trading symbols to load models for
        """
        for symbol in symbols:
            try:
                model = PricePredictionModel(symbol)
                model_path = f"models/{symbol.replace('/', '_')}"
                model.load_model(model_path)
                self.models[symbol] = model
                logger.info(f"Loaded model for {symbol}")
            except Exception as e:
                logger.error(f"Failed to load model for {symbol}: {e}")
    
    async def get_market_data(self, symbol: str, limit: int = 100) -> pd.DataFrame:
        """
        Get recent market data for a symbol.
        
        Args:
            symbol: Trading symbol
            limit: Number of data points to retrieve
            
        Returns:
            DataFrame with market data
        """
        try:
            # In production, this would call the market data service
            # For now, we'll use a mock data generator
            return self._generate_mock_data(symbol, limit)
        except Exception as e:
            logger.error(f"Failed to get market data for {symbol}: {e}")
            return self._generate_mock_data(symbol, limit)  # Fallback to mock data
    
    def _generate_mock_data(self, symbol: str, limit: int) -> pd.DataFrame:
        """
        Generate mock market data for testing.
        
        Args:
            symbol: Trading symbol
            limit: Number of data points to generate
            
        Returns:
            DataFrame with mock market data
        """
        dates = pd.date_range(end=datetime.now(), periods=limit, freq='1H')
        np.random.seed(42)
        
        # Generate realistic price data
        base_price = 100 if not symbol.startswith('BTC') else 45000
        prices = []
        current_price = base_price
        
        for _ in range(limit):
            change = np.random.normal(0, 0.02) * current_price
            current_price = max(0.01, current_price + change)
            prices.append(current_price)
        
        return pd.DataFrame({
            'timestamp': dates,
            'open': prices,
            'high': [p * (1 + abs(np.random.normal(0, 0.01))) for p in prices],
            'low': [p * (1 - abs(np.random.normal(0, 0.01))) for p in prices],
            'close': prices,
            'volume': np.random.uniform(1000, 10000, limit)
        })
    
    async def make_prediction(self, symbol: str, steps_ahead: int = 1) -> Dict[str, Any]:
        """
        Make price prediction for a symbol.
        
        Args:
            symbol: Trading symbol
            steps_ahead: Number of steps to predict ahead
            
        Returns:
            Dictionary with prediction results
        """
        if symbol not in self.models:
            logger.warning(f"No model found for symbol {symbol}")
            return None
        
        try:
            # Get recent market data
            recent_data = await self.get_market_data(symbol, 100)
            
            # Make prediction
            model = self.models[symbol]
            prediction = model.predict(recent_data, steps_ahead)
            
            # Calculate prediction confidence (simplified)
            recent_volatility = recent_data['close'].pct_change().std()
            confidence = max(0.1, 1.0 - min(recent_volatility * 10, 0.9))
            
            result = {
                'symbol': symbol,
                'predictions': prediction.tolist(),
                'confidence': float(confidence),
                'current_price': float(recent_data['close'].iloc[-1]),
                'timestamp': datetime.utcnow().isoformat(),
                'steps_ahead': steps_ahead
            }
            
            # Cache prediction in Redis if connected
            if self.redis:
                await self.redis.setex(
                    f"prediction:{symbol}",
                    300,  # 5 minutes TTL
                    json.dumps(result)
                )
                
                # Publish prediction update
                await self.redis.publish(
                    f"predictions:{symbol}",
                    json.dumps(result)
                )
            
            return result
                
        except Exception as e:
            logger.error(f"Prediction failed for {symbol}: {e}")
            return None
    
    async def run_continuous_predictions(self, symbols: List[str], interval: int = 60) -> None:
        """
        Run continuous predictions for symbols.
        
        Args:
            symbols: List of trading symbols
            interval: Prediction interval in seconds
        """
        logger.info("Starting continuous prediction service")
        
        while True:
            try:
                tasks = []
                for symbol in symbols:
                    if symbol in self.models:
                        tasks.append(self.make_prediction(symbol))
                
                # Run predictions concurrently
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                for result in results:
                    if isinstance(result, Exception):
                        logger.error(f"Prediction error: {result}")
                    elif result:
                        logger.info(f"Prediction made for {result['symbol']}: {result['predictions'][0]:.2f}")
                
                # Wait before next round
                await asyncio.sleep(interval)
                
            except Exception as e:
                logger.error(f"Error in prediction loop: {e}")
                await asyncio.sleep(10)


class LSTMPricePredictor:
    """
    Advanced LSTM model for price prediction with multiple features
    and sophisticated architecture for high-frequency trading.
    """
    
    def __init__(self,
                 symbol: str,
                 sequence_length: int = 60,
                 n_features: int = 10,
                 lstm_units: list = [128, 64, 32],
                 dropout_rate: float = 0.2,
                 learning_rate: float = 0.001):
        """
        Initialize LSTM Price Predictor
        
        Args:
            symbol: Trading symbol (e.g., 'BTC/USDT', 'AAPL')
            sequence_length: Number of time steps to look back
            n_features: Number of input features
            lstm_units: List of LSTM layer sizes
            dropout_rate: Dropout rate for regularization
            learning_rate: Learning rate for optimizer
        """
        self.symbol = symbol
        self.sequence_length = sequence_length
        self.n_features = n_features
        self.lstm_units = lstm_units
        self.dropout_rate = dropout_rate
        self.learning_rate = learning_rate
        self.model = None
        self.feature_scalers = {}
        self.is_trained = False
        self.logger = logging.getLogger(__name__)
        
    def build_model(self) -> tf.keras.Model:
        """Build advanced LSTM architecture"""
        model = Sequential()
        
        # First LSTM layer with return sequences
        model.add(LSTM(
            self.lstm_units[0],
            return_sequences=True,
            input_shape=(self.sequence_length, self.n_features),
            recurrent_dropout=self.dropout_rate
        ))
        model.add(BatchNormalization())
        model.add(Dropout(self.dropout_rate))
        
        # Second LSTM layer
        model.add(LSTM(
            self.lstm_units[1],
            return_sequences=True,
            recurrent_dropout=self.dropout_rate
        ))
        model.add(BatchNormalization())
        model.add(Dropout(self.dropout_rate))
        
        # Third LSTM layer
        model.add(LSTM(
            self.lstm_units[2],
            return_sequences=False,
            recurrent_dropout=self.dropout_rate
        ))
        model.add(BatchNormalization())
        model.add(Dropout(self.dropout_rate))
        
        # Dense layers for prediction
        model.add(Dense(64, activation='relu'))
        model.add(BatchNormalization())
        model.add(Dropout(self.dropout_rate))
        
        model.add(Dense(32, activation='relu'))
        model.add(Dropout(self.dropout_rate))
        
        # Output layer (multi-horizon prediction)
        model.add(Dense(5, activation='linear'))  # Predict 1, 5, 15, 30, 60 minute horizons
        
        # Compile model with custom loss function
        model.compile(
            optimizer=Adam(learning_rate=self.learning_rate),
            loss=self.custom_loss,
            metrics=['mae', 'mse', self.directional_accuracy]
        )
        
        self.model = model
        return model
    
    @staticmethod
    def custom_loss(y_true, y_pred):
        """
        Custom loss function that penalizes directional errors more heavily
        """
        mse_loss = tf.keras.losses.mean_squared_error(y_true, y_pred)
        
        # Directional loss component
        true_direction = tf.sign(y_true[:, 1:] - y_true[:, :-1])
        pred_direction = tf.sign(y_pred[:, 1:] - y_pred[:, :-1])
        direction_error = tf.reduce_mean(tf.cast(
            tf.not_equal(true_direction, pred_direction), tf.float32
        ))
        
        return mse_loss + 0.5 * direction_error
    
    @staticmethod
    def directional_accuracy(y_true, y_pred):
        """
        Calculate directional accuracy metric
        """
        true_direction = tf.sign(y_true[:, 1:] - y_true[:, :-1])
        pred_direction = tf.sign(y_pred[:, 1:] - y_pred[:, :-1])
        return tf.reduce_mean(tf.cast(
            tf.equal(true_direction, pred_direction), tf.float32
        ))
    
    def prepare_sequences(self, data: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prepare sequences for LSTM training
        
        Args:
            data: Input data DataFrame
            
        Returns:
            X, y arrays for training
        """
        # Ensure we have all required features
        features = data.columns.tolist()
        if len(features) < self.n_features:
            raise ValueError(f"Data has {len(features)} features, but model requires {self.n_features}")
        
        # Scale features
        scaled_features = {}
        for feature in features:
            if feature not in self.feature_scalers:
                self.feature_scalers[feature] = MinMaxScaler()
            
            scaled_features[feature] = self.feature_scalers[feature].fit_transform(
                data[feature].values.reshape(-1, 1)
            ).flatten()
        
        # Create feature matrix
        feature_matrix = np.column_stack([scaled_features[f] for f in features[:self.n_features]])
        
        X, y = [], []
        
        for i in range(self.sequence_length, len(feature_matrix) - 60):  # -60 for max horizon
            X.append(feature_matrix[i-self.sequence_length:i])
            # Multi-horizon targets (1, 5, 15, 30, 60 minute ahead)
            horizons = [1, 5, 15, 30, 60]
            targets = []
            for h in horizons:
                if i + h < len(feature_matrix):
                    targets.append(scaled_features[features[0]][i + h])  # Assuming price is first column
                else:
                    targets.append(scaled_features[features[0]][-1])  # Use last available price
            y.append(targets)
            
        return np.array(X), np.array(y)
    
    def train(self, 
              training_data: pd.DataFrame, 
              validation_split: float = 0.2,
              epochs: int = 100, 
              batch_size: int = 32) -> dict:
        """
        Train the LSTM model
        
        Args:
            training_data: Historical price data
            validation_split: Fraction of data to use for validation
            epochs: Number of training epochs
            batch_size: Batch size for training
            
        Returns:
            Training history
        """
        self.logger.info(f"Training advanced model for {self.symbol}")
        
        # Prepare training data
        X, y = self.prepare_sequences(training_data)
        
        # Build model if not exists
        if self.model is None:
            self.build_model()
        
        # Define callbacks
        callbacks = [
            EarlyStopping(
                monitor='val_loss',
                patience=20,
                restore_best_weights=True
            ),
            ReduceLROnPlateau(
                monitor='val_loss',
                factor=0.5,
                patience=10,
                min_lr=1e-7
            ),
            ModelCheckpoint(
                filepath=f"models/checkpoints/{self.symbol.replace('/', '_')}_best.keras",
                monitor='val_loss',
                save_best_only=True,
                verbose=1
            )
        ]
        
        # Train model
        history = self.model.fit(
            X, y,
            validation_split=validation_split,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=callbacks,
            verbose=1
        )
        
        self.is_trained = True
        self.logger.info(f"Advanced model training completed for {self.symbol}")
        
        return history.history
    
    def predict(self, recent_data: pd.DataFrame) -> Dict[str, np.ndarray]:
        """
        Make multi-horizon price predictions
        
        Args:
            recent_data: Recent price data
            
        Returns:
            Dictionary of predictions for different time horizons
        """
        if not self.is_trained:
            raise ValueError("Model must be trained before making predictions")
        
        # Prepare input data
        features = recent_data.columns.tolist()[:self.n_features]
        scaled_features = {}
        
        for feature in features:
            scaled_features[feature] = self.feature_scalers[feature].transform(
                recent_data[feature].values.reshape(-1, 1)
            ).flatten()
        
        # Create feature matrix
        feature_matrix = np.column_stack([scaled_features[f] for f in features])
        
        # Get last sequence
        last_sequence = feature_matrix[-self.sequence_length:]
        
        # Reshape for prediction
        prediction_input = last_sequence.reshape(1, self.sequence_length, self.n_features)
        
        # Make prediction
        scaled_predictions = self.model.predict(prediction_input, verbose=0)[0]
        
        # Inverse transform to get actual prices
        price_feature = features[0]  # Assuming price is first column
        actual_predictions = self.feature_scalers[price_feature].inverse_transform(
            scaled_predictions.reshape(-1, 1)
        ).flatten()
        
        # Return predictions for different horizons
        horizons = [1, 5, 15, 30, 60]
        return {
            f"{h}min": actual_predictions[i] for i, h in enumerate(horizons)
        }
    
    def save_model(self, filepath: str) -> None:
        """
        Save model and scalers
        
        Args:
            filepath: Base path to save model files
        """
        if self.model is None:
            raise ValueError("No model to save")
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Save Keras model
        self.model.save(f"{filepath}_advanced_model.keras")
        
        # Save scalers
        for feature, scaler in self.feature_scalers.items():
            joblib.dump(scaler, f"{filepath}_{feature}_scaler.pkl")
        
        # Save metadata
        metadata = {
            'symbol': self.symbol,
            'sequence_length': self.sequence_length,
            'n_features': self.n_features,
            'lstm_units': self.lstm_units,
            'dropout_rate': self.dropout_rate,
            'learning_rate': self.learning_rate,
            'is_trained': self.is_trained
        }
        with open(f"{filepath}_advanced_metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        self.logger.info(f"Advanced model saved to {filepath}")
    
    def load_model(self, filepath: str) -> None:
        """
        Load model and scalers
        
        Args:
            filepath: Base path to load model files from
        """
        # Load metadata
        with open(f"{filepath}_advanced_metadata.json", 'r') as f:
            metadata = json.load(f)
        
        self.symbol = metadata['symbol']
        self.sequence_length = metadata['sequence_length']
        self.n_features = metadata['n_features']
        self.lstm_units = metadata['lstm_units']
        self.dropout_rate = metadata['dropout_rate']
        self.learning_rate = metadata['learning_rate']
        self.is_trained = metadata['is_trained']
        
        # Load Keras model
        self.model = load_model(
            f"{filepath}_advanced_model.keras",
            custom_objects={
                'custom_loss': self.custom_loss,
                'directional_accuracy': self.directional_accuracy
            }
        )
        
        # Load feature scalers
        feature_files = [f for f in os.listdir(os.path.dirname(filepath)) 
                        if f.startswith(os.path.basename(filepath)) and f.endswith('_scaler.pkl')]
        
        for file in feature_files:
            feature = file.replace(f"{os.path.basename(filepath)}_", "").replace("_scaler.pkl", "")
            self.feature_scalers[feature] = joblib.load(os.path.join(os.path.dirname(filepath), file))
        
        self.logger.info(f"Advanced model loaded from {filepath}")
