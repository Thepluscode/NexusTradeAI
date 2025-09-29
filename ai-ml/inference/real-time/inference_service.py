"""
Real-time Inference Service with Monitoring

This module provides a service for making predictions with integrated
monitoring for data drift and model performance.
"""

import os
import logging
import pandas as pd
import numpy as np
import json
import time
from typing import Dict, Any, Optional, List, Union
from pathlib import Path
import joblib
import mlflow

# Import monitoring service
from inference.monitoring.monitoring_service import ModelMonitoringService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class InferenceService:
    """
    Service for making predictions with integrated monitoring.
    
    Features:
    - Model loading and caching
    - Real-time prediction
    - Data drift detection
    - Performance monitoring
    - Automatic retraining triggers
    """
    
    def __init__(self, config_path: str = None):
        """
        Initialize the inference service.
        
        Args:
            config_path: Path to configuration file
        """
        self.config = self._load_config(config_path)
        self.model = None
        self.feature_columns = None
        self.last_retrain_time = None
        self.prediction_history = []
        
        # Initialize monitoring
        self.monitor = ModelMonitoringService(
            config_path=self.config.get('monitoring_config_path')
        )
        
        # Load model
        self._load_model()
        
        # Load reference data if available
        self._load_reference_data()
    
    def _load_config(self, config_path: str = None) -> Dict[str, Any]:
        """Load configuration from file or use defaults."""
        default_config = {
            'model': {
                'path': 'models/model.joblib',  # Path to saved model
                'type': 'lightgbm',  # lightgbm, random_forest, etc.
                'input_features': None  # Will be set from model if possible
            },
            'monitoring': {
                'enabled': True,
                'drift_threshold': 0.7,  # Score above which to trigger alerts
                'reference_data_path': 'data/monitoring/reference_data.parquet',
                'prediction_log_path': 'logs/predictions/',
                'batch_size': 100  # Number of predictions before checking for drift
            },
            'retraining': {
                'enabled': True,
                'min_interval_hours': 24,
                'drift_threshold': 0.8
            },
            'mlflow': {
                'tracking_uri': 'http://localhost:5000',
                'model_name': 'nexustradeai_model',
                'stage': 'Production'
            }
        }
        
        if not config_path:
            return default_config
            
        try:
            with open(config_path, 'r') as f:
                user_config = json.load(f)
                return self._merge_dicts(default_config, user_config)
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
    
    def _load_model(self):
        """Load the ML model from disk or MLflow."""
        model_path = self.config['model']['path']
        
        try:
            # Try loading from disk first
            if os.path.exists(model_path):
                self.model = joblib.load(model_path)
                logger.info(f"Loaded model from {model_path}")
            # Fall back to MLflow
            else:
                self._load_model_from_mlflow()
                
            # Try to extract feature names if available
            self._extract_feature_names()
            
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise
    
    def _load_model_from_mlflow(self):
        """Load model from MLflow model registry."""
        try:
            mlflow.set_tracking_uri(self.config['mlflow']['tracking_uri'])
            
            # Load model from MLflow
            client = mlflow.MlflowClient()
            model_uri = f"models:/{self.config['mlflow']['model_name']}/{self.config['mlflow']['stage']}"
            
            logger.info(f"Loading model from MLflow: {model_uri}")
            self.model = mlflow.pyfunc.load_model(model_uri)
            
            # Save model locally for faster loading next time
            os.makedirs(os.path.dirname(self.config['model']['path']), exist_ok=True)
            joblib.dump(self.model, self.config['model']['path'])
            
        except Exception as e:
            logger.error(f"Failed to load model from MLflow: {e}")
            raise
    
    def _extract_feature_names(self):
        """Extract feature names from the model if possible."""
        if hasattr(self.model, 'feature_name_'):  # LightGBM
            self.feature_columns = list(self.model.feature_name_)
        elif hasattr(self.model, 'feature_importances_'):  # Scikit-learn
            if hasattr(self.model, 'feature_names_in_'):
                self.feature_columns = list(self.model.feature_names_in_)
        
        if self.feature_columns:
            logger.info(f"Extracted {len(self.feature_columns)} feature names from model")
            self.config['model']['input_features'] = self.feature_columns
    
    def _load_reference_data(self):
        """Load reference data for drift detection."""
        if not self.config['monitoring']['enabled']:
            return
            
        ref_path = self.config['monitoring']['reference_data_path']
        if os.path.exists(ref_path):
            try:
                reference_data = pd.read_parquet(ref_path)
                target_col = None
                if 'target' in reference_data.columns:
                    target_col = 'target'
                self.monitor.set_reference_data(reference_data, target_col=target_col)
                logger.info(f"Loaded reference data from {ref_path}")
            except Exception as e:
                logger.error(f"Failed to load reference data: {e}")
    
    def preprocess_input(self, input_data: Union[pd.DataFrame, Dict, List[Dict]]) -> pd.DataFrame:
        """Preprocess input data for prediction."""
        # Convert to DataFrame if needed
        if isinstance(input_data, dict):
            input_df = pd.DataFrame([input_data])
        elif isinstance(input_data, list):
            input_df = pd.DataFrame(input_data)
        else:
            input_df = input_data.copy()
        
        # Ensure we have the expected features
        if self.feature_columns is not None:
            missing_cols = set(self.feature_columns) - set(input_df.columns)
            if missing_cols:
                for col in missing_cols:
                    input_df[col] = 0  # Fill missing with zeros
                logger.warning(f"Added missing columns with default values: {missing_cols}")
            
            # Reorder columns to match training
            input_df = input_df[self.feature_columns]
        
        return input_df
    
    def predict(self, input_data: Union[pd.DataFrame, Dict, List[Dict]], 
               return_proba: bool = False) -> Dict[str, Any]:
        """
        Make predictions with monitoring.
        
        Args:
            input_data: Input data for prediction
            return_proba: Whether to return class probabilities (for classification)
            
        Returns:
            Dictionary containing predictions and monitoring results
        """
        start_time = time.time()
        
        try:
            # Preprocess input
            input_df = self.preprocess_input(input_data)
            
            # Make predictions
            if hasattr(self.model, 'predict_proba') and return_proba:
                predictions = self.model.predict_proba(input_df)
            else:
                predictions = self.model.predict(input_df)
            
            # Log prediction
            self._log_prediction(input_df, predictions, start_time)
            
            # Check for data drift
            drift_result = None
            if self.config['monitoring']['enabled']:
                drift_result = self._check_for_drift(input_df)
            
            # Prepare response
            response = {
                'status': 'success',
                'predictions': predictions.tolist() if hasattr(predictions, 'tolist') else predictions,
                'metadata': {
                    'model_version': self._get_model_version(),
                    'prediction_time_ms': (time.time() - start_time) * 1000,
                    'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
                }
            }
            
            # Add drift info if available
            if drift_result:
                response['drift_detected'] = drift_result['has_drift']
                response['drift_score'] = drift_result['drift_score']
                
                # Trigger retraining if needed
                if (drift_result['has_drift'] and 
                    self.config['retraining']['enabled'] and 
                    self._should_retrain(drift_result['drift_score'])):
                    self._trigger_retraining()
            
            return response
            
        except Exception as e:
            logger.error(f"Prediction failed: {e}", exc_info=True)
            return {
                'status': 'error',
                'error': str(e),
                'metadata': {
                    'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
                }
            }
    
    def _check_for_drift(self, input_data: pd.DataFrame) -> Optional[Dict]:
        """Check for data drift in the input data."""
        try:
            # Only check every N predictions to reduce overhead
            if len(self.prediction_history) < self.config['monitoring']['batch_size']:
                return None
                
            # Reset history after checking
            self.prediction_history = []
            
            # Check for drift
            result = self.monitor.check_for_drift(input_data)
            
            if result['has_drift']:
                logger.warning(
                    f"Data drift detected! Score: {result['drift_score']:.2f} "
                    f"(threshold: {self.config['monitoring']['drift_threshold']})"
                )
            
            return result
            
        except Exception as e:
            logger.error(f"Drift detection failed: {e}")
            return None
    
    def _should_retrain(self, drift_score: float) -> bool:
        """Determine if model should be retrained based on drift score."""
        if not self.config['retraining']['enabled']:
            return False
            
        # Check drift threshold
        if drift_score < self.config['retraining']['drift_threshold']:
            return False
            
        # Check minimum retrain interval
        if self.last_retrain_time is not None:
            min_interval = self.config['retraining']['min_interval_hours'] * 3600
            time_since_last = time.time() - self.last_retrain_time
            if time_since_last < min_interval:
                logger.info(
                    f"Skipping retraining: {time_since_last/3600:.1f}h since last retrain "
                    f"(min interval: {self.config['retraining']['min_interval_hours']}h)"
                )
                return False
        
        return True
    
    def _trigger_retraining(self):
        """Trigger model retraining."""
        logger.info("Triggering model retraining...")
        self.last_retrain_time = time.time()
        
        # In a real implementation, you would trigger your training pipeline here
        # For example, by calling an API endpoint or adding a job to a queue
        # This is a placeholder for that logic
        try:
            # Example: Trigger retraining pipeline
            # from training.pipelines.training_pipeline import run_training
            # run_training()
            
            # Log the retraining event
            self._log_retraining_event()
            
            logger.info("Retraining triggered successfully")
            
        except Exception as e:
            logger.error(f"Failed to trigger retraining: {e}")
    
    def _log_prediction(self, input_data: pd.DataFrame, predictions: np.ndarray, 
                       start_time: float):
        """Log prediction details for monitoring."""
        if not self.config['monitoring']['enabled']:
            return
        
        try:
            # Create log entry
            log_entry = {
                'timestamp': time.time(),
                'input_data': input_data.to_dict(orient='records'),
                'predictions': predictions.tolist() if hasattr(predictions, 'tolist') else predictions,
                'processing_time_ms': (time.time() - start_time) * 1000,
                'model_version': self._get_model_version()
            }
            
            # Add to history for batch processing
            self.prediction_history.append(log_entry)
            
            # Save to log file
            log_dir = self.config['monitoring']['prediction_log_path']
            os.makedirs(log_dir, exist_ok=True)
            
            log_file = os.path.join(log_dir, f"predictions_{int(time.time())}.json")
            with open(log_file, 'w') as f:
                json.dump(log_entry, f)
                
        except Exception as e:
            logger.error(f"Failed to log prediction: {e}")
    
    def _log_retraining_event(self):
        """Log retraining event."""
        try:
            log_dir = self.config['monitoring']['prediction_log_path']
            os.makedirs(log_dir, exist_ok=True)
            
            log_entry = {
                'event': 'retraining_triggered',
                'timestamp': time.time(),
                'model_version': self._get_model_version(),
                'reason': 'data_drift',
                'drift_score': getattr(self.monitor, 'last_drift_score', None)
            }
            
            log_file = os.path.join(log_dir, f"retrain_{int(time.time())}.json")
            with open(log_file, 'w') as f:
                json.dump(log_entry, f)
                
        except Exception as e:
            logger.error(f"Failed to log retraining event: {e}")
    
    def _get_model_version(self) -> str:
        """Get the current model version."""
        # In a real implementation, this would get the version from the model or config
        return "1.0.0"
    
    def get_status(self) -> Dict[str, Any]:
        """Get service status and metrics."""
        return {
            'status': 'running',
            'model': {
                'type': self.config['model']['type'],
                'version': self._get_model_version(),
                'features': self.feature_columns
            },
            'monitoring': {
                'enabled': self.config['monitoring']['enabled'],
                'drift_threshold': self.config['monitoring']['drift_threshold'],
                'predictions_processed': len(self.prediction_history)
            },
            'last_retrain_time': self.last_retrain_time
        }


def create_inference_service(config_path: str = None) -> InferenceService:
    """Create and initialize an inference service."""
    return InferenceService(config_path)


# Example usage
if __name__ == "__main__":
    # Initialize service
    service = InferenceService()
    
    # Example prediction
    sample_input = {
        'feature1': 0.5,
        'feature2': 0.8,
        # Add other features as needed
    }
    
    # Make prediction
    result = service.predict(sample_input)
    print("Prediction result:", json.dumps(result, indent=2))
    
    # Get service status
    status = service.get_status()
    print("\nService status:", json.dumps(status, indent=2))
