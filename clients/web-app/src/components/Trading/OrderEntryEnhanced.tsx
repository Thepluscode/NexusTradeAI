// Enhanced Order Entry with all professional trading features

import React, { useState, useCallback } from 'react';
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
  Activity
} from 'lucide-react';

interface OrderEntryEnhancedProps {
  symbol?: string;
  currentPrice?: number;
  onOrderSubmit?: (order: any) => void;
}

interface OrderData {
  symbol: string;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit' | 'stop' | 'stop-limit' | 'bracket' | 'oco';
  assetType: 'stocks' | 'crypto' | 'forex' | 'options';
  quantity: number;
  limitPrice: number;
  stopPrice: number;
  timeInForce: 'DAY' | 'GTC' | 'IOC' | 'FOK';
  reduceOnly: boolean;
  postOnly: boolean;
  // Options specific
  optionType?: 'call' | 'put';
  strike?: number;
  expiration?: string;
  // Bracket/OCO orders
  takeProfitPrice?: number;
  stopLossPrice?: number;
  // Position sizing
  riskAmount?: number;
  riskPercentage: number;
}

interface OrderHistoryItem {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  orderType: string;
  quantity: number;
  price: number;
  status: 'filled' | 'partial' | 'cancelled' | 'pending';
  timestamp: string;
  value: number;
}

const OrderEntryEnhanced: React.FC<OrderEntryEnhancedProps> = ({
  symbol = 'AAPL',
  currentPrice = 175.84,
  onOrderSubmit
}) => {
  const [orderData, setOrderData] = useState<OrderData>({
    symbol,
    side: 'buy',
    orderType: 'market',
    assetType: 'stocks',
    quantity: 0,
    limitPrice: currentPrice,
    stopPrice: currentPrice,
    timeInForce: 'DAY',
    reduceOnly: false,
    postOnly: false,
    riskPercentage: 2
  });

  const [balanceVisible, setBalanceVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'order' | 'options' | 'bracket' | 'sizing' | 'history'>('order');
  
  const buyingPower = 250000;
  const position = { quantity: 500, avgPrice: 165.20 };
  
  // Sample order history data
  const orderHistory: OrderHistoryItem[] = [
    {
      id: '1',
      symbol: 'AAPL',
      side: 'buy',
      orderType: 'limit',
      quantity: 100,
      price: 172.50,
      status: 'filled',
      timestamp: '2024-01-15 09:30:00',
      value: 17250
    },
    {
      id: '2',
      symbol: 'TSLA',
      side: 'sell',
      orderType: 'market',
      quantity: 50,
      price: 248.75,
      status: 'filled',
      timestamp: '2024-01-15 10:15:00',
      value: 12437.50
    },
    {
      id: '3',
      symbol: 'MSFT',
      side: 'buy',
      orderType: 'stop-limit',
      quantity: 75,
      price: 385.20,
      status: 'pending',
      timestamp: '2024-01-15 11:00:00',
      value: 28890
    }
  ];

  const handleSubmit = () => {
    if (orderData.quantity <= 0) return;
    
    const order = {
      ...orderData,
      price: orderData.orderType === 'market' ? currentPrice : orderData.limitPrice,
      timestamp: new Date().toISOString(),
      estimatedValue: orderData.quantity * (orderData.orderType === 'market' ? currentPrice : orderData.limitPrice)
    };
    
    onOrderSubmit?.(order);
    console.log('Order submitted:', order);
  };

  // Position sizing calculator
  const calculatePositionSize = useCallback(() => {
    if (!orderData.riskPercentage || !orderData.stopLossPrice) return 0;
    
    const accountBalance = buyingPower + (position.quantity * currentPrice);
    const riskAmount = (accountBalance * orderData.riskPercentage) / 100;
    const entryPrice = orderData.limitPrice || currentPrice;
    const stopLoss = orderData.stopLossPrice;
    const riskPerShare = Math.abs(entryPrice - stopLoss);
    
    return riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  }, [orderData.riskPercentage, orderData.stopLossPrice, orderData.limitPrice, currentPrice, buyingPower, position]);

  return (
    <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <Globe className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{symbol}</h2>
                <div className="flex items-center space-x-2 text-sm">
                  <span className="text-slate-400">Last Price</span>
                  <span className="font-bold text-white">${currentPrice.toFixed(2)}</span>
                  <div className="flex items-center space-x-1">
                    <ArrowUpRight className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-medium">+1.41%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setBalanceVisible(!balanceVisible)}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200"
            >
              {balanceVisible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all duration-200">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-6 border-b border-slate-700/50">
        <div className="flex space-x-1">
          {[
            { id: 'order', label: 'Order Entry', icon: Target },
            { id: 'options', label: 'Options', icon: Layers },
            { id: 'bracket', label: 'Bracket/OCO', icon: Link },
            { id: 'sizing', label: 'Position Sizing', icon: Calculator },
            { id: 'history', label: 'Order History', icon: History }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-3 rounded-t-lg font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? 'bg-slate-800/50 text-white border-b-2 border-blue-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/30'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6">
        {/* Order Entry Tab */}
        {activeTab === 'order' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Order Form */}
            <div className="space-y-6">
              {/* Portfolio Summary */}
              <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-4 border border-slate-600/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-slate-300">Available Balance</h3>
                  <PieChart className="w-4 h-4 text-blue-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Buying Power</span>
                    <span className="font-bold text-green-400">
                      {balanceVisible ? `$${buyingPower.toLocaleString()}` : '••••••'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-400">Position Value</span>
                    <span className="font-bold text-white">
                      {balanceVisible ? `$${(position.quantity * currentPrice).toLocaleString()}` : '••••••'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Asset Type Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-300">Asset Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['stocks', 'crypto', 'forex', 'options'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setOrderData(prev => ({ ...prev, assetType: type }))}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        orderData.assetType === type
                          ? 'bg-blue-600 text-white border border-blue-500'
                          : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Side Selection */}
              <div className="flex space-x-3">
                <button
                  onClick={() => setOrderData(prev => ({ ...prev, side: 'buy' }))}
                  className={`flex-1 py-4 px-6 rounded-xl font-bold transition-all duration-300 ${
                    orderData.side === 'buy'
                      ? 'bg-gradient-to-r from-green-600 to-green-500 text-white shadow-lg shadow-green-600/30 border border-green-500/50'
                      : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <TrendingUp className="w-5 h-5" />
                    <span>BUY</span>
                  </div>
                </button>
                <button
                  onClick={() => setOrderData(prev => ({ ...prev, side: 'sell' }))}
                  className={`flex-1 py-4 px-6 rounded-xl font-bold transition-all duration-300 ${
                    orderData.side === 'sell'
                      ? 'bg-gradient-to-r from-red-600 to-red-500 text-white shadow-lg shadow-red-600/30 border border-red-500/50'
                      : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
                  }`}
                >
                  <div className="flex items-center justify-center space-x-2">
                    <TrendingDown className="w-5 h-5" />
                    <span>SELL</span>
                  </div>
                </button>
              </div>

              {/* Order Type Selection */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-300">Order Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['market', 'limit', 'stop', 'stop-limit'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setOrderData(prev => ({ ...prev, orderType: type }))}
                      className={`py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                        orderData.orderType === type
                          ? 'bg-purple-600 text-white border border-purple-500'
                          : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
                      }`}
                    >
                      {type.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Inputs for Limit/Stop Orders */}
              {(orderData.orderType === 'limit' || orderData.orderType === 'stop-limit') && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Limit Price</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={orderData.limitPrice}
                      onChange={(e) => setOrderData(prev => ({ ...prev, limitPrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      placeholder="Enter limit price"
                      step="0.01"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
                      USD
                    </div>
                  </div>
                </div>
              )}

              {(orderData.orderType === 'stop' || orderData.orderType === 'stop-limit') && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Stop Price</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={orderData.stopPrice}
                      onChange={(e) => setOrderData(prev => ({ ...prev, stopPrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      placeholder="Enter stop price"
                      step="0.01"
                    />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
                      USD
                    </div>
                  </div>
                </div>
              )}

              {/* Quantity Input */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">
                  Quantity
                </label>
                <div className="flex space-x-3">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      value={orderData.quantity}
                      onChange={(e) => setOrderData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                      className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all duration-200"
                      placeholder="Enter quantity"
                      min="1"
                    />
                  </div>
                  <button
                    onClick={() => setOrderData(prev => ({ ...prev, quantity: Math.floor(buyingPower / currentPrice) }))}
                    className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all duration-200"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Time in Force */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-300">Time in Force</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['DAY', 'GTC', 'IOC', 'FOK'] as const).map((tif) => (
                    <button
                      key={tif}
                      onClick={() => setOrderData(prev => ({ ...prev, timeInForce: tif }))}
                      className={`py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                        orderData.timeInForce === tif
                          ? 'bg-indigo-600 text-white border border-indigo-500'
                          : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
                      }`}
                    >
                      {tif}
                    </button>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={orderData.quantity <= 0}
                className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 ${
                  orderData.side === 'buy'
                    ? 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 shadow-lg shadow-green-600/30'
                    : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 shadow-lg shadow-red-600/30'
                } ${
                  orderData.quantity <= 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'text-white border border-opacity-50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2">
                  {orderData.side === 'buy' ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <TrendingDown className="w-5 h-5" />
                  )}
                  <span>{orderData.side.toUpperCase()} {orderData.quantity} {symbol}</span>
                </div>
              </button>
            </div>

            {/* AI Recommendations */}
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-bold text-orange-400">AI Recommendation</span>
                  </div>
                  <div className="flex items-center space-x-1 text-xs bg-orange-500/30 text-orange-400 px-3 py-1 rounded-full border border-orange-500/50">
                    <Sparkles className="w-3 h-3" />
                    <span>Live</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Action</span>
                    <span className="px-3 py-1 bg-green-500/30 text-green-400 rounded-full text-sm font-medium border border-green-500/50">
                      BUY
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300">Target Price</span>
                    <span className="text-white font-bold">$185.00</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">Confidence Level</span>
                      <span className="text-orange-400 font-bold">78%</span>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-2">
                      <div className="bg-gradient-to-r from-orange-500 to-orange-400 h-2 rounded-full" style={{ width: '78%' }}></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="text-sm text-slate-300">Analysis</span>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Technical breakout pattern with strong volume confirmation
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Options Trading Tab */}
        {activeTab === 'options' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Layers className="w-6 h-6 text-purple-400" />
                <h2 className="text-xl font-bold text-white">Options Trading</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Option Type */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Option Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['call', 'put'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setOrderData(prev => ({ ...prev, optionType: type }))}
                        className={`py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                          orderData.optionType === type
                            ? 'bg-purple-600 text-white border border-purple-500'
                            : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
                        }`}
                      >
                        {type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Strike Price */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Strike Price</label>
                  <input
                    type="number"
                    value={orderData.strike || ''}
                    onChange={(e) => setOrderData(prev => ({ ...prev, strike: parseFloat(e.target.value) || undefined }))}
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                    placeholder="Enter strike price"
                    step="0.50"
                  />
                </div>

                {/* Expiration Date */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Expiration Date</label>
                  <input
                    type="date"
                    value={orderData.expiration || ''}
                    onChange={(e) => setOrderData(prev => ({ ...prev, expiration: e.target.value }))}
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                  />
                </div>

                {/* Contracts */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Contracts</label>
                  <input
                    type="number"
                    value={orderData.quantity}
                    onChange={(e) => setOrderData(prev => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all duration-200"
                    placeholder="Number of contracts"
                    min="1"
                  />
                </div>
              </div>

              {/* Options Chain Preview */}
              <div className="mt-6 bg-slate-800/30 rounded-lg p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">Options Chain Preview</h3>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="text-center">
                    <div className="text-slate-400">Strike</div>
                    <div className="font-bold text-white">${orderData.strike || currentPrice}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400">Premium</div>
                    <div className="font-bold text-green-400">$2.45</div>
                  </div>
                  <div className="text-center">
                    <div className="text-slate-400">Delta</div>
                    <div className="font-bold text-blue-400">0.65</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Bracket/OCO Orders Tab */}
        {activeTab === 'bracket' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-6">
              <div className="flex items-center space-x-3 mb-6">
                <Link className="w-6 h-6 text-orange-400" />
                <h2 className="text-xl font-bold text-white">Bracket & OCO Orders</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Order Type Selection */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Advanced Order Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['bracket', 'oco'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => setOrderData(prev => ({ ...prev, orderType: type }))}
                        className={`py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                          orderData.orderType === type
                            ? 'bg-orange-600 text-white border border-orange-500'
                            : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-600/30'
                        }`}
                      >
                        {type.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Entry Price */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Entry Price</label>
                  <input
                    type="number"
                    value={orderData.limitPrice || currentPrice}
                    onChange={(e) => setOrderData(prev => ({ ...prev, limitPrice: parseFloat(e.target.value) || currentPrice }))}
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all duration-200"
                    placeholder="Entry price"
                    step="0.01"
                  />
                </div>

                {/* Take Profit */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Take Profit Price</label>
                  <input
                    type="number"
                    value={orderData.takeProfitPrice || ''}
                    onChange={(e) => setOrderData(prev => ({ ...prev, takeProfitPrice: parseFloat(e.target.value) || undefined }))}
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all duration-200"
                    placeholder="Take profit price"
                    step="0.01"
                  />
                </div>

                {/* Stop Loss */}
                <div className="space-y-3">
                  <label className="text-sm font-medium text-slate-300">Stop Loss Price</label>
                  <input
                    type="number"
                    value={orderData.stopLossPrice || ''}
                    onChange={(e) => setOrderData(prev => ({ ...prev, stopLossPrice: parseFloat(e.target.value) || undefined }))}
                    className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-4 py-3 text-white placeholder-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all duration-200"
                    placeholder="Stop loss price"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Risk/Reward Preview */}
              {orderData.takeProfitPrice && orderData.stopLossPrice && (
                <div className="mt-6 bg-slate-800/30 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-3">Risk/Reward Analysis</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-slate-400">Risk</div>
                      <div className="font-bold text-red-400">
                        ${Math.abs((orderData.limitPrice || currentPrice) - orderData.stopLossPrice).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-slate-400">Reward</div>
                      <div className="font-bold text-green-400">
                        ${Math.abs(orderData.takeProfitPrice - (orderData.limitPrice || currentPrice)).toFixed(2)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-slate-400">R:R Ratio</div>
                      <div className="font-bold text-blue-400">
                        1:{(Math.abs(orderData.takeProfitPrice - (orderData.limitPrice || currentPrice)) /
                           Math.abs((orderData.limitPrice || currentPrice) - orderData.stopLossPrice)).toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OrderEntryEnhanced;
