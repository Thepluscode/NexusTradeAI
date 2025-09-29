import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Any, Optional
import logging
from dataclasses import dataclass
from enum import Enum, auto
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import RandomForestRegressor
import joblib


class WeightingStrategy(Enum):
    """Available weighting strategies for ensemble combination"""
    EQUAL_WEIGHTS = auto()
    PERFORMANCE_BASED = auto()
    OPTIMIZATION_BASED = auto()
    SHARPE_BASED = auto()
    VOLATILITY_ADJUSTED = auto()
    TIME_DECAY = auto()


@dataclass
class ModelPerformance:
    """Data class to track model performance metrics"""
    mse: float = 0.0
    mae: float = 0.0
    directional_accuracy: float = 0.0
    sharpe_ratio: float = 0.0
    volatility: float = 0.0


class EnsembleCombiner:
    """
    Advanced ensemble combiner for financial prediction models with multiple weighting strategies
    and performance tracking.
    """
    
    def __init__(self, 
                 models: Dict[str, Any],
                 strategy: WeightingStrategy = WeightingStrategy.PERFORMANCE_BASED,
                 config: Optional[Dict[str, Any]] = None):
        """
        Initialize the ensemble combiner.
        
        Args:
            models: Dictionary of trained models {model_name: model}
            strategy: Weighting strategy to use
            config: Additional configuration parameters
        """
        self.models = models
        self.strategy = strategy
        self.config = config or {}
        self.logger = logging.getLogger(__name__)
        
        # Initialize weights (equal by default)
        self.weights = {name: 1.0/len(models) for name in models.keys()}
        self.performance = {name: ModelPerformance() for name in models.keys()}
        
        # Initialize meta-learner if using optimization-based strategy
        self.meta_learner = None
        if strategy == WeightingStrategy.OPTIMIZATION_BASED:
            meta_model_type = self.config.get('meta_model', 'ridge')
            if meta_model_type == 'ridge':
                self.meta_learner = Ridge(alpha=1.0)
            elif meta_model_type == 'random_forest':
                self.meta_learner = RandomForestRegressor(n_estimators=100, random_state=42)
            else:
                self.meta_learner = LinearRegression()
    
    def calculate_weights(self, 
                         X_val: np.ndarray, 
                         y_val: np.ndarray,
                         **kwargs) -> Dict[str, float]:
        """
        Calculate model weights based on the selected strategy.
        
        Args:
            X_val: Validation features
            y_val: Validation targets
            **kwargs: Additional arguments specific to each strategy
            
        Returns:
            Dictionary of model weights
        """
        if self.strategy == WeightingStrategy.EQUAL_WEIGHTS:
            return self._equal_weights()
        elif self.strategy == WeightingStrategy.PERFORMANCE_BASED:
            return self._performance_based_weights(X_val, y_val, **kwargs)
        elif self.strategy == WeightingStrategy.OPTIMIZATION_BASED:
            return self._optimization_based_weights(X_val, y_val, **kwargs)
        elif self.strategy == WeightingStrategy.SHARPE_BASED:
            return self._sharpe_based_weights(X_val, y_val, **kwargs)
        elif self.strategy == WeightingStrategy.VOLATILITY_ADJUSTED:
            return self._volatility_adjusted_weights(X_val, y_val, **kwargs)
        elif self.strategy == WeightingStrategy.TIME_DECAY:
            return self._time_decay_weights(X_val, y_val, **kwargs)
        else:
            raise ValueError(f"Unsupported weighting strategy: {self.strategy}")
    
    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Make ensemble predictions using the current weights.
        
        Args:
            X: Input features
            
        Returns:
            Ensemble predictions
        """
        predictions = []
        
        for name, model in self.models.items():
            try:
                pred = model.predict(X)
                if pred.ndim == 1:
                    pred = pred.reshape(-1, 1)
                predictions.append(pred * self.weights[name])
            except Exception as e:
                self.logger.error(f"Error predicting with model {name}: {e}")
        
        if not predictions:
            raise ValueError("No valid predictions from any model")
            
        return np.sum(predictions, axis=0)
    
    def _equal_weights(self) -> Dict[str, float]:
        """Equal weighting strategy"""
        n_models = len(self.models)
        return {name: 1.0/n_models for name in self.models.keys()}
    
    def _performance_based_weights(self, 
                                 X_val: np.ndarray, 
                                 y_val: np.ndarray,
                                 metric: str = 'mse') -> Dict[str, float]:
        """Performance-based weighting using validation metrics"""
        errors = {}
        
        for name, model in self.models.items():
            try:
                pred = model.predict(X_val)
                if metric == 'mse':
                    errors[name] = np.mean((pred - y_val) ** 2)
                elif metric == 'mae':
                    errors[name] = np.mean(np.abs(pred - y_val))
                else:
                    raise ValueError(f"Unsupported metric: {metric}")
            except Exception as e:
                self.logger.error(f"Error evaluating model {name}: {e}")
                errors[name] = np.inf
        
        # Convert errors to weights (lower error = higher weight)
        inv_errors = {name: 1.0 / (err + 1e-8) for name, err in errors.items()}
        total_inv_error = sum(inv_errors.values())
        
        return {name: err/total_inv_error for name, err in inv_errors.items()}
    
    def _optimization_based_weights(self, 
                                  X_val: np.ndarray, 
                                  y_val: np.ndarray) -> Dict[str, float]:
        """Learn optimal weights using a meta-learner"""
        # Get predictions from all models
        preds = []
        valid_models = []
        
        for name, model in self.models.items():
            try:
                pred = model.predict(X_val)
                if pred.ndim == 1:
                    pred = pred.reshape(-1, 1)
                preds.append(pred)
                valid_models.append(name)
            except Exception as e:
                self.logger.error(f"Error getting predictions from {name}: {e}")
        
        if not preds:
            raise ValueError("No valid predictions for optimization")
        
        # Stack predictions as features for meta-learner
        X_meta = np.hstack(preds)
        
        # Train meta-learner
        self.meta_learner.fit(X_meta, y_val)
        
        # Get feature importances as weights
        if hasattr(self.meta_learner, 'coef_'):
            importances = np.abs(self.meta_learner.coef_)
        elif hasattr(self.meta_learner, 'feature_importances_'):
            importances = self.meta_learner.feature_importances_
        else:
            importances = np.ones(len(valid_models))
        
        # Normalize importances
        importances = np.maximum(importances, 0)  # Ensure non-negative
        if np.sum(importances) > 0:
            importances = importances / np.sum(importances)
        else:
            importances = np.ones_like(importances) / len(importances)
        
        return dict(zip(valid_models, importances))
    
    def _sharpe_based_weights(self, 
                            X_val: np.ndarray, 
                            y_val: np.ndarray,
                            risk_free_rate: float = 0.0) -> Dict[str, float]:
        """Weight models based on their Sharpe ratio"""
        sharpe_ratios = {}
        
        for name, model in self.models.items():
            try:
                pred = model.predict(X_val)
                returns = pred - y_val  # Prediction errors as returns
                
                # Calculate Sharpe ratio
                excess_returns = returns - risk_free_rate
                sharpe = np.mean(excess_returns) / (np.std(excess_returns) + 1e-8)
                sharpe_ratios[name] = sharpe
            except Exception as e:
                self.logger.error(f"Error calculating Sharpe ratio for {name}: {e}")
                sharpe_ratios[name] = -np.inf
        
        # Convert Sharpe ratios to weights (higher Sharpe = higher weight)
        max_sharpe = max(sharpe_ratios.values())
        if max_sharpe <= 0:
            return self._equal_weights()
            
        # Apply softmax to positive Sharpe ratios
        exp_sharpe = {name: np.exp((sharpe - max_sharpe) * 10) 
                      for name, sharpe in sharpe_ratios.items()}
        total = sum(exp_sharpe.values())
        
        return {name: s/total for name, s in exp_sharpe.items()}
    
    def _volatility_adjusted_weights(self, 
                                   X_val: np.ndarray, 
                                   y_val: np.ndarray) -> Dict[str, float]:
        """Adjust weights based on prediction volatility"""
        volatilities = {}
        
        for name, model in self.models.items():
            try:
                pred = model.predict(X_val)
                # Calculate rolling volatility of prediction errors
                errors = pred - y_val
                if len(errors) > 1:
                    vol = np.std(errors)
                else:
                    vol = 1.0  # Default if not enough data
                volatilities[name] = vol
            except Exception as e:
                self.logger.error(f"Error calculating volatility for {name}: {e}")
                volatilities[name] = np.inf
        
        # Convert volatilities to weights (lower vol = higher weight)
        inv_vol = {name: 1.0 / (vol + 1e-8) for name, vol in volatilities.items()}
        total = sum(inv_vol.values())
        
        return {name: v/total for name, v in inv_vol.items()}
    
    def _time_decay_weights(self, 
                          X_val: np.ndarray, 
                          y_val: np.ndarray,
                          decay_factor: float = 0.95) -> Dict[str, float]:
        """Apply time decay to model weights based on recent performance"""
        # First get performance-based weights
        perf_weights = self._performance_based_weights(X_val, y_val)
        
        # Apply time decay to previous weights
        decayed_weights = {}
        total = 0.0
        
        for name in self.models.keys():
            prev_weight = self.weights.get(name, 1.0/len(self.models))
            new_weight = decay_factor * prev_weight + (1 - decay_factor) * perf_weights.get(name, 0)
            decayed_weights[name] = new_weight
            total += new_weight
        
        # Normalize
        return {name: w/total for name, w in decayed_weights.items()}
    
    def save(self, filepath: str):
        """Save ensemble combiner state to disk"""
        state = {
            'weights': self.weights,
            'strategy': self.strategy.name,
            'config': self.config,
            'performance': {name: vars(perf) for name, perf in self.performance.items()}
        }
        
        if self.meta_learner is not None:
            import tempfile
            import os
            
            # Save meta-learner to a temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.joblib') as f:
                joblib.dump(self.meta_learner, f)
                meta_learner_path = f.name
            
            try:
                # Read the bytes and store in state
                with open(meta_learner_path, 'rb') as f:
                    state['meta_learner'] = f.read()
            finally:
                # Clean up temporary file
                try:
                    os.unlink(meta_learner_path)
                except Exception as e:
                    self.logger.warning(f"Error cleaning up temporary file: {e}")
        
        joblib.dump(state, filepath)
    
    @classmethod
    def load(cls, filepath: str, models: Dict[str, Any]) -> 'EnsembleCombiner':
        """Load ensemble combiner from disk"""
        state = joblib.load(filepath)
        
        # Create new instance
        strategy = WeightingStrategy[state['strategy']]
        combiner = cls(models, strategy, state.get('config', {}))
        
        # Restore state
        combiner.weights = state['weights']
        
        # Restore performance metrics
        combiner.performance = {
            name: ModelPerformance(**perf) 
            for name, perf in state.get('performance', {}).items()
        }
        
        # Restore meta-learner if present
        if 'meta_learner' in state:
            import tempfile
            import os
            
            # Write meta-learner to a temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.joblib') as f:
                f.write(state['meta_learner'])
                meta_learner_path = f.name
            
            try:
                # Load meta-learner from the temporary file
                combiner.meta_learner = joblib.load(meta_learner_path)
            finally:
                # Clean up temporary file
                try:
                    os.unlink(meta_learner_path)
                except Exception as e:
                    logging.warning(f"Error cleaning up temporary file: {e}")
        
        return combiner