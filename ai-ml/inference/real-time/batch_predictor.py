"""
Batch prediction service for high-throughput processing of market data.
"""
import asyncio
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
import logging
from datetime import datetime
import mlflow
import joblib
from concurrent.futures import ThreadPoolExecutor
import queue
import threading
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

class BatchPredictor:
    """
    High-throughput batch prediction service for processing large volumes of market data.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize batch predictor.
        
        Args:
            config: Predictor configuration (uses default if None).
        """
        self.config = config or get_prediction_config()['batch_processing']
        self.model_config = get_prediction_config()['models']
        self.logger = logger
        
        # Load models
        self.models = {}
        self.feature_extractors = {}
        self.load_models()
        
        # Processing queue
        self.prediction_queue = queue.Queue(maxsize=self.config.get('queue_size', 10000))
        self.result_queue = queue.Queue()
        
        # Worker threads
        self.num_workers = self.config.get('num_workers', 4)
        self.workers = []
        self.running = False
        
        # Batch processing settings
        self.batch_size = self.config.get('batch_size', 1000)
        self.max_wait_time = self.config.get('max_wait_time', 5.0)  # seconds
        
    def load_models(self):
        """Load models for batch prediction."""
        try:
            for model_name, model_info in self.model_config.items():
                if model_info.get('enabled', True):
                    try:
                        # Load model
                        model_uri = model_info['uri']
                        if 'tensorflow' in model_info.get('type', ''):
                            model = mlflow.tensorflow.load_model(model_uri)
                        else:
                            model = mlflow.sklearn.load_model(model_uri)
                        
                        # Load feature extractor
                        feature_extractor = joblib.load(model_info['feature_extractor_path'])
                        
                        self.models[model_name] = model
                        self.feature_extractors[model_name] = feature_extractor
                        
                        self.logger.info(f"Loaded model for batch prediction: {model_name}")
                        
                    except Exception as e:
                        self.logger.error(f"Error loading model {model_name}: {e}")
            
            if not self.models:
                self.logger.warning("No models loaded for batch prediction!")
                
        except Exception as e:
            self.logger.error(f"Error initializing batch predictor: {e}")
            raise
    
    def start_workers(self):
        """Start worker threads for batch processing."""
        self.running = True
        
        for i in range(self.num_workers):
            worker = threading.Thread(
                target=self._worker_loop,
                name=f"BatchWorker-{i}",
                daemon=True
            )
            worker.start()
            self.workers.append(worker)
        
        self.logger.info(f"Started {self.num_workers} batch prediction workers")
    
    def stop_workers(self):
        """Stop worker threads gracefully."""
        self.running = False
        
        # Add sentinel values to wake up workers
        for _ in range(self.num_workers):
            try:
                self.prediction_queue.put(None, timeout=1.0)
            except queue.Full:
                pass
        
        # Wait for workers to finish
        for worker in self.workers:
            worker.join(timeout=5.0)
        
        self.workers = []
        self.logger.info("Stopped batch prediction workers")
    
    def _worker_loop(self):
        """Main worker loop for processing predictions."""
        while self.running:
            try:
                # Collect batch of requests
                batch = self._collect_batch()
                
                if not batch:
                    continue
                
                # Process batch
                results = self._process_batch(batch)
                
                # Put results in result queue
                for result in results:
                    self.result_queue.put(result)
                
            except Exception as e:
                self.logger.error(f"Worker error: {e}")
    
    def _collect_batch(self) -> List[Dict]:
        """
        Collect a batch of prediction requests.
        
        Returns:
            List of prediction requests.
        """
        batch = []
        start_time = datetime.now()
        
        while len(batch) < self.batch_size:
            try:
                # Calculate remaining wait time
                elapsed = (datetime.now() - start_time).total_seconds()
                remaining_time = max(0, self.max_wait_time - elapsed)
                
                if remaining_time <= 0 and batch:
                    break
                
                # Get item from queue
                try:
                    item = self.prediction_queue.get(timeout=remaining_time)
                except queue.Empty:
                    break
                
                if item is None:  # Sentinel value
                    break
                
                batch.append(item)
                
            except Exception as e:
                self.logger.error(f"Error collecting batch: {e}")
                break
        
        return batch
    
    def _process_batch(self, batch: List[Dict]) -> List[Dict]:
        """
        Process a batch of prediction requests.
        
        Args:
            batch: List of prediction requests.
            
        Returns:
            List of prediction results.
        """
        try:
            # Group by model type
            model_batches = {}
            for i, request in enumerate(batch):
                model_name = request.get('model_name', 'default')
                if model_name not in model_batches:
                    model_batches[model_name] = []
                model_batches[model_name].append((i, request))
            
            # Process each model batch
            results = [None] * len(batch)
            
            for model_name, model_batch in model_batches.items():
                if model_name not in self.models:
                    # Mark as error
                    for idx, request in model_batch:
                        results[idx] = {
                            'request_id': request.get('request_id'),
                            'error': f'Model {model_name} not available'
                        }
                    continue
                
                # Prepare features for batch
                batch_features = []
                valid_indices = []
                
                for idx, request in model_batch:
                    try:
                        features = self._prepare_features(request, model_name)
                        batch_features.append(features)
                        valid_indices.append(idx)
                    except Exception as e:
                        self.logger.error(f"Error preparing features for request {request.get('request_id')}: {e}")
                        results[idx] = {
                            'request_id': request.get('request_id'),
                            'error': f'Feature preparation failed: {str(e)}'
                        }
                
                if not batch_features:
                    continue
                
                try:
                    # Stack features
                    stacked_features = np.vstack(batch_features)
                    
                    # Make batch prediction
                    batch_predictions = self.models[model_name].predict(stacked_features)
                    
                    # Process results
                    for i, (idx, request) in enumerate(model_batch):
                        if i < len(valid_indices) and idx == valid_indices[i]:
                            try:
                                predictions = batch_predictions[i]
                                processed_result = self._process_prediction_result(
                                    predictions, request
                                )
                                
                                results[idx] = {
                                    'request_id': request.get('request_id'),
                                    'symbol': request.get('symbol'),
                                    'timestamp': request.get('timestamp'),
                                    'predictions': processed_result,
                                    'model_name': model_name
                                }
                            except Exception as e:
                                self.logger.error(f"Error processing prediction for request {request.get('request_id')}: {e}")
                                results[idx] = {
                                    'request_id': request.get('request_id'),
                                    'error': f'Prediction processing failed: {str(e)}'
                                }
                    
                except Exception as e:
                    self.logger.error(f"Batch prediction error for model {model_name}: {e}")
                    # Mark all requests in this batch as failed
                    for idx, request in model_batch:
                        if results[idx] is None:  # Only if not already processed
                            results[idx] = {
                                'request_id': request.get('request_id'),
                                'error': f'Batch prediction failed: {str(e)}'
                            }
            
            return [r for r in results if r is not None]
            
        except Exception as e:
            self.logger.error(f"Fatal error in batch processing: {e}")
            return [
                {
                    'request_id': req.get('request_id', f'unknown_{i}'),
                    'error': f'Fatal error: {str(e)}'
                }
                for i, req in enumerate(batch)
            ]
    
    def _prepare_features(self, request: Dict, model_name: str) -> np.ndarray:
        """
        Prepare features for a single request.
        
        Args:
            request: Prediction request.
            model_name: Name of the model to use.
            
        Returns:
            Feature array.
        """
        try:
            feature_extractor = self.feature_extractors[model_name]
            
            # Convert request data to DataFrame
            data = pd.DataFrame([{
                'timestamp': pd.to_datetime(request['timestamp']),
                'symbol': request['symbol'],
                **request['features']
            }])
            
            # Extract features
            features = feature_extractor.transform(data)
            
            return features[0] if features.ndim > 1 else features
            
        except Exception as e:
            self.logger.error(f"Feature preparation error: {e}")
            raise
    
    def _process_prediction_result(self, predictions: np.ndarray, request: Dict) -> Dict:
        """
        Process prediction result into a dictionary.
        
        Args:
            predictions: Raw predictions from model.
            request: Original request.
            
        Returns:
            Processed prediction result.
        """
        horizons = request.get('horizons', [1, 5, 15, 30, 60])
        
        result = {}
        if predictions.ndim == 0:
            result[str(horizons[0])] = float(predictions)
        else:
            for i, horizon in enumerate(horizons):
                if i < len(predictions):
                    result[str(horizon)] = float(predictions[i])
        
        return result
    
    def predict_batch(self, requests: List[Dict]) -> List[Dict]:
        """
        Process batch of prediction requests.
        
        Args:
            requests: List of prediction requests.
            
        Returns:
            List of prediction results.
        """
        # Add requests to queue
        request_ids = []
        for i, request in enumerate(requests):
            request_id = request.get('request_id', f"batch_{datetime.now().timestamp()}_{i}")
            request['request_id'] = request_id
            request_ids.append(request_id)
            
            try:
                self.prediction_queue.put(request, timeout=1.0)
            except queue.Full:
                self.logger.warning("Prediction queue full, dropping request")
                # Mark as failed
                requests[i]['_failed'] = True
        
        # Filter out failed requests
        valid_requests = [r for r in requests if not r.get('_failed', False)]
        
        # Collect results
        results = []
        collected_ids = set()
        
        # Wait for all results
        timeout_start = datetime.now()
        timeout_duration = self.config.get('result_timeout', 30.0)
        
        while len(collected_ids) < len(valid_requests):
            elapsed = (datetime.now() - timeout_start).total_seconds()
            if elapsed > timeout_duration:
                self.logger.warning("Timeout waiting for batch results")
                break
            
            try:
                result = self.result_queue.get(timeout=1.0)
                if result.get('request_id') in request_ids:
                    results.append(result)
                    collected_ids.add(result['request_id'])
            except queue.Empty:
                continue
        
        # Sort results by original order and add any missing results as errors
        id_to_result = {r['request_id']: r for r in results}
        ordered_results = []
        
        for request_id in request_ids:
            if request_id in id_to_result:
                ordered_results.append(id_to_result[request_id])
            else:
                ordered_results.append({
                    'request_id': request_id,
                    'error': 'Timeout or processing error'
                })
        
        return ordered_results
    
    def process_dataframe(self, df: pd.DataFrame, model_name: str = 'default') -> pd.DataFrame:
        """
        Process entire DataFrame for predictions.
        
        Args:
            df: Input DataFrame with market data.
            model_name: Model to use for predictions.
            
        Returns:
            DataFrame with predictions added.
        """
        try:
            if model_name not in self.models:
                raise ValueError(f"Model {model_name} not available")
            
            # Prepare features
            feature_extractor = self.feature_extractors[model_name]
            features = feature_extractor.transform(df)
            
            # Make predictions
            predictions = self.models[model_name].predict(features)
            
            # Add predictions to DataFrame
            result_df = df.copy()
            
            if predictions.ndim == 1:
                result_df['prediction_1min'] = predictions
            else:
                horizons = [1, 5, 15, 30, 60]
                for i, horizon in enumerate(horizons):
                    if i < predictions.shape[1]:
                        result_df[f'prediction_{horizon}min'] = predictions[:, i]
            
            # Add metadata
            result_df['model_name'] = model_name
            result_df['prediction_timestamp'] = datetime.now()
            
            return result_df
            
        except Exception as e:
            self.logger.error(f"DataFrame processing error: {e}")
            raise

def create_batch_predictor() -> BatchPredictor:
    """
    Create and initialize a batch predictor instance.
    
    Returns:
        Initialized BatchPredictor instance.
    """
    predictor = BatchPredictor()
    predictor.start_workers()
    return predictor

async def process_batch_async(predictor: BatchPredictor, requests: List[Dict]) -> List[Dict]:
    """
    Process a batch of requests asynchronously.
    
    Args:
        predictor: BatchPredictor instance.
        requests: List of prediction requests.
        
    Returns:
        List of prediction results.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, predictor.predict_batch, requests)

def main():
    """Example usage of the batch predictor."""
    # Configure MLflow
    mlflow.set_tracking_uri(os.getenv('MLFLOW_TRACKING_URI', 'http://localhost:5000'))
    
    # Create predictor
    predictor = create_batch_predictor()
    
    try:
        # Example usage
        requests = [
            {
                'symbol': 'AAPL',
                'timestamp': datetime.now().isoformat(),
                'features': {
                    'open': 150.0,
                    'high': 151.0,
                    'low': 149.0,
                    'close': 150.5,
                    'volume': 1000000
                },
                'model_name': 'lstm',
                'horizons': [1, 5, 15]
            }
            # Add more requests as needed
        ]
        
        # Process batch
        results = predictor.predict_batch(requests)
        print("Batch processing results:", results)
        
    finally:
        # Cleanup
        predictor.stop_workers()

if __name__ == '__main__':
    main()
