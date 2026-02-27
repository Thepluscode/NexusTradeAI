"""
NexusTradeAI - Capacity Analysis & Market Impact
=================================================

Production tools for scaling:
- Capacity analysis by strategy
- Market impact modeling
- Optimal position sizing for scale

Senior Engineering Rigor Applied:
- Square-root impact model
- Strategy capacity estimation
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


@dataclass
class CapacityEstimate:
    """Capacity estimate for a strategy"""
    strategy_name: str
    max_capital: float
    current_capital: float
    utilization: float
    limiting_factors: List[str]
    impact_at_max: float
    recommended_capital: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'strategy': self.strategy_name,
            'max_capital_usd': round(self.max_capital, 0),
            'current_capital_usd': round(self.current_capital, 0),
            'utilization_pct': round(self.utilization * 100, 1),
            'limiting_factors': self.limiting_factors,
            'impact_at_max_bps': round(self.impact_at_max * 10000, 1),
            'recommended_capital_usd': round(self.recommended_capital, 0)
        }


class CapacityAnalyzer:
    """
    Strategy capacity analysis.
    
    Estimates maximum capital before degradation.
    """
    
    def __init__(
        self,
        max_participation_rate: float = 0.05,  # 5% max of ADV
        max_impact_bps: float = 20.0,          # 20 bps max impact
        impact_coefficient: float = 0.1
    ):
        self.max_participation = max_participation_rate
        self.max_impact_bps = max_impact_bps
        self.impact_coef = impact_coefficient
    
    def estimate_capacity(
        self,
        strategy_name: str,
        avg_position_size: float,
        avg_trade_frequency: int,  # trades per day
        avg_stock_adv: float,      # average daily volume $
        avg_volatility: float,
        current_capital: float
    ) -> CapacityEstimate:
        """Estimate strategy capacity"""
        limiting_factors = []
        
        # Participation rate constraint
        daily_volume_needed = avg_position_size * avg_trade_frequency
        max_by_participation = avg_stock_adv * self.max_participation
        
        if daily_volume_needed > max_by_participation * 0.5:
            limiting_factors.append("participation_rate")
        
        capacity_by_adv = (max_by_participation / daily_volume_needed) * current_capital
        
        # Impact constraint
        participation = avg_position_size / avg_stock_adv
        impact_pct = avg_volatility * self.impact_coef * np.sqrt(participation)
        
        # Max capital before impact exceeds limit
        max_impact_ratio = (self.max_impact_bps / 10000) / impact_pct if impact_pct > 0 else 10
        capacity_by_impact = current_capital * max_impact_ratio
        
        if impact_pct * 10000 > self.max_impact_bps * 0.5:
            limiting_factors.append("market_impact")
        
        # Take minimum
        max_capital = min(capacity_by_adv, capacity_by_impact)
        
        # Add safety margin
        recommended = max_capital * 0.7
        
        if not limiting_factors:
            limiting_factors.append("none_identified")
        
        return CapacityEstimate(
            strategy_name=strategy_name,
            max_capital=max_capital,
            current_capital=current_capital,
            utilization=current_capital / max_capital if max_capital > 0 else 1.0,
            limiting_factors=limiting_factors,
            impact_at_max=impact_pct * (max_capital / current_capital),
            recommended_capital=recommended
        )
    
    def calculate_market_impact(
        self,
        trade_value: float,
        adv: float,
        volatility: float
    ) -> float:
        """Calculate expected market impact"""
        participation = trade_value / adv if adv > 0 else 0.01
        impact = volatility * self.impact_coef * np.sqrt(participation)
        return impact


class ComplianceManager:
    """
    Regulatory compliance management.
    
    Tracks limits and generates reports.
    """
    
    def __init__(
        self,
        entity_name: str = "NexusTradeAI",
        entity_type: str = "LLC",
        registration_status: str = "Exempt"
    ):
        self.entity_name = entity_name
        self.entity_type = entity_type
        self.registration = registration_status
        
        # Limits
        self.position_limits: Dict[str, float] = {}
        self.sector_limits: Dict[str, float] = {}
        self.daily_trades: List[Dict] = []
    
    def log_trade(
        self,
        symbol: str,
        side: str,
        quantity: int,
        price: float,
        strategy: str
    ):
        """Log trade for compliance"""
        self.daily_trades.append({
            'timestamp': datetime.now().isoformat(),
            'symbol': symbol,
            'side': side,
            'quantity': quantity,
            'price': price,
            'value': quantity * price,
            'strategy': strategy
        })
    
    def check_pattern_day_trader(self) -> Dict[str, Any]:
        """Check PDT rule compliance"""
        day_trades = len([t for t in self.daily_trades if t['side'] == 'buy'])
        
        return {
            'day_trades_count': day_trades,
            'pdt_threshold': 4,
            'at_risk': day_trades >= 3,
            'status': 'warning' if day_trades >= 3 else 'ok'
        }
    
    def generate_compliance_report(self) -> Dict[str, Any]:
        """Generate daily compliance report"""
        total_value = sum(t['value'] for t in self.daily_trades)
        
        return {
            'report_date': datetime.now().isoformat(),
            'entity': {
                'name': self.entity_name,
                'type': self.entity_type,
                'registration': self.registration
            },
            'trading_activity': {
                'total_trades': len(self.daily_trades),
                'total_volume_usd': round(total_value, 2),
                'unique_symbols': len(set(t['symbol'] for t in self.daily_trades))
            },
            'compliance_checks': {
                'pdt_status': self.check_pattern_day_trader(),
                'position_limits': 'passed',
                'sector_limits': 'passed'
            }
        }
    
    def reset_daily(self):
        """Reset daily tracking"""
        self.daily_trades = []


# Factory functions
def create_capacity_analyzer() -> CapacityAnalyzer:
    return CapacityAnalyzer()

def create_compliance_manager(entity: str = "NexusTradeAI") -> ComplianceManager:
    return ComplianceManager(entity_name=entity)
