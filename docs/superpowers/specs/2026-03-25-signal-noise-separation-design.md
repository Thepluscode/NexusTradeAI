# Signal-Noise Separation: Canonical Pipeline, Backtester & Analytics

**Date:** 2026-03-25
**Status:** Approved
**Goal:** Empirically identify which trading signal components are predictive (signal) vs random (noise), then eliminate noise to improve profitability across all three bots.

---

## Problem Statement

The 6-component committee scoring system (momentum, orderFlow, displacement, volumeProfile, fvg, volumeRatio) is deployed across stock, forex, and crypto bots. But there is no rigorous way to measure whether each component genuinely predicts forward returns. The auto-learning weight optimizer (running every 4 hours on recent trades) uses a crude "avg P&L with vs without" heuristic that doesn't account for statistical significance, component correlation, regime dependence, or edge decay.

The signal logic is embedded inline in three 3000+ line monolithic bot files, making it impossible to test, backtest, or analyze in isolation.

**Result:** The bots may be taking trades where half the "confidence" comes from noise components — trades that look qualified but have no real edge.

---

## Architecture

### Layer 1: Canonical Signal Pipeline (`services/signals/`)

Pure-function modules with zero side effects. Every function takes market data in, returns a score out. No API calls, no state, no Express routes.

```
services/signals/
├── index.js                  # Public API exports
├── committee-scorer.js       # Registry-based weighted aggregate
├── regime-detector.js        # ATR-based regime classification
├── order-flow.js             # Bid/ask imbalance → score (0-1)
├── displacement.js           # Unusual candle body detection → score (0-1)
├── volume-profile.js         # VAH/VAL/POC from volume distribution → score (0-1)
├── fvg-detector.js           # Fair value gap identification → score (0-1)
├── momentum.js               # Price momentum scoring → score (0-1)
├── trend.js                  # H1 trend alignment (forex-specific) → score (0-1)
├── macd.js                   # MACD scoring (forex-specific) → score (0-1)
├── multi-timeframe.js        # NEW: 15m/1h/4h trend alignment → score (0-1)
├── confidence-calibrator.js  # Platt scaling (raw score → win probability)
├── entry-qualifier.js        # Final go/no-go with EV check
├── stop-manager.js           # ATR-based stops per regime
├── cost-model.js             # Spread + slippage + fees per asset class
└── __tests__/                # Unit tests for every module
```

#### Per-Bot Component Registry

Each bot has a different set of signal components. The committee scorer accepts a configurable registry rather than a hardcoded 7-component list.

```js
// Per-bot component configurations:
const BOT_COMPONENTS = {
  stock: {
    components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence'],
    neutralDefaults: { displacement: 0.3, fvg: 0.3 },  // when signal absent
    defaultWeights: { momentum: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, volumeRatio: 0.15, mtfConfluence: 0.0 }
  },
  forex: {
    components: ['trend', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'macd', 'mtfConfluence'],
    neutralDefaults: { displacement: 0.0, fvg: 0.0 },  // forex uses binary 0 when absent
    defaultWeights: { trend: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, macd: 0.15, mtfConfluence: 0.0 }
  },
  crypto: {
    components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence'],
    neutralDefaults: { displacement: 0.3, fvg: 0.3 },  // v14.1 neutral defaults
    defaultWeights: { momentum: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, volumeRatio: 0.15, mtfConfluence: 0.0 }
  }
};
```

The committee scorer's return type uses dynamic keys:

```js
// components: Record<string, number> — keys come from the bot's component list
```

This allows each bot to register its own signal set while sharing the scoring, calibration, and analytics infrastructure.

#### Regime Detection and Label Mapping

The live bots currently classify regimes as `low | medium | high` (ATR percentile buckets). The canonical pipeline uses semantic labels `trending | ranging | volatile` which map to the same underlying ATR thresholds:

```js
// Regime mapping (bidirectional):
const REGIME_MAP = {
  low:    'ranging',     // Low ATR = range-bound, mean-reverting
  medium: 'trending',    // Medium ATR = directional moves
  high:   'volatile'     // High ATR = wide swings, uncertainty
};
const REGIME_REVERSE = { ranging: 'low', trending: 'medium', volatile: 'high' };

// regime-detector.js returns semantic labels.
// During Phase 3 migration, consumer sites that use 'low'/'medium'/'high'
// are updated to use 'ranging'/'trending'/'volatile'.
// Known consumer sites that must be updated per bot:
//   - Position sizing multiplier (regime → size factor)
//   - Max positions per regime
//   - Threshold adjustments per regime
//   - Stop loss config per regime
//   - Strategy-regime performance table (DB column values)
```

The migration commit for each bot includes a find-and-replace of the old labels plus a DB migration to update existing `strategy_regime_performance` rows.

#### Function Contracts

```js
// Every signal component follows this shape:
function compute<Component>(marketData, config) → {
  score: number,    // 0-1 normalized
  raw: object,      // intermediate values for debugging
  meta: object      // optional metadata
}

// Committee scorer aggregates registered components:
function computeCommitteeScore(signals, weights, regime, botConfig) → {
  confidence: number,                 // 0-1 weighted average
  calibrated: number,                 // 0-1 after Platt scaling (actual win probability)
  components: Record<string, number>, // per-component scores (keys from botConfig)
  regime: string,                     // 'trending' | 'ranging' | 'volatile'
  ev: number                          // expected value after costs
}

// Entry qualifier makes the final decision:
function qualifyEntry(committee, portfolio, costs) → {
  qualified: boolean,
  reason: string,             // why rejected (if not qualified)
  ev: number,                 // expected value after costs
  allocationFactor: number    // 0.1-1.5x position sizing multiplier
}

// Stop manager computes adaptive stops:
function computeStops(bars, regime, direction, entry, config) → {
  stopLoss: number,
  profitTarget: number,
  trailingActivation: number,
  trailingDistance: number,
  atr: number,
  stopMultiplier: number,
  targetMultiplier: number
}
```

#### Multi-Timeframe Confluence (New Component)

```js
// services/signals/multi-timeframe.js
function computeMTFScore(bars1m, bars15m, bars1h, bars4h, direction) → {
  score: number,      // 0 (all conflicting) to 1 (all aligned with direction)
  trends: {
    m15: 'bullish' | 'bearish' | 'neutral',
    h1:  'bullish' | 'bearish' | 'neutral',
    h4:  'bullish' | 'bearish' | 'neutral'
  },
  alignment: number   // fraction of timeframes aligned (0, 0.33, 0.67, 1.0)
}
```

Trend detection per timeframe: SMA20 slope over last 5 bars. Bullish if slope > 0 and price > SMA20. Bearish if slope < 0 and price < SMA20. Neutral otherwise.

Score = fraction of higher timeframes aligned with trade direction. A long trade with bearish 1h and 4h scores 0. A long trade with bullish 15m, 1h, and 4h scores 1.0.

#### Adaptive Stops (ATR-Based)

```js
// services/signals/stop-manager.js
// Default multipliers per regime:
const STOP_CONFIG = {
  trending:  { stopMult: 1.5, targetMult: 3.0, trailActivation: 1.0, trailDistance: 1.5 },
  ranging:   { stopMult: 1.0, targetMult: 2.0, trailActivation: 0.7, trailDistance: 1.0 },
  volatile:  { stopMult: 2.0, targetMult: 4.0, trailActivation: 1.5, trailDistance: 2.0 }
};
// Stop = entry - (ATR14 * stopMult), Target = entry + (ATR14 * targetMult)
```

Why: A 4% fixed stop on a stock with 0.5% ATR is 8 ATRs away (never triggers on losers). A 4% stop on crypto with 3% ATR is 1.3 ATRs (triggers on normal noise). ATR-based stops adapt to actual instrument volatility.

### Layer 2: Backtesting Engine (`services/backtesting-js/`)

Node.js replay engine that feeds historical bars through the canonical signal pipeline.

```
services/backtesting-js/
├── data-loader.js        # Fetch + cache historical OHLCV (all timeframes)
├── replay-engine.js      # Bar-by-bar simulation loop
├── trade-simulator.js    # Entry/exit with realistic costs
├── analytics.js          # Signal attribution + noise detection
└── cli.js                # Command-line interface
```

#### Data Loader

```js
// Providers per asset class:
// Stocks:  Alpaca historical bars API
// Forex:   OANDA candles API
// Crypto:  Kraken OHLC API

async function loadBars(bot, symbol, timeframe, days) → {
  bars: [{ time, open, high, low, close, volume }],
  source: string,
  cached: boolean
}

// Multi-timeframe loading (required for MTF confluence component):
async function loadMultiTimeframeBars(bot, symbol, days) → {
  m5:  [Bar],    // 5-minute bars (primary replay timeframe)
  m15: [Bar],    // 15-minute bars
  h1:  [Bar],    // 1-hour bars
  h4:  [Bar],    // 4-hour bars
  d1:  [Bar]     // daily bars (for regime detection)
}

// Higher-timeframe bars are loaded independently from the provider API,
// NOT aggregated from lower timeframes. This avoids subtle aggregation bugs.
// Each timeframe is fetched and cached separately.

// Cache: local JSON files in services/backtesting-js/cache/
// Cache key: {bot}_{symbol}_{timeframe}_{startDate}_{endDate}.json
// TTL: 24 hours for intraday bars, 7 days for daily bars

// Failure handling:
// - Provider API unreachable → throw with clear error, abort backtest
// - Partial data returned → log warning, skip symbol if < warmupPeriod bars
// - Zero-volume bars → kept in dataset but volume-dependent components
//   (orderFlow, volumeRatio) receive neutral score (0.5) for those bars
```

Supported timeframes: 1m, 5m, 15m, 1h, 4h, 1D.
Supported lookbacks: 30, 60, 90 days (configurable).

#### Warmup Period

Each signal component declares its minimum required bar count:

```js
const WARMUP_REQUIREMENTS = {
  momentum:      1,    // just needs current bar's change
  orderFlow:     1,    // just needs current orderbook
  displacement:  5,    // needs 5 bars for body-size comparison
  volumeProfile: 50,   // needs 50 bars to build profile
  fvg:           3,    // needs 3 consecutive bars
  volumeRatio:   20,   // needs 20-bar average volume
  trend:         25,   // SMA20 + 5 bars for slope
  macd:          35,   // 26-period EMA + signal line
  mtfConfluence: 25,   // SMA20 + 5 bars per timeframe
  regimeDetector: 14,  // ATR14
  stopManager:    14   // ATR14
};

// Effective warmup = max of all registered components for the bot
// Stock/Crypto: max(1,1,5,50,3,20,25,14,14) = 50 bars
// Forex: max(25,1,5,50,3,35,25,14,14) = 50 bars
```

The replay engine skips the first `warmupPeriod` bars and only starts generating signals after all components have sufficient history.

#### Multi-Timeframe Bar Alignment in Replay

During replay, higher-timeframe bars must be treated as "completed" only when their period has elapsed:

```js
// At replay step i (processing 5m bar at time T):
// - m15 bar is "current" = the last 15m bar whose close_time <= T
// - h1 bar is "current" = the last 1h bar whose close_time <= T
// - h4 bar is "current" = the last 4h bar whose close_time <= T
//
// This prevents lookahead: we never use a 4h bar that hasn't closed yet.
// Implementation: binary search into pre-loaded higher-TF bars for
// the latest bar with close_time <= current_5m_bar.time
```

#### Replay Engine

```js
async function replay(config) → {
  trades: [TradeResult],
  signals: [SignalSnapshot],     // every bar's signal scores (for IC calculation)
  summary: { totalTrades, winRate, profitFactor, sharpe, maxDrawdown, netPnl }
}

// config shape:
{
  bot: 'stock' | 'forex' | 'crypto',
  symbols: string[],               // which symbols to replay
  timeframe: '5m',                 // primary bar size
  days: 60,                        // lookback
  weights: object,                 // committee weights (or use bot defaults)
  threshold: 0.45,                 // confidence threshold
  regimeWeights: object,           // optional: component × regime weight matrix
  costModel: 'stock' | 'forex' | 'crypto',
  botConfig: object                // from BOT_COMPONENTS[bot]
}
```

Core loop (pseudocode):
```
for each symbol:
  { m5, m15, h1, h4, d1 } = dataLoader.loadMultiTimeframeBars(bot, symbol, days)
  if m5.length < warmupPeriod: log warning, skip symbol

  for i = warmupPeriod to m5.length:
    window = m5[i - warmupPeriod .. i]
    mtfBars = { m15: latestCompleted(m15, m5[i].time),
                h1:  latestCompleted(h1, m5[i].time),
                h4:  latestCompleted(h4, m5[i].time) }
    signals = computeAllSignals(window, mtfBars, botConfig)
    committee = computeCommitteeScore(signals, weights, regime, botConfig)
    snapshot = { time: m5[i].time, symbol, committee, components, regime }

    if committee.qualified and no open position:
      open simulated position at m5[i+1].open   // NO lookahead bias

    for each open position:
      check stopLoss, profitTarget, trailingStop against m5[i]
      if hit → close position, record trade result with signal snapshot

    record signal snapshot (for IC calculation on non-trade bars too)
```

**Critical anti-bias rules:**
- Entry fills at next bar's open (not current bar's close)
- Stop loss exits: fill at `min(stopPrice, nextBar.open)` for longs, `max(stopPrice, nextBar.open)` for shorts — simulates gap-through risk
- Profit target exits: fill at target price if bar's range includes it, otherwise next bar's open
- Trailing stop exits: same gap-through rule as stop losses
- Signals only see completed bars (no intra-bar peeking)
- Higher-timeframe bars only used after their period closes (no lookahead)
- Costs deducted from every trade (no free-commission fantasy)

#### Trade Simulator

```js
// Cost models:
const COSTS = {
  stock:  { spreadPct: 0.02, slippagePct: 0.03, commissionPerShare: 0 },
  forex:  { spreadPips: 1.5, slippagePips: 0.5, commissionPct: 0 },
  crypto: { takerFeePct: 0.10, slippagePct: 0.05 }
};

// Round-trip cost:
// stock:  ~0.10% (spread + slippage both ways)
// forex:  ~2.0 pips total
// crypto: ~0.30% (2 × taker + 2 × slippage)
```

#### Trade Result Shape

```json
{
  "symbol": "BTC_USD",
  "direction": "long",
  "entryTime": "2026-03-01T14:30:00Z",
  "exitTime": "2026-03-01T18:45:00Z",
  "entryPrice": 67420,
  "exitPrice": 68105,
  "grossPnlPct": 1.02,
  "costsPct": 0.30,
  "netPnlPct": 0.72,
  "committeeScore": 0.58,
  "calibratedProb": 0.54,
  "components": {
    "momentum": 0.72,
    "orderFlow": 0.61,
    "displacement": 1.0,
    "volumeProfile": 0.45,
    "fvg": 0.3,
    "volumeRatio": 0.55,
    "mtfConfluence": 0.67
  },
  "regime": "trending",
  "exitReason": "trailingStop",
  "holdBars": 51
}
```

### Layer 3: Analytics Engine (`services/backtesting-js/analytics.js`)

Five analyses that answer the hard questions:

#### Analysis 1: Information Coefficient (IC) per Component

```js
function computeIC(trades, componentName) → {
  ic: number,           // Spearman rank correlation with forward P&L
  pValue: number,       // statistical significance
  significant: boolean, // p < 0.05
  classification: 'signal' | 'weak' | 'noise' | 'contrarian' | 'insufficient_data',
  n: number,            // sample size
  ci95: [number, number] // 95% confidence interval for IC
}
```

**Classification rules (with minimum sample sizes):**

| Classification | Criteria | Min n |
|---|---|---|
| `signal` | IC > 0.03, lower bound of 95% CI > 0, p < 0.05 | 100 |
| `weak` | IC > 0.02, p < 0.10 | 100 |
| `noise` | 95% CI includes zero, or p >= 0.10 | 100 |
| `contrarian` | IC < -0.03, upper bound of 95% CI < 0, p < 0.05 | 100 |
| `insufficient_data` | n < 100 | — |

Uses Spearman rank correlation (non-parametric, robust to outliers) between each component's score at entry and the trade's net P&L. Confidence intervals computed via Fisher z-transformation.

**Note:** IC thresholds of 0.02-0.05 are typical for short-horizon trading signals. These thresholds should be recalibrated after the first full backtest run across all bots — if all components show IC < 0.03, the thresholds may need lowering. The noise report flags when this situation occurs.

#### Analysis 2: Component Correlation Matrix

```js
function correlationMatrix(trades) → {
  matrix: number[][],       // N×N Spearman correlation matrix (N = bot's component count)
  redundantPairs: [         // pairs with |r| > 0.6
    { a: string, b: string, r: number, recommendation: string }
  ]
}
```

If two components correlate > 0.6, recommend: keep the one with higher IC, reduce or remove the other.

#### Analysis 3: Regime-Conditional IC

```js
function regimeConditionalIC(trades) → {
  matrix: {                  // component × regime
    [component]: {
      trending: { ic, pValue, n, ci95, classification },
      ranging:  { ic, pValue, n, ci95, classification },
      volatile: { ic, pValue, n, ci95, classification }
    }
  },
  recommendations: [
    "momentum is signal in trending (IC=0.12, n=85) but noise in ranging (IC=0.01, n=62)",
    "volumeProfile is signal in ranging (IC=0.14, n=71) but noise in trending (IC=0.01, n=90)"
  ]
}
```

Per-regime n will be smaller than total n. If a regime has < 30 trades, the cell is marked `insufficient_data` rather than making a classification.

Enables regime-conditional weights: a weight matrix (component × regime) instead of one flat weight vector.

#### Analysis 4: Threshold Optimization

```js
function sweepThresholds(replayFn, config, range) → {
  results: [
    { threshold, trades, winRate, profitFactor, sharpe, maxDrawdown, netPnl }
  ],
  optimal: number,          // threshold maximizing sharpe × netPnl
  current: number,          // current threshold for comparison
  improvement: string       // "raising from 0.45 to 0.52 improves sharpe by 21%"
}
// range: { min: 0.30, max: 0.70, step: 0.05 }
```

Runs full replay at each threshold level. **Computationally expensive** — runs via CLI only (`--sweep-threshold`), not triggered by API requests. Expected runtime: 1-5 minutes per bot (9 threshold levels × replay). The dashboard endpoint `/api/{bot}/threshold-curve` serves cached results from the most recent CLI sweep.

#### Analysis 5: Edge Decay Estimation

```js
function estimateDecay(trades, componentName, windowSize) → {
  windows: [
    { startDate, endDate, ic, pValue, n }
  ],
  halfLife: number | null,  // days until IC halves (null if stable or insufficient data)
  stable: boolean,          // true if IC variance < 0.02 across windows
  recommendation: string    // "use 14-day lookback" or "stable, 90-day is fine"
}
```

Rolling IC windows (default: 50 trades per window, sliding by 25). If IC degrades over time, recommends shorter lookback for weight learning. Requires minimum 3 windows (150 trades) to estimate decay; otherwise returns `halfLife: null, stable: null, recommendation: "insufficient data"`.

#### Noise Report (Full Output)

```js
function generateNoiseReport(trades, botConfig) → {
  bot: string,
  tradeCount: number,
  dateRange: { from, to },
  componentRankings: [
    { name, ic, ci95, pValue, classification, currentWeight, recommendedWeight }
  ],
  redundantPairs: [...],
  regimeMatrix: {...},
  optimalThreshold: { value, sharpe, improvement },
  decayEstimates: { [component]: { halfLife, stable } },
  recommendations: [
    "KILL: fvg (IC=-0.01, p=0.72) — pure noise, adds no predictive value",
    "MERGE: momentum + volumeRatio (r=0.71) — keep momentum (IC=0.12), reduce volumeRatio weight",
    "REGIME GATE: momentum only in trending/volatile (noise in ranging)",
    "RAISE THRESHOLD: 0.45 → 0.52 (sharpe +21%, fewer noise trades)",
    "ADD: mtfConfluence (IC=0.14) — highest single-component IC",
    "SHORTEN LOOKBACK: displacement half-life 7 days, use 14-day weight window"
  ],
  warnings: [
    // Triggered when all components show IC < 0.03:
    "ALL COMPONENTS WEAK: No component shows strong IC. Consider recalibrating thresholds or reviewing data quality.",
    // Triggered when total trades < 100:
    "LOW TRADE COUNT: Only N trades available. Results may not be statistically reliable."
  ]
}
```

### Layer 4: Dashboard — Signal Intelligence Page

New page at `/signals` with three panels.

#### Panel 1: Component Health Card

Displays each component's IC, classification (signal/weak/noise), and recommended vs current weight. Color-coded: green for signal, yellow for weak, red for noise. Shows redundancy warnings and optimal threshold recommendation.

#### Panel 2: Regime × Component Heatmap

N×3 grid (N components × 3 regimes, where N depends on bot). Cell color = IC value (green = high positive IC, white = zero, red = negative). Hovering shows exact IC, p-value, trade count, confidence interval. Cells with insufficient data are grayed out.

#### Panel 3: Trade Signal Timeline

Scrollable list of recent trades. Each row shows: time, symbol, direction, P&L, committee score, bar chart of component scores, regime badge, exit reason. Expandable to show full signal snapshot.

#### New API Endpoints

Following the existing per-bot routing pattern (each bot serves its own endpoints on its own port):

```
# Stock bot (port 3002)
GET  /api/trading/noise-report       → latest noise analysis
GET  /api/trading/signal-timeline    → recent trades with full signal attribution
GET  /api/trading/regime-heatmap     → component × regime IC matrix
GET  /api/trading/threshold-curve    → cached threshold sweep results
POST /api/trading/noise-report/refresh → regenerate noise report on-demand

# Forex bot (port 3005)
GET  /api/forex/noise-report
GET  /api/forex/signal-timeline
GET  /api/forex/regime-heatmap
GET  /api/forex/threshold-curve
POST /api/forex/noise-report/refresh

# Crypto bot (port 3006)
GET  /api/crypto/noise-report
GET  /api/crypto/signal-timeline
GET  /api/crypto/regime-heatmap
GET  /api/crypto/threshold-curve
POST /api/crypto/noise-report/refresh
```

These endpoints serve cached analytics data (not re-running backtests on every request). Noise report regenerated: on bot startup, every 4 hours, and on-demand via the refresh endpoint.

### Layer 5: Bot Migration

**Phase 1:** Build canonical pipeline + backtester. Zero changes to live bots.

**Phase 2:** Run backtests across all 3 bots. Generate noise reports. Identify what to change.

**Phase 3:** Migrate live bots one at a time (crypto → forex → stock):

```js
// Replace ~80 lines of inline committee scoring with:
const { computeCommitteeScore, qualifyEntry, computeStops } = require('../../services/signals');
```

Each bot passes its own `botConfig` (from `BOT_COMPONENTS[bot]`) which controls:
- Which components are active
- Neutral default scores when a signal is absent
- Default weight values
- Regime label mapping (old → new)

**Known per-bot differences to preserve during migration:**

| Difference | Stock | Forex | Crypto |
|---|---|---|---|
| Components | momentum, orderFlow, displacement, volumeProfile, fvg, volumeRatio | trend, orderFlow, displacement, volumeProfile, fvg, macd | momentum, orderFlow, displacement, volumeProfile, fvg, volumeRatio |
| Neutral defaults (displacement) | 0.3 | 0.0 | 0.3 |
| Neutral defaults (fvg) | 0.3 | 0.0 | 0.3 |
| Regime labels (current) | low/medium/high | low/medium/high | low/medium/high |

**Migration verification:** For each bot, run the backtester with identical input data using (a) the inline code and (b) the canonical pipeline with bot-specific config. Output signal scores must match within floating-point tolerance (< 0.001 absolute difference per component). Test script: `node services/backtesting-js/verify-migration.js --bot crypto`.

**Regime migration:** Each bot's migration commit includes:
1. Replace `low`/`medium`/`high` with `ranging`/`trending`/`volatile` in all consumer sites
2. SQL migration: `UPDATE strategy_regime_performance SET regime = CASE regime WHEN 'low' THEN 'ranging' WHEN 'medium' THEN 'trending' WHEN 'high' THEN 'volatile' END WHERE bot = '{bot}'`

**Phase 4:** Apply noise report recommendations:
- Remove or zero-weight noise components
- Implement regime-conditional weight matrix
- Adjust thresholds per bot
- Switch to ATR-based stops
- Add MTF confluence as new component

Each change validated by backtester before deploying to live.

---

## Failure Handling

### Data Loader Failures

| Failure | Behavior |
|---|---|
| Provider API unreachable | Throw with clear error message, abort backtest for that bot |
| Provider returns partial data | Log warning with symbol + missing date range. Skip symbol if available bars < warmupPeriod |
| Symbol not found / delisted | Log warning, skip symbol, continue with remaining symbols |
| Rate limit hit | Exponential backoff (1s, 2s, 4s), max 3 retries, then skip symbol |
| Cache corruption | Delete cache file, re-fetch from provider |

### Replay Engine Failures

| Failure | Behavior |
|---|---|
| Zero-volume bars | Keep bar in dataset. Volume-dependent components (orderFlow, volumeRatio) receive neutral score (0.5) |
| Symbol has < warmupPeriod bars | Skip symbol, log warning |
| NaN/Infinity in signal computation | Log error with full context (bar data, component, input values). Score that component as 0.0 for that bar. Count NaN occurrences in summary |
| All symbols skipped | Abort with error: "No valid symbols for backtest" |

### Analytics Failures

| Failure | Behavior |
|---|---|
| Too few trades for IC (< 100) | Classification = `insufficient_data`, skip from rankings |
| Too few trades per regime (< 30) | That regime cell = `insufficient_data` in heatmap |
| Too few windows for decay (< 3) | `halfLife: null`, recommendation: "insufficient data" |
| All components classified as noise | Add warning to noise report, suggest reviewing data quality or signal logic |

---

## CLI Usage

```bash
# Basic backtest
node services/backtesting-js/cli.js --bot crypto --days 60 --timeframe 5m

# Threshold sweep (CLI only, async, 1-5 min per bot)
node services/backtesting-js/cli.js --bot stock --days 90 --sweep-threshold 0.30,0.70,0.05

# Noise report only (uses cached backtest data)
node services/backtesting-js/cli.js --bot forex --noise-report

# Full analysis (backtest + noise report + threshold sweep)
node services/backtesting-js/cli.js --bot crypto --days 60 --full-analysis

# Compare before/after a change
node services/backtesting-js/cli.js --bot crypto --days 60 --compare weights-old.json weights-new.json

# Verify migration equivalence
node services/backtesting-js/verify-migration.js --bot crypto
```

---

## Success Criteria

1. Backtester produces identical signal scores as live bot for the same input data (verified by `verify-migration.js`, < 0.001 divergence per component)
2. Noise report correctly identifies at least one component as noise or redundant (validated manually against trade data)
3. Threshold optimization finds a threshold that improves Sharpe ratio over current 0.45 baseline
4. ATR-based stops reduce stopped-out-by-noise rate vs fixed % stops (measured in backtest)
5. MTF confluence component has positive IC (> 0.03, p < 0.05) in at least one regime with n >= 100
6. Dashboard signals page renders noise report, heatmap, and timeline without errors
7. Bot migration produces identical trade decisions (backtester comparison, < 0.001 divergence)

---

## Non-Goals

- Real-time streaming data in backtester (bar-by-bar replay is sufficient)
- GPU-accelerated analytics (trade counts are in hundreds, not millions)
- Automated parameter optimization / genetic algorithms (manual review of noise report is intentional)
- Mobile dashboard (desktop browser only for signals page)
- Python backtester replacement (the Python code stays for separate use; this is the Node.js canonical version)
