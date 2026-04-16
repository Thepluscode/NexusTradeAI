'use strict';

/**
 * Forex London Breakout (Asian Box → London session) strategy.
 *
 * Logic: build a box from Asian-session (00-06 UTC) high/low, wait for London
 * open; if price touches the bottom 20% of the box go long (mean-reversion buy
 * at support), touches top 20% go short. Filters: D1 trend + H4 200-SMA.
 *
 * Eligibility: GBP/USD and USD/CHF only (50-58% WR — QuantifiedStrategies.com).
 * Other pairs (EUR/USD etc.) historically lose money with this strategy.
 *
 * Conditions (long — symmetric for short):
 *   1. Pair is GBP_USD or USD_CHF
 *   2. Box is complete (range built from ≥4 Asian candles)
 *   3. D1 trend is 'up' or 'neutral' for longs (opposite for shorts)
 *   4. H4 trend is 'up' or 'neutral' for longs (H4 200-SMA filter)
 *   5. Current price within bottom 20% of box range for longs
 *   6. Multi-factor confirmation score ≥ 0.55 (RSI + MACD + flow + BB squeeze)
 *   7. Dynamic R:R (1.5 to 3.0) based on ATR%
 *
 * Source: extracted from unified-forex-bot.js:2402-2500 (box breakout logic).
 * Live performance: PAUSED (v20.0 untested in production).
 */

const ELIGIBLE_PAIRS = ['GBP_USD', 'USD_CHF'];
const ZONE_PCT = 0.20;
const STOP_BUFFER_PCT = 0.15;
const MIN_CONFIRMATION = 0.55;

function calculateDynamicRR(atrPct) {
    if (atrPct == null) return 2.0;
    if (atrPct < 0.003) return 3.0;
    if (atrPct > 0.012) return 1.5;
    return 3.0 - ((atrPct - 0.003) / (0.012 - 0.003)) * 1.5;
}

function calculateConfirmationScore({ rsi, direction, macd, orderFlowImbalance, bb }) {
    let score = 0.30; // 30% price action (already at box edge)

    // 20% RSI divergence
    if (direction === 'long') {
        if (rsi < 35) score += 0.20;
        else if (rsi < 45) score += 0.15;
        else if (rsi < 55) score += 0.08;
    } else {
        if (rsi > 65) score += 0.20;
        else if (rsi > 55) score += 0.15;
        else if (rsi > 45) score += 0.08;
    }

    // 20% MACD histogram alignment
    if (macd) {
        if (direction === 'long' && macd.histogram > 0) score += 0.20;
        else if (direction === 'short' && macd.histogram < 0) score += 0.20;
        else if (direction === 'long' && macd.histogram > -0.0001) score += 0.10;
        else if (direction === 'short' && macd.histogram < 0.0001) score += 0.10;
    }

    // 15% Order flow
    if (orderFlowImbalance != null) {
        if (direction === 'long' && orderFlowImbalance > 0.02) score += 0.15;
        else if (direction === 'short' && orderFlowImbalance < -0.02) score += 0.15;
        else if (Math.abs(orderFlowImbalance) < 0.01) score += 0.05;
    }

    // 15% Bollinger squeeze
    if (bb && bb.upper && bb.middle && bb.lower) {
        const bandwidth = (bb.upper - bb.lower) / bb.middle;
        if (bandwidth < 0.005) score += 0.15;
        else if (bandwidth < 0.010) score += 0.10;
    }

    return parseFloat(score.toFixed(3));
}

module.exports = {
    name: 'forexLondonBreakout',
    assetClass: 'forex',
    regimes: ['london-breakout', 'box-long', 'box-short', 'any'],

    _eligiblePairs: ELIGIBLE_PAIRS,
    _calculateDynamicRR: calculateDynamicRR,
    _calculateConfirmationScore: calculateConfirmationScore,

    evaluate(bars, context) {
        if (!context) return { killedBy: 'no_context' };

        const {
            pair, currentPrice, box, d1Trend, h4Trend,
            rsi, macd, orderFlowImbalance, bb, atrPct,
        } = context;

        // 1. Pair eligibility
        if (!pair || !ELIGIBLE_PAIRS.includes(pair)) {
            return { killedBy: 'pair_not_eligible' };
        }

        // 2. Box completeness
        if (!box || !box.isComplete) {
            return { killedBy: 'no_box' };
        }
        if (box.range == null || box.range <= 0) {
            return { killedBy: 'invalid_box_range' };
        }

        if (currentPrice == null || !isFinite(currentPrice)) {
            return { killedBy: 'no_current_price' };
        }

        const zoneSize = box.range * ZONE_PCT;
        const botZoneHigh = box.low + zoneSize;
        const topZoneLow = box.high - zoneSize;

        // Decide direction from price position
        let direction = null;
        if (currentPrice <= botZoneHigh && currentPrice >= box.low) direction = 'long';
        else if (currentPrice >= topZoneLow && currentPrice <= box.high) direction = 'short';
        else return { killedBy: 'outside_entry_zones' };

        // 3/4. Trend filters
        const d1Ok = direction === 'long'
            ? (d1Trend === 'up' || d1Trend === 'neutral')
            : (d1Trend === 'down' || d1Trend === 'neutral');
        if (!d1Ok) return { killedBy: 'd1_trend_mismatch' };

        const h4Ok = direction === 'long'
            ? (h4Trend === 'up' || h4Trend === 'neutral')
            : (h4Trend === 'down' || h4Trend === 'neutral');
        if (!h4Ok) return { killedBy: 'h4_trend_mismatch' };

        // 5. Confirmation score
        if (rsi == null) return { killedBy: 'no_rsi' };
        const confirmation = calculateConfirmationScore({
            rsi, direction, macd, orderFlowImbalance, bb,
        });
        if (confirmation < MIN_CONFIRMATION) {
            return { killedBy: 'low_confirmation' };
        }

        // 6. Build stop/target with dynamic R:R
        const dynamicRR = calculateDynamicRR(atrPct);
        let stopLoss, takeProfit;
        if (direction === 'long') {
            stopLoss = box.low - (STOP_BUFFER_PCT * box.range);
            const risk = currentPrice - stopLoss;
            if (risk <= 0) return { killedBy: 'invalid_risk' };
            takeProfit = currentPrice + (risk * dynamicRR);
        } else {
            stopLoss = box.high + (STOP_BUFFER_PCT * box.range);
            const risk = stopLoss - currentPrice;
            if (risk <= 0) return { killedBy: 'invalid_risk' };
            takeProfit = currentPrice - (risk * dynamicRR);
        }

        return {
            candidate: {
                pair,
                direction,
                entry: parseFloat(currentPrice.toFixed(5)),
                stopLoss: parseFloat(stopLoss.toFixed(5)),
                takeProfit: parseFloat(takeProfit.toFixed(5)),
                rsi: parseFloat(rsi.toFixed(2)),
                tier: 'tier1',
                score: confirmation,
                strategy: 'forexLondonBreakout',
                regime: direction === 'long' ? 'box-long' : 'box-short',
                regimeQuality: confirmation,
                macdHistogram: macd ? macd.histogram : null,
                orderFlowImbalance: orderFlowImbalance ?? null,
                dynamicRR: parseFloat(dynamicRR.toFixed(2)),
                boxRange: box.range,
            },
        };
    },
};
