# 🚀 NexusTradeAI - Quick Start Guide

## ⚡ Get Started in 5 Minutes

This guide will get your trading bot up and running quickly.

---

## Prerequisites

### Required Software

- ✅ **Node.js** (v16 or higher)
  ```bash
  node --version  # Should show v16.x or higher
  ```

- ✅ **npm** (comes with Node.js)
  ```bash
  npm --version
  ```

- ✅ **Alpaca Account** (free paper trading)
  - Sign up at: https://alpaca.markets
  - Get API keys from dashboard

### System Requirements

- **OS:** macOS, Linux, or Windows (WSL)
- **RAM:** 2GB minimum
- **Disk:** 500MB free space
- **Internet:** Stable connection required

---

## Step 1: Get Alpaca API Keys

1. **Sign up for Alpaca Markets**
   - Go to: https://alpaca.markets
   - Click "Sign Up" → "Paper Trading"
   - Complete registration (free)

2. **Generate API Keys**
   - Log in to Alpaca dashboard
   - Go to: Dashboard → Paper Trading → API Keys
   - Click "Generate New Key"
   - **Copy both:** API Key ID and Secret Key
   - **Important:** Save these securely!

3. **Verify Keys Work**
   ```bash
   curl -X GET "https://paper-api.alpaca.markets/v2/account" \
     -H "APCA-API-KEY-ID: YOUR_KEY_HERE" \
     -H "APCA-API-SECRET-KEY: YOUR_SECRET_HERE"
   ```
   - Should return account details (not 401 error)

---

## Step 2: Configure Environment

1. **Navigate to Project**
   ```bash
   cd ~/Desktop/NexusTradeAI
   ```

2. **Copy Environment Template**
   ```bash
   cp .env.example .env
   ```

3. **Edit .env File**
   ```bash
   nano .env
   # or use your preferred editor
   ```

4. **Add Your API Keys**
   ```bash
   # Alpaca API Credentials
   ALPACA_API_KEY=PK...your_key_here
   ALPACA_SECRET_KEY=...your_secret_here

   # API URLs (use paper trading first!)
   ALPACA_BASE_URL=https://paper-api.alpaca.markets
   ALPACA_DATA_URL=https://data.alpaca.markets
   ```

5. **Save and Exit**
   - Press `Ctrl+O` to save (in nano)
   - Press `Ctrl+X` to exit

6. **Verify Configuration**
   ```bash
   cat .env | grep ALPACA_API_KEY
   # Should show your key (first few characters)
   ```

---

## Step 3: Install Dependencies

1. **Install Backend Dependencies**
   ```bash
   cd ~/Desktop/NexusTradeAI/clients/bot-dashboard
   npm install
   ```

   **Expected packages:**
   - express (API server)
   - axios (HTTP client)
   - cors (API security)
   - dotenv (environment variables)

2. **Verify Installation**
   ```bash
   ls node_modules | wc -l
   # Should show 100+ packages installed
   ```

---

## Step 4: Start the Bot

### Option A: Start Both Services Together

1. **Terminal 1 - Start API Backend**
   ```bash
   cd ~/Desktop/NexusTradeAI/clients/bot-dashboard
   node unified-trading-bot.js > logs/unified-bot-protected.log 2>&1 &
   ```

2. **Terminal 2 - Start Dashboard Frontend**
   ```bash
   cd ~/Desktop/NexusTradeAI/clients/bot-dashboard
   npm run dev
   ```

3. **Verify Both Running**
   ```bash
   # Check API (port 3001)
   curl http://localhost:3001/health
   # Response: {"status":"ok","bot":"unified-trading-bot"}

   # Check Dashboard (port 3000)
   lsof -ti :3000
   # Should show a process ID
   ```

### Option B: Use Startup Script (if available)

```bash
cd ~/Desktop/NexusTradeAI
./START_BOT.sh
```

---

## Step 5: Access the Dashboard

1. **Open Browser**
   - Navigate to: **http://localhost:3000**

2. **What You Should See**
   ```
   ┌─────────────────────────────────────────┐
   │  NexusTradeAI Dashboard                 │
   ├─────────────────────────────────────────┤
   │  Account Overview:                      │
   │    Equity: $100,000.00                  │
   │    Today's P/L: $0.00                   │
   │    Status: Online ✅                    │
   │                                          │
   │  Active Positions: 0                    │
   │  Market Data: Real-time ✅              │
   │  AI Status: Online ✅                   │
   └─────────────────────────────────────────┘
   ```

3. **Verify Data Loading**
   - Account section shows your Alpaca paper account balance
   - Market Data shows "Real-time" (not "Disconnected")
   - AI Status shows "Online"
   - No error messages in browser console (F12)

---

## Step 6: Verify Bot is Trading

### Check Logs

```bash
tail -f ~/Desktop/NexusTradeAI/clients/bot-dashboard/logs/unified-bot-protected.log
```

**You should see:**
```
╔════════════════════════════════════════════════════════════╗
║          🚀 UNIFIED TRADING BOT - STARTED                  ║
╠════════════════════════════════════════════════════════════╣
║  API Port: 3001                                            ║
║  Dashboard: http://localhost:3000 (Vite frontend)         ║
║  Features:                                                 ║
║  ✅ Momentum Scanner (10%+ moves)                          ║
║  ✅ Trailing Stops (locks in 50% of gains)                 ║
║  ✅ Real Alpaca Integration                                ║
║  ✅ Auto position management                               ║
╚════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ Trading Loop - 9:30:15 AM

📊 Managing 0 positions...

🔍 Momentum Scan: Checking 135 stocks...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Test API Endpoints

**1. Check Account**
```bash
curl -s http://localhost:3001/api/accounts/summary | python3 -m json.tool
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "accountType": "paper",
    "equity": 100000.00,
    "cash": 100000.00,
    "buyingPower": 200000.00,
    "profitToday": 0.00,
    "totalProfit": 0.00
  }
}
```

**2. Check Trading Status**
```bash
curl -s http://localhost:3001/api/trading/status | python3 -m json.tool
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "positions": [],
    "performance": {
      "activePositions": 0,
      "totalTrades": 0,
      "winRate": 0,
      "totalPnL": 0
    }
  }
}
```

**3. Check Market Data**
```bash
curl -s http://localhost:3001/api/market/status | python3 -m json.tool
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "providers": { "alpaca": "connected" },
    "dataQuality": "Real-time"
  }
}
```

---

## Understanding the Bot Behavior

### Normal Operation

**Every 60 seconds, the bot:**
1. ✅ Scans 135 stocks for momentum (10%+ moves)
2. ✅ Checks existing positions for stop loss/profit target
3. ✅ Updates trailing stops on profitable positions
4. ✅ Executes new trades if opportunities found

**During Market Hours (9:30 AM - 4:00 PM EST):**
- Bot actively scans and trades
- You'll see "🚀 MOMENTUM SIGNAL" when it finds opportunities
- Positions will appear in dashboard

**Outside Market Hours:**
- Bot still runs but won't trade
- Scans will show no opportunities
- Existing positions held overnight (if any)

### First Trade Example

**When bot finds opportunity:**
```
🔍 Momentum Scan: Checking 135 stocks...
🚀 Found 1 momentum breakout!
   📈 TSLA: +12.50% (Vol: 1.5x)

🚀 MOMENTUM SIGNAL: TSLA at +12.50%
   Entry: $250.00
   Stop Loss: $232.50 (7% risk)
   Target: $300.00 (20% profit)
   Position Size: 40 shares ($10,000)

✅ Order executed: TSLA buy 40 shares @ $250.00
📊 Trade Stats: 1 total today, 1 on TSLA
```

**Dashboard will show:**
```
┌────────┬──────┬──────┬─────────┬─────────┬──────────┬────────┐
│ Symbol │ Side │ Qty  │ Entry   │ Current │ P&L $    │ P&L %  │
├────────┼──────┼──────┼─────────┼─────────┼──────────┼────────┤
│ TSLA   │ long │ 40   │ $250.00 │ $252.50 │ +$100.00 │ +1.00% │
└────────┴──────┴──────┴─────────┴─────────┴──────────┴────────┘
```

---

## Safety Features Enabled

Your bot has comprehensive protections:

### Anti-Churning Protection ✅

- **Max 15 trades per day** - Prevents excessive trading
- **Max 3 trades per symbol** - Stops churning on same stock
- **10-minute cooldown** - Between trades on same symbol
- **1-hour stop-out cooldown** - After hitting stop loss

**What This Means:**
If the bot buys and sells AAPL at a loss, it won't immediately buy AAPL again. It waits 1 hour, preventing the "churning bug" that caused previous losses.

### Progressive Trailing Stops ✅

- **+5% gain** → Stop raised to lock in 25% of gains
- **+10% gain** → Stop raised to lock in 50% of gains
- **+15% gain** → Stop raised to lock in 60% of gains
- **+18% gain** → Stop raised to lock in 70% of gains

**What This Means:**
If a stock goes from +15% to +19% then reverses, you'll keep +9% to +12.6% profit instead of falling back to the 7% stop loss.

### Risk Management ✅

- **1% risk per trade** - Protects your account
- **7% stop loss** - Limits losses on each position
- **20% profit target** - Conservative target
- **Max 10 positions** - Diversification
- **$10,000 max per position** - Position size limit

---

## What to Expect

### First Few Days

**Day 1:**
- Bot may not find any trades (normal if market is quiet)
- Or may take 1-3 positions if momentum opportunities exist
- Monitor logs to see what it's scanning

**Day 2-3:**
- Should see some positions opened
- Trailing stops may activate on profitable positions
- You'll see daily trade counts in logs

**Week 1:**
- Account may be slightly positive or negative (normal)
- Win rate should be around 50-70%
- Most important: No churning, no excessive trading

### Performance Expectations

**Realistic Expectations (Paper Trading):**
- **Daily Returns:** -1% to +3%
- **Win Rate:** 50-70%
- **Profit Factor:** 1.5-2.5
- **Max Positions:** 5-10 at a time
- **Trades per Day:** 2-8 (well under 15 limit)

**Red Flags (Stop and Debug):**
- More than 15 trades in a day
- Same symbol traded 4+ times in a day
- Account drops 5%+ in single day
- Multiple rapid stop losses on same stock

---

## Monitoring Your Bot

### Daily Check (5 minutes)

**Morning Routine:**
```bash
# 1. Verify bot is running
curl http://localhost:3001/health

# 2. Check account status
curl -s http://localhost:3001/api/accounts/summary | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f'Equity: \${d[\"equity\"]:,.2f}')
print(f'Today P/L: \${d[\"profitToday\"]:+,.2f}')
print(f'Total P/L: \${d[\"totalProfit\"]:+,.2f}')
"

# 3. Check active positions
curl -s http://localhost:3001/api/trading/status | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f'Active Positions: {d[\"performance\"][\"activePositions\"]}')
print(f'Trades Today: {d[\"performance\"][\"totalTrades\"]}')
"
```

**Expected Output:**
```
{"status":"ok","bot":"unified-trading-bot"}
Equity: $100,294.13
Today P/L: +$230.09
Total P/L: +$294.13
Active Positions: 7
Trades Today: 4
```

**View Dashboard:**
- Open: http://localhost:3000
- Quick glance at positions
- Check for any errors

### Weekly Review (30 minutes)

**Check Performance:**
```bash
# Review logs for the week
grep "Order executed" logs/unified-bot-protected.log | wc -l
# Count total trades

grep "STOP LOSS HIT" logs/unified-bot-protected.log | wc -l
# Count stop losses

grep "PROFIT TARGET HIT" logs/unified-bot-protected.log | wc -l
# Count profit targets
```

**Calculate Metrics:**
- Total trades
- Win rate = (Profit targets / Total trades)
- Stopped out count
- Average P/L per trade

**Review Anti-Churning:**
```bash
# Check for churning warnings
grep "⚠️" logs/unified-bot-protected.log | tail -20
```

**Should see:**
- Some "cooldown X mins remaining" (good - protection working)
- No rapid trades on same symbol
- Trade counts within limits

---

## Common Issues & Quick Fixes

### Issue 1: Dashboard Shows Blank Page

**Check:**
```bash
# Is frontend running?
lsof -ti :3000
```

**Fix:**
```bash
cd ~/Desktop/NexusTradeAI/clients/bot-dashboard
npm run dev
```

---

### Issue 2: API Not Responding

**Check:**
```bash
curl http://localhost:3001/health
```

**If error:**
```bash
# Restart API
cd ~/Desktop/NexusTradeAI/clients/bot-dashboard
lsof -ti :3001 | xargs kill -9 2>/dev/null
sleep 2
node unified-trading-bot.js > logs/unified-bot-protected.log 2>&1 &
```

---

### Issue 3: No Trades Happening

**Check Market Hours:**
```bash
date
# Market open? 9:30 AM - 4:00 PM EST
```

**Check Logs:**
```bash
tail -50 logs/unified-bot-protected.log
# Look for "Momentum Scan" messages
```

**This is Normal If:**
- Market is closed
- No stocks moving 10%+ today
- Already at max positions (10)
- Hit daily trade limit (15)

---

### Issue 4: Invalid API Credentials

**Error:**
```
401 Unauthorized
```

**Fix:**
```bash
# Check .env file
cat .env | grep ALPACA

# Verify keys in Alpaca dashboard
# Regenerate if needed
# Update .env file
# Restart bot
```

---

## Next Steps

### After Bot is Running Successfully

1. **Monitor for 1-2 Weeks**
   - Watch how it trades
   - Verify protections working
   - Check win rate and P/L

2. **Review Documentation**
   - Read: [BOT_FEATURES_COMPLETE.md](BOT_FEATURES_COMPLETE.md)
   - Understand: [ANTI_CHURNING_IMPLEMENTED.md](ANTI_CHURNING_IMPLEMENTED.md)
   - Learn from: [LOSS_DIAGNOSIS.md](LOSS_DIAGNOSIS.md)

3. **Customize Settings (Optional)**
   - Edit: [unified-trading-bot.js](clients/bot-dashboard/unified-trading-bot.js)
   - Adjust risk per trade (default 1%)
   - Change position limits (default 10)
   - Modify momentum threshold (default 10%)

4. **Consider Live Trading**
   - Only after 2-4 weeks of successful paper trading
   - Start with small account ($1,000-$5,000)
   - Update `.env` to use live API URL
   - Monitor very closely

---

## Support Resources

### Documentation Files

- **[BOT_FEATURES_COMPLETE.md](BOT_FEATURES_COMPLETE.md)** - Complete feature documentation
- **[ANTI_CHURNING_IMPLEMENTED.md](ANTI_CHURNING_IMPLEMENTED.md)** - Anti-churning details
- **[LOSS_DIAGNOSIS.md](LOSS_DIAGNOSIS.md)** - Churning bug analysis
- **[QUICK_START_GUIDE.md](QUICK_START_GUIDE.md)** - This guide

### Useful Commands

```bash
# Start bot
cd ~/Desktop/NexusTradeAI/clients/bot-dashboard
node unified-trading-bot.js > logs/unified-bot-protected.log 2>&1 &

# Stop bot
lsof -ti :3001 | xargs kill -9

# View logs
tail -f logs/unified-bot-protected.log

# Check health
curl http://localhost:3001/health

# Check positions
curl -s http://localhost:3001/api/trading/status | python3 -m json.tool

# Check account
curl -s http://localhost:3001/api/accounts/summary | python3 -m json.tool
```

---

## Troubleshooting Checklist

Before asking for help, check:

- [ ] Node.js installed (v16+)
- [ ] Dependencies installed (`npm install`)
- [ ] `.env` file exists with valid API keys
- [ ] API responding (`curl http://localhost:3001/health`)
- [ ] Dashboard accessible (http://localhost:3000)
- [ ] Logs showing trading loop (`tail logs/unified-bot-protected.log`)
- [ ] Market hours if expecting trades (9:30 AM - 4:00 PM EST)
- [ ] No duplicate bot processes running (`ps aux | grep unified-trading-bot`)

---

## Success Indicators

✅ **Your bot is working correctly if:**

1. Health check returns `{"status":"ok"}`
2. Dashboard loads without errors
3. Logs show "Trading Loop" every 60 seconds
4. Market data shows "Real-time"
5. Account data matches Alpaca dashboard
6. Positions appear when bot takes trades
7. No churning warnings in logs
8. Trade counts stay under daily limits
9. Trailing stops activate on profitable positions
10. Stop losses trigger when positions move against you

---

## Final Checklist

Before considering setup complete:

- [ ] ✅ Bot running on port 3001
- [ ] ✅ Dashboard accessible on port 3000
- [ ] ✅ API endpoints responding
- [ ] ✅ Alpaca credentials valid
- [ ] ✅ Logs showing trading loop
- [ ] ✅ Account data displaying correctly
- [ ] ✅ Market data connected
- [ ] ✅ No error messages in logs
- [ ] ✅ Anti-churning protections active
- [ ] ✅ Progressive trailing stops enabled

**If all checked:** 🎉 **Your bot is ready to trade!**

---

*Quick Start Guide Version: 1.0*
*Last Updated: December 6, 2025*
*Estimated Setup Time: 5-10 minutes*
