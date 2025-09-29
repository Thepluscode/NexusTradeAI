//clients/web-app/src/components/Analytics/PerformanceCharts.tsx
import React, { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ComposedChart
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  Settings,
  BarChart3,
  PieChart as PieChartIcon,
  Activity,
  Target
} from 'lucide-react';

interface PerformanceData {
  date: string;
  portfolioValue: number;
  benchmarkValue: number;
  dailyReturn: number;
  cumulativeReturn: number;
  drawdown: number;
  volume: number;
  sharpeRatio: number;
}

interface MetricCard {
  title: string;
  value: string;
  change: number;
  icon: React.ComponentType<any>;
  color: string;
}

const PerformanceCharts: React.FC = () => {
  const [timeframe, setTimeframe] = useState('1M');
  const [chartType, setChartType] = useState<'line' | 'area' | 'bar'>('area');
  const [selectedMetrics, setSelectedMetrics] = useState(['portfolio', 'benchmark']);
  const [data, setData] = useState<PerformanceData[]>([]);

  // Mock performance data
  useEffect(() => {
    const generateData = () => {
      const days = timeframe === '1W' ? 7 : timeframe === '1M' ? 30 : timeframe === '3M' ? 90 : 365;
      const mockData: PerformanceData[] = [];
      let portfolioValue = 1000000;
      let benchmarkValue = 1000000;
      let cumulativeReturn = 0;
      
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - i));
        
        const dailyReturn = (Math.random() - 0.48) * 0.04; // Slightly positive bias
        const benchmarkReturn = (Math.random() - 0.5) * 0.03;
        
        portfolioValue *= (1 + dailyReturn);
        benchmarkValue *= (1 + benchmarkReturn);
        cumulativeReturn += dailyReturn;
        
        const drawdown = Math.min(0, (portfolioValue / Math.max(...mockData.map(d => d.portfolioValue), portfolioValue) - 1) * 100);
        
        mockData.push({
          date: date.toISOString().split('T')[0],
          portfolioValue,
          benchmarkValue,
          dailyReturn: dailyReturn * 100,
          cumulativeReturn: cumulativeReturn * 100,
          drawdown,
          volume: Math.floor(Math.random() * 1000000) + 500000,
          sharpeRatio: Math.random() * 2 + 0.5
        });
      }
      
      return mockData;
    };

    setData(generateData());
  }, [timeframe]);

  const timeframes = ['1W', '1M', '3M', '6M', '1Y', 'ALL'];
  const chartTypes = [
    { type: 'area', icon: Activity, label: 'Area' },
    { type: 'line', icon: TrendingUp, label: 'Line' },
    { type: 'bar', icon: BarChart3, label: 'Bar' }
  ];

  const latestData = data[data.length - 1];
  const performanceMetrics: MetricCard[] = [
    {
      title: 'Total Return',
      value: `${latestData?.cumulativeReturn.toFixed(2)}%`,
      change: latestData?.dailyReturn || 0,
      icon: TrendingUp,
      color: 'text-green-400'
    },
    {
      title: 'Sharpe Ratio',
      value: latestData?.sharpeRatio.toFixed(2) || '0.00',
      change: 0.15,
      icon: Target,
      color: 'text-blue-400'
    },
    {
      title: 'Max Drawdown',
      value: `${Math.min(...data.map(d => d.drawdown)).toFixed(2)}%`,
      change: -2.1,
      icon: TrendingDown,
      color: 'text-red-400'
    },
    {
      title: 'Win Rate',
      value: '67.3%',
      change: 2.4,
      icon: Target,
      color: 'text-purple-400'
    }
  ];

  const formatCurrency = (value: number) => `${(value / 1000).toFixed(0)}K`;
  const formatPercent = (value: number) => `${value.toFixed(2)}%`;

  const renderChart = () => {
    const commonProps = {
      data,
      margin: { top: 5, right: 30, left: 20, bottom: 5 }
    };

    switch (chartType) {
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8"
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis 
              stroke="#94a3b8"
              tickFormatter={formatCurrency}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#ffffff'
              }}
              formatter={(value: number, name: string) => [
                name === 'portfolioValue' ? formatCurrency(value) : value.toFixed(2),
                name === 'portfolioValue' ? 'Portfolio' : 'Benchmark'
              ]}
            />
            {selectedMetrics.includes('portfolio') && (
              <Area
                type="monotone"
                dataKey="portfolioValue"
                stroke="#3b82f6"
                fill="url(#colorGradient)"
                strokeWidth={2}
              />
            )}
            {selectedMetrics.includes('benchmark') && (
              <Area
                type="monotone"
                dataKey="benchmarkValue"
                stroke="#94a3b8"
                fill="url(#benchmarkGradient)"
                strokeWidth={1}
                fillOpacity={0.3}
              />
            )}
            <defs>
              <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="benchmarkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2}/>
                <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
              </linearGradient>
            </defs>
          </AreaChart>
        );
      
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8"
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis 
              stroke="#94a3b8"
              tickFormatter={formatCurrency}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#ffffff'
              }}
            />
            {selectedMetrics.includes('portfolio') && (
              <Line
                type="monotone"
                dataKey="portfolioValue"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            )}
            {selectedMetrics.includes('benchmark') && (
              <Line
                type="monotone"
                dataKey="benchmarkValue"
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
              />
            )}
          </LineChart>
        );
      
      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="date" 
              stroke="#94a3b8"
              tickFormatter={(value) => new Date(value).toLocaleDateString()}
            />
            <YAxis 
              stroke="#94a3b8"
              tickFormatter={formatPercent}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#ffffff'
              }}
            />
            <Bar 
              dataKey="dailyReturn" 
              fill="#3b82f6"
              opacity={0.8}
            />
          </BarChart>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Performance Metrics Cards */}
      <div className="grid grid-cols-4 gap-6">
        {performanceMetrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <div key={index} className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-slate-400 text-sm">{metric.title}</span>
                <Icon className={`w-5 h-5 ${metric.color}`} />
              </div>
              <div className="text-2xl font-bold text-white mb-2">
                {metric.value}
              </div>
              <div className={`flex items-center text-sm ${
                metric.change >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {metric.change >= 0 ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {metric.change >= 0 ? '+' : ''}{metric.change.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Chart */}
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Performance Analysis</h2>
          
          <div className="flex items-center space-x-4">
            {/* Chart Type Selector */}
            <div className="flex items-center space-x-1 bg-slate-700 rounded-lg p-1">
              {chartTypes.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => setChartType(type as any)}
                  className={`p-2 rounded transition-colors ${
                    chartType === type 
                      ? 'bg-slate-600 text-white' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>

            {/* Timeframe Selector */}
            <div className="flex space-x-1">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    timeframe === tf
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button className="p-2 text-slate-400 hover:text-white transition-colors">
                <Download className="w-4 h-4" />
              </button>
              <button className="p-2 text-slate-400 hover:text-white transition-colors">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center space-x-6 mb-4">
          {[
            { key: 'portfolio', label: 'Portfolio', color: '#3b82f6' },
            { key: 'benchmark', label: 'Benchmark', color: '#94a3b8' }
          ].map(({ key, label, color }) => (
            <label key={key} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedMetrics.includes(key)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedMetrics(prev => [...prev, key]);
                  } else {
                    setSelectedMetrics(prev => prev.filter(m => m !== key));
                  }
                }}
                className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded"
              />
              <div className="flex items-center space-x-2">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-sm text-slate-300">{label}</span>
              </div>
            </label>
          ))}
        </div>

        {/* Chart */}
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Additional Charts */}
      <div className="grid grid-cols-2 gap-6">
        {/* Drawdown Chart */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Drawdown Analysis</h3>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="date" 
                stroke="#94a3b8"
                tickFormatter={(value) => new Date(value).toLocaleDateString()}
              />
              <YAxis 
                stroke="#94a3b8"
                tickFormatter={formatPercent}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#ffffff'
                }}
              />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Daily Returns Distribution */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Daily Returns</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="date" 
                stroke="#94a3b8"
                tickFormatter={(value) => new Date(value).getDate().toString()}
              />
              <YAxis 
                stroke="#94a3b8"
                tickFormatter={formatPercent}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#ffffff'
                }}
              />
              <Bar 
                dataKey="dailyReturn"
                fill={(entry: any) => entry.dailyReturn >= 0 ? '#10b981' : '#ef4444'}
              >
                {data.slice(-30).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.dailyReturn >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default PerformanceCharts;