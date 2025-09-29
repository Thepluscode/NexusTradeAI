'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  SparklesIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { formatCurrency, formatPercentage } from '@/utils/formatters';

interface RecommendationEngineProps {
  className?: string;
}

interface Recommendation {
  id: string;
  type: 'buy' | 'sell' | 'hold' | 'rebalance';
  symbol: string;
  confidence: number;
  priority: 'high' | 'medium' | 'low';
  reasoning: string[];
  targetPrice?: number;
  stopLoss?: number;
  timeHorizon: 'short' | 'medium' | 'long';
  riskLevel: 'low' | 'medium' | 'high';
  expectedReturn: number;
  maxDrawdown: number;
  timestamp: number;
  aiModel: string;
}

interface PortfolioSuggestion {
  action: 'increase' | 'decrease' | 'add' | 'remove';
  symbol: string;
  currentAllocation: number;
  suggestedAllocation: number;
  reasoning: string;
  impact: number;
}

interface MarketInsight {
  title: string;
  description: string;
  impact: 'positive' | 'negative' | 'neutral';
  confidence: number;
  timeframe: string;
  relevantSymbols: string[];
}

const RecommendationEngine: React.FC<RecommendationEngineProps> = ({ className }) => {
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'buy' | 'sell' | 'hold'>('all');
  const [selectedTimeHorizon, setSelectedTimeHorizon] = useState<'all' | 'short' | 'medium' | 'long'>('all');

  const { portfolio } = useSelector((state: RootState) => state.portfolio);
  const { symbols } = useSelector((state: RootState) => state.marketData);

  // Mock recommendations data
  const recommendations = useMemo((): Recommendation[] => [
    {
      id: '1',
      type: 'buy',
      symbol: 'ETH-USDT',
      confidence: 0.87,
      priority: 'high',
      reasoning: [
        'Strong technical breakout above resistance',
        'Positive sentiment from upcoming upgrade',
        'Institutional accumulation detected',
        'RSI showing oversold recovery'
      ],
      targetPrice: 2850,
      stopLoss: 2420,
      timeHorizon: 'medium',
      riskLevel: 'medium',
      expectedReturn: 15.2,
      maxDrawdown: 8.5,
      timestamp: Date.now() - 300000,
      aiModel: 'NexusAI-Pro v2.1'
    },
    {
      id: '2',
      type: 'sell',
      symbol: 'ADA-USDT',
      confidence: 0.73,
      priority: 'medium',
      reasoning: [
        'Approaching strong resistance level',
        'Decreasing volume trend',
        'Negative divergence in momentum',
        'Profit-taking opportunity'
      ],
      targetPrice: 0.42,
      stopLoss: 0.52,
      timeHorizon: 'short',
      riskLevel: 'low',
      expectedReturn: -3.2,
      maxDrawdown: 12.1,
      timestamp: Date.now() - 600000,
      aiModel: 'NexusAI-Pro v2.1'
    },
    {
      id: '3',
      type: 'buy',
      symbol: 'SOL-USDT',
      confidence: 0.91,
      priority: 'high',
      reasoning: [
        'Ecosystem growth accelerating',
        'Network activity at all-time highs',
        'Strong developer adoption',
        'Bullish chart pattern formation'
      ],
      targetPrice: 125,
      stopLoss: 85,
      timeHorizon: 'long',
      riskLevel: 'high',
      expectedReturn: 28.7,
      maxDrawdown: 15.3,
      timestamp: Date.now() - 900000,
      aiModel: 'NexusAI-Pro v2.1'
    },
    {
      id: '4',
      type: 'hold',
      symbol: 'BTC-USDT',
      confidence: 0.65,
      priority: 'medium',
      reasoning: [
        'Consolidation phase continues',
        'Mixed technical signals',
        'Awaiting macro clarity',
        'Strong long-term fundamentals'
      ],
      timeHorizon: 'medium',
      riskLevel: 'medium',
      expectedReturn: 5.8,
      maxDrawdown: 18.2,
      timestamp: Date.now() - 1200000,
      aiModel: 'NexusAI-Pro v2.1'
    }
  ], []);

  // Mock portfolio suggestions
  const portfolioSuggestions = useMemo((): PortfolioSuggestion[] => [
    {
      action: 'increase',
      symbol: 'ETH',
      currentAllocation: 25,
      suggestedAllocation: 35,
      reasoning: 'Strong momentum and upcoming catalysts suggest increased allocation',
      impact: 8.5
    },
    {
      action: 'decrease',
      symbol: 'ADA',
      currentAllocation: 15,
      suggestedAllocation: 8,
      reasoning: 'Technical weakness and reduced market interest warrant position reduction',
      impact: -2.3
    },
    {
      action: 'add',
      symbol: 'MATIC',
      currentAllocation: 0,
      suggestedAllocation: 7,
      reasoning: 'Polygon ecosystem growth and Layer 2 adoption trend',
      impact: 12.1
    }
  ], []);

  // Mock market insights
  const marketInsights = useMemo((): MarketInsight[] => [
    {
      title: 'DeFi Summer 2.0 Emerging',
      description: 'Increased activity in decentralized finance protocols suggests a new wave of innovation and adoption.',
      impact: 'positive',
      confidence: 0.78,
      timeframe: '3-6 months',
      relevantSymbols: ['ETH', 'UNI', 'AAVE', 'COMP']
    },
    {
      title: 'Regulatory Clarity Improving',
      description: 'Recent regulatory developments provide clearer framework for cryptocurrency operations.',
      impact: 'positive',
      confidence: 0.82,
      timeframe: '6-12 months',
      relevantSymbols: ['BTC', 'ETH', 'BNB']
    },
    {
      title: 'Institutional Adoption Accelerating',
      description: 'Major corporations and financial institutions continue to integrate blockchain technology.',
      impact: 'positive',
      confidence: 0.85,
      timeframe: '1-2 years',
      relevantSymbols: ['BTC', 'ETH', 'SOL']
    }
  ], []);

  const filteredRecommendations = useMemo(() => {
    return recommendations.filter(rec => {
      const typeMatch = selectedFilter === 'all' || rec.type === selectedFilter;
      const timeMatch = selectedTimeHorizon === 'all' || rec.timeHorizon === selectedTimeHorizon;
      return typeMatch && timeMatch;
    });
  }, [recommendations, selectedFilter, selectedTimeHorizon]);

  const filterOptions = [
    { label: 'All', value: 'all' },
    { label: 'Buy', value: 'buy' },
    { label: 'Sell', value: 'sell' },
    { label: 'Hold', value: 'hold' },
  ];

  const timeHorizonOptions = [
    { label: 'All Timeframes', value: 'all' },
    { label: 'Short Term', value: 'short' },
    { label: 'Medium Term', value: 'medium' },
    { label: 'Long Term', value: 'long' },
  ];

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'buy': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'sell': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'hold': return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      case 'rebalance': return 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600 dark:text-red-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': return 'text-green-600 dark:text-green-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'text-red-600 dark:text-red-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'low': return 'text-green-600 dark:text-green-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'positive': return 'text-green-600 dark:text-green-400';
      case 'negative': return 'text-red-600 dark:text-red-400';
      case 'neutral': return 'text-gray-600 dark:text-gray-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'increase':
      case 'add': return 'text-green-600 dark:text-green-400';
      case 'decrease':
      case 'remove': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl">
            <SparklesIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              AI Recommendations
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Personalized trading insights powered by machine learning
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {/* Filter Selector */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setSelectedFilter(option.value as any)}
                className={cn(
                  'px-3 py-1 text-sm font-medium rounded-md transition-all duration-200',
                  selectedFilter === option.value
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Time Horizon Selector */}
          <select
            value={selectedTimeHorizon}
            onChange={(e) => setSelectedTimeHorizon(e.target.value as any)}
            className="px-3 py-2 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {timeHorizonOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* AI Summary */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-2xl p-6 border border-indigo-200 dark:border-indigo-800"
      >
        <div className="flex items-center space-x-3 mb-4">
          <SparklesIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-semibold text-indigo-900 dark:text-indigo-100">
            AI Market Summary
          </h2>
        </div>

        <p className="text-indigo-800 dark:text-indigo-200 mb-4">
          Based on current market conditions, technical analysis, and sentiment data, our AI models suggest a
          <span className="font-semibold"> moderately bullish </span> outlook for the next 30 days.
          Key opportunities identified in ETH and SOL with recommended portfolio adjustments.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              {filteredRecommendations.length}
            </div>
            <div className="text-sm text-indigo-700 dark:text-indigo-300">Active Recommendations</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              {(filteredRecommendations.reduce((sum, r) => sum + r.confidence, 0) / filteredRecommendations.length * 100).toFixed(0)}%
            </div>
            <div className="text-sm text-indigo-700 dark:text-indigo-300">Avg Confidence</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              +{(filteredRecommendations.reduce((sum, r) => sum + r.expectedReturn, 0) / filteredRecommendations.length).toFixed(1)}%
            </div>
            <div className="text-sm text-indigo-700 dark:text-indigo-300">Expected Return</div>
          </div>
        </div>
      </motion.div>

      {/* Recommendations List */}
      <div className="space-y-4">
        {filteredRecommendations.map((recommendation, index) => (
          <motion.div
            key={recommendation.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-bold">
                    {recommendation.symbol.split('-')[0]}
                  </span>
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {recommendation.symbol}
                    </h3>
                    <span className={cn('px-2 py-1 text-xs font-medium rounded-full capitalize', getTypeColor(recommendation.type))}>
                      {recommendation.type}
                    </span>
                    <span className={cn('text-xs font-medium', getPriorityColor(recommendation.priority))}>
                      {recommendation.priority} priority
                    </span>
                  </div>

                  <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                    <span>Confidence: {formatPercentage(recommendation.confidence * 100)}</span>
                    <span>Risk: <span className={getRiskColor(recommendation.riskLevel)}>{recommendation.riskLevel}</span></span>
                    <span>{recommendation.timeHorizon} term</span>
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={cn(
                  'text-lg font-bold',
                  recommendation.expectedReturn >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {recommendation.expectedReturn >= 0 ? '+' : ''}{formatPercentage(recommendation.expectedReturn)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Expected Return</div>
              </div>
            </div>

            {/* Reasoning */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">AI Reasoning:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {recommendation.reasoning.map((reason, idx) => (
                  <div key={idx} className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full flex-shrink-0" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Price Targets */}
            {(recommendation.targetPrice || recommendation.stopLoss) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                {recommendation.targetPrice && (
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Target Price</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(recommendation.targetPrice)}
                    </div>
                  </div>
                )}
                {recommendation.stopLoss && (
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Stop Loss</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {formatCurrency(recommendation.stopLoss)}
                    </div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Max Drawdown</div>
                  <div className="font-medium text-red-600 dark:text-red-400">
                    -{formatPercentage(recommendation.maxDrawdown)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">AI Model</div>
                  <div className="font-medium text-gray-900 dark:text-white text-xs">
                    {recommendation.aiModel}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Portfolio Suggestions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          Portfolio Optimization Suggestions
        </h2>

        <div className="space-y-4">
          {portfolioSuggestions.map((suggestion, index) => (
            <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className={cn('p-2 rounded-lg', getActionColor(suggestion.action))}>
                  {suggestion.action === 'increase' || suggestion.action === 'add' ? (
                    <TrendingUpIcon className="h-4 w-4" />
                  ) : (
                    <TrendingDownIcon className="h-4 w-4" />
                  )}
                </div>

                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {suggestion.action.charAt(0).toUpperCase() + suggestion.action.slice(1)} {suggestion.symbol}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {suggestion.currentAllocation}% → {suggestion.suggestedAllocation}%
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={cn(
                  'font-medium',
                  suggestion.impact >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {suggestion.impact >= 0 ? '+' : ''}{suggestion.impact.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Impact</div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Market Insights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          Market Insights & Trends
        </h2>

        <div className="space-y-4">
          {marketInsights.map((insight, index) => (
            <div key={index} className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <div className={cn('w-2 h-2 rounded-full', getImpactColor(insight.impact))} />
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {insight.title}
                  </h3>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatPercentage(insight.confidence * 100)}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Confidence</div>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {insight.description}
              </p>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2">
                  <ClockIcon className="h-3 w-3 text-gray-400" />
                  <span className="text-gray-500 dark:text-gray-400">{insight.timeframe}</span>
                </div>

                <div className="flex space-x-1">
                  {insight.relevantSymbols.map((symbol, idx) => (
                    <span key={idx} className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                      {symbol}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default RecommendationEngine;