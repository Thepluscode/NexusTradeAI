import { useQuery } from 'react-query';
import { apiClient } from '@/services/api';
import type { AIPortfolioOptimization, AlpacaPosition, DashboardSummary } from '@/types';

/**
 * Hook for portfolio optimization recommendations
 */
export function usePortfolioOptimization() {
    return useQuery<AIPortfolioOptimization, Error>(
        'portfolioOptimization',
        () => apiClient.getPortfolioOptimization(),
        {
            refetchInterval: 60000,
            staleTime: 30000,
        }
    );
}

/**
 * Hook for real Alpaca positions
 */
export function useAlpacaPositions() {
    return useQuery<AlpacaPosition[], Error>(
        'alpacaPositions',
        () => apiClient.getAlpacaPositions(),
        {
            refetchInterval: 10000,
            staleTime: 5000,
        }
    );
}

/**
 * Hook for unified dashboard data (real Alpaca)
 */
export function useUnifiedDashboard() {
    return useQuery<DashboardSummary, Error>(
        'unifiedDashboard',
        () => apiClient.getUnifiedDashboard(),
        {
            refetchInterval: 10000,
            staleTime: 5000,
        }
    );
}

/**
 * Hook for Alpaca account balance
 */
export function useAlpacaAccount() {
    return useQuery(
        'alpacaAccount',
        () => apiClient.getAlpacaAccount(),
        {
            refetchInterval: 30000,
            staleTime: 15000,
        }
    );
}
