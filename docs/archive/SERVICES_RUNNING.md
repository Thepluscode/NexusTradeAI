# 🚀 NexusTradeAI - All Services Running

**Status:** ✅ ALL SERVICES ACTIVE
**Started:** November 18, 2025 at 06:38 AM
**Total Services:** 8 services running

---

## 📊 Backend Services (6 Running)

### 1. 💹 Trading Server
- **Port:** 3002
- **PID:** 90837
- **Status:** ✅ Running
- **Purpose:** Core trading engine with profitable strategies
- **URL:** http://localhost:3002
- **Health Check:** http://localhost:3002/api/health

### 2. 📈 Market Data API
- **Port:** 3001
- **PID:** 90881
- **Status:** ✅ Running
- **Purpose:** Live market data feeds (Alpaca, Alpha Vantage, Finnhub)
- **URL:** http://localhost:3001
- **Test Endpoint:** http://localhost:3001/api/market/quote/SPY

### 3. 🔗 Broker API
- **Port:** 3003
- **PID:** 90955
- **Status:** ✅ Running
- **Purpose:** Broker connectivity and order management
- **URL:** http://localhost:3003

### 4. 🏦 Banking Service
- **Port:** 3012
- **PID:** 90956
- **Status:** ✅ Running
- **Purpose:** Banking integration with deposits/withdrawals
- **URL:** http://localhost:3012
- **Dashboard:** http://localhost:3012/banking-dashboard.html

### 5. 📊 Dashboard API
- **Port:** 8080
- **PID:** 90997
- **Status:** ✅ Running
- **Purpose:** Main dashboard backend with enterprise integration
- **URL:** http://localhost:8080
- **Main Dashboard:** http://localhost:8080/dashboard.html
- **Enterprise:** http://localhost:8080/enterprise

### 6. 🏛️ Institutional Performance API
- **Port:** 3011
- **PID:** 91046
- **Status:** ✅ Running
- **Purpose:** Real-time institutional-grade performance metrics
- **URL:** http://localhost:3011

---

## 🎨 Frontend Applications (2 Running)

### 7. 🤖 Bot Dashboard (React + Vite)
- **Port:** 3000
- **PID:** 91135
- **Status:** ✅ Running
- **Technology:** React 18 + Vite + TypeScript + Material-UI
- **URL:** http://localhost:3000
- **Features:**
  - Real-time trading monitoring
  - Performance charts (Recharts)
  - WebSocket live updates
  - Material-UI components
  - State management with Zustand

### 8. 🌐 Web App (React)
- **Port:** Running alongside Bot Dashboard
- **Status:** ✅ Running
- **Purpose:** Additional web interface

---

## 📋 Quick Access URLs

### Main Dashboards
- **Bot Dashboard:** http://localhost:3000
- **Main Dashboard:** http://localhost:8080/dashboard.html
- **Enterprise Dashboard:** http://localhost:8080/enterprise
- **Banking Dashboard:** http://localhost:3012/banking-dashboard.html

### API Endpoints
- **Trading Status:** http://localhost:3002/api/trading/status
- **Account Balance:** http://localhost:3002/api/trading/account/balance
- **Performance Analytics:** http://localhost:3002/api/trading/analytics
- **Market Quote (SPY):** http://localhost:3001/api/market/quote/SPY
- **Health Check:** http://localhost:3002/api/health

---

## 🛠️ Management Commands

### View Logs
```bash
# All logs
tail -f logs/*.log

# Trading server logs
tail -f services/trading/logs/*.log

# Bot Dashboard logs
tail -f clients/bot-dashboard/logs/*.log

# Real-time combined view
tail -f logs/*.log services/trading/logs/*.log
```

### Stop All Services
```bash
# Using the stop script
./STOP_ALL_SERVICES.sh

# Manual stop
kill $(cat /tmp/nexustradeai_pids.txt)
```

### Restart a Single Service
```bash
# Example: Restart trading server
pkill -f "profitable-trading-server.js"
cd services/trading && node profitable-trading-server.js &
```

### Check Service Status
```bash
# Check all listening ports
lsof -i -P | grep LISTEN | grep -E ":(3001|3002|3003|3011|3012|3000|8080)"

# Count running services
ps aux | grep -E "(node.*trading|node.*vite)" | grep -v grep | wc -l
```

---

## 📁 Service Architecture

```
NexusTradeAI/
├── services/
│   ├── trading/                    # Core Trading Engine (3002)
│   │   ├── profitable-trading-server.js
│   │   ├── profitable-strategies.js
│   │   └── winning-strategy.js
│   ├── api/                        # Market Data API (3001)
│   │   └── live-data-server.js
│   ├── broker-api/                 # Broker Integration (3003)
│   ├── banking/                    # Banking Service (3012)
│   │   └── banking-integration-service.js
│   └── dashboard/                  # Dashboard API (8080)
│       └── dashboard-api-server.js
└── clients/
    └── bot-dashboard/              # React Dashboard (3000)
        ├── src/
        ├── package.json
        └── vite.config.ts
```

---

## 🔍 Current System Status

### Trading Engine
- **Total Trades:** 1,079+
- **Win Rate:** 39%
- **Portfolio Value:** $7.16M
- **Active Strategies:** Trend Following, Mean Reversion
- **Risk Management:** Active with circuit breakers

### Market Coverage
- **Stocks:** AAPL, MSFT, GOOGL, TSLA, NVDA, etc.
- **ETFs:** SPY, QQQ, IWM, DIA, sector ETFs
- **Forex:** Major, cross, and exotic pairs
- **Crypto:** BTC, ETH, and major altcoins

### AI/ML Features
- **Ensemble Models:** Neural Networks, Random Forests, XGBoost
- **Sentiment Analysis:** Real-time news processing
- **Confidence Scoring:** 75-92% thresholds
- **Smart Predictions:** Technical analysis integration

---

## ⚙️ Configuration

### Environment Variables
Current configuration uses:
- **Trading Mode:** Paper/Demo trading
- **AI Enabled:** Configurable
- **Real Trading:** Disabled by default
- **Risk Per Trade:** 1-2%
- **Max Daily Loss:** $3,000-$10,000

### Ports in Use
| Port | Service | Protocol |
|------|---------|----------|
| 3000 | Bot Dashboard | HTTP |
| 3001 | Market Data API | HTTP |
| 3002 | Trading Server | HTTP |
| 3003 | Broker API | HTTP |
| 3011 | Performance API | HTTP |
| 3012 | Banking Service | HTTP |
| 8080 | Dashboard API | HTTP |

---

## 📊 Monitoring

### Real-Time Monitoring
The startup script includes live service monitoring. You can see:
- Service count updates every 10 seconds
- Process health status
- Automatic alerts if services crash

### Performance Metrics
Access real-time metrics at:
- http://localhost:3002/api/trading/status
- http://localhost:3011 (Institutional metrics)

---

## 🚨 Troubleshooting

### Service Won't Start
```bash
# Check if port is already in use
lsof -i :<PORT_NUMBER>

# Kill process using the port
kill -9 <PID>

# Restart the service
cd <service_directory>
node <service_file> &
```

### Bot Dashboard Not Loading
```bash
# Check Vite logs
tail -f clients/bot-dashboard/logs/Bot\ Dashboard.log

# Restart Vite dev server
cd clients/bot-dashboard
npm run dev
```

### Database Errors
```bash
# Check database files
ls -la services/trading/data/

# Create backup
curl -X POST http://localhost:3002/api/trading/database/backup
```

---

## 📝 Notes

- All services are running in development mode
- Logs are stored in respective `logs/` directories
- PIDs are tracked in `/tmp/nexustradeai_pids.txt`
- Services automatically restart on code changes (Vite HMR for frontend)
- Circuit breakers active for risk management
- Real trading is DISABLED by default for safety

---

## 🎯 Next Steps

1. **Access Bot Dashboard:** Open http://localhost:3000 in your browser
2. **Monitor Trading:** Check http://localhost:3002/api/trading/status
3. **View Performance:** Visit http://localhost:8080/dashboard.html
4. **Check Logs:** `tail -f logs/*.log` for real-time updates
5. **Start Trading:** POST to http://localhost:3002/api/trading/start

---

**Last Updated:** November 18, 2025 at 06:38 AM
**Documentation Version:** 1.0
**System Status:** ✅ Fully Operational
