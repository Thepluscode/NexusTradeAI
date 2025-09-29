// src/calculators/counterpartyRiskCalculator.js
const Decimal = require('decimal.js');

class CounterpartyRiskCalculator {
  constructor(options = {}) {
    this.logger = options.logger;
    
    // Credit rating mappings
    this.creditRatings = new Map([
      ['AAA', { score: 1.0, defaultProbability: 0.0001 }],
      ['AA+', { score: 0.95, defaultProbability: 0.0002 }],
      ['AA', { score: 0.90, defaultProbability: 0.0005 }],
      ['AA-', { score: 0.85, defaultProbability: 0.001 }],
      ['A+', { score: 0.80, defaultProbability: 0.002 }],
      ['A', { score: 0.75, defaultProbability: 0.005 }],
      ['A-', { score: 0.70, defaultProbability: 0.01 }],
      ['BBB+', { score: 0.65, defaultProbability: 0.02 }],
      ['BBB', { score: 0.60, defaultProbability: 0.05 }],
      ['BBB-', { score: 0.55, defaultProbability: 0.10 }],
      ['BB+', { score: 0.50, defaultProbability: 0.15 }],
      ['BB', { score: 0.45, defaultProbability: 0.25 }],
      ['BB-', { score: 0.40, defaultProbability: 0.35 }],
      ['B+', { score: 0.35, defaultProbability: 0.50 }],
      ['B', { score: 0.30, defaultProbability: 0.70 }],
      ['B-', { score: 0.25, defaultProbability: 1.0 }],
      ['CCC', { score: 0.20, defaultProbability: 2.0 }],
      ['CC', { score: 0.15, defaultProbability: 5.0 }],
      ['C', { score: 0.10, defaultProbability: 10.0 }],
      ['D', { score: 0.05, defaultProbability: 50.0 }]
    ]);
    
    // Counterparty types
    this.counterpartyTypes = {
      BANK: 'bank',
      BROKER: 'broker',
      EXCHANGE: 'exchange',
      CLEARINGHOUSE: 'clearinghouse',
      CORPORATE: 'corporate',
      SOVEREIGN: 'sovereign',
      FUND: 'fund'
    };
  }

  async calculateCounterpartyRisk(exposures) {
    try {
      const counterpartyRisks = [];
      let totalExposure = new Decimal(0);
      let totalExpectedLoss = new Decimal(0);
      
      for (const exposure of exposures) {
        const riskMetrics = await this.calculateSingleCounterpartyRisk(exposure);
        counterpartyRisks.push(riskMetrics);
        
        totalExposure = totalExposure.plus(riskMetrics.exposure);
        totalExpectedLoss = totalExpectedLoss.plus(riskMetrics.expectedLoss);
      }
      
      // Calculate portfolio-level counterparty risk
      const portfolioRisk = this.calculatePortfolioCounterpartyRisk(counterpartyRisks, totalExposure);
      
      return {
        totalExposure: totalExposure.toNumber(),
        totalExpectedLoss: totalExpectedLoss.toNumber(),
        expectedLossRate: totalExposure.gt(0) ? totalExpectedLoss.dividedBy(totalExposure).toNumber() : 0,
        counterparties: counterpartyRisks,
        portfolioMetrics: portfolioRisk,
        concentrationRisk: this.calculateConcentrationRisk(counterpartyRisks, totalExposure),
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger?.error('Error calculating counterparty risk:', error);
      throw error;
    }
  }

  async calculateSingleCounterpartyRisk(exposure) {
    const counterpartyInfo = await this.getCounterpartyInfo(exposure.counterpartyId);
    const creditRating = this.creditRatings.get(counterpartyInfo.rating) || 
                        this.creditRatings.get('BBB'); // Default rating
    
    const exposureAmount = new Decimal(exposure.amount);
    const recoveryRate = new Decimal(counterpartyInfo.recoveryRate || 0.4); // 40% default
    const lossGivenDefault = new Decimal(1).minus(recoveryRate);
    
    // Calculate expected loss
    const expectedLoss = exposureAmount
      .times(creditRating.defaultProbability / 100)
      .times(lossGivenDefault);
    
    // Calculate potential future exposure
    const potentialFutureExposure = this.calculatePotentialFutureExposure(exposure);
    
    // Calculate credit value adjustment (CVA)
    const cva = this.calculateCVA(exposure, counterpartyInfo);
    
    return {
      counterpartyId: exposure.counterpartyId,
      counterpartyName: counterpartyInfo.name,
      counterpartyType: counterpartyInfo.type,
      rating: counterpartyInfo.rating,
      exposure: exposureAmount.toNumber(),
      potentialFutureExposure: potentialFutureExposure.toNumber(),
      expectedLoss: expectedLoss.toNumber(),
      lossGivenDefault: lossGivenDefault.toNumber(),
      defaultProbability: creditRating.defaultProbability,
      cva: cva.toNumber(),
      riskScore: this.calculateRiskScore(exposureAmount, creditRating, counterpartyInfo),
      maturity: exposure.maturity || 1, // years
      exposureType: exposure.type
    };
  }

  calculatePotentialFutureExposure(exposure) {
    // Simplified PFE calculation
    const currentExposure = new Decimal(exposure.amount);
    const volatility = new Decimal(exposure.volatility || 0.2); // 20% default
    const timeToMaturity = new Decimal(exposure.maturity || 1); // years
    const confidenceLevel = 0.95; // 95% confidence
    
    // PFE = Current Exposure + (Volatility × √Time × Z-score)
    const zScore = 1.645; // 95% confidence level
    const additionalExposure = currentExposure
      .times(volatility)
      .times(timeToMaturity.sqrt())
      .times(zScore);
    
    return currentExposure.plus(additionalExposure);
  }

  calculateCVA(exposure, counterpartyInfo) {
    // Credit Value Adjustment calculation
    const exposureAmount = new Decimal(exposure.amount);
    const defaultProbability = new Decimal(counterpartyInfo.defaultProbability || 1) / 100;
    const lossGivenDefault = new Decimal(1 - (counterpartyInfo.recoveryRate || 0.4));
    const discountRate = new Decimal(0.05); // 5% discount rate
    const maturity = new Decimal(exposure.maturity || 1);
    
    // CVA = EAD × PD × LGD × DF
    const discountFactor = new Decimal(1).dividedBy(
      new Decimal(1).plus(discountRate).pow(maturity)
    );
    
    const cva = exposureAmount
      .times(defaultProbability)
      .times(lossGivenDefault)
      .times(discountFactor);
    
    return cva;
  }

  calculateRiskScore(exposure, creditRating, counterpartyInfo) {
    let score = creditRating.score * 100; // Base score from rating
    
    // Adjust for counterparty type
    const typeAdjustments = {
      bank: 5,
      exchange: 10,
      clearinghouse: 15,
      sovereign: 20,
      broker: -5,
      corporate: -10,
      fund: -15
    };
    
    score += typeAdjustments[counterpartyInfo.type] || 0;
    
    // Adjust for exposure size (larger = riskier)
    const exposureSize = exposure.toNumber();
    if (exposureSize > 10000000) score -= 20; // >$10M
    else if (exposureSize > 1000000) score -= 10; // >$1M
    else if (exposureSize > 100000) score -= 5; // >$100K
    
    return Math.max(0, Math.min(100, score));
  }

  calculatePortfolioCounterpartyRisk(counterpartyRisks, totalExposure) {
    // Calculate concentration by rating
    const ratingConcentration = {};
    const typeConcentration = {};
    
    counterpartyRisks.forEach(risk => {
      const weight = risk.exposure / totalExposure.toNumber();
      
      // Rating concentration
      if (!ratingConcentration[risk.rating]) {
        ratingConcentration[risk.rating] = 0;
      }
      ratingConcentration[risk.rating] += weight * 100;
      
      // Type concentration
      if (!typeConcentration[risk.counterpartyType]) {
        typeConcentration[risk.counterpartyType] = 0;
      }
      typeConcentration[risk.counterpartyType] += weight * 100;
    });
    
    // Calculate diversification metrics
    const numberOfCounterparties = counterpartyRisks.length;
    const averageExposure = totalExposure.dividedBy(numberOfCounterparties || 1).toNumber();
    const herfindahlIndex = this.calculateHerfindahlIndex(counterpartyRisks, totalExposure);
    
    return {
      numberOfCounterparties,
      averageExposure,
      herfindahlIndex,
      diversificationRatio: 1 / Math.sqrt(herfindahlIndex),
      ratingConcentration,
      typeConcentration,
      riskDistribution: this.calculateRiskDistribution(counterpartyRisks)
    };
  }

  calculateHerfindahlIndex(counterpartyRisks, totalExposure) {
    return counterpartyRisks.reduce((sum, risk) => {
      const weight = risk.exposure / totalExposure.toNumber();
      return sum + (weight * weight);
    }, 0);
  }

  calculateRiskDistribution(counterpartyRisks) {
    const distribution = {
      low: 0,    // Score >= 80
      medium: 0, // Score 50-79
      high: 0    // Score < 50
    };
    
    counterpartyRisks.forEach(risk => {
      if (risk.riskScore >= 80) distribution.low++;
      else if (risk.riskScore >= 50) distribution.medium++;
      else distribution.high++;
    });
    
    const total = counterpartyRisks.length;
    return {
      lowRisk: (distribution.low / total) * 100,
      mediumRisk: (distribution.medium / total) * 100,
      highRisk: (distribution.high / total) * 100
    };
  }

  calculateConcentrationRisk(counterpartyRisks, totalExposure) {
    // Sort by exposure size
    const sortedRisks = [...counterpartyRisks]
      .sort((a, b) => b.exposure - a.exposure);
    
    const top1 = sortedRisks.slice(0, 1).reduce((sum, r) => sum + r.exposure, 0);
    const top5 = sortedRisks.slice(0, 5).reduce((sum, r) => sum + r.exposure, 0);
    const top10 = sortedRisks.slice(0, 10).reduce((sum, r) => sum + r.exposure, 0);
    
    const totalExp = totalExposure.toNumber();
    
    return {
      largestCounterparty: (top1 / totalExp) * 100,
      top5Concentration: (top5 / totalExp) * 100,
      top10Concentration: (top10 / totalExp) * 100,
      concentrationWarnings: this.generateConcentrationWarnings(top1, top5, totalExp)
    };
  }

  generateConcentrationWarnings(top1, top5, total) {
    const warnings = [];
    
    if (top1 / total > 0.25) {
      warnings.push('Single counterparty concentration exceeds 25%');
    }
    
    if (top5 / total > 0.50) {
      warnings.push('Top 5 counterparty concentration exceeds 50%');
    }
    
    return warnings;
  }

  async getCounterpartyInfo(counterpartyId) {
    // Simplified counterparty data - would fetch from counterparty database
    const counterpartyDb = {
      'CP001': {
        name: 'Goldman Sachs',
        type: 'bank',
        rating: 'A+',
        recoveryRate: 0.6,
        defaultProbability: 0.5
      },
      'CP002': {
        name: 'JP Morgan',
        type: 'bank',
        rating: 'AA-',
        recoveryRate: 0.65,
        defaultProbability: 0.3
      },
      'CP003': {
        name: 'Binance',
        type: 'exchange',
        rating: 'BBB',
        recoveryRate: 0.3,
        defaultProbability: 2.0
      }
    };
    
    return counterpartyDb[counterpartyId] || {
      name: 'Unknown Counterparty',
      type: 'corporate',
      rating: 'BBB',
      recoveryRate: 0.4,
      defaultProbability: 1.0
    };
  }
}

module.exports = CounterpartyRiskCalculator;