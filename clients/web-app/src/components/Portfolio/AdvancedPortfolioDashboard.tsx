import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  PieChart,
  BarChart3,
  Target,
  Shield,
  Zap,
  Brain,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Percent,
  Activity,
  Clock,
  Settings,
  Download,
  Upload,
  Eye,
  EyeOff
} from 'lucide-react';

interface PortfolioMetrics {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  weekChange: number;
  monthChange: number;
  yearChange: number;
  sharpeRatio: number;
  maxDrawdown: number;
  volatility: number;
  beta: number;
  alpha: number;
  informationRatio: number;
}

interface AssetAllocation {
  category: string;
  value: number;
  percentage: number;
  change: number;
  color: string;
}

interface PerformanceMetric {
  label: string;
  value: string;
  change: number;
  status: 'good' | 'warning' | 'danger';
  benchmark?: string;
}

interface RebalancingRecommendation {
  asset: string;
  currentWeight: number;
  targetWeight: number;
  action: 'buy' | 'sell' | 'hold';
  amount: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

const AdvancedPortfolioDashboard: React.FC = () => {
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1M');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Mock data - would be fetched from backend
  const [portfolioMetrics] = useState<PortfolioMetrics>({
    totalValue: 2847392.50,
    dayChange: 45623.75,
    dayChangePercent: 1.63,
    weekChange: 89234.12,
    monthChange: 234567.89,
    yearChange: 567890.12,
    sharpeRatio: 1.85,
    maxDrawdown: -8.3,
    volatility: 12.4,
    beta: 0.92,
    alpha: 3.2,
    informationRatio: 1.42
  });

  const [assetAllocation] = useState<AssetAllocation[]>([
    { category: 'US Equities', value: 1423696.25, percentage: 50.0, change: 2.1, color: 'from-blue-500 to-blue-600' },
    { category: 'International Equities', value: 569478.50, percentage: 20.0, change: -0.8, color: 'from-green-500 to-green-600' },
    { category: 'Fixed Income', value: 427108.88, percentage: 15.0, change: 0.3, color: 'from-purple-500 to-purple-600' },
    { category: 'Commodities', value: 284739.25, percentage: 10.0, change: 3.2, color: 'from-orange-500 to-orange-600' },
    { category: 'Cash & Equivalents', value: 142369.63, percentage: 5.0, change: 0.1, color: 'from-gray-500 to-gray-600' }
  ]);

  const [performanceMetrics] = useState<PerformanceMetric[]>([
    { label: 'Sharpe Ratio', value: '1.85', change: 0.12, status: 'good', benchmark: '1.20' },
    { label: 'Max Drawdown', value: '-8.3%', change: 1.2, status: 'good', benchmark: '-12.0%' },
    { label: 'Volatility', value: '12.4%', change: -0.8, status: 'good', benchmark: '15.2%' },
    { label: 'Beta', value: '0.92', change: -0.05, status: 'good', benchmark: '1.00' },
    { label: 'Alpha', value: '3.2%', change: 0.4, status: 'good', benchmark: '0.0%' },
    { label: 'Information Ratio', value: '1.42', change: 0.08, status: 'good', benchmark: '0.80' }
  ]);

  const [rebalancingRecommendations] = useState<RebalancingRecommendation[]>([
    {
      asset: 'US Equities',
      currentWeight: 50.0,
      targetWeight: 48.5,
      action: 'sell',
      amount: 42736.89,
      reason: 'Overweight due to recent gains',
      priority: 'medium'
    },
    {
      asset: 'International Equities',
      currentWeight: 20.0,
      targetWeight: 22.0,
      action: 'buy',
      amount: 56947.85,
      reason: 'Underweight, attractive valuations',
      priority: 'high'
    },
    {
      asset: 'Commodities',
      currentWeight: 10.0,
      targetWeight: 9.5,
      action: 'sell',
      amount: 14236.96,
      reason: 'Slight overweight position',
      priority: 'low'
    }
  ]);

  const timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y'];

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshData, 30000);
    return () => clearInterval(interval);
  }, [refreshData]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Advanced Portfolio Management
            </h1>
            <p className="text-slate-400 mt-1">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
            >
              {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="text-sm">{showBalance ? 'Hide' : 'Show'} Values</span>
            </button>
            
            <button
              onClick={refreshData}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        {/* Portfolio Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Portfolio Overview</h2>
            <div className="flex space-x-1">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    selectedTimeframe === tf
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Total Portfolio Value</span>
                <PieChart className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold">
                {showBalance ? formatCurrency(portfolioMetrics.totalValue) : '••••••••'}
              </div>
              <div className="flex items-center text-sm text-green-400">
                <TrendingUp className="w-3 h-3 mr-1" />
                {showBalance ? formatCurrency(portfolioMetrics.dayChange) : '••••'} ({formatPercentage(portfolioMetrics.dayChangePercent)})
              </div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Sharpe Ratio</span>
                <Target className="w-4 h-4 text-green-400" />
              </div>
              <div className="text-2xl font-bold text-green-400">{portfolioMetrics.sharpeRatio}</div>
              <div className="text-sm text-slate-400">vs benchmark: 1.20</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Max Drawdown</span>
                <Shield className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-2xl font-bold text-orange-400">{portfolioMetrics.maxDrawdown}%</div>
              <div className="text-sm text-slate-400">vs benchmark: -12.0%</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Alpha</span>
                <Brain className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-purple-400">{portfolioMetrics.alpha}%</div>
              <div className="text-sm text-slate-400">Outperforming market</div>
            </div>
          </div>
        </motion.div>

        {/* Asset Allocation & Performance Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Asset Allocation */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Asset Allocation</h3>
              <PieChart className="w-5 h-5 text-blue-400" />
            </div>

            <div className="space-y-4">
              {assetAllocation.map((asset, index) => (
                <motion.div
                  key={asset.category}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-4 h-4 rounded bg-gradient-to-r ${asset.color}`}></div>
                    <div>
                      <div className="font-medium">{asset.category}</div>
                      <div className="text-sm text-slate-400">{asset.percentage}%</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">
                      {showBalance ? formatCurrency(asset.value) : '••••••'}
                    </div>
                    <div className={`text-sm ${asset.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercentage(asset.change)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Performance Metrics */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold">Performance Metrics</h3>
              <BarChart3 className="w-5 h-5 text-green-400" />
            </div>

            <div className="space-y-4">
              {performanceMetrics.map((metric, index) => (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg"
                >
                  <div>
                    <div className="font-medium">{metric.label}</div>
                    <div className="text-sm text-slate-400">
                      Benchmark: {metric.benchmark}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${
                      metric.status === 'good' ? 'text-green-400' :
                      metric.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {metric.value}
                    </div>
                    <div className={`text-sm ${metric.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {metric.change >= 0 ? '+' : ''}{metric.change.toFixed(2)}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* AI-Powered Rebalancing Recommendations */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Brain className="w-5 h-5 text-orange-400" />
              <h3 className="text-lg font-semibold">AI Rebalancing Recommendations</h3>
              <div className="flex items-center space-x-1 text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">
                <Zap className="w-3 h-3" />
                <span>Live</span>
              </div>
            </div>
            <button className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
              <CheckCircle className="w-4 h-4" />
              <span>Execute All</span>
            </button>
          </div>

          <div className="space-y-4">
            {rebalancingRecommendations.map((rec, index) => (
              <motion.div
                key={rec.asset}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      rec.priority === 'high' ? 'bg-red-600/20 text-red-400' :
                      rec.priority === 'medium' ? 'bg-yellow-600/20 text-yellow-400' :
                      'bg-green-600/20 text-green-400'
                    }`}>
                      {rec.priority.toUpperCase()}
                    </div>
                    <span className="font-semibold">{rec.asset}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      rec.action === 'buy' ? 'bg-green-600/20 text-green-400' :
                      rec.action === 'sell' ? 'bg-red-600/20 text-red-400' :
                      'bg-slate-600/20 text-slate-400'
                    }`}>
                      {rec.action.toUpperCase()}
                    </span>
                  </div>
                  <button className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded transition-colors">
                    <span className="text-sm">Execute</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">Current Weight:</span>
                    <div className="font-medium">{rec.currentWeight}%</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Target Weight:</span>
                    <div className="font-medium">{rec.targetWeight}%</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Amount:</span>
                    <div className="font-medium">
                      {showBalance ? formatCurrency(rec.amount) : '••••••'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400">Difference:</span>
                    <div className={`font-medium ${
                      rec.currentWeight > rec.targetWeight ? 'text-red-400' : 'text-green-400'
                    }`}>
                      {(rec.targetWeight - rec.currentWeight).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-slate-800/50 rounded">
                  <span className="text-slate-400 text-sm">Reason: </span>
                  <span className="text-slate-300 text-sm">{rec.reason}</span>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-blue-400" />
              <span className="font-medium text-blue-400">Portfolio Optimization Summary</span>
            </div>
            <p className="text-sm text-slate-300">
              Implementing these recommendations could improve your Sharpe ratio by approximately 0.15
              and reduce portfolio volatility by 1.2%. Estimated execution cost: $247.50 in fees.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AdvancedPortfolioDashboard;
