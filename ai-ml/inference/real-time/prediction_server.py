"""
Real-time prediction server for financial market predictions.
"""
import asyncio
import aiohttp
from aiohttp import web
import numpy as np
import pandas as pd
import tensorflow as tf
import joblib
import redis
import json
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import mlflow
import mlflow.tensorflow
from dataclasses import dataclass, asdict
import sys
import os

# Add project root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from inference.real_time.config import get_prediction_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class PredictionRequest:
    """Prediction request structure"""
    symbol: str
    timestamp: datetime
    features: Dict[str, float]
    horizons: List[int] = None
    model_version: str = "latest"

@dataclass
class PredictionResponse:
    """Prediction response structure"""
    symbol: str
    timestamp: datetime
    predictions: Dict[str, float]  # horizon -> prediction
    confidence: Dict[str, float]  # horizon -> confidence
    model_version: str
    processing_time_ms: float

class RealTimePredictionServer:
    """
    High-performance real-time prediction server for financial ML models
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize prediction server
        
        Args:
            config: Server configuration (uses default if None)
        """
        self.config = config or get_prediction_config()
        self.logger = logger
        
        # Model registry
        self.models = {}
        self.feature_extractors = {}
        self.model_metadata = {}
        
        # Redis for caching
        self.redis_client = redis.Redis(
            host=self.config['redis']['host'],
            port=self.config['redis']['port'],
            password=self.config['redis']['password'],
            db=self.config['redis']['db'],
            decode_responses=False
        )
        
        # Performance tracking
        self.prediction_stats = {
            'total_predictions': 0,
            'avg_latency_ms': 0,
            'error_count': 0,
            'cache_hits': 0
        }
        
        # Load models on startup
        self.load_models()
    
    def load_models(self):
        """Load all available models from MLflow registry"""
        try:
            client = mlflow.tracking.MlflowClient()
            
            # Get all registered models
            registered_models = client.list_registered_models()
            
            for rm in registered_models:
                if rm.name.startswith('nexus_trade_'):
                    # Get latest production version
                    latest_versions = client.get_latest_versions(
                        rm.name, 
                        stages=["Production", "Staging"]
                    )
                    
                    if latest_versions:
                        version = latest_versions[0]
                        model_uri = f"models:/{rm.name}/{version.version}"
                        
                        try:
                            # Load model based on type
                            if 'lstm' in rm.name or 'transformer' in rm.name:
                                model = mlflow.tensorflow.load_model(model_uri)
                            else:
                                model = mlflow.sklearn.load_model(model_uri)
                            
                            # Load feature extractor
                            feature_extractor_path = client.download_artifacts(
                                version.run_id, 
                                "feature_extractor.pkl"
                            )
                            feature_extractor = joblib.load(feature_extractor_path)
                            
                            # Store model
                            model_key = rm.name.replace('nexus_trade_', '')
                            self.models[model_key] = model
                            self.feature_extractors[model_key] = feature_extractor
                            self.model_metadata[model_key] = {
                                'version': version.version,
                                'stage': version.current_stage,
                                'loaded_at': datetime.now()
                            }
                            
                            self.logger.info(f"Loaded model: {model_key} v{version.version}")
                            
                        except Exception as e:
                            self.logger.error(f"Failed to load model {rm.name}: {e}")
            
            if not self.models:
                self.logger.warning("No models loaded!")
            
        except Exception as e:
            self.logger.error(f"Error loading models: {e}")
    
    async def predict(self, request: PredictionRequest) -> PredictionResponse:
        """
        Make real-time prediction
        
        Args:
            request: Prediction request
            
        Returns:
            Prediction response
        """
        start_time = datetime.now()
        
        try:
            # Check cache first
            cache_key = self.get_cache_key(request)
            cached_result = await self.get_cached_prediction(cache_key)
            
            if cached_result:
                self.prediction_stats['cache_hits'] += 1
                return cached_result
            
            # Select model
            model_name = self.select_model(request)
            if model_name not in self.models:
                raise ValueError(f"Model {model_name} not available")
            
            model = self.models[model_name]
            feature_extractor = self.feature_extractors[model_name]
            
            # Prepare features
            features = await self.prepare_features(request, feature_extractor)
            
            # Make prediction
            raw_predictions = model.predict(features)
            
            # Process predictions
            predictions, confidence = self.process_predictions(
                raw_predictions, request.horizons or [1, 5, 15, 30, 60]
            )
            
            # Create response
            processing_time = (datetime.now() - start_time).total_seconds() * 1000
            
            response = PredictionResponse(
                symbol=request.symbol,
                timestamp=request.timestamp,
                predictions=predictions,
                confidence=confidence,
                model_version=self.model_metadata[model_name]['version'],
                processing_time_ms=processing_time
            )
            
            # Cache result
            await self.cache_prediction(cache_key, response)
            
            # Update stats
            self.update_prediction_stats(processing_time)
            
            return response
            
        except Exception as e:
            self.logger.error(f"Prediction error: {e}")
            self.prediction_stats['error_count'] += 1
            raise
    
    async def prepare_features(self, request: PredictionRequest, feature_extractor) -> np.ndarray:
        """
        Prepare features for model input
        
        Args:
            request: Prediction request
            feature_extractor: Feature extraction pipeline
            
        Returns:
            Feature array
        """
        # Get historical data for feature engineering
        historical_data = await self.get_historical_data(
            request.symbol, 
            lookback_periods=100
        )
        
        # Add current features
        current_data = pd.DataFrame([{
            'timestamp': request.timestamp,
            'symbol': request.symbol,
            **request.features
        }])
        
        # Combine historical and current data
        combined_data = pd.concat([historical_data, current_data], ignore_index=True)
        
        # Extract features
        features = feature_extractor.transform(combined_data)
        
        # Return last row (current features)
        return features[-1:] if features.ndim == 2 else features[-1:, :]
    
    async def get_historical_data(self, symbol: str, lookback_periods: int = 100) -> pd.DataFrame:
        """
        Get historical data for feature engineering
        
        Args:
            symbol: Trading symbol
            lookback_periods: Number of periods to look back
            
        Returns:
            Historical data DataFrame
        """
        # Try to get from Redis first
        cache_key = f"historical_data:{symbol}:{lookback_periods}"
        cached_data = self.redis_client.get(cache_key)
        
        if cached_data:
            return pd.read_json(cached_data)
        
        # If not in cache, get from time series database
        # This would connect to your time series database (InfluxDB, TimescaleDB, etc.)
        # For now, return mock data
        end_time = datetime.now()
        start_time = end_time - timedelta(minutes=lookback_periods)
        
        # Mock historical data generation
        timestamps = pd.date_range(start_time, end_time, freq='1min')
        data = []
        
        base_price = 100.0
        for i, ts in enumerate(timestamps):
            price = base_price + np.random.normal(0, 1) * 0.1
            data.append({
                'timestamp': ts,
                'symbol': symbol,
                'open': price,
                'high': price * 1.001,
                'low': price * 0.999,
                'close': price,
                'volume': np.random.randint(1000, 10000)
            })
            base_price = price
        
        df = pd.DataFrame(data)
        
        # Cache for 1 minute
        self.redis_client.setex(cache_key, 60, df.to_json())
        
        return df
    
    def select_model(self, request: PredictionRequest) -> str:
        """
        Select appropriate model for prediction
        
        Args:
            request: Prediction request
            
        Returns:
            Model name
        """
        # Default model selection logic
        if request.model_version != "latest":
            # Use specific model version if requested
            for model_name, metadata in self.model_metadata.items():
                if metadata['version'] == request.model_version:
                    return model_name
        
        # Select best performing model for the symbol
        # This could be enhanced with A/B testing logic
        available_models = list(self.models.keys())
        
        if 'ensemble' in available_models:
            return 'ensemble'
        elif 'transformer' in available_models:
            return 'transformer'
        elif 'lstm' in available_models:
            return 'lstm'
        else:
            return available_models[0] if available_models else None
    
    def process_predictions(self, raw_predictions: np.ndarray, horizons: List[int]) -> tuple:
        """
        Process raw model predictions
        
        Args:
            raw_predictions: Raw prediction array
            horizons: Prediction horizons
            
        Returns:
            Tuple of (predictions, confidence)
        """
        predictions = {}
        confidence = {}
        
        # Handle different prediction formats
        if raw_predictions.ndim == 1:
            # Single prediction
            predictions[str(horizons[0])] = float(raw_predictions[0])
            confidence[str(horizons[0])] = 0.8  # Default confidence
        else:
            # Multi-horizon predictions
            for i, horizon in enumerate(horizons):
                if i < raw_predictions.shape[1]:
                    predictions[str(horizon)] = float(raw_predictions[0, i])
                    
                    # Calculate confidence based on prediction magnitude
                    # This is a simple heuristic - could be enhanced
                    pred_magnitude = abs(raw_predictions[0, i])
                    confidence[str(horizon)] = min(0.95, 0.5 + pred_magnitude * 10)
        
        return predictions, confidence
    
    async def get_cached_prediction(self, cache_key: str) -> Optional[PredictionResponse]:
        """Get cached prediction if available"""
        try:
            cached_data = self.redis_client.get(cache_key)
            if cached_data:
                data = json.loads(cached_data)
                return PredictionResponse(**data)
        except Exception as e:
            self.logger.warning(f"Cache retrieval error: {e}")
        
        return None
    
    async def cache_prediction(self, cache_key: str, response: PredictionResponse):
        """Cache prediction result"""
        try:
            # Cache for 30 seconds
            self.redis_client.setex(
                cache_key, 
                30, 
                json.dumps(asdict(response), default=str)
            )
        except Exception as e:
            self.logger.warning(f"Cache storage error: {e}")
    
    def get_cache_key(self, request: PredictionRequest) -> str:
        """Generate cache key for request"""
        # Round timestamp to nearest minute for caching
        rounded_timestamp = request.timestamp.replace(second=0, microsecond=0)
        return f"prediction:{request.symbol}:{rounded_timestamp.isoformat()}:{request.model_version}"
    
    def update_prediction_stats(self, processing_time_ms: float):
        """Update prediction statistics"""
        self.prediction_stats['total_predictions'] += 1
        
        # Update rolling average latency
        total = self.prediction_stats['total_predictions']
        current_avg = self.prediction_stats['avg_latency_ms']
        self.prediction_stats['avg_latency_ms'] = (
            (current_avg * (total - 1) + processing_time_ms) / total
        )
    
    # HTTP API endpoints
    async def handle_predict(self, request_data: web.Request) -> web.Response:
        """Handle HTTP prediction request"""
        try:
            data = await request_data.json()
            
            # Parse request
            prediction_request = PredictionRequest(
                symbol=data['symbol'],
                timestamp=datetime.fromisoformat(data['timestamp']),
                features=data['features'],
                horizons=data.get('horizons'),
                model_version=data.get('model_version', 'latest')
            )
            
            # Make prediction
            response = await self.predict(prediction_request)
            
            return web.json_response(asdict(response))
            
        except Exception as e:
            self.logger.error(f"API prediction error: {e}")
            return web.json_response(
                {'error': str(e)}, 
                status=500
            )
    
    async def handle_batch_predict(self, request_data: web.Request) -> web.Response:
        """Handle batch prediction request"""
        try:
            data = await request_data.json()
            requests = data['requests']
            
            # Process requests concurrently
            prediction_requests = [
                PredictionRequest(
                    symbol=req['symbol'],
                    timestamp=datetime.fromisoformat(req['timestamp']),
                    features=req['features'],
                    horizons=req.get('horizons'),
                    model_version=req.get('model_version', 'latest')
                )
                for req in requests
            ]
            
            # Execute predictions concurrently
            responses = await asyncio.gather(
                *[self.predict(req) for req in prediction_requests],
                return_exceptions=True
            )
            
            # Format responses
            results = []
            for i, response in enumerate(responses):
                if isinstance(response, Exception):
                    results.append({
                        'request_id': i,
                        'error': str(response)
                    })
                else:
                    results.append({
                        'request_id': i,
                        'prediction': asdict(response)
                    })
            
            return web.json_response({'results': results})
            
        except Exception as e:
            self.logger.error(f"Batch prediction error: {e}")
            return web.json_response(
                {'error': str(e)}, 
                status=500
            )
    
    async def handle_health(self, request: web.Request) -> web.Response:
        """Health check endpoint"""
        health_status = {
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'models_loaded': len(self.models),
            'prediction_stats': self.prediction_stats,
            'model_metadata': self.model_metadata
        }
        
        return web.json_response(health_status)
    
    async def handle_reload_models(self, request: web.Request) -> web.Response:
        """Reload models endpoint"""
        try:
            self.load_models()
            return web.json_response({
                'status': 'success',
                'models_loaded': len(self.models)
            })
        except Exception as e:
            return web.json_response({
                'status': 'error',
                'error': str(e)
            }, status=500)

async def create_app():
    """Create and configure the web application"""
    app = web.Application()
    server = RealTimePredictionServer()
    
    # Add routes
    app.router.add_post('/predict', server.handle_predict)
    app.router.add_post('/batch_predict', server.handle_batch_predict)
    app.router.add_get('/health', server.handle_health)
    app.router.add_post('/reload_models', server.handle_reload_models)
    
    # Store server instance in app
    app['prediction_server'] = server
    
    return app

async def start_background_tasks(app):
    """Start background tasks"""
    # Add any background tasks here
    pass

async def cleanup_background_tasks(app):
    """Cleanup background tasks"""
    # Cleanup any background tasks here
    pass

def main():
    """Main entry point"""
    # Configure MLflow tracking
    mlflow.set_tracking_uri(os.getenv('MLFLOW_TRACKING_URI', 'http://localhost:5000'))
    
    # Create and run the web server
    app = asyncio.run(create_app())
    web.run_app(
        app,
        host=app['prediction_server'].config['server']['host'],
        port=app['prediction_server'].config['server']['port']
    )

if __name__ == '__main__':
    main()
