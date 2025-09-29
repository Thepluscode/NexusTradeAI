/**
 * Nexus Trade AI - Multi-Broker Connector
 * 
 * Abstract interface for connecting to multiple brokers
 * Supports: Binance, Alpaca, Interactive Brokers, MetaTrader, etc.
 */

const EventEmitter = require('events');

/**
 * Base Broker Interface
 */
class BaseBroker extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.isConnected = false;
    this.name = 'BaseBroker';
  }

  async connect() {
    throw new Error('connect() must be implemented by subclass');
  }

  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }

  async placeOrder(order) {
    throw new Error('placeOrder() must be implemented by subclass');
  }

  async cancelOrder(orderId) {
    throw new Error('cancelOrder() must be implemented by subclass');
  }

  async getBalance() {
    throw new Error('getBalance() must be implemented by subclass');
  }

  async getPositions() {
    throw new Error('getPositions() must be implemented by subclass');
  }

  async getMarketData(symbol) {
    throw new Error('getMarketData() must be implemented by subclass');
  }
}

/**
 * Alpaca Broker Connector
 */
class AlpacaBroker extends BaseBroker {
  constructor(config) {
    super(config);
    this.name = 'Alpaca';
    this.baseUrl = config.paper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    this.headers = {
      'APCA-API-KEY-ID': config.apiKey,
      'APCA-API-SECRET-KEY': config.secretKey,
      'Content-Type': 'application/json'
    };
  }

  async connect() {
    try {
      // Test connection by getting account info
      const response = await fetch(`${this.baseUrl}/v2/account`, {
        headers: this.headers
      });
      
      if (response.ok) {
        this.isConnected = true;
        this.emit('connected', { broker: this.name });
        console.log(`✅ Connected to ${this.name}`);
        return true;
      } else {
        throw new Error(`Connection failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ Failed to connect to ${this.name}:`, error.message);
      this.emit('error', error);
      return false;
    }
  }

  async placeOrder(order) {
    try {
      const alpacaOrder = {
        symbol: order.symbol,
        qty: order.quantity,
        side: order.side.toLowerCase(),
        type: order.type.toLowerCase(),
        time_in_force: order.timeInForce || 'day'
      };

      // Add stop loss and take profit if provided
      if (order.stopLoss) {
        alpacaOrder.stop_loss = { stop_price: order.stopLoss };
      }
      if (order.takeProfit) {
        alpacaOrder.take_profit = { limit_price: order.takeProfit };
      }

      const response = await fetch(`${this.baseUrl}/v2/orders`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(alpacaOrder)
      });

      const result = await response.json();
      
      if (response.ok) {
        this.emit('orderPlaced', { broker: this.name, order: result });
        return {
          success: true,
          orderId: result.id,
          status: result.status,
          broker: this.name
        };
      } else {
        throw new Error(result.message || 'Order placement failed');
      }
    } catch (error) {
      console.error(`❌ ${this.name} order placement failed:`, error.message);
      this.emit('orderError', { broker: this.name, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async getBalance() {
    try {
      const response = await fetch(`${this.baseUrl}/v2/account`, {
        headers: this.headers
      });
      
      const account = await response.json();
      
      return {
        cash: parseFloat(account.cash),
        equity: parseFloat(account.equity),
        buyingPower: parseFloat(account.buying_power),
        dayTradeCount: parseInt(account.daytrade_count)
      };
    } catch (error) {
      console.error(`❌ ${this.name} balance fetch failed:`, error.message);
      return null;
    }
  }

  async getPositions() {
    try {
      const response = await fetch(`${this.baseUrl}/v2/positions`, {
        headers: this.headers
      });
      
      const positions = await response.json();
      
      return positions.map(pos => ({
        symbol: pos.symbol,
        quantity: parseInt(pos.qty),
        side: pos.side,
        avgPrice: parseFloat(pos.avg_entry_price),
        marketValue: parseFloat(pos.market_value),
        unrealizedPnL: parseFloat(pos.unrealized_pl)
      }));
    } catch (error) {
      console.error(`❌ ${this.name} positions fetch failed:`, error.message);
      return [];
    }
  }
}

/**
 * Binance Broker Connector
 */
class BinanceBroker extends BaseBroker {
  constructor(config) {
    super(config);
    this.name = 'Binance';
    this.baseUrl = config.testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
  }

  async connect() {
    try {
      // Test connection by getting account info
      const timestamp = Date.now();
      const signature = this.createSignature(`timestamp=${timestamp}`);
      
      const response = await fetch(`${this.baseUrl}/api/v3/account?timestamp=${timestamp}&signature=${signature}`, {
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });
      
      if (response.ok) {
        this.isConnected = true;
        this.emit('connected', { broker: this.name });
        console.log(`✅ Connected to ${this.name}`);
        return true;
      } else {
        throw new Error(`Connection failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ Failed to connect to ${this.name}:`, error.message);
      this.emit('error', error);
      return false;
    }
  }

  createSignature(queryString) {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', this.secretKey).update(queryString).digest('hex');
  }

  async placeOrder(order) {
    try {
      const timestamp = Date.now();
      const params = {
        symbol: order.symbol,
        side: order.side.toUpperCase(),
        type: order.type.toUpperCase(),
        quantity: order.quantity,
        timestamp: timestamp
      };

      if (order.type.toUpperCase() === 'LIMIT') {
        params.price = order.price;
        params.timeInForce = 'GTC';
      }

      const queryString = Object.keys(params)
        .map(key => `${key}=${params[key]}`)
        .join('&');
      
      const signature = this.createSignature(queryString);

      const response = await fetch(`${this.baseUrl}/api/v3/order`, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `${queryString}&signature=${signature}`
      });

      const result = await response.json();
      
      if (response.ok) {
        this.emit('orderPlaced', { broker: this.name, order: result });
        return {
          success: true,
          orderId: result.orderId,
          status: result.status,
          broker: this.name
        };
      } else {
        throw new Error(result.msg || 'Order placement failed');
      }
    } catch (error) {
      console.error(`❌ ${this.name} order placement failed:`, error.message);
      this.emit('orderError', { broker: this.name, error: error.message });
      return { success: false, error: error.message };
    }
  }

  async getBalance() {
    try {
      const timestamp = Date.now();
      const signature = this.createSignature(`timestamp=${timestamp}`);
      
      const response = await fetch(`${this.baseUrl}/api/v3/account?timestamp=${timestamp}&signature=${signature}`, {
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });
      
      const account = await response.json();
      
      // Find USDT balance
      const usdtBalance = account.balances.find(b => b.asset === 'USDT');
      
      return {
        cash: parseFloat(usdtBalance?.free || 0),
        equity: parseFloat(usdtBalance?.free || 0) + parseFloat(usdtBalance?.locked || 0),
        buyingPower: parseFloat(usdtBalance?.free || 0)
      };
    } catch (error) {
      console.error(`❌ ${this.name} balance fetch failed:`, error.message);
      return null;
    }
  }
}

/**
 * Mock Broker for Testing
 */
class MockBroker extends BaseBroker {
  constructor(config) {
    super(config);
    this.name = 'Mock';
    this.balance = {
      cash: 100000,
      equity: 100000,
      buyingPower: 100000
    };
    this.positions = [];
    this.orders = [];
  }

  async connect() {
    this.isConnected = true;
    this.emit('connected', { broker: this.name });
    console.log(`✅ Connected to ${this.name} broker`);
    return true;
  }

  async placeOrder(order) {
    const orderId = `mock_${Date.now()}`;
    const mockOrder = {
      id: orderId,
      symbol: order.symbol,
      side: order.side,
      quantity: order.quantity,
      type: order.type,
      status: 'FILLED',
      price: order.price || 100, // Mock price
      timestamp: new Date().toISOString()
    };

    this.orders.push(mockOrder);
    
    // Simulate position update
    const existingPos = this.positions.find(p => p.symbol === order.symbol);
    if (existingPos) {
      if (order.side === 'BUY') {
        existingPos.quantity += order.quantity;
      } else {
        existingPos.quantity -= order.quantity;
      }
    } else {
      this.positions.push({
        symbol: order.symbol,
        quantity: order.side === 'BUY' ? order.quantity : -order.quantity,
        avgPrice: mockOrder.price,
        side: order.side
      });
    }

    this.emit('orderPlaced', { broker: this.name, order: mockOrder });
    
    return {
      success: true,
      orderId: orderId,
      status: 'FILLED',
      broker: this.name
    };
  }

  async getBalance() {
    return this.balance;
  }

  async getPositions() {
    return this.positions;
  }
}

/**
 * Broker Factory
 */
class BrokerFactory {
  static create(brokerType, config) {
    switch (brokerType.toLowerCase()) {
      case 'alpaca':
        return new AlpacaBroker(config);
      case 'binance':
        return new BinanceBroker(config);
      case 'mock':
        return new MockBroker(config);
      default:
        throw new Error(`Unsupported broker type: ${brokerType}`);
    }
  }

  static getSupportedBrokers() {
    return ['alpaca', 'binance', 'mock'];
  }
}

/**
 * Multi-Broker Manager
 */
class MultiBrokerManager extends EventEmitter {
  constructor() {
    super();
    this.brokers = new Map();
    this.defaultBroker = null;
  }

  addBroker(name, brokerType, config) {
    const broker = BrokerFactory.create(brokerType, config);
    this.brokers.set(name, broker);
    
    // Set as default if it's the first broker
    if (!this.defaultBroker) {
      this.defaultBroker = name;
    }

    // Forward broker events
    broker.on('connected', (data) => this.emit('brokerConnected', { name, ...data }));
    broker.on('error', (error) => this.emit('brokerError', { name, error }));
    broker.on('orderPlaced', (data) => this.emit('orderPlaced', { name, ...data }));
    
    return broker;
  }

  getBroker(name) {
    return this.brokers.get(name || this.defaultBroker);
  }

  async connectAll() {
    const results = [];
    for (const [name, broker] of this.brokers.entries()) {
      try {
        const connected = await broker.connect();
        results.push({ name, connected });
      } catch (error) {
        results.push({ name, connected: false, error: error.message });
      }
    }
    return results;
  }

  async placeOrder(order, brokerName = null) {
    const broker = this.getBroker(brokerName);
    if (!broker) {
      throw new Error(`Broker not found: ${brokerName || this.defaultBroker}`);
    }
    
    return await broker.placeOrder(order);
  }

  async getAggregatedBalance() {
    const balances = {};
    for (const [name, broker] of this.brokers.entries()) {
      if (broker.isConnected) {
        balances[name] = await broker.getBalance();
      }
    }
    return balances;
  }

  async getAggregatedPositions() {
    const positions = {};
    for (const [name, broker] of this.brokers.entries()) {
      if (broker.isConnected) {
        positions[name] = await broker.getPositions();
      }
    }
    return positions;
  }
}

module.exports = {
  BaseBroker,
  AlpacaBroker,
  BinanceBroker,
  MockBroker,
  BrokerFactory,
  MultiBrokerManager
};
