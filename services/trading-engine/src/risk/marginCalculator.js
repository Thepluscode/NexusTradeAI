// src/risk/marginCalculator.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');

class MarginCalculator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.isInitialized = false;
    
    // Margin requirements by asset type
    this.marginRequirements = new Map();
    
    // Market data cache for margin calculations
    this.marketDataCache = new Map();
    this.cacheExpiry = 60000; // 1 minute
    
    // Risk-free rate for calculations
    this.riskFreeRate = 0.02; // 2% annual
    
    // Haircut rates for different asset classes
    this.haircutRates = new Map([
      ['equity', 0.15],           // 15% haircut
      ['fixed_income', 0.05],     // 5% haircut
      ['commodities', 0.25],      // 25% haircut
      ['cryptocurrency', 0.50],   // 50% haircut
      ['fx', 0.10],               // 10% haircut
      ['cash', 0.00]              // No haircut for cash
    ]);
    
    // Concentration limits
    this.concentrationLimits = {
      singlePosition: 0.25,       // 25% max single position
      assetClass: 0.40,           // 40% max asset class
      sector: 0.30                // 30% max sector
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing MarginCalculator...');
      
      // Load margin requirements
      this.loadMarginRequirements();
      
      // Start market data updates
      this.startMarketDataUpdates();
      
      this.isInitialized = true;
      this.logger?.info('MarginCalculator initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize MarginCalculator:', error);
      throw error;
    }
  }

  loadMarginRequirements() {
    // Initial margin requirements (percentage of position value)
    this.marginRequirements.set('initial', new Map([
      ['equity', 0.50],           // 50% initial margin for stocks
      ['equity_index', 0.20],     // 20% for index ETFs
      ['fixed_income', 0.10],     // 10% for bonds
      ['commodities', 0.30],      // 30% for commodities
      ['cryptocurrency', 0.75],   // 75% for crypto
      ['fx', 0.05],               // 5% for major FX pairs
      ['fx_exotic', 0.20],        // 20% for exotic pairs
      ['options', 1.00],          // 100% for long options
      ['futures', 0.10]           // 10% for futures
    ]));
    
    // Maintenance margin requirements
    this.marginRequirements.set('maintenance', new Map([
      ['equity', 0.25],           // 25% maintenance margin
      ['equity_index', 0.10],     // 10% for index ETFs
      ['fixed_income', 0.05],     // 5% for bonds
      ['commodities', 0.15],      // 15% for commodities
      ['cryptocurrency', 0.50],   // 50% for crypto
      ['fx', 0.03],               // 3% for major FX pairs
      ['fx_exotic', 0.10],        // 10% for exotic pairs
      ['options', 0.50],          // 50% for long options
      ['futures', 0.05]           // 5% for futures
    ]));
    
    // Liquidation thresholds
    this.marginRequirements.set('liquidation', new Map([
      ['equity', 0.20],           // 20% liquidation threshold
      ['equity_index', 0.08],     // 8% for index ETFs
      ['fixed_income', 0.03],     // 3% for bonds
      ['commodities', 0.12],      // 12% for commodities
      ['cryptocurrency', 0.40],   // 40% for crypto
      ['fx', 0.02],               // 2% for major FX pairs
      ['fx_exotic', 0.08],        // 8% for exotic pairs
      ['options', 0.40],          // 40% for long options
      ['futures', 0.03]           // 3% for futures
    ]));
  }

  startMarketDataUpdates() {
    // Update market data every 30 seconds
    setInterval(() => {
      this.updateMarketDataCache();
    }, 30000);
  }

  async calculateInitialMargin(positions, newOrder = null) {
    try {
      const startTime = Date.now();
      
      // Include new order if provided
      const allPositions = [...positions];
      if (newOrder) {
        allPositions.push(this.convertOrderToPosition(newOrder));
      }
      
      let totalInitialMargin = new Decimal(0);
      const positionMargins = [];
      
      for (const position of allPositions) {
        const positionMargin = await this.calculatePositionInitialMargin(position);
        positionMargins.push({
          symbol: position.symbol,
          quantity: position.quantity,
          marketValue: positionMargin.marketValue.toString(),
          marginRequired: positionMargin.initialMargin.toString(),
          marginRate: positionMargin.marginRate,
          assetType: positionMargin.assetType
        });
        
        totalInitialMargin = totalInitialMargin.plus(positionMargin.initialMargin);
      }
      
      // Apply portfolio-level adjustments
      const portfolioAdjustments = this.calculatePortfolioAdjustments(allPositions, totalInitialMargin);
      const adjustedMargin = totalInitialMargin.plus(portfolioAdjustments.additionalMargin);
      
      const calculationTime = Date.now() - startTime;
      
      return {
        totalInitialMargin: adjustedMargin.toString(),
        baseMargin: totalInitialMargin.toString(),
        portfolioAdjustments,
        positionMargins,
        calculationTime,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger?.error('Error calculating initial margin:', error);
      throw error;
    }
  }

  async calculateMaintenanceMargin(positions) {
    try {
      let totalMaintenanceMargin = new Decimal(0);
      const positionMargins = [];
      
      for (const position of positions) {
        const positionMargin = await this.calculatePositionMaintenanceMargin(position);
        positionMargins.push({
          symbol: position.symbol,
          quantity: position.quantity,
          marketValue: positionMargin.marketValue.toString(),
          marginRequired: positionMargin.maintenanceMargin.toString(),
          marginRate: positionMargin.marginRate,
          assetType: positionMargin.assetType
        });
        
        totalMaintenanceMargin = totalMaintenanceMargin.plus(positionMargin.maintenanceMargin);
      }
      
      // Apply portfolio-level adjustments for maintenance margin
      const portfolioAdjustments = this.calculatePortfolioAdjustments(positions, totalMaintenanceMargin, 'maintenance');
      const adjustedMargin = totalMaintenanceMargin.plus(portfolioAdjustments.additionalMargin);
      
      return {
        totalMaintenanceMargin: adjustedMargin.toString(),
        baseMargin: totalMaintenanceMargin.toString(),
        portfolioAdjustments,
        positionMargins,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger?.error('Error calculating maintenance margin:', error);
      throw error;
    }
  }

  async calculatePositionInitialMargin(position) {
    const marketValue = new Decimal(Math.abs(parseFloat(position.marketValue || 0)));
    const assetType = this.getAssetType(position.symbol);
    const marginRate = this.marginRequirements.get('initial').get(assetType) || 0.50;
    
    // Base margin calculation
    let initialMargin = marketValue.times(marginRate);
    
    // Apply volatility adjustment
    const volatilityAdjustment = await this.calculateVolatilityAdjustment(position, 'initial');
    initialMargin = initialMargin.times(volatilityAdjustment);
    
    // Apply correlation adjustment
    const correlationAdjustment = await this.calculateCorrelationAdjustment(position);
    initialMargin = initialMargin.times(correlationAdjustment);
    
    return {
      marketValue,
      initialMargin,
      marginRate,
      assetType,
      adjustments: {
        volatility: volatilityAdjustment,
        correlation: correlationAdjustment
      }
    };
  }

  async calculatePositionMaintenanceMargin(position) {
    const marketValue = new Decimal(Math.abs(parseFloat(position.marketValue || 0)));
    const assetType = this.getAssetType(position.symbol);
    const marginRate = this.marginRequirements.get('maintenance').get(assetType) || 0.25;
    
    // Base margin calculation
    let maintenanceMargin = marketValue.times(marginRate);
    
    // Apply volatility adjustment (less aggressive than initial)
    const volatilityAdjustment = await this.calculateVolatilityAdjustment(position, 'maintenance');
    maintenanceMargin = maintenanceMargin.times(volatilityAdjustment);
    
    return {
      marketValue,
      maintenanceMargin,
      marginRate,
      assetType,
      adjustments: {
        volatility: volatilityAdjustment
      }
    };
  }

  async calculateVolatilityAdjustment(position, marginType = 'initial') {
    try {
      const symbol = position.symbol;
      const volatility = await this.getAssetVolatility(symbol);
      
      // Base volatility for margin calculation (annualized)
      const baseVolatility = 0.20; // 20% base volatility
      const volRatio = volatility / baseVolatility;
      
      // Adjustment factor based on volatility
      let adjustment = 1.0;
      
      if (marginType === 'initial') {
        // More aggressive adjustments for initial margin
        if (volRatio > 2.0) {
          adjustment = 1.5; // 50% increase for very high vol
        } else if (volRatio > 1.5) {
          adjustment = 1.25; // 25% increase for high vol
        } else if (volRatio < 0.5) {
          adjustment = 0.8; // 20% decrease for low vol
        }
      } else {
        // More conservative adjustments for maintenance margin
        if (volRatio > 2.0) {
          adjustment = 1.3; // 30% increase for very high vol
        } else if (volRatio > 1.5) {
          adjustment = 1.15; // 15% increase for high vol
        } else if (volRatio < 0.5) {
          adjustment = 0.9; // 10% decrease for low vol
        }
      }
      
      return adjustment;
      
    } catch (error) {
      this.logger?.warn(`Error calculating volatility adjustment for ${position.symbol}:`, error);
      return 1.0; // Default no adjustment
    }
  }

  async calculateCorrelationAdjustment(position, portfolio = []) {
    try {
      // If portfolio is provided, calculate correlation benefits
      if (portfolio.length === 0) {
        return 1.0; // No adjustment for single position
      }
      
      const symbol = position.symbol;
      let totalCorrelation = 0;
      let correlationCount = 0;
      
      for (const otherPosition of portfolio) {
        if (otherPosition.symbol !== symbol) {
          const correlation = await this.getAssetCorrelation(symbol, otherPosition.symbol);
          totalCorrelation += Math.abs(correlation);
          correlationCount++;
        }
      }
      
      if (correlationCount === 0) {
        return 1.0;
      }
      
      const avgCorrelation = totalCorrelation / correlationCount;
      
      // Reduce margin requirement for well-diversified portfolios
      if (avgCorrelation < 0.3) {
        return 0.9; // 10% margin reduction for low correlation
      } else if (avgCorrelation > 0.8) {
        return 1.2; // 20% margin increase for high correlation
      }
      
      return 1.0;
      
    } catch (error) {
      this.logger?.warn(`Error calculating correlation adjustment for ${position.symbol}:`, error);
      return 1.0;
    }
  }

  calculatePortfolioAdjustments(positions, baseMargin, marginType = 'initial') {
    const adjustments = {
      additionalMargin: new Decimal(0),
      factors: []
    };
    
    // Concentration penalty
    const concentrationPenalty = this.calculateConcentrationPenalty(positions, marginType);
    adjustments.additionalMargin = adjustments.additionalMargin.plus(concentrationPenalty.penalty);
    if (concentrationPenalty.penalty.gt(0)) {
      adjustments.factors.push({
        type: 'concentration',
        amount: concentrationPenalty.penalty.toString(),
        description: concentrationPenalty.description
      });
    }
    
    // Leverage penalty
    const leveragePenalty = this.calculateLeveragePenalty(positions, baseMargin, marginType);
    adjustments.additionalMargin = adjustments.additionalMargin.plus(leveragePenalty.penalty);
    if (leveragePenalty.penalty.gt(0)) {
      adjustments.factors.push({
        type: 'leverage',
        amount: leveragePenalty.penalty.toString(),
        description: leveragePenalty.description
      });
    }
    
    // Liquidity penalty
    const liquidityPenalty = this.calculateLiquidityPenalty(positions, marginType);
    adjustments.additionalMargin = adjustments.additionalMargin.plus(liquidityPenalty.penalty);
    if (liquidityPenalty.penalty.gt(0)) {
      adjustments.factors.push({
        type: 'liquidity',
        amount: liquidityPenalty.penalty.toString(),
        description: liquidityPenalty.description
      });
    }
    
    return adjustments;
  }

  calculateConcentrationPenalty(positions, marginType) {
    const totalValue = positions.reduce((sum, pos) => 
      sum + Math.abs(parseFloat(pos.marketValue || 0)), 0
    );
    
    if (totalValue === 0) {
      return { penalty: new Decimal(0), description: 'No positions' };
    }
    
    let maxConcentration = 0;
    let concentratedSymbol = '';
    
    // Find maximum single position concentration
    positions.forEach(pos => {
      const posValue = Math.abs(parseFloat(pos.marketValue || 0));
      const concentration = posValue / totalValue;
      
      if (concentration > maxConcentration) {
        maxConcentration = concentration;
        concentratedSymbol = pos.symbol;
      }
    });
    
    // Apply penalty if concentration exceeds limits
    if (maxConcentration > this.concentrationLimits.singlePosition) {
      const excessConcentration = maxConcentration - this.concentrationLimits.singlePosition;
      const penaltyRate = marginType === 'initial' ? 0.1 : 0.05; // 10% or 5% penalty
      const penalty = new Decimal(totalValue * excessConcentration * penaltyRate);
      
      return {
        penalty,
        description: `Single position concentration penalty for ${concentratedSymbol}: ${(maxConcentration * 100).toFixed(1)}%`
      };
    }
    
    return { penalty: new Decimal(0), description: 'No concentration penalty' };
  }

  calculateLeveragePenalty(positions, baseMargin, marginType) {
    const totalValue = positions.reduce((sum, pos) => 
      sum + Math.abs(parseFloat(pos.marketValue || 0)), 0
    );
    
    const leverage = totalValue / Math.max(baseMargin.toNumber(), totalValue * 0.1); // Assume min 10% equity
    
    // Apply penalty for high leverage
    if (leverage > 4.0) {
      const excessLeverage = leverage - 4.0;
      const penaltyRate = marginType === 'initial' ? 0.05 : 0.025; // 5% or 2.5% penalty per unit
      const penalty = new Decimal(totalValue * excessLeverage * penaltyRate);
      
      return {
        penalty,
        description: `High leverage penalty: ${leverage.toFixed(1)}x leverage`
      };
    }
    
    return { penalty: new Decimal(0), description: 'No leverage penalty' };
  }

  calculateLiquidityPenalty(positions, marginType) {
    let totalPenalty = new Decimal(0);
    const illiquidSymbols = [];
    
    positions.forEach(pos => {
      const liquidity = this.getAssetLiquidity(pos.symbol);
      
      if (liquidity === 'low') {
        const posValue = Math.abs(parseFloat(pos.marketValue || 0));
        const penaltyRate = marginType === 'initial' ? 0.1 : 0.05; // 10% or 5% penalty
        const penalty = new Decimal(posValue * penaltyRate);
        
        totalPenalty = totalPenalty.plus(penalty);
        illiquidSymbols.push(pos.symbol);
      }
    });
    
    return {
      penalty: totalPenalty,
      description: illiquidSymbols.length > 0 ? 
        `Liquidity penalty for: ${illiquidSymbols.join(', ')}` : 
        'No liquidity penalty'
    };
  }

  async calculateMarginCall(positions, accountValue, accountType = 'retail') {
    try {
      const maintenanceMarginResult = await this.calculateMaintenanceMargin(positions);
      const requiredMargin = new Decimal(maintenanceMarginResult.totalMaintenanceMargin);
      const currentEquity = new Decimal(accountValue);
      
      const marginCall = currentEquity.lt(requiredMargin);
      const deficit = marginCall ? requiredMargin.minus(currentEquity) : new Decimal(0);
      
      // Calculate time to liquidation if losing money
      const timeToLiquidation = this.calculateTimeToLiquidation(positions, currentEquity, requiredMargin);
      
      return {
        marginCall,
        currentEquity: currentEquity.toString(),
        requiredMargin: requiredMargin.toString(),
        deficit: deficit.toString(),
        marginLevel: requiredMargin.gt(0) ? currentEquity.dividedBy(requiredMargin).toNumber() : 1.0,
        timeToLiquidation,
        liquidationPrice: await this.calculateLiquidationPrices(positions, currentEquity),
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger?.error('Error calculating margin call:', error);
      throw error;
    }
  }

  calculateTimeToLiquidation(positions, currentEquity, requiredMargin) {
    // Simplified calculation based on daily volatility
    if (currentEquity.lte(requiredMargin)) {
      return 0; // Already in margin call
    }
    
    const cushion = currentEquity.minus(requiredMargin);
    const portfolioValue = positions.reduce((sum, pos) => 
      sum + Math.abs(parseFloat(pos.marketValue || 0)), 0
    );
    
    if (portfolioValue === 0) return Infinity;
    
    // Estimate daily portfolio volatility
    const dailyVolatility = 0.02; // 2% daily vol assumption
    const dailyRisk = portfolioValue * dailyVolatility;
    
    // Days until liquidation (simplified)
    const days = cushion.dividedBy(dailyRisk).toNumber();
    
    return Math.max(0, days);
  }

  async calculateLiquidationPrices(positions) {
    const liquidationPrices = [];
    
    for (const position of positions) {
      try {
        const currentPrice = await this.getCurrentPrice(position.symbol);
        const liquidationThreshold = this.marginRequirements.get('liquidation')
          .get(this.getAssetType(position.symbol)) || 0.20;
        
        const quantity = new Decimal(position.quantity);
        const side = quantity.gt(0) ? 'long' : 'short';
        
        let liquidationPrice;
        if (side === 'long') {
          // For long positions, liquidation occurs when price falls
          liquidationPrice = currentPrice * (1 - liquidationThreshold);
        } else {
          // For short positions, liquidation occurs when price rises
          liquidationPrice = currentPrice * (1 + liquidationThreshold);
        }
        
        liquidationPrices.push({
          symbol: position.symbol,
          side,
          currentPrice,
          liquidationPrice,
          distance: Math.abs(liquidationPrice - currentPrice) / currentPrice
        });
        
      } catch (error) {
        this.logger?.warn(`Error calculating liquidation price for ${position.symbol}:`, error);
      }
    }
    
    return liquidationPrices;
  }

  convertOrderToPosition(order) {
    const quantity = parseFloat(order.quantity);
    const price = parseFloat(order.price || 0);
    const signedQuantity = order.side === 'buy' ? quantity : -quantity;
    
    return {
      symbol: order.symbol,
      quantity: signedQuantity.toString(),
      marketValue: (quantity * price).toString(),
      averagePrice: price.toString()
    };
  }

  getAssetType(symbol) {
    // Enhanced asset type mapping
    const assetTypeMap = {
      // Equities
      'AAPL': 'equity',
      'GOOGL': 'equity',
      'MSFT': 'equity',
      'TSLA': 'equity',
      'SPY': 'equity_index',
      'QQQ': 'equity_index',
      
      // Fixed Income
      'TLT': 'fixed_income',
      'IEF': 'fixed_income',
      'LQD': 'fixed_income',
      
      // Commodities
      'GLD': 'commodities',
      'SLV': 'commodities',
      'USO': 'commodities',
      
      // Cryptocurrency
      'BTCUSDT': 'cryptocurrency',
      'ETHUSDT': 'cryptocurrency',
      'BTC': 'cryptocurrency',
      'ETH': 'cryptocurrency',
      
      // FX
      'EURUSD': 'fx',
      'GBPUSD': 'fx',
      'USDJPY': 'fx',
      'USDCAD': 'fx_exotic',
      
      // Futures
      'ES': 'futures',
      'NQ': 'futures',
      'CL': 'futures'
    };
    
    return assetTypeMap[symbol] || 'equity'; // Default to equity
  }

  getAssetLiquidity(symbol) {
    // Simplified liquidity mapping
    const liquidityMap = {
      'AAPL': 'high',
      'GOOGL': 'high',
      'MSFT': 'high',
      'SPY': 'high',
      'BTCUSDT': 'medium',
      'ETHUSDT': 'medium',
      'GLD': 'medium',
      'TLT': 'medium'
    };
    
    return liquidityMap[symbol] || 'low';
  }

  async getAssetVolatility(symbol) {
    // Get cached volatility or calculate from market data
    const cacheKey = `vol_${symbol}`;
    const cached = this.marketDataCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.volatility;
    }
    
    // Simplified volatility mapping
    const volatilityMap = {
      'AAPL': 0.25,
      'GOOGL': 0.28,
      'MSFT': 0.22,
      'TSLA': 0.45,
      'BTCUSDT': 0.60,
      'ETHUSDT': 0.65,
      'SPY': 0.18,
      'GLD': 0.15,
      'TLT': 0.12
    };
    
    const volatility = volatilityMap[symbol] || 0.30;
    
    // Cache the result
    this.marketDataCache.set(cacheKey, {
      volatility,
      timestamp: Date.now()
    });
    
    return volatility;
  }

  async getAssetCorrelation(symbol1, symbol2) {
    // Simplified correlation matrix
    const correlations = {
      'AAPL-GOOGL': 0.7,
      'AAPL-MSFT': 0.6,
      'BTCUSDT-ETHUSDT': 0.8,
      'SPY-QQQ': 0.9,
      'GLD-TLT': -0.2
    };
    
    const key1 = `${symbol1}-${symbol2}`;
    const key2 = `${symbol2}-${symbol1}`;
    
    return correlations[key1] || correlations[key2] || 0.3; // Default correlation
  }

  async getCurrentPrice(symbol) {
    // This would fetch from market data service
    // For demo, return cached price or default
    const priceMap = {
      'AAPL': 150.00,
      'GOOGL': 2500.00,
      'MSFT': 300.00,
      'TSLA': 800.00,
      'BTCUSDT': 45000.00,
      'ETHUSDT': 3000.00
    };
    
    return priceMap[symbol] || 100.00;
  }

  async updateMarketDataCache() {
    // This would update market data for margin calculations
    // For demo, just log
    this.logger?.debug('Updated market data cache for margin calculations');
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      marginRequirements: Object.fromEntries(
        Array.from(this.marginRequirements.entries()).map(([type, map]) => [
          type,
          Object.fromEntries(map)
        ])
      ),
      haircutRates: Object.fromEntries(this.haircutRates),
      concentrationLimits: this.concentrationLimits,
      cacheSize: this.marketDataCache.size
    };
  }
}

module.exports = MarginCalculator;