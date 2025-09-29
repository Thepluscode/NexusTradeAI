// Smart Alerts Dashboard Component
// Real-time display of AI-generated trading signals with confidence scores

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Target, 
  Shield,
  Activity,
  Clock,
  BarChart3
} from 'lucide-react';

interface SmartAlert {
  id: string;
  symbol: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  strategy: string;
  entry: {
    trigger: number;
    price: number;
    condition: string;
  };
  stopLoss: {
    price: number;
    atrMultiplier: number;
  };
  takeProfit: {
    price: number;
    atrMultiplier: number;
  };
  riskReward: number;
  reasoning: string;
  timestamp: number;
  status: 'ACTIVE' | 'TRIGGERED' | 'CLOSED' | 'EXPIRED';
  scores: {
    model: number;
    technical: number;
    volume: number;
    sentiment: number;
    performance: number;
  };
}

interface SmartAlertsDashboardProps {
  alerts: SmartAlert[];
  onExecuteAlert?: (alertId: string) => void;
  onDismissAlert?: (alertId: string) => void;
}

const SmartAlertsDashboard: React.FC<SmartAlertsDashboardProps> = ({
  alerts,
  onExecuteAlert,
  onDismissAlert
}) => {
  const [selectedAlert, setSelectedAlert] = useState<SmartAlert | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM'>('ALL');

  // Filter alerts based on confidence level
  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'HIGH') return alert.confidence >= 0.85;
    if (filter === 'MEDIUM') return alert.confidence >= 0.70 && alert.confidence < 0.85;
    return true;
  });

  // Get confidence level color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.85) return 'text-green-600 bg-green-50';
    if (confidence >= 0.75) return 'text-blue-600 bg-blue-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  // Get signal icon and color
  const getSignalDisplay = (signal: string) => {
    switch (signal) {
      case 'BUY':
        return { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' };
      case 'SELL':
        return { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' };
      default:
        return { icon: Activity, color: 'text-gray-600', bg: 'bg-gray-50' };
    }
  };

  // Format timestamp
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Calculate potential profit/loss
  const calculatePotentialPnL = (alert: SmartAlert) => {
    const entryPrice = alert.entry.trigger;
    const takeProfitDistance = Math.abs(alert.takeProfit.price - entryPrice);
    const stopLossDistance = Math.abs(entryPrice - alert.stopLoss.price);
    
    return {
      profit: takeProfitDistance,
      loss: stopLossDistance,
      ratio: alert.riskReward
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Smart Alerts</h2>
          <p className="text-gray-600">AI-powered trading signals with confidence scoring</p>
        </div>
        
        {/* Filter buttons */}
        <div className="flex space-x-2">
          {['ALL', 'HIGH', 'MEDIUM'].map((filterType) => (
            <Button
              key={filterType}
              variant={filter === filterType ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(filterType as any)}
            >
              {filterType}
            </Button>
          ))}
        </div>
      </div>

      {/* Alerts Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Alerts</p>
                <p className="text-2xl font-bold">{alerts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">High Confidence</p>
                <p className="text-2xl font-bold text-green-600">
                  {alerts.filter(a => a.confidence >= 0.85).length}
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
                <p className="text-sm text-gray-600">Avg Confidence</p>
                <p className="text-2xl font-bold">
                  {alerts.length > 0 
                    ? `${(alerts.reduce((sum, a) => sum + a.confidence, 0) / alerts.length * 100).toFixed(1)}%`
                    : '0%'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <BarChart3 className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm text-gray-600">Avg R:R Ratio</p>
                <p className="text-2xl font-bold">
                  {alerts.length > 0 
                    ? `${(alerts.reduce((sum, a) => sum + a.riskReward, 0) / alerts.length).toFixed(1)}:1`
                    : '0:1'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredAlerts.map((alert) => {
          const signalDisplay = getSignalDisplay(alert.signal);
          const SignalIcon = signalDisplay.icon;
          const pnl = calculatePotentialPnL(alert);

          return (
            <Card key={alert.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${signalDisplay.bg}`}>
                      <SignalIcon className={`h-5 w-5 ${signalDisplay.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{alert.symbol}</CardTitle>
                      <p className="text-sm text-gray-600">{alert.strategy}</p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <Badge className={getConfidenceColor(alert.confidence)}>
                      {(alert.confidence * 100).toFixed(1)}%
                    </Badge>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatTime(alert.timestamp)}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Signal Details */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Entry</p>
                    <p className="font-semibold">${alert.entry.trigger.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Stop Loss</p>
                    <p className="font-semibold text-red-600">${alert.stopLoss.price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Take Profit</p>
                    <p className="font-semibold text-green-600">${alert.takeProfit.price.toFixed(2)}</p>
                  </div>
                </div>

                {/* Confidence Breakdown */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Confidence Breakdown</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex justify-between">
                      <span>AI Model:</span>
                      <span>{(alert.scores.model * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Technical:</span>
                      <span>{(alert.scores.technical * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Volume:</span>
                      <span>{(alert.scores.volume * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sentiment:</span>
                      <span>{(alert.scores.sentiment * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>

                {/* Risk/Reward */}
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium">Risk:Reward</span>
                  </div>
                  <span className="text-sm font-bold text-blue-600">
                    1:{alert.riskReward.toFixed(1)}
                  </span>
                </div>

                {/* Reasoning */}
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">{alert.reasoning}</p>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-2">
                  {onExecuteAlert && (
                    <Button 
                      className="flex-1" 
                      onClick={() => onExecuteAlert(alert.id)}
                      disabled={alert.status !== 'ACTIVE'}
                    >
                      Execute Trade
                    </Button>
                  )}
                  {onDismissAlert && (
                    <Button 
                      variant="outline" 
                      onClick={() => onDismissAlert(alert.id)}
                    >
                      Dismiss
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredAlerts.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Alerts Available</h3>
            <p className="text-gray-600">
              {filter === 'ALL' 
                ? 'No smart alerts have been generated yet.'
                : `No ${filter.toLowerCase()} confidence alerts available.`
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SmartAlertsDashboard;
