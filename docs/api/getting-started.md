# Nexus Trade AI API - Getting Started

Welcome to the Nexus Trade AI API! Get your first trading signal in under 5 minutes with our powerful AI-driven trading algorithm.

## 🚀 Quick Start

### 1. Sign Up for Free
Create your free account at [nexustrade.ai/signup](https://nexustrade.ai/signup) and get:
- **1,000 free API calls** per month
- **100 trading signals** per month  
- **5 backtests** per month
- **10 symbols** maximum
- **30 days** of historical data

### 2. Get Your API Key
After signing up, you'll instantly receive your API key in your dashboard.

```bash
# Your API key will look like this:
nta_live_1234567890abcdef1234567890abcdef
```

### 3. Make Your First API Call

```bash
curl -X POST https://api.nexustrade.ai/v1/signals/generate \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "symbols": ["AAPL"],
    "timeframe": "1h",
    "confidence_threshold": 0.7
  }'
```

### 4. Get Your Trading Signal

```json
{
  "success": true,
  "signals": [{
    "symbol": "AAPL",
    "action": "BUY",
    "confidence": 0.85,
    "price": 150.25,
    "stop_loss": 147.50,
    "take_profit": 155.75,
    "timestamp": "2024-01-15T10:30:00Z",
    "strategies": ["trend", "momentum"],
    "metadata": {
      "algorithm": "NEXUS_ALPHA",
      "version": "2.0.0"
    }
  }],
  "metadata": {
    "request_id": "req_1234567890",
    "response_time_ms": 45,
    "signals_generated": 1,
    "cost_usd": 0.00
  }
}
```

## 📊 Core Features

### Trading Signal Generation
Generate AI-powered trading signals with 95%+ accuracy:

```javascript
const response = await fetch('https://api.nexustrade.ai/v1/signals/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    symbols: ['AAPL', 'GOOGL', 'MSFT'],
    timeframe: '4h',
    strategies: ['trend', 'mean_reversion', 'volatility_breakout'],
    confidence_threshold: 0.8
  })
});

const data = await response.json();
console.log(data.signals);
```

### Backtesting
Test your strategies on historical data:

```python
import requests

response = requests.post('https://api.nexustrade.ai/v1/backtest', 
  headers={'Authorization': 'Bearer YOUR_API_KEY'},
  json={
    'strategy': {
      'name': 'My Strategy',
      'symbols': ['AAPL'],
      'timeframe': '1d',
      'confidence_threshold': 0.75
    },
    'start_date': '2023-01-01',
    'end_date': '2023-12-31',
    'initial_capital': 10000
  }
)

backtest = response.json()
print(f"Total Return: {backtest['backtest']['total_return']:.2%}")
print(f"Sharpe Ratio: {backtest['backtest']['sharpe_ratio']:.2f}")
print(f"Max Drawdown: {backtest['backtest']['max_drawdown']:.2%}")
```

### Portfolio Optimization
Optimize your portfolio allocation:

```javascript
const optimization = await fetch('https://api.nexustrade.ai/v1/portfolio/optimize', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    positions: [
      { symbol: 'AAPL', weight: 0.3 },
      { symbol: 'GOOGL', weight: 0.3 },
      { symbol: 'MSFT', weight: 0.4 }
    ],
    objective: 'sharpe',
    constraints: {
      max_weight: 0.4,
      min_weight: 0.1
    }
  })
});
```

### Live Trading (Paid Plans)
Execute trades automatically:

```python
# Available in Professional tier and above
trade = requests.post('https://api.nexustrade.ai/v1/trading/execute',
  headers={'Authorization': 'Bearer YOUR_API_KEY'},
  json={
    'signal': {
      'symbol': 'AAPL',
      'action': 'BUY',
      'price': 150.25,
      'stop_loss': 147.50,
      'take_profit': 155.75
    },
    'account_id': 'your_broker_account',
    'position_size': 100
  }
)
```

## 🔧 SDKs and Libraries

### JavaScript/Node.js
```bash
npm install nexus-trade-ai
```

```javascript
const NexusTradeAI = require('nexus-trade-ai');

const client = new NexusTradeAI('YOUR_API_KEY');

// Generate signals
const signals = await client.generateSignals({
  symbols: ['AAPL', 'GOOGL'],
  timeframe: '1h'
});

// Run backtest
const backtest = await client.runBacktest({
  strategy: 'trend_following',
  symbols: ['AAPL'],
  startDate: '2023-01-01',
  endDate: '2023-12-31'
});
```

### Python
```bash
pip install nexus-trade-ai
```

```python
from nexus_trade_ai import NexusTradeAI

client = NexusTradeAI('YOUR_API_KEY')

# Generate signals
signals = client.generate_signals(
    symbols=['AAPL', 'GOOGL'],
    timeframe='1h'
)

# Run backtest
backtest = client.run_backtest(
    strategy='trend_following',
    symbols=['AAPL'],
    start_date='2023-01-01',
    end_date='2023-12-31'
)
```

### Go
```bash
go get github.com/nexustrade/nexus-trade-ai-go
```

```go
package main

import (
    "github.com/nexustrade/nexus-trade-ai-go"
)

func main() {
    client := nexustrade.NewClient("YOUR_API_KEY")
    
    signals, err := client.GenerateSignals(&nexustrade.SignalRequest{
        Symbols:   []string{"AAPL", "GOOGL"},
        Timeframe: "1h",
    })
    
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Printf("Generated %d signals\n", len(signals.Signals))
}
```

## 📈 Pricing Tiers

| Feature | Free | Basic | Professional | Enterprise |
|---------|------|-------|--------------|------------|
| **Price** | $0/month | $99/month | $999/month | $9,999/month |
| **API Calls** | 1,000 | 10,000 | 100,000 | 1,000,000 |
| **Trading Signals** | 100 | 1,000 | 10,000 | 100,000 |
| **Backtests** | 5 | 50 | 500 | Unlimited |
| **Symbols** | 10 | 100 | 1,000 | Unlimited |
| **Historical Data** | 30 days | 1 year | 5 years | 10+ years |
| **Live Trading** | ❌ | ❌ | ✅ | ✅ |
| **Custom Strategies** | ❌ | ❌ | ✅ | ✅ |
| **White Label** | ❌ | ❌ | ❌ | ✅ |
| **Support** | Community | Email | Priority | Dedicated |

## 🎯 Use Cases

### Algorithmic Trading
Build sophisticated trading algorithms with our AI signals:

```python
# Example: Momentum trading strategy
def momentum_strategy():
    signals = client.generate_signals(
        symbols=['SPY', 'QQQ', 'IWM'],
        timeframe='1d',
        strategies=['momentum', 'trend']
    )
    
    for signal in signals:
        if signal['confidence'] > 0.8:
            execute_trade(signal)
```

### Portfolio Management
Optimize portfolio allocation and risk:

```javascript
// Example: Risk parity portfolio
async function riskParityPortfolio(symbols) {
  const optimization = await client.optimizePortfolio({
    symbols: symbols,
    objective: 'risk_parity',
    constraints: {
      max_weight: 0.25,
      min_weight: 0.05
    }
  });
  
  return optimization.optimal_weights;
}
```

### Market Research
Analyze market trends and opportunities:

```python
# Example: Market regime analysis
def analyze_market_regime():
    analysis = client.analyze_market(
        symbols=['SPY'],
        analysis_type='regime_detection',
        period=252  # 1 year
    )
    
    return analysis['current_regime']
```

## 🔒 Authentication

All API requests require authentication using your API key in the Authorization header:

```bash
Authorization: Bearer YOUR_API_KEY
```

### API Key Security
- **Never expose your API key** in client-side code
- **Use environment variables** to store your API key
- **Rotate your API key** regularly
- **Monitor your usage** in the dashboard

## 📊 Rate Limits

Rate limits are enforced per API key:

| Tier | Requests per Minute | Requests per Hour | Requests per Day |
|------|-------------------|------------------|------------------|
| **Free** | 10 | 100 | 1,000 |
| **Basic** | 100 | 1,000 | 10,000 |
| **Professional** | 1,000 | 10,000 | 100,000 |
| **Enterprise** | 10,000 | 100,000 | 1,000,000 |

When you exceed rate limits, you'll receive a `429 Too Many Requests` response.

## 🚨 Error Handling

The API uses standard HTTP status codes:

```json
{
  "success": false,
  "error": "Invalid API key",
  "error_code": "INVALID_API_KEY",
  "request_id": "req_1234567890"
}
```

Common error codes:
- `INVALID_API_KEY` - API key is invalid or missing
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INSUFFICIENT_CREDITS` - Not enough API credits
- `INVALID_SYMBOL` - Symbol not supported
- `INVALID_TIMEFRAME` - Timeframe not supported

## 🆘 Support

### Free Tier
- **Community Support**: [Discord](https://discord.gg/nexustrade)
- **Documentation**: [docs.nexustrade.ai](https://docs.nexustrade.ai)
- **FAQ**: [nexustrade.ai/faq](https://nexustrade.ai/faq)

### Paid Tiers
- **Email Support**: support@nexustrade.ai
- **Priority Support**: Available for Professional and Enterprise
- **Dedicated Support**: Available for Enterprise

### Resources
- **API Reference**: [docs.nexustrade.ai/api](https://docs.nexustrade.ai/api)
- **Code Examples**: [github.com/nexustrade/examples](https://github.com/nexustrade/examples)
- **Tutorials**: [nexustrade.ai/tutorials](https://nexustrade.ai/tutorials)
- **Blog**: [blog.nexustrade.ai](https://blog.nexustrade.ai)

## 🚀 Next Steps

1. **[Sign up for free](https://nexustrade.ai/signup)** and get your API key
2. **[Try the interactive API explorer](https://docs.nexustrade.ai/explorer)**
3. **[Join our Discord community](https://discord.gg/nexustrade)**
4. **[Follow our tutorials](https://nexustrade.ai/tutorials)**
5. **[Upgrade to unlock more features](https://nexustrade.ai/pricing)**

Ready to build the future of algorithmic trading? Let's get started! 🚀
