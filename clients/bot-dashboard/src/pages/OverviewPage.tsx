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
    alpha,
} from '@mui/material';
import { StrategiesPanel } from '@/components/StrategiesPanel';
import { AIChat } from '@/components/AIChat';
import {
    ShowChart,
    CurrencyExchange,
    CurrencyBitcoin,
    TrendingUp,
    TrendingDown,
    Bolt,
    FiberManualRecord,
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
        icon: <ShowChart sx={{ fontSize: 32 }} />,
        description: 'Momentum • Market Hours (9:30–4 PM EST)',
        gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        accentColor: '#10b981',
        bgGlow: 'rgba(16, 185, 129, 0.06)',
        port: 3002,
        baseURL: SERVICE_URLS.stockBot,
        path: '/stock',
        statusPath: '/api/trading/status',
        features: ['3-Tier Momentum', 'Anti-Churning', 'EOD Close-All', 'Trailing Stops'],
    },
    {
        key: 'forex',
        name: 'Forex Bot',
        icon: <CurrencyExchange sx={{ fontSize: 32 }} />,
        description: 'Trend Following • 24/5',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        accentColor: '#3b82f6',
        bgGlow: 'rgba(59, 130, 246, 0.06)',
        port: 3005,
        baseURL: SERVICE_URLS.forexBot,
        path: '/forex',
        statusPath: '/api/forex/status',
        features: ['12 Forex Pairs', 'Session-Optimized', 'Correlation Filter', 'OANDA'],
    },
    {
        key: 'crypto',
        name: 'Crypto Bot',
        icon: <CurrencyBitcoin sx={{ fontSize: 32 }} />,
        description: 'BTC-Correlation • 24/7/365',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        accentColor: '#f59e0b',
        bgGlow: 'rgba(245, 158, 11, 0.06)',
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
        const isRunning = d?.isRunning ?? false;
        const equity = d?.account?.equity ?? d?.equity ?? d?.portfolioValue ?? d?.performance?.equity ?? 0;
        const positions = d?.performance?.activePositions ?? d?.positions?.length ?? (Array.isArray(d?.positions) ? d.positions.length : 0);
        const dailyPnLFromReturn = (() => {
            const r = d?.dailyReturn;
            if (r == null || !equity) return null;
            const ratio = typeof r === 'number' && Math.abs(r) > 1 ? r / 100 : r;
            return ratio * equity;
        })();
        const dailyPnL = d?.dailyPnL ?? d?.performance?.dailyPnL ?? dailyPnLFromReturn ?? (d?.stats?.totalPnL ?? 0);
        const totalTrades = d?.performance?.totalTrades ?? d?.stats?.totalTrades ?? d?.totalTrades ?? 0;
        const rawWinRate = d?.performance?.winRate ?? d?.stats?.winRate ?? d?.winRate ?? 0;
        const winRate = typeof rawWinRate === 'string' ? parseFloat(rawWinRate) : rawWinRate;
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
                <Skeleton variant="rectangular" height={180} sx={{ mb: 3, borderRadius: 3 }} />
                <Grid container spacing={3}>
                    {[1, 2, 3].map((i) => (
                        <Grid item xs={12} md={4} key={i}>
                            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 3 }} />
                        </Grid>
                    ))}
                </Grid>
            </Box>
        );
    }

    const summaryStats = [
        {
            label: 'Total Equity',
            value: `$${totalEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            color: '#10b981',
        },
        {
            label: 'Daily P&L',
            value: `${totalDailyPnL >= 0 ? '+' : ''}$${totalDailyPnL.toFixed(2)}`,
            color: totalDailyPnL >= 0 ? '#10b981' : '#ef4444',
            icon: totalDailyPnL >= 0 ? <TrendingUp sx={{ fontSize: 18 }} /> : <TrendingDown sx={{ fontSize: 18 }} />,
        },
        {
            label: 'Bots Running',
            value: `${runningBots} / 3`,
            color: '#3b82f6',
        },
        {
            label: 'Bots Online',
            value: `${onlineBots} / 3`,
            color: onlineBots === 3 ? '#10b981' : '#f59e0b',
        },
    ];

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            {/* ── Hero Header ────────────────────────────────────── */}
            <Paper
                sx={{
                    p: { xs: 3, sm: 4 },
                    mb: { xs: 3, md: 4 },
                    borderRadius: 3,
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.9) 0%, rgba(28, 35, 51, 0.9) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        background:
                            'radial-gradient(ellipse at 10% 50%, rgba(59, 130, 246, 0.12) 0%, transparent 50%),' +
                            'radial-gradient(ellipse at 90% 30%, rgba(139, 92, 246, 0.08) 0%, transparent 50%),' +
                            'radial-gradient(ellipse at 50% 90%, rgba(16, 185, 129, 0.06) 0%, transparent 50%)',
                        pointerEvents: 'none',
                        animation: 'gradientShift 20s ease infinite',
                        backgroundSize: '200% 200%',
                    },
                }}
            >
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                    {/* Title Row */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                        <Box
                            sx={{
                                width: 48,
                                height: 48,
                                borderRadius: '14px',
                                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)',
                            }}
                        >
                            <Bolt sx={{ color: '#fff', fontSize: 26 }} />
                        </Box>
                        <Box>
                            <Typography
                                variant="h4"
                                sx={{
                                    fontWeight: 800,
                                    fontSize: { xs: '1.5rem', sm: '2rem' },
                                    background: 'linear-gradient(135deg, #e6edf3 0%, #8b949e 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                }}
                            >
                                NexusTradeAI
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', mt: -0.5 }}>
                                Automated trading bots — Stocks, Forex & Crypto
                            </Typography>
                        </Box>
                    </Box>

                    {/* Stats Grid */}
                    <Grid container spacing={{ xs: 2, md: 3 }} sx={{ mt: 2 }}>
                        {summaryStats.map((stat, i) => (
                            <Grid item xs={6} sm={3} key={i}>
                                <Box
                                    sx={{
                                        textAlign: 'center',
                                        p: 2,
                                        borderRadius: '14px',
                                        bgcolor: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        transition: 'all 0.3s ease',
                                        animation: 'slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both',
                                        animationDelay: `${i * 0.08}s`,
                                        '&:hover': {
                                            bgcolor: 'rgba(255, 255, 255, 0.05)',
                                            borderColor: alpha(stat.color, 0.25),
                                        },
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                                        {stat.icon && <Box sx={{ color: stat.color, display: 'flex' }}>{stat.icon}</Box>}
                                        <Typography
                                            variant="h5"
                                            sx={{
                                                fontWeight: 800,
                                                color: stat.color,
                                                fontSize: { xs: '1.2rem', sm: '1.5rem' },
                                                letterSpacing: '-0.02em',
                                            }}
                                        >
                                            {stat.value}
                                        </Typography>
                                    </Box>
                                    <Typography
                                        variant="caption"
                                        sx={{
                                            color: 'text.secondary',
                                            fontSize: '0.7rem',
                                            fontWeight: 500,
                                            letterSpacing: '0.03em',
                                            textTransform: 'uppercase',
                                        }}
                                    >
                                        {stat.label}
                                    </Typography>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            </Paper>

            {/* ── Trading Bots ────────────────────────────────────── */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Trading Bots
                </Typography>
                <Chip
                    size="small"
                    label={`${runningBots} Active`}
                    sx={{
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        height: 22,
                        bgcolor: alpha('#10b981', 0.1),
                        color: '#10b981',
                        border: `1px solid ${alpha('#10b981', 0.2)}`,
                    }}
                />
            </Box>
            <Grid container spacing={3}>
                {BOTS.map((bot, idx) => {
                    const s = status?.[bot.key as keyof AllBotsStatus];
                    return (
                        <Grid item xs={12} md={4} key={bot.key}>
                            <Card
                                sx={{
                                    height: '100%',
                                    animation: 'slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both',
                                    animationDelay: `${idx * 0.1}s`,
                                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease, border-color 0.3s ease',
                                    '&:hover': {
                                        transform: 'translateY(-6px)',
                                        boxShadow: `0 20px 40px ${alpha(bot.accentColor, 0.12)}`,
                                        borderColor: alpha(bot.accentColor, 0.3),
                                    },
                                }}
                            >
                                <CardActionArea onClick={() => navigate(bot.path)} sx={{ height: '100%' }}>
                                    {/* Gradient header */}
                                    <Box
                                        sx={{
                                            background: bot.gradient,
                                            p: 3,
                                            position: 'relative',
                                            overflow: 'hidden',
                                            '&::after': {
                                                content: '""',
                                                position: 'absolute',
                                                top: -20,
                                                right: -20,
                                                width: 100,
                                                height: 100,
                                                borderRadius: '50%',
                                                background: 'rgba(255, 255, 255, 0.08)',
                                            },
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <Box sx={{ color: 'white', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                {bot.icon}
                                                <Box>
                                                    <Typography variant="h6" sx={{ color: 'white', fontWeight: 700, lineHeight: 1.2 }}>
                                                        {bot.name}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.7rem' }}>
                                                        {bot.description}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <Chip
                                                    size="small"
                                                    icon={
                                                        <FiberManualRecord
                                                            sx={{
                                                                fontSize: '8px !important',
                                                                color: s?.online ? '#10b981 !important' : '#ef4444 !important',
                                                            }}
                                                        />
                                                    }
                                                    label={s?.online ? 'ONLINE' : 'OFFLINE'}
                                                    sx={{
                                                        bgcolor: 'rgba(0,0,0,0.25)',
                                                        color: 'white',
                                                        fontWeight: 700,
                                                        fontSize: '0.6rem',
                                                        height: 24,
                                                        '& .MuiChip-icon': { ml: 0.5 },
                                                    }}
                                                />
                                                {s?.online && s.mode !== 'OFFLINE' && s.mode !== 'STOPPED' && (
                                                    <Chip
                                                        size="small"
                                                        label={s.mode}
                                                        sx={{
                                                            bgcolor: 'rgba(255,255,255,0.15)',
                                                            color: 'white',
                                                            fontSize: '0.6rem',
                                                            height: 24,
                                                            fontWeight: 600,
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </Box>
                                    </Box>

                                    <CardContent sx={{ p: 2.5 }}>
                                        {s?.online ? (
                                            <>
                                                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                                                    {[
                                                        {
                                                            label: 'Equity',
                                                            value: `$${(s.equity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                                                        },
                                                        {
                                                            label: 'Daily P&L',
                                                            value: `$${Math.abs(isNaN(s.dailyPnL) ? 0 : (s.dailyPnL ?? 0)).toFixed(2)}`,
                                                            icon: (s.dailyPnL ?? 0) >= 0
                                                                ? <TrendingUp sx={{ fontSize: 14 }} />
                                                                : <TrendingDown sx={{ fontSize: 14 }} />,
                                                            color: (s.dailyPnL ?? 0) >= 0 ? '#10b981' : '#ef4444',
                                                        },
                                                        { label: 'Positions', value: String(s.positions || 0) },
                                                        {
                                                            label: 'Win Rate',
                                                            value: s.totalTrades > 0 ? `${Number(s.winRate).toFixed(1)}%` : '—',
                                                        },
                                                    ].map((stat, si) => (
                                                        <Grid item xs={6} key={si}>
                                                            <Typography
                                                                variant="caption"
                                                                sx={{
                                                                    color: 'text.secondary',
                                                                    fontSize: '0.65rem',
                                                                    fontWeight: 500,
                                                                    textTransform: 'uppercase',
                                                                    letterSpacing: '0.05em',
                                                                }}
                                                            >
                                                                {stat.label}
                                                            </Typography>
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                                                                {stat.icon && (
                                                                    <Box sx={{ color: stat.color, display: 'flex' }}>
                                                                        {stat.icon}
                                                                    </Box>
                                                                )}
                                                                <Typography
                                                                    variant="body2"
                                                                    sx={{
                                                                        fontWeight: 700,
                                                                        color: stat.color || 'text.primary',
                                                                        fontSize: '0.9rem',
                                                                    }}
                                                                >
                                                                    {stat.value}
                                                                </Typography>
                                                            </Box>
                                                        </Grid>
                                                    ))}
                                                </Grid>
                                                <Divider sx={{ mb: 1.5 }} />
                                            </>
                                        ) : (
                                            <Box sx={{ mb: 2, py: 1.5 }}>
                                                <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                                                    Bot is offline — click to manage
                                                </Typography>
                                            </Box>
                                        )}

                                        {/* Feature chips */}
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                            {bot.features.map((feature, i) => (
                                                <Chip
                                                    key={i}
                                                    label={feature}
                                                    size="small"
                                                    sx={{
                                                        fontSize: '0.65rem',
                                                        fontWeight: 500,
                                                        height: 24,
                                                        bgcolor: alpha(bot.accentColor, 0.06),
                                                        color: 'text.secondary',
                                                        border: `1px solid ${alpha(bot.accentColor, 0.12)}`,
                                                    }}
                                                />
                                            ))}
                                        </Box>

                                        <Typography
                                            variant="caption"
                                            sx={{
                                                display: 'block',
                                                mt: 2,
                                                color: bot.accentColor,
                                                fontWeight: 600,
                                                fontSize: '0.7rem',
                                                letterSpacing: '0.02em',
                                            }}
                                        >
                                            Manage bot →
                                        </Typography>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* ── Strategy Performance ────────────────────────────── */}
            <Box sx={{ mt: 5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2.5 }}>
                    Strategy Performance
                </Typography>
                <StrategiesPanel />
            </Box>

            {/* ── AI Assistant ────────────────────────────────────── */}
            <Box sx={{ mt: 5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2.5 }}>
                    AI Assistant
                </Typography>
                <Paper sx={{ p: 3, borderRadius: 3 }}>
                    <AIChat />
                </Paper>
            </Box>
        </Box>
    );
}
