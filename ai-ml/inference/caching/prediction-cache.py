"""
Prediction Cache Module

This module provides an intelligent caching system for ML predictions with Redis backend,
featuring similarity-based lookups, compression, and advanced invalidation strategies.
"""

import redis
import json
import numpy as np
import pandas as pd
from typing import Dict, List, Any, Optional, Tuple
import logging
from datetime import datetime, timedelta
import hashlib
import pickle
import zlib
from dataclasses import dataclass
import asyncio

@dataclass
class CacheEntry:
    """Cache entry structure"""
    key: str
    value: Any
    timestamp: datetime
    ttl: int
    hit_count: int
    size_bytes: int

class IntelligentPredictionCache:
    """
    Intelligent caching system for ML predictions with advanced features
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize prediction cache
        
        Args:
            config: Cache configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Redis configuration
        self.redis_client = redis.Redis(
            host=config['redis']['host'],
            port=config['redis']['port'],
            password=config['redis'].get('password'),
            decode_responses=False  # We'll handle encoding manually
        )
        
        # Cache settings
        self.default_ttl = config.get('default_ttl', 300)  # 5 minutes
        self.max_cache_size = config.get('max_cache_size_mb', 1000) * 1024 * 1024  # Convert MB to bytes
        self.compression_enabled = config.get('compression_enabled', True)
        self.compression_threshold = config.get('compression_threshold', 1000)  # bytes
        
        # Cache strategies
        self.cache_strategy = config.get('cache_strategy', 'intelligent')
        self.invalidation_strategy = config.get('invalidation_strategy', 'time_based')
        
        # Feature similarity thresholds
        self.similarity_threshold = config.get('similarity_threshold', 0.95)
        self.max_similar_searches = config.get('max_similar_searches', 100)
        
        # Performance tracking
        self.cache_stats = {
            'hits': 0,
            'misses': 0,
            'evictions': 0,
            'size_bytes': 0,
            'similarity_hits': 0
        }
        
        # Prefixes for different cache types
        self.prefixes = {
            'prediction': 'pred:',
            'feature': 'feat:',
            'model_output': 'model:',
            'similarity': 'sim:',
            'metadata': 'meta:'
        }
    
    def generate_cache_key(self, 
                         features: np.ndarray,
                         model_name: str,
                         symbol: str = None,
                         timestamp: datetime = None) -> str:
        """Generate cache key for features and model"""
        
        # Serialize features for hashing
        if isinstance(features, np.ndarray):
            # Round to reduce sensitivity to minor differences
            rounded_features = np.round(features, decimals=4)
            feature_str = np.array2string(rounded_features, separator=',')
        else:
            feature_str = str(features)
        
        # Create key components
        key_components = [
            model_name,
            symbol or 'default',
            feature_str
        ]
        
        # Add time component for time-sensitive caching
        if timestamp:
            # Round to nearest minute for better cache hits
            rounded_time = timestamp.replace(second=0, microsecond=0)
            key_components.append(rounded_time.isoformat())
        
        # Generate hash
        key_string = '|'.join(key_components)
        key_hash = hashlib.sha256(key_string.encode()).hexdigest()[:16]
        
        return f"{self.prefixes['prediction']}{key_hash}"
    
    async def get_prediction(self, 
                           features: np.ndarray,
                           model_name: str,
                           symbol: str = None,
                           timestamp: datetime = None) -> Optional[Dict[str, Any]]:
        """
        Get cached prediction
        
        Args:
            features: Input features
            model_name: Model name
            symbol: Symbol (optional)
            timestamp: Request timestamp (optional)
            
        Returns:
            Cached prediction or None
        """
        try:
            # Generate cache key
            cache_key = self.generate_cache_key(features, model_name, symbol, timestamp)
            
            # Try exact match first
            cached_data = self.redis_client.get(cache_key)
            
            if cached_data:
                # Decompress if needed
                if self.compression_enabled:
                    cached_data = zlib.decompress(cached_data)
                
                # Deserialize
                prediction = pickle.loads(cached_data)
                
                # Update hit count
                await self.update_cache_hit(cache_key)
                self.cache_stats['hits'] += 1
                
                self.logger.debug(f"Cache hit for key: {cache_key}")
                return prediction
            
            # Try similarity-based matching if enabled
            if self.cache_strategy == 'intelligent':
                similar_prediction = await self.find_similar_prediction(
                    features, model_name, symbol, timestamp
                )
                
                if similar_prediction:
                    self.cache_stats['similarity_hits'] += 1
                    return similar_prediction
            
            # Cache miss
            self.cache_stats['misses'] += 1
            return None
            
        except Exception as e:
            self.logger.error(f"Error getting cached prediction: {e}")
            return None
    
    async def cache_prediction(self,
                             features: np.ndarray,
                             model_name: str,
                             prediction: Dict[str, Any],
                             symbol: str = None,
                             timestamp: datetime = None,
                             ttl: int = None) -> bool:
        """
        Cache prediction
        
        Args:
            features: Input features
            model_name: Model name
            prediction: Prediction to cache
            symbol: Symbol (optional)
            timestamp: Request timestamp (optional)
            ttl: Time to live in seconds
            
        Returns:
            Success status
        """
        try:
            # Generate cache key
            cache_key = self.generate_cache_key(features, model_name, symbol, timestamp)
            
            # Add metadata to prediction
            enhanced_prediction = {
                **prediction,
                'cached_at': datetime.now().isoformat(),
                'model_name': model_name,
                'symbol': symbol,
                'cache_key': cache_key
            }
            
            # Serialize
            serialized_data = pickle.dumps(enhanced_prediction)
            
            # Compress if data is large enough
            if self.compression_enabled and len(serialized_data) > self.compression_threshold:
                serialized_data = zlib.compress(serialized_data)
            
            # Set TTL
            cache_ttl = ttl or self.default_ttl
            
            # Check cache size limits
            if await self.should_evict_cache():
                await self.evict_cache_entries()
            
            # Store in cache
            self.redis_client.setex(cache_key, cache_ttl, serialized_data)
            
            # Store feature vector for similarity matching
            if self.cache_strategy == 'intelligent':
                await self.store_feature_vector(cache_key, features, cache_ttl)
            
            # Update cache size tracking
            await self.update_cache_size(len(serialized_data))
            
            self.logger.debug(f"Cached prediction with key: {cache_key}")
            return True
            
        except Exception as e:
            self.logger.error(f"Error caching prediction: {e}")
            return False
    
    async def find_similar_prediction(self,
                                    features: np.ndarray,
                                    model_name: str,
                                    symbol: str = None,
                                    timestamp: datetime = None) -> Optional[Dict[str, Any]]:
        """Find similar cached prediction using feature similarity"""
        
        try:
            # Get all feature vectors for this model
            pattern = f"{self.prefixes['similarity']}{model_name}:*"
            similar_keys = self.redis_client.keys(pattern)
            
            if not similar_keys:
                return None
            
            # Limit search for performance
            similar_keys = similar_keys[:self.max_similar_searches]
            
            best_similarity = 0
            best_key = None
            
            for key in similar_keys:
                try:
                    # Get stored feature vector
                    stored_features_data = self.redis_client.get(key)
                    if not stored_features_data:
                        continue
                    
                    stored_features = pickle.loads(stored_features_data)
                    
                    # Calculate similarity
                    similarity = self.calculate_feature_similarity(features, stored_features)
                    
                    if similarity > best_similarity and similarity > self.similarity_threshold:
                        best_similarity = similarity
                        # Extract original cache key from similarity key
                        best_key = key.decode('utf-8').replace(
                            f"{self.prefixes['similarity']}{model_name}:", 
                            self.prefixes['prediction']
                        )
                
                except Exception as e:
                    self.logger.debug(f"Error processing similarity key {key}: {e}")
                    continue
            
            if best_key:
                # Get the actual prediction
                cached_data = self.redis_client.get(best_key)
                if cached_data:
                    if self.compression_enabled:
                        cached_data = zlib.decompress(cached_data)
                    
                    prediction = pickle.loads(cached_data)
                    
                    # Add similarity metadata
                    prediction['similarity_match'] = True
                    prediction['similarity_score'] = best_similarity
                    
                    self.logger.debug(f"Found similar prediction with similarity: {best_similarity}")
                    return prediction
            
            return None
            
        except Exception as e:
            self.logger.error(f"Error finding similar prediction: {e}")
            return None
    
    def calculate_feature_similarity(self, 
                                   features1: np.ndarray, 
                                   features2: np.ndarray) -> float:
        """Calculate similarity between feature vectors"""
        
        try:
            # Ensure same shape
            if features1.shape != features2.shape:
                return 0.0
            
            # Flatten if needed
            if features1.ndim > 1:
                features1 = features1.flatten()
                features2 = features2.flatten()
            
            # Calculate cosine similarity
            dot_product = np.dot(features1, features2)
            norm1 = np.linalg.norm(features1)
            norm2 = np.linalg.norm(features2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            similarity = dot_product / (norm1 * norm2)
            
            # Convert to 0-1 range
            return (similarity + 1) / 2
            
        except Exception as e:
            self.logger.error(f"Error calculating similarity: {e}")
            return 0.0
    
    async def store_feature_vector(self, 
                                 cache_key: str, 
                                 features: np.ndarray, 
                                 ttl: int):
        """Store feature vector for similarity matching"""
        
        try:
            # Extract model name from cache key
            model_name = cache_key.split(':')[1] if ':' in cache_key else 'unknown'
            
            # Create similarity key
            similarity_key = f"{self.prefixes['similarity']}{model_name}:{cache_key.split(':')[-1]}"
            
            # Serialize features
            serialized_features = pickle.dumps(features)
            
            # Store with same TTL as prediction
            self.redis_client.setex(similarity_key, ttl, serialized_features)
            
        except Exception as e:
            self.logger.error(f"Error storing feature vector: {e}")
    
    async def should_evict_cache(self) -> bool:
        """Check if cache eviction is needed"""
        
        try:
            # Get current cache size
            current_size_mb = self.cache_stats['size_bytes'] / (1024 * 1024)
            
            return current_size_mb > self.max_cache_size
            
        except Exception as e:
            self.logger.error(f"Error checking cache size: {e}")
            return False
    
    async def evict_cache_entries(self):
        """Evict cache entries using LRU strategy"""
        
        try:
            # Get all prediction keys
            prediction_keys = self.redis_client.keys(f"{self.prefixes['prediction']}*")
            
            if not prediction_keys:
                return
            
            # Get metadata for each key (last access time, size, etc.)
            key_metadata = []
            
            for key in prediction_keys[:1000]:  # Limit for performance
                try:
                    # Get TTL as proxy for age
                    ttl = self.redis_client.ttl(key)
                    if ttl > 0:
                        # Get hit count from metadata
                        hit_count = await self.get_cache_hit_count(key.decode('utf-8'))
                        
                        key_metadata.append({
                            'key': key,
                            'score': hit_count / max(ttl, 1),  # Hits per remaining TTL
                            'ttl': ttl
                        })
                
                except Exception as e:
                    self.logger.debug(f"Error getting metadata for key {key}: {e}")
            
            # Sort by score (lowest first = candidates for eviction)
            key_metadata.sort(key=lambda x: x['score'])
            
            # Evict bottom 20% of keys
            eviction_count = max(1, len(key_metadata) // 5)
            
            for i in range(eviction_count):
                key = key_metadata[i]['key']
                self.redis_client.delete(key)
                
                # Also delete corresponding similarity key
                similarity_key = key.decode('utf-8').replace(
                    self.prefixes['prediction'], 
                    self.prefixes['similarity']
                )
                self.redis_client.delete(similarity_key)
                
                self.cache_stats['evictions'] += 1
            
            self.logger.info(f"Evicted {eviction_count} cache entries")
            
        except Exception as e:
            self.logger.error(f"Error during cache eviction: {e}")
    
    async def update_cache_hit(self, cache_key: str):
        """Update cache hit count"""
        
        try:
            hit_key = f"{self.prefixes['metadata']}hits:{cache_key}"
            self.redis_client.incr(hit_key)
            self.redis_client.expire(hit_key, self.default_ttl * 2)  # Longer TTL for metadata
            
        except Exception as e:
            self.logger.error(f"Error updating cache hit: {e}")
    
    async def get_cache_hit_count(self, cache_key: str) -> int:
        """Get cache hit count"""
        
        try:
            hit_key = f"{self.prefixes['metadata']}hits:{cache_key}"
            count = self.redis_client.get(hit_key)
            return int(count) if count else 0
            
        except Exception as e:
            self.logger.error(f"Error getting cache hit count: {e}")
            return 0
    
    async def update_cache_size(self, size_bytes: int):
        """Update cache size tracking"""
        self.cache_stats['size_bytes'] += size_bytes
    
    async def invalidate_cache(self, 
                             model_name: str = None,
                             symbol: str = None,
                             pattern: str = None):
        """Invalidate cache entries"""
        
        try:
            if pattern:
                # Use custom pattern
                keys_to_delete = self.redis_client.keys(pattern)
            elif model_name and symbol:
                # Invalidate specific model-symbol combination
                pattern = f"{self.prefixes['prediction']}*{model_name}*{symbol}*"
                keys_to_delete = self.redis_client.keys(pattern)
            elif model_name:
                # Invalidate all entries for a model
                pattern = f"{self.prefixes['prediction']}*{model_name}*"
                keys_to_delete = self.redis_client.keys(pattern)
            else:
                # Invalidate all predictions
                keys_to_delete = self.redis_client.keys(f"{self.prefixes['prediction']}*")
            
            if keys_to_delete:
                # Delete in batches for performance
                batch_size = 1000
                for i in range(0, len(keys_to_delete), batch_size):
                    batch = keys_to_delete[i:i+batch_size]
                    self.redis_client.delete(*batch)
                
                self.logger.info(f"Invalidated {len(keys_to_delete)} cache entries")
            
        except Exception as e:
            self.logger.error(f"Error invalidating cache: {e}")
    
    async def warm_cache(self, 
                       symbols: List[str],
                       models: List[str],
                       feature_generator_func):
        """Warm cache with predictions for common requests"""
        
        try:
            self.logger.info("Starting cache warming...")
            
            for symbol in symbols:
                for model_name in models:
                    try:
                        # Generate representative features
                        features = await feature_generator_func(symbol)
                        
                        # Check if already cached
                        cache_key = self.generate_cache_key(features, model_name, symbol)
                        if self.redis_client.exists(cache_key):
                            continue
                        
                        # This would integrate with your prediction service
                        # For now, we'll skip actual prediction
                        self.logger.debug(f"Would warm cache for {symbol}-{model_name}")
                        
                    except Exception as e:
                        self.logger.error(f"Error warming cache for {symbol}-{model_name}: {e}")
            
            self.logger.info("Cache warming completed")
            
        except Exception as e:
            self.logger.error(f"Error during cache warming: {e}")
    
    def get_cache_statistics(self) -> Dict[str, Any]:
        """Get comprehensive cache statistics"""
        
        try:
            # Calculate hit rate
            total_requests = self.cache_stats['hits'] + self.cache_stats['misses']
            hit_rate = self.cache_stats['hits'] / max(total_requests, 1)
            
            # Get Redis info
            redis_info = self.redis_client.info('memory')
            
            # Count cache entries
            total_entries = len(self.redis_client.keys(f"{self.prefixes['prediction']}*"))
            
            return {
                'cache_stats': self.cache_stats,
                'hit_rate': hit_rate,
                'total_entries': total_entries,
                'redis_memory_usage': redis_info.get('used_memory_human', 'unknown'),
                'cache_strategy': self.cache_strategy,
                'similarity_threshold': self.similarity_threshold,
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            self.logger.error(f"Error getting cache statistics: {e}")
            return {'error': str(e)}
    
    async def cleanup_expired_entries(self):
        """Clean up expired cache entries"""
        
        try:
            # Get all prediction keys
            prediction_keys = self.redis_client.keys(f"{self.prefixes['prediction']}*")
            
            expired_count = 0
            for key in prediction_keys:
                if self.redis_client.ttl(key) == -2:  # Key expired
                    # Clean up associated similarity and metadata keys
                    similarity_key = key.decode('utf-8').replace(
                        self.prefixes['prediction'], 
                        self.prefixes['similarity']
                    )
                    metadata_key = f"{self.prefixes['metadata']}hits:{key.decode('utf-8')}"
                    
                    self.redis_client.delete(similarity_key, metadata_key)
                    expired_count += 1
            
            if expired_count > 0:
                self.logger.info(f"Cleaned up {expired_count} expired cache entries")
                
        except Exception as e:
            self.logger.error(f"Error cleaning up expired entries: {e}")

# Example usage
if __name__ == "__main__":
    import logging
    logging.basicConfig(level=logging.INFO)
    
    # Example configuration
    config = {
        'redis': {
            'host': 'localhost',
            'port': 6379,
            'password': None
        },
        'default_ttl': 300,  # 5 minutes
        'max_cache_size_mb': 1000,  # 1GB
        'compression_enabled': True,
        'compression_threshold': 1000,  # bytes
        'cache_strategy': 'intelligent',
        'similarity_threshold': 0.95
    }
    
    # Create cache instance
    cache = IntelligentPredictionCache(config)
    
    # Example usage
    async def example():
        # Example features and prediction
        features = np.random.rand(10)
        prediction = {'value': 42.0, 'confidence': 0.95}
        
        # Cache a prediction
        await cache.cache_prediction(
            features=features,
            model_name='test_model',
            prediction=prediction,
            symbol='AAPL',
            ttl=300
        )
        
        # Retrieve from cache
        cached = await cache.get_prediction(
            features=features,
            model_name='test_model',
            symbol='AAPL'
        )
        
        print(f"Cached prediction: {cached}")
        
        # Get cache statistics
        stats = cache.get_cache_statistics()
        print(f"Cache stats: {stats}")
    
    # Run the example
    import asyncio
    asyncio.run(example())
