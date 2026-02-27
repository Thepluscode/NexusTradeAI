"""NexusTradeAI Backtesting Framework"""
from .CostModel import CostModel, CostBreakdown, create_cost_model
from .DataLoader import DataLoader, create_data_loader
from .PerformanceAnalytics import PerformanceAnalytics, PerformanceMetrics, create_performance_analytics

# Import BacktestEngine separately to avoid circular import
try:
    from .BacktestEngine import BacktestEngine, create_backtest_engine, Order, OrderSide, OrderType
except ImportError:
    pass

__all__ = [
    'CostModel',
    'CostBreakdown',
    'create_cost_model',
    'DataLoader',
    'create_data_loader',
    'BacktestEngine',
    'create_backtest_engine',
    'Order',
    'OrderSide',
    'OrderType',
    'PerformanceAnalytics',
    'PerformanceMetrics',
    'create_performance_analytics'
]
