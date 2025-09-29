import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, RobustScaler
from sklearn.model_selection import TimeSeriesSplit
import joblib
import yaml
from typing import Dict, Any
import logging
from model import LSTMPricePredictor

class LSTMTrainingPipeline:
    """
    Complete training pipeline for LSTM price prediction model
    """
    
    def __init__(self, config_path: str):
        """Initialize with configuration"""
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.logger = logging.getLogger(__name__)
        self.scaler = RobustScaler()  # More robust to outliers than StandardScaler
        
    def load_and_preprocess_data(self, data_path: str) -> pd.DataFrame:
        """
        Load and preprocess market data
        
        Args:
            data_path: Path to data file
            
        Returns:
            Preprocessed DataFrame
        """
        # Load data
        df = pd.read_csv(data_path)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df.set_index('timestamp', inplace=True)
        
        # Feature engineering
        df = self.engineer_features(df)
        
        # Handle missing values
        df = df.dropna()
        
        # Remove outliers using IQR method
        df = self.remove_outliers(df)
        
        self.logger.info(f"Data shape after preprocessing: {df.shape}")
        
        return df
    
    def engineer_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Engineer technical and market microstructure features
        
        Args:
            df: Raw market data DataFrame
            
        Returns:
            DataFrame with engineered features
        """
        # Price features
        df['returns'] = df['close'].pct_change()
        df['log_returns'] = np.log(df['close'] / df['close'].shift(1))
        
        # Technical indicators
        # Moving averages
        for window in [5, 10, 20, 50]:
            df[f'sma_{window}'] = df['close'].rolling(window).mean()
            df[f'ema_{window}'] = df['close'].ewm(span=window).mean()
        
        # Bollinger Bands
        df['bb_upper'] = df['sma_20'] + 2 * df['close'].rolling(20).std()
        df['bb_lower'] = df['sma_20'] - 2 * df['close'].rolling(20).std()
        df['bb_width'] = (df['bb_upper'] - df['bb_lower']) / df['sma_20']
        
        # RSI
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD
        exp1 = df['close'].ewm(span=12).mean()
        exp2 = df['close'].ewm(span=26).mean()
        df['macd'] = exp1 - exp2
        df['macd_signal'] = df['macd'].ewm(span=9).mean()
        df['macd_histogram'] = df['macd'] - df['macd_signal']
        
        # Volatility features
        df['volatility'] = df['returns'].rolling(20).std()
        df['high_low_pct'] = (df['high'] - df['low']) / df['close']
        
        # Volume features
        df['volume_sma'] = df['volume'].rolling(20).mean()
        df['volume_ratio'] = df['volume'] / df['volume_sma']
        
        # Market microstructure
        df['bid_ask_spread'] = (df['ask'] - df['bid']) / df['close']
        df['order_imbalance'] = (df['bid_size'] - df['ask_size']) / (df['bid_size'] + df['ask_size'])
        
        # Time-based features
        df['hour'] = df.index.hour
        df['day_of_week'] = df.index.dayofweek
        df['month'] = df.index.month
        
        # Lag features
        for lag in range(1, 6):
            df[f'close_lag_{lag}'] = df['close'].shift(lag)
            df[f'volume_lag_{lag}'] = df['volume'].shift(lag)
            df[f'returns_lag_{lag}'] = df['returns'].shift(lag)
        
        return df
    
    def remove_outliers(self, df: pd.DataFrame, threshold: float = 3.0) -> pd.DataFrame:
        """
        Remove outliers using modified Z-score
        
        Args:
            df: Input DataFrame
            threshold: Z-score threshold for outlier detection
            
        Returns:
            DataFrame without outliers
        """
        numeric_columns = df.select_dtypes(include=[np.number]).columns
        
        for col in numeric_columns:
            median = df[col].median()
            mad = np.median(np.abs(df[col] - median))
            modified_z_scores = 0.6745 * (df[col] - median) / mad
            df = df[np.abs(modified_z_scores) < threshold]
        
        return df
    
    def prepare_training_data(self, df: pd.DataFrame) -> Dict[str, np.ndarray]:
        """
        Prepare data for LSTM training
        
        Args:
            df: Preprocessed DataFrame
            
        Returns:
            Dictionary with training arrays
        """
        # Select features for training
        feature_columns = [col for col in df.columns if col not in ['close']]
        
        # Scale features
        scaled_features = self.scaler.fit_transform(df[feature_columns])
        
        # Save scaler
        joblib.dump(self.scaler, 'feature_scaler.pkl')
        
        # Create LSTM sequences
        predictor = LSTMPricePredictor(
            sequence_length=self.config['model']['sequence_length'],
            n_features=len(feature_columns),
            **self.config['model']['params']
        )
        
        X, y = predictor.prepare_sequences(scaled_features)
        
        # Time series split for validation
        tscv = TimeSeriesSplit(n_splits=3)
        train_idx, val_idx = list(tscv.split(X))[-1]  # Use last split
        
        return {
            'X_train': X[train_idx],
            'y_train': y[train_idx],
            'X_val': X[val_idx],
            'y_val': y[val_idx],
            'feature_columns': feature_columns
        }
    
    def train_model(self, data_path: str, model_save_path: str = None) -> Dict[str, Any]:
        """
        Complete training pipeline
        
        Args:
            data_path: Path to training data
            model_save_path: Path to save trained model
            
        Returns:
            Training results and metrics
        """
        # Load and preprocess data
        df = self.load_and_preprocess_data(data_path)
        
        # Prepare training data
        train_data = self.prepare_training_data(df)
        
        # Initialize model
        model = LSTMPricePredictor(
            symbol=self.config['symbol'],
            sequence_length=self.config['model']['sequence_length'],
            n_features=len(train_data['feature_columns']),
            lstm_units=self.config['model']['params'].get('lstm_units', [128, 64, 32]),
            dropout_rate=self.config['model']['params'].get('dropout_rate', 0.2),
            learning_rate=self.config['model']['params'].get('learning_rate', 0.001)
        )
        
        # Train model
        history = model.train(
            X_train=train_data['X_train'],
            y_train=train_data['y_train'],
            X_val=train_data['X_val'],
            y_val=train_data['y_val'],
            epochs=self.config['training']['epochs'],
            batch_size=self.config['training']['batch_size']
        )
        
        # Save model
        training_data['predictor'].save_model('lstm_price_predictor.h5')
        
        # Evaluate model
        self.evaluate_model(training_data, history)
        
        self.logger.info("Training pipeline completed successfully")
    
    def evaluate_model(self, training_data: Dict, history):
        """Evaluate trained model"""
        # Validation predictions
        val_predictions = training_data['predictor'].predict(training_data['X_val'])
        
        # Calculate metrics
        mae = np.mean(np.abs(val_predictions - training_data['y_val']))
        rmse = np.sqrt(np.mean((val_predictions - training_data['y_val'])**2))
        
        # Directional accuracy
        true_directions = np.sign(training_data['y_val'][:, 1:] - training_data['y_val'][:, :-1])
        pred_directions = np.sign(val_predictions[:, 1:] - val_predictions[:, :-1])
        directional_accuracy = np.mean(true_directions == pred_directions)
        
        self.logger.info(f"Validation MAE: {mae:.6f}")
        self.logger.info(f"Validation RMSE: {rmse:.6f}")
        self.logger.info(f"Directional Accuracy: {directional_accuracy:.4f}")