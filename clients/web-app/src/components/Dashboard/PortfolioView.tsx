//clients/web-app/src/components/Dashboard/PortfolioView.tsx
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Eye,
  EyeOff,
  RotateCcw,
  Download,
  Settings
} from 'lucide-react';
import { RootState } from '../../store/store';
import { fetchPortfolio } from '../../store/slices/tradingSlice';

const PortfolioView: React.FC = () => {
  const dispatch = useDispatch();
  const { portfolio, positions } = useSelector((state: RootState) => state.trading);
  const [showBalances, setShowBalances] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1D');
  const [viewMode, setViewMode] = useState<'overview' | 'detailed'>('overview');

  useEffect(() => {
    dispatch(fetchPortfolio() as any);
  }, [dispatch]);

  // Mock performance data
  const performanceData = [
    { time: '9:30', value: 1225000, benchmark: 1220000 },
    { time: '10:00', value: 1232000, benchmark: 1225000 },
    { time: '11:00', value: 1218000, benchmark: 1215000 },
    { time: '12:00', value: 1245000, benchmark: 1235000 },
    { time: '1:00', value: 1250000, benchmark: 1242000 },
    { time: '2:00', value: 1255000, benchmark: 1248000 },
    { time: '3:00', value: 1250000, benchmark: 1245000 }
  ];

  // Allocation data for pie chart
  const allocationData = positions?.reduce((acc, position) => {
    const value = position.quantity * position.currentPrice;
    const existing = acc.find(item => item.market === position.market);
    
    if (existing) {
      existing.value += value;
    } else {
      acc.push({
        name: position.market,
        market: position.market,
        value: value,
        percentage: 0
      });
    }
    return acc;
  }, [] as Array<{ name: string; market: string; value: number; percentage: number }>);

  // Calculate percentages
  const totalValue = allocationData?.reduce((sum, item) => sum + item.value, 0) || 0;
  allocationData?.forEach(item => {
    item.percentage = (item.value / totalValue) * 100;
  });

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y', 'ALL'];

  const formatCurrency = (value: number): string => {
    if (!showBalances) return '••••••';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  if (!portfolio) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-700 rounded w-1/4"></div>
          <div className="h-32 bg-slate-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h2 className="text-xl font-semibold text-white">Portfolio Overview</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setViewMode(viewMode === 'overview' ? 'detailed' : 'overview')}
              className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              {viewMode === 'overview' ? 'Detailed' : 'Overview'}
            </button>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowBalances(!showBalances)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
          >
            {showBalances ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button className="p-2 text-slate-400 hover:text-white transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button className="p-2 text-slate-400 hover:text-white transition-colors">
            <Download className="w-4 h-4" />
          </button>
          <button className="p-2 text-slate-400 hover:text-white transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-6 mb-6">
        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Total Value</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(portfolio.totalValue)}
          </div>
          <div className={`flex items-center text-sm mt-1 ${
            portfolio.dayChangePercent >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {portfolio.dayChangePercent >= 0 ? (
              <TrendingUp className="w-3 h-3 mr-1" />
            ) : (
              <TrendingDown className="w-3 h-3 mr-1" />
            )}
            {showBalances ? formatCurrency(portfolio.dayChange) : '••••'} 
            ({formatPercentage(portfolio.dayChangePercent)})
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Available Cash</span>
            <DollarSign className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {formatCurrency(portfolio.availableCash)}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Buying power ready
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Total P&L</span>
            <Target className="w-4 h-4 text-purple-400" />
          </div>
          <div className={`text-2xl font-bold ${
            portfolio.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {showBalances ? formatCurrency(portfolio.totalPnL) : '••••••'}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            All-time performance
          </div>
        </div>

        <div className="bg-slate-900/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-400 text-sm">Active Positions</span>
            <Target className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {positions?.length || 0}
          </div>
          <div className="text-sm text-slate-400 mt-1">
            Across {new Set(positions?.map(p => p.market)).size || 0} markets
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        {/* Performance Chart */}
        <div className="col-span-8">
          <div className="bg-slate-900/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Performance</h3>
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
            
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="time" stroke="#94a3b8" />
                <YAxis 
                  stroke="#94a3b8"
                  tickFormatter={(value) => showBalances ? `${(value / 1000).toFixed(0)}K` : '••••'}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#ffffff'
                  }}
                  formatter={(value: number, name: string) => [
                    showBalances ? formatCurrency(value) : '••••••',
                    name === 'value' ? 'Portfolio' : 'Benchmark'
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="url(#colorGradient)"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />
                <defs>
                  <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Allocation Chart */}
        <div className="col-span-4">
          <div className="bg-slate-900/30 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-4">Asset Allocation</h3>
            
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {allocationData?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [
                    showBalances ? formatCurrency(value) : '••••••',
                    'Value'
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-2 mt-4">
              {allocationData?.map((item, index) => (
                <div key={item.market} className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="text-slate-300">{item.market}</span>
                  </div>
                  <span className="text-white font-medium">
                    {item.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Positions Table */}
      {viewMode === 'detailed' && (
        <div className="bg-slate-900/30 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Position Details</h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-3 text-slate-400 font-medium">Symbol</th>
                  <th className="text-left py-3 text-slate-400 font-medium">Market</th>
                  <th className="text-right py-3 text-slate-400 font-medium">Quantity</th>
                  <th className="text-right py-3 text-slate-400 font-medium">Avg Price</th>
                  <th className="text-right py-3 text-slate-400 font-medium">Current Price</th>
                  <th className="text-right py-3 text-slate-400 font-medium">Market Value</th>
                  <th className="text-right py-3 text-slate-400 font-medium">P&L</th>
                  <th className="text-right py-3 text-slate-400 font-medium">% Change</th>
                </tr>
              </thead>
              <tbody>
                {positions?.map((position, index) => {
                  const marketValue = position.quantity * position.currentPrice;
                  const totalCost = position.quantity * position.avgPrice;
                  const percentChange = ((position.currentPrice - position.avgPrice) / position.avgPrice) * 100;
                  
                  return (
                    <tr key={index} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="py-3">
                        <div className="font-semibold text-white">{position.symbol}</div>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                          {position.market}
                        </span>
                      </td>
                      <td className="py-3 text-right text-white">
                        {position.quantity.toLocaleString()}
                      </td>
                      <td className="py-3 text-right text-white">
                        {showBalances ? formatCurrency(position.avgPrice) : '••••'}
                      </td>
                      <td className="py-3 text-right text-white">
                        {showBalances ? formatCurrency(position.currentPrice) : '••••'}
                      </td>
                      <td className="py-3 text-right text-white font-semibold">
                        {showBalances ? formatCurrency(marketValue) : '••••••'}
                      </td>
                      <td className={`py-3 text-right font-semibold ${
                        position.unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {showBalances ? (
                          `${position.unrealizedPnL >= 0 ? '+' : ''}${formatCurrency(position.unrealizedPnL)}`
                        ) : '••••'}
                      </td>
                      <td className={`py-3 text-right font-semibold ${
                        percentChange >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioView;