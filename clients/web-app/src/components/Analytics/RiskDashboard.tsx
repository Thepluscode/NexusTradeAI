// /clients/web-app/src/components/Analytics/RiskDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Activity,
  Target,
  Zap,
  Brain,
  BarChart3,
  PieChart,
  LineChart,
  Settings,
  RefreshCw,
  Download,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Percent,
  Globe,
  Users,
  Eye,
  EyeOff
} from 'lucide-react';

interface RiskMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  status: 'safe' | 'warning' | 'danger';
  threshold: number;
  change24h: number;
  description: string;
}

interface PortfolioRisk {
  var1Day: number;
  var1Week: number;
  expectedShortfall: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinRatio: number;
  beta: number;
  correlation: number;
}

interface ConcentrationRisk {
  sector: string;
  allocation: number;
  risk: 'low' | 'medium' | 'high';
  positions: number;
}

interface StressTest {
  scenario: string;
  description: string;
  portfolioImpact: number;
  probability: number;
  timePeriod: string;
  lastUpdate: Date;
}

interface RiskLimit {
  id: string;
  name: string;
  current: number;
  limit: number;
  utilization: number;
  status: 'safe' | 'warning' | 'breach';
}

const RiskDashboard: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('1W');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showSensitiveData, setShowSensitiveData] = useState(true);
  const [selectedStressTest, setSelectedStressTest] = useState<string>('market_crash');

  const [riskMetrics] = useState<RiskMetric[]>([
    {
      id: 'var_1d',
      name: 'Value at Risk (1D)',
      value: 2.3,
      unit: '%',
      status: 'safe',
      threshold: 3.0,
      change24h: -0.1,
      description: '95% confidence level'
    },
    {
      id: 'var_1w',
      name: 'Value at Risk (1W)',
      value: 5.7,
      unit: '%',
      status: 'warning',
      threshold: 6.0,
      change24h: 0.3,
      description: '95% confidence level'
    },
    {
      id: 'max_drawdown',
      name: 'Maximum Drawdown',
      value: 8.4,
      unit: '%',
      status: 'safe',
      threshold: 12.0,
      change24h: -0.2,
      description: 'Historical peak-to-trough decline'
    },
    {
      id: 'leverage',
      name: 'Portfolio Leverage',
      value: 1.8,
      unit: 'x',
      status: 'safe',
      threshold: 3.0,
      change24h: 0.1,
      description: 'Total exposure / equity'
    },
    {
      id: 'liquidity',
      name: 'Liquidity Score',
      value: 87,
      unit: '/100',
      status: 'safe',
      threshold: 70,
      change24h: 2,
      description: 'Portfolio liquidity rating'
    },
    {
      id: 'concentration',
      name: 'Concentration Risk',
      value: 23.4,
      unit: '%',
      status: 'warning',
      threshold: 25.0,
      change24h: 1.2,
      description: 'Largest position percentage'
    }
  ]);

  const [portfolioRisk] = useState<PortfolioRisk>({
    var1Day: 28750,
    var1Week: 71250,
    expectedShortfall: 42300,
    maxDrawdown: 105000,
    sharpeRatio: 1.87,
    sortinRatio: 2.34,
    beta: 1.15,
    correlation: 0.78
  });

  const [concentrationRisks] = useState<ConcentrationRisk[]>([
    { sector: 'Technology', allocation: 34.2, risk: 'medium', positions: 8 },
    { sector: 'Healthcare', allocation: 18.7, risk: 'low', positions: 5 },
    { sector: 'Financial', allocation: 15.3, risk: 'medium', positions: 6 },
    { sector: 'Consumer', allocation: 12.1, risk: 'low', positions: 4 },
    { sector: 'Energy', allocation: 8.9, risk: 'high', positions: 3 },
    { sector: 'Utilities', allocation: 6.2, risk: 'low', positions: 2 },
    { sector: 'Real Estate', allocation: 4.6, risk: 'medium', positions: 2 }
  ]);

  const [stressTests] = useState<StressTest[]>([
    {
      scenario: 'market_crash',
      description: '2008-style Financial Crisis',
      portfolioImpact: -24.7,
      probability: 2.1,
      timePeriod: '6 months',
      lastUpdate: new Date()
    },
    {
      scenario: 'tech_bubble',
      description: 'Tech Sector Bubble Burst',
      portfolioImpact: -18.3,
      probability: 5.4,
      timePeriod: '3 months',
      lastUpdate: new Date()
    },
    {
      scenario: 'interest_rate_shock',
      description: 'Rapid Interest Rate Rise',
      portfolioImpact: -12.1,
      probability: 8.7,
      timePeriod: '1 month',
      lastUpdate: new Date()
    },
    {
      scenario: 'currency_crisis',
      description: 'Major Currency Devaluation',
      portfolioImpact: -15.6,
      probability: 3.2,
      timePeriod: '2 months',
      lastUpdate: new Date()
    }
  ]);

  const [riskLimits] = useState<RiskLimit[]>([
    {
      id: 'daily_var',
      name: 'Daily VaR Limit',
      current: 28750,
      limit: 50000,
      utilization: 57.5,
      status: 'safe'
    },
    {
      id: 'position_size',
      name: 'Max Position Size',
      current: 234000,
      limit: 300000,
      utilization: 78.0,
      status: 'warning'
    },
    {
      id: 'sector_concentration',
      name: 'Sector Concentration',
      current: 34.2,
      limit: 40.0,
      utilization: 85.5,
      status: 'warning'
    },
    {
      id: 'leverage_ratio',
      name: 'Leverage Ratio',
      current: 1.8,
      limit: 3.0,
      utilization: 60.0,
      status: 'safe'
    }
  ]);

  const formatCurrency = (value: number): string => {
    if (!showSensitiveData) return '••••••';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const getStatusColor = (status: 'safe' | 'warning' | 'danger' | 'breach'): string => {
    switch (status) {
      case 'safe': return 'text-green-400';
      case 'warning': return 'text-yellow-400';
      case 'danger':
      case 'breach': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: 'safe' | 'warning' | 'danger' | 'breach') => {
    switch (status) {
      case 'safe': return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'danger':
      case 'breach': return <AlertCircle className="w-4 h-4 text-red-400" />;
      default: return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  const timeframes = ['1D', '1W', '1M', '3M', '1Y'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-r from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Risk Management</h1>
              <p className="text-slate-400 text-sm">Real-time portfolio risk monitoring and analysis</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-1 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-lg">
            <Zap className="w-4 h-4" />
            <span className="text-sm font-medium">Live Monitoring</span>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Timeframe Selector */}
          <div className="flex space-x-1">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf as any)}
                className={`px-3 py-2 text-sm rounded transition-colors ${
                  selectedTimeframe === tf
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowSensitiveData(!showSensitiveData)}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
          >
            {showSensitiveData ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="text-sm">{showSensitiveData ? 'Hide' : 'Show'} Values</span>
          </button>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`p-2 rounded-lg transition-colors ${
              autoRefresh ? 'text-green-400 bg-green-400/10' : 'text-slate-400 hover:text-white hover:bg-slate-700'
            }`}
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <Download className="w-5 h-5" />
          </button>

          <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Risk Metrics Cards */}
        <div className="col-span-12">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {riskMetrics.map((metric) => (
              <div key={metric.id} className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-slate-300">{metric.name}</h3>
                  {getStatusIcon(metric.status)}
                </div>
                <div className="text-2xl font-bold mb-1">
                  {showSensitiveData ? `${metric.value}${metric.unit}` : '••••'}
                </div>
                <div className={`text-xs flex items-center ${
                  metric.change24h >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {metric.change24h >= 0 ? (
                    <TrendingUp className="w-3 h-3 mr-1" />
                  ) : (
                    <TrendingDown className="w-3 h-3 mr-1" />
                  )}
                  {metric.change24h >= 0 ? '+' : ''}{metric.change24h.toFixed(1)}{metric.unit}
                </div>
                <div className="text-xs text-slate-400 mt-1">{metric.description}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Portfolio Risk Analysis */}
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Portfolio Risk Analysis</h2>
            
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">VaR (1 Day)</div>
                <div className="text-xl font-bold">{formatCurrency(portfolioRisk.var1Day)}</div>
                <div className="text-xs text-slate-400">95% confidence</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">VaR (1 Week)</div>
                <div className="text-xl font-bold">{formatCurrency(portfolioRisk.var1Week)}</div>
                <div className="text-xs text-slate-400">95% confidence</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">Expected Shortfall</div>
                <div className="text-xl font-bold">{formatCurrency(portfolioRisk.expectedShortfall)}</div>
                <div className="text-xs text-slate-400">Conditional VaR</div>
              </div>
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="text-sm text-slate-400 mb-1">Max Drawdown</div>
                <div className="text-xl font-bold">{formatCurrency(portfolioRisk.maxDrawdown)}</div>
                <div className="text-xs text-slate-400">Historical worst</div>
              </div>
            </div>

            {/* Risk Chart Placeholder */}
            <div className="bg-slate-900/30 rounded-lg p-6 h-64 flex items-center justify-center border border-slate-700">
              <div className="text-center">
                <LineChart className="w-12 h-12 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400">Risk Evolution Chart</p>
                <p className="text-xs text-slate-500">VaR and drawdown trends over time</p>
              </div>
            </div>
          </div>

          {/* Risk Limits */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
            <h2 className="text-xl font-semibold mb-4">Risk Limits</h2>
            
            <div className="space-y-4">
              {riskLimits.map((limit) => (
                <div key={limit.id} className="bg-slate-900/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium">{limit.name}</h3>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(limit.status)}
                      <span className={`text-sm font-medium ${getStatusColor(limit.status)}`}>
                        {limit.utilization.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
                    <span>Current: {typeof limit.current === 'number' && limit.current > 1000 
                      ? formatCurrency(limit.current) 
                      : `${limit.current}${limit.name.includes('Ratio') ? 'x' : limit.name.includes('Concentration') ? '%' : ''}`}
                    </span>
                    <span>Limit: {typeof limit.limit === 'number' && limit.limit > 1000 
                      ? formatCurrency(limit.limit) 
                      : `${limit.limit}${limit.name.includes('Ratio') ? 'x' : limit.name.includes('Concentration') ? '%' : ''}`}
                    </span>
                  </div>
                  
                  <div className="w-full bg-slate-700 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all ${
                        limit.status === 'safe' ? 'bg-green-400' :
                        limit.status === 'warning' ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(limit.utilization, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Concentration Risk */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <PieChart className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold">Concentration Risk</h3>
            </div>

            <div className="space-y-3">
              {concentrationRisks.map((sector, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${
                      sector.risk === 'low' ? 'bg-green-400' :
                      sector.risk === 'medium' ? 'bg-yellow-400' : 'bg-red-400'
                    }`} />
                    <div>
                      <div className="font-medium text-sm">{sector.sector}</div>
                      <div className="text-xs text-slate-400">{sector.positions} positions</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-sm">
                      {showSensitiveData ? `${sector.allocation.toFixed(1)}%` : '••••'}
                    </div>
                    <div className={`text-xs capitalize ${
                      sector.risk === 'low' ? 'text-green-400' :
                      sector.risk === 'medium' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {sector.risk} risk
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stress Testing */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Activity className="w-5 h-5 text-red-400" />
              <h3 className="text-lg font-semibold">Stress Testing</h3>
            </div>

            <div className="space-y-3">
              {stressTests.map((test) => (
                <div 
                  key={test.scenario}
                  className={`p-4 rounded-lg border transition-colors cursor-pointer ${
                    selectedStressTest === test.scenario
                      ? 'bg-blue-900/30 border-blue-500/50'
                      : 'bg-slate-900/50 border-slate-700/50 hover:border-slate-600'
                  }`}
                  onClick={() => setSelectedStressTest(test.scenario)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-sm">{test.description}</h4>
                    <span className={`text-xs px-2 py-1 rounded ${
                      test.probability < 5 ? 'bg-green-900/30 text-green-400' :
                      test.probability < 10 ? 'bg-yellow-900/30 text-yellow-400' : 'bg-red-900/30 text-red-400'
                    }`}>
                      {test.probability.toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="space-y-1 text-xs text-slate-400">
                    <div className="flex justify-between">
                      <span>Portfolio Impact:</span>
                      <span className="text-red-400 font-medium">
                        {showSensitiveData ? `${test.portfolioImpact.toFixed(1)}%` : '••••'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Time Period:</span>
                      <span>{test.timePeriod}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-4 bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg transition-colors">
              Run Custom Stress Test
            </button>
          </div>

          {/* AI Risk Insights */}
          <div className="bg-gradient-to-r from-orange-900/20 to-orange-800/20 border border-orange-500/30 rounded-xl p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Brain className="w-5 h-5 text-orange-400" />
              <h3 className="text-lg font-semibold text-orange-400">AI Risk Insights</h3>
              <div className="flex items-center space-x-1 text-xs bg-orange-500/20 text-orange-400 px-2 py-1 rounded">
                <Zap className="w-3 h-3" />
                <span>Live</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-900/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm font-medium">Concentration Warning</span>
                </div>
                <p className="text-xs text-slate-300">
                  Technology sector allocation approaching risk threshold. Consider rebalancing.
                </p>
                <div className="text-xs text-orange-400 mt-1">Confidence: 84%</div>
              </div>

              <div className="bg-slate-900/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium">Hedging Opportunity</span>
                </div>
                <p className="text-xs text-slate-300">
                  VIX futures may provide effective portfolio hedge at current levels.
                </p>
                <div className="text-xs text-orange-400 mt-1">Confidence: 71%</div>
              </div>

              <div className="bg-slate-900/30 rounded-lg p-3">
                <div className="flex items-center space-x-2 mb-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium">Volatility Alert</span>
                </div>
                <p className="text-xs text-slate-300">
                  Increased correlation between equity positions during recent volatility spike.
                </p>
                <div className="text-xs text-orange-400 mt-1">Confidence: 92%</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskDashboard;