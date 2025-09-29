const EventEmitter = require('events');

class WebSocketDistributor extends EventEmitter {
  constructor(io, options = {}) {
    super();
    this.io = io;
    this.logger = options.logger;
    this.subscriptions = new Map(); // clientId -> Set of subscription keys
    this.subscriptionCounts = new Map(); // subscription key -> count
    this.rateLimits = new Map(); // clientId -> rate limit data
    this.compressionEnabled = options.compression !== false;
    this.maxSubscriptionsPerClient = options.maxSubscriptions || 100;
    this.defaultRateLimit = {
      points: 100, // Number of requests
      duration: 60000 // Per 60 seconds
    };
  }

  async distribute(dataArray) {
    if (!Array.isArray(dataArray) || dataArray.length === 0) {
      return;
    }

    try {
      // Group data by subscription keys
      const subscriptionData = new Map();
      
      for (const data of dataArray) {
        const subscriptionKey = this.getSubscriptionKey(data);
        
        if (!subscriptionData.has(subscriptionKey)) {
          subscriptionData.set(subscriptionKey, []);
        }
        
        subscriptionData.get(subscriptionKey).push(data);
      }
      
      // Distribute to subscribed clients
      for (const [subscriptionKey, data] of subscriptionData) {
        await this.distributeToSubscribers(subscriptionKey, data);
      }
      
    } catch (error) {
      this.logger?.error('Error distributing WebSocket data:', error);
    }
  }

  async distributeToSubscribers(subscriptionKey, data) {
    const clients = this.getSubscribedClients(subscriptionKey);
    
    if (clients.length === 0) {
      return;
    }
    
    const payload = {
      type: 'market_data',
      subscription: subscriptionKey,
      data: data,
      timestamp: Date.now()
    };
    
    // Compress payload if enabled
    let serializedPayload = JSON.stringify(payload);
    if (this.compressionEnabled && serializedPayload.length > 1024) {
      // In a real implementation, you'd use a compression library
      // This is a placeholder for compression logic
    }
    
    // Send to all subscribed clients
    const sendPromises = clients.map(clientId => 
      this.sendToClient(clientId, serializedPayload)
    );
    
    await Promise.all(sendPromises);
  }

  async sendToClient(clientId, payload) {
    try {
      const socket = this.io.sockets.sockets.get(clientId);
      
      if (!socket || !socket.connected) {
        this.handleClientDisconnection(clientId);
        return;
      }
      
      // Check rate limit
      if (!this.checkRateLimit(clientId)) {
        this.logger?.warn(`Rate limit exceeded for client ${clientId}`);
        return;
      }
      
      socket.emit('market_data', payload);
      
    } catch (error) {
      this.logger?.error(`Error sending data to client ${clientId}:`, error);
    }
  }

  handleSubscription(socket, subscriptionData) {
    const clientId = socket.id;
    const { action, symbol, exchange, dataTypes = ['tick'] } = subscriptionData;
    
    if (action !== 'subscribe') {
      socket.emit('error', { message: 'Invalid subscription action' });
      return;
    }
    
    if (!symbol || !exchange) {
      socket.emit('error', { message: 'Symbol and exchange are required' });
      return;
    }
    
    // Check subscription limits
    const clientSubscriptions = this.subscriptions.get(clientId) || new Set();
    if (clientSubscriptions.size >= this.maxSubscriptionsPerClient) {
      socket.emit('error', { 
        message: `Maximum subscriptions (${this.maxSubscriptionsPerClient}) exceeded` 
      });
      return;
    }
    
    // Add subscriptions
    for (const dataType of dataTypes) {
      const subscriptionKey = `${exchange}-${symbol}-${dataType}`;
      this.addSubscription(clientId, subscriptionKey);
    }
    
    socket.emit('subscription_confirmed', {
      symbol,
      exchange,
      dataTypes,
      timestamp: Date.now()
    });
    
    this.logger?.info(`Client ${clientId} subscribed to ${exchange}-${symbol} (${dataTypes.join(', ')})`);
  }

  handleUnsubscription(socket, subscriptionData) {
    const clientId = socket.id;
    const { action, symbol, exchange, dataTypes = ['tick'] } = subscriptionData;
    
    if (action !== 'unsubscribe') {
      socket.emit('error', { message: 'Invalid unsubscription action' });
      return;
    }
    
    // Remove subscriptions
    for (const dataType of dataTypes) {
      const subscriptionKey = `${exchange}-${symbol}-${dataType}`;
      this.removeSubscription(clientId, subscriptionKey);
    }
    
    socket.emit('unsubscription_confirmed', {
      symbol,
      exchange,
      dataTypes,
      timestamp: Date.now()
    });
    
    this.logger?.info(`Client ${clientId} unsubscribed from ${exchange}-${symbol} (${dataTypes.join(', ')})`);
  }

  handleDisconnection(socket) {
    const clientId = socket.id;
    this.handleClientDisconnection(clientId);
  }

  handleClientDisconnection(clientId) {
    const clientSubscriptions = this.subscriptions.get(clientId);
    
    if (clientSubscriptions) {
      // Remove all subscriptions for this client
      for (const subscriptionKey of clientSubscriptions) {
        this.removeSubscription(clientId, subscriptionKey);
      }
    }
    
    // Clean up rate limit data
    this.rateLimits.delete(clientId);
    
    this.logger?.info(`Client ${clientId} disconnected and cleaned up`);
  }

  addSubscription(clientId, subscriptionKey) {
    // Add to client subscriptions
    if (!this.subscriptions.has(clientId)) {
      this.subscriptions.set(clientId, new Set());
    }
    this.subscriptions.get(clientId).add(subscriptionKey);
    
    // Increment subscription count
    const currentCount = this.subscriptionCounts.get(subscriptionKey) || 0;
    this.subscriptionCounts.set(subscriptionKey, currentCount + 1);
    
    this.emit('subscription_added', { clientId, subscriptionKey });
  }

  removeSubscription(clientId, subscriptionKey) {
    // Remove from client subscriptions
    const clientSubscriptions = this.subscriptions.get(clientId);
    if (clientSubscriptions) {
      clientSubscriptions.delete(subscriptionKey);
      
      if (clientSubscriptions.size === 0) {
        this.subscriptions.delete(clientId);
      }
    }
    
    // Decrement subscription count
    const currentCount = this.subscriptionCounts.get(subscriptionKey) || 0;
    if (currentCount <= 1) {
      this.subscriptionCounts.delete(subscriptionKey);
    } else {
      this.subscriptionCounts.set(subscriptionKey, currentCount - 1);
    }
    
    this.emit('subscription_removed', { clientId, subscriptionKey });
  }

  getSubscribedClients(subscriptionKey) {
    const clients = [];
    
    for (const [clientId, subscriptions] of this.subscriptions) {
      if (subscriptions.has(subscriptionKey)) {
        clients.push(clientId);
      }
    }
    
    return clients;
  }

  getSubscriptionKey(data) {
    const exchange = data.exchange || 'unknown';
    const symbol = data.symbol || 'unknown';
    const dataType = data.dataType || 'tick';
    
    return `${exchange}-${symbol}-${dataType}`;
  }

  checkRateLimit(clientId) {
    const now = Date.now();
    
    if (!this.rateLimits.has(clientId)) {
      this.rateLimits.set(clientId, {
        points: this.defaultRateLimit.points - 1,
        resetTime: now + this.defaultRateLimit.duration
      });
      return true;
    }
    
    const rateLimit = this.rateLimits.get(clientId);
    
    // Reset if time window has passed
    if (now >= rateLimit.resetTime) {
      rateLimit.points = this.defaultRateLimit.points - 1;
      rateLimit.resetTime = now + this.defaultRateLimit.duration;
      return true;
    }
    
    // Check if points available
    if (rateLimit.points > 0) {
      rateLimit.points--;
      return true;
    }
    
    return false;
  }

  getStats() {
    return {
      connectedClients: this.subscriptions.size,
      totalSubscriptions: Array.from(this.subscriptions.values())
        .reduce((sum, subscriptions) => sum + subscriptions.size, 0),
      uniqueSubscriptions: this.subscriptionCounts.size,
      subscriptionCounts: Object.fromEntries(this.subscriptionCounts)
    };
  }

  broadcastSystemMessage(message) {
    this.io.emit('system_message', {
      message,
      timestamp: Date.now()
    });
  }
}

module.exports = WebSocketDistributor;