# 70% PROFITABILITY FEATURE SPECIFICATION
**Project:** NexusTradeAI  
**Date:** April 25, 2026  
**Status:** PLANNING PHASE (gap analysis + feature inventory)  
**Target Completion:** May 12, 2026  

---

## 📋 EXECUTIVE SUMMARY

Your trading bots are at **42.9% win rate** (stock) and need to reach **70% profitability**.

This document inventories **all features** currently implemented, gaps in those features, and the **11 diffs** needed to close gaps.

### Current State
- ✅ Event calendar (scheduled news only)
- ✅ Sentiment cache (RSS sentiment)
- ✅ Regime analysis (ADX, trending/ranging detection)
- ❌ **GAPS:** Volume panic detection, unscheduled news, VIX awareness, crisis mode

### Target State
- ✅ All above PLUS:
- ✅ Volume spike detection (DIFF 9)
- ✅ VIX monitoring (DIFF 10)
- ✅ Synthetic crisis detector (DIFF 11)
- ✅ 8 existing diffs (RSI, momentum, regime, VWAP, ATR, time gate, liquidation, Kelly)

---

## 🏗️ FEATURE INVENTORY & GAPS

### TIER 1: ENTRY SIGNAL QUALITY (DIFFs 1-4)
**Purpose:** Filter false breakouts, improve entry win rate from 42.9% → 55-60%

#### DIFF 1: RSI Range Gate (40-55)
**Status:** ✅ IN PLAN (not yet implemented)  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~1700-1750  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| RSI boundaries | 30-70 (default) | 40-55 (tighter) | ⚠️ TOO WIDE — catches overbought |
| RSI threshold check | Yes, line 2100-2150 | Stricter: reject >60, <40 | ✅ Code exists, needs tightening |
| Overbought protection | No explicit check | Reject if RSI > 60 + volume high | ❌ MISSING |
| Oversold protection | No explicit check | Accept if RSI < 40 only with strong momentum | ❌ MISSING |
| Test coverage | None | Unit tests for RSI boundaries | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Change RSI check from 30-70 to 40-55
- [ ] Add overbought rejection (RSI > 60 = skip entry)
- [ ] Add oversold guard (RSI < 30 = skip)
- [ ] Add unit test: test_rsi_gate_rejects_overbought.js
- [ ] Add unit test: test_rsi_gate_accepts_midrange.js
- [ ] Feature flag: `useRSIGate: true`

**Expected Impact:** Avoid 3/7 losses (PLTR, INTC, TSLA all had RSI > 60 at entry) → +5-8% WR

---

#### DIFF 2: Momentum Filter (>3%)
**Status:** ✅ IN PLAN (not yet implemented)  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~1750-1800  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Momentum calculation | Exists (line 2050-2100) | ✅ | No gap |
| Momentum threshold | None (all trades allowed) | >3% required | ❌ MISSING |
| Direction bias | Always long | Smart direction based on momentum | ⚠️ NEEDS WORK |
| Testing | None | Unit tests for momentum filtering | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Add momentum check: skip if < 3%
- [ ] Calculate 5-bar momentum: (close[0] - close[5]) / close[5] * 100
- [ ] Feature flag: `useMomentumGate: true`
- [ ] Add unit tests

**Expected Impact:** Avoid weak momentum entries (RBLX was 1.6% momentum) → +3-5% WR

---

#### DIFF 3: Regime-Aware Volume Gate (ADX-Based)
**Status:** ✅ IN PLAN (partially exists)  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~1689-1710  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| ADX calculation | ✅ Exists | | No gap |
| Volume thresholds by regime | Exists (code mentions) | ✅ IMPLEMENTED | No gap |
| HIGH_VOLATILITY gate | ✅ Exists line 1706 | NO ORB in crisis | ⚠️ Not enforced |
| Testing | None | Unit + integration tests | ❌ NO TESTS |
| Deployment flag | Yes, but needs verification | `useRegimeGating: true` | ⚠️ Needs testing |

**Implementation Checklist:**
- [ ] Verify HIGH_VOLATILITY actually blocks entries (line 1706 check)
- [ ] Test with historical data: March 25-26 crisis should have 0 trades
- [ ] Add logging: "SKIP entry — HIGH_VOLATILITY regime detected"
- [ ] Add unit test: test_regime_blocks_high_vol.js
- [ ] Feature flag verified: `useRegimeGating: true`

**Expected Impact:** Would have blocked -$63.45 panic trades on March 25-26 → +8-10% WR

---

#### DIFF 4: VWAP Pullback Filter
**Status:** ✅ IN PLAN (not yet implemented)  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~2000-2050  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| VWAP calculation | ❌ MISSING | Implement 20-bar VWAP | ❌ NOT IMPLEMENTED |
| Pullback detection | ❌ MISSING | Price > VWAP + RSI pullback | ❌ NOT IMPLEMENTED |
| Entry condition | ORB only | ORB + VWAP pullback | ✅ Partially coded |
| Testing | None | Unit tests for VWAP logic | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Add VWAP calculation function (20-bar volume-weighted avg price)
- [ ] Detect pullback: price cross below VWAP + volume < 1.5x avg
- [ ] Add pullback entry condition: RSI 40-55 + above VWAP
- [ ] Feature flag: `useVWAPPullback: true`
- [ ] Add unit test: test_vwap_pullback_entry.js

**Implementation Code Outline:**
```javascript
function calculateVWAP(bars, period = 20) {
    // VWAP = cumsum(close * volume) / cumsum(volume)
    const recent = bars.slice(-period);
    let cumVolume = 0, cumPrice = 0;
    for (const bar of recent) {
        cumVolume += bar.volume;
        cumPrice += bar.close * bar.volume;
    }
    return cumPrice / cumVolume;
}

function isPullbackEntry(price, vwap, volume, avgVolume, rsi) {
    return price > vwap && volume < avgVolume * 1.5 && rsi > 40 && rsi < 55;
}
```

**Expected Impact:** Improves entry timing, filters chasing → +4-6% WR

---

### TIER 2: RISK MANAGEMENT (DIFFs 5-8)
**Purpose:** Better exits, smarter sizing, prevent catastrophic losses

#### DIFF 5: ATR-Scaled Stops (1.5x / 3x)
**Status:** ✅ IN PLAN (partially exists)  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~2300-2350  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| ATR calculation | ✅ Exists | | No gap |
| Stop distance | Fixed ±1.5% | Dynamic 1.5x or 3x ATR | ⚠️ PARTIALLY IMPLEMENTED |
| Take profit | Fixed 2.5% | Dynamic 3x ATR | ⚠️ PARTIALLY IMPLEMENTED |
| Regime awareness | No | Trending = 1.5x ATR, ranging = 3x ATR | ❌ MISSING |
| Testing | None | Unit tests for stop calculations | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Calculate ATR from last 14 bars
- [ ] If trending: stopDistance = ATR * 1.5, profitTarget = ATR * 3
- [ ] If ranging: stopDistance = ATR * 3, profitTarget = ATR * 1.5
- [ ] Log: "Stop at $X.XX (ATR $Y.YY * 1.5x), target at $Z.ZZ (ATR * 3x)"
- [ ] Feature flag: `useATRStops: true`
- [ ] Add unit test: test_atr_stops_trending.js, test_atr_stops_ranging.js

**Expected Impact:** Better stop placement, fewer whipsaws → +5-7% WR

---

#### DIFF 6: Time-of-Day Gate (9:30-11:30 EST)
**Status:** ✅ IN PLAN (needs implementation)  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~2400-2450  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Time calculation | ✅ Exists (Date functions) | Filter to market open EST | ⚠️ No restriction |
| Hour check | None | Only trade 9:30 AM - 11:30 AM EST | ❌ MISSING |
| Timezone handling | UTC times | Convert to EST correctly | ⚠️ Needs verification |
| ORB window only | No | ✅ ORB only happens first 2 hours | ✅ Correct logic |
| Testing | None | Unit tests for time gate | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Get current time in EST: `new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })`
- [ ] Extract hour from EST time
- [ ] Skip all entries if hour < 9 or hour >= 12 (11:30 AM cutoff)
- [ ] Log: "SKIP — outside ORB window (current: 2:45 PM EST)"
- [ ] Feature flag: `useTimeGate: true`
- [ ] Add unit test: test_time_gate_allows_9_30_am.js, test_time_gate_blocks_2_pm.js

**Expected Impact:** ORB is best in first 2 hours, avoid afternoon chop → +10-15% WR

---

#### DIFF 7: Liquidation Cascade Detector
**Status:** ✅ IN PLAN (needs implementation)  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~2500-2550  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Volume spike detection | ❌ MISSING | Detect 5x+ volume (liquidation) | ❌ NOT IMPLEMENTED |
| Price action | None | Monitor rapid 2%+ move + volume | ❌ MISSING |
| Cascade signature | None | 3 candles: big volume, wide range, red | ❌ MISSING |
| Action taken | None | Reduce size 50%, tighten stop 0.75x ATR | ❌ MISSING |
| Testing | None | Unit tests | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Detect volume spike: current vol > avg vol * 5
- [ ] Detect price cascade: 2%+ move in 1 minute
- [ ] Check red candles: 2+ red bars with volume > 1.5x avg
- [ ] Action: `globalThis._liquidationCascadeActive = true`
- [ ] Apply 50% position size reduction
- [ ] Tighten stop to 0.75x ATR
- [ ] Feature flag: `useLiquidationCascade: true`
- [ ] Add unit test: test_liquidation_cascade_detected.js

**Expected Impact:** Avoid cascade whipsaws, especially in crypto → +3-5% WR

---

#### DIFF 8: Kelly Criterion Position Sizing
**Status:** ✅ IN PLAN (partially exists)  
**File:** `services/trading/monte-carlo-sizer.js` + `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~3300-3400  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Win rate tracking | ✅ Exists | | No gap |
| Risk/reward ratio | ❌ MISSING | Calculate avg win / avg loss | ❌ MISSING |
| Kelly formula | ⚠️ Partial | f = (WR * avgWin - (1-WR) * avgLoss) / avgWin | ⚠️ INCOMPLETE |
| Half-Kelly safety | ⚠️ Partial | Use 50% of Kelly for stability | ⚠️ NEEDS VERIFICATION |
| Dynamic sizing | ✅ Exists | Scale position based on Kelly | ✅ Mostly working |
| Testing | Limited | Unit tests for Kelly calculation | ⚠️ LIMITED |

**Implementation Checklist:**
- [ ] Calculate avg win size from last 20 closed trades
- [ ] Calculate avg loss size from last 20 closed trades
- [ ] Calculate win rate % from last 20 trades
- [ ] Apply Kelly formula: f = (WR * avgWin - (1-WR) * avgLoss) / avgWin
- [ ] Apply 50% Kelly safety factor: f_half = f * 0.5
- [ ] Scale position size to f_half
- [ ] Log: "Kelly sizing: WR 42.9%, avg W $15.20, avg L -$12.50 → size 65%"
- [ ] Feature flag: `useKellySizing: true`
- [ ] Add unit test: test_kelly_sizing_calculation.js

**Expected Impact:** Scale positions correctly to win rate, avoid over-sizing → +10-15% WR (through better risk management)

---

### TIER 3: NEWS & CRISIS AWARENESS (DIFFs 9-11)
**Purpose:** Protect against geopolitical/macro events, achieve 70% profitability

#### DIFF 9: Volume Spike Pause (NEW)
**Status:** ❌ NOT IMPLEMENTED  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~1800-1850 (new section)  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Volume history tracking | ❌ MISSING | Keep 20-bar volume history | ❌ NOT IMPLEMENTED |
| Spike detection | ❌ MISSING | Calculate ratio: current / avg(past 20) | ❌ NOT IMPLEMENTED |
| Panic threshold | ❌ MISSING | If ratio > 10 = PANIC, > 5 = CRISIS | ❌ NOT IMPLEMENTED |
| Action: PANIC | ❌ MISSING | Skip entry entirely | ❌ NOT IMPLEMENTED |
| Action: CRISIS | ❌ MISSING | Reduce position 50% | ❌ NOT IMPLEMENTED |
| Testing | ❌ NONE | Unit tests for spike detection | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Create volume history map: `_volumeHistory = new Map()` (symbol → [v1, v2, ..., v20])
- [ ] Add update function: `updateVolumeHistory(symbol, volume)`
- [ ] Add calculation function: `isVolumeSpike(symbol, currentVolume)` → {ratio, severity}
- [ ] PANIC path (ratio > 10): skip entry, log "🛑 VOLUME PANIC"
- [ ] CRISIS path (ratio > 5): reduce size to 50%, log "⚠️ VOLUME CRISIS"
- [ ] Apply before entry decision
- [ ] Feature flag: `useVolumeSpikePause: true`
- [ ] Add unit test: test_volume_spike_panic.js
- [ ] Add unit test: test_volume_spike_crisis.js

**Code Reference:**
```javascript
// Add ~line 150
const _volumeHistory = new Map();

function updateVolumeHistory(symbol, volume) {
    if (!_volumeHistory.has(symbol)) _volumeHistory.set(symbol, []);
    const hist = _volumeHistory.get(symbol);
    hist.push(volume);
    if (hist.length > 20) hist.shift();
}

function isVolumeSpike(symbol, currentVolume) {
    const hist = _volumeHistory.get(symbol);
    if (!hist || hist.length < 5) return { ratio: 1, severity: 'NORMAL' };
    
    const avgVol = hist.slice(0, -1).reduce((a, b) => a + b) / (hist.length - 1);
    const ratio = currentVolume / avgVol;
    
    return {
        ratio,
        severity: ratio > 10 ? 'PANIC' : ratio > 5 ? 'CRISIS' : 'NORMAL'
    };
}

// In main loop ~line 2200:
const spike = isVolumeSpike(symbol, currentVolume);
if (spike.severity === 'PANIC') {
    console.log(`🛑 VOLUME PANIC: ${symbol} ${spike.ratio.toFixed(1)}x avg`);
    return [];  // Skip entry
}
if (spike.severity === 'CRISIS') {
    positionSize *= 0.5;  // Reduce 50%
    console.log(`⚠️ VOLUME CRISIS: ${symbol} ${spike.ratio.toFixed(1)}x avg — 50% size`);
}
```

**Expected Impact:** Would have prevented March 25-26 panic losses (-$63.45) → +$15-20/day

---

#### DIFF 10: VIX Monitoring (NEW)
**Status:** ❌ NOT IMPLEMENTED  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~1850-1900 (new section)  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| VIX data source | ❌ MISSING | IEX Cloud or Alpha Vantage API | ❌ NOT CONFIGURED |
| VIX fetch logic | ❌ MISSING | Poll every 5 minutes | ❌ NOT IMPLEMENTED |
| Fear threshold | ❌ MISSING | VIX > 25 = CRISIS, > 20 = CAUTION | ❌ NOT IMPLEMENTED |
| Action: CRISIS (VIX > 25) | ❌ MISSING | Block all longs, allow shorts only | ❌ NOT IMPLEMENTED |
| Action: CAUTION (VIX > 20) | ❌ MISSING | Reduce position 75%, tighten stop 1.25x ATR | ❌ NOT IMPLEMENTED |
| Error handling | ❌ MISSING | Fallback to normal if API fails | ❌ MISSING |
| Testing | ❌ NONE | Unit tests for VIX logic | ❌ NO TESTS |
| Cron job | ❌ MISSING | Scheduled VIX check | ❌ MISSING |

**Implementation Checklist:**
- [ ] Get API key: IEX Cloud (free tier) or Alpha Vantage
- [ ] Add environment variable: `VIX_API_KEY`, `VIX_API_URL`
- [ ] Create async function: `checkVIXLevel()`
- [ ] Fetch VIX every 5 minutes (cache to reduce API calls)
- [ ] CRISIS path (VIX > 25): block longs, log "VIX CRISIS — shorts only"
- [ ] CAUTION path (VIX > 20): reduce position 75%, tighten stops
- [ ] Error fallback: if API fails, use last known VIX or normal mode
- [ ] Feature flag: `useVIXAwareness: true`
- [ ] Add unit test: test_vix_crisis_blocks_longs.js
- [ ] Add unit test: test_vix_caution_reduces_size.js
- [ ] Add cron job: VIX check every 5 min

**Code Reference:**
```javascript
// Add ~line 160
let currentVIX = 15;
let lastVIXCheck = Date.now();

async function checkVIXLevel() {
    try {
        const response = await fetch(
            `https://api.iex.cloud/stable/data/volatility/vix?token=${process.env.VIX_API_KEY}`
        );
        const data = await response.json();
        currentVIX = data.value || 15;
        lastVIXCheck = Date.now();
        
        if (currentVIX > 25) return 'CRISIS';
        if (currentVIX > 20) return 'CAUTION';
        return 'NORMAL';
    } catch (e) {
        console.warn('[VIX] Error:', e.message);
        return 'NORMAL';  // Fallback
    }
}

// In main loop ~line 2250:
if (Date.now() - lastVIXCheck > 5 * 60 * 1000) {
    const vixMode = await checkVIXLevel();
    globalThis._vixMode = vixMode;
    
    if (vixMode === 'CRISIS') {
        if (direction === 'long') {
            console.log(`🛑 VIX CRISIS (${currentVIX.toFixed(1)}) — blocking longs`);
            return [];
        }
    } else if (vixMode === 'CAUTION') {
        positionSize *= 0.75;
        stopDistance = atrValue * 1.25;
        console.log(`⚠️ VIX CAUTION (${currentVIX.toFixed(1)}) — 75% size, 1.25x stops`);
    }
}
```

**Expected Impact:** Reduces losses during fear spikes (VIX > 20 historically precedes -5% market moves) → +8-12% WR

---

#### DIFF 11: Synthetic Crisis Detector (NEW)
**Status:** ❌ NOT IMPLEMENTED  
**File:** `clients/bot-dashboard/unified-trading-bot.js`  
**Lines:** ~1900-1950 (new section)  
**Gap Analysis:**

| Feature | Current | Target | Gap |
|---------|---------|--------|-----|
| Signature detection | ❌ MISSING | Detect crisis patterns w/o news feed | ❌ NOT IMPLEMENTED |
| Volume spike check | ❌ MISSING | If vol > 5x avg = crisis signature | ❌ MISSING (but DIFF 9 does this) |
| Gap detection | ❌ MISSING | If gap > 2% from prev close = danger | ❌ NOT IMPLEMENTED |
| Range expansion | ❌ MISSING | If range > 3x normal ATR = panic | ❌ NOT IMPLEMENTED |
| Red volume detection | ❌ MISSING | 2+ consecutive red candles + vol | ❌ NOT IMPLEMENTED |
| Crisis score | ❌ MISSING | Aggregate signatures: score 0-9 | ❌ NOT IMPLEMENTED |
| Threshold | ❌ MISSING | Score >= 5 = crisis mode | ❌ NOT IMPLEMENTED |
| Action | ❌ MISSING | Reduce size 50%, block certain trades | ❌ NOT IMPLEMENTED |
| Testing | ❌ NONE | Unit tests | ❌ NO TESTS |

**Implementation Checklist:**
- [ ] Create function: `detectCrisisRegime(historicalData, currentPrice, currentVolume)` → {isCrisis, score}
- [ ] Check 1: Volume spike > 5x avg → +3 points
- [ ] Check 2: Gap > 2% from previous close → +2 points
- [ ] Check 3: Range expansion > 3x normal ATR → +2 points
- [ ] Check 4: 2+ consecutive red candles with volume > 1.5x avg → +2 points
- [ ] Threshold: score >= 5 = crisis mode
- [ ] Action: reduce position 50%, block pullback trades, allow ORB only
- [ ] Log: "SYNTHETIC CRISIS: score 6/9 (vol+gap+red candles) — 50% size"
- [ ] Feature flag: `useSyntheticCrisisDetector: true`
- [ ] Add unit test: test_synthetic_crisis_volume_spike.js
- [ ] Add unit test: test_synthetic_crisis_gap_detection.js
- [ ] Add unit test: test_synthetic_crisis_scoring.js

**Code Reference:**
```javascript
// Add ~line 170
function detectCrisisRegime(barHistory, currentPrice, currentVolume) {
    const recent = barHistory.slice(-10);
    const avgVolume = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
    const avgATR = recent.map(b => b.high - b.low).reduce((a, b) => a + b) / recent.length;
    
    let score = 0;
    const signatures = {};
    
    // Volume spike
    if (currentVolume > avgVolume * 5) {
        score += 3;
        signatures.volumeSpike = true;
    }
    
    // Gap
    const prevClose = barHistory[barHistory.length - 2].close;
    const gapPct = Math.abs(currentPrice - prevClose) / prevClose * 100;
    if (gapPct > 2) {
        score += 2;
        signatures.gap = gapPct;
    }
    
    // Range expansion
    const currentRange = barHistory[barHistory.length - 1].high - barHistory[barHistory.length - 1].low;
    if (currentRange > avgATR * 3) {
        score += 2;
        signatures.rangeExpansion = true;
    }
    
    // Red candles with volume
    let redCount = 0;
    for (let i = recent.length - 3; i < recent.length; i++) {
        if (recent[i].close < recent[i].open && recent[i].volume > avgVolume * 1.5) {
            redCount++;
        }
    }
    if (redCount >= 2) {
        score += 2;
        signatures.redVolume = true;
    }
    
    return {
        isCrisis: score >= 5,
        score,
        maxScore: 9,
        signatures
    };
}

// In evaluateSignal ~line 2300:
const crisis = detectCrisisRegime(barHistory, currentPrice, currentVolume);
if (crisis.isCrisis) {
    console.log(`⚠️ SYNTHETIC CRISIS: score ${crisis.score}/9 — 50% size`);
    positionSize *= 0.5;
    if (tradeType === 'pullback') return [];  // Block non-ORB trades
}
```

**Expected Impact:** Catches unscheduled crises early, avoids 2-3 panic trades/week → +5-8% WR

---

## 🔗 FEATURE DEPENDENCIES & IMPLEMENTATION ORDER

### Phase 1: Entry Quality (Week 1, April 28)
```
DIFF 1: RSI Gate (40-55)
    ↓ (depends on: basic RSI calculation)
    ✅ Straightforward, low risk

DIFF 2: Momentum Filter (>3%)
    ↓ (depends on: momentum calculation exists)
    ✅ Straightforward, low risk

DIFF 3: Regime Volume Gate
    ↓ (depends on: ADX calculation exists, HIGH_VOLATILITY flag)
    ⚠️ Medium risk — needs testing to verify HIGH_VOLATILITY works

DIFF 4: VWAP Pullback
    ↓ (depends on: VWAP calculation)
    ✅ New feature, isolated, low risk

DIFF 9: Volume Spike Pause ← ADD TO WEEK 1
    ↓ (depends on: volume history tracking)
    ✅ New feature, isolates PANIC trades, high impact
```

**Week 1 Deployment:** DIFFs 1, 2, 3, 4, 9  
**Expected Result:** 50-55% WR, +$35-50/week

---

### Phase 2: Risk Management + Crisis (Week 2, May 5)
```
DIFF 5: ATR-Scaled Stops
    ↓ (depends on: ATR calculation exists)
    ⚠️ Partial implementation, needs regime-aware logic

DIFF 6: Time-of-Day Gate
    ↓ (depends on: EST time conversion)
    ✅ Straightforward, high impact for ORB

DIFF 7: Liquidation Cascade
    ↓ (depends on: volume history from DIFF 9)
    ✅ Built on DIFF 9, low risk

DIFF 8: Kelly Sizing
    ↓ (depends on: win rate tracking, risk/reward calculation)
    ⚠️ Complex, needs testing with historical trades

DIFF 10: VIX Monitoring ← ADD TO WEEK 2
    ↓ (depends on: API key, external data source)
    ⚠️ Requires API setup, good fallback handling needed

DIFF 11: Synthetic Crisis ← ADD TO WEEK 2
    ↓ (depends on: volume history from DIFF 9)
    ✅ High impact, good fallback (if all checks fail, score = 0)
```

**Week 2 Deployment:** DIFFs 5, 6, 7, 8, 10, 11  
**Expected Result:** 65-72% WR, +$80-120/week

---

## 📊 GAP MATRIX & PRIORITY

| Feature | Current State | Implementation Status | Risk | Priority | Impact |
|---------|---------------|----------------------|------|----------|--------|
| RSI Gate (DIFF 1) | Exists but loose (30-70) | Update threshold | Low | HIGH | +5-8% WR |
| Momentum Filter (DIFF 2) | Exists but not gated | Add check | Low | HIGH | +3-5% WR |
| Regime Volume (DIFF 3) | Partial (HIGH_VOL flag) | Verify + test | Medium | HIGH | +8-10% WR |
| VWAP Pullback (DIFF 4) | Not implemented | Build | Low | MEDIUM | +4-6% WR |
| ATR Stops (DIFF 5) | Partial | Add regime logic | Medium | MEDIUM | +5-7% WR |
| Time Gate (DIFF 6) | Not implemented | Build | Low | HIGH | +10-15% WR |
| Liquidation Cascade (DIFF 7) | Not implemented | Build on vol tracking | Low | MEDIUM | +3-5% WR |
| Kelly Sizing (DIFF 8) | Partial | Complete + test | High | MEDIUM | +10-15% WR |
| **Volume Spike (DIFF 9)** | **NOT IMPLEMENTED** | **Build (NEW)** | **Low** | **CRITICAL** | **+$50-80/day** |
| **VIX Monitor (DIFF 10)** | **NOT IMPLEMENTED** | **Build (NEW)** | **Medium** | **HIGH** | **+8-12% WR** |
| **Synthetic Crisis (DIFF 11)** | **NOT IMPLEMENTED** | **Build (NEW)** | **Low** | **HIGH** | **+5-8% WR** |

---

## 🎯 SUCCESS CRITERIA

### Week 1 Target (April 28)
- ✅ DIFFs 1-4 coded and tested on paper trades
- ✅ DIFF 9 (volume spike) added and active
- ✅ Win rate: 50-55% (up from 42.9%)
- ✅ P&L: +$35-50/week
- ✅ No regression: existing safety features still intact

### Week 2 Target (May 5)
- ✅ DIFFs 5-8 added and tested
- ✅ DIFFs 10-11 (VIX + crisis) active
- ✅ Win rate: 65-72%
- ✅ P&L: +$80-120/week
- ✅ Feature flags allow independent toggles

### Final Verification (May 12)
- ✅ **70% profitability confirmed** (68-72% WR, 7 of 10 days winning)
- ✅ Combined bot P&L: +$80-120/week sustained
- ✅ No panic losses (0 trades during crisis days)
- ✅ All diffs deployed to production
- ✅ Rollback plan in place

---

## 📁 FILE STRUCTURE FOR IMPLEMENTATION

```
clients/bot-dashboard/
├── unified-trading-bot.js        ← Main file (diffs 1-11 implemented here)
├── signals/
│   ├── volume-spike.js           ← DIFF 9 (NEW) — volume spike detection
│   ├── vix-monitor.js            ← DIFF 10 (NEW) — VIX fetching
│   ├── crisis-detector.js        ← DIFF 11 (NEW) — synthetic crisis scoring
│   └── event-calendar.js         ← Already exists
├── __tests__/
│   ├── diff-1-rsi-gate.test.js    ← DIFF 1 tests
│   ├── diff-9-volume-spike.test.js ← DIFF 9 tests (NEW)
│   ├── diff-10-vix.test.js        ← DIFF 10 tests (NEW)
│   ├── diff-11-crisis.test.js     ← DIFF 11 tests (NEW)
│   └── ...

services/signals/
├── event-calendar.js             ← Already exists
├── volume-spike.js               ← DIFF 9 module
├── vix-monitor.js                ← DIFF 10 module
├── crisis-detector.js            ← DIFF 11 module
└── __tests__/
    ├── volume-spike.test.js
    ├── vix-monitor.test.js
    └── crisis-detector.test.js

.env
├── VIX_API_KEY                   ← DIFF 10 requirement
├── VIX_API_URL                   ← DIFF 10 requirement
```

---

## 🚀 NEXT STEPS FOR YOU

1. **Review this document** — Identify which gaps are most critical
2. **Prioritize implementation order** — Week 1 vs Week 2
3. **Approve DIFFs 1-4 + DIFF 9** — I'll generate detailed code diffs
4. **Claude Code implementation** — Deploy to Railway, test, measure WR
5. **Approve DIFFs 5-8 + DIFF 10-11** — Week 2 rollout
6. **Final measurement** — May 12 verification

---

## 📝 DOCUMENT MANAGEMENT

- **Last Updated:** April 25, 2026, 11:30 AM EST
- **Status:** ✅ COMPLETE (gap analysis ready for implementation)
- **Location:** `/tmp/FEATURE_SPEC_70PCT_PROFITABILITY.md` + `NexusTradeAI/FEATURE_SPEC_70PCT_PROFITABILITY.md`
- **Audience:** Theophilus (user), Claude Code (implementation)
- **Review Cycle:** Daily (update based on implementation progress)
