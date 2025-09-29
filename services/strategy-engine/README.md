# NexusTradeAI Strategy Engine

Advanced modular trading strategy framework with multiple algorithm types, backtesting capabilities, and AI integration for automated crypto trading.

## 🚀 Features

### Strategy Types
- **Trend Following**: Moving Average Crossover strategies
- **Mean Reversion**: RSI-based oversold/overbought strategies  
- **Momentum**: Breakout strategies with volume confirmation
- **Scalping**: High-frequency EMA-based strategies
- **AI-Powered**: Machine learning enhanced strategies (framework ready)
- **Hybrid**: Multi-factor combination strategies

### Core Capabilities
- **Modular Architecture**: Easy to add new strategies
- **Signal Generation**: Real-time trading signal creation
- **Signal Validation**: Multi-layer signal verification
- **Performance Tracking**: Strategy-specific metrics
- **Configuration Management**: Export/import strategy settings
- **Risk Integration**: Works with risk management service

## 📦 Installation

### Prerequisites
- Python 3.8+
- TA-Lib library
- pip package manager

### Setup
```bash
# Navigate to strategy engine service
cd services/strategy-engine

# Install TA-Lib (required for technical indicators)
# On macOS:
brew install ta-lib

# On Ubuntu/Debian:
sudo apt-get install libta-lib-dev

# On Windows:
# Download and install from: https://www.lfd.uci.edu/~gohlke/pythonlibs/#ta-lib

# Install Python dependencies
pip install -r requirements.txt

# Run the service
python start.py
```

## 🔧 Strategy Framework

### Base Strategy Class
```python
from strategy_framework import BaseStrategy, StrategyType, TradingSignal

class MyCustomStrategy(BaseStrategy):
    def __init__(self):
        super().__init__(
            name="My_Custom_Strategy",
            strategy_type=StrategyType.TREND_FOLLOWING,
            parameters={'period': 20, 'threshold': 0.02}
        )
    
    def generate_signal(self, market_data):
        # Implement your strategy logic
        return TradingSignal(...)
    
    def validate_signal(self, signal, current_price):
        # Implement signal validation
        return True
```

### Built-in Strategies

#### 1. Moving Average Crossover
```python
strategy = MovingAverageCrossoverStrategy(
    short_period=20,
    long_period=50,
    rsi_confirmation=True
)
```

#### 2. RSI Mean Reversion
```python
strategy = RSIMeanReversionStrategy(
    rsi_period=14,
    oversold=30,
    overbought=70
)
```

#### 3. Momentum Breakout
```python
strategy = MomentumBreakoutStrategy(
    period=20,
    volume_multiplier=1.5
)
```

#### 4. Scalping Strategy
```python
strategy = ScalpingStrategy(
    fast_ema=5,
    slow_ema=13
)
```

## 🌐 API Reference

### Health Check
```http
GET /health
```

### List Strategies
```http
GET /api/strategies
```

### Get Strategy Details
```http
GET /api/strategies/{strategy_name}
```

### Activate/Deactivate Strategy
```http
POST /api/strategies/{strategy_name}/activate
POST /api/strategies/{strategy_name}/deactivate
```

### Update Strategy Parameters
```http
PUT /api/strategies/{strategy_name}/parameters
Content-Type: application/json

{
  "parameters": {
    "short_period": 15,
    "long_period": 45
  }
}
```

### Generate Signals
```http
POST /api/signals/generate
Content-Type: application/json

{
  "symbols": ["BTCUSDT", "ETHUSDT"],
  "market_data": {
    "BTCUSDT": [
      {
        "timestamp": "2024-01-01T00:00:00",
        "open": 45000,
        "high": 45500,
        "low": 44800,
        "close": 45200,
        "volume": 1000000
      }
    ]
  }
}
```

### Get Recent Signals
```http
GET /api/signals/recent?limit=20
```

### Performance Metrics
```http
GET /api/performance/overall
GET /api/performance/{strategy_name}
```

## 🧪 Testing

### Run Test Suite
```bash
python test_strategies.py
```

### Test Output Example
```
🚀 NexusTradeAI Strategy Engine Test Suite
==================================================

🧪 Testing Individual Strategies
========================================

📈 Testing Moving Average Crossover Strategy
---------------------------------------------
✅ Signal Generated: Signal(BTCUSDT: buy @ 45250.0000 with 0.85 confidence)
   Confidence: 0.85
   Entry Price: $45250.00
   Stop Loss: $42987.50
   Take Profit: $49775.00

📊 Testing RSI Mean Reversion Strategy
----------------------------------------
✅ Signal Generated: Signal(BTCUSDT: sell @ 45250.0000 with 0.72 confidence)
   RSI Value: 75.23
```

## 🔗 Integration

### With Risk Management Service
```python
# Strategy generates signal
signal = strategy.generate_signal(market_data)

# Risk manager validates position size
position_size = risk_manager.calculate_position_size(
    signal.symbol, 
    signal.entry_price, 
    signal.stop_loss
)

# Execute trade if risk allows
if risk_manager.validate_new_position(signal.symbol, position_size, signal.entry_price):
    execute_trade(signal, position_size)
```

### With Dashboard Service
The strategy engine integrates with the Node.js dashboard via HTTP API calls:

```javascript
// Get active strategies
const response = await fetch('http://localhost:3004/api/strategies');
const strategies = await response.json();

// Generate signals
const signalResponse = await fetch('http://localhost:3004/api/signals/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    symbols: ['BTCUSDT', 'ETHUSDT'],
    market_data: marketDataObject
  })
});
```

## 📊 Signal Structure

### TradingSignal Object
```python
{
  "symbol": "BTCUSDT",
  "signal_type": "buy",           # buy, sell, hold, strong_buy, strong_sell
  "confidence": 0.85,             # 0.0 to 1.0
  "entry_price": 45250.0,
  "stop_loss": 42987.5,
  "take_profit": 49775.0,
  "timestamp": "2024-01-01T12:00:00",
  "strategy": "MA_Cross_20_50",
  "metadata": {
    "short_ma": 45100.0,
    "long_ma": 44800.0,
    "rsi": 65.2
  }
}
```

## 📈 Performance Metrics

### Strategy Level
- Total signals generated
- Successful signals
- Win rate percentage
- Average confidence
- Last signal time

### Overall System
- Total signals across all strategies
- Signals executed
- Success rate
- Active vs total strategies

## 🛡️ Signal Validation

### Multi-Layer Validation
1. **Strategy-specific validation**: Each strategy validates its own signals
2. **Price movement validation**: Ensures price hasn't moved too much since signal
3. **Time-based validation**: Signals expire after certain time periods
4. **Risk management integration**: Validates against position limits

## 🔧 Configuration Management

### Export Configuration
```bash
curl http://localhost:3004/api/config/export
```

### Import Configuration
```bash
curl -X POST http://localhost:3004/api/config/import \
  -H "Content-Type: application/json" \
  -d '{"config": {...}}'
```

## 🚀 Production Deployment

### Service Architecture
```
Dashboard (Node.js:3000) ←→ Strategy Engine (Python:3004)
                        ↓
Risk Management (Python:3003) ←→ Market Data (Node.js:3002)
```

### Monitoring
- Health check endpoint for load balancers
- Performance metrics for monitoring dashboards
- Comprehensive logging for debugging
- Signal history for analysis

### Scaling Considerations
- Stateless design allows horizontal scaling
- Market data caching for performance
- Configurable signal history limits
- Memory-efficient data structures

## 🔧 Troubleshooting

### Common Issues
1. **TA-Lib installation fails**: Install system dependencies first
2. **No signals generated**: Check market data availability and strategy parameters
3. **API calls timeout**: Verify service is running on port 3004
4. **Strategy validation fails**: Check signal confidence thresholds

### Debug Mode
Set `debug=True` in `api_server.py` for detailed error messages and request logging.
