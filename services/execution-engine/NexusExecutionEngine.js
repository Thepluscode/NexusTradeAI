/**
 * Nexus Execution Engine
 * 
 * Advanced execution engine that integrates Nexus Alpha signals with multi-broker support
 * Features: Smart order routing, risk management, position tracking
 */

const EventEmitter = require('events');
const Redis = require('ioredis');
const NexusAlpha = require('../strategy-engine/NexusAlpha');
const { MultiBrokerManager } = require('../broker-connector/BrokerConnector');

class NexusExecutionEngine extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // Redis configuration
      redisUrl: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      
      // Risk management
      maxPositionSize: config.maxPositionSize || 10000,
      maxDailyLoss: config.maxDailyLoss || -5000,
      riskPerTrade: config.riskPerTrade || 0.02,
      
      // Execution settings
      defaultBroker: config.defaultBroker || 'mock',
      enableSmartRouting: config.enableSmartRouting || true,
      maxSlippage: config.maxSlippage || 0.005, // 0.5%
      
      // Strategy settings
      enableNexusAlpha: config.enableNexusAlpha || true,
      nexusAlphaConfig: config.nexusAlphaConfig || {}
    };
    
    // Initialize components
    this.redis = new Redis(this.config.redisUrl);
    this.brokerManager = new MultiBrokerManager();
    
    if (this.config.enableNexusAlpha) {
      this.nexusAlpha = new NexusAlpha(this.config.nexusAlphaConfig);
    }
    
    // State tracking
    this.activePositions = new Map();
    this.pendingOrders = new Map();
    this.dailyPnL = 0;
    this.totalTrades = 0;
    
    // Performance metrics
    this.metrics = {
      ordersExecuted: 0,
      avgExecutionTime: 0,
      successRate: 0,
      totalVolume: 0
    };
    
    this.setupEventHandlers();
    console.log('🚀 Nexus Execution Engine initialized');
  }

  /**
   * Initialize the execution engine
   */
  async initialize(brokerConfigs = []) {
    try {
      // Add brokers
      for (const brokerConfig of brokerConfigs) {
        this.brokerManager.addBroker(
          brokerConfig.name,
          brokerConfig.type,
          brokerConfig.config
        );
      }
      
      // Connect to all brokers
      const connectionResults = await this.brokerManager.connectAll();
      console.log('🔗 Broker connections:', connectionResults);
      
      // Subscribe to Nexus Alpha signals
      if (this.nexusAlpha) {
        await this.redis.subscribe('nexus_signals');
      }
      
      // Start monitoring loops
      this.startMonitoring();
      
      this.emit('initialized', {
        brokers: connectionResults,
        nexusAlphaEnabled: !!this.nexusAlpha
      });
      
      console.log('✅ Nexus Execution Engine ready');
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize execution engine:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Redis message handler for Nexus Alpha signals
    this.redis.on('message', async (channel, message) => {
      if (channel === 'nexus_signals') {
        try {
          const signal = JSON.parse(message);
          await this.processNexusSignal(signal);
        } catch (error) {
          console.error('❌ Error processing Nexus signal:', error);
        }
      }
    });
    
    // Broker event handlers
    this.brokerManager.on('orderPlaced', (data) => {
      this.handleOrderPlaced(data);
    });
    
    this.brokerManager.on('brokerError', (data) => {
      console.error(`❌ Broker error (${data.name}):`, data.error);
      this.emit('brokerError', data);
    });
  }

  /**
   * Process Nexus Alpha trading signal
   */
  async processNexusSignal(signal) {
    try {
      console.log(`📊 Processing Nexus Alpha signal: ${signal.action} ${signal.instrument}`);
      
      // Risk checks
      const riskCheck = await this.performRiskChecks(signal);
      if (!riskCheck.approved) {
        console.log(`🚫 Signal rejected: ${riskCheck.reason}`);
        this.emit('signalRejected', { signal, reason: riskCheck.reason });
        return;
      }
      
      // Calculate position size
      const positionSize = await this.calculatePositionSize(signal);
      
      // Create order
      const order = {
        symbol: signal.instrument,
        side: signal.action,
        type: 'MARKET',
        quantity: positionSize,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        strategy: 'nexus_alpha',
        confidence: signal.confidence,
        timestamp: signal.timestamp
      };
      
      // Execute order
      const result = await this.executeOrder(order);
      
      if (result.success) {
        // Track position
        await this.trackPosition(order, result, signal);
        
        this.emit('signalExecuted', {
          signal,
          order,
          result,
          positionSize
        });
        
        console.log(`✅ Nexus Alpha signal executed: ${signal.action} ${positionSize} ${signal.instrument}`);
      } else {
        console.error(`❌ Failed to execute Nexus Alpha signal:`, result.error);
        this.emit('executionFailed', { signal, order, error: result.error });
      }
      
    } catch (error) {
      console.error('❌ Error processing Nexus Alpha signal:', error);
      this.emit('error', error);
    }
  }

  /**
   * Perform risk management checks
   */
  async performRiskChecks(signal) {
    // Check daily loss limit
    if (this.dailyPnL <= this.config.maxDailyLoss) {
      return { approved: false, reason: 'Daily loss limit exceeded' };
    }
    
    // Check if we already have a position in this instrument
    if (this.activePositions.has(signal.instrument)) {
      return { approved: false, reason: 'Position already exists for this instrument' };
    }
    
    // Check position size limits
    const positionValue = signal.price * await this.calculatePositionSize(signal);
    if (positionValue > this.config.maxPositionSize) {
      return { approved: false, reason: 'Position size exceeds limit' };
    }
    
    // Check broker connectivity
    const broker = this.brokerManager.getBroker();
    if (!broker || !broker.isConnected) {
      return { approved: false, reason: 'No broker connection available' };
    }
    
    return { approved: true };
  }

  /**
   * Calculate position size based on risk management
   */
  async calculatePositionSize(signal) {
    try {
      // Get account balance
      const balance = await this.brokerManager.getBroker().getBalance();
      if (!balance) {
        throw new Error('Unable to get account balance');
      }
      
      // Use Nexus Alpha's position sizing if available
      if (this.nexusAlpha) {
        return this.nexusAlpha.calculatePositionSize(
          balance.equity,
          signal.stopLoss,
          signal.price
        );
      }
      
      // Fallback to simple risk-based sizing
      const riskAmount = balance.equity * this.config.riskPerTrade;
      const stopDistance = Math.abs(signal.price - signal.stopLoss);
      const positionSize = Math.floor(riskAmount / stopDistance);
      
      return Math.max(1, Math.min(positionSize, 1000)); // Min 1, max 1000 shares
      
    } catch (error) {
      console.error('❌ Error calculating position size:', error);
      return 100; // Default fallback
    }
  }

  /**
   * Execute order with smart routing
   */
  async executeOrder(order, brokerName = null) {
    const startTime = Date.now();
    
    try {
      // Smart broker selection if enabled
      if (this.config.enableSmartRouting && !brokerName) {
        brokerName = await this.selectOptimalBroker(order);
      }
      
      // Execute order
      const result = await this.brokerManager.placeOrder(order, brokerName);
      
      // Update metrics
      const executionTime = Date.now() - startTime;
      this.updateExecutionMetrics(executionTime, result.success);
      
      if (result.success) {
        this.pendingOrders.set(result.orderId, {
          ...order,
          orderId: result.orderId,
          broker: result.broker,
          timestamp: new Date().toISOString()
        });
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Order execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Select optimal broker for order execution
   */
  async selectOptimalBroker(order) {
    // Simple implementation - can be enhanced with latency, fees, liquidity analysis
    const availableBrokers = Array.from(this.brokerManager.brokers.keys())
      .filter(name => this.brokerManager.getBroker(name).isConnected);
    
    if (availableBrokers.length === 0) {
      throw new Error('No connected brokers available');
    }
    
    // For now, return the default broker or first available
    return this.config.defaultBroker || availableBrokers[0];
  }

  /**
   * Track position after order execution
   */
  async trackPosition(order, executionResult, signal) {
    const position = {
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      entryPrice: signal.price,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      strategy: order.strategy,
      confidence: order.confidence,
      orderId: executionResult.orderId,
      broker: executionResult.broker,
      entryTime: new Date().toISOString(),
      atr: signal.atr,
      status: 'OPEN'
    };
    
    this.activePositions.set(order.symbol, position);
    
    // Store in Redis for persistence
    await this.redis.set(
      `position:${order.symbol}`,
      JSON.stringify(position),
      'EX',
      86400 // 24 hours expiry
    );
    
    this.emit('positionOpened', position);
  }

  /**
   * Handle order placement confirmation
   */
  handleOrderPlaced(data) {
    this.metrics.ordersExecuted++;
    this.totalTrades++;
    
    console.log(`📋 Order placed: ${data.order.symbol} via ${data.name}`);
    this.emit('orderConfirmed', data);
  }

  /**
   * Update execution metrics
   */
  updateExecutionMetrics(executionTime, success) {
    // Update average execution time
    this.metrics.avgExecutionTime = 
      (this.metrics.avgExecutionTime * this.metrics.ordersExecuted + executionTime) / 
      (this.metrics.ordersExecuted + 1);
    
    // Update success rate
    if (success) {
      this.metrics.successRate = 
        (this.metrics.successRate * this.metrics.ordersExecuted + 1) / 
        (this.metrics.ordersExecuted + 1);
    } else {
      this.metrics.successRate = 
        (this.metrics.successRate * this.metrics.ordersExecuted) / 
        (this.metrics.ordersExecuted + 1);
    }
  }

  /**
   * Start monitoring loops
   */
  startMonitoring() {
    // Position monitoring
    setInterval(async () => {
      await this.monitorPositions();
    }, 30000); // Every 30 seconds
    
    // Performance monitoring
    setInterval(async () => {
      await this.updatePerformanceMetrics();
    }, 60000); // Every minute
  }

  /**
   * Monitor active positions for stop loss/take profit
   */
  async monitorPositions() {
    try {
      for (const [symbol, position] of this.activePositions.entries()) {
        // Get current market price (simplified - would use real market data)
        const currentPrice = await this.getCurrentPrice(symbol);
        
        if (currentPrice) {
          // Check stop loss
          const shouldStopLoss = (position.side === 'BUY' && currentPrice <= position.stopLoss) ||
                                (position.side === 'SELL' && currentPrice >= position.stopLoss);
          
          // Check take profit
          const shouldTakeProfit = (position.side === 'BUY' && currentPrice >= position.takeProfit) ||
                                  (position.side === 'SELL' && currentPrice <= position.takeProfit);
          
          if (shouldStopLoss || shouldTakeProfit) {
            await this.closePosition(symbol, shouldStopLoss ? 'STOP_LOSS' : 'TAKE_PROFIT');
          }
          
          // Update trailing stops if Nexus Alpha is enabled
          if (this.nexusAlpha) {
            await this.nexusAlpha.updateTrailingStops(symbol, currentPrice, position.confidence);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error monitoring positions:', error);
    }
  }

  /**
   * Close position
   */
  async closePosition(symbol, reason) {
    const position = this.activePositions.get(symbol);
    if (!position) return;
    
    try {
      const closeOrder = {
        symbol: symbol,
        side: position.side === 'BUY' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: position.quantity,
        reason: reason
      };
      
      const result = await this.executeOrder(closeOrder);
      
      if (result.success) {
        // Calculate P&L
        const currentPrice = await this.getCurrentPrice(symbol);
        const pnl = position.side === 'BUY' 
          ? (currentPrice - position.entryPrice) * position.quantity
          : (position.entryPrice - currentPrice) * position.quantity;
        
        this.dailyPnL += pnl;
        
        // Update Nexus Alpha performance if available
        if (this.nexusAlpha) {
          this.nexusAlpha.updatePerformance({ pnl, symbol, strategy: position.strategy });
        }
        
        // Remove from active positions
        this.activePositions.delete(symbol);
        await this.redis.del(`position:${symbol}`);
        
        this.emit('positionClosed', {
          symbol,
          pnl,
          reason,
          position,
          closePrice: currentPrice
        });
        
        console.log(`🔒 Position closed: ${symbol} - P&L: $${pnl.toFixed(2)} (${reason})`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to close position ${symbol}:`, error);
    }
  }

  /**
   * Get current market price (simplified implementation)
   */
  async getCurrentPrice(symbol) {
    // In a real implementation, this would fetch from market data service
    // For now, return a mock price
    return 100 + Math.random() * 10;
  }

  /**
   * Update performance metrics
   */
  async updatePerformanceMetrics() {
    try {
      // Get aggregated balances
      const balances = await this.brokerManager.getAggregatedBalance();
      
      // Get aggregated positions
      const positions = await this.brokerManager.getAggregatedPositions();
      
      this.emit('performanceUpdate', {
        metrics: this.metrics,
        dailyPnL: this.dailyPnL,
        totalTrades: this.totalTrades,
        activePositions: this.activePositions.size,
        balances,
        positions
      });
      
    } catch (error) {
      console.error('❌ Error updating performance metrics:', error);
    }
  }

  /**
   * Get execution engine status
   */
  getStatus() {
    return {
      isInitialized: this.brokerManager.brokers.size > 0,
      connectedBrokers: Array.from(this.brokerManager.brokers.entries())
        .filter(([name, broker]) => broker.isConnected)
        .map(([name]) => name),
      activePositions: this.activePositions.size,
      pendingOrders: this.pendingOrders.size,
      dailyPnL: this.dailyPnL,
      totalTrades: this.totalTrades,
      metrics: this.metrics,
      nexusAlphaEnabled: !!this.nexusAlpha
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.redis) {
      await this.redis.disconnect();
    }
    
    if (this.nexusAlpha) {
      await this.nexusAlpha.cleanup();
    }
  }
}

module.exports = NexusExecutionEngine;
