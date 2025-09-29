#!/usr/bin/env python3
"""
NexusTradeAI - Complete Strategy Framework Demo
==============================================

Comprehensive demonstration of the ensemble strategy system
with AI-enhanced strategies and performance tracking.
"""

import sys
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random

from strategy_framework import MarketData, MovingAverageCrossoverStrategy
from strategies import RSIMeanReversionStrategy, MomentumBreakoutStrategy, ScalpingStrategy, AIEnhancedStrategy
from ensemble_manager import EnsembleStrategyManager

def generate_realistic_market_data(symbol: str, days: int = 100, trend: str = "sideways") -> List[MarketData]:
    """Generate realistic market data with different trend patterns"""
    data = []
    base_price = 45000.0 if 'BTC' in symbol else 3000.0
    
    # Trend parameters
    if trend == "bullish":
        daily_drift = 0.002  # 0.2% daily upward drift
        volatility = 0.03
    elif trend == "bearish":
        daily_drift = -0.002  # 0.2% daily downward drift
        volatility = 0.04
    else:  # sideways
        daily_drift = 0.0
        volatility = 0.025
    
    for i in range(days):
        timestamp = datetime.now() - timedelta(days=days-i)
        
        # Generate price movement with trend and volatility
        random_change = np.random.normal(daily_drift, volatility)
        base_price *= (1 + random_change)
        
        # Generate realistic OHLC data
        open_price = base_price
        
        # Intraday volatility
        intraday_range = base_price * random.uniform(0.01, 0.05)
        high_price = open_price + random.uniform(0, intraday_range)
        low_price = open_price - random.uniform(0, intraday_range)
        
        # Close price within the range
        close_price = random.uniform(low_price, high_price)
        
        # Volume with some correlation to price movement
        price_change = abs(close_price - open_price) / open_price
        base_volume = random.uniform(1000000, 5000000)
        volume = base_volume * (1 + price_change * 2)  # Higher volume on bigger moves
        
        data.append(MarketData(
            symbol=symbol,
            timestamp=timestamp,
            open=open_price,
            high=high_price,
            low=low_price,
            close=close_price,
            volume=volume
        ))
        
        base_price = close_price
    
    return data

def simulate_trading_session(manager: EnsembleStrategyManager, market_data: List[MarketData], symbol: str):
    """Simulate a trading session with the ensemble manager"""
    print(f"\n🎯 Simulating Trading Session for {symbol}")
    print("=" * 50)
    
    signals_generated = 0
    successful_trades = 0
    total_pnl = 0.0
    
    # Process market data in chunks to simulate real-time trading
    for i in range(50, len(market_data), 5):  # Every 5 periods
        current_data = market_data[:i+1]
        
        # Generate ensemble signal
        signal = manager.generate_ensemble_signal(current_data)
        
        if signal:
            signals_generated += 1
            print(f"\n📈 Signal #{signals_generated} Generated:")
            print(f"   Symbol: {signal.symbol}")
            print(f"   Type: {signal.signal_type.value.upper()}")
            print(f"   Confidence: {signal.confidence:.3f}")
            print(f"   Entry: ${signal.entry_price:.2f}")
            print(f"   Stop Loss: ${signal.stop_loss:.2f}")
            print(f"   Take Profit: ${signal.take_profit:.2f}")
            print(f"   Contributing Strategies: {signal.metadata.get('contributing_strategies', 0)}")
            
            # Simulate trade execution and outcome
            # Look ahead 10-20 periods to determine trade outcome
            future_end = min(i + random.randint(10, 20), len(market_data) - 1)
            future_prices = [data.close for data in market_data[i:future_end]]
            
            if future_prices:
                # Simulate trade outcome based on stop loss and take profit
                entry_price = signal.entry_price
                stop_loss = signal.stop_loss
                take_profit = signal.take_profit
                
                trade_success = False
                pnl = 0.0
                
                for future_price in future_prices:
                    if signal.signal_type.value in ['buy', 'strong_buy']:
                        if future_price <= stop_loss:
                            # Stop loss hit
                            pnl = stop_loss - entry_price
                            break
                        elif future_price >= take_profit:
                            # Take profit hit
                            pnl = take_profit - entry_price
                            trade_success = True
                            break
                    else:  # sell signals
                        if future_price >= stop_loss:
                            # Stop loss hit
                            pnl = entry_price - stop_loss
                            break
                        elif future_price <= take_profit:
                            # Take profit hit
                            pnl = entry_price - take_profit
                            trade_success = True
                            break
                
                # If no stop/target hit, use final price
                if pnl == 0.0:
                    final_price = future_prices[-1]
                    if signal.signal_type.value in ['buy', 'strong_buy']:
                        pnl = final_price - entry_price
                        trade_success = pnl > 0
                    else:
                        pnl = entry_price - final_price
                        trade_success = pnl > 0
                
                total_pnl += pnl
                if trade_success:
                    successful_trades += 1
                
                print(f"   Trade Result: {'✅ SUCCESS' if trade_success else '❌ LOSS'}")
                print(f"   P&L: ${pnl:.2f}")
                
                # Update performance for all contributing strategies
                contributing_strategies = signal.metadata.get('strategy_details', {})
                for strategy_name in contributing_strategies.keys():
                    strategy_name_clean = strategy_name.replace('_signal', '')
                    manager.update_performance(strategy_name_clean, trade_success, pnl, signal.confidence)
    
    print(f"\n📊 Trading Session Summary:")
    print(f"   Signals Generated: {signals_generated}")
    print(f"   Successful Trades: {successful_trades}")
    print(f"   Win Rate: {(successful_trades/signals_generated)*100:.1f}%" if signals_generated > 0 else "   Win Rate: N/A")
    print(f"   Total P&L: ${total_pnl:.2f}")
    print(f"   Average P&L per Signal: ${total_pnl/signals_generated:.2f}" if signals_generated > 0 else "   Average P&L: N/A")

def main():
    """Main demo function"""
    print("🚀 NexusTradeAI Complete Strategy Framework Demo")
    print("=" * 60)
    
    # Initialize ensemble manager
    ensemble = EnsembleStrategyManager()
    
    # Create and add strategies with different weights
    print("\n📝 Creating Strategy Portfolio")
    print("-" * 35)
    
    strategies = [
        (MovingAverageCrossoverStrategy(short_period=20, long_period=50), 1.0, "Trend Following"),
        (RSIMeanReversionStrategy(rsi_period=14, oversold=30, overbought=70), 0.8, "Mean Reversion"),
        (MomentumBreakoutStrategy(period=20, volume_multiplier=1.5), 1.2, "Momentum"),
        (ScalpingStrategy(fast_ema=5, slow_ema=13), 0.6, "Scalping"),
        (AIEnhancedStrategy(), 1.5, "AI-Enhanced")
    ]
    
    for strategy, weight, category in strategies:
        ensemble.add_strategy(strategy, weight)
        print(f"✅ {strategy.name} ({category}) - Weight: {weight}")
    
    # Generate market data for different scenarios
    print(f"\n📊 Generating Market Data Scenarios")
    print("-" * 40)
    
    scenarios = [
        ("BTCUSDT", "bullish", "🟢 Bull Market"),
        ("ETHUSDT", "bearish", "🔴 Bear Market"),
        ("ADAUSDT", "sideways", "🟡 Sideways Market")
    ]
    
    for symbol, trend, description in scenarios:
        print(f"{description}: {symbol}")
        market_data = generate_realistic_market_data(symbol, 150, trend)
        
        # Run trading simulation
        simulate_trading_session(ensemble, market_data, symbol)
    
    # Show ensemble analytics
    print(f"\n🎯 Ensemble Performance Analytics")
    print("=" * 40)
    
    summary = ensemble.get_ensemble_summary()
    print(f"Total Strategies: {summary['total_strategies']}")
    print(f"Active Strategies: {summary['active_strategies']}")
    print(f"Ensemble Decisions Made: {summary['ensemble_decisions']}")
    print(f"Auto-Adjustment: {'✅ ENABLED' if summary['auto_adjustment_enabled'] else '❌ DISABLED'}")
    
    # Strategy rankings
    print(f"\n🏆 Strategy Performance Rankings")
    print("-" * 35)
    
    rankings = ensemble.get_strategy_rankings()
    for i, (name, score) in enumerate(rankings, 1):
        tracker = ensemble.performance_tracker[name]
        weight = ensemble.strategy_weights[name]
        
        print(f"{i}. {name}")
        print(f"   Score: {score:.3f} | Weight: {weight:.2f}")
        print(f"   Win Rate: {tracker['win_rate']:.1%} | Signals: {tracker['signals_generated']}")
        print(f"   Total P&L: ${tracker['total_pnl']:.2f}")
        print()
    
    # Ensemble analytics
    analytics = ensemble.get_ensemble_analytics()
    if 'message' not in analytics:
        print(f"📈 Recent Ensemble Analytics")
        print("-" * 30)
        print(f"Recent Decisions: {analytics['recent_decisions']}")
        print(f"Signal Distribution:")
        print(f"   Buy Signals: {analytics['signal_distribution']['buy']}")
        print(f"   Sell Signals: {analytics['signal_distribution']['sell']}")
        print(f"   Total: {analytics['signal_distribution']['total']}")
        print(f"Average Confidence: {analytics['average_confidence']:.3f}")
        print(f"Ensemble Effectiveness: {analytics['ensemble_effectiveness']:.3f}")
        
        print(f"\nStrategy Contributions:")
        for strategy, count in analytics['strategy_contributions'].items():
            print(f"   {strategy}: {count} signals")
    
    # Export configuration
    print(f"\n💾 Configuration Export")
    print("-" * 25)
    
    config = ensemble.export_ensemble_config()
    print(f"✅ Configuration exported with {len(config['strategies'])} strategies")
    print(f"Export timestamp: {config['export_timestamp']}")
    
    print(f"\n✅ Complete Strategy Framework Demo Finished!")
    print("=" * 60)
    
    # Show final weight adjustments
    print(f"\n⚖️ Final Strategy Weights After Auto-Adjustment")
    print("-" * 50)
    
    for name, weight in ensemble.strategy_weights.items():
        performance = ensemble.performance_tracker[name]
        print(f"{name}: {weight:.3f} (Win Rate: {performance['win_rate']:.1%})")

if __name__ == '__main__':
    main()
