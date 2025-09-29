#!/usr/bin/env python3
"""
NexusTradeAI - Advanced Risk Management System Test
==================================================

Comprehensive test of the advanced risk management system with analytics.
"""

import sys
import time
import random
import numpy as np
from datetime import datetime, timedelta

from risk_manager import RiskManager, RiskParameters, RiskLevel
from risk_analytics import AdvancedRiskAnalytics

def simulate_trading_scenario(risk_manager: RiskManager, analytics: AdvancedRiskAnalytics):
    """Simulate a comprehensive trading scenario"""
    
    print("🎯 Simulating Advanced Trading Scenario")
    print("=" * 45)
    
    # Trading symbols and their characteristics
    symbols = {
        'BTCUSDT': {'base_price': 45000, 'volatility': 0.04},
        'ETHUSDT': {'base_price': 3000, 'volatility': 0.05},
        'ADAUSDT': {'base_price': 1.2, 'volatility': 0.06},
        'DOTUSDT': {'base_price': 25, 'volatility': 0.07}
    }
    
    # Simulate 50 trades over time
    for trade_num in range(1, 51):
        print(f"\n📈 Trade #{trade_num}")
        print("-" * 20)
        
        # Select random symbol
        symbol = random.choice(list(symbols.keys()))
        symbol_data = symbols[symbol]
        
        # Generate entry price with some randomness
        base_price = symbol_data['base_price']
        volatility = symbol_data['volatility']
        price_change = random.normalvariate(0, volatility)
        entry_price = base_price * (1 + price_change)
        
        # Update base price for next iteration
        symbols[symbol]['base_price'] = entry_price
        
        # Calculate position size
        stop_loss_percent = random.uniform(0.03, 0.08)  # 3-8% stop loss
        stop_loss_price = entry_price * (1 - stop_loss_percent)
        
        try:
            position_size = risk_manager.calculate_position_size(symbol, entry_price, stop_loss_price)
            
            # Try to open position
            if risk_manager.open_position(symbol, position_size, entry_price, entry_price):
                print(f"✅ Opened {symbol}: {position_size:.6f} @ ${entry_price:.2f}")
                
                # Simulate holding period (1-10 periods)
                holding_periods = random.randint(1, 10)
                
                for period in range(holding_periods):
                    # Simulate price movement
                    price_change = random.normalvariate(0, volatility * 0.5)  # Daily movement
                    current_price = entry_price * (1 + price_change)
                    
                    # Update prices and check for triggers
                    closed_positions = risk_manager.update_position_prices({symbol: current_price})
                    
                    if closed_positions:
                        print(f"🔴 Position closed: {symbol} @ ${current_price:.2f}")
                        break
                    
                    entry_price = current_price  # Update for next iteration
                
                # If position still open, close it manually
                if symbol in risk_manager.positions:
                    final_price = entry_price * (1 + random.normalvariate(0, volatility * 0.3))
                    risk_manager.close_position(symbol, final_price, "MANUAL_CLOSE")
                    print(f"🔵 Manually closed {symbol} @ ${final_price:.2f}")
                
            else:
                print(f"❌ Failed to open {symbol} - Risk constraints")
                
        except Exception as e:
            print(f"⚠️  Error with {symbol}: {e}")
        
        # Show portfolio status every 10 trades
        if trade_num % 10 == 0:
            portfolio = risk_manager.get_portfolio_summary()
            print(f"\n📊 Portfolio Status (Trade #{trade_num}):")
            print(f"   Balance: ${portfolio['account_balance']:.2f}")
            print(f"   Total P&L: ${portfolio['total_pnl']:.2f}")
            print(f"   Drawdown: {portfolio['current_drawdown_percent']:.1f}%")
            print(f"   Active Positions: {portfolio['active_positions']}")
            
            # Check for emergency conditions
            if portfolio['emergency_stop_active']:
                print("🚨 EMERGENCY STOP ACTIVATED!")
                break

def test_risk_analytics(analytics: AdvancedRiskAnalytics):
    """Test advanced risk analytics functionality"""
    
    print("\n\n📊 Testing Advanced Risk Analytics")
    print("=" * 40)
    
    # Test VaR calculations
    print("\n💰 Value at Risk (VaR) Analysis")
    print("-" * 30)
    
    var_95_1d = analytics.calculate_var(0.95, 1)
    var_99_1d = analytics.calculate_var(0.99, 1)
    var_95_7d = analytics.calculate_var(0.95, 7)
    
    print(f"VaR 95% (1 day): ${var_95_1d:.2f}")
    print(f"VaR 99% (1 day): ${var_99_1d:.2f}")
    print(f"VaR 95% (7 days): ${var_95_7d:.2f}")
    
    # Test performance ratios
    print("\n📈 Performance Ratios")
    print("-" * 20)
    
    sharpe = analytics.calculate_sharpe_ratio()
    sortino = analytics.calculate_sortino_ratio()
    calmar = analytics.calculate_calmar_ratio()
    
    print(f"Sharpe Ratio: {sharpe:.3f}")
    print(f"Sortino Ratio: {sortino:.3f}")
    print(f"Calmar Ratio: {calmar:.3f}")
    
    # Test drawdown analysis
    print("\n📉 Drawdown Analysis")
    print("-" * 18)
    
    max_dd, peak_date, trough_date = analytics.calculate_max_drawdown()
    print(f"Maximum Drawdown: {max_dd*100:.2f}%")
    if peak_date and trough_date:
        duration = (trough_date - peak_date).days
        print(f"Peak Date: {peak_date.strftime('%Y-%m-%d')}")
        print(f"Trough Date: {trough_date.strftime('%Y-%m-%d')}")
        print(f"Duration: {duration} days")
    
    # Test win/loss analysis
    print("\n🎯 Win/Loss Analysis")
    print("-" * 18)
    
    win_rate, avg_win, avg_loss = analytics.calculate_win_loss_ratio()
    profit_factor = analytics.calculate_profit_factor()
    
    print(f"Win Rate: {win_rate*100:.1f}%")
    print(f"Average Win: ${avg_win:.2f}")
    print(f"Average Loss: ${avg_loss:.2f}")
    print(f"Profit Factor: {profit_factor:.2f}")
    
    # Test performance attribution
    print("\n🔍 Performance Attribution")
    print("-" * 25)
    
    attribution = analytics.get_performance_attribution()
    symbol_perf = attribution['symbol_performance']
    
    if symbol_perf:
        print("Symbol Performance:")
        for symbol, data in symbol_perf.items():
            print(f"  {symbol}: {data['trades']} trades, "
                  f"${data['total_pnl']:.2f} P&L, "
                  f"{data['win_rate']*100:.1f}% win rate")
        
        if attribution['best_performer']:
            best_symbol, best_data = attribution['best_performer']
            print(f"\nBest Performer: {best_symbol} (${best_data['total_pnl']:.2f})")
        
        if attribution['worst_performer']:
            worst_symbol, worst_data = attribution['worst_performer']
            print(f"Worst Performer: {worst_symbol} (${worst_data['total_pnl']:.2f})")
    
    # Test risk alerts
    print("\n🚨 Risk Alerts")
    print("-" * 12)
    
    alerts = analytics.get_risk_alerts()
    if alerts:
        for alert in alerts:
            level_emoji = {'CRITICAL': '🔴', 'HIGH': '🟠', 'MEDIUM': '🟡'}.get(alert['level'], '⚪')
            print(f"{level_emoji} {alert['level']}: {alert['message']}")
    else:
        print("✅ No risk alerts")

def test_portfolio_optimization(risk_manager: RiskManager):
    """Test portfolio optimization recommendations"""
    
    print("\n\n🔧 Portfolio Optimization")
    print("=" * 25)
    
    recommendations = risk_manager.optimize_portfolio()
    
    if recommendations:
        print("Optimization Recommendations:")
        for i, rec in enumerate(recommendations, 1):
            print(f"  {i}. {rec}")
    else:
        print("✅ Portfolio is optimally positioned")

def generate_comprehensive_report(analytics: AdvancedRiskAnalytics):
    """Generate and display comprehensive risk report"""
    
    print("\n\n📋 Comprehensive Risk Report")
    print("=" * 35)
    
    report = analytics.generate_risk_report()
    
    print(f"📊 Portfolio Overview")
    print(f"   Current Value: ${report['portfolio_value']:.2f}")
    print(f"   Total Return: {report['total_return_percent']:.2f}%")
    
    print(f"\n🛡️  Risk Metrics")
    risk_metrics = report['risk_metrics']
    print(f"   VaR (95%, 1d): ${risk_metrics['var_95_1d']:.2f}")
    print(f"   VaR (99%, 1d): ${risk_metrics['var_99_1d']:.2f}")
    print(f"   Sharpe Ratio: {risk_metrics['sharpe_ratio']:.3f}")
    print(f"   Sortino Ratio: {risk_metrics['sortino_ratio']:.3f}")
    print(f"   Max Drawdown: {risk_metrics['max_drawdown_percent']:.2f}%")
    print(f"   Current Drawdown: {risk_metrics['current_drawdown_percent']:.2f}%")
    
    print(f"\n📈 Trading Metrics")
    trading_metrics = report['trading_metrics']
    print(f"   Total Trades: {trading_metrics['total_trades']}")
    print(f"   Win Rate: {trading_metrics['win_rate_percent']:.1f}%")
    print(f"   Avg Win: ${trading_metrics['avg_win']:.2f}")
    print(f"   Avg Loss: ${trading_metrics['avg_loss']:.2f}")
    print(f"   Profit Factor: {trading_metrics['profit_factor']:.2f}")
    
    print(f"\n✅ Risk Limits Status")
    limits = report['risk_limits_status']
    print(f"   Position Limit: {'✅' if limits['within_position_limit'] else '❌'}")
    print(f"   Portfolio Risk Limit: {'✅' if limits['within_portfolio_risk_limit'] else '❌'}")
    print(f"   Drawdown Limit: {'✅' if limits['within_drawdown_limit'] else '❌'}")
    
    if report['recommendations']:
        print(f"\n💡 Recommendations")
        for rec in report['recommendations']:
            print(f"   • {rec}")

def main():
    """Main test function"""
    print("🚀 NexusTradeAI Advanced Risk Management Test")
    print("=" * 55)
    
    # Initialize risk management system
    initial_balance = 10000.0
    risk_params = RiskParameters.from_risk_level(RiskLevel.MODERATE)
    risk_manager = RiskManager(initial_balance, risk_params)
    analytics = AdvancedRiskAnalytics(risk_manager)
    
    print(f"💰 Initial Balance: ${initial_balance:,.2f}")
    print(f"📊 Risk Level: MODERATE")
    print(f"🎯 Risk per Trade: {risk_params.risk_per_trade*100:.1f}%")
    print(f"🛡️  Max Portfolio Risk: {risk_params.max_portfolio_risk*100:.1f}%")
    print(f"🚨 Max Drawdown: {risk_params.max_drawdown_percent*100:.1f}%")
    
    try:
        # Run trading simulation
        simulate_trading_scenario(risk_manager, analytics)
        
        # Test analytics
        test_risk_analytics(analytics)
        
        # Test optimization
        test_portfolio_optimization(risk_manager)
        
        # Generate comprehensive report
        generate_comprehensive_report(analytics)
        
        print("\n" + "=" * 55)
        print("✅ Advanced Risk Management Test Completed Successfully!")
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()
