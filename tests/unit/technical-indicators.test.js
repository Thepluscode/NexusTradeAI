const TechnicalIndicators = require('../../ai-ml/indicators/technical-indicators');

describe('Technical Indicators Unit Tests', () => {
  let indicators;
  let samplePrices;

  beforeEach(() => {
    indicators = new TechnicalIndicators();
    samplePrices = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15, 17, 18, 17, 19, 20];
  });

  describe('Moving Averages', () => {
    test('should calculate SMA correctly', () => {
      const result = indicators.sma(samplePrices, 5);
      
      expect(result).toHaveLength(samplePrices.length - 4);
      expect(result[0]).toBeCloseTo(11.4, 1); // (10+11+12+11+13)/5
      expect(result[result.length - 1]).toBeCloseTo(17.4, 1); // Last 5 values
    });

    test('should calculate EMA correctly', () => {
      const result = indicators.ema(samplePrices, 5);
      
      expect(result).toHaveLength(samplePrices.length - 4);
      expect(result[0]).toBeCloseTo(11.4, 1); // First value should be SMA
      expect(result[result.length - 1]).toBeGreaterThan(result[0]); // Should trend upward
    });

    test('should handle edge cases', () => {
      expect(() => indicators.sma([], 5)).toThrow();
      expect(() => indicators.sma([1, 2, 3], 5)).toThrow();
      
      const singleValue = indicators.sma([10], 1);
      expect(singleValue).toEqual([10]);
    });
  });

  describe('Momentum Indicators', () => {
    test('should calculate RSI correctly', () => {
      const prices = [44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.85, 46.08, 45.89, 46.03, 46.83, 47.69, 47.54, 49.25];
      const result = indicators.rsi(prices, 14);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toBeGreaterThan(0);
      expect(result[0]).toBeLessThan(100);
    });

    test('should calculate Stochastic correctly', () => {
      const highs = samplePrices.map(p => p + 0.5);
      const lows = samplePrices.map(p => p - 0.5);
      const closes = samplePrices;
      
      const result = indicators.stochastic(highs, lows, closes, 5, 3, 3);
      
      expect(result).toHaveProperty('k');
      expect(result).toHaveProperty('d');
      expect(Array.isArray(result.k)).toBe(true);
      expect(Array.isArray(result.d)).toBe(true);
    });
  });

  describe('Volatility Indicators', () => {
    test('should calculate Bollinger Bands correctly', () => {
      const result = indicators.bollingerBands(samplePrices, 5, 2);
      
      expect(result).toHaveProperty('upper');
      expect(result).toHaveProperty('middle');
      expect(result).toHaveProperty('lower');
      
      // Upper band should be above middle, middle above lower
      for (let i = 0; i < result.upper.length; i++) {
        expect(result.upper[i]).toBeGreaterThan(result.middle[i]);
        expect(result.middle[i]).toBeGreaterThan(result.lower[i]);
      }
    });

    test('should calculate ATR correctly', () => {
      const highs = samplePrices.map(p => p + 1);
      const lows = samplePrices.map(p => p - 1);
      const closes = samplePrices;
      
      const result = indicators.atr(highs, lows, closes, 5);
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every(val => val > 0)).toBe(true);
    });
  });

  describe('Pattern Recognition', () => {
    test('should detect basic candlestick patterns', () => {
      const opens = [10, 11, 12, 11, 13];
      const highs = [10.5, 11.5, 12.5, 11.5, 13.5];
      const lows = [9.5, 10.5, 11.5, 10.5, 12.5];
      const closes = [10.2, 11.2, 12.2, 11.2, 13.2];
      
      const result = indicators.detectCandlestickPatterns(opens, highs, lows, closes);
      
      expect(Array.isArray(result)).toBe(true);
      // Each pattern should have required properties
      result.forEach(pattern => {
        expect(pattern).toHaveProperty('index');
        expect(pattern).toHaveProperty('pattern');
        expect(pattern).toHaveProperty('signal');
      });
    });
  });

  describe('Performance', () => {
    test('should calculate indicators efficiently for large datasets', () => {
      const largePriceArray = Array.from({ length: 10000 }, (_, i) => 100 + Math.sin(i / 100) * 10);
      
      const startTime = performance.now();
      
      const sma = indicators.sma(largePriceArray, 20);
      const ema = indicators.ema(largePriceArray, 20);
      const rsi = indicators.rsi(largePriceArray, 14);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(sma.length).toBeGreaterThan(0);
      expect(ema.length).toBeGreaterThan(0);
      expect(rsi.length).toBeGreaterThan(0);
      
      console.log(`Calculated indicators for 10k data points in ${duration.toFixed(2)}ms`);
    });
  });
});
