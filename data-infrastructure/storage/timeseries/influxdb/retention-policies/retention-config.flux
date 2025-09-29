// InfluxDB Retention Policies for Nexus Trade AI
// This file defines data retention policies for different time granularities

import "influxdata/influxdb/schema"

// Bucket Definitions with Retention Policies

// Real-time market data bucket (1-minute granularity)
// Retention: 7 days
// Use case: Real-time trading, immediate analytics
option bucket_realtime = {
    name: "market-data-realtime",
    retentionPeriod: 7d,
    description: "Real-time market data with 1-minute granularity"
}

// 5-minute aggregated data bucket
// Retention: 30 days
// Use case: Short-term analysis, day trading strategies
option bucket_5m = {
    name: "market-data-5m",
    retentionPeriod: 30d,
    description: "5-minute aggregated market data"
}

// 1-hour aggregated data bucket
// Retention: 1 year
// Use case: Medium-term analysis, swing trading
option bucket_1h = {
    name: "market-data-1h",
    retentionPeriod: 365d,
    description: "1-hour aggregated market data"
}

// Daily aggregated data bucket
// Retention: 10 years
// Use case: Long-term analysis, backtesting, research
option bucket_daily = {
    name: "market-data-daily",
    retentionPeriod: 3650d,
    description: "Daily aggregated market data"
}

// Trade execution data bucket
// Retention: 90 days
// Use case: Trade analysis, compliance, audit
option bucket_trades = {
    name: "trade-executions",
    retentionPeriod: 90d,
    description: "Individual trade execution records"
}

// Risk metrics bucket
// Retention: 2 years
// Use case: Risk management, regulatory reporting
option bucket_risk = {
    name: "risk-metrics",
    retentionPeriod: 730d,
    description: "Risk calculation results and metrics"
}

// Portfolio performance bucket
// Retention: 7 years (regulatory requirement)
// Use case: Performance tracking, client reporting
option bucket_portfolio = {
    name: "portfolio-performance",
    retentionPeriod: 2555d,
    description: "Portfolio performance and valuation data"
}

// News and sentiment data bucket
// Retention: 180 days
// Use case: Sentiment analysis, market research
option bucket_news = {
    name: "news-sentiment",
    retentionPeriod: 180d,
    description: "News articles and sentiment analysis"
}

// System metrics bucket
// Retention: 30 days
// Use case: System monitoring, performance optimization
option bucket_system = {
    name: "system-metrics",
    retentionPeriod: 30d,
    description: "System performance and health metrics"
}

// Order book data bucket
// Retention: 14 days
// Use case: Market microstructure analysis, liquidity studies
option bucket_orderbook = {
    name: "orderbook-data",
    retentionPeriod: 14d,
    description: "Order book snapshots and depth data"
}

// Automated Data Lifecycle Management Tasks

// Task 1: Archive old real-time data to 5-minute bucket
option task = {
    name: "archive-realtime-to-5m",
    every: 1h,
    offset: 5m
}

// Aggregate 1-minute data to 5-minute intervals
from(bucket: "market-data-realtime")
    |> range(start: -1h, stop: -5m)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(
        every: 5m,
        fn: (column, tables=<-) => tables
            |> mean()
            |> set(key: "_field", value: "price_avg")
            |> union(tables: tables |> max() |> set(key: "_field", value: "price_high"))
            |> union(tables: tables |> min() |> set(key: "_field", value: "price_low"))
            |> union(tables: tables |> first() |> set(key: "_field", value: "price_open"))
            |> union(tables: tables |> last() |> set(key: "_field", value: "price_close"))
            |> union(tables: tables |> sum() |> set(key: "_field", value: "volume_total"))
    )
    |> set(key: "interval", value: "5m")
    |> to(bucket: "market-data-5m")

// Task 2: Archive 5-minute data to 1-hour bucket
option task = {
    name: "archive-5m-to-1h",
    every: 1h,
    offset: 10m
}

from(bucket: "market-data-5m")
    |> range(start: -1h, stop: -5m)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(
        every: 1h,
        fn: (column, tables=<-) => tables
            |> mean()
            |> set(key: "_field", value: "price_avg")
            |> union(tables: tables |> max() |> set(key: "_field", value: "price_high"))
            |> union(tables: tables |> min() |> set(key: "_field", value: "price_low"))
            |> union(tables: tables |> first() |> set(key: "_field", value: "price_open"))
            |> union(tables: tables |> last() |> set(key: "_field", value: "price_close"))
            |> union(tables: tables |> sum() |> set(key: "_field", value: "volume_total"))
    )
    |> set(key: "interval", value: "1h")
    |> to(bucket: "market-data-1h")

// Task 3: Archive 1-hour data to daily bucket
option task = {
    name: "archive-1h-to-daily",
    every: 1d,
    offset: 15m
}

from(bucket: "market-data-1h")
    |> range(start: -1d, stop: -1h)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(
        every: 1d,
        fn: (column, tables=<-) => tables
            |> mean()
            |> set(key: "_field", value: "price_avg")
            |> union(tables: tables |> max() |> set(key: "_field", value: "price_high"))
            |> union(tables: tables |> min() |> set(key: "_field", value: "price_low"))
            |> union(tables: tables |> first() |> set(key: "_field", value: "price_open"))
            |> union(tables: tables |> last() |> set(key: "_field", value: "price_close"))
            |> union(tables: tables |> sum() |> set(key: "_field", value: "volume_total"))
    )
    |> set(key: "interval", value: "1d")
    |> to(bucket: "market-data-daily")

// Task 4: Clean up expired data
option task = {
    name: "cleanup-expired-data",
    every: 1d,
    offset: 30m
}

// This task would typically be handled by InfluxDB's automatic retention policy
// But we can add custom cleanup logic for specific conditions

// Data Compression Tasks

// Task 5: Compress old trade data
option task = {
    name: "compress-trade-data",
    every: 1d,
    offset: 45m
}

// Aggregate individual trades to summary statistics
from(bucket: "trade-executions")
    |> range(start: -1d, stop: -1h)
    |> filter(fn: (r) => r._measurement == "trades")
    |> group(columns: ["symbol", "exchange", "side"])
    |> aggregateWindow(
        every: 1h,
        fn: (column, tables=<-) => tables
            |> count() |> set(key: "_field", value: "trade_count")
            |> union(tables: tables |> sum() |> set(key: "_field", value: "volume_total"))
            |> union(tables: tables |> mean() |> set(key: "_field", value: "price_avg"))
            |> union(tables: tables |> max() |> set(key: "_field", value: "price_max"))
            |> union(tables: tables |> min() |> set(key: "_field", value: "price_min"))
    )
    |> set(key: "_measurement", value: "trade_summary")
    |> to(bucket: "trade-executions")

// Data Quality and Monitoring Tasks

// Task 6: Monitor data freshness
option task = {
    name: "monitor-data-freshness",
    every: 5m
}

// Check if we're receiving fresh data
from(bucket: "market-data-realtime")
    |> range(start: -5m)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> group(columns: ["symbol", "exchange"])
    |> aggregateWindow(every: 5m, fn: count)
    |> filter(fn: (r) => r._value < 5)  // Less than 5 data points in 5 minutes
    |> map(fn: (r) => ({r with _measurement: "data_quality", _field: "freshness_alert"}))
    |> to(bucket: "system-metrics")

// Task 7: Monitor data volume
option task = {
    name: "monitor-data-volume",
    every: 10m
}

// Track data ingestion rates
from(bucket: "market-data-realtime")
    |> range(start: -10m)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> aggregateWindow(every: 10m, fn: count)
    |> map(fn: (r) => ({r with _measurement: "data_quality", _field: "ingestion_rate"}))
    |> to(bucket: "system-metrics")

// Backup and Recovery Tasks

// Task 8: Create backup snapshots
option task = {
    name: "create-backup-snapshots",
    every: 1d,
    offset: 2h
}

// This would typically integrate with external backup systems
// For now, we'll create summary statistics for critical data

from(bucket: "market-data-daily")
    |> range(start: -1d)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> group(columns: ["symbol"])
    |> aggregateWindow(
        every: 1d,
        fn: (column, tables=<-) => tables
            |> count() |> set(key: "_field", value: "data_points")
            |> union(tables: tables |> mean() |> set(key: "_field", value: "avg_price"))
            |> union(tables: tables |> sum() |> set(key: "_field", value: "total_volume"))
    )
    |> set(key: "_measurement", value: "daily_summary")
    |> to(bucket: "market-data-daily")

// Performance Optimization Tasks

// Task 9: Optimize storage
option task = {
    name: "optimize-storage",
    every: 1w
}

// This task would trigger storage optimization routines
// Such as compaction, indexing, and shard rebalancing

// Alerting Tasks

// Task 10: Storage usage alerts
option task = {
    name: "storage-usage-alerts",
    every: 1h
}

// Monitor bucket sizes and alert if approaching limits
// This would integrate with external monitoring systems

// Data Export Tasks

// Task 11: Export daily summaries
option task = {
    name: "export-daily-summaries",
    every: 1d,
    offset: 3h
}

// Export daily market summaries for external systems
from(bucket: "market-data-daily")
    |> range(start: -1d)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> group(columns: ["symbol", "exchange"])
    |> aggregateWindow(
        every: 1d,
        fn: (column, tables=<-) => tables
            |> first() |> set(key: "_field", value: "open")
            |> union(tables: tables |> max() |> set(key: "_field", value: "high"))
            |> union(tables: tables |> min() |> set(key: "_field", value: "low"))
            |> union(tables: tables |> last() |> set(key: "_field", value: "close"))
            |> union(tables: tables |> sum() |> set(key: "_field", value: "volume"))
    )
    |> set(key: "_measurement", value: "ohlcv_daily")
    |> to(bucket: "market-data-daily")

// Compliance and Audit Tasks

// Task 12: Audit trail maintenance
option task = {
    name: "maintain-audit-trail",
    every: 1d,
    offset: 4h
}

// Maintain audit trails for regulatory compliance
from(bucket: "trade-executions")
    |> range(start: -1d)
    |> filter(fn: (r) => r._measurement == "trades")
    |> map(fn: (r) => ({r with _measurement: "audit_trail"}))
    |> to(bucket: "portfolio-performance")  // Long-term storage for compliance
