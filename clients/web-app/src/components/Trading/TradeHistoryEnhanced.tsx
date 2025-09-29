'use client';

import React, { useState, useMemo } from 'react';
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
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal
} from 'lucide-react';

interface TradeHistoryEnhancedProps {
  className?: string;
  symbol?: string;
  compact?: boolean;
}

interface Trade {
  id: string;
  orderId: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price: number;
  value: number;
  fee: number;
  feeAsset: string;
  timestamp: number;
  status: 'filled' | 'partial' | 'cancelled';
  venue?: string;
  liquidity?: 'maker' | 'taker';
  // Enhanced fields
  pnl?: number;
  strategy?: string;
  notes?: string;
  executionTime?: number;
  slippage?: number;
  commission?: number;
  assetType: 'crypto' | 'forex' | 'stocks' | 'options';
}

interface TradeFilters {
  symbol: string;
  side: 'all' | 'buy' | 'sell';
  dateRange: 'all' | '1d' | '7d' | '30d' | '90d';
  status: 'all' | 'filled' | 'partial' | 'cancelled';
  assetType: 'all' | 'crypto' | 'forex' | 'stocks' | 'options';
  strategy: 'all' | 'scalping' | 'swing' | 'breakout' | 'mean-reversion';
}

interface TradeAnalytics {
  totalTrades: number;
  totalVolume: number;
  totalPnl: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  avgHoldTime: number;
  totalFees: number;
}

const TradeHistoryEnhanced: React.FC<TradeHistoryEnhancedProps> = ({
  className = '',
  symbol,
  compact = false
}) => {
  const [filters, setFilters] = useState<TradeFilters>({
    symbol: symbol || 'all',
    side: 'all',
    dateRange: '30d',
    status: 'all',
    assetType: 'all',
    strategy: 'all'
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(compact ? 5 : 10);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showValues, setShowValues] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<string | null>(null);

  // Enhanced mock trade data
  const mockTrades: Trade[] = [
    {
      id: '1',
      orderId: 'ORD-001',
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'limit',
      quantity: 0.5,
      price: 42500.00,
      value: 21250.00,
      fee: 21.25,
      feeAsset: 'USDT',
      timestamp: Date.now() - 3600000,
      status: 'filled',
      venue: 'Binance',
      liquidity: 'maker',
      pnl: 1250.75,
      strategy: 'breakout',
      notes: 'Strong momentum breakout',
      executionTime: 150,
      slippage: 0.02,
      commission: 0.1,
      assetType: 'crypto'
    },
    {
      id: '2',
      orderId: 'ORD-002',
      symbol: 'ETH-USDT',
      side: 'sell',
      type: 'market',
      quantity: 5.0,
      price: 2650.00,
      value: 13250.00,
      fee: 13.25,
      feeAsset: 'USDT',
      timestamp: Date.now() - 7200000,
      status: 'filled',
      venue: 'Coinbase',
      liquidity: 'taker',
      pnl: -325.50,
      strategy: 'mean-reversion',
      notes: 'Stop loss triggered',
      executionTime: 50,
      slippage: 0.15,
      commission: 0.1,
      assetType: 'crypto'
    },
    {
      id: '3',
      orderId: 'ORD-003',
      symbol: 'AAPL',
      side: 'buy',
      type: 'limit',
      quantity: 100,
      price: 175.50,
      value: 17550.00,
      fee: 8.75,
      feeAsset: 'USD',
      timestamp: Date.now() - 14400000,
      status: 'filled',
      venue: 'NASDAQ',
      liquidity: 'maker',
      pnl: 450.25,
      strategy: 'swing',
      notes: 'Earnings play',
      executionTime: 200,
      slippage: 0.01,
      commission: 0.05,
      assetType: 'stocks'
    },
    {
      id: '4',
      orderId: 'ORD-004',
      symbol: 'EUR/USD',
      side: 'sell',
      type: 'stop',
      quantity: 10000,
      price: 1.0850,
      value: 10850.00,
      fee: 5.43,
      feeAsset: 'USD',
      timestamp: Date.now() - 21600000,
      status: 'filled',
      venue: 'FXCM',
      liquidity: 'taker',
      pnl: 125.75,
      strategy: 'scalping',
      notes: 'Quick scalp trade',
      executionTime: 25,
      slippage: 0.0001,
      commission: 0.05,
      assetType: 'forex'
    },
    {
      id: '5',
      orderId: 'ORD-005',
      symbol: 'TSLA',
      side: 'buy',
      type: 'market',
      quantity: 50,
      price: 248.75,
      value: 12437.50,
      fee: 6.22,
      feeAsset: 'USD',
      timestamp: Date.now() - 28800000,
      status: 'partial',
      venue: 'NASDAQ',
      liquidity: 'taker',
      pnl: -187.25,
      strategy: 'breakout',
      notes: 'Partial fill only',
      executionTime: 300,
      slippage: 0.08,
      commission: 0.05,
      assetType: 'stocks'
    }
  ];

  // Filter trades based on current filters
  const filteredTrades = useMemo(() => {
    return mockTrades.filter(trade => {
      const matchesSymbol = filters.symbol === 'all' || trade.symbol.includes(filters.symbol.toUpperCase());
      const matchesSide = filters.side === 'all' || trade.side === filters.side;
      const matchesStatus = filters.status === 'all' || trade.status === filters.status;
      const matchesAssetType = filters.assetType === 'all' || trade.assetType === filters.assetType;
      const matchesStrategy = filters.strategy === 'all' || trade.strategy === filters.strategy;
      const matchesSearch = searchTerm === '' || 
        trade.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trade.orderId.toLowerCase().includes(searchTerm.toLowerCase());

      // Date range filter
      const now = Date.now();
      const tradeAge = now - trade.timestamp;
      let matchesDate = true;
      
      switch (filters.dateRange) {
        case '1d':
          matchesDate = tradeAge <= 24 * 60 * 60 * 1000;
          break;
        case '7d':
          matchesDate = tradeAge <= 7 * 24 * 60 * 60 * 1000;
          break;
        case '30d':
          matchesDate = tradeAge <= 30 * 24 * 60 * 60 * 1000;
          break;
        case '90d':
          matchesDate = tradeAge <= 90 * 24 * 60 * 60 * 1000;
          break;
      }

      return matchesSymbol && matchesSide && matchesStatus && matchesAssetType && 
             matchesStrategy && matchesSearch && matchesDate;
    });
  }, [mockTrades, filters, searchTerm]);

  // Calculate analytics
  const analytics: TradeAnalytics = useMemo(() => {
    const filledTrades = filteredTrades.filter(t => t.status === 'filled');
    const winningTrades = filledTrades.filter(t => (t.pnl || 0) > 0);
    const losingTrades = filledTrades.filter(t => (t.pnl || 0) < 0);
    
    return {
      totalTrades: filteredTrades.length,
      totalVolume: filteredTrades.reduce((sum, t) => sum + t.value, 0),
      totalPnl: filteredTrades.reduce((sum, t) => sum + (t.pnl || 0), 0),
      winRate: filledTrades.length > 0 ? (winningTrades.length / filledTrades.length) * 100 : 0,
      avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length : 0,
      profitFactor: 0, // Will calculate below
      largestWin: Math.max(...filledTrades.map(t => t.pnl || 0)),
      largestLoss: Math.min(...filledTrades.map(t => t.pnl || 0)),
      avgHoldTime: 3600000, // Mock average hold time
      totalFees: filteredTrades.reduce((sum, t) => sum + t.fee, 0)
    };
  }, [filteredTrades]);

  // Calculate profit factor
  analytics.profitFactor = analytics.avgLoss !== 0 ? Math.abs(analytics.avgWin / analytics.avgLoss) : 0;

  // Pagination
  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedTrades = filteredTrades.slice(startIndex, startIndex + itemsPerPage);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl ${className}`}
    >
      {/* Header */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl">
              <History className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                Trade History
              </h2>
              <p className="text-slate-400">
                Comprehensive trading analytics and performance tracking
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowValues(!showValues)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
            >
              {showValues ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
            >
              <Filter className="h-5 w-5" />
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all">
              <Download className="h-5 w-5" />
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all">
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Analytics Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Award className="w-5 h-5 text-green-400" />
              <span className="text-green-400 text-sm font-medium">{analytics.winRate.toFixed(1)}%</span>
            </div>
            <div className="text-white text-lg font-bold">{analytics.totalTrades}</div>
            <div className="text-slate-400 text-xs">Total Trades</div>
          </div>

          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-5 h-5 text-blue-400" />
              <span className={`text-sm font-bold ${analytics.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {showValues ? formatCurrency(analytics.totalPnl) : '••••••'}
              </span>
            </div>
            <div className="text-white text-lg font-bold">
              {showValues ? formatCurrency(analytics.totalVolume) : '••••••'}
            </div>
            <div className="text-slate-400 text-xs">Total Volume</div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              <span className="text-purple-400 text-sm font-medium">{analytics.profitFactor.toFixed(2)}</span>
            </div>
            <div className="text-white text-lg font-bold">
              {showValues ? formatCurrency(analytics.avgWin) : '••••••'}
            </div>
            <div className="text-slate-400 text-xs">Avg Win</div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <Calculator className="w-5 h-5 text-orange-400" />
              <span className="text-orange-400 text-sm font-medium">
                {showValues ? formatCurrency(analytics.totalFees) : '••••••'}
              </span>
            </div>
            <div className="text-white text-lg font-bold">
              {showValues ? formatCurrency(analytics.largestWin) : '••••••'}
            </div>
            <div className="text-slate-400 text-xs">Largest Win</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-6 py-4 border-b border-slate-700/50 bg-slate-800/30"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Symbol</label>
                <input
                  type="text"
                  value={filters.symbol === 'all' ? '' : filters.symbol}
                  onChange={(e) => setFilters(prev => ({ ...prev, symbol: e.target.value || 'all' }))}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder="All symbols"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Side</label>
                <select
                  value={filters.side}
                  onChange={(e) => setFilters(prev => ({ ...prev, side: e.target.value as any }))}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All Sides</option>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Date Range</label>
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as any }))}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All Time</option>
                  <option value="1d">Last 24h</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All Status</option>
                  <option value="filled">Filled</option>
                  <option value="partial">Partial</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Asset Type</label>
                <select
                  value={filters.assetType}
                  onChange={(e) => setFilters(prev => ({ ...prev, assetType: e.target.value as any }))}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All Assets</option>
                  <option value="crypto">Crypto</option>
                  <option value="stocks">Stocks</option>
                  <option value="forex">Forex</option>
                  <option value="options">Options</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Strategy</label>
                <select
                  value={filters.strategy}
                  onChange={(e) => setFilters(prev => ({ ...prev, strategy: e.target.value as any }))}
                  className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">All Strategies</option>
                  <option value="scalping">Scalping</option>
                  <option value="swing">Swing</option>
                  <option value="breakout">Breakout</option>
                  <option value="mean-reversion">Mean Reversion</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Bar */}
      <div className="px-6 py-4 border-b border-slate-700/50">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
            placeholder="Search by symbol or order ID..."
          />
        </div>
      </div>

      {/* Trades Table */}
      <div className="p-6">
        <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700/50 bg-slate-800/50">
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Time</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Symbol</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Side</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Type</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Quantity</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Price</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Value</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">P&L</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Status</th>
                  <th className="text-left py-4 px-6 text-slate-400 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedTrades.map((trade, index) => (
                  <motion.tr
                    key={trade.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-all"
                  >
                    <td className="py-4 px-6 text-slate-300 text-sm">{formatTime(trade.timestamp)}</td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{trade.symbol.slice(0, 2)}</span>
                        </div>
                        <div>
                          <div className="text-white font-medium">{trade.symbol}</div>
                          <div className="text-slate-400 text-xs">{trade.assetType.toUpperCase()}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        trade.side === 'buy'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-slate-300 capitalize">{trade.type.replace('_', ' ')}</td>
                    <td className="py-4 px-6 text-white font-medium">{trade.quantity}</td>
                    <td className="py-4 px-6 text-white font-medium">{formatCurrency(trade.price)}</td>
                    <td className="py-4 px-6 text-white font-medium">
                      {showValues ? formatCurrency(trade.value) : '••••••'}
                    </td>
                    <td className="py-4 px-6">
                      <span className={`font-bold ${(trade.pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {showValues ? formatCurrency(trade.pnl || 0) : '••••••'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        trade.status === 'filled'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : trade.status === 'partial'
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {trade.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <button
                        onClick={() => setSelectedTrade(selectedTrade === trade.id ? null : trade.id)}
                        className="p-1 text-slate-400 hover:text-white transition-colors"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-slate-400">
              Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, filteredTrades.length)} of {filteredTrades.length} trades
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center space-x-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                      currentPage === page
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default TradeHistoryEnhanced;
