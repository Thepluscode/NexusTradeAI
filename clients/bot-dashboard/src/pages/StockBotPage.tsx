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
    alpha,
    LinearProgress,
} from '@mui/material';
import {
    TrendingUp,
    TrendingDown,
    PlayArrow,
    Pause,
    Stop,
    Casino,
    Settings,
    Cancel,
    ShowChart,
} from '@mui/icons-material';
import axios from 'axios';
import { SERVICE_URLS, apiClient } from '@/services/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

interface Position {
    symbol: string;
    qty?: number;
    quantity?: number;
    side: string;
    entryPrice?: number;
    avg_entry_price?: string;
    currentPrice?: number;
    current_price?: string;
    unrealizedPL?: number;
    unrealizedPnL?: number;
    pnl?: number;
    unrealizedPLPct?: number;
    unrealized_plpc?: string;
}

interface BotStatus {
    isRunning: boolean;
    isPaused: boolean;
    mode: string;
    equity: number;
    dailyReturn: number;
    dailyPnL: number;
    openPnL: number;
    positions: Position[];
    stats: {
        totalTrades: number;
        winners: number;
        losers: number;
        totalPnL: number;
        maxDrawdown: number;
        winRate?: number;
        profitFactor?: number;
        totalTradesToday?: number;
    };
    config: {
        symbols: string[];
        maxPositions: number;
        stopLoss: number;
        profitTarget: number;
        dailyLossLimit: number;
    };
}

const API_BASE = SERVICE_URLS.stockBot;

export default function StockBotPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Per-user engine status (JWT-scoped) — shows credential prompt when needed
    const { data: engineStatus } = useQuery(
        'stockEngineStatus',
        () => apiClient.getStockEngineStatus(),
        { refetchInterval: 15000, retry: false, enabled: !!user }
    );
    const credentialsRequired = engineStatus?.credentialsRequired === true;

    // Fetch bot status
    const { data: status, isLoading, error } = useQuery<BotStatus>(
        'stockBotStatus',
        async () => {
            const res = await axios.get(`${API_BASE}/api/trading/status`);
            // Stock bot wraps response in { success, data: {...} }
            const d = res.data?.data ?? res.data;
            const positions = d?.positions ?? [];
            const equity = Number(d?.account?.equity ?? d?.equity ?? d?.portfolioValue ?? 0);
            const dailyPnL = Number(d?.dailyPnL ?? 0);
            const priorCloseEquity = equity - dailyPnL;
            const derivedDailyReturn = priorCloseEquity > 0 ? (dailyPnL / priorCloseEquity) * 100 : 0;
            const openPnL = positions.reduce((sum: number, pos: Position) =>
                sum + Number(pos.unrealizedPnL ?? pos.pnl ?? pos.unrealizedPL ?? 0), 0
            );
            return {
                isRunning: d?.isRunning ?? false,
                isPaused: d?.isPaused ?? false,
                mode: d?.mode ?? 'PAPER',
                equity,
                dailyReturn: derivedDailyReturn,
                dailyPnL,
                openPnL,
                positions,
                stats: {
                    totalTrades: d?.performance?.totalTrades ?? d?.stats?.totalTrades ?? d?.totalTrades ?? 0,
                    winners: d?.performance?.winners ?? d?.stats?.winners ?? 0,
                    losers: d?.performance?.losers ?? d?.stats?.losers ?? 0,
                    totalPnL: d?.performance?.totalPnL ?? d?.stats?.totalPnL ?? d?.dailyPnL ?? 0,
                    maxDrawdown: d?.performance?.maxDrawdown ?? d?.stats?.maxDrawdown ?? 0,
                    winRate: d?.performance?.winRate ?? d?.stats?.winRate ?? 0,
                    profitFactor: d?.performance?.profitFactor ?? d?.stats?.profitFactor ?? 0,
                    totalTradesToday: d?.performance?.totalTrades ?? d?.stats?.totalTradesToday ?? 0,
                },
                config: d?.config ?? {
                    symbols: [],
                    maxPositions: 6,
                    stopLoss: 4,
                    profitTarget: 8,
                    dailyLossLimit: -500,
                },
            } as BotStatus;
        },
        { refetchInterval: 5000 }
    );

    // Helper: immediately patch BOTH caches so UI reacts instantly
    const patchRunningState = (patch: { isRunning?: boolean; isPaused?: boolean }) => {
        queryClient.setQueryData('stockEngineStatus', (old: Record<string, unknown> | undefined) =>
            old ? { ...old, ...patch } : patch
        );
        // Also patch the global status so the chip + button disabled logic is consistent
        queryClient.setQueryData('stockBotStatus', (old: BotStatus | undefined) =>
            old ? { ...old, ...patch } : old as unknown as BotStatus
        );
    };

    // Effective running/paused state — prefer engineStatus when available, fall back to global status
    const isRunning = engineStatus?.isRunning != null ? (engineStatus.isRunning as boolean) : (status?.isRunning ?? false);
    const isPaused = engineStatus?.isPaused != null ? (engineStatus.isPaused as boolean) : (status?.isPaused ?? false);

    // Control mutations
    const startMutation = useMutation<unknown, Error, void>(
        async () => user ? apiClient.startStockEngine() : axios.post(`${API_BASE}/api/trading/start`),
        {
            onSuccess: () => {
                patchRunningState({ isRunning: true, isPaused: false });
                toast.success('Stock Bot started!');
                queryClient.invalidateQueries('stockBotStatus');
                queryClient.invalidateQueries('stockEngineStatus');
            },
            onError: (err) => { toast.error(err?.message || 'Failed to start bot'); },
        }
    );

    const stopMutation = useMutation<unknown, Error, void>(
        async () => user ? apiClient.stopStockEngine() : axios.post(`${API_BASE}/api/trading/stop`),
        {
            onSuccess: () => {
                patchRunningState({ isRunning: false, isPaused: false });
                toast.success('Stock Bot stopped');
                queryClient.invalidateQueries('stockBotStatus');
                queryClient.invalidateQueries('stockEngineStatus');
            },
            onError: (err) => { toast.error(err?.message || 'Failed to stop bot'); },
        }
    );

    const pauseMutation = useMutation<unknown, Error, void>(
        async () => user ? apiClient.pauseStockEngine() : axios.post(`${API_BASE}/api/trading/pause`),
        {
            onSuccess: (data) => {
                const d = data as { isRunning?: boolean; isPaused?: boolean } | null;
                const newPaused = d?.isPaused ?? !isPaused;
                patchRunningState({ isRunning: d?.isRunning ?? true, isPaused: newPaused });
                toast.success(isPaused ? 'Stock Bot resumed' : 'Stock Bot paused');
                queryClient.invalidateQueries('stockBotStatus');
                queryClient.invalidateQueries('stockEngineStatus');
            },
            onError: (err) => { toast.error(err?.message || 'Failed to pause bot'); },
        }
    );

    const closeAllMutation = useMutation<unknown, Error, void>(async () => {
        if (user) return apiClient.closeAllStockPositions();
        return axios.post(`${API_BASE}/api/trading/close-all`);
    }, {
        onSuccess: () => {
            toast.success('All stock positions closed');
            queryClient.invalidateQueries('stockBotStatus');
            queryClient.invalidateQueries('stockEngineStatus');
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
                    Stock Bot is offline. Unable to reach the stock bot service.
                </Alert>
                <Button
                    variant="contained"
                    onClick={() => queryClient.invalidateQueries('stockBotStatus')}
                >
                    Retry Connection
                </Button>
            </Box>
        );
    }

    // Bot returns stats.winRate already as a 0-100 number — use it directly
    // rather than recomputing from winners/totalTrades (which may diverge)
    const winRate = status?.stats?.winRate != null
        ? Number(status.stats.winRate).toFixed(1)
        : '0';

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            {/* Credential prompt — shown when user is logged in but hasn't saved Alpaca keys yet */}
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
                    Connect your Alpaca account to activate your personal Stock Bot engine.
                </Alert>
            )}
            {/* Header */}
            <Paper
                sx={{
                    p: { xs: 2.5, md: 3 },
                    mb: 3,
                    borderRadius: '20px',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'rgba(13, 17, 23, 0.85)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    backdropFilter: 'blur(20px)',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        background:
                            'radial-gradient(ellipse at 5% 50%, rgba(16,185,129,0.12) 0%, transparent 55%),' +
                            'radial-gradient(ellipse at 95% 20%, rgba(6,182,212,0.07) 0%, transparent 50%)',
                        pointerEvents: 'none',
                    },
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: 0, left: 0, right: 0,
                        height: '2px',
                        background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.6), rgba(6,182,212,0.4), transparent)',
                    },
                }}
            >
                <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: { xs: 2, md: 0 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Box sx={{
                            width: 48, height: 48, borderRadius: '14px',
                            background: 'linear-gradient(135deg, #10b981, #059669)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 4px 16px rgba(16,185,129,0.35)',
                        }}>
                            <ShowChart sx={{ color: 'white', fontSize: 26 }} />
                        </Box>
                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em', color: '#e6edf3' }}>
                                Stock Bot
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, fontSize: '0.82rem' }}>
                                LONG Only · Market Hours 9:30 AM–4 PM EST · 3-Tier Momentum
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip
                            label={isRunning ? (isPaused ? 'PAUSED' : 'RUNNING') : 'STOPPED'}
                            size="small"
                            sx={{
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                bgcolor: isRunning && !isPaused ? alpha('#10b981', 0.15) : isRunning && isPaused ? alpha('#f59e0b', 0.15) : alpha('#6b7280', 0.15),
                                color: isRunning && !isPaused ? '#34d399' : isRunning && isPaused ? '#fbbf24' : '#9ca3af',
                                border: `1px solid ${isRunning && !isPaused ? 'rgba(16,185,129,0.35)' : isRunning && isPaused ? 'rgba(245,158,11,0.35)' : 'rgba(107,114,128,0.25)'}`,
                            }}
                        />
                        <Chip
                            label={status?.mode || 'PAPER'}
                            size="small"
                            variant="outlined"
                            sx={{ fontWeight: 600, fontSize: '0.7rem', borderColor: 'rgba(6,182,212,0.4)', color: '#22d3ee' }}
                        />
                    </Box>
                </Box>
            </Paper>

            {/* Stats Grid */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden',
                        '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #10b981, rgba(16,185,129,0.2))' }
                    }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem', fontWeight: 600 }}>
                                Equity
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, letterSpacing: '-0.02em' }}>
                                ${(status?.equity ?? 0).toLocaleString()}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>
                                {status?.config?.maxPositions ?? 6} max positions
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden',
                        '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                            background: `linear-gradient(90deg, ${(status?.dailyReturn ?? 0) >= 0 ? '#10b981' : '#ef4444'}, rgba(0,0,0,0))` }
                    }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem', fontWeight: 600 }}>
                                Daily Return
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 800, mt: 0.5, letterSpacing: '-0.02em',
                                color: (status?.dailyReturn ?? 0) >= 0 ? '#10b981' : '#ef4444',
                            }}>
                                {(status?.dailyReturn ?? 0) >= 0 ? '+' : ''}{(status?.dailyReturn ?? 0).toFixed(2)}%
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.68rem' }}>
                                ${(status?.dailyPnL ?? 0).toFixed(2)} vs prior close · ${(status?.openPnL ?? 0).toFixed(2)} open
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden',
                        '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                            background: `linear-gradient(90deg, ${parseFloat(winRate) >= 50 ? '#10b981' : parseFloat(winRate) >= 45 ? '#f59e0b' : status?.stats?.totalTrades ? '#ef4444' : '#6b7280'}, rgba(0,0,0,0))` }
                    }}>
                        <CardContent sx={{ pb: '8px !important' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem', fontWeight: 600 }}>
                                Win Rate
                            </Typography>
                            <Typography variant="h5" sx={{
                                fontWeight: 800, mt: 0.5, letterSpacing: '-0.02em',
                                color: parseFloat(winRate) >= 50 ? '#10b981' : parseFloat(winRate) >= 45 ? '#f59e0b' : status?.stats?.totalTrades ? '#ef4444' : 'text.secondary',
                            }}>
                                {winRate}%
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                {status?.stats?.totalTrades || 0} trades · need ≥45%
                            </Typography>
                        </CardContent>
                        {status?.stats?.totalTrades ? (
                            <LinearProgress
                                variant="determinate"
                                value={Math.min(100, parseFloat(winRate))}
                                sx={{ height: 3, mx: 2, mb: 1.5, borderRadius: 2,
                                    bgcolor: 'rgba(255,255,255,0.05)',
                                    '& .MuiLinearProgress-bar': {
                                        bgcolor: parseFloat(winRate) >= 50 ? '#10b981' : parseFloat(winRate) >= 45 ? '#f59e0b' : '#ef4444',
                                        borderRadius: 2,
                                    }
                                }}
                            />
                        ) : null}
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%', position: 'relative', overflow: 'hidden',
                        '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: 'linear-gradient(90deg, #8b5cf6, rgba(139,92,246,0.2))' }
                    }}>
                        <CardContent sx={{ pb: '8px !important' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Casino sx={{ color: '#8b5cf6', fontSize: 16 }} />
                                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.68rem', fontWeight: 600 }}>
                                    Kelly Size
                                </Typography>
                            </Box>
                            <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.5, letterSpacing: '-0.02em', color: '#8b5cf6' }}>
                                {status?.stats?.profitFactor ? `${(status.stats.profitFactor).toFixed(2)}×` : '—'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                Profit factor · target ≥1.5
                            </Typography>
                        </CardContent>
                        {status?.stats?.profitFactor ? (
                            <LinearProgress
                                variant="determinate"
                                value={Math.min(100, (status.stats.profitFactor / 2) * 100)}
                                sx={{ height: 3, mx: 2, mb: 1.5, borderRadius: 2,
                                    bgcolor: 'rgba(255,255,255,0.05)',
                                    '& .MuiLinearProgress-bar': {
                                        bgcolor: status.stats.profitFactor >= 1.5 ? '#10b981' : status.stats.profitFactor >= 1.2 ? '#f59e0b' : '#ef4444',
                                        borderRadius: 2,
                                    }
                                }}
                            />
                        ) : null}
                    </Card>
                </Grid>
            </Grid>

            {/* Strategy Intelligence Panel */}
            <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'rgba(139, 92, 246, 0.3)', background: 'rgba(139, 92, 246, 0.05)' }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    🧠 Strategy Intelligence <Chip label="7-Strategy Ensemble" size="small" sx={{ background: 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', fontWeight: 600 }} />
                </Typography>
                <Grid container spacing={2}>
                    {/* Regime Detection */}
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">REGIME</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#10b981' }}>
                                {isRunning ? '📊 Active Detection' : '⏸️ Inactive'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">HMM + Baum-Welch Calibration</Typography>
                        </Box>
                    </Grid>
                    {/* Drawdown Throttle */}
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{
                            p: 1.5, borderRadius: 2,
                            background: (status?.dailyReturn ?? 0) <= -1.5 ? 'rgba(239,68,68,0.15)' : (status?.dailyReturn ?? 0) <= -1.0 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.1)',
                            border: '1px solid',
                            borderColor: (status?.dailyReturn ?? 0) <= -1.5 ? 'rgba(239,68,68,0.3)' : (status?.dailyReturn ?? 0) <= -1.0 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.2)'
                        }}>
                            <Typography variant="caption" color="text.secondary">DRAWDOWN THROTTLE</Typography>
                            <Typography variant="body1" sx={{
                                fontWeight: 700,
                                color: (status?.dailyReturn ?? 0) <= -1.5 ? '#ef4444' : (status?.dailyReturn ?? 0) <= -1.0 ? '#f59e0b' : '#10b981'
                            }}>
                                {(status?.dailyReturn ?? 0) <= -1.5 ? '🛑 PAUSED' : (status?.dailyReturn ?? 0) <= -1.0 ? '⚠️ REDUCED' : '✅ NORMAL'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">3-Level Progressive</Typography>
                        </Box>
                    </Grid>
                    {/* Position Sizing */}
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">POSITION SIZING</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#6366f1' }}>
                                🎲 MC → Kelly
                            </Typography>
                            <Typography variant="caption" color="text.secondary">5K sims, Half-Kelly fallback</Typography>
                        </Box>
                    </Grid>
                    {/* Volatility */}
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">STOP-LOSS ENGINE</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#ec4899' }}>
                                📉 GARCH(1,1)
                            </Typography>
                            <Typography variant="caption" color="text.secondary">Dynamic 3%-15% range</Typography>
                        </Box>
                    </Grid>
                </Grid>
                {/* Active Features */}
                <Box sx={{ mt: 2, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {['7-Strategy Ensemble', 'GARCH Stops', 'Monte Carlo', 'MTF Filter', 'Volume Confirm', 'Trailing Stop', 'Time Exit', 'Correlation Filter', 'Sector Limits', 'Limit Orders'].map(f => (
                        <Chip key={f} label={f} size="small" variant="outlined"
                            sx={{ fontSize: '0.7rem', borderColor: 'rgba(139,92,246,0.4)', color: 'rgba(139,92,246,0.9)' }} />
                    ))}
                </Box>
            </Paper>

            {/* Controls */}
            <Paper sx={{
                p: 2.5, mb: 3,
                border: '1px solid',
                borderColor: isRunning ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)',
                background: isRunning ? 'rgba(16,185,129,0.03)' : 'transparent',
                borderRadius: 3,
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.secondary', fontSize: '0.7rem' }}>
                        Engine Controls
                    </Typography>
                    <Box sx={{ flex: 1, height: 1, bgcolor: 'rgba(255,255,255,0.06)' }} />
                    <Chip
                        size="small"
                        label={isRunning ? (isPaused ? 'PAUSED' : 'RUNNING') : 'STOPPED'}
                        sx={{
                            fontWeight: 700, fontSize: '0.62rem', height: 20,
                            bgcolor: isRunning && !isPaused ? 'rgba(16,185,129,0.15)' : isRunning && isPaused ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
                            color: isRunning && !isPaused ? '#10b981' : isRunning && isPaused ? '#f59e0b' : 'text.secondary',
                        }}
                    />
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<PlayArrow />}
                        onClick={() => startMutation.mutate()}
                        disabled={isRunning || startMutation.isLoading}
                        size="medium"
                    >
                        Start
                    </Button>
                    <Button
                        variant={isPaused ? 'contained' : 'outlined'}
                        color="warning"
                        startIcon={<Pause />}
                        onClick={() => pauseMutation.mutate()}
                        disabled={!isRunning || pauseMutation.isLoading}
                    >
                        {isPaused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Stop />}
                        onClick={() => stopMutation.mutate()}
                        disabled={!isRunning || stopMutation.isLoading}
                    >
                        Stop
                    </Button>
                    <Box sx={{ flex: 1 }} />
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
                        sx={{ borderStyle: 'dashed', opacity: 0.75, '&:hover': { opacity: 1 } }}
                    >
                        Close All
                    </Button>
                </Box>
            </Paper>

            {/* Positions */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 0.5 }}>
                    Open Positions ({status?.positions?.length || 0}/{status?.config?.maxPositions || 5})
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    ${(status?.openPnL ?? 0).toFixed(2)} unrealized from current entries. This will not always match daily return, which is based on account change since prior close.
                </Typography>
                {status?.positions && status.positions.length > 0 ? (
                    <Grid container spacing={2}>
                        {status.positions.map((pos) => (
                            <Grid item xs={12} sm={6} md={4} key={pos.symbol}>
                                {(() => {
                                    const pnlDollar = pos.unrealizedPnL ?? pos.pnl ?? pos.unrealizedPL ?? 0;
                                    const entryPrice = pos.entryPrice ?? parseFloat(pos.avg_entry_price || '0');
                                    const cost = entryPrice * (pos.quantity ?? pos.qty ?? 0);
                                    const pnlPct = cost > 0 ? (pnlDollar / cost) * 100 : 0;
                                    const isGreen = pnlDollar >= 0;
                                    const stopPct = status?.config?.stopLoss ?? 4;
                                    const targetPct = status?.config?.profitTarget ?? 8;
                                    // Progress: 0 = at stop loss, 100 = at profit target
                                    const progressRange = stopPct + targetPct;
                                    const progressVal = Math.max(0, Math.min(100, ((pnlPct + stopPct) / progressRange) * 100));
                                    return (
                                        <Card sx={{
                                            border: '1px solid',
                                            borderColor: isGreen ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)',
                                            position: 'relative', overflow: 'hidden',
                                            '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
                                                background: `linear-gradient(90deg, ${isGreen ? '#10b981' : '#ef4444'}, rgba(0,0,0,0))` }
                                        }}>
                                            <CardContent sx={{ pb: '8px !important' }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                                                    <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: '-0.02em', fontSize: '1rem' }}>
                                                        {pos.symbol}
                                                    </Typography>
                                                    <Chip
                                                        label={pos.side.toUpperCase()}
                                                        size="small"
                                                        sx={{
                                                            fontWeight: 700, fontSize: '0.65rem', height: 22,
                                                            bgcolor: pos.side === 'long' ? alpha('#10b981', 0.15) : alpha('#ef4444', 0.15),
                                                            color: pos.side === 'long' ? '#34d399' : '#f87171',
                                                            border: `1px solid ${pos.side === 'long' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                                        }}
                                                    />
                                                </Box>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.72rem' }}>
                                                    {(pos.qty ?? pos.quantity ?? 0)} shares · entry ${entryPrice.toFixed(2)}
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 0.5 }}>
                                                    {isGreen
                                                        ? <TrendingUp sx={{ color: '#10b981', fontSize: 18 }} />
                                                        : <TrendingDown sx={{ color: '#ef4444', fontSize: 18 }} />}
                                                    <Typography variant="h6" sx={{ fontWeight: 800, fontSize: '1rem', color: isGreen ? '#10b981' : '#ef4444', letterSpacing: '-0.02em' }}>
                                                        {isGreen ? '+' : ''}${pnlDollar.toFixed(2)}
                                                    </Typography>
                                                    {cost > 0 && (
                                                        <Typography variant="caption" sx={{ color: isGreen ? '#34d399' : '#f87171', fontSize: '0.72rem', fontWeight: 600, opacity: 0.8 }}>
                                                            ({pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%)
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </CardContent>
                                            {/* Stop → Target progress bar */}
                                            <Box sx={{ px: 2, pb: 1.5 }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                    <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#ef4444', opacity: 0.7 }}>
                                                        -{stopPct}%
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                                                        stop → target
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ fontSize: '0.6rem', color: '#10b981', opacity: 0.7 }}>
                                                        +{targetPct}%
                                                    </Typography>
                                                </Box>
                                                <Box sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.06)', overflow: 'hidden', position: 'relative' }}>
                                                    {/* break-even marker */}
                                                    <Box sx={{ position: 'absolute', left: `${(stopPct / progressRange) * 100}%`, top: 0, bottom: 0, width: '1px', bgcolor: 'rgba(255,255,255,0.2)', zIndex: 2 }} />
                                                    <Box sx={{
                                                        height: '100%', borderRadius: 2,
                                                        width: `${progressVal}%`,
                                                        background: isGreen
                                                            ? 'linear-gradient(90deg, rgba(245,158,11,0.5), #10b981)'
                                                            : 'linear-gradient(90deg, #ef4444, rgba(245,158,11,0.5))',
                                                        transition: 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    }} />
                                                </Box>
                                            </Box>
                                        </Card>
                                    );
                                })()}
                            </Grid>
                        ))}
                    </Grid>
                ) : (
                    <Box sx={{ textAlign: 'center', py: 5, px: 2 }}>
                        <ShowChart sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                            No open positions
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                            {isRunning ? 'Scanning for momentum signals…' : 'Start the bot to begin scanning'}
                        </Typography>
                    </Box>
                )}
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
                            {status?.config?.stopLoss ?? 4}%
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary">
                            Profit Target
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#10b981' }}>
                            {status?.config?.profitTarget ?? 8}%
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary">
                            Daily Loss Limit
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#ef4444' }}>
                            ${Math.abs(status?.config?.dailyLossLimit ?? 500)}
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Typography variant="caption" color="text.secondary">
                            Symbols
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {(status?.config?.symbols || []).map((sym) => (
                                <Chip key={sym} label={sym} size="small" variant="outlined" />
                            ))}
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
