import { useQuery } from 'react-query';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Alert,
} from '@mui/material';
import {
    CheckCircle,
    Cancel,
    Assessment,
    TrendingUp,
    TrendingDown,
    ShowChart,
} from '@mui/icons-material';
import { apiClient } from '@/services/api';
import { MetricCard } from '@/components/MetricCard';

function ValidationChecklist({ checks }: { checks: Record<string, boolean> }) {
    const labels: Record<string, string> = {
        sufficientTrades: 'Sufficient trades (≥30)',
        winRateOK: 'Win rate ≥ 45%',
        sharpeOK: 'Sharpe ratio ≥ 0.5',
        drawdownOK: 'Max drawdown ≤ 20%',
        profitFactorOK: 'Profit factor ≥ 1.2',
        expectancyPositive: 'Positive expectancy',
        profitPositive: 'Total profit > $0',
        noCircuitBreaker: 'Circuit breaker OK',
    };

    return (
        <List dense>
            {Object.entries(checks).map(([key, passed]) => (
                <ListItem key={key} sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 32 }}>
                        {passed
                            ? <CheckCircle sx={{ color: 'success.main', fontSize: 18 }} />
                            : <Cancel sx={{ color: 'error.main', fontSize: 18 }} />
                        }
                    </ListItemIcon>
                    <ListItemText
                        primary={labels[key] || key}
                        primaryTypographyProps={{
                            variant: 'body2',
                            color: passed ? 'text.primary' : 'text.secondary',
                        }}
                    />
                </ListItem>
            ))}
        </List>
    );
}

export default function BacktestPage() {
    const { data: report, isLoading, isError } = useQuery(
        'backtestReport',
        () => apiClient.getBacktestReport(),
        { staleTime: 60 * 1000, retry: 1, refetchInterval: 30 * 1000 }
    );

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (isError || !report) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="warning">
                    Could not connect to the stock bot. Check that it is running.
                </Alert>
            </Box>
        );
    }

    const isLive = report.type === 'live';
    const { summary = {}, validation, symbolResults = [], trades = [] } = report;
    const recentTrades = trades.slice(-20);
    const noTradesYet = (summary.totalTrades ?? 0) === 0;

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            {/* Header */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, gap: 2, mb: 3 }}>
                {isLive
                    ? <ShowChart sx={{ fontSize: 32, color: 'primary.main' }} />
                    : <Assessment sx={{ fontSize: 32, color: 'primary.main' }} />
                }
                <Box>
                    <Typography variant="h5" fontWeight={700}>
                        {isLive ? 'Live Performance' : 'Backtest Report'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {isLive
                            ? 'Real-time stats from the stock bot'
                            : `Generated: ${report.timestamp ? new Date(report.timestamp).toLocaleString() : 'Unknown'}`
                        }
                    </Typography>
                </Box>
                {!noTradesYet && validation && (
                    <Chip
                        label={validation.passed ? 'PASSING' : 'NEEDS WORK'}
                        color={validation.passed ? 'success' : 'warning'}
                        sx={{ ml: { xs: 0, sm: 'auto' }, fontWeight: 700 }}
                    />
                )}
            </Box>

            {/* Empty state — bot hasn't traded yet */}
            {noTradesYet && (
                <Alert severity="info" sx={{ mb: 3 }}>
                    No trades recorded yet. The stock bot will begin tracking performance as soon as it executes its first trade during market hours (9:30 AM – 4:00 PM EST).
                </Alert>
            )}

            {/* Metric cards */}
            <Box
                sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, 1fr)',
                        md: 'repeat(3, 1fr)',
                        lg: 'repeat(5, 1fr)'
                    },
                    gap: 3,
                    mb: 3
                }}
            >
                <MetricCard
                    title="Win Rate"
                    value={((summary.overallWinRate ?? 0) * 100).toFixed(1)}
                    suffix="%"
                    color={(summary.overallWinRate ?? 0) >= 0.5 ? 'success' : noTradesYet ? undefined : 'warning'}
                    icon={<TrendingUp />}
                />
                <MetricCard
                    title="Profit Factor"
                    value={(summary.profitFactor ?? 0).toFixed(2)}
                    color={(summary.profitFactor ?? 0) >= 1.5 ? 'success' : (summary.profitFactor ?? 0) >= 1.2 ? 'warning' : noTradesYet ? undefined : 'error'}
                    icon={<Assessment />}
                />
                <MetricCard
                    title="Total Trades"
                    value={String(summary.totalTrades ?? 0)}
                    color={(summary.totalTrades ?? 0) >= 30 ? 'success' : undefined}
                    icon={<Assessment />}
                />
                <MetricCard
                    title="Total P&L"
                    value={`$${((summary.totalProfit ?? 0)).toFixed(2)}`}
                    color={(summary.totalProfit ?? 0) > 0 ? 'success' : noTradesYet ? undefined : 'error'}
                    icon={(summary.totalProfit ?? 0) >= 0 ? <TrendingUp /> : <TrendingDown />}
                />
                <MetricCard
                    title="Max Drawdown"
                    value={((summary.avgDrawdown ?? 0) * 100).toFixed(2)}
                    suffix="%"
                    color={(summary.avgDrawdown ?? 0) <= 0.1 ? 'success' : (summary.avgDrawdown ?? 0) <= 0.2 ? 'warning' : noTradesYet ? undefined : 'error'}
                    icon={<TrendingDown />}
                />
            </Box>

            <Grid container spacing={3}>
                {/* Validation checklist — only show when there are real trades */}
                {!noTradesYet && validation?.checks && (
                    <Grid item xs={12} md={4}>
                        <Paper sx={{ p: 3, height: '100%' }}>
                            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                                Health Checks
                            </Typography>
                            <Divider sx={{ mb: 1 }} />
                            <ValidationChecklist checks={validation.checks} />
                        </Paper>
                    </Grid>
                )}

                {/* Config / Stats summary */}
                <Grid item xs={12} md={(!noTradesYet && validation?.checks) ? 8 : 12}>
                    <Paper sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                            {isLive ? 'Performance Breakdown' : 'Backtest Configuration'}
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Grid container spacing={2}>
                            {isLive ? [
                                ['Winning Trades', summary.winningTrades ?? 0],
                                ['Losing Trades', summary.losingTrades ?? 0],
                                ['Win Amount', `$${(summary.totalWinAmount ?? 0).toFixed(2)}`],
                                ['Loss Amount', `$${(summary.totalLossAmount ?? 0).toFixed(2)}`],
                                ['Consec. Losses', summary.consecutiveLosses ?? 0],
                                ['Max Consec. Losses', summary.maxConsecutiveLosses ?? 0],
                            ] : [
                                ['Symbols Tested', summary.symbolsTested],
                                ['Total Trades', summary.totalTrades],
                                ['Fast MA', report.config?.fastMA],
                                ['Slow MA', report.config?.slowMA],
                                ['Stop Loss', report.config?.stopLossPct != null ? `${(report.config.stopLossPct * 100).toFixed(0)}%` : '—'],
                                ['Profit Target', report.config?.profitTargetPct != null ? `${(report.config.profitTargetPct * 100).toFixed(0)}%` : '—'],
                                ['Position Size', report.config?.positionSizePct != null ? `${(report.config.positionSizePct * 100).toFixed(0)}%` : '—'],
                                ['Initial Capital', `$${(report.config?.initialCapital || 0).toLocaleString()}`],
                            ].map(([label, value]) => (
                                <Grid item xs={6} sm={4} md={3} key={String(label)}>
                                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                                    <Typography variant="body2" fontWeight={600}>{String(value ?? '—')}</Typography>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>

                {/* Per-symbol results table (backtest mode only, only when populated) */}
                {!isLive && symbolResults.length > 0 && (
                    <Grid item xs={12}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                                Per-Symbol Results ({symbolResults.length} symbols)
                            </Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Symbol</TableCell>
                                            <TableCell align="right">Trades</TableCell>
                                            <TableCell align="right">Win Rate</TableCell>
                                            <TableCell align="right">Avg Sharpe</TableCell>
                                            <TableCell align="right">Drawdown</TableCell>
                                            <TableCell align="right">Profit Factor</TableCell>
                                            <TableCell align="right">Avg Return</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {symbolResults.map((s: any) => (
                                            <TableRow key={s.symbol} hover>
                                                <TableCell>
                                                    <Typography fontWeight={600}>{s.symbol}</Typography>
                                                </TableCell>
                                                <TableCell align="right">{s.totalTrades}</TableCell>
                                                <TableCell align="right">
                                                    <Chip
                                                        label={`${((s.overallWinRate ?? 0) * 100).toFixed(0)}%`}
                                                        size="small"
                                                        color={(s.overallWinRate ?? 0) >= 0.5 ? 'success' : 'warning'}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={(s.avgSharpe ?? 0) >= 0.5 ? 'success.main' : 'error.main'}>
                                                        {(s.avgSharpe ?? 0).toFixed(2)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={(s.avgDrawdown ?? 0) <= 0.1 ? 'success.main' : 'warning.main'}>
                                                        {((s.avgDrawdown ?? 0) * 100).toFixed(2)}%
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={(s.profitFactor ?? 0) >= 1.2 ? 'success.main' : 'error.main'}>
                                                        {(s.profitFactor ?? 0).toFixed(2)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    {((s.avgReturn ?? 0) * 100).toFixed(3)}%
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                )}

                {/* Recent trades table */}
                {recentTrades.length > 0 && (
                    <Grid item xs={12}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                                Recent Trades (last {recentTrades.length})
                            </Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Symbol</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Entry Date</TableCell>
                                            <TableCell>Exit Date</TableCell>
                                            <TableCell align="right">Return %</TableCell>
                                            <TableCell align="right">P&L</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {recentTrades.map((t: any, idx: number) => (
                                            <TableRow key={idx} hover>
                                                <TableCell><Typography fontWeight={600}>{t.symbol}</Typography></TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={t.type || 'LONG'}
                                                        size="small"
                                                        color={t.type === 'SHORT' ? 'error' : 'success'}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell>{t.entryDate ? new Date(t.entryDate).toLocaleDateString() : '—'}</TableCell>
                                                <TableCell>{t.exitDate ? new Date(t.exitDate).toLocaleDateString() : '—'}</TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={(t.returnPct || 0) >= 0 ? 'success.main' : 'error.main'}>
                                                        {((t.returnPct || 0) * 100).toFixed(2)}%
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={(t.profit || 0) >= 0 ? 'success.main' : 'error.main'}>
                                                        ${(t.profit || 0).toFixed(2)}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                )}
            </Grid>
        </Box>
    );
}
