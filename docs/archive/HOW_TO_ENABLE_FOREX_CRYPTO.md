# How to Enable Forex & Cryptocurrency Trading

## Current Situation

You're currently trading with **Alpaca Paper Trading**, which only supports:
- ✅ US Stocks and ETFs (SPY, AAPL, MSFT, etc.)
- ✅ BTCUSD and ETHUSD only

**Alpaca does NOT support:**
- ❌ Forex pairs (EURUSD, GBPUSD, etc.)
- ❌ Most cryptocurrencies (BNB, XRP, ADA, SOL, DOGE, etc.)

## Good News: You Have Everything Built!

Your codebase already has **5 broker adapters** ready:

| Broker | Supports | Status | Adapter File |
|--------|----------|--------|--------------|
| **Alpaca** | US Stocks, ETFs, BTCUSD, ETHUSD | ✅ Active | Built-in |
| **MetaTrader** | Forex (17 pairs), CFDs | 🟡 Ready | `metatrader-adapter.js` |
| **Binance** | 19+ Cryptocurrencies | 🟡 Ready | `binance-adapter.js` |
| **Kraken** | Crypto + Some Forex | 🟡 Ready | `kraken-adapter.js` |
| **Interactive Brokers** | Everything (Stocks, Forex, Crypto, Options) | 🟡 Ready | `ibkr-adapter.js` |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Option 1: MetaTrader (Best for Forex) 🥇

**What it trades:**
- 17 Forex pairs: EURUSD, GBPUSD, USDJPY, USDCHF, AUDUSD, USDCAD, NZDUSD, EURJPY, GBPJPY, EURGBP, AUDJPY, EURAUD, EURCHF, USDMXN, USDZAR, USDTRY, USDBRL
- CFDs on indices, commodities

**Setup Steps:**

### 1. Get MetaTrader Account
```bash
# Popular MetaTrader brokers with demo accounts:
# - IC Markets (icmarkets.com)
# - OANDA (oanda.com)
# - FXCM (fxcm.com)
# - Pepperstone (pepperstone.com)

# All offer FREE demo accounts with $10,000-$100,000 virtual money
```

### 2. Install MetaTrader 4 or 5
```bash
# Download from your broker's website
# For Mac: Use Wine or broker's Mac version
# For Linux: Use Wine
```

### 3. Configure Your Bot

Add to your `.env` file:
```bash
# MetaTrader Configuration
MT_BROKER=YourBrokerName
MT_ACCOUNT=12345678
MT_PASSWORD=your_password
MT_SERVER=YourBroker-Demo

# Example for IC Markets:
# MT_BROKER=ICMarkets
# MT_ACCOUNT=12345678
# MT_PASSWORD=demo123
# MT_SERVER=ICMarketsSC-Demo
```

### 4. Update config.json

```bash
cd services/trading/data
nano config.json
```

Add forex symbols:
```json
{
  "symbols": [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD",
    "EURJPY", "GBPJPY", "EURGBP", "AUDJPY", "EURAUD", "EURCHF",
    "USDMXN", "USDZAR", "USDTRY", "USDBRL"
  ],
  "broker": "metatrader",
  "strategies": ["trendFollowing", "meanReversion"],
  "riskPerTrade": 0.02,
  "maxPositionSize": 10000
}
```

### 5. Restart Bot with MetaTrader

```bash
# Stop current bot
pkill -9 -f "profitable-trading-server.js"

# Set broker to MetaTrader
export BROKER=metatrader

# Restart
cd /Users/theophilusogieva/Desktop/NexusTradeAI/services/trading
node profitable-trading-server.js > logs/trading.log 2>&1 &
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Option 2: Binance (Best for Crypto) 🥇

**What it trades:**
- 19+ Cryptocurrencies: BTCUSD, ETHUSD, BNBUSD, XRPUSD, ADAUSD, SOLUSD, DOGEUSD, MATICUSD, AVAXUSD, LINKUSD, DOTUSD, UNIUSD, ATOMUSD, LTCUSD, TONUSD, XLMUSD, TRXUSD, APTUSD, NEARUSD

**Setup Steps:**

### 1. Create Binance Account
```bash
# Go to: https://www.binance.com/en/register
# Or Binance US: https://www.binance.us/register

# Enable API access in your account settings
```

### 2. Get API Keys
```bash
# 1. Go to: https://www.binance.com/en/my/settings/api-management
# 2. Create New API Key
# 3. Enable "Spot & Margin Trading" permission
# 4. Copy API Key and Secret Key
# 5. Enable IP Access restriction (optional but recommended)
```

### 3. Configure Your Bot

Add to your `.env` file:
```bash
# Binance Configuration
BINANCE_API_KEY=your_binance_api_key_here
BINANCE_SECRET_KEY=your_binance_secret_key_here
BINANCE_TESTNET=true  # Set to false for real trading
```

### 4. Update config.json

```json
{
  "symbols": [
    "BTCUSD", "ETHUSD", "BNBUSD", "XRPUSD", "ADAUSD", "SOLUSD",
    "DOGEUSD", "MATICUSD", "AVAXUSD", "LINKUSD", "DOTUSD",
    "UNIUSD", "ATOMUSD", "LTCUSD", "TONUSD", "XLMUSD",
    "TRXUSD", "APTUSD", "NEARUSD"
  ],
  "broker": "binance",
  "strategies": ["trendFollowing", "meanReversion"],
  "riskPerTrade": 0.02,
  "maxPositionSize": 10000
}
```

### 5. Restart Bot with Binance

```bash
# Stop current bot
pkill -9 -f "profitable-trading-server.js"

# Set broker to Binance
export BROKER=binance

# Restart
cd /Users/theophilusogieva/Desktop/NexusTradeAI/services/trading
node profitable-trading-server.js > logs/trading.log 2>&1 &
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Option 3: Kraken (Crypto + Some Forex)

**What it trades:**
- All major cryptocurrencies
- Some forex pairs
- Margin trading available

**Setup Steps:**

### 1. Create Kraken Account
```bash
# Go to: https://www.kraken.com/sign-up
# Complete verification (takes 1-2 days)
```

### 2. Get API Keys
```bash
# 1. Go to: Settings → API
# 2. Generate New Key
# 3. Enable "Query Funds", "Query Open Orders", "Create & Modify Orders"
# 4. Copy API Key and Private Key
```

### 3. Configure Your Bot

Add to your `.env` file:
```bash
# Kraken Configuration
KRAKEN_API_KEY=your_kraken_api_key_here
KRAKEN_PRIVATE_KEY=your_kraken_private_key_here
```

### 4. Update config.json and restart (similar to Binance)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Option 4: Interactive Brokers (Everything!) 🏆

**What it trades:**
- Stocks (all markets worldwide)
- Forex (all pairs)
- Cryptocurrencies
- Options
- Futures
- Bonds

**This is the MOST comprehensive option but also more complex to set up.**

**Setup Steps:**

### 1. Create IBKR Account
```bash
# Go to: https://www.interactivebrokers.com
# Apply for account (takes 1-3 days for approval)
# Start with Paper Trading account (free, instant)
```

### 2. Install IB Gateway or TWS
```bash
# Download from: https://www.interactivebrokers.com/en/trading/tws.php
# IB Gateway is lighter (recommended for bots)
```

### 3. Configure Your Bot

Add to your `.env` file:
```bash
# Interactive Brokers Configuration
IBKR_ACCOUNT=your_account_number
IBKR_HOST=127.0.0.1
IBKR_PORT=4001  # 4001 for Gateway, 7496 for TWS
IBKR_CLIENT_ID=1
IBKR_PAPER_TRADING=true  # Set to false for live trading
```

### 4. Update config.json

```json
{
  "symbols": [
    "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD",
    "SPY", "QQQ", "AAPL", "MSFT"
  ],
  "broker": "ibkr",
  "strategies": ["trendFollowing", "meanReversion"],
  "riskPerTrade": 0.02,
  "maxPositionSize": 10000
}
```

### 5. Start IB Gateway
```bash
# Start IB Gateway on your computer
# Login with your paper trading credentials
# Enable API connections in settings
```

### 6. Restart Bot with IBKR

```bash
# Stop current bot
pkill -9 -f "profitable-trading-server.js"

# Set broker to IBKR
export BROKER=ibkr

# Restart
cd /Users/theophilusogieva/Desktop/NexusTradeAI/services/trading
node profitable-trading-server.js > logs/trading.log 2>&1 &
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Option 5: Multi-Broker Setup (Trade Everything!)

You can run multiple brokers simultaneously:
- **Alpaca** for US stocks
- **Binance** for crypto
- **MetaTrader** for forex

### Setup Script

Create `start-multi-broker.sh`:
```bash
#!/bin/bash

# Set environment variables
export BROKER=multi
export ALPACA_API_KEY=your_alpaca_key
export ALPACA_SECRET_KEY=your_alpaca_secret
export BINANCE_API_KEY=your_binance_key
export BINANCE_SECRET_KEY=your_binance_secret
export MT_ACCOUNT=your_mt_account
export MT_PASSWORD=your_mt_password

# Start bot
cd /Users/theophilusogieva/Desktop/NexusTradeAI/services/trading
node profitable-trading-server.js > logs/trading.log 2>&1 &

echo "✅ Multi-broker trading bot started!"
echo "Brokers: Alpaca (stocks) + Binance (crypto) + MetaTrader (forex)"
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Quick Comparison

| Feature | Alpaca | MetaTrader | Binance | Kraken | IBKR |
|---------|--------|------------|---------|--------|------|
| **US Stocks** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Forex** | ❌ | ✅ 17 pairs | ❌ | 🟡 Some | ✅ All |
| **Crypto** | 🟡 2 coins | ❌ | ✅ 19+ coins | ✅ Many | ✅ Few |
| **Demo Account** | ✅ Free | ✅ Free | ✅ Testnet | ✅ Free | ✅ Paper |
| **Setup Time** | 5 min | 30 min | 15 min | 15 min | 1-3 days |
| **Complexity** | Easy | Medium | Easy | Easy | Hard |
| **Best For** | Testing | Forex | Crypto | Crypto | Everything |

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## My Recommendation

**For Quick Start:**
1. **Start with Alpaca** (you're already set up!) - Learn how the bot works
2. **Add Binance** for crypto - Easy setup, 19+ cryptocurrencies
3. **Add MetaTrader** for forex - Free demo accounts available

**For Serious Trading:**
- **Interactive Brokers** - One account for everything (stocks, forex, crypto, options)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Testing Your Setup

After configuring a new broker, test the connection:

```bash
# Test MetaTrader
node -e "const MT = require('./brokers/metatrader-adapter'); const mt = new MT(); mt.connect().then(() => console.log('✅ MT Connected')).catch(e => console.error('❌', e))"

# Test Binance
node -e "const Binance = require('./brokers/binance-adapter'); const bn = new Binance(); bn.connect().then(() => console.log('✅ Binance Connected')).catch(e => console.error('❌', e))"

# Test Kraken
node -e "const Kraken = require('./brokers/kraken-adapter'); const kr = new Kraken(); kr.connect().then(() => console.log('✅ Kraken Connected')).catch(e => console.error('❌', e))"
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Important Notes

**Paper Trading First:**
- Always test with demo/paper accounts first
- Don't use real money until you're confident

**Risk Management:**
- Start with small position sizes
- Use stop losses
- Never risk more than 2% per trade

**Broker Costs:**
- Alpaca: Commission-free
- MetaTrader: Spreads vary by broker (0.5-2 pips)
- Binance: 0.1% trading fee
- Kraken: 0.16-0.26% trading fee
- IBKR: $0.005 per share (stocks), spreads (forex)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Need Help?

**Documentation Files:**
- `services/trading/brokers/metatrader-adapter.js` - MetaTrader implementation
- `services/trading/brokers/binance-adapter.js` - Binance implementation
- `services/trading/brokers/kraken-adapter.js` - Kraken implementation
- `services/trading/brokers/ibkr-adapter.js` - IBKR implementation
- `services/trading/brokers/broker-factory.js` - Broker management

**Check Status:**
```bash
curl -s http://localhost:3002/api/trading/status | python3 -m json.tool
```

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Summary

You have a **complete multi-broker trading infrastructure** already built!

**What you need:**
1. Choose broker(s) for forex/crypto
2. Create account(s) (demo recommended)
3. Get API credentials
4. Add to `.env` file
5. Update `config.json`
6. Restart bot

**You're literally 5 minutes away from trading forex and crypto!**

Choose your broker and let me know - I'll help you configure it!
