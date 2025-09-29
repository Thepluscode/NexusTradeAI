const EventEmitter = require('events');

// Default configuration
const defaultConfig = {
  logger: console,
  rateLimits: {
    maxOrdersPerMinute: 60,
    maxOrdersPerDay: 1000
  }
};

class RegulatoryChecker extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = {
      ...defaultConfig,
      ...config
    };
    
    this.logger = this.config.logger || console;
    this.isInitialized = false;
    this.suspendedUsers = new Set();
    this.watchlist = new Set();
    this.tradingPatterns = new Map();
    this.dailyTradingVolume = new Map();
    this.orderRateLimits = new Map();
    this.maxOrdersPerMinute = this.config.rateLimits?.maxOrdersPerMinute || 60;
    this.maxOrdersPerDay = this.config.rateLimits?.maxOrdersPerDay || 1000;
    
    // Performance metrics
    this.stats = {
      totalChecks: 0,
      violations: 0,
      warnings: 0,
      avgCheckTime: 0
    };
    
    // Initialize with default regulations if not provided
    this.regulations = this.config.regulations || {
      patternDayTrader: {
        enabled: true,
        dayTradeLimit: 3,
        minimumEquity: 25000,
        lookbackDays: 5
      },
      regT: {
        enabled: true,
        initialMarginRequirement: 0.5,
        dayTradingBuyingPower: 4.0
      },
      positionLimits: {
        enabled: true,
        maxSinglePosition: 0.05, // 5% of outstanding shares
        reportingThreshold: 0.01, // 1% of outstanding shares
        maxSinglePositionSize: 1000000 // $1M per position
      },
      antiManipulation: {
        enabled: true,
        maxOrderRate: 100, // Max orders per minute
        maxCancelRate: 0.5, // Max 50% cancel rate
        layeringDetection: true,
        spoofingDetection: true
      },
      marketMaking: {
        enabled: false,
        minSpreadRequirement: 0.01, // 1% minimum spread
        inventoryLimits: 1000000, // $1M max inventory
        maxPositionSize: 10000 // Max shares per symbol
      },
      tradingHours: {
        enabled: true,
        weekendsAllowed: false,
        holidaysAllowed: false,
        allowedHours: {
          start: '09:30',
          end: '16:00'
        }
      },
      kyc: {
        enabled: true,
        requireVerification: true,
        maxUnverifiedTrading: 1000 // $1000 max for unverified users
      },
      aml: {
        enabled: true,
        dailyVolumeThreshold: 10000, // $10K
        structuringDetection: true
      }
    };
    
    // Initialize timers
    this.dailyResetTimeout = null;
    this.dailyCheckInterval = null;
    this.hourlyCheckInterval = null;
  }

  /**
   * Initialize the regulatory checker
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.logger.info('Initializing RegulatoryChecker...');
      
      // Load any persisted data (e.g., suspended users, watchlist)
      await this.loadPersistedData();
      
      // Start daily reset timer
      this.startDailyReset();
      
      this.isInitialized = true;
      this.emit('initialized');
      this.logger.info('Regulatory checker initialized');
    } catch (error) {
      this.logger.error('Failed to initialize regulatory checker:', error);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    clearTimeout(this.dailyResetTimeout);
    clearInterval(this.dailyCheckInterval);
    clearInterval(this.hourlyCheckInterval);
    this.isInitialized = false;
  }

  /**
   * Load persisted data (e.g., from database)
   */
  async loadPersistedData() {
    // This would load data from a database in production
    // For now, just log that we're loading data
    this.logger.debug('Loading persisted regulatory data');
    
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Load restricted users from database
   */
  async loadRestrictedUsers() {
    // Implementation would load from database
    this.logger.info('Loading restricted users...');
  }

  /**
   * Load user compliance data
   */
  async loadUserComplianceData() {
    try {
      this.logger.info('Loading user compliance data...');
      // Implementation would fetch from database
    } catch (error) {
      this.logger.error('Failed to load user compliance data:', error);
    }
  }

  /**
   * Check if an order complies with all regulations
   * @param {Object} order - The order to check
   * @param {Object} userContext - User context information
   * @returns {Promise<Object>} Compliance check result
   */
  async checkOrder(order, userContext = {}) {
    const startTime = process.hrtime.bigint();
    
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      const userId = userContext.userId || order.userId;
      if (!userId) {
        throw new Error('User ID is required for compliance check');
      }

      // Initialize compliance result
      const complianceResult = {
        orderId: order.id,
        userId,
        passed: true,
        violations: [],
        warnings: [],
        timestamp: new Date(),
        checks: []
      };
      
      // Merge user context with order data
      const fullContext = {
        userId,
        accountType: userContext.accountType || 'cash',
        accountEquity: userContext.accountEquity || 0,
        availableMargin: userContext.availableMargin || 0,
        isMarketMaker: userContext.isMarketMaker || false,
        ...userContext
      };
      
      // Check if user is suspended
      if (this.suspendedUsers.has(userId)) {
        complianceResult.passed = false;
        complianceResult.violations.push('User account is suspended');
        return complianceResult;
      }
      
      // Check if user is on watchlist
      if (this.watchlist.has(userId)) {
        complianceResult.warnings.push('User is on watchlist');
      }
      
      // Perform compliance checks
      await this.checkPatternDayTrader(order, fullContext, complianceResult);
      await this.checkRegTCompliance(order, fullContext, complianceResult);
      await this.checkPositionLimits(order, fullContext, complianceResult);
      await this.checkAntiManipulation(order, fullContext, complianceResult);
      
      // Update statistics
      const checkTime = Number(process.hrtime.bigint() - startTime) / 1000000; // Convert to ms
      this.stats.totalChecks++;
      this.stats.avgCheckTime = (this.stats.avgCheckTime * (this.stats.totalChecks - 1) + checkTime) / this.stats.totalChecks;
      
      if (complianceResult.violations.length > 0) {
        this.stats.violations++;
        complianceResult.passed = false;
      }
      
      if (complianceResult.warnings.length > 0) {
        this.stats.warnings++;
      }
      
      return complianceResult;
      
    } catch (error) {
      this.logger.error('Error checking order compliance:', error);
      return {
        orderId: order.id,
        userId: userContext.userId || order.userId,
        passed: false,
        violations: ['Error performing compliance check'],
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Check pattern day trader rule
   */
  async checkPatternDayTrader(order, userContext, result) {
    if (!this.regulations.patternDayTrader.enabled) return;
    
    // Implementation would check pattern day trader rules
    const check = {
      name: 'patternDayTrader',
      passed: true
    };
    
    // TODO: Implement actual pattern day trader check
    
    result.checks.push(check);
  }

  /**
   * Check Reg T margin requirements
   */
  async checkRegTCompliance(order, userContext, result) {
    if (!this.regulations.regT.enabled) return;
    
    // Implementation would check Reg T requirements
    const check = {
      name: 'regT',
      passed: true
    };
    
    // TODO: Implement actual Reg T check
    
    result.checks.push(check);
  }

  /**
   * Check position limits
   */
  async checkPositionLimits(order, userContext, result) {
    if (!this.regulations.positionLimits.enabled) return;
    
    // Implementation would check position limits
    const check = {
      name: 'positionLimits',
      passed: true
    };
    
    // TODO: Implement actual position limit check
    
    result.checks.push(check);
  }

  /**
   * Check for market manipulation
   */
  async checkAntiManipulation(order, userContext, result) {
    if (!this.regulations.antiManipulation.enabled) return;
    
    // Implementation would check for market manipulation
    const check = {
      name: 'antiManipulation',
      passed: true
    };
    
    // TODO: Implement actual anti-manipulation check
    
    result.checks.push(check);
  }

  /**
   * Start the daily reset timer
   */
  startDailyReset() {
    // Clear any existing timer
    if (this.dailyResetTimeout) {
      clearTimeout(this.dailyResetTimeout);
    }
    
    // Calculate time until midnight
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const timeUntilMidnight = midnight - now;
    
    // Set timer for next midnight
    this.dailyResetTimeout = setTimeout(() => {
      this.resetDailyCounters();
      this.startDailyReset(); // Schedule next reset
    }, timeUntilMidnight);
    
    this.logger.debug(`Scheduled daily reset in ${timeUntilMidnight / 1000 / 60 / 60} hours`);
  }

  /**
   * Reset daily counters
   */
  resetDailyCounters() {
    this.dailyTradingVolume.clear();
    
    // Reset daily counters in rate limits
    for (const [userId, limits] of this.orderRateLimits) {
      limits.dayCount = 0;
    }
    
    this.logger.info('Daily compliance counters reset');
  }

  /**
   * Check if a date is a holiday
   * @param {Date} date - Date to check
   * @returns {boolean} True if the date is a holiday
   */
  isHoliday(date) {
    // Simplified holiday check - would use proper holiday calendar in production
    const holidays = [
      '01-01', // New Year's Day
      '07-04', // Independence Day
      '12-25'  // Christmas
    ];
    
    const monthDay = date.toISOString().substring(5, 10);
    return holidays.includes(monthDay);
  }

  /**
   * Check if a user is KYC verified
   * @param {string} userId - User ID to check
   * @returns {Promise<boolean>} True if user is verified
   */
  async isUserKYCVerified(userId) {
    // This would check with user/auth service
    return true; // Placeholder
  }

  /**
   * Get estimated price for a symbol
   * @param {string} symbol - Symbol to get price for
   * @returns {Promise<number>} Estimated price
   */
  async getEstimatedPrice(symbol) {
    // This would fetch from market data service
    return 100; // Placeholder
  }

  /**
   * Get the current status of the regulatory checker
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      suspendedUsers: this.suspendedUsers.size,
      watchlistUsers: this.watchlist.size,
      trackedPatterns: this.tradingPatterns.size,
      stats: {
        ...this.stats,
        avgCheckTime: parseFloat(this.stats.avgCheckTime.toFixed(2))
      },
      rules: Object.keys(this.regulations).map(rule => ({
        name: rule,
        enabled: this.regulations[rule].enabled
      }))
    };
  }
}

module.exports = RegulatoryChecker;
