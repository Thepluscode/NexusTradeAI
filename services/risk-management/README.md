# NexusTradeAI Risk Management Service

Advanced risk management system for automated crypto trading with comprehensive position sizing, stop-loss management, and portfolio-level risk controls.

## 🚀 Features

### Core Risk Management

- **Position Sizing**: Automatic calculation based on risk per trade
- **Stop-Loss Management**: Automated stop-loss and take-profit levels
- **Portfolio Risk Control**: Maximum portfolio exposure limits
- **Correlation Risk**: Prevents over-concentration in similar assets
- **Emergency Stop**: Circuit breaker for maximum drawdown protection

### Risk Profiles

- **Conservative**: 0.5% risk per trade, 2% max portfolio risk
- **Moderate**: 1% risk per trade, 5% max portfolio risk
- **Aggressive**: 2% risk per trade, 10% max portfolio risk

### API Endpoints

- Position sizing calculations
- Risk validation
- Portfolio monitoring
- Emergency controls
- Real-time price updates

## 📦 Installation

### Prerequisites

- Python 3.8+
- pip package manager

### Setup

```bash
# Navigate to risk management service
cd services/risk-management

# Install dependencies
pip install -r requirements.txt

# Run the service
python start.py
```

## 🔧 Configuration

### Environment Variables

```bash
# Optional - defaults provided
RISK_ACCOUNT_BALANCE=10000.0
RISK_LEVEL=moderate  # conservative, moderate, aggressive
API_PORT=3003
```

### Risk Parameters

```python
# Conservative Profile
risk_per_trade = 0.5%
max_portfolio_risk = 2%
stop_loss_percent = 3%
take_profit_percent = 6%
max_drawdown_percent = 10%

# Moderate Profile (Default)
risk_per_trade = 1%
max_portfolio_risk = 5%
stop_loss_percent = 5%
take_profit_percent = 10%
max_drawdown_percent = 15%

# Aggressive Profile
risk_per_trade = 2%
max_portfolio_risk = 10%
stop_loss_percent = 8%
take_profit_percent = 15%
max_drawdown_percent = 25%
```

## 🌐 API Reference

### Health Check

```http
GET /health
```

### Get Risk Configuration

```http
GET /api/risk/config
```

### Calculate Position Size

```http
POST /api/risk/position-size
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "entry_price": 45000.0,
  "stop_loss_price": 42750.0
}
```

### Open Position

```http
POST /api/risk/open-position
Content-Type: application/json

{
  "symbol": "BTCUSDT",
  "size": 0.0222,
  "entry_price": 45000.0,
  "current_price": 45000.0
}
```

### Update Prices

```http
POST /api/risk/update-prices
Content-Type: application/json

{
  "prices": {
    "BTCUSDT": 44500.0,
    "ETHUSDT": 3100.0
  }
}
```

### Get Portfolio Summary

```http
GET /api/risk/portfolio
```

### Emergency Stop

```http
POST /api/risk/emergency-stop
```

## 🧪 Testing

### Run Test Suite

```bash
python test_risk_manager.py
```

### Test Output Example

```
🚀 NexusTradeAI Risk Management System Test
==================================================
💰 Initial Account Balance: $10,000.00
📊 Risk Level: MODERATE
🎯 Risk per Trade: 1.0%
🛡️  Max Portfolio Risk: 5.0%

📈 Test 1: Position Sizing for BTC
------------------------------
Symbol: BTCUSDT
Entry Price: $45,000.00
Stop Loss: $42,750.00
Calculated Position Size: 0.044444 BTC
Position Value: $2,000.00

✅ BTC position opened successfully
Portfolio Risk: 2.00%
Positions: 1
```

## 🔗 Integration

### With Dashboard Service

The risk management service integrates with the Node.js dashboard via HTTP API calls:

```javascript
// Get portfolio summary
const response = await fetch("http://localhost:3003/api/risk/portfolio");
const portfolio = await response.json();

// Calculate position size
const sizeResponse = await fetch(
  "http://localhost:3003/api/risk/position-size",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: "BTCUSDT",
      entry_price: 45000,
      stop_loss_price: 42750,
    }),
  }
);
```

### Service Architecture

```
Dashboard (Node.js:3000) ←→ Risk Management (Python:3003)
                        ↓
Market Data (Node.js:3002)
```

## 📊 Risk Metrics

### Position Level

- Unrealized P&L
- Stop-loss distance
- Take-profit target
- Risk/reward ratio

### Portfolio Level

- Total exposure
- Correlation risk
- Drawdown percentage
- Emergency stop status

## 🛡️ Safety Features

### Circuit Breakers

- Maximum drawdown protection
- Emergency stop functionality
- Position limit enforcement
- Correlation risk prevention

### Validation Rules

- Minimum/maximum position sizes
- Portfolio exposure limits
- Risk per trade constraints
- Emergency stop override

## 📈 Usage Examples

### Basic Position Management

```python
from risk_manager import RiskManager, RiskParameters, RiskLevel

# Initialize with moderate risk
risk_params = RiskParameters.from_risk_level(RiskLevel.MODERATE)
rm = RiskManager(10000.0, risk_params)

# Calculate position size
size = rm.calculate_position_size("BTCUSDT", 45000.0, 42750.0)

# Open position
success = rm.open_position("BTCUSDT", size, 45000.0, 45000.0)

# Update prices and check triggers
closed = rm.update_position_prices({"BTCUSDT": 44000.0})
```

## 🔧 Troubleshooting

### Common Issues

1. **Service won't start**: Check Python version and dependencies
2. **API calls fail**: Verify service is running on port 3003
3. **Position validation fails**: Check risk parameters and account balance

### Logs

Service logs are output to console with timestamps and log levels for debugging.

## 📊 Advanced Risk Analytics

### Risk Metrics

- **Value at Risk (VaR)**: 95% and 99% confidence levels
- **Sharpe Ratio**: Risk-adjusted returns
- **Sortino Ratio**: Downside deviation focus
- **Calmar Ratio**: Return vs maximum drawdown
- **Maximum Drawdown**: Peak-to-trough analysis
- **Profit Factor**: Gross profit vs gross loss

### Performance Attribution

- Symbol-level performance breakdown
- Win/loss ratio analysis
- Best and worst performing assets
- Trade frequency analysis

### Risk Alerts

- Portfolio concentration warnings
- Drawdown threshold alerts
- Emergency stop notifications
- Position size warnings

### API Endpoints

```http
# Comprehensive risk report
GET /api/analytics/risk-report

# Value at Risk calculation
GET /api/analytics/var?confidence=0.95&days=1

# Performance ratios
GET /api/analytics/ratios

# Risk alerts
GET /api/analytics/alerts
```

### Example Analytics Response

```json
{
  "success": true,
  "data": {
    "portfolio_value": 10250.75,
    "total_return_percent": 2.51,
    "risk_metrics": {
      "var_95_1d": 125.5,
      "sharpe_ratio": 1.45,
      "sortino_ratio": 1.78,
      "max_drawdown_percent": 8.2
    },
    "trading_metrics": {
      "total_trades": 47,
      "win_rate_percent": 68.1,
      "profit_factor": 1.85
    }
  }
}
```

## 🧪 Advanced Testing

### Run Advanced Test Suite

```bash
python test_advanced_risk.py
```

### Test Features

- Comprehensive trading simulation (50+ trades)
- Multi-symbol portfolio management
- Risk analytics validation
- Performance attribution testing
- Alert system verification

## 🚀 Production Deployment

### Docker Support (Coming Soon)

```dockerfile
FROM python:3.9-slim
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 3003
CMD ["python", "start.py"]
```

### Monitoring

- Health check endpoint for load balancers
- Comprehensive logging for audit trails
- Portfolio metrics for monitoring dashboards
- Real-time risk alerts
- Performance analytics dashboards
