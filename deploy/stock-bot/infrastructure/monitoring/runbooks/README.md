# Alert Runbooks

This directory contains operational runbooks for responding to alerts from Prometheus.

## Purpose

Runbooks provide step-by-step procedures for:
- **Investigating** alerts to determine root cause
- **Resolving** issues to restore service
- **Preventing** future occurrences

## Available Runbooks

### Critical Severity

- **[API_DOWN.md](./API_DOWN.md)** - External API not responding
- **[NEGATIVE_PNL.md](./NEGATIVE_PNL.md)** - Daily loss limit breached
- **[BOT_DOWN.md](./BOT_DOWN.md)** - Trading bot crashed or unresponsive
- **[CRITICAL_MEMORY_USAGE.md](./CRITICAL_MEMORY_USAGE.md)** - Memory > 90%

### Warning Severity

- **[HIGH_MEMORY_USAGE.md](./HIGH_MEMORY_USAGE.md)** - Memory > 75%
- **[HIGH_API_LATENCY.md](./HIGH_API_LATENCY.md)** - API response time > 1s
- **[LOW_WIN_RATE.md](./LOW_WIN_RATE.md)** - Win rate < 40%
- **[HIGH_DRAWDOWN.md](./HIGH_DRAWDOWN.md)** - Drawdown > 20%

## Runbook Structure

Each runbook follows this format:

1. **Alert Details** - Name, severity, threshold
2. **Description** - What the alert means
3. **Impact** - Business/technical impact
4. **Investigation** - How to diagnose
5. **Resolution** - How to fix
6. **Prevention** - How to avoid
7. **Escalation** - When to escalate
8. **References** - Related docs/dashboards

## Using Runbooks

### When an Alert Fires

1. **Don't Panic** - Alerts are designed to catch issues early
2. **Open the Runbook** - Find the matching alert name
3. **Follow Investigation Steps** - Determine severity
4. **Execute Resolution** - Follow steps in order
5. **Document** - Note what worked/didn't work
6. **Update Runbook** - Add lessons learned

### Example Workflow

```bash
# 1. Alert fires in Prometheus
# Alert: HighMemoryUsage
# Dashboard: http://localhost:9090/alerts

# 2. Open runbook
cat infrastructure/monitoring/runbooks/HIGH_MEMORY_USAGE.md

# 3. Run investigation commands
curl -s http://localhost:9091/metrics | grep memory_heap_usage_percent

# 4. Follow resolution steps
curl -X POST http://localhost:9091/gc

# 5. Monitor recovery
watch -n 5 'curl -s http://localhost:9091/metrics | grep memory'

# 6. Document incident
echo "$(date) - HighMemoryUsage resolved by manual GC" >> incidents.log
```

## Severity Levels

### Critical (P0)
- **Response Time:** Immediate (< 5 minutes)
- **Impact:** Service down or major financial loss
- **Examples:** Bot down, API down, major loss
- **Action:** Stop everything, resolve immediately

### Warning (P1)
- **Response Time:** Within 30 minutes
- **Impact:** Degraded performance or approaching limits
- **Examples:** High memory, slow API, low win rate
- **Action:** Investigate and resolve during business hours

### Info (P2)
- **Response Time:** Next business day
- **Impact:** Informational, no immediate action needed
- **Examples:** Backup completed, migration finished
- **Action:** Review and acknowledge

## On-Call Procedures

### Business Hours (9:30 AM - 4:00 PM EST)
- Monitor alerts in real-time
- Respond within SLA times
- Keep incident log

### After Hours
- **Critical alerts** only trigger notifications
- **Warning alerts** reviewed next business day
- **Emergency contacts** for P0 only

## Tools & Dashboards

- **Prometheus Alerts:** http://localhost:9090/alerts
- **Grafana Dashboards:** http://localhost:3030
- **Health Check:** `./infrastructure/scripts/health-check.sh`
- **Metrics:** http://localhost:9091/metrics
- **Logs:** `tail -f clients/bot-dashboard/logs/*.log`

## Common Commands

### Check System Health
```bash
# All services
./infrastructure/scripts/health-check.sh

# Specific service
curl http://localhost:9091/health

# Database
PGPASSWORD=$DB_PASSWORD psql -h localhost -U postgres -d nexustradeai -c "SELECT 1"
```

### View Metrics
```bash
# All metrics
curl -s http://localhost:9091/metrics

# Memory usage
curl -s http://localhost:9091/metrics | grep memory

# Trading performance
curl -s http://localhost:9091/metrics | grep -E "pnl|win_rate|trades"
```

### Check Logs
```bash
# Bot logs
tail -100 clients/bot-dashboard/logs/unified-bot-protected.log

# Docker logs
cd infrastructure
docker-compose logs -f trading-bot

# Database logs
docker-compose logs -f postgres
```

### Emergency Actions
```bash
# Stop bot
cd infrastructure
docker-compose stop trading-bot

# Restart bot
docker-compose restart trading-bot

# Full restart
docker-compose down && docker-compose up -d

# Emergency backup
./infrastructure/scripts/backup.sh backup
```

## Incident Management

### Incident Log Format
```
Date: 2024-12-23 14:30:00
Alert: HighMemoryUsage
Severity: Warning
Impact: Bot running slow
Root Cause: Memory leak in position tracking
Resolution: Restarted bot, fixed code
Duration: 15 minutes
Preventive Action: Added memory cleanup in position module
```

### Post-Incident Review

After resolving P0/P1 incidents:

1. **Write Summary** - What happened, why, how fixed
2. **Update Runbook** - Add new learnings
3. **Code Fix** - Prevent recurrence
4. **Test** - Verify fix works
5. **Deploy** - Roll out fix
6. **Monitor** - Watch for 48 hours

## Continuous Improvement

Runbooks are living documents:

- **Update** after each incident with new findings
- **Add** new runbooks as new alerts are created
- **Remove** obsolete procedures
- **Test** runbooks quarterly (fire drill)
- **Review** annually for effectiveness

## Contributing

When updating runbooks:

1. Use clear, concise language
2. Include specific commands with examples
3. Add timestamps and version info
4. Test procedures before committing
5. Get peer review

## Emergency Contacts

- **System Owner:** [Your Name]
- **On-Call:** [On-Call Schedule]
- **Escalation:** [Manager/Team Lead]
- **Vendor Support:**
  - Alpaca: support@alpaca.markets
  - AWS: [Support tier]

## Related Documentation

- Alert Rules: `../alerts.yml`
- Metrics: `../metrics.js`
- Dashboards: `../grafana/dashboards/`
- Infrastructure Guide: `../../README.md`
- Commercial Roadmap: `../../../COMMERCIAL_GRADE_ROADMAP.md`

---

**Remember:** The best incident is one that never happens. Focus on prevention and continuous improvement.
