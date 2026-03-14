import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/api';
import type { AutomationStatus } from '@/types';

/**
 * Hook for automation status
 */
export function useAutomationStatus() {
    return useQuery<AutomationStatus, Error>({
        queryKey: ['automationStatus'],
        queryFn: () => apiClient.getAutomationStatus(),
        refetchInterval: 10000,
        staleTime: 5000,
    });
}

/**
 * Hook for starting automation
 */
export function useStartAutomation() {
    const queryClient = useQueryClient();

    return useMutation<AutomationStatus, Error, { symbols?: string[]; maxDailyLoss?: number } | undefined>({
        mutationFn: (config) => apiClient.startAutomation(config),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['automationStatus'] });
        },
    });
}

/**
 * Hook for stopping automation
 */
export function useStopAutomation() {
    const queryClient = useQueryClient();

    return useMutation<void, Error>({
        mutationFn: () => apiClient.stopAutomation(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['automationStatus'] });
        },
    });
}

/**
 * Hook for enabling real trading
 */
export function useEnableRealTrading() {
    const queryClient = useQueryClient();

    return useMutation<{ realTradingEnabled: boolean; confirmation: string }, Error>({
        mutationFn: () => apiClient.enableRealTrading(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['automationStatus'] });
        },
    });
}

/**
 * Hook for disabling real trading
 */
export function useDisableRealTrading() {
    const queryClient = useQueryClient();

    return useMutation<{ realTradingEnabled: boolean; confirmation: string }, Error>({
        mutationFn: () => apiClient.disableRealTrading(),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['automationStatus'] });
        },
    });
}
