// Enterprise-Grade Risk Management System
// Real-time risk monitoring, circuit breakers, position limits, and regulatory compliance

const EventEmitter = require('events');
const CircuitBreaker = require('./CircuitBreaker');
const PositionLimitManager = require('./PositionLimitManager');
const RegulatoryComplianceEngine = require('./RegulatoryComplianceEngine');
const RealTimeRiskMonitor = require('./RealTimeRiskMonitor');

class EnterpriseRiskManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.redis = options.redis;
    this.database = options.database;
    
    // Initialize risk management components
    this.circuitBreaker = new CircuitBreaker(options);
    this.positionLimitManager = new PositionLimitManager(options);
    this.complianceEngine = new RegulatoryComplianceEngine(options);
    this.riskMonitor = new RealTimeRiskMonitor(options);
    
    // Risk configuration for institutional clients
    this.riskConfig = {
      // Portfolio-level limits
      maxPortfolioValue: options.maxPortfolioValue || 1000000000, // $1B
      maxDailyLoss: options.maxDailyLoss || 0.05, // 5%
      maxDrawdown: options.maxDrawdown || 0.15, // 15%
      maxLeverage: options.maxLeverage || 3.0, // 3:1
      
      // Position-level limits
      maxPositionSize: options.maxPositionSize || 0.1, // 10% of portfolio
      maxSectorExposure: options.maxSectorExposure || 0.25, // 25% per sector
      maxCountryExposure: options.maxCountryExposure || 0.4, // 40% per country
      
      // Risk metrics thresholds
      maxVaR95: options.maxVaR95 || 0.03, // 3% daily VaR
      maxVaR99: options.maxVaR99 || 0.05, // 5% daily VaR
      maxExpectedShortfall: options.maxExpectedShortfall || 0.06, // 6% ES
      maxBeta: options.maxBeta || 2.0, // Maximum portfolio beta
      
      // Concentration limits
      maxSingleAssetExposure: options.maxSingleAssetExposure || 0.05, // 5%
      maxCorrelatedGroupExposure: options.maxCorrelatedGroupExposure || 0.2, // 20%
      
      // Liquidity requirements
      minLiquidityRatio: options.minLiquidityRatio || 0.1, // 10% liquid assets
      maxIlliquidExposure: options.maxIlliquidExposure || 0.3, // 30% illiquid
      
      // Operational limits
      maxOrdersPerSecond: options.maxOrdersPerSecond || 100,
      maxOrderValue: options.maxOrderValue || 10000000, // $10M per order
      
      // Compliance settings
      enableMiFIDII: options.enableMiFIDII || true,
      enableDODDFrank: options.enableDODDFrank || true,
      enableEMIR: options.enableEMIR || true,
      enableBaselIII: options.enableBaselIII || true
    };
    
    // Active risk monitoring
    this.activePositions = new Map();
    this.riskMetrics = new Map();
    this.alertHistory = [];
    this.complianceViolations = [];
    
    // Performance tracking
    this.metrics = {
      totalRiskChecks: 0,
      riskViolations: 0,
      circuitBreakerTrips: 0,
      complianceViolations: 0,
      averageRiskCheckLatency: 0,
      lastRiskUpdate: null
    };
    
    this.initializeRiskManagement();
  }

  /**
   * Initialize enterprise risk management system
   */
  async initializeRiskManagement() {
    try {
      // Initialize components
      await this.circuitBreaker.initialize();
      await this.positionLimitManager.initialize();
      await this.complianceEngine.initialize();
      await this.riskMonitor.initialize();
      
      // Start real-time monitoring
      this.startRealTimeMonitoring();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      this.logger?.info('🛡️ Enterprise Risk Manager initialized');
      
    } catch (error) {
      this.logger?.error('Failed to initialize risk management:', error);
      throw error;
    }
  }

  /**
   * Pre-trade risk check for order validation
   */
  async preTradeRiskCheck(order, accountId, portfolioValue) {
    const startTime = Date.now();
    
    try {
      const riskCheckResult = {
        approved: false,
        violations: [],
        warnings: [],
        riskMetrics: {},
        timestamp: Date.now()
      };
      
      // 1. Circuit breaker check
      const circuitBreakerStatus = await this.circuitBreaker.checkStatus(accountId);
      if (circuitBreakerStatus.isTripped) {
        riskCheckResult.violations.push({
          type: 'CIRCUIT_BREAKER',
          severity: 'CRITICAL',
          message: 'Circuit breaker is active - trading halted',
          details: circuitBreakerStatus
        });
        return riskCheckResult;
      }
      
      // 2. Position limit checks
      const positionCheck = await this.positionLimitManager.validateOrder(order, accountId);
      if (!positionCheck.approved) {
        riskCheckResult.violations.push(...positionCheck.violations);
      }
      
      // 3. Portfolio-level risk checks
      const portfolioRisk = await this.calculatePortfolioRisk(order, accountId, portfolioValue);
      if (portfolioRisk.violations.length > 0) {
        riskCheckResult.violations.push(...portfolioRisk.violations);
      }
      
      // 4. Concentration risk checks
      const concentrationRisk = await this.checkConcentrationRisk(order, accountId);
      if (concentrationRisk.violations.length > 0) {
        riskCheckResult.violations.push(...concentrationRisk.violations);
      }
      
      // 5. Liquidity risk checks
      const liquidityRisk = await this.checkLiquidityRisk(order, accountId);
      if (liquidityRisk.violations.length > 0) {
        riskCheckResult.violations.push(...liquidityRisk.violations);
      }
      
      // 6. Regulatory compliance checks
      const complianceCheck = await this.complianceEngine.validateOrder(order, accountId);
      if (!complianceCheck.approved) {
        riskCheckResult.violations.push(...complianceCheck.violations);
      }
      
      // 7. Operational risk checks
      const operationalRisk = await this.checkOperationalRisk(order, accountId);
      if (operationalRisk.violations.length > 0) {
        riskCheckResult.violations.push(...operationalRisk.violations);
      }
      
      // Determine approval status
      const criticalViolations = riskCheckResult.violations.filter(v => v.severity === 'CRITICAL');
      riskCheckResult.approved = criticalViolations.length === 0;
      
      // Add risk metrics
      riskCheckResult.riskMetrics = {
        portfolioRisk: portfolioRisk.metrics,
        concentrationRisk: concentrationRisk.metrics,
        liquidityRisk: liquidityRisk.metrics,
        operationalRisk: operationalRisk.metrics
      };
      
      // Update metrics
      this.metrics.totalRiskChecks++;
      if (!riskCheckResult.approved) {
        this.metrics.riskViolations++;
      }
      
      const latency = Date.now() - startTime;
      this.updateLatencyMetrics(latency);
      
      // Log and emit events
      if (!riskCheckResult.approved) {
        this.logger?.warn(`Risk check failed for order ${order.id}: ${criticalViolations.length} critical violations`);
        this.emit('riskViolation', { order, accountId, violations: riskCheckResult.violations });
      }
      
      return riskCheckResult;
      
    } catch (error) {
      this.logger?.error('Error in pre-trade risk check:', error);
      return {
        approved: false,
        violations: [{
          type: 'SYSTEM_ERROR',
          severity: 'CRITICAL',
          message: 'Risk check system error',
          details: error.message
        }],
        warnings: [],
        riskMetrics: {},
        timestamp: Date.now()
      };
    }
  }

  /**
   * Calculate portfolio-level risk metrics
   */
  async calculatePortfolioRisk(order, accountId, portfolioValue) {
    const violations = [];
    const metrics = {};
    
    try {
      // Get current positions
      const positions = await this.getAccountPositions(accountId);
      
      // Calculate order impact
      const orderValue = order.quantity * order.price;
      const newPortfolioValue = portfolioValue + (order.side === 'BUY' ? orderValue : -orderValue);
      
      // Check portfolio value limit
      if (newPortfolioValue > this.riskConfig.maxPortfolioValue) {
        violations.push({
          type: 'PORTFOLIO_VALUE_LIMIT',
          severity: 'CRITICAL',
          message: `Portfolio value would exceed limit: ${newPortfolioValue} > ${this.riskConfig.maxPortfolioValue}`,
          current: newPortfolioValue,
          limit: this.riskConfig.maxPortfolioValue
        });
      }
      
      // Calculate leverage
      const totalExposure = this.calculateTotalExposure(positions, order);
      const leverage = totalExposure / portfolioValue;
      
      if (leverage > this.riskConfig.maxLeverage) {
        violations.push({
          type: 'LEVERAGE_LIMIT',
          severity: 'CRITICAL',
          message: `Leverage would exceed limit: ${leverage.toFixed(2)} > ${this.riskConfig.maxLeverage}`,
          current: leverage,
          limit: this.riskConfig.maxLeverage
        });
      }
      
      // Calculate VaR impact
      const portfolioVaR = await this.calculatePortfolioVaR(positions, order);
      
      if (portfolioVaR.var95 > this.riskConfig.maxVaR95) {
        violations.push({
          type: 'VAR_95_LIMIT',
          severity: 'HIGH',
          message: `95% VaR would exceed limit: ${(portfolioVaR.var95 * 100).toFixed(2)}% > ${(this.riskConfig.maxVaR95 * 100).toFixed(2)}%`,
          current: portfolioVaR.var95,
          limit: this.riskConfig.maxVaR95
        });
      }
      
      if (portfolioVaR.var99 > this.riskConfig.maxVaR99) {
        violations.push({
          type: 'VAR_99_LIMIT',
          severity: 'CRITICAL',
          message: `99% VaR would exceed limit: ${(portfolioVaR.var99 * 100).toFixed(2)}% > ${(this.riskConfig.maxVaR99 * 100).toFixed(2)}%`,
          current: portfolioVaR.var99,
          limit: this.riskConfig.maxVaR99
        });
      }
      
      // Store metrics
      metrics.portfolioValue = newPortfolioValue;
      metrics.leverage = leverage;
      metrics.var95 = portfolioVaR.var95;
      metrics.var99 = portfolioVaR.var99;
      metrics.expectedShortfall = portfolioVaR.expectedShortfall;
      
    } catch (error) {
      this.logger?.error('Error calculating portfolio risk:', error);
      violations.push({
        type: 'PORTFOLIO_RISK_CALCULATION_ERROR',
        severity: 'HIGH',
        message: 'Failed to calculate portfolio risk metrics',
        details: error.message
      });
    }
    
    return { violations, metrics };
  }

  /**
   * Check concentration risk limits
   */
  async checkConcentrationRisk(order, accountId) {
    const violations = [];
    const metrics = {};
    
    try {
      const positions = await this.getAccountPositions(accountId);
      const portfolioValue = this.calculatePortfolioValue(positions);
      
      // Single asset concentration
      const assetExposure = this.calculateAssetExposure(positions, order.symbol);
      const assetConcentration = assetExposure / portfolioValue;
      
      if (assetConcentration > this.riskConfig.maxSingleAssetExposure) {
        violations.push({
          type: 'SINGLE_ASSET_CONCENTRATION',
          severity: 'HIGH',
          message: `Single asset exposure would exceed limit: ${(assetConcentration * 100).toFixed(2)}% > ${(this.riskConfig.maxSingleAssetExposure * 100).toFixed(2)}%`,
          asset: order.symbol,
          current: assetConcentration,
          limit: this.riskConfig.maxSingleAssetExposure
        });
      }
      
      // Sector concentration
      const sectorExposure = await this.calculateSectorExposure(positions, order);
      for (const [sector, exposure] of Object.entries(sectorExposure)) {
        const sectorConcentration = exposure / portfolioValue;
        
        if (sectorConcentration > this.riskConfig.maxSectorExposure) {
          violations.push({
            type: 'SECTOR_CONCENTRATION',
            severity: 'MEDIUM',
            message: `Sector exposure would exceed limit: ${sector} ${(sectorConcentration * 100).toFixed(2)}% > ${(this.riskConfig.maxSectorExposure * 100).toFixed(2)}%`,
            sector,
            current: sectorConcentration,
            limit: this.riskConfig.maxSectorExposure
          });
        }
      }
      
      // Correlated group concentration
      const correlatedGroupExposure = await this.calculateCorrelatedGroupExposure(positions, order);
      if (correlatedGroupExposure > this.riskConfig.maxCorrelatedGroupExposure) {
        violations.push({
          type: 'CORRELATED_GROUP_CONCENTRATION',
          severity: 'HIGH',
          message: `Correlated group exposure would exceed limit: ${(correlatedGroupExposure * 100).toFixed(2)}% > ${(this.riskConfig.maxCorrelatedGroupExposure * 100).toFixed(2)}%`,
          current: correlatedGroupExposure,
          limit: this.riskConfig.maxCorrelatedGroupExposure
        });
      }
      
      metrics.assetConcentration = assetConcentration;
      metrics.sectorExposure = sectorExposure;
      metrics.correlatedGroupExposure = correlatedGroupExposure;
      
    } catch (error) {
      this.logger?.error('Error checking concentration risk:', error);
      violations.push({
        type: 'CONCENTRATION_RISK_CHECK_ERROR',
        severity: 'MEDIUM',
        message: 'Failed to check concentration risk',
        details: error.message
      });
    }
    
    return { violations, metrics };
  }

  /**
   * Check liquidity risk
   */
  async checkLiquidityRisk(order, accountId) {
    const violations = [];
    const metrics = {};
    
    try {
      const positions = await this.getAccountPositions(accountId);
      const portfolioValue = this.calculatePortfolioValue(positions);
      
      // Calculate liquidity metrics
      const liquidityMetrics = await this.calculateLiquidityMetrics(positions, order);
      
      // Check minimum liquidity ratio
      if (liquidityMetrics.liquidityRatio < this.riskConfig.minLiquidityRatio) {
        violations.push({
          type: 'LIQUIDITY_RATIO',
          severity: 'HIGH',
          message: `Liquidity ratio would fall below minimum: ${(liquidityMetrics.liquidityRatio * 100).toFixed(2)}% < ${(this.riskConfig.minLiquidityRatio * 100).toFixed(2)}%`,
          current: liquidityMetrics.liquidityRatio,
          limit: this.riskConfig.minLiquidityRatio
        });
      }
      
      // Check illiquid exposure limit
      if (liquidityMetrics.illiquidExposure > this.riskConfig.maxIlliquidExposure) {
        violations.push({
          type: 'ILLIQUID_EXPOSURE',
          severity: 'MEDIUM',
          message: `Illiquid exposure would exceed limit: ${(liquidityMetrics.illiquidExposure * 100).toFixed(2)}% > ${(this.riskConfig.maxIlliquidExposure * 100).toFixed(2)}%`,
          current: liquidityMetrics.illiquidExposure,
          limit: this.riskConfig.maxIlliquidExposure
        });
      }
      
      metrics.liquidityRatio = liquidityMetrics.liquidityRatio;
      metrics.illiquidExposure = liquidityMetrics.illiquidExposure;
      metrics.averageLiquidityScore = liquidityMetrics.averageLiquidityScore;
      
    } catch (error) {
      this.logger?.error('Error checking liquidity risk:', error);
      violations.push({
        type: 'LIQUIDITY_RISK_CHECK_ERROR',
        severity: 'MEDIUM',
        message: 'Failed to check liquidity risk',
        details: error.message
      });
    }
    
    return { violations, metrics };
  }

  /**
   * Check operational risk limits
   */
  async checkOperationalRisk(order, accountId) {
    const violations = [];
    const metrics = {};
    
    try {
      // Check order value limit
      const orderValue = order.quantity * order.price;
      if (orderValue > this.riskConfig.maxOrderValue) {
        violations.push({
          type: 'ORDER_VALUE_LIMIT',
          severity: 'HIGH',
          message: `Order value exceeds limit: ${orderValue} > ${this.riskConfig.maxOrderValue}`,
          current: orderValue,
          limit: this.riskConfig.maxOrderValue
        });
      }
      
      // Check order rate limit
      const orderRate = await this.calculateOrderRate(accountId);
      if (orderRate > this.riskConfig.maxOrdersPerSecond) {
        violations.push({
          type: 'ORDER_RATE_LIMIT',
          severity: 'MEDIUM',
          message: `Order rate exceeds limit: ${orderRate} > ${this.riskConfig.maxOrdersPerSecond} orders/second`,
          current: orderRate,
          limit: this.riskConfig.maxOrdersPerSecond
        });
      }
      
      metrics.orderValue = orderValue;
      metrics.orderRate = orderRate;
      
    } catch (error) {
      this.logger?.error('Error checking operational risk:', error);
      violations.push({
        type: 'OPERATIONAL_RISK_CHECK_ERROR',
        severity: 'LOW',
        message: 'Failed to check operational risk',
        details: error.message
      });
    }
    
    return { violations, metrics };
  }

  /**
   * Start real-time risk monitoring
   */
  startRealTimeMonitoring() {
    // Monitor portfolio risk every 30 seconds
    setInterval(async () => {
      try {
        await this.updateRealTimeRiskMetrics();
      } catch (error) {
        this.logger?.error('Error in real-time risk monitoring:', error);
      }
    }, 30000);

    // Check circuit breakers every 10 seconds
    setInterval(async () => {
      try {
        await this.checkCircuitBreakers();
      } catch (error) {
        this.logger?.error('Error checking circuit breakers:', error);
      }
    }, 10000);
  }

  /**
   * Update real-time risk metrics
   */
  async updateRealTimeRiskMetrics() {
    try {
      // Get all active accounts
      const activeAccounts = await this.getActiveAccounts();

      for (const accountId of activeAccounts) {
        const positions = await this.getAccountPositions(accountId);
        const portfolioValue = this.calculatePortfolioValue(positions);

        // Calculate current risk metrics
        const riskMetrics = {
          portfolioValue,
          leverage: this.calculateLeverage(positions, portfolioValue),
          var95: await this.calculateVaR(positions, 0.95),
          var99: await this.calculateVaR(positions, 0.99),
          expectedShortfall: await this.calculateExpectedShortfall(positions),
          beta: await this.calculatePortfolioBeta(positions),
          liquidityRatio: await this.calculateLiquidityRatio(positions),
          concentrationRisk: await this.calculateConcentrationRisk(positions),
          timestamp: Date.now()
        };

        // Store metrics
        this.riskMetrics.set(accountId, riskMetrics);

        // Check for violations
        await this.checkRiskViolations(accountId, riskMetrics);
      }

      this.metrics.lastRiskUpdate = Date.now();

    } catch (error) {
      this.logger?.error('Error updating real-time risk metrics:', error);
    }
  }

  /**
   * Check for risk violations in real-time
   */
  async checkRiskViolations(accountId, riskMetrics) {
    const violations = [];

    // Check portfolio-level violations
    if (riskMetrics.leverage > this.riskConfig.maxLeverage) {
      violations.push({
        type: 'LEVERAGE_VIOLATION',
        severity: 'CRITICAL',
        accountId,
        current: riskMetrics.leverage,
        limit: this.riskConfig.maxLeverage,
        timestamp: Date.now()
      });
    }

    if (riskMetrics.var99 > this.riskConfig.maxVaR99) {
      violations.push({
        type: 'VAR_99_VIOLATION',
        severity: 'CRITICAL',
        accountId,
        current: riskMetrics.var99,
        limit: this.riskConfig.maxVaR99,
        timestamp: Date.now()
      });
    }

    if (riskMetrics.liquidityRatio < this.riskConfig.minLiquidityRatio) {
      violations.push({
        type: 'LIQUIDITY_VIOLATION',
        severity: 'HIGH',
        accountId,
        current: riskMetrics.liquidityRatio,
        limit: this.riskConfig.minLiquidityRatio,
        timestamp: Date.now()
      });
    }

    // Handle violations
    if (violations.length > 0) {
      await this.handleRiskViolations(accountId, violations);
    }
  }

  /**
   * Handle risk violations with appropriate actions
   */
  async handleRiskViolations(accountId, violations) {
    try {
      for (const violation of violations) {
        // Log violation
        this.logger?.error(`Risk violation detected: ${violation.type} for account ${accountId}`);

        // Store violation history
        this.alertHistory.push(violation);

        // Take action based on severity
        switch (violation.severity) {
          case 'CRITICAL':
            await this.handleCriticalViolation(accountId, violation);
            break;
          case 'HIGH':
            await this.handleHighViolation(accountId, violation);
            break;
          case 'MEDIUM':
            await this.handleMediumViolation(accountId, violation);
            break;
        }

        // Emit violation event
        this.emit('riskViolation', { accountId, violation });
      }

      this.metrics.riskViolations += violations.length;

    } catch (error) {
      this.logger?.error('Error handling risk violations:', error);
    }
  }

  /**
   * Handle critical risk violations
   */
  async handleCriticalViolation(accountId, violation) {
    // Trip circuit breaker
    await this.circuitBreaker.trip(accountId, violation.type);

    // Send immediate alert
    await this.sendCriticalAlert(accountId, violation);

    // Auto-liquidate if configured
    if (this.riskConfig.autoLiquidateOnCritical) {
      await this.initiateEmergencyLiquidation(accountId, violation);
    }
  }

  /**
   * Calculate portfolio VaR
   */
  async calculatePortfolioVaR(positions, newOrder = null) {
    try {
      // Simulate portfolio with new order
      const simulatedPositions = [...positions];
      if (newOrder) {
        simulatedPositions.push({
          symbol: newOrder.symbol,
          quantity: newOrder.side === 'BUY' ? newOrder.quantity : -newOrder.quantity,
          price: newOrder.price,
          value: newOrder.quantity * newOrder.price
        });
      }

      // Get historical returns for portfolio assets
      const portfolioReturns = await this.calculatePortfolioReturns(simulatedPositions);

      // Calculate VaR using historical simulation
      const sortedReturns = portfolioReturns.sort((a, b) => a - b);

      const var95Index = Math.floor(portfolioReturns.length * 0.05);
      const var99Index = Math.floor(portfolioReturns.length * 0.01);

      const var95 = Math.abs(sortedReturns[var95Index] || 0);
      const var99 = Math.abs(sortedReturns[var99Index] || 0);

      // Calculate Expected Shortfall (average of worst 5% returns)
      const worstReturns = sortedReturns.slice(0, var95Index + 1);
      const expectedShortfall = worstReturns.length > 0
        ? Math.abs(worstReturns.reduce((sum, r) => sum + r, 0) / worstReturns.length)
        : 0;

      return { var95, var99, expectedShortfall };

    } catch (error) {
      this.logger?.error('Error calculating portfolio VaR:', error);
      return { var95: 0, var99: 0, expectedShortfall: 0 };
    }
  }

  /**
   * Calculate total portfolio exposure
   */
  calculateTotalExposure(positions, newOrder = null) {
    let totalExposure = 0;

    for (const position of positions) {
      totalExposure += Math.abs(position.value || position.quantity * position.price);
    }

    if (newOrder) {
      totalExposure += newOrder.quantity * newOrder.price;
    }

    return totalExposure;
  }

  /**
   * Calculate asset exposure including new order
   */
  calculateAssetExposure(positions, symbol) {
    let exposure = 0;

    for (const position of positions) {
      if (position.symbol === symbol) {
        exposure += Math.abs(position.value || position.quantity * position.price);
      }
    }

    return exposure;
  }

  /**
   * Calculate sector exposure
   */
  async calculateSectorExposure(positions, newOrder = null) {
    const sectorExposure = {};

    // Get sector mappings
    const sectorMappings = await this.getSectorMappings();

    for (const position of positions) {
      const sector = sectorMappings[position.symbol] || 'UNKNOWN';
      const exposure = Math.abs(position.value || position.quantity * position.price);

      sectorExposure[sector] = (sectorExposure[sector] || 0) + exposure;
    }

    if (newOrder) {
      const sector = sectorMappings[newOrder.symbol] || 'UNKNOWN';
      const exposure = newOrder.quantity * newOrder.price;
      sectorExposure[sector] = (sectorExposure[sector] || 0) + exposure;
    }

    return sectorExposure;
  }

  /**
   * Calculate correlated group exposure
   */
  async calculateCorrelatedGroupExposure(positions, newOrder = null) {
    // Simplified correlation calculation
    // In production, this would use real correlation matrices
    let correlatedExposure = 0;
    const correlationThreshold = 0.7;

    // Group highly correlated assets
    const correlatedGroups = await this.getCorrelatedAssetGroups(correlationThreshold);

    for (const group of correlatedGroups) {
      let groupExposure = 0;

      for (const position of positions) {
        if (group.includes(position.symbol)) {
          groupExposure += Math.abs(position.value || position.quantity * position.price);
        }
      }

      if (newOrder && group.includes(newOrder.symbol)) {
        groupExposure += newOrder.quantity * newOrder.price;
      }

      correlatedExposure = Math.max(correlatedExposure, groupExposure);
    }

    return correlatedExposure;
  }

  /**
   * Calculate liquidity metrics
   */
  async calculateLiquidityMetrics(positions, newOrder = null) {
    let liquidAssets = 0;
    let illiquidAssets = 0;
    let totalAssets = 0;
    let liquidityScores = [];

    // Get liquidity scores for assets
    const liquidityData = await this.getLiquidityData();

    for (const position of positions) {
      const value = Math.abs(position.value || position.quantity * position.price);
      const liquidityScore = liquidityData[position.symbol]?.liquidityScore || 0.5;

      totalAssets += value;
      liquidityScores.push(liquidityScore);

      if (liquidityScore > 0.7) {
        liquidAssets += value;
      } else if (liquidityScore < 0.3) {
        illiquidAssets += value;
      }
    }

    if (newOrder) {
      const value = newOrder.quantity * newOrder.price;
      const liquidityScore = liquidityData[newOrder.symbol]?.liquidityScore || 0.5;

      totalAssets += value;
      liquidityScores.push(liquidityScore);

      if (liquidityScore > 0.7) {
        liquidAssets += value;
      } else if (liquidityScore < 0.3) {
        illiquidAssets += value;
      }
    }

    return {
      liquidityRatio: totalAssets > 0 ? liquidAssets / totalAssets : 0,
      illiquidExposure: totalAssets > 0 ? illiquidAssets / totalAssets : 0,
      averageLiquidityScore: liquidityScores.length > 0
        ? liquidityScores.reduce((sum, score) => sum + score, 0) / liquidityScores.length
        : 0
    };
  }

  /**
   * Calculate order rate for account
   */
  async calculateOrderRate(accountId) {
    try {
      // Get orders from last minute
      const oneMinuteAgo = Date.now() - 60000;
      const recentOrders = await this.getRecentOrders(accountId, oneMinuteAgo);

      return recentOrders.length / 60; // Orders per second

    } catch (error) {
      this.logger?.error('Error calculating order rate:', error);
      return 0;
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Handle circuit breaker events
    this.circuitBreaker.on('circuitBreakerTripped', (event) => {
      this.metrics.circuitBreakerTrips++;
      this.emit('circuitBreakerTripped', event);
    });

    // Handle compliance violations
    this.complianceEngine.on('complianceViolation', (event) => {
      this.metrics.complianceViolations++;
      this.complianceViolations.push(event);
      this.emit('complianceViolation', event);
    });

    // Handle position limit violations
    this.positionLimitManager.on('positionLimitViolation', (event) => {
      this.emit('positionLimitViolation', event);
    });
  }

  /**
   * Get enterprise risk dashboard data
   */
  getEnterpriseRiskDashboard() {
    const activeAccounts = Array.from(this.riskMetrics.keys());

    return {
      summary: {
        totalAccounts: activeAccounts.length,
        activeViolations: this.alertHistory.filter(alert =>
          Date.now() - alert.timestamp < 3600000 // Last hour
        ).length,
        circuitBreakerStatus: this.circuitBreaker.getGlobalStatus(),
        systemHealth: this.calculateSystemHealth()
      },
      riskMetrics: Object.fromEntries(this.riskMetrics),
      recentAlerts: this.alertHistory.slice(-50),
      complianceStatus: this.complianceEngine.getComplianceStatus(),
      performance: this.metrics,
      configuration: this.riskConfig
    };
  }

  /**
   * Calculate system health score
   */
  calculateSystemHealth() {
    let healthScore = 100;

    // Deduct for recent violations
    const recentViolations = this.alertHistory.filter(alert =>
      Date.now() - alert.timestamp < 3600000
    ).length;
    healthScore -= recentViolations * 5;

    // Deduct for circuit breaker trips
    if (this.circuitBreaker.getGlobalStatus().isTripped) {
      healthScore -= 30;
    }

    // Deduct for compliance violations
    const recentComplianceViolations = this.complianceViolations.filter(violation =>
      Date.now() - violation.timestamp < 3600000
    ).length;
    healthScore -= recentComplianceViolations * 10;

    return Math.max(healthScore, 0);
  }

  /**
   * Update latency metrics
   */
  updateLatencyMetrics(latency) {
    const total = this.metrics.averageRiskCheckLatency * (this.metrics.totalRiskChecks - 1);
    this.metrics.averageRiskCheckLatency = (total + latency) / this.metrics.totalRiskChecks;
  }

  // Helper methods (simplified implementations)
  async getAccountPositions(accountId) { return []; }
  async getActiveAccounts() { return []; }
  calculatePortfolioValue(positions) { return 0; }
  async getSectorMappings() { return {}; }
  async getCorrelatedAssetGroups(threshold) { return []; }
  async getLiquidityData() { return {}; }
  async getRecentOrders(accountId, since) { return []; }
  async calculatePortfolioReturns(positions) { return []; }
  async sendCriticalAlert(accountId, violation) {}
  async initiateEmergencyLiquidation(accountId, violation) {}
}

module.exports = EnterpriseRiskManager;
