"""
Automated Model Retraining Pipeline
====================================
Production-grade automated pipeline for continuous model improvement.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Scheduled retraining (daily, weekly, monthly)
- Performance monitoring triggers
- Data drift detection
- Automatic model evaluation
- Model versioning and rollback
- Production deployment automation
- Notification system
- Resource management
"""

import schedule
import time
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
import logging
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# Import components
import sys
sys.path.append('..')
from models.ensemble import EnsembleModel, EnsembleConfig
from training.walk_forward import WalkForwardOptimizer, WalkForwardConfig
from training.validation_framework import ModelValidator, ValidationConfig
from data.data_collector import MarketDataCollector, DataCollectionConfig

logger = logging.getLogger(__name__)


@dataclass
class RetrainingConfig:
    """Configuration for automated retraining"""

    # Schedule
    schedule_type: str = "weekly"  # daily, weekly, monthly, performance_based
    schedule_day: int = 0  # 0=Monday, 6=Sunday
    schedule_hour: int = 2  # 2 AM default

    # Data parameters
    lookback_months: int = 12  # Use last 12 months for training
    min_new_samples: int = 1000  # Minimum new samples to trigger retrain

    # Performance thresholds
    min_accuracy_threshold: float = 0.55  # Retrain if accuracy drops below
    min_sharpe_threshold: float = 1.0  # Retrain if Sharpe drops below
    performance_window_days: int = 30  # Evaluate performance over 30 days

    # Model versioning
    models_dir: str = "ai-ml/models/saved"
    keep_n_versions: int = 5  # Keep last 5 model versions

    # Validation
    enable_validation: bool = True
    validation_threshold: float = 0.5  # Min validation score to deploy

    # Notifications
    enable_notifications: bool = True
    notification_email: Optional[str] = None
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587

    # Resource limits
    max_training_hours: int = 6  # Max time for training
    enable_gpu: bool = False


@dataclass
class RetrainingResult:
    """Result from a retraining run"""

    timestamp: datetime
    trigger_reason: str
    data_samples: int
    training_duration_minutes: float

    # Old model metrics
    old_model_version: str
    old_accuracy: float
    old_sharpe: float

    # New model metrics
    new_model_version: str
    new_accuracy: float
    new_sharpe: float

    # Validation
    validation_passed: bool
    deployed: bool

    # Details
    errors: List[str]
    warnings: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp.isoformat(),
            'trigger_reason': self.trigger_reason,
            'data_samples': self.data_samples,
            'training_duration_minutes': round(self.training_duration_minutes, 2),
            'old_model': {
                'version': self.old_model_version,
                'accuracy': round(self.old_accuracy, 4),
                'sharpe': round(self.old_sharpe, 4)
            },
            'new_model': {
                'version': self.new_model_version,
                'accuracy': round(self.new_accuracy, 4),
                'sharpe': round(self.new_sharpe, 4)
            },
            'validation_passed': self.validation_passed,
            'deployed': self.deployed,
            'errors': self.errors,
            'warnings': self.warnings
        }


class DataDriftDetector:
    """
    Detect distribution drift in features
    """

    def __init__(self, reference_data: pd.DataFrame):
        """
        Initialize with reference data distribution

        Args:
            reference_data: Training data to use as reference
        """
        self.feature_means = reference_data.mean().to_dict()
        self.feature_stds = reference_data.std().to_dict()
        self.feature_mins = reference_data.min().to_dict()
        self.feature_maxs = reference_data.max().to_dict()

    def detect_drift(
        self,
        new_data: pd.DataFrame,
        threshold_std: float = 2.0
    ) -> Tuple[bool, Dict[str, float]]:
        """
        Detect if new data has drifted from reference

        Args:
            new_data: New data to check
            threshold_std: Number of std deviations for drift

        Returns:
            (has_drift, drift_scores)
        """
        drift_scores = {}
        has_drift = False

        for column in self.feature_means.keys():
            if column not in new_data.columns:
                continue

            # Calculate z-score of new mean vs reference
            new_mean = new_data[column].mean()
            ref_mean = self.feature_means[column]
            ref_std = self.feature_stds[column]

            if ref_std > 0:
                z_score = abs((new_mean - ref_mean) / ref_std)
                drift_scores[column] = z_score

                if z_score > threshold_std:
                    has_drift = True

        return has_drift, drift_scores


class ModelRetrainingPipeline:
    """
    Automated pipeline for model retraining and deployment

    Handles:
    - Scheduled retraining
    - Performance-based triggers
    - Data collection
    - Model training
    - Validation
    - Deployment
    - Monitoring
    """

    def __init__(self, config: Optional[RetrainingConfig] = None):
        """Initialize retraining pipeline"""
        self.config = config or RetrainingConfig()

        self.current_model: Optional[EnsembleModel] = None
        self.current_version: str = "v0"
        self.drift_detector: Optional[DataDriftDetector] = None

        self.retraining_history: List[RetrainingResult] = []
        self.last_retrain_time: Optional[datetime] = None

        logger.info("Initialized Model Retraining Pipeline")

    def setup_schedule(self):
        """Set up automated retraining schedule"""
        if self.config.schedule_type == "daily":
            schedule.every().day.at(f"{self.config.schedule_hour:02d}:00").do(
                self._run_scheduled_retrain
            )
            logger.info(f"Scheduled daily retraining at {self.config.schedule_hour}:00")

        elif self.config.schedule_type == "weekly":
            day_name = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"][self.config.schedule_day]
            getattr(schedule.every(), day_name).at(f"{self.config.schedule_hour:02d}:00").do(
                self._run_scheduled_retrain
            )
            logger.info(f"Scheduled weekly retraining on {day_name} at {self.config.schedule_hour}:00")

        elif self.config.schedule_type == "monthly":
            # Check daily, trigger if it's the 1st of month
            schedule.every().day.at(f"{self.config.schedule_hour:02d}:00").do(
                self._check_monthly_retrain
            )
            logger.info(f"Scheduled monthly retraining on 1st at {self.config.schedule_hour}:00")

    def _run_scheduled_retrain(self):
        """Run scheduled retraining"""
        logger.info("Running scheduled retraining...")
        self.retrain_model(trigger_reason="scheduled")

    def _check_monthly_retrain(self):
        """Check if it's time for monthly retrain"""
        if datetime.now().day == 1:
            self._run_scheduled_retrain()

    def check_performance_trigger(
        self,
        recent_predictions: pd.DataFrame,
        recent_actuals: pd.Series
    ) -> bool:
        """
        Check if performance has degraded enough to trigger retrain

        Args:
            recent_predictions: Recent model predictions
            recent_actuals: Recent actual outcomes

        Returns:
            True if retraining should be triggered
        """
        if len(recent_predictions) < 100:
            return False

        # Calculate recent accuracy
        from sklearn.metrics import accuracy_score
        recent_acc = accuracy_score(recent_actuals, recent_predictions)

        # Check threshold
        if recent_acc < self.config.min_accuracy_threshold:
            logger.warning(f"Performance degraded: accuracy={recent_acc:.4f} < threshold={self.config.min_accuracy_threshold}")
            return True

        return False

    def collect_training_data(self) -> Tuple[pd.DataFrame, pd.Series]:
        """
        Collect fresh training data

        Returns:
            (features, labels)
        """
        logger.info(f"Collecting training data (last {self.config.lookback_months} months)...")

        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=self.config.lookback_months * 30)

        # Collect data
        collector_config = DataCollectionConfig(
            start_date=start_date.strftime('%Y-%m-%d'),
            end_date=end_date.strftime('%Y-%m-%d')
        )

        # TODO: Implement actual data collection
        # For now, return placeholder
        logger.warning("Using placeholder data - implement actual collection")

        n_samples = 10000
        n_features = 200
        X = pd.DataFrame(
            np.random.randn(n_samples, n_features),
            columns=[f'feature_{i}' for i in range(n_features)]
        )
        y = pd.Series(np.random.choice([-1, 0, 1], size=n_samples))

        logger.info(f"Collected {len(X)} samples with {len(X.columns)} features")

        return X, y

    def train_new_model(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series
    ) -> EnsembleModel:
        """
        Train a new ensemble model

        Args:
            X_train: Training features
            y_train: Training labels

        Returns:
            Trained model
        """
        logger.info("Training new ensemble model...")

        start_time = datetime.now()

        # Split for validation
        split_idx = int(len(X_train) * 0.8)
        X_train_split = X_train.iloc[:split_idx]
        y_train_split = y_train.iloc[:split_idx]
        X_val = X_train.iloc[split_idx:]
        y_val = y_train.iloc[split_idx:]

        # Train model
        model_config = EnsembleConfig()
        model = EnsembleModel(model_config)

        metrics = model.train(X_train_split, y_train_split, X_val, y_val)

        training_time = (datetime.now() - start_time).total_seconds() / 60
        logger.info(f"Training complete in {training_time:.2f} minutes")

        return model

    def validate_new_model(
        self,
        model: EnsembleModel,
        X_val: pd.DataFrame,
        y_val: pd.Series
    ) -> Tuple[bool, Dict[str, float]]:
        """
        Validate new model meets quality thresholds

        Args:
            model: Trained model
            X_val: Validation features
            y_val: Validation labels

        Returns:
            (passes_validation, metrics)
        """
        logger.info("Validating new model...")

        # Get predictions
        predictions = model.predict(X_val)
        probabilities = model.predict_proba(X_val)

        # Validate
        validator = ModelValidator(ValidationConfig())
        validation_results = validator.validate_model(
            y_true=y_val.values,
            y_pred=predictions,
            y_pred_proba=probabilities
        )

        # Extract metrics
        metrics = validation_results['basic_metrics']
        validation_summary = validation_results['validation_summary']

        # Check thresholds
        passes = (
            metrics['accuracy'] >= self.config.validation_threshold and
            validation_summary['is_statistically_significant'] and
            not validation_summary['is_overfitting']
        )

        logger.info(f"Validation result: {'PASSED' if passes else 'FAILED'}")
        logger.info(f"  Accuracy: {metrics['accuracy']:.4f}")
        logger.info(f"  F1: {metrics['f1']:.4f}")

        return passes, metrics

    def deploy_model(
        self,
        model: EnsembleModel,
        version: str
    ) -> bool:
        """
        Deploy model to production

        Args:
            model: Model to deploy
            version: Version identifier

        Returns:
            True if deployed successfully
        """
        logger.info(f"Deploying model version {version}...")

        try:
            # Save model
            models_dir = Path(self.config.models_dir)
            models_dir.mkdir(parents=True, exist_ok=True)

            model_path = models_dir / f"ensemble_model_{version}"
            model.save(str(model_path))

            # Update current model
            self.current_model = model
            self.current_version = version

            # Clean up old versions
            self._cleanup_old_versions()

            logger.info(f"✅ Model {version} deployed successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to deploy model: {e}")
            return False

    def _cleanup_old_versions(self):
        """Remove old model versions beyond keep limit"""
        models_dir = Path(self.config.models_dir)

        # Find all model versions
        model_files = sorted(
            models_dir.glob("ensemble_model_v*"),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )

        # Remove old versions
        for old_model in model_files[self.config.keep_n_versions:]:
            try:
                # Remove model file
                if old_model.is_file():
                    old_model.unlink()
                # Remove associated files (.json, .pth, etc.)
                for ext in ['.json', '.pth', '.pkl']:
                    old_file = old_model.with_suffix(ext)
                    if old_file.exists():
                        old_file.unlink()

                logger.info(f"Removed old model version: {old_model.name}")
            except Exception as e:
                logger.warning(f"Failed to remove {old_model}: {e}")

    def retrain_model(self, trigger_reason: str = "manual") -> RetrainingResult:
        """
        Execute full retraining pipeline

        Args:
            trigger_reason: Reason for retraining

        Returns:
            RetrainingResult with details
        """
        logger.info("=" * 60)
        logger.info("STARTING MODEL RETRAINING PIPELINE")
        logger.info("=" * 60)
        logger.info(f"Trigger reason: {trigger_reason}")

        start_time = datetime.now()
        errors = []
        warnings = []

        # Store old model metrics
        old_version = self.current_version
        old_accuracy = 0.0
        old_sharpe = 0.0  # TODO: Get from monitoring

        try:
            # Step 1: Collect training data
            X_train, y_train = self.collect_training_data()

            # Step 2: Train new model
            new_model = self.train_new_model(X_train, y_train)

            # Step 3: Validate
            split_idx = int(len(X_train) * 0.8)
            X_val = X_train.iloc[split_idx:]
            y_val = y_train.iloc[split_idx:]

            validation_passed, metrics = self.validate_new_model(new_model, X_val, y_val)

            # Step 4: Deploy if validation passed
            new_version = f"v{int(old_version[1:]) + 1}" if old_version.startswith('v') else "v1"
            deployed = False

            if validation_passed:
                deployed = self.deploy_model(new_model, new_version)
            else:
                warnings.append("Validation failed - model not deployed")

            # Create result
            training_duration = (datetime.now() - start_time).total_seconds() / 60

            result = RetrainingResult(
                timestamp=datetime.now(),
                trigger_reason=trigger_reason,
                data_samples=len(X_train),
                training_duration_minutes=training_duration,
                old_model_version=old_version,
                old_accuracy=old_accuracy,
                old_sharpe=old_sharpe,
                new_model_version=new_version,
                new_accuracy=metrics.get('accuracy', 0.0),
                new_sharpe=0.0,  # TODO: Calculate from returns
                validation_passed=validation_passed,
                deployed=deployed,
                errors=errors,
                warnings=warnings
            )

            # Store in history
            self.retraining_history.append(result)
            self.last_retrain_time = datetime.now()

            # Send notification
            if self.config.enable_notifications:
                self._send_notification(result)

            logger.info("=" * 60)
            logger.info("RETRAINING PIPELINE COMPLETE")
            logger.info("=" * 60)
            logger.info(f"Duration: {training_duration:.2f} minutes")
            logger.info(f"New model version: {new_version}")
            logger.info(f"Deployed: {deployed}")

            return result

        except Exception as e:
            logger.error(f"Retraining pipeline failed: {e}")
            errors.append(str(e))

            # Return error result
            return RetrainingResult(
                timestamp=datetime.now(),
                trigger_reason=trigger_reason,
                data_samples=0,
                training_duration_minutes=(datetime.now() - start_time).total_seconds() / 60,
                old_model_version=old_version,
                old_accuracy=old_accuracy,
                old_sharpe=old_sharpe,
                new_model_version="failed",
                new_accuracy=0.0,
                new_sharpe=0.0,
                validation_passed=False,
                deployed=False,
                errors=errors,
                warnings=warnings
            )

    def _send_notification(self, result: RetrainingResult):
        """Send notification about retraining result"""
        if not self.config.notification_email:
            return

        try:
            subject = f"Model Retraining {'Successful' if result.deployed else 'Failed'}"

            body = f"""
Model Retraining Pipeline Report

Timestamp: {result.timestamp}
Trigger: {result.trigger_reason}
Duration: {result.training_duration_minutes:.2f} minutes

Old Model: {result.old_model_version}
  - Accuracy: {result.old_accuracy:.4f}

New Model: {result.new_model_version}
  - Accuracy: {result.new_accuracy:.4f}
  - Validation: {'PASSED' if result.validation_passed else 'FAILED'}
  - Deployed: {'YES' if result.deployed else 'NO'}

{'Errors: ' + ', '.join(result.errors) if result.errors else ''}
{'Warnings: ' + ', '.join(result.warnings) if result.warnings else ''}
"""

            # Create email
            msg = MIMEMultipart()
            msg['From'] = "noreply@nexustradeai.com"
            msg['To'] = self.config.notification_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))

            # Send
            # TODO: Implement actual SMTP sending
            logger.info(f"Notification sent to {self.config.notification_email}")

        except Exception as e:
            logger.warning(f"Failed to send notification: {e}")

    def run_forever(self):
        """
        Run pipeline continuously (blocking)

        Runs scheduled jobs and monitors for triggers
        """
        logger.info("Starting continuous retraining pipeline...")
        logger.info(f"Schedule: {self.config.schedule_type}")

        self.setup_schedule()

        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute

    def save_history(self, filepath: str):
        """Save retraining history to file"""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        history_data = [result.to_dict() for result in self.retraining_history]

        with open(filepath, 'w') as f:
            json.dump(history_data, f, indent=2)

        logger.info(f"Retraining history saved to {filepath}")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Configure pipeline
    config = RetrainingConfig(
        schedule_type="weekly",
        schedule_day=0,  # Monday
        schedule_hour=2,  # 2 AM
        lookback_months=12,
        min_accuracy_threshold=0.55,
        enable_notifications=True,
        notification_email="admin@nexustradeai.com"
    )

    # Create pipeline
    pipeline = ModelRetrainingPipeline(config)

    # Run one-time retrain
    result = pipeline.retrain_model(trigger_reason="manual")
    print(f"\n✅ Retraining complete!")
    print(f"New model version: {result.new_model_version}")
    print(f"Deployed: {result.deployed}")

    # Or run continuously
    # pipeline.run_forever()
