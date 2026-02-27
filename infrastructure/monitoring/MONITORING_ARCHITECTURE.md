# Monitoring Architecture

**Version:** 1.0
**Date:** December 23, 2024
**Status:** Production Ready

---

## Executive Summary

NexusTradeAI's monitoring infrastructure provides comprehensive observability into trading operations, system health, and business metrics. Built with institutional-grade tools (Prometheus, Grafana, Alertmanager), the system ensures 24/7 visibility and proactive incident detection.

### Key Capabilities

- **20+ Trading Metrics** - P&L, win rate, Sharpe ratio, drawdown
- **System Health Monitoring** - Memory, CPU, API latency, database performance
- **Automated Alerting** - 20+ alert rules with email/Slack notifications
- **4 Pre-built Dashboards** - Trading, System Health, Risk, Execution Quality
- **Operational Runbooks** - Step-by-step incident response procedures
- **Log Aggregation** - Centralized logging with rotation and analysis

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Data Sources                          │
│  - Trading Bot (port 9091)                                  │
│  - Data Server (port 9092)                                   │
│  - PostgreSQL                                                │
│  - Redis                                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓ metrics (15s interval)
┌─────────────────────────────────────────────────────────────┐
│                    Prometheus (port 9090)                    │
│  - Scrapes metrics every 15 seconds                         │
│  - Stores time-series data (30 day retention)               │
│  - Evaluates alert rules every 15 seconds                   │
│  - Sends alerts to Alertmanager                             │
└─────────────────────────────────────────────────────────────┘
                            ↓ alerts
┌─────────────────────────────────────────────────────────────┐
│                   Alertmanager (port 9093)                   │
│  - Routes alerts based on severity                          │
│  - Groups related alerts                                     │
│  - Sends notifications (email, Slack, PagerDuty)            │
│  - Implements silencing and inhibition rules                │
└─────────────────────────────────────────────────────────────┘
                            ↓ notifications
┌─────────────────────────────────────────────────────────────┐
│                    Notification Channels                     │
│  - Email (critical + warning alerts)                        │
│  - Slack (#trading-alerts, #infrastructure-alerts)          │
│  - PagerDuty (critical only, optional)                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Grafana (port 3030)                      │
│  - Visualizes metrics from Prometheus                       │
│  - 4 pre-built dashboards                                   │
│  - Ad-hoc querying and exploration                          │
│  - Alert visualization                                       │
└─────────────────────────────────────────────────────────────┘
                            ↑ queries
                      Prometheus
```

---

## Components

### 1. Metrics Collection

**Prometheus**
- **Version:** Latest (prom/prometheus)
- **Port:** 9090
- **Storage:** 30-day retention
- **Scrape Interval:** 15 seconds
- **Evaluation Interval:** 15 seconds

**Metrics Exporter (Trading Bot)**
- **Port:** 9091
- **Format:** Prometheus text format
- **Endpoint:** `/metrics`
- **Metrics:** 20+ custom trading metrics

**Metrics Categories:**
1. **Trading Metrics:**
   - `trading_bot_active_positions` - Count of open positions
   - `trading_bot_pnl_total_usd` - Total P&L
   - `trading_bot_win_rate_percent` - Win rate by strategy
   - `trading_bot_sharpe_ratio` - Risk-adjusted returns
   - `trading_bot_max_drawdown_percent` - Maximum drawdown

2. **Execution Metrics:**
   - `trading_bot_trade_latency_ms` - Signal to execution time
   - `trading_bot_slippage_bps` - Execution slippage
   - `trading_bot_order_fill_rate_percent` - Fill rate

3. **Risk Metrics:**
   - `trading_bot_var_95_percent` - Value at Risk
   - `trading_bot_leverage_ratio` - Current leverage
   - `trading_bot_position_concentration_percent` - Concentration risk

4. **System Metrics:**
   - `trading_bot_memory_heap_usage_percent` - Memory usage
   - `trading_bot_api_health` - API connectivity status
   - `trading_bot_db_query_duration_ms` - Database latency
   - `trading_bot_errors_total` - Error count by type

### 2. Alert Management

**Alertmanager**
- **Version:** Latest (prom/alertmanager)
- **Port:** 9093
- **Configuration:** `/infrastructure/monitoring/alertmanager.yml`

**Alert Rules:** `/infrastructure/monitoring/alerts.yml`

**Alert Categories:**
1. **Memory Alerts** (3 rules)
   - HighMemoryUsage (> 75%)
   - CriticalMemoryUsage (> 90%)
   - MemoryLeakSuspected (steady growth)

2. **Trading Performance Alerts** (4 rules)
   - LowWinRate (< 40%)
   - NegativePnL (< -$1000)
   - HighDrawdown (> 20%)
   - TooManyPositions (> 10)

3. **System Health Alerts** (4 rules)
   - APIDown (not responding)
   - HighAPILatency (> 1000ms)
   - SlowDatabaseQueries (> 100ms)
   - HighErrorRate (> 0.1/s)
   - BotDown (unreachable)

4. **Risk Management Alerts** (3 rules)
   - RiskLimitBreach
   - HighLeverage (> 2x)
   - HighPositionConcentration (> 30%)

5. **Execution Quality Alerts** (3 rules)
   - HighSlippage (> 10bps)
   - LowFillRate (< 80%)
   - HighTradeLatency (> 2000ms)

**Routing Rules:**
- **Critical Alerts:** Immediate notification, 5-minute repeat
- **Warning Alerts:** Standard notification, 1-hour repeat
- **After Hours:** Critical only
- **Market Closed:** Trading alerts suppressed

**Notification Channels:**
- Email: All alerts
- Slack: Critical + warnings
- PagerDuty: Critical only (optional)

### 3. Visualization

**Grafana**
- **Version:** Latest (grafana/grafana)
- **Port:** 3030
- **Credentials:** admin/admin (change in production)

**Dashboards:**
1. **Trading Performance** (`trading-dashboard.json`)
   - Total P&L, Win Rate, Sharpe Ratio
   - Active Positions, Trade Count
   - Cumulative P&L over time
   - Max Drawdown, Portfolio Value

2. **System Health** (`system-health.json`)
   - Memory Usage (gauge + graph)
   - API Health Status
   - Database Query Duration
   - Error Rate, Uptime

3. **Risk Management** (`risk-management.json`)
   - Current Risk Exposure
   - Daily P&L, Max Drawdown, VaR
   - Position Concentration
   - Leverage Ratio, Risk Breaches

4. **Execution Quality** (`execution-quality.json`)
   - Order Fill Rate
   - Average Slippage
   - Trade Latency (p95)
   - Rejected Orders
   - Execution Quality Score

**Dashboard Access:**
- URL: http://localhost:3030
- Default credentials: admin/admin
- Auto-refresh: 10-30 seconds

### 4. Logging

**Log Aggregation:**
- Tool: Logrotate + custom scripts
- Location: `/logs/` and `/clients/bot-dashboard/logs/`
- Rotation: Daily
- Retention: 30 days (compressed)
- Max Size: 100MB per file

**Log Types:**
1. **Application Logs:**
   - `unified-bot-protected.log` - Main bot log
   - `error.log` - Error-only log
   - `combined.log` - All severity levels

2. **Operational Logs:**
   - `deploy-*.log` - Deployment logs
   - `backup-*.log` - Backup logs
   - `health-*.log` - Health check logs

3. **Docker Logs:**
   - Collected via `docker-compose logs`
   - Aggregated daily via script

**Log Analysis Tools:**
- `analyze-logs.sh` - Quick log analysis
- `aggregate-logs.sh` - Log aggregation
- Winston library for structured logging

---

## Operational Procedures

### 1. Alert Response

When an alert fires:

1. **Receive Notification:**
   - Email with alert details
   - Slack message in #trading-alerts
   - PagerDuty page (critical only)

2. **Access Runbook:**
   - Location: `/infrastructure/monitoring/runbooks/`
   - Filename: `<ALERT_NAME>.md`
   - Contains: Investigation steps, resolution steps, prevention

3. **Follow Runbook:**
   - Run diagnostic commands
   - Identify root cause
   - Execute resolution steps
   - Document actions taken

4. **Verify Resolution:**
   - Alert state changes to "resolved"
   - Metrics return to normal
   - System stable for 1 hour

5. **Post-Incident:**
   - Document in incident log
   - Update runbook with learnings
   - Implement prevention measures

### 2. Dashboard Usage

**Trading Performance Dashboard:**
- **When:** During market hours (9:30 AM - 4:00 PM EST)
- **Purpose:** Monitor trading activity and P&L
- **Key Metrics:** Total P&L, Win Rate, Active Positions
- **Action:** Intervene if daily loss approaching -$1000

**System Health Dashboard:**
- **When:** Continuous monitoring (24/7)
- **Purpose:** Ensure system stability
- **Key Metrics:** Memory usage, API health, error rate
- **Action:** Investigate if memory > 75% or API down

**Risk Management Dashboard:**
- **When:** Before/during market hours
- **Purpose:** Ensure risk limits honored
- **Key Metrics:** Max drawdown, leverage, concentration
- **Action:** Reduce exposure if limits breached

**Execution Quality Dashboard:**
- **When:** During active trading
- **Purpose:** Monitor execution performance
- **Key Metrics:** Fill rate, slippage, latency
- **Action:** Investigate if fill rate < 90% or slippage > 10bps

### 3. Maintenance Tasks

**Daily:**
- Review overnight alerts
- Check system health dashboard
- Verify log rotation occurred

**Weekly:**
- Review performance metrics
- Analyze trading statistics
- Check for alert fatigue (too many alerts)
- Review and clean old logs

**Monthly:**
- Backup Prometheus data
- Review and update alert thresholds
- Test disaster recovery procedures
- Update runbooks based on incidents

**Quarterly:**
- Full system audit
- Review and optimize metrics
- Update dashboards based on user feedback
- Capacity planning review

---

## Configuration Files

### Key Configuration Files

| File | Purpose | Location |
|------|---------|----------|
| `prometheus.yml` | Prometheus config | `/infrastructure/monitoring/` |
| `alerts.yml` | Alert rules | `/infrastructure/monitoring/` |
| `alertmanager.yml` | Alert routing | `/infrastructure/monitoring/` |
| `docker-compose.yml` | Service orchestration | `/infrastructure/` |
| `*.json` | Grafana dashboards | `/infrastructure/monitoring/grafana/dashboards/` |
| `*.tmpl` | Email templates | `/infrastructure/monitoring/templates/` |
| `logrotate.conf` | Log rotation | `/infrastructure/logging/` |

### Prometheus Configuration

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

rule_files:
  - "alerts.yml"

scrape_configs:
  - job_name: 'trading-bot'
    static_configs:
      - targets: ['trading-bot:9091']
```

### Alert Rule Example

```yaml
- alert: HighMemoryUsage
  expr: trading_bot_memory_heap_usage_percent > 75
  for: 2m
  labels:
    severity: warning
    component: memory
  annotations:
    summary: "High memory usage detected"
    description: "Memory usage is at {{ $value }}%"
```

### Alertmanager Routing

```yaml
route:
  receiver: 'default'
  group_by: ['alertname', 'component', 'severity']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 3h

  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
      repeat_interval: 15m
```

---

## Performance & Scalability

### Current Capacity

- **Metrics Storage:** 30 days (configurable)
- **Metrics Per Second:** ~100 (well within Prometheus limits)
- **Alert Evaluation:** 20+ rules every 15 seconds
- **Dashboard Queries:** Real-time, < 100ms response
- **Log Storage:** 30 days compressed (~1GB)

### Scaling Considerations

**If metrics grow > 1000/second:**
- Implement metric aggregation
- Use Prometheus federation
- Consider Thanos for long-term storage

**If alerts become too frequent:**
- Adjust thresholds based on historical data
- Implement alert suppression rules
- Use inhibition rules to reduce noise

**If dashboards slow down:**
- Optimize queries (use recording rules)
- Implement caching
- Reduce refresh intervals

---

## Security

### Access Control

- **Grafana:** Username/password authentication
- **Prometheus:** IP whitelisting (production)
- **Alertmanager:** IP whitelisting (production)

### Data Protection

- Metrics contain no PII
- Logs sanitized (no API keys)
- Alert notifications over encrypted channels

### Network Security

- All services on private Docker network
- Only necessary ports exposed
- TLS/SSL in production (future)

---

## Testing

### Alert Testing Framework

**Script:** `/infrastructure/monitoring/test-alerts.sh`

**Tests:**
1. Connection tests (Prometheus, Alertmanager, Bot)
2. Configuration tests (rules loaded, receivers configured)
3. Alert state tests (active alerts, routing)
4. Simulation tests (trigger test alerts)
5. End-to-end flow test

**Usage:**
```bash
./infrastructure/monitoring/test-alerts.sh
```

**Expected Output:**
- All connection tests pass
- Alert rules loaded
- Alertmanager configured
- End-to-end flow working

---

## Troubleshooting

### Common Issues

**Issue: Alerts not firing**
- Check: Prometheus scraping targets
- Check: Alert rules syntax
- Check: Metric availability
- Solution: Restart Prometheus

**Issue: Notifications not received**
- Check: Alertmanager configuration
- Check: SMTP/Slack credentials
- Check: Alert routing rules
- Solution: Test with test alert

**Issue: Dashboard shows no data**
- Check: Prometheus data source configured
- Check: Time range is correct
- Check: Query syntax
- Solution: Verify metrics exist in Prometheus

**Issue: High memory usage by Prometheus**
- Check: Retention period (default 30d)
- Check: Number of metrics
- Solution: Reduce retention or add more RAM

---

## Future Enhancements

### Phase 1 Completed ✅
- Basic monitoring infrastructure
- Alert rules and routing
- Grafana dashboards
- Runbook procedures

### Phase 2 (Weeks 4-8)
- Advanced dashboards with drill-downs
- Anomaly detection (ML-based)
- Distributed tracing (Jaeger)
- APM integration (if needed)

### Phase 3 (Months 3-6)
- Long-term metrics storage (Thanos)
- Multi-region monitoring
- SLA tracking and reporting
- Automated incident response

---

## References

### Documentation
- Prometheus: https://prometheus.io/docs/
- Grafana: https://grafana.com/docs/
- Alertmanager: https://prometheus.io/docs/alerting/latest/alertmanager/

### Internal Documentation
- Runbooks: `/infrastructure/monitoring/runbooks/`
- Integration Guide: `/infrastructure/INTEGRATION_GUIDE.md`
- API Reference: `/API_REFERENCE.md`

### Support
- Monitoring Issues: Review runbooks first
- Configuration Changes: Test in staging
- Emergency: Check #trading-critical Slack channel

---

**Document Version:** 1.0
**Last Updated:** December 23, 2024
**Next Review:** January 23, 2025
**Owner:** Infrastructure Team
