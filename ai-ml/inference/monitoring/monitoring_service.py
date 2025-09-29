"""
Monitoring Service for NexusTradeAI

This module provides a monitoring service that integrates with the ML pipeline
to detect data drift, trigger alerts, and manage model retraining.
"""

import os
import time
import logging
import yaml
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Union
from dataclasses import asdict
import json
import joblib
from pathlib import Path

# Import the drift detector we created
from .drift_detector import DataDriftDetector, DatasetDriftResult

# Import MLflow for model management
import mlflow
from mlflow.tracking import MlflowClient

# Import notification service
from ..utils.notifications import NotificationService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelMonitoringService:
    """
    Service for monitoring ML models in production.
    
    Handles:
    - Scheduled drift detection
    - Alerting on significant drift
    - Triggering model retraining
    - Maintaining monitoring history
    """
    
    def __init__(self, config_path: str = None):
        """
        Initialize the monitoring service.
        
        Args:
            config_path: Path to the monitoring configuration file
        """
        # Load configuration
        self.config = self._load_config(config_path)
        
        # Initialize components
        self.drift_detector = None
        self.notification_service = NotificationService(
            config=self.config.get('notifications', {})
        )
        self.mlflow_client = MlflowClient()
        
        # State
        self.last_run_time = None
        self.monitoring_history = []
        self._initialize_drift_detector()
    
    def _load_config(self, config_path: str = None) -> Dict[str, Any]:
        """Load monitoring configuration from file."""
        default_config = {
            'monitoring': {
                'schedule_interval_minutes': 60,  # Check for drift every hour
                'drift_threshold': 0.5,  # Overall drift score threshold
                'feature_drift_threshold': 0.7,  # Individual feature drift threshold
                'min_samples': 100,  # Minimum samples required for drift detection
                'history_window_days': 30,  # Days to keep in history
                'model_registry': {
                    'name': 'nexustradeai',
                    'stage': 'Production'
                },
                'retraining': {
                    'enabled': True,
                    'min_retrain_interval_hours': 24,
                    'trigger_on_drift': True,
                    'drift_threshold': 0.7
                }
            },
            'notifications': {
                'enabled': True,
                'slack_webhook': None,
                'email_recipients': [],
                'min_severity': 'warning'  # debug, info, warning, error, critical
            }
        }
        
        if not config_path:
            return default_config
            
        try:
            with open(config_path, 'r') as f:
                config = yaml.safe_load(f)
                # Merge with defaults
                return self._merge_dicts(default_config, config)
        except Exception as e:
            logger.warning(f"Failed to load config from {config_path}: {e}")
            return default_config
    
    def _merge_dicts(self, dict1: Dict, dict2: Dict) -> Dict:
        """Recursively merge two dictionaries."""
        result = dict1.copy()
        for key, value in dict2.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._merge_dicts(result[key], value)
            else:
                result[key] = value
        return result
    
    def _initialize_drift_detector(self):
        """Initialize the drift detector with reference data."""
        try:
            # Try to load existing detector
            detector_path = self.config.get('monitoring', {}).get('detector_path', 'models/drift_detector.joblib')
            if os.path.exists(detector_path):
                self.drift_detector = DataDriftDetector.load_detector(detector_path)
                logger.info(f"Loaded drift detector from {detector_path}")
                return
        except Exception as e:
            logger.warning(f"Failed to load drift detector: {e}")
        
        # Initialize new detector if loading failed
        self.drift_detector = DataDriftDetector(
            config={
                'drift_threshold': self.config['monitoring'].get('drift_threshold', 0.05),
                'min_samples': self.config['monitoring'].get('min_samples', 100)
            }
        )
        logger.info("Initialized new drift detector")
    
    def set_reference_data(self, data: pd.DataFrame, target_col: str = None):
        """
        Set the reference data for drift detection.
        
        Args:
            data: Reference dataset (pandas DataFrame)
            target_col: Name of the target column (if any)
        """
        self.drift_detector.set_reference_data(data, target_col=target_col)
        self._save_drift_detector()
    
    def _save_drift_detector(self):
        """Save the current drift detector state."""
        try:
            detector_path = self.config.get('monitoring', {}).get('detector_path', 'models/drift_detector.joblib')
            os.makedirs(os.path.dirname(detector_path), exist_ok=True)
            self.drift_detector.save_detector(detector_path)
            logger.info(f"Saved drift detector to {detector_path}")
        except Exception as e:
            logger.error(f"Failed to save drift detector: {e}")
    
    def check_for_drift(self, current_data: pd.DataFrame, target_col: str = None) -> Dict[str, Any]:
        """
        Check for data drift in the current data compared to reference.
        
        Args:
            current_data: Current data to check for drift
            target_col: Name of the target column (if any)
            
        Returns:
            Dict containing drift detection results
        """
        if self.drift_detector is None:
            raise ValueError("Drift detector not initialized. Call set_reference_data() first.")
        
        # Check if we have enough data
        if len(current_data) < self.config['monitoring'].get('min_samples', 100):
            logger.warning(f"Insufficient samples for drift detection: {len(current_data)} < {self.config['monitoring'].get('min_samples', 100)}")
            return {
                'status': 'insufficient_data',
                'message': f"Insufficient samples: {len(current_data)}"
            }
        
        # Detect drift
        try:
            result = self.drift_detector.detect_drift(current_data, target_col=target_col)
            self.last_run_time = datetime.now()
            
            # Log the result
            self._log_drift_result(result)
            
            # Check if we need to trigger alerts or retraining
            self._handle_drift_result(result)
            
            return self._format_drift_result(result)
            
        except Exception as e:
            logger.error(f"Error during drift detection: {e}", exc_info=True)
            return {
                'status': 'error',
                'message': str(e)
            }
    
    def _log_drift_result(self, result: DatasetDriftResult):
        """Log drift detection result to history."""
        # Convert to dict for storage
        result_dict = {
            'timestamp': datetime.now().isoformat(),
            'has_drift': result.has_drift,
            'drift_type': result.drift_type.value if hasattr(result.drift_type, 'value') else str(result.drift_type),
            'drift_score': result.drift_score,
            'n_drifted_features': result.metadata.get('n_drifted_features', 0),
            'n_features': len(result.feature_drifts) if result.feature_drifts else 0,
            'details': [asdict(f) for f in result.feature_drifts] if result.feature_drifts else []
        }
        
        # Add to history
        self.monitoring_history.append(result_dict)
        
        # Trim history to configured window
        history_days = self.config['monitoring'].get('history_window_days', 30)
        cutoff_time = (datetime.now() - timedelta(days=history_days)).isoformat()
        self.monitoring_history = [r for r in self.monitoring_history if r['timestamp'] > cutoff_time]
        
        # Save history to disk
        self._save_monitoring_history()
    
    def _save_monitoring_history(self):
        """Save monitoring history to disk."""
        try:
            history_path = self.config.get('monitoring', {}).get('history_path', 'monitoring/history.json')
            os.makedirs(os.path.dirname(history_path), exist_ok=True)
            with open(history_path, 'w') as f:
                json.dump(self.monitoring_history, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save monitoring history: {e}")
    
    def _load_monitoring_history(self):
        """Load monitoring history from disk."""
        try:
            history_path = self.config.get('monitoring', {}).get('history_path', 'monitoring/history.json')
            if os.path.exists(history_path):
                with open(history_path, 'r') as f:
                    self.monitoring_history = json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load monitoring history: {e}")
    
    def _handle_drift_result(self, result: DatasetDriftResult):
        """Handle drift detection result (alerts, retraining, etc.)."""
        if not result.has_drift:
            return
        
        # Prepare drift details
        drift_details = {
            'timestamp': datetime.now().isoformat(),
            'drift_type': result.drift_type.value if hasattr(result.drift_type, 'value') else str(result.drift_type),
            'drift_score': result.drift_score,
            'n_drifted_features': result.metadata.get('n_drifted_features', 0),
            'drifted_features': [
                {
                    'feature': f.feature_name,
                    'drift_score': f.drift_score,
                    'test': f.test_name,
                    'p_value': f.p_value
                }
                for f in result.feature_drifts 
                if f.has_drift
            ]
        }
        
        # Send alerts if configured
        self._send_drift_alert(drift_details)
        
        # Trigger retraining if needed
        if self.config['monitoring'].get('retraining', {}).get('enabled', False):
            self._trigger_retraining(drift_details)
    
    def _send_drift_alert(self, drift_details: Dict[str, Any]):
        """Send alert about detected drift."""
        if not self.config['notifications'].get('enabled', False):
            return
        
        try:
            # Prepare alert message
            message = {
                'severity': 'warning' if drift_details['drift_score'] < 0.7 else 'error',
                'title': f"Data Drift Detected: {drift_details['drift_type']}",
                'message': (
                    f"Drift score: {drift_details['drift_score']:.2f}\n"
                    f"Drifted features: {drift_details['n_drifted_features']}"
                ),
                'details': drift_details,
                'timestamp': drift_details['timestamp']
            }
            
            # Send notification
            self.notification_service.send_notification(
                message=message,
                min_severity=self.config['notifications'].get('min_severity', 'warning')
            )
            
        except Exception as e:
            logger.error(f"Failed to send drift alert: {e}")
    
    def _trigger_retraining(self, drift_details: Dict[str, Any]):
        """Trigger model retraining if drift exceeds threshold."""
        retrain_config = self.config['monitoring'].get('retraining', {})
        
        # Check if retraining is enabled and drift exceeds threshold
        if not retrain_config.get('enabled', False):
            return
            
        if drift_details['drift_score'] < retrain_config.get('drift_threshold', 0.7):
            logger.info(f"Drift score {drift_details['drift_score']:.2f} below retraining threshold {retrain_config.get('drift_threshold', 0.7)}")
            return
        
        # Check minimum retrain interval
        last_retrain_time = self._get_last_retrain_time()
        min_interval = timedelta(hours=retrain_config.get('min_retrain_interval_hours', 24))
        
        if last_retrain_time and (datetime.now() - last_retrain_time) < min_interval:
            logger.info(f"Skipping retraining: minimum interval {min_interval} not reached")
            return
        
        try:
            logger.info("Triggering model retraining...")
            # Here you would trigger your retraining pipeline
            # For example:
            # from training.pipelines import training_pipeline
            # training_pipeline.run()
            
            # Update last retrain time
            self._update_last_retrain_time()
            
            # Send notification
            self.notification_service.send_notification({
                'severity': 'info',
                'title': 'Model Retraining Triggered',
                'message': f"Retraining triggered due to data drift (score: {drift_details['drift_score']:.2f})",
                'details': drift_details
            })
            
        except Exception as e:
            logger.error(f"Failed to trigger retraining: {e}")
            self.notification_service.send_notification({
                'severity': 'error',
                'title': 'Model Retraining Failed',
                'message': f"Failed to trigger retraining: {str(e)}",
                'details': {'error': str(e)}
            })
    
    def _get_last_retrain_time(self) -> Optional[datetime]:
        """Get the timestamp of the last retraining."""
        try:
            history_path = self.config.get('monitoring', {}).get('history_path', 'monitoring/history.json')
            if os.path.exists(history_path):
                with open(history_path, 'r') as f:
                    history = json.load(f)
                    for entry in reversed(history):
                        if entry.get('event') == 'retraining_completed':
                            return datetime.fromisoformat(entry['timestamp'])
        except Exception as e:
            logger.warning(f"Failed to get last retrain time: {e}")
        return None
    
    def _update_last_retrain_time(self):
        """Update the timestamp of the last retraining."""
        try:
            history_path = self.config.get('monitoring', {}).get('history_path', 'monitoring/history.json')
            os.makedirs(os.path.dirname(history_path), exist_ok=True)
            
            # Load existing history
            history = []
            if os.path.exists(history_path):
                with open(history_path, 'r') as f:
                    history = json.load(f)
            
            # Add retraining event
            history.append({
                'event': 'retraining_completed',
                'timestamp': datetime.now().isoformat(),
                'details': {'status': 'started'}
            })
            
            # Save updated history
            with open(history_path, 'w') as f:
                json.dump(history, f, indent=2)
                
        except Exception as e:
            logger.error(f"Failed to update retrain time: {e}")
    
    def _format_drift_result(self, result: DatasetDriftResult) -> Dict[str, Any]:
        """Format drift detection result for API response."""
        return {
            'status': 'success',
            'has_drift': result.has_drift,
            'drift_type': result.drift_type.value if hasattr(result.drift_type, 'value') else str(result.drift_type),
            'drift_score': result.drift_score,
            'n_drifted_features': result.metadata.get('n_drifted_features', 0),
            'n_features': len(result.feature_drifts) if result.feature_drifts else 0,
            'timestamp': datetime.now().isoformat(),
            'feature_drifts': [
                {
                    'feature': f.feature_name,
                    'data_type': f.data_type.value if hasattr(f.data_type, 'value') else str(f.data_type),
                    'has_drift': f.has_drift,
                    'drift_score': f.drift_score,
                    'p_value': f.p_value,
                    'test_name': f.test_name,
                    'message': f.message
                }
                for f in result.feature_drifts
            ] if result.feature_drifts else []
        }
    
    def run_scheduled_check(self, data_loader_func, *args, **kwargs):
        """
        Run scheduled drift check using the provided data loader function.
        
        Args:
            data_loader_func: Function that returns the current data for drift checking
            *args, **kwargs: Arguments to pass to the data loader function
        """
        interval_minutes = self.config['monitoring'].get('schedule_interval_minutes', 60)
        
        logger.info(f"Starting scheduled drift monitoring (interval: {interval_minutes} minutes)")
        
        while True:
            try:
                logger.info("Running scheduled drift check...")
                
                # Load current data
                current_data = data_loader_func(*args, **kwargs)
                
                # Check for drift
                result = self.check_for_drift(current_data)
                
                logger.info(f"Drift check completed. Drift detected: {result.get('has_drift', False)}")
                
            except Exception as e:
                logger.error(f"Error during scheduled drift check: {e}", exc_info=True)
            
            # Wait for next interval
            time.sleep(interval_minutes * 60)


# Example usage
if __name__ == "__main__":
    import pandas as pd
    import numpy as np
    
    # Initialize monitoring service
    monitor = ModelMonitoringService()
    
    # Example data loader function
    def load_current_data():
        """Example function to load current data."""
        # In a real application, this would load your current data
        # For example: return pd.read_csv('data/current.csv')
        
        # Generate some example data
        np.random.seed(42)
        n_samples = 1000
        return pd.DataFrame({
            'age': np.random.normal(45, 12, n_samples),  # Slightly different distribution
            'income': np.random.lognormal(10.2, 0.6, n_samples),
            'gender': np.random.choice(['M', 'F', 'Other'], size=n_samples, p=[0.45, 0.45, 0.1]),
            'purchased': np.random.binomial(1, 0.35, n_samples)
        })
    
    # Set reference data (only needed once)
    if not hasattr(monitor, 'reference_set') or not monitor.reference_set:
        reference_data = pd.DataFrame({
            'age': np.random.normal(40, 10, 1000),
            'income': np.random.lognormal(10, 0.5, 1000),
            'gender': np.random.choice(['M', 'F', 'Other'], size=1000, p=[0.49, 0.49, 0.02]),
            'purchased': np.random.binomial(1, 0.3, 1000)
        })
        monitor.set_reference_data(reference_data, target_col='purchased')
    
    # Run a single check
    result = monitor.check_for_drift(load_current_data())
    print("Drift check result:", json.dumps(result, indent=2))
    
    # Or run continuously on a schedule
    # monitor.run_scheduled_check(load_current_data)
