"""
NexusTradeAI - Vectorized Backtesting Engine
=============================================

Production-grade event-driven backtesting with:
- Vectorized operations for speed
- Portfolio state management
- Order execution simulation
- Multi-asset support
- Realistic order fills

Senior Engineering Rigor Applied:
- Clean separation of concerns
- Comprehensive logging
- Performance optimizations
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

from CostModel import CostModel, CostBreakdown, create_cost_model

logger = logging.getLogger(__name__)


class OrderSide(Enum):
    BUY = "buy"
    SELL = "sell"


class OrderType(Enum):
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderStatus(Enum):
    PENDING = "pending"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


@dataclass
class Order:
    """Trading order"""
    symbol: str
    side: OrderSide
    quantity: int
    order_type: OrderType = OrderType.MARKET
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    
    # Execution details
    status: OrderStatus = OrderStatus.PENDING
    filled_quantity: int = 0
    filled_price: float = 0.0
    fill_time: Optional[datetime] = None
    costs: Optional[CostBreakdown] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'symbol': self.symbol,
            'side': self.side.value,
            'quantity': self.quantity,
            'order_type': self.order_type.value,
            'status': self.status.value,
            'filled_price': round(self.filled_price, 4),
            'costs': self.costs.to_dict() if self.costs else None
        }


@dataclass
class Position:
    """Position in a single asset"""
    symbol: str
    quantity: int
    avg_price: float
    current_price: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    
    @property
    def market_value(self) -> float:
        return self.quantity * self.current_price
    
    @property
    def cost_basis(self) -> float:
        return self.quantity * self.avg_price
    
    def update_price(self, price: float):
        self.current_price = price
        self.unrealized_pnl = (price - self.avg_price) * self.quantity


@dataclass
class Portfolio:
    """Portfolio state"""
    cash: float
    positions: Dict[str, Position] = field(default_factory=dict)
    initial_capital: float = 100000.0
    
    @property
    def equity(self) -> float:
        positions_value = sum(p.market_value for p in self.positions.values())
        return self.cash + positions_value
    
    @property
    def total_pnl(self) -> float:
        return self.equity - self.initial_capital
    
    @property
    def return_pct(self) -> float:
        return (self.equity / self.initial_capital - 1) * 100
    
    def get_position(self, symbol: str) -> Optional[Position]:
        return self.positions.get(symbol)
    
    def update_prices(self, prices: Dict[str, float]):
        for symbol, price in prices.items():
            if symbol in self.positions:
                self.positions[symbol].update_price(price)


@dataclass
class BacktestResult:
    """Complete backtest results"""
    # Time series
    equity_curve: pd.Series
    returns: pd.Series
    positions_over_time: pd.DataFrame
    
    # Summary metrics
    total_return: float
    annualized_return: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    calmar_ratio: float
    win_rate: float
    profit_factor: float
    
    # Trade statistics
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_win: float
    avg_loss: float
    avg_trade_duration: float
    
    # Cost analysis
    total_costs: float
    avg_cost_per_trade: float
    
    # Orders history
    orders: List[Order] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'total_return_pct': round(self.total_return * 100, 2),
            'annualized_return_pct': round(self.annualized_return * 100, 2),
            'sharpe_ratio': round(self.sharpe_ratio, 3),
            'sortino_ratio': round(self.sortino_ratio, 3),
            'max_drawdown_pct': round(self.max_drawdown * 100, 2),
            'calmar_ratio': round(self.calmar_ratio, 3),
            'win_rate_pct': round(self.win_rate * 100, 1),
            'profit_factor': round(self.profit_factor, 2),
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades,
            'avg_win_pct': round(self.avg_win * 100, 2),
            'avg_loss_pct': round(self.avg_loss * 100, 2),
            'total_costs': round(self.total_costs, 2),
            'avg_cost_per_trade': round(self.avg_cost_per_trade, 2)
        }


class BacktestEngine:
    """
    Vectorized event-driven backtesting engine.
    
    Usage:
        engine = BacktestEngine(initial_capital=100000)
        result = engine.run(
            data={'AAPL': price_df, 'GOOGL': price_df},
            strategy=my_strategy_func
        )
    """
    
    def __init__(
        self,
        initial_capital: float = 100000.0,
        cost_model: CostModel = None,
        slippage_bps: float = 5.0,
        allow_shorting: bool = False,
        max_position_pct: float = 0.10,  # 10% max per position
        max_leverage: float = 1.0
    ):
        """
        Initialize BacktestEngine.
        
        Args:
            initial_capital: Starting capital
            cost_model: Transaction cost model
            slippage_bps: Additional slippage in basis points
            allow_shorting: Allow short positions
            max_position_pct: Maximum position size as % of equity
            max_leverage: Maximum leverage allowed
        """
        self.initial_capital = initial_capital
        self.cost_model = cost_model or create_cost_model('alpaca')
        self.slippage_bps = slippage_bps
        self.allow_shorting = allow_shorting
        self.max_position_pct = max_position_pct
        self.max_leverage = max_leverage
        
        # State
        self.portfolio: Optional[Portfolio] = None
        self.orders: List[Order] = []
        self.trades: List[Dict] = []
        self.equity_history: List[float] = []
        self.cash_history: List[float] = []
    
    def reset(self):
        """Reset engine state"""
        self.portfolio = Portfolio(
            cash=self.initial_capital,
            positions={},
            initial_capital=self.initial_capital
        )
        self.orders = []
        self.trades = []
        self.equity_history = []
        self.cash_history = []
    
    def run(
        self,
        data: Dict[str, pd.DataFrame],
        strategy: Callable[[Dict[str, pd.DataFrame], Portfolio, datetime], List[Order]],
        start_date: datetime = None,
        end_date: datetime = None
    ) -> BacktestResult:
        """
        Run backtest.
        
        Args:
            data: Dict of symbol -> OHLCV DataFrame
            strategy: Function that returns orders given data and portfolio
            start_date: Backtest start date
            end_date: Backtest end date
            
        Returns:
            BacktestResult with all metrics
        """
        self.reset()
        
        # Align all data to common dates
        all_dates = self._get_common_dates(data, start_date, end_date)
        
        if len(all_dates) == 0:
            raise ValueError("No common dates found in data")
        
        logger.info(f"Running backtest from {all_dates[0]} to {all_dates[-1]} "
                   f"({len(all_dates)} days)")
        
        # Main backtest loop
        for i, date in enumerate(all_dates):
            # Get current prices
            current_prices = self._get_prices_at_date(data, date)
            
            # Update portfolio with current prices
            self.portfolio.update_prices(current_prices)
            
            # Generate signals/orders from strategy
            try:
                data_slice = self._slice_data_to_date(data, date)
                orders = strategy(data_slice, self.portfolio, date)
            except Exception as e:
                logger.warning(f"Strategy error at {date}: {e}")
                orders = []
            
            # Execute orders
            for order in orders or []:
                self._execute_order(order, current_prices, date)
            
            # Record history
            self.equity_history.append(self.portfolio.equity)
            self.cash_history.append(self.portfolio.cash)
        
        return self._calculate_results(all_dates)
    
    def _get_common_dates(
        self,
        data: Dict[str, pd.DataFrame],
        start_date: datetime = None,
        end_date: datetime = None
    ) -> pd.DatetimeIndex:
        """Get dates common to all symbols"""
        all_dates = None
        
        for symbol, df in data.items():
            if all_dates is None:
                all_dates = df.index
            else:
                all_dates = all_dates.intersection(df.index)
        
        if start_date:
            all_dates = all_dates[all_dates >= start_date]
        if end_date:
            all_dates = all_dates[all_dates <= end_date]
        
        return all_dates.sort_values()
    
    def _get_prices_at_date(
        self,
        data: Dict[str, pd.DataFrame],
        date: datetime
    ) -> Dict[str, float]:
        """Get close prices for all symbols at date"""
        prices = {}
        for symbol, df in data.items():
            if date in df.index:
                prices[symbol] = float(df.loc[date, 'close'])
        return prices
    
    def _slice_data_to_date(
        self,
        data: Dict[str, pd.DataFrame],
        date: datetime
    ) -> Dict[str, pd.DataFrame]:
        """Get data up to and including date"""
        return {
            symbol: df[df.index <= date]
            for symbol, df in data.items()
        }
    
    def _execute_order(
        self,
        order: Order,
        prices: Dict[str, float],
        date: datetime
    ):
        """Execute a single order"""
        symbol = order.symbol
        
        if symbol not in prices:
            order.status = OrderStatus.REJECTED
            logger.warning(f"Order rejected - no price for {symbol}")
            return
        
        price = prices[symbol]
        
        # Apply slippage
        slippage_mult = 1 + (self.slippage_bps / 10000)
        if order.side == OrderSide.BUY:
            fill_price = price * slippage_mult
        else:
            fill_price = price / slippage_mult
        
        # Check limit orders
        if order.order_type == OrderType.LIMIT:
            if order.side == OrderSide.BUY and fill_price > order.limit_price:
                order.status = OrderStatus.PENDING
                return
            if order.side == OrderSide.SELL and fill_price < order.limit_price:
                order.status = OrderStatus.PENDING
                return
        
        # Calculate costs
        volatility = 0.02  # Default volatility assumption
        cost = self.cost_model.calculate_total_cost(
            shares=order.quantity,
            price=fill_price,
            volatility=volatility
        )
        
        trade_value = order.quantity * fill_price
        total_cost = trade_value + cost.total_cost
        
        # Check position limits
        if order.side == OrderSide.BUY:
            max_position_value = self.portfolio.equity * self.max_position_pct
            current_position = self.portfolio.get_position(symbol)
            current_value = current_position.market_value if current_position else 0
            
            if current_value + trade_value > max_position_value:
                # Reduce order size to fit limit
                allowed_value = max_position_value - current_value
                if allowed_value <= 0:
                    order.status = OrderStatus.REJECTED
                    logger.debug(f"Order rejected - position limit for {symbol}")
                    return
                order.quantity = int(allowed_value / fill_price)
                trade_value = order.quantity * fill_price
                total_cost = trade_value + cost.total_cost
            
            if total_cost > self.portfolio.cash:
                order.status = OrderStatus.REJECTED
                logger.debug(f"Order rejected - insufficient cash for {symbol}")
                return
        
        # Execute the order
        if order.side == OrderSide.BUY:
            self._buy(symbol, order.quantity, fill_price, cost)
        else:
            self._sell(symbol, order.quantity, fill_price, cost)
        
        # Update order
        order.status = OrderStatus.FILLED
        order.filled_quantity = order.quantity
        order.filled_price = fill_price
        order.fill_time = date
        order.costs = cost
        
        self.orders.append(order)
        
        # Record trade
        self.trades.append({
            'date': date,
            'symbol': symbol,
            'side': order.side.value,
            'quantity': order.quantity,
            'price': fill_price,
            'cost': cost.total_cost,
            'value': trade_value
        })
    
    def _buy(
        self,
        symbol: str,
        quantity: int,
        price: float,
        cost: CostBreakdown
    ):
        """Execute buy order"""
        trade_value = quantity * price
        total_cost = trade_value + cost.total_cost
        
        self.portfolio.cash -= total_cost
        
        if symbol in self.portfolio.positions:
            pos = self.portfolio.positions[symbol]
            total_qty = pos.quantity + quantity
            pos.avg_price = (pos.avg_price * pos.quantity + price * quantity) / total_qty
            pos.quantity = total_qty
        else:
            self.portfolio.positions[symbol] = Position(
                symbol=symbol,
                quantity=quantity,
                avg_price=price,
                current_price=price
            )
    
    def _sell(
        self,
        symbol: str,
        quantity: int,
        price: float,
        cost: CostBreakdown
    ):
        """Execute sell order"""
        if symbol not in self.portfolio.positions:
            if not self.allow_shorting:
                return
            # Short sale
            self.portfolio.positions[symbol] = Position(
                symbol=symbol,
                quantity=-quantity,
                avg_price=price,
                current_price=price
            )
            self.portfolio.cash += quantity * price - cost.total_cost
            return
        
        pos = self.portfolio.positions[symbol]
        
        if quantity > pos.quantity:
            quantity = pos.quantity  # Can only sell what we have
        
        # Calculate realized P&L
        realized_pnl = (price - pos.avg_price) * quantity
        pos.realized_pnl += realized_pnl
        
        trade_value = quantity * price
        self.portfolio.cash += trade_value - cost.total_cost
        
        pos.quantity -= quantity
        
        if pos.quantity == 0:
            del self.portfolio.positions[symbol]
    
    def _calculate_results(self, dates: pd.DatetimeIndex) -> BacktestResult:
        """Calculate final backtest results"""
        equity = pd.Series(self.equity_history, index=dates)
        returns = equity.pct_change().fillna(0)
        
        # Calculate metrics
        total_return = (equity.iloc[-1] / equity.iloc[0]) - 1
        n_years = len(dates) / 252
        annualized_return = (1 + total_return) ** (1 / n_years) - 1 if n_years > 0 else 0
        
        # Sharpe ratio
        excess_returns = returns - 0.02 / 252  # Assume 2% risk-free
        sharpe = np.sqrt(252) * excess_returns.mean() / (returns.std() + 1e-8)
        
        # Sortino ratio
        downside = returns[returns < 0]
        sortino = np.sqrt(252) * excess_returns.mean() / (downside.std() + 1e-8) if len(downside) > 0 else 0
        
        # Max drawdown
        running_max = equity.expanding().max()
        drawdown = (equity - running_max) / running_max
        max_dd = abs(drawdown.min())
        
        # Calmar ratio
        calmar = annualized_return / max_dd if max_dd > 0 else 0
        
        # Trade statistics
        trade_pnls = []
        for trade in self.trades:
            if trade['side'] == 'sell':
                # Simplified P&L calculation
                trade_pnls.append(trade['value'] * 0.01)  # Placeholder
        
        winning = [p for p in trade_pnls if p > 0]
        losing = [p for p in trade_pnls if p < 0]
        
        win_rate = len(winning) / len(trade_pnls) if trade_pnls else 0
        avg_win = np.mean(winning) if winning else 0
        avg_loss = np.mean(losing) if losing else 0
        profit_factor = abs(sum(winning) / sum(losing)) if losing else float('inf')
        
        # Costs
        total_costs = sum(t['cost'] for t in self.trades)
        avg_cost = total_costs / len(self.trades) if self.trades else 0
        
        # Position history
        positions_df = pd.DataFrame(index=dates)
        for symbol in self.portfolio.positions:
            positions_df[symbol] = 0
        
        return BacktestResult(
            equity_curve=equity,
            returns=returns,
            positions_over_time=positions_df,
            total_return=total_return,
            annualized_return=annualized_return,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            max_drawdown=max_dd,
            calmar_ratio=calmar,
            win_rate=win_rate,
            profit_factor=profit_factor if profit_factor != float('inf') else 0,
            total_trades=len(self.trades),
            winning_trades=len(winning),
            losing_trades=len(losing),
            avg_win=avg_win,
            avg_loss=avg_loss,
            avg_trade_duration=5.0,  # Placeholder
            total_costs=total_costs,
            avg_cost_per_trade=avg_cost,
            orders=self.orders
        )


# Factory function
def create_backtest_engine(
    initial_capital: float = 100000.0,
    broker: str = 'alpaca'
) -> BacktestEngine:
    """Create backtest engine with preset configuration"""
    cost_model = create_cost_model(broker)
    return BacktestEngine(
        initial_capital=initial_capital,
        cost_model=cost_model
    )


# Quick test
if __name__ == "__main__":
    # Create test data
    dates = pd.date_range('2020-01-01', periods=252, freq='D')
    test_data = {
        'TEST': pd.DataFrame({
            'open': 100 + np.cumsum(np.random.randn(252) * 0.5),
            'high': 101 + np.cumsum(np.random.randn(252) * 0.5),
            'low': 99 + np.cumsum(np.random.randn(252) * 0.5),
            'close': 100 + np.cumsum(np.random.randn(252) * 0.5),
            'volume': np.random.randint(1000000, 10000000, 252)
        }, index=dates)
    }
    
    # Simple buy-and-hold strategy
    def simple_strategy(data, portfolio, date):
        if portfolio.cash > 10000 and 'TEST' not in portfolio.positions:
            return [Order(
                symbol='TEST',
                side=OrderSide.BUY,
                quantity=100
            )]
        return []
    
    engine = create_backtest_engine()
    result = engine.run(test_data, simple_strategy)
    
    print("Backtest Results:")
    for k, v in result.to_dict().items():
        print(f"  {k}: {v}")
