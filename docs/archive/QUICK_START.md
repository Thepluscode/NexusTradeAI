# NexusTradeAI - Quick Start Guide

## 🚀 Get Trading in 5 Steps

### Step 1: Get Alpaca API Keys (5 min)
```
1. Visit https://alpaca.markets
2. Sign up (free)
3. Choose "Paper Trading" account
4. Generate API Key
5. Copy API Key ID and Secret Key
```

### Step 2: Configure Environment (1 min)
```bash
# Create .env file
cd /Users/theophilusogieva/Desktop/NexusTradeAI
cp .env.example .env

# Edit .env and add your keys:
ALPACA_API_KEY=your_key_here
ALPACA_SECRET_KEY=your_secret_here
```

### Step 3: Start Services (4 terminals)

**Terminal 1: Market Data**
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI
node services/trading/real-time-market-data.js
```

**Terminal 2: Trading Engine**
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI
node services/trading/profitable-trading-server.js
```

**Terminal 3: AI Service**
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI
export AI_SERVICE_PORT=5001
source ai-ml/venv/bin/activate
python3 ai-ml/services/api_server.py
```

**Terminal 4: Dashboard**
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard
npm run dev
```

### Step 4: Open Dashboard
```
http://localhost:3000
```

### Step 5: Start Trading
```
Click "Start Trading" button in dashboard
```

---

## ✅ Current Status

| Service | Status | Port | URL |
|---------|--------|------|-----|
| React Dashboard | ✅ Running | 3000 | http://localhost:3000 |
| Trading Server | ✅ Running | 3002 | http://localhost:3002 |
| AI Service | ✅ Running | 5001 | http://localhost:5001 |
| Market Data | ⚠️ Needs API keys | 3001 | http://localhost:3001 |

**What's Working:**
- ✅ Real-time dashboard updates (every 5 seconds)
- ✅ Trading controls (start/stop/realize profits)
- ✅ AI predictions service
- ✅ Performance tracking

**What's Missing:**
- ⚠️ Market data API keys (no real prices = no trades)
- ⚠️ Market data service not started

---

## 📱 Your 5 Client Apps

1. **bot-dashboard** ✅ - Running on http://localhost:3000
2. **web-app** - Full Next.js platform (requires setup)
3. **desktop-app** - Electron desktop app (requires setup)
4. **mobile-app** - React Native mobile (requires setup)
5. **pro-terminal** - Advanced trading terminal (requires setup)

---

## 🔍 Quick Checks

### Verify Market Data Service
```bash
curl http://localhost:3001/api/market/quote/AAPL
```

### Verify Trading Engine
```bash
curl http://localhost:3002/api/trading/status
```

### Check Which Services Are Running
```bash
lsof -i :3000  # Dashboard
lsof -i :3001  # Market Data
lsof -i :3002  # Trading
lsof -i :5001  # AI Service
```

---

## ⚠️ Important Safety Notes

### Paper Trading (Safe)
```bash
REAL_TRADING_ENABLED=false  # ✅ Keep this in .env
```

### Live Trading (Use with caution)
```bash
REAL_TRADING_ENABLED=true   # ⚠️ Only after thorough testing
```

**DO NOT enable live trading until:**
1. You've tested in paper mode for at least 2 weeks
2. All strategies perform as expected
3. Risk limits are properly configured
4. You have a funded live trading account

---

## 🐛 Quick Troubleshooting

### Dashboard shows "Error loading data"
```bash
# Check if backend services are running
lsof -i :3002  # Should show node process
lsof -i :3001  # Should show node process (market data)

# Restart services if needed
```

### "Error fetching data for AAPL"
```
Problem: Market data service not running or no API keys
Solution: See MARKET_DATA_API_SETUP.md
```

### Port already in use
```bash
# Kill process on port
lsof -ti:3000 | xargs kill -9
```

---

## 📚 Detailed Guides

- **API Setup**: `MARKET_DATA_API_SETUP.md` - Complete API configuration
- **Services**: `RUNNING_SERVICES.md` - All running services
- **Dashboard**: `REACT_DASHBOARD_GUIDE.md` - Dashboard features
- **AI Setup**: `AI_INTEGRATION_GUIDE.md` - AI configuration

---

## 🎯 What Happens After Setup

Once you add API keys and start the market data service:

1. **Market data streams** - Real prices for AAPL, GOOGL, MSFT, TSLA, NVDA
2. **Strategies activate** - Trend following, mean reversion, volatility breakout
3. **Trades execute** - When signals detected (paper trading mode)
4. **Dashboard updates** - See positions, P&L, performance metrics
5. **AI analyzes** - Get trading signals and predictions

---

## 📞 Need Help?

1. Check `MARKET_DATA_API_SETUP.md` for detailed instructions
2. Review logs: `tail -f logs/trading-combined.log`
3. Verify .env configuration
4. Ensure all services are running

---

**Status**: Platform ready, waiting for API keys ✅
**Last Updated**: 2025-10-06
