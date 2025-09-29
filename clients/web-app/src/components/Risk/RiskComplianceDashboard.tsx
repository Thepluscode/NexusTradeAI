import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  Activity,
  Clock,
  FileText,
  Download,
  Upload,
  Settings,
  RefreshCw,
  Eye,
  EyeOff,
  Target,
  Zap,
  Database,
  Globe,
  Lock,
  Users,
  Calendar,
  DollarSign
} from 'lucide-react';

interface VaRMetrics {
  var95_1d: number;
  var99_1d: number;
  var95_10d: number;
  expectedShortfall: number;
  conditionalVaR: number;
  incrementalVaR: number;
  componentVaR: { [key: string]: number };
}

interface StressTestResult {
  scenario: string;
  description: string;
  portfolioImpact: number;
  impactPercent: number;
  probability: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigationActions: string[];
}

interface ComplianceCheck {
  rule: string;
  status: 'compliant' | 'warning' | 'violation';
  description: string;
  lastChecked: Date;
  nextCheck: Date;
  details: string;
  remediation?: string;
}

interface RegulatoryReport {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
  status: 'pending' | 'generating' | 'ready' | 'submitted';
  dueDate: Date;
  lastSubmitted?: Date;
  size?: string;
}

interface LimitMonitoring {
  category: string;
  current: number;
  limit: number;
  utilization: number;
  status: 'safe' | 'warning' | 'breach';
  description: string;
}

const RiskComplianceDashboard: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1D');
  const [showSensitiveData, setShowSensitiveData] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Mock data - would be fetched from risk management service
  const [varMetrics] = useState<VaRMetrics>({
    var95_1d: -125000,
    var99_1d: -187500,
    var95_10d: -395000,
    expectedShortfall: -225000,
    conditionalVaR: -275000,
    incrementalVaR: -45000,
    componentVaR: {
      'US Equities': -75000,
      'International Equities': -30000,
      'Fixed Income': -15000,
      'Commodities': -5000
    }
  });

  const [stressTests] = useState<StressTestResult[]>([
    {
      scenario: 'Market Crash 2008',
      description: 'Severe market downturn similar to 2008 financial crisis',
      portfolioImpact: -485000,
      impactPercent: -38.8,
      probability: 0.05,
      severity: 'critical',
      mitigationActions: ['Increase cash position', 'Hedge with put options', 'Reduce leverage']
    },
    {
      scenario: 'Interest Rate Shock',
      description: 'Sudden 200bp increase in interest rates',
      portfolioImpact: -125000,
      impactPercent: -10.0,
      probability: 0.15,
      severity: 'high',
      mitigationActions: ['Duration hedging', 'Floating rate instruments']
    },
    {
      scenario: 'Currency Crisis',
      description: 'Major currency devaluation affecting international positions',
      portfolioImpact: -75000,
      impactPercent: -6.0,
      probability: 0.10,
      severity: 'medium',
      mitigationActions: ['Currency hedging', 'Reduce FX exposure']
    },
    {
      scenario: 'Liquidity Crunch',
      description: 'Severe market liquidity constraints',
      portfolioImpact: -95000,
      impactPercent: -7.6,
      probability: 0.08,
      severity: 'high',
      mitigationActions: ['Maintain cash reserves', 'Diversify funding sources']
    }
  ]);

  const [complianceChecks] = useState<ComplianceCheck[]>([
    {
      rule: 'Position Concentration Limits',
      status: 'compliant',
      description: 'Maximum 5% position size per security',
      lastChecked: new Date(),
      nextCheck: new Date(Date.now() + 24 * 60 * 60 * 1000),
      details: 'All positions within limits. Largest position: 4.2%'
    },
    {
      rule: 'Leverage Constraints',
      status: 'warning',
      description: 'Maximum 3:1 leverage ratio',
      lastChecked: new Date(),
      nextCheck: new Date(Date.now() + 24 * 60 * 60 * 1000),
      details: 'Current leverage: 2.8:1. Approaching limit.',
      remediation: 'Consider reducing leveraged positions'
    },
    {
      rule: 'Liquidity Requirements',
      status: 'compliant',
      description: 'Minimum 10% cash or cash equivalents',
      lastChecked: new Date(),
      nextCheck: new Date(Date.now() + 24 * 60 * 60 * 1000),
      details: 'Current liquidity: 12.5%. Above minimum requirement.'
    },
    {
      rule: 'Sector Concentration',
      status: 'violation',
      description: 'Maximum 25% allocation per sector',
      lastChecked: new Date(),
      nextCheck: new Date(Date.now() + 24 * 60 * 60 * 1000),
      details: 'Technology sector: 28.5%. Exceeds limit by 3.5%',
      remediation: 'Reduce technology exposure or increase other sectors'
    }
  ]);

  const [regulatoryReports] = useState<RegulatoryReport[]>([
    {
      id: 'FORM_PF_Q1',
      name: 'Form PF - Q1 2024',
      type: 'quarterly',
      status: 'ready',
      dueDate: new Date('2024-05-15'),
      lastSubmitted: new Date('2024-02-14'),
      size: '2.4 MB'
    },
    {
      id: 'DAILY_RISK_RPT',
      name: 'Daily Risk Report',
      type: 'daily',
      status: 'generating',
      dueDate: new Date(),
      size: '1.2 MB'
    },
    {
      id: 'MONTHLY_COMPLIANCE',
      name: 'Monthly Compliance Report',
      type: 'monthly',
      status: 'pending',
      dueDate: new Date('2024-04-05')
    }
  ]);

  const [limitMonitoring] = useState<LimitMonitoring[]>([
    {
      category: 'Single Name Concentration',
      current: 4.2,
      limit: 5.0,
      utilization: 84,
      status: 'warning',
      description: 'Largest single position as % of portfolio'
    },
    {
      category: 'Sector Concentration',
      current: 28.5,
      limit: 25.0,
      utilization: 114,
      status: 'breach',
      description: 'Technology sector allocation'
    },
    {
      category: 'Leverage Ratio',
      current: 2.8,
      limit: 3.0,
      utilization: 93,
      status: 'warning',
      description: 'Total portfolio leverage'
    },
    {
      category: 'Cash Minimum',
      current: 12.5,
      limit: 10.0,
      utilization: 125,
      status: 'safe',
      description: 'Minimum liquidity requirement'
    }
  ]);

  const timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y'];

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate API call to risk management service
      await new Promise(resolve => setTimeout(resolve, 2000));
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error refreshing risk data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'compliant':
      case 'safe':
      case 'ready':
        return 'text-green-400';
      case 'warning':
      case 'generating':
        return 'text-yellow-400';
      case 'violation':
      case 'breach':
      case 'pending':
        return 'text-red-400';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'compliant':
      case 'safe':
      case 'ready':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'warning':
      case 'generating':
        return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
      case 'violation':
      case 'breach':
      case 'pending':
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 via-orange-400 to-yellow-400 bg-clip-text text-transparent">
              Risk Management & Compliance
            </h1>
            <p className="text-slate-400 mt-1 flex items-center space-x-2">
              <Shield className="w-4 h-4" />
              <span>Enterprise-grade risk monitoring and regulatory compliance</span>
              <span className="text-xs">•</span>
              <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
            </p>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex space-x-1">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setSelectedTimeframe(tf)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    selectedTimeframe === tf
                      ? 'bg-red-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowSensitiveData(!showSensitiveData)}
              className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
            >
              {showSensitiveData ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="text-sm">{showSensitiveData ? 'Hide' : 'Show'} Values</span>
            </button>
            
            <button
              onClick={refreshData}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </motion.div>

        {/* VaR Metrics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center space-x-2 mb-6">
            <Target className="w-5 h-5 text-red-400" />
            <h2 className="text-xl font-semibold">Value at Risk (VaR) Analysis</h2>
            <div className="flex items-center space-x-1 text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded">
              <Activity className="w-3 h-3" />
              <span>Real-time</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">VaR 95% (1D)</span>
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-2xl font-bold text-red-400">
                {showSensitiveData ? formatCurrency(varMetrics.var95_1d) : '••••••'}
              </div>
              <div className="text-sm text-slate-400">Daily risk exposure</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">VaR 99% (1D)</span>
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <div className="text-2xl font-bold text-red-400">
                {showSensitiveData ? formatCurrency(varMetrics.var99_1d) : '••••••'}
              </div>
              <div className="text-sm text-slate-400">Extreme scenarios</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Expected Shortfall</span>
                <BarChart3 className="w-4 h-4 text-orange-400" />
              </div>
              <div className="text-2xl font-bold text-orange-400">
                {showSensitiveData ? formatCurrency(varMetrics.expectedShortfall) : '••••••'}
              </div>
              <div className="text-sm text-slate-400">Tail risk measure</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-sm">Incremental VaR</span>
                <Activity className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-purple-400">
                {showSensitiveData ? formatCurrency(varMetrics.incrementalVaR) : '••••••'}
              </div>
              <div className="text-sm text-slate-400">Marginal contribution</div>
            </div>
          </div>
        </motion.div>

        {/* Stress Tests & Compliance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stress Test Results */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center space-x-2 mb-6">
              <AlertTriangle className="w-5 h-5 text-orange-400" />
              <h3 className="text-lg font-semibold">Stress Test Results</h3>
            </div>

            <div className="space-y-4">
              {stressTests.map((test, index) => (
                <motion.div
                  key={test.scenario}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{test.scenario}</h4>
                      <div className={`px-2 py-1 rounded text-xs font-medium mt-1 ${
                        test.severity === 'critical' ? 'bg-red-600/20 text-red-400' :
                        test.severity === 'high' ? 'bg-orange-600/20 text-orange-400' :
                        test.severity === 'medium' ? 'bg-yellow-600/20 text-yellow-400' :
                        'bg-green-600/20 text-green-400'
                      }`}>
                        {test.severity.toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-red-400">
                        {showSensitiveData ? formatCurrency(test.portfolioImpact) : '••••••'}
                      </div>
                      <div className="text-sm text-red-400">
                        {formatPercentage(test.impactPercent)}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 mb-3">{test.description}</p>

                  <div className="flex justify-between text-xs text-slate-400 mb-3">
                    <span>Probability: {(test.probability * 100).toFixed(1)}%</span>
                    <span>Severity: {test.severity}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">Mitigation Actions:</div>
                    {test.mitigationActions.map((action, actionIndex) => (
                      <div key={actionIndex} className="text-xs text-slate-300 bg-slate-800/50 rounded px-2 py-1">
                        • {action}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Compliance Monitoring */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center space-x-2 mb-6">
              <Shield className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold">Compliance Monitoring</h3>
            </div>

            <div className="space-y-4">
              {complianceChecks.map((check, index) => (
                <motion.div
                  key={check.rule}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(check.status)}
                      <span className="font-semibold">{check.rule}</span>
                    </div>
                    <span className={`text-sm font-medium ${getStatusColor(check.status)}`}>
                      {check.status.toUpperCase()}
                    </span>
                  </div>

                  <p className="text-sm text-slate-300 mb-3">{check.description}</p>
                  <p className="text-xs text-slate-400 mb-3">{check.details}</p>

                  {check.remediation && (
                    <div className="p-2 bg-yellow-900/20 border border-yellow-500/30 rounded text-xs text-yellow-400">
                      <strong>Remediation:</strong> {check.remediation}
                    </div>
                  )}

                  <div className="flex justify-between text-xs text-slate-400 mt-3">
                    <span>Last checked: {check.lastChecked.toLocaleTimeString()}</span>
                    <span>Next check: {check.nextCheck.toLocaleTimeString()}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Limit Monitoring & Regulatory Reports */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Limit Monitoring */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center space-x-2 mb-6">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              <h3 className="text-lg font-semibold">Limit Monitoring</h3>
            </div>

            <div className="space-y-4">
              {limitMonitoring.map((limit, index) => (
                <motion.div
                  key={limit.category}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="bg-slate-900/50 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">{limit.category}</span>
                    <div className={`px-2 py-1 rounded text-xs font-medium ${
                      limit.status === 'safe' ? 'bg-green-600/20 text-green-400' :
                      limit.status === 'warning' ? 'bg-yellow-600/20 text-yellow-400' :
                      'bg-red-600/20 text-red-400'
                    }`}>
                      {limit.status.toUpperCase()}
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Current / Limit:</span>
                      <span className="font-medium">
                        {limit.current.toFixed(1)}% / {limit.limit.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded">
                      <div
                        className={`h-full rounded transition-all duration-300 ${
                          limit.status === 'safe' ? 'bg-green-400' :
                          limit.status === 'warning' ? 'bg-yellow-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${Math.min(limit.utilization, 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">{limit.description}</span>
                    <span className={`font-medium ${
                      limit.status === 'safe' ? 'text-green-400' :
                      limit.status === 'warning' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {limit.utilization.toFixed(0)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Regulatory Reports */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-green-400" />
                <h3 className="text-lg font-semibold">Regulatory Reports</h3>
              </div>
              <button className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-sm transition-colors">
                <Download className="w-4 h-4" />
                <span>Export All</span>
              </button>
            </div>

            <div className="space-y-4">
              {regulatoryReports.map((report, index) => (
                <motion.div
                  key={report.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{report.name}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          report.type === 'daily' ? 'bg-blue-600/20 text-blue-400' :
                          report.type === 'weekly' ? 'bg-green-600/20 text-green-400' :
                          report.type === 'monthly' ? 'bg-purple-600/20 text-purple-400' :
                          report.type === 'quarterly' ? 'bg-orange-600/20 text-orange-400' :
                          'bg-red-600/20 text-red-400'
                        }`}>
                          {report.type.toUpperCase()}
                        </span>
                        <span className={`text-xs font-medium ${getStatusColor(report.status)}`}>
                          {report.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      {report.status === 'ready' && (
                        <button className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded text-xs transition-colors">
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400">Due Date:</span>
                      <div className="font-medium">{report.dueDate.toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Size:</span>
                      <div className="font-medium">{report.size || 'N/A'}</div>
                    </div>
                    {report.lastSubmitted && (
                      <div className="col-span-2">
                        <span className="text-slate-400">Last Submitted:</span>
                        <div className="font-medium">{report.lastSubmitted.toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Risk Summary & Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center space-x-2 mb-6">
            <Zap className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold">Risk Summary & Recommended Actions</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <XCircle className="w-5 h-5 text-red-400" />
                <span className="font-medium text-red-400">Critical Issues</span>
              </div>
              <div className="text-2xl font-bold text-red-400 mb-2">2</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Sector concentration breach</li>
                <li>• Stress test critical scenario</li>
              </ul>
            </div>

            <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                <span className="font-medium text-yellow-400">Warnings</span>
              </div>
              <div className="text-2xl font-bold text-yellow-400 mb-2">3</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Leverage approaching limit</li>
                <li>• Position concentration high</li>
                <li>• Pending compliance report</li>
              </ul>
            </div>

            <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium text-green-400">Compliant</span>
              </div>
              <div className="text-2xl font-bold text-green-400 mb-2">8</div>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• Liquidity requirements met</li>
                <li>• VaR within acceptable range</li>
                <li>• Most limits compliant</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <div className="flex items-center space-x-2 mb-3">
              <Target className="w-5 h-5 text-blue-400" />
              <span className="font-medium text-blue-400">Immediate Actions Required</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="font-medium text-slate-300 mb-2">High Priority:</div>
                <ul className="space-y-1 text-slate-400">
                  <li>• Reduce technology sector exposure by 3.5%</li>
                  <li>• Submit monthly compliance report</li>
                  <li>• Review leverage positions</li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-slate-300 mb-2">Medium Priority:</div>
                <ul className="space-y-1 text-slate-400">
                  <li>• Update stress test scenarios</li>
                  <li>• Review position concentration limits</li>
                  <li>• Schedule compliance review meeting</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RiskComplianceDashboard;
