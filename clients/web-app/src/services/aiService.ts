import { api, endpoints } from './api';

interface MultiAgentPredictionRequest {
  portfolioId: string;
  timeHorizon?: number;
  confidenceLevel?: number;
  agents?: string[];
  marketData?: Record<string, any>;
}

interface QuantumOptimizationRequest {
  portfolioId: string;
  constraints: {
    maxRisk?: number;
    minReturn?: number;
    maxAllocation?: number;
    minAllocation?: number;
  };
  optimizationGoals: string[];
  assets?: string[];
}

export interface PredictionResult {
  predictions: {
    [key: string]: {
      prediction: number;
      confidence: number;
      timestamp: string;
    };
  };
  consensus: {
    prediction: number;
    timestamp: string;
  };
  metadata: {
    portfolioId: string;
    timeHorizon: number;
    agentsUsed: string[];
  };
}

export interface OptimizationResult {
  optimizedWeights: number[];
  expectedReturn: number;
  risk: number;
  sharpeRatio: number;
  metadata: {
    portfolioId: string;
    timestamp: string;
    constraints: Record<string, any>;
    optimizationGoals: string[];
  };
}

export const aiService = {
  /**
   * Get predictions from multiple AI agents
   */
  getMultiAgentPredictions: async (data: MultiAgentPredictionRequest): Promise<PredictionResult> => {
    try {
      const response = await api.post<PredictionResult>(
        endpoints.ai.multiAgentPredictions,
        data
      );
      return response;
    } catch (error) {
      console.error('Error getting multi-agent predictions:', error);
      throw error;
    }
  },

  /**
   * Optimize portfolio using quantum algorithms
   */
  optimizePortfolio: async (data: QuantumOptimizationRequest): Promise<OptimizationResult> => {
    try {
      const response = await api.post<OptimizationResult>(
        endpoints.ai.quantumOptimization,
        data
      );
      return response;
    } catch (error) {
      console.error('Error optimizing portfolio:', error);
      throw error;
    }
  },

  /**
   * Get a quick prediction for a portfolio (simplified version)
   */
  getQuickPrediction: async (portfolioId: string): Promise<number> => {
    try {
      const result = await aiService.getMultiAgentPredictions({
        portfolioId,
        timeHorizon: 30, // Default to 30 days
        confidenceLevel: 0.95, // 95% confidence level
      });
      return result.consensus.prediction;
    } catch (error) {
      console.error('Error getting quick prediction:', error);
      throw error;
    }
  },

  /**
   * Get a quick optimization for a portfolio (simplified version)
   */
  getQuickOptimization: async (portfolioId: string) => {
    try {
      const result = await aiService.optimizePortfolio({
        portfolioId,
        constraints: {
          maxRisk: 0.2, // 20% max risk
          minReturn: 0.1, // 10% min return
        },
        optimizationGoals: ['maximizeReturn', 'minimizeRisk'],
      });
      return result;
    } catch (error) {
      console.error('Error getting quick optimization:', error);
      throw error;
    }
  },
};
