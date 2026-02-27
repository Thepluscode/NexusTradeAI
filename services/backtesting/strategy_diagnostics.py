#!/usr/bin/env python3
"""
NexusTradeAI - Strategy Diagnostics & Simple Strategy Test
===========================================================

This script does TWO things:

OPTION A: Tests a SIMPLE MA crossover strategy that WILL generate trades
OPTION B: Diagnoses WHY the complex strategy generates 0 signals

Usage:
    python3 strategy_diagnostics.py
"""

import sys
import os
import json
from datetime import datetime
from typing import Dict, List
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd

from HistoricalDataFetcher import HistoricalDataFetcher
from BacktestEngine import BacktestEngine, Order, OrderSide, OrderType, create_backtest_engine
from PerformanceAnalytics import create_performance_analytics

import logging
logging.basicConfig(level=logging.WARNING)


# =============================================================================
# OPTION B: DIAGNOSE WHY COMPLEX STRATEGY GENERATES NO SIGNALS
# =============================================================================

def diagnose_strategy_filters(data: Dict[str, pd.DataFrame]):
    """
    Check each filter individually to see which ones are killing signals.
    """
    print("\n" + "="*60)
    print("  OPTION B: DIAGNOSING STRATEGY FILTERS")
    print("="*60 + "\n")
    
    # Combine all data for analysis
    all_signals = defaultdict(int)
    filter_pass_counts = defaultdict(int)
    total_bars = 0
    
    for symbol, df in data.items():
        if df is None or len(df) < 20:
            continue
            
        close = df['close']
        
        # Calculate indicators
        sma5 = close.rolling(5).mean()
        sma10 = close.rolling(10).mean()
        sma20 = close.rolling(20).mean()
        
        # RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        # Trend strength
        trend_strength = (sma5 - sma20) / sma20
        
        # Pullback
        pullback = (close - sma5).abs() / sma5
        
        # Valid bars (after warmup)
        valid_mask = ~sma20.isna()
        n_valid = valid_mask.sum()
        total_bars += n_valid
        
        # Check each filter
        filters = {
            'MA Alignment (SMA5>SMA10>SMA20)': (sma5 > sma10) & (sma10 > sma20),
            'Trend Strength > 0.1%': trend_strength > 0.001,
            'Trend Strength > 0.3%': trend_strength > 0.003,
            'Pullback < 2%': pullback < 0.02,
            'Pullback < 5%': pullback < 0.05,
            'RSI 25-75': (rsi > 25) & (rsi < 75),
            'RSI 30-70': (rsi > 30) & (rsi < 70),
            'Price $5-$2000': (close > 5) & (close < 2000),
            'Price $20-$800': (close > 20) & (close < 800),
        }
        
        for name, mask in filters.items():
            filter_pass_counts[name] += (mask & valid_mask).sum()
        
        # Check combinations
        # Simple MA crossover (SMA5 crosses above SMA20)
        ma_cross = (sma5 > sma20) & (sma5.shift(1) <= sma20.shift(1))
        all_signals['Simple MA Cross (SMA5 > SMA20)'] += ma_cross.sum()
        
        # MA Alignment only
        ma_aligned = (sma5 > sma10) & (sma10 > sma20)
        all_signals['MA Alignment Only'] += (ma_aligned & valid_mask).sum()
        
        # MA Alignment + Trend
        ma_trend = ma_aligned & (trend_strength > 0.001)
        all_signals['MA Align + Trend > 0.1%'] += ma_trend.sum()
        
        # MA Alignment + Trend + RSI
        ma_trend_rsi = ma_trend & (rsi > 25) & (rsi < 75)
        all_signals['MA + Trend + RSI (25-75)'] += ma_trend_rsi.sum()
        
        # Full complex strategy (loose)
        full_loose = ma_aligned & (trend_strength > 0.001) & (pullback < 0.05) & (rsi > 25) & (rsi < 75)
        all_signals['Full Strategy (loose)'] += full_loose.sum()
        
        # Full complex strategy (strict)
        full_strict = ma_aligned & (trend_strength > 0.003) & (pullback < 0.02) & (rsi > 30) & (rsi < 70)
        all_signals['Full Strategy (strict)'] += full_strict.sum()
    
    # Print results
    print("📊 FILTER ANALYSIS (how often each condition is TRUE)")
    print("-" * 60)
    for name, count in sorted(filter_pass_counts.items(), key=lambda x: -x[1]):
        pct = count / total_bars * 100 if total_bars > 0 else 0
        print(f"   {name:40} {pct:5.1f}% ({count:,} bars)")
    
    print("\n📊 SIGNAL COMBINATIONS (potential entry signals)")
    print("-" * 60)
    for name, count in sorted(all_signals.items(), key=lambda x: -x[1]):
        print(f"   {name:40} {count:,} signals")
    
    print("\n💡 KEY INSIGHT:")
    if all_signals['Full Strategy (strict)'] == 0:
        print("   The STRICT strategy generates ZERO signals!")
        if all_signals['Full Strategy (loose)'] > 0:
            print(f"   But the LOOSE version would generate {all_signals['Full Strategy (loose)']:,} signals.")
        if all_signals['Simple MA Cross (SMA5 > SMA20)'] > 0:
            print(f"   A simple MA crossover would generate {all_signals['Simple MA Cross (SMA5 > SMA20)']:,} signals.")
    
    return all_signals


# =============================================================================
# OPTION A: SIMPLE MA CROSSOVER STRATEGY
# =============================================================================

class SimpleMAStrategy:
    """
    Dead simple strategy: Buy when SMA20 crosses above SMA50.
    Sell when SMA20 crosses below SMA50 OR 10% profit OR 5% loss.
    """
    
    def __init__(self):
        self.positions = {}
    
    def generate_orders(self, data: Dict[str, pd.DataFrame], portfolio, date) -> List[Order]:
        orders = []
        
        # Manage existing positions first
        for symbol in list(self.positions.keys()):
            if symbol not in data or data[symbol] is None:
                continue
            
            try:
                current_price = data[symbol].loc[date, 'close']
                entry_price = self.positions[symbol]['entry']
                quantity = self.positions[symbol]['qty']
                
                pnl_pct = (current_price - entry_price) / entry_price
                
                # Exit on 10% profit or 5% loss
                if pnl_pct >= 0.10 or pnl_pct <= -0.05:
                    orders.append(Order(
                        symbol=symbol,
                        side=OrderSide.SELL,
                        quantity=quantity,
                        order_type=OrderType.MARKET
                    ))
                    del self.positions[symbol]
                    
            except KeyError:
                continue
        
        # Look for new entries
        if len(self.positions) >= 5:
            return orders
        
        for symbol, df in data.items():
            if symbol in self.positions:
                continue
            
            if len(self.positions) >= 5:
                break
                
            if df is None or len(df) < 50:
                continue
            
            try:
                # Get data up to current date
                hist = df.loc[:date]
                if len(hist) < 50:
                    continue
                
                close = hist['close']
                sma20 = close.rolling(20).mean()
                sma50 = close.rolling(50).mean()
                
                # Check for crossover: SMA20 crosses ABOVE SMA50
                if len(sma20) < 2 or len(sma50) < 2:
                    continue
                
                today_cross = sma20.iloc[-1] > sma50.iloc[-1]
                yesterday_below = sma20.iloc[-2] <= sma50.iloc[-2]
                
                if today_cross and yesterday_below:
                    current_price = close.iloc[-1]
                    
                    # Position size: 10% of equity
                    position_value = portfolio.equity * 0.10
                    quantity = int(position_value / current_price)
                    
                    if quantity > 0:
                        orders.append(Order(
                            symbol=symbol,
                            side=OrderSide.BUY,
                            quantity=quantity,
                            order_type=OrderType.MARKET
                        ))
                        self.positions[symbol] = {
                            'entry': current_price,
                            'qty': quantity
                        }
                        
            except Exception:
                continue
        
        return orders
    
    def reset(self):
        self.positions = {}


def run_simple_strategy_backtest(data: Dict[str, pd.DataFrame]):
    """Run backtest with simple MA crossover strategy."""
    
    print("\n" + "="*60)
    print("  OPTION A: SIMPLE MA CROSSOVER STRATEGY")
    print("="*60 + "\n")
    
    print("Strategy: Buy when SMA20 crosses above SMA50")
    print("Exit: 10% profit target OR 5% stop loss")
    print()
    
    # Convert to tz-naive
    for symbol in data:
        if data[symbol].index.tz is not None:
            data[symbol].index = data[symbol].index.tz_localize(None)
    
    # Create engine
    engine = create_backtest_engine(initial_capital=100000.0, broker='conservative')
    
    # Create strategy
    strategy = SimpleMAStrategy()
    
    def strategy_func(data, portfolio, date):
        return strategy.generate_orders(data, portfolio, date)
    
    # Run backtest
    print("🚀 Running backtest...")
    result = engine.run(data=data, strategy=strategy_func)
    
    # Calculate metrics
    analytics = create_performance_analytics(risk_free_rate=0.04)
    
    trades = []
    for order in result.orders:
        if hasattr(order, 'filled_quantity') and order.filled_quantity > 0:
            trades.append({
                'symbol': order.symbol,
                'side': order.side,
                'quantity': order.filled_quantity,
                'price': order.filled_price
            })
    
    metrics = analytics.calculate_all_metrics(result.equity_curve, trades)
    
    # Print results
    print("\n" + "-"*60)
    print("  RESULTS: Simple MA Crossover Strategy")
    print("-"*60)
    
    print(f"\n📈 RETURNS")
    print(f"   Total Return:      {metrics.total_return:.2%}")
    print(f"   Annualized Return: {metrics.annualized_return:.2%}")
    
    print(f"\n📊 RISK")
    print(f"   Max Drawdown:      {metrics.max_drawdown:.2%}")
    print(f"   Volatility:        {metrics.volatility:.2%}")
    
    print(f"\n⚖️ RISK-ADJUSTED")
    print(f"   Sharpe Ratio:      {metrics.sharpe_ratio:.2f}")
    print(f"   Sortino Ratio:     {metrics.sortino_ratio:.2f}")
    
    print(f"\n🎯 TRADES")
    print(f"   Total Trades:      {metrics.total_trades}")
    print(f"   Win Rate:          {metrics.win_rate:.1%}")
    print(f"   Profit Factor:     {metrics.profit_factor:.2f}")
    print(f"   Expectancy:        ${metrics.expectancy:.2f}")
    
    # Verdict
    print("\n" + "="*60)
    print("  VERDICT")
    print("="*60)
    
    if metrics.total_trades > 0:
        if metrics.sharpe_ratio > 1.0 and metrics.profit_factor > 1.2:
            print("   ✅ STRATEGY HAS EDGE - Proceed cautiously")
        elif metrics.total_return > 0:
            print("   ⚠️ MARGINAL - Positive but weak edge")
        else:
            print("   ❌ NO EDGE - Negative returns")
    else:
        print("   ⚠️ NO TRADES - Strategy still too restrictive")
    
    return metrics


# =============================================================================
# MAIN
# =============================================================================

def main():
    print("\n" + "="*60)
    print("  NEXUSTRADEAI STRATEGY DIAGNOSTICS")
    print("  Running BOTH options for comprehensive analysis")
    print("="*60 + "\n")
    
    # Fetch data
    print("📊 Loading historical data...")
    fetcher = HistoricalDataFetcher()
    
    symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'META', 'TSLA', 'GOOGL', 
               'AMZN', 'JPM', 'V', 'MA', 'HD', 'UNH', 'IWM', 'DIA']
    
    data = fetcher.fetch_universe(symbols=symbols, start_date="2019-01-01", min_history_days=252*4)
    
    if not data:
        print("❌ Failed to load data")
        return
    
    print(f"✅ Loaded {len(data)} symbols\n")
    
    # OPTION B: Diagnose filters
    diagnose_strategy_filters(data)
    
    # OPTION A: Run simple strategy
    metrics = run_simple_strategy_backtest(data)
    
    # Save results
    results_dir = os.path.join(os.path.dirname(__file__), 'backtest_results')
    os.makedirs(results_dir, exist_ok=True)
    
    with open(os.path.join(results_dir, 'simple_strategy_results.json'), 'w') as f:
        json.dump(metrics.to_dict(), f, indent=2, default=str)
    
    print(f"\n💾 Results saved to backtest_results/simple_strategy_results.json")
    
    print("\n" + "="*60)
    print("  DIAGNOSTICS COMPLETE")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
