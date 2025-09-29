"""
NexusTradeAI Strategy Engine API Server
======================================

Flask API server that exposes strategy management functionality.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from datetime import datetime
import json
import random

from strategy_manager import StrategyManager
from ensemble_manager import EnsembleStrategyManager
from strategy_framework import MarketData, MovingAverageCrossoverStrategy
from strategies import RSIMeanReversionStrategy, MomentumBreakoutStrategy, ScalpingStrategy, AIEnhancedStrategy

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global strategy managers
strategy_manager = StrategyManager()
ensemble_manager = EnsembleStrategyManager()

def init_strategy_engine():
    """Initialize the strategy engine with default strategies"""
    try:
        # Initialize basic strategy manager
        strategy_manager.create_default_strategies()

        # Initialize ensemble manager with advanced strategies
        strategies = [
            (MovingAverageCrossoverStrategy(short_period=20, long_period=50), 1.0),
            (RSIMeanReversionStrategy(rsi_period=14, oversold=30, overbought=70), 0.8),
            (MomentumBreakoutStrategy(period=20, volume_multiplier=1.5), 1.2),
            (ScalpingStrategy(fast_ema=5, slow_ema=13), 0.6),
            (AIEnhancedStrategy(), 1.5)
        ]

        for strategy, weight in strategies:
            ensemble_manager.add_strategy(strategy, weight)

        logger.info("Strategy Engine initialized successfully with ensemble capabilities")
    except Exception as e:
        logger.error(f"Failed to initialize strategy engine: {e}")

# Initialize on startup
init_strategy_engine()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'strategy-engine',
        'timestamp': datetime.now().isoformat(),
        'active_strategies': len([s for s in strategy_manager.strategies.values() if s.is_active])
    })

@app.route('/api/strategies', methods=['GET'])
def list_strategies():
    """List all registered strategies"""
    try:
        strategies = strategy_manager.list_strategies()
        return jsonify({
            'success': True,
            'data': strategies,
            'count': len(strategies)
        })
    except Exception as e:
        logger.error(f"Error listing strategies: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/strategies/<strategy_name>', methods=['GET'])
def get_strategy(strategy_name):
    """Get specific strategy information"""
    try:
        strategy = strategy_manager.get_strategy(strategy_name)
        if strategy:
            return jsonify({
                'success': True,
                'data': strategy.get_info()
            })
        else:
            return jsonify({'error': 'Strategy not found'}), 404
    except Exception as e:
        logger.error(f"Error getting strategy {strategy_name}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/strategies/<strategy_name>/activate', methods=['POST'])
def activate_strategy(strategy_name):
    """Activate a strategy"""
    try:
        success = strategy_manager.activate_strategy(strategy_name)
        if success:
            return jsonify({
                'success': True,
                'message': f'Strategy {strategy_name} activated'
            })
        else:
            return jsonify({'error': 'Strategy not found'}), 404
    except Exception as e:
        logger.error(f"Error activating strategy {strategy_name}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/strategies/<strategy_name>/deactivate', methods=['POST'])
def deactivate_strategy(strategy_name):
    """Deactivate a strategy"""
    try:
        success = strategy_manager.deactivate_strategy(strategy_name)
        if success:
            return jsonify({
                'success': True,
                'message': f'Strategy {strategy_name} deactivated'
            })
        else:
            return jsonify({'error': 'Strategy not found'}), 404
    except Exception as e:
        logger.error(f"Error deactivating strategy {strategy_name}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/strategies/<strategy_name>/parameters', methods=['PUT'])
def update_strategy_parameters(strategy_name):
    """Update strategy parameters"""
    try:
        data = request.get_json()
        parameters = data.get('parameters', {})
        
        success = strategy_manager.update_strategy_parameters(strategy_name, parameters)
        if success:
            return jsonify({
                'success': True,
                'message': f'Parameters updated for {strategy_name}',
                'parameters': parameters
            })
        else:
            return jsonify({'error': 'Strategy not found'}), 404
    except Exception as e:
        logger.error(f"Error updating parameters for {strategy_name}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/signals/generate', methods=['POST'])
def generate_signals():
    """Generate trading signals for specified symbols"""
    try:
        data = request.get_json()
        symbols = data.get('symbols', [])
        market_data = data.get('market_data', {})
        
        if not symbols:
            return jsonify({'error': 'No symbols provided'}), 400
        
        # Update market data cache
        for symbol, data_points in market_data.items():
            for point in data_points:
                market_data_obj = MarketData(
                    symbol=symbol,
                    timestamp=datetime.fromisoformat(point['timestamp']),
                    open=point['open'],
                    high=point['high'],
                    low=point['low'],
                    close=point['close'],
                    volume=point['volume']
                )
                strategy_manager.update_market_data(symbol, market_data_obj)
        
        # Generate signals for each symbol
        all_signals = []
        for symbol in symbols:
            signals = strategy_manager.generate_signals(symbol)
            all_signals.extend(signals)
        
        # Convert signals to JSON-serializable format
        signals_data = [
            {
                'symbol': signal.symbol,
                'signal_type': signal.signal_type.value,
                'confidence': signal.confidence,
                'entry_price': signal.entry_price,
                'stop_loss': signal.stop_loss,
                'take_profit': signal.take_profit,
                'timestamp': signal.timestamp.isoformat(),
                'strategy': signal.metadata.get('strategy', 'unknown'),
                'metadata': signal.metadata
            }
            for signal in all_signals
        ]
        
        return jsonify({
            'success': True,
            'data': signals_data,
            'count': len(signals_data)
        })
        
    except Exception as e:
        logger.error(f"Error generating signals: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/signals/recent', methods=['GET'])
def get_recent_signals():
    """Get recent trading signals"""
    try:
        limit = request.args.get('limit', 50, type=int)
        signals = strategy_manager.get_recent_signals(limit)
        
        return jsonify({
            'success': True,
            'data': signals,
            'count': len(signals)
        })
        
    except Exception as e:
        logger.error(f"Error getting recent signals: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/performance/overall', methods=['GET'])
def get_overall_performance():
    """Get overall strategy engine performance"""
    try:
        performance = strategy_manager.get_overall_performance()
        return jsonify({
            'success': True,
            'data': performance
        })
    except Exception as e:
        logger.error(f"Error getting overall performance: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/performance/<strategy_name>', methods=['GET'])
def get_strategy_performance(strategy_name):
    """Get performance metrics for a specific strategy"""
    try:
        performance = strategy_manager.get_strategy_performance(strategy_name)
        if performance:
            return jsonify({
                'success': True,
                'data': performance
            })
        else:
            return jsonify({'error': 'Strategy not found'}), 404
    except Exception as e:
        logger.error(f"Error getting performance for {strategy_name}: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/export', methods=['GET'])
def export_configuration():
    """Export current strategy configuration"""
    try:
        config = strategy_manager.export_configuration()
        return jsonify({
            'success': True,
            'data': config
        })
    except Exception as e:
        logger.error(f"Error exporting configuration: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/import', methods=['POST'])
def import_configuration():
    """Import strategy configuration"""
    try:
        data = request.get_json()
        config = data.get('config', {})
        
        success = strategy_manager.import_configuration(config)
        if success:
            return jsonify({
                'success': True,
                'message': 'Configuration imported successfully'
            })
        else:
            return jsonify({'error': 'Failed to import configuration'}), 500
    except Exception as e:
        logger.error(f"Error importing configuration: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/market-data/update', methods=['POST'])
def update_market_data():
    """Update market data for strategies"""
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        market_data = data.get('data')
        
        if not symbol or not market_data:
            return jsonify({'error': 'Missing symbol or market data'}), 400
        
        # Create MarketData object
        market_data_obj = MarketData(
            symbol=symbol,
            timestamp=datetime.fromisoformat(market_data['timestamp']),
            open=market_data['open'],
            high=market_data['high'],
            low=market_data['low'],
            close=market_data['close'],
            volume=market_data['volume']
        )
        
        strategy_manager.update_market_data(symbol, market_data_obj)
        
        return jsonify({
            'success': True,
            'message': f'Market data updated for {symbol}'
        })
        
    except Exception as e:
        logger.error(f"Error updating market data: {e}")
        return jsonify({'error': str(e)}), 500

# Mock endpoint for testing signal generation
@app.route('/api/signals/mock', methods=['GET'])
def generate_mock_signals():
    """Generate mock signals for testing"""
    try:
        symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
        mock_signals = []
        
        for symbol in symbols:
            if random.random() > 0.7:  # 30% chance of signal
                signal_types = ['buy', 'sell', 'hold']
                signal_type = random.choice(signal_types)
                
                mock_signals.append({
                    'symbol': symbol,
                    'signal_type': signal_type,
                    'confidence': round(random.uniform(0.5, 0.95), 2),
                    'entry_price': round(random.uniform(100, 50000), 2),
                    'stop_loss': round(random.uniform(90, 45000), 2),
                    'take_profit': round(random.uniform(110, 55000), 2),
                    'timestamp': datetime.now().isoformat(),
                    'strategy': random.choice(['MA_Cross_20_50', 'RSI_MeanReversion_14', 'Momentum_Breakout_20']),
                    'metadata': {'mock': True}
                })
        
        return jsonify({
            'success': True,
            'data': mock_signals,
            'count': len(mock_signals)
        })
        
    except Exception as e:
        logger.error(f"Error generating mock signals: {e}")
        return jsonify({'error': str(e)}), 500

# Ensemble-specific endpoints
@app.route('/api/ensemble/signal', methods=['POST'])
def generate_ensemble_signal():
    """Generate ensemble signal from all strategies"""
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        market_data_points = data.get('market_data', [])

        if not symbol or not market_data_points:
            return jsonify({'error': 'Missing symbol or market data'}), 400

        # Convert to MarketData objects
        market_data = []
        for point in market_data_points:
            market_data.append(MarketData(
                symbol=symbol,
                timestamp=datetime.fromisoformat(point['timestamp']),
                open=point['open'],
                high=point['high'],
                low=point['low'],
                close=point['close'],
                volume=point['volume']
            ))

        # Generate ensemble signal
        signal = ensemble_manager.generate_ensemble_signal(market_data)

        if signal:
            return jsonify({
                'success': True,
                'data': {
                    'symbol': signal.symbol,
                    'signal_type': signal.signal_type.value,
                    'confidence': signal.confidence,
                    'entry_price': signal.entry_price,
                    'stop_loss': signal.stop_loss,
                    'take_profit': signal.take_profit,
                    'timestamp': signal.timestamp.isoformat(),
                    'metadata': signal.metadata
                }
            })
        else:
            return jsonify({
                'success': True,
                'data': None,
                'message': 'No ensemble signal generated'
            })

    except Exception as e:
        logger.error(f"Error generating ensemble signal: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ensemble/summary', methods=['GET'])
def get_ensemble_summary():
    """Get ensemble manager summary"""
    try:
        summary = ensemble_manager.get_ensemble_summary()
        return jsonify({
            'success': True,
            'data': summary
        })
    except Exception as e:
        logger.error(f"Error getting ensemble summary: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ensemble/analytics', methods=['GET'])
def get_ensemble_analytics():
    """Get detailed ensemble analytics"""
    try:
        analytics = ensemble_manager.get_ensemble_analytics()
        return jsonify({
            'success': True,
            'data': analytics
        })
    except Exception as e:
        logger.error(f"Error getting ensemble analytics: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ensemble/weights', methods=['GET'])
def get_strategy_weights():
    """Get current strategy weights"""
    try:
        return jsonify({
            'success': True,
            'data': {
                'weights': ensemble_manager.strategy_weights,
                'rankings': ensemble_manager.get_strategy_rankings()
            }
        })
    except Exception as e:
        logger.error(f"Error getting strategy weights: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ensemble/weights/<strategy_name>', methods=['PUT'])
def update_strategy_weight(strategy_name):
    """Update strategy weight"""
    try:
        data = request.get_json()
        new_weight = data.get('weight')

        if new_weight is None:
            return jsonify({'error': 'Weight value required'}), 400

        ensemble_manager.update_strategy_weight(strategy_name, float(new_weight))

        return jsonify({
            'success': True,
            'message': f'Updated weight for {strategy_name}',
            'new_weight': ensemble_manager.strategy_weights.get(strategy_name)
        })

    except Exception as e:
        logger.error(f"Error updating strategy weight: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/ensemble/performance/update', methods=['POST'])
def update_ensemble_performance():
    """Update performance metrics for ensemble strategies"""
    try:
        data = request.get_json()
        strategy_name = data.get('strategy_name')
        trade_success = data.get('trade_success', False)
        pnl = data.get('pnl', 0.0)
        confidence = data.get('confidence', 0.7)

        if not strategy_name:
            return jsonify({'error': 'Strategy name required'}), 400

        ensemble_manager.update_performance(strategy_name, trade_success, pnl, confidence)

        return jsonify({
            'success': True,
            'message': f'Performance updated for {strategy_name}'
        })

    except Exception as e:
        logger.error(f"Error updating ensemble performance: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting NexusTradeAI Strategy Engine API Server...")
    app.run(host='0.0.0.0', port=3004, debug=True)
