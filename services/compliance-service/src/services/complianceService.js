// src/services/complianceService.js
const EventEmitter = require('events');
const ComplianceRule = require('../models/ComplianceRule');
const ComplianceViolation = require('../models/ComplianceViolation');
const AuditLog = require('../models/AuditLog');

class ComplianceService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.rules = new Map();
  }

  async initialize() {
    this.logger?.info('Initializing ComplianceService...');
    await this.loadComplianceRules();
    this.setupEventHandlers();
  }

  async loadComplianceRules() {
    try {
      const rules = await ComplianceRule.find({ active: true });
      
      for (const rule of rules) {
        this.rules.set(rule.id, rule);
      }
      
      this.logger?.info(`Loaded ${rules.length} compliance rules`);
    } catch (error) {
      this.logger?.error('Error loading compliance rules:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Listen for trade events
    this.on('trade_executed', async (data) => {
      await this.validateTrade(data);
    });
    
    // Listen for position changes
    this.on('position_updated', async (data) => {
      await this.validatePositionLimits(data);
    });
    
    // Listen for user actions
    this.on('user_action', async (data) => {
      await this.auditUserAction(data);
    });
  }

  async validateTrade(tradeData) {
    try {
      const violations = [];
      
      for (const [ruleId, rule] of this.rules) {
        if (rule.type === 'trade_validation') {
          const violation = await this.checkTradeRule(tradeData, rule);
          if (violation) {
            violations.push(violation);
          }
        }
      }
      
      if (violations.length > 0) {
        await this.recordViolations(violations);
        this.emit('compliance_violation', { tradeData, violations });
      }
      
      return violations;
      
    } catch (error) {
      this.logger?.error('Error validating trade:', error);
      throw error;
    }
  }

  async checkTradeRule(tradeData, rule) {
    try {
      switch (rule.ruleCode) {
        case 'POSITION_LIMIT':
          return await this.checkPositionLimit(tradeData, rule);
        
        case 'DAILY_TRADING_LIMIT':
          return await this.checkDailyTradingLimit(tradeData, rule);
        
        case 'WASH_SALE':
          return await this.checkWashSale(tradeData, rule);
        
        case 'PATTERN_DAY_TRADER':
          return await this.checkPatternDayTrader(tradeData, rule);
        
        case 'INSIDER_TRADING':
          return await this.checkInsiderTrading(tradeData, rule);
        
        default:
          return null;
      }
    } catch (error) {
      this.logger?.error(`Error checking rule ${rule.ruleCode}:`, error);
      return null;
    }
  }

  async checkPositionLimit(tradeData, rule) {
    // Check if trade would exceed position limits
    const { userId, symbol, quantity, side } = tradeData;
    const maxPosition = rule.parameters.maxPosition;
    
    // Get current position
    const currentPosition = await this.getCurrentPosition(userId, symbol);
    const newQuantity = side === 'buy' ? 
      currentPosition + quantity : 
      currentPosition - quantity;
    
    if (Math.abs(newQuantity) > maxPosition) {
      return {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        severity: rule.severity,
        message: `Position limit exceeded for ${symbol}. Max: ${maxPosition}, Attempted: ${Math.abs(newQuantity)}`,
        tradeData,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  async checkDailyTradingLimit(tradeData, rule) {
    const { userId } = tradeData;
    const maxDailyValue = rule.parameters.maxDailyValue;
    
    // Get today's trading value
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todaysTradingValue = await this.getTradingValueSince(userId, todayStart);
    const tradeValue = tradeData.quantity * tradeData.price;
    
    if (todaysTradingValue + tradeValue > maxDailyValue) {
      return {
        ruleId: rule.id,
        ruleCode: rule.ruleCode,
        severity: rule.severity,
        message: `Daily trading limit exceeded. Max: $${maxDailyValue}, Current: $${todaysTradingValue + tradeValue}`,
        tradeData,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  async checkWashSale(tradeData, rule) {
    const { userId, symbol, side } = tradeData;
    
    if (side !== 'buy') return null; // Only check for buy orders
    
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Check for sell transactions with losses in the last 30 days
    const recentSells = await this.getRecentSells(userId, symbol, thirtyDaysAgo);
    
    for (const sell of recentSells) {
      if (sell.realizedGainLoss < 0) {
        return {
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          severity: rule.severity,
          message: `Potential wash sale detected for ${symbol}`,
          tradeData,
          timestamp: new Date(),
          relatedTrade: sell
        };
      }
    }
    
    return null;
  }

  async checkPatternDayTrader(tradeData, rule) {
    const { userId } = tradeData;
    
    // Check if user made 4 or more day trades in 5 business days
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const dayTrades = await this.getDayTrades(userId, fiveDaysAgo);
    
    if (dayTrades.length >= 4) {
      const accountValue = await this.getAccountValue(userId);
      
      if (accountValue < 25000) {
        return {
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          severity: rule.severity,
          message: `Pattern day trader rule violation. Account value: $${accountValue}, Required: $25,000`,
          tradeData,
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  async checkInsiderTrading(tradeData, rule) {
    const { userId, symbol } = tradeData;
    
    // Check if user has insider status for this symbol
    const insiderStatus = await this.getInsiderStatus(userId, symbol);
    
    if (insiderStatus) {
      // Check for blackout periods, material information, etc.
      const isBlackoutPeriod = await this.isBlackoutPeriod(symbol);
      
      if (isBlackoutPeriod) {
        return {
          ruleId: rule.id,
          ruleCode: rule.ruleCode,
          severity: 'critical',
          message: `Insider trading violation: Trading during blackout period for ${symbol}`,
          tradeData,
          timestamp: new Date()
        };
      }
    }
    
    return null;
  }

  async recordViolations(violations) {
    try {
      for (const violation of violations) {
        const violationRecord = new ComplianceViolation({
          id: require('uuid').v4(),
          ...violation,
          status: 'open',
          createdAt: new Date()
        });
        
        await violationRecord.save();
        
        this.logger?.warn('Compliance violation recorded:', {
          ruleCode: violation.ruleCode,
          severity: violation.severity,
          message: violation.message
        });
      }
    } catch (error) {
      this.logger?.error('Error recording violations:', error);
      throw error;
    }
  }

  async auditUserAction(actionData) {
    try {
      const auditLog = new AuditLog({
        id: require('uuid').v4(),
        userId: actionData.userId,
        action: actionData.action,
        resource: actionData.resource,
        details: actionData.details,
        ipAddress: actionData.ipAddress,
        userAgent: actionData.userAgent,
        timestamp: new Date()
      });
      
      await auditLog.save();
      
    } catch (error) {
      this.logger?.error('Error recording audit log:', error);
    }
  }

  async generateComplianceReport(options = {}) {
    try {
      const { startDate, endDate, userId, ruleTypes } = options;
      
      const query = {};
      if (startDate && endDate) {
        query.createdAt = { $gte: startDate, $lte: endDate };
      }
      if (userId) {
        query['tradeData.userId'] = userId;
      }
      if (ruleTypes && ruleTypes.length > 0) {
        query.ruleCode = { $in: ruleTypes };
      }
      
      const violations = await ComplianceViolation.find(query)
        .sort({ createdAt: -1 });
      
      const summary = {
        totalViolations: violations.length,
        violationsBySeverity: this.groupBySeverity(violations),
        violationsByRule: this.groupByRule(violations),
        violationsByUser: this.groupByUser(violations)
      };
      
      const report = {
        generatedAt: new Date(),
        period: { startDate, endDate },
        summary,
        violations,
        recommendations: this.generateComplianceRecommendations(summary)
      };
      
      this.logger?.info('Compliance report generated', {
        violationsCount: violations.length,
        period: `${startDate} to ${endDate}`
      });
      
      return report;
      
    } catch (error) {
      this.logger?.error('Error generating compliance report:', error);
      throw error;
    }
  }

  groupBySeverity(violations) {
    return violations.reduce((acc, violation) => {
      const severity = violation.severity || 'unknown';
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {});
  }

  groupByRule(violations) {
    return violations.reduce((acc, violation) => {
      const ruleCode = violation.ruleCode || 'unknown';
      acc[ruleCode] = (acc[ruleCode] || 0) + 1;
      return acc;
    }, {});
  }

  groupByUser(violations) {
    return violations.reduce((acc, violation) => {
      const userId = violation.tradeData?.userId || 'unknown';
      acc[userId] = (acc[userId] || 0) + 1;
      return acc;
    }, {});
  }

  generateComplianceRecommendations(summary) {
    const recommendations = [];
    
    if (summary.violationsBySeverity.critical > 0) {
      recommendations.push({
        priority: 'high',
        category: 'Risk Management',
        message: 'Critical violations detected. Immediate review and action required.'
      });
    }
    
    if (summary.totalViolations > 100) {
      recommendations.push({
        priority: 'medium',
        category: 'Process Improvement',
        message: 'High volume of violations suggests need for enhanced controls and training.'
      });
    }
    
    return recommendations;
  }

  // Helper methods (mock implementations)
  async getCurrentPosition(userId, symbol) {
    // Would integrate with portfolio service
    return 0;
  }

  async getTradingValueSince(userId, date) {
    // Would integrate with trading service
    return 0;
  }

  async getRecentSells(userId, symbol, date) {
    // Would integrate with trading service
    return [];
  }

  async getDayTrades(userId, date) {
    // Would integrate with trading service
    return [];
  }

  async getAccountValue(userId) {
    // Would integrate with portfolio service
    return 50000;
  }

  async getInsiderStatus(userId, symbol) {
    // Would check insider database
    return false;
  }

  async isBlackoutPeriod(symbol) {
    // Would check earnings calendar and blackout periods
    return false;
  }
}

module.exports = ComplianceService;