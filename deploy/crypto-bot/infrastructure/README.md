# Production Infrastructure

**Status:** Phase 1, Week 1 Complete ✅
**Created:** December 23, 2024
**Architecture:** PostgreSQL + Redis + Prometheus + Grafana + Docker

---

## Overview

This directory contains production-grade infrastructure for NexusTradeAI. The infrastructure was built following institutional engineering standards as part of the Commercial-Grade Roadmap.

### Key Components

1. **PostgreSQL Database** - Replaces JSON file storage
2. **Redis Cache** - High-performance data caching
3. **Prometheus** - Metrics collection and alerting
4. **Grafana** - Visualization dashboards
5. **Docker Compose** - Container orchestration
6. **Memory Manager** - Prevents leaks and crashes
7. **Monitoring** - Comprehensive metrics and alerts

---

## Quick Start

### Prerequisites

- Docker Desktop installed
- Node.js 22+
- PostgreSQL client (optional)

### Start Infrastructure

```bash
cd infrastructure

# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Migrate Data

```bash
# Migrate from JSON to PostgreSQL
node database/migrate.js

# Verify migration
docker exec -it nexustrade-db psql -U postgres -d nexustradeai -c "SELECT COUNT(*) FROM positions"
```

### Access Dashboards

- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3030 (admin/admin)
- **PgAdmin:** http://localhost:5050 (admin@nexustradeai.com/admin)
- **Bot Metrics:** http://localhost:9091/metrics
- **Bot Health:** http://localhost:9091/health

---

## Directory Structure

```
infrastructure/
├── database/                      # Database layer
│   ├── schema.sql                 # PostgreSQL schema
│   ├── db.js                      # Connection pool manager
│   ├── migrate.js                 # JSON → PostgreSQL migration
│   └── repositories/              # Data access layer
│       ├── PositionRepository.js  # Position CRUD
│       ├── TradeRepository.js     # Trade history
│       ├── OrderRepository.js     # Order management
│       └── PerformanceRepository.js # Analytics
│
├── memory/                        # Memory management
│   └── MemoryManager.js           # Auto cleanup, GC triggers
│
├── monitoring/                    # Observability
│   ├── metrics.js                 # Prometheus metrics
│   ├── prometheus.yml             # Scraping config
│   ├── alerts.yml                 # Alert rules
│   └── grafana/
│       └── dashboards/
│           ├── trading-dashboard.json
│           └── system-health.json
│
├── docker-compose.yml             # Full stack orchestration
├── Dockerfile                     # Production container
├── INTEGRATION_GUIDE.md           # Step-by-step migration
└── README.md                      # This file
```

---

## Database Schema

### Core Tables

**accounts**
- Account balances and equity
- Supports multiple brokers

**positions**
- Active and closed positions
- Real-time P&L calculation
- Auto-updated via triggers

**orders**
- Order lifecycle tracking
- Fill rates and latencies
- Parent-child relationships (bracket orders)

**trades**
- Complete trade history
- Performance analytics
- Strategy attribution

**performance_metrics**
- Sharpe ratio, drawdown, win rate
- Equity curves
- Daily snapshots

**market_data**
- Price history
- Volume and volatility
- OHLCV data

**signals**
- ML model predictions
- Strategy signals
- Backtesting results

**system_metrics**
- Memory usage
- API latencies
- Error rates

### Indexes

Optimized for:
- Time-series queries (positions, trades)
- Account lookups
- Symbol filtering
- Status queries

### Views

- `active_positions_summary` - Real-time position overview
- `daily_pnl` - Daily performance rollup
- Custom views for common queries

---

## Repository Pattern

All database access goes through repositories for:

1. **Consistency** - Standardized CRUD operations
2. **Caching** - Built-in TTL caching
3. **Validation** - Input sanitization
4. **Type Safety** - Proper data mapping
5. **Testability** - Easy to mock

### Example Usage

```javascript
const PositionRepository = require('./infrastructure/database/repositories/PositionRepository');

// Get active positions
const positions = await PositionRepository.getActive('alpaca-paper');

// Create new position
await PositionRepository.create({
  account_id: 'alpaca-paper',
  symbol: 'AAPL',
  side: 'long',
  quantity: 10,
  average_entry_price: 150.00,
  strategy: 'momentum'
});

// Update position
await PositionRepository.update(positionId, {
  current_price: 155.00,
  stop_loss: 148.00
});

// Get statistics
const stats = await PositionRepository.getStatistics('alpaca-paper');
// Returns: { total_positions, total_pnl, win_rate, ... }
```

---

## Memory Management

### Automatic Cleanup

The MemoryManager monitors and cleans memory every 60 seconds:

- **LRU Strategy** - Removes least recently used items
- **Age Strategy** - Removes items older than TTL
- **FIFO Strategy** - Removes oldest items first

### Thresholds

- **75%** - Warning logged
- **85%** - Force garbage collection
- **90%** - Critical alert

### Usage

```javascript
const memoryManager = require('./infrastructure/memory/MemoryManager');

// Register data structure for cleanup
memoryManager.register('price_cache', priceCache, {
  maxSize: 1000,
  maxAge: 300000,  // 5 minutes
  cleanupStrategy: 'lru'
});

// Start monitoring
memoryManager.start();

// Get memory report
const report = memoryManager.getReport();
console.log(report);
```

---

## Metrics & Monitoring

### Available Metrics

**Trading Metrics:**
- `trading_bot_active_positions` - Current positions
- `trading_bot_pnl_total_usd` - Total P&L
- `trading_bot_win_rate_percent` - Win rate by strategy
- `trading_bot_sharpe_ratio` - Risk-adjusted return
- `trading_bot_max_drawdown_percent` - Maximum drawdown

**Execution Metrics:**
- `trading_bot_trades_total` - Trade count by side/outcome
- `trading_bot_trade_latency_ms` - Signal to execution time
- `trading_bot_slippage_bps` - Slippage in basis points
- `trading_bot_order_fill_rate_percent` - Fill rate

**System Metrics:**
- `trading_bot_memory_heap_used_bytes` - Memory usage
- `trading_bot_api_health` - API status (1=up, 0=down)
- `trading_bot_db_query_duration_ms` - Database latency
- `trading_bot_errors_total` - Error count by type/severity

### Recording Metrics

```javascript
const { metrics } = require('./infrastructure/monitoring/metrics');

// Record trade
metrics.recordTrade({
  side: 'buy',
  strategy: 'momentum',
  symbol: 'AAPL',
  pnl: 100,
  latency: 150,
  slippage: 0.0005,
  venue: 'alpaca'
});

// Update positions
metrics.updatePositions(activePositions);

// Update performance
metrics.updatePerformance({
  account_id: 'alpaca-paper',
  total_pnl: 1000,
  win_rate: 0.58,
  sharpe_ratio: 1.5
});

// Record error
metrics.recordError('api_timeout', 'warning');
```

### Querying in Prometheus

```promql
# Current heap usage in MB
trading_bot_memory_heap_used_bytes / 1024 / 1024

# Active positions count
sum(trading_bot_active_positions)

# Win rate by strategy
trading_bot_win_rate_percent

# 95th percentile trade latency
histogram_quantile(0.95, trading_bot_trade_latency_ms_bucket)

# Error rate (errors/second)
rate(trading_bot_errors_total[5m])
```

---

## Alerting

### Alert Rules

**Memory Alerts:**
- HighMemoryUsage (>75% for 2m)
- CriticalMemoryUsage (>90% for 1m)
- MemoryLeakSuspected (increasing for 30m)

**Performance Alerts:**
- LowWinRate (<40% for 5m)
- NegativePnL (<-$1000 for 1m)
- HighDrawdown (>20% for 2m)
- TooManyPositions (>10 for 1m)

**System Alerts:**
- APIDown (0 for 1m)
- HighAPILatency (>1000ms for 3m)
- SlowDatabaseQueries (>100ms for 5m)
- HighErrorRate (>0.1/s for 2m)
- BotDown (unreachable for 1m)

**Risk Alerts:**
- RiskLimitBreach (any breach)
- HighLeverage (>2x for 1m)
- HighPositionConcentration (>30% for 2m)

**Execution Alerts:**
- HighSlippage (>10bps for 3m)
- LowFillRate (<80% for 5m)
- HighTradeLatency (>2000ms for 3m)

### Alert Configuration

Alerts are defined in `monitoring/alerts.yml` and loaded by Prometheus. When an alert fires:

1. Prometheus evaluates the rule
2. Alert state changes to "firing"
3. Visible in Prometheus UI: http://localhost:9090/alerts
4. Can be routed to Alertmanager (future integration)

To add custom alerts, edit `monitoring/alerts.yml`:

```yaml
- alert: CustomAlert
  expr: your_metric > threshold
  for: duration
  labels:
    severity: warning|critical
    component: name
  annotations:
    summary: "Brief description"
    description: "Detailed info with {{ $value }}"
```

---

## Docker Compose Services

### Service Map

| Service | Port | Purpose | Dependencies |
|---------|------|---------|--------------|
| postgres | 5432 | Database | - |
| redis | 6379 | Cache | - |
| prometheus | 9090 | Metrics | - |
| grafana | 3030 | Dashboards | prometheus |
| pgadmin | 5050 | DB Admin | postgres |
| trading-bot | 3002 | Bot API | postgres, redis |
| data-server | 3001 | Market Data | postgres, redis |

### Resource Limits

- **postgres:** 512MB RAM, 1 CPU
- **redis:** 256MB RAM, 0.5 CPU
- **trading-bot:** 512MB RAM, 1 CPU
- **data-server:** 256MB RAM, 0.5 CPU

### Health Checks

All services have health checks with:
- Interval: 30s
- Timeout: 10s
- Retries: 3
- Start period: 40s

### Persistence

Data persists in named volumes:
- `postgres_data` - Database files
- `redis_data` - Cache snapshots
- `prometheus_data` - Metrics history
- `grafana_data` - Dashboard configs

---

## Production Deployment

### Environment Variables

Required in `.env`:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexustradeai
DB_USER=postgres
DB_PASSWORD=your_secure_password_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Memory
MAX_HEAP_MB=400

# Monitoring
METRICS_PORT=9091
PROMETHEUS_ENABLED=true

# Trading (from existing setup)
ALPACA_API_KEY=your_key
ALPACA_SECRET_KEY=your_secret
```

### Starting Production Stack

```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f trading-bot

# Stop services
docker-compose down

# Stop and remove volumes (WARNING: deletes data)
docker-compose down -v
```

### Scaling

To run multiple bot instances:

```bash
docker-compose up -d --scale trading-bot=3
```

Note: Ensure each instance has unique account_id to prevent conflicts.

---

## Troubleshooting

### Database Issues

**Connection refused:**
```bash
# Check database is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Test connection
docker exec -it nexustrade-db psql -U postgres -c "SELECT 1"
```

**Slow queries:**
```bash
# Check query stats
docker exec -it nexustrade-db psql -U postgres -d nexustradeai -c "
SELECT schemaname, relname, seq_scan, idx_scan
FROM pg_stat_user_tables
ORDER BY seq_scan DESC
LIMIT 10"

# Add missing indexes if needed
```

### Memory Issues

**Bot still crashing:**
```bash
# Check if memory manager is running
curl http://localhost:9091/metrics | grep memory_gc

# Force manual cleanup
node -e "
  const mm = require('./infrastructure/memory/MemoryManager');
  mm.start();
  mm.cleanup();
  mm.forceGC();
"
```

**Memory leak detection:**
```bash
# Watch memory over time
watch -n 5 'curl -s http://localhost:9091/metrics | grep memory_heap_used'

# If steadily increasing, check registered data structures
```

### Metrics Not Showing

**Prometheus not scraping:**
```bash
# Check targets
curl http://localhost:9090/targets

# Verify bot is exposing metrics
curl http://localhost:9091/metrics | wc -l
# Should show 100+ lines
```

**Grafana showing no data:**
1. Check Prometheus data source is configured
2. Verify time range is correct
3. Check query syntax in panel editor
4. Verify metrics exist: http://localhost:9090/graph

### Docker Issues

**Services not starting:**
```bash
# Check Docker resources (need 4GB+ RAM)
docker info | grep Memory

# Check for port conflicts
lsof -i :5432
lsof -i :6379
lsof -i :9090

# Rebuild from scratch
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

---

## Performance Benchmarks

### Target Metrics

After migration, expect:

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Memory usage | 150MB+ growing | 100-150MB stable | <200MB |
| Uptime | <24 hours | 7+ days | 99.9% |
| Query latency | N/A (files) | <10ms | <50ms |
| Crashes | Daily | None | 0 |
| Data operations | O(n) file I/O | O(1) indexed | <10ms p95 |

### Current Performance

Check actual metrics:

```bash
# Memory stability
curl -s http://localhost:9091/metrics | grep memory_heap_usage_percent

# Database performance
curl -s http://localhost:9091/metrics | grep db_query_duration

# Uptime
curl -s http://localhost:9091/metrics | grep uptime_seconds

# API health
curl http://localhost:9091/health
```

---

## Next Steps

### Immediate (Week 1-2)

- [x] Database schema created
- [x] Repositories implemented
- [x] Memory manager active
- [x] Metrics collection running
- [x] Alerting configured
- [x] Docker containers built
- [x] Integration guide written
- [ ] **Migration executed** (run `node database/migrate.js`)
- [ ] **Bot integrated** (update to use repositories)
- [ ] **48-hour stability test**

### Short-term (Week 2-4)

- [ ] Create additional Grafana dashboards
- [ ] Set up Alertmanager for notifications
- [ ] Configure backup cron jobs
- [ ] Add database replication
- [ ] Implement connection pooling tuning
- [ ] Add query performance logging
- [ ] Create database vacuum/analyze jobs

### Medium-term (Phase 2)

- [ ] ML strategy development (per roadmap)
- [ ] Feature engineering pipeline
- [ ] Model training infrastructure
- [ ] Backtesting framework
- [ ] Walk-forward optimization

---

## Support & References

### Documentation

- `INTEGRATION_GUIDE.md` - Step-by-step migration
- `COMMERCIAL_GRADE_ROADMAP.md` - 18-24 month plan
- `schema.sql` - Database structure
- `metrics.js` - Available metrics

### External Resources

- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Prometheus Docs](https://prometheus.io/docs/)
- [Grafana Docs](https://grafana.com/docs/)
- [Docker Compose Docs](https://docs.docker.com/compose/)

### Getting Help

1. Check logs: `docker-compose logs [service]`
2. Check health: `curl http://localhost:9091/health`
3. Check metrics: `http://localhost:9091/metrics`
4. Review integration guide: `INTEGRATION_GUIDE.md`

---

**Built with institutional-grade engineering rigor.** 🏗️

Phase 1, Week 1 Complete ✅
