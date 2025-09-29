import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../store/store';
import {
  ChartBarIcon,
  CurrencyDollarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  PlayIcon,
  PauseIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../utils/cn';

interface TradingPageProps {}

interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  status: 'PENDING' | 'FILLED' | 'CANCELLED';
  timestamp: Date;
}

interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
}

const TradingPage: React.FC<TradingPageProps> = () => {
  const dispatch = useDispatch<AppDispatch>();
  const { portfolio } = useSelector((state: RootState) => state.portfolio);
  const { symbols } = useSelector((state: RootState) => state.marketData);
  
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [isTrading, setIsTrading] = useState(true);

  // Mock data for desktop trading
  const [positions] = useState<Position[]>([
    {
      symbol: 'AAPL',
      quantity: 100,
      avgPrice: 150.00,
      currentPrice: 155.25,
      unrealizedPnL: 525.00,
      unrealizedPnLPercent: 3.5
    },
    {
      symbol: 'GOOGL',
      quantity: 10,
      avgPrice: 2500.00,
      currentPrice: 2580.00,
      unrealizedPnL: 800.00,
      unrealizedPnLPercent: 3.2
    },
    {
      symbol: 'TSLA',
      quantity: 50,
      avgPrice: 800.00,
      currentPrice: 785.00,
      unrealizedPnL: -750.00,
      unrealizedPnLPercent: -1.9
    }
  ]);

  const [recentOrders] = useState<Order[]>([
    {
      id: '1',
      symbol: 'AAPL',
      side: 'BUY',
      quantity: 100,
      price: 155.25,
      status: 'FILLED',
      timestamp: new Date(Date.now() - 300000)
    },
    {
      id: '2',
      symbol: 'GOOGL',
      side: 'SELL',
      quantity: 5,
      price: 2580.00,
      status: 'FILLED',
      timestamp: new Date(Date.now() - 600000)
    },
    {
      id: '3',
      symbol: 'TSLA',
      side: 'BUY',
      quantity: 25,
      price: 785.00,
      status: 'PENDING',
      timestamp: new Date(Date.now() - 120000)
    }
  ]);

  const marketData = {
    'AAPL': { price: 155.25, change: 2.15, changePercent: 1.4 },
    'GOOGL': { price: 2580.00, change: -15.50, changePercent: -0.6 },
    'TSLA': { price: 785.00, change: 12.30, changePercent: 1.6 },
    'MSFT': { price: 310.45, change: 5.20, changePercent: 1.7 },
    'AMZN': { price: 3200.00, change: -25.00, changePercent: -0.8 },
    'NVDA': { price: 450.75, change: 18.25, changePercent: 4.2 },
  };

  const handlePlaceOrder = () => {
    if (!quantity || (orderType === 'LIMIT' && !limitPrice)) {
      alert('Please fill in all required fields');
      return;
    }

    const order: Order = {
      id: Date.now().toString(),
      symbol: selectedSymbol,
      side: orderSide,
      quantity: parseInt(quantity),
      price: orderType === 'MARKET' ? marketData[selectedSymbol as keyof typeof marketData].price : parseFloat(limitPrice),
      status: 'PENDING',
      timestamp: new Date()
    };

    console.log('Placing order:', order);
    
    // Reset form
    setQuantity('');
    setLimitPrice('');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FILLED':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'PENDING':
        return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      case 'CANCELLED':
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
    }
  };

  const getSideColor = (side: string) => {
    return side === 'BUY' 
      ? 'text-green-600 dark:text-green-400' 
      : 'text-red-600 dark:text-red-400';
  };

  const getPnLColor = (pnl: number) => {
    return pnl >= 0 
      ? 'text-green-600 dark:text-green-400' 
      : 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Trading Terminal
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Professional desktop trading interface
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setIsTrading(!isTrading)}
            className={cn(
              'flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors',
              isTrading
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
            )}
          >
            {isTrading ? (
              <>
                <PlayIcon className="h-4 w-4" />
                <span>Trading Active</span>
              </>
            ) : (
              <>
                <PauseIcon className="h-4 w-4" />
                <span>Trading Paused</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Entry Panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Place Order
          </h2>
          
          <div className="space-y-4">
            {/* Symbol Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Symbol
              </label>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {Object.keys(marketData).map(symbol => (
                  <option key={symbol} value={symbol}>{symbol}</option>
                ))}
              </select>
            </div>

            {/* Current Price Display */}
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-400">Current Price</span>
                <div className="text-right">
                  <div className="font-semibold text-gray-900 dark:text-white">
                    ${marketData[selectedSymbol as keyof typeof marketData].price.toFixed(2)}
                  </div>
                  <div className={cn(
                    'text-sm flex items-center',
                    getPnLColor(marketData[selectedSymbol as keyof typeof marketData].change)
                  )}>
                    {marketData[selectedSymbol as keyof typeof marketData].change >= 0 ? (
                      <ArrowUpIcon className="h-3 w-3 mr-1" />
                    ) : (
                      <ArrowDownIcon className="h-3 w-3 mr-1" />
                    )}
                    {marketData[selectedSymbol as keyof typeof marketData].changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Order Side */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Side
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOrderSide('BUY')}
                  className={cn(
                    'py-2 px-4 rounded-lg font-medium transition-colors',
                    orderSide === 'BUY'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  BUY
                </button>
                <button
                  onClick={() => setOrderSide('SELL')}
                  className={cn(
                    'py-2 px-4 rounded-lg font-medium transition-colors',
                    orderSide === 'SELL'
                      ? 'bg-red-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  SELL
                </button>
              </div>
            </div>

            {/* Order Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Order Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setOrderType('MARKET')}
                  className={cn(
                    'py-2 px-4 rounded-lg font-medium transition-colors',
                    orderType === 'MARKET'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  MARKET
                </button>
                <button
                  onClick={() => setOrderType('LIMIT')}
                  className={cn(
                    'py-2 px-4 rounded-lg font-medium transition-colors',
                    orderType === 'LIMIT'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  )}
                >
                  LIMIT
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Quantity
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Limit Price (if LIMIT order) */}
            {orderType === 'LIMIT' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Limit Price
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="Enter limit price"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {/* Place Order Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={!isTrading}
              className={cn(
                'w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-200',
                isTrading
                  ? orderSide === 'BUY'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                  : 'bg-gray-400 cursor-not-allowed'
              )}
            >
              {orderSide} {selectedSymbol}
            </button>
          </div>
        </motion.div>

        {/* Positions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Current Positions
          </h2>
          
          <div className="space-y-4">
            {positions.map((position) => (
              <div key={position.symbol} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {position.symbol}
                  </span>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {position.quantity} shares
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Avg Price</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      ${position.avgPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Current</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      ${position.currentPrice.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">P&L</div>
                    <div className={cn('font-medium', getPnLColor(position.unrealizedPnL))}>
                      ${position.unrealizedPnL.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">P&L %</div>
                    <div className={cn('font-medium', getPnLColor(position.unrealizedPnL))}>
                      {position.unrealizedPnLPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
            Recent Orders
          </h2>
          
          <div className="space-y-4">
            {recentOrders.map((order) => (
              <div key={order.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {order.symbol}
                    </span>
                    <span className={cn('text-sm font-medium', getSideColor(order.side))}>
                      {order.side}
                    </span>
                  </div>
                  <span className={cn('px-2 py-1 text-xs font-medium rounded-full', getStatusColor(order.status))}>
                    {order.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Quantity</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {order.quantity}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Price</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      ${order.price.toFixed(2)}
                    </div>
                  </div>
                </div>
                
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {order.timestamp.toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default TradingPage;
