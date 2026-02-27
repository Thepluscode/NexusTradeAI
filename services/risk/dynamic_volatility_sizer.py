"""
Dynamic Volatility-Based Position Sizer
=======================================
Adaptive position sizing based on volatility regime detection and forecasting.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Volatility regime detection (low, normal, high, extreme)
- GARCH(1,1) volatility forecasting
- Exponentially weighted moving average (EWMA) volatility
- Regime-specific position sizing
- Dynamic risk budgeting
- Real-time position adjustments
- Volatility breakout detection
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from scipy import stats
import logging

logger = logging.getLogger(__name__)


class VolatilityRegime(Enum):
    """Volatility regime classifications"""
    EXTREME_LOW = "extreme_low"  # < 0.10 annual vol
    LOW = "low"  # 0.10 - 0.15
    NORMAL = "normal"  # 0.15 - 0.25
    HIGH = "high"  # 0.25 - 0.40
    EXTREME_HIGH = "extreme_high"  # > 0.40


@dataclass
class VolatilityForecast:
    """Volatility forecast results"""
    timestamp: datetime = field(default_factory=datetime.now)
    current_volatility: float = 0.0
    forecast_volatility: float = 0.0
    forecast_horizon_days: int = 1
    regime: VolatilityRegime = VolatilityRegime.NORMAL
    confidence: float = 0.0
    method: str = "ewma"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'current_volatility': self.current_volatility,
            'forecast_volatility': self.forecast_volatility,
            'forecast_horizon_days': self.forecast_horizon_days,
            'regime': self.regime.value,
            'confidence': self.confidence,
            'method': self.method
        }


@dataclass
class RegimeBasedSize:
    """Regime-based position size recommendation"""
    symbol: str
    base_size: float  # Base position size without adjustments
    regime_adjusted_size: float  # Adjusted for volatility regime
    regime: VolatilityRegime
    volatility_forecast: float
    risk_budget_used: float  # Percentage of risk budget
    max_loss_pct: float  # Maximum expected loss %
    confidence: float
    adjustments_applied: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'symbol': self.symbol,
            'base_size': self.base_size,
            'regime_adjusted_size': self.regime_adjusted_size,
            'regime': self.regime.value,
            'volatility_forecast': self.volatility_forecast,
            'risk_budget_used': self.risk_budget_used,
            'max_loss_pct': self.max_loss_pct,
            'confidence': self.confidence,
            'adjustments_applied': self.adjustments_applied
        }


@dataclass
class RegimeParameters:
    """Position sizing parameters per volatility regime"""
    regime: VolatilityRegime
    max_position_size: float  # Max position size in this regime
    risk_per_trade: float  # Risk % per trade
    max_positions: int  # Max concurrent positions
    stop_loss_multiplier: float  # Stop loss distance multiplier

    # Regime boundaries (annual volatility)
    vol_min: float = 0.0
    vol_max: float = 1.0


class DynamicVolatilitySizer:
    """
    Dynamic position sizer that adapts to volatility regimes
    """

    def __init__(
        self,
        lookback_window: int = 60,
        ewma_lambda: float = 0.94,
        risk_free_rate: float = 0.02
    ):
        """
        Initialize dynamic volatility sizer

        Args:
            lookback_window: Days for volatility calculation
            ewma_lambda: Lambda for EWMA (0.94 = RiskMetrics standard)
            risk_free_rate: Risk-free rate for Sharpe calculations
        """
        self.lookback_window = lookback_window
        self.ewma_lambda = ewma_lambda
        self.risk_free_rate = risk_free_rate

        # Define regime parameters
        self.regime_params = self._initialize_regime_parameters()

        # Volatility history for regime detection
        self.volatility_history: List[float] = []

        logger.info("Initialized DynamicVolatilitySizer")

    def _initialize_regime_parameters(self) -> Dict[VolatilityRegime, RegimeParameters]:
        """
        Initialize position sizing parameters for each regime

        Returns:
            Dictionary of regime parameters
        """
        return {
            VolatilityRegime.EXTREME_LOW: RegimeParameters(
                regime=VolatilityRegime.EXTREME_LOW,
                max_position_size=0.15,  # 15% max position
                risk_per_trade=0.02,  # 2% risk
                max_positions=8,
                stop_loss_multiplier=0.5,  # Tighter stops in low vol
                vol_min=0.0,
                vol_max=0.10
            ),
            VolatilityRegime.LOW: RegimeParameters(
                regime=VolatilityRegime.LOW,
                max_position_size=0.12,  # 12% max
                risk_per_trade=0.015,  # 1.5% risk
                max_positions=7,
                stop_loss_multiplier=0.75,
                vol_min=0.10,
                vol_max=0.15
            ),
            VolatilityRegime.NORMAL: RegimeParameters(
                regime=VolatilityRegime.NORMAL,
                max_position_size=0.10,  # 10% max
                risk_per_trade=0.01,  # 1% risk (standard)
                max_positions=6,
                stop_loss_multiplier=1.0,  # Normal stops
                vol_min=0.15,
                vol_max=0.25
            ),
            VolatilityRegime.HIGH: RegimeParameters(
                regime=VolatilityRegime.HIGH,
                max_position_size=0.06,  # 6% max (reduce exposure)
                risk_per_trade=0.005,  # 0.5% risk
                max_positions=4,
                stop_loss_multiplier=1.5,  # Wider stops
                vol_min=0.25,
                vol_max=0.40
            ),
            VolatilityRegime.EXTREME_HIGH: RegimeParameters(
                regime=VolatilityRegime.EXTREME_HIGH,
                max_position_size=0.03,  # 3% max (very defensive)
                risk_per_trade=0.0025,  # 0.25% risk
                max_positions=2,
                stop_loss_multiplier=2.0,  # Very wide stops
                vol_min=0.40,
                vol_max=1.0
            )
        }

    def calculate_ewma_volatility(
        self,
        returns: pd.Series,
        lambda_param: Optional[float] = None
    ) -> float:
        """
        Calculate Exponentially Weighted Moving Average (EWMA) volatility

        Args:
            returns: Return series
            lambda_param: Decay parameter (default: self.ewma_lambda)

        Returns:
            Annualized EWMA volatility
        """
        if len(returns) < 2:
            return 0.0

        lambda_val = lambda_param or self.ewma_lambda

        # Initialize variance with sample variance
        variance = returns.var()

        # Update variance using EWMA recursion
        for ret in returns.values:
            variance = lambda_val * variance + (1 - lambda_val) * (ret ** 2)

        # Annualize
        volatility = np.sqrt(variance * 252)

        return float(volatility)

    def calculate_garch_volatility(
        self,
        returns: pd.Series,
        forecast_horizon: int = 1
    ) -> Tuple[float, float]:
        """
        Calculate GARCH(1,1) volatility forecast

        Simple GARCH(1,1): σ²_t = ω + α·ε²_{t-1} + β·σ²_{t-1}
        Where: ω + α + β ≈ 1 for persistence

        Args:
            returns: Return series
            forecast_horizon: Days to forecast ahead

        Returns:
            (current_volatility, forecast_volatility)
        """
        if len(returns) < 30:
            # Not enough data for GARCH, use EWMA
            ewma_vol = self.calculate_ewma_volatility(returns)
            return ewma_vol, ewma_vol

        # GARCH(1,1) parameters (typical values for daily returns)
        omega = 0.000001  # Long-run variance component
        alpha = 0.08  # Weight on past squared return
        beta = 0.91  # Weight on past variance
        # ω + α + β = 0.91 + 0.08 + 0.000001 ≈ 0.99 (high persistence)

        # Initialize with sample variance
        variance = returns.var()
        variances = []

        # Calculate variance series
        for ret in returns.values:
            variance = omega + alpha * (ret ** 2) + beta * variance
            variances.append(variance)

        current_variance = variances[-1]

        # Forecast future variance
        # Multi-step forecast: Var(t+h) = E[σ²] + (α+β)^h · (Var(t) - E[σ²])
        long_run_var = omega / (1 - alpha - beta)
        forecast_variance = long_run_var + (alpha + beta) ** forecast_horizon * (current_variance - long_run_var)

        # Annualize
        current_vol = np.sqrt(current_variance * 252)
        forecast_vol = np.sqrt(forecast_variance * 252)

        return float(current_vol), float(forecast_vol)

    def detect_volatility_regime(self, volatility: float) -> VolatilityRegime:
        """
        Detect volatility regime based on annualized volatility

        Args:
            volatility: Annualized volatility

        Returns:
            VolatilityRegime
        """
        for regime, params in self.regime_params.items():
            if params.vol_min <= volatility < params.vol_max:
                return regime

        # Fallback
        return VolatilityRegime.NORMAL

    def forecast_volatility(
        self,
        returns: pd.Series,
        method: str = "garch",
        forecast_horizon: int = 1
    ) -> VolatilityForecast:
        """
        Forecast volatility using specified method

        Args:
            returns: Historical returns
            method: Forecasting method ("garch", "ewma", "historical")
            forecast_horizon: Days to forecast ahead

        Returns:
            VolatilityForecast object
        """
        forecast = VolatilityForecast(
            forecast_horizon_days=forecast_horizon,
            method=method
        )

        if len(returns) < 20:
            logger.warning("Insufficient data for volatility forecast")
            forecast.confidence = 0.0
            return forecast

        if method == "garch":
            current_vol, forecast_vol = self.calculate_garch_volatility(returns, forecast_horizon)
            forecast.current_volatility = current_vol
            forecast.forecast_volatility = forecast_vol
            forecast.confidence = 0.75  # GARCH typically reliable

        elif method == "ewma":
            ewma_vol = self.calculate_ewma_volatility(returns)
            forecast.current_volatility = ewma_vol
            forecast.forecast_volatility = ewma_vol  # EWMA doesn't forecast, assumes persistence
            forecast.confidence = 0.85  # EWMA very stable

        elif method == "historical":
            hist_vol = returns.std() * np.sqrt(252)
            forecast.current_volatility = hist_vol
            forecast.forecast_volatility = hist_vol
            forecast.confidence = 0.65  # Historical less reliable

        else:
            # Default to EWMA
            ewma_vol = self.calculate_ewma_volatility(returns)
            forecast.current_volatility = ewma_vol
            forecast.forecast_volatility = ewma_vol
            forecast.confidence = 0.80

        # Detect regime
        forecast.regime = self.detect_volatility_regime(forecast.forecast_volatility)

        # Store in history
        self.volatility_history.append(forecast.current_volatility)
        if len(self.volatility_history) > 252:  # Keep 1 year
            self.volatility_history.pop(0)

        return forecast

    def calculate_regime_position_size(
        self,
        symbol: str,
        volatility_forecast: VolatilityForecast,
        portfolio_value: float,
        current_price: float,
        stop_loss_pct: Optional[float] = None
    ) -> RegimeBasedSize:
        """
        Calculate position size based on volatility regime

        Args:
            symbol: Asset symbol
            volatility_forecast: Volatility forecast
            portfolio_value: Total portfolio value
            current_price: Current asset price
            stop_loss_pct: Custom stop loss % (optional)

        Returns:
            RegimeBasedSize object
        """
        regime = volatility_forecast.regime
        params = self.regime_params[regime]

        # Base position size using volatility-adjusted method
        # Size = (Risk per trade × Portfolio Value) / (Stop Loss × Price)

        # Determine stop loss
        if stop_loss_pct is None:
            # Calculate stop based on volatility and regime multiplier
            # Daily volatility × multiplier × √(holding period)
            daily_vol = volatility_forecast.forecast_volatility / np.sqrt(252)
            stop_loss_pct = daily_vol * params.stop_loss_multiplier * np.sqrt(5)  # 5-day holding period assumption

        # Calculate position size
        risk_amount = portfolio_value * params.risk_per_trade
        position_value = risk_amount / stop_loss_pct

        # Cap at regime max
        max_position_value = portfolio_value * params.max_position_size
        position_value = min(position_value, max_position_value)

        # Calculate base size (without regime adjustment)
        base_size = position_value / portfolio_value

        # Regime adjustment factor
        # In high vol: reduce size further
        # In low vol: can increase slightly
        regime_adjustment = self._calculate_regime_adjustment(volatility_forecast)
        regime_adjusted_value = position_value * regime_adjustment

        # Final size
        regime_adjusted_size = regime_adjusted_value / portfolio_value

        # Calculate shares
        shares = int(regime_adjusted_value / current_price)
        actual_position_value = shares * current_price

        # Risk budget used
        risk_budget_used = (actual_position_value * stop_loss_pct) / portfolio_value

        # Max expected loss
        max_loss_pct = stop_loss_pct

        adjustments = [f"regime_{regime.value}", "volatility_forecast"]

        return RegimeBasedSize(
            symbol=symbol,
            base_size=base_size,
            regime_adjusted_size=actual_position_value / portfolio_value,
            regime=regime,
            volatility_forecast=volatility_forecast.forecast_volatility,
            risk_budget_used=risk_budget_used,
            max_loss_pct=max_loss_pct,
            confidence=volatility_forecast.confidence,
            adjustments_applied=adjustments
        )

    def _calculate_regime_adjustment(self, volatility_forecast: VolatilityForecast) -> float:
        """
        Calculate regime-specific adjustment factor

        Args:
            volatility_forecast: Volatility forecast

        Returns:
            Adjustment factor (0.5 - 1.5)
        """
        regime = volatility_forecast.regime

        # Base adjustments per regime
        regime_adjustments = {
            VolatilityRegime.EXTREME_LOW: 1.2,  # Increase 20% in very low vol
            VolatilityRegime.LOW: 1.1,  # Increase 10%
            VolatilityRegime.NORMAL: 1.0,  # No adjustment
            VolatilityRegime.HIGH: 0.75,  # Reduce 25%
            VolatilityRegime.EXTREME_HIGH: 0.5  # Reduce 50%
        }

        base_adjustment = regime_adjustments.get(regime, 1.0)

        # Additional adjustment based on volatility trend
        if len(self.volatility_history) >= 10:
            recent_vol = np.mean(self.volatility_history[-10:])
            current_vol = volatility_forecast.current_volatility

            # If volatility increasing rapidly, reduce further
            vol_change = (current_vol - recent_vol) / recent_vol if recent_vol > 0 else 0

            if vol_change > 0.2:  # 20% increase
                base_adjustment *= 0.9  # Reduce by 10%
            elif vol_change < -0.2:  # 20% decrease
                base_adjustment *= 1.05  # Increase by 5%

        return base_adjustment

    def size_portfolio_dynamic(
        self,
        symbols: List[str],
        returns: pd.DataFrame,
        portfolio_value: float,
        current_prices: Dict[str, float],
        forecast_method: str = "garch",
        custom_stop_losses: Optional[Dict[str, float]] = None
    ) -> Dict[str, RegimeBasedSize]:
        """
        Size entire portfolio dynamically based on individual asset volatility regimes

        Args:
            symbols: List of asset symbols
            returns: Historical returns DataFrame
            portfolio_value: Total portfolio value
            current_prices: Current prices {symbol: price}
            forecast_method: Volatility forecasting method
            custom_stop_losses: Custom stop losses {symbol: stop_pct}

        Returns:
            Dictionary of {symbol: RegimeBasedSize}
        """
        portfolio_sizes = {}
        total_risk_budget = 0.0

        for symbol in symbols:
            if symbol not in returns.columns:
                logger.warning(f"No returns data for {symbol}")
                continue

            price = current_prices.get(symbol, 0)
            if price <= 0:
                logger.warning(f"Invalid price for {symbol}")
                continue

            # Forecast volatility
            vol_forecast = self.forecast_volatility(
                returns[symbol],
                method=forecast_method,
                forecast_horizon=1
            )

            # Calculate position size
            stop_loss = custom_stop_losses.get(symbol) if custom_stop_losses else None
            position_size = self.calculate_regime_position_size(
                symbol=symbol,
                volatility_forecast=vol_forecast,
                portfolio_value=portfolio_value,
                current_price=price,
                stop_loss_pct=stop_loss
            )

            portfolio_sizes[symbol] = position_size
            total_risk_budget += position_size.risk_budget_used

        # Check if total risk budget exceeded
        max_total_risk = 0.05  # 5% max total risk
        if total_risk_budget > max_total_risk:
            # Scale down all positions proportionally
            scale_factor = max_total_risk / total_risk_budget
            logger.warning(f"Total risk budget {total_risk_budget:.2%} exceeds limit. Scaling by {scale_factor:.2f}")

            for symbol, pos_size in portfolio_sizes.items():
                pos_size.regime_adjusted_size *= scale_factor
                pos_size.risk_budget_used *= scale_factor
                pos_size.adjustments_applied.append('risk_budget_scaling')

        return portfolio_sizes

    def detect_volatility_breakout(
        self,
        returns: pd.Series,
        threshold_std: float = 2.0
    ) -> Tuple[bool, float]:
        """
        Detect if current volatility is breaking out from normal range

        Args:
            returns: Historical returns
            threshold_std: Standard deviations for breakout (2.0 = 95% confidence)

        Returns:
            (breakout_detected, current_z_score)
        """
        if len(returns) < self.lookback_window:
            return False, 0.0

        # Calculate rolling volatility
        rolling_vol = returns.rolling(20).std() * np.sqrt(252)
        recent_vol = rolling_vol.iloc[-1]

        # Historical volatility statistics
        hist_mean = rolling_vol.mean()
        hist_std = rolling_vol.std()

        if hist_std == 0:
            return False, 0.0

        # Z-score
        z_score = (recent_vol - hist_mean) / hist_std

        breakout = abs(z_score) > threshold_std

        return breakout, float(z_score)

    def calculate_volatility_adjusted_sharpe(
        self,
        returns: pd.Series,
        volatility_forecast: VolatilityForecast
    ) -> float:
        """
        Calculate volatility-adjusted Sharpe ratio

        Uses forecast volatility instead of historical

        Args:
            returns: Historical returns
            volatility_forecast: Volatility forecast

        Returns:
            Adjusted Sharpe ratio
        """
        if len(returns) < 2:
            return 0.0

        mean_return = returns.mean() * 252  # Annualized
        forecast_vol = volatility_forecast.forecast_volatility

        if forecast_vol == 0:
            return 0.0

        sharpe = (mean_return - self.risk_free_rate) / forecast_vol

        return float(sharpe)

    def print_regime_report(
        self,
        portfolio_sizes: Dict[str, RegimeBasedSize],
        portfolio_value: float
    ):
        """
        Print regime-based sizing report

        Args:
            portfolio_sizes: Portfolio sizes dictionary
            portfolio_value: Total portfolio value
        """
        print("\n" + "="*90)
        print("DYNAMIC VOLATILITY REGIME-BASED POSITION SIZING")
        print("="*90)
        print(f"Portfolio Value: ${portfolio_value:,.0f}")
        print(f"Timestamp: {datetime.now().isoformat()}")
        print()

        # Count positions by regime
        regime_counts = {}
        for pos_size in portfolio_sizes.values():
            regime = pos_size.regime
            regime_counts[regime] = regime_counts.get(regime, 0) + 1

        print("REGIME DISTRIBUTION:")
        for regime, count in sorted(regime_counts.items(), key=lambda x: x[1], reverse=True):
            print(f"  {regime.value:15s}: {count} positions")
        print()

        # Total risk budget
        total_risk = sum(ps.risk_budget_used for ps in portfolio_sizes.values())
        total_exposure = sum(ps.regime_adjusted_size for ps in portfolio_sizes.values())

        print("PORTFOLIO RISK METRICS:")
        print(f"  Total Exposure: {total_exposure:.2%}")
        print(f"  Total Risk Budget Used: {total_risk:.2%}")
        print(f"  Number of Positions: {len(portfolio_sizes)}")
        print()

        print("POSITION DETAILS:")
        print(f"{'Symbol':<8} {'Regime':<13} {'Size':<8} {'Vol Fcst':<10} {'Risk':<8} {'Max Loss':<10} {'Confidence'}")
        print("-" * 90)

        sorted_positions = sorted(
            portfolio_sizes.items(),
            key=lambda x: x[1].regime_adjusted_size,
            reverse=True
        )

        for symbol, pos_size in sorted_positions:
            print(f"{symbol:<8} {pos_size.regime.value:<13} {pos_size.regime_adjusted_size:>7.2%} "
                  f"{pos_size.volatility_forecast:>9.1%} {pos_size.risk_budget_used:>7.2%} "
                  f"{pos_size.max_loss_pct:>9.2%} {pos_size.confidence:>10.1%}")

        print("="*90 + "\n")


# Example usage
if __name__ == "__main__":
    print("Dynamic Volatility-Based Position Sizer Example")
    print("="*90)

    # Generate sample data with varying volatility regimes
    np.random.seed(42)
    n_days = 252

    symbols = ['LOW_VOL', 'NORMAL_VOL', 'HIGH_VOL', 'MIXED_VOL']

    # Create returns with different volatility profiles
    returns_data = {
        'LOW_VOL': np.random.normal(0.0005, 0.008, n_days),  # ~12% annual vol
        'NORMAL_VOL': np.random.normal(0.0005, 0.015, n_days),  # ~24% annual vol
        'HIGH_VOL': np.random.normal(0.0005, 0.025, n_days),  # ~40% annual vol
    }

    # Mixed volatility: low first half, high second half (regime change)
    mixed = np.concatenate([
        np.random.normal(0.0005, 0.010, n_days // 2),
        np.random.normal(0.0005, 0.030, n_days // 2)
    ])
    returns_data['MIXED_VOL'] = mixed

    returns = pd.DataFrame(returns_data)

    # Portfolio setup
    portfolio_value = 100000.0
    current_prices = {
        'LOW_VOL': 150.0,
        'NORMAL_VOL': 250.0,
        'HIGH_VOL': 80.0,
        'MIXED_VOL': 180.0
    }

    # Initialize sizer
    sizer = DynamicVolatilitySizer(lookback_window=60, ewma_lambda=0.94)

    # Test volatility forecasting
    print("\n1. VOLATILITY FORECASTS")
    print("-" * 90)
    for symbol in symbols:
        forecast = sizer.forecast_volatility(returns[symbol], method="garch")
        print(f"{symbol:12s}: Current={forecast.current_volatility:.1%}, "
              f"Forecast={forecast.forecast_volatility:.1%}, "
              f"Regime={forecast.regime.value}, "
              f"Confidence={forecast.confidence:.0%}")

    # Test dynamic portfolio sizing
    print("\n2. DYNAMIC REGIME-BASED PORTFOLIO SIZING")
    print("-" * 90)
    portfolio_sizes = sizer.size_portfolio_dynamic(
        symbols=symbols,
        returns=returns,
        portfolio_value=portfolio_value,
        current_prices=current_prices,
        forecast_method="garch"
    )
    sizer.print_regime_report(portfolio_sizes, portfolio_value)

    # Test volatility breakout detection
    print("\n3. VOLATILITY BREAKOUT DETECTION")
    print("-" * 90)
    for symbol in symbols:
        breakout, z_score = sizer.detect_volatility_breakout(returns[symbol])
        status = "⚠️ BREAKOUT" if breakout else "✓ Normal"
        print(f"{symbol:12s}: {status:15s} (Z-score: {z_score:+.2f})")

    print("\n" + "="*90)
