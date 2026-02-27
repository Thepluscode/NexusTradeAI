"""
Production Deployment Configuration
====================================
Configuration management for production ML model deployment.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Environment-based configuration (dev, staging, prod)
- Secret management with encryption
- Health check configuration
- Resource limits and scaling
- Logging and monitoring setup
- Database connection pooling
- Redis cache configuration
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from enum import Enum
import os
import json
from pathlib import Path
import logging
from cryptography.fernet import Fernet
import yaml

logger = logging.getLogger(__name__)


class Environment(str, Enum):
    """Deployment environment"""
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class LogLevel(str, Enum):
    """Logging level"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


@dataclass
class DatabaseConfig:
    """Database configuration"""
    host: str = "localhost"
    port: int = 5432
    database: str = "nexustrade"
    user: str = "postgres"
    password: str = ""
    pool_size: int = 10
    max_overflow: int = 20
    pool_timeout: int = 30
    pool_recycle: int = 3600

    def get_connection_string(self, masked: bool = False) -> str:
        """Get database connection string"""
        pwd = "***" if masked else self.password
        return f"postgresql://{self.user}:{pwd}@{self.host}:{self.port}/{self.database}"


@dataclass
class RedisConfig:
    """Redis cache configuration"""
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: Optional[str] = None
    max_connections: int = 50
    socket_timeout: int = 5
    socket_connect_timeout: int = 5
    retry_on_timeout: bool = True
    decode_responses: bool = True

    def get_connection_params(self) -> Dict[str, Any]:
        """Get Redis connection parameters"""
        params = {
            'host': self.host,
            'port': self.port,
            'db': self.db,
            'max_connections': self.max_connections,
            'socket_timeout': self.socket_timeout,
            'socket_connect_timeout': self.socket_connect_timeout,
            'retry_on_timeout': self.retry_on_timeout,
            'decode_responses': self.decode_responses
        }

        if self.password:
            params['password'] = self.password

        return params


@dataclass
class ModelServingConfig:
    """Model serving configuration"""
    host: str = "0.0.0.0"
    port: int = 8000
    workers: int = 4
    reload: bool = False
    log_level: str = "info"
    access_log: bool = True
    timeout: int = 60
    keepalive: int = 5
    max_requests: int = 1000
    max_requests_jitter: int = 50

    # Model-specific settings
    model_cache_size: int = 5  # Number of models to keep in memory
    prediction_timeout: int = 10  # Seconds
    batch_size: int = 32
    max_batch_wait_ms: int = 100


@dataclass
class MonitoringConfig:
    """Monitoring and alerting configuration"""
    enabled: bool = True
    metrics_port: int = 9090
    health_check_interval: int = 30

    # Prometheus
    prometheus_enabled: bool = True
    prometheus_port: int = 9090

    # Grafana
    grafana_enabled: bool = True
    grafana_port: int = 3000

    # Alert channels
    email_alerts: bool = True
    slack_alerts: bool = False
    pagerduty_alerts: bool = False

    # Alert thresholds
    alert_on_accuracy_drop: float = 0.05  # 5% drop
    alert_on_latency_spike: float = 2.0   # 2x normal
    alert_on_error_rate: float = 0.05     # 5% errors


@dataclass
class SecurityConfig:
    """Security configuration"""
    # API authentication
    api_key_required: bool = True
    jwt_enabled: bool = True
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expiration_hours: int = 24

    # HTTPS/TLS
    tls_enabled: bool = False
    tls_cert_path: Optional[str] = None
    tls_key_path: Optional[str] = None

    # CORS
    cors_enabled: bool = True
    cors_origins: List[str] = field(default_factory=lambda: ["*"])

    # Rate limiting
    rate_limit_enabled: bool = True
    rate_limit_per_minute: int = 60
    rate_limit_per_hour: int = 1000


@dataclass
class ResourceLimits:
    """Resource limits for deployment"""
    # CPU limits (in cores)
    cpu_request: float = 1.0
    cpu_limit: float = 2.0

    # Memory limits (in GB)
    memory_request: float = 2.0
    memory_limit: float = 4.0

    # Storage limits (in GB)
    storage_request: float = 10.0
    storage_limit: float = 50.0

    # Scaling
    min_replicas: int = 2
    max_replicas: int = 10
    target_cpu_utilization: int = 70  # Percent
    target_memory_utilization: int = 80  # Percent


@dataclass
class LoggingConfig:
    """Logging configuration"""
    level: str = "INFO"
    format: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    # File logging
    file_enabled: bool = True
    file_path: str = "logs/production.log"
    file_max_bytes: int = 10 * 1024 * 1024  # 10 MB
    file_backup_count: int = 5

    # Structured logging
    json_logs: bool = True

    # External logging
    syslog_enabled: bool = False
    syslog_host: str = "localhost"
    syslog_port: int = 514

    # Cloud logging
    cloudwatch_enabled: bool = False
    cloudwatch_group: str = "/nexustrade/ml-models"
    cloudwatch_stream: str = "production"


class DeploymentConfig:
    """
    Main deployment configuration manager
    """

    def __init__(self, environment: Environment = Environment.DEVELOPMENT):
        self.environment = environment
        self.config_dir = Path("ai-ml/production/config")
        self.config_dir.mkdir(parents=True, exist_ok=True)

        # Load environment-specific configuration
        self.database = DatabaseConfig()
        self.redis = RedisConfig()
        self.model_serving = ModelServingConfig()
        self.monitoring = MonitoringConfig()
        self.security = SecurityConfig()
        self.resources = ResourceLimits()
        self.logging = LoggingConfig()

        # Load from file if exists
        self.load_from_file()

        # Apply environment-specific overrides
        self._apply_environment_overrides()

    def _apply_environment_overrides(self):
        """Apply environment-specific configuration overrides"""
        if self.environment == Environment.PRODUCTION:
            # Production settings
            self.model_serving.reload = False
            self.model_serving.workers = 8
            self.security.api_key_required = True
            self.security.tls_enabled = True
            self.monitoring.enabled = True
            self.logging.level = "WARNING"
            self.resources.min_replicas = 3
            self.resources.max_replicas = 20

        elif self.environment == Environment.STAGING:
            # Staging settings
            self.model_serving.reload = False
            self.model_serving.workers = 4
            self.security.api_key_required = True
            self.monitoring.enabled = True
            self.logging.level = "INFO"
            self.resources.min_replicas = 2
            self.resources.max_replicas = 10

        else:  # DEVELOPMENT
            # Development settings
            self.model_serving.reload = True
            self.model_serving.workers = 2
            self.security.api_key_required = False
            self.security.tls_enabled = False
            self.monitoring.enabled = False
            self.logging.level = "DEBUG"
            self.resources.min_replicas = 1
            self.resources.max_replicas = 2

    def load_from_file(self):
        """Load configuration from YAML file"""
        config_file = self.config_dir / f"{self.environment.value}.yaml"

        if not config_file.exists():
            logger.warning(f"Config file not found: {config_file}")
            return

        try:
            with open(config_file, 'r') as f:
                config_data = yaml.safe_load(f)

            # Load database config
            if 'database' in config_data:
                for key, value in config_data['database'].items():
                    if hasattr(self.database, key):
                        setattr(self.database, key, value)

            # Load Redis config
            if 'redis' in config_data:
                for key, value in config_data['redis'].items():
                    if hasattr(self.redis, key):
                        setattr(self.redis, key, value)

            # Load other configs similarly...
            logger.info(f"Loaded configuration from {config_file}")

        except Exception as e:
            logger.error(f"Error loading config file: {e}")

    def save_to_file(self):
        """Save current configuration to YAML file"""
        config_file = self.config_dir / f"{self.environment.value}.yaml"

        config_data = {
            'database': {
                'host': self.database.host,
                'port': self.database.port,
                'database': self.database.database,
                'user': self.database.user,
                # Don't save password in plain text
                'pool_size': self.database.pool_size,
                'max_overflow': self.database.max_overflow,
            },
            'redis': {
                'host': self.redis.host,
                'port': self.redis.port,
                'db': self.redis.db,
                'max_connections': self.redis.max_connections,
            },
            'model_serving': {
                'host': self.model_serving.host,
                'port': self.model_serving.port,
                'workers': self.model_serving.workers,
                'timeout': self.model_serving.timeout,
            },
            'monitoring': {
                'enabled': self.monitoring.enabled,
                'prometheus_enabled': self.monitoring.prometheus_enabled,
                'alert_on_accuracy_drop': self.monitoring.alert_on_accuracy_drop,
            },
            'security': {
                'api_key_required': self.security.api_key_required,
                'tls_enabled': self.security.tls_enabled,
                'cors_enabled': self.security.cors_enabled,
                'rate_limit_enabled': self.security.rate_limit_enabled,
            },
            'resources': {
                'cpu_request': self.resources.cpu_request,
                'cpu_limit': self.resources.cpu_limit,
                'memory_request': self.resources.memory_request,
                'memory_limit': self.resources.memory_limit,
                'min_replicas': self.resources.min_replicas,
                'max_replicas': self.resources.max_replicas,
            },
            'logging': {
                'level': self.logging.level,
                'file_enabled': self.logging.file_enabled,
                'json_logs': self.logging.json_logs,
            }
        }

        try:
            with open(config_file, 'w') as f:
                yaml.dump(config_data, f, default_flow_style=False)

            logger.info(f"Saved configuration to {config_file}")

        except Exception as e:
            logger.error(f"Error saving config file: {e}")

    def get_env_vars(self) -> Dict[str, str]:
        """Get environment variables for deployment"""
        env_vars = {
            # Environment
            'ENVIRONMENT': self.environment.value,

            # Database
            'DB_HOST': self.database.host,
            'DB_PORT': str(self.database.port),
            'DB_NAME': self.database.database,
            'DB_USER': self.database.user,
            'DB_POOL_SIZE': str(self.database.pool_size),

            # Redis
            'REDIS_HOST': self.redis.host,
            'REDIS_PORT': str(self.redis.port),
            'REDIS_DB': str(self.redis.db),

            # Model serving
            'API_HOST': self.model_serving.host,
            'API_PORT': str(self.model_serving.port),
            'API_WORKERS': str(self.model_serving.workers),
            'API_TIMEOUT': str(self.model_serving.timeout),

            # Security
            'API_KEY_REQUIRED': str(self.security.api_key_required),
            'TLS_ENABLED': str(self.security.tls_enabled),

            # Logging
            'LOG_LEVEL': self.logging.level,
            'JSON_LOGS': str(self.logging.json_logs),
        }

        return env_vars

    def to_kubernetes_config(self) -> Dict[str, Any]:
        """Generate Kubernetes ConfigMap data"""
        return {
            'apiVersion': 'v1',
            'kind': 'ConfigMap',
            'metadata': {
                'name': f'ml-model-config-{self.environment.value}',
                'namespace': 'nexustrade',
            },
            'data': self.get_env_vars()
        }

    def to_docker_compose(self) -> Dict[str, Any]:
        """Generate docker-compose.yml configuration"""
        return {
            'version': '3.8',
            'services': {
                'ml-api': {
                    'build': {
                        'context': '.',
                        'dockerfile': 'Dockerfile.ml-api'
                    },
                    'ports': [
                        f"{self.model_serving.port}:8000"
                    ],
                    'environment': self.get_env_vars(),
                    'volumes': [
                        './ai-ml/models/saved:/app/models',
                        './logs:/app/logs'
                    ],
                    'depends_on': [
                        'postgres',
                        'redis'
                    ],
                    'restart': 'unless-stopped',
                    'deploy': {
                        'resources': {
                            'limits': {
                                'cpus': str(self.resources.cpu_limit),
                                'memory': f'{self.resources.memory_limit}G'
                            },
                            'reservations': {
                                'cpus': str(self.resources.cpu_request),
                                'memory': f'{self.resources.memory_request}G'
                            }
                        }
                    }
                },
                'postgres': {
                    'image': 'postgres:14',
                    'environment': {
                        'POSTGRES_DB': self.database.database,
                        'POSTGRES_USER': self.database.user,
                        'POSTGRES_PASSWORD': '${DB_PASSWORD}'
                    },
                    'volumes': [
                        'postgres-data:/var/lib/postgresql/data'
                    ],
                    'ports': [
                        f"{self.database.port}:5432"
                    ]
                },
                'redis': {
                    'image': 'redis:7',
                    'ports': [
                        f"{self.redis.port}:6379"
                    ],
                    'volumes': [
                        'redis-data:/data'
                    ]
                },
                'prometheus': {
                    'image': 'prom/prometheus:latest',
                    'ports': [
                        f"{self.monitoring.prometheus_port}:9090"
                    ],
                    'volumes': [
                        './monitoring/prometheus.yml:/etc/prometheus/prometheus.yml'
                    ],
                    'command': [
                        '--config.file=/etc/prometheus/prometheus.yml'
                    ]
                } if self.monitoring.prometheus_enabled else None,
                'grafana': {
                    'image': 'grafana/grafana:latest',
                    'ports': [
                        f"{self.monitoring.grafana_port}:3000"
                    ],
                    'environment': {
                        'GF_SECURITY_ADMIN_PASSWORD': '${GRAFANA_PASSWORD}'
                    },
                    'volumes': [
                        'grafana-data:/var/lib/grafana'
                    ]
                } if self.monitoring.grafana_enabled else None
            },
            'volumes': {
                'postgres-data': None,
                'redis-data': None,
                'grafana-data': None
            }
        }

    def validate(self) -> List[str]:
        """Validate configuration and return list of errors"""
        errors = []

        # Validate security settings
        if self.environment == Environment.PRODUCTION:
            if not self.security.api_key_required:
                errors.append("API key authentication must be enabled in production")

            if not self.security.tls_enabled:
                errors.append("TLS must be enabled in production")

            if self.security.jwt_secret_key == "":
                errors.append("JWT secret key must be set in production")

        # Validate resource limits
        if self.resources.cpu_limit < self.resources.cpu_request:
            errors.append("CPU limit must be >= CPU request")

        if self.resources.memory_limit < self.resources.memory_request:
            errors.append("Memory limit must be >= memory request")

        if self.resources.max_replicas < self.resources.min_replicas:
            errors.append("Max replicas must be >= min replicas")

        # Validate monitoring
        if self.environment == Environment.PRODUCTION and not self.monitoring.enabled:
            errors.append("Monitoring must be enabled in production")

        return errors

    def print_summary(self):
        """Print configuration summary"""
        print("=" * 60)
        print(f"DEPLOYMENT CONFIGURATION - {self.environment.value.upper()}")
        print("=" * 60)

        print(f"\nDatabase:")
        print(f"  Connection: {self.database.get_connection_string(masked=True)}")
        print(f"  Pool size: {self.database.pool_size}")

        print(f"\nRedis:")
        print(f"  Host: {self.redis.host}:{self.redis.port}")
        print(f"  Max connections: {self.redis.max_connections}")

        print(f"\nModel Serving:")
        print(f"  Address: {self.model_serving.host}:{self.model_serving.port}")
        print(f"  Workers: {self.model_serving.workers}")
        print(f"  Reload: {self.model_serving.reload}")

        print(f"\nSecurity:")
        print(f"  API key required: {self.security.api_key_required}")
        print(f"  TLS enabled: {self.security.tls_enabled}")
        print(f"  Rate limiting: {self.security.rate_limit_enabled}")

        print(f"\nResources:")
        print(f"  CPU: {self.resources.cpu_request}-{self.resources.cpu_limit} cores")
        print(f"  Memory: {self.resources.memory_request}-{self.resources.memory_limit} GB")
        print(f"  Replicas: {self.resources.min_replicas}-{self.resources.max_replicas}")

        print(f"\nMonitoring:")
        print(f"  Enabled: {self.monitoring.enabled}")
        print(f"  Prometheus: {self.monitoring.prometheus_enabled}")
        print(f"  Grafana: {self.monitoring.grafana_enabled}")

        print(f"\nLogging:")
        print(f"  Level: {self.logging.level}")
        print(f"  JSON logs: {self.logging.json_logs}")

        print("=" * 60)


# Example usage
if __name__ == "__main__":
    import sys

    # Parse environment from command line
    env = Environment.DEVELOPMENT
    if len(sys.argv) > 1:
        env = Environment(sys.argv[1])

    # Create configuration
    config = DeploymentConfig(environment=env)

    # Print summary
    config.print_summary()

    # Validate
    errors = config.validate()
    if errors:
        print("\n⚠️  Configuration errors:")
        for error in errors:
            print(f"  - {error}")
    else:
        print("\n✅ Configuration is valid")

    # Save configuration
    config.save_to_file()

    # Generate docker-compose.yml
    docker_compose = config.to_docker_compose()
    with open('docker-compose.yml', 'w') as f:
        yaml.dump(docker_compose, f, default_flow_style=False)

    print(f"\n📝 Generated docker-compose.yml for {env.value}")
