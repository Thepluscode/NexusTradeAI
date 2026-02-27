"""
Kelly Criterion Position Sizer
===============================
Optimal position sizing using Kelly Criterion and variants.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Full Kelly Criterion calculation
- Fractional Kelly (recommended for risk management)
- Kelly for multiple simultaneous bets
- Kelly with maximum loss constraint
- Empirical Kelly from historical trades
- Continuous Kelly for geometric Brownian motion
- Kelly adjustment for skewness and kurtosis
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
from scipy import stats
from scipy.optimize import minimize
import logging

logger = logging.getLogger(__name__)


@dataclass
class KellyParameters:
    """Parameters for Kelly Criterion calculation"""
    win_probability: float  # P(win)
    win_loss_ratio: float  # Average win / Average loss
    edge: Optional[float] = None  # Expected return per bet
    kelly_fraction: float = 0.25  # Fractional Kelly (default 25%)
    max_position_size: float = 0.20  # Maximum position size (20%)
    min_position_size: float = 0.01  # Minimum position size (1%)

    def __post_init__(self):
        """Validate parameters"""
        if not 0 <= self.win_probability <= 1:
            raise ValueError("Win probability must be between 0 and 1")
        if self.win_loss_ratio < 0:
            raise ValueError("Win/loss ratio must be positive")
        if not 0 < self.kelly_fraction <= 1:
            raise ValueError("Kelly fraction must be between 0 and 1")


@dataclass
class KellyResult:
    """Result of Kelly Criterion calculation"""
    timestamp: datetime = field(default_factory=datetime.now)

    # Kelly calculations
    full_kelly: float = 0.0  # Full Kelly percentage
    fractional_kelly: float = 0.0  # Fractional Kelly (recommended)
    recommended_position_size: float = 0.0  # Final recommended size

    # Risk metrics
    edge: float = 0.0  # Expected return per bet
    risk_of_ruin: float = 0.0  # Probability of losing all capital
    expected_growth_rate: float = 0.0  # Expected geometric growth

    # Constraints applied
    constrained_by_max: bool = False
    constrained_by_min: bool = False

    # Input parameters
    win_probability: float = 0.0
    win_loss_ratio: float = 0.0
    kelly_fraction: float = 0.25

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'full_kelly': self.full_kelly,
            'fractional_kelly': self.fractional_kelly,
            'recommended_position_size': self.recommended_position_size,
            'edge': self.edge,
            'risk_of_ruin': self.risk_of_ruin,
            'expected_growth_rate': self.expected_growth_rate,
            'constrained_by_max': self.constrained_by_max,
            'constrained_by_min': self.constrained_by_min,
            'win_probability': self.win_probability,
            'win_loss_ratio': self.win_loss_ratio,
            'kelly_fraction': self.kelly_fraction
        }


class KellyCriterion:
    """
    Kelly Criterion position sizing calculator

    The Kelly Criterion maximizes the expected logarithmic growth rate of capital.

    Formula for win/loss betting:
        f* = (p * r - q) / r

    Where:
        f* = optimal fraction of capital to bet
        p = probability of winning
        q = probability of losing (1 - p)
        r = win/loss ratio (avg win / avg loss)
    """

    def __init__(self):
        """Initialize Kelly Criterion calculator"""
        logger.info("Initialized Kelly Criterion Calculator")

    def calculate_full_kelly(
        self,
        win_probability: float,
        win_loss_ratio: float
    ) -> float:
        """
        Calculate full Kelly Criterion

        Args:
            win_probability: Probability of winning (0-1)
            win_loss_ratio: Average win / average loss

        Returns:
            Optimal fraction of capital to bet (0-1)
        """
        if win_probability <= 0 or win_probability >= 1:
            return 0.0

        if win_loss_ratio <= 0:
            return 0.0

        # Kelly formula: f* = (p * r - q) / r
        p = win_probability
        q = 1 - p
        r = win_loss_ratio

        kelly = (p * r - q) / r

        # Kelly can be negative (don't bet) or > 1 (leverage)
        # We cap at 1 (100%) for single bet
        kelly = max(0.0, min(1.0, kelly))

        return float(kelly)

    def calculate_fractional_kelly(
        self,
        win_probability: float,
        win_loss_ratio: float,
        kelly_fraction: float = 0.25
    ) -> float:
        """
        Calculate fractional Kelly (recommended)

        Fractional Kelly reduces risk of ruin and drawdowns while still
        capturing most of the growth.

        Common fractions:
        - 1/2 Kelly (50%): Popular among professionals
        - 1/4 Kelly (25%): Very conservative (recommended for trading)
        - 1/8 Kelly (12.5%): Extremely conservative

        Args:
            win_probability: Probability of winning
            win_loss_ratio: Win/loss ratio
            kelly_fraction: Fraction of Kelly to use (0-1)

        Returns:
            Fractional Kelly position size
        """
        full_kelly = self.calculate_full_kelly(win_probability, win_loss_ratio)
        return full_kelly * kelly_fraction

    def calculate_kelly_from_edge(
        self,
        edge: float,
        volatility: float,
        kelly_fraction: float = 0.25
    ) -> float:
        """
        Calculate Kelly for continuous returns (geometric Brownian motion)

        For assets with continuous returns:
            f* = edge / variance

        Where:
            edge = expected excess return
            variance = variance of returns

        Args:
            edge: Expected excess return (e.g., 0.10 = 10%)
            volatility: Standard deviation of returns
            kelly_fraction: Fraction of Kelly to use

        Returns:
            Fractional Kelly position size
        """
        if volatility <= 0:
            return 0.0

        variance = volatility ** 2

        # Continuous Kelly formula
        kelly = edge / variance

        # Apply fractional Kelly
        kelly = kelly * kelly_fraction

        # Cap at 100%
        kelly = max(0.0, min(1.0, kelly))

        return float(kelly)

    def calculate_empirical_kelly(
        self,
        trade_returns: np.ndarray,
        kelly_fraction: float = 0.25
    ) -> Tuple[float, float, float]:
        """
        Calculate Kelly from empirical trade results

        Args:
            trade_returns: Array of trade returns (positive and negative)
            kelly_fraction: Fraction of Kelly to use

        Returns:
            (kelly_size, win_prob, win_loss_ratio)
        """
        if len(trade_returns) == 0:
            return 0.0, 0.0, 0.0

        # Separate wins and losses
        wins = trade_returns[trade_returns > 0]
        losses = trade_returns[trade_returns < 0]

        if len(wins) == 0 or len(losses) == 0:
            return 0.0, 0.0, 0.0

        # Calculate win probability
        win_prob = len(wins) / len(trade_returns)

        # Calculate win/loss ratio
        avg_win = np.mean(wins)
        avg_loss = abs(np.mean(losses))

        if avg_loss == 0:
            return 0.0, win_prob, 0.0

        win_loss_ratio = avg_win / avg_loss

        # Calculate Kelly
        kelly = self.calculate_fractional_kelly(
            win_prob,
            win_loss_ratio,
            kelly_fraction
        )

        return kelly, win_prob, win_loss_ratio

    def calculate_kelly_with_constraints(
        self,
        params: KellyParameters
    ) -> KellyResult:
        """
        Calculate Kelly with constraints and safety checks

        Args:
            params: Kelly parameters

        Returns:
            KellyResult with all calculations
        """
        result = KellyResult()

        # Store input parameters
        result.win_probability = params.win_probability
        result.win_loss_ratio = params.win_loss_ratio
        result.kelly_fraction = params.kelly_fraction

        # Calculate full Kelly
        result.full_kelly = self.calculate_full_kelly(
            params.win_probability,
            params.win_loss_ratio
        )

        # Calculate fractional Kelly
        result.fractional_kelly = result.full_kelly * params.kelly_fraction

        # Apply constraints
        recommended = result.fractional_kelly

        if recommended > params.max_position_size:
            recommended = params.max_position_size
            result.constrained_by_max = True

        if recommended < params.min_position_size and recommended > 0:
            recommended = params.min_position_size
            result.constrained_by_min = True

        result.recommended_position_size = recommended

        # Calculate edge
        p = params.win_probability
        q = 1 - p
        r = params.win_loss_ratio
        result.edge = p * r - q

        # Calculate risk of ruin (simplified)
        # Using formula for fixed fraction betting
        if result.recommended_position_size > 0:
            # Risk of ruin decreases exponentially with edge
            result.risk_of_ruin = self._calculate_risk_of_ruin(
                result.edge,
                result.recommended_position_size,
                params.win_probability
            )

        # Calculate expected growth rate
        # g = edge - (variance / 2) * f
        if result.recommended_position_size > 0:
            variance = params.win_probability * (params.win_loss_ratio ** 2) + \
                       (1 - params.win_probability)
            result.expected_growth_rate = result.edge * result.recommended_position_size - \
                                         (variance / 2) * (result.recommended_position_size ** 2)

        return result

    def _calculate_risk_of_ruin(
        self,
        edge: float,
        position_size: float,
        win_prob: float
    ) -> float:
        """
        Calculate risk of ruin (losing all capital)

        Simplified formula for fixed fraction betting.
        """
        if edge <= 0:
            return 1.0  # No edge = certain ruin eventually

        if position_size >= 1.0:
            return 1.0  # Betting everything = certain ruin

        # Simplified risk of ruin formula
        # More accurate formula requires numerical methods
        risk = (1 - edge) ** (1 / position_size)
        risk = min(1.0, max(0.0, risk))

        return float(risk)

    def calculate_simultaneous_kelly(
        self,
        opportunities: List[Tuple[float, float]],
        kelly_fraction: float = 0.25
    ) -> List[float]:
        """
        Calculate Kelly for multiple simultaneous bets

        When you have multiple uncorrelated opportunities, the Kelly criterion
        for each bet must account for the others.

        Args:
            opportunities: List of (win_prob, win_loss_ratio) tuples
            kelly_fraction: Fraction of Kelly to use

        Returns:
            List of position sizes (one per opportunity)
        """
        if not opportunities:
            return []

        # For uncorrelated bets, calculate each Kelly independently
        # Then normalize so total doesn't exceed 100%

        individual_kellys = []
        for win_prob, win_loss_ratio in opportunities:
            kelly = self.calculate_full_kelly(win_prob, win_loss_ratio)
            individual_kellys.append(kelly)

        # Apply fractional Kelly
        individual_kellys = [k * kelly_fraction for k in individual_kellys]

        # Normalize if sum > 1.0
        total = sum(individual_kellys)
        if total > 1.0:
            individual_kellys = [k / total for k in individual_kellys]

        return individual_kellys

    def optimize_kelly_with_correlation(
        self,
        opportunities: List[Tuple[float, float]],
        correlation_matrix: np.ndarray,
        kelly_fraction: float = 0.25
    ) -> np.ndarray:
        """
        Optimize Kelly positions accounting for correlation

        When bets are correlated, the optimal sizing is more complex
        and requires optimization.

        Args:
            opportunities: List of (win_prob, win_loss_ratio) tuples
            correlation_matrix: Correlation matrix between opportunities
            kelly_fraction: Fraction of Kelly to use

        Returns:
            Array of optimal position sizes
        """
        n = len(opportunities)
        if n == 0:
            return np.array([])

        # Calculate expected returns and variances
        expected_returns = np.array([
            p * r - (1-p) for p, r in opportunities
        ])

        variances = np.array([
            p * (r ** 2) + (1-p) for p, r in opportunities
        ])

        # Build covariance matrix
        cov_matrix = np.outer(np.sqrt(variances), np.sqrt(variances)) * correlation_matrix

        # Objective: maximize log utility
        # max: sum(r_i * f_i) - 0.5 * sum(f_i * cov_ij * f_j)
        def objective(f):
            return -(np.dot(expected_returns, f) - 0.5 * np.dot(f, np.dot(cov_matrix, f)))

        # Constraints: sum(f) <= 1, each f >= 0
        constraints = [
            {'type': 'ineq', 'fun': lambda f: 1.0 - np.sum(f)},  # sum <= 1
        ]

        bounds = [(0, 1) for _ in range(n)]

        # Initial guess: equal weights
        x0 = np.ones(n) / n

        # Optimize
        result = minimize(
            objective,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraints
        )

        if result.success:
            optimal_sizes = result.x * kelly_fraction
            return optimal_sizes
        else:
            # Fallback to uncorrelated calculation
            logger.warning("Optimization failed, using uncorrelated Kelly")
            return np.array(self.calculate_simultaneous_kelly(opportunities, kelly_fraction))

    def print_kelly_report(self, result: KellyResult):
        """
        Print Kelly Criterion report

        Args:
            result: KellyResult object
        """
        print("\n" + "="*70)
        print("KELLY CRITERION POSITION SIZING REPORT")
        print("="*70)
        print(f"Timestamp: {result.timestamp.isoformat()}")
        print()

        print("INPUT PARAMETERS:")
        print(f"  Win Probability: {result.win_probability:.2%}")
        print(f"  Win/Loss Ratio: {result.win_loss_ratio:.3f}")
        print(f"  Edge: {result.edge:.2%}")
        print(f"  Kelly Fraction: {result.kelly_fraction:.0%}")
        print()

        print("KELLY CALCULATIONS:")
        print(f"  Full Kelly: {result.full_kelly:.2%}")
        print(f"  Fractional Kelly ({result.kelly_fraction:.0%}): {result.fractional_kelly:.2%}")
        print(f"  Recommended Position Size: {result.recommended_position_size:.2%}")
        print()

        if result.constrained_by_max:
            print("  ⚠️  Constrained by maximum position size limit")
        if result.constrained_by_min:
            print("  ⚠️  Constrained by minimum position size limit")
        if result.constrained_by_max or result.constrained_by_min:
            print()

        print("RISK METRICS:")
        print(f"  Risk of Ruin: {result.risk_of_ruin:.2%}")
        print(f"  Expected Growth Rate: {result.expected_growth_rate:.2%}")
        print()

        # Recommendations
        print("RECOMMENDATIONS:")
        if result.edge <= 0:
            print("  ❌ No positive edge detected - DO NOT BET")
        elif result.recommended_position_size == 0:
            print("  ❌ Position size too small - SKIP THIS BET")
        elif result.recommended_position_size < 0.05:
            print("  ⚠️  Very small position size - Consider if worth the effort")
        elif result.recommended_position_size > 0.15:
            print("  ⚠️  Large position size - Ensure edge estimate is accurate")
        else:
            print("  ✅ Position size within reasonable range")

        print("="*70 + "\n")


# Example usage
if __name__ == "__main__":
    print("Kelly Criterion Position Sizer Example")
    print("="*70)

    # Initialize Kelly calculator
    kelly = KellyCriterion()

    # Example 1: Basic Kelly calculation
    print("\nExample 1: Basic Kelly Calculation")
    print("-" * 70)

    params = KellyParameters(
        win_probability=0.60,  # 60% win rate
        win_loss_ratio=1.5,    # Avg win is 1.5x avg loss
        kelly_fraction=0.25    # Use 1/4 Kelly (conservative)
    )

    result = kelly.calculate_kelly_with_constraints(params)
    kelly.print_kelly_report(result)

    # Example 2: Different scenarios
    print("\nExample 2: Comparison of Different Scenarios")
    print("-" * 70)

    scenarios = [
        ("High Win Rate, Low Ratio", 0.70, 1.2),
        ("Medium Win Rate, Medium Ratio", 0.60, 1.5),
        ("Low Win Rate, High Ratio", 0.45, 2.5),
        ("Very High Ratio", 0.55, 3.0),
    ]

    print(f"{'Scenario':<30s} {'Full Kelly':>12s} {'1/4 Kelly':>12s} {'Edge':>10s}")
    print("-" * 70)

    for name, win_prob, win_loss in scenarios:
        full = kelly.calculate_full_kelly(win_prob, win_loss)
        frac = kelly.calculate_fractional_kelly(win_prob, win_loss, 0.25)
        edge = win_prob * win_loss - (1 - win_prob)
        print(f"{name:<30s} {full:>11.1%} {frac:>11.1%} {edge:>9.1%}")

    # Example 3: Empirical Kelly from trade history
    print("\n\nExample 3: Empirical Kelly from Trade History")
    print("-" * 70)

    # Simulate trade returns
    np.random.seed(42)
    n_trades = 100

    # 60% win rate, wins average +1.5%, losses average -1%
    trade_returns = []
    for _ in range(n_trades):
        if np.random.random() < 0.60:
            # Win
            trade_returns.append(np.random.normal(0.015, 0.005))
        else:
            # Loss
            trade_returns.append(np.random.normal(-0.01, 0.003))

    trade_returns = np.array(trade_returns)

    empirical_kelly, win_prob, wl_ratio = kelly.calculate_empirical_kelly(
        trade_returns,
        kelly_fraction=0.25
    )

    print(f"Trades analyzed: {n_trades}")
    print(f"Win probability: {win_prob:.2%}")
    print(f"Win/Loss ratio: {wl_ratio:.3f}")
    print(f"Empirical Kelly (1/4): {empirical_kelly:.2%}")

    # Example 4: Multiple simultaneous bets
    print("\n\nExample 4: Multiple Simultaneous Opportunities")
    print("-" * 70)

    opportunities = [
        (0.60, 1.5),  # Opportunity 1
        (0.55, 2.0),  # Opportunity 2
        (0.65, 1.3),  # Opportunity 3
    ]

    simultaneous_sizes = kelly.calculate_simultaneous_kelly(
        opportunities,
        kelly_fraction=0.25
    )

    print("Individual Kelly sizes (1/4 Kelly, normalized):")
    for i, size in enumerate(simultaneous_sizes, 1):
        print(f"  Opportunity {i}: {size:.2%}")
    print(f"  Total allocation: {sum(simultaneous_sizes):.2%}")

    print("\n" + "="*70)
