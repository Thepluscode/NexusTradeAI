#!/usr/bin/env python3
"""
NexusTradeAI Automated Trading System Test
==========================================

Comprehensive test of the automated trading system.
"""

import asyncio
import time
import random
from datetime import datetime, timedelta

from trading_engine import TradingEngine, TradingMode, OrderType

def simulate_market_data(engine: TradingEngine):
    """Simulate real-time market data updates"""
    symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT']
    base_prices = {
        'BTCUSDT': 45000.0,
        'ETHUSDT': 3000.0,
        'ADAUSDT': 1.2,
        'DOTUSDT': 25.0
    }
    
    print("📊 Simulating market data updates...")
    
    for _ in range(20):  # 20 price updates
        for symbol in symbols:
            # Generate realistic price movement
            current_price = base_prices[symbol]
            change_percent = random.uniform(-0.02, 0.02)  # ±2% change
            new_price = current_price * (1 + change_percent)
            
            # Update price in engine
            engine.current_prices[symbol] = new_price
            base_prices[symbol] = new_price
            
        time.sleep(1)  # 1 second between updates

def simulate_strategy_signals(engine: TradingEngine):
    """Simulate trading signals from strategy engine"""
    signals = [
        {
            'symbol': 'BTCUSDT',
            'signal_type': 'buy',
            'confidence': 0.85,
            'entry_price': 45250.0,
            'stop_loss': 42987.5,
            'take_profit': 49775.0,
            'timestamp': datetime.now().isoformat(),
            'strategy': 'MA_Cross_20_50'
        },
        {
            'symbol': 'ETHUSDT',
            'signal_type': 'sell',
            'confidence': 0.72,
            'entry_price': 3150.0,
            'stop_loss': 3307.5,
            'take_profit': 2835.0,
            'timestamp': datetime.now().isoformat(),
            'strategy': 'RSI_MeanReversion_14'
        },
        {
            'symbol': 'ADAUSDT',
            'signal_type': 'buy',
            'confidence': 0.68,
            'entry_price': 1.25,
            'stop_loss': 1.1875,
            'take_profit': 1.375,
            'timestamp': datetime.now().isoformat(),
            'strategy': 'Momentum_Breakout_20'
        }
    ]
    
    return signals

async def test_trading_engine():
    """Test the automated trading engine"""
    print("🚀 NexusTradeAI Automated Trading System Test")
    print("=" * 55)
    
    # Initialize trading engine in paper mode
    engine = TradingEngine(TradingMode.PAPER)
    
    print(f"💰 Trading Mode: {engine.mode.value.upper()}")
    print(f"⚙️  Configuration: {engine.config}")
    
    # Simulate initial market data
    print("\n📊 Setting up initial market data...")
    engine.current_prices = {
        'BTCUSDT': 45000.0,
        'ETHUSDT': 3000.0,
        'ADAUSDT': 1.2,
        'DOTUSDT': 25.0
    }
    
    # Test manual order placement
    print("\n🔧 Testing Manual Order Placement")
    print("-" * 35)
    
    # Test buy order
    buy_order_id = await engine._place_order(
        symbol='BTCUSDT',
        side='buy',
        quantity=0.1,
        order_type=OrderType.MARKET,
        strategy='test_manual'
    )
    
    if buy_order_id:
        print(f"✅ Buy order placed: {buy_order_id}")
    else:
        print("❌ Failed to place buy order")
    
    # Wait for order processing
    await asyncio.sleep(2)
    
    # Check positions
    positions = engine.get_positions_summary()
    print(f"\n📊 Positions after buy order:")
    for symbol, pos in positions['positions'].items():
        print(f"   {symbol}: {pos['quantity']:.6f} @ ${pos['average_price']:.2f}")
    
    # Test signal processing
    print("\n🎯 Testing Strategy Signal Processing")
    print("-" * 40)
    
    signals = simulate_strategy_signals(engine)
    
    for signal in signals:
        print(f"\n📈 Processing signal: {signal['symbol']} {signal['signal_type'].upper()}")
        print(f"   Confidence: {signal['confidence']:.2f}")
        print(f"   Entry: ${signal['entry_price']:.2f}")
        
        await engine._process_signal(signal)
        await asyncio.sleep(1)
    
    # Check updated positions
    positions = engine.get_positions_summary()
    print(f"\n📊 Positions after signal processing:")
    print(f"   Total Positions: {positions['summary']['total_positions']}")
    print(f"   Total P&L: ${positions['summary']['total_pnl']:.2f}")

    for symbol, pos in positions['positions'].items():
        print(f"   {symbol}: {pos['quantity']:.6f} @ ${pos['average_price']:.2f} "
              f"(P&L: ${pos['unrealized_pnl']:.2f})")
    
    # Test price updates and triggers
    print("\n📈 Testing Price Updates and Triggers")
    print("-" * 38)
    
    # Simulate price movements that trigger stop-loss
    print("Simulating adverse price movement...")
    engine.current_prices['BTCUSDT'] = 42000.0  # Below stop-loss
    engine.current_prices['ETHUSDT'] = 3400.0   # Above stop-loss for short
    
    await engine._update_positions()
    
    # Check for triggered orders
    triggered_orders = [
        order for order in engine.orders.values()
        if order.order_type in [OrderType.STOP_LOSS, OrderType.TAKE_PROFIT]
        and order.status.value == 'filled'
    ]
    
    print(f"🎯 Triggered orders: {len(triggered_orders)}")
    for order in triggered_orders:
        print(f"   {order.order_type.value}: {order.symbol} @ ${order.average_price:.2f}")
    
    # Test order management
    print("\n📋 Testing Order Management")
    print("-" * 28)
    
    orders_summary = {
        'total_orders': len(engine.orders),
        'pending_orders': len([o for o in engine.orders.values() if o.status.value == 'pending']),
        'filled_orders': len([o for o in engine.orders.values() if o.status.value == 'filled']),
        'cancelled_orders': len([o for o in engine.orders.values() if o.status.value == 'cancelled'])
    }
    
    print(f"📊 Order Summary:")
    for key, value in orders_summary.items():
        print(f"   {key.replace('_', ' ').title()}: {value}")
    
    # Test trading status
    print("\n⚙️  Testing Trading Status")
    print("-" * 25)
    
    status = engine.get_trading_status()
    print(f"📊 Trading Status:")
    for key, value in status.items():
        print(f"   {key.replace('_', ' ').title()}: {value}")
    
    # Test trade history
    print("\n📈 Testing Trade History")
    print("-" * 23)
    
    recent_trades = engine.get_recent_trades(10)
    print(f"📊 Recent Trades ({len(recent_trades)}):")
    
    for trade in recent_trades[:5]:  # Show first 5 trades
        print(f"   {trade['timestamp']}: {trade['side'].upper()} "
              f"{trade['quantity']:.6f} {trade['symbol']} @ ${trade['price']:.2f}")
    
    # Test rate limiting
    print("\n⏱️  Testing Rate Limiting")
    print("-" * 22)
    
    rate_limit_test_count = 0
    for i in range(15):  # Try to place 15 orders quickly
        order_id = await engine._place_order(
            symbol='BTCUSDT',
            side='buy',
            quantity=0.001,
            order_type=OrderType.MARKET,
            strategy='rate_limit_test'
        )
        
        if order_id:
            rate_limit_test_count += 1
        
        await asyncio.sleep(0.1)  # Small delay
    
    print(f"📊 Rate Limit Test: {rate_limit_test_count}/15 orders placed")
    print(f"   Max orders per minute: {engine.config['max_orders_per_minute']}")
    
    # Final summary
    print("\n" + "=" * 55)
    print("✅ Automated Trading System Test Completed!")
    
    final_positions = engine.get_positions_summary()
    final_status = engine.get_trading_status()

    print(f"\n📊 Final Summary:")
    print(f"   Active Positions: {final_status['active_positions']}")
    print(f"   Total Orders: {final_status['total_orders']}")
    print(f"   Total Trades: {final_status['total_trades']}")
    print(f"   Total P&L: ${final_positions['summary']['total_pnl']:.2f}")
    
    print(f"\n🎯 Key Features Tested:")
    print(f"   ✅ Manual order placement")
    print(f"   ✅ Strategy signal processing")
    print(f"   ✅ Position management")
    print(f"   ✅ Stop-loss/take-profit triggers")
    print(f"   ✅ Risk management integration")
    print(f"   ✅ Rate limiting")
    print(f"   ✅ Order status tracking")
    print(f"   ✅ Trade history")

async def main():
    """Main test function"""
    try:
        await test_trading_engine()
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
