import os
import yaml
from pathlib import Path
from pydantic import BaseSettings, Field
from typing import List, Dict, Any, Optional

def load_yaml_config(file_path: str) -> Dict[str, Any]:
    """Load YAML configuration file."""
    try:
        with open(file_path, 'r') as f:
            return yaml.safe_load(f) or {}
    except Exception as e:
        print(f"Error loading config file {file_path}: {e}")
        return {}

# Load monitoring config
MONITORING_CONFIG = load_yaml_config(
    Path(__file__).parent / "monitoring_config.yaml"
)

class ModelConfig(BaseSettings):
    """Model configuration."""
    name: str
    drift_threshold: float = 0.3
    accuracy_threshold: float = 0.7
    enabled: bool = True

class MonitoringConfig(BaseSettings):
    """Monitoring configuration."""
    update_interval: int = 300  # seconds
    retention_period: int = 86400  # 24 hours
    
    # Alert thresholds
    thresholds: Dict[str, float] = Field(
        default_factory=lambda: {
            'accuracy_drop': 0.1,
            'prediction_time': 1000,
            'drift_score': 0.3,
            'error_rate': 0.05
        }
    )
    
    # Model configurations
    models: Dict[str, ModelConfig] = {}
    
    # Alerting configuration
    alerts: Dict[str, Any] = {}
    
    # Drift detection
    drift_detection: Dict[str, Any] = {}
    
    class Config:
        extra = 'allow'

class Settings(BaseSettings):
    # Application settings
    APP_NAME: str = "Nexus Trade AI - ML Service"
    DEBUG: bool = os.getenv("DEBUG", "False").lower() in ("true", "1", "t")
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", 5000))
    WORKERS: int = int(os.getenv("WORKERS", 1))
    
    # Redis configuration
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Model configuration
    DEFAULT_SEQUENCE_LENGTH: int = 60
    DEFAULT_FEATURES: List[str] = ['close', 'volume', 'high', 'low']
    DEFAULT_SYMBOLS: List[str] = [
        'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'XRP/USDT', 'SOL/USDT',
        'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA'
    ]
    
    # Training configuration
    TRAINING_EPOCHS: int = 50
    BATCH_SIZE: int = 32
    VALIDATION_SPLIT: float = 0.2
    
    # API configuration
    API_PREFIX: str = "/api/v1"
    
    # Logging configuration
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", MONITORING_CONFIG.get('logging', {}).get('level', 'INFO'))
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    
    # Monitoring configuration
    MONITORING: MonitoringConfig = Field(
        default_factory=lambda: MonitoringConfig(
            **MONITORING_CONFIG.get('monitoring', {}),
            thresholds=MONITORING_CONFIG.get('thresholds', {}),
            models={
                name: ModelConfig(name=name, **config)
                for name, config in MONITORING_CONFIG.get('model_configs', {}).items()
            },
            alerts=MONITORING_CONFIG.get('alerts', {}),
            drift_detection=MONITORING_CONFIG.get('drift_detection', {})
        )
    )
    
    class Config:
        case_sensitive = True
        env_file = ".env"
        env_file_encoding = "utf-8"

# Create settings instance
settings = Settings()
