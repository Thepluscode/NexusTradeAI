const EventEmitter = require('events');
const PriorityQueue = require('priorityqueuejs');
const Decimal = require('decimal.js');
const { nanoid } = require('nanoid');
const OrderBook = require('./orderBook');
const FillGenerator = require('./fillGenerator');

class MatchingEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.orderBooks = new Map(); // symbol -> OrderBook
    this.fillGenerator = new FillGenerator({ logger: this.logger });
    this.isInitialized = false;
    
    // Enhanced configuration
    this.config = {
      enablePreTradeRisk: true,
      enablePostTradeRisk: true,
      maxOrdersPerSymbol: 50000,
      priceIncrements: new Map([
        ['STOCK', 0.01],
        ['CRYPTO', 0.00001],
        ['FOREX', 0.00001],
        ['COMMODITY', 0.01]
      ]),
      matchingAlgorithm: 'PRICE_TIME_PRIORITY'
    };
    
    // Enhanced statistics
    this.stats = {
      totalMatches: 0,
      totalOrders: 0,
      totalTrades: 0,
      totalVolume: new Decimal(0),
      avgMatchingTime: 0,
      throughput: 0,
      lastProcessingTime: null
    };
    
    // Active symbols tracking
    this.activeSymbols = new Set();
  }

  async initialize() {
    try {
      this.logger?.info('Initializing MatchingEngine...');
      
      // Initialize fill generator
      await this.fillGenerator.initialize();
      
      // Load active symbols and create order books
      await this.loadActiveSymbols();
      
      // Setup performance monitoring
      this.setupPerformanceMonitoring();
      
      this.isInitialized = true;
      this.logger?.info('MatchingEngine initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize MatchingEngine:', error);
      throw error;
    }
  }
  
  async loadActiveSymbols() {
    // Load from configuration or database
    const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'BTCUSDT', 'ETHUSDT'];
    
    for (const symbol of symbols) {
      await this.createOrderBook(symbol);
      this.activeSymbols.add(symbol);
    }
  }
  
  setupPerformanceMonitoring() {
    setInterval(() => {
      this.logPerformanceStats();
    }, 60000); // Every minute
  }
  
  logPerformanceStats() {
    const totalOrdersInBooks = Array.from(this.orderBooks.values())
      .reduce((sum, book) => sum + book.getTotalOrders(), 0);
    
    this.logger?.info('MatchingEngine performance:', {
      totalOrderBooks: this.orderBooks.size,
      totalOrdersInBooks,
      totalMatches: this.stats.totalMatches,
      avgMatchingTime: `${this.stats.avgMatchingTime.toFixed(3)}ms`,
      throughput: `${this.stats.throughput.toFixed(2)} orders/sec`
    });
  }

  validateOrder(order) {
    // Basic validation
    if (!order.id || !order.symbol || !order.side || !order.type || !order.quantity) {
      throw new Error('Missing required order fields');
    }
    
    if (!['buy', 'sell'].includes(order.side.toLowerCase())) {
      throw new Error('Invalid order side');
    }
    
    if (!['market', 'limit', 'stop', 'stop_limit'].includes(order.type.toLowerCase())) {
      throw new Error('Invalid order type');
    }
    
    const quantity = new Decimal(order.quantity);
    if (quantity.lte(0)) {
      throw new Error('Order quantity must be positive');
    }
    
    // Price validation for limit orders
    if (['limit', 'stop_limit'].includes(order.type.toLowerCase()) && 
        (!order.price || new Decimal(order.price).lte(0))) {
      throw new Error('Limit orders require a positive price');
    }
  }

  async performPreTradeRisk(order) {
    // Mock pre-trade risk checks
    const orderValue = new Decimal(order.quantity).times(order.price || 0);
    
    if (orderValue.gt(1000000)) { // $1M limit
      throw new Error('Order value exceeds risk limit');
    }
    
    // Additional risk checks can be added here
  }
  
  async performPostTradeRisk(trades) {
    // Mock post-trade risk checks
    const totalValue = trades.reduce((sum, trade) => 
      sum + (trade.quantity * trade.price), 0
    );
    
    if (totalValue > 5000000) { // $5M limit
      this.logger?.warn('Large trade value detected:', totalValue);
      this.emit('risk_alert', { 
        type: 'large_trade_value', 
        value: totalValue,
        trades: trades.map(t => t.id)
      });
    }
  }
  
  updateMatchingMetrics(order, result, processingTime) {
    this.stats.totalOrders++;
    this.stats.totalMatches += result.trades?.length || 0;
    
    // Update average processing time
    const totalTime = this.stats.avgMatchingTime * (this.stats.totalOrders - 1) + processingTime;
    this.stats.avgMatchingTime = totalTime / this.stats.totalOrders;
    
    // Update throughput (orders per second)
    const now = Date.now();
    if (this.stats.lastProcessingTime) {
      const timeDiff = (now - this.stats.lastProcessingTime) / 1000;
      this.stats.throughput = 1 / timeDiff;
    }
    this.stats.lastProcessingTime = now;
    
    // Update metrics if metrics service is available
    if (this.metrics?.orderCounter) {
      this.metrics.orderCounter.inc({
        type: order.type,
        status: result.status,
        symbol: order.symbol
      });
    }
  }
  
  async processMarketOrder(orderBook, order) {
    const side = order.side.toLowerCase();
    const quantity = new Decimal(order.quantity);
    let remainingQuantity = quantity;
    const trades = [];
    
    // Get opposite side orders for matching
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';
    const matchingLevels = orderBook.getBestOrders(oppositeSide, 10);
    
    for (const level of matchingLevels) {
      if (remainingQuantity.lte(0)) break;
      
      // Get all orders at this price level (already sorted by time priority)
      const ordersAtLevel = level.orders;
      
      for (const matchingOrder of ordersAtLevel) {
        if (remainingQuantity.lte(0)) break;
        
        const orderQty = new Decimal(matchingOrder.quantity);
        const tradeQuantity = Decimal.min(remainingQuantity, orderQty);
        const tradePrice = new Decimal(matchingOrder.price);
        
        // Generate fill
        const fill = await this.fillGenerator.generateFill({
          takerOrder: order,
          makerPrice: matchingOrder.price,
          quantity: tradeQuantity.toNumber(),
          venue: 'internal'
        });
        
        // Create trade object
        const trade = {
          id: `trd_${Date.now()}_${this.stats.totalTrades}`,
          symbol: order.symbol,
          price: tradePrice.toNumber(),
          quantity: tradeQuantity.toNumber(),
          side: side,
          takerOrderId: order.id,
          makerOrderId: matchingOrder.id,
          timestamp: new Date(),
          fee: 0 // Will be calculated by fill manager
        };
        
        trades.push(trade);
        
        // Update remaining quantity
        remainingQuantity = remainingQuantity.minus(tradeQuantity);
        
        // Update or remove the maker order
        if (tradeQuantity.lt(orderQty)) {
          // Partial fill - update remaining quantity
          orderBook.modifyOrder(matchingOrder.id, orderQty.minus(tradeQuantity).toNumber());
        } else {
          // Full fill - remove the order
          orderBook.removeOrder(matchingOrder.id);
        }
        
        this.stats.totalTrades++;
        this.stats.totalVolume = this.stats.totalVolume.plus(tradePrice.times(tradeQuantity));
        
        // Emit trade event
        this.emit('trade', trade);
      }
    }
    
    const executedQty = quantity.minus(remainingQuantity);
    const status = remainingQuantity.lte(0) ? 'filled' : 
                  executedQty.gt(0) ? 'partially_filled' : 'rejected';
    
    // If no fills and this is a market order, reject it
    if (trades.length === 0 && status !== 'filled') {
      throw new Error('Insufficient liquidity for market order');
    }
    
    return {
      orderId: order.id,
      status,
      trades,
      remainingQuantity: remainingQuantity.toNumber(),
      executedQuantity: executedQty.toNumber(),
      averagePrice: executedQty.gt(0) ? 
        trades.reduce((sum, t) => sum.plus(new Decimal(t.price).times(t.quantity)), new Decimal(0))
          .dividedBy(executedQty).toNumber() : 0
    };
  }
  
  async processLimitOrder(orderBook, order) {
    const side = order.side.toLowerCase();
    const quantity = new Decimal(order.quantity);
    const limitPrice = new Decimal(order.price);
    let remainingQuantity = quantity;
    const trades = [];
    
    // Only try to match if the order is aggressive (marketable)
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';
    const bestOppositePrice = side === 'buy' ? 
      orderBook.getBestAsk()?.price : 
      orderBook.getBestBid()?.price;
    
    // Check if order is marketable (can be matched immediately)
    const isMarketable = bestOppositePrice && (
      (side === 'buy' && limitPrice.gte(bestOppositePrice)) ||
      (side === 'sell' && limitPrice.lte(bestOppositePrice))
    );
    
    if (isMarketable) {
      const matchingLevels = orderBook.getBestOrders(oppositeSide, 10);
      
      for (const level of matchingLevels) {
        if (remainingQuantity.lte(0)) break;
        
        // Check if price is still within limit
        const levelPrice = new Decimal(level.price);
        const priceCheck = side === 'buy' ? 
          levelPrice.lte(limitPrice) : 
          levelPrice.gte(limitPrice);
          
        if (!priceCheck) break;
        
        // Get all orders at this price level (already sorted by time priority)
        const ordersAtLevel = level.orders;
        
        for (const matchingOrder of ordersAtLevel) {
          if (remainingQuantity.lte(0)) break;
          
          const orderQty = new Decimal(matchingOrder.quantity);
          const tradeQuantity = Decimal.min(remainingQuantity, orderQty);
          
          // Generate fill
          const fill = await this.fillGenerator.generateFill({
            takerOrder: order,
            makerPrice: matchingOrder.price,
            quantity: tradeQuantity.toNumber(),
            venue: 'internal'
          });
          
          // Create trade object
          const trade = {
            id: `trd_${Date.now()}_${this.stats.totalTrades}`,
            symbol: order.symbol,
            price: levelPrice.toNumber(),
            quantity: tradeQuantity.toNumber(),
            side: side,
            takerOrderId: order.id,
            makerOrderId: matchingOrder.id,
            timestamp: new Date(),
            fee: 0 // Will be calculated by fill manager
          };
          
          trades.push(trade);
          
          // Update remaining quantity
          remainingQuantity = remainingQuantity.minus(tradeQuantity);
          
          // Update or remove the maker order
          if (tradeQuantity.lt(orderQty)) {
            // Partial fill - update remaining quantity
            orderBook.modifyOrder(matchingOrder.id, orderQty.minus(tradeQuantity).toNumber());
          } else {
            // Full fill - remove the order
            orderBook.removeOrder(matchingOrder.id);
          }
          
          this.stats.totalTrades++;
          this.stats.totalVolume = this.stats.totalVolume.plus(levelPrice.times(tradeQuantity));
          
          // Emit trade event
          this.emit('trade', trade);
        }
      }
    }
    
    // Add remaining quantity to order book if any
    if (remainingQuantity.gt(0)) {
      const bookOrder = {
        ...order,
        id: order.id || `order_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        price: limitPrice.toNumber(),
        quantity: remainingQuantity.toNumber(),
        originalQuantity: quantity.toNumber(),
        timestamp: new Date(),
        status: 'open'
      };
      
      try {
        orderBook.addOrder(bookOrder);
      } catch (error) {
        this.logger?.error('Error adding order to book:', error);
        throw error;
      }
    }
    
    const executedQty = quantity.minus(remainingQuantity);
    let status = 'open';
    
    if (executedQty.gt(0)) {
      status = remainingQuantity.gt(0) ? 'partially_filled' : 'filled';
    }
    
    return {
      orderId: order.id,
      status,
      trades,
      remainingQuantity: remainingQuantity.toNumber(),
      executedQuantity: executedQty.toNumber(),
      averagePrice: executedQty.gt(0) ? 
        trades.reduce((sum, t) => sum.plus(new Decimal(t.price).times(t.quantity)), new Decimal(0))
          .dividedBy(executedQty).toNumber() : 0
    };
  }
  
  async processStopOrder(orderBook, order) {
    const { stopPrice, quantity, symbol } = order;
    
    if (!stopPrice) {
      throw new Error('Stop price is required for stop order');
    }
    
    // Check if stop price has been triggered
    const lastPrice = this.getLastTradedPrice(symbol);
    if (!lastPrice) {
      throw new Error('Unable to determine last traded price');
    }
    
    const isBuyOrder = order.side.toLowerCase() === 'buy';
    const isTriggered = isBuyOrder ? 
      lastPrice >= stopPrice : // Buy stop triggers when price rises to or above stop price
      lastPrice <= stopPrice;  // Sell stop triggers when price falls to or below stop price
    
    if (!isTriggered) {
      // Add to stop order book if not triggered
      const stopOrder = {
        ...order,
        id: order.id || `stop_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        timestamp: new Date(),
        status: 'pending'
      };
      
      this.addStopOrder(stopOrder);
      
      return {
        orderId: stopOrder.id,
        status: 'pending',
        trades: [],
        message: 'Stop order added to trigger queue',
        triggerPrice: stopPrice,
        lastPrice
      };
    }
    
    // If triggered, process as market order
    this.logger?.info(`Stop order ${order.id} triggered at price ${lastPrice}`);
    
    // Create a market order with the same parameters
    const marketOrder = {
      ...order,
      type: 'market',
      timestamp: new Date()
    };
    
    return this.processMarketOrder(orderBook, marketOrder);
  }
  
  async processStopLimitOrder(orderBook, order) {
    const { stopPrice, limitPrice, quantity, symbol } = order;
    
    if (!stopPrice || !limitPrice) {
      throw new Error('Stop price and limit price are required for stop-limit order');
    }
    
    // Check if stop price has been triggered
    const lastPrice = this.getLastTradedPrice(symbol);
    if (!lastPrice) {
      throw new Error('Unable to determine last traded price');
    }
    
    const isBuyOrder = order.side.toLowerCase() === 'buy';
    const isTriggered = isBuyOrder ? 
      lastPrice >= stopPrice : // Buy stop triggers when price rises to or above stop price
      lastPrice <= stopPrice;  // Sell stop triggers when price falls to or below stop price
    
    if (!isTriggered) {
      // Add to stop order book if not triggered
      const stopLimitOrder = {
        ...order,
        id: order.id || `stop_limit_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        timestamp: new Date(),
        status: 'pending',
        price: limitPrice, // Use limit price for the actual order
        stopPrice
      };
      
      this.addStopOrder(stopLimitOrder);
      
      return {
        orderId: stopLimitOrder.id,
        status: 'pending',
        trades: [],
        message: 'Stop-limit order added to trigger queue',
        triggerPrice: stopPrice,
        limitPrice,
        lastPrice
      };
    }
    
    // If triggered, process as limit order
    this.logger?.info(`Stop-limit order ${order.id} triggered at price ${lastPrice}`);
    
    // Create a limit order with the specified limit price
    const limitOrder = {
      ...order,
      type: 'limit',
      price: limitPrice,
      timestamp: new Date()
    };
    
    return this.processLimitOrder(orderBook, limitOrder);
  }
  
  // Helper methods for stop order management
  addStopOrder(order) {
    if (!this.stopOrders) {
      this.stopOrders = new Map();
    }
    
    const symbol = order.symbol;
    if (!this.stopOrders.has(symbol)) {
      this.stopOrders.set(symbol, []);
    }
    
    this.stopOrders.get(symbol).push(order);
    this.emit('stop_order_added', order);
  }
  
  getLastTradedPrice(symbol) {
    // In a real implementation, this would get the last traded price from the market data service
    // For now, we'll return the mid-price from the order book
    const orderBook = this.orderBooks.get(symbol);
    if (!orderBook) return null;
    
    const bestBid = orderBook.getBestBid();
    const bestAsk = orderBook.getBestAsk();
    
    if (!bestBid || !bestAsk) return null;
    
    return (bestBid.price + bestAsk.price) / 2;
  }
  
  // Method to check and trigger stop orders
  checkStopOrders(symbol, lastPrice) {
    if (!this.stopOrders || !this.stopOrders.has(symbol)) {
      return;
    }
    
    const symbolStopOrders = this.stopOrders.get(symbol) || [];
    const triggeredOrders = [];
    
    for (const order of symbolStopOrders) {
      const isBuyOrder = order.side.toLowerCase() === 'buy';
      const isTriggered = isBuyOrder ? 
        lastPrice >= order.stopPrice : // Buy stop triggers when price rises to or above stop price
        lastPrice <= order.stopPrice;  // Sell stop triggers when price falls to or below stop price
      
      if (isTriggered) {
        triggeredOrders.push(order);
      }
    }
    
    // Process triggered orders
    triggeredOrders.forEach(order => {
      // Remove from stop orders
      this.stopOrders.set(symbol, 
        symbolStopOrders.filter(o => o.id !== order.id)
      );
      
      // Process the order based on its type
      const orderBook = this.orderBooks.get(symbol);
      if (!orderBook) return;
      
      if (order.type === 'stop') {
        this.processStopOrder(orderBook, order);
      } else if (order.type === 'stop_limit') {
        this.processStopLimitOrder(orderBook, order);
      }
    });
  }
  
  // Event handlers
  handleOrderMatched(trade) {
    // Update statistics
    this.stats.totalTrades++;
    this.stats.totalVolume = this.stats.totalVolume.plus(
      new Decimal(trade.quantity).times(trade.price)
    );
    
    // Emit trade event
    this.emit('trade', trade);
    
    // Log the trade
    this.logger?.info(`Trade executed: ${trade.quantity} @ ${trade.price}`, {
      symbol: trade.symbol,
      tradeId: trade.id,
      buyOrder: trade.buyOrderId,
      sellOrder: trade.sellOrderId
    });
  }
  
  // Cleanup resources
  async shutdown() {
    this.logger?.info('Shutting down MatchingEngine...');
    
    // Save any pending state
    await this.saveState();
    
    // Clear any intervals
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
    
    this.isInitialized = false;
    this.logger?.info('MatchingEngine shutdown complete');
  }
  
  // Internal methods
  async loadActiveSymbols() {
    // In a real implementation, this would load active symbols from a database
    this.logger?.debug('Loading active symbols...');
    // No-op for now
  }
  
  setupPerformanceMonitoring() {
    // Log performance stats every minute
    this.performanceInterval = setInterval(() => {
      this.logPerformanceStats();
    }, 60000);
    
    // Log initial stats
    this.logPerformanceStats();
  }
  
  async saveState() {
    // In a real implementation, this would save the current state
    this.logger?.debug('Saving MatchingEngine state...');
    // No-op for now
  }

  async processOrder(order) {
    const startTime = process.hrtime.bigint();
    
    try {
      this.logger?.debug(`Processing order in matching engine: ${order.id}`, {
        symbol: order.symbol,
        side: order.side,
        quantity: order.quantity,
        type: order.type
      });
      
      // Validate order
      this.validateOrder(order);
      
      // Pre-trade risk checks
      if (this.config.enablePreTradeRisk) {
        await this.performPreTradeRisk(order);
      }
      
      // Get or create order book for symbol
      let orderBook = this.orderBooks.get(order.symbol);
      if (!orderBook) {
        orderBook = await this.createOrderBook(order.symbol);
      }
      
      let result;
      
      // Process order based on type
      switch (order.type.toLowerCase()) {
        case 'market':
          result = await this.processMarketOrder(orderBook, order);
          break;
        case 'limit':
          result = await this.processLimitOrder(orderBook, order);
          break;
        case 'stop':
          result = await this.processStopOrder(orderBook, order);
          break;
        case 'stop_limit':
          result = await this.processStopLimitOrder(orderBook, order);
          break;
        default:
          throw new Error(`Unsupported order type: ${order.type}`);
      }
      
      // Post-trade risk checks
      if (this.config.enablePostTradeRisk && result.trades?.length > 0) {
        await this.performPostTradeRisk(result.trades);
      }
      
      // Update metrics
      const processingTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.updateMatchingMetrics(order, result, processingTime);
      
      // Emit events
      this.emit('order_processed', { order, result });
      
      if (result.trades?.length > 0) {
        result.trades.forEach(trade => {
          this.emit('trade_executed', trade);
        });
      }
      
      this.logger?.debug(`Order processed in ${processingTime.toFixed(3)}ms: ${order.id}`, {
        status: result.status,
        fills: result.trades?.length || 0,
        remainingQuantity: result.remainingQuantity?.toString() || '0'
      });
      
      return result;
      
    } catch (error) {
      this.logger?.error(`Error processing order ${order.id}:`, error);
      this.emit('order_rejected', { order, reason: error.message });
      throw error;
    }
  }

  async processMarketOrder(order, orderBook) {
    const result = {
      orderId: order.id,
      status: 'pending',
      fills: [],
      remainingQuantity: new Decimal(order.quantity)
    };
    
    try {
      // Market orders execute immediately against the best available prices
      const oppositeBook = order.side === 'buy' ? orderBook.asks : orderBook.bids;
      
      while (result.remainingQuantity.gt(0) && oppositeBook.size() > 0) {
        const bestLevel = oppositeBook.peek();
        if (!bestLevel) break;
        
        const matchQuantity = Decimal.min(result.remainingQuantity, bestLevel.totalQuantity);
        
        // Generate fill
        const fill = await this.fillGenerator.generateFill({
          takerOrder: order,
          makerPrice: bestLevel.price,
          quantity: matchQuantity,
          venue: 'internal'
        });
        
        result.fills.push(fill);
        result.remainingQuantity = result.remainingQuantity.minus(matchQuantity);
        
        // Remove matched quantity from order book
        this.removeFromOrderBook(oppositeBook, bestLevel, matchQuantity);
        
        // Emit fill event
        this.emit('fill_generated', fill);
      }
      
      // Determine final status
      if (result.remainingQuantity.eq(0)) {
        result.status = 'filled';
      } else if (result.fills.length > 0) {
        result.status = 'partial';
      } else {
        result.status = 'rejected';
        result.reason = 'No liquidity available';
      }
      
      return result;
      
    } catch (error) {
      this.logger?.error(`Error processing market order ${order.id}:`, error);
      result.status = 'failed';
      result.error = error.message;
      return result;
    }
  }

  async processLimitOrder(order, orderBook) {
    const result = {
      orderId: order.id,
      status: 'pending',
      fills: [],
      remainingQuantity: new Decimal(order.quantity)
    };
    
    try {
      const oppositeBook = order.side === 'buy' ? orderBook.asks : orderBook.bids;
      
      // Check for immediate fills
      while (result.remainingQuantity.gt(0) && oppositeBook.size() > 0) {
        const bestLevel = oppositeBook.peek();
        if (!bestLevel) break;
        
        // Check if prices cross
        const canMatch = order.side === 'buy' 
          ? new Decimal(order.price).gte(bestLevel.price)
          : new Decimal(order.price).lte(bestLevel.price);
        
        if (!canMatch) break;
        
        const matchQuantity = Decimal.min(result.remainingQuantity, bestLevel.totalQuantity);
        
        // Generate fill
        const fill = await this.fillGenerator.generateFill({
          takerOrder: order,
          makerPrice: bestLevel.price,
          quantity: matchQuantity,
          venue: 'internal'
        });
        
        result.fills.push(fill);
        result.remainingQuantity = result.remainingQuantity.minus(matchQuantity);
        
        // Remove matched quantity from order book
        this.removeFromOrderBook(oppositeBook, bestLevel, matchQuantity);
        
        // Emit fill event
        this.emit('fill_generated', fill);
      }
      
      // Add remaining quantity to order book if any
      if (result.remainingQuantity.gt(0)) {
        const ownBook = order.side === 'buy' ? orderBook.bids : orderBook.asks;
        this.addToOrderBook(ownBook, {
          orderId: order.id,
          price: new Decimal(order.price),
          quantity: result.remainingQuantity,
          timestamp: Date.now(),
          userId: order.userId
        });
      }
      
      // Determine final status
      if (result.remainingQuantity.eq(0)) {
        result.status = 'filled';
      } else if (result.fills.length > 0) {
        result.status = 'partial';
      } else {
        result.status = 'pending';
      }
      
      return result;
      
    } catch (error) {
      this.logger?.error(`Error processing limit order ${order.id}:`, error);
      result.status = 'failed';
      result.error = error.message;
      return result;
    }
  }

  async processStopOrder(order, orderBook) {
    // Stop orders become market orders when triggered
    const currentPrice = this.getCurrentPrice(order.symbol);
    const stopPrice = new Decimal(order.stopPrice);
    
    const isTriggered = order.side === 'buy' 
      ? currentPrice.gte(stopPrice)
      : currentPrice.lte(stopPrice);
    
    if (isTriggered) {
      // Convert to market order
      const marketOrder = { ...order, type: 'market' };
      return await this.processMarketOrder(marketOrder, orderBook);
    } else {
      // Add to stop order tracking
      return {
        orderId: order.id,
        status: 'pending',
        fills: [],
        remainingQuantity: new Decimal(order.quantity),
        reason: 'Stop order placed, waiting for trigger'
      };
    }
  }

  async processStopLimitOrder(order, orderBook) {
    // Similar to stop order but becomes limit order when triggered
    const currentPrice = this.getCurrentPrice(order.symbol);
    const stopPrice = new Decimal(order.stopPrice);
    
    const isTriggered = order.side === 'buy' 
      ? currentPrice.gte(stopPrice)
      : currentPrice.lte(stopPrice);
    
    if (isTriggered) {
      // Convert to limit order
      const limitOrder = { ...order, type: 'limit' };
      return await this.processLimitOrder(limitOrder, orderBook);
    } else {
      // Add to stop order tracking
      return {
        orderId: order.id,
        status: 'pending',
        fills: [],
        remainingQuantity: new Decimal(order.quantity),
        reason: 'Stop-limit order placed, waiting for trigger'
      };
    }
  }

  getOrderBook(symbol) {
    if (!this.orderBooks.has(symbol)) {
      this.orderBooks.set(symbol, new OrderBook(symbol, {
        logger: this.logger,
        maxOrders: this.maxOrdersPerSymbol
      }));
    }
    return this.orderBooks.get(symbol);
  }

  addToOrderBook(book, orderData) {
    book.add(orderData);
  }

  removeFromOrderBook(book, level, quantity) {
    level.totalQuantity = level.totalQuantity.minus(quantity);
    
    if (level.totalQuantity.lte(0)) {
      book.deq();
    }
  }

  async cancelOrder(orderId) {
    try {
      // Find and remove order from all order books
      for (const [symbol, orderBook] of this.orderBooks) {
        const removed = orderBook.removeOrder(orderId);
        if (removed) {
          this.logger?.debug(`Order ${orderId} cancelled from ${symbol} order book`);
          return true;
        }
      }
      
      return false;
      
    } catch (error) {
      this.logger?.error(`Error cancelling order ${orderId}:`, error);
      throw error;
    }
  }

  getCurrentPrice(symbol) {
    const orderBook = this.orderBooks.get(symbol);
    if (!orderBook) {
      return new Decimal(0);
    }
    
    const bestBid = orderBook.bids.size() > 0 ? orderBook.bids.peek().price : new Decimal(0);
    const bestAsk = orderBook.asks.size() > 0 ? orderBook.asks.peek().price : new Decimal(0);
    
    if (bestBid.gt(0) && bestAsk.gt(0)) {
      return bestBid.plus(bestAsk).dividedBy(2);
    }
    
    return bestBid.gt(0) ? bestBid : bestAsk;
  }

  async getOrderBook(symbol, depth = 20) {
    try {
      const orderBook = this.orderBooks.get(symbol);
      if (!orderBook) {
        return {
          symbol,
          bids: [],
          asks: [],
          timestamp: Date.now()
        };
      }
      
      return orderBook.getSnapshot(depth);
      
    } catch (error) {
      this.logger?.error(`Error getting order book for ${symbol}:`, error);
      throw error;
    }
  }

  updateStats(matchTime, fills) {
    this.stats.totalMatches++;
    this.stats.lastMatchTime = matchTime;
    
    // Update average match time (exponential moving average)
    const alpha = 0.1;
    this.stats.averageMatchTime = this.stats.averageMatchTime === 0 
      ? matchTime 
      : (alpha * matchTime) + ((1 - alpha) * this.stats.averageMatchTime);
    
    // Update total volume
    for (const fill of fills) {
      this.stats.totalVolume = this.stats.totalVolume.plus(
        new Decimal(fill.quantity).times(fill.price)
      );
    }
  }

  getStats() {
    return {
      ...this.stats,
      totalVolume: this.stats.totalVolume.toString(),
      orderBooksCount: this.orderBooks.size,
      totalOrdersInBooks: Array.from(this.orderBooks.values())
        .reduce((sum, book) => sum + book.getTotalOrders(), 0)
    };
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      orderBooksCount: this.orderBooks.size,
      stats: this.getStats()
    };
  }

  // Clean up empty order books periodically
  cleanupOrderBooks() {
    for (const [symbol, orderBook] of this.orderBooks) {
      if (orderBook.isEmpty()) {
        this.orderBooks.delete(symbol);
        this.logger?.debug(`Cleaned up empty order book for ${symbol}`);
      }
    }
  }
}

module.exports = MatchingEngine;
