const PriorityQueue = require('priorityqueuejs');
const Decimal = require('decimal.js');
const EventEmitter = require('events');

class OrderBook extends EventEmitter {
  constructor(symbol, options = {}) {
    super();
    this.symbol = symbol;
    this.logger = options.logger;
    this.maxOrders = options.maxOrders || 100000;
    this.maxPriceLevels = options.maxPriceLevels || 1000;
    this.snapshotInterval = options.snapshotInterval || 60000; // 1 minute

    // Bids: highest price first (max heap)
    this.bids = new PriorityQueue((a, b) => b.price.cmp(a.price));
    this.asks = new PriorityQueue((a, b) => a.price.cmp(b.price));

    // Order tracking
    this.orderMap = new Map(); // orderId -> { side, priceKey }
    this.priceLevels = new Map(); // price -> { price: Decimal, orders: [], totalQuantity: Decimal }
    this.userOrders = new Map(); // userId -> Set<orderId>
    
    // Statistics
    this.stats = {
      totalOrders: 0,
      totalFills: 0,
      totalVolume: new Decimal(0),
      peakOrders: 0,
      peakPriceLevels: 0,
      addOrderTime: 0,
      removeOrderTime: 0,
      modifyOrderTime: 0,
      matchTime: 0
    };

    // Setup cleanup interval
    this.cleanupInterval = setInterval(
      () => this.cleanupStaleOrders(),
      this.snapshotInterval
    );

    // Last update timestamp
    this.lastUpdate = Date.now();
  }

  // Add an order to the book
  add(order) {
    const start = process.hrtime.bigint();
    
    try {
      // Input validation
      const { orderId, price, quantity, side, timestamp, userId } = order;
      const priceDecimal = new Decimal(price);
      const quantityDecimal = new Decimal(quantity);
      
      if (!orderId || !price || !quantity || !side) {
        throw new Error('Missing required order fields');
      }

      if (this.orderMap.has(orderId)) {
        throw new Error(`Order ${orderId} already exists`);
      }

      // Check limits
      if (this.orderMap.size >= this.maxOrders) {
        throw new Error('Maximum order limit reached');
      }

      // Create order entry
      const orderEntry = {
        orderId,
        quantity: quantityDecimal,
        timestamp: timestamp || Date.now(),
        userId,
        price: priceDecimal,
        side
      };

      // Get or create price level
      const priceKey = priceDecimal.toString();
      if (!this.priceLevels.has(priceKey)) {
        if (this.priceLevels.size >= this.maxPriceLevels) {
          throw new Error('Maximum price levels limit reached');
        }
        this.priceLevels.set(priceKey, {
          price: priceDecimal,
          orders: [],
          totalQuantity: new Decimal(0)
        });
      }

      const priceLevel = this.priceLevels.get(priceKey);
      priceLevel.orders.push(orderEntry);
      priceLevel.totalQuantity = priceLevel.totalQuantity.plus(quantityDecimal);

      // Add to appropriate side
      const bookSide = side === 'buy' ? this.bids : this.asks;
      this.addPriceLevelToQueue(bookSide, priceLevel);

      // Track order
      this.orderMap.set(orderId, { side, priceKey });
      
      // Track user orders
      if (userId) {
        if (!this.userOrders.has(userId)) {
          this.userOrders.set(userId, new Set());
        }
        this.userOrders.get(userId).add(orderId);
      }

      // Update statistics
      this.stats.totalOrders++;
      this.stats.peakOrders = Math.max(this.stats.peakOrders, this.orderMap.size);
      this.stats.peakPriceLevels = Math.max(
        this.stats.peakPriceLevels, 
        this.priceLevels.size
      );

      this.lastUpdate = Date.now();
      this.emit('order_added', { ...order });

      return true;
    } catch (error) {
      this.logger?.error('Error adding order:', error);
      throw error;
    } finally {
      const end = process.hrtime.bigint();
      this.stats.addOrderTime = Number(end - start) / 1e6; // ms
    }
  }

  // Helper method to add price level to queue
  addPriceLevelToQueue(bookSide, priceLevel) {
    const tempQueue = [];
    let levelInQueue = false;
    
    // Check if price level already exists in queue
    while (bookSide.size() > 0) {
      const level = bookSide.deq();
      tempQueue.push(level);
      if (level.price.equals(priceLevel.price)) {
        levelInQueue = true;
        level.totalQuantity = priceLevel.totalQuantity;
        break;
      }
    }
    
    // Restore queue
    tempQueue.forEach(level => bookSide.enq(level));
    
    // Add new price level if not already in queue
    if (!levelInQueue) {
      bookSide.enq(priceLevel);
    }
  }

  // Remove an order from the book
  removeOrder(orderId) {
    const start = process.hrtime.bigint();
    
    try {
      const orderInfo = this.orderMap.get(orderId);
      if (!orderInfo) {
        return false;
      }
      
      const { side, priceKey } = orderInfo;
      const priceLevel = this.priceLevels.get(priceKey);
      
      if (!priceLevel) {
        this.orderMap.delete(orderId); // Clean up orphaned order reference
        return false;
      }
      
      // Find and remove the order
      const orderIndex = priceLevel.orders.findIndex(order => order.orderId === orderId);
      if (orderIndex === -1) {
        this.orderMap.delete(orderId); // Clean up orphaned order reference
        return false;
      }
      
      const removedOrder = priceLevel.orders.splice(orderIndex, 1)[0];
      priceLevel.totalQuantity = priceLevel.totalQuantity.minus(removedOrder.quantity);
      
      // Remove from user orders tracking
      if (removedOrder.userId) {
        const userOrders = this.userOrders.get(removedOrder.userId);
        if (userOrders) {
          userOrders.delete(orderId);
          if (userOrders.size === 0) {
            this.userOrders.delete(removedOrder.userId);
          }
        }
      }
      
      // Remove price level if no orders left
      if (priceLevel.orders.length === 0) {
        this.priceLevels.delete(priceKey);
        this.rebuildQueue(side);
      }
      
      // Remove from order tracking
      this.orderMap.delete(orderId);
      
      this.lastUpdate = Date.now();
      
      this.emit('order_removed', { 
        orderId,
        price: priceLevel.price.toString(),
        quantity: removedOrder.quantity.toString(),
        side,
        userId: removedOrder.userId
      });
      
      return true;
      
    } catch (error) {
      this.logger?.error(`Error removing order ${orderId}:`, error);
      throw error;
    } finally {
      const end = process.hrtime.bigint();
      this.stats.removeOrderTime = Number(end - start) / 1e6; // ms
    }
  }
  
  // Modify an existing order
  modifyOrder(orderId, updates) {
    const start = process.hrtime.bigint();
    
    try {
      const orderInfo = this.orderMap.get(orderId);
      if (!orderInfo) {
        throw new Error(`Order ${orderId} not found`);
      }

      const { side, priceKey } = orderInfo;
      const priceLevel = this.priceLevels.get(priceKey);
      if (!priceLevel) {
        throw new Error(`Price level not found for order ${orderId}`);
      }

      const orderIndex = priceLevel.orders.findIndex(o => o.orderId === orderId);
      if (orderIndex === -1) {
        throw new Error(`Order ${orderId} not found in price level`);
      }

      const order = priceLevel.orders[orderIndex];
      const newOrder = { ...order, ...updates };
      
      // Handle price change
      if (updates.price !== undefined && !new Decimal(updates.price).eq(priceKey)) {
        // Remove from current price level
        priceLevel.totalQuantity = priceLevel.totalQuantity.minus(order.quantity);
        priceLevel.orders.splice(orderIndex, 1);

        // Add to new price level
        this.add(newOrder);

        // Remove old price level if empty
        if (priceLevel.orders.length === 0) {
          this.priceLevels.delete(priceKey);
          this.rebuildQueue(side);
        }
      } 
      // Just update quantity if price didn't change
      else if (updates.quantity !== undefined) {
        const quantityDelta = new Decimal(updates.quantity).minus(order.quantity);
        priceLevel.totalQuantity = priceLevel.totalQuantity.plus(quantityDelta);
        order.quantity = new Decimal(updates.quantity);
      }

      this.lastUpdate = Date.now();
      this.emit('order_modified', { 
        orderId, 
        ...updates,
        side,
        userId: order.userId
      });

      return true;
    } finally {
      const end = process.hrtime.bigint();
      this.stats.modifyOrderTime = Number(end - start) / 1e6; // ms
    }
  }
  
  // Rebuild the priority queue for a given side
  rebuildQueue(side) {
    const bookSide = side === 'buy' ? this.bids : this.asks;
    const tempLevels = [];
    
    // Extract all levels
    while (bookSide.size() > 0) {
      tempLevels.push(bookSide.deq());
    }
    
    // Filter out levels that no longer exist in priceLevels
    const validLevels = tempLevels.filter(level => {
      const priceKey = level.price.toString();
      return this.priceLevels.has(priceKey) && 
             this.priceLevels.get(priceKey).orders.length > 0;
    });
    
    // Rebuild queue with valid levels
    validLevels.forEach(level => bookSide.enq(level));
  }

  // Get the best bid price and quantity
  getBestBid() {
    if (this.bids.size() === 0) return null;
    const level = this.bids.peek();
    return {
      price: level.price,
      quantity: level.totalQuantity
    };
  }
  
  // Get the best ask price and quantity
  getBestAsk() {
    if (this.asks.size() === 0) return null;
    const level = this.asks.peek();
    return {
      price: level.price,
      quantity: level.totalQuantity
    };
  }
  
  // Get the current spread (best ask - best bid)
  getSpread() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    return {
      spread: bestAsk.price.minus(bestBid.price),
      percentage: bestAsk.price.minus(bestBid.price)
        .dividedBy(bestBid.price)
        .times(100)
        .toFixed(4)
    };
  }
  
  // Get order book depth up to specified levels
  getDepth(levels = 10) {
    const bids = [];
    const asks = [];
    
    // Get bids
    const tempBids = [];
    let bidCount = 0;
    
    while (this.bids.size() > 0 && bidCount < levels) {
      const level = this.bids.deq();
      tempBids.push(level);
      bids.push({
        price: level.price,
        quantity: level.totalQuantity,
        orders: level.orders.length
      });
      bidCount++;
    }
    
    // Restore bids queue
    tempBids.forEach(level => this.bids.enq(level));
    
    // Get asks
    const tempAsks = [];
    let askCount = 0;
    
    while (this.asks.size() > 0 && askCount < levels) {
      const level = this.asks.deq();
      tempAsks.push(level);
      asks.push({
        price: level.price,
        quantity: level.totalQuantity,
        orders: level.orders.length
      });
      askCount++;
    }
    
    // Restore asks queue
    tempAsks.forEach(level => this.asks.enq(level));
    
    return { bids, asks };
  }
  
  // Get order by ID
  getOrder(orderId) {
    const orderInfo = this.orderMap.get(orderId);
    if (!orderInfo) return null;
    
    const priceLevel = this.priceLevels.get(orderInfo.priceKey);
    if (!priceLevel) return null;
    
    const order = priceLevel.orders.find(o => o.orderId === orderId);
    if (!order) return null;
    
    return {
      ...order,
      price: orderInfo.priceKey,
      side: orderInfo.side
    };
  }
  
  // Get all orders for a user
  getUserOrders(userId) {
    const orderIds = this.userOrders.get(userId) || new Set();
    const orders = [];
    
    for (const orderId of orderIds) {
      const order = this.getOrder(orderId);
      if (order) {
        orders.push(order);
      }
    }
    
    return orders;
  }
  
  // Get order book statistics
  getStats() {
    const now = Date.now();
    return {
      symbol: this.symbol,
      timestamp: now,
      uptime: now - this.lastUpdate,
      orders: {
        total: this.orderMap.size,
        bids: this.bids.size(),
        asks: this.asks.size(),
        priceLevels: this.priceLevels.size
      },
      performance: {
        addOrderTime: this.stats.addOrderTime,
        removeOrderTime: this.stats.removeOrderTime,
        modifyOrderTime: this.stats.modifyOrderTime,
        matchTime: this.stats.matchTime
      },
      users: this.userOrders.size
    };
  }
  
  // Clean up stale orders
  cleanupStaleOrders(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    const staleOrders = [];
    
    for (const [priceKey, level] of this.priceLevels.entries()) {
      const freshOrders = [];
      
      for (const order of level.orders) {
        if (now - order.timestamp > maxAge) {
          staleOrders.push(order.orderId);
        } else {
          freshOrders.push(order);
        }
      }
      
      if (freshOrders.length !== level.orders.length) {
        if (freshOrders.length === 0) {
          this.priceLevels.delete(priceKey);
          this.rebuildQueue(level.orders[0]?.side === 'buy' ? 'buy' : 'sell');
        } else {
          level.orders = freshOrders;
          level.totalQuantity = freshOrders.reduce(
            (sum, o) => sum.plus(o.quantity), 
            new Decimal(0)
          );
        }
      }
    }
    
    // Remove from order map and user orders
    for (const orderId of staleOrders) {
      const orderInfo = this.orderMap.get(orderId);
      if (orderInfo) {
        // Remove from user orders
        const order = this.getOrder(orderId);
        if (order?.userId) {
          const userOrders = this.userOrders.get(order.userId);
          if (userOrders) {
            userOrders.delete(orderId);
            if (userOrders.size === 0) {
              this.userOrders.delete(order.userId);
            }
          }
        }
        
        // Remove from order map
        this.orderMap.delete(orderId);
      }
    }
    
    return staleOrders.length;
  }
  
  // Destroy the order book and clean up resources
  destroy() {
    clearInterval(this.cleanupInterval);
    this.removeAllListeners();
    this.bids = new PriorityQueue((a, b) => b.price.cmp(a.price));
    this.asks = new PriorityQueue((a, b) => a.price.cmp(b.price));
    this.orderMap.clear();
    this.priceLevels.clear();
    this.userOrders.clear();
  }

  // Get a snapshot of the order book
  getSnapshot(depth = 20) {
    const { bids, asks } = this.getDepth(depth);
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    const spread = this.getSpread();
    
    return {
      symbol: this.symbol,
      timestamp: this.lastUpdate,
      bestBid: bestBid ? bestBid.price.toString() : null,
      bestAsk: bestAsk ? bestAsk.price.toString() : null,
      spread: spread ? spread.spread.toString() : null,
      spreadPercentage: spread ? spread.percentage : null,
      bids: bids.map(level => ({
        price: level.price.toString(),
        quantity: level.quantity.toString(),
        orders: level.orders
      })),
      asks: asks.map(level => ({
        price: level.price.toString(),
        quantity: level.quantity.toString(),
        orders: level.orders
  })),
      stats: {
        totalOrders: this.orderMap.size,
        bidLevels: this.bids.size(),
        askLevels: this.asks.size(),
        priceLevels: this.priceLevels.size,
        users: this.userOrders.size
      }
    };
  }
  
  // Get price levels for a side
  getLevels(side, depth = 10) {
    const bookSide = side === 'buy' ? this.bids : this.asks;
    const levels = [];
    const tempQueue = [];
    let count = 0;
    
    // Extract levels up to depth
    while (bookSide.size() > 0 && count < depth) {
      const level = bookSide.deq();
      tempQueue.push(level);
      levels.push({
        price: level.price,
        totalQuantity: level.totalQuantity,
        orders: level.orders.length
      });
      count++;
    }
    
    // Restore queue
    tempQueue.forEach(level => bookSide.enq(level));
    
    return levels;
  }
  
  // Get total order count
  getOrderCount() {
    return this.orderMap.size;
  }
  
  // Check if order book is empty
  isEmpty() {
    return this.bids.size() === 0 && this.asks.size() === 0;
  }
  
  // Clear all orders (use with caution!)
  clear() {
    this.bids = new PriorityQueue((a, b) => b.price.cmp(a.price));
    this.asks = new PriorityQueue((a, b) => a.price.cmp(b.price));
    this.orderMap.clear();
    this.priceLevels.clear();
    this.userOrders.clear();
    this.lastUpdate = Date.now();
    this.emit('orderbook_cleared');
  }

  // Get volume weighted average price for a given quantity and side
  getVolumeWeightedAveragePrice(side, quantity) {
    const bookSide = side === 'buy' ? this.asks : this.bids; // Opposite side for execution
    const tempLevels = [];
    let remainingQuantity = new Decimal(quantity);
    let totalValue = new Decimal(0);
    let totalQuantityFilled = new Decimal(0);
    
    // Extract levels from the queue
    while (bookSide.size() > 0 && remainingQuantity.gt(0)) {
      const level = bookSide.deq();
      tempLevels.push(level);
      
      const fillQuantity = Decimal.min(remainingQuantity, level.totalQuantity);
      totalValue = totalValue.plus(fillQuantity.times(level.price));
      totalQuantityFilled = totalQuantityFilled.plus(fillQuantity);
      remainingQuantity = remainingQuantity.minus(fillQuantity);
    }
    
    // Restore queue
    tempLevels.forEach(level => bookSide.enq(level));
    
    if (totalQuantityFilled.eq(0)) {
      return null;
    }
    
    return {
      vwap: totalValue.dividedBy(totalQuantityFilled),
      fillableQuantity: totalQuantityFilled,
      totalValue: totalValue,
      side,
      requestedQuantity: new Decimal(quantity)
    };
  }
  
  // Get mid price (average of best bid and ask)
  getMidPrice() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    
    if (!bestBid || !bestAsk) {
      return null;
    }
    
    return bestBid.price.plus(bestAsk.price).dividedBy(2);
  }
  
  // Calculate total notional value at a given price level
  getNotionalValue(price, side) {
    const bookSide = side === 'buy' ? this.bids : this.asks;
    const tempLevels = [];
    let totalNotional = new Decimal(0);
    
    while (bookSide.size() > 0) {
      const level = bookSide.deq();
      tempLevels.push(level);
      
      if ((side === 'buy' && level.price.lt(price)) ||
          (side === 'sell' && level.price.gt(price))) {
        break;
      }
      
      totalNotional = totalNotional.plus(level.totalQuantity.times(level.price));
    }
    
    // Restore queue
    tempLevels.forEach(level => bookSide.enq(level));
    
    return totalNotional;
  }
  
  // Get all orders (use with caution for large order books)
  getAllOrders() {
    const orders = [];
    
    for (const [orderId] of this.orderMap) {
      const order = this.getOrder(orderId);
      if (order) {
        orders.push(order);
      }
    }
    
    return orders;
  }
  
  // Get total volume (sum of all order quantities)
  getTotalVolume() {
    let totalVolume = new Decimal(0);
    
    for (const level of this.priceLevels.values()) {
      totalVolume = totalVolume.plus(level.totalQuantity);
    }
    
    return totalVolume;
  }
  
  // Get price levels for a queue
  getQueueLevels(queue, depth) {
    const levels = [];
    const tempLevels = [];
    let count = 0;
    
    // Extract levels up to depth
    while (queue.size() > 0 && count < depth) {
      const level = queue.deq();
      tempLevels.push(level);
      levels.push({
        price: level.price,
        totalQuantity: level.totalQuantity,
        orders: level.orders.length
      });
      count++;
    }
    
    // Restore queue
    tempLevels.forEach(level => queue.enq(level));
    
    return levels;
  }
  
  // Calculate the price impact of a market order
  calculatePriceImpact(side, quantity) {
    const bookSide = side === 'buy' ? this.asks : this.bids;
    const tempLevels = [];
    let remainingQty = new Decimal(quantity);
    let totalCost = new Decimal(0);
    let impactPrice = null;
    
    // Calculate impact by walking the order book
    while (bookSide.size() > 0 && remainingQty.gt(0)) {
      const level = bookSide.deq();
      tempLevels.push(level);
      
      const fillQty = Decimal.min(remainingQty, level.totalQuantity);
      totalCost = totalCost.plus(fillQty.times(level.price));
      remainingQty = remainingQty.minus(fillQty);
      impactPrice = level.price;
    }
    
    // Restore queue
    tempLevels.forEach(level => bookSide.enq(level));
    
    if (remainingQty.gt(0)) {
      // Not enough liquidity
      return {
        canFill: false,
        fillableQuantity: new Decimal(quantity).minus(remainingQty),
        impactPrice: impactPrice ? impactPrice.toString() : null,
        averagePrice: totalCost.dividedBy(quantity - remainingQty).toString(),
        remainingQuantity: remainingQty.toString()
      };
    }
    
    // Calculate price impact
    const averagePrice = totalCost.dividedBy(quantity);
    const midPrice = this.getMidPrice();
    
    let priceImpact = new Decimal(0);
    if (midPrice) {
      priceImpact = side === 'buy' 
        ? averagePrice.minus(midPrice).dividedBy(midPrice)
        : midPrice.minus(averagePrice).dividedBy(midPrice);
    }
    
    return {
      canFill: true,
      fillableQuantity: new Decimal(quantity),
      averagePrice: averagePrice.toString(),
      priceImpact: priceImpact.toString(),
      totalCost: totalCost.toString()
    };
  }
  
  // Get total number of orders
  getTotalOrders() {
    return this.orderMap.size;
  }
}

module.exports = OrderBook;