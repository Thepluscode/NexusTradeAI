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
} from '@mui/material';
import {
    ShowChart,
    CurrencyExchange,
    CurrencyBitcoin,
} from '@mui/icons-material';
import axios from 'axios';
import { useQuery } from 'react-query';
import { useNavigate } from 'react-router-dom';

interface BotHealth {
    online: boolean;
    isRunning: boolean;
    mode: string;
    equity?: number;
    positions?: number;
    dailyReturn?: number;
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
        description: 'LONG Only • Market Hours',
        gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        port: 3002,
        path: '/stock',
        features: ['MA Crossover Strategy', '10% Kelly Sizing', '10% Stop Loss', '15% Profit Target'],
        pricing: '$29/month',
    },
    {
        key: 'forex',
        name: 'Forex Bot',
        icon: <CurrencyExchange sx={{ fontSize: 40 }} />,
        description: 'LONG + SHORT • 24/5',
        gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        port: 3005,
        path: '/forex',
        features: ['Bidirectional Trading', 'Session Optimization', '1.5% Stop Loss', '1:3 Risk/Reward'],
        pricing: '$49/month',
    },
    {
        key: 'crypto',
        name: 'Crypto Bot',
        icon: <CurrencyBitcoin sx={{ fontSize: 40 }} />,
        description: 'LONG + SHORT • 24/7/365',
        gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        port: 3006,
        path: '/crypto',
        features: ['BTC Correlation', 'Volatility Filter', '5% Stop Loss', '15% Profit Target'],
        pricing: '$39/month',
    },
];

export default function OverviewPage() {
    const navigate = useNavigate();

    const { data: status, isLoading } = useQuery<AllBotsStatus>(
        'allBotsStatus',
        async () => {
            const results: any = {};
            for (const bot of BOTS) {
                try {
                    const res = await axios.get(`http://localhost:${bot.port}/health`, { timeout: 2000 });
                    results[bot.key] = { ...res.data, online: true };
                } catch {
                    results[bot.key] = { online: false };
                }
            }
            return results;
        },
        { refetchInterval: 5000 }
    );

    // Calculate totals
    const totalEquity = status?.stock?.equity || status?.forex?.equity || status?.crypto?.equity || 0;
    const runningBots = [
        status?.stock?.isRunning,
        status?.forex?.isRunning,
        status?.crypto?.isRunning,
    ].filter(Boolean).length;
    const onlineBots = [
        status?.stock?.online,
        status?.forex?.online,
        status?.crypto?.online,
    ].filter(Boolean).length;

    if (isLoading) {
        return (
            <Box sx={{ p: 3 }}>
                <Skeleton variant="rectangular" height={200} sx={{ mb: 3, borderRadius: 2 }} />
                <Grid container spacing={3}>
                    {[1, 2, 3].map((i) => (
                        <Grid item xs={12} md={4} key={i}>
                            <Skeleton variant="rectangular" height={300} sx={{ borderRadius: 2 }} />
                        </Grid>
                    ))}
                </Grid>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Paper
                sx={{
                    p: 4,
                    mb: 4,
                    background: 'linear-gradient(135deg, #1e1e2f 0%, #2d2d44 100%)',
                    borderRadius: 3,
                    border: '1px solid rgba(255,255,255,0.1)',
                }}
            >
                <Typography variant="h3" sx={{ fontWeight: 800, mb: 1 }}>
                    🎯 NexusTradeAI
                </Typography>
                <Typography variant="h6" sx={{ color: 'rgba(255,255,255,0.7)', mb: 3 }}>
                    Automated Trading Bots for Stocks, Forex & Crypto
                </Typography>
                <Grid container spacing={3}>
                    <Grid item xs={12} sm={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#10b981' }}>
                                ${totalEquity.toLocaleString()}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Account Equity
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#3b82f6' }}>
                                {runningBots} / 3
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Bots Running
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography variant="h4" sx={{ fontWeight: 700, color: '#f59e0b' }}>
                                {onlineBots} / 3
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Bots Online
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            {/* Bot Cards */}
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
                Choose Your Trading Bot
            </Typography>
            <Grid container spacing={3}>
                {BOTS.map((bot) => {
                    const botStatus = status?.[bot.key as keyof AllBotsStatus];
                    return (
                        <Grid item xs={12} md={4} key={bot.key}>
                            <Card
                                sx={{
                                    height: '100%',
                                    transition: 'all 0.3s ease',
                                    '&:hover': {
                                        transform: 'translateY(-8px)',
                                        boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                                    },
                                }}
                            >
                                <CardActionArea onClick={() => navigate(bot.path)} sx={{ height: '100%' }}>
                                    <Box sx={{ background: bot.gradient, p: 3 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box sx={{ color: 'white' }}>
                                                {bot.icon}
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 1 }}>
                                                <Chip
                                                    label={botStatus?.online ? 'ONLINE' : 'OFFLINE'}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: botStatus?.online ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)',
                                                        color: 'white',
                                                        fontWeight: 600,
                                                    }}
                                                />
                                                {botStatus?.isRunning && (
                                                    <Chip
                                                        label="RUNNING"
                                                        size="small"
                                                        sx={{
                                                            bgcolor: 'rgba(255,255,255,0.2)',
                                                            color: 'white',
                                                            fontWeight: 600,
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </Box>
                                        <Typography variant="h5" sx={{ color: 'white', fontWeight: 700, mt: 2 }}>
                                            {bot.name}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                            {bot.description}
                                        </Typography>
                                    </Box>
                                    <CardContent>
                                        <Box sx={{ mb: 2 }}>
                                            {bot.features.map((feature, i) => (
                                                <Chip
                                                    key={i}
                                                    label={feature}
                                                    size="small"
                                                    variant="outlined"
                                                    sx={{ mr: 0.5, mb: 0.5 }}
                                                />
                                            ))}
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#10b981' }}>
                                                {bot.pricing}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                Click to manage →
                                            </Typography>
                                        </Box>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        </Grid>
                    );
                })}
            </Grid>

            {/* All-In-One Bundle */}
            <Paper
                sx={{
                    mt: 4,
                    p: 3,
                    background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                    borderRadius: 3,
                }}
            >
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} md={8}>
                        <Typography variant="h5" sx={{ color: 'white', fontWeight: 700, mb: 1 }}>
                            🚀 All-In-One Bundle
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                            Get access to all 3 trading bots with a 15% discount. Trade stocks, forex, and crypto
                            with one integrated platform.
                        </Typography>
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <Box sx={{ textAlign: 'center' }}>
                            <Typography
                                variant="body2"
                                sx={{ color: 'rgba(255,255,255,0.6)', textDecoration: 'line-through' }}
                            >
                                $117/month
                            </Typography>
                            <Typography variant="h4" sx={{ color: 'white', fontWeight: 700 }}>
                                $99/month
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                Save $18/month
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
}
