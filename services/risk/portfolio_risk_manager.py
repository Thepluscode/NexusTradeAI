"""
Portfolio Risk Manager
======================
Institutional-grade portfolio risk management with VaR, CVaR, and stress testing.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Value at Risk (VaR) - Historical, Parametric, Monte Carlo
- Conditional Value at Risk (CVaR) / Expected Shortfall
- Portfolio volatility and correlation analysis
- Risk decomposition by position
- Tail risk metrics
- Risk limits and circuit breakers
- Real-time risk monitoring
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging
from scipy import stats
from scipy.optimize import minimize

logger = logging.getLogger(__name__)


class VaRMethod(str, Enum):
    """Value at Risk calculation methods"""
    HISTORICAL = "historical"
    PARAMETRIC = "parametric"
    MONTE_CARLO = "monte_carlo"


class RiskLevel(str, Enum):
    """Risk level classifications"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


@dataclass
class RiskMetrics:
    """Portfolio risk metrics"""
    timestamp: datetime = field(default_factory=datetime.now)

    # Value at Risk
    var_95: float = 0.0  # 95% VaR
    var_99: float = 0.0  # 99% VaR

    # Conditional VaR (Expected Shortfall)
    cvar_95: float = 0.0
    cvar_99: float = 0.0

    # Volatility metrics
    portfolio_volatility: float = 0.0
    annualized_volatility: float = 0.0

    # Portfolio metrics
    sharpe_ratio: float = 0.0
    sortino_ratio: float = 0.0
    max_drawdown: float = 0.0
    current_drawdown: float = 0.0

    # Risk decomposition
    position_contributions: Dict[str, float] = field(default_factory=dict)

    # Risk level
    risk_level: RiskLevel = RiskLevel.LOW

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'var_95': self.var_95,
            'var_99': self.var_99,
            'cvar_95': self.cvar_95,
            'cvar_99': self.cvar_99,
            'portfolio_volatility': self.portfolio_volatility,
            'annualized_volatility': self.annualized_volatility,
            'sharpe_ratio': self.sharpe_ratio,
            'sortino_ratio': self.sortino_ratio,
            'max_drawdown': self.max_drawdown,
            'current_drawdown': self.current_drawdown,
            'position_contributions': self.position_contributions,
            'risk_level': self.risk_level.value
        }


@dataclass
class RiskLimits:
    """Portfolio risk limits"""
    max_var_95: float = 0.05  # 5% max VaR
    max_var_99: float = 0.10  # 10% max VaR
    max_cvar_95: float = 0.08  # 8% max CVaR
    max_drawdown: float = 0.20  # 20% max drawdown
    max_position_size: float = 0.20  # 20% max per position
    max_sector_exposure: float = 0.40  # 40% max per sector
    max_portfolio_volatility: float = 0.25  # 25% annualized volatility
    min_sharpe_ratio: float = 1.0  # Minimum Sharpe ratio

    def check_breach(self, metrics: RiskMetrics) -> List[str]:
        """Check for risk limit breaches"""
        breaches = []

        if abs(metrics.var_95) > self.max_var_95:
            breaches.append(f"VaR 95% breach: {metrics.var_95:.2%} > {self.max_var_95:.2%}")

        if abs(metrics.var_99) > self.max_var_99:
            breaches.append(f"VaR 99% breach: {metrics.var_99:.2%} > {self.max_var_99:.2%}")

        if abs(metrics.cvar_95) > self.max_cvar_95:
            breaches.append(f"CVaR 95% breach: {metrics.cvar_95:.2%} > {self.max_cvar_95:.2%}")

        if abs(metrics.max_drawdown) > self.max_drawdown:
            breaches.append(f"Max drawdown breach: {metrics.max_drawdown:.2%} > {self.max_drawdown:.2%}")

        if metrics.annualized_volatility > self.max_portfolio_volatility:
            breaches.append(f"Volatility breach: {metrics.annualized_volatility:.2%} > {self.max_portfolio_volatility:.2%}")

        if metrics.sharpe_ratio < self.min_sharpe_ratio:
            breaches.append(f"Sharpe ratio breach: {metrics.sharpe_ratio:.2f} < {self.min_sharpe_ratio:.2f}")

        return breaches


class PortfolioRiskManager:
    """
    Manages portfolio risk with institutional-grade metrics
    """

    def __init__(self, risk_limits: Optional[RiskLimits] = None):
        """
        Initialize portfolio risk manager

        Args:
            risk_limits: Risk limits configuration
        """
        self.risk_limits = risk_limits or RiskLimits()
        self.historical_returns: List[float] = []
        self.risk_history: List[RiskMetrics] = []

        logger.info("Initialized Portfolio Risk Manager")

    def calculate_var(
        self,
        returns: np.ndarray,
        confidence_level: float = 0.95,
        method: VaRMethod = VaRMethod.HISTORICAL
    ) -> float:
        """
        Calculate Value at Risk (VaR)

        Args:
            returns: Array of portfolio returns
            confidence_level: Confidence level (0.95 or 0.99)
            method: VaR calculation method

        Returns:
            VaR as a negative percentage (e.g., -0.05 = 5% loss)
        """
        if len(returns) == 0:
            return 0.0

        if method == VaRMethod.HISTORICAL:
            # Historical VaR: empirical quantile
            var = np.percentile(returns, (1 - confidence_level) * 100)

        elif method == VaRMethod.PARAMETRIC:
            # Parametric VaR: assumes normal distribution
            mean = np.mean(returns)
            std = np.std(returns)
            z_score = stats.norm.ppf(1 - confidence_level)
            var = mean + z_score * std

        elif method == VaRMethod.MONTE_CARLO:
            # Monte Carlo VaR: simulate future returns
            mean = np.mean(returns)
            std = np.std(returns)
            n_simulations = 10000

            simulated_returns = np.random.normal(mean, std, n_simulations)
            var = np.percentile(simulated_returns, (1 - confidence_level) * 100)

        else:
            raise ValueError(f"Unknown VaR method: {method}")

        return float(var)

    def calculate_cvar(
        self,
        returns: np.ndarray,
        confidence_level: float = 0.95,
        method: VaRMethod = VaRMethod.HISTORICAL
    ) -> float:
        """
        Calculate Conditional Value at Risk (CVaR) / Expected Shortfall

        CVaR is the expected loss given that the loss exceeds VaR.
        It captures tail risk better than VaR.

        Args:
            returns: Array of portfolio returns
            confidence_level: Confidence level (0.95 or 0.99)
            method: Calculation method

        Returns:
            CVaR as a negative percentage
        """
        if len(returns) == 0:
            return 0.0

        # First calculate VaR
        var = self.calculate_var(returns, confidence_level, method)

        # CVaR is the mean of all returns below VaR
        tail_returns = returns[returns <= var]

        if len(tail_returns) == 0:
            return var  # If no tail, CVaR = VaR

        cvar = float(np.mean(tail_returns))
        return cvar

    def calculate_portfolio_volatility(
        self,
        returns: np.ndarray,
        annualize: bool = True
    ) -> float:
        """
        Calculate portfolio volatility

        Args:
            returns: Array of portfolio returns
            annualize: Whether to annualize (assume 252 trading days)

        Returns:
            Volatility as a percentage
        """
        if len(returns) < 2:
            return 0.0

        volatility = float(np.std(returns))

        if annualize:
            # Annualize assuming 252 trading days
            volatility *= np.sqrt(252)

        return volatility

    def calculate_sharpe_ratio(
        self,
        returns: np.ndarray,
        risk_free_rate: float = 0.02
    ) -> float:
        """
        Calculate Sharpe ratio

        Args:
            returns: Array of portfolio returns
            risk_free_rate: Annual risk-free rate (default 2%)

        Returns:
            Sharpe ratio
        """
        if len(returns) < 2:
            return 0.0

        mean_return = np.mean(returns) * 252  # Annualize
        volatility = self.calculate_portfolio_volatility(returns, annualize=True)

        if volatility == 0:
            return 0.0

        sharpe = (mean_return - risk_free_rate) / volatility
        return float(sharpe)

    def calculate_sortino_ratio(
        self,
        returns: np.ndarray,
        risk_free_rate: float = 0.02
    ) -> float:
        """
        Calculate Sortino ratio (uses downside deviation instead of total volatility)

        Args:
            returns: Array of portfolio returns
            risk_free_rate: Annual risk-free rate

        Returns:
            Sortino ratio
        """
        if len(returns) < 2:
            return 0.0

        mean_return = np.mean(returns) * 252  # Annualize

        # Downside deviation (only negative returns)
        downside_returns = returns[returns < 0]
        if len(downside_returns) == 0:
            return float('inf')  # No downside

        downside_deviation = np.std(downside_returns) * np.sqrt(252)

        if downside_deviation == 0:
            return 0.0

        sortino = (mean_return - risk_free_rate) / downside_deviation
        return float(sortino)

    def calculate_max_drawdown(
        self,
        cumulative_returns: np.ndarray
    ) -> Tuple[float, float]:
        """
        Calculate maximum drawdown and current drawdown

        Args:
            cumulative_returns: Array of cumulative returns

        Returns:
            (max_drawdown, current_drawdown) as negative percentages
        """
        if len(cumulative_returns) == 0:
            return 0.0, 0.0

        # Calculate running maximum
        running_max = np.maximum.accumulate(cumulative_returns)

        # Calculate drawdowns
        drawdowns = (cumulative_returns - running_max) / (running_max + 1e-10)

        max_drawdown = float(np.min(drawdowns))
        current_drawdown = float(drawdowns[-1])

        return max_drawdown, current_drawdown

    def decompose_risk(
        self,
        positions: Dict[str, float],
        returns_matrix: pd.DataFrame,
        portfolio_var: float
    ) -> Dict[str, float]:
        """
        Decompose portfolio VaR into position contributions

        Args:
            positions: Dict of {symbol: position_value}
            returns_matrix: DataFrame of historical returns by symbol
            portfolio_var: Total portfolio VaR

        Returns:
            Dict of {symbol: var_contribution}
        """
        contributions = {}

        total_value = sum(abs(v) for v in positions.values())
        if total_value == 0:
            return contributions

        # Calculate marginal VaR for each position
        for symbol, position_value in positions.items():
            if symbol not in returns_matrix.columns:
                contributions[symbol] = 0.0
                continue

            # Position weight
            weight = position_value / total_value

            # Marginal contribution (simplified)
            # In practice, this would use covariance matrix
            symbol_volatility = returns_matrix[symbol].std()
            contribution = weight * symbol_volatility * portfolio_var

            contributions[symbol] = float(contribution)

        return contributions

    def calculate_risk_metrics(
        self,
        returns: np.ndarray,
        positions: Optional[Dict[str, float]] = None,
        returns_matrix: Optional[pd.DataFrame] = None,
        method: VaRMethod = VaRMethod.HISTORICAL
    ) -> RiskMetrics:
        """
        Calculate comprehensive risk metrics

        Args:
            returns: Array of portfolio returns
            positions: Current positions {symbol: value}
            returns_matrix: Historical returns by symbol
            method: VaR calculation method

        Returns:
            RiskMetrics object with all metrics
        """
        metrics = RiskMetrics()

        if len(returns) == 0:
            return metrics

        # VaR calculations
        metrics.var_95 = self.calculate_var(returns, 0.95, method)
        metrics.var_99 = self.calculate_var(returns, 0.99, method)

        # CVaR calculations
        metrics.cvar_95 = self.calculate_cvar(returns, 0.95, method)
        metrics.cvar_99 = self.calculate_cvar(returns, 0.99, method)

        # Volatility
        metrics.portfolio_volatility = self.calculate_portfolio_volatility(returns, annualize=False)
        metrics.annualized_volatility = self.calculate_portfolio_volatility(returns, annualize=True)

        # Risk-adjusted returns
        metrics.sharpe_ratio = self.calculate_sharpe_ratio(returns)
        metrics.sortino_ratio = self.calculate_sortino_ratio(returns)

        # Drawdown
        cumulative_returns = np.cumprod(1 + returns) - 1
        metrics.max_drawdown, metrics.current_drawdown = self.calculate_max_drawdown(cumulative_returns)

        # Risk decomposition
        if positions and returns_matrix is not None:
            metrics.position_contributions = self.decompose_risk(
                positions, returns_matrix, metrics.var_95
            )

        # Determine risk level
        metrics.risk_level = self._classify_risk_level(metrics)

        # Store in history
        self.risk_history.append(metrics)

        return metrics

    def _classify_risk_level(self, metrics: RiskMetrics) -> RiskLevel:
        """Classify overall risk level based on metrics"""

        # Check for critical breaches
        if abs(metrics.var_99) > self.risk_limits.max_var_99:
            return RiskLevel.CRITICAL

        if abs(metrics.max_drawdown) > self.risk_limits.max_drawdown:
            return RiskLevel.CRITICAL

        # Check for high risk
        if abs(metrics.var_95) > self.risk_limits.max_var_95 * 0.8:
            return RiskLevel.HIGH

        if metrics.sharpe_ratio < self.risk_limits.min_sharpe_ratio:
            return RiskLevel.HIGH

        # Check for medium risk
        if abs(metrics.var_95) > self.risk_limits.max_var_95 * 0.5:
            return RiskLevel.MEDIUM

        # Otherwise low risk
        return RiskLevel.LOW

    def check_risk_limits(self, metrics: RiskMetrics) -> Tuple[bool, List[str]]:
        """
        Check if risk metrics breach limits

        Args:
            metrics: Risk metrics to check

        Returns:
            (breached, list of breach descriptions)
        """
        breaches = self.risk_limits.check_breach(metrics)
        return len(breaches) > 0, breaches

    def get_risk_report(self, metrics: RiskMetrics) -> str:
        """
        Generate human-readable risk report

        Args:
            metrics: Risk metrics

        Returns:
            Formatted risk report string
        """
        report = []
        report.append("="*60)
        report.append("PORTFOLIO RISK REPORT")
        report.append("="*60)
        report.append(f"Timestamp: {metrics.timestamp.isoformat()}")
        report.append(f"Risk Level: {metrics.risk_level.value}")
        report.append("")

        report.append("Value at Risk (VaR):")
        report.append(f"  95% VaR: {metrics.var_95:.2%} (limit: {self.risk_limits.max_var_95:.2%})")
        report.append(f"  99% VaR: {metrics.var_99:.2%} (limit: {self.risk_limits.max_var_99:.2%})")
        report.append("")

        report.append("Conditional VaR (Expected Shortfall):")
        report.append(f"  95% CVaR: {metrics.cvar_95:.2%} (limit: {self.risk_limits.max_cvar_95:.2%})")
        report.append(f"  99% CVaR: {metrics.cvar_99:.2%}")
        report.append("")

        report.append("Volatility:")
        report.append(f"  Daily: {metrics.portfolio_volatility:.2%}")
        report.append(f"  Annualized: {metrics.annualized_volatility:.2%} (limit: {self.risk_limits.max_portfolio_volatility:.2%})")
        report.append("")

        report.append("Risk-Adjusted Returns:")
        report.append(f"  Sharpe Ratio: {metrics.sharpe_ratio:.2f} (min: {self.risk_limits.min_sharpe_ratio:.2f})")
        report.append(f"  Sortino Ratio: {metrics.sortino_ratio:.2f}")
        report.append("")

        report.append("Drawdown:")
        report.append(f"  Current: {metrics.current_drawdown:.2%}")
        report.append(f"  Maximum: {metrics.max_drawdown:.2%} (limit: {self.risk_limits.max_drawdown:.2%})")
        report.append("")

        # Check breaches
        breached, breaches = self.check_risk_limits(metrics)
        if breached:
            report.append("⚠️  RISK LIMIT BREACHES:")
            for breach in breaches:
                report.append(f"  - {breach}")
        else:
            report.append("✅ All risk limits within acceptable range")

        report.append("="*60)

        return "\n".join(report)

    def simulate_stress_scenario(
        self,
        returns: np.ndarray,
        shock_pct: float = -0.10
    ) -> RiskMetrics:
        """
        Simulate a stress scenario (e.g., 10% market crash)

        Args:
            returns: Historical returns
            shock_pct: Shock percentage (negative for crash)

        Returns:
            Risk metrics under stress scenario
        """
        # Apply shock to returns
        stressed_returns = returns + shock_pct

        # Calculate risk metrics under stress
        stressed_metrics = self.calculate_risk_metrics(stressed_returns)

        return stressed_metrics

    def monitor_real_time_risk(
        self,
        current_positions: Dict[str, float],
        historical_returns: pd.DataFrame
    ) -> RiskMetrics:
        """
        Monitor real-time portfolio risk

        Args:
            current_positions: Current positions {symbol: value}
            historical_returns: Historical returns DataFrame

        Returns:
            Current risk metrics
        """
        # Calculate portfolio returns from historical data
        total_value = sum(abs(v) for v in current_positions.values())
        if total_value == 0:
            return RiskMetrics()

        portfolio_returns = np.zeros(len(historical_returns))

        for symbol, position_value in current_positions.items():
            if symbol in historical_returns.columns:
                weight = position_value / total_value
                portfolio_returns += weight * historical_returns[symbol].values

        # Calculate risk metrics
        metrics = self.calculate_risk_metrics(
            portfolio_returns,
            current_positions,
            historical_returns
        )

        return metrics


# Example usage
if __name__ == "__main__":
    import matplotlib.pyplot as plt

    print("Portfolio Risk Manager Example")
    print("="*60)

    # Initialize risk manager
    risk_manager = PortfolioRiskManager()

    # Generate sample returns (simulating a portfolio)
    np.random.seed(42)
    n_days = 252  # 1 year
    mean_return = 0.001  # 0.1% daily
    volatility = 0.02  # 2% daily volatility

    returns = np.random.normal(mean_return, volatility, n_days)

    # Calculate risk metrics
    print("\nCalculating risk metrics...")
    metrics = risk_manager.calculate_risk_metrics(returns)

    # Print risk report
    print(risk_manager.get_risk_report(metrics))

    # Test different VaR methods
    print("\nComparing VaR Methods:")
    print("-"*60)
    for method in [VaRMethod.HISTORICAL, VaRMethod.PARAMETRIC, VaRMethod.MONTE_CARLO]:
        var_95 = risk_manager.calculate_var(returns, 0.95, method)
        var_99 = risk_manager.calculate_var(returns, 0.99, method)
        print(f"{method.value:15s}: VaR 95% = {var_95:.2%}, VaR 99% = {var_99:.2%}")

    # Stress test
    print("\nStress Test (10% market crash):")
    print("-"*60)
    stressed_metrics = risk_manager.simulate_stress_scenario(returns, shock_pct=-0.10)
    print(f"Stressed VaR 95%: {stressed_metrics.var_95:.2%}")
    print(f"Stressed CVaR 95%: {stressed_metrics.cvar_95:.2%}")
    print(f"Stressed Max Drawdown: {stressed_metrics.max_drawdown:.2%}")

    print("\n" + "="*60)
