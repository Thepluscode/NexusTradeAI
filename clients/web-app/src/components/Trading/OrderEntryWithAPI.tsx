// OrderEntry Component with Real API Integration Example

'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useOrderManagement, useMarketData, usePortfolio } from '@/hooks/useTradingAPI';
import { OrderRequest } from '@/services/api/TradingAPI';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  AlertCircle,
  CheckCircle,
  Loader2,
  Wifi,
  WifiOff
} from 'lucide-react';

interface OrderEntryWithAPIProps {
  symbol: string;
  className?: string;
}

const OrderEntryWithAPI: React.FC<OrderEntryWithAPIProps> = ({ symbol, className = '' }) => {
  // API Hooks
  const { data: marketData, loading: marketLoading, error: marketError } = useMarketData(symbol, 1000);
  const { portfolio, loading: portfolioLoading } = usePortfolio();
  const { submitOrder, submitting } = useOrderManagement();

  // Component State
  const [orderData, setOrderData] = useState({
    side: 'buy' as 'buy' | 'sell',
    orderType: 'market' as 'market' | 'limit' | 'stop',
    quantity: 0,
    limitPrice: 0,
    timeInForce: 'GTC' as 'DAY' | 'GTC' | 'IOC' | 'FOK',
  });

  const [orderStatus, setOrderStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  // Update limit price when market price changes
  useEffect(() => {
    if (marketData && orderData.orderType === 'limit') {
      setOrderData(prev => ({
        ...prev,
        limitPrice: marketData.price
      }));
    }
  }, [marketData, orderData.orderType]);

  // Handle order submission with real API
  const handleSubmitOrder = async () => {
    if (!marketData || orderData.quantity <= 0) {
      setOrderStatus({
        type: 'error',
        message: 'Please enter a valid quantity'
      });
      return;
    }

    try {
      const orderRequest: OrderRequest = {
        symbol,
        side: orderData.side,
        type: orderData.orderType,
        quantity: orderData.quantity,
        price: orderData.orderType === 'limit' ? orderData.limitPrice : undefined,
        timeInForce: orderData.timeInForce,
        assetType: 'crypto', // Determine based on symbol
      };

      const result = await submitOrder(orderRequest);
      
      if (result) {
        setOrderStatus({
          type: 'success',
          message: `Order ${result.orderId} submitted successfully`
        });
        
        // Reset form
        setOrderData(prev => ({ ...prev, quantity: 0 }));
        
        // Clear success message after 3 seconds
        setTimeout(() => {
          setOrderStatus({ type: 'idle', message: '' });
        }, 3000);
      } else {
        setOrderStatus({
          type: 'error',
          message: 'Failed to submit order. Please try again.'
        });
      }
    } catch (error) {
      setOrderStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    }
  };

  // Calculate order value
  const orderValue = orderData.quantity * (
    orderData.orderType === 'market' 
      ? (marketData?.price || 0)
      : orderData.limitPrice
  );

  // Check if user has sufficient balance
  const hasSufficientBalance = portfolio 
    ? (orderData.side === 'buy' ? portfolio.availableBalance >= orderValue : true)
    : true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-xl rounded-2xl border border-slate-700/50 shadow-2xl ${className}`}
    >
      {/* Header with Connection Status */}
      <div className="p-6 border-b border-slate-700/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl">
              <Target className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Order Entry</h2>
              <p className="text-slate-400">Real-time trading with API integration</p>
            </div>
          </div>
          
          {/* Connection Status */}
          <div className="flex items-center space-x-2">
            {marketError ? (
              <div className="flex items-center space-x-1 text-red-400">
                <WifiOff className="w-4 h-4" />
                <span className="text-xs">Disconnected</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 text-green-400">
                <Wifi className="w-4 h-4" />
                <span className="text-xs">Live</span>
              </div>
            )}
          </div>
        </div>

        {/* Market Data Display */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-400 text-sm font-medium">{symbol}</span>
              {marketLoading && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
            </div>
            <div className="text-white text-lg font-bold">
              {marketData ? `$${marketData.price.toFixed(2)}` : '--'}
            </div>
            <div className="text-slate-400 text-xs">Current Price</div>
          </div>

          <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-4 h-4 text-green-400" />
              <span className={`text-xs font-medium ${
                marketData && marketData.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {marketData ? `${marketData.changePercent >= 0 ? '+' : ''}${marketData.changePercent.toFixed(2)}%` : '--'}
              </span>
            </div>
            <div className="text-white text-lg font-bold">
              {portfolio ? `$${portfolio.availableBalance.toFixed(2)}` : '--'}
            </div>
            <div className="text-slate-400 text-xs">Available Balance</div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
            <div className="text-purple-400 text-xs mb-1">24h Volume</div>
            <div className="text-white text-lg font-bold">
              {marketData ? `${(marketData.volume / 1000000).toFixed(1)}M` : '--'}
            </div>
            <div className="text-slate-400 text-xs">Volume</div>
          </div>

          <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
            <div className="text-orange-400 text-xs mb-1">24h Range</div>
            <div className="text-white text-sm font-bold">
              {marketData ? `$${marketData.low24h.toFixed(2)} - $${marketData.high24h.toFixed(2)}` : '--'}
            </div>
            <div className="text-slate-400 text-xs">High/Low</div>
          </div>
        </div>
      </div>

      {/* Order Form */}
      <div className="p-6">
        {/* Order Status Messages */}
        {orderStatus.type !== 'idle' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-xl border ${
              orderStatus.type === 'success'
                ? 'bg-green-900/30 border-green-500/50 text-green-400'
                : 'bg-red-900/30 border-red-500/50 text-red-400'
            }`}
          >
            <div className="flex items-center space-x-2">
              {orderStatus.type === 'success' ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
              <span className="font-medium">{orderStatus.message}</span>
            </div>
          </motion.div>
        )}

        {/* Buy/Sell Selection */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            onClick={() => setOrderData(prev => ({ ...prev, side: 'buy' }))}
            className={`p-4 rounded-xl font-semibold transition-all ${
              orderData.side === 'buy'
                ? 'bg-gradient-to-r from-green-600 to-green-500 text-white'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            <TrendingUp className="w-5 h-5 mx-auto mb-1" />
            BUY
          </button>
          <button
            onClick={() => setOrderData(prev => ({ ...prev, side: 'sell' }))}
            className={`p-4 rounded-xl font-semibold transition-all ${
              orderData.side === 'sell'
                ? 'bg-gradient-to-r from-red-600 to-red-500 text-white'
                : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            <TrendingDown className="w-5 h-5 mx-auto mb-1" />
            SELL
          </button>
        </div>

        {/* Order Type Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">Order Type</label>
          <div className="grid grid-cols-3 gap-2">
            {['market', 'limit', 'stop'].map((type) => (
              <button
                key={type}
                onClick={() => setOrderData(prev => ({ ...prev, orderType: type as any }))}
                className={`p-3 rounded-lg text-sm font-medium capitalize transition-all ${
                  orderData.orderType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-300 mb-3">Quantity</label>
          <input
            type="number"
            value={orderData.quantity || ''}
            onChange={(e) => setOrderData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            placeholder="Enter quantity"
            min="0"
            step="0.001"
          />
        </div>

        {/* Limit Price Input */}
        {orderData.orderType === 'limit' && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-3">Limit Price</label>
            <input
              type="number"
              value={orderData.limitPrice || ''}
              onChange={(e) => setOrderData(prev => ({ ...prev, limitPrice: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="Enter limit price"
              min="0"
              step="0.01"
            />
          </div>
        )}

        {/* Order Summary */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-white mb-3">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Order Value</span>
              <span className="text-white font-medium">${orderValue.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Available Balance</span>
              <span className={`font-medium ${hasSufficientBalance ? 'text-green-400' : 'text-red-400'}`}>
                ${portfolio?.availableBalance.toFixed(2) || '0.00'}
              </span>
            </div>
            {!hasSufficientBalance && (
              <div className="text-red-400 text-xs">Insufficient balance for this order</div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmitOrder}
          disabled={submitting || !marketData || orderData.quantity <= 0 || !hasSufficientBalance}
          className={`w-full p-4 rounded-xl font-semibold text-lg transition-all ${
            submitting || !marketData || orderData.quantity <= 0 || !hasSufficientBalance
              ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
              : orderData.side === 'buy'
              ? 'bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-700 hover:to-green-600'
              : 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600'
          }`}
        >
          {submitting ? (
            <div className="flex items-center justify-center space-x-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Submitting...</span>
            </div>
          ) : (
            `${orderData.side.toUpperCase()} ${orderData.quantity} ${symbol.split('-')[0]}`
          )}
        </button>
      </div>
    </motion.div>
  );
};

export default OrderEntryWithAPI;
