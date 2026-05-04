/**
 * Staleness / FOMO Entry Detector
 *
 * Background: empirical analysis (2026-04-30, 58 closed trades) showed that
 * high-confidence crypto entries (conf > 0.45) lose ~100% of the time at
 * -5% per trade. Root cause: the committee fires AFTER the move is already
 * exhausted — orderFlow imbalance, displacement, and FVG count all elevated
 * because the move just happened, then price retraces to stop.
 *
 * This module detects late entries via PRICE behavior in the lookback
 * window. If price has already moved more than `maxMovePct` in the last
 * `lookbackBars`, the setup is too late to enter — wait for a pullback.
 *
 * Inputs:
 *   - klines: array of OHLCV bars, oldest first
 *   - direction: 'long' or 'short'
 *   - opts.lookbackBars (default 5): how many bars to scan
 *   - opts.maxMovePct (default 2.0): max % move in lookback before "stale"
 *
 * Output:
 *   { stale: bool, movePct: number, lookback: int, reason: string }
 *
 * Pure function — no side effects, no I/O. Caller decides what to do
 * with `stale: true` (typically: reject the entry).
 */

// Accept either {open,high,low,close,volume} (full names, exit-manager style)
// or {o,h,l,c,v} (one-letter, harness/strategy style). Returns null on missing.
function barClose(bar) {
  if (!bar) return null;
  const c = bar.close != null ? bar.close : bar.c;
  return Number.isFinite(c) ? c : null;
}
function barVolume(bar) {
  if (!bar) return 0;
  const v = bar.volume != null ? bar.volume : bar.v;
  return Number.isFinite(v) ? v : 0;
}

function detectPriceStaleness(klines, direction, opts = {}) {
  const { lookbackBars = 5, maxMovePct = 2.0 } = opts;

  if (!Array.isArray(klines) || klines.length < lookbackBars + 1) {
    return { stale: false, movePct: 0, lookback: 0, reason: 'insufficient bars' };
  }

  const dir = direction === 'short' ? 'short' : 'long';
  const window = klines.slice(-lookbackBars - 1);
  const startClose = barClose(window[0]);
  const endClose = barClose(window[window.length - 1]);

  if (startClose == null || endClose == null) {
    return { stale: false, movePct: 0, lookback: window.length, reason: 'invalid bar data' };
  }
  if (startClose <= 0) {
    return { stale: false, movePct: 0, lookback: window.length, reason: 'invalid start price' };
  }

  const movePct = ((endClose - startClose) / startClose) * 100;
  // For longs, a positive move is "stale" (we'd be buying after the rally).
  // For shorts, a negative move is "stale" (we'd be shorting after the drop).
  const directionalMove = dir === 'long' ? movePct : -movePct;
  const stale = directionalMove > maxMovePct;

  return {
    stale,
    movePct: parseFloat(movePct.toFixed(3)),
    directionalMove: parseFloat(directionalMove.toFixed(3)),
    lookback: lookbackBars,
    reason: stale
      ? `${dir.toUpperCase()} entry stale: price moved ${directionalMove.toFixed(2)}% in last ${lookbackBars} bars (FOMO, threshold ${maxMovePct}%)`
      : `fresh setup: ${directionalMove.toFixed(2)}% move in last ${lookbackBars} bars`
  };
}

/**
 * Per-bar volatility check — has volume been elevated for too many bars?
 * High volume that's been sustained for many bars is a sign of "everyone
 * already knows" — signal exhaustion.
 *
 * Inputs:
 *   - klines: OHLCV bars, oldest first
 *   - opts.lookbackBars (default 10)
 *   - opts.elevatedThreshold (default 1.8): volume ratio that counts as "elevated"
 *   - opts.maxElevatedBars (default 5): > this many elevated bars in window = stale
 *
 * Returns:
 *   { stale: bool, elevatedBars: int, lookback: int, reason: string }
 */
function detectVolumeStaleness(klines, opts = {}) {
  const { lookbackBars = 10, elevatedThreshold = 1.8, maxElevatedBars = 5 } = opts;

  if (!Array.isArray(klines) || klines.length < lookbackBars + 5) {
    return { stale: false, elevatedBars: 0, lookback: 0, reason: 'insufficient bars' };
  }

  const window = klines.slice(-lookbackBars);
  const baseline = klines.slice(-lookbackBars - 20, -lookbackBars);
  if (baseline.length < 10) {
    return { stale: false, elevatedBars: 0, lookback: lookbackBars, reason: 'insufficient baseline' };
  }

  const baselineVol = baseline.reduce((s, b) => s + barVolume(b), 0) / baseline.length;
  if (!Number.isFinite(baselineVol) || baselineVol <= 0) {
    return { stale: false, elevatedBars: 0, lookback: lookbackBars, reason: 'zero baseline volume' };
  }

  let elevatedBars = 0;
  for (const bar of window) {
    const vol = barVolume(bar);
    if (vol / baselineVol >= elevatedThreshold) elevatedBars++;
  }

  const stale = elevatedBars > maxElevatedBars;
  return {
    stale,
    elevatedBars,
    lookback: lookbackBars,
    reason: stale
      ? `Volume elevated ${elevatedBars}/${lookbackBars} bars (>= ${elevatedThreshold}× baseline) — signal exhausted`
      : `${elevatedBars}/${lookbackBars} elevated bars (under threshold)`
  };
}

/**
 * Combined staleness check — true if ANY staleness signal fires.
 * Returns the first reason that triggered, or { stale: false } if none.
 */
function isEntryStale(klines, direction, opts = {}) {
  const price = detectPriceStaleness(klines, direction, opts);
  if (price.stale) return { stale: true, ...price, gate: 'price' };

  const volume = detectVolumeStaleness(klines, opts);
  if (volume.stale) return { stale: true, ...volume, gate: 'volume' };

  return { stale: false, reason: 'fresh', priceMovePct: price.movePct, elevatedBars: volume.elevatedBars };
}

module.exports = {
  detectPriceStaleness,
  detectVolumeStaleness,
  isEntryStale
};
