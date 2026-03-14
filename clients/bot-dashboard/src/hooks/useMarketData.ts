import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/api';

export const useMarketData = () => {
  const statusQuery = useQuery({
    queryKey: ['marketDataStatus'],
    queryFn: () => apiClient.getMarketStatus(),
    refetchInterval: 10000, // Check every 10 seconds
    retry: 2,
  });

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    error: statusQuery.error,
  };
};
