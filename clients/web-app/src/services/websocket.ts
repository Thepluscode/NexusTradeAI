import { EventEmitter } from 'events';

// Types
export interface WebSocketMessage {
  type: string;
  data: any;
  timestamp: number;
  id?: string;
}

export interface WebSocketConfig {
  url: string;
  protocols?: string[];
  reconnectAttempts?: number;
  reconnectInterval?: number;
  heartbeatInterval?: number;
  timeout?: number;
}

export interface SubscriptionOptions {
  channel: string;
  symbol?: string;
  depth?: number;
  interval?: string;
}

// WebSocket Service
export class WebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: WebSocketConfig;
  private isConnecting = false;
  private reconnectCount = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscriptions = new Set<string>();
  private messageQueue: WebSocketMessage[] = [];
  private connectionPromise: Promise<void> | null = null;

  constructor(config: WebSocketConfig) {
    super();
    this.config = {
      reconnectAttempts: 5,
      reconnectInterval: 3000,
      heartbeatInterval: 30000,
      timeout: 10000,
      ...config,
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(token?: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.isConnecting = true;
        this.emit('connecting');

        // Build WebSocket URL with token if provided
        let wsUrl = this.config.url;
        if (token) {
          const separator = wsUrl.includes('?') ? '&' : '?';
          wsUrl += `${separator}token=${encodeURIComponent(token)}`;
        }

        this.ws = new WebSocket(wsUrl, this.config.protocols);

        const connectTimeout = setTimeout(() => {
          if (this.ws?.readyState === WebSocket.CONNECTING) {
            this.ws.close();
            reject(new Error('Connection timeout'));
          }
        }, this.config.timeout);

        this.ws.onopen = () => {
          clearTimeout(connectTimeout);
          this.isConnecting = false;
          this.reconnectCount = 0;
          this.connectionPromise = null;

          this.emit('connected');
          this.startHeartbeat();
          this.processMessageQueue();
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event);
        };

        this.ws.onclose = (event) => {
          clearTimeout(connectTimeout);
          this.isConnecting = false;
          this.connectionPromise = null;
          this.stopHeartbeat();

          this.emit('disconnected', event);

          // Auto-reconnect if not a clean close
          if (event.code !== 1000 && this.reconnectCount < this.config.reconnectAttempts!) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          clearTimeout(connectTimeout);
          this.isConnecting = false;
          this.connectionPromise = null;

          this.emit('error', error);
          reject(error);
        };

      } catch (error) {
        this.isConnecting = false;
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.clearTimers();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.subscriptions.clear();
    this.messageQueue = [];
    this.reconnectCount = 0;
    this.connectionPromise = null;

    this.emit('disconnected', { code: 1000, reason: 'Client disconnect' });
  }

  /**
   * Send message to WebSocket server
   */
  send(message: Omit<WebSocketMessage, 'timestamp'>): boolean {
    const fullMessage: WebSocketMessage = {
      ...message,
      timestamp: Date.now(),
      id: message.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(fullMessage));
        this.emit('messageSent', fullMessage);
        return true;
      } catch (error) {
        this.emit('error', error);
        return false;
      }
    } else {
      // Queue message for later sending
      this.messageQueue.push(fullMessage);
      return false;
    }
  }

  /**
   * Subscribe to a data stream
   */
  subscribe(options: SubscriptionOptions): boolean {
    const subscriptionKey = this.getSubscriptionKey(options);

    if (this.subscriptions.has(subscriptionKey)) {
      return true; // Already subscribed
    }

    const success = this.send({
      type: 'subscribe',
      data: options,
    });

    if (success) {
      this.subscriptions.add(subscriptionKey);
      this.emit('subscribed', options);
    }

    return success;
  }

  /**
   * Unsubscribe from a data stream
   */
  unsubscribe(options: SubscriptionOptions): boolean {
    const subscriptionKey = this.getSubscriptionKey(options);

    if (!this.subscriptions.has(subscriptionKey)) {
      return true; // Not subscribed
    }

    const success = this.send({
      type: 'unsubscribe',
      data: options,
    });

    if (success) {
      this.subscriptions.delete(subscriptionKey);
      this.emit('unsubscribed', options);
    }

    return success;
  }

  /**
   * Unsubscribe from all data streams
   */
  unsubscribeAll(): boolean {
    const success = this.send({
      type: 'unsubscribe_all',
      data: {},
    });

    if (success) {
      this.subscriptions.clear();
      this.emit('unsubscribedAll');
    }

    return success;
  }

  /**
   * Get connection state
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state string
   */
  get connectionState(): string {
    if (!this.ws) return 'disconnected';

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
        return 'closing';
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'unknown';
    }
  }

  /**
   * Get active subscriptions
   */
  get activeSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);

      // Handle heartbeat response
      if (message.type === 'pong') {
        this.emit('pong', message);
        return;
      }

      // Handle subscription confirmations
      if (message.type === 'subscribed' || message.type === 'unsubscribed') {
        this.emit(message.type, message.data);
        return;
      }

      // Handle error messages
      if (message.type === 'error') {
        this.emit('error', new Error(message.data.message || 'WebSocket error'));
        return;
      }

      // Emit the message for handling by consumers
      this.emit('message', message);
      this.emit(`message:${message.type}`, message);

    } catch (error) {
      this.emit('error', new Error('Failed to parse WebSocket message'));
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({
          type: 'ping',
          data: { timestamp: Date.now() },
        });
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectCount++;
    const delay = this.config.reconnectInterval! * this.reconnectCount;

    this.emit('reconnecting', { attempt: this.reconnectCount, delay });

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.emit('error', error);
      });
    }, delay);
  }

  /**
   * Process queued messages
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws!.send(JSON.stringify(message));
        this.emit('messageSent', message);
      }
    }
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Generate subscription key
   */
  private getSubscriptionKey(options: SubscriptionOptions): string {
    const parts = [options.channel];
    if (options.symbol) parts.push(options.symbol);
    if (options.depth) parts.push(`depth:${options.depth}`);
    if (options.interval) parts.push(`interval:${options.interval}`);
    return parts.join(':');
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService({
  url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws',
});

export default webSocketService;