//clients/pro-terminal/src/components/real-time/level2-data.ts
export interface Level2Data {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: number;
  sequence: number;
}

export interface OrderBookLevel {
  price: number;
  size: number;
  orders: number;
  exchange?: string;
}

export class Level2DataManager {
  private subscribers: Map<string, Set<(data: Level2Data) => void>> = new Map();
  private websocket: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(private wsUrl: string) {
    this.connect();
  }

  private connect() {
    try {
      this.websocket = new WebSocket(this.wsUrl);
      
      this.websocket.onopen = () => {
        console.log('Level2 WebSocket connected');
        this.reconnectAttempts = 0;
        this.subscribeToActiveSymbols();
      };

      this.websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Error parsing Level2 message:', error);
        }
      };

      this.websocket.onclose = () => {
        console.log('Level2 WebSocket disconnected');
        this.attemptReconnect();
      };

      this.websocket.onerror = (error) => {
        console.error('Level2 WebSocket error:', error);
      };
    } catch (error) {
      console.error('Failed to connect Level2 WebSocket:', error);
      this.attemptReconnect();
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      
      setTimeout(() => {
        console.log(`Attempting Level2 reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        this.connect();
      }, delay);
    }
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'l2update':
        this.processL2Update(data);
        break;
      case 'l2snapshot':
        this.processL2Snapshot(data);
        break;
      default:
        console.warn('Unknown Level2 message type:', data.type);
    }
  }

  private processL2Update(data: any) {
    const level2Data: Level2Data = {
      symbol: data.symbol,
      bids: data.bids || [],
      asks: data.asks || [],
      timestamp: data.timestamp || Date.now(),
      sequence: data.sequence || 0
    };

    this.notifySubscribers(data.symbol, level2Data);
  }

  private processL2Snapshot(data: any) {
    const level2Data: Level2Data = {
      symbol: data.symbol,
      bids: data.bids || [],
      asks: data.asks || [],
      timestamp: data.timestamp || Date.now(),
      sequence: data.sequence || 0
    };

    this.notifySubscribers(data.symbol, level2Data);
  }

  private notifySubscribers(symbol: string, data: Level2Data) {
    const symbolSubscribers = this.subscribers.get(symbol);
    if (symbolSubscribers) {
      symbolSubscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in Level2 subscriber callback:', error);
        }
      });
    }
  }

  private subscribeToActiveSymbols() {
    if (this.websocket?.readyState === WebSocket.OPEN) {
      const symbols = Array.from(this.subscribers.keys());
      if (symbols.length > 0) {
        this.websocket.send(JSON.stringify({
          type: 'subscribe',
          channels: ['level2'],
          symbols: symbols
        }));
      }
    }
  }

  public subscribe(symbol: string, callback: (data: Level2Data) => void): () => void {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
    }
    
    this.subscribers.get(symbol)!.add(callback);

    // Subscribe to symbol if websocket is connected
    if (this.websocket?.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'subscribe',
        channels: ['level2'],
        symbols: [symbol]
      }));
    }

    // Return unsubscribe function
    return () => {
      const symbolSubscribers = this.subscribers.get(symbol);
      if (symbolSubscribers) {
        symbolSubscribers.delete(callback);
        
        if (symbolSubscribers.size === 0) {
          this.subscribers.delete(symbol);
          
          // Unsubscribe from symbol
          if (this.websocket?.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify({
              type: 'unsubscribe',
              channels: ['level2'],
              symbols: [symbol]
            }));
          }
        }
      }
    };
  }

  public destroy() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
    }
    this.subscribers.clear();
  }
}

// React hook for Level2 data
import { useState, useEffect, useRef } from 'react';

export const useLevel2Data = (symbol: string, wsUrl: string) => {
  const [data, setData] = useState<Level2Data | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const managerRef = useRef<Level2DataManager | null>(null);

  useEffect(() => {
    if (!managerRef.current) {
      managerRef.current = new Level2DataManager(wsUrl);
    }

    const unsubscribe = managerRef.current.subscribe(symbol, (newData) => {
      setData(newData);
      setIsConnected(true);
    });

    return () => {
      unsubscribe();
      if (managerRef.current) {
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, [symbol, wsUrl]);

  return { data, isConnected };
};