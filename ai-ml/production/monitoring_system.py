"""
Production Monitoring and Alerting System
==========================================
Comprehensive monitoring for ML models in production.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Real-time performance monitoring
- Model drift detection
- Prediction distribution tracking
- Latency monitoring
- Error tracking and alerting
- Custom metrics and dashboards
- Alert escalation
- Incident management
"""

import time
import threading
from collections import deque, defaultdict
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta
from enum import Enum
import numpy as np
import pandas as pd
import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class AlertSeverity(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class MetricType(Enum):
    """Types of metrics to monitor"""
    ACCURACY = "accuracy"
    LATENCY = "latency"
    ERROR_RATE = "error_rate"
    PREDICTION_DISTRIBUTION = "prediction_distribution"
    FEATURE_DRIFT = "feature_drift"
    THROUGHPUT = "throughput"


@dataclass
class Alert:
    """Alert notification"""

    timestamp: datetime
    severity: AlertSeverity
    metric_type: MetricType
    message: str
    value: float
    threshold: float
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp.isoformat(),
            'severity': self.severity.value,
            'metric_type': self.metric_type.value,
            'message': self.message,
            'value': self.value,
            'threshold': self.threshold,
            'metadata': self.metadata
        }


@dataclass
class MonitoringConfig:
    """Configuration for monitoring system"""

    # Performance thresholds
    min_accuracy: float = 0.55
    max_latency_ms: float = 200.0
    max_error_rate: float = 0.05  # 5%

    # Drift detection
    enable_drift_detection: bool = True
    drift_threshold_std: float = 2.0  # Standard deviations

    # Alert configuration
    alert_cooldown_minutes: int = 15  # Min time between same alerts
    escalation_threshold: int = 3  # Escalate after N alerts

    # Monitoring windows
    short_window_minutes: int = 15
    medium_window_hours: int = 1
    long_window_hours: int = 24

    # Data retention
    max_history_hours: int = 168  # 7 days

    # Notification channels
    enable_logging: bool = True
    enable_email: bool = False
    enable_slack: bool = False
    enable_pagerduty: bool = False


class MetricCollector:
    """
    Collects and aggregates metrics over time
    """

    def __init__(self, max_size: int = 10000):
        """
        Initialize metric collector

        Args:
            max_size: Maximum number of data points to keep
        """
        self.metrics: Dict[str, deque] = defaultdict(lambda: deque(maxlen=max_size))
        self.timestamps: Dict[str, deque] = defaultdict(lambda: deque(maxlen=max_size))

    def record(self, metric_name: str, value: float, timestamp: Optional[datetime] = None):
        """
        Record a metric value

        Args:
            metric_name: Name of metric
            value: Metric value
            timestamp: Optional timestamp (default: now)
        """
        if timestamp is None:
            timestamp = datetime.now()

        self.metrics[metric_name].append(value)
        self.timestamps[metric_name].append(timestamp)

    def get_recent(
        self,
        metric_name: str,
        window_minutes: int = 15
    ) -> List[float]:
        """
        Get recent metric values within time window

        Args:
            metric_name: Name of metric
            window_minutes: Time window in minutes

        Returns:
            List of recent values
        """
        if metric_name not in self.metrics:
            return []

        cutoff_time = datetime.now() - timedelta(minutes=window_minutes)

        recent_values = []
        for value, timestamp in zip(self.metrics[metric_name], self.timestamps[metric_name]):
            if timestamp >= cutoff_time:
                recent_values.append(value)

        return recent_values

    def get_statistics(
        self,
        metric_name: str,
        window_minutes: int = 15
    ) -> Dict[str, float]:
        """
        Get statistics for a metric

        Args:
            metric_name: Name of metric
            window_minutes: Time window

        Returns:
            Dictionary with statistics
        """
        values = self.get_recent(metric_name, window_minutes)

        if not values:
            return {
                'count': 0,
                'mean': 0.0,
                'std': 0.0,
                'min': 0.0,
                'max': 0.0,
                'p50': 0.0,
                'p95': 0.0,
                'p99': 0.0
            }

        return {
            'count': len(values),
            'mean': float(np.mean(values)),
            'std': float(np.std(values)),
            'min': float(np.min(values)),
            'max': float(np.max(values)),
            'p50': float(np.percentile(values, 50)),
            'p95': float(np.percentile(values, 95)),
            'p99': float(np.percentile(values, 99))
        }


class AlertManager:
    """
    Manages alerts and notifications
    """

    def __init__(self, config: MonitoringConfig):
        """Initialize alert manager"""
        self.config = config
        self.alerts: List[Alert] = []
        self.last_alert_time: Dict[str, datetime] = {}
        self.alert_counts: Dict[str, int] = defaultdict(int)

    def should_send_alert(self, alert_key: str) -> bool:
        """
        Check if alert should be sent (respects cooldown)

        Args:
            alert_key: Unique key for alert type

        Returns:
            True if alert should be sent
        """
        if alert_key not in self.last_alert_time:
            return True

        time_since_last = datetime.now() - self.last_alert_time[alert_key]
        cooldown = timedelta(minutes=self.config.alert_cooldown_minutes)

        return time_since_last >= cooldown

    def send_alert(self, alert: Alert):
        """
        Send alert through configured channels

        Args:
            alert: Alert to send
        """
        alert_key = f"{alert.metric_type.value}_{alert.severity.value}"

        if not self.should_send_alert(alert_key):
            logger.debug(f"Alert {alert_key} in cooldown, skipping")
            return

        # Record alert
        self.alerts.append(alert)
        self.last_alert_time[alert_key] = alert.timestamp
        self.alert_counts[alert_key] += 1

        # Check for escalation
        if self.alert_counts[alert_key] >= self.config.escalation_threshold:
            alert.severity = AlertSeverity.CRITICAL
            logger.critical(f"Alert {alert_key} escalated to CRITICAL")

        # Send through channels
        if self.config.enable_logging:
            self._log_alert(alert)

        if self.config.enable_email:
            self._send_email_alert(alert)

        if self.config.enable_slack:
            self._send_slack_alert(alert)

        if self.config.enable_pagerduty:
            self._send_pagerduty_alert(alert)

    def _log_alert(self, alert: Alert):
        """Log alert"""
        log_level = {
            AlertSeverity.INFO: logging.INFO,
            AlertSeverity.WARNING: logging.WARNING,
            AlertSeverity.CRITICAL: logging.CRITICAL
        }[alert.severity]

        logger.log(log_level, f"[{alert.severity.value.upper()}] {alert.message}")

    def _send_email_alert(self, alert: Alert):
        """Send email alert"""
        # TODO: Implement email sending
        logger.debug(f"Would send email alert: {alert.message}")

    def _send_slack_alert(self, alert: Alert):
        """Send Slack alert"""
        # TODO: Implement Slack webhook
        logger.debug(f"Would send Slack alert: {alert.message}")

    def _send_pagerduty_alert(self, alert: Alert):
        """Send PagerDuty alert"""
        # TODO: Implement PagerDuty API
        logger.debug(f"Would send PagerDuty alert: {alert.message}")

    def get_recent_alerts(
        self,
        severity: Optional[AlertSeverity] = None,
        hours: int = 24
    ) -> List[Alert]:
        """
        Get recent alerts

        Args:
            severity: Filter by severity (optional)
            hours: Look back hours

        Returns:
            List of recent alerts
        """
        cutoff_time = datetime.now() - timedelta(hours=hours)

        filtered = [
            alert for alert in self.alerts
            if alert.timestamp >= cutoff_time and
            (severity is None or alert.severity == severity)
        ]

        return sorted(filtered, key=lambda a: a.timestamp, reverse=True)


class ModelMonitor:
    """
    Comprehensive model monitoring system

    Tracks:
    - Prediction accuracy
    - Inference latency
    - Error rates
    - Prediction distribution
    - Feature drift
    - System health
    """

    def __init__(self, config: Optional[MonitoringConfig] = None):
        """Initialize model monitor"""
        self.config = config or MonitoringConfig()

        self.metric_collector = MetricCollector()
        self.alert_manager = AlertManager(self.config)

        # Reference distributions for drift detection
        self.reference_predictions: Optional[np.ndarray] = None
        self.reference_features: Optional[pd.DataFrame] = None

        # Monitoring state
        self.start_time = datetime.now()
        self.total_predictions = 0
        self.total_errors = 0

        # Background monitoring thread
        self.monitoring_thread: Optional[threading.Thread] = None
        self.stop_monitoring = threading.Event()

        logger.info("Initialized Model Monitoring System")

    def set_reference_data(
        self,
        predictions: np.ndarray,
        features: pd.DataFrame
    ):
        """
        Set reference data for drift detection

        Args:
            predictions: Reference predictions
            features: Reference features
        """
        self.reference_predictions = predictions
        self.reference_features = features

        logger.info(f"Set reference data: {len(predictions)} predictions, {features.shape[1]} features")

    def record_prediction(
        self,
        prediction: int,
        confidence: float,
        latency_ms: float,
        features: Optional[Dict[str, float]] = None,
        actual: Optional[int] = None
    ):
        """
        Record a single prediction and associated metrics

        Args:
            prediction: Model prediction
            confidence: Prediction confidence
            latency_ms: Inference latency in milliseconds
            features: Input features (optional)
            actual: Actual outcome (optional, for accuracy tracking)
        """
        self.total_predictions += 1

        # Record metrics
        self.metric_collector.record('prediction', prediction)
        self.metric_collector.record('confidence', confidence)
        self.metric_collector.record('latency_ms', latency_ms)

        # Check latency threshold
        if latency_ms > self.config.max_latency_ms:
            alert = Alert(
                timestamp=datetime.now(),
                severity=AlertSeverity.WARNING,
                metric_type=MetricType.LATENCY,
                message=f"High latency detected: {latency_ms:.2f}ms (threshold: {self.config.max_latency_ms}ms)",
                value=latency_ms,
                threshold=self.config.max_latency_ms
            )
            self.alert_manager.send_alert(alert)

        # Record accuracy if actual provided
        if actual is not None:
            correct = (prediction == actual)
            self.metric_collector.record('correct', 1.0 if correct else 0.0)

    def record_error(self, error_type: str, error_message: str):
        """
        Record an error

        Args:
            error_type: Type of error
            error_message: Error message
        """
        self.total_errors += 1
        self.metric_collector.record('error', 1.0)

        # Check error rate
        error_rate = self.get_error_rate(window_minutes=15)
        if error_rate > self.config.max_error_rate:
            alert = Alert(
                timestamp=datetime.now(),
                severity=AlertSeverity.CRITICAL,
                metric_type=MetricType.ERROR_RATE,
                message=f"High error rate: {error_rate:.2%} (threshold: {self.config.max_error_rate:.2%})",
                value=error_rate,
                threshold=self.config.max_error_rate,
                metadata={'error_type': error_type, 'error_message': error_message}
            )
            self.alert_manager.send_alert(alert)

    def get_accuracy(self, window_minutes: int = 15) -> float:
        """
        Get recent accuracy

        Args:
            window_minutes: Time window

        Returns:
            Accuracy (0-1)
        """
        correct_values = self.metric_collector.get_recent('correct', window_minutes)

        if not correct_values:
            return 0.0

        return sum(correct_values) / len(correct_values)

    def get_error_rate(self, window_minutes: int = 15) -> float:
        """
        Get recent error rate

        Args:
            window_minutes: Time window

        Returns:
            Error rate (0-1)
        """
        errors = len(self.metric_collector.get_recent('error', window_minutes))
        total = len(self.metric_collector.get_recent('prediction', window_minutes))

        if total == 0:
            return 0.0

        return errors / total

    def get_latency_stats(self, window_minutes: int = 15) -> Dict[str, float]:
        """
        Get latency statistics

        Args:
            window_minutes: Time window

        Returns:
            Dictionary with latency statistics
        """
        return self.metric_collector.get_statistics('latency_ms', window_minutes)

    def check_prediction_drift(self) -> Tuple[bool, float]:
        """
        Check if prediction distribution has drifted

        Returns:
            (has_drifted, drift_score)
        """
        if self.reference_predictions is None:
            return False, 0.0

        # Get recent predictions
        recent_preds = self.metric_collector.get_recent('prediction', window_minutes=60)

        if len(recent_preds) < 100:
            return False, 0.0

        # Calculate distribution difference
        ref_dist = np.bincount(self.reference_predictions + 1, minlength=3) / len(self.reference_predictions)
        recent_dist = np.bincount([int(p) + 1 for p in recent_preds], minlength=3) / len(recent_preds)

        # KL divergence
        drift_score = float(np.sum(ref_dist * np.log((ref_dist + 1e-10) / (recent_dist + 1e-10))))

        has_drifted = drift_score > 0.1  # Threshold

        if has_drifted:
            alert = Alert(
                timestamp=datetime.now(),
                severity=AlertSeverity.WARNING,
                metric_type=MetricType.PREDICTION_DISTRIBUTION,
                message=f"Prediction distribution drift detected: score={drift_score:.4f}",
                value=drift_score,
                threshold=0.1
            )
            self.alert_manager.send_alert(alert)

        return has_drifted, drift_score

    def check_performance_degradation(self):
        """Check if model performance has degraded"""
        accuracy = self.get_accuracy(window_minutes=60)

        if accuracy > 0 and accuracy < self.config.min_accuracy:
            alert = Alert(
                timestamp=datetime.now(),
                severity=AlertSeverity.CRITICAL,
                metric_type=MetricType.ACCURACY,
                message=f"Model accuracy degraded: {accuracy:.2%} (threshold: {self.config.min_accuracy:.2%})",
                value=accuracy,
                threshold=self.config.min_accuracy
            )
            self.alert_manager.send_alert(alert)

    def get_dashboard_data(self) -> Dict[str, Any]:
        """
        Get data for monitoring dashboard

        Returns:
            Dictionary with dashboard metrics
        """
        uptime_seconds = (datetime.now() - self.start_time).total_seconds()

        return {
            'system': {
                'uptime_hours': uptime_seconds / 3600,
                'total_predictions': self.total_predictions,
                'total_errors': self.total_errors,
                'predictions_per_minute': self.total_predictions / (uptime_seconds / 60) if uptime_seconds > 0 else 0
            },
            'performance': {
                'accuracy_15min': self.get_accuracy(15),
                'accuracy_1hour': self.get_accuracy(60),
                'accuracy_24hour': self.get_accuracy(1440),
                'error_rate_15min': self.get_error_rate(15)
            },
            'latency': {
                '15min': self.get_latency_stats(15),
                '1hour': self.get_latency_stats(60),
                '24hour': self.get_latency_stats(1440)
            },
            'alerts': {
                'total_24hour': len(self.alert_manager.get_recent_alerts(hours=24)),
                'critical_24hour': len(self.alert_manager.get_recent_alerts(severity=AlertSeverity.CRITICAL, hours=24)),
                'recent_10': [a.to_dict() for a in self.alert_manager.get_recent_alerts(hours=24)[:10]]
            }
        }

    def start_background_monitoring(self, check_interval_seconds: int = 60):
        """
        Start background monitoring thread

        Args:
            check_interval_seconds: How often to run checks
        """
        if self.monitoring_thread is not None:
            logger.warning("Background monitoring already running")
            return

        def monitoring_loop():
            logger.info("Started background monitoring")

            while not self.stop_monitoring.is_set():
                try:
                    # Run periodic checks
                    self.check_performance_degradation()
                    self.check_prediction_drift()

                    time.sleep(check_interval_seconds)

                except Exception as e:
                    logger.error(f"Error in monitoring loop: {e}")

            logger.info("Stopped background monitoring")

        self.stop_monitoring.clear()
        self.monitoring_thread = threading.Thread(target=monitoring_loop, daemon=True)
        self.monitoring_thread.start()

        logger.info(f"Background monitoring started (interval: {check_interval_seconds}s)")

    def stop_background_monitoring(self):
        """Stop background monitoring thread"""
        if self.monitoring_thread is None:
            return

        self.stop_monitoring.set()
        self.monitoring_thread.join(timeout=5)
        self.monitoring_thread = None

        logger.info("Background monitoring stopped")

    def save_state(self, filepath: str):
        """Save monitoring state to file"""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        state = {
            'start_time': self.start_time.isoformat(),
            'total_predictions': self.total_predictions,
            'total_errors': self.total_errors,
            'dashboard_data': self.get_dashboard_data(),
            'recent_alerts': [a.to_dict() for a in self.alert_manager.get_recent_alerts(hours=24)]
        }

        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2)

        logger.info(f"Monitoring state saved to {filepath}")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Create monitor
    config = MonitoringConfig(
        min_accuracy=0.55,
        max_latency_ms=200.0,
        max_error_rate=0.05,
        alert_cooldown_minutes=15
    )

    monitor = ModelMonitor(config)

    # Start background monitoring
    monitor.start_background_monitoring(check_interval_seconds=60)

    # Simulate predictions
    print("Simulating predictions...")
    for i in range(100):
        # Simulate prediction
        prediction = np.random.choice([-1, 0, 1])
        confidence = np.random.uniform(0.4, 0.9)
        latency = np.random.uniform(50, 150)
        actual = np.random.choice([-1, 0, 1])

        monitor.record_prediction(
            prediction=prediction,
            confidence=confidence,
            latency_ms=latency,
            actual=actual
        )

        time.sleep(0.1)

    # Get dashboard data
    dashboard = monitor.get_dashboard_data()
    print("\n=== Dashboard Data ===")
    print(json.dumps(dashboard, indent=2))

    # Save state
    monitor.save_state('ai-ml/production/monitoring_state.json')

    # Stop monitoring
    monitor.stop_background_monitoring()

    print("\n✅ Monitoring system test complete!")
