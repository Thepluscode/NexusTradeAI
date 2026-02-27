import { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
} from '@mui/material';
import axios from 'axios';

interface BotStatus {
  isRunning: boolean;
  strategy: string;
  performance: {
    totalTrades: number;
    activePositions: number;
    totalProfit: number;
    winRate: number;
    profitFactor: number;
  };
  positions: Array<{
    symbol: string;
    side: string;
    quantity: number;
    entryPrice: number;
    currentPrice: number;
    pnl: number;
    strategy: string;
  }>;
  portfolioValue: number;
  dailyPnL: number;
}

const BOTS = [
  {
    name: 'ORB',
    port: 3002,
    color: '#2196f3',
    description: 'Opening Range Breakout',
    frequency: '1-3 trades/week',
    winRateTarget: '55-60%',
  },
  {
    name: 'GAP FADE',
    port: 3007,
    color: '#ff9800',
    description: 'Mean Reversion (Short)',
    frequency: '2-5 trades/week',
    winRateTarget: '50-55%',
  },
  {
    name: 'HVB',
    port: 3008,
    color: '#4caf50',
    description: 'High-Volume Breakout',
    frequency: '3-7 trades/week',
    winRateTarget: '48-52%',
  },
];

export default function ThreeStrategyDashboard() {
  const [botStatuses, setBotStatuses] = useState<{ [key: string]: BotStatus | null }>({
    ORB: null,
    'GAP FADE': null,
    HVB: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllBots();
    const interval = setInterval(fetchAllBots, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchAllBots = async () => {
    const promises = BOTS.map(async (bot) => {
      try {
        const response = await axios.get(`http://localhost:${bot.port}/api/trading/status`);
        return { name: bot.name, data: response.data.data };
      } catch (error) {
        return { name: bot.name, data: null };
      }
    });

    const results = await Promise.all(promises);
    const newStatuses: { [key: string]: BotStatus | null } = {};

    results.forEach((result) => {
      newStatuses[result.name] = result.data;
    });

    setBotStatuses(newStatuses);
    setLoading(false);
  };

  const calculateCombinedStats = () => {
    const combined = {
      totalTrades: 0,
      totalPositions: 0,
      totalProfit: 0,
      portfolioValue: 0,
      dailyPnL: 0,
    };

    Object.values(botStatuses).forEach((status) => {
      if (status) {
        combined.totalTrades += status.performance.totalTrades;
        combined.totalPositions += status.performance.activePositions;
        combined.totalProfit += status.performance.totalProfit;
        combined.portfolioValue += status.portfolioValue;
        combined.dailyPnL += status.dailyPnL;
      }
    });

    return combined;
  };

  const combined = calculateCombinedStats();

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Loading 3-Strategy System...
        </Typography>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Typography variant="h4" gutterBottom>
        3-Strategy Trading System
      </Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom sx={{ mb: 3 }}>
        Running 3 proven edges in parallel • Each bot trades independently • Compare performance in real-time
      </Typography>

      {/* Combined Stats */}
      <Paper sx={{ p: 3, mb: 3, bgcolor: '#1a1a1a' }}>
        <Typography variant="h6" gutterBottom>
          Combined Performance (All 3 Bots)
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Total Positions
              </Typography>
              <Typography variant="h4">{combined.totalPositions}</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Trades Today
              </Typography>
              <Typography variant="h4">{combined.totalTrades}</Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Total P/L
              </Typography>
              <Typography
                variant="h4"
                sx={{ color: combined.totalProfit >= 0 ? '#4caf50' : '#f44336' }}
              >
                ${combined.totalProfit.toFixed(2)}
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Box>
              <Typography variant="body2" color="text.secondary">
                Daily P/L
              </Typography>
              <Typography
                variant="h4"
                sx={{ color: combined.dailyPnL >= 0 ? '#4caf50' : '#f44336' }}
              >
                ${combined.dailyPnL.toFixed(2)}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Individual Bot Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {BOTS.map((bot) => {
          const status = botStatuses[bot.name];
          return (
            <Grid item xs={12} md={4} key={bot.name}>
              <Card sx={{ borderLeft: `4px solid ${bot.color}` }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6">{bot.name}</Typography>
                    <Chip
                      label={status?.isRunning ? 'RUNNING' : 'OFFLINE'}
                      color={status?.isRunning ? 'success' : 'error'}
                      size="small"
                    />
                  </Box>

                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {bot.description}
                  </Typography>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Frequency: {bot.frequency}
                    </Typography>
                    <br />
                    <Typography variant="caption" color="text.secondary">
                      Target Win Rate: {bot.winRateTarget}
                    </Typography>
                  </Box>

                  {status && (
                    <>
                      <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <Grid container spacing={2}>
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">
                              Positions
                            </Typography>
                            <Typography variant="h6">
                              {status.performance.activePositions}
                            </Typography>
                          </Grid>
                          <Grid item xs={6}>
                            <Typography variant="body2" color="text.secondary">
                              Trades
                            </Typography>
                            <Typography variant="h6">
                              {status.performance.totalTrades}
                            </Typography>
                          </Grid>
                          <Grid item xs={12}>
                            <Typography variant="body2" color="text.secondary">
                              P/L
                            </Typography>
                            <Typography
                              variant="h5"
                              sx={{
                                color: status.performance.totalProfit >= 0 ? '#4caf50' : '#f44336',
                              }}
                            >
                              ${status.performance.totalProfit.toFixed(2)}
                            </Typography>
                          </Grid>
                        </Grid>
                      </Box>
                    </>
                  )}

                  {!status && (
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(244, 67, 54, 0.1)', borderRadius: 1 }}>
                      <Typography variant="body2" color="error">
                        Bot offline or not responding
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {/* All Positions Combined */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          All Active Positions
        </Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Strategy</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Side</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Entry</TableCell>
                <TableCell align="right">Current</TableCell>
                <TableCell align="right">P/L</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(botStatuses).map(([botName, status]) => {
                if (!status || status.positions.length === 0) return null;

                const bot = BOTS.find((b) => b.name === botName);

                return status.positions.map((position, index) => (
                  <TableRow key={`${botName}-${index}`}>
                    <TableCell>
                      <Chip
                        label={position.strategy}
                        size="small"
                        sx={{ bgcolor: bot?.color, color: 'white' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {position.symbol}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={position.side.toUpperCase()}
                        size="small"
                        color={position.side === 'long' ? 'success' : 'warning'}
                      />
                    </TableCell>
                    <TableCell align="right">{position.quantity}</TableCell>
                    <TableCell align="right">${position.entryPrice.toFixed(2)}</TableCell>
                    <TableCell align="right">${position.currentPrice.toFixed(2)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: position.pnl >= 0 ? '#4caf50' : '#f44336' }}
                    >
                      <strong>${position.pnl.toFixed(2)}</strong>
                    </TableCell>
                  </TableRow>
                ));
              })}
              {combined.totalPositions === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Typography variant="body2" color="text.secondary">
                      No active positions across all strategies
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
