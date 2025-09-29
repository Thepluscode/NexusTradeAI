import { useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  fetchMarketData,
  fetchOHLCV,
  fetchOrderBook,
  fetchTechnicalIndicators,
  fetchGlobalStats,
  setSelectedSymbol,
  setSelectedTimeframe,
  addToWatchlist,
  removeFromWatchlist,
  selectMarketData,
  selectSymbols,
  selectWatchlist,
  selectSelectedSymbol,
  selectGlobalStats,
  MarketDataState,
} from '@/store/slices/marketDataSlice';

export const useMarketData = () => {
  const dispatch = useDispatch();
  const marketData = useSelector(selectMarketData);
  const symbols = useSelector(selectSymbols);
  const watchlist = useSelector(selectWatchlist);
  const selectedSymbol = useSelector(selectSelectedSymbol);
  const globalStats = useSelector(selectGlobalStats);

  // Fetch market data for multiple symbols
  const fetchSymbols = useCallback((symbolList: string[]) => {
    dispatch(fetchMarketData(symbolList));
  }, [dispatch]);

  // Fetch OHLCV data for a specific symbol
  const fetchSymbolOHLCV = useCallback((
    symbol: string,
    timeframe: string,
    limit?: number
  ) => {
    dispatch(fetchOHLCV({ symbol, timeframe, limit }));
  }, [dispatch]);

  // Fetch order book for a symbol
  const fetchSymbolOrderBook = useCallback((symbol: string) => {
    dispatch(fetchOrderBook(symbol));
  }, [dispatch]);

  // Fetch technical indicators
  const fetchSymbolIndicators = useCallback((symbol: string, timeframe: string) => {
    dispatch(fetchTechnicalIndicators({ symbol, timeframe }));
  }, [dispatch]);

  // Fetch global market statistics
  const fetchGlobalMarketStats = useCallback(() => {
    dispatch(fetchGlobalStats());
  }, [dispatch]);

  // Symbol selection
  const selectSymbol = useCallback((symbol: string | null) => {
    dispatch(setSelectedSymbol(symbol));
  }, [dispatch]);

  // Timeframe selection
  const selectTimeframe = useCallback((timeframe: MarketDataState['selectedTimeframe']) => {
    dispatch(setSelectedTimeframe(timeframe));
  }, [dispatch]);

  // Watchlist management
  const addSymbolToWatchlist = useCallback((symbol: string) => {
    dispatch(addToWatchlist(symbol));
  }, [dispatch]);

  const removeSymbolFromWatchlist = useCallback((symbol: string) => {
    dispatch(removeFromWatchlist(symbol));
  }, [dispatch]);

  // Get symbol data
  const getSymbolData = useCallback((symbol: string) => {
    return symbols[symbol] || null;
  }, [symbols]);

  // Get watchlist data
  const getWatchlistData = useCallback(() => {
    return watchlist.map(symbol => symbols[symbol]).filter(Boolean);
  }, [watchlist, symbols]);

  // Auto-fetch watchlist data on mount and when watchlist changes
  useEffect(() => {
    if (watchlist.length > 0) {
      fetchSymbols(watchlist);
    }
  }, [watchlist, fetchSymbols]);

  // Auto-fetch global stats on mount
  useEffect(() => {
    fetchGlobalMarketStats();

    // Set up interval to fetch global stats every 30 seconds
    const interval = setInterval(fetchGlobalMarketStats, 30000);

    return () => clearInterval(interval);
  }, [fetchGlobalMarketStats]);

  // Auto-fetch OHLCV data when selected symbol or timeframe changes
  useEffect(() => {
    if (selectedSymbol && marketData.selectedTimeframe) {
      fetchSymbolOHLCV(selectedSymbol, marketData.selectedTimeframe);
      fetchSymbolIndicators(selectedSymbol, marketData.selectedTimeframe);
      fetchSymbolOrderBook(selectedSymbol);
    }
  }, [selectedSymbol, marketData.selectedTimeframe, fetchSymbolOHLCV, fetchSymbolIndicators, fetchSymbolOrderBook]);

  return {
    // State
    marketData,
    symbols,
    watchlist,
    selectedSymbol,
    globalStats,
    isLoading: marketData.isLoading,
    error: marketData.error,
    isConnected: marketData.isConnected,
    connectionStatus: marketData.connectionStatus,

    // Actions
    fetchSymbols,
    fetchSymbolOHLCV,
    fetchSymbolOrderBook,
    fetchSymbolIndicators,
    fetchGlobalMarketStats,
    selectSymbol,
    selectTimeframe,
    addSymbolToWatchlist,
    removeSymbolFromWatchlist,

    // Helpers
    getSymbolData,
    getWatchlistData,
  };
};