# Runbook: Critical Memory Usage

**Alert:** `CriticalMemoryUsage`
**Severity:** Critical
**Threshold:** Memory usage > 90% for 1 minute

## Description

The trading bot's heap memory usage has exceeded 90% of the configured maximum. This is a CRITICAL condition that will likely result in a crash within minutes if not addressed immediately.

## Impact

- **CRITICAL:** Bot will crash within 1-5 minutes
- **CRITICAL:** All trading will stop
- **CRITICAL:** Positions will be unmonitored
- **HIGH:** Risk of data corruption
- **HIGH:** Potential order execution failures

## Investigation Steps

### 1. Confirm Current Memory State (DO THIS FIRST)

```bash
# Check actual memory usage RIGHT NOW
curl -s http://localhost:9091/metrics | grep memory_heap_usage_percent

# If > 95%, you have < 2 minutes before crash
# If > 92%, you have < 5 minutes before crash
# Act immediately based on severity
```

### 2. Quick Diagnosis

```bash
# Check what's consuming memory
curl -s http://localhost:9091/metrics | grep -E "active_positions|cache_size"

# Check recent activity
tail -50 clients/bot-dashboard/logs/unified-bot-protected.log | grep -i "memory\|gc\|clean"

# Check for memory leaks
docker stats --no-stream nexustrade-bot
```

## Resolution Steps

### EMERGENCY ACTIONS (Memory > 95% - YOU HAVE < 2 MINUTES)

```bash
# 1. FORCE GARBAGE COLLECTION IMMEDIATELY
curl -X POST http://localhost:9091/gc
# OR if endpoint not available:
docker-compose exec trading-bot kill -USR2 1

# 2. VERIFY IT WORKED
sleep 5
curl -s http://localhost:9091/metrics | grep memory_heap_usage_percent

# 3. If still > 90%, RESTART BOT NOW
cd infrastructure
docker-compose restart trading-bot

# 4. Monitor restart
docker-compose logs -f trading-bot
```

### URGENT ACTIONS (Memory 90-95% - YOU HAVE < 5 MINUTES)

```bash
# 1. Clear all caches
curl -X POST http://localhost:9091/clear-cache

# 2. Force garbage collection
curl -X POST http://localhost:9091/gc

# 3. Stop non-essential services
# (If you have background jobs, stop them)

# 4. Monitor for 1 minute
watch -n 5 'curl -s http://localhost:9091/metrics | grep memory'

# 5. If not improving, RESTART:
docker-compose restart trading-bot
```

### CRITICAL ACTIONS (Bot Already Crashed)

```bash
# 1. Check if bot is actually down
curl http://localhost:9091/health
# If no response, bot has crashed

# 2. Check positions in Alpaca
# Login: https://app.alpaca.markets/paper/dashboard
# Review: Are there open positions at risk?

# 3. Create emergency backup
./infrastructure/scripts/backup.sh backup

# 4. Increase memory limit and restart
nano infrastructure/docker-compose.yml
# Change: mem_limit: 512m  to  mem_limit: 768m

# 5. Restart with more memory
docker-compose up -d trading-bot

# 6. Monitor closely
docker-compose logs -f trading-bot
watch -n 5 'curl -s http://localhost:9091/metrics | grep memory'
```

## Root Cause Analysis

After stabilizing, identify WHY memory spiked:

### Check for Memory Leaks

```bash
# 1. Review code for common leak patterns:

# Unbounded arrays
grep -n "\.push(" clients/bot-dashboard/unified-trading-bot.js

# Event listeners not removed
grep -n "\.on\(" clients/bot-dashboard/unified-trading-bot.js

# Timers not cleared
grep -n "setInterval\|setTimeout" clients/bot-dashboard/unified-trading-bot.js

# Large data structures
grep -n "new Map\|new Set" clients/bot-dashboard/unified-trading-bot.js
```

### Check Recent Changes

```bash
# What changed in last 24 hours?
git log --since="24 hours ago" --name-only

# Recent deployments?
ls -lt logs/deploy-*.log | head -3

# Any new features added?
git diff HEAD~5..HEAD --stat
```

### Check Data Growth

```bash
# How many positions?
curl -s http://localhost:9091/metrics | grep active_positions

# How much history in memory?
curl -s http://localhost:3001/api/trading/status | jq '.totalTrades'

# Check cache sizes
# Review MemoryManager registered structures
```

### Common Causes:

1. **Trade history not being cleared**
   - Should keep max 100 trades in memory
   - Rest should be in database

2. **Position data accumulating**
   - Old closed positions not removed
   - Historical price data not pruned

3. **Cache not expiring**
   - TTL not set or too long
   - LRU not working properly

4. **Memory leak in code**
   - Event listeners
   - Timers
   - Global variables growing

5. **External factor**
   - Huge number of positions
   - Very volatile market (lots of updates)
   - API data bloat

## Permanent Fixes

### 1. Reduce Memory Limit Configuration

```javascript
// In MemoryManager.js, add aggressive cleanup:

const CRITICAL_CLEANUP_THRESHOLD = 0.85;  // Trigger at 85%

async cleanup() {
    const usage = this.getUsagePercent();

    if (usage > CRITICAL_CLEANUP_THRESHOLD) {
        console.warn(`CRITICAL: Memory at ${usage}%, aggressive cleanup`);

        // Clear ALL caches
        for (const [name, structure] of this.dataStructures.entries()) {
            if (structure.data instanceof Map) {
                structure.data.clear();
            }
            if (structure.data instanceof Array) {
                structure.data.length = 0;
            }
        }

        // Force GC twice
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 1000));
        global.gc();

        console.log(`After cleanup: ${this.getUsagePercent()}%`);
    }
}
```

### 2. Implement Strict TTL on All Data

```javascript
// Ensure all data structures have TTL:

memoryManager.register('positions', positionsMap, {
    maxSize: 100,
    maxAge: 3600000,  // 1 hour
    cleanupStrategy: 'lru'
});

memoryManager.register('tradeHistory', tradeHistory, {
    maxSize: 100,  // Only keep last 100
    maxAge: 86400000,  // 1 day
    cleanupStrategy: 'fifo'
});

memoryManager.register('priceCache', priceCache, {
    maxSize: 500,
    maxAge: 300000,  // 5 minutes
    cleanupStrategy: 'lru'
});
```

### 3. Move More Data to Database

```javascript
// Instead of keeping all trades in memory:
// OLD:
const allTrades = [];  // Grows forever!

// NEW:
const recentTrades = [];  // Max 100
const maxRecentTrades = 100;

function addTrade(trade) {
    // Save to database
    await TradeRepository.create(trade);

    // Keep in memory only if recent
    recentTrades.unshift(trade);
    if (recentTrades.length > maxRecentTrades) {
        recentTrades.pop();
    }
}
```

### 4. Increase Docker Memory Limit

```yaml
# In docker-compose.yml:
services:
  trading-bot:
    mem_limit: 768m  # Increase from 512m
    memswap_limit: 768m
    mem_reservation: 512m
```

### 5. Add Heap Snapshot on Critical

```javascript
// Capture heap snapshot when memory critical:

const v8 = require('v8');
const fs = require('fs');

function captureHeapSnapshot() {
    const filename = `heap-${Date.now()}.heapsnapshot`;
    const snapshot = v8.writeHeapSnapshot(filename);
    console.log(`Heap snapshot saved: ${snapshot}`);
    // Analyze with Chrome DevTools
}

// Call when memory > 90%
if (memoryUsage > 0.90) {
    captureHeapSnapshot();
}
```

## Prevention

### 1. Proactive Memory Monitoring

```javascript
// Add to bot startup:

setInterval(() => {
    const usage = process.memoryUsage();
    const usagePercent = usage.heapUsed / usage.heapTotal;

    if (usagePercent > 0.70) {
        console.warn(`Memory at ${(usagePercent * 100).toFixed(1)}%`);
        memoryManager.cleanup();
    }

    if (usagePercent > 0.80) {
        console.error(`Memory at ${(usagePercent * 100).toFixed(1)}% - forcing GC`);
        global.gc();
    }

    if (usagePercent > 0.90) {
        console.error(`CRITICAL: Memory at ${(usagePercent * 100).toFixed(1)}%`);
        // Emergency cleanup
        // Consider self-restart if continues
    }
}, 10000);  // Every 10 seconds
```

### 2. Automated Cleanup Schedule

```javascript
// Run cleanup every 5 minutes:
setInterval(() => {
    memoryManager.cleanup();
    global.gc();
}, 300000);
```

### 3. Daily Restart During Off-Hours

```bash
# Add to crontab:
# Restart bot daily at 5 AM (after market close, before pre-market)
0 5 * * * cd /path/to/NexusTradeAI/infrastructure && docker-compose restart trading-bot

# This prevents long-running memory growth
```

### 4. Memory Leak Detection

```javascript
// Track memory growth over time:

const memoryLog = [];

setInterval(() => {
    const usage = process.memoryUsage();
    memoryLog.push({
        timestamp: Date.now(),
        heapUsed: usage.heapUsed
    });

    // Keep last hour
    const oneHourAgo = Date.now() - 3600000;
    while (memoryLog[0]?.timestamp < oneHourAgo) {
        memoryLog.shift();
    }

    // Detect leak: steady growth over 30 minutes
    if (memoryLog.length > 30) {
        const growth = memoryLog[memoryLog.length - 1].heapUsed - memoryLog[0].heapUsed;
        const avgGrowth = growth / memoryLog.length;

        if (avgGrowth > 1024 * 1024) {  // 1MB per sample = leak
            console.error(`Possible memory leak detected: ${avgGrowth / 1024 / 1024}MB/min growth`);
            // Alert or take action
        }
    }
}, 60000);  // Every minute
```

## False Positive Scenarios

- **Just started:** High memory right after restart is normal
- **Market hours:** Higher usage during active trading is expected
- **Volatile market:** More data updates = more memory
- **Backtest running:** Backtests consume more memory (shouldn't run with live trading)

## Escalation

Escalate immediately if:
- Memory > 95% and not responding to GC
- Bot crashed more than once in 1 hour
- Cannot identify memory leak source
- Memory growing despite all cleanup efforts

**Escalation Actions:**
1. Stop trading immediately
2. Comprehensive code review
3. Memory profiling with heapsnapshot
4. Consider architecture changes

## Post-Incident

### Required:

1. **Analyze heap snapshot:**
   - Load `.heapsnapshot` file in Chrome DevTools
   - Identify largest objects
   - Find references preventing GC
   - Fix memory leaks

2. **Code Review:**
   - Review all recent changes
   - Check for leaked listeners
   - Verify timers are cleared
   - Check global variable usage

3. **Stress Test:**
   - Run bot for 24 hours in test
   - Monitor memory continuously
   - Verify cleanup is working
   - Ensure no growth over time

4. **Update Monitoring:**
   - Add memory leak detection
   - Lower alert thresholds
   - Add automated cleanup triggers

## Recovery Time Objective

- **Detection:** < 1 minute (alert fires)
- **Response:** < 2 minutes (force GC or restart)
- **Recovery:** < 3 minutes (bot back online)
- **Total:** < 5 minutes from critical to recovered

## Related Alerts

- `HighMemoryUsage` (75%) - Warning that precedes this
- `MemoryLeakSuspected` - Trend analysis
- `BotDown` - What happens if this alert ignored

## References

- Memory Manager: `infrastructure/memory/MemoryManager.js`
- Bot Code: `clients/bot-dashboard/unified-trading-bot.js`
- Docker Limits: `infrastructure/docker-compose.yml`
- Metrics: http://localhost:9091/metrics
- Grafana: http://localhost:3030 (System Health > Memory panel)

---

**Critical Success Criteria:**
- Memory drops below 80% within 2 minutes
- Bot remains stable for next 1 hour
- Root cause identified and fixed within 24 hours
- No recurrence within 7 days
