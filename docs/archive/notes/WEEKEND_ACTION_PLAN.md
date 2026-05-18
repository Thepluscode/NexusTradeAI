# Weekend Action Plan - Get Ready for Monday

**Goal:** Prepare for your first day with the Opening Range Breakout bot

---

## TODAY - Friday, December 27 (RIGHT NOW)

### ☐ Task 1: Read the Main Guide (15 minutes)
```bash
# Open this file:
open /Users/theophilusogieva/Desktop/NexusTradeAI/NEW_STRATEGY_IMPLEMENTED.md
```

**What to focus on:**
- Your new edge (Opening Range Breakout)
- The 3 simple rules
- What to expect Monday morning
- How to log trades

---

### ☐ Task 2: Understand the Options (10 minutes)
```bash
# Open this file:
open /Users/theophilusogieva/Desktop/NexusTradeAI/PROVEN_EDGE_OPTIONS.md
```

**What to focus on:**
- Why I chose ORB for you
- Expected performance (52-58% win rate)
- Comparison with other strategies

---

### ☐ Task 3: Test the Start Script (5 minutes)
```bash
# Go to project directory
cd /Users/theophilusogieva/Desktop/NexusTradeAI

# Run the start script
./START_ORB_BOT.sh

# You should see:
# ✅ ORB BOT STARTED SUCCESSFULLY!

# Watch logs for 2 minutes
tail -f clients/bot-dashboard/logs/orb-bot.log

# You'll see: "⏸️  Market is closed" (normal on weekends)

# Press Ctrl+C to stop watching logs
```

---

### ☐ Task 4: Verify Bot is Running (2 minutes)
```bash
# Check health
curl http://localhost:3002/health

# Should return:
# {
#   "status": "ok",
#   "bot": "orb-trading-bot",
#   "strategy": "Opening Range Breakout"
# }

# Check if process is running
lsof -i :3002

# Should show node process
```

---

### ☐ Task 5: Prepare Your Trade Log (3 minutes)
```bash
# Open the CSV file
open /Users/theophilusogieva/Desktop/NexusTradeAI/STOCK_BOT_PERFORMANCE_TRACKER.csv

# You should see header row + XLP position from old bot
# You'll add new trades starting Monday
```

**Create a bookmark/shortcut to this file!**

---

## SATURDAY - December 28

### ☐ Task 6: Stop and Restart Bot (Practice)
```bash
# Stop the bot
lsof -ti :3002 | xargs kill -9

# Wait 5 seconds
sleep 5

# Restart bot
./START_ORB_BOT.sh

# Verify it's running
curl http://localhost:3002/health
```

**Why practice?** You might need to restart it Monday if something goes wrong.

---

### ☐ Task 7: Read the Bot Code (20 minutes - OPTIONAL)
```bash
# Open the bot code
open clients/bot-dashboard/orb-trading-bot.js

# Or use your favorite editor:
code clients/bot-dashboard/orb-trading-bot.js
```

**What to look for:**
- Lines 46-56: ORB configuration (profit target 2%, stop loss 1.5%)
- Lines 59-72: Symbols list (SPY, QQQ, AAPL, etc.)
- Lines 209-255: Breakout detection logic
- Lines 339-403: Position management and exits

**Don't change anything!** Just understand how it works.

---

### ☐ Task 8: Review 30-Day Challenge (10 minutes)
```bash
# Open challenge document
open /Users/theophilusogieva/Desktop/NexusTradeAI/30_DAY_STOCK_BOT_CHALLENGE.md
```

**What to focus on:**
- Week 1 goals (10 trades, >40% win rate)
- How to calculate win rate
- Red flags that mean STOP
- Weekly check-in questions

---

## SUNDAY - December 29

### ☐ Task 9: Prepare Your Workspace (5 minutes)

**Open these windows/tabs:**
1. Terminal with logs:
   ```bash
   cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard
   tail -f logs/orb-bot.log
   ```

2. CSV file:
   ```bash
   open /Users/theophilusogieva/Desktop/NexusTradeAI/STOCK_BOT_PERFORMANCE_TRACKER.csv
   ```

3. Dashboard (if you want visual):
   - Start frontend: `cd clients/bot-dashboard && npm run dev`
   - Open: http://localhost:3000

**Save this workspace setup!**

---

### ☐ Task 10: Set Reminders (2 minutes)

**Set phone alarms for Monday:**
- 9:15 AM: "Start ORB bot before market opens"
- 9:45 AM: "Opening ranges built - watch for breakouts"
- 3:55 PM: "All positions will close - prepare to log trades"
- 4:15 PM: "Log all closed trades in CSV"

---

### ☐ Task 11: Final Bot Check (3 minutes)
```bash
# Stop bot (clean slate for Monday)
lsof -ti :3002 | xargs kill -9

# Verify it stopped
lsof -i :3002
# Should return nothing

# You'll restart it Monday morning
```

---

## MONDAY MORNING - December 30 (GAME DAY)

### ☐ Task 12: Start Bot (9:15 AM)
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI
./START_ORB_BOT.sh
```

**Verify it started:**
```bash
curl http://localhost:3002/health
```

---

### ☐ Task 13: Watch Opening Range Building (9:30-9:45 AM)
```bash
tail -f clients/bot-dashboard/logs/orb-bot.log
```

**You should see:**
```
🌅 OPENING RANGE PERIOD (9:30-9:45 AM)
📊 Building opening ranges for 13 symbols...
   ✅ SPY: Range $575.20 - $576.80 (Vol: 2.3M)
   ✅ AAPL: Range $195.40 - $196.10 (Vol: 1.1M)
   ...
✅ Opening ranges built for 13 symbols
```

**What this means:** Bot has recorded the high/low of first 15 minutes for each stock.

---

### ☐ Task 14: Monitor for Breakouts (9:45 AM - 3:55 PM)

**Keep logs open:**
```bash
tail -f clients/bot-dashboard/logs/orb-bot.log
```

**If you see breakout:**
```
🚨 BREAKOUT: AAPL
   💰 Current: $196.35
   📊 OR High: $196.10
   📈 Breakout: $196.20
   📊 Volume: 2.3x average

💼 EXECUTING TRADE: AAPL
   ✅ ORDER PLACED: 50 shares of AAPL @ $196.35
```

**Write down:**
- Time: ____
- Symbol: ____
- Entry Price: ____
- Shares: ____

---

### ☐ Task 15: Watch for Exits (Throughout Day)

**You'll see one of three exit types:**

**1. Profit Target (+2%):**
```
🚪 CLOSING POSITION: AAPL - Profit Target Hit (+2.0%)
✅ POSITION CLOSED: AAPL
   Entry: $196.35
   Exit: $200.27
   P/L: +2.0%
```

**2. Stop Loss (-1.5%):**
```
🚪 CLOSING POSITION: NVDA - Stop Loss Hit (-1.5%)
✅ POSITION CLOSED: NVDA
   Entry: $502.10
   Exit: $494.57
   P/L: -1.5%
```

**3. End of Day (3:55 PM):**
```
🚪 CLOSING POSITION: SPY - End of Day Exit (+0.8%)
✅ POSITION CLOSED: SPY
   Entry: $575.80
   Exit: $580.40
   P/L: +0.8%
```

---

### ☐ Task 16: Log ALL Trades (4:00-4:30 PM)

**Open CSV file:**
```bash
open /Users/theophilusogieva/Desktop/NexusTradeAI/STOCK_BOT_PERFORMANCE_TRACKER.csv
```

**For EACH trade that closed, add a row:**
```csv
Date,Symbol,Direction,Entry_Price,Exit_Price,Shares,Entry_Time,Exit_Time,Hold_Duration_Hours,PnL_Percent,PnL_Dollars,Win_Loss,Exit_Reason,Notes

2025-12-30,AAPL,LONG,196.35,200.27,50,2025-12-30 10:15,2025-12-30 14:30,4.25,2.0,196.00,WIN,Profit Target,ORB breakout above 196.10
```

**Calculate:**
- Hold_Duration_Hours = (Exit_Time - Entry_Time) in hours
- PnL_Percent = ((Exit_Price - Entry_Price) / Entry_Price) × 100
- PnL_Dollars = (Exit_Price - Entry_Price) × Shares
- Win_Loss = "WIN" if PnL > 0, "LOSS" if PnL < 0

---

### ☐ Task 17: Calculate Day 1 Stats (4:30 PM)

**Count your trades:**
- Total trades today: ____
- Winning trades: ____
- Losing trades: ____

**Calculate win rate:**
```
Win Rate = (Winning Trades / Total Trades) × 100
```

**Example:**
- 3 trades total
- 2 wins, 1 loss
- Win rate = (2 / 3) × 100 = 66.7%

**Write it down in** `30_DAY_STOCK_BOT_CHALLENGE.md` **under Week 1 Notes**

---

## Week 1 Goal Tracker

| Day | Trades | Wins | Losses | Win Rate | Notes |
|-----|--------|------|--------|----------|-------|
| Mon 12/30 | ___ | ___ | ___ | ___% | _____ |
| Tue 12/31 | ___ | ___ | ___ | ___% | _____ |
| Wed 01/01 | 0 | 0 | 0 | N/A | Market closed (holiday) |
| Thu 01/02 | ___ | ___ | ___ | ___% | _____ |
| Fri 01/03 | ___ | ___ | ___ | ___% | _____ |
| **TOTAL** | **10+** | **___** | **___** | **>40%** | **GOAL** |

---

## Success Checklist (End of Week 1)

### ☐ Minimum Requirements:
- [ ] 10+ trades executed
- [ ] All trades logged in CSV
- [ ] Win rate calculated
- [ ] Win rate >40%
- [ ] No red flags encountered

### ☐ Update Challenge Document:
```bash
open /Users/theophilusogieva/Desktop/NexusTradeAI/30_DAY_STOCK_BOT_CHALLENGE.md

# Fill in Week 1 Baseline section:
- Total Trades: ___
- Win Rate: ___%
- Profit Factor: ___
- Net P/L: $___
```

### ☐ Decision Point:
- If win rate >40%: ✅ Continue to Week 2
- If win rate 30-40%: ⚠️ Analyze why, consider adjustments
- If win rate <30%: 🚨 STOP, strategy might not work

---

## Red Flags - STOP Immediately If:

- 🚨 Win rate <30% after 10 trades
- 🚨 5 consecutive losing trades
- 🚨 Bot takes 20+ trades in one day (anti-churning failed)
- 🚨 Positions not closing at 3:55 PM
- 🚨 Bot crashes repeatedly
- 🚨 You don't understand why trades won/lost

**If any red flag appears:** STOP, review logs, and analyze what went wrong.

---

## Quick Reference Commands

```bash
# Start bot
cd /Users/theophilusogieva/Desktop/NexusTradeAI
./START_ORB_BOT.sh

# Watch logs
tail -f clients/bot-dashboard/logs/orb-bot.log

# Check health
curl http://localhost:3002/health

# Check status
curl -s http://localhost:3002/api/trading/status | python3 -m json.tool

# Stop bot
lsof -ti :3002 | xargs kill -9

# Open CSV
open STOCK_BOT_PERFORMANCE_TRACKER.csv

# Open challenge doc
open 30_DAY_STOCK_BOT_CHALLENGE.md
```

---

## The Commitment (Sign Here)

**I commit to:**
- [ ] Starting the bot Monday at 9:15 AM
- [ ] NOT touching the code for 30 days
- [ ] Logging EVERY trade immediately when it closes
- [ ] Calculating win rate daily
- [ ] Making honest GO/NO-GO decision after Week 1

**Signature:** ___________________ **Date:** ___________

---

## Final Reminders

**This Weekend:**
1. Read guides
2. Test start script
3. Prepare workspace
4. Set reminders

**Monday:**
1. Start bot 9:15 AM
2. Watch opening ranges 9:30-9:45 AM
3. Monitor breakouts 9:45 AM-3:55 PM
4. Log trades 4:00-4:30 PM

**Week 1 Goal:**
10 trades, >40% win rate, all logged

**Remember:**
- You have a PROVEN edge now (ORB)
- You have SIMPLE rules (3 only)
- You have a CLEAR plan (30-day challenge)
- You have EVERYTHING you need

**Now EXECUTE.**

---

**Questions?**
Read `NEW_STRATEGY_IMPLEMENTED.md` - answers everything.

**Confused?**
Read `WHAT_CHANGED_SUMMARY.md` - shows before/after.

**Need details?**
Read `PROVEN_EDGE_OPTIONS.md` - explains the edge.

**Ready?**
Start Monday. Let's prove it works. 🚀
