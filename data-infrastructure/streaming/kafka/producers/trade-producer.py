#!/usr/bin/env python3
"""
Trade Producer for Nexus Trade AI
Streams trade execution data to Kafka topics with guaranteed delivery and ordering.
"""

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from decimal import Decimal
import uuid

import aiokafka
from kafka.errors import KafkaError
import avro.schema
from avro.io import DatumWriter, BinaryEncoder
from io import BytesIO

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class TradeExecution:
    """Trade execution data structure"""
    trade_id: str
    order_id: str
    user_id: str
    symbol: str
    exchange: str
    side: str  # 'buy' or 'sell'
    quantity: float
    price: float
    executed_quantity: float
    executed_price: float
    commission: float
    commission_asset: str
    timestamp: int
    execution_timestamp: int
    status: str  # 'filled', 'partial', 'cancelled', 'rejected'
    order_type: str  # 'market', 'limit', 'stop', 'stop_limit'
    time_in_force: str  # 'GTC', 'IOC', 'FOK'
    metadata: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}
        if not self.trade_id:
            self.trade_id = str(uuid.uuid4())
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        return asdict(self)

class TradeProducer:
    """High-performance trade data producer with guaranteed delivery"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.producer = None
        self.running = False
        self.trade_queue = asyncio.Queue(maxsize=50000)
        self.stats = {
            'trades_sent': 0,
            'errors': 0,
            'start_time': time.time(),
            'last_trade_time': None
        }
        
    async def initialize(self):
        """Initialize Kafka producer"""
        try:
            self.producer = aiokafka.AIOKafkaProducer(
                bootstrap_servers=self.config['kafka']['bootstrap_servers'],
                value_serializer=lambda v: json.dumps(v, default=str).encode('utf-8'),
                key_serializer=lambda k: k.encode('utf-8') if k else None,
                acks='all',  # Wait for all replicas
                retries=10,
                max_in_flight_requests_per_connection=1,  # Ensure ordering
                enable_idempotence=True,
                compression_type='snappy',
                batch_size=32768,
                linger_ms=5,
                request_timeout_ms=30000,
                delivery_timeout_ms=120000
            )
            
            await self.producer.start()
            logger.info("Trade producer initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize trade producer: {e}")
            raise
    
    async def send_trade(self, trade: TradeExecution) -> bool:
        """Send trade execution to Kafka with guaranteed delivery"""
        try:
            # Use user_id as partition key to ensure ordering per user
            partition_key = trade.user_id
            
            # Determine topic based on trade type
            topic = self._get_topic_for_trade(trade)
            
            # Send to Kafka
            future = await self.producer.send(
                topic=topic,
                value=trade.to_dict(),
                key=partition_key,
                timestamp_ms=trade.execution_timestamp
            )
            
            # Update statistics
            self.stats['trades_sent'] += 1
            self.stats['last_trade_time'] = time.time()
            
            logger.debug(f"Trade {trade.trade_id} sent to topic {topic}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send trade {trade.trade_id}: {e}")
            self.stats['errors'] += 1
            return False
    
    def _get_topic_for_trade(self, trade: TradeExecution) -> str:
        """Determine appropriate topic based on trade characteristics"""
        base_topic = self.config.get('base_topic', 'trades')
        
        # Route based on exchange or asset type
        if 'crypto' in trade.exchange.lower():
            return f"{base_topic}-crypto"
        elif 'stock' in trade.exchange.lower() or trade.exchange.upper() in ['NYSE', 'NASDAQ']:
            return f"{base_topic}-stocks"
        elif 'forex' in trade.exchange.lower() or 'fx' in trade.exchange.lower():
            return f"{base_topic}-forex"
        else:
            return f"{base_topic}-general"
    
    async def start_processing(self):
        """Start processing trade queue"""
        self.running = True
        logger.info("Starting trade processing...")
        
        while self.running:
            try:
                # Get trade from queue with timeout
                trade = await asyncio.wait_for(
                    self.trade_queue.get(), 
                    timeout=1.0
                )
                
                # Send trade with retry logic
                success = await self._send_with_retry(trade)
                
                if success:
                    self.trade_queue.task_done()
                else:
                    # Put back in queue for retry
                    await self.trade_queue.put(trade)
                    await asyncio.sleep(1)
                    
            except asyncio.TimeoutError:
                # No trades in queue, continue
                continue
            except Exception as e:
                logger.error(f"Error in trade processing: {e}")
                await asyncio.sleep(1)
    
    async def _send_with_retry(self, trade: TradeExecution, max_retries: int = 3) -> bool:
        """Send trade with exponential backoff retry"""
        for attempt in range(max_retries):
            try:
                success = await self.send_trade(trade)
                if success:
                    return True
                    
                # Wait before retry
                wait_time = 2 ** attempt
                await asyncio.sleep(wait_time)
                
            except Exception as e:
                logger.warning(f"Retry {attempt + 1} failed for trade {trade.trade_id}: {e}")
                if attempt == max_retries - 1:
                    logger.error(f"Failed to send trade {trade.trade_id} after {max_retries} attempts")
                    return False
                    
                wait_time = 2 ** attempt
                await asyncio.sleep(wait_time)
        
        return False
    
    async def queue_trade(self, trade: TradeExecution):
        """Queue trade for processing"""
        try:
            await self.trade_queue.put(trade)
            logger.debug(f"Trade {trade.trade_id} queued for processing")
        except Exception as e:
            logger.error(f"Failed to queue trade {trade.trade_id}: {e}")
            raise
    
    async def flush(self):
        """Flush all pending trades"""
        if self.producer:
            await self.producer.flush()
            logger.info("All pending trades flushed")
    
    async def stop(self):
        """Stop the trade producer gracefully"""
        self.running = False
        
        # Wait for queue to empty
        await self.trade_queue.join()
        
        # Flush remaining messages
        await self.flush()
        
        # Stop producer
        if self.producer:
            await self.producer.stop()
        
        logger.info("Trade producer stopped")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get producer statistics"""
        uptime = time.time() - self.stats['start_time']
        trades_per_second = self.stats['trades_sent'] / uptime if uptime > 0 else 0
        
        return {
            **self.stats,
            'queue_size': self.trade_queue.qsize(),
            'uptime_seconds': uptime,
            'trades_per_second': trades_per_second,
            'running': self.running
        }

# Example usage
async def example_usage():
    """Example usage of TradeProducer"""
    config = {
        'kafka': {
            'bootstrap_servers': ['localhost:9092']
        },
        'base_topic': 'trades'
    }
    
    producer = TradeProducer(config)
    await producer.initialize()
    
    # Start processing in background
    processing_task = asyncio.create_task(producer.start_processing())
    
    try:
        # Create sample trades
        for i in range(10):
            trade = TradeExecution(
                trade_id=f"trade_{i}",
                order_id=f"order_{i}",
                user_id=f"user_{i % 3}",  # 3 different users
                symbol="BTC/USDT",
                exchange="binance",
                side="buy" if i % 2 == 0 else "sell",
                quantity=1.0,
                price=50000.0 + i * 100,
                executed_quantity=1.0,
                executed_price=50000.0 + i * 100,
                commission=0.1,
                commission_asset="USDT",
                timestamp=int(time.time() * 1000),
                execution_timestamp=int(time.time() * 1000),
                status="filled",
                order_type="market",
                time_in_force="IOC"
            )
            
            await producer.queue_trade(trade)
            await asyncio.sleep(0.1)
        
        # Wait a bit for processing
        await asyncio.sleep(2)
        
        # Print stats
        print(f"Producer stats: {producer.get_stats()}")
        
    finally:
        await producer.stop()
        processing_task.cancel()

if __name__ == "__main__":
    asyncio.run(example_usage())
