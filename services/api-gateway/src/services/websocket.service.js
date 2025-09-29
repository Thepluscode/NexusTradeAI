import WebSocket from 'ws';
import { Redis } from 'ioredis';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';
import config from '../config';

class WebSocketService {
  constructor(server) {
    this.wss = new WebSocket.Server({ server, path: config.ws.path });
    this.clients = new Map();
    this.redis = new Redis(config.redis.url);
    this.redisSubscriber = new Redis(config.redis.url);
    
    this.setupEventHandlers();
    this.setupRedisSubscription();
    logger.info('WebSocket service initialized');
  }

  setupEventHandlers() {
    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error:', error);
    });
  }

  setupRedisSubscription() {
    this.redisSubscriber.psubscribe('broadcast:*');
    this.redisSubscriber.on('pmessage', (pattern, channel, message) => {
      this.broadcastToChannel(channel, message);
    });
  }

  async handleConnection(ws, req) {
    try {
      const clientId = await this.authenticate(ws, req);
      if (!clientId) return;

      // Initialize client data structure
      if (!this.clients.has(clientId)) {
        this.clients.set(clientId, new Set());
      }
      this.clients.get(clientId).add(ws);

      // Setup message handlers
      ws.on('message', (message) => this.handleMessage(ws, clientId, message));
      ws.on('close', () => this.handleClose(ws, clientId));
      ws.on('pong', () => this.handlePong(ws, clientId));

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        clientId,
        timestamp: Date.now()
      });

      logger.info(`Client connected: ${clientId}`, { clientId });
    } catch (error) {
      logger.error('Connection error:', error);
      ws.close(1008, error.message);
    }
  }

  async authenticate(ws, req) {
    const token = this.getTokenFromRequest(req);
    if (!token) {
      throw new Error('Authentication required');
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret);
      return decoded.id;
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  getTokenFromRequest(req) {
    const url = new URL(`http://dummy${req.url}`);
    return url.searchParams.get('token') || 
           req.headers.authorization?.split(' ')[1];
  }

  async handleMessage(ws, clientId, message) {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'subscribe':
          await this.handleSubscribe(ws, clientId, data);
          break;
        case 'unsubscribe':
          await this.handleUnsubscribe(ws, clientId, data);
          break;
        case 'ping':
          this.send(ws, { type: 'pong', timestamp: Date.now() });
          break;
        default:
          this.sendError(ws, 'Unknown message type');
      }
    } catch (error) {
      this.sendError(ws, 'Invalid message format');
    }
  }

  async handleSubscribe(ws, clientId, { channel, symbol }) {
    if (!channel || !symbol) {
      return this.sendError(ws, 'Channel and symbol are required');
    }

    const channelKey = `client:${clientId}:subscriptions`;
    const subscription = `${channel}:${symbol}`;
    
    await this.redis.sadd(channelKey, subscription);
    this.send(ws, { 
      type: 'subscribed', 
      channel, 
      symbol,
      timestamp: Date.now() 
    });
  }

  async handleUnsubscribe(ws, clientId, { channel, symbol }) {
    if (!channel || !symbol) {
      return this.sendError(ws, 'Channel and symbol are required');
    }

    const channelKey = `client:${clientId}:subscriptions`;
    const subscription = `${channel}:${symbol}`;
    
    await this.redis.srem(channelKey, subscription);
    this.send(ws, { 
      type: 'unsubscribed', 
      channel, 
      symbol,
      timestamp: Date.now() 
    });
  }

  async broadcastToChannel(channel, message) {
    const [prefix, ...channelParts] = channel.split(':');
    const channelName = channelParts.join(':');
    
    // Get all client IDs that have this channel in their subscriptions
    const clientIds = await this.redis.keys('client:*:subscriptions');
    
    for (const clientKey of clientIds) {
      const clientId = clientKey.split(':')[1];
      const isSubscribed = await this.redis.sismember(clientKey, channelName);
      
      if (isSubscribed && this.clients.has(clientId)) {
        this.clients.get(clientId).forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            this.send(ws, {
              type: 'message',
              channel: channelName,
              data: JSON.parse(message),
              timestamp: Date.now()
            });
          }
        });
      }
    }
  }

  handleClose(ws, clientId) {
    if (this.clients.has(clientId)) {
      const clientSockets = this.clients.get(clientId);
      clientSockets.delete(ws);
      
      if (clientSockets.size === 0) {
        this.clients.delete(clientId);
      }
    }
    logger.info(`Client disconnected: ${clientId}`);
  }

  handlePong(ws, clientId) {
    ws.isAlive = true;
  }

  send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  sendError(ws, message) {
    this.send(ws, {
      type: 'error',
      message,
      timestamp: Date.now()
    });
  }

  startHeartbeat() {
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }
}

export default WebSocketService;
