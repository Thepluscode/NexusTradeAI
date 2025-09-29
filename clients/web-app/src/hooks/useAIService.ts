import { useState, useCallback } from 'react';
import { aiService, PredictionResult, OptimizationResult } from '@/services/aiService';

type AIStatus = 'idle' | 'loading' | 'success' | 'error';

interface AIHookState<T> {
  data: T | null;
  status: AIStatus;
  error: string | null;
}

const initialState = {
  data: null,
  status: 'idle' as AIStatus,
  error: null,
};

export const useAIService = () => {
  const [predictionState, setPredictionState] = useState<AIHookState<PredictionResult>>(initialState);
  const [optimizationState, setOptimizationState] = useState<AIHookState<OptimizationResult>>(initialState);

  const getMultiAgentPredictions = useCallback(async (portfolioId: string, timeHorizon = 30) => {
    try {
      setPredictionState(prev => ({ ...prev, status: 'loading', error: null }));
      const data = await aiService.getMultiAgentPredictions({
        portfolioId,
        timeHorizon,
        confidenceLevel: 0.95,
      });
      setPredictionState({ data, status: 'success', error: null });
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get predictions';
      setPredictionState({
        data: null,
        status: 'error',
        error: errorMessage,
      });
      throw error;
    }
  }, []);

  const optimizePortfolio = useCallback(async (portfolioId: string, constraints = {}, goals = []) => {
    try {
      setOptimizationState(prev => ({ ...prev, status: 'loading', error: null }));
      const data = await aiService.optimizePortfolio({
        portfolioId,
        constraints: {
          maxRisk: 0.2,
          minReturn: 0.1,
          ...constraints,
        },
        optimizationGoals: ['maximizeReturn', 'minimizeRisk', ...goals],
      });
      setOptimizationState({ data, status: 'success', error: null });
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to optimize portfolio';
      setOptimizationState({
        data: null,
        status: 'error',
        error: errorMessage,
      });
      throw error;
    }
  }, []);

  const resetPredictionState = useCallback(() => {
    setPredictionState(initialState);
  }, []);

  const resetOptimizationState = useCallback(() => {
    setOptimizationState(initialState);
  }, []);

  return {
    // Predictions
    predictionData: predictionState.data,
    predictionLoading: predictionState.status === 'loading',
    predictionError: predictionState.error,
    getMultiAgentPredictions,
    resetPredictionState,
    
    // Optimization
    optimizationData: optimizationState.data,
    optimizationLoading: optimizationState.status === 'loading',
    optimizationError: optimizationState.error,
    optimizePortfolio,
    resetOptimizationState,
  };
};
