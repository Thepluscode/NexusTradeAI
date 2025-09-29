// Demo page for the Enhanced Trade History component

import React from 'react';
import Head from 'next/head';
import TradeHistoryEnhanced from '../../components/Trading/TradeHistoryEnhanced';

const TradeHistoryEnhancedDemo: React.FC = () => {
  return (
    <>
      <Head>
        <title>Enhanced Trade History Demo - NexusTradeAI</title>
        <meta name="description" content="Comprehensive trading analytics and performance tracking" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Header */}
        <div className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">N</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">NexusTradeAI</h1>
                  <p className="text-sm text-slate-400">Enhanced Trade History Demo</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-white">Professional Trading Platform</div>
                  <div className="text-xs text-slate-400">Advanced Analytics & Tracking</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Enhanced Trade History</h2>
            <p className="text-slate-400 text-lg">
              Comprehensive trading analytics with advanced filtering, performance metrics, and detailed trade tracking
            </p>
          </div>

          {/* Features Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
              <div className="text-green-400 font-semibold text-sm">Performance Analytics</div>
              <div className="text-white text-xs">Win rate, P&L, profit factor analysis</div>
            </div>
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
              <div className="text-blue-400 font-semibold text-sm">Advanced Filtering</div>
              <div className="text-white text-xs">Filter by asset, strategy, time range</div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
              <div className="text-purple-400 font-semibold text-sm">Trade Details</div>
              <div className="text-white text-xs">Execution time, slippage, fees tracking</div>
            </div>
            <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
              <div className="text-orange-400 font-semibold text-sm">Multi-Asset Support</div>
              <div className="text-white text-xs">Crypto, stocks, forex, options</div>
            </div>
          </div>

          {/* Trade History Component */}
          <TradeHistoryEnhanced />

          {/* Instructions */}
          <div className="mt-8 bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-slate-600/30">
            <h3 className="text-lg font-semibold text-white mb-4">How to Use</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Trade Analysis</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• View comprehensive trade history with P&L</li>
                  <li>• Analyze performance metrics and win rates</li>
                  <li>• Track execution quality and slippage</li>
                  <li>• Monitor fees and commission costs</li>
                  <li>• Export data for external analysis</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Filtering & Search</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Filter by symbol, side, or asset type</li>
                  <li>• Search by order ID or symbol</li>
                  <li>• Filter by trading strategy</li>
                  <li>• Set custom date ranges</li>
                  <li>• Filter by order status</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TradeHistoryEnhancedDemo;
