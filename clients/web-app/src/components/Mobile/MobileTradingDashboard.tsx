// Mobile-optimized Trading Dashboard

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  BarChart3,
  PieChart,
  Activity,
  Bell,
  Settings,
  Plus,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  Filter,
  ChevronRight,
  Zap,
  Shield,
  Clock,
  AlertTriangle
} from 'lucide-react';

interface MobileTradingDashboardProps {
  className?: string;
}

const MobileTradingDashboard: React.FC<MobileTradingDashboardProps> = ({ className = '' }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'orders' | 'market'>('overview');
  const [showValues, setShowValues] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Mock data - replace with real API data
  const portfolioData = {
    totalValue: 125847.32,
    dailyPnl: 2847.65,
    dailyPnlPercent: 2.31,
    availableBalance: 45230.18,
    marginUsed: 12450.00,
    positions: 8,
    openOrders: 3,
  };

  const positions = [
    {
      symbol: 'BTC-USDT',
      side: 'long',
      size: 0.5234,
      entryPrice: 41250.00,
      markPrice: 43250.67,
      pnl: 1047.23,
      pnlPercent: 5.08,
    },
    {
      symbol: 'ETH-USDT',
      side: 'short',
      size: 2.1234,
      entryPrice: 2650.00,
      markPrice: 2567.89,
      pnl: 174.32,
      pnlPercent: 3.1,
    },
  ];

  const marketData = [
    { symbol: 'BTC-USDT', price: 43250.67, change: 2.31, volume: '2.4B' },
    { symbol: 'ETH-USDT', price: 2567.89, change: -1.45, volume: '1.8B' },
    { symbol: 'ADA-USDT', price: 0.4521, change: 5.67, volume: '456M' },
  ];

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 ${className}`}>
      {/* Header */}
      <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 p-4 z-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Portfolio</h1>
            <p className="text-slate-400 text-sm">Welcome back, Trader</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowValues(!showValues)}
              className="p-2 text-slate-400 hover:text-white rounded-lg"
            >
              {showValues ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
            <button
              onClick={handleRefresh}
              className="p-2 text-slate-400 hover:text-white rounded-lg"
            >
              <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button className="p-2 text-slate-400 hover:text-white rounded-lg">
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Portfolio Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <DollarSign className="w-4 h-4 text-blue-400" />
              <span className={`text-xs font-medium ${portfolioData.dailyPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {portfolioData.dailyPnlPercent >= 0 ? '+' : ''}{portfolioData.dailyPnlPercent.toFixed(2)}%
              </span>
            </div>
            <div className="text-white text-lg font-bold">
              {showValues ? formatCurrency(portfolioData.totalValue) : '••••••'}
            </div>
            <div className="text-slate-400 text-xs">Total Value</div>
          </div>

          <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-1">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-green-400 text-xs font-medium">24h</span>
            </div>
            <div className={`text-lg font-bold ${portfolioData.dailyPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {showValues ? formatCurrency(portfolioData.dailyPnl) : '••••••'}
            </div>
            <div className="text-slate-400 text-xs">Daily P&L</div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mt-4 bg-slate-800/50 rounded-xl p-1">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'positions', label: 'Positions', icon: Target },
            { id: 'orders', label: 'Orders', icon: Clock },
            { id: 'market', label: 'Market', icon: Activity },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center space-x-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <AnimatePresence mode="wait">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-4"
            >
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400 text-xs mb-1">Available Balance</div>
                  <div className="text-white font-semibold">
                    {showValues ? formatCurrency(portfolioData.availableBalance) : '••••••'}
                  </div>
                </div>
                <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                  <div className="text-slate-400 text-xs mb-1">Margin Used</div>
                  <div className="text-white font-semibold">
                    {showValues ? formatCurrency(portfolioData.marginUsed) : '••••••'}
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button className="flex items-center justify-center space-x-2 p-3 bg-green-600 rounded-lg text-white font-medium">
                    <Plus className="w-4 h-4" />
                    <span>Buy</span>
                  </button>
                  <button className="flex items-center justify-center space-x-2 p-3 bg-red-600 rounded-lg text-white font-medium">
                    <Plus className="w-4 h-4" />
                    <span>Sell</span>
                  </button>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <h3 className="text-white font-semibold mb-3">Recent Activity</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-white text-sm font-medium">BTC Buy Order</div>
                        <div className="text-slate-400 text-xs">2 minutes ago</div>
                      </div>
                    </div>
                    <div className="text-green-400 text-sm font-medium">+$1,247</div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                        <TrendingDown className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="text-white text-sm font-medium">ETH Sell Order</div>
                        <div className="text-slate-400 text-xs">15 minutes ago</div>
                      </div>
                    </div>
                    <div className="text-red-400 text-sm font-medium">-$856</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Positions Tab */}
          {activeTab === 'positions' && (
            <motion.div
              key="positions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-3"
            >
              {positions.map((position, index) => (
                <div key={position.symbol} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-xs">{position.symbol.slice(0, 2)}</span>
                      </div>
                      <div>
                        <div className="text-white font-semibold">{position.symbol}</div>
                        <div className={`text-xs px-2 py-1 rounded-full ${
                          position.side === 'long' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {position.side.toUpperCase()}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-slate-400 text-xs">Size</div>
                      <div className="text-white font-medium">{position.size}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Mark Price</div>
                      <div className="text-white font-medium">${position.markPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">Entry Price</div>
                      <div className="text-white font-medium">${position.entryPrice.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 text-xs">P&L</div>
                      <div className={`font-medium ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {showValues ? `$${position.pnl.toFixed(2)}` : '••••••'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Market Tab */}
          {activeTab === 'market' && (
            <motion.div
              key="market"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-3"
            >
              <div className="flex items-center space-x-2 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search markets..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-400 focus:border-blue-500"
                  />
                </div>
                <button className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400">
                  <Filter className="w-4 h-4" />
                </button>
              </div>

              {marketData.map((market) => (
                <div key={market.symbol} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-xs">{market.symbol.slice(0, 2)}</span>
                      </div>
                      <div>
                        <div className="text-white font-semibold">{market.symbol}</div>
                        <div className="text-slate-400 text-xs">Vol: {market.volume}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-semibold">${market.price.toFixed(2)}</div>
                      <div className={`text-xs font-medium ${
                        market.change >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Action Button */}
      <button className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-600 to-blue-500 rounded-full shadow-lg flex items-center justify-center text-white z-20">
        <Plus className="w-6 h-6" />
      </button>
    </div>
  );
};

export default MobileTradingDashboard;
