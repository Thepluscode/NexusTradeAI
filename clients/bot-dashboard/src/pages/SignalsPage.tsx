import { useState } from 'react';
import SEO from '@/components/SEO';
import { useQuery } from '@tanstack/react-query';
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
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  alpha,
} from '@mui/material';
import {
  Refresh,
  TrendingUp,
  TrendingDown,
  Remove,
  CheckCircle,
} from '@mui/icons-material';
import { apiClient } from '@/services/api';

type Bot = 'stock' | 'forex' | 'crypto';

// ── Noise Report Card ─────────────────────────────────────────────────────────

function classColor(cls: string): string {
  switch (cls) {
    case 'signal': return '#10b981';
    case 'weak': return '#f59e0b';
    case 'noise': return '#ef4444';
    case 'contrarian': return '#8b5cf6';
    default: return '#6b7280';
  }
}

function NoiseReportCard({ bot }: { bot: Bot }) {
  const { data: report, isLoading, refetch } = useQuery({
    queryKey: ['noise-report', bot],
    queryFn: () => apiClient.getNoiseReport(bot),
    refetchInterval: false,
  });

  const refreshMutation = async () => {
    await apiClient.refreshNoiseReport(bot);
    refetch();
  };

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={32} /></Box>;
  if (!report) return <Alert severity="info">No noise report data yet. Need at least 10 evaluated trades.</Alert>;

  const rankings = (report.componentRankings as Array<{ name: string; ic: number; pValue: number; classification: string; significant: boolean }>) || [];
  const recommendations = (report.recommendations as string[]) || [];
  const warnings = (report.warnings as string[]) || [];

  return (
    <Paper sx={{ p: 3, bgcolor: 'rgba(22, 27, 34, 0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
          Component Rankings (IC)
        </Typography>
        <Button size="small" startIcon={<Refresh />} onClick={refreshMutation} sx={{ textTransform: 'none' }}>
          Refresh
        </Button>
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Component</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>IC</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>p-value</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>Classification</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rankings.map((r) => (
              <TableRow key={r.name}>
                <TableCell sx={{ fontWeight: 600 }}>{r.name}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: r.ic > 0 ? '#10b981' : r.ic < 0 ? '#ef4444' : '#6b7280' }}>
                  {r.ic.toFixed(3)}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: r.pValue < 0.05 ? '#10b981' : '#6b7280' }}>
                  {r.pValue.toFixed(3)}
                </TableCell>
                <TableCell align="center">
                  <Chip
                    size="small"
                    label={r.classification.toUpperCase()}
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      height: 22,
                      bgcolor: alpha(classColor(r.classification), 0.12),
                      color: classColor(r.classification),
                      border: `1px solid ${alpha(classColor(r.classification), 0.3)}`,
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {recommendations.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1, color: '#f59e0b' }}>Recommendations</Typography>
          {recommendations.map((rec, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 0.5, py: 0, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
              {rec}
            </Alert>
          ))}
        </Box>
      )}

      {warnings.length > 0 && (
        <Box sx={{ mt: 2 }}>
          {warnings.map((w, i) => (
            <Alert key={i} severity="error" sx={{ mb: 0.5, py: 0, '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
              {w}
            </Alert>
          ))}
        </Box>
      )}

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {report.tradeCount as number} trades analyzed
      </Typography>
    </Paper>
  );
}

// ── Regime Heatmap ────────────────────────────────────────────────────────────

const REGIME_COLORS: Record<string, string> = {
  trending: '#3b82f6',
  ranging: '#f59e0b',
  volatile: '#ef4444',
};

function RegimeHeatmap({ bot }: { bot: Bot }) {
  const { data, isLoading } = useQuery({
    queryKey: ['regime-heatmap', bot],
    queryFn: () => apiClient.getRegimeHeatmap(bot),
    refetchInterval: false,
  });

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={32} /></Box>;
  if (!data) return <Alert severity="info">Not enough data for regime analysis (need 30+ trades).</Alert>;

  const matrix = (data.matrix || data) as Record<string, Record<string, { ic: number; pValue: number; classification: string; n: number }>>;
  const components = Object.keys(matrix);
  const regimes = ['trending', 'ranging', 'volatile'];

  return (
    <Paper sx={{ p: 3, bgcolor: 'rgba(22, 27, 34, 0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', mb: 2 }}>
        Regime x Component IC Heatmap
      </Typography>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Component</TableCell>
              {regimes.map(r => (
                <TableCell key={r} align="center" sx={{ fontWeight: 700 }}>
                  <Chip size="small" label={r} sx={{ bgcolor: alpha(REGIME_COLORS[r], 0.15), color: REGIME_COLORS[r], fontSize: '0.7rem', fontWeight: 700, height: 22 }} />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {components.map(comp => (
              <TableRow key={comp}>
                <TableCell sx={{ fontWeight: 600 }}>{comp}</TableCell>
                {regimes.map(regime => {
                  const cell = matrix[comp]?.[regime];
                  if (!cell || cell.classification === 'insufficient_data') {
                    return <TableCell key={regime} align="center" sx={{ color: '#6b7280' }}>-</TableCell>;
                  }
                  const ic = cell.ic;
                  const bgIntensity = Math.min(Math.abs(ic) * 3, 0.3);
                  const bgColor = ic > 0 ? `rgba(16, 185, 129, ${bgIntensity})` : `rgba(239, 68, 68, ${bgIntensity})`;
                  return (
                    <Tooltip key={regime} title={`p=${cell.pValue.toFixed(3)}, n=${cell.n}`}>
                      <TableCell align="center" sx={{ bgcolor: bgColor, fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '0.85rem', color: ic > 0 ? '#10b981' : ic < 0 ? '#ef4444' : '#6b7280' }}>
                        {ic.toFixed(3)}
                      </TableCell>
                    </Tooltip>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

// ── Signal Timeline ───────────────────────────────────────────────────────────

function SignalTimeline({ bot }: { bot: Bot }) {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ['signal-timeline', bot],
    queryFn: () => apiClient.getSignalTimeline(bot, 30),
    refetchInterval: 30000,
  });

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={32} /></Box>;
  if (!timeline || timeline.length === 0) return <Alert severity="info">No recent signal data.</Alert>;

  type TimelineEntry = { time: string; symbol: string; direction: string; pnl: number; pnlPct: number; committeeScore: number; regime: string; exitReason: string };
  const entries = timeline as unknown as TimelineEntry[];

  return (
    <Paper sx={{ p: 3, bgcolor: 'rgba(22, 27, 34, 0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem', mb: 2 }}>
        Recent Signals
      </Typography>

      <TableContainer sx={{ maxHeight: 400 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Time</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Symbol</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Dir</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>P&L %</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Score</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Regime</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Exit</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entries.map((entry, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                  {entry.time ? new Date(entry.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{entry.symbol}</TableCell>
                <TableCell>
                  {entry.direction === 'long' ? <TrendingUp sx={{ color: '#10b981', fontSize: 18 }} /> :
                   entry.direction === 'short' ? <TrendingDown sx={{ color: '#ef4444', fontSize: 18 }} /> :
                   <Remove sx={{ color: '#6b7280', fontSize: 18 }} />}
                </TableCell>
                <TableCell align="right" sx={{
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600,
                  color: (entry.pnlPct || 0) > 0 ? '#10b981' : (entry.pnlPct || 0) < 0 ? '#ef4444' : '#6b7280',
                }}>
                  {((entry.pnlPct || 0) * 100).toFixed(2)}%
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                  {(entry.committeeScore || 0).toFixed(2)}
                </TableCell>
                <TableCell>
                  <Chip size="small" label={entry.regime || 'unknown'} sx={{
                    height: 20, fontSize: '0.65rem', fontWeight: 600,
                    bgcolor: alpha(REGIME_COLORS[entry.regime] || '#6b7280', 0.12),
                    color: REGIME_COLORS[entry.regime] || '#6b7280',
                  }} />
                </TableCell>
                <TableCell sx={{ fontSize: '0.75rem' }}>{entry.exitReason}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

// ── Threshold Curve ───────────────────────────────────────────────────────────

function ThresholdCurve({ bot }: { bot: Bot }) {
  const { data, isLoading } = useQuery({
    queryKey: ['threshold-curve', bot],
    queryFn: () => apiClient.getThresholdCurve(bot),
    refetchInterval: false,
  });

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={32} /></Box>;
  if (!data) return <Alert severity="info">No threshold sweep data. Run CLI: node services/backtesting-js/cli.js --bot {bot} --sweep-threshold</Alert>;

  type SweepRow = { threshold: number; totalTrades: number; winRate: number; profitFactor: number; sharpe: number; netPnl: number };
  const results = (data.results || []) as SweepRow[];
  const optimal = data.optimal as number;

  return (
    <Paper sx={{ p: 3, bgcolor: 'rgba(22, 27, 34, 0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
          Threshold Sweep
        </Typography>
        {optimal && (
          <Chip
            label={`Optimal: ${optimal}`}
            size="small"
            sx={{ bgcolor: alpha('#10b981', 0.12), color: '#10b981', fontWeight: 700 }}
          />
        )}
      </Box>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Threshold</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Trades</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Win %</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>PF</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Sharpe</TableCell>
              <TableCell align="right" sx={{ fontWeight: 700 }}>Net P&L</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {results.map((row) => (
              <TableRow key={row.threshold} sx={{ bgcolor: row.threshold === optimal ? alpha('#10b981', 0.06) : 'transparent' }}>
                <TableCell sx={{ fontWeight: row.threshold === optimal ? 700 : 400 }}>
                  {row.threshold.toFixed(2)}
                  {row.threshold === optimal && <CheckCircle sx={{ ml: 0.5, fontSize: 14, color: '#10b981' }} />}
                </TableCell>
                <TableCell align="right">{row.totalTrades}</TableCell>
                <TableCell align="right">{(row.winRate * 100).toFixed(0)}%</TableCell>
                <TableCell align="right">{row.profitFactor.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: row.sharpe > 1 ? '#10b981' : row.sharpe > 0 ? '#f59e0b' : '#ef4444' }}>
                  {row.sharpe.toFixed(2)}
                </TableCell>
                <TableCell align="right" sx={{ color: row.netPnl > 0 ? '#10b981' : '#ef4444' }}>
                  {row.netPnl.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SignalsPage() {
  const [bot, setBot] = useState<Bot>('stock');

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      <SEO title="Signal Intelligence" description="Signal vs noise analysis for trading components" />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
          Signal Intelligence
        </Typography>
        <ToggleButtonGroup
          value={bot}
          exclusive
          onChange={(_, v) => v && setBot(v as Bot)}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              textTransform: 'none', px: 2, fontWeight: 600,
              '&.Mui-selected': { bgcolor: alpha('#3b82f6', 0.15), color: '#3b82f6' },
            },
          }}
        >
          <ToggleButton value="stock">Stock</ToggleButton>
          <ToggleButton value="forex">Forex</ToggleButton>
          <ToggleButton value="crypto">Crypto</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} lg={6}>
          <NoiseReportCard bot={bot} />
        </Grid>
        <Grid item xs={12} lg={6}>
          <RegimeHeatmap bot={bot} />
        </Grid>
        <Grid item xs={12}>
          <SignalTimeline bot={bot} />
        </Grid>
        <Grid item xs={12}>
          <ThresholdCurve bot={bot} />
        </Grid>
      </Grid>
    </Box>
  );
}
