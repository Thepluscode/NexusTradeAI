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
    tradingMode?: string;
    btcTrend?: string | null;
    isVolatilityPaused?: boolean;
    positions: CryptoPosition[];
    portfolioValue?: number;
    equity: number;
    dailyReturn?: number;
    // Crypto bot sends stats, not performance
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
        winRate?: number;
        profitFactor?: number;
    };
    dailyPnL?: number;
    winRate?: string | number;
    totalTrades?: number;
    scanCount?: number;
}

export function useCryptoTrading() {
    const [status, setStatus] = useState<CryptoStatus | null>(null);
    const [positions, setPositions] = useState<CryptoPosition[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            const raw = await apiClient.getCryptoStatus();
            const data = raw as unknown as CryptoStatus;
            setStatus(data);
            // Crypto positions may be nested under data.positions or be a map
            const rawPositions = (raw.positions as unknown[]) || [];
            const mapped: CryptoPosition[] = Array.isArray(rawPositions)
                ? rawPositions.map((p) => {
                    const pos = p as Record<string, unknown>;
                    return ({
                    symbol: pos['symbol'] as string,
                    side: (pos['side'] || (pos['direction'] === 'short' ? 'short' : 'long')) as 'long' | 'short',
                    quantity: (pos['quantity'] ?? pos['qty'] ?? pos['amount'] ?? 0) as number,
                    entryPrice: (pos['entryPrice'] ?? pos['entry'] ?? 0) as number,
                    currentPrice: (pos['currentPrice'] ?? pos['current_price'] ?? 0) as number,
                    unrealizedPnL: (pos['unrealizedPnL'] ?? pos['unrealized_pl'] ?? pos['pnl'] ?? 0) as number,
                    strategy: (pos['strategy'] || 'crypto-momentum') as string,
                    tier: pos['tier'] as string | undefined,
                } satisfies CryptoPosition);
                })
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
