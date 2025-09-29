import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Target, 
  Activity, 
  BarChart3,
  Clock,
  Zap,
  Brain,
  Settings,
  Monitor,
  Layers,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  Pause,
  Play,
  Square,
  Eye,
  EyeOff,
  Maximize2,
  Minimize2,
  RefreshCw
} from 'lucide-react';

// /clients/pro-terminal/src/components/AlgorithmicTrading/TWAPExecutor.tsx
interface TWAPOrder {
  symbol: string;
  side: 'buy' | 'sell';
  totalQuantity: number;
  duration: number; // minutes
  startTime: Date;
  endTime: Date;
  sliceSize: number;
  executedQuantity: number;
  avgPrice: number;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
}

const TWAPExecutor: React.FC = () => {
  const [orders, setOrders] = useState<TWAPOrder[]>([]);
  const [newOrder, setNewOrder] = useState({
    symbol: 'AAPL',
    side: 'buy' as 'buy' | 'sell',
    totalQuantity: 10000,
    duration: 60,
    startTime: new Date(),
    endTime: new Date(Date.now() + 60 * 60 * 1000)
  });

  const calculateSliceSize = (totalQty: number, duration: number): number => {
    const slicesPerMinute = 4; // Execute every 15 seconds
    const totalSlices = duration * slicesPerMinute;
    return Math.ceil(totalQty / totalSlices);
  };

  const submitTWAPOrder = () => {
    const order: TWAPOrder = {
      ...newOrder,
      sliceSize: calculateSliceSize(newOrder.totalQuantity, newOrder.duration),
      executedQuantity: 0,
      avgPrice: 0,
      status: 'pending'
    };
    
    setOrders(prev => [order, ...prev]);
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center">
          <Clock className="w-5 h-5 mr-2 text-blue-400" />
          TWAP Execution
        </h3>
        <div className="text-sm text-slate-400">
          Time-Weighted Average Price Algorithm
        </div>
      </div>

      {/* Order Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Symbol</label>
          <input
            type="text"
            value={newOrder.symbol}
            onChange={(e) => setNewOrder({ ...newOrder, symbol: e.target.value.toUpperCase() })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Side</label>
          <select
            value={newOrder.side}
            onChange={(e) => setNewOrder({ ...newOrder, side: e.target.value as 'buy' | 'sell' })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Total Quantity</label>
          <input
            type="number"
            value={newOrder.totalQuantity}
            onChange={(e) => setNewOrder({ ...newOrder, totalQuantity: parseInt(e.target.value) || 0 })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Duration (min)</label>
          <input
            type="number"
            value={newOrder.duration}
            onChange={(e) => setNewOrder({ ...newOrder, duration: parseInt(e.target.value) || 0 })}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Order Preview */}
      <div className="bg-slate-700 rounded-lg p-4 mb-6">
        <h4 className="font-semibold mb-2">Order Preview</h4>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-slate-400">Slice Size:</span>
            <span className="ml-2 font-semibold">{calculateSliceSize(newOrder.totalQuantity, newOrder.duration).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-slate-400">Slices:</span>
            <span className="ml-2 font-semibold">{Math.ceil(newOrder.totalQuantity / calculateSliceSize(newOrder.totalQuantity, newOrder.duration))}</span>
          </div>
          <div>
            <span className="text-slate-400">Interval:</span>
            <span className="ml-2 font-semibold">15s</span>
          </div>
        </div>
      </div>

      <button
        onClick={submitTWAPOrder}
        className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-semibold transition-colors"
      >
        Submit TWAP Order
      </button>

      {/* Active Orders */}
      {orders.length > 0 && (
        <div className="mt-6">
          <h4 className="font-semibold mb-4">Active TWAP Orders</h4>
          <div className="space-y-3">
            {orders.map((order, index) => (
              <div key={index} className="bg-slate-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="font-semibold">{order.symbol}</span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      order.side === 'buy' ? 'bg-green-600' : 'bg-red-600'
                    }`}>
                      {order.side.toUpperCase()}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${
                      order.status === 'active' ? 'bg-blue-600' :
                      order.status === 'completed' ? 'bg-green-600' :
                      order.status === 'cancelled' ? 'bg-red-600' : 'bg-yellow-600'
                    }`}>
                      {order.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex space-x-2">
                    <button className="p-1 text-slate-400 hover:text-white">
                      <Pause className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-slate-400 hover:text-white">
                      <Square className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400">Progress</div>
                    <div className="font-semibold">
                      {order.executedQuantity.toLocaleString()} / {order.totalQuantity.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400">Avg Price</div>
                    <div className="font-semibold">${order.avgPrice.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Duration</div>
                    <div className="font-semibold">{order.duration}m</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Slice Size</div>
                    <div className="font-semibold">{order.sliceSize.toLocaleString()}</div>
                  </div>
                </div>

                <div className="mt-2 w-full bg-slate-600 rounded-full h-2">
                  <div 
                    className="bg-blue-400 h-2 rounded-full transition-all"
                    style={{ width: `${(order.executedQuantity / order.totalQuantity) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Professional Level 2 Data Component
const Level2DataComponent: React.FC = () => {
  const [symbol, setSymbol] = useState('AAPL');
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  // Mock Level 2 data
  const [level2Data] = useState({
    bids: [
      { price: 175.84, size: 500, count: 3, exchange: 'NASDAQ' },
      { price: 175.83, size: 800, count: 5, exchange: 'NYSE' },
      { price: 175.82, size: 1200, count: 8, exchange: 'BATS' },
      { price: 175.81, size: 600, count: 4, exchange: 'EDGX' },
      { price: 175.80, size: 900, count: 6, exchange: 'NASDAQ' },
      { price: 175.79, size: 400, count: 2, exchange: 'IEX' },
      { price: 175.78, size: 1100, count: 7, exchange: 'NYSE' },
      { price: 175.77, size: 700, count: 5, exchange: 'ARCA' }
    ],
    asks: [
      { price: 175.85, size: 400, count: 2, exchange: 'NASDAQ' },
      { price: 175.86, size: 750, count: 4, exchange: 'NYSE' },
      { price: 175.87, size: 1100, count: 6, exchange: 'BATS' },
      { price: 175.88, size: 550, count: 3, exchange: 'EDGX' },
      { price: 175.89, size: 850, count: 5, exchange: 'NASDAQ' },
      { price: 175.90, size: 300, count: 1, exchange: 'IEX' },
      { price: 175.91, size: 950, count: 7, exchange: 'NYSE' },
      { price: 175.92, size: 650, count: 4, exchange: 'ARCA' }
    ]
  });

  const maxSize = Math.max(
    ...level2Data.bids.map(b => b.size),
    ...level2Data.asks.map(a => a.size)
  );

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center">
          <BarChart3 className="w-5 h-5 mr-2 text-purple-400" />
          Level II Market Depth
        </h3>
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1 text-sm w-20"
          />
          <button
            onClick={() => setIsSubscribed(!isSubscribed)}
            className={`px-3 py-1 rounded text-sm ${
              isSubscribed ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Bids */}
        <div>
          <div className="text-green-400 font-semibold mb-3 flex items-center justify-between">
            <span>Bids</span>
            <div className="text-xs text-slate-400">Price | Size | Count | Exchange</div>
          </div>
          <div className="space-y-1">
            {level2Data.bids.map((bid, index) => (
              <div key={index} className="relative">
                <div 
                  className="absolute inset-0 bg-green-600/10 rounded"
                  style={{ width: `${(bid.size / maxSize) * 100}%` }}
                />
                <div className="relative flex justify-between items-center p-2 text-sm hover:bg-slate-700/50 rounded">
                  <span className="text-green-400 font-mono">{bid.price.toFixed(2)}</span>
                  <span className="font-mono">{bid.size}</span>
                  <span className="text-slate-400">{bid.count}</span>
                  <span className="text-xs text-slate-500">{bid.exchange}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Asks */}
        <div>
          <div className="text-red-400 font-semibold mb-3 flex items-center justify-between">
            <span>Asks</span>
            <div className="text-xs text-slate-400">Price | Size | Count | Exchange</div>
          </div>
          <div className="space-y-1">
            {level2Data.asks.map((ask, index) => (
              <div key={index} className="relative">
                <div 
                  className="absolute inset-0 bg-red-600/10 rounded"
                  style={{ width: `${(ask.size / maxSize) * 100}%` }}
                />
                <div className="relative flex justify-between items-center p-2 text-sm hover:bg-slate-700/50 rounded">
                  <span className="text-red-400 font-mono">{ask.price.toFixed(2)}</span>
                  <span className="font-mono">{ask.size}</span>
                  <span className="text-slate-400">{ask.count}</span>
                  <span className="text-xs text-slate-500">{ask.exchange}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Market Statistics */}
      <div className="mt-6 pt-4 border-t border-slate-700">
        <div className="grid grid-cols-4 gap-4 text-sm">
          <div className="text-center">
            <div className="text-slate-400">Spread</div>
            <div className="font-semibold">$0.01</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">Mid Price</div>
            <div className="font-semibold">$175.845</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">Total Bid Vol</div>
            <div className="font-semibold">6,150</div>
          </div>
          <div className="text-center">
            <div className="text-slate-400">Total Ask Vol</div>
            <div className="font-semibold">5,995</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Low Latency Trading Interface
const LowLatencyTradingInterface: React.FC = () => {
  const [latencyMetrics, setLatencyMetrics] = useState({
    marketData: 0.8,
    orderEntry: 1.2,
    execution: 0.6,
    riskCheck: 0.3
  });

  const [coLocationStatus] = useState({
    nyse: { connected: true, latency: 0.12 },
    nasdaq: { connected: true, latency: 0.08 },
    bats: { connected: true, latency: 0.15 },
    iex: { connected: false, latency: 0 }
  });

  useEffect(() => {
    // Simulate real-time latency updates
    const interval = setInterval(() => {
      setLatencyMetrics(prev => ({
        marketData: prev.marketData + (Math.random() - 0.5) * 0.1,
        orderEntry: prev.orderEntry + (Math.random() - 0.5) * 0.2,
        execution: prev.execution + (Math.random() - 0.5) * 0.1,
        riskCheck: prev.riskCheck + (Math.random() - 0.5) * 0.05
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const getLatencyColor = (latency: number): string => {
    if (latency < 1) return 'text-green-400';
    if (latency < 2) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold flex items-center">
          <Zap className="w-5 h-5 mr-2 text-yellow-400" />
          Low Latency Trading
        </h3>
        <div className="flex items-center space-x-2 text-sm">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-green-400">Ultra-Low Latency Mode</span>
        </div>
      </div>

      {/* Latency Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-700 rounded-lg p-4 text-center">
          <div className="text-slate-400 text-sm mb-1">Market Data</div>
          <div className={`text-xl font-bold ${getLatencyColor(latencyMetrics.marketData)}`}>
            {latencyMetrics.marketData.toFixed(1)}ms
          </div>
        </div>
        <div className="bg-slate-700 rounded-lg p-4 text-center">
          <div className="text-slate-400 text-sm mb-1">Order Entry</div>
          <div className={`text-xl font-bold ${getLatencyColor(latencyMetrics.orderEntry)}`}>
            {latencyMetrics.orderEntry.toFixed(1)}ms
          </div>
        </div>
        <div className="bg-slate-700 rounded-lg p-4 text-center">
          <div className="text-slate-400 text-sm mb-1">Execution</div>
          <div className={`text-xl font-bold ${getLatencyColor(latencyMetrics.execution)}`}>
            {latencyMetrics.execution.toFixed(1)}ms
          </div>
        </div>
        <div className="bg-slate-700 rounded-lg p-4 text-center">
          <div className="text-slate-400 text-sm mb-1">Risk Check</div>
          <div className={`text-xl font-bold ${getLatencyColor(latencyMetrics.riskCheck)}`}>
            {latencyMetrics.riskCheck.toFixed(1)}ms
          </div>
        </div>
      </div>

      {/* Co-location Status */}
      <div className="mb-6">
        <h4 className="font-semibold mb-3">Co-location Status</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(coLocationStatus).map(([exchange, status]) => (
            <div key={exchange} className="bg-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sm">{exchange.toUpperCase()}</span>
                <div className={`w-2 h-2 rounded-full ${
                  status.connected ? 'bg-green-400' : 'bg-red-400'
                }`} />
              </div>
              <div className="text-xs text-slate-400">
                {status.connected ? `${status.latency.toFixed(2)}ms` : 'Disconnected'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Order Panel */}
      <div className="bg-slate-700 rounded-lg p-4">
        <h4 className="font-semibold mb-3">Ultra-Fast Order Entry</h4>
        <div className="grid grid-cols-6 gap-2">
          <input 
            type="text" 
            placeholder="SYMBOL" 
            className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm"
          />
          <select className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm">
            <option>BUY</option>
            <option>SELL</option>
          </select>
          <input 
            type="number" 
            placeholder="QTY" 
            className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm"
          />
          <input 
            type="number" 
            placeholder="PRICE" 
            className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm"
          />
          <select className="bg-slate-600 border border-slate-500 rounded px-2 py-1 text-sm">
            <option>LIMIT</option>
            <option>MARKET</option>
            <option>STOP</option>
          </select>
          <button className="bg-blue-600 hover:bg-blue-700 rounded px-2 py-1 text-sm font-semibold">
            SEND
          </button>
        </div>
        <div className="text-xs text-slate-400 mt-2">
          Keyboard shortcuts: F1=BUY, F2=SELL, F3=CANCEL ALL
        </div>
      </div>
    </div>
  );
};

// Main Professional Trading Terminal
const ProfessionalTradingTerminal: React.FC = () => {
  const [activeLayout, setActiveLayout] = useState<'standard' | 'algo' | 'options' | 'futures'>('standard');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const layouts = [
    { id: 'standard', name: 'Standard', icon: Monitor },
    { id: 'algo', name: 'Algorithmic', icon: Brain },
    { id: 'options', name: 'Options', icon: Target },
    { id: 'futures', name: 'Futures', icon: TrendingUp }
  ];

  return (
    <div className={`min-h-screen bg-slate-900 text-white ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold">Professional Terminal</h1>
          </div>

          <div className="flex space-x-1 bg-slate-700 rounded-lg p-1">
            {layouts.map((layout) => {
              const Icon = layout.icon;
              return (
                <button
                  key={layout.id}
                  onClick={() => setActiveLayout(layout.id as any)}
                  className={`flex items-center space-x-2 px-3 py-1 rounded transition-colors ${
                    activeLayout === layout.id
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm">{layout.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="text-sm text-slate-400">
            Market: <span className="text-green-400">OPEN</span> | 
            Latency: <span className="text-green-400">0.8ms</span>
          </div>
          
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-slate-400 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Terminal Content */}
      <div className="p-6 space-y-6 overflow-auto" style={{ height: 'calc(100vh - 80px)' }}>
        {activeLayout === 'standard' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Level2DataComponent />
            <LowLatencyTradingInterface />
          </div>
        )}

        {activeLayout === 'algo' && (
          <div className="space-y-6">
            <TWAPExecutor />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* VWAP Component would go here */}
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">VWAP Execution</h3>
                <p className="text-slate-400">Volume-Weighted Average Price algorithm component</p>
              </div>
              
              {/* Implementation Shortfall Component would go here */}
              <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
                <h3 className="text-lg font-semibold mb-4">Implementation Shortfall</h3>
                <p className="text-slate-400">Minimize market impact and timing risk</p>
              </div>
            </div>
          </div>
        )}

        {activeLayout === 'options' && (
          <div className="text-center py-12">
            <Target className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Options Trading Module</h3>
            <p className="text-slate-500">Advanced options analysis and trading tools</p>
          </div>
        )}

        {activeLayout === 'futures' && (
          <div className="text-center py-12">
            <TrendingUp className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-400 mb-2">Futures Trading Module</h3>
            <p className="text-slate-500">Futures contracts and derivatives trading</p>
          </div>
        )}

        {/* Performance Monitoring */}
        <div className="bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Activity className="w-5 h-5 mr-2 text-green-400" />
            System Performance Monitor
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">99.97%</div>
              <div className="text-sm text-slate-400">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">2.1ms</div>
              <div className="text-sm text-slate-400">Avg Latency</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">847</div>
              <div className="text-sm text-slate-400">Orders/sec</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-400">12.4K</div>
              <div className="text-sm text-slate-400">Quotes/sec</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">0</div>
              <div className="text-sm text-slate-400">Errors</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalTradingTerminal;