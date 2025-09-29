// Interactive Brokers Integration
// Professional-grade integration with IB for global markets and institutional trading

const { IBApi, EventName, ErrorCode, OrderAction, OrderType, TimeInForce } = require('@stoqey/ib');
const EventEmitter = require('events');

class InteractiveBrokersBroker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = 'ib';
    this.logger = options.logger;
    
    // IB Configuration
    this.config = {
      host: options.host || '127.0.0.1',
      port: options.port || 7497, // 7497 for TWS, 4001 for IB Gateway
      clientId: options.clientId || 1,
      timeout: options.timeout || 30000
    };
    
    // Initialize IB API
    this.ib = new IBApi({
      host: this.config.host,
      port: this.config.port,
      clientId: this.config.clientId
    });
    
    // Order tracking
    this.nextOrderId = 1;
    this.pendingOrders = new Map();
    this.orderIdMap = new Map(); // Maps our order IDs to IB order IDs
    
    // Performance tracking
    this.metrics = {
      totalOrders: 0,
      successfulOrders: 0,
      averageLatency: 0,
      lastHealthCheck: null,
      isHealthy: false,
      connectionStatus: 'DISCONNECTED'
    };
    
    // Supported contracts cache
    this.contractCache = new Map();
    
    this.setupEventHandlers();
    this.initializeConnection();
  }

  /**
   * Setup IB API event handlers
   */
  setupEventHandlers() {
    // Connection events
    this.ib.on(EventName.connected, () => {
      this.metrics.connectionStatus = 'CONNECTED';
      this.metrics.isHealthy = true;
      this.logger?.info('✅ Connected to Interactive Brokers');
      this.requestNextOrderId();
    });

    this.ib.on(EventName.disconnected, () => {
      this.metrics.connectionStatus = 'DISCONNECTED';
      this.metrics.isHealthy = false;
      this.logger?.warn('❌ Disconnected from Interactive Brokers');
    });

    this.ib.on(EventName.error, (error, code, reqId) => {
      this.logger?.error(`IB Error ${code}:`, error);
      
      // Handle specific error codes
      if (code === ErrorCode.NOT_CONNECTED) {
        this.metrics.isHealthy = false;
        this.reconnect();
      }
    });

    // Order events
    this.ib.on(EventName.nextValidId, (orderId) => {
      this.nextOrderId = orderId;
      this.logger?.info(`Next valid order ID: ${orderId}`);
    });

    this.ib.on(EventName.orderStatus, (orderId, status, filled, remaining, avgFillPrice, permId, parentId, lastFillPrice, clientId, whyHeld, mktCapPrice) => {
      this.handleOrderStatus(orderId, status, filled, remaining, avgFillPrice);
    });

    this.ib.on(EventName.openOrder, (orderId, contract, order, orderState) => {
      this.handleOpenOrder(orderId, contract, order, orderState);
    });

    this.ib.on(EventName.execDetails, (reqId, contract, execution) => {
      this.handleExecution(execution);
    });
  }

  /**
   * Initialize connection to IB
   */
  async initializeConnection() {
    try {
      await this.ib.connect();
      
      // Wait for connection to be established
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout);
        
        this.ib.once(EventName.connected, () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      
      this.logger?.info('🔗 Interactive Brokers connection established');
      
    } catch (error) {
      this.logger?.error('Failed to connect to Interactive Brokers:', error);
      this.metrics.isHealthy = false;
    }
  }

  /**
   * Request next valid order ID
   */
  requestNextOrderId() {
    this.ib.reqIds();
  }

  /**
   * Submit order to Interactive Brokers
   */
  async submitOrder(order) {
    const startTime = Date.now();
    
    try {
      if (!this.metrics.isHealthy) {
        throw new Error('Interactive Brokers connection not healthy');
      }
      
      // Get contract details
      const contract = await this.getContract(order.symbol);
      if (!contract) {
        throw new Error(`Contract not found for symbol: ${order.symbol}`);
      }
      
      // Create IB order
      const ibOrder = this.convertToIBOrder(order);
      const orderId = this.nextOrderId++;
      
      // Store order mapping
      this.orderIdMap.set(order.id, orderId);
      this.pendingOrders.set(orderId, {
        internalId: order.id,
        startTime,
        status: 'PENDING',
        fills: []
      });
      
      // Submit order
      this.ib.placeOrder(orderId, contract, ibOrder);
      
      this.metrics.totalOrders++;
      this.logger?.info(`Order submitted to IB: ${orderId} (internal: ${order.id})`);
      
      return {
        success: true,
        brokerOrderId: orderId.toString(),
        status: 'SUBMITTED'
      };
      
    } catch (error) {
      this.metrics.totalOrders++;
      this.updateLatencyMetrics(Date.now() - startTime);
      
      this.logger?.error('IB order submission failed:', error);
      
      return {
        success: false,
        error: error.message,
        code: 'IB_SUBMISSION_ERROR'
      };
    }
  }

  /**
   * Convert internal order to IB format
   */
  convertToIBOrder(order) {
    const ibOrder = {
      action: order.side === 'BUY' ? OrderAction.BUY : OrderAction.SELL,
      totalQuantity: order.quantity,
      orderType: this.convertOrderType(order.orderType),
      timeInForce: this.convertTimeInForce(order.timeInForce)
    };
    
    // Add price for limit orders
    if (order.orderType === 'LIMIT' && order.price) {
      ibOrder.lmtPrice = order.price;
    }
    
    // Add stop price for stop orders
    if (order.orderType === 'STOP' && order.stopPrice) {
      ibOrder.auxPrice = order.stopPrice;
    }
    
    // Add both prices for stop-limit orders
    if (order.orderType === 'STOP_LIMIT') {
      if (order.price) ibOrder.lmtPrice = order.price;
      if (order.stopPrice) ibOrder.auxPrice = order.stopPrice;
    }
    
    return ibOrder;
  }

  /**
   * Convert order type to IB format
   */
  convertOrderType(orderType) {
    const typeMap = {
      'MARKET': OrderType.MKT,
      'LIMIT': OrderType.LMT,
      'STOP': OrderType.STP,
      'STOP_LIMIT': OrderType.STP_LMT
    };
    
    return typeMap[orderType] || OrderType.MKT;
  }

  /**
   * Convert time in force to IB format
   */
  convertTimeInForce(timeInForce) {
    const tifMap = {
      'DAY': TimeInForce.DAY,
      'GTC': TimeInForce.GTC,
      'IOC': TimeInForce.IOC,
      'FOK': TimeInForce.FOK
    };
    
    return tifMap[timeInForce] || TimeInForce.DAY;
  }

  /**
   * Get contract details for symbol
   */
  async getContract(symbol) {
    // Check cache first
    if (this.contractCache.has(symbol)) {
      return this.contractCache.get(symbol);
    }
    
    try {
      // Create contract based on symbol format
      const contract = this.createContractFromSymbol(symbol);
      
      // Request contract details to validate
      const contractDetails = await this.requestContractDetails(contract);
      
      if (contractDetails && contractDetails.length > 0) {
        const validContract = contractDetails[0].contract;
        this.contractCache.set(symbol, validContract);
        return validContract;
      }
      
      return null;
      
    } catch (error) {
      this.logger?.error(`Error getting contract for ${symbol}:`, error);
      return null;
    }
  }

  /**
   * Create contract from symbol
   */
  createContractFromSymbol(symbol) {
    // Handle different symbol formats
    if (symbol.includes('/')) {
      // Forex pair (e.g., EUR/USD)
      const [base, quote] = symbol.split('/');
      return {
        symbol: base,
        secType: 'CASH',
        currency: quote,
        exchange: 'IDEALPRO'
      };
    } else if (symbol.includes('BTC') || symbol.includes('ETH')) {
      // Crypto
      return {
        symbol: symbol,
        secType: 'CRYPTO',
        currency: 'USD',
        exchange: 'PAXOS'
      };
    } else {
      // Stock
      return {
        symbol: symbol,
        secType: 'STK',
        currency: 'USD',
        exchange: 'SMART'
      };
    }
  }

  /**
   * Request contract details
   */
  async requestContractDetails(contract) {
    return new Promise((resolve, reject) => {
      const reqId = Math.floor(Math.random() * 10000);
      const contractDetails = [];
      
      const timeout = setTimeout(() => {
        reject(new Error('Contract details request timeout'));
      }, 10000);
      
      this.ib.once(EventName.contractDetails, (reqId, details) => {
        contractDetails.push(details);
      });
      
      this.ib.once(EventName.contractDetailsEnd, (reqId) => {
        clearTimeout(timeout);
        resolve(contractDetails);
      });
      
      this.ib.reqContractDetails(reqId, contract);
    });
  }

  /**
   * Handle order status updates
   */
  handleOrderStatus(orderId, status, filled, remaining, avgFillPrice) {
    const orderInfo = this.pendingOrders.get(orderId);
    if (!orderInfo) return;
    
    orderInfo.status = status;
    orderInfo.filled = filled;
    orderInfo.remaining = remaining;
    orderInfo.avgFillPrice = avgFillPrice;
    
    // Update latency for completed orders
    if (status === 'Filled' || status === 'Cancelled') {
      this.updateLatencyMetrics(Date.now() - orderInfo.startTime);
      
      if (status === 'Filled') {
        this.metrics.successfulOrders++;
      }
    }
    
    this.emit('orderStatusUpdate', {
      brokerOrderId: orderId.toString(),
      internalId: orderInfo.internalId,
      status: this.convertIBStatus(status),
      filled,
      remaining,
      avgFillPrice
    });
  }

  /**
   * Handle open order updates
   */
  handleOpenOrder(orderId, contract, order, orderState) {
    const orderInfo = this.pendingOrders.get(orderId);
    if (!orderInfo) return;
    
    orderInfo.contract = contract;
    orderInfo.order = order;
    orderInfo.orderState = orderState;
  }

  /**
   * Handle execution details
   */
  handleExecution(execution) {
    const orderInfo = this.pendingOrders.get(execution.orderId);
    if (!orderInfo) return;
    
    const fill = {
      id: execution.execId,
      quantity: execution.shares,
      price: execution.price,
      timestamp: execution.time,
      commission: 0 // Will be updated when commission report arrives
    };
    
    orderInfo.fills.push(fill);
    
    this.emit('orderFill', {
      brokerOrderId: execution.orderId.toString(),
      internalId: orderInfo.internalId,
      fill
    });
  }

  /**
   * Convert IB status to internal format
   */
  convertIBStatus(ibStatus) {
    const statusMap = {
      'PendingSubmit': 'PENDING',
      'PendingCancel': 'PENDING_CANCEL',
      'PreSubmitted': 'SUBMITTED',
      'Submitted': 'SUBMITTED',
      'Cancelled': 'CANCELLED',
      'Filled': 'FILLED',
      'Inactive': 'INACTIVE'
    };
    
    return statusMap[ibStatus] || 'UNKNOWN';
  }

  /**
   * Get order status
   */
  async getOrderStatus(brokerOrderId) {
    const orderId = parseInt(brokerOrderId);
    const orderInfo = this.pendingOrders.get(orderId);
    
    if (!orderInfo) {
      return {
        status: 'NOT_FOUND',
        fills: [],
        reason: 'Order not found'
      };
    }
    
    return {
      status: this.convertIBStatus(orderInfo.status),
      fills: orderInfo.fills || [],
      filled: orderInfo.filled || 0,
      remaining: orderInfo.remaining || 0,
      avgFillPrice: orderInfo.avgFillPrice || 0
    };
  }

  /**
   * Cancel order
   */
  async cancelOrder(brokerOrderId) {
    try {
      const orderId = parseInt(brokerOrderId);
      this.ib.cancelOrder(orderId);
      
      this.logger?.info(`Cancelled IB order: ${orderId}`);
      return { success: true };
      
    } catch (error) {
      this.logger?.error(`Error cancelling IB order ${brokerOrderId}:`, error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * Check if symbol is supported
   */
  async supportsSymbol(symbol) {
    try {
      const contract = await this.getContract(symbol);
      return contract !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Estimate execution cost
   */
  async estimateExecutionCost(order) {
    try {
      // IB has complex commission structure, simplified here
      let commission = 0;
      const orderValue = order.quantity * (order.price || 100);
      
      if (order.symbol.includes('/')) {
        // Forex - typically $2.50 per $100k
        commission = (orderValue / 100000) * 2.50;
      } else {
        // Stocks - $0.005 per share, min $1
        commission = Math.max(order.quantity * 0.005, 1);
      }
      
      return {
        totalCost: commission,
        slippage: 0.0005, // Estimate 0.05% slippage
        commission: commission,
        liquidity: 0.9 // IB generally has good liquidity
      };
      
    } catch (error) {
      return {
        totalCost: 5, // Default $5 cost
        slippage: 0.001,
        commission: 5,
        liquidity: 0.8
      };
    }
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    const startTime = Date.now();
    
    try {
      // Simple health check - request account summary
      const isConnected = this.metrics.connectionStatus === 'CONNECTED';
      
      const latency = Date.now() - startTime;
      this.metrics.lastHealthCheck = Date.now();
      
      return {
        isHealthy: isConnected,
        latency,
        reliability: this.metrics.totalOrders > 0 
          ? this.metrics.successfulOrders / this.metrics.totalOrders 
          : 1.0,
        connectionStatus: this.metrics.connectionStatus,
        lastCheck: this.metrics.lastHealthCheck
      };
      
    } catch (error) {
      return {
        isHealthy: false,
        latency: Date.now() - startTime,
        reliability: 0,
        error: error.message,
        connectionStatus: 'ERROR',
        lastCheck: Date.now()
      };
    }
  }

  /**
   * Reconnect to IB
   */
  async reconnect() {
    try {
      this.logger?.info('Attempting to reconnect to Interactive Brokers...');
      await this.ib.disconnect();
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      await this.initializeConnection();
    } catch (error) {
      this.logger?.error('Reconnection failed:', error);
    }
  }

  /**
   * Update latency metrics
   */
  updateLatencyMetrics(latency) {
    const total = this.metrics.averageLatency * (this.metrics.totalOrders - 1);
    this.metrics.averageLatency = (total + latency) / this.metrics.totalOrders;
  }

  /**
   * Cleanup on shutdown
   */
  async disconnect() {
    try {
      await this.ib.disconnect();
      this.logger?.info('Disconnected from Interactive Brokers');
    } catch (error) {
      this.logger?.error('Error disconnecting from IB:', error);
    }
  }
}

module.exports = InteractiveBrokersBroker;
