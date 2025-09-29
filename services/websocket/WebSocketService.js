/**
 * Nexus Trade AI - WebSocket Service
 * 
 * Ultra-low latency real-time data feeds and communication
 * Supports multiple data sources and client connections
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const axios = require('axios');

class WebSocketService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      port: config.port || 8080,
      host: config.host || 'localhost',
      pingInterval: config.pingInterval || 30000,
      maxConnections: config.maxConnections || 1000,
      ...config
    };
    
    this.server = null;
    this.clients = new Map();
    this.subscriptions = new Map();
    this.dataFeeds = new Map();
    this.isRunning = false;
    
    // Data sources
    this.marketDataUrl = 'http://localhost:3002';
    this.automationUrl = 'http://localhost:3004';
    
    console.log('🔌 WebSocket Service initializing...');
  }

  /**
   * Start WebSocket server
   */
  async start() {
    try {
      this.server = new WebSocket.Server({
        port: this.config.port,
        host: this.config.host
      });

      this.setupServerHandlers();
      this.startDataFeeds();
      this.startPingInterval();
      
      this.isRunning = true;
      
      console.log(`🔌 WebSocket Server running on ws://${this.config.host}:${this.config.port}`);
      console.log(`📡 Real-time feeds: Market Data, Trading Signals, Performance`);
      
      return true;
    } catch (error) {
      console.error('❌ WebSocket Server failed to start:', error.message);
      throw error;
    }
  }

  /**
   * Setup WebSocket server event handlers
   */
  setupServerHandlers() {
    this.server.on('connection', (ws, request) => {
      const clientId = this.generateClientId();
      const clientInfo = {
        id: clientId,
        ws: ws,
        ip: request.socket.remoteAddress,
        userAgent: request.headers['user-agent'],
        connectedAt: new Date(),
        subscriptions: new Set(),
        lastPing: Date.now()
      };
      
      this.clients.set(clientId, clientInfo);
      
      console.log(`🔌 Client connected: ${clientId} (${this.clients.size} total)`);
      
      // Send welcome message
      this.sendToClient(clientId, {
        type: 'welcome',
        clientId: clientId,
        timestamp: new Date().toISOString(),
        availableFeeds: [
          'market-data',
          'trading-signals', 
          'performance-metrics',
          'system-status',
          'trade-executions'
        ]
      });

      // Setup client handlers
      ws.on('message', (data) => {
        this.handleClientMessage(clientId, data);
      });

      ws.on('close', () => {
        this.handleClientDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error.message);
        this.handleClientDisconnect(clientId);
      });

      ws.on('pong', () => {
        if (this.clients.has(clientId)) {
          this.clients.get(clientId).lastPing = Date.now();
        }
      });
    });

    this.server.on('error', (error) => {
      console.error('❌ WebSocket Server error:', error);
    });
  }

  /**
   * Handle client messages
   */
  handleClientMessage(clientId, data) {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);
      
      if (!client) return;

      switch (message.type) {
        case 'subscribe':
          this.handleSubscription(clientId, message.feed);
          break;
          
        case 'unsubscribe':
          this.handleUnsubscription(clientId, message.feed);
          break;
          
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
          
        case 'get-status':
          this.sendSystemStatus(clientId);
          break;
          
        default:
          this.sendToClient(clientId, {
            type: 'error',
            message: `Unknown message type: ${message.type}`
          });
      }
    } catch (error) {
      console.error(`❌ Error handling message from ${clientId}:`, error.message);
      this.sendToClient(clientId, {
        type: 'error',
        message: 'Invalid message format'
      });
    }
  }

  /**
   * Handle client subscription
   */
  handleSubscription(clientId, feed) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.add(feed);
    
    if (!this.subscriptions.has(feed)) {
      this.subscriptions.set(feed, new Set());
    }
    this.subscriptions.get(feed).add(clientId);

    console.log(`📡 Client ${clientId} subscribed to ${feed}`);
    
    this.sendToClient(clientId, {
      type: 'subscription-confirmed',
      feed: feed,
      timestamp: new Date().toISOString()
    });

    // Send initial data for the feed
    this.sendInitialFeedData(clientId, feed);
  }

  /**
   * Handle client unsubscription
   */
  handleUnsubscription(clientId, feed) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.subscriptions.delete(feed);
    
    if (this.subscriptions.has(feed)) {
      this.subscriptions.get(feed).delete(clientId);
    }

    console.log(`📡 Client ${clientId} unsubscribed from ${feed}`);
    
    this.sendToClient(clientId, {
      type: 'unsubscription-confirmed',
      feed: feed,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle client disconnect
   */
  handleClientDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all subscriptions
    for (const feed of client.subscriptions) {
      if (this.subscriptions.has(feed)) {
        this.subscriptions.get(feed).delete(clientId);
      }
    }

    this.clients.delete(clientId);
    console.log(`🔌 Client disconnected: ${clientId} (${this.clients.size} remaining)`);
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;

    try {
      client.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error(`❌ Error sending to client ${clientId}:`, error.message);
      this.handleClientDisconnect(clientId);
    }
  }

  /**
   * Broadcast message to all subscribers of a feed
   */
  broadcast(feed, message) {
    if (!this.subscriptions.has(feed)) return;

    const subscribers = this.subscriptions.get(feed);
    const broadcastMessage = {
      type: 'feed-data',
      feed: feed,
      data: message,
      timestamp: new Date().toISOString()
    };

    for (const clientId of subscribers) {
      this.sendToClient(clientId, broadcastMessage);
    }
  }

  /**
   * Start real-time data feeds
   */
  startDataFeeds() {
    // Market data feed (every 5 seconds)
    this.dataFeeds.set('market-data', setInterval(async () => {
      try {
        const response = await axios.get(`${this.marketDataUrl}/market-prices`, { timeout: 2000 });
        this.broadcast('market-data', response.data);
      } catch (error) {
        // Silently handle errors to avoid spam
      }
    }, 5000));

    // Trading signals feed (every 10 seconds)
    this.dataFeeds.set('trading-signals', setInterval(async () => {
      try {
        const response = await axios.get(`${this.automationUrl}/api/automation/status`, { timeout: 2000 });
        this.broadcast('trading-signals', {
          isRunning: response.data.isRunning,
          strategiesActive: response.data.strategiesActive,
          symbolsMonitored: response.data.symbolsMonitored,
          dailyPnL: response.data.dailyPnL,
          tradesExecutedToday: response.data.tradesExecutedToday
        });
      } catch (error) {
        // Silently handle errors
      }
    }, 10000));

    // Performance metrics feed (every 30 seconds)
    this.dataFeeds.set('performance-metrics', setInterval(async () => {
      try {
        const response = await axios.get(`${this.automationUrl}/api/automation/performance`, { timeout: 2000 });
        this.broadcast('performance-metrics', response.data);
      } catch (error) {
        // Silently handle errors
      }
    }, 30000));

    // System status feed (every 60 seconds)
    this.dataFeeds.set('system-status', setInterval(() => {
      const systemStatus = {
        websocketClients: this.clients.size,
        activeSubscriptions: Array.from(this.subscriptions.keys()).reduce((acc, feed) => {
          acc[feed] = this.subscriptions.get(feed).size;
          return acc;
        }, {}),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };
      
      this.broadcast('system-status', systemStatus);
    }, 60000));

    console.log('📡 Real-time data feeds started');
  }

  /**
   * Send initial data when client subscribes to a feed
   */
  async sendInitialFeedData(clientId, feed) {
    try {
      let initialData = null;

      switch (feed) {
        case 'market-data':
          const marketResponse = await axios.get(`${this.marketDataUrl}/market-prices`, { timeout: 2000 });
          initialData = marketResponse.data;
          break;
          
        case 'trading-signals':
          const signalResponse = await axios.get(`${this.automationUrl}/api/automation/status`, { timeout: 2000 });
          initialData = signalResponse.data;
          break;
          
        case 'system-status':
          initialData = {
            websocketClients: this.clients.size,
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString()
          };
          break;
      }

      if (initialData) {
        this.sendToClient(clientId, {
          type: 'initial-data',
          feed: feed,
          data: initialData,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`❌ Error sending initial data for ${feed}:`, error.message);
    }
  }

  /**
   * Send system status to client
   */
  sendSystemStatus(clientId) {
    const status = {
      server: {
        running: this.isRunning,
        clients: this.clients.size,
        uptime: process.uptime()
      },
      feeds: Array.from(this.dataFeeds.keys()),
      subscriptions: Array.from(this.subscriptions.keys()).reduce((acc, feed) => {
        acc[feed] = this.subscriptions.get(feed).size;
        return acc;
      }, {})
    };

    this.sendToClient(clientId, {
      type: 'system-status',
      data: status,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start ping interval to keep connections alive
   */
  startPingInterval() {
    setInterval(() => {
      const now = Date.now();
      
      for (const [clientId, client] of this.clients.entries()) {
        if (now - client.lastPing > this.config.pingInterval * 2) {
          // Client hasn't responded to ping, disconnect
          console.log(`🔌 Client ${clientId} timed out, disconnecting`);
          client.ws.terminate();
          this.handleClientDisconnect(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          // Send ping
          client.ws.ping();
        }
      }
    }, this.config.pingInterval);
  }

  /**
   * Generate unique client ID
   */
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      clients: this.clients.size,
      subscriptions: Array.from(this.subscriptions.keys()).reduce((acc, feed) => {
        acc[feed] = this.subscriptions.get(feed).size;
        return acc;
      }, {}),
      dataFeeds: Array.from(this.dataFeeds.keys()),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Stop WebSocket service
   */
  async stop() {
    console.log('🔌 Stopping WebSocket Service...');
    
    // Clear data feeds
    for (const [name, interval] of this.dataFeeds.entries()) {
      clearInterval(interval);
    }
    this.dataFeeds.clear();

    // Close all client connections
    for (const [clientId, client] of this.clients.entries()) {
      client.ws.close();
    }
    this.clients.clear();
    this.subscriptions.clear();

    // Close server
    if (this.server) {
      this.server.close();
    }

    this.isRunning = false;
    console.log('🔌 WebSocket Service stopped');
  }
}

module.exports = WebSocketService;
