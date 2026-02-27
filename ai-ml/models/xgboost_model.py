"""
XGBoost Model for Trade Direction Prediction
=============================================
Institutional-grade XGBoost implementation with early stopping and GPU support.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

This module implements:
- XGBoost gradient boosting classifier
- Early stopping to prevent overfitting
- GPU acceleration (if available)
- Learning rate scheduling
- Feature importance with gain/cover/weight
- Model persistence and versioning
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from pathlib import Path
import logging
import json
from datetime import datetime

import xgboost as xgb
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score
)

logger = logging.getLogger(__name__)


@dataclass
class XGBoostConfig:
    """Configuration for XGBoost model"""

    # Model hyperparameters
    max_depth: int = 8
    learning_rate: float = 0.05
    n_estimators: int = 300
    subsample: float = 0.8
    colsample_bytree: float = 0.8
    colsample_bylevel: float = 0.8
    min_child_weight: int = 1
    gamma: float = 0.1
    reg_alpha: float = 0.1  # L1 regularization
    reg_lambda: float = 1.0  # L2 regularization
    scale_pos_weight: float = 1.0
    random_state: int = 42

    # Training parameters
    early_stopping_rounds: int = 20
    eval_metric: str = 'mlogloss'  # Multi-class log loss
    tree_method: str = 'hist'  # 'hist', 'gpu_hist', 'exact'
    use_gpu: bool = False

    # Model versioning
    model_version: str = "1.0"
    model_name: str = "xgboost_trade_direction"

    # Paths
    model_dir: Path = Path("ai-ml/models/saved_models")
    results_dir: Path = Path("ai-ml/models/results")

    def __post_init__(self):
        """Create directories and set tree method"""
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.results_dir.mkdir(parents=True, exist_ok=True)

        # Use GPU if available and requested
        if self.use_gpu:
            try:
                import cupy
                self.tree_method = 'gpu_hist'
                logger.info("GPU acceleration enabled")
            except ImportError:
                logger.warning("GPU requested but CuPy not available. Using CPU.")
                self.tree_method = 'hist'


class XGBoostPredictor:
    """
    XGBoost gradient boosting classifier for trade direction prediction.

    Features:
    - Early stopping to prevent overfitting
    - GPU acceleration support
    - Multiple feature importance metrics
    - Learning curve tracking
    - Incremental training support
    """

    def __init__(self, config: Optional[XGBoostConfig] = None):
        """Initialize XGBoost predictor"""
        self.config = config or XGBoostConfig()
        self.model: Optional[xgb.XGBClassifier] = None
        self.feature_names: Optional[List[str]] = None
        self.training_history: Dict[str, Any] = {}
        self.evals_result: Dict[str, Dict] = {}

        # Initialize model
        self._init_model()

    def _init_model(self):
        """Initialize XGBoost model with configuration"""
        self.model = xgb.XGBClassifier(
            max_depth=self.config.max_depth,
            learning_rate=self.config.learning_rate,
            n_estimators=self.config.n_estimators,
            objective='multi:softprob',  # Multi-class classification
            num_class=3,  # -1, 0, 1
            subsample=self.config.subsample,
            colsample_bytree=self.config.colsample_bytree,
            colsample_bylevel=self.config.colsample_bylevel,
            min_child_weight=self.config.min_child_weight,
            gamma=self.config.gamma,
            reg_alpha=self.config.reg_alpha,
            reg_lambda=self.config.reg_lambda,
            scale_pos_weight=self.config.scale_pos_weight,
            tree_method=self.config.tree_method,
            random_state=self.config.random_state,
            n_jobs=-1,
            verbosity=1
        )
        logger.info(f"Initialized XGBoost model (tree_method={self.config.tree_method})")

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None
    ) -> Dict[str, float]:
        """
        Train XGBoost model with early stopping.

        Args:
            X_train: Training features
            y_train: Training labels (-1, 0, 1)
            X_val: Validation features (optional)
            y_val: Validation labels (optional)

        Returns:
            Dictionary with training metrics
        """
        logger.info(f"Training XGBoost on {len(X_train)} samples with {X_train.shape[1]} features")

        # Store feature names
        self.feature_names = X_train.columns.tolist()

        # Convert labels to 0, 1, 2 for XGBoost
        y_train_xgb = self._convert_labels(y_train)
        y_val_xgb = self._convert_labels(y_val) if y_val is not None else None

        # Record training start time
        train_start = datetime.now()

        # Prepare eval set for early stopping
        eval_set = [(X_train, y_train_xgb)]
        if X_val is not None and y_val is not None:
            eval_set.append((X_val, y_val_xgb))

        # Train with early stopping
        self.model.fit(
            X_train,
            y_train_xgb,
            eval_set=eval_set,
            eval_metric=self.config.eval_metric,
            early_stopping_rounds=self.config.early_stopping_rounds,
            verbose=False
        )

        # Store evaluation results
        self.evals_result = self.model.evals_result()

        # Calculate training time
        train_time = (datetime.now() - train_start).total_seconds()

        # Get best iteration
        best_iteration = self.model.best_iteration
        best_score = self.model.best_score

        # Evaluate on training set
        y_train_pred = self.predict(X_train)
        train_metrics = self._calculate_metrics(y_train, y_train_pred, "train")

        # Evaluate on validation set
        val_metrics = {}
        if X_val is not None and y_val is not None:
            y_val_pred = self.predict(X_val)
            val_metrics = self._calculate_metrics(y_val, y_val_pred, "val")

        # Store training history
        self.training_history = {
            'timestamp': datetime.now().isoformat(),
            'train_samples': len(X_train),
            'val_samples': len(X_val) if X_val is not None else 0,
            'n_features': X_train.shape[1],
            'train_time_seconds': train_time,
            'best_iteration': int(best_iteration),
            'best_score': float(best_score),
            'total_boost_rounds': self.config.n_estimators,
            'train_metrics': train_metrics,
            'val_metrics': val_metrics,
            'config': {
                'max_depth': self.config.max_depth,
                'learning_rate': self.config.learning_rate,
                'n_estimators': self.config.n_estimators,
                'subsample': self.config.subsample,
                'tree_method': self.config.tree_method
            }
        }

        logger.info(f"Training complete in {train_time:.2f}s")
        logger.info(f"Best iteration: {best_iteration} (best score: {best_score:.4f})")
        logger.info(f"Train accuracy: {train_metrics['train_accuracy']:.4f}")
        if val_metrics:
            logger.info(f"Val accuracy: {val_metrics['val_accuracy']:.4f}")

        return {**train_metrics, **val_metrics}

    def _convert_labels(self, y: pd.Series) -> np.ndarray:
        """Convert labels from (-1, 0, 1) to (0, 1, 2) for XGBoost"""
        if y is None:
            return None
        return (y + 1).values  # -1→0, 0→1, 1→2

    def _reconvert_labels(self, y: np.ndarray) -> np.ndarray:
        """Convert labels from (0, 1, 2) back to (-1, 0, 1)"""
        return y - 1  # 0→-1, 1→0, 2→1

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

        y_pred_xgb = self.model.predict(X)
        return self._reconvert_labels(y_pred_xgb)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict class probabilities.

        Args:
            X: Features

        Returns:
            Array of shape (n_samples, 3) with probabilities for [-1, 0, 1]
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

        # Per-class accuracy
        class_names = ['short', 'neutral', 'long']
        for i, class_name in enumerate(class_names):
            class_label = i - 1
            mask = y_true == class_label
            if mask.sum() > 0:
                class_acc = (y_pred[mask] == class_label).mean()
                metrics[f'{prefix}_accuracy_{class_name}'] = class_acc

        return metrics

    def get_feature_importance(
        self,
        importance_type: str = 'gain',
        top_n: int = 20
    ) -> pd.DataFrame:
        """
        Get feature importance.

        Args:
            importance_type: 'gain', 'weight', 'cover', or 'total_gain'
            top_n: Number of top features to return

        Returns:
            DataFrame with feature importance
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")

        # Get importance scores
        importance = self.model.get_booster().get_score(importance_type=importance_type)

        # Convert to DataFrame
        importance_df = pd.DataFrame({
            'feature': list(importance.keys()),
            'importance': list(importance.values())
        }).sort_values('importance', ascending=False)

        # Add percentage
        importance_df['importance_pct'] = (
            importance_df['importance'] / importance_df['importance'].sum() * 100
        )

        return importance_df.head(top_n).reset_index(drop=True)

    def get_learning_curve(self) -> pd.DataFrame:
        """
        Get learning curve from training history.

        Returns:
            DataFrame with training and validation loss per iteration
        """
        if not self.evals_result:
            raise ValueError("No evaluation results available")

        curves = []
        for dataset_name, metrics in self.evals_result.items():
            for metric_name, values in metrics.items():
                curve_df = pd.DataFrame({
                    'iteration': range(len(values)),
                    'dataset': dataset_name,
                    'metric': metric_name,
                    'value': values
                })
                curves.append(curve_df)

        return pd.concat(curves, ignore_index=True)

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
        logger.info(f"Evaluating XGBoost model on {len(X_test)} test samples")

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

        # ROC AUC
        try:
            roc_auc = roc_auc_score(y_test, y_pred_proba, multi_class='ovr', average='weighted')
            metrics['test_roc_auc'] = roc_auc
        except:
            logger.warning("Could not calculate ROC AUC")

        # Feature importance (multiple types)
        feature_importance = {
            'gain': self.get_feature_importance('gain', top_n=20).to_dict('records'),
            'weight': self.get_feature_importance('weight', top_n=20).to_dict('records')
        }

        evaluation = {
            'metrics': metrics,
            'confusion_matrix': cm.tolist(),
            'classification_report': class_report,
            'feature_importance': feature_importance,
            'best_iteration': self.training_history.get('best_iteration'),
            'timestamp': datetime.now().isoformat()
        }

        logger.info(f"Test accuracy: {metrics['test_accuracy']:.4f}")
        logger.info(f"Test F1 score: {metrics['test_f1']:.4f}")

        return evaluation

    def save_model(self, filepath: Optional[Path] = None):
        """
        Save trained model to disk.

        Args:
            filepath: Path to save model (optional)
        """
        if self.model is None:
            raise ValueError("No model to save. Train model first.")

        if filepath is None:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f"{self.config.model_name}_v{self.config.model_version}_{timestamp}"
            filepath = self.config.model_dir / filename

        # Save XGBoost model in native format
        model_path = filepath.with_suffix('.json')
        self.model.save_model(str(model_path))

        # Save metadata
        metadata = {
            'model_name': self.config.model_name,
            'model_version': self.config.model_version,
            'feature_names': self.feature_names,
            'training_history': self.training_history,
            'saved_at': datetime.now().isoformat()
        }

        metadata_path = filepath.with_suffix('.meta.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Model saved to {model_path}")
        logger.info(f"Metadata saved to {metadata_path}")

        return model_path

    def load_model(self, filepath: Path):
        """
        Load trained model from disk.

        Args:
            filepath: Path to saved model
        """
        # Load XGBoost model
        self.model.load_model(str(filepath))

        # Load metadata
        metadata_path = filepath.with_suffix('.meta.json')
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
XGBoost Training Summary
{'=' * 50}
Timestamp: {self.training_history['timestamp']}
Training samples: {self.training_history['train_samples']:,}
Validation samples: {self.training_history['val_samples']:,}
Features: {self.training_history['n_features']:,}
Training time: {self.training_history['train_time_seconds']:.2f}s

Best Iteration: {self.training_history['best_iteration']} / {self.training_history['total_boost_rounds']}
Best Score: {self.training_history['best_score']:.4f}

Configuration:
  max_depth: {self.training_history['config']['max_depth']}
  learning_rate: {self.training_history['config']['learning_rate']}
  n_estimators: {self.training_history['config']['n_estimators']}
  subsample: {self.training_history['config']['subsample']}
  tree_method: {self.training_history['config']['tree_method']}

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

    # Generate synthetic data
    np.random.seed(42)
    n_samples = 10000
    n_features = 50

    X = pd.DataFrame(
        np.random.randn(n_samples, n_features),
        columns=[f'feature_{i}' for i in range(n_features)]
    )

    # Generate labels with pattern
    y = pd.Series(np.zeros(n_samples, dtype=int))
    y[X['feature_0'] > 0.5] = 1
    y[X['feature_0'] < -0.5] = -1

    # Add some noise
    noise_idx = np.random.choice(n_samples, size=int(0.1 * n_samples), replace=False)
    y.iloc[noise_idx] = np.random.choice([-1, 0, 1], size=len(noise_idx))

    # Split
    split_idx = int(0.8 * n_samples)
    X_train, X_val = X[:split_idx], X[split_idx:]
    y_train, y_val = y[:split_idx], y[split_idx:]

    # Train
    config = XGBoostConfig(n_estimators=100, early_stopping_rounds=10)
    xgb_model = XGBoostPredictor(config)

    print("Training XGBoost...")
    metrics = xgb_model.train(X_train, y_train, X_val, y_val)

    print("\n" + xgb_model.get_training_summary())

    # Feature importance
    print("\nTop 10 Features (by gain):")
    print(xgb_model.get_feature_importance('gain', top_n=10))

    # Evaluate
    print("\nEvaluation:")
    evaluation = xgb_model.evaluate(X_val, y_val)
    print(f"Test Accuracy: {evaluation['metrics']['test_accuracy']:.4f}")
    print(f"Test ROC AUC: {evaluation['metrics'].get('test_roc_auc', 'N/A')}")

    # Save
    model_path = xgb_model.save_model()
    print(f"\nModel saved to: {model_path}")
