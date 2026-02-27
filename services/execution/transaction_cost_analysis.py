"""
Transaction Cost Analysis (TCA)
================================
Institutional-grade transaction cost analysis and measurement.

Author: NexusTradeAI Execution Team
Version: 1.0
Date: December 25, 2024

Features:
- Implementation shortfall measurement
- Slippage analysis (realized vs. expected)
- VWAP/TWAP benchmark comparison
- Multi-component cost decomposition
- Trade quality scoring
- Venue performance analysis
- Historical TCA reporting
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class CostComponent(Enum):
    """Transaction cost components"""
    SPREAD = "spread"  # Bid-ask spread cost
    MARKET_IMPACT = "market_impact"  # Price impact
    SLIPPAGE = "slippage"  # Execution price vs. arrival price
    DELAY = "delay"  # Delay cost (decision to execution)
    OPPORTUNITY = "opportunity"  # Unfilled orders
    TIMING = "timing"  # Timing risk
    TOTAL = "total"  # Total cost


class Benchmark(Enum):
    """TCA benchmarks"""
    ARRIVAL_PRICE = "arrival_price"  # Price when decision made
    OPEN_PRICE = "open_price"  # Day's opening price
    CLOSE_PRICE = "close_price"  # Day's closing price
    VWAP = "vwap"  # Volume-weighted average price
    TWAP = "twap"  # Time-weighted average price
    PREVIOUS_CLOSE = "previous_close"  # Previous day's close


@dataclass
class ExecutionMetrics:
    """Execution metrics for a single trade"""
    # Trade identification
    trade_id: str
    symbol: str
    side: str  # "buy" or "sell"
    timestamp: datetime

    # Order details
    order_shares: int
    filled_shares: int
    fill_rate: float  # Filled / Ordered

    # Prices
    decision_price: float  # Price when decision made
    arrival_price: float  # Price when order sent
    execution_price: float  # Weighted average fill price
    benchmark_price: float  # Benchmark price (e.g., VWAP)

    # Timing
    decision_time: datetime
    arrival_time: datetime
    start_time: datetime
    end_time: datetime
    duration_seconds: float

    # Costs (in basis points)
    spread_cost_bps: float = 0.0
    impact_cost_bps: float = 0.0
    delay_cost_bps: float = 0.0
    slippage_bps: float = 0.0
    total_cost_bps: float = 0.0

    # Costs (in dollars)
    spread_cost_usd: float = 0.0
    impact_cost_usd: float = 0.0
    delay_cost_usd: float = 0.0
    slippage_usd: float = 0.0
    total_cost_usd: float = 0.0

    # Quality metrics
    trade_quality_score: float = 0.0  # 0-100
    vs_vwap_bps: float = 0.0  # Performance vs. VWAP
    vs_twap_bps: float = 0.0  # Performance vs. TWAP

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'trade_id': self.trade_id,
            'symbol': self.symbol,
            'side': self.side,
            'timestamp': self.timestamp.isoformat(),
            'order_shares': self.order_shares,
            'filled_shares': self.filled_shares,
            'fill_rate': self.fill_rate,
            'decision_price': self.decision_price,
            'arrival_price': self.arrival_price,
            'execution_price': self.execution_price,
            'benchmark_price': self.benchmark_price,
            'duration_seconds': self.duration_seconds,
            'spread_cost_bps': self.spread_cost_bps,
            'impact_cost_bps': self.impact_cost_bps,
            'delay_cost_bps': self.delay_cost_bps,
            'slippage_bps': self.slippage_bps,
            'total_cost_bps': self.total_cost_bps,
            'total_cost_usd': self.total_cost_usd,
            'trade_quality_score': self.trade_quality_score,
            'vs_vwap_bps': self.vs_vwap_bps,
            'vs_twap_bps': self.vs_twap_bps
        }


@dataclass
class AggregatedTCA:
    """Aggregated TCA metrics across multiple trades"""
    period: str
    num_trades: int
    total_volume: int
    total_value: float

    # Average costs (bps)
    avg_spread_cost_bps: float
    avg_impact_cost_bps: float
    avg_delay_cost_bps: float
    avg_slippage_bps: float
    avg_total_cost_bps: float

    # Cost distribution
    median_cost_bps: float
    cost_std_bps: float
    cost_95th_percentile_bps: float

    # Total costs (USD)
    total_cost_usd: float

    # Quality metrics
    avg_trade_quality: float
    avg_fill_rate: float
    avg_vs_vwap_bps: float

    # Best/worst
    best_trade_bps: float
    worst_trade_bps: float


class TransactionCostAnalyzer:
    """
    Comprehensive transaction cost analysis system
    """

    def __init__(self):
        """Initialize TCA analyzer"""
        self.execution_history: List[ExecutionMetrics] = []
        logger.info("Initialized TransactionCostAnalyzer")

    def calculate_implementation_shortfall(
        self,
        symbol: str,
        side: str,
        decision_price: float,
        execution_price: float,
        shares: int,
        decision_time: datetime,
        execution_time: datetime,
        benchmark_price: Optional[float] = None
    ) -> ExecutionMetrics:
        """
        Calculate implementation shortfall (IS)

        Implementation Shortfall = Paper Portfolio P&L - Actual Portfolio P&L

        Components:
        1. Delay Cost: (Arrival Price - Decision Price) × Shares
        2. Impact Cost: (Execution Price - Arrival Price) × Shares
        3. Opportunity Cost: (Close Price - Decision Price) × Unfilled Shares

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            decision_price: Price when decision was made
            execution_price: Weighted average execution price
            shares: Number of shares traded
            decision_time: Time of trading decision
            execution_time: Time of execution completion
            benchmark_price: Benchmark price (optional, uses decision_price if None)

        Returns:
            ExecutionMetrics object
        """
        # Assumption: arrival_price = decision_price (immediate submission)
        arrival_price = decision_price

        if benchmark_price is None:
            benchmark_price = decision_price

        # Direction multiplier (buy = +1, sell = -1)
        direction = 1 if side.lower() == "buy" else -1

        metrics = ExecutionMetrics(
            trade_id=f"{symbol}_{execution_time.timestamp()}",
            symbol=symbol,
            side=side,
            timestamp=execution_time,
            order_shares=shares,
            filled_shares=shares,
            fill_rate=1.0,
            decision_price=decision_price,
            arrival_price=arrival_price,
            execution_price=execution_price,
            benchmark_price=benchmark_price,
            decision_time=decision_time,
            arrival_time=decision_time,  # Assuming immediate
            start_time=decision_time,
            end_time=execution_time,
            duration_seconds=(execution_time - decision_time).total_seconds()
        )

        # 1. Delay Cost (Decision → Arrival)
        # For buy: if arrival > decision, we paid more (cost)
        # For sell: if arrival < decision, we got less (cost)
        delay_cost = direction * (arrival_price - decision_price) * shares
        metrics.delay_cost_usd = delay_cost
        metrics.delay_cost_bps = (delay_cost / (decision_price * shares)) * 10000

        # 2. Market Impact Cost (Arrival → Execution)
        # For buy: if execution > arrival, impact pushed price up (cost)
        # For sell: if execution < arrival, impact pushed price down (cost)
        impact_cost = direction * (execution_price - arrival_price) * shares
        metrics.impact_cost_usd = impact_cost
        metrics.impact_cost_bps = (impact_cost / (arrival_price * shares)) * 10000

        # 3. Spread Cost (half-spread crossing)
        # Typically 50% of bid-ask spread
        # Estimated as 0.5% of trade value (placeholder)
        spread_cost = 0.0005 * (execution_price * shares)
        metrics.spread_cost_usd = spread_cost
        metrics.spread_cost_bps = 5.0  # 5 bps estimate

        # Total Cost
        metrics.total_cost_usd = delay_cost + impact_cost + spread_cost
        metrics.total_cost_bps = (metrics.total_cost_usd / (decision_price * shares)) * 10000

        # Slippage (execution vs. arrival)
        metrics.slippage_bps = metrics.impact_cost_bps

        # Trade quality score (0-100, higher is better)
        # Based on total cost vs. typical costs
        typical_cost_bps = 10.0  # Typical cost is ~10 bps
        if metrics.total_cost_bps < typical_cost_bps:
            metrics.trade_quality_score = 100 - (metrics.total_cost_bps / typical_cost_bps * 50)
        else:
            metrics.trade_quality_score = max(0, 50 - (metrics.total_cost_bps - typical_cost_bps))

        # Store
        self.execution_history.append(metrics)

        return metrics

    def calculate_slippage(
        self,
        expected_price: float,
        actual_price: float,
        shares: int,
        side: str
    ) -> Tuple[float, float]:
        """
        Calculate slippage (difference between expected and actual execution)

        Args:
            expected_price: Expected execution price
            actual_price: Actual execution price
            shares: Number of shares
            side: "buy" or "sell"

        Returns:
            (slippage_bps, slippage_usd)
        """
        direction = 1 if side.lower() == "buy" else -1

        # Slippage cost
        slippage_usd = direction * (actual_price - expected_price) * shares

        # In basis points
        slippage_bps = (slippage_usd / (expected_price * shares)) * 10000

        return slippage_bps, slippage_usd

    def compare_to_vwap(
        self,
        execution_price: float,
        vwap_price: float,
        shares: int,
        side: str
    ) -> float:
        """
        Compare execution price to VWAP benchmark

        Args:
            execution_price: Actual execution price
            vwap_price: VWAP benchmark price
            shares: Number of shares
            side: "buy" or "sell"

        Returns:
            Performance vs. VWAP in basis points (negative = beat VWAP)
        """
        direction = 1 if side.lower() == "buy" else -1

        # For buy: execution < VWAP is good (negative)
        # For sell: execution > VWAP is good (negative)
        diff_usd = direction * (execution_price - vwap_price) * shares

        # In basis points
        vs_vwap_bps = (diff_usd / (vwap_price * shares)) * 10000

        return vs_vwap_bps

    def compare_to_twap(
        self,
        execution_price: float,
        twap_price: float,
        shares: int,
        side: str
    ) -> float:
        """
        Compare execution price to TWAP benchmark

        Args:
            execution_price: Actual execution price
            twap_price: TWAP benchmark price
            shares: Number of shares
            side: "buy" or "sell"

        Returns:
            Performance vs. TWAP in basis points (negative = beat TWAP)
        """
        direction = 1 if side.lower() == "buy" else -1

        diff_usd = direction * (execution_price - twap_price) * shares
        vs_twap_bps = (diff_usd / (twap_price * shares)) * 10000

        return vs_twap_bps

    def decompose_costs(
        self,
        metrics: ExecutionMetrics
    ) -> Dict[str, Tuple[float, float]]:
        """
        Decompose total cost into components

        Args:
            metrics: Execution metrics

        Returns:
            Dictionary of {component: (bps, usd)}
        """
        return {
            CostComponent.SPREAD.value: (metrics.spread_cost_bps, metrics.spread_cost_usd),
            CostComponent.MARKET_IMPACT.value: (metrics.impact_cost_bps, metrics.impact_cost_usd),
            CostComponent.DELAY.value: (metrics.delay_cost_bps, metrics.delay_cost_usd),
            CostComponent.SLIPPAGE.value: (metrics.slippage_bps, metrics.slippage_usd),
            CostComponent.TOTAL.value: (metrics.total_cost_bps, metrics.total_cost_usd)
        }

    def aggregate_tca(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        symbol: Optional[str] = None
    ) -> AggregatedTCA:
        """
        Aggregate TCA metrics over period

        Args:
            start_date: Start date (None = all history)
            end_date: End date (None = now)
            symbol: Filter by symbol (None = all)

        Returns:
            AggregatedTCA object
        """
        # Filter trades
        trades = self.execution_history

        if start_date:
            trades = [t for t in trades if t.timestamp >= start_date]

        if end_date:
            trades = [t for t in trades if t.timestamp <= end_date]

        if symbol:
            trades = [t for t in trades if t.symbol == symbol]

        if not trades:
            return AggregatedTCA(
                period=f"{start_date} to {end_date}" if start_date and end_date else "No data",
                num_trades=0,
                total_volume=0,
                total_value=0.0,
                avg_spread_cost_bps=0.0,
                avg_impact_cost_bps=0.0,
                avg_delay_cost_bps=0.0,
                avg_slippage_bps=0.0,
                avg_total_cost_bps=0.0,
                median_cost_bps=0.0,
                cost_std_bps=0.0,
                cost_95th_percentile_bps=0.0,
                total_cost_usd=0.0,
                avg_trade_quality=0.0,
                avg_fill_rate=0.0,
                avg_vs_vwap_bps=0.0,
                best_trade_bps=0.0,
                worst_trade_bps=0.0
            )

        # Aggregate metrics
        total_volume = sum(t.filled_shares for t in trades)
        total_value = sum(t.filled_shares * t.execution_price for t in trades)

        # Average costs
        avg_spread = np.mean([t.spread_cost_bps for t in trades])
        avg_impact = np.mean([t.impact_cost_bps for t in trades])
        avg_delay = np.mean([t.delay_cost_bps for t in trades])
        avg_slippage = np.mean([t.slippage_bps for t in trades])
        avg_total = np.mean([t.total_cost_bps for t in trades])

        # Distribution
        total_costs = [t.total_cost_bps for t in trades]
        median_cost = np.median(total_costs)
        cost_std = np.std(total_costs)
        cost_95th = np.percentile(total_costs, 95)

        # Total cost USD
        total_cost_usd = sum(t.total_cost_usd for t in trades)

        # Quality metrics
        avg_quality = np.mean([t.trade_quality_score for t in trades])
        avg_fill_rate = np.mean([t.fill_rate for t in trades])
        avg_vs_vwap = np.mean([t.vs_vwap_bps for t in trades])

        # Best/worst
        best_trade = min(total_costs)
        worst_trade = max(total_costs)

        period_str = f"{start_date.date() if start_date else 'inception'} to {end_date.date() if end_date else 'now'}"

        return AggregatedTCA(
            period=period_str,
            num_trades=len(trades),
            total_volume=total_volume,
            total_value=total_value,
            avg_spread_cost_bps=avg_spread,
            avg_impact_cost_bps=avg_impact,
            avg_delay_cost_bps=avg_delay,
            avg_slippage_bps=avg_slippage,
            avg_total_cost_bps=avg_total,
            median_cost_bps=median_cost,
            cost_std_bps=cost_std,
            cost_95th_percentile_bps=cost_95th,
            total_cost_usd=total_cost_usd,
            avg_trade_quality=avg_quality,
            avg_fill_rate=avg_fill_rate,
            avg_vs_vwap_bps=avg_vs_vwap,
            best_trade_bps=best_trade,
            worst_trade_bps=worst_trade
        )

    def get_tca_report(
        self,
        days: int = 30,
        symbol: Optional[str] = None
    ) -> pd.DataFrame:
        """
        Generate TCA report for recent trades

        Args:
            days: Number of days to include
            symbol: Filter by symbol (optional)

        Returns:
            DataFrame with TCA metrics
        """
        cutoff = datetime.now() - timedelta(days=days)

        # Filter trades
        trades = [t for t in self.execution_history if t.timestamp >= cutoff]

        if symbol:
            trades = [t for t in trades if t.symbol == symbol]

        # Convert to DataFrame
        data = [t.to_dict() for t in trades]
        df = pd.DataFrame(data)

        if not df.empty:
            # Sort by timestamp
            df['timestamp'] = pd.to_datetime(df['timestamp'])
            df = df.sort_values('timestamp', ascending=False)

        return df

    def analyze_venue_performance(
        self,
        venue_trades: Dict[str, List[ExecutionMetrics]]
    ) -> pd.DataFrame:
        """
        Analyze execution performance by venue

        Args:
            venue_trades: Dictionary of {venue_name: [trades]}

        Returns:
            DataFrame comparing venues
        """
        venue_stats = []

        for venue, trades in venue_trades.items():
            if not trades:
                continue

            total_costs = [t.total_cost_bps for t in trades]

            venue_stats.append({
                'Venue': venue,
                'Trades': len(trades),
                'Avg Cost (bps)': np.mean(total_costs),
                'Median Cost (bps)': np.median(total_costs),
                'Std Dev (bps)': np.std(total_costs),
                'Best (bps)': min(total_costs),
                'Worst (bps)': max(total_costs),
                'Avg Quality Score': np.mean([t.trade_quality_score for t in trades]),
                'Fill Rate': np.mean([t.fill_rate for t in trades])
            })

        return pd.DataFrame(venue_stats)

    def print_execution_report(self, metrics: ExecutionMetrics):
        """
        Print detailed execution report

        Args:
            metrics: Execution metrics
        """
        print("\n" + "="*80)
        print("TRANSACTION COST ANALYSIS REPORT")
        print("="*80)
        print(f"Trade ID: {metrics.trade_id}")
        print(f"Symbol: {metrics.symbol}")
        print(f"Side: {metrics.side.upper()}")
        print(f"Shares: {metrics.filled_shares:,} / {metrics.order_shares:,} ({metrics.fill_rate:.1%})")
        print(f"Duration: {metrics.duration_seconds:.1f} seconds")
        print()

        print("PRICES:")
        print(f"  Decision Price:  ${metrics.decision_price:.2f}")
        print(f"  Arrival Price:   ${metrics.arrival_price:.2f}")
        print(f"  Execution Price: ${metrics.execution_price:.2f}")
        print(f"  Benchmark (VWAP):${metrics.benchmark_price:.2f}")
        print()

        print("COST BREAKDOWN (Basis Points):")
        print(f"  Spread Cost:  {metrics.spread_cost_bps:>8.2f} bps")
        print(f"  Impact Cost:  {metrics.impact_cost_bps:>8.2f} bps")
        print(f"  Delay Cost:   {metrics.delay_cost_bps:>8.2f} bps")
        print(f"  {'─'*30}")
        print(f"  Total Cost:   {metrics.total_cost_bps:>8.2f} bps")
        print()

        print("COST BREAKDOWN (Dollars):")
        print(f"  Spread Cost:  ${metrics.spread_cost_usd:>10,.2f}")
        print(f"  Impact Cost:  ${metrics.impact_cost_usd:>10,.2f}")
        print(f"  Delay Cost:   ${metrics.delay_cost_usd:>10,.2f}")
        print(f"  {'─'*35}")
        print(f"  Total Cost:   ${metrics.total_cost_usd:>10,.2f}")
        print()

        print("PERFORMANCE:")
        print(f"  Trade Quality Score: {metrics.trade_quality_score:.1f} / 100")
        print(f"  vs. VWAP: {metrics.vs_vwap_bps:+.2f} bps")
        print(f"  vs. TWAP: {metrics.vs_twap_bps:+.2f} bps")
        print()

        # Interpretation
        if metrics.total_cost_bps < 5:
            print("✓ EXCELLENT execution (< 5 bps)")
        elif metrics.total_cost_bps < 10:
            print("✓ GOOD execution (5-10 bps)")
        elif metrics.total_cost_bps < 20:
            print("⚠ ACCEPTABLE execution (10-20 bps)")
        else:
            print("✗ POOR execution (> 20 bps)")

        print("="*80 + "\n")

    def print_aggregated_report(self, aggregated: AggregatedTCA):
        """
        Print aggregated TCA report

        Args:
            aggregated: Aggregated TCA metrics
        """
        print("\n" + "="*80)
        print("AGGREGATED TRANSACTION COST ANALYSIS")
        print("="*80)
        print(f"Period: {aggregated.period}")
        print(f"Number of Trades: {aggregated.num_trades:,}")
        print(f"Total Volume: {aggregated.total_volume:,} shares")
        print(f"Total Value: ${aggregated.total_value:,.0f}")
        print()

        print("AVERAGE COSTS (Basis Points):")
        print(f"  Spread:  {aggregated.avg_spread_cost_bps:>6.2f} bps")
        print(f"  Impact:  {aggregated.avg_impact_cost_bps:>6.2f} bps")
        print(f"  Delay:   {aggregated.avg_delay_cost_bps:>6.2f} bps")
        print(f"  Slippage:{aggregated.avg_slippage_bps:>6.2f} bps")
        print(f"  {'─'*25}")
        print(f"  TOTAL:   {aggregated.avg_total_cost_bps:>6.2f} bps")
        print()

        print("COST DISTRIBUTION:")
        print(f"  Median:  {aggregated.median_cost_bps:>6.2f} bps")
        print(f"  Std Dev: {aggregated.cost_std_bps:>6.2f} bps")
        print(f"  95th %:  {aggregated.cost_95th_percentile_bps:>6.2f} bps")
        print(f"  Best:    {aggregated.best_trade_bps:>6.2f} bps")
        print(f"  Worst:   {aggregated.worst_trade_bps:>6.2f} bps")
        print()

        print("TOTAL COSTS:")
        print(f"  Total USD: ${aggregated.total_cost_usd:,.2f}")
        print(f"  % of Value: {(aggregated.total_cost_usd / aggregated.total_value * 100):.3f}%")
        print()

        print("QUALITY METRICS:")
        print(f"  Avg Trade Quality: {aggregated.avg_trade_quality:.1f} / 100")
        print(f"  Avg Fill Rate: {aggregated.avg_fill_rate:.1%}")
        print(f"  Avg vs. VWAP: {aggregated.avg_vs_vwap_bps:+.2f} bps")

        print("="*80 + "\n")


# Example usage
if __name__ == "__main__":
    print("Transaction Cost Analysis Example")
    print("="*80)

    # Initialize analyzer
    tca = TransactionCostAnalyzer()

    # Simulate some trades
    np.random.seed(42)

    symbols = ['AAPL', 'MSFT', 'GOOGL']
    base_time = datetime.now() - timedelta(days=30)

    print("\n1. ANALYZING INDIVIDUAL TRADES")
    print("-" * 80)

    for i in range(5):
        symbol = np.random.choice(symbols)
        side = np.random.choice(['buy', 'sell'])
        decision_price = 150.0 + np.random.normal(0, 5)
        shares = int(np.random.uniform(1000, 10000))

        # Simulate some slippage
        execution_price = decision_price * (1 + np.random.normal(0, 0.001))

        decision_time = base_time + timedelta(hours=i*2)
        execution_time = decision_time + timedelta(seconds=np.random.uniform(30, 300))

        metrics = tca.calculate_implementation_shortfall(
            symbol=symbol,
            side=side,
            decision_price=decision_price,
            execution_price=execution_price,
            shares=shares,
            decision_time=decision_time,
            execution_time=execution_time
        )

        # Add VWAP comparison (simulated)
        vwap_price = decision_price * (1 + np.random.normal(0, 0.0005))
        metrics.vs_vwap_bps = tca.compare_to_vwap(
            execution_price, vwap_price, shares, side
        )

        print(f"\nTrade {i+1}: {side.upper()} {shares:,} {symbol}")
        print(f"  Total Cost: {metrics.total_cost_bps:.2f} bps (${metrics.total_cost_usd:,.2f})")
        print(f"  Quality Score: {metrics.trade_quality_score:.1f}")

    # Aggregated analysis
    print("\n2. AGGREGATED ANALYSIS (Last 30 Days)")
    print("-" * 80)
    aggregated = tca.aggregate_tca()
    tca.print_aggregated_report(aggregated)

    # Detailed report for one trade
    if tca.execution_history:
        print("\n3. DETAILED EXECUTION REPORT")
        tca.print_execution_report(tca.execution_history[0])

    print("\n" + "="*80)
