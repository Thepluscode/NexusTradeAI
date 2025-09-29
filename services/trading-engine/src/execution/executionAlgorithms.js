const Decimal = require('decimal.js');

class ExecutionAlgorithms {
  constructor(options = {}) {
    this.logger = options.logger;
  }

  // Time-Weighted Average Price (TWAP)
  async executeTWAP(order, params = {}) {
    const {
      duration = 300000, // 5 minutes default
      slices = 10,
      randomization = 0.1 // 10% randomization
    } = params;

    try {
      const totalQuantity = new Decimal(order.quantity);
      const sliceSize = totalQuantity.dividedBy(slices);
      const intervalTime = duration / slices;
      
      const executionPlan = [];
      let remainingQuantity = totalQuantity;
      
      for (let i = 0; i < slices && remainingQuantity.gt(0); i++) {
        // Add randomization to slice size and timing
        const randomFactor = 1 + (Math.random() - 0.5) * randomization;
        const currentSliceSize = Decimal.min(
          sliceSize.times(randomFactor),
          remainingQuantity
        );
        
        const randomDelay = Math.random() * intervalTime * randomization;
        const executionTime = Date.now() + (i * intervalTime) + randomDelay;
        
        executionPlan.push({
          sliceNumber: i + 1,
          quantity: currentSliceSize.toString(),
          executionTime,
          type: order.type,
          price: order.price
        });
        
        remainingQuantity = remainingQuantity.minus(currentSliceSize);
      }
      
      return {
        algorithm: 'TWAP',
        totalSlices: executionPlan.length,
        estimatedDuration: duration,
        executionPlan,
        parameters: params
      };
      
    } catch (error) {
      this.logger?.error('Error creating TWAP execution plan:', error);
      throw error;
    }
  }

  // Volume-Weighted Average Price (VWAP)
  async executeVWAP(order, params = {}) {
    const {
      participationRate = 0.1, // 10% of volume
      lookbackPeriod = 30, // 30 minute volume profile
      aggressiveness = 0.5 // 0 = passive, 1 = aggressive
    } = params;

    try {
      const volumeProfile = await this.getVolumeProfile(order.symbol, lookbackPeriod);
      const totalQuantity = new Decimal(order.quantity);
      
      const executionPlan = [];
      let remainingQuantity = totalQuantity;
      
      for (const interval of volumeProfile) {
        if (remainingQuantity.lte(0)) break;
        
        const expectedVolume = new Decimal(interval.volume);
        const maxParticipation = expectedVolume.times(participationRate);
        const sliceSize = Decimal.min(maxParticipation, remainingQuantity);
        
        if (sliceSize.gt(0)) {
          executionPlan.push({
            intervalStart: interval.startTime,
            intervalEnd: interval.endTime,
            quantity: sliceSize.toString(),
            expectedVolume: expectedVolume.toString(),
            participationRate,
            aggressiveness
          });
          
          remainingQuantity = remainingQuantity.minus(sliceSize);
        }
      }
      
      return {
        algorithm: 'VWAP',
        totalSlices: executionPlan.length,
        participationRate,
        executionPlan,
        parameters: params
      };
      
    } catch (error) {
      this.logger?.error('Error creating VWAP execution plan:', error);
      throw error;
    }
  }

  // Implementation Shortfall
  async executeImplementationShortfall(order, params = {}) {
    const {
      urgency = 0.5, // 0 = patient, 1 = urgent
      riskAversion = 0.5, // 0 = risk-seeking, 1 = risk-averse
      marketImpactModel = 'linear'
    } = params;

    try {
      const totalQuantity = new Decimal(order.quantity);
      const currentPrice = new Decimal(order.price || await this.getMarketPrice(order.symbol));
      
      // Calculate optimal execution strategy based on Almgren-Chriss model
      const { optimalTradingRate, duration } = this.calculateOptimalStrategy(
        totalQuantity,
        urgency,
        riskAversion,
        await this.getMarketParameters(order.symbol)
      );
      
      const executionPlan = [];
      let remainingQuantity = totalQuantity;
      let currentTime = Date.now();
      
      while (remainingQuantity.gt(0.01) && currentTime < Date.now() + duration) {
        const timeRemaining = (Date.now() + duration - currentTime) / 1000; // seconds
        const sliceSize = Decimal.min(
          optimalTradingRate.times(timeRemaining / 60), // per minute rate
          remainingQuantity
        );
        
        executionPlan.push({
          executionTime: currentTime,
          quantity: sliceSize.toString(),
          expectedPrice: currentPrice.toString(),
          urgency,
          riskAversion
        });
        
        remainingQuantity = remainingQuantity.minus(sliceSize);
        currentTime += 60000; // 1 minute intervals
      }
      
      return {
        algorithm: 'Implementation Shortfall',
        optimalDuration: duration,
        tradingRate: optimalTradingRate.toString(),
        executionPlan,
        parameters: params
      };
      
    } catch (error) {
      this.logger?.error('Error creating Implementation Shortfall plan:', error);
      throw error;
    }
  }

  // Percentage of Volume (POV)
  async executePercentageOfVolume(order, params = {}) {
    const {
      targetParticipation = 0.15, // 15% of volume
      minSliceSize = 0.01, // 1% of order
      maxSliceSize = 0.2, // 20% of order
      volumeWindow = 300000 // 5 minute volume window
    } = params;

    try {
      const totalQuantity = new Decimal(order.quantity);
      const minSlice = totalQuantity.times(minSliceSize);
      const maxSlice = totalQuantity.times(maxSliceSize);
      
      const executionPlan = [];
      let remainingQuantity = totalQuantity;
      let currentTime = Date.now();
      
      while (remainingQuantity.gt(minSlice)) {
        // Get recent volume for this period
        const recentVolume = await this.getRecentVolume(
          order.symbol, 
          currentTime - volumeWindow, 
          currentTime
        );
        
        const volumeRate = new Decimal(recentVolume).dividedBy(volumeWindow / 60000); // per minute
        const targetSliceSize = volumeRate.times(targetParticipation);
        
        // Constrain slice size
        const sliceSize = Decimal.max(
          minSlice,
          Decimal.min(maxSlice, Decimal.min(targetSliceSize, remainingQuantity))
        );
        
        executionPlan.push({
          executionTime: currentTime,
          quantity: sliceSize.toString(),
          recentVolume: recentVolume.toString(),
          participationRate: targetParticipation,
          windowSize: volumeWindow
        });
        
        remainingQuantity = remainingQuantity.minus(sliceSize);
        currentTime += 60000; // 1 minute intervals
      }
      
      // Execute remaining quantity
      if (remainingQuantity.gt(0)) {
        executionPlan.push({
          executionTime: currentTime,
          quantity: remainingQuantity.toString(),
          recentVolume: '0',
          participationRate: 0,
          note: 'Remainder execution'
        });
      }
      
      return {
        algorithm: 'Percentage of Volume',
        targetParticipation,
        executionPlan,
        parameters: params
      };
      
    } catch (error) {
      this.logger?.error('Error creating POV execution plan:', error);
      throw error;
    }
  }

  // Arrival Price
  async executeArrivalPrice(order, params = {}) {
    const {
      maxDuration = 1800000, // 30 minutes max
      priceThreshold = 0.002, // 0.2% price movement threshold
      volumeThreshold = 2.0 // 2x normal volume threshold
    } = params;

    try {
      const arrivalPrice = new Decimal(order.price || await this.getMarketPrice(order.symbol));
      const totalQuantity = new Decimal(order.quantity);
      
      const executionPlan = [];
      let remainingQuantity = totalQuantity;
      let currentTime = Date.now();
      const endTime = currentTime + maxDuration;
      
      // Start with aggressive execution, then adjust based on market conditions
      let aggressiveness = 0.8; // Start aggressive
      
      while (remainingQuantity.gt(0.01) && currentTime < endTime) {
        const currentPrice = new Decimal(await this.getMarketPrice(order.symbol));
        const priceChange = currentPrice.minus(arrivalPrice).dividedBy(arrivalPrice).abs();
        
        // Adjust aggressiveness based on price movement
        if (priceChange.gt(priceThreshold)) {
          aggressiveness = Math.min(1.0, aggressiveness + 0.1); // More aggressive
        } else {
          aggressiveness = Math.max(0.3, aggressiveness - 0.05); // Less aggressive
        }
        
        // Calculate slice size based on aggressiveness
        const baseSliceSize = totalQuantity.times(0.1); // 10% base
        const sliceSize = Decimal.min(
          baseSliceSize.times(aggressiveness),
          remainingQuantity
        );
        
        executionPlan.push({
          executionTime: currentTime,
          quantity: sliceSize.toString(),
          currentPrice: currentPrice.toString(),
          arrivalPrice: arrivalPrice.toString(),
          priceChange: priceChange.toNumber(),
          aggressiveness
        });
        
        remainingQuantity = remainingQuantity.minus(sliceSize);
        currentTime += Math.floor(60000 / aggressiveness); // Variable timing
      }
      
      return {
        algorithm: 'Arrival Price',
        arrivalPrice: arrivalPrice.toString(),
        maxDuration,
        executionPlan,
        parameters: params
      };
      
    } catch (error) {
      this.logger?.error('Error creating Arrival Price plan:', error);
      throw error;
    }
  }

  // Helper methods
  calculateOptimalStrategy(quantity, urgency, riskAversion, marketParams) {
    // Simplified Almgren-Chriss calculation
    const lambda = riskAversion; // Risk aversion parameter
    const kappa = marketParams.permanentImpact || 0.1;
    const eta = marketParams.temporaryImpact || 0.01;
    const sigma = marketParams.volatility || 0.02;
    
    const optimalDuration = Math.sqrt((2 * lambda * sigma * sigma) / (kappa * eta)) * 1000 * 60; // milliseconds
    const optimalTradingRate = quantity.dividedBy(optimalDuration / 60000); // per minute
    
    return {
      optimalTradingRate,
      duration: Math.min(optimalDuration, 3600000) // Max 1 hour
    };
  }

  async getVolumeProfile(symbol, lookbackMinutes) {
    // Simplified volume profile - in production would use historical data
    const profile = [];
    const baseVolume = 100000;
    const intervals = Math.min(lookbackMinutes / 5, 24); // 5-minute intervals, max 24
    
    for (let i = 0; i < intervals; i++) {
      const startTime = Date.now() + (i * 5 * 60 * 1000);
      const endTime = startTime + (5 * 60 * 1000);
      
      // Simulate volume pattern (higher during market hours)
      const hour = new Date(startTime).getHours();
      let volumeMultiplier = 1;
      
      if (hour >= 9 && hour <= 16) {
        volumeMultiplier = 2.5; // Market hours
      } else if (hour >= 7 && hour <= 9 || hour >= 16 && hour <= 18) {
        volumeMultiplier = 1.5; // Pre/post market
      }
      
      profile.push({
        startTime,
        endTime,
        volume: baseVolume * volumeMultiplier * (0.8 + Math.random() * 0.4)
      });
    }
    
    return profile;
  }

  async getMarketParameters(symbol) {
    // Simplified market parameters - in production would calculate from historical data
    return {
      volatility: 0.02, // 2% daily volatility
      permanentImpact: 0.1,
      temporaryImpact: 0.01,
      avgDailyVolume: 1000000
    };
  }

  async getMarketPrice(symbol) {
    // Placeholder - would fetch from market data service
    return 100.0;
  }

  async getRecentVolume(symbol, startTime, endTime) {
    // Placeholder - would fetch from market data service
    const duration = endTime - startTime;
    const baseRate = 1000; // per minute
    return baseRate * (duration / 60000);
  }
}

module.exports = ExecutionAlgorithms;