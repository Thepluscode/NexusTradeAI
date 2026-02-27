"""
Risk Metrics Calculator
========================
Comprehensive risk metrics for portfolio analysis.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Standard risk metrics (volatility, beta, VaR)
- Risk-adjusted return metrics (Sharpe, Sortino, Information Ratio)
- Drawdown analysis
- Tail risk metrics (skewness, kurtosis, extreme value)
- Time-varying risk metrics
- Risk attribution and decomposition
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
from scipy import stats
import logging

logger = logging.getLogger(__name__)


@dataclass
class ComprehensiveRiskMetrics:
    """Complete set of risk metrics"""
    timestamp: datetime = field(default_factory=datetime.now)

    # Volatility metrics
    daily_volatility: float = 0.0
    annualized_volatility: float = 0.0
    downside_volatility: float = 0.0
    upside_volatility: float = 0.0

    # Value at Risk
    var_95_1day: float = 0.0
    var_99_1day: float = 0.0
    var_95_10day: float = 0.0
    cvar_95: float = 0.0
    cvar_99: float = 0.0

    # Market risk
    beta: float = 0.0
    alpha: float = 0.0
    correlation_to_market: float = 0.0
    tracking_error: float = 0.0

    # Risk-adjusted returns
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    calmar_ratio: float = 0.0
    information_ratio: float = 0.0
    treynor_ratio: float = 0.0

    # Drawdown metrics
    max_drawdown: float = 0.0
    current_drawdown: float = 0.0
    avg_drawdown: float = 0.0
    drawdown_duration_days: int = 0
    recovery_time_days: int = 0

    # Tail risk
    skewness: float = 0.0
    kurtosis: float = 0.0
    tail_ratio: float = 0.0  # Ratio of returns > 2σ to returns < -2σ

    # Win/loss metrics
    win_rate: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    profit_factor: float = 0.0
    largest_win: float = 0.0
    largest_loss: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'daily_volatility': self.daily_volatility,
            'annualized_volatility': self.annualized_volatility,
            'downside_volatility': self.downside_volatility,
            'upside_volatility': self.upside_volatility,
            'var_95_1day': self.var_95_1day,
            'var_99_1day': self.var_99_1day,
            'var_95_10day': self.var_95_10day,
            'cvar_95': self.cvar_95,
            'cvar_99': self.cvar_99,
            'beta': self.beta,
            'alpha': self.alpha,
            'correlation_to_market': self.correlation_to_market,
            'tracking_error': self.tracking_error,
            'sharpe_ratio': self.sharpe_ratio,
            'sortino_ratio': self.sortino_ratio,
            'calmar_ratio': self.calmar_ratio,
            'information_ratio': self.information_ratio,
            'treynor_ratio': self.treynor_ratio,
            'max_drawdown': self.max_drawdown,
            'current_drawdown': self.current_drawdown,
            'avg_drawdown': self.avg_drawdown,
            'drawdown_duration_days': self.drawdown_duration_days,
            'recovery_time_days': self.recovery_time_days,
            'skewness': self.skewness,
            'kurtosis': self.kurtosis,
            'tail_ratio': self.tail_ratio,
            'win_rate': self.win_rate,
            'avg_win': self.avg_win,
            'avg_loss': self.avg_loss,
            'profit_factor': self.profit_factor,
            'largest_win': self.largest_win,
            'largest_loss': self.largest_loss
        }


class RiskMetricsCalculator:
    """
    Calculate comprehensive risk metrics for portfolio analysis
    """

    def __init__(self):
        """Initialize risk metrics calculator"""
        logger.info("Initialized Risk Metrics Calculator")

    def calculate_volatility_metrics(
        self,
        returns: np.ndarray
    ) -> Dict[str, float]:
        """
        Calculate various volatility metrics

        Args:
            returns: Array of returns

        Returns:
            Dictionary of volatility metrics
        """
        if len(returns) < 2:
            return {
                'daily_volatility': 0.0,
                'annualized_volatility': 0.0,
                'downside_volatility': 0.0,
                'upside_volatility': 0.0
            }

        # Daily volatility
        daily_vol = float(np.std(returns))

        # Annualized volatility (252 trading days)
        annualized_vol = daily_vol * np.sqrt(252)

        # Downside volatility (only negative returns)
        downside_returns = returns[returns < 0]
        downside_vol = float(np.std(downside_returns)) * np.sqrt(252) if len(downside_returns) > 0 else 0.0

        # Upside volatility (only positive returns)
        upside_returns = returns[returns > 0]
        upside_vol = float(np.std(upside_returns)) * np.sqrt(252) if len(upside_returns) > 0 else 0.0

        return {
            'daily_volatility': daily_vol,
            'annualized_volatility': annualized_vol,
            'downside_volatility': downside_vol,
            'upside_volatility': upside_vol
        }

    def calculate_var_metrics(
        self,
        returns: np.ndarray
    ) -> Dict[str, float]:
        """
        Calculate Value at Risk metrics

        Args:
            returns: Array of returns

        Returns:
            Dictionary of VaR metrics
        """
        if len(returns) == 0:
            return {
                'var_95_1day': 0.0,
                'var_99_1day': 0.0,
                'var_95_10day': 0.0,
                'cvar_95': 0.0,
                'cvar_99': 0.0
            }

        # 1-day VaR
        var_95 = float(np.percentile(returns, 5))
        var_99 = float(np.percentile(returns, 1))

        # 10-day VaR (scaled by sqrt(10))
        var_95_10day = var_95 * np.sqrt(10)

        # CVaR (Expected Shortfall)
        cvar_95_returns = returns[returns <= var_95]
        cvar_95 = float(np.mean(cvar_95_returns)) if len(cvar_95_returns) > 0 else var_95

        cvar_99_returns = returns[returns <= var_99]
        cvar_99 = float(np.mean(cvar_99_returns)) if len(cvar_99_returns) > 0 else var_99

        return {
            'var_95_1day': var_95,
            'var_99_1day': var_99,
            'var_95_10day': var_95_10day,
            'cvar_95': cvar_95,
            'cvar_99': cvar_99
        }

    def calculate_market_risk(
        self,
        portfolio_returns: np.ndarray,
        market_returns: np.ndarray,
        risk_free_rate: float = 0.02
    ) -> Dict[str, float]:
        """
        Calculate market risk metrics (beta, alpha, etc.)

        Args:
            portfolio_returns: Portfolio returns
            market_returns: Market/benchmark returns
            risk_free_rate: Annual risk-free rate

        Returns:
            Dictionary of market risk metrics
        """
        if len(portfolio_returns) < 2 or len(market_returns) < 2:
            return {
                'beta': 0.0,
                'alpha': 0.0,
                'correlation_to_market': 0.0,
                'tracking_error': 0.0
            }

        # Ensure same length
        min_len = min(len(portfolio_returns), len(market_returns))
        port_ret = portfolio_returns[:min_len]
        mkt_ret = market_returns[:min_len]

        # Beta (covariance / variance)
        covariance = np.cov(port_ret, mkt_ret)[0, 1]
        market_variance = np.var(mkt_ret)
        beta = float(covariance / market_variance) if market_variance > 0 else 0.0

        # Alpha (annualized)
        daily_rf = (1 + risk_free_rate) ** (1/252) - 1
        portfolio_mean = np.mean(port_ret) * 252
        market_mean = np.mean(mkt_ret) * 252
        alpha = float(portfolio_mean - (daily_rf * 252 + beta * (market_mean - daily_rf * 252)))

        # Correlation
        correlation = float(np.corrcoef(port_ret, mkt_ret)[0, 1])

        # Tracking error (annualized)
        active_returns = port_ret - mkt_ret
        tracking_error = float(np.std(active_returns) * np.sqrt(252))

        return {
            'beta': beta,
            'alpha': alpha,
            'correlation_to_market': correlation,
            'tracking_error': tracking_error
        }

    def calculate_risk_adjusted_returns(
        self,
        returns: np.ndarray,
        market_returns: Optional[np.ndarray] = None,
        risk_free_rate: float = 0.02
    ) -> Dict[str, float]:
        """
        Calculate risk-adjusted return metrics

        Args:
            returns: Portfolio returns
            market_returns: Market returns (for Information Ratio, Treynor)
            risk_free_rate: Annual risk-free rate

        Returns:
            Dictionary of risk-adjusted metrics
        """
        if len(returns) < 2:
            return {
                'sharpe_ratio': 0.0,
                'sortino_ratio': 0.0,
                'calmar_ratio': 0.0,
                'information_ratio': 0.0,
                'treynor_ratio': 0.0
            }

        # Annualized return
        mean_return = np.mean(returns) * 252

        # Volatility
        volatility = np.std(returns) * np.sqrt(252)

        # Sharpe Ratio
        sharpe = float((mean_return - risk_free_rate) / volatility) if volatility > 0 else 0.0

        # Sortino Ratio (downside deviation)
        downside_returns = returns[returns < 0]
        downside_deviation = np.std(downside_returns) * np.sqrt(252) if len(downside_returns) > 0 else 0.0
        sortino = float((mean_return - risk_free_rate) / downside_deviation) if downside_deviation > 0 else 0.0

        # Calmar Ratio (return / max drawdown)
        cumulative = np.cumprod(1 + returns) - 1
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / (running_max + 1e-10)
        max_drawdown = float(np.min(drawdowns))
        calmar = float(mean_return / abs(max_drawdown)) if max_drawdown != 0 else 0.0

        # Information Ratio (requires benchmark)
        information_ratio = 0.0
        if market_returns is not None and len(market_returns) == len(returns):
            active_returns = returns - market_returns
            tracking_error = np.std(active_returns) * np.sqrt(252)
            excess_return = np.mean(active_returns) * 252
            information_ratio = float(excess_return / tracking_error) if tracking_error > 0 else 0.0

        # Treynor Ratio (requires beta)
        treynor_ratio = 0.0
        if market_returns is not None and len(market_returns) == len(returns):
            covariance = np.cov(returns, market_returns)[0, 1]
            market_variance = np.var(market_returns)
            beta = covariance / market_variance if market_variance > 0 else 0.0
            treynor_ratio = float((mean_return - risk_free_rate) / beta) if beta > 0 else 0.0

        return {
            'sharpe_ratio': sharpe,
            'sortino_ratio': sortino,
            'calmar_ratio': calmar,
            'information_ratio': information_ratio,
            'treynor_ratio': treynor_ratio
        }

    def calculate_drawdown_metrics(
        self,
        returns: np.ndarray
    ) -> Dict[str, Any]:
        """
        Calculate drawdown metrics

        Args:
            returns: Array of returns

        Returns:
            Dictionary of drawdown metrics
        """
        if len(returns) == 0:
            return {
                'max_drawdown': 0.0,
                'current_drawdown': 0.0,
                'avg_drawdown': 0.0,
                'drawdown_duration_days': 0,
                'recovery_time_days': 0
            }

        # Cumulative returns
        cumulative = np.cumprod(1 + returns) - 1
        running_max = np.maximum.accumulate(cumulative)

        # Drawdowns
        drawdowns = (cumulative - running_max) / (running_max + 1e-10)

        max_drawdown = float(np.min(drawdowns))
        current_drawdown = float(drawdowns[-1])

        # Average drawdown (only during drawdown periods)
        in_drawdown = drawdowns < 0
        avg_drawdown = float(np.mean(drawdowns[in_drawdown])) if np.any(in_drawdown) else 0.0

        # Drawdown duration (current)
        drawdown_duration = 0
        for i in range(len(drawdowns) - 1, -1, -1):
            if drawdowns[i] < 0:
                drawdown_duration += 1
            else:
                break

        # Recovery time (from max drawdown)
        max_dd_idx = np.argmin(drawdowns)
        recovery_time = 0
        for i in range(max_dd_idx, len(drawdowns)):
            if drawdowns[i] >= -0.01:  # Recovered (within 1%)
                recovery_time = i - max_dd_idx
                break
        else:
            recovery_time = len(drawdowns) - max_dd_idx  # Still in drawdown

        return {
            'max_drawdown': max_drawdown,
            'current_drawdown': current_drawdown,
            'avg_drawdown': avg_drawdown,
            'drawdown_duration_days': drawdown_duration,
            'recovery_time_days': recovery_time
        }

    def calculate_tail_risk(
        self,
        returns: np.ndarray
    ) -> Dict[str, float]:
        """
        Calculate tail risk metrics

        Args:
            returns: Array of returns

        Returns:
            Dictionary of tail risk metrics
        """
        if len(returns) < 4:  # Need at least 4 points for skew/kurtosis
            return {
                'skewness': 0.0,
                'kurtosis': 0.0,
                'tail_ratio': 1.0
            }

        # Skewness (negative = left tail, positive = right tail)
        skewness = float(stats.skew(returns))

        # Kurtosis (excess kurtosis, > 0 means fat tails)
        kurtosis = float(stats.kurtosis(returns))

        # Tail ratio (returns > 2σ vs < -2σ)
        std = np.std(returns)
        mean = np.mean(returns)

        upper_tail = np.sum(returns > mean + 2 * std)
        lower_tail = np.sum(returns < mean - 2 * std)

        tail_ratio = float(upper_tail / lower_tail) if lower_tail > 0 else 1.0

        return {
            'skewness': skewness,
            'kurtosis': kurtosis,
            'tail_ratio': tail_ratio
        }

    def calculate_win_loss_metrics(
        self,
        returns: np.ndarray
    ) -> Dict[str, float]:
        """
        Calculate win/loss metrics

        Args:
            returns: Array of returns

        Returns:
            Dictionary of win/loss metrics
        """
        if len(returns) == 0:
            return {
                'win_rate': 0.0,
                'avg_win': 0.0,
                'avg_loss': 0.0,
                'profit_factor': 0.0,
                'largest_win': 0.0,
                'largest_loss': 0.0
            }

        # Separate wins and losses
        wins = returns[returns > 0]
        losses = returns[returns < 0]

        # Win rate
        win_rate = float(len(wins) / len(returns)) if len(returns) > 0 else 0.0

        # Average win/loss
        avg_win = float(np.mean(wins)) if len(wins) > 0 else 0.0
        avg_loss = float(np.mean(losses)) if len(losses) > 0 else 0.0

        # Profit factor
        total_wins = np.sum(wins) if len(wins) > 0 else 0.0
        total_losses = abs(np.sum(losses)) if len(losses) > 0 else 0.0
        profit_factor = float(total_wins / total_losses) if total_losses > 0 else 0.0

        # Largest win/loss
        largest_win = float(np.max(wins)) if len(wins) > 0 else 0.0
        largest_loss = float(np.min(losses)) if len(losses) > 0 else 0.0

        return {
            'win_rate': win_rate,
            'avg_win': avg_win,
            'avg_loss': avg_loss,
            'profit_factor': profit_factor,
            'largest_win': largest_win,
            'largest_loss': largest_loss
        }

    def calculate_all_metrics(
        self,
        portfolio_returns: np.ndarray,
        market_returns: Optional[np.ndarray] = None,
        risk_free_rate: float = 0.02
    ) -> ComprehensiveRiskMetrics:
        """
        Calculate all risk metrics

        Args:
            portfolio_returns: Portfolio returns
            market_returns: Market/benchmark returns (optional)
            risk_free_rate: Annual risk-free rate

        Returns:
            ComprehensiveRiskMetrics object
        """
        metrics = ComprehensiveRiskMetrics()

        # Volatility metrics
        vol_metrics = self.calculate_volatility_metrics(portfolio_returns)
        metrics.daily_volatility = vol_metrics['daily_volatility']
        metrics.annualized_volatility = vol_metrics['annualized_volatility']
        metrics.downside_volatility = vol_metrics['downside_volatility']
        metrics.upside_volatility = vol_metrics['upside_volatility']

        # VaR metrics
        var_metrics = self.calculate_var_metrics(portfolio_returns)
        metrics.var_95_1day = var_metrics['var_95_1day']
        metrics.var_99_1day = var_metrics['var_99_1day']
        metrics.var_95_10day = var_metrics['var_95_10day']
        metrics.cvar_95 = var_metrics['cvar_95']
        metrics.cvar_99 = var_metrics['cvar_99']

        # Market risk (if benchmark provided)
        if market_returns is not None:
            market_metrics = self.calculate_market_risk(portfolio_returns, market_returns, risk_free_rate)
            metrics.beta = market_metrics['beta']
            metrics.alpha = market_metrics['alpha']
            metrics.correlation_to_market = market_metrics['correlation_to_market']
            metrics.tracking_error = market_metrics['tracking_error']

        # Risk-adjusted returns
        adjusted_metrics = self.calculate_risk_adjusted_returns(portfolio_returns, market_returns, risk_free_rate)
        metrics.sharpe_ratio = adjusted_metrics['sharpe_ratio']
        metrics.sortino_ratio = adjusted_metrics['sortino_ratio']
        metrics.calmar_ratio = adjusted_metrics['calmar_ratio']
        metrics.information_ratio = adjusted_metrics['information_ratio']
        metrics.treynor_ratio = adjusted_metrics['treynor_ratio']

        # Drawdown metrics
        dd_metrics = self.calculate_drawdown_metrics(portfolio_returns)
        metrics.max_drawdown = dd_metrics['max_drawdown']
        metrics.current_drawdown = dd_metrics['current_drawdown']
        metrics.avg_drawdown = dd_metrics['avg_drawdown']
        metrics.drawdown_duration_days = dd_metrics['drawdown_duration_days']
        metrics.recovery_time_days = dd_metrics['recovery_time_days']

        # Tail risk
        tail_metrics = self.calculate_tail_risk(portfolio_returns)
        metrics.skewness = tail_metrics['skewness']
        metrics.kurtosis = tail_metrics['kurtosis']
        metrics.tail_ratio = tail_metrics['tail_ratio']

        # Win/loss metrics
        wl_metrics = self.calculate_win_loss_metrics(portfolio_returns)
        metrics.win_rate = wl_metrics['win_rate']
        metrics.avg_win = wl_metrics['avg_win']
        metrics.avg_loss = wl_metrics['avg_loss']
        metrics.profit_factor = wl_metrics['profit_factor']
        metrics.largest_win = wl_metrics['largest_win']
        metrics.largest_loss = wl_metrics['largest_loss']

        return metrics

    def print_risk_report(self, metrics: ComprehensiveRiskMetrics):
        """Print comprehensive risk report"""
        print("\n" + "="*70)
        print("COMPREHENSIVE RISK METRICS REPORT")
        print("="*70)
        print(f"Timestamp: {metrics.timestamp.isoformat()}")
        print()

        print("VOLATILITY METRICS:")
        print(f"  Daily Volatility: {metrics.daily_volatility:.2%}")
        print(f"  Annualized Volatility: {metrics.annualized_volatility:.2%}")
        print(f"  Downside Volatility: {metrics.downside_volatility:.2%}")
        print(f"  Upside Volatility: {metrics.upside_volatility:.2%}")
        print()

        print("VALUE AT RISK:")
        print(f"  1-Day VaR (95%): {metrics.var_95_1day:.2%}")
        print(f"  1-Day VaR (99%): {metrics.var_99_1day:.2%}")
        print(f"  10-Day VaR (95%): {metrics.var_95_10day:.2%}")
        print(f"  CVaR (95%): {metrics.cvar_95:.2%}")
        print(f"  CVaR (99%): {metrics.cvar_99:.2%}")
        print()

        print("MARKET RISK:")
        print(f"  Beta: {metrics.beta:.3f}")
        print(f"  Alpha (annualized): {metrics.alpha:.2%}")
        print(f"  Market Correlation: {metrics.correlation_to_market:.3f}")
        print(f"  Tracking Error: {metrics.tracking_error:.2%}")
        print()

        print("RISK-ADJUSTED RETURNS:")
        print(f"  Sharpe Ratio: {metrics.sharpe_ratio:.3f}")
        print(f"  Sortino Ratio: {metrics.sortino_ratio:.3f}")
        print(f"  Calmar Ratio: {metrics.calmar_ratio:.3f}")
        print(f"  Information Ratio: {metrics.information_ratio:.3f}")
        print(f"  Treynor Ratio: {metrics.treynor_ratio:.3f}")
        print()

        print("DRAWDOWN ANALYSIS:")
        print(f"  Maximum Drawdown: {metrics.max_drawdown:.2%}")
        print(f"  Current Drawdown: {metrics.current_drawdown:.2%}")
        print(f"  Average Drawdown: {metrics.avg_drawdown:.2%}")
        print(f"  Drawdown Duration: {metrics.drawdown_duration_days} days")
        print(f"  Recovery Time: {metrics.recovery_time_days} days")
        print()

        print("TAIL RISK:")
        print(f"  Skewness: {metrics.skewness:.3f}")
        print(f"  Kurtosis: {metrics.kurtosis:.3f}")
        print(f"  Tail Ratio: {metrics.tail_ratio:.3f}")
        print()

        print("WIN/LOSS ANALYSIS:")
        print(f"  Win Rate: {metrics.win_rate:.2%}")
        print(f"  Average Win: {metrics.avg_win:.2%}")
        print(f"  Average Loss: {metrics.avg_loss:.2%}")
        print(f"  Profit Factor: {metrics.profit_factor:.3f}")
        print(f"  Largest Win: {metrics.largest_win:.2%}")
        print(f"  Largest Loss: {metrics.largest_loss:.2%}")

        print("="*70 + "\n")


# Example usage
if __name__ == "__main__":
    print("Risk Metrics Calculator Example")
    print("="*70)

    # Generate sample returns
    np.random.seed(42)
    n_days = 252

    # Portfolio returns (slightly positive mean, moderate volatility)
    portfolio_returns = np.random.normal(0.0008, 0.015, n_days)

    # Market returns (benchmark)
    market_returns = np.random.normal(0.0005, 0.012, n_days)

    # Calculate all metrics
    calculator = RiskMetricsCalculator()
    metrics = calculator.calculate_all_metrics(
        portfolio_returns,
        market_returns,
        risk_free_rate=0.02
    )

    # Print comprehensive report
    calculator.print_risk_report(metrics)
