// AI Prediction Dashboard - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Brain,
  ArrowLeft,
  BarChart3,
  Target,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw,
  Clock,
  DollarSign
} from 'lucide-react';

// Import the AI component
import PredictionDashboard from '../../components/AI/PredictionDashboard';

const AIPredictionsPage: React.FC = () => {
  const [showValues, setShowValues] = useState(true);

  const predictionStats = [
    {
      label: 'Prediction Accuracy',
      value: '87.3%',
      change: '+2.1%',
      positive: true,
      icon: Target
    },
    {
      label: 'Active Predictions',
      value: '24',
      change: '+6',
      positive: true,
      icon: Activity
    },
    {
      label: 'Confidence Score',
      value: '92.5%',
      change: '+1.8%',
      positive: true,
      icon: Brain
    },
    {
      label: 'Profit from Predictions',
      value: '$12,847',
      change: '+15.2%',
      positive: true,
      icon: DollarSign
    }
  ];

  const marketPredictions = [
    {
      symbol: 'BTC-USDT',
      currentPrice: 43250.67,
      predictedPrice: 45800.00,
      confidence: 89.5,
      timeframe: '24h',
      direction: 'up',
      probability: 87.3
    },
    {
      symbol: 'ETH-USDT',
      currentPrice: 2567.89,
      predictedPrice: 2420.00,
      confidence: 82.1,
      timeframe: '12h',
      direction: 'down',
      probability: 78.9
    },
    {
      symbol: 'AAPL',
      currentPrice: 175.84,
      predictedPrice: 182.50,
      confidence: 91.2,
      timeframe: '48h',
      direction: 'up',
      probability: 85.7
    },
    {
      symbol: 'TSLA',
      currentPrice: 248.42,
      predictedPrice: 235.80,
      confidence: 76.8,
      timeframe: '24h',
      direction: 'down',
      probability: 72.4
    }
  ];

  return (
    <>
      <Head>
        <title>AI Predictions - NexusTradeAI</title>
        <meta name="description" content="AI-powered market predictions and trend forecasting" />
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
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">AI Predictions</span>
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
            <h1 className="text-3xl font-bold text-white mb-2">AI Market Predictions</h1>
            <p className="text-slate-400 text-lg">
              Advanced machine learning models predicting market movements with high accuracy
            </p>
          </motion.div>

          {/* Prediction Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            {predictionStats.map((stat, index) => (
              <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-blue-400" />
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

          {/* Market Predictions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Active Market Predictions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {marketPredictions.map((prediction, index) => (
                <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">{prediction.symbol}</h3>
                    <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium ${
                      prediction.direction === 'up' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {prediction.direction === 'up' ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      <span>{prediction.direction.toUpperCase()}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-slate-400 text-sm">Current Price</div>
                      <div className="text-white font-semibold">${prediction.currentPrice.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Predicted Price</div>
                      <div className={`font-semibold ${
                        prediction.direction === 'up' ? 'text-green-400' : 'text-red-400'
                      }`}>
                        ${prediction.predictedPrice.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Confidence</div>
                      <div className="text-white font-semibold">{prediction.confidence}%</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Timeframe</div>
                      <div className="text-white font-semibold">{prediction.timeframe}</div>
                    </div>
                  </div>
                  
                  <div className="w-full bg-slate-700 rounded-full h-2 mb-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${prediction.probability}%` }}
                    ></div>
                  </div>
                  <div className="text-slate-400 text-sm">Probability: {prediction.probability}%</div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* AI Prediction Dashboard Component */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <PredictionDashboard />
          </motion.div>

          {/* Quick Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
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

            <Link
              href="/ai/recommendations"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
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

export default AIPredictionsPage;
