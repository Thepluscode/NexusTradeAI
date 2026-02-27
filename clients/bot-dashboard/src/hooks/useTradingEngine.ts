import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '@/services/api';

export const useTradingEngine = () => {
  const queryClient = useQueryClient();

  const statusQuery = useQuery(
    'tradingEngineStatus',
    () => apiClient.getTradingEngineStatus(),
    {
      refetchInterval: 5000,
      retry: 3,
    }
  );

  const positionsQuery = useQuery(
    'activePositions',
    () => apiClient.getActivePositions(),
    {
      refetchInterval: 5000,
      retry: 3,
    }
  );

  const startMutation = useMutation(
    () => apiClient.startTradingEngine(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('tradingEngineStatus');
      },
    }
  );

  const stopMutation = useMutation(
    () => apiClient.stopTradingEngine(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries('tradingEngineStatus');
      },
    }
  );

  const realizeProfitsMutation = useMutation(
    () => apiClient.realizeProfits(),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['tradingEngineStatus', 'activePositions']);
      },
    }
  );

  return {
    status: statusQuery.data,
    positions: positionsQuery.data,
    isLoading: statusQuery.isLoading || positionsQuery.isLoading,
    error: statusQuery.error || positionsQuery.error,
    startEngine: startMutation.mutate,
    stopEngine: stopMutation.mutate,
    realizeProfits: realizeProfitsMutation.mutate,
    isStarting: startMutation.isLoading,
    isStopping: stopMutation.isLoading,
  };
};
