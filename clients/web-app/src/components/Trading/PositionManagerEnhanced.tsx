'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  AlertCircle,
  Brain,
  Settings,
  BarChart3,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  ArrowUpRight,
  Globe,
  PieChart,
  Calculator,
  History,
  Link,
  Layers,
  Calendar,
  Clock,
  Percent,
  Activity,
  Award,
  Briefcase,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Pause,
  Play,
  Edit,
  Trash2
} from 'lucide-react';

interface PositionManagerEnhancedProps {
  className?: string;
}

interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  realizedPnl: number;
  margin: number;
  leverage: number;
  liquidationPrice?: number;
  timestamp: number;
  // Enhanced fields
  stopLoss?: number;
  takeProfit?: number;
  trailingStop?: number;
  riskReward?: number;
  maxDrawdown: number;
  holdingPeriod: number;
  fees: number;
  fundingFees: number;
  assetType: 'crypto' | 'forex' | 'stocks' | 'options';
  strategy?: string;
  notes?: string;
}

interface PositionAnalytics {
  totalPositions: number;
  totalValue: number;
  totalPnl: number;
  totalMargin: number;
  avgLeverage: number;
  riskExposure: number;
  diversificationScore: number;
  correlationRisk: number;
}

interface RiskMetrics {
  portfolioVaR: number;
  positionVaR: number;
  marginUtilization: number;
  liquidationRisk: 'low' | 'medium' | 'high' | 'critical';
  concentrationRisk: number;
}

const PositionManagerEnhanced: React.FC<PositionManagerEnhancedProps> = ({ className = '' }) => {
  // Enhanced state management
  const [activeView, setActiveView] = useState<'positions' | 'analytics' | 'risk' | 'history'>('positions');
  const [showPnlValues, setShowPnlValues] = useState(true);
  const [sortBy, setSortBy] = useState<'symbol' | 'pnl' | 'size' | 'risk'>('pnl');
  const [filterBy, setFilterBy] = useState<'all' | 'profitable' | 'losing' | 'high-risk'>('all');
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);

  // Enhanced mock positions data
  const mockPositions: Position[] = [
    {
      symbol: 'BTC-USDT',
      side: 'long',
      size: 0.5234,
      entryPrice: 41250.00,
      markPrice: 43250.67,
      unrealizedPnl: 1047.23,
      realizedPnl: 0,
      margin: 2156.25,
      leverage: 10,
      liquidationPrice: 37125.00,
      timestamp: Date.now() - 3600000,
      stopLoss: 39000.00,
      takeProfit: 45000.00,
      trailingStop: 2000.00,
      riskReward: 1.85,
      maxDrawdown: -156.78,
      holdingPeriod: 3600000,
      fees: 12.45,
      fundingFees: -8.23,
      assetType: 'crypto',
      strategy: 'Breakout',
      notes: 'Strong momentum play'
    },
    {
      symbol: 'ETH-USDT',
      side: 'short',
      size: 2.1234,
      entryPrice: 2650.00,
      markPrice: 2567.89,
      unrealizedPnl: 174.32,
      realizedPnl: 0,
      margin: 562.45,
      leverage: 5,
      liquidationPrice: 2915.00,
      timestamp: Date.now() - 7200000,
      stopLoss: 2750.00,
      takeProfit: 2450.00,
      riskReward: 2.1,
      maxDrawdown: -45.67,
      holdingPeriod: 7200000,
      fees: 5.67,
      fundingFees: 3.21,
      assetType: 'crypto',
      strategy: 'Mean Reversion',
      notes: 'Overbought condition'
    },
    {
      symbol: 'AAPL',
      side: 'long',
      size: 100,
      entryPrice: 175.50,
      markPrice: 178.25,
      unrealizedPnl: 275.00,
      realizedPnl: 0,
      margin: 3510.00,
      leverage: 5,
      timestamp: Date.now() - 14400000,
      riskReward: 1.5,
      maxDrawdown: -125.50,
      holdingPeriod: 14400000,
      fees: 8.75,
      fundingFees: 0,
      assetType: 'stocks',
      strategy: 'Earnings Play',
      notes: 'Pre-earnings momentum'
    }
  ];

  // Calculate portfolio analytics
  const portfolioAnalytics: PositionAnalytics = {
    totalPositions: mockPositions.length,
    totalValue: mockPositions.reduce((sum, pos) => sum + (pos.size * pos.markPrice), 0),
    totalPnl: mockPositions.reduce((sum, pos) => sum + pos.unrealizedPnl, 0),
    totalMargin: mockPositions.reduce((sum, pos) => sum + pos.margin, 0),
    avgLeverage: mockPositions.length > 0 ? mockPositions.reduce((sum, pos) => sum + pos.leverage, 0) / mockPositions.length : 0,
    riskExposure: mockPositions.reduce((sum, pos) => sum + (pos.size * pos.markPrice * pos.leverage), 0),
    diversificationScore: Math.min(100, (new Set(mockPositions.map(p => p.symbol)).size / mockPositions.length) * 100),
    correlationRisk: 65 // Mock correlation risk score
  };

  // Calculate risk metrics
  const riskMetrics: RiskMetrics = {
    portfolioVaR: portfolioAnalytics.totalValue * 0.023, // 2.3% VaR
    positionVaR: Math.max(...mockPositions.map(p => (p.size * p.markPrice) * 0.05)),
    marginUtilization: (portfolioAnalytics.totalMargin / (portfolioAnalytics.totalValue * 0.1)) * 100,
    liquidationRisk: portfolioAnalytics.avgLeverage > 15 ? 'critical' : portfolioAnalytics.avgLeverage > 10 ? 'high' : portfolioAnalytics.avgLeverage > 5 ? 'medium' : 'low',
    concentrationRisk: Math.max(...mockPositions.map(p => (p.size * p.markPrice) / portfolioAnalytics.totalValue)) * 100
  };

  // Filter and sort positions
  const filteredPositions = mockPositions.filter(position => {
    switch (filterBy) {
      case 'profitable': return position.unrealizedPnl > 0;
      case 'losing': return position.unrealizedPnl < 0;
      case 'high-risk': return position.leverage > 10;
      default: return true;
    }
  }).sort((a, b) => {
    switch (sortBy) {
      case 'symbol': return a.symbol.localeCompare(b.symbol);
      case 'pnl': return b.unrealizedPnl - a.unrealizedPnl;
      case 'size': return (b.size * b.markPrice) - (a.size * a.markPrice);
      case 'risk': return b.leverage - a.leverage;
      default: return 0;
    }
  });

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatNumber = (value: number): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    }
    if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return value.toFixed(2);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl ${className}`}
    >
      {/* Enhanced Header */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Position Manager
              </h2>
              <p className="text-slate-400">
                Advanced portfolio management and risk analysis
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowPnlValues(!showPnlValues)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
            >
              {showPnlValues ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all">
              <Shield className="h-5 w-5" />
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Enhanced Navigation Tabs */}
        <div className="flex space-x-1">
          {[
            { id: 'positions', label: 'Positions', icon: Target },
            { id: 'analytics', label: 'Analytics', icon: PieChart },
            { id: 'risk', label: 'Risk Management', icon: Shield },
            { id: 'history', label: 'History', icon: History }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                activeView === tab.id
                  ? 'bg-slate-700/50 text-white border border-slate-600/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-5 h-5 text-green-400" />
              <span className={`text-sm font-bold ${portfolioAnalytics.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {showPnlValues ? formatCurrency(portfolioAnalytics.totalPnl) : '••••••'}
              </span>
            </div>
            <div className="text-white text-lg font-bold">{portfolioAnalytics.totalPositions}</div>
            <div className="text-slate-400 text-xs">Total Positions</div>
          </div>

          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Calculator className="w-5 h-5 text-blue-400" />
              <span className="text-blue-400 text-sm font-medium">{portfolioAnalytics.avgLeverage.toFixed(1)}x</span>
            </div>
            <div className="text-white text-lg font-bold">
              {showPnlValues ? formatCurrency(portfolioAnalytics.totalValue) : '••••••'}
            </div>
            <div className="text-slate-400 text-xs">Portfolio Value</div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              <span className="text-purple-400 text-sm font-medium">{riskMetrics.marginUtilization.toFixed(1)}%</span>
            </div>
            <div className="text-white text-lg font-bold">
              {showPnlValues ? formatCurrency(portfolioAnalytics.totalMargin) : '••••••'}
            </div>
            <div className="text-slate-400 text-xs">Total Margin</div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Shield className="w-5 h-5 text-orange-400" />
              <span className={`text-sm font-medium ${
                riskMetrics.liquidationRisk === 'low' ? 'text-green-400' :
                riskMetrics.liquidationRisk === 'medium' ? 'text-yellow-400' :
                riskMetrics.liquidationRisk === 'high' ? 'text-orange-400' : 'text-red-400'
              }`}>
                {riskMetrics.liquidationRisk.toUpperCase()}
              </span>
            </div>
            <div className="text-white text-lg font-bold">{portfolioAnalytics.diversificationScore.toFixed(0)}%</div>
            <div className="text-slate-400 text-xs">Diversification</div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Positions Tab */}
        {activeView === 'positions' && (
          <div className="space-y-6">
            {/* Filters and Sorting */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-slate-400">Filter:</span>
                  <select
                    value={filterBy}
                    onChange={(e) => setFilterBy(e.target.value as any)}
                    className="bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-1 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="all">All Positions</option>
                    <option value="profitable">Profitable</option>
                    <option value="losing">Losing</option>
                    <option value="high-risk">High Risk</option>
                  </select>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-slate-400">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-1 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="pnl">P&L</option>
                    <option value="symbol">Symbol</option>
                    <option value="size">Size</option>
                    <option value="risk">Risk</option>
                  </select>
                </div>
              </div>
              <div className="text-sm text-slate-400">
                Showing {filteredPositions.length} of {mockPositions.length} positions
              </div>
            </div>

            {/* Positions Table */}
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700/50 bg-slate-800/50">
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">Symbol</th>
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">Side</th>
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">Size</th>
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">Entry Price</th>
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">Mark Price</th>
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">P&L</th>
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">Risk</th>
                      <th className="text-left py-4 px-6 text-slate-400 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPositions.map((position, index) => (
                      <motion.tr
                        key={position.symbol}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-all"
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                              <span className="text-white text-sm font-bold">{position.symbol.slice(0, 2)}</span>
                            </div>
                            <div>
                              <div className="text-white font-medium">{position.symbol}</div>
                              <div className="text-slate-400 text-xs">{position.assetType.toUpperCase()}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            position.side === 'long'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {position.side.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="text-white font-medium">{formatNumber(position.size)}</div>
                          <div className="text-slate-400 text-xs">{formatCurrency(position.size * position.markPrice)}</div>
                        </td>
                        <td className="py-4 px-6 text-white font-medium">{formatCurrency(position.entryPrice)}</td>
                        <td className="py-4 px-6 text-white font-medium">{formatCurrency(position.markPrice)}</td>
                        <td className="py-4 px-6">
                          <div className={`font-bold ${position.unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {showPnlValues ? formatCurrency(position.unrealizedPnl) : '••••••'}
                          </div>
                          <div className="text-slate-400 text-xs">
                            {((position.unrealizedPnl / (position.size * position.entryPrice)) * 100).toFixed(2)}%
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <span className="text-white font-medium">{position.leverage}x</span>
                            <div className={`w-2 h-2 rounded-full ${
                              position.leverage > 15 ? 'bg-red-500' :
                              position.leverage > 10 ? 'bg-orange-500' :
                              position.leverage > 5 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}></div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center space-x-2">
                            <button className="p-1 text-slate-400 hover:text-blue-400 transition-colors">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button className="p-1 text-slate-400 hover:text-red-400 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeView === 'analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <TrendingUp className="w-8 h-8 text-green-400" />
                  <span className="text-green-400 text-sm font-medium">+{((portfolioAnalytics.totalPnl / portfolioAnalytics.totalValue) * 100).toFixed(2)}%</span>
                </div>
                <div className="text-white text-2xl font-bold mb-1">{formatCurrency(portfolioAnalytics.totalPnl)}</div>
                <div className="text-slate-400 text-sm">Total P&L</div>
              </div>

              <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <BarChart3 className="w-8 h-8 text-blue-400" />
                  <span className="text-blue-400 text-sm font-medium">{portfolioAnalytics.avgLeverage.toFixed(1)}x</span>
                </div>
                <div className="text-white text-2xl font-bold mb-1">{formatCurrency(portfolioAnalytics.riskExposure)}</div>
                <div className="text-slate-400 text-sm">Risk Exposure</div>
              </div>

              <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <PieChart className="w-8 h-8 text-purple-400" />
                  <span className="text-purple-400 text-sm font-medium">{portfolioAnalytics.diversificationScore.toFixed(0)}%</span>
                </div>
                <div className="text-white text-2xl font-bold mb-1">{portfolioAnalytics.correlationRisk}%</div>
                <div className="text-slate-400 text-sm">Correlation Risk</div>
              </div>
            </div>
          </div>
        )}

        {/* Risk Management Tab */}
        {activeView === 'risk' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-red-900/30 to-red-800/30 border border-red-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-6">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                <h3 className="text-xl font-bold text-white">Risk Assessment</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Portfolio VaR (1D)</span>
                    <span className="text-white font-medium">{formatCurrency(riskMetrics.portfolioVaR)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Margin Utilization</span>
                    <span className="text-white font-medium">{riskMetrics.marginUtilization.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Concentration Risk</span>
                    <span className="text-white font-medium">{riskMetrics.concentrationRisk.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Liquidation Risk</span>
                    <span className={`font-medium ${
                      riskMetrics.liquidationRisk === 'low' ? 'text-green-400' :
                      riskMetrics.liquidationRisk === 'medium' ? 'text-yellow-400' :
                      riskMetrics.liquidationRisk === 'high' ? 'text-orange-400' : 'text-red-400'
                    }`}>
                      {riskMetrics.liquidationRisk.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Position VaR</span>
                    <span className="text-white font-medium">{formatCurrency(riskMetrics.positionVaR)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Avg Leverage</span>
                    <span className="text-white font-medium">{portfolioAnalytics.avgLeverage.toFixed(1)}x</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeView === 'history' && (
          <div className="space-y-6">
            <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Position History</h3>
              <div className="text-slate-400 text-center py-8">
                Position history feature coming soon...
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default PositionManagerEnhanced;
