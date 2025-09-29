"""
Advanced hyperparameter tuning for financial ML models.

This module provides hyperparameter optimization using Optuna with support for
various model types including LSTM, Transformer, LightGBM, and ensemble models.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Any, Tuple, Optional
import logging
from datetime import datetime
import optuna
import mlflow
import joblib
import yaml
import tensorflow as tf
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_squared_error, mean_absolute_error

class HyperparameterTuner:
    """
    Advanced hyperparameter tuning for financial ML models using Optuna
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize hyperparameter tuner
        
        Args:
            config: Tuning configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Tuning parameters
        self.n_trials = config.get('n_trials', 100)
        self.cv_folds = config.get('cv_folds', 3)
        self.optimization_direction = config.get('direction', 'minimize')
        self.pruning = config.get('pruning', True)
        
        # Study configuration
        self.study_name = config.get('study_name', f'financial_ml_tuning_{datetime.now().strftime("%Y%m%d_%H%M")}')
        self.storage_url = config.get('storage_url', 'sqlite:///hyperparameter_tuning.db')
        
        # Best parameters storage
        self.best_params = {}
        self.best_scores = {}
        
    def tune_model(self, 
                  model_type: str,
                  X_train: np.ndarray,
                  y_train: np.ndarray,
                  X_val: np.ndarray,
                  y_val: np.ndarray) -> Dict[str, Any]:
        """
        Tune hyperparameters for a specific model type
        
        Args:
            model_type: Type of model to tune
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            
        Returns:
            Best hyperparameters and results
        """
        self.logger.info(f"Starting hyperparameter tuning for {model_type}")
        
        # Create study
        study = optuna.create_study(
            study_name=f"{self.study_name}_{model_type}",
            storage=self.storage_url,
            direction=self.optimization_direction,
            load_if_exists=True,
            pruner=optuna.pruners.MedianPruner() if self.pruning else None
        )
        
        # Define objective function based on model type
        objective_func = self.create_objective_function(
            model_type, X_train, y_train, X_val, y_val
        )
        
        # Run optimization
        study.optimize(objective_func, n_trials=self.n_trials)
        
        # Store results
        self.best_params[model_type] = study.best_params
        self.best_scores[model_type] = study.best_value
        
        # Log to MLflow
        with mlflow.start_run(run_name=f"{model_type}_hyperparameter_tuning"):
            mlflow.log_params(study.best_params)
            mlflow.log_metric("best_score", study.best_value)
            mlflow.log_metric("n_trials", len(study.trials))
        
        results = {
            'best_params': study.best_params,
            'best_score': study.best_value,
            'n_trials': len(study.trials),
            'study': study
        }
        
        self.logger.info(f"Tuning completed for {model_type}. Best score: {study.best_value:.6f}")
        
        return results
    
    def create_objective_function(self, 
                                model_type: str,
                                X_train: np.ndarray,
                                y_train: np.ndarray,
                                X_val: np.ndarray,
                                y_val: np.ndarray):
        """Create objective function for specific model type"""
        
        if model_type == 'lstm':
            return self.create_lstm_objective(X_train, y_train, X_val, y_val)
        elif model_type == 'transformer':
            return self.create_transformer_objective(X_train, y_train, X_val, y_val)
        elif model_type == 'lightgbm':
            return self.create_lightgbm_objective(X_train, y_train, X_val, y_val)
        elif model_type == 'ensemble':
            return self.create_ensemble_objective(X_train, y_train, X_val, y_val)
        else:
            raise ValueError(f"Unknown model type: {model_type}")
    
    def create_lstm_objective(self, X_train, y_train, X_val, y_val):
        """Create objective function for LSTM tuning"""
        
        def objective(trial):
            # Hyperparameters to tune
            params = {
                'lstm_units': [
                    trial.suggest_int('lstm_unit_1', 32, 256),
                    trial.suggest_int('lstm_unit_2', 16, 128),
                    trial.suggest_int('lstm_unit_3', 8, 64)
                ],
                'dropout_rate': trial.suggest_float('dropout_rate', 0.1, 0.5),
                'learning_rate': trial.suggest_float('learning_rate', 1e-5, 1e-2, log=True),
                'batch_size': trial.suggest_categorical('batch_size', [16, 32, 64, 128]),
                'sequence_length': trial.suggest_int('sequence_length', 30, 120)
            }
            
            try:
                # Import model
                from ...models.price_prediction.lstm.model import LSTMPricePredictor
                
                # Create model
                n_features = X_train.shape[2] if X_train.ndim > 2 else X_train.shape[1]
                predictor = LSTMPricePredictor(
                    sequence_length=params['sequence_length'],
                    n_features=n_features,
                    lstm_units=params['lstm_units'],
                    dropout_rate=params['dropout_rate'],
                    learning_rate=params['learning_rate']
                )
                
                # Build model
                predictor.build_model()
                
                # Train with early stopping
                history = predictor.train(
                    X_train, y_train,
                    X_val, y_val,
                    epochs=50,  # Reduced for tuning
                    batch_size=params['batch_size']
                )
                
                # Get best validation score
                best_val_loss = min(history.history['val_loss'])
                
                return best_val_loss
                
            except Exception as e:
                self.logger.error(f"Error in LSTM objective: {e}")
                return float('inf')
        
        return objective
    
    def create_transformer_objective(self, X_train, y_train, X_val, y_val):
        """Create objective function for Transformer tuning"""
        
        def objective(trial):
            params = {
                'embed_dim': trial.suggest_categorical('embed_dim', [64, 128, 256, 512]),
                'num_heads': trial.suggest_categorical('num_heads', [4, 8, 16]),
                'num_layers': trial.suggest_int('num_layers', 2, 8),
                'ff_dim': trial.suggest_categorical('ff_dim', [128, 256, 512, 1024]),
                'dropout_rate': trial.suggest_float('dropout_rate', 0.1, 0.5),
                'learning_rate': trial.suggest_float('learning_rate', 1e-5, 1e-2, log=True),
                'batch_size': trial.suggest_categorical('batch_size', [16, 32, 64])
            }
            
            try:
                # Import model
                from ...models.price_prediction.transformer.model import TransformerPricePredictor
                
                # Create model
                n_features = X_train.shape[2] if X_train.ndim > 2 else X_train.shape[1]
                sequence_length = X_train.shape[1] if X_train.ndim > 2 else 60
                
                predictor = TransformerPricePredictor(
                    sequence_length=sequence_length,
                    n_features=n_features,
                    embed_dim=params['embed_dim'],
                    num_heads=params['num_heads'],
                    ff_dim=params['ff_dim'],
                    num_blocks=params['num_layers'],
                    dropout_rate=params['dropout_rate'],
                    learning_rate=params['learning_rate']
                )
                
                # Build and train model
                model = predictor.build_model()
                
                # Train with early stopping
                history = model.fit(
                    X_train, y_train,
                    validation_data=(X_val, y_val),
                    epochs=30,  # Reduced for tuning
                    batch_size=params['batch_size'],
                    callbacks=[
                        tf.keras.callbacks.EarlyStopping(
                            monitor='val_loss',
                            patience=5,
                            restore_best_weights=True
                        )
                    ],
                    verbose=0
                )
                
                best_val_loss = min(history.history['val_loss'])
                return best_val_loss
                
            except Exception as e:
                self.logger.error(f"Error in Transformer objective: {e}")
                return float('inf')
        
        return objective
    
    def create_lightgbm_objective(self, X_train, y_train, X_val, y_val):
        """Create objective function for LightGBM tuning"""
        
        def objective(trial):
            params = {
                'objective': 'regression',
                'metric': 'rmse',
                'boosting_type': 'gbdt',
                'num_leaves': trial.suggest_int('num_leaves', 10, 300),
                'learning_rate': trial.suggest_float('learning_rate', 0.01, 0.3),
                'feature_fraction': trial.suggest_float('feature_fraction', 0.4, 1.0),
                'bagging_fraction': trial.suggest_float('bagging_fraction', 0.4, 1.0),
                'bagging_freq': trial.suggest_int('bagging_freq', 1, 7),
                'min_child_samples': trial.suggest_int('min_child_samples', 5, 100),
                'lambda_l1': trial.suggest_float('lambda_l1', 1e-8, 10.0, log=True),
                'lambda_l2': trial.suggest_float('lambda_l2', 1e-8, 10.0, log=True),
                'verbosity': -1
            }
            
            try:
                import lightgbm as lgb
                
                # Prepare data
                if y_train.ndim > 1:
                    y_train_flat = y_train[:, 0]  # Use first horizon
                    y_val_flat = y_val[:, 0]
                else:
                    y_train_flat = y_train
                    y_val_flat = y_val
                
                # Flatten features if needed
                if X_train.ndim > 2:
                    X_train_flat = X_train.reshape(X_train.shape[0], -1)
                    X_val_flat = X_val.reshape(X_val.shape[0], -1)
                else:
                    X_train_flat = X_train
                    X_val_flat = X_val
                
                # Create datasets
                train_data = lgb.Dataset(X_train_flat, label=y_train_flat)
                val_data = lgb.Dataset(X_val_flat, label=y_val_flat, reference=train_data)
                
                # Train model
                model = lgb.train(
                    params,
                    train_data,
                    valid_sets=[val_data],
                    num_boost_round=1000,
                    callbacks=[
                        lgb.early_stopping(50),
                        lgb.log_evaluation(0)
                    ]
                )
                
                # Get best score
                best_score = model.best_score['valid_0']['rmse']
                return best_score
                
            except Exception as e:
                self.logger.error(f"Error in LightGBM objective: {e}")
                return float('inf')
        
        return objective
    
    def create_ensemble_objective(self, X_train, y_train, X_val, y_val):
        """Create objective function for ensemble tuning"""
        
        def objective(trial):
            params = {
                'combination_method': trial.suggest_categorical(
                    'combination_method', 
                    ['weighted_average', 'meta_learning']
                ),
                'weight_method': trial.suggest_categorical(
                    'weight_method',
                    ['performance_based', 'optimization_based', 'sharpe_based']
                )
            }
            
            try:
                # This is a simplified ensemble objective
                # In practice, you would train multiple base models first
                
                # For now, simulate ensemble performance
                from sklearn.ensemble import RandomForestRegressor
                from sklearn.linear_model import Ridge
                
                # Train simple base models
                rf = RandomForestRegressor(n_estimators=50, random_state=42)
                ridge = Ridge(alpha=1.0)
                
                # Flatten data if needed
                if X_train.ndim > 2:
                    X_train_flat = X_train.reshape(X_train.shape[0], -1)
                    X_val_flat = X_val.reshape(X_val.shape[0], -1)
                else:
                    X_train_flat = X_train
                    X_val_flat = X_val
                
                if y_train.ndim > 1:
                    y_train_flat = y_train[:, 0]
                    y_val_flat = y_val[:, 0]
                else:
                    y_train_flat = y_train
                    y_val_flat = y_val
                
                # Train base models
                rf.fit(X_train_flat, y_train_flat)
                ridge.fit(X_train_flat, y_train_flat)
                
                # Get predictions
                rf_pred = rf.predict(X_val_flat)
                ridge_pred = ridge.predict(X_val_flat)
                
                # Simple ensemble
                if params['combination_method'] == 'weighted_average':
                    weight1 = trial.suggest_float('rf_weight', 0.0, 1.0)
                    weight2 = 1 - weight1
                    ensemble_pred = weight1 * rf_pred + weight2 * ridge_pred
                else:
                    # Simple average for meta_learning case
                    ensemble_pred = (rf_pred + ridge_pred) / 2
                
                # Calculate error
                mse = mean_squared_error(y_val_flat, ensemble_pred)
                return mse
                
            except Exception as e:
                self.logger.error(f"Error in ensemble objective: {e}")
                return float('inf')
        
        return objective
    
    def tune_all_models(self, 
                       model_types: List[str],
                       X_train: np.ndarray,
                       y_train: np.ndarray,
                       X_val: np.ndarray,
                       y_val: np.ndarray) -> Dict[str, Dict]:
        """
        Tune hyperparameters for all specified model types
        
        Args:
            model_types: List of model types to tune
            X_train: Training features
            y_train: Training targets
            X_val: Validation features
            y_val: Validation targets
            
        Returns:
            Dictionary with results for all models
        """
        all_results = {}
        
        for model_type in model_types:
            self.logger.info(f"Tuning {model_type}...")
            try:
                results = self.tune_model(model_type, X_train, y_train, X_val, y_val)
                all_results[model_type] = results
            except Exception as e:
                self.logger.error(f"Failed to tune {model_type}: {e}")
                all_results[model_type] = {'error': str(e)}
        
        # Save all results
        self.save_tuning_results(all_results)
        
        return all_results
    
    def save_tuning_results(self, results: Dict[str, Dict], filepath: str = None):
        """
        Save tuning results to disk
        
        Args:
            results: Dictionary of tuning results
            filepath: Path to save results (optional)
        """
        if filepath is None:
            filepath = f'tuning_results_{datetime.now().strftime("%Y%m%d_%H%M")}.pkl'
        
        # Convert results to serializable format
        serializable_results = {}
        for model_type, result in results.items():
            if 'study' in result:
                # Remove study object as it's not easily serializable
                result = result.copy()
                del result['study']
            serializable_results[model_type] = result
        
        joblib.dump(serializable_results, filepath)
        self.logger.info(f"Tuning results saved to {filepath}")
    
    @classmethod
    def load_tuning_results(cls, filepath: str) -> Dict[str, Dict]:
        """
        Load tuning results from disk
        
        Args:
            filepath: Path to saved results
            
        Returns:
            Dictionary of tuning results
        """
        return joblib.load(filepath)

# Example configuration
DEFAULT_TUNING_CONFIG = {
    'n_trials': 100,  # Number of trials per model
    'cv_folds': 3,    # Number of cross-validation folds
    'direction': 'minimize',  # Optimization direction
    'pruning': True,  # Whether to use pruning
    'study_name': 'financial_ml_tuning',
    'storage_url': 'sqlite:///hyperparameter_tuning.db',
    'model_types': ['lstm', 'transformer', 'lightgbm', 'ensemble']
}
