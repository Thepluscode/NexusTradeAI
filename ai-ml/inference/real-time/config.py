"""
Configuration for real-time prediction services.
"""
import os
from typing import Dict, Any

def get_prediction_config() -> Dict[str, Any]:
    """Get configuration for real-time prediction services"""
    return {
        'redis': {
            'host': os.getenv('REDIS_HOST', 'localhost'),
            'port': int(os.getenv('REDIS_PORT', '6379')),
            'password': os.getenv('REDIS_PASSWORD', ''),
            'db': int(os.getenv('REDIS_DB', 0))
        },
        'server': {
            'host': os.getenv('PREDICTION_HOST', '0.0.0.0'),
            'port': int(os.getenv('PREDICTION_PORT', '8080')),
            'debug': os.getenv('DEBUG', 'false').lower() == 'true'
        },
        'batch_processing': {
            'num_workers': int(os.getenv('BATCH_WORKERS', 4)),
            'queue_size': int(os.getenv('BATCH_QUEUE_SIZE', 10000)),
            'batch_size': int(os.getenv('BATCH_SIZE', 1000)),
            'max_wait_time': float(os.getenv('BATCH_MAX_WAIT', 5.0)),
            'result_timeout': float(os.getenv('RESULT_TIMEOUT', 30.0))
        },
        'models': {
            'lstm': {
                'enabled': True,
                'uri': 'models:/nexus_trade_lstm/Production',
                'type': 'tensorflow',
                'feature_extractor_path': 'models/feature_extractors/lstm_features.pkl'
            },
            'transformer': {
                'enabled': True,
                'uri': 'models:/nexus_trade_transformer/Production',
                'type': 'tensorflow',
                'feature_extractor_path': 'models/feature_extractors/transformer_features.pkl'
            },
            'xgboost': {
                'enabled': True,
                'uri': 'models:/nexus_trade_xgboost/Production',
                'type': 'sklearn',
                'feature_extractor_path': 'models/feature_extractors/xgboost_features.pkl'
            }
        }
    }
