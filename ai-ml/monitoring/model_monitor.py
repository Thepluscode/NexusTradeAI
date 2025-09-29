"""
Enhanced Model Monitoring System for tracking model performance and data drift.
"""
import logging
import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Union, Any, Tuple
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta
import json
import os
import mlflow
import warnings
from scipy import stats

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@dataclass
class ModelMetrics:
    """Container for model performance metrics and metadata."""
    timestamp: datetime
    metrics: Dict[str, float]
    model_version: str
    data_hash: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    alert_level: str = 'green'  # 'green', 'yellow', 'red'
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        return result

@dataclass
class ModelPerformanceMetrics:
    """Comprehensive model performance metrics structure."""
    model_name: str
    timestamp: datetime
    predictions_count: int
    avg_prediction_time_ms: float
    accuracy_metrics: Dict[str, float]
    distribution_metrics: Dict[str, float]
    drift_metrics: Dict[str, float]
    alert_level: str  # 'green', 'yellow', 'red'
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        result = asdict(self)
        result['timestamp'] = self.timestamp.isoformat()
        return result

class ModelMonitor:
    """
    Enhanced model monitoring system for production ML models with drift detection,
    performance tracking, and alerting capabilities.
    """
    
    def __init__(self, 
                 model_name: str,
                 model_version: str,
                 config: Dict[str, Any] = None,
                 metrics_file: str = 'monitoring/metrics.json',
                 window_size: int = 1000):
        """
        Initialize the model monitor.
        
        Args:
            model_name: Name of the model being monitored
            model_version: Version of the model
            config: Monitor configuration
            metrics_file: Path to save metrics history
            window_size: Number of recent predictions to keep in memory
        """
        self.model_name = model_name
        self.model_version = model_version
        self.metrics_file = metrics_file
        self.window_size = window_size
        self.config = config or {}
        
        # Initialize data structures
        self.history: List[ModelMetrics] = []
        self.prediction_history: Dict[str, List[Dict]] = {}
        self.feature_statistics: Dict[str, List[Dict]] = {}
        
        # Default thresholds
        self.thresholds = {
            'accuracy_drop': 0.1,  # 10% drop in accuracy
            'prediction_time': 1000,  # 1 second
            'drift_threshold': 0.3,  # Distribution drift
            'error_rate': 0.05,  # 5% error rate
            'data_drift': 0.1  # 10% drift threshold
        }
        
        # Update with any provided config
        self.thresholds.update(self.config.get('thresholds', {}))
        
        # Load existing metrics
        self._load_metrics()
    
    def _load_metrics(self) -> None:
        """Load metrics from file if it exists."""
        if os.path.exists(self.metrics_file):
            try:
                with open(self.metrics_file, 'r') as f:
                    data = json.load(f)
                    for item in data:
                        self.history.append(ModelMetrics(
                            timestamp=datetime.fromisoformat(item['timestamp']),
                            metrics=item['metrics'],
                            model_version=item['model_version'],
                            data_hash=item.get('data_hash'),
                            metadata=item.get('metadata', {}),
                            alert_level=item.get('alert_level', 'green')
                        ))
                logger.info(f"Loaded {len(self.history)} metrics from {self.metrics_file}")
            except Exception as e:
                logger.error(f"Error loading metrics: {e}")
    
    def _save_metrics(self) -> None:
        """Save metrics to file."""
        os.makedirs(os.path.dirname(self.metrics_file), exist_ok=True)
        try:
            with open(self.metrics_file, 'w') as f:
                json.dump([m.to_dict() for m in self.history], f, indent=2)
        except Exception as e:
            logger.error(f"Error saving metrics: {e}")
    
    def log_prediction(self, 
                      features: np.ndarray,
                      predictions: np.ndarray,
                      actuals: Optional[np.ndarray] = None,
                      prediction_time_ms: float = 0) -> Dict[str, Any]:
        """
        Log a model prediction with features and timing.
        
        Args:
            features: Input features used for prediction
            predictions: Model predictions
            actuals: Ground truth values (if available)
            prediction_time_ms: Time taken for prediction in milliseconds
            
        Returns:
            Dictionary containing logged prediction info
        """
        timestamp = datetime.utcnow()
        
        # Initialize model history if needed
        if self.model_name not in self.prediction_history:
            self.prediction_history[self.model_name] = []
            self.feature_statistics[self.model_name] = []
        
        # Log prediction data
        prediction_record = {
            'timestamp': timestamp,
            'features': features.tolist() if isinstance(features, np.ndarray) else features,
            'predictions': predictions.tolist() if isinstance(predictions, np.ndarray) else predictions,
            'actuals': actuals.tolist() if actuals is not None and hasattr(actuals, 'tolist') else actuals,
            'prediction_time_ms': prediction_time_ms
        }
        
        self.prediction_history[self.model_name].append(prediction_record)
        
        # Update feature statistics
        self._update_feature_statistics(features)
        
        # Clean old data (keep only window_size most recent)
        if len(self.prediction_history[self.model_name]) > self.window_size:
            self.prediction_history[self.model_name] = self.prediction_history[self.model_name][-self.window_size:]
        
        return prediction_record
    
    def _update_feature_statistics(self, features: np.ndarray) -> None:
        """Update rolling feature statistics."""
        if isinstance(features, list):
            features = np.array(features)
        
        if features.ndim == 1:
            features = features.reshape(1, -1)
        
        # Calculate statistics
        feature_stats = {
            'timestamp': datetime.utcnow(),
            'mean': np.mean(features, axis=0).tolist(),
            'std': np.std(features, axis=0).tolist(),
            'min': np.min(features, axis=0).tolist(),
            'max': np.max(features, axis=0).tolist(),
            'percentiles': {
                '25': np.percentile(features, 25, axis=0).tolist(),
                '50': np.percentile(features, 50, axis=0).tolist(),
                '75': np.percentile(features, 75, axis=0).tolist()
            }
        }
        
        self.feature_statistics[self.model_name].append(feature_stats)
        
        # Keep only recent statistics
        if len(self.feature_statistics[self.model_name]) > self.window_size:
            self.feature_statistics[self.model_name] = self.feature_statistics[self.model_name][-self.window_size:]
    
    def log_metrics(self,
                   metrics: Dict[str, float],
                   data_hash: Optional[str] = None,
                   metadata: Optional[Dict] = None) -> ModelMetrics:
        """
        Log model metrics.
        
        Args:
            metrics: Dictionary of metrics to log
            data_hash: Hash of the input data (for drift detection)
            metadata: Additional metadata to store with the metrics
            
        Returns:
            The logged metrics object
        """
        metric_obj = ModelMetrics(
            timestamp=datetime.utcnow(),
            metrics=metrics,
            model_version=self.model_version,
            data_hash=data_hash,
            metadata=metadata or {}
        )
        
        self.history.append(metric_obj)
        
        # Keep only the most recent metrics
        if len(self.history) > self.window_size:
            self.history = self.history[-self.window_size:]
            
        self._save_metrics()
        return metric_obj
    
    def detect_drift(self, reference_metrics: Dict[str, float]) -> Dict[str, Any]:
        """
        Detect data drift by comparing to reference metrics.
        
        Args:
            reference_metrics: Reference metrics to compare against
            
        Returns:
            Dictionary of drift detection results
        """
        if not self.history:
            return {}
            
        # Get recent metrics (last hour)
        cutoff_time = datetime.utcnow() - timedelta(hours=1)
        recent_metrics = [
            m for m in self.history 
            if m.timestamp > cutoff_time
        ]
        
        if not recent_metrics:
            return {}
        
        # Calculate average metrics
        avg_metrics = {}
        for key in reference_metrics.keys():
            values = [m.metrics.get(key) for m in recent_metrics if key in m.metrics]
            if values:
                avg_metrics[key] = np.mean(values)
        
        # Check for drift
        drift_results = {}
        for key, ref_value in reference_metrics.items():
            if key in avg_metrics:
                current_value = avg_metrics[key]
                drift = abs((current_value - ref_value) / (ref_value + 1e-10))
                drift_results[key] = {
                    'drift_detected': drift > self.thresholds['data_drift'],
                    'drift_score': float(drift),
                    'reference_value': float(ref_value),
                    'current_value': float(current_value),
                    'threshold': self.thresholds['data_drift']
                }
        
        return drift_results
    
    def calculate_performance_metrics(self) -> ModelPerformanceMetrics:
        """
        Calculate comprehensive performance metrics.
        
        Returns:
            ModelPerformanceMetrics object with current performance stats
        """
        if self.model_name not in self.prediction_history or not self.prediction_history[self.model_name]:
            raise ValueError(f"No prediction data available for model: {self.model_name}")
        
        recent_history = self.prediction_history[self.model_name]
        
        # Basic metrics
        predictions_count = len(recent_history)
        avg_prediction_time = np.mean([r['prediction_time_ms'] for r in recent_history])
        
        # Accuracy metrics (if actuals available)
        accuracy_metrics = self._calculate_accuracy_metrics(recent_history)
        
        # Distribution metrics
        distribution_metrics = self._calculate_distribution_metrics(recent_history)
        
        # Drift metrics
        drift_metrics = self._calculate_drift_metrics()
        
        # Determine alert level
        alert_level = self._determine_alert_level(
            accuracy_metrics, 
            distribution_metrics, 
            drift_metrics, 
            avg_prediction_time
        )
        
        return ModelPerformanceMetrics(
            model_name=self.model_name,
            timestamp=datetime.utcnow(),
            predictions_count=predictions_count,
            avg_prediction_time_ms=avg_prediction_time,
            accuracy_metrics=accuracy_metrics,
            distribution_metrics=distribution_metrics,
            drift_metrics=drift_metrics,
            alert_level=alert_level
        )
    
    def _calculate_accuracy_metrics(self, recent_history: List[Dict]) -> Dict[str, float]:
        """Calculate accuracy-related metrics."""
        metrics = {}
        
        # Only calculate if we have actuals
        has_actuals = any('actuals' in r and r['actuals'] is not None for r in recent_history)
        
        if has_actuals:
            # Calculate error metrics
            errors = []
            abs_errors = []
            squared_errors = []
            
            for record in recent_history:
                if 'actuals' in record and record['actuals'] is not None:
                    pred = np.array(record['predictions'])
                    actual = np.array(record['actuals'])
                    error = pred - actual
                    errors.extend(error)
                    abs_errors.extend(np.abs(error))
                    squared_errors.extend(error ** 2)
            
            if errors:
                metrics['mae'] = float(np.mean(abs_errors))
                metrics['mse'] = float(np.mean(squared_errors))
                metrics['rmse'] = float(np.sqrt(metrics['mse']))
                metrics['error_rate'] = float(np.mean([e != 0 for e in errors]))
        
        return metrics
    
    def _calculate_distribution_metrics(self, recent_history: List[Dict]) -> Dict[str, float]:
        """Calculate data distribution metrics."""
        metrics = {}
        
        if not recent_history:
            return metrics
        
        # Get all predictions
        predictions = []
        for record in recent_history:
            pred = np.array(record['predictions'])
            if pred.size > 0:
                predictions.extend(pred.flatten())
        
        if not predictions:
            return metrics
        
        # Calculate distribution metrics
        metrics.update({
            'prediction_mean': float(np.mean(predictions)),
            'prediction_std': float(np.std(predictions)),
            'prediction_min': float(np.min(predictions)),
            'prediction_max': float(np.max(predictions)),
            'prediction_median': float(np.median(predictions)),
            'prediction_skew': float(stats.skew(predictions)),
            'prediction_kurtosis': float(stats.kurtosis(predictions))
        })
        
        return metrics
    
    def _calculate_drift_metrics(self) -> Dict[str, float]:
        """Calculate drift metrics."""
        if len(self.history) < 2:
            return {}
        
        # Get recent metrics (last hour)
        cutoff_time = datetime.utcnow() - timedelta(hours=1)
        recent_metrics = [m for m in self.history if m.timestamp > cutoff_time]
        
        if len(recent_metrics) < 2:
            return {}
        
        # Calculate drift for each metric
        drift_metrics = {}
        
        # Get all unique metric keys
        all_metric_keys = set()
        for metric in recent_metrics:
            all_metric_keys.update(metric.metrics.keys())
        
        for key in all_metric_keys:
            values = [m.metrics.get(key) for m in recent_metrics if key in m.metrics]
            if len(values) >= 2:
                # Simple drift detection using coefficient of variation
                cv = np.std(values) / (np.mean(values) + 1e-10)
                drift_metrics[f'drift_{key}'] = float(cv)
        
        return drift_metrics
    
    def _determine_alert_level(self,
                              accuracy_metrics: Dict[str, float],
                              distribution_metrics: Dict[str, float],
                              drift_metrics: Dict[str, float],
                              avg_prediction_time: float) -> str:
        """Determine the overall alert level based on metrics."""
        # Check prediction time
        if avg_prediction_time > self.thresholds['prediction_time']:
            return 'red'
        
        # Check error rate
        if 'error_rate' in accuracy_metrics and accuracy_metrics['error_rate'] > self.thresholds['error_rate']:
            return 'red'
        
        # Check for significant drift
        for metric, value in drift_metrics.items():
            if 'drift_' in metric and value > self.thresholds['drift_threshold']:
                return 'yellow'
        
        # Check for accuracy drop
        if 'rmse' in accuracy_metrics and 'baseline_rmse' in self.config:
            rmse_increase = (accuracy_metrics['rmse'] - self.config['baseline_rmse']) / self.config['baseline_rmse']
            if rmse_increase > self.thresholds['accuracy_drop']:
                return 'yellow'
        
        return 'green'
    
    def get_performance_summary(self, window_days: int = 7) -> Dict[str, Any]:
        """
        Get a summary of model performance over time.
        
        Args:
            window_days: Number of days to include in the summary
            
        Returns:
            Performance summary dictionary
        """
        if not self.history:
            return {}
        
        # Filter metrics by time window
        cutoff = datetime.utcnow() - timedelta(days=window_days)
        recent_metrics = [m for m in self.history if m.timestamp >= cutoff]
        
        if not recent_metrics:
            return {}
        
        # Calculate summary statistics
        all_metrics = {}
        for m in recent_metrics:
            for key, value in m.metrics.items():
                if key not in all_metrics:
                    all_metrics[key] = []
                all_metrics[key].append(value)
        
        summary = {}
        for key, values in all_metrics.items():
            summary[key] = {
                'mean': float(np.mean(values)),
                'std': float(np.std(values)),
                'min': float(np.min(values)),
                'max': float(np.max(values)),
                'count': len(values)
            }
        
        return summary

# Example usage
if __name__ == "__main__":
    # Example configuration
    config = {
        'thresholds': {
            'accuracy_drop': 0.1,
            'prediction_time': 1000,
            'drift_threshold': 0.3,
            'error_rate': 0.05,
            'data_drift': 0.1
        }
    }
    
    # Initialize monitor
    monitor = ModelMonitor("example_model", "v1", config)
    
    # Example: Log some predictions
    for i in range(100):
        features = np.random.rand(10)  # 10 features
        predictions = np.random.rand(3)  # 3 predictions
        actuals = np.random.rand(3)  # 3 actual values
        
        monitor.log_prediction(
            features=features,
            predictions=predictions,
            actuals=actuals,
            prediction_time_ms=np.random.uniform(10, 100)
        )
    
    # Generate report
    report = monitor.calculate_performance_metrics()
    print("Model Performance Report:")
    print(json.dumps(report.to_dict(), indent=2))
    
    # Check for alerts
    alerts = []
    if report.alert_level != 'green':
        alerts.append({
            'model_name': report.model_name,
            'alert_level': report.alert_level,
            'timestamp': report.timestamp.isoformat(),
            'issues': []
        })
    
    if alerts:
        print("\nAlerts:")
        print(json.dumps(alerts, indent=2))
