const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');

class OrderManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Order storage
    this.orders = new Map(); // orderId -> order
    this.ordersBySymbol = new Map(); // symbol -> Set of orderIds
    this.ordersByUser = new Map(); // userId -> Set of orderIds
    
    // Order states
    this.ORDER_STATES = {
      PENDING: 'pending',
      OPEN: 'open',
      PARTIALLY_FILLED: 'partially_filled',
      FILLED: 'filled',
      CANCELLED: 'cancelled',
      REJECTED: 'rejected',
      EXPIRED: 'expired'
    };
    
    // Performance tracking
    this.stats = {
      totalOrders: 0,
      activeOrders: 0,
      ordersPerSecond: 0,
      lastProcessedTime: null
    };
  }

  async createOrder(orderRequest) {
    try {
      const order = {
        id: uuidv4(),
        ...orderRequest,
        state: this.ORDER_STATES.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
        fills: [],
        totalFilled: 0,
        remainingQuantity: parseFloat(orderRequest.quantity),
        avgFillPrice: 0
      };

      // Validate order
      await this.validateOrder(order);

      // Store order
      this.storeOrder(order);

      // Emit order created event
      this.emit('order_created', order);

      this.logger?.info(`Order created: ${order.id}`, {
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        type: order.type
      });

      return order;
    } catch (error) {
      this.logger?.error('Error creating order:', error);
      throw error;
    }
  }

  async validateOrder(order) {
    // Required fields validation
    const requiredFields = ['symbol', 'side', 'type', 'quantity', 'userId'];
    for (const field of requiredFields) {
      if (!order[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Side validation
    if (!['buy', 'sell'].includes(order.side)) {
      throw new Error('Invalid order side. Must be "buy" or "sell"');
    }

    // Type validation
    if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type)) {
      throw new Error('Invalid order type');
    }

    // Quantity validation
    const quantity = new Decimal(order.quantity);
    if (quantity.lte(0)) {
      throw new Error('Quantity must be positive');
    }

    // Price validation for limit orders
    if (['limit', 'stop_limit'].includes(order.type) && (!order.price || order.price <= 0)) {
      throw new Error('Price is required for limit orders and must be positive');
    }

    // Stop price validation for stop orders
    if (['stop', 'stop_limit'].includes(order.type) && (!order.stopPrice || order.stopPrice <= 0)) {
      throw new Error('Stop price is required for stop orders and must be positive');
    }

    return true;
  }

  async createOrder(orderData) {
    try {
      const orderId = nanoid(12);
      const now = new Date();
      
      // Create order object
      const orderDoc = {
        id: orderId,
        userId: orderData.userId,
        symbol: orderData.symbol,
        side: orderData.side, // 'buy' or 'sell'
        type: orderData.type, // 'market', 'limit', 'stop', 'stop_limit'
        quantity: new Decimal(orderData.quantity),
        originalQuantity: new Decimal(orderData.quantity),
        price: orderData.price ? new Decimal(orderData.price) : null,
        stopPrice: orderData.stopPrice ? new Decimal(orderData.stopPrice) : null,
        timeInForce: orderData.timeInForce || 'GTC', // GTC, IOC, FOK, DAY
        status: 'pending',
        filledQuantity: new Decimal(0),
        remainingQuantity: new Decimal(orderData.quantity),
        averageFillPrice: new Decimal(0),
        fees: new Decimal(0),
        
        // Timestamps
        createdAt: now,
        updatedAt: now,
        expiresAt: this.calculateExpiry(orderData.timeInForce, orderData.expiresAt),
        
        // Additional fields
        clientOrderId: orderData.clientOrderId,
        source: orderData.source || 'api',
        algorithm: orderData.algorithm, // TWAP, VWAP, etc.
        parentOrderId: orderData.parentOrderId,
        
        // Risk and compliance
        riskChecked: false,
        complianceChecked: false,
        
        // Execution tracking
        executionStartTime: null,
        executionEndTime: null,
        fills: [],
        
        // Metadata
        metadata: orderData.metadata || {}
      };
      
      // Save to database
      const order = new Order(orderDoc);
      await order.save();
      
      // Add to cache
      this.addToCache(order.toObject());
      
      // Emit event
      this.emit('order_created', order.toObject());
      
      this.logger?.info(`Order created: ${orderId}`, {
        symbol: orderData.symbol,
        side: orderData.side,
        quantity: orderData.quantity,
        type: orderData.type
      });
      
      return order.toObject();
      
    } catch (error) {
      this.logger?.error('Error creating order:', error);
      throw error;
    }
  }

  addToCache(order) {
    // Add to main cache
    this.orders.set(order.id, order);
    
    // Add to user orders mapping
    if (!this.userOrders.has(order.userId)) {
      this.userOrders.set(order.userId, new Set());
    }
    this.userOrders.get(order.userId).add(order.id);
    
    // Add to symbol orders mapping
    if (!this.symbolOrders.has(order.symbol)) {
      this.symbolOrders.set(order.symbol, new Set());
    }
    this.symbolOrders.get(order.symbol).add(order.id);
  }

  removeFromCache(orderId) {
    const order = this.orders.get(orderId);
    if (!order) return;
    
    // Remove from main cache
    this.orders.delete(orderId);
    
    // Remove from user orders mapping
    const userOrderSet = this.userOrders.get(order.userId);
    if (userOrderSet) {
      userOrderSet.delete(orderId);
      if (userOrderSet.size === 0) {
        this.userOrders.delete(order.userId);
      }
    }
    
    // Remove from symbol orders mapping
    const symbolOrderSet = this.symbolOrders.get(order.symbol);
    if (symbolOrderSet) {
      symbolOrderSet.delete(orderId);
      if (symbolOrderSet.size === 0) {
        this.symbolOrders.delete(order.symbol);
      }
    }
  }

  calculateExpiry(timeInForce, customExpiry) {
    const now = new Date();
    
    switch (timeInForce) {
      case 'DAY':
        const endOfDay = new Date(now);
        endOfDay.setHours(23, 59, 59, 999);
        return endOfDay;
        
      case 'IOC':
      case 'FOK':
        return new Date(now.getTime() + 1000); // 1 second for immediate execution
        
      case 'GTC':
        return customExpiry ? new Date(customExpiry) : null;
        
      default:
        return null;
    }
  }

  async updateOrderStatus(orderId, status, updateData = {}) {
    try {
      const order = this.orders.get(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }
      
      const now = new Date();
      const updateFields = {
        status,
        updatedAt: now,
        ...updateData
      };
      
      // Update specific fields based on status
      if (status === 'filled' || status === 'partial') {
        if (updateData.fill) {
          updateFields.filledQuantity = new Decimal(order.filledQuantity).plus(updateData.fill.quantity);
          updateFields.remainingQuantity = new Decimal(order.originalQuantity).minus(updateFields.filledQuantity);
          updateFields.averageFillPrice = this.calculateAverageFillPrice(order, updateData.fill);
          updateFields.fees = new Decimal(order.fees).plus(updateData.fill.fee || 0);
          
          // Add fill to fills array
          updateFields.$push = {
            fills: {
              id: nanoid(8),
              quantity: updateData.fill.quantity,
              price: updateData.fill.price,
              fee: updateData.fill.fee || 0,
              timestamp: now,
              venue: updateData.fill.venue || 'internal'
            }
          };
        }
        
        if (status === 'filled') {
          updateFields.executionEndTime = now;
        }
      }
      
      if (status === 'cancelled' || status === 'rejected' || status === 'expired') {
        updateFields.executionEndTime = now;
      }
      
      // Update in database
      await Order.findOneAndUpdate(
        { id: orderId },
        updateFields,
        { new: true }
      );
      
      // Update cache
      Object.assign(order, updateFields);
      
      // Remove from cache if order is terminal
      if (['filled', 'cancelled', 'rejected', 'expired'].includes(status)) {
        this.removeFromCache(orderId);
      }
      
      // Emit appropriate event
      if (status === 'filled' || status === 'partial') {
        this.emit('order_filled', {
          orderId,
          userId: order.userId,
          symbol: order.symbol,
          side: order.side,
          orderType: order.type,
          fill: updateData.fill,
          status
        });
      } else if (status === 'cancelled') {
        this.emit('order_cancelled', order);
      }
      
      this.logger?.debug(`Order ${orderId} status updated to ${status}`);
      
      return order;
      
    } catch (error) {
      this.logger?.error(`Error updating order ${orderId}:`, error);
      throw error;
    }
  }

  calculateAverageFillPrice(order, newFill) {
    const currentFilledQuantity = new Decimal(order.filledQuantity);
    const currentAveragePrice = new Decimal(order.averageFillPrice);
    const newQuantity = new Decimal(newFill.quantity);
    const newPrice = new Decimal(newFill.price);
    
    if (currentFilledQuantity.equals(0)) {
      return newPrice;
    }
    
    const totalValue = currentFilledQuantity.times(currentAveragePrice).plus(newQuantity.times(newPrice));
    const totalQuantity = currentFilledQuantity.plus(newQuantity);
    
    return totalValue.dividedBy(totalQuantity);
  }

  async rejectOrder(orderId, reason) {
    try {
      await this.updateOrderStatus(orderId, 'rejected', { rejectionReason: reason });
      this.logger?.info(`Order ${orderId} rejected: ${reason}`);
    } catch (error) {
      this.logger?.error(`Error rejecting order ${orderId}:`, error);
      throw error;
    }
  }

  async expireOrders() {
    try {
      const now = new Date();
      const expiredOrderIds = [];
      
      // Check cached orders for expiry
      for (const [orderId, order] of this.orders) {
        if (order.expiresAt && order.expiresAt <= now && ['pending', 'partial'].includes(order.status)) {
          expiredOrderIds.push(orderId);
        }
      }
      
      // Update expired orders
      for (const orderId of expiredOrderIds) {
        await this.updateOrderStatus(orderId, 'expired');
      }
      
      if (expiredOrderIds.length > 0) {
        this.logger?.info(`Expired ${expiredOrderIds.length} orders`);
      }
      
    } catch (error) {
      this.logger?.error('Error expiring orders:', error);
    }
  }

  async getOrder(orderId) {
    // Try cache first
    const cachedOrder = this.orders.get(orderId);
    if (cachedOrder) {
      return cachedOrder;
    }
    
    // Fallback to database
    try {
      const order = await Order.findOne({ id: orderId }).lean();
      return order;
    } catch (error) {
      this.logger?.error(`Error getting order ${orderId}:`, error);
      throw error;
    }
  }

  async getUserOrders(userId, status = null, limit = 50) {
    try {
      const query = { userId };
      if (status) {
        if (Array.isArray(status)) {
          query.status = { $in: status };
        } else {
          query.status = status;
        }
      }
      
      const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      
      return orders;
      
    } catch (error) {
      this.logger?.error(`Error getting orders for user ${userId}:`, error);
      throw error;
    }
  }

  async getSymbolOrders(symbol, status = ['pending', 'partial']) {
    const symbolOrderIds = this.symbolOrders.get(symbol);
    if (!symbolOrderIds) {
      return [];
    }
    
    const orders = [];
    for (const orderId of symbolOrderIds) {
      const order = this.orders.get(orderId);
      if (order && status.includes(order.status)) {
        orders.push(order);
      }
    }
    
    return orders;
  }

  async cancelUserOrders(userId, symbol = null) {
    try {
      const userOrderIds = this.userOrders.get(userId);
      if (!userOrderIds) {
        return [];
      }
      
      const cancelledOrders = [];
      
      for (const orderId of userOrderIds) {
        const order = this.orders.get(orderId);
        if (order && ['pending', 'partial'].includes(order.status)) {
          if (!symbol || order.symbol === symbol) {
            await this.updateOrderStatus(orderId, 'cancelled', {
              cancellationReason: 'bulk_cancellation'
            });
            cancelledOrders.push(orderId);
          }
        }
      }
      
      this.logger?.info(`Cancelled ${cancelledOrders.length} orders for user ${userId}`);
      return cancelledOrders;
      
    } catch (error) {
      this.logger?.error(`Error cancelling orders for user ${userId}:`, error);
      throw error;
    }
  }

  getActiveOrdersCount() {
    return this.orders.size;
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      activeOrders: this.orders.size,
      usersWithOrders: this.userOrders.size,
      symbolsWithOrders: this.symbolOrders.size
    };
  }

  // Start order expiry checker
  startExpiryChecker() {
    setInterval(() => {
      this.expireOrders();
    }, 10000); // Check every 10 seconds
  }

  isActiveState(state) {
    return [
      this.ORDER_STATES.PENDING,
      this.ORDER_STATES.OPEN,
      this.ORDER_STATES.PARTIALLY_FILLED
    ].includes(state);
  }

  storeOrder(order) {
    if (!order || !order.id) {
      throw new Error('Invalid order object');
    }
    
    this.orders.set(order.id, order);
    
    // Index by symbol
    if (!this.ordersBySymbol.has(order.symbol)) {
      this.ordersBySymbol.set(order.symbol, new Set());
    }
    this.ordersBySymbol.get(order.symbol).add(order.id);
    
    // Index by user
    if (!this.ordersByUser.has(order.userId)) {
      this.ordersByUser.set(order.userId, new Set());
    }
    this.ordersByUser.get(order.userId).add(order.id);
    
    this.stats.totalOrders++;
    this.stats.activeOrders++;
  }

  async updateOrderState(orderId, newState, data = {}) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    const oldState = order.state;
    order.state = newState;
    order.updatedAt = new Date();
    
    // Update additional data
    Object.assign(order, data);

    // Update active orders count
    if (this.isActiveState(oldState) && !this.isActiveState(newState)) {
      this.stats.activeOrders--;
    }

    this.emit('order_state_changed', { order, oldState, newState });

    if (this.logger && this.logger.info) {
      this.logger.info(`Order state changed: ${orderId}`, {
        oldState,
        newState,
        symbol: order.symbol
      });
    }

    return order;
  }

  async addFill(orderId, fill) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Ensure fills array exists
    if (!Array.isArray(order.fills)) {
      order.fills = [];
    }
    
    // Create fill object without spread operator
    const newFill = {
      quantity: fill.quantity,
      price: fill.price,
      timestamp: new Date(),
      // Copy any additional properties from fill
      ...(fill.id && { id: fill.id }),
      ...(fill.fee && { fee: fill.fee }),
      ...(fill.exchangeId && { exchangeId: fill.exchangeId })
    };
    
    // Add fill to order
    order.fills.push(newFill);

    // Update order quantities and prices
    const fillQuantity = new Decimal(fill.quantity);
    order.totalFilled += fillQuantity.toNumber();
    order.remainingQuantity -= fillQuantity.toNumber();

    // Calculate average fill price safely
    let totalValue = 0;
    try {
      totalValue = order.fills.reduce((sum, f) => {
        const quantity = parseFloat(f.quantity) || 0;
        const price = parseFloat(f.price) || 0;
        return sum + (quantity * price);
      }, 0);
      order.avgFillPrice = order.totalFilled > 0 ? totalValue / order.totalFilled : 0;
    } catch (error) {
      this.logger?.error('Error calculating average fill price:', error);
      order.avgFillPrice = 0;
    }

    // Update order state based on fill
    let newState;
    if (order.remainingQuantity <= 0) {
      newState = this.ORDER_STATES.FILLED;
    } else if (order.totalFilled > 0) {
      newState = this.ORDER_STATES.PARTIALLY_FILLED;
    }

    if (newState && newState !== order.state) {
      await this.updateOrderState(orderId, newState);
    }

    this.emit('order_filled', { order, fill });

    return order;
  }

  async cancelOrder(orderId, reason = 'User cancelled') {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    if (!this.isActiveState(order.state)) {
      throw new Error(`Cannot cancel order in state: ${order.state}`);
    }

    await this.updateOrderState(orderId, this.ORDER_STATES.CANCELLED, {
      cancelReason: reason,
      cancelledAt: new Date()
    });

    this.emit('order_cancelled', order);

    return order;
  }

  async expireOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    await this.updateOrderState(orderId, this.ORDER_STATES.EXPIRED, {
      expiredAt: new Date()
    });

    this.emit('order_expired', order);

    return order;
  }

  getOrder(orderId) {
    return this.orders.get(orderId);
  }

  getOrdersBySymbol(symbol) {
    const orderIds = this.ordersBySymbol.get(symbol) || new Set();
    return Array.from(orderIds).map(id => this.orders.get(id)).filter(Boolean);
  }

  getOrdersByUser(userId) {
    const orderIds = this.ordersByUser.get(userId) || new Set();
    return Array.from(orderIds).map(id => this.orders.get(id)).filter(Boolean);
  }

  getActiveOrders() {
    return Array.from(this.orders.values()).filter(order => 
      this.isActiveState(order.state)
    );
  }

  getOrdersByState(state) {
    return Array.from(this.orders.values()).filter(order => 
      order.state === state
    );
  }

  isActiveState(state) {
    return [
      this.ORDER_STATES.PENDING,
      this.ORDER_STATES.OPEN,
      this.ORDER_STATES.PARTIALLY_FILLED
    ].includes(state);
  }

  getStats() {
    return {
      ...this.stats,
      ordersByState: this.getOrderCountByState(),
      ordersBySymbol: this.getOrderCountBySymbol()
    };
  }

  getOrderCountByState() {
    const counts = {};
    Object.values(this.ORDER_STATES).forEach(state => {
      counts[state] = 0;
    });

    this.orders.forEach(order => {
      counts[order.state] = (counts[order.state] || 0) + 1;
    });

    return counts;
  }

  getOrderCountBySymbol() {
    const counts = {};
    this.ordersBySymbol.forEach((orderIds, symbol) => {
      counts[symbol] = orderIds.size;
    });
    return counts;
  }
}

module.exports = OrderManager;