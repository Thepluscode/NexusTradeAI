const { checkEventProximity, getNextEvent, EVENTS_2026 } = require('../event-calendar');

describe('checkEventProximity', () => {
    // FOMC on 2026-05-06 at 18:00 UTC
    const fomcDate = '2026-05-06';
    const fomcTime = '18:00';

    test('blocks entries within 5 min of FOMC', () => {
        const now = new Date(`${fomcDate}T17:57:00Z`); // 3 min before
        const result = checkEventProximity(now, 'stock');
        expect(result.nearEvent).toBe(true);
        expect(result.action).toBe('block');
        expect(result.sizeMultiplier).toBe(0);
        expect(result.event.name).toBe('FOMC');
    });

    test('reduces size 75% within 30 min of FOMC', () => {
        const now = new Date(`${fomcDate}T17:40:00Z`); // 20 min before
        const result = checkEventProximity(now, 'stock');
        expect(result.nearEvent).toBe(true);
        expect(result.action).toBe('reduce');
        expect(result.sizeMultiplier).toBe(0.25);
    });

    test('reduces size 50% within 15 min after FOMC', () => {
        const now = new Date(`${fomcDate}T18:10:00Z`); // 10 min after
        const result = checkEventProximity(now, 'stock');
        expect(result.nearEvent).toBe(true);
        expect(result.action).toBe('reduce_post');
        expect(result.sizeMultiplier).toBe(0.5);
    });

    test('normal when no event nearby', () => {
        const now = new Date('2026-05-06T12:00:00Z'); // 6 hours before FOMC
        const result = checkEventProximity(now, 'stock');
        expect(result.nearEvent).toBe(false);
        expect(result.action).toBe('normal');
        expect(result.sizeMultiplier).toBe(1.0);
    });

    test('filters by asset class', () => {
        // NFP only affects stock + forex, not crypto
        const now = new Date('2026-05-01T13:28:00Z'); // 2 min before NFP
        const stockResult = checkEventProximity(now, 'stock');
        const cryptoResult = checkEventProximity(now, 'crypto');
        expect(stockResult.nearEvent).toBe(true);
        expect(cryptoResult.nearEvent).toBe(false); // NFP doesn't affect crypto
    });

    test('CPI affects all asset classes', () => {
        const now = new Date('2026-05-13T13:28:00Z'); // 2 min before CPI
        expect(checkEventProximity(now, 'stock').nearEvent).toBe(true);
        expect(checkEventProximity(now, 'forex').nearEvent).toBe(true);
        expect(checkEventProximity(now, 'crypto').nearEvent).toBe(true);
    });

    test('includes minutesUntil in response', () => {
        const now = new Date(`${fomcDate}T17:45:00Z`); // 15 min before
        const result = checkEventProximity(now, 'stock');
        expect(result.minutesUntil).toBeCloseTo(15, 0);
    });
});

describe('getNextEvent', () => {
    test('returns next event for stock', () => {
        const now = new Date('2026-04-01T00:00:00Z');
        const next = getNextEvent(now, 'stock');
        expect(next).not.toBeNull();
        expect(next.name).toBeDefined();
        expect(next.minutesUntil).toBeGreaterThan(0);
        expect(next.hoursUntil).toBeGreaterThan(0);
    });

    test('returns null when no future events', () => {
        const now = new Date('2027-01-01T00:00:00Z'); // after all 2026 events
        const next = getNextEvent(now, 'stock');
        expect(next).toBeNull();
    });
});

describe('EVENTS_2026', () => {
    test('has FOMC events', () => {
        const fomc = EVENTS_2026.filter(e => e.name === 'FOMC');
        expect(fomc.length).toBe(8);
    });

    test('has NFP events', () => {
        const nfp = EVENTS_2026.filter(e => e.name === 'NFP');
        expect(nfp.length).toBe(12);
    });

    test('has CPI events', () => {
        const cpi = EVENTS_2026.filter(e => e.name === 'CPI');
        expect(cpi.length).toBe(12);
    });

    test('all events have required fields', () => {
        for (const event of EVENTS_2026) {
            expect(event.name).toBeDefined();
            expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(event.time).toMatch(/^\d{2}:\d{2}$/);
            expect(event.impact).toBe('high');
            expect(Array.isArray(event.assets)).toBe(true);
            expect(event.assets.length).toBeGreaterThan(0);
        }
    });
});
