// src/execution/smartOrderRouter.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');

class SmartOrderRouter extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.exchanges = new Map();
    this.routingRules = new Map();
    
    // Routing algorithms
    this.algorithms = {
      BEST_PRICE: 'best_price',
      VOLUME_WEIGHTED: 'volume_weighted',
      LATENCY_OPTIMIZED: 'latency_optimized',
      COST_MINIMIZED: 'cost_minimized',
      LIQUIDITY_SEEKING: 'liquidity_seeking'
    };
    
    // Performance tracking
    this.routingStats = {
      totalOrders: 0,
      successfulRoutes: 0,
      avgRoutingTime: 0,
      exchangeDistribution: new Map()
    };
    
    this.isInitialized = false;
  }

  async initialize() {
    try {
      this.logger?.info('Initializing SmartOrderRouter...');
      
      // Initialize exchange connections
      await this.initializeExchanges();
      
      // Load routing rules
      await this.loadRoutingRules();
      
      this.logger?.info('SmartOrderRouter initialized successfully');
      this.isInitialized = true;
    } catch (error) {
      this.logger?.error('Failed to initialize SmartOrderRouter:', error);
      throw error;
    }
  }

  async initializeExchanges() {
    // Mock exchange configurations
    const exchangeConfigs = [
      {
        id: 'NYSE',
        name: 'New York Stock Exchange',
        type: 'equity',
        latency: 2, // ms
        fees: { maker: 0.0005, taker: 0.001 },
        symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA']
      },
      {
        id: 'NASDAQ',
        name: 'NASDAQ',
        type: 'equity',
        latency: 1.5,
        fees: { maker: 0.0004, taker: 0.0009 },
        symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA']
      },
      {
        id: 'BINANCE',
        name: 'Binance',
        type: 'crypto',
        latency: 5,
        fees: { maker: 0.001, taker: 0.001 },
        symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
      },
      {
        id: 'COINBASE',
        name: 'Coinbase Pro',
        type: 'crypto',
        latency: 8,
        fees: { maker: 0.005, taker: 0.005 },
        symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
      }
    ];

    for (const config of exchangeConfigs) {
      this.exchanges.set(config.id, {
        ...config,
        connected: true,
        lastHeartbeat: new Date(),
        orderBook: new Map(),
        avgFillRate: 0.95
      });
    }
  }

  async loadRoutingRules() {
    // Default routing rules by symbol and order characteristics
    this.routingRules.set('default', {
      algorithm: this.algorithms.BEST_PRICE,
      maxExchanges: 3,
      minFillRate: 0.8,
      maxLatency: 10,
      allowPartialFills: true
    });

    this.routingRules.set('AAPL', {
      algorithm: this.algorithms.VOLUME_WEIGHTED,
      preferredExchanges: ['NYSE', 'NASDAQ'],
      maxSlippage: 0.001
    });

    this.routingRules.set('BTCUSDT', {
      algorithm: this.algorithms.LIQUIDITY_SEEKING,
      preferredExchanges: ['BINANCE', 'COINBASE'],
      maxSlippage: 0.005
    });
  }

  async routeOrder(order, options = {}) {
    if (!this.isInitialized) {
      throw new Error('SmartOrderRouter is not initialized');
    }

    const startTime = process.hrtime.bigint();
    
    try {
      // Get routing rules for this order
      const rules = this.getRoutingRules(order);
      
      // Find available exchanges for this symbol
      const availableExchanges = this.getAvailableExchanges(order.symbol);
      
      if (availableExchanges.length === 0) {
        throw new Error(`No exchanges available for symbol: ${order.symbol}`);
      }

      // Apply routing algorithm
      const routingPlan = await this.createRoutingPlan(order, availableExchanges, rules);
      
      // Execute routing plan
      const routingResult = await this.executeRoutingPlan(order, routingPlan);
      
      // Update stats
      const routingTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.updateRoutingStats(routingResult, routingTime);
      
      this.emit('order_routed', { order, routingResult });
      
      return routingResult;

    } catch (error) {
      this.logger?.error('Error routing order:', error);
      throw error;
    }
  }

  getRoutingRules(order) {
    // Get symbol-specific rules or default rules
    return this.routingRules.get(order.symbol) || 
           this.routingRules.get('default');
  }

  getAvailableExchanges(symbol) {
    return Array.from(this.exchanges.values()).filter(exchange => 
      exchange.connected && 
      exchange.symbols.includes(symbol)
    );
  }

  async createRoutingPlan(order, exchanges, rules) {
    const algorithm = rules.algorithm;
    
    switch (algorithm) {
      case this.algorithms.BEST_PRICE:
        return this.createBestPricePlan(order, exchanges, rules);
      
      case this.algorithms.VOLUME_WEIGHTED:
        return this.createVolumeWeightedPlan(order, exchanges, rules);
      
      case this.algorithms.LATENCY_OPTIMIZED:
        return this.createLatencyOptimizedPlan(order, exchanges, rules);
      
      case this.algorithms.COST_MINIMIZED:
        return this.createCostMinimizedPlan(order, exchanges, rules);
      
      case this.algorithms.LIQUIDITY_SEEKING:
        return this.createLiquiditySeekingPlan(order, exchanges, rules);
      
      default:
        return this.createBestPricePlan(order, exchanges, rules);
    }
  }

  async createBestPricePlan(order, exchanges, rules) {
    // Get current prices from all exchanges
    const priceData = await Promise.all(
      exchanges.map(async exchange => ({
        exchange,
        price: await this.getExchangePrice(exchange.id, order.symbol, order.side),
        liquidity: await this.getExchangeLiquidity(exchange.id, order.symbol)
      }))
    );

    // Sort by best price
    priceData.sort((a, b) => {
      if (order.side === 'buy') {
        return a.price - b.price; // Lowest price first for buy orders
      } else {
        return b.price - a.price; // Highest price first for sell orders
      }
    });

    // Create routing allocations
    const allocations = [];
    let remainingQuantity = new Decimal(order.quantity);

    for (const data of priceData) {
      if (remainingQuantity.lte(0)) break;

      const availableQuantity = Math.min(
        data.liquidity,
        remainingQuantity.toNumber()
      );

      if (availableQuantity > 0) {
        allocations.push({
          exchangeId: data.exchange.id,
          quantity: availableQuantity,
          expectedPrice: data.price,
          priority: allocations.length + 1
        });

        remainingQuantity = remainingQuantity.minus(availableQuantity);
      }
    }

    return {
      algorithm: 'best_price',
      allocations,
      estimatedFillRate: this.calculateEstimatedFillRate(allocations, exchanges)
    };
  }

  async createVolumeWeightedPlan(order, exchanges, rules) {
    // Get volume data for each exchange
    const volumeData = await Promise.all(
      exchanges.map(async exchange => ({
        exchange,
        volume: await this.getExchangeVolume(exchange.id, order.symbol),
        price: await this.getExchangePrice(exchange.id, order.symbol, order.side)
      }))
    );

    const totalVolume = volumeData.reduce((sum, data) => sum + data.volume, 0);
    
    if (totalVolume === 0) {
      throw new Error('No volume available on any exchange');
    }

    // Allocate based on volume weights
    const allocations = [];
    const totalQuantity = new Decimal(order.quantity);

    volumeData.forEach(data => {
      const weight = data.volume / totalVolume;
      const allocation = totalQuantity.times(weight);

      if (allocation.gt(0)) {
        allocations.push({
          exchangeId: data.exchange.id,
          quantity: allocation.toNumber(),
          expectedPrice: data.price,
          weight: weight,
          priority: 1 // Execute simultaneously
        });
      }
    });

    return {
      algorithm: 'volume_weighted',
      allocations,
      estimatedFillRate: this.calculateEstimatedFillRate(allocations, exchanges)
    };
  }

  async createLatencyOptimizedPlan(order, exchanges, rules) {
    // Sort exchanges by latency
    const sortedExchanges = [...exchanges].sort((a, b) => a.latency - b.latency);
    
    // Allocate to lowest latency exchanges first
    const allocations = [];
    let remainingQuantity = new Decimal(order.quantity);

    for (const exchange of sortedExchanges) {
      if (remainingQuantity.lte(0)) break;

      const liquidity = await this.getExchangeLiquidity(exchange.id, order.symbol);
      const allocationQuantity = Math.min(liquidity, remainingQuantity.toNumber());

      if (allocationQuantity > 0) {
        allocations.push({
          exchangeId: exchange.id,
          quantity: allocationQuantity,
          expectedPrice: await this.getExchangePrice(exchange.id, order.symbol, order.side),
          latency: exchange.latency,
          priority: allocations.length + 1
        });

        remainingQuantity = remainingQuantity.minus(allocationQuantity);
      }
    }

    return {
      algorithm: 'latency_optimized',
      allocations,
      estimatedFillRate: this.calculateEstimatedFillRate(allocations, exchanges)
    };
  }

  async createCostMinimizedPlan(order, exchanges, rules) {
    // Calculate total cost (price + fees) for each exchange
    const costData = await Promise.all(
      exchanges.map(async exchange => {
        const price = await this.getExchangePrice(exchange.id, order.symbol, order.side);
        const fee = this.calculateTradingFee(exchange, order);
        
        return {
          exchange,
          price,
          fee,
          totalCost: price + fee,
          liquidity: await this.getExchangeLiquidity(exchange.id, order.symbol)
        };
      })
    );

    // Sort by total cost
    costData.sort((a, b) => {
      if (order.side === 'buy') {
        return a.totalCost - b.totalCost;
      } else {
        return b.totalCost - a.totalCost;
      }
    });

    // Allocate to lowest cost exchanges
    const allocations = [];
    let remainingQuantity = new Decimal(order.quantity);

    for (const data of costData) {
      if (remainingQuantity.lte(0)) break;

      const allocationQuantity = Math.min(data.liquidity, remainingQuantity.toNumber());

      if (allocationQuantity > 0) {
        allocations.push({
          exchangeId: data.exchange.id,
          quantity: allocationQuantity,
          expectedPrice: data.price,
          fee: data.fee,
          totalCost: data.totalCost,
          priority: allocations.length + 1
        });

        remainingQuantity = remainingQuantity.minus(allocationQuantity);
      }
    }

    return {
      algorithm: 'cost_minimized',
      allocations,
      estimatedFillRate: this.calculateEstimatedFillRate(allocations, exchanges)
    };
  }

  async createLiquiditySeekingPlan(order, exchanges, rules) {
    // Find exchanges with best liquidity
    const liquidityData = await Promise.all(
      exchanges.map(async exchange => ({
        exchange,
        liquidity: await this.getExchangeLiquidity(exchange.id, order.symbol),
        price: await this.getExchangePrice(exchange.id, order.symbol, order.side),
        depth: await this.getMarketDepth(exchange.id, order.symbol)
      }))
    );

    // Sort by liquidity (descending)
    liquidityData.sort((a, b) => b.liquidity - a.liquidity);

    // Allocate to highest liquidity exchanges
    const allocations = [];
    let remainingQuantity = new Decimal(order.quantity);

    for (const data of liquidityData) {
      if (remainingQuantity.lte(0)) break;

      const allocationQuantity = Math.min(data.liquidity, remainingQuantity.toNumber());

      if (allocationQuantity > 0) {
        allocations.push({
          exchangeId: data.exchange.id,
          quantity: allocationQuantity,
          expectedPrice: data.price,
          liquidity: data.liquidity,
          depth: data.depth,
          priority: 1 // Execute simultaneously for best liquidity access
        });

        remainingQuantity = remainingQuantity.minus(allocationQuantity);
      }
    }

    return {
      algorithm: 'liquidity_seeking',
      allocations,
      estimatedFillRate: this.calculateEstimatedFillRate(allocations, exchanges)
    };
  }

  async executeRoutingPlan(order, plan) {
    const executions = [];
    const { allocations } = plan;

    // Group allocations by priority
    const priorityGroups = new Map();
    allocations.forEach(allocation => {
      if (!priorityGroups.has(allocation.priority)) {
        priorityGroups.set(allocation.priority, []);
      }
      priorityGroups.get(allocation.priority).push(allocation);
    });

    // Execute each priority group
    for (const [priority, group] of priorityGroups) {
      const groupPromises = group.map(allocation => 
        this.executeAllocation(order, allocation)
      );

      try {
        const groupResults = await Promise.allSettled(groupPromises);
        
        groupResults.forEach(result => {
          if (result.status === 'fulfilled') {
            executions.push(result.value);
          } else {
            this.logger?.error('Allocation execution failed:', result.reason);
          }
        });

      } catch (error) {
        this.logger?.error(`Error executing priority group ${priority}:`, error);
      }
    }

    return {
      orderId: order.id,
      plan,
      executions,
      totalFilled: executions.reduce((sum, exec) => sum + exec.quantityFilled, 0),
      avgPrice: this.calculateAverageExecutionPrice(executions),
      routingEfficiency: this.calculateRoutingEfficiency(plan, executions)
    };
  }

  async executeAllocation(order, allocation) {
    // Mock order execution on exchange
    const exchange = this.exchanges.get(allocation.exchangeId);
    
    // Simulate execution with some randomness
    const fillRate = exchange.avgFillRate * (0.9 + Math.random() * 0.2); // 90-110% of avg
    const quantityFilled = allocation.quantity * fillRate;
    const slippage = (Math.random() - 0.5) * 0.002; // ±0.1% slippage
    const actualPrice = allocation.expectedPrice * (1 + slippage);

    return {
      exchangeId: allocation.exchangeId,
      allocationQuantity: allocation.quantity,
      quantityFilled,
      avgPrice: actualPrice,
      fee: this.calculateTradingFee(exchange, { ...order, quantity: quantityFilled }),
      timestamp: new Date()
    };
  }

  calculateTradingFee(exchange, order) {
    const feeRate = order.type === 'market' ? exchange.fees.taker : exchange.fees.maker;
    return order.quantity * (order.price || 100) * feeRate; // Mock price if not provided
  }

  calculateEstimatedFillRate(allocations, exchanges) {
    if (allocations.length === 0) return 0;
    
    const weightedFillRate = allocations.reduce((sum, allocation) => {
      const exchange = exchanges.find(ex => ex.id === allocation.exchangeId);
      return sum + (allocation.quantity * exchange.avgFillRate);
    }, 0);

    const totalQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
    
    return totalQuantity > 0 ? weightedFillRate / totalQuantity : 0;
  }

  calculateAverageExecutionPrice(executions) {
    if (executions.length === 0) return 0;
    
    let totalValue = 0;
    let totalQuantity = 0;
    
    executions.forEach(exec => {
      totalValue += exec.quantityFilled * exec.avgPrice;
      totalQuantity += exec.quantityFilled;
    });
    
    return totalQuantity > 0 ? totalValue / totalQuantity : 0;
  }

  calculateRoutingEfficiency(plan, executions) {
    const plannedQuantity = plan.allocations.reduce((sum, alloc) => sum + alloc.quantity, 0);
    const executedQuantity = executions.reduce((sum, exec) => sum + exec.quantityFilled, 0);
    
    return plannedQuantity > 0 ? executedQuantity / plannedQuantity : 0;
  }

  updateRoutingStats(result, routingTime) {
    this.routingStats.totalOrders++;
    
    if (result.routingEfficiency > 0.8) {
      this.routingStats.successfulRoutes++;
    }
    
    // Update average routing time
    const totalTime = this.routingStats.avgRoutingTime * (this.routingStats.totalOrders - 1) + routingTime;
    this.routingStats.avgRoutingTime = totalTime / this.routingStats.totalOrders;
    
    // Update exchange distribution
    result.executions.forEach(exec => {
      const current = this.routingStats.exchangeDistribution.get(exec.exchangeId) || 0;
      this.routingStats.exchangeDistribution.set(exec.exchangeId, current + 1);
    });
  }

  // Mock data methods - would integrate with real exchange APIs
  async getExchangePrice(exchangeId, symbol, side) {
    const basePrices = {
      'AAPL': 150.00,
      'GOOGL': 2500.00,
      'MSFT': 300.00,
      'TSLA': 800.00,
      'BTCUSDT': 45000.00,
      'ETHUSDT': 3000.00
    };
    
    const basePrice = basePrices[symbol] || 100.00;
    const spread = basePrice * 0.001; // 0.1% spread
    
    return side === 'buy' ? basePrice + spread/2 : basePrice - spread/2;
  }

  async getExchangeLiquidity(exchangeId, symbol) {
    // Mock liquidity based on exchange type
    const exchange = this.exchanges.get(exchangeId);
    const baseLiquidity = exchange.type === 'equity' ? 10000 : 5000;
    
    return baseLiquidity * (0.8 + Math.random() * 0.4); // 80-120% variation
  }

  async getExchangeVolume(exchangeId, symbol) {
    const exchange = this.exchanges.get(exchangeId);
    const baseVolume = exchange.type === 'equity' ? 100000 : 50000;
    
    return baseVolume * (0.5 + Math.random()); // 50-150% variation
  }

  async getMarketDepth(exchangeId, symbol) {
    return {
      bidDepth: Math.random() * 10000,
      askDepth: Math.random() * 10000,
      levels: 10
    };
  }

  getRoutingStats() {
    return {
      ...this.routingStats,
      successRate: this.routingStats.totalOrders > 0 ? 
        this.routingStats.successfulRoutes / this.routingStats.totalOrders : 0,
      exchangeDistribution: Object.fromEntries(this.routingStats.exchangeDistribution)
    };
  }

  getExchangeStatus() {
    return Array.from(this.exchanges.values()).map(exchange => ({
      id: exchange.id,
      name: exchange.name,
      connected: exchange.connected,
      latency: exchange.latency,
      avgFillRate: exchange.avgFillRate,
      lastHeartbeat: exchange.lastHeartbeat
    }));
  }

  // Helper methods for order execution
  async executeRoutingPlan(order, plan) {
    const executions = [];
    const { allocations } = plan;

    // Group allocations by priority
    const priorityGroups = new Map();
    allocations.forEach(allocation => {
      if (!priorityGroups.has(allocation.priority)) {
        priorityGroups.set(allocation.priority, []);
      }
      priorityGroups.get(allocation.priority).push(allocation);
    });

    // Execute each priority group
    for (const [priority, group] of priorityGroups) {
      const groupPromises = group.map(allocation => 
        this.executeAllocation(order, allocation)
      );

      try {
        const groupResults = await Promise.allSettled(groupPromises);
        
        groupResults.forEach(result => {
          if (result.status === 'fulfilled') {
            executions.push(result.value);
          } else {
            this.logger?.error('Allocation execution failed:', result.reason);
          }
        });

      } catch (error) {
        this.logger?.error(`Error executing priority group ${priority}:`, error);
      }
    }

    return {
      orderId: order.id,
      plan,
      executions,
      totalFilled: executions.reduce((sum, exec) => sum + exec.quantityFilled, 0),
      avgPrice: this.calculateAverageExecutionPrice(executions),
      routingEfficiency: this.calculateRoutingEfficiency(plan, executions)
    };
  }

  async executeAllocation(order, allocation) {
    // Mock order execution on exchange
    const exchange = this.exchanges.get(allocation.exchangeId);
    
    // Simulate execution with some randomness
    const fillRate = exchange.avgFillRate * (0.9 + Math.random() * 0.2); // 90-110% of avg
    const quantityFilled = allocation.quantity * fillRate;
    const slippage = (Math.random() - 0.5) * 0.002; // ±0.1% slippage
    const actualPrice = allocation.expectedPrice * (1 + slippage);

    return {
      exchangeId: allocation.exchangeId,
      allocationQuantity: allocation.quantity,
      quantityFilled,
      avgPrice: actualPrice,
      fee: this.calculateTradingFee(exchange, { ...order, quantity: quantityFilled }),
      timestamp: new Date()
    };
  }

  calculateTradingFee(exchange, order) {
    const feeRate = order.type === 'market' ? exchange.fees.taker : exchange.fees.maker;
    return order.quantity * (order.price || 100) * feeRate; // Mock price if not provided
  }

  calculateAverageExecutionPrice(executions) {
    if (executions.length === 0) return 0;
    
    let totalValue = 0;
    let totalQuantity = 0;
    
    executions.forEach(exec => {
      totalValue += exec.quantityFilled * exec.avgPrice;
      totalQuantity += exec.quantityFilled;
    });
    
    return totalQuantity > 0 ? totalValue / totalQuantity : 0;
  }

  calculateRoutingEfficiency(plan, executions) {
    const plannedQuantity = plan.allocations.reduce((sum, alloc) => sum + alloc.quantity, 0);
    const executedQuantity = executions.reduce((sum, exec) => sum + exec.quantityFilled, 0);
    
    return plannedQuantity > 0 ? executedQuantity / plannedQuantity : 0;
  }

  calculateEstimatedFillRate(allocations, exchanges) {
    if (allocations.length === 0) return 0;
    
    const weightedFillRate = allocations.reduce((sum, allocation) => {
      const exchange = exchanges.find(ex => ex.id === allocation.exchangeId);
      return sum + (allocation.quantity * exchange.avgFillRate);
    }, 0);

    const totalQuantity = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
    
    return totalQuantity > 0 ? weightedFillRate / totalQuantity : 0;
  }

  // Update routing statistics
  updateRoutingStats(result, routingTime) {
    this.routingStats.totalOrders++;
    
    if (result.routingEfficiency > 0.8) {
      this.routingStats.successfulRoutes++;
    }
    
    // Update average routing time
    const totalTime = this.routingStats.avgRoutingTime * (this.routingStats.totalOrders - 1) + routingTime;
    this.routingStats.avgRoutingTime = totalTime / this.routingStats.totalOrders;
    
    // Update exchange distribution
    result.executions.forEach(exec => {
      const current = this.routingStats.exchangeDistribution.get(exec.exchangeId) || 0;
      this.routingStats.exchangeDistribution.set(exec.exchangeId, current + 1);
    });
  }
}

module.exports = SmartOrderRouter;