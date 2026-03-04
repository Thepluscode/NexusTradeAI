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
    Stack,
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
    AccountBalance,
    Speed,
    BarChart,
    Person,
    Settings,
} from '@mui/icons-material';
import axios from 'axios';
import { SERVICE_URLS, apiClient } from '@/services/api';
import { useQuery } from 'react-query';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
} from 'recharts';
import type { TradeDaySummary } from '@/types';
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
        icon: <ShowChart sx={{ fontSize: 28 }} />,
        description: 'Momentum • Market Hours (9:30–4 PM EST)',
        gradient: 'linear-gradient(135deg, #0d9e6b 0%, #059669 100%)',
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
        icon: <CurrencyExchange sx={{ fontSize: 28 }} />,
        description: 'Trend Following • 24/5',
        gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
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
        icon: <CurrencyBitcoin sx={{ fontSize: 28 }} />,
        description: 'BTC-Correlation • 24/7/365',
        gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
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

// ── Reusable stat mini-card ──────────────────────────────────────────────────
function SummaryStatBox({
    label,
    value,
    color,
    icon,
    delay,
}: {
    label: string;
    value: string;
    color: string;
    icon?: React.ReactNode;
    delay: number;
}) {
    return (
        <Box
            sx={{
                textAlign: 'center',
                p: { xs: 1.5, sm: 2 },
                borderRadius: '14px',
                bgcolor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                transition: 'all 0.3s ease',
                animation: 'slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both',
                animationDelay: `${delay}s`,
                '&:hover': {
                    bgcolor: alpha(color, 0.06),
                    borderColor: alpha(color, 0.22),
                    transform: 'translateY(-2px)',
                    boxShadow: `0 8px 24px ${alpha(color, 0.1)}`,
                },
            }}
        >
            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5} sx={{ mb: 0.5 }}>
                {icon && <Box sx={{ color, display: 'flex', '& svg': { fontSize: 16 } }}>{icon}</Box>}
                <Typography
                    variant="h5"
                    sx={{
                        fontWeight: 800,
                        color,
                        fontSize: { xs: '1.1rem', sm: '1.4rem' },
                        letterSpacing: '-0.02em',
                        fontVariantNumeric: 'tabular-nums',
                    }}
                >
                    {value}
                </Typography>
            </Stack>
            <Typography
                variant="caption"
                sx={{
                    color: 'text.secondary',
                    fontSize: '0.68rem',
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    display: 'block',
                }}
            >
                {label}
            </Typography>
        </Box>
    );
}

// ── Bot stat row inside card ─────────────────────────────────────────────────
function BotStatItem({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
    return (
        <Box>
            <Typography
                variant="caption"
                sx={{
                    color: 'text.secondary',
                    fontSize: '0.64rem',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    display: 'block',
                    mb: 0.25,
                }}
            >
                {label}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.4}>
                {icon && <Box sx={{ color, display: 'flex', '& svg': { fontSize: 14 } }}>{icon}</Box>}
                <Typography
                    variant="body2"
                    sx={{ fontWeight: 700, color: color || 'text.primary', fontSize: '0.88rem' }}
                >
                    {value}
                </Typography>
            </Stack>
        </Box>
    );
}

// ── P&L Equity Curve ────────────────────────────────────────────────────────
function PnLChart({ days = 30 }: { days?: number }) {
    const { data: summary, isLoading } = useQuery(
        ['overviewPnL', days],
        () => apiClient.getTradesSummary(days),
        { staleTime: 60 * 1000, refetchInterval: 120 * 1000 }
    );

    if (isLoading) {
        return <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />;
    }

    const daily: TradeDaySummary[] = summary?.daily ?? [];

    if (daily.length === 0) {
        return (
            <Box sx={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    No closed trades yet — P&L curve will appear once positions are closed.
                </Typography>
            </Box>
        );
    }

    // Sort ascending by day, then compute running cumulative P&L via reduce (no mutation)
    const sorted = [...daily].sort((a, b) => a.day.localeCompare(b.day));
    const chartData = sorted.reduce<{ day: string; cumPnL: number }[]>((acc, row) => {
        const prev = acc.length > 0 ? acc[acc.length - 1].cumPnL : 0;
        return [...acc, {
            day: new Date(row.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            cumPnL: parseFloat((prev + row.daily_pnl).toFixed(2)),
        }];
    }, []);

    const isPositive = chartData[chartData.length - 1]?.cumPnL >= 0;
    const color = isPositive ? '#10b981' : '#ef4444';

    return (
        <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <defs>
                    <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={color} stopOpacity={0.22} />
                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis
                    dataKey="day"
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                />
                <YAxis
                    tick={{ fill: '#8b949e', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${v >= 0 ? '+' : ''}${v.toFixed(0)}`}
                    width={60}
                />
                <RechartsTooltip
                    contentStyle={{
                        background: 'rgba(13,17,23,0.96)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                    }}
                    labelStyle={{ color: '#e6edf3', fontWeight: 600 }}
                    formatter={(val: number) => [`$${val >= 0 ? '+' : ''}${val.toFixed(2)}`, 'Cumulative P&L']}
                />
                <Area
                    type="monotone"
                    dataKey="cumPnL"
                    stroke={color}
                    strokeWidth={2}
                    fill="url(#pnlGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: color }}
                />
            </AreaChart>
        </ResponsiveContainer>
    );
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

    // Per-user engine statuses — only fetch when logged in
    const isLoggedIn = !!localStorage.getItem('nexus_access_token');
    const { data: userEngines } = useQuery(
        'overviewEngineStatus',
        async () => {
            const [stock, forex, crypto] = await Promise.all([
                apiClient.getStockEngineStatus(),
                apiClient.getForexEngineStatus(),
                apiClient.getCryptoEngineStatus(),
            ]);
            return { stock, forex, crypto } as Record<string, Record<string, unknown>>;
        },
        { enabled: isLoggedIn, refetchInterval: 15000, retry: false }
    );

    const totalEquity = (status?.stock?.equity ?? 0) + (status?.forex?.equity ?? 0) + (status?.crypto?.equity ?? 0);
    const totalDailyPnL = (status?.stock?.dailyPnL ?? 0) + (status?.forex?.dailyPnL ?? 0) + (status?.crypto?.dailyPnL ?? 0);
    const runningBots = [status?.stock, status?.forex, status?.crypto].filter(b => b?.isRunning).length;
    const onlineBots = [status?.stock, status?.forex, status?.crypto].filter(b => b?.online).length;

    if (isLoading) {
        return (
            <Box sx={{ p: { xs: 2, md: 3 } }}>
                <Skeleton variant="rectangular" height={200} sx={{ mb: 3, borderRadius: 3 }} />
                <Grid container spacing={3}>
                    {[1, 2, 3].map((i) => (
                        <Grid item xs={12} md={4} key={i}>
                            <Skeleton variant="rectangular" height={320} sx={{ borderRadius: 3 }} />
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
            icon: <AccountBalance />,
        },
        {
            label: 'Daily P&L',
            value: `${totalDailyPnL >= 0 ? '+' : ''}$${totalDailyPnL.toFixed(2)}`,
            color: totalDailyPnL >= 0 ? '#10b981' : '#ef4444',
            icon: totalDailyPnL >= 0 ? <TrendingUp /> : <TrendingDown />,
        },
        {
            label: 'Bots Running',
            value: `${runningBots} / 3`,
            color: '#3b82f6',
            icon: <Speed />,
        },
        {
            label: 'Bots Online',
            value: `${onlineBots} / 3`,
            color: onlineBots === 3 ? '#10b981' : '#f59e0b',
            icon: <BarChart />,
        },
    ];

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 }, animation: 'fadeIn 0.3s ease both' }}>

            {/* ── Hero Header ──────────────────────────────────────── */}
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 3, sm: 4 },
                    mb: { xs: 3, md: 4 },
                    borderRadius: '20px',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'linear-gradient(135deg, rgba(13, 17, 23, 0.95) 0%, rgba(22, 27, 34, 0.95) 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    animation: 'slideUp 0.45s cubic-bezier(0.4, 0, 0.2, 1) both',
                    // Animated mesh background
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        inset: 0,
                        background:
                            'radial-gradient(ellipse at 8% 50%, rgba(59, 130, 246, 0.14) 0%, transparent 55%),' +
                            'radial-gradient(ellipse at 92% 25%, rgba(139, 92, 246, 0.10) 0%, transparent 50%),' +
                            'radial-gradient(ellipse at 50% 95%, rgba(16, 185, 129, 0.07) 0%, transparent 50%)',
                        pointerEvents: 'none',
                        animation: 'gradientShift 20s ease infinite',
                        backgroundSize: '200% 200%',
                    },
                    // Subtle top shimmer line
                    '&::after': {
                        content: '""',
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '1px',
                        background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.5), rgba(139,92,246,0.4), transparent)',
                    },
                }}
            >
                <Box sx={{ position: 'relative', zIndex: 1 }}>
                    {/* Title Row */}
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 3 }}>
                        {/* Logo orb */}
                        <Box sx={{ position: 'relative', flexShrink: 0 }}>
                            <Box
                                sx={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: '16px',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 6px 20px rgba(59, 130, 246, 0.4)',
                                    position: 'relative',
                                    zIndex: 1,
                                }}
                            >
                                <Bolt sx={{ color: '#fff', fontSize: 28 }} />
                            </Box>
                            <Box
                                sx={{
                                    position: 'absolute',
                                    inset: -6,
                                    borderRadius: '22px',
                                    background: 'linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.25))',
                                    filter: 'blur(10px)',
                                    animation: 'pulseGlow 4s ease-in-out infinite',
                                    zIndex: 0,
                                }}
                            />
                        </Box>

                        <Box>
                            <Typography
                                variant="h4"
                                sx={{
                                    fontWeight: 800,
                                    fontSize: { xs: '1.4rem', sm: '1.9rem' },
                                    background: 'linear-gradient(135deg, #e6edf3 20%, #8b949e 100%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    letterSpacing: '-0.025em',
                                    lineHeight: 1.2,
                                }}
                            >
                                NexusTradeAI
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, fontSize: '0.82rem' }}>
                                Automated trading — Stocks, Forex &amp; Crypto
                            </Typography>
                        </Box>

                        <Box sx={{ flex: 1 }} />

                        {/* System status pill */}
                        <Chip
                            size="small"
                            icon={
                                <FiberManualRecord
                                    sx={{
                                        fontSize: '8px !important',
                                        color: `${onlineBots > 0 ? '#10b981' : '#ef4444'} !important`,
                                        animation: onlineBots > 0 ? 'pulseDot 2s ease-in-out infinite' : 'none',
                                    }}
                                />
                            }
                            label={onlineBots > 0 ? `${onlineBots} System${onlineBots > 1 ? 's' : ''} Online` : 'All Offline'}
                            sx={{
                                display: { xs: 'none', sm: 'inline-flex' },
                                height: 28,
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                bgcolor: alpha(onlineBots > 0 ? '#10b981' : '#ef4444', 0.1),
                                color: onlineBots > 0 ? '#10b981' : '#ef4444',
                                border: `1px solid ${alpha(onlineBots > 0 ? '#10b981' : '#ef4444', 0.25)}`,
                                '& .MuiChip-icon': { ml: 0.5 },
                                '& .MuiChip-label': { px: 1 },
                            }}
                        />
                    </Stack>

                    {/* Summary stat grid */}
                    <Grid container spacing={{ xs: 1.5, sm: 2 }}>
                        {summaryStats.map((stat, i) => (
                            <Grid item xs={6} sm={3} key={i}>
                                <SummaryStatBox
                                    label={stat.label}
                                    value={stat.value}
                                    color={stat.color}
                                    icon={stat.icon}
                                    delay={0.08 + i * 0.07}
                                />
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            </Paper>

            {/* ── Trading Bots ─────────────────────────────────────── */}
            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5, animation: 'slideUp 0.45s ease 0.15s both' }}>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>
                    Trading Bots
                </Typography>
                <Chip
                    size="small"
                    label={`${runningBots} Active`}
                    sx={{
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        height: 22,
                        bgcolor: alpha('#10b981', 0.1),
                        color: '#10b981',
                        border: `1px solid ${alpha('#10b981', 0.2)}`,
                    }}
                />
            </Stack>

            <Grid container spacing={3}>
                {BOTS.map((bot, idx) => {
                    const s = status?.[bot.key as keyof AllBotsStatus];
                    return (
                        <Grid item xs={12} md={4} key={bot.key}>
                            <Card
                                sx={{
                                    height: '100%',
                                    animation: 'slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1) both',
                                    animationDelay: `${0.18 + idx * 0.1}s`,
                                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease, border-color 0.3s ease',
                                    '&:hover': {
                                        transform: 'translateY(-6px)',
                                        boxShadow: `0 20px 48px ${alpha(bot.accentColor, 0.14)}`,
                                        borderColor: alpha(bot.accentColor, 0.3),
                                        '& .bot-header-shimmer': { opacity: 1 },
                                    },
                                }}
                            >
                                <CardActionArea onClick={() => navigate(bot.path)} sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                                    {/* ── Gradient header ────────────────────────────────── */}
                                    <Box
                                        sx={{
                                            background: bot.gradient,
                                            p: 2.5,
                                            position: 'relative',
                                            overflow: 'hidden',
                                            flexShrink: 0,
                                            // Decorative circles
                                            '&::before': {
                                                content: '""',
                                                position: 'absolute',
                                                top: -30,
                                                right: -30,
                                                width: 110,
                                                height: 110,
                                                borderRadius: '50%',
                                                background: 'rgba(255, 255, 255, 0.07)',
                                            },
                                            '&::after': {
                                                content: '""',
                                                position: 'absolute',
                                                bottom: -20,
                                                left: -10,
                                                width: 70,
                                                height: 70,
                                                borderRadius: '50%',
                                                background: 'rgba(255, 255, 255, 0.05)',
                                            },
                                        }}
                                    >
                                        {/* Shimmer overlay on hover */}
                                        <Box
                                            className="bot-header-shimmer"
                                            sx={{
                                                position: 'absolute',
                                                inset: 0,
                                                opacity: 0,
                                                transition: 'opacity 0.4s ease',
                                                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                                                backgroundSize: '200% 100%',
                                                animation: 'shimmer 2s ease infinite',
                                                pointerEvents: 'none',
                                            }}
                                        />

                                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ position: 'relative', zIndex: 1 }}>
                                            <Stack direction="row" alignItems="center" spacing={1.5}>
                                                {/* Icon orb */}
                                                <Box
                                                    sx={{
                                                        width: 44,
                                                        height: 44,
                                                        borderRadius: '13px',
                                                        bgcolor: 'rgba(255, 255, 255, 0.15)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'white',
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {bot.icon}
                                                </Box>
                                                <Box>
                                                    <Typography variant="h6" sx={{ color: 'white', fontWeight: 700, lineHeight: 1.2, fontSize: '1rem' }}>
                                                        {bot.name}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.68rem' }}>
                                                        {bot.description}
                                                    </Typography>
                                                </Box>
                                            </Stack>

                                            <Stack spacing={0.5} alignItems="flex-end" sx={{ flexShrink: 0 }}>
                                                <Chip
                                                    size="small"
                                                    icon={
                                                        <FiberManualRecord
                                                            sx={{
                                                                fontSize: '8px !important',
                                                                color: `${s?.online ? '#10b981' : '#ef4444'} !important`,
                                                            }}
                                                        />
                                                    }
                                                    label={s?.online ? 'ONLINE' : 'OFFLINE'}
                                                    sx={{
                                                        bgcolor: 'rgba(0,0,0,0.22)',
                                                        color: 'white',
                                                        fontWeight: 700,
                                                        fontSize: '0.6rem',
                                                        height: 22,
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
                                                            height: 22,
                                                            fontWeight: 600,
                                                        }}
                                                    />
                                                )}
                                            </Stack>
                                        </Stack>
                                    </Box>

                                    {/* ── Card body ─────────────────────────────────────── */}
                                    <CardContent sx={{ p: 2.5, flex: 1 }}>
                                        {s?.online ? (
                                            <>
                                                <Grid container spacing={1.5} sx={{ mb: 2 }}>
                                                    <Grid item xs={6}>
                                                        <BotStatItem
                                                            label="Equity"
                                                            value={`$${(s.equity || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                                            color={bot.accentColor}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={6}>
                                                        <BotStatItem
                                                            label="Daily P&L"
                                                            value={`${(s.dailyPnL ?? 0) >= 0 ? '+' : '-'}$${Math.abs(isNaN(s.dailyPnL) ? 0 : (s.dailyPnL ?? 0)).toFixed(2)}`}
                                                            color={(s.dailyPnL ?? 0) >= 0 ? '#10b981' : '#ef4444'}
                                                            icon={(s.dailyPnL ?? 0) >= 0 ? <TrendingUp /> : <TrendingDown />}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={6}>
                                                        <BotStatItem label="Positions" value={String(s.positions || 0)} />
                                                    </Grid>
                                                    <Grid item xs={6}>
                                                        <BotStatItem
                                                            label="Win Rate"
                                                            value={s.totalTrades > 0 ? `${Number(s.winRate).toFixed(1)}%` : '—'}
                                                            color={s.totalTrades > 0 && s.winRate >= 50 ? '#10b981' : undefined}
                                                        />
                                                    </Grid>
                                                </Grid>
                                                <Divider sx={{ mb: 1.5 }} />
                                            </>
                                        ) : (
                                            <Box
                                                sx={{
                                                    mb: 2,
                                                    py: 2,
                                                    px: 1.5,
                                                    borderRadius: '10px',
                                                    bgcolor: alpha('#ef4444', 0.05),
                                                    border: `1px solid ${alpha('#ef4444', 0.1)}`,
                                                }}
                                            >
                                                <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', fontSize: '0.8rem' }}>
                                                    Bot is offline — click to manage
                                                </Typography>
                                            </Box>
                                        )}

                                        {/* Feature chips */}
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                                            {bot.features.map((feature, i) => (
                                                <Chip
                                                    key={i}
                                                    label={feature}
                                                    size="small"
                                                    sx={{
                                                        fontSize: '0.62rem',
                                                        fontWeight: 500,
                                                        height: 22,
                                                        bgcolor: alpha(bot.accentColor, 0.06),
                                                        color: 'text.secondary',
                                                        border: `1px solid ${alpha(bot.accentColor, 0.12)}`,
                                                    }}
                                                />
                                            ))}
                                        </Box>

                                        {/* Per-user engine status badge */}
                                        {isLoggedIn && (() => {
                                            const eng = userEngines?.[bot.key];
                                            if (!eng) return null;
                                            if (eng.credentialsRequired) {
                                                return (
                                                    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}
                                                        onClick={(e) => { e.stopPropagation(); navigate('/settings'); }}>
                                                        <Settings sx={{ fontSize: 13, color: '#f59e0b' }} />
                                                        <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 600, fontSize: '0.68rem' }}>
                                                            Add credentials to activate your engine
                                                        </Typography>
                                                    </Stack>
                                                );
                                            }
                                            const running = eng.isRunning === true;
                                            return (
                                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
                                                    <Person sx={{ fontSize: 13, color: running ? '#10b981' : '#8b949e' }} />
                                                    <Typography variant="caption" sx={{ color: running ? '#10b981' : '#8b949e', fontWeight: 600, fontSize: '0.68rem' }}>
                                                        Your engine: {running ? 'Running' : 'Stopped'}
                                                    </Typography>
                                                    {eng.activePositions != null && Number(eng.activePositions) > 0 && (
                                                        <Chip size="small" label={`${eng.activePositions} pos`}
                                                            sx={{ height: 16, fontSize: '0.58rem', bgcolor: alpha(bot.accentColor, 0.12), color: bot.accentColor }} />
                                                    )}
                                                </Stack>
                                            );
                                        })()}

                                        <Typography
                                            variant="caption"
                                            sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 0.3,
                                                color: bot.accentColor,
                                                fontWeight: 600,
                                                fontSize: '0.72rem',
                                                letterSpacing: '0.01em',
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

            {/* ── P&L Equity Curve ─────────────────────────────────── */}
            <Box sx={{ mt: 5, animation: 'slideUp 0.5s ease 0.25s both' }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                        Cumulative P&amp;L
                    </Typography>
                    <Chip
                        size="small"
                        label="30d"
                        sx={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            height: 22,
                            bgcolor: alpha('#3b82f6', 0.1),
                            color: '#3b82f6',
                            border: `1px solid ${alpha('#3b82f6', 0.2)}`,
                        }}
                    />
                </Stack>
                <Paper
                    elevation={0}
                    sx={{
                        p: { xs: 2, sm: 3 },
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(255,255,255,0.02)',
                    }}
                >
                    <PnLChart days={30} />
                </Paper>
            </Box>

            {/* ── Strategy Performance ─────────────────────────────── */}
            <Box sx={{ mt: 5, animation: 'slideUp 0.5s ease 0.3s both' }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2.5 }}>
                    Strategy Performance
                </Typography>
                <StrategiesPanel />
            </Box>

            {/* ── AI Assistant ─────────────────────────────────────── */}
            <Box sx={{ mt: 5, animation: 'slideUp 0.5s ease 0.38s both', pb: 4 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 2.5 }}>
                    AI Assistant
                </Typography>
                <Paper sx={{ p: 3, borderRadius: '16px' }}>
                    <AIChat />
                </Paper>
            </Box>
        </Box>
    );
}
