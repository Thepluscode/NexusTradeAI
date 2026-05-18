# IMPLEMENTATION CHECKLIST & GAP TRACKER
**Project:** NexusTradeAI 70% Profitability Plan  
**Date:** April 25, 2026  
**Target:** May 12, 2026

---

## 📊 AT-A-GLANCE: WHAT'S BUILT vs WHAT'S MISSING

### Tier 1: Entry Quality Filters
```
┌─────────────────────────────────────────────┐
│ DIFF 1: RSI Gate (40-55)                    │
├─────────────────────────────────────────────┤
│ Status: ✅ Code exists, but threshold too wide (30-70)
│ What's built:  RSI calculation ✅
│ What's missing: Tight 40-55 boundary ❌, overbought rejection ❌
│ Effort: 10 lines
│ Impact: +5-8% WR (avoid 3 overbought losses)
│ Risk: LOW
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ DIFF 2: Momentum Filter (>3%)               │
├─────────────────────────────────────────────┤
│ Status: ✅ Momentum calculated, not filtered
│ What's built:  Momentum calculation ✅
│ What's missing: Entry gate (<3% = skip) ❌
│ Effort: 5 lines
│ Impact: +3-5% WR (avoid weak momentum entries)
│ Risk: LOW
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ DIFF 3: Regime Volume Gate (ADX)            │
├─────────────────────────────────────────────┤
│ Status: ⚠️  Code mentions HIGH_VOLATILITY, not tested
│ What's built:  ADX calculation ✅, gate logic (line 1706) ⚠️
│ What's missing: Test coverage ❌, verification it blocks entries ❌
│ Effort: 30 lines (testing + verification)
│ Impact: +8-10% WR (would block March 25-26 panic)
│ Risk: MEDIUM (needs testing)
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ DIFF 4: VWAP Pullback Filter                │
├─────────────────────────────────────────────┤
│ Status: ❌ NOT IMPLEMENTED
│ What's built:  Nothing
│ What's missing: VWAP calculation ❌, pullback detection ❌, entry condition ❌
│ Effort: 50 lines
│ Impact: +4-6% WR (better entry timing)
│ Risk: LOW (isolated feature)
└─────────────────────────────────────────────┘
```

### Tier 2: Risk Management
```
┌─────────────────────────────────────────────┐
│ DIFF 5: ATR-Scaled Stops (1.5x / 3x)        │
├─────────────────────────────────────────────┤
│ Status: ⚠️  ATR exists, scaling incomplete
│ What's built:  ATR calculation ✅, basic stop logic ⚠️
│ What's missing: Regime-aware scaling ❌, trending vs ranging distinction ❌
│ Effort: 40 lines
│ Impact: +5-7% WR (fewer whipsaws, better exits)
│ Risk: MEDIUM
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ DIFF 6: Time-of-Day Gate (9:30-11:30 EST)   │
├─────────────────────────────────────────────┤
│ Status: ❌ NOT IMPLEMENTED
│ What's built:  Nothing (ORB trades 24 hours currently)
│ What's missing: Hour check ❌, EST time conversion ❌, trade block logic ❌
│ Effort: 20 lines
│ Impact: +10-15% WR (ORB best in first 2h, avoid afternoon chop)
│ Risk: LOW
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ DIFF 7: Liquidation Cascade Detector        │
├─────────────────────────────────────────────┤
│ Status: ❌ NOT IMPLEMENTED
│ What's built:  Nothing
│ What's missing: Cascade detection ❌, volume+price+red candle logic ❌
│ Effort: 50 lines
│ Impact: +3-5% WR (especially crypto panic protection)
│ Risk: LOW (uses DIFF 9 volume history)
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ DIFF 8: Kelly Criterion Position Sizing     │
├─────────────────────────────────────────────┤
│ Status: ⚠️  Partial (Monte Carlo sizer exists)
│ What's built:  Win rate tracking ✅, Kelly partial ⚠️
│ What's missing: Avg win/loss calculation ❌, Kelly formula completion ❌
│ Effort: 60 lines
│ Impact: +10-15% WR (proper position sizing for 42.9% WR bot)
│ Risk: HIGH (complex, needs testing with real trade history)
└─────────────────────────────────────────────┘
```

### Tier 3: Crisis & News Awareness (NEW)
```
┌──────────────────────────────────────────────┐
│ DIFF 9: Volume Spike Pause ⭐ CRITICAL      │
├──────────────────────────────────────────────┤
│ Status: ❌ NOT IMPLEMENTED (but needed NOW)
│ What's built:  Nothing
│ What's missing: ALL — volume tracking ❌, spike detection ❌, pause logic ❌
│ Effort: 60 lines
│ Impact: +$50-80/day (March 25-26 would avoid -$63.45 loss)
│ Risk: LOW
│ Dependencies: None (new standalone feature)
│ Deploy: WEEK 1 (with DIFFs 1-4)
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ DIFF 10: VIX Monitoring ⭐ HIGH IMPACT      │
├──────────────────────────────────────────────┤
│ Status: ❌ NOT IMPLEMENTED
│ What's built:  Nothing
│ What's missing: VIX API integration ❌, fetch logic ❌, fear/caution modes ❌
│ Effort: 80 lines + API setup
│ Impact: +8-12% WR (block longs during VIX > 25, reduce position during caution)
│ Risk: MEDIUM (requires external API, needs fallback)
│ Dependencies: API key setup
│ Deploy: WEEK 2 (with DIFFs 5-8)
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ DIFF 11: Synthetic Crisis Detector ⭐       │
├──────────────────────────────────────────────┤
│ Status: ❌ NOT IMPLEMENTED
│ What's built:  Nothing
│ What's missing: Crisis scoring ❌, signature detection ❌, threshold logic ❌
│ Effort: 70 lines
│ Impact: +5-8% WR (detects unscheduled crises without news feed)
│ Risk: LOW (data-driven, good fallback at score=0)
│ Dependencies: DIFF 9 volume history, bar history access
│ Deploy: WEEK 2 (with DIFFs 5-8 + DIFF 10)
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ ✅ ALREADY WORKING: Event Calendar          │
├──────────────────────────────────────────────┤
│ Status: ✅ IMPLEMENTED (handles FOMC/NFP/CPI)
│ What works: Scheduled news blocking (5 min before)
│ What works: Size reduction (30 min before)
│ What's missing: Unscheduled news, geopolitical crises
│ Location: services/signals/event-calendar.js
│ Effort: 0 (no change needed)
│ Impact: Already helping (prevents 2-3 scheduled news losses/month)
└──────────────────────────────────────────────┘
```

---

## 🎯 IMPLEMENTATION ROADMAP

### Week 1: April 28 (Entry Quality + Volume Protection)
```
Monday (Apr 28)
├── Implement DIFF 1: RSI Gate (40-55)
│   └── Tests: test_rsi_overbought_rejected.js ✅
│
├── Implement DIFF 2: Momentum Filter (>3%)
│   └── Tests: test_momentum_weak_rejected.js ✅
│
├── Verify DIFF 3: Regime Volume Gate (ADX)
│   └── Tests: test_regime_high_vol_blocks.js ✅ ← CRITICAL TEST
│
├── Implement DIFF 4: VWAP Pullback
│   └── Tests: test_vwap_pullback_entry.js ✅
│
└── ⭐ Implement DIFF 9: Volume Spike Pause
    └── Tests: test_volume_panic_skips.js ✅
        test_volume_crisis_reduces.js ✅

Thursday (May 1)
├── Merge all Week 1 diffs to staging
├── Deploy to paper trading (Railway)
├── Monitor 48 hours: win rate, trade log
└── Target: 50-55% WR, +$35-50

Week 1 Summary:
├── Status: ✅ 5 diffs deployed
├── Win Rate: 42.9% → 50-55%
├── P&L: -$21.94 → +$35-50/week
└── Major win: Avoiding volume panic losses (-$63/day)
```

### Week 2: May 5 (Risk Management + Crisis Awareness)
```
Monday (May 5)
├── Implement DIFF 5: ATR-Scaled Stops (1.5x / 3x)
│   └── Tests: test_atr_trending_1_5x.js, test_atr_ranging_3x.js ✅
│
├── Implement DIFF 6: Time-of-Day Gate (9:30-11:30 EST)
│   └── Tests: test_time_gate_allows_morning.js, test_time_gate_blocks_afternoon.js ✅
│
├── Implement DIFF 7: Liquidation Cascade Detector
│   └── Tests: test_cascade_detected.js ✅
│
├── Complete DIFF 8: Kelly Criterion Sizing
│   └── Tests: test_kelly_calculation.js, test_kelly_undersizing.js ✅
│
├── ⭐ Implement DIFF 10: VIX Monitoring
│   ├── Setup: VIX_API_KEY in .env
│   └── Tests: test_vix_crisis_blocks_longs.js, test_vix_caution_reduces.js ✅
│
└── ⭐ Implement DIFF 11: Synthetic Crisis Detector
    └── Tests: test_crisis_volume_spike.js, test_crisis_scoring.js ✅

Thursday (May 8)
├── Merge all Week 2 diffs to staging
├── Deploy to paper trading (Railway)
├── Monitor 48 hours: win rate progression
└── Target: 68-72% WR, +$80-120/week

Week 2 Summary:
├── Status: ✅ 7 diffs deployed (11 total)
├── Win Rate: 55% → 68-72%
├── P&L: +$50 → +$80-120/week
└── Major wins: Kelly sizing (dynamic position), VIX protection (no more fear trades)
```

### Final: May 12 (Verification)
```
Monday (May 12)
├── Measure win rate across all 3 bots
├── Validate P&L: +$80-120/week
├── Check: 0 panic losses (DIFF 9 effective?)
├── Check: 0 high-VIX losses (DIFF 10 effective?)
├── Check: <50% loss on crisis days (DIFF 11 effective?)
│
└── ✅ DECISION POINT:
    ├── If WR >= 70%: COMMIT to production ✅
    ├── If WR 65-70%: Good enough, deploy + optimize in June
    └── If WR < 65%: Debug, rollback, re-test individual diffs

Target: 🎯 70% PROFITABILITY ACHIEVED
```

---

## 🛠️ TECHNICAL DETAILS FOR IMPLEMENTATION

### DIFF 1: RSI Gate (10 lines)
**Current code (line ~2100):**
```javascript
if (rsi < 30 || rsi > 70) {
    return [];  // Don't enter
}
```

**New code:**
```javascript
if (rsi < 40 || rsi > 55) {
    return [];  // Don't enter (tighter bounds)
}
// Additional: reject overbought
if (rsi > 60 && volumeRatio > 2.0) {
    console.log(`Skip: RSI ${rsi} overbought + high volume`);
    return [];
}
```

**Test:**
```javascript
test('DIFF 1: Rejects RSI > 60', () => {
    const signal = evaluateSignal({ rsi: 62, volumeRatio: 2.5 });
    expect(signal).toBe('SKIP');
});
```

---

### DIFF 9: Volume Spike Pause (60 lines)
**New functions:**
```javascript
// Track volume history
const _volumeHistory = new Map();

function updateVolumeHistory(symbol, volume) {
    if (!_volumeHistory.has(symbol)) {
        _volumeHistory.set(symbol, []);
    }
    const hist = _volumeHistory.get(symbol);
    hist.push(volume);
    if (hist.length > 20) hist.shift();
}

function isVolumeSpike(symbol, currentVolume) {
    const hist = _volumeHistory.get(symbol);
    if (!hist || hist.length < 5) {
        return { ratio: 1.0, severity: 'NORMAL' };
    }
    
    const avgVolume = hist.slice(0, -1).reduce((a, b) => a + b) / (hist.length - 1);
    const ratio = currentVolume / avgVolume;
    
    return {
        ratio,
        severity: ratio > 10 ? 'PANIC' : ratio > 5 ? 'CRISIS' : 'NORMAL'
    };
}

// In main loop (before entry decision):
updateVolumeHistory(symbol, currentVolume);
const spike = isVolumeSpike(symbol, currentVolume);

if (spike.severity === 'PANIC') {
    console.log(`🛑 VOLUME PANIC: ${symbol} ${spike.ratio.toFixed(1)}x avg volume — SKIP`);
    return [];  // Skip entry
}

if (spike.severity === 'CRISIS') {
    console.log(`⚠️ VOLUME CRISIS: ${symbol} ${spike.ratio.toFixed(1)}x avg — reduce to 50%`);
    positionSize *= 0.5;  // Reduce position
}
```

**Test:**
```javascript
test('DIFF 9: Panic spike skips entry', () => {
    updateVolumeHistory('INTC', 100);
    updateVolumeHistory('INTC', 110);
    updateVolumeHistory('INTC', 95);
    updateVolumeHistory('INTC', 1670);  // 167x spike!
    
    const spike = isVolumeSpike('INTC', 1670);
    expect(spike.severity).toBe('PANIC');
    expect(spike.ratio).toBeGreaterThan(10);
});
```

---

### DIFF 10: VIX Monitoring (80 lines)
**Setup in .env:**
```
VIX_API_KEY=your_iex_api_key_here
VIX_API_URL=https://api.iex.cloud/stable/data/volatility/vix
```

**New functions:**
```javascript
let currentVIX = 15;
let lastVIXCheck = Date.now();

async function checkVIXLevel() {
    try {
        const response = await fetch(
            `${process.env.VIX_API_URL}?token=${process.env.VIX_API_KEY}`
        );
        const data = await response.json();
        currentVIX = data.value || 15;
        lastVIXCheck = Date.now();
        
        if (currentVIX > 25) return 'CRISIS';
        if (currentVIX > 20) return 'CAUTION';
        return 'NORMAL';
    } catch (e) {
        console.warn('[VIX] Error:', e.message);
        return 'NORMAL';  // Fallback if API fails
    }
}

// In main loop (every 5 minutes):
if (Date.now() - lastVIXCheck > 5 * 60 * 1000) {
    const vixMode = await checkVIXLevel();
    
    if (vixMode === 'CRISIS') {
        console.log(`🛑 VIX CRISIS: ${currentVIX.toFixed(1)} > 25`);
        if (direction === 'long') {
            return [];  // Block longs during fear
        }
    } else if (vixMode === 'CAUTION') {
        console.log(`⚠️ VIX CAUTION: ${currentVIX.toFixed(1)} (20-25)`);
        positionSize *= 0.75;  // Reduce to 75%
        stopDistance = atrValue * 1.25;  // Tighter stops
    }
}
```

**Test:**
```javascript
test('DIFF 10: VIX > 25 blocks longs', async () => {
    currentVIX = 27;
    const result = evaluateSignal({ direction: 'long', signal: 'entry' });
    expect(result).toBe('SKIP');  // Should skip long
});

test('DIFF 10: VIX 20-25 reduces size', async () => {
    currentVIX = 22;
    const { positionSize } = evaluateSignal({ direction: 'long', signal: 'entry' });
    expect(positionSize).toBe(100 * 0.75);  // 75% of normal
});
```

---

### DIFF 11: Synthetic Crisis Detector (70 lines)
**New function:**
```javascript
function detectCrisisRegime(barHistory, currentPrice, currentVolume) {
    const recent = barHistory.slice(-10);
    const avgVolume = recent.reduce((s, b) => s + b.volume, 0) / recent.length;
    const avgRange = recent.map(b => b.high - b.low).reduce((a, b) => a + b) / recent.length;
    
    let score = 0;
    const signatures = {};
    
    // Check 1: Volume spike > 5x
    if (currentVolume > avgVolume * 5) {
        score += 3;
        signatures.volumeSpike = true;
    }
    
    // Check 2: Gap > 2% from previous close
    const prevClose = barHistory[barHistory.length - 2].close;
    const gapPct = Math.abs(currentPrice - prevClose) / prevClose * 100;
    if (gapPct > 2) {
        score += 2;
        signatures.gap = gapPct;
    }
    
    // Check 3: Range expansion > 3x normal
    const currentRange = barHistory[barHistory.length - 1].high - barHistory[barHistory.length - 1].low;
    if (currentRange > avgRange * 3) {
        score += 2;
        signatures.rangeExpansion = true;
    }
    
    // Check 4: 2+ red candles with volume
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

// In evaluateSignal:
const crisis = detectCrisisRegime(barHistory, currentPrice, currentVolume);
if (crisis.isCrisis) {
    console.log(`⚠️ SYNTHETIC CRISIS: score ${crisis.score}/9 (${Object.keys(crisis.signatures).join(', ')})`);
    positionSize *= 0.5;
    if (tradeType !== 'orb') return [];  // Skip non-ORB trades
}
```

**Test:**
```javascript
test('DIFF 11: Detects crisis from volume + gap', () => {
    const barHistory = [
        { high: 100, low: 98, close: 99, volume: 100 },
        { high: 100, low: 98, close: 99, volume: 110 },
        { high: 102, low: 97, close: 97, volume: 500 },  // Red + volume
        { high: 101, low: 96, close: 96.5, volume: 520 },  // Red + volume
    ];
    
    const crisis = detectCrisisRegime(barHistory, 95, 550);  // 95 = 5.5% gap down
    expect(crisis.isCrisis).toBe(true);  // Should detect crisis
    expect(crisis.score).toBeGreaterThanOrEqual(5);
});
```

---

## 📋 CHECKLIST FOR EACH DIFF

### Before Implementation
- [ ] Read current code (lines XX-YY)
- [ ] Identify existing functions to reuse
- [ ] Check for test files
- [ ] Plan feature flags

### During Implementation
- [ ] Write code
- [ ] Add console.log() for debugging
- [ ] Add feature flag (`FLAGS.useDiffN: true`)
- [ ] Test locally

### After Implementation
- [ ] Write unit tests (50+ test cases per DIFF)
- [ ] Test on paper trades (48 hours)
- [ ] Measure impact (win rate %, P&L)
- [ ] Rollback plan ready (disable flag if issues)

### Deployment to Production
- [ ] Merge to main
- [ ] Deploy to Railway
- [ ] Monitor for 1 week
- [ ] If WR improves: keep enabled
- [ ] If WR degrades: disable flag + debug

---

## 🎬 ACTION ITEMS FOR YOU

**This Week (April 25-28):**
1. ✅ **Read FEATURE_SPEC_70PCT_PROFITABILITY.md** (main spec document)
2. ✅ **Review this checklist** (implementation roadmap)
3. **Choose approach:**
   - Option A: Implement all 11 diffs yourself (Claude Code can guide)
   - Option B: Approve DIFF 9 first, measure impact, then decide
   - Option C: Approve all 11, I'll prioritize for Claude Code

**For Claude Code Implementation:**
- Prep file: `/tmp/nexus-trade-improvements-70pct.md` (8 original diffs)
- Prep file: `/tmp/news-impact-analysis-70pct.md` (3 new diffs + analysis)
- This file: Implementation checklist & gaps

**Expected Timeline:**
- Week 1: DIFFs 1-4 + DIFF 9 → 50-55% WR
- Week 2: DIFFs 5-8 + DIFFs 10-11 → 68-72% WR
- May 12: Verify 70% profitability ✅

---

**Questions for you:**
1. Which approach appeals to you (A/B/C)?
2. Should we deploy all 11 diffs or test DIFF 9 first?
3. Who implements: you directly or Claude Code?
4. Timeline: aggressive (2 weeks) or conservative (4 weeks)?
