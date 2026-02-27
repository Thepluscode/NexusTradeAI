#!/usr/bin/env python3
"""
NexusTradeAI - Strategy Backtest Runner
========================================

This script runs a proper backtest of the trend following strategy
to determine if it has positive expectancy before risking real money.

Strategy: Trend Following (from winning-strategy.js)
- Entry: MA crossover (SMA5 > SMA10 > SMA20) + RSI < 70 + pullback within 2%
- Exit: 8% profit target OR 2.5% stop loss OR trailing stop
- Position sizing: 10% of portfolio per position
- Long-only mode

Usage:
    python3 run_strategy_backtest.py

Output:
    - Console performance summary
    - HTML report: backtest_results/strategy_report.html
    - JSON results: backtest_results/strategy_results.json
"""

import sys
import os
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import logging

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd

# Import our backtesting infrastructure
from HistoricalDataFetcher import HistoricalDataFetcher
from BacktestEngine import BacktestEngine, Order, OrderSide, OrderType, create_backtest_engine
from PerformanceAnalytics import PerformanceAnalytics, create_performance_analytics
from CostModel import create_cost_model

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# =============================================================================
# STRATEGY PARAMETERS (matching winning-strategy.js)
# =============================================================================

STRATEGY_CONFIG = {
    # Entry criteria (LOOSENED to generate signals)
    'min_trend_strength': 0.001,  # 0.1% MA spread (was 0.3%)
    'max_pullback': 0.05,         # Max 5% from SMA5 (was 2%)
    'rsi_upper': 75,              # Don't buy overbought (was 70)
    'rsi_lower': 25,              # Don't buy oversold (was 30)
    'min_rising_bars': 1,         # Need 1/3 rising bars (was 2)
    
    # Exit criteria
    'profit_target': 0.08,        # 8% profit target
    'stop_loss': 0.04,            # 4% stop loss (was 2.5%)
    'trailing_stop': 0.03,        # 3% trailing stop
    'trailing_activation': 0.03,  # Activate after 3% profit
    
    # Position sizing
    'max_position_pct': 0.10,     # 10% max per position
    'max_positions': 5,           # Max 5 concurrent positions
    
    # Filters (LOOSENED)
    'min_price': 5,               # Minimum stock price (was 20)
    'max_price': 2000,            # Maximum stock price (was 800)
}

# Test universe - liquid stocks similar to winning-strategy.js
TEST_SYMBOLS = [
    # Major ETFs
    'SPY', 'QQQ', 'IWM', 'DIA',
    # Mega-cap tech
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA',
    # Other liquid stocks
    'JPM', 'V', 'MA', 'HD', 'UNH',
]


# =============================================================================
# TECHNICAL INDICATORS
# =============================================================================

def calculate_sma(prices: pd.Series, period: int) -> pd.Series:
    """Calculate Simple Moving Average."""
    return prices.rolling(window=period, min_periods=period).mean()


def calculate_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    """Calculate Relative Strength Index."""
    delta = prices.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / loss
    rsi = 100 - (100 / (1 + rs))
    return rsi


def calculate_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    """Calculate Average True Range."""
    tr1 = high - low
    tr2 = abs(high - close.shift())
    tr3 = abs(low - close.shift())
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=period).mean()


# =============================================================================
# TREND FOLLOWING STRATEGY
# =============================================================================

class TrendFollowingStrategy:
    """
    Trend Following Strategy implementation for backtesting.
    Matches the logic in winning-strategy.js.
    """
    
    def __init__(self, config: dict = None):
        self.config = config or STRATEGY_CONFIG
        self.positions = {}  # symbol -> position info
        self.highest_prices = {}  # For trailing stops
        
    def calculate_signals(self, data: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
        """Calculate all signals for each symbol."""
        signals = {}
        
        for symbol, df in data.items():
            if df is None or len(df) < 20:
                continue
                
            sig = pd.DataFrame(index=df.index)
            close = df['close']
            
            # Moving averages
            sig['sma5'] = calculate_sma(close, 5)
            sig['sma10'] = calculate_sma(close, 10)
            sig['sma20'] = calculate_sma(close, 20)
            
            # RSI
            sig['rsi'] = calculate_rsi(close, 14)
            
            # Trend strength: (SMA5 - SMA20) / SMA20
            sig['trend_strength'] = (sig['sma5'] - sig['sma20']) / sig['sma20']
            
            # Pullback: distance from SMA5
            sig['pullback'] = (close - sig['sma5']) / sig['sma5']
            
            # MA alignment (uptrend: SMA5 > SMA10 > SMA20)
            sig['uptrend'] = (sig['sma5'] > sig['sma10']) & (sig['sma10'] > sig['sma20'])
            
            # Momentum confirmation: count rising bars in last 3
            sig['rising'] = close > close.shift(1)
            sig['rising_count'] = sig['rising'].rolling(3).sum()
            
            # Entry signal
            sig['entry_signal'] = (
                sig['uptrend'] &
                (sig['trend_strength'] > self.config['min_trend_strength']) &
                (sig['pullback'].abs() < self.config['max_pullback']) &
                (sig['rsi'] < self.config['rsi_upper']) &
                (sig['rsi'] > self.config['rsi_lower']) &
                (sig['rising_count'] >= self.config['min_rising_bars']) &
                (close > self.config['min_price']) &
                (close < self.config['max_price'])
            )
            
            sig['close'] = close
            signals[symbol] = sig
            
        return signals
    
    def generate_orders(
        self,
        data: Dict[str, pd.DataFrame],
        portfolio,
        date: datetime
    ) -> List[Order]:
        """Generate orders for the given date."""
        orders = []
        
        # First, manage existing positions (check stops/targets)
        for symbol in list(self.positions.keys()):
            if symbol not in data or data[symbol] is None:
                continue
                
            try:
                current_price = data[symbol].loc[date, 'close']
            except KeyError:
                continue
                
            position = self.positions[symbol]
            entry_price = position['entry_price']
            quantity = position['quantity']
            
            # Update highest price for trailing stop
            if symbol not in self.highest_prices:
                self.highest_prices[symbol] = current_price
            else:
                self.highest_prices[symbol] = max(self.highest_prices[symbol], current_price)
            
            # Calculate P&L
            pnl_pct = (current_price - entry_price) / entry_price
            
            # Check profit target
            if pnl_pct >= self.config['profit_target']:
                orders.append(Order(
                    symbol=symbol,
                    side=OrderSide.SELL,
                    quantity=quantity,
                    order_type=OrderType.MARKET
                ))
                del self.positions[symbol]
                if symbol in self.highest_prices:
                    del self.highest_prices[symbol]
                continue
            
            # Check stop loss
            if pnl_pct <= -self.config['stop_loss']:
                orders.append(Order(
                    symbol=symbol,
                    side=OrderSide.SELL,
                    quantity=quantity,
                    order_type=OrderType.MARKET
                ))
                del self.positions[symbol]
                if symbol in self.highest_prices:
                    del self.highest_prices[symbol]
                continue
            
            # Check trailing stop (after activation threshold)
            if pnl_pct >= self.config['trailing_activation']:
                highest = self.highest_prices[symbol]
                trailing_stop_price = highest * (1 - self.config['trailing_stop'])
                if current_price <= trailing_stop_price:
                    orders.append(Order(
                        symbol=symbol,
                        side=OrderSide.SELL,
                        quantity=quantity,
                        order_type=OrderType.MARKET
                    ))
                    del self.positions[symbol]
                    if symbol in self.highest_prices:
                        del self.highest_prices[symbol]
                    continue
        
        # Then, look for new entries
        if len(self.positions) >= self.config['max_positions']:
            return orders  # Already at max positions
        
        # Calculate signals
        signals = self.calculate_signals(data)
        
        for symbol, sig in signals.items():
            if symbol in self.positions:
                continue  # Already have position
            
            if len(self.positions) >= self.config['max_positions']:
                break
            
            try:
                if date not in sig.index:
                    continue
                    
                if sig.loc[date, 'entry_signal']:
                    current_price = sig.loc[date, 'close']
                    
                    # Position sizing: max 10% of equity
                    equity = portfolio.equity
                    max_position_value = equity * self.config['max_position_pct']
                    quantity = int(max_position_value / current_price)
                    
                    if quantity > 0:
                        orders.append(Order(
                            symbol=symbol,
                            side=OrderSide.BUY,
                            quantity=quantity,
                            order_type=OrderType.MARKET
                        ))
                        self.positions[symbol] = {
                            'entry_price': current_price,
                            'quantity': quantity,
                            'entry_date': date
                        }
                        self.highest_prices[symbol] = current_price
            except Exception as e:
                logger.debug(f"Error processing {symbol} on {date}: {e}")
                continue
        
        return orders
    
    def reset(self):
        """Reset strategy state."""
        self.positions = {}
        self.highest_prices = {}


# =============================================================================
# MAIN BACKTEST RUNNER
# =============================================================================

def run_backtest():
    """Run the full backtest and generate report."""
    
    print("\n" + "="*60)
    print("  NEXUSTRADEAI - STRATEGY BACKTEST")
    print("  Trend Following Strategy Validation")
    print("="*60 + "\n")
    
    # 1. Fetch historical data
    print("📊 Step 1: Fetching historical data...")
    fetcher = HistoricalDataFetcher()
    
    # Fetch 5 years of data (2019-2024)
    start_date = "2019-01-01"
    end_date = "2024-12-01"
    
    data = fetcher.fetch_universe(
        symbols=TEST_SYMBOLS,
        start_date=start_date,
        end_date=end_date,
        min_history_days=252 * 4  # At least 4 years
    )
    
    if not data:
        print("❌ Failed to fetch historical data. Check yfinance installation.")
        return None
    
    # Print data summary
    summary = fetcher.get_data_summary(data)
    print(f"\n✅ Fetched data for {summary['total_symbols']} symbols")
    date_range = summary.get('date_range', {})
    start = date_range.get('common_start', 'N/A')
    end = date_range.get('common_end', 'N/A')
    print(f"   Date range: {start} to {end}")
    total_bars = sum(len(df) for df in data.values())
    print(f"   Total bars: {total_bars:,}")
    
    # 2. Initialize backtest engine with realistic costs
    print("\n📈 Step 2: Initializing backtest engine...")
    
    # Use conservative cost model (5bps spread, 10bps slippage)
    engine = create_backtest_engine(
        initial_capital=100000.0,
        broker='conservative'  # Use conservative cost estimates
    )
    
    # 3. Initialize strategy
    print("🎯 Step 3: Initializing trend following strategy...")
    strategy = TrendFollowingStrategy(STRATEGY_CONFIG)
    
    # Create strategy wrapper function for backtest engine
    def strategy_func(data: Dict[str, pd.DataFrame], portfolio, date: datetime) -> List[Order]:
        return strategy.generate_orders(data, portfolio, date)
    
    # 4. Run backtest
    print("\n🚀 Step 4: Running backtest...")
    print(f"   Period: {start_date} to {end_date}")
    print(f"   Symbols: {len(data)}")
    print(f"   Initial capital: $100,000")
    print()
    
    # Convert data to timezone-naive to avoid comparison issues
    for symbol in data:
        if data[symbol].index.tz is not None:
            data[symbol].index = data[symbol].index.tz_localize(None)
    
    try:
        result = engine.run(
            data=data,
            strategy=strategy_func,
            start_date=None,  # Use all available data
            end_date=None
        )
    except Exception as e:
        print(f"❌ Backtest failed: {e}")
        import traceback
        traceback.print_exc()
        return None
    
    # 5. Calculate performance metrics
    print("\n📊 Step 5: Calculating performance metrics...")
    
    analytics = create_performance_analytics(risk_free_rate=0.04)  # 4% risk-free rate
    
    # Convert orders to trade dicts
    trades = []
    for order in result.orders:
        if order.status == 'filled':
            trades.append({
                'symbol': order.symbol,
                'side': order.side,
                'quantity': order.filled_quantity,
                'price': order.filled_price,
                'pnl': order.costs.total_cost if order.costs else 0
            })
    
    metrics = analytics.calculate_all_metrics(
        equity_curve=result.equity_curve,
        trades=trades
    )
    
    # 6. Print results
    print("\n" + "="*60)
    print("  BACKTEST RESULTS")
    print("="*60)
    
    print(f"\n📈 RETURNS")
    print(f"   Total Return:      {metrics.total_return:.2%}")
    print(f"   Annualized Return: {metrics.annualized_return:.2%}")
    print(f"   Best Month:        {metrics.best_month:.2%}")
    print(f"   Worst Month:       {metrics.worst_month:.2%}")
    
    print(f"\n📊 RISK METRICS")
    print(f"   Volatility:        {metrics.volatility:.2%}")
    print(f"   Max Drawdown:      {metrics.max_drawdown:.2%}")
    print(f"   Drawdown Duration: {metrics.drawdown_duration} days")
    
    print(f"\n⚖️ RISK-ADJUSTED RETURNS")
    print(f"   Sharpe Ratio:      {metrics.sharpe_ratio:.2f}")
    print(f"   Sortino Ratio:     {metrics.sortino_ratio:.2f}")
    print(f"   Calmar Ratio:      {metrics.calmar_ratio:.2f}")
    
    print(f"\n🎯 TRADE STATISTICS")
    print(f"   Total Trades:      {metrics.total_trades}")
    print(f"   Win Rate:          {metrics.win_rate:.1%}")
    print(f"   Profit Factor:     {metrics.profit_factor:.2f}")
    print(f"   Expectancy:        ${metrics.expectancy:.2f}")
    print(f"   Avg Profit:        ${metrics.avg_profit:.2f}")
    print(f"   Avg Loss:          ${metrics.avg_loss:.2f}")
    
    # 7. Verdict
    print("\n" + "="*60)
    print("  VERDICT")
    print("="*60)
    
    passed_tests = 0
    total_tests = 5
    
    checks = [
        ("Sharpe Ratio > 1.0", metrics.sharpe_ratio > 1.0, metrics.sharpe_ratio),
        ("Max Drawdown < 25%", abs(metrics.max_drawdown) < 0.25, metrics.max_drawdown),
        ("Win Rate > 45%", metrics.win_rate > 0.45, metrics.win_rate),
        ("Profit Factor > 1.2", metrics.profit_factor > 1.2, metrics.profit_factor),
        ("Positive Return", metrics.total_return > 0, metrics.total_return),
    ]
    
    for name, passed, value in checks:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"   {status}: {name} (actual: {value:.2f})")
        if passed:
            passed_tests += 1
    
    print(f"\n   Score: {passed_tests}/{total_tests}")
    
    if passed_tests == total_tests:
        print("\n   🎉 STRATEGY HAS PROVEN EDGE - Proceed with caution")
    elif passed_tests >= 3:
        print("\n   ⚠️  MARGINAL EDGE - Needs improvement before live trading")
    else:
        print("\n   🚫 NO PROVEN EDGE - DO NOT TRADE REAL MONEY")
    
    # 8. Save results
    print("\n💾 Step 6: Saving results...")
    
    results_dir = os.path.join(os.path.dirname(__file__), 'backtest_results')
    os.makedirs(results_dir, exist_ok=True)
    
    # Save JSON results
    json_path = os.path.join(results_dir, 'strategy_results.json')
    with open(json_path, 'w') as f:
        json.dump(metrics.to_dict(), f, indent=2, default=str)
    print(f"   JSON: {json_path}")
    
    # Save HTML report
    html_path = os.path.join(results_dir, 'strategy_report.html')
    analytics.save_report(metrics, result.equity_curve, html_path)
    print(f"   HTML: {html_path}")
    
    print("\n" + "="*60)
    print("  BACKTEST COMPLETE")
    print("="*60 + "\n")
    
    return metrics


if __name__ == "__main__":
    run_backtest()
