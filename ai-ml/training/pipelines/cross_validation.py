"""
Cross-validation pipeline for model evaluation and selection.
"""

from typing import Dict, List, Tuple, Any, Optional, Union
import numpy as np
import pandas as pd
from sklearn.model_selection import (
    TimeSeriesSplit, 
    cross_validate,
    cross_val_predict
)
from sklearn.metrics import (
    mean_squared_error,
    mean_absolute_error,
    accuracy_score,
    precision_recall_fscore_support,
    make_scorer
)
import mlflow
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class CrossValidationPipeline:
    """
    A pipeline for performing time-series cross-validation on trading models.
    """
    
    def __init__(
        self,
        model: Any,
        n_splits: int = 5,
        test_size: Optional[float] = 0.2,
        gap: int = 0,
        metrics: Optional[Dict[str, callable]] = None,
        log_to_mlflow: bool = True,
        experiment_name: str = "cross_validation"
    ):
        """
        Initialize the cross-validation pipeline.
        
        Args:
            model: The model to evaluate
            n_splits: Number of splits for time series cross-validation
            test_size: Fraction of the data to use for testing
            gap: Number of samples to exclude from the end of each training set
            metrics: Dictionary of metric names and scoring functions
            log_to_mlflow: Whether to log results to MLflow
            experiment_name: Name of the MLflow experiment
        """
        self.model = model
        self.n_splits = n_splits
        self.test_size = test_size
        self.gap = gap
        self.log_to_mlflow = log_to_mlflow
        self.experiment_name = experiment_name
        
        # Default metrics if none provided
        if metrics is None:
            self.metrics = {
                'mse': mean_squared_error,
                'mae': mean_absolute_error,
                'accuracy': accuracy_score
            }
        else:
            self.metrics = metrics
        
        # Create time series cross-validator
        self.cv = TimeSeriesSplit(
            n_splits=n_splits,
            test_size=test_size,
            gap=gap
        )
        
        # Initialize MLflow if logging is enabled
        if self.log_to_mlflow:
            self._setup_mlflow()
    
    def _setup_mlflow(self):
        """Set up MLflow experiment."""
        try:
            mlflow.set_experiment(self.experiment_name)
            self.run_name = f"cv_run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            self.run = mlflow.start_run(run_name=self.run_name)
            
            # Log parameters
            mlflow.log_params({
                'cv_n_splits': self.n_splits,
                'test_size': self.test_size,
                'gap': self.gap,
                'model_type': type(self.model).__name__
            })
            
        except Exception as e:
            logger.warning(f"Failed to initialize MLflow: {e}")
            self.log_to_mlflow = False
    
    def _calculate_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        split_idx: int
    ) -> Dict[str, float]:
        """
        Calculate all metrics for the given predictions.
        
        Args:
            y_true: True target values
            y_pred: Predicted values
            split_idx: Index of the current split
            
        Returns:
            Dictionary of metric names and values
        """
        results = {}
        
        for metric_name, metric_func in self.metrics.items():
            try:
                if metric_name in ['precision', 'recall', 'f1']:
                    precision, recall, f1, _ = precision_recall_fscore_support(
                        y_true, y_pred, average='weighted', zero_division=0
                    )
                    results.update({
                        'precision': precision,
                        'recall': recall,
                        'f1': f1
                    })
                else:
                    score = metric_func(y_true, y_pred)
                    results[metric_name] = score
                
                # Log to MLflow if enabled
                if self.log_to_mlflow:
                    mlflow.log_metric(f"{metric_name}_split_{split_idx}", results[metric_name])
                    
            except Exception as e:
                logger.warning(f"Failed to calculate metric {metric_name}: {e}")
        
        return results
    
    def run_cv(
        self,
        X: Union[pd.DataFrame, np.ndarray],
        y: Union[pd.Series, np.ndarray],
        groups: Optional[np.ndarray] = None,
        return_predictions: bool = False,
        return_models: bool = False
    ) -> Dict[str, Any]:
        """
        Run cross-validation on the given data.
        
        Args:
            X: Feature matrix
            y: Target vector
            groups: Group labels for the samples
            return_predictions: Whether to return predictions for each fold
            return_models: Whether to return trained models for each fold
            
        Returns:
            Dictionary containing cross-validation results
        """
        results = {
            'scores': {name: [] for name in self.metrics.keys()},
            'predictions': [] if return_predictions else None,
            'models': [] if return_models else None,
            'split_indices': []
        }
        
        # Convert to numpy arrays if pandas objects are provided
        if isinstance(X, (pd.DataFrame, pd.Series)):
            X = X.values
        if isinstance(y, (pd.DataFrame, pd.Series)):
            y = y.values
        
        for split_idx, (train_idx, test_idx) in enumerate(self.cv.split(X, y, groups)):
            logger.info(f"Processing split {split_idx + 1}/{self.n_splits}")
            
            # Store split indices
            results['split_indices'].append((train_idx, test_idx))
            
            # Split data
            X_train, X_test = X[train_idx], X[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]
            
            try:
                # Train model
                self.model.fit(X_train, y_train)
                
                # Make predictions
                y_pred = self.model.predict(X_test)
                
                # Calculate metrics
                metrics = self._calculate_metrics(y_test, y_pred, split_idx)
                
                # Store results
                for metric_name, score in metrics.items():
                    results['scores'][metric_name].append(score)
                
                if return_predictions:
                    results['predictions'].append({
                        'y_true': y_test,
                        'y_pred': y_pred,
                        'indices': test_idx
                    })
                
                if return_models:
                    results['models'].append(self.model)
                
                logger.info(f"Split {split_idx + 1} completed with metrics: {metrics}")
                
            except Exception as e:
                logger.error(f"Error processing split {split_idx + 1}: {e}")
                # Log error but continue with next split
                continue
        
        # Calculate mean and std of scores
        results['summary'] = {
            metric_name: {
                'mean': np.nanmean(scores),
                'std': np.nanstd(scores),
                'min': np.nanmin(scores),
                'max': np.nanmax(scores)
            }
            for metric_name, scores in results['scores'].items()
        }
        
        # Log summary to MLflow
        if self.log_to_mlflow:
            try:
                for metric_name, stats in results['summary'].items():
                    mlflow.log_metrics({
                        f"{metric_name}_mean": stats['mean'],
                        f"{metric_name}_std": stats['std']
                    })
                
                # Log artifacts if available
                if hasattr(self.model, 'feature_importances_'):
                    import matplotlib.pyplot as plt
                    
                    plt.figure(figsize=(10, 6))
                    plt.bar(range(len(self.model.feature_importances_)), self.model.feature_importances_)
                    plt.title("Feature Importances")
                    plt.xlabel("Feature Index")
                    plt.ylabel("Importance")
                    
                    # Save and log the plot
                    plot_path = "feature_importances.png"
                    plt.savefig(plot_path)
                    mlflow.log_artifact(plot_path)
                    plt.close()
                
                mlflow.end_run()
                
            except Exception as e:
                logger.warning(f"Failed to log to MLflow: {e}")
        
        return results
    
    def grid_search_cv(
        self,
        X: Union[pd.DataFrame, np.ndarray],
        y: Union[pd.Series, np.ndarray],
        param_grid: Dict[str, List[Any]],
        scoring: Optional[Union[str, callable, List, Dict]] = None,
        refit: bool = True,
        n_jobs: int = -1,
        verbose: int = 1
    ) -> Dict[str, Any]:
        """
        Perform grid search with cross-validation.
        
        Args:
            X: Feature matrix
            y: Target vector
            param_grid: Dictionary with parameters names as keys and lists of
                       parameter settings to try as values
            scoring: Strategy to evaluate the performance of the cross-validated model on the test set
            refit: Whether to fit an estimator using the best found parameters on the whole dataset
            n_jobs: Number of jobs to run in parallel
            verbose: Controls the verbosity
            
        Returns:
            Dictionary containing the results of the grid search
        """
        from sklearn.model_selection import GridSearchCV
        
        if scoring is None:
            scoring = {
                'mse': 'neg_mean_squared_error',
                'mae': 'neg_mean_absolute_error',
                'r2': 'r2'
            }
        
        grid_search = GridSearchCV(
            estimator=self.model,
            param_grid=param_grid,
            scoring=scoring,
            refit=refit,
            cv=self.cv,
            n_jobs=n_jobs,
            verbose=verbose,
            return_train_score=True
        )
        
        # Run grid search
        grid_search.fit(X, y)
        
        # Log results to MLflow
        if self.log_to_mlflow:
            try:
                # Log parameters and metrics
                mlflow.log_params(grid_search.best_params_)
                
                if hasattr(grid_search, 'cv_results_'):
                    for i, params in enumerate(grid_search.cv_results_['params']):
                        with mlflow.start_run(run_name=f"grid_search_{i}", nested=True):
                            mlflow.log_params(params)
                            for metric_name in scoring.keys():
                                if f'mean_test_{metric_name}' in grid_search.cv_results_:
                                    mlflow.log_metric(
                                        f"best_{metric_name}",
                                        grid_search.cv_results_[f'mean_test_{metric_name}'][i]
                                    )
                
                mlflow.sklearn.log_model(grid_search.best_estimator_, "model")
                
            except Exception as e:
                logger.warning(f"Failed to log grid search results to MLflow: {e}")
        
        return {
            'best_estimator': grid_search.best_estimator_,
            'best_params': grid_search.best_params_,
            'best_score': grid_search.best_score_,
            'cv_results': grid_search.cv_results_ if hasattr(grid_search, 'cv_results_') else None
        }


def nested_cross_validation(
    model,
    X: Union[pd.DataFrame, np.ndarray],
    y: Union[pd.Series, np.ndarray],
    param_grid: Dict[str, List[Any]],
    outer_cv: int = 5,
    inner_cv: int = 3,
    scoring: Optional[Union[str, callable, List, Dict]] = None,
    n_jobs: int = -1,
    verbose: int = 1
) -> Dict[str, Any]:
    """
    Perform nested cross-validation for model evaluation.
    
    Args:
        model: The model to evaluate
        X: Feature matrix
        y: Target vector
        param_grid: Dictionary with parameters names as keys and lists of
                   parameter settings to try as values
        outer_cv: Number of outer cross-validation folds
        inner_cv: Number of inner cross-validation folds
        scoring: Strategy to evaluate the performance of the cross-validated model
        n_jobs: Number of jobs to run in parallel
        verbose: Controls the verbosity
        
    Returns:
        Dictionary containing the results of the nested cross-validation
    """
    from sklearn.model_selection import cross_val_score, KFold
    from sklearn.base import clone
    
    if scoring is None:
        scoring = 'neg_mean_squared_error'
    
    # Initialize outer CV
    outer_cv = KFold(n_splits=outer_cv, shuffle=True, random_state=42)
    
    results = {
        'test_scores': [],
        'best_params': [],
        'models': []
    }
    
    for i, (train_idx, test_idx) in enumerate(outer_cv.split(X, y)):
        X_train, X_test = X[train_idx], X[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]
        
        # Create and run inner CV for hyperparameter tuning
        cv_pipeline = CrossValidationPipeline(
            model=clone(model),
            n_splits=inner_cv,
            log_to_mlflow=False
        )
        
        grid_result = cv_pipeline.grid_search_cv(
            X=X_train,
            y=y_train,
            param_grid=param_grid,
            scoring=scoring,
            n_jobs=n_jobs,
            verbose=verbose
        )
        
        # Get the best model from inner CV
        best_model = grid_result['best_estimator']
        
        # Evaluate on the test set
        score = best_model.score(X_test, y_test)
        
        # Store results
        results['test_scores'].append(score)
        results['best_params'].append(grid_result['best_params'])
        results['models'].append(best_model)
        
        if verbose > 0:
            print(f"Outer CV Fold {i+1}/{outer_cv.get_n_splits()}")
            print(f"  Best params: {grid_result['best_params']}")
            print(f"  Test score: {score:.4f}")
    
    # Calculate final metrics
    results['mean_test_score'] = np.mean(results['test_scores'])
    results['std_test_score'] = np.std(results['test_scores'])
    
    return results
