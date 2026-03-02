import React from 'react';
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
    Button,
    CircularProgress,
    Alert,
} from '@mui/material';
import {
    CurrencyExchange,
    TrendingUp,
    TrendingDown,
    AccessTime,
    PlayArrow,
    Stop,
    Refresh,
} from '@mui/icons-material';
import { useForexTrading } from '@/hooks/useForexTrading';
import { MetricCard } from '@/components/MetricCard';

export const ForexPanel: React.FC = () => {
    const {
        status,
        positions,
        isLoading,
        error,
        startEngine,
        stopEngine,
        isStarting,
        isStopping,
        refetch,
    } = useForexTrading();

    if (isLoading && !status) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    // session is a plain string: "OVERLAP", "LONDON", "NEW_YORK", "TOKYO", "OFF_PEAK"
    const sessionColor = (session: string) => {
        switch (session) {
            case 'OVERLAP': return 'success';
            case 'LONDON':
            case 'NEW_YORK': return 'primary';
            case 'TOKYO': return 'warning';
            default: return 'default';
        }
    };

    return (
        <Box>
            {error && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    Forex service may be offline. Check if unified-forex-bot.js is running on port 3005.
                </Alert>
            )}

            {/* Header with Session Info */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <CurrencyExchange sx={{ fontSize: 40, color: 'primary.main' }} />
                        <Box>
                            <Typography variant="h5">Forex Trading</Typography>
                            <Typography variant="body2" color="text.secondary">
                                24/5 Currency Trading via OANDA
                            </Typography>
                        </Box>
                    </Box>

                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <Chip
                            icon={<AccessTime />}
                            label={status?.session || 'Unknown'}
                            color={sessionColor(status?.session || '') as 'success' | 'primary' | 'warning' | 'default'}
                            variant="filled"
                        />
                        <Chip
                            label={status?.marketOpen ? 'Market Open' : 'Market Closed'}
                            color={status?.marketOpen ? 'success' : 'default'}
                            variant="outlined"
                        />
                        <Chip
                            label={status?.isRunning ? 'Running' : 'Stopped'}
                            color={status?.isRunning ? 'success' : 'error'}
                            variant="filled"
                        />
                    </Box>
                </Box>

                {/* Control Buttons */}
                <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={isStarting ? <CircularProgress size={20} /> : <PlayArrow />}
                        onClick={startEngine}
                        disabled={status?.isRunning || isStarting}
                    >
                        Start Trading
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={isStopping ? <CircularProgress size={20} /> : <Stop />}
                        onClick={stopEngine}
                        disabled={!status?.isRunning || isStopping}
                    >
                        Stop Trading
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<Refresh />}
                        onClick={refetch}
                    >
                        Refresh
                    </Button>
                </Box>
            </Paper>

            {/* Metrics Grid */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title="Portfolio Value"
                        value={(status?.equity ?? status?.portfolioValue ?? 0).toLocaleString()}
                        prefix="$"
                        color="primary"
                        icon={<CurrencyExchange />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title="Daily P&L"
                        value={status?.dailyPnL?.toFixed(2) || '0.00'}
                        prefix="$"
                        color={status?.dailyPnL && status.dailyPnL >= 0 ? 'success' : 'error'}
                        icon={status?.dailyPnL && status.dailyPnL >= 0 ? <TrendingUp /> : <TrendingDown />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title="Active Positions"
                        value={positions.length}
                        color="info"
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                        title="Trades Today"
                        value={status?.stats?.totalTrades ?? status?.performance?.totalTrades ?? 0}
                        suffix="/10"
                        color="primary"
                    />
                </Grid>
            </Grid>

            {/* Positions Table */}
            <Paper sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Open Forex Positions
                </Typography>

                {positions.length === 0 ? (
                    <Alert severity="info">
                        No open forex positions. The bot will scan for opportunities during optimal sessions.
                    </Alert>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Pair</TableCell>
                                    <TableCell>Direction</TableCell>
                                    <TableCell align="right">Units</TableCell>
                                    <TableCell align="right">Unrealized P&L</TableCell>
                                    <TableCell>Strategy</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {positions.map((pos, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>
                                            <Typography variant="body1" fontWeight="bold">
                                                {pos.symbol?.replace('_', '/')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={pos.side?.toUpperCase()}
                                                color={pos.side === 'long' ? 'success' : 'error'}
                                                size="small"
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            {pos.units != null ? Math.abs(pos.units).toLocaleString() : 'N/A'}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography
                                                color={(pos.unrealizedPL ?? 0) >= 0 ? 'success.main' : 'error.main'}
                                                fontWeight="bold"
                                            >
                                                ${(pos.unrealizedPL ?? 0).toFixed(2)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip label={pos.strategy || 'forex-trend'} size="small" variant="outlined" />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Trading Session Info */}
            <Paper sx={{ p: 2, mt: 3 }}>
                <Typography variant="h6" sx={{ mb: 2 }}>
                    Forex Trading Sessions (EST)
                </Typography>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                            <Typography variant="subtitle2" color="primary">London Session</Typography>
                            <Typography variant="body2">3:00 AM - 12:00 PM</Typography>
                            <Typography variant="caption" color="text.secondary">EUR, GBP pairs</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, bgcolor: 'success.dark', borderRadius: 1 }}>
                            <Typography variant="subtitle2" color="white">London/NY Overlap ⭐</Typography>
                            <Typography variant="body2" color="white">8:00 AM - 12:00 PM</Typography>
                            <Typography variant="caption" color="rgba(255,255,255,0.7)">Best liquidity</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                            <Typography variant="subtitle2" color="primary">New York Session</Typography>
                            <Typography variant="body2">8:00 AM - 5:00 PM</Typography>
                            <Typography variant="caption" color="text.secondary">USD pairs</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                            <Typography variant="subtitle2" color="primary">Tokyo Session</Typography>
                            <Typography variant="body2">7:00 PM - 4:00 AM</Typography>
                            <Typography variant="caption" color="text.secondary">JPY pairs</Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>
        </Box>
    );
};
