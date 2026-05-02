class DynamicRiskManager {
  constructor(config = {}) {
    this.max_risk_per_trade = config.max_risk_per_trade ?? 0.02;
    this.max_portfolio_risk = config.max_portfolio_risk ?? 0.10;
    this.kelly_multiplier = config.kelly_multiplier ?? 0.25;
    this.max_sector_exposure = config.max_sector_exposure ?? 0.30;
    this.current_positions = {};
  }

  calculate_position_size(signal, marketData = [], accountValue = 0, positions = {}) {
    if (!accountValue || accountValue <= 0) {
      return {
        quantity: 0,
        risk_amount: 0,
        stop_loss: 0,
        take_profit: 0,
        kelly_fraction: 0,
        confidence_adjustment: 0
      };
    }

    const safeSignal = signal || {};
    const entryPrice = marketData.length ? marketData[marketData.length - 1].close : 1;
    const confidence = Math.max(0, Math.min(1, safeSignal.confidence ?? 0.5));
    const expectedReturn = Math.max(0.001, Math.abs(safeSignal.expected_return ?? 0.01));
    const confidenceAdjustment = Math.max(0.25, confidence);
    const portfolioRiskUsed = this._portfolioRisk(positions);
    const remainingRisk = Math.max(0, this.max_portfolio_risk - portfolioRiskUsed);
    const rawKelly = Math.min(0.05, expectedReturn * confidenceAdjustment * this.kelly_multiplier);
    const kellyFraction = Math.min(rawKelly, this.max_risk_per_trade, remainingRisk);
    const riskAmount = accountValue * kellyFraction;
    const stopLossDistance = Math.max(entryPrice * 0.02, this._averageRange(marketData));
    const quantity = stopLossDistance > 0 ? Math.floor(riskAmount / stopLossDistance) : 0;
    const direction = safeSignal.direction >= 0 ? 1 : -1;

    return {
      quantity,
      risk_amount: riskAmount,
      stop_loss: entryPrice - (direction * stopLossDistance),
      take_profit: entryPrice + (direction * stopLossDistance * 2),
      kelly_fraction: kellyFraction,
      confidence_adjustment: confidenceAdjustment
    };
  }

  calculate_adaptive_stops(entryPrice, direction = 1, marketData = [], confidence = 0.5, timeInPosition = null) {
    const volatility = Math.max(entryPrice * 0.01, this._averageRange(marketData));
    const side = direction >= 0 ? -1 : 1;
    const fixed = entryPrice + side * entryPrice * 0.02;
    const trailing = entryPrice + side * volatility * 1.5;
    const volatilityBased = entryPrice + side * volatility * 2;
    const confidenceDistance = entryPrice * (0.035 - Math.max(0, Math.min(1, confidence)) * 0.02);
    const confidenceBased = entryPrice + side * confidenceDistance;
    const after4h = entryPrice + side * entryPrice * 0.01;

    return {
      fixed,
      trailing,
      volatility_based: volatilityBased,
      confidence_based: confidenceBased,
      time_based: {
        after_4h: after4h,
        active: timeInPosition && timeInPosition.total_seconds() >= 4 * 3600 ? after4h : fixed
      }
    };
  }

  calculate_portfolio_risk_metrics(positions = {}, marketData = {}) {
    const values = Object.values(positions);
    if (!values.length) {
      return { var_1d: 0, var_5d: 0, max_drawdown: 0, sharpe_ratio: 0, volatility: 0 };
    }

    const volatility = values.reduce((sum, position) => sum + (position.risk_percentage || 0), 0) / values.length;
    return {
      var_1d: -volatility * 0.2,
      var_5d: -volatility * Math.sqrt(5) * 0.2,
      max_drawdown: -Math.min(0.5, volatility * 2),
      sharpe_ratio: volatility > 0 ? 1 / volatility : 0,
      volatility
    };
  }

  check_risk_limits(newPosition, positions = {}, accountValue = 1) {
    const violations = [];
    const positionRisk = accountValue > 0 ? newPosition.value / accountValue : 0;
    if (positionRisk > this.max_risk_per_trade) {
      violations.push(`Position risk ${positionRisk.toFixed(4)} exceeds limit ${this.max_risk_per_trade}`);
    }

    const portfolioRisk = this._portfolioRisk(positions) + positionRisk;
    if (portfolioRisk > this.max_portfolio_risk) {
      violations.push(`Portfolio risk ${portfolioRisk.toFixed(4)} exceeds limit ${this.max_portfolio_risk}`);
    }

    const sectorExposure = this._sectorExposure(newPosition, positions, accountValue);
    if (sectorExposure > this.max_sector_exposure) {
      violations.push(`Sector exposure ${sectorExposure.toFixed(4)} exceeds limit ${this.max_sector_exposure}`);
    }

    return [violations.length === 0, violations];
  }

  get_risk_level(metrics) {
    const score = Math.max(metrics.volatility || 0, Math.abs(metrics.var_1d || 0), Math.abs(metrics.max_drawdown || 0));
    if (score >= 0.25) return { value: 'very_high', score };
    if (score >= 0.18) return { value: 'high', score };
    if (score >= 0.12) return { value: 'medium', score };
    if (score >= 0.08) return { value: 'low', score };
    return { value: 'very_low', score };
  }

  update_position(symbol, positionData) {
    this.current_positions[symbol] = positionData;
  }

  remove_position(symbol) {
    delete this.current_positions[symbol];
  }

  get_risk_summary() {
    const riskMetrics = this.calculate_portfolio_risk_metrics(this.current_positions, {});
    return {
      risk_level: this.get_risk_level(riskMetrics),
      risk_metrics: riskMetrics,
      position_count: Object.keys(this.current_positions).length,
      portfolio_risk: this._portfolioRisk(this.current_positions),
      risk_limits: {
        max_risk_per_trade: this.max_risk_per_trade,
        max_portfolio_risk: this.max_portfolio_risk,
        max_sector_exposure: this.max_sector_exposure
      }
    };
  }

  _portfolioRisk(positions) {
    return Object.values(positions).reduce((sum, position) => {
      return sum + (position.risk_percentage ?? 0);
    }, 0);
  }

  _sectorExposure(newPosition, positions, accountValue) {
    if (!newPosition.sector || accountValue <= 0) return 0;
    const existing = Object.values(positions)
      .filter(position => position.sector === newPosition.sector)
      .reduce((sum, position) => sum + (position.value || 0), 0);
    return (existing + (newPosition.value || 0)) / accountValue;
  }

  _averageRange(marketData) {
    if (!Array.isArray(marketData) || marketData.length === 0) return 0;
    const totalRange = marketData.reduce((sum, candle) => sum + Math.max(0, (candle.high || 0) - (candle.low || 0)), 0);
    return totalRange / marketData.length;
  }
}

module.exports = DynamicRiskManager;
