// Demo page for API Integration Example

import React, { useState } from 'react';
import Head from 'next/head';
import { motion } from 'framer-motion';
import OrderEntryWithAPI from '../../components/Trading/OrderEntryWithAPI';
import { 
  Database, 
  Wifi, 
  Shield, 
  Zap, 
  CheckCircle, 
  AlertTriangle,
  Code,
  Settings
} from 'lucide-react';

const APIIntegrationDemo: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USDT');

  const symbols = [
    { symbol: 'BTC-USDT', name: 'Bitcoin', type: 'crypto' },
    { symbol: 'ETH-USDT', name: 'Ethereum', type: 'crypto' },
    { symbol: 'AAPL', name: 'Apple Inc.', type: 'stocks' },
    { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stocks' },
  ];

  return (
    <>
      <Head>
        <title>API Integration Demo - NexusTradeAI</title>
        <meta name="description" content="Real-time API integration demonstration" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Header */}
        <div className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                  <Database className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">NexusTradeAI</h1>
                  <p className="text-sm text-slate-400">API Integration Demo</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <div className="text-right">
                  <div className="text-sm font-medium text-white">Real-time Trading</div>
                  <div className="text-xs text-slate-400">Live API Integration</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white mb-2">API Integration Demo</h2>
            <p className="text-slate-400 text-lg">
              Experience real-time trading with live API integration, WebSocket connections, and backend services
            </p>
          </div>

          {/* API Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gradient-to-br from-green-900/30 to-green-800/30 border border-green-500/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Wifi className="w-5 h-5 text-green-400" />
                <span className="text-green-400 text-sm font-medium">CONNECTED</span>
              </div>
              <div className="text-white font-semibold">Market Data API</div>
              <div className="text-slate-400 text-xs">Real-time price feeds</div>
            </div>

            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Shield className="w-5 h-5 text-blue-400" />
                <span className="text-blue-400 text-sm font-medium">SECURE</span>
              </div>
              <div className="text-white font-semibold">Trading API</div>
              <div className="text-slate-400 text-xs">Order execution</div>
            </div>

            <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/30 border border-purple-500/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Zap className="w-5 h-5 text-purple-400" />
                <span className="text-purple-400 text-sm font-medium">LIVE</span>
              </div>
              <div className="text-white font-semibold">WebSocket</div>
              <div className="text-slate-400 text-xs">Real-time updates</div>
            </div>

            <div className="bg-gradient-to-br from-orange-900/30 to-orange-800/30 border border-orange-500/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <Database className="w-5 h-5 text-orange-400" />
                <span className="text-orange-400 text-sm font-medium">SYNCED</span>
              </div>
              <div className="text-white font-semibold">Portfolio API</div>
              <div className="text-slate-400 text-xs">Account data</div>
            </div>
          </div>

          {/* Symbol Selection */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Select Trading Symbol</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {symbols.map((item) => (
                <button
                  key={item.symbol}
                  onClick={() => setSelectedSymbol(item.symbol)}
                  className={`p-4 rounded-xl border transition-all ${
                    selectedSymbol === item.symbol
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  <div className="font-semibold">{item.symbol}</div>
                  <div className="text-xs opacity-75">{item.name}</div>
                  <div className="text-xs opacity-50 capitalize">{item.type}</div>
                </button>
              ))}
            </div>
          </div>

          {/* API Integration Features */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
            <div className="lg:col-span-2">
              {/* Order Entry with API */}
              <OrderEntryWithAPI symbol={selectedSymbol} />
            </div>

            <div className="space-y-6">
              {/* API Features */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">API Features</h3>
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-slate-300">Real-time market data</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-slate-300">Live order execution</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-slate-300">Portfolio synchronization</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-slate-300">WebSocket connections</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-slate-300">Error handling & retry</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <span className="text-slate-300">Authentication & security</span>
                  </div>
                </div>
              </div>

              {/* Integration Status */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Integration Status</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Market Data</span>
                    <span className="text-green-400 text-sm">✓ Connected</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Order Management</span>
                    <span className="text-green-400 text-sm">✓ Ready</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Portfolio Sync</span>
                    <span className="text-green-400 text-sm">✓ Active</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Risk Management</span>
                    <span className="text-green-400 text-sm">✓ Enabled</span>
                  </div>
                </div>
              </div>

              {/* Development Notes */}
              <div className="bg-gradient-to-r from-blue-900/20 to-blue-800/20 border border-blue-500/30 rounded-xl p-6">
                <div className="flex items-center space-x-2 mb-3">
                  <Code className="w-5 h-5 text-blue-400" />
                  <h3 className="text-lg font-semibold text-white">Development Mode</h3>
                </div>
                <p className="text-blue-300 text-sm mb-3">
                  This demo uses mock API responses. In production, replace with real trading APIs.
                </p>
                <div className="text-blue-400 text-xs">
                  <div>• Mock market data with realistic price movements</div>
                  <div>• Simulated order execution</div>
                  <div>• Demo portfolio data</div>
                </div>
              </div>
            </div>
          </div>

          {/* Implementation Guide */}
          <div className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 rounded-xl p-6 border border-slate-600/30">
            <h3 className="text-lg font-semibold text-white mb-4">Implementation Guide</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Backend Setup</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Configure API endpoints in .env.local</li>
                  <li>• Set up authentication tokens</li>
                  <li>• Configure WebSocket connections</li>
                  <li>• Implement error handling</li>
                  <li>• Set up rate limiting</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-slate-300 mb-2">Frontend Integration</h4>
                <ul className="text-sm text-slate-400 space-y-1">
                  <li>• Use provided React hooks</li>
                  <li>• Handle loading and error states</li>
                  <li>• Implement real-time updates</li>
                  <li>• Add data validation</li>
                  <li>• Optimize performance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default APIIntegrationDemo;
