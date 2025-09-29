//clients/pro-terminal/src/components/InstitutionalTools/AlgorithmicTrading.tsx
import React, { useState, useEffect } from 'react';
import {
  Brain,
  Activity,
  TrendingUp,
  Settings,
  Play,
  Pause,
  Square,
  BarChart3,
  Target,
  Zap,
  Clock,
  DollarSign
} from 'lucide-react';

interface Algorithm {
  id: string;
  name: string;
  type: 'TWAP' | 'VWAP' | 'IS' | 'POV' | 'CUSTOM';
  status: 'running' | 'paused' | 'stopped';
  symbol: string;
  quantity: number;
  filled: number;
  avgPrice: number;
  progress: number;
  pnl: number;
  parameters: Record<string, any>;
  startTime: Date;
  estimatedCompletion: Date;
}

interface AlgorithmTemplate {
  id: string;
  name: string;
  type: string;
  description: string;
  parameters: Array<{
    name: string;
    type: 'number' | 'select' | 'boolean';
    default: any;
    options?: string[];
    min?: number;
    max?: number;
  }>;
}

const AlgorithmicTrading: React.FC = () => {
  const [activeAlgorithms, setActiveAlgorithms] = useState<Algorithm[]>([
    {
      id: '1',
      name: 'AAPL TWAP Large Order',
      type: 'TWAP',
      status: 'running',
      symbol: 'AAPL',
      quantity: 10000,
      filled: 6500,
      avgPrice: 175.42,
      progress: 65,
      pnl: 1250.00,
      parameters: { duration: 120, sliceSize: 100 },
      startTime: new Date(Date.now() - 3600000),
      estimatedCompletion: new Date(Date.now() + 1800000)
    },
    {
      id: '2',
      name: 'BTC VWAP Strategy',
      type: 'VWAP',
      status: 'running',
      symbol: 'BTC/USD',
      quantity: 2.5,
      filled: 1.2,
      avgPrice: 43180.50,
      progress: 48,
      pnl: -420.50,
      parameters: { participation: 0.1, aggressiveness: 'medium' },
      startTime: new Date(Date.now() - 1800000),
      estimatedCompletion: new Date(Date.now() + 2700000)
    }
  ]);

  const [algorithmTemplates] = useState<AlgorithmTemplate[]>([
    {
      id: 'twap',
      name: 'Time Weighted Average Price',
      type: 'TWAP',
      description: 'Executes orders evenly over a specified time period',
      parameters: [
        { name: 'duration', type: 'number', default: 60, min: 1, max: 1440 },
        { name: 'sliceSize', type: 'number', default: 100, min: 1, max: 10000 },
        { name: 'randomization', type: 'boolean', default: true }
      ]
    },
    {
      id: 'vwap',
      name: 'Volume Weighted Average Price',
      type: 'VWAP',
      description: 'Executes orders based on historical volume patterns',
      parameters: [
        { name: 'participation', type: 'number', default: 0.1, min: 0.01, max: 0.5 },
        { name: 'aggressiveness', type: 'select', default: 'medium', options: ['low', 'medium', 'high'] },
        { name: 'lookback', type: 'number', default: 20, min: 1, max: 100 }
      ]
    },
    {
      id: 'is',
      name: 'Implementation Shortfall',
      type: 'IS',
      description: 'Minimizes market impact and timing risk',
      parameters: [
        { name: 'riskAversion', type: 'number', default: 0.5, min: 0.1, max: 1.0 },
        { name: 'marketImpact', type: 'number', default: 0.1, min: 0.01, max: 1.0 },
        { name: 'volatility', type: 'number', default: 0.2, min: 0.05, max: 2.0 }
      ]
    }
  ]);

  const [isCreating, setIsCreating] = useState(false);
  const [newAlgorithm, setNewAlgorithm] = useState({
    template: '',
    symbol: '',
    side: 'buy',
    quantity: '',
    parameters: {} as Record<string, any>
  });

  const handleAlgorithmControl = (id: string, action: 'pause' | 'resume' | 'stop') => {
    setActiveAlgorithms(prev => prev.map(algo => {
      if (algo.id === id) {
        let newStatus = algo.status;
        switch (action) {
          case 'pause':
            newStatus = 'paused';
            break;
          case 'resume':
            newStatus = 'running';
            break;
          case 'stop':
            newStatus = 'stopped';
            break;
        }
        return { ...algo, status: newStatus };
      }
      return algo;
    }));
  };

  const handleCreateAlgorithm = () => {
    if (!newAlgorithm.template || !newAlgorithm.symbol || !newAlgorithm.quantity) {
      return;
    }

    const template = algorithmTemplates.find(t => t.id === newAlgorithm.template);
    if (!template) return;

    const algorithm: Algorithm = {
      id: Date.now().toString(),
      name: `${newAlgorithm.symbol} ${template.type}`,
      type: template.type as any,
      status: 'running',
      symbol: newAlgorithm.symbol,
      quantity: parseFloat(newAlgorithm.quantity),
      filled: 0,
      avgPrice: 0,
      progress: 0,
      pnl: 0,
      parameters: newAlgorithm.parameters,
      startTime: new Date(),
      estimatedCompletion: new Date(Date.now() + 3600000)
    };

    setActiveAlgorithms(prev => [...prev, algorithm]);
    setIsCreating(false);
    setNewAlgorithm({
      template: '',
      symbol: '',
      side: 'buy',
      quantity: '',
      parameters: {}
    });
  };

  const formatTimeRemaining = (endTime: Date) => {
    const remaining = endTime.getTime() - Date.now();
    if (remaining <= 0) return 'Completed';
    
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <Brain className="w-6 h-6 text-purple-400" />
          <h2 className="text-xl font-semibold text-white">Algorithmic Trading</h2>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
        >
          <Zap className="w-4 h-4" />
          <span>New Algorithm</span>
        </button>
      </div>

      {/* Active Algorithms */}
      <div className="space-y-4 mb-6">
        {activeAlgorithms.map((algorithm) => (
          <div key={algorithm.id} className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${
                  algorithm.status === 'running' ? 'bg-green-400 animate-pulse' :
                  algorithm.status === 'paused' ? 'bg-yellow-400' : 'bg-red-400'
                }`} />
                <h3 className="font-semibold text-white">{algorithm.name}</h3>
                <span className="px-2 py-1 bg-slate-700 rounded text-xs text-slate-300">
                  {algorithm.type}
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                {algorithm.status === 'running' ? (
                  <button
                    onClick={() => handleAlgorithmControl(algorithm.id, 'pause')}
                    className="p-1 text-yellow-400 hover:bg-slate-700 rounded"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                ) : algorithm.status === 'paused' ? (
                  <button
                    onClick={() => handleAlgorithmControl(algorithm.id, 'resume')}
                    className="p-1 text-green-400 hover:bg-slate-700 rounded"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                ) : null}
                
                <button
                  onClick={() => handleAlgorithmControl(algorithm.id, 'stop')}
                  className="p-1 text-red-400 hover:bg-slate-700 rounded"
                >
                  <Square className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-6 gap-4 mb-3">
              <div>
                <p className="text-xs text-slate-400">Symbol</p>
                <p className="font-semibold text-white">{algorithm.symbol}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Progress</p>
                <div className="flex items-center space-x-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded">
                    <div 
                      className="h-full bg-blue-500 rounded"
                      style={{ width: `${algorithm.progress}%` }}
                    />
                  </div>
                  <span className="text-xs text-white">{algorithm.progress}%</span>
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-400">Filled</p>
                <p className="font-semibold text-white">
                  {algorithm.filled.toLocaleString()} / {algorithm.quantity.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Avg Price</p>
                <p className="font-semibold text-white">${algorithm.avgPrice.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">P&L</p>
                <p className={`font-semibold ${algorithm.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {algorithm.pnl >= 0 ? '+' : ''}${algorithm.pnl.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Time Left</p>
                <p className="font-semibold text-white">
                  {formatTimeRemaining(algorithm.estimatedCompletion)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Started: {algorithm.startTime.toLocaleTimeString()}</span>
              <span>ETA: {algorithm.estimatedCompletion.toLocaleTimeString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Create Algorithm Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Create New Algorithm</h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-6">
              {/* Template Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Algorithm Template
                </label>
                <select
                  value={newAlgorithm.template}
                  onChange={(e) => setNewAlgorithm(prev => ({ 
                    ...prev, 
                    template: e.target.value,
                    parameters: {}
                  }))}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                >
                  <option value="">Select Template</option>
                  {algorithmTemplates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
                {newAlgorithm.template && (
                  <p className="text-xs text-slate-400 mt-1">
                    {algorithmTemplates.find(t => t.id === newAlgorithm.template)?.description}
                  </p>
                )}
              </div>

              {/* Basic Parameters */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Symbol
                  </label>
                  <input
                    type="text"
                    value={newAlgorithm.symbol}
                    onChange={(e) => setNewAlgorithm(prev => ({ ...prev, symbol: e.target.value }))}
                    placeholder="AAPL"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Side
                  </label>
                  <select
                    value={newAlgorithm.side}
                    onChange={(e) => setNewAlgorithm(prev => ({ ...prev, side: e.target.value }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    value={newAlgorithm.quantity}
                    onChange={(e) => setNewAlgorithm(prev => ({ ...prev, quantity: e.target.value }))}
                    placeholder="1000"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                  />
                </div>
              </div>

              {/* Algorithm-specific Parameters */}
              {newAlgorithm.template && (
                <div>
                  <h4 className="text-sm font-medium text-slate-300 mb-3">Algorithm Parameters</h4>
                  <div className="grid grid-cols-2 gap-4">
                    {algorithmTemplates
                      .find(t => t.id === newAlgorithm.template)
                      ?.parameters.map(param => (
                        <div key={param.name}>
                          <label className="block text-sm font-medium text-slate-300 mb-2">
                            {param.name.charAt(0).toUpperCase() + param.name.slice(1)}
                          </label>
                          {param.type === 'number' ? (
                            <input
                              type="number"
                              value={newAlgorithm.parameters[param.name] || param.default}
                              onChange={(e) => setNewAlgorithm(prev => ({
                                ...prev,
                                parameters: {
                                  ...prev.parameters,
                                  [param.name]: parseFloat(e.target.value)
                                }
                              }))}
                              min={param.min}
                              max={param.max}
                              step={param.min && param.min < 1 ? 0.01 : 1}
                              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                            />
                          ) : param.type === 'select' ? (
                            <select
                              value={newAlgorithm.parameters[param.name] || param.default}
                              onChange={(e) => setNewAlgorithm(prev => ({
                                ...prev,
                                parameters: {
                                  ...prev.parameters,
                                  [param.name]: e.target.value
                                }
                              }))}
                              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white"
                            >
                              {param.options?.map(option => (
                                <option key={option} value={option}>
                                  {option.charAt(0).toUpperCase() + option.slice(1)}
                                </option>
                              ))}
                            </select>
                          ) : param.type === 'boolean' ? (
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={newAlgorithm.parameters[param.name] ?? param.default}
                                onChange={(e) => setNewAlgorithm(prev => ({
                                  ...prev,
                                  parameters: {
                                    ...prev.parameters,
                                    [param.name]: e.target.checked
                                  }
                                }))}
                                className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded"
                              />
                              <span className="ml-2 text-sm text-slate-300">Enable</span>
                            </label>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAlgorithm}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Create Algorithm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlgorithmicTrading;