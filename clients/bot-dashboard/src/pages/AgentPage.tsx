import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import {
  Box, Paper, Typography, Grid, Card, CardContent,
  Button, Chip, Alert, Skeleton, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  LinearProgress, Tooltip, alpha,
} from '@mui/material';
import {
  SmartToy, PlayArrow, Stop, Refresh, Psychology,
  TrendingUp, Shield, Speed, Storage,
  CheckCircle, Cancel,
} from '@mui/icons-material';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip as RechartsTooltip, Cell,
} from 'recharts';
import toast from 'react-hot-toast';
import { apiClient } from '../services/api';
import type {
  AgentStats, BanditContextSummary,
  AgentKillSwitchStatus, AgentClaudeStats,
} from '../types';

function MetricBox({ label, value, color = '#3b82f6', icon }: {
  label: string; value: string | number; color?: string; icon?: React.ReactNode;
}) {
  return (
    <Card sx={{ bgcolor: alpha(color, 0.08), border: `1px solid ${alpha(color, 0.2)}` }}>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          {icon}
          <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.65rem', letterSpacing: 1 }}>
            {label}
          </Typography>
        </Box>
        <Typography variant="h5" sx={{ color, fontWeight: 700 }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

function KillSwitchCard({ killSwitch, onKill, onResume, isKilling, isResuming }: {
  killSwitch: AgentKillSwitchStatus;
  onKill: () => void;
  onResume: () => void;
  isKilling: boolean;
  isResuming: boolean;
}) {
  const killed = killSwitch?.killed;
  return (
    <Paper sx={{
      p: 2, border: `1px solid ${killed ? '#ef4444' : '#22c55e'}40`,
      bgcolor: killed ? alpha('#ef4444', 0.05) : alpha('#22c55e', 0.05),
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Shield sx={{ color: killed ? '#ef4444' : '#22c55e' }} />
          <Typography variant="subtitle1" fontWeight={600}>Kill Switch</Typography>
        </Box>
        <Chip
          label={killed ? 'KILLED' : 'ACTIVE'}
          size="small"
          sx={{
            bgcolor: killed ? '#ef4444' : '#22c55e',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.7rem',
          }}
        />
      </Box>
      {killed && killSwitch.reason && (
        <Alert severity="error" sx={{ mb: 1, py: 0 }}>
          {killSwitch.reason}
        </Alert>
      )}
      <Typography variant="caption" color="text.secondary">
        Consecutive errors: {killSwitch?.consecutive_errors || 0} / Auto-kill at {((killSwitch?.auto_kill_threshold || 0.15) * 100).toFixed(0)}% drawdown
      </Typography>
      <Box sx={{ mt: 1.5, display: 'flex', gap: 1 }}>
        {killed ? (
          <Button
            variant="contained"
            size="small"
            color="success"
            startIcon={<PlayArrow />}
            onClick={onResume}
            disabled={isResuming}
          >
            {isResuming ? 'Resuming...' : 'Resume Agent'}
          </Button>
        ) : (
          <Button
            variant="contained"
            size="small"
            color="error"
            startIcon={<Stop />}
            onClick={onKill}
            disabled={isKilling}
          >
            {isKilling ? 'Killing...' : 'Kill Switch'}
          </Button>
        )}
      </Box>
    </Paper>
  );
}

function ClaudeCard({ claude }: { claude: AgentClaudeStats }) {
  if (!claude) return null;
  const hourlyPct = claude.hourly_limit ? (claude.hourly_calls / claude.hourly_limit) * 100 : 0;
  const dailyPct = claude.daily_budget ? (claude.daily_calls / claude.daily_budget) * 100 : 0;
  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Psychology sx={{ color: '#8b5cf6' }} />
        <Typography variant="subtitle1" fontWeight={600}>Claude AI</Typography>
        <Chip
          label={claude.available ? 'ONLINE' : 'OFFLINE'}
          size="small"
          sx={{
            bgcolor: claude.available ? '#22c55e' : '#ef4444',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.65rem',
            ml: 'auto',
          }}
        />
      </Box>
      <Typography variant="caption" color="text.secondary">{claude.model}</Typography>
      <Box sx={{ mt: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption">Hourly: {claude.hourly_calls}/{claude.hourly_limit}</Typography>
          <Typography variant="caption">{claude.hourly_remaining} remaining</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(hourlyPct, 100)}
          sx={{ height: 6, borderRadius: 3, bgcolor: alpha('#8b5cf6', 0.15), '& .MuiLinearProgress-bar': { bgcolor: '#8b5cf6' } }}
        />
      </Box>
      <Box sx={{ mt: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="caption">Daily: {claude.daily_calls}/{claude.daily_budget}</Typography>
          <Typography variant="caption">{claude.daily_remaining} remaining</Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={Math.min(dailyPct, 100)}
          sx={{ height: 6, borderRadius: 3, bgcolor: alpha('#3b82f6', 0.15), '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6' } }}
        />
      </Box>
    </Paper>
  );
}

function BanditContextsTable({ contexts }: { contexts: Record<string, BanditContextSummary> }) {
  const rows = Object.entries(contexts || {}).map(([key, val]) => {
    const [regime, asset, tier] = key.split(':');
    return { key, regime, asset, tier, ...val };
  }).sort((a, b) => b.total_pulls - a.total_pulls);

  if (rows.length === 0) {
    return <Alert severity="info" sx={{ mt: 1 }}>No contexts learned yet. Run backfill or wait for trades.</Alert>;
  }

  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Regime</TableCell>
            <TableCell>Asset</TableCell>
            <TableCell>Tier</TableCell>
            <TableCell align="center">Best Arm</TableCell>
            <TableCell align="right">Mean</TableCell>
            <TableCell align="right">Trades</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.key} hover>
              <TableCell>
                <Chip label={row.regime} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              </TableCell>
              <TableCell>{row.asset}</TableCell>
              <TableCell>{row.tier}</TableCell>
              <TableCell align="center">
                <Chip
                  label={row.best_arm}
                  size="small"
                  sx={{
                    bgcolor: row.best_arm === 'aggressive' ? alpha('#f59e0b', 0.15) :
                             row.best_arm === 'conservative' ? alpha('#3b82f6', 0.15) :
                             row.best_arm === 'skip' ? alpha('#ef4444', 0.15) :
                             alpha('#22c55e', 0.15),
                    color: row.best_arm === 'aggressive' ? '#f59e0b' :
                           row.best_arm === 'conservative' ? '#3b82f6' :
                           row.best_arm === 'skip' ? '#ef4444' : '#22c55e',
                    fontWeight: 600,
                    fontSize: '0.7rem',
                  }}
                />
              </TableCell>
              <TableCell align="right" sx={{ fontFamily: 'monospace' }}>
                {(row.best_arm_mean * 100).toFixed(1)}%
              </TableCell>
              <TableCell align="right">{row.total_pulls}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function BanditChart({ contexts }: { contexts: Record<string, BanditContextSummary> }) {
  const data = Object.entries(contexts || {}).map(([key, val]) => ({
    name: key.split(':').slice(0, 2).join(' '),
    mean: +(val.best_arm_mean * 100).toFixed(1),
    pulls: val.total_pulls,
    arm: val.best_arm,
  })).sort((a, b) => b.pulls - a.pulls).slice(0, 12);

  if (data.length === 0) return null;

  const armColors: Record<string, string> = {
    conservative: '#3b82f6',
    moderate: '#22c55e',
    aggressive: '#f59e0b',
    skip: '#ef4444',
  };

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#999' }} angle={-20} textAnchor="end" height={50} />
        <YAxis tick={{ fontSize: 10, fill: '#999' }} domain={[0, 100]} />
        <RechartsTooltip
          contentStyle={{ background: '#1e1e2e', border: '1px solid #333', borderRadius: 8 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, _name: any, entry: any) => [
            `${value}% (${entry?.payload?.arm || ''}, ${entry?.payload?.pulls || 0} trades)`,
            'Confidence',
          ]}
        />
        <Bar dataKey="mean" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={armColors[entry.arm] || '#8b5cf6'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function AgentPage() {
  const queryClient = useQueryClient();
  const [backfillRunning, setBackfillRunning] = useState(false);

  const { data: stats, isLoading } = useQuery<AgentStats>(
    'agentStats',
    () => apiClient.getAgentStats() as unknown as Promise<AgentStats>,
    { refetchInterval: 15000, staleTime: 10000 }
  );

  const killMutation = useMutation(
    () => apiClient.agentKill('Manual kill from dashboard'),
    {
      onSuccess: () => { toast.success('Agent killed'); queryClient.invalidateQueries('agentStats'); },
      onError: (e: Error) => { toast.error(e.message); },
    }
  );

  const resumeMutation = useMutation(
    () => apiClient.agentResume(),
    {
      onSuccess: () => { toast.success('Agent resumed'); queryClient.invalidateQueries('agentStats'); },
      onError: (e: Error) => { toast.error(e.message); },
    }
  );

  const handleBackfill = async () => {
    setBackfillRunning(true);
    try {
      const result = await apiClient.agentBackfill(500, 90);
      const processed = (result as Record<string, number>).trades_processed || 0;
      toast.success(`Backfill complete: ${processed} trades processed`);
      queryClient.invalidateQueries('agentStats');
    } catch (e) {
      toast.error((e as Error).message);
    }
    setBackfillRunning(false);
  };

  const handleTrain = async () => {
    try {
      await apiClient.agentDailyTraining();
      toast.success('Training complete');
      queryClient.invalidateQueries('agentStats');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const orch = stats?.orchestrator;
  const claude = stats?.claude;
  const killSwitch = stats?.kill_switch;
  const bandit = stats?.supervisor_bandit;
  const outcomeStore = stats?.outcome_store;
  const decisionAgent = stats?.decision_agent;

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Skeleton variant="rectangular" height={60} sx={{ mb: 2, borderRadius: 2 }} />
        <Grid container spacing={2}>
          {[1,2,3,4,5,6].map(i => (
            <Grid item xs={6} md={4} lg={2} key={i}>
              <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SmartToy sx={{ fontSize: 32, color: '#8b5cf6' }} />
          <Box>
            <Typography variant="h5" fontWeight={700}>Agent System</Typography>
            <Typography variant="caption" color="text.secondary">
              Multi-agent pipeline with supervisor bandit
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title="Backfill historical trades into learning system">
            <Button
              variant="outlined"
              size="small"
              startIcon={<Storage />}
              onClick={handleBackfill}
              disabled={backfillRunning}
            >
              {backfillRunning ? 'Backfilling...' : 'Backfill'}
            </Button>
          </Tooltip>
          <Tooltip title="Run daily training (backfill + bandit train)">
            <Button
              variant="outlined"
              size="small"
              startIcon={<Refresh />}
              onClick={handleTrain}
            >
              Train
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* Top Metrics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={4} lg={2}>
          <MetricBox
            label="Evaluations"
            value={orch?.total_evaluations || 0}
            color="#3b82f6"
            icon={<Speed sx={{ fontSize: 16, color: '#3b82f6' }} />}
          />
        </Grid>
        <Grid item xs={6} md={4} lg={2}>
          <MetricBox
            label="Approved"
            value={orch?.total_approvals || 0}
            color="#22c55e"
            icon={<CheckCircle sx={{ fontSize: 16, color: '#22c55e' }} />}
          />
        </Grid>
        <Grid item xs={6} md={4} lg={2}>
          <MetricBox
            label="Rejected"
            value={orch?.total_rejections || 0}
            color="#ef4444"
            icon={<Cancel sx={{ fontSize: 16, color: '#ef4444' }} />}
          />
        </Grid>
        <Grid item xs={6} md={4} lg={2}>
          <MetricBox
            label="Approval Rate"
            value={orch?.approval_rate || '0%'}
            color="#f59e0b"
            icon={<TrendingUp sx={{ fontSize: 16, color: '#f59e0b' }} />}
          />
        </Grid>
        <Grid item xs={6} md={4} lg={2}>
          <MetricBox
            label="Avg Latency"
            value={`${orch?.avg_latency_ms || 0}ms`}
            color="#8b5cf6"
            icon={<Speed sx={{ fontSize: 16, color: '#8b5cf6' }} />}
          />
        </Grid>
        <Grid item xs={6} md={4} lg={2}>
          <MetricBox
            label="Rewards"
            value={outcomeStore?.total_rewards_calculated || 0}
            color="#ec4899"
            icon={<TrendingUp sx={{ fontSize: 16, color: '#ec4899' }} />}
          />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        {/* Left column */}
        <Grid item xs={12} md={4}>
          {/* Kill Switch */}
          {killSwitch && (
            <KillSwitchCard
              killSwitch={killSwitch}
              onKill={() => killMutation.mutate()}
              onResume={() => resumeMutation.mutate()}
              isKilling={killMutation.isLoading}
              isResuming={resumeMutation.isLoading}
            />
          )}

          {/* Claude AI */}
          <Box sx={{ mt: 2 }}>
            {claude && <ClaudeCard claude={claude} />}
          </Box>

          {/* Outcome Store */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <Storage sx={{ color: '#ec4899' }} />
              <Typography variant="subtitle1" fontWeight={600}>Outcome Store</Typography>
              <Chip
                label={outcomeStore?.db_available ? 'DB' : 'JSONL'}
                size="small"
                variant="outlined"
                sx={{ ml: 'auto', fontSize: '0.65rem' }}
              />
            </Box>
            <Grid container spacing={1}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Decisions</Typography>
                <Typography variant="body2" fontWeight={600}>{outcomeStore?.total_decisions_logged || 0}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Outcomes</Typography>
                <Typography variant="body2" fontWeight={600}>{outcomeStore?.total_outcomes_logged || 0}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Rewards</Typography>
                <Typography variant="body2" fontWeight={600}>{outcomeStore?.total_rewards_calculated || 0}</Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">Decision Agent</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {decisionAgent?.total_approvals || 0}/{decisionAgent?.total_decisions || 0}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Right column — Bandit */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              <Psychology sx={{ color: '#f59e0b' }} />
              <Typography variant="subtitle1" fontWeight={600}>Supervisor Bandit</Typography>
              <Chip
                label={`${bandit?.total_contexts || 0} contexts`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.65rem' }}
              />
              <Chip
                label={`${bandit?.total_updates || 0} updates`}
                size="small"
                variant="outlined"
                sx={{ fontSize: '0.65rem' }}
              />
            </Box>

            {/* Bandit Chart */}
            {bandit?.contexts && Object.keys(bandit.contexts).length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Confidence by Context (colored by selected arm)
                </Typography>
                <BanditChart contexts={bandit.contexts} />
              </Box>
            )}

            <Divider sx={{ my: 1.5 }} />

            {/* Contexts Table */}
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Learned Contexts</Typography>
            <BanditContextsTable contexts={bandit?.contexts || {}} />
          </Paper>

          {/* Arms Legend */}
          <Paper sx={{ p: 2, mt: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Strategy Arms</Typography>
            <Grid container spacing={1}>
              {[
                { name: 'Conservative', color: '#3b82f6', desc: 'Size ≤ 0.75x, conviction ≥ 55%' },
                { name: 'Moderate', color: '#22c55e', desc: 'Size ≤ 1.0x, conviction ≥ 40%' },
                { name: 'Aggressive', color: '#f59e0b', desc: 'Size ≤ 1.5x, conviction ≥ 30%' },
                { name: 'Skip', color: '#ef4444', desc: 'Do not trade in this context' },
              ].map(arm => (
                <Grid item xs={6} md={3} key={arm.name}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: arm.color }} />
                    <Typography variant="caption" fontWeight={600}>{arm.name}</Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                    {arm.desc}
                  </Typography>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
