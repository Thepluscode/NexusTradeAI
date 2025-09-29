// Main Dashboard - NexusTradeAI

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  BarChart3,
  Target,
  History,
  Settings,
  Bell,
  User,
  LogOut,
  DollarSign,
  Activity,
  Shield,
  Smartphone,
  Eye,
  EyeOff,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Brain,
  Building2,
  Crown,
  Zap,
  Bot,
  CreditCard,
  Users,
  Cog,
  TrendingDown,
  PieChart,
  LineChart,
  BarChart,
  Layers
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [showValues, setShowValues] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    // Check authentication
    const authToken = localStorage.getItem('authToken');
    const userData = localStorage.getItem('user');
    
    if (!authToken || !userData) {
      router.push('/auth/login');
      return;
    }
    
    setUser(JSON.parse(userData));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    router.push('/');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const quickActions = [
    {
      title: 'Order Entry',
      description: 'Place advanced orders with options trading',
      icon: Target,
      href: '/demo/order-entry-enhanced',
      color: 'from-blue-500 to-blue-600',
      category: 'trading'
    },
    {
      title: 'Portfolio Manager',
      description: 'Manage positions and analyze risk',
      icon: BarChart3,
      href: '/demo/position-manager-enhanced',
      color: 'from-green-500 to-green-600',
      category: 'trading'
    },
    {
      title: 'AI Insights',
      description: 'AI-powered trading insights and predictions',
      icon: Brain,
      href: '/ai/insights',
      color: 'from-purple-500 to-purple-600',
      category: 'ai'
    },
    {
      title: 'Institutional Trading',
      description: 'Advanced trading terminal for professionals',
      icon: Building2,
      href: '/institutional/terminal',
      color: 'from-indigo-500 to-indigo-600',
      category: 'institutional'
    },
    {
      title: 'Automation',
      description: 'Automated portfolio management',
      icon: Bot,
      href: '/automation/portfolio',
      color: 'from-cyan-500 to-cyan-600',
      category: 'automation'
    },
    {
      title: 'Premium Features',
      description: 'Exclusive tools for premium users',
      icon: Crown,
      href: '/premium/dashboard',
      color: 'from-yellow-500 to-yellow-600',
      category: 'premium'
    }
  ];

  const featureCategories = [
    {
      name: 'AI & Analytics',
      icon: Brain,
      color: 'from-purple-500 to-purple-600',
      features: [
        { name: 'AI Portfolio Insights', href: '/ai/insights', icon: Brain },
        { name: 'Prediction Dashboard', href: '/ai/predictions', icon: TrendingUp },
        { name: 'Sentiment Analysis', href: '/ai/sentiment', icon: Activity },
        { name: 'Recommendation Engine', href: '/ai/recommendations', icon: Zap }
      ]
    },
    {
      name: 'Institutional Trading',
      icon: Building2,
      color: 'from-indigo-500 to-indigo-600',
      features: [
        { name: 'Advanced Terminal', href: '/institutional/terminal', icon: BarChart },
        { name: 'Order Management', href: '/institutional/orders', icon: Target },
        { name: 'Multi-Asset Portfolio', href: '/institutional/portfolio', icon: PieChart },
        { name: 'Risk Dashboard', href: '/institutional/risk', icon: Shield },
        { name: 'Quantum ML Interface', href: '/institutional/quantum', icon: Layers }
      ]
    },
    {
      name: 'Automation',
      icon: Bot,
      color: 'from-cyan-500 to-cyan-600',
      features: [
        { name: 'Portfolio Templates', href: '/automation/templates', icon: Layers },
        { name: 'Auto Portfolio Manager', href: '/automation/portfolio', icon: Bot },
        { name: 'Setup Wizard', href: '/automation/wizard', icon: Cog }
      ]
    },
    {
      name: 'Premium & Admin',
      icon: Crown,
      color: 'from-yellow-500 to-yellow-600',
      features: [
        { name: 'Premium Dashboard', href: '/premium/dashboard', icon: Crown },
        { name: 'Payment Management', href: '/payment/manage', icon: CreditCard },
        { name: 'Subscription Plans', href: '/subscription/plans', icon: Users },
        { name: 'Admin Analytics', href: '/admin/analytics', icon: LineChart }
      ]
    }
  ];

  const portfolioStats = [
    {
      label: 'Portfolio Value',
      value: '$125,847.32',
      change: '+2.31%',
      positive: true,
      icon: DollarSign
    },
    {
      label: 'Daily P&L',
      value: '$2,847.65',
      change: '+5.2%',
      positive: true,
      icon: TrendingUp
    },
    {
      label: 'Total Positions',
      value: '8',
      change: '+2',
      positive: true,
      icon: Target
    },
    {
      label: 'Win Rate',
      value: '73.5%',
      change: '+1.2%',
      positive: true,
      icon: Activity
    }
  ];

  const recentTrades = [
    {
      symbol: 'BTC-USDT',
      side: 'buy',
      quantity: '0.5234',
      price: '$43,250.67',
      pnl: '+$1,247.23',
      time: '2 min ago',
      positive: true
    },
    {
      symbol: 'AAPL',
      side: 'sell',
      quantity: '100',
      price: '$175.84',
      pnl: '+$456.78',
      time: '15 min ago',
      positive: true
    },
    {
      symbol: 'ETH-USDT',
      side: 'buy',
      quantity: '2.1234',
      price: '$2,567.89',
      pnl: '-$123.45',
      time: '1 hour ago',
      positive: false
    }
  ];

  return (
    <>
      <Head>
        <title>Dashboard - NexusTradeAI</title>
        <meta name="description" content="Your professional trading dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Navigation */}
        <nav className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">NexusTradeAI</span>
              </div>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowValues(!showValues)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  {showValues ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
                
                <button className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors">
                  <Bell className="w-5 h-5" />
                </button>
                
                <div className="relative">
                  <button
                    onClick={() => setShowUserMenu(!showUserMenu)}
                    className="flex items-center space-x-2 p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                  >
                    <User className="w-5 h-5" />
                    <span className="hidden md:block">{user.name}</span>
                  </button>
                  
                  {showUserMenu && (
                    <div className="absolute right-0 mt-2 w-48 bg-slate-800 border border-slate-700 rounded-lg shadow-lg z-50">
                      <div className="p-3 border-b border-slate-700">
                        <div className="text-white font-medium">{user.name}</div>
                        <div className="text-slate-400 text-sm">{user.email}</div>
                        <div className="text-blue-400 text-xs">{user.plan} Plan</div>
                      </div>
                      <div className="p-1">
                        <Link href="/settings" className="flex items-center space-x-2 p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors">
                          <Settings className="w-4 h-4" />
                          <span>Settings</span>
                        </Link>
                        <button
                          onClick={handleLogout}
                          className="flex items-center space-x-2 p-2 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors w-full text-left"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Logout</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome back, {user.name.split(' ')[0]}!
            </h1>
            <p className="text-slate-400">
              Here's your trading overview for today. Ready to make some profitable trades?
            </p>
          </motion.div>

          {/* Portfolio Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          >
            {portfolioStats.map((stat, index) => (
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

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Quick Actions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quickActions.map((action, index) => (
                <Link
                  key={index}
                  href={action.href}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all group"
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${action.color} rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">{action.title}</h3>
                  <p className="text-slate-400 text-sm">{action.description}</p>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Feature Categories */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Advanced Features</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {featureCategories.map((category, categoryIndex) => (
                <div key={categoryIndex} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className={`w-10 h-10 bg-gradient-to-br ${category.color} rounded-lg flex items-center justify-center`}>
                      <category.icon className="w-5 h-5 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white">{category.name}</h3>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    {category.features.map((feature, featureIndex) => (
                      <Link
                        key={featureIndex}
                        href={feature.href}
                        className="flex items-center space-x-3 p-3 bg-slate-900/50 rounded-lg hover:bg-slate-700/50 transition-all group"
                      >
                        <feature.icon className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                        <span className="text-slate-300 group-hover:text-white transition-colors">{feature.name}</span>
                        <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors ml-auto" />
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            {/* Recent Trades */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Recent Trades</h3>
                <Link href="/demo/trade-history-enhanced" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
                  View All
                </Link>
              </div>
              
              <div className="space-y-4">
                {recentTrades.map((trade, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        trade.side === 'buy' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {trade.side === 'buy' ? (
                          <ArrowUpRight className="w-4 h-4 text-green-400" />
                        ) : (
                          <ArrowDownRight className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                      <div>
                        <div className="text-white font-medium">{trade.symbol}</div>
                        <div className="text-slate-400 text-sm">{trade.quantity} @ {trade.price}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-medium ${trade.positive ? 'text-green-400' : 'text-red-400'}`}>
                        {showValues ? trade.pnl : '••••••'}
                      </div>
                      <div className="text-slate-400 text-sm">{trade.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Market Overview */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Market Overview</h3>
                <button className="p-1 text-slate-400 hover:text-white transition-colors">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">BTC</span>
                    </div>
                    <div>
                      <div className="text-white font-medium">Bitcoin</div>
                      <div className="text-slate-400 text-sm">BTC-USDT</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">$43,250.67</div>
                    <div className="text-green-400 text-sm">+2.31%</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">ETH</span>
                    </div>
                    <div>
                      <div className="text-white font-medium">Ethereum</div>
                      <div className="text-slate-400 text-sm">ETH-USDT</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">$2,567.89</div>
                    <div className="text-red-400 text-sm">-1.45%</div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gray-500 rounded-lg flex items-center justify-center">
                      <span className="text-white text-xs font-bold">AAPL</span>
                    </div>
                    <div>
                      <div className="text-white font-medium">Apple Inc.</div>
                      <div className="text-slate-400 text-sm">NASDAQ</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-medium">$175.84</div>
                    <div className="text-green-400 text-sm">+0.87%</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Plan Upgrade Banner */}
          {user.plan === 'Starter' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="mt-8 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-xl p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-2">Unlock Advanced Features</h3>
                  <p className="text-blue-200 mb-4">
                    Upgrade to Professional for options trading, advanced analytics, and unlimited trades.
                  </p>
                </div>
                <Link
                  href="/auth/subscription"
                  className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:from-blue-700 hover:to-blue-600 transition-all"
                >
                  Upgrade Now
                </Link>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </>
  );
};

export default Dashboard;
