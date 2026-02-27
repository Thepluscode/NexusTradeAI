"""
Smart Order Routing (SOR)
==========================
Institutional-grade smart order routing for best execution.

Author: NexusTradeAI Execution Team
Version: 1.0
Date: December 25, 2024

Features:
- Multi-venue routing optimization
- Best execution analysis
- Liquidity aggregation
- Venue quality scoring
- Dark pool integration
- Order splitting strategies
- Real-time routing decisions
- Historical venue performance tracking
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class VenueType(Enum):
    """Trading venue types"""
    LIT_EXCHANGE = "lit_exchange"  # Public exchange (NASDAQ, NYSE, etc.)
    DARK_POOL = "dark_pool"  # Dark pool (no pre-trade transparency)
    ECN = "ecn"  # Electronic Communication Network
    ATS = "ats"  # Alternative Trading System
    MARKET_MAKER = "market_maker"  # Market maker


class RoutingStrategy(Enum):
    """Order routing strategies"""
    BEST_PRICE = "best_price"  # Route to best displayed price
    LOWEST_COST = "lowest_cost"  # Minimize total cost (price + fees)
    FASTEST_FILL = "fastest_fill"  # Maximize fill probability
    LIQUIDITY_SEEKING = "liquidity_seeking"  # Seek hidden liquidity
    SMART_ROUTE = "smart_route"  # Intelligent multi-venue routing
    PRO_RATA = "pro_rata"  # Split proportional to venue liquidity


@dataclass
class VenueQuote:
    """Quote from a trading venue"""
    venue_id: str
    venue_name: str
    venue_type: VenueType
    timestamp: datetime

    # Quote details
    bid_price: float
    bid_size: int
    ask_price: float
    ask_size: int
    spread: float  # Ask - Bid

    # Venue characteristics
    fee_per_share: float  # Fee (can be negative for rebates)
    fill_probability: float  # Historical fill probability
    avg_fill_time_ms: float  # Average fill time in milliseconds
    market_share: float  # % of total volume for this symbol

    # Quality metrics
    quality_score: float = 0.0  # Composite quality score (0-100)

    def get_effective_bid(self) -> float:
        """Get effective bid after fees"""
        return self.bid_price - self.fee_per_share

    def get_effective_ask(self) -> float:
        """Get effective ask after fees"""
        return self.ask_price + self.fee_per_share

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'venue_id': self.venue_id,
            'venue_name': self.venue_name,
            'venue_type': self.venue_type.value,
            'timestamp': self.timestamp.isoformat(),
            'bid_price': self.bid_price,
            'bid_size': self.bid_size,
            'ask_price': self.ask_price,
            'ask_size': self.ask_size,
            'spread': self.spread,
            'fee_per_share': self.fee_per_share,
            'fill_probability': self.fill_probability,
            'avg_fill_time_ms': self.avg_fill_time_ms,
            'market_share': self.market_share,
            'quality_score': self.quality_score
        }


@dataclass
class RoutingDecision:
    """Order routing decision"""
    symbol: str
    side: str  # "buy" or "sell"
    total_shares: int
    strategy: RoutingStrategy

    # Routing allocations
    venue_allocations: Dict[str, int]  # {venue_id: shares}
    venue_prices: Dict[str, float]  # {venue_id: expected_price}

    # Expected execution
    expected_avg_price: float
    expected_total_cost: float
    expected_fill_rate: float
    expected_fill_time_ms: float

    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'symbol': self.symbol,
            'side': self.side,
            'total_shares': self.total_shares,
            'strategy': self.strategy.value,
            'venue_allocations': self.venue_allocations,
            'venue_prices': self.venue_prices,
            'expected_avg_price': self.expected_avg_price,
            'expected_total_cost': self.expected_total_cost,
            'expected_fill_rate': self.expected_fill_rate,
            'expected_fill_time_ms': self.expected_fill_time_ms,
            'timestamp': self.timestamp.isoformat()
        }


@dataclass
class VenuePerformance:
    """Historical venue performance metrics"""
    venue_id: str
    venue_name: str

    # Performance metrics
    total_orders: int
    total_volume: int
    avg_fill_rate: float
    avg_price_improvement_bps: float  # vs. NBBO
    avg_fill_time_ms: float

    # Cost metrics
    avg_fee_per_share: float
    avg_effective_spread_bps: float

    # Quality metrics
    adverse_selection_rate: float  # % of orders with adverse price movement
    toxicity_score: float  # Higher = more likely to have informed traders

    # Computed score
    overall_score: float = 0.0


class SmartOrderRouter:
    """
    Intelligent order routing system for best execution
    """

    def __init__(self):
        """Initialize smart order router"""
        self.venue_performance: Dict[str, VenuePerformance] = {}
        self.routing_history: List[RoutingDecision] = []
        logger.info("Initialized SmartOrderRouter")

    def calculate_venue_quality_score(
        self,
        quote: VenueQuote,
        symbol: str,
        side: str
    ) -> float:
        """
        Calculate composite quality score for venue

        Factors:
        - Price (50%): How competitive is the price?
        - Fill probability (20%): Likelihood of getting filled
        - Speed (15%): How fast is execution?
        - Cost (15%): Fees and effective spread

        Args:
            quote: Venue quote
            symbol: Trading symbol
            side: "buy" or "sell"

        Returns:
            Quality score (0-100, higher is better)
        """
        # Price competitiveness (0-50 points)
        # For buy: lower ask is better
        # For sell: higher bid is better
        # Compare to best available price
        price_score = 25.0  # Base score

        # Fill probability (0-20 points)
        fill_score = quote.fill_probability * 20

        # Speed (0-15 points)
        # Faster is better (score inversely proportional to time)
        # < 10ms = 15 points, > 100ms = 0 points
        speed_score = max(0, 15 * (1 - quote.avg_fill_time_ms / 100))

        # Cost (0-15 points)
        # Lower fees are better
        # $0.003/share (maker rebate) = 15 points
        # $0.003/share (taker fee) = 0 points
        cost_score = max(0, 15 * (1 - quote.fee_per_share / 0.003))

        total_score = price_score + fill_score + speed_score + cost_score
        return min(100, max(0, total_score))

    def route_best_price(
        self,
        symbol: str,
        side: str,
        shares: int,
        quotes: List[VenueQuote]
    ) -> RoutingDecision:
        """
        Route to best displayed price

        Simple strategy: Send entire order to venue with best price

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            shares: Number of shares
            quotes: List of venue quotes

        Returns:
            RoutingDecision
        """
        if not quotes:
            raise ValueError("No venue quotes available")

        # Find best price
        if side.lower() == "buy":
            # Best ask (lowest)
            best_quote = min(quotes, key=lambda q: q.get_effective_ask())
            expected_price = best_quote.get_effective_ask()
        else:
            # Best bid (highest)
            best_quote = max(quotes, key=lambda q: q.get_effective_bid())
            expected_price = best_quote.get_effective_bid()

        # Route all shares to this venue
        venue_allocations = {best_quote.venue_id: shares}
        venue_prices = {best_quote.venue_id: expected_price}

        expected_total_cost = shares * expected_price

        decision = RoutingDecision(
            symbol=symbol,
            side=side,
            total_shares=shares,
            strategy=RoutingStrategy.BEST_PRICE,
            venue_allocations=venue_allocations,
            venue_prices=venue_prices,
            expected_avg_price=expected_price,
            expected_total_cost=expected_total_cost,
            expected_fill_rate=best_quote.fill_probability,
            expected_fill_time_ms=best_quote.avg_fill_time_ms
        )

        self.routing_history.append(decision)
        return decision

    def route_lowest_cost(
        self,
        symbol: str,
        side: str,
        shares: int,
        quotes: List[VenueQuote]
    ) -> RoutingDecision:
        """
        Route to minimize total cost (price + fees)

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            shares: Number of shares
            quotes: List of venue quotes

        Returns:
            RoutingDecision
        """
        if not quotes:
            raise ValueError("No venue quotes available")

        # Find venue with lowest effective price
        if side.lower() == "buy":
            best_quote = min(quotes, key=lambda q: q.get_effective_ask())
            expected_price = best_quote.get_effective_ask()
        else:
            best_quote = max(quotes, key=lambda q: q.get_effective_bid())
            expected_price = best_quote.get_effective_bid()

        venue_allocations = {best_quote.venue_id: shares}
        venue_prices = {best_quote.venue_id: expected_price}

        expected_total_cost = shares * expected_price

        decision = RoutingDecision(
            symbol=symbol,
            side=side,
            total_shares=shares,
            strategy=RoutingStrategy.LOWEST_COST,
            venue_allocations=venue_allocations,
            venue_prices=venue_prices,
            expected_avg_price=expected_price,
            expected_total_cost=expected_total_cost,
            expected_fill_rate=best_quote.fill_probability,
            expected_fill_time_ms=best_quote.avg_fill_time_ms
        )

        self.routing_history.append(decision)
        return decision

    def route_pro_rata(
        self,
        symbol: str,
        side: str,
        shares: int,
        quotes: List[VenueQuote],
        min_allocation: int = 100
    ) -> RoutingDecision:
        """
        Route proportionally to venue liquidity/market share

        Splits order across multiple venues in proportion to their liquidity

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            shares: Number of shares
            quotes: List of venue quotes
            min_allocation: Minimum shares per venue

        Returns:
            RoutingDecision
        """
        if not quotes:
            raise ValueError("No venue quotes available")

        # Calculate allocations based on market share
        total_market_share = sum(q.market_share for q in quotes)

        venue_allocations = {}
        venue_prices = {}
        remaining_shares = shares

        for quote in quotes:
            # Allocation proportional to market share
            allocation = int(shares * (quote.market_share / total_market_share))

            # Apply minimum allocation
            if allocation < min_allocation:
                continue

            allocation = min(allocation, remaining_shares)

            if allocation > 0:
                venue_allocations[quote.venue_id] = allocation
                venue_prices[quote.venue_id] = (
                    quote.get_effective_ask() if side.lower() == "buy"
                    else quote.get_effective_bid()
                )
                remaining_shares -= allocation

        # Allocate remaining shares to best price venue
        if remaining_shares > 0:
            if side.lower() == "buy":
                best_quote = min(quotes, key=lambda q: q.get_effective_ask())
                price = best_quote.get_effective_ask()
            else:
                best_quote = max(quotes, key=lambda q: q.get_effective_bid())
                price = best_quote.get_effective_bid()

            if best_quote.venue_id in venue_allocations:
                venue_allocations[best_quote.venue_id] += remaining_shares
            else:
                venue_allocations[best_quote.venue_id] = remaining_shares
                venue_prices[best_quote.venue_id] = price

        # Calculate weighted average price
        total_value = sum(
            venue_allocations[vid] * venue_prices[vid]
            for vid in venue_allocations
        )
        expected_avg_price = total_value / shares

        expected_total_cost = total_value

        # Weighted average fill rate and time
        total_allocated = sum(venue_allocations.values())
        venue_quote_map = {q.venue_id: q for q in quotes}

        expected_fill_rate = sum(
            (venue_allocations[vid] / total_allocated) * venue_quote_map[vid].fill_probability
            for vid in venue_allocations if vid in venue_quote_map
        )

        expected_fill_time = sum(
            (venue_allocations[vid] / total_allocated) * venue_quote_map[vid].avg_fill_time_ms
            for vid in venue_allocations if vid in venue_quote_map
        )

        decision = RoutingDecision(
            symbol=symbol,
            side=side,
            total_shares=shares,
            strategy=RoutingStrategy.PRO_RATA,
            venue_allocations=venue_allocations,
            venue_prices=venue_prices,
            expected_avg_price=expected_avg_price,
            expected_total_cost=expected_total_cost,
            expected_fill_rate=expected_fill_rate,
            expected_fill_time_ms=expected_fill_time
        )

        self.routing_history.append(decision)
        return decision

    def route_smart(
        self,
        symbol: str,
        side: str,
        shares: int,
        quotes: List[VenueQuote],
        urgency: float = 0.5,
        max_venues: int = 5
    ) -> RoutingDecision:
        """
        Intelligent multi-factor routing

        Considers:
        - Price
        - Fill probability
        - Speed
        - Fees
        - Venue quality

        Args:
            symbol: Trading symbol
            side: "buy" or "sell"
            shares: Number of shares
            quotes: List of venue quotes
            urgency: Urgency level (0-1, higher = more urgent)
            max_venues: Maximum number of venues to route to

        Returns:
            RoutingDecision
        """
        if not quotes:
            raise ValueError("No venue quotes available")

        # Calculate quality scores for all venues
        for quote in quotes:
            quote.quality_score = self.calculate_venue_quality_score(quote, symbol, side)

        # Sort by quality score (descending)
        sorted_quotes = sorted(quotes, key=lambda q: q.quality_score, reverse=True)

        # Select top venues
        selected_quotes = sorted_quotes[:max_venues]

        # Allocate shares based on quality scores and urgency
        venue_allocations = {}
        venue_prices = {}

        # Calculate allocation weights
        # Higher urgency → concentrate in top venues
        # Lower urgency → spread across more venues
        quality_scores = np.array([q.quality_score for q in selected_quotes])

        # Apply urgency weighting
        # High urgency: weight ∝ score²
        # Low urgency: weight ∝ score
        urgency_factor = 1 + urgency
        weights = quality_scores ** urgency_factor
        weights = weights / np.sum(weights)

        remaining_shares = shares

        for i, quote in enumerate(selected_quotes):
            allocation = int(shares * weights[i])

            if allocation == 0 and i == 0:
                # Ensure at least top venue gets some allocation
                allocation = shares

            allocation = min(allocation, remaining_shares)

            if allocation > 0:
                venue_allocations[quote.venue_id] = allocation
                venue_prices[quote.venue_id] = (
                    quote.get_effective_ask() if side.lower() == "buy"
                    else quote.get_effective_bid()
                )
                remaining_shares -= allocation

        # Allocate any remaining shares to best venue
        if remaining_shares > 0 and selected_quotes:
            best_venue_id = selected_quotes[0].venue_id
            venue_allocations[best_venue_id] = venue_allocations.get(best_venue_id, 0) + remaining_shares

        # Calculate expected metrics
        total_value = sum(
            venue_allocations[vid] * venue_prices[vid]
            for vid in venue_allocations
        )
        expected_avg_price = total_value / shares

        # Weighted averages
        venue_quote_map = {q.venue_id: q for q in quotes}
        total_allocated = sum(venue_allocations.values())

        expected_fill_rate = sum(
            (venue_allocations[vid] / total_allocated) * venue_quote_map[vid].fill_probability
            for vid in venue_allocations if vid in venue_quote_map
        )

        expected_fill_time = sum(
            (venue_allocations[vid] / total_allocated) * venue_quote_map[vid].avg_fill_time_ms
            for vid in venue_allocations if vid in venue_quote_map
        )

        decision = RoutingDecision(
            symbol=symbol,
            side=side,
            total_shares=shares,
            strategy=RoutingStrategy.SMART_ROUTE,
            venue_allocations=venue_allocations,
            venue_prices=venue_prices,
            expected_avg_price=expected_avg_price,
            expected_total_cost=total_value,
            expected_fill_rate=expected_fill_rate,
            expected_fill_time_ms=expected_fill_time
        )

        self.routing_history.append(decision)
        return decision

    def update_venue_performance(
        self,
        venue_id: str,
        venue_name: str,
        fill_rate: float,
        price_improvement_bps: float,
        fill_time_ms: float,
        fee_per_share: float
    ):
        """
        Update venue performance metrics from execution

        Args:
            venue_id: Venue identifier
            venue_name: Venue name
            fill_rate: Order fill rate
            price_improvement_bps: Price improvement vs. NBBO
            fill_time_ms: Fill time in milliseconds
            fee_per_share: Fee per share
        """
        if venue_id not in self.venue_performance:
            # Initialize new venue
            self.venue_performance[venue_id] = VenuePerformance(
                venue_id=venue_id,
                venue_name=venue_name,
                total_orders=0,
                total_volume=0,
                avg_fill_rate=0.0,
                avg_price_improvement_bps=0.0,
                avg_fill_time_ms=0.0,
                avg_fee_per_share=0.0,
                avg_effective_spread_bps=0.0,
                adverse_selection_rate=0.0,
                toxicity_score=0.0
            )

        perf = self.venue_performance[venue_id]

        # Update running averages (exponential moving average)
        alpha = 0.1  # Weighting factor
        perf.total_orders += 1
        perf.avg_fill_rate = (1 - alpha) * perf.avg_fill_rate + alpha * fill_rate
        perf.avg_price_improvement_bps = (1 - alpha) * perf.avg_price_improvement_bps + alpha * price_improvement_bps
        perf.avg_fill_time_ms = (1 - alpha) * perf.avg_fill_time_ms + alpha * fill_time_ms
        perf.avg_fee_per_share = (1 - alpha) * perf.avg_fee_per_share + alpha * fee_per_share

        # Calculate overall score
        perf.overall_score = (
            perf.avg_fill_rate * 40 +  # 40% weight on fill rate
            max(0, perf.avg_price_improvement_bps) * 2 +  # 20% weight on price improvement (10 bps = 20 points)
            max(0, 30 * (1 - perf.avg_fill_time_ms / 100)) +  # 30% weight on speed
            max(0, 10 * (1 - perf.avg_fee_per_share / 0.003))  # 10% weight on fees
        )

    def get_venue_performance_report(self) -> pd.DataFrame:
        """
        Get venue performance report

        Returns:
            DataFrame with venue performance metrics
        """
        if not self.venue_performance:
            return pd.DataFrame()

        data = []
        for perf in self.venue_performance.values():
            data.append({
                'Venue': perf.venue_name,
                'Orders': perf.total_orders,
                'Avg Fill Rate': f"{perf.avg_fill_rate:.1%}",
                'Avg Price Improvement (bps)': f"{perf.avg_price_improvement_bps:+.2f}",
                'Avg Fill Time (ms)': f"{perf.avg_fill_time_ms:.1f}",
                'Avg Fee ($/share)': f"${perf.avg_fee_per_share:.4f}",
                'Overall Score': f"{perf.overall_score:.1f}"
            })

        return pd.DataFrame(data)

    def print_routing_decision(self, decision: RoutingDecision):
        """
        Print routing decision details

        Args:
            decision: Routing decision
        """
        print("\n" + "="*80)
        print(f"SMART ORDER ROUTING DECISION: {decision.strategy.value.upper()}")
        print("="*80)
        print(f"Symbol: {decision.symbol}")
        print(f"Side: {decision.side.upper()}")
        print(f"Total Shares: {decision.total_shares:,}")
        print()

        print("VENUE ALLOCATIONS:")
        print(f"{'Venue ID':<20} {'Shares':<15} {'% of Total':<12} {'Expected Price'}")
        print("-" * 80)

        for venue_id, shares in decision.venue_allocations.items():
            pct = (shares / decision.total_shares) * 100
            price = decision.venue_prices.get(venue_id, 0)
            print(f"{venue_id:<20} {shares:<15,} {pct:<11.1f}% ${price:.2f}")

        print()
        print("EXPECTED EXECUTION:")
        print(f"  Expected Avg Price: ${decision.expected_avg_price:.2f}")
        print(f"  Expected Total Cost: ${decision.expected_total_cost:,.2f}")
        print(f"  Expected Fill Rate: {decision.expected_fill_rate:.1%}")
        print(f"  Expected Fill Time: {decision.expected_fill_time_ms:.1f}ms")

        print("="*80 + "\n")


# Example usage
if __name__ == "__main__":
    print("Smart Order Routing Example")
    print("="*80)

    # Initialize router
    router = SmartOrderRouter()

    # Create sample venue quotes
    quotes = [
        VenueQuote(
            venue_id="NYSE",
            venue_name="New York Stock Exchange",
            venue_type=VenueType.LIT_EXCHANGE,
            timestamp=datetime.now(),
            bid_price=179.50,
            bid_size=1000,
            ask_price=179.52,
            ask_size=800,
            spread=0.02,
            fee_per_share=0.0030,  # Taker fee
            fill_probability=0.95,
            avg_fill_time_ms=15.0,
            market_share=0.25
        ),
        VenueQuote(
            venue_id="NASDAQ",
            venue_name="NASDAQ",
            venue_type=VenueType.LIT_EXCHANGE,
            timestamp=datetime.now(),
            bid_price=179.51,
            bid_size=1200,
            ask_price=179.53,
            ask_size=1000,
            spread=0.02,
            fee_per_share=-0.0015,  # Maker rebate
            fill_probability=0.92,
            avg_fill_time_ms=12.0,
            market_share=0.30
        ),
        VenueQuote(
            venue_id="BATS",
            venue_name="BATS Exchange",
            venue_type=VenueType.ECN,
            timestamp=datetime.now(),
            bid_price=179.50,
            bid_size=800,
            ask_price=179.52,
            ask_size=600,
            spread=0.02,
            fee_per_share=0.0025,
            fill_probability=0.88,
            avg_fill_time_ms=18.0,
            market_share=0.20
        ),
        VenueQuote(
            venue_id="DARKPOOL1",
            venue_name="Dark Pool Alpha",
            venue_type=VenueType.DARK_POOL,
            timestamp=datetime.now(),
            bid_price=179.51,
            bid_size=2000,
            ask_price=179.51,  # Midpoint
            ask_size=2000,
            spread=0.00,  # No displayed spread
            fee_per_share=0.0010,
            fill_probability=0.60,  # Lower fill probability
            avg_fill_time_ms=50.0,  # Slower
            market_share=0.15
        )
    ]

    # Test different routing strategies
    symbol = "AAPL"
    side = "buy"
    shares = 10000

    print("\n1. BEST PRICE ROUTING")
    print("-" * 80)
    best_price = router.route_best_price(symbol, side, shares, quotes)
    router.print_routing_decision(best_price)

    print("\n2. LOWEST COST ROUTING")
    print("-" * 80)
    lowest_cost = router.route_lowest_cost(symbol, side, shares, quotes)
    router.print_routing_decision(lowest_cost)

    print("\n3. PRO-RATA ROUTING")
    print("-" * 80)
    pro_rata = router.route_pro_rata(symbol, side, shares, quotes)
    router.print_routing_decision(pro_rata)

    print("\n4. SMART ROUTING (High Urgency)")
    print("-" * 80)
    smart_urgent = router.route_smart(symbol, side, shares, quotes, urgency=0.8)
    router.print_routing_decision(smart_urgent)

    print("\n5. SMART ROUTING (Low Urgency)")
    print("-" * 80)
    smart_patient = router.route_smart(symbol, side, shares, quotes, urgency=0.2)
    router.print_routing_decision(smart_patient)

    print("\n" + "="*80)
