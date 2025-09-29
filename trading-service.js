#!/usr/bin/env node
/**
 * NexusTradeAI Trading Service
 * Handles trade order execution, portfolio management, and order routing
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage (in production, this would be a database)
let orders = [];
let positions = [
  { symbol: 'AAPL', shares: 100, avgPrice: 150.25, currentPrice: 155.80 },
  { symbol: 'GOOGL', shares: 10, avgPrice: 2800.00, currentPrice: 2750.50 },
  { symbol: 'MSFT', shares: 50, avgPrice: 300.00, currentPrice: 315.25 },
  { symbol: 'TSLA', shares: 25, avgPrice: 200.00, currentPrice: 210.75 }
];

let accountBalance = 50000.00; // Available cash
let totalPortfolioValue = 125750.50;

// Mock market prices (in production, this would come from market data service)
const marketPrices = {
  'AAPL': 155.80,
  'GOOGL': 2750.50,
  'MSFT': 315.25,
  'TSLA': 210.75,
  'AMZN': 3200.00,
  'NVDA': 450.25,
  'META': 280.50,
  'NFLX': 420.75
};

// Order validation
function validateOrder(order) {
  const errors = [];
  
  if (!order.symbol || typeof order.symbol !== 'string') {
    errors.push('Symbol is required and must be a string');
  }
  
  if (!order.side || !['BUY', 'SELL'].includes(order.side.toUpperCase())) {
    errors.push('Side must be BUY or SELL');
  }
  
  if (!order.quantity || order.quantity <= 0) {
    errors.push('Quantity must be a positive number');
  }
  
  if (!order.orderType || !['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT'].includes(order.orderType.toUpperCase())) {
    errors.push('Order type must be MARKET, LIMIT, STOP, or STOP_LIMIT');
  }
  
  if (order.orderType === 'LIMIT' && (!order.limitPrice || order.limitPrice <= 0)) {
    errors.push('Limit price is required for LIMIT orders');
  }
  
  if (!marketPrices[order.symbol.toUpperCase()]) {
    errors.push('Symbol not supported or market data unavailable');
  }
  
  return { valid: errors.length === 0, errors };
}

// Calculate order value
function calculateOrderValue(order) {
  const symbol = order.symbol.toUpperCase();
  const price = order.orderType === 'LIMIT' ? order.limitPrice : marketPrices[symbol];
  return order.quantity * price;
}

// Check buying power
function checkBuyingPower(order) {
  if (order.side.toUpperCase() === 'SELL') return true;
  
  const orderValue = calculateOrderValue(order);
  return accountBalance >= orderValue;
}

// Execute order
function executeOrder(order) {
  const symbol = order.symbol.toUpperCase();
  const side = order.side.toUpperCase();
  const executionPrice = order.orderType === 'LIMIT' ? order.limitPrice : marketPrices[symbol];
  const orderValue = order.quantity * executionPrice;
  
  // Update positions
  let position = positions.find(p => p.symbol === symbol);
  
  if (side === 'BUY') {
    if (position) {
      // Update existing position
      const totalShares = position.shares + order.quantity;
      const totalCost = (position.shares * position.avgPrice) + orderValue;
      position.avgPrice = totalCost / totalShares;
      position.shares = totalShares;
    } else {
      // Create new position
      positions.push({
        symbol: symbol,
        shares: order.quantity,
        avgPrice: executionPrice,
        currentPrice: marketPrices[symbol]
      });
    }
    accountBalance -= orderValue;
  } else { // SELL
    if (position && position.shares >= order.quantity) {
      position.shares -= order.quantity;
      if (position.shares === 0) {
        positions = positions.filter(p => p.symbol !== symbol);
      }
      accountBalance += orderValue;
    } else {
      throw new Error('Insufficient shares to sell');
    }
  }
  
  // Create execution record
  const execution = {
    orderId: order.orderId,
    symbol: symbol,
    side: side,
    quantity: order.quantity,
    executionPrice: executionPrice,
    orderValue: orderValue,
    timestamp: new Date().toISOString(),
    status: 'FILLED'
  };
  
  return execution;
}

// API Endpoints

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'trading-service',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Get account info
app.get('/account', (req, res) => {
  const totalPositionValue = positions.reduce((sum, pos) => {
    return sum + (pos.shares * pos.currentPrice);
  }, 0);
  
  res.json({
    accountBalance: accountBalance,
    totalPositionValue: totalPositionValue,
    totalPortfolioValue: accountBalance + totalPositionValue,
    buyingPower: accountBalance,
    positions: positions.length,
    timestamp: new Date().toISOString()
  });
});

// Get positions
app.get('/positions', (req, res) => {
  const positionsWithPnL = positions.map(pos => {
    const unrealizedPnL = (pos.currentPrice - pos.avgPrice) * pos.shares;
    const unrealizedPnLPercent = ((pos.currentPrice - pos.avgPrice) / pos.avgPrice) * 100;
    
    return {
      ...pos,
      marketValue: pos.shares * pos.currentPrice,
      unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
      unrealizedPnLPercent: Math.round(unrealizedPnLPercent * 100) / 100
    };
  });
  
  res.json({
    positions: positionsWithPnL,
    timestamp: new Date().toISOString()
  });
});

// Get orders
app.get('/orders', (req, res) => {
  res.json({
    orders: orders,
    timestamp: new Date().toISOString()
  });
});

// Place order
app.post('/orders', (req, res) => {
  try {
    const orderData = req.body;
    
    // Validate order
    const validation = validateOrder(orderData);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Order validation failed',
        errors: validation.errors,
        timestamp: new Date().toISOString()
      });
    }
    
    // Check buying power
    if (!checkBuyingPower(orderData)) {
      return res.status(400).json({
        error: 'Insufficient buying power',
        required: calculateOrderValue(orderData),
        available: accountBalance,
        timestamp: new Date().toISOString()
      });
    }
    
    // Create order
    const order = {
      orderId: uuidv4(),
      ...orderData,
      symbol: orderData.symbol.toUpperCase(),
      side: orderData.side.toUpperCase(),
      orderType: orderData.orderType.toUpperCase(),
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      timeInForce: orderData.timeInForce || 'DAY'
    };
    
    orders.push(order);
    
    // Execute order immediately for MARKET orders (in production, this would go to order management system)
    if (order.orderType === 'MARKET') {
      try {
        const execution = executeOrder(order);
        order.status = 'FILLED';
        order.executionPrice = execution.executionPrice;
        order.executedAt = execution.timestamp;
        
        res.status(201).json({
          message: 'Order executed successfully',
          order: order,
          execution: execution,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        order.status = 'REJECTED';
        order.rejectionReason = error.message;
        
        res.status(400).json({
          error: 'Order execution failed',
          reason: error.message,
          order: order,
          timestamp: new Date().toISOString()
        });
      }
    } else {
      // LIMIT orders remain pending
      res.status(201).json({
        message: 'Order placed successfully',
        order: order,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cancel order
app.delete('/orders/:orderId', (req, res) => {
  const { orderId } = req.params;
  const orderIndex = orders.findIndex(o => o.orderId === orderId);
  
  if (orderIndex === -1) {
    return res.status(404).json({
      error: 'Order not found',
      orderId: orderId,
      timestamp: new Date().toISOString()
    });
  }
  
  const order = orders[orderIndex];
  
  if (order.status === 'FILLED') {
    return res.status(400).json({
      error: 'Cannot cancel filled order',
      orderId: orderId,
      timestamp: new Date().toISOString()
    });
  }
  
  order.status = 'CANCELLED';
  order.cancelledAt = new Date().toISOString();
  
  res.json({
    message: 'Order cancelled successfully',
    order: order,
    timestamp: new Date().toISOString()
  });
});

// Get market prices
app.get('/market-prices', (req, res) => {
  res.json({
    prices: marketPrices,
    timestamp: new Date().toISOString()
  });
});

// Get specific symbol price
app.get('/market-prices/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const price = marketPrices[symbol];
  
  if (!price) {
    return res.status(404).json({
      error: 'Symbol not found',
      symbol: symbol,
      timestamp: new Date().toISOString()
    });
  }
  
  res.json({
    symbol: symbol,
    price: price,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NexusTradeAI Trading Service running on port ${PORT}`);
  console.log(`📊 Account endpoint: http://localhost:${PORT}/account`);
  console.log(`💼 Positions endpoint: http://localhost:${PORT}/positions`);
  console.log(`📋 Orders endpoint: http://localhost:${PORT}/orders`);
  console.log(`💹 Market prices: http://localhost:${PORT}/market-prices`);
  console.log(`\n✅ Ready to execute trades!`);
});

module.exports = app;
