#!/usr/bin/env python3
"""
Apache Spark Streaming Job for Market Data Processing
Processes real-time market data streams with high throughput and low latency.
"""

import os
import sys
from typing import Dict, List, Any, Optional
import json
import logging
from datetime import datetime, timedelta
from decimal import Decimal

from pyspark.sql import SparkSession, DataFrame
from pyspark.sql.functions import *
from pyspark.sql.types import *
from pyspark.sql.streaming import StreamingQuery
import pyspark.sql.functions as F

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MarketDataProcessor:
    """Spark streaming processor for market data"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.spark = None
        self.queries = []
        
    def initialize_spark(self):
        """Initialize Spark session with optimized configuration"""
        self.spark = SparkSession.builder \
            .appName("NexusTradeAI-MarketDataProcessor") \
            .config("spark.sql.streaming.checkpointLocation", self.config.get('checkpoint_location', '/tmp/spark-checkpoints')) \
            .config("spark.sql.streaming.stateStore.providerClass", "org.apache.spark.sql.execution.streaming.state.HDFSBackedStateStoreProvider") \
            .config("spark.sql.streaming.minBatchesToRetain", "10") \
            .config("spark.sql.adaptive.enabled", "true") \
            .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
            .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer") \
            .config("spark.sql.streaming.kafka.consumer.cache.capacity", "1000") \
            .config("spark.sql.streaming.kafka.consumer.poll.ms", "100") \
            .getOrCreate()
        
        self.spark.sparkContext.setLogLevel("WARN")
        logger.info("Spark session initialized successfully")
    
    def define_schemas(self):
        """Define schemas for different data types"""
        self.market_data_schema = StructType([
            StructField("symbol", StringType(), False),
            StructField("timestamp", LongType(), False),
            StructField("exchange", StringType(), False),
            StructField("open", DecimalType(20, 8), True),
            StructField("high", DecimalType(20, 8), True),
            StructField("low", DecimalType(20, 8), True),
            StructField("close", DecimalType(20, 8), False),
            StructField("volume", DecimalType(20, 8), True),
            StructField("quote_volume", DecimalType(20, 8), True),
            StructField("interval", StringType(), True),
            StructField("is_snapshot", BooleanType(), True),
            StructField("trades_count", IntegerType(), True),
            StructField("metadata", MapType(StringType(), StringType()), True)
        ])
        
        self.trade_schema = StructType([
            StructField("trade_id", StringType(), False),
            StructField("order_id", StringType(), False),
            StructField("user_id", StringType(), False),
            StructField("symbol", StringType(), False),
            StructField("exchange", StringType(), False),
            StructField("side", StringType(), False),
            StructField("quantity", DecimalType(20, 8), False),
            StructField("price", DecimalType(20, 8), False),
            StructField("executed_quantity", DecimalType(20, 8), False),
            StructField("executed_price", DecimalType(20, 8), False),
            StructField("commission", DecimalType(20, 8), True),
            StructField("timestamp", LongType(), False),
            StructField("execution_timestamp", LongType(), False),
            StructField("status", StringType(), False),
            StructField("order_type", StringType(), False),
            StructField("metadata", MapType(StringType(), StringType()), True)
        ])
    
    def create_kafka_stream(self, topic: str, schema: StructType) -> DataFrame:
        """Create Kafka streaming DataFrame"""
        return self.spark \
            .readStream \
            .format("kafka") \
            .option("kafka.bootstrap.servers", self.config['kafka']['bootstrap_servers']) \
            .option("subscribe", topic) \
            .option("startingOffsets", "latest") \
            .option("failOnDataLoss", "false") \
            .option("kafka.consumer.group.id", f"spark-{topic}-processor") \
            .option("kafka.session.timeout.ms", "30000") \
            .option("kafka.request.timeout.ms", "40000") \
            .load() \
            .select(
                col("key").cast("string").alias("message_key"),
                from_json(col("value").cast("string"), schema).alias("data"),
                col("timestamp").alias("kafka_timestamp"),
                col("partition"),
                col("offset")
            ) \
            .select("message_key", "data.*", "kafka_timestamp", "partition", "offset")
    
    def process_market_data_stream(self):
        """Process market data stream with technical indicators"""
        market_data_df = self.create_kafka_stream("market-data-crypto", self.market_data_schema)
        
        # Add processing timestamp
        processed_df = market_data_df \
            .withColumn("processing_timestamp", current_timestamp()) \
            .withColumn("event_time", (col("timestamp") / 1000).cast("timestamp"))
        
        # Calculate technical indicators using window functions
        windowed_df = processed_df \
            .withWatermark("event_time", "30 seconds") \
            .groupBy(
                window(col("event_time"), "1 minute"),
                col("symbol"),
                col("exchange")
            ) \
            .agg(
                first("open").alias("open"),
                max("high").alias("high"),
                min("low").alias("low"),
                last("close").alias("close"),
                sum("volume").alias("volume"),
                sum("quote_volume").alias("quote_volume"),
                count("*").alias("tick_count"),
                avg("close").alias("vwap"),
                stddev("close").alias("volatility")
            ) \
            .select(
                col("window.start").alias("window_start"),
                col("window.end").alias("window_end"),
                col("symbol"),
                col("exchange"),
                col("open"),
                col("high"),
                col("low"),
                col("close"),
                col("volume"),
                col("quote_volume"),
                col("tick_count"),
                col("vwap"),
                col("volatility"),
                lit("1m").alias("interval"),
                current_timestamp().alias("created_at")
            )
        
        # Write to multiple sinks
        query1 = self._write_to_clickhouse(windowed_df, "market_data_1m")
        query2 = self._write_to_kafka(windowed_df, "market-data-processed")
        query3 = self._write_to_console(windowed_df, "market-data-debug")
        
        return [query1, query2, query3]
    
    def process_trade_stream(self):
        """Process trade execution stream"""
        trade_df = self.create_kafka_stream("trades-crypto", self.trade_schema)
        
        # Add derived fields
        processed_df = trade_df \
            .withColumn("processing_timestamp", current_timestamp()) \
            .withColumn("event_time", (col("execution_timestamp") / 1000).cast("timestamp")) \
            .withColumn("trade_value", col("executed_quantity") * col("executed_price")) \
            .withColumn("slippage", 
                when(col("order_type") == "market", 
                     abs(col("executed_price") - col("price")) / col("price")
                ).otherwise(lit(0.0))
            )
        
        # Aggregate trade metrics by user and symbol
        user_metrics_df = processed_df \
            .withWatermark("event_time", "1 minute") \
            .groupBy(
                window(col("event_time"), "5 minutes"),
                col("user_id"),
                col("symbol"),
                col("exchange"),
                col("side")
            ) \
            .agg(
                count("*").alias("trade_count"),
                sum("executed_quantity").alias("total_quantity"),
                sum("trade_value").alias("total_value"),
                avg("executed_price").alias("avg_price"),
                sum("commission").alias("total_commission"),
                avg("slippage").alias("avg_slippage"),
                max("trade_value").alias("max_trade_value"),
                min("trade_value").alias("min_trade_value")
            ) \
            .select(
                col("window.start").alias("window_start"),
                col("window.end").alias("window_end"),
                col("user_id"),
                col("symbol"),
                col("exchange"),
                col("side"),
                col("trade_count"),
                col("total_quantity"),
                col("total_value"),
                col("avg_price"),
                col("total_commission"),
                col("avg_slippage"),
                col("max_trade_value"),
                col("min_trade_value"),
                current_timestamp().alias("created_at")
            )
        
        # Write individual trades and aggregated metrics
        query1 = self._write_to_clickhouse(processed_df, "trade_executions")
        query2 = self._write_to_clickhouse(user_metrics_df, "user_trade_metrics")
        query3 = self._write_to_kafka(user_metrics_df, "user-metrics")
        
        return [query1, query2, query3]
    
    def calculate_portfolio_metrics(self):
        """Calculate real-time portfolio metrics"""
        # This would typically join trade data with position data
        # For now, we'll create a simplified version
        
        trade_df = self.create_kafka_stream("trades-crypto", self.trade_schema)
        
        portfolio_df = trade_df \
            .withColumn("event_time", (col("execution_timestamp") / 1000).cast("timestamp")) \
            .withWatermark("event_time", "2 minutes") \
            .groupBy(
                window(col("event_time"), "1 minute"),
                col("user_id")
            ) \
            .agg(
                count("*").alias("total_trades"),
                sum(col("executed_quantity") * col("executed_price")).alias("total_volume"),
                sum("commission").alias("total_fees"),
                countDistinct("symbol").alias("unique_symbols"),
                avg(col("executed_quantity") * col("executed_price")).alias("avg_trade_size")
            ) \
            .select(
                col("window.start").alias("window_start"),
                col("window.end").alias("window_end"),
                col("user_id"),
                col("total_trades"),
                col("total_volume"),
                col("total_fees"),
                col("unique_symbols"),
                col("avg_trade_size"),
                current_timestamp().alias("created_at")
            )
        
        query = self._write_to_kafka(portfolio_df, "portfolio-metrics")
        return [query]
    
    def _write_to_clickhouse(self, df: DataFrame, table_name: str) -> StreamingQuery:
        """Write DataFrame to ClickHouse"""
        return df.writeStream \
            .format("jdbc") \
            .option("url", self.config['clickhouse']['url']) \
            .option("dbtable", table_name) \
            .option("user", self.config['clickhouse']['user']) \
            .option("password", self.config['clickhouse']['password']) \
            .option("driver", "ru.yandex.clickhouse.ClickHouseDriver") \
            .option("checkpointLocation", f"{self.config['checkpoint_location']}/{table_name}") \
            .outputMode("append") \
            .trigger(processingTime="10 seconds") \
            .start()
    
    def _write_to_kafka(self, df: DataFrame, topic: str) -> StreamingQuery:
        """Write DataFrame to Kafka topic"""
        return df.select(
            col("symbol").alias("key"),
            to_json(struct("*")).alias("value")
        ).writeStream \
            .format("kafka") \
            .option("kafka.bootstrap.servers", self.config['kafka']['bootstrap_servers']) \
            .option("topic", topic) \
            .option("checkpointLocation", f"{self.config['checkpoint_location']}/{topic}") \
            .outputMode("append") \
            .trigger(processingTime="5 seconds") \
            .start()
    
    def _write_to_console(self, df: DataFrame, query_name: str) -> StreamingQuery:
        """Write DataFrame to console for debugging"""
        return df.writeStream \
            .format("console") \
            .option("truncate", "false") \
            .option("numRows", "10") \
            .outputMode("append") \
            .trigger(processingTime="30 seconds") \
            .queryName(query_name) \
            .start()
    
    def start_processing(self):
        """Start all streaming queries"""
        logger.info("Starting market data processing...")
        
        self.initialize_spark()
        self.define_schemas()
        
        # Start all processing streams
        market_data_queries = self.process_market_data_stream()
        trade_queries = self.process_trade_stream()
        portfolio_queries = self.calculate_portfolio_metrics()
        
        self.queries.extend(market_data_queries)
        self.queries.extend(trade_queries)
        self.queries.extend(portfolio_queries)
        
        logger.info(f"Started {len(self.queries)} streaming queries")
        
        # Wait for all queries to finish
        try:
            for query in self.queries:
                query.awaitTermination()
        except KeyboardInterrupt:
            logger.info("Received interrupt signal, stopping queries...")
            self.stop_processing()
    
    def stop_processing(self):
        """Stop all streaming queries"""
        logger.info("Stopping all streaming queries...")
        
        for query in self.queries:
            if query.isActive:
                query.stop()
        
        if self.spark:
            self.spark.stop()
        
        logger.info("All queries stopped successfully")

def main():
    """Main function"""
    config = {
        'kafka': {
            'bootstrap_servers': os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'localhost:9092')
        },
        'clickhouse': {
            'url': os.getenv('CLICKHOUSE_URL', 'jdbc:clickhouse://localhost:8123/nexus_trade_ai'),
            'user': os.getenv('CLICKHOUSE_USER', 'default'),
            'password': os.getenv('CLICKHOUSE_PASSWORD', '')
        },
        'checkpoint_location': os.getenv('CHECKPOINT_LOCATION', '/tmp/spark-checkpoints')
    }
    
    processor = MarketDataProcessor(config)
    
    try:
        processor.start_processing()
    except Exception as e:
        logger.error(f"Error in market data processor: {e}")
        processor.stop_processing()
        sys.exit(1)

if __name__ == "__main__":
    main()
