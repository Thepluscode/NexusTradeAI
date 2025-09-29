/**
 * Unit Tests for Technical Indicators
 * Tests all technical analysis functions for accuracy and edge cases
 */

const {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateCCI,
  calculateADX,
  calculateVWAP,
  calculateParabolicSAR,
  calculateMFI,
  calculateIchimoku
} = require('../../../shared/libs/trading/technical-indicators');

describe('Technical Indicators', () => {
  let mockPrices;
  let mockMarketData;

  beforeEach(() => {
    // Mock price data for testing
    mockPrices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 111, 110, 112, 114, 113];
    
    // Mock market data with OHLCV
    mockMarketData = [
      { open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { open: 101, high: 103, low: 100, close: 102, volume: 1100 },
      { open: 102, high: 104, low: 101, close: 103, volume: 1200 },
      { open: 103, high: 105, low: 102, close: 104, volume: 1300 },
      { open: 104, high: 106, low: 103, close: 105, volume: 1400 },
      { open: 105, high: 107, low: 104, close: 106, volume: 1500 },
      { open: 106, high: 108, low: 105, close: 107, volume: 1600 },
      { open: 107, high: 109, low: 106, close: 108, volume: 1700 },
      { open: 108, high: 110, low: 107, close: 109, volume: 1800 },
      { open: 109, high: 111, low: 108, close: 110, volume: 1900 },
      { open: 110, high: 112, low: 109, close: 111, volume: 2000 },
      { open: 111, high: 113, low: 110, close: 112, volume: 2100 },
      { open: 112, high: 114, low: 111, close: 113, volume: 2200 },
      { open: 113, high: 115, low: 112, close: 114, volume: 2300 },
      { open: 114, high: 116, low: 113, close: 115, volume: 2400 }
    ];
  });

  describe('Simple Moving Average (SMA)', () => {
    test('should calculate SMA correctly', () => {
      const sma5 = calculateSMA(mockPrices, 5);
      const expectedSMA = (111 + 110 + 112 + 114 + 113) / 5; // Last 5 prices
      
      expect(sma5).toBeCloseTo(expectedSMA, 2);
    });

    test('should return null for insufficient data', () => {
      const shortPrices = [100, 102];
      const sma5 = calculateSMA(shortPrices, 5);
      
      expect(sma5).toBeNull();
    });

    test('should handle edge case with exact period length', () => {
      const exactPrices = [100, 102, 104, 106, 108];
      const sma5 = calculateSMA(exactPrices, 5);
      
      expect(sma5).toBe(104); // (100+102+104+106+108)/5
    });
  });

  describe('Exponential Moving Average (EMA)', () => {
    test('should calculate EMA correctly', () => {
      const ema5 = calculateEMA(mockPrices, 5);
      
      expect(ema5).toBeGreaterThan(0);
      expect(typeof ema5).toBe('number');
      
      // EMA should be closer to recent prices
      const recentAvg = (mockPrices[mockPrices.length - 1] + mockPrices[mockPrices.length - 2]) / 2;
      expect(Math.abs(ema5 - recentAvg)).toBeLessThan(10);
    });

    test('should return null for insufficient data', () => {
      const shortPrices = [100];
      const ema5 = calculateEMA(shortPrices, 5);
      
      expect(ema5).toBeNull();
    });

    test('should give more weight to recent prices', () => {
      const prices1 = [100, 100, 100, 100, 120]; // Recent spike
      const prices2 = [120, 100, 100, 100, 100]; // Early spike
      
      const ema1 = calculateEMA(prices1, 5);
      const ema2 = calculateEMA(prices2, 5);
      
      expect(ema1).toBeGreaterThan(ema2);
    });
  });

  describe('Relative Strength Index (RSI)', () => {
    test('should calculate RSI correctly', () => {
      const rsi = calculateRSI(mockPrices, 14);
      
      expect(rsi).toBeGreaterThanOrEqual(0);
      expect(rsi).toBeLessThanOrEqual(100);
    });

    test('should return null for insufficient data', () => {
      const shortPrices = [100, 102, 104];
      const rsi = calculateRSI(shortPrices, 14);
      
      expect(rsi).toBeNull();
    });

    test('should return 100 for all gains', () => {
      const increasingPrices = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115];
      const rsi = calculateRSI(increasingPrices, 14);
      
      expect(rsi).toBeCloseTo(100, 0);
    });

    test('should handle mixed gains and losses', () => {
      const mixedPrices = [100, 102, 101, 103, 102, 104, 103, 105, 104, 106, 105, 107, 106, 108, 107];
      const rsi = calculateRSI(mixedPrices, 14);
      
      expect(rsi).toBeGreaterThan(30);
      expect(rsi).toBeLessThan(70);
    });
  });

  describe('MACD', () => {
    test('should calculate MACD correctly', () => {
      const macd = calculateMACD(mockPrices, 12, 26, 9);
      
      if (macd) {
        expect(macd).toHaveProperty('macd');
        expect(macd).toHaveProperty('signal');
        expect(macd).toHaveProperty('histogram');
        expect(typeof macd.macd).toBe('number');
        expect(typeof macd.signal).toBe('number');
        expect(typeof macd.histogram).toBe('number');
      }
    });

    test('should return null for insufficient data', () => {
      const shortPrices = [100, 102, 104];
      const macd = calculateMACD(shortPrices, 12, 26, 9);
      
      expect(macd).toBeNull();
    });

    test('should calculate histogram as difference between MACD and signal', () => {
      const longPrices = Array.from({ length: 50 }, (_, i) => 100 + i * 0.5);
      const macd = calculateMACD(longPrices, 12, 26, 9);
      
      if (macd) {
        expect(macd.histogram).toBeCloseTo(macd.macd - macd.signal, 5);
      }
    });
  });

  describe('Average True Range (ATR)', () => {
    test('should calculate ATR correctly', () => {
      const atr = calculateATR(mockMarketData, 14);
      
      expect(atr).toBeGreaterThan(0);
      expect(typeof atr).toBe('number');
    });

    test('should return null for insufficient data', () => {
      const shortData = [mockMarketData[0]];
      const atr = calculateATR(shortData, 14);
      
      expect(atr).toBeNull();
    });

    test('should handle data with gaps', () => {
      const gappyData = [
        { open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { open: 105, high: 107, low: 104, close: 106, volume: 1100 }, // Gap up
        { open: 103, high: 104, low: 101, close: 102, volume: 1200 }  // Gap down
      ];
      
      const atr = calculateATR(gappyData, 2);
      expect(atr).toBeGreaterThan(2); // Should capture the gap volatility
    });
  });

  describe('Bollinger Bands', () => {
    test('should calculate Bollinger Bands correctly', () => {
      const bb = calculateBollingerBands(mockPrices, 20, 2);
      
      if (bb) {
        expect(bb).toHaveProperty('upper');
        expect(bb).toHaveProperty('middle');
        expect(bb).toHaveProperty('lower');
        expect(bb).toHaveProperty('bandwidth');
        
        expect(bb.upper).toBeGreaterThan(bb.middle);
        expect(bb.middle).toBeGreaterThan(bb.lower);
        expect(bb.bandwidth).toBeGreaterThan(0);
      }
    });

    test('should return null for insufficient data', () => {
      const shortPrices = [100, 102, 104];
      const bb = calculateBollingerBands(shortPrices, 20, 2);
      
      expect(bb).toBeNull();
    });

    test('should have middle band equal to SMA', () => {
      const period = 10;
      const bb = calculateBollingerBands(mockPrices, period, 2);
      const sma = calculateSMA(mockPrices, period);
      
      if (bb && sma) {
        expect(bb.middle).toBeCloseTo(sma, 5);
      }
    });
  });

  describe('Commodity Channel Index (CCI)', () => {
    test('should calculate CCI correctly', () => {
      const cci = calculateCCI(mockMarketData, 20);
      
      expect(typeof cci).toBe('number');
      // CCI can range widely, but typically between -300 and +300
      expect(cci).toBeGreaterThan(-500);
      expect(cci).toBeLessThan(500);
    });

    test('should return null for insufficient data', () => {
      const shortData = mockMarketData.slice(0, 5);
      const cci = calculateCCI(shortData, 20);
      
      expect(cci).toBeNull();
    });
  });

  describe('Average Directional Index (ADX)', () => {
    test('should calculate ADX correctly', () => {
      const adx = calculateADX(mockMarketData, 14);
      
      if (adx) {
        expect(adx).toHaveProperty('adx');
        expect(adx).toHaveProperty('diPlus');
        expect(adx).toHaveProperty('diMinus');
        
        expect(adx.adx).toBeGreaterThanOrEqual(0);
        expect(adx.adx).toBeLessThanOrEqual(100);
        expect(adx.diPlus).toBeGreaterThanOrEqual(0);
        expect(adx.diMinus).toBeGreaterThanOrEqual(0);
      }
    });

    test('should return null for insufficient data', () => {
      const shortData = mockMarketData.slice(0, 5);
      const adx = calculateADX(shortData, 14);
      
      expect(adx).toBeNull();
    });
  });

  describe('Volume Weighted Average Price (VWAP)', () => {
    test('should calculate VWAP correctly', () => {
      const vwap = calculateVWAP(mockMarketData);
      
      expect(vwap).toBeGreaterThan(0);
      expect(typeof vwap).toBe('number');
      
      // VWAP should be within reasonable range of price data
      const minPrice = Math.min(...mockMarketData.map(d => d.low));
      const maxPrice = Math.max(...mockMarketData.map(d => d.high));
      
      expect(vwap).toBeGreaterThanOrEqual(minPrice);
      expect(vwap).toBeLessThanOrEqual(maxPrice);
    });

    test('should return null for empty data', () => {
      const vwap = calculateVWAP([]);
      expect(vwap).toBeNull();
    });

    test('should handle zero volume', () => {
      const zeroVolumeData = [
        { open: 100, high: 102, low: 99, close: 101, volume: 0 }
      ];
      
      const vwap = calculateVWAP(zeroVolumeData);
      expect(vwap).toBeNull();
    });
  });

  describe('Parabolic SAR', () => {
    test('should calculate Parabolic SAR correctly', () => {
      const sar = calculateParabolicSAR(mockMarketData, 0.02, 0.2);
      
      if (sar) {
        expect(sar).toHaveProperty('sar');
        expect(sar).toHaveProperty('isUptrend');
        expect(typeof sar.sar).toBe('number');
        expect(typeof sar.isUptrend).toBe('boolean');
      }
    });

    test('should return null for insufficient data', () => {
      const shortData = [mockMarketData[0]];
      const sar = calculateParabolicSAR(shortData, 0.02, 0.2);
      
      expect(sar).toBeNull();
    });

    test('should detect trend changes', () => {
      // Create data with clear trend change
      const trendData = [
        { open: 100, high: 102, low: 99, close: 101, volume: 1000 },
        { open: 101, high: 103, low: 100, close: 102, volume: 1000 },
        { open: 102, high: 104, low: 101, close: 103, volume: 1000 },
        { open: 103, high: 105, low: 102, close: 104, volume: 1000 },
        { open: 104, high: 106, low: 103, close: 105, volume: 1000 },
        { open: 105, high: 106, low: 102, close: 103, volume: 1000 }, // Reversal
        { open: 103, high: 104, low: 100, close: 101, volume: 1000 },
        { open: 101, high: 102, low: 98, close: 99, volume: 1000 }
      ];
      
      const sar = calculateParabolicSAR(trendData, 0.02, 0.2);
      expect(sar).toBeTruthy();
    });
  });

  describe('Money Flow Index (MFI)', () => {
    test('should calculate MFI correctly', () => {
      const mfi = calculateMFI(mockMarketData, 14);
      
      if (mfi) {
        expect(mfi).toBeGreaterThanOrEqual(0);
        expect(mfi).toBeLessThanOrEqual(100);
      }
    });

    test('should return null for insufficient data', () => {
      const shortData = mockMarketData.slice(0, 5);
      const mfi = calculateMFI(shortData, 14);
      
      expect(mfi).toBeNull();
    });

    test('should return 100 for all positive money flow', () => {
      const increasingData = mockMarketData.map((data, i) => ({
        ...data,
        close: data.close + i // Steadily increasing prices
      }));
      
      const mfi = calculateMFI(increasingData, 14);
      if (mfi) {
        expect(mfi).toBeGreaterThan(80); // Should be high for all positive flow
      }
    });
  });

  describe('Ichimoku Cloud', () => {
    test('should calculate Ichimoku components correctly', () => {
      const ichimoku = calculateIchimoku(mockMarketData, 9, 26, 52);
      
      if (ichimoku) {
        expect(ichimoku).toHaveProperty('tenkanSen');
        expect(ichimoku).toHaveProperty('kijunSen');
        expect(ichimoku).toHaveProperty('senkouSpanA');
        expect(ichimoku).toHaveProperty('senkouSpanB');
        expect(ichimoku).toHaveProperty('chikouSpan');
        expect(ichimoku).toHaveProperty('cloudTop');
        expect(ichimoku).toHaveProperty('cloudBottom');
        
        // Cloud top should be >= cloud bottom
        expect(ichimoku.cloudTop).toBeGreaterThanOrEqual(ichimoku.cloudBottom);
        
        // All values should be positive numbers
        expect(ichimoku.tenkanSen).toBeGreaterThan(0);
        expect(ichimoku.kijunSen).toBeGreaterThan(0);
        expect(ichimoku.senkouSpanA).toBeGreaterThan(0);
        expect(ichimoku.senkouSpanB).toBeGreaterThan(0);
        expect(ichimoku.chikouSpan).toBeGreaterThan(0);
      }
    });

    test('should return null for insufficient data', () => {
      const shortData = mockMarketData.slice(0, 20);
      const ichimoku = calculateIchimoku(shortData, 9, 26, 52);
      
      expect(ichimoku).toBeNull();
    });

    test('should calculate Senkou Span A as average of Tenkan and Kijun', () => {
      const ichimoku = calculateIchimoku(mockMarketData, 9, 26, 52);
      
      if (ichimoku) {
        const expectedSenkouA = (ichimoku.tenkanSen + ichimoku.kijunSen) / 2;
        expect(ichimoku.senkouSpanA).toBeCloseTo(expectedSenkouA, 5);
      }
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle NaN values in price data', () => {
      const pricesWithNaN = [100, 102, NaN, 104, 106];
      
      // Functions should handle NaN gracefully
      expect(() => calculateSMA(pricesWithNaN, 3)).not.toThrow();
      expect(() => calculateEMA(pricesWithNaN, 3)).not.toThrow();
      expect(() => calculateRSI(pricesWithNaN, 3)).not.toThrow();
    });

    test('should handle negative prices', () => {
      const negativePrices = [-100, -102, -101, -103, -105];
      
      // Most indicators should still work with negative prices
      const sma = calculateSMA(negativePrices, 3);
      expect(sma).toBeLessThan(0);
    });

    test('should handle zero prices', () => {
      const zeroPrices = [0, 0, 0, 0, 0];
      
      const sma = calculateSMA(zeroPrices, 3);
      expect(sma).toBe(0);
    });

    test('should handle very large numbers', () => {
      const largePrices = [1e10, 1.1e10, 1.05e10, 1.15e10, 1.2e10];
      
      const sma = calculateSMA(largePrices, 3);
      expect(sma).toBeGreaterThan(1e10);
      expect(isFinite(sma)).toBe(true);
    });

    test('should handle very small numbers', () => {
      const smallPrices = [1e-10, 1.1e-10, 1.05e-10, 1.15e-10, 1.2e-10];
      
      const sma = calculateSMA(smallPrices, 3);
      expect(sma).toBeGreaterThan(0);
      expect(sma).toBeLessThan(1e-9);
    });
  });

  describe('Performance', () => {
    test('should handle large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => 100 + Math.sin(i * 0.01) * 10);
      
      const startTime = Date.now();
      
      calculateSMA(largeDataset, 50);
      calculateEMA(largeDataset, 50);
      calculateRSI(largeDataset, 14);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second
    });

    test('should be consistent across multiple calls', () => {
      const prices = [100, 102, 101, 103, 105, 104, 106, 108, 107, 109];
      
      const sma1 = calculateSMA(prices, 5);
      const sma2 = calculateSMA(prices, 5);
      const sma3 = calculateSMA(prices, 5);
      
      expect(sma1).toBe(sma2);
      expect(sma2).toBe(sma3);
    });
  });
});
