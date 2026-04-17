/**
 * Fair Value Gap (FVG) detection with 6-factor validity scoring.
 *
 * Bullish FVG: bar[i+2].low > bar[i].high (gap up not filled)
 * Bearish FVG: bar[i+2].high < bar[i].low (gap down not filled)
 *
 * [v24.1] 6-Factor Validity System — each gap is scored 0-1 based on:
 *   1. UNMITIGATED — gap must not have been filled/tested by subsequent price action
 *   2. CANDLE REACTION — when price returns to gap, it should close inside or reverse
 *   3. S/R CONFLUENCE — gap near a swing high/low level is stronger
 *   4. PRIORITY POSITION — lowest bullish FVG (highest bearish) has highest priority
 *   5. FIBONACCI POSITION — gap in lower 50% of the move (bullish) is stronger
 *   6. BREAK OF STRUCTURE — price must break previous swing H/L before the gap forms
 *
 * Overall gap validity = weighted sum of all 6 factors.
 * Only valid gaps contribute to the final score.
 */

/**
 * @param {Array<{open,high,low,close,volume}>} klines — OHLCV bars (normalized)
 * @param {Object} config
 * @param {number} config.lookback — bars to scan for FVGs (default 40)
 * @param {number} config.swingLookback — bars for swing H/L detection (default 10)
 * @param {number} config.neutralDefault — score when no valid gap found (default 0.3)
 * @returns {{ score: number, raw: Object, meta: Object }}
 */
function computeFVG(klines, config = {}) {
  const { neutralDefault = 0.3, lookback = 20, swingLookback = 10 } = config;

  if (!klines || klines.length < 3) {
    return { score: neutralDefault, raw: { bullishCount: 0, bearishCount: 0, gaps: [], validGaps: [], avgGapSizeRelative: 0 }, meta: {} };
  }

  const recent = klines.slice(-Math.max(lookback, 40)); // need extra bars for context
  const allBars = klines; // full history for mitigation checks
  const gaps = [];
  let bullishCount = 0;
  let bearishCount = 0;

  // Pre-compute swing highs and lows for S/R confluence (factor 3) and BOS (factor 6)
  const swingHighs = findSwingPoints(recent, swingLookback, 'high');
  const swingLows = findSwingPoints(recent, swingLookback, 'low');

  // Find the overall move range for Fibonacci position (factor 5)
  const moveHigh = Math.max(...recent.map(b => b.high));
  const moveLow = Math.min(...recent.map(b => b.low));
  const moveRange = moveHigh - moveLow;

  for (let i = 0; i < recent.length - 2; i++) {
    const prev = recent[i];
    const curr = recent[i + 1];
    const next = recent[i + 2];

    let gap = null;

    // Bullish FVG: next candle's low > prev candle's high AND middle candle closed up
    if (next.low > prev.high && curr.close > curr.open) {
      bullishCount++;
      gap = {
        type: 'bullish',
        gapLow: prev.high,
        gapHigh: next.low,
        gapMid: (prev.high + next.low) / 2,
        gapSize: next.low - prev.high,
        formationIndex: i + 1, // the candle that created the gap
      };
    }

    // Bearish FVG: next candle's high < prev candle's low AND middle candle closed down
    if (next.high < prev.low && curr.close < curr.open) {
      bearishCount++;
      gap = {
        type: 'bearish',
        gapLow: next.high,
        gapHigh: prev.low,
        gapMid: (next.high + prev.low) / 2,
        gapSize: prev.low - next.high,
        formationIndex: i + 1,
      };
    }

    if (gap) {
      // Apply 6-factor validity scoring
      const validity = scoreGapValidity(gap, recent, i, swingHighs, swingLows, moveHigh, moveLow, moveRange);
      gap.validity = validity;
      gap.validityScore = validity.overall;
      gaps.push(gap);
    }
  }

  // Filter to valid gaps (validity > 0.3) for scoring
  const validGaps = gaps.filter(g => g.validityScore > 0.3);
  const totalCount = bullishCount + bearishCount;

  let score;
  if (validGaps.length === 0) {
    score = neutralDefault;
  } else {
    // Best gap's validity drives the score
    const bestValidity = Math.max(...validGaps.map(g => g.validityScore));
    const countScore = Math.min(validGaps.length / 3, 1.0);
    // Weighted: best gap validity (60%) + count of valid gaps (20%) + size (20%)
    const refPrice = recent[recent.length - 1].close || 1;
    const avgGapSize = validGaps.reduce((s, g) => s + g.gapSize, 0) / validGaps.length;
    const sizeScore = Math.min((avgGapSize / refPrice) * 20, 1.0);
    score = bestValidity * 0.6 + countScore * 0.2 + sizeScore * 0.2;
  }

  const refPrice = recent.length > 0 ? (recent[recent.length - 1].close || 1) : 1;
  const avgGapSizeRelative = gaps.length > 0
    ? (gaps.reduce((s, g) => s + g.gapSize, 0) / gaps.length) / refPrice
    : 0;

  return {
    score: parseFloat(Math.min(score, 1.0).toFixed(4)),
    raw: { bullishCount, bearishCount, gaps, validGaps, avgGapSizeRelative },
    meta: { lookback, validCount: validGaps.length, totalCount }
  };
}

/**
 * Score a gap's validity across 6 factors. Returns 0-1 overall score.
 */
function scoreGapValidity(gap, bars, gapBarIndex, swingHighs, swingLows, moveHigh, moveLow, moveRange) {
  const factors = {};

  // Factor 1: UNMITIGATED — gap must not have been filled by subsequent bars
  factors.unmitigated = checkUnmitigated(gap, bars, gapBarIndex);

  // Factor 2: CANDLE REACTION — if price has reached gap, did it close inside/reverse?
  factors.candleReaction = checkCandleReaction(gap, bars, gapBarIndex);

  // Factor 3: S/R CONFLUENCE — gap near swing high/low level
  factors.srConfluence = checkSRConfluence(gap, swingHighs, swingLows, moveRange);

  // Factor 4: PRIORITY POSITION — lowest bullish / highest bearish is best
  factors.priority = checkPriority(gap, moveLow, moveHigh, moveRange);

  // Factor 5: FIBONACCI POSITION — gap in lower 50% of move (bullish) is better
  factors.fibPosition = checkFibonacciPosition(gap, moveLow, moveHigh, moveRange);

  // Factor 6: BREAK OF STRUCTURE — price must have broken a swing before gap formed
  factors.breakOfStructure = checkBreakOfStructure(gap, bars, gapBarIndex, swingHighs, swingLows);

  // Weighted overall score
  // Unmitigated is most important (if filled, gap is dead)
  // BOS and priority are next most important
  const overall =
    factors.unmitigated * 0.30 +
    factors.breakOfStructure * 0.20 +
    factors.priority * 0.15 +
    factors.fibPosition * 0.10 +
    factors.srConfluence * 0.15 +
    factors.candleReaction * 0.10;

  return { ...factors, overall: parseFloat(overall.toFixed(4)) };
}

/**
 * Factor 1: UNMITIGATED — has any bar after the gap filled it?
 * Returns 1.0 if gap is completely unfilled, 0.0 if fully filled.
 */
function checkUnmitigated(gap, bars, gapBarIndex) {
  // Check bars after the gap formation (index + 3 onward)
  for (let i = gapBarIndex + 3; i < bars.length; i++) {
    if (gap.type === 'bullish') {
      // If any bar's low goes below gapLow, the gap has been mitigated
      if (bars[i].low <= gap.gapLow) return 0.0;
      // Partial fill: bar enters the gap but doesn't fully fill it
      if (bars[i].low < gap.gapHigh && bars[i].low > gap.gapLow) return 0.5;
    } else {
      // Bearish: if any bar's high goes above gapHigh, mitigated
      if (bars[i].high >= gap.gapHigh) return 0.0;
      if (bars[i].high > gap.gapLow && bars[i].high < gap.gapHigh) return 0.5;
    }
  }
  return 1.0; // fully unmitigated
}

/**
 * Factor 2: CANDLE REACTION — when price reaches the gap, does it respect it?
 * Returns 1.0 if candle closed inside gap or reversed, 0.0 if it blew through.
 * Returns 0.8 if gap hasn't been tested yet (neutral — we don't know).
 */
function checkCandleReaction(gap, bars, gapBarIndex) {
  for (let i = gapBarIndex + 3; i < bars.length; i++) {
    if (gap.type === 'bullish') {
      // Price reached the gap zone
      if (bars[i].low <= gap.gapHigh) {
        // Did it close inside the gap or above it? (respecting the gap)
        if (bars[i].close >= gap.gapLow) return 1.0;
        // Blew through
        return 0.0;
      }
    } else {
      if (bars[i].high >= gap.gapLow) {
        if (bars[i].close <= gap.gapHigh) return 1.0;
        return 0.0;
      }
    }
  }
  return 0.8; // not tested yet — slightly positive (fresh gap)
}

/**
 * Factor 3: S/R CONFLUENCE — gap near a prior swing level is stronger.
 * Returns 1.0 if gap midpoint is within 0.5% of a swing level, scaled down to 0.
 */
function checkSRConfluence(gap, swingHighs, swingLows, moveRange) {
  if (moveRange <= 0) return 0.5;
  const levels = gap.type === 'bullish'
    ? swingLows.map(s => s.price)
    : swingHighs.map(s => s.price);

  if (levels.length === 0) return 0.3;

  let minDist = Infinity;
  for (const level of levels) {
    const dist = Math.abs(gap.gapMid - level) / moveRange;
    if (dist < minDist) minDist = dist;
  }

  // Within 3% of move range from S/R = full score, degrades linearly
  if (minDist < 0.03) return 1.0;
  if (minDist < 0.10) return 0.7;
  if (minDist < 0.20) return 0.4;
  return 0.2;
}

/**
 * Factor 4: PRIORITY — lowest bullish FVG / highest bearish FVG is strongest.
 * Returns 1.0 for the most extreme gap, scaled down for gaps closer to current price.
 */
function checkPriority(gap, moveLow, moveHigh, moveRange) {
  if (moveRange <= 0) return 0.5;
  if (gap.type === 'bullish') {
    // Lower gaps are stronger: position 0 (at moveLow) = 1.0, position 1 (at moveHigh) = 0.2
    const position = (gap.gapMid - moveLow) / moveRange;
    return Math.max(0.2, 1.0 - position * 0.8);
  } else {
    // Higher gaps are stronger: position 1 (at moveHigh) = 1.0, position 0 (at moveLow) = 0.2
    const position = (gap.gapMid - moveLow) / moveRange;
    return Math.max(0.2, 0.2 + position * 0.8);
  }
}

/**
 * Factor 5: FIBONACCI POSITION — gap in the lower 50% of the move (bullish) or
 * upper 50% (bearish) is in a better position for reversal.
 * Uses 0.5 Fibonacci level as the dividing line.
 */
function checkFibonacciPosition(gap, moveLow, moveHigh, moveRange) {
  if (moveRange <= 0) return 0.5;
  const fibLevel = (gap.gapMid - moveLow) / moveRange;

  if (gap.type === 'bullish') {
    // Below 0.5 (lower half) = strong, above 0.5 = weaker
    if (fibLevel <= 0.382) return 1.0;
    if (fibLevel <= 0.5) return 0.8;
    if (fibLevel <= 0.618) return 0.5;
    return 0.2;
  } else {
    // Above 0.5 (upper half) = strong, below 0.5 = weaker
    if (fibLevel >= 0.618) return 1.0;
    if (fibLevel >= 0.5) return 0.8;
    if (fibLevel >= 0.382) return 0.5;
    return 0.2;
  }
}

/**
 * Factor 6: BREAK OF STRUCTURE — before the gap formed, price must have broken
 * a previous swing high (for bullish) or swing low (for bearish).
 * Returns 1.0 if BOS occurred, 0.2 if not.
 */
function checkBreakOfStructure(gap, bars, gapBarIndex, swingHighs, swingLows) {
  const gapFormationBar = bars[gapBarIndex + 1]; // the candle that created the gap
  if (!gapFormationBar) return 0.2;

  if (gap.type === 'bullish') {
    // Check if any bar in the formation area broke a previous swing high
    for (const swing of swingHighs) {
      // Swing must be before the gap
      if (swing.index >= gapBarIndex) continue;
      // Check if the gap candle or candle before it broke this swing high
      for (let i = Math.max(0, gapBarIndex - 2); i <= gapBarIndex + 2 && i < bars.length; i++) {
        if (bars[i].high > swing.price) return 1.0;
      }
    }
  } else {
    for (const swing of swingLows) {
      if (swing.index >= gapBarIndex) continue;
      for (let i = Math.max(0, gapBarIndex - 2); i <= gapBarIndex + 2 && i < bars.length; i++) {
        if (bars[i].low < swing.price) return 1.0;
      }
    }
  }

  return 0.2; // no break of structure found
}

/**
 * Find swing points (highs or lows) in the bar array.
 */
function findSwingPoints(bars, lookback, type) {
  const swings = [];
  const halfLook = Math.floor(lookback / 2);
  if (halfLook < 1 || bars.length < lookback) return swings;

  for (let i = halfLook; i < bars.length - halfLook; i++) {
    let isSwing = true;
    const val = type === 'high' ? bars[i].high : bars[i].low;
    for (let j = i - halfLook; j <= i + halfLook; j++) {
      if (j === i) continue;
      const cmp = type === 'high' ? bars[j].high : bars[j].low;
      if (type === 'high' ? cmp >= val : cmp <= val) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) swings.push({ price: val, index: i });
  }
  return swings;
}

module.exports = { computeFVG, scoreGapValidity, findSwingPoints };
