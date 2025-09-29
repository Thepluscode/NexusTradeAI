// Bot Performance Tracker Component
// Real-time monitoring of automated trading bot performance and metrics

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Target,
  Shield,
  Zap,
  Clock,
  BarChart3,
  AlertTriangle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface BotStrategy {
  name: string;
  type: 'AI' | 'Traditional';
  isActive: boolean;
  performance: {
    totalTrades: number;
    winRate: number;
    profitFactor: number;
    totalPnL: number;
    avgConfidence: number;
    lastSignal: string;
  };
}

interface BotPerformance {
  botId: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'STOPPED';
  strategies: BotStrategy[];
  overallMetrics: {
    totalTrades: number;
    winRate: number;
    totalPnL: number;
    totalPnLPercent: number;
    maxDrawdown: number;
    profitFactor: number;
    sharpeRatio: number;
    activeTrades: number;
    dailyPnL: number;
    monthlyReturn: number;
  };
  performanceHistory: Array<{
    timestamp: string;
    value: number;
    pnl: number;
    pnlPercent: number;
    activeTrades: number;
  }>;
  riskMetrics: {
    currentDrawdown: number;
    maxRiskPerTrade: number;
    maxConcurrentTrades: number;
    riskUtilization: number;
  };
}

interface BotPerformanceTrackerProps {
  bots: BotPerformance[];
  onStartBot?: (botId: string) => void;
  onPauseBot?: (botId: string) => void;
  onStopBot?: (botId: string) => void;
  onConfigureBot?: (botId: string) => void;
}

const BotPerformanceTracker: React.FC<BotPerformanceTrackerProps> = ({
  bots,
  onStartBot,
  onPauseBot,
  onStopBot,
  onConfigureBot
}) => {
  const [selectedBot, setSelectedBot] = useState<string>(bots[0]?.botId || '');
  const [timeframe, setTimeframe] = useState<'1H' | '1D' | '1W' | '1M'>('1D');

  const selectedBotData = bots.find(bot => bot.botId === selectedBot);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format percentage
  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'PAUSED': return 'bg-yellow-100 text-yellow-800';
      case 'STOPPED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Get P&L color
  const getPnLColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  // Calculate aggregate metrics
  const aggregateMetrics = bots.reduce((acc, bot) => {
    acc.totalPnL += bot.overallMetrics.totalPnL;
    acc.totalTrades += bot.overallMetrics.totalTrades;
    acc.activeBots += bot.status === 'ACTIVE' ? 1 : 0;
    acc.activeTrades += bot.overallMetrics.activeTrades;
    return acc;
  }, { totalPnL: 0, totalTrades: 0, activeBots: 0, activeTrades: 0 });

  // Prepare strategy performance data for pie chart
  const strategyData = selectedBotData?.strategies.map((strategy, index) => ({
    name: strategy.name,
    value: strategy.performance.totalPnL,
    color: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]
  })) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Bot Performance</h2>
          <p className="text-gray-600">Real-time monitoring of automated trading bots</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <select 
            value={selectedBot} 
            onChange={(e) => setSelectedBot(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {bots.map(bot => (
              <option key={bot.botId} value={bot.botId}>{bot.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Aggregate Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Active Bots</p>
                <p className="text-2xl font-bold">{aggregateMetrics.activeBots}</p>
                <p className="text-sm text-gray-500">of {bots.length} total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Total P&L</p>
                <p className={`text-2xl font-bold ${getPnLColor(aggregateMetrics.totalPnL)}`}>
                  {formatCurrency(aggregateMetrics.totalPnL)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Active Trades</p>
                <p className="text-2xl font-bold">{aggregateMetrics.activeTrades}</p>
                <p className="text-sm text-gray-500">{aggregateMetrics.totalTrades} total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Avg Win Rate</p>
                <p className="text-2xl font-bold text-orange-600">
                  {bots.length > 0 
                    ? `${(bots.reduce((sum, bot) => sum + bot.overallMetrics.winRate, 0) / bots.length * 100).toFixed(1)}%`
                    : '0%'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selected Bot Details */}
      {selectedBotData && (
        <div className="space-y-6">
          {/* Bot Status and Controls */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bot className="h-6 w-6 text-blue-600" />
                  <div>
                    <CardTitle>{selectedBotData.name}</CardTitle>
                    <p className="text-sm text-gray-600">Bot ID: {selectedBotData.botId}</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-3">
                  <Badge className={getStatusColor(selectedBotData.status)}>
                    {selectedBotData.status}
                  </Badge>
                  
                  <div className="flex space-x-2">
                    {selectedBotData.status === 'STOPPED' && onStartBot && (
                      <Button size="sm" onClick={() => onStartBot(selectedBotData.botId)}>
                        Start
                      </Button>
                    )}
                    {selectedBotData.status === 'ACTIVE' && onPauseBot && (
                      <Button size="sm" variant="outline" onClick={() => onPauseBot(selectedBotData.botId)}>
                        Pause
                      </Button>
                    )}
                    {selectedBotData.status !== 'STOPPED' && onStopBot && (
                      <Button size="sm" variant="destructive" onClick={() => onStopBot(selectedBotData.botId)}>
                        Stop
                      </Button>
                    )}
                    {onConfigureBot && (
                      <Button size="sm" variant="outline" onClick={() => onConfigureBot(selectedBotData.botId)}>
                        Configure
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Performance Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm text-gray-600">Total P&L</p>
                    <p className={`text-xl font-bold ${getPnLColor(selectedBotData.overallMetrics.totalPnL)}`}>
                      {formatCurrency(selectedBotData.overallMetrics.totalPnL)}
                    </p>
                    <p className={`text-sm ${getPnLColor(selectedBotData.overallMetrics.totalPnLPercent)}`}>
                      {formatPercent(selectedBotData.overallMetrics.totalPnLPercent)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Target className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600">Win Rate</p>
                    <p className="text-xl font-bold text-blue-600">
                      {(selectedBotData.overallMetrics.winRate * 100).toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-500">
                      PF: {selectedBotData.overallMetrics.profitFactor.toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <div>
                    <p className="text-sm text-gray-600">Max Drawdown</p>
                    <p className="text-xl font-bold text-orange-600">
                      {selectedBotData.overallMetrics.maxDrawdown.toFixed(1)}%
                    </p>
                    <p className="text-sm text-gray-500">
                      Current: {selectedBotData.riskMetrics.currentDrawdown.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Performance Chart</CardTitle>
                <div className="flex space-x-2">
                  {['1H', '1D', '1W', '1M'].map((tf) => (
                    <Button
                      key={tf}
                      variant={timeframe === tf ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTimeframe(tf as any)}
                    >
                      {tf}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedBotData.performanceHistory.slice(-50)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp" tickFormatter={(value) => new Date(value).toLocaleTimeString()} />
                    <YAxis />
                    <Tooltip 
                      formatter={(value, name) => [
                        name === 'value' ? formatCurrency(value as number) : formatPercent(value as number),
                        name === 'value' ? 'Portfolio Value' : 'P&L %'
                      ]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="pnlPercent" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Strategy Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Strategy Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedBotData.strategies.map((strategy, index) => (
                    <div key={strategy.name} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`p-2 rounded-lg ${strategy.type === 'AI' ? 'bg-purple-50' : 'bg-blue-50'}`}>
                          {strategy.type === 'AI' ? (
                            <Zap className="h-4 w-4 text-purple-600" />
                          ) : (
                            <BarChart3 className="h-4 w-4 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{strategy.name}</p>
                          <p className="text-sm text-gray-600">{strategy.type} Strategy</p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className={`font-semibold ${getPnLColor(strategy.performance.totalPnL)}`}>
                          {formatCurrency(strategy.performance.totalPnL)}
                        </p>
                        <p className="text-sm text-gray-600">
                          WR: {(strategy.performance.winRate * 100).toFixed(1)}%
                        </p>
                      </div>
                      
                      <Badge variant={strategy.isActive ? 'default' : 'secondary'}>
                        {strategy.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Risk Utilization</span>
                      <span>{selectedBotData.riskMetrics.riskUtilization.toFixed(1)}%</span>
                    </div>
                    <Progress value={selectedBotData.riskMetrics.riskUtilization} className="h-2" />
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Max Risk per Trade:</span>
                    <span className="font-semibold">{selectedBotData.riskMetrics.maxRiskPerTrade}%</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Max Concurrent Trades:</span>
                    <span className="font-semibold">{selectedBotData.riskMetrics.maxConcurrentTrades}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Current Drawdown:</span>
                    <span className="font-semibold text-orange-600">
                      {selectedBotData.riskMetrics.currentDrawdown.toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Sharpe Ratio:</span>
                    <span className="font-semibold">{selectedBotData.overallMetrics.sharpeRatio.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotPerformanceTracker;
