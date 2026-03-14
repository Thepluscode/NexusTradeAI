import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api';

export const useTradingEngine = () => {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['tradingEngineStatus'],
    queryFn: () => apiClient.getTradingEngineStatus(),
    refetchInterval: 10000,
    retry: 3,
  });

  const startMutation = useMutation({
    mutationFn: () => apiClient.startTradingEngine(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tradingEngineStatus'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: () => apiClient.stopTradingEngine(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tradingEngineStatus'] });
    },
  });

  const realizeProfitsMutation = useMutation({
    mutationFn: () => apiClient.realizeProfits(),
    onSuccess: () => {
      // Invalidate each key separately — passing an array treats it as a
      // compound key prefix, not two separate string keys
      queryClient.invalidateQueries({ queryKey: ['tradingEngineStatus'] });
      queryClient.invalidateQueries({ queryKey: ['activePositions'] });
    },
  });

  return {
    status: statusQuery.data,
    // Positions are embedded in the status response — derive them directly
    // to avoid a second redundant fetch to the same endpoint
    positions: statusQuery.data?.positions ?? [],
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,
    startEngine: startMutation.mutate,
    stopEngine: stopMutation.mutate,
    realizeProfits: realizeProfitsMutation.mutate,
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
  };
};
