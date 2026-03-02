import { useState } from 'react';
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
    Alert,
    ToggleButton,
    ToggleButtonGroup,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
} from '@mui/material';
import { TrendingUp, TrendingDown, Receipt } from '@mui/icons-material';
import { apiClient } from '@/services/api';
import { MetricCard } from '@/components/MetricCard';
import type { TradeRecord, TradeBotTotal } from '@/types';

type BotFilter = 'all' | 'stock' | 'forex' | 'crypto';

const BOT_COLORS: Record<string, 'success' | 'primary' | 'warning'> = {
    stock: 'success',
    forex: 'primary',
    crypto: 'warning',
};

function pnlColor(val: number | string | null) {
    const n = parseFloat(String(val ?? 0));
    return n > 0 ? 'success.main' : n < 0 ? 'error.main' : 'text.secondary';
}

function fmt(val: number | string | null, prefix = '$') {
    const n = parseFloat(String(val ?? 0));
    return `${n >= 0 ? '' : '-'}${prefix}${Math.abs(n).toFixed(2)}`;
}

export default function TradesPage() {
    const [botFilter, setBotFilter] = useState<BotFilter>('all');
    const [days, setDays] = useState(30);

    const { data: trades = [], isLoading: tradesLoading } = useQuery(
        ['trades', botFilter],
        () => apiClient.getTrades({ bot: botFilter === 'all' ? undefined : botFilter, limit: 200 }),
        { staleTime: 30 * 1000, refetchInterval: 60 * 1000 }
    );

    const { data: summary, isLoading: summaryLoading } = useQuery(
        ['tradesSummary', days],
        () => apiClient.getTradesSummary(days),
        { staleTime: 60 * 1000, refetchInterval: 120 * 1000 }
    );

    const totals = summary?.totals ?? [];
    const allTotal = totals.reduce<TradeBotTotal>((acc, t) => ({
        bot: 'all',
        total_trades: String(parseInt(acc.total_trades) + parseInt(t.total_trades)),
        winners: String(parseInt(acc.winners) + parseInt(t.winners)),
        total_pnl: acc.total_pnl + t.total_pnl,
        gross_profit: acc.gross_profit + t.gross_profit,
        gross_loss: acc.gross_loss + t.gross_loss,
    }), { bot: 'all', total_trades: '0', winners: '0', total_pnl: 0, gross_profit: 0, gross_loss: 0 });

    const totalTrades = parseInt(allTotal.total_trades);
    const winRate = totalTrades > 0 ? parseInt(allTotal.winners) / totalTrades : 0;
    const profitFactor = allTotal.gross_loss > 0 ? allTotal.gross_profit / allTotal.gross_loss : allTotal.gross_profit > 0 ? Infinity : 0;

    const isLoading = tradesLoading || summaryLoading;

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Receipt sx={{ fontSize: 32, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h5" fontWeight={700}>Trade History</Typography>
                    <Typography variant="body2" color="text.secondary">All trades persisted to PostgreSQL across stock, forex and crypto bots</Typography>
                </Box>
                <FormControl size="small" sx={{ ml: 'auto', minWidth: 100 }}>
                    <InputLabel>Period</InputLabel>
                    <Select value={days} label="Period" onChange={(e) => setDays(Number(e.target.value))}>
                        <MenuItem value={7}>7 days</MenuItem>
                        <MenuItem value={14}>14 days</MenuItem>
                        <MenuItem value={30}>30 days</MenuItem>
                        <MenuItem value={90}>90 days</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            {/* Summary metric cards */}
            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : (
                <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: 3, mb: 3 }}>
                        <MetricCard
                            title="Total Trades"
                            value={String(totalTrades)}
                            color={totalTrades >= 30 ? 'success' : undefined}
                            icon={<Receipt />}
                        />
                        <MetricCard
                            title="Win Rate"
                            value={(winRate * 100).toFixed(1)}
                            suffix="%"
                            color={winRate >= 0.5 ? 'success' : totalTrades > 0 ? 'warning' : undefined}
                            icon={<TrendingUp />}
                        />
                        <MetricCard
                            title="Total P&L"
                            value={fmt(allTotal.total_pnl)}
                            color={allTotal.total_pnl > 0 ? 'success' : totalTrades > 0 ? 'error' : undefined}
                            icon={allTotal.total_pnl >= 0 ? <TrendingUp /> : <TrendingDown />}
                        />
                        <MetricCard
                            title="Profit Factor"
                            value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'}
                            color={profitFactor >= 1.5 ? 'success' : profitFactor >= 1.2 ? 'warning' : totalTrades > 0 ? 'error' : undefined}
                            icon={<TrendingUp />}
                        />
                    </Box>

                    {/* Per-bot totals */}
                    {totals.length > 0 && (
                        <Grid container spacing={2} sx={{ mb: 3 }}>
                            {totals.map(t => {
                                const tt = parseInt(t.total_trades);
                                const wr = tt > 0 ? parseInt(t.winners) / tt : 0;
                                return (
                                    <Grid item xs={12} sm={4} key={t.bot}>
                                        <Paper sx={{ p: 2 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <Chip label={t.bot.toUpperCase()} size="small" color={BOT_COLORS[t.bot] ?? 'default'} />
                                                <Typography variant="body2" color="text.secondary">{tt} closed trades</Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 3 }}>
                                                <Box>
                                                    <Typography variant="caption" color="text.secondary">Win Rate</Typography>
                                                    <Typography variant="body1" fontWeight={600} color={wr >= 0.5 ? 'success.main' : 'warning.main'}>
                                                        {(wr * 100).toFixed(1)}%
                                                    </Typography>
                                                </Box>
                                                <Box>
                                                    <Typography variant="caption" color="text.secondary">Total P&L</Typography>
                                                    <Typography variant="body1" fontWeight={600} color={pnlColor(t.total_pnl)}>
                                                        {fmt(t.total_pnl)}
                                                    </Typography>
                                                </Box>
                                                <Box>
                                                    <Typography variant="caption" color="text.secondary">Profit Factor</Typography>
                                                    <Typography variant="body1" fontWeight={600}>
                                                        {t.gross_loss > 0 ? (t.gross_profit / t.gross_loss).toFixed(2) : t.gross_profit > 0 ? '∞' : '—'}
                                                    </Typography>
                                                </Box>
                                            </Box>
                                        </Paper>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    )}

                    {/* Trade filter */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Typography variant="body2" color="text.secondary">Filter:</Typography>
                        <ToggleButtonGroup
                            value={botFilter}
                            exclusive
                            onChange={(_, v) => { if (v) setBotFilter(v as BotFilter); }}
                            size="small"
                        >
                            <ToggleButton value="all">All</ToggleButton>
                            <ToggleButton value="stock">Stock</ToggleButton>
                            <ToggleButton value="forex">Forex</ToggleButton>
                            <ToggleButton value="crypto">Crypto</ToggleButton>
                        </ToggleButtonGroup>
                        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }}>
                            {trades.length} records
                        </Typography>
                    </Box>

                    {/* Trades table */}
                    {trades.length === 0 ? (
                        <Alert severity="info">
                            No trades recorded yet. Trades will appear here once the bots execute and close positions.
                        </Alert>
                    ) : (
                        <Paper>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Bot</TableCell>
                                            <TableCell>Symbol</TableCell>
                                            <TableCell>Dir</TableCell>
                                            <TableCell>Tier</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell align="right">Entry</TableCell>
                                            <TableCell align="right">Exit</TableCell>
                                            <TableCell align="right">P&L</TableCell>
                                            <TableCell align="right">P&L %</TableCell>
                                            <TableCell>Close Reason</TableCell>
                                            <TableCell>Entry Time</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {(trades as TradeRecord[]).map((t) => (
                                            <TableRow key={t.id} hover>
                                                <TableCell>
                                                    <Chip label={t.bot} size="small" color={BOT_COLORS[t.bot] ?? 'default'} variant="outlined" />
                                                </TableCell>
                                                <TableCell><Typography fontWeight={600}>{t.symbol}</Typography></TableCell>
                                                <TableCell>
                                                    <Chip label={t.direction.toUpperCase()} size="small"
                                                        color={t.direction === 'short' ? 'error' : 'success'} variant="outlined" />
                                                </TableCell>
                                                <TableCell>{t.tier ?? '—'}</TableCell>
                                                <TableCell>
                                                    <Chip label={t.status} size="small"
                                                        color={t.status === 'open' ? 'primary' : t.status === 'closed' ? 'default' : 'warning'}
                                                        variant={t.status === 'open' ? 'filled' : 'outlined'} />
                                                </TableCell>
                                                <TableCell align="right">{t.entry_price ? `$${parseFloat(t.entry_price).toFixed(4)}` : '—'}</TableCell>
                                                <TableCell align="right">{t.exit_price ? `$${parseFloat(t.exit_price).toFixed(4)}` : '—'}</TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={pnlColor(t.pnl_usd)}>
                                                        {t.pnl_usd != null ? fmt(t.pnl_usd) : '—'}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color={pnlColor(t.pnl_pct)}>
                                                        {t.pnl_pct != null ? `${parseFloat(t.pnl_pct).toFixed(2)}%` : '—'}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption" color="text.secondary">{t.close_reason ?? '—'}</Typography>
                                                </TableCell>
                                                <TableCell>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {t.entry_time ? new Date(t.entry_time).toLocaleString() : '—'}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}
                </>
            )}
        </Box>
    );
}
