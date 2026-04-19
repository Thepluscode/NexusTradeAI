'use strict';

/**
 * Economic Event Calendar — pause or reduce size around high-impact events.
 *
 * High-impact events cause unpredictable volatility that invalidates
 * technical signals. The smart move is to sit out or trade very small.
 *
 * Events tracked:
 *   - FOMC: Federal Reserve interest rate decisions (8x/year)
 *   - NFP: Non-Farm Payrolls (monthly, first Friday)
 *   - CPI: Consumer Price Index (monthly)
 *   - GDP: Quarterly GDP reports
 *   - ECB: European Central Bank decisions (forex impact)
 *
 * Behavior:
 *   - Within 30 min before event: reduce position size by 75%
 *   - Within 5 min before event: block new entries entirely
 *   - Within 15 min after event: reduce size by 50% (volatility settling)
 *
 * The calendar uses a static schedule updated quarterly.
 * For production, this should be replaced with a live feed (e.g., ForexFactory API).
 */

// High-impact events for 2026 (UTC times)
// Format: { name, date: 'YYYY-MM-DD', time: 'HH:MM', impact: 'high'|'medium', assets: ['stock','forex','crypto'] }
const EVENTS_2026 = [
    // FOMC 2026 schedule
    { name: 'FOMC', date: '2026-01-28', time: '19:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'FOMC', date: '2026-03-18', time: '18:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'FOMC', date: '2026-05-06', time: '18:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'FOMC', date: '2026-06-17', time: '18:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'FOMC', date: '2026-07-29', time: '18:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'FOMC', date: '2026-09-16', time: '18:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'FOMC', date: '2026-11-04', time: '18:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'FOMC', date: '2026-12-16', time: '19:00', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    // NFP (first Friday of each month, 8:30 AM ET = 13:30 UTC)
    { name: 'NFP', date: '2026-01-02', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-02-06', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-03-06', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-04-03', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-05-01', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-06-05', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-07-02', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-08-07', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-09-04', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-10-02', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-11-06', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    { name: 'NFP', date: '2026-12-04', time: '13:30', impact: 'high', assets: ['stock', 'forex'] },
    // CPI (typically mid-month, 8:30 AM ET = 13:30 UTC)
    { name: 'CPI', date: '2026-01-14', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-02-12', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-03-11', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-04-14', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-05-13', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-06-10', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-07-15', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-08-12', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-09-10', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-10-14', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-11-12', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
    { name: 'CPI', date: '2026-12-10', time: '13:30', impact: 'high', assets: ['stock', 'forex', 'crypto'] },
];

/**
 * Check if a high-impact event is near the current time.
 *
 * @param {Date} now — current time (default: new Date())
 * @param {string} assetClass — 'stock', 'forex', or 'crypto'
 * @param {Object} config
 * @param {number} config.preEventMinutes — minutes before event to start reducing (default 30)
 * @param {number} config.blockMinutes — minutes before event to block entries (default 5)
 * @param {number} config.postEventMinutes — minutes after event before returning to normal (default 15)
 * @returns {{ nearEvent: boolean, action: string, sizeMultiplier: number, event?: Object, minutesUntil?: number }}
 */
function checkEventProximity(now = new Date(), assetClass = 'stock', config = {}) {
    const {
        preEventMinutes = 30,
        blockMinutes = 5,
        postEventMinutes = 15,
    } = config;

    const nowMs = now.getTime();

    for (const event of EVENTS_2026) {
        if (!event.assets.includes(assetClass)) continue;

        const eventTime = new Date(`${event.date}T${event.time}:00Z`).getTime();
        const diffMs = eventTime - nowMs;
        const diffMinutes = diffMs / (60 * 1000);

        // Before event
        if (diffMinutes > 0 && diffMinutes <= blockMinutes) {
            return {
                nearEvent: true,
                action: 'block',
                sizeMultiplier: 0,
                event: { name: event.name, date: event.date, time: event.time },
                minutesUntil: parseFloat(diffMinutes.toFixed(1)),
            };
        }

        if (diffMinutes > 0 && diffMinutes <= preEventMinutes) {
            return {
                nearEvent: true,
                action: 'reduce',
                sizeMultiplier: 0.25, // 75% reduction
                event: { name: event.name, date: event.date, time: event.time },
                minutesUntil: parseFloat(diffMinutes.toFixed(1)),
            };
        }

        // After event (settling period)
        if (diffMinutes < 0 && Math.abs(diffMinutes) <= postEventMinutes) {
            return {
                nearEvent: true,
                action: 'reduce_post',
                sizeMultiplier: 0.5, // 50% reduction post-event
                event: { name: event.name, date: event.date, time: event.time },
                minutesUntil: parseFloat(diffMinutes.toFixed(1)),
            };
        }
    }

    return { nearEvent: false, action: 'normal', sizeMultiplier: 1.0 };
}

/**
 * Get the next upcoming event for an asset class.
 */
function getNextEvent(now = new Date(), assetClass = 'stock') {
    const nowMs = now.getTime();
    let nearest = null;
    let nearestDiff = Infinity;

    for (const event of EVENTS_2026) {
        if (!event.assets.includes(assetClass)) continue;
        const eventTime = new Date(`${event.date}T${event.time}:00Z`).getTime();
        const diff = eventTime - nowMs;
        if (diff > 0 && diff < nearestDiff) {
            nearestDiff = diff;
            nearest = event;
        }
    }

    return nearest ? {
        ...nearest,
        minutesUntil: parseFloat((nearestDiff / 60000).toFixed(0)),
        hoursUntil: parseFloat((nearestDiff / 3600000).toFixed(1)),
    } : null;
}

module.exports = { checkEventProximity, getNextEvent, EVENTS_2026 };
