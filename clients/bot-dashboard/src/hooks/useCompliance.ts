import { useQuery } from 'react-query';
import { apiClient } from '@/services/api';
import type { GDPRStatus, AMLStatus } from '@/types';

/**
 * Hook for GDPR compliance status
 */
export function useGDPRStatus() {
    return useQuery<GDPRStatus, Error>(
        'gdprStatus',
        () => apiClient.getGDPRStatus(),
        {
            refetchInterval: 60000,
            staleTime: 30000,
        }
    );
}

/**
 * Hook for AML compliance dashboard
 */
export function useAMLDashboard() {
    return useQuery<AMLStatus, Error>(
        'amlDashboard',
        () => apiClient.getAMLDashboard(),
        {
            refetchInterval: 60000,
            staleTime: 30000,
        }
    );
}

/**
 * Hook for all compliance statuses
 */
export function useComplianceStatus() {
    const gdpr = useGDPRStatus();
    const aml = useAMLDashboard();

    return {
        gdpr: gdpr.data,
        aml: aml.data,
        isLoading: gdpr.isLoading || aml.isLoading,
        isError: gdpr.isError || aml.isError,
        refetch: () => {
            gdpr.refetch();
            aml.refetch();
        },
    };
}
