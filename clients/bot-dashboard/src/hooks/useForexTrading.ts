import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api';

export interface ForexStatus {
    isRunning: boolean;
    marketOpen: boolean;
    // Forex bot returns session as a plain string e.g. "OVERLAP", "LONDON", "OFF_PEAK"
    session: string;
    // Forex bot sends stats, not performance
    stats?: {
        totalTrades: number;
        longTrades?: number;
        shortTrades?: number;
        winners?: number;
        losers?: number;
        totalPnL?: number;
    };
    performance?: {
        totalTrades: number;
        activePositions: number;
        scanCount?: number;
    };
    positions: ForexPosition[];
    equity?: number;       // forex bot sends equity, not portfolioValue
    portfolioValue?: number;
    currency?: string;     // 'GBP' for OANDA accounts
    dailyPnL: number;
    dailyReturn?: number;
    lastUpdate?: string;
    mode?: string;
    tradingMode?: string;
    isPaused?: boolean;
}

export interface ForexPosition {
    symbol: string;
    side: 'long' | 'short';
    units: number;
    unrealizedPnL: number;
    strategy?: string;
}

export function useForexTrading() {
    const [status, setStatus] = useState<ForexStatus | null>(null);
    const [positions, setPositions] = useState<ForexPosition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const [isStopping, setIsStopping] = useState(false);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await apiClient.getForexStatus();
            setStatus(data);
            setPositions(data?.positions || []);
            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 10000); // Every 10 seconds
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const startEngine = useCallback(async () => {
        setIsStarting(true);
        try {
            await apiClient.startForexTrading();
            await fetchStatus();
        } catch (err) {
            setError(err as Error);
        } finally {
            setIsStarting(false);
        }
    }, [fetchStatus]);

    const stopEngine = useCallback(async () => {
        setIsStopping(true);
        try {
            await apiClient.stopForexTrading();
            await fetchStatus();
        } catch (err) {
            setError(err as Error);
        } finally {
            setIsStopping(false);
        }
    }, [fetchStatus]);

    const scanSignals = useCallback(async () => {
        try {
            return await apiClient.scanForexSignals();
        } catch (err) {
            setError(err as Error);
            return [];
        }
    }, []);

    return {
        status,
        positions,
        isLoading,
        error,
        startEngine,
        stopEngine,
        scanSignals,
        isStarting,
        isStopping,
        refetch: fetchStatus,
    };
}
