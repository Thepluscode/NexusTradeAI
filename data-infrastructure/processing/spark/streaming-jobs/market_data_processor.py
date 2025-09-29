# data-infrastructure/processing/spark/streaming-jobs/market_data_processor.py

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
from pyspark.sql.window import Window
import json
import logging
from typing import Dict, Any
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MarketDataStreamProcessor:
    """Spark Streaming processor for real-time market data"""
    
    def __init__(self, 
                 app_name: str = "NexusTradeMarketDataProcessor",
                 kafka_bootstrap_servers: str = "localhost:9092",
                 checkpoint_location: str = "/tmp/spark-checkpoints",
                 output_mode: str = "append"):
        
        self.app_name = app_name
        self.kafka_bootstrap_servers = kafka_bootstrap_servers
        self.checkpoint_location = checkpoint_location
        self.output_mode = output_mode
        
        # Initialize Spark Session
        self.spark = SparkSession.builder \
            .appName(self.app_name) \
            .config("spark.sql.streaming.checkpointLocation", self.checkpoint_location) \
            .config("spark.sql.streaming.stateStore.providerClass", 
                   "org.apache.spark.sql.execution.streaming.state.HDFSBackedStateStoreProvider") \
            .config("spark.sql.adaptive.enabled", "true") \
            .config("spark.sql.adaptive.coalescePartitions.enabled", "true") \
            .getOrCreate()
        
        self.spark.sparkContext.setLogLevel("WARN")
        
        # Define schemas
        self._define_schemas()
    
    def _define_schemas(self):
        """Define schemas for different message types"""
        
        # Market data schema
        self.market_data_schema = StructType([
            StructField("symbol", StringType(), False),
            StructField("price", DoubleType(), False),
            StructField("volume", LongType(), False),
            StructField("bid", DoubleType(), True),
            StructField("ask", DoubleType(), True),
            StructField("bid_size", LongType(), True),
            StructField("ask_size", LongType(), True),
            StructField("timestamp", LongType(), False)
        ])
        
        # Trade data schema
        self.trade_schema = StructType([
            StructField("symbol", StringType(), False),
            StructField("price", DoubleType(), False),
            StructField("size", LongType(), False),
            StructField("side", StringType(), False),
            StructField("trade_id", StringType(), False),
            StructField("timestamp", LongType(), False)
        ])
        
        # Order book schema
        self.order_book_schema = StructType([
            StructField("symbol", StringType(), False),
            StructField("bids", ArrayType(
                StructType([
                    StructField("price", DoubleType(), False),
                    StructField("size", LongType(), False)
                ])
            ), False),
            StructField("asks", ArrayType(
                StructType([
                    StructField("price", DoubleType(), False),
                    StructField("size", LongType(), False)
                ])
            ), False),
            StructField("timestamp", LongType(), False)
        ])
    
    def process_market_data_stream(self):
        """Process real-time market data stream"""
        logger.info("Starting market data stream processing...")
        
        # Read from Kafka
        df = self.spark.readStream \
            .format("kafka") \
            .option("kafka.bootstrap.servers", self.kafka_bootstrap_servers) \
            .option("subscribe", "market-data-realtime") \
            .option("startingOffsets", "latest") \
            .option("failOnDataLoss", "false") \
            .load()
        
        # Parse JSON and apply schema
        parsed_df = df.select(
            col("key").cast("string").alias("symbol"),
            from_json(col("value").cast("string"), self.market_data_schema).alias("data"),
            col("timestamp").alias("kafka_timestamp")
        ).select(
            col("symbol"),
            col("data.*"),
            col("kafka_timestamp")
        )
        
        # Add processing timestamp
        enriched_df = parsed_df.withColumn("processing_time", current_timestamp())
        
        # Calculate technical indicators in real-time
        windowed_df = self._calculate_technical_indicators(enriched_df)
        
        # Write to multiple sinks
        query = windowed_df.writeStream \
            .outputMode(self.output_mode) \
            .format("console") \
            .option("truncate", False) \
            .start()
        
        # Also write to Kafka for downstream consumers
        kafka_query = windowed_df.select(
            col("symbol").alias("key"),
            to_json(struct(col("*"))).alias("value")
        ).writeStream \
            .format("kafka") \
            .option("kafka.bootstrap.servers", self.kafka_bootstrap_servers) \
            .option("topic", "market-data-processed") \
            .option("checkpointLocation", f"{self.checkpoint_location}/market-data") \
            .start()
        
        return query, kafka_query
    
    def _calculate_technical_indicators(self, df):
        """Calculate technical indicators using window functions"""
        
        # Define windows for moving averages
        window_5 = Window.partitionBy("symbol").orderBy("timestamp").rowsBetween(-4, 0)
        window_20 = Window.partitionBy("symbol").orderBy("timestamp").rowsBetween(-19, 0)
        window_50 = Window.partitionBy("symbol").orderBy("timestamp").rowsBetween(-49, 0)
        
        # Calculate moving averages
        df_with_ma = df.withColumn("sma_5", avg("price").over(window_5)) \
                       .withColumn("sma_20", avg("price").over(window_20)) \
                       .withColumn("sma_50", avg("price").over(window_50))
        
        # Calculate price changes
        price_window = Window.partitionBy("symbol").orderBy("timestamp")
        df_with_changes = df_with_ma.withColumn(
            "prev_price", 
            lag("price", 1).over(price_window)
        ).withColumn(
            "price_change", 
            col("price") - col("prev_price")
        ).withColumn(
            "price_change_pct", 
            (col("price_change") / col("prev_price")) * 100
        )
        
        # Calculate volatility (rolling standard deviation)
        df_with_volatility = df_with_changes.withColumn(
            "volatility_20", 
            stddev("price").over(window_20)
        )
        
        # Calculate volume-weighted average price (VWAP)
        df_with_vwap = df_with_volatility.withColumn(
            "volume_price", 
            col("price") * col("volume")
        ).withColumn(
            "vwap_20", 
            sum("volume_price").over(window_20) / sum("volume").over(window_20)
        )