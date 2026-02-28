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
} from '@mui/icons-material';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';

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

const API_BASE = 'http://localhost:3002';

export default function StockBotPage() {
    const queryClient = useQueryClient();

    // Fetch bot status
    const { data: status, isLoading, error } = useQuery<BotStatus>(
        'stockBotStatus',
        async () => {
            const res = await axios.get(`${API_BASE}/api/trading/status`);
            return res.data;
        },
        { refetchInterval: 5000 }
    );

    // Control mutations
    const startMutation = useMutation(
        () => axios.post(`${API_BASE}/api/trading/start`),
        {
            onSuccess: () => {
                toast.success('Stock Bot started!');
                queryClient.invalidateQueries('stockBotStatus');
            },
            onError: () => { toast.error('Failed to start bot'); },
        }
    );

    const stopMutation = useMutation(
        () => axios.post(`${API_BASE}/api/trading/stop`),
        {
            onSuccess: () => {
                toast.success('Stock Bot stopped');
                queryClient.invalidateQueries('stockBotStatus');
            },
            onError: () => { toast.error('Failed to stop bot'); },
        }
    );

    const pauseMutation = useMutation(
        () => axios.post(`${API_BASE}/api/trading/pause`),
        {
            onSuccess: () => {
                toast.success('Stock Bot paused');
                queryClient.invalidateQueries('stockBotStatus');
            },
            onError: () => { toast.error('Failed to pause bot'); },
        }
    );

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
                    Stock Bot is offline. Make sure the bot server is running on port 3002.
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
            {/* Header */}
            <Paper
                sx={{
                    p: 3,
                    mb: 3,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    borderRadius: 3,
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: { xs: 2, md: 0 } }}>
                    <Box>
                        <Typography variant="h4" sx={{ color: 'white', fontWeight: 700, mb: 1 }}>
                            📈 Stock Bot
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                            LONG Only • Market Hours (9:30AM-4PM EST) • 3-Tier Momentum Strategy
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Chip
                            label={status?.isRunning ? 'RUNNING' : 'STOPPED'}
                            color={status?.isRunning ? 'success' : 'default'}
                            sx={{ fontWeight: 600 }}
                        />
                        <Chip
                            label={status?.mode || 'PAPER'}
                            color="info"
                            variant="outlined"
                            sx={{ fontWeight: 600, color: 'white', borderColor: 'white' }}
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
                                {(status?.dailyReturn ?? 0).toFixed(2)}%
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="caption" color="text.secondary">
                                WIN RATE
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 700, mt: 0.5, color: '#10b981' }}>
                                {winRate}%
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {status?.stats?.totalTrades || 0} trades
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
                                10%
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Half-Kelly
                            </Typography>
                        </CardContent>
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
                                {status?.isRunning ? '📊 Active Detection' : '⏸️ Inactive'}
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
                </Box>
            </Paper>

            {/* Positions */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Open Positions ({status?.positions?.length || 0}/{status?.config?.maxPositions || 5})
                </Typography>
                {status?.positions && status.positions.length > 0 ? (
                    <Grid container spacing={2}>
                        {status.positions.map((pos) => (
                            <Grid item xs={12} sm={6} md={4} key={pos.symbol}>
                                <Card
                                    sx={{
                                        border: '1px solid',
                                        borderColor: (pos.unrealizedPnL ?? pos.pnl ?? pos.unrealizedPL ?? 0) >= 0 ? '#10b981' : '#ef4444',
                                    }}
                                >
                                    <CardContent>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                                {pos.symbol}
                                            </Typography>
                                            <Chip
                                                label={pos.side.toUpperCase()}
                                                size="small"
                                                color={pos.side === 'long' ? 'success' : 'error'}
                                            />
                                        </Box>
                                        <Typography variant="body2" color="text.secondary">
                                            {(pos.qty ?? pos.quantity ?? 0)} shares @ ${(pos.entryPrice ?? parseFloat(pos.avg_entry_price || '0')).toFixed(2)}
                                        </Typography>
                                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                            {(pos.unrealizedPnL ?? pos.pnl ?? pos.unrealizedPL ?? 0) >= 0 ? (
                                                <TrendingUp sx={{ color: '#10b981', mr: 0.5 }} />
                                            ) : (
                                                <TrendingDown sx={{ color: '#ef4444', mr: 0.5 }} />
                                            )}
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    fontWeight: 700,
                                                    color: (pos.unrealizedPnL ?? pos.pnl ?? pos.unrealizedPL ?? 0) >= 0 ? '#10b981' : '#ef4444',
                                                }}
                                            >
                                                ${(pos.unrealizedPnL ?? pos.pnl ?? pos.unrealizedPL ?? 0).toFixed(2)}
                                                {(() => {
                                                    // Bot doesn't return a % field — derive it from dollar P&L and cost basis
                                                    const pnlDollar = pos.unrealizedPnL ?? pos.pnl ?? pos.unrealizedPL ?? null;
                                                    const cost = (pos.entryPrice ?? 0) * (pos.quantity ?? pos.qty ?? 0);
                                                    if (pnlDollar != null && cost > 0) {
                                                        return ` (${((pnlDollar / cost) * 100).toFixed(2)}%)`;
                                                    }
                                                    return '';
                                                })()}
                                            </Typography>
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
