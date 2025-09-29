"""
NexusTradeAI - Automated Trading Engine
======================================

Core automated trading engine that executes trades based on strategy signals
with integrated risk management and order execution.
"""

import asyncio
import logging
import json
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, field
import requests
import websocket
import threading

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OrderType(Enum):
    """Order types for trading"""
    MARKET = "market"
    LIMIT = "limit"
    STOP_LOSS = "stop_loss"
    TAKE_PROFIT = "take_profit"

class OrderStatus(Enum):
    """Order execution status"""
    PENDING = "pending"
    FILLED = "filled"
    PARTIALLY_FILLED = "partially_filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"

class TradingMode(Enum):
    """Trading operation modes"""
    LIVE = "live"
    PAPER = "paper"
    SIMULATION = "simulation"

@dataclass
class Order:
    """Trading order representation"""
    id: str
    symbol: str
    side: str  # 'buy' or 'sell'
    order_type: OrderType
    quantity: float
    price: Optional[float] = None
    status: OrderStatus = OrderStatus.PENDING
    filled_quantity: float = 0.0
    average_price: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
    strategy: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Position:
    """Trading position representation"""
    symbol: str
    quantity: float
    average_price: float
    current_price: float
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
    strategy: Optional[str] = None
    stop_loss_order_id: Optional[str] = None
    take_profit_order_id: Optional[str] = None

class TradingEngine:
    """
    Core automated trading engine
    """
    
    def __init__(self, mode: TradingMode = TradingMode.PAPER):
        self.mode = mode
        self.is_running = False
        self.orders: Dict[str, Order] = {}
        self.positions: Dict[str, Position] = {}
        self.trade_history: List[Dict] = []
        self.current_prices: Dict[str, float] = {}
        
        # Service endpoints
        self.risk_api = "http://localhost:3003"
        self.strategy_api = "http://localhost:3004"
        self.market_data_api = "http://localhost:3002"
        
        # Trading configuration
        self.config = {
            'max_orders_per_minute': 10,
            'order_timeout_seconds': 300,
            'price_slippage_tolerance': 0.001,  # 0.1%
            'min_order_size': 0.001,
            'max_order_size': 10.0,
            'enable_stop_loss': True,
            'enable_take_profit': True,
            'auto_cancel_timeout': 3600  # 1 hour
        }
        
        # Rate limiting
        self.order_timestamps = []
        self.last_signal_check = datetime.now()
        
        # WebSocket for real-time data
        self.ws = None
        self.ws_thread = None
        
    def start(self):
        """Start the automated trading engine"""
        if self.is_running:
            logger.warning("Trading engine is already running")
            return
            
        self.is_running = True
        logger.info(f"🚀 Starting NexusTradeAI Trading Engine in {self.mode.value.upper()} mode")
        
        # Start WebSocket connection for real-time data
        self._start_websocket()
        
        # Start main trading loop
        asyncio.create_task(self._trading_loop())
        
    def stop(self):
        """Stop the automated trading engine"""
        self.is_running = False
        
        if self.ws:
            self.ws.close()
            
        logger.info("🛑 Trading engine stopped")
        
    async def _trading_loop(self):
        """Main trading loop"""
        while self.is_running:
            try:
                # Check for new signals every 30 seconds
                if (datetime.now() - self.last_signal_check).seconds >= 30:
                    await self._check_and_execute_signals()
                    self.last_signal_check = datetime.now()
                
                # Update positions and check stop-loss/take-profit
                await self._update_positions()
                
                # Process pending orders
                await self._process_pending_orders()
                
                # Clean up old orders
                self._cleanup_old_orders()
                
                # Wait before next iteration
                await asyncio.sleep(5)
                
            except Exception as e:
                logger.error(f"Error in trading loop: {e}")
                await asyncio.sleep(10)
    
    async def _check_and_execute_signals(self):
        """Check for new trading signals and execute trades"""
        try:
            # Get recent signals from strategy engine
            response = requests.get(f"{self.strategy_api}/api/signals/recent?limit=10", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if data.get('success') and data.get('data'):
                    signals = data['data']
                    
                    for signal in signals:
                        # Check if signal is recent (within last 5 minutes)
                        signal_time = datetime.fromisoformat(signal['timestamp'].replace('Z', '+00:00'))
                        if (datetime.now() - signal_time.replace(tzinfo=None)).seconds <= 300:
                            await self._process_signal(signal)
                            
        except Exception as e:
            logger.error(f"Error checking signals: {e}")
    
    async def _process_signal(self, signal: Dict):
        """Process a trading signal and execute trade if valid"""
        try:
            symbol = signal['symbol']
            signal_type = signal['signal_type']
            confidence = signal['confidence']
            entry_price = signal.get('entry_price')
            
            # Skip if confidence too low
            if confidence < 0.6:
                logger.debug(f"Skipping low confidence signal for {symbol}: {confidence}")
                return
            
            # Skip if we already have a position in this symbol
            if symbol in self.positions:
                logger.debug(f"Already have position in {symbol}, skipping signal")
                return
            
            # Determine trade side
            side = 'buy' if signal_type in ['buy', 'strong_buy'] else 'sell'
            
            # Get position size from risk manager
            position_size = await self._calculate_position_size(symbol, entry_price, signal.get('stop_loss'))
            
            if position_size and position_size >= self.config['min_order_size']:
                # Execute the trade
                order_id = await self._place_order(
                    symbol=symbol,
                    side=side,
                    quantity=position_size,
                    order_type=OrderType.MARKET,
                    strategy=signal.get('strategy', 'unknown'),
                    metadata={
                        'signal_confidence': confidence,
                        'stop_loss': signal.get('stop_loss'),
                        'take_profit': signal.get('take_profit')
                    }
                )
                
                if order_id:
                    logger.info(f"✅ Executed trade: {side.upper()} {position_size:.6f} {symbol} (confidence: {confidence:.2f})")
                else:
                    logger.warning(f"❌ Failed to execute trade for {symbol}")
            else:
                logger.debug(f"Position size too small for {symbol}: {position_size}")
                
        except Exception as e:
            logger.error(f"Error processing signal: {e}")
    
    async def _calculate_position_size(self, symbol: str, entry_price: float, stop_loss: float) -> Optional[float]:
        """Calculate position size using risk manager"""
        try:
            payload = {
                'symbol': symbol,
                'entry_price': entry_price,
                'stop_loss_price': stop_loss or entry_price * 0.95  # Default 5% stop loss
            }
            
            response = requests.post(
                f"{self.risk_api}/api/risk/position-size",
                json=payload,
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                if data.get('success'):
                    return data['data']['position_size']
                    
        except Exception as e:
            logger.error(f"Error calculating position size: {e}")
            
        return None
    
    async def _place_order(self, symbol: str, side: str, quantity: float, 
                          order_type: OrderType, price: Optional[float] = None,
                          strategy: Optional[str] = None, metadata: Dict = None) -> Optional[str]:
        """Place a trading order"""
        
        # Rate limiting check
        if not self._check_rate_limit():
            logger.warning("Rate limit exceeded, skipping order")
            return None
        
        # Validate order with risk manager
        if not await self._validate_order(symbol, quantity, price or self.current_prices.get(symbol, 0)):
            logger.warning(f"Order validation failed for {symbol}")
            return None
        
        # Generate order ID
        order_id = f"{symbol}_{int(time.time() * 1000)}"
        
        # Create order object
        order = Order(
            id=order_id,
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            strategy=strategy,
            metadata=metadata or {}
        )
        
        # Store order
        self.orders[order_id] = order
        
        # Execute order based on mode
        if self.mode == TradingMode.LIVE:
            # In live mode, would connect to actual exchange API
            success = await self._execute_live_order(order)
        else:
            # Paper trading or simulation
            success = await self._execute_paper_order(order)
        
        if success:
            self.order_timestamps.append(datetime.now())
            return order_id
        else:
            del self.orders[order_id]
            return None
    
    async def _execute_paper_order(self, order: Order) -> bool:
        """Execute order in paper trading mode"""
        try:
            # Simulate order execution
            current_price = self.current_prices.get(order.symbol)
            
            if not current_price:
                logger.warning(f"No current price for {order.symbol}")
                return False
            
            # Simulate slippage
            slippage = current_price * self.config['price_slippage_tolerance']
            if order.side == 'buy':
                execution_price = current_price + slippage
            else:
                execution_price = current_price - slippage
            
            # Update order status
            order.status = OrderStatus.FILLED
            order.filled_quantity = order.quantity
            order.average_price = execution_price
            
            # Create or update position
            await self._update_position_from_order(order)
            
            # Log trade
            self.trade_history.append({
                'timestamp': datetime.now(),
                'order_id': order.id,
                'symbol': order.symbol,
                'side': order.side,
                'quantity': order.quantity,
                'price': execution_price,
                'strategy': order.strategy,
                'mode': self.mode.value
            })
            
            logger.info(f"📋 Paper trade executed: {order.side.upper()} {order.quantity:.6f} {order.symbol} @ ${execution_price:.4f}")
            
            # Place stop-loss and take-profit orders if configured
            if self.config['enable_stop_loss'] and order.metadata.get('stop_loss'):
                await self._place_stop_loss_order(order)
                
            if self.config['enable_take_profit'] and order.metadata.get('take_profit'):
                await self._place_take_profit_order(order)
            
            return True
            
        except Exception as e:
            logger.error(f"Error executing paper order: {e}")
            order.status = OrderStatus.REJECTED
            return False
    
    async def _execute_live_order(self, order: Order) -> bool:
        """Execute order in live trading mode (placeholder for exchange integration)"""
        # This would integrate with actual exchange APIs like Binance, Coinbase, etc.
        logger.info(f"🔴 LIVE TRADING NOT IMPLEMENTED - Would execute: {order.side} {order.quantity} {order.symbol}")
        return False

    async def _validate_order(self, symbol: str, quantity: float, price: float) -> bool:
        """Validate order with risk manager"""
        try:
            payload = {
                'symbol': symbol,
                'size': quantity,
                'entry_price': price
            }

            response = requests.post(
                f"{self.risk_api}/api/risk/validate-position",
                json=payload,
                timeout=10
            )

            if response.status_code == 200:
                data = response.json()
                return data.get('success', False) and data.get('data', {}).get('valid', False)

        except Exception as e:
            logger.error(f"Error validating order: {e}")

        return False

    def _check_rate_limit(self) -> bool:
        """Check if we're within rate limits"""
        now = datetime.now()
        # Remove timestamps older than 1 minute
        self.order_timestamps = [ts for ts in self.order_timestamps if (now - ts).seconds < 60]

        return len(self.order_timestamps) < self.config['max_orders_per_minute']

    async def _update_position_from_order(self, order: Order):
        """Update position based on filled order"""
        symbol = order.symbol

        if symbol in self.positions:
            position = self.positions[symbol]

            if order.side == 'buy':
                # Add to position
                total_cost = (position.quantity * position.average_price) + (order.quantity * order.average_price)
                total_quantity = position.quantity + order.quantity
                position.average_price = total_cost / total_quantity if total_quantity > 0 else 0
                position.quantity = total_quantity
            else:
                # Reduce position
                position.quantity -= order.quantity

                # Close position if quantity is zero or negative
                if position.quantity <= 0:
                    # Calculate realized P&L
                    realized_pnl = (order.average_price - position.average_price) * order.quantity
                    position.realized_pnl += realized_pnl

                    # Remove position
                    del self.positions[symbol]

                    logger.info(f"📊 Position closed: {symbol} with P&L: ${realized_pnl:.2f}")
                    return
        else:
            # Create new position
            if order.side == 'buy':
                self.positions[symbol] = Position(
                    symbol=symbol,
                    quantity=order.quantity,
                    average_price=order.average_price,
                    current_price=order.average_price,
                    strategy=order.strategy
                )

    async def _place_stop_loss_order(self, original_order: Order):
        """Place stop-loss order for a position"""
        stop_loss_price = original_order.metadata.get('stop_loss')
        if not stop_loss_price:
            return

        # Determine stop-loss side (opposite of original order)
        stop_side = 'sell' if original_order.side == 'buy' else 'buy'

        stop_order_id = await self._place_order(
            symbol=original_order.symbol,
            side=stop_side,
            quantity=original_order.quantity,
            order_type=OrderType.STOP_LOSS,
            price=stop_loss_price,
            strategy=original_order.strategy,
            metadata={'parent_order': original_order.id, 'order_type': 'stop_loss'}
        )

        # Link stop-loss to position
        if original_order.symbol in self.positions:
            self.positions[original_order.symbol].stop_loss_order_id = stop_order_id

    async def _place_take_profit_order(self, original_order: Order):
        """Place take-profit order for a position"""
        take_profit_price = original_order.metadata.get('take_profit')
        if not take_profit_price:
            return

        # Determine take-profit side (opposite of original order)
        tp_side = 'sell' if original_order.side == 'buy' else 'buy'

        tp_order_id = await self._place_order(
            symbol=original_order.symbol,
            side=tp_side,
            quantity=original_order.quantity,
            order_type=OrderType.TAKE_PROFIT,
            price=take_profit_price,
            strategy=original_order.strategy,
            metadata={'parent_order': original_order.id, 'order_type': 'take_profit'}
        )

        # Link take-profit to position
        if original_order.symbol in self.positions:
            self.positions[original_order.symbol].take_profit_order_id = tp_order_id

    async def _update_positions(self):
        """Update all positions with current prices and check triggers"""
        for symbol, position in list(self.positions.items()):
            current_price = self.current_prices.get(symbol)

            if current_price:
                position.current_price = current_price

                # Calculate unrealized P&L
                if position.quantity > 0:  # Long position
                    position.unrealized_pnl = (current_price - position.average_price) * position.quantity
                else:  # Short position
                    position.unrealized_pnl = (position.average_price - current_price) * abs(position.quantity)

                # Check stop-loss and take-profit triggers
                await self._check_position_triggers(position)

    async def _check_position_triggers(self, position: Position):
        """Check if position triggers stop-loss or take-profit"""
        current_price = position.current_price

        # Check stop-loss orders
        if position.stop_loss_order_id and position.stop_loss_order_id in self.orders:
            stop_order = self.orders[position.stop_loss_order_id]

            if position.quantity > 0:  # Long position
                if current_price <= stop_order.price:
                    await self._trigger_order(stop_order)
            else:  # Short position
                if current_price >= stop_order.price:
                    await self._trigger_order(stop_order)

        # Check take-profit orders
        if position.take_profit_order_id and position.take_profit_order_id in self.orders:
            tp_order = self.orders[position.take_profit_order_id]

            if position.quantity > 0:  # Long position
                if current_price >= tp_order.price:
                    await self._trigger_order(tp_order)
            else:  # Short position
                if current_price <= tp_order.price:
                    await self._trigger_order(tp_order)

    async def _trigger_order(self, order: Order):
        """Trigger a stop-loss or take-profit order"""
        logger.info(f"🎯 Triggering {order.order_type.value} order: {order.symbol}")

        # Execute the order
        if self.mode == TradingMode.LIVE:
            success = await self._execute_live_order(order)
        else:
            success = await self._execute_paper_order(order)

        if success:
            # Cancel any remaining orders for this position
            await self._cancel_position_orders(order.symbol)

    async def _cancel_position_orders(self, symbol: str):
        """Cancel all pending orders for a symbol"""
        orders_to_cancel = [
            order for order in self.orders.values()
            if order.symbol == symbol and order.status == OrderStatus.PENDING
        ]

        for order in orders_to_cancel:
            order.status = OrderStatus.CANCELLED
            logger.info(f"❌ Cancelled order: {order.id}")

    async def _process_pending_orders(self):
        """Process and update pending orders"""
        for order in list(self.orders.values()):
            if order.status == OrderStatus.PENDING:
                # Check if order has timed out
                if (datetime.now() - order.timestamp).seconds > self.config['order_timeout_seconds']:
                    order.status = OrderStatus.CANCELLED
                    logger.info(f"⏰ Order timed out: {order.id}")

    def _cleanup_old_orders(self):
        """Clean up old completed orders"""
        cutoff_time = datetime.now() - timedelta(hours=24)

        orders_to_remove = [
            order_id for order_id, order in self.orders.items()
            if order.timestamp < cutoff_time and order.status in [OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED]
        ]

        for order_id in orders_to_remove:
            del self.orders[order_id]

    def _start_websocket(self):
        """Start WebSocket connection for real-time market data"""
        def on_message(ws, message):
            try:
                data = json.loads(message)
                if 'symbol' in data and 'price' in data:
                    self.current_prices[data['symbol']] = float(data['price'])
            except Exception as e:
                logger.error(f"WebSocket message error: {e}")

        def on_error(ws, error):
            logger.error(f"WebSocket error: {error}")

        def on_close(ws, close_status_code, close_msg):
            logger.info("WebSocket connection closed")

        def run_websocket():
            try:
                # Connect to market data WebSocket
                ws_url = f"ws://localhost:3002/ws"
                self.ws = websocket.WebSocketApp(
                    ws_url,
                    on_message=on_message,
                    on_error=on_error,
                    on_close=on_close
                )
                self.ws.run_forever()
            except Exception as e:
                logger.error(f"WebSocket connection failed: {e}")

        # Start WebSocket in separate thread
        self.ws_thread = threading.Thread(target=run_websocket, daemon=True)
        self.ws_thread.start()

    def get_trading_status(self) -> Dict:
        """Get current trading engine status"""
        return {
            'is_running': self.is_running,
            'mode': self.mode.value,
            'active_orders': len([o for o in self.orders.values() if o.status == OrderStatus.PENDING]),
            'total_orders': len(self.orders),
            'active_positions': len(self.positions),
            'total_trades': len(self.trade_history),
            'symbols_tracked': list(self.current_prices.keys()),
            'last_signal_check': self.last_signal_check.isoformat()
        }

    def get_positions_summary(self) -> Dict:
        """Get summary of all positions"""
        total_unrealized_pnl = sum(pos.unrealized_pnl for pos in self.positions.values())
        total_realized_pnl = sum(pos.realized_pnl for pos in self.positions.values())

        return {
            'positions': {
                symbol: {
                    'quantity': pos.quantity,
                    'average_price': pos.average_price,
                    'current_price': pos.current_price,
                    'unrealized_pnl': pos.unrealized_pnl,
                    'realized_pnl': pos.realized_pnl,
                    'strategy': pos.strategy
                }
                for symbol, pos in self.positions.items()
            },
            'summary': {
                'total_positions': len(self.positions),
                'total_unrealized_pnl': total_unrealized_pnl,
                'total_realized_pnl': total_realized_pnl,
                'total_pnl': total_unrealized_pnl + total_realized_pnl
            }
        }

    def get_recent_trades(self, limit: int = 50) -> List[Dict]:
        """Get recent trade history"""
        return sorted(self.trade_history, key=lambda x: x['timestamp'], reverse=True)[:limit]
