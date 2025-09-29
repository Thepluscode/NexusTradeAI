const EventEmitter = require('events');
const WebSocket = require('ws');

class BaseCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.connections = new Map();
    this.subscriptions = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 1000;
    this.isRunning = false;
    this.rateLimiter = new Map();
    this.config = this.getConfig();
  }

  getConfig() {
    throw new Error('getConfig must be implemented by subclass');
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.logger?.info(`Starting ${this.constructor.name}...`);
    
    try {
      await this.initialize();
      await this.connect();
      this.isRunning = true;
      this.logger?.info(`${this.constructor.name} started successfully`);
    } catch (error) {
      this.logger?.error(`Failed to start ${this.constructor.name}:`, error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.logger?.info(`Stopping ${this.constructor.name}...`);
    
    try {
      await this.disconnect();
      this.isRunning = false;
      this.logger?.info(`${this.constructor.name} stopped`);
    } catch (error) {
      this.logger?.error(`Error stopping ${this.constructor.name}:`, error);
      throw error;
    }
  }

  async initialize() {
    // Override in subclass if needed
  }

  async connect() {
    for (const [exchangeId, exchangeConfig] of Object.entries(this.config.exchanges)) {
      await this.connectToExchange(exchangeId, exchangeConfig);
    }
  }

  async disconnect() {
    const disconnectPromises = Array.from(this.connections.keys()).map(exchangeId =>
      this.disconnectFromExchange(exchangeId)
    );
    
    await Promise.all(disconnectPromises);
  }

  async connectToExchange(exchangeId, config) {
    try {
      const ws = new WebSocket(config.wsUrl, {
        headers: config.headers || {},
        handshakeTimeout: 30000,
        perMessageDeflate: false
      });

      ws.on('open', () => {
        this.logger?.info(`Connected to ${exchangeId}`);
        this.reconnectAttempts = 0;
        this.connections.set(exchangeId, ws);
        this.emit('connected', { exchangeId });
        
        // Send authentication if required
        if (config.auth) {
          this.authenticate(exchangeId, ws, config.auth);
        }
        
        // Resubscribe to existing subscriptions
        this.resubscribe(exchangeId);
      });

      ws.on('message', (data) => {
        this.handleMessage(exchangeId, data);
      });

      ws.on('error', (error) => {
        this.logger?.error(`WebSocket error for ${exchangeId}:`, error);
        this.emit('error', { exchangeId, error });
      });

      ws.on('close', (code, reason) => {
        this.logger?.warn(`WebSocket closed for ${exchangeId}: ${code} ${reason}`);
        this.connections.delete(exchangeId);
        this.emit('disconnected', { exchangeId, code, reason });
        
        if (this.isRunning) {
          this.scheduleReconnect(exchangeId, config);
        }
      });

    } catch (error) {
      this.logger?.error(`Failed to connect to ${exchangeId}:`, error);
      throw error;
    }
  }

  async disconnectFromExchange(exchangeId) {
    const ws = this.connections.get(exchangeId);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
      this.connections.delete(exchangeId);
    }
  }

  scheduleReconnect(exchangeId, config) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger?.error(`Max reconnect attempts reached for ${exchangeId}`);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.logger?.info(`Reconnecting to ${exchangeId} in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connectToExchange(exchangeId, config);
    }, delay);
  }

  handleMessage(exchangeId, data) {
    try {
      const message = JSON.parse(data);
      const processedData = this.processMessage(exchangeId, message);
      
      if (processedData) {
        this.emit('data', {
          ...processedData,
          exchange: exchangeId,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      this.logger?.error(`Error processing message from ${exchangeId}:`, error);
    }
  }

  processMessage(exchangeId, message) {
    // Override in subclass
    throw new Error('processMessage must be implemented by subclass');
  }

  authenticate(exchangeId, ws, authConfig) {
    // Override in subclass if authentication is needed
  }

  subscribe(symbol, exchange, dataTypes) {
    const subscriptionKey = `${exchange}-${symbol}`;
    
    if (!this.subscriptions.has(subscriptionKey)) {
      this.subscriptions.set(subscriptionKey, new Set());
    }
    
    dataTypes.forEach(type => {
      this.subscriptions.get(subscriptionKey).add(type);
    });
    
    // Send subscription message if connected
    const ws = this.connections.get(exchange);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendSubscriptionMessage(ws, exchange, symbol, dataTypes);
    }
  }

  unsubscribe(symbol, exchange, dataTypes) {
    const subscriptionKey = `${exchange}-${symbol}`;
    const subscription = this.subscriptions.get(subscriptionKey);
    
    if (!subscription) {
      return;
    }
    
    dataTypes.forEach(type => {
      subscription.delete(type);
    });
    
    if (subscription.size === 0) {
      this.subscriptions.delete(subscriptionKey);
    }
    
    // Send unsubscription message if connected
    const ws = this.connections.get(exchange);
    if (ws && ws.readyState === WebSocket.OPEN) {
      this.sendUnsubscriptionMessage(ws, exchange, symbol, dataTypes);
    }
  }

  resubscribe(exchangeId) {
    for (const [subscriptionKey, dataTypes] of this.subscriptions) {
      const [exchange, symbol] = subscriptionKey.split('-');
      
      if (exchange === exchangeId) {
        const ws = this.connections.get(exchangeId);
        if (ws && ws.readyState === WebSocket.OPEN) {
          this.sendSubscriptionMessage(ws, exchange, symbol, Array.from(dataTypes));
        }
      }
    }
  }

  sendSubscriptionMessage(ws, exchange, symbol, dataTypes) {
    // Override in subclass
  }

  sendUnsubscriptionMessage(ws, exchange, symbol, dataTypes) {
    // Override in subclass
  }

  supportsExchange(exchange) {
    return this.config.exchanges.hasOwnProperty(exchange);
  }

  checkRateLimit(exchangeId, limit, window) {
    const now = Date.now();
    const key = `${exchangeId}-rate-limit`;
    
    if (!this.rateLimiter.has(key)) {
      this.rateLimiter.set(key, []);
    }
    
    const requests = this.rateLimiter.get(key);
    
    // Remove old requests outside the window
    while (requests.length > 0 && now - requests[0] > window) {
      requests.shift();
    }
    
    if (requests.length >= limit) {
      return false;
    }
    
    requests.push(now);
    return true;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      connections: Array.from(this.connections.keys()),
      subscriptions: this.subscriptions.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

module.exports = BaseCollector;