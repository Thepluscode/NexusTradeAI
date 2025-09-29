"""
NexusTradeAI - Advanced Risk Management System
==============================================

This module implements comprehensive risk management algorithms
for automated crypto trading, based on the FCT research analysis.
"""

import logging
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RiskLevel(Enum):
    """Risk tolerance levels for different user profiles"""
    CONSERVATIVE = "conservative"
    MODERATE = "moderate" 
    AGGRESSIVE = "aggressive"

class OrderType(Enum):
    """Supported order types"""
    MARKET = "market"
    LIMIT = "limit"
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"
    OCO = "one_cancels_other"

@dataclass
class Position:
    """Represents a trading position"""
    symbol: str
    size: float
    entry_price: float
    current_price: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    timestamp: datetime = None
    
    def __post_init__(self):
        if self.timestamp is None:
            self.timestamp = datetime.now()
    
    @property
    def unrealized_pnl(self) -> float:
        """Calculate unrealized profit/loss"""
        return (self.current_price - self.entry_price) * self.size
    
    @property
    def unrealized_pnl_percent(self) -> float:
        """Calculate unrealized P&L as percentage"""
        if self.entry_price == 0:
            return 0.0
        return ((self.current_price - self.entry_price) / self.entry_price) * 100

@dataclass
class RiskParameters:
    """Risk management configuration"""
    risk_per_trade: float = 0.01  # 1% of account per trade
    max_portfolio_risk: float = 0.05  # 5% total portfolio risk
    max_positions: int = 10
    max_correlation: float = 0.7  # Maximum correlation between positions
    stop_loss_percent: float = 0.05  # 5% stop loss
    take_profit_percent: float = 0.10  # 10% take profit
    trailing_stop_percent: float = 0.03  # 3% trailing stop
    max_drawdown_percent: float = 0.20  # 20% maximum drawdown
    
    @classmethod
    def from_risk_level(cls, risk_level: RiskLevel) -> 'RiskParameters':
        """Create risk parameters based on user risk level"""
        if risk_level == RiskLevel.CONSERVATIVE:
            return cls(
                risk_per_trade=0.005,  # 0.5%
                max_portfolio_risk=0.02,  # 2%
                stop_loss_percent=0.03,  # 3%
                take_profit_percent=0.06,  # 6%
                max_drawdown_percent=0.10  # 10%
            )
        elif risk_level == RiskLevel.MODERATE:
            return cls(
                risk_per_trade=0.01,  # 1%
                max_portfolio_risk=0.05,  # 5%
                stop_loss_percent=0.05,  # 5%
                take_profit_percent=0.10,  # 10%
                max_drawdown_percent=0.15  # 15%
            )
        else:  # AGGRESSIVE
            return cls(
                risk_per_trade=0.02,  # 2%
                max_portfolio_risk=0.10,  # 10%
                stop_loss_percent=0.08,  # 8%
                take_profit_percent=0.15,  # 15%
                max_drawdown_percent=0.25  # 25%
            )

class RiskManager:
    """
    Advanced Risk Management System for NexusTradeAI
    
    Implements position sizing, stop-loss management, portfolio-level
    risk controls, and circuit breakers.
    """
    
    def __init__(self, account_balance: float, risk_params: RiskParameters):
        self.account_balance = account_balance
        self.initial_balance = account_balance
        self.risk_params = risk_params
        self.positions: Dict[str, Position] = {}
        self.trade_history: List[Dict] = []
        self.emergency_stop = False
        
    def calculate_position_size(self, 
                              symbol: str, 
                              entry_price: float, 
                              stop_loss_price: float) -> float:
        """
        Calculate optimal position size based on risk per trade
        
        Formula: Position Size = Risk Amount / (Entry Price - Stop Loss Price)
        """
        if entry_price <= 0 or stop_loss_price <= 0:
            raise ValueError("Entry price and stop loss must be positive")
            
        risk_amount = self.account_balance * self.risk_params.risk_per_trade
        price_difference = abs(entry_price - stop_loss_price)
        
        if price_difference == 0:
            logger.warning(f"Zero price difference for {symbol}, using minimum position")
            return 0.001  # Minimum position size
            
        position_size = risk_amount / price_difference
        
        # Apply portfolio-level constraints
        max_position_value = self.account_balance * 0.25  # Max 25% in single position
        max_position_size = max_position_value / entry_price
        
        final_size = min(position_size, max_position_size)
        
        logger.info(f"Position sizing for {symbol}: "
                   f"Risk Amount: ${risk_amount:.2f}, "
                   f"Price Diff: ${price_difference:.4f}, "
                   f"Calculated Size: {final_size:.6f}")
        
        return final_size
    
    def calculate_stop_loss_take_profit(self, 
                                      entry_price: float, 
                                      is_long: bool = True) -> Tuple[float, float]:
        """
        Calculate stop-loss and take-profit levels
        """
        if is_long:
            stop_loss = entry_price * (1 - self.risk_params.stop_loss_percent)
            take_profit = entry_price * (1 + self.risk_params.take_profit_percent)
        else:  # Short position
            stop_loss = entry_price * (1 + self.risk_params.stop_loss_percent)
            take_profit = entry_price * (1 - self.risk_params.take_profit_percent)
            
        return stop_loss, take_profit
    
    def validate_new_position(self, symbol: str, position_size: float, entry_price: float) -> bool:
        """
        Validate if a new position can be opened based on risk rules
        """
        # Check if emergency stop is active
        if self.emergency_stop:
            logger.warning("Emergency stop active - no new positions allowed")
            return False
            
        # Check maximum number of positions
        if len(self.positions) >= self.risk_params.max_positions:
            logger.warning(f"Maximum positions ({self.risk_params.max_positions}) reached")
            return False
            
        # Check portfolio risk exposure
        current_risk = self._calculate_portfolio_risk()
        position_value = position_size * entry_price
        position_risk = position_value / self.account_balance
        
        if current_risk + position_risk > self.risk_params.max_portfolio_risk:
            logger.warning(f"Position would exceed portfolio risk limit: "
                         f"{(current_risk + position_risk)*100:.1f}% > "
                         f"{self.risk_params.max_portfolio_risk*100:.1f}%")
            return False
            
        # Check correlation with existing positions (simplified)
        if self._check_correlation_risk(symbol):
            logger.warning(f"High correlation risk detected for {symbol}")
            return False
            
        return True

    def open_position(self,
                     symbol: str,
                     size: float,
                     entry_price: float,
                     current_price: float) -> bool:
        """
        Open a new trading position with risk management
        """
        stop_loss, take_profit = self.calculate_stop_loss_take_profit(entry_price)

        if not self.validate_new_position(symbol, size, entry_price):
            return False

        position = Position(
            symbol=symbol,
            size=size,
            entry_price=entry_price,
            current_price=current_price,
            stop_loss=stop_loss,
            take_profit=take_profit
        )

        self.positions[symbol] = position

        # Log the trade
        self.trade_history.append({
            'timestamp': datetime.now(),
            'action': 'OPEN',
            'symbol': symbol,
            'size': size,
            'price': entry_price,
            'stop_loss': stop_loss,
            'take_profit': take_profit
        })

        logger.info(f"Opened position: {symbol} size={size:.6f} @ ${entry_price:.4f}")
        return True

    def close_position(self, symbol: str, exit_price: float, reason: str = "Manual") -> bool:
        """
        Close an existing position
        """
        if symbol not in self.positions:
            logger.warning(f"No position found for {symbol}")
            return False

        position = self.positions[symbol]
        pnl = (exit_price - position.entry_price) * position.size
        pnl_percent = ((exit_price - position.entry_price) / position.entry_price) * 100

        # Update account balance
        self.account_balance += pnl

        # Log the trade
        self.trade_history.append({
            'timestamp': datetime.now(),
            'action': 'CLOSE',
            'symbol': symbol,
            'size': position.size,
            'entry_price': position.entry_price,
            'exit_price': exit_price,
            'pnl': pnl,
            'pnl_percent': pnl_percent,
            'reason': reason
        })

        # Remove position
        del self.positions[symbol]

        logger.info(f"Closed position: {symbol} @ ${exit_price:.4f} - "
                   f"P&L: ${pnl:.2f} ({pnl_percent:.2f}%) - Reason: {reason}")

        return True

    def update_position_prices(self, price_updates: Dict[str, float]) -> List[str]:
        """
        Update current prices and check for stop-loss/take-profit triggers

        Returns list of symbols that should be closed
        """
        positions_to_close = []

        for symbol, current_price in price_updates.items():
            if symbol in self.positions:
                position = self.positions[symbol]
                position.current_price = current_price

                # Check stop-loss
                if (position.stop_loss and
                    ((position.size > 0 and current_price <= position.stop_loss) or
                     (position.size < 0 and current_price >= position.stop_loss))):
                    positions_to_close.append((symbol, current_price, "STOP_LOSS"))

                # Check take-profit
                elif (position.take_profit and
                      ((position.size > 0 and current_price >= position.take_profit) or
                       (position.size < 0 and current_price <= position.take_profit))):
                    positions_to_close.append((symbol, current_price, "TAKE_PROFIT"))

                # Update trailing stop
                self._update_trailing_stop(symbol, current_price)

        # Close triggered positions
        closed_symbols = []
        for symbol, price, reason in positions_to_close:
            if self.close_position(symbol, price, reason):
                closed_symbols.append(symbol)

        # Check for emergency stop conditions
        self._check_emergency_conditions()

        return closed_symbols

    def _update_trailing_stop(self, symbol: str, current_price: float):
        """
        Update trailing stop-loss for a position
        """
        if symbol not in self.positions:
            return

        position = self.positions[symbol]
        trailing_distance = current_price * self.risk_params.trailing_stop_percent

        if position.size > 0:  # Long position
            new_stop = current_price - trailing_distance
            if position.stop_loss is None or new_stop > position.stop_loss:
                position.stop_loss = new_stop
                logger.debug(f"Updated trailing stop for {symbol}: ${new_stop:.4f}")
        else:  # Short position
            new_stop = current_price + trailing_distance
            if position.stop_loss is None or new_stop < position.stop_loss:
                position.stop_loss = new_stop
                logger.debug(f"Updated trailing stop for {symbol}: ${new_stop:.4f}")

    def _calculate_portfolio_risk(self) -> float:
        """
        Calculate current portfolio risk exposure
        """
        total_position_value = 0
        for position in self.positions.values():
            position_value = abs(position.size * position.current_price)
            total_position_value += position_value

        return total_position_value / self.account_balance if self.account_balance > 0 else 0

    def _check_correlation_risk(self, new_symbol: str) -> bool:
        """
        Check if adding new symbol would create excessive correlation risk
        Simplified implementation - in practice, use historical correlation data
        """
        # Simplified correlation check based on asset type
        crypto_majors = ['BTC', 'ETH', 'ADA', 'DOT']
        crypto_alts = ['LINK', 'UNI', 'SUSHI', 'AAVE']

        new_category = None
        if any(major in new_symbol for major in crypto_majors):
            new_category = 'majors'
        elif any(alt in new_symbol for alt in crypto_alts):
            new_category = 'alts'

        if new_category:
            same_category_count = 0
            for symbol in self.positions.keys():
                if new_category == 'majors' and any(major in symbol for major in crypto_majors):
                    same_category_count += 1
                elif new_category == 'alts' and any(alt in symbol for alt in crypto_alts):
                    same_category_count += 1

            # Limit positions in same category
            if same_category_count >= 3:
                return True

        return False

    def _check_emergency_conditions(self):
        """
        Check for emergency stop conditions (circuit breakers)
        """
        # Calculate current drawdown
        current_drawdown = (self.initial_balance - self.account_balance) / self.initial_balance

        if current_drawdown >= self.risk_params.max_drawdown_percent:
            self.emergency_stop = True
            logger.critical(f"EMERGENCY STOP ACTIVATED - Drawdown: {current_drawdown*100:.1f}%")

            # Close all positions immediately
            for symbol in list(self.positions.keys()):
                position = self.positions[symbol]
                self.close_position(symbol, position.current_price, "EMERGENCY_STOP")

    def get_portfolio_summary(self) -> Dict:
        """
        Get comprehensive portfolio summary
        """
        total_unrealized_pnl = sum(pos.unrealized_pnl for pos in self.positions.values())
        total_position_value = sum(abs(pos.size * pos.current_price) for pos in self.positions.values())

        return {
            'account_balance': self.account_balance,
            'initial_balance': self.initial_balance,
            'total_unrealized_pnl': total_unrealized_pnl,
            'total_position_value': total_position_value,
            'portfolio_risk': self._calculate_portfolio_risk(),
            'num_positions': len(self.positions),
            'emergency_stop': self.emergency_stop,
            'drawdown_percent': ((self.initial_balance - self.account_balance) / self.initial_balance) * 100,
            'positions': {
                symbol: {
                    'size': pos.size,
                    'entry_price': pos.entry_price,
                    'current_price': pos.current_price,
                    'unrealized_pnl': pos.unrealized_pnl,
                    'unrealized_pnl_percent': pos.unrealized_pnl_percent,
                    'stop_loss': pos.stop_loss,
                    'take_profit': pos.take_profit
                }
                for symbol, pos in self.positions.items()
            }
        }

    def _check_emergency_conditions(self):
        """
        Check for emergency stop conditions (circuit breakers)
        """
        # Calculate current drawdown
        current_drawdown = (self.initial_balance - self.account_balance) / self.initial_balance

        if current_drawdown >= self.risk_params.max_drawdown_percent:
            self.emergency_stop = True
            logger.critical(f"EMERGENCY STOP ACTIVATED - Drawdown: {current_drawdown*100:.1f}%")

            # Close all positions immediately
            for symbol in list(self.positions.keys()):
                position = self.positions[symbol]
                self.close_position(symbol, position.current_price, "EMERGENCY_STOP")

    def reset_emergency_stop(self):
        """
        Reset emergency stop (only allow manual reset)
        """
        self.emergency_stop = False
        logger.info("Emergency stop has been manually reset")

    def get_portfolio_summary(self) -> Dict:
        """
        Get comprehensive portfolio risk summary
        """
        total_pnl = 0
        total_exposure = 0
        positions_summary = []

        for symbol, position in self.positions.items():
            pnl = position.unrealized_pnl
            pnl_percent = position.unrealized_pnl_percent
            exposure = abs(position.size * position.current_price)

            total_pnl += pnl
            total_exposure += exposure

            positions_summary.append({
                'symbol': symbol,
                'size': position.size,
                'entry_price': position.entry_price,
                'current_price': position.current_price,
                'unrealized_pnl': pnl,
                'unrealized_pnl_percent': pnl_percent,
                'stop_loss': position.stop_loss,
                'take_profit': position.take_profit,
                'exposure': exposure
            })

        current_drawdown = (self.initial_balance - self.account_balance) / self.initial_balance
        portfolio_risk = self._calculate_portfolio_risk()

        return {
            'account_balance': self.account_balance,
            'initial_balance': self.initial_balance,
            'total_pnl': total_pnl,
            'total_exposure': total_exposure,
            'portfolio_risk_percent': portfolio_risk * 100,
            'current_drawdown_percent': current_drawdown * 100,
            'active_positions': len(self.positions),
            'emergency_stop_active': self.emergency_stop,
            'positions': positions_summary,
            'risk_limits': {
                'max_positions': self.risk_params.max_positions,
                'max_portfolio_risk_percent': self.risk_params.max_portfolio_risk * 100,
                'max_drawdown_percent': self.risk_params.max_drawdown_percent * 100,
                'risk_per_trade_percent': self.risk_params.risk_per_trade * 100
            }
        }

    def optimize_portfolio(self) -> List[str]:
        """
        Optimize portfolio by identifying positions to close or adjust
        Returns list of optimization recommendations
        """
        recommendations = []

        # Check for positions with excessive losses
        for symbol, position in self.positions.items():
            pnl_percent = position.unrealized_pnl_percent

            if pnl_percent < -10:  # More than 10% loss
                recommendations.append(f"Consider closing {symbol} - Large unrealized loss: {pnl_percent:.1f}%")

            # Check for positions held too long without progress
            days_held = (datetime.now() - position.timestamp).days
            if days_held > 7 and abs(pnl_percent) < 2:  # Held > 7 days with < 2% movement
                recommendations.append(f"Consider closing {symbol} - Stagnant position for {days_held} days")

        # Check portfolio concentration
        portfolio_risk = self._calculate_portfolio_risk()
        if portfolio_risk > 0.8:  # More than 80% of account in positions
            recommendations.append("Portfolio over-leveraged - consider reducing position sizes")

        return recommendations
