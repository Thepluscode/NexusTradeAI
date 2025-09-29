//clients/pro-terminal/src/components/AdvancedCharts/TradingChart.tsx
import React, { useState, useEffect, useRef } from 'react';
import {
  LineChart,
  Line,
  CandlestickChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Brush
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Layers,
  Settings,
  Maximize2,
  Volume2,
  Brain,
  Target
} from 'lucide-react';

interface ChartData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TechnicalIndicator {
  id: string;
  name: string;
  type: 'overlay' | 'oscillator';
  enabled: boolean;
  parameters: Record<string, number>;
}

interface TradingChartProps {
  symbol: string;
  data: ChartData[];
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
}

const TradingChart: React.FC<TradingChartProps> = ({
  symbol,
  data,
  timeframe,
  onTimeframeChange
}) => {
  const [chartType, setChartType] = useState<'candlestick' | 'line' | 'area'>('candlestick');
  const [indicators, setIndicators] = useState<TechnicalIndicator[]>([
    { id: 'sma20', name: 'SMA (20)', type: 'overlay', enabled: false, parameters: { period: 20 } },
    { id: 'sma50', name: 'SMA (50)', type: 'overlay', enabled: false, parameters: { period: 50 } },
    { id: 'ema12', name: 'EMA (12)', type: 'overlay', enabled: false, parameters: { period: 12 } },
    { id: 'rsi', name: 'RSI (14)', type: 'oscillator', enabled: false, parameters: { period: 14 } },
    { id: 'macd', name: 'MACD', type: 'oscillator', enabled: false, parameters: {} }
  ]);
  const [aiSignals, setAiSignals] = useState<any[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [crosshair, setCrosshair] = useState<{ x: number; y: number } | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);

  const timeframes = [
    { value: '1m', label: '1M' },
    { value: '5m', label: '5M' },
    { value: '15m', label: '15M' },
    { value: '1h', label: '1H' },
    { value: '4h', label: '4H' },
    { value: '1d', label: '1D' },
    { value: '1w', label: '1W' },
    { value: '1mo', label: '1M' }
  ];

  const toggleIndicator = (indicatorId: string) => {
    setIndicators(prev => prev.map(ind => 
      ind.id === indicatorId ? { ...ind, enabled: !ind.enabled } : ind
    ));
  };

  const calculateSMA = (data: ChartData[], period: number) => {
    return data.map((item, index) => {
      if (index < period - 1) return { ...item, sma: null };
      
      const sum = data.slice(index - period + 1, index + 1)
        .reduce((acc, curr) => acc + curr.close, 0);
      return { ...item, sma: sum / period };
    });
  };

  const processedData = React.useMemo(() => {
    let processed = [...data];
    
    indicators.forEach(indicator => {
      if (indicator.enabled) {
        switch (indicator.id) {
          case 'sma20':
            processed = calculateSMA(processed, 20);
            break;
          case 'sma50':
            processed = calculateSMA(processed, 50);
            break;
          // Add more indicator calculations
        }
      }
    });
    
    return processed;
  }, [data, indicators]);

  const formatPrice = (value: number) => `$${value.toFixed(2)}`;
  const formatVolume = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toString();
  };

  return (
    <div className={`bg-slate-900 border border-slate-700 rounded-lg ${isFullscreen ? 'fixed inset-0 z-50' : 'h-96'}`}>
      {/* Chart Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center space-x-4">
          <h3 className="text-lg font-semibold text-white">{symbol}</h3>
          <div className="flex items-center space-x-1">
            {timeframes.map((tf) => (
              <button
                key={tf.value}
                onClick={() => onTimeframeChange(tf.value)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  timeframe === tf.value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Chart Type */}
          <div className="flex items-center space-x-1 bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setChartType('candlestick')}
              className={`p-2 rounded transition-colors ${
                chartType === 'candlestick' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartType('line')}
              className={`p-2 rounded transition-colors ${
                chartType === 'line' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4" />
            </button>
          </div>

          {/* Indicators */}
          <div className="relative group">
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <Layers className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-10 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <div className="p-4">
                <h4 className="text-sm font-semibold text-white mb-3">Technical Indicators</h4>
                {indicators.map((indicator) => (
                  <label key={indicator.id} className="flex items-center space-x-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={indicator.enabled}
                      onChange={() => toggleIndicator(indicator.id)}
                      className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">{indicator.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Volume Toggle */}
          <button
            onClick={() => setShowVolume(!showVolume)}
            className={`p-2 rounded-lg transition-colors ${
              showVolume ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <Volume2 className="w-4 h-4" />
          </button>

          {/* AI Signals */}
          <button className="p-2 text-orange-400 hover:text-orange-300 hover:bg-slate-700 rounded-lg transition-colors">
            <Brain className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Chart Area */}
      <div className="p-4 h-full">
        <ResponsiveContainer width="100%" height="80%">
          {chartType === 'candlestick' ? (
            <CandlestickChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="timestamp"
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                stroke="#94a3b8"
              />
              <YAxis 
                domain={['dataMin - 5', 'dataMax + 5']}
                tickFormatter={formatPrice}
                stroke="#94a3b8"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
                        <p className="text-slate-300">
                          {new Date(label).toLocaleString()}
                        </p>
                        <p className="text-white">O: {formatPrice(data.open)}</p>
                        <p className="text-white">H: {formatPrice(data.high)}</p>
                        <p className="text-white">L: {formatPrice(data.low)}</p>
                        <p className="text-white">C: {formatPrice(data.close)}</p>
                        <p className="text-slate-300">Vol: {formatVolume(data.volume)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              
              {/* SMA Lines */}
              {indicators.find(ind => ind.id === 'sma20' && ind.enabled) && (
                <Line type="monotone" dataKey="sma20" stroke="#3b82f6" strokeWidth={1} dot={false} />
              )}
              {indicators.find(ind => ind.id === 'sma50' && ind.enabled) && (
                <Line type="monotone" dataKey="sma50" stroke="#ef4444" strokeWidth={1} dot={false} />
              )}
              
              {/* AI Signals */}
              {aiSignals.map((signal, index) => (
                <ReferenceLine
                  key={index}
                  x={signal.timestamp}
                  stroke={signal.type === 'buy' ? '#10b981' : '#ef4444'}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              ))}
            </CandlestickChart>
          ) : (
            <LineChart data={processedData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="timestamp"
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                stroke="#94a3b8"
              />
              <YAxis 
                domain={['dataMin - 5', 'dataMax + 5']}
                tickFormatter={formatPrice}
                stroke="#94a3b8"
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 text-sm">
                        <p className="text-slate-300">
                          {new Date(label).toLocaleString()}
                        </p>
                        <p className="text-white">Price: {formatPrice(payload[0].value as number)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Line 
                type="monotone" 
                dataKey="close" 
                stroke="#3b82f6" 
                strokeWidth={2} 
                dot={false}
                fill="url(#colorGradient)"
              />
              <defs>
                <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
            </LineChart>
          )}
        </ResponsiveContainer>

        {/* Volume Chart */}
        {showVolume && (
          <ResponsiveContainer width="100%" height="20%">
            <BarChart data={processedData}>
              <XAxis 
                dataKey="timestamp"
                tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                stroke="#94a3b8"
              />
              <YAxis 
                tickFormatter={formatVolume}
                stroke="#94a3b8"
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-slate-800 border border-slate-600 rounded-lg p-2 text-sm">
                        <p className="text-white">Volume: {formatVolume(payload[0].value as number)}</p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="volume" fill="#64748b" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default TradingChart;