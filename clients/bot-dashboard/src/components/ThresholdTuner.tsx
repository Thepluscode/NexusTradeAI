import { useState, useCallback, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
    Box,
    Paper,
    Typography,
    Slider,
    Grid,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Alert,
    Button,
    Tooltip,
} from '@mui/material';
import {
    TuneOutlined,
    FilterAlt,
    RestartAlt,
} from '@mui/icons-material';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    ReferenceLine,
    BarChart,
    Bar,
    Cell,
} from 'recharts';
import { apiClient } from '@/services/api';

interface ThresholdState {
    rsiMin: number;
    rsiMax: number;
    volumeRatioMin: number;
    minSignalScore: number;
    minQuality: number;
    adxMin: number;
    days: number;
}

const DEFAULTS: ThresholdState = {
    rsiMin: 40,
    rsiMax: 66,
    volumeRatioMin: 1.8,
    minSignalScore: 0.75,
    minQuality: 0.65,
    adxMin: 20,
    days: 90,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function StatBox({ label, value, color, suffix = '' }: { label: string; value: any; color?: string; suffix?: string }) {
    return (
        <Box sx={{ textAlign: 'center', px: 1 }}>
            <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
            <Typography variant="h6" fontWeight={700} color={color || 'text.primary'}>
                {value}{suffix}
            </Typography>
        </Box>
    );
}

export default function ThresholdTuner() {
    const [thresholds, setThresholds] = useState<ThresholdState>(DEFAULTS);
    const [committed, setCommitted] = useState<ThresholdState>(DEFAULTS);

    const { data, isLoading, isError } = useQuery(
        ['thresholdAnalysis', committed],
        () => apiClient.getThresholdAnalysis({ ...committed } as Record<string, number>),
        { staleTime: 30 * 1000, retry: 1, keepPreviousData: true }
    );

    const handleChange = useCallback((key: keyof ThresholdState) => (_: unknown, val: number | number[]) => {
        setThresholds(prev => ({ ...prev, [key]: val as number }));
    }, []);

    const handleCommit = useCallback((key: keyof ThresholdState) => (_: unknown, val: number | number[]) => {
        setCommitted(prev => ({ ...prev, [key]: val as number }));
    }, []);

    const resetDefaults = useCallback(() => {
        setThresholds(DEFAULTS);
        setCommitted(DEFAULTS);
    }, []);

    const current = data?.current;
    const projected = data?.projected;
    const sensitivity = data?.sensitivity;
    const byCloseReason = data?.byCloseReason;
    const trades = data?.trades;

    // Compute improvement deltas
    const winRateDelta = projected && current ? projected.winRate - current.winRate : 0;
    const pnlDelta = projected && current ? projected.totalPnl - current.totalPnl : 0;
    const pfDelta = projected && current ? projected.profitFactor - current.profitFactor : 0;
    const tradesFiltered = current && projected ? current.count - projected.count : 0;

    // Format sensitivity data for charts
    const sensitivityCharts = useMemo(() => {
        if (!sensitivity) return {};
        const result: Record<string, { value: number; winRate: number; count: number; profitFactor: number }[]> = {};
        for (const [param, values] of Object.entries(sensitivity)) {
            result[param] = (values as { value: number; winRate: number; count: number; profitFactor: number }[]).map((v) => ({
                value: v.value,
                winRate: v.winRate,
                count: v.count,
                profitFactor: v.profitFactor,
            }));
        }
        return result;
    }, [sensitivity]);

    // Close reason bar chart data
    const closeReasonData = useMemo(() => {
        if (!byCloseReason) return [];
        return Object.entries(byCloseReason as Record<string, { total: number; winRate: number; totalPnl: number }>)
            .map(([reason, stats]) => ({
                reason: reason.replace(/_/g, ' ').replace('orphaned restart', 'orphan'),
                ...stats,
            }))
            .sort((a, b) => b.total - a.total);
    }, [byCloseReason]);

    if (isLoading && !data) {
        return (
            <Paper sx={{ p: 3, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                <CircularProgress size={28} sx={{ mr: 2 }} />
                <Typography color="text.secondary">Analyzing historical trades...</Typography>
            </Paper>
        );
    }

    if (isError || !data?.success) {
        return (
            <Alert severity="warning" sx={{ mb: 2 }}>
                Could not load threshold analysis. Make sure the stock bot is running and has trade history.
            </Alert>
        );
    }

    return (
        <Box>
            {/* Header */}
            <Paper sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                    <TuneOutlined sx={{ color: 'primary.main' }} />
                    <Typography variant="h6" fontWeight={700}>Threshold Tuner</Typography>
                    <Chip
                        label={`${current?.count ?? 0} trades analyzed`}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ ml: 'auto' }}
                    />
                    <Button size="small" startIcon={<RestartAlt />} onClick={resetDefaults}>
                        Reset
                    </Button>
                </Box>

                {/* Before vs After comparison */}
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 2,
                    p: 2,
                    bgcolor: 'background.default',
                    borderRadius: 2,
                    mb: 2,
                }}>
                    <StatBox label="Current Win Rate" value={`${current?.winRate ?? 0}`} suffix="%" />
                    <StatBox
                        label="Projected Win Rate"
                        value={`${projected?.winRate ?? 0}`}
                        suffix="%"
                        color={winRateDelta > 0 ? 'success.main' : winRateDelta < 0 ? 'error.main' : undefined}
                    />
                    <StatBox
                        label="Win Rate Delta"
                        value={`${winRateDelta > 0 ? '+' : ''}${winRateDelta.toFixed(1)}`}
                        suffix="%"
                        color={winRateDelta > 0 ? 'success.main' : winRateDelta < 0 ? 'error.main' : 'text.secondary'}
                    />
                    <StatBox label="Current PF" value={current?.profitFactor ?? 0} />
                    <StatBox
                        label="Projected PF"
                        value={projected?.profitFactor ?? 0}
                        color={pfDelta > 0 ? 'success.main' : pfDelta < 0 ? 'error.main' : undefined}
                    />
                    <StatBox
                        label="Trades Filtered"
                        value={tradesFiltered}
                        color={tradesFiltered > 0 ? 'warning.main' : undefined}
                    />
                    <StatBox
                        label="P&L Impact"
                        value={`$${pnlDelta > 0 ? '+' : ''}${pnlDelta.toFixed(0)}`}
                        color={pnlDelta > 0 ? 'success.main' : pnlDelta < 0 ? 'error.main' : 'text.secondary'}
                    />
                    <StatBox
                        label="Projected Trades"
                        value={projected?.count ?? 0}
                    />
                </Box>

                {/* Slider controls */}
                <Grid container spacing={3}>
                    <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                            RSI Min: {thresholds.rsiMin}
                        </Typography>
                        <Slider
                            value={thresholds.rsiMin}
                            onChange={handleChange('rsiMin')}
                            onChangeCommitted={handleCommit('rsiMin')}
                            min={25} max={55} step={1}
                            marks={[{ value: 40, label: '40' }]}
                            valueLabelDisplay="auto"
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                            RSI Max: {thresholds.rsiMax}
                        </Typography>
                        <Slider
                            value={thresholds.rsiMax}
                            onChange={handleChange('rsiMax')}
                            onChangeCommitted={handleCommit('rsiMax')}
                            min={58} max={80} step={1}
                            marks={[{ value: 66, label: '66' }]}
                            valueLabelDisplay="auto"
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                            Volume Ratio Min: {thresholds.volumeRatioMin.toFixed(1)}x
                        </Typography>
                        <Slider
                            value={thresholds.volumeRatioMin}
                            onChange={handleChange('volumeRatioMin')}
                            onChangeCommitted={handleCommit('volumeRatioMin')}
                            min={0.8} max={3.0} step={0.1}
                            marks={[{ value: 1.8, label: '1.8x' }]}
                            valueLabelDisplay="auto"
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                            Min Signal Score: {thresholds.minSignalScore.toFixed(2)}
                        </Typography>
                        <Slider
                            value={thresholds.minSignalScore}
                            onChange={handleChange('minSignalScore')}
                            onChangeCommitted={handleCommit('minSignalScore')}
                            min={0.3} max={1.0} step={0.05}
                            marks={[{ value: 0.75, label: '0.75' }]}
                            valueLabelDisplay="auto"
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                            Min Quality (Smooth): {thresholds.minQuality.toFixed(2)}
                        </Typography>
                        <Slider
                            value={thresholds.minQuality}
                            onChange={handleChange('minQuality')}
                            onChangeCommitted={handleCommit('minQuality')}
                            min={0.3} max={0.95} step={0.05}
                            marks={[{ value: 0.65, label: '0.65' }]}
                            valueLabelDisplay="auto"
                            size="small"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={4}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                            ADX Min: {thresholds.adxMin}
                        </Typography>
                        <Slider
                            value={thresholds.adxMin}
                            onChange={handleChange('adxMin')}
                            onChangeCommitted={handleCommit('adxMin')}
                            min={10} max={35} step={1}
                            marks={[{ value: 20, label: '20' }]}
                            valueLabelDisplay="auto"
                            size="small"
                        />
                    </Grid>
                </Grid>
            </Paper>

            {/* Sensitivity Analysis Charts */}
            {sensitivity && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                        <FilterAlt sx={{ mr: 1, verticalAlign: 'middle', fontSize: 20 }} />
                        Sensitivity Analysis
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        How win rate changes as each threshold is varied (other thresholds held at current values)
                    </Typography>
                    <Grid container spacing={2}>
                        {Object.entries(sensitivityCharts).map(([param, chartData]) => {
                            const labels: Record<string, string> = {
                                rsiMin: 'RSI Min',
                                rsiMax: 'RSI Max',
                                volumeRatioMin: 'Volume Ratio Min',
                                minQuality: 'Min Quality',
                            };
                            const currentVal = thresholds[param as keyof ThresholdState];
                            return (
                                <Grid item xs={12} sm={6} key={param}>
                                    <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                                        {labels[param] || param}
                                    </Typography>
                                    <ResponsiveContainer width="100%" height={160}>
                                        <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                            <XAxis
                                                dataKey="value"
                                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                                width={36}
                                                domain={[0, 100]}
                                                tickFormatter={(v: number) => `${v}%`}
                                            />
                                            <RechartsTooltip
                                                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                                                formatter={(value: number, name: string) => {
                                                    if (name === 'winRate') return [`${value}%`, 'Win Rate'];
                                                    if (name === 'count') return [value, 'Trades'];
                                                    return [value, name];
                                                }}
                                            />
                                            <ReferenceLine x={currentVal} stroke="#6366f1" strokeDasharray="4 4" />
                                            <Line
                                                type="monotone"
                                                dataKey="winRate"
                                                stroke="#10b981"
                                                strokeWidth={2}
                                                dot={{ r: 3, fill: '#10b981' }}
                                                activeDot={{ r: 5 }}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="count"
                                                stroke="#6366f1"
                                                strokeWidth={1}
                                                strokeDasharray="4 4"
                                                dot={false}
                                                yAxisId="right"
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </Grid>
                            );
                        })}
                    </Grid>
                </Paper>
            )}

            {/* Close Reason Breakdown */}
            {closeReasonData.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
                        Exit Reason Analysis
                    </Typography>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={closeReasonData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                            <XAxis dataKey="reason" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} width={36} />
                            <RechartsTooltip
                                contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                                formatter={(value: number, name: string) => {
                                    if (name === 'winRate') return [`${value}%`, 'Win Rate'];
                                    if (name === 'total') return [value, 'Trades'];
                                    if (name === 'totalPnl') return [`$${value.toFixed(2)}`, 'P&L'];
                                    return [value, name];
                                }}
                            />
                            <Bar dataKey="total" name="total" radius={[4, 4, 0, 0]}>
                                {closeReasonData.map((entry, idx) => (
                                    <Cell
                                        key={idx}
                                        fill={entry.winRate >= 50 ? '#10b981' : entry.winRate >= 30 ? '#f59e0b' : '#ef4444'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <TableContainer sx={{ mt: 1 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Exit Reason</TableCell>
                                    <TableCell align="right">Trades</TableCell>
                                    <TableCell align="right">Win Rate</TableCell>
                                    <TableCell align="right">Total P&L</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {closeReasonData.map((row) => (
                                    <TableRow key={row.reason} hover>
                                        <TableCell>{row.reason}</TableCell>
                                        <TableCell align="right">{row.total}</TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`${row.winRate}%`}
                                                size="small"
                                                color={row.winRate >= 50 ? 'success' : row.winRate >= 30 ? 'warning' : 'error'}
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography
                                                variant="body2"
                                                color={row.totalPnl >= 0 ? 'success.main' : 'error.main'}
                                            >
                                                ${row.totalPnl.toFixed(2)}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Trade-level detail: which trades would be filtered */}
            {trades && trades.length > 0 && (
                <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                        <Typography variant="h6" fontWeight={600}>
                            Trade-by-Trade Results
                        </Typography>
                        <Chip
                            label={`${projected?.count ?? 0} pass / ${tradesFiltered} filtered`}
                            size="small"
                            color="primary"
                            variant="outlined"
                            sx={{ ml: 'auto' }}
                        />
                    </Box>
                    <TableContainer sx={{ maxHeight: 400 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Symbol</TableCell>
                                    <TableCell>Tier</TableCell>
                                    <TableCell align="right">RSI</TableCell>
                                    <TableCell align="right">Vol Ratio</TableCell>
                                    <TableCell align="right">Quality</TableCell>
                                    <TableCell align="right">P&L</TableCell>
                                    <TableCell>Exit</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(trades as {
                                    wouldPass: boolean; symbol: string; tier: string;
                                    rsi: number; volumeRatio: number; smoothQuality: number;
                                    pnl: number; pnlPct: number; isWin: boolean; closeReason: string;
                                    entryTime: string;
                                }[]).map((t, idx) => (
                                    <TableRow
                                        key={idx}
                                        hover
                                        sx={{
                                            opacity: t.wouldPass ? 1 : 0.5,
                                            bgcolor: !t.wouldPass ? 'rgba(239,68,68,0.04)' : undefined,
                                        }}
                                    >
                                        <TableCell>
                                            {t.wouldPass
                                                ? <Chip label="PASS" size="small" color={t.isWin ? 'success' : 'error'} />
                                                : <Chip label="FILTERED" size="small" variant="outlined" color="default" />
                                            }
                                        </TableCell>
                                        <TableCell>
                                            <Tooltip title={t.entryTime ? new Date(t.entryTime).toLocaleString() : ''}>
                                                <Typography variant="body2" fontWeight={600}>{t.symbol}</Typography>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={t.tier || '—'}
                                                size="small"
                                                variant="outlined"
                                                color={t.tier === 'tier3' ? 'error' : t.tier === 'tier2' ? 'warning' : 'success'}
                                            />
                                        </TableCell>
                                        <TableCell align="right">{t.rsi?.toFixed(1) ?? '—'}</TableCell>
                                        <TableCell align="right">{t.volumeRatio?.toFixed(2) ?? '—'}x</TableCell>
                                        <TableCell align="right">
                                            <Typography
                                                variant="body2"
                                                color={t.smoothQuality >= 0.7 ? 'success.main' : t.smoothQuality >= 0.55 ? 'warning.main' : 'error.main'}
                                            >
                                                {t.smoothQuality?.toFixed(3) ?? '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography variant="body2" color={t.pnl >= 0 ? 'success.main' : 'error.main'}>
                                                ${t.pnl?.toFixed(2) ?? '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">
                                                {(t.closeReason || '').replace(/_/g, ' ')}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}
        </Box>
    );
}
