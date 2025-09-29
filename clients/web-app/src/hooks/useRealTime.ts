import { useEffect, useRef, useCallback, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { useWebSocket } from './useWebSocket';

interface RealTimeSubscription {
  type: 'ticker' | 'orderbook' | 'trades' | 'user_orders' | 'user_trades' | 'user_balances';
  symbol?: string;
  depth?: number;
}

interface UseRealTimeOptions {
  autoConnect?: boolean;
  subscriptions?: RealTimeSubscription[];
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export const useRealTime = (options: UseRealTimeOptions = {}) => {
  const {
    autoConnect = true,
    subscriptions = [],
  } = options;

  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const { watchlist } = useSelector((state: RootState) => state.marketData);

  const [activeSubscriptions, setActiveSubscriptions] = useState<Set<string>>(new Set());
  const subscriptionRef = useRef<Set<string>>(new Set());

  const {
    isConnected,
    connectionStatus,
    sendMessage,
  } = useWebSocket();

  // Subscribe to a specific data stream
  const subscribe = useCallback((subscription: RealTimeSubscription) => {
    if (!isConnected) return false;

    const subKey = `${subscription.type}:${subscription.symbol || 'global'}`;

    if (subscriptionRef.current.has(subKey)) {
      return true; // Already subscribed
    }

    const success = sendMessage({
      type: 'subscribe',
      data: {
        channel: subscription.type,
        symbol: subscription.symbol,
        depth: subscription.depth,
      },
    });

    if (success) {
      subscriptionRef.current.add(subKey);
      setActiveSubscriptions(new Set(subscriptionRef.current));
    }

    return success;
  }, [isConnected, sendMessage]);

  // Unsubscribe from a specific data stream
  const unsubscribe = useCallback((subscription: RealTimeSubscription) => {
    if (!isConnected) return false;

    const subKey = `${subscription.type}:${subscription.symbol || 'global'}`;

    if (!subscriptionRef.current.has(subKey)) {
      return true; // Not subscribed
    }

    const success = sendMessage({
      type: 'unsubscribe',
      data: {
        channel: subscription.type,
        symbol: subscription.symbol,
      },
    });

    if (success) {
      subscriptionRef.current.delete(subKey);
      setActiveSubscriptions(new Set(subscriptionRef.current));
    }

    return success;
  }, [isConnected, sendMessage]);

  // Subscribe to ticker data for a symbol
  const subscribeToTicker = useCallback((symbol: string) => {
    return subscribe({ type: 'ticker', symbol });
  }, [subscribe]);

  // Subscribe to order book data for a symbol
  const subscribeToOrderBook = useCallback((symbol: string, depth: number = 20) => {
    return subscribe({ type: 'orderbook', symbol, depth });
  }, [subscribe]);

  // Subscribe to trades data for a symbol
  const subscribeToTrades = useCallback((symbol: string) => {
    return subscribe({ type: 'trades', symbol });
  }, [subscribe]);

  // Subscribe to user-specific data (requires authentication)
  const subscribeToUserData = useCallback(() => {
    if (!isAuthenticated) return false;

    const userSubscriptions: RealTimeSubscription[] = [
      { type: 'user_orders' },
      { type: 'user_trades' },
      { type: 'user_balances' },
    ];

    return userSubscriptions.every(sub => subscribe(sub));
  }, [isAuthenticated, subscribe]);

  // Unsubscribe from ticker data for a symbol
  const unsubscribeFromTicker = useCallback((symbol: string) => {
    return unsubscribe({ type: 'ticker', symbol });
  }, [unsubscribe]);

  // Unsubscribe from order book data for a symbol
  const unsubscribeFromOrderBook = useCallback((symbol: string) => {
    return unsubscribe({ type: 'orderbook', symbol });
  }, [unsubscribe]);

  // Unsubscribe from trades data for a symbol
  const unsubscribeFromTrades = useCallback((symbol: string) => {
    return unsubscribe({ type: 'trades', symbol });
  }, [unsubscribe]);

  // Unsubscribe from user-specific data
  const unsubscribeFromUserData = useCallback(() => {
    const userSubscriptions: RealTimeSubscription[] = [
      { type: 'user_orders' },
      { type: 'user_trades' },
      { type: 'user_balances' },
    ];

    return userSubscriptions.every(sub => unsubscribe(sub));
  }, [unsubscribe]);

  // Subscribe to all watchlist symbols
  const subscribeToWatchlist = useCallback(() => {
    return watchlist.every((symbol: string) => {
      return subscribeToTicker(symbol) && subscribeToOrderBook(symbol);
    });
  }, [watchlist, subscribeToTicker, subscribeToOrderBook]);

  // Unsubscribe from all active subscriptions
  const unsubscribeAll = useCallback(() => {
    const success = sendMessage({
      type: 'unsubscribe_all',
      data: {},
    });

    if (success) {
      subscriptionRef.current.clear();
      setActiveSubscriptions(new Set());
    }

    return success;
  }, [sendMessage]);

  // Auto-subscribe to initial subscriptions when connected
  useEffect(() => {
    if (isConnected && autoConnect) {
      // Subscribe to initial subscriptions
      subscriptions.forEach(sub => subscribe(sub));

      // Subscribe to watchlist
      subscribeToWatchlist();

      // Subscribe to user data if authenticated
      if (isAuthenticated) {
        subscribeToUserData();
      }
    }
  }, [isConnected, autoConnect, subscriptions, subscribeToWatchlist, isAuthenticated, subscribeToUserData, subscribe]);

  // Auto-subscribe to new watchlist items
  useEffect(() => {
    if (isConnected) {
      watchlist.forEach((symbol: string) => {
        const tickerKey = `ticker:${symbol}`;
        const orderbookKey = `orderbook:${symbol}`;

        if (!subscriptionRef.current.has(tickerKey)) {
          subscribeToTicker(symbol);
        }
        if (!subscriptionRef.current.has(orderbookKey)) {
          subscribeToOrderBook(symbol);
        }
      });
    }
  }, [watchlist, isConnected, subscribeToTicker, subscribeToOrderBook]);

  // Cleanup subscriptions on unmount
  useEffect(() => {
    return () => {
      if (isConnected) {
        unsubscribeAll();
      }
    };
  }, [isConnected, unsubscribeAll]);

  return {
    // Connection state
    isConnected,
    connectionStatus,
    activeSubscriptions: Array.from(activeSubscriptions),

    // Subscription methods
    subscribe,
    unsubscribe,
    subscribeToTicker,
    subscribeToOrderBook,
    subscribeToTrades,
    subscribeToUserData,
    subscribeToWatchlist,
    unsubscribeFromTicker,
    unsubscribeFromOrderBook,
    unsubscribeFromTrades,
    unsubscribeFromUserData,
    unsubscribeAll,

    // Utility methods
    isSubscribed: (subscription: RealTimeSubscription) => {
      const subKey = `${subscription.type}:${subscription.symbol || 'global'}`;
      return activeSubscriptions.has(subKey);
    },
  };
};