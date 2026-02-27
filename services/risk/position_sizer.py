"""
Position Sizing Framework
========================
Institutional-grade position sizing system integrating multiple methodologies.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Kelly Criterion integration
- Volatility-based sizing
- Fixed fractional sizing
- Equal weight allocation
- Risk parity allocation
- Target volatility sizing
- Portfolio-level constraints
- Correlation adjustments
- Dynamic risk adjustments
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

from kelly_criterion import KellyCriterion, KellyParameters

logger = logging.getLogger(__name__)


class SizingMethod(Enum):
    """Position sizing methods"""
    KELLY = "kelly"
    FIXED_FRACTIONAL = "fixed_fractional"
    VOLATILITY_BASED = "volatility_based"
    EQUAL_WEIGHT = "equal_weight"
    RISK_PARITY = "risk_parity"
    TARGET_VOLATILITY = "target_volatility"
    HYBRID = "hybrid"


@dataclass
class PositionConstraints:
    """Portfolio-level position constraints"""
    max_position_size: float = 0.10  # Max 10% per position
    min_position_size: float = 0.01  # Min 1% per position
    max_total_exposure: float = 1.0  # Max 100% total exposure
    max_leverage: float = 1.0  # No leverage by default
    max_concentration: float = 0.25  # Max 25% in single asset class
    max_sector_exposure: Dict[str, float] = field(default_factory=dict)
    position_size_step: float = 0.001  # Minimum step size (0.1%)


@dataclass
class SizingParameters:
    """Parameters for position sizing"""
    method: SizingMethod = SizingMethod.KELLY
    kelly_fraction: float = 0.25  # Fractional Kelly (conservative)
    fixed_fraction: float = 0.02  # Fixed fraction (2% per trade)
    target_volatility: float = 0.15  # Target 15% annual volatility
    volatility_lookback: int = 60  # Days for volatility calculation
    correlation_adjustment: bool = True
    drawdown_adjustment: bool = True
    volatility_regime_adjustment: bool = True
    constraints: PositionConstraints = field(default_factory=PositionConstraints)


@dataclass
class PositionSize:
    """Position size recommendation"""
    symbol: str
    recommended_size: float  # As fraction of portfolio
    recommended_shares: int  # Number of shares
    recommended_notional: float  # Dollar amount
    method_used: SizingMethod
    confidence: float  # Confidence in recommendation (0-1)
    risk_contribution: float  # Expected risk contribution to portfolio
    adjusted_for: List[str] = field(default_factory=list)  # Adjustments applied

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'symbol': self.symbol,
            'recommended_size': self.recommended_size,
            'recommended_shares': self.recommended_shares,
            'recommended_notional': self.recommended_notional,
            'method_used': self.method_used.value,
            'confidence': self.confidence,
            'risk_contribution': self.risk_contribution,
            'adjusted_for': self.adjusted_for
        }


@dataclass
class PortfolioAllocation:
    """Complete portfolio allocation"""
    timestamp: datetime = field(default_factory=datetime.now)
    positions: Dict[str, PositionSize] = field(default_factory=dict)
    total_exposure: float = 0.0
    expected_volatility: float = 0.0
    diversification_ratio: float = 0.0
    leverage: float = 0.0
    constraints_satisfied: bool = True
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'positions': {s: p.to_dict() for s, p in self.positions.items()},
            'total_exposure': self.total_exposure,
            'expected_volatility': self.expected_volatility,
            'diversification_ratio': self.diversification_ratio,
            'leverage': self.leverage,
            'constraints_satisfied': self.constraints_satisfied,
            'warnings': self.warnings
        }


class PositionSizer:
    """
    Comprehensive position sizing framework
    """

    def __init__(self, parameters: Optional[SizingParameters] = None):
        """
        Initialize position sizer

        Args:
            parameters: Sizing parameters (uses defaults if None)
        """
        self.params = parameters or SizingParameters()
        self.kelly_calculator = KellyCriterion()
        logger.info(f"Initialized PositionSizer with method: {self.params.method.value}")

    def calculate_kelly_size(
        self,
        symbol: str,
        win_probability: float,
        win_loss_ratio: float,
        portfolio_value: float,
        current_price: float
    ) -> PositionSize:
        """
        Calculate position size using Kelly Criterion

        Args:
            symbol: Asset symbol
            win_probability: Historical win probability
            win_loss_ratio: Average win / average loss
            portfolio_value: Total portfolio value
            current_price: Current asset price

        Returns:
            PositionSize object
        """
        kelly_params = KellyParameters(
            win_probability=win_probability,
            win_loss_ratio=win_loss_ratio,
            kelly_fraction=self.params.kelly_fraction,
            max_position_size=self.params.constraints.max_position_size
        )

        kelly_result = self.kelly_calculator.calculate_kelly_with_constraints(kelly_params)

        # Calculate share count
        position_value = portfolio_value * kelly_result.recommended_position_size
        shares = int(position_value / current_price)
        actual_notional = shares * current_price
        actual_size = actual_notional / portfolio_value

        return PositionSize(
            symbol=symbol,
            recommended_size=actual_size,
            recommended_shares=shares,
            recommended_notional=actual_notional,
            method_used=SizingMethod.KELLY,
            confidence=0.8,  # High confidence in Kelly
            risk_contribution=0.0  # Calculated later with correlation
        )

    def calculate_fixed_fractional_size(
        self,
        symbol: str,
        portfolio_value: float,
        current_price: float
    ) -> PositionSize:
        """
        Calculate position size using fixed fractional method

        Args:
            symbol: Asset symbol
            portfolio_value: Total portfolio value
            current_price: Current asset price

        Returns:
            PositionSize object
        """
        # Apply constraints
        position_fraction = min(
            self.params.fixed_fraction,
            self.params.constraints.max_position_size
        )
        position_fraction = max(
            position_fraction,
            self.params.constraints.min_position_size
        )

        position_value = portfolio_value * position_fraction
        shares = int(position_value / current_price)
        actual_notional = shares * current_price
        actual_size = actual_notional / portfolio_value

        return PositionSize(
            symbol=symbol,
            recommended_size=actual_size,
            recommended_shares=shares,
            recommended_notional=actual_notional,
            method_used=SizingMethod.FIXED_FRACTIONAL,
            confidence=0.9,  # Very predictable
            risk_contribution=0.0
        )

    def calculate_volatility_based_size(
        self,
        symbol: str,
        returns: pd.Series,
        portfolio_value: float,
        current_price: float,
        target_risk: float = 0.01
    ) -> PositionSize:
        """
        Calculate position size based on volatility (inverse volatility weighting)

        Args:
            symbol: Asset symbol
            returns: Historical returns
            portfolio_value: Total portfolio value
            current_price: Current asset price
            target_risk: Target risk per position (1% default)

        Returns:
            PositionSize object
        """
        if len(returns) < 20:
            # Not enough data, use fixed fractional
            return self.calculate_fixed_fractional_size(symbol, portfolio_value, current_price)

        # Calculate volatility
        volatility = returns.std() * np.sqrt(252)

        if volatility == 0:
            volatility = 0.20  # Default 20% if zero volatility

        # Position size inversely proportional to volatility
        # Size = target_risk / volatility
        position_fraction = target_risk / volatility

        # Apply constraints
        position_fraction = min(position_fraction, self.params.constraints.max_position_size)
        position_fraction = max(position_fraction, self.params.constraints.min_position_size)

        position_value = portfolio_value * position_fraction
        shares = int(position_value / current_price)
        actual_notional = shares * current_price
        actual_size = actual_notional / portfolio_value

        return PositionSize(
            symbol=symbol,
            recommended_size=actual_size,
            recommended_shares=shares,
            recommended_notional=actual_notional,
            method_used=SizingMethod.VOLATILITY_BASED,
            confidence=0.75,
            risk_contribution=0.0,
            adjusted_for=['volatility']
        )

    def calculate_equal_weight_size(
        self,
        symbol: str,
        n_positions: int,
        portfolio_value: float,
        current_price: float
    ) -> PositionSize:
        """
        Calculate equal weight position size

        Args:
            symbol: Asset symbol
            n_positions: Number of positions in portfolio
            portfolio_value: Total portfolio value
            current_price: Current asset price

        Returns:
            PositionSize object
        """
        if n_positions == 0:
            n_positions = 1

        position_fraction = 1.0 / n_positions

        # Apply constraints
        position_fraction = min(position_fraction, self.params.constraints.max_position_size)
        position_fraction = max(position_fraction, self.params.constraints.min_position_size)

        position_value = portfolio_value * position_fraction
        shares = int(position_value / current_price)
        actual_notional = shares * current_price
        actual_size = actual_notional / portfolio_value

        return PositionSize(
            symbol=symbol,
            recommended_size=actual_size,
            recommended_shares=shares,
            recommended_notional=actual_notional,
            method_used=SizingMethod.EQUAL_WEIGHT,
            confidence=0.85,
            risk_contribution=0.0
        )

    def calculate_risk_parity_allocation(
        self,
        symbols: List[str],
        returns: pd.DataFrame,
        portfolio_value: float,
        current_prices: Dict[str, float]
    ) -> Dict[str, PositionSize]:
        """
        Calculate risk parity allocation (equal risk contribution)

        Args:
            symbols: List of asset symbols
            returns: Historical returns DataFrame
            portfolio_value: Total portfolio value
            current_prices: Current prices {symbol: price}

        Returns:
            Dictionary of {symbol: PositionSize}
        """
        if returns.empty or len(symbols) == 0:
            return {}

        # Calculate covariance matrix
        cov_matrix = returns[symbols].cov() * 252  # Annualized

        # Risk parity weights (inverse volatility, normalized)
        volatilities = np.sqrt(np.diag(cov_matrix))
        inv_vol = 1.0 / volatilities
        weights = inv_vol / np.sum(inv_vol)

        # Create position sizes
        positions = {}
        for i, symbol in enumerate(symbols):
            position_fraction = weights[i]

            # Apply constraints
            position_fraction = min(position_fraction, self.params.constraints.max_position_size)
            position_fraction = max(position_fraction, self.params.constraints.min_position_size)

            position_value = portfolio_value * position_fraction
            price = current_prices.get(symbol, 0)
            if price > 0:
                shares = int(position_value / price)
                actual_notional = shares * price
                actual_size = actual_notional / portfolio_value

                positions[symbol] = PositionSize(
                    symbol=symbol,
                    recommended_size=actual_size,
                    recommended_shares=shares,
                    recommended_notional=actual_notional,
                    method_used=SizingMethod.RISK_PARITY,
                    confidence=0.8,
                    risk_contribution=1.0 / len(symbols),  # Equal risk
                    adjusted_for=['risk_parity']
                )

        return positions

    def calculate_target_volatility_size(
        self,
        symbol: str,
        returns: pd.Series,
        portfolio_value: float,
        current_price: float
    ) -> PositionSize:
        """
        Calculate position size to achieve target portfolio volatility

        Args:
            symbol: Asset symbol
            returns: Historical returns
            portfolio_value: Total portfolio value
            current_price: Current asset price

        Returns:
            PositionSize object
        """
        if len(returns) < 20:
            return self.calculate_fixed_fractional_size(symbol, portfolio_value, current_price)

        # Calculate asset volatility
        asset_vol = returns.std() * np.sqrt(252)

        if asset_vol == 0:
            asset_vol = 0.20

        # Position size to achieve target volatility
        # target_vol = position_size × asset_vol
        # position_size = target_vol / asset_vol
        position_fraction = self.params.target_volatility / asset_vol

        # Apply constraints
        position_fraction = min(position_fraction, self.params.constraints.max_position_size)
        position_fraction = max(position_fraction, self.params.constraints.min_position_size)

        position_value = portfolio_value * position_fraction
        shares = int(position_value / current_price)
        actual_notional = shares * current_price
        actual_size = actual_notional / portfolio_value

        return PositionSize(
            symbol=symbol,
            recommended_size=actual_size,
            recommended_shares=shares,
            recommended_notional=actual_notional,
            method_used=SizingMethod.TARGET_VOLATILITY,
            confidence=0.75,
            risk_contribution=0.0,
            adjusted_for=['target_volatility']
        )

    def apply_correlation_adjustment(
        self,
        position_size: PositionSize,
        symbol: str,
        existing_positions: Dict[str, float],
        correlation_matrix: pd.DataFrame
    ) -> PositionSize:
        """
        Adjust position size based on correlation with existing positions

        Args:
            position_size: Initial position size
            symbol: New position symbol
            existing_positions: Existing positions {symbol: size}
            correlation_matrix: Correlation matrix

        Returns:
            Adjusted PositionSize
        """
        if not self.params.correlation_adjustment or correlation_matrix.empty:
            return position_size

        if symbol not in correlation_matrix.columns:
            return position_size

        # Calculate average correlation with existing positions
        correlations = []
        for existing_symbol, existing_size in existing_positions.items():
            if existing_symbol in correlation_matrix.columns and existing_symbol != symbol:
                corr = correlation_matrix.loc[symbol, existing_symbol]
                correlations.append(abs(corr) * existing_size)

        if not correlations:
            return position_size

        avg_weighted_corr = sum(correlations)

        # Reduce size if highly correlated with existing positions
        # Adjustment factor: 1 - (avg_corr × 0.5)
        # If avg_corr = 0.8, reduce by 40%
        adjustment_factor = 1.0 - (avg_weighted_corr * 0.5)
        adjustment_factor = max(0.5, min(1.0, adjustment_factor))  # Keep between 50-100%

        adjusted_size = position_size.recommended_size * adjustment_factor
        adjusted_shares = int(adjusted_size * position_size.recommended_notional / position_size.recommended_size)

        position_size.recommended_size = adjusted_size
        position_size.recommended_shares = adjusted_shares
        position_size.recommended_notional = adjusted_shares * (position_size.recommended_notional / position_size.recommended_shares) if position_size.recommended_shares > 0 else 0
        position_size.adjusted_for.append('correlation')

        return position_size

    def apply_drawdown_adjustment(
        self,
        position_size: PositionSize,
        current_drawdown: float,
        max_drawdown_threshold: float = 0.15
    ) -> PositionSize:
        """
        Reduce position size during drawdowns

        Args:
            position_size: Initial position size
            current_drawdown: Current portfolio drawdown (as positive fraction)
            max_drawdown_threshold: Drawdown threshold for scaling (15% default)

        Returns:
            Adjusted PositionSize
        """
        if not self.params.drawdown_adjustment:
            return position_size

        if current_drawdown <= 0:
            return position_size

        # Scale down positions linearly as drawdown increases
        # At max_drawdown_threshold, reduce to 50%
        # At 2× threshold, reduce to 25%
        drawdown_ratio = current_drawdown / max_drawdown_threshold
        adjustment_factor = 1.0 / (1.0 + drawdown_ratio)
        adjustment_factor = max(0.25, min(1.0, adjustment_factor))

        adjusted_size = position_size.recommended_size * adjustment_factor
        adjusted_shares = int(adjusted_size * position_size.recommended_notional / position_size.recommended_size)

        position_size.recommended_size = adjusted_size
        position_size.recommended_shares = adjusted_shares
        position_size.recommended_notional = adjusted_shares * (position_size.recommended_notional / position_size.recommended_shares) if position_size.recommended_shares > 0 else 0
        position_size.adjusted_for.append('drawdown')

        return position_size

    def apply_volatility_regime_adjustment(
        self,
        position_size: PositionSize,
        current_volatility: float,
        normal_volatility: float = 0.15
    ) -> PositionSize:
        """
        Adjust position size based on volatility regime

        Args:
            position_size: Initial position size
            current_volatility: Current market volatility
            normal_volatility: Normal/historical volatility (15% default)

        Returns:
            Adjusted PositionSize
        """
        if not self.params.volatility_regime_adjustment:
            return position_size

        if current_volatility <= 0 or normal_volatility <= 0:
            return position_size

        # Reduce size in high volatility environments
        # adjustment = normal_vol / current_vol
        volatility_ratio = normal_volatility / current_volatility
        adjustment_factor = min(1.0, volatility_ratio)  # Never increase, only decrease
        adjustment_factor = max(0.5, adjustment_factor)  # Keep at least 50%

        adjusted_size = position_size.recommended_size * adjustment_factor
        adjusted_shares = int(adjusted_size * position_size.recommended_notional / position_size.recommended_size)

        position_size.recommended_size = adjusted_size
        position_size.recommended_shares = adjusted_shares
        position_size.recommended_notional = adjusted_shares * (position_size.recommended_notional / position_size.recommended_shares) if position_size.recommended_shares > 0 else 0
        position_size.adjusted_for.append('volatility_regime')

        return position_size

    def size_single_position(
        self,
        symbol: str,
        portfolio_value: float,
        current_price: float,
        returns: Optional[pd.Series] = None,
        win_probability: Optional[float] = None,
        win_loss_ratio: Optional[float] = None,
        existing_positions: Optional[Dict[str, float]] = None,
        correlation_matrix: Optional[pd.DataFrame] = None,
        current_drawdown: float = 0.0,
        current_volatility: Optional[float] = None
    ) -> PositionSize:
        """
        Calculate position size using configured method with all adjustments

        Args:
            symbol: Asset symbol
            portfolio_value: Total portfolio value
            current_price: Current asset price
            returns: Historical returns (for volatility-based methods)
            win_probability: Win probability (for Kelly)
            win_loss_ratio: Win/loss ratio (for Kelly)
            existing_positions: Existing positions for correlation adjustment
            correlation_matrix: Correlation matrix
            current_drawdown: Current portfolio drawdown
            current_volatility: Current market volatility

        Returns:
            PositionSize object with all adjustments applied
        """
        # Calculate base position size
        if self.params.method == SizingMethod.KELLY:
            if win_probability is None or win_loss_ratio is None:
                logger.warning(f"Kelly method requires win_probability and win_loss_ratio. Using fixed fractional.")
                position_size = self.calculate_fixed_fractional_size(symbol, portfolio_value, current_price)
            else:
                position_size = self.calculate_kelly_size(
                    symbol, win_probability, win_loss_ratio, portfolio_value, current_price
                )

        elif self.params.method == SizingMethod.FIXED_FRACTIONAL:
            position_size = self.calculate_fixed_fractional_size(symbol, portfolio_value, current_price)

        elif self.params.method == SizingMethod.VOLATILITY_BASED:
            if returns is None or returns.empty:
                logger.warning(f"Volatility-based method requires returns. Using fixed fractional.")
                position_size = self.calculate_fixed_fractional_size(symbol, portfolio_value, current_price)
            else:
                position_size = self.calculate_volatility_based_size(
                    symbol, returns, portfolio_value, current_price
                )

        elif self.params.method == SizingMethod.TARGET_VOLATILITY:
            if returns is None or returns.empty:
                logger.warning(f"Target volatility method requires returns. Using fixed fractional.")
                position_size = self.calculate_fixed_fractional_size(symbol, portfolio_value, current_price)
            else:
                position_size = self.calculate_target_volatility_size(
                    symbol, returns, portfolio_value, current_price
                )

        elif self.params.method == SizingMethod.EQUAL_WEIGHT:
            n_positions = len(existing_positions) + 1 if existing_positions else 1
            position_size = self.calculate_equal_weight_size(symbol, n_positions, portfolio_value, current_price)

        else:
            # Default to fixed fractional
            position_size = self.calculate_fixed_fractional_size(symbol, portfolio_value, current_price)

        # Apply adjustments
        if existing_positions and correlation_matrix is not None:
            position_size = self.apply_correlation_adjustment(
                position_size, symbol, existing_positions, correlation_matrix
            )

        if current_drawdown > 0:
            position_size = self.apply_drawdown_adjustment(position_size, current_drawdown)

        if current_volatility is not None:
            position_size = self.apply_volatility_regime_adjustment(position_size, current_volatility)

        return position_size

    def size_portfolio(
        self,
        symbols: List[str],
        portfolio_value: float,
        current_prices: Dict[str, float],
        returns: Optional[pd.DataFrame] = None,
        win_probabilities: Optional[Dict[str, float]] = None,
        win_loss_ratios: Optional[Dict[str, float]] = None,
        correlation_matrix: Optional[pd.DataFrame] = None,
        current_drawdown: float = 0.0,
        current_volatility: Optional[float] = None
    ) -> PortfolioAllocation:
        """
        Calculate position sizes for entire portfolio

        Args:
            symbols: List of asset symbols
            portfolio_value: Total portfolio value
            current_prices: Current prices {symbol: price}
            returns: Historical returns DataFrame
            win_probabilities: Win probabilities {symbol: prob}
            win_loss_ratios: Win/loss ratios {symbol: ratio}
            correlation_matrix: Correlation matrix
            current_drawdown: Current portfolio drawdown
            current_volatility: Current market volatility

        Returns:
            PortfolioAllocation object
        """
        allocation = PortfolioAllocation()

        # Use risk parity for RISK_PARITY method
        if self.params.method == SizingMethod.RISK_PARITY:
            if returns is not None and not returns.empty:
                allocation.positions = self.calculate_risk_parity_allocation(
                    symbols, returns, portfolio_value, current_prices
                )
            else:
                logger.warning("Risk parity requires returns data. Using equal weight.")
                for symbol in symbols:
                    price = current_prices.get(symbol, 0)
                    if price > 0:
                        pos = self.calculate_equal_weight_size(symbol, len(symbols), portfolio_value, price)
                        allocation.positions[symbol] = pos
        else:
            # Size each position individually
            existing_positions = {}
            for symbol in symbols:
                price = current_prices.get(symbol, 0)
                if price <= 0:
                    continue

                symbol_returns = returns[symbol] if returns is not None and symbol in returns.columns else None
                win_prob = win_probabilities.get(symbol) if win_probabilities else None
                win_loss = win_loss_ratios.get(symbol) if win_loss_ratios else None

                position_size = self.size_single_position(
                    symbol=symbol,
                    portfolio_value=portfolio_value,
                    current_price=price,
                    returns=symbol_returns,
                    win_probability=win_prob,
                    win_loss_ratio=win_loss,
                    existing_positions=existing_positions,
                    correlation_matrix=correlation_matrix,
                    current_drawdown=current_drawdown,
                    current_volatility=current_volatility
                )

                allocation.positions[symbol] = position_size
                existing_positions[symbol] = position_size.recommended_size

        # Calculate portfolio metrics
        allocation.total_exposure = sum(p.recommended_size for p in allocation.positions.values())
        allocation.leverage = allocation.total_exposure / 1.0  # Assuming base = 100%

        # Check constraints
        allocation.constraints_satisfied = self._check_constraints(allocation)

        # Calculate expected volatility if returns provided
        if returns is not None and not returns.empty:
            allocation.expected_volatility = self._calculate_portfolio_volatility(
                allocation, returns, correlation_matrix
            )

        return allocation

    def _check_constraints(self, allocation: PortfolioAllocation) -> bool:
        """
        Check if allocation satisfies constraints

        Args:
            allocation: Portfolio allocation

        Returns:
            True if all constraints satisfied
        """
        satisfied = True

        # Check total exposure
        if allocation.total_exposure > self.params.constraints.max_total_exposure:
            allocation.warnings.append(
                f"Total exposure {allocation.total_exposure:.1%} exceeds limit "
                f"{self.params.constraints.max_total_exposure:.1%}"
            )
            satisfied = False

        # Check leverage
        if allocation.leverage > self.params.constraints.max_leverage:
            allocation.warnings.append(
                f"Leverage {allocation.leverage:.2f}x exceeds limit "
                f"{self.params.constraints.max_leverage:.2f}x"
            )
            satisfied = False

        # Check individual positions
        for symbol, position in allocation.positions.items():
            if position.recommended_size > self.params.constraints.max_position_size:
                allocation.warnings.append(
                    f"{symbol} size {position.recommended_size:.1%} exceeds max "
                    f"{self.params.constraints.max_position_size:.1%}"
                )
                satisfied = False

            if position.recommended_size < self.params.constraints.min_position_size:
                allocation.warnings.append(
                    f"{symbol} size {position.recommended_size:.1%} below min "
                    f"{self.params.constraints.min_position_size:.1%}"
                )
                satisfied = False

        return satisfied

    def _calculate_portfolio_volatility(
        self,
        allocation: PortfolioAllocation,
        returns: pd.DataFrame,
        correlation_matrix: Optional[pd.DataFrame]
    ) -> float:
        """
        Calculate expected portfolio volatility

        Args:
            allocation: Portfolio allocation
            returns: Historical returns
            correlation_matrix: Correlation matrix

        Returns:
            Expected annual volatility
        """
        symbols = list(allocation.positions.keys())
        if not symbols:
            return 0.0

        # Get weights
        weights = np.array([allocation.positions[s].recommended_size for s in symbols])

        # Get volatilities
        volatilities = returns[symbols].std().values * np.sqrt(252)

        # Calculate portfolio variance
        if correlation_matrix is not None and not correlation_matrix.empty:
            corr_matrix = correlation_matrix.loc[symbols, symbols].values
        else:
            corr_matrix = returns[symbols].corr().values

        cov_matrix = np.outer(volatilities, volatilities) * corr_matrix
        portfolio_variance = np.dot(weights, np.dot(cov_matrix, weights))
        portfolio_vol = np.sqrt(portfolio_variance)

        # Diversification ratio
        weighted_vol = np.sum(weights * volatilities)
        if portfolio_vol > 0:
            allocation.diversification_ratio = weighted_vol / portfolio_vol

        return float(portfolio_vol)

    def print_allocation_report(self, allocation: PortfolioAllocation, top_n: int = 10):
        """
        Print portfolio allocation report

        Args:
            allocation: Portfolio allocation
            top_n: Number of positions to show
        """
        print("\n" + "="*80)
        print("PORTFOLIO ALLOCATION REPORT")
        print("="*80)
        print(f"Timestamp: {allocation.timestamp.isoformat()}")
        print(f"Sizing Method: {self.params.method.value}")
        print()

        print("PORTFOLIO METRICS:")
        print(f"  Total Exposure: {allocation.total_exposure:.2%}")
        print(f"  Leverage: {allocation.leverage:.2f}x")
        print(f"  Expected Volatility: {allocation.expected_volatility:.2%}")
        print(f"  Diversification Ratio: {allocation.diversification_ratio:.2f}")
        print(f"  Number of Positions: {len(allocation.positions)}")
        print()

        print(f"TOP {top_n} POSITIONS:")
        sorted_positions = sorted(
            allocation.positions.items(),
            key=lambda x: x[1].recommended_size,
            reverse=True
        )

        print(f"{'Symbol':<8} {'Size':<8} {'Shares':<8} {'Notional':<12} {'Confidence':<10} {'Adjustments'}")
        print("-" * 80)
        for symbol, pos in sorted_positions[:top_n]:
            adjustments = ', '.join(pos.adjusted_for) if pos.adjusted_for else 'None'
            print(f"{symbol:<8} {pos.recommended_size:>7.2%} {pos.recommended_shares:>8} "
                  f"${pos.recommended_notional:>10,.0f} {pos.confidence:>9.1%} {adjustments}")

        if allocation.warnings:
            print()
            print("⚠️  WARNINGS:")
            for warning in allocation.warnings:
                print(f"  • {warning}")

        print("="*80 + "\n")


# Example usage
if __name__ == "__main__":
    print("Position Sizing Framework Example")
    print("="*80)

    # Generate sample data
    np.random.seed(42)
    n_days = 252
    symbols = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA']

    # Create returns data
    returns_data = {}
    for symbol in symbols:
        returns_data[symbol] = np.random.normal(0.0005, 0.02, n_days)

    returns = pd.DataFrame(returns_data)

    # Current prices and portfolio value
    current_prices = {
        'AAPL': 180.0,
        'MSFT': 370.0,
        'GOOGL': 140.0,
        'NVDA': 500.0,
        'TSLA': 250.0
    }

    portfolio_value = 100000.0

    # Win probabilities and ratios (from backtesting)
    win_probabilities = {
        'AAPL': 0.55,
        'MSFT': 0.58,
        'GOOGL': 0.52,
        'NVDA': 0.60,
        'TSLA': 0.48
    }

    win_loss_ratios = {
        'AAPL': 1.8,
        'MSFT': 2.0,
        'GOOGL': 1.5,
        'NVDA': 2.2,
        'TSLA': 1.3
    }

    # Correlation matrix
    correlation_matrix = returns.corr()

    # Test different sizing methods
    print("\n1. KELLY CRITERION METHOD")
    print("-" * 80)
    kelly_params = SizingParameters(
        method=SizingMethod.KELLY,
        kelly_fraction=0.25,
        correlation_adjustment=True,
        drawdown_adjustment=True
    )
    kelly_sizer = PositionSizer(kelly_params)
    kelly_allocation = kelly_sizer.size_portfolio(
        symbols=symbols,
        portfolio_value=portfolio_value,
        current_prices=current_prices,
        returns=returns,
        win_probabilities=win_probabilities,
        win_loss_ratios=win_loss_ratios,
        correlation_matrix=correlation_matrix,
        current_drawdown=0.05  # 5% drawdown
    )
    kelly_sizer.print_allocation_report(kelly_allocation)

    print("\n2. RISK PARITY METHOD")
    print("-" * 80)
    risk_parity_params = SizingParameters(method=SizingMethod.RISK_PARITY)
    risk_parity_sizer = PositionSizer(risk_parity_params)
    risk_parity_allocation = risk_parity_sizer.size_portfolio(
        symbols=symbols,
        portfolio_value=portfolio_value,
        current_prices=current_prices,
        returns=returns,
        correlation_matrix=correlation_matrix
    )
    risk_parity_sizer.print_allocation_report(risk_parity_allocation)

    print("\n3. VOLATILITY-BASED METHOD")
    print("-" * 80)
    vol_params = SizingParameters(
        method=SizingMethod.VOLATILITY_BASED,
        volatility_regime_adjustment=True
    )
    vol_sizer = PositionSizer(vol_params)

    # Simulate high volatility environment
    current_vol = 0.30  # 30% volatility (high)
    vol_allocation = vol_sizer.size_portfolio(
        symbols=symbols,
        portfolio_value=portfolio_value,
        current_prices=current_prices,
        returns=returns,
        correlation_matrix=correlation_matrix,
        current_volatility=current_vol
    )
    vol_sizer.print_allocation_report(vol_allocation)

    print("\n" + "="*80)
