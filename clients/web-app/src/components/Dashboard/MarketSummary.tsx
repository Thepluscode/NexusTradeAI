'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  StarIcon,
  PlusIcon,
  ChartBarIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  FireIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';
import { cn } from '@/utils/cn';
import { formatCurrency, formatPercentage, formatCompactNumber } from '@/utils/formatters';
import { useMarketData } from '@/hooks/useMarketData';

interface MarketSummaryProps {
  className?: string;
}

interface MarketItem {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketCap?: number;
  isWatched: boolean;
  sparklineData?: number[];
}

const MarketSummary: React.FC<MarketSummaryProps> = ({ className }) => {
  const [activeTab, setActiveTab] = useState<'watchlist' | 'trending' | 'gainers' | 'losers'>('watchlist');
  const [searchQuery, setSearchQuery] = useState('');

  // Redux state
  const { symbols, watchlist } = useSelector((state: RootState) => state.marketData);
  const { addSymbolToWatchlist, removeSymbolFromWatchlist } = useMarketData();

  // Mock data - replace with real data from your services
  const mockMarketData: MarketItem[] = [
    {
      symbol: 'BTC-USDT',
      name: 'Bitcoin',
      price: 43250.67,
      change24h: 1250.34,
      changePercent24h: 2.98,
      volume24h: 28500000000,
      marketCap: 847000000000,
      isWatched: true,
      sparklineData: [42000, 42500, 43000, 42800, 43250],
    },
    {
      symbol: 'ETH-USDT',
      name: 'Ethereum',
      price: 2567.89,
      change24h: -45.23,
      changePercent24h: -1.73,
      volume24h: 15200000000,
      marketCap: 308000000000,
      isWatched: true,
      sparklineData: [2600, 2580, 2550, 2570, 2568],
    },
    {
      symbol: 'ADA-USDT',
      name: 'Cardano',
      price: 0.4567,
      change24h: 0.0234,
      changePercent24h: 5.41,
      volume24h: 890000000,
      marketCap: 16200000000,
      isWatched: true,
      sparklineData: [0.43, 0.44, 0.45, 0.46, 0.457],
    },
    {
      symbol: 'SOL-USDT',
      name: 'Solana',
      price: 98.45,
      change24h: 7.23,
      changePercent24h: 7.92,
      volume24h: 2100000000,
      marketCap: 42000000000,
      isWatched: false,
      sparklineData: [91, 94, 96, 99, 98.5],
    },
  ];

  const tabs = [
    { id: 'watchlist', label: 'Watchlist', icon: StarIcon },
    { id: 'trending', label: 'Trending', icon: FireIcon },
    { id: 'gainers', label: 'Top Gainers', icon: TrendingUpIcon },
    { id: 'losers', label: 'Top Losers', icon: TrendingDownIcon },
  ];

  const getFilteredData = (): MarketItem[] => {
    let data = mockMarketData;

    // Filter by search query
    if (searchQuery) {
      data = data.filter(item =>
        item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by active tab
    switch (activeTab) {
      case 'watchlist':
        return data.filter(item => item.isWatched);
      case 'trending':
        return data.sort((a, b) => b.volume24h - a.volume24h);
      case 'gainers':
        return data.filter(item => item.changePercent24h > 0).sort((a, b) => b.changePercent24h - a.changePercent24h);
      case 'losers':
        return data.filter(item => item.changePercent24h < 0).sort((a, b) => a.changePercent24h - b.changePercent24h);
      default:
        return data;
    }
  };

  const handleWatchlistToggle = (symbol: string, isWatched: boolean) => {
    if (isWatched) {
      removeSymbolFromWatchlist(symbol);
    } else {
      addSymbolToWatchlist(symbol);
    }
  };

  const MiniSparkline: React.FC<{ data: number[]; isPositive: boolean }> = ({ data, isPositive }) => {
    if (!data || data.length < 2) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * 60;
      const y = 20 - ((value - min) / range) * 20;
      return `${x},${y}`;
    }).join(' ');

    return (
      <svg width="60" height="20" className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke={isPositive ? '#10b981' : '#ef4444'}
          strokeWidth="1.5"
          className="opacity-80"
        />
      </svg>
    );
  };

  const MarketItemRow: React.FC<{ item: MarketItem; index: number }> = ({ item, index }) => {
    const isPositive = item.changePercent24h >= 0;

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.05 }}
        className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer group"
      >
        {/* Symbol and Name */}
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          <button
            onClick={() => handleWatchlistToggle(item.symbol, item.isWatched)}
            className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {item.isWatched ? (
              <StarSolidIcon className="h-4 w-4 text-yellow-500" />
            ) : (
              <StarIcon className="h-4 w-4 text-gray-400 group-hover:text-yellow-500" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-gray-900 dark:text-white text-sm">
                {item.symbol.split('-')[0]}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                /{item.symbol.split('-')[1]}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {item.name}
            </p>
          </div>
        </div>

        {/* Sparkline */}
        <div className="hidden sm:block mx-4">
          <MiniSparkline data={item.sparklineData || []} isPositive={isPositive} />
        </div>

        {/* Price and Change */}
        <div className="text-right">
          <div className="font-semibold text-gray-900 dark:text-white text-sm">
            {formatCurrency(item.price, 'USD', {
              minimumFractionDigits: item.price < 1 ? 4 : 2,
              maximumFractionDigits: item.price < 1 ? 4 : 2
            })}
          </div>
          <div className={cn(
            'flex items-center justify-end space-x-1 text-xs font-medium',
            isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {isPositive ? (
              <ArrowUpIcon className="h-3 w-3" />
            ) : (
              <ArrowDownIcon className="h-3 w-3" />
            )}
            <span>{formatPercentage(Math.abs(item.changePercent24h))}</span>
          </div>
        </div>

        {/* Volume (hidden on mobile) */}
        <div className="hidden lg:block text-right ml-4 min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">Volume</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {formatCompactNumber(item.volume24h)}
          </p>
        </div>
      </motion.div>
    );
  };

  const filteredData = getFilteredData();

  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700', className)}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Market Overview
          </h2>
          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <ChartBarIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex items-center space-x-2 px-3 py-2 text-sm font-medium rounded-md transition-all duration-200',
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:block">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mt-4">
          <input
            type="text"
            placeholder="Search symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Market Items */}
      <div className="max-h-96 overflow-y-auto">
        <AnimatePresence mode="wait">
          {filteredData.length > 0 ? (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredData.map((item, index) => (
                <MarketItemRow key={item.symbol} item={item} index={index} />
              ))}
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8 text-center"
            >
              <p className="text-gray-500 dark:text-gray-400">
                {searchQuery ? 'No symbols found' : 'No data available'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MarketSummary;