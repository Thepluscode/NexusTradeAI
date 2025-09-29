#!/usr/bin/env python3
"""
NexusTradeAI Risk Management System Test
=======================================

Test script to demonstrate the risk management functionality.
"""

import sys
import time
from risk_manager import RiskManager, RiskParameters, RiskLevel

def test_risk_manager():
    """Test the risk management system with sample trades"""
    
    print("🚀 NexusTradeAI Risk Management System Test")
    print("=" * 50)
    
    # Initialize risk manager with moderate risk profile
    account_balance = 10000.0
    risk_params = RiskParameters.from_risk_level(RiskLevel.MODERATE)
    rm = RiskManager(account_balance, risk_params)
    
    print(f"💰 Initial Account Balance: ${account_balance:,.2f}")
    print(f"📊 Risk Level: MODERATE")
    print(f"🎯 Risk per Trade: {risk_params.risk_per_trade*100:.1f}%")
    print(f"🛡️  Max Portfolio Risk: {risk_params.max_portfolio_risk*100:.1f}%")
    print()
    
    # Test 1: Calculate position size for BTC trade
    print("📈 Test 1: Position Sizing for BTC")
    print("-" * 30)
    
    btc_entry = 45000.0
    btc_stop_loss = 42750.0  # 5% stop loss
    btc_size = rm.calculate_position_size("BTCUSDT", btc_entry, btc_stop_loss)
    
    print(f"Symbol: BTCUSDT")
    print(f"Entry Price: ${btc_entry:,.2f}")
    print(f"Stop Loss: ${btc_stop_loss:,.2f}")
    print(f"Calculated Position Size: {btc_size:.6f} BTC")
    print(f"Position Value: ${btc_size * btc_entry:,.2f}")
    print()
    
    # Test 2: Open BTC position
    print("🔓 Test 2: Opening BTC Position")
    print("-" * 30)
    
    success = rm.open_position("BTCUSDT", btc_size, btc_entry, btc_entry)
    if success:
        print("✅ BTC position opened successfully")
    else:
        print("❌ Failed to open BTC position")
    
    portfolio = rm.get_portfolio_summary()
    print(f"Portfolio Risk: {portfolio['portfolio_risk']*100:.2f}%")
    print(f"Positions: {portfolio['num_positions']}")
    print()
    
    # Test 3: Open ETH position
    print("📈 Test 3: Opening ETH Position")
    print("-" * 30)
    
    eth_entry = 3000.0
    eth_stop_loss = 2850.0  # 5% stop loss
    eth_size = rm.calculate_position_size("ETHUSDT", eth_entry, eth_stop_loss)
    
    success = rm.open_position("ETHUSDT", eth_size, eth_entry, eth_entry)
    if success:
        print("✅ ETH position opened successfully")
        print(f"Position Size: {eth_size:.6f} ETH")
    else:
        print("❌ Failed to open ETH position")
    
    portfolio = rm.get_portfolio_summary()
    print(f"Portfolio Risk: {portfolio['portfolio_risk']*100:.2f}%")
    print(f"Positions: {portfolio['num_positions']}")
    print()
    
    # Test 4: Price updates and stop-loss trigger
    print("📊 Test 4: Price Updates and Stop-Loss")
    print("-" * 35)
    
    # Simulate price movements
    price_updates = {
        "BTCUSDT": 44000.0,  # BTC drops
        "ETHUSDT": 3100.0    # ETH rises
    }
    
    print("Price Updates:")
    for symbol, price in price_updates.items():
        print(f"  {symbol}: ${price:,.2f}")
    
    closed_positions = rm.update_position_prices(price_updates)
    
    if closed_positions:
        print(f"🔴 Positions closed: {closed_positions}")
    else:
        print("🟢 No positions triggered")
    
    # Show updated portfolio
    portfolio = rm.get_portfolio_summary()
    print(f"\nUpdated Portfolio:")
    print(f"  Account Balance: ${portfolio['account_balance']:,.2f}")
    print(f"  Unrealized P&L: ${portfolio['total_unrealized_pnl']:,.2f}")
    print(f"  Active Positions: {portfolio['num_positions']}")
    print()
    
    # Test 5: Risk validation
    print("🛡️  Test 5: Risk Validation")
    print("-" * 25)
    
    # Try to open a large position that would exceed risk limits
    large_size = 1.0  # 1 full BTC
    is_valid = rm.validate_new_position("BTCUSDT", large_size, 45000.0)
    
    print(f"Attempting to open large position (1.0 BTC)")
    print(f"Position would be worth: ${large_size * 45000:,.2f}")
    print(f"Validation result: {'✅ APPROVED' if is_valid else '❌ REJECTED'}")
    print()
    
    # Test 6: Portfolio summary
    print("📋 Test 6: Final Portfolio Summary")
    print("-" * 30)
    
    portfolio = rm.get_portfolio_summary()
    
    print(f"Account Balance: ${portfolio['account_balance']:,.2f}")
    print(f"Initial Balance: ${portfolio['initial_balance']:,.2f}")
    print(f"Total P&L: ${portfolio['account_balance'] - portfolio['initial_balance']:,.2f}")
    print(f"Unrealized P&L: ${portfolio['total_unrealized_pnl']:,.2f}")
    print(f"Portfolio Risk: {portfolio['portfolio_risk']*100:.2f}%")
    print(f"Drawdown: {portfolio['drawdown_percent']:.2f}%")
    print(f"Emergency Stop: {'🔴 ACTIVE' if portfolio['emergency_stop'] else '🟢 INACTIVE'}")
    
    print(f"\nActive Positions:")
    for symbol, pos in portfolio['positions'].items():
        print(f"  {symbol}:")
        print(f"    Size: {pos['size']:.6f}")
        print(f"    Entry: ${pos['entry_price']:,.2f}")
        print(f"    Current: ${pos['current_price']:,.2f}")
        print(f"    P&L: ${pos['unrealized_pnl']:,.2f} ({pos['unrealized_pnl_percent']:+.2f}%)")
        print(f"    Stop Loss: ${pos['stop_loss']:,.2f}")
        print(f"    Take Profit: ${pos['take_profit']:,.2f}")
    
    print("\n✅ Risk Management System Test Completed!")

if __name__ == '__main__':
    test_risk_manager()
