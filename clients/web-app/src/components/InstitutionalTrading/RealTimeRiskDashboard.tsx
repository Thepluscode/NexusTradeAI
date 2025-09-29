import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  ShieldExclamationIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  CpuChipIcon,
  ClockIcon,
  BanknotesIcon,
  ScaleIcon,
  GlobeAltIcon,
} from '@heroicons/react/24/outline';

interface VaRMetrics {
  var95: { parametric: number; historical: number; monteCarlo: number };
  var99: { parametric: number; historical: number; monteCarlo: number };
  expectedShortfall: number;
  conditionalVaR: number;
}

interface StressTestResults {
  scenarios: {
    marketCrash2008: { portfolioImpact: number; probability: number };
    covidCrash2020: { portfolioImpact: number; probability: number };
    flashCrash: { portfolioImpact: number; probability: number };
    interestRateShock: { portfolioImpact: number; probability: number };
    currencyCrisis: { portfolioImpact: number; probability: number };
  };
  worstCaseScenario: { impact: number; scenario: string };
  averageImpact: number;
}

interface LiquidityRisk {
  liquidityScore: number;
  timeToLiquidate: number; // hours
  marketImpactCost: number;
  bidAskSpreadRisk: number;
  volumeRisk: number;
}

interface CounterpartyRisk {
  totalExposure: number;
  creditRatings: { [counterparty: string]: { rating: string; exposure: number; riskScore: number } };
  concentrationRisk: number;
  defaultProbabilities: { [counterparty: string]: number };
}

interface RealTimeRiskDashboardProps {
  portfolioId: string;
  refreshInterval?: number;
}

const RealTimeRiskDashboard: React.FC<RealTimeRiskDashboardProps> = ({
  portfolioId,
  refreshInterval = 1000
}) => {
  const dispatch = useAppDispatch();
  const { portfolio, positions } = useAppSelector((state) => state.portfolio);
  
  const [varMetrics, setVarMetrics] = useState<VaRMetrics | null>(null);
  const [stressTests, setStressTests] = useState<StressTestResults | null>(null);
  const [liquidityRisk, setLiquidityRisk] = useState<LiquidityRisk | null>(null);
  const [counterpartyRisk, setCounterpartyRisk] = useState<CounterpartyRisk | null>(null);
  const [riskAlerts, setRiskAlerts] = useState<any[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Real-time risk calculation
  const calculateComprehensiveRisk = useCallback(async () => {
    if (isCalculating) return;
    
    setIsCalculating(true);
    try {
      const response = await fetch('/api/risk/comprehensive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId,
          positions,
          confidenceLevels: [0.95, 0.99],
          methods: ['parametric', 'historical', 'monteCarlo'],
          stressTestScenarios: [
            'marketCrash2008',
            'covidCrash2020', 
            'flashCrash',
            'interestRateShock',
            'currencyCrisis'
          ]
        })
      });

      const riskData = await response.json();

      // Check if riskData and riskMetrics exist before accessing properties
      if (riskData && riskData.riskMetrics) {
        setVarMetrics(riskData.riskMetrics.var || {});
        setStressTests(riskData.riskMetrics.stressTests || []);
        setLiquidityRisk(riskData.riskMetrics.liquidity || {});
        setCounterpartyRisk(riskData.riskMetrics.counterparty || {});
        setRiskAlerts(riskData.alerts || []);
        setLastUpdate(new Date());
      }
      
    } catch (error) {
      console.error('Risk calculation failed:', error);
    } finally {
      setIsCalculating(false);
    }
  }, [portfolioId, positions, isCalculating]);

  // Real-time updates
  useEffect(() => {
    calculateComprehensiveRisk();
    const interval = setInterval(calculateComprehensiveRisk, refreshInterval);
    return () => clearInterval(interval);
  }, [calculateComprehensiveRisk, refreshInterval]);

  const getRiskLevelColor = (value: number, thresholds: { low: number; medium: number }) => {
    if (value <= thresholds.low) return 'text-green-500 bg-green-100 dark:bg-green-900/30';
    if (value <= thresholds.medium) return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30';
    return 'text-red-500 bg-red-100 dark:bg-red-900/30';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <ShieldExclamationIcon className="h-6 w-6 mr-3 text-red-500" />
            Real-Time Risk Management
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Institutional-grade risk monitoring and analysis
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">Last Update</div>
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {lastUpdate.toLocaleTimeString()}
            </div>
          </div>
          
          {isCalculating && (
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-blue-600 dark:text-blue-400">Calculating...</span>
            </div>
          )}
        </div>
      </div>

      {/* Risk Alerts */}
      {riskAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4"
        >
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-300 mb-3 flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
            Risk Alerts ({riskAlerts.length})
          </h3>
          <div className="space-y-2">
            {riskAlerts.map((alert, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{alert.message}</div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">{alert.details}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  alert.severity === 'HIGH' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                  alert.severity === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                  'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                }`}>
                  {alert.severity}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Value at Risk (VaR) */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2 text-blue-500" />
            Value at Risk (VaR)
          </h3>
          
          {varMetrics && (
            <div className="space-y-4">
              {/* VaR 95% */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  95% Confidence Level
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Parametric</div>
                    <div className="font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(varMetrics.var95.parametric)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Historical</div>
                    <div className="font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(varMetrics.var95.historical)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Monte Carlo</div>
                    <div className="font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(varMetrics.var95.monteCarlo)}
                    </div>
                  </div>
                </div>
              </div>

              {/* VaR 99% */}
              <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  99% Confidence Level
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Parametric</div>
                    <div className="font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(varMetrics.var99.parametric)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Historical</div>
                    <div className="font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(varMetrics.var99.historical)}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Monte Carlo</div>
                    <div className="font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(varMetrics.var99.monteCarlo)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Expected Shortfall */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-sm text-red-600 dark:text-red-400">Expected Shortfall</div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-300">
                    {formatCurrency(varMetrics.expectedShortfall)}
                  </div>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-sm text-red-600 dark:text-red-400">Conditional VaR</div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-300">
                    {formatCurrency(varMetrics.conditionalVaR)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Stress Testing */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <CpuChipIcon className="h-5 w-5 mr-2 text-purple-500" />
            Stress Test Results
          </h3>
          
          {stressTests && (
            <div className="space-y-4">
              {Object.entries(stressTests.scenarios).map(([scenario, data]) => (
                <div key={scenario} className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {scenario.replace(/([A-Z])/g, ' $1').replace(/^\w/, c => c.toUpperCase())}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatPercentage(data.probability)} probability
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">
                      {formatCurrency(data.portfolioImpact)}
                    </div>
                    <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-red-500 h-2 rounded-full"
                        style={{ width: `${Math.min(Math.abs(data.portfolioImpact) / 1000000 * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* Worst Case Scenario */}
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="text-sm font-medium text-red-700 dark:text-red-300 mb-1">
                  Worst Case Scenario: {stressTests.worstCaseScenario.scenario}
                </div>
                <div className="text-xl font-bold text-red-800 dark:text-red-200">
                  {formatCurrency(stressTests.worstCaseScenario.impact)}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Liquidity Risk */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <ClockIcon className="h-5 w-5 mr-2 text-yellow-500" />
            Liquidity Risk Analysis
          </h3>
          
          {liquidityRisk && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Liquidity Score</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                    {liquidityRisk.liquidityScore.toFixed(1)}/10
                  </div>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Time to Liquidate</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                    {liquidityRisk.timeToLiquidate.toFixed(1)}h
                  </div>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Market Impact</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                    {formatPercentage(liquidityRisk.marketImpactCost)}
                  </div>
                </div>
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Spread Risk</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                    {formatPercentage(liquidityRisk.bidAskSpreadRisk)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Counterparty Risk */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <BanknotesIcon className="h-5 w-5 mr-2 text-green-500" />
            Counterparty Risk
          </h3>
          
          {counterpartyRisk && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-green-600 dark:text-green-400">Total Exposure</span>
                  <span className="text-lg font-bold text-green-700 dark:text-green-300">
                    {formatCurrency(counterpartyRisk.totalExposure)}
                  </span>
                </div>
                <div className="text-sm text-green-600 dark:text-green-400">
                  Concentration Risk: {formatPercentage(counterpartyRisk.concentrationRisk)}
                </div>
              </div>

              <div className="space-y-2">
                {Object.entries(counterpartyRisk.creditRatings).slice(0, 5).map(([counterparty, data]) => (
                  <div key={counterparty} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{counterparty}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Rating: {data.rating} | Risk Score: {data.riskScore.toFixed(1)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-gray-900 dark:text-white">
                        {formatCurrency(data.exposure)}
                      </div>
                      <div className="text-sm text-red-600 dark:text-red-400">
                        {formatPercentage(counterpartyRisk.defaultProbabilities[counterparty] || 0)} default risk
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RealTimeRiskDashboard;
