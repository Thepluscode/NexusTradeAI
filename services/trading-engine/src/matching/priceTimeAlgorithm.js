// src/matching/priceTimeAlgorithm.js
const Decimal = require('decimal.js');

class PriceTimeAlgorithm {
  constructor(options = {}) {
    this.logger = options.logger;
    this.name = 'Price-Time Priority';
    
    // Algorithm configuration
    this.config = {
      enableTimeBreaking: true,     // Break ties using time priority
      enableSizeDiscounts: false,   // Size-based matching priority
      minimumBlockSize: 100,        // Minimum size for block orders
      maxPriceLevels: 20           // Maximum price levels to consider
    };
  }

  /**
   * Match incoming order against order book using price-time priority
   */
  matchOrder(orderBook, incomingOrder) {
    const matches = [];
    const side = incomingOrder.side.toLowerCase();
    const quantity = new Decimal(incomingOrder.quantity);
    let remainingQuantity = quantity;
    
    // Get opposite side orders for matching
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';
    const matchableLevels = this.getMatchableLevels(orderBook, incomingOrder, oppositeSide);
    
    for (const level of matchableLevels) {
      if (remainingQuantity.lte(0)) break;
      
      // Sort orders at this price level by time priority
      const sortedOrders = this.sortOrdersByPriority(level.orders);
      
      for (const order of sortedOrders) {
        if (remainingQuantity.lte(0)) break;
        
        const matchQuantity = Decimal.min(remainingQuantity, new Decimal(order.quantity));
        
        matches.push({
          makerOrder: order,
          takerOrder: incomingOrder,
          quantity: matchQuantity.toNumber(),
          price: order.price,
          timestamp: new Date()
        });
        
        remainingQuantity = remainingQuantity.minus(matchQuantity);
      }
    }
    
    return {
      matches,
      remainingQuantity: remainingQuantity.toNumber(),
      fullyMatched: remainingQuantity.lte(0)
    };
  }

  /**
   * Get price levels that can match with incoming order
   */
  getMatchableLevels(orderBook, incomingOrder, oppositeSide) {
    const matchableLevels = [];
    const incomingPrice = new Decimal(incomingOrder.price || 0);
    const orderType = incomingOrder.type.toLowerCase();
    
    // Get available price levels from order book
    const availableLevels = orderBook.getBestOrders(oppositeSide, this.config.maxPriceLevels);
    
    for (const level of availableLevels) {
      const levelPrice = new Decimal(level.price);
      
      if (this.canMatch(incomingOrder, levelPrice, orderType)) {
        matchableLevels.push(level);
      } else {
        // Stop at first non-matchable level due to price-time priority
        break;
      }
    }
    
    return matchableLevels;
  }

  /**
   * Determine if incoming order can match at given price level
   */
  canMatch(incomingOrder, levelPrice, orderType) {
    const side = incomingOrder.side.toLowerCase();
    
    switch (orderType) {
      case 'market':
        return true; // Market orders can match at any price
        
      case 'limit':
        const limitPrice = new Decimal(incomingOrder.price);
        if (side === 'buy') {
          return levelPrice.lte(limitPrice); // Buy can match at or below limit
        } else {
          return levelPrice.gte(limitPrice); // Sell can match at or above limit
        }
        
      case 'stop':
        const stopPrice = new Decimal(incomingOrder.stopPrice);
        if (side === 'buy') {
          return levelPrice.gte(stopPrice); // Buy stop triggered when price rises
        } else {
          return levelPrice.lte(stopPrice); // Sell stop triggered when price falls
        }
        
      default:
        return false;
    }
  }

  /**
   * Sort orders by priority (price first, then time)
   */
  sortOrdersByPriority(orders) {
    return [...orders].sort((a, b) => {
      // Primary: Time priority (earlier orders first)
      if (this.config.enableTimeBreaking) {
        const timeA = a.sequence || a.timestamp?.getTime() || 0;
        const timeB = b.sequence || b.timestamp?.getTime() || 0;
        
        if (timeA !== timeB) {
          return timeA - timeB;
        }
      }
      
      // Secondary: Size priority (if enabled)
      if (this.config.enableSizeDiscounts) {
        return b.quantity - a.quantity; // Larger orders first
      }
      
      return 0; // Equal priority
    });
  }

  /**
   * Calculate price improvement for better execution
   */
  calculatePriceImprovement(orderBook, incomingOrder) {
    const side = incomingOrder.side.toLowerCase();
    const bestBid = orderBook.getBestBid();
    const bestAsk = orderBook.getBestAsk();
    
    if (!bestBid || !bestAsk) {
      return null;
    }
    
    const midPrice = (bestBid.price + bestAsk.price) / 2;
    const spread = bestAsk.price - bestBid.price;
    
    // Price improvement opportunities
    let improvedPrice = null;
    
    if (side === 'buy' && incomingOrder.type === 'limit') {
      const limitPrice = parseFloat(incomingOrder.price);
      if (limitPrice >= midPrice) {
        // Aggressive buy order - can improve by paying less than limit
        improvedPrice = Math.max(bestBid.price + orderBook.priceIncrement, midPrice);
      }
    } else if (side === 'sell' && incomingOrder.type === 'limit') {
      const limitPrice = parseFloat(incomingOrder.price);
      if (limitPrice <= midPrice) {
        // Aggressive sell order - can improve by receiving more than limit
        improvedPrice = Math.min(bestAsk.price - orderBook.priceIncrement, midPrice);
      }
    }
    
    return {
      currentMidPrice: midPrice,
      currentSpread: spread,
      improvedPrice,
      improvement: improvedPrice ? Math.abs(improvedPrice - midPrice) : 0
    };
  }

  /**
   * Match block orders with special handling
   */
  matchBlockOrder(orderBook, blockOrder) {
    if (blockOrder.quantity < this.config.minimumBlockSize) {
      // Not a block order, use regular matching
      return this.matchOrder(orderBook, blockOrder);
    }
    
    const matches = [];
    const side = blockOrder.side.toLowerCase();
    const oppositeSide = side === 'buy' ? 'sell' : 'buy';
    
    // Look for other block orders first
    const blockMatches = this.findBlockMatches(orderBook, blockOrder, oppositeSide);
    
    if (blockMatches.length > 0) {
      // Execute block crosses at mid-price
      const midPrice = this.calculateMidPrice(orderBook);
      
      blockMatches.forEach(match => {
        matches.push({
          makerOrder: match,
          takerOrder: blockOrder,
          quantity: Math.min(blockOrder.quantity, match.quantity),
          price: midPrice,
          type: 'block_cross',
          timestamp: new Date()
        });
      });
    } else {
      // Fall back to regular matching
      return this.matchOrder(orderBook, blockOrder);
    }
    
    const totalMatched = matches.reduce((sum, match) => sum + match.quantity, 0);
    
    return {
      matches,
      remainingQuantity: blockOrder.quantity - totalMatched,
      fullyMatched: totalMatched >= blockOrder.quantity,
      type: 'block_execution'
    };
  }

  findBlockMatches(orderBook, blockOrder, oppositeSide) {
    const blockMatches = [];
    const levels = orderBook.getBestOrders(oppositeSide, 5);
    
    for (const level of levels) {
      for (const order of level.orders) {
        if (order.quantity >= this.config.minimumBlockSize) {
          blockMatches.push(order);
        }
      }
    }
    
    return blockMatches;
  }

  calculateMidPrice(orderBook) {
    const bestBid = orderBook.getBestBid();
    const bestAsk = orderBook.getBestAsk();
    
    if (!bestBid || !bestAsk) {
      return null;
    }
    
    return (bestBid.price + bestAsk.price) / 2;
  }

  /**
   * Validate matching result for integrity
   */
  validateMatching(matchingResult, incomingOrder) {
    const { matches, remainingQuantity } = matchingResult;
    
    // Check quantity conservation
    const totalMatched = matches.reduce((sum, match) => sum + match.quantity, 0);
    const expectedRemaining = incomingOrder.quantity - totalMatched;
    
    if (Math.abs(expectedRemaining - remainingQuantity) > 0.000001) {
      throw new Error('Quantity conservation violated in matching');
    }
    
    // Check price priority
    if (incomingOrder.type === 'limit') {
      const side = incomingOrder.side.toLowerCase();
      const limitPrice = parseFloat(incomingOrder.price);
      
      for (const match of matches) {
        if (side === 'buy' && match.price > limitPrice) {
          throw new Error('Buy order matched above limit price');
        }
        if (side === 'sell' && match.price < limitPrice) {
          throw new Error('Sell order matched below limit price');
        }
      }
    }
    
    // Check time priority within price levels
    const priceGroups = new Map();
    matches.forEach(match => {
      const price = match.price;
      if (!priceGroups.has(price)) {
        priceGroups.set(price, []);
      }
      priceGroups.get(price).push(match);
    });
    
    priceGroups.forEach(groupMatches => {
      for (let i = 1; i < groupMatches.length; i++) {
        const current = groupMatches[i];
        const previous = groupMatches[i-1];
        
        const currentTime = current.makerOrder.sequence || current.makerOrder.timestamp?.getTime() || 0;
        const previousTime = previous.makerOrder.sequence || previous.makerOrder.timestamp?.getTime() || 0;
        
        if (currentTime < previousTime) {
          this.logger?.warn('Time priority violation detected', {
            currentOrder: current.makerOrder.id,
            previousOrder: previous.makerOrder.id
          });
        }
      }
    });
    
    return true;
  }

  /**
   * Get algorithm performance metrics
   */
  getPerformanceMetrics() {
    return {
      algorithmName: this.name,
      configuration: this.config,
      features: {
        priceTimePriority: true,
        blockOrderSupport: true,
        priceImprovement: true,
        timeBreaking: this.config.enableTimeBreaking,
        sizeDiscounts: this.config.enableSizeDiscounts
      }
    };
  }

  /**
   * Update algorithm configuration
   */
  updateConfiguration(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    this.logger?.info('Price-Time algorithm configuration updated', this.config);
  }
}

module.exports = PriceTimeAlgorithm;