import SEO from '@/components/SEO';
import {
    Box,
    Paper,
    Typography,
    Card,
    CardContent,
    Grid,
    Button,
    Chip,
    Skeleton,
    Alert,
} from '@mui/material';
import {
    TrendingUp,
    TrendingDown,
    PlayArrow,
    Pause,
    Stop,
    Casino,
    SwapVert,
    AccessTime,
    Settings,
    Cancel,
} from '@mui/icons-material';
import { apiClient } from '@/services/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';


interface Position {
    symbol: string;
    // crypto bot fields
    entry?: number;
    quantity?: number;
    positionSize?: number;
    stopLoss?: number;
    takeProfit?: number;
    tier?: string;
    // generic fields (forex-style)
    qty?: number;
    side?: string;
    entryPrice?: number;
    currentPrice?: number;
    unrealizedPnL?: number;   // crypto bot field name
    unrealizedPL?: number;
    unrealizedPnLPct?: number;
}

interface BotStatus {
    isRunning: boolean;
    isPaused: boolean;
    isVolatilityPaused: boolean;
    mode: string;
    tradingMode: string;
    btcTrend: string | null;
    equity: number;
    dailyReturn: number;
    winRate?: string;   // "55.3%" — sent at root level by getStatus()
    positions: Position[];
    stats: {
        totalTrades: number;
        longTrades: number;
        shortTrades: number;
        winners: number;
        losers: number;
        totalPnL: number;
        maxDrawdown: number;
    };
    config: {
        symbols: string[];
        maxPositions: number;
        stopLoss: number;
        profitTarget: number;
        dailyLossLimit: number;
    };
}

export default function CryptoBotPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user } = useAuth();

    const { data: engineStatus } = useQuery(
        'cryptoEngineStatus',
        () => apiClient.getCryptoEngineStatus(),
        { refetchInterval: 15000, retry: false, enabled: !!user }
    );
    const credentialsRequired = engineStatus?.credentialsRequired === true;

    const { data: status, isLoading, error } = useQuery<BotStatus>(
        'cryptoBotStatus',
        async () => {
            const res = await apiClient.getCryptoStatus();
            return res as unknown as BotStatus;
        },
        { refetchInterval: 5000 }
    );

    const patchRunningState = (patch: { isRunning?: boolean; isPaused?: boolean }) => {
        queryClient.setQueryData('cryptoEngineStatus', (old: Record<string, unknown> | undefined) =>
            old ? { ...old, ...patch } : patch
        );
        queryClient.setQueryData('cryptoBotStatus', (old: BotStatus | undefined) =>
            old ? { ...old, ...patch } : old as unknown as BotStatus
        );
    };

    const isRunning = engineStatus?.isRunning != null ? (engineStatus.isRunning as boolean) : (status?.isRunning ?? false);
    const isPaused = engineStatus?.isPaused != null ? (engineStatus.isPaused as boolean) : (status?.isPaused ?? false);

    const startMutation = useMutation<unknown, Error, void>(
        () => apiClient.startCryptoEngine(),
        {
            onSuccess: () => {
                patchRunningState({ isRunning: true, isPaused: false });
                toast.success('Crypto Bot started!');
                queryClient.invalidateQueries('cryptoBotStatus');
                queryClient.invalidateQueries('cryptoEngineStatus');
            },
            onError: (err) => { toast.error(err?.message || 'Failed to start bot'); },
        }
    );

    const stopMutation = useMutation<unknown, Error, void>(
        () => apiClient.stopCryptoEngine(),
        {
            onSuccess: () => {
                patchRunningState({ isRunning: false, isPaused: false });
                toast.success('Crypto Bot stopped');
                queryClient.invalidateQueries('cryptoBotStatus');
                queryClient.invalidateQueries('cryptoEngineStatus');
            },
            onError: (err) => { toast.error(err?.message || 'Failed to stop bot'); },
        }
    );

    const pauseMutation = useMutation<unknown, Error, void>(
        () => apiClient.pauseCryptoEngine(),
        {
            onSuccess: (data) => {
                const d = data as { isRunning?: boolean; isPaused?: boolean } | null;
                const newPaused = d?.isPaused ?? !isPaused;
                patchRunningState({ isRunning: d?.isRunning ?? true, isPaused: newPaused });
                toast.success(isPaused ? 'Crypto Bot resumed' : 'Crypto Bot paused');
                queryClient.invalidateQueries('cryptoBotStatus');
                queryClient.invalidateQueries('cryptoEngineStatus');
            },
            onError: (err) => { toast.error(err?.message || 'Failed to pause bot'); },
        }
    );

    const closeAllMutation = useMutation<unknown, Error, void>(
        () => apiClient.closeAllCryptoPositions(),
    {
        onSuccess: () => {
            toast.success('All crypto positions closed');
            queryClient.invalidateQueries('cryptoBotStatus');
            queryClient.invalidateQueries('cryptoEngineStatus');
        },
        onError: (err) => { toast.error(err?.message || 'Failed to close all positions'); },
    });

    if (isLoading) {
        return (
            <Box sx={{ p: 3 }}>
                <Skeleton variant="rectangular" height={200} sx={{ mb: 2, borderRadius: 2 }} />
                <Grid container spacing={2}>
                    {[1, 2, 3, 4].map((i) => (
                        <Grid item xs={12} sm={6} md={3} key={i}>
                            <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
                <Alert severity="error" sx={{ mb: 2 }}>
                    Crypto Bot is offline. Make sure the bot server is running on port 3006.
                </Alert>
                <Button
                    variant="contained"
                    onClick={() => queryClient.invalidateQueries('cryptoBotStatus')}
                >
                    Retry Connection
                </Button>
            </Box>
        );
    }

    const winRate = status?.stats?.totalTrades
        ? ((status.stats.winners / status.stats.totalTrades) * 100).toFixed(1)
        : '0';

    const getBtcTrendColor = (trend: string | null) => {
        switch (trend) {
            case 'bullish': return '#10b981';
            case 'bearish': return '#ef4444';
            default: return '#6b7280';
        }
    };

    return (
        <>
        <SEO title="Crypto Bot" description="AI-powered cryptocurrency trading bot. Automated crypto strategies with real-time monitoring and risk management." path="/crypto" />
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            {/* Credential prompt */}
            {credentialsRequired && (
                <Alert
                    severity="info"
                    sx={{ mb: 2 }}
                    action={
                        <Button
                            color="inherit"
                            size="small"
                            startIcon={<Settings />}
                            onClick={() => navigate('/settings')}
                        >
                            Add Credentials
                        </Button>
                    }
                >
                    Connect your Kraken account to activate your personal Crypto Bot engine.
                </Alert>
            )}
            {/* Header */}
            <Paper
                sx={{
                    p: 3,
                    mb: 3,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    borderRadius: 3,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: { xs: 2, md: 0 } }}>
                    <Box>
                        <Typography variant="h4" sx={{ color: 'white', fontWeight: 700, mb: 1 }}>
                            ₿ Crypto Bot
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                            LONG + SHORT • 24/7/365 Trading • BTC Correlation Analysis
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                            icon={<AccessTime />}
                            label="24/7"
                            sx={{ fontWeight: 600, color: 'white', bgcolor: 'rgba(255,255,255,0.2)' }}
                        />
                        <Chip
                            icon={<SwapVert />}
                            label="BIDIRECTIONAL"
                            sx={{ fontWeight: 600, color: 'white', bgcolor: 'rgba(255,255,255,0.2)' }}
                        />
                        <Chip
                            label={status?.mode || (isRunning ? 'LIVE' : 'DEMO')}
                            color={status?.mode === 'DEMO' ? 'warning' : status?.mode === 'LIVE' ? 'success' : 'info'}
                            sx={{ fontWeight: 600 }}
                        />
                        <Chip
                            label={isRunning ? 'RUNNING' : 'STOPPED'}
                            color={isRunning ? 'success' : 'default'}
                            sx={{ fontWeight: 600 }}
                        />
                    </Box>
                </Box>
            </Paper>

            {/* BTC Trend Alert */}
            {status?.btcTrend && (
                <Alert
                    severity={status.btcTrend === 'bullish' ? 'success' : 'error'}
                    sx={{ mb: 3 }}
                    icon={status.btcTrend === 'bullish' ? <TrendingUp /> : <TrendingDown />}
                >
                    <Typography variant="subtitle2">
                        BTC is currently <strong>{status.btcTrend.toUpperCase()}</strong> -
                        {status.btcTrend === 'bullish'
                            ? ' Altcoins allowed to go LONG'
                            : ' Altcoins allowed to go SHORT'}
                    </Typography>
                </Alert>
            )}

            {/* Volatility Pause Alert */}
            {status?.isVolatilityPaused && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    <Typography variant="subtitle2">
                        ⚠️ Trading paused due to extreme volatility - Will auto-resume when markets stabilize
                    </Typography>
                </Alert>
            )}

            {/* Stats Grid */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                EQUITY
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                                ${status?.equity?.toLocaleString() || '0'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                BTC TREND
                            </Typography>
                            <Typography
                                variant="h5"
                                sx={{
                                    fontWeight: 700,
                                    mt: 0.5,
                                    color: getBtcTrendColor(status?.btcTrend || null),
                                    textTransform: 'uppercase',
                                }}
                            >
                                {status?.btcTrend || 'Neutral'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                LONG / SHORT TRADES
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                                <span style={{ color: '#10b981' }}>{status?.stats?.longTrades || 0}</span>
                                {' / '}
                                <span style={{ color: '#ef4444' }}>{status?.stats?.shortTrades || 0}</span>
                            </Typography>
                            <Typography variant="caption" sx={{
                                color: parseFloat(winRate) >= 50 ? '#10b981' : parseFloat(winRate) >= 45 ? '#f59e0b' : status?.stats?.totalTrades ? '#ef4444' : 'text.secondary',
                                fontWeight: status?.stats?.totalTrades ? 600 : 400,
                            }}>
                                Win Rate: {winRate}% {status?.stats?.totalTrades ? `(${status.stats.totalTrades} trades)` : ''}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Casino sx={{ color: '#8b5cf6' }} />
                                <Typography variant="caption" color="text.secondary">
                                    KELLY SIZE
                                </Typography>
                            </Box>
                            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: '#8b5cf6' }}>
                                3%
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                40% Kelly (Crypto)
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Strategy Intelligence Panel */}
            <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'rgba(245, 158, 11, 0.3)', background: 'rgba(245, 158, 11, 0.05)' }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    🧠 Strategy Intelligence <Chip label="7-Strategy Ensemble" size="small" sx={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', fontWeight: 600 }} />
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">REGIME</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#10b981' }}>
                                {isRunning ? '📊 Active Detection' : '⏸️ Inactive'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">HMM + BTC Trend Alignment</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{
                            p: 1.5, borderRadius: 2,
                            background: (status?.dailyReturn ?? 0) <= -2.0 ? 'rgba(239,68,68,0.15)' : (status?.dailyReturn ?? 0) <= -1.5 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.1)',
                            border: '1px solid',
                            borderColor: (status?.dailyReturn ?? 0) <= -2.0 ? 'rgba(239,68,68,0.3)' : (status?.dailyReturn ?? 0) <= -1.5 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.2)'
                        }}>
                            <Typography variant="caption" color="text.secondary">DRAWDOWN THROTTLE</Typography>
                            <Typography variant="body1" sx={{
                                fontWeight: 700,
                                color: (status?.dailyReturn ?? 0) <= -2.0 ? '#ef4444' : (status?.dailyReturn ?? 0) <= -1.5 ? '#f59e0b' : '#10b981'
                            }}>
                                {(status?.dailyReturn ?? 0) <= -2.0 ? '🛑 PAUSED' : (status?.dailyReturn ?? 0) <= -1.5 ? '⚠️ REDUCED' : '✅ NORMAL'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">3-Level Crypto (wider thresholds)</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">POSITION SIZING</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#6366f1' }}>🎲 MC → Kelly</Typography>
                            <Typography variant="caption" color="text.secondary">40% Kelly (crypto adjusted)</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">STOP-LOSS ENGINE</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#ec4899' }}>📉 GARCH(1,1)</Typography>
                            <Typography variant="caption" color="text.secondary">Dynamic 3%-20% range (crypto vol)</Typography>
                        </Box>
                    </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {['7-Strategy Ensemble', 'GARCH Stops', 'Monte Carlo', 'MTF Filter', 'Volume Confirm', 'Trailing Stop (3%)', 'Time Exit (3d)', 'Correlation Filter', 'Crypto Sector Limits', 'Limit Orders', 'Bidirectional (L+S)'].map(f => (
                        <Chip key={f} label={f} size="small" variant="outlined"
                            sx={{ fontSize: '0.7rem', borderColor: 'rgba(245,158,11,0.4)', color: 'rgba(245,158,11,0.9)' }} />
                    ))}
                </Box>
            </Paper>

            {/* Controls */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600, mr: 2 }}>
                        Controls:
                    </Typography>
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<PlayArrow />}
                        onClick={() => startMutation.mutate()}
                        disabled={isRunning || startMutation.isLoading}
                    >
                        Start
                    </Button>
                    <Button
                        variant="contained"
                        color="warning"
                        startIcon={<Pause />}
                        onClick={() => pauseMutation.mutate()}
                        disabled={!isRunning || pauseMutation.isLoading}
                    >
                        {isPaused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<Stop />}
                        onClick={() => stopMutation.mutate()}
                        disabled={!isRunning || stopMutation.isLoading}
                    >
                        Stop
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Cancel />}
                        onClick={() => {
                            if (window.confirm('Close ALL open positions immediately?')) {
                                closeAllMutation.mutate();
                            }
                        }}
                        disabled={!(Array.isArray(engineStatus?.positions) ? engineStatus.positions.length : 0) && !status?.positions?.length || closeAllMutation.isLoading}
                        sx={{ borderStyle: 'dashed' }}
                    >
                        Close All
                    </Button>
                </Box>
            </Paper>

            {/* Positions */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Open Positions ({status?.positions?.length || 0}/{status?.config?.maxPositions || 3})
                </Typography>
                {status?.positions && status.positions.length > 0 ? (
                    <Grid container spacing={2}>
                        {status.positions.map((pos) => (
                            <Grid item xs={12} sm={6} md={4} key={pos.symbol}>
                                <Card
                                    sx={{
                                        border: '1px solid',
                                        borderColor: '#10b981',
                                    }}
                                >
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                {pos.symbol}
                                            </Typography>
                                            <Chip
                                                label={pos.tier?.toUpperCase() ?? pos.side?.toUpperCase() ?? 'LONG'}
                                                size="small"
                                                color="success"
                                            />
                                        </Box>
                                        <Typography variant="body2" color="text.secondary">
                                            {(pos.quantity ?? pos.qty ?? 0).toFixed(4)} @ ${(pos.entry ?? pos.entryPrice ?? 0).toFixed(2)}
                                        </Typography>
                                        {(pos.unrealizedPnL ?? pos.unrealizedPL) != null && (
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    fontWeight: 600,
                                                    color: (pos.unrealizedPnL ?? pos.unrealizedPL ?? 0) >= 0 ? '#10b981' : '#ef4444',
                                                    mt: 0.5,
                                                }}
                                            >
                                                {(pos.unrealizedPnL ?? pos.unrealizedPL ?? 0) >= 0 ? '+' : ''}
                                                ${(pos.unrealizedPnL ?? pos.unrealizedPL ?? 0).toFixed(2)}
                                                {pos.currentPrice != null && (
                                                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                                        @ ${pos.currentPrice.toFixed(2)}
                                                    </Typography>
                                                )}
                                            </Typography>
                                        )}
                                        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                                            {pos.stopLoss != null && (
                                                <Typography variant="caption" sx={{ color: '#ef4444' }}>
                                                    SL: ${pos.stopLoss.toFixed(2)}
                                                </Typography>
                                            )}
                                            {pos.takeProfit != null && (
                                                <Typography variant="caption" sx={{ color: '#10b981' }}>
                                                    TP: ${pos.takeProfit.toFixed(2)}
                                                </Typography>
                                            )}
                                            {pos.positionSize != null && (
                                                <Typography variant="caption" color="text.secondary">
                                                    Size: ${pos.positionSize.toFixed(0)}
                                                </Typography>
                                            )}
                                        </Box>
                                    </CardContent>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                ) : (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                        No open positions
                    </Typography>
                )}
            </Paper>

            {/* Risk Info */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    ⚠️ Crypto Risk Management
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                        <Alert severity="warning" sx={{ height: '100%' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                Volatility Filter
                            </Typography>
                            <Typography variant="body2">
                                Trading auto-pauses during extreme market moves (&gt;10% hourly moves)
                            </Typography>
                        </Alert>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Alert severity="info" sx={{ height: '100%' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                BTC Correlation
                            </Typography>
                            <Typography variant="body2">
                                Altcoins only trade in direction of BTC trend
                            </Typography>
                        </Alert>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Alert severity="error" sx={{ height: '100%' }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                                Kill Switch
                            </Typography>
                            <Typography variant="body2">
                                Auto-stops if daily loss exceeds 3%
                            </Typography>
                        </Alert>
                    </Grid>
                </Grid>
            </Paper>

            {/* Config */}
            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Configuration
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary">
                            Stop Loss
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            {((status?.config?.stopLoss || 0.05) * 100).toFixed(0)}%
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary">
                            Profit Target
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#10b981' }}>
                            {((status?.config?.profitTarget || 0.15) * 100).toFixed(0)}%
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary">
                            Risk/Reward
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#f59e0b' }}>
                            1:3
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Typography variant="caption" color="text.secondary">
                            Cryptos
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {(status?.config?.symbols || []).map((sym) => (
                                <Chip
                                    key={sym}
                                    label={sym}
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        borderColor: sym.includes('BTC') ? '#f59e0b' : undefined,
                                        color: sym.includes('BTC') ? '#f59e0b' : undefined,
                                    }}
                                />
                            ))}
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
        </>
    );
}
