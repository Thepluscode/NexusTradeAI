"""
NexusTradeAI - Advanced Risk Analytics
=====================================

Advanced risk analytics and reporting for comprehensive portfolio monitoring.
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta

from risk_manager import RiskManager

logger = logging.getLogger(__name__)

class AdvancedRiskAnalytics:
    """
    Advanced risk analytics and reporting for NexusTradeAI
    """
    
    def __init__(self, risk_manager: RiskManager):
        self.risk_manager = risk_manager
    
    def calculate_var(self, confidence_level: float = 0.95, days: int = 1) -> float:
        """
        Calculate Value at Risk (VaR) for the portfolio
        Simplified implementation using historical returns
        """
        if len(self.risk_manager.trade_history) < 30:
            logger.warning("Insufficient trade history for reliable VaR calculation")
            return 0.0
        
        # Extract daily returns from trade history
        returns = []
        for trade in self.risk_manager.trade_history:
            if trade['action'] == 'CLOSE' and 'pnl_percent' in trade:
                returns.append(trade['pnl_percent'] / 100)
        
        if not returns:
            return 0.0
            
        returns_array = np.array(returns)
        var_percentile = (1 - confidence_level) * 100
        var = np.percentile(returns_array, var_percentile)
        
        # Scale to portfolio value and time horizon
        portfolio_var = abs(var) * self.risk_manager.account_balance * np.sqrt(days)
        
        logger.info(f"VaR ({confidence_level*100}%, {days}d): ${portfolio_var:.2f}")
        return portfolio_var
    
    def calculate_sharpe_ratio(self, risk_free_rate: float = 0.02) -> float:
        """
        Calculate Sharpe ratio for the trading strategy
        """
        if len(self.risk_manager.trade_history) < 10:
            return 0.0
        
        returns = []
        for trade in self.risk_manager.trade_history:
            if trade['action'] == 'CLOSE' and 'pnl_percent' in trade:
                returns.append(trade['pnl_percent'] / 100)
        
        if not returns:
            return 0.0
            
        returns_array = np.array(returns)
        excess_return = np.mean(returns_array) - (risk_free_rate / 252)  # Daily risk-free rate
        volatility = np.std(returns_array)
        
        if volatility == 0:
            return 0.0
            
        sharpe = excess_return / volatility * np.sqrt(252)  # Annualized
        return sharpe
    
    def calculate_max_drawdown(self) -> Tuple[float, datetime, datetime]:
        """
        Calculate maximum drawdown and its duration
        """
        if not self.risk_manager.trade_history:
            return 0.0, None, None
        
        # Reconstruct balance history
        balance_history = [self.risk_manager.initial_balance]
        balance = self.risk_manager.initial_balance
        timestamps = [datetime.now() - timedelta(days=30)]  # Start date
        
        for trade in self.risk_manager.trade_history:
            if trade['action'] == 'CLOSE' and 'pnl' in trade:
                balance += trade['pnl']
                balance_history.append(balance)
                timestamps.append(trade['timestamp'])
        
        # Find maximum drawdown
        peak = balance_history[0]
        max_dd = 0.0
        peak_date = timestamps[0]
        trough_date = timestamps[0]
        
        for i, balance in enumerate(balance_history):
            if balance > peak:
                peak = balance
                peak_date = timestamps[i]
            
            drawdown = (peak - balance) / peak
            if drawdown > max_dd:
                max_dd = drawdown
                trough_date = timestamps[i]
        
        return max_dd, peak_date, trough_date
    
    def calculate_sortino_ratio(self, risk_free_rate: float = 0.02) -> float:
        """
        Calculate Sortino ratio (focuses on downside deviation)
        """
        if len(self.risk_manager.trade_history) < 10:
            return 0.0
        
        returns = []
        for trade in self.risk_manager.trade_history:
            if trade['action'] == 'CLOSE' and 'pnl_percent' in trade:
                returns.append(trade['pnl_percent'] / 100)
        
        if not returns:
            return 0.0
            
        returns_array = np.array(returns)
        excess_return = np.mean(returns_array) - (risk_free_rate / 252)
        
        # Calculate downside deviation (only negative returns)
        negative_returns = returns_array[returns_array < 0]
        if len(negative_returns) == 0:
            return float('inf')  # No negative returns
        
        downside_deviation = np.std(negative_returns)
        
        if downside_deviation == 0:
            return 0.0
            
        sortino = excess_return / downside_deviation * np.sqrt(252)  # Annualized
        return sortino
    
    def calculate_calmar_ratio(self) -> float:
        """
        Calculate Calmar ratio (annual return / max drawdown)
        """
        max_dd, _, _ = self.calculate_max_drawdown()
        
        if max_dd == 0 or len(self.risk_manager.trade_history) < 10:
            return 0.0
        
        # Calculate annualized return
        returns = []
        for trade in self.risk_manager.trade_history:
            if trade['action'] == 'CLOSE' and 'pnl_percent' in trade:
                returns.append(trade['pnl_percent'] / 100)
        
        if not returns:
            return 0.0
            
        annual_return = np.mean(returns) * 252  # Annualized
        calmar = annual_return / max_dd
        
        return calmar
    
    def calculate_win_loss_ratio(self) -> Tuple[float, float, float]:
        """
        Calculate win rate, average win, and average loss
        """
        closed_trades = [t for t in self.risk_manager.trade_history 
                        if t['action'] == 'CLOSE' and 'pnl' in t]
        
        if not closed_trades:
            return 0.0, 0.0, 0.0
        
        winning_trades = [t for t in closed_trades if t['pnl'] > 0]
        losing_trades = [t for t in closed_trades if t['pnl'] < 0]
        
        win_rate = len(winning_trades) / len(closed_trades)
        avg_win = np.mean([t['pnl'] for t in winning_trades]) if winning_trades else 0.0
        avg_loss = np.mean([abs(t['pnl']) for t in losing_trades]) if losing_trades else 0.0
        
        return win_rate, avg_win, avg_loss
    
    def calculate_profit_factor(self) -> float:
        """
        Calculate profit factor (gross profit / gross loss)
        """
        closed_trades = [t for t in self.risk_manager.trade_history 
                        if t['action'] == 'CLOSE' and 'pnl' in t]
        
        if not closed_trades:
            return 0.0
        
        gross_profit = sum(t['pnl'] for t in closed_trades if t['pnl'] > 0)
        gross_loss = abs(sum(t['pnl'] for t in closed_trades if t['pnl'] < 0))
        
        if gross_loss == 0:
            return float('inf') if gross_profit > 0 else 0.0
        
        return gross_profit / gross_loss
    
    def generate_risk_report(self) -> Dict:
        """
        Generate comprehensive risk analytics report
        """
        portfolio_summary = self.risk_manager.get_portfolio_summary()
        var_95 = self.calculate_var(0.95, 1)
        var_99 = self.calculate_var(0.99, 1)
        sharpe = self.calculate_sharpe_ratio()
        sortino = self.calculate_sortino_ratio()
        calmar = self.calculate_calmar_ratio()
        max_dd, peak_date, trough_date = self.calculate_max_drawdown()
        win_rate, avg_win, avg_loss = self.calculate_win_loss_ratio()
        profit_factor = self.calculate_profit_factor()
        
        # Calculate additional metrics
        closed_trades = [t for t in self.risk_manager.trade_history 
                        if t['action'] == 'CLOSE' and 'pnl' in t]
        avg_profit = np.mean([t['pnl'] for t in closed_trades]) if closed_trades else 0
        
        return {
            'timestamp': datetime.now(),
            'portfolio_value': portfolio_summary['account_balance'],
            'total_return_percent': ((portfolio_summary['account_balance'] / portfolio_summary['initial_balance']) - 1) * 100,
            'risk_metrics': {
                'var_95_1d': var_95,
                'var_99_1d': var_99,
                'sharpe_ratio': sharpe,
                'sortino_ratio': sortino,
                'calmar_ratio': calmar,
                'max_drawdown_percent': max_dd * 100,
                'current_drawdown_percent': portfolio_summary['current_drawdown_percent'],
                'portfolio_risk_percent': portfolio_summary['portfolio_risk_percent']
            },
            'trading_metrics': {
                'total_trades': len(closed_trades),
                'win_rate_percent': win_rate * 100,
                'avg_win': avg_win,
                'avg_loss': avg_loss,
                'avg_profit_per_trade': avg_profit,
                'profit_factor': profit_factor,
                'active_positions': portfolio_summary['active_positions']
            },
            'risk_limits_status': {
                'within_position_limit': portfolio_summary['active_positions'] <= portfolio_summary['risk_limits']['max_positions'],
                'within_portfolio_risk_limit': portfolio_summary['portfolio_risk_percent'] <= portfolio_summary['risk_limits']['max_portfolio_risk_percent'],
                'within_drawdown_limit': portfolio_summary['current_drawdown_percent'] <= portfolio_summary['risk_limits']['max_drawdown_percent']
            },
            'recommendations': self.risk_manager.optimize_portfolio(),
            'drawdown_period': {
                'peak_date': peak_date.isoformat() if peak_date else None,
                'trough_date': trough_date.isoformat() if trough_date else None,
                'duration_days': (trough_date - peak_date).days if peak_date and trough_date else 0
            }
        }
    
    def get_performance_attribution(self) -> Dict:
        """
        Analyze performance attribution by symbol and strategy
        """
        symbol_performance = {}
        
        for trade in self.risk_manager.trade_history:
            if trade['action'] == 'CLOSE' and 'pnl' in trade:
                symbol = trade['symbol']
                if symbol not in symbol_performance:
                    symbol_performance[symbol] = {
                        'trades': 0,
                        'total_pnl': 0.0,
                        'wins': 0,
                        'losses': 0
                    }
                
                symbol_performance[symbol]['trades'] += 1
                symbol_performance[symbol]['total_pnl'] += trade['pnl']
                
                if trade['pnl'] > 0:
                    symbol_performance[symbol]['wins'] += 1
                else:
                    symbol_performance[symbol]['losses'] += 1
        
        # Calculate win rates and average P&L per symbol
        for symbol, data in symbol_performance.items():
            data['win_rate'] = data['wins'] / data['trades'] if data['trades'] > 0 else 0
            data['avg_pnl'] = data['total_pnl'] / data['trades'] if data['trades'] > 0 else 0
        
        return {
            'symbol_performance': symbol_performance,
            'best_performer': max(symbol_performance.items(), key=lambda x: x[1]['total_pnl']) if symbol_performance else None,
            'worst_performer': min(symbol_performance.items(), key=lambda x: x[1]['total_pnl']) if symbol_performance else None
        }
    
    def get_risk_alerts(self) -> List[Dict]:
        """
        Generate risk alerts based on current portfolio state
        """
        alerts = []
        portfolio = self.risk_manager.get_portfolio_summary()
        
        # High portfolio risk alert
        if portfolio['portfolio_risk_percent'] > 80:
            alerts.append({
                'level': 'HIGH',
                'type': 'PORTFOLIO_RISK',
                'message': f"Portfolio risk at {portfolio['portfolio_risk_percent']:.1f}% - exceeds 80% threshold",
                'timestamp': datetime.now()
            })
        
        # Drawdown alert
        if portfolio['current_drawdown_percent'] > 10:
            alerts.append({
                'level': 'MEDIUM',
                'type': 'DRAWDOWN',
                'message': f"Current drawdown at {portfolio['current_drawdown_percent']:.1f}%",
                'timestamp': datetime.now()
            })
        
        # Emergency stop alert
        if portfolio['emergency_stop_active']:
            alerts.append({
                'level': 'CRITICAL',
                'type': 'EMERGENCY_STOP',
                'message': "Emergency stop is active - all trading halted",
                'timestamp': datetime.now()
            })
        
        # Position concentration alerts
        for position in portfolio['positions']:
            if position['exposure'] > portfolio['account_balance'] * 0.3:  # > 30% of account
                alerts.append({
                    'level': 'MEDIUM',
                    'type': 'CONCENTRATION',
                    'message': f"{position['symbol']} position represents {(position['exposure']/portfolio['account_balance'])*100:.1f}% of account",
                    'timestamp': datetime.now()
                })
        
        return alerts
