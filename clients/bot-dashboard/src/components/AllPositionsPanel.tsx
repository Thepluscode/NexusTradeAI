import React, { useState } from 'react';
import {
    Box,
    Grid,
    Paper,
    Typography,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Alert,
    CircularProgress,
    ToggleButtonGroup,
    ToggleButton,
} from '@mui/material';
import {
    ShowChart,
    CurrencyExchange,
    AccountBalance,
    TrendingUp,
    TrendingDown,
    CurrencyBitcoin,
} from '@mui/icons-material';
import { useTradingEngine } from '@/hooks/useTradingEngine';
import { useForexTrading } from '@/hooks/useForexTrading';
import { useCryptoTrading } from '@/hooks/useCryptoTrading';
import { MetricCard } from '@/components/MetricCard';

interface UnifiedPosition {
    symbol: string;
    market: 'stocks' | 'forex' | 'crypto';
    side: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    unrealizedPnLPercent: number;
    strategy?: string;
}

export const AllPositionsPanel: React.FC = () => {
    const { status: stockStatus, positions: stockPositions, isLoading: stockLoading } = useTradingEngine();
    const { status: forexStatus, positions: forexPositions, isLoading: forexLoading } = useForexTrading();
    const { status: cryptoStatus, positions: cryptoPositions, isLoading: cryptoLoading } = useCryptoTrading();
    const [filter, setFilter] = useState<'all' | 'stocks' | 'forex' | 'crypto'>('all');

    const isLoading = stockLoading || forexLoading || cryptoLoading;

    // Combine positions from all markets
    const allPositions: UnifiedPosition[] = [
        // Stock positions — bot sends `quantity` (not `qty`)
        ...(stockPositions || []).map((pos: any) => ({
            symbol: pos.symbol,
            market: 'stocks' as const,
            side: pos.side || 'long',
            quantity: pos.quantity || pos.qty || 0,
            entryPrice: pos.avg_entry_price || pos.entry || pos.entryPrice || 0,
            currentPrice: pos.current_price || pos.currentPrice || 0,
            unrealizedPnL: pos.unrealized_pl || pos.unrealizedPnL || pos.pnl || 0,
            unrealizedPnLPercent: (pos.unrealized_plpc != null ? pos.unrealized_plpc * 100 : null) ?? pos.pnlPercent ?? 0,
            strategy: pos.strategy || 'momentum',
        })),
        // Forex positions — bot sends `unrealizedPL` (no lowercase n) and `qty`
        ...(forexPositions || []).map((pos: any) => ({
            symbol: pos.symbol?.replace('_', '/') || pos.symbol,
            market: 'forex' as const,
            side: pos.side || 'long',
            quantity: Math.abs(pos.units ?? pos.qty ?? 0),
            entryPrice: pos.entryPrice ?? pos.entry ?? 0,
            currentPrice: pos.currentPrice || 0,
            unrealizedPnL: pos.unrealizedPL ?? pos.unrealizedPnL ?? 0,
            unrealizedPnLPercent: pos.unrealizedPLPct != null
                ? pos.unrealizedPLPct
                : (pos.entryPrice ?? pos.entry ?? 0) > 0 && Math.abs(pos.units ?? pos.qty ?? 0) > 0
                    ? ((pos.unrealizedPL ?? pos.unrealizedPnL ?? 0) / ((pos.entryPrice ?? pos.entry ?? 0) * Math.abs(pos.units ?? pos.qty ?? 0))) * 100
                    : 0,
            strategy: pos.strategy || 'forex-trend',
        })),
        // Crypto positions — bot sends `quantity` (not `qty`)
        ...(cryptoPositions || []).map((pos: any) => ({
            symbol: pos.symbol,
            market: 'crypto' as const,
            side: pos.side || 'long',
            quantity: pos.quantity || pos.qty || 0,
            entryPrice: pos.entry ?? pos.entryPrice ?? 0,
            currentPrice: pos.currentPrice || 0,
            unrealizedPnL: pos.unrealizedPnL || 0,
            unrealizedPnLPercent: pos.unrealizedPnLPct != null
                ? pos.unrealizedPnLPct
                : (pos.entry ?? pos.entryPrice ?? 0) > 0 && (pos.quantity ?? pos.qty ?? 0) > 0
                    ? ((pos.unrealizedPnL ?? 0) / ((pos.entry ?? pos.entryPrice ?? 0) * (pos.quantity ?? pos.qty ?? 0))) * 100
                    : 0,
            strategy: pos.strategy || 'crypto-momentum',
        })),
    ];

    // Filter positions
    const filteredPositions = allPositions.filter(pos => {
        if (filter === 'all') return true;
        return pos.market === filter;
    });

    // Calculate totals
    const totalPnL = allPositions.reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);
    const stockPnL = allPositions
        .filter(p => p.market === 'stocks')
        .reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);
    const forexPnL = allPositions
        .filter(p => p.market === 'forex')
        .reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);
    const cryptoPnL = allPositions
        .filter(p => p.market === 'crypto')
        .reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);

    const stockPortfolio = stockStatus?.equity || stockStatus?.portfolioValue || 0; // USD — stock bot sends `equity`
    // Forex bot sends `equity`, not `portfolioValue`
    const forexPortfolio = forexStatus?.equity || forexStatus?.portfolioValue || 0; // GBP or USD
    const forexCurrency = forexStatus?.currency || 'USD'; // Get currency from API
    const forexCurrencySymbol = forexCurrency === 'GBP' ? '£' : '$';
    const cryptoPortfolio = cryptoStatus?.portfolioValue || cryptoStatus?.equity || 0; // USD

    // Convert GBP to USD for total calculation (GBP/USD rate ~1.27)
    const GBP_TO_USD_RATE = 1.27;
    const forexPortfolioUSD = forexCurrency === 'GBP'
        ? forexPortfolio * GBP_TO_USD_RATE
        : forexPortfolio;
    const totalPortfolio = stockPortfolio + forexPortfolioUSD + cryptoPortfolio;

    if (isLoading && allPositions.length === 0) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            {/* Summary Header */}
            <Paper sx={{ p: 3, mb: 3, background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
                <Typography variant="h5" sx={{ mb: 3, color: 'white' }}>
                    Multi-Asset Portfolio Overview
                </Typography>

                <Grid container spacing={3}>
                    <Grid item xs={12} sm={4} md={2.4}>
                        <MetricCard
                            title="Total Portfolio"
                            value={totalPortfolio.toLocaleString()}
                            prefix="$"
                            color="primary"
                            icon={<AccountBalance />}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4} md={2.4}>
                        <MetricCard
                            title="Total Unrealized P&L"
                            value={totalPnL.toFixed(2)}
                            prefix="$"
                            color={totalPnL >= 0 ? 'success' : 'error'}
                            icon={totalPnL >= 0 ? <TrendingUp /> : <TrendingDown />}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4} md={2.4}>
                        <MetricCard
                            title="Stock Positions"
                            value={(stockPositions?.length || 0).toString()}
                            suffix={` ($${stockPnL.toFixed(0)})`}
                            color="info"
                            icon={<ShowChart />}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4} md={2.4}>
                        <MetricCard
                            title="Forex Positions"
                            value={(forexPositions?.length || 0).toString()}
                            suffix={` (${forexCurrencySymbol}${forexPnL.toFixed(0)})`}
                            color="warning"
                            icon={<CurrencyExchange />}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4} md={2.4}>
                        <MetricCard
                            title="Crypto Positions"
                            value={(cryptoPositions?.length || 0).toString()}
                            suffix={` ($${cryptoPnL.toFixed(0)})`}
                            color="primary"
                            icon={<CurrencyBitcoin />}
                        />
                    </Grid>
                </Grid>
            </Paper>

            {/* Filter Toggle */}
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center' }}>
                <ToggleButtonGroup
                    value={filter}
                    exclusive
                    onChange={(_, val) => val && setFilter(val)}
                    size="small"
                >
                    <ToggleButton value="all">
                        All ({allPositions.length})
                    </ToggleButton>
                    <ToggleButton value="stocks">
                        <ShowChart sx={{ mr: 0.5 }} />
                        Stocks ({stockPositions?.length || 0})
                    </ToggleButton>
                    <ToggleButton value="forex">
                        <CurrencyExchange sx={{ mr: 0.5 }} />
                        Forex ({forexPositions?.length || 0})
                    </ToggleButton>
                    <ToggleButton value="crypto">
                        <CurrencyBitcoin sx={{ mr: 0.5 }} />
                        Crypto ({cryptoPositions?.length || 0})
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Positions Table */}
            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    {filter === 'all' ? 'All Positions' : filter === 'stocks' ? 'Stock Positions' : filter === 'forex' ? 'Forex Positions' : 'Crypto Positions'}
                </Typography>

                {filteredPositions.length === 0 ? (
                    <Alert severity="info">
                        No open positions in this category.
                    </Alert>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Symbol</TableCell>
                                    <TableCell>Market</TableCell>
                                    <TableCell>Direction</TableCell>
                                    <TableCell align="right">Quantity</TableCell>
                                    <TableCell align="right">Entry Price</TableCell>
                                    <TableCell align="right">Current</TableCell>
                                    <TableCell align="right">Unrealized P&L</TableCell>
                                    <TableCell>Strategy</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {filteredPositions.map((pos, idx) => (
                                    <TableRow key={`${pos.market}-${pos.symbol}-${idx}`}>
                                        <TableCell>
                                            <Typography variant="body1" fontWeight="bold">
                                                {pos.symbol}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                icon={pos.market === 'stocks' ? <ShowChart /> : pos.market === 'forex' ? <CurrencyExchange /> : <CurrencyBitcoin />}
                                                label={pos.market.toUpperCase()}
                                                color={pos.market === 'stocks' ? 'info' : pos.market === 'forex' ? 'warning' : 'primary'}
                                                size="small"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={pos.side.toUpperCase()}
                                                color={pos.side === 'long' ? 'success' : 'error'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            {pos.quantity.toLocaleString()}
                                        </TableCell>
                                        <TableCell align="right">
                                            ${pos.entryPrice?.toFixed(pos.market === 'forex' ? 5 : 2) || 'N/A'}
                                        </TableCell>
                                        <TableCell align="right">
                                            ${pos.currentPrice?.toFixed(pos.market === 'forex' ? 5 : 2) || 'N/A'}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Box>
                                                <Typography
                                                    color={(pos.unrealizedPnL ?? 0) >= 0 ? 'success.main' : 'error.main'}
                                                    fontWeight="bold"
                                                >
                                                    ${pos.unrealizedPnL?.toFixed(2)}
                                                </Typography>
                                                {pos.unrealizedPnLPercent !== 0 && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        ({pos.unrealizedPnLPercent?.toFixed(2)}%)
                                                    </Typography>
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={pos.strategy} size="small" variant="outlined" />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Market Status Summary */}
            <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <ShowChart color="info" />
                            <Typography variant="subtitle1">Stock Market</Typography>
                        </Box>
                        <Chip
                            label={stockStatus?.isRunning ? 'Bot Running' : 'Bot Stopped'}
                            color={stockStatus?.isRunning ? 'success' : 'default'}
                            size="small"
                            sx={{ mr: 1 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            Alpaca Paper Trading • {(stockStatus as any)?.stats?.totalTrades ?? stockStatus?.performance?.totalTrades ?? 0} trades today
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <CurrencyExchange color="warning" />
                            <Typography variant="subtitle1">Forex Market</Typography>
                        </Box>
                        <Chip
                            label={forexStatus?.isRunning ? 'Bot Running' : 'Bot Stopped'}
                            color={forexStatus?.isRunning ? 'success' : 'default'}
                            size="small"
                            sx={{ mr: 1 }}
                        />
                        <Chip
                            label={forexStatus?.session || 'Session Unknown'}
                            color={forexStatus?.session === 'OVERLAP' ? 'success' : 'default'}
                            size="small"
                            variant="outlined"
                            sx={{ mr: 1 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            OANDA • {forexStatus?.stats?.totalTrades || 0} trades today
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <CurrencyBitcoin color="secondary" />
                            <Typography variant="subtitle1">Crypto Market</Typography>
                        </Box>
                        <Chip
                            label={cryptoStatus?.isRunning ? 'Bot Running' : 'Bot Stopped'}
                            color={cryptoStatus?.isRunning ? 'success' : 'default'}
                            size="small"
                            sx={{ mr: 1 }}
                        />
                        <Chip
                            label={cryptoStatus?.mode || 'DEMO'}
                            color="secondary"
                            size="small"
                            variant="outlined"
                            sx={{ mr: 1 }}
                        />
                        <Typography variant="body2" color="text.secondary">
                            Crypto.com • {cryptoStatus?.stats?.totalTrades ?? cryptoStatus?.totalTrades ?? 0} trades total
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};
