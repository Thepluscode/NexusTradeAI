import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowLeft,
  BarChart3,
  MessageCircle,
  Users,
  Eye,
  EyeOff,
  RefreshCw,
  Hash
} from 'lucide-react';

import SentimentAnalysis from '../../components/AI/SentimentAnalysis';

const AISentimentPage: React.FC = () => {
  const [showValues, setShowValues] = useState(true);

  const sentimentStats = [
    {
      label: 'Overall Sentiment',
      value: 'Bullish',
      change: '+12%',
      positive: true,
      icon: TrendingUp
    },
    {
      label: 'Social Mentions',
      value: '47.2K',
      change: '+8.5%',
      positive: true,
      icon: MessageCircle
    },
    {
      label: 'Sentiment Score',
      value: '7.8/10',
      change: '+0.6',
      positive: true,
      icon: Activity
    },
    {
      label: 'Trending Assets',
      value: '12',
      change: '+3',
      positive: true,
      icon: Hash
    }
  ];

  const assetSentiment = [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      sentiment: 'Bullish',
      score: 8.2,
      mentions: 15420,
      change: '+15.2%',
      positive: true,
      emoji: '😊'
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      sentiment: 'Bullish',
      score: 7.8,
      mentions: 12340,
      change: '+8.7%',
      positive: true,
      emoji: '😊'
    },
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      sentiment: 'Neutral',
      score: 6.1,
      mentions: 8920,
      change: '-2.1%',
      positive: false,
      emoji: '😐'
    },
    {
      symbol: 'TSLA',
      name: 'Tesla Inc.',
      sentiment: 'Bearish',
      score: 4.3,
      mentions: 11250,
      change: '-12.5%',
      positive: false,
      emoji: '😟'
    }
  ];

  const socialSources = [
    { name: 'Twitter', percentage: 35, color: 'bg-blue-500' },
    { name: 'Reddit', percentage: 28, color: 'bg-orange-500' },
    { name: 'Discord', percentage: 18, color: 'bg-purple-500' },
    { name: 'Telegram', percentage: 12, color: 'bg-cyan-500' },
    { name: 'Others', percentage: 7, color: 'bg-gray-500' }
  ];

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case 'bullish':
        return 'text-green-400 bg-green-500/20';
      case 'bearish':
        return 'text-red-400 bg-red-500/20';
      case 'neutral':
        return 'text-yellow-400 bg-yellow-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  return (
    <>
      <Head>
        <title>AI Sentiment Analysis - NexusTradeAI</title>
        <meta name="description" content="Real-time market sentiment analysis from social media and news" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <nav className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <Link href="/dashboard" className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back to Dashboard</span>
                </Link>
                <div className="w-px h-6 bg-slate-700"></div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                    <Activity className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Sentiment Analysis</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowValues(!showValues)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  {showValues ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
                <button className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors">
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </nav>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-white mb-2">AI Sentiment Analysis</h1>
            <p className="text-slate-400 text-lg">
              Real-time market sentiment tracking from social media, news, and community discussions
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            {sentimentStats.map((stat, index) => (
              <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-green-400" />
                  <span className={`text-sm font-medium ${stat.positive ? 'text-green-400' : 'text-red-400'}`}>
                    {stat.change}
                  </span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {showValues ? stat.value : '••••••'}
                </div>
                <div className="text-slate-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Asset Sentiment Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {assetSentiment.map((asset, index) => (
                <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{asset.emoji}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{asset.symbol}</h3>
                        <p className="text-slate-400 text-sm">{asset.name}</p>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getSentimentColor(asset.sentiment)}`}>
                      {asset.sentiment}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-slate-400 text-sm">Sentiment Score</div>
                      <div className="text-white font-semibold">{asset.score}/10</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Mentions (24h)</div>
                      <div className="text-white font-semibold">{asset.mentions.toLocaleString()}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 text-sm">24h Change</span>
                    <span className={`font-semibold ${asset.positive ? 'text-green-400' : 'text-red-400'}`}>
                      {asset.change}
                    </span>
                  </div>
                  
                  <div className="w-full bg-slate-700 rounded-full h-2 mt-3">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        asset.score >= 7 ? 'bg-green-500' : asset.score >= 5 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${(asset.score / 10) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Social Media Sources</h2>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="space-y-4">
                {socialSources.map((source, index) => (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full ${source.color}`}></div>
                      <span className="text-white font-medium">{source.name}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-32 bg-slate-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${source.color}`}
                          style={{ width: `${source.percentage}%` }}
                        ></div>
                      </div>
                      <span className="text-slate-300 text-sm w-8">{source.percentage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <SentimentAnalysis />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <Link
              href="/ai/insights"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">AI Insights</h3>
              </div>
              <p className="text-slate-400 text-sm">Portfolio analysis and trading insights</p>
            </Link>

            <Link
              href="/ai/predictions"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">Market Predictions</h3>
              </div>
              <p className="text-slate-400 text-sm">AI-powered market forecasting</p>
            </Link>

            <Link
              href="/ai/recommendations"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">AI Recommendations</h3>
              </div>
              <p className="text-slate-400 text-sm">Personalized trading recommendations</p>
            </Link>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default AISentimentPage;
