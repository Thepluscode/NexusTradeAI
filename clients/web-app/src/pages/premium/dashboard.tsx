// Premium Dashboard - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Crown,
  ArrowLeft,
  Star,
  Zap,
  Shield,
  Users,
  CreditCard,
  Gift,
  Award,
  Sparkles,
  Eye,
  EyeOff,
  RefreshCw,
  Settings,
  Lock,
  CheckCircle
} from 'lucide-react';

// Import the Premium components
import PremiumDashboard from '../../components/Premium/PremiumDashboard';

const PremiumDashboardPage: React.FC = () => {
  const [showValues, setShowValues] = useState(true);

  const premiumFeatures = [
    {
      title: 'Advanced Analytics',
      description: 'Deep portfolio insights with AI-powered recommendations',
      icon: Star,
      status: 'active',
      usage: '87%'
    },
    {
      title: 'Priority Execution',
      description: 'Ultra-low latency order execution with premium routing',
      icon: Zap,
      status: 'active',
      usage: '95%'
    },
    {
      title: 'Dedicated Support',
      description: '24/7 premium support with dedicated account manager',
      icon: Shield,
      status: 'active',
      usage: '100%'
    },
    {
      title: 'Exclusive Strategies',
      description: 'Access to institutional-grade trading strategies',
      icon: Crown,
      status: 'active',
      usage: '73%'
    }
  ];

  const premiumStats = [
    {
      label: 'Premium Features Used',
      value: '12/15',
      change: '+3',
      positive: true,
      icon: Star
    },
    {
      label: 'Priority Executions',
      value: '2,847',
      change: '+156',
      positive: true,
      icon: Zap
    },
    {
      label: 'Support Response',
      value: '< 2min',
      change: '-30s',
      positive: true,
      icon: Shield
    },
    {
      label: 'Exclusive Access',
      value: '100%',
      change: '0%',
      positive: true,
      icon: Crown
    }
  ];

  const exclusiveOffers = [
    {
      title: 'Institutional Strategies',
      description: 'Access to hedge fund level trading strategies',
      value: 'Unlocked',
      icon: Award,
      color: 'from-purple-500 to-purple-600'
    },
    {
      title: 'White Glove Service',
      description: 'Personal trading consultant and portfolio review',
      value: 'Active',
      icon: Users,
      color: 'from-blue-500 to-blue-600'
    },
    {
      title: 'Early Access',
      description: 'Beta features and new product previews',
      value: '5 Features',
      icon: Sparkles,
      color: 'from-green-500 to-green-600'
    }
  ];

  return (
    <>
      <Head>
        <title>Premium Dashboard - NexusTradeAI</title>
        <meta name="description" content="Exclusive premium features and advanced trading tools" />
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
                  <div className="w-8 h-8 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Premium Dashboard</span>
                  <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-2 py-1 rounded-full text-xs font-medium">
                    PREMIUM
                  </div>
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
            <div className="flex items-center space-x-3 mb-4">
              <h1 className="text-3xl font-bold text-white">Premium Dashboard</h1>
              <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center space-x-1">
                <Crown className="w-4 h-4" />
                <span>PREMIUM MEMBER</span>
              </div>
            </div>
            <p className="text-slate-400 text-lg">
              Exclusive features and advanced tools available only to premium members
            </p>
          </motion.div>

          {/* Premium Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8"
          >
            {premiumStats.map((stat, index) => (
              <div key={index} className="bg-gradient-to-br from-yellow-900/20 to-yellow-800/20 border border-yellow-500/30 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <stat.icon className="w-8 h-8 text-yellow-400" />
                  <span className={`text-sm font-medium ${stat.positive ? 'text-green-400' : 'text-red-400'}`}>
                    {stat.change}
                  </span>
                </div>
                <div className="text-2xl font-bold text-white mb-1">
                  {showValues ? stat.value : '••••••'}
                </div>
                <div className="text-yellow-200 text-sm">{stat.label}</div>
              </div>
            ))}
          </motion.div>

          {/* Premium Features Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Premium Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {premiumFeatures.map((feature, index) => (
                <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center">
                        <feature.icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                        <p className="text-slate-400 text-sm">{feature.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-5 h-5 text-green-400" />
                      <span className="text-green-400 text-sm font-medium">{feature.status}</span>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-400">Usage</span>
                      <span className="text-white">{feature.usage}</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-yellow-500 to-yellow-600 h-2 rounded-full transition-all"
                        style={{ width: feature.usage }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Exclusive Offers */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Exclusive Access</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {exclusiveOffers.map((offer, index) => (
                <div key={index} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className={`w-12 h-12 bg-gradient-to-br ${offer.color} rounded-lg flex items-center justify-center mb-4`}>
                    <offer.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{offer.title}</h3>
                  <p className="text-slate-400 text-sm mb-4">{offer.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-white font-medium">{offer.value}</span>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Premium Dashboard Component */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-8"
          >
            <PremiumDashboard />
          </motion.div>

          {/* Upgrade Benefits */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {/* Account Manager */}
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Users className="w-8 h-8 text-blue-400" />
                <h3 className="text-lg font-semibold text-white">Dedicated Account Manager</h3>
              </div>
              <p className="text-blue-200 text-sm mb-4">
                Your personal trading consultant is available 24/7 to help optimize your strategies and answer questions.
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-blue-300 text-sm">Personal consultation calls</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-blue-300 text-sm">Portfolio optimization reviews</span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-blue-300 text-sm">Priority support response</span>
                </div>
              </div>
              <button className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                Schedule Call
              </button>
            </div>

            {/* Exclusive Features */}
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-4">
                <Sparkles className="w-8 h-8 text-purple-400" />
                <h3 className="text-lg font-semibold text-white">Exclusive Features</h3>
              </div>
              <p className="text-purple-200 text-sm mb-4">
                Access to beta features, institutional strategies, and advanced analytics not available to standard users.
              </p>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-purple-300 text-sm">Beta feature access</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-purple-300 text-sm">Institutional strategies</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Star className="w-4 h-4 text-yellow-400" />
                  <span className="text-purple-300 text-sm">Advanced analytics</span>
                </div>
              </div>
              <Link
                href="/premium/features"
                className="mt-4 inline-block bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors"
              >
                Explore Features
              </Link>
            </div>
          </motion.div>

          {/* Billing Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8 bg-gradient-to-r from-slate-800/50 to-slate-700/50 border border-slate-600/50 rounded-xl p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Premium Subscription</h3>
                <p className="text-slate-400 mb-4">
                  Your premium membership includes all advanced features and priority support.
                </p>
                <div className="flex items-center space-x-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">Next billing: Dec 15, 2024</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Gift className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">$29/month</span>
                  </div>
                </div>
              </div>
              <Link
                href="/payment/manage"
                className="bg-slate-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-slate-600 transition-colors"
              >
                Manage Billing
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default PremiumDashboardPage;
