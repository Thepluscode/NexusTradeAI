/**
 * Unit Tests for Dynamic Risk Manager
 * Tests risk management functionality including position sizing and risk controls
 */

const DynamicRiskManager = require('../../../services/risk-management/DynamicRiskManager');

describe('DynamicRiskManager', () => {
  let riskManager;
  let mockSignal;
  let mockMarketData;
  let mockPositions;

  beforeEach(() => {
    riskManager = new DynamicRiskManager({
      max_risk_per_trade: 0.02,
      max_portfolio_risk: 0.10,
      kelly_multiplier: 0.25
    });

    mockSignal = {
      symbol: 'AAPL',
      direction: 1,
      confidence: 0.8,
      expected_return: 0.03
    };

    mockMarketData = [
      { timestamp: '2024-01-01T10:00:00Z', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { timestamp: '2024-01-01T10:01:00Z', open: 101, high: 103, low: 100, close: 102, volume: 1100 },
      { timestamp: '2024-01-01T10:02:00Z', open: 102, high: 104, low: 101, close: 103, volume: 1200 },
      { timestamp: '2024-01-01T10:03:00Z', open: 103, high: 105, low: 102, close: 104, volume: 1300 },
      { timestamp: '2024-01-01T10:04:00Z', open: 104, high: 106, low: 103, close: 105, volume: 1400 }
    ];

    mockPositions = {
      'GOOGL': {
        symbol: 'GOOGL',
        value: 5000,
        risk_percentage: 0.05
      }
    };
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      const defaultManager = new DynamicRiskManager();
      expect(defaultManager.max_risk_per_trade).toBe(0.02);
      expect(defaultManager.max_portfolio_risk).toBe(0.10);
    });

    test('should initialize with custom configuration', () => {
      expect(riskManager.max_risk_per_trade).toBe(0.02);
      expect(riskManager.max_portfolio_risk).toBe(0.10);
      expect(riskManager.kelly_multiplier).toBe(0.25);
    });
  });

  describe('Position Sizing', () => {
    test('should calculate position size using Kelly Criterion', () => {
      const accountValue = 100000;
      const positionSize = riskManager.calculate_position_size(
        mockSignal,
        mockMarketData,
        accountValue
      );

      expect(positionSize).toHaveProperty('quantity');
      expect(positionSize).toHaveProperty('risk_amount');
      expect(positionSize).toHaveProperty('stop_loss');
      expect(positionSize).toHaveProperty('take_profit');
      expect(positionSize).toHaveProperty('kelly_fraction');

      expect(positionSize.quantity).toBeGreaterThan(0);
      expect(positionSize.risk_amount).toBeLessThanOrEqual(accountValue * 0.02);
      expect(positionSize.kelly_fraction).toBeGreaterThan(0);
      expect(positionSize.kelly_fraction).toBeLessThanOrEqual(0.05);
    });

    test('should adjust position size based on confidence', () => {
      const accountValue = 100000;
      
      const highConfidenceSignal = { ...mockSignal, confidence: 0.9 };
      const lowConfidenceSignal = { ...mockSignal, confidence: 0.5 };

      const highConfidenceSize = riskManager.calculate_position_size(
        highConfidenceSignal,
        mockMarketData,
        accountValue
      );

      const lowConfidenceSize = riskManager.calculate_position_size(
        lowConfidenceSignal,
        mockMarketData,
        accountValue
      );

      expect(highConfidenceSize.confidence_adjustment).toBeGreaterThan(
        lowConfidenceSize.confidence_adjustment
      );
    });

    test('should respect portfolio risk limits', () => {
      const accountValue = 100000;
      
      // Mock existing positions that use up most of the portfolio risk
      const highRiskPositions = {
        'GOOGL': { value: 8000, risk_percentage: 0.08 },
        'MSFT': { value: 1500, risk_percentage: 0.015 }
      };

      const positionSize = riskManager.calculate_position_size(
        mockSignal,
        mockMarketData,
        accountValue,
        highRiskPositions
      );

      // Should limit position size due to portfolio risk constraints
      expect(positionSize.kelly_fraction).toBeLessThan(0.02);
    });
  });

  describe('Stop Loss Calculation', () => {
    test('should calculate adaptive stop losses', () => {
      const entryPrice = 105;
      const direction = 1; // Long position
      const confidence = 0.8;

      const stopLevels = riskManager.calculate_adaptive_stops(
        entryPrice,
        direction,
        mockMarketData,
        confidence
      );

      expect(stopLevels).toHaveProperty('fixed');
      expect(stopLevels).toHaveProperty('trailing');
      expect(stopLevels).toHaveProperty('volatility_based');
      expect(stopLevels).toHaveProperty('confidence_based');
      expect(stopLevels).toHaveProperty('time_based');

      // For long positions, all stops should be below entry price
      expect(stopLevels.fixed).toBeLessThan(entryPrice);
      expect(stopLevels.trailing).toBeLessThan(entryPrice);
      expect(stopLevels.volatility_based).toBeLessThan(entryPrice);
      expect(stopLevels.confidence_based).toBeLessThan(entryPrice);
    });

    test('should adjust stops based on confidence', () => {
      const entryPrice = 105;
      const direction = 1;

      const highConfidenceStops = riskManager.calculate_adaptive_stops(
        entryPrice,
        direction,
        mockMarketData,
        0.9
      );

      const lowConfidenceStops = riskManager.calculate_adaptive_stops(
        entryPrice,
        direction,
        mockMarketData,
        0.5
      );

      // Higher confidence should result in tighter stops
      expect(highConfidenceStops.confidence_based).toBeGreaterThan(
        lowConfidenceStops.confidence_based
      );
    });

    test('should handle time-based stop adjustments', () => {
      const entryPrice = 105;
      const direction = 1;
      const confidence = 0.8;
      const timeInPosition = { total_seconds: () => 4 * 3600 }; // 4 hours

      const stopLevels = riskManager.calculate_adaptive_stops(
        entryPrice,
        direction,
        mockMarketData,
        confidence,
        timeInPosition
      );

      expect(stopLevels.time_based).toHaveProperty('active');
      expect(stopLevels.time_based.active).toBe(stopLevels.time_based.after_4h);
    });
  });

  describe('Risk Metrics Calculation', () => {
    test('should calculate portfolio risk metrics', () => {
      const positions = {
        'AAPL': { value: 10000, risk_percentage: 0.02 },
        'GOOGL': { value: 15000, risk_percentage: 0.03 }
      };

      const marketData = {
        'AAPL': mockMarketData,
        'GOOGL': mockMarketData
      };

      const riskMetrics = riskManager.calculate_portfolio_risk_metrics(positions, marketData);

      expect(riskMetrics).toHaveProperty('var_1d');
      expect(riskMetrics).toHaveProperty('var_5d');
      expect(riskMetrics).toHaveProperty('max_drawdown');
      expect(riskMetrics).toHaveProperty('sharpe_ratio');
      expect(riskMetrics).toHaveProperty('volatility');

      expect(typeof riskMetrics.var_1d).toBe('number');
      expect(typeof riskMetrics.volatility).toBe('number');
    });

    test('should handle empty portfolio', () => {
      const riskMetrics = riskManager.calculate_portfolio_risk_metrics({}, {});

      expect(riskMetrics.var_1d).toBe(0);
      expect(riskMetrics.var_5d).toBe(0);
      expect(riskMetrics.max_drawdown).toBe(0);
      expect(riskMetrics.sharpe_ratio).toBe(0);
      expect(riskMetrics.volatility).toBe(0);
    });
  });

  describe('Risk Limit Checks', () => {
    test('should approve valid positions', () => {
      const newPosition = {
        symbol: 'AAPL',
        value: 2000,
        sector: 'Technology'
      };

      const accountValue = 100000;
      const [approved, violations] = riskManager.check_risk_limits(
        newPosition,
        mockPositions,
        accountValue
      );

      expect(approved).toBe(true);
      expect(violations).toHaveLength(0);
    });

    test('should reject positions exceeding individual risk limits', () => {
      const largePosition = {
        symbol: 'AAPL',
        value: 5000, // 5% of 100k account
        sector: 'Technology'
      };

      const accountValue = 100000;
      const [approved, violations] = riskManager.check_risk_limits(
        largePosition,
        {},
        accountValue
      );

      expect(approved).toBe(false);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0]).toContain('Position risk');
    });

    test('should reject positions exceeding portfolio risk limits', () => {
      const newPosition = {
        symbol: 'AAPL',
        value: 3000,
        sector: 'Technology'
      };

      // Mock high existing portfolio risk
      const highRiskPositions = {
        'GOOGL': { value: 8000, risk_percentage: 0.08 },
        'MSFT': { value: 2000, risk_percentage: 0.02 }
      };

      const accountValue = 100000;
      const [approved, violations] = riskManager.check_risk_limits(
        newPosition,
        highRiskPositions,
        accountValue
      );

      expect(approved).toBe(false);
      expect(violations.some(v => v.includes('Portfolio risk'))).toBe(true);
    });

    test('should check sector concentration limits', () => {
      const newTechPosition = {
        symbol: 'AAPL',
        value: 20000, // Large tech position
        sector: 'Technology'
      };

      const existingTechPositions = {
        'GOOGL': { value: 15000, sector: 'Technology', risk_percentage: 0.15 },
        'MSFT': { value: 10000, sector: 'Technology', risk_percentage: 0.10 }
      };

      const accountValue = 100000;
      const [approved, violations] = riskManager.check_risk_limits(
        newTechPosition,
        existingTechPositions,
        accountValue
      );

      expect(approved).toBe(false);
      expect(violations.some(v => v.includes('Sector exposure'))).toBe(true);
    });
  });

  describe('Risk Level Classification', () => {
    test('should classify risk levels correctly', () => {
      const lowRiskMetrics = {
        volatility: 0.05,
        var_1d: -0.005,
        max_drawdown: -0.02
      };

      const highRiskMetrics = {
        volatility: 0.45,
        var_1d: -0.06,
        max_drawdown: -0.25
      };

      const lowRiskLevel = riskManager.get_risk_level(lowRiskMetrics);
      const highRiskLevel = riskManager.get_risk_level(highRiskMetrics);

      expect(lowRiskLevel.value).toBe('very_low');
      expect(highRiskLevel.value).toBe('very_high');
    });
  });

  describe('Portfolio Tracking', () => {
    test('should update position tracking', () => {
      const positionData = {
        symbol: 'AAPL',
        value: 5000,
        risk_percentage: 0.05
      };

      riskManager.update_position('AAPL', positionData);
      expect(riskManager.current_positions['AAPL']).toEqual(positionData);
    });

    test('should remove positions', () => {
      riskManager.update_position('AAPL', { symbol: 'AAPL', value: 5000 });
      riskManager.remove_position('AAPL');
      expect(riskManager.current_positions['AAPL']).toBeUndefined();
    });
  });

  describe('Risk Summary', () => {
    test('should generate comprehensive risk summary', () => {
      // Add some positions
      riskManager.update_position('AAPL', { symbol: 'AAPL', value: 5000 });
      riskManager.update_position('GOOGL', { symbol: 'GOOGL', value: 3000 });

      const summary = riskManager.get_risk_summary();

      expect(summary).toHaveProperty('risk_level');
      expect(summary).toHaveProperty('risk_metrics');
      expect(summary).toHaveProperty('position_count');
      expect(summary).toHaveProperty('portfolio_risk');
      expect(summary).toHaveProperty('risk_limits');

      expect(summary.position_count).toBe(2);
      expect(typeof summary.portfolio_risk).toBe('number');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid signal data', () => {
      const invalidSignal = null;
      const accountValue = 100000;

      expect(() => {
        riskManager.calculate_position_size(invalidSignal, mockMarketData, accountValue);
      }).not.toThrow();
    });

    test('should handle insufficient market data', () => {
      const shortMarketData = [mockMarketData[0]];
      const accountValue = 100000;

      const positionSize = riskManager.calculate_position_size(
        mockSignal,
        shortMarketData,
        accountValue
      );

      expect(positionSize).toHaveProperty('quantity');
      expect(positionSize.quantity).toBeGreaterThan(0);
    });

    test('should handle zero account value', () => {
      const accountValue = 0;

      const positionSize = riskManager.calculate_position_size(
        mockSignal,
        mockMarketData,
        accountValue
      );

      expect(positionSize.quantity).toBe(0);
      expect(positionSize.risk_amount).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should handle large number of positions efficiently', () => {
      const startTime = Date.now();

      // Add many positions
      for (let i = 0; i < 1000; i++) {
        riskManager.update_position(`STOCK_${i}`, {
          symbol: `STOCK_${i}`,
          value: Math.random() * 10000,
          risk_percentage: Math.random() * 0.05
        });
      }

      const summary = riskManager.get_risk_summary();
      const endTime = Date.now();

      expect(summary.position_count).toBe(1000);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
