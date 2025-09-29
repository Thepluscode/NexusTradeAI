'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  EyeIcon,
  EyeSlashIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  TrendingUpIcon,
  TrendingDownIcon
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import MarketSummary from './MarketSummary';
import PortfolioView from './PortfolioView';
import RiskMetrics from './RiskMetrics';

interface DashboardOverviewProps {
  className?: string;
}

const DashboardOverview: React.FC<DashboardOverviewProps> = ({ className }) => {
  const [showBalance, setShowBalance] = useState(true);
  const [timeframe, setTimeframe] = useState<'1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL'>('1D');

  // Redux state
  const { user } = useSelector((state: RootState) => state.auth);
  const { performance } = useSelector((state: RootState) => state.portfolio);
  const { globalStats } = useSelector((state: RootState) => state.marketData);

  // Mock data - replace with real data from your services
  const portfolioData = {
    totalValue: 125847.32,
    dayChange: 2847.21,
    dayChangePercent: 2.31,
    weekChange: 5234.12,
    weekChangePercent: 4.34,
    monthChange: -1234.56,
    monthChangePercent: -0.97,
    yearChange: 23456.78,
    yearChangePercent: 22.89,
  };

  const quickStats = [
    {
      label: 'Buying Power',
      value: 45230.12,
      change: 0,
      changePercent: 0,
      icon: CurrencyDollarIcon,
    },
    {
      label: 'Day\'s P&L',
      value: portfolioData.dayChange,
      change: portfolioData.dayChange,
      changePercent: portfolioData.dayChangePercent,
      icon: TrendingUpIcon,
    },
    {
      label: 'Total Return',
      value: portfolioData.yearChange,
      change: portfolioData.yearChange,
      changePercent: portfolioData.yearChangePercent,
      icon: ChartBarIcon,
    },
  ];

  const timeframeOptions = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '1Y', value: '1Y' },
    { label: 'ALL', value: 'ALL' },
  ];

  const getChangeData = () => {
    switch (timeframe) {
      case '1D':
        return { change: portfolioData.dayChange, changePercent: portfolioData.dayChangePercent };
      case '1W':
        return { change: portfolioData.weekChange, changePercent: portfolioData.weekChangePercent };
      case '1M':
        return { change: portfolioData.monthChange, changePercent: portfolioData.monthChangePercent };
      case '1Y':
        return { change: portfolioData.yearChange, changePercent: portfolioData.yearChangePercent };
      default:
        return { change: portfolioData.dayChange, changePercent: portfolioData.dayChangePercent };
    }
  };

  const { change, changePercent } = getChangeData();
  const isPositive = change >= 0;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.firstName || user?.username}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Here's what's happening with your investments today
          </p>
        </div>

        {/* Global Market Status */}
        {globalStats && (
          <div className="hidden lg:flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <div className={cn(
                'w-2 h-2 rounded-full',
                globalStats.marketSentiment === 'bullish' ? 'bg-green-500' :
                globalStats.marketSentiment === 'bearish' ? 'bg-red-500' : 'bg-yellow-500'
              )} />
              <span className="text-gray-600 dark:text-gray-400">
                Market {globalStats.marketSentiment}
              </span>
            </div>
            <div className="text-gray-600 dark:text-gray-400">
              Fear & Greed: {globalStats.fearGreedIndex}
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Value Card - Robinhood Style */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Portfolio Value
            </h2>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {showBalance ? (
                <EyeIcon className="h-5 w-5 text-gray-500" />
              ) : (
                <EyeSlashIcon className="h-5 w-5 text-gray-500" />
              )}
            </button>
          </div>

          {/* Timeframe Selector */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {timeframeOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setTimeframe(option.value as any)}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-md transition-all duration-200',
                  timeframe === option.value
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Portfolio Value Display */}
        <div className="space-y-2">
          <div className="text-3xl font-bold text-gray-900 dark:text-white">
            {showBalance ? formatCurrency(portfolioData.totalValue) : '••••••'}
          </div>

          <div className="flex items-center space-x-2">
            <div className={cn(
              'flex items-center space-x-1 text-sm font-medium',
              isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            )}>
              {isPositive ? (
                <ArrowUpIcon className="h-4 w-4" />
              ) : (
                <ArrowDownIcon className="h-4 w-4" />
              )}
              <span>
                {showBalance ? formatCurrency(Math.abs(change)) : '••••'}
              </span>
              <span>
                ({showBalance ? formatPercentage(Math.abs(changePercent)) : '••••'})
              </span>
            </div>
            <span className="text-gray-500 dark:text-gray-400 text-sm">
              {timeframe === '1D' ? 'Today' : `Past ${timeframe}`}
            </span>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          {quickStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center space-x-3"
            >
              <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                <stat.icon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{stat.label}</p>
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-gray-900 dark:text-white">
                    {showBalance ? formatCurrency(stat.value) : '••••••'}
                  </span>
                  {stat.change !== 0 && (
                    <span className={cn(
                      'text-xs',
                      stat.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    )}>
                      {stat.change >= 0 ? '+' : ''}{showBalance ? formatPercentage(stat.changePercent) : '••••'}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Market Summary - Takes 2 columns */}
        <div className="lg:col-span-2">
          <MarketSummary />
        </div>

        {/* Risk Metrics - Takes 1 column */}
        <div>
          <RiskMetrics />
        </div>
      </div>

      {/* Portfolio View - Full width */}
      <div>
        <PortfolioView />
      </div>
    </div>
  );
};

export default DashboardOverview;