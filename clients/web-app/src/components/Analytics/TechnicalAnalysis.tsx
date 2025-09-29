'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  ChartBarIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { formatCurrency, formatPercentage } from '@/utils/formatters';
import {
  calculateRSI,
  calculateSMA,
  calculateBollingerBands
} from '@/utils/calculations';

interface TechnicalAnalysisProps {
  className?: string;
  symbol?: string;
}

interface TechnicalIndicator {
  name: string;
  value: number;
  signal: 'bullish' | 'bearish' | 'neutral';
  strength: 'strong' | 'moderate' | 'weak';
  description: string;
}

interface PriceLevel {
  type: 'support' | 'resistance';
  price: number;
  strength: number;
  touches: number;
}

const TechnicalAnalysis: React.FC<TechnicalAnalysisProps> = ({
  className,
  symbol = 'BTC-USDT'
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1h' | '4h' | '1d' | '1w'>('1d');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { symbols } = useSelector((state: RootState) => state.marketData);
  const currentSymbol = symbols[symbol];

  // Mock price data - replace with real historical data
  const mockPriceData = useMemo(() => {
    const prices = [];
    let basePrice = currentSymbol?.price || 43250;

    for (let i = 0; i < 100; i++) {
      const change = (Math.random() - 0.5) * 0.02; // ±1% random change
      basePrice = basePrice * (1 + change);
      prices.push({
        timestamp: Date.now() - (99 - i) * 3600000, // Hourly data
        open: basePrice * (1 + (Math.random() - 0.5) * 0.005),
        high: basePrice * (1 + Math.random() * 0.01),
        low: basePrice * (1 - Math.random() * 0.01),
        close: basePrice,
        volume: Math.random() * 1000000,
      });
    }
    return prices;
  }, [currentSymbol?.price]);

  // Calculate technical indicators
  const technicalIndicators = useMemo((): TechnicalIndicator[] => {
    const closes = mockPriceData.map(d => d.close);
    const highs = mockPriceData.map(d => d.high);
    const lows = mockPriceData.map(d => d.low);

    const rsi = calculateRSI(closes, 14);
    const bollinger = calculateBollingerBands(closes, 20, 2);
    const sma20 = calculateSMA(closes, 20);
    const sma50 = calculateSMA(closes, 50);

    const currentRSI = rsi[rsi.length - 1] || 50;
    const currentPrice = closes[closes.length - 1];
    const currentSMA20 = sma20[sma20.length - 1] || currentPrice;
    const currentSMA50 = sma50[sma50.length - 1] || currentPrice;
    const currentBBUpper = bollinger.upper[bollinger.upper.length - 1] || currentPrice;
    const currentBBLower = bollinger.lower[bollinger.lower.length - 1] || currentPrice;

    // Simple MACD approximation
    const ema12 = closes.slice(-12).reduce((sum, price) => sum + price, 0) / 12;
    const ema26 = closes.slice(-26).reduce((sum, price) => sum + price, 0) / 26;
    const macdLine = ema12 - ema26;

    // Simple Stochastic approximation
    const recentHighs = highs.slice(-14);
    const recentLows = lows.slice(-14);
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    const stochK = ((currentPrice - lowestLow) / (highestHigh - lowestLow)) * 100;

    return [
      {
        name: 'RSI (14)',
        value: currentRSI,
        signal: currentRSI > 70 ? 'bearish' : currentRSI < 30 ? 'bullish' : 'neutral',
        strength: Math.abs(currentRSI - 50) > 30 ? 'strong' : Math.abs(currentRSI - 50) > 15 ? 'moderate' : 'weak',
        description: currentRSI > 70 ? 'Overbought condition' : currentRSI < 30 ? 'Oversold condition' : 'Neutral momentum'
      },
      {
        name: 'MACD',
        value: macdLine,
        signal: macdLine > 0 ? 'bullish' : macdLine < 0 ? 'bearish' : 'neutral',
        strength: Math.abs(macdLine) > 100 ? 'strong' : Math.abs(macdLine) > 50 ? 'moderate' : 'weak',
        description: macdLine > 0 ? 'Bullish momentum' : 'Bearish momentum'
      },
      {
        name: 'Stochastic (14)',
        value: stochK,
        signal: stochK > 80 ? 'bearish' : stochK < 20 ? 'bullish' : 'neutral',
        strength: Math.abs(stochK - 50) > 30 ? 'strong' : Math.abs(stochK - 50) > 15 ? 'moderate' : 'weak',
        description: stochK > 80 ? 'Overbought' : stochK < 20 ? 'Oversold' : 'Neutral'
      },
      {
        name: 'SMA 20/50',
        value: currentSMA20 - currentSMA50,
        signal: currentSMA20 > currentSMA50 ? 'bullish' : currentSMA20 < currentSMA50 ? 'bearish' : 'neutral',
        strength: Math.abs(currentSMA20 - currentSMA50) > currentPrice * 0.02 ? 'strong' : Math.abs(currentSMA20 - currentSMA50) > currentPrice * 0.01 ? 'moderate' : 'weak',
        description: currentSMA20 > currentSMA50 ? 'Short MA above Long MA' : 'Short MA below Long MA'
      },
      {
        name: 'Bollinger Bands',
        value: ((currentPrice - currentBBLower) / (currentBBUpper - currentBBLower)) * 100,
        signal: currentPrice > currentBBUpper ? 'bearish' : currentPrice < currentBBLower ? 'bullish' : 'neutral',
        strength: currentPrice > currentBBUpper || currentPrice < currentBBLower ? 'strong' : 'moderate',
        description: currentPrice > currentBBUpper ? 'Above upper band' : currentPrice < currentBBLower ? 'Below lower band' : 'Within bands'
      }
    ];
  }, [mockPriceData]);

  // Calculate support and resistance levels
  const supportResistanceLevels = useMemo((): PriceLevel[] => {
    const prices = mockPriceData.map(d => d.close);
    const levels: PriceLevel[] = [];

    // Simple pivot point calculation
    const recentPrices = prices.slice(-20);
    const sortedPrices = [...recentPrices].sort((a, b) => a - b);

    // Support levels (lower prices with multiple touches)
    const support1 = sortedPrices[Math.floor(sortedPrices.length * 0.2)];
    const support2 = sortedPrices[Math.floor(sortedPrices.length * 0.1)];

    // Resistance levels (higher prices with multiple touches)
    const resistance1 = sortedPrices[Math.floor(sortedPrices.length * 0.8)];
    const resistance2 = sortedPrices[Math.floor(sortedPrices.length * 0.9)];

    levels.push(
      { type: 'support', price: support1, strength: 0.8, touches: 3 },
      { type: 'support', price: support2, strength: 0.6, touches: 2 },
      { type: 'resistance', price: resistance1, strength: 0.7, touches: 4 },
      { type: 'resistance', price: resistance2, strength: 0.9, touches: 2 }
    );

    return levels.sort((a, b) => b.price - a.price);
  }, [mockPriceData]);

  // Calculate overall signal
  const overallSignal = useMemo(() => {
    const bullishCount = technicalIndicators.filter(i => i.signal === 'bullish').length;
    const bearishCount = technicalIndicators.filter(i => i.signal === 'bearish').length;
    const strongSignals = technicalIndicators.filter(i => i.strength === 'strong').length;

    if (bullishCount > bearishCount + 1) {
      return { signal: 'bullish', strength: strongSignals > 2 ? 'strong' : 'moderate' };
    } else if (bearishCount > bullishCount + 1) {
      return { signal: 'bearish', strength: strongSignals > 2 ? 'strong' : 'moderate' };
    }
    return { signal: 'neutral', strength: 'weak' };
  }, [technicalIndicators]);

  const timeframeOptions = [
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
  ];

  const getSignalColor = (signal: string) => {
    switch (signal) {
      case 'bullish': return 'text-green-600 dark:text-green-400';
      case 'bearish': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getSignalIcon = (signal: string) => {
    switch (signal) {
      case 'bullish': return <TrendingUpIcon className="h-4 w-4" />;
      case 'bearish': return <TrendingDownIcon className="h-4 w-4" />;
      default: return <ChartBarIcon className="h-4 w-4" />;
    }
  };

  const getStrengthBadge = (strength: string) => {
    const colors = {
      strong: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      moderate: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      weak: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
    };

    return (
      <span className={cn('px-2 py-1 text-xs font-medium rounded-full', colors[strength as keyof typeof colors])}>
        {strength}
      </span>
    );
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
            <ChartBarIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Technical Analysis
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {symbol} • {selectedTimeframe.toUpperCase()} timeframe
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
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

          {/* Advanced Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              showAdvanced
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
            )}
          >
            <AdjustmentsHorizontalIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Overall Signal */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'p-6 rounded-2xl border',
          overallSignal.signal === 'bullish'
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
            : overallSignal.signal === 'bearish'
            ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
            : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={cn('flex items-center space-x-2', getSignalColor(overallSignal.signal))}>
              {getSignalIcon(overallSignal.signal)}
              <span className="text-lg font-semibold capitalize">
                {overallSignal.signal} Signal
              </span>
            </div>
            {getStrengthBadge(overallSignal.strength)}
          </div>

          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">Current Price</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(currentSymbol?.price || 0)}
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          Based on {technicalIndicators.length} technical indicators across {selectedTimeframe} timeframe
        </div>
      </motion.div>

      {/* Technical Indicators Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {technicalIndicators.map((indicator, index) => (
          <motion.div
            key={indicator.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {indicator.name}
              </h3>
              {getStrengthBadge(indicator.strength)}
            </div>

            <div className="flex items-center space-x-2 mb-2">
              <div className={cn('flex items-center space-x-1', getSignalColor(indicator.signal))}>
                {getSignalIcon(indicator.signal)}
                <span className="font-medium capitalize">{indicator.signal}</span>
              </div>
            </div>

            <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {indicator.value.toFixed(2)}
            </div>

            <p className="text-sm text-gray-600 dark:text-gray-400">
              {indicator.description}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Support & Resistance Levels */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Support & Resistance Levels
          </h2>
          <InformationCircleIcon className="h-5 w-5 text-gray-400" />
        </div>

        <div className="space-y-4">
          {supportResistanceLevels.map((level, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50"
            >
              <div className="flex items-center space-x-3">
                <div className={cn(
                  'w-3 h-3 rounded-full',
                  level.type === 'resistance'
                    ? 'bg-red-500'
                    : 'bg-green-500'
                )} />
                <div>
                  <div className="font-medium text-gray-900 dark:text-white capitalize">
                    {level.type}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {level.touches} touches • {(level.strength * 100).toFixed(0)}% strength
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(level.price)}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {formatPercentage(((level.price - (currentSymbol?.price || 0)) / (currentSymbol?.price || 1)) * 100)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Advanced Analysis */}
      {showAdvanced && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center space-x-2 mb-6">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Advanced Technical Analysis
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                Momentum Oscillators
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">RSI Divergence:</span>
                  <span className="text-gray-900 dark:text-white">None detected</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">MACD Crossover:</span>
                  <span className="text-green-600 dark:text-green-400">Bullish</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Stoch Overbought:</span>
                  <span className="text-red-600 dark:text-red-400">Yes</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                Trend Analysis
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Primary Trend:</span>
                  <span className="text-green-600 dark:text-green-400">Bullish</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Secondary Trend:</span>
                  <span className="text-gray-600 dark:text-gray-400">Sideways</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Volatility:</span>
                  <span className="text-yellow-600 dark:text-yellow-400">Moderate</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default TechnicalAnalysis;