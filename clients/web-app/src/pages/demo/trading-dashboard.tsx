// Demo page for the Enhanced Trading Dashboard component

import React from 'react';
import Head from 'next/head';
import TradingDashboard from '../../components/Trading/TradingDashboard';

const TradingDashboardDemo: React.FC = () => {
  return (
    <>
      <Head>
        <title>Enhanced Trading Dashboard Demo - NexusTradeAI</title>
        <meta name="description" content="Advanced trading dashboard with real-time analytics and portfolio management" />
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
                  <p className="text-sm text-slate-400">Enhanced Trading Dashboard Demo</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-white">Professional Trading Platform</div>
                  <div className="text-xs text-slate-400">Advanced Analytics & Management</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">Enhanced Trading Dashboard</h2>
            <p className="text-slate-400 text-lg">
              Comprehensive trading dashboard with real-time analytics, session management, and advanced portfolio insights
            </p>
          </div>

          {/* Features Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
              <div className="text-green-400 font-semibold text-sm">Session Management</div>
              <div className="text-white text-xs">Real-time trading session tracking</div>
            </div>
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
              <div className="text-blue-400 font-semibold text-sm">Portfolio Analytics</div>
              <div className="text-white text-xs">Advanced performance metrics</div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
              <div className="text-purple-400 font-semibold text-sm">Real-time Alerts</div>
              <div className="text-white text-xs">Price, volume, and risk alerts</div>
            </div>
            <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
              <div className="text-orange-400 font-semibold text-sm">Risk Management</div>
              <div className="text-white text-xs">Portfolio risk monitoring</div>
            </div>
          </div>

          {/* Trading Dashboard Component */}
          <TradingDashboard />

          {/* Instructions */}
          <div className="mt-8 bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-slate-600/30">
            <h3 className="text-lg font-semibold text-white mb-4">How to Use</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Dashboard Navigation</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Overview tab for portfolio summary</li>
                  <li>• Positions tab for active position management</li>
                  <li>• Orders tab for order tracking</li>
                  <li>• Analytics tab for performance insights</li>
                  <li>• Alerts tab for real-time notifications</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Advanced Features</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Real-time session P&L tracking</li>
                  <li>• Portfolio performance analytics</li>
                  <li>• Risk management dashboard</li>
                  <li>• Customizable alert system</li>
                  <li>• Multi-timeframe analysis</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TradingDashboardDemo;
