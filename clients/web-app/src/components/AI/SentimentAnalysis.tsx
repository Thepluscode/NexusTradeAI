'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  FaceSmileIcon,
  FaceFrownIcon,
  ChatBubbleLeftRightIcon,
  NewspaperIcon,
  HashtagIcon,
  GlobeAltIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  MinusIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { formatPercentage } from '@/utils/formatters';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface SentimentAnalysisProps {
  className?: string;
  symbol?: string;
}

interface SentimentData {
  timestamp: number;
  overall: number; // -1 to 1
  social: number;
  news: number;
  technical: number;
  volume: number;
}

interface SentimentSource {
  name: string;
  sentiment: number;
  confidence: number;
  volume: number;
  change24h: number;
  icon: React.ComponentType<any>;
  color: string;
}

interface NewsItem {
  id: string;
  title: string;
  source: string;
  sentiment: number;
  impact: 'high' | 'medium' | 'low';
  timestamp: number;
  url: string;
}

const SentimentAnalysis: React.FC<SentimentAnalysisProps> = ({
  className,
  symbol = 'BTC-USDT'
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1h' | '4h' | '1d' | '7d'>('1d');
  const [selectedSource, setSelectedSource] = useState<'all' | 'social' | 'news' | 'technical'>('all');

  const { symbols } = useSelector((state: RootState) => state.marketData);

  // Mock sentiment data over time
  const sentimentHistory = useMemo((): SentimentData[] => {
    const data = [];
    for (let i = 0; i < 24; i++) {
      const baseTime = Date.now() - (23 - i) * 3600000; // Hourly data
      data.push({
        timestamp: baseTime,
        overall: (Math.random() - 0.5) * 1.5, // -0.75 to 0.75
        social: (Math.random() - 0.5) * 2,
        news: (Math.random() - 0.5) * 1.8,
        technical: (Math.random() - 0.5) * 1.2,
        volume: Math.random() * 1000 + 500,
      });
    }
    return data;
  }, []);

  // Mock sentiment sources
  const sentimentSources = useMemo((): SentimentSource[] => [
    {
      name: 'Twitter/X',
      sentiment: 0.65,
      confidence: 0.82,
      volume: 15420,
      change24h: 12.5,
      icon: HashtagIcon,
      color: '#1DA1F2'
    },
    {
      name: 'Reddit',
      sentiment: 0.42,
      confidence: 0.76,
      volume: 8930,
      change24h: -5.2,
      icon: ChatBubbleLeftRightIcon,
      color: '#FF4500'
    },
    {
      name: 'News Media',
      sentiment: 0.28,
      confidence: 0.91,
      volume: 342,
      change24h: 8.7,
      icon: NewspaperIcon,
      color: '#4B5563'
    },
    {
      name: 'Technical Analysis',
      sentiment: 0.73,
      confidence: 0.88,
      volume: 1250,
      change24h: 15.3,
      icon: TrendingUpIcon,
      color: '#10B981'
    },
    {
      name: 'Institutional',
      sentiment: 0.15,
      confidence: 0.95,
      volume: 89,
      change24h: -2.1,
      icon: GlobeAltIcon,
      color: '#6366F1'
    }
  ], []);

  // Mock news items
  const newsItems = useMemo((): NewsItem[] => [
    {
      id: '1',
      title: 'Bitcoin ETF Approval Sparks Institutional Interest',
      source: 'CoinDesk',
      sentiment: 0.8,
      impact: 'high',
      timestamp: Date.now() - 3600000,
      url: '#'
    },
    {
      id: '2',
      title: 'Regulatory Clarity Boosts Crypto Market Confidence',
      source: 'Bloomberg',
      sentiment: 0.6,
      impact: 'medium',
      timestamp: Date.now() - 7200000,
      url: '#'
    },
    {
      id: '3',
      title: 'Market Volatility Concerns Persist Among Traders',
      source: 'Reuters',
      sentiment: -0.4,
      impact: 'medium',
      timestamp: Date.now() - 10800000,
      url: '#'
    },
    {
      id: '4',
      title: 'DeFi Protocol Launches New Yield Farming Program',
      source: 'The Block',
      sentiment: 0.3,
      impact: 'low',
      timestamp: Date.now() - 14400000,
      url: '#'
    }
  ], []);

  // Calculate overall sentiment metrics
  const overallMetrics = useMemo(() => {
    const latest = sentimentHistory[sentimentHistory.length - 1];
    const previous = sentimentHistory[sentimentHistory.length - 2];

    const currentSentiment = latest?.overall || 0;
    const change = latest && previous ? latest.overall - previous.overall : 0;

    // Sentiment distribution
    const positive = sentimentSources.filter(s => s.sentiment > 0.2).length;
    const neutral = sentimentSources.filter(s => s.sentiment >= -0.2 && s.sentiment <= 0.2).length;
    const negative = sentimentSources.filter(s => s.sentiment < -0.2).length;

    return {
      current: currentSentiment,
      change,
      distribution: { positive, neutral, negative },
      confidence: sentimentSources.reduce((sum, s) => sum + s.confidence, 0) / sentimentSources.length,
      volume: sentimentSources.reduce((sum, s) => sum + s.volume, 0)
    };
  }, [sentimentHistory, sentimentSources]);

  const timeframeOptions = [
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '7D', value: '7d' },
  ];

  const sourceOptions = [
    { label: 'All Sources', value: 'all' },
    { label: 'Social Media', value: 'social' },
    { label: 'News', value: 'news' },
    { label: 'Technical', value: 'technical' },
  ];

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.2) return 'text-green-600 dark:text-green-400';
    if (sentiment < -0.2) return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const getSentimentIcon = (sentiment: number) => {
    if (sentiment > 0.2) return <FaceSmileIcon className="h-5 w-5" />;
    if (sentiment < -0.2) return <FaceFrownIcon className="h-5 w-5" />;
    return <MinusIcon className="h-5 w-5" />;
  };

  const getSentimentLabel = (sentiment: number) => {
    if (sentiment > 0.6) return 'Very Bullish';
    if (sentiment > 0.2) return 'Bullish';
    if (sentiment > -0.2) return 'Neutral';
    if (sentiment > -0.6) return 'Bearish';
    return 'Very Bearish';
  };

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400';
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {new Date(label).toLocaleTimeString()}
          </p>
          <p className="text-sm text-blue-600">
            Overall: {data.overall.toFixed(2)}
          </p>
          <p className="text-sm text-green-600">
            Social: {data.social.toFixed(2)}
          </p>
          <p className="text-sm text-purple-600">
            News: {data.news.toFixed(2)}
          </p>
          <p className="text-sm text-orange-600">
            Technical: {data.technical.toFixed(2)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl">
            <ChatBubbleLeftRightIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Sentiment Analysis
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {symbol} • Real-time market sentiment tracking
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
        </div>
      </div>

      {/* Overall Sentiment */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'p-6 rounded-2xl border',
          overallMetrics.current > 0.2
            ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
            : overallMetrics.current < -0.2
            ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'
            : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className={cn('flex items-center space-x-2', getSentimentColor(overallMetrics.current))}>
              {getSentimentIcon(overallMetrics.current)}
              <span className="text-2xl font-bold">
                {getSentimentLabel(overallMetrics.current)}
              </span>
            </div>

            <div className="flex items-center space-x-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Score:</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {overallMetrics.current.toFixed(2)}
              </span>
              <span className={cn(
                'text-xs',
                overallMetrics.change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}>
                {overallMetrics.change >= 0 ? '+' : ''}{overallMetrics.change.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">Confidence</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {formatPercentage(overallMetrics.confidence * 100)}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Sentiment Sources */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sentimentSources.map((source, index) => (
          <motion.div
            key={source.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${source.color}20` }}>
                  <source.icon className="h-5 w-5" style={{ color: source.color }} />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {source.name}
                </h3>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Sentiment</span>
                <div className={cn('flex items-center space-x-1', getSentimentColor(source.sentiment))}>
                  {getSentimentIcon(source.sentiment)}
                  <span className="font-medium">{source.sentiment.toFixed(2)}</span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">Volume</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {source.volume.toLocaleString()}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">24h Change</span>
                <span className={cn(
                  'font-medium',
                  source.change24h >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}>
                  {source.change24h >= 0 ? '+' : ''}{formatPercentage(source.change24h)}
                </span>
              </div>

              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-300"
                  style={{
                    backgroundColor: source.color,
                    width: `${source.confidence * 100}%`
                  }}
                />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {formatPercentage(source.confidence * 100)} confidence
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Sentiment Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          Sentiment Trends
        </h2>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={sentimentHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis
              dataKey="timestamp"
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(value) => new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              domain={[-1, 1]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="overall"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={false}
              name="Overall"
            />
            <Line
              type="monotone"
              dataKey="social"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
              name="Social"
            />
            <Line
              type="monotone"
              dataKey="news"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              name="News"
            />
            <Line
              type="monotone"
              dataKey="technical"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              name="Technical"
            />
          </LineChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Recent News */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700"
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
          Recent News & Analysis
        </h2>

        <div className="space-y-4">
          {newsItems.map((item, index) => (
            <div
              key={item.id}
              className="flex items-start justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
            >
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <span className={cn('px-2 py-1 text-xs font-medium rounded-full', getImpactColor(item.impact))}>
                    {item.impact} impact
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {item.source}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </span>
                </div>

                <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                  {item.title}
                </h3>
              </div>

              <div className={cn('flex items-center space-x-1 ml-4', getSentimentColor(item.sentiment))}>
                {getSentimentIcon(item.sentiment)}
                <span className="text-sm font-medium">{item.sentiment.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default SentimentAnalysis;