# 📈 Stock Trading Setup Guide
## Trade US Stocks with NexusTradeAI

Your bot supports **two major platforms** for stock trading:
1. **Alpaca** - Already configured! (Easiest)
2. **Interactive Brokers (IBKR)** - Professional platform (More features)

---

## 🚀 Quick Start: Alpaca (Already Set Up!)

### ✅ You're Already Trading Stocks!

Your bot is **already configured** for Alpaca stock trading. Here's what's active:

**Current Configuration:**
```bash
BROKER_TYPE=alpaca
ALPACA_API_KEY=PKT8MP1DLZIAIAE8CCRD
ALPACA_SECRET_KEY=wZkR8HJmzIBFSnNHqxUpstSs6SIiEFAAL9uXFG1P
TRADING_SYMBOLS=AAPL,GOOGL,MSFT,TSLA,NVDA
```

**Account Status:**
- ✅ Connected to Alpaca Paper Trading
- ✅ Current Balance: $100,577.80
- ✅ Trading: AAPL, GOOGL, MSFT, TSLA, NVDA
- ✅ Strategy: Trend Following
- ✅ Risk: 1% per trade

### 📊 What You Can Trade Right Now

Popular US Stocks:
```bash
# Tech Giants
AAPL      # Apple Inc.
GOOGL     # Alphabet (Google) Class A
MSFT      # Microsoft
TSLA      # Tesla
NVDA      # NVIDIA
META      # Meta (Facebook)
AMZN      # Amazon

# ETFs
SPY       # S&P 500 ETF
QQQ       # Nasdaq 100 ETF
IWM       # Russell 2000 ETF
DIA       # Dow Jones ETF

# Popular Stocks
NFLX      # Netflix
AMD       # Advanced Micro Devices
INTC      # Intel
BA        # Boeing
DIS       # Disney
V         # Visa
JPM       # JPMorgan Chase
```

### 🎯 Add More Stocks to Trade

Edit [services/trading/.env](services/trading/.env):

```bash
# Current stocks
TRADING_SYMBOLS=AAPL,GOOGL,MSFT,TSLA,NVDA

# Add more stocks (example)
TRADING_SYMBOLS=AAPL,GOOGL,MSFT,TSLA,NVDA,META,AMZN,NFLX,AMD,SPY,QQQ

# Or focus on specific sectors
TRADING_SYMBOLS=AAPL,MSFT,NVDA,AMD,INTC  # Tech stocks
TRADING_SYMBOLS=JPM,BAC,WFC,GS,MS        # Bank stocks
TRADING_SYMBOLS=SPY,QQQ,IWM,DIA          # ETFs only
```

**Then restart:**
```bash
cd services/trading
npm start
```

---

## 🔥 Option 2: Interactive Brokers (IBKR) - Professional Platform

### Why Use IBKR?

| Feature | Alpaca | IBKR |
|---------|--------|------|
| **US Stocks** | ✅ Yes | ✅ Yes |
| **Options** | ❌ No | ✅ Yes |
| **International** | ❌ No | ✅ Yes (135+ markets) |
| **Futures** | ❌ No | ✅ Yes |
| **Bonds** | ❌ No | ✅ Yes |
| **Commissions** | $0 | $0.0035/share (min $0.35) |
| **Min Deposit** | $0 | $0 (paper) |
| **Best For** | Simple stock trading | Professional traders |

### Setting Up IBKR (15 Minutes)

#### Step 1: Download Software

1. Go to https://www.interactivebrokers.com
2. Click **"Open Account"** → Choose **"Paper Trading"**
3. Download **Trader Workstation (TWS)** or **IB Gateway**
4. Install and launch it

#### Step 2: Enable API Access

1. Open TWS/Gateway
2. Go to **Configure → Global Configuration**
3. Navigate to **API → Settings**
4. Check these boxes:
   - ✅ **"Enable ActiveX and Socket Clients"**
   - ✅ **"Allow connections from localhost only"**
5. Set **Socket Port**:
   - Paper Trading: `7497`
   - Live Trading: `7496`
6. Click **"Apply"** and **"OK"**
7. Restart TWS

#### Step 3: Get Your Account ID

1. In TWS, go to **Account → Account Window**
2. Your paper account ID starts with **"D"** (e.g., `DU123456`)
3. Note this down

#### Step 4: Install IBKR Package

```bash
cd services/trading
npm install @stoqey/ib
```

#### Step 5: Configure .env

Edit [services/trading/.env](services/trading/.env):

```bash
# Switch to IBKR
BROKER_TYPE=ibkr

# IBKR Configuration
IBKR_HOST=127.0.0.1
IBKR_PORT=7497              # Paper trading port
IBKR_CLIENT_ID=0
IBKR_ACCOUNT_ID=DU123456    # Your paper account ID
IBKR_IS_PAPER=true

# Stocks to trade
TRADING_SYMBOLS=AAPL,GOOGL,MSFT,TSLA,NVDA
```

#### Step 6: Test Connection

**IMPORTANT**: Start TWS/Gateway FIRST, then:

```bash
cd services/trading
node test-broker-connection.js ibkr
```

**Expected Output:**
```
============================================================
  Testing Interactive Brokers Connection
============================================================

ℹ️  Host: 127.0.0.1
ℹ️  Port: 7497 (Paper)
⚠️  Make sure TWS or IB Gateway is running!
ℹ️  Connecting...
✅ Connected to Interactive Brokers!
ℹ️  Fetching account info...
✅ Account Value: $1000000.00
ℹ️  Cash: $1000000.00
ℹ️  Testing market data for AAPL...
✅ AAPL Price: $185.92
✅ IBKR test completed successfully!

🎉 All tests passed! You're ready to trade!
```

#### Step 7: Start Trading

```bash
npm start
```

---

## 📊 Stock Trading Strategies

### 1. Trend Following (Current Strategy)

Best for:
- Strong momentum stocks (TSLA, NVDA, AMD)
- Following market trends
- Medium-term holds (days to weeks)

Configuration:
```bash
ENABLED_STRATEGIES=trendFollowing
TRADING_SYMBOLS=TSLA,NVDA,AMD,MSFT
```

### 2. Mean Reversion

Best for:
- Blue chip stocks (AAPL, MSFT, JPM)
- Buying dips
- Short-term trades (hours to days)

Configuration:
```bash
ENABLED_STRATEGIES=meanReversion
TRADING_SYMBOLS=AAPL,MSFT,JPM,JNJ
```

### 3. Volatility Breakout

Best for:
- High volatility stocks
- Earnings plays
- Quick moves

Configuration:
```bash
ENABLED_STRATEGIES=volatilityBreakout
TRADING_SYMBOLS=TSLA,GME,AMC,NVDA
```

### 4. ETF Trading

Best for:
- Lower risk
- Market-wide exposure
- Diversification

Configuration:
```bash
ENABLED_STRATEGIES=trendFollowing,meanReversion
TRADING_SYMBOLS=SPY,QQQ,IWM,DIA,VTI
```

---

## 🎯 Recommended Stock Lists

### Tech Stocks (High Growth)
```bash
TRADING_SYMBOLS=AAPL,MSFT,GOOGL,META,NVDA,AMD,TSLA,NFLX,CRM,ORCL
```

### Blue Chips (Stable)
```bash
TRADING_SYMBOLS=AAPL,MSFT,JNJ,JPM,V,PG,KO,WMT,DIS,HD
```

### High Volatility (Risk/Reward)
```bash
TRADING_SYMBOLS=TSLA,NVDA,AMD,PLTR,COIN,SHOP,SQ,ROKU
```

### Dividend Aristocrats (Income)
```bash
TRADING_SYMBOLS=JNJ,PG,KO,PEP,WMT,MCD,CAT,HD,LOW
```

### ETFs Only (Diversified)
```bash
TRADING_SYMBOLS=SPY,QQQ,IWM,DIA,VTI,VEA,VWO,AGG,TLT
```

### Sector Rotation
```bash
# Tech
TRADING_SYMBOLS=XLK,VGT,ARKK,SOXX

# Finance
TRADING_SYMBOLS=XLF,KBE,KRE

# Healthcare
TRADING_SYMBOLS=XLV,VHT,IBB

# Energy
TRADING_SYMBOLS=XLE,VDE,OIH
```

---

## 💰 Position Sizing for Stocks

### Conservative (Recommended)
```bash
RISK_PER_TRADE=0.01          # 1% risk per trade
MAX_POSITION_SIZE=5000       # Max $5K per position
MAX_DAILY_LOSS=-1000         # Max $1K daily loss
```

### Moderate
```bash
RISK_PER_TRADE=0.02          # 2% risk per trade
MAX_POSITION_SIZE=10000      # Max $10K per position
MAX_DAILY_LOSS=-2500         # Max $2.5K daily loss
```

### Aggressive (Use with caution)
```bash
RISK_PER_TRADE=0.03          # 3% risk per trade
MAX_POSITION_SIZE=20000      # Max $20K per position
MAX_DAILY_LOSS=-5000         # Max $5K daily loss
```

---

## 📅 Best Trading Times for US Stocks

### Market Hours (EST)
- **Pre-Market**: 4:00 AM - 9:30 AM
- **Regular Hours**: 9:30 AM - 4:00 PM ⭐ (Best liquidity)
- **After-Hours**: 4:00 PM - 8:00 PM

### Best Trading Windows
1. **9:30 AM - 10:30 AM** - Market open (highest volume)
2. **2:00 PM - 4:00 PM** - Market close (increased activity)
3. **Avoid 11:30 AM - 1:30 PM** - Low volume lunch period

### Key Days
- **Monday**: New week trends
- **Friday**: Week-end positioning
- **Earnings Days**: High volatility

---

## 🔍 Market Data & Research

### Free Resources
- **Yahoo Finance**: https://finance.yahoo.com
- **TradingView**: https://www.tradingview.com
- **Finviz**: https://finviz.com
- **Seeking Alpha**: https://seekingalpha.com

### Economic Calendar
- **Investing.com**: https://www.investing.com/economic-calendar/
- Watch for: Fed meetings, earnings, GDP, jobs report

---

## 🛡️ Risk Management for Stocks

### Key Rules

1. **Never Risk More Than 1-2% Per Trade**
```bash
# If account = $100,000
# Risk per trade = $1,000 - $2,000
RISK_PER_TRADE=0.01  # or 0.02
```

2. **Use Stop Losses**
```bash
# Set in strategy
stopLossPercent: 2%  # Exit if stock drops 2%
```

3. **Diversify**
```bash
# Don't put all money in one stock
# Trade 5-10 different stocks
TRADING_SYMBOLS=AAPL,MSFT,GOOGL,NVDA,AMD,META,TSLA,NFLX,DIS,V
```

4. **Limit Daily Loss**
```bash
MAX_DAILY_LOSS=-1000  # Stop trading if lose $1K in a day
```

5. **Watch Correlation**
```bash
# Don't trade too many correlated stocks
# Bad: AAPL,MSFT,GOOGL,NVDA (all tech)
# Good: AAPL,JPM,XLE,VHT (diversified sectors)
```

---

## 📈 Performance Tracking

### Monitor via Dashboard

Open: http://localhost:3000

View:
- ✅ Real-time positions
- ✅ Daily P&L
- ✅ Win rate
- ✅ Best/worst trades
- ✅ Strategy performance

### Key Metrics to Track

1. **Win Rate**: Target > 50%
2. **Profit Factor**: Target > 1.5
3. **Average Win/Loss Ratio**: Target > 1.5:1
4. **Max Drawdown**: Keep < 10%
5. **Sharpe Ratio**: Target > 1.0

---

## 🔧 Troubleshooting

### Alpaca Issues

**"Insufficient buying power"**
- Check paper account balance
- Reduce `MAX_POSITION_SIZE`
- Adjust position quantities

**"Symbol not found"**
- Use correct ticker (e.g., `META` not `FB`)
- Check if stock is tradeable
- Some stocks require subscription

### IBKR Issues

**"Connection timeout"**
- Start TWS/Gateway FIRST
- Check API is enabled
- Verify port number (7497)

**"Market data not available"**
- IBKR requires subscriptions for some data
- Paper account has limited data
- Use stocks you have data for

**"No security definition found"**
- Use correct symbol format
- Check contract specifications
- Add exchange if needed (e.g., `AAPL` on `SMART`)

---

## 💡 Pro Tips

### For Day Trading
1. Start small (100 shares)
2. Trade liquid stocks (volume > 1M)
3. Watch the first hour (9:30-10:30 AM)
4. Set tight stops (1-2%)
5. Take profits quickly

### For Swing Trading
1. Look for 3-5 day trends
2. Use larger positions
3. Wider stops (3-5%)
4. Hold overnight
5. Watch for news/earnings

### For ETF Trading
1. Lower volatility
2. Good for beginners
3. Diversified exposure
4. Lower risk
5. Smoother returns

---

## 🎓 Learning Resources

### Books
- "A Random Walk Down Wall Street" - Burton Malkiel
- "The Intelligent Investor" - Benjamin Graham
- "Market Wizards" - Jack Schwager

### Courses
- **Coursera**: Financial Markets (Yale)
- **Udemy**: Stock Trading courses
- **YouTube**: Investing channels

### Paper Trading
- Practice on Alpaca paper account
- Test strategies for 1-3 months
- Don't use real money until profitable

---

## ✅ Setup Checklist

**Alpaca (Already Done!)**
- [x] Alpaca account connected
- [x] Paper trading active
- [x] Balance: $100,577.80
- [x] Trading 5 stocks
- [x] Bot running

**To Trade More Stocks:**
- [ ] Choose stock list from recommendations
- [ ] Update `TRADING_SYMBOLS` in .env
- [ ] Adjust position sizing
- [ ] Restart bot
- [ ] Monitor performance

**Optional: IBKR Setup**
- [ ] Download TWS/Gateway
- [ ] Enable API access
- [ ] Get account ID
- [ ] Install `@stoqey/ib`
- [ ] Configure .env
- [ ] Test connection
- [ ] Start trading

---

## 🚀 Quick Commands

```bash
# Current setup (Alpaca)
cd services/trading
nano .env              # Edit configuration
npm start              # Start trading

# Test IBKR (if setting up)
npm install @stoqey/ib
node test-broker-connection.js ibkr

# View dashboard
open http://localhost:3000

# Check logs
tail -f trading-server.log
```

---

## 📞 Support

- **Alpaca Docs**: https://alpaca.markets/docs/
- **IBKR API**: https://interactivebrokers.github.io/tws-api/
- **Full Guide**: [MULTI_BROKER_SETUP_GUIDE.md](MULTI_BROKER_SETUP_GUIDE.md)
- **Dashboard**: http://localhost:3000

---

**Happy Stock Trading! 📈📊**

Remember: Past performance does not guarantee future results. Always practice proper risk management!
