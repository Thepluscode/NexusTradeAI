"""
Market Impact Models
====================
Institutional-grade market impact models for transaction cost estimation.

Author: NexusTradeAI Execution Team
Version: 1.0
Date: December 25, 2024

Features:
- Linear impact model (Almgren-Chriss)
- Square-root impact model (Barra, Torre)
- Permanent vs. temporary impact decomposition
- Volume-dependent impact
- Participation rate impact
- Historical impact calibration
- Real-time impact estimation
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class ImpactModel(Enum):
    """Market impact model types"""
    LINEAR = "linear"
    SQUARE_ROOT = "square_root"
    POWER_LAW = "power_law"
    ALMGREN_CHRISS = "almgren_chriss"
    CUSTOM = "custom"


class ImpactComponent(Enum):
    """Impact components"""
    PERMANENT = "permanent"  # Persistent price impact
    TEMPORARY = "temporary"  # Temporary price impact (reverses)
    TOTAL = "total"  # Total impact


@dataclass
class MarketImpactParameters:
    """Market impact model parameters"""
    # Asset characteristics
    symbol: str
    avg_daily_volume: float  # Average daily volume (shares)
    volatility: float  # Annualized volatility
    bid_ask_spread: float  # Bid-ask spread (as fraction of price)

    # Model parameters (calibrated)
    permanent_impact_coef: float = 0.1  # η (permanent impact coefficient)
    temporary_impact_coef: float = 0.01  # γ (temporary impact coefficient)
    power_law_exponent: float = 0.5  # For square-root model

    # Liquidity metrics
    liquidity_factor: float = 1.0  # 1.0 = normal, >1 = more liquid

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'symbol': self.symbol,
            'avg_daily_volume': self.avg_daily_volume,
            'volatility': self.volatility,
            'bid_ask_spread': self.bid_ask_spread,
            'permanent_impact_coef': self.permanent_impact_coef,
            'temporary_impact_coef': self.temporary_impact_coef,
            'power_law_exponent': self.power_law_exponent,
            'liquidity_factor': self.liquidity_factor
        }


@dataclass
class ImpactEstimate:
    """Market impact estimate"""
    timestamp: datetime = field(default_factory=datetime.now)

    # Trade details
    symbol: str = ""
    shares: int = 0
    order_value: float = 0.0
    participation_rate: float = 0.0  # % of daily volume

    # Impact estimates (as fraction of price)
    permanent_impact: float = 0.0
    temporary_impact: float = 0.0
    total_impact: float = 0.0

    # Cost estimates (in dollars)
    permanent_cost: float = 0.0
    temporary_cost: float = 0.0
    total_cost: float = 0.0
    spread_cost: float = 0.0  # Bid-ask spread cost

    # Model used
    model: ImpactModel = ImpactModel.LINEAR
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'symbol': self.symbol,
            'shares': self.shares,
            'order_value': self.order_value,
            'participation_rate': self.participation_rate,
            'permanent_impact': self.permanent_impact,
            'temporary_impact': self.temporary_impact,
            'total_impact': self.total_impact,
            'permanent_cost': self.permanent_cost,
            'temporary_cost': self.temporary_cost,
            'total_cost': self.total_cost,
            'spread_cost': self.spread_cost,
            'model': self.model.value,
            'confidence': self.confidence
        }


@dataclass
class ImpactCalibration:
    """Calibration results for impact model"""
    symbol: str
    calibration_period: str
    trades_used: int

    # Calibrated parameters
    permanent_impact_coef: float
    temporary_impact_coef: float
    power_law_exponent: float

    # Goodness of fit
    r_squared: float
    rmse: float

    # Confidence intervals
    permanent_ci: Tuple[float, float]
    temporary_ci: Tuple[float, float]


class MarketImpactModel:
    """
    Comprehensive market impact modeling framework
    """

    def __init__(self):
        """Initialize market impact model"""
        self.parameters: Dict[str, MarketImpactParameters] = {}
        self.impact_history: List[ImpactEstimate] = []
        logger.info("Initialized MarketImpactModel")

    def set_parameters(self, params: MarketImpactParameters):
        """
        Set model parameters for a symbol

        Args:
            params: Market impact parameters
        """
        self.parameters[params.symbol] = params
        logger.info(f"Set impact parameters for {params.symbol}")

    def estimate_linear_impact(
        self,
        symbol: str,
        shares: int,
        current_price: float,
        params: Optional[MarketImpactParameters] = None
    ) -> ImpactEstimate:
        """
        Estimate market impact using linear model

        Linear model: Impact ∝ (Order Size) / (Daily Volume)

        Permanent Impact = η × σ × (Q / V)
        Temporary Impact = γ × σ × (Q / V)

        Where:
            η = permanent impact coefficient
            γ = temporary impact coefficient
            σ = volatility (daily)
            Q = order size (shares)
            V = average daily volume (shares)

        Args:
            symbol: Trading symbol
            shares: Number of shares to trade
            current_price: Current market price
            params: Market impact parameters (optional)

        Returns:
            ImpactEstimate object
        """
        if params is None:
            params = self.parameters.get(symbol)
            if params is None:
                raise ValueError(f"No parameters set for {symbol}")

        estimate = ImpactEstimate(
            symbol=symbol,
            shares=shares,
            order_value=shares * current_price,
            model=ImpactModel.LINEAR
        )

        # Participation rate
        participation_rate = shares / params.avg_daily_volume
        estimate.participation_rate = participation_rate

        # Daily volatility
        daily_vol = params.volatility / np.sqrt(252)

        # Permanent impact (as fraction of price)
        # η × σ × (Q / V)
        estimate.permanent_impact = (
            params.permanent_impact_coef *
            daily_vol *
            participation_rate /
            params.liquidity_factor
        )

        # Temporary impact (as fraction of price)
        # γ × σ × (Q / V)
        estimate.temporary_impact = (
            params.temporary_impact_coef *
            daily_vol *
            participation_rate /
            params.liquidity_factor
        )

        # Total impact
        estimate.total_impact = estimate.permanent_impact + estimate.temporary_impact

        # Cost estimates (in dollars)
        estimate.permanent_cost = estimate.permanent_impact * estimate.order_value
        estimate.temporary_cost = estimate.temporary_impact * estimate.order_value
        estimate.total_cost = estimate.total_impact * estimate.order_value

        # Add bid-ask spread cost
        estimate.spread_cost = params.bid_ask_spread * estimate.order_value / 2
        estimate.total_cost += estimate.spread_cost

        estimate.confidence = 0.75  # Linear model reasonably reliable

        self.impact_history.append(estimate)
        return estimate

    def estimate_square_root_impact(
        self,
        symbol: str,
        shares: int,
        current_price: float,
        params: Optional[MarketImpactParameters] = None
    ) -> ImpactEstimate:
        """
        Estimate market impact using square-root model

        Square-root model: Impact ∝ √(Order Size / Daily Volume)
        More common in practice, exhibits concavity

        Permanent Impact = η × σ × √(Q / V)
        Temporary Impact = γ × σ × √(Q / V)

        This model assumes impact grows slower than linearly
        (diminishing marginal impact)

        Args:
            symbol: Trading symbol
            shares: Number of shares to trade
            current_price: Current market price
            params: Market impact parameters (optional)

        Returns:
            ImpactEstimate object
        """
        if params is None:
            params = self.parameters.get(symbol)
            if params is None:
                raise ValueError(f"No parameters set for {symbol}")

        estimate = ImpactEstimate(
            symbol=symbol,
            shares=shares,
            order_value=shares * current_price,
            model=ImpactModel.SQUARE_ROOT
        )

        # Participation rate
        participation_rate = shares / params.avg_daily_volume
        estimate.participation_rate = participation_rate

        # Daily volatility
        daily_vol = params.volatility / np.sqrt(252)

        # Square root of participation rate (key difference from linear)
        sqrt_participation = np.sqrt(participation_rate)

        # Permanent impact (as fraction of price)
        estimate.permanent_impact = (
            params.permanent_impact_coef *
            daily_vol *
            sqrt_participation /
            params.liquidity_factor
        )

        # Temporary impact (as fraction of price)
        estimate.temporary_impact = (
            params.temporary_impact_coef *
            daily_vol *
            sqrt_participation /
            params.liquidity_factor
        )

        # Total impact
        estimate.total_impact = estimate.permanent_impact + estimate.temporary_impact

        # Cost estimates
        estimate.permanent_cost = estimate.permanent_impact * estimate.order_value
        estimate.temporary_cost = estimate.temporary_impact * estimate.order_value
        estimate.total_cost = estimate.total_impact * estimate.order_value

        # Add spread cost
        estimate.spread_cost = params.bid_ask_spread * estimate.order_value / 2
        estimate.total_cost += estimate.spread_cost

        estimate.confidence = 0.85  # Square-root model empirically more accurate

        self.impact_history.append(estimate)
        return estimate

    def estimate_power_law_impact(
        self,
        symbol: str,
        shares: int,
        current_price: float,
        params: Optional[MarketImpactParameters] = None
    ) -> ImpactEstimate:
        """
        Estimate market impact using power-law model

        Power-law model: Impact ∝ (Q / V)^α
        Where α is the power-law exponent (typically 0.5-0.7)

        Generalizes both linear (α=1) and square-root (α=0.5)

        Args:
            symbol: Trading symbol
            shares: Number of shares to trade
            current_price: Current market price
            params: Market impact parameters (optional)

        Returns:
            ImpactEstimate object
        """
        if params is None:
            params = self.parameters.get(symbol)
            if params is None:
                raise ValueError(f"No parameters set for {symbol}")

        estimate = ImpactEstimate(
            symbol=symbol,
            shares=shares,
            order_value=shares * current_price,
            model=ImpactModel.POWER_LAW
        )

        # Participation rate
        participation_rate = shares / params.avg_daily_volume
        estimate.participation_rate = participation_rate

        # Daily volatility
        daily_vol = params.volatility / np.sqrt(252)

        # Power-law transformation
        power_participation = participation_rate ** params.power_law_exponent

        # Permanent impact
        estimate.permanent_impact = (
            params.permanent_impact_coef *
            daily_vol *
            power_participation /
            params.liquidity_factor
        )

        # Temporary impact
        estimate.temporary_impact = (
            params.temporary_impact_coef *
            daily_vol *
            power_participation /
            params.liquidity_factor
        )

        # Total impact
        estimate.total_impact = estimate.permanent_impact + estimate.temporary_impact

        # Costs
        estimate.permanent_cost = estimate.permanent_impact * estimate.order_value
        estimate.temporary_cost = estimate.temporary_impact * estimate.order_value
        estimate.total_cost = estimate.total_impact * estimate.order_value

        # Spread cost
        estimate.spread_cost = params.bid_ask_spread * estimate.order_value / 2
        estimate.total_cost += estimate.spread_cost

        estimate.confidence = 0.80

        self.impact_history.append(estimate)
        return estimate

    def estimate_almgren_chriss_impact(
        self,
        symbol: str,
        total_shares: int,
        num_intervals: int,
        interval_duration_minutes: float,
        current_price: float,
        params: Optional[MarketImpactParameters] = None
    ) -> List[ImpactEstimate]:
        """
        Estimate impact using Almgren-Chriss optimal execution model

        Splits order into optimal slices over time to minimize impact + risk

        Trade-off:
        - Trading fast → high market impact
        - Trading slow → high price risk (volatility)

        Args:
            symbol: Trading symbol
            total_shares: Total shares to trade
            num_intervals: Number of time intervals
            interval_duration_minutes: Duration of each interval
            current_price: Current market price
            params: Market impact parameters

        Returns:
            List of ImpactEstimate for each interval
        """
        if params is None:
            params = self.parameters.get(symbol)
            if params is None:
                raise ValueError(f"No parameters set for {symbol}")

        # Optimal execution trajectory (simplified)
        # More aggressive early, then linear decay

        estimates = []
        remaining_shares = total_shares

        for i in range(num_intervals):
            # Shares to trade in this interval
            # Using linear schedule as simplified version
            shares_in_interval = total_shares // num_intervals

            if i == num_intervals - 1:
                # Last interval gets remainder
                shares_in_interval = remaining_shares

            # Estimate impact for this slice
            estimate = self.estimate_square_root_impact(
                symbol, shares_in_interval, current_price, params
            )

            estimate.model = ImpactModel.ALMGREN_CHRISS
            estimates.append(estimate)

            remaining_shares -= shares_in_interval

        return estimates

    def estimate_optimal_execution_time(
        self,
        symbol: str,
        shares: int,
        current_price: float,
        max_participation_rate: float = 0.10,
        params: Optional[MarketImpactParameters] = None
    ) -> Tuple[int, float]:
        """
        Calculate optimal execution time to stay under participation limit

        Args:
            symbol: Trading symbol
            shares: Number of shares to trade
            current_price: Current market price
            max_participation_rate: Max % of daily volume per interval
            params: Market impact parameters

        Returns:
            (num_intervals, total_impact_cost)
        """
        if params is None:
            params = self.parameters.get(symbol)
            if params is None:
                raise ValueError(f"No parameters set for {symbol}")

        # Daily volume per minute (assuming 6.5 hour trading day)
        volume_per_minute = params.avg_daily_volume / (6.5 * 60)

        # Max shares per minute
        max_shares_per_minute = volume_per_minute * max_participation_rate

        # Number of minutes needed
        minutes_needed = np.ceil(shares / max_shares_per_minute)

        # Estimate impact with this schedule
        num_intervals = int(minutes_needed)
        shares_per_interval = shares / num_intervals

        total_impact_cost = 0.0
        for i in range(num_intervals):
            estimate = self.estimate_square_root_impact(
                symbol, int(shares_per_interval), current_price, params
            )
            total_impact_cost += estimate.total_cost

        return num_intervals, total_impact_cost

    def calibrate_from_trades(
        self,
        symbol: str,
        trade_data: pd.DataFrame,
        model: ImpactModel = ImpactModel.SQUARE_ROOT
    ) -> ImpactCalibration:
        """
        Calibrate impact model parameters from historical trade data

        Args:
            symbol: Trading symbol
            trade_data: DataFrame with columns:
                - shares: number of shares traded
                - avg_daily_volume: average daily volume
                - realized_impact: actual price impact observed
                - volatility: daily volatility
            model: Impact model to calibrate

        Returns:
            ImpactCalibration object
        """
        if trade_data.empty:
            raise ValueError("No trade data provided for calibration")

        # Extract features
        Q = trade_data['shares'].values
        V = trade_data['avg_daily_volume'].values
        sigma = trade_data['volatility'].values
        realized_impact = trade_data['realized_impact'].values

        # Participation rate
        participation = Q / V

        # Transform based on model
        if model == ImpactModel.LINEAR:
            X = sigma * participation
        elif model == ImpactModel.SQUARE_ROOT:
            X = sigma * np.sqrt(participation)
        else:
            # Default to square-root
            X = sigma * np.sqrt(participation)

        # Linear regression: realized_impact = α × X + noise
        # Using numpy polyfit
        coefficients = np.polyfit(X, realized_impact, 1)
        impact_coef = coefficients[0]

        # Calculate R-squared
        y_pred = impact_coef * X
        ss_res = np.sum((realized_impact - y_pred) ** 2)
        ss_tot = np.sum((realized_impact - np.mean(realized_impact)) ** 2)
        r_squared = 1 - (ss_res / ss_tot)

        # RMSE
        rmse = np.sqrt(np.mean((realized_impact - y_pred) ** 2))

        # Confidence intervals (simplified - using standard error)
        se = rmse / np.sqrt(len(X))
        ci_lower = impact_coef - 1.96 * se
        ci_upper = impact_coef + 1.96 * se

        calibration = ImpactCalibration(
            symbol=symbol,
            calibration_period=f"{len(trade_data)} trades",
            trades_used=len(trade_data),
            permanent_impact_coef=impact_coef * 0.6,  # Assume 60% permanent
            temporary_impact_coef=impact_coef * 0.4,  # Assume 40% temporary
            power_law_exponent=0.5 if model == ImpactModel.SQUARE_ROOT else 1.0,
            r_squared=r_squared,
            rmse=rmse,
            permanent_ci=(ci_lower * 0.6, ci_upper * 0.6),
            temporary_ci=(ci_lower * 0.4, ci_upper * 0.4)
        )

        logger.info(f"Calibrated {model.value} model for {symbol}: R²={r_squared:.3f}, RMSE={rmse:.4f}")

        return calibration

    def compare_models(
        self,
        symbol: str,
        shares: int,
        current_price: float,
        params: Optional[MarketImpactParameters] = None
    ) -> pd.DataFrame:
        """
        Compare different impact models for same trade

        Args:
            symbol: Trading symbol
            shares: Number of shares
            current_price: Current price
            params: Market impact parameters

        Returns:
            DataFrame comparing models
        """
        results = []

        # Linear model
        linear_estimate = self.estimate_linear_impact(symbol, shares, current_price, params)
        results.append({
            'Model': 'Linear',
            'Total Impact (%)': linear_estimate.total_impact * 100,
            'Permanent (%)': linear_estimate.permanent_impact * 100,
            'Temporary (%)': linear_estimate.temporary_impact * 100,
            'Total Cost ($)': linear_estimate.total_cost,
            'Confidence': linear_estimate.confidence
        })

        # Square-root model
        sqrt_estimate = self.estimate_square_root_impact(symbol, shares, current_price, params)
        results.append({
            'Model': 'Square-Root',
            'Total Impact (%)': sqrt_estimate.total_impact * 100,
            'Permanent (%)': sqrt_estimate.permanent_impact * 100,
            'Temporary (%)': sqrt_estimate.temporary_impact * 100,
            'Total Cost ($)': sqrt_estimate.total_cost,
            'Confidence': sqrt_estimate.confidence
        })

        # Power-law model
        power_estimate = self.estimate_power_law_impact(symbol, shares, current_price, params)
        results.append({
            'Model': 'Power-Law',
            'Total Impact (%)': power_estimate.total_impact * 100,
            'Permanent (%)': power_estimate.permanent_impact * 100,
            'Temporary (%)': power_estimate.temporary_impact * 100,
            'Total Cost ($)': power_estimate.total_cost,
            'Confidence': power_estimate.confidence
        })

        return pd.DataFrame(results)

    def print_impact_report(self, estimate: ImpactEstimate):
        """
        Print market impact report

        Args:
            estimate: Impact estimate
        """
        print("\n" + "="*70)
        print("MARKET IMPACT ESTIMATE")
        print("="*70)
        print(f"Symbol: {estimate.symbol}")
        print(f"Shares: {estimate.shares:,}")
        print(f"Order Value: ${estimate.order_value:,.0f}")
        print(f"Participation Rate: {estimate.participation_rate:.2%}")
        print(f"Model: {estimate.model.value}")
        print()

        print("IMPACT BREAKDOWN:")
        print(f"  Permanent Impact: {estimate.permanent_impact:.3%} (${estimate.permanent_cost:,.0f})")
        print(f"  Temporary Impact: {estimate.temporary_impact:.3%} (${estimate.temporary_cost:,.0f})")
        print(f"  Spread Cost:      {estimate.spread_cost / estimate.order_value:.3%} (${estimate.spread_cost:,.0f})")
        print(f"  Total Impact:     {estimate.total_impact:.3%} (${estimate.total_cost:,.0f})")
        print()

        print(f"Confidence: {estimate.confidence:.0%}")
        print("="*70 + "\n")


# Example usage
if __name__ == "__main__":
    print("Market Impact Models Example")
    print("="*70)

    # Setup
    symbol = "AAPL"
    current_price = 180.0

    # Market parameters
    params = MarketImpactParameters(
        symbol=symbol,
        avg_daily_volume=50_000_000,  # 50M shares/day
        volatility=0.25,  # 25% annual vol
        bid_ask_spread=0.0005,  # 5 bps
        permanent_impact_coef=0.1,
        temporary_impact_coef=0.01
    )

    # Initialize model
    model = MarketImpactModel()
    model.set_parameters(params)

    # Example trade: 100,000 shares
    shares = 100_000

    print(f"\n1. ESTIMATING IMPACT FOR {shares:,} SHARES OF {symbol}")
    print("-" * 70)
    print(f"Participation Rate: {shares / params.avg_daily_volume:.2%} of daily volume")
    print()

    # Compare models
    comparison = model.compare_models(symbol, shares, current_price)
    print("MODEL COMPARISON:")
    print(comparison.to_string(index=False))
    print()

    # Detailed estimate using square-root (most common)
    print("\n2. DETAILED SQUARE-ROOT MODEL ESTIMATE")
    estimate = model.estimate_square_root_impact(symbol, shares, current_price)
    model.print_impact_report(estimate)

    # Optimal execution time
    print("\n3. OPTIMAL EXECUTION STRATEGY")
    print("-" * 70)
    num_intervals, total_cost = model.estimate_optimal_execution_time(
        symbol, shares, current_price, max_participation_rate=0.05
    )
    print(f"Optimal Execution:")
    print(f"  Time Required: {num_intervals} minutes")
    print(f"  Shares per Minute: {shares / num_intervals:,.0f}")
    print(f"  Total Impact Cost: ${total_cost:,.0f}")
    print(f"  Cost as % of Order: {total_cost / (shares * current_price):.3%}")

    print("\n" + "="*70)
