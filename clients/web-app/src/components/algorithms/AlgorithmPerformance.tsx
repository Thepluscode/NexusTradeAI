import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Award, Users, Target } from 'lucide-react';

interface AlgorithmPerformanceProps {
  showSubscriptionCTA?: boolean;
}

const AlgorithmPerformance: React.FC<AlgorithmPerformanceProps> = ({ showSubscriptionCTA = true }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const algorithms = [
    {
      id: 'ai_momentum',
      name: 'AI Momentum Pro',
      description: 'Advanced momentum strategy powered by machine learning',
      category: 'ai_ml',
      performance: {
        totalReturn: 234.7,
        annualizedReturn: 78.2,
        sharpeRatio: 2.4,
        maxDrawdown: -18.2,
        winRate: 74.3
      },
      featured: true,
      subscribers: 1247,
      minCapital: 5000
    },
    {
      id: 'mean_reversion',
      name: 'Mean Reversion Master',
      description: 'Contrarian strategy for range-bound markets',
      category: 'mean_reversion',
      performance: {
        totalReturn: 156.3,
        annualizedReturn: 52.1,
        sharpeRatio: 1.8,
        maxDrawdown: -12.5,
        winRate: 68.7
      },
      featured: false,
      subscribers: 892,
      minCapital: 2500
    }
  ];

  const categories = ['all', 'ai_ml', 'momentum', 'mean_reversion', 'arbitrage'];

  const filteredAlgorithms = selectedCategory === 'all' 
    ? algorithms 
    : algorithms.filter(alg => alg.category === selectedCategory);

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          Proven Trading Algorithms
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
          Our AI-powered trading algorithms have generated consistent profits for thousands of traders.
        </p>

        <div className="flex justify-center gap-12 mb-12">
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 rounded-lg mb-3 mx-auto">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">2,706</div>
            <div className="text-sm text-gray-600">Active Subscribers</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 rounded-lg mb-3 mx-auto">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">65.2%</div>
            <div className="text-sm text-gray-600">Average Annual Return</div>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-lg mb-3 mx-auto">
              <Award className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">87.3%</div>
            <div className="text-sm text-gray-600">Average Win Rate</div>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-4 mb-8 flex-wrap">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`px-4 py-2 rounded-full border-2 transition-all ${
              selectedCategory === category
                ? 'border-blue-500 bg-blue-500 text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-500 hover:bg-gray-50'
            }`}
          >
            {category.replace('_', ' ').toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {filteredAlgorithms.map((algorithm, index) => (
          <motion.div
            key={algorithm.id}
            className={`bg-white rounded-2xl p-6 shadow-lg border-2 transition-all hover:shadow-xl relative ${
              algorithm.featured ? 'border-blue-500' : 'border-gray-200'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            {algorithm.featured && (
              <div className="absolute top-4 right-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-3 py-1 rounded-full text-xs font-semibold">
                <Award className="w-3 h-3 inline mr-1" />
                Most Popular
              </div>
            )}
            
            <div className="mb-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{algorithm.name}</h3>
              <p className="text-gray-600 text-sm mb-4">{algorithm.description}</p>
              
              <div className="flex gap-2 mb-4">
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                  {algorithm.category.replace('_', ' ')}
                </span>
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                  Live
                </span>
                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                  {algorithm.subscribers} users
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Total Return</div>
                <div className="text-lg font-semibold text-green-600">
                  {algorithm.performance.totalReturn.toFixed(1)}%
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Annual Return</div>
                <div className="text-lg font-semibold text-green-600">
                  {algorithm.performance.annualizedReturn.toFixed(1)}%
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Sharpe Ratio</div>
                <div className="text-lg font-semibold text-gray-900">
                  {algorithm.performance.sharpeRatio.toFixed(1)}
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Win Rate</div>
                <div className="text-lg font-semibold text-green-600">
                  {algorithm.performance.winRate.toFixed(1)}%
                </div>
              </div>
            </div>

            {showSubscriptionCTA && (
              <button className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all">
                <Target className="w-4 h-4 inline mr-2" />
                Start Trading - From ${algorithm.minCapital.toLocaleString()}
              </button>
            )}
          </motion.div>
        ))}
      </div>

      {showSubscriptionCTA && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready to Start Profitable Trading?</h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of successful traders using our proven algorithms.
          </p>
          <button className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all">
            <Award className="w-5 h-5 inline mr-2" />
            Start Free Trial
          </button>
        </div>
      )}
    </div>
  );
};

export default AlgorithmPerformance;
