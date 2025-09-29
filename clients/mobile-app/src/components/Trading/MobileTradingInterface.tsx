import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Brain,
  Zap,
  Target,
  Shield,
  Activity,
  BarChart3,
  PieChart,
  RefreshCw,
  Settings,
  Bell,
  User,
  Search,
  Plus,
  Minus,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Wallet,
  LineChart,
  Menu
} from 'lucide-react';

interface MobilePortfolio {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  availableCash: number;
  positions: MobilePosition[];
}

interface MobilePosition {
  symbol: string;
  quantity: number;
  currentPrice: number;
  dayChange: number;
  dayChangePercent: number;
  unrealizedPnL: number;
  market: string;
}

interface MobileMarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  market: string;
}

interface QuickAction {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  color: string;
  action: () => void;
}

const MobileTradingInterface: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'markets' | 'ai' | 'orders'>('portfolio');
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedPosition, setSelectedPosition] = useState<MobilePosition | null>(null);
  const [showQuickTrade, setShowQuickTrade] = useState<boolean>(false);

  // Mock data optimized for mobile
  const [portfolio] = useState<MobilePortfolio>({
    totalValue: 1250000,
    dayChange: 15750,
    dayChangePercent: 1.28,
    availableCash: 125000,
    positions: [
      { symbol: 'AAPL', quantity: 500, currentPrice: 175.84, dayChange: 2.45, dayChangePercent: 1.41, unrealizedPnL: 5320, market: 'NASDAQ' },
      { symbol: 'BTC', quantity: 2.5, currentPrice: 43250, dayChange: -1205.50, dayChangePercent: -2.71, unrealizedPnL: 5625, market: 'Crypto' },
      { symbol: 'TSLA', quantity: 200, currentPrice: 238.45, dayChange: -5.23, dayChangePercent: -2.15, unrealizedPnL: -1430, market: 'NASDAQ' },
      { symbol: 'ETH', quantity: 15, currentPrice: 2580.75, dayChange: 45.20, dayChangePercent: 1.78, unrealizedPnL: 2340, market: 'Crypto' }
    ]
  });

  const [marketData] = useState<MobileMarketData[]>([
    { symbol: 'AAPL', price: 175.84, change: 2.45, changePercent: 1.41, market: 'stock' },
    { symbol: 'BTC/USD', price: 43250.00, change: -1205.50, changePercent: -2.71, market: 'crypto' },
    { symbol: 'TSLA', price: 238.45, change: -5.23, changePercent: -2.15, market: 'stock' },
    { symbol: 'ETH/USD', price: 2580.75, change: 45.20, changePercent: 1.78, market: 'crypto' },
    { symbol: 'NVDA', price: 485.20, change: 12.30, changePercent: 2.60, market: 'stock' },
    { symbol: 'GOLD', price: 2035.40, change: 15.80, changePercent: 0.78, market: 'commodity' }
  ]);

  const quickActions: QuickAction[] = [
    { id: 'buy', title: 'Quick Buy', icon: TrendingUp, color: 'from-green-500 to-green-600', action: () => setShowQuickTrade(true) },
    { id: 'sell', title: 'Quick Sell', icon: TrendingDown, color: 'from-red-500 to-red-600', action: () => setShowQuickTrade(true) },
    { id: 'ai', title: 'AI Insights', icon: Brain, color: 'from-purple-500 to-purple-600', action: () => setActiveTab('ai') },
    { id: 'alerts', title: 'Set Alert', icon: Bell, color: 'from-blue-500 to-blue-600', action: () => {} }
  ];

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
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

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsRefreshing(false);
  }, []);

  const handleSwipeRefresh = useCallback((event: any, info: PanInfo) => {
    if (info.offset.y > 100 && info.velocity.y > 0) {
      handleRefresh();
    }
  }, [handleRefresh]);

  const renderPortfolioTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Portfolio Summary Card */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Portfolio</h2>
          <button
            onClick={() => setShowBalance(!showBalance)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            {showBalance ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
        </div>
        
        <div className="space-y-3">
          <div>
            <div className="text-3xl font-bold text-white">
              {showBalance ? formatCurrency(portfolio.totalValue) : '••••••••'}
            </div>
            <div className={`flex items-center text-lg ${
              portfolio.dayChangePercent >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {portfolio.dayChangePercent >= 0 ? (
                <TrendingUp className="w-4 h-4 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 mr-1" />
              )}
              {showBalance ? formatCurrency(portfolio.dayChange) : '••••'} ({formatPercentage(portfolio.dayChangePercent)})
            </div>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Available Cash</span>
            <span className="text-white font-medium">
              {showBalance ? formatCurrency(portfolio.availableCash) : '••••••'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.id}
              whileTap={{ scale: 0.95 }}
              onClick={action.action}
              className={`bg-gradient-to-r ${action.color} rounded-xl p-4 text-white font-medium shadow-lg`}
            >
              <div className="flex items-center justify-center space-x-2">
                <Icon className="w-5 h-5" />
                <span>{action.title}</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Positions List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-white">Positions</h3>
        {portfolio.positions.map((position, index) => (
          <motion.div
            key={position.symbol}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setSelectedPosition(position)}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700 active:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{position.symbol.slice(0, 2)}</span>
                </div>
                <div>
                  <div className="font-semibold text-white">{position.symbol}</div>
                  <div className="text-sm text-slate-400">{position.quantity} shares</div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="font-semibold text-white">{formatCurrency(position.currentPrice)}</div>
                <div className={`text-sm flex items-center ${
                  position.dayChangePercent >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {position.dayChangePercent >= 0 ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {formatPercentage(position.dayChangePercent)}
                </div>
              </div>
            </div>
            
            <div className="mt-3 pt-3 border-t border-slate-700 flex justify-between">
              <span className="text-slate-400 text-sm">Unrealized P&L</span>
              <span className={`font-medium ${
                position.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {position.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );

  const renderMarketsTab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Markets</h2>
        <div className="flex items-center space-x-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded-full">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span>Live</span>
        </div>
      </div>

      <div className="space-y-3">
        {marketData.map((item, index) => (
          <motion.div
            key={item.symbol}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            whileTap={{ scale: 0.98 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700 active:bg-slate-700/50 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  item.market === 'stock' ? 'bg-gradient-to-br from-blue-500 to-blue-600' :
                  item.market === 'crypto' ? 'bg-gradient-to-br from-orange-500 to-orange-600' :
                  'bg-gradient-to-br from-yellow-500 to-yellow-600'
                }`}>
                  <span className="text-white font-bold text-sm">{item.symbol.slice(0, 2)}</span>
                </div>
                <div>
                  <div className="font-semibold text-white">{item.symbol}</div>
                  <div className="text-sm text-slate-400 capitalize">{item.market}</div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="font-semibold text-white">{formatCurrency(item.price)}</div>
                <div className={`text-sm flex items-center ${
                  item.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {item.changePercent >= 0 ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {formatPercentage(item.changePercent)}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );

  const renderAITab = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">AI Insights</h2>
        <div className="flex items-center space-x-1 text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full">
          <Brain className="w-3 h-3" />
          <span>Quantum AI</span>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-4">
        <div className="flex items-center space-x-2 mb-3">
          <Zap className="w-5 h-5 text-orange-400" />
          <span className="font-medium text-orange-400">Top AI Recommendation</span>
        </div>
        
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold text-white">AAPL</div>
              <div className="text-sm text-slate-400">Apple Inc.</div>
            </div>
            <div className="text-right">
              <div className="px-2 py-1 bg-green-600/20 text-green-400 rounded text-sm font-medium">
                BUY
              </div>
              <div className="text-xs text-slate-400 mt-1">87% confidence</div>
            </div>
          </div>
          
          <div className="text-sm text-slate-300">
            Quantum analysis indicates strong upward momentum with high probability convergence. 
            Target: $185.50 (+5.5%)
          </div>
          
          <button className="w-full bg-gradient-to-r from-green-600 to-blue-600 py-3 rounded-lg font-medium text-white">
            Execute AI Strategy
          </button>
        </div>
      </div>

      {/* Risk Score */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <span className="font-medium text-white">Portfolio Risk Score</span>
          </div>
          <span className="text-2xl font-bold text-green-400">8.7</span>
        </div>
        
        <div className="w-full h-2 bg-slate-700 rounded-full">
          <div className="w-[87%] h-full bg-gradient-to-r from-green-400 to-blue-400 rounded-full"></div>
        </div>
        
        <div className="flex justify-between text-xs text-slate-400 mt-2">
          <span>Low Risk</span>
          <span>High Risk</span>
        </div>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Mobile Header */}
      <div className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              NexusTradeAI
            </h1>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button className="p-2 text-slate-400 hover:text-white transition-colors">
              <Bell className="w-5 h-5" />
            </button>
            <button className="p-2 text-slate-400 hover:text-white transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content with Pull-to-Refresh */}
      <motion.div
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        onDragEnd={handleSwipeRefresh}
        className="p-4 pb-24"
      >
        {activeTab === 'portfolio' && renderPortfolioTab()}
        {activeTab === 'markets' && renderMarketsTab()}
        {activeTab === 'ai' && renderAITab()}
      </motion.div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-700">
        <div className="flex items-center justify-around py-2">
          {[
            { id: 'portfolio', icon: PieChart, label: 'Portfolio' },
            { id: 'markets', icon: BarChart3, label: 'Markets' },
            { id: 'ai', icon: Brain, label: 'AI' },
            { id: 'orders', icon: Target, label: 'Orders' }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center space-y-1 py-2 px-4 rounded-lg transition-colors ${
                  isActive ? 'text-blue-400' : 'text-slate-400'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                <span className="text-xs font-medium">{tab.label}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default MobileTradingInterface;
