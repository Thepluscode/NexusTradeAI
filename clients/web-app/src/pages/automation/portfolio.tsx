// Automated Portfolio Management - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Bot,
  ArrowLeft,
  Layers,
  Cog,
  Activity,
  Target,
  Shield,
  Zap,
  Play,
  Pause,
  Settings,
  Eye,
  EyeOff,
  RefreshCw,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

// Import the Automation components
import AutomatedPortfolioManager from '../../components/automation/AutomatedPortfolioManager';
import AIPortfolioTemplates from '../../components/automation/AIPortfolioTemplates';
import { ToastContainer, useToast } from '../../components/Common/Toast';

const AutomationPortfolioPage: React.FC = () => {
  const [showValues, setShowValues] = useState(true);
  const [automationEnabled, setAutomationEnabled] = useState(true);
  const { toasts, success, error, warning, info, removeToast } = useToast();
  const [strategies, setStrategies] = useState([
    {
      id: 'conservative-growth',
      name: 'Conservative Growth',
      status: 'active',
      performance: '+12.5%',
      risk: 'Low',
      allocation: '35%',
      lastRebalance: '2 hours ago'
    },
    {
      id: 'momentum-trading',
      name: 'Momentum Trading',
      status: 'active',
      performance: '+8.7%',
      risk: 'Medium',
      allocation: '25%',
      lastRebalance: '1 day ago'
    },
    {
      id: 'dividend-focus',
      name: 'Dividend Focus',
      status: 'paused',
      performance: '+5.2%',
      risk: 'Low',
      allocation: '20%',
      lastRebalance: '3 days ago'
    },
    {
      id: 'crypto-arbitrage',
      name: 'Crypto Arbitrage',
      status: 'active',
      performance: '+15.3%',
      risk: 'High',
      allocation: '20%',
      lastRebalance: '30 min ago'
    }
  ]);

  const automationStats = [
    {
      label: 'Active Strategies',
      value: '12',
      change: '+3',
      positive: true,
      icon: Bot
    },
    {
      label: 'Automation Uptime',
      value: '99.8%',
      change: '+0.1%',
      positive: true,
      icon: Activity
    },
    {
      label: 'Auto Rebalances',
      value: '847',
      change: '+23',
      positive: true,
      icon: Target
    },
    {
      label: 'Risk Score',
      value: '7.2/10',
      change: '-0.3',
      positive: true,
      icon: Shield
    }
  ];

  // Handler functions for strategy actions
  const handleConfigureStrategy = (strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy) {
      info(
        'Configuration Panel',
        `Opening configuration for "${strategy.name}". You can adjust risk parameters, allocation percentages, rebalancing frequency, and more.`,
        {
          duration: 6000,
          action: {
            label: 'Open Settings',
            onClick: () => {
              // In a real app, this would open a configuration modal or navigate to a config page
              success('Settings Opened', `Configuration panel for ${strategy.name} is now open.`);
            }
          }
        }
      );
    }
  };

  const handleToggleStrategy = (strategyId: string) => {
    setStrategies(prevStrategies =>
      prevStrategies.map(strategy => {
        if (strategy.id === strategyId) {
          const newStatus = strategy.status === 'active' ? 'paused' : 'active';

          // Show confirmation message
          setTimeout(() => {
            if (newStatus === 'active') {
              success(
                'Strategy Resumed',
                `"${strategy.name}" is now active and will resume trading according to its configuration.`,
                { duration: 4000 }
              );
            } else {
              warning(
                'Strategy Paused',
                `"${strategy.name}" has been paused. All active trades will be closed and no new trades will be initiated.`,
                { duration: 4000 }
              );
            }
          }, 100);

          return { ...strategy, status: newStatus };
        }
        return strategy;
      })
    );
  };

  const handleRefreshData = () => {
    info(
      'Refreshing Data',
      'Fetching the latest portfolio performance, strategy status, market data, and rebalancing history.',
      {
        duration: 3000,
        action: {
          label: 'View Details',
          onClick: () => {
            success('Data Updated', 'All portfolio data has been refreshed successfully.');
          }
        }
      }
    );
    // In a real app, this would trigger a data refresh from the API
  };

  const handleOpenSettings = () => {
    info(
      'Portfolio Settings',
      'Opening automation settings where you can configure preferences, notifications, risk management, and API connections.',
      {
        duration: 5000,
        action: {
          label: 'Open Settings',
          onClick: () => {
            success('Settings Panel', 'Portfolio automation settings panel is now open.');
          }
        }
      }
    );
    // In a real app, this would open a settings modal or navigate to settings page
  };

  return (
    <>
      <Head>
        <title>Automated Portfolio Management - NexusTradeAI</title>
        <meta name="description" content="AI-powered automated portfolio management and rebalancing" />
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
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Portfolio Automation</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setAutomationEnabled(!automationEnabled)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg font-medium transition-all ${
                    automationEnabled
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {automationEnabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  <span>{automationEnabled ? 'Active' : 'Paused'}</span>
                </button>
                <button
                  onClick={() => setShowValues(!showValues)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  {showValues ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
                <button
                  onClick={handleRefreshData}
                  className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                  title="Refresh Data"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
                <button
                  onClick={handleOpenSettings}
                  className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
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
            <h1 className="text-3xl font-bold text-white mb-2">Automated Portfolio Management</h1>
            <p className="text-slate-400 text-lg">
              AI-powered portfolio automation with intelligent rebalancing and strategy execution
            </p>
          </motion.div>

          {/* Automation Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            {automationStats.map((stat, index) => (
              <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-cyan-400" />
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

          {/* Active Strategies */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Active Strategies</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {strategies.map((strategy, index) => (
                <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">{strategy.name}</h3>
                    <div className={`flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-medium ${
                      strategy.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {strategy.status === 'active' ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      <span className="capitalize">{strategy.status}</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-slate-400 text-sm">Performance</div>
                      <div className="text-green-400 font-semibold">{strategy.performance}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Risk Level</div>
                      <div className="text-white font-semibold">{strategy.risk}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Allocation</div>
                      <div className="text-white font-semibold">{strategy.allocation}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-sm">Last Rebalance</div>
                      <div className="text-slate-300 text-sm">{strategy.lastRebalance}</div>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleConfigureStrategy(strategy.id)}
                      className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      Configure
                    </button>
                    <button
                      onClick={() => handleToggleStrategy(strategy.id)}
                      className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                        strategy.status === 'active'
                          ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                          : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {strategy.status === 'active' ? 'Pause' : 'Resume'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Main Components */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Automated Portfolio Manager */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <h2 className="text-xl font-bold text-white mb-6">Portfolio Manager</h2>
              <AutomatedPortfolioManager />
            </motion.div>

            {/* AI Portfolio Templates */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <h2 className="text-xl font-bold text-white mb-6">AI Templates</h2>
              <AIPortfolioTemplates />
            </motion.div>
          </div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <Link
              href="/automation/templates"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center">
                  <Layers className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">Portfolio Templates</h3>
              </div>
              <p className="text-slate-400 text-sm">Pre-built AI strategies for different risk profiles</p>
            </Link>

            <Link
              href="/automation/wizard"
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <Cog className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white">Setup Wizard</h3>
              </div>
              <p className="text-slate-400 text-sm">Guided setup for automated trading strategies</p>
            </Link>

            <div className="bg-gradient-to-br from-cyan-900/30 to-cyan-800/30 border border-cyan-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Zap className="w-10 h-10 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">Performance</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Total Return</span>
                  <span className="text-green-400 font-semibold">+24.7%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Sharpe Ratio</span>
                  <span className="text-white font-semibold">1.85</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 text-sm">Max Drawdown</span>
                  <span className="text-red-400 font-semibold">-3.2%</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
};

export default AutomationPortfolioPage;
