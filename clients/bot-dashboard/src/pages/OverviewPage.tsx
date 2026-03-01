import {
    Box,
    Paper,
    Typography,
    Card,
    CardContent,
    CardActionArea,
    Grid,
    Chip,
    Skeleton,
    Divider,
} from '@mui/material';
import { StrategiesPanel } from '@/components/StrategiesPanel';
import { AIChat } from '@/components/AIChat';
import {
    ShowChart,
    CurrencyExchange,
    CurrencyBitcoin,
    TrendingUp,
    TrendingDown,
} from '@mui/icons-material';
import axios from 'axios';
import { SERVICE_URLS } from '@/services/api';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';

interface BotHealth {
    online: boolean;
    isRunning: boolean;
    mode: string;
    equity: number;
    positions: number;
    dailyPnL: number;
    totalTrades: number;
    winRate: number;
}

interface AllBotsStatus {
    stock: BotHealth;
    forex: BotHealth;
    crypto: BotHealth;
}

const BOTS = [
    {
        key: 'stock',
        name: 'Stock Bot',
        icon: <ShowChart sx={{ fontSize: 40 }} />,
        description: 'Momentum • Market Hours (9:30–4 PM EST)',
        gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        port: 3002,
        baseURL: SERVICE_URLS.stockBot,
        path: '/stock',
        statusPath: '/api/trading/status',
        features: ['3-Tier Momentum', 'Anti-Churning (15/day)', 'EOD Close-All', 'Trailing Stops'],
    },
    {
        key: 'forex',
        name: 'Forex Bot',
        icon: <CurrencyExchange sx={{ fontSize: 40 }} />,
        description: 'Trend Following • 24/5',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        port: 3005,
        baseURL: SERVICE_URLS.forexBot,
        path: '/forex',
        statusPath: '/api/forex/status',
        features: ['12 Forex Pairs', 'Session-Optimized', 'Correlation Filter', 'OANDA Integration'],
    },
    {
        key: 'crypto',
        name: 'Crypto Bot',
        icon: <CurrencyBitcoin sx={{ fontSize: 40 }} />,
        description: 'BTC-Correlation • 24/7/365',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        port: 3006,
        baseURL: SERVICE_URLS.cryptoBot,
        path: '/crypto',
        statusPath: '/api/crypto/status',
        features: ['12 Crypto Pairs', 'BTC Trend Filter', 'Volatility Pause', '5% Stop Loss'],
    },
];

async function fetchBotStatus(bot: typeof BOTS[0]): Promise<BotHealth> {
    try {
        const res = await axios.get(`${bot.baseURL}${bot.statusPath}`, { timeout: 3000 });
        const d = res.data?.data || res.data;

        // Normalise across the three different response shapes
        const isRunning = d?.isRunning ?? false;
        const equity =
            d?.account?.equity ??
            d?.equity ??
            d?.portfolioValue ??
            d?.performance?.equity ?? 0;
        const positions =
            d?.performance?.activePositions ??
            d?.positions?.length ??
            (Array.isArray(d?.positions) ? d.positions.length : 0);
        // dailyPnL: stock bot sends dailyReturn as a percentage (e.g. 1.5 = 1.5%),
        // forex/crypto bots send dailyReturn as a decimal ratio (e.g. 0.015 = 1.5%).
        // Detect by magnitude: |value| > 1 → percentage, divide by 100 first.
        const dailyPnLFromReturn = (() => {
            const r = d?.dailyReturn;
            if (r == null || !equity) return null;
            const ratio = typeof r === 'number' && Math.abs(r) > 1 ? r / 100 : r;
            return ratio * equity;
        })();
        const dailyPnL =
            d?.dailyPnL ??
            d?.performance?.dailyPnL ??
            dailyPnLFromReturn ??
            (d?.stats?.totalPnL ?? 0);
        const totalTrades =
            d?.performance?.totalTrades ??
            d?.stats?.totalTrades ??
            d?.totalTrades ?? 0;
        // winRate may be a number (stock bot: 55.3), a "55.3" string (crypto bot), or missing
        const rawWinRate = d?.performance?.winRate ?? d?.stats?.winRate ?? d?.winRate ?? 0;
        const winRate = typeof rawWinRate === 'string'
            ? parseFloat(rawWinRate)
            : rawWinRate;
        const mode = d?.mode ?? d?.tradingMode ?? (isRunning ? 'PAPER' : 'STOPPED');

        return { online: true, isRunning, mode, equity, positions, dailyPnL, totalTrades, winRate };
    } catch {
        return { online: false, isRunning: false, mode: 'OFFLINE', equity: 0, positions: 0, dailyPnL: 0, totalTrades: 0, winRate: 0 };
    }
}

export default function OverviewPage() {
    const navigate = useNavigate();

    const { data: status, isLoading } = useQuery<AllBotsStatus>(
        'allBotsStatus',
        async () => {
            const [stock, forex, crypto] = await Promise.all(BOTS.map(fetchBotStatus));
            return { stock, forex, crypto };
        },
        { refetchInterval: 10000 }
    );

    const totalEquity = (status?.stock?.equity ?? 0) + (status?.forex?.equity ?? 0) + (status?.crypto?.equity ?? 0);
    const totalDailyPnL = (status?.stock?.dailyPnL ?? 0) + (status?.forex?.dailyPnL ?? 0) + (status?.crypto?.dailyPnL ?? 0);
    const runningBots = [status?.stock, status?.forex, status?.crypto].filter(b => b?.isRunning).length;
    const onlineBots = [status?.stock, status?.forex, status?.crypto].filter(b => b?.online).length;

    if (isLoading) {
        return (
            <Box sx={{ p: 3 }}>
                <Skeleton variant="rectangular" height={160} sx={{ mb: 3, borderRadius: 2 }} />
                <Grid container spacing={3}>
                    {[1, 2, 3].map((i) => (
                        <Grid item xs={12} md={4} key={i}>
                            <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            {/* Header summary */}
            <Paper
                sx={{
                    p: { xs: 2.5, sm: 3, md: 4 },
                    mb: { xs: 2, md: 4 },
                    background: 'linear-gradient(135deg, #1e1e2f 0%, #2d2d44 100%)',
                    borderRadius: 3,
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
            >
                <Typography variant="h4" sx={{ fontWeight: 800, mb: 0.5, fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}>
                    🎯 NexusTradeAI
                </Typography>
                <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.6)', mb: 3 }}>
                    Automated trading bots — Stocks, Forex &amp; Crypto
                </Typography>
                <Grid container spacing={3}>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#10b981' }}>
                                ${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">Total Equity</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography
                                variant="h4"
                                sx={{ fontWeight: 700, color: totalDailyPnL >= 0 ? '#10b981' : '#ef4444' }}
                            >
                                {totalDailyPnL >= 0 ? '+' : ''}${totalDailyPnL.toFixed(2)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">Daily P&amp;L</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#3b82f6' }}>
                                {runningBots} / 3
                            </Typography>
                            <Typography variant="body2" color="text.secondary">Bots Running</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#f59e0b' }}>
                                {onlineBots} / 3
                            </Typography>
                            <Typography variant="body2" color="text.secondary">Bots Online</Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            {/* Bot cards */}
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2 }}>
                Trading Bots
            </Typography>
            <Grid container spacing={3}>
                {BOTS.map((bot) => {
                    const s = status?.[bot.key as keyof AllBotsStatus];
                    return (
                        <Grid item xs={12} md={4} key={bot.key}>
                            <Card
                                sx={{
                                    height: '100%',
                                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                    '&:hover': {
                                        transform: 'translateY(-6px)',
                                        boxShadow: '0 16px 32px rgba(0,0,0,0.4)',
                                    },
                                }}
                            >
                                <CardActionArea onClick={() => navigate(bot.path)} sx={{ height: '100%' }}>
                                    {/* Coloured header */}
                                    <Box sx={{ background: bot.gradient, p: 3 }}>
                                        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'flex-start' }, gap: 1 }}>
                                            <Box sx={{ color: 'white' }}>{bot.icon}</Box>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <Chip
                                                    label={s?.online ? 'ONLINE' : 'OFFLINE'}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: s?.online ? 'rgba(16,185,129,0.85)' : 'rgba(239,68,68,0.85)',
                                                        color: 'white',
                                                        fontWeight: 700,
                                                        fontSize: '0.65rem',
                                                    }}
                                                />
                                                {s?.online && (
                                                    <Chip
                                                        label={s.isRunning ? 'RUNNING' : 'STOPPED'}
                                                        size="small"
                                                        sx={{
                                                            bgcolor: s.isRunning ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
                                                            color: 'white',
                                                            fontWeight: 700,
                                                            fontSize: '0.65rem',
                                                        }}
                                                    />
                                                )}
                                                {s?.mode && s.mode !== 'OFFLINE' && s.mode !== 'STOPPED' && (
                                                    <Chip
                                                        label={s.mode}
                                                        size="small"
                                                        sx={{
                                                            bgcolor: 'rgba(0,0,0,0.2)',
                                                            color: 'rgba(255,255,255,0.85)',
                                                            fontSize: '0.6rem',
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </Box>
                                        <Typography variant="h6" sx={{ color: 'white', fontWeight: 700, mt: 1.5 }}>
                                            {bot.name}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                                            {bot.description}
                                        </Typography>
                                    </Box>

                                    <CardContent>
                                        {/* Live stats */}
                                        {s?.online ? (
                                            <>
                                                <Grid container spacing={1} sx={{ mb: 2 }}>
                                                    <Grid item xs={6}>
                                                        <Typography variant="caption" color="text.secondary">Equity</Typography>
                                                        <Typography variant="body2" fontWeight={600}>
                                                            ${(s.equity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </Typography>
                                                    </Grid>
                                                    <Grid item xs={6}>
                                                        <Typography variant="caption" color="text.secondary">Daily P&amp;L</Typography>
                                                        <Typography
                                                            variant="body2"
                                                            fontWeight={600}
                                                            sx={{ color: (s.dailyPnL ?? 0) >= 0 ? 'success.main' : 'error.main', display: 'flex', alignItems: 'center', gap: 0.3 }}
                                                        >
                                                            {(s.dailyPnL ?? 0) >= 0 ? <TrendingUp fontSize="inherit" /> : <TrendingDown fontSize="inherit" />}
                                                            ${Math.abs(isNaN(s.dailyPnL) ? 0 : (s.dailyPnL ?? 0)).toFixed(2)}
                                                        </Typography>
                                                    </Grid>
                                                    <Grid item xs={6}>
                                                        <Typography variant="caption" color="text.secondary">Positions</Typography>
                                                        <Typography variant="body2" fontWeight={600}>{s.positions || 0}</Typography>
                                                    </Grid>
                                                    <Grid item xs={6}>
                                                        <Typography variant="caption" color="text.secondary">Win Rate</Typography>
                                                        <Typography variant="body2" fontWeight={600}>
                                                            {s.totalTrades > 0 ? `${Number(s.winRate).toFixed(1)}%` : '—'}
                                                        </Typography>
                                                    </Grid>
                                                </Grid>
                                                <Divider sx={{ mb: 1.5 }} />
                                            </>
                                        ) : (
                                            <Box sx={{ mb: 2, py: 1 }}>
                                                <Typography variant="body2" color="text.secondary">Bot is offline</Typography>
                                            </Box>
                                        )}

                                        {/* Feature chips */}
                                        <Box>
                                            {bot.features.map((feature, i) => (
                                                <Chip
                                                    key={i}
                                                    label={feature}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ mr: 0.5, mb: 0.5, fontSize: '0.7rem' }}
                                                />
                                            ))}
                                        </Box>

                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                                            Click to manage →
                                        </Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* Strategies summary */}
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, mt: 4 }}>
                Strategy Performance
            </Typography>
            <StrategiesPanel />

            {/* AI Assistant */}
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 2, mt: 4 }}>
                AI Assistant
            </Typography>
            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <AIChat />
            </Paper>
        </Box>
    );
}
