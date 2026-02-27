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
    Alert,
    CircularProgress,
    Divider,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import {
    CheckCircle,
    Cancel,
    Assessment,
    TrendingUp,
    TrendingDown,
} from '@mui/icons-material';
import { apiClient } from '@/services/api';
import { MetricCard } from '@/components/MetricCard';

function ValidationChecklist({ checks }: { checks: Record<string, boolean> }) {
    const labels: Record<string, string> = {
        sufficientTrades: 'Sufficient trades (≥30)',
        winRateOK: 'Win rate acceptable (≥45%)',
        sharpeOK: 'Sharpe ratio ≥ 0.5',
        drawdownOK: 'Max drawdown ≤ 20%',
        profitFactorOK: 'Profit factor ≥ 1.2',
        expectancyPositive: 'Positive expectancy',
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
        { staleTime: 5 * 60 * 1000, retry: 1 }
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
                <Alert severity="info">
                    No backtest report found. Run the backtesting framework first:
                    <br />
                    <code>node services/trading/enhanced-backtester.js</code>
                </Alert>
            </Box>
        );
    }

    const { summary = {}, validation, symbolResults = [], trades = [] } = report;
    const recentTrades = trades.slice(-20);

    return (
        <Box sx={{ p: 2 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Assessment sx={{ fontSize: 32, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h5" fontWeight={700}>
                        Backtest Report
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Generated: {new Date(report.timestamp).toLocaleString()}
                    </Typography>
                </Box>
                <Chip
                    label={validation?.passed ? `PASSED (${validation.passedChecks}/${validation.totalChecks})` : `FAILED (${validation.passedChecks}/${validation.totalChecks})`}
                    color={validation?.passed ? 'success' : 'error'}
                    sx={{ ml: 'auto', fontWeight: 700 }}
                />
            </Box>

            <Grid container spacing={3}>
                {/* Summary metrics */}
                <Grid item xs={12} sm={6} md={2.4}>
                    <MetricCard
                        title="Win Rate"
                        value={((summary.overallWinRate ?? 0) * 100).toFixed(1)}
                        suffix="%"
                        color={(summary.overallWinRate ?? 0) >= 0.5 ? 'success' : 'warning'}
                        icon={<TrendingUp />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <MetricCard
                        title="Profit Factor"
                        value={(summary.profitFactor ?? 0).toFixed(2)}
                        color={(summary.profitFactor ?? 0) >= 1.5 ? 'success' : (summary.profitFactor ?? 0) >= 1.2 ? 'warning' : 'error'}
                        icon={<Assessment />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <MetricCard
                        title="Avg Sharpe"
                        value={(summary.avgSharpe ?? 0).toFixed(2)}
                        color={(summary.avgSharpe ?? 0) >= 1.0 ? 'success' : (summary.avgSharpe ?? 0) >= 0.5 ? 'warning' : 'error'}
                        icon={<Assessment />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <MetricCard
                        title="Max Drawdown"
                        value={((summary.avgDrawdown ?? 0) * 100).toFixed(2)}
                        suffix="%"
                        color={(summary.avgDrawdown ?? 0) <= 0.1 ? 'success' : (summary.avgDrawdown ?? 0) <= 0.2 ? 'warning' : 'error'}
                        icon={<TrendingDown />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <MetricCard
                        title="Expectancy"
                        value={((summary.expectancy ?? 0) * 100).toFixed(2)}
                        suffix="%"
                        color={(summary.expectancy ?? 0) > 0 ? 'success' : 'error'}
                        icon={<Assessment />}
                    />
                </Grid>

                {/* Validation checklist */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                            Validation Checks
                        </Typography>
                        <Divider sx={{ mb: 1 }} />
                        {validation?.checks && (
                            <ValidationChecklist checks={validation.checks} />
                        )}
                    </Paper>
                </Grid>

                {/* Config summary */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 3, height: '100%' }}>
                        <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                            Backtest Configuration
                        </Typography>
                        <Divider sx={{ mb: 2 }} />
                        <Grid container spacing={2}>
                            {[
                                ['Symbols Tested', summary.symbolsTested],
                                ['Total Trades', summary.totalTrades],
                                ['Fast MA', report.config?.fastMA],
                                ['Slow MA', report.config?.slowMA],
                                ['Stop Loss', `${(report.config?.stopLossPct * 100).toFixed(0)}%`],
                                ['Profit Target', `${(report.config?.profitTargetPct * 100).toFixed(0)}%`],
                                ['Position Size', `${(report.config?.positionSizePct * 100).toFixed(0)}%`],
                                ['Initial Capital', `$${(report.config?.initialCapital || 0).toLocaleString()}`],
                                ['Walk-Forward Windows', report.config?.walkForwardWindows],
                                ['In-Sample Ratio', `${(report.config?.inSampleRatio * 100).toFixed(0)}%`],
                            ].map(([label, value]) => (
                                <Grid item xs={6} sm={4} md={3} key={String(label)}>
                                    <Typography variant="caption" color="text.secondary">
                                        {label}
                                    </Typography>
                                    <Typography variant="body2" fontWeight={600}>
                                        {String(value ?? '—')}
                                    </Typography>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>

                {/* Per-symbol results table */}
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
                                        <TableCell align="right">Beat B&H</TableCell>
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
                                                    label={`${(s.overallWinRate * 100).toFixed(0)}%`}
                                                    size="small"
                                                    color={s.overallWinRate >= 0.5 ? 'success' : 'warning'}
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography
                                                    variant="body2"
                                                    color={s.avgSharpe >= 0.5 ? 'success.main' : 'error.main'}
                                                >
                                                    {s.avgSharpe.toFixed(2)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography
                                                    variant="body2"
                                                    color={s.avgDrawdown <= 0.1 ? 'success.main' : 'warning.main'}
                                                >
                                                    {(s.avgDrawdown * 100).toFixed(2)}%
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography
                                                    variant="body2"
                                                    color={s.profitFactor >= 1.2 ? 'success.main' : 'error.main'}
                                                >
                                                    {s.profitFactor.toFixed(2)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                {(s.avgReturn * 100).toFixed(3)}%
                                            </TableCell>
                                            <TableCell align="right">
                                                {s.beatBuyHoldCount}/{s.totalTrades > 0 ? Math.ceil(s.totalTrades / (report.config?.walkForwardWindows || 5)) : 0}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* Recent trades table (if available) */}
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
                                                <TableCell>
                                                    {t.entryDate ? new Date(t.entryDate).toLocaleDateString() : '—'}
                                                </TableCell>
                                                <TableCell>
                                                    {t.exitDate ? new Date(t.exitDate).toLocaleDateString() : '—'}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography
                                                        variant="body2"
                                                        color={(t.returnPct || 0) >= 0 ? 'success.main' : 'error.main'}
                                                    >
                                                        {((t.returnPct || 0) * 100).toFixed(2)}%
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography
                                                        variant="body2"
                                                        color={(t.profit || 0) >= 0 ? 'success.main' : 'error.main'}
                                                    >
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
