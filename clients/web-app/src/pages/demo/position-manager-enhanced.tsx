// Demo page for the Enhanced Position Manager component

import React from 'react';
import Head from 'next/head';
import PositionManagerEnhanced from '../../components/Trading/PositionManagerEnhanced';

const PositionManagerEnhancedDemo: React.FC = () => {
  return (
    <>
      <Head>
        <title>Enhanced Position Manager Demo - NexusTradeAI</title>
        <meta name="description" content="Advanced position management with risk analysis and portfolio analytics" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Header */}
        <div className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">N</span>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">NexusTradeAI</h1>
                  <p className="text-sm text-slate-400">Enhanced Position Manager Demo</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-white">Professional Trading Platform</div>
                  <div className="text-xs text-slate-400">Advanced Risk Management</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Enhanced Position Manager</h2>
            <p className="text-slate-400 text-lg">
              Advanced portfolio management with real-time risk analysis, position tracking, and performance analytics
            </p>
          </div>

          {/* Features Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
              <div className="text-green-400 font-semibold text-sm">Position Tracking</div>
              <div className="text-white text-xs">Real-time P&L and risk monitoring</div>
            </div>
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
              <div className="text-blue-400 font-semibold text-sm">Portfolio Analytics</div>
              <div className="text-white text-xs">Performance metrics and insights</div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
              <div className="text-purple-400 font-semibold text-sm">Risk Management</div>
              <div className="text-white text-xs">VaR, margin, and liquidation analysis</div>
            </div>
            <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
              <div className="text-orange-400 font-semibold text-sm">Advanced Features</div>
              <div className="text-white text-xs">Stop loss, take profit, trailing stops</div>
            </div>
          </div>

          {/* Position Manager Component */}
          <PositionManagerEnhanced />

          {/* Instructions */}
          <div className="mt-8 bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-slate-600/30">
            <h3 className="text-lg font-semibold text-white mb-4">How to Use</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Position Management</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• View all active positions with real-time P&L</li>
                  <li>• Filter by profitability or risk level</li>
                  <li>• Sort by symbol, P&L, size, or risk</li>
                  <li>• Edit stop loss and take profit levels</li>
                  <li>• Close positions with partial or full size</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Analytics & Risk</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Portfolio performance analytics</li>
                  <li>• Risk exposure and diversification metrics</li>
                  <li>• Value at Risk (VaR) calculations</li>
                  <li>• Margin utilization monitoring</li>
                  <li>• Liquidation risk assessment</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default PositionManagerEnhancedDemo;
