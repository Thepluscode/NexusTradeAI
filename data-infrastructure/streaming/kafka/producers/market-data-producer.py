"""
Kafka Market Data Producer for Nexus Trade AI

This module implements a high-performance producer for streaming market data to Kafka.
It supports multiple exchanges and provides fault tolerance and backpressure handling.
"""

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable, Awaitable
from dataclasses import dataclass, asdict, field
import aiohttp
import aiokafka
import avro.schema
from avro.io import DatumWriter, BinaryEncoder
from io import BytesIO
import yaml
import os
from pathlib import Path
import signal
import socket
import ssl
import random
import backoff
from functools import partial

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('market_data_producer.log')
    ]
)
logger = logging.getLogger(__name__)

# Load configuration
CONFIG_DIR = Path(__file__).parent.parent / 'config'
with open(CONFIG_DIR / 'topics.yaml') as f:
    CONFIG = yaml.safe_load(f)

# Constants
SCHEMA_FILE = Path(__file__).parent.parent / 'schemas' / 'market-data.avsc'
RECONNECT_DELAY = 5  # seconds
BATCH_SIZE = 100
FLUSH_INTERVAL = 1.0  # seconds

@dataclass
class MarketData:
    """Market data container with validation and serialization."""
    symbol: str
    timestamp: int
    exchange: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float
    interval: str
    is_snapshot: bool = False
    trades_count: Optional[int] = None
    metadata: Dict[str, str] = field(default_factory=dict)
    
    def to_avro_bytes(self, schema: avro.schema.Schema) -> bytes:
        """Serialize market data to Avro binary format."""
        writer = DatumWriter(schema)
        bytes_writer = BytesIO()
        encoder = BinaryEncoder(bytes_writer)
        writer.write(asdict(self), encoder)
        return bytes_writer.getvalue()

class MarketDataProducer:
    """High-performance Kafka producer for market data."""
    
    def __init__(self, bootstrap_servers: str = None, topic: str = 'market_data_1m'):
        """Initialize the market data producer.
        
        Args:
            bootstrap_servers: Comma-separated list of Kafka brokers
            topic: Target Kafka topic
        """
        self.bootstrap_servers = bootstrap_servers or CONFIG['producer']['bootstrap_servers']
        self.topic = topic
        self.topic_config = CONFIG.get(topic, {})
        self.producer = None
        self.running = False
        self.message_queue = asyncio.Queue(maxsize=10000)
        self.schema = self._load_schema()
        self._last_flush = time.monotonic()
        self._batch = []
        
        # Stats
        self.metrics = {
            'messages_sent': 0,
            'batches_sent': 0,
            'errors': 0,
            'last_error': None,
            'start_time': datetime.utcnow().isoformat(),
            'last_message_time': None
        }
    
    def _load_schema(self) -> avro.schema.Schema:
        """Load Avro schema from file."""
        try:
            return avro.schema.parse(SCHEMA_FILE.read_text())
        except Exception as e:
            logger.error(f"Failed to load Avro schema: {e}")
            raise
    
    async def connect(self) -> None:
        """Connect to Kafka cluster."""
        ssl_context = self._create_ssl_context()
        
        self.producer = aiokafka.AIOKafkaProducer(
            bootstrap_servers=self.bootstrap_servers.split(','),
            acks=CONFIG['producer']['acks'],
            retries=CONFIG['producer']['retries'],
            compression_type=CONFIG['producer']['compression_type'],
            batch_size=CONFIG['producer']['batch_size'],
            linger_ms=CONFIG['producer']['linger_ms'],
            request_timeout_ms=CONFIG['producer']['request_timeout_ms'],
            max_request_size=CONFIG['producer'].get('max_request_size', 1048576),
            ssl_context=ssl_context,
            security_protocol='SSL' if ssl_context else 'PLAINTEXT',
            enable_idempotence=True
        )
        
        await self.producer.start()
        logger.info(f"Connected to Kafka at {self.bootstrap_servers}")
    
    def _create_ssl_context(self):
        """Create SSL context if certificates are provided."""
        if not all([
            os.getenv('KAFKA_SSL_CAFILE'),
            os.getenv('KAFKA_SSL_CERTFILE'),
            os.getenv('KAFKA_SSL_KEYFILE')
        ]):
            return None
            
        ssl_context = ssl.create_default_context()
        ssl_context.load_verify_locations(cafile=os.getenv('KAFKA_SSL_CAFILE'))
        ssl_context.load_cert_chain(
            certfile=os.getenv('KAFKA_SSL_CERTFILE'),
            keyfile=os.getenv('KAFKA_SSL_KEYFILE')
        )
        return ssl_context
    
    async def produce(self, market_data: MarketData) -> None:
        """Produce a single market data message to Kafka.
        
        Args:
            market_data: MarketData instance to send
        """
        await self.message_queue.put(market_data)
    
    async def _process_batch(self, batch: List[MarketData]) -> None:
        """Process a batch of market data messages."""
        if not batch:
            return
            
        messages = []
        for data in batch:
            try:
                # Serialize to Avro
                value = data.to_avro_bytes(self.schema)
                messages.append({
                    'value': value,
                    'key': f"{data.exchange}:{data.symbol}".encode(),
                    'timestamp_ms': int(time.time() * 1000)
                })
            except Exception as e:
                logger.error(f"Failed to serialize message: {e}")
                self.metrics['errors'] += 1
                self.metrics['last_error'] = str(e)
        
        if not messages:
            return
        
        try:
            # Send batch to Kafka
            futures = [
                self.producer.send(
                    topic=self.topic,
                    value=msg['value'],
                    key=msg['key'],
                    timestamp_ms=msg['timestamp_ms']
                )
                for msg in messages
            ]
            
            # Wait for all messages to be delivered
            await asyncio.gather(*futures)
            
            # Update metrics
            self.metrics['messages_sent'] += len(messages)
            self.metrics['batches_sent'] += 1
            self.metrics['last_message_time'] = datetime.utcnow().isoformat()
            
            if self.metrics['batches_sent'] % 10 == 0:
                logger.info(f"Produced {len(messages)} messages to {self.topic} (total: {self.metrics['messages_sent']})")
                
        except Exception as e:
            logger.error(f"Failed to send batch to Kafka: {e}")
            self.metrics['errors'] += 1
            self.metrics['last_error'] = str(e)
            raise
    
    async def _batch_processor(self) -> None:
        """Process messages in batches with backpressure handling."""
        while self.running:
            try:
                # Wait for the first message
                market_data = await self.message_queue.get()
                self._batch.append(market_data)
                
                # Check if we should flush the batch
                current_time = time.monotonic()
                time_since_flush = current_time - self._last_flush
                
                if (len(self._batch) >= BATCH_SIZE or 
                    time_since_flush >= FLUSH_INTERVAL):
                    batch = self._batch
                    self._batch = []
                    self._last_flush = current_time
                    await self._process_batch(batch)
                
            except asyncio.CancelledError:
                # Handle graceful shutdown
                if self._batch:
                    await self._process_batch(self._batch)
                    self._batch = []
                break
            except Exception as e:
                logger.error(f"Error in batch processor: {e}", exc_info=True)
                await asyncio.sleep(RECONNECT_DELAY)
    
    async def start(self) -> None:
        """Start the producer."""
        if self.running:
            return
            
        self.running = True
        
        # Connect to Kafka with retry
        max_retries = 5
        for attempt in range(max_retries):
            try:
                await self.connect()
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to connect to Kafka after {max_retries} attempts")
                    raise
                logger.warning(f"Connection attempt {attempt + 1} failed: {e}. Retrying...")
                await asyncio.sleep(RECONNECT_DELAY * (attempt + 1))
        
        # Start batch processor
        self.processor_task = asyncio.create_task(self._batch_processor())
        logger.info(f"Started market data producer for topic: {self.topic}")
    
    async def stop(self) -> None:
        """Stop the producer gracefully."""
        if not self.running:
            return
            
        self.running = False
        
        # Cancel the processor task
        if hasattr(self, 'processor_task'):
            self.processor_task.cancel()
            try:
                await self.processor_task
            except asyncio.CancelledError:
                pass
        
        # Flush any remaining messages
        if self._batch:
            await self._process_batch(self._batch)
            self._batch = []
        
        # Close the producer
        if self.producer:
            await self.producer.stop()
        
        logger.info("Market data producer stopped")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current producer metrics."""
        return {
            **self.metrics,
            'queue_size': self.message_queue.qsize(),
            'batch_size': len(self._batch),
            'running': self.running,
            'bootstrap_servers': self.bootstrap_servers,
            'topic': self.topic
        }

# Example usage
async def example_producer():
    """Example usage of the MarketDataProducer."""
    producer = MarketDataProducer()
    
    # Handle graceful shutdown
    async def shutdown(signal, loop):
        logger.info("Shutting down...")
        await producer.stop()
        loop.stop()
    
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(
            sig, lambda s=sig: asyncio.create_task(shutdown(s, loop))
        )
    
    try:
        # Start producer
        await producer.start()
        
        # Example: Generate and send some test data
        for i in range(100):
            data = MarketData(
                symbol="BTC-USDT",
                timestamp=int(time.time() * 1000),
                exchange="binance",
                open=50000 + i,
                high=50100 + i,
                low=49900 + i,
                close=50050 + i,
                volume=100.5 + i,
                quote_volume=5000000 + (i * 50000),
                interval="1m",
                is_snapshot=(i % 10 == 0)
            )
            await producer.produce(data)
            await asyncio.sleep(0.1)  # Simulate real-time data
            
            # Print metrics every 10 messages
            if i % 10 == 0:
                logger.info(f"Metrics: {producer.get_metrics()}")
        
        # Keep running until interrupted
        while True:
            await asyncio.sleep(1)
            
    except asyncio.CancelledError:
        pass
    finally:
        await producer.stop()

if __name__ == "__main__":
    asyncio.run(example_producer())
