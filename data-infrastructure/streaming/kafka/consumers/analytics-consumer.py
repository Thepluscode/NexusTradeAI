# data-infrastructure/streaming/kafka/consumers/analytics-consumer.py

import asyncio
import json
import logging
import time
from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
from dataclasses import dataclass
import pandas as pd
import numpy as np
from kafka import KafkaConsumer
from kafka.errors import KafkaError
import redis
import asyncpg
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class MarketAnalytics:
    symbol: str
    timestamp: int
    price: float
    volume: int
    volatility: float
    moving_avg_5: float
    moving_avg_20: float
    rsi: float
    macd: float
    bollinger_upper: float
    bollinger_lower: float
    support_level: float
    resistance_level: float

class TechnicalIndicators:
    """Calculate technical indicators for market data"""
    
    @staticmethod
    def calculate_rsi(prices: List[float], period: int = 14) -> float:
        """Calculate Relative Strength Index"""
        if len(prices) < period + 1:
            return 50.0
        
        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        
        avg_gain = np.mean(gains[-period:])
        avg_loss = np.mean(losses[-period:])
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        return float(rsi)
    
    @staticmethod
    def calculate_macd(prices: List[float], fast: int = 12, slow: int = 26) -> float:
        """Calculate MACD indicator"""
        if len(prices) < slow:
            return 0.0
        
        exp_fast = pd.Series(prices).ewm(span=fast).mean()
        exp_slow = pd.Series(prices).ewm(span=slow).mean()
        macd = exp_fast.iloc[-1] - exp_slow.iloc[-1]
        return float(macd)
    
    @staticmethod
    def calculate_bollinger_bands(prices: List[float], period: int = 20, std_dev: int = 2) -> tuple:
        """Calculate Bollinger Bands"""
        if len(prices) < period:
            price = prices[-1] if prices else 0
            return price, price
        
        sma = np.mean(prices[-period:])
        std = np.std(prices[-period:])
        upper = sma + (std * std_dev)
        lower = sma - (std * std_dev)
        return float(upper), float(lower)
    
    @staticmethod
    def calculate_support_resistance(prices: List[float], window: int = 10) -> tuple:
        """Calculate basic support and resistance levels"""
        if len(prices) < window * 2:
            price = prices[-1] if prices else 0
            return price * 0.98, price * 1.02
        
        recent_prices = prices[-window*2:]
        support = min(recent_prices)
        resistance = max(recent_prices)
        return float(support), float(resistance)

class AnalyticsConsumer:
    def __init__(self,
                 kafka_bootstrap_servers: str = 'localhost:9092',
                 redis_host: str = 'localhost',
                 redis_port: int = 6379,
                 influxdb_url: str = 'http://localhost:8086',
                 influxdb_token: str = None,
                 influxdb_org: str = 'nexus-trade',
                 influxdb_bucket: str = 'market-analytics',
                 postgres_dsn: str = 'postgresql://user:pass@localhost:5432/trading'):
        
        self.kafka_bootstrap_servers = kafka_bootstrap_servers
        self.redis_host = redis_host
        self.redis_port = redis_port
        self.postgres_dsn = postgres_dsn
        
        # Initialize connections
        self.consumer = None
        self.redis_client = None
        self.influx_client = None
        self.postgres_pool = None
        
        # InfluxDB configuration
        self.influxdb_url = influxdb_url
        self.influxdb_token = influxdb_token or os.getenv('INFLUXDB_TOKEN')
        self.influxdb_org = influxdb_org
        self.influxdb_bucket = influxdb_bucket
        
        # Data storage for calculations
        self.price_history: Dict[str, List[float]] = {}
        self.volume_history: Dict[str, List[int]] = {}
        self.max_history_length = 200
        
        self.running = False
        self.indicators = TechnicalIndicators()
    
    async def start(self):
        """Start the analytics consumer"""
        try:
            await self._initialize_connections()
            self.running = True
            
            logger.info("Starting analytics consumer...")
            
            # Create consumer tasks
            tasks = [
                self._consume_market_data(),
                self._consume_trade_data(),
                self._calculate_analytics(),
                self._health_check()
            ]
            
            await asyncio.gather(*tasks, return_exceptions=True)
            
        except Exception as e:
            logger.error(f"Error in analytics consumer: {e}")
        finally:
            await self.stop()
    
    async def stop(self):
        """Stop the analytics consumer"""
        logger.info("Stopping analytics consumer...")
        self.running = False
        
        if self.consumer:
            self.consumer.close()
        
        if self.redis_client:
            await self.redis_client.close()
        
        if self.influx_client:
            self.influx_client.close()
        
        if self.postgres_pool:
            await self.postgres_pool.close()
    
    async def _initialize_connections(self):
        """Initialize all database and messaging connections"""
        # Kafka Consumer
        self.consumer = KafkaConsumer(
            'market-data-realtime',
            'market-data-trades',
            bootstrap_servers=self.kafka_bootstrap_servers,
            value_deserializer=lambda m: json.loads(m.decode('utf-8')),
            key_deserializer=lambda m: m.decode('utf-8') if m else None,
            group_id='analytics-consumer-group',
            auto_offset_reset='latest',
            enable_auto_commit=True,
            auto_commit_interval_ms=1000,
            consumer_timeout_ms=1000
        )
        
        # Redis connection
        self.redis_client = redis.asyncio.Redis(
            host=self.redis_host,
            port=self.redis_port,
            decode_responses=True
        )
        
        # InfluxDB connection
        if self.influxdb_token:
            self.influx_client = InfluxDBClient(
                url=self.influxdb_url,
                token=self.influxdb_token,
                org=self.influxdb_org
            )
        
        # PostgreSQL connection pool
        self.postgres_pool = await asyncpg.create_pool(
            self.postgres_dsn,
            min_size=5,
            max_size=20
        )
        
        logger.info("All connections initialized successfully")
    
    async def _consume_market_data(self):
        """Consume market data messages"""
        while self.running:
            try:
                messages = self.consumer.poll(timeout_ms=1000)
                
                for topic_partition, records in messages.items():
                    for record in records:
                        if record.topic == 'market-data-realtime':
                            await self._process_market_data(record.value)
                        elif record.topic == 'market-data-trades':
                            await self._process_trade_data(record.value)
                
            except Exception as e:
                logger.error(f"Error consuming market data: {e}")
                await asyncio.sleep(1)
    
    async def _consume_trade_data(self):
        """Consume trade execution data for volume analysis"""
        # This would be implemented similarly to market data consumption
        # but focusing on trade volumes and execution patterns
        pass
    
    async def _process_market_data(self, data: Dict[str, Any]):
        """Process individual market data point"""
        try:
            symbol = data.get('symbol')
            price = float(data.get('price', 0))
            volume = int(data.get('volume', 0))
            timestamp = int(data.get('timestamp', time.time() * 1000))
            
            if not symbol or price <= 0:
                return
            
            # Update price history
            if symbol not in self.price_history:
                self.price_history[symbol] = []
                self.volume_history[symbol] = []
            
            self.price_history[symbol].append(price)
            self.volume_history[symbol].append(volume)
            
            # Maintain history length
            if len(self.price_history[symbol]) > self.max_history_length:
                self.price_history[symbol] = self.price_history[symbol][-self.max_history_length:]
                self.volume_history[symbol] = self.volume_history[symbol][-self.max_history_length:]
            
            # Store real-time data in Redis
            await self._store_realtime_data(symbol, data)
            
        except Exception as e:
            logger.error(f"Error processing market data: {e}")
    
    async def _process_trade_data(self, data: Dict[str, Any]):
        """Process trade execution data"""
        try:
            symbol = data.get('symbol')
            price = float(data.get('price', 0))
            size = int(data.get('size', 0))
            timestamp = int(data.get('timestamp', time.time() * 1000))
            
            # Calculate trade analytics
            trade_analytics = {
                'symbol': symbol,
                'price': price,
                'size': size,
                'timestamp': timestamp,
                'value': price * size
            }
            
            # Store in Redis for real-time access
            await self.redis_client.lpush(
                f"trades:{symbol}",
                json.dumps(trade_analytics)
            )
            
            # Keep only recent trades (last 1000)
            await self.redis_client.ltrim(f"trades:{symbol}", 0, 999)
            
        except Exception as e:
            logger.error(f"Error processing trade data: {e}")
    
    async def _calculate_analytics(self):
        """Calculate technical indicators and analytics"""
        while self.running:
            try:
                for symbol in list(self.price_history.keys()):
                    if len(self.price_history[symbol]) >= 20:  # Minimum for calculations
                        analytics = await self._compute_symbol_analytics(symbol)
                        if analytics:
                            await self._store_analytics(analytics)
                
                await asyncio.sleep(5)  # Calculate every 5 seconds
                
            except Exception as e:
                logger.error(f"Error calculating analytics: {e}")
                await asyncio.sleep(5)
    
    async def _compute_symbol_analytics(self, symbol: str) -> Optional[MarketAnalytics]:
        """Compute analytics for a specific symbol"""
        try:
            prices = self.price_history[symbol]
            volumes = self.volume_history[symbol]
            
            if len(prices) < 20:
                return None
            
            current_price = prices[-1]
            current_volume = volumes[-1]
            
            # Calculate indicators
            volatility = float(np.std(prices[-20:]) / np.mean(prices[-20:]))
            moving_avg_5 = float(np.mean(prices[-5:]))
            moving_avg_20 = float(np.mean(prices[-20:]))
            rsi = self.indicators.calculate_rsi(prices)
            macd = self.indicators.calculate_macd(prices)
            bollinger_upper, bollinger_lower = self.indicators.calculate_bollinger_bands(prices)
            support_level, resistance_level = self.indicators.calculate_support_resistance(prices)
            
            analytics = MarketAnalytics(
                symbol=symbol,
                timestamp=int(time.time() * 1000),
                price=current_price,
                volume=current_volume,
                volatility=volatility,
                moving_avg_5=moving_avg_5,
                moving_avg_20=moving_avg_20,
                rsi=rsi,
                macd=macd,
                bollinger_upper=bollinger_upper,
                bollinger_lower=bollinger_lower,
                support_level=support_level,
                resistance_level=resistance_level
            )
            
            return analytics
            
        except Exception as e:
            logger.error(f"Error computing analytics for {symbol}: {e}")
            return None
    
    async def _store_realtime_data(self, symbol: str, data: Dict[str, Any]):
        """Store real-time data in Redis"""
        try:
            # Store latest price
            await self.redis_client.hset(
                f"market:{symbol}",
                mapping={
                    'price': data.get('price', 0),
                    'volume': data.get('volume', 0),
                    'timestamp': data.get('timestamp', time.time() * 1000),
                    'bid': data.get('bid', 0),
                    'ask': data.get('ask', 0)
                }
            )
            
            # Set expiration
            await self.redis_client.expire(f"market:{symbol}", 3600)  # 1 hour
            
        except Exception as e:
            logger.error(f"Error storing real-time data: {e}")
    
    async def _store_analytics(self, analytics: MarketAnalytics):
        """Store analytics in both InfluxDB and PostgreSQL"""
        try:
            # Store in InfluxDB for time-series analysis
            if self.influx_client:
                await self._store_influxdb_analytics(analytics)
            
            # Store in PostgreSQL for complex queries
            if self.postgres_pool:
                await self._store_postgres_analytics(analytics)
            
            # Store in Redis for real-time access
            await self._store_redis_analytics(analytics)
            
        except Exception as e:
            logger.error(f"Error storing analytics: {e}")
    
    async def _store_influxdb_analytics(self, analytics: MarketAnalytics):
        """Store analytics in InfluxDB"""
        try:
            write_api = self.influx_client.write_api(write_options=SYNCHRONOUS)
            
            point = Point("market_analytics") \
                .tag("symbol", analytics.symbol) \
                .field("price", analytics.price) \
                .field("volume", analytics.volume) \
                .field("volatility", analytics.volatility) \
                .field("moving_avg_5", analytics.moving_avg_5) \
                .field("moving_avg_20", analytics.moving_avg_20) \
                .field("rsi", analytics.rsi) \
                .field("macd", analytics.macd) \
                .field("bollinger_upper", analytics.bollinger_upper) \
                .field("bollinger_lower", analytics.bollinger_lower) \
                .field("support_level", analytics.support_level) \
                .field("resistance_level", analytics.resistance_level) \
                .time(analytics.timestamp, 'ms')
            
            write_api.write(bucket=self.influxdb_bucket, record=point)
            
        except Exception as e:
            logger.error(f"Error storing to InfluxDB: {e}")
    
    async def _store_postgres_analytics(self, analytics: MarketAnalytics):
        """Store analytics in PostgreSQL"""
        try:
            async with self.postgres_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO market_analytics (
                        symbol, timestamp, price, volume, volatility,
                        moving_avg_5, moving_avg_20, rsi, macd,
                        bollinger_upper, bollinger_lower,
                        support_level, resistance_level
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                    ON CONFLICT (symbol, timestamp) DO UPDATE SET
                        price = EXCLUDED.price,
                        volume = EXCLUDED.volume,
                        volatility = EXCLUDED.volatility,
                        moving_avg_5 = EXCLUDED.moving_avg_5,
                        moving_avg_20 = EXCLUDED.moving_avg_20,
                        rsi = EXCLUDED.rsi,
                        macd = EXCLUDED.macd,
                        bollinger_upper = EXCLUDED.bollinger_upper,
                        bollinger_lower = EXCLUDED.bollinger_lower,
                        support_level = EXCLUDED.support_level,
                        resistance_level = EXCLUDED.resistance_level
                """,
                    analytics.symbol,
                    datetime.fromtimestamp(analytics.timestamp / 1000, tz=timezone.utc),
                    analytics.price,
                    analytics.volume,
                    analytics.volatility,
                    analytics.moving_avg_5,
                    analytics.moving_avg_20,
                    analytics.rsi,
                    analytics.macd,
                    analytics.bollinger_upper,
                    analytics.bollinger_lower,
                    analytics.support_level,
                    analytics.resistance_level
                )
                
        except Exception as e:
            logger.error(f"Error storing to PostgreSQL: {e}")
    
    async def _store_redis_analytics(self, analytics: MarketAnalytics):
        """Store analytics in Redis for real-time access"""
        try:
            analytics_data = {
                'price': analytics.price,
                'volume': analytics.volume,
                'volatility': analytics.volatility,
                'moving_avg_5': analytics.moving_avg_5,
                'moving_avg_20': analytics.moving_avg_20,
                'rsi': analytics.rsi,
                'macd': analytics.macd,
                'bollinger_upper': analytics.bollinger_upper,
                'bollinger_lower': analytics.bollinger_lower,
                'support_level': analytics.support_level,
                'resistance_level': analytics.resistance_level,
                'timestamp': analytics.timestamp
            }
            
            await self.redis_client.hset(
                f"analytics:{analytics.symbol}",
                mapping=analytics_data
            )
            
            # Set expiration
            await self.redis_client.expire(f"analytics:{analytics.symbol}", 3600)
            
        except Exception as e:
            logger.error(f"Error storing to Redis: {e}")
    
    async def _health_check(self):
        """Periodic health check"""
        while self.running:
            try:
                # Check Redis connection
                await self.redis_client.ping()
                
                # Check PostgreSQL connection
                if self.postgres_pool:
                    async with self.postgres_pool.acquire() as conn:
                        await conn.fetchval("SELECT 1")
                
                # Check InfluxDB connection
                if self.influx_client:
                    self.influx_client.health()
                
                logger.debug("Health check passed")
                await asyncio.sleep(30)
                
            except Exception as e:
                logger.error(f"Health check failed: {e}")
                await asyncio.sleep(30)

async def main():
    """Main function to run the analytics consumer"""
    consumer = AnalyticsConsumer()
    
    try:
        await consumer.start()
    except KeyboardInterrupt:
        logger.info("Received interrupt signal")
    finally:
        await consumer.stop()

if __name__ == "__main__":
    asyncio.run(main())