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
    Settings,
    Cancel,
} from '@mui/icons-material';
import { apiClient } from '@/services/api';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

interface Position {
    symbol?: string;
    instrument?: string;    // demo mode field name
    qty?: number;
    units?: number;         // demo mode field name
    side?: string;
    direction?: string;     // demo mode field name
    entryPrice?: number;
    entry?: number;         // demo mode field name
    currentPrice?: number;
    unrealizedPL?: number;
    unrealizedPLPct?: number;
    stopLoss?: number;
    takeProfit?: number;
    tier?: string;
}

interface BotStatus {
    isRunning: boolean;
    isPaused: boolean;
    mode: string;
    tradingMode: string;
    session: string;
    equity: number;
    dailyReturn: number;
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

export default function ForexBotPage() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { user } = useAuth();

    const { data: engineStatus } = useQuery(
        'forexEngineStatus',
        () => apiClient.getForexEngineStatus(),
        { refetchInterval: 15000, retry: false }
    );
    const credentialsRequired = engineStatus?.credentialsRequired === true;

    const { data: status, isLoading, error } = useQuery<BotStatus>(
        'forexBotStatus',
        async () => {
            const res = await apiClient.getForexStatus();
            return res as unknown as BotStatus;
        },
        { refetchInterval: 5000 }
    );

    const startMutation = useMutation<unknown, unknown, void>(
        () => user ? apiClient.startForexEngine() : apiClient.startForexTrading(),
        {
            onSuccess: () => {
                toast.success('Forex Bot started!');
                queryClient.invalidateQueries('forexBotStatus');
                queryClient.invalidateQueries('forexEngineStatus');
            },
            onError: () => { toast.error('Failed to start bot'); },
        }
    );

    const stopMutation = useMutation<unknown, unknown, void>(
        () => user ? apiClient.stopForexEngine() : apiClient.stopForexTrading(),
        {
            onSuccess: () => {
                toast.success('Forex Bot stopped');
                queryClient.invalidateQueries('forexBotStatus');
                queryClient.invalidateQueries('forexEngineStatus');
            },
            onError: () => { toast.error('Failed to stop bot'); },
        }
    );

    const pauseMutation = useMutation<unknown, unknown, void>(
        () => apiClient.pauseForexEngine(),
        {
            onSuccess: () => {
                toast.success('Forex Bot paused');
                queryClient.invalidateQueries('forexBotStatus');
                queryClient.invalidateQueries('forexEngineStatus');
            },
            onError: () => { toast.error('Failed to pause bot'); },
        }
    );

    const closeAllMutation = useMutation<unknown, unknown, void>(
        () => apiClient.closeAllForexPositions(),
    {
        onSuccess: () => {
            toast.success('All forex positions closed');
            queryClient.invalidateQueries('forexBotStatus');
            queryClient.invalidateQueries('forexEngineStatus');
        },
        onError: () => { toast.error('Failed to close all positions'); },
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
                    Forex Bot is offline. Make sure the bot server is running on port 3005.
                </Alert>
                <Button
                    variant="contained"
                    onClick={() => queryClient.invalidateQueries('forexBotStatus')}
                >
                    Retry Connection
                </Button>
            </Box>
        );
    }

    const winRate = status?.stats?.totalTrades
        ? ((status.stats.winners / status.stats.totalTrades) * 100).toFixed(1)
        : '0';

    const getSessionColor = (session: string) => {
        switch (session) {
            case 'OVERLAP': return '#10b981';
            case 'LONDON': return '#3b82f6';
            case 'NEW_YORK': return '#8b5cf6';
            case 'TOKYO': return '#f59e0b';
            default: return '#6b7280';
        }
    };

    return (
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
                    Connect your OANDA account to activate your personal Forex Bot engine.
                </Alert>
            )}
            {/* Header */}
            <Paper
                sx={{
                    p: 3,
                    mb: 3,
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    borderRadius: 3,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: { xs: 2, md: 0 } }}>
                    <Box>
                        <Typography variant="h4" sx={{ color: 'white', fontWeight: 700, mb: 1 }}>
                            🌍 Forex Bot
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                            LONG + SHORT • 24/5 Trading • Session-Aware Optimization
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                            icon={<SwapVert />}
                            label="BIDIRECTIONAL"
                            sx={{ fontWeight: 600, color: 'white', bgcolor: 'rgba(255,255,255,0.2)' }}
                        />
                        <Chip
                            label={status?.isRunning ? 'RUNNING' : 'STOPPED'}
                            color={status?.isRunning ? 'success' : 'default'}
                            sx={{ fontWeight: 600 }}
                        />
                        <Chip
                            label={status?.session || 'OFF_PEAK'}
                            sx={{
                                fontWeight: 600,
                                bgcolor: getSessionColor(status?.session || ''),
                                color: 'white',
                            }}
                        />
                    </Box>
                </Box>
            </Paper>

            {/* Stats Grid */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                EQUITY
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5 }}>
                                ${(status?.equity ?? 0).toLocaleString()}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                DAILY RETURN
                            </Typography>
                            <Typography
                                variant="h5"
                                sx={{
                                    fontWeight: 700,
                                    mt: 0.5,
                                    color: (status?.dailyReturn ?? 0) >= 0 ? '#10b981' : '#ef4444',
                                }}
                            >
                                {((status?.dailyReturn ?? 0) * 100).toFixed(2)}%
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
                            <Typography variant="caption" color="text.secondary">
                                Win Rate: {winRate}%
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
                                5%
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Half-Kelly (Forex)
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Strategy Intelligence Panel */}
            <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.05)' }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    🧠 Strategy Intelligence <Chip label="7-Strategy Ensemble" size="small" sx={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', fontWeight: 600 }} />
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">REGIME</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#10b981' }}>
                                {status?.isRunning ? '📊 Active Detection' : '⏸️ Inactive'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">HMM + Session Optimization</Typography>
                        </Box>
                    </Grid>
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
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">POSITION SIZING</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#6366f1' }}>🎲 MC → Kelly</Typography>
                            <Typography variant="caption" color="text.secondary">5K sims, Half-Kelly fallback</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 1.5, borderRadius: 2, background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                            <Typography variant="caption" color="text.secondary">STOP-LOSS ENGINE</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: '#ec4899' }}>📉 GARCH(1,1)</Typography>
                            <Typography variant="caption" color="text.secondary">Dynamic 0.5%-3% range (forex)</Typography>
                        </Box>
                    </Grid>
                </Grid>
                <Box sx={{ mt: 2, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {['7-Strategy Ensemble', 'GARCH Stops', 'Monte Carlo', 'MTF Filter', 'Volume Confirm', 'Flip-on-Reversal', 'Time Exit (4d)', 'Correlation Filter', 'Currency Limits', 'Limit Orders', 'Bidirectional (L+S)', 'Session Pairs'].map(f => (
                        <Chip key={f} label={f} size="small" variant="outlined"
                            sx={{ fontSize: '0.7rem', borderColor: 'rgba(59,130,246,0.4)', color: 'rgba(59,130,246,0.9)' }} />
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
                        disabled={status?.isRunning || startMutation.isLoading}
                    >
                        Start
                    </Button>
                    <Button
                        variant="contained"
                        color="warning"
                        startIcon={<Pause />}
                        onClick={() => pauseMutation.mutate()}
                        disabled={!status?.isRunning || pauseMutation.isLoading}
                    >
                        Pause
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<Stop />}
                        onClick={() => stopMutation.mutate()}
                        disabled={!status?.isRunning || stopMutation.isLoading}
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
                        disabled={!status?.positions?.length || closeAllMutation.isLoading}
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
                        {status.positions.map((pos, idx) => {
                            // Normalise across live (symbol/qty/side/entryPrice/unrealizedPL) and
                            // demo mode (instrument/units/direction/entry) response shapes
                            const sym = pos.symbol ?? pos.instrument ?? '—';
                            const qty = pos.qty ?? pos.units ?? 0;
                            const side = pos.side ?? pos.direction ?? 'long';
                            const ep = pos.entryPrice ?? pos.entry ?? 0;
                            const pnl = pos.unrealizedPL ?? 0;
                            const pnlPct = pos.unrealizedPLPct ?? 0;
                            return (
                                <Grid item xs={12} sm={6} md={4} key={`${sym}-${idx}`}>
                                    <Card
                                        sx={{
                                            border: '1px solid',
                                            borderColor: pnl >= 0 ? '#10b981' : '#ef4444',
                                        }}
                                    >
                                        <CardContent>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                    {sym}
                                                </Typography>
                                                <Chip
                                                    label={side.toUpperCase()}
                                                    size="small"
                                                    color={side === 'long' ? 'success' : 'error'}
                                                />
                                            </Box>
                                            <Typography variant="body2" color="text.secondary">
                                                {qty} units @ {ep.toFixed(5)}
                                            </Typography>
                                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                                {pnl >= 0 ? (
                                                    <TrendingUp sx={{ color: '#10b981', mr: 0.5 }} />
                                                ) : (
                                                    <TrendingDown sx={{ color: '#ef4444', mr: 0.5 }} />
                                                )}
                                                <Typography
                                                    variant="h6"
                                                    sx={{
                                                        fontWeight: 700,
                                                        color: pnl >= 0 ? '#10b981' : '#ef4444',
                                                    }}
                                                >
                                                    ${pnl.toFixed(2)} ({(pnlPct * 100).toFixed(2)}%)
                                                </Typography>
                                            </Box>
                                            {pos.stopLoss != null && (
                                                <Typography variant="caption" color="text.secondary">
                                                    SL: {pos.stopLoss.toFixed(5)} · TP: {pos.takeProfit?.toFixed(5) ?? '—'}
                                                </Typography>
                                            )}
                                        </CardContent>
                                    </Card>
                                </Grid>
                            );
                        })}
                    </Grid>
                ) : (
                    <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                        No open positions
                    </Typography>
                )}
            </Paper>

            {/* Session Info */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Trading Sessions (EST)
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                        <Card sx={{ bgcolor: status?.session === 'OVERLAP' ? 'rgba(16,185,129,0.2)' : 'transparent' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" color="success.main" sx={{ fontWeight: 700 }}>
                                    OVERLAP ⭐
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    8 AM - 12 PM
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Card sx={{ bgcolor: status?.session === 'LONDON' ? 'rgba(59,130,246,0.2)' : 'transparent' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700 }}>
                                    LONDON
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    3 AM - 12 PM
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Card sx={{ bgcolor: status?.session === 'NEW_YORK' ? 'rgba(139,92,246,0.2)' : 'transparent' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" sx={{ color: '#8b5cf6', fontWeight: 700 }}>
                                    NEW YORK
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    8 AM - 5 PM
                                </Typography>
                            </CardContent>
                        </Card>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Card sx={{ bgcolor: status?.session === 'TOKYO' ? 'rgba(245,158,11,0.2)' : 'transparent' }}>
                            <CardContent sx={{ textAlign: 'center' }}>
                                <Typography variant="subtitle2" sx={{ color: '#f59e0b', fontWeight: 700 }}>
                                    TOKYO
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    7 PM - 4 AM
                                </Typography>
                            </CardContent>
                        </Card>
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
                            {((status?.config?.stopLoss ?? 0.015) * 100).toFixed(1)}%
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary">
                            Profit Target
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#10b981' }}>
                            {((status?.config?.profitTarget ?? 0.045) * 100).toFixed(1)}%
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary">
                            Risk/Reward
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 600, color: '#3b82f6' }}>
                            1:3
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Typography variant="caption" color="text.secondary">
                            Currency Pairs
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                            {(status?.config?.symbols || []).map((sym) => (
                                <Chip key={sym} label={sym.replace('_', '/')} size="small" variant="outlined" />
                            ))}
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
