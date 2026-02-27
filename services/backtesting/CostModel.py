"""
NexusTradeAI - Transaction Cost Model
=====================================

Production-grade transaction cost modeling including:
- Commission costs (flat, per-share, percentage)
- Slippage estimation (volatility-based, volume-based)
- Market impact modeling (linear, square-root)
- Spread costs

Senior Engineering Rigor Applied:
- Realistic cost assumptions
- Configurable cost parameters
- Per-trade cost breakdown
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class CommissionType(Enum):
    """Commission structure types"""
    FLAT = "flat"           # Fixed $ per trade
    PER_SHARE = "per_share" # $ per share
    PERCENTAGE = "percentage" # % of trade value
    TIERED = "tiered"       # Volume-based tiers


class SlippageModel(Enum):
    """Slippage estimation models"""
    FIXED = "fixed"         # Fixed basis points
    VOLATILITY = "volatility" # Based on asset volatility
    VOLUME = "volume"       # Based on volume participation
    COMBINED = "combined"   # Volatility + volume


@dataclass
class CostBreakdown:
    """Breakdown of transaction costs"""
    commission: float
    slippage: float
    spread_cost: float
    market_impact: float
    total_cost: float
    cost_bps: float  # Total cost in basis points
    
    def to_dict(self) -> Dict[str, float]:
        return {
            'commission': round(self.commission, 4),
            'slippage': round(self.slippage, 4),
            'spread_cost': round(self.spread_cost, 4),
            'market_impact': round(self.market_impact, 4),
            'total_cost': round(self.total_cost, 4),
            'cost_bps': round(self.cost_bps, 2)
        }


@dataclass
class BrokerConfig:
    """Broker-specific cost configuration"""
    name: str
    commission_type: CommissionType
    commission_rate: float  # Rate based on type
    min_commission: float = 0.0
    max_commission: float = float('inf')
    
    # Default spread assumption
    default_spread_bps: float = 2.0  # 2 bps default
    
    # Slippage model settings
    slippage_model: SlippageModel = SlippageModel.COMBINED
    slippage_fixed_bps: float = 5.0
    slippage_vol_multiplier: float = 0.5  # fraction of daily vol
    
    # Market impact
    impact_coefficient: float = 0.1  # Square-root impact coefficient


# Pre-configured broker profiles
BROKER_CONFIGS = {
    'alpaca': BrokerConfig(
        name='Alpaca',
        commission_type=CommissionType.FLAT,
        commission_rate=0.0,  # Commission-free
        default_spread_bps=3.0,
        slippage_fixed_bps=5.0
    ),
    'interactive_brokers': BrokerConfig(
        name='Interactive Brokers',
        commission_type=CommissionType.PER_SHARE,
        commission_rate=0.005,  # $0.005 per share
        min_commission=1.0,
        max_commission=1.0,  # Max 1% of trade value
        default_spread_bps=1.0,
        slippage_fixed_bps=3.0
    ),
    'td_ameritrade': BrokerConfig(
        name='TD Ameritrade',
        commission_type=CommissionType.FLAT,
        commission_rate=0.0,
        default_spread_bps=3.0,
        slippage_fixed_bps=5.0
    ),
    'conservative': BrokerConfig(
        name='Conservative Estimate',
        commission_type=CommissionType.FLAT,
        commission_rate=0.0,
        default_spread_bps=5.0,
        slippage_fixed_bps=10.0,
        impact_coefficient=0.2
    )
}


class CostModel:
    """
    Comprehensive transaction cost model.
    
    Calculates total cost of executing a trade including:
    - Commission costs
    - Bid-ask spread
    - Slippage
    - Market impact
    """
    
    def __init__(
        self,
        broker_config: Union[BrokerConfig, str] = 'alpaca',
        use_realistic_spread: bool = True,
        use_market_impact: bool = True
    ):
        """
        Initialize CostModel.
        
        Args:
            broker_config: BrokerConfig or broker name string
            use_realistic_spread: Use actual spread data if available
            use_market_impact: Include market impact costs
        """
        if isinstance(broker_config, str):
            self.config = BROKER_CONFIGS.get(broker_config, BROKER_CONFIGS['alpaca'])
        else:
            self.config = broker_config
        
        self.use_realistic_spread = use_realistic_spread
        self.use_market_impact = use_market_impact
        
        logger.info(f"CostModel initialized with {self.config.name} broker profile")
    
    def calculate_commission(
        self,
        shares: int,
        price: float
    ) -> float:
        """Calculate commission cost"""
        trade_value = shares * price
        
        if self.config.commission_type == CommissionType.FLAT:
            commission = self.config.commission_rate
        elif self.config.commission_type == CommissionType.PER_SHARE:
            commission = shares * self.config.commission_rate
        elif self.config.commission_type == CommissionType.PERCENTAGE:
            commission = trade_value * self.config.commission_rate
        else:
            commission = self.config.commission_rate
        
        # Apply min/max
        commission = max(self.config.min_commission, commission)
        if self.config.max_commission < float('inf'):
            max_comm = trade_value * self.config.max_commission / 100
            commission = min(max_comm, commission)
        
        return commission
    
    def calculate_spread_cost(
        self,
        shares: int,
        price: float,
        spread_bps: float = None
    ) -> float:
        """
        Calculate bid-ask spread cost.
        
        Assumes crossing half the spread on entry and exit.
        """
        if spread_bps is None:
            spread_bps = self.config.default_spread_bps
        
        # Pay half spread on each side
        spread_cost = shares * price * (spread_bps / 10000 / 2)
        
        return spread_cost
    
    def calculate_slippage(
        self,
        shares: int,
        price: float,
        volatility: float = None,
        avg_volume: int = None
    ) -> float:
        """
        Calculate expected slippage.
        
        Args:
            shares: Number of shares
            price: Current price
            volatility: Daily volatility (optional)
            avg_volume: Average daily volume (optional)
        """
        trade_value = shares * price
        
        if self.config.slippage_model == SlippageModel.FIXED:
            slippage = trade_value * (self.config.slippage_fixed_bps / 10000)
        
        elif self.config.slippage_model == SlippageModel.VOLATILITY:
            if volatility is None:
                volatility = 0.02  # Default 2% daily vol
            slippage = trade_value * volatility * self.config.slippage_vol_multiplier
        
        elif self.config.slippage_model == SlippageModel.VOLUME:
            if avg_volume is None or avg_volume == 0:
                participation = 0.01
            else:
                participation = min(1.0, shares / avg_volume)
            slippage = trade_value * participation * (self.config.slippage_fixed_bps / 10000) * 2
        
        else:  # COMBINED
            # Fixed component
            fixed_slip = trade_value * (self.config.slippage_fixed_bps / 10000)
            
            # Volatility component
            if volatility is None:
                volatility = 0.02
            vol_slip = trade_value * volatility * self.config.slippage_vol_multiplier * 0.1
            
            # Volume participation component
            if avg_volume is None or avg_volume == 0:
                vol_slip_extra = 0
            else:
                participation = min(1.0, shares / avg_volume)
                vol_slip_extra = trade_value * participation * 0.001  # 10bps for 100% participation
            
            slippage = fixed_slip + vol_slip + vol_slip_extra
        
        return slippage
    
    def calculate_market_impact(
        self,
        shares: int,
        price: float,
        avg_volume: int = None,
        volatility: float = None
    ) -> float:
        """
        Calculate market impact using square-root model.
        
        Impact = sigma * coefficient * sqrt(shares / avg_volume)
        """
        if not self.use_market_impact:
            return 0.0
        
        if avg_volume is None or avg_volume == 0:
            avg_volume = 1000000  # Default 1M shares
        if volatility is None:
            volatility = 0.02
        
        # Square-root impact model
        participation = shares / avg_volume
        impact_pct = volatility * self.config.impact_coefficient * np.sqrt(participation)
        
        trade_value = shares * price
        impact_cost = trade_value * impact_pct
        
        return impact_cost
    
    def calculate_total_cost(
        self,
        shares: int,
        price: float,
        volatility: float = None,
        avg_volume: int = None,
        spread_bps: float = None,
        is_round_trip: bool = False
    ) -> CostBreakdown:
        """
        Calculate total transaction cost.
        
        Args:
            shares: Number of shares to trade
            price: Current price
            volatility: Daily volatility
            avg_volume: Average daily volume
            spread_bps: Actual bid-ask spread in bps
            is_round_trip: If True, double costs for entry + exit
        """
        multiplier = 2 if is_round_trip else 1
        
        commission = self.calculate_commission(shares, price) * multiplier
        spread_cost = self.calculate_spread_cost(shares, price, spread_bps) * multiplier
        slippage = self.calculate_slippage(shares, price, volatility, avg_volume) * multiplier
        market_impact = self.calculate_market_impact(shares, price, avg_volume, volatility) * multiplier
        
        total_cost = commission + spread_cost + slippage + market_impact
        
        trade_value = shares * price
        cost_bps = (total_cost / trade_value) * 10000 if trade_value > 0 else 0
        
        return CostBreakdown(
            commission=commission,
            slippage=slippage,
            spread_cost=spread_cost,
            market_impact=market_impact,
            total_cost=total_cost,
            cost_bps=cost_bps
        )
    
    def estimate_breakeven_gain(
        self,
        shares: int,
        price: float,
        volatility: float = None,
        avg_volume: int = None
    ) -> float:
        """
        Calculate minimum gain needed to break even after costs.
        
        Returns gain as percentage.
        """
        cost = self.calculate_total_cost(
            shares, price, volatility, avg_volume, is_round_trip=True
        )
        
        trade_value = shares * price
        breakeven_pct = (cost.total_cost / trade_value) * 100
        
        return breakeven_pct
    
    def apply_costs_to_returns(
        self,
        returns: pd.Series,
        trade_mask: pd.Series,
        shares_traded: pd.Series = None,
        prices: pd.Series = None,
        volatilities: pd.Series = None
    ) -> pd.Series:
        """
        Apply transaction costs to a return series.
        
        Args:
            returns: Raw strategy returns
            trade_mask: Boolean series indicating trade days
            shares_traded: Number of shares per trade
            prices: Price series
            volatilities: Volatility series
        """
        adjusted_returns = returns.copy()
        
        trade_dates = trade_mask[trade_mask].index
        
        for date in trade_dates:
            if shares_traded is not None and prices is not None:
                shares = shares_traded.get(date, 100)
                price = prices.get(date, 100)
            else:
                shares = 100
                price = 100
            
            vol = volatilities.get(date, 0.02) if volatilities is not None else 0.02
            
            cost = self.calculate_total_cost(shares, price, vol, is_round_trip=True)
            cost_pct = cost.cost_bps / 10000
            
            adjusted_returns[date] -= cost_pct
        
        return adjusted_returns


# Factory function
def create_cost_model(broker: str = 'alpaca') -> CostModel:
    """Create cost model with broker preset"""
    return CostModel(broker_config=broker)


# Quick test
if __name__ == "__main__":
    model = CostModel('conservative')
    
    # Test trade
    cost = model.calculate_total_cost(
        shares=1000,
        price=50.0,
        volatility=0.03,
        avg_volume=500000,
        is_round_trip=True
    )
    
    print(f"Trade: 1000 shares @ $50 ($50,000 value)")
    print(f"Commission: ${cost.commission:.2f}")
    print(f"Spread: ${cost.spread_cost:.2f}")
    print(f"Slippage: ${cost.slippage:.2f}")
    print(f"Impact: ${cost.market_impact:.2f}")
    print(f"Total: ${cost.total_cost:.2f} ({cost.cost_bps:.1f} bps)")
    
    breakeven = model.estimate_breakeven_gain(1000, 50.0)
    print(f"Breakeven gain needed: {breakeven:.3f}%")
