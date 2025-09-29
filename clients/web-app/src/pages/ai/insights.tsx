// AI Portfolio Insights Page - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Brain,
  ArrowLeft,
  BarChart3,
  Target,
  Activity,
  Zap,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';

// Import the AI component
import AITradingInsightsDashboard from '../../components/AI/AITradingInsightsDashboard';

const AIInsightsPage: React.FC = () => {
  const [showValues, setShowValues] = useState(true);

  return (
    <>
      <Head>
        <title>AI Portfolio Insights - NexusTradeAI</title>
        <meta name="description" content="AI-powered trading insights and portfolio analysis" />
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
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">AI Insights</span>
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
            <h1 className="text-3xl font-bold text-white mb-2">AI Portfolio Insights</h1>
            <p className="text-slate-400 text-lg">
              Advanced AI-powered analysis of your trading portfolio with predictive insights and recommendations
            </p>
          </motion.div>

          {/* AI Features Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <Brain className="w-8 h-8 text-purple-400" />
                <span className="text-purple-400 text-sm font-medium">ACTIVE</span>
              </div>
              <div className="text-white text-lg font-bold mb-1">AI Analysis</div>
              <div className="text-purple-200 text-sm">Real-time portfolio insights</div>
            </div>

            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <TrendingUp className="w-8 h-8 text-blue-400" />
                <span className="text-green-400 text-sm font-medium">+12.5%</span>
              </div>
              <div className="text-white text-lg font-bold mb-1">Predictions</div>
              <div className="text-blue-200 text-sm">Market trend forecasts</div>
            </div>

            <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <Target className="w-8 h-8 text-green-400" />
                <span className="text-green-400 text-sm font-medium">87%</span>
              </div>
              <div className="text-white text-lg font-bold mb-1">Accuracy</div>
              <div className="text-green-200 text-sm">Prediction success rate</div>
            </div>

            <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <Zap className="w-8 h-8 text-orange-400" />
                <span className="text-orange-400 text-sm font-medium">5</span>
              </div>
              <div className="text-white text-lg font-bold mb-1">Alerts</div>
              <div className="text-orange-200 text-sm">Active recommendations</div>
            </div>
          </motion.div>

          {/* AI Dashboard Component */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <AITradingInsightsDashboard />
          </motion.div>

          {/* Quick Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <Link
              href="/ai/predictions"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">Prediction Dashboard</h3>
              </div>
              <p className="text-slate-400 text-sm">Advanced market predictions and trend analysis</p>
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
              <p className="text-slate-400 text-sm">Real-time market sentiment and social indicators</p>
            </Link>

            <Link
              href="/ai/recommendations"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">AI Recommendations</h3>
              </div>
              <p className="text-slate-400 text-sm">Personalized trading recommendations and alerts</p>
            </Link>
          </motion.div>

          {/* AI Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">AI Engine Status</h3>
                <p className="text-purple-200 mb-4">
                  Our advanced AI models are continuously analyzing market data and your portfolio to provide real-time insights.
                </p>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-300">Market Analysis Active</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-300">Portfolio Monitoring</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-300">Risk Assessment</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">99.7%</div>
                <div className="text-purple-300 text-sm">Uptime</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default AIInsightsPage;
