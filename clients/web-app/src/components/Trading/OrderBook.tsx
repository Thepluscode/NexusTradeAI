'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  AdjustmentsHorizontalIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { formatCurrency, formatCompactNumber } from '@/utils/formatters';

interface OrderBookProps {
  symbol?: string;
  className?: string;
}

interface OrderBookEntry {
  price: number;
  size: number;
  total: number;
}

interface OrderBookData {
  symbol: string;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

const OrderBook: React.FC<OrderBookProps> = ({ symbol = 'BTC-USDT', className }) => {
  const [precision, setPrecision] = useState(2);
  const [grouping, setGrouping] = useState(1);
  const [showDepth, setShowDepth] = useState(10);

  // Redux state
  const { orderBooks, symbols } = useSelector((state: RootState) => state.marketData);

  // Mock order book data - replace with real data
  const mockOrderBook: OrderBookData = {
    symbol,
    bids: [
      { price: 43245.67, size: 0.5234, total: 0.5234 },
      { price: 43244.23, size: 0.8901, total: 1.4135 },
      { price: 43243.45, size: 1.2345, total: 2.6480 },
      { price: 43242.12, size: 0.6789, total: 3.3269 },
      { price: 43241.89, size: 2.1234, total: 5.4503 },
      { price: 43240.56, size: 0.9876, total: 6.4379 },
      { price: 43239.78, size: 1.5432, total: 7.9811 },
      { price: 43238.90, size: 0.7654, total: 8.7465 },
      { price: 43237.45, size: 1.8765, total: 10.6230 },
      { price: 43236.12, size: 0.4321, total: 11.0551 },
    ],
    asks: [
      { price: 43246.78, size: 0.4567, total: 0.4567 },
      { price: 43247.89, size: 0.7890, total: 1.2457 },
      { price: 43248.45, size: 1.1234, total: 2.3691 },
      { price: 43249.67, size: 0.5678, total: 2.9369 },
      { price: 43250.23, size: 1.9876, total: 4.9245 },
      { price: 43251.56, size: 0.8765, total: 5.8010 },
      { price: 43252.78, size: 1.4321, total: 7.2331 },
      { price: 43253.90, size: 0.6543, total: 7.8874 },
      { price: 43254.45, size: 1.7654, total: 9.6528 },
      { price: 43255.67, size: 0.3456, total: 9.9984 },
    ],
    timestamp: Date.now(),
  };

  const orderBookData = orderBooks[symbol] || mockOrderBook;
  const currentPrice = symbols[symbol]?.price || 43246.22;

  // Calculate spread
  const bestBid = orderBookData.bids[0]?.price || 0;
  const bestAsk = orderBookData.asks[0]?.price || 0;
  const spread = bestAsk - bestBid;
  const spreadPercent = bestBid > 0 ? (spread / bestBid) * 100 : 0;

  // Get max total for depth visualization
  const maxBidTotal = Math.max(...orderBookData.bids.slice(0, showDepth).map((b: OrderBookEntry) => b.total));
  const maxAskTotal = Math.max(...orderBookData.asks.slice(0, showDepth).map((a: OrderBookEntry) => a.total));
  const maxTotal = Math.max(maxBidTotal, maxAskTotal);

  const OrderBookRow: React.FC<{
    entry: OrderBookEntry;
    type: 'bid' | 'ask';
    index: number;
    maxTotal: number;
  }> = ({ entry, type, index, maxTotal }) => {
    const depthPercent = maxTotal > 0 ? (entry.total / maxTotal) * 100 : 0;

    return (
      <motion.div
        initial={{ opacity: 0, x: type === 'bid' ? -20 : 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.02 }}
        className="relative flex items-center justify-between py-1 px-3 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer group"
      >
        {/* Depth Background */}
        <div
          className={cn(
            'absolute inset-0 opacity-20',
            type === 'bid' ? 'bg-green-500' : 'bg-red-500'
          )}
          style={{
            width: `${depthPercent}%`,
            [type === 'bid' ? 'right' : 'left']: 0,
          }}
        />

        {/* Content */}
        <div className="relative z-10 flex items-center justify-between w-full">
          <div className={cn(
            'text-sm font-mono',
            type === 'bid' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {entry.price.toFixed(precision)}
          </div>

          <div className="text-sm font-mono text-gray-900 dark:text-white">
            {entry.size.toFixed(6)}
          </div>

          <div className="text-sm font-mono text-gray-500 dark:text-gray-400">
            {entry.total.toFixed(6)}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ChartBarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Order Book
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {symbol}
              </p>
            </div>
          </div>

          <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <AdjustmentsHorizontalIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Spread Info */}
        <div className="flex items-center justify-between text-xs">
          <div className="text-gray-500 dark:text-gray-400">
            Spread: {formatCurrency(spread, 'USD', { showSymbol: false })} ({spreadPercent.toFixed(3)}%)
          </div>
          <div className="text-gray-500 dark:text-gray-400">
            Last: {formatCurrency(currentPrice, 'USD', { showSymbol: false })}
          </div>
        </div>
      </div>

      {/* Column Headers */}
      <div className="px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <span>Price</span>
          <span>Size</span>
          <span>Total</span>
        </div>
      </div>

      {/* Order Book Content */}
      <div className="max-h-96 overflow-y-auto">
        {/* Asks (Sell Orders) - Displayed in reverse order */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          {orderBookData.asks
            .slice(0, showDepth)
            .reverse()
            .map((ask: OrderBookEntry, index: number) => (
              <OrderBookRow
                key={`ask-${ask.price}`}
                entry={ask}
                type="ask"
                index={index}
                maxTotal={maxTotal}
              />
            ))}
        </div>

        {/* Current Price */}
        <div className="py-2 px-3 bg-gray-100 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-center space-x-2">
            <div className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(currentPrice, 'USD', { showSymbol: false })}
            </div>
            <div className={cn(
              'flex items-center space-x-1 text-sm',
              symbols[symbol]?.changePercent24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {symbols[symbol]?.changePercent24h >= 0 ? (
                <ArrowUpIcon className="h-3 w-3" />
              ) : (
                <ArrowDownIcon className="h-3 w-3" />
              )}
              <span>{Math.abs(symbols[symbol]?.changePercent24h || 0).toFixed(2)}%</span>
            </div>
          </div>
        </div>

        {/* Bids (Buy Orders) */}
        <div>
          {orderBookData.bids
            .slice(0, showDepth)
            .map((bid: OrderBookEntry, index: number) => (
              <OrderBookRow
                key={`bid-${bid.price}`}
                entry={bid}
                type="bid"
                index={index}
                maxTotal={maxTotal}
              />
            ))}
        </div>
      </div>

      {/* Footer */}
      <div className="p-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-4">
            <div>
              <span className="text-green-600 dark:text-green-400">●</span> Bids
            </div>
            <div>
              <span className="text-red-600 dark:text-red-400">●</span> Asks
            </div>
          </div>
          <div>
            Depth: {showDepth} levels
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderBook;