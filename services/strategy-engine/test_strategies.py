#!/usr/bin/env python3
"""
NexusTradeAI Strategy Engine Test
================================

Test script to demonstrate the strategy framework functionality.
"""

import sys
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import random

from strategy_manager import StrategyManager
from strategy_framework import MarketData, MovingAverageCrossoverStrategy
from strategies import RSIMeanReversionStrategy, MomentumBreakoutStrategy, ScalpingStrategy

def generate_mock_market_data(symbol: str, days: int = 100) -> list:
    """Generate mock market data for testing"""
    data = []
    base_price = 45000.0 if 'BTC' in symbol else 3000.0
    
    for i in range(days):
        timestamp = datetime.now() - timedelta(days=days-i)
        
        # Generate realistic price movements
        change = random.uniform(-0.05, 0.05)  # ±5% daily change
        base_price *= (1 + change)
        
        # Generate OHLC data
        open_price = base_price
        high_price = open_price * (1 + random.uniform(0, 0.03))
        low_price = open_price * (1 - random.uniform(0, 0.03))
        close_price = open_price + (high_price - low_price) * random.uniform(-0.5, 0.5)
        volume = random.uniform(1000000, 10000000)
        
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

def test_individual_strategies():
    """Test individual strategy implementations"""
    print("🧪 Testing Individual Strategies")
    print("=" * 40)
    
    # Generate test data
    btc_data = generate_mock_market_data("BTCUSDT", 100)
    
    # Test Moving Average Crossover Strategy
    print("\n📈 Testing Moving Average Crossover Strategy")
    print("-" * 45)
    
    ma_strategy = MovingAverageCrossoverStrategy(short_period=20, long_period=50)
    signal = ma_strategy.generate_signal(btc_data)
    
    if signal:
        print(f"✅ Signal Generated: {signal}")
        print(f"   Confidence: {signal.confidence:.2f}")
        print(f"   Entry Price: ${signal.entry_price:.2f}")
        print(f"   Stop Loss: ${signal.stop_loss:.2f}")
        print(f"   Take Profit: ${signal.take_profit:.2f}")
    else:
        print("❌ No signal generated")
    
    # Test RSI Mean Reversion Strategy
    print("\n📊 Testing RSI Mean Reversion Strategy")
    print("-" * 40)
    
    rsi_strategy = RSIMeanReversionStrategy(rsi_period=14, oversold=30, overbought=70)
    signal = rsi_strategy.generate_signal(btc_data)
    
    if signal:
        print(f"✅ Signal Generated: {signal}")
        print(f"   RSI Value: {signal.metadata.get('rsi', 'N/A'):.2f}")
    else:
        print("❌ No signal generated")
    
    # Test Momentum Breakout Strategy
    print("\n🚀 Testing Momentum Breakout Strategy")
    print("-" * 38)
    
    momentum_strategy = MomentumBreakoutStrategy(period=20, volume_multiplier=1.5)
    signal = momentum_strategy.generate_signal(btc_data)
    
    if signal:
        print(f"✅ Signal Generated: {signal}")
        print(f"   Volume Ratio: {signal.metadata.get('volume_ratio', 'N/A'):.2f}")
        print(f"   Resistance: ${signal.metadata.get('resistance', 'N/A'):.2f}")
        print(f"   Support: ${signal.metadata.get('support', 'N/A'):.2f}")
    else:
        print("❌ No signal generated")

def test_strategy_manager():
    """Test the strategy manager functionality"""
    print("\n\n🎯 Testing Strategy Manager")
    print("=" * 30)
    
    # Initialize strategy manager
    manager = StrategyManager()
    
    # Create and register strategies
    print("\n📝 Registering Strategies")
    print("-" * 25)
    
    strategies = [
        MovingAverageCrossoverStrategy(short_period=20, long_period=50),
        RSIMeanReversionStrategy(rsi_period=14, oversold=30, overbought=70),
        MomentumBreakoutStrategy(period=20, volume_multiplier=1.5),
        ScalpingStrategy(fast_ema=5, slow_ema=13)
    ]
    
    for strategy in strategies:
        success = manager.register_strategy(strategy)
        print(f"{'✅' if success else '❌'} {strategy.name}")
    
    # List registered strategies
    print(f"\n📋 Total Strategies Registered: {len(manager.strategies)}")
    strategy_list = manager.list_strategies()
    for strategy_info in strategy_list:
        status = "🟢 ACTIVE" if strategy_info['active'] else "🔴 INACTIVE"
        print(f"   {strategy_info['name']} ({strategy_info['type']}) - {status}")
    
    # Generate test market data
    print("\n📊 Generating Market Data")
    print("-" * 25)
    
    symbols = ['BTCUSDT', 'ETHUSDT']
    for symbol in symbols:
        data = generate_mock_market_data(symbol, 60)
        for market_data in data:
            manager.update_market_data(symbol, market_data)
        print(f"✅ Generated {len(data)} data points for {symbol}")
    
    # Generate signals
    print("\n🎯 Generating Trading Signals")
    print("-" * 30)
    
    all_signals = []
    for symbol in symbols:
        signals = manager.generate_signals(symbol)
        all_signals.extend(signals)
        print(f"📈 {symbol}: {len(signals)} signals generated")
        
        for signal in signals:
            strategy_name = signal.metadata.get('strategy', 'Unknown')
            print(f"   {signal.signal_type.value.upper()} @ ${signal.entry_price:.2f} "
                  f"(confidence: {signal.confidence:.2f}) - {strategy_name}")
    
    # Test signal aggregation
    print(f"\n🔄 Signal Aggregation")
    print("-" * 20)
    
    aggregated = manager.aggregate_signals(all_signals)
    print(f"Total signals: {len(all_signals)}")
    print(f"Aggregated signals: {len(aggregated)}")
    
    for symbol, signal in aggregated.items():
        print(f"   {symbol}: {signal.signal_type.value.upper()} "
              f"(confidence: {signal.confidence:.2f})")
    
    # Test strategy activation/deactivation
    print(f"\n⚙️  Strategy Management")
    print("-" * 22)
    
    # Deactivate scalping strategy
    scalping_name = "Scalping_EMA_5_13"
    if manager.deactivate_strategy(scalping_name):
        print(f"✅ Deactivated {scalping_name}")
    
    # Update strategy parameters
    ma_name = "MA_Cross_20_50"
    new_params = {'rsi_confirmation': False}
    if manager.update_strategy_parameters(ma_name, new_params):
        print(f"✅ Updated parameters for {ma_name}")
    
    # Get performance metrics
    print(f"\n📊 Performance Metrics")
    print("-" * 22)
    
    overall_performance = manager.get_overall_performance()
    print(f"Total Signals Generated: {overall_performance['total_signals_generated']}")
    print(f"Active Strategies: {overall_performance['active_strategies']}")
    print(f"Total Strategies: {overall_performance['total_strategies']}")
    
    # Test configuration export
    print(f"\n💾 Configuration Export")
    print("-" * 23)
    
    config = manager.export_configuration()
    print(f"✅ Configuration exported with {len(config['strategies'])} strategies")
    
    print("\n✅ Strategy Manager Test Completed!")

def test_signal_validation():
    """Test signal validation functionality"""
    print("\n\n🔍 Testing Signal Validation")
    print("=" * 30)
    
    manager = StrategyManager()
    manager.create_default_strategies()
    
    # Generate some test data and signals
    btc_data = generate_mock_market_data("BTCUSDT", 60)
    for data in btc_data:
        manager.update_market_data("BTCUSDT", data)
    
    signals = manager.generate_signals("BTCUSDT")
    
    if signals:
        print(f"📈 Generated {len(signals)} signals for validation")
        
        # Mock current prices
        current_prices = {"BTCUSDT": btc_data[-1].close}
        
        # Validate signals
        validated_signals = manager.validate_signals(signals, current_prices)
        
        print(f"✅ Validated {len(validated_signals)} out of {len(signals)} signals")
        
        for signal in validated_signals:
            print(f"   ✓ {signal.symbol}: {signal.signal_type.value.upper()} "
                  f"@ ${signal.entry_price:.2f}")
    else:
        print("❌ No signals generated for validation test")

def main():
    """Main test function"""
    print("🚀 NexusTradeAI Strategy Engine Test Suite")
    print("=" * 50)
    
    try:
        # Test individual strategies
        test_individual_strategies()
        
        # Test strategy manager
        test_strategy_manager()
        
        # Test signal validation
        test_signal_validation()
        
        print("\n" + "=" * 50)
        print("✅ All tests completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
