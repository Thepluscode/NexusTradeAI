'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CpuChipIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { formatCurrency, formatPercentage } from '@/utils/formatters';

interface PredictionDashboardProps {
  className?: string;
}

interface Prediction {
  symbol: string;
  timeframe: '1h' | '4h' | '1d' | '1w';
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  targetPrice: number;
  currentPrice: number;
  expectedReturn: number;
  riskLevel: 'low' | 'medium' | 'high';
  signals: string[];
  timestamp: number;
}

const PredictionDashboard: React.FC<PredictionDashboardProps> = ({ className }) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1h' | '4h' | '1d' | '1w'>('1d');

  // Mock predictions data
  const predictions: Prediction[] = [
    {
      symbol: 'BTC-USDT',
      timeframe: '1d',
      direction: 'bullish',
      confidence: 78.5,
      targetPrice: 45200,
      currentPrice: 43250,
      expectedReturn: 4.51,
      riskLevel: 'medium',
      signals: ['RSI oversold', 'Volume spike', 'Support level hold'],
      timestamp: Date.now(),
    },
    {
      symbol: 'ETH-USDT',
      timeframe: '1d',
      direction: 'bearish',
      confidence: 65.2,
      targetPrice: 2420,
      currentPrice: 2567,
      expectedReturn: -5.73,
      riskLevel: 'high',
      signals: ['Resistance rejection', 'Bearish divergence', 'High funding rate'],
      timestamp: Date.now(),
    },
    {
      symbol: 'ADA-USDT',
      timeframe: '1d',
      direction: 'bullish',
      confidence: 82.1,
      targetPrice: 0.52,
      currentPrice: 0.4567,
      expectedReturn: 13.86,
      riskLevel: 'low',
      signals: ['Breakout pattern', 'Volume confirmation', 'Positive sentiment'],
      timestamp: Date.now(),
    },
  ];

  const timeframeOptions = [
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
  ];

  const getDirectionColor = (direction: Prediction['direction']) => {
    switch (direction) {
      case 'bullish':
        return 'text-green-600 dark:text-green-400';
      case 'bearish':
        return 'text-red-600 dark:text-red-400';
      case 'neutral':
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getDirectionIcon = (direction: Prediction['direction']) => {
    switch (direction) {
      case 'bullish':
        return <ArrowTrendingUpIcon className="h-4 w-4" />;
      case 'bearish':
        return <ArrowTrendingDownIcon className="h-4 w-4" />;
      case 'neutral':
        return <ChartBarIcon className="h-4 w-4" />;
    }
  };

  const getRiskColor = (risk: Prediction['riskLevel']) => {
    switch (risk) {
      case 'low':
        return 'text-green-600 dark:text-green-400';
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'high':
        return 'text-red-600 dark:text-red-400';
    }
  };

  const PredictionCard: React.FC<{ prediction: Prediction; index: number }> = ({ prediction, index }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">
              {prediction.symbol.split('-')[0]}
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {prediction.symbol}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {prediction.timeframe.toUpperCase()} Prediction
            </p>
          </div>
        </div>

        <div className={cn('flex items-center space-x-1', getDirectionColor(prediction.direction))}>
          {getDirectionIcon(prediction.direction)}
          <span className="text-sm font-medium capitalize">
            {prediction.direction}
          </span>
        </div>
      </div>

      {/* Confidence & Target */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Confidence</p>
          <div className="flex items-center space-x-2">
            <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all duration-300',
                  prediction.confidence >= 70 ? 'bg-green-500' :
                  prediction.confidence >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                )}
                style={{ width: `${prediction.confidence}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {prediction.confidence.toFixed(1)}%
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Expected Return</p>
          <div className={cn(
            'text-sm font-medium',
            prediction.expectedReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {prediction.expectedReturn >= 0 ? '+' : ''}{formatPercentage(prediction.expectedReturn)}
          </div>
        </div>
      </div>

      {/* Price Info */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Price</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {formatCurrency(prediction.currentPrice)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Target Price</p>
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {formatCurrency(prediction.targetPrice)}
          </p>
        </div>
      </div>

      {/* Risk Level */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 dark:text-gray-400">Risk Level</span>
          <span className={cn('text-xs font-medium capitalize', getRiskColor(prediction.riskLevel))}>
            {prediction.riskLevel}
          </span>
        </div>
      </div>

      {/* Signals */}
      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Key Signals</p>
        <div className="space-y-1">
          {prediction.signals.slice(0, 3).map((signal, idx) => (
            <div key={idx} className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
              <span className="text-xs text-gray-600 dark:text-gray-300">{signal}</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl">
            <CpuChipIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              AI Predictions
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Machine learning powered market forecasts
            </p>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedTimeframe(option.value as any)}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-md transition-all duration-200',
                selectedTimeframe === option.value
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* AI Status */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-blue-200 dark:border-blue-800">
        <div className="flex items-center space-x-3">
          <LightBulbIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              AI Model Status: Active
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Last updated: 2 minutes ago • Processing 1,247 data points
            </p>
          </div>
        </div>
      </div>

      {/* Predictions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {predictions
          .filter(p => p.timeframe === selectedTimeframe)
          .map((prediction, index) => (
            <PredictionCard key={prediction.symbol} prediction={prediction} index={index} />
          ))}
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4 border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-start space-x-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
              Investment Disclaimer
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              AI predictions are for informational purposes only and should not be considered as financial advice.
              Past performance does not guarantee future results. Always conduct your own research.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictionDashboard;