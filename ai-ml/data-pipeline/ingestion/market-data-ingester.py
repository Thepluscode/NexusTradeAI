import asyncio
import aiohttp
import pandas as pd
import numpy as np
from kafka import KafkaProducer
import json
import logging
from typing import Dict, List, Any
from datetime import datetime
import websockets
import redis
from dataclasses import dataclass

@dataclass
class MarketDataPoint:
    """Market data point structure"""
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    bid: float = None
    ask: float = None
    bid_size: int = None
    ask_size: int = None

class MarketDataIngester:
    """
    High-performance market data ingestion system
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize market data ingester
        
        Args:
            config: Configuration dictionary
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Initialize Kafka producer
        self.kafka_producer = KafkaProducer(
            bootstrap_servers=config['kafka']['bootstrap_servers'],
            value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
            compression_type='gzip',
            batch_size=16384,
            linger_ms=10
        )
        
        # Initialize Redis client
        self.redis_client = redis.Redis(
            host=config['redis']['host'],
            port=config['redis']['port'],
            password=config['redis']['password'],
            decode_responses=True
        )
        
        # Data providers configuration
        self.providers = config['data_providers']
        self.symbols = config['symbols']
        
        # Rate limiting
        self.rate_limits = {}
        
    async def ingest_real_time_data(self):
        """Start real-time data ingestion from multiple providers"""
        tasks = []
        
        # Create tasks for each provider
        for provider_name, provider_config in self.providers.items():
            if provider_config.get('enabled', False):
                if provider_config['type'] == 'websocket':
                    task = asyncio.create_task(
                        self.websocket_ingestion(provider_name, provider_config)
                    )
                elif provider_config['type'] == 'rest_polling':
                    task = asyncio.create_task(
                        self.rest_polling_ingestion(provider_name, provider_config)
                    )
                tasks.append(task)
        
        # Wait for all tasks
        await asyncio.gather(*tasks)
    
    async def websocket_ingestion(self, provider_name: str, config: Dict):
        """
        Ingest data via WebSocket connection
        
        Args:
            provider_name: Name of data provider
            config: Provider configuration
        """
        uri = config['websocket_url']
        
        while True:
            try:
                async with websockets.connect(uri) as websocket:
                    self.logger.info(f"Connected to {provider_name} WebSocket")
                    
                    # Subscribe to symbols
                    subscribe_msg = self.build_subscribe_message(config, self.symbols)
                    await websocket.send(json.dumps(subscribe_msg))
                    
                    # Listen for messages
                    async for message in websocket:
                        try:
                            data = json.loads(message)
                            await self.process_market_data(provider_name, data)
                        except json.JSONDecodeError:
                            self.logger.warning(f"Invalid JSON from {provider_name}: {message}")
                        except Exception as e:
                            self.logger.error(f"Error processing data from {provider_name}: {e}")
                            
            except Exception as e:
                self.logger.error(f"WebSocket connection error for {provider_name}: {e}")
                await asyncio.sleep(5)  # Wait before reconnecting
    
    async def rest_polling_ingestion(self, provider_name: str, config: Dict):
        """
        Ingest data via REST API polling
        
        Args:
            provider_name: Name of data provider
            config: Provider configuration
        """
        session = aiohttp.ClientSession()
        
        try:
            while True:
                for symbol in self.symbols:
                    if await self.check_rate_limit(provider_name):
                        url = config['rest_url'].format(symbol=symbol)
                        headers = config.get('headers', {})
                        
                        try:
                            async with session.get(url, headers=headers) as response:
                                if response.status == 200:
                                    data = await response.json()
                                    await self.process_market_data(provider_name, data, symbol)
                                else:
                                    self.logger.warning(
                                        f"HTTP {response.status} from {provider_name} for {symbol}"
                                    )
                        except Exception as e:
                            self.logger.error(f"Error fetching {symbol} from {provider_name}: {e}")
                
                await asyncio.sleep(config.get('poll_interval', 1))
                
        finally:
            await session.close()
    
    async def process_market_data(self, provider_name: str, raw_data: Dict, symbol: str = None):
        """
        Process and normalize market data from different providers
        
        Args:
            provider_name: Name of data provider
            raw_data: Raw data from provider
            symbol: Symbol (for REST API)
        """
        try:
            # Normalize data based on provider format
            normalized_data = self.normalize_provider_data(provider_name, raw_data, symbol)
            
            if normalized_data:
                # Validate data quality
                if self.validate_data_quality(normalized_data):
                    # Store in Redis for real-time access
                    await self.store_real_time_data(normalized_data)
                    
                    # Send to Kafka for downstream processing
                    await self.send_to_kafka(normalized_data)
                    
                    # Update data quality metrics
                    self.update_quality_metrics(provider_name, normalized_data)
                else:
                    self.logger.warning(f"Data quality check failed for {provider_name}")
                    
        except Exception as e:
            self.logger.error(f"Error processing market data: {e}")
    
    def normalize_provider_data(self, provider_name: str, raw_data: Dict, symbol: str = None) -> List[MarketDataPoint]:
        """
        Normalize data from different providers to common format
        
        Args:
            provider_name: Name of data provider
            raw_data: Raw data from provider
            symbol: Symbol (for REST API)
            
        Returns:
            List of normalized MarketDataPoint objects
        """
        normalized_data = []
        
        try:
            if provider_name == 'alpha_vantage':
                # Alpha Vantage format
                if 'Time Series (1min)' in raw_data:
                    time_series = raw_data['Time Series (1min)']
                    for timestamp, data in time_series.items():
                        point = MarketDataPoint(
                            symbol=symbol,
                            timestamp=datetime.strptime(timestamp, '%Y-%m-%d %H:%M:%S'),
                            open=float(data['1. open']),
                            high=float(data['2. high']),
                            low=float(data['3. low']),
                            close=float(data['4. close']),
                            volume=int(data['5. volume'])
                        )
                        normalized_data.append(point)
            
            elif provider_name == 'polygon':
                # Polygon.io format
                if 'results' in raw_data:
                    for result in raw_data['results']:
                        point = MarketDataPoint(
                            symbol=result.get('T', symbol),
                            timestamp=datetime.fromtimestamp(result['t'] / 1000),
                            open=result['o'],
                            high=result['h'],
                            low=result['l'],
                            close=result['c'],
                            volume=result['v']
                        )
                        normalized_data.append(point)
            
            elif provider_name == 'iex_cloud':
                # IEX Cloud format
                if isinstance(raw_data, list):
                    for item in raw_data:
                        point = MarketDataPoint(
                            symbol=item.get('symbol', symbol),
                            timestamp=datetime.fromisoformat(item['date'].replace('Z', '+00:00')),
                            open=item['open'],
                            high=item['high'],
                            low=item['low'],
                            close=item['close'],
                            volume=item['volume']
                        )
                        normalized_data.append(point)
            
            elif provider_name == 'binance':
                # Binance WebSocket format
                if 'k' in raw_data:  # Kline data
                    kline = raw_data['k']
                    point = MarketDataPoint(
                        symbol=kline['s'],
                        timestamp=datetime.fromtimestamp(kline['t'] / 1000),
                        open=float(kline['o']),
                        high=float(kline['h']),
                        low=float(kline['l']),
                        close=float(kline['c']),
                        volume=int(float(kline['v']))
                    )
                    normalized_data.append(point)
            
            # Add more providers as needed
            
        except Exception as e:
            self.logger.error(f"Error normalizing data from {provider_name}: {e}")
        
        return normalized_data
    
    def validate_data_quality(self, data_points: List[MarketDataPoint]) -> bool:
        """
        Validate data quality and detect anomalies
        
        Args:
            data_points: List of market data points
            
        Returns:
            True if data passes quality checks
        """
        for point in data_points:
            # Basic validation
            if point.open <= 0 or point.high <= 0 or point.low <= 0 or point.close <= 0:
                return False
            
            if point.volume < 0:
                return False
            
            # Price relationship validation
            if not (point.low <= point.open <= point.high):
                return False
            if not (point.low <= point.close <= point.high):
                return False
            
            # Spike detection (price change > 20% in 1 minute)
            price_change = abs(point.close - point.open) / point.open
            if price_change > 0.2:
                self.logger.warning(f"Large price spike detected for {point.symbol}: {price_change:.2%}")
                # Don't reject, but log for investigation
        
        return True
    
    async def store_real_time_data(self, data_points: List[MarketDataPoint]):
        """
        Store data in Redis for real-time access
        
        Args:
            data_points: List of market data points
        """
        for point in data_points:
            key = f"market_data:{point.symbol}:latest"
            data = {
                'timestamp': point.timestamp.isoformat(),
                'open': point.open,
                'high': point.high,
                'low': point.low,
                'close': point.close,
                'volume': point.volume,
                'bid': point.bid,
                'ask': point.ask
            }
            
            # Store latest data with expiration
            self.redis_client.setex(key, 300, json.dumps(data))  # 5 minute expiration
            
            # Add to time series for recent history
            ts_key = f"market_data:{point.symbol}:timeseries"
            self.redis_client.zadd(
                ts_key, 
                {json.dumps(data): point.timestamp.timestamp()}
            )
            
            # Keep only last hour of data
            cutoff = datetime.now().timestamp() - 3600
            self.redis_client.zremrangebyscore(ts_key, 0, cutoff)
    
    async def send_to_kafka(self, data_points: List[MarketDataPoint]):
        """
        Send data to Kafka for downstream processing
        
        Args:
            data_points: List of market data points
        """
        for point in data_points:
            message = {
                'symbol': point.symbol,
                'timestamp': point.timestamp.isoformat(),
                'open': point.open,
                'high': point.high,
                'low': point.low,
                'close': point.close,
                'volume': point.volume,
                'bid': point.bid,
                'ask': point.ask,
                'bid_size': point.bid_size,
                'ask_size': point.ask_size
            }
            
            # Send to market data topic
            self.kafka_producer.send(
                'market_data',
                value=message,
                key=point.symbol.encode('utf-8')
            )
            
            # Send to symbol-specific topic for targeted consumption
            self.kafka_producer.send(
                f'market_data_{point.symbol}',
                value=message
            )
    
    def build_subscribe_message(self, config: Dict, symbols: List[str]) -> Dict:
        """
        Build subscription message for WebSocket providers
        
        Args:
            config: Provider configuration
            symbols: List of symbols to subscribe to
            
        Returns:
            Subscription message dictionary
        """
        if config.get('provider') == 'binance':
            # Binance WebSocket subscription format
            streams = [f"{symbol.lower()}@kline_1m" for symbol in symbols]
            return {
                "method": "SUBSCRIBE",
                "params": streams,
                "id": 1
            }
        
        # Default format
        return {
            "action": "subscribe",
            "symbols": symbols
        }
    
    async def check_rate_limit(self, provider_name: str) -> bool:
        """
        Check if we can make a request without hitting rate limits
        
        Args:
            provider_name: Name of data provider
            
        Returns:
            True if request is allowed
        """
        now = datetime.now().timestamp()
        rate_limit_key = f"rate_limit:{provider_name}"
        
        # Get current request count
        current_count = self.redis_client.get(rate_limit_key) or 0
        current_count = int(current_count)
        
        # Check against provider limits
        provider_config = self.providers[provider_name]
        max_requests = provider_config.get('rate_limit', 100)
        window = provider_config.get('rate_limit_window', 60)
        
        if current_count >= max_requests:
            return False
        
        # Increment counter
        pipe = self.redis_client.pipeline()
        pipe.incr(rate_limit_key)
        pipe.expire(rate_limit_key, window)
        pipe.execute()
        
        return True
    
    def update_quality_metrics(self, provider_name: str, data_points: List[MarketDataPoint]):
        """
        Update data quality metrics for monitoring
        
        Args:
            provider_name: Name of data provider
            data_points: List of data points processed
        """
        metrics_key = f"metrics:{provider_name}"
        
        # Update counters
        self.redis_client.hincrby(metrics_key, 'total_points', len(data_points))
        self.redis_client.hincrby(metrics_key, 'successful_ingestions', 1)
        self.redis_client.hset(metrics_key, 'last_update', datetime.now().isoformat())
        
        # Set expiration
        self.redis_client.expire(metrics_key, 86400)  # 24 hours