import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/services/api';

export interface CryptoPosition {
    symbol: string;
    side: 'long' | 'short';
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    strategy?: string;
    tier?: string;
}

export interface CryptoStatus {
    isRunning: boolean;
    isPaused: boolean;
    demoMode: boolean;
    mode: string;
    positions: CryptoPosition[];
    portfolioValue: number;
    equity: number;
    performance: {
        totalTrades: number;
        activePositions: number;
        winRate?: number;
        profitFactor?: number;
    };
    dailyPnL?: number;
}

export function useCryptoTrading() {
    const [status, setStatus] = useState<CryptoStatus | null>(null);
    const [positions, setPositions] = useState<CryptoPosition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const data = await apiClient.getCryptoStatus();
            setStatus(data);
            // Crypto positions may be nested under data.positions or be a map
            const rawPositions = data?.positions || [];
            const mapped: CryptoPosition[] = Array.isArray(rawPositions)
                ? rawPositions.map((p: any) => ({
                    symbol: p.symbol,
                    side: p.side || (p.direction === 'short' ? 'short' : 'long'),
                    quantity: p.quantity || p.qty || p.amount || 0,
                    entryPrice: p.entryPrice || p.entry || 0,
                    currentPrice: p.currentPrice || p.current_price || 0,
                    unrealizedPnL: p.unrealizedPnL || p.unrealized_pl || p.pnl || 0,
                    strategy: p.strategy || 'crypto-momentum',
                    tier: p.tier,
                }))
                : [];
            setPositions(mapped);
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

    return {
        status,
        positions,
        isLoading,
        error,
        refetch: fetchStatus,
    };
}
