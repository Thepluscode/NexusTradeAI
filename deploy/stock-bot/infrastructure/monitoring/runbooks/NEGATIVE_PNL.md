# Runbook: Negative P&L

**Alert:** `NegativePnL`
**Severity:** Critical
**Threshold:** Total P&L < -$1000 for 1 minute

## Description

The trading bot has lost more than the daily loss limit ($1,000). This is a critical risk management breach that requires immediate action to prevent further losses.

## Impact

- **CRITICAL:** Daily loss limit breached
- **Financial:** Real monetary loss (even in paper trading, tracks real market conditions)
- **Strategy:** Indicates strategy may be failing

## Investigation Steps

### 1. Check Current P&L

```bash
# Get detailed P&L breakdown
curl -s http://localhost:3001/api/trading/status | python3 -m json.tool

# Check specific positions
curl -s http://localhost:3001/api/trading/status | jq '.positions'

# View in Grafana
# http://localhost:3030 > Trading Performance dashboard
```

### 2. Identify Losing Positions

```bash
# Query database for worst performers
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "
SELECT
    symbol,
    side,
    quantity,
    average_entry_price,
    current_price,
    unrealized_pnl,
    strategy
FROM positions
WHERE status = 'open' AND unrealized_pnl < 0
ORDER BY unrealized_pnl ASC
LIMIT 10;
"
```

### 3. Analyze Trading Activity

```bash
# Check trades in last hour
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "
SELECT
    symbol,
    side,
    entry_price,
    exit_price,
    pnl,
    strategy,
    entry_time
FROM trades
WHERE entry_time > NOW() - INTERVAL '1 hour'
ORDER BY pnl ASC;
"

# Check if over-trading (churning)
curl -s http://localhost:3001/api/trading/status | jq '.totalTradesToday'
```

### 4. Check Market Conditions

```bash
# Check if market is volatile/crashing
curl -s "https://api.polygon.io/v2/aggs/ticker/SPY/range/1/minute/$(date -u -d '1 hour ago' +%Y-%m-%d)/$(date -u +%Y-%m-%d)?apiKey=$POLYGON_API_KEY"

# Check VIX (volatility index) if available
# High VIX (>30) = dangerous market conditions
```

## Resolution Steps

### IMMEDIATE ACTIONS (Required)

```bash
# 1. STOP ALL NEW TRADES
# Set emergency stop flag
curl -X POST http://localhost:3002/api/emergency-stop

# OR manually stop the bot
cd infrastructure
docker-compose stop trading-bot

# 2. CLOSE ALL LOSING POSITIONS (if loss > -$1500)
# Use emergency liquidation endpoint
curl -X POST http://localhost:3002/api/liquidate-all \
  -H "Content-Type: application/json" \
  -d '{"reason": "emergency_stop", "max_loss": -1500}'

# 3. DOCUMENT THE INCIDENT
# Create incident report
cat > /tmp/incident-$(date +%Y%m%d-%H%M%S).txt <<EOF
Timestamp: $(date)
Total P&L: $(curl -s http://localhost:3001/api/trading/status | jq '.totalPnL')
Positions: $(curl -s http://localhost:3001/api/trading/status | jq '.activePositions')
Trades Today: $(curl -s http://localhost:3001/api/trading/status | jq '.totalTradesToday')
Market Conditions: [Add VIX, SPY movement, news]
EOF
```

### Analysis & Root Cause

After stopping losses, investigate:

```bash
# 1. Check if strategy parameters need adjustment
cat services/trading/data/config.json

# 2. Review strategy performance
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "
SELECT
    strategy,
    COUNT(*) as total_trades,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses,
    SUM(pnl) as total_pnl,
    AVG(pnl) as avg_pnl
FROM trades
WHERE entry_time > CURRENT_DATE
GROUP BY strategy;
"

# 3. Check for anomalies
# - Are stops being honored?
# - Is there slippage on exits?
# - Are there execution delays?

# 4. Review market conditions
# - Is this a trending vs ranging market mismatch?
# - Is volatility too high for strategy?
# - Are there major news events?
```

### Recovery Steps

```bash
# 1. Backup all data
./infrastructure/scripts/backup.sh backup

# 2. Reset daily counters (new trading day)
curl -X POST http://localhost:3002/api/reset-daily

# 3. Adjust strategy parameters (if needed)
# Edit config.json:
nano services/trading/data/config.json

# Example adjustments:
# - Increase stopLoss from 7% to 5% (tighter stops)
# - Decrease positionSize from $2000 to $1000 (smaller risk)
# - Increase momentumThreshold from 10% to 15% (be more selective)

# 4. Restart bot with conservative mode
cd infrastructure
docker-compose up -d trading-bot

# 5. Monitor closely for 2 hours
watch -n 60 './infrastructure/scripts/health-check.sh'
```

## Prevention

### 1. Implement Stricter Risk Controls

```javascript
// In unified-trading-bot.js, add:

const RISK_CONTROLS = {
  MAX_DAILY_LOSS: -1000,      // Stop trading if hit
  MAX_POSITION_LOSS: -200,    // Close position if hit
  MAX_CONSECUTIVE_LOSSES: 3,  // Stop after 3 losses in a row
  MAX_DRAWDOWN_PERCENT: 15,   // Stop if portfolio down 15%
};

// Add check before every trade:
if (accountLoss < RISK_CONTROLS.MAX_DAILY_LOSS) {
  console.log('Daily loss limit hit. No new trades');
  return;
}
```

### 2. Improve Stop Loss Management

```bash
# Ensure stops are:
# - Set immediately on entry
# - Tracked persistently (database, not just memory)
# - Checked every 30 seconds
# - Never widened, only tightened
```

### 3. Market Condition Filters

```javascript
// Don't trade in dangerous conditions:
if (VIX > 30) {
  console.log('Market too volatile (VIX > 30)');
  return;
}

if (SPYmove1hour < -2%) {
  console.log('Market selling off (-2% hour)');
  return;
}
```

### 4. Position Sizing

```bash
# Use Kelly Criterion for optimal position sizing:
# Kelly % = (Win Rate * Avg Win - Loss Rate * Avg Loss) / Avg Win

# With current stats (if win rate = 45%, not profitable):
# Should be trading SMALLER, not larger positions
```

## False Positive Scenarios

- **Market Open Volatility:** First 30 min of trading often choppy
- **News Events:** Fed announcements, earnings, can cause temporary losses
- **Hedging:** If running multiple strategies, one may show loss while others profit

## Escalation

Escalate immediately if:
- Loss exceeds -$2,000
- Bot continues trading despite stop
- Cannot access bot to stop it
- Positions cannot be closed

**Escalation Actions:**
1. Kill bot process manually
2. Use Alpaca dashboard to close positions manually
3. Contact Alpaca support if API issues

## Post-Incident Actions

### Required (within 24 hours):

1. **Root Cause Analysis:**
   - Write detailed analysis document
   - Identify exact cause of losses
   - Determine if bug vs strategy failure

2. **Code Review:**
   - Review stop loss logic
   - Check risk management code
   - Verify anti-churning protections

3. **Backtesting:**
   - Backtest strategy on same market conditions
   - See if losses were predictable
   - Adjust parameters

4. **Strategy Adjustment:**
   - Tighten risk controls
   - Reduce position sizes
   - Add market condition filters
   - Consider disabling strategy if persistently losing

### Decision Tree:

```
Loss Cause Analysis:
├─ Bug in code?
│  ├─ Yes → Fix bug, test thoroughly, redeploy
│  └─ No → Strategy issue
│
├─ Strategy failing?
│  ├─ Temporary (bad market conditions) → Wait for better conditions
│  └─ Persistent (fundamentally flawed) → Disable strategy, redesign
│
└─ Black swan event?
   └─ Accept loss, improve risk controls
```

## References

- Risk Management: `COMMERCIAL_GRADE_ROADMAP.md` Phase 5
- Anti-Churning: `ANTI_CHURNING_IMPLEMENTED.md`
- Strategy Config: `services/trading/data/config.json`
- Bot Code: `clients/bot-dashboard/unified-trading-bot.js`
- Alpaca Dashboard: https://app.alpaca.markets/paper/dashboard
