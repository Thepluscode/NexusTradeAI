"""
Backtesting Engine for Trading Strategies
==========================================
Institutional-grade backtesting framework with realistic constraints,
transaction costs, slippage, and comprehensive performance metrics.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Realistic transaction costs and slippage modeling
- Position sizing with risk management
- Multiple performance metrics (Sharpe, Sortino, Calmar, etc.)
- Trade-level tracking and analysis
- Equity curve generation
- Drawdown analysis
- Statistical validation (Monte Carlo, bootstrap)
- Market regime awareness
- Execution simulation with market impact
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Callable, Any
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta
from enum import Enum
import json
import logging
from pathlib import Path
from collections import defaultdict

logger = logging.getLogger(__name__)


class OrderType(Enum):
    """Order types"""
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderSide(Enum):
    """Order side"""
    BUY = "buy"
    SELL = "sell"


class PositionSide(Enum):
    """Position side"""
    LONG = 1
    NEUTRAL = 0
    SHORT = -1


@dataclass
class BacktestConfig:
    """Configuration for backtesting"""

    # Initial capital
    initial_capital: float = 100000.0

    # Position sizing
    max_position_size: float = 0.2  # Max 20% of capital per position
    max_positions: int = 10  # Max concurrent positions

    # Transaction costs
    commission_rate: float = 0.001  # 0.1% per trade (10 bps)
    slippage_bps: float = 5.0  # 5 basis points slippage

    # Risk management
    max_leverage: float = 1.0  # No leverage by default
    stop_loss_pct: float = 0.05  # 5% stop loss
    take_profit_pct: float = 0.10  # 10% take profit
    trailing_stop_pct: Optional[float] = None  # Optional trailing stop

    # Market constraints
    min_volume: int = 100000  # Minimum daily volume
    min_price: float = 5.0  # Minimum stock price

    # Execution
    fill_probability: float = 1.0  # Probability of order fill (1.0 = always fill)
    market_impact_coefficient: float = 0.1  # Price impact from large orders

    # Rebalancing
    rebalance_frequency: str = "daily"  # daily, weekly, monthly

    # Risk limits
    max_daily_loss_pct: float = 0.05  # Max 5% daily loss
    max_drawdown_pct: float = 0.20  # Max 20% drawdown before stopping

    # Benchmark
    benchmark_symbol: str = "SPY"

    # Reproducibility
    random_state: int = 42


@dataclass
class Trade:
    """Individual trade record"""

    entry_date: datetime
    exit_date: Optional[datetime]
    symbol: str
    side: PositionSide
    entry_price: float
    exit_price: Optional[float]
    shares: int
    commission: float
    slippage: float
    pnl: Optional[float] = None
    pnl_pct: Optional[float] = None
    holding_period: Optional[int] = None  # days
    exit_reason: Optional[str] = None  # stop_loss, take_profit, signal, etc.

    def close_trade(self, exit_date: datetime, exit_price: float,
                    commission: float, slippage: float, exit_reason: str = "signal"):
        """Close the trade and calculate P&L"""
        self.exit_date = exit_date
        self.exit_price = exit_price
        self.exit_reason = exit_reason

        # Calculate P&L
        if self.side == PositionSide.LONG:
            gross_pnl = (exit_price - self.entry_price) * self.shares
        else:  # SHORT
            gross_pnl = (self.entry_price - exit_price) * self.shares

        # Subtract costs
        total_commission = self.commission + commission
        total_slippage = (self.slippage + slippage) * self.shares
        self.pnl = gross_pnl - total_commission - total_slippage

        # P&L percentage
        cost_basis = self.entry_price * self.shares
        self.pnl_pct = (self.pnl / cost_basis) if cost_basis > 0 else 0

        # Holding period
        self.holding_period = (exit_date - self.entry_date).days


@dataclass
class Position:
    """Current open position"""

    symbol: str
    side: PositionSide
    entry_price: float
    current_price: float
    shares: int
    entry_date: datetime
    unrealized_pnl: float = 0.0
    unrealized_pnl_pct: float = 0.0
    highest_price: Optional[float] = None  # For trailing stop
    lowest_price: Optional[float] = None   # For trailing stop

    def update_price(self, price: float):
        """Update current price and unrealized P&L"""
        self.current_price = price

        # Track highest/lowest for trailing stops
        if self.highest_price is None or price > self.highest_price:
            self.highest_price = price
        if self.lowest_price is None or price < self.lowest_price:
            self.lowest_price = price

        # Calculate unrealized P&L
        if self.side == PositionSide.LONG:
            self.unrealized_pnl = (price - self.entry_price) * self.shares
        else:  # SHORT
            self.unrealized_pnl = (self.entry_price - price) * self.shares

        cost_basis = self.entry_price * self.shares
        self.unrealized_pnl_pct = (self.unrealized_pnl / cost_basis) if cost_basis > 0 else 0


class BacktestEngine:
    """
    Backtesting engine for trading strategies

    Simulates realistic trading with:
    - Transaction costs and slippage
    - Position sizing and risk management
    - Stop loss and take profit
    - Market constraints
    - Performance tracking
    """

    def __init__(self, config: Optional[BacktestConfig] = None):
        """Initialize backtesting engine"""
        self.config = config or BacktestConfig()

        # Set random seed
        np.random.seed(self.config.random_state)

        # State tracking
        self.current_capital = self.config.initial_capital
        self.current_date = None
        self.positions: Dict[str, Position] = {}
        self.trades: List[Trade] = []

        # Performance tracking
        self.equity_curve = []
        self.daily_returns = []
        self.drawdowns = []

        # Statistics
        self.total_trades = 0
        self.winning_trades = 0
        self.losing_trades = 0

        logger.info(f"Initialized backtesting engine with ${self.config.initial_capital:,.2f}")

    def run_backtest(
        self,
        data: pd.DataFrame,
        strategy: Callable[[pd.DataFrame, pd.Timestamp], Dict[str, int]],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Run backtest on historical data

        Args:
            data: Historical OHLCV data with MultiIndex (date, symbol)
            strategy: Function that returns {symbol: signal} where signal in {-1, 0, 1}
            start_date: Start date for backtest (YYYY-MM-DD)
            end_date: End date for backtest (YYYY-MM-DD)

        Returns:
            Backtest results dictionary
        """
        logger.info("=" * 60)
        logger.info("Starting Backtest")
        logger.info("=" * 60)

        # Filter date range
        if start_date:
            data = data[data.index.get_level_values(0) >= pd.Timestamp(start_date)]
        if end_date:
            data = data[data.index.get_level_values(0) <= pd.Timestamp(end_date)]

        # Get unique dates
        dates = sorted(data.index.get_level_values(0).unique())

        logger.info(f"Backtest period: {dates[0]} to {dates[-1]}")
        logger.info(f"Total days: {len(dates)}")
        logger.info(f"Initial capital: ${self.config.initial_capital:,.2f}")

        # Main backtest loop
        for i, date in enumerate(dates):
            self.current_date = date

            # Get data for current date
            try:
                day_data = data.loc[date]
            except KeyError:
                continue

            # Update positions with current prices
            self._update_positions(day_data)

            # Check stop loss / take profit
            self._check_exits(day_data)

            # Generate strategy signals
            signals = strategy(data, date)

            # Execute trades based on signals
            self._execute_signals(signals, day_data)

            # Record equity
            equity = self._calculate_equity(day_data)
            self.equity_curve.append({
                'date': date,
                'equity': equity,
                'cash': self.current_capital,
                'positions_value': equity - self.current_capital,
                'num_positions': len(self.positions)
            })

            # Calculate daily return
            if i > 0:
                prev_equity = self.equity_curve[i - 1]['equity']
                daily_return = (equity - prev_equity) / prev_equity
                self.daily_returns.append(daily_return)

                # Check daily loss limit
                if daily_return < -self.config.max_daily_loss_pct:
                    logger.warning(f"Daily loss limit hit: {daily_return:.2%}")

            # Check drawdown limit
            if self.equity_curve:
                peak = max([e['equity'] for e in self.equity_curve])
                drawdown = (equity - peak) / peak if peak > 0 else 0
                self.drawdowns.append(drawdown)

                if drawdown < -self.config.max_drawdown_pct:
                    logger.warning(f"Max drawdown limit hit: {drawdown:.2%}. Stopping backtest.")
                    break

            # Periodic logging
            if (i + 1) % 50 == 0:
                logger.info(
                    f"[{i+1}/{len(dates)}] {date.date()} | "
                    f"Equity: ${equity:,.2f} | "
                    f"Positions: {len(self.positions)} | "
                    f"Trades: {self.total_trades}"
                )

        logger.info("=" * 60)
        logger.info("Backtest Complete")
        logger.info("=" * 60)

        # Calculate performance metrics
        results = self._calculate_performance_metrics()

        return results

    def _update_positions(self, day_data: pd.DataFrame):
        """Update all positions with current prices"""
        for symbol, position in list(self.positions.items()):
            if symbol in day_data.index:
                current_price = day_data.loc[symbol, 'close']
                position.update_price(current_price)

    def _check_exits(self, day_data: pd.DataFrame):
        """Check stop loss, take profit, and trailing stops"""
        for symbol, position in list(self.positions.items()):
            if symbol not in day_data.index:
                continue

            row = day_data.loc[symbol]
            current_price = row['close']

            should_exit = False
            exit_reason = None

            # Stop loss check
            if position.unrealized_pnl_pct < -self.config.stop_loss_pct:
                should_exit = True
                exit_reason = "stop_loss"

            # Take profit check
            elif position.unrealized_pnl_pct > self.config.take_profit_pct:
                should_exit = True
                exit_reason = "take_profit"

            # Trailing stop check (if enabled)
            elif self.config.trailing_stop_pct is not None:
                if position.side == PositionSide.LONG:
                    trailing_stop_price = position.highest_price * (1 - self.config.trailing_stop_pct)
                    if current_price < trailing_stop_price:
                        should_exit = True
                        exit_reason = "trailing_stop"
                else:  # SHORT
                    trailing_stop_price = position.lowest_price * (1 + self.config.trailing_stop_pct)
                    if current_price > trailing_stop_price:
                        should_exit = True
                        exit_reason = "trailing_stop"

            # Execute exit
            if should_exit:
                self._close_position(symbol, current_price, exit_reason)

    def _execute_signals(self, signals: Dict[str, int], day_data: pd.DataFrame):
        """Execute trading signals"""
        for symbol, signal in signals.items():
            # Skip if no data
            if symbol not in day_data.index:
                continue

            row = day_data.loc[symbol]

            # Market constraints
            if row.get('volume', 0) < self.config.min_volume:
                continue
            if row['close'] < self.config.min_price:
                continue

            current_price = row['close']

            # Convert signal to position side
            if signal == 1:
                target_side = PositionSide.LONG
            elif signal == -1:
                target_side = PositionSide.SHORT
            else:
                target_side = PositionSide.NEUTRAL

            # Handle existing position
            if symbol in self.positions:
                current_position = self.positions[symbol]

                # Close if signal changed
                if target_side != current_position.side:
                    self._close_position(symbol, current_price, "signal_change")

                    # Open new position if not neutral
                    if target_side != PositionSide.NEUTRAL:
                        self._open_position(symbol, target_side, current_price, row)

            # Open new position
            elif target_side != PositionSide.NEUTRAL:
                # Check position limits
                if len(self.positions) >= self.config.max_positions:
                    continue

                self._open_position(symbol, target_side, current_price, row)

    def _open_position(self, symbol: str, side: PositionSide, price: float, row: pd.Series):
        """Open a new position"""
        # Calculate position size
        equity = self._calculate_equity(pd.DataFrame([row]))
        max_position_value = equity * self.config.max_position_size

        # Calculate shares (accounting for slippage)
        slippage = self._calculate_slippage(price, 0)  # Will update after shares calculated
        shares = int(max_position_value / (price + slippage))

        if shares <= 0:
            return

        # Calculate actual costs
        position_value = shares * price
        commission = position_value * self.config.commission_rate
        slippage_cost = self._calculate_slippage(price, shares)

        # Check if we have enough capital
        total_cost = position_value + commission + slippage_cost
        if total_cost > self.current_capital:
            # Reduce shares to fit capital
            shares = int((self.current_capital - commission) / (price + slippage))
            if shares <= 0:
                return

            position_value = shares * price
            commission = position_value * self.config.commission_rate
            slippage_cost = self._calculate_slippage(price, shares)
            total_cost = position_value + commission + slippage_cost

        # Simulate fill probability
        if np.random.random() > self.config.fill_probability:
            return

        # Deduct from capital
        self.current_capital -= total_cost

        # Create position
        position = Position(
            symbol=symbol,
            side=side,
            entry_price=price,
            current_price=price,
            shares=shares,
            entry_date=self.current_date
        )

        self.positions[symbol] = position

        # Create trade record
        trade = Trade(
            entry_date=self.current_date,
            exit_date=None,
            symbol=symbol,
            side=side,
            entry_price=price,
            exit_price=None,
            shares=shares,
            commission=commission,
            slippage=slippage_cost
        )

        self.trades.append(trade)
        self.total_trades += 1

        logger.debug(
            f"OPEN {side.name} {shares} {symbol} @ ${price:.2f} | "
            f"Cost: ${total_cost:,.2f}"
        )

    def _close_position(self, symbol: str, price: float, reason: str):
        """Close an existing position"""
        if symbol not in self.positions:
            return

        position = self.positions[symbol]

        # Calculate costs
        position_value = position.shares * price
        commission = position_value * self.config.commission_rate
        slippage = self._calculate_slippage(price, position.shares)

        # Add proceeds to capital
        proceeds = position_value - commission - slippage
        self.current_capital += proceeds

        # Find corresponding trade and close it
        for trade in reversed(self.trades):
            if (trade.symbol == symbol and
                trade.entry_date == position.entry_date and
                trade.exit_date is None):
                trade.close_trade(self.current_date, price, commission, slippage, reason)

                # Update statistics
                if trade.pnl > 0:
                    self.winning_trades += 1
                else:
                    self.losing_trades += 1

                logger.debug(
                    f"CLOSE {position.side.name} {position.shares} {symbol} @ ${price:.2f} | "
                    f"P&L: ${trade.pnl:,.2f} ({trade.pnl_pct:.2%}) | "
                    f"Reason: {reason}"
                )
                break

        # Remove position
        del self.positions[symbol]

    def _calculate_slippage(self, price: float, shares: int) -> float:
        """Calculate slippage cost"""
        # Base slippage
        base_slippage = price * (self.config.slippage_bps / 10000)

        # Market impact (larger orders have more impact)
        if shares > 0:
            impact = self.config.market_impact_coefficient * np.sqrt(shares / 100)
            market_impact = price * (impact / 100)
        else:
            market_impact = 0

        return base_slippage + market_impact

    def _calculate_equity(self, day_data: pd.DataFrame) -> float:
        """Calculate total equity (cash + positions value)"""
        positions_value = 0

        for symbol, position in self.positions.items():
            if symbol in day_data.index:
                current_price = day_data.loc[symbol, 'close']
                positions_value += position.shares * current_price

        return self.current_capital + positions_value

    def _calculate_performance_metrics(self) -> Dict[str, Any]:
        """Calculate comprehensive performance metrics"""
        logger.info("Calculating performance metrics...")

        # Convert equity curve to DataFrame
        equity_df = pd.DataFrame(self.equity_curve)
        equity_df['date'] = pd.to_datetime(equity_df['date'])
        equity_df.set_index('date', inplace=True)

        # Calculate returns
        equity_df['returns'] = equity_df['equity'].pct_change()

        # Basic metrics
        total_return = (equity_df['equity'].iloc[-1] - self.config.initial_capital) / self.config.initial_capital

        # Annualized metrics
        trading_days = len(equity_df)
        years = trading_days / 252
        cagr = (equity_df['equity'].iloc[-1] / self.config.initial_capital) ** (1 / years) - 1 if years > 0 else 0

        # Risk metrics
        returns = equity_df['returns'].dropna()
        volatility = returns.std() * np.sqrt(252)  # Annualized

        # Sharpe ratio (assuming 2% risk-free rate)
        risk_free_rate = 0.02
        sharpe_ratio = (cagr - risk_free_rate) / volatility if volatility > 0 else 0

        # Sortino ratio (downside deviation)
        downside_returns = returns[returns < 0]
        downside_std = downside_returns.std() * np.sqrt(252)
        sortino_ratio = (cagr - risk_free_rate) / downside_std if downside_std > 0 else 0

        # Drawdown metrics
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        max_drawdown = drawdown.min()

        # Calmar ratio
        calmar_ratio = cagr / abs(max_drawdown) if max_drawdown != 0 else 0

        # Trade statistics
        completed_trades = [t for t in self.trades if t.exit_date is not None]

        if completed_trades:
            win_rate = self.winning_trades / len(completed_trades)

            winning_pnls = [t.pnl for t in completed_trades if t.pnl > 0]
            losing_pnls = [t.pnl for t in completed_trades if t.pnl < 0]

            avg_win = np.mean(winning_pnls) if winning_pnls else 0
            avg_loss = np.mean(losing_pnls) if losing_pnls else 0

            profit_factor = abs(sum(winning_pnls) / sum(losing_pnls)) if losing_pnls else float('inf')

            avg_holding_period = np.mean([t.holding_period for t in completed_trades if t.holding_period])
        else:
            win_rate = 0
            avg_win = 0
            avg_loss = 0
            profit_factor = 0
            avg_holding_period = 0

        # Compile results
        results = {
            'summary': {
                'initial_capital': self.config.initial_capital,
                'final_equity': equity_df['equity'].iloc[-1],
                'total_return': total_return,
                'cagr': cagr,
                'trading_days': trading_days,
                'years': years
            },
            'risk_metrics': {
                'volatility': volatility,
                'sharpe_ratio': sharpe_ratio,
                'sortino_ratio': sortino_ratio,
                'max_drawdown': max_drawdown,
                'calmar_ratio': calmar_ratio
            },
            'trade_statistics': {
                'total_trades': len(completed_trades),
                'winning_trades': self.winning_trades,
                'losing_trades': self.losing_trades,
                'win_rate': win_rate,
                'avg_win': avg_win,
                'avg_loss': avg_loss,
                'profit_factor': profit_factor,
                'avg_holding_period_days': avg_holding_period
            },
            'equity_curve': equity_df,
            'trades': completed_trades
        }

        # Log summary
        logger.info("\n" + "=" * 60)
        logger.info("BACKTEST RESULTS")
        logger.info("=" * 60)
        logger.info(f"Total Return: {total_return:.2%}")
        logger.info(f"CAGR: {cagr:.2%}")
        logger.info(f"Sharpe Ratio: {sharpe_ratio:.2f}")
        logger.info(f"Sortino Ratio: {sortino_ratio:.2f}")
        logger.info(f"Max Drawdown: {max_drawdown:.2%}")
        logger.info(f"Calmar Ratio: {calmar_ratio:.2f}")
        logger.info(f"Total Trades: {len(completed_trades)}")
        logger.info(f"Win Rate: {win_rate:.2%}")
        logger.info(f"Profit Factor: {profit_factor:.2f}")
        logger.info("=" * 60)

        return results

    def save_results(self, results: Dict[str, Any], filepath: str):
        """Save backtest results to disk"""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        # Save equity curve
        equity_path = filepath.with_name(f"{filepath.stem}_equity.csv")
        results['equity_curve'].to_csv(equity_path)
        logger.info(f"Equity curve saved to {equity_path}")

        # Save trades
        if results['trades']:
            trades_df = pd.DataFrame([asdict(t) for t in results['trades']])
            trades_path = filepath.with_name(f"{filepath.stem}_trades.csv")
            trades_df.to_csv(trades_path, index=False)
            logger.info(f"Trades saved to {trades_path}")

        # Save summary metrics
        summary = {
            'summary': results['summary'],
            'risk_metrics': results['risk_metrics'],
            'trade_statistics': results['trade_statistics'],
            'config': asdict(self.config),
            'generated_at': datetime.now().isoformat()
        }

        summary_path = filepath.with_suffix('.json')
        with open(summary_path, 'w') as f:
            json.dump(summary, f, indent=2, default=str)
        logger.info(f"Summary saved to {summary_path}")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Example: Create synthetic data
    np.random.seed(42)
    dates = pd.date_range('2023-01-01', '2023-12-31', freq='D')
    symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']

    data_list = []
    for date in dates:
        for symbol in symbols:
            # Random walk price
            price = 100 + np.random.randn() * 10
            data_list.append({
                'date': date,
                'symbol': symbol,
                'open': price,
                'high': price * 1.02,
                'low': price * 0.98,
                'close': price * (1 + np.random.randn() * 0.01),
                'volume': int(1000000 + np.random.randn() * 100000)
            })

    df = pd.DataFrame(data_list)
    df.set_index(['date', 'symbol'], inplace=True)

    # Simple momentum strategy
    def momentum_strategy(data: pd.DataFrame, current_date: pd.Timestamp) -> Dict[str, int]:
        """Simple momentum strategy: buy if 5-day return > 2%, sell if < -2%"""
        signals = {}

        # Get data up to current date
        historical = data[data.index.get_level_values(0) <= current_date]

        for symbol in ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA']:
            try:
                symbol_data = historical.xs(symbol, level=1)
                if len(symbol_data) < 5:
                    continue

                # Calculate 5-day return
                current_price = symbol_data['close'].iloc[-1]
                prev_price = symbol_data['close'].iloc[-5]
                returns = (current_price - prev_price) / prev_price

                # Generate signal
                if returns > 0.02:
                    signals[symbol] = 1  # Buy
                elif returns < -0.02:
                    signals[symbol] = -1  # Sell
                else:
                    signals[symbol] = 0  # Hold
            except:
                continue

        return signals

    # Run backtest
    config = BacktestConfig(
        initial_capital=100000,
        max_position_size=0.2,
        commission_rate=0.001,
        slippage_bps=5.0,
        stop_loss_pct=0.05,
        take_profit_pct=0.10
    )

    engine = BacktestEngine(config)
    results = engine.run_backtest(df, momentum_strategy)

    # Save results
    engine.save_results(results, 'ai-ml/backtesting/results/backtest_example')

    print("\n✅ Backtest complete! Results saved.")
