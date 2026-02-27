# Runbook: Bot Down

**Alert:** `BotDown`
**Severity:** Critical
**Threshold:** Bot unreachable for 1 minute

## Description

The trading bot is not responding to health checks. This is the most critical alert as it means all trading has stopped and positions are not being monitored.

## Impact

- **CRITICAL:** No new trades being executed
- **CRITICAL:** Existing positions not being monitored
- **CRITICAL:** Stop losses not being enforced
- **HIGH:** Missing market opportunities
- **HIGH:** Unmanaged risk exposure

## Investigation Steps

### 1. Verify Bot is Really Down

```bash
# Check if bot process is running
lsof -i :3002
lsof -i :9091

# Try health endpoint
curl -v http://localhost:9091/health

# Check Docker container
cd infrastructure
docker-compose ps trading-bot

# Check container logs
docker-compose logs --tail=50 trading-bot
```

### 2. Check System Resources

```bash
# Check if system is out of memory
free -h
docker stats --no-stream

# Check disk space
df -h

# Check if port is in use by another process
lsof -i :3002
```

### 3. Review Bot Logs

```bash
# Check for crash reason
tail -100 clients/bot-dashboard/logs/unified-bot-protected.log

# Look for errors before crash
grep -i "error\|exception\|crash" clients/bot-dashboard/logs/*.log | tail -50

# Check if memory limit was hit
docker inspect nexustrade-bot | grep -A 10 "Memory"
```

### 4. Check Dependencies

```bash
# Verify database is up
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "SELECT 1"

# Verify Redis is up
docker-compose exec redis redis-cli ping

# Check Alpaca API status
curl -I https://paper-api.alpaca.markets

# Check status page
# Visit: https://status.alpaca.markets
```

## Resolution Steps

### IMMEDIATE ACTIONS

```bash
# 1. Check current positions in Alpaca
# Login to: https://app.alpaca.markets/paper/dashboard
# Review open positions - are they at risk?

# 2. If positions are at severe risk:
# - Manually close via Alpaca dashboard
# - Or use emergency liquidation script (if available)

# 3. Attempt quick restart
cd infrastructure
docker-compose restart trading-bot

# 4. Monitor restart
docker-compose logs -f trading-bot

# 5. Verify health after restart
sleep 30
curl http://localhost:9091/health
```

### If Restart Fails

```bash
# 1. Check logs for specific error
docker-compose logs trading-bot | grep -i "error" | tail -20

# 2. Common issues:

# Issue: Database connection failed
# Fix: Restart database
docker-compose restart postgres
sleep 10
docker-compose restart trading-bot

# Issue: Port already in use
# Fix: Kill conflicting process
lsof -ti :3002 | xargs kill -9
docker-compose up -d trading-bot

# Issue: Out of memory
# Fix: Clear memory and restart
docker system prune -af
docker-compose up -d trading-bot

# Issue: Code error/exception
# Fix: Rollback to last known good version
git log --oneline -5
git checkout <last-good-commit>
docker-compose build trading-bot
docker-compose up -d trading-bot
```

### Full Restart Procedure

```bash
# 1. Create backup first
./infrastructure/scripts/backup.sh backup

# 2. Stop all services
cd infrastructure
docker-compose down

# 3. Clean up
docker system prune -f

# 4. Restart infrastructure
docker-compose up -d

# 5. Wait for health checks
sleep 60

# 6. Verify all services
./infrastructure/scripts/health-check.sh

# 7. Check bot specifically
curl http://localhost:9091/health
curl http://localhost:9091/metrics | grep -E "pnl|positions"
```

## Root Cause Analysis

After bot is restored, investigate:

### Check Recent Changes

```bash
# What code changed recently?
git log --since="24 hours ago" --oneline

# Any recent deployments?
ls -lt infrastructure/logs/deploy-*.log | head -5

# Check deployment log
tail -100 <latest-deploy-log>
```

### Check Resource Exhaustion

```bash
# Memory usage before crash
grep "memory" clients/bot-dashboard/logs/*.log | tail -20

# CPU spikes
# Review Grafana: System Health dashboard

# Disk space issues
df -h /
```

### Check Application Errors

```bash
# Unhandled exceptions
grep -i "uncaught\|unhandled" clients/bot-dashboard/logs/*.log

# Database errors
grep -i "database\|postgres\|sql" clients/bot-dashboard/logs/*.log | tail -20

# API errors
grep -i "alpaca\|api.*error" clients/bot-dashboard/logs/*.log | tail -20
```

## Prevention

### 1. Implement Process Monitoring

```bash
# Add supervisor or systemd service
# Or use Docker restart policies (already configured)

# Verify restart policy
docker inspect nexustrade-bot | grep -A 2 "RestartPolicy"
# Should show: "Name": "unless-stopped"
```

### 2. Resource Limits

```javascript
// In unified-trading-bot.js, add process monitoring:

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Log to file
    // Send alert
    // Graceful shutdown
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    // Log and continue
});

// Memory monitoring
setInterval(() => {
    const usage = process.memoryUsage();
    if (usage.heapUsed / usage.heapTotal > 0.9) {
        console.error('Memory critical - triggering GC');
        global.gc();
    }
}, 60000);
```

### 3. Health Check Improvements

```javascript
// In bot, add comprehensive health check:

app.get('/health', (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date(),
        checks: {
            database: checkDatabaseConnection(),
            redis: checkRedisConnection(),
            alpaca_api: checkAlpacaAPI(),
            memory: checkMemoryUsage(),
            active_positions: getActivePositionCount()
        }
    };

    const allHealthy = Object.values(health.checks)
        .every(check => check.status === 'ok');

    res.status(allHealthy ? 200 : 503).json(health);
});
```

### 4. Automatic Restart Configuration

```yaml
# In docker-compose.yml (already configured):
services:
  trading-bot:
    restart: unless-stopped  # Auto-restart on failure
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3002/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### 5. Alerting Improvements

```bash
# Set up redundant alerts:
# - PagerDuty for SMS
# - Slack for team notification
# - Email for audit trail

# Configure in alertmanager.yml (already done)
```

## False Positive Scenarios

- **During Deployment:** Bot intentionally stopped for upgrade
- **Maintenance Window:** Scheduled maintenance
- **Network Blip:** Temporary network issue < 60 seconds

**To prevent false positives:**
- Silence alerts during maintenance windows
- Increase threshold to 2 minutes (currently 1 minute)
- Implement deployment hooks to silence alerts

## Escalation

Escalate immediately if:
- Bot cannot be restarted within 5 minutes
- Positions are at risk (large unrealized losses)
- Database or infrastructure is down
- Repeated crashes (> 3 times in 1 hour)

**Escalation Actions:**
1. Post in #trading-critical Slack channel
2. Page on-call engineer (if configured)
3. Manually manage positions via Alpaca dashboard
4. Consider market closure if unable to manage risk

## Post-Incident

### Required Actions:

1. **Document Incident:**
   ```
   Date: YYYY-MM-DD HH:MM
   Duration: X minutes
   Root Cause: [specific reason]
   Impact: [positions affected, missed opportunities]
   Resolution: [what fixed it]
   Prevention: [what we'll do differently]
   ```

2. **Fix Root Cause:**
   - Code fix for bug
   - Infrastructure upgrade for resources
   - Configuration change for limits
   - Process improvement for deployment

3. **Test Prevention:**
   - Verify fix works
   - Add test case for failure scenario
   - Update monitoring to catch earlier
   - Improve alerting

4. **Update Runbook:**
   - Add new troubleshooting steps discovered
   - Document any special cases
   - Update prevention section

## Related Alerts

- `HighMemoryUsage` - Often precedes crash
- `APIDown` - May cause bot to crash
- `DatabaseDown` - Will cause bot to fail
- `HighErrorRate` - Indicates instability

## References

- Bot Code: `clients/bot-dashboard/unified-trading-bot.js`
- Docker Compose: `infrastructure/docker-compose.yml`
- Health Check Script: `infrastructure/scripts/health-check.sh`
- Deployment Script: `infrastructure/scripts/deploy.sh`
- Logs: `clients/bot-dashboard/logs/`
- Alpaca Dashboard: https://app.alpaca.markets/paper/dashboard
- Grafana: http://localhost:3030 (System Health dashboard)
- Prometheus: http://localhost:9090/alerts

---

**Critical Success Criteria:**
- Bot restored within 5 minutes
- No positions liquidated at losses
- Root cause identified and documented
- Prevention measures implemented
