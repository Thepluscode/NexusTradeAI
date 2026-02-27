import { useQuery } from 'react-query';
import { apiClient } from '@/services/api';

export const useRiskManager = () => {
  const reportQuery = useQuery(
    'riskReport',
    () => apiClient.getRiskReport(),
    {
      refetchInterval: 5000,
      retry: 3,
    }
  );

  const alertsQuery = useQuery(
    'riskAlerts',
    () => apiClient.getRiskAlerts(),
    {
      refetchInterval: 3000,
      retry: 3,
    }
  );

  return {
    report: reportQuery.data,
    alerts: alertsQuery.data,
    isLoading: reportQuery.isLoading || alertsQuery.isLoading,
    error: reportQuery.error || alertsQuery.error,
  };
};
