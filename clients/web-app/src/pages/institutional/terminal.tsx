// Institutional Trading Terminal - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Building2,
  ArrowLeft,
  BarChart3,
  Target,
  Shield,
  PieChart,
  Layers,
  Activity,
  DollarSign,
  Users,
  Globe,
  Zap,
  Eye,
  EyeOff,
  RefreshCw,
  Settings
} from 'lucide-react';

// Import the Institutional Trading component
import AdvancedTradingTerminal from '../../components/InstitutionalTrading/AdvancedTradingTerminal';

const InstitutionalTerminalPage: React.FC = () => {
  const [showValues, setShowValues] = useState(true);

  const institutionalFeatures = [
    {
      title: 'Advanced Terminal',
      description: 'Professional trading interface with advanced charting',
      icon: BarChart3,
      href: '/institutional/terminal',
      active: true
    },
    {
      title: 'Order Management',
      description: 'Bulk order processing and execution management',
      icon: Target,
      href: '/institutional/orders',
      active: false
    },
    {
      title: 'Multi-Asset Portfolio',
      description: 'Cross-asset portfolio management and analysis',
      icon: PieChart,
      href: '/institutional/portfolio',
      active: false
    },
    {
      title: 'Risk Dashboard',
      description: 'Real-time risk monitoring and compliance',
      icon: Shield,
      href: '/institutional/risk',
      active: false
    },
    {
      title: 'Quantum ML Interface',
      description: 'Machine learning powered trading strategies',
      icon: Layers,
      href: '/institutional/quantum',
      active: false
    }
  ];

  const institutionalStats = [
    {
      label: 'Daily Volume',
      value: '$2.5B',
      change: '+15.2%',
      positive: true,
      icon: DollarSign
    },
    {
      label: 'Active Institutions',
      value: '247',
      change: '+8',
      positive: true,
      icon: Building2
    },
    {
      label: 'Execution Speed',
      value: '0.3ms',
      change: '-0.1ms',
      positive: true,
      icon: Zap
    },
    {
      label: 'Global Markets',
      value: '45',
      change: '+3',
      positive: true,
      icon: Globe
    }
  ];

  return (
    <>
      <Head>
        <title>Institutional Trading Terminal - NexusTradeAI</title>
        <meta name="description" content="Advanced institutional trading terminal with professional tools" />
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
                  <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Institutional Terminal</span>
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
                <button className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors">
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
            <h1 className="text-3xl font-bold text-white mb-2">Institutional Trading Terminal</h1>
            <p className="text-slate-400 text-lg">
              Professional-grade trading platform designed for institutional clients and high-volume traders
            </p>
          </motion.div>

          {/* Institutional Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            {institutionalStats.map((stat, index) => (
              <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-indigo-400" />
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

          {/* Feature Navigation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Institutional Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {institutionalFeatures.map((feature, index) => (
                <Link
                  key={index}
                  href={feature.href}
                  className={`p-4 rounded-xl border transition-all ${
                    feature.active
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex flex-col items-center text-center space-y-2">
                    <feature.icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{feature.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Trading Terminal Component */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <AdvancedTradingTerminal />
          </motion.div>

          {/* Institutional Benefits */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/30 border border-indigo-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Zap className="w-8 h-8 text-indigo-400" />
                <h3 className="text-lg font-semibold text-white">Ultra-Low Latency</h3>
              </div>
              <p className="text-indigo-200 text-sm mb-4">
                Sub-millisecond execution speeds with direct market access and co-location services.
              </p>
              <div className="text-indigo-300 text-xs">
                • 0.3ms average execution time
                • Direct market connectivity
                • Co-location available
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Shield className="w-8 h-8 text-green-400" />
                <h3 className="text-lg font-semibold text-white">Enterprise Security</h3>
              </div>
              <p className="text-green-200 text-sm mb-4">
                Bank-level security with multi-factor authentication and encrypted communications.
              </p>
              <div className="text-green-300 text-xs">
                • SOC 2 Type II certified
                • End-to-end encryption
                • Regulatory compliance
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Users className="w-8 h-8 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Dedicated Support</h3>
              </div>
              <p className="text-purple-200 text-sm mb-4">
                24/7 dedicated support team with institutional trading expertise and priority response.
              </p>
              <div className="text-purple-300 text-xs">
                • Dedicated account manager
                • 24/7 technical support
                • Custom integration assistance
              </div>
            </div>
          </motion.div>

          {/* Contact Enterprise Sales */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8 bg-gradient-to-r from-indigo-900/20 to-purple-900/20 border border-indigo-500/30 rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Enterprise Solutions</h3>
                <p className="text-indigo-200 mb-4">
                  Need custom features, higher limits, or white-label solutions? Our enterprise team can help.
                </p>
              </div>
              <Link
                href="/contact/enterprise"
                className="bg-gradient-to-r from-indigo-600 to-indigo-500 text-white px-6 py-3 rounded-lg font-medium hover:from-indigo-700 hover:to-indigo-600 transition-all"
              >
                Contact Sales
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default InstitutionalTerminalPage;
