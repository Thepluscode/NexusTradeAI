"""
NexusTradeAI Risk Management API Server
======================================

Flask API server that exposes risk management functionality
to the Node.js dashboard and other services.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import logging
from datetime import datetime
import json
from typing import Dict, Any

from risk_manager import RiskManager, RiskParameters, RiskLevel
from risk_analytics import AdvancedRiskAnalytics

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Global risk manager and analytics instances
risk_manager = None
risk_analytics = None

def init_risk_manager(account_balance: float = 10000.0, risk_level: str = "moderate"):
    """Initialize the global risk manager and analytics"""
    global risk_manager, risk_analytics

    risk_level_enum = RiskLevel(risk_level.lower())
    risk_params = RiskParameters.from_risk_level(risk_level_enum)
    risk_manager = RiskManager(account_balance, risk_params)
    risk_analytics = AdvancedRiskAnalytics(risk_manager)

    logger.info(f"Risk Manager initialized with balance: ${account_balance}, risk level: {risk_level}")

# Initialize with default values
init_risk_manager()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'risk-management',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/risk/config', methods=['GET'])
def get_risk_config():
    """Get current risk management configuration"""
    if not risk_manager:
        return jsonify({'error': 'Risk manager not initialized'}), 500
    
    return jsonify({
        'success': True,
        'data': {
            'account_balance': risk_manager.account_balance,
            'initial_balance': risk_manager.initial_balance,
            'risk_per_trade': risk_manager.risk_params.risk_per_trade,
            'max_portfolio_risk': risk_manager.risk_params.max_portfolio_risk,
            'max_positions': risk_manager.risk_params.max_positions,
            'stop_loss_percent': risk_manager.risk_params.stop_loss_percent,
            'take_profit_percent': risk_manager.risk_params.take_profit_percent,
            'max_drawdown_percent': risk_manager.risk_params.max_drawdown_percent,
            'emergency_stop': risk_manager.emergency_stop
        }
    })

@app.route('/api/risk/config', methods=['POST'])
def update_risk_config():
    """Update risk management configuration"""
    global risk_manager
    
    try:
        data = request.get_json()
        
        account_balance = data.get('account_balance', 10000.0)
        risk_level = data.get('risk_level', 'moderate')
        
        # Reinitialize risk manager with new config
        init_risk_manager(account_balance, risk_level)
        
        return jsonify({
            'success': True,
            'message': 'Risk configuration updated successfully'
        })
        
    except Exception as e:
        logger.error(f"Error updating risk config: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/position-size', methods=['POST'])
def calculate_position_size():
    """Calculate optimal position size for a trade"""
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        entry_price = float(data.get('entry_price'))
        stop_loss_price = float(data.get('stop_loss_price'))
        
        if not all([symbol, entry_price, stop_loss_price]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        position_size = risk_manager.calculate_position_size(symbol, entry_price, stop_loss_price)
        stop_loss, take_profit = risk_manager.calculate_stop_loss_take_profit(entry_price)
        
        return jsonify({
            'success': True,
            'data': {
                'symbol': symbol,
                'entry_price': entry_price,
                'position_size': position_size,
                'stop_loss': stop_loss,
                'take_profit': take_profit,
                'risk_amount': risk_manager.account_balance * risk_manager.risk_params.risk_per_trade
            }
        })
        
    except Exception as e:
        logger.error(f"Error calculating position size: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/validate-position', methods=['POST'])
def validate_position():
    """Validate if a new position can be opened"""
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        position_size = float(data.get('position_size'))
        entry_price = float(data.get('entry_price'))
        
        if not all([symbol, position_size, entry_price]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        is_valid = risk_manager.validate_new_position(symbol, position_size, entry_price)
        
        return jsonify({
            'success': True,
            'data': {
                'is_valid': is_valid,
                'symbol': symbol,
                'current_positions': len(risk_manager.positions),
                'max_positions': risk_manager.risk_params.max_positions,
                'portfolio_risk': risk_manager._calculate_portfolio_risk()
            }
        })
        
    except Exception as e:
        logger.error(f"Error validating position: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/open-position', methods=['POST'])
def open_position():
    """Open a new trading position"""
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        size = float(data.get('size'))
        entry_price = float(data.get('entry_price'))
        current_price = float(data.get('current_price', entry_price))
        
        if not all([symbol, size, entry_price]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        success = risk_manager.open_position(symbol, size, entry_price, current_price)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Position opened for {symbol}',
                'data': risk_manager.get_portfolio_summary()
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Position could not be opened due to risk constraints'
            }), 400
            
    except Exception as e:
        logger.error(f"Error opening position: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/close-position', methods=['POST'])
def close_position():
    """Close an existing trading position"""
    try:
        data = request.get_json()
        symbol = data.get('symbol')
        exit_price = float(data.get('exit_price'))
        reason = data.get('reason', 'Manual')
        
        if not all([symbol, exit_price]):
            return jsonify({'error': 'Missing required parameters'}), 400
        
        success = risk_manager.close_position(symbol, exit_price, reason)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Position closed for {symbol}',
                'data': risk_manager.get_portfolio_summary()
            })
        else:
            return jsonify({
                'success': False,
                'message': f'No position found for {symbol}'
            }), 404
            
    except Exception as e:
        logger.error(f"Error closing position: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/update-prices', methods=['POST'])
def update_prices():
    """Update current prices and check for stop-loss/take-profit triggers"""
    try:
        data = request.get_json()
        price_updates = data.get('prices', {})
        
        if not price_updates:
            return jsonify({'error': 'No price updates provided'}), 400
        
        # Convert string prices to float
        price_updates = {symbol: float(price) for symbol, price in price_updates.items()}
        
        closed_symbols = risk_manager.update_position_prices(price_updates)
        
        return jsonify({
            'success': True,
            'data': {
                'closed_positions': closed_symbols,
                'portfolio_summary': risk_manager.get_portfolio_summary()
            }
        })
        
    except Exception as e:
        logger.error(f"Error updating prices: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/portfolio', methods=['GET'])
def get_portfolio():
    """Get comprehensive portfolio summary"""
    try:
        return jsonify({
            'success': True,
            'data': risk_manager.get_portfolio_summary()
        })
        
    except Exception as e:
        logger.error(f"Error getting portfolio: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/emergency-stop', methods=['POST'])
def emergency_stop():
    """Activate emergency stop - close all positions"""
    try:
        risk_manager.emergency_stop = True
        
        # Close all positions
        closed_positions = []
        for symbol in list(risk_manager.positions.keys()):
            position = risk_manager.positions[symbol]
            if risk_manager.close_position(symbol, position.current_price, "EMERGENCY_STOP"):
                closed_positions.append(symbol)
        
        return jsonify({
            'success': True,
            'message': 'Emergency stop activated',
            'data': {
                'closed_positions': closed_positions,
                'portfolio_summary': risk_manager.get_portfolio_summary()
            }
        })
        
    except Exception as e:
        logger.error(f"Error during emergency stop: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/risk/reset-emergency', methods=['POST'])
def reset_emergency():
    """Reset emergency stop flag"""
    try:
        risk_manager.emergency_stop = False
        
        return jsonify({
            'success': True,
            'message': 'Emergency stop reset'
        })
        
    except Exception as e:
        logger.error(f"Error resetting emergency stop: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Advanced Analytics Endpoints
@app.route('/api/analytics/risk-report', methods=['GET'])
def get_risk_report():
    """Get comprehensive risk analytics report"""
    try:
        if not risk_analytics:
            return jsonify({'error': 'Risk analytics not initialized'}), 500

        report = risk_analytics.generate_risk_report()

        # Convert datetime objects to ISO strings for JSON serialization
        if 'timestamp' in report:
            report['timestamp'] = report['timestamp'].isoformat()

        return jsonify({
            'success': True,
            'data': report
        })

    except Exception as e:
        logger.error(f"Error generating risk report: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics/var', methods=['GET'])
def calculate_var():
    """Calculate Value at Risk"""
    try:
        confidence_level = request.args.get('confidence', 0.95, type=float)
        days = request.args.get('days', 1, type=int)

        if not risk_analytics:
            return jsonify({'error': 'Risk analytics not initialized'}), 500

        var_95 = risk_analytics.calculate_var(0.95, days)
        var_99 = risk_analytics.calculate_var(0.99, days)
        var_custom = risk_analytics.calculate_var(confidence_level, days)

        return jsonify({
            'success': True,
            'data': {
                'var_95': var_95,
                'var_99': var_99,
                'var_custom': var_custom,
                'confidence_level': confidence_level,
                'time_horizon_days': days
            }
        })

    except Exception as e:
        logger.error(f"Error calculating VaR: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics/ratios', methods=['GET'])
def get_performance_ratios():
    """Get performance ratios (Sharpe, Sortino, Calmar)"""
    try:
        if not risk_analytics:
            return jsonify({'error': 'Risk analytics not initialized'}), 500

        sharpe = risk_analytics.calculate_sharpe_ratio()
        sortino = risk_analytics.calculate_sortino_ratio()
        calmar = risk_analytics.calculate_calmar_ratio()
        win_rate, avg_win, avg_loss = risk_analytics.calculate_win_loss_ratio()
        profit_factor = risk_analytics.calculate_profit_factor()

        return jsonify({
            'success': True,
            'data': {
                'sharpe_ratio': sharpe,
                'sortino_ratio': sortino,
                'calmar_ratio': calmar,
                'win_rate': win_rate,
                'avg_win': avg_win,
                'avg_loss': avg_loss,
                'profit_factor': profit_factor
            }
        })

    except Exception as e:
        logger.error(f"Error calculating performance ratios: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/analytics/alerts', methods=['GET'])
def get_risk_alerts():
    """Get current risk alerts"""
    try:
        if not risk_analytics:
            return jsonify({'error': 'Risk analytics not initialized'}), 500

        alerts = risk_analytics.get_risk_alerts()

        # Convert datetime objects to ISO strings
        for alert in alerts:
            if 'timestamp' in alert:
                alert['timestamp'] = alert['timestamp'].isoformat()

        return jsonify({
            'success': True,
            'data': {
                'alerts': alerts,
                'alert_count': len(alerts),
                'critical_alerts': len([a for a in alerts if a['level'] == 'CRITICAL']),
                'high_alerts': len([a for a in alerts if a['level'] == 'HIGH']),
                'medium_alerts': len([a for a in alerts if a['level'] == 'MEDIUM'])
            }
        })

    except Exception as e:
        logger.error(f"Error getting risk alerts: {e}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("Starting NexusTradeAI Risk Management API Server...")
    app.run(host='0.0.0.0', port=3003, debug=True)
