# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Version:** 3.0
**Last Updated:** December 22, 2025

---

## Project Overview

NexusTradeAI is an AI-powered automated trading platform with two main operational modes:

**Active Development Stack:**
- **Unified Trading Bot** (Node.js/Express backend on port 3001)
- **Real-time Dashboard** (React 18 + TypeScript + Vite frontend on port 3000)
- **Alpaca Markets Integration** (paper trading broker API)
- **Advanced Risk Management** with anti-churning protections

**Legacy Services Stack:**
- Multiple trading servers (ports 3002, 3011, 3001, 3003, 3012, 8080)
- Institutional Performance API, Market Data API, Broker API, Banking Service
- See README.md for full service listing

**Forex Trading Bot (NEW):**
- **Unified Forex Bot** (Node.js/Express on port 3005)
- **OANDA Integration** (practice/live trading API)
- **12 Forex Pairs** (majors + crosses)
- **24/5 Trading** (Sunday 5 PM - Friday 5 PM EST)
- **Session-Optimized** (London/NY overlap priority)
- Location: `clients/bot-dashboard/unified-forex-bot.js`

**Current Status:** Active development, paper trading only (no real money)

---

## Architecture at a Glance

### High-Level System Design

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                          │
│  React 18 + TypeScript + Vite + MUI (Port 3000)            │
│  Location: clients/bot-dashboard/src/                      │
│  - Dashboard.tsx (main trading dashboard)                   │
│  - api.ts (API client for backend communication)            │
│  - Components: PositionsTable, PerformanceChart, etc.       │
└─────────────────────────────────────────────────────────────┘
                            ↓ HTTP/REST
┌─────────────────────────────────────────────────────────────┐
│                     Backend Layer                           │
│  Node.js + Express API Server (Port 3001)                  │
│  Location: clients/bot-dashboard/unified-trading-bot.js    │
│  - Trading engine with 60-second scan loop                  │
│  - Anti-churning protection (15 trades/day limit)           │
│  - Progressive trailing stops (4 levels: 5%, 10%, 15%, 18%)│
│  - RESTful API endpoints for frontend                       │
└─────────────────────────────────────────────────────────────┘
                            ↓ REST API
┌─────────────────────────────────────────────────────────────┐
│                  External Services                          │
│  Alpaca Markets Paper Trading API                          │
│  - Account management                                        │
│  - Order execution                                           │
│  - Position tracking                                         │
│  - Market data (real-time quotes)                           │
└─────────────────────────────────────────────────────────────┘
```

### Key Files and Their Roles

**Backend (Trading Bot Engine):**
- `clients/bot-dashboard/unified-trading-bot.js` - Main trading bot server
  - Lines 37-47: Anti-churning protection variables
  - Lines 49-100: `canTrade()` validation function
  - Lines 276-305: Progressive trailing stops logic
  - Lines 290-306: Trade tracking in `executeTrade()`
  - Lines 333-337: Stop-out tracking in `closePosition()`
  - Line 509: Fixed display bug (totalTrades reporting)

**Frontend (Dashboard):**
- `clients/bot-dashboard/src/App.tsx` - Root component with theme and query setup
- `clients/bot-dashboard/src/pages/Dashboard.tsx` - Main trading dashboard
- `clients/bot-dashboard/src/services/api.ts` - API client for backend communication
- `clients/bot-dashboard/src/components/` - Reusable UI components
- `clients/bot-dashboard/src/hooks/` - Custom React hooks for data fetching

**Configuration:**
- `.env` - Environment variables (ALPACA_API_KEY, ALPACA_SECRET_KEY, etc.)
- `.env.example` - Template for required environment variables
- `clients/bot-dashboard/package.json` - Frontend dependencies and scripts
- `services/trading/data/config.json` - Trading strategy parameters

**Documentation (Comprehensive):**
- `QUICK_START_GUIDE.md` - 5-minute setup guide
- `BOT_FEATURES_COMPLETE.md` - Complete feature reference (39 KB)
- `API_REFERENCE.md` - API endpoint documentation (19 KB)
- `ANTI_CHURNING_IMPLEMENTED.md` - Safety system details (11 KB)
- `DOCUMENTATION_INDEX.md` - Master documentation navigator
- `BOT_PERFORMANCE_REPORT.md` - Performance investigation report
- `LOSS_DIAGNOSIS.md` - SMX churning bug analysis
- `README.md` - Project overview and service status

---

## Common Commands

### Working Directory
All paths assume working directory: `/Users/theophilusogieva/Desktop/NexusTradeAI`

### Development Workflow

**Start the Trading Bot Backend:**
```bash
cd clients/bot-dashboard
node unified-trading-bot.js > logs/unified-bot-protected.log 2>&1 &
```

**Start the Dashboard Frontend:**
```bash
cd clients/bot-dashboard
npm run dev
# Opens on http://localhost:3000
```

**Stop Services:**
```bash
# Stop Trading Bot (port 3001)
lsof -ti :3001 | xargs kill -9

# Stop Dashboard (port 3000)
lsof -ti :3000 | xargs kill -9
```

### Monitoring & Debugging

**View Bot Logs (Real-time):**
```bash
tail -f clients/bot-dashboard/logs/unified-bot-protected.log
```

**Check Bot Health:**
```bash
curl http://localhost:3001/health
```

**Get Trading Status (Full):**
```bash
curl -s http://localhost:3001/api/trading/status | python3 -m json.tool
```

**Get Account Summary:**
```bash
curl -s http://localhost:3001/api/accounts/summary | python3 -m json.tool
```

### Build & Test Commands

**Root Level:**
```bash
npm test              # Run all tests
npm run lint          # Lint all code
npm run format        # Format code with Prettier
npm run test:coverage # Run tests with coverage
```

**Frontend (clients/bot-dashboard):**
```bash
cd clients/bot-dashboard
npm install           # Install dependencies
npm run dev           # Start dev server
npm run build         # Build for production
npm run preview       # Preview production build
npm run lint          # Lint frontend code
```

---

## Critical Architectural Concepts

### 1. Anti-Churning Protection System

**Why This Exists:**
On December 5, 2025, a bug caused the bot to execute 20 trades in 2 hours on the same symbol (SMX), resulting in ~$200-300 loss. This protection prevents that from happening again.

**How It Works:**
- **Trade Tracking**: Every trade is recorded with symbol, timestamp, and direction
- **Daily Limit**: Max 15 trades per day across all symbols
- **Symbol Limit**: Max 3 trades per symbol per day
- **Time Cooldowns**:
  - 10 minutes between trades on same symbol
  - 60 minutes after hitting stop loss
- **Direction Flip Detection**: Prevents rapid buy-sell-buy loops
- **Trade History**: Last 100 trades stored in memory

**Implementation Location:**
- Variables: Lines 37-47 in unified-trading-bot.js
- Validation: `canTrade()` function (lines 49-100)
- Trade recording: `executeTrade()` function (lines 290-306)
- Stop-out tracking: `closePosition()` function (lines 333-337)

**Testing:**
Use `totalTradesToday` variable to check actual trade count (line 509 in status endpoint)

### 2. Multi-Tier Momentum Strategy

**Purpose:** Capture different momentum levels with appropriate risk-reward ratios.

**3-Tier Configuration (in `MOMENTUM_CONFIG`):**

**Tier 1 - Primary Strategy:**
- Momentum threshold: 2.5% intraday move
- Stop loss: 4%
- Profit target: 8% (2:1 R:R)
- Position size: 0.5% of equity
- Max positions: 6
- Trailing stop: Activates at +4%, trails by 2%

**Tier 2 - Secondary Strategy:**
- Momentum threshold: 5% intraday move
- Stop loss: 5%
- Profit target: 10% (2:1 R:R)
- Position size: 0.75% of equity
- Max positions: 3
- Trailing stop: Activates at +5%, trails by 2.5%

**Tier 3 - Extreme Momentum:**
- Momentum threshold: 10%+ intraday move
- Stop loss: 6%
- Profit target: 15% (2.5:1 R:R)
- Position size: 1% of equity
- Max positions: 2
- Trailing stop: Activates at +8%, trails by 4%

**Implementation:**
- Configured in `MOMENTUM_CONFIG` object (~lines 45-100)
- Executed every 60-second loop iteration
- Only raises stops, never lowers them
- Volume and RSI filters prevent false signals

### 3. Momentum Scanner

**Scanning Strategy:**
- Scans 135 pre-selected stocks every 60 seconds
- Looks for 10%+ price moves in last 24 hours
- Checks volume, trend, support/resistance levels
- Only trades during market hours (9:30 AM - 4:00 PM EST)

**Symbol Universe:**
Located in `clients/bot-dashboard/unified-trading-bot.js` around line 100-130

**Entry Conditions:**
- Momentum > 10% (price change)
- Volume > 1M shares
- Above key support levels
- Uptrend confirmed

**Exit Conditions:**
- Hit 20% profit target
- Hit 7% stop loss
- Trailing stop triggered
- End of day (close all positions)

### 4. API Architecture

**Frontend ↔ Backend Communication:**

The frontend (React app on port 3000) communicates with the backend (Node.js API on port 3001) via REST API:

```typescript
// Frontend API Client (clients/bot-dashboard/src/services/api.ts)
class APIClient {
  private tradingEngine: AxiosInstance;  // http://localhost:3001/api/trading
  private marketData: AxiosInstance;     // http://localhost:3001/api/market

  async getTradingEngineStatus(): Promise<TradingEngineStatus>
  async getAccountSummary(): Promise<AccountSummary>
  async getMarketStatus(): Promise<MarketDataStatus>
}
```

**Backend API Endpoints (Port 3001):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check (returns `{status: "ok"}`) |
| `/api/trading/status` | GET | Positions, P/L, performance metrics |
| `/api/accounts/summary` | GET | Account balance, equity, buying power |
| `/api/market/status` | GET | Market data connection status |

**Data Flow Example:**
1. Dashboard.tsx component mounts
2. Uses `useTradingEngine` hook to fetch data
3. Hook calls `apiClient.getTradingEngineStatus()`
4. API client makes HTTP GET to `localhost:3001/api/trading/status`
5. Backend fetches live data from Alpaca API
6. Backend returns formatted JSON response
7. Frontend updates UI with new data

### 5. Data Storage Architecture

**Trading Data Files (`services/trading/data/`):**

- `config.json` - Strategy parameters (stop loss, profit targets, position sizes)
- `trades.json` - Historical trade records
- `positions.json` - Current open positions
- `profits.json` - P&L tracking
- `performance.json` - Performance metrics (win rate, profit factor, etc.)
- `accounts.json` - Account snapshots

**Important Notes:**
- Data files are JSON-based (no database required)
- Bot reads/writes to these files for persistence
- Files are tracked in git (except sensitive data)
- Backup before major changes: `cp services/trading/data/*.json backups/`

### 6. Environment Variables

**Critical Variables (.env file):**
```bash
# Alpaca API Credentials (Paper Trading)
ALPACA_API_KEY=your_key_here
ALPACA_SECRET_KEY=your_secret_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets

# Additional Data Providers (Optional)
POLYGON_API_KEY=your_polygon_key
FINNHUB_API_KEY=your_finnhub_key
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key

# Server Configuration
PORT=3001
NODE_ENV=development

# Trading Settings
REAL_TRADING_ENABLED=false  # MUST be false for paper trading
RISK_PER_TRADE=0.01
MAX_DAILY_LOSS=-1000
MAX_POSITION_SIZE=2000
```

**Security Note:**
- `.env` is in `.gitignore` (never commit API keys)
- Use `.env.example` as template
- Paper trading only (no real money at risk)

---

## Important Behavioral Patterns

### Bot Operation Loop

**Every 60 Seconds:**
1. Fetch current positions from Alpaca
2. Update trailing stops for profitable positions
3. Check for stop loss hits
4. Scan 135 symbols for momentum signals
5. Validate trade opportunities with `canTrade()`
6. Execute trades if conditions met (max 15/day)
7. Log all activity to `logs/unified-bot-protected.log`

**Logging Pattern:**
```
[TIMESTAMP] [SCAN] Scanning 135 symbols for momentum...
[TIMESTAMP] [POSITION] LOW: +5.57% (Entry: $233.44, Current: $246.45)
[TIMESTAMP] [TRAILING] Raised stop on LOW from $226.43 to $237.20
[TIMESTAMP] [VALIDATION] Cannot trade AAPL: Already traded 3 times today
[TIMESTAMP] [TRADE] Executed BUY 10 TSLA @ $250.00
```

### Dashboard Update Cycle

**React Query Configuration:**
- Refetch interval: 10 seconds
- Refetch on window focus: false
- Retry: 1 attempt
- Timeout: 10 seconds

**Components That Auto-Update:**
- Account balance (realAccount.balance)
- Active positions table
- Performance metrics (totalTrades, winRate, profitFactor)
- Market data status

### Error Handling

**Backend:**
- All API endpoints wrapped in try-catch
- Errors logged to console and log file
- Returns JSON error responses with status codes

**Frontend:**
- React Query handles API errors automatically
- Toast notifications for user feedback
- Graceful fallbacks (shows "Offline" if API unreachable)

---

## Known Issues and Fixes

### Historical Issues (Fixed)

**Issue 1: SMX Churning Bug (Dec 5-6, 2025)**
- Problem: Bot executed 20 trades in 2 hours on SMX, losing ~$200-300
- Root Cause: Multiple bot instances running simultaneously
- Fix: Implemented anti-churning protection system (see section above)
- Status: ✅ Fixed - Anti-churning now prevents over-trading

**Issue 2: Display Bug - Wrong Trade Count (Dec 8, 2025)**
- Problem: API reported `scanCount` instead of actual trades
- Root Cause: Wrong variable in status endpoint (~line 509 in unified-trading-bot.js)
- Fix: Changed to use `totalTradesToday` variable
- Status: ✅ Fixed

**Issue 3: Dashboard Blank Page**
- Problem: "Cannot read properties of undefined (reading 'balance')" error
- Root Cause: API response structure mismatch
- Fix: Updated API to return nested `realAccount` and `demoAccount` objects
- Status: ✅ Fixed

---

## Testing and Verification

### Verify Bot is Running Correctly

**1. Check Process:**
```bash
lsof -i :3001
# Should show node process running on port 3001
```

**2. Check Logs:**
```bash
tail -20 ~/Desktop/NexusTradeAI/clients/bot-dashboard/logs/unified-bot-protected.log
# Should show regular 60-second scan cycles
```

**3. Check Health Endpoint:**
```bash
curl http://localhost:3001/health
# Should return: {"status":"ok","timestamp":"..."}
```

**4. Verify Anti-Churning:**
```bash
curl -s http://localhost:3001/api/trading/status | grep totalTrades
# Should show reasonable number (0-15 per day)
```

**5. Check Dashboard:**
- Open http://localhost:3000
- Should show account balance, positions, performance metrics
- No console errors in browser DevTools

### Performance Expectations

**Healthy Bot Indicators:**
- ✅ 0-15 trades per day (anti-churning limit)
- ✅ No rapid buy-sell loops on same symbol
- ✅ Trailing stops raising correctly as positions profit
- ✅ Stop losses being honored (max 7% loss per position)
- ✅ Only trading during market hours (9:30 AM - 4:00 PM EST)
- ✅ Logs show regular 60-second scan cycles
- ✅ No duplicate bot processes (check with `lsof -i :3001`)

**Warning Signs:**
- ⚠️ More than 15 trades in a day
- ⚠️ Multiple trades on same symbol within 10 minutes
- ⚠️ Trading while market is closed
- ⚠️ Positions not respecting stop losses
- ⚠️ Bot crashes or restarts frequently
- ⚠️ Multiple node processes on port 3001
- ⚠️ Abnormally high trade frequency (check `totalTradesToday` metric)

---

## Project Structure Deep Dive

```
NexusTradeAI/
├── clients/
│   ├── bot-dashboard/          # Main trading bot + dashboard
│   │   ├── src/                # React frontend source
│   │   │   ├── App.tsx         # Root component
│   │   │   ├── main.tsx        # Entry point
│   │   │   ├── pages/
│   │   │   │   └── Dashboard.tsx  # Main dashboard
│   │   │   ├── components/     # UI components
│   │   │   │   ├── PositionsTable.tsx
│   │   │   │   ├── PerformanceChart.tsx
│   │   │   │   ├── MetricCard.tsx
│   │   │   │   └── ...
│   │   │   ├── services/
│   │   │   │   └── api.ts      # API client
│   │   │   ├── hooks/          # Custom React hooks
│   │   │   └── types/          # TypeScript definitions
│   │   ├── unified-trading-bot.js  # Backend API server ⭐
│   │   ├── logs/               # Bot execution logs
│   │   ├── package.json        # Frontend dependencies
│   │   ├── vite.config.ts      # Vite configuration
│   │   └── tsconfig.json       # TypeScript config
│   ├── mobile-app/             # Mobile app (future)
│   └── web-app/                # Web app (alternative UI)
├── services/
│   ├── trading/                # Trading-related services
│   │   ├── data/               # Trading data storage
│   │   │   ├── config.json     # Strategy parameters
│   │   │   ├── trades.json     # Trade history
│   │   │   ├── positions.json  # Current positions
│   │   │   ├── profits.json    # P/L tracking
│   │   │   └── performance.json # Performance metrics
│   │   ├── profitable-trading-server.js
│   │   ├── crypto-trading-server.js
│   │   └── ...
│   ├── api/                    # API services
│   ├── ai-service/             # AI/ML services
│   └── risk-management-service/ # Risk management
├── ai-ml/                      # AI/ML models and training
├── .env                        # Environment variables (gitignored) ⭐
├── .env.example                # Environment template ⭐
├── QUICK_START_GUIDE.md        # Setup guide ⭐
├── BOT_FEATURES_COMPLETE.md    # Complete feature docs ⭐
├── API_REFERENCE.md            # API documentation ⭐
├── ANTI_CHURNING_IMPLEMENTED.md # Safety system docs ⭐
├── DOCUMENTATION_INDEX.md      # Docs navigator ⭐
├── BOT_PERFORMANCE_REPORT.md   # Performance investigation
├── LOSS_DIAGNOSIS.md           # Churning bug analysis
└── README.md                   # Project overview
```

**⭐ = Critical files to understand**

---

## Development Workflow

### Making Changes to the Bot

**1. Stop the bot:**
```bash
lsof -ti :3001 | xargs kill -9
```

**2. Edit unified-trading-bot.js:**
```bash
# Make your changes
# Be careful with anti-churning protection code
```

**3. Test your changes:**
```bash
# Start bot and watch logs
node unified-trading-bot.js
```

**4. Verify in logs:**
```bash
tail -f logs/unified-bot-protected.log
```

**5. Test API endpoints:**
```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/trading/status
```

**6. Run in background:**
```bash
node unified-trading-bot.js > logs/unified-bot-protected.log 2>&1 &
```

### Making Changes to the Dashboard

**1. Edit files in src/:**
```bash
cd clients/bot-dashboard
# Edit src/pages/Dashboard.tsx or other components
```

**2. Vite hot-reloads automatically:**
- Changes appear immediately in browser
- No need to restart dev server

**3. Check browser console:**
- Look for any React errors
- Verify API calls working

**4. Build for production:**
```bash
npm run build
npm run preview  # Test production build
```

---

## Common Tasks

### Add a New Stock to Momentum Scanner

**Location:** `clients/bot-dashboard/unified-trading-bot.js`

**Find the symbol array:**
```javascript
const MOMENTUM_SYMBOLS = [
  'AAPL', 'TSLA', 'NVDA', // ... add your symbol here
];
```

**Add the new symbol and restart bot**

### Adjust Trading Parameters

**Location:** `services/trading/data/config.json`

```json
{
  "stopLoss": 0.07,         // 7% stop loss
  "profitTarget": 0.20,     // 20% profit target
  "momentumThreshold": 0.10, // 10% momentum required
  "maxPositions": 5,        // Max concurrent positions
  "positionSize": 2000      // $ amount per position
}
```

**Restart bot after changes**

### Change Anti-Churning Limits

**Location:** `clients/bot-dashboard/unified-trading-bot.js`

**Find these constants (around line 40):**
```javascript
const MAX_TRADES_PER_DAY = 15;      // Change daily limit
const MAX_TRADES_PER_SYMBOL = 3;    // Change per-symbol limit
const MIN_TIME_BETWEEN_TRADES = 10; // Minutes between trades
```

**⚠️ WARNING:** Increasing these limits can lead to over-trading and losses

### Add a New API Endpoint

**Backend (unified-trading-bot.js):**
```javascript
app.get('/api/your-endpoint', async (req, res) => {
  try {
    const data = await yourFunction();
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Frontend (src/services/api.ts):**
```typescript
async getYourData(): Promise<YourDataType> {
  const response = await this.tradingEngine.get<APIResponse<YourDataType>>('/your-endpoint');
  return response.data.data;
}
```

**Use in component:**
```typescript
const { data, isLoading, error } = useQuery('yourData', () => apiClient.getYourData());
```

---

## Troubleshooting Guide

### Bot Not Trading

**Check these in order:**

1. **Is it market hours?**
   ```bash
   # Bot only trades 9:30 AM - 4:00 PM EST
   date
   ```

2. **Has daily limit been hit?**
   ```bash
   curl -s http://localhost:3001/api/trading/status | grep totalTrades
   # Should be < 15
   ```

3. **Are there momentum signals?**
   ```bash
   tail -f logs/unified-bot-protected.log | grep SIGNAL
   # Should see momentum signals if conditions met
   ```

4. **Check logs for errors:**
   ```bash
   tail -50 logs/unified-bot-protected.log | grep ERROR
   ```

### Dashboard Not Loading

1. **Is frontend server running?**
   ```bash
   lsof -i :3000
   ```

2. **Is backend API running?**
   ```bash
   lsof -i :3001
   curl http://localhost:3001/health
   ```

3. **Check browser console:**
   - Open DevTools (F12)
   - Look for network errors or React errors

4. **Check CORS:**
   - Backend should allow localhost:3000
   - Check unified-trading-bot.js CORS configuration

### Positions Not Updating

1. **Check Alpaca connection:**
   ```bash
   curl -s http://localhost:3001/api/trading/status | grep connected
   ```

2. **Verify API keys:**
   ```bash
   cat .env | grep ALPACA
   # Should show valid keys
   ```

3. **Check position data:**
   ```bash
   cat services/trading/data/positions.json
   ```

### High Trade Count

1. **Check actual trades today:**
   ```bash
   curl -s http://localhost:3001/api/trading/status | grep totalTrades
   ```

2. **Verify in Alpaca dashboard:**
   - Login to https://app.alpaca.markets/paper/dashboard/
   - Check order history

3. **Review anti-churning logs:**
   ```bash
   grep "VALIDATION" logs/unified-bot-protected.log | tail -20
   ```

---

## Safety Reminders

### NEVER Do These Things

1. ❌ **Change `.env` to use real trading API keys**
   - Bot is paper trading only
   - Not ready for real money

2. ❌ **Disable anti-churning protection**
   - This prevents over-trading losses
   - Lost ~$300 when it was disabled

3. ❌ **Run multiple bot instances simultaneously**
   - Causes conflicting trades
   - Root cause of SMX churning bug

4. ❌ **Commit `.env` file to git**
   - Contains API keys
   - Already in `.gitignore`

5. ❌ **Increase position sizes without testing**
   - Currently $2,000 per position
   - Larger sizes = larger losses

### ALWAYS Do These Things

1. ✅ **Monitor logs regularly**
   ```bash
   tail -f logs/unified-bot-protected.log
   ```

2. ✅ **Check Alpaca dashboard daily**
   - Verify trades make sense
   - https://app.alpaca.markets/paper/dashboard/

3. ✅ **Review performance weekly**
   ```bash
   cat services/trading/data/performance.json
   ```

4. ✅ **Backup important data**
   ```bash
   cp services/trading/data/*.json backups/
   ```

5. ✅ **Test changes in paper trading first**
   - Never rush to live trading
   - Need 2-4 weeks of profitable paper trading

---

## Mathematical Advantage Framework

### Core Trading Math Concepts

**1. Expected Value (EV)**
```
EV = (Win Rate × Average Win) - (Loss Rate × Average Loss)
```
- **Target:** EV > 2% per trade
- Trade only when EV is positive

**2. Kelly Criterion (Position Sizing)**
```
Kelly = (p × r - q) / r
where: p = win probability, q = loss probability, r = win/loss ratio
```
- **Usage:** Use 25% of Kelly for safety (fractional Kelly)
- Prevents over-betting and ruin

**3. Key Performance Thresholds**

| Metric | Minimum | Target | Excellent |
|--------|---------|--------|-----------|
| Win Rate | 45% | 50% | 60%+ |
| Sharpe Ratio | 1.0 | 1.5 | 2.0+ |
| Profit Factor | 1.2 | 1.5 | 2.0+ |
| Max Drawdown | <20% | <15% | <10% |

**4. Statistical Validation**
- P-value < 0.05 required (95% confidence)
- Minimum 30 trades for validity
- Use Monte Carlo simulation for risk assessment
- Walk-forward testing to prevent overfitting

**5. Risk Management Rules**
- Never risk more than 1-2% per trade
- Daily loss limit: 2% of portfolio
- Maximum drawdown trigger: 15%
- Kill switch at 20% drawdown

### Math Advantage Files

| File | Purpose |
|------|---------|
| `services/risk/PositionSizer.py` | Kelly Criterion implementation |
| `services/risk/RiskManager.py` | VaR, drawdown, kill switch |
| `services/backtesting/PracticalValueApplications.py` | Volatility management |
| `ai-ml/training/validation_framework.py` | Walk-forward, Monte Carlo |

---

## Quick Reference

### Important URLs

- **Dashboard:** http://localhost:3000
- **API Health:** http://localhost:3001/health
- **Trading Status:** http://localhost:3001/api/trading/status
- **Alpaca Paper Dashboard:** https://app.alpaca.markets/paper/dashboard/
- **Alpaca API Docs:** https://alpaca.markets/docs/

### Key Trading Parameters

Located in `clients/bot-dashboard/unified-trading-bot.js`:

- **Stop Loss:** 4-7% below entry (varies by tier)
- **Profit Target:** 8-20% above entry (varies by tier)
- **Momentum Threshold:** 2.5-10% intraday price change (multi-tier)
- **Max Positions:** 5-6 concurrent (varies by tier)
- **Position Size:** 0.5-1% of equity per trade
- **Max Trades/Day:** 15 (anti-churning limit)
- **Max Trades/Symbol:** 3 per day
- **Scan Interval:** 60 seconds
- **Trading Hours:** 9:30 AM - 4:00 PM EST

### Multi-Tier Momentum Strategy

The bot uses a 3-tier momentum strategy (configured in `MOMENTUM_CONFIG`):
- **Tier 1:** 2.5% momentum, 4% stop, 8% target (primary strategy)
- **Tier 2:** 5% momentum, 5% stop, 10% target (secondary)
- **Tier 3:** 10% momentum, 6% stop, 15% target (extreme moves)

---

## Additional Resources

### Documentation Files

Read these in order for complete understanding:

1. **QUICK_START_GUIDE.md** - 5-minute setup (start here)
2. **BOT_FEATURES_COMPLETE.md** - Complete feature reference
3. **API_REFERENCE.md** - API endpoints and examples
4. **ANTI_CHURNING_IMPLEMENTED.md** - Safety system deep dive
5. **DOCUMENTATION_INDEX.md** - Navigate all docs

### Historical Context

- **LOSS_DIAGNOSIS.md** - SMX churning bug analysis (Dec 5, 2025)
- **BOT_PERFORMANCE_REPORT.md** - Performance investigation (Dec 8, 2025)

### External Resources

- **Alpaca API Docs:** https://alpaca.markets/docs/
- **React Query Docs:** https://tanstack.com/query/latest
- **Vite Docs:** https://vitejs.dev/
- **MUI Docs:** https://mui.com/

---

## Critical Guidelines for Claude Code

### Must-Know Before Making Changes

1. **Anti-churning protection is critical** (lines 37-100 in `unified-trading-bot.js`)
   - Never modify without full understanding
   - Prevents over-trading losses (historical SMX bug lost ~$300)
   - Enforces 15 trades/day limit, 3 trades/symbol, cooldown periods

2. **API response structure is tightly coupled**
   - Frontend expects nested `realAccount` and `demoAccount` objects
   - Changes to backend response format require frontend updates
   - Check `clients/bot-dashboard/src/services/api.ts` for expected structure

3. **Environment variables and secrets**
   - Never commit `.env` file (already in `.gitignore`)
   - Use `.env.example` as template for required variables
   - All Alpaca API keys are for paper trading only

4. **Multi-instance prevention**
   - Only ONE bot instance should run at a time
   - Check for existing processes: `lsof -i :3001`
   - Kill duplicates immediately to prevent conflicting trades

### Development Best Practices

1. **Before modifying bot logic:**
   - Stop the bot: `lsof -ti :3001 | xargs kill -9`
   - Review anti-churning protection logic
   - Test changes while monitoring logs
   - Verify with curl before restarting in background

2. **When debugging issues:**
   - Check logs first: `tail -f clients/bot-dashboard/logs/unified-bot-protected.log`
   - Verify API health: `curl http://localhost:3001/health`
   - Check Alpaca dashboard for actual trades
   - Review comprehensive docs in `BOT_FEATURES_COMPLETE.md`

3. **Code changes checklist:**
   - Read relevant documentation files first
   - Test in paper trading environment only
   - Monitor logs for at least one full trading day
   - Never increase position sizes or disable safety limits

### Documentation Files Priority

Read in this order when working on features:
1. `CLAUDE.md` (this file) - Architecture and commands
2. `BOT_FEATURES_COMPLETE.md` - Complete feature reference
3. `API_REFERENCE.md` - API endpoints and contracts
4. `ANTI_CHURNING_IMPLEMENTED.md` - Safety system deep dive
5. `QUICK_START_GUIDE.md` - Setup instructions

---

**Important:** This is a live trading system (paper trading mode). All changes should be thoroughly tested. Never use real money - bot is in development and not yet consistently profitable.
