import { EventEmitter } from 'events';
import WebSocket from 'ws';
import Decimal from 'decimal.js';

// Configure Decimal.js for high precision
Decimal.config({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
});

export interface DMAConfig {
  endpoint: string;
  apiKey: string;
  secretKey: string;
  passphrase?: string;
  testnet?: boolean;
  maxReconnectAttempts: number;
  reconnectDelay: number;
  heartbeatInterval: number;
  orderTimeout: number;
  enableLatencyTracking: boolean;
  coLocationEnabled: boolean;
}

export interface DMAOrder {
  id: string;
  clientOrderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTD';
  postOnly?: boolean;
  reduceOnly?: boolean;
  timestamp: number;
  latencyTracking?: {
    clientSent: number;
    serverReceived?: number;
    serverProcessed?: number;
    clientReceived?: number;
    totalLatency?: number;
  };
}

export interface DMAOrderResponse {
  orderId: string;
  clientOrderId: string;
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
  executedQuantity: number;
  remainingQuantity: number;
  averagePrice: number;
  fees: number;
  timestamp: number;
  latency?: number;
  rejectReason?: string;
}

export interface LatencyMetrics {
  symbol: string;
  orderToAck: number; // Time from order sent to ack received
  orderToFill: number; // Time from order sent to fill received
  marketDataLatency: number; // Time from exchange to client
  roundTripTime: number; // Full round trip latency
  jitter: number; // Latency variance
  timestamp: number;
}

export class DirectMarketAccess extends EventEmitter {
  private config: DMAConfig;
  private ws: WebSocket | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pendingOrders: Map<string, DMAOrder> = new Map();
  private latencyMetrics: Map<string, LatencyMetrics[]> = new Map();
  private sequenceNumber = 0;

  constructor(config: DMAConfig) {
    super();
    this.config = config;
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const wsUrl = this.buildWebSocketUrl();
        this.ws = new WebSocket(wsUrl, {
          headers: this.buildAuthHeaders(),
        });

        this.ws.on('open', () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data);
        });

        this.ws.on('close', (code: number, reason: string) => {
          this.handleDisconnection(code, reason);
        });

        this.ws.on('error', (error: Error) => {
          this.emit('error', error);
          reject(error);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Connection timeout'));
          }
        }, 10000);

      } catch (error) {
        reject(error);
      }
    });
  }

  private buildWebSocketUrl(): string {
    const baseUrl = this.config.testnet
      ? this.config.endpoint.replace('api', 'api-testnet')
      : this.config.endpoint;

    return `${baseUrl}/ws/private`;
  }

  private buildAuthHeaders(): Record<string, string> {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp);

    return {
      'X-API-KEY': this.config.apiKey,
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'X-PASSPHRASE': this.config.passphrase || '',
    };
  }

  private generateSignature(timestamp: string): string {
    // Implementation would depend on exchange's signature requirements
    // This is a placeholder for the actual signature generation
    const crypto = require('crypto');
    const message = timestamp + 'GET' + '/ws/private';
    return crypto.createHmac('sha256', this.config.secretKey).update(message).digest('base64');
  }

  public async placeOrder(order: Omit<DMAOrder, 'id' | 'timestamp' | 'latencyTracking'>): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Not connected to exchange');
    }

    const orderId = this.generateOrderId();
    const timestamp = Date.now();

    const dmaOrder: DMAOrder = {
      ...order,
      id: orderId,
      timestamp,
      latencyTracking: this.config.enableLatencyTracking ? {
        clientSent: timestamp,
      } : undefined,
    };

    this.pendingOrders.set(order.clientOrderId, dmaOrder);

    const orderMessage = {
      type: 'place_order',
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      side: order.side,
      orderType: order.type,
      quantity: order.quantity.toString(),
      price: order.price?.toString(),
      stopPrice: order.stopPrice?.toString(),
      timeInForce: order.timeInForce,
      postOnly: order.postOnly,
      reduceOnly: order.reduceOnly,
      timestamp,
    };

    this.sendMessage(orderMessage);

    // Set order timeout
    setTimeout(() => {
      if (this.pendingOrders.has(order.clientOrderId)) {
        this.emit('orderTimeout', { clientOrderId: order.clientOrderId });
      }
    }, this.config.orderTimeout);

    return orderId;
  }

  public async cancelOrder(clientOrderId: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to exchange');
    }

    const cancelMessage = {
      type: 'cancel_order',
      clientOrderId,
      timestamp: Date.now(),
    };

    this.sendMessage(cancelMessage);
  }

  private sendMessage(message: any): void {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private generateOrderId(): string {
    return `dma_${Date.now()}_${++this.sequenceNumber}`;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.isConnected) {
        this.sendMessage({
          type: 'ping',
          timestamp: Date.now(),
        });
      }
    }, this.config.heartbeatInterval);
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString());
      const receiveTime = Date.now();

      switch (message.type) {
        case 'pong':
          this.handlePong(message, receiveTime);
          break;
        case 'order_ack':
          this.handleOrderAck(message, receiveTime);
          break;
        case 'order_fill':
          this.handleOrderFill(message, receiveTime);
          break;
        case 'order_cancel':
          this.handleOrderCancel(message, receiveTime);
          break;
        case 'order_reject':
          this.handleOrderReject(message, receiveTime);
          break;
        case 'market_data':
          this.handleMarketData(message, receiveTime);
          break;
        default:
          this.emit('message', message);
      }
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }

  private handleOrderAck(message: any, receiveTime: number): void {
    const order = this.pendingOrders.get(message.clientOrderId);
    if (order && this.config.enableLatencyTracking) {
      const latency = receiveTime - order.timestamp;
      this.updateLatencyMetrics(order.symbol, 'orderToAck', latency);

      if (order.latencyTracking) {
        order.latencyTracking.serverReceived = message.serverTimestamp;
        order.latencyTracking.clientReceived = receiveTime;
        order.latencyTracking.totalLatency = latency;
      }
    }

    const response: DMAOrderResponse = {
      orderId: message.orderId,
      clientOrderId: message.clientOrderId,
      status: 'open',
      executedQuantity: 0,
      remainingQuantity: message.quantity,
      averagePrice: 0,
      fees: 0,
      timestamp: receiveTime,
      latency: order ? receiveTime - order.timestamp : undefined,
    };

    this.emit('orderAck', response);
  }

  private handlePong(message: any, receiveTime: number): void {
    if (message.timestamp) {
      const latency = receiveTime - message.timestamp;
      this.emit('latency', { type: 'heartbeat', latency });
    }
  }

  private updateLatencyMetrics(symbol: string, type: keyof LatencyMetrics, latency: number): void {
    if (!this.latencyMetrics.has(symbol)) {
      this.latencyMetrics.set(symbol, []);
    }

    const metrics = this.latencyMetrics.get(symbol)!;
    const now = Date.now();

    // Keep only recent metrics (last 1000 samples)
    if (metrics.length >= 1000) {
      metrics.shift();
    }

    // Find or create current metrics entry
    let currentMetrics = metrics.find(m => now - m.timestamp < 1000);
    if (!currentMetrics) {
      currentMetrics = {
        symbol,
        orderToAck: 0,
        orderToFill: 0,
        marketDataLatency: 0,
        roundTripTime: 0,
        jitter: 0,
        timestamp: now,
      };
      metrics.push(currentMetrics);
    }

    // Update specific metric
    (currentMetrics as any)[type] = latency;

    this.emit('latencyUpdate', { symbol, type, latency, metrics: currentMetrics });
  }

  private handleDisconnection(code: number, reason: string): void {
    this.isConnected = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.emit('disconnected', { code, reason });

    // Attempt reconnection
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        this.connect().catch(error => {
          this.emit('reconnectFailed', error);
        });
      }, this.config.reconnectDelay * this.reconnectAttempts);
    } else {
      this.emit('maxReconnectAttemptsReached');
    }
  }

  public getLatencyMetrics(symbol: string): LatencyMetrics[] {
    return this.latencyMetrics.get(symbol) || [];
  }

  public getPendingOrders(): DMAOrder[] {
    return Array.from(this.pendingOrders.values());
  }

  public isConnectedToExchange(): boolean {
    return this.isConnected;
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.isConnected = false;
    this.pendingOrders.clear();
  }

  private handleOrderFill(message: any, receiveTime: number): void {
    const order = this.pendingOrders.get(message.clientOrderId);
    if (order && this.config.enableLatencyTracking) {
      const latency = receiveTime - order.timestamp;
      this.updateLatencyMetrics(order.symbol, 'orderToFill', latency);
    }

    const response: DMAOrderResponse = {
      orderId: message.orderId,
      clientOrderId: message.clientOrderId,
      status: message.remainingQuantity > 0 ? 'open' : 'filled',
      executedQuantity: message.executedQuantity,
      remainingQuantity: message.remainingQuantity,
      averagePrice: message.averagePrice,
      fees: message.fees,
      timestamp: receiveTime,
      latency: order ? receiveTime - order.timestamp : undefined,
    };

    if (response.status === 'filled') {
      this.pendingOrders.delete(message.clientOrderId);
    }

    this.emit('orderFill', response);
  }

  private handleOrderCancel(message: any, receiveTime: number): void {
    this.pendingOrders.delete(message.clientOrderId);

    const response: DMAOrderResponse = {
      orderId: message.orderId,
      clientOrderId: message.clientOrderId,
      status: 'cancelled',
      executedQuantity: message.executedQuantity || 0,
      remainingQuantity: 0,
      averagePrice: message.averagePrice || 0,
      fees: message.fees || 0,
      timestamp: receiveTime,
    };

    this.emit('orderCancel', response);
  }

  private handleOrderReject(message: any, receiveTime: number): void {
    this.pendingOrders.delete(message.clientOrderId);

    const response: DMAOrderResponse = {
      orderId: message.orderId || '',
      clientOrderId: message.clientOrderId,
      status: 'rejected',
      executedQuantity: 0,
      remainingQuantity: 0,
      averagePrice: 0,
      fees: 0,
      timestamp: receiveTime,
      rejectReason: message.reason,
    };

    this.emit('orderReject', response);
  }

  private handleMarketData(message: any, receiveTime: number): void {
    if (this.config.enableLatencyTracking && message.exchangeTimestamp) {
      const latency = receiveTime - message.exchangeTimestamp;
      this.updateLatencyMetrics(message.symbol, 'marketData', latency);
    }

    this.emit('marketData', {
      ...message,
      clientReceiveTime: receiveTime,
    });
  }
}

export default DirectMarketAccess;