# Runbook: Low Win Rate

**Alert:** `LowWinRate`
**Severity:** Warning
**Threshold:** Win rate < 40% for 5 minutes

## Description

The trading strategy's win rate has dropped below 40%, indicating the strategy may be performing poorly or market conditions may have changed.

## Impact

- **Medium:** Strategy effectiveness degraded
- **Medium:** Losing more trades than expected
- **Low:** May lead to drawdown if not addressed
- **Info:** Early warning signal

## Investigation Steps

### 1. Check Current Win Rate and Sample Size

```bash
# Get current win rate and trade count
curl -s http://localhost:9091/metrics | grep -E "win_rate|trades_total"

# Or via API
curl -s http://localhost:3001/api/trading/status | jq '{win_rate, total_trades, winning_trades, losing_trades}'

# Check in database for detailed breakdown
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "
SELECT
    COUNT(*) as total_trades,
    COUNT(*) FILTER (WHERE pnl > 0) as wins,
    COUNT(*) FILTER (WHERE pnl < 0) as losses,
    ROUND(COUNT(*) FILTER (WHERE pnl > 0)::numeric / COUNT(*)::numeric * 100, 2) as win_rate,
    ROUND(AVG(pnl), 2) as avg_pnl,
    ROUND(AVG(pnl) FILTER (WHERE pnl > 0), 2) as avg_win,
    ROUND(AVG(pnl) FILTER (WHERE pnl < 0), 2) as avg_loss
FROM trades
WHERE entry_time > CURRENT_DATE
  AND status = 'closed';
"
```

**Important:** Win rate below 40% is only problematic if:
- Sample size > 20 trades (below 20, variance is too high)
- Average win is NOT significantly larger than average loss
- Profit factor < 1.0 (losing money overall)

### 2. Analyze by Strategy

```bash
# Break down by strategy
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "
SELECT
    strategy,
    COUNT(*) as trades,
    COUNT(*) FILTER (WHERE pnl > 0) as wins,
    ROUND(COUNT(*) FILTER (WHERE pnl > 0)::numeric / COUNT(*)::numeric * 100, 2) as win_rate,
    ROUND(SUM(pnl), 2) as total_pnl,
    ROUND(AVG(pnl), 2) as avg_pnl
FROM trades
WHERE entry_time > CURRENT_DATE - INTERVAL '7 days'
  AND status = 'closed'
GROUP BY strategy
ORDER BY total_pnl DESC;
"
```

**Question:** Is one specific strategy performing poorly, or all strategies?

### 3. Check Market Conditions

```bash
# Check VIX (volatility index) - if available
# High VIX (>30) = choppy markets = harder to trade

# Check SPY movement
# Large intraday swings = difficult environment

# Check if we're in a trending vs ranging market
# Momentum strategies work in trends, fail in ranges
```

### 4. Review Recent Losing Trades

```bash
# Get last 10 losing trades with details
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "
SELECT
    symbol,
    side,
    entry_price,
    exit_price,
    pnl,
    pnl_percent,
    exit_reason,
    strategy,
    entry_time
FROM trades
WHERE pnl < 0
  AND status = 'closed'
ORDER BY entry_time DESC
LIMIT 10;
"
```

**Look for patterns:**
- Same symbols losing repeatedly?
- Same exit reasons (stop loss vs profit target)?
- Same time of day?
- Common characteristics?

### 5. Check if Stops are Too Tight

```bash
# Analyze stop loss hit rate
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "
SELECT
    exit_reason,
    COUNT(*) as count,
    ROUND(AVG(pnl), 2) as avg_pnl
FROM trades
WHERE status = 'closed'
  AND entry_time > CURRENT_DATE - INTERVAL '7 days'
GROUP BY exit_reason;
"
```

**If > 60% of trades hitting stop loss:**
- Stops may be too tight
- Market too volatile for current stop levels
- Entry timing may be poor

## Resolution Steps

### Immediate Actions (if losing money)

```bash
# 1. Check if we're actually losing money
curl -s http://localhost:3001/api/trading/status | jq '.total_pnl'

# 2. If daily P&L < -$500:
# Consider stopping the bot until analysis complete
cd infrastructure
docker-compose stop trading-bot

# 3. If not losing money (low win rate but big wins):
# This is okay - trend following strategies often have 30-40% win rates
# but make it up with big wins
```

### Scenario Analysis

**Scenario A: Small Sample Size (< 20 trades)**
- **Action:** Keep monitoring, no changes needed yet
- **Reason:** Not statistically significant
- **Timeline:** Check again after 50 trades

**Scenario B: One Strategy Failing**
- **Action:** Disable that specific strategy
- **How:** Edit `services/trading/data/config.json`, set `enabled: false`
- **Timeline:** Investigate why strategy failing, fix or permanently disable

**Scenario C: All Strategies Failing**
- **Action:** Market conditions likely changed
- **Solutions:**
  1. Wait for better market conditions (if temporary)
  2. Adjust strategy parameters
  3. Add market regime filter
  4. Stop trading until analysis complete

**Scenario D: Low Win Rate but Profitable**
- **Action:** This is normal for trend-following strategies
- **Example:** 35% win rate, but avg win $150, avg loss $50 = profitable
- **No action needed** - this is the strategy working as designed

### Parameter Adjustments

If strategy needs tuning:

```bash
# Edit strategy config
nano services/trading/data/config.json

# Common adjustments for low win rate:

# 1. Tighter entry filters
{
  "momentumThreshold": 0.15,  // Increase from 0.10 (more selective)
  "minVolume": 2000000,        // Increase from 1000000 (more liquid)
  "rsiMin": 40,                // Add RSI filter
  "rsiMax": 80
}

# 2. Looser stops (if stops too tight)
{
  "stopLoss": 0.08,  // Increase from 0.07 (more room)
  "trailingStopPercent": 0.03  // More breathing room
}

# 3. Better profit targets
{
  "profitTarget": 0.25,  // Increase from 0.20 (bigger wins)
  "riskRewardRatio": 3.0  // Increase from 2.0
}

# 4. Restart bot after changes
cd infrastructure
docker-compose restart trading-bot
```

### Add Market Regime Filter

```javascript
// In unified-trading-bot.js, add market filter:

async function isGoodMarketCondition() {
    // Get SPY data
    const spy = await getQuote('SPY');

    // Check volatility
    const vix = await getQuote('VIX');
    if (vix.price > 30) {
        console.log('VIX too high, skipping trade');
        return false;
    }

    // Check trend
    const sma20 = await getSMA('SPY', 20);
    const sma50 = await getSMA('SPY', 50);

    if (sma20 < sma50) {
        console.log('Market in downtrend, reducing activity');
        return Math.random() < 0.3;  // Only 30% of signals
    }

    return true;
}

// Use before each trade:
if (!await isGoodMarketCondition()) {
    return;  // Skip trade
}
```

## Prevention

### 1. Implement Adaptive Position Sizing

```javascript
// Reduce position size when win rate is low:

function calculatePositionSize(baseSize, winRate) {
    if (winRate < 0.40) {
        return baseSize * 0.5;  // Half size
    } else if (winRate < 0.45) {
        return baseSize * 0.75;  // 3/4 size
    } else {
        return baseSize;  // Full size
    }
}
```

### 2. Add Strategy Validation

```javascript
// Check strategy performance every hour:

setInterval(async () => {
    const stats = await getStrategyStats();

    for (const [strategy, stat] of Object.entries(stats)) {
        if (stat.trades > 20 && stat.winRate < 0.35 && stat.profitFactor < 1.0) {
            console.warn(`Strategy ${strategy} performing poorly:`, stat);
            // Disable strategy or reduce allocation
            disableStrategy(strategy);
        }
    }
}, 3600000);  // Every hour
```

### 3. Implement Walk-Forward Optimization

```bash
# Periodically re-optimize strategy parameters
# Use last 60 days for optimization
# Test on last 30 days
# If profitable, update parameters
# If not, revert or disable

# This is Phase 2 work (Strategy Development)
```

### 4. Add Statistical Significance Check

```javascript
// Don't act on small sample sizes:

function isStatisticallySignificant(winRate, sampleSize) {
    if (sampleSize < 20) return false;

    // Calculate standard error
    const p = winRate / 100;
    const se = Math.sqrt(p * (1 - p) / sampleSize);

    // 95% confidence interval
    const ci = 1.96 * se * 100;

    // If lower bound of CI < 40%, it's significant
    return (winRate - ci) < 40;
}
```

## False Positive Scenarios

- **Small sample size:** < 20 trades, variance too high
- **Streak of bad luck:** Random variance, will revert to mean
- **Market condition mismatch:** Trend strategy in ranging market (temporary)
- **Start of day:** First few trades don't represent full day

**To avoid false positives:**
- Wait for at least 30 trades before taking action
- Check if profit factor > 1.0 (even with low win rate, can be profitable)
- Verify across multiple strategies

## Escalation

Escalate if:
- Win rate < 30% for > 50 trades
- Profit factor < 0.8 (losing money)
- Daily loss approaching -$1000
- Multiple strategies failing simultaneously

**Escalation Actions:**
- Stop all trading
- Comprehensive strategy review
- Backtest on recent data
- Consider fundamental strategy redesign (Phase 2)

## Post-Incident

### Analysis Required:

1. **Was it random variance or real problem?**
   - If random: Resume trading
   - If real: Fix strategy

2. **What changed?**
   - Market regime shift?
   - News event?
   - Volatility change?
   - Sector rotation?

3. **How to prevent?**
   - Better market filters
   - Adaptive parameters
   - Multiple strategies (diversification)

### Documentation:

```
Date: YYYY-MM-DD
Win Rate: XX%
Sample Size: N trades
Profit Factor: X.XX
Root Cause: [specific reason]
Action Taken: [parameter changes, strategy disabled, etc.]
Outcome: [improvement or continued monitoring]
```

## Understanding Win Rate

**Important Concept:**

Win rate alone doesn't determine profitability. What matters is:

```
Profit Factor = Total Profit / Total Loss

Profitability = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)
```

**Examples:**

**Profitable with 35% win rate:**
- Win Rate: 35%
- Avg Win: $200
- Avg Loss: $70
- Profitability: (0.35 × $200) - (0.65 × $70) = $70 - $45.50 = +$24.50 per trade ✅

**Unprofitable with 55% win rate:**
- Win Rate: 55%
- Avg Win: $50
- Avg Loss: $60
- Profitability: (0.55 × $50) - (0.45 × $60) = $27.50 - $27 = +$0.50 per trade ⚠️

**Conclusion:** Focus on profit factor and total P&L, not just win rate!

## Related Alerts

- `NegativePnL` - Often follows low win rate
- `HighDrawdown` - Can result from low win rate
- `HighSlippage` - May cause win rate to drop

## References

- Strategy Config: `services/trading/data/config.json`
- Bot Code: `clients/bot-dashboard/unified-trading-bot.js`
- Performance Metrics: http://localhost:3030 (Trading Performance dashboard)
- Trades Query: Database `trades` table
- Commercial Roadmap: `COMMERCIAL_GRADE_ROADMAP.md` Phase 2 (Strategy Development)

---

**Remember:** Low win rate is only a problem if you're losing money. Trend-following strategies commonly have 30-40% win rates but are profitable due to asymmetric risk/reward.
