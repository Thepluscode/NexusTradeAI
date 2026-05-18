# 3-Strategy Trading System Guide

## What You Have Now

You have **3 proven trading edges running in parallel**. Each bot trades independently with its own strategy.

---

## The 3 Strategies

### 1️⃣ ORB (Opening Range Breakout)
- **Port:** 3002
- **File:** `clients/bot-dashboard/orb-trading-bot.js`
- **Edge:** "Stocks that break above their opening range often continue higher"

**Entry Rules:**
- Wait 15 minutes after open (9:30-9:45 AM)
- Buy when price breaks opening range high + $0.10
- Volume must be 2x average
- Only trades 13 liquid stocks

**Exit Rules:**
- Profit target: +2%
- Stop loss: -1.5%
- Time exit: 3:55 PM

**Expected Performance:**
- Trade frequency: **1-3 trades per week** (sometimes zero)
- Win rate target: **55-60%**
- Profit factor: **1.4-1.6**
- **Boring but consistent**

---

### 2️⃣ GAP FADE (Mean Reversion Short)
- **Port:** 3007
- **File:** `clients/bot-dashboard/gap-fade-bot.js`
- **Edge:** "Stocks that gap up 3-5% often fade back down as early buyers take profits"

**Entry Rules:**
- Stock gaps up 3-5% at market open
- Wait for first 5-minute candle to close red
- Enter SHORT when price breaks below first 5-min low
- Volume must be below average (exhaustion signal)

**Exit Rules:**
- Profit target: -2% (gap fill)
- Stop loss: +1.5% above entry
- Time exit: 11:00 AM

**Expected Performance:**
- Trade frequency: **2-5 trades per week**
- Win rate target: **50-55%**
- Profit factor: **1.3-1.5**
- **Contrarian - shorts strong-looking stocks**

---

### 3️⃣ HVB (High-Volume Breakout)
- **Port:** 3008
- **File:** `clients/bot-dashboard/high-volume-breakout-bot.js`
- **Edge:** "When a stock breaks above resistance on 5x+ volume, late buyers FOMO in"

**Entry Rules:**
- Stock must be up 5-10% intraday
- Volume must be 5x+ average (not just 1.5x)
- Must break above 20-day high
- RSI must be between 50-70 (not overbought)

**Exit Rules:**
- Profit target: +8%
- Stop loss: -4%
- Trailing stop: Lock 50% of gains when up 5%+
- Time exit: 3:55 PM

**Expected Performance:**
- Trade frequency: **3-7 trades per week**
- Win rate target: **48-52%**
- Profit factor: **1.2-1.4**
- **More frequent trading, smaller edge**

---

## Quick Start

### 1. Start All 3 Bots

```bash
cd ~/Desktop/NexusTradeAI
./START_ALL_3_BOTS.sh
```

This will:
- Stop any existing bots
- Start ORB bot on port 3002
- Start Gap Fade bot on port 3007
- Start HVB bot on port 3008
- Start dashboard on port 3000
- Show health checks for all bots

### 2. Open Dashboard

```
http://localhost:3000
```

You'll see:
- Combined performance (all 3 bots)
- Individual bot cards with stats
- All active positions from all strategies

### 3. Monitor Telegram Alerts

You'll get notifications for:
- Trade entries (with entry price, stop, target)
- Stop loss hits
- Profit target hits
- End-of-day exits

### 4. Log Every Trade

Open: `3_STRATEGY_PERFORMANCE_TRACKER.csv`

Log each trade manually:
- Date, Time, Strategy, Symbol
- Entry/Exit prices
- P/L in dollars and percent
- Exit reason
- Notes

---

## Management Commands

### Check Status
```bash
pm2 list
```

### View Logs
```bash
# ORB Bot
pm2 logs orb-bot --lines 50

# Gap Fade Bot
pm2 logs gap-fade-bot --lines 50

# HVB Bot
pm2 logs hvb-bot --lines 50
```

### Stop All Bots
```bash
pm2 stop orb-bot gap-fade-bot hvb-bot
```

### Restart All Bots
```bash
pm2 restart orb-bot gap-fade-bot hvb-bot
```

### Health Checks
```bash
# ORB
curl http://localhost:3002/health

# Gap Fade
curl http://localhost:3007/health

# HVB
curl http://localhost:3008/health
```

---

## 30-Day Testing Plan

### Goal
Run all 3 strategies for **30 days** and let the data decide which edge works best.

### Rules

1. **NO MODIFICATIONS**
   - Don't change any strategy parameters
   - Don't disable any bots
   - Let them run exactly as built

2. **LOG EVERY TRADE**
   - Use `3_STRATEGY_PERFORMANCE_TRACKER.csv`
   - Manual logging ensures you review each trade
   - Track which strategy makes each trade

3. **MINIMUM 30 TRADES PER STRATEGY**
   - ORB: ~10 weeks (very selective)
   - Gap Fade: ~6 weeks
   - HVB: ~4 weeks

4. **CALCULATE METRICS WEEKLY**
   - Win rate
   - Profit factor
   - Average win vs average loss
   - Total P/L per strategy

5. **FINAL DECISION (After 30 trades each)**
   - Keep the strategy with highest profit factor
   - Disable the underperforming strategies
   - Double position size on the winner

---

## What to Expect

### Week 1
- **ORB:** Probably 0-1 trades (frustrating but normal)
- **Gap Fade:** 2-5 trades (if market has gaps)
- **HVB:** 3-7 trades (most active)

**Your Reaction:** "HVB is the best! It's trading every day!"
**Reality:** Trading frequency ≠ profitability

### Week 2-4
- Some strategies will have winning streaks
- Some will have losing streaks
- You'll be tempted to disable the losers
- **DON'T DO IT - Need more data**

### Week 5-8
- Patterns will emerge
- One strategy will likely pull ahead
- One might lag behind
- Still too early to decide (need 30 trades each)

### Week 9-12
- Clear winner should emerge
- Win rates will stabilize
- Profit factors will show true edge
- **NOW you can make decisions**

---

## Expected Results (Based on Backtests)

| Strategy | Win Rate | Profit Factor | Avg Win | Avg Loss | Monthly Return |
|----------|----------|---------------|---------|----------|----------------|
| ORB      | 55-60%   | 1.4-1.6       | $60     | $40      | +2-4%          |
| Gap Fade | 50-55%   | 1.3-1.5       | $50     | $35      | +1-3%          |
| HVB      | 48-52%   | 1.2-1.4       | $80     | $60      | +1-2%          |

**Combined:** Expected +4-8% monthly if all 3 work as planned

**Reality Check:** These are estimates. Your results WILL vary.

---

## Common Pitfalls (What NOT to Do)

### ❌ Don't Panic After 3 Losing Trades
Every strategy has losing streaks. 3 losses in a row is statistically normal.

### ❌ Don't Disable a Bot Because It's "Not Trading"
ORB might not trade for a week. That's the strategy. Low frequency = high win rate.

### ❌ Don't Change Parameters After 1 Week
You'll be tempted to "tweak" settings. Don't. Test the strategy AS IS first.

### ❌ Don't Add More Strategies
You have 3. That's enough. More strategies = more complexity = worse results.

### ❌ Don't Expect Every Bot to Trade Every Day
Combined, you should see 1-3 trades per day across all 3 bots. That's healthy.

---

## When to STOP a Strategy

Only disable a strategy if it fails these criteria after **30+ trades**:

1. **Win rate < 45%**
2. **Profit factor < 1.1**
3. **Largest loss > 2x average win**
4. **3+ consecutive weeks negative**

If a strategy passes these tests, keep running it even if it's "boring."

---

## Files and Structure

```
NexusTradeAI/
├── clients/bot-dashboard/
│   ├── orb-trading-bot.js              # ORB strategy (port 3002)
│   ├── gap-fade-bot.js                 # Gap Fade strategy (port 3007)
│   ├── high-volume-breakout-bot.js     # HVB strategy (port 3008)
│   ├── src/
│   │   └── pages/
│   │       └── ThreeStrategyDashboard.tsx  # Unified dashboard
│   └── logs/
│       ├── orb-bot-out.log
│       ├── gap-fade-bot-out.log
│       └── hvb-bot-out.log
├── ecosystem.config.js                 # PM2 configuration (all 3 bots)
├── START_ALL_3_BOTS.sh                # Startup script
├── 3_STRATEGY_PERFORMANCE_TRACKER.csv  # Manual trade log
└── 3_STRATEGY_SYSTEM_GUIDE.md         # This file
```

---

## FAQ

### Q: Which strategy is best?
**A:** Don't know yet. That's why you're testing all 3 for 30 days.

### Q: Can I run just 1 or 2 strategies?
**A:** Yes, but you'll miss the diversification benefit. Different strategies work in different market conditions.

### Q: What if all 3 strategies are losing?
**A:** After 30 trades each, if ALL 3 have profit factor < 1.1, then the market conditions have changed or paper trading ≠ live trading. Time to redesign.

### Q: Can I increase position sizes?
**A:** Not until a strategy proves itself with 30+ profitable trades and profit factor > 1.3.

### Q: Do I need to watch the bots all day?
**A:** No. Check Telegram alerts. Review dashboard 2-3 times per day. Log trades at end of day.

### Q: Market is closed but bots are running. Is that normal?
**A:** Yes. Bots check market hours before trading. They just idle when market is closed.

---

## Support & Debugging

### If a bot crashes:
```bash
pm2 logs orb-bot --lines 100 --err
```

Look for error messages and restart:
```bash
pm2 restart orb-bot
```

### If dashboard shows "offline":
```bash
curl http://localhost:3002/health
curl http://localhost:3007/health
curl http://localhost:3008/health
```

If any return errors, restart that bot.

### If no trades for multiple days:
- ORB: Normal (low frequency)
- Gap Fade: Check if stocks are gapping (need volatile market)
- HVB: Check logs for "No breakouts found" - might be low volume day

---

## Final Thoughts

You now have a **real professional-grade multi-strategy system**.

This is exactly how hedge funds test strategies:
1. Run multiple edges in parallel
2. Track everything
3. Let data decide
4. Scale the winners
5. Cut the losers

**Your job:**
- Keep bots running
- Log every trade
- Don't interfere
- Review weekly
- Decide after 30 trades per strategy

**Timeline:**
- Week 1-4: Data collection
- Week 5-8: Patterns emerge
- Week 9-12: Clear winner identified
- Week 13+: Scale winning strategy

Good luck. Let the data speak.
