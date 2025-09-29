/**
 * Market Calculations Library for NexusTradeAI
 * High-performance financial calculations optimized for trading
 */

const BigNumber = require('bignumber.js');

// Configure BigNumber for financial precision
BigNumber.config({
  DECIMAL_PLACES: 8,
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  EXPONENTIAL_AT: [-15, 20],
  RANGE: [-1e+9, 1e+9]
});

class MarketCalculations {
  /**
   * Calculate position size based on risk management
   */
  static calculatePositionSize(accountBalance, riskPercentage, entryPrice, stopLoss) {
    try {
      const balance = new BigNumber(accountBalance);
      const risk = new BigNumber(riskPercentage).dividedBy(100);
      const entry = new BigNumber(entryPrice);
      const stop = new BigNumber(stopLoss);

      const riskAmount = balance.multipliedBy(risk);
      const priceRisk = entry.minus(stop).abs();

      if (priceRisk.isZero()) {
        throw new Error('Stop loss cannot equal entry price');
      }

      const positionSize = riskAmount.dividedBy(priceRisk);

      return {
        shares: positionSize.toNumber(),
        riskAmount: riskAmount.toNumber(),
        priceRisk: priceRisk.toNumber(),
        positionValue: positionSize.multipliedBy(entry).toNumber()
      };
    } catch (error) {
      throw new Error(`Position size calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate profit/loss for a position
   */
  static calculatePnL(entryPrice, currentPrice, quantity, side = 'long') {
    try {
      const entry = new BigNumber(entryPrice);
      const current = new BigNumber(currentPrice);
      const qty = new BigNumber(quantity);

      let priceDiff;
      if (side.toLowerCase() === 'long') {
        priceDiff = current.minus(entry);
      } else {
        priceDiff = entry.minus(current);
      }

      const unrealizedPnL = priceDiff.multipliedBy(qty);
      const percentageReturn = priceDiff.dividedBy(entry).multipliedBy(100);

      return {
        unrealizedPnL: unrealizedPnL.toNumber(),
        percentageReturn: percentageReturn.toNumber(),
        priceDifference: priceDiff.toNumber(),
        isProfit: unrealizedPnL.isPositive()
      };
    } catch (error) {
      throw new Error(`P&L calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate portfolio metrics
   */
  static calculatePortfolioMetrics(positions) {
    try {
      let totalValue = new BigNumber(0);
      let totalPnL = new BigNumber(0);
      let totalCost = new BigNumber(0);

      const positionMetrics = positions.map(position => {
        const pnl = this.calculatePnL(
          position.entryPrice,
          position.currentPrice,
          position.quantity,
          position.side
        );

        const positionValue = new BigNumber(position.currentPrice)
          .multipliedBy(position.quantity);
        const positionCost = new BigNumber(position.entryPrice)
          .multipliedBy(position.quantity);

        totalValue = totalValue.plus(positionValue);
        totalPnL = totalPnL.plus(pnl.unrealizedPnL);
        totalCost = totalCost.plus(positionCost);

        return {
          symbol: position.symbol,
          ...pnl,
          positionValue: positionValue.toNumber(),
          positionCost: positionCost.toNumber()
        };
      });

      const totalReturn = totalCost.isZero() ? 0 :
        totalPnL.dividedBy(totalCost).multipliedBy(100).toNumber();

      return {
        totalValue: totalValue.toNumber(),
        totalPnL: totalPnL.toNumber(),
        totalCost: totalCost.toNumber(),
        totalReturn: totalReturn,
        positionCount: positions.length,
        positions: positionMetrics
      };
    } catch (error) {
      throw new Error(`Portfolio metrics calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate Sharpe Ratio
   */
  static calculateSharpeRatio(returns, riskFreeRate = 0.02) {
    try {
      if (!Array.isArray(returns) || returns.length === 0) {
        throw new Error('Returns array is required and cannot be empty');
      }

      const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length;
      const standardDeviation = Math.sqrt(variance);

      if (standardDeviation === 0) {
        return { sharpeRatio: 0, meanReturn, standardDeviation, excessReturn: 0 };
      }

      const excessReturn = meanReturn - riskFreeRate;
      const sharpeRatio = excessReturn / standardDeviation;

      return {
        sharpeRatio,
        meanReturn,
        standardDeviation,
        excessReturn,
        riskFreeRate
      };
    } catch (error) {
      throw new Error(`Sharpe ratio calculation failed: ${error.message}`);
    }
  }

  /**
   * Calculate Maximum Drawdown
   */
  static calculateMaxDrawdown(prices) {
    try {
      if (!Array.isArray(prices) || prices.length === 0) {
        throw new Error('Prices array is required and cannot be empty');
      }

      let maxDrawdown = 0;
      let peak = prices[0];
      let peakIndex = 0;
      let troughIndex = 0;
      let maxDrawdownStart = 0;
      let maxDrawdownEnd = 0;

      for (let i = 1; i < prices.length; i++) {
        if (prices[i] > peak) {
          peak = prices[i];
          peakIndex = i;
        }

        const drawdown = (peak - prices[i]) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          troughIndex = i;
          maxDrawdownStart = peakIndex;
          maxDrawdownEnd = i;
        }
      }

      return {
        maxDrawdown: maxDrawdown * 100, // Convert to percentage
        maxDrawdownStart,
        maxDrawdownEnd,
        peakValue: peak,
        troughValue: prices[troughIndex],
        duration: maxDrawdownEnd - maxDrawdownStart
      };
    } catch (error) {
      throw new Error(`Maximum drawdown calculation failed: ${error.message}`);
    }
  }
}

module.exports = MarketCalculations;