// Paper Trading Dashboard Component
// Real-time P&L tracking and performance metrics for paper trading accounts

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target,
  Activity,
  PieChart,
  BarChart3,
  Clock,
  AlertCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface PaperAccount {
  id: string;
  name: string;
  initialBalance: number;
  currentBalance: number;
  equity: number;
  freeMargin: number;
  performance: {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    totalPnLPercent: number;
    maxDrawdown: number;
    profitFactor: number;
    sharpeRatio: number;
    averageWin: number;
    averageLoss: number;
    largestWin: number;
    largestLoss: number;
  };
  isActive: boolean;
  createdAt: string;
  lastActivity: string;
}

interface PaperTrade {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  executionPrice: number;
  currentPrice?: number;
  unrealizedPnL: number;
  realizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'OPEN' | 'CLOSED';
  openTime: string;
  closeTime?: string;
  strategy: string;
}

interface PerformanceSnapshot {
  timestamp: string;
  balance: number;
  equity: number;
  pnl: number;
  pnlPercent: number;
  drawdown: number;
  winRate: number;
}

interface PaperTradingDashboardProps {
  account: PaperAccount;
  openPositions: PaperTrade[];
  performanceHistory: PerformanceSnapshot[];
  onStartTrading?: () => void;
  onStopTrading?: () => void;
  onCloseTrade?: (tradeId: string) => void;
}

const PaperTradingDashboard: React.FC<PaperTradingDashboardProps> = ({
  account,
  openPositions,
  performanceHistory,
  onStartTrading,
  onStopTrading,
  onCloseTrade
}) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1H' | '1D' | '1W' | '1M'>('1D');

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

  // Get P&L color
  const getPnLColor = (value: number) => {
    if (value > 0) return 'text-green-600';
    if (value < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  // Calculate unrealized P&L for open positions
  const totalUnrealizedPnL = openPositions.reduce((sum, trade) => sum + trade.unrealizedPnL, 0);

  // Prepare chart data
  const chartData = performanceHistory.slice(-50).map(snapshot => ({
    time: new Date(snapshot.timestamp).toLocaleTimeString(),
    balance: snapshot.balance,
    pnl: snapshot.pnl,
    pnlPercent: snapshot.pnlPercent
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{account.name}</h2>
          <p className="text-gray-600">Paper Trading Account</p>
        </div>
        
        <div className="flex space-x-2">
          {!account.isActive ? (
            <Button onClick={onStartTrading} className="bg-green-600 hover:bg-green-700">
              Start Trading
            </Button>
          ) : (
            <Button onClick={onStopTrading} variant="destructive">
              Stop Trading
            </Button>
          )}
          <Badge variant={account.isActive ? 'default' : 'secondary'}>
            {account.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      {/* Account Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Current Balance</p>
                <p className="text-2xl font-bold">{formatCurrency(account.currentBalance)}</p>
                <p className={`text-sm ${getPnLColor(account.performance.totalPnL)}`}>
                  {formatPercent(account.performance.totalPnLPercent)}
                </p>
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
                <p className={`text-2xl font-bold ${getPnLColor(account.performance.totalPnL)}`}>
                  {formatCurrency(account.performance.totalPnL)}
                </p>
                <p className="text-sm text-gray-600">
                  Unrealized: {formatCurrency(totalUnrealizedPnL)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Win Rate</p>
                <p className="text-2xl font-bold text-purple-600">
                  {(account.performance.winRate * 100).toFixed(1)}%
                </p>
                <p className="text-sm text-gray-600">
                  {account.performance.winningTrades}/{account.performance.totalTrades} trades
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Max Drawdown</p>
                <p className="text-2xl font-bold text-orange-600">
                  {account.performance.maxDrawdown.toFixed(1)}%
                </p>
                <p className="text-sm text-gray-600">
                  Profit Factor: {account.performance.profitFactor.toFixed(2)}
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
              {['1H', '1D', '1W', '1M'].map((timeframe) => (
                <Button
                  key={timeframe}
                  variant={selectedTimeframe === timeframe ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedTimeframe(timeframe as any)}
                >
                  {timeframe}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'balance' ? formatCurrency(value as number) : formatPercent(value as number),
                    name === 'balance' ? 'Balance' : 'P&L %'
                  ]}
                />
                <Line 
                  type="monotone" 
                  dataKey="balance" 
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

      {/* Tabs for detailed views */}
      <Tabs defaultValue="positions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="positions">Open Positions</TabsTrigger>
          <TabsTrigger value="performance">Performance Metrics</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Open Positions ({openPositions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {openPositions.length > 0 ? (
                <div className="space-y-4">
                  {openPositions.map((trade) => (
                    <div key={trade.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className={`p-2 rounded-lg ${trade.side === 'BUY' ? 'bg-green-50' : 'bg-red-50'}`}>
                          {trade.side === 'BUY' ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-semibold">{trade.symbol}</p>
                          <p className="text-sm text-gray-600">{trade.strategy}</p>
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Quantity</p>
                        <p className="font-semibold">{trade.quantity}</p>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Entry Price</p>
                        <p className="font-semibold">{formatCurrency(trade.executionPrice)}</p>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Current P&L</p>
                        <p className={`font-semibold ${getPnLColor(trade.unrealizedPnL)}`}>
                          {formatCurrency(trade.unrealizedPnL)}
                        </p>
                      </div>
                      
                      <div className="text-center">
                        <p className="text-sm text-gray-600">Open Time</p>
                        <p className="text-sm">{new Date(trade.openTime).toLocaleString()}</p>
                      </div>
                      
                      {onCloseTrade && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => onCloseTrade(trade.id)}
                        >
                          Close
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Open Positions</h3>
                  <p className="text-gray-600">Start trading to see your positions here.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Trading Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Total Trades:</span>
                  <span className="font-semibold">{account.performance.totalTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span>Winning Trades:</span>
                  <span className="font-semibold text-green-600">{account.performance.winningTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span>Losing Trades:</span>
                  <span className="font-semibold text-red-600">{account.performance.losingTrades}</span>
                </div>
                <div className="flex justify-between">
                  <span>Win Rate:</span>
                  <span className="font-semibold">{(account.performance.winRate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Profit Factor:</span>
                  <span className="font-semibold">{account.performance.profitFactor.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Risk Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span>Max Drawdown:</span>
                  <span className="font-semibold text-orange-600">{account.performance.maxDrawdown.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Sharpe Ratio:</span>
                  <span className="font-semibold">{account.performance.sharpeRatio.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Average Win:</span>
                  <span className="font-semibold text-green-600">{formatCurrency(account.performance.averageWin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Average Loss:</span>
                  <span className="font-semibold text-red-600">{formatCurrency(account.performance.averageLoss)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Largest Win:</span>
                  <span className="font-semibold text-green-600">{formatCurrency(account.performance.largestWin)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Largest Loss:</span>
                  <span className="font-semibold text-red-600">{formatCurrency(account.performance.largestLoss)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Trade History</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Trade history will be displayed here.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PaperTradingDashboard;
