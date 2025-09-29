// src/calculators/liquidityRiskCalculator.js
const Decimal = require('decimal.js');

class LiquidityRiskCalculator {
  constructor(options = {}) {
    this.logger = options.logger;
    
    // Liquidity scoring parameters
    this.liquidityFactors = {
      tradingVolume: 0.4,
      bidAskSpread: 0.3,
      marketDepth: 0.2,
      turnover: 0.1
    };
    
    // Liquidity categories
    this.liquidityThresholds = {
      high: 0.8,
      medium: 0.5,
      low: 0.2
    };
  }

  async calculatePortfolioLiquidityRisk(portfolio) {
    try {
      const liquidityMetrics = [];
      let totalValue = new Decimal(0);
      let weightedLiquidityScore = new Decimal(0);
      
      for (const position of portfolio) {
        const positionValue = new Decimal(Math.abs(parseFloat(position.marketValue || 0)));
        totalValue = totalValue.plus(positionValue);
        
        const liquidityScore = await this.calculateAssetLiquidityScore(position.symbol);
        const liquidityRisk = await this.calculatePositionLiquidityRisk(position);
        
        liquidityMetrics.push({
          symbol: position.symbol,
          value: positionValue.toNumber(),
          liquidityScore,
          liquidityCategory: this.getLiquidityCategory(liquidityScore),
          timeToLiquidate: liquidityRisk.timeToLiquidate,
          liquidationCost: liquidityRisk.liquidationCost,
          marketImpact: liquidityRisk.marketImpact
        });
        
        const weight = positionValue.dividedBy(totalValue.gt(0) ? totalValue : new Decimal(1));
        weightedLiquidityScore = weightedLiquidityScore.plus(weight.times(liquidityScore));
      }
      
      // Calculate portfolio-level metrics
      const portfolioLiquidityRisk = this.calculatePortfolioLiquidityMetrics(liquidityMetrics, totalValue.toNumber());
      
      return {
        portfolioValue: totalValue.toNumber(),
        overallLiquidityScore: weightedLiquidityScore.toNumber(),
        liquidityCategory: this.getLiquidityCategory(weightedLiquidityScore.toNumber()),
        positions: liquidityMetrics,
        portfolioMetrics: portfolioLiquidityRisk,
        concentration: this.calculateLiquidityConcentration(liquidityMetrics),
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger?.error('Error calculating liquidity risk:', error);
      throw error;
    }
  }

  async calculateAssetLiquidityScore(symbol) {
    // Get market data for liquidity calculation
    const marketData = await this.getMarketData(symbol);
    
    // Volume score (higher volume = more liquid)
    const volumeScore = Math.min(marketData.averageDailyVolume / 1000000, 1.0); // Normalize to $1M
    
    // Spread score (lower spread = more liquid)
    const spreadScore = Math.max(0, 1 - (marketData.bidAskSpread / 0.05)); // 5% spread = 0 score
    
    // Market depth score
    const depthScore = Math.min(marketData.marketDepth / 500000, 1.0); // Normalize to $500K
    
    // Turnover score
    const turnoverScore = Math.min(marketData.turnoverRatio / 2.0, 1.0); // 200% turnover = max score
    
    // Weighted liquidity score
    const liquidityScore = 
      volumeScore * this.liquidityFactors.tradingVolume +
      spreadScore * this.liquidityFactors.bidAskSpread +
      depthScore * this.liquidityFactors.marketDepth +
      turnoverScore * this.liquidityFactors.turnover;
    
    return Math.max(0, Math.min(1, liquidityScore));
  }

  async calculatePositionLiquidityRisk(position) {
    const positionValue = Math.abs(parseFloat(position.marketValue || 0));
    const liquidityScore = await this.calculateAssetLiquidityScore(position.symbol);
    const marketData = await this.getMarketData(position.symbol);
    
    // Time to liquidate (days)
    const dailyVolume = marketData.averageDailyVolume;
    const participationRate = this.getMaxParticipationRate(liquidityScore);
    const liquidatablePerDay = dailyVolume * participationRate;
    const timeToLiquidate = liquidatablePerDay > 0 ? positionValue / liquidatablePerDay : Infinity;
    
    // Liquidation cost estimate
    const baseSpread = marketData.bidAskSpread;
    const marketImpactCost = this.calculateMarketImpact(positionValue, dailyVolume, liquidityScore);
    const liquidationCost = (baseSpread / 2) + marketImpactCost;
    
    return {
      timeToLiquidate: Math.min(timeToLiquidate, 365), // Cap at 1 year
      liquidationCost: liquidationCost * 100, // Convert to percentage
      marketImpact: marketImpactCost * 100
    };
  }

  calculateMarketImpact(positionValue, dailyVolume, liquidityScore) {
    // Market impact increases with position size relative to daily volume
    const volumeRatio = positionValue / dailyVolume;
    
    // Impact function: more illiquid assets have higher impact
    const liquidityAdjustment = 1 / Math.max(liquidityScore, 0.1);
    const baseImpact = Math.sqrt(volumeRatio) * 0.01; // 1% for 100% volume ratio
    
    return baseImpact * liquidityAdjustment;
  }

  getMaxParticipationRate(liquidityScore) {
    // Maximum daily participation rate based on liquidity
    if (liquidityScore > this.liquidityThresholds.high) return 0.25; // 25% for highly liquid
    if (liquidityScore > this.liquidityThresholds.medium) return 0.15; // 15% for medium liquid
    return 0.05; // 5% for illiquid assets
  }

  calculatePortfolioLiquidityMetrics(liquidityMetrics, totalValue) {
    // Weighted average time to liquidate
    const weightedTimeToLiquidate = liquidityMetrics.reduce((sum, metric) => {
      const weight = metric.value / totalValue;
      return sum + (weight * metric.timeToLiquidate);
    }, 0);
    
    // Total liquidation cost
    const totalLiquidationCost = liquidityMetrics.reduce((sum, metric) => {
      const weight = metric.value / totalValue;
      return sum + (weight * metric.liquidationCost);
    }, 0);
    
    // Liquidity bucketing
    const liquidityBuckets = {
      high: 0,
      medium: 0,
      low: 0
    };
    
    liquidityMetrics.forEach(metric => {
      const weight = metric.value / totalValue;
      liquidityBuckets[metric.liquidityCategory] += weight;
    });
    
    return {
      weightedTimeToLiquidate,
      totalLiquidationCost,
      liquidityBuckets: {
        highLiquidity: liquidityBuckets.high * 100,
        mediumLiquidity: liquidityBuckets.medium * 100,
        lowLiquidity: liquidityBuckets.low * 100
      },
      liquidityGap: this.calculateLiquidityGap(liquidityMetrics, totalValue)
    };
  }

  calculateLiquidityGap(liquidityMetrics, totalValue) {
    // Calculate how much can be liquidated in different time horizons
    const timeHorizons = [1, 7, 30]; // 1 day, 1 week, 1 month
    const liquidityGap = {};
    
    timeHorizons.forEach(days => {
      const liquidatableValue = liquidityMetrics.reduce((sum, metric) => {
        const liquidatableRatio = Math.min(days / metric.timeToLiquidate, 1);
        return sum + (metric.value * liquidatableRatio);
      }, 0);
      
      liquidityGap[`${days}d`] = {
        liquidatableValue,
        liquidatablePercent: (liquidatableValue / totalValue) * 100,
        remainingValue: totalValue - liquidatableValue
      };
    });
    
    return liquidityGap;
  }

  calculateLiquidityConcentration(liquidityMetrics) {
    const totalValue = liquidityMetrics.reduce((sum, m) => sum + m.value, 0);
    
    // Sort by liquidity score (ascending - most illiquid first)
    const sortedByLiquidity = [...liquidityMetrics]
      .sort((a, b) => a.liquidityScore - b.liquidityScore);
    
    // Calculate concentration in least liquid positions
    const bottom10Percent = Math.max(1, Math.floor(sortedByLiquidity.length * 0.1));
    const leastLiquidValue = sortedByLiquidity
      .slice(0, bottom10Percent)
      .reduce((sum, m) => sum + m.value, 0);
    
    return {
      leastLiquidConcentration: (leastLiquidValue / totalValue) * 100,
      illiquidPositions: sortedByLiquidity.slice(0, bottom10Percent).map(m => ({
        symbol: m.symbol,
        liquidityScore: m.liquidityScore,
        value: m.value,
        percentOfPortfolio: (m.value / totalValue) * 100
      }))
    };
  }

  getLiquidityCategory(score) {
    if (score >= this.liquidityThresholds.high) return 'high';
    if (score >= this.liquidityThresholds.medium) return 'medium';
    return 'low';
  }

  async getMarketData(symbol) {
    // Simplified market data - would fetch from market data service
    const marketDataMap = {
      'AAPL': {
        averageDailyVolume: 75000000,
        bidAskSpread: 0.001,
        marketDepth: 2000000,
        turnoverRatio: 1.5
      },
      'BTCUSDT': {
        averageDailyVolume: 2000000000,
        bidAskSpread: 0.0001,
        marketDepth: 5000000,
        turnoverRatio: 3.0
      },
      'TSLA': {
        averageDailyVolume: 25000000,
        bidAskSpread: 0.002,
        marketDepth: 1000000,
        turnoverRatio: 1.2
      }
    };
    
    return marketDataMap[symbol] || {
      averageDailyVolume: 1000000,
      bidAskSpread: 0.01,
      marketDepth: 100000,
      turnoverRatio: 0.5
    };
  }
}

module.exports = LiquidityRiskCalculator;