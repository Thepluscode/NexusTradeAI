import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  DollarSign,
  BarChart3,
  Brain,
  Shield,
  Globe,
  AlertTriangle,
  Plus,
  Settings,
  Search,
  Bell,
  User,
  ChevronDown,
  Eye,
  EyeOff,
  Zap,
  Target,
  PieChart,
  LineChart,
  Wifi,
  WifiOff,
  RefreshCw,
  TrendingUpIcon,
  BarChart,
  Cpu,
  Database,
  Clock,
  Calculator,
  History,
  Link,
  Layers,
  Calendar,
  Percent,
  Award,
  Briefcase,
  TrendingUpDown,
  AlertCircle,
  CheckCircle,
  XCircle,
  Pause,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock data types
interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  market: 'stock' | 'crypto' | 'forex' | 'commodity';
}

interface Portfolio {
  totalValue: number;
  dayChange: number;
  dayChangePercent: number;
  positions: Position[];
}

interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  market: string;
}

interface AIInsight {
  type: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe: string;
  description: string;
  symbol: string;
}

interface RiskMetric {
  label: string;
  value: string;
  status: 'low' | 'medium' | 'high';
  change: number;
}

interface ConnectionStatus {
  marketData: boolean;
  trading: boolean;
  ai: boolean;
  risk: boolean;
  latency: number;
}

interface RealTimeMetrics {
  throughput: number;
  uptime: number;
  activeConnections: number;
  lastUpdate: Date;
}

interface TradingAlert {
  id: string;
  type: 'price' | 'volume' | 'technical' | 'news' | 'risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  symbol: string;
  message: string;
  timestamp: Date;
  isRead: boolean;
}

interface PerformanceMetrics {
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  totalTrades: number;
}

interface OrderBookData {
  symbol: string;
  bids: [number, number][];
  asks: [number, number][];
  spread: number;
  lastUpdate: Date;
}

interface TradingSession {
  sessionId: string;
  startTime: Date;
  pnl: number;
  trades: number;
  winRate: number;
  status: 'active' | 'paused' | 'ended';
}

// API Service Functions
const apiService = {
  // Market Data API
  async getMarketData(symbols: string[]) {
    const response = await fetch('/api/market-data/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols })
    });
    return response.json();
  },

  // AI Predictions API
  async getAIPredictions(symbol: string) {
    const response = await fetch(`/api/ai/multi-agent-predictions?symbol=${symbol}`);
    return response.json();
  },

  // Risk Analysis API
  async getRiskAnalysis(portfolioId: string) {
    const response = await fetch('/api/risk/comprehensive-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ portfolioId })
    });
    return response.json();
  },

  // Portfolio Data API
  async getPortfolioData(userId: string) {
    const response = await fetch(`/api/portfolio/${userId}`);
    return response.json();
  },

  // Trading Execution API
  async executeStrategy(strategyParams: any) {
    const response = await fetch('/api/trading/execute-ai-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(strategyParams)
    });
    return response.json();
  }
};

const TradingDashboard: React.FC = () => {
  const [selectedMarket, setSelectedMarket] = useState<string>('all');
  const [showBalance, setShowBalance] = useState<boolean>(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1D');

  // Real-time connection and data states
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    marketData: false,
    trading: false,
    ai: false,
    risk: false,
    latency: 0
  });

  const [realTimeMetrics, setRealTimeMetrics] = useState<RealTimeMetrics>({
    throughput: 0,
    uptime: 99.99,
    activeConnections: 0,
    lastUpdate: new Date()
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Enhanced state management
  const [tradingAlerts, setTradingAlerts] = useState<TradingAlert[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>({
    totalReturn: 15.67,
    sharpeRatio: 1.85,
    maxDrawdown: -8.45,
    winRate: 68.5,
    profitFactor: 2.34,
    avgWin: 245.80,
    avgLoss: -105.20,
    totalTrades: 127
  });
  const [currentSession, setCurrentSession] = useState<TradingSession>({
    sessionId: 'session-' + Date.now(),
    startTime: new Date(),
    pnl: 1250.75,
    trades: 8,
    winRate: 75,
    status: 'active'
  });
  const [activeView, setActiveView] = useState<'overview' | 'positions' | 'orders' | 'analytics' | 'alerts'>('overview');

  // Mock data
  const [marketData] = useState<MarketData[]>([
    { symbol: 'AAPL', price: 175.84, change: 2.45, changePercent: 1.41, volume: 52840000, market: 'stock' },
    { symbol: 'BTC/USD', price: 43250.00, change: -1205.50, changePercent: -2.71, volume: 28500000, market: 'crypto' },
    { symbol: 'EUR/USD', price: 1.0875, change: 0.0012, changePercent: 0.11, volume: 125000000, market: 'forex' },
    { symbol: 'GOLD', price: 2035.40, change: 15.80, changePercent: 0.78, volume: 8920000, market: 'commodity' },
    { symbol: 'TSLA', price: 238.45, change: -5.23, changePercent: -2.15, volume: 87500000, market: 'stock' },
    { symbol: 'ETH/USD', price: 2580.75, change: 45.20, changePercent: 1.78, volume: 15600000, market: 'crypto' }
  ]);

  const [portfolio] = useState<Portfolio>({
    totalValue: 1250000,
    dayChange: 15750,
    dayChangePercent: 1.28,
    positions: [
      { symbol: 'AAPL', quantity: 500, avgPrice: 165.20, currentPrice: 175.84, unrealizedPnL: 5320, market: 'NASDAQ' },
      { symbol: 'BTC', quantity: 2.5, avgPrice: 41000, currentPrice: 43250, unrealizedPnL: 5625, market: 'Crypto' },
      { symbol: 'TSLA', quantity: 200, avgPrice: 245.60, currentPrice: 238.45, unrealizedPnL: -1430, market: 'NASDAQ' },
      { symbol: 'GOLD', quantity: 100, avgPrice: 2020.00, currentPrice: 2035.40, unrealizedPnL: 1540, market: 'Commodity' }
    ]
  });

  const [aiInsights] = useState<AIInsight[]>([
    { type: 'bullish', confidence: 87, timeframe: '1W', description: 'Strong upward momentum detected with volume confirmation', symbol: 'AAPL' },
    { type: 'bearish', confidence: 72, timeframe: '3D', description: 'Technical resistance at $44K, potential correction expected', symbol: 'BTC' },
    { type: 'neutral', confidence: 65, timeframe: '1D', description: 'Consolidation pattern, awaiting ECB decision', symbol: 'EUR/USD' }
  ]);

  const [riskMetrics] = useState<RiskMetric[]>([
    { label: 'Portfolio VaR (1D)', value: '2.3%', status: 'low', change: -0.1 },
    { label: 'Concentration Risk', value: 'Medium', status: 'medium', change: 0.0 },
    { label: 'Leverage Ratio', value: '1.8x', status: 'low', change: 0.2 },
    { label: 'Liquidity Score', value: '95/100', status: 'low', change: 2 }
  ]);

  // Sample alert data
  useEffect(() => {
    const sampleAlerts: TradingAlert[] = [
      {
        id: '1',
        type: 'price',
        severity: 'high',
        symbol: 'AAPL',
        message: 'AAPL broke above resistance at $175.00',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        isRead: false
      },
      {
        id: '2',
        type: 'volume',
        severity: 'medium',
        symbol: 'BTC/USD',
        message: 'Unusual volume spike detected (+150%)',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        isRead: false
      },
      {
        id: '3',
        type: 'technical',
        severity: 'low',
        symbol: 'TSLA',
        message: 'RSI oversold condition (RSI: 28)',
        timestamp: new Date(Date.now() - 30 * 60 * 1000),
        isRead: true
      },
      {
        id: '4',
        type: 'risk',
        severity: 'critical',
        symbol: 'Portfolio',
        message: 'Position size limit exceeded for AAPL',
        timestamp: new Date(Date.now() - 45 * 60 * 1000),
        isRead: false
      }
    ];
    setTradingAlerts(sampleAlerts);
  }, []);

  const markets = [
    { id: 'all', name: 'All Markets', icon: Globe },
    { id: 'stock', name: 'Stocks', icon: TrendingUp },
    { id: 'crypto', name: 'Crypto', icon: Activity },
    { id: 'forex', name: 'Forex', icon: DollarSign },
    { id: 'commodity', name: 'Commodities', icon: BarChart3 }
  ];

  const timeframes = ['1M', '5M', '15M', '1H', '4H', '1D', '1W', '1Mo'];

  const filteredMarketData = selectedMarket === 'all'
    ? marketData
    : marketData.filter(item => item.market === selectedMarket);

  // Real-time data fetching
  const fetchRealTimeData = useCallback(async () => {
    try {
      setIsLoading(true);
      const startTime = Date.now();

      // Fetch market data
      const symbols = marketData.map(item => item.symbol);
      const marketDataResponse = await apiService.getMarketData(symbols);

      // Fetch AI predictions for selected symbols
      const aiPredictionsPromises = symbols.slice(0, 3).map(symbol =>
        apiService.getAIPredictions(symbol)
      );
      const aiPredictionsResponses = await Promise.all(aiPredictionsPromises);

      // Fetch risk analysis
      const riskResponse = await apiService.getRiskAnalysis('user-portfolio-1');

      // Fetch portfolio data
      const portfolioResponse = await apiService.getPortfolioData('user-1');

      const endTime = Date.now();
      const latency = endTime - startTime;

      // Update connection status
      setConnectionStatus(prev => ({
        ...prev,
        marketData: marketDataResponse.success,
        ai: aiPredictionsResponses.every(r => r.success),
        risk: riskResponse.success,
        trading: true,
        latency
      }));

      // Update real-time metrics
      setRealTimeMetrics(prev => ({
        ...prev,
        throughput: Math.floor(Math.random() * 2000000) + 1000000, // 1-3M/s
        activeConnections: Math.floor(Math.random() * 50) + 150,
        lastUpdate: new Date()
      }));

      setLastRefresh(new Date());

    } catch (error) {
      console.error('Error fetching real-time data:', error);
      setConnectionStatus(prev => ({
        ...prev,
        marketData: false,
        ai: false,
        risk: false,
        trading: false
      }));
    } finally {
      setIsLoading(false);
    }
  }, [marketData]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const ws = new WebSocket(process.env.NEXT_PUBLIC_WS_MARKET_DATA_URL || 'ws://localhost:8080');

    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnectionStatus(prev => ({ ...prev, marketData: true }));

      // Subscribe to market data
      ws.send(JSON.stringify({
        action: 'subscribe',
        symbols: marketData.map(item => item.symbol)
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Handle real-time market data updates
      console.log('Real-time data:', data);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnectionStatus(prev => ({ ...prev, marketData: false }));
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus(prev => ({ ...prev, marketData: false }));
    };

    return () => {
      ws.close();
    };
  }, [marketData]);

  // Initial data fetch and periodic updates
  useEffect(() => {
    fetchRealTimeData();

    // Update every 5 seconds
    const interval = setInterval(fetchRealTimeData, 5000);

    return () => clearInterval(interval);
  }, [fetchRealTimeData]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-8">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Nexus Trade AI
              </h1>
            </div>
            
            <nav className="flex space-x-6">
              {markets.map((market) => {
                const Icon = market.icon;
                return (
                  <button
                    key={market.id}
                    onClick={() => setSelectedMarket(market.id)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${
                      selectedMarket === market.id
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{market.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center space-x-4">
            {/* Real-time System Status */}
            <div className="hidden lg:flex items-center space-x-4 text-xs bg-slate-800/50 rounded-lg px-3 py-2">
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatus.marketData ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-gray-300">Market</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatus.ai ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-gray-300">AI</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${connectionStatus.trading ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-gray-300">Trading</span>
              </div>
              <div className="flex items-center space-x-2">
                <Clock className="w-3 h-3 text-gray-400" />
                <span className="text-gray-300">{connectionStatus.latency}ms</span>
              </div>
            </div>

            {/* Performance Metrics */}
            <div className="hidden xl:flex items-center space-x-4 text-xs bg-slate-800/50 rounded-lg px-3 py-2">
              <div className="flex items-center space-x-2">
                <Database className="w-3 h-3 text-blue-400" />
                <span className="text-gray-300">{(realTimeMetrics.throughput / 1000000).toFixed(1)}M/s</span>
              </div>
              <div className="flex items-center space-x-2">
                <Cpu className="w-3 h-3 text-green-400" />
                <span className="text-gray-300">{realTimeMetrics.uptime}%</span>
              </div>
              <div className="flex items-center space-x-2">
                <Wifi className="w-3 h-3 text-purple-400" />
                <span className="text-gray-300">{realTimeMetrics.activeConnections}</span>
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchRealTimeData}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search symbols..."
                className="bg-slate-800 border border-slate-600 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-64"
              />
            </div>

            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors relative">
              <Bell className="w-5 h-5" />
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
            </button>

            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-2 bg-slate-800 rounded-lg px-3 py-2">
              <User className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium">John Trader</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>
      </header>

      {/* Enhanced Navigation Tabs */}
      <div className="bg-slate-800/50 border-b border-slate-700/50 px-6">
        <div className="flex space-x-1">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'positions', label: 'Positions', icon: Target },
            { id: 'orders', label: 'Orders', icon: History },
            { id: 'analytics', label: 'Analytics', icon: TrendingUpDown },
            { id: 'alerts', label: 'Alerts', icon: Bell }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-lg font-medium transition-all duration-200 ${
                activeView === tab.id
                  ? 'bg-slate-700/50 text-white border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/30'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.id === 'alerts' && tradingAlerts.filter(a => !a.isRead).length > 0 && (
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Session Status Bar */}
      <div className="bg-gradient-to-r from-slate-800/30 to-slate-700/30 border-b border-slate-700/50 px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${currentSession.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
              <span className="text-sm text-slate-300">Session: {currentSession.status.toUpperCase()}</span>
            </div>
            <div className="text-sm text-slate-400">
              Started: {currentSession.startTime.toLocaleTimeString()}
            </div>
            <div className="text-sm">
              <span className="text-slate-400">Session P&L: </span>
              <span className={`font-bold ${currentSession.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(currentSession.pnl)}
              </span>
            </div>
            <div className="text-sm">
              <span className="text-slate-400">Trades: </span>
              <span className="text-white font-medium">{currentSession.trades}</span>
            </div>
            <div className="text-sm">
              <span className="text-slate-400">Win Rate: </span>
              <span className="text-blue-400 font-medium">{currentSession.winRate}%</span>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentSession(prev => ({
                ...prev,
                status: prev.status === 'active' ? 'paused' : 'active'
              }))}
              className={`flex items-center space-x-2 px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                currentSession.status === 'active'
                  ? 'bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30'
                  : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
              }`}
            >
              {currentSession.status === 'active' ? (
                <>
                  <Pause className="w-3 h-3" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>Resume</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-140px)]">
        {/* Main Content */}
        <div className="flex-1 p-6 overflow-auto">
          {/* Overview Tab */}
          {activeView === 'overview' && (
            <div className="grid grid-cols-12 gap-6 h-full">
            {/* Portfolio Overview */}
            <div className="col-span-12 lg:col-span-8">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6 mb-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">Portfolio Overview</h2>
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => setShowBalance(!showBalance)}
                      className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
                    >
                      {showBalance ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      <span className="text-sm">{showBalance ? 'Hide' : 'Show'} Balance</span>
                    </button>
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
                </div>

                <div className="grid grid-cols-4 gap-6 mb-6">
                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400 text-sm">Total Value</span>
                      <PieChart className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="text-2xl font-bold">
                      {showBalance ? formatCurrency(portfolio.totalValue) : '••••••'}
                    </div>
                    <div className={`flex items-center text-sm ${
                      portfolio.dayChangePercent >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {portfolio.dayChangePercent >= 0 ? (
                        <TrendingUp className="w-3 h-3 mr-1" />
                      ) : (
                        <TrendingDown className="w-3 h-3 mr-1" />
                      )}
                      {showBalance ? formatCurrency(portfolio.dayChange) : '••••'} ({portfolio.dayChangePercent.toFixed(2)}%)
                    </div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400 text-sm">Available Cash</span>
                      <DollarSign className="w-4 h-4 text-green-400" />
                    </div>
                    <div className="text-2xl font-bold">
                      {showBalance ? formatCurrency(125000) : '••••••'}
                    </div>
                    <div className="text-sm text-slate-400">Ready to trade</div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400 text-sm">Active Positions</span>
                      <Target className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="text-2xl font-bold">{portfolio.positions.length}</div>
                    <div className="text-sm text-slate-400">Across 4 markets</div>
                  </div>

                  <div className="bg-slate-900/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400 text-sm">AI Score</span>
                      <Brain className="w-4 h-4 text-orange-400" />
                    </div>
                    <div className="text-2xl font-bold text-orange-400">8.7</div>
                    <div className="text-sm text-slate-400">Portfolio health</div>
                  </div>
                </div>

                {/* Chart Placeholder */}
                <div className="bg-slate-900/30 rounded-lg p-4 h-64 flex items-center justify-center border border-slate-700">
                  <div className="text-center">
                    <LineChart className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-400">Portfolio Performance Chart</p>
                    <p className="text-xs text-slate-500">Interactive chart would display here</p>
                  </div>
                </div>
              </div>

              {/* Positions Table */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Current Positions</h3>
                  <button className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
                    <Plus className="w-4 h-4" />
                    <span>New Position</span>
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left py-3 text-slate-400 font-medium">Symbol</th>
                        <th className="text-left py-3 text-slate-400 font-medium">Market</th>
                        <th className="text-right py-3 text-slate-400 font-medium">Quantity</th>
                        <th className="text-right py-3 text-slate-400 font-medium">Avg Price</th>
                        <th className="text-right py-3 text-slate-400 font-medium">Current Price</th>
                        <th className="text-right py-3 text-slate-400 font-medium">P&L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.positions.map((position, index) => (
                        <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                          <td className="py-3">
                            <div className="font-semibold">{position.symbol}</div>
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-1 bg-slate-700 rounded text-xs">{position.market}</span>
                          </td>
                          <td className="py-3 text-right">{formatNumber(position.quantity)}</td>
                          <td className="py-3 text-right">{formatCurrency(position.avgPrice)}</td>
                          <td className="py-3 text-right">{formatCurrency(position.currentPrice)}</td>
                          <td className={`py-3 text-right font-semibold ${
                            position.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {position.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(position.unrealizedPnL)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
              {/* AI Insights */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Brain className="w-5 h-5 text-orange-400" />
                  <h3 className="text-lg font-semibold">AI Insights</h3>
                  <div className="flex items-center space-x-1 text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">
                    <Zap className="w-3 h-3" />
                    <span>Live</span>
                  </div>
                </div>

                <div className="space-y-4">
                  {aiInsights.map((insight, index) => (
                    <div key={index} className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-sm">{insight.symbol}</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            insight.type === 'bullish' ? 'bg-green-600/20 text-green-400' :
                            insight.type === 'bearish' ? 'bg-red-600/20 text-red-400' :
                            'bg-slate-600/20 text-slate-400'
                          }`}>
                            {insight.type.toUpperCase()}
                          </span>
                        </div>
                        <span className="text-xs text-slate-400">{insight.timeframe}</span>
                      </div>
                      <p className="text-sm text-slate-300 mb-2">{insight.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Confidence</span>
                        <div className="flex items-center space-x-2">
                          <div className="w-16 h-1 bg-slate-700 rounded">
                            <div 
                              className={`h-full rounded ${
                                insight.confidence >= 80 ? 'bg-green-400' :
                                insight.confidence >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                              }`}
                              style={{ width: `${insight.confidence}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium">{insight.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Risk Metrics */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
                <div className="flex items-center space-x-2 mb-4">
                  <Shield className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold">Risk Metrics</h3>
                </div>

                <div className="space-y-4">
                  {riskMetrics.map((metric, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                      <div>
                        <div className="text-sm font-medium">{metric.label}</div>
                        <div className="text-xs text-slate-400">
                          {metric.change !== 0 && (
                            <span className={metric.change > 0 ? 'text-red-400' : 'text-green-400'}>
                              {metric.change > 0 ? '+' : ''}{metric.change.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{metric.value}</div>
                        <div className={`w-2 h-2 rounded-full inline-block ${
                          metric.status === 'low' ? 'bg-green-400' :
                          metric.status === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
                        }`} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Market Data */}
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Market Data</h3>
                  <div className="flex items-center space-x-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                    <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                    <span>Live</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredMarketData.slice(0, 6).map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg hover:bg-slate-700/30 transition-colors cursor-pointer">
                      <div>
                        <div className="font-semibold text-sm">{item.symbol}</div>
                        <div className="text-xs text-slate-400 capitalize">{item.market}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold">{formatCurrency(item.price)}</div>
                        <div className={`text-xs flex items-center justify-end ${
                          item.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {item.changePercent >= 0 ? (
                            <TrendingUp className="w-3 h-3 mr-1" />
                          ) : (
                            <TrendingDown className="w-3 h-3 mr-1" />
                          )}
                          {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Positions Tab */}
          {activeView === 'positions' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">Active Positions</h2>
                  <div className="flex items-center space-x-2">
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all">
                      <Plus className="w-4 h-4 inline mr-2" />
                      New Position
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-600/50">
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Symbol</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Side</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Size</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Entry Price</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Current Price</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">P&L</th>
                        <th className="text-left py-3 px-4 text-slate-400 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((position) => (
                        <tr key={position.symbol} className="border-b border-slate-700/30 hover:bg-slate-700/20">
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                                <span className="text-white text-xs font-bold">{position.symbol.slice(0, 2)}</span>
                              </div>
                              <span className="text-white font-medium">{position.symbol}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              position.side === 'long'
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                              {position.side.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-white font-medium">{position.quantity}</td>
                          <td className="py-3 px-4 text-white">${position.avgPrice.toFixed(2)}</td>
                          <td className="py-3 px-4 text-white">${position.currentPrice.toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <span className={`font-bold ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {formatCurrency(position.pnl)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-2">
                              <button className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 transition-all text-xs">
                                Edit
                              </button>
                              <button className="px-3 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-all text-xs">
                                Close
                              </button>
                            </div>
                          </td>
                        </tr>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    </div>
                    <span className="text-green-400 text-sm font-medium">+{performanceMetrics.totalReturn.toFixed(2)}%</span>
                  </div>
                  <div className="text-white text-2xl font-bold mb-1">{performanceMetrics.totalReturn.toFixed(2)}%</div>
                  <div className="text-slate-400 text-sm">Total Return</div>
                </div>

                <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-blue-400 text-sm font-medium">Excellent</span>
                  </div>
                  <div className="text-white text-2xl font-bold mb-1">{performanceMetrics.sharpeRatio.toFixed(2)}</div>
                  <div className="text-slate-400 text-sm">Sharpe Ratio</div>
                </div>

                <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                      <Target className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="text-purple-400 text-sm font-medium">{performanceMetrics.winRate.toFixed(1)}%</span>
                  </div>
                  <div className="text-white text-2xl font-bold mb-1">{performanceMetrics.winRate.toFixed(1)}%</div>
                  <div className="text-slate-400 text-sm">Win Rate</div>
                </div>

                <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                      <Award className="w-5 h-5 text-orange-400" />
                    </div>
                    <span className="text-orange-400 text-sm font-medium">{performanceMetrics.profitFactor.toFixed(2)}x</span>
                  </div>
                  <div className="text-white text-2xl font-bold mb-1">{performanceMetrics.profitFactor.toFixed(2)}</div>
                  <div className="text-slate-400 text-sm">Profit Factor</div>
                </div>
              </div>

              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Performance Breakdown</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Total Trades</span>
                      <span className="text-white font-medium">{performanceMetrics.totalTrades}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Average Win</span>
                      <span className="text-green-400 font-medium">{formatCurrency(performanceMetrics.avgWin)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Average Loss</span>
                      <span className="text-red-400 font-medium">{formatCurrency(performanceMetrics.avgLoss)}</span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Max Drawdown</span>
                      <span className="text-red-400 font-medium">{performanceMetrics.maxDrawdown.toFixed(2)}%</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Profit Factor</span>
                      <span className="text-blue-400 font-medium">{performanceMetrics.profitFactor.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Sharpe Ratio</span>
                      <span className="text-purple-400 font-medium">{performanceMetrics.sharpeRatio.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alerts Tab */}
          {activeView === 'alerts' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-semibold">Trading Alerts</h2>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setTradingAlerts(prev => prev.map(a => ({ ...a, isRead: true })))}
                      className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-all text-sm"
                    >
                      Mark All Read
                    </button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm">
                      <Plus className="w-4 h-4 inline mr-2" />
                      New Alert
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {tradingAlerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border transition-all ${
                        alert.isRead
                          ? 'bg-slate-700/30 border-slate-600/30'
                          : 'bg-slate-700/50 border-slate-600/50'
                      } ${
                        alert.severity === 'critical'
                          ? 'border-l-4 border-l-red-500'
                          : alert.severity === 'high'
                          ? 'border-l-4 border-l-orange-500'
                          : alert.severity === 'medium'
                          ? 'border-l-4 border-l-yellow-500'
                          : 'border-l-4 border-l-blue-500'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            alert.severity === 'critical'
                              ? 'bg-red-500/20'
                              : alert.severity === 'high'
                              ? 'bg-orange-500/20'
                              : alert.severity === 'medium'
                              ? 'bg-yellow-500/20'
                              : 'bg-blue-500/20'
                          }`}>
                            {alert.type === 'price' && <TrendingUp className="w-4 h-4 text-orange-400" />}
                            {alert.type === 'volume' && <BarChart3 className="w-4 h-4 text-blue-400" />}
                            {alert.type === 'technical' && <Activity className="w-4 h-4 text-purple-400" />}
                            {alert.type === 'news' && <Globe className="w-4 h-4 text-green-400" />}
                            {alert.type === 'risk' && <AlertTriangle className="w-4 h-4 text-red-400" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-medium text-white">{alert.symbol}</span>
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                alert.severity === 'critical'
                                  ? 'bg-red-500/20 text-red-400'
                                  : alert.severity === 'high'
                                  ? 'bg-orange-500/20 text-orange-400'
                                  : alert.severity === 'medium'
                                  ? 'bg-yellow-500/20 text-yellow-400'
                                  : 'bg-blue-500/20 text-blue-400'
                              }`}>
                                {alert.severity.toUpperCase()}
                              </span>
                              {!alert.isRead && (
                                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                              )}
                            </div>
                            <p className="text-slate-300 text-sm mb-2">{alert.message}</p>
                            <div className="text-xs text-slate-400">
                              {alert.timestamp.toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setTradingAlerts(prev =>
                            prev.map(a => a.id === alert.id ? { ...a, isRead: true } : a)
                          )}
                          className="text-slate-400 hover:text-white transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TradingDashboard;
