"""
NexusTradeAI - Position Sizing Engine
======================================

Production-grade position sizing with:
- Kelly Criterion implementation
- Fixed fractional sizing
- Volatility-adjusted sizing
- Risk parity

Senior Engineering Rigor Applied:
- Multiple sizing methods
- Conservative estimates
- Maximum limits
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class SizingMethod(Enum):
    """Position sizing methods"""
    FIXED_FRACTIONAL = "fixed_fractional"
    KELLY = "kelly"
    HALF_KELLY = "half_kelly"
    VOLATILITY_TARGET = "volatility_target"
    RISK_PARITY = "risk_parity"
    EQUAL_WEIGHT = "equal_weight"


@dataclass
class PositionSize:
    """Position size recommendation"""
    symbol: str
    shares: int
    dollar_amount: float
    portfolio_weight: float
    risk_contribution: float
    sizing_method: SizingMethod
    confidence: float
    
    # Limits applied
    capped: bool = False
    cap_reason: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'symbol': self.symbol,
            'shares': self.shares,
            'dollar_amount': round(self.dollar_amount, 2),
            'portfolio_weight_pct': round(self.portfolio_weight * 100, 2),
            'risk_contribution_pct': round(self.risk_contribution * 100, 2),
            'method': self.sizing_method.value,
            'confidence': round(self.confidence, 2),
            'capped': self.capped,
            'cap_reason': self.cap_reason
        }


class PositionSizer:
    """
    Advanced position sizing engine.
    
    Implements multiple sizing methods with risk controls.
    """
    
    def __init__(
        self,
        default_method: SizingMethod = SizingMethod.HALF_KELLY,
        max_position_pct: float = 0.10,      # 10% max per position
        max_sector_pct: float = 0.25,        # 25% max per sector
        max_total_exposure: float = 1.0,     # 100% max (no leverage default)
        min_position_size: float = 1000.0    # $1000 minimum
    ):
        """
        Initialize PositionSizer.
        
        Args:
            default_method: Default sizing method
            max_position_pct: Maximum single position as % of portfolio
            max_sector_pct: Maximum sector exposure
            max_total_exposure: Maximum total exposure (>1 = leverage)
            min_position_size: Minimum position value
        """
        self.default_method = default_method
        self.max_position = max_position_pct
        self.max_sector = max_sector_pct
        self.max_exposure = max_total_exposure
        self.min_size = min_position_size
    
    def calculate_kelly(
        self,
        win_rate: float,
        avg_win: float,
        avg_loss: float
    ) -> float:
        """
        Calculate Kelly fraction.
        
        Kelly = (p * b - q) / b
        where p = win rate, q = 1-p, b = win/loss ratio
        """
        if avg_loss == 0 or win_rate <= 0 or win_rate >= 1:
            return 0.0
        
        p = win_rate
        q = 1 - win_rate
        b = abs(avg_win / avg_loss)
        
        kelly = (p * b - q) / b
        
        # Cap at reasonable levels
        kelly = max(0, min(0.5, kelly))
        
        return kelly
    
    def calculate_volatility_weight(
        self,
        symbol_vol: float,
        target_vol: float = 0.15
    ) -> float:
        """
        Calculate weight to achieve target volatility.
        
        weight = target_vol / asset_vol
        """
        if symbol_vol <= 0:
            return 0.0
        
        weight = target_vol / symbol_vol
        return min(1.0, weight)
    
    def calculate_risk_parity(
        self,
        volatilities: Dict[str, float],
        correlations: pd.DataFrame = None
    ) -> Dict[str, float]:
        """
        Calculate risk parity weights.
        
        Each asset contributes equal risk.
        """
        if not volatilities:
            return {}
        
        # Simple risk parity: inverse volatility weighting
        inv_vols = {s: 1 / v if v > 0 else 0 for s, v in volatilities.items()}
        total_inv_vol = sum(inv_vols.values())
        
        if total_inv_vol == 0:
            n = len(volatilities)
            return {s: 1 / n for s in volatilities}
        
        weights = {s: v / total_inv_vol for s, v in inv_vols.items()}
        
        return weights
    
    def size_position(
        self,
        symbol: str,
        price: float,
        portfolio_value: float,
        method: SizingMethod = None,
        win_rate: float = 0.55,
        avg_win: float = 0.02,
        avg_loss: float = -0.01,
        volatility: float = 0.25,
        signal_confidence: float = 0.7,
        current_exposure: float = 0.0,
        sector: str = None,
        sector_exposure: float = 0.0
    ) -> PositionSize:
        """
        Calculate position size for a new trade.
        
        Args:
            symbol: Symbol to size
            price: Current price
            portfolio_value: Total portfolio value
            method: Sizing method to use
            win_rate: Historical win rate
            avg_win: Average winning trade return
            avg_loss: Average losing trade return
            volatility: Annualized volatility
            signal_confidence: Strategy signal confidence
            current_exposure: Current portfolio exposure
            sector: Sector for limit checks
            sector_exposure: Current sector exposure
        """
        method = method or self.default_method
        
        # Calculate base weight using selected method
        if method == SizingMethod.KELLY:
            base_weight = self.calculate_kelly(win_rate, avg_win, avg_loss)
        elif method == SizingMethod.HALF_KELLY:
            base_weight = self.calculate_kelly(win_rate, avg_win, avg_loss) * 0.5
        elif method == SizingMethod.VOLATILITY_TARGET:
            base_weight = self.calculate_volatility_weight(volatility, 0.15)
        elif method == SizingMethod.FIXED_FRACTIONAL:
            base_weight = 0.02  # 2% per trade
        elif method == SizingMethod.EQUAL_WEIGHT:
            base_weight = 0.10  # 10% per position
        else:
            base_weight = 0.05
        
        # Adjust by signal confidence
        adjusted_weight = base_weight * signal_confidence
        
        # Apply position limit
        capped = False
        cap_reason = ""
        
        if adjusted_weight > self.max_position:
            adjusted_weight = self.max_position
            capped = True
            cap_reason = f"Position limit ({self.max_position * 100}%)"
        
        # Check sector limit
        if sector and sector_exposure + adjusted_weight > self.max_sector:
            adjusted_weight = max(0, self.max_sector - sector_exposure)
            capped = True
            cap_reason = f"Sector limit ({self.max_sector * 100}%)"
        
        # Check total exposure limit
        if current_exposure + adjusted_weight > self.max_exposure:
            adjusted_weight = max(0, self.max_exposure - current_exposure)
            capped = True
            cap_reason = f"Exposure limit ({self.max_exposure * 100}%)"
        
        # Calculate dollar amount and shares
        dollar_amount = portfolio_value * adjusted_weight
        
        # Enforce minimum
        if dollar_amount < self.min_size and dollar_amount > 0:
            dollar_amount = 0
            adjusted_weight = 0
            capped = True
            cap_reason = f"Below minimum (${self.min_size})"
        
        shares = int(dollar_amount / price) if price > 0 else 0
        actual_amount = shares * price
        actual_weight = actual_amount / portfolio_value if portfolio_value > 0 else 0
        
        # Estimate risk contribution (simplified)
        risk_contrib = actual_weight * volatility
        
        return PositionSize(
            symbol=symbol,
            shares=shares,
            dollar_amount=actual_amount,
            portfolio_weight=actual_weight,
            risk_contribution=risk_contrib,
            sizing_method=method,
            confidence=signal_confidence,
            capped=capped,
            cap_reason=cap_reason
        )
    
    def size_portfolio(
        self,
        signals: List[Dict[str, Any]],
        portfolio_value: float,
        prices: Dict[str, float],
        volatilities: Dict[str, float],
        method: SizingMethod = None
    ) -> Dict[str, PositionSize]:
        """
        Size multiple positions for a portfolio rebalance.
        
        Args:
            signals: List of trading signals with symbol, confidence
            portfolio_value: Total portfolio value
            prices: Current prices
            volatilities: Symbol volatilities
        """
        method = method or self.default_method
        
        # Risk parity for portfolio-level sizing
        if method == SizingMethod.RISK_PARITY:
            rp_weights = self.calculate_risk_parity(volatilities)
        else:
            rp_weights = {}
        
        positions = {}
        current_exposure = 0.0
        
        # Sort by confidence (high to low)
        sorted_signals = sorted(signals, key=lambda x: x.get('confidence', 0), reverse=True)
        
        for signal in sorted_signals:
            symbol = signal['symbol']
            confidence = signal.get('confidence', 0.5)
            
            if symbol not in prices:
                continue
            
            vol = volatilities.get(symbol, 0.25)
            
            if method == SizingMethod.RISK_PARITY:
                # Use risk parity weight
                base_weight = rp_weights.get(symbol, 0.1)
                position = PositionSize(
                    symbol=symbol,
                    shares=int(portfolio_value * base_weight / prices[symbol]),
                    dollar_amount=portfolio_value * base_weight,
                    portfolio_weight=base_weight,
                    risk_contribution=base_weight * vol,
                    sizing_method=method,
                    confidence=confidence
                )
            else:
                position = self.size_position(
                    symbol=symbol,
                    price=prices[symbol],
                    portfolio_value=portfolio_value,
                    method=method,
                    volatility=vol,
                    signal_confidence=confidence,
                    current_exposure=current_exposure
                )
            
            if position.shares > 0:
                positions[symbol] = position
                current_exposure += position.portfolio_weight
        
        return positions


# Factory function
def create_position_sizer(
    method: str = 'half_kelly',
    max_position: float = 0.10
) -> PositionSizer:
    """Create position sizer with preset"""
    method_map = {
        'kelly': SizingMethod.KELLY,
        'half_kelly': SizingMethod.HALF_KELLY,
        'fixed': SizingMethod.FIXED_FRACTIONAL,
        'volatility': SizingMethod.VOLATILITY_TARGET,
        'risk_parity': SizingMethod.RISK_PARITY
    }
    return PositionSizer(
        default_method=method_map.get(method, SizingMethod.HALF_KELLY),
        max_position_pct=max_position
    )
