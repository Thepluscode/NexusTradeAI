// src/compliance/positionLimitChecker.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');

class PositionLimitChecker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.isInitialized = false;
    
    // Position limits by user tier
    this.userLimits = new Map();
    
    // Global position limits
    this.globalLimits = {
      maxSinglePositionValue: 10000000,     // $10M per position
      maxTotalExposure: 100000000,          // $100M total exposure
      maxLeverage: 10,                      // 10:1 max leverage
      maxConcentration: 0.25,               // 25% max concentration
      maxSectorExposure: 0.40,              // 40% max sector exposure
      maxCountryExposure: 0.60,             // 60% max country exposure
      maxCurrencyExposure: 0.80             // 80% max currency exposure
    };
    
    // Default user tier limits
    this.defaultLimits = {
      retail: {
        maxSinglePosition: 100000,          // $100K
        maxTotalExposure: 1000000,          // $1M
        maxLeverage: 3,                     // 3:1
        maxConcentration: 0.20,             // 20%
        maxDailyTradingVolume: 500000,      // $500K
        maxOrderSize: 50000,                // $50K
        allowedAssetClasses: ['equity', 'etf', 'bond'],
        restrictedSymbols: []
      },
      professional: {
        maxSinglePosition: 1000000,         // $1M
        maxTotalExposure: 10000000,         // $10M
        maxLeverage: 5,                     // 5:1
        maxConcentration: 0.30,             // 30%
        maxDailyTradingVolume: 5000000,     // $5M
        maxOrderSize: 500000,               // $500K
        allowedAssetClasses: ['equity', 'etf', 'bond', 'options', 'futures'],
        restrictedSymbols: []
      },
      institutional: {
        maxSinglePosition: 10000000,        // $10M
        maxTotalExposure: 100000000,        // $100M
        maxLeverage: 10,                    // 10:1
        maxConcentration: 0.40,             // 40%
        maxDailyTradingVolume: 50000000,    // $50M
        maxOrderSize: 5000000,              // $5M
        allowedAssetClasses: ['equity', 'etf', 'bond', 'options', 'futures', 'forex', 'commodity'],
        restrictedSymbols: []
      }
    };
    
    // Sector classifications
    this.sectorMap = new Map([
      ['AAPL', 'Technology'],
      ['GOOGL', 'Technology'],
      ['MSFT', 'Technology'],
      ['AMZN', 'Technology'],
      ['TSLA', 'Automotive'],
      ['JPM', 'Financial'],
      ['BAC', 'Financial'],
      ['WFC', 'Financial'],
      ['XOM', 'Energy'],
      ['CVX', 'Energy'],
      ['JNJ', 'Healthcare'],
      ['PFE', 'Healthcare'],
      ['KO', 'Consumer'],
      ['PG', 'Consumer']
    ]);
    
    // Country/region classifications
    this.countryMap = new Map([
      ['AAPL', 'US'],
      ['GOOGL', 'US'],
      ['TSLA', 'US'],
      ['ASML', 'Netherlands'],
      ['SAP', 'Germany'],
      ['TSM', 'Taiwan'],
      ['BABA', 'China'],
      ['TCEHY', 'China']
    ]);
    
    // Currency exposure mapping
    this.currencyMap = new Map([
      ['EURUSD', 'EUR'],
      ['GBPUSD', 'GBP'],
      ['USDJPY', 'JPY'],
      ['USDCAD', 'CAD'],
      ['AUDUSD', 'AUD'],
      ['BTCUSDT', 'USD'],
      ['ETHUSDT', 'USD']
    ]);
    
    // Daily tracking for volume limits
    this.dailyVolumes = new Map(); // userId -> daily volume
    this.lastResetDate = new Date().toDateString();
  }

  async initialize() {
    try {
      this.logger?.info('Initializing PositionLimitChecker...');
      
      // Load user-specific limits
      await this.loadUserLimits();
      
      // Start daily reset timer
      this.startDailyReset();
      
      this.isInitialized = true;
      this.logger?.info('PositionLimitChecker initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize PositionLimitChecker:', error);
      throw error;
    }
  }

  async loadUserLimits() {
    // This would typically load from database
    // For demo, set some example user limits
    this.userLimits.set('user1', {
      ...this.defaultLimits.retail,
      maxSinglePosition: 150000 // Custom limit
    });
    
    this.userLimits.set('user2', {
      ...this.defaultLimits.professional
    });
    
    this.logger?.info('Loaded user-specific position limits');
  }

  async checkPositionLimits(order, currentPositions, portfolioValue) {
    try {
      const userId = order.userId;
      const userLimits = this.getUserLimits(userId);
      const violations = [];
      
      // Calculate order value
      const orderValue = new Decimal(order.quantity).times(order.price || await this.getEstimatedPrice(order.symbol));
      
      // Check individual order size limit
      const orderSizeCheck = this.checkOrderSizeLimit(orderValue, userLimits);
      if (!orderSizeCheck.allowed) {
        violations.push(orderSizeCheck);
      }
      
      // Check asset class restrictions
      const assetClassCheck = this.checkAssetClassRestrictions(order, userLimits);
      if (!assetClassCheck.allowed) {
        violations.push(assetClassCheck);
      }
      
      // Check symbol restrictions
      const symbolCheck = this.checkSymbolRestrictions(order, userLimits);
      if (!symbolCheck.allowed) {
        violations.push(symbolCheck);
      }
      
      // Calculate new position after order
      const newPositions = this.simulatePositionAfterOrder(currentPositions, order);
      
      // Check single position limit
      const singlePositionCheck = this.checkSinglePositionLimit(newPositions, userLimits, order.symbol);
      if (!singlePositionCheck.allowed) {
        violations.push(singlePositionCheck);
      }
      
      // Check total exposure limit
      const exposureCheck = this.checkTotalExposureLimit(newPositions, userLimits);
      if (!exposureCheck.allowed) {
        violations.push(exposureCheck);
      }
      
      // Check leverage limit
      const leverageCheck = this.checkLeverageLimit(newPositions, portfolioValue, userLimits);
      if (!leverageCheck.allowed) {
        violations.push(leverageCheck);
      }
      
      // Check concentration limit
      const concentrationCheck = this.checkConcentrationLimit(newPositions, userLimits);
      if (!concentrationCheck.allowed) {
        violations.push(concentrationCheck);
      }
      
      // Check sector exposure limit
      const sectorCheck = this.checkSectorExposureLimit(newPositions, userLimits);
      if (!sectorCheck.allowed) {
        violations.push(sectorCheck);
      }
      
      // Check country exposure limit
      const countryCheck = this.checkCountryExposureLimit(newPositions, userLimits);
      if (!countryCheck.allowed) {
        violations.push(countryCheck);
      }
      
      // Check daily trading volume limit
      const volumeCheck = this.checkDailyVolumeLimit(userId, orderValue, userLimits);
      if (!volumeCheck.allowed) {
        violations.push(volumeCheck);
      }
      
      const result = {
        allowed: violations.length === 0,
        violations,
        limits: userLimits,
        orderValue: orderValue.toString(),
        timestamp: new Date()
      };
      
      if (violations.length > 0) {
        this.emit('position_limit_violation', {
          userId,
          orderId: order.id,
          violations,
          orderValue: orderValue.toString()
        });
        
        this.logger?.warn(`Position limit violations for user ${userId}:`, violations);
      }
      
      return result;
      
    } catch (error) {
      this.logger?.error('Error checking position limits:', error);
      return {
        allowed: false,
        violations: [{
          type: 'system_error',
          message: 'Unable to verify position limits',
          severity: 'high'
        }],
        error: error.message
      };
    }
  }

  checkOrderSizeLimit(orderValue, userLimits) {
    if (orderValue.gt(userLimits.maxOrderSize)) {
      return {
        allowed: false,
        type: 'order_size_limit',
        message: `Order size ${orderValue.toFixed(2)} exceeds maximum ${userLimits.maxOrderSize}`,
        severity: 'high',
        limit: userLimits.maxOrderSize,
        actual: orderValue.toNumber()
      };
    }
    
    return { allowed: true };
  }

  checkAssetClassRestrictions(order, userLimits) {
    const assetClass = this.getAssetClass(order.symbol);
    
    if (!userLimits.allowedAssetClasses.includes(assetClass)) {
      return {
        allowed: false,
        type: 'asset_class_restriction',
        message: `Asset class '${assetClass}' not allowed for this user`,
        severity: 'high',
        assetClass,
        allowedClasses: userLimits.allowedAssetClasses
      };
    }
    
    return { allowed: true };
  }

  checkSymbolRestrictions(order, userLimits) {
    if (userLimits.restrictedSymbols.includes(order.symbol)) {
      return {
        allowed: false,
        type: 'symbol_restriction',
        message: `Symbol ${order.symbol} is restricted for this user`,
        severity: 'high',
        symbol: order.symbol
      };
    }
    
    return { allowed: true };
  }

  checkSinglePositionLimit(positions, userLimits, orderSymbol) {
    const position = positions.find(p => p.symbol === orderSymbol);
    if (!position) return { allowed: true };
    
    const positionValue = new Decimal(Math.abs(parseFloat(position.marketValue || 0)));
    
    if (positionValue.gt(userLimits.maxSinglePosition)) {
      return {
        allowed: false,
        type: 'single_position_limit',
        message: `Position value ${positionValue.toFixed(2)} exceeds maximum ${userLimits.maxSinglePosition} for ${orderSymbol}`,
        severity: 'high',
        symbol: orderSymbol,
        limit: userLimits.maxSinglePosition,
        actual: positionValue.toNumber()
      };
    }
    
    return { allowed: true };
  }

  checkTotalExposureLimit(positions, userLimits) {
    const totalExposure = positions.reduce((sum, pos) => {
      return sum.plus(Math.abs(parseFloat(pos.marketValue || 0)));
    }, new Decimal(0));
    
    if (totalExposure.gt(userLimits.maxTotalExposure)) {
      return {
        allowed: false,
        type: 'total_exposure_limit',
        message: `Total exposure ${totalExposure.toFixed(2)} exceeds maximum ${userLimits.maxTotalExposure}`,
        severity: 'high',
        limit: userLimits.maxTotalExposure,
        actual: totalExposure.toNumber()
      };
    }
    
    return { allowed: true };
  }

  checkLeverageLimit(positions, portfolioValue, userLimits) {
    const totalExposure = positions.reduce((sum, pos) => {
      return sum.plus(Math.abs(parseFloat(pos.marketValue || 0)));
    }, new Decimal(0));
    
    const portfolioVal = new Decimal(portfolioValue || 1);
    const leverage = portfolioVal.gt(0) ? totalExposure.dividedBy(portfolioVal) : new Decimal(0);
    
    if (leverage.gt(userLimits.maxLeverage)) {
      return {
        allowed: false,
        type: 'leverage_limit',
        message: `Leverage ${leverage.toFixed(2)}x exceeds maximum ${userLimits.maxLeverage}x`,
        severity: 'high',
        limit: userLimits.maxLeverage,
        actual: leverage.toNumber()
      };
    }
    
    return { allowed: true };
  }

  checkConcentrationLimit(positions, userLimits) {
    const totalValue = positions.reduce((sum, pos) => {
      return sum.plus(Math.abs(parseFloat(pos.marketValue || 0)));
    }, new Decimal(0));
    
    if (totalValue.lte(0)) return { allowed: true };
    
    // Find maximum single position concentration
    let maxConcentration = 0;
    let concentratedSymbol = '';
    
    positions.forEach(pos => {
      const posValue = Math.abs(parseFloat(pos.marketValue || 0));
      const concentration = posValue / totalValue.toNumber();
      
      if (concentration > maxConcentration) {
        maxConcentration = concentration;
        concentratedSymbol = pos.symbol;
      }
    });
    
    if (maxConcentration > userLimits.maxConcentration) {
      return {
        allowed: false,
        type: 'concentration_limit',
        message: `Position concentration ${(maxConcentration * 100).toFixed(1)}% exceeds maximum ${(userLimits.maxConcentration * 100).toFixed(1)}% for ${concentratedSymbol}`,
        severity: 'medium',
        symbol: concentratedSymbol,
        limit: userLimits.maxConcentration,
        actual: maxConcentration
      };
    }
    
    return { allowed: true };
  }

  checkSectorExposureLimit(positions, userLimits) {
    const sectorExposure = new Map();
    let totalValue = new Decimal(0);
    
    // Calculate sector exposures
    positions.forEach(pos => {
      const posValue = new Decimal(Math.abs(parseFloat(pos.marketValue || 0)));
      const sector = this.sectorMap.get(pos.symbol) || 'Other';
      
      totalValue = totalValue.plus(posValue);
      
      if (!sectorExposure.has(sector)) {
        sectorExposure.set(sector, new Decimal(0));
      }
      sectorExposure.set(sector, sectorExposure.get(sector).plus(posValue));
    });
    
    if (totalValue.lte(0)) return { allowed: true };
    
    // Check if any sector exceeds limit
    for (const [sector, exposure] of sectorExposure) {
      const concentration = exposure.dividedBy(totalValue).toNumber();
      const limit = userLimits.maxSectorExposure || this.globalLimits.maxSectorExposure;
      
      if (concentration > limit) {
        return {
          allowed: false,
          type: 'sector_exposure_limit',
          message: `Sector exposure ${(concentration * 100).toFixed(1)}% exceeds maximum ${(limit * 100).toFixed(1)}% for ${sector}`,
          severity: 'medium',
          sector,
          limit,
          actual: concentration
        };
      }
    }
    
    return { allowed: true };
  }

  checkCountryExposureLimit(positions, userLimits) {
    const countryExposure = new Map();
    let totalValue = new Decimal(0);
    
    // Calculate country exposures
    positions.forEach(pos => {
      const posValue = new Decimal(Math.abs(parseFloat(pos.marketValue || 0)));
      const country = this.countryMap.get(pos.symbol) || 'US'; // Default to US
      
      totalValue = totalValue.plus(posValue);
      
      if (!countryExposure.has(country)) {
        countryExposure.set(country, new Decimal(0));
      }
      countryExposure.set(country, countryExposure.get(country).plus(posValue));
    });
    
    if (totalValue.lte(0)) return { allowed: true };
    
    // Check if any country (except home country) exceeds limit
    for (const [country, exposure] of countryExposure) {
      if (country === 'US') continue; // Skip home country check
      
      const concentration = exposure.dividedBy(totalValue).toNumber();
      const limit = userLimits.maxCountryExposure || this.globalLimits.maxCountryExposure;
      
      if (concentration > limit) {
        return {
          allowed: false,
          type: 'country_exposure_limit',
          message: `Country exposure ${(concentration * 100).toFixed(1)}% exceeds maximum ${(limit * 100).toFixed(1)}% for ${country}`,
          severity: 'low',
          country,
          limit,
          actual: concentration
        };
      }
    }
    
    return { allowed: true };
  }

  checkDailyVolumeLimit(userId, orderValue, userLimits) {
    const today = new Date().toDateString();
    
    // Reset daily volumes if new day
    if (today !== this.lastResetDate) {
      this.resetDailyVolumes();
    }
    
    const currentVolume = this.dailyVolumes.get(userId) || new Decimal(0);
    const newVolume = currentVolume.plus(orderValue);
    
    if (newVolume.gt(userLimits.maxDailyTradingVolume)) {
      return {
        allowed: false,
        type: 'daily_volume_limit',
        message: `Daily trading volume ${newVolume.toFixed(2)} exceeds maximum ${userLimits.maxDailyTradingVolume}`,
        severity: 'medium',
        limit: userLimits.maxDailyTradingVolume,
        actual: newVolume.toNumber(),
        currentVolume: currentVolume.toNumber()
      };
    }
    
    // Update daily volume (optimistic - will be rolled back if order fails)
    this.dailyVolumes.set(userId, newVolume);
    
    return { allowed: true };
  }

  simulatePositionAfterOrder(currentPositions, order) {
    const newPositions = [...currentPositions];
    const orderQuantity = new Decimal(order.quantity);
    const orderPrice = new Decimal(order.price || 0);
    const orderValue = orderQuantity.times(orderPrice);
    
    // Find existing position for this symbol
    const existingIndex = newPositions.findIndex(p => p.symbol === order.symbol);
    
    if (existingIndex >= 0) {
      // Update existing position
      const existing = newPositions[existingIndex];
      const existingQuantity = new Decimal(existing.quantity || 0);
      const signedOrderQuantity = order.side === 'buy' ? orderQuantity : orderQuantity.negated();
      const newQuantity = existingQuantity.plus(signedOrderQuantity);
      
      newPositions[existingIndex] = {
        ...existing,
        quantity: newQuantity.toString(),
        marketValue: newQuantity.times(orderPrice).toString()
      };
      
      // Remove position if quantity becomes zero
      if (newQuantity.abs().lt(0.001)) {
        newPositions.splice(existingIndex, 1);
      }
    } else {
      // Create new position
      const signedQuantity = order.side === 'buy' ? orderQuantity : orderQuantity.negated();
      newPositions.push({
        symbol: order.symbol,
        quantity: signedQuantity.toString(),
        marketValue: signedQuantity.times(orderPrice).toString(),
        averagePrice: orderPrice.toString()
      });
    }
    
    return newPositions;
  }

  getUserLimits(userId) {
    // Get user-specific limits or default based on user tier
    const userSpecificLimits = this.userLimits.get(userId);
    
    if (userSpecificLimits) {
      return userSpecificLimits;
    }
    
    // Determine user tier (simplified - would query user service)
    const userTier = this.getUserTier(userId);
    return { ...this.defaultLimits[userTier] };
  }

  getUserTier(userId) {
    // Simplified tier determination
    const tierMap = {
      'user1': 'retail',
      'user2': 'professional',
      'user3': 'institutional'
    };
    
    return tierMap[userId] || 'retail';
  }

  getAssetClass(symbol) {
    // Determine asset class from symbol
    const assetClassMap = {
      'AAPL': 'equity',
      'GOOGL': 'equity',
      'MSFT': 'equity',
      'SPY': 'etf',
      'QQQ': 'etf',
      'TLT': 'bond',
      'LQD': 'bond',
      'GLD': 'commodity',
      'USO': 'commodity',
      'BTCUSDT': 'crypto',
      'ETHUSDT': 'crypto',
      'EURUSD': 'forex',
      'GBPUSD': 'forex'
    };
    
    return assetClassMap[symbol] || 'equity';
  }

  async getEstimatedPrice(symbol) {
    // Simplified price lookup - would use market data service
    const priceMap = {
      'AAPL': 150,
      'GOOGL': 2500,
      'MSFT': 300,
      'BTCUSDT': 45000,
      'ETHUSDT': 3000
    };
    
    return priceMap[symbol] || 100;
  }

  async updateUserLimits(userId, newLimits) {
    try {
      const currentLimits = this.getUserLimits(userId);
      const updatedLimits = { ...currentLimits, ...newLimits };
      
      // Validate limits
      const validation = this.validateLimits(updatedLimits);
      if (!validation.valid) {
        throw new Error(`Invalid limits: ${validation.errors.join(', ')}`);
      }
      
      this.userLimits.set(userId, updatedLimits);
      
      this.emit('user_limits_updated', {
        userId,
        previousLimits: currentLimits,
        newLimits: updatedLimits,
        updatedAt: new Date()
      });
      
      this.logger?.info(`Updated position limits for user ${userId}`, newLimits);
      
      return {
        success: true,
        userId,
        updatedLimits
      };
      
    } catch (error) {
      this.logger?.error(`Error updating limits for user ${userId}:`, error);
      throw error;
    }
  }

  validateLimits(limits) {
    const errors = [];
    
    if (limits.maxSinglePosition <= 0) {
      errors.push('maxSinglePosition must be positive');
    }
    
    if (limits.maxTotalExposure <= 0) {
      errors.push('maxTotalExposure must be positive');
    }
    
    if (limits.maxLeverage <= 0) {
      errors.push('maxLeverage must be positive');
    }
    
    if (limits.maxConcentration <= 0 || limits.maxConcentration > 1) {
      errors.push('maxConcentration must be between 0 and 1');
    }
    
    if (limits.maxOrderSize > limits.maxSinglePosition) {
      errors.push('maxOrderSize cannot exceed maxSinglePosition');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  startDailyReset() {
    // Check every hour for day change
    setInterval(() => {
      const today = new Date().toDateString();
      if (today !== this.lastResetDate) {
        this.resetDailyVolumes();
      }
    }, 3600000); // 1 hour
  }

  resetDailyVolumes() {
    this.dailyVolumes.clear();
    this.lastResetDate = new Date().toDateString();
    this.logger?.info('Daily trading volumes reset');
  }

  getCurrentLimitsUtilization(userId, positions, portfolioValue) {
    try {
      const userLimits = this.getUserLimits(userId);
      const totalExposure = positions.reduce((sum, pos) => {
        return sum + Math.abs(parseFloat(pos.marketValue || 0));
      }, 0);
      
      const dailyVolume = this.dailyVolumes.get(userId) || new Decimal(0);
      const leverage = portfolioValue > 0 ? totalExposure / portfolioValue : 0;
      
      // Find max single position
      let maxPositionValue = 0;
      let maxPositionSymbol = '';
      positions.forEach(pos => {
        const posValue = Math.abs(parseFloat(pos.marketValue || 0));
        if (posValue > maxPositionValue) {
          maxPositionValue = posValue;
          maxPositionSymbol = pos.symbol;
        }
      });
      
      return {
        userId,
        limits: userLimits,
        utilization: {
          singlePosition: {
            current: maxPositionValue,
            limit: userLimits.maxSinglePosition,
            percentage: (maxPositionValue / userLimits.maxSinglePosition) * 100,
            symbol: maxPositionSymbol
          },
          totalExposure: {
            current: totalExposure,
            limit: userLimits.maxTotalExposure,
            percentage: (totalExposure / userLimits.maxTotalExposure) * 100
          },
          leverage: {
            current: leverage,
            limit: userLimits.maxLeverage,
            percentage: (leverage / userLimits.maxLeverage) * 100
          },
          dailyVolume: {
            current: dailyVolume.toNumber(),
            limit: userLimits.maxDailyTradingVolume,
            percentage: dailyVolume.dividedBy(userLimits.maxDailyTradingVolume).times(100).toNumber()
          }
        },
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger?.error('Error calculating limits utilization:', error);
      throw error;
    }
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      userLimitsCount: this.userLimits.size,
      dailyVolumesCount: this.dailyVolumes.size,
      lastResetDate: this.lastResetDate,
      globalLimits: this.globalLimits,
      defaultLimits: this.defaultLimits
    };
  }
}

module.exports = PositionLimitChecker;