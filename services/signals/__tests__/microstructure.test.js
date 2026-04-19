const { computeVPIN, computeTradeFlowToxicity, computeMicrostructure } = require('../microstructure');

function makeBar(open, high, low, close, volume = 1000) {
    return { open, high, low, close, volume };
}

function makeBuyBars(count, basePrice = 100) {
    // Bars that close near the high (buyer-initiated)
    return Array.from({ length: count }, (_, i) => {
        const p = basePrice + i * 0.5;
        return makeBar(p, p + 2, p - 0.5, p + 1.8, 1000);
    });
}

function makeSellBars(count, basePrice = 100) {
    // Bars that close near the low (seller-initiated)
    return Array.from({ length: count }, (_, i) => {
        const p = basePrice - i * 0.5;
        return makeBar(p, p + 0.5, p - 2, p - 1.8, 1000);
    });
}

function makeBalancedBars(count, basePrice = 100) {
    // Alternating buy/sell bars
    return Array.from({ length: count }, (_, i) => {
        const p = basePrice;
        if (i % 2 === 0) return makeBar(p, p + 1, p - 1, p + 0.8, 1000);
        return makeBar(p, p + 1, p - 1, p - 0.8, 1000);
    });
}

describe('computeVPIN', () => {
    test('high VPIN for one-sided volume (all buying)', () => {
        const bars = makeBuyBars(40);
        const result = computeVPIN(bars, { numBuckets: 10 });
        expect(result.raw.vpin).toBeGreaterThan(0.3);
        expect(result.score).toBeGreaterThan(0.5);
        expect(result.present).toBe(true);
    });

    test('lower VPIN for balanced volume', () => {
        const bars = makeBalancedBars(40);
        const result = computeVPIN(bars, { numBuckets: 10 });
        // Balanced bars should have lower VPIN than one-sided
        const oneSided = computeVPIN(makeBuyBars(40), { numBuckets: 10 });
        expect(result.raw.vpin).toBeLessThan(oneSided.raw.vpin);
    });

    test('returns neutral for insufficient data', () => {
        const result = computeVPIN([makeBar(100, 101, 99, 100)], { numBuckets: 20 });
        expect(result.present).toBe(false);
        expect(result.score).toBe(0.5);
    });

    test('returns neutral for zero volume', () => {
        const bars = Array(30).fill(makeBar(100, 101, 99, 100, 0));
        const result = computeVPIN(bars);
        expect(result.present).toBe(false);
    });

    test('VPIN is bounded 0-1', () => {
        const bars = makeBuyBars(40);
        const result = computeVPIN(bars, { numBuckets: 10 });
        expect(result.raw.vpin).toBeGreaterThanOrEqual(0);
        expect(result.raw.vpin).toBeLessThanOrEqual(1);
    });

    test('score is bounded 0.5-1.0', () => {
        const bars = makeBuyBars(40);
        const result = computeVPIN(bars, { numBuckets: 10 });
        expect(result.score).toBeGreaterThanOrEqual(0.5);
        expect(result.score).toBeLessThanOrEqual(1.0);
    });
});

describe('computeTradeFlowToxicity', () => {
    test('accumulation: mostly buy-initiated bars', () => {
        const bars = makeBuyBars(30);
        const result = computeTradeFlowToxicity(bars, 20);
        expect(result.raw.direction).toBe('accumulation');
        expect(result.raw.toxicity).toBeGreaterThan(0.3);
        expect(result.score).toBeGreaterThan(0.6);
        expect(result.present).toBe(true);
    });

    test('distribution: mostly sell-initiated bars', () => {
        const bars = makeSellBars(30);
        const result = computeTradeFlowToxicity(bars, 20);
        expect(result.raw.direction).toBe('distribution');
        expect(result.score).toBeLessThan(0.4);
    });

    test('neutral: balanced bars', () => {
        const bars = makeBalancedBars(30);
        const result = computeTradeFlowToxicity(bars, 20);
        expect(result.raw.direction).toBe('neutral');
        expect(result.raw.toxicity).toBeLessThan(0.3);
    });

    test('insufficient data returns not present', () => {
        const result = computeTradeFlowToxicity([makeBar(100, 101, 99, 100)], 20);
        expect(result.present).toBe(false);
    });

    test('tracks streak length', () => {
        const bars = makeBuyBars(30);
        const result = computeTradeFlowToxicity(bars, 20);
        expect(result.raw.streak).toBeGreaterThan(1);
    });
});

describe('computeMicrostructure', () => {
    test('combines VPIN and toxicity', () => {
        const bars = makeBuyBars(40);
        const result = computeMicrostructure(bars);
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('vpin');
        expect(result).toHaveProperty('toxicity');
        expect(result.present).toBe(true);
    });

    test('score is bounded 0-1', () => {
        const bars = makeBuyBars(40);
        const result = computeMicrostructure(bars);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
    });

    test('higher score for one-sided flow', () => {
        const oneSided = computeMicrostructure(makeBuyBars(40));
        const balanced = computeMicrostructure(makeBalancedBars(40));
        expect(oneSided.score).toBeGreaterThan(balanced.score);
    });

    test('handles empty input', () => {
        const result = computeMicrostructure([]);
        expect(result.score).toBe(0.5);
    });
});
