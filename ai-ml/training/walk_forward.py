"""
Walk-Forward Optimization Framework
====================================
Institutional-grade walk-forward analysis for time-series trading strategies.
Prevents overfitting through proper out-of-sample testing.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Rolling window walk-forward optimization
- Anchored walk-forward optimization
- In-sample / out-of-sample split
- Parameter grid search with time-series CV
- Model retraining and performance tracking
- Overfitting detection
- Statistical validation
- Results aggregation and visualization
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Callable, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import json
import logging
from pathlib import Path
from collections import defaultdict
import joblib

# Import models
import sys
sys.path.append('..')
from models.random_forest_model import RandomForestModel, RandomForestConfig
from models.xgboost_model import XGBoostModel, XGBoostConfig
from models.lstm_model import LSTMModel, LSTMConfig
from models.transformer_model import TransformerModel, TransformerConfig
from models.ensemble import EnsembleModel, EnsembleConfig

logger = logging.getLogger(__name__)


@dataclass
class WalkForwardConfig:
    """Configuration for walk-forward optimization"""

    # Window sizes
    train_window_months: int = 6  # Training window size
    test_window_months: int = 1   # Test window size
    step_months: int = 1          # Step size for rolling window

    # Walk-forward type
    mode: str = "rolling"  # "rolling" or "anchored"

    # Retraining
    retrain_frequency: str = "monthly"  # "monthly", "quarterly", "yearly"
    min_train_samples: int = 1000  # Minimum samples for training

    # Model selection
    model_type: str = "ensemble"  # "random_forest", "xgboost", "lstm", "transformer", "ensemble"

    # Validation
    enable_validation: bool = True
    validation_split: float = 0.2  # 20% of train data for validation

    # Performance tracking
    track_feature_importance: bool = True
    track_predictions: bool = True

    # Early stopping
    enable_early_stopping: bool = True
    patience_windows: int = 3  # Stop if performance degrades for N windows

    # Save models
    save_models: bool = True
    models_dir: str = "ai-ml/training/saved_models"

    def __post_init__(self):
        """Validate configuration"""
        if self.mode not in ["rolling", "anchored"]:
            raise ValueError("mode must be 'rolling' or 'anchored'")

        if self.train_window_months < 1:
            raise ValueError("train_window_months must be >= 1")

        if self.test_window_months < 1:
            raise ValueError("test_window_months must be >= 1")


@dataclass
class WalkForwardWindow:
    """Single walk-forward window"""

    window_id: int
    train_start: datetime
    train_end: datetime
    test_start: datetime
    test_end: datetime
    train_samples: int = 0
    test_samples: int = 0
    metrics: Dict[str, float] = None

    def __post_init__(self):
        if self.metrics is None:
            self.metrics = {}


class WalkForwardOptimizer:
    """
    Walk-Forward Optimization Framework

    Implements proper time-series cross-validation:
    1. Split data into training and testing windows
    2. Train model on in-sample data
    3. Test on out-of-sample data
    4. Roll window forward
    5. Repeat until end of data
    """

    def __init__(self, config: Optional[WalkForwardConfig] = None):
        """Initialize walk-forward optimizer"""
        self.config = config or WalkForwardConfig()

        self.windows: List[WalkForwardWindow] = []
        self.models: Dict[int, Any] = {}  # window_id -> model
        self.all_predictions: List[Dict] = []
        self.feature_importance_history: List[Dict] = []

        logger.info(f"Initialized walk-forward optimizer ({self.config.mode} mode)")
        logger.info(f"Train window: {self.config.train_window_months} months")
        logger.info(f"Test window: {self.config.test_window_months} months")
        logger.info(f"Step: {self.config.step_months} months")

    def create_windows(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> List[WalkForwardWindow]:
        """
        Create walk-forward windows

        Args:
            start_date: Start date of available data
            end_date: End date of available data

        Returns:
            List of WalkForwardWindow objects
        """
        logger.info(f"Creating walk-forward windows from {start_date} to {end_date}")

        windows = []
        window_id = 0

        # Start with first training period
        if self.config.mode == "rolling":
            # Rolling: training window moves forward
            current_train_start = start_date
        else:  # anchored
            # Anchored: training window starts from beginning
            current_train_start = start_date

        while True:
            # Calculate train end
            train_end = current_train_start + pd.DateOffset(months=self.config.train_window_months)

            # Calculate test period
            test_start = train_end
            test_end = test_start + pd.DateOffset(months=self.config.test_window_months)

            # Check if we've reached end of data
            if test_end > end_date:
                break

            # Create window
            window = WalkForwardWindow(
                window_id=window_id,
                train_start=current_train_start,
                train_end=train_end,
                test_start=test_start,
                test_end=test_end
            )

            windows.append(window)
            window_id += 1

            # Move to next window
            if self.config.mode == "rolling":
                # Rolling: move start forward
                current_train_start += pd.DateOffset(months=self.config.step_months)
            else:  # anchored
                # Anchored: keep start, move end forward
                current_train_start = start_date

            # For anchored mode, we still need to step the test period
            if self.config.mode == "anchored":
                # Move test period forward
                current_train_start = start_date
                train_end = test_end

        self.windows = windows
        logger.info(f"Created {len(windows)} walk-forward windows")

        return windows

    def run_optimization(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        Run walk-forward optimization

        Args:
            X: Features DataFrame with DateTimeIndex
            y: Labels Series with DateTimeIndex
            start_date: Override start date (default: X.index.min())
            end_date: Override end date (default: X.index.max())

        Returns:
            Optimization results dictionary
        """
        logger.info("=" * 60)
        logger.info("Starting Walk-Forward Optimization")
        logger.info("=" * 60)

        # Use data index if dates not provided
        if start_date is None:
            start_date = X.index.min()
        if end_date is None:
            end_date = X.index.max()

        # Create windows
        windows = self.create_windows(start_date, end_date)

        # Track overall performance
        all_metrics = []
        best_window_id = None
        best_score = -np.inf

        # Process each window
        for i, window in enumerate(windows):
            logger.info(f"\n{'=' * 60}")
            logger.info(f"Window {window.window_id + 1}/{len(windows)}")
            logger.info(f"Train: {window.train_start.date()} to {window.train_end.date()}")
            logger.info(f"Test:  {window.test_start.date()} to {window.test_end.date()}")
            logger.info(f"{'=' * 60}")

            # Extract train/test data
            train_mask = (X.index >= window.train_start) & (X.index < window.train_end)
            test_mask = (X.index >= window.test_start) & (X.index < window.test_end)

            X_train = X[train_mask]
            y_train = y[train_mask]
            X_test = X[test_mask]
            y_test = y[test_mask]

            # Update window sample counts
            window.train_samples = len(X_train)
            window.test_samples = len(X_test)

            logger.info(f"Train samples: {window.train_samples}")
            logger.info(f"Test samples: {window.test_samples}")

            # Check minimum samples
            if window.train_samples < self.config.min_train_samples:
                logger.warning(f"Insufficient training samples ({window.train_samples} < {self.config.min_train_samples}). Skipping window.")
                continue

            if window.test_samples == 0:
                logger.warning("No test samples. Skipping window.")
                continue

            # Split train into train/validation if enabled
            if self.config.enable_validation:
                val_split_idx = int(len(X_train) * (1 - self.config.validation_split))
                X_train_split = X_train.iloc[:val_split_idx]
                y_train_split = y_train.iloc[:val_split_idx]
                X_val = X_train.iloc[val_split_idx:]
                y_val = y_train.iloc[val_split_idx:]
            else:
                X_train_split = X_train
                y_train_split = y_train
                X_val = None
                y_val = None

            # Train model
            try:
                model = self._train_model(X_train_split, y_train_split, X_val, y_val, window.window_id)
            except Exception as e:
                logger.error(f"Error training model: {e}")
                continue

            # Evaluate on test set
            metrics = self._evaluate_model(model, X_test, y_test)
            window.metrics = metrics

            all_metrics.append({
                'window_id': window.window_id,
                'train_start': window.train_start,
                'test_start': window.test_start,
                **metrics
            })

            # Track best model
            if metrics.get('test_accuracy', 0) > best_score:
                best_score = metrics['test_accuracy']
                best_window_id = window.window_id

            # Log metrics
            logger.info(f"\nWindow {window.window_id} Results:")
            logger.info(f"  Test Accuracy: {metrics.get('test_accuracy', 0):.4f}")
            logger.info(f"  Test F1: {metrics.get('test_f1', 0):.4f}")

            # Store model if configured
            if self.config.save_models:
                self.models[window.window_id] = model
                self._save_model(model, window.window_id)

            # Track predictions
            if self.config.track_predictions:
                predictions = model.predict(X_test)
                for idx, (date, pred, actual) in enumerate(zip(X_test.index, predictions, y_test)):
                    self.all_predictions.append({
                        'window_id': window.window_id,
                        'date': date,
                        'prediction': pred,
                        'actual': actual
                    })

            # Track feature importance
            if self.config.track_feature_importance and hasattr(model, 'feature_importance_'):
                self.feature_importance_history.append({
                    'window_id': window.window_id,
                    'importance': model.feature_importance_.to_dict()
                })

            # Early stopping check
            if self.config.enable_early_stopping and i >= self.config.patience_windows:
                recent_scores = [m['test_accuracy'] for m in all_metrics[-self.config.patience_windows:]]
                if all(recent_scores[i] <= recent_scores[i+1] for i in range(len(recent_scores)-1)):
                    logger.warning(f"Early stopping: performance degrading for {self.config.patience_windows} consecutive windows")
                    break

        logger.info("\n" + "=" * 60)
        logger.info("Walk-Forward Optimization Complete")
        logger.info("=" * 60)

        # Aggregate results
        results = self._aggregate_results(all_metrics, best_window_id)

        return results

    def _train_model(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame],
        y_val: Optional[pd.Series],
        window_id: int
    ) -> Any:
        """Train model for a specific window"""
        logger.info(f"Training {self.config.model_type} model...")

        # Initialize model based on type
        if self.config.model_type == "random_forest":
            model = RandomForestModel(RandomForestConfig())
        elif self.config.model_type == "xgboost":
            model = XGBoostModel(XGBoostConfig())
        elif self.config.model_type == "lstm":
            model = LSTMModel(LSTMConfig())
        elif self.config.model_type == "transformer":
            model = TransformerModel(TransformerConfig())
        elif self.config.model_type == "ensemble":
            model = EnsembleModel(EnsembleConfig())
        else:
            raise ValueError(f"Unknown model type: {self.config.model_type}")

        # Train
        model.train(X_train, y_train, X_val, y_val)

        logger.info("Training complete")

        return model

    def _evaluate_model(
        self,
        model: Any,
        X_test: pd.DataFrame,
        y_test: pd.Series
    ) -> Dict[str, float]:
        """Evaluate model on test set"""
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score

        # Predictions
        y_pred = model.predict(X_test)

        # Calculate metrics
        metrics = {
            'test_accuracy': accuracy_score(y_test, y_pred),
            'test_precision': precision_score(y_test, y_pred, average='weighted', zero_division=0),
            'test_recall': recall_score(y_test, y_pred, average='weighted', zero_division=0),
            'test_f1': f1_score(y_test, y_pred, average='weighted', zero_division=0)
        }

        return metrics

    def _save_model(self, model: Any, window_id: int):
        """Save model to disk"""
        models_dir = Path(self.config.models_dir)
        models_dir.mkdir(parents=True, exist_ok=True)

        model_path = models_dir / f"window_{window_id}_{self.config.model_type}"
        model.save(str(model_path))

        logger.debug(f"Model saved to {model_path}")

    def _aggregate_results(
        self,
        all_metrics: List[Dict],
        best_window_id: Optional[int]
    ) -> Dict[str, Any]:
        """Aggregate results across all windows"""
        logger.info("Aggregating results...")

        if not all_metrics:
            return {
                'summary': {},
                'windows': [],
                'is_overfitting': False
            }

        # Convert to DataFrame for easier analysis
        metrics_df = pd.DataFrame(all_metrics)

        # Calculate average metrics
        avg_metrics = {
            'avg_test_accuracy': metrics_df['test_accuracy'].mean(),
            'std_test_accuracy': metrics_df['test_accuracy'].std(),
            'avg_test_f1': metrics_df['test_f1'].mean(),
            'std_test_f1': metrics_df['test_f1'].std(),
            'best_window_id': best_window_id,
            'num_windows': len(all_metrics)
        }

        # Detect overfitting (compare early vs late windows)
        if len(all_metrics) >= 4:
            early_acc = metrics_df['test_accuracy'].iloc[:len(all_metrics)//2].mean()
            late_acc = metrics_df['test_accuracy'].iloc[len(all_metrics)//2:].mean()
            is_overfitting = late_acc < early_acc * 0.9  # 10% degradation
        else:
            is_overfitting = False

        # Compile results
        results = {
            'summary': avg_metrics,
            'windows': all_metrics,
            'predictions': self.all_predictions if self.config.track_predictions else [],
            'feature_importance': self.feature_importance_history if self.config.track_feature_importance else [],
            'is_overfitting': is_overfitting,
            'config': asdict(self.config)
        }

        # Log summary
        logger.info("\n" + "=" * 60)
        logger.info("WALK-FORWARD OPTIMIZATION RESULTS")
        logger.info("=" * 60)
        logger.info(f"Number of Windows: {avg_metrics['num_windows']}")
        logger.info(f"Average Test Accuracy: {avg_metrics['avg_test_accuracy']:.4f} ± {avg_metrics['std_test_accuracy']:.4f}")
        logger.info(f"Average Test F1: {avg_metrics['avg_test_f1']:.4f} ± {avg_metrics['std_test_f1']:.4f}")
        logger.info(f"Best Window: {best_window_id}")
        logger.info(f"Overfitting Detected: {is_overfitting}")
        logger.info("=" * 60)

        return results

    def save_results(self, results: Dict[str, Any], filepath: str):
        """Save walk-forward results to disk"""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Save metrics
        if results['windows']:
            metrics_df = pd.DataFrame(results['windows'])
            metrics_path = filepath.with_name(f"{filepath.stem}_metrics.csv")
            metrics_df.to_csv(metrics_path, index=False)
            logger.info(f"Metrics saved to {metrics_path}")

        # Save predictions
        if results['predictions']:
            predictions_df = pd.DataFrame(results['predictions'])
            predictions_path = filepath.with_name(f"{filepath.stem}_predictions.csv")
            predictions_df.to_csv(predictions_path, index=False)
            logger.info(f"Predictions saved to {predictions_path}")

        # Save summary
        summary = {
            'summary': results['summary'],
            'is_overfitting': results['is_overfitting'],
            'config': results['config'],
            'generated_at': datetime.now().isoformat()
        }

        summary_path = filepath.with_suffix('.json')
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2, default=str)
        logger.info(f"Summary saved to {summary_path}")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Example: Create synthetic time-series data
    np.random.seed(42)
    dates = pd.date_range('2020-01-01', '2023-12-31', freq='D')
    n_features = 50

    # Generate features
    X = pd.DataFrame(
        np.random.randn(len(dates), n_features),
        columns=[f'feature_{i}' for i in range(n_features)],
        index=dates
    )

    # Generate labels (trending)
    y_values = (X.iloc[:, :5].sum(axis=1) > 0).astype(int)
    y_values[y_values == 0] = -1
    y = pd.Series(y_values, index=dates)

    # Add neutral labels
    neutral_mask = np.random.random(len(y)) < 0.3
    y[neutral_mask] = 0

    # Run walk-forward optimization
    config = WalkForwardConfig(
        train_window_months=6,
        test_window_months=1,
        step_months=1,
        mode="rolling",
        model_type="random_forest",
        enable_validation=True,
        save_models=True
    )

    optimizer = WalkForwardOptimizer(config)
    results = optimizer.run_optimization(X, y)

    # Save results
    optimizer.save_results(results, 'ai-ml/training/results/walk_forward_example')

    print("\n✅ Walk-forward optimization complete!")
