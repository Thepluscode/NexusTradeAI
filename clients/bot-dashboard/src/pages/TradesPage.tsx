import { useState, useCallback } from 'react';
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
    Button,
    Tooltip,
    Tabs,
    Tab,
} from '@mui/material';
import { TrendingUp, TrendingDown, Receipt, Download, Person, Analytics } from '@mui/icons-material';
import { apiClient } from '@/services/api';
import { MetricCard } from '@/components/MetricCard';
import type { TradeRecord, TradeBotTotal, TradeAnalyticsHour, TradeAnalyticsSymbol, TradeAnalyticsTier } from '@/types';

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

function exportTradesToCSV(rows: TradeRecord[]) {
    const headers = [
        'id', 'bot', 'symbol', 'direction', 'tier', 'status',
        'entry_price', 'exit_price', 'quantity', 'position_size_usd',
        'pnl_usd', 'pnl_pct', 'stop_loss', 'take_profit',
        'entry_time', 'exit_time', 'close_reason', 'session',
    ];
    const escape = (v: string | number | null) => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
        headers.join(','),
        ...rows.map(r => headers.map(h => escape(r[h as keyof TradeRecord])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export default function TradesPage() {
    const [tab, setTab] = useState(0);
    const [botFilter, setBotFilter] = useState<BotFilter>('all');
    const [days, setDays] = useState(30);
    const [myTrades, setMyTrades] = useState(false);
    const isLoggedIn = !!localStorage.getItem('nexus_access_token');

    const { data: trades = [], isLoading: tradesLoading } = useQuery(
        ['trades', botFilter, myTrades],
        () => apiClient.getTrades({ bot: botFilter === 'all' ? undefined : botFilter, limit: 200, mine: myTrades }),
        { staleTime: 30 * 1000, refetchInterval: 60 * 1000 }
    );

    const { data: summary, isLoading: summaryLoading } = useQuery(
        ['tradesSummary', days],
        () => apiClient.getTradesSummary(days),
        { staleTime: 60 * 1000, refetchInterval: 120 * 1000 }
    );

    const { data: analytics, isLoading: analyticsLoading } = useQuery(
        ['tradeAnalytics', days],
        () => apiClient.getTradeAnalytics(days),
        { staleTime: 120 * 1000, refetchInterval: 5 * 60 * 1000, enabled: tab === 1 }
    );

    const totals = summary?.totals ?? [];
    const allTotal = totals.reduce<TradeBotTotal & { total_all_trades?: string; open_trades?: string }>((acc, t) => {
        const tAny = t as TradeBotTotal & { total_all_trades?: string; open_trades?: string };
        return {
            bot: 'all',
            total_all_trades: String(parseInt(acc.total_all_trades || '0') + parseInt(tAny.total_all_trades || tAny.total_trades || '0')),
            open_trades: String(parseInt(acc.open_trades || '0') + parseInt(tAny.open_trades || '0')),
            total_trades: String(parseInt(acc.total_trades) + parseInt(t.total_trades)),
            winners: String(parseInt(acc.winners) + parseInt(t.winners)),
            total_pnl: acc.total_pnl + t.total_pnl,
            gross_profit: acc.gross_profit + t.gross_profit,
            gross_loss: acc.gross_loss + t.gross_loss,
        };
    }, { bot: 'all', total_all_trades: '0', open_trades: '0', total_trades: '0', winners: '0', total_pnl: 0, gross_profit: 0, gross_loss: 0 });

    const allTradesCount = parseInt(allTotal.total_all_trades || allTotal.total_trades);
    const closedTradesCount = parseInt(allTotal.total_trades);
    const openTradesCount = parseInt(allTotal.open_trades || '0');
    const winRate = closedTradesCount > 0 ? parseInt(allTotal.winners) / closedTradesCount : 0;
    const profitFactor = allTotal.gross_loss > 0 ? allTotal.gross_profit / allTotal.gross_loss : allTotal.gross_profit > 0 ? Infinity : 0;

    const isLoading = tradesLoading || summaryLoading;

    const handleExport = useCallback(() => {
        exportTradesToCSV(trades as TradeRecord[]);
    }, [trades]);

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <Receipt sx={{ fontSize: 32, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h5" fontWeight={700}>Trades</Typography>
                    <Typography variant="body2" color="text.secondary">All trades persisted to PostgreSQL across stock, forex and crypto bots</Typography>
                </Box>
                {isLoggedIn && (
                    <Button
                        variant={myTrades ? 'contained' : 'outlined'}
                        size="small"
                        startIcon={<Person />}
                        onClick={() => setMyTrades(v => !v)}
                        color="primary"
                        sx={{ ml: { sm: 'auto' } }}
                    >
                        {myTrades ? 'My Trades' : 'All Trades'}
                    </Button>
                )}
                <FormControl size="small" sx={{ ml: isLoggedIn ? 0 : 'auto', minWidth: 100 }}>
                    <InputLabel>Period</InputLabel>
                    <Select value={days} label="Period" onChange={(e) => setDays(Number(e.target.value))}>
                        <MenuItem value={7}>7 days</MenuItem>
                        <MenuItem value={14}>14 days</MenuItem>
                        <MenuItem value={30}>30 days</MenuItem>
                        <MenuItem value={90}>90 days</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            {/* Tab bar */}
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                <Tab label="History" icon={<Receipt />} iconPosition="start" />
                <Tab label="Analytics" icon={<Analytics />} iconPosition="start" />
            </Tabs>

            {/* History tab */}
            {tab === 0 && isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : tab === 0 ? (
                <>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', md: 'repeat(4,1fr)' }, gap: 3, mb: 3 }}>
                        <MetricCard
                            title="Total Trades"
                            value={String(allTradesCount)}
                            suffix={openTradesCount > 0 ? ` (${openTradesCount} open)` : undefined}
                            color={allTradesCount >= 30 ? 'success' : undefined}
                            icon={<Receipt />}
                        />
                        <MetricCard
                            title="Win Rate"
                            value={(winRate * 100).toFixed(1)}
                            suffix="%"
                            color={winRate >= 0.5 ? 'success' : closedTradesCount > 0 ? 'warning' : undefined}
                            icon={<TrendingUp />}
                        />
                        <MetricCard
                            title="Total P&L"
                            value={fmt(allTotal.total_pnl)}
                            color={allTotal.total_pnl > 0 ? 'success' : closedTradesCount > 0 ? 'error' : undefined}
                            icon={allTotal.total_pnl >= 0 ? <TrendingUp /> : <TrendingDown />}
                        />
                        <MetricCard
                            title="Profit Factor"
                            value={isFinite(profitFactor) ? profitFactor.toFixed(2) : '∞'}
                            color={profitFactor >= 1.5 ? 'success' : profitFactor >= 1.2 ? 'warning' : closedTradesCount > 0 ? 'error' : undefined}
                            icon={<TrendingUp />}
                        />
                    </Box>

                    {/* Per-bot totals */}
                    {totals.length > 0 && (
                        <Grid container spacing={2} sx={{ mb: 3 }}>
                            {totals.map(t => {
                                const tAny = t as TradeBotTotal & { total_all_trades?: string; open_trades?: string };
                                const tt = parseInt(t.total_trades);
                                const openTt = parseInt(tAny.open_trades || '0');
                                const wr = tt > 0 ? parseInt(t.winners) / tt : 0;
                                return (
                                    <Grid item xs={12} sm={4} key={t.bot}>
                                        <Paper sx={{ p: 2 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                                <Chip label={t.bot.toUpperCase()} size="small" color={BOT_COLORS[t.bot] ?? 'default'} />
                                                <Typography variant="body2" color="text.secondary">
                                                    {tt} closed trades{openTt > 0 ? ` · ${openTt} open` : ''}
                                                </Typography>
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
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
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
                        <Tooltip title="Export visible rows as CSV">
                            <span>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<Download />}
                                    onClick={handleExport}
                                    disabled={trades.length === 0}
                                    sx={{ fontSize: '0.75rem', height: 32 }}
                                >
                                    Export CSV
                                </Button>
                            </span>
                        </Tooltip>
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
                                            <TableRow key={t.id} hover sx={{ opacity: t.status === 'open' ? 0.85 : 1 }}>
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
                                                <TableCell align="right">
                                                    {t.exit_price
                                                        ? `$${parseFloat(t.exit_price).toFixed(4)}`
                                                        : <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>—</Typography>
                                                    }
                                                </TableCell>
                                                <TableCell align="right">
                                                    {t.pnl_usd != null ? (
                                                        <Typography variant="body2" color={pnlColor(t.pnl_usd)}>{fmt(t.pnl_usd)}</Typography>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>Unrealized</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    {t.pnl_pct != null ? (
                                                        <Typography variant="body2" color={pnlColor(t.pnl_pct)}>{parseFloat(t.pnl_pct).toFixed(2)}%</Typography>
                                                    ) : (
                                                        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>—</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {t.close_reason
                                                        ? <Typography variant="caption" color="text.secondary">{t.close_reason}</Typography>
                                                        : t.status === 'open'
                                                            ? <Chip label="Active" size="small" color="primary" variant="outlined" sx={{ fontSize: '0.65rem', height: 22 }} />
                                                            : <Typography variant="caption" color="text.secondary">—</Typography>
                                                    }
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
            ) : tab === 1 ? (
                /* Analytics tab */
                analyticsLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {/* By Hour */}
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={700} mb={1}>Win Rate by Hour (EST)</Typography>
                            {(!analytics?.byHour?.length) ? (
                                <Alert severity="info">No closed trades in selected period.</Alert>
                            ) : (
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Hour (EST)</TableCell>
                                                <TableCell align="right">Trades</TableCell>
                                                <TableCell align="right">Win Rate</TableCell>
                                                <TableCell align="right">Avg P&L %</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(analytics.byHour as TradeAnalyticsHour[]).map(r => {
                                                const total = parseInt(r.total);
                                                const wr = total > 0 ? parseInt(r.winners) / total : 0;
                                                return (
                                                    <TableRow key={r.hour} hover>
                                                        <TableCell>{String(r.hour).padStart(2, '0')}:00</TableCell>
                                                        <TableCell align="right">{r.total}</TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={wr >= 0.5 ? 'success.main' : 'warning.main'}>
                                                                {(wr * 100).toFixed(1)}%
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={pnlColor(r.avg_pnl_pct)}>
                                                                {parseFloat(r.avg_pnl_pct ?? '0').toFixed(2)}%
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Paper>

                        {/* By Symbol */}
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={700} mb={1}>Top Symbols</Typography>
                            {(!analytics?.bySymbol?.length) ? (
                                <Alert severity="info">No closed trades in selected period.</Alert>
                            ) : (
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Symbol</TableCell>
                                                <TableCell>Bot</TableCell>
                                                <TableCell align="right">Trades</TableCell>
                                                <TableCell align="right">Win Rate</TableCell>
                                                <TableCell align="right">Avg P&L %</TableCell>
                                                <TableCell align="right">Avg Hold (h)</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(analytics.bySymbol as TradeAnalyticsSymbol[]).map(r => {
                                                const total = parseInt(r.total);
                                                const wr = total > 0 ? parseInt(r.winners) / total : 0;
                                                return (
                                                    <TableRow key={`${r.symbol}-${r.bot}`} hover>
                                                        <TableCell><Typography fontWeight={600}>{r.symbol}</Typography></TableCell>
                                                        <TableCell><Chip label={r.bot} size="small" color={BOT_COLORS[r.bot] ?? 'default'} variant="outlined" /></TableCell>
                                                        <TableCell align="right">{r.total}</TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={wr >= 0.5 ? 'success.main' : 'warning.main'}>
                                                                {(wr * 100).toFixed(1)}%
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={pnlColor(r.avg_pnl_pct)}>
                                                                {parseFloat(r.avg_pnl_pct ?? '0').toFixed(2)}%
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">{r.avg_hold_hours ?? '—'}</TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Paper>

                        {/* By Tier */}
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="subtitle1" fontWeight={700} mb={1}>Performance by Tier</Typography>
                            {(!analytics?.byTier?.length) ? (
                                <Alert severity="info">No closed trades in selected period.</Alert>
                            ) : (
                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Tier</TableCell>
                                                <TableCell>Bot</TableCell>
                                                <TableCell align="right">Trades</TableCell>
                                                <TableCell align="right">Win Rate</TableCell>
                                                <TableCell align="right">Avg P&L %</TableCell>
                                                <TableCell align="right">Total P&L</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(analytics.byTier as TradeAnalyticsTier[]).map((r, i) => {
                                                const total = parseInt(r.total);
                                                const wr = total > 0 ? parseInt(r.winners) / total : 0;
                                                return (
                                                    <TableRow key={`${r.tier}-${r.bot}-${i}`} hover>
                                                        <TableCell><Chip label={r.tier} size="small" /></TableCell>
                                                        <TableCell><Chip label={r.bot} size="small" color={BOT_COLORS[r.bot] ?? 'default'} variant="outlined" /></TableCell>
                                                        <TableCell align="right">{r.total}</TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={wr >= 0.5 ? 'success.main' : 'warning.main'}>
                                                                {(wr * 100).toFixed(1)}%
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={pnlColor(r.avg_pnl_pct)}>
                                                                {parseFloat(r.avg_pnl_pct ?? '0').toFixed(2)}%
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={pnlColor(r.total_pnl)}>
                                                                {fmt(r.total_pnl)}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </Paper>
                    </Box>
                )
            ) : null}
        </Box>
    );
}
