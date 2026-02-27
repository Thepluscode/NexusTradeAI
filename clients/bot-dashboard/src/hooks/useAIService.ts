import { useQuery } from 'react-query';
import { apiClient } from '@/services/api';

export const useAIService = () => {
  const healthQuery = useQuery(
    'aiServiceHealth',
    () => apiClient.getAIHealth(),
    {
      refetchInterval: 10000, // Check every 10 seconds
      retry: 2,
    }
  );

  return {
    health: healthQuery.data,
    isLoading: healthQuery.isLoading,
    error: healthQuery.error,
  };
};
