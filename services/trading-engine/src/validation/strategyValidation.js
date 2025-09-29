const Joi = require('joi');
const { StrategyValidator } = require('./StrategyValidator');

class StrategyExecutionValidator {
  constructor(options = {}) {
    this.logger = options.logger;
    this.validator = new StrategyValidator(options);
    this.setupSchemas();
  }

  setupSchemas() {
    // Base parameter schema for all strategies
    this.baseParameterSchema = Joi.object({
      // Common parameters that most strategies might use
      timeframe: Joi.string()
        .valid('1m', '5m', '15m', '1h', '4h', '1d', '1w')
        .default('1d'),
      
      // Risk parameters
      stopLoss: Joi.number().min(0).max(100).optional(),
      takeProfit: Joi.number().min(0).max(1000).optional(),
      positionSize: Joi.number().min(0.01).max(100).optional(),
      
      // Strategy specific parameters will be validated per strategy
    }).unknown(true);

    // Schema for strategy execution request
    this.executeSchema = Joi.object({
      strategy: Joi.string().required()
        .description('Name of the strategy to execute'),
      
      symbol: Joi.string().required()
        .pattern(/^[A-Z0-9-]+$/)
        .description('Trading pair symbol (e.g., BTC-USD, AAPL)'),
      
      timeframe: Joi.string()
        .valid('1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d', '1w')
        .default('1d')
        .description('Timeframe for the strategy'),
      
      parameters: Joi.object()
        .default({})
        .description('Strategy-specific parameters'),
      
      riskParameters: Joi.object({
        maxPositionSize: Joi.number().min(0.01).max(100).optional(),
        maxDailyLoss: Joi.number().min(0.1).max(50).optional(),
        maxDrawdown: Joi.number().min(0.1).max(100).optional(),
        maxLeverage: Joi.number().min(1).max(100).optional(),
      }).optional(),
      
      // Advanced options
      dryRun: Joi.boolean().default(false)
        .description('If true, simulates execution without placing real orders'),
      
      callbackUrl: Joi.string().uri().optional()
        .description('Webhook URL to receive execution updates'),
      
      metadata: Joi.object().optional()
        .description('Additional metadata for the execution')
    });

    // Schema for execution status request
    this.statusSchema = Joi.object({
      executionId: Joi.string().required()
        .description('ID of the execution to get status for')
    });

    // Schema for cancel execution request
    this.cancelSchema = Joi.object({
      executionId: Joi.string().required()
        .description('ID of the execution to cancel')
    });

    // Schema for execution history request
    this.historySchema = Joi.object({
      limit: Joi.number().integer().min(1).max(1000).default(50),
      offset: Joi.number().integer().min(0).default(0),
      status: Joi.string().valid('pending', 'running', 'completed', 'failed', 'cancelled'),
      strategy: Joi.string(),
      symbol: Joi.string(),
      startDate: Joi.date().iso(),
      endDate: Joi.date().iso()
    });
  }

  /**
   * Validate strategy execution request
   */
  validateExecuteRequest(data) {
    const { error, value } = this.executeSchema.validate(data, {
      abortEarly: false,
      allowUnknown: false
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return { 
        isValid: false, 
        errors,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR'
      };
    }

    // Additional validation for strategy-specific parameters
    const strategyValidation = this.validateStrategyParameters(
      value.strategy, 
      value.parameters
    );

    if (!strategyValidation.isValid) {
      return strategyValidation;
    }

    return { isValid: true, data: value };
  }

  /**
   * Validate strategy-specific parameters
   */
  validateStrategyParameters(strategyName, parameters) {
    try {
      // Get strategy-specific validation schema if it exists
      const strategy = this.validator.getStrategy(strategyName);
      
      if (!strategy) {
        return {
          isValid: false,
          message: `Unknown strategy: ${strategyName}`,
          code: 'UNKNOWN_STRATEGY'
        };
      }

      // If strategy has a validateParameters method, use it
      if (typeof strategy.validateParameters === 'function') {
        return strategy.validateParameters(parameters);
      }

      // Otherwise, use the base parameter schema
      const { error } = this.baseParameterSchema.validate(parameters, {
        allowUnknown: true
      });

      if (error) {
        const errors = error.details.map(detail => ({
          field: `parameters.${detail.path.join('.')}`,
          message: detail.message,
          type: detail.type
        }));
        
        return { 
          isValid: false, 
          errors,
          message: 'Invalid strategy parameters',
          code: 'INVALID_PARAMETERS'
        };
      }

      return { isValid: true };

    } catch (error) {
      this.logger?.error('Error validating strategy parameters:', error);
      return {
        isValid: false,
        message: 'Failed to validate strategy parameters',
        code: 'VALIDATION_ERROR',
        error: error.message
      };
    }
  }

  /**
   * Validate execution status request
   */
  validateStatusRequest(data) {
    return this._validateWithSchema('status', data);
  }

  /**
   * Validate cancel execution request
   */
  validateCancelRequest(data) {
    return this._validateWithSchema('cancel', data);
  }

  /**
   * Validate execution history request
   */
  validateHistoryRequest(data) {
    return this._validateWithSchema('history', data);
  }

  /**
   * Generic validation with schema
   */
  _validateWithSchema(schemaName, data) {
    const schema = this[`${schemaName}Schema`];
    if (!schema) {
      throw new Error(`Unknown schema: ${schemaName}`);
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: false
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        type: detail.type
      }));
      
      return { 
        isValid: false, 
        errors,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR'
      };
    }

    return { isValid: true, data: value };
  }
}

module.exports = { StrategyExecutionValidator };
