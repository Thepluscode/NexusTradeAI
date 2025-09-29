import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Users, Target, DollarSign } from 'lucide-react';

interface LiveTrade {
  id: string;
  algorithm: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  profit: number;
  profitPercent: number;
  timestamp: Date;
  status: 'open' | 'closed';
}

interface AlgorithmStats {
  id: string;
  name: string;
  todayPnL: number;
  todayPnLPercent: number;
  weekPnL: number;
  monthPnL: number;
  totalTrades: number;
  winRate: number;
  activePositions: number;
  subscribers: number;
}

const LiveTradingResults: React.FC = () => {
  const [liveTrades, setLiveTrades] = useState<LiveTrade[]>([]);
  const [algorithmStats, setAlgorithmStats] = useState<AlgorithmStats[]>([]);

  // Mock data for demonstration
  useEffect(() => {
    const mockStats: AlgorithmStats[] = [
      {
        id: '1',
        name: 'Momentum Scalper',
        todayPnL: 2847.32,
        todayPnLPercent: 12.5,
        weekPnL: 8234.67,
        monthPnL: 24567.89,
        totalTrades: 156,
        winRate: 73.2,
        activePositions: 8,
        subscribers: 1247
      }
    ];

    const mockTrades: LiveTrade[] = [
      {
        id: '1',
        algorithm: 'Momentum Scalper',
        symbol: 'BTC-USDT',
        side: 'buy',
        quantity: 0.5,
        price: 43250.67,
        profit: 247.32,
        profitPercent: 2.3,
        timestamp: new Date(),
        status: 'open'
      }
    ];

    setAlgorithmStats(mockStats);
    setLiveTrades(mockTrades);
  }, []);

  const totalStats = {
    totalPnL: algorithmStats.reduce((sum, algo) => sum + algo.todayPnL, 0),
    totalTrades: algorithmStats.reduce((sum, algo) => sum + algo.totalTrades, 0),
    avgWinRate: algorithmStats.reduce((sum, algo) => sum + algo.winRate, 0) / algorithmStats.length,
    totalSubscribers: algorithmStats.reduce((sum, algo) => sum + algo.subscribers, 0)
  };

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 min-h-screen">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          Live Trading Results
        </h1>
        <div className="inline-flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-full font-semibold text-sm mb-6">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
          LIVE TRADING
        </div>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 border-l-4 border-l-green-500"
        >
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-8 h-8 text-green-400" />
            <span className="text-green-400 text-sm font-medium">+12.5%</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            ${totalStats.totalPnL.toLocaleString()}
          </div>
          <div className="text-slate-400 text-sm">Total P&L Today</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 border-l-4 border-l-blue-500"
        >
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-8 h-8 text-blue-400" />
            <span className="text-blue-400 text-sm font-medium">Active</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {totalStats.totalTrades}
          </div>
          <div className="text-slate-400 text-sm">Total Trades</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 border-l-4 border-l-purple-500"
        >
          <div className="flex items-center justify-between mb-2">
            <Target className="w-8 h-8 text-purple-400" />
            <span className="text-purple-400 text-sm font-medium">Avg</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {totalStats.avgWinRate.toFixed(1)}%
          </div>
          <div className="text-slate-400 text-sm">Win Rate</div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 border-l-4 border-l-orange-500"
        >
          <div className="flex items-center justify-between mb-2">
            <Users className="w-8 h-8 text-orange-400" />
            <span className="text-orange-400 text-sm font-medium">Growing</span>
          </div>
          <div className="text-2xl font-bold text-white mb-1">
            {totalStats.totalSubscribers.toLocaleString()}
          </div>
          <div className="text-slate-400 text-sm">Subscribers</div>
        </motion.div>
      </div>

      {/* Live Trades */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Live Trades</h2>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-700/50">
                <tr>
                  <th className="text-left p-4 text-slate-300 font-medium">Algorithm</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Symbol</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Side</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Quantity</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Price</th>
                  <th className="text-left p-4 text-slate-300 font-medium">P&L</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Status</th>
                  <th className="text-left p-4 text-slate-300 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {liveTrades.map((trade) => (
                    <motion.tr
                      key={trade.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="p-4 text-white font-medium">{trade.algorithm}</td>
                      <td className="p-4 text-slate-300">{trade.symbol}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          trade.side === 'buy' 
                            ? 'bg-green-500/20 text-green-400' 
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {trade.side === 'buy' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                          {trade.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4 text-slate-300">{trade.quantity.toFixed(4)}</td>
                      <td className="p-4 text-white">${trade.price.toLocaleString()}</td>
                      <td className="p-4">
                        <span className={`font-semibold ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${trade.profit.toFixed(2)} ({trade.profitPercent.toFixed(1)}%)
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          trade.status === 'open' 
                            ? 'bg-blue-500/20 text-blue-400' 
                            : 'bg-gray-500/20 text-gray-400'
                        }`}>
                          {trade.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400 text-sm">
                        {trade.timestamp.toLocaleTimeString()}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Algorithm Performance */}
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Algorithm Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {algorithmStats.map((algo, index) => (
            <motion.div
              key={algo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6"
            >
              <h3 className="text-xl font-semibold text-white mb-4">{algo.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Today P&L</div>
                  <div className={`text-sm font-semibold ${algo.todayPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    ${algo.todayPnL.toLocaleString()}
                  </div>
                </div>
                <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Win Rate</div>
                  <div className="text-sm font-semibold text-white">{algo.winRate}%</div>
                </div>
                <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Trades</div>
                  <div className="text-sm font-semibold text-white">{algo.totalTrades}</div>
                </div>
                <div className="text-center p-3 bg-slate-900/50 rounded-lg">
                  <div className="text-xs text-slate-400 mb-1">Subscribers</div>
                  <div className="text-sm font-semibold text-white">{algo.subscribers}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LiveTradingResults;
