#!/usr/bin/env python3
"""
NexusTradeAI - AI Model Configuration Loader
Advanced configuration management for AI model integration strategy
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass
from pathlib import Path
import yaml
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

@dataclass
class ModelConfig:
    """Configuration for individual AI models"""
    enabled: bool
    priority: str
    hyperparameters: Dict[str, Any]
    performance_threshold: float
    retraining_schedule: str

@dataclass
class AIOrchestatorConfig:
    """Configuration for AI orchestration engine"""
    ensemble_strategy: str
    confidence_threshold: float
    real_time_inference: bool
    max_latency_ms: int
    models: Dict[str, ModelConfig]

class ConfigLoader:
    """Advanced configuration loader for NexusTradeAI AI models"""
    
    def __init__(self, config_path: Optional[str] = None):
        self.config_path = config_path or self._get_default_config_path()
        self.env_config = self._load_env_config()
        self.model_config = self._load_model_config()
        self.logger = self._setup_logging()
        
    def _get_default_config_path(self) -> str:
        """Get default configuration file path"""
        base_path = Path(__file__).parent.parent.parent
        return str(base_path / "config" / "ai-models-config.json")
    
    def _setup_logging(self) -> logging.Logger:
        """Setup logging configuration"""
        logging.basicConfig(
            level=getattr(logging, os.getenv('LOG_LEVEL', 'INFO').upper()),
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        return logging.getLogger(__name__)
    
    def _load_env_config(self) -> Dict[str, Any]:
        """Load configuration from environment variables"""
        return {
            # Core AI Settings
            'ai_enabled': os.getenv('AI_ENABLED', 'true').lower() == 'true',
            'python_path': os.getenv('PYTHON_PATH', 'python3'),
            
            # Model Enablement
            'predictive_analytics_enabled': os.getenv('PREDICTIVE_ANALYTICS_ENABLED', 'true').lower() == 'true',
            'neural_networks_enabled': os.getenv('NEURAL_NETWORKS_ENABLED', 'true').lower() == 'true',
            'reinforcement_learning_enabled': os.getenv('REINFORCEMENT_LEARNING_ENABLED', 'true').lower() == 'true',
            'nlp_enabled': os.getenv('NLP_ENABLED', 'true').lower() == 'true',
            'time_series_forecasting_enabled': os.getenv('TIME_SERIES_FORECASTING_ENABLED', 'true').lower() == 'true',
            'gan_enabled': os.getenv('GAN_ENABLED', 'false').lower() == 'true',
            'clustering_enabled': os.getenv('CLUSTERING_ENABLED', 'true').lower() == 'true',
            
            # Performance Settings
            'model_inference_timeout': int(os.getenv('MODEL_INFERENCE_TIMEOUT', '100')),
            'model_accuracy_threshold': float(os.getenv('MODEL_ACCURACY_THRESHOLD', '0.65')),
            'ensemble_voting_enabled': os.getenv('ENSEMBLE_VOTING_ENABLED', 'true').lower() == 'true',
            'real_time_learning_enabled': os.getenv('REAL_TIME_LEARNING_ENABLED', 'true').lower() == 'true',
            
            # Specific Model Settings
            'lightgbm_enabled': os.getenv('LIGHTGBM_ENABLED', 'true').lower() == 'true',
            'catboost_enabled': os.getenv('CATBOOST_ENABLED', 'true').lower() == 'true',
            'xgboost_enabled': os.getenv('XGBOOST_ENABLED', 'true').lower() == 'true',
            'random_forest_enabled': os.getenv('RANDOM_FOREST_ENABLED', 'true').lower() == 'true',
            
            # Neural Network Settings
            'lstm_enabled': os.getenv('LSTM_ENABLED', 'true').lower() == 'true',
            'transformer_enabled': os.getenv('TRANSFORMER_ENABLED', 'true').lower() == 'true',
            'cnn_enabled': os.getenv('CNN_ENABLED', 'true').lower() == 'true',
            'sequence_length': int(os.getenv('SEQUENCE_LENGTH', '60')),
            'batch_size': int(os.getenv('BATCH_SIZE', '64')),
            'learning_rate': float(os.getenv('LEARNING_RATE', '0.001')),
            'epochs': int(os.getenv('EPOCHS', '100')),
            
            # RL Settings
            'rl_algorithm': os.getenv('RL_ALGORITHM', 'ddpg'),
            'rl_memory_capacity': int(os.getenv('RL_MEMORY_CAPACITY', '100000')),
            'rl_training_episodes': int(os.getenv('RL_TRAINING_EPISODES', '1000')),
            
            # NLP Settings
            'nlp_model': os.getenv('NLP_MODEL', 'finbert'),
            'sentiment_analysis_enabled': os.getenv('SENTIMENT_ANALYSIS_ENABLED', 'true').lower() == 'true',
            'news_analysis_enabled': os.getenv('NEWS_ANALYSIS_ENABLED', 'true').lower() == 'true',
            
            # Feature Engineering
            'feature_count': int(os.getenv('FEATURE_COUNT', '200')),
            'technical_indicators_count': int(os.getenv('TECHNICAL_INDICATORS_COUNT', '150')),
            'fundamental_indicators_count': int(os.getenv('FUNDAMENTAL_INDICATORS_COUNT', '50')),
            
            # Infrastructure
            'model_storage_path': os.getenv('MODEL_STORAGE_PATH', './models'),
            'feature_store_path': os.getenv('FEATURE_STORE_PATH', './data/feature_store'),
            'mlflow_tracking_uri': os.getenv('MLFLOW_TRACKING_URI', './mlruns'),
            
            # External APIs
            'openai_api_key': os.getenv('OPENAI_API_KEY'),
            'huggingface_api_key': os.getenv('HUGGINGFACE_API_KEY'),
            'news_api_key': os.getenv('NEWS_API_KEY'),
            
            # Performance Optimization
            'cuda_enabled': os.getenv('CUDA_ENABLED', 'false').lower() == 'true',
            'gpu_memory_limit': int(os.getenv('GPU_MEMORY_LIMIT', '4096')),
            'cpu_cores': int(os.getenv('CPU_CORES', '4')),
            'parallel_processing': os.getenv('PARALLEL_PROCESSING', 'true').lower() == 'true',
        }
    
    def _load_model_config(self) -> Dict[str, Any]:
        """Load model configuration from JSON file"""
        try:
            with open(self.config_path, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            self.logger.warning(f"Config file not found: {self.config_path}")
            return {}
        except json.JSONDecodeError as e:
            self.logger.error(f"Invalid JSON in config file: {e}")
            return {}
    
    def get_model_config(self, model_name: str) -> Dict[str, Any]:
        """Get configuration for a specific model"""
        return self.model_config.get(model_name, {})
    
    def is_model_enabled(self, model_name: str) -> bool:
        """Check if a specific model is enabled"""
        env_key = f"{model_name.lower()}_enabled"
        env_enabled = self.env_config.get(env_key, False)
        config_enabled = self.model_config.get(model_name, {}).get('enabled', False)
        return env_enabled and config_enabled
    
    def get_predictive_analytics_config(self) -> Dict[str, Any]:
        """Get predictive analytics configuration"""
        base_config = self.get_model_config('predictive_analytics')
        
        # Override with environment variables
        if 'models' in base_config:
            for model_name in base_config['models']:
                env_key = f"{model_name}_enabled"
                if env_key in self.env_config:
                    base_config['models'][model_name]['enabled'] = self.env_config[env_key]
        
        return base_config
    
    def get_neural_network_config(self) -> Dict[str, Any]:
        """Get neural network configuration"""
        base_config = self.get_model_config('neural_networks')
        
        # Override with environment variables
        env_overrides = {
            'sequence_length': self.env_config.get('sequence_length'),
            'batch_size': self.env_config.get('batch_size'),
            'learning_rate': self.env_config.get('learning_rate'),
            'epochs': self.env_config.get('epochs')
        }
        
        # Apply overrides
        for key, value in env_overrides.items():
            if value is not None and 'models' in base_config:
                for model_config in base_config['models'].values():
                    if key in model_config:
                        model_config[key] = value
        
        return base_config
    
    def get_rl_config(self) -> Dict[str, Any]:
        """Get reinforcement learning configuration"""
        base_config = self.get_model_config('reinforcement_learning')
        
        # Override with environment variables
        if 'algorithm' in base_config:
            base_config['algorithm'] = self.env_config.get('rl_algorithm', base_config['algorithm'])
        
        return base_config
    
    def get_nlp_config(self) -> Dict[str, Any]:
        """Get NLP configuration"""
        base_config = self.get_model_config('natural_language_processing')
        
        # Add API keys
        if 'api_keys' not in base_config:
            base_config['api_keys'] = {}
        
        base_config['api_keys'].update({
            'openai': self.env_config.get('openai_api_key'),
            'huggingface': self.env_config.get('huggingface_api_key'),
            'news_api': self.env_config.get('news_api_key')
        })
        
        return base_config
    
    def get_infrastructure_config(self) -> Dict[str, Any]:
        """Get infrastructure configuration"""
        return {
            'model_storage_path': self.env_config.get('model_storage_path'),
            'feature_store_path': self.env_config.get('feature_store_path'),
            'mlflow_tracking_uri': self.env_config.get('mlflow_tracking_uri'),
            'cuda_enabled': self.env_config.get('cuda_enabled'),
            'gpu_memory_limit': self.env_config.get('gpu_memory_limit'),
            'cpu_cores': self.env_config.get('cpu_cores'),
            'parallel_processing': self.env_config.get('parallel_processing')
        }
    
    def validate_config(self) -> List[str]:
        """Validate configuration and return list of issues"""
        issues = []
        
        # Check if AI is enabled
        if not self.env_config.get('ai_enabled'):
            issues.append("AI is disabled in environment configuration")
        
        # Check for required API keys
        required_apis = ['openai_api_key', 'huggingface_api_key']
        for api_key in required_apis:
            if not self.env_config.get(api_key):
                issues.append(f"Missing required API key: {api_key}")
        
        # Check model storage path
        storage_path = Path(self.env_config.get('model_storage_path', './models'))
        if not storage_path.exists():
            try:
                storage_path.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                issues.append(f"Cannot create model storage path: {e}")
        
        # Check feature store path
        feature_path = Path(self.env_config.get('feature_store_path', './data/feature_store'))
        if not feature_path.exists():
            try:
                feature_path.mkdir(parents=True, exist_ok=True)
            except Exception as e:
                issues.append(f"Cannot create feature store path: {e}")
        
        return issues
    
    def get_enabled_models(self) -> List[str]:
        """Get list of enabled models"""
        enabled_models = []
        
        model_categories = [
            'predictive_analytics', 'neural_networks', 'reinforcement_learning',
            'natural_language_processing', 'time_series_forecasting',
            'generative_adversarial_networks', 'clustering_algorithms'
        ]
        
        for category in model_categories:
            if self.is_model_enabled(category):
                enabled_models.append(category)
        
        return enabled_models
    
    def export_config(self, output_path: str) -> None:
        """Export current configuration to file"""
        config_export = {
            'environment_config': self.env_config,
            'model_config': self.model_config,
            'enabled_models': self.get_enabled_models(),
            'validation_issues': self.validate_config()
        }
        
        with open(output_path, 'w') as f:
            json.dump(config_export, f, indent=2)
        
        self.logger.info(f"Configuration exported to: {output_path}")

# Global configuration instance
config_loader = ConfigLoader()

def get_config() -> ConfigLoader:
    """Get global configuration instance"""
    return config_loader

if __name__ == "__main__":
    # Test configuration loading
    config = get_config()
    
    print("🤖 NexusTradeAI AI Configuration Loader")
    print("=" * 50)
    
    print(f"AI Enabled: {config.env_config['ai_enabled']}")
    print(f"Enabled Models: {', '.join(config.get_enabled_models())}")
    
    validation_issues = config.validate_config()
    if validation_issues:
        print("\n⚠️ Configuration Issues:")
        for issue in validation_issues:
            print(f"  - {issue}")
    else:
        print("\n✅ Configuration is valid")
    
    # Export configuration for review
    config.export_config("./config_export.json")
    print("\n📄 Configuration exported to config_export.json")
