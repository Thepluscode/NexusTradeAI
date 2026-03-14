import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Paper, Typography, Button, TextField, Chip, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem,
    LinearProgress, Alert, Snackbar, Tooltip, Divider, InputLabel, FormControl,
} from '@mui/material';
import {
    VpnKey, ContentCopy, Delete, Add,
    CheckCircle, Visibility, VisibilityOff, Code,
} from '@mui/icons-material';
import { apiClient } from '@/services/api';

// ── Types ──────────────────────────────────────────────────────────────

interface APIKey {
    id: number;
    prefix: string;
    name: string;
    tier: string;
    rate_limit: number;
    calls_today: number;
    calls_month: number;
    last_used_at: string | null;
    is_active: boolean;
    created_at: string;
}

interface UsageSummary {
    calls_today: number;
    calls_month: number;
    monthly_limit: number;
    active_keys: number;
}

// ── Tier Config ────────────────────────────────────────────────────────

const TIERS = [
    { id: 'free', label: 'Free', limit: 100, price: '$0', color: '#6b7280' },
    { id: 'pro', label: 'Pro', limit: 5000, price: '$49/mo', color: '#3b82f6' },
    { id: 'enterprise', label: 'Enterprise', limit: 999999, price: '$499/mo', color: '#8b5cf6' },
];

// ── Main Page ──────────────────────────────────────────────────────────

export default function APIPage() {
    const qc = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKeyTier, setNewKeyTier] = useState('free');
    const [createdKey, setCreatedKey] = useState<string | null>(null);
    const [showKey, setShowKey] = useState(false);
    const [copied, setCopied] = useState(false);
    // Handle Stripe checkout return — compute initial snack from URL params (no setState in effect)
    const [snack, setSnack] = useState(() => {
        const checkout = new URLSearchParams(window.location.search).get('checkout');
        if (checkout === 'success') return 'Subscription activated! Your API keys are being upgraded.';
        if (checkout === 'cancelled') return 'Checkout cancelled';
        return '';
    });
    useEffect(() => {
        const checkout = new URLSearchParams(window.location.search).get('checkout');
        if (!checkout) return;
        if (checkout === 'success') {
            qc.invalidateQueries({ queryKey: ['apiKeys'] });
            qc.invalidateQueries({ queryKey: ['apiUsage'] });
        }
        window.history.replaceState({}, '', '/api');
    }, [qc]);

    // Fetch keys + usage
    const { data: keysData } = useQuery({
        queryKey: ['apiKeys'],
        queryFn: () => apiClient.getAPIKeys(),
        staleTime: 30000, refetchInterval: 60000,
    });
    const { data: usage } = useQuery({
        queryKey: ['apiUsage'],
        queryFn: () => apiClient.getAPIUsage(),
        staleTime: 30000, refetchInterval: 60000,
    });

    const keys = (keysData?.keys || []) as unknown as APIKey[];
    const usageSummary = (usage || { calls_today: 0, calls_month: 0, monthly_limit: 100, active_keys: 0 }) as unknown as UsageSummary;
    const usagePct = usageSummary.monthly_limit > 0
        ? Math.min(100, (usageSummary.calls_month / usageSummary.monthly_limit) * 100)
        : 0;

    // Create key mutation
    const createMutation = useMutation({
        mutationFn: () => apiClient.createAPIKey(newKeyName || 'default', newKeyTier),
        onSuccess: (data) => {
            setCreatedKey(data.key as string);
            setShowKey(true);
            setNewKeyName('');
            qc.invalidateQueries({ queryKey: ['apiKeys'] });
            qc.invalidateQueries({ queryKey: ['apiUsage'] });
        },
        onError: () => setSnack('Failed to create API key'),
    });

    // Revoke key mutation
    const revokeMutation = useMutation({
        mutationFn: (keyId: number) => apiClient.revokeAPIKey(keyId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['apiKeys'] });
            setSnack('Key revoked');
        },
    });

    // Stripe checkout mutation
    const upgradeMutation = useMutation({
        mutationFn: (tier: 'pro' | 'enterprise') => apiClient.createCheckout(tier),
        onSuccess: (data) => {
            if (data.checkout_url) {
                window.location.href = data.checkout_url;
            } else {
                setSnack('Failed to create checkout session');
            }
        },
        onError: () => setSnack('Billing not configured yet — contact support'),
        }
    );

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const tierColor = (tier: string) => TIERS.find(t => t.id === tier)?.color || '#6b7280';

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>
                        API Access
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Evaluate trade signals programmatically with AI
                    </Typography>
                </Box>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => setCreateOpen(true)}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                >
                    Create Key
                </Button>
            </Box>

            {/* Usage Overview Cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Today</Typography>
                    <Typography variant="h5" fontWeight={700}>{usageSummary.calls_today}</Typography>
                </Paper>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">This Month</Typography>
                    <Typography variant="h5" fontWeight={700}>{usageSummary.calls_month}</Typography>
                </Paper>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Monthly Limit</Typography>
                    <Typography variant="h5" fontWeight={700}>{usageSummary.monthly_limit.toLocaleString()}</Typography>
                </Paper>
                <Paper sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">Active Keys</Typography>
                    <Typography variant="h5" fontWeight={700}>{usageSummary.active_keys}</Typography>
                </Paper>
            </Box>

            {/* Usage Bar */}
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" fontWeight={600}>Monthly Usage</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {usageSummary.calls_month} / {usageSummary.monthly_limit.toLocaleString()}
                    </Typography>
                </Box>
                <LinearProgress
                    variant="determinate"
                    value={usagePct}
                    sx={{
                        height: 8, borderRadius: 4,
                        bgcolor: 'rgba(255,255,255,0.06)',
                        '& .MuiLinearProgress-bar': {
                            borderRadius: 4,
                            background: usagePct > 80
                                ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                                : 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                        },
                    }}
                />
                {usagePct > 80 && (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                        Approaching monthly limit. Upgrade to Pro for 5,000 calls/month.
                    </Alert>
                )}
            </Paper>

            {/* API Keys Table */}
            <Paper sx={{ mb: 3 }}>
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <VpnKey sx={{ color: '#8b5cf6' }} />
                    <Typography variant="h6" fontWeight={600}>API Keys</Typography>
                </Box>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Name</TableCell>
                                <TableCell>Key</TableCell>
                                <TableCell>Tier</TableCell>
                                <TableCell align="right">Today</TableCell>
                                <TableCell align="right">Month</TableCell>
                                <TableCell>Last Used</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {keys.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                                        No API keys yet. Create one to get started.
                                    </TableCell>
                                </TableRow>
                            ) : keys.map((k) => (
                                <TableRow key={k.id} sx={{ opacity: k.is_active ? 1 : 0.5 }}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={600}>{k.name}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                {k.prefix}
                                            </Typography>
                                            <Tooltip title="Copy prefix">
                                                <IconButton size="small" onClick={() => handleCopy(k.prefix)}>
                                                    <ContentCopy sx={{ fontSize: 14 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={k.tier.toUpperCase()}
                                            size="small"
                                            sx={{
                                                bgcolor: `${tierColor(k.tier)}20`,
                                                color: tierColor(k.tier),
                                                fontWeight: 700,
                                                fontSize: '0.7rem',
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell align="right">{k.calls_today}</TableCell>
                                    <TableCell align="right">
                                        {k.calls_month} / {k.rate_limit.toLocaleString()}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption" color="text.secondary">
                                            {k.last_used_at
                                                ? new Date(k.last_used_at).toLocaleDateString()
                                                : 'Never'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="center">
                                        {k.is_active ? (
                                            <Tooltip title="Revoke key">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={() => revokeMutation.mutate(k.id)}
                                                >
                                                    <Delete sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </Tooltip>
                                        ) : (
                                            <Chip label="Revoked" size="small" color="error" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Pricing Section */}
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Pricing</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 4 }}>
                {TIERS.map((tier) => (
                    <Paper
                        key={tier.id}
                        sx={{
                            p: 3,
                            border: '1px solid',
                            borderColor: tier.id === 'pro' ? tier.color : 'divider',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        {tier.id === 'pro' && (
                            <Chip
                                label="RECOMMENDED"
                                size="small"
                                sx={{
                                    position: 'absolute', top: 12, right: 12,
                                    bgcolor: `${tier.color}20`, color: tier.color,
                                    fontWeight: 700, fontSize: '0.6rem',
                                }}
                            />
                        )}
                        <Typography variant="h6" fontWeight={700} sx={{ color: tier.color }}>
                            {tier.label}
                        </Typography>
                        <Typography variant="h4" fontWeight={800} sx={{ my: 1 }}>
                            {tier.price}
                        </Typography>
                        <Divider sx={{ my: 2 }} />
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                                <Typography variant="body2">{tier.limit.toLocaleString()} evaluations/month</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                                <Typography variant="body2">All asset classes (stock, forex, crypto)</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                                <Typography variant="body2">AI reasoning + risk flags</Typography>
                            </Box>
                            {tier.id !== 'free' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />
                                    <Typography variant="body2">
                                        {tier.id === 'enterprise' ? 'Priority support + SLA' : 'Learning from your trades'}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                        <Button
                            fullWidth
                            variant={tier.id === 'pro' ? 'contained' : 'outlined'}
                            sx={{ mt: 3, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                            disabled={tier.id === 'free' || upgradeMutation.isPending}
                            onClick={() => tier.id !== 'free' && upgradeMutation.mutate(tier.id as 'pro' | 'enterprise')}
                        >
                            {tier.id === 'free' ? 'Current Plan' : upgradeMutation.isPending ? 'Loading...' : `Subscribe — ${tier.price}`}
                        </Button>
                    </Paper>
                ))}
            </Box>

            {/* Quick Start Code Example */}
            <Paper sx={{ p: 3, mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Code sx={{ color: '#3b82f6' }} />
                    <Typography variant="h6" fontWeight={600}>Quick Start</Typography>
                </Box>
                <Paper sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2, fontFamily: 'monospace', fontSize: '0.8rem', overflow: 'auto' }}>
                    <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', color: '#e6edf3' }}>
{`curl -X POST https://nexus-strategy-bridge-production.up.railway.app/api/v1/evaluate \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{
    "symbol": "AAPL",
    "direction": "long",
    "asset_class": "stock",
    "price": 185.50,
    "rsi": 58.3,
    "momentum_pct": 2.8,
    "volume_ratio": 1.5,
    "regime": "trending_up"
  }'`}
                    </Box>
                </Paper>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Response includes <code>should_enter</code>, <code>confidence</code>, <code>reason</code>, and <code>risk_flags</code>.
                    Average latency: ~8 seconds.
                </Typography>
            </Paper>

            {/* Create Key Dialog */}
            <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                    <TextField
                        label="Key Name"
                        placeholder="e.g. my-trading-bot"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        fullWidth
                        size="small"
                    />
                    <FormControl size="small" fullWidth>
                        <InputLabel>Tier</InputLabel>
                        <Select value={newKeyTier} label="Tier" onChange={(e) => setNewKeyTier(e.target.value)}>
                            {TIERS.map(t => (
                                <MenuItem key={t.id} value={t.id}>
                                    {t.label} — {t.limit.toLocaleString()} calls/mo ({t.price})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={() => { createMutation.mutate(); setCreateOpen(false); }}
                        disabled={createMutation.isPending}
                    >
                        Create
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Created Key Dialog (show once) */}
            <Dialog open={!!createdKey} maxWidth="sm" fullWidth>
                <DialogTitle>API Key Created</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Copy this key now. It will not be shown again.
                    </Alert>
                    <Paper sx={{
                        p: 2, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 2,
                        display: 'flex', alignItems: 'center', gap: 1,
                    }}>
                        <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}
                        >
                            {showKey ? createdKey : '••••••••••••••••••••••••••••••••••••••••'}
                        </Typography>
                        <IconButton size="small" onClick={() => setShowKey(!showKey)}>
                            {showKey ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                        </IconButton>
                        <IconButton size="small" onClick={() => createdKey && handleCopy(createdKey)}>
                            <ContentCopy sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Paper>
                </DialogContent>
                <DialogActions>
                    <Button
                        variant="contained"
                        onClick={() => { setCreatedKey(null); setShowKey(false); }}
                    >
                        I&apos;ve saved my key
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={copied || !!snack}
                autoHideDuration={2000}
                onClose={() => { setCopied(false); setSnack(''); }}
                message={copied ? 'Copied to clipboard' : snack}
            />
        </Box>
    );
}
