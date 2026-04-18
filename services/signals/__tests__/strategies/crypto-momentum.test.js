'use strict';

const momo = require('../../strategies/crypto-momentum');

describe('cryptoMomentum strategy', () => {
    describe('registry interface', () => {
        test('exports correct metadata', () => {
            expect(momo.name).toBe('cryptoMomentum');
            expect(momo.assetClass).toBe('crypto');
            expect(momo.regimes).toContain('trending');
            expect(typeof momo.evaluate).toBe('function');
        });
    });

    describe('tier selection', () => {
        test('selects tier3 for 3%+ momentum', () => {
            const tier = momo._selectTier(0.035, 60);
            expect(tier).toBe('tier3');
        });
        test('selects tier2 for 1.5-3% momentum', () => {
            const tier = momo._selectTier(0.02, 60);
            expect(tier).toBe('tier2');
        });
        test('selects tier1 for 0.5-1.5% momentum', () => {
            const tier = momo._selectTier(0.008, 60);
            expect(tier).toBe('tier1');
        });
        test('returns null for < 0.5% momentum', () => {
            const tier = momo._selectTier(0.003, 60);
            expect(tier).toBeNull();
        });
        test('returns null if RSI outside all tier ranges', () => {
            const tier = momo._selectTier(0.035, 85); // tier3 max is 80
            expect(tier).toBeNull();
        });
    });

    describe('BTC trend gate', () => {
        test('blocks altcoin longs when BTC bearish', () => {
            const result = momo.evaluate([], {
                currentPrice: 100,
                percentChange: 1.0,
                rsi: 55,
                volumeRatio: 1.5,
                ema9: 99, sma20: 98,
                btcBullish: false,
                isBtc: false,
            });
            expect(result.killedBy).toBe('btc_bearish');
        });

        test('allows BTC itself even when BTC bearish flag is false', () => {
            const result = momo.evaluate([], {
                currentPrice: 45000,
                percentChange: 1.5,
                rsi: 60,
                volumeRatio: 1.5,
                ema9: 44800, sma20: 44500,
                btcBullish: false,
                isBtc: true,
            });
            expect(result.candidate).toBeDefined();
        });
    });

    describe('trend structure', () => {
        test('rejects when price below SMA20', () => {
            const result = momo.evaluate([], {
                currentPrice: 100,
                percentChange: 1.0,
                rsi: 55,
                volumeRatio: 1.5,
                sma20: 105,
                btcBullish: true,
            });
            expect(result.killedBy).toBe('below_sma20');
        });

        test('rejects when EMA9 < SMA20 (not uptrending)', () => {
            const result = momo.evaluate([], {
                currentPrice: 100,
                percentChange: 1.0,
                rsi: 55,
                volumeRatio: 1.5,
                ema9: 98, sma20: 99,
                btcBullish: true,
            });
            expect(result.killedBy).toBe('no_uptrend_structure');
        });
    });

    describe('volume', () => {
        test('rejects low volume', () => {
            const result = momo.evaluate([], {
                currentPrice: 100,
                percentChange: 1.0,
                rsi: 55,
                volumeRatio: 0.8,
                ema9: 99, sma20: 98,
                btcBullish: true,
            });
            expect(result.killedBy).toBe('low_volume');
        });
    });

    describe('candidate output', () => {
        test('ATR-based: uses 1.5× ATR for stop, floored at tier minimum', () => {
            const result = momo.evaluate([], {
                currentPrice: 100,
                percentChange: 0.8,
                rsi: 55,
                volumeRatio: 1.5,
                ema9: 99, sma20: 98,
                btcBullish: true,
                isBtc: false,
                atr: 3, atrPct: 0.03, // 3% ATR
            });
            expect(result.candidate).toBeDefined();
            expect(result.candidate.tier).toBe('tier1');
            // stopPct = max(0.03 * 1.5, 0.02) = max(0.045, 0.02) = 0.045 (4.5%)
            expect(result.candidate.stopLossPercent).toBeCloseTo(4.5, 1);
            expect(result.candidate.atrBased).toBe(true);
            expect(result.candidate.rewardRisk).toBe(2.0);
        });

        test('fallback: uses tier minimum when ATR unavailable', () => {
            const result = momo.evaluate([], {
                currentPrice: 100,
                percentChange: 0.8,
                rsi: 55,
                volumeRatio: 1.5,
                ema9: 99, sma20: 98,
                btcBullish: true,
                isBtc: false,
            });
            expect(result.candidate).toBeDefined();
            expect(result.candidate.tier).toBe('tier1');
            // No ATR → tier1 minStopPct = 2%
            expect(result.candidate.stopLossPercent).toBeCloseTo(2, 1);
            expect(result.candidate.atrBased).toBe(false);
        });

        test('stop never wider than 10%', () => {
            const result = momo.evaluate([], {
                currentPrice: 100,
                percentChange: 0.8,
                rsi: 55,
                volumeRatio: 1.5,
                ema9: 99, sma20: 98,
                btcBullish: true,
                atr: 20, atrPct: 0.20, // 20% ATR (extreme)
            });
            expect(result.candidate.stopLossPercent).toBeLessThanOrEqual(10);
        });

        test('returns tier2 candidate for 1.5%+ momentum', () => {
            const result = momo.evaluate([], {
                currentPrice: 1000,
                percentChange: 2.0,
                rsi: 60,
                volumeRatio: 2.0,
                ema9: 990, sma20: 980,
                btcBullish: true,
                atr: 30, atrPct: 0.03,
            });
            expect(result.candidate.tier).toBe('tier2');
            // tier2 minStopPct = 3%, ATR-based = max(0.03*1.5, 0.03) = 4.5%
            expect(result.candidate.stopLossPercent).toBeCloseTo(4.5, 1);
        });

        test('returns tier3 candidate for 3%+ momentum', () => {
            const result = momo.evaluate([], {
                currentPrice: 50,
                percentChange: 4.0,
                rsi: 70,
                volumeRatio: 3.0,
                ema9: 49, sma20: 48,
                btcBullish: true,
            });
            expect(result.candidate.tier).toBe('tier3');
            expect(result.candidate.regime).toBe('trend-expansion');
        });

        test('score is in [0,1] and higher for stronger setups', () => {
            const weak = momo.evaluate([], {
                currentPrice: 100, percentChange: 0.6, rsi: 52, volumeRatio: 1.3,
                ema9: 99, sma20: 98, btcBullish: true,
            });
            const strong = momo.evaluate([], {
                currentPrice: 100, percentChange: 3.5, rsi: 60, volumeRatio: 3.0,
                ema9: 99, sma20: 98, btcBullish: true,
            });
            expect(weak.candidate.score).toBeLessThanOrEqual(1);
            expect(strong.candidate.score).toBeLessThanOrEqual(1);
            expect(strong.candidate.score).toBeGreaterThan(weak.candidate.score);
        });
    });

    describe('edge cases', () => {
        test('handles null context', () => {
            expect(momo.evaluate([], null).killedBy).toBe('no_context');
        });
        test('handles missing currentPrice', () => {
            expect(momo.evaluate([], { percentChange: 1 }).killedBy).toBe('no_current_price');
        });
        test('handles missing RSI', () => {
            const r = momo.evaluate([], {
                currentPrice: 100, percentChange: 1, volumeRatio: 2,
                ema9: 99, sma20: 98, btcBullish: true,
            });
            expect(r.killedBy).toBe('no_rsi');
        });
    });
});
