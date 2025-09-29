// AI Recommendations Dashboard - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Zap,
  ArrowLeft,
  Brain,
  Target,
  Star,
  Clock,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Activity
} from 'lucide-react';

// Import the AI component
import RecommendationEngine from '../../components/AI/RecommendationEngine';

const AIRecommendationsPage: React.FC = () => {
  const [showValues, setShowValues] = useState(true);

  const recommendationStats = [
    {
      label: 'Active Recommendations',
      value: '18',
      change: '+5',
      positive: true,
      icon: Zap
    },
    {
      label: 'Success Rate',
      value: '84.7%',
      change: '+3.2%',
      positive: true,
      icon: Target
    },
    {
      label: 'Avg. Return',
      value: '12.8%',
      change: '+2.1%',
      positive: true,
      icon: TrendingUp
    },
    {
      label: 'Total Profit',
      value: '$24,567',
      change: '+18.5%',
      positive: true,
      icon: DollarSign
    }
  ];

  const activeRecommendations = [
    {
      id: 1,
      symbol: 'BTC-USDT',
      action: 'BUY',
      confidence: 92.5,
      targetPrice: 45800,
      currentPrice: 43250,
      stopLoss: 41000,
      timeframe: '3-5 days',
      reason: 'Strong technical breakout pattern with high volume confirmation',
      aiScore: 9.2,
      riskLevel: 'Medium',
      expectedReturn: '+15.2%'
    },
    {
      id: 2,
      symbol: 'ETH-USDT',
      action: 'SELL',
      confidence: 78.3,
      targetPrice: 2420,
      currentPrice: 2567,
      stopLoss: 2650,
      timeframe: '1-2 days',
      reason: 'Overbought conditions with bearish divergence signals',
      aiScore: 7.8,
      riskLevel: 'Low',
      expectedReturn: '+8.7%'
    },
    {
      id: 3,
      symbol: 'AAPL',
      action: 'BUY',
      confidence: 85.1,
      targetPrice: 185,
      currentPrice: 175.84,
      stopLoss: 170,
      timeframe: '1-2 weeks',
      reason: 'Earnings momentum and institutional accumulation detected',
      aiScore: 8.5,
      riskLevel: 'Low',
      expectedReturn: '+5.2%'
    }
  ];

  const recentPerformance = [
    {
      symbol: 'TSLA',
      action: 'BUY',
      entryPrice: 240.50,
      exitPrice: 265.80,
      return: '+10.5%',
      status: 'Completed',
      date: '2024-11-10'
    },
    {
      symbol: 'NVDA',
      action: 'SELL',
      entryPrice: 485.20,
      exitPrice: 462.10,
      return: '+4.8%',
      status: 'Completed',
      date: '2024-11-08'
    },
    {
      symbol: 'MSFT',
      action: 'BUY',
      entryPrice: 378.90,
      exitPrice: 395.40,
      return: '+4.4%',
      status: 'Completed',
      date: '2024-11-05'
    }
  ];

  const getActionColor = (action: string) => {
    return action === 'BUY' ? 'text-green-400 bg-green-500/20' : 'text-red-400 bg-red-500/20';
  };

  const getRiskColor = (risk: string) => {
    switch (risk.toLowerCase()) {
      case 'low':
        return 'text-green-400 bg-green-500/20';
      case 'medium':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'high':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  return (
    <>
      <Head>
        <title>AI Recommendations - NexusTradeAI</title>
        <meta name="description" content="Personalized AI-powered trading recommendations and alerts" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Navigation */}
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
                  <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">AI Recommendations</span>
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

        {/* Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-white mb-2">AI Trading Recommendations</h1>
            <p className="text-slate-400 text-lg">
              Personalized trading recommendations powered by advanced machine learning algorithms
            </p>
          </motion.div>

          {/* Recommendation Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            {recommendationStats.map((stat, index) => (
              <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-orange-400" />
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

          {/* Active Recommendations */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Active Recommendations</h2>
            <div className="space-y-6">
              {activeRecommendations.map((rec) => (
                <div key={rec.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-4">
                      <h3 className="text-xl font-semibold text-white">{rec.symbol}</h3>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getActionColor(rec.action)}`}>
                        {rec.action}
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(rec.riskLevel)}`}>
                        {rec.riskLevel} Risk
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Star className="w-5 h-5 text-yellow-400" />
                      <span className="text-white font-semibold">{rec.aiScore}/10</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-slate-400 text-sm">Current Price</div>
                      <div className="text-white font-semibold">${rec.currentPrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Target Price</div>
                      <div className="text-white font-semibold">${rec.targetPrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Stop Loss</div>
                      <div className="text-white font-semibold">${rec.stopLoss.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Expected Return</div>
                      <div className="text-green-400 font-semibold">{rec.expectedReturn}</div>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <div className="text-slate-400 text-sm mb-2">AI Analysis</div>
                    <p className="text-slate-300 text-sm">{rec.reason}</p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-300 text-sm">{rec.timeframe}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Target className="w-4 h-4 text-slate-400" />
                        <span className="text-slate-300 text-sm">{rec.confidence}% Confidence</span>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button className="flex items-center space-x-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
                        <ThumbsUp className="w-4 h-4" />
                        <span>Accept</span>
                      </button>
                      <button className="flex items-center space-x-1 bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-600 transition-colors">
                        <ThumbsDown className="w-4 h-4" />
                        <span>Dismiss</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="w-full bg-slate-700 rounded-full h-2 mt-4">
                    <div
                      className="bg-gradient-to-r from-orange-500 to-orange-600 h-2 rounded-full transition-all"
                      style={{ width: `${rec.confidence}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent Performance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Recent Performance</h2>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="text-left p-4 text-slate-300 font-medium">Symbol</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Action</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Entry Price</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Exit Price</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Return</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Status</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPerformance.map((trade, index) => (
                      <tr key={index} className="border-t border-slate-700/50">
                        <td className="p-4 text-white font-medium">{trade.symbol}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(trade.action)}`}>
                            {trade.action}
                          </span>
                        </td>
                        <td className="p-4 text-slate-300">${trade.entryPrice}</td>
                        <td className="p-4 text-slate-300">${trade.exitPrice}</td>
                        <td className="p-4 text-green-400 font-semibold">{trade.return}</td>
                        <td className="p-4">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            {trade.status}
                          </span>
                        </td>
                        <td className="p-4 text-slate-400">{trade.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>

          {/* AI Recommendation Engine Component */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <RecommendationEngine />
          </motion.div>

          {/* Quick Navigation */}
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
                  <Brain className="w-5 h-5 text-white" />
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
              href="/ai/sentiment"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">Sentiment Analysis</h3>
              </div>
              <p className="text-slate-400 text-sm">Market sentiment and social indicators</p>
            </Link>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default AIRecommendationsPage;
