"""
Ensemble Meta-Learner for Trading Signal Prediction
=====================================================
Institutional-grade ensemble that combines Random Forest, XGBoost,
LSTM, and Transformer models using stacking methodology.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Stacking ensemble combining 4 base models
- Logistic regression meta-learner
- Confidence-weighted predictions
- Individual model performance tracking
- Production-ready training and inference
- Comprehensive metrics and model persistence
- Automatic model selection based on performance
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
import json
import logging
from pathlib import Path
from datetime import datetime
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score
)
import joblib

# Import base models
from random_forest_model import RandomForestModel, RandomForestConfig
from xgboost_model import XGBoostModel, XGBoostConfig
from lstm_model import LSTMModel, LSTMConfig
from transformer_model import TransformerModel, TransformerConfig

logger = logging.getLogger(__name__)


@dataclass
class EnsembleConfig:
    """Configuration for Ensemble model"""

    # Base model configs
    use_random_forest: bool = True
    use_xgboost: bool = True
    use_lstm: bool = True
    use_transformer: bool = True

    # Random Forest config
    rf_config: Optional[RandomForestConfig] = None

    # XGBoost config
    xgb_config: Optional[XGBoostConfig] = None

    # LSTM config
    lstm_config: Optional[LSTMConfig] = None

    # Transformer config
    transformer_config: Optional[TransformerConfig] = None

    # Meta-learner config
    meta_learner_C: float = 1.0  # Regularization strength
    meta_learner_solver: str = 'lbfgs'
    meta_learner_max_iter: int = 1000

    # Ensemble strategy
    use_probabilities: bool = True  # Use probabilities as meta-features
    use_predictions: bool = True     # Use predictions as meta-features
    confidence_threshold: float = 0.6  # Minimum confidence for prediction

    # Model weighting
    auto_weight: bool = True  # Automatically weight models by performance

    # Reproducibility
    random_state: int = 42

    def __post_init__(self):
        """Initialize default configs if not provided"""
        if self.rf_config is None:
            self.rf_config = RandomForestConfig()

        if self.xgb_config is None:
            self.xgb_config = XGBoostConfig()

        if self.lstm_config is None:
            self.lstm_config = LSTMConfig()

        if self.transformer_config is None:
            self.transformer_config = TransformerConfig()


class EnsembleModel:
    """
    Ensemble Model combining multiple ML models via stacking

    Architecture:
    - Level 0 (Base models): Random Forest, XGBoost, LSTM, Transformer
    - Level 1 (Meta-learner): Logistic Regression on base model predictions
    """

    def __init__(self, config: Optional[EnsembleConfig] = None):
        """Initialize ensemble model"""
        self.config = config or EnsembleConfig()

        # Initialize base models
        self.base_models = {}

        if self.config.use_random_forest:
            self.base_models['random_forest'] = RandomForestModel(self.config.rf_config)
            logger.info("Initialized Random Forest base model")

        if self.config.use_xgboost:
            self.base_models['xgboost'] = XGBoostModel(self.config.xgb_config)
            logger.info("Initialized XGBoost base model")

        if self.config.use_lstm:
            self.base_models['lstm'] = LSTMModel(self.config.lstm_config)
            logger.info("Initialized LSTM base model")

        if self.config.use_transformer:
            self.base_models['transformer'] = TransformerModel(self.config.transformer_config)
            logger.info("Initialized Transformer base model")

        # Meta-learner
        self.meta_learner = LogisticRegression(
            C=self.config.meta_learner_C,
            solver=self.config.meta_learner_solver,
            max_iter=self.config.meta_learner_max_iter,
            random_state=self.config.random_state,
            multi_class='multinomial'
        )

        # Model performance tracking
        self.base_model_performance = {}

        # Feature names
        self.feature_names = None

        logger.info(f"Initialized ensemble with {len(self.base_models)} base models")

    def _generate_meta_features(
        self,
        X: pd.DataFrame,
        mode: str = 'train'
    ) -> np.ndarray:
        """
        Generate meta-features from base model predictions

        Args:
            X: Input features
            mode: 'train' or 'predict'

        Returns:
            Meta-features array
        """
        meta_features_list = []

        for model_name, model in self.base_models.items():
            # Get predictions
            if self.config.use_predictions:
                predictions = model.predict(X)
                meta_features_list.append(predictions.reshape(-1, 1))

            # Get probabilities
            if self.config.use_probabilities:
                probabilities = model.predict_proba(X)
                meta_features_list.append(probabilities)

        # Concatenate all meta-features
        meta_features = np.hstack(meta_features_list)

        logger.debug(f"Generated meta-features shape: {meta_features.shape}")

        return meta_features

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None
    ) -> Dict[str, Any]:
        """
        Train ensemble model using stacking

        Process:
        1. Train all base models on training data
        2. Generate meta-features from base model predictions
        3. Train meta-learner on meta-features
        4. Evaluate ensemble performance

        Args:
            X_train: Training features
            y_train: Training labels
            X_val: Validation features
            y_val: Validation labels

        Returns:
            Training metrics dictionary
        """
        logger.info("=" * 60)
        logger.info("Training Ensemble Model (Stacking)")
        logger.info("=" * 60)

        self.feature_names = X_train.columns.tolist()

        # Step 1: Train base models
        logger.info("\nStep 1: Training base models...")

        base_model_metrics = {}

        for model_name, model in self.base_models.items():
            logger.info(f"\nTraining {model_name}...")

            try:
                metrics = model.train(X_train, y_train, X_val, y_val)

                # Store validation accuracy for weighting
                val_acc = metrics.get('validation_accuracy', metrics.get('train_accuracy', 0.0))
                self.base_model_performance[model_name] = val_acc

                base_model_metrics[model_name] = metrics

                logger.info(f"{model_name} training complete. Val accuracy: {val_acc:.4f}")

            except Exception as e:
                logger.error(f"Error training {model_name}: {e}")
                # Remove failed model
                del self.base_models[model_name]

        if not self.base_models:
            raise RuntimeError("All base models failed to train")

        # Step 2: Generate meta-features
        logger.info("\nStep 2: Generating meta-features...")

        X_train_meta = self._generate_meta_features(X_train, mode='train')

        if X_val is not None:
            X_val_meta = self._generate_meta_features(X_val, mode='train')

        logger.info(f"Meta-features generated. Shape: {X_train_meta.shape}")

        # Step 3: Train meta-learner
        logger.info("\nStep 3: Training meta-learner (Logistic Regression)...")

        # Convert labels to 0, 1, 2 for scikit-learn
        y_train_meta = self._convert_labels(y_train.values)

        self.meta_learner.fit(X_train_meta, y_train_meta)

        logger.info("Meta-learner training complete")

        # Step 4: Evaluate ensemble
        logger.info("\nStep 4: Evaluating ensemble performance...")

        # Training metrics
        train_metrics = self._calculate_metrics(X_train, y_train, "train")

        # Validation metrics
        val_metrics = {}
        if X_val is not None and y_val is not None:
            val_metrics = self._calculate_metrics(X_val, y_val, "validation")

        # Combine all metrics
        all_metrics = {
            'ensemble': {**train_metrics, **val_metrics},
            'base_models': base_model_metrics,
            'base_model_performance': self.base_model_performance
        }

        # Summary
        logger.info("\n" + "=" * 60)
        logger.info("Ensemble Training Summary")
        logger.info("=" * 60)

        logger.info("\nBase Model Performance:")
        for model_name, performance in self.base_model_performance.items():
            logger.info(f"  {model_name}: {performance:.4f}")

        logger.info("\nEnsemble Performance:")
        logger.info(f"  Train Accuracy: {train_metrics.get('train_accuracy', 0):.4f}")
        logger.info(f"  Val Accuracy: {val_metrics.get('validation_accuracy', 0):.4f}")

        logger.info("=" * 60)

        return all_metrics

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Make ensemble predictions

        Args:
            X: Features DataFrame

        Returns:
            Predictions array (-1, 0, 1)
        """
        # Generate meta-features
        X_meta = self._generate_meta_features(X, mode='predict')

        # Meta-learner prediction
        predictions_meta = self.meta_learner.predict(X_meta)

        # Convert back to original labels (-1, 0, 1)
        predictions = self._inverse_convert_labels(predictions_meta)

        return predictions

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predict class probabilities

        Args:
            X: Features DataFrame

        Returns:
            Probability array (n_samples, n_classes)
        """
        # Generate meta-features
        X_meta = self._generate_meta_features(X, mode='predict')

        # Meta-learner probability prediction
        probabilities = self.meta_learner.predict_proba(X_meta)

        return probabilities

    def predict_with_confidence(
        self,
        X: pd.DataFrame
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Predict with confidence scores

        Args:
            X: Features DataFrame

        Returns:
            predictions: Predicted classes (-1, 0, 1)
            confidences: Confidence scores (0-1)
        """
        # Get probabilities
        probabilities = self.predict_proba(X)

        # Predictions
        predictions_meta = self.meta_learner.predict(X_meta := self._generate_meta_features(X, mode='predict'))
        predictions = self._inverse_convert_labels(predictions_meta)

        # Confidence = max probability
        confidences = np.max(probabilities, axis=1)

        return predictions, confidences

    def get_model_contributions(self, X: pd.DataFrame) -> Dict[str, np.ndarray]:
        """
        Get individual model predictions for analysis

        Args:
            X: Features DataFrame

        Returns:
            Dictionary mapping model names to predictions
        """
        contributions = {}

        for model_name, model in self.base_models.items():
            predictions = model.predict(X)
            probabilities = model.predict_proba(X)

            contributions[model_name] = {
                'predictions': predictions,
                'probabilities': probabilities
            }

        return contributions

    def _convert_labels(self, y: np.ndarray) -> np.ndarray:
        """Convert labels from (-1, 0, 1) to (0, 1, 2)"""
        y_converted = y.copy()
        y_converted[y == -1] = 0  # Short
        y_converted[y == 0] = 1   # Neutral
        y_converted[y == 1] = 2   # Long
        return y_converted

    def _inverse_convert_labels(self, y: np.ndarray) -> np.ndarray:
        """Convert labels from (0, 1, 2) back to (-1, 0, 1)"""
        y_original = y.copy()
        y_original[y == 0] = -1  # Short
        y_original[y == 1] = 0   # Neutral
        y_original[y == 2] = 1   # Long
        return y_original

    def _calculate_metrics(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        prefix: str = ""
    ) -> Dict[str, float]:
        """Calculate comprehensive ensemble metrics"""
        y_pred = self.predict(X)
        y_proba = self.predict_proba(X)

        y_true = y.values

        metrics = {
            f'{prefix}_accuracy': accuracy_score(y_true, y_pred),
            f'{prefix}_precision': precision_score(y_true, y_pred, average='weighted', zero_division=0),
            f'{prefix}_recall': recall_score(y_true, y_pred, average='weighted', zero_division=0),
            f'{prefix}_f1': f1_score(y_true, y_pred, average='weighted', zero_division=0)
        }

        # Per-class metrics
        for label, name in [(-1, 'short'), (0, 'neutral'), (1, 'long')]:
            if label in y_true:
                precision = precision_score(y_true, y_pred, labels=[label], average='micro', zero_division=0)
                recall = recall_score(y_true, y_pred, labels=[label], average='micro', zero_division=0)
                metrics[f'{prefix}_precision_{name}'] = precision
                metrics[f'{prefix}_recall_{name}'] = recall

        # Confidence metrics
        predictions, confidences = self.predict_with_confidence(X)
        metrics[f'{prefix}_avg_confidence'] = np.mean(confidences)
        metrics[f'{prefix}_high_confidence_pct'] = np.mean(confidences > self.config.confidence_threshold)

        return metrics

    def save(self, filepath: str):
        """
        Save ensemble model to disk

        Args:
            filepath: Base path for saving (without extension)
        """
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Save each base model
        for model_name, model in self.base_models.items():
            model_path = filepath.parent / f"{filepath.stem}_{model_name}"
            model.save(str(model_path))
            logger.info(f"Saved {model_name} to {model_path}")

        # Save meta-learner
        meta_learner_path = filepath.with_name(f"{filepath.stem}_meta_learner.pkl")
        joblib.dump(self.meta_learner, meta_learner_path)
        logger.info(f"Saved meta-learner to {meta_learner_path}")

        # Save ensemble metadata
        metadata = {
            'model_type': 'Ensemble',
            'version': '1.0',
            'created_at': datetime.now().isoformat(),
            'config': asdict(self.config),
            'base_models': list(self.base_models.keys()),
            'base_model_performance': self.base_model_performance,
            'feature_names': self.feature_names,
            'num_features': len(self.feature_names) if self.feature_names else None
        }

        metadata_path = filepath.with_suffix('.json')
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)

        logger.info(f"Ensemble metadata saved to {metadata_path}")

    def load(self, filepath: str):
        """
        Load ensemble model from disk

        Args:
            filepath: Base path for loading (without extension)
        """
        filepath = Path(filepath)

        # Load metadata
        metadata_path = filepath.with_suffix('.json')
        if not metadata_path.exists():
            raise FileNotFoundError(f"Metadata file not found: {metadata_path}")

        with open(metadata_path, 'r') as f:
            metadata = json.load(f)

        # Restore config
        self.config = EnsembleConfig(**metadata['config'])
        self.feature_names = metadata['feature_names']
        self.base_model_performance = metadata['base_model_performance']

        # Load base models
        base_model_names = metadata['base_models']

        for model_name in base_model_names:
            model_path = filepath.parent / f"{filepath.stem}_{model_name}"

            if model_name == 'random_forest':
                model = RandomForestModel()
            elif model_name == 'xgboost':
                model = XGBoostModel()
            elif model_name == 'lstm':
                model = LSTMModel()
            elif model_name == 'transformer':
                model = TransformerModel()
            else:
                logger.warning(f"Unknown model type: {model_name}")
                continue

            model.load(str(model_path))
            self.base_models[model_name] = model
            logger.info(f"Loaded {model_name} from {model_path}")

        # Load meta-learner
        meta_learner_path = filepath.with_name(f"{filepath.stem}_meta_learner.pkl")
        self.meta_learner = joblib.load(meta_learner_path)
        logger.info(f"Loaded meta-learner from {meta_learner_path}")

        logger.info(f"Ensemble loaded successfully with {len(self.base_models)} base models")

    def get_model_summary(self) -> Dict:
        """Get summary of ensemble configuration and performance"""
        summary = {
            'num_base_models': len(self.base_models),
            'base_models': list(self.base_models.keys()),
            'base_model_performance': self.base_model_performance,
            'meta_learner': type(self.meta_learner).__name__,
            'use_probabilities': self.config.use_probabilities,
            'use_predictions': self.config.use_predictions,
            'confidence_threshold': self.config.confidence_threshold,
            'num_features': len(self.feature_names) if self.feature_names else None
        }

        # Add base model summaries
        for model_name, model in self.base_models.items():
            if hasattr(model, 'get_training_summary'):
                summary[f'{model_name}_summary'] = model.get_training_summary()

        return summary


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Example: Create synthetic data
    np.random.seed(42)
    n_samples = 1000
    n_features = 50

    # Generate features
    X = pd.DataFrame(
        np.random.randn(n_samples, n_features),
        columns=[f'feature_{i}' for i in range(n_features)]
    )

    # Generate labels
    y_values = (X.iloc[:, :5].sum(axis=1) > 0).astype(int)
    y_values[y_values == 0] = -1
    y = pd.Series(y_values)

    # Add neutral labels
    neutral_idx = np.random.choice(n_samples, size=int(n_samples * 0.3), replace=False)
    y.iloc[neutral_idx] = 0

    # Train/test split
    split_idx = int(0.8 * n_samples)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # Create ensemble
    config = EnsembleConfig(
        use_random_forest=True,
        use_xgboost=True,
        use_lstm=True,
        use_transformer=True,
        confidence_threshold=0.6
    )

    ensemble = EnsembleModel(config)

    print("\n=== Training Ensemble Model ===")
    metrics = ensemble.train(X_train, y_train, X_test, y_test)

    print("\n=== Ensemble Metrics ===")
    for key, value in metrics['ensemble'].items():
        if isinstance(value, float):
            print(f"{key}: {value:.4f}")

    print("\n=== Model Summary ===")
    summary = ensemble.get_model_summary()
    for key, value in summary.items():
        if not isinstance(value, dict):
            print(f"{key}: {value}")

    # Save ensemble
    ensemble.save('ai-ml/models/saved/ensemble_model')
    print("\n✅ Ensemble saved successfully")

    # Test predictions with confidence
    predictions, confidences = ensemble.predict_with_confidence(X_test)
    print(f"\n=== Predictions with Confidence ===")
    print(f"Predictions shape: {predictions.shape}")
    print(f"Average confidence: {np.mean(confidences):.4f}")
    print(f"High confidence predictions: {np.mean(confidences > 0.6):.2%}")
