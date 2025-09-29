"""
Retraining Trigger for NexusTradeAI

This module implements an intelligent retraining trigger system that monitors
model performance and data drift to determine when models should be retrained.
"""

import logging
import json
import redis
import mlflow
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum

@dataclass
class TriggerCondition:
    """Configuration for a retraining trigger condition"""
    name: str
    condition_type: str  # 'performance', 'drift', 'time', 'data_volume', 'custom'
    threshold: float
    comparison: str  # 'greater', 'less', 'equal'
    window_hours: int = 24
    enabled: bool = True
    severity: str = 'medium'  # 'low', 'medium', 'high'

class RetrainingTrigger:
    """
    Intelligent retraining trigger system based on multiple conditions
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize retraining trigger system
        
        Args:
            config: Trigger configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Trigger conditions
        self.trigger_conditions = self._load_trigger_conditions(
            config.get('trigger_conditions', [])
        )
        
        # Model performance tracking
        self.performance_tracker = {}
        self.baseline_metrics = {}
        
        # Data monitoring
        self.data_quality_threshold = config.get('data_quality_threshold', 0.8)
        self.drift_threshold = config.get('drift_threshold', 0.1)
        
        # Time-based triggers
        self.max_model_age_days = config.get('max_model_age_days', 30)
        self.min_retrain_interval_hours = config.get('min_retrain_interval_hours', 24)
        
        # External integrations
        self.redis_client = None
        if 'redis' in config:
            self._init_redis_connection(config['redis'])
        
        # MLflow tracking
        self.mlflow_tracking_uri = config.get('mlflow_tracking_uri', 'http://localhost:5000')
        mlflow.set_tracking_uri(self.mlflow_tracking_uri)
        
        # Callback functions
        self.trigger_callbacks = []
        
        # Trigger history
        self.trigger_history = []
    
    def _init_redis_connection(self, redis_config: Dict[str, Any]):
        """Initialize Redis connection if configured"""
        try:
            self.redis_client = redis.Redis(
                host=redis_config['host'],
                port=redis_config.get('port', 6379),
                password=redis_config.get('password'),
                db=redis_config.get('db', 0),
                decode_responses=True
            )
            # Test connection
            self.redis_client.ping()
            self.logger.info("Successfully connected to Redis")
        except Exception as e:
            self.logger.warning(f"Failed to connect to Redis: {e}")
            self.redis_client = None
    
    def _load_trigger_conditions(self, conditions_config: List[Dict]) -> List[TriggerCondition]:
        """Load trigger conditions from configuration"""
        conditions = []
        
        for config in conditions_config:
            condition = TriggerCondition(
                name=config['name'],
                condition_type=config['type'],
                threshold=config['threshold'],
                comparison=config['comparison'],
                window_hours=config.get('window_hours', 24),
                enabled=config.get('enabled', True),
                severity=config.get('severity', 'medium')
            )
            conditions.append(condition)
        
        # Add default conditions if none specified
        if not conditions:
            conditions = self._get_default_conditions()
        
        return conditions
    
    def _get_default_conditions(self) -> List[TriggerCondition]:
        """Get default trigger conditions"""
        return [
            TriggerCondition(
                name='performance_degradation',
                condition_type='performance',
                threshold=0.05,  # 5% drop in accuracy
                comparison='greater',
                window_hours=24,
                severity='high'
            ),
            TriggerCondition(
                name='data_drift_detection',
                condition_type='drift',
                threshold=0.1,  # 10% drift threshold
                comparison='greater',
                window_hours=48,
                severity='high'
            ),
            TriggerCondition(
                name='model_age_limit',
                condition_type='time',
                threshold=30,  # 30 days
                comparison='greater',
                window_hours=24,
                severity='medium'
            ),
            TriggerCondition(
                name='data_volume_threshold',
                condition_type='data_volume',
                threshold=10000,  # 10k new samples
                comparison='greater',
                window_hours=168,  # 1 week
                severity='low'
            )
        ]
    
    def add_trigger_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """
        Add a callback function to be called when retraining is triggered
        
        Args:
            callback: Function that takes a dictionary with trigger details
        """
        self.trigger_callbacks.append(callback)
    
    def check_triggers(self, model_name: str) -> Dict[str, Any]:
        """
        Check all trigger conditions for a model
        
        Args:
            model_name: Name of the model to check
            
        Returns:
            Dictionary with trigger check results
        """
        self.logger.info(f"Checking retraining triggers for model: {model_name}")
        
        trigger_results = {
            'model_name': model_name,
            'timestamp': datetime.now().isoformat(),
            'should_retrain': False,
            'triggered_conditions': [],
            'condition_results': {}
        }
        
        # Check each condition
        for condition in self.trigger_conditions:
            if not condition.enabled:
                continue
            
            try:
                result = self.evaluate_condition(model_name, condition)
                trigger_results['condition_results'][condition.name] = result
                
                if result.get('triggered', False):
                    trigger_results['triggered_conditions'].append({
                        'name': condition.name,
                        'type': condition.condition_type,
                        'current_value': result.get('current_value'),
                        'threshold': condition.threshold,
                        'severity': condition.severity,
                        'details': result
                    })
                
            except Exception as e:
                self.logger.error(f"Error evaluating condition {condition.name}: {e}")
                trigger_results['condition_results'][condition.name] = {
                    'triggered': False,
                    'error': str(e)
                }
        
        # Determine if retraining should be triggered
        trigger_results['should_retrain'] = self._should_trigger_retraining(
            trigger_results['triggered_conditions']
        )
        
        # Store trigger result
        if trigger_results['should_retrain']:
            self.trigger_history.append(trigger_results)
            self._notify_retraining_triggered(trigger_results)
            self.logger.info(
                f"Retraining triggered for {model_name} with conditions: "
                f"{[c['name'] for c in trigger_results['triggered_conditions']]}"
            )
        
        return trigger_results
    
    def _should_trigger_retraining(self, triggered_conditions: List[Dict]) -> bool:
        """Determine if retraining should be triggered based on conditions"""
        if not triggered_conditions:
            return False
        
        # Check for high severity conditions
        high_severity_conditions = [
            c for c in triggered_conditions 
            if c.get('severity') == 'high'
        ]
        
        if high_severity_conditions:
            return True
        
        # Check for multiple medium severity conditions
        medium_severity_conditions = [
            c for c in triggered_conditions 
            if c.get('severity') == 'medium'
        ]
        
        if len(medium_severity_conditions) >= 2:
            return True
        
        # Check for critical condition types
        critical_types = ['performance', 'drift']
        critical_conditions = [
            c for c in triggered_conditions 
            if c['type'] in critical_types
        ]
        
        if critical_conditions:
            return True
        
        return False
    
    def _notify_retraining_triggered(self, trigger_results: Dict[str, Any]):
        """Notify all registered callbacks about retraining trigger"""
        for callback in self.trigger_callbacks:
            try:
                callback(trigger_results)
            except Exception as e:
                self.logger.error(f"Error in trigger callback: {e}")
    
    def evaluate_condition(self, model_name: str, condition: TriggerCondition) -> Dict[str, Any]:
        """Evaluate a specific trigger condition"""
        condition_type = condition.condition_type
        
        try:
            if condition_type == 'performance':
                return self._check_performance_condition(model_name, condition)
            
            elif condition_type == 'drift':
                return self._check_drift_condition(model_name, condition)
            
            elif condition_type == 'time':
                return self._check_time_condition(model_name, condition)
            
            elif condition_type == 'data_volume':
                return self._check_data_volume_condition(model_name, condition)
            
            elif condition_type == 'custom':
                return self._check_custom_condition(model_name, condition)
            
            else:
                return {
                    'triggered': False,
                    'error': f'Unknown condition type: {condition_type}'
                }
                
        except Exception as e:
            self.logger.error(f"Error evaluating {condition.name}: {e}", exc_info=True)
            return {
                'triggered': False,
                'error': str(e)
            }
    
    def _check_performance_condition(self, model_name: str, condition: TriggerCondition) -> Dict[str, Any]:
        """Check performance-based trigger condition"""
        try:
            # Get current performance metrics
            current_metrics = self._get_current_performance(model_name, condition.window_hours)
            
            # Get baseline performance
            baseline_metrics = self._get_baseline_performance(model_name)
            
            if not current_metrics or not baseline_metrics:
                return {
                    'triggered': False,
                    'current_value': None,
                    'baseline_value': None,
                    'reason': 'Insufficient performance data'
                }
            
            # Calculate performance degradation
            key_metric = 'directional_accuracy'  # Primary metric
            current_value = current_metrics.get(key_metric, 0)
            baseline_value = baseline_metrics.get(key_metric, 0)
            
            if baseline_value > 0:
                performance_drop = (baseline_value - current_value) / baseline_value
            else:
                performance_drop = 0
            
            # Check against threshold
            triggered = self._compare_values(performance_drop, condition.threshold, condition.comparison)
            
            return {
                'triggered': triggered,
                'current_value': current_value,
                'baseline_value': baseline_value,
                'performance_drop': performance_drop,
                'metric_used': key_metric,
                'condition_met': f"{performance_drop:.2f} {condition.comparison} {condition.threshold}"
            }
            
        except Exception as e:
            self.logger.error(f"Error checking performance condition: {e}")
            return {
                'triggered': False,
                'error': str(e)
            }
    
    def _check_drift_condition(self, model_name: str, condition: TriggerCondition) -> Dict[str, Any]:
        """Check data drift trigger condition"""
        try:
            # Get drift detection results
            drift_results = self._get_drift_results(model_name, condition.window_hours)
            
            if not drift_results:
                return {
                    'triggered': False,
                    'current_value': None,
                    'reason': 'No drift detection data available'
                }
            
            # Get maximum drift score across features
            drift_scores = drift_results.get('drift_scores', {})
            if not drift_scores:
                return {
                    'triggered': False,
                    'reason': 'No drift scores available'
                }
                
            max_drift_score = max(drift_scores.values())
            
            # Check against threshold
            triggered = self._compare_values(max_drift_score, condition.threshold, condition.comparison)
            
            # Get top drifting features
            top_drifting = sorted(
                [(k, v) for k, v in drift_scores.items()],
                key=lambda x: x[1],
                reverse=True
            )[:5]  # Top 5 features
            
            return {
                'triggered': triggered,
                'current_value': max_drift_score,
                'drift_rate': drift_results.get('drift_rate', 0),
                'affected_features': len(drift_results.get('features_with_drift', [])),
                'top_drifting_features': dict(top_drifting),
                'condition_met': f"{max_drift_score:.2f} {condition.comparison} {condition.threshold}"
            }
            
        except Exception as e:
            self.logger.error(f"Error checking drift condition: {e}")
            return {
                'triggered': False,
                'error': str(e)
            }
    
    def _check_time_condition(self, model_name: str, condition: TriggerCondition) -> Dict[str, Any]:
        """Check time-based trigger condition"""
        try:
            # Get model last training time
            last_training_time = self._get_last_training_time(model_name)
            
            if not last_training_time:
                return {
                    'triggered': True,
                    'current_value': None,
                    'reason': 'No previous training time found'
                }
            
            # Calculate age in days
            age_days = (datetime.now() - last_training_time).total_seconds() / (24 * 3600)
            
            # Check against threshold
            triggered = self._compare_values(age_days, condition.threshold, condition.comparison)
            
            return {
                'triggered': triggered,
                'current_value': age_days,
                'last_training_time': last_training_time.isoformat(),
                'condition_met': f"{age_days:.1f} days {condition.comparison} {condition.threshold} days"
            }
            
        except Exception as e:
            self.logger.error(f"Error checking time condition: {e}")
            return {
                'triggered': False,
                'error': str(e)
            }
    
    def _check_data_volume_condition(self, model_name: str, condition: TriggerCondition) -> Dict[str, Any]:
        """Check data volume trigger condition"""
        try:
            # Get new data volume since last training
            new_data_count = self._get_new_data_volume(model_name, condition.window_hours)
            
            # Check against threshold
            triggered = self._compare_values(new_data_count, condition.threshold, condition.comparison)
            
            return {
                'triggered': triggered,
                'current_value': new_data_count,
                'window_hours': condition.window_hours,
                'condition_met': f"{new_data_count} samples {condition.comparison} {condition.threshold} samples"
            }
            
        except Exception as e:
            self.logger.error(f"Error checking data volume condition: {e}")
            return {
                'triggered': False,
                'error': str(e)
            }
    
    def _check_custom_condition(self, model_name: str, condition: TriggerCondition) -> Dict[str, Any]:
        """Check custom trigger condition"""
        # This is a placeholder for custom condition logic
        # In a real implementation, this would be customized based on specific requirements
        
        return {
            'triggered': False,
            'current_value': None,
            'reason': 'Custom condition not implemented'
        }
    
    def _compare_values(self, current_value: float, threshold: float, comparison: str) -> bool:
        """Compare values based on comparison operator"""
        if comparison == 'greater':
            return current_value > threshold
        elif comparison == 'less':
            return current_value < threshold
        elif comparison == 'equal':
            return abs(current_value - threshold) < 1e-6
        elif comparison == 'greater_equal':
            return current_value >= threshold
        elif comparison == 'less_equal':
            return current_value <= threshold
        else:
            raise ValueError(f"Unknown comparison operator: {comparison}")
    
    # Data access methods
    
    def _get_current_performance(self, model_name: str, window_hours: int) -> Optional[Dict[str, float]]:
        """Get current model performance metrics"""
        try:
            if self.redis_client:
                # Try to get from Redis first
                key = f"model_performance:{model_name}"
                performance_data = self.redis_client.get(key)
                
                if performance_data:
                    return json.loads(performance_data)
            
            # Fallback to MLflow
            client = mlflow.tracking.MlflowClient()
            
            # Get recent runs for the model
            experiment = client.get_experiment_by_name(f"production_monitoring_{model_name}")
            if experiment:
                runs = client.search_runs(
                    experiment_ids=[experiment.experiment_id],
                    max_results=10,
                    order_by=["start_time DESC"]
                )
                
                if runs:
                    latest_run = runs[0]
                    return latest_run.data.metrics
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting current performance: {e}")
            return None
    
    def _get_baseline_performance(self, model_name: str) -> Optional[Dict[str, float]]:
        """Get baseline model performance metrics"""
        if model_name in self.baseline_metrics:
            return self.baseline_metrics[model_name]
        
        try:
            # Load baseline from MLflow
            client = mlflow.tracking.MlflowClient()
            
            # Look for baseline run
            experiment = client.get_experiment_by_name(f"baseline_{model_name}")
            if experiment:
                runs = client.search_runs(
                    experiment_ids=[experiment.experiment_id],
                    max_results=1,
                    order_by=["metrics.directional_accuracy DESC"]
                )
                
                if runs:
                    baseline_run = runs[0]
                    self.baseline_metrics[model_name] = baseline_run.data.metrics
                    return baseline_run.data.metrics
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting baseline performance: {e}")
            return None
    
    def _get_drift_results(self, model_name: str, window_hours: int) -> Optional[Dict[str, Any]]:
        """Get data drift detection results"""
        try:
            if self.redis_client:
                key = f"drift_results:{model_name}"
                drift_data = self.redis_client.get(key)
                
                if drift_data:
                    return json.loads(drift_data)
            
            # Fallback to MLflow or other storage
            # This would be implemented based on your specific monitoring setup
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting drift results: {e}")
            return None
    
    def _get_last_training_time(self, model_name: str) -> Optional[datetime]:
        """Get last training time for model"""
        try:
            client = mlflow.tracking.MlflowClient()
            
            # Get model from registry
            model_versions = client.search_model_versions(f"name='{model_name}'")
            
            if model_versions:
                # Get latest version
                latest_version = max(
                    model_versions, 
                    key=lambda v: v.creation_timestamp if v.creation_timestamp else 0
                )
                if latest_version.creation_timestamp:
                    return datetime.fromtimestamp(latest_version.creation_timestamp / 1000)
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting last training time: {e}")
            return None
    
    def _get_new_data_volume(self, model_name: str, window_hours: int) -> int:
        """Get volume of new data since window"""
        try:
            if self.redis_client:
                key = f"data_volume:{model_name}"
                volume_data = self.redis_client.get(key)
                
                if volume_data:
                    return int(volume_data)
            
            # Placeholder - would integrate with data pipeline
            return 0
            
        except Exception as e:
            self.logger.error(f"Error getting new data volume: {e}")
            return 0
    
    def get_trigger_history(self, model_name: str = None, limit: int = 100) -> List[Dict]:
        """
        Get history of retraining triggers
        
        Args:
            model_name: Filter by model name (optional)
            limit: Maximum number of results to return
            
        Returns:
            List of trigger events
        """
        history = self.trigger_history
        
        if model_name:
            history = [h for h in history if h.get('model_name') == model_name]
        
        return history[-limit:]
    
    def reset_trigger_history(self):
        """Clear the trigger history"""
        self.trigger_history = []
        self.logger.info("Cleared trigger history")
