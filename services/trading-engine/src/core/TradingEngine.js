const EventEmitter = require('events');
const OrderManager = require('../execution/orderManager');
const MatchingEngine = require('../matching/matchingEngine');
const RiskCalculator = require('../risk/riskCalculator');
const PositionManager = require('../risk/positionManager');
const ComplianceChecker = require('../compliance/regulatoryChecker');
const SmartOrderRouter = require('../execution/smartOrderRouter');
const SlippageOptimizer = require('../execution/slippageOptimizer');
const Order = require('../models/Order');
const Trade = require('../models/Trade');
const Position = require('../models/Position');

class TradingEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.isRunning = false;
    this.acceptingOrders = false;
    
    // Core components
    this.orderManager = null;
    this.matchingEngine = null;
    this.riskCalculator = null;
    this.positionManager = null;
    this.complianceChecker = null;
    this.smartOrderRouter = null;
    this.slippageOptimizer = null;
    
    // Performance tracking
    this.orderQueue = [];
    this.processingOrders = false;
    this.maxQueueSize = 10000;
    this.batchSize = 100;
    this.processInterval = 1; // 1ms
    
    // Risk limits
    this.globalRiskLimits = {
      maxPositionValue: 1000000, // $1M
      maxDailyLoss: 100000,      // $100K
      maxLeverage: 10,
      maxOrderValue: 50000       // $50K per order
    };
    
    // Circuit breakers
    this.circuitBreaker = {
      isTripped: false,
      errorThreshold: 100,
      errorCount: 0,
      resetTime: 30000 // 30 seconds
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing Trading Engine components...');
      
      // Initialize core components
      this.orderManager = new OrderManager({
        logger: this.logger,
        metrics: this.metrics
      });
      
      this.matchingEngine = new MatchingEngine({
        logger: this.logger,
        metrics: this.metrics
      });
      
      this.riskCalculator = new RiskCalculator({
        logger: this.logger,
        limits: this.globalRiskLimits
      });
      
      this.positionManager = new PositionManager({
        logger: this.logger,
        metrics: this.metrics
      });
      
      this.complianceChecker = new ComplianceChecker({
        logger: this.logger
      });
      
      this.smartOrderRouter = new SmartOrderRouter({
        logger: this.logger
      });
      
      this.slippageOptimizer = new SlippageOptimizer({
        logger: this.logger
      });
      
      // Initialize all components
      await Promise.all([
        this.orderManager.initialize(),
        this.matchingEngine.initialize(),
        this.riskCalculator.initialize(),
        this.positionManager.initialize(),
        this.complianceChecker.initialize(),
        this.smartOrderRouter.initialize(),
        this.slippageOptimizer.initialize()
      ]);
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Start order processing
      this.startOrderProcessing();
      
      this.isRunning = true;
      this.acceptingOrders = true;
      
      this.logger?.info('Trading Engine initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize Trading Engine:', error);
      throw error;
    }
  }

  setupEventHandlers() {
    // Order events
    this.orderManager.on('order_created', (order) => {
      this.emit('order_created', order);
      this.updateMetrics('order_created', order);
    });
    
    this.orderManager.on('order_filled', (fill) => {
      this.emit('order_filled', fill);
      this.updateMetrics('order_filled', fill);
      this.updatePositions(fill);
    });
    
    this.orderManager.on('order_cancelled', (order) => {
      this.emit('order_cancelled', order);
      this.updateMetrics('order_cancelled', order);
    });
    
    // Risk events
    this.riskCalculator.on('risk_limit_exceeded', (event) => {
      this.logger?.warn('Risk limit exceeded:', event);
      this.handleRiskEvent(event);
    });
    
    this.riskCalculator.on('margin_call', (event) => {
      this.logger?.warn('Margin call triggered:', event);
      this.handleMarginCall(event);
    });
    
    // Compliance events
    this.complianceChecker.on('compliance_violation', (event) => {
      this.logger?.error('Compliance violation:', event);
      this.handleComplianceViolation(event);
    });
    
    // Circuit breaker events
    this.on('circuit_breaker_tripped', () => {
      this.logger?.error('Circuit breaker tripped - stopping order acceptance');
      this.acceptingOrders = false;
      
      setTimeout(() => {
        this.resetCircuitBreaker();
      }, this.circuitBreaker.resetTime);
    });
  }

  async submitOrder(orderData) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Check if accepting orders
      if (!this.acceptingOrders) {
        throw new Error('Trading engine not accepting orders');
      }
      
      // Validate order
      const validation = await this.validateOrder(orderData);
      if (!validation.valid) {
        throw new Error(`Order validation failed: ${validation.error}`);
      }
      
      // Create order object
      const order = await this.orderManager.createOrder(orderData);
      
      // Pre-trade risk check
      const riskCheck = await this.riskCalculator.preTradeRiskCheck(order);
      if (!riskCheck.approved) {
        await this.orderManager.rejectOrder(order.id, riskCheck.reason);
        throw new Error(`Risk check failed: ${riskCheck.reason}`);
      }
      
      // Compliance check
      const complianceCheck = await this.complianceChecker.checkOrder(order);
      if (!complianceCheck.approved) {
        await this.orderManager.rejectOrder(order.id, complianceCheck.reason);
        throw new Error(`Compliance check failed: ${complianceCheck.reason}`);
      }
      
      // Add to processing queue
      this.addToQueue(order);
      
      // Record execution latency
      const executionTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.metrics?.executionLatency.observe(
        { order_type: order.type, symbol: order.symbol },
        executionTime / 1000
      );
      
      return {
        success: true,
        orderId: order.id,
        status: order.status,
        executionTime: `${executionTime.toFixed(3)}ms`
      };
      
    } catch (error) {
      this.handleError(error, 'submitOrder');
      throw error;
    }
  }

  async validateOrder(orderData) {
    try {
      // Basic validation
      if (!orderData.symbol || !orderData.side || !orderData.quantity) {
        return { valid: false, error: 'Missing required fields' };
      }
      
      if (!['buy', 'sell'].includes(orderData.side)) {
        return { valid: false, error: 'Invalid order side' };
      }
      
      if (!['market', 'limit', 'stop', 'stop_limit'].includes(orderData.type)) {
        return { valid: false, error: 'Invalid order type' };
      }
      
      if (orderData.quantity <= 0) {
        return { valid: false, error: 'Quantity must be positive' };
      }
      
      if (orderData.type === 'limit' && (!orderData.price || orderData.price <= 0)) {
        return { valid: false, error: 'Limit orders require positive price' };
      }
      
      // Order value check
      const estimatedValue = orderData.quantity * (orderData.price || await this.getMarketPrice(orderData.symbol));
      if (estimatedValue > this.globalRiskLimits.maxOrderValue) {
        return { valid: false, error: 'Order value exceeds maximum limit' };
      }
      
      return { valid: true };
      
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  addToQueue(order) {
    if (this.orderQueue.length >= this.maxQueueSize) {
      throw new Error('Order queue is full');
    }
    
    this.orderQueue.push({
      order,
      timestamp: Date.now(),
      priority: this.calculateOrderPriority(order)
    });
    
    // Sort by priority (higher priority first)
    this.orderQueue.sort((a, b) => b.priority - a.priority);
  }

  calculateOrderPriority(order) {
    let priority = 0;
    
    // Market orders have highest priority
    if (order.type === 'market') priority += 100;
    
    // Larger orders have higher priority
    priority += Math.min(order.quantity / 1000, 50);
    
    // VIP users get higher priority
    if (order.userId && order.userTier === 'vip') priority += 25;
    
    return priority;
  }

  startOrderProcessing() {
    setInterval(async () => {
      if (this.processingOrders || this.orderQueue.length === 0) {
        return;
      }
      
      this.processingOrders = true;
      
      try {
        const batch = this.orderQueue.splice(0, this.batchSize);
        await this.processBatch(batch);
      } catch (error) {
        this.handleError(error, 'orderProcessing');
      } finally {
        this.processingOrders = false;
      }
    }, this.processInterval);
  }

  async processBatch(batch) {
    const promises = batch.map(({ order }) => this.processOrder(order));
    await Promise.allSettled(promises);
  }

  async processOrder(order) {
    try {
      this.logger?.debug(`Processing order ${order.id}`, {
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        type: order.type
      });
      
      // Determine execution strategy
      const strategy = await this.smartOrderRouter.determineStrategy(order);
      
      // Optimize for slippage
      const optimizedOrder = await this.slippageOptimizer.optimize(order, strategy);
      
      // Execute order
      let result;
      if (strategy.type === 'internal') {
        result = await this.matchingEngine.processOrder(optimizedOrder);
      } else {
        result = await this.smartOrderRouter.routeOrder(optimizedOrder, strategy);
      }
      
      // Update order status
      await this.orderManager.updateOrderStatus(order.id, result.status, result);
      
      // Post-trade risk check
      if (result.fills && result.fills.length > 0) {
        await this.riskCalculator.postTradeRiskCheck(order, result.fills);
      }
      
      return result;
      
    } catch (error) {
      this.logger?.error(`Error processing order ${order.id}:`, error);
      await this.orderManager.updateOrderStatus(order.id, 'failed', { error: error.message });
      throw error;
    }
  }

  async cancelOrder(orderId, userId) {
    try {
      const order = await this.orderManager.getOrder(orderId);
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      if (order.userId !== userId) {
        throw new Error('Unauthorized to cancel this order');
      }
      
      if (!['pending', 'partial'].includes(order.status)) {
        throw new Error('Order cannot be cancelled in current status');
      }
      
      // Cancel in matching engine
      await this.matchingEngine.cancelOrder(orderId);
      
      // Update order status
      await this.orderManager.updateOrderStatus(orderId, 'cancelled');
      
      return {
        success: true,
        orderId,
        status: 'cancelled'
      };
      
    } catch (error) {
      this.handleError(error, 'cancelOrder');
      throw error;
    }
  }

  async getOrderBook(symbol, depth = 20) {
    try {
      return await this.matchingEngine.getOrderBook(symbol, depth);
    } catch (error) {
      this.handleError(error, 'getOrderBook');
      throw error;
    }
  }

  async getPositions(userId) {
    try {
      return await this.positionManager.getUserPositions(userId);
    } catch (error) {
      this.handleError(error, 'getPositions');
      throw error;
    }
  }

  async getRiskMetrics(userId) {
    try {
      return await this.riskCalculator.calculateRiskMetrics(userId);
    } catch (error) {
      this.handleError(error, 'getRiskMetrics');
      throw error;
    }
  }

  async updatePositions(fill) {
    try {
      await this.positionManager.updatePosition(fill);
      
      // Update position metrics
      const position = await this.positionManager.getPosition(fill.userId, fill.symbol);
      if (position) {
        this.metrics?.positionValue.set(
          { symbol: fill.symbol, side: position.side },
          position.marketValue
        );
      }
    } catch (error) {
      this.logger?.error('Error updating positions:', error);
    }
  }

  updateMetrics(eventType, data) {
    try {
      switch (eventType) {
        case 'order_created':
          this.metrics?.orderCounter.inc({
            type: data.type,
            side: data.side,
            status: 'created',
            symbol: data.symbol
          });
          break;
          
        case 'order_filled':
          this.metrics?.orderCounter.inc({
            type: data.orderType,
            side: data.side,
            status: 'filled',
            symbol: data.symbol
          });
          break;
          
        case 'order_cancelled':
          this.metrics?.orderCounter.inc({
            type: data.type,
            side: data.side,
            status: 'cancelled',
            symbol: data.symbol
          });
          break;
      }
    } catch (error) {
      this.logger?.error('Error updating metrics:', error);
    }
  }

  handleError(error, context) {
    this.circuitBreaker.errorCount++;
    
    if (this.circuitBreaker.errorCount >= this.circuitBreaker.errorThreshold) {
      this.emit('circuit_breaker_tripped');
    }
    
    this.logger?.error(`Trading Engine error in ${context}:`, {
      error: error.message,
      stack: error.stack,
      context,
      errorCount: this.circuitBreaker.errorCount
    });
  }

  resetCircuitBreaker() {
    this.circuitBreaker.isTripped = false;
    this.circuitBreaker.errorCount = 0;
    this.acceptingOrders = true;
    this.logger?.info('Circuit breaker reset - accepting orders again');
  }

  async handleRiskEvent(event) {
    this.logger?.warn('Handling risk event:', event);
    
    if (event.severity === 'high') {
      // Stop accepting new orders temporarily
      this.acceptingOrders = false;
      
      setTimeout(() => {
        this.acceptingOrders = true;
      }, 60000); // 1 minute cooldown
    }
  }

  async handleMarginCall(event) {
    this.logger?.warn('Handling margin call:', event);
    
    // Notify risk management
    this.emit('margin_call', event);
    
    // Potentially liquidate positions if automated liquidation is enabled
    if (process.env.AUTO_LIQUIDATION === 'true') {
      await this.positionManager.liquidatePositions(event.userId, event.requiredAmount);
    }
  }

  async handleComplianceViolation(event) {
    this.logger?.error('Handling compliance violation:', event);
    
    // Stop accepting orders from this user
    await this.complianceChecker.suspendUser(event.userId, event.reason);
    
    // Cancel pending orders if required
    if (event.cancelOrders) {
      await this.orderManager.cancelUserOrders(event.userId);
    }
  }

  async getMarketPrice(symbol) {
    // This would typically fetch from market data service
    // For now, return a placeholder
    return 100.0;
  }

  async stopAcceptingOrders() {
    this.acceptingOrders = false;
    this.logger?.info('Stopped accepting new orders');
  }

  async processRemainingOrders() {
    this.logger?.info(`Processing ${this.orderQueue.length} remaining orders`);
    
    while (this.orderQueue.length > 0) {
      const batch = this.orderQueue.splice(0, this.batchSize);
      await this.processBatch(batch);
    }
    
    this.logger?.info('All remaining orders processed');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      acceptingOrders: this.acceptingOrders,
      queueSize: this.orderQueue.length,
      circuitBreaker: this.circuitBreaker,
      components: {
        orderManager: this.orderManager?.getStatus(),
        matchingEngine: this.matchingEngine?.getStatus(),
        riskCalculator: this.riskCalculator?.getStatus(),
        positionManager: this.positionManager?.getStatus()
      }
    };
  }
}

module.exports = TradingEngine;