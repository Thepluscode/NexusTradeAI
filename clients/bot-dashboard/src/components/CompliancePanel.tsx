import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Chip,
    LinearProgress,
    Divider,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert,
    Stack,
    IconButton,
    Tooltip,
} from '@mui/material';
import {
    Assessment,
    TrendingUp,
    TrendingDown,
    Refresh,
    EmojiEvents,
    BarChart,
    Timeline,
} from '@mui/icons-material';
import { useQuery } from 'react-query';
import { apiClient } from '@/services/api';

// ── Data fetching ──────────────────────────────────────────────────────────

async function fetchTradingStatus() {
    // Returns the flat top-level response so stats{} (totalWinAmount, totalLossAmount,
    // totalTradesToday, maxDrawdown) is accessible alongside performance{}.
    return apiClient.getTradingEngineStatus();
}

async function fetchBacktestReport() {
    return apiClient.getBacktestReport();
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MetricTile({
    label,
    value,
    sub,
    color,
    icon,
}: {
    label: string;
    value: React.ReactNode;
    sub?: string;
    color?: string;
    icon?: React.ReactElement;
}) {
    return (
        <Box
            sx={{
                p: 2.5,
                borderRadius: 3,
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
                height: '100%',
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                {icon && React.cloneElement(icon, { sx: { fontSize: 16, color: color || 'text.secondary' } })}
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    {label}
                </Typography>
            </Box>
            <Typography variant="h5" fontWeight={700} color={color || 'text.primary'}>
                {value}
            </Typography>
            {sub && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.3, display: 'block' }}>
                    {sub}
                </Typography>
            )}
        </Box>
    );
}

function WinRateBar({ winRate, total }: { winRate: number; total: number }) {
    const color = winRate >= 55 ? '#10b981' : winRate >= 45 ? '#f59e0b' : '#ef4444';
    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" color="text.secondary">Win Rate</Typography>
                <Typography variant="body2" fontWeight={700} color={color}>
                    {winRate.toFixed(1)}%
                </Typography>
            </Box>
            <LinearProgress
                variant="determinate"
                value={Math.min(winRate, 100)}
                sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: '#ffffff15',
                    '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 4 },
                }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                {total} total trades · min 30 required for statistical validity
            </Typography>
        </Box>
    );
}

interface PerformanceStats {
    totalTrades?: number;
    winners?: number;
    winningTrades?: number;
    losers?: number;
    losingTrades?: number;
    totalPnL?: number;
    totalProfit?: number;
    totalWinAmount?: number;
    totalLossAmount?: number;
    profitFactor?: number;
    maxDrawdown?: number;
    totalTradesToday?: number;
    winRate?: number;
}

// ── Main component ─────────────────────────────────────────────────────────

export const CompliancePanel: React.FC = () => {
    const {
        data: status,
        isLoading,
        refetch,
    } = useQuery('tradeJournalStatus', fetchTradingStatus, { refetchInterval: 30000 });

    const { data: backtest } = useQuery('tradeJournalBacktest', fetchBacktestReport, {
        staleTime: 5 * 60 * 1000,
    });

    const stats: PerformanceStats = status?.stats || status?.performance || {};
    const totalTrades = stats.totalTrades ?? 0;
    const winners = stats.winners ?? stats.winningTrades ?? 0;
    const losers = stats.losers ?? stats.losingTrades ?? 0;
    const totalPnL = stats.totalPnL ?? stats.totalProfit ?? 0;
    const winRate = totalTrades > 0 ? (winners / totalTrades) * 100 : 0;
    const profitFactor = stats.profitFactor ?? 0;
    const maxDrawdown = stats.maxDrawdown ?? 0;
    const avgWin = winners > 0 && stats.totalWinAmount ? stats.totalWinAmount / winners : 0;
    const avgLoss = losers > 0 && stats.totalLossAmount ? stats.totalLossAmount / losers : 0;
    const expectancy = winners > 0 && losers > 0
        ? (winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss
        : 0;

    // Risk thresholds
    const riskFlags: { label: string; ok: boolean }[] = [
        { label: 'Win rate ≥ 45%', ok: winRate >= 45 || totalTrades < 10 },
        { label: 'Profit factor ≥ 1.2', ok: profitFactor >= 1.2 || totalTrades < 10 },
        { label: 'Max drawdown < 15%', ok: maxDrawdown < 0.15 },
        { label: 'Positive expectancy', ok: expectancy >= 0 || totalTrades < 10 },
        { label: 'Daily limit respected (≤15 trades)', ok: (stats.totalTradesToday ?? 0) <= 15 },
    ];

    const passCount = riskFlags.filter(f => f.ok).length;

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Assessment color="primary" />
                    <Typography variant="h6" fontWeight={700}>Trade Journal</Typography>
                    <Chip
                        label={`${passCount}/${riskFlags.length} checks passed`}
                        color={passCount === riskFlags.length ? 'success' : passCount >= 3 ? 'warning' : 'error'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                    />
                </Box>
                <Tooltip title="Refresh">
                    <IconButton onClick={() => refetch()} size="small">
                        <Refresh />
                    </IconButton>
                </Tooltip>
            </Box>

            {isLoading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

            {totalTrades === 0 && !isLoading && (
                <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                    No closed trades yet. The trade journal will populate as the bot executes and closes positions.
                </Alert>
            )}

            {/* Performance metrics */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={4} md={2}>
                    <MetricTile
                        label="Total Trades"
                        value={totalTrades}
                        icon={<BarChart />}
                        color="#3b82f6"
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <MetricTile
                        label="Winners"
                        value={winners}
                        color="#10b981"
                        icon={<TrendingUp />}
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <MetricTile
                        label="Losers"
                        value={losers}
                        color="#ef4444"
                        icon={<TrendingDown />}
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <MetricTile
                        label="Net P&L"
                        value={`${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`}
                        color={totalPnL >= 0 ? '#10b981' : '#ef4444'}
                        icon={<Timeline />}
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <MetricTile
                        label="Profit Factor"
                        value={totalTrades > 0 ? profitFactor.toFixed(2) : '—'}
                        sub="target ≥ 1.2"
                        color={profitFactor >= 1.5 ? '#10b981' : profitFactor >= 1.2 ? '#f59e0b' : '#ef4444'}
                        icon={<EmojiEvents />}
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <MetricTile
                        label="Expectancy"
                        value={totalTrades >= 5 ? `${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)}` : '—'}
                        sub="per trade avg"
                        color={expectancy >= 0 ? '#10b981' : '#ef4444'}
                    />
                </Grid>
            </Grid>

            {/* Win rate bar */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <WinRateBar winRate={winRate} total={totalTrades} />
                    {totalTrades > 0 && (
                        <>
                            <Divider sx={{ my: 2 }} />
                            <Grid container spacing={3}>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Avg Win
                                    </Typography>
                                    <Typography variant="h6" fontWeight={700} color="success.main">
                                        {avgWin > 0 ? `+$${avgWin.toFixed(2)}` : '—'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        Avg Loss
                                    </Typography>
                                    <Typography variant="h6" fontWeight={700} color="error.main">
                                        {avgLoss > 0 ? `-$${avgLoss.toFixed(2)}` : '—'}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </>
                    )}
                </CardContent>
            </Card>

            {/* Risk checks */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                        Risk Health Checks
                    </Typography>
                    <Stack spacing={1} sx={{ mt: 1 }}>
                        {riskFlags.map(flag => (
                            <Box
                                key={flag.label}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    p: 1.5,
                                    borderRadius: 2,
                                    bgcolor: 'background.default',
                                }}
                            >
                                <Typography variant="body2">{flag.label}</Typography>
                                <Chip
                                    label={flag.ok ? 'Pass' : 'Fail'}
                                    color={flag.ok ? 'success' : 'error'}
                                    size="small"
                                    sx={{ fontWeight: 600, minWidth: 52 }}
                                />
                            </Box>
                        ))}
                    </Stack>
                </CardContent>
            </Card>

            {/* Backtest results summary if available */}
            {(backtest?.symbolResults?.length ?? 0) > 0 && (
                <Card>
                    <CardContent>
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                            Backtest — Per Symbol Results
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Symbol</TableCell>
                                        <TableCell align="right">Trades</TableCell>
                                        <TableCell align="right">Win Rate</TableCell>
                                        <TableCell align="right">Sharpe</TableCell>
                                        <TableCell align="right">P. Factor</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(backtest?.symbolResults ?? []).slice(0, 10).map((row) => (
                                        <TableRow key={row.symbol} hover>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{row.symbol}</Typography>
                                            </TableCell>
                                            <TableCell align="right">{row.totalTrades ?? '—'}</TableCell>
                                            <TableCell align="right">
                                                <Typography
                                                    variant="body2"
                                                    color={(row.overallWinRate ?? 0) >= 0.5 ? 'success.main' : 'error.main'}
                                                >
                                                    {row.overallWinRate != null ? `${(row.overallWinRate * 100).toFixed(1)}%` : '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                {row.avgSharpe != null ? row.avgSharpe.toFixed(2) : '—'}
                                            </TableCell>
                                            <TableCell align="right">
                                                {row.profitFactor != null ? row.profitFactor.toFixed(2) : '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </CardContent>
                </Card>
            )}
        </Box>
    );
};
