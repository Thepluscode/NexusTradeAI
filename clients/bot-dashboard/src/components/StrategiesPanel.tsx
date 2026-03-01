import React from 'react';
import {
    Box,
    Paper,
    Typography,
    Chip,
    LinearProgress,
    Stack,
    Divider,
    Avatar,
    Grid,
} from '@mui/material';
import {
    ShowChart,
    CurrencyExchange,
    CurrencyBitcoin,
    FiberManualRecord,
} from '@mui/icons-material';
import axios from 'axios';
import { useQuery } from 'react-query';
import { SERVICE_URLS } from '@/services/api';

// ── Data fetching ──────────────────────────────────────────────────────────

async function fetchAllBotStats() {
    const results = await Promise.allSettled([
        axios.get(`${SERVICE_URLS.stockBot}/api/trading/status`, { timeout: 3000 }),
        axios.get(`${SERVICE_URLS.stockBot}/api/config`, { timeout: 3000 }),
        axios.get(`${SERVICE_URLS.forexBot}/api/forex/status`, { timeout: 3000 }),
        axios.get(`${SERVICE_URLS.cryptoBot}/api/crypto/status`, { timeout: 3000 }),
    ]);

    return {
        // Stock/forex/crypto bots return flat JSON directly
        stock: results[0].status === 'fulfilled' ? results[0].value.data : null,
        // /api/config wraps in { success, data: {...} }
        config: results[1].status === 'fulfilled' ? results[1].value.data?.data : null,
        forex: results[2].status === 'fulfilled' ? results[2].value.data : null,
        crypto: results[3].status === 'fulfilled' ? results[3].value.data : null,
    };
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatRow({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.6 }}>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="body2" fontWeight={600} color={color || 'text.primary'}>{value}</Typography>
        </Box>
    );
}

function TierBar({ label, stopLoss, profitTarget, color }: { label: string; stopLoss: number; profitTarget: number; color: string }) {
    const rr = stopLoss > 0 ? profitTarget / stopLoss : 0;
    const fillPct = Math.min((rr / 4) * 100, 100); // max display at 4:1

    return (
        <Box sx={{ mb: 1.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="caption" fontWeight={600} color={color}>
                    {(stopLoss * 100).toFixed(0)}% SL / {(profitTarget * 100).toFixed(0)}% TP · {rr.toFixed(1)}:1 R:R
                </Typography>
            </Box>
            <LinearProgress
                variant="determinate"
                value={fillPct}
                sx={{
                    height: 5,
                    borderRadius: 3,
                    bgcolor: '#ffffff10',
                    '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
                }}
            />
        </Box>
    );
}

function BotCard({
    icon,
    name,
    description,
    accentColor,
    online,
    running,
    trades,
    winRate,
    pnl,
    positions,
    mode,
    children,
}: {
    icon: React.ReactElement;
    name: string;
    description: string;
    accentColor: string;
    online: boolean;
    running: boolean;
    trades: number;
    winRate: number | null;
    pnl: number | null;
    positions: number;
    mode: string;
    children?: React.ReactNode;
}) {
    return (
        <Paper
            sx={{
                p: 2.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: online ? `${accentColor}40` : 'divider',
                height: '100%',
                position: 'relative',
                overflow: 'hidden',
                '&::before': online ? {
                    content: '""',
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: 3,
                    background: `linear-gradient(90deg, ${accentColor}, transparent)`,
                } : {},
            }}
        >
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: `${accentColor}20`, color: accentColor, width: 38, height: 38 }}>
                        {icon}
                    </Avatar>
                    <Box>
                        <Typography fontWeight={700} variant="body1">{name}</Typography>
                        <Typography variant="caption" color="text.secondary">{description}</Typography>
                    </Box>
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <FiberManualRecord
                        sx={{ fontSize: 10, color: running ? '#10b981' : online ? '#f59e0b' : '#555', filter: running ? 'drop-shadow(0 0 4px #10b981)' : 'none' }}
                    />
                    <Chip
                        label={running ? 'Running' : online ? 'Idle' : 'Offline'}
                        size="small"
                        color={running ? 'success' : 'default'}
                        sx={{ fontWeight: 600, height: 20, fontSize: 10 }}
                    />
                    <Chip
                        label={mode}
                        size="small"
                        sx={{ bgcolor: `${accentColor}20`, color: accentColor, fontWeight: 700, height: 20, fontSize: 10 }}
                    />
                </Stack>
            </Box>

            <Divider sx={{ mb: 1.5 }} />

            {/* Stats */}
            <StatRow label="Trades" value={trades} />
            <StatRow
                label="Win Rate"
                value={winRate != null && trades > 0 ? `${winRate.toFixed(1)}%` : '—'}
                color={winRate != null && winRate >= 50 ? '#10b981' : winRate != null && trades > 0 ? '#ef4444' : undefined}
            />
            <StatRow
                label="Net P&L"
                value={pnl != null ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '—'}
                color={pnl != null ? (pnl >= 0 ? '#10b981' : '#ef4444') : undefined}
            />
            <StatRow label="Open Positions" value={positions} />

            {children && <Box sx={{ mt: 1.5 }}>{children}</Box>}
        </Paper>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

export const StrategiesPanel: React.FC = () => {
    const { data, isLoading } = useQuery('strategiesPanel', fetchAllBotStats, {
        refetchInterval: 15000,
    });

    const stock = data?.stock;
    const config = data?.config;
    const forex = data?.forex;
    const crypto = data?.crypto;

    const stockStats = stock?.stats || stock?.performance || {};
    // Forex bot returns stats: {}, not performance: {}
    const forexPerf = forex?.stats || forex?.performance || {};
    // Crypto bot stats are top-level fields, not nested under performance
    const cryptoPerf = crypto?.stats || crypto?.performance || {};

    const stockWinRate = stockStats.totalTrades > 0
        ? ((stockStats.winners ?? stockStats.winningTrades ?? 0) / stockStats.totalTrades) * 100
        : null;

    const forexWinRate = forexPerf.totalTrades > 0
        ? ((forexPerf.winners ?? forexPerf.winningTrades ?? 0) / forexPerf.totalTrades) * 100
        : null;

    const cryptoWinRate = cryptoPerf.totalTrades > 0
        ? ((cryptoPerf.winners ?? cryptoPerf.winningTrades ?? 0) / cryptoPerf.totalTrades) * 100
        : null;

    if (isLoading) {
        return <LinearProgress sx={{ borderRadius: 1 }} />;
    }

    return (
        <Box>
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {/* Stock Bot */}
                <Grid item xs={12} md={4}>
                    <BotCard
                        icon={<ShowChart />}
                        name="Stock Bot"
                        description="3-Tier Momentum · Market Hours"
                        accentColor="#10b981"
                        online={!!stock}
                        running={!!stock?.isRunning}
                        trades={stockStats.totalTrades ?? 0}
                        winRate={stockWinRate}
                        pnl={stockStats.totalPnL ?? stockStats.totalProfit ?? null}
                        positions={stock?.positions?.length ?? 0}
                        mode={stock?.mode || 'PAPER'}
                    >
                        {config?.risk && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                    Risk tiers:
                                </Typography>
                                <TierBar
                                    label="T1 · 2.5%+ momentum"
                                    stopLoss={config.risk.tier1?.stopLoss ?? 0.04}
                                    profitTarget={config.risk.tier1?.profitTarget ?? 0.08}
                                    color="#10b981"
                                />
                                <TierBar
                                    label="T2 · 5%+ momentum"
                                    stopLoss={config.risk.tier2?.stopLoss ?? 0.05}
                                    profitTarget={config.risk.tier2?.profitTarget ?? 0.10}
                                    color="#3b82f6"
                                />
                                <TierBar
                                    label="T3 · 10%+ momentum"
                                    stopLoss={config.risk.tier3?.stopLoss ?? 0.06}
                                    profitTarget={config.risk.tier3?.profitTarget ?? 0.15}
                                    color="#f59e0b"
                                />
                            </Box>
                        )}
                    </BotCard>
                </Grid>

                {/* Forex Bot */}
                <Grid item xs={12} md={4}>
                    <BotCard
                        icon={<CurrencyExchange />}
                        name="Forex Bot"
                        description="Trend Following · 24/5"
                        accentColor="#3b82f6"
                        online={!!forex}
                        running={!!forex?.isRunning}
                        trades={forexPerf.totalTrades ?? 0}
                        winRate={forexWinRate}
                        pnl={forexPerf.totalPnL ?? forexPerf.totalProfit ?? forex?.dailyPnL ?? null}
                        positions={forex?.positions?.length ?? 0}
                        mode={forex?.mode || 'PAPER'}
                    >
                        {forex && (
                            <Box sx={{ mt: 0.5 }}>
                                <StatRow
                                    label="Session"
                                    value={forex?.session || 'Unknown'}
                                    color={forex?.session === 'OVERLAP' ? '#10b981' : undefined}
                                />
                                <StatRow label="Pairs" value="12 major/cross" />
                            </Box>
                        )}
                        {!forex && (
                            <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
                                <Typography variant="caption" color="text.secondary">
                                    Start: node unified-forex-bot.js
                                </Typography>
                            </Box>
                        )}
                    </BotCard>
                </Grid>

                {/* Crypto Bot */}
                <Grid item xs={12} md={4}>
                    <BotCard
                        icon={<CurrencyBitcoin />}
                        name="Crypto Bot"
                        description="BTC-Correlated · 24/7"
                        accentColor="#f59e0b"
                        online={!!crypto}
                        running={!!crypto?.isRunning}
                        trades={cryptoPerf.totalTrades ?? 0}
                        winRate={cryptoWinRate}
                        pnl={cryptoPerf.totalPnL ?? cryptoPerf.totalProfit ?? null}
                        positions={crypto?.positions?.length ?? 0}
                        mode={crypto?.mode || 'DEMO'}
                    >
                        {crypto && (
                            <Box sx={{ mt: 0.5 }}>
                                <StatRow label="Pairs" value="12 crypto pairs" />
                                <StatRow label="BTC filter" value="Active" color="#10b981" />
                            </Box>
                        )}
                        {!crypto && (
                            <Box sx={{ mt: 1, p: 1.5, borderRadius: 2, bgcolor: 'background.default' }}>
                                <Typography variant="caption" color="text.secondary">
                                    Start: node unified-crypto-bot.js
                                </Typography>
                            </Box>
                        )}
                    </BotCard>
                </Grid>
            </Grid>
        </Box>
    );
};
