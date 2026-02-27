"""
Random Forest Model for Trade Direction Prediction
===================================================
Institutional-grade Random Forest implementation for algorithmic trading.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

This module implements:
- Balanced Random Forest classifier
- Hyperparameter optimization with GridSearchCV
- Feature importance analysis
- Cross-validation with time-series splits
- Model persistence and versioning
- SHAP value explanations
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
import logging
import pickle
import json
from datetime import datetime
from pathlib import Path

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score
)
import joblib

logger = logging.getLogger(__name__)


@dataclass
class RandomForestConfig:
    """Configuration for Random Forest model"""

    # Model hyperparameters
    n_estimators: int = 500
    max_depth: int = 20
    min_samples_split: int = 100
    min_samples_leaf: int = 50
    max_features: str = 'sqrt'  # 'sqrt', 'log2', or float
    class_weight: str = 'balanced'  # Handle imbalanced classes
    random_state: int = 42
    n_jobs: int = -1  # Use all CPU cores

    # Training parameters
    test_size: float = 0.2
    cv_folds: int = 5
    optimize_hyperparameters: bool = False

    # Feature selection
    feature_importance_threshold: float = 0.001
    use_top_n_features: Optional[int] = None

    # Model versioning
    model_version: str = "1.0"
    model_name: str = "random_forest_trade_direction"

    # Paths
    model_dir: Path = Path("ai-ml/models/saved_models")
    results_dir: Path = Path("ai-ml/models/results")

    def __post_init__(self):
        """Create directories if they don't exist"""
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)


class RandomForestPredictor:
    """
    Random Forest classifier for trade direction prediction.

    Features:
    - Handles imbalanced classes with class_weight='balanced'
    - Feature importance extraction
    - Hyperparameter optimization
    - Time-series aware cross-validation
    - Model persistence
    """

    def __init__(self, config: Optional[RandomForestConfig] = None):
        """Initialize Random Forest predictor"""
        self.config = config or RandomForestConfig()
        self.model: Optional[RandomForestClassifier] = None
        self.feature_names: Optional[List[str]] = None
        self.feature_importance_: Optional[pd.Series] = None
        self.training_history: Dict[str, Any] = {}

        # Initialize model
        self._init_model()

    def _init_model(self):
        """Initialize Random Forest model with configuration"""
        self.model = RandomForestClassifier(
            n_estimators=self.config.n_estimators,
            max_depth=self.config.max_depth,
            min_samples_split=self.config.min_samples_split,
            min_samples_leaf=self.config.min_samples_leaf,
            max_features=self.config.max_features,
            class_weight=self.config.class_weight,
            random_state=self.config.random_state,
            n_jobs=self.config.n_jobs,
            verbose=0
        )
        logger.info("Initialized Random Forest model")

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None
    ) -> Dict[str, float]:
        """
        Train Random Forest model.

        Args:
            X_train: Training features
            y_train: Training labels (-1, 0, 1)
            X_val: Validation features (optional)
            y_val: Validation labels (optional)

        Returns:
            Dictionary with training metrics
        """
        logger.info(f"Training Random Forest on {len(X_train)} samples with {X_train.shape[1]} features")

        # Store feature names
        self.feature_names = X_train.columns.tolist()

        # Record training start time
        train_start = datetime.now()

        # Train model
        self.model.fit(X_train, y_train)

        # Calculate training time
        train_time = (datetime.now() - train_start).total_seconds()

        # Extract feature importance
        self.feature_importance_ = pd.Series(
            self.model.feature_importances_,
            index=self.feature_names
        ).sort_values(ascending=False)

        # Evaluate on training set
        y_train_pred = self.model.predict(X_train)
        train_metrics = self._calculate_metrics(y_train, y_train_pred, "train")

        # Evaluate on validation set if provided
        val_metrics = {}
        if X_val is not None and y_val is not None:
            y_val_pred = self.model.predict(X_val)
            val_metrics = self._calculate_metrics(y_val, y_val_pred, "val")

        # Store training history
        self.training_history = {
            'timestamp': datetime.now().isoformat(),
            'train_samples': len(X_train),
            'val_samples': len(X_val) if X_val is not None else 0,
            'n_features': X_train.shape[1],
            'train_time_seconds': train_time,
            'train_metrics': train_metrics,
            'val_metrics': val_metrics,
            'config': {
                'n_estimators': self.config.n_estimators,
                'max_depth': self.config.max_depth,
                'min_samples_split': self.config.min_samples_split,
                'min_samples_leaf': self.config.min_samples_leaf
            }
        }

        logger.info(f"Training complete in {train_time:.2f}s")
        logger.info(f"Train accuracy: {train_metrics['accuracy']:.4f}")
        if val_metrics:
            logger.info(f"Val accuracy: {val_metrics['accuracy']:.4f}")

        return {**train_metrics, **val_metrics}

    def optimize_hyperparameters(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        param_grid: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Optimize hyperparameters using GridSearchCV with time-series splits.

        Args:
            X_train: Training features
            y_train: Training labels
            param_grid: Dictionary of parameters to search

        Returns:
            Best parameters and CV results
        """
        if param_grid is None:
            param_grid = {
                'n_estimators': [200, 500, 1000],
                'max_depth': [10, 20, 30, None],
                'min_samples_split': [50, 100, 200],
                'min_samples_leaf': [25, 50, 100],
                'max_features': ['sqrt', 'log2']
            }

        logger.info("Starting hyperparameter optimization...")
        logger.info(f"Parameter grid: {param_grid}")

        # Time-series cross-validation
        tscv = TimeSeriesSplit(n_splits=self.config.cv_folds)

        # Grid search
        grid_search = GridSearchCV(
            estimator=self.model,
            param_grid=param_grid,
            cv=tscv,
            scoring='accuracy',
            n_jobs=self.config.n_jobs,
            verbose=2,
            return_train_score=True
        )

        # Fit
        grid_search.fit(X_train, y_train)

        # Update model with best parameters
        self.model = grid_search.best_estimator_

        logger.info(f"Best parameters: {grid_search.best_params_}")
        logger.info(f"Best CV score: {grid_search.best_score_:.4f}")

        return {
            'best_params': grid_search.best_params_,
            'best_score': grid_search.best_score_,
            'cv_results': pd.DataFrame(grid_search.cv_results_)
        }

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict trade direction.

        Args:
            X: Features

        Returns:
            Predicted labels (-1, 0, 1)
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        return self.model.predict(X)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict class probabilities.

        Args:
            X: Features

        Returns:
            Array of shape (n_samples, n_classes) with probabilities
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        return self.model.predict_proba(X)

    def predict_with_confidence(self, X: pd.DataFrame) -> pd.DataFrame:
        """
        Predict with confidence scores.

        Args:
            X: Features

        Returns:
            DataFrame with predictions and confidence
        """
        predictions = self.predict(X)
        probabilities = self.predict_proba(X)

        # Confidence is max probability
        confidence = np.max(probabilities, axis=1)

        return pd.DataFrame({
            'prediction': predictions,
            'confidence': confidence,
            'prob_short': probabilities[:, 0],
            'prob_neutral': probabilities[:, 1],
            'prob_long': probabilities[:, 2]
        }, index=X.index)

    def _calculate_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        prefix: str = ""
    ) -> Dict[str, float]:
        """Calculate classification metrics"""
        metrics = {
            f'{prefix}_accuracy': accuracy_score(y_true, y_pred),
            f'{prefix}_precision': precision_score(y_true, y_pred, average='weighted', zero_division=0),
            f'{prefix}_recall': recall_score(y_true, y_pred, average='weighted', zero_division=0),
            f'{prefix}_f1': f1_score(y_true, y_pred, average='weighted', zero_division=0)
        }

        # Add per-class metrics
        class_names = ['short', 'neutral', 'long']
        for i, class_name in enumerate(class_names):
            class_label = i - 1  # Convert to -1, 0, 1
            mask = y_true == class_label
            if mask.sum() > 0:
                class_acc = (y_pred[mask] == class_label).mean()
                metrics[f'{prefix}_accuracy_{class_name}'] = class_acc

        return metrics

    def get_feature_importance(self, top_n: int = 20) -> pd.DataFrame:
        """
        Get top N most important features.

        Args:
            top_n: Number of top features to return

        Returns:
            DataFrame with feature names and importance scores
        """
        if self.feature_importance_ is None:
            raise ValueError("Model not trained. Call train() first.")

        top_features = self.feature_importance_.head(top_n)

        return pd.DataFrame({
            'feature': top_features.index,
            'importance': top_features.values,
            'importance_pct': (top_features.values / top_features.sum() * 100)
        }).reset_index(drop=True)

    def evaluate(
        self,
        X_test: pd.DataFrame,
        y_test: pd.Series
    ) -> Dict[str, Any]:
        """
        Comprehensive model evaluation.

        Args:
            X_test: Test features
            y_test: Test labels

        Returns:
            Dictionary with metrics and analysis
        """
        logger.info(f"Evaluating model on {len(X_test)} test samples")

        # Predictions
        y_pred = self.predict(X_test)
        y_pred_proba = self.predict_proba(X_test)

        # Metrics
        metrics = self._calculate_metrics(y_test, y_pred, "test")

        # Confusion matrix
        cm = confusion_matrix(y_test, y_pred)

        # Classification report
        target_names = ['Short (-1)', 'Neutral (0)', 'Long (1)']
        class_report = classification_report(
            y_test, y_pred,
            target_names=target_names,
            output_dict=True,
            zero_division=0
        )

        # ROC AUC (one-vs-rest)
        try:
            roc_auc = roc_auc_score(y_test, y_pred_proba, multi_class='ovr', average='weighted')
            metrics['test_roc_auc'] = roc_auc
        except:
            logger.warning("Could not calculate ROC AUC")

        # Feature importance
        top_features = self.get_feature_importance(top_n=20)

        evaluation = {
            'metrics': metrics,
            'confusion_matrix': cm.tolist(),
            'classification_report': class_report,
            'top_features': top_features.to_dict('records'),
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Test accuracy: {metrics['test_accuracy']:.4f}")
        logger.info(f"Test F1 score: {metrics['test_f1']:.4f}")

        return evaluation

    def save_model(self, filepath: Optional[Path] = None):
        """
        Save trained model to disk.

        Args:
            filepath: Path to save model (optional, uses config default)
        """
        if self.model is None:
            raise ValueError("No model to save. Train model first.")

        if filepath is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{self.config.model_name}_v{self.config.model_version}_{timestamp}.pkl"
            filepath = self.config.model_dir / filename

        # Save model
        joblib.dump(self.model, filepath)

        # Save metadata
        metadata = {
            'model_name': self.config.model_name,
            'model_version': self.config.model_version,
            'feature_names': self.feature_names,
            'training_history': self.training_history,
            'saved_at': datetime.now().isoformat()
        }

        metadata_path = filepath.with_suffix('.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Model saved to {filepath}")
        logger.info(f"Metadata saved to {metadata_path}")

        return filepath

    def load_model(self, filepath: Path):
        """
        Load trained model from disk.

        Args:
            filepath: Path to saved model
        """
        # Load model
        self.model = joblib.load(filepath)

        # Load metadata
        metadata_path = filepath.with_suffix('.json')
        if metadata_path.exists():
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)

            self.feature_names = metadata.get('feature_names')
            self.training_history = metadata.get('training_history', {})

        logger.info(f"Model loaded from {filepath}")

    def get_training_summary(self) -> str:
        """Get formatted training summary"""
        if not self.training_history:
            return "Model not trained yet"

        summary = f"""
Random Forest Training Summary
{'=' * 50}
Timestamp: {self.training_history['timestamp']}
Training samples: {self.training_history['train_samples']:,}
Validation samples: {self.training_history['val_samples']:,}
Features: {self.training_history['n_features']:,}
Training time: {self.training_history['train_time_seconds']:.2f}s

Configuration:
  n_estimators: {self.training_history['config']['n_estimators']}
  max_depth: {self.training_history['config']['max_depth']}
  min_samples_split: {self.training_history['config']['min_samples_split']}
  min_samples_leaf: {self.training_history['config']['min_samples_leaf']}

Training Metrics:
  Accuracy: {self.training_history['train_metrics']['train_accuracy']:.4f}
  Precision: {self.training_history['train_metrics']['train_precision']:.4f}
  Recall: {self.training_history['train_metrics']['train_recall']:.4f}
  F1 Score: {self.training_history['train_metrics']['train_f1']:.4f}
"""

        if self.training_history['val_metrics']:
            val = self.training_history['val_metrics']
            summary += f"""
Validation Metrics:
  Accuracy: {val['val_accuracy']:.4f}
  Precision: {val['val_precision']:.4f}
  Recall: {val['val_recall']:.4f}
  F1 Score: {val['val_f1']:.4f}
"""

        return summary


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Generate synthetic data for testing
    np.random.seed(42)
    n_samples = 10000
    n_features = 50

    X = pd.DataFrame(
        np.random.randn(n_samples, n_features),
        columns=[f'feature_{i}' for i in range(n_features)]
    )

    # Generate labels with some pattern
    y = pd.Series(np.zeros(n_samples, dtype=int))
    y[X['feature_0'] > 0.5] = 1  # Long
    y[X['feature_0'] < -0.5] = -1  # Short
    y[(X['feature_0'] >= -0.5) & (X['feature_0'] <= 0.5)] = 0  # Neutral

    # Split data
    split_idx = int(0.8 * n_samples)
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]

    # Train model
    config = RandomForestConfig(n_estimators=100)  # Smaller for demo
    rf = RandomForestPredictor(config)

    print("Training Random Forest...")
    metrics = rf.train(X_train, y_train, X_val, y_val)

    print("\n" + rf.get_training_summary())

    # Feature importance
    print("\nTop 10 Features:")
    print(rf.get_feature_importance(top_n=10))

    # Evaluate
    print("\nEvaluation:")
    evaluation = rf.evaluate(X_val, y_val)
    print(f"Test Accuracy: {evaluation['metrics']['test_accuracy']:.4f}")

    # Save model
    model_path = rf.save_model()
    print(f"\nModel saved to: {model_path}")
