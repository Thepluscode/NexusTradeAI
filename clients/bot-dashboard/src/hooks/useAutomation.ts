import { useQuery, useMutation, useQueryClient } from 'react-query';
import { apiClient } from '@/services/api';
import type { AutomationStatus } from '@/types';

/**
 * Hook for automation status
 */
export function useAutomationStatus() {
    return useQuery<AutomationStatus, Error>(
        'automationStatus',
        () => apiClient.getAutomationStatus(),
        {
            refetchInterval: 10000,
            staleTime: 5000,
        }
    );
}

/**
 * Hook for starting automation
 */
export function useStartAutomation() {
    const queryClient = useQueryClient();

    return useMutation<AutomationStatus, Error, { symbols?: string[]; maxDailyLoss?: number } | undefined>(
        (config) => apiClient.startAutomation(config),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('automationStatus');
            },
        }
    );
}

/**
 * Hook for stopping automation
 */
export function useStopAutomation() {
    const queryClient = useQueryClient();

    return useMutation<void, Error>(
        () => apiClient.stopAutomation(),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('automationStatus');
            },
        }
    );
}

/**
 * Hook for enabling real trading
 */
export function useEnableRealTrading() {
    const queryClient = useQueryClient();

    return useMutation<{ realTradingEnabled: boolean; confirmation: string }, Error>(
        () => apiClient.enableRealTrading(),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('automationStatus');
            },
        }
    );
}

/**
 * Hook for disabling real trading
 */
export function useDisableRealTrading() {
    const queryClient = useQueryClient();

    return useMutation<{ realTradingEnabled: boolean; confirmation: string }, Error>(
        () => apiClient.disableRealTrading(),
        {
            onSuccess: () => {
                queryClient.invalidateQueries('automationStatus');
            },
        }
    );
}
