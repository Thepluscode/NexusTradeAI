# Frontend-Backend Integration Guide

## 🎯 Current Status

### ❌ **Problem Identified**

Your existing dashboards (`enterprise-dashboard.html`, `realistic-dashboard.html`) are **NOT connected** to the new backend services I created. They are using:

- ❌ Mock/hardcoded data
- ❌ Only banking API (`localhost:3003`)
- ❌ No real-time updates
- ❌ Missing advanced metrics (VaR, Sharpe, AI predictions, etc.)

### ✅ **Solution Provided**

I've created:
1. ✅ **Enhanced Trading Dashboard** (`enhanced-trading-dashboard.html`)
2. ✅ Connects to ALL backend services
3. ✅ Real-time data updates (every 5 seconds)
4. ✅ Displays all advanced features

---

## 🔌 Backend Services & Endpoints

### **1. Enhanced Trading Engine** (Port 3002)

**File**: `services/trading/enhanced-trading-engine.js`

**Endpoints**:
```javascript
GET  /api/trading/status          // Engine status, performance metrics
GET  /api/trading/analytics       // Strategy performance, positions
POST /api/trading/start          // Start trading engine
POST /api/trading/stop           // Stop trading engine
POST /api/trading/realize-profits // Close profitable positions
```

**Example Response** (`/api/trading/status`):
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "circuitBreakerActive": false,
    "activePositions": 5,
    "dailyPnL": 2456.75,
    "performance": {
      "totalTrades": 156,
      "winRate": "58.5%",
      "totalProfit": "12543.25",
      "sharpeRatio": "2.15",
      "sortinoRatio": "2.87",
      "maxDrawdown": "-6.2%",
      "profitFactor": "2.34",
      "expectancy": "80.54"
    },
    "riskMetrics": {
      "consecutiveLosses": 1,
      "maxDrawdown": -0.062,
      "dailyVolume": 245000
    }
  }
}
```

---

### **2. Advanced Risk Manager** (Port 3004)

**File**: `services/trading/advanced-risk-manager.js`

**Endpoints**:
```javascript
GET  /api/risk/report             // Comprehensive risk report
GET  /api/risk/metrics            // Current risk metrics
POST /api/risk/check              // Pre-trade risk validation
POST /api/risk/stress-test        // Run stress test scenarios
GET  /api/risk/alerts             // Active risk alerts
```

**Example Response** (`/api/risk/report`):
```json
{
  "success": true,
  "data": {
    "riskMetrics": {
      "portfolioValue": 125000,
      "portfolioVaR": 4523.50,
      "portfolioCVaR": 6234.25,
      "leverage": 1.45,
      "concentrationRisk": 0.32,
      "marginUtilization": 0.65,
      "maxDrawdown": -0.085
    },
    "sectorExposure": {
      "Technology": 45000,
      "Healthcare": 32000,
      "Finance": 28000
    },
    "correlationRisk": {
      "AAPL-GOOGL": {
        "correlation": 0.75,
        "risk": "high"
      }
    },
    "recentAlerts": [
      {
        "id": "alert_12345",
        "type": "high_correlation",
        "severity": "warning",
        "details": {
          "positions": ["AAPL", "GOOGL"],
          "correlation": "0.752"
        },
        "timestamp": 1696598400000
      }
    ]
  }
}
```

---

### **3. AI Prediction Service** (Port 5000)

**File**: `ai-ml/services/api_server.py`

**Endpoints**:
```python
GET  /health                      # Service health check
GET  /models                      # Available models
POST /predict                     # Get prediction for symbol
POST /batch-predict               # Batch predictions
POST /retrain                     # Trigger retraining
```

**Example Request** (`/predict`):
```json
{
  "symbol": "AAPL",
  "strategy": "momentum",
  "marketData": {
    "price": 175.50,
    "sma20": 173.00,
    "sma50": 170.00,
    "rsi": 55,
    "volume": 50000000,
    "avgVolume": 40000000,
    "volatility": 0.25
  }
}
```

**Example Response**:
```json
{
  "success": true,
  "prediction": {
    "symbol": "AAPL",
    "strategy": "momentum",
    "direction": "up",
    "confidence": 0.87,
    "strength": 0.72,
    "method": "ml_model",
    "timestamp": "2025-10-06T12:34:56Z",
    "features": {
      "price_to_sma20": 1.014,
      "rsi_normalized": 0.55,
      "volume_ratio": 1.25
    }
  }
}
```

---

### **4. Real-Time Market Data** (Port 3001)

**File**: `services/trading/real-time-market-data.js`

**Endpoints**:
```javascript
GET  /api/market/status           // Connection status
GET  /api/market/quote/:symbol    // Latest quote
GET  /api/market/trades/:symbol   // Recent trades
GET  /api/market/bars/:symbol     // Historical bars
POST /api/market/subscribe        // Subscribe to symbols
POST /api/market/unsubscribe      // Unsubscribe from symbols
```

**WebSocket Connection**:
```javascript
const ws = new WebSocket('ws://localhost:3001/ws');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'quote') {
    console.log(`${data.symbol}: $${data.bid} x $${data.ask}`);
  }
};
```

---

## 🚀 How to Connect Your Dashboard

### **Step 1: Start All Backend Services**

```bash
# Terminal 1: Enhanced Trading Engine
node services/trading/enhanced-trading-engine.js
# Should run on port 3002

# Terminal 2: Advanced Risk Manager
node services/trading/advanced-risk-manager.js
# Should run on port 3004

# Terminal 3: AI Prediction Service
python3 ai-ml/services/api_server.py
# Should run on port 5000

# Terminal 4: Real-Time Market Data
node services/trading/real-time-market-data.js
# Should run on port 3001
```

### **Step 2: Open Enhanced Dashboard**

```bash
# Open in browser
open enhanced-trading-dashboard.html

# Or serve with a simple HTTP server
python3 -m http.server 8000
# Then visit: http://localhost:8000/enhanced-trading-dashboard.html
```

### **Step 3: Verify Connections**

Check the dashboard header badges:
- ✅ **Engine: Online** - Trading engine connected
- ✅ **AI: Online** - AI service connected
- ✅ **Data: Online** - Market data connected

---

## 📊 Updating Your Existing Dashboards

### **Option 1: Replace Entire Dashboard**

Simply use the new `enhanced-trading-dashboard.html` instead of the old ones.

### **Option 2: Update Existing Dashboard**

Add these JavaScript functions to your existing dashboard:

```javascript
// Add to your dashboard's <script> section

const API_ENDPOINTS = {
    tradingEngine: 'http://localhost:3002/api/trading',
    riskManager: 'http://localhost:3004/api/risk',
    aiService: 'http://localhost:5000',
    marketData: 'http://localhost:3001/api/market'
};

// Fetch trading engine data
async function updateTradingMetrics() {
    try {
        const response = await fetch(`${API_ENDPOINTS.tradingEngine}/status`);
        const data = await response.json();

        if (data.success) {
            // Update your dashboard elements
            document.getElementById('totalPnl').textContent =
                `$${data.data.performance.totalProfit}`;
            document.getElementById('winRate').textContent =
                data.data.performance.winRate;
            document.getElementById('sharpeRatio').textContent =
                data.data.performance.sharpeRatio;

            // Circuit breaker status
            if (data.data.circuitBreakerActive) {
                showCircuitBreakerAlert();
            }
        }
    } catch (error) {
        console.error('Failed to fetch trading data:', error);
    }
}

// Fetch risk metrics
async function updateRiskMetrics() {
    try {
        const response = await fetch(`${API_ENDPOINTS.riskManager}/report`);
        const data = await response.json();

        if (data.success) {
            const metrics = data.data.riskMetrics;

            document.getElementById('portfolioVaR').textContent =
                `$${metrics.portfolioVaR.toFixed(2)}`;
            document.getElementById('leverage').textContent =
                `${metrics.leverage.toFixed(2)}x`;

            // Show risk alerts
            if (data.data.recentAlerts.length > 0) {
                showRiskAlerts(data.data.recentAlerts);
            }
        }
    } catch (error) {
        console.error('Failed to fetch risk data:', error);
    }
}

// Fetch AI predictions
async function getAIPrediction(symbol) {
    try {
        const response = await fetch(`${API_ENDPOINTS.aiService}/predict`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                symbol: symbol,
                strategy: 'momentum',
                marketData: {
                    price: 175.50,
                    sma20: 173.00,
                    sma50: 170.00,
                    rsi: 55
                }
            })
        });

        const data = await response.json();

        if (data.success) {
            console.log(`AI Prediction for ${symbol}:`, data.prediction);
            return data.prediction;
        }
    } catch (error) {
        console.error('Failed to get AI prediction:', error);
    }
}

// Auto-refresh data every 5 seconds
setInterval(async () => {
    await updateTradingMetrics();
    await updateRiskMetrics();
}, 5000);

// Initial load
updateTradingMetrics();
updateRiskMetrics();
```

---

## 🎨 Displaying Advanced Metrics

### **Example: Circuit Breaker Status**

```html
<!-- Add to your dashboard HTML -->
<div class="alert-box" id="circuitBreakerAlert" style="display: none;">
    <strong>⚠️ Circuit Breaker Active!</strong>
    <p>Trading has been automatically halted due to risk limits.</p>
</div>

<script>
function showCircuitBreakerAlert() {
    document.getElementById('circuitBreakerAlert').style.display = 'block';
}
</script>
```

### **Example: Risk Alerts**

```html
<div class="risk-alerts-container" id="riskAlerts"></div>

<script>
function showRiskAlerts(alerts) {
    const container = document.getElementById('riskAlerts');

    container.innerHTML = alerts.map(alert => `
        <div class="alert-item ${alert.severity}">
            <span class="alert-icon">⚠️</span>
            <div>
                <strong>${alert.type}</strong>
                <p>${JSON.stringify(alert.details)}</p>
                <small>${new Date(alert.timestamp).toLocaleString()}</small>
            </div>
        </div>
    `).join('');
}
</script>
```

### **Example: AI Prediction Display**

```html
<div class="ai-prediction-card">
    <h3>AI Prediction: <span id="predSymbol">AAPL</span></h3>
    <div class="prediction-value">
        Direction: <span id="predDirection">UP</span>
    </div>
    <div class="prediction-confidence">
        Confidence: <span id="predConfidence">87%</span>
    </div>
    <div class="prediction-strength">
        Strength: <span id="predStrength">0.72</span>
    </div>
</div>

<script>
async function displayAIPrediction(symbol) {
    const prediction = await getAIPrediction(symbol);

    if (prediction) {
        document.getElementById('predSymbol').textContent = prediction.symbol;
        document.getElementById('predDirection').textContent =
            prediction.direction.toUpperCase();
        document.getElementById('predConfidence').textContent =
            `${(prediction.confidence * 100).toFixed(0)}%`;
        document.getElementById('predStrength').textContent =
            prediction.strength.toFixed(2);
    }
}
</script>
```

---

## 📡 Real-Time WebSocket Updates

For truly real-time data, use WebSocket connections:

```javascript
// Connect to market data WebSocket
const marketDataWs = new WebSocket('ws://localhost:3001/ws');

marketDataWs.onopen = () => {
    console.log('Connected to market data stream');

    // Subscribe to symbols
    marketDataWs.send(JSON.stringify({
        action: 'subscribe',
        symbols: ['AAPL', 'GOOGL', 'MSFT'],
        types: ['quotes', 'trades']
    }));
};

marketDataWs.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'quote') {
        updateQuoteDisplay(data.symbol, data);
    } else if (data.type === 'trade') {
        updateTradeDisplay(data.symbol, data);
    }
};

function updateQuoteDisplay(symbol, quote) {
    const element = document.getElementById(`quote-${symbol}`);
    if (element) {
        element.innerHTML = `
            <span class="symbol">${symbol}</span>
            <span class="bid">$${quote.bid}</span> x
            <span class="ask">$${quote.ask}</span>
        `;
    }
}
```

---

## 🔧 Troubleshooting

### **Issue 1: CORS Errors**

If you see CORS errors in browser console:

```javascript
// Add CORS headers to your backend services

// In Node.js (Express)
const cors = require('cors');
app.use(cors());

// Or manually
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
```

### **Issue 2: Service Not Running**

Check which services are running:

```bash
# Check running processes
lsof -i :3002  # Trading Engine
lsof -i :3004  # Risk Manager
lsof -i :5000  # AI Service
lsof -i :3001  # Market Data

# If not running, start them
node services/trading/enhanced-trading-engine.js &
python3 ai-ml/services/api_server.py &
```

### **Issue 3: "Failed to fetch" Error**

This usually means the backend service isn't running. Start it:

```bash
# Check logs
tail -f logs/trading-error.log
tail -f logs/ai-predictions.log

# Restart service
pkill -f "enhanced-trading-engine"
node services/trading/enhanced-trading-engine.js
```

---

## 📈 Dashboard Features Comparison

| Feature | Old Dashboard | Enhanced Dashboard |
|---------|---------------|-------------------|
| **Performance Metrics** | Mock data | ✅ Real backend data |
| **Win Rate** | Hardcoded | ✅ Live calculation |
| **Sharpe Ratio** | Not shown | ✅ Real-time |
| **Circuit Breaker** | Not shown | ✅ Live status |
| **VaR/CVaR** | Not shown | ✅ Real calculation |
| **Risk Alerts** | Not shown | ✅ Real-time alerts |
| **AI Predictions** | Not shown | ✅ Live predictions |
| **Position Sizing** | Not shown | ✅ Kelly Criterion |
| **Correlation Risk** | Not shown | ✅ Live monitoring |
| **Market Data Quality** | Not shown | ✅ Quality metrics |
| **Auto-refresh** | Manual | ✅ Every 5 seconds |
| **WebSocket** | No | ✅ Available |

---

## 🎯 Next Steps

### **Immediate (Today)**
1. ✅ Open `enhanced-trading-dashboard.html`
2. ✅ Start backend services
3. ✅ Verify all badges show "Online"
4. ✅ Watch real-time data updates

### **Short-term (This Week)**
1. Customize dashboard styling to match your brand
2. Add charts (use Chart.js or similar)
3. Add more interactive controls (start/stop trading, adjust risk limits)
4. Set up email/SMS alerts for critical events

### **Long-term (This Month)**
1. Build React/Vue version for better interactivity
2. Add user authentication
3. Create mobile-responsive version
4. Add historical performance charts
5. Implement advanced analytics views

---

## 📚 Additional Resources

- **Backend Documentation**: See `TRADING_IMPROVEMENTS.md`
- **AI Integration**: See `AI_INTEGRATION_GUIDE.md`
- **API Examples**: Check `services/*/` for more endpoints

---

## ✅ Summary

**Before**: Dashboards using mock data, only banking API, no advanced features

**After**: Enhanced dashboard connecting to:
- ✅ Trading Engine (performance, positions, circuit breaker)
- ✅ Risk Manager (VaR, alerts, correlation)
- ✅ AI Service (predictions, confidence)
- ✅ Market Data (real-time quotes, quality)

**Result**: **Full visibility** into all backend improvements!

---

**Last Updated**: 2025-10-06
**Version**: 1.0.0
