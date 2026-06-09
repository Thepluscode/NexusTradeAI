# Bot Architecture Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate ~18K lines of duplicated signal code across 3 trading bots by extracting shared modules, breaking monoliths into composable units, and removing the deploy/client mirror.

**Architecture:** Three phases, each independently deployable. Phase 1 wires bots to the existing `services/signals/` shared library (already has tests). Phase 2 extracts non-signal code (routes, DB, auth, indicators) into shared modules. Phase 3 eliminates the deploy/client file mirror by making `clients/bot-dashboard/` the single deployment source.

**Tech Stack:** Node.js, Express, PostgreSQL, Jest, GitHub Actions, Railway

**Critical Constraint:** All 3 bots are LIVE on Railway executing real trades. Every phase must be backward-compatible. If any bot fails health check after deploy, Railway auto-rolls back (5 retries). The deploy pipeline auto-syncs `clients/bot-dashboard/unified-*.js` → `deploy/*/bot.js` on every push.

---

## Current State

### The Problem

Each bot file is a 5,000–7,400 line monolith containing everything: Express server, trading engine, signal generation, risk management, API routes, DB queries, auth, health checks. Six signal functions are duplicated inline in all 3 bots (~300 lines × 3 = 900 lines). `signal-analytics.js` is byte-identical across all 3 deploy directories (376 lines × 3). The `clients/` and `deploy/` directories are exact mirrors synced by CI.

### What Already Exists

`services/signals/` has **tested, modular versions** of all 6 signal components:

| Shared Module | File | Interface | Bot Inline Equivalent |
|---|---|---|---|
| `computeOrderFlow(bars, lookback)` | `order-flow.js` | `{score, raw, meta}` | `calculateOrderFlowImbalance(klines, lookback)` → number |
| `computeDisplacement(bars, atr, lookback)` | `displacement.js` | `{score, raw, meta}` | `isDisplacementCandle(klines, atr, lookback)` → boolean |
| `computeVolumeProfile(bars, config)` | `volume-profile.js` | `{score, raw, meta}` | `calculateVolumeProfile(klines, numBuckets)` → `{vah,val,poc}` |
| `computeFVG(bars, config)` | `fvg-detector.js` | `{score, raw, meta}` | `detectFairValueGaps(klines, lookback)` → `{bullish,bearish,gaps}` |
| `detectRegime(bars, config)` | `regime-detector.js` | `{regime, atr, atrPercent}` | `detectCryptoRegime(klines)` → string |
| `computeCommitteeScore(signals, botConfig)` | `committee-scorer.js` | `{confidence, components}` | `computeCryptoCommitteeScore(signal)` → number |

**Key difference:** Shared modules expect normalized bars `{open, high, low, close, volume}`. Bots use raw formats:
- **Crypto/Stock:** Arrays `[time, open, high, low, close, volume]` from exchange APIs
- **Forex:** Objects `{mid: {o, h, l, c}}` from OANDA (no volume data — uses conviction-weighting)

### File Map

```
services/signals/           ← Shared library (source of truth after Phase 1)
├── order-flow.js           ← computeOrderFlow
├── displacement.js         ← computeDisplacement
├── volume-profile.js       ← computeVolumeProfile
├── fvg-detector.js         ← computeFVG
├── regime-detector.js      ← detectRegime, computeATR
├── committee-scorer.js     ← computeCommitteeScore, BOT_COMPONENTS
├── normalizers.js          ← NEW: bar format adapters (Phase 1, Task 1)
├── index.js                ← Re-exports everything
├── __tests__/              ← Existing test suite
└── package.json

clients/bot-dashboard/
├── unified-crypto-bot.js   ← 5,447 lines (source of truth for crypto bot)
├── unified-forex-bot.js    ← 5,623 lines (source of truth for forex bot)
├── unified-trading-bot.js  ← 7,425 lines (source of truth for stock bot)
└── signal-analytics.js     ← 376 lines (identical across all 3)

deploy/
├── crypto-bot/bot.js       ← Mirror of unified-crypto-bot.js (synced by CI)
├── forex-bot/bot.js        ← Mirror of unified-forex-bot.js (synced by CI)
├── stock-bot/bot.js        ← Mirror of unified-trading-bot.js (synced by CI)
└── */signals/              ← NEW: shared modules copied by CI (Phase 1, Task 3)
```

---

## Phase 1: Wire Bots to Shared Signal Library

**Goal:** Replace extractable inline signal functions in each bot with imports from `services/signals/`. Net deletion: ~600 lines across 3 bots. Zero behavior change.

**Scope (what CAN be extracted):**
- `calculateOrderFlowImbalance` — same logic for crypto/stock; forex uses conviction-weighting (handled by compat wrapper)
- `isDisplacementCandle` — identical across all 3 bots
- `calculateVolumeProfile` — same logic, but compat must preserve `lowVolumeNodes` and `null` return on insufficient data
- `detectFairValueGaps` — same for crypto/stock (returns `{bullish: [], bearish: []}`); forex version has extra relaxed-gap logic so stays inline

**Scope (what STAYS inline — too bot-specific):**
- `detectCryptoRegime` / `detectForexRegime` / `detectMarketRegime` — each returns a rich object with bot-specific adjustments, trend routing, and strategy preference weights that the shared module doesn't replicate
- `computeCryptoCommitteeScore` / `computeForexCommitteeScore` / `computeCommitteeScore` — each does custom per-component normalization from raw signal properties (e.g., momentum capped at 15 for crypto), not from pre-computed `{score}` objects
- Forex `detectFairValueGaps` — has body/range ratio filter + "relaxed forex FVG" logic absent from shared module

**Risk:** LOW — shared modules already exist and are tested. Bots keep their engine logic, regime detection, and committee scoring inline. Only the pure signal calculation functions change from inline to imported.

**Rollback:** Revert the commit. Each bot file is self-contained, so reverting restores the inline functions.

---

### Task 1: Create Bar Normalizers

**Files:**
- Create: `services/signals/normalizers.js`
- Test: `services/signals/__tests__/normalizers.test.js`
- Modify: `services/signals/index.js` (add re-export)

The 3 bots use different raw bar formats. The shared signal modules expect `{open, high, low, close, volume}`. This module bridges the gap.

- [ ] **Step 1: Write failing tests for all 3 normalizers**

```javascript
// services/signals/__tests__/normalizers.test.js
const { normalizeCryptoBars, normalizeForexBars, normalizeStockBars } = require('../normalizers');

describe('normalizeCryptoBars', () => {
  test('converts [time,o,h,l,c,v] arrays to {open,high,low,close,volume}', () => {
    const raw = [
      [1700000000, '100.5', '105.0', '99.0', '103.2', '50000'],
      [1700000060, '103.2', '107.0', '102.0', '106.5', '60000']
    ];
    const result = normalizeCryptoBars(raw);
    expect(result).toEqual([
      { open: 100.5, high: 105.0, low: 99.0, close: 103.2, volume: 50000 },
      { open: 103.2, high: 107.0, low: 102.0, close: 106.5, volume: 60000 }
    ]);
  });

  test('returns empty array for null/undefined input', () => {
    expect(normalizeCryptoBars(null)).toEqual([]);
    expect(normalizeCryptoBars(undefined)).toEqual([]);
    expect(normalizeCryptoBars([])).toEqual([]);
  });

  test('handles numeric values (not just strings)', () => {
    const raw = [[1700000000, 100, 105, 99, 103, 50000]];
    const result = normalizeCryptoBars(raw);
    expect(result[0].open).toBe(100);
  });
});

describe('normalizeForexBars', () => {
  test('converts OANDA {mid:{o,h,l,c}} to {open,high,low,close,volume}', () => {
    const raw = [
      { mid: { o: '1.0850', h: '1.0900', l: '1.0820', c: '1.0875' }, volume: 1200 },
      { mid: { o: '1.0875', h: '1.0910', l: '1.0860', c: '1.0890' }, volume: 1500 }
    ];
    const result = normalizeForexBars(raw);
    expect(result).toEqual([
      { open: 1.0850, high: 1.0900, low: 1.0820, close: 1.0875, volume: 1200 },
      { open: 1.0875, high: 1.0910, low: 1.0860, close: 1.0890, volume: 1500 }
    ]);
  });

  test('defaults volume to 0 when missing (OANDA has no tick volume on some endpoints)', () => {
    const raw = [{ mid: { o: '1.0850', h: '1.0900', l: '1.0820', c: '1.0875' } }];
    const result = normalizeForexBars(raw);
    expect(result[0].volume).toBe(0);
  });

  test('returns empty array for null/undefined input', () => {
    expect(normalizeForexBars(null)).toEqual([]);
    expect(normalizeForexBars(undefined)).toEqual([]);
  });
});

describe('normalizeStockBars', () => {
  test('converts Alpaca bars {o,h,l,c,v} to {open,high,low,close,volume}', () => {
    const raw = [
      { o: 150.25, h: 152.00, l: 149.50, c: 151.75, v: 1000000 },
      { o: 151.75, h: 153.50, l: 151.00, c: 153.00, v: 1200000 }
    ];
    const result = normalizeStockBars(raw);
    expect(result).toEqual([
      { open: 150.25, high: 152.00, low: 149.50, close: 151.75, volume: 1000000 },
      { open: 151.75, high: 153.50, low: 151.00, close: 153.00, volume: 1200000 }
    ]);
  });

  test('handles already-normalized bars (passthrough)', () => {
    const raw = [{ open: 100, high: 105, low: 99, close: 103, volume: 50000 }];
    const result = normalizeStockBars(raw);
    expect(result[0].open).toBe(100);
  });

  test('returns empty array for null/undefined input', () => {
    expect(normalizeStockBars(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd services/signals && npx jest __tests__/normalizers.test.js -v
```
Expected: FAIL — `normalizers` module not found.

- [ ] **Step 3: Implement normalizers**

```javascript
// services/signals/normalizers.js

/**
 * Bar normalizers — convert exchange-specific OHLCV formats to the
 * shared {open, high, low, close, volume} shape used by all signal modules.
 *
 * Crypto (Binance/Kraken): [timestamp, open, high, low, close, volume]
 * Forex (OANDA):           {mid: {o, h, l, c}, volume}
 * Stock (Alpaca):          {o, h, l, c, v} or already normalized
 */

function normalizeCryptoBars(klines) {
  if (!klines || !klines.length) return [];
  return klines.map(k => ({
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]) || 0
  }));
}

function normalizeForexBars(candles) {
  if (!candles || !candles.length) return [];
  return candles.map(c => ({
    open:   parseFloat(c.mid.o),
    high:   parseFloat(c.mid.h),
    low:    parseFloat(c.mid.l),
    close:  parseFloat(c.mid.c),
    volume: c.volume || 0
  }));
}

function normalizeStockBars(bars) {
  if (!bars || !bars.length) return [];
  return bars.map(b => ({
    open:   b.open ?? b.o,
    high:   b.high ?? b.h,
    low:    b.low  ?? b.l,
    close:  b.close ?? b.c,
    volume: b.volume ?? b.v ?? 0
  }));
}

module.exports = { normalizeCryptoBars, normalizeForexBars, normalizeStockBars };
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd services/signals && npx jest __tests__/normalizers.test.js -v
```
Expected: 9 tests PASS.

- [ ] **Step 5: Add re-export to index.js**

Add to `services/signals/index.js`:
```javascript
const { normalizeCryptoBars, normalizeForexBars, normalizeStockBars } = require('./normalizers');
```
And add to the `module.exports` object:
```javascript
normalizeCryptoBars, normalizeForexBars, normalizeStockBars,
```

- [ ] **Step 6: Commit**

```bash
git add services/signals/normalizers.js services/signals/__tests__/normalizers.test.js services/signals/index.js
git commit -m "feat(signals): add bar normalizers for crypto/forex/stock formats"
```

---

### Task 2: Update Deploy Pipeline to Sync Shared Signals

**Files:**
- Modify: `.github/workflows/deploy.yml:136-157`
- Modify: `deploy/stock-bot/package.json` (no change needed — signals are plain JS)
- Modify: `deploy/forex-bot/package.json` (same)
- Modify: `deploy/crypto-bot/package.json` (same)

The deploy pipeline must copy `services/signals/*.js` into each deploy directory so Railway can resolve the imports.

- [ ] **Step 1: Add signals sync step to deploy.yml**

In `.github/workflows/deploy.yml`, after the existing bot sync block (line 152), add:

```yaml
          # Sync shared signal modules to each deploy dir
          mkdir -p deploy/stock-bot/signals deploy/forex-bot/signals deploy/crypto-bot/signals
          for f in order-flow displacement volume-profile fvg-detector regime-detector committee-scorer normalizers index cost-model entry-qualifier stop-manager exit-manager confidence-calibrator health-monitor momentum macd multi-timeframe trend volume-ratio; do
            [ -f "services/signals/${f}.js" ] && cp "services/signals/${f}.js" "deploy/stock-bot/signals/${f}.js"
            [ -f "services/signals/${f}.js" ] && cp "services/signals/${f}.js" "deploy/forex-bot/signals/${f}.js"
            [ -f "services/signals/${f}.js" ] && cp "services/signals/${f}.js" "deploy/crypto-bot/signals/${f}.js"
          done
          echo "Signal modules synced to deploy dirs"
```

- [ ] **Step 2: Verify locally that the sync produces correct output**

```bash
mkdir -p /tmp/test-deploy-sync
for f in order-flow displacement volume-profile fvg-detector regime-detector committee-scorer normalizers index; do
  [ -f "services/signals/${f}.js" ] && cp "services/signals/${f}.js" "/tmp/test-deploy-sync/${f}.js"
done
ls -la /tmp/test-deploy-sync/
rm -rf /tmp/test-deploy-sync
```
Expected: 8 .js files copied.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: sync services/signals/ to deploy dirs for Railway"
```

---

### Task 3: Create Compatibility Wrappers

**Files:**
- Create: `services/signals/compat.js`
- Test: `services/signals/__tests__/compat.test.js`

The inline bot functions return simple values (number, boolean, plain object). The shared modules return `{score, raw, meta}`. Rather than changing every call site in 3 bot files (risky), we create thin wrappers that accept raw bar formats and return the old interface.

- [ ] **Step 1: Write failing tests for compat wrappers**

```javascript
// services/signals/__tests__/compat.test.js
const {
  calculateOrderFlowImbalance,
  isDisplacementCandle,
  calculateVolumeProfile,
  detectFairValueGaps,
} = require('../compat');

describe('compat: calculateOrderFlowImbalance', () => {
  test('returns a number between -1 and 1 (crypto format)', () => {
    const klines = [
      [0, '100', '105', '99', '104', '500'],  // up candle
      [1, '104', '110', '103', '108', '600'],  // up candle
      [2, '108', '109', '100', '101', '400'],  // down candle
    ];
    const result = calculateOrderFlowImbalance(klines, 3, 'crypto');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });

  test('returns 0 for empty input', () => {
    expect(calculateOrderFlowImbalance([], 20, 'crypto')).toBe(0);
    expect(calculateOrderFlowImbalance(null, 20, 'crypto')).toBe(0);
  });

  test('forex mode uses conviction weighting (no volume)', () => {
    const candles = [
      { mid: { o: '1.0800', h: '1.0850', l: '1.0790', c: '1.0840' } },
      { mid: { o: '1.0840', h: '1.0860', l: '1.0810', c: '1.0820' } },
    ];
    const result = calculateOrderFlowImbalance(candles, 2, 'forex');
    expect(typeof result).toBe('number');
  });
});

describe('compat: isDisplacementCandle', () => {
  test('returns boolean (crypto format)', () => {
    const klines = [
      [0, '100', '110', '99', '109', '1000'],  // big body, big range
    ];
    const result = isDisplacementCandle(klines, 5, 1, 'crypto');
    expect(typeof result).toBe('boolean');
  });

  test('returns false for empty input', () => {
    expect(isDisplacementCandle([], 5, 1, 'crypto')).toBe(false);
  });
});

describe('compat: calculateVolumeProfile', () => {
  test('returns {vah, val, poc, lowVolumeNodes, bucketSize} object (crypto format)', () => {
    const klines = [];
    for (let i = 0; i < 25; i++) {
      klines.push([i, String(100 + i), String(105 + i), String(98 + i), String(103 + i), '1000']);
    }
    const result = calculateVolumeProfile(klines, 50, 'crypto');
    expect(result).toHaveProperty('vah');
    expect(result).toHaveProperty('val');
    expect(result).toHaveProperty('poc');
    expect(result).toHaveProperty('lowVolumeNodes');
    expect(result).toHaveProperty('bucketSize');
    expect(Array.isArray(result.lowVolumeNodes)).toBe(true);
    expect(typeof result.vah).toBe('number');
  });

  test('returns null for insufficient data (< 20 bars)', () => {
    const klines = [];
    for (let i = 0; i < 10; i++) {
      klines.push([i, String(100 + i), String(105 + i), String(98 + i), String(103 + i), '1000']);
    }
    expect(calculateVolumeProfile(klines, 50, 'crypto')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(calculateVolumeProfile([], 50, 'crypto')).toBeNull();
  });
});

describe('compat: detectFairValueGaps', () => {
  test('returns {bullish: [...], bearish: [...]} arrays (crypto format)', () => {
    // Create bars with a bullish FVG: bar[2].low > bar[0].high and bar[1] closed up
    const klines = [
      [0, '100', '102', '99', '101', '1000'],   // prev: high=102
      [1, '103', '108', '102', '107', '2000'],   // curr: closed up (107 > 103)
      [2, '109', '112', '108', '111', '1500'],   // next: low=108 > prev.high=102 → bullish FVG
      [3, '111', '115', '110', '114', '1000'],
      [4, '114', '118', '113', '117', '1000'],
    ];
    const result = detectFairValueGaps(klines, 5, 'crypto');
    expect(result).toHaveProperty('bullish');
    expect(result).toHaveProperty('bearish');
    expect(Array.isArray(result.bullish)).toBe(true);
    expect(Array.isArray(result.bearish)).toBe(true);
    // Should detect at least one bullish FVG
    expect(result.bullish.length).toBeGreaterThan(0);
    expect(result.bullish[0]).toHaveProperty('gapLow');
    expect(result.bullish[0]).toHaveProperty('gapHigh');
  });

  test('returns empty arrays for input with no gaps', () => {
    const result = detectFairValueGaps([], 5, 'crypto');
    expect(result).toEqual({ bullish: [], bearish: [] });
  });
});

```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd services/signals && npx jest __tests__/compat.test.js -v
```

- [ ] **Step 3: Implement compat wrappers**

```javascript
// services/signals/compat.js
/**
 * Backward-compatible wrappers around shared signal modules.
 * These accept raw exchange-specific bar formats and return the
 * same interface as the old inline functions, so call sites in
 * bot.js files need zero changes.
 *
 * Usage in bots:
 *   const { calculateOrderFlowImbalance } = require('./signals/compat');
 *   const imbalance = calculateOrderFlowImbalance(klines, 20, 'crypto');
 */
const { normalizeCryptoBars, normalizeForexBars, normalizeStockBars } = require('./normalizers');
const { computeOrderFlow } = require('./order-flow');
const { computeDisplacement } = require('./displacement');
const { computeVolumeProfile } = require('./volume-profile');
const { computeFVG } = require('./fvg-detector');
function normalize(klines, botType) {
  if (!klines || !klines.length) return [];
  if (botType === 'forex') return normalizeForexBars(klines);
  if (botType === 'stock') return normalizeStockBars(klines);
  return normalizeCryptoBars(klines); // default: crypto
}

/**
 * Drop-in replacement for inline calculateOrderFlowImbalance().
 * Returns: number (-1 to +1). 0 = balanced, >0 = buy pressure, <0 = sell pressure.
 *
 * Note: forex mode uses conviction-weighting (body/range ratio) since OANDA
 * has no volume data. This preserves the intentional behavioral difference.
 */
function calculateOrderFlowImbalance(klines, lookback = 20, botType = 'crypto') {
  if (!klines || !klines.length) return 0;

  if (botType === 'forex') {
    // Forex-specific: conviction-weighted (body/range), no volume
    const recent = klines.slice(-lookback);
    let buyPressure = 0, sellPressure = 0;
    for (const candle of recent) {
      const o = parseFloat(candle.mid?.o ?? candle.open);
      const h = parseFloat(candle.mid?.h ?? candle.high);
      const l = parseFloat(candle.mid?.l ?? candle.low);
      const c = parseFloat(candle.mid?.c ?? candle.close);
      const body = Math.abs(c - o);
      const range = h - l;
      if (range === 0) continue;
      const conviction = body / range;
      if (c >= o) buyPressure += conviction;
      else sellPressure += conviction;
    }
    const total = buyPressure + sellPressure;
    return total === 0 ? 0 : (buyPressure - sellPressure) / total;
  }

  // Crypto/Stock: volume-weighted via shared module
  const bars = normalize(klines, botType);
  const result = computeOrderFlow(bars, lookback);
  return result.raw.imbalance; // -1 to +1
}

/**
 * Drop-in replacement for inline isDisplacementCandle().
 * Returns: boolean (true if institutional displacement detected).
 */
function isDisplacementCandle(klines, atr, lookback = 3, botType = 'crypto') {
  if (!klines || !klines.length || !atr) return false;
  const bars = normalize(klines, botType);
  const result = computeDisplacement(bars, atr, lookback);
  return result.raw.detected;
}

/**
 * Drop-in replacement for inline calculateVolumeProfile().
 * Returns: {vah, val, poc, lowVolumeNodes, bucketSize} or null (insufficient data).
 *
 * IMPORTANT: Call sites check `volumeProfile &&` before accessing properties,
 * so returning null on insufficient data preserves the original branching behavior.
 * The lowVolumeNodes array is used for FVG confirmation (checking if FVGs overlap
 * with low-volume zones). It must be computed here since the shared module doesn't.
 */
function calculateVolumeProfile(klines, numBuckets = 50, botType = 'crypto') {
  if (!klines || klines.length < 20) return null;
  const bars = normalize(klines, botType);
  if (bars.length < 20) return null;
  const result = computeVolumeProfile(bars, { numBuckets });
  const { vah, val, poc } = result.raw;
  if (vah === 0 && val === 0 && poc === 0) return null;

  // Compute lowVolumeNodes (buckets with volume < 30% of POC volume)
  // Replicates inline logic from unified-crypto-bot.js:1167-1179
  const allHighs = bars.map(b => b.high);
  const allLows = bars.map(b => b.low);
  const rangeHigh = Math.max(...allHighs);
  const rangeLow = Math.min(...allLows);
  const bucketSize = (rangeHigh - rangeLow) / numBuckets;
  if (bucketSize <= 0) return null;

  const volumeByBucket = new Array(numBuckets).fill(0);
  for (const bar of bars) {
    const lo = Math.max(0, Math.floor((bar.low - rangeLow) / bucketSize));
    const hi = Math.min(numBuckets - 1, Math.floor((bar.high - rangeLow) / bucketSize));
    const span = hi - lo + 1;
    for (let b = lo; b <= hi; b++) volumeByBucket[b] += bar.volume / span;
  }

  // Find POC bucket volume
  let pocBucketVol = 0;
  for (let i = 0; i < numBuckets; i++) {
    if (volumeByBucket[i] > pocBucketVol) pocBucketVol = volumeByBucket[i];
  }

  const lowVolumeNodes = [];
  for (let i = 0; i < numBuckets; i++) {
    if (volumeByBucket[i] < pocBucketVol * 0.30) {
      lowVolumeNodes.push({
        priceLow: rangeLow + i * bucketSize,
        priceHigh: rangeLow + (i + 1) * bucketSize,
        priceMid: rangeLow + (i + 0.5) * bucketSize,
        volumeRatio: pocBucketVol > 0 ? volumeByBucket[i] / pocBucketVol : 0
      });
    }
  }

  return { vah, val, poc, lowVolumeNodes, bucketSize };
}

/**
 * Drop-in replacement for inline detectFairValueGaps().
 * Returns: {bullish: [...], bearish: [...]} — arrays of gap objects.
 *
 * IMPORTANT: Call sites access fvg.bullish and fvg.bearish as arrays.
 * The shared computeFVG returns {bullishCount, bearishCount, gaps} with a flat
 * gaps array using a .type field. This wrapper splits them into separate arrays.
 *
 * NOTE: This is for crypto/stock only. Forex has additional body-ratio filter
 * and "relaxed FVG" logic that must stay inline in the forex bot.
 */
function detectFairValueGaps(klines, lookback = 20, botType = 'crypto') {
  if (!klines || klines.length < 3) return { bullish: [], bearish: [] };
  const bars = normalize(klines, botType);
  const result = computeFVG(bars, { lookback });
  // Split flat gaps array into bullish/bearish arrays (matching inline interface)
  return {
    bullish: result.raw.gaps.filter(g => g.type === 'bullish'),
    bearish: result.raw.gaps.filter(g => g.type === 'bearish')
  };
}

module.exports = {
  calculateOrderFlowImbalance,
  isDisplacementCandle,
  calculateVolumeProfile,
  detectFairValueGaps,
  normalize
};
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd services/signals && npx jest __tests__/compat.test.js -v
```

- [ ] **Step 5: Commit**

```bash
git add services/signals/compat.js services/signals/__tests__/compat.test.js
git commit -m "feat(signals): add compat wrappers preserving inline function interfaces"
```

---

### Task 4: Replace Crypto Bot Inline Signals

**Files:**
- Modify: `clients/bot-dashboard/unified-crypto-bot.js:1045-1229` (delete ~185 lines of inline functions)
- Modify: `clients/bot-dashboard/unified-crypto-bot.js:1-50` (add require)

**Strategy:** Add a `require('./signals/compat')` at the top. Delete the 4 extractable inline function definitions. Keep `detectCryptoRegime` and `computeCryptoCommitteeScore` inline (too bot-specific). Call sites keep their exact function names (the compat module exports them identically).

- [ ] **Step 1: Snapshot current signal outputs for regression comparison**

Create a temporary test that captures current outputs from the inline functions:

```bash
# Run the bot's inline functions in isolation to capture baseline outputs
# This is a manual verification step — run the bot locally and curl:
curl -s http://localhost:3001/api/crypto/status | python3 -c "
import sys,json
d=json.load(sys.stdin)
print('regime:', d.get('regime'))
print('positions:', len(d.get('positions',[])))
" 2>/dev/null || echo "Bot not running — skip baseline (OK for CI, verify manually post-deploy)"
```

- [ ] **Step 2: Add the compat require at the top of unified-crypto-bot.js**

After the existing try-catch signal import block (around line 46), add:

```javascript
// Shared signal functions (compat wrappers preserve old interface)
let sharedSignals;
try {
    sharedSignals = require('./signals/compat');
} catch (e) {
    try { sharedSignals = require('../../services/signals/compat'); } catch (_) {
        sharedSignals = null;
    }
}
```

- [ ] **Step 3: Delete the 6 inline signal functions**

Delete these 4 function definitions (keep the call sites unchanged):
- `calculateOrderFlowImbalance` (lines ~1045-1062)
- `isDisplacementCandle` (lines ~1067-1084)
- `calculateVolumeProfile` (lines ~1094-1182)
- `detectFairValueGaps` (lines ~1188-1229)

**Keep inline (too bot-specific):**
- `computeCryptoCommitteeScore` (lines ~1310-1397) — does per-component normalization from raw properties
- `detectCryptoRegime` (lines ~1398-1460) — returns `{regime, adjustments, atrPct, trendRatio, isTrending, strategyRouting}`

Replace deleted functions with delegations to shared module:

```javascript
// Signal functions — delegated to shared library (services/signals/)
// See services/signals/compat.js for implementation
const calculateOrderFlowImbalance = sharedSignals
    ? (klines, lookback) => sharedSignals.calculateOrderFlowImbalance(klines, lookback, 'crypto')
    : (klines, lookback) => 0; // safe fallback

const isDisplacementCandle = sharedSignals
    ? (klines, atr, lookback) => sharedSignals.isDisplacementCandle(klines, atr, lookback, 'crypto')
    : () => false;

const calculateVolumeProfile = sharedSignals
    ? (klines, numBuckets) => sharedSignals.calculateVolumeProfile(klines, numBuckets, 'crypto')
    : () => null; // null matches original behavior on insufficient data

const detectFairValueGaps = sharedSignals
    ? (klines, lookback) => sharedSignals.detectFairValueGaps(klines, lookback, 'crypto')
    : () => ({ bullish: [], bearish: [] });
```

- [ ] **Step 4: Run the full signal test suite to catch regressions**

```bash
cd services/signals && npx jest --ci
```
Expected: All existing tests pass.

- [ ] **Step 5: Start the bot locally and verify it initializes without errors**

```bash
cd clients/bot-dashboard
timeout 10 node unified-crypto-bot.js 2>&1 | head -30
# Should see normal startup logs, no "require" errors
# Will fail after 10s due to missing DB — that's expected, we just need the import to work
```

- [ ] **Step 6: Commit**

```bash
git add clients/bot-dashboard/unified-crypto-bot.js
git commit -m "refactor(crypto): replace inline signal functions with shared library imports"
```

---

### Task 5: Replace Stock Bot Inline Signals

**Files:**
- Modify: `clients/bot-dashboard/unified-trading-bot.js:1962-2140` (delete ~180 lines)
- Modify: `clients/bot-dashboard/unified-trading-bot.js:1-55` (add require)

Same pattern as Task 4, but for the stock bot. Stock bot uses Alpaca bar format.
**Keep inline:** `detectMarketRegime` (~2235-2300) — has stock-specific adjustments and strategy routing. `computeCommitteeScore` — does per-component normalization.

- [ ] **Step 1: Add shared signal require at top**

Same pattern as crypto bot — try `./signals/compat`, fallback to `../../services/signals/compat`.

- [ ] **Step 2: Delete inline signal functions and replace with delegations**

Delete:
- `calculateOrderFlowImbalance` (~1962-1978)
- `isDisplacementCandle` (~1982-1999)
- `calculateVolumeProfile` (~2004-2094)
- `detectFairValueGaps` (~2099-2140)

Replace with:
```javascript
const calculateOrderFlowImbalance = sharedSignals
    ? (klines, lookback) => sharedSignals.calculateOrderFlowImbalance(klines, lookback, 'stock')
    : (klines, lookback) => 0;

const isDisplacementCandle = sharedSignals
    ? (klines, atr, lookback) => sharedSignals.isDisplacementCandle(klines, atr, lookback, 'stock')
    : () => false;

const calculateVolumeProfile = sharedSignals
    ? (klines, numBuckets) => sharedSignals.calculateVolumeProfile(klines, numBuckets, 'stock')
    : () => null;

const detectFairValueGaps = sharedSignals
    ? (klines, lookback) => sharedSignals.detectFairValueGaps(klines, lookback, 'stock')
    : () => ({ bullish: [], bearish: [] });
```

- [ ] **Step 3: Verify startup**

```bash
cd clients/bot-dashboard
timeout 10 node unified-trading-bot.js 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add clients/bot-dashboard/unified-trading-bot.js
git commit -m "refactor(stock): replace inline signal functions with shared library imports"
```

---

### Task 6: Replace Forex Bot Inline Signals

**Files:**
- Modify: `clients/bot-dashboard/unified-forex-bot.js:1840-1974` (delete ~135 lines)
- Modify: `clients/bot-dashboard/unified-forex-bot.js:1-40` (add require)

Forex is the trickiest. Only 3 functions can be extracted here (not 4):
- `calculateOrderFlowImbalance` — compat wrapper handles conviction-weighting via `botType='forex'`
- `isDisplacementCandle` — identical to crypto/stock
- `calculateVolumeProfile` — identical logic

**Keep inline (forex-specific logic):**
- `detectFairValueGaps` (~1983-2061) — has body/range ratio filter (`currBody/currRange < 0.5` doji filter) and "relaxed forex FVG" logic (quasi-gaps using `currOpen > prevClose && nextOpen > prevClose`) absent from shared module
- `detectForexRegime` (~2282-2350) — returns forex-specific adjustments, session-aware routing
- `computeForexCommitteeScore` — forex-specific component normalization

- [ ] **Step 1: Add shared signal require at top**

Same try/catch pattern.

- [ ] **Step 2: Delete 3 inline signal functions and replace with delegations**

Delete:
- `calculateOrderFlowImbalance` (~1840-1862)
- `isDisplacementCandle` (~1865-1881)
- `calculateVolumeProfile` (~1885-1974)

Replace with delegations using `botType='forex'`.

```javascript
const calculateOrderFlowImbalance = sharedSignals
    ? (candles, lookback) => sharedSignals.calculateOrderFlowImbalance(candles, lookback, 'forex')
    : () => 0;

const isDisplacementCandle = sharedSignals
    ? (candles, atr, lookback) => sharedSignals.isDisplacementCandle(candles, atr, lookback, 'forex')
    : () => false;

const calculateVolumeProfile = sharedSignals
    ? (candles, numBuckets) => sharedSignals.calculateVolumeProfile(candles, numBuckets, 'forex')
    : () => null;
```

- [ ] **Step 3: Verify startup**

```bash
cd clients/bot-dashboard
timeout 10 node unified-forex-bot.js 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add clients/bot-dashboard/unified-forex-bot.js
git commit -m "refactor(forex): replace inline signal functions with shared library imports"
```

---

### Task 7: Deploy and Verify

- [ ] **Step 1: Run all signal tests**

```bash
cd services/signals && npx jest --ci --verbose
```

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

- [ ] **Step 3: Monitor CI pipeline**

```bash
gh run list --limit 1 --json status,conclusion,name
# Wait for CI to pass
gh run watch
```

- [ ] **Step 4: Monitor Railway health checks**

```bash
# Wait 2-3 minutes for Railway to deploy, then:
for bot in stock forex crypto; do
  echo "=== ${bot} bot ==="
  curl -sf "https://nexus-${bot}-bot-production.up.railway.app/health" | python3 -m json.tool
done
```
Expected: All 3 return `{"status":"ok"}`.

- [ ] **Step 5: Verify signals are still being generated**

```bash
# Check that bots are scanning and producing signals (give them 1-2 scan cycles)
for bot in stock forex crypto; do
  echo "=== ${bot} bot ==="
  curl -sf "https://nexus-${bot}-bot-production.up.railway.app/api/${bot}/status" 2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('running:', d.get('isRunning'), 'regime:', d.get('regime','N/A'))" 2>/dev/null \
    || echo "Endpoint may differ — check Railway logs"
done
```

- [ ] **Step 6: Check Railway logs for import errors**

```bash
# In Railway dashboard, check logs for each bot:
# - No "Cannot find module './signals/compat'" errors
# - No "sharedSignals is null" warnings (would mean fallback activated)
# - Normal scan loop running
```

---

## Phase 2: Break Bot Monoliths into Modules (Outline)

**Goal:** Extract non-signal code from each bot.js into shared modules. Target: reduce each bot from 5,000-7,400 lines to ~2,000-3,000 lines (engine + config only).

**Modules to extract (prioritized by duplication):**

| Module | Est. Lines | Shared Across | Extraction Target |
|---|---|---|---|
| Auth routes (register, login, JWT) | ~300 × 3 | All 3 bots | `shared/auth-routes.js` |
| Technical indicators (RSI, SMA, ATR, EMA, MACD, BB) | ~200 × 3 | All 3 bots | `shared/indicators.js` |
| DB trade helpers (dbOpen, dbClose, tables) | ~150 × 3 | All 3 bots | `shared/db-trades.js` |
| Config/credential routes | ~200 × 3 | All 3 bots | `shared/config-routes.js` |
| Health/status route patterns | ~100 × 3 | All 3 bots | `shared/health-routes.js` |
| Weight auto-learning | ~100 × 3 | All 3 bots | `shared/weight-optimizer.js` |
| Signal decay detection | ~70 × 3 | All 3 bots | `shared/signal-decay.js` |
| Evaluation persistence | ~70 × 3 | All 3 bots | `shared/evaluations.js` |

**Estimated net deletion:** ~3,000-4,000 lines across all 3 bots.

**Approach:** Same pattern as Phase 1 — create shared module with tests, add compat layer, replace inline code, deploy, verify. One module at a time.

**Prerequisite:** Phase 1 complete and verified in production for ≥ 1 week.

---

## Phase 3: Eliminate Deploy/Client Mirror (Outline)

**Goal:** Remove the need for deploy.yml to copy files from `clients/` → `deploy/`. Single source of truth.

**Options (choose one):**

### Option A: Make Railway deploy from `clients/bot-dashboard/`
- Change Railway root directory for each bot service to `clients/bot-dashboard/`
- Use `start` script per service: `node unified-crypto-bot.js`, etc.
- **Pro:** Zero file copying, single source of truth
- **Con:** All 3 bots redeploy on ANY bot change; must handle shared `node_modules`

### Option B: Symlink deploy dirs to clients
- Replace `deploy/*/bot.js` with symlinks to `clients/bot-dashboard/unified-*.js`
- **Pro:** Simple
- **Con:** Git doesn't handle symlinks well across platforms; Railway may not follow them

### Option C: Single deploy directory with shared modules
- Restructure to `deploy/shared/` + `deploy/bots/{stock,forex,crypto}/` where bot dirs are thin entry points (50 lines each) that import from shared
- **Pro:** Clean architecture, minimal deploy dirs
- **Con:** Largest restructuring effort

**Recommended:** Option A if Railway supports it (test with one bot first). Otherwise Option C.

**Prerequisite:** Phase 2 complete. Bots must be modular enough that the entry point is small.

---

## Success Criteria

| Phase | Metric | Target |
|---|---|---|
| Phase 1 | Lines deleted from bot files | ≥ 500 (4 functions × 3 bots, minus forex FVG) |
| Phase 1 | Signal test coverage | 100% of shared modules |
| Phase 1 | Zero production regressions | All 3 bots healthy 48h post-deploy |
| Phase 2 | Lines deleted from bot files | ≥ 3,000 additional |
| Phase 2 | Shared module test coverage | ≥ 80% |
| Phase 3 | deploy.yml sync step removed | No more file copying |
| Phase 3 | Total bot entry point size | ≤ 200 lines each |
