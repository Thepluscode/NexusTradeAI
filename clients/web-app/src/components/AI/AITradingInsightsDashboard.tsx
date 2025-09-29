import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Zap,
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  PieChart,
  Cpu,
  Database,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Settings,
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownRight,
  Minus
} from 'lucide-react';

interface QuantumPrediction {
  symbol: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  targetPrice: number;
  currentPrice: number;
  timeframe: string;
  quantumScore: number;
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
}

interface MultiAgentSignal {
  symbol: string;
  agentConsensus: number;
  signals: {
    agent: string;
    signal: 'buy' | 'sell' | 'hold';
    confidence: number;
    reasoning: string;
  }[];
  overallRecommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
  riskAdjustedScore: number;
}

interface SentimentAnalysis {
  symbol: string;
  overallSentiment: number; // -100 to 100
  sources: {
    news: number;
    social: number;
    analyst: number;
    options: number;
  };
  trendDirection: 'improving' | 'declining' | 'stable';
  keyFactors: string[];
}

interface StrategyRecommendation {
  name: string;
  type: 'momentum' | 'mean_reversion' | 'arbitrage' | 'pairs_trading';
  expectedReturn: number;
  riskLevel: 'low' | 'medium' | 'high';
  timeHorizon: string;
  confidence: number;
  description: string;
  requiredCapital: number;
  maxDrawdown: number;
  winRate: number;
}

const AITradingInsightsDashboard: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1H');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [showDetails, setShowDetails] = useState<boolean>(true);

  // Handler for deploying trading strategies
  const handleDeployStrategy = (strategy: any) => {
    console.log('Deploying strategy:', strategy);
    // Show success notification
    alert(`Strategy "${strategy.name}" deployed successfully!

Strategy Details:
- Expected Return: ${strategy.expectedReturn}
- Risk Level: ${strategy.riskLevel}
- Required Capital: $${strategy.requiredCapital?.toLocaleString() || 'N/A'}
- Win Rate: ${strategy.winRate || 'N/A'}%

The strategy is now active and will begin executing trades based on AI signals.`);
  };

  // Mock data - would be fetched from AI services
  const [quantumPredictions] = useState<QuantumPrediction[]>([
    {
      symbol: 'AAPL',
      direction: 'bullish',
      confidence: 87.3,
      targetPrice: 185.50,
      currentPrice: 175.84,
      timeframe: '24H',
      quantumScore: 9.2,
      reasoning: 'Quantum entanglement patterns indicate strong upward momentum with high probability convergence',
      riskLevel: 'low'
    },
    {
      symbol: 'TSLA',
      direction: 'bearish',
      confidence: 72.1,
      targetPrice: 220.00,
      currentPrice: 238.45,
      timeframe: '48H',
      quantumScore: 7.8,
      reasoning: 'Quantum superposition analysis suggests correction phase with 72% probability',
      riskLevel: 'medium'
    },
    {
      symbol: 'NVDA',
      direction: 'bullish',
      confidence: 94.6,
      targetPrice: 520.00,
      currentPrice: 485.20,
      timeframe: '72H',
      quantumScore: 9.8,
      reasoning: 'Quantum coherence patterns show exceptional strength in AI semiconductor sector',
      riskLevel: 'low'
    }
  ]);

  const [multiAgentSignals] = useState<MultiAgentSignal[]>([
    {
      symbol: 'AAPL',
      agentConsensus: 85,
      signals: [
        { agent: 'Technical Agent', signal: 'buy', confidence: 88, reasoning: 'Breakout above resistance with volume' },
        { agent: 'Fundamental Agent', signal: 'buy', confidence: 82, reasoning: 'Strong earnings growth and margin expansion' },
        { agent: 'Sentiment Agent', signal: 'buy', confidence: 85, reasoning: 'Positive analyst revisions and social sentiment' },
        { agent: 'Risk Agent', signal: 'hold', confidence: 75, reasoning: 'Moderate risk-adjusted returns expected' }
      ],
      overallRecommendation: 'buy',
      riskAdjustedScore: 8.5
    },
    {
      symbol: 'BTC',
      agentConsensus: 92,
      signals: [
        { agent: 'Technical Agent', signal: 'buy', confidence: 95, reasoning: 'Golden cross formation with strong momentum' },
        { agent: 'On-Chain Agent', signal: 'buy', confidence: 90, reasoning: 'Whale accumulation and reduced exchange reserves' },
        { agent: 'Macro Agent', signal: 'buy', confidence: 88, reasoning: 'Favorable monetary policy and institutional adoption' },
        { agent: 'Risk Agent', signal: 'buy', confidence: 85, reasoning: 'Risk-on environment supports crypto assets' }
      ],
      overallRecommendation: 'strong_buy',
      riskAdjustedScore: 9.2
    }
  ]);

  const [sentimentAnalysis] = useState<SentimentAnalysis[]>([
    {
      symbol: 'AAPL',
      overallSentiment: 78,
      sources: {
        news: 82,
        social: 75,
        analyst: 85,
        options: 70
      },
      trendDirection: 'improving',
      keyFactors: ['iPhone 15 sales exceed expectations', 'Services revenue growth', 'AI integration announcements']
    },
    {
      symbol: 'TSLA',
      overallSentiment: -15,
      sources: {
        news: -20,
        social: -10,
        analyst: -25,
        options: -5
      },
      trendDirection: 'declining',
      keyFactors: ['Production concerns', 'Competition in EV market', 'Regulatory challenges']
    }
  ]);

  const [strategyRecommendations] = useState<StrategyRecommendation[]>([
    {
      name: 'Quantum Momentum Strategy',
      type: 'momentum',
      expectedReturn: 24.5,
      riskLevel: 'medium',
      timeHorizon: '3-6 months',
      confidence: 89.2,
      description: 'AI-powered momentum strategy using quantum computing for pattern recognition',
      requiredCapital: 100000,
      maxDrawdown: -8.5,
      winRate: 78.3
    },
    {
      name: 'Multi-Agent Arbitrage',
      type: 'arbitrage',
      expectedReturn: 18.7,
      riskLevel: 'low',
      timeHorizon: '1-3 months',
      confidence: 94.1,
      description: 'Cross-market arbitrage opportunities identified by AI agent consensus',
      requiredCapital: 250000,
      maxDrawdown: -3.2,
      winRate: 85.7
    },
    {
      name: 'Sentiment-Driven Pairs',
      type: 'pairs_trading',
      expectedReturn: 16.3,
      riskLevel: 'low',
      timeHorizon: '2-4 months',
      confidence: 82.6,
      description: 'Pairs trading strategy based on sentiment divergence analysis',
      requiredCapital: 150000,
      maxDrawdown: -5.1,
      winRate: 72.4
    }
  ]);

  const timeframes = ['5M', '15M', '1H', '4H', '1D', '1W'];

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const refreshAIData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Simulate AI API calls
      await new Promise(resolve => setTimeout(resolve, 2000));
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Error refreshing AI data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Auto-refresh every 60 seconds
    const interval = setInterval(refreshAIData, 60000);
    return () => clearInterval(interval);
  }, [refreshAIData]);

  const getDirectionIcon = (direction: string) => {
    switch (direction) {
      case 'bullish':
        return <ArrowUpRight className="w-4 h-4 text-green-400" />;
      case 'bearish':
        return <ArrowDownRight className="w-4 h-4 text-red-400" />;
      default:
        return <Minus className="w-4 h-4 text-slate-400" />;
    }
  };

  const getRecommendationColor = (rec: string) => {
    switch (rec) {
      case 'strong_buy':
        return 'bg-green-600/20 text-green-400';
      case 'buy':
        return 'bg-green-600/10 text-green-400';
      case 'hold':
        return 'bg-slate-600/20 text-slate-400';
      case 'sell':
        return 'bg-red-600/10 text-red-400';
      case 'strong_sell':
        return 'bg-red-600/20 text-red-400';
      default:
        return 'bg-slate-600/20 text-slate-400';
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
            <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              AI Trading Insights
            </h1>
            <p className="text-slate-400 mt-1 flex items-center space-x-2">
              <Sparkles className="w-4 h-4" />
              <span>Powered by Quantum AI & Multi-Agent Systems</span>
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
                      ? 'bg-orange-600 text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-700'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
            
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors"
            >
              {showDetails ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="text-sm">{showDetails ? 'Hide' : 'Show'} Details</span>
            </button>
            
            <button
              onClick={refreshAIData}
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

        {/* Quantum Predictions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center space-x-2 mb-6">
            <Sparkles className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-semibold">Quantum AI Predictions</h2>
            <div className="flex items-center space-x-1 text-xs bg-purple-500/20 text-purple-400 px-2 py-1 rounded">
              <Zap className="w-3 h-3" />
              <span>Quantum Enhanced</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {quantumPredictions.map((prediction, index) => (
              <motion.div
                key={prediction.symbol}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-lg">{prediction.symbol}</span>
                    {getDirectionIcon(prediction.direction)}
                  </div>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    prediction.riskLevel === 'low' ? 'bg-green-600/20 text-green-400' :
                    prediction.riskLevel === 'medium' ? 'bg-yellow-600/20 text-yellow-400' :
                    'bg-red-600/20 text-red-400'
                  }`}>
                    {prediction.riskLevel.toUpperCase()}
                  </div>
                </div>

                <div className="space-y-2 mb-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Current:</span>
                    <span className="font-medium">{formatCurrency(prediction.currentPrice)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Target:</span>
                    <span className={`font-medium ${
                      prediction.direction === 'bullish' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatCurrency(prediction.targetPrice)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Potential:</span>
                    <span className={`font-bold ${
                      prediction.direction === 'bullish' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatPercentage(((prediction.targetPrice - prediction.currentPrice) / prediction.currentPrice) * 100)}
                    </span>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Quantum Score:</span>
                    <span className="font-medium">{prediction.quantumScore}/10</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded">
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded"
                      style={{ width: `${prediction.quantumScore * 10}%` }}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-400">Confidence:</span>
                    <span className="font-medium">{prediction.confidence}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded">
                    <div 
                      className={`h-full rounded ${
                        prediction.confidence >= 80 ? 'bg-green-400' :
                        prediction.confidence >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${prediction.confidence}%` }}
                    />
                  </div>
                </div>

                {showDetails && (
                  <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300">
                    <span className="text-slate-400">Analysis: </span>
                    {prediction.reasoning}
                  </div>
                )}

                <div className="mt-3 flex justify-between text-xs text-slate-400">
                  <span>Timeframe: {prediction.timeframe}</span>
                  <span className={`${
                    prediction.direction === 'bullish' ? 'text-green-400' :
                    prediction.direction === 'bearish' ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {prediction.direction.toUpperCase()}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Multi-Agent Signals & Strategy Recommendations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Multi-Agent Signals */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center space-x-2 mb-6">
              <Cpu className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold">Multi-Agent Consensus</h3>
              <div className="flex items-center space-x-1 text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded">
                <Brain className="w-3 h-3" />
                <span>AI Agents</span>
              </div>
            </div>

            <div className="space-y-6">
              {multiAgentSignals.map((signal, index) => (
                <motion.div
                  key={signal.symbol}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="font-bold text-lg">{signal.symbol}</span>
                      <div className={`px-2 py-1 rounded text-xs font-medium ${getRecommendationColor(signal.overallRecommendation)}`}>
                        {signal.overallRecommendation.replace('_', ' ').toUpperCase()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-400">Consensus</div>
                      <div className="font-bold text-lg">{signal.agentConsensus}%</div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Risk-Adjusted Score:</span>
                      <span className="font-medium">{signal.riskAdjustedScore}/10</span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 rounded"
                        style={{ width: `${signal.riskAdjustedScore * 10}%` }}
                      />
                    </div>
                  </div>

                  {showDetails && (
                    <div className="space-y-2">
                      {signal.signals.map((agentSignal, agentIndex) => (
                        <div key={agentIndex} className="flex items-center justify-between p-2 bg-slate-800/50 rounded">
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-medium">{agentSignal.agent}</span>
                            <span className={`px-2 py-1 rounded text-xs ${
                              agentSignal.signal === 'buy' ? 'bg-green-600/20 text-green-400' :
                              agentSignal.signal === 'sell' ? 'bg-red-600/20 text-red-400' :
                              'bg-slate-600/20 text-slate-400'
                            }`}>
                              {agentSignal.signal.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-right">
                            <div className="text-xs text-slate-400">Confidence</div>
                            <div className="text-sm font-medium">{agentSignal.confidence}%</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Strategy Recommendations */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
          >
            <div className="flex items-center space-x-2 mb-6">
              <Target className="w-5 h-5 text-green-400" />
              <h3 className="text-lg font-semibold">AI Strategy Recommendations</h3>
              <div className="flex items-center space-x-1 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                <BarChart3 className="w-3 h-3" />
                <span>Optimized</span>
              </div>
            </div>

            <div className="space-y-4">
              {strategyRecommendations.map((strategy, index) => (
                <motion.div
                  key={strategy.name}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{strategy.name}</h4>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className={`px-2 py-1 rounded text-xs ${
                          strategy.type === 'momentum' ? 'bg-blue-600/20 text-blue-400' :
                          strategy.type === 'mean_reversion' ? 'bg-purple-600/20 text-purple-400' :
                          strategy.type === 'arbitrage' ? 'bg-green-600/20 text-green-400' :
                          'bg-orange-600/20 text-orange-400'
                        }`}>
                          {strategy.type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          strategy.riskLevel === 'low' ? 'bg-green-600/20 text-green-400' :
                          strategy.riskLevel === 'medium' ? 'bg-yellow-600/20 text-yellow-400' :
                          'bg-red-600/20 text-red-400'
                        }`}>
                          {strategy.riskLevel.toUpperCase()} RISK
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-400">
                        {formatPercentage(strategy.expectedReturn)}
                      </div>
                      <div className="text-xs text-slate-400">Expected Return</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                    <div>
                      <span className="text-slate-400">Win Rate:</span>
                      <div className="font-medium">{strategy.winRate}%</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Max Drawdown:</span>
                      <div className="font-medium text-red-400">{strategy.maxDrawdown}%</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Time Horizon:</span>
                      <div className="font-medium">{strategy.timeHorizon}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Required Capital:</span>
                      <div className="font-medium">{formatCurrency(strategy.requiredCapital)}</div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Confidence:</span>
                      <span className="font-medium">{strategy.confidence}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded">
                      <div
                        className={`h-full rounded ${
                          strategy.confidence >= 80 ? 'bg-green-400' :
                          strategy.confidence >= 60 ? 'bg-yellow-400' : 'bg-red-400'
                        }`}
                        style={{ width: `${strategy.confidence}%` }}
                      />
                    </div>
                  </div>

                  {showDetails && (
                    <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300 mb-3">
                      {strategy.description}
                    </div>
                  )}

                  <button
                    onClick={() => handleDeployStrategy(strategy)}
                    className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 py-2 rounded-lg font-medium transition-all"
                  >
                    Deploy Strategy
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Sentiment Analysis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6"
        >
          <div className="flex items-center space-x-2 mb-6">
            <Activity className="w-5 h-5 text-yellow-400" />
            <h3 className="text-lg font-semibold">Market Sentiment Analysis</h3>
            <div className="flex items-center space-x-1 text-xs bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded">
              <Database className="w-3 h-3" />
              <span>Real-time</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sentimentAnalysis.map((sentiment, index) => (
              <motion.div
                key={sentiment.symbol}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + index * 0.1 }}
                className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="font-bold text-lg">{sentiment.symbol}</span>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    sentiment.trendDirection === 'improving' ? 'bg-green-600/20 text-green-400' :
                    sentiment.trendDirection === 'declining' ? 'bg-red-600/20 text-red-400' :
                    'bg-slate-600/20 text-slate-400'
                  }`}>
                    {sentiment.trendDirection.toUpperCase()}
                  </div>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-slate-400">Overall Sentiment:</span>
                    <span className={`font-bold ${
                      sentiment.overallSentiment > 20 ? 'text-green-400' :
                      sentiment.overallSentiment < -20 ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      {sentiment.overallSentiment > 0 ? '+' : ''}{sentiment.overallSentiment}
                    </span>
                  </div>
                  <div className="w-full h-3 bg-slate-700 rounded">
                    <div
                      className={`h-full rounded ${
                        sentiment.overallSentiment > 20 ? 'bg-green-400' :
                        sentiment.overallSentiment < -20 ? 'bg-red-400' : 'bg-slate-400'
                      }`}
                      style={{
                        width: `${Math.abs(sentiment.overallSentiment)}%`,
                        marginLeft: sentiment.overallSentiment < 0 ? `${50 - Math.abs(sentiment.overallSentiment)}%` : '50%'
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">News:</span>
                    <span className={sentiment.sources.news >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {sentiment.sources.news > 0 ? '+' : ''}{sentiment.sources.news}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Social:</span>
                    <span className={sentiment.sources.social >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {sentiment.sources.social > 0 ? '+' : ''}{sentiment.sources.social}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Analyst:</span>
                    <span className={sentiment.sources.analyst >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {sentiment.sources.analyst > 0 ? '+' : ''}{sentiment.sources.analyst}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Options:</span>
                    <span className={sentiment.sources.options >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {sentiment.sources.options > 0 ? '+' : ''}{sentiment.sources.options}
                    </span>
                  </div>
                </div>

                {showDetails && (
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400 mb-1">Key Factors:</div>
                    {sentiment.keyFactors.map((factor, factorIndex) => (
                      <div key={factorIndex} className="text-xs text-slate-300 bg-slate-800/50 rounded px-2 py-1">
                        • {factor}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AITradingInsightsDashboard;
