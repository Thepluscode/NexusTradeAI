"""
Execution Algorithms
====================
Institutional-grade execution algorithms (VWAP, TWAP, POV, etc.)

Author: NexusTradeAI Execution Team
Version: 1.0
Date: December 25, 2024

Features:
- VWAP (Volume-Weighted Average Price) execution
- TWAP (Time-Weighted Average Price) execution
- POV (Percentage of Volume) execution
- Implementation Shortfall optimization
- Adaptive execution
- Schedule generation
- Real-time execution monitoring
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class AlgorithmType(Enum):
    """Execution algorithm types"""
    VWAP = "vwap"  # Volume-Weighted Average Price
    TWAP = "twap"  # Time-Weighted Average Price
    POV = "pov"  # Percentage of Volume
    IS = "is"  # Implementation Shortfall
    ADAPTIVE = "adaptive"  # Adaptive execution
    ARRIVAL = "arrival"  # Arrival price
    CLOSE = "close"  # Market on Close


@dataclass
class ExecutionSlice:
    """Single execution slice"""
    slice_number: int
    start_time: datetime
    end_time: datetime
    target_shares: int
    max_shares: int  # Maximum shares allowed
    target_participation_rate: float  # Target % of volume
    urgency: float  # 0-1, higher = more urgent

    # Execution results (filled after execution)
    actual_shares: int = 0
    actual_price: float = 0.0
    actual_volume: int = 0  # Market volume during slice
    filled: bool = False

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'slice_number': self.slice_number,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'target_shares': self.target_shares,
            'max_shares': self.max_shares,
            'target_participation_rate': self.target_participation_rate,
            'urgency': self.urgency,
            'actual_shares': self.actual_shares,
            'actual_price': self.actual_price,
            'filled': self.filled
        }


@dataclass
class ExecutionSchedule:
    """Complete execution schedule"""
    algorithm: AlgorithmType
    symbol: str
    side: str  # "buy" or "sell"
    total_shares: int
    start_time: datetime
    end_time: datetime
    slices: List[ExecutionSlice]

    # Schedule parameters
    avg_daily_volume: float
    target_participation_rate: float
    min_slice_duration_seconds: int = 60  # Min 1 minute per slice

    def get_total_target_shares(self) -> int:
        """Get total target shares across all slices"""
        return sum(s.target_shares for s in self.slices)

    def get_total_executed_shares(self) -> int:
        """Get total executed shares"""
        return sum(s.actual_shares for s in self.slices)

    def get_fill_rate(self) -> float:
        """Get overall fill rate"""
        if self.total_shares == 0:
            return 0.0
        return self.get_total_executed_shares() / self.total_shares

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'algorithm': self.algorithm.value,
            'symbol': self.symbol,
            'side': self.side,
            'total_shares': self.total_shares,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat(),
            'slices': [s.to_dict() for s in self.slices],
            'avg_daily_volume': self.avg_daily_volume,
            'target_participation_rate': self.target_participation_rate
        }


class ExecutionAlgorithm:
    """
    Base class for execution algorithms
    """

    def __init__(self):
        """Initialize execution algorithm"""
        logger.info("Initialized ExecutionAlgorithm")

    def generate_twap_schedule(
        self,
        symbol: str,
        side: str,
        total_shares: int,
        start_time: datetime,
        end_time: datetime,
        num_slices: Optional[int] = None,
        slice_duration_minutes: Optional[int] = None
    ) -> ExecutionSchedule:
        """
        Generate TWAP (Time-Weighted Average Price) execution schedule

        TWAP: Split order evenly across time intervals
        - Simple and predictable
        - Ignores volume patterns
        - Good for: Illiquid stocks, avoiding pattern detection

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            total_shares: Total shares to execute
            start_time: Start time
            end_time: End time
            num_slices: Number of slices (optional)
            slice_duration_minutes: Duration per slice (optional)

        Returns:
            ExecutionSchedule with TWAP slices
        """
        total_duration = (end_time - start_time).total_seconds()

        # Determine number of slices
        if num_slices is None:
            if slice_duration_minutes is None:
                slice_duration_minutes = 5  # Default 5 minutes
            num_slices = int(total_duration / (slice_duration_minutes * 60))

        num_slices = max(1, num_slices)  # At least 1 slice

        # Equal shares per slice
        shares_per_slice = total_shares // num_slices
        remaining_shares = total_shares - (shares_per_slice * num_slices)

        # Time per slice
        slice_duration_seconds = total_duration / num_slices

        slices = []
        current_time = start_time

        for i in range(num_slices):
            slice_end = current_time + timedelta(seconds=slice_duration_seconds)

            # Add remainder to last slice
            target_shares = shares_per_slice
            if i == num_slices - 1:
                target_shares += remaining_shares

            slice_obj = ExecutionSlice(
                slice_number=i + 1,
                start_time=current_time,
                end_time=slice_end,
                target_shares=target_shares,
                max_shares=int(target_shares * 1.2),  # 20% buffer
                target_participation_rate=0.0,  # TWAP doesn't use participation
                urgency=0.5  # Neutral urgency
            )

            slices.append(slice_obj)
            current_time = slice_end

        schedule = ExecutionSchedule(
            algorithm=AlgorithmType.TWAP,
            symbol=symbol,
            side=side,
            total_shares=total_shares,
            start_time=start_time,
            end_time=end_time,
            slices=slices,
            avg_daily_volume=0.0,  # Not used for TWAP
            target_participation_rate=0.0
        )

        logger.info(f"Generated TWAP schedule: {num_slices} slices over {total_duration/60:.1f} minutes")
        return schedule

    def generate_vwap_schedule(
        self,
        symbol: str,
        side: str,
        total_shares: int,
        start_time: datetime,
        end_time: datetime,
        historical_volume_profile: pd.DataFrame,
        num_slices: int = 10
    ) -> ExecutionSchedule:
        """
        Generate VWAP (Volume-Weighted Average Price) execution schedule

        VWAP: Trade in proportion to historical volume patterns
        - Mimics natural market volume
        - Lower market impact
        - Good for: Liquid stocks, large orders

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            total_shares: Total shares to execute
            start_time: Start time
            end_time: End time
            historical_volume_profile: DataFrame with columns ['time', 'volume_pct']
            num_slices: Number of time slices

        Returns:
            ExecutionSchedule with VWAP slices
        """
        total_duration = (end_time - start_time).total_seconds()
        slice_duration_seconds = total_duration / num_slices

        # If no volume profile provided, use U-shaped pattern
        if historical_volume_profile.empty:
            # Typical intraday volume: high at open/close, low midday
            volume_profile = self._generate_default_volume_profile(num_slices)
        else:
            # Use provided volume profile
            volume_profile = historical_volume_profile['volume_pct'].values[:num_slices]
            volume_profile = volume_profile / np.sum(volume_profile)  # Normalize

        slices = []
        current_time = start_time

        for i in range(num_slices):
            slice_end = current_time + timedelta(seconds=slice_duration_seconds)

            # Shares proportional to expected volume
            target_shares = int(total_shares * volume_profile[i])

            slice_obj = ExecutionSlice(
                slice_number=i + 1,
                start_time=current_time,
                end_time=slice_end,
                target_shares=target_shares,
                max_shares=int(target_shares * 1.5),  # 50% buffer for VWAP
                target_participation_rate=0.10,  # Default 10% POV
                urgency=volume_profile[i]  # Higher volume = higher urgency
            )

            slices.append(slice_obj)
            current_time = slice_end

        # Adjust last slice to ensure all shares allocated
        total_allocated = sum(s.target_shares for s in slices)
        if total_allocated != total_shares:
            slices[-1].target_shares += (total_shares - total_allocated)
            slices[-1].max_shares = int(slices[-1].target_shares * 1.5)

        schedule = ExecutionSchedule(
            algorithm=AlgorithmType.VWAP,
            symbol=symbol,
            side=side,
            total_shares=total_shares,
            start_time=start_time,
            end_time=end_time,
            slices=slices,
            avg_daily_volume=0.0,  # Would be set from market data
            target_participation_rate=0.10
        )

        logger.info(f"Generated VWAP schedule: {num_slices} slices following volume profile")
        return schedule

    def _generate_default_volume_profile(self, num_slices: int) -> np.ndarray:
        """
        Generate default U-shaped intraday volume profile

        Args:
            num_slices: Number of time slices

        Returns:
            Volume percentages (normalized)
        """
        # U-shaped curve: high at start, low in middle, high at end
        x = np.linspace(0, 1, num_slices)
        # Quadratic U-shape: y = 2x² - 2x + 1
        volume = 2 * x**2 - 2 * x + 1

        # Normalize
        volume = volume / np.sum(volume)

        return volume

    def generate_pov_schedule(
        self,
        symbol: str,
        side: str,
        total_shares: int,
        start_time: datetime,
        end_time: datetime,
        target_participation_rate: float = 0.10,
        avg_daily_volume: float = 1000000,
        num_slices: int = 10
    ) -> ExecutionSchedule:
        """
        Generate POV (Percentage of Volume) execution schedule

        POV: Trade fixed percentage of market volume
        - Adaptive to market conditions
        - Controls market impact
        - Good for: Moderate urgency, liquid markets

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            total_shares: Total shares to execute
            start_time: Start time
            end_time: End time
            target_participation_rate: Target % of volume (e.g., 0.10 = 10%)
            avg_daily_volume: Average daily volume
            num_slices: Number of time slices

        Returns:
            ExecutionSchedule with POV slices
        """
        total_duration = (end_time - start_time).total_seconds()
        slice_duration_seconds = total_duration / num_slices

        # Expected volume per slice (assuming 6.5 hour trading day)
        volume_per_second = avg_daily_volume / (6.5 * 3600)
        expected_volume_per_slice = volume_per_second * slice_duration_seconds

        # Target shares per slice (POV × expected volume)
        target_shares_per_slice = int(expected_volume_per_slice * target_participation_rate)

        slices = []
        current_time = start_time
        remaining_shares = total_shares

        for i in range(num_slices):
            slice_end = current_time + timedelta(seconds=slice_duration_seconds)

            # Cap at remaining shares
            target_shares = min(target_shares_per_slice, remaining_shares)

            slice_obj = ExecutionSlice(
                slice_number=i + 1,
                start_time=current_time,
                end_time=slice_end,
                target_shares=target_shares,
                max_shares=int(target_shares * 2.0),  # 100% buffer (can catch up)
                target_participation_rate=target_participation_rate,
                urgency=0.6  # Moderate urgency
            )

            slices.append(slice_obj)
            remaining_shares -= target_shares
            current_time = slice_end

            # Stop if all shares allocated
            if remaining_shares <= 0:
                break

        # If shares remaining, add to last slice
        if remaining_shares > 0 and slices:
            slices[-1].target_shares += remaining_shares
            slices[-1].max_shares = int(slices[-1].target_shares * 2.0)

        schedule = ExecutionSchedule(
            algorithm=AlgorithmType.POV,
            symbol=symbol,
            side=side,
            total_shares=total_shares,
            start_time=start_time,
            end_time=end_time,
            slices=slices,
            avg_daily_volume=avg_daily_volume,
            target_participation_rate=target_participation_rate
        )

        logger.info(f"Generated POV schedule: {len(slices)} slices at {target_participation_rate:.1%} participation")
        return schedule

    def generate_is_optimal_schedule(
        self,
        symbol: str,
        side: str,
        total_shares: int,
        start_time: datetime,
        end_time: datetime,
        volatility: float,
        permanent_impact_coef: float = 0.1,
        temporary_impact_coef: float = 0.01,
        risk_aversion: float = 1.0,
        num_slices: int = 10
    ) -> ExecutionSchedule:
        """
        Generate Implementation Shortfall optimal execution schedule
        (Almgren-Chriss model)

        Minimizes: Expected Cost + (Risk Aversion × Variance of Cost)

        Trade-off:
        - Fast execution → High market impact, low price risk
        - Slow execution → Low market impact, high price risk

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            total_shares: Total shares to execute
            start_time: Start time
            end_time: End time
            volatility: Daily volatility
            permanent_impact_coef: Permanent impact coefficient
            temporary_impact_coef: Temporary impact coefficient
            risk_aversion: Risk aversion parameter (higher = more conservative)
            num_slices: Number of time slices

        Returns:
            ExecutionSchedule with IS-optimal slices
        """
        total_duration = (end_time - start_time).total_seconds()
        slice_duration = total_duration / num_slices

        # Almgren-Chriss optimal trajectory
        # Simplified version: exponential decay with risk aversion

        # Calculate optimal decay rate
        # κ = √(2λσ² / (η × T))
        # where λ = risk aversion, σ = volatility, η = impact, T = time
        kappa = np.sqrt(2 * risk_aversion * (volatility ** 2) / (permanent_impact_coef * total_duration))

        # Optimal trajectory: n(t) = n₀ × sinh(κ(T-t)) / sinh(κT)
        # where n(t) = remaining shares at time t

        times = np.linspace(0, total_duration, num_slices + 1)
        kappa_T = kappa * total_duration

        # Remaining shares at each time
        if kappa_T < 0.01:
            # Linear when kappa very small (risk-neutral)
            remaining = total_shares * (1 - times / total_duration)
        else:
            remaining = total_shares * np.sinh(kappa * (total_duration - times)) / np.sinh(kappa_T)

        slices = []
        current_time = start_time

        for i in range(num_slices):
            slice_end = current_time + timedelta(seconds=slice_duration)

            # Shares to trade in this slice
            target_shares = int(remaining[i] - remaining[i + 1])

            # Urgency increases as we get closer to deadline
            urgency = float(i / num_slices)

            slice_obj = ExecutionSlice(
                slice_number=i + 1,
                start_time=current_time,
                end_time=slice_end,
                target_shares=target_shares,
                max_shares=int(target_shares * 1.3),
                target_participation_rate=0.0,  # Not used for IS
                urgency=urgency
            )

            slices.append(slice_obj)
            current_time = slice_end

        schedule = ExecutionSchedule(
            algorithm=AlgorithmType.IS,
            symbol=symbol,
            side=side,
            total_shares=total_shares,
            start_time=start_time,
            end_time=end_time,
            slices=slices,
            avg_daily_volume=0.0,
            target_participation_rate=0.0
        )

        logger.info(f"Generated IS-optimal schedule: {num_slices} slices with risk aversion={risk_aversion}")
        return schedule

    def print_schedule_summary(self, schedule: ExecutionSchedule):
        """
        Print execution schedule summary

        Args:
            schedule: Execution schedule
        """
        print("\n" + "="*80)
        print(f"EXECUTION SCHEDULE: {schedule.algorithm.value.upper()}")
        print("="*80)
        print(f"Symbol: {schedule.symbol}")
        print(f"Side: {schedule.side.upper()}")
        print(f"Total Shares: {schedule.total_shares:,}")
        print(f"Start: {schedule.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"End: {schedule.end_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Duration: {(schedule.end_time - schedule.start_time).total_seconds() / 60:.1f} minutes")
        print(f"Number of Slices: {len(schedule.slices)}")
        print()

        print("SLICE SCHEDULE:")
        print(f"{'Slice':<6} {'Start':<12} {'End':<12} {'Target Shares':<15} {'% of Total':<12} {'Urgency'}")
        print("-" * 80)

        for slice_obj in schedule.slices[:10]:  # Show first 10
            start_str = slice_obj.start_time.strftime('%H:%M:%S')
            end_str = slice_obj.end_time.strftime('%H:%M:%S')
            pct_of_total = (slice_obj.target_shares / schedule.total_shares) * 100

            print(f"{slice_obj.slice_number:<6} {start_str:<12} {end_str:<12} "
                  f"{slice_obj.target_shares:<15,} {pct_of_total:<11.1f}% {slice_obj.urgency:.2f}")

        if len(schedule.slices) > 10:
            print(f"... and {len(schedule.slices) - 10} more slices")

        print("="*80 + "\n")


# Example usage
if __name__ == "__main__":
    print("Execution Algorithms Example")
    print("="*80)

    # Setup
    symbol = "AAPL"
    side = "buy"
    total_shares = 100000
    start_time = datetime.now()
    end_time = start_time + timedelta(hours=2)

    algo = ExecutionAlgorithm()

    # 1. TWAP Schedule
    print("\n1. TWAP (Time-Weighted Average Price)")
    print("-" * 80)
    twap_schedule = algo.generate_twap_schedule(
        symbol=symbol,
        side=side,
        total_shares=total_shares,
        start_time=start_time,
        end_time=end_time,
        slice_duration_minutes=10
    )
    algo.print_schedule_summary(twap_schedule)

    # 2. VWAP Schedule
    print("\n2. VWAP (Volume-Weighted Average Price)")
    print("-" * 80)
    vwap_schedule = algo.generate_vwap_schedule(
        symbol=symbol,
        side=side,
        total_shares=total_shares,
        start_time=start_time,
        end_time=end_time,
        historical_volume_profile=pd.DataFrame(),  # Will use default U-shape
        num_slices=12
    )
    algo.print_schedule_summary(vwap_schedule)

    # 3. POV Schedule
    print("\n3. POV (Percentage of Volume)")
    print("-" * 80)
    pov_schedule = algo.generate_pov_schedule(
        symbol=symbol,
        side=side,
        total_shares=total_shares,
        start_time=start_time,
        end_time=end_time,
        target_participation_rate=0.10,  # 10% of volume
        avg_daily_volume=50_000_000,
        num_slices=10
    )
    algo.print_schedule_summary(pov_schedule)

    # 4. Implementation Shortfall Optimal
    print("\n4. Implementation Shortfall Optimal (Almgren-Chriss)")
    print("-" * 80)
    is_schedule = algo.generate_is_optimal_schedule(
        symbol=symbol,
        side=side,
        total_shares=total_shares,
        start_time=start_time,
        end_time=end_time,
        volatility=0.25,  # 25% annual vol
        risk_aversion=1.0,
        num_slices=10
    )
    algo.print_schedule_summary(is_schedule)

    print("\n" + "="*80)
