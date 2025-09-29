import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  ChartBarIcon,
  ArrowsRightLeftIcon,
  ScaleIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  GlobeAltIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface AssetAllocation {
  assetClass: string;
  percentage: number;
  value: number;
  color: string;
}

interface AssetPerformance {
  assetClass: string;
  symbol: string;
  name: string;
  allocation: number;
  value: number;
  dayChange: number;
  dayChangePercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  risk: number;
}

interface PortfolioMetrics {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  totalReturn: number;
  totalReturnPercent: number;
  sharpeRatio: number;
  volatility: number;
  drawdown: number;
  alpha: number;
  beta: number;
}

interface RebalanceRecommendation {
  assetClass: string;
  currentAllocation: number;
  targetAllocation: number;
  action: 'BUY' | 'SELL' | 'HOLD';
  amount: number;
  reason: string;
}

interface MultiAssetPortfolioManagerProps {
  portfolioId: string;
  refreshInterval?: number;
}

const MultiAssetPortfolioManager: React.FC<MultiAssetPortfolioManagerProps> = ({
  portfolioId,
  refreshInterval = 5000
}) => {
  const dispatch = useAppDispatch();
  const { portfolio } = useAppSelector((state) => state.portfolio);
  
  const [assetAllocation, setAssetAllocation] = useState<AssetAllocation[]>([]);
  const [assetPerformance, setAssetPerformance] = useState<AssetPerformance[]>([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  const [rebalanceRecommendations, setRebalanceRecommendations] = useState<RebalanceRecommendation[]>([]);
  const [isRebalancing, setIsRebalancing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load portfolio data
  const loadPortfolioData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // In a real implementation, these would be API calls
      // Simulating API responses with mock data
      
      // Asset allocation
      const allocationData: AssetAllocation[] = [
        { assetClass: 'Equities', percentage: 0.45, value: 450000, color: '#4ade80' },
        { assetClass: 'Fixed Income', percentage: 0.25, value: 250000, color: '#60a5fa' },
        { assetClass: 'Crypto', percentage: 0.15, value: 150000, color: '#f97316' },
        { assetClass: 'Commodities', percentage: 0.08, value: 80000, color: '#facc15' },
        { assetClass: 'Real Estate', percentage: 0.05, value: 50000, color: '#8b5cf6' },
        { assetClass: 'Cash', percentage: 0.02, value: 20000, color: '#94a3b8' },
      ];
      
      // Asset performance
      const performanceData: AssetPerformance[] = [
        { 
          assetClass: 'Equities', 
          symbol: 'SPY', 
          name: 'S&P 500 ETF', 
          allocation: 0.25, 
          value: 250000,
          dayChange: 2500, 
          dayChangePercent: 1.0, 
          totalReturn: 37500, 
          totalReturnPercent: 17.5,
          risk: 0.15
        },
        { 
          assetClass: 'Equities', 
          symbol: 'QQQ', 
          name: 'Nasdaq 100 ETF', 
          allocation: 0.20, 
          value: 200000,
          dayChange: 3200, 
          dayChangePercent: 1.6, 
          totalReturn: 42000, 
          totalReturnPercent: 26.5,
          risk: 0.18
        },
        { 
          assetClass: 'Fixed Income', 
          symbol: 'AGG', 
          name: 'US Aggregate Bond ETF', 
          allocation: 0.15, 
          value: 150000,
          dayChange: -300, 
          dayChangePercent: -0.2, 
          totalReturn: 4500, 
          totalReturnPercent: 3.1,
          risk: 0.05
        },
        { 
          assetClass: 'Fixed Income', 
          symbol: 'TLT', 
          name: 'Long-Term Treasury ETF', 
          allocation: 0.10, 
          value: 100000,
          dayChange: -800, 
          dayChangePercent: -0.8, 
          totalReturn: -3000, 
          totalReturnPercent: -2.9,
          risk: 0.12
        },
        { 
          assetClass: 'Crypto', 
          symbol: 'BTC', 
          name: 'Bitcoin', 
          allocation: 0.10, 
          value: 100000,
          dayChange: 4200, 
          dayChangePercent: 4.2, 
          totalReturn: 35000, 
          totalReturnPercent: 53.8,
          risk: 0.65
        },
        { 
          assetClass: 'Crypto', 
          symbol: 'ETH', 
          name: 'Ethereum', 
          allocation: 0.05, 
          value: 50000,
          dayChange: 1800, 
          dayChangePercent: 3.6, 
          totalReturn: 12500, 
          totalReturnPercent: 33.3,
          risk: 0.70
        },
        { 
          assetClass: 'Commodities', 
          symbol: 'GLD', 
          name: 'Gold ETF', 
          allocation: 0.08, 
          value: 80000,
          dayChange: 400, 
          dayChangePercent: 0.5, 
          totalReturn: 6400, 
          totalReturnPercent: 8.7,
          risk: 0.14
        },
        { 
          assetClass: 'Real Estate', 
          symbol: 'VNQ', 
          name: 'Real Estate ETF', 
          allocation: 0.05, 
          value: 50000,
          dayChange: -250, 
          dayChangePercent: -0.5, 
          totalReturn: 3500, 
          totalReturnPercent: 7.5,
          risk: 0.16
        },
      ];
      
      // Portfolio metrics
      const metrics: PortfolioMetrics = {
        totalValue: 1000000,
        dayChange: 10750,
        dayChangePercent: 1.08,
        totalReturn: 138400,
        totalReturnPercent: 16.1,
        sharpeRatio: 1.85,
        volatility: 0.12,
        drawdown: 0.08,
        alpha: 0.04,
        beta: 0.92
      };
      
      // Rebalance recommendations
      const recommendations: RebalanceRecommendation[] = [
        {
          assetClass: 'Equities',
          currentAllocation: 0.45,
          targetAllocation: 0.40,
          action: 'SELL',
          amount: 50000,
          reason: 'Overweight relative to target allocation'
        },
        {
          assetClass: 'Fixed Income',
          currentAllocation: 0.25,
          targetAllocation: 0.30,
          action: 'BUY',
          amount: 50000,
          reason: 'Underweight relative to target allocation'
        },
        {
          assetClass: 'Crypto',
          currentAllocation: 0.15,
          targetAllocation: 0.10,
          action: 'SELL',
          amount: 50000,
          reason: 'Risk reduction after recent gains'
        },
        {
          assetClass: 'Real Estate',
          currentAllocation: 0.05,
          targetAllocation: 0.10,
          action: 'BUY',
          amount: 50000,
          reason: 'Increase diversification and inflation hedge'
        }
      ];
      
      setAssetAllocation(allocationData);
      setAssetPerformance(performanceData);
      setPortfolioMetrics(metrics);
      setRebalanceRecommendations(recommendations);
      
    } catch (error) {
      console.error('Failed to load portfolio data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Rebalance portfolio
  const rebalancePortfolio = useCallback(async () => {
    try {
      setIsRebalancing(true);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // In a real implementation, this would call an API to execute trades
      showNotification('Portfolio rebalanced successfully');
      
      // Refresh data after rebalancing
      loadPortfolioData();
      
    } catch (error) {
      console.error('Failed to rebalance portfolio:', error);
      showNotification('Failed to rebalance portfolio', 'error');
    } finally {
      setIsRebalancing(false);
    }
  }, [loadPortfolioData]);

  // Show notification
  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    // In a real implementation, this would show a toast notification
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  // Load data on mount and periodically
  useEffect(() => {
    loadPortfolioData();
    const interval = setInterval(loadPortfolioData, refreshInterval);
    return () => clearInterval(interval);
  }, [loadPortfolioData, refreshInterval]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(2)}%`;
  };

  const getChangeColor = (change: number) => {
    return change >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'SELL': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <GlobeAltIcon className="h-6 w-6 mr-3 text-blue-500" />
            Multi-Asset Portfolio Manager
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Institutional-grade portfolio management across asset classes
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={rebalancePortfolio}
            disabled={isRebalancing}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
          >
            {isRebalancing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Rebalancing...</span>
              </>
            ) : (
              <>
                <ArrowsRightLeftIcon className="h-4 w-4" />
                <span>Rebalance Portfolio</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Portfolio Metrics */}
      {portfolioMetrics && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Portfolio Overview
            </h3>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {formatCurrency(portfolioMetrics.totalValue)}
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-lg font-bold ${getChangeColor(portfolioMetrics.dayChangePercent)}`}>
                {formatPercentage(portfolioMetrics.dayChangePercent)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Today</div>
            </div>
            
            <div className="text-center">
              <div className={`text-lg font-bold ${getChangeColor(portfolioMetrics.totalReturnPercent)}`}>
                {formatPercentage(portfolioMetrics.totalReturnPercent)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Return</div>
            </div>
            
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {portfolioMetrics.sharpeRatio.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Sharpe Ratio</div>
            </div>
            
            <div className="text-center">
              <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                {(portfolioMetrics.volatility * 100).toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Volatility</div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Asset Allocation */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2 text-blue-500" />
            Asset Allocation
          </h3>
          
          <div className="space-y-4">
            {assetAllocation.map((asset) => (
              <div key={asset.assetClass} className="flex items-center space-x-4">
                <div className="w-24 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {asset.assetClass}
                </div>
                <div className="flex-1">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div 
                      className="h-2.5 rounded-full" 
                      style={{ width: `${asset.percentage * 100}%`, backgroundColor: asset.color }}
                    />
                  </div>
                </div>
                <div className="w-16 text-right text-sm font-medium text-gray-900 dark:text-white">
                  {(asset.percentage * 100).toFixed(1)}%
                </div>
                <div className="w-24 text-right text-sm font-medium text-gray-900 dark:text-white">
                  {formatCurrency(asset.value)}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Rebalance Recommendations */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <ScaleIcon className="h-5 w-5 mr-2 text-green-500" />
            Rebalance Recommendations
          </h3>
          
          <div className="space-y-3">
            {rebalanceRecommendations.map((rec, index) => (
              <div key={index} className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {rec.assetClass}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getActionColor(rec.action)}`}>
                    {rec.action}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">
                    {(rec.currentAllocation * 100).toFixed(1)}% → {(rec.targetAllocation * 100).toFixed(1)}%
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {formatCurrency(rec.amount)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {rec.reason}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Asset Performance */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <CurrencyDollarIcon className="h-5 w-5 mr-2 text-green-500" />
            Asset Performance
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Asset
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Allocation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Day Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Total Return
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Risk
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {assetPerformance.map((asset) => (
                <tr key={asset.symbol} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {asset.symbol}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {asset.name}
                        </div>
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {(asset.allocation * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {asset.assetClass}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatCurrency(asset.value)}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${getChangeColor(asset.dayChangePercent)}`}>
                      {formatPercentage(asset.dayChangePercent)}
                    </div>
                    <div className={`text-xs ${getChangeColor(asset.dayChange)}`}>
                      {formatCurrency(asset.dayChange)}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className={`text-sm font-medium ${getChangeColor(asset.totalReturnPercent)}`}>
                      {formatPercentage(asset.totalReturnPercent)}
                    </div>
                    <div className={`text-xs ${getChangeColor(asset.totalReturn)}`}>
                      {formatCurrency(asset.totalReturn)}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${
                          asset.risk < 0.2 ? 'bg-green-500' : 
                          asset.risk < 0.4 ? 'bg-yellow-500' : 
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(asset.risk * 100, 100)}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {(asset.risk * 100).toFixed(0)}% volatility
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default MultiAssetPortfolioManager;
