// React Hooks for Trading API Integration

import { useState, useEffect, useCallback, useRef } from 'react';
import { tradingAPI, MarketData, OrderRequest, OrderResponse, Position, Trade, Portfolio, RiskMetrics } from '@/services/api/TradingAPI';

// Market Data Hook
export const useMarketData = (symbol: string, refreshInterval: number = 1000) => {
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const marketData = await tradingAPI.getMarketData(symbol);
      setData(marketData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchData();
    
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
};

// Multiple Market Data Hook
export const useMultipleMarketData = (symbols: string[], refreshInterval: number = 5000) => {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const marketData = await tradingAPI.getMultipleMarketData(symbols);
      setData(marketData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  useEffect(() => {
    if (symbols.length > 0) {
      fetchData();
      
      if (refreshInterval > 0) {
        intervalRef.current = setInterval(fetchData, refreshInterval);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
};

// Order Management Hook
export const useOrderManagement = () => {
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const submitOrder = useCallback(async (orderRequest: OrderRequest): Promise<OrderResponse | null> => {
    try {
      setSubmitting(true);
      const result = await tradingAPI.submitOrder(orderRequest);
      return result;
    } catch (error) {
      console.error('Failed to submit order:', error);
      return null;
    } finally {
      setSubmitting(false);
    }
  }, []);

  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    try {
      setCancelling(orderId);
      const result = await tradingAPI.cancelOrder(orderId);
      return result;
    } catch (error) {
      console.error('Failed to cancel order:', error);
      return false;
    } finally {
      setCancelling(null);
    }
  }, []);

  return {
    submitOrder,
    cancelOrder,
    submitting,
    cancelling,
  };
};

// Open Orders Hook
export const useOpenOrders = (symbol?: string, refreshInterval: number = 5000) => {
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const openOrders = await tradingAPI.getOpenOrders(symbol);
      setOrders(openOrders);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch open orders');
    } finally {
      setLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    fetchOrders();
    
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchOrders, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchOrders, refreshInterval]);

  return { orders, loading, error, refetch: fetchOrders };
};

// Positions Hook
export const usePositions = (refreshInterval: number = 3000) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchPositions = useCallback(async () => {
    try {
      setLoading(true);
      const positionsData = await tradingAPI.getPositions();
      setPositions(positionsData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch positions');
    } finally {
      setLoading(false);
    }
  }, []);

  const closePosition = useCallback(async (symbol: string, quantity?: number): Promise<boolean> => {
    try {
      setClosing(symbol);
      const result = await tradingAPI.closePosition(symbol, quantity);
      if (result) {
        await fetchPositions(); // Refresh positions after closing
      }
      return result;
    } catch (error) {
      console.error('Failed to close position:', error);
      return false;
    } finally {
      setClosing(null);
    }
  }, [fetchPositions]);

  useEffect(() => {
    fetchPositions();
    
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchPositions, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchPositions, refreshInterval]);

  return { positions, loading, error, closing, closePosition, refetch: fetchPositions };
};

// Portfolio Hook
export const usePortfolio = (refreshInterval: number = 5000) => {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      const portfolioData = await tradingAPI.getPortfolio();
      setPortfolio(portfolioData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPortfolio();
    
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchPortfolio, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchPortfolio, refreshInterval]);

  return { portfolio, loading, error, refetch: fetchPortfolio };
};

// Risk Metrics Hook
export const useRiskMetrics = (refreshInterval: number = 10000) => {
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout>();

  const fetchRiskMetrics = useCallback(async () => {
    try {
      setLoading(true);
      const riskData = await tradingAPI.getRiskMetrics();
      setRiskMetrics(riskData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch risk metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRiskMetrics();
    
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(fetchRiskMetrics, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchRiskMetrics, refreshInterval]);

  return { riskMetrics, loading, error, refetch: fetchRiskMetrics };
};

// Trade History Hook
export const useTradeHistory = (params?: {
  symbol?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      const tradesData = await tradingAPI.getTradeHistory(params);
      setTrades(tradesData);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch trade history');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  return { trades, loading, error, refetch: fetchTrades };
};

// WebSocket Hook for Real-time Data
export const useWebSocket = () => {
  const [connected, setConnected] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    const ws = tradingAPI.connectWebSocket(
      (message) => {
        setData(message);
        setConnected(true);
        setError(null);
      },
      (err) => {
        setError(err.message || 'WebSocket error');
        setConnected(false);
      }
    );

    if (ws) {
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connected, data, error, connect, disconnect };
};
