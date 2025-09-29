# NexusTradeAI Model Monitoring Service

This service provides comprehensive monitoring for ML models in production, including data drift detection, performance monitoring, and alerting.

## Features

- **Data Drift Detection**: Monitor feature distributions and detect drift over time
- **Model Performance Monitoring**: Track model metrics and performance degradation
- **Alerting**: Get notified about issues via email, Slack, or webhooks
- **Scheduled Checks**: Run monitoring on a schedule
- **Retraining Integration**: Trigger model retraining when drift is detected

## Installation

1. Install the required dependencies:

```bash
pip install pandas numpy scikit-learn scipy mlflow requests python-dotenv
```

2. Set up your configuration in `config/monitoring_config.yaml`

## Quick Start

### 1. Initialize the Monitoring Service

```python
from monitoring.monitoring_service import ModelMonitoringService

# Initialize with default config
monitor = ModelMonitoringService()

# Or with a custom config path
# monitor = ModelMonitoringService("config/monitoring_config.yaml")
```

### 2. Set Reference Data

```python
import pandas as pd

# Load your reference data (training data or production baseline)
reference_data = pd.read_csv("data/reference_data.csv")

# Set the reference data
monitor.set_reference_data(
    reference_data=reference_data,
    target_col="target"  # Optional: specify target column for concept drift detection
)
```

### 3. Run Drift Detection

```python
# Load current data
current_data = pd.read_csv("data/current_data.csv")

# Check for drift
result = monitor.check_for_drift(
    current_data=current_data,
    target_col="target"  # Optional: if monitoring concept drift
)

print(f"Drift detected: {result['has_drift']}")
print(f"Drift score: {result['drift_score']:.2f}")
```

### 4. Run Scheduled Monitoring

```python
def load_current_data():
    """Function to load current data for monitoring."""
    # Implement your data loading logic here
    return pd.read_csv("data/current_data.csv")

# Run monitoring on a schedule (runs in a separate thread)
monitor.run_scheduled_check(load_current_data)
```

## Integration with ML Pipeline

### 1. Integration with Training Pipeline

Add this to your training script to update the reference data after model training:

```python
from monitoring.monitoring_service import ModelMonitoringService

def train_model():
    # Your existing training code
    model = ...
    X_train, X_test, y_train, y_test = ...
    
    # Create reference dataset
    reference_data = X_train.copy()
    reference_data['target'] = y_train  # If supervised
    
    # Initialize and update monitoring service
    monitor = ModelMonitoringService()
    monitor.set_reference_data(reference_data, target_col='target')
    
    return model
```

### 2. Integration with Inference Service

Add monitoring to your inference service:

```python
from monitoring.monitoring_service import ModelMonitoringService
import pandas as pd

class InferenceService:
    def __init__(self):
        self.model = ...  # Load your model
        self.monitor = ModelMonitoringService()
        
    def predict(self, features_df):
        """Make predictions with drift monitoring."""
        # Check for data drift
        drift_result = self.monitor.check_for_drift(features_df)
        
        if drift_result['has_drift']:
            # Log drift event
            self._handle_drift(drift_result)
        
        # Make predictions
        predictions = self.model.predict(features_df)
        return predictions
    
    def _handle_drift(self, drift_result):
        """Handle drift detection."""
        # Log drift event
        print(f"Warning: Data drift detected! Score: {drift_result['drift_score']:.2f}")
        
        # Trigger retraining if needed
        if drift_result['drift_score'] > 0.7:  # Threshold
            self._trigger_retraining()
    
    def _trigger_retraining(self):
        """Trigger model retraining."""
        # Implement your retraining logic here
        print("Triggering model retraining...")
        # train_model()
```

## Configuration

Edit `config/monitoring_config.yaml` to configure:

- Monitoring intervals
- Alert thresholds
- Notification channels (email, Slack, etc.)
- Drift detection methods
- Resource usage limits

## Alerting

Configure alerts in `monitoring_config.yaml`:

```yaml
alerts:
  email:
    enabled: true
    recipients:
      - "your-email@example.com"
    smtp_server: "smtp.example.com"
    smtp_port: 587
    
  slack:
    enabled: true
    webhook_url: "https://hooks.slack.com/services/..."
    
  webhook:
    enabled: true
    url: "https://your-webhook-url.com/alert"
    headers:
      Authorization: "Bearer your-token"
```

## Advanced Usage

### Custom Drift Detection

You can extend the `DataDriftDetector` class to implement custom drift detection methods:

```python
from monitoring.drift_detector import DataDriftDetector

class CustomDriftDetector(DataDriftDetector):
    def detect_custom_drift(self, reference_data, current_data):
        """Implement your custom drift detection logic."""
        # Your custom drift detection code here
        pass
```

### Monitoring Multiple Models

```python
# Initialize separate monitors for each model
monitor_lstm = ModelMonitoringService("config/lstm_monitoring_config.yaml")
monitor_xgboost = ModelMonitoringService("config/xgboost_monitoring_config.yaml")

# Set reference data for each
monitor_lstm.set_reference_data(lstm_reference_data)
monitor_xgboost.set_reference_data(xgboost_reference_data)

# Run monitoring for each model
monitor_lstm.run_scheduled_check(load_lstm_data)
monitor_xgboost.run_scheduled_check(load_xgboost_data)
```

## API Reference

### ModelMonitoringService

#### `__init__(config_path: str = None)`
Initialize the monitoring service.

#### `set_reference_data(reference_data: pd.DataFrame, target_col: str = None)`
Set the reference dataset for drift detection.

#### `check_for_drift(current_data: pd.DataFrame, target_col: str = None) -> Dict`
Check for drift in the current data compared to reference.

#### `run_scheduled_check(data_loader_func, *args, **kwargs)`
Run monitoring on a schedule using the provided data loader function.

## License

MIT
