// Live Order Manager - Production Trading Execution
// Handles real money trading with multiple broker integrations and institutional-grade execution

const EventEmitter = require('events');
const AlpacaBroker = require('./brokers/AlpacaBroker');
const InteractiveBrokersBroker = require('./brokers/InteractiveBrokersBroker');
const FIXGateway = require('./brokers/FIXGateway');
const OrderValidator = require('./OrderValidator');
const RiskManager = require('./RiskManager');

class LiveOrderManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.redis = options.redis;
    this.database = options.database;
    
    // Initialize brokers
    this.brokers = new Map();
    this.initializeBrokers(options.brokerConfigs || {});
    
    // Order management
    this.activeOrders = new Map();
    this.orderHistory = new Map();
    this.executionQueue = [];
    this.isProcessing = false;
    
    // Risk and validation
    this.orderValidator = new OrderValidator(options);
    this.riskManager = new RiskManager(options);
    
    // Performance tracking
    this.executionMetrics = {
      totalOrders: 0,
      successfulOrders: 0,
      failedOrders: 0,
      averageLatency: 0,
      totalVolume: 0,
      slippageStats: {
        average: 0,
        maximum: 0,
        samples: []
      }
    };
    
    // Configuration for live trading
    this.config = {
      maxOrdersPerSecond: 100,
      maxSlippageTolerance: 0.005, // 0.5%
      orderTimeoutMs: 30000, // 30 seconds
      retryAttempts: 3,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 0.1, // 10% failure rate
      ...options.config
    };
    
    this.startOrderProcessor();
    this.logger?.info('🔥 Live Order Manager initialized for production trading');
  }

  /**
   * Initialize broker connections
   */
  initializeBrokers(brokerConfigs) {
    // Alpaca (US Stocks, Crypto)
    if (brokerConfigs.alpaca) {
      this.brokers.set('alpaca', new AlpacaBroker({
        ...brokerConfigs.alpaca,
        logger: this.logger
      }));
    }
    
    // Interactive Brokers (Global Markets)
    if (brokerConfigs.interactiveBrokers) {
      this.brokers.set('ib', new InteractiveBrokersBroker({
        ...brokerConfigs.interactiveBrokers,
        logger: this.logger
      }));
    }
    
    // FIX Gateway (Institutional)
    if (brokerConfigs.fix) {
      this.brokers.set('fix', new FIXGateway({
        ...brokerConfigs.fix,
        logger: this.logger
      }));
    }
    
    this.logger?.info(`Initialized ${this.brokers.size} broker connections`);
  }

  /**
   * Execute live order with smart routing
   */
  async executeLiveOrder(orderRequest, accountId, userId) {
    try {
      const orderId = `live_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Validate order
      const validation = await this.orderValidator.validateOrder(orderRequest, accountId);
      if (!validation.isValid) {
        throw new Error(`Order validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Risk check
      const riskCheck = await this.riskManager.checkOrderRisk(orderRequest, accountId, userId);
      if (!riskCheck.approved) {
        throw new Error(`Risk check failed: ${riskCheck.reason}`);
      }
      
      // Create order object
      const order = {
        id: orderId,
        accountId,
        userId,
        symbol: orderRequest.symbol,
        side: orderRequest.side,
        quantity: orderRequest.quantity,
        orderType: orderRequest.orderType,
        price: orderRequest.price,
        stopPrice: orderRequest.stopPrice,
        timeInForce: orderRequest.timeInForce || 'DAY',
        
        // Execution details
        broker: null,
        brokerOrderId: null,
        status: 'PENDING',
        submittedAt: new Date(),
        executedAt: null,
        
        // Fill information
        fills: [],
        executedQuantity: 0,
        averagePrice: 0,
        commission: 0,
        
        // Performance tracking
        requestedPrice: orderRequest.price,
        slippage: 0,
        latency: 0,
        
        // Risk management
        stopLoss: orderRequest.stopLoss,
        takeProfit: orderRequest.takeProfit,
        strategy: orderRequest.strategy || 'Manual',
        
        // Metadata
        clientOrderId: orderRequest.clientOrderId,
        tags: orderRequest.tags || []
      };
      
      // Select optimal broker
      const broker = await this.selectOptimalBroker(order);
      if (!broker) {
        throw new Error('No suitable broker available for this order');
      }
      
      order.broker = broker.name;
      
      // Store order
      this.activeOrders.set(orderId, order);
      
      // Add to execution queue
      this.executionQueue.push({
        order,
        broker,
        attempts: 0,
        priority: this.calculateOrderPriority(order)
      });
      
      // Sort queue by priority
      this.executionQueue.sort((a, b) => b.priority - a.priority);
      
      this.logger?.info(`Queued live order ${orderId}: ${order.side} ${order.quantity} ${order.symbol}`);
      this.emit('orderQueued', { orderId, order });
      
      return {
        success: true,
        orderId,
        status: 'QUEUED',
        estimatedExecution: this.estimateExecutionTime()
      };
      
    } catch (error) {
      this.logger?.error('Error executing live order:', error);
      this.executionMetrics.failedOrders++;
      
      return {
        success: false,
        error: error.message,
        code: this.getErrorCode(error)
      };
    }
  }

  /**
   * Process execution queue
   */
  async startOrderProcessor() {
    setInterval(async () => {
      if (this.isProcessing || this.executionQueue.length === 0) return;
      
      this.isProcessing = true;
      
      try {
        // Process orders with rate limiting
        const maxOrders = Math.min(
          this.config.maxOrdersPerSecond,
          this.executionQueue.length
        );
        
        const ordersToProcess = this.executionQueue.splice(0, maxOrders);
        
        // Execute orders in parallel
        const executions = ordersToProcess.map(item => 
          this.processOrderExecution(item)
        );
        
        await Promise.allSettled(executions);
        
      } catch (error) {
        this.logger?.error('Error in order processor:', error);
      } finally {
        this.isProcessing = false;
      }
    }, 1000); // Process every second
  }

  /**
   * Process individual order execution
   */
  async processOrderExecution(queueItem) {
    const { order, broker, attempts } = queueItem;
    const startTime = Date.now();
    
    try {
      // Check circuit breaker
      if (this.config.enableCircuitBreaker && this.isCircuitBreakerTripped()) {
        throw new Error('Circuit breaker activated - trading halted');
      }
      
      // Execute order through broker
      order.status = 'SUBMITTING';
      this.emit('orderStatusUpdate', { orderId: order.id, status: 'SUBMITTING' });
      
      const execution = await broker.submitOrder(order);
      
      if (execution.success) {
        order.brokerOrderId = execution.brokerOrderId;
        order.status = 'SUBMITTED';
        order.submittedAt = new Date();
        
        // Start monitoring for fills
        this.monitorOrderFills(order, broker);
        
        this.logger?.info(`Successfully submitted order ${order.id} to ${broker.name}`);
        this.emit('orderSubmitted', { orderId: order.id, brokerOrderId: execution.brokerOrderId });
        
      } else {
        throw new Error(execution.error || 'Order submission failed');
      }
      
    } catch (error) {
      this.logger?.error(`Order execution failed for ${order.id}:`, error);
      
      // Retry logic
      if (attempts < this.config.retryAttempts) {
        queueItem.attempts++;
        queueItem.priority -= 10; // Lower priority for retries
        
        // Add back to queue with delay
        setTimeout(() => {
          this.executionQueue.push(queueItem);
          this.executionQueue.sort((a, b) => b.priority - a.priority);
        }, 1000 * attempts); // Exponential backoff
        
        this.logger?.info(`Retrying order ${order.id} (attempt ${attempts + 1})`);
        
      } else {
        // Mark as failed
        order.status = 'FAILED';
        order.errorMessage = error.message;
        this.activeOrders.delete(order.id);
        this.storeOrderHistory(order);
        
        this.executionMetrics.failedOrders++;
        this.emit('orderFailed', { orderId: order.id, error: error.message });
      }
    } finally {
      // Update latency metrics
      const latency = Date.now() - startTime;
      order.latency = latency;
      this.updateLatencyMetrics(latency);
    }
  }

  /**
   * Monitor order fills in real-time
   */
  async monitorOrderFills(order, broker) {
    const checkInterval = setInterval(async () => {
      try {
        const status = await broker.getOrderStatus(order.brokerOrderId);
        
        if (status.fills && status.fills.length > 0) {
          // Process new fills
          const newFills = status.fills.filter(fill => 
            !order.fills.some(existingFill => existingFill.id === fill.id)
          );
          
          for (const fill of newFills) {
            order.fills.push(fill);
            order.executedQuantity += fill.quantity;
            order.commission += fill.commission || 0;
            
            // Calculate average price
            const totalValue = order.fills.reduce((sum, f) => sum + (f.price * f.quantity), 0);
            order.averagePrice = totalValue / order.executedQuantity;
            
            // Calculate slippage
            if (order.requestedPrice) {
              order.slippage = Math.abs(order.averagePrice - order.requestedPrice) / order.requestedPrice;
              this.updateSlippageMetrics(order.slippage);
            }
            
            this.emit('orderFill', { 
              orderId: order.id, 
              fill, 
              executedQuantity: order.executedQuantity,
              averagePrice: order.averagePrice 
            });
          }
        }
        
        // Check if order is complete
        if (status.status === 'FILLED' || order.executedQuantity >= order.quantity) {
          order.status = 'FILLED';
          order.executedAt = new Date();
          
          // Set up stop-loss and take-profit if specified
          if (order.stopLoss || order.takeProfit) {
            await this.setupProtectiveOrders(order);
          }
          
          this.activeOrders.delete(order.id);
          this.storeOrderHistory(order);
          this.executionMetrics.successfulOrders++;
          this.executionMetrics.totalVolume += order.executedQuantity * order.averagePrice;
          
          clearInterval(checkInterval);
          this.emit('orderFilled', { orderId: order.id, order });
          
        } else if (status.status === 'CANCELLED' || status.status === 'REJECTED') {
          order.status = status.status;
          order.errorMessage = status.reason;
          
          this.activeOrders.delete(order.id);
          this.storeOrderHistory(order);
          
          clearInterval(checkInterval);
          this.emit('orderCancelled', { orderId: order.id, reason: status.reason });
        }
        
      } catch (error) {
        this.logger?.error(`Error monitoring order ${order.id}:`, error);
      }
    }, 1000); // Check every second
    
    // Timeout after configured time
    setTimeout(() => {
      if (order.status === 'SUBMITTED') {
        clearInterval(checkInterval);
        this.cancelOrder(order.id, 'Timeout');
      }
    }, this.config.orderTimeoutMs);
  }

  /**
   * Select optimal broker for order execution
   */
  async selectOptimalBroker(order) {
    const availableBrokers = [];

    for (const [name, broker] of this.brokers) {
      try {
        // Check if broker supports the symbol
        if (!await broker.supportsSymbol(order.symbol)) continue;

        // Check broker availability and latency
        const health = await broker.getHealthStatus();
        if (!health.isHealthy) continue;

        // Get execution cost estimate
        const cost = await broker.estimateExecutionCost(order);

        availableBrokers.push({
          name,
          broker,
          latency: health.latency,
          cost: cost.totalCost,
          liquidity: cost.liquidity,
          score: this.calculateBrokerScore(health, cost, order)
        });

      } catch (error) {
        this.logger?.warn(`Broker ${name} unavailable:`, error.message);
      }
    }

    if (availableBrokers.length === 0) return null;

    // Sort by score (higher is better)
    availableBrokers.sort((a, b) => b.score - a.score);

    return availableBrokers[0].broker;
  }

  /**
   * Calculate broker selection score
   */
  calculateBrokerScore(health, cost, order) {
    let score = 100;

    // Latency penalty (lower is better)
    score -= health.latency * 0.1;

    // Cost penalty (lower is better)
    score -= cost.totalCost * 1000;

    // Liquidity bonus (higher is better)
    score += cost.liquidity * 10;

    // Reliability bonus
    score += health.reliability * 20;

    // Order size consideration
    if (order.quantity * (order.price || 100) > 100000) { // Large orders
      score += cost.liquidity * 5; // Prefer high liquidity
    }

    return Math.max(score, 0);
  }

  /**
   * Calculate order priority for queue
   */
  calculateOrderPriority(order) {
    let priority = 50; // Base priority

    // Market orders get higher priority
    if (order.orderType === 'MARKET') priority += 20;

    // Large orders get higher priority
    const orderValue = order.quantity * (order.price || 100);
    if (orderValue > 100000) priority += 15;
    if (orderValue > 1000000) priority += 25;

    // Stop-loss orders get highest priority
    if (order.orderType === 'STOP' || order.orderType === 'STOP_LIMIT') {
      priority += 30;
    }

    // AI strategy orders get bonus
    if (order.strategy && order.strategy.includes('AI')) {
      priority += 10;
    }

    return priority;
  }

  /**
   * Setup protective orders (stop-loss, take-profit)
   */
  async setupProtectiveOrders(parentOrder) {
    try {
      const protectiveOrders = [];

      // Create stop-loss order
      if (parentOrder.stopLoss) {
        const stopLossOrder = {
          symbol: parentOrder.symbol,
          side: parentOrder.side === 'BUY' ? 'SELL' : 'BUY',
          quantity: parentOrder.executedQuantity,
          orderType: 'STOP',
          stopPrice: parentOrder.stopLoss,
          timeInForce: 'GTC',
          parentOrderId: parentOrder.id,
          strategy: parentOrder.strategy,
          tags: [...(parentOrder.tags || []), 'STOP_LOSS']
        };

        const stopResult = await this.executeLiveOrder(stopLossOrder, parentOrder.accountId, parentOrder.userId);
        if (stopResult.success) {
          protectiveOrders.push({ type: 'STOP_LOSS', orderId: stopResult.orderId });
        }
      }

      // Create take-profit order
      if (parentOrder.takeProfit) {
        const takeProfitOrder = {
          symbol: parentOrder.symbol,
          side: parentOrder.side === 'BUY' ? 'SELL' : 'BUY',
          quantity: parentOrder.executedQuantity,
          orderType: 'LIMIT',
          price: parentOrder.takeProfit,
          timeInForce: 'GTC',
          parentOrderId: parentOrder.id,
          strategy: parentOrder.strategy,
          tags: [...(parentOrder.tags || []), 'TAKE_PROFIT']
        };

        const profitResult = await this.executeLiveOrder(takeProfitOrder, parentOrder.accountId, parentOrder.userId);
        if (profitResult.success) {
          protectiveOrders.push({ type: 'TAKE_PROFIT', orderId: profitResult.orderId });
        }
      }

      // Store protective order relationships
      if (protectiveOrders.length > 0) {
        parentOrder.protectiveOrders = protectiveOrders;
        this.emit('protectiveOrdersCreated', {
          parentOrderId: parentOrder.id,
          protectiveOrders
        });
      }

    } catch (error) {
      this.logger?.error('Error setting up protective orders:', error);
    }
  }

  /**
   * Cancel live order
   */
  async cancelOrder(orderId, reason = 'User requested') {
    try {
      const order = this.activeOrders.get(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.status === 'FILLED' || order.status === 'CANCELLED') {
        throw new Error('Order cannot be cancelled');
      }

      // Cancel with broker
      if (order.brokerOrderId && order.broker) {
        const broker = this.brokers.get(order.broker);
        if (broker) {
          await broker.cancelOrder(order.brokerOrderId);
        }
      }

      order.status = 'CANCELLED';
      order.cancelReason = reason;
      order.cancelledAt = new Date();

      this.activeOrders.delete(orderId);
      this.storeOrderHistory(order);

      this.emit('orderCancelled', { orderId, reason });

      return { success: true, message: 'Order cancelled successfully' };

    } catch (error) {
      this.logger?.error('Error cancelling order:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get order status
   */
  getOrderStatus(orderId) {
    const order = this.activeOrders.get(orderId);
    if (!order) {
      // Check history
      const historical = this.orderHistory.get(orderId);
      return historical ? { ...historical, isHistorical: true } : null;
    }

    return {
      id: order.id,
      status: order.status,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      executedQuantity: order.executedQuantity,
      averagePrice: order.averagePrice,
      commission: order.commission,
      slippage: order.slippage,
      latency: order.latency,
      submittedAt: order.submittedAt,
      executedAt: order.executedAt,
      fills: order.fills
    };
  }

  /**
   * Store order in history
   */
  async storeOrderHistory(order) {
    try {
      this.orderHistory.set(order.id, { ...order });

      // Persist to database
      if (this.database) {
        await this.database.orders.create({
          id: order.id,
          accountId: order.accountId,
          userId: order.userId,
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          orderType: order.orderType,
          status: order.status,
          executedQuantity: order.executedQuantity,
          averagePrice: order.averagePrice,
          commission: order.commission,
          slippage: order.slippage,
          latency: order.latency,
          submittedAt: order.submittedAt,
          executedAt: order.executedAt,
          strategy: order.strategy,
          fills: JSON.stringify(order.fills),
          metadata: JSON.stringify({
            broker: order.broker,
            brokerOrderId: order.brokerOrderId,
            tags: order.tags,
            protectiveOrders: order.protectiveOrders
          })
        });
      }

    } catch (error) {
      this.logger?.error('Error storing order history:', error);
    }
  }

  /**
   * Update performance metrics
   */
  updateLatencyMetrics(latency) {
    this.executionMetrics.totalOrders++;
    const total = this.executionMetrics.averageLatency * (this.executionMetrics.totalOrders - 1);
    this.executionMetrics.averageLatency = (total + latency) / this.executionMetrics.totalOrders;
  }

  updateSlippageMetrics(slippage) {
    this.executionMetrics.slippageStats.samples.push(slippage);

    // Keep only last 1000 samples
    if (this.executionMetrics.slippageStats.samples.length > 1000) {
      this.executionMetrics.slippageStats.samples.shift();
    }

    const samples = this.executionMetrics.slippageStats.samples;
    this.executionMetrics.slippageStats.average = samples.reduce((sum, s) => sum + s, 0) / samples.length;
    this.executionMetrics.slippageStats.maximum = Math.max(...samples);
  }

  /**
   * Circuit breaker check
   */
  isCircuitBreakerTripped() {
    const recentOrders = this.executionMetrics.totalOrders;
    const recentFailures = this.executionMetrics.failedOrders;

    if (recentOrders < 10) return false; // Need minimum sample size

    const failureRate = recentFailures / recentOrders;
    return failureRate > this.config.circuitBreakerThreshold;
  }

  /**
   * Estimate execution time
   */
  estimateExecutionTime() {
    const queuePosition = this.executionQueue.length;
    const avgLatency = this.executionMetrics.averageLatency || 1000;
    const processingRate = this.config.maxOrdersPerSecond;

    return Math.ceil((queuePosition / processingRate) * 1000) + avgLatency;
  }

  /**
   * Get error code for standardized error handling
   */
  getErrorCode(error) {
    if (error.message.includes('validation')) return 'VALIDATION_ERROR';
    if (error.message.includes('risk')) return 'RISK_REJECTED';
    if (error.message.includes('broker')) return 'BROKER_ERROR';
    if (error.message.includes('timeout')) return 'TIMEOUT';
    if (error.message.includes('circuit breaker')) return 'CIRCUIT_BREAKER';
    return 'UNKNOWN_ERROR';
  }

  /**
   * Get execution metrics
   */
  getExecutionMetrics() {
    return {
      ...this.executionMetrics,
      successRate: this.executionMetrics.totalOrders > 0
        ? this.executionMetrics.successfulOrders / this.executionMetrics.totalOrders
        : 0,
      queueLength: this.executionQueue.length,
      activeOrders: this.activeOrders.size,
      circuitBreakerStatus: this.isCircuitBreakerTripped() ? 'TRIPPED' : 'NORMAL'
    };
  }
}

module.exports = LiveOrderManager;
