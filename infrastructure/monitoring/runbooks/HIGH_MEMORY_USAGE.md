# Runbook: High Memory Usage

**Alert:** `HighMemoryUsage`
**Severity:** Warning
**Threshold:** Memory usage > 75% for 2 minutes

## Description

The trading bot's heap memory usage has exceeded 75% of the configured maximum (400MB). This indicates potential memory pressure that could lead to performance degradation or crashes if not addressed.

## Impact

- **Low Risk:** System is still functional but approaching limits
- **Performance:** May experience slower response times
- **Stability:** Risk of crash if memory continues to grow

## Investigation Steps

### 1. Check Current Memory Usage

```bash
# Via metrics endpoint
curl -s http://localhost:9091/metrics | grep memory_heap_usage_percent

# Via health check script
./infrastructure/scripts/health-check.sh

# Via Grafana
# Open: http://localhost:3030
# Dashboard: System Health > Memory Usage
```

### 2. Identify Memory Consumers

```bash
# Check Node.js process
lsof -p $(lsof -ti :3002)

# Check heap snapshot (if --expose-gc is enabled)
# Use Chrome DevTools or node-heapdump
```

### 3. Review Recent Activity

```bash
# Check bot logs for abnormal activity
tail -100 clients/bot-dashboard/logs/unified-bot-protected.log

# Check number of active positions
curl -s http://localhost:9091/metrics | grep active_positions

# Check cache sizes
# Look for large data structures in memory
```

## Resolution Steps

### Immediate Actions (if memory > 85%)

```bash
# 1. Force garbage collection
curl -X POST http://localhost:9091/gc

# 2. Clear caches
curl -X POST http://localhost:9091/clear-cache

# 3. If still high, restart bot
cd infrastructure
docker-compose restart trading-bot
```

### Short-term Fixes

```bash
# 1. Increase heap limit (edit docker-compose.yml)
# Change: --max-old-space-size=400 to --max-old-space-size=512

# 2. Restart with new limits
docker-compose up -d trading-bot

# 3. Monitor for 30 minutes
watch -n 5 'curl -s http://localhost:9091/metrics | grep memory'
```

### Long-term Fixes

1. **Optimize Data Structures:**
   - Review and implement TTL on all caches
   - Reduce size of in-memory position tracking
   - Move historical data to database

2. **Code Review:**
   - Look for memory leaks in recent changes
   - Check for unbounded arrays/objects
   - Review event listener cleanup

3. **Monitoring:**
   - Set up memory profiling in production
   - Enable heap snapshots on high usage
   - Add memory leak detection

## Prevention

1. **Memory Manager Configuration:**
   ```javascript
   // In MemoryManager.js, ensure these are set:
   MAX_HEAP_MB: 400
   CRITICAL_THRESHOLD: 0.75
   CLEANUP_INTERVAL: 60000  // 60 seconds
   ```

2. **Data Retention:**
   - Keep only last 100 trades in memory
   - Move older data to PostgreSQL
   - Clear scan results after processing

3. **Regular Cleanup:**
   - Schedule daily bot restarts during off-hours
   - Clear temp files and caches
   - Compact database regularly

## False Positive Scenarios

- **Just started:** High memory after bot startup is normal
- **Market hours:** Higher usage during active trading is expected
- **Backtest running:** Backtests consume more memory

## Escalation

Escalate if:
- Memory exceeds 90% for > 5 minutes
- Bot crashes due to out-of-memory
- Memory keeps growing despite GC
- Performance significantly degraded

## Related Alerts

- `CriticalMemoryUsage` (> 90%)
- `MemoryLeakSuspected` (steady growth)
- `HighErrorRate` (may cause memory issues)

## References

- Memory Manager: `infrastructure/memory/MemoryManager.js`
- Metrics: http://localhost:9091/metrics
- Grafana Dashboard: System Health
- Logs: `clients/bot-dashboard/logs/`
