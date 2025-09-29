"""
NexusTradeAI Automated Trading API Server
========================================

Flask API server for the automated trading engine.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from datetime import datetime
import asyncio
import threading

from trading_engine import TradingEngine, TradingMode, OrderType

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global trading engine instance
trading_engine = None

def init_trading_engine(mode: str = "paper"):
    """Initialize the trading engine"""
    global trading_engine
    
    try:
        trading_mode = TradingMode(mode.lower())
        trading_engine = TradingEngine(trading_mode)
        logger.info(f"Trading engine initialized in {mode.upper()} mode")
    except ValueError:
        logger.error(f"Invalid trading mode: {mode}")
        trading_engine = TradingEngine(TradingMode.PAPER)

# Initialize with paper trading mode
init_trading_engine("paper")

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'automated-trading',
        'timestamp': datetime.now().isoformat(),
        'engine_running': trading_engine.is_running if trading_engine else False
    })

@app.route('/api/trading/start', methods=['POST'])
def start_trading():
    """Start the automated trading engine"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        if trading_engine.is_running:
            return jsonify({
                'success': True,
                'message': 'Trading engine is already running'
            })
        
        # Start trading engine in a separate thread
        def start_engine():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            trading_engine.start()
            loop.run_forever()
        
        engine_thread = threading.Thread(target=start_engine, daemon=True)
        engine_thread.start()
        
        return jsonify({
            'success': True,
            'message': 'Trading engine started successfully'
        })
        
    except Exception as e:
        logger.error(f"Error starting trading engine: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/stop', methods=['POST'])
def stop_trading():
    """Stop the automated trading engine"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        trading_engine.stop()
        
        return jsonify({
            'success': True,
            'message': 'Trading engine stopped successfully'
        })
        
    except Exception as e:
        logger.error(f"Error stopping trading engine: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/status', methods=['GET'])
def get_trading_status():
    """Get trading engine status"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        status = trading_engine.get_trading_status()
        
        return jsonify({
            'success': True,
            'data': status
        })
        
    except Exception as e:
        logger.error(f"Error getting trading status: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/positions', methods=['GET'])
def get_positions():
    """Get current trading positions"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        positions = trading_engine.get_positions_summary()
        
        return jsonify({
            'success': True,
            'data': positions
        })
        
    except Exception as e:
        logger.error(f"Error getting positions: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/orders', methods=['GET'])
def get_orders():
    """Get current orders"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        orders = {
            order_id: {
                'id': order.id,
                'symbol': order.symbol,
                'side': order.side,
                'order_type': order.order_type.value,
                'quantity': order.quantity,
                'price': order.price,
                'status': order.status.value,
                'filled_quantity': order.filled_quantity,
                'average_price': order.average_price,
                'timestamp': order.timestamp.isoformat(),
                'strategy': order.strategy
            }
            for order_id, order in trading_engine.orders.items()
        }
        
        return jsonify({
            'success': True,
            'data': {
                'orders': orders,
                'total_orders': len(orders),
                'pending_orders': len([o for o in orders.values() if o['status'] == 'pending'])
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting orders: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/trades', methods=['GET'])
def get_trades():
    """Get recent trade history"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        limit = request.args.get('limit', 50, type=int)
        trades = trading_engine.get_recent_trades(limit)
        
        # Convert datetime objects to ISO strings
        for trade in trades:
            if 'timestamp' in trade:
                trade['timestamp'] = trade['timestamp'].isoformat()
        
        return jsonify({
            'success': True,
            'data': {
                'trades': trades,
                'total_trades': len(trades)
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting trades: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/manual-order', methods=['POST'])
def place_manual_order():
    """Place a manual trading order"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['symbol', 'side', 'quantity']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400
        
        symbol = data['symbol']
        side = data['side']
        quantity = float(data['quantity'])
        order_type = OrderType(data.get('order_type', 'market'))
        price = data.get('price')
        
        # Validate side
        if side not in ['buy', 'sell']:
            return jsonify({'error': 'Invalid side. Must be buy or sell'}), 400
        
        # Place order asynchronously
        async def place_order():
            order_id = await trading_engine._place_order(
                symbol=symbol,
                side=side,
                quantity=quantity,
                order_type=order_type,
                price=price,
                strategy='manual',
                metadata={'manual_order': True}
            )
            return order_id
        
        # Run in event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        order_id = loop.run_until_complete(place_order())
        loop.close()
        
        if order_id:
            return jsonify({
                'success': True,
                'message': 'Order placed successfully',
                'data': {'order_id': order_id}
            })
        else:
            return jsonify({'error': 'Failed to place order'}), 500
        
    except Exception as e:
        logger.error(f"Error placing manual order: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/cancel-order/<order_id>', methods=['POST'])
def cancel_order(order_id):
    """Cancel a specific order"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        if order_id not in trading_engine.orders:
            return jsonify({'error': 'Order not found'}), 404
        
        order = trading_engine.orders[order_id]
        
        if order.status.value != 'pending':
            return jsonify({'error': 'Order cannot be cancelled'}), 400
        
        order.status = order.status.CANCELLED
        
        return jsonify({
            'success': True,
            'message': f'Order {order_id} cancelled successfully'
        })
        
    except Exception as e:
        logger.error(f"Error cancelling order: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/close-position/<symbol>', methods=['POST'])
def close_position(symbol):
    """Close a specific position"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        if symbol not in trading_engine.positions:
            return jsonify({'error': 'Position not found'}), 404
        
        position = trading_engine.positions[symbol]
        
        # Determine order side (opposite of position)
        side = 'sell' if position.quantity > 0 else 'buy'
        quantity = abs(position.quantity)
        
        # Place closing order
        async def close_pos():
            order_id = await trading_engine._place_order(
                symbol=symbol,
                side=side,
                quantity=quantity,
                order_type=OrderType.MARKET,
                strategy='manual_close',
                metadata={'position_close': True}
            )
            return order_id
        
        # Run in event loop
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        order_id = loop.run_until_complete(close_pos())
        loop.close()
        
        if order_id:
            return jsonify({
                'success': True,
                'message': f'Position {symbol} closed successfully',
                'data': {'order_id': order_id}
            })
        else:
            return jsonify({'error': 'Failed to close position'}), 500
        
    except Exception as e:
        logger.error(f"Error closing position: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/config', methods=['GET'])
def get_trading_config():
    """Get trading engine configuration"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        return jsonify({
            'success': True,
            'data': {
                'mode': trading_engine.mode.value,
                'config': trading_engine.config
            }
        })
        
    except Exception as e:
        logger.error(f"Error getting trading config: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/trading/config', methods=['PUT'])
def update_trading_config():
    """Update trading engine configuration"""
    try:
        if not trading_engine:
            return jsonify({'error': 'Trading engine not initialized'}), 500
        
        data = request.get_json()
        
        # Update configuration
        for key, value in data.items():
            if key in trading_engine.config:
                trading_engine.config[key] = value
        
        return jsonify({
            'success': True,
            'message': 'Configuration updated successfully',
            'data': trading_engine.config
        })
        
    except Exception as e:
        logger.error(f"Error updating trading config: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting NexusTradeAI Automated Trading API Server...")
    app.run(host='0.0.0.0', port=3005, debug=True)
