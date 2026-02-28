# Infrastructure Integration Guide
## Migrating to Production-Grade System

**Created:** December 23, 2024
**Author:** Senior Engineering Team
**Status:** Phase 1 - Week 1 Complete

---

## Overview

This guide walks you through integrating the new production infrastructure into your existing trading bot. The migration includes:

- ✅ **PostgreSQL database** (replaces JSON files)
- ✅ **Memory management** (prevents crashes)
- ✅ **Prometheus metrics** (monitoring & alerting)
- ✅ **Docker containers** (isolated, reproducible deployment)
- ✅ **Professional logging** (structured, rotated)

---

## Prerequisites

1. **Docker Desktop** installed
2. **Node.js 22+** installed
3. **PostgreSQL client** (optional, for manual queries)
4. **Current bot stopped** (prevent conflicts)

---

## Step 1: Environment Setup

### 1.1 Update .env file

Add these variables to your `.env` file:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nexustradeai
DB_USER=postgres
DB_PASSWORD=your_secure_password_here

# Redis Cache
REDIS_HOST=localhost
REDIS_PORT=6379

# Memory Management
MAX_HEAP_MB=400

# Monitoring
METRICS_PORT=9091
PROMETHEUS_ENABLED=true

# Existing variables (keep these)
ALPACA_API_KEY=your_key_here
ALPACA_SECRET_KEY=your_secret_here
TRADING_PORT=3002
```

### 1.2 Install new dependencies

```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI

# Install database and monitoring packages
npm install pg prom-client redis

# Or use exact versions
npm install pg@8.11.3 prom-client@15.1.0 redis@4.6.12
```

---

## Step 2: Start Infrastructure Services

### 2.1 Start PostgreSQL, Redis, Prometheus, Grafana

```bash
cd infrastructure

# Start all services
docker-compose up -d postgres redis prometheus grafana

# Verify services are running
docker-compose ps

# Expected output:
# nexustrade-db        postgres:14-alpine   Up (healthy)
# nexustrade-redis     redis:7-alpine       Up (healthy)
# nexustrade-prometheus prometheus:latest   Up
# nexustrade-grafana   grafana:latest       Up
```

### 2.2 Verify database is ready

```bash
# Connect to PostgreSQL
docker exec -it nexustrade-db psql -U postgres -d nexustradeai

# Should see:
# nexustradeai=#

# Check tables were created
\dt

# You should see:
#  accounts
#  positions
#  orders
#  trades
#  performance_metrics
#  market_data
#  signals
#  system_metrics

# Exit
\q
```

---

## Step 3: Migrate Existing Data

### 3.1 Backup current JSON files

```bash
cd services/trading/data

# Create backup
mkdir -p backup/$(date +%Y-%m-%d)
cp *.json backup/$(date +%Y-%m-%d)/

ls backup/$(date +%Y-%m-%d)
# Should show: accounts.json, positions.json, trades.json, etc.
```

### 3.2 Run migration script

```bash
cd ../../..  # Back to project root

# Run migration (this reads JSON and writes to database)
node infrastructure/database/migrate.js

# Expected output:
# 🚀 Starting data migration from JSON to PostgreSQL...
# ✅ Database connected
# 📦 Backing up JSON files...
#   ✅ Backed up: accounts.json
#   ✅ Backed up: positions.json
#   ...
# 👤 Migrating accounts...
#   ✅ Migrated 1 accounts
# 📊 Migrating positions...
#   ✅ Migrated 4 positions
# 💰 Migrating trades...
#   ✅ Migrated 0 trades
# 📈 Migrating performance metrics...
#   ✅ Migrated performance metrics
# ✅ Migration completed successfully!
```

### 3.3 Verify migration

```bash
# Query database to verify data
docker exec -it nexustrade-db psql -U postgres -d nexustradeai -c "
SELECT
  (SELECT COUNT(*) FROM accounts) as accounts,
  (SELECT COUNT(*) FROM positions) as positions,
  (SELECT COUNT(*) FROM trades) as trades,
  (SELECT COUNT(*) FROM performance_metrics) as metrics;
"

# Expected output:
#  accounts | positions | trades | metrics
# ----------+-----------+--------+---------
#         1 |         4 |      0 |       1
```

---

## Step 4: Update Trading Bot Code

### 4.1 Integrate database layer

Update `unified-trading-bot.js` to use database instead of JSON:

```javascript
// At the top of unified-trading-bot.js, add:
const db = require('../../infrastructure/database/db');
const PositionRepository = require('../../infrastructure/database/repositories/PositionRepository');
const memoryManager = require('../../infrastructure/memory/MemoryManager');
const { metrics, createMetricsServer } = require('../../infrastructure/monitoring/metrics');

// Start infrastructure services
async function startInfrastructure() {
  // Connect to database
  await db.connect();
  console.log('✅ Database connected');

  // Start memory manager
  memoryManager.start();
  console.log('✅ Memory manager started');

  // Start metrics server
  createMetricsServer(process.env.METRICS_PORT || 9091);
  console.log('✅ Metrics server started');
}

// Replace file operations with database operations
// OLD:
const positions = JSON.parse(fs.readFileSync('data/positions.json'));

// NEW:
const positions = await PositionRepository.getActive('alpaca-paper');

// OLD:
fs.writeFileSync('data/positions.json', JSON.stringify(positions));

// NEW:
await PositionRepository.create(newPosition);
// or
await PositionRepository.update(positionId, updates);
```

### 4.2 Register data structures with memory manager

```javascript
// Register caches for automatic cleanup
memoryManager.register('price_cache', priceCache, {
  maxSize: 1000,
  maxAge: 300000,  // 5 minutes
  cleanupStrategy: 'lru'
});

memoryManager.register('signal_history', signalHistory, {
  maxSize: 500,
  maxAge: 3600000,  // 1 hour
  cleanupStrategy: 'age'
});
```

### 4.3 Add metrics tracking

```javascript
// Record trades
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
  sharpe_ratio: 1.5,
  max_drawdown: -0.12
});

// Record errors
try {
  // ... trade logic
} catch (error) {
  metrics.recordError('trade_execution_failed', 'critical');
  console.error(error);
}
```

---

## Step 5: Test Locally

### 5.1 Start bot with new infrastructure

```bash
# Stop any existing bot instances
pm2 stop all
lsof -ti :3002 | xargs kill -9

# Start bot with garbage collection enabled
node --expose-gc --max-old-space-size=400 clients/bot-dashboard/unified-trading-bot.js

# Expected startup logs:
# 🧠 Memory Manager started (Max heap: 400MB)
# ✅ Database connected
# 📊 Metrics server listening on port 9091
#    Metrics: http://localhost:9091/metrics
#    Health:  http://localhost:9091/health
# ⏰ Trading Loop - ...
```

### 5.2 Verify metrics endpoint

```bash
# Check metrics are being collected
curl http://localhost:9091/metrics | head -20

# Should see output like:
# # HELP trading_bot_active_positions Number of currently active positions
# # TYPE trading_bot_active_positions gauge
# trading_bot_active_positions{strategy="momentum",symbol="AAPL"} 1
# ...

# Check health
curl http://localhost:9091/health

# Should return:
# {"status":"healthy","uptime":42.5,"timestamp":"2024-12-23T..."}
```

### 5.3 Verify database is being used

```bash
# Watch database queries in real-time
docker exec -it nexustrade-db psql -U postgres -d nexustradeai -c "
SELECT
  schemaname,
  relname,
  seq_scan,
  idx_scan
FROM pg_stat_user_tables
ORDER BY seq_scan + idx_scan DESC
LIMIT 5;
"

# If you see increasing scan counts, database is being used!
```

### 5.4 Monitor memory usage

```bash
# In a separate terminal, watch memory
watch -n 5 'curl -s http://localhost:9091/metrics | grep memory_heap'

# Should show stable memory usage:
# trading_bot_memory_heap_used_bytes 125829120
# trading_bot_memory_heap_usage_percent 31.45
```

---

## Step 6: Deploy with Docker (Production)

### 6.1 Build production image

```bash
cd infrastructure

# Build image
docker build -t nexustradeai-bot:latest -f Dockerfile ..

# Verify image
docker images | grep nexustradeai
```

### 6.2 Start full stack

```bash
# Start everything with Docker Compose
docker-compose up -d

# Check all services
docker-compose ps

# Should show:
# nexustrade-bot       Up (healthy)
# nexustrade-db        Up (healthy)
# nexustrade-redis     Up
# nexustrade-prometheus Up
# nexustrade-grafana   Up
```

### 6.3 View bot logs

```bash
# Real-time logs
docker-compose logs -f trading-bot

# Last 100 lines
docker-compose logs --tail=100 trading-bot
```

---

## Step 7: Access Monitoring Dashboards

### 7.1 Prometheus

```
URL: http://localhost:9090
```

**Useful queries:**
```
# Current heap usage
trading_bot_memory_heap_used_bytes / 1024 / 1024

# Active positions
trading_bot_active_positions

# Total P&L
trading_bot_pnl_total_usd

# Trade latency (95th percentile)
histogram_quantile(0.95, trading_bot_trade_latency_ms_bucket)
```

### 7.2 Grafana

```
URL: http://localhost:3030
Username: admin
Password: admin (or value from GRAFANA_PASSWORD in .env)
```

**To add dashboard:**
1. Click "+" → "Import"
2. Upload JSON from `infrastructure/monitoring/grafana/dashboards/`
3. Select Prometheus as data source

### 7.3 PgAdmin (Database UI)

```
URL: http://localhost:5050
Email: admin@nexustradeai.com
Password: admin (or value from PGADMIN_PASSWORD in .env)
```

**To connect to database:**
1. Right-click "Servers" → "Create" → "Server"
2. Name: NexusTradeAI
3. Host: postgres
4. Port: 5432
5. Database: nexustradeai
6. Username: postgres
7. Password: (value from DB_PASSWORD in .env)

---

## Step 8: PM2 Integration (Alternative to Docker)

If you prefer PM2 over Docker:

```bash
# Update ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'trading-bot',
      script: 'clients/bot-dashboard/unified-trading-bot.js',
      node_args: '--expose-gc --max-old-space-size=400',
      max_memory_restart: '450M',
      env: {
        NODE_ENV: 'production',
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'nexustradeai',
        DB_USER: 'postgres',
        DB_PASSWORD: process.env.DB_PASSWORD,
        REDIS_HOST: 'localhost',
        METRICS_PORT: '9091'
      }
    }
  ]
};

# Start with PM2
pm2 start ecosystem.config.js

# Save configuration
pm2 save
```

---

## Troubleshooting

### Database connection fails

```bash
# Check database is running
docker-compose ps postgres

# Check logs
docker-compose logs postgres

# Test connection
docker exec -it nexustrade-db psql -U postgres -c "SELECT 1"

# If connection refused, check .env has correct credentials
```

### Memory still growing

```bash
# Check memory manager is running
curl http://localhost:9091/metrics | grep memory_gc

# Force cleanup manually
node -e "
  const mm = require('./infrastructure/memory/MemoryManager');
  mm.start();
  mm.cleanup();
  mm.forceGC();
"
```

### Metrics not showing up

```bash
# Check metrics server is running
curl http://localhost:9091/health

# Check Prometheus is scraping
curl http://localhost:9090/targets

# Verify bot is exposing metrics
curl http://localhost:9091/metrics | wc -l
# Should show 100+ lines
```

---

## Performance Benchmarks

After integration, you should see:

| Metric | Before | After | Target |
|--------|--------|-------|--------|
| Memory usage | 150MB+ growing | 100-150MB stable | <200MB |
| Uptime | <24 hours | 7+ days | 99.9% |
| Query latency | N/A (files) | <10ms | <50ms |
| Crashes | Daily | None | 0 |

---

## Next Steps

1. **Monitor for 48 hours** - Verify stability
2. **Review metrics** - Check for anomalies
3. **Tune parameters** - Adjust memory limits if needed
4. **Add alerts** - Configure Prometheus alerting
5. **Phase 2** - Begin ML strategy development

---

## Support

**Issues?** Check:
1. Docker logs: `docker-compose logs`
2. Database logs: `docker-compose logs postgres`
3. Bot logs: `pm2 logs trading-bot`
4. Metrics: `http://localhost:9091/metrics`

**Still stuck?** Review:
- `COMMERCIAL_GRADE_ROADMAP.md` - Full implementation guide
- `infrastructure/database/schema.sql` - Database structure
- `infrastructure/monitoring/metrics.js` - Available metrics

---

**Congratulations!** You now have production-grade infrastructure. Your bot is ready to scale. 🚀
