//clients/web-app/src/hooks/useWebSocket.ts
import { useState, useEffect, useRef, useCallback } from 'react';

interface WebSocketOptions {
  url: string;
  protocols?: string | string[];
  reconnectAttempts?: number;
  reconnectInterval?: number;
  onOpen?: (event: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (data: any) => void;
}

interface WebSocketState {
  socket: WebSocket | null;
  lastMessage: any;
  readyState: number;
  isConnected: boolean;
  error: Event | null;
}

export const useWebSocket = (options: WebSocketOptions) => {
  const {
    url,
    protocols,
    reconnectAttempts = 5,
    reconnectInterval = 1000,
    onOpen,
    onClose,
    onError,
    onMessage
  } = options;

  const [state, setState] = useState<WebSocketState>({
    socket: null,
    lastMessage: null,
    readyState: WebSocket.CONNECTING,
    isConnected: false,
    error: null
  });

  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectCountRef = useRef(0);
  const shouldReconnectRef = useRef(true);

  const connect = useCallback(() => {
    try {
      const socket = new WebSocket(url, protocols);

      socket.onopen = (event) => {
        setState(prev => ({
          ...prev,
          socket,
          readyState: socket.readyState,
          isConnected: true,
          error: null
        }));
        reconnectCountRef.current = 0;
        onOpen?.(event);
      };

      socket.onclose = (event) => {
        setState(prev => ({
          ...prev,
          socket: null,
          readyState: WebSocket.CLOSED,
          isConnected: false
        }));

        onClose?.(event);

        if (shouldReconnectRef.current && reconnectCountRef.current < reconnectAttempts) {
          reconnectCountRef.current++;
          const timeout = reconnectInterval * Math.pow(2, reconnectCountRef.current - 1);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, timeout);
        }
      };

      socket.onerror = (event) => {
        setState(prev => ({
          ...prev,
          error: event
        }));
        onError?.(event);
      };

      socket.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch (e) {
          data = event.data;
        }

        setState(prev => ({
          ...prev,
          lastMessage: data
        }));

        onMessage?.(data);
      };

      setState(prev => ({
        ...prev,
        socket,
        readyState: socket.readyState
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error as Event
      }));
    }
  }, [url, protocols, reconnectAttempts, reconnectInterval, onOpen, onClose, onError, onMessage]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (state.socket) {
      state.socket.close();
    }
  }, [state.socket]);

  const sendMessage = useCallback((message: any) => {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      const data = typeof message === 'string' ? message : JSON.stringify(message);
      state.socket.send(data);
      return true;
    }
    return false;
  }, [state.socket]);

  useEffect(() => {
    connect();

    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (state.socket) {
        state.socket.close();
      }
    };
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    sendMessage
  };
};
