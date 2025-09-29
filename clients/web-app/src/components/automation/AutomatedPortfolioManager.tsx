import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, TrendingUp, Shield, Settings, Play, Pause, BarChart3 } from 'lucide-react';

interface AutomatedPortfolioManagerProps {
  showSubscriptionCTA?: boolean;
}

const AutomatedPortfolioManager: React.FC<AutomatedPortfolioManagerProps> = ({
  showSubscriptionCTA = true
}) => {
  const [activePortfolio, setActivePortfolio] = useState<string>('conservative');

  const handleStartAutomation = (portfolioId: string) => {
    // Find the portfolio
    const portfolio = portfolioId === 'new'
      ? { name: 'New Custom Portfolio' }
      : portfolios.find(p => p.id === portfolioId) || { name: 'Selected Portfolio' };

    // Show success message
    alert(`Automation started for "${portfolio.name}"!

Your portfolio is now live and will begin trading according to the selected strategy.
You can monitor performance and make adjustments in the portfolio dashboard.`);

    // If this was a real app, we would update the portfolio status in the backend
    if (portfolioId !== 'new') {
      // Update the UI to show the portfolio as active
      setActivePortfolio(portfolioId);
    } else {
      // Redirect to the wizard for a new portfolio
      window.location.href = '/automation/wizard';
    }
  };

  const portfolios = [
    {
      id: 'conservative',
      name: 'Conservative Growth',
      description: 'Low-risk portfolio focused on steady returns',
      riskLevel: 'Low',
      expectedReturn: '8-12%',
      strategies: ['Mean Reversion', 'Dividend Growth', 'Bond Arbitrage'],
      allocation: { stocks: 40, bonds: 50, crypto: 10 },
      performance: { ytd: 9.2, monthly: 0.8, sharpe: 1.4 },
      isActive: true
    },
    {
      id: 'balanced',
      name: 'Balanced Portfolio',
      description: 'Moderate risk with balanced growth potential',
      riskLevel: 'Medium',
      expectedReturn: '12-18%',
      strategies: ['AI Momentum', 'Sector Rotation', 'Options Strategies'],
      allocation: { stocks: 60, bonds: 25, crypto: 15 },
      performance: { ytd: 15.7, monthly: 1.2, sharpe: 1.8 },
      isActive: false
    }
  ];

  const automationFeatures = [
    {
      icon: Bot,
      title: 'AI-Powered Rebalancing',
      description: 'Automatic portfolio rebalancing based on market conditions'
    },
    {
      icon: Shield,
      title: 'Risk Management',
      description: 'Advanced stop-loss and position sizing algorithms'
    },
    {
      icon: TrendingUp,
      title: 'Performance Optimization',
      description: 'Continuous optimization using machine learning'
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Live performance tracking and detailed reporting'
    }
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          Automated Portfolio Management
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Let our AI manage your portfolio 24/7 with advanced algorithms and risk management
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {automationFeatures.map((feature, index) => (
          <motion.div
            key={index}
            className="bg-white rounded-xl p-6 shadow-lg border border-gray-200 text-center"
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <feature.icon className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
            <p className="text-gray-600 text-sm">{feature.description}</p>
          </motion.div>
        ))}
      </div>

      <div className="mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Choose Your Portfolio Strategy</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {portfolios.map((portfolio) => (
            <motion.div
              key={portfolio.id}
              className="bg-white rounded-2xl p-6 shadow-lg border-2 cursor-pointer transition-all border-gray-200 hover:border-blue-300"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-900">{portfolio.name}</h3>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-1 rounded-full text-xs font-medium text-green-600 bg-green-100">
                    {portfolio.riskLevel} Risk
                  </span>
                  {portfolio.isActive && (
                    <div className="flex items-center text-green-600">
                      <Play className="w-4 h-4 mr-1" />
                      <span className="text-xs font-medium">Active</span>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-4">{portfolio.description}</p>

              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">Expected Annual Return</div>
                <div className="text-2xl font-bold text-green-600">{portfolio.expectedReturn}</div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600">YTD Return</div>
                  <div className="text-lg font-semibold text-green-600">{portfolio.performance.ytd}%</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Monthly</div>
                  <div className="text-lg font-semibold text-green-600">{portfolio.performance.monthly}%</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Sharpe</div>
                  <div className="text-lg font-semibold text-gray-900">{portfolio.performance.sharpe}</div>
                </div>
              </div>

              <button
                onClick={() => handleStartAutomation(portfolio.id)}
                className="w-full py-3 rounded-lg font-semibold transition-all bg-blue-500 text-white hover:bg-blue-600"
              >
                <Play className="w-4 h-4 inline mr-2" />
                Start Automation
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {showSubscriptionCTA && (
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Ready for Automated Trading?</h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Let our AI manage your portfolio 24/7 while you focus on what matters most.
          </p>
          <button
            onClick={() => handleStartAutomation('new')}
            className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all"
          >
            <Bot className="w-5 h-5 inline mr-2" />
            Start Automation
          </button>
        </div>
      )}
    </div>
  );
};

export default AutomatedPortfolioManager;