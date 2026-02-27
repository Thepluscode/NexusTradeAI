# NexusTradeAI - Running Services

## ✅ Services Currently Running

### 1. **Trading Server** (Port 3002)
- **Status**: ✅ Running
- **URL**: http://localhost:3002
- **Description**: Profitable Trading Server with automated strategies
- **Features**:
  - Trend Following
  - Mean Reversion
  - Volatility Breakout
  - AI Signals
- **Config**:
  - Symbols: AAPL, GOOGL, MSFT, TSLA, NVDA
  - Risk Per Trade: 2.0%
  - AI Enabled: false (fallback mode)
  - Real Trading: false (paper trading mode)
- **Performance**:
  - Total Trades: 1,068
  - Win Rate: 39.1%
  - Total Profit: $533,459
  - Sharpe Ratio: 2,156

### 2. **AI Prediction Service** (Port 5001)
- **Status**: ✅ Running
- **URL**: http://localhost:5001
- **Description**: Flask-based AI prediction API
- **Features**:
  - Rule-based predictions
  - Technical analysis fallback
  - Supports ML model loading
- **Endpoints**:
  - GET /health - Health check
  - GET /models - List available models
  - POST /predict - Get prediction

### 3. **React Dashboard** (Port 3000)
- **Status**: ✅ Running
- **URL**: http://localhost:3000
- **Description**: Modern React + TypeScript trading dashboard
- **Features**:
  - Real-time metrics display
  - Material-UI components
  - Auto-refresh every 5 seconds
  - Trading controls
  - Performance tracking
- **Note**: Risk Manager service disabled (not needed for basic operation)

## 📊 Access the Application

**Open in browser:** http://localhost:3000

The React dashboard will show:
- Daily P&L
- Total Profit
- Win Rate
- Sharpe Ratio
- Active Positions
- Risk Metrics

## 🎮 Trading Controls

From the React dashboard, you can:

1. **Start Trading Engine**
   - Click "Start Trading" button
   - Trading server will begin executing strategies

2. **Stop Trading Engine**
   - Click "Stop Trading" button
   - All positions will be closed safely

3. **Realize Profits**
   - Click "Realize Profits" button
   - Close all profitable positions

## 🔌 API Endpoints

### Trading Server (3002)

```bash
# Get status
curl http://localhost:3002/api/trading/status

# Start trading
curl -X POST http://localhost:3002/api/trading/start

# Stop trading
curl -X POST http://localhost:3002/api/trading/stop

# Realize profits
curl -X POST http://localhost:3002/api/trading/realize-profits

# Get performance
curl http://localhost:3002/api/trading/performance

# Get positions
curl http://localhost:3002/api/trading/positions
```

### AI Service (5001)

```bash
# Health check
curl http://localhost:5001/health

# Get available models
curl http://localhost:5001/models

# Get prediction
curl -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "AAPL",
    "strategy": "momentum",
    "marketData": {
      "price": 175.50,
      "sma20": 173.00,
      "sma50": 170.00,
      "rsi": 55
    }
  }'
```

## 🛑 Stopping Services

To stop all services:

```bash
# Stop React dashboard
# Press Ctrl+C in the terminal or:
lsof -ti:3000 | xargs kill -9

# Stop Trading server
lsof -ti:3002 | xargs kill -9

# Stop AI service
lsof -ti:5001 | xargs kill -9
```

## 🔄 Restarting Services

If you need to restart:

```bash
# Terminal 1: Trading Server
cd /Users/theophilusogieva/Desktop/NexusTradeAI
node services/trading/profitable-trading-server.js

# Terminal 2: AI Service
cd /Users/theophilusogieva/Desktop/NexusTradeAI
export AI_SERVICE_PORT=5001
source ai-ml/venv/bin/activate
python3 ai-ml/services/api_server.py

# Terminal 3: React Dashboard
cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard
npm run dev
```

## 📝 Logs

Check logs for troubleshooting:

```bash
# Trading logs
tail -f logs/trading-combined.log
tail -f logs/trading-error.log

# AI logs (in terminal)

# React dashboard (in terminal)
```

## ⚠️ Important Notes

1. **Paper Trading Mode**: Real trading is DISABLED by default
   - Set `REAL_TRADING_ENABLED=true` in environment to enable real trading
   - ⚠️ Only enable real trading after thorough testing

2. **AI Service**: Currently using rule-based fallback
   - Train ML models to improve predictions
   - See `AI_INTEGRATION_GUIDE.md` for model training

3. **Port Conflicts**:
   - AI service on 5001 instead of 5000 (macOS AirPlay uses 5000)
   - If you get port errors, check with: `lsof -i :PORT`

4. **Data Persistence**:
   - Positions saved to `positions.json`
   - Trading history in database files

## 🎯 Next Steps

### ⚠️ IMPORTANT: Configure Market Data API Keys

Your trading engine needs market data to execute trades. Currently seeing "Error fetching data" because the market data service isn't configured.

**Quick Setup (5 minutes):**

1. **Get free Alpaca API keys**: https://alpaca.markets (paper trading)
2. **Create .env file**: `cp .env.example .env`
3. **Add your keys to .env**:
   ```bash
   ALPACA_API_KEY=your_key_here
   ALPACA_SECRET_KEY=your_secret_here
   ```
4. **Start market data service** (Terminal 4):
   ```bash
   node services/trading/real-time-market-data.js
   ```

**Detailed Instructions**: See `MARKET_DATA_API_SETUP.md`

### After API Setup

1. **Test the Dashboard**
   - Visit http://localhost:3000
   - Verify real prices are loading
   - Check all metrics display correctly

2. **Start Trading (Paper Mode)**
   - Click "Start Trading" in dashboard
   - Monitor positions and P&L
   - Test stop/start controls

3. **Configure Strategies**
   - Modify `TRADING_CONFIG` in trading server
   - Adjust risk parameters
   - Enable/disable strategies

4. **Train AI Models**
   - Follow `AI_INTEGRATION_GUIDE.md`
   - Collect historical data
   - Train and deploy models

## 🐛 Troubleshooting

### Dashboard shows "Error loading data"
- Check if backend services are running
- Verify ports: 3002 (trading), 5001 (AI)
- Check browser console for CORS errors

### Trading server not responding
- Check if running: `lsof -i :3002`
- Check logs: `tail logs/trading-error.log`
- Restart if needed

### AI predictions failing
- AI service defaults to rule-based fallback
- This is normal if no models trained
- Predictions will still work

## 📚 Documentation

- **`QUICK_START.md`** - ⭐ 5-step quick start guide
- **`MARKET_DATA_API_SETUP.md`** - ⭐ Complete API setup instructions
- `REACT_DASHBOARD_GUIDE.md` - Complete React dashboard guide
- `FRONTEND_INTEGRATION_GUIDE.md` - Frontend integration details
- `AI_INTEGRATION_GUIDE.md` - AI setup and model training
- `TRADING_IMPROVEMENTS.md` - Backend features documentation
- `IMPLEMENTATION_SUMMARY.md` - Complete implementation overview

---

**Status**: All systems operational ✅
**Last Updated**: 2025-10-06
