"""
LSTM Time-Series Model for Trading Signal Prediction
======================================================
Institutional-grade LSTM implementation with sequence preparation,
early stopping, and production-ready training pipeline.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- 2-layer LSTM architecture with 128 hidden units
- Dropout regularization (0.3) to prevent overfitting
- Sequence preparation for time-series data
- Early stopping based on validation loss
- Comprehensive metrics (accuracy, precision, recall, F1)
- Model persistence with PyTorch format
- Training history tracking
- GPU support with automatic device detection
"""

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
import json
import logging
from pathlib import Path
from datetime import datetime
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report
)

logger = logging.getLogger(__name__)


@dataclass
class LSTMConfig:
    """Configuration for LSTM model"""

    # Model architecture
    input_size: int = None  # Number of features (set dynamically)
    hidden_size: int = 128  # LSTM hidden units
    num_layers: int = 2     # Number of LSTM layers
    dropout: float = 0.3    # Dropout rate
    bidirectional: bool = False  # Use bidirectional LSTM

    # Sequence parameters
    sequence_length: int = 20  # Number of time steps per sequence
    forecast_horizon: int = 1  # Predict N steps ahead

    # Training parameters
    batch_size: int = 64
    learning_rate: float = 0.001
    num_epochs: int = 100
    early_stopping_patience: int = 10

    # Regularization
    weight_decay: float = 1e-5  # L2 regularization
    grad_clip: float = 5.0      # Gradient clipping

    # Output
    num_classes: int = 3  # -1 (short), 0 (neutral), 1 (long)

    # Device
    device: str = 'auto'  # 'auto', 'cuda', 'cpu'

    # Reproducibility
    random_state: int = 42

    def __post_init__(self):
        """Set device automatically"""
        if self.device == 'auto':
            self.device = 'cuda' if torch.cuda.is_available() else 'cpu'


class TimeSeriesDataset(Dataset):
    """PyTorch Dataset for time-series sequences"""

    def __init__(self, X: np.ndarray, y: np.ndarray, sequence_length: int):
        """
        Args:
            X: Feature array (n_samples, n_features)
            y: Labels array (n_samples,)
            sequence_length: Length of each sequence
        """
        self.X = X
        self.y = y
        self.sequence_length = sequence_length

        # Calculate number of sequences
        self.n_sequences = len(X) - sequence_length + 1

    def __len__(self):
        return self.n_sequences

    def __getitem__(self, idx):
        """Get a single sequence"""
        # Extract sequence
        X_seq = self.X[idx:idx + self.sequence_length]

        # Label is at the end of sequence
        y_label = self.y[idx + self.sequence_length - 1]

        return torch.FloatTensor(X_seq), torch.LongTensor([y_label])[0]


class LSTMClassifier(nn.Module):
    """LSTM neural network for classification"""

    def __init__(self, config: LSTMConfig):
        super(LSTMClassifier, self).__init__()
        self.config = config

        # LSTM layer
        self.lstm = nn.LSTM(
            input_size=config.input_size,
            hidden_size=config.hidden_size,
            num_layers=config.num_layers,
            dropout=config.dropout if config.num_layers > 1 else 0,
            bidirectional=config.bidirectional,
            batch_first=True
        )

        # Calculate output size (bidirectional doubles hidden size)
        lstm_output_size = config.hidden_size * (2 if config.bidirectional else 1)

        # Dropout layer
        self.dropout = nn.Dropout(config.dropout)

        # Fully connected layers
        self.fc1 = nn.Linear(lstm_output_size, 64)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(64, config.num_classes)

    def forward(self, x):
        """
        Forward pass

        Args:
            x: Input tensor (batch_size, sequence_length, input_size)

        Returns:
            Output logits (batch_size, num_classes)
        """
        # LSTM forward
        # lstm_out: (batch_size, sequence_length, hidden_size * num_directions)
        # h_n: (num_layers * num_directions, batch_size, hidden_size)
        lstm_out, (h_n, c_n) = self.lstm(x)

        # Use last time step output
        # If bidirectional, concatenate last hidden states from both directions
        if self.config.bidirectional:
            # h_n[-2:] gets last layer's forward and backward hidden states
            last_hidden = torch.cat((h_n[-2], h_n[-1]), dim=1)
        else:
            last_hidden = h_n[-1]

        # Dropout
        out = self.dropout(last_hidden)

        # Fully connected layers
        out = self.fc1(out)
        out = self.relu(out)
        out = self.dropout(out)
        out = self.fc2(out)

        return out


class LSTMModel:
    """
    LSTM Model Manager with training, evaluation, and persistence

    Handles the complete lifecycle of LSTM model for trading signal prediction.
    """

    def __init__(self, config: Optional[LSTMConfig] = None):
        """Initialize LSTM model"""
        self.config = config or LSTMConfig()

        # Set random seeds for reproducibility
        torch.manual_seed(self.config.random_state)
        np.random.seed(self.config.random_state)
        if torch.cuda.is_available():
            torch.cuda.manual_seed(self.config.random_state)

        self.model = None
        self.optimizer = None
        self.criterion = None
        self.feature_names = None
        self.training_history = {
            'train_loss': [],
            'val_loss': [],
            'train_acc': [],
            'val_acc': [],
            'epoch': []
        }

        logger.info(f"Initialized LSTM model on device: {self.config.device}")

    def _prepare_sequences(
        self,
        X: pd.DataFrame,
        y: pd.Series
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Prepare time-series sequences from tabular data

        Args:
            X: Feature DataFrame (n_samples, n_features)
            y: Labels Series (n_samples,)

        Returns:
            X_seq: Sequence array
            y_seq: Aligned labels
        """
        # Convert to numpy
        X_np = X.values if isinstance(X, pd.DataFrame) else X
        y_np = y.values if isinstance(y, pd.Series) else y

        # Store feature names
        if isinstance(X, pd.DataFrame):
            self.feature_names = X.columns.tolist()

        # Normalize features (important for LSTM)
        from sklearn.preprocessing import StandardScaler
        if not hasattr(self, 'scaler'):
            self.scaler = StandardScaler()
            X_scaled = self.scaler.fit_transform(X_np)
        else:
            X_scaled = self.scaler.transform(X_np)

        return X_scaled, y_np

    def _convert_labels(self, y: np.ndarray) -> np.ndarray:
        """
        Convert labels from (-1, 0, 1) to (0, 1, 2) for PyTorch

        Args:
            y: Original labels (-1, 0, 1)

        Returns:
            Converted labels (0, 1, 2)
        """
        y_converted = y.copy()
        y_converted[y == -1] = 0  # Short
        y_converted[y == 0] = 1   # Neutral
        y_converted[y == 1] = 2   # Long
        return y_converted

    def _inverse_convert_labels(self, y: np.ndarray) -> np.ndarray:
        """
        Convert labels from (0, 1, 2) back to (-1, 0, 1)

        Args:
            y: Converted labels (0, 1, 2)

        Returns:
            Original labels (-1, 0, 1)
        """
        y_original = y.copy()
        y_original[y == 0] = -1  # Short
        y_original[y == 1] = 0   # Neutral
        y_original[y == 2] = 1   # Long
        return y_original

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None
    ) -> Dict[str, float]:
        """
        Train LSTM model with early stopping

        Args:
            X_train: Training features
            y_train: Training labels
            X_val: Validation features (optional)
            y_val: Validation labels (optional)

        Returns:
            Training metrics dictionary
        """
        logger.info("Preparing sequences for LSTM training...")

        # Prepare sequences
        X_train_scaled, y_train_np = self._prepare_sequences(X_train, y_train)

        # Convert labels
        y_train_converted = self._convert_labels(y_train_np)

        # Set input size from features
        if self.config.input_size is None:
            self.config.input_size = X_train_scaled.shape[1]

        # Create datasets
        train_dataset = TimeSeriesDataset(
            X_train_scaled,
            y_train_converted,
            self.config.sequence_length
        )

        train_loader = DataLoader(
            train_dataset,
            batch_size=self.config.batch_size,
            shuffle=True,
            num_workers=0
        )

        # Validation dataset
        val_loader = None
        if X_val is not None and y_val is not None:
            X_val_scaled, y_val_np = self._prepare_sequences(X_val, y_val)
            y_val_converted = self._convert_labels(y_val_np)

            val_dataset = TimeSeriesDataset(
                X_val_scaled,
                y_val_converted,
                self.config.sequence_length
            )

            val_loader = DataLoader(
                val_dataset,
                batch_size=self.config.batch_size,
                shuffle=False,
                num_workers=0
            )

        # Initialize model
        self.model = LSTMClassifier(self.config).to(self.config.device)

        # Loss and optimizer
        self.criterion = nn.CrossEntropyLoss()
        self.optimizer = optim.Adam(
            self.model.parameters(),
            lr=self.config.learning_rate,
            weight_decay=self.config.weight_decay
        )

        # Training loop
        best_val_loss = float('inf')
        patience_counter = 0

        logger.info(f"Training LSTM for up to {self.config.num_epochs} epochs...")

        for epoch in range(self.config.num_epochs):
            # Training phase
            self.model.train()
            train_loss = 0.0
            train_correct = 0
            train_total = 0

            for batch_X, batch_y in train_loader:
                batch_X = batch_X.to(self.config.device)
                batch_y = batch_y.to(self.config.device)

                # Forward pass
                self.optimizer.zero_grad()
                outputs = self.model(batch_X)
                loss = self.criterion(outputs, batch_y)

                # Backward pass
                loss.backward()

                # Gradient clipping
                torch.nn.utils.clip_grad_norm_(
                    self.model.parameters(),
                    self.config.grad_clip
                )

                self.optimizer.step()

                # Statistics
                train_loss += loss.item() * batch_X.size(0)
                _, predicted = torch.max(outputs.data, 1)
                train_total += batch_y.size(0)
                train_correct += (predicted == batch_y).sum().item()

            # Calculate training metrics
            train_loss = train_loss / train_total
            train_acc = train_correct / train_total

            # Validation phase
            val_loss = 0.0
            val_acc = 0.0

            if val_loader is not None:
                self.model.eval()
                val_correct = 0
                val_total = 0

                with torch.no_grad():
                    for batch_X, batch_y in val_loader:
                        batch_X = batch_X.to(self.config.device)
                        batch_y = batch_y.to(self.config.device)

                        outputs = self.model(batch_X)
                        loss = self.criterion(outputs, batch_y)

                        val_loss += loss.item() * batch_X.size(0)
                        _, predicted = torch.max(outputs.data, 1)
                        val_total += batch_y.size(0)
                        val_correct += (predicted == batch_y).sum().item()

                val_loss = val_loss / val_total
                val_acc = val_correct / val_total

                # Early stopping check
                if val_loss < best_val_loss:
                    best_val_loss = val_loss
                    patience_counter = 0
                    # Save best model
                    self.best_model_state = self.model.state_dict()
                else:
                    patience_counter += 1

            # Record history
            self.training_history['epoch'].append(epoch + 1)
            self.training_history['train_loss'].append(train_loss)
            self.training_history['train_acc'].append(train_acc)
            self.training_history['val_loss'].append(val_loss)
            self.training_history['val_acc'].append(val_acc)

            # Logging
            if (epoch + 1) % 10 == 0 or epoch == 0:
                logger.info(
                    f"Epoch [{epoch+1}/{self.config.num_epochs}] "
                    f"Train Loss: {train_loss:.4f}, Train Acc: {train_acc:.4f} | "
                    f"Val Loss: {val_loss:.4f}, Val Acc: {val_acc:.4f}"
                )

            # Early stopping
            if patience_counter >= self.config.early_stopping_patience:
                logger.info(f"Early stopping at epoch {epoch+1}")
                # Restore best model
                if hasattr(self, 'best_model_state'):
                    self.model.load_state_dict(self.best_model_state)
                break

        # Final evaluation
        metrics = self._calculate_metrics(X_train, y_train, "train")

        if X_val is not None and y_val is not None:
            val_metrics = self._calculate_metrics(X_val, y_val, "validation")
            metrics.update(val_metrics)

        logger.info(f"Training complete. Best val loss: {best_val_loss:.4f}")

        return metrics

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Make predictions on new data

        Args:
            X: Features DataFrame

        Returns:
            Predictions array (-1, 0, 1)
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        # Prepare sequences
        X_scaled, _ = self._prepare_sequences(X, pd.Series(np.zeros(len(X))))

        # Create dataset (dummy labels)
        dataset = TimeSeriesDataset(
            X_scaled,
            np.zeros(len(X_scaled)),  # Dummy labels
            self.config.sequence_length
        )

        data_loader = DataLoader(
            dataset,
            batch_size=self.config.batch_size,
            shuffle=False
        )

        # Predict
        self.model.eval()
        predictions = []

        with torch.no_grad():
            for batch_X, _ in data_loader:
                batch_X = batch_X.to(self.config.device)
                outputs = self.model(batch_X)
                _, predicted = torch.max(outputs.data, 1)
                predictions.extend(predicted.cpu().numpy())

        predictions = np.array(predictions)

        # Convert back to original labels (-1, 0, 1)
        predictions = self._inverse_convert_labels(predictions)

        return predictions

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict class probabilities

        Args:
            X: Features DataFrame

        Returns:
            Probability array (n_samples, n_classes)
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        # Prepare sequences
        X_scaled, _ = self._prepare_sequences(X, pd.Series(np.zeros(len(X))))

        # Create dataset
        dataset = TimeSeriesDataset(
            X_scaled,
            np.zeros(len(X_scaled)),
            self.config.sequence_length
        )

        data_loader = DataLoader(
            dataset,
            batch_size=self.config.batch_size,
            shuffle=False
        )

        # Predict probabilities
        self.model.eval()
        probabilities = []

        with torch.no_grad():
            for batch_X, _ in data_loader:
                batch_X = batch_X.to(self.config.device)
                outputs = self.model(batch_X)

                # Apply softmax to get probabilities
                probs = torch.softmax(outputs, dim=1)
                probabilities.extend(probs.cpu().numpy())

        return np.array(probabilities)

    def _calculate_metrics(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        prefix: str = ""
    ) -> Dict[str, float]:
        """Calculate comprehensive metrics"""
        y_pred = self.predict(X)

        # Align predictions with labels (account for sequence length)
        y_true = y.values[self.config.sequence_length - 1:]
        y_pred_aligned = y_pred[:len(y_true)]

        metrics = {
            f'{prefix}_accuracy': accuracy_score(y_true, y_pred_aligned),
            f'{prefix}_precision': precision_score(y_true, y_pred_aligned, average='weighted', zero_division=0),
            f'{prefix}_recall': recall_score(y_true, y_pred_aligned, average='weighted', zero_division=0),
            f'{prefix}_f1': f1_score(y_true, y_pred_aligned, average='weighted', zero_division=0)
        }

        # Per-class metrics
        for label, name in [(-1, 'short'), (0, 'neutral'), (1, 'long')]:
            if label in y_true:
                precision = precision_score(y_true, y_pred_aligned, labels=[label], average='micro', zero_division=0)
                recall = recall_score(y_true, y_pred_aligned, labels=[label], average='micro', zero_division=0)
                metrics[f'{prefix}_precision_{name}'] = precision
                metrics[f'{prefix}_recall_{name}'] = recall

        return metrics

    def save(self, filepath: str):
        """
        Save model to disk

        Args:
            filepath: Path to save model (without extension)
        """
        if self.model is None:
            raise ValueError("No model to save")

        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Save PyTorch model
        model_path = filepath.with_suffix('.pth')
        torch.save({
            'model_state_dict': self.model.state_dict(),
            'config': asdict(self.config),
            'feature_names': self.feature_names,
            'scaler_mean': self.scaler.mean_.tolist(),
            'scaler_scale': self.scaler.scale_.tolist(),
            'training_history': self.training_history
        }, model_path)

        # Save metadata
        metadata = {
            'model_type': 'LSTM',
            'version': '1.0',
            'created_at': datetime.now().isoformat(),
            'config': asdict(self.config),
            'num_features': self.config.input_size,
            'feature_names': self.feature_names,
            'device': self.config.device
        }

        metadata_path = filepath.with_suffix('.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Model saved to {model_path}")
        logger.info(f"Metadata saved to {metadata_path}")

    def load(self, filepath: str):
        """
        Load model from disk

        Args:
            filepath: Path to model file (without extension)
        """
        filepath = Path(filepath)
        model_path = filepath.with_suffix('.pth')

        if not model_path.exists():
            raise FileNotFoundError(f"Model file not found: {model_path}")

        # Load checkpoint
        checkpoint = torch.load(model_path, map_location=self.config.device)

        # Restore config
        self.config = LSTMConfig(**checkpoint['config'])

        # Restore feature names
        self.feature_names = checkpoint['feature_names']

        # Restore scaler
        from sklearn.preprocessing import StandardScaler
        self.scaler = StandardScaler()
        self.scaler.mean_ = np.array(checkpoint['scaler_mean'])
        self.scaler.scale_ = np.array(checkpoint['scaler_scale'])

        # Restore training history
        self.training_history = checkpoint['training_history']

        # Initialize and load model
        self.model = LSTMClassifier(self.config).to(self.config.device)
        self.model.load_state_dict(checkpoint['model_state_dict'])
        self.model.eval()

        logger.info(f"Model loaded from {model_path}")

    def get_training_summary(self) -> Dict:
        """Get summary of training process"""
        if not self.training_history['epoch']:
            return {"message": "No training history available"}

        summary = {
            'total_epochs': len(self.training_history['epoch']),
            'final_train_loss': self.training_history['train_loss'][-1],
            'final_train_acc': self.training_history['train_acc'][-1],
            'final_val_loss': self.training_history['val_loss'][-1],
            'final_val_acc': self.training_history['val_acc'][-1],
            'best_val_loss': min(self.training_history['val_loss']) if self.training_history['val_loss'] else None,
            'best_val_acc': max(self.training_history['val_acc']) if self.training_history['val_acc'] else None,
            'device': self.config.device,
            'hidden_size': self.config.hidden_size,
            'num_layers': self.config.num_layers,
            'sequence_length': self.config.sequence_length
        }

        return summary


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Example: Create synthetic time-series data
    np.random.seed(42)
    n_samples = 1000
    n_features = 50

    # Generate features
    X = pd.DataFrame(
        np.random.randn(n_samples, n_features),
        columns=[f'feature_{i}' for i in range(n_features)]
    )

    # Generate labels (trending based on some features)
    y_values = (X.iloc[:, :5].sum(axis=1) > 0).astype(int)
    y_values[y_values == 0] = -1  # Convert to -1, 1
    y = pd.Series(y_values)

    # Add some neutral labels
    neutral_idx = np.random.choice(n_samples, size=int(n_samples * 0.3), replace=False)
    y.iloc[neutral_idx] = 0

    # Train/test split
    split_idx = int(0.8 * n_samples)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # Train model
    config = LSTMConfig(
        sequence_length=20,
        hidden_size=128,
        num_layers=2,
        dropout=0.3,
        batch_size=64,
        num_epochs=50,
        early_stopping_patience=10
    )

    model = LSTMModel(config)

    print("\n=== Training LSTM Model ===")
    metrics = model.train(X_train, y_train, X_test, y_test)

    print("\n=== Training Metrics ===")
    for key, value in metrics.items():
        print(f"{key}: {value:.4f}")

    print("\n=== Training Summary ===")
    summary = model.get_training_summary()
    for key, value in summary.items():
        print(f"{key}: {value}")

    # Save model
    model.save('ai-ml/models/saved/lstm_model')
    print("\n✅ Model saved successfully")

    # Test prediction
    predictions = model.predict(X_test)
    probabilities = model.predict_proba(X_test)

    print(f"\n=== Predictions ===")
    print(f"Shape: {predictions.shape}")
    print(f"Unique values: {np.unique(predictions)}")
    print(f"Probability shape: {probabilities.shape}")
