// Mobile-optimized Order Entry Component

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Target,
  Settings,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  AlertCircle,
  Calculator,
  Shield,
  Clock,
  Zap
} from 'lucide-react';

interface MobileOrderEntryProps {
  symbol: string;
  currentPrice: number;
  onOrderSubmit: (orderData: any) => void;
  onClose?: () => void;
}

const MobileOrderEntry: React.FC<MobileOrderEntryProps> = ({
  symbol,
  currentPrice,
  onOrderSubmit,
  onClose
}) => {
  const [orderData, setOrderData] = useState({
    side: 'buy' as 'buy' | 'sell',
    orderType: 'market' as 'market' | 'limit' | 'stop',
    quantity: 0,
    limitPrice: currentPrice,
    timeInForce: 'GTC' as 'DAY' | 'GTC' | 'IOC' | 'FOK',
  });

  const [activeSection, setActiveSection] = useState<'basic' | 'advanced' | 'confirm'>('basic');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const totalValue = orderData.quantity * (orderData.orderType === 'market' ? currentPrice : orderData.limitPrice);

  const handleSubmit = () => {
    onOrderSubmit(orderData);
    onClose?.();
  };

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed inset-0 z-50 bg-slate-900 overflow-y-auto"
    >
      {/* Header */}
      <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl border-b border-slate-700/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-sm">{symbol.slice(0, 2)}</span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{symbol}</h2>
              <p className="text-slate-400 text-sm">${currentPrice.toFixed(2)}</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg"
            >
              <X className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-6">
        {/* Buy/Sell Toggle */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOrderData(prev => ({ ...prev, side: 'buy' }))}
            className={`p-4 rounded-xl font-semibold transition-all ${
              orderData.side === 'buy'
                ? 'bg-gradient-to-r from-green-600 to-green-500 text-white'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
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
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            <TrendingDown className="w-5 h-5 mx-auto mb-1" />
            SELL
          </button>
        </div>

        {/* Order Type */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-300">Order Type</label>
          <div className="grid grid-cols-3 gap-2">
            {['market', 'limit', 'stop'].map((type) => (
              <button
                key={type}
                onClick={() => setOrderData(prev => ({ ...prev, orderType: type as any }))}
                className={`p-3 rounded-lg text-sm font-medium capitalize transition-all ${
                  orderData.orderType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* Quantity Input */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-slate-300">Quantity</label>
          <div className="relative">
            <input
              type="number"
              value={orderData.quantity || ''}
              onChange={(e) => setOrderData(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white text-lg font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              placeholder="0.00"
            />
            <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
              {symbol.split('-')[0]}
            </div>
          </div>
          
          {/* Quick Amount Buttons */}
          <div className="grid grid-cols-4 gap-2">
            {['25%', '50%', '75%', 'MAX'].map((percent) => (
              <button
                key={percent}
                className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                {percent}
              </button>
            ))}
          </div>
        </div>

        {/* Price Input (for limit orders) */}
        {orderData.orderType === 'limit' && (
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-300">Limit Price</label>
            <div className="relative">
              <input
                type="number"
                value={orderData.limitPrice || ''}
                onChange={(e) => setOrderData(prev => ({ ...prev, limitPrice: parseFloat(e.target.value) || 0 }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white text-lg font-medium focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="0.00"
              />
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 text-sm">
                USD
              </div>
            </div>
          </div>
        )}

        {/* Advanced Options */}
        <div className="space-y-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full p-3 bg-slate-800 border border-slate-700 rounded-xl text-slate-300"
          >
            <span className="font-medium">Advanced Options</span>
            {showAdvanced ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-4 overflow-hidden"
              >
                {/* Time in Force */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Time in Force</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['GTC', 'DAY'].map((tif) => (
                      <button
                        key={tif}
                        onClick={() => setOrderData(prev => ({ ...prev, timeInForce: tif as any }))}
                        className={`p-3 rounded-lg text-sm font-medium transition-all ${
                          orderData.timeInForce === tif
                            ? 'bg-purple-600 text-white'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {tif}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stop Loss & Take Profit */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Stop Loss</label>
                    <input
                      type="number"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Take Profit</label>
                    <input
                      type="number"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Order Summary */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-white">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Quantity</span>
              <span className="text-white">{orderData.quantity} {symbol.split('-')[0]}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Price</span>
              <span className="text-white">
                ${orderData.orderType === 'market' ? currentPrice.toFixed(2) : orderData.limitPrice.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm border-t border-slate-700 pt-2">
              <span className="text-slate-400">Total Value</span>
              <span className="text-white font-semibold">${totalValue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={orderData.quantity <= 0}
          className={`w-full p-4 rounded-xl font-semibold text-lg transition-all ${
            orderData.quantity > 0
              ? orderData.side === 'buy'
                ? 'bg-gradient-to-r from-green-600 to-green-500 text-white hover:from-green-700 hover:to-green-600'
                : 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:from-red-700 hover:to-red-600'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
        >
          {orderData.side === 'buy' ? 'BUY' : 'SELL'} {orderData.quantity} {symbol.split('-')[0]}
        </button>

        {/* Risk Warning */}
        <div className="flex items-start space-x-3 p-3 bg-orange-900/20 border border-orange-500/30 rounded-lg">
          <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-orange-300">
            <p className="font-medium">Risk Warning</p>
            <p className="text-orange-400">Trading involves substantial risk of loss. Only trade with funds you can afford to lose.</p>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default MobileOrderEntry;
