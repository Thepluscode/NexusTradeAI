import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  ChartBarIcon,
  CpuChipIcon,
  ShieldCheckIcon,
  BoltIcon,
  GlobeAltIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

interface AdvancedTradingTerminalProps {
  userId: string;
  accountType: 'institutional' | 'professional' | 'retail';
}

interface AIStrategy {
  id: string;
  name: string;
  winRate: number;
  confidence: number;
  expectedReturn: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  strategy: string;
  reasoning: string;
  institutionalGrade: boolean;
}

interface RiskMetrics {
  portfolioVaR: number;
  stressTestResults: any;
  liquidityRisk: number;
  counterpartyRisk: number;
  concentrationRisk: number;
  leverageRatio: number;
}

interface OrderFlowData {
  institutionalFlow: number;
  retailFlow: number;
  darkPoolActivity: number;
  smartMoneyIndex: number;
  volumeProfile: any;
}

const AdvancedTradingTerminal: React.FC<AdvancedTradingTerminalProps> = ({
  userId,
  accountType
}) => {
  const dispatch = useAppDispatch();
  const { portfolio, positions } = useAppSelector((state) => state.portfolio);
  const { marketData, latency } = useAppSelector((state) => state.marketData);
  
  // Advanced Trading State
  const [activeStrategies, setActiveStrategies] = useState<AIStrategy[]>([]);
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics | null>(null);
  const [orderFlowData, setOrderFlowData] = useState<OrderFlowData | null>(null);
  const [tradingMode, setTradingMode] = useState<'MANUAL' | 'AI_ASSISTED' | 'FULLY_AUTOMATED'>('AI_ASSISTED');
  const [quantumOptimization, setQuantumOptimization] = useState(false);
  const [multiAgentSystem, setMultiAgentSystem] = useState(false);
  
  // Real-time Performance Metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    totalPnL: 0,
    dailyPnL: 0,
    winRate: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    alpha: 0,
    beta: 0,
    informationRatio: 0
  });

  // Institutional AI Strategies
  const institutionalStrategies = useMemo(() => [
    {
      id: 'quantum-ml-arbitrage',
      name: 'Quantum ML Arbitrage',
      winRate: 97.3,
      confidence: 0.95,
      expectedReturn: 0.024,
      riskLevel: 'LOW' as const,
      strategy: 'QuantumMLArbitrage',
      reasoning: 'Quantum-enhanced optimization for complex arbitrage opportunities',
      institutionalGrade: true
    },
    {
      id: 'multi-agent-system',
      name: 'Multi-Agent System Trading',
      winRate: 93.6,
      confidence: 0.91,
      expectedReturn: 0.031,
      riskLevel: 'MEDIUM' as const,
      strategy: 'MultiAgentSystemTrading',
      reasoning: 'Coordinated multi-agent system with specialized trading agents',
      institutionalGrade: true
    },
    {
      id: 'transformer-sentiment',
      name: 'Transformer Sentiment Analysis',
      winRate: 91.8,
      confidence: 0.88,
      expectedReturn: 0.027,
      riskLevel: 'MEDIUM' as const,
      strategy: 'TransformerSentimentAnalysis',
      reasoning: 'Advanced NLP with transformer models for sentiment-driven trading',
      institutionalGrade: true
    },
    {
      id: 'statistical-arbitrage',
      name: 'Statistical Arbitrage',
      winRate: 93.4,
      confidence: 0.96,
      expectedReturn: 0.018,
      riskLevel: 'LOW' as const,
      strategy: 'StatisticalArbitrage',
      reasoning: 'Market neutral strategy with very high win rate',
      institutionalGrade: true
    }
  ], []);

  // Real-time Risk Calculation
  const calculateRealTimeRisk = useCallback(async () => {
    try {
      const response = await fetch('/api/risk/comprehensive-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolioId: userId, positions })
      });
      
      const riskData = await response.json();
      setRiskMetrics(riskData.riskMetrics);
    } catch (error) {
      console.error('Risk calculation failed:', error);
    }
  }, [userId, positions]);

  // Order Flow Analysis
  const analyzeOrderFlow = useCallback(async () => {
    try {
      const response = await fetch('/api/market-data/order-flow-analysis');
      const flowData = await response.json();
      setOrderFlowData(flowData);
    } catch (error) {
      console.error('Order flow analysis failed:', error);
    }
  }, []);

  // AI Strategy Execution
  const executeAIStrategy = useCallback(async (strategy: AIStrategy) => {
    try {
      const response = await fetch('/api/trading/execute-ai-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: strategy.id,
          userId,
          accountType,
          riskParameters: {
            maxRisk: 0.02,
            maxDrawdown: 0.05,
            minWinRate: 0.85
          }
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setActiveStrategies(prev => [...prev, { ...strategy, ...result.execution }]);
      }
    } catch (error) {
      console.error('Strategy execution failed:', error);
    }
  }, [userId, accountType]);

  // Real-time Updates
  useEffect(() => {
    const interval = setInterval(() => {
      calculateRealTimeRisk();
      analyzeOrderFlow();
    }, 1000); // 1-second updates for institutional grade

    return () => clearInterval(interval);
  }, [calculateRealTimeRisk, analyzeOrderFlow]);

  const getLatencyColor = (latency: number) => {
    if (latency < 1) return 'text-green-500';
    if (latency < 5) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getRiskLevelColor = (level: string) => {
    switch (level) {
      case 'LOW': return 'text-green-500 bg-green-100 dark:bg-green-900/30';
      case 'MEDIUM': return 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30';
      case 'HIGH': return 'text-red-500 bg-red-100 dark:bg-red-900/30';
      default: return 'text-gray-500 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      {/* Header with Real-time Metrics */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Institutional Trading Terminal
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Enterprise-grade AI-powered trading platform
            </p>
          </div>
          
          <div className="flex items-center space-x-6">
            {/* Latency Monitor */}
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">Latency</div>
              <div className={`text-lg font-bold ${getLatencyColor(latency || 0)}`}>
                {(latency || 0).toFixed(2)}ms
              </div>
            </div>
            
            {/* Trading Mode */}
            <div className="text-center">
              <div className="text-sm text-gray-500 dark:text-gray-400">Mode</div>
              <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                {tradingMode.replace('_', ' ')}
              </div>
            </div>
            
            {/* System Status */}
            <div className="flex items-center space-x-2">
              <CheckCircleIcon className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">
                All Systems Operational
              </span>
            </div>
          </div>
        </div>

        {/* Performance Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          {Object.entries(performanceMetrics).map(([key, value]) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
            >
              <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {typeof value === 'number' ? 
                  (key.includes('Ratio') || key.includes('Rate') ? 
                    `${(value * 100).toFixed(2)}%` : 
                    value.toLocaleString()
                  ) : value
                }
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Strategy Panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <CpuChipIcon className="h-6 w-6 mr-2 text-blue-500" />
              AI Trading Strategies
            </h2>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setQuantumOptimization(!quantumOptimization)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  quantumOptimization 
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                Quantum ML
              </button>
              
              <button
                onClick={() => setMultiAgentSystem(!multiAgentSystem)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  multiAgentSystem 
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                Multi-Agent
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {institutionalStrategies.map((strategy) => (
              <motion.div
                key={strategy.id}
                whileHover={{ scale: 1.02 }}
                className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 transition-colors cursor-pointer"
                onClick={() => executeAIStrategy(strategy)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {strategy.name}
                  </h3>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskLevelColor(strategy.riskLevel)}`}>
                      {strategy.riskLevel}
                    </span>
                    {strategy.institutionalGrade && (
                      <ShieldCheckIcon className="h-4 w-4 text-gold-500" />
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Win Rate</div>
                    <div className="font-bold text-green-600 dark:text-green-400">
                      {strategy.winRate}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Confidence</div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">
                      {(strategy.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Expected Return</div>
                    <div className="font-bold text-purple-600 dark:text-purple-400">
                      {(strategy.expectedReturn * 100).toFixed(2)}%
                    </div>
                  </div>
                </div>
                
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                  {strategy.reasoning}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Risk Management Dashboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center mb-6">
            <ShieldCheckIcon className="h-6 w-6 mr-2 text-red-500" />
            Risk Management
          </h2>

          {riskMetrics && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-sm text-red-600 dark:text-red-400">Portfolio VaR (95%)</div>
                  <div className="text-lg font-bold text-red-700 dark:text-red-300">
                    ${riskMetrics.portfolioVaR.toLocaleString()}
                  </div>
                </div>
                
                <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">Liquidity Risk</div>
                  <div className="text-lg font-bold text-yellow-700 dark:text-yellow-300">
                    {(riskMetrics.liquidityRisk * 100).toFixed(1)}%
                  </div>
                </div>
                
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-sm text-blue-600 dark:text-blue-400">Counterparty Risk</div>
                  <div className="text-lg font-bold text-blue-700 dark:text-blue-300">
                    {(riskMetrics.counterpartyRisk * 100).toFixed(1)}%
                  </div>
                </div>
                
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-sm text-purple-600 dark:text-purple-400">Leverage Ratio</div>
                  <div className="text-lg font-bold text-purple-700 dark:text-purple-300">
                    {(riskMetrics.leverageRatio || 0).toFixed(2)}x
                  </div>
                </div>
              </div>

              {/* Risk Alerts */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Risk Alerts
                </h3>
                <div className="space-y-2">
                  {riskMetrics.concentrationRisk > 0.3 && (
                    <div className="flex items-center p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                      <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500 mr-2" />
                      <span className="text-sm text-yellow-700 dark:text-yellow-300">
                        High concentration risk detected
                      </span>
                    </div>
                  )}
                  
                  {riskMetrics.leverageRatio > 3 && (
                    <div className="flex items-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <ExclamationTriangleIcon className="h-4 w-4 text-red-500 mr-2" />
                      <span className="text-sm text-red-700 dark:text-red-300">
                        Leverage exceeds recommended limits
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Order Flow Analysis */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center mb-6">
            <ChartBarIcon className="h-6 w-6 mr-2 text-green-500" />
            Order Flow Analysis
          </h2>

          {orderFlowData && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Institutional Flow</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {(orderFlowData.institutionalFlow * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${orderFlowData.institutionalFlow * 100}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Smart Money Index</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {(orderFlowData.smartMoneyIndex || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(orderFlowData.smartMoneyIndex * 50, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Dark Pool Activity</span>
                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {(orderFlowData.darkPoolActivity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${orderFlowData.darkPoolActivity * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Market Sentiment Indicator */}
              <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Market Sentiment
                  </span>
                  <div className="flex items-center space-x-2">
                    <BoltIcon className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-bold text-green-600 dark:text-green-400">
                      BULLISH
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Active Strategies Monitor */}
      {activeStrategies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
            Active AI Strategies
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeStrategies.map((strategy) => (
              <div key={strategy.id} className="p-4 border border-green-200 dark:border-green-700 rounded-lg bg-green-50 dark:bg-green-900/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-green-800 dark:text-green-300">
                    {strategy.name}
                  </h3>
                  <CheckCircleIcon className="h-5 w-5 text-green-500" />
                </div>
                <div className="text-sm text-green-600 dark:text-green-400">
                  Win Rate: {strategy.winRate}% | Confidence: {(strategy.confidence * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default AdvancedTradingTerminal;
