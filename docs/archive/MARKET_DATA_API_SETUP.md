# Market Data API Configuration Guide

## Overview

Your NexusTradeAI platform is operational but needs market data API keys to execute trades. This guide shows you how to configure API keys for real market data.

---

## 📱 Your 5 Client Applications

Located in the `clients/` folder:

### 1. **bot-dashboard** ✅ (Currently Running)
- **Purpose**: Real-time trading dashboard (browser-based)
- **Tech**: React + TypeScript + Material-UI
- **URL**: http://localhost:3000
- **Status**: Running with real-time updates
- **Use Case**: Monitor trades, control trading engine

### 2. **web-app**
- **Purpose**: Full-featured Next.js web application
- **Tech**: Next.js 14 + TypeScript + Tailwind CSS
- **Features**: Advanced trading, charts, portfolio management
- **Port**: 3000 (when started)
- **Use Case**: Complete web trading platform

### 3. **desktop-app**
- **Purpose**: Native desktop application
- **Tech**: Electron + React
- **Features**: Offline trading, system notifications
- **Use Case**: Professional trading terminal

### 4. **mobile-app**
- **Purpose**: Mobile trading app
- **Tech**: React Native
- **Features**: Trading on the go
- **Use Case**: iOS/Android trading

### 5. **pro-terminal**
- **Purpose**: Advanced professional terminal
- **Tech**: React + Advanced charting
- **Features**: Multi-monitor support, advanced analytics
- **Use Case**: Day trading and scalping

**Currently only `bot-dashboard` is running.** The other 4 apps require additional setup.

---

## 🔑 Market Data API Providers

Your trading engine supports 3 providers (configured in `real-time-market-data.js`):

### Recommended: **Alpaca** (Best for beginners)
- ✅ Free tier available
- ✅ Paper trading built-in
- ✅ Real-time US stock data
- ✅ Easy setup
- 🔗 https://alpaca.markets

### Alternative 1: **Polygon.io**
- ✅ High-quality data
- ⚠️ Paid plans only
- ✅ Low latency
- 🔗 https://polygon.io

### Alternative 2: **Finnhub**
- ✅ Free tier available
- ⚠️ Rate limits on free tier
- ✅ Multiple asset classes
- 🔗 https://finnhub.io

---

## 📋 Step-by-Step Setup (Alpaca)

### Step 1: Get Alpaca API Keys

1. **Sign up** at https://alpaca.markets
2. Choose **"Paper Trading"** account (free, no risk)
3. Navigate to **"Paper Trading"** section
4. Click **"Generate API Key"**
5. Copy your keys:
   - `API Key ID` (e.g., PKX7RHT...)
   - `Secret Key` (e.g., abc123xyz...)

### Step 2: Create .env File

Create a `.env` file in the project root:

```bash
# Navigate to project root
cd /Users/theophilusogieva/Desktop/NexusTradeAI

# Create .env file from example
cp .env.example .env
```

### Step 3: Add API Keys to .env

Open `.env` and add your keys:

```bash
# Market Data API Keys
ALPACA_API_KEY=your_alpaca_api_key_here
ALPACA_SECRET_KEY=your_alpaca_secret_key_here

# Optional: Additional providers
POLYGON_API_KEY=your_polygon_key_here
FINNHUB_API_KEY=your_finnhub_key_here

# Trading Configuration
TRADING_SYMBOLS=AAPL,GOOGL,MSFT,TSLA,NVDA
RISK_PER_TRADE=0.02
MAX_DAILY_LOSS=-25000
MAX_POSITION_SIZE=50000
ENABLED_STRATEGIES=trendFollowing,meanReversion,volatilityBreakout,aiSignals
AI_ENABLED=false
REAL_TRADING_ENABLED=false  # Keep false for paper trading

# Service Ports
TRADING_PORT=3002
MARKET_DATA_PORT=3001
RISK_MANAGER_PORT=3004
AI_SERVICE_PORT=5001
```

### Step 4: Start Market Data Service

The market data service (`real-time-market-data.js`) needs to run on port 3001:

```bash
# Terminal 1: Start Market Data Service
cd /Users/theophilusogieva/Desktop/NexusTradeAI
node services/trading/real-time-market-data.js
```

This service will:
- Connect to Alpaca WebSocket API
- Fetch real-time quotes for AAPL, GOOGL, MSFT, TSLA, NVDA
- Serve data at `http://localhost:3001/api/market/quote/{symbol}`

### Step 5: Restart Trading Server

The trading server will now fetch real market data:

```bash
# Stop current trading server (Ctrl+C in terminal)
# Then restart:
cd /Users/theophilusogieva/Desktop/NexusTradeAI
node services/trading/profitable-trading-server.js
```

---

## 🎯 Complete Service Startup

To run the full platform with market data:

```bash
# Terminal 1: Market Data Service (PORT 3001) - NEW!
cd /Users/theophilusogieva/Desktop/NexusTradeAI
node services/trading/real-time-market-data.js

# Terminal 2: Trading Server (PORT 3002)
cd /Users/theophilusogieva/Desktop/NexusTradeAI
node services/trading/profitable-trading-server.js

# Terminal 3: AI Service (PORT 5001)
cd /Users/theophilusogieva/Desktop/NexusTradeAI
export AI_SERVICE_PORT=5001
source ai-ml/venv/bin/activate
python3 ai-ml/services/api_server.py

# Terminal 4: React Dashboard (PORT 3000)
cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard
npm run dev
```

---

## 🔍 Verify Setup

### 1. Check Market Data Service

```bash
curl http://localhost:3001/api/market/quote/AAPL
```

Expected response:
```json
{
  "symbol": "AAPL",
  "price": 175.50,
  "bid": 175.49,
  "ask": 175.51,
  "volume": 45678900,
  "timestamp": "2025-10-06T19:30:00Z"
}
```

### 2. Check Trading Engine Status

```bash
curl http://localhost:3002/api/trading/status
```

Should show `isRunning: true` and real market data.

### 3. Check Dashboard

Visit http://localhost:3000 and verify:
- ✅ Timestamp updating every 5 seconds
- ✅ No "Error fetching data" messages
- ✅ Real prices showing in positions table

---

## 📊 Current vs. With Market Data

### Before (Current State)
```
Trading Server: ✅ Running
Market Data: ❌ Missing API keys
Result: "Error fetching data for AAPL/GOOGL/MSFT/TSLA/NVDA"
Trades: 0 (waiting for data)
```

### After (With API Keys)
```
Trading Server: ✅ Running
Market Data: ✅ Real-time data from Alpaca
Result: Real prices streaming every second
Trades: Executing when signals detected
```

---

## ⚠️ Important Notes

### 1. **Paper Trading vs. Real Trading**

Your `.env` should have:
```bash
REAL_TRADING_ENABLED=false  # Paper trading (safe)
```

**DO NOT** set to `true` until you've:
- Tested thoroughly in paper mode
- Verified all strategies work correctly
- Set appropriate risk limits
- Funded a live trading account

### 2. **API Rate Limits**

Free tiers have limits:
- **Alpaca Free**: 200 requests/minute
- **Finnhub Free**: 60 requests/minute
- **Polygon**: Paid only

Your trading engine polls every 5 seconds (12 requests/minute per symbol), which is well within limits.

### 3. **Market Hours**

US stock market hours (Eastern Time):
- **Pre-market**: 4:00 AM - 9:30 AM
- **Regular**: 9:30 AM - 4:00 PM
- **After-hours**: 4:00 PM - 8:00 PM

If testing outside market hours, Alpaca will return last closing prices.

### 4. **WebSocket vs. REST**

The market data service uses:
- **WebSocket**: Real-time streaming (live trading)
- **REST API**: Polling (development/testing)

Both work with the same API keys.

---

## 🔧 Troubleshooting

### "Unauthorized" Error
**Problem**: Invalid API keys

**Solution**:
1. Verify keys are correct (copy-paste from Alpaca)
2. Check no extra spaces in `.env` file
3. Restart market data service after changing `.env`

### "Market Not Open" Error
**Problem**: Trying to trade outside market hours

**Solution**:
- Use Alpaca's extended hours mode
- Or test during market hours (9:30 AM - 4:00 PM ET)

### "Rate Limit Exceeded"
**Problem**: Too many API requests

**Solution**:
- Increase polling interval in `profitable-strategies.js`
- Upgrade to paid API plan
- Reduce number of symbols being tracked

### Port 3001 Already in Use
**Problem**: Another service using port 3001

**Solution**:
```bash
# Find and kill process
lsof -ti:3001 | xargs kill -9

# Or change port in .env
MARKET_DATA_PORT=3005
```

---

## 🚀 Next Steps

1. **Get Alpaca API keys** (5 minutes)
2. **Create .env file** with your keys
3. **Start market data service** (Terminal 1)
4. **Restart trading server** (Terminal 2)
5. **Monitor dashboard** (http://localhost:3000)
6. **Watch for trades** in paper mode

Once trades are executing successfully:
- Monitor performance for 1-2 weeks
- Adjust strategy parameters if needed
- Consider enabling AI predictions
- Explore other client apps (web-app, pro-terminal)

---

## 📚 Additional Resources

### Alpaca Documentation
- API Docs: https://docs.alpaca.markets
- Paper Trading: https://docs.alpaca.markets/docs/paper-trading
- WebSocket Streaming: https://docs.alpaca.markets/docs/streaming

### Your Project Docs
- `RUNNING_SERVICES.md` - Current running services
- `REACT_DASHBOARD_GUIDE.md` - Dashboard features
- `AI_INTEGRATION_GUIDE.md` - AI setup
- `TRADING_IMPROVEMENTS.md` - Backend features

---

**Status**: Configuration guide complete ✅
**Last Updated**: 2025-10-06

**Need help?** Check the troubleshooting section above or review your backend logs:
```bash
tail -f logs/trading-combined.log
tail -f logs/market-data.log
```
