const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { StrategyExecutionValidator } = require('../validation/strategyValidation');

class StrategyExecutionAPI {
  constructor(options = {}) {
    this.router = express.Router();
    this.logger = options.logger;
    this.tradingEngine = options.tradingEngine;
    this.validator = new StrategyExecutionValidator({ logger: options.logger });
    this.setupMiddleware();
    this.setupRoutes();
  }

  getRoutes() {
    return this.router;
  }

  setupMiddleware() {
    // Add request logging
    this.router.use((req, res, next) => {
      const start = Date.now();
      const requestId = uuidv4();
      
      // Add request ID to the request object
      req.requestId = requestId;
      
      // Log request
      this.logger.info(`[${requestId}] ${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        query: req.query,
        params: req.params,
        body: req.method === 'POST' ? req.body : undefined,
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      
      // Add response logging
      const originalSend = res.send;
      res.send = function(data) {
        const responseTime = Date.now() - start;
        
        this.logger.info(`[${requestId}] ${this.statusCode} (${responseTime}ms)`, {
          statusCode: this.statusCode,
          responseTime,
          response: data
        });
        
        originalSend.apply(this, arguments);
      }.bind({ ...res, logger: this.logger });
      
      next();
    });
    
    // Error handling middleware
    this.router.use((err, req, res, next) => {
      const requestId = req.requestId || 'unknown';
      
      this.logger.error(`[${requestId}] Unhandled error:`, {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
      });
      
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          requestId
        });
      }
    });
  }

  setupRoutes() {
    // Execute a trading strategy
    this.router.post('/execute', 
      this.validateRequest('execute'),
      this.executeStrategy.bind(this)
    );
    
    // Get execution status
    this.router.get('/status/:executionId',
      this.validateRequest('status'),
      this.getExecutionStatus.bind(this)
    );
    
    // Cancel a running strategy execution
    this.router.post('/:executionId/cancel',
      this.validateRequest('cancel'),
      this.cancelExecution.bind(this)
    );
    
    // Get execution history
    this.router.get('/history',
      this.validateRequest('history'),
      this.getExecutionHistory.bind(this)
    );
  }
  
  /**
   * Request validation middleware
   */
  validateRequest(validationType) {
    return (req, res, next) => {
      let validationResult;
      
      switch (validationType) {
        case 'execute':
          validationResult = this.validator.validateExecuteRequest(req.body);
          break;
          
        case 'status':
          validationResult = this.validator.validateStatusRequest({
            ...req.params,
            ...req.query
          });
          break;
          
        case 'cancel':
          validationResult = this.validator.validateCancelRequest({
            ...req.params,
            ...req.body
          });
          break;
          
        case 'history':
          validationResult = this.validator.validateHistoryRequest({
            ...req.query,
            limit: parseInt(req.query.limit, 10) || 50,
            offset: parseInt(req.query.offset, 10) || 0
          });
          break;
          
        default:
          return next(new Error(`Unknown validation type: ${validationType}`));
      }
      
      if (!validationResult.isValid) {
        return res.status(400).json({
          success: false,
          error: validationResult.message || 'Validation failed',
          code: validationResult.code || 'VALIDATION_ERROR',
          details: validationResult.errors || [],
          requestId: req.requestId
        });
      }
      
      // Attach validated data to the request object
      req.validatedData = validationResult.data;
      next();
    };
  }

  /**
   * Execute a trading strategy
   */
  /**
   * Execute a trading strategy
   */
  async executeStrategy(req, res) {
    try {
      const { strategy, symbol, timeframe, parameters, riskParameters, dryRun, callbackUrl, metadata } = req.validatedData;
      const userId = req.user?.id; // In a real app, this would come from authentication middleware
      const requestId = req.requestId;
      
      this.logger.info(`[${requestId}] Executing strategy: ${strategy} for ${symbol}`, {
        userId,
        strategy,
        symbol,
        timeframe,
        dryRun,
        parameters
      });

      // Generate unique execution ID
      const executionId = `exec_${uuidv4()}`;
      
      // Log the execution request
      this.logger.info(`[${executionId}] Strategy execution requested`, {
        strategy,
        symbol,
        timeframe,
        userId
      });

      // Get market data (in a real implementation, this would fetch real market data)
      const marketData = await this.getMarketData(symbol, timeframe);
      
      // Create execution context
      const executionContext = {
        id: executionId,
        requestId,
        userId,
        strategy,
        symbol,
        timeframe: timeframe || '1d',
        status: 'pending',
        dryRun: dryRun || false,
        callbackUrl: callbackUrl || null,
        metadata: metadata || {},
        startedAt: new Date(),
        parameters: parameters || {},
        riskParameters: riskParameters || {}
      };

      // Queue the execution for async processing
      this.queueExecution(executionContext, marketData)
        .then(() => {
          this.logger.info(`[${requestId}] Strategy execution queued`, {
            executionId,
            status: 'queued'
          });
        })
        .catch(error => {
          this.logger.error(`[${requestId}] Failed to queue strategy execution`, {
            executionId,
            error: error.message,
            stack: error.stack
          });
        });

      // Return immediate response with execution ID
      res.status(202).json({
        success: true,
        executionId,
        status: 'pending',
        message: 'Strategy execution started',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      this.logger.error('Error executing strategy:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to execute strategy',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Process strategy execution (async)
   */
  /**
   * Queue execution for processing
   */
  async queueExecution(executionContext, marketData) {
    // In a production environment, this would use a proper job queue like Bull or Kue
    // For this example, we'll just process it immediately
    return this.processExecution(executionContext, marketData);
  }

  /**
   * Process strategy execution (async)
   */
  async processExecution(executionContext, marketData) {
    const { id: executionId, requestId, strategy: strategyName, symbol, dryRun } = executionContext;
    
    try {
      // Update status to running
      executionContext.status = 'running';
      executionContext.startedAt = new Date();
      
      // Save the updated execution context
      await this.saveExecution(executionContext);
      
      this.logger.info(`[${requestId}] Starting strategy execution`, {
        executionId,
        strategy: strategyName,
        symbol,
        dryRun
      });
      
      // Get the appropriate strategy
      const strategy = this.tradingEngine.strategies.getStrategy(strategyName);
      if (!strategy) {
        throw new Error(`Strategy not found: ${strategyName}`);
      }

      // Generate trading signal
      const signal = await strategy.generateSignal({
        symbol,
        timeframe: executionContext.timeframe,
        marketData,
        parameters: executionContext.parameters
      });
      
      this.logger.info(`[${requestId}] Generated trading signal`, {
        executionId,
        signal: {
          action: signal.action,
          confidence: signal.confidence,
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit
        }
      });

      // If this is a dry run, log and return without executing
      if (dryRun) {
        this.logger.info(`[${requestId}] Dry run - would execute trade`, {
          executionId,
          signal: signal.action,
          symbol,
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit
        });
        
        executionContext.status = 'completed';
        executionContext.result = {
          executed: false,
          reason: 'dry_run',
          signal: signal.action,
          entry: signal.entry,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit
        };
        
        executionContext.completedAt = new Date();
        executionContext.duration = executionContext.completedAt - executionContext.startedAt;
        
        await this.saveExecution(executionContext);
        await this.notifyCallback(executionContext);
        
        return executionContext;
      }

      // Execute the trade using the execution engine
      const executionResult = await this.tradingEngine.executionEngine.executeSignal(
        signal,
        marketData,
        {
          userId: executionContext.userId,
          riskParameters: executionContext.riskParameters,
          metadata: {
            executionId,
            requestId,
            strategy: strategyName
          }
        }
      );
      
      this.logger.info(`[${requestId}] Trade execution result`, {
        executionId,
        executed: executionResult.executed,
        orderId: executionResult.orderId,
        reason: executionResult.reason
      });

      // Update execution context with results
      executionContext.completedAt = new Date();
      executionContext.duration = executionContext.completedAt - executionContext.startedAt;
      
      if (executionResult.executed) {
        executionContext.status = 'completed';
        executionContext.result = {
          executed: true,
          orderId: executionResult.orderId,
          symbol: executionResult.symbol,
          side: executionResult.side,
          quantity: executionResult.quantity,
          price: executionResult.price,
          pnl: executionResult.pnl,
          fees: executionResult.fees,
          timestamp: executionResult.timestamp
        };
        
        this.logger.info(`[${requestId}] Trade executed successfully`, {
          executionId,
          orderId: executionResult.orderId,
          symbol: executionResult.symbol,
          side: executionResult.side,
          quantity: executionResult.quantity,
          price: executionResult.price
        });
      } else {
        executionContext.status = 'failed';
        executionContext.error = {
          reason: executionResult.reason,
          details: executionResult.details,
          code: executionResult.code || 'EXECUTION_FAILED'
        };
        
        this.logger.warn(`[${requestId}] Trade execution failed`, {
          executionId,
          reason: executionResult.reason,
          details: executionResult.details
        });
      }

      // Save execution to history
      await this.saveExecution(executionContext);
      
      // Notify callback URL if provided
      await this.notifyCallback(executionContext);

      return executionContext;

    } catch (error) {
      executionContext.status = 'failed';
      executionContext.error = {
        message: error.message,
        stack: error.stack
      };
      executionContext.completedAt = new Date();
      executionContext.duration = executionContext.completedAt - executionContext.startedAt;
      
      // Save failed execution
      await this.saveExecution(executionContext);
      
      throw error;
    }
  }

  /**
   * Get execution status
   */
  /**
   * Get execution status
   */
  async getExecutionStatus(req, res) {
    try {
      const { executionId } = req.validatedData;
      const userId = req.user?.id; // In a real app, this would come from auth
      
      this.logger.info(`[${req.requestId}] Getting execution status`, { executionId });
      
      // In a real implementation, this would fetch from a database
      const execution = await this.getExecutionById(executionId);
      
      if (!execution) {
        this.logger.warn(`[${req.requestId}] Execution not found`, { executionId });
        return res.status(404).json({
          success: false,
          error: 'Execution not found',
          code: 'NOT_FOUND',
          requestId: req.requestId
        });
      }

      // Check user permissions
      if (execution.userId !== userId) {
        this.logger.warn(`[${req.requestId}] Unauthorized access to execution`, { 
          executionId, 
          requestedBy: userId,
          owner: execution.userId 
        });
        
        return res.status(403).json({
          success: false,
          error: 'Access denied',
          code: 'FORBIDDEN',
          requestId: req.requestId
        });
      }

      res.json({
        success: true,
        execution
      });

    } catch (error) {
      this.logger.error('Error getting execution status:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get execution status'
      });
    }
  }

  /**
   * Cancel a running execution
   */
  /**
   * Cancel a running execution
   */
  async cancelExecution(req, res) {
    try {
      const { executionId } = req.validatedData;
      const userId = req.user?.id; // In a real app, this would come from auth
      
      this.logger.info(`[${req.requestId}] Canceling execution`, { executionId, userId });
      
      // In a real implementation, this would update the execution status
      // and trigger any necessary cleanup
      const success = await this.cancelExecutionById(executionId, userId);
      
      if (!success) {
        this.logger.warn(`[${req.requestId}] Execution not found or not cancelable`, { 
          executionId,
          userId 
        });
        
        return res.status(404).json({
          success: false,
          error: 'Execution not found or already completed',
          code: 'NOT_CANCELABLE',
          requestId: req.requestId
        });
      }

      res.json({
        success: true,
        message: 'Execution cancelled successfully'
      });

    } catch (error) {
      this.logger.error('Error cancelling execution:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel execution'
      });
    }
  }

  /**
   * Get execution history for the authenticated user
   */
  /**
   * Get execution history for the authenticated user
   */
  async getExecutionHistory(req, res) {
    try {
      const { limit, offset, status, strategy, symbol, startDate, endDate } = req.validatedData;
      const userId = req.user?.id; // In a real app, this would come from auth
      
      this.logger.info(`[${req.requestId}] Getting execution history`, { 
        userId, 
        limit, 
        offset, 
        status 
      });
      
      // In a real implementation, this would query the database with filters
      const { results, total } = await this.getUserExecutions(userId, { 
        limit, 
        offset, 
        status,
        strategy,
        symbol,
        startDate,
        endDate
      });
      
      // Format the response
      const response = {
        success: true,
        data: results,
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + results.length < total
        },
        requestId: req.requestId
      };
      
      res.json(response);

    } catch (error) {
      this.logger.error('Error getting execution history:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get execution history'
      });
    }
  }

  // ============================================
  // Helper Methods
  // ============================================
  
  /**
   * Get market data for a symbol and timeframe
   */
  async getMarketData(symbol, timeframe) {
    // In a real implementation, this would fetch market data from a data provider
    // For now, we'll return mock data
    return {
      symbol,
      timeframe,
      data: [
        // Mock candlestick data
        { timestamp: Date.now() - 3600000, open: 100, high: 105, low: 99, close: 104, volume: 1000 },
        { timestamp: Date.now(), open: 104, high: 106, low: 103, close: 105, volume: 1200 }
      ]
    };
  }
  
  /**
   * Save execution to the database
   */
  async saveExecution(execution) {
    // In a real implementation, this would save to a database
    // For now, we'll just log it
    this.logger.debug('Saving execution', { 
      executionId: execution.id,
      status: execution.status 
    });
    
    return Promise.resolve(execution);
  }
  
  /**
   * Get execution by ID
   */
  async getExecutionById(executionId) {
    // In a real implementation, this would query the database
    return Promise.resolve(null);
  }
  
  /**
   * Cancel an execution by ID
   */
  async cancelExecutionById(executionId, userId) {
    // In a real implementation, this would update the execution status
    // and trigger any necessary cleanup
    return Promise.resolve(false);
  }
  
  /**
   * Get user's execution history with filters
   */
  async getUserExecutions(userId, { limit, offset, status, strategy, symbol, startDate, endDate }) {
    // In a real implementation, this would query the database with filters
    // For now, return an empty array
    return Promise.resolve({ results: [], total: 0 });
  }
  
  /**
   * Notify callback URL about execution status
   */
  async notifyCallback(execution) {
    if (!execution.callbackUrl) {
      return Promise.resolve();
    }
    
    try {
      // In a real implementation, this would make an HTTP request to the callback URL
      this.logger.info(`Notifying callback URL: ${execution.callbackUrl}`, {
        executionId: execution.id,
        status: execution.status
      });
      
      // Example of what the callback would look like:
      /*
      const response = await fetch(execution.callbackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'strategy_execution_update',
          executionId: execution.id,
          status: execution.status,
          result: execution.result,
          error: execution.error,
          metadata: execution.metadata,
          timestamp: new Date().toISOString()
        })
      });
      
      if (!response.ok) {
        throw new Error(`Callback failed with status ${response.status}`);
      }
      */
      
      return Promise.resolve();
    } catch (error) {
      this.logger.error('Error notifying callback URL', {
        executionId: execution.id,
        callbackUrl: execution.callbackUrl,
        error: error.message
      });
      
      // Don't fail the execution if the callback fails
      return Promise.resolve();
    }
  }
}

module.exports = StrategyExecutionAPI;
