"""
Training Pipeline with Integrated Monitoring

This module provides a complete training pipeline that integrates model training
with monitoring setup for data drift and model performance tracking.
"""

import os
import logging
import pandas as pd
import numpy as np
import mlflow
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
import yaml

# Import monitoring service
from inference.monitoring.monitoring_service import ModelMonitoringService

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TrainingPipeline:
    """
    End-to-end training pipeline with integrated monitoring
    """
    
    def __init__(self, config_path: str = None):
        """
        Initialize the training pipeline
        
        Args:
            config_path: Path to configuration file
        """
        self.config = self._load_config(config_path)
        self.monitor = ModelMonitoringService(
            config_path=self.config.get('monitoring_config_path')
        )
        self.model = None
        self.feature_columns = None
        
    def _load_config(self, config_path: str = None) -> Dict[str, Any]:
        """Load configuration from file or use defaults."""
        default_config = {
            'data': {
                'train_path': 'data/processed/train.csv',
                'val_path': 'data/processed/val.csv',
                'test_path': 'data/processed/test.csv',
                'target_column': 'target',
                'feature_columns': None  # Will be set from data if None
            },
            'model': {
                'type': 'lightgbm',
                'params': {},
                'save_path': 'models/'
            },
            'monitoring': {
                'enabled': True,
                'reference_data_path': 'data/monitoring/reference_data.parquet',
                'update_reference': True
            },
            'mlflow': {
                'tracking_uri': 'http://localhost:5000',
                'experiment_name': 'nexustradeai_training'
            }
        }
        
        if not config_path:
            return default_config
            
        try:
            with open(config_path, 'r') as f:
                user_config = yaml.safe_load(f)
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
    
    def load_data(self) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, pd.Series]:
        """Load and prepare training and validation data."""
        logger.info("Loading training and validation data...")
        
        # Load data
        train_df = pd.read_parquet(self.config['data']['train_path'])
        val_df = pd.read_parquet(self.config['data']['val_path'])
        
        # Set feature columns if not specified
        if self.config['data']['feature_columns'] is None:
            self.config['data']['feature_columns'] = [
                col for col in train_df.columns 
                if col != self.config['data']['target_column']
            ]
        
        # Extract features and target
        X_train = train_df[self.config['data']['feature_columns']]
        y_train = train_df[self.config['data']['target_column']]
        X_val = val_df[self.config['data']['feature_columns']]
        y_val = val_df[self.config['data']['target_column']]
        
        # Set feature names for monitoring
        self.feature_columns = self.config['data']['feature_columns']
        
        return X_train, y_train, X_val, y_val
    
    def train_model(self, X_train: pd.DataFrame, y_train: pd.Series) -> Any:
        """Train the model based on configuration."""
        model_type = self.config['model']['type'].lower()
        logger.info(f"Training {model_type} model...")
        
        # This is a simplified example - you would implement actual model training here
        if model_type == 'lightgbm':
            import lightgbm as lgb
            model = lgb.LGBMRegressor(**self.config['model'].get('params', {}))
            model.fit(X_train, y_train)
        elif model_type == 'random_forest':
            from sklearn.ensemble import RandomForestRegressor
            model = RandomForestRegressor(**self.config['model'].get('params', {}))
            model.fit(X_train, y_train)
        else:
            raise ValueError(f"Unsupported model type: {model_type}")
        
        self.model = model
        return model
    
    def evaluate_model(self, model: Any, X_val: pd.DataFrame, y_val: pd.Series) -> Dict[str, float]:
        """Evaluate model performance."""
        from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
        
        y_pred = model.predict(X_val)
        
        metrics = {
            'mse': mean_squared_error(y_val, y_pred),
            'mae': mean_absolute_error(y_val, y_pred),
            'r2': r2_score(y_val, y_pred)
        }
        
        logger.info(f"Validation Metrics: {metrics}")
        return metrics
    
    def setup_monitoring(self, X_train: pd.DataFrame, y_train: pd.Series):
        """Set up monitoring with reference data."""
        if not self.config['monitoring']['enabled']:
            logger.info("Monitoring is disabled in config")
            return
        
        # Create reference data with features and target
        reference_data = X_train.copy()
        reference_data[self.config['data']['target_column']] = y_train
        
        # Save reference data
        os.makedirs(os.path.dirname(self.config['monitoring']['reference_data_path']), exist_ok=True)
        reference_data.to_parquet(self.config['monitoring']['reference_data_path'])
        
        # Set reference data in monitor
        self.monitor.set_reference_data(
            reference_data=reference_data,
            target_col=self.config['data']['target_column']
        )
        
        logger.info(f"Monitoring set up with reference data: {reference_data.shape}")
    
    def log_to_mlflow(self, metrics: Dict[str, float], params: Dict[str, Any] = None):
        """Log training run to MLflow."""
        mlflow.set_tracking_uri(self.config['mlflow']['tracking_uri'])
        mlflow.set_experiment(self.config['mlflow']['experiment_name'])
        
        with mlflow.start_run():
            # Log parameters
            if params:
                mlflow.log_params(params)
            
            # Log metrics
            mlflow.log_metrics(metrics)
            
            # Log model
            if self.model is not None:
                mlflow.sklearn.log_model(
                    self.model,
                    "model",
                    registered_model_name=f"{self.config['model']['type']}_model"
                )
            
            # Log reference data path
            mlflow.log_artifact(self.config['monitoring']['reference_data_path'])
    
    def save_model(self):
        """Save the trained model to disk."""
        if self.model is None:
            raise ValueError("No model has been trained yet")
        
        os.makedirs(self.config['model']['save_path'], exist_ok=True)
        model_path = os.path.join(
            self.config['model']['save_path'],
            f"{self.config['model']['type']}_model.joblib"
        )
        
        import joblib
        joblib.dump(self.model, model_path)
        logger.info(f"Model saved to {model_path}")
    
    def run(self):
        """Run the complete training pipeline."""
        try:
            # Load data
            X_train, y_train, X_val, y_val = self.load_data()
            
            # Set up monitoring with training data
            self.setup_monitoring(X_train, y_train)
            
            # Train model
            model = self.train_model(X_train, y_train)
            
            # Evaluate
            metrics = self.evaluate_model(model, X_val, y_val)
            
            # Log to MLflow
            self.log_to_mlflow(metrics, params={
                'model_type': self.config['model']['type'],
                **self.config['model'].get('params', {})
            })
            
            # Save model
            self.save_model()
            
            logger.info("Training pipeline completed successfully")
            return {
                'status': 'success',
                'metrics': metrics,
                'model_path': os.path.join(
                    self.config['model']['save_path'],
                    f"{self.config['model']['type']}_model.joblib"
                )
            }
            
        except Exception as e:
            logger.error(f"Training pipeline failed: {e}", exc_info=True)
            return {
                'status': 'error',
                'error': str(e)
            }


def run_training(config_path: str = None):
    """Run the training pipeline with the given configuration."""
    pipeline = TrainingPipeline(config_path)
    return pipeline.run()


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Run NexusTradeAI training pipeline')
    parser.add_argument('--config', type=str, help='Path to configuration file')
    args = parser.parse_args()
    
    result = run_training(args.config)
    print("Training completed with result:", result)
