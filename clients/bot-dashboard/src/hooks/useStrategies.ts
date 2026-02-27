import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '@/services/api';
import type { Strategy, StrategyTestResult } from '@/types';

/**
 * Hook for fetching all strategies
 */
export function useStrategies() {
    return useQuery<Strategy[], Error>(
        'strategies',
        () => apiClient.getStrategies(),
        {
            refetchInterval: 30000,
            staleTime: 15000,
        }
    );
}

/**
 * Hook for fetching a single strategy
 */
export function useStrategy(name: string) {
    return useQuery<Strategy, Error>(
        ['strategy', name],
        () => apiClient.getStrategy(name),
        {
            enabled: !!name,
            staleTime: 30000,
        }
    );
}

/**
 * Hook for testing a strategy
 */
export function useTestStrategy() {
    const queryClient = useQueryClient();

    return useMutation<StrategyTestResult, Error, string>(
        (strategyName) => apiClient.testStrategy(strategyName),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('strategies');
            },
        }
    );
}

/**
 * Hook for configuring a strategy
 */
export function useConfigureStrategy() {
    const queryClient = useQueryClient();

    return useMutation<void, Error, { name: string; config: any }>(
        ({ name, config }) => apiClient.configureStrategy(name, config),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('strategies');
            },
        }
    );
}
