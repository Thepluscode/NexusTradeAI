"""
Portfolio Construction Optimizer
=================================
Institutional-grade portfolio optimization using multiple methodologies.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Mean-Variance Optimization (Markowitz)
- Risk Parity optimization
- Maximum Sharpe ratio
- Minimum volatility
- Maximum diversification
- Black-Litterman model
- Efficient frontier generation
- Custom constraints (position limits, sector, turnover)
- Rebalancing optimization
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from scipy.optimize import minimize, LinearConstraint, Bounds
from scipy import linalg
import logging

logger = logging.getLogger(__name__)


class OptimizationMethod(Enum):
    """Portfolio optimization methods"""
    MIN_VARIANCE = "min_variance"
    MAX_SHARPE = "max_sharpe"
    RISK_PARITY = "risk_parity"
    MAX_DIVERSIFICATION = "max_diversification"
    BLACK_LITTERMAN = "black_litterman"
    EQUAL_WEIGHT = "equal_weight"
    INVERSE_VOLATILITY = "inverse_volatility"
    HIERARCHICAL_RISK_PARITY = "hierarchical_risk_parity"


@dataclass
class OptimizationConstraints:
    """Portfolio optimization constraints"""
    # Weight constraints
    long_only: bool = True
    allow_short: bool = False
    max_weight: float = 0.20  # Max 20% per position
    min_weight: float = 0.01  # Min 1% per position

    # Total constraints
    total_weight: float = 1.0  # Fully invested
    max_leverage: float = 1.0  # No leverage

    # Sector/group constraints
    sector_limits: Dict[str, Tuple[float, float]] = field(default_factory=dict)  # {sector: (min, max)}

    # Turnover constraint (for rebalancing)
    max_turnover: Optional[float] = None  # Max turnover from current weights

    # Target constraints
    target_return: Optional[float] = None  # Minimum target return
    target_volatility: Optional[float] = None  # Maximum target volatility

    # Risk constraints
    max_individual_var: Optional[float] = None  # Max VaR per position
    max_correlation: Optional[float] = None  # Max correlation with benchmark


@dataclass
class OptimizationResult:
    """Portfolio optimization result"""
    timestamp: datetime = field(default_factory=datetime.now)

    # Optimized weights
    weights: Dict[str, float] = field(default_factory=dict)

    # Portfolio metrics
    expected_return: float = 0.0
    expected_volatility: float = 0.0
    sharpe_ratio: float = 0.0

    # Risk metrics
    portfolio_var_95: float = 0.0
    diversification_ratio: float = 0.0
    effective_n: float = 0.0

    # Optimization metadata
    method: OptimizationMethod = OptimizationMethod.EQUAL_WEIGHT
    success: bool = False
    message: str = ""
    iterations: int = 0

    # Constraint satisfaction
    constraints_satisfied: bool = True
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'weights': self.weights,
            'expected_return': self.expected_return,
            'expected_volatility': self.expected_volatility,
            'sharpe_ratio': self.sharpe_ratio,
            'portfolio_var_95': self.portfolio_var_95,
            'diversification_ratio': self.diversification_ratio,
            'effective_n': self.effective_n,
            'method': self.method.value,
            'success': self.success,
            'message': self.message,
            'iterations': self.iterations,
            'constraints_satisfied': self.constraints_satisfied,
            'warnings': self.warnings
        }


class PortfolioOptimizer:
    """
    Comprehensive portfolio optimization framework
    """

    def __init__(self, risk_free_rate: float = 0.02):
        """
        Initialize portfolio optimizer

        Args:
            risk_free_rate: Annual risk-free rate (default 2%)
        """
        self.risk_free_rate = risk_free_rate
        logger.info("Initialized PortfolioOptimizer")

    def calculate_portfolio_metrics(
        self,
        weights: np.ndarray,
        expected_returns: np.ndarray,
        cov_matrix: np.ndarray
    ) -> Tuple[float, float, float]:
        """
        Calculate portfolio return, volatility, and Sharpe ratio

        Args:
            weights: Portfolio weights
            expected_returns: Expected returns vector
            cov_matrix: Covariance matrix

        Returns:
            (expected_return, volatility, sharpe_ratio)
        """
        # Expected return
        portfolio_return = np.dot(weights, expected_returns)

        # Volatility
        portfolio_variance = np.dot(weights, np.dot(cov_matrix, weights))
        portfolio_vol = np.sqrt(portfolio_variance)

        # Sharpe ratio
        sharpe = (portfolio_return - self.risk_free_rate) / portfolio_vol if portfolio_vol > 0 else 0.0

        return float(portfolio_return), float(portfolio_vol), float(sharpe)

    def optimize_minimum_variance(
        self,
        cov_matrix: np.ndarray,
        constraints: OptimizationConstraints
    ) -> np.ndarray:
        """
        Find minimum variance portfolio

        Args:
            cov_matrix: Covariance matrix
            constraints: Optimization constraints

        Returns:
            Optimal weights
        """
        n_assets = len(cov_matrix)

        # Objective: minimize portfolio variance
        def objective(weights):
            return np.dot(weights, np.dot(cov_matrix, weights))

        # Initial guess (equal weight)
        x0 = np.ones(n_assets) / n_assets

        # Bounds
        bounds = Bounds(
            lb=np.full(n_assets, 0.0 if constraints.long_only else -constraints.max_leverage),
            ub=np.full(n_assets, constraints.max_weight)
        )

        # Constraint: weights sum to 1
        constraint = LinearConstraint(
            A=np.ones((1, n_assets)),
            lb=constraints.total_weight,
            ub=constraints.total_weight
        )

        # Optimize
        result = minimize(
            objective,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraint,
            options={'maxiter': 1000}
        )

        return result.x if result.success else x0

    def optimize_maximum_sharpe(
        self,
        expected_returns: np.ndarray,
        cov_matrix: np.ndarray,
        constraints: OptimizationConstraints
    ) -> np.ndarray:
        """
        Find maximum Sharpe ratio portfolio

        Args:
            expected_returns: Expected returns vector
            cov_matrix: Covariance matrix
            constraints: Optimization constraints

        Returns:
            Optimal weights
        """
        n_assets = len(expected_returns)

        # Objective: maximize Sharpe ratio
        # Equivalent to minimize -Sharpe
        def negative_sharpe(weights):
            portfolio_return = np.dot(weights, expected_returns)
            portfolio_vol = np.sqrt(np.dot(weights, np.dot(cov_matrix, weights)))

            if portfolio_vol == 0:
                return 0.0

            sharpe = (portfolio_return - self.risk_free_rate) / portfolio_vol
            return -sharpe  # Minimize negative = maximize positive

        # Initial guess
        x0 = np.ones(n_assets) / n_assets

        # Bounds
        bounds = Bounds(
            lb=np.full(n_assets, 0.0 if constraints.long_only else -constraints.max_leverage),
            ub=np.full(n_assets, constraints.max_weight)
        )

        # Constraint: weights sum to 1
        constraint = LinearConstraint(
            A=np.ones((1, n_assets)),
            lb=constraints.total_weight,
            ub=constraints.total_weight
        )

        # Optimize
        result = minimize(
            negative_sharpe,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraint,
            options={'maxiter': 1000}
        )

        return result.x if result.success else x0

    def optimize_risk_parity(
        self,
        cov_matrix: np.ndarray,
        constraints: OptimizationConstraints
    ) -> np.ndarray:
        """
        Find risk parity portfolio (equal risk contribution)

        Args:
            cov_matrix: Covariance matrix
            constraints: Optimization constraints

        Returns:
            Optimal weights
        """
        n_assets = len(cov_matrix)

        # Risk parity: minimize sum of squared differences in risk contributions
        def risk_parity_objective(weights):
            # Portfolio volatility
            portfolio_var = np.dot(weights, np.dot(cov_matrix, weights))
            portfolio_vol = np.sqrt(portfolio_var)

            if portfolio_vol == 0:
                return 1e10

            # Marginal risk contributions
            marginal_contrib = np.dot(cov_matrix, weights) / portfolio_vol

            # Risk contributions
            risk_contrib = weights * marginal_contrib

            # Target: equal risk (1/n each)
            target_risk = portfolio_vol / n_assets

            # Minimize squared deviations from target
            return np.sum((risk_contrib - target_risk) ** 2)

        # Initial guess (inverse volatility)
        volatilities = np.sqrt(np.diag(cov_matrix))
        inv_vol = 1.0 / volatilities
        x0 = inv_vol / np.sum(inv_vol)

        # Bounds
        bounds = Bounds(
            lb=np.full(n_assets, constraints.min_weight),
            ub=np.full(n_assets, constraints.max_weight)
        )

        # Constraint: weights sum to 1
        constraint = LinearConstraint(
            A=np.ones((1, n_assets)),
            lb=1.0,
            ub=1.0
        )

        # Optimize
        result = minimize(
            risk_parity_objective,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraint,
            options={'maxiter': 1000}
        )

        return result.x if result.success else x0

    def optimize_maximum_diversification(
        self,
        cov_matrix: np.ndarray,
        constraints: OptimizationConstraints
    ) -> np.ndarray:
        """
        Find maximum diversification portfolio

        Diversification ratio = (weighted avg volatility) / (portfolio volatility)

        Args:
            cov_matrix: Covariance matrix
            constraints: Optimization constraints

        Returns:
            Optimal weights
        """
        n_assets = len(cov_matrix)
        volatilities = np.sqrt(np.diag(cov_matrix))

        # Objective: maximize diversification ratio
        # Equivalent to minimize negative ratio
        def negative_diversification(weights):
            weighted_vol = np.dot(weights, volatilities)
            portfolio_vol = np.sqrt(np.dot(weights, np.dot(cov_matrix, weights)))

            if portfolio_vol == 0:
                return 0.0

            div_ratio = weighted_vol / portfolio_vol
            return -div_ratio

        # Initial guess
        x0 = np.ones(n_assets) / n_assets

        # Bounds
        bounds = Bounds(
            lb=np.full(n_assets, 0.0 if constraints.long_only else -constraints.max_leverage),
            ub=np.full(n_assets, constraints.max_weight)
        )

        # Constraint: weights sum to 1
        constraint = LinearConstraint(
            A=np.ones((1, n_assets)),
            lb=1.0,
            ub=1.0
        )

        # Optimize
        result = minimize(
            negative_diversification,
            x0,
            method='SLSQP',
            bounds=bounds,
            constraints=constraint,
            options={'maxiter': 1000}
        )

        return result.x if result.success else x0

    def optimize_black_litterman(
        self,
        market_weights: np.ndarray,
        cov_matrix: np.ndarray,
        views: List[Tuple[int, float]],  # [(asset_idx, expected_return)]
        view_confidences: List[float],
        tau: float = 0.025,
        risk_aversion: float = 2.5
    ) -> np.ndarray:
        """
        Black-Litterman model for portfolio optimization

        Combines market equilibrium with investor views

        Args:
            market_weights: Market cap weights (equilibrium)
            cov_matrix: Covariance matrix
            views: List of views [(asset_idx, expected_return)]
            view_confidences: Confidence in each view (0-1)
            tau: Uncertainty in prior (default 0.025)
            risk_aversion: Risk aversion parameter (default 2.5)

        Returns:
            Optimal weights
        """
        n_assets = len(market_weights)

        # Step 1: Implied equilibrium returns (reverse optimization)
        # Π = λ × Σ × w_market
        implied_returns = risk_aversion * np.dot(cov_matrix, market_weights)

        # Step 2: Build view matrices
        n_views = len(views)
        P = np.zeros((n_views, n_assets))  # Pick matrix
        Q = np.zeros(n_views)  # View returns

        for i, (asset_idx, view_return) in enumerate(views):
            P[i, asset_idx] = 1.0
            Q[i] = view_return

        # View uncertainty (Ω)
        # Diagonal matrix with uncertainties proportional to view confidence
        omega = np.diag([(1 - conf) * 0.01 for conf in view_confidences])

        # Step 3: Combine prior and views (Bayesian update)
        # Posterior estimate of returns
        # E[R] = [(τΣ)^-1 + P'Ω^-1P]^-1 × [(τΣ)^-1·Π + P'Ω^-1·Q]

        tau_sigma_inv = np.linalg.inv(tau * cov_matrix)
        omega_inv = np.linalg.inv(omega)

        # Combined precision
        combined_precision = tau_sigma_inv + np.dot(P.T, np.dot(omega_inv, P))
        combined_cov = np.linalg.inv(combined_precision)

        # Combined mean
        prior_term = np.dot(tau_sigma_inv, implied_returns)
        view_term = np.dot(P.T, np.dot(omega_inv, Q))
        posterior_returns = np.dot(combined_cov, prior_term + view_term)

        # Step 4: Optimize portfolio with posterior returns
        # w = (1/λ) × Σ^-1 × E[R]
        cov_inv = np.linalg.inv(cov_matrix)
        weights = np.dot(cov_inv, posterior_returns) / risk_aversion

        # Normalize to sum to 1
        weights = weights / np.sum(weights)

        # Ensure non-negative (long-only)
        weights = np.maximum(weights, 0)
        weights = weights / np.sum(weights)

        return weights

    def optimize_inverse_volatility(
        self,
        cov_matrix: np.ndarray,
        constraints: OptimizationConstraints
    ) -> np.ndarray:
        """
        Inverse volatility weighting

        Args:
            cov_matrix: Covariance matrix
            constraints: Optimization constraints

        Returns:
            Optimal weights
        """
        volatilities = np.sqrt(np.diag(cov_matrix))
        inv_vol = 1.0 / volatilities
        weights = inv_vol / np.sum(inv_vol)

        # Apply constraints
        weights = np.clip(weights, constraints.min_weight, constraints.max_weight)
        weights = weights / np.sum(weights)

        return weights

    def optimize_equal_weight(
        self,
        n_assets: int,
        constraints: OptimizationConstraints
    ) -> np.ndarray:
        """
        Equal weight portfolio

        Args:
            n_assets: Number of assets
            constraints: Optimization constraints

        Returns:
            Equal weights
        """
        weights = np.ones(n_assets) / n_assets

        # Apply max weight constraint if needed
        if 1.0 / n_assets > constraints.max_weight:
            weights = np.full(n_assets, constraints.max_weight)
            weights = weights / np.sum(weights)

        return weights

    def generate_efficient_frontier(
        self,
        expected_returns: np.ndarray,
        cov_matrix: np.ndarray,
        constraints: OptimizationConstraints,
        n_points: int = 50
    ) -> pd.DataFrame:
        """
        Generate efficient frontier

        Args:
            expected_returns: Expected returns vector
            cov_matrix: Covariance matrix
            constraints: Optimization constraints
            n_points: Number of points on frontier

        Returns:
            DataFrame with frontier points
        """
        n_assets = len(expected_returns)

        # Min and max returns
        min_ret = np.min(expected_returns)
        max_ret = np.max(expected_returns)

        target_returns = np.linspace(min_ret, max_ret, n_points)

        frontier_points = []

        for target_ret in target_returns:
            # Optimize for minimum variance given target return
            def objective(weights):
                return np.dot(weights, np.dot(cov_matrix, weights))

            # Constraints
            cons = [
                {'type': 'eq', 'fun': lambda w: np.sum(w) - 1.0},  # Weights sum to 1
                {'type': 'eq', 'fun': lambda w: np.dot(w, expected_returns) - target_ret}  # Target return
            ]

            # Bounds
            bounds = [(0.0 if constraints.long_only else -constraints.max_leverage, constraints.max_weight)
                     for _ in range(n_assets)]

            # Initial guess
            x0 = np.ones(n_assets) / n_assets

            # Optimize
            result = minimize(
                objective,
                x0,
                method='SLSQP',
                bounds=bounds,
                constraints=cons,
                options={'maxiter': 1000}
            )

            if result.success:
                weights = result.x
                ret, vol, sharpe = self.calculate_portfolio_metrics(weights, expected_returns, cov_matrix)

                frontier_points.append({
                    'return': ret,
                    'volatility': vol,
                    'sharpe': sharpe
                })

        return pd.DataFrame(frontier_points)

    def optimize_portfolio(
        self,
        symbols: List[str],
        returns: pd.DataFrame,
        method: OptimizationMethod,
        constraints: Optional[OptimizationConstraints] = None,
        current_weights: Optional[Dict[str, float]] = None,
        views: Optional[List[Tuple[str, float]]] = None,
        view_confidences: Optional[List[float]] = None
    ) -> OptimizationResult:
        """
        Optimize portfolio using specified method

        Args:
            symbols: List of asset symbols
            returns: Historical returns DataFrame
            method: Optimization method
            constraints: Optimization constraints
            current_weights: Current portfolio weights (for rebalancing)
            views: Views for Black-Litterman [(symbol, expected_return)]
            view_confidences: Confidence in each view (0-1)

        Returns:
            OptimizationResult object
        """
        result = OptimizationResult(method=method)

        if constraints is None:
            constraints = OptimizationConstraints()

        # Filter symbols present in returns
        valid_symbols = [s for s in symbols if s in returns.columns]
        if not valid_symbols:
            result.success = False
            result.message = "No valid symbols in returns data"
            return result

        n_assets = len(valid_symbols)

        # Calculate expected returns and covariance
        expected_returns = returns[valid_symbols].mean().values * 252  # Annualized
        cov_matrix = returns[valid_symbols].cov().values * 252  # Annualized

        # Optimize based on method
        try:
            if method == OptimizationMethod.MIN_VARIANCE:
                optimal_weights = self.optimize_minimum_variance(cov_matrix, constraints)

            elif method == OptimizationMethod.MAX_SHARPE:
                optimal_weights = self.optimize_maximum_sharpe(expected_returns, cov_matrix, constraints)

            elif method == OptimizationMethod.RISK_PARITY:
                optimal_weights = self.optimize_risk_parity(cov_matrix, constraints)

            elif method == OptimizationMethod.MAX_DIVERSIFICATION:
                optimal_weights = self.optimize_maximum_diversification(cov_matrix, constraints)

            elif method == OptimizationMethod.BLACK_LITTERMAN:
                if views is None or view_confidences is None:
                    result.success = False
                    result.message = "Black-Litterman requires views and confidences"
                    return result

                # Convert views to indices
                indexed_views = []
                for symbol, view_return in views:
                    if symbol in valid_symbols:
                        idx = valid_symbols.index(symbol)
                        indexed_views.append((idx, view_return))

                # Market weights (equal if not provided)
                market_weights = np.ones(n_assets) / n_assets

                optimal_weights = self.optimize_black_litterman(
                    market_weights, cov_matrix, indexed_views, view_confidences
                )

            elif method == OptimizationMethod.INVERSE_VOLATILITY:
                optimal_weights = self.optimize_inverse_volatility(cov_matrix, constraints)

            elif method == OptimizationMethod.EQUAL_WEIGHT:
                optimal_weights = self.optimize_equal_weight(n_assets, constraints)

            else:
                result.success = False
                result.message = f"Unknown optimization method: {method}"
                return result

            # Build weights dictionary
            result.weights = {valid_symbols[i]: float(optimal_weights[i]) for i in range(n_assets)}

            # Calculate portfolio metrics
            ret, vol, sharpe = self.calculate_portfolio_metrics(optimal_weights, expected_returns, cov_matrix)
            result.expected_return = ret
            result.expected_volatility = vol
            result.sharpe_ratio = sharpe

            # Calculate diversification metrics
            volatilities = np.sqrt(np.diag(cov_matrix))
            weighted_vol = np.dot(optimal_weights, volatilities)
            result.diversification_ratio = weighted_vol / vol if vol > 0 else 0.0

            # Effective N
            corr_matrix = cov_matrix / np.outer(volatilities, volatilities)
            avg_corr = (np.sum(corr_matrix) - n_assets) / (n_assets * (n_assets - 1))
            result.effective_n = n_assets / (1 + (n_assets - 1) * avg_corr)

            # VaR (95%)
            portfolio_returns = np.dot(returns[valid_symbols].values, optimal_weights)
            result.portfolio_var_95 = np.percentile(portfolio_returns, 5)

            result.success = True
            result.message = "Optimization successful"

        except Exception as e:
            result.success = False
            result.message = f"Optimization failed: {str(e)}"
            logger.error(f"Optimization error: {e}")

        return result

    def print_optimization_report(self, result: OptimizationResult, top_n: int = 10):
        """
        Print optimization report

        Args:
            result: Optimization result
            top_n: Number of top positions to show
        """
        print("\n" + "="*80)
        print("PORTFOLIO OPTIMIZATION REPORT")
        print("="*80)
        print(f"Method: {result.method.value}")
        print(f"Timestamp: {result.timestamp.isoformat()}")
        print(f"Status: {'✓ Success' if result.success else '✗ Failed'}")
        if not result.success:
            print(f"Message: {result.message}")
        print()

        if result.success:
            print("PORTFOLIO METRICS:")
            print(f"  Expected Return: {result.expected_return:.2%}")
            print(f"  Expected Volatility: {result.expected_volatility:.2%}")
            print(f"  Sharpe Ratio: {result.sharpe_ratio:.3f}")
            print(f"  VaR (95%): {result.portfolio_var_95:.2%}")
            print(f"  Diversification Ratio: {result.diversification_ratio:.2f}")
            print(f"  Effective N: {result.effective_n:.2f}")
            print()

            print(f"TOP {top_n} POSITIONS:")
            sorted_weights = sorted(result.weights.items(), key=lambda x: x[1], reverse=True)

            print(f"{'Symbol':<10} {'Weight':<10}")
            print("-" * 80)
            for symbol, weight in sorted_weights[:top_n]:
                print(f"{symbol:<10} {weight:>9.2%}")

            if result.warnings:
                print()
                print("⚠️  WARNINGS:")
                for warning in result.warnings:
                    print(f"  • {warning}")

        print("="*80 + "\n")


# Example usage
if __name__ == "__main__":
    print("Portfolio Construction Optimizer Example")
    print("="*80)

    # Generate sample data
    np.random.seed(42)
    n_days = 252
    symbols = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'JPM', 'BAC', 'XOM', 'PFE', 'JNJ']

    # Create returns data with some correlation
    base_returns = np.random.normal(0.0005, 0.015, n_days)

    returns_data = {}
    for i, symbol in enumerate(symbols):
        # Mix of common factor and idiosyncratic returns
        returns_data[symbol] = 0.5 * base_returns + 0.5 * np.random.normal(0.0005, 0.015, n_days)

    returns = pd.DataFrame(returns_data)

    # Initialize optimizer
    optimizer = PortfolioOptimizer(risk_free_rate=0.02)

    # Test different optimization methods
    print("\n1. MINIMUM VARIANCE")
    print("-" * 80)
    min_var_result = optimizer.optimize_portfolio(
        symbols=symbols,
        returns=returns,
        method=OptimizationMethod.MIN_VARIANCE
    )
    optimizer.print_optimization_report(min_var_result)

    print("\n2. MAXIMUM SHARPE RATIO")
    print("-" * 80)
    max_sharpe_result = optimizer.optimize_portfolio(
        symbols=symbols,
        returns=returns,
        method=OptimizationMethod.MAX_SHARPE
    )
    optimizer.print_optimization_report(max_sharpe_result)

    print("\n3. RISK PARITY")
    print("-" * 80)
    risk_parity_result = optimizer.optimize_portfolio(
        symbols=symbols,
        returns=returns,
        method=OptimizationMethod.RISK_PARITY
    )
    optimizer.print_optimization_report(risk_parity_result)

    print("\n4. MAXIMUM DIVERSIFICATION")
    print("-" * 80)
    max_div_result = optimizer.optimize_portfolio(
        symbols=symbols,
        returns=returns,
        method=OptimizationMethod.MAX_DIVERSIFICATION
    )
    optimizer.print_optimization_report(max_div_result)

    print("\n5. BLACK-LITTERMAN (with views)")
    print("-" * 80)
    # Views: AAPL will return 15%, TSLA will return 10%
    views = [('AAPL', 0.15), ('TSLA', 0.10)]
    confidences = [0.8, 0.6]  # 80% confident in AAPL, 60% in TSLA

    bl_result = optimizer.optimize_portfolio(
        symbols=symbols,
        returns=returns,
        method=OptimizationMethod.BLACK_LITTERMAN,
        views=views,
        view_confidences=confidences
    )
    optimizer.print_optimization_report(bl_result)

    print("\n6. EFFICIENT FRONTIER")
    print("-" * 80)
    expected_returns = returns[symbols].mean().values * 252
    cov_matrix = returns[symbols].cov().values * 252

    frontier = optimizer.generate_efficient_frontier(
        expected_returns,
        cov_matrix,
        OptimizationConstraints(),
        n_points=20
    )

    print("Efficient Frontier Points:")
    print(frontier.to_string(index=False))

    print("\n" + "="*80)
