'use strict';
/**
 * NexusTradeAI — Strategy Validation Tests
 *
 * Self-contained: all pure strategy logic is extracted/replicated here.
 * No network calls. No real API calls. Uses Node.js built-in `assert` only.
 *
 * Run: node tests/strategy-tests.js
 */

const assert = require('assert');

// ============================================================================
// TEST RUNNER HELPERS
// ============================================================================

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        console.log(`  PASS  ${name}`);
        passed++;
    } catch (err) {
        console.log(`  FAIL  ${name}`);
        console.log(`        Reason: ${err.message}`);
        failed++;
        failures.push({ name, reason: err.message });
    }
}

function section(title) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  ${title}`);
    console.log('='.repeat(60));
}

// ============================================================================
// ============================================================================
//  STOCK BOT — Extracted pure-logic copies
//  Source: clients/bot-dashboard/unified-trading-bot.js
// ============================================================================
// ============================================================================

// --- Constants (lines 618-621) ---
const STOCK_MAX_TRADES_PER_DAY = 15;
const STOCK_MAX_TRADES_PER_SYMBOL = 3;
const STOCK_MIN_TIME_BETWEEN_TRADES = 10 * 60 * 1000;   // 10 min in ms
const STOCK_MIN_TIME_AFTER_STOP = 60 * 60 * 1000;        // 60 min in ms

// --- MOMENTUM_CONFIG (lines 661-695) ---
const STOCK_MOMENTUM_CONFIG = {
    tier1: {
        threshold: 3.5,
        minVolume: 500000,
        volumeRatio: 1.5,
        rsiMax: 68,
        rsiMin: 38,
        positionSize: 0.005,
        stopLoss: 0.04,
        profitTarget: 0.08,
        maxPositions: 5
    },
    tier2: {
        threshold: 5.0,
        minVolume: 750000,
        volumeRatio: 1.5,
        rsiMax: 68,
        rsiMin: 38,
        positionSize: 0.0075,
        stopLoss: 0.05,
        profitTarget: 0.10,
        maxPositions: 3
    },
    tier3: {
        threshold: 10.0,
        minVolume: 1000000,
        volumeRatio: 1.8,
        rsiMax: 70,
        rsiMin: 38,
        positionSize: 0.01,
        stopLoss: 0.06,
        profitTarget: 0.15,
        maxPositions: 2
    }
};

// --- EXIT_CONFIG (lines 626-659) ---
const STOCK_EXIT_CONFIG = {
    maxHoldDays: 7,
    idealHoldDays: 3,
    stalePositionDays: 10,

    profitTargetByDay: {
        0: 0.05,   // 5%
        1: 0.05,   // 5%
        2: 0.06,   // 6%
        3: 0.05,   // 5%
        4: 0.04,   // 4%
        5: 0.03,   // 3%
        6: 0.02,   // 2%
        7: 0.01    // 1%
    },

    trailingStopLevels: [
        { gainThreshold: 0.02, lockPercent: 0.40 },
        { gainThreshold: 0.03, lockPercent: 0.60 },
        { gainThreshold: 0.05, lockPercent: 0.75 },
        { gainThreshold: 0.07, lockPercent: 0.85 },
        { gainThreshold: 0.10, lockPercent: 0.92 }
    ],

    momentumReversal: {
        rsiOverbought: 72,
        volumeDropPercent: 0.50,
        dailyHighDropPercent: 0.02,
        supportBreakPercent: 0.015
    }
};

/**
 * canTrade — Stock bot (lines 991-1016)
 *
 * @param {string} symbol
 * @param {string} side
 * @param {object} state  — mutable state object so tests stay isolated
 *   state.stoppedOutSymbols  Map<symbol, stopTimestamp>
 *   state.totalTradesToday   number
 *   state.tradesPerSymbol    Map<symbol, count>
 *   state.recentTrades       Map<symbol, [{time, side}]>
 */
function stockCanTrade(symbol, side = 'buy', state) {
    const {
        stoppedOutSymbols,
        totalTradesToday,
        tradesPerSymbol,
        recentTrades
    } = state;

    const stopTime = stoppedOutSymbols.get(symbol);
    if (stopTime) {
        const timeSinceStop = Date.now() - stopTime;
        if (timeSinceStop < STOCK_MIN_TIME_AFTER_STOP) {
            return false;
        }
        // Expired — would delete from map in real code but we don't mutate in tests
    }

    if (totalTradesToday >= STOCK_MAX_TRADES_PER_DAY) return false;

    const symbolTrades = tradesPerSymbol.get(symbol) || 0;
    if (symbolTrades >= STOCK_MAX_TRADES_PER_SYMBOL) return false;

    const recent = recentTrades.get(symbol) || [];
    if (recent.length > 0) {
        const lastTrade = recent[recent.length - 1];
        const timeSince = Date.now() - lastTrade.time;
        if (timeSince < STOCK_MIN_TIME_BETWEEN_TRADES) return false;
        if (lastTrade.side !== side && timeSince < STOCK_MIN_TIME_BETWEEN_TRADES * 1.5) return false;
    }

    return true;
}

/**
 * assignStockTier — replicates tier-assignment logic from analyzeMomentum
 * (lines 1494-1510).
 *
 * Returns the highest qualifying tier name ('tier1'|'tier2'|'tier3') or null.
 *
 * @param {number} percentChange   intraday % move
 * @param {number} volumeRatio     today vs prev day volume
 * @param {number} volumeToday     absolute shares today
 * @param {number} rsi             current RSI value
 */
function assignStockTier(percentChange, volumeRatio, volumeToday, rsi) {
    const candidates = [];
    if (percentChange >= STOCK_MOMENTUM_CONFIG.tier3.threshold) candidates.push('tier3');
    if (percentChange >= STOCK_MOMENTUM_CONFIG.tier2.threshold) candidates.push('tier2');
    if (percentChange >= STOCK_MOMENTUM_CONFIG.tier1.threshold) candidates.push('tier1');

    for (const candidate of candidates) {
        const c = STOCK_MOMENTUM_CONFIG[candidate];
        if (
            volumeRatio >= c.volumeRatio &&
            volumeToday >= c.minVolume &&
            rsi >= c.rsiMin &&
            rsi <= c.rsiMax
        ) {
            return candidate;
        }
    }
    return null;
}

/**
 * updateStockTrailingStop — pure form of lines 1131-1155
 *
 * Mutates position.stopLoss (only upward). Returns bool whether stop was raised.
 */
function updateStockTrailingStop(position, currentPrice, unrealizedPL) {
    const gainDecimal = unrealizedPL / 100;

    for (let i = STOCK_EXIT_CONFIG.trailingStopLevels.length - 1; i >= 0; i--) {
        const level = STOCK_EXIT_CONFIG.trailingStopLevels[i];
        if (gainDecimal >= level.gainThreshold) {
            const totalGain = currentPrice - position.entry;
            const lockedGain = totalGain * level.lockPercent;
            const newStop = position.entry + lockedGain;

            if (newStop > position.stopLoss) {
                position.stopLoss = newStop;
                return true;
            }
            break;
        }
    }
    return false;
}

/**
 * getDynamicProfitTarget — returns the % profit target for a given holdDays value.
 * Maps to EXIT_CONFIG.profitTargetByDay * 100.
 */
function getDynamicProfitTarget(holdDays) {
    const dayIndex = Math.min(Math.floor(holdDays), 7);
    return STOCK_EXIT_CONFIG.profitTargetByDay[dayIndex] * 100;
}

// ============================================================================
// ============================================================================
//  FOREX BOT — Extracted pure-logic copies
//  Source: clients/bot-dashboard/unified-forex-bot.js
// ============================================================================
// ============================================================================

// --- Constants (lines 580-583) ---
const FOREX_MAX_TRADES_PER_DAY = 10;
const FOREX_MAX_TRADES_PER_PAIR = 2;
const FOREX_MIN_TIME_BETWEEN_TRADES = 30 * 60 * 1000;  // 30 min
const FOREX_MIN_TIME_AFTER_STOP = 2 * 60 * 60 * 1000;  // 2 hours

// --- MOMENTUM_CONFIG (lines 619-647) ---
const FOREX_MOMENTUM_CONFIG = {
    tier1: {
        threshold: 0.003,   // 0.3% trendStrength
        rsiMax: 70,
        rsiMin: 30,
        positionSize: 0.01,
        stopLoss: 0.02,
        profitTarget: 0.04,
        maxPositions: 4
    },
    tier2: {
        threshold: 0.005,   // 0.5%
        rsiMax: 72,
        rsiMin: 28,
        positionSize: 0.015,
        stopLoss: 0.02,
        profitTarget: 0.045,
        maxPositions: 2
    },
    tier3: {
        threshold: 0.008,   // 0.8%
        rsiMax: 75,
        rsiMin: 25,
        positionSize: 0.02,
        stopLoss: 0.025,
        profitTarget: 0.06,
        maxPositions: 1
    }
};

/**
 * forexCanTrade — replicates lines 712-752
 *
 * @param {string} pair
 * @param {string} direction  'long'|'short'
 * @param {object} state
 *   state.stoppedOutPairs   Map<pair, {time, cooldownMs} | number>
 *   state.totalTradesToday  number
 *   state.tradesPerPair     Map<pair, count>
 *   state.recentTrades      Map<pair, [{time}]>
 *   state.positions         Map<pair, {direction}>   — for correlation (we stub as empty here)
 */
function forexCanTrade(pair, direction = 'long', state) {
    const { stoppedOutPairs, totalTradesToday, tradesPerPair, recentTrades } = state;

    const stopEntry = stoppedOutPairs.get(pair);
    if (stopEntry) {
        const { time, cooldownMs } = typeof stopEntry === 'object'
            ? stopEntry
            : { time: stopEntry, cooldownMs: FOREX_MIN_TIME_AFTER_STOP };
        if (Date.now() - time < cooldownMs) {
            return { allowed: false, reason: 'Stop-out cooldown' };
        }
    }

    if (totalTradesToday >= FOREX_MAX_TRADES_PER_DAY) {
        return { allowed: false, reason: `Daily limit (${FOREX_MAX_TRADES_PER_DAY})` };
    }

    const pairTrades = tradesPerPair.get(pair) || 0;
    if (pairTrades >= FOREX_MAX_TRADES_PER_PAIR) {
        return { allowed: false, reason: `Pair limit (${FOREX_MAX_TRADES_PER_PAIR})` };
    }

    const recent = recentTrades.get(pair) || [];
    if (recent.length > 0) {
        const lastTrade = recent[recent.length - 1];
        const timeSince = Date.now() - lastTrade.time;
        if (timeSince < FOREX_MIN_TIME_BETWEEN_TRADES) {
            return { allowed: false, reason: 'Cooldown' };
        }
    }

    // Correlation check omitted — requires live positions map; covered by separate test.
    return { allowed: true };
}

/**
 * assignForexTier — replicates lines 1104-1108
 *
 * trendStrength = Math.abs(currentPrice - sma50) / sma50
 * Highest matching tier wins.
 */
function assignForexTier(trendStrength) {
    if (trendStrength >= FOREX_MOMENTUM_CONFIG.tier3.threshold) return 'tier3';
    if (trendStrength >= FOREX_MOMENTUM_CONFIG.tier2.threshold) return 'tier2';
    if (trendStrength >= FOREX_MOMENTUM_CONFIG.tier1.threshold) return 'tier1';
    return null;
}

/**
 * forexScanFilter — replicates line 1082:
 *   const tradablePairs = FOREX_PAIRS.filter(pair => !heldPositions.has(pair) && canTrade(pair).allowed);
 *
 * Checks that a pair already in the positions Map is excluded.
 */
function forexScanFilter(allPairs, heldPositions, canTradeResult) {
    return allPairs.filter(pair => !heldPositions.has(pair) && canTradeResult(pair).allowed);
}

// ============================================================================
// ============================================================================
//  CRYPTO BOT — Extracted pure-logic copies
//  Source: clients/bot-dashboard/unified-crypto-bot.js
// ============================================================================
// ============================================================================

// --- CRYPTO_CONFIG (lines 161-273) ---
const CRYPTO_CONFIG = {
    maxTotalPositions: 4,
    maxPositionsPerSymbol: 1,
    maxTradesPerDay: 10,
    maxTradesPerSymbol: 2,
    minTimeBetweenTrades: 30,   // minutes
    basePositionSizeUSD: 500,
    maxPositionSizeUSD: 2000,
    trailingStops: [
        { profit: 0.05, stopDistance: 0.03 },
        { profit: 0.10, stopDistance: 0.06 },
        { profit: 0.20, stopDistance: 0.12 },
        { profit: 0.30, stopDistance: 0.18 }
    ]
};

/**
 * cryptoCanTrade — replicates CryptoTradingEngine.canTrade() (lines 763-793)
 */
function cryptoCanTrade(symbol, state) {
    const {
        dailyTradeCount,
        tradesToday,
        lastTradeTime,
        positions
    } = state;

    if (dailyTradeCount >= CRYPTO_CONFIG.maxTradesPerDay) {
        return { allowed: false, reason: 'Daily limit reached' };
    }

    const symbolTradesToday = tradesToday.filter(t => t.symbol === symbol).length;
    if (symbolTradesToday >= CRYPTO_CONFIG.maxTradesPerSymbol) {
        return { allowed: false, reason: 'Symbol limit reached' };
    }

    const lastTrade = lastTradeTime.get(symbol);
    if (lastTrade) {
        const timeSince = (Date.now() - lastTrade) / 60000;
        if (timeSince < CRYPTO_CONFIG.minTimeBetweenTrades) {
            return { allowed: false, reason: 'Cooldown period' };
        }
    }

    if (positions.size >= CRYPTO_CONFIG.maxTotalPositions) {
        return { allowed: false, reason: 'Max positions' };
    }

    return { allowed: true };
}

/**
 * cryptoKellyPositionSize — replicates executeTrade() sizing logic (lines 810-819)
 *
 * @param {number} winningTrades
 * @param {number} losingTrades
 * @param {number} signalSizingFactor  (default 1.0)
 * @returns {number} positionSizeUSD
 */
function cryptoKellyPositionSize(winningTrades, losingTrades, signalSizingFactor = 1.0) {
    const totalClosedTrades = winningTrades + losingTrades;
    const runningWinRate = totalClosedTrades >= 10
        ? winningTrades / totalClosedTrades
        : 0.5;
    const sizingMultiplier = Math.max(0.25, Math.min(2.0, runningWinRate / 0.5));
    return Math.min(
        CRYPTO_CONFIG.basePositionSizeUSD * sizingMultiplier * signalSizingFactor,
        CRYPTO_CONFIG.maxPositionSizeUSD
    );
}

/**
 * cryptoDemoModeDetection — replicates start() logic (lines 1170-1188)
 *
 * @param {string|undefined} apiKey
 * @param {string|undefined} apiSecret
 * @returns {boolean} demoMode
 */
function cryptoDemoModeDetection(apiKey, apiSecret) {
    const hasKeys = apiKey && apiSecret;
    if (!hasKeys) return true;  // no keys → demo
    // In production, if exchange.getAccountInfo() fails it also sets demo=true.
    // We only test the key-presence branch here (deterministic).
    return false;
}

/**
 * cryptoDailyLossBlocked — replicates the circuit breaker check in tradingLoop() (line 1106)
 *
 * @param {number} dailyLoss       accumulated realised loss (positive number)
 * @param {number} maxDailyLoss    limit (positive number)
 * @returns {boolean} true when trading should be blocked
 */
function cryptoDailyLossBlocked(dailyLoss, maxDailyLoss) {
    return dailyLoss >= maxDailyLoss;
}

/**
 * cryptoUpdateTrailingStop — replicates CryptoTradingEngine.updateTrailingStop() (lines 998-1016)
 *
 * Mutates position.stopLoss (only upward). Returns bool.
 */
function cryptoUpdateTrailingStop(position, currentPrice, pnlPercent) {
    for (const level of CRYPTO_CONFIG.trailingStops) {
        if (pnlPercent >= level.profit * 100) {
            const newStop = currentPrice * (1 - level.stopDistance);
            if (newStop > position.stopLoss) {
                position.stopLoss = newStop;
                return true;
            }
            break;
        }
    }
    return false;
}

// ============================================================================
// ============================================================================
//  TEST CASES
// ============================================================================
// ============================================================================

// ── STOCK BOT ──────────────────────────────────────────────────────────────

section('STOCK BOT — canTrade()');

test('Returns true when all conditions clear', () => {
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 0,
        tradesPerSymbol: new Map(),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('AAPL', 'buy', state), true);
});

test('Returns false when daily limit hit (15 trades)', () => {
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 15,
        tradesPerSymbol: new Map(),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('AAPL', 'buy', state), false);
});

test('Returns false when daily limit at exactly MAX (15)', () => {
    // Boundary: exactly at the limit should block
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: STOCK_MAX_TRADES_PER_DAY,
        tradesPerSymbol: new Map(),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('TSLA', 'buy', state), false);
});

test('Returns true when one trade below daily limit (14 trades)', () => {
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 14,
        tradesPerSymbol: new Map(),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('NVDA', 'buy', state), true);
});

test('Returns false when per-symbol limit hit (3 trades on AAPL)', () => {
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 5,
        tradesPerSymbol: new Map([['AAPL', 3]]),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('AAPL', 'buy', state), false);
});

test('Returns true for a different symbol when one symbol is exhausted', () => {
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 5,
        tradesPerSymbol: new Map([['AAPL', 3]]),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('TSLA', 'buy', state), true);
});

test('Returns false when in 10-min trade cooldown', () => {
    const nineMinutesAgo = Date.now() - 9 * 60 * 1000;
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 0,
        tradesPerSymbol: new Map(),
        recentTrades: new Map([['AAPL', [{ time: nineMinutesAgo, side: 'buy' }]]])
    };
    assert.strictEqual(stockCanTrade('AAPL', 'buy', state), false);
});

test('Returns true when past 10-min cooldown (11 min ago)', () => {
    const elevenMinutesAgo = Date.now() - 11 * 60 * 1000;
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 0,
        tradesPerSymbol: new Map(),
        recentTrades: new Map([['AAPL', [{ time: elevenMinutesAgo, side: 'buy' }]]])
    };
    assert.strictEqual(stockCanTrade('AAPL', 'buy', state), true);
});

test('Returns false when in 60-min stop-out cooldown', () => {
    const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
    const state = {
        stoppedOutSymbols: new Map([['AAPL', thirtyMinutesAgo]]),
        totalTradesToday: 0,
        tradesPerSymbol: new Map(),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('AAPL', 'buy', state), false);
});

test('Returns true after stop-out cooldown has expired (61 min ago)', () => {
    const sixtyOneMinutesAgo = Date.now() - 61 * 60 * 1000;
    const state = {
        stoppedOutSymbols: new Map([['AAPL', sixtyOneMinutesAgo]]),
        totalTradesToday: 0,
        tradesPerSymbol: new Map(),
        recentTrades: new Map()
    };
    assert.strictEqual(stockCanTrade('AAPL', 'buy', state), true);
});

test('Direction-flip blocked within 1.5x cooldown (buy then sell, 12 min ago)', () => {
    // last trade was a BUY 12 minutes ago; 12 * 60 * 1000 < 1.5 * 10 * 60 * 1000 (15 min)
    const twelveMinutesAgo = Date.now() - 12 * 60 * 1000;
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 0,
        tradesPerSymbol: new Map(),
        recentTrades: new Map([['AAPL', [{ time: twelveMinutesAgo, side: 'buy' }]]])
    };
    // Trying to sell (opposite direction) within 15 min window → blocked
    assert.strictEqual(stockCanTrade('AAPL', 'sell', state), false);
});

test('Direction-flip allowed when past 1.5x cooldown (16 min ago)', () => {
    const sixteenMinutesAgo = Date.now() - 16 * 60 * 1000;
    const state = {
        stoppedOutSymbols: new Map(),
        totalTradesToday: 0,
        tradesPerSymbol: new Map(),
        recentTrades: new Map([['AAPL', [{ time: sixteenMinutesAgo, side: 'buy' }]]])
    };
    assert.strictEqual(stockCanTrade('AAPL', 'sell', state), true);
});

// ── STOCK BOT — Tier assignment ────────────────────────────────────────────

section('STOCK BOT — Momentum tier assignment');

// Tier thresholds: tier1 >= 3.5%, tier2 >= 5.0%, tier3 >= 10.0%
// Secondary filters: volumeRatio, minVolume, RSI

test('tier3 assigned when percentChange >= 10% (all secondary filters pass)', () => {
    const tier = assignStockTier(10.5, 2.0, 1200000, 55);
    assert.strictEqual(tier, 'tier3');
});

test('tier3 — boundary at exactly 10.0%', () => {
    const tier = assignStockTier(10.0, 2.0, 1200000, 55);
    assert.strictEqual(tier, 'tier3');
});

test('tier2 assigned when percentChange = 6% (below tier3 threshold)', () => {
    const tier = assignStockTier(6.0, 1.6, 800000, 50);
    assert.strictEqual(tier, 'tier2');
});

test('tier2 — boundary at exactly 5.0%', () => {
    const tier = assignStockTier(5.0, 1.6, 800000, 50);
    assert.strictEqual(tier, 'tier2');
});

test('tier1 assigned when percentChange = 3.5% (below tier2 threshold)', () => {
    const tier = assignStockTier(3.5, 1.6, 600000, 50);
    assert.strictEqual(tier, 'tier1');
});

test('null returned when percentChange < 3.5% (below all thresholds)', () => {
    const tier = assignStockTier(2.0, 2.0, 600000, 50);
    assert.strictEqual(tier, null);
});

test('tier3 demoted to tier2 when volumeRatio too low for tier3 (needs 1.8x, has 1.6x)', () => {
    // percentChange qualifies for tier3 but volumeRatio 1.6 < 1.8 (tier3 requirement)
    // Should fall back to tier2 (requires 1.5x vol ratio — 1.6 passes)
    const tier = assignStockTier(12.0, 1.6, 1200000, 55);
    assert.strictEqual(tier, 'tier2');
});

test('tier3 demoted to tier2 when minVolume insufficient (needs 1M, has 900k)', () => {
    const tier = assignStockTier(12.0, 2.0, 900000, 55);
    // tier3 requires minVolume 1000000 — fails. tier2 requires 750000 — passes
    assert.strictEqual(tier, 'tier2');
});

test('null returned when RSI above tier1 rsiMax (68)', () => {
    // All other criteria pass but RSI 70 > 68 (tier1 max)
    const tier = assignStockTier(4.0, 1.6, 600000, 70);
    assert.strictEqual(tier, null);
});

test('null returned when RSI below tier1 rsiMin (38)', () => {
    const tier = assignStockTier(4.0, 1.6, 600000, 35);
    assert.strictEqual(tier, null);
});

test('tier3 RSI max is 70 — RSI 69 passes tier3', () => {
    const tier = assignStockTier(10.5, 2.0, 1200000, 69);
    assert.strictEqual(tier, 'tier3');
});

test('RSI at 68 passes tier1 boundary exactly', () => {
    const tier = assignStockTier(4.0, 1.6, 600000, 68);
    assert.strictEqual(tier, 'tier1');
});

test('RSI at 38 passes tier1 lower boundary exactly', () => {
    const tier = assignStockTier(4.0, 1.6, 600000, 38);
    assert.strictEqual(tier, 'tier1');
});

// ── STOCK BOT — Trailing stops ────────────────────────────────────────────

section('STOCK BOT — Trailing stop logic');

test('Stop raised when gain hits 2% threshold (locks 40%)', () => {
    const pos = { symbol: 'AAPL', entry: 100, stopLoss: 96 };
    const currentPrice = 102;
    const unrealizedPL = 2.0;   // 2%
    const raised = updateStockTrailingStop(pos, currentPrice, unrealizedPL);
    // Expected: locked gain = (102-100) * 0.40 = 0.80; newStop = 100 + 0.80 = 100.80
    assert.strictEqual(raised, true);
    assert.strictEqual(pos.stopLoss, 100.80);
});

test('Stop raised to 60% lock at 3% gain', () => {
    const pos = { symbol: 'AAPL', entry: 100, stopLoss: 96 };
    const currentPrice = 103;
    const unrealizedPL = 3.0;
    const raised = updateStockTrailingStop(pos, currentPrice, unrealizedPL);
    // Expected: locked gain = (103-100) * 0.60 = 1.80; newStop = 101.80
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - 101.80) < 0.0001, `Expected ~101.80, got ${pos.stopLoss}`);
});

test('Stop raised to 92% lock at 10% gain', () => {
    const pos = { symbol: 'NVDA', entry: 100, stopLoss: 94 };
    const currentPrice = 110;
    const unrealizedPL = 10.0;
    const raised = updateStockTrailingStop(pos, currentPrice, unrealizedPL);
    // Expected: locked gain = (110-100) * 0.92 = 9.20; newStop = 109.20
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - 109.20) < 0.0001, `Expected ~109.20, got ${pos.stopLoss}`);
});

test('Stop NOT lowered (protection: only moves up)', () => {
    // Position has stop already at 104 — even if new calculation comes out lower, must not lower
    const pos = { symbol: 'AAPL', entry: 100, stopLoss: 104 };
    const currentPrice = 105;
    const unrealizedPL = 5.0;
    const raised = updateStockTrailingStop(pos, currentPrice, unrealizedPL);
    // new stop would be 100 + (105-100)*0.75 = 103.75, which is LESS than 104 → no update
    assert.strictEqual(raised, false);
    assert.strictEqual(pos.stopLoss, 104, 'Stop must not be lowered');
});

test('No stop update when gain below first threshold (1.9%)', () => {
    const pos = { symbol: 'AAPL', entry: 100, stopLoss: 96 };
    const raised = updateStockTrailingStop(pos, 101.9, 1.9);
    assert.strictEqual(raised, false);
    assert.strictEqual(pos.stopLoss, 96, 'Stop must remain unchanged when below first threshold');
});

test('Highest applicable level used (10% gain uses 92% lock, not 75%)', () => {
    const pos = { symbol: 'AAPL', entry: 100, stopLoss: 94 };
    const raised = updateStockTrailingStop(pos, 110, 10.0);
    // Should use 92% lock, not 75% (which is the 5% threshold level)
    const expectedStop = 100 + (110 - 100) * 0.92; // 109.20
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - expectedStop) < 0.0001);
});

// ── STOCK BOT — Dynamic profit targets ────────────────────────────────────

section('STOCK BOT — Dynamic profit targets (profitTargetByDay)');

test('Day 0: profit target is 5%', () => {
    assert.strictEqual(getDynamicProfitTarget(0), 5.0);
});

test('Day 0.5 (half day): target is still 5%', () => {
    // Math.floor(0.5) = 0 → 5%
    assert.strictEqual(getDynamicProfitTarget(0.5), 5.0);
});

test('Day 1: profit target is 5%', () => {
    assert.strictEqual(getDynamicProfitTarget(1.0), 5.0);
});

test('Day 2: profit target is 6%', () => {
    assert.strictEqual(getDynamicProfitTarget(2.0), 6.0);
});

test('Day 3: profit target is 5%', () => {
    assert.strictEqual(getDynamicProfitTarget(3.0), 5.0);
});

test('Day 4: profit target is 4%', () => {
    assert.strictEqual(getDynamicProfitTarget(4.0), 4.0);
});

test('Day 5: profit target is 3%', () => {
    assert.strictEqual(getDynamicProfitTarget(5.0), 3.0);
});

test('Day 6: profit target is 2%', () => {
    assert.strictEqual(getDynamicProfitTarget(6.0), 2.0);
});

test('Day 7: profit target is 1%', () => {
    assert.strictEqual(getDynamicProfitTarget(7.0), 1.0);
});

test('Day 9 (past max hold): still caps at day 7 (1%)', () => {
    // dayIndex = Math.min(Math.floor(9), 7) = 7 → 1%
    assert.strictEqual(getDynamicProfitTarget(9.0), 1.0);
});

// ── FOREX BOT — canTrade() ─────────────────────────────────────────────────

section('FOREX BOT — canTrade()');

test('Returns allowed=true when all conditions clear', () => {
    const state = {
        stoppedOutPairs: new Map(),
        totalTradesToday: 0,
        tradesPerPair: new Map(),
        recentTrades: new Map()
    };
    const result = forexCanTrade('EUR_USD', 'long', state);
    assert.strictEqual(result.allowed, true);
});

test('Returns allowed=false when daily limit hit (10 trades)', () => {
    const state = {
        stoppedOutPairs: new Map(),
        totalTradesToday: 10,
        tradesPerPair: new Map(),
        recentTrades: new Map()
    };
    const result = forexCanTrade('EUR_USD', 'long', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Daily limit'));
});

test('Returns allowed=false when per-pair limit hit (2 trades on EUR_USD)', () => {
    const state = {
        stoppedOutPairs: new Map(),
        totalTradesToday: 3,
        tradesPerPair: new Map([['EUR_USD', 2]]),
        recentTrades: new Map()
    };
    const result = forexCanTrade('EUR_USD', 'long', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Pair limit'));
});

test('Returns allowed=true for different pair when EUR_USD is exhausted', () => {
    const state = {
        stoppedOutPairs: new Map(),
        totalTradesToday: 3,
        tradesPerPair: new Map([['EUR_USD', 2]]),
        recentTrades: new Map()
    };
    const result = forexCanTrade('GBP_USD', 'long', state);
    assert.strictEqual(result.allowed, true);
});

test('Returns allowed=false when in 30-min trade cooldown', () => {
    const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;
    const state = {
        stoppedOutPairs: new Map(),
        totalTradesToday: 0,
        tradesPerPair: new Map(),
        recentTrades: new Map([['EUR_USD', [{ time: twentyMinutesAgo }]]])
    };
    const result = forexCanTrade('EUR_USD', 'long', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Cooldown'));
});

test('Returns allowed=true when past 30-min cooldown (31 min ago)', () => {
    const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
    const state = {
        stoppedOutPairs: new Map(),
        totalTradesToday: 0,
        tradesPerPair: new Map(),
        recentTrades: new Map([['EUR_USD', [{ time: thirtyOneMinutesAgo }]]])
    };
    const result = forexCanTrade('EUR_USD', 'long', state);
    assert.strictEqual(result.allowed, true);
});

test('Returns allowed=false when in 2-hour stop-out cooldown (1 hour ago)', () => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const state = {
        stoppedOutPairs: new Map([['EUR_USD', { time: oneHourAgo, cooldownMs: FOREX_MIN_TIME_AFTER_STOP }]]),
        totalTradesToday: 0,
        tradesPerPair: new Map(),
        recentTrades: new Map()
    };
    const result = forexCanTrade('EUR_USD', 'long', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('cooldown'));
});

test('Returns allowed=true after 2-hour stop-out cooldown expires (121 min ago)', () => {
    const hundredTwentyOneMinutesAgo = Date.now() - 121 * 60 * 1000;
    const state = {
        stoppedOutPairs: new Map([['EUR_USD', { time: hundredTwentyOneMinutesAgo, cooldownMs: FOREX_MIN_TIME_AFTER_STOP }]]),
        totalTradesToday: 0,
        tradesPerPair: new Map(),
        recentTrades: new Map()
    };
    const result = forexCanTrade('EUR_USD', 'long', state);
    assert.strictEqual(result.allowed, true);
});

test('Stop-out stored as raw timestamp (backward compat) still triggers cooldown', () => {
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const state = {
        // Raw number (old format, not object)
        stoppedOutPairs: new Map([['USD_JPY', fifteenMinutesAgo]]),
        totalTradesToday: 0,
        tradesPerPair: new Map(),
        recentTrades: new Map()
    };
    const result = forexCanTrade('USD_JPY', 'long', state);
    assert.strictEqual(result.allowed, false);
});

// ── FOREX BOT — Scan filter (positions already held excluded) ───────────

section('FOREX BOT — Scan filter (open positions excluded)');

test('Pair already in positions map is excluded from scan list', () => {
    const allPairs = ['EUR_USD', 'GBP_USD', 'USD_JPY'];
    const heldPositions = new Map([['EUR_USD', { direction: 'long' }]]);
    const fakeCanTrade = (pair) => ({ allowed: true }); // always allowed
    const tradable = forexScanFilter(allPairs, heldPositions, fakeCanTrade);
    assert.ok(!tradable.includes('EUR_USD'), 'EUR_USD should be excluded (position held)');
    assert.ok(tradable.includes('GBP_USD'), 'GBP_USD should be included');
    assert.ok(tradable.includes('USD_JPY'), 'USD_JPY should be included');
});

test('All pairs excluded when all are held', () => {
    const allPairs = ['EUR_USD', 'GBP_USD'];
    const heldPositions = new Map([
        ['EUR_USD', { direction: 'long' }],
        ['GBP_USD', { direction: 'short' }]
    ]);
    const fakeCanTrade = (pair) => ({ allowed: true });
    const tradable = forexScanFilter(allPairs, heldPositions, fakeCanTrade);
    assert.strictEqual(tradable.length, 0, 'No pairs should be tradable');
});

test('Pair with canTrade=false is excluded regardless of position', () => {
    const allPairs = ['EUR_USD', 'GBP_USD', 'USD_JPY'];
    const heldPositions = new Map();
    // EUR_USD blocked by canTrade
    const fakeCanTrade = (pair) => ({ allowed: pair !== 'EUR_USD' });
    const tradable = forexScanFilter(allPairs, heldPositions, fakeCanTrade);
    assert.ok(!tradable.includes('EUR_USD'), 'EUR_USD should be blocked by canTrade');
    assert.strictEqual(tradable.length, 2);
});

// ── FOREX BOT — Tier selection ─────────────────────────────────────────────

section('FOREX BOT — trendStrength → tier assignment');

// Thresholds: tier1 >= 0.003, tier2 >= 0.005, tier3 >= 0.008

test('tier3 assigned when trendStrength = 0.009 (>= 0.008)', () => {
    assert.strictEqual(assignForexTier(0.009), 'tier3');
});

test('tier3 boundary at exactly 0.008', () => {
    assert.strictEqual(assignForexTier(0.008), 'tier3');
});

test('tier2 assigned when trendStrength = 0.006 (>= 0.005, < 0.008)', () => {
    assert.strictEqual(assignForexTier(0.006), 'tier2');
});

test('tier2 boundary at exactly 0.005', () => {
    assert.strictEqual(assignForexTier(0.005), 'tier2');
});

test('tier1 assigned when trendStrength = 0.004 (>= 0.003, < 0.005)', () => {
    assert.strictEqual(assignForexTier(0.004), 'tier1');
});

test('tier1 boundary at exactly 0.003', () => {
    assert.strictEqual(assignForexTier(0.003), 'tier1');
});

test('null returned when trendStrength = 0.002 (below all thresholds)', () => {
    assert.strictEqual(assignForexTier(0.002), null);
});

test('null returned when trendStrength = 0 (zero)', () => {
    assert.strictEqual(assignForexTier(0), null);
});

// ── CRYPTO BOT — DEMO mode detection ──────────────────────────────────────

section('CRYPTO BOT — DEMO mode detection');

test('demoMode=true when no API key set', () => {
    assert.strictEqual(cryptoDemoModeDetection(undefined, undefined), true);
});

test('demoMode=true when API key set but secret missing', () => {
    assert.strictEqual(cryptoDemoModeDetection('some-key', undefined), true);
});

test('demoMode=true when API key missing but secret present', () => {
    assert.strictEqual(cryptoDemoModeDetection(undefined, 'some-secret'), true);
});

test('demoMode=false when both API key and secret are set', () => {
    assert.strictEqual(cryptoDemoModeDetection('real-key', 'real-secret'), false);
});

test('demoMode=true when both are empty strings', () => {
    // Empty string is falsy — no credentials
    assert.strictEqual(cryptoDemoModeDetection('', ''), true);
});

// ── CRYPTO BOT — canTrade() ────────────────────────────────────────────────

section('CRYPTO BOT — canTrade()');

test('Returns allowed=true when all conditions clear', () => {
    const state = {
        dailyTradeCount: 0,
        tradesToday: [],
        lastTradeTime: new Map(),
        positions: new Map()
    };
    const result = cryptoCanTrade('XBTUSD', state);
    assert.strictEqual(result.allowed, true);
});

test('Returns allowed=false when daily limit hit (10 trades)', () => {
    const state = {
        dailyTradeCount: 10,
        tradesToday: [],
        lastTradeTime: new Map(),
        positions: new Map()
    };
    const result = cryptoCanTrade('XBTUSD', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Daily limit'));
});

test('Returns allowed=false when per-symbol limit hit (2 trades on ETHUSD today)', () => {
    const state = {
        dailyTradeCount: 3,
        tradesToday: [
            { symbol: 'ETHUSD', time: new Date() },
            { symbol: 'ETHUSD', time: new Date() }
        ],
        lastTradeTime: new Map(),
        positions: new Map()
    };
    const result = cryptoCanTrade('ETHUSD', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Symbol limit'));
});

test('Returns allowed=true for different symbol when ETHUSD is exhausted', () => {
    const state = {
        dailyTradeCount: 3,
        tradesToday: [
            { symbol: 'ETHUSD', time: new Date() },
            { symbol: 'ETHUSD', time: new Date() }
        ],
        lastTradeTime: new Map(),
        positions: new Map()
    };
    const result = cryptoCanTrade('SOLUSD', state);
    assert.strictEqual(result.allowed, true);
});

test('Returns allowed=false when in 30-min cooldown (20 min ago)', () => {
    const twentyMinutesAgo = Date.now() - 20 * 60 * 1000;
    const state = {
        dailyTradeCount: 0,
        tradesToday: [],
        lastTradeTime: new Map([['XBTUSD', twentyMinutesAgo]]),
        positions: new Map()
    };
    const result = cryptoCanTrade('XBTUSD', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Cooldown'));
});

test('Returns allowed=true when past 30-min cooldown (31 min ago)', () => {
    const thirtyOneMinutesAgo = Date.now() - 31 * 60 * 1000;
    const state = {
        dailyTradeCount: 0,
        tradesToday: [],
        lastTradeTime: new Map([['XBTUSD', thirtyOneMinutesAgo]]),
        positions: new Map()
    };
    const result = cryptoCanTrade('XBTUSD', state);
    assert.strictEqual(result.allowed, true);
});

test('Returns allowed=false when max 4 positions already open', () => {
    const positions = new Map([
        ['XBTUSD', {}], ['ETHUSD', {}], ['SOLUSD', {}], ['ADAUSD', {}]
    ]);
    const state = {
        dailyTradeCount: 0,
        tradesToday: [],
        lastTradeTime: new Map(),
        positions
    };
    const result = cryptoCanTrade('LINKUSD', state);
    assert.strictEqual(result.allowed, false);
    assert.ok(result.reason.includes('Max positions'));
});

test('Returns allowed=true when only 3 of 4 max positions open', () => {
    const positions = new Map([
        ['XBTUSD', {}], ['ETHUSD', {}], ['SOLUSD', {}]
    ]);
    const state = {
        dailyTradeCount: 0,
        tradesToday: [],
        lastTradeTime: new Map(),
        positions
    };
    const result = cryptoCanTrade('LINKUSD', state);
    assert.strictEqual(result.allowed, true);
});

// ── CRYPTO BOT — Kelly position sizing ────────────────────────────────────

section('CRYPTO BOT — Kelly position sizing');

// Formula: sizingMultiplier = clamp(0.25, 2.0, winRate / 0.5)
// positionSize = clamp(0, maxPositionSizeUSD, basePositionSizeUSD * sizingMultiplier * signalFactor)

test('Default 50% win rate (< 10 trades): multiplier = 1.0, size = $500', () => {
    // winRate=0.5 → multiplier = 0.5/0.5 = 1.0 → $500 * 1.0 * 1.0 = $500
    const size = cryptoKellyPositionSize(0, 0, 1.0);
    assert.strictEqual(size, 500);
});

test('50% win rate with 10+ trades: still multiplier = 1.0, size = $500', () => {
    const size = cryptoKellyPositionSize(5, 5, 1.0);  // exactly 10 trades, 50%
    assert.strictEqual(size, 500);
});

test('100% win rate: multiplier = 2.0, size = $1000 (capped by 2x, not maxPositionSize)', () => {
    // winRate=1.0 → multiplier = 1.0/0.5 = 2.0 → $500 * 2.0 = $1000
    const size = cryptoKellyPositionSize(10, 0, 1.0);
    assert.strictEqual(size, 1000);
});

test('0% win rate with 10+ trades: multiplier clamped to 0.25, size = $125', () => {
    // winRate=0 → multiplier = 0/0.5 = 0 → clamped to 0.25 → $500 * 0.25 = $125
    const size = cryptoKellyPositionSize(0, 10, 1.0);
    assert.strictEqual(size, 125);
});

test('75% win rate: multiplier = 1.5, size = $750', () => {
    // winRate=0.75 → multiplier = 0.75/0.5 = 1.5 → $500 * 1.5 = $750
    const size = cryptoKellyPositionSize(15, 5, 1.0); // 20 trades, 75%
    assert.strictEqual(size, 750);
});

test('Signal sizingFactor=0.5 halves the position (BTC bearish penalty)', () => {
    // 50% win rate → multiplier 1.0, sizingFactor 0.5 → $500 * 1.0 * 0.5 = $250
    const size = cryptoKellyPositionSize(0, 0, 0.5);
    assert.strictEqual(size, 250);
});

test('Max position size cap: win rate 100%, signal factor 10 → capped at $2000', () => {
    // $500 * 2.0 * 10 = $10000 → capped at $2000
    const size = cryptoKellyPositionSize(10, 0, 10.0);
    assert.strictEqual(size, 2000);
});

test('Combined BTC + MACD penalty (0.7 * 0.5 = 0.35): size = $175', () => {
    // $500 * 1.0 * 0.35 = $175
    const size = cryptoKellyPositionSize(0, 0, 0.35);
    assert.strictEqual(size, 175);
});

// ── CRYPTO BOT — Daily loss circuit breaker ────────────────────────────────

section('CRYPTO BOT — Daily loss circuit breaker');

test('Trading blocked when dailyLoss equals maxDailyLoss ($500)', () => {
    assert.strictEqual(cryptoDailyLossBlocked(500, 500), true);
});

test('Trading blocked when dailyLoss exceeds maxDailyLoss', () => {
    assert.strictEqual(cryptoDailyLossBlocked(600, 500), true);
});

test('Trading NOT blocked when dailyLoss is just below limit ($499.99)', () => {
    assert.strictEqual(cryptoDailyLossBlocked(499.99, 500), false);
});

test('Trading NOT blocked when dailyLoss = 0 (fresh day)', () => {
    assert.strictEqual(cryptoDailyLossBlocked(0, 500), false);
});

test('Custom MAX_DAILY_LOSS of $1000: blocked at $1001', () => {
    assert.strictEqual(cryptoDailyLossBlocked(1001, 1000), true);
});

test('Custom MAX_DAILY_LOSS of $1000: not blocked at $999', () => {
    assert.strictEqual(cryptoDailyLossBlocked(999, 1000), false);
});

// ── CRYPTO BOT — Trailing stop (never lowers) ─────────────────────────────

section('CRYPTO BOT — Trailing stop (only moves up)');

// Levels: +5% → trail 3%; +10% → trail 6%; +20% → trail 12%; +30% → trail 18%

test('Stop raised at +5% profit (trail 3%)', () => {
    const pos = { symbol: 'XBTUSD', entry: 40000, stopLoss: 38000 };
    const currentPrice = 42000; // +5%
    const raised = cryptoUpdateTrailingStop(pos, currentPrice, 5.0);
    // newStop = 42000 * (1 - 0.03) = 40740
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - 40740) < 0.01, `Expected ~40740, got ${pos.stopLoss}`);
});

test('[BUG] Stop raised at +10% profit uses 3% trail (not 6%) — forward iteration hits 5% level first', () => {
    // REAL BEHAVIOR: crypto updateTrailingStop iterates FORWARD (lowest level first) and breaks on first match.
    // At +10%, it hits the 5% level first → applies 3% trail distance.
    // Comment in source says "Use highest applicable level" but forward iteration finds LOWEST match.
    // This is a confirmed bug (stock bot iterates backward and correctly uses highest level).
    const pos = { symbol: 'ETHUSD', entry: 2000, stopLoss: 1900 };
    const currentPrice = 2200; // +10%
    const raised = cryptoUpdateTrailingStop(pos, currentPrice, 10.0);
    // Actual: 2200 * (1 - 0.03) = 2134 (uses 5% level's 3% trail, NOT 10% level's 6% trail)
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - 2134) < 0.01, `Expected ~2134 (bug: uses 3% trail), got ${pos.stopLoss}`);
});

test('[BUG] Stop raised at +20% profit uses 3% trail (not 12%) — same forward iteration bug', () => {
    // At +20%, forward iteration hits 5% level first → applies 3% trail.
    const pos = { symbol: 'SOLUSD', entry: 100, stopLoss: 95 };
    const currentPrice = 120; // +20%
    const raised = cryptoUpdateTrailingStop(pos, currentPrice, 20.0);
    // Actual: 120 * (1 - 0.03) = 116.40 (should be 120 * 0.88 = 105.60 if correctly using 12%)
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - 116.40) < 0.01, `Expected ~116.40 (bug: uses 3% trail), got ${pos.stopLoss}`);
});

test('[BUG] Stop raised at +30% profit uses 3% trail (not 18%) — same forward iteration bug', () => {
    // At +30%, forward iteration hits 5% level first → applies 3% trail.
    const pos = { symbol: 'XBTUSD', entry: 40000, stopLoss: 38000 };
    const currentPrice = 52000; // +30%
    const raised = cryptoUpdateTrailingStop(pos, currentPrice, 30.0);
    // Actual: 52000 * (1 - 0.03) = 50440 (should be 52000 * 0.82 = 42640 for 18% trail)
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - 50440) < 0.01, `Expected ~50440 (bug: uses 3% trail), got ${pos.stopLoss}`);
});

test('Stop NOT lowered when new calculation is lower than existing stop', () => {
    // Current stop is already very high — new calc must not lower it
    const pos = { symbol: 'XBTUSD', entry: 40000, stopLoss: 43000 };
    const currentPrice = 44000; // +10%
    // newStop = 44000 * (1 - 0.06) = 41360 < 43000 → should NOT update
    const raised = cryptoUpdateTrailingStop(pos, currentPrice, 10.0);
    assert.strictEqual(raised, false);
    assert.strictEqual(pos.stopLoss, 43000, 'Stop must not be lowered');
});

test('No update when profit below 5% threshold (4.9%)', () => {
    const pos = { symbol: 'ETHUSD', entry: 2000, stopLoss: 1900 };
    const raised = cryptoUpdateTrailingStop(pos, 2098, 4.9);
    assert.strictEqual(raised, false);
    assert.strictEqual(pos.stopLoss, 1900);
});

test('[BUG] At +25% profit the 5% level is matched first: trail is 3%, giving 121.25 (not 12% level 110)', () => {
    // Confirms the forward-iteration bug: at any profit >=5%, the 5% level always fires first.
    const pos = { symbol: 'SOLUSD', entry: 100, stopLoss: 90 };
    const currentPrice = 125; // +25%
    const raised = cryptoUpdateTrailingStop(pos, currentPrice, 25.0);
    // Actual: 125 * (1 - 0.03) = 121.25 (3% trail from 5% level)
    // Intended: 125 * (1 - 0.12) = 110 (12% trail from 20% level)
    assert.strictEqual(raised, true);
    assert.ok(Math.abs(pos.stopLoss - 121.25) < 0.01, `Expected ~121.25 (bug confirmed), got ${pos.stopLoss}`);
});

// ============================================================================
// SUMMARY
// ============================================================================

console.log(`\n${'='.repeat(60)}`);
console.log(`  TEST RESULTS`);
console.log('='.repeat(60));
console.log(`  Total:  ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failures.length > 0) {
    console.log(`\n  FAILURES:`);
    failures.forEach((f, i) => {
        console.log(`    ${i + 1}. ${f.name}`);
        console.log(`       ${f.reason}`);
    });
}

console.log('='.repeat(60));

// Exit with non-zero code if any tests failed (CI-friendly)
process.exit(failed > 0 ? 1 : 0);
