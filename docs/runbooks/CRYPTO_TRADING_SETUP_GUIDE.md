# Crypto Trading Bot Setup Guide
**NexusTradeAI Unified Crypto Bot - Complete Setup Instructions**

**Created:** December 27, 2025
**Bot:** `unified-crypto-bot.js`
**Port:** 3006
**Trading Hours:** 24/7/365 (Never closes)

---

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Exchange Setup (Binance Testnet)](#exchange-setup)
4. [Configuration](#configuration)
5. [Running the Bot](#running-the-bot)
6. [Monitoring & Alerts](#monitoring--alerts)
7. [Trading Strategy](#trading-strategy)
8. [Risk Management](#risk-management)
9. [Troubleshooting](#troubleshooting)
10. [Live Trading Checklist](#live-trading-checklist)

---

## Overview

The **Unified Crypto Bot** is a 24/7 automated cryptocurrency trading system with:

### Key Features
- ✅ **24/7/365 Trading** - Never sleeps, trades around the clock
- ✅ **12 Major Cryptocurrencies** - BTC, ETH, BNB, SOL, ADA, XRP, AVAX, MATIC, LINK, DOT, UNI, ATOM
- ✅ **BTC Correlation Strategy** - Altcoins only trade when Bitcoin is bullish
- ✅ **3-Tier Momentum System** - Multiple momentum thresholds (1.5%, 5%, 10%)
- ✅ **Anti-Churning Protection** - Max 10 trades/day, 30min cooldown
- ✅ **Telegram Alerts** - FREE unlimited real-time notifications
- ✅ **Trailing Stops** - Progressive profit protection (10%, 20%, 30%)
- ✅ **Testnet Support** - Practice with fake money first!

### Architecture
```
┌──────────────────────────────────────────────────────────┐
│  Unified Crypto Bot (Node.js + Express)                 │
│  Port: 3006                                              │
│  ├─ BTC Correlation Strategy                            │
│  ├─ 3-Tier Momentum Scanner                             │
│  ├─ Position Management                                 │
│  └─ Risk Management                                     │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  Binance API (Testnet/Live)                             │
│  ├─ Market Data (5-min candles)                         │
│  ├─ Order Execution                                     │
│  ├─ Account Management                                  │
│  └─ Position Tracking                                   │
└──────────────────────────────────────────────────────────┘
                          ↓
┌──────────────────────────────────────────────────────────┐
│  Telegram Alerts                                         │
│  ├─ Entry Notifications                                 │
│  ├─ Stop Loss Alerts                                    │
│  └─ Take Profit Alerts                                  │
└──────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. System Requirements
- **Node.js** 14+ installed
- **npm** or **yarn** package manager
- **Operating System:** macOS, Linux, or Windows
- **Internet Connection:** Stable connection required for 24/7 trading

### 2. Existing Setup
You should already have completed:
- ✅ Stock bot running (unified-trading-bot.js on port 3002)
- ✅ Forex bot running (unified-forex-bot.js on port 3005) - optional
- ✅ Telegram bot configured with @BotFather
- ✅ `.env` file with Telegram credentials

### 3. Knowledge Requirements
- ⚠️ **HIGH RISK**: Crypto is 10x more volatile than stocks
- ⚠️ **24/7 Trading**: Bot trades while you sleep
- ⚠️ **Use Testnet First**: ALWAYS start with testnet
- ⚠️ **Small Positions**: Start with $500 positions max

---

## Exchange Setup

### Step 1: Create Binance Testnet Account

**Binance Testnet** lets you practice with FAKE money!

1. **Visit:** https://testnet.binance.vision/
2. **Click:** "Register" (top right)
3. **Create Account:**
   - Email: your-email@example.com
   - Password: Strong password
   - Verify email

4. **Testnet Funds:**
   - You get 10,000 USDT fake money
   - Can be reset anytime
   - NO REAL MONEY AT RISK

### Step 2: Generate API Keys

1. **Login** to Binance Testnet
2. **Go to:** API Management (top right menu)
3. **Click:** "Create API" button
4. **Label:** "NexusTradeAI Bot"
5. **Permissions:**
   - ✅ Enable Spot Trading
   - ✅ Enable Reading
   - ❌ Disable Withdrawals (security)
6. **Click:** "Create"
7. **Save These:**
   - API Key: `abc123...` (copy this)
   - API Secret: `xyz789...` (copy this, shown ONCE)

⚠️ **SECURITY:**
- Never share API keys
- Never commit to git
- Store in `.env` file only

### Step 3: Test API Connection

```bash
# Test your API keys work
curl -X GET "https://testnet.binance.vision/api/v3/account" \
  -H "X-MBX-APIKEY: YOUR_API_KEY"

# Should return account data (not error)
```

---

## Configuration

### Step 1: Update `.env` File

Add these lines to your `/Users/theophilusogieva/Desktop/NexusTradeAI/.env` file:

```bash
# ===================================
# Crypto Trading Configuration (24/7)
# ===================================

CRYPTO_PORT=3006

# Exchange
CRYPTO_EXCHANGE=binance
CRYPTO_TESTNET=true  # CRITICAL: Keep true for testnet!

# Binance Testnet API Keys (from Step 2 above)
CRYPTO_API_KEY=abc123your_actual_api_key_here
CRYPTO_API_SECRET=xyz789your_actual_api_secret_here

# Risk Management (Conservative Settings)
CRYPTO_MAX_POSITIONS=2               # Only 2 positions max
CRYPTO_MAX_TRADES_PER_DAY=10         # Max 10 trades/day
CRYPTO_RISK_PER_TRADE=0.02           # 2% risk per trade
CRYPTO_BASE_POSITION_SIZE=500        # $500 per position
CRYPTO_MAX_POSITION_SIZE=2000        # Max $2000 per position
```

### Step 2: Verify Configuration

Check that your `.env` file includes (from earlier setup):

```bash
# Telegram (should already be configured)
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_BOT_TOKEN=8272839069:AAGzU1ffL3kEIsOp-H44G2cfnDhzJrl0LbI
TELEGRAM_CHAT_ID=8558129006
```

---

## Running the Bot

### Step 1: Install Dependencies (if not done)

```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI

# Install required packages
npm install node-telegram-bot-api express cors axios dotenv prom-client
```

### Step 2: Start the Crypto Bot

```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard

# Start the bot
node unified-crypto-bot.js

# You should see:
# ╔════════════════════════════════════════════════════════════════╗
# ║           UNIFIED CRYPTO TRADING BOT - LIVE 24/7              ║
# ╠════════════════════════════════════════════════════════════════╣
# ║  Port: 3006                                                     ║
# ║  Exchange: BINANCE                                             ║
# ║  Mode: TESTNET (Paper Trading)                                 ║
# ...
```

### Step 3: Run in Background (Optional)

```bash
# Run crypto bot in background
node unified-crypto-bot.js > logs/crypto-bot.log 2>&1 &

# Check it's running
lsof -i :3006

# View logs in real-time
tail -f logs/crypto-bot.log
```

### Step 4: Activate Trading

The bot starts in **monitoring mode**. To begin trading:

```bash
# Start trading
curl -X POST http://localhost:3006/api/trading/start

# Expected response:
# {
#   "success": true,
#   "message": "Crypto trading engine started",
#   "warning": "Crypto is HIGH RISK - use testnet first!"
# }
```

### Step 5: Check Status

```bash
# Get bot status
curl http://localhost:3006/api/trading/status | python3 -m json.tool

# Expected output:
# {
#   "success": true,
#   "data": {
#     "isRunning": true,
#     "scanCount": 5,
#     "positions": [],
#     "dailyTrades": 0,
#     "totalTrades": 0,
#     "winRate": "0%",
#     "profitFactor": "0",
#     "netPnL": "0.00"
#   }
# }
```

---

## Monitoring & Alerts

### Bot Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `http://localhost:3006/health` | GET | Health check |
| `http://localhost:3006/api/trading/status` | GET | Get current status |
| `http://localhost:3006/api/trading/start` | POST | Start trading |
| `http://localhost:3006/api/trading/stop` | POST | Stop trading |
| `http://localhost:3006/test-telegram` | POST | Test Telegram alerts |
| `http://localhost:3006/metrics` | GET | Prometheus metrics |

### Test Telegram Alerts

```bash
# Send test message to Telegram
curl -X POST http://localhost:3006/test-telegram

# Check your Telegram app - you should receive:
# "🧪 CRYPTO BOT TEST - This is a test alert..."
```

### Real-Time Telegram Notifications

You'll automatically receive Telegram messages when:

**Entry Alert (Position Opened):**
```
🚀 NEW CRYPTO POSITION ENTERED 🚀

💎 Symbol: BTCUSDT
📊 Tier: TIER1
📈 Quantity: 0.010000 ($500.00)

💰 Entry Price: $50000.00
🔻 Stop Loss: $47500.00 (-5.00%)
🎯 Take Profit: $57500.00 (+15.00%)

📊 Risk/Reward: 1:3.00

⚡ 24/7 Trading Active
⏰ Time: 12/27/2025, 6:45:30 PM
```

**Stop Loss Alert:**
```
🚨 CRYPTO STOP LOSS HIT 🚨

📛 Symbol: ETHUSDT
💰 Entry: $3000.00
📉 Current: $2850.00
🔻 Stop Loss: $2850.00
💸 Loss: -5.00%

⚡ High volatility asset - Risk managed
⏰ Time: 12/27/2025, 7:15:20 PM
```

**Profit Target Alert:**
```
🎯 CRYPTO PROFIT TARGET HIT 🎯

💎 Symbol: SOLUSD
💰 Entry: $100.00
📈 Current: $115.00
🎯 Target: $115.00
💵 Profit: +15.00%

🚀 Crypto volatility = Bigger gains!
⏰ Time: 12/27/2025, 8:30:15 PM
```

### Log Monitoring

```bash
# Watch bot activity in real-time
tail -f logs/crypto-bot.log

# Look for these patterns:
# ✨ BTCUSDT (tier1): Momentum 2.15%, RSI 55.2, Vol $45.2M
# 🚨 ETHUSDT: STOP LOSS HIT at $2850.00 (-5.00%)
# 🎯 SOLUSD: PROFIT TARGET HIT at $115.00 (+15.00%)
```

---

## Trading Strategy

### BTC Correlation Strategy

**Core Concept:** 90% of altcoins follow Bitcoin's trend

**Rules:**
1. **Check BTC First:**
   - If BTC price > 20-period SMA → BTC is **bullish** ✅
   - If BTC price < 20-period SMA → BTC is **bearish** 🔴

2. **Altcoin Trading:**
   - BTC bullish → Trade ALL cryptos ✅
   - BTC bearish → Trade ONLY BTC and ETH ⚠️
   - This prevents losing trades when market leader is down

3. **Example:**
   ```
   ✅ BTC bullish: Trade BTC, ETH, SOL, ADA, etc.
   🔴 BTC bearish: Trade ONLY BTC, ETH (skip altcoins)
   ```

### 3-Tier Momentum System

The bot uses 3 momentum tiers to catch different market moves:

**Tier 1 - Standard Crypto (Most Common)**
- Momentum: 1.5% intraday move
- Stop Loss: 5%
- Profit Target: 15% (3:1 R/R)
- RSI Range: 20-80
- Max Positions: 2

**Tier 2 - High Momentum**
- Momentum: 5% intraday move
- Stop Loss: 6%
- Profit Target: 20% (3.3:1 R/R)
- RSI Range: 25-85
- Max Positions: 1

**Tier 3 - Extreme Momentum**
- Momentum: 10%+ intraday move
- Stop Loss: 8%
- Profit Target: 30% (3.75:1 R/R)
- RSI Range: 30-90
- Max Positions: 1

### Entry Criteria

A crypto must meet ALL of these to trigger a trade:

1. ✅ **BTC Bullish** (if altcoin)
2. ✅ **Momentum Threshold** (1.5%, 5%, or 10%)
3. ✅ **Uptrend Confirmed** (EMA9 > SMA20)
4. ✅ **RSI in Range** (not overbought/oversold extremes)
5. ✅ **Volume Sufficient** ($10M+ daily volume)
6. ✅ **Volatility Normal** (<30% move in 24h)
7. ✅ **Not At Position Limit** (max 2 positions)
8. ✅ **Not At Daily Trade Limit** (max 10 trades/day)
9. ✅ **Cooldown Expired** (30 min since last trade on symbol)

### Exit Strategy

**Automatic Exits:**
- **Stop Loss Hit** → Close at 5-8% loss
- **Profit Target Hit** → Close at 15-30% gain
- **Trailing Stop Triggered** → Lock in profits

**Trailing Stops:**
- At +10% profit → Trail by 5% (lock in +5%)
- At +20% profit → Trail by 8% (lock in +12%)
- At +30% profit → Trail by 12% (lock in +18%)

---

## Risk Management

### Position Sizing

**Default Settings (Ultra-Conservative):**
- Base Position: $500 USD
- Max Position: $2,000 USD
- Risk Per Trade: 2% of $500 = $10 max loss per trade
- Max Positions: 2 concurrent

**Example Trade:**
```
Symbol: BTCUSDT
Price: $50,000
Position Size: $500
Quantity: 0.01 BTC
Stop Loss: 5% = $47,500
Risk: $500 * 5% = $25 actual risk
```

### Anti-Churning Protection

Prevents over-trading losses:

| Rule | Limit | Purpose |
|------|-------|---------|
| Daily Trades | 10 max | Prevent excessive trading |
| Per-Symbol Trades | 2 max/day | Avoid symbol fixation |
| Cooldown Period | 30 minutes | Prevent rapid re-entries |
| Max Positions | 2 total | Limit exposure |

**Example Scenario:**
```
8:00 AM - Buy BTCUSDT ✅
8:15 AM - Try buy BTCUSDT again ❌ (cooldown)
8:45 AM - Sell BTCUSDT (stop loss)
8:46 AM - Try buy BTCUSDT ❌ (cooldown)
9:15 AM - Buy BTCUSDT ✅ (cooldown expired)
9:30 AM - Try buy BTCUSDT ❌ (2/day limit)
```

### Volatility Filter

**Extreme Volatility Pause:**
- If any crypto moves >30% in 24 hours
- Bot PAUSES trading that symbol
- Resumes when volatility normalizes

**Example:**
```
⚠️ SOLUSD: Too volatile (35.2% 24h range) - pausing
✅ BTCUSDT: Normal volatility (2.1% 24h range) - trading
```

### Volume Filter

**Minimum Liquidity:**
- $10M daily volume required
- Prevents trading illiquid/manipulated coins
- Ensures tight spreads and good fills

---

## Troubleshooting

### Bot Won't Start

**Problem:** Bot crashes on startup

**Solutions:**
```bash
# 1. Check API keys are valid
curl -X GET "https://testnet.binance.vision/api/v3/account" \
  -H "X-MBX-APIKEY: your_api_key"

# 2. Check .env file exists
ls -la /Users/theophilusogieva/Desktop/NexusTradeAI/.env

# 3. Check port not in use
lsof -i :3006
# If found: kill -9 <PID>

# 4. Check dependencies installed
cd /Users/theophilusogieva/Desktop/NexusTradeAI
npm list node-telegram-bot-api express axios
```

### No Telegram Alerts

**Problem:** Not receiving Telegram messages

**Solutions:**
```bash
# 1. Test Telegram directly
curl -X POST http://localhost:3006/test-telegram

# 2. Check Telegram settings in .env
grep TELEGRAM /Users/theophilusogieva/Desktop/NexusTradeAI/.env

# 3. Verify bot is enabled
# Should show:
# TELEGRAM_ALERTS_ENABLED=true

# 4. Start chat with bot
# In Telegram, search: @TheplusAi_bot
# Click START button
# Send any message
```

### Bot Not Trading

**Problem:** Bot running but no trades executed

**Possible Reasons:**

1. **Trading Not Started:**
   ```bash
   # Start trading
   curl -X POST http://localhost:3006/api/trading/start
   ```

2. **No Signals Found:**
   - Market may not have momentum opportunities
   - Check logs: `tail -f logs/crypto-bot.log`
   - Look for: "Found 0 signal(s)"

3. **BTC Bearish:**
   ```
   🔴 BTC is bearish - reducing altcoin exposure
   ```
   - Bot skips altcoins when BTC is down
   - Only trades BTC and ETH in this case

4. **Daily Limit Reached:**
   ```
   ❌ Daily trade limit reached (10/10)
   ```
   - Resets at midnight
   - Safety feature to prevent over-trading

5. **Position Limit:**
   ```
   ❌ Max positions reached (2/2)
   ```
   - Wait for current positions to close
   - Or increase `CRYPTO_MAX_POSITIONS` in .env

### API Errors

**Problem:** "Error fetching data for BTCUSDT"

**Solutions:**
```bash
# 1. Check testnet is accessible
ping testnet.binance.vision

# 2. Check API key permissions
# Login to https://testnet.binance.vision/
# Go to: API Management
# Verify: "Enable Spot Trading" is checked

# 3. Regenerate API keys
# Sometimes keys expire
# Create new ones and update .env

# 4. Check rate limits
# Testnet has limits (1200 requests/min)
# Bot should handle this automatically
```

### Performance Issues

**Problem:** Bot using too much memory

**Solutions:**
```bash
# 1. Check memory usage
curl http://localhost:3006/metrics | grep memory

# 2. Restart bot daily
# Add to crontab:
# 0 0 * * * lsof -ti :3006 | xargs kill -9 && node /path/to/unified-crypto-bot.js &

# 3. Clear price history periodically
# Bot automatically keeps last 100 candles
# No action needed
```

---

## Live Trading Checklist

⚠️ **CRITICAL:** Do NOT use real money until you complete ALL steps below!

### Phase 1: Testnet Validation (2-4 Weeks)

- [ ] **Week 1-2:** Run on Binance Testnet
  - [ ] 50+ trades executed successfully
  - [ ] No crashes or errors
  - [ ] Win rate >45%
  - [ ] Profit factor >1.2
  - [ ] Anti-churning working correctly

- [ ] **Week 3-4:** Extended Testing
  - [ ] 100+ trades total
  - [ ] Tested during high volatility (>20% BTC move)
  - [ ] Tested during low volume (weekends)
  - [ ] Telegram alerts working 100%
  - [ ] Position management verified

### Phase 2: Minimum Viable Performance

Check these metrics before going live:

| Metric | Minimum | Your Result |
|--------|---------|-------------|
| Total Trades | 100+ | ___ |
| Win Rate | >45% | ___% |
| Profit Factor | >1.2 | ___ |
| Max Drawdown | <20% | ___% |
| Uptime | >95% | ___% |
| Alert Success | 100% | ___% |

### Phase 3: Live Trading Setup

Only after passing Phase 1 & 2:

1. **Create Binance LIVE Account:**
   - https://www.binance.com/en/register
   - Complete KYC verification
   - Enable 2FA authentication

2. **Generate LIVE API Keys:**
   - API Management → Create API
   - **CRITICAL:** Enable IP Whitelist (your server IP)
   - Enable Spot Trading only
   - DISABLE withdrawals
   - Save keys securely

3. **Update .env for Live:**
   ```bash
   CRYPTO_TESTNET=false  # CHANGE THIS!
   CRYPTO_API_KEY=your_LIVE_api_key
   CRYPTO_API_SECRET=your_LIVE_api_secret

   # Start with tiny positions
   CRYPTO_BASE_POSITION_SIZE=100  # $100 only!
   CRYPTO_MAX_POSITION_SIZE=500   # Max $500
   ```

4. **Fund Account Conservatively:**
   - Start with $1,000 - $2,000 max
   - Use ONLY money you can afford to lose
   - Withdraw profits weekly

5. **Monitor Intensively:**
   - Check Telegram alerts multiple times/day
   - Review logs daily: `tail -f logs/crypto-bot.log`
   - Check Binance account for reconciliation
   - Monitor for 2 weeks before increasing size

### Phase 4: Gradual Scaling

If profitable after 2 weeks:

| Week | Capital | Position Size | Max Positions |
|------|---------|---------------|---------------|
| 1-2  | $1,000  | $100          | 2             |
| 3-4  | $2,000  | $200          | 2             |
| 5-6  | $5,000  | $500          | 2             |
| 7-8  | $10,000 | $1,000        | 3             |

**Never increase if:**
- ❌ Losing money
- ❌ Win rate <45%
- ❌ Profit factor <1.2
- ❌ Experiencing drawdown

---

## Advanced Configuration

### Modify Trading Parameters

Edit `unified-crypto-bot.js` if you want to customize:

**Change Crypto Pairs (Line 46):**
```javascript
symbols: [
    'BTCUSDT',  // Keep Bitcoin
    'ETHUSDT',  // Keep Ethereum
    'YOUR_FAVORITE_COIN_HERE'  // Add custom coins
],
```

**Adjust Momentum Thresholds (Line 70):**
```javascript
tier1: {
    momentumThreshold: 0.02,  // Change to 2% (more trades)
    stopLoss: 0.04,           // Change to 4% (tighter stop)
    profitTarget: 0.12        // Change to 12% (lower target)
}
```

**Change Scan Interval (Line 121):**
```javascript
scanInterval: 180000  // 3 minutes (180,000ms) instead of 5
```

---

## Summary

You now have a fully functional crypto trading bot!

**What You've Built:**
- ✅ 24/7 automated crypto trader
- ✅ BTC correlation strategy
- ✅ Multi-tier momentum system
- ✅ Risk management & anti-churning
- ✅ FREE Telegram alerts
- ✅ Testnet-ready (safe to experiment)

**Next Steps:**
1. Start the bot on Binance Testnet
2. Monitor for 2-4 weeks
3. Collect 100+ trades
4. Verify performance metrics
5. Only then consider live trading

**Critical Reminders:**
- ⚠️ **Crypto is HIGH RISK** - 10x more volatile than stocks
- ⚠️ **Start with testnet** - Practice with fake money first
- ⚠️ **Small positions** - $100-500 max when starting live
- ⚠️ **Monitor constantly** - 24/7 trading requires vigilance

---

## Support & Resources

**Documentation:**
- Bot Features: `BOT_FEATURES_COMPLETE.md`
- API Reference: `API_REFERENCE.md`
- Telegram Setup: `TELEGRAM_ALERTS_SETUP_GUIDE.md`
- Roadmap: `FUTURE_IMPLEMENTATION_ROADMAP.md`

**Exchange Resources:**
- Binance Testnet: https://testnet.binance.vision/
- Binance Live: https://www.binance.com/
- Binance API Docs: https://binance-docs.github.io/apidocs/

**Crypto Education:**
- BTC Correlation: 90% of altcoins follow Bitcoin
- Volatility: Crypto can move 10-50% in a day
- 24/7 Trading: No "after hours" - always active
- Risk Management: Never risk more than 2% per trade

---

**Good luck and trade safely!** 🚀💎

**Remember:** The goal is to make consistent small profits, not get rich quick. Patience and discipline are key to crypto trading success.
