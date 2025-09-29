import numpy as np
import pandas as pd
import tensorflow as tf
import matplotlib.pyplot as plt
import os
import yaml
import logging
from typing import Dict, List, Tuple, Any, Optional
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
from datetime import datetime

from .model import TransformerPricePredictor

class TransformerTrainingPipeline:
    """
    Training pipeline for transformer-based price prediction models.
    Handles data preprocessing, feature engineering, model training, and evaluation.
    """
    
    def __init__(self, config_path: str = None):
        """
        Initialize the training pipeline.
        
        Args:
            config_path: Path to configuration file
        """
        self.logger = logging.getLogger(__name__)
        self.config = self._load_config(config_path)
        self.model = None
        self.feature_scalers = {}
        self.target_scaler = None
    
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """
        Load configuration from YAML file.
        
        Args:
            config_path: Path to configuration file
            
        Returns:
            Configuration dictionary
        """
        default_config = {
            'symbol': 'BTC/USDT',
            'model': {
                'sequence_length': 60,
                'embed_dim': 128,
                'num_heads': 8,
                'ff_dim': 256,
                'num_blocks': 4,
                'dropout_rate': 0.1,
                'learning_rate': 0.0001
            },
            'training': {
                'epochs': 100,
                'batch_size': 32,
                'validation_split': 0.2,
                'early_stopping_patience': 20,
                'reduce_lr_patience': 10,
                'reduce_lr_factor': 0.5,
                'min_lr': 1e-7
            },
            'features': {
                'technical_indicators': True,
                'market_microstructure': True,
                'time_features': True,
                'lag_features': [1, 5, 10]
            },
            'preprocessing': {
                'remove_outliers': True,
                'scaling_method': 'minmax'
            },
            'data': {
                'train_split': 0.8
            }
        }
        
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, 'r') as file:
                    loaded_config = yaml.safe_load(file)
                    # Merge with default config
                    self._deep_update(default_config, loaded_config)
                    self.logger.info(f"Loaded configuration from {config_path}")
            except Exception as e:
                self.logger.error(f"Error loading config: {e}")
        else:
            self.logger.warning("No config file provided or file not found. Using default configuration.")
            
        return default_config
    
    def _deep_update(self, d: Dict, u: Dict) -> Dict:
        """
        Recursively update a dictionary.
        
        Args:
            d: Dictionary to update
            u: Dictionary with updates
            
        Returns:
            Updated dictionary
        """
        for k, v in u.items():
            if isinstance(v, dict) and k in d and isinstance(d[k], dict):
                self._deep_update(d[k], v)
            else:
                d[k] = v
        return d
    
    def preprocess_data(self, data: pd.DataFrame) -> Tuple[pd.DataFrame, List[str]]:
        """
        Preprocess data and engineer features.
        
        Args:
            data: Raw price data
            
        Returns:
            Tuple of (processed_data, feature_columns)
        """
        self.logger.info("Preprocessing data and engineering features")
        
        # Ensure required columns exist
        required_columns = ['timestamp', 'open', 'high', 'low', 'close', 'volume']
        for col in required_columns:
            if col not in data.columns:
                raise ValueError(f"Required column '{col}' not found in data")
        
        # Convert timestamp to datetime if it's not already
        if not pd.api.types.is_datetime64_any_dtype(data['timestamp']):
            data['timestamp'] = pd.to_datetime(data['timestamp'])
        
        # Sort by timestamp
        data = data.sort_values('timestamp')
        
        # Remove outliers if configured
        if self.config['preprocessing']['remove_outliers']:
            for col in ['open', 'high', 'low', 'close', 'volume']:
                q1 = data[col].quantile(0.01)
                q3 = data[col].quantile(0.99)
                iqr = q3 - q1
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr
                data = data[(data[col] >= lower_bound) & (data[col] <= upper_bound)]
        
        # Feature engineering
        feature_columns = ['open', 'high', 'low', 'close', 'volume']
        
        # Add technical indicators if configured
        if self.config['features']['technical_indicators']:
            # Add moving averages
            for window in [5, 10, 20, 50]:
                data[f'ma_{window}'] = data['close'].rolling(window=window).mean()
                feature_columns.append(f'ma_{window}')
            
            # Add RSI
            delta = data['close'].diff()
            gain = delta.where(delta > 0, 0)
            loss = -delta.where(delta < 0, 0)
            avg_gain = gain.rolling(window=14).mean()
            avg_loss = loss.rolling(window=14).mean()
            rs = avg_gain / avg_loss
            data['rsi'] = 100 - (100 / (1 + rs))
            feature_columns.append('rsi')
            
            # Add MACD
            ema12 = data['close'].ewm(span=12, adjust=False).mean()
            ema26 = data['close'].ewm(span=26, adjust=False).mean()
            data['macd'] = ema12 - ema26
            data['macd_signal'] = data['macd'].ewm(span=9, adjust=False).mean()
            feature_columns.extend(['macd', 'macd_signal'])
            
            # Add Bollinger Bands
            data['bb_middle'] = data['close'].rolling(window=20).mean()
            data['bb_std'] = data['close'].rolling(window=20).std()
            data['bb_upper'] = data['bb_middle'] + 2 * data['bb_std']
            data['bb_lower'] = data['bb_middle'] - 2 * data['bb_std']
            feature_columns.extend(['bb_middle', 'bb_upper', 'bb_lower'])
        
        # Add market microstructure features if configured
        if self.config['features']['market_microstructure']:
            # Price range
            data['price_range'] = data['high'] - data['low']
            feature_columns.append('price_range')
            
            # Volume momentum
            data['volume_ma5'] = data['volume'].rolling(window=5).mean()
            data['volume_ratio'] = data['volume'] / data['volume_ma5']
            feature_columns.append('volume_ratio')
            
            # Price momentum
            data['price_momentum'] = data['close'].pct_change()
            feature_columns.append('price_momentum')
        
        # Add time features if configured
        if self.config['features']['time_features']:
            data['hour'] = data['timestamp'].dt.hour
            data['day_of_week'] = data['timestamp'].dt.dayofweek
            data['month'] = data['timestamp'].dt.month
            feature_columns.extend(['hour', 'day_of_week', 'month'])
        
        # Add lag features if configured
        if self.config['features']['lag_features']:
            for lag in self.config['features']['lag_features']:
                data[f'close_lag_{lag}'] = data['close'].shift(lag)
                feature_columns.append(f'close_lag_{lag}')
        
        # Drop rows with NaN values
        data = data.dropna()
        
        return data, feature_columns
    
    def prepare_sequences(self, data: pd.DataFrame, feature_columns: List[str]) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prepare sequences for transformer model training.
        
        Args:
            data: Preprocessed data
            feature_columns: List of feature columns
            
        Returns:
            Tuple of (X, y) arrays
        """
        self.logger.info("Preparing sequences for training")
        
        # Scale features
        scaled_features = {}
        for feature in feature_columns:
            scaler = MinMaxScaler()
            scaled_features[feature] = scaler.fit_transform(data[feature].values.reshape(-1, 1)).flatten()
            self.feature_scalers[feature] = scaler
        
        # Scale target (close price)
        target_scaler = MinMaxScaler()
        scaled_target = target_scaler.fit_transform(data['close'].values.reshape(-1, 1)).flatten()
        self.target_scaler = target_scaler
        
        # Create feature matrix
        feature_matrix = np.column_stack([scaled_features[f] for f in feature_columns])
        
        # Create sequences
        X, y = [], []
        seq_length = self.config['model']['sequence_length']
        
        # Multi-horizon targets (1, 5, 15, 30, 60 minutes ahead)
        horizons = [1, 5, 15, 30, 60]
        
        for i in range(seq_length, len(feature_matrix) - max(horizons)):
            X.append(feature_matrix[i-seq_length:i])
            
            # Create multi-horizon targets
            targets = [scaled_target[i + h] for h in horizons]
            y.append(targets)
        
        return np.array(X), np.array(y)
    
    def train(self, data: pd.DataFrame) -> Dict[str, Any]:
        """
        Train the transformer model.
        
        Args:
            data: Raw price data
            
        Returns:
            Training history
        """
        self.logger.info(f"Training transformer model for {self.config['symbol']}")
        
        # Preprocess data
        processed_data, feature_columns = self.preprocess_data(data)
        
        # Prepare sequences
        X, y = self.prepare_sequences(processed_data, feature_columns)
        
        # Split data
        train_split = self.config['data']['train_split']
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, train_size=train_split, shuffle=False
        )
        
        # Create model
        self.model = TransformerPricePredictor(
            sequence_length=self.config['model']['sequence_length'],
            n_features=len(feature_columns),
            embed_dim=self.config['model']['embed_dim'],
            num_heads=self.config['model']['num_heads'],
            ff_dim=self.config['model']['ff_dim'],
            num_blocks=self.config['model']['num_blocks'],
            dropout_rate=self.config['model']['dropout_rate'],
            learning_rate=self.config['model']['learning_rate']
        )
        
        # Build model
        model = self.model.build_model()
        
        # Define callbacks
        callbacks = [
            tf.keras.callbacks.EarlyStopping(
                monitor='val_loss',
                patience=self.config['training']['early_stopping_patience'],
                restore_best_weights=True
            ),
            tf.keras.callbacks.ReduceLROnPlateau(
                monitor='val_loss',
                factor=self.config['training']['reduce_lr_factor'],
                patience=self.config['training']['reduce_lr_patience'],
                min_lr=self.config['training']['min_lr']
            ),
            tf.keras.callbacks.ModelCheckpoint(
                filepath=f"models/{self.config['symbol'].replace('/', '_')}_transformer_checkpoint",
                monitor='val_loss',
                save_best_only=True
            )
        ]
        
        # Train model
        history = model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=self.config['training']['epochs'],
            batch_size=self.config['training']['batch_size'],
            callbacks=callbacks,
            verbose=1
        )
        
        # Evaluate model
        evaluation = self.evaluate(X_val, y_val)
        
        # Combine history and evaluation
        result = {
            'history': history.history,
            'evaluation': evaluation
        }
        
        self.logger.info(f"Model training completed for {self.config['symbol']}")
        return result
    
    def evaluate(self, X_test: np.ndarray, y_test: np.ndarray) -> Dict[str, float]:
        """
        Evaluate model performance.
        
        Args:
            X_test: Test features
            y_test: Test targets
            
        Returns:
            Dictionary of performance metrics
        """
        self.logger.info("Evaluating model performance")
        
        # Make predictions
        y_pred = self.model.model.predict(X_test)
        
        # Calculate metrics for each horizon
        horizons = [1, 5, 15, 30, 60]
        metrics = {}
        
        for i, horizon in enumerate(horizons):
            # Extract predictions and targets for this horizon
            horizon_pred = y_pred[:, i]
            horizon_true = y_test[:, i]
            
            # Inverse transform
            horizon_pred_actual = self.target_scaler.inverse_transform(horizon_pred.reshape(-1, 1)).flatten()
            horizon_true_actual = self.target_scaler.inverse_transform(horizon_true.reshape(-1, 1)).flatten()
            
            # Calculate metrics
            mse = np.mean(np.square(horizon_true_actual - horizon_pred_actual))
            mae = np.mean(np.abs(horizon_true_actual - horizon_pred_actual))
            rmse = np.sqrt(mse)
            
            # Calculate directional accuracy
            if i < len(horizons) - 1:  # Skip the last horizon
                actual_direction = np.diff(horizon_true_actual) > 0
                pred_direction = np.diff(horizon_pred_actual) > 0
                directional_accuracy = np.mean(actual_direction == pred_direction)
            else:
                directional_accuracy = None
            
            metrics[f'{horizon}min'] = {
                'mse': float(mse),
                'mae': float(mae),
                'rmse': float(rmse),
                'directional_accuracy': float(directional_accuracy) if directional_accuracy is not None else None
            }
        
        # Calculate overall metrics
        overall_mse = np.mean([metrics[f'{h}min']['mse'] for h in horizons])
        overall_mae = np.mean([metrics[f'{h}min']['mae'] for h in horizons])
        overall_rmse = np.mean([metrics[f'{h}min']['rmse'] for h in horizons])
        
        metrics['overall'] = {
            'mse': float(overall_mse),
            'mae': float(overall_mae),
            'rmse': float(overall_rmse)
        }
        
        return metrics
    
    def save_model(self, filepath: str) -> None:
        """
        Save model, scalers, and configuration.
        
        Args:
            filepath: Base path to save model files
        """
        if self.model is None or self.model.model is None:
            raise ValueError("No model to save")
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Save Keras model
        self.model.model.save(f"{filepath}_model.keras")
        
        # Save scalers
        import joblib
        joblib.dump(self.target_scaler, f"{filepath}_target_scaler.pkl")
        for feature, scaler in self.feature_scalers.items():
            joblib.dump(scaler, f"{filepath}_{feature}_scaler.pkl")
        
        # Save configuration
        with open(f"{filepath}_config.yaml", 'w') as f:
            yaml.dump(self.config, f, default_flow_style=False)
        
        # Save metadata
        metadata = {
            'symbol': self.config['symbol'],
            'model_type': 'transformer',
            'timestamp': datetime.utcnow().isoformat(),
            'feature_columns': list(self.feature_scalers.keys())
        }
        
        import json
        with open(f"{filepath}_metadata.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        self.logger.info(f"Model saved to {filepath}")
    
    def load_model(self, filepath: str) -> None:
        """
        Load model, scalers, and configuration.
        
        Args:
            filepath: Base path to load model files from
        """
        import json
        import joblib
        
        # Load configuration
        with open(f"{filepath}_config.yaml", 'r') as f:
            self.config = yaml.safe_load(f)
        
        # Load metadata
        with open(f"{filepath}_metadata.json", 'r') as f:
            metadata = json.load(f)
        
        # Create model with loaded configuration
        self.model = TransformerPricePredictor(
            sequence_length=self.config['model']['sequence_length'],
            n_features=len(metadata['feature_columns']),
            embed_dim=self.config['model']['embed_dim'],
            num_heads=self.config['model']['num_heads'],
            ff_dim=self.config['model']['ff_dim'],
            num_blocks=self.config['model']['num_blocks'],
            dropout_rate=self.config['model']['dropout_rate'],
            learning_rate=self.config['model']['learning_rate']
        )
        
        # Load Keras model
        self.model.model = tf.keras.models.load_model(
            f"{filepath}_model.keras",
            custom_objects={
                'custom_loss': TransformerPricePredictor.custom_loss
            }
        )
        
        # Load scalers
        self.target_scaler = joblib.load(f"{filepath}_target_scaler.pkl")
        for feature in metadata['feature_columns']:
            self.feature_scalers[feature] = joblib.load(f"{filepath}_{feature}_scaler.pkl")
        
        self.logger.info(f"Model loaded from {filepath}")
    
    def plot_training_history(self, history: Dict[str, Any], save_path: str = None) -> None:
        """
        Plot training history.
        
        Args:
            history: Training history
            save_path: Path to save the plot
        """
        plt.figure(figsize=(12, 8))
        
        # Plot loss
        plt.subplot(2, 2, 1)
        plt.plot(history['loss'], label='Training Loss')
        plt.plot(history['val_loss'], label='Validation Loss')
        plt.title('Loss')
        plt.xlabel('Epoch')
        plt.ylabel('Loss')
        plt.legend()
        
        # Plot MAE
        plt.subplot(2, 2, 2)
        plt.plot(history['mae'], label='Training MAE')
        plt.plot(history['val_mae'], label='Validation MAE')
        plt.title('Mean Absolute Error')
        plt.xlabel('Epoch')
        plt.ylabel('MAE')
        plt.legend()
        
        # Plot MSE
        plt.subplot(2, 2, 3)
        plt.plot(history['mse'], label='Training MSE')
        plt.plot(history['val_mse'], label='Validation MSE')
        plt.title('Mean Squared Error')
        plt.xlabel('Epoch')
        plt.ylabel('MSE')
        plt.legend()
        
        # Plot learning rate
        if 'lr' in history:
            plt.subplot(2, 2, 4)
            plt.plot(history['lr'])
            plt.title('Learning Rate')
            plt.xlabel('Epoch')
            plt.ylabel('Learning Rate')
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path)
            self.logger.info(f"Training history plot saved to {save_path}")
        
        plt.show()