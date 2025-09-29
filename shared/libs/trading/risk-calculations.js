/**
 * Risk Calculations for NexusTradeAI
 */

class RiskCalculations {
  /**
   * Calculate Value at Risk (VaR)
   */
  static calculateVaR(returns, confidenceLevel = 0.95, timeHorizon = 1) {
    if (!Array.isArray(returns) || returns.length === 0) {
      throw new Error('Returns array is required and cannot be empty');
    }

    const sortedReturns = returns.slice().sort((a, b) => a - b);
    const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    const var95 = -sortedReturns[index];

    // Calculate Expected Shortfall (Conditional VaR)
    const tailReturns = sortedReturns.slice(0, index + 1);
    const expectedShortfall = -tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length;

    // Adjust for time horizon
    const adjustedVaR = var95 * Math.sqrt(timeHorizon);
    const adjustedES = expectedShortfall * Math.sqrt(timeHorizon);

    return {
      valueAtRisk: adjustedVaR,
      expectedShortfall: adjustedES,
      confidenceLevel,
      timeHorizon,
      sampleSize: returns.length
    };
  }

  /**
   * Calculate portfolio beta
   */
  static calculateBeta(assetReturns, marketReturns) {
    if (assetReturns.length !== marketReturns.length) {
      throw new Error('Asset and market returns arrays must have the same length');
    }

    const n = assetReturns.length;
    const assetMean = assetReturns.reduce((sum, ret) => sum + ret, 0) / n;
    const marketMean = marketReturns.reduce((sum, ret) => sum + ret, 0) / n;

    let covariance = 0;
    let marketVariance = 0;

    for (let i = 0; i < n; i++) {
      const assetDiff = assetReturns[i] - assetMean;
      const marketDiff = marketReturns[i] - marketMean;

      covariance += assetDiff * marketDiff;
      marketVariance += marketDiff * marketDiff;
    }

    covariance /= (n - 1);
    marketVariance /= (n - 1);

    return marketVariance === 0 ? 0 : covariance / marketVariance;
  }

  /**
   * Calculate position size based on Kelly Criterion
   */
  static calculateKellyPositionSize(winRate, avgWin, avgLoss, capital) {
    if (winRate <= 0 || winRate >= 1) {
      throw new Error('Win rate must be between 0 and 1');
    }

    if (avgWin <= 0 || avgLoss <= 0) {
      throw new Error('Average win and loss must be positive');
    }

    const lossRate = 1 - winRate;
    const winLossRatio = avgWin / avgLoss;

    // Kelly formula: f = (bp - q) / b
    // where b = win/loss ratio, p = win rate, q = loss rate
    const kellyFraction = (winLossRatio * winRate - lossRate) / winLossRatio;

    // Cap at 25% for safety
    const safeFraction = Math.min(kellyFraction, 0.25);

    return {
      kellyFraction: kellyFraction,
      safeFraction: safeFraction,
      recommendedSize: capital * safeFraction,
      expectedGrowthRate: winRate * Math.log(1 + winLossRatio * safeFraction) +
                         lossRate * Math.log(1 - safeFraction)
    };
  }

  /**
   * Calculate risk-adjusted return metrics
   */
  static calculateRiskAdjustedReturns(returns, riskFreeRate = 0.02) {
    if (!Array.isArray(returns) || returns.length === 0) {
      throw new Error('Returns array is required and cannot be empty');
    }

    const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;
    const standardDeviation = Math.sqrt(variance);

    // Downside deviation (for Sortino ratio)
    const downsideReturns = returns.filter(ret => ret < riskFreeRate);
    const downsideVariance = downsideReturns.length > 0 ?
      downsideReturns.reduce((sum, ret) => sum + Math.pow(ret - riskFreeRate, 2), 0) / downsideReturns.length : 0;
    const downsideDeviation = Math.sqrt(downsideVariance);

    const excessReturn = meanReturn - riskFreeRate;

    return {
      meanReturn,
      standardDeviation,
      downsideDeviation,
      sharpeRatio: standardDeviation === 0 ? 0 : excessReturn / standardDeviation,
      sortinoRatio: downsideDeviation === 0 ? 0 : excessReturn / downsideDeviation,
      calmarRatio: this.calculateCalmarRatio(returns, riskFreeRate),
      informationRatio: this.calculateInformationRatio(returns, riskFreeRate)
    };
  }

  /**
   * Calculate Calmar Ratio
   */
  static calculateCalmarRatio(returns, riskFreeRate = 0.02) {
    const annualizedReturn = returns.reduce((sum, ret) => sum + ret, 0);
    const maxDrawdown = this.calculateMaxDrawdown(returns);

    return maxDrawdown === 0 ? 0 : (annualizedReturn - riskFreeRate) / Math.abs(maxDrawdown);
  }

  /**
   * Calculate Information Ratio
   */
  static calculateInformationRatio(returns, benchmarkReturns) {
    if (returns.length !== benchmarkReturns.length) {
      throw new Error('Returns and benchmark arrays must have the same length');
    }

    const excessReturns = returns.map((ret, i) => ret - benchmarkReturns[i]);
    const meanExcessReturn = excessReturns.reduce((sum, ret) => sum + ret, 0) / excessReturns.length;
    const trackingError = Math.sqrt(
      excessReturns.reduce((sum, ret) => sum + Math.pow(ret - meanExcessReturn, 2), 0) / excessReturns.length
    );

    return trackingError === 0 ? 0 : meanExcessReturn / trackingError;
  }

  /**
   * Calculate Maximum Drawdown
   */
  static calculateMaxDrawdown(returns) {
    let peak = 0;
    let maxDrawdown = 0;
    let cumulativeReturn = 0;

    for (const ret of returns) {
      cumulativeReturn += ret;
      peak = Math.max(peak, cumulativeReturn);
      const drawdown = (peak - cumulativeReturn) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }
}

module.exports = RiskCalculations;