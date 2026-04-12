const strategy = require('../../strategies/stock-vwap-reversal');

describe('stockVwapReversal strategy', () => {
    // ── Interface compliance ──
    test('has required interface fields', () => {
        expect(strategy.name).toBe('stockVwapReversal');
        expect(strategy.assetClass).toBe('stock');
        expect(Array.isArray(strategy.regimes)).toBe(true);
        expect(typeof strategy.evaluate).toBe('function');
    });

    // ── Normal case: valid mean-reversion setup ──
    test('produces candidate when price below VWAP lower band + RSI < 40 + above SMA50', () => {
        const context = {
            currentPrice: 95,
            vwap: 100,
            vwapLowerBand: 97,    // price 95 < lower band 97
            rsi: 35,              // oversold
            volumeRatio: 1.2,     // >= 0.8
            atr: 1.5,
            spyBullish: true,
            sma50daily: 90,       // price 95 > SMA50 90 (structural uptrend)
            percentChange: -3.0,
        };
        const result = strategy.evaluate([], context);
        expect(result.candidate).toBeDefined();
        expect(result.candidate.strategy).toBe('stockVwapReversal');
        expect(result.candidate.stopLoss).toBeLessThan(95);
        expect(result.candidate.takeProfit).toBe(100); // VWAP midline
    });

    test('candidate has required fields for gate chain', () => {
        const context = {
            currentPrice: 95,
            vwap: 100,
            vwapLowerBand: 97,
            rsi: 35,
            volumeRatio: 1.2,
            atr: 1.5,
            spyBullish: true,
            sma50daily: 90,
            percentChange: -3.0,
        };
        const result = strategy.evaluate([], context);
        const c = result.candidate;
        expect(c).toHaveProperty('price');
        expect(c).toHaveProperty('score');
        expect(c).toHaveProperty('tier');
        expect(c).toHaveProperty('stopLoss');
        expect(c).toHaveProperty('takeProfit');
        expect(c).toHaveProperty('regime');
        expect(typeof c.score).toBe('number');
        expect(c.score).toBeGreaterThan(0);
        expect(c.score).toBeLessThanOrEqual(2); // reasonable range
    });

    // ── Rejection cases — each filter gets its own test ──
    test('rejects when price is above VWAP lower band', () => {
        const context = {
            currentPrice: 100, vwap: 100, vwapLowerBand: 97,
            rsi: 35, volumeRatio: 1.2, atr: 2.0, spyBullish: true, sma50daily: 90,
        };
        const result = strategy.evaluate([], context);
        expect(result.candidate).toBeUndefined();
        expect(result.killedBy).toBe('price_above_vwap_lower_band');
    });

    test('rejects when RSI >= 40 (not oversold enough)', () => {
        const context = {
            currentPrice: 95, vwap: 100, vwapLowerBand: 97,
            rsi: 42, volumeRatio: 1.2, atr: 2.0, spyBullish: true, sma50daily: 90,
        };
        const result = strategy.evaluate([], context);
        expect(result.killedBy).toBe('rsi_not_oversold');
    });

    test('rejects when volume ratio < 0.8', () => {
        const context = {
            currentPrice: 95, vwap: 100, vwapLowerBand: 97,
            rsi: 35, volumeRatio: 0.5, atr: 2.0, spyBullish: true, sma50daily: 90,
        };
        const result = strategy.evaluate([], context);
        expect(result.killedBy).toBe('low_volume');
    });

    test('rejects when SPY is bearish', () => {
        const context = {
            currentPrice: 95, vwap: 100, vwapLowerBand: 97,
            rsi: 35, volumeRatio: 1.2, atr: 2.0, spyBullish: false, sma50daily: 90,
        };
        const result = strategy.evaluate([], context);
        expect(result.killedBy).toBe('spy_bearish');
    });

    test('rejects when price below daily SMA50 (no structural uptrend)', () => {
        const context = {
            currentPrice: 85, vwap: 100, vwapLowerBand: 97,
            rsi: 35, volumeRatio: 1.2, atr: 2.0, spyBullish: true, sma50daily: 90,
        };
        const result = strategy.evaluate([], context);
        expect(result.killedBy).toBe('below_sma50');
    });

    test('rejects when R:R < 1.5 (target too close or stop too wide)', () => {
        const context = {
            currentPrice: 99, vwap: 100, vwapLowerBand: 99.5,
            rsi: 35, volumeRatio: 1.2, atr: 5.0, // ATR=5 → stop at 89 → R:R = 1/10 = 0.1
            spyBullish: true, sma50daily: 80,
        };
        const result = strategy.evaluate([], context);
        expect(result.killedBy).toBe('insufficient_reward_risk');
    });

    // ── Null-safety ──
    test('rejects when VWAP data is missing', () => {
        const context = {
            currentPrice: 95, vwap: null, vwapLowerBand: null,
            rsi: 35, volumeRatio: 1.2, atr: 2.0, spyBullish: true, sma50daily: 90,
        };
        const result = strategy.evaluate([], context);
        expect(result.killedBy).toBeDefined();
    });

    test('rejects when ATR is null (cannot compute stop)', () => {
        const context = {
            currentPrice: 95, vwap: 100, vwapLowerBand: 97,
            rsi: 35, volumeRatio: 1.2, atr: null, spyBullish: true, sma50daily: 90,
        };
        const result = strategy.evaluate([], context);
        expect(result.killedBy).toBe('no_atr');
    });

    test('skips SMA50 check when sma50daily is null (allows entry)', () => {
        // When daily bars unavailable, don't block — let other gates decide
        const context = {
            currentPrice: 95, vwap: 100, vwapLowerBand: 97,
            rsi: 35, volumeRatio: 1.2, atr: 1.5, spyBullish: true, sma50daily: null,
        };
        const result = strategy.evaluate([], context);
        // Should produce candidate since SMA50 check is skipped
        expect(result.candidate).toBeDefined();
    });

    // ── Score quality ──
    test('lower RSI produces higher score (deeper oversold = stronger signal)', () => {
        const base = {
            currentPrice: 95, vwap: 100, vwapLowerBand: 97,
            volumeRatio: 1.2, atr: 1.5, spyBullish: true, sma50daily: 90,
        };
        const deep = strategy.evaluate([], { ...base, rsi: 25 });
        const shallow = strategy.evaluate([], { ...base, rsi: 38 });
        expect(deep.candidate.score).toBeGreaterThan(shallow.candidate.score);
    });

    // ── Pure function ──
    test('is deterministic (same input → same output)', () => {
        const context = {
            currentPrice: 95, vwap: 100, vwapLowerBand: 97,
            rsi: 35, volumeRatio: 1.2, atr: 2.0, spyBullish: true, sma50daily: 90,
        };
        const r1 = strategy.evaluate([], context);
        const r2 = strategy.evaluate([], context);
        expect(r1).toEqual(r2);
    });
});
