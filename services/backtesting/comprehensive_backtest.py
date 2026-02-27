#!/usr/bin/env python3
"""
NexusTradeAI - Comprehensive Multi-Asset Backtester
====================================================
Tests the MA crossover strategy across Stocks, Forex, and Crypto.

Usage: python3 comprehensive_backtest.py
"""

import yfinance as yf
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, List, Tuple

# =============================================================================
# CONFIGURATION
# =============================================================================

STOCK_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META']
FOREX_SYMBOLS = ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'AUDUSD=X']
CRYPTO_SYMBOLS = ['BTC-USD', 'ETH-USD', 'SOL-USD']

INITIAL_CAPITAL = 100000
POSITION_SIZE_PCT = 0.10  # 10% per position
STOP_LOSS = 0.04  # 4% stop loss
PROFIT_TARGET = 0.08  # 8% profit target

# =============================================================================
# BACKTESTER CLASS
# =============================================================================

class SimpleBacktester:
    """Simple vectorized backtester for MA crossover strategy."""
    
    def __init__(self, initial_capital: float = 100000):
        self.initial_capital = initial_capital
        self.results = {}
        
    def fetch_data(self, symbols: List[str], start: str, end: str) -> Dict[str, pd.DataFrame]:
        """Fetch historical data for symbols."""
        data = {}
        for symbol in symbols:
            try:
                df = yf.download(symbol, start=start, end=end, progress=False)
                if len(df) > 50:
                    # Handle multi-level columns from yfinance
                    if isinstance(df.columns, pd.MultiIndex):
                        # Flatten multi-level columns
                        df.columns = [c[0].lower() if isinstance(c, tuple) else c.lower() for c in df.columns]
                    else:
                        df.columns = [c.lower() for c in df.columns]
                    data[symbol] = df
                    print(f"  ✓ {symbol}: {len(df)} days")
                else:
                    print(f"  ✗ {symbol}: insufficient data")
            except Exception as e:
                print(f"  ✗ {symbol}: {e}")
        return data
    
    def calculate_signals(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate entry/exit signals using MA crossover."""
        close = df['close']
        
        # Moving averages
        sma5 = close.rolling(5).mean()
        sma20 = close.rolling(20).mean()
        
        # RSI
        delta = close.diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        
        # Entry signal: MA crossover (SMA5 > SMA20) + RSI between 30-70
        uptrend = sma5 > sma20
        rsi_ok = (rsi > 30) & (rsi < 70)
        
        df['signal'] = 0
        df.loc[uptrend & rsi_ok, 'signal'] = 1  # Long signal
        df.loc[~uptrend, 'signal'] = -1  # Exit signal on downtrend
        
        return df
    
    def run_backtest(self, data: Dict[str, pd.DataFrame]) -> Dict:
        """Run backtest on the provided data."""
        all_trades = []
        equity = self.initial_capital
        
        for symbol, df in data.items():
            if df is None or len(df) < 50:
                continue
                
            df = self.calculate_signals(df.copy())
            
            position = None
            trades = []
            
            for i in range(1, len(df)):
                date = df.index[i]
                price = df['close'].iloc[i]
                signal = df['signal'].iloc[i]
                prev_signal = df['signal'].iloc[i-1]
                
                # Entry
                if position is None and signal == 1 and prev_signal != 1:
                    entry_price = price
                    position = {
                        'entry_date': date,
                        'entry_price': entry_price,
                        'stop_loss': entry_price * (1 - STOP_LOSS),
                        'profit_target': entry_price * (1 + PROFIT_TARGET)
                    }
                
                # Exit conditions
                elif position is not None:
                    exit_reason = None
                    
                    # Stop loss
                    if price <= position['stop_loss']:
                        exit_reason = 'stop_loss'
                    # Profit target
                    elif price >= position['profit_target']:
                        exit_reason = 'profit_target'
                    # Signal exit
                    elif signal == -1:
                        exit_reason = 'signal_exit'
                    
                    if exit_reason:
                        pnl_pct = (price - position['entry_price']) / position['entry_price']
                        pnl = pnl_pct * (equity * POSITION_SIZE_PCT)
                        
                        trades.append({
                            'symbol': symbol,
                            'entry_date': position['entry_date'],
                            'exit_date': date,
                            'entry_price': position['entry_price'],
                            'exit_price': price,
                            'pnl_pct': pnl_pct,
                            'pnl': pnl,
                            'exit_reason': exit_reason,
                            'win': pnl > 0
                        })
                        
                        equity += pnl
                        position = None
            
            all_trades.extend(trades)
        
        return self.calculate_metrics(all_trades, equity)
    
    def calculate_metrics(self, trades: List[Dict], final_equity: float) -> Dict:
        """Calculate performance metrics from trades."""
        if not trades:
            return {
                'total_trades': 0,
                'win_rate': 0,
                'profit_factor': 0,
                'total_return': 0,
                'avg_pnl': 0,
                'max_win': 0,
                'max_loss': 0,
                'expectancy': 0,
                'verdict': '⚠️ NO TRADES'
            }
        
        df = pd.DataFrame(trades)
        
        total_trades = len(df)
        winners = df[df['win'] == True]
        losers = df[df['win'] == False]
        
        win_rate = len(winners) / total_trades if total_trades > 0 else 0
        
        gross_profit = winners['pnl'].sum() if len(winners) > 0 else 0
        gross_loss = abs(losers['pnl'].sum()) if len(losers) > 0 else 0
        
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else (10 if gross_profit > 0 else 0)
        
        total_pnl = df['pnl'].sum()
        total_return = (final_equity - self.initial_capital) / self.initial_capital
        avg_pnl = df['pnl'].mean()
        
        avg_win = winners['pnl'].mean() if len(winners) > 0 else 0
        avg_loss = losers['pnl'].mean() if len(losers) > 0 else 0
        
        expectancy = (win_rate * avg_win) + ((1 - win_rate) * avg_loss)
        
        # Verdict
        if win_rate >= 0.50 and profit_factor >= 1.2 and total_return > 0:
            verdict = '✅ PROVEN EDGE - Ready for paper trading'
        elif win_rate >= 0.45 and profit_factor >= 1.0:
            verdict = '⚠️ MARGINAL EDGE - Needs more testing'
        else:
            verdict = '❌ NO EDGE - Do not trade'
        
        return {
            'total_trades': total_trades,
            'winners': len(winners),
            'losers': len(losers),
            'win_rate': win_rate,
            'profit_factor': profit_factor,
            'total_pnl': total_pnl,
            'total_return': total_return,
            'avg_pnl': avg_pnl,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'max_win': df['pnl'].max(),
            'max_loss': df['pnl'].min(),
            'expectancy': expectancy,
            'verdict': verdict
        }


def print_results(asset_class: str, metrics: Dict):
    """Print formatted results."""
    print(f"\n{'='*60}")
    print(f"  {asset_class.upper()} BACKTEST RESULTS")
    print(f"{'='*60}")
    print(f"\n📊 TRADE STATISTICS")
    print(f"   Total Trades:    {metrics['total_trades']}")
    print(f"   Winners:         {metrics.get('winners', 0)}")
    print(f"   Losers:          {metrics.get('losers', 0)}")
    print(f"   Win Rate:        {metrics['win_rate']:.1%}")
    print(f"\n💰 P&L METRICS")
    print(f"   Total P&L:       ${metrics.get('total_pnl', 0):,.2f}")
    print(f"   Total Return:    {metrics['total_return']:.2%}")
    print(f"   Profit Factor:   {metrics['profit_factor']:.2f}")
    print(f"   Expectancy:      ${metrics['expectancy']:,.2f}")
    print(f"   Avg Win:         ${metrics.get('avg_win', 0):,.2f}")
    print(f"   Avg Loss:        ${metrics.get('avg_loss', 0):,.2f}")
    print(f"\n🎯 VERDICT: {metrics['verdict']}")


def main():
    print("\n" + "="*60)
    print("  NEXUSTRADEAI - COMPREHENSIVE MULTI-ASSET BACKTEST")
    print("  MA Crossover Strategy Validation")
    print("="*60)
    
    backtester = SimpleBacktester(INITIAL_CAPITAL)
    
    # 1. STOCK BACKTEST
    print("\n📈 STOCKS - Fetching 3-year data...")
    stock_data = backtester.fetch_data(STOCK_SYMBOLS, '2021-01-01', '2024-12-01')
    stock_results = backtester.run_backtest(stock_data)
    print_results("STOCKS", stock_results)
    
    # 2. FOREX BACKTEST
    print("\n\n💱 FOREX - Fetching 3-year data...")
    forex_data = backtester.fetch_data(FOREX_SYMBOLS, '2021-01-01', '2024-12-01')
    forex_results = backtester.run_backtest(forex_data)
    print_results("FOREX", forex_results)
    
    # 3. CRYPTO BACKTEST
    print("\n\n₿ CRYPTO - Fetching 3-year data...")
    crypto_data = backtester.fetch_data(CRYPTO_SYMBOLS, '2021-01-01', '2024-12-01')
    crypto_results = backtester.run_backtest(crypto_data)
    print_results("CRYPTO", crypto_results)
    
    # SUMMARY
    print("\n\n" + "="*60)
    print("  SUMMARY - ALL ASSET CLASSES")
    print("="*60)
    
    summary = pd.DataFrame([
        {'Asset': 'Stocks', **stock_results},
        {'Asset': 'Forex', **forex_results},
        {'Asset': 'Crypto', **crypto_results}
    ])
    
    print(f"\n{'Asset':<10} {'Trades':<10} {'Win Rate':<12} {'Return':<12} {'Profit Factor':<15} {'Verdict'}")
    print("-"*80)
    for _, row in summary.iterrows():
        verdict_short = '✅' if '✅' in row['verdict'] else ('⚠️' if '⚠️' in row['verdict'] else '❌')
        print(f"{row['Asset']:<10} {row['total_trades']:<10} {row['win_rate']:.1%}        {row['total_return']:.1%}        {row['profit_factor']:.2f}           {verdict_short}")
    
    # Overall verdict
    total_trades = stock_results['total_trades'] + forex_results['total_trades'] + crypto_results['total_trades']
    
    all_profitable = (stock_results['total_return'] > 0 and 
                      forex_results.get('total_return', 0) >= 0 and 
                      crypto_results['total_return'] > 0)
    
    print(f"\n📊 Total trades across all assets: {total_trades}")
    
    if all_profitable and total_trades >= 50:
        print("\n🎉 OVERALL: STRATEGY HAS EDGE ACROSS MULTIPLE ASSET CLASSES")
        print("   Ready for paper trading validation!")
    elif total_trades >= 20:
        print("\n⚠️ OVERALL: MIXED RESULTS - Continue paper trading")
    else:
        print("\n❌ OVERALL: INSUFFICIENT DATA - Need more backtest data")
    
    print("\n" + "="*60 + "\n")
    
    return {
        'stocks': stock_results,
        'forex': forex_results,
        'crypto': crypto_results
    }


if __name__ == "__main__":
    main()
