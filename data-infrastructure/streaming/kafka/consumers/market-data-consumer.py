"""
Kafka Market Data Consumer for Nexus Trade AI

This module implements a high-performance consumer for processing market data from Kafka.
It handles deserialization, validation, and distribution of market data to registered callbacks.
"""

import asyncio
import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any, Callable, Awaitable, Set
import aiokafka
import avro.schema
from avro.io import DatumReader, BinaryDecoder
from io import BytesIO
import yaml
from pathlib import Path
import signal
import time
from dataclasses import dataclass, field

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('market_data_consumer.log')
    ]
)
logger = logging.getLogger(__name__)

# Load configuration
CONFIG_DIR = Path(__file__).parent.parent.parent / 'config'
with open(CONFIG_DIR / 'topics.yaml') as f:
    CONFIG = yaml.safe_load(f)

# Constants
SCHEMA_FILE = Path(__file__).parent.parent / 'schemas' / 'market-data.avsc'
RECONNECT_DELAY = 5  # seconds
BATCH_PROCESSING_INTERVAL = 1.0  # seconds

@dataclass
class MarketData:
    """Market data container with validation and deserialization."""
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
    
    @classmethod
    def from_avro_bytes(cls, data: bytes, schema: avro.schema.Schema) -> 'MarketData':
        """Deserialize market data from Avro binary format."""
        reader = DatumReader(schema)
        bytes_reader = BytesIO(data)
        decoder = BinaryDecoder(bytes_reader)
        data_dict = reader.read(decoder)
        return cls(**data_dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for easy serialization."""
        return {
            'symbol': self.symbol,
            'timestamp': self.timestamp,
            'exchange': self.exchange,
            'open': self.open,
            'high': self.high,
            'low': self.low,
            'close': self.close,
            'volume': self.volume,
            'quote_volume': self.quote_volume,
            'interval': self.interval,
            'is_snapshot': self.is_snapshot,
            'trades_count': self.trades_count,
            'metadata': self.metadata
        }

class MarketDataConsumer:
    """High-performance Kafka consumer for market data."""
    
    def __init__(
        self,
        bootstrap_servers: str = None,
        topics: List[str] = None,
        group_id: str = 'market_data_consumers'
    ):
        """Initialize the market data consumer.
        
        Args:
            bootstrap_servers: Comma-separated list of Kafka brokers
            topics: List of topics to subscribe to
            group_id: Consumer group ID for offset management
        """
        self.bootstrap_servers = bootstrap_servers or CONFIG['consumer']['bootstrap_servers']
        self.topics = topics or ['market_data_1m']
        self.group_id = group_id or CONFIG['consumer']['group_id']
        self.consumer = None
        self.running = False
        self.schema = self._load_schema()
        self.callbacks: Dict[str, Set[Callable[[MarketData], Awaitable[None]]]] = {}
        self._batch: List[MarketData] = []
        self._last_batch_process = time.monotonic()
        
        # Stats
        self.metrics = {
            'messages_processed': 0,
            'batches_processed': 0,
            'errors': 0,
            'last_error': None,
            'start_time': datetime.utcnow().isoformat(),
            'last_message_time': None,
            'offsets_committed': 0,
            'callback_errors': 0
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
        
        self.consumer = aiokafka.AIOKafkaConsumer(
            *self.topics,
            bootstrap_servers=self.bootstrap_servers.split(','),
            group_id=self.group_id,
            auto_offset_reset=CONFIG['consumer']['auto_offset_reset'],
            enable_auto_commit=CONFIG['consumer']['enable_auto_commit'],
            auto_commit_interval_ms=CONFIG['consumer']['auto_commit_interval_ms'],
            session_timeout_ms=CONFIG['consumer']['session_timeout_ms'],
            heartbeat_interval_ms=CONFIG['consumer']['heartbeat_interval_ms'],
            max_poll_interval_ms=CONFIG['consumer']['max_poll_interval_ms'],
            max_poll_records=CONFIG['consumer']['max_poll_records'],
            fetch_max_bytes=CONFIG['consumer']['fetch_max_bytes'],
            max_partition_fetch_bytes=CONFIG['consumer']['max_partition_fetch_bytes'],
            request_timeout_ms=CONFIG['consumer']['request_timeout_ms'],
            retry_backoff_ms=CONFIG['consumer']['retry_backoff_ms'],
            ssl_context=ssl_context,
            security_protocol='SSL' if ssl_context else 'PLAINTEXT'
        )
        
        await self.consumer.start()
        logger.info(f"Connected to Kafka at {self.bootstrap_servers}. Subscribed to: {', '.join(self.topics)}")
    
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
    
    def register_callback(
        self, 
        callback: Callable[[MarketData], Awaitable[None]],
        symbols: List[str] = None,
        exchanges: List[str] = None
    ) -> None:
        """Register a callback to be called for each market data message.
        
        Args:
            callback: Async function that takes a MarketData object
            symbols: List of symbols to filter by (None for all)
            exchanges: List of exchanges to filter by (None for all)
        """
        key = self._get_filter_key(symbols, exchanges)
        if key not in self.callbacks:
            self.callbacks[key] = set()
        self.callbacks[key].add(callback)
        logger.info(f"Registered callback for {key or 'all symbols and exchanges'}")
    
    def unregister_callback(
        self, 
        callback: Callable[[MarketData], Awaitable[None]],
        symbols: List[str] = None,
        exchanges: List[str] = None
    ) -> None:
        """Unregister a previously registered callback."""
        key = self._get_filter_key(symbols, exchanges)
        if key in self.callbacks and callback in self.callbacks[key]:
            self.callbacks[key].remove(callback)
            if not self.callbacks[key]:
                del self.callbacks[key]
    
    def _get_filter_key(self, symbols: List[str] = None, exchanges: List[str] = None) -> str:
        """Get a key for the callback registry."""
        symbol_key = ':'.join(sorted(symbols)) if symbols else '*' 
        exchange_key = ':'.join(sorted(exchanges)) if exchanges else '*'
        return f"{symbol_key}|{exchange_key}"
    
    def _should_call_callback(self, market_data: MarketData, key: str) -> bool:
        """Check if a callback should be called for the given market data."""
        if key == '*|*':
            return True
            
        symbol_part, exchange_part = key.split('|')
        
        # Check symbol filter
        if symbol_part != '*' and market_data.symbol not in symbol_part.split(':'):
            return False
            
        # Check exchange filter
        if exchange_part != '*' and market_data.exchange not in exchange_part.split(':'):
            return False
            
        return True
    
    async def _process_message(self, message) -> None:
        """Process a single Kafka message."""
        try:
            # Deserialize the message
            market_data = MarketData.from_avro_bytes(message.value, self.schema)
            self.metrics['messages_processed'] += 1
            self.metrics['last_message_time'] = datetime.utcnow().isoformat()
            
            # Add to batch for batch processing
            self._batch.append(market_data)
            
            # Process batch if needed
            current_time = time.monotonic()
            if (len(self._batch) >= CONFIG['consumer']['max_poll_records'] or 
                current_time - self._last_batch_process >= BATCH_PROCESSING_INTERVAL):
                await self._process_batch()
                self._last_batch_process = current_time
            
        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)
            self.metrics['errors'] += 1
            self.metrics['last_error'] = str(e)
    
    async def _process_batch(self) -> None:
        """Process a batch of market data messages."""
        if not self._batch:
            return
            
        batch = self._batch
        self._batch = []
        self.metrics['batches_processed'] += 1
        
        # Call registered callbacks for each message
        for market_data in batch:
            for key, callbacks in list(self.callbacks.items()):
                if not self._should_call_callback(market_data, key):
                    continue
                    
                for callback in list(callbacks):  # Create a copy to allow modification during iteration
                    try:
                        await callback(market_data)
                    except Exception as e:
                        logger.error(f"Error in callback: {e}", exc_info=True)
                        self.metrics['callback_errors'] += 1
        
        # Commit offsets
        try:
            await self.consumer.commit()
            self.metrics['offsets_committed'] += 1
        except Exception as e:
            logger.error(f"Error committing offsets: {e}")
            self.metrics['errors'] += 1
    
    async def start(self) -> None:
        """Start consuming messages."""
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
        
        logger.info("Starting market data consumer...")
        
        try:
            async for message in self.consumer:
                await self._process_message(message)
        except asyncio.CancelledError:
            logger.info("Consumer task cancelled")
        except Exception as e:
            logger.error(f"Error in consumer loop: {e}", exc_info=True)
            raise
        finally:
            await self.stop()
    
    async def stop(self) -> None:
        """Stop the consumer gracefully."""
        if not self.running:
            return
            
        self.running = False
        
        # Process any remaining messages in the batch
        if self._batch:
            await self._process_batch()
        
        # Close the consumer
        if self.consumer:
            await self.consumer.stop()
        
        logger.info("Market data consumer stopped")
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current consumer metrics."""
        return {
            **self.metrics,
            'batch_size': len(self._batch),
            'running': self.running,
            'bootstrap_servers': self.bootstrap_servers,
            'topics': self.topics,
            'callbacks_registered': sum(len(callbacks) for callbacks in self.callbacks.values())
        }

# Example usage
async def example_consumer():
    """Example usage of the MarketDataConsumer."""
    # Create a consumer
    consumer = MarketDataConsumer(topics=['market_data_1m'])
    
    # Define a callback function
    async def print_market_data(market_data: MarketData) -> None:
        print(f"Received {market_data.symbol} @ {market_data.close} from {market_data.exchange}")
    
    # Register the callback
    consumer.register_callback(print_market_data, symbols=['BTC-USDT'])
    
    # Handle graceful shutdown
    async def shutdown(signal, loop):
        logger.info("Shutting down...")
        await consumer.stop()
        loop.stop()
    
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(
            sig, lambda s=sig: asyncio.create_task(shutdown(s, loop))
        )
    
    try:
        # Start consuming
        await consumer.start()
    except asyncio.CancelledError:
        pass
    finally:
        await consumer.stop()

if __name__ == "__main__":
    asyncio.run(example_consumer())
