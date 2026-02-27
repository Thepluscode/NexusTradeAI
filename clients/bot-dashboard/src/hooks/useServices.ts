import { useQuery } from 'react-query';
import { apiClient } from '@/services/api';
import type { ServiceHealth } from '@/types';

/**
 * Hook for monitoring all backend service health statuses
 */
export function useServicesHealth() {
    return useQuery<ServiceHealth[], Error>(
        'servicesHealth',
        () => apiClient.getAllServicesHealth(),
        {
            refetchInterval: 30000, // Check every 30 seconds
            staleTime: 15000,
        }
    );
}

/**
 * Hook for checking individual service health
 */
export function useServiceHealth(serviceName: string, port: number) {
    return useQuery<ServiceHealth, Error>(
        ['serviceHealth', serviceName],
        () => apiClient.checkServiceHealth(serviceName, port),
        {
            refetchInterval: 30000,
            staleTime: 15000,
        }
    );
}

/**
 * Hook for system status
 */
export function useSystemStatus() {
    return useQuery(
        'systemStatus',
        () => apiClient.getSystemStatus(),
        {
            refetchInterval: 10000,
            staleTime: 5000,
        }
    );
}
