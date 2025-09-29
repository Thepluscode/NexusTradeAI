# data-infrastructure/storage/timeseries/influxdb/schemas/measurement_schemas.py

from typing import Dict, List, Any
from dataclasses import dataclass
from influxdb_client import Point
import time

@dataclass
class MarketDataPoint:
    """Schema for market data measurements"""
    symbol: str
    price: float
    volume: int
    bid: float = None
    ask: float = None
    bid_size: int = None
    ask_size: int = None
    timestamp: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("market_data") \
            .tag("symbol", self.symbol) \
            .field("price", self.price) \
            .field("volume", self.volume)
        
        if self.bid is not None:
            point = point.field("bid", self.bid)
        if self.ask is not None:
            point = point.field("ask", self.ask)
        if self.bid_size is not None:
            point = point.field("bid_size", self.bid_size)
        if self.ask_size is not None:
            point = point.field("ask_size", self.ask_size)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class OHLCVBar:
    """Schema for OHLCV bar data"""
    symbol: str
    open_price: float
    high_price: float
    low_price: float
    close_price: float
    volume: int
    interval: str  # "1m", "5m", "1h", "1d"
    timestamp: int = None
    vwap: float = None
    trade_count: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("ohlcv") \
            .tag("symbol", self.symbol) \
            .tag("interval", self.interval) \
            .field("open", self.open_price) \
            .field("high", self.high_price) \
            .field("low", self.low_price) \
            .field("close", self.close_price) \
            .field("volume", self.volume)
        
        if self.vwap is not None:
            point = point.field("vwap", self.vwap)
        if self.trade_count is not None:
            point = point.field("trade_count", self.trade_count)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class TradeExecution:
    """Schema for trade execution data"""
    symbol: str
    price: float
    size: float
    side: str  # "buy" or "sell"
    trade_id: str
    exchange: str = None
    timestamp: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("trade_execution") \
            .tag("symbol", self.symbol) \
            .tag("side", self.side) \
            .tag("trade_id", self.trade_id) \
            .field("price", self.price) \
            .field("size", self.size) \
            .field("value", self.price * self.size)
        
        if self.exchange:
            point = point.tag("exchange", self.exchange)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class TechnicalIndicator:
    """Schema for technical indicators"""
    symbol: str
    indicator_name: str
    value: float
    timestamp: int = None
    period: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("technical_indicator") \
            .tag("symbol", self.symbol) \
            .tag("indicator", self.indicator_name) \
            .field("value", self.value)
        
        if self.period is not None:
            point = point.tag("period", str(self.period))
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class PortfolioValuation:
    """Schema for portfolio valuation data"""
    account_id: str
    total_value: float
    cash_value: float
    equity_value: float
    pnl_daily: float
    pnl_total: float
    timestamp: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("portfolio_valuation") \
            .tag("account_id", self.account_id) \
            .field("total_value", self.total_value) \
            .field("cash_value", self.cash_value) \
            .field("equity_value", self.equity_value) \
            .field("pnl_daily", self.pnl_daily) \
            .field("pnl_total", self.pnl_total)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class RiskMetric:
    """Schema for risk metrics"""
    account_id: str
    metric_name: str
    value: float
    confidence_level: float = None
    time_horizon: int = None
    timestamp: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("risk_metric") \
            .tag("account_id", self.account_id) \
            .tag("metric", self.metric_name) \
            .field("value", self.value)
        
        if self.confidence_level is not None:
            point = point.field("confidence_level", self.confidence_level)
        if self.time_horizon is not None:
            point = point.field("time_horizon", self.time_horizon)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class OrderEvent:
    """Schema for order lifecycle events"""
    order_id: str
    account_id: str
    symbol: str
    order_type: str
    side: str
    quantity: float
    price: float = None
    status: str = "pending"
    filled_quantity: float = 0.0
    timestamp: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("order_event") \
            .tag("order_id", self.order_id) \
            .tag("account_id", self.account_id) \
            .tag("symbol", self.symbol) \
            .tag("order_type", self.order_type) \
            .tag("side", self.side) \
            .tag("status", self.status) \
            .field("quantity", self.quantity) \
            .field("filled_quantity", self.filled_quantity)
        
        if self.price is not None:
            point = point.field("price", self.price)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class SentimentScore:
    """Schema for sentiment analysis data"""
    symbol: str
    source: str  # "news", "social", "analyst"
    sentiment: str  # "positive", "negative", "neutral"
    score: float  # -1.0 to 1.0
    confidence: float  # 0.0 to 1.0
    timestamp: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("sentiment") \
            .tag("symbol", self.symbol) \
            .tag("source", self.source) \
            .tag("sentiment", self.sentiment) \
            .field("score", self.score) \
            .field("confidence", self.confidence)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')

@dataclass
class PerformanceMetric:
    """Schema for system performance metrics"""
    service_name: str
    metric_name: str
    value: float
    unit: str = None
    timestamp: int = None
    
    def to_influx_point(self) -> Point:
        """Convert to InfluxDB Point"""
        point = Point("performance") \
            .tag("service", self.service_name) \
            .tag("metric", self.metric_name) \
            .field("value", self.value)
        
        if self.unit:
            point = point.tag("unit", self.unit)
        
        timestamp = self.timestamp or int(time.time() * 1000)
        return point.time(timestamp, 'ms')