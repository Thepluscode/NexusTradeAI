import { useQuery } from 'react-query';
import {
    Box,
    Paper,
    Typography,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Tooltip,
} from '@mui/material';
import { SmartToy, CheckCircle, Cancel } from '@mui/icons-material';
import { apiClient } from '@/services/api';

interface Props {
    assetClass?: 'stock' | 'forex' | 'crypto';
    limit?: number;
}

export default function AgentDecisionsCard({ assetClass, limit = 10 }: Props) {
    const { data: statsData } = useQuery(
        'agentStats',
        () => apiClient.getAgentStats(),
        { staleTime: 15000, refetchInterval: 30000 }
    );

    const { data: decisionsData, isLoading } = useQuery(
        ['agentDecisions', limit],
        () => apiClient.getAgentDecisions(50),
        { staleTime: 15000, refetchInterval: 30000 }
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stats: Record<string, any> = statsData || {};
    const orch = stats.orchestrator || {};
    const claude = stats.claude || {};
    const killSwitch = stats.kill_switch || {};

    // Filter decisions by asset class if specified
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let decisions: any[] = decisionsData?.decisions || [];
    if (assetClass) {
        decisions = decisions.filter((d: { asset_class: string }) => d.asset_class === assetClass);
    }
    decisions = decisions.slice(0, limit);

    const fmtTime = (ts: string) => {
        try {
            const d = new Date(ts);
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch { return '—'; }
    };

    return (
        <Paper sx={{ p: 2, mb: 3, border: '1px solid', borderColor: 'rgba(139, 92, 246, 0.3)', background: 'rgba(139, 92, 246, 0.03)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <SmartToy sx={{ color: '#8b5cf6', fontSize: 22 }} />
                <Typography variant="h6" fontWeight={600}>
                    Agentic AI Pipeline
                </Typography>
                <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
                    {killSwitch.killed && (
                        <Chip label="KILL SWITCH" size="small" color="error" />
                    )}
                    <Chip
                        label={claude.available ? `Claude ${claude.daily_calls || 0}/${claude.daily_budget || 200}` : 'Claude OFF'}
                        size="small"
                        color={claude.available ? 'success' : 'default'}
                        variant="outlined"
                        sx={{ fontSize: '0.7rem' }}
                    />
                </Box>
            </Box>

            {/* Mini stats row */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
                gap: 1,
                mb: 1.5,
                p: 1,
                borderRadius: 1.5,
                bgcolor: 'background.default',
            }}>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Evaluations</Typography>
                    <Typography variant="body2" fontWeight={700}>{orch.total_evaluations || 0}</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Approved</Typography>
                    <Typography variant="body2" fontWeight={700} color="success.main">{orch.total_approvals || 0}</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Rejected</Typography>
                    <Typography variant="body2" fontWeight={700} color="error.main">{orch.total_rejections || 0}</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Approval %</Typography>
                    <Typography variant="body2" fontWeight={700}>{orch.approval_rate || '0%'}</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Avg Latency</Typography>
                    <Typography variant="body2" fontWeight={700}>{orch.avg_latency_ms || 0}ms</Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary" display="block">Patterns</Typography>
                    <Typography variant="body2" fontWeight={700}>{stats.scan_engine?.total_patterns || 0}</Typography>
                </Box>
            </Box>

            {/* Recent decisions table */}
            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={20} />
                </Box>
            ) : decisions.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                    No agent decisions yet. Waiting for first signal evaluation...
                </Typography>
            ) : (
                <TableContainer sx={{ maxHeight: 300 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ py: 0.5 }}>Time</TableCell>
                                <TableCell sx={{ py: 0.5 }}>Symbol</TableCell>
                                <TableCell sx={{ py: 0.5 }}>Decision</TableCell>
                                <TableCell sx={{ py: 0.5 }} align="right">Conf</TableCell>
                                <TableCell sx={{ py: 0.5 }}>Reason</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {decisions.map((d: {
                                timestamp: string; symbol: string; approved: boolean;
                                confidence: number; reason: string; source: string;
                                risk_flags: string | string[]; direction: string;
                            }, idx: number) => {
                                let flags: string[] = [];
                                if (typeof d.risk_flags === 'string') {
                                    try { flags = JSON.parse(d.risk_flags || '[]'); } catch { flags = []; }
                                } else {
                                    flags = d.risk_flags || [];
                                }
                                return (
                                    <TableRow key={idx} hover sx={{ opacity: d.approved ? 1 : 0.7 }}>
                                        <TableCell sx={{ py: 0.5, whiteSpace: 'nowrap' }}>
                                            <Typography variant="caption">{fmtTime(d.timestamp)}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ py: 0.5 }}>
                                            <Typography variant="body2" fontWeight={600}>{d.symbol}</Typography>
                                        </TableCell>
                                        <TableCell sx={{ py: 0.5 }}>
                                            {d.approved ? (
                                                <Chip icon={<CheckCircle sx={{ fontSize: 14 }} />} label="GO" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                                            ) : (
                                                <Chip icon={<Cancel sx={{ fontSize: 14 }} />} label="NO" size="small" color="error" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                                            )}
                                        </TableCell>
                                        <TableCell sx={{ py: 0.5 }} align="right">
                                            <Typography
                                                variant="caption"
                                                fontWeight={600}
                                                color={d.confidence >= 0.7 ? 'success.main' : d.confidence >= 0.5 ? 'warning.main' : 'error.main'}
                                            >
                                                {(d.confidence * 100).toFixed(0)}%
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ py: 0.5, maxWidth: 200 }}>
                                            <Tooltip title={flags.length > 0 ? `Flags: ${flags.join(', ')}` : ''}>
                                                <Typography variant="caption" color="text.secondary" noWrap>
                                                    {(d.reason || '').slice(0, 60)}{(d.reason || '').length > 60 ? '...' : ''}
                                                </Typography>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}
        </Paper>
    );
}
