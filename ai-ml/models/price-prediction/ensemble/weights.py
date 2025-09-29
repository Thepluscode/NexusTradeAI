import numpy as np
from typing import Dict, List, Tuple, Optional, Callable, Union
from dataclasses import dataclass
from enum import Enum, auto
import logging
from scipy.optimize import minimize
from scipy.stats import entropy


class WeightingStrategy(Enum):
    """Available weighting strategies for ensemble models"""
    EQUAL_WEIGHTS = auto()
    PERFORMANCE_BASED = auto()
    UNCERTAINTY_WEIGHTED = auto()
    CORRELATION_WEIGHTED = auto()
    DYNAMIC_WEIGHTING = auto()
    BAYESIAN_AVERAGING = auto()


@dataclass
class ModelMetrics:
    """Data class to store model performance metrics"""
    mse: float = 0.0
    mae: float = 0.0
    r2: float = 0.0
    sharpe_ratio: float = 0.0
    max_drawdown: float = 0.0
    win_rate: float = 0.0
    profit_factor: float = 0.0
    uncertainty: float = 0.0


class ModelWeights:
    """
    Advanced model weighting system for ensemble predictions with multiple weighting strategies
    and performance tracking.
    """
    
    def __init__(self, 
                 model_names: List[str],
                 strategy: WeightingStrategy = WeightingStrategy.PERFORMANCE_BASED,
                 config: Optional[dict] = None):
        """
        Initialize the model weights calculator.
        
        Args:
            model_names: List of model identifiers
            strategy: Weighting strategy to use
            config: Additional configuration parameters
        """
        self.model_names = model_names
        self.strategy = strategy
        self.config = config or {}
        self.logger = logging.getLogger(__name__)
        
        # Initialize weights (equal by default)
        self.weights = {name: 1.0/len(model_names) for name in model_names}
        self.metrics = {name: ModelMetrics() for name in model_names}
        
        # Track weight history for dynamic strategies
        self.weight_history = []
        self._update_weight_history()
    
    def calculate_weights(self, 
                         predictions: Dict[str, np.ndarray],
                         targets: np.ndarray,
                         uncertainties: Optional[Dict[str, np.ndarray]] = None) -> Dict[str, float]:
        """
        Calculate model weights based on the selected strategy.
        
        Args:
            predictions: Dictionary of model predictions {model_name: predictions}
            targets: Ground truth target values
            uncertainties: Optional dictionary of uncertainty estimates per model
            
        Returns:
            Dictionary of model weights
        """
        if self.strategy == WeightingStrategy.EQUAL_WEIGHTS:
            return self._equal_weights()
        elif self.strategy == WeightingStrategy.PERFORMANCE_BASED:
            return self._performance_based_weights(predictions, targets)
        elif self.strategy == WeightingStrategy.UNCERTAINTY_WEIGHTED:
            if uncertainties is None:
                self.logger.warning("Uncertainty estimates not provided, falling back to performance-based weighting")
                return self._performance_based_weights(predictions, targets)
            return self._uncertainty_weighted_weights(predictions, targets, uncertainties)
        elif self.strategy == WeightingStrategy.CORRELATION_WEIGHTED:
            return self._correlation_weighted_weights(predictions, targets)
        elif self.strategy == WeightingStrategy.DYNAMIC_WEIGHTING:
            return self._dynamic_weighting(predictions, targets)
        elif self.strategy == WeightingStrategy.BAYESIAN_AVERAGING:
            return self._bayesian_averaging(predictions, targets)
        else:
            raise ValueError(f"Unsupported weighting strategy: {self.strategy}")
    
    def update_metrics(self, 
                      model_name: str, 
                      predictions: np.ndarray, 
                      targets: np.ndarray,
                      uncertainties: Optional[np.ndarray] = None):
        """
        Update performance metrics for a specific model.
        
        Args:
            model_name: Name of the model
            predictions: Model predictions
            targets: Ground truth values
            uncertainties: Optional uncertainty estimates for the predictions
        """
        if model_name not in self.metrics:
            self.metrics[model_name] = ModelMetrics()
        
        # Calculate basic metrics
        errors = predictions - targets
        self.metrics[model_name].mse = np.mean(errors ** 2)
        self.metrics[model_name].mae = np.mean(np.abs(errors))
        
        # Calculate R-squared
        ss_total = np.sum((targets - np.mean(targets)) ** 2)
        ss_residual = np.sum(errors ** 2)
        self.metrics[model_name].r2 = 1 - (ss_residual / (ss_total + 1e-10))
        
        # Calculate financial metrics (simplified)
        returns = np.diff(predictions) / predictions[:-1]
        if len(returns) > 1:
            self.metrics[model_name].sharpe_ratio = np.mean(returns) / (np.std(returns) + 1e-10)
            
            # Calculate max drawdown
            cum_returns = np.cumprod(1 + returns)
            peak = np.maximum.accumulate(cum_returns)
            drawdown = (peak - cum_returns) / (peak + 1e-10)
            self.metrics[model_name].max_drawdown = np.max(drawdown)
            
            # Calculate win rate and profit factor
            positive_returns = returns[returns > 0]
            negative_returns = returns[returns < 0]
            
            if len(returns) > 0:
                self.metrics[model_name].win_rate = len(positive_returns) / len(returns)
            
            if len(negative_returns) > 0:
                self.metrics[model_name].profit_factor = abs(np.sum(positive_returns) / np.sum(negative_returns))
        
        # Store uncertainty if provided
        if uncertainties is not None:
            self.metrics[model_name].uncertainty = np.mean(uncertainties)
    
    def _equal_weights(self) -> Dict[str, float]:
        """Equal weighting strategy"""
        n_models = len(self.model_names)
        return {name: 1.0/n_models for name in self.model_names}
    
    def _performance_based_weights(self, 
                                 predictions: Dict[str, np.ndarray],
                                 targets: np.ndarray) -> Dict[str, float]:
        """Performance-based weighting using validation metrics"""
        # Calculate MSE for each model
        mse_values = {}
        for name, pred in predictions.items():
            # Update metrics if not already done
            if self.metrics[name].mse == 0:
                self.update_metrics(name, pred, targets)
            mse_values[name] = self.metrics[name].mse
        
        # Convert MSE to weights (lower MSE = higher weight)
        min_mse = min(mse_values.values())
        if min_mse <= 0:
            # Handle case where MSE is zero (perfect prediction)
            perfect_models = [name for name, mse in mse_values.items() if mse == min_mse]
            weights = {name: 1.0/len(perfect_models) if name in perfect_models else 0.0 
                      for name in self.model_names}
        else:
            # Use inverse MSE weighting with smoothing
            inv_mse = {name: 1.0 / (mse + 1e-8) for name, mse in mse_values.items()}
            total = sum(inv_mse.values())
            weights = {name: w/total for name, w in inv_mse.items()}
        
        return weights
    
    def _uncertainty_weighted_weights(self,
                                    predictions: Dict[str, np.ndarray],
                                    targets: np.ndarray,
                                    uncertainties: Dict[str, np.ndarray]) -> Dict[str, float]:
        """Weight models based on their prediction uncertainty"""
        # Calculate uncertainty weights
        avg_uncertainties = {}
        for name in self.model_names:
            if name in uncertainties:
                avg_uncertainties[name] = np.mean(uncertainties[name])
            else:
                self.logger.warning(f"No uncertainty provided for model {name}, using performance-based weights")
                return self._performance_based_weights(predictions, targets)
        
        # Convert uncertainties to weights (lower uncertainty = higher weight)
        inv_uncertainty = {name: 1.0 / (u + 1e-8) for name, u in avg_uncertainties.items()}
        total = sum(inv_uncertainty.values())
        
        return {name: w/total for name, w in inv_uncertainty.items()}
    
    def _correlation_weighted_weights(self,
                                    predictions: Dict[str, np.ndarray],
                                    targets: np.ndarray) -> Dict[str, float]:
        """Weight models based on prediction diversity and correlation"""
        # Calculate pairwise correlations between models
        pred_arrays = np.column_stack(list(predictions.values()))
        corr_matrix = np.corrcoef(pred_arrays, rowvar=False)
        
        # Calculate average correlation for each model
        avg_correlations = {}
        for i, name in enumerate(predictions.keys()):
            # Exclude self-correlation
            other_indices = [j for j in range(len(predictions)) if j != i]
            avg_correlations[name] = np.mean(corr_matrix[i, other_indices])
        
        # Convert to weights (lower average correlation = higher weight)
        inv_corr = {name: 1.0 / (c + 1e-8) for name, c in avg_correlations.items()}
        total = sum(inv_corr.values())
        
        return {name: w/total for name, w in inv_corr.items()}
    
    def _dynamic_weighting(self,
                          predictions: Dict[str, np.ndarray],
                          targets: np.ndarray) -> Dict[str, float]:
        """Dynamic weighting based on recent performance and trend"""
        # Get recent performance (last N predictions)
        lookback = self.config.get('lookback', 100)
        recent_weights = []
        
        # Calculate multiple weighting schemes
        schemes = [
            self._performance_based_weights(predictions, targets),
            self._correlation_weighted_weights(predictions, targets)
        ]
        
        # Combine schemes with equal weight (can be made adaptive)
        combined_weights = {name: 0.0 for name in self.model_names}
        for scheme in schemes:
            for name, weight in scheme.items():
                combined_weights[name] += weight / len(schemes)
        
        # Apply momentum factor (if configured)
        momentum_factor = self.config.get('momentum_factor', 0.9)
        if self.weight_history and len(self.weight_history) > 1:
            prev_weights = self.weight_history[-1]
            for name in self.model_names:
                combined_weights[name] = (
                    momentum_factor * prev_weights.get(name, 0) +
                    (1 - momentum_factor) * combined_weights[name]
                )
        
        # Store current weights in history
        self._update_weight_history(combined_weights)
        
        return combined_weights
    
    def _bayesian_averaging(self,
                          predictions: Dict[str, np.ndarray],
                          targets: np.ndarray) -> Dict[str, float]:
        """Bayesian model averaging based on model evidence"""
        # Calculate model evidence (approximated by log likelihood)
        log_evidences = {}
        
        for name, pred in predictions.items():
            # Calculate residuals
            residuals = pred - targets
            
            # Estimate noise variance
            noise_var = np.var(residuals) + 1e-8
            
            # Calculate log evidence (Gaussian likelihood)
            n = len(residuals)
            log_likelihood = -0.5 * n * np.log(2 * np.pi * noise_var)
            log_likelihood -= 0.5 * np.sum(residuals**2) / noise_var
            
            # Simple uninformative prior (can be enhanced)
            log_prior = -np.log(len(predictions))
            
            log_evidences[name] = log_likelihood + log_prior
        
        # Convert to probabilities using softmax
        max_log_evidence = max(log_evidences.values())
        exp_evidence = {name: np.exp(le - max_log_evidence) 
                       for name, le in log_evidences.items()}
        total = sum(exp_evidence.values())
        
        return {name: ev/total for name, ev in exp_evidence.items()}
    
    def _update_weight_history(self, current_weights: Optional[Dict[str, float]] = None):
        """Update the weight history with current weights"""
        if current_weights is None:
            current_weights = self.weights
        
        # Keep only the most recent N weights if history limit is set
        max_history = self.config.get('max_weight_history', 1000)
        if len(self.weight_history) >= max_history:
            self.weight_history.pop(0)
        
        self.weight_history.append(current_weights.copy())
    
    def get_metrics(self) -> Dict[str, Dict[str, float]]:
        """Get current performance metrics for all models"""
        return {name: vars(metrics) for name, metrics in self.metrics.items()}
    
    def save_weights(self, filepath: str):
        """Save current weights and metrics to disk"""
        import json
        
        data = {
            'weights': self.weights,
            'metrics': {name: vars(m) for name, m in self.metrics.items()},
            'strategy': self.strategy.name,
            'config': self.config
        }
        
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)
    
    @classmethod
    def load_weights(cls, filepath: str, model_names: List[str]):
        """Load weights and metrics from disk"""
        import json
        
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        strategy = WeightingStrategy[data['strategy']]
        instance = cls(model_names, strategy, data.get('config', {}))
        
        # Restore weights and metrics
        instance.weights = data['weights']
        for name, metrics in data['metrics'].items():
            if name in instance.metrics:
                for k, v in metrics.items():
                    setattr(instance.metrics[name], k, v)
        
        return instance