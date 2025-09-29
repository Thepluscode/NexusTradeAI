# data-infrastructure/storage/timeseries/influxdb/continuous-queries/aggregation_queries.flux

// Continuous queries for data aggregation and downsampling

// 1. Aggregate 1-minute bars from tick data
option task = {
    name: "aggregate_1m_bars",
    every: 1m,
    offset: 10s
}

from(bucket: "market-data-realtime")
    |> range(start: -2m, stop: -1m)
    |> filter(fn: (r) => r._measurement == "market_data")
    |> group(columns: ["symbol"])
    |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
    |> map(fn: (r) => ({
        _time: r._time,
        _measurement: "ohlcv",
        symbol: r.symbol,
        open: r._value,
        high: r._value,
        low: r._value,
        close: r._value,
        volume: r.volume
    }))
    |> to(bucket: "market-data-1m")

// 2. Calculate 5-minute bars from 1-minute bars
option task = {
    name: "aggregate_5m_bars",
    every: 5m,
    offset: 30s
}

from(bucket: "market-data-1m")
    |> range(start: -6m, stop: -1m)
    |> filter(fn: (r) => r._measurement == "ohlcv")
    |> group(columns: ["symbol"])
    |> aggregateWindow(every: 5m, fn: last, createEmpty: false)
    |> to(bucket: "market-data-5m")

// 3. Calculate hourly bars from 5-minute bars
option task = {
    name: "aggregate_1h_bars",
    every: 1h,
    offset: 2m
}

from(bucket: "market-data-5m")
    |> range(start: -2h, stop: -1h)
    |> filter(fn: (r) => r._measurement == "ohlcv")
    |> group(columns: ["symbol"])
    |> aggregateWindow(every: 1h, fn: last, createEmpty: false)
    |> to(bucket: "market-data-1h")

// 4. Calculate daily bars from hourly bars
option task = {
    name: "aggregate_1d_bars",
    every: 1d,
    offset: 5m
}

from(bucket: "market-data-1h")
    |> range(start: -2d, stop: -1d)
    |> filter(fn: (r) => r._measurement == "ohlcv")
    |> group(columns: ["symbol"])
    |> aggregateWindow(every: 1d, fn: last, createEmpty: false)
    |> to(bucket: "market-data-1d")

// 5. Calculate portfolio daily performance snapshots
option task = {
    name: "daily_portfolio_snapshot",
    every: 1d,
    offset: 30m
}

from(bucket: "portfolio-valuations")
    |> range(start: -2d, stop: -1d)
    |> filter(fn: (r) => r._measurement == "portfolio_valuation")
    |> group(columns: ["account_id"])
    |> aggregateWindow(every: 1d, fn: last, createEmpty: false)
    |> map(fn: (r) => ({
        _time: r._time,
        _measurement: "portfolio_daily_snapshot",
        account_id: r.account_id,
        total_value: r.total_value,
        pnl_daily: r.pnl_daily,
        pnl_total: r.pnl_total
    }))
    |> to(bucket: "strategy-performance")

// 6. Calculate moving averages for technical indicators
option task = {
    name: "calculate_moving_averages",
    every: 1m,
    offset: 15s
}

from(bucket: "market-data-1m")
    |> range(start: -200m)
    |> filter(fn: (r) => r._measurement == "ohlcv" and r._field == "close")
    |> group(columns: ["symbol"])
    |> timedMovingAverage(every: 1m, period: 20m)
    |> map(fn: (r) => ({
        _time: r._time,
        _measurement: "technical_indicator",
        symbol: r.symbol,
        indicator: "sma_20",
        value: r._value
    }))
    |> to(bucket: "technical-indicators")

// 7. Calculate volatility metrics
option task = {
    name: "calculate_volatility",
    every: 5m
}

import "math"

from(bucket: "market-data-1m")
    |> range(start: -1h)
    |> filter(fn: (r) => r._measurement == "ohlcv" and r._field == "close")
    |> group(columns: ["symbol"])
    |> window(every: 20m)
    |> stddev()
    |> map(fn: (r) => ({
        _time: r._time,
        _measurement: "technical_indicator",
        symbol: r.symbol,
        indicator: "volatility_20m",
        value: r._value
    }))
    |> to(bucket: "technical-indicators")

// 8. Aggregate trading volume by hour
option task = {
    name: "hourly_volume_stats",
    every: 1h,
    offset: 5m
}

from(bucket: "market-data-trades")
    |> range(start: -2h, stop: -1h)
    |> filter(fn: (r) => r._measurement == "trade_execution")
    |> group(columns: ["symbol"])
    |> aggregateWindow(every: 1h, fn: sum, column: "size", createEmpty: false)
    |> map(fn: (r) => ({
        _time: r._time,
        _measurement: "volume_stats",
        symbol: r.symbol,
        total_volume: r._value
    }))
    |> to(bucket: "market-statistics")

// 9. Calculate daily risk metrics aggregation
option task = {
    name: "daily_risk_aggregation",
    every: 1d,
    offset: 1h
}

from(bucket: "risk-metrics")
    |> range(start: -2d, stop: -1d)
    |> filter(fn: (r) => r._measurement == "risk_metric")
    |> group(columns: ["account_id", "metric"])
    |> aggregateWindow(every: 1d, fn: last, createEmpty: false)
    |> to(bucket: "risk-metrics", org: "nexus-trade")