import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  CpuChipIcon,
  SparklesIcon,
  BeakerIcon,
  ChartBarIcon,
  BoltIcon,
  ShieldCheckIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

interface QuantumMLModel {
  id: string;
  name: string;
  type: 'deepLearning' | 'reinforcementLearning' | 'transformer' | 'ensemble' | 'quantumML';
  accuracy: number;
  confidence: number;
  trainingData: number;
  lastTrained: Date;
  status: 'ACTIVE' | 'TRAINING' | 'OPTIMIZING' | 'IDLE';
}

interface QuantumOptimization {
  portfolioOptimization: {
    expectedReturn: number;
    riskReduction: number;
    sharpeRatio: number;
    correlationMatrix: number[][];
  };
  arbitrageOpportunities: Array<{
    assets: string[];
    expectedReturn: number;
    riskLevel: number;
    timeHorizon: number;
    confidence: number;
  }>;
  riskNeutralProbabilities: { [asset: string]: number };
}

interface MultiAgentPrediction {
  agentName: string;
  prediction: {
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    timeHorizon: number;
    priceTarget: number;
    reasoning: string;
  };
  performance: {
    accuracy: number;
    winRate: number;
    avgReturn: number;
  };
}

interface QuantumMLInterfaceProps {
  portfolioId: string;
  enableQuantumOptimization?: boolean;
}

const QuantumMLInterface: React.FC<QuantumMLInterfaceProps> = ({
  portfolioId,
  enableQuantumOptimization = true
}) => {
  const dispatch = useAppDispatch();
  const { portfolio, positions } = useAppSelector((state) => state.portfolio);
  const { marketData } = useAppSelector((state) => state.marketData);
  
  const [quantumModels, setQuantumModels] = useState<QuantumMLModel[]>([]);
  const [quantumOptimization, setQuantumOptimization] = useState<QuantumOptimization | null>(null);
  const [multiAgentPredictions, setMultiAgentPredictions] = useState<MultiAgentPrediction[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('quantumML');
  const [optimizationResults, setOptimizationResults] = useState<any>(null);

  // Initialize Quantum ML Models
  useEffect(() => {
    const models: QuantumMLModel[] = [
      {
        id: 'deepLearning',
        name: 'Deep Learning Neural Network',
        type: 'deepLearning',
        accuracy: 94.2,
        confidence: 0.89,
        trainingData: 50000000,
        lastTrained: new Date(Date.now() - 3600000),
        status: 'ACTIVE'
      },
      {
        id: 'reinforcementLearning',
        name: 'Reinforcement Learning Agent',
        type: 'reinforcementLearning',
        accuracy: 91.7,
        confidence: 0.85,
        trainingData: 25000000,
        lastTrained: new Date(Date.now() - 7200000),
        status: 'ACTIVE'
      },
      {
        id: 'transformer',
        name: 'Transformer Sentiment Model',
        type: 'transformer',
        accuracy: 96.1,
        confidence: 0.92,
        trainingData: 100000000,
        lastTrained: new Date(Date.now() - 1800000),
        status: 'ACTIVE'
      },
      {
        id: 'ensemble',
        name: 'Ensemble Meta-Model',
        type: 'ensemble',
        accuracy: 97.8,
        confidence: 0.95,
        trainingData: 200000000,
        lastTrained: new Date(Date.now() - 900000),
        status: 'ACTIVE'
      },
      {
        id: 'quantumML',
        name: 'Quantum Machine Learning',
        type: 'quantumML',
        accuracy: 98.7,
        confidence: 0.97,
        trainingData: 500000000,
        lastTrained: new Date(Date.now() - 600000),
        status: 'OPTIMIZING'
      }
    ];
    
    setQuantumModels(models);
  }, []);

  // Quantum Portfolio Optimization
  const runQuantumOptimization = useCallback(async () => {
    if (!enableQuantumOptimization) return;
    
    setIsOptimizing(true);
    try {
      const response = await fetch('/api/ai/quantum-optimization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId,
          positions,
          marketData,
          optimizationType: 'quantum-enhanced',
          riskTolerance: 0.02,
          timeHorizon: 24 // hours
        })
      });

      const optimization = await response.json();
      setQuantumOptimization(optimization);
      setOptimizationResults(optimization);
      
    } catch (error) {
      console.error('Quantum optimization failed:', error);
    } finally {
      setIsOptimizing(false);
    }
  }, [portfolioId, positions, marketData, enableQuantumOptimization]);

  // Multi-Agent System Predictions
  const getMultiAgentPredictions = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/multi-agent-predictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: ['AAPL', 'GOOGL', 'TSLA', 'MSFT', 'AMZN'],
          marketData,
          timeHorizon: 24
        })
      });

      const predictions = await response.json();
      setMultiAgentPredictions(predictions.agentPredictions || []);

    } catch (error) {
      console.error('Multi-agent predictions failed:', error);
      setMultiAgentPredictions([]);
    }
  }, [marketData]);

  // Execute AI Strategy
  const executeAIStrategy = useCallback(async (strategyType: string) => {
    try {
      const response = await fetch('/api/trading/execute-ai-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyType,
          portfolioId,
          modelId: selectedModel,
          riskParameters: {
            maxRisk: 0.02,
            minWinRate: 0.90,
            maxDrawdown: 0.05
          }
        })
      });

      const result = await response.json();
      console.log('AI Strategy executed:', result);
      
    } catch (error) {
      console.error('AI strategy execution failed:', error);
    }
  }, [portfolioId, selectedModel]);

  // Real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      getMultiAgentPredictions();
      if (enableQuantumOptimization) {
        runQuantumOptimization();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [getMultiAgentPredictions, runQuantumOptimization, enableQuantumOptimization]);

  const getModelStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'text-green-500 bg-green-100 dark:bg-green-900/30';
      case 'TRAINING': return 'text-blue-500 bg-blue-100 dark:bg-blue-900/30';
      case 'OPTIMIZING': return 'text-purple-500 bg-purple-100 dark:bg-purple-900/30';
      case 'IDLE': return 'text-gray-500 bg-gray-100 dark:bg-gray-900/30';
      default: return 'text-gray-500 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return 'text-green-500';
    if (confidence >= 0.8) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <SparklesIcon className="h-6 w-6 mr-3 text-purple-500" />
            Quantum ML Trading Interface
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Advanced AI models with quantum-enhanced optimization
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={runQuantumOptimization}
            disabled={isOptimizing}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
          >
            {isOptimizing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Optimizing...</span>
              </>
            ) : (
              <>
                <BoltIcon className="h-4 w-4" />
                <span>Run Quantum Optimization</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Models Status */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <CpuChipIcon className="h-5 w-5 mr-2 text-blue-500" />
            AI Model Performance
          </h3>
          
          <div className="space-y-4">
            {quantumModels.map((model) => (
              <motion.div
                key={model.id}
                whileHover={{ scale: 1.02 }}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedModel === model.id 
                    ? 'border-purple-300 dark:border-purple-600 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
                onClick={() => setSelectedModel(model.id)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {model.name}
                  </h4>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getModelStatusColor(model.status)}`}>
                    {model.status}
                  </span>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Accuracy</div>
                    <div className="font-bold text-green-600 dark:text-green-400">
                      {model.accuracy.toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Confidence</div>
                    <div className={`font-bold ${getConfidenceColor(model.confidence)}`}>
                      {(model.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">Training Data</div>
                    <div className="font-bold text-blue-600 dark:text-blue-400">
                      {(model.trainingData / 1000000).toFixed(0)}M
                    </div>
                  </div>
                </div>
                
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Last trained: {model.lastTrained.toLocaleTimeString()}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Quantum Optimization Results */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <BeakerIcon className="h-5 w-5 mr-2 text-purple-500" />
            Quantum Optimization
          </h3>
          
          {quantumOptimization ? (
            <div className="space-y-4">
              {/* Portfolio Optimization */}
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <h4 className="font-medium text-purple-800 dark:text-purple-300 mb-3">
                  Portfolio Optimization
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-purple-600 dark:text-purple-400">Expected Return</div>
                    <div className="font-bold text-purple-800 dark:text-purple-200">
                      {quantumOptimization?.portfolioOptimization?.expectedReturn
                        ? (quantumOptimization.portfolioOptimization.expectedReturn * 100).toFixed(2) + '%'
                        : 'Loading...'}
                    </div>
                  </div>
                  <div>
                    <div className="text-purple-600 dark:text-purple-400">Risk Reduction</div>
                    <div className="font-bold text-purple-800 dark:text-purple-200">
                      {quantumOptimization?.portfolioOptimization?.riskReduction
                        ? (quantumOptimization.portfolioOptimization.riskReduction * 100).toFixed(2) + '%'
                        : 'Loading...'}
                    </div>
                  </div>
                  <div>
                    <div className="text-purple-600 dark:text-purple-400">Sharpe Ratio</div>
                    <div className="font-bold text-purple-800 dark:text-purple-200">
                      {quantumOptimization?.portfolioOptimization?.sharpeRatio
                        ? quantumOptimization.portfolioOptimization.sharpeRatio.toFixed(2)
                        : 'Loading...'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Arbitrage Opportunities */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Arbitrage Opportunities
                </h4>
                <div className="space-y-2">
                  {quantumOptimization?.arbitrageOpportunities?.slice(0, 3).map((opportunity, index) => (
                    <div key={index} className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {opportunity.assets.join(' / ')}
                        </span>
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">
                          {(opportunity.expectedReturn * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Risk: {(opportunity.riskLevel * 100).toFixed(1)}% |
                        Confidence: {(opportunity.confidence * 100).toFixed(1)}% |
                        Horizon: {opportunity.timeHorizon}h
                      </div>
                    </div>
                  )) || (
                    <div className="p-3 border border-gray-200 dark:border-gray-600 rounded-lg text-center text-gray-500 dark:text-gray-400">
                      Loading arbitrage opportunities...
                    </div>
                  )}
                </div>
              </div>

              {/* Execute Quantum Strategy */}
              <button
                onClick={() => executeAIStrategy('quantumMLArbitrage')}
                className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200"
              >
                Execute Quantum ML Strategy
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  Initializing quantum optimization...
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Multi-Agent Predictions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2 text-green-500" />
            Multi-Agent System Predictions
          </h3>
          
          {multiAgentPredictions && multiAgentPredictions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {multiAgentPredictions.map((prediction, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className="p-4 border border-gray-200 dark:border-gray-600 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900 dark:text-white">
                      {prediction.agentName}
                    </h4>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      prediction.prediction.direction === 'BULLISH' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                      prediction.prediction.direction === 'BEARISH' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                      'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                    }`}>
                      {prediction.prediction.direction}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                    <div>
                      <div className="text-gray-500 dark:text-gray-400">Confidence</div>
                      <div className="font-bold text-blue-600 dark:text-blue-400">
                        {(prediction.prediction.confidence * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400">Win Rate</div>
                      <div className="font-bold text-green-600 dark:text-green-400">
                        {(prediction.performance.winRate * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {prediction.prediction.reasoning}
                  </p>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32">
              <p className="text-gray-500 dark:text-gray-400">
                Loading multi-agent predictions...
              </p>
            </div>
          )}

          {/* Execute Multi-Agent Strategy */}
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => executeAIStrategy('multiAgentSystemTrading')}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white rounded-lg font-medium transition-all duration-200"
            >
              Execute Multi-Agent Strategy
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default QuantumMLInterface;
