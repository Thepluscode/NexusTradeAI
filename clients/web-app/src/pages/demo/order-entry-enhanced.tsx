// Demo page for the Enhanced Order Entry component

import React from 'react';
import Head from 'next/head';
import OrderEntryEnhanced from '../../components/Trading/OrderEntryEnhanced';

const OrderEntryEnhancedDemo: React.FC = () => {
  const handleOrderSubmit = (order: any) => {
    console.log('Order submitted:', order);
    alert(`Order submitted: ${order.side.toUpperCase()} ${order.quantity} ${order.symbol} at ${order.orderType} order`);
  };

  return (
    <>
      <Head>
        <title>Enhanced Order Entry Demo - NexusTradeAI</title>
        <meta name="description" content="Professional trading order entry with advanced features" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Header */}
        <div className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">N</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">NexusTradeAI</h1>
                  <p className="text-sm text-slate-400">Enhanced Order Entry Demo</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-white">Professional Trading Platform</div>
                  <div className="text-xs text-slate-400">All Advanced Features Enabled</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Enhanced Order Entry</h2>
            <p className="text-slate-400 text-lg">
              Professional trading interface with options, bracket orders, position sizing, and order history
            </p>
          </div>

          {/* Features Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
              <div className="text-blue-400 font-semibold text-sm">Multi-Asset</div>
              <div className="text-white text-xs">Stocks, Crypto, Forex, Options</div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
              <div className="text-purple-400 font-semibold text-sm">Options Trading</div>
              <div className="text-white text-xs">Calls, Puts, Strike Prices</div>
            </div>
            <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
              <div className="text-orange-400 font-semibold text-sm">Bracket Orders</div>
              <div className="text-white text-xs">OCO, Take Profit, Stop Loss</div>
            </div>
            <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
              <div className="text-green-400 font-semibold text-sm">Position Sizing</div>
              <div className="text-white text-xs">Risk Management Calculator</div>
            </div>
            <div className="bg-gradient-to-br from-indigo-900/30 to-indigo-800/30 border border-indigo-500/50 rounded-xl p-4">
              <div className="text-indigo-400 font-semibold text-sm">Order History</div>
              <div className="text-white text-xs">Transaction Tracking</div>
            </div>
          </div>

          {/* Order Entry Component */}
          <OrderEntryEnhanced
            symbol="AAPL"
            currentPrice={175.84}
            onOrderSubmit={handleOrderSubmit}
          />

          {/* Instructions */}
          <div className="mt-8 bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-slate-600/30">
            <h3 className="text-lg font-semibold text-white mb-4">How to Use</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Basic Trading</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Select asset type (Stocks, Crypto, Forex, Options)</li>
                  <li>• Choose buy or sell side</li>
                  <li>• Pick order type (Market, Limit, Stop, Stop-Limit)</li>
                  <li>• Enter quantity and price details</li>
                  <li>• Set time in force (DAY, GTC, IOC, FOK)</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Advanced Features</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Options: Set strike price and expiration</li>
                  <li>• Bracket: Configure take profit and stop loss</li>
                  <li>• Sizing: Calculate position based on risk %</li>
                  <li>• History: View past orders and statistics</li>
                  <li>• AI: Get real-time trading recommendations</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderEntryEnhancedDemo;
