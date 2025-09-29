# data-infrastructure/processing/flink/stream-processors/real_time_analytics_processor.py

from pyflink.datastream import StreamExecutionEnvironment, TimeCharacteristic
from pyflink.datastream.window import TumblingEventTimeWindows, SlidingEventTimeWindows
from pyflink.datastream.functions import ProcessFunction, ProcessWindowFunction
from pyflink.datastream.state import ValueStateDescriptor, ListStateDescriptor
from pyflink.common.typeinfo import Types
from pyflink.common.watermark_strategy import WatermarkStrategy
from pyflink.common.time import Duration
from pyflink.common.serialization import SimpleStringSchema
from pyflink.datastream.connectors import FlinkKafkaConsumer, FlinkKafkaProducer
import json
import numpy as np
from datetime import datetime, timedelta
from typing import Iterable, Dict, List, Any, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MarketDataProcessor(ProcessFunction):
    """Process real-time market data with state management"""
    
    def __init__(self):
        self.state = None
        self.volatility_state = None
        self.price_history_state = None
        
    def open(self, runtime_context):
        """Initialize state descriptors"""
        self.state = runtime_context.get_state(
            ValueStateDescriptor("last_price", Types.DOUBLE())
        )
        self.volatility_state = runtime_context.get_state(
            ValueStateDescriptor("volatility", Types.DOUBLE())
        )
        self.price_history_state = runtime_context.get_list_state(
            ListStateDescriptor("price_history", Types.DOUBLE())
        )
        
    def process_element(self, value, ctx):
        """Process each market data element"""
        try:
            data = json.loads(value)
            current_price = data['price']
            timestamp = data['timestamp']
            
            # Get previous price
            last_price = self.state.value() or current_price
            
            # Calculate price change
            price_change = (current_price - last_price) / last_price if last_price else 0
            
            # Update price history for volatility calculation
            price_history = list(self.price_history_state.get() or [])
            price_history.append(current_price)
            
            # Keep only last 100 prices
            if len(price_history) > 100:
                price_history = price_history[-100:]
            
            # Calculate volatility
            if len(price_history) >= 20:
                returns = [(price_history[i] - price_history[i-1]) / price_history[i-1] 
                          for i in range(1, len(price_history))]
                volatility = np.std(returns) * np.sqrt(252)  # Annualized volatility
                self.volatility_state.update(volatility)
            else:
                volatility = self.volatility_state.value() or 0
            
            # Update states
            self.state.update(current_price)
            self.price_history_state.update(price_history)
            
            # Emit enriched data
            enriched_data = {
                'symbol': data['symbol'],
                'price': current_price,
                'price_change': price_change,
                'volatility': volatility,
                'timestamp': timestamp,
                'processing_time': datetime.now().isoformat()
            }
            
            yield json.dumps(enriched_data)
            
        except Exception as e:
            logger.error(f"Error processing market data: {e}")


class VolumeAnomalyDetector(ProcessWindowFunction):
    """Detect volume anomalies using statistical methods"""
    
    def process(self, key: str, context, elements: Iterable[Dict]) -> Iterable[Dict]:
        """Process window of volume data"""
        volumes = []
        for element in elements:
            data = json.loads(element)
            volumes.append(data.get('volume', 0))
        
        if len(volumes) < 10:
            return
        
        # Calculate statistics
        mean_volume = np.mean(volumes)
        std_volume = np.std(volumes)
        
        # Detect anomalies (3 standard deviations)
        anomalies = []
        for i, volume in enumerate(volumes):
            z_score = (volume - mean_volume) / std_volume if std_volume > 0 else 0
            
            if abs(z_score) > 3:
                anomaly = {
                    'type': 'volume_anomaly',
                    'symbol': key,
                    'volume': volume,
                    'z_score': z_score,
                    'mean_volume': mean_volume,
                    'std_volume': std_volume,
                    'timestamp': context.window().end,
                    'severity': 'high' if abs(z_score) > 5 else 'medium'
                }
                anomalies.append(anomaly)
        
        for anomaly in anomalies:
            yield json.dumps(anomaly)


class OrderFlowImbalanceCalculator(ProcessFunction):
    """Calculate order flow imbalance and toxic flow metrics"""
    
    def __init__(self):
        self.buy_volume_state = None
        self.sell_volume_state = None
        self.toxic_flow_state = None
        
    def open(self, runtime_context):
        """Initialize state descriptors"""
        self.buy_volume_state = runtime_context.get_state(
            ValueStateDescriptor("buy_volume", Types.DOUBLE())
        )
        self.sell_volume_state = runtime_context.get_state(
            ValueStateDescriptor("sell_volume", Types.DOUBLE())
        )
        self.toxic_flow_state = runtime_context.get_state(
            ValueStateDescriptor("toxic_flow_score", Types.DOUBLE())
        )
        
    def process_element(self, value, ctx):
        """Calculate order flow metrics"""
        try:
            order = json.loads(value)
            
            # Update volume states
            if order['side'] == 'buy':
                buy_volume = (self.buy_volume_state.value() or 0) + order['quantity']
                self.buy_volume_state.update(buy_volume)
                sell_volume = self.sell_volume_state.value() or 0
            else:
                sell_volume = (self.sell_volume_state.value() or 0) + order['quantity']
                self.sell_volume_state.update(sell_volume)
                buy_volume = self.buy_volume_state.value() or 0
            
            # Calculate order flow imbalance
            total_volume = buy_volume + sell_volume
            if total_volume > 0:
                imbalance = (buy_volume - sell_volume) / total_volume
            else:
                imbalance = 0
            
            # Calculate toxic flow score (simplified)
            # Toxic flow: large orders that move against the market
            price_impact = abs(order.get('price_impact', 0))
            order_size_ratio = order['quantity'] / (total_volume + 1)
            
            toxic_score = price_impact * order_size_ratio * 100
            
            # Update toxic flow state (exponential moving average)
            prev_toxic_score = self.toxic_flow_state.value() or 0
            new_toxic_score = 0.1 * toxic_score + 0.9 * prev_toxic_score
            self.toxic_flow_state.update(new_toxic_score)
            
            # Emit metrics
            metrics = {
                'symbol': order['symbol'],
                'timestamp': order['timestamp'],
                'order_flow_imbalance': imbalance,
                'buy_volume': buy_volume,
                'sell_volume': sell_volume,
                'toxic_flow_score': new_toxic_score,
                'price_impact': price_impact
            }
            
            yield json.dumps(metrics)
            
        except Exception as e:
            logger.error(f"Error calculating order flow metrics: {e}")


class ComplexEventProcessor:
    """Complex Event Processing for pattern detection"""
    
    def __init__(self):
        self.env = StreamExecutionEnvironment.get_execution_environment()
        self.env.set_stream_time_characteristic(TimeCharacteristic.EventTime)
        self.env.set_parallelism(4)
        
    def create_market_data_stream(self):
        """Create market data stream from Kafka"""
        kafka_props = {
            'bootstrap.servers': 'localhost:9092',
            'group.id': 'flink-cep-processor',
            'auto.offset.reset': 'latest'
        }
        
        kafka_consumer = FlinkKafkaConsumer(
            'market-data-stream',
            SimpleStringSchema(),
            kafka_props
        )
        
        # Assign timestamps and watermarks
        kafka_consumer.assign_timestamps_and_watermarks(
            WatermarkStrategy
            .for_bounded_out_of_orderness(Duration.of_seconds(5))
            .with_timestamp_assigner(lambda x: json.loads(x)['timestamp'])
        )
        
        return self.env.add_source(kafka_consumer)
    
    def detect_flash_crash_pattern(self, stream):
        """Detect flash crash patterns"""
        
        class FlashCrashDetector(ProcessWindowFunction):
            def process(self, key: str, context, elements: Iterable[str]) -> Iterable[str]:
                prices = []
                for element in elements:
                    data = json.loads(element)
                    prices.append((data['timestamp'], data['price']))
                
                if len(prices) < 10:
                    return
                
                # Sort by timestamp
                prices.sort(key=lambda x: x[0])
                
                # Calculate price drops
                max_drop = 0
                recovery_time = None
                
                for i in range(1, len(prices)):
                    price_drop = (prices[i-1][1] - prices[i][1]) / prices[i-1][1]
                    
                    # Flash crash: >5% drop in less than 5 minutes
                    if price_drop > 0.05:
                        drop_time = prices[i][0] - prices[i-1][0]
                        if drop_time < 300000:  # 5 minutes in milliseconds
                            max_drop = max(max_drop, price_drop)
                            
                            # Check for recovery
                            for j in range(i+1, len(prices)):
                                if prices[j][1] >= prices[i-1][1] * 0.95:
                                    recovery_time = prices[j][0] - prices[i][0]
                                    break
                
                if max_drop > 0.05:
                    alert = {
                        'type': 'flash_crash',
                        'symbol': key,
                        'max_drop_percentage': max_drop * 100,
                        'recovery_time_ms': recovery_time,
                        'timestamp': context.window().end,
                        'severity': 'critical'
                    }
                    yield json.dumps(alert)
        
        return (stream
                .key_by(lambda x: json.loads(x)['symbol'])
                .window(SlidingEventTimeWindows.of(
                    Duration.of_minutes(10),
                    Duration.of_minutes(1)
                ))
                .process(FlashCrashDetector()))
    
    def calculate_correlation_matrix(self, stream):
        """Calculate real-time correlation matrix between instruments"""
        
        class CorrelationCalculator(ProcessWindowFunction):
            def process(self, key: str, context, elements: Iterable[str]) -> Iterable[str]:
                # Group prices by symbol
                symbol_prices = {}
                
                for element in elements:
                    data = json.loads(element)
                    symbol = data['symbol']
                    if symbol not in symbol_prices:
                        symbol_prices[symbol] = []
                    symbol_prices[symbol].append(data['price'])
                
                if len(symbol_prices) < 2:
                    return
                
                # Calculate returns
                symbol_returns = {}
                for symbol, prices in symbol_prices.items():
                    if len(prices) >= 2:
                        returns = [(prices[i] - prices[i-1]) / prices[i-1] 
                                  for i in range(1, len(prices))]
                        symbol_returns[symbol] = returns
                
                # Calculate correlation matrix
                symbols = list(symbol_returns.keys())
                correlation_matrix = {}
                
                for i, sym1 in enumerate(symbols):
                    correlation_matrix[sym1] = {}
                    for j, sym2 in enumerate(symbols):
                        if len(symbol_returns[sym1]) > 0 and len(symbol_returns[sym2]) > 0:
                            correlation = np.corrcoef(
                                symbol_returns[sym1][:min(len(symbol_returns[sym1]), 
                                                        len(symbol_returns[sym2]))],
                                symbol_returns[sym2][:min(len(symbol_returns[sym1]), 
                                                        len(symbol_returns[sym2]))]
                            )[0, 1]
                            correlation_matrix[sym1][sym2] = correlation
                
                result = {
                    'type': 'correlation_matrix',
                    'timestamp': context.window().end,
                    'window_size_minutes': 60,
                    'correlations': correlation_matrix,
                    'symbols': symbols
                }
                
                yield json.dumps(result)
        
        return (stream
                .window_all(TumblingEventTimeWindows.of(Duration.of_hours(1)))
                .process(CorrelationCalculator()))
    
    def run(self):
        """Execute the Flink job"""
        # Create streams
        market_stream = self.create_market_data_stream()
        
        # Process market data
        processed_stream = market_stream.process(MarketDataProcessor())
        
        # Detect volume anomalies
        volume_anomalies = (market_stream
                           .key_by(lambda x: json.loads(x)['symbol'])
                           .window(TumblingEventTimeWindows.of(Duration.of_minutes(5)))
                           .process(VolumeAnomalyDetector()))
        
        # Detect flash crashes
        flash_crashes = self.detect_flash_crash_pattern(market_stream)
        
        # Calculate correlations
        correlations = self.calculate_correlation_matrix(market_stream)
        
        # Output to Kafka
        kafka_producer_props = {
            'bootstrap.servers': 'localhost:9092'
        }
        
        processed_stream.add_sink(
            FlinkKafkaProducer(
                'processed-market-data',
                SimpleStringSchema(),
                kafka_producer_props
            )
        )
        
        volume_anomalies.add_sink(
            FlinkKafkaProducer(
                'market-anomalies',
                SimpleStringSchema(),
                kafka_producer_props
            )
        )
        
        flash_crashes.add_sink(
            FlinkKafkaProducer(
                'critical-alerts',
                SimpleStringSchema(),
                kafka_producer_props
            )
        )
        
        correlations.add_sink(
            FlinkKafkaProducer(
                'correlation-metrics',
                SimpleStringSchema(),
                kafka_producer_props
            )
        )
        
        # Execute
        self.env.execute("Complex Event Processing Pipeline")


if __name__ == "__main__":
    processor = ComplexEventProcessor()
    processor.run()