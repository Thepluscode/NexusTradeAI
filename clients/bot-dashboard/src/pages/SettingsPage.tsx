import React, { useState } from 'react';
import SEO from '@/components/SEO';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Slider,
    Chip,
    Divider,
    CircularProgress,
    Alert,
    Button,
    Stack,
    Avatar,
    TextField,
    InputAdornment,
    LinearProgress,
    IconButton,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    Switch,
    FormControlLabel,
    Tabs,
    Tab,
} from '@mui/material';
import {
    FlashOn,
    ScienceOutlined,
    CheckCircle,
    ErrorOutline,
    Notifications,
    PhoneAndroid,
    ShowChart,
    CurrencyExchange,
    CurrencyBitcoin,
    AccountBalanceWallet,
    AddCircleOutline,
    RemoveCircleOutline,
    OpenInNew,
    Visibility,
    VisibilityOff,
    Save,
    Send,
    WarningAmber,
    Logout,
} from '@mui/icons-material';
import { alpha } from '@mui/material/styles';
import { useAuth } from '@/hooks/useAuth';
import axios from 'axios';
import { SERVICE_URLS } from '@/services/api';
import toast from 'react-hot-toast';

const API_BASE = SERVICE_URLS.stockBot;

// Auth header for protected config-write endpoints.
// VITE_NEXUS_API_SECRET is kept for backward-compat with non-credential endpoints (risk, mode).
const API_SECRET = import.meta.env.VITE_NEXUS_API_SECRET || '';
const authHeaders = API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {};

// JWT auth headers for per-user endpoints (credentials)
// Uses the logged-in user's JWT token so credentials are stored per-user in the DB
function getJwtHeaders(): Record<string, string> {
    const token = localStorage.getItem('nexus_access_token');
    if (token) return { Authorization: `Bearer ${token}` };
    // Fall back to API secret if user is not logged in (shouldn't happen, but safe)
    if (API_SECRET) return { Authorization: `Bearer ${API_SECRET}` };
    return {};
}

async function fetchCredentialStatuses(): Promise<Record<string, { configured: boolean }>> {
    const headers = getJwtHeaders();
    if (!headers.Authorization) return {};

    const statusEndpoints = [
        `${API_BASE}/api/config/credentials/status`,
        `${SERVICE_URLS.forexBot}/api/config/credentials/status`,
        `${SERVICE_URLS.cryptoBot}/api/config/credentials/status`,
    ];

    const results = await Promise.allSettled(
        statusEndpoints.map(url => axios.get(url, { headers, timeout: 5000 }))
    );

    const merged: Record<string, { configured: boolean }> = {};

    for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const brokers = result.value.data?.brokers;
        if (!brokers || typeof brokers !== 'object') continue;

        for (const [broker, status] of Object.entries(brokers as Record<string, { configured?: boolean }>)) {
            if (typeof status?.configured !== 'boolean') continue;
            merged[broker] = { configured: status.configured };
        }
    }

    return merged;
}

// ─── API ────────────────────────────────────────────────────────────────────

async function fetchConfig() {
    const res = await axios.get(`${API_BASE}/api/config`, { timeout: 5000 });
    const config = res.data.data;
    if (!config.brokers) config.brokers = {};
    // Merge OANDA config from forex-bot (stock-bot doesn't know about it)
    try {
        const forexRes = await axios.get(`${SERVICE_URLS.forexBot}/api/config`, { timeout: 5000 });
        const forexConfig = forexRes.data?.data;
        if (forexConfig?.brokers?.oanda) {
            config.brokers.oanda = forexConfig.brokers.oanda;
        }
    } catch { /* forex bot offline — leave oanda section unconfigured */ }
    // Merge crypto config from crypto-bot (stock-bot doesn't know about it)
    try {
        const cryptoRes = await axios.get(`${SERVICE_URLS.cryptoBot}/api/config`, { timeout: 5000 });
        const cryptoConfig = cryptoRes.data?.data;
        if (cryptoConfig?.brokers?.crypto) {
            config.brokers.crypto = cryptoConfig.brokers.crypto;
        }
    } catch { /* crypto bot offline — leave crypto section unconfigured */ }

    const credentialStatuses = await fetchCredentialStatuses();
    for (const [broker, status] of Object.entries(credentialStatuses)) {
        config.brokers[broker] = {
            ...(config.brokers[broker] || {}),
            ...status,
        };
    }

    return config;
}

async function updateRisk(payload: { tier: string; stopLoss?: number; profitTarget?: number; positionSize?: number; maxPositions?: number }) {
    const res = await axios.post(`${API_BASE}/api/config/risk`, payload, { headers: authHeaders });
    return res.data;
}

async function saveCredentials(payload: { broker: string; credentials: Record<string, string> }) {
    // Use JWT auth so credentials are stored per-user in the database
    const headers = getJwtHeaders();
    if (!headers.Authorization) throw new Error('Please log in before saving broker credentials');
    // Route to the correct bot based on broker type
    const botUrl =
        (payload.broker === 'oanda') ? SERVICE_URLS.forexBot :
            (payload.broker === 'crypto') ? SERVICE_URLS.cryptoBot :
                API_BASE;
    const res = await axios.post(`${botUrl}/api/config/credentials`, payload, { headers });
    return res.data;
}

async function setTradingMode(mode: 'paper' | 'live') {
    const results = await Promise.allSettled([
        axios.post(`${API_BASE}/api/config/mode`, { mode }, { headers: authHeaders, timeout: 5000 }),
        axios.post(`${SERVICE_URLS.cryptoBot}/api/config/mode`, { mode }, { headers: authHeaders, timeout: 5000 }),
    ]);

    const fulfilled = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<import('axios').AxiosResponse<any>>[];
    if (fulfilled.length === 0) {
        throw new Error('Failed to switch trading mode');
    }

    return fulfilled[0].value.data;
}

// ─── SUB-COMPONENTS ─────────────────────────────────────────────────────────

function SectionTitle({ label, sub }: { label: string; sub?: string }) {
    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight={700} sx={{ letterSpacing: '-0.3px' }}>
                {label}
            </Typography>
            {sub && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3 }}>
                    {sub}
                </Typography>
            )}
        </Box>
    );
}

function StatusDot({ ok }: { ok: boolean }) {
    return (
        <Box
            sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: ok ? 'success.main' : '#555',
                boxShadow: ok ? '0 0 6px #10b981' : 'none',
                display: 'inline-block',
                mr: 0.8,
            }}
        />
    );
}

// ─── CREDENTIAL FIELD ───────────────────────────────────────────────────────

function CredentialField({
    label,
    value,
    onChange,
    secret,
    placeholder,
    autoComplete,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    secret?: boolean;
    placeholder?: string;
    autoComplete?: string;
}) {
    const [show, setShow] = useState(false);
    return (
        <TextField
            fullWidth
            size="small"
            label={label}
            type={secret && !show ? 'password' : 'text'}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete={autoComplete ?? (secret ? 'new-password' : 'off')}
            InputProps={secret ? {
                endAdornment: (
                    <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShow(p => !p)} edge="end" tabIndex={-1}>
                            {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                    </InputAdornment>
                ),
            } : undefined}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
    );
}

// ─── BROKER FORM ────────────────────────────────────────────────────────────

function BrokerForm({
    icon,
    name,
    description,
    accentColor,
    configured,
    setupUrl,
    setupLabel,
    children,
    onSave,
    isSaving,
}: {
    icon: React.ReactElement;
    name: string;
    description: string;
    accentColor: string;
    configured: boolean;
    setupUrl?: string;
    setupLabel?: string;
    children: React.ReactNode;
    onSave: () => void;
    isSaving: boolean;
}) {
    return (
        <Paper
            sx={{
                p: 3,
                border: '1px solid',
                borderColor: configured ? `${accentColor}40` : 'divider',
                borderRadius: 3,
                position: 'relative',
                overflow: 'hidden',
                '&::before': configured ? {
                    content: '""',
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: 3,
                    background: `linear-gradient(90deg, ${accentColor}, transparent)`,
                } : {},
            }}
        >
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 2.5, gap: { xs: 1.5, sm: 0 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: `${accentColor}20`, color: accentColor, width: 42, height: 42 }}>
                        {icon}
                    </Avatar>
                    <Box>
                        <Typography fontWeight={700}>{name}</Typography>
                        <Typography variant="caption" color="text.secondary">{description}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Chip
                        icon={configured ? <CheckCircle sx={{ fontSize: '14px !important' }} /> : <ErrorOutline sx={{ fontSize: '14px !important' }} />}
                        label={configured ? 'Connected' : 'Not configured'}
                        color={configured ? 'success' : 'default'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                    />
                    {setupUrl && (
                        <Button
                            size="small"
                            endIcon={<OpenInNew sx={{ fontSize: 12 }} />}
                            href={setupUrl}
                            target="_blank"
                            rel="noopener"
                            sx={{ textTransform: 'none', fontSize: 12, color: 'text.secondary', minWidth: 0 }}
                        >
                            {setupLabel}
                        </Button>
                    )}
                </Box>
            </Box>

            <Divider sx={{ mb: 2.5 }} />

            <Box component="form" autoComplete="off" onSubmit={e => { e.preventDefault(); onSave(); }}>
                {/* Hidden username field satisfies browser accessibility requirement for password forms */}
                <input type="text" autoComplete="username" style={{ display: 'none' }} readOnly tabIndex={-1} />
                <Stack spacing={2}>
                    {children}
                </Stack>

                <Box sx={{ mt: 2.5 }}>
                    <Button
                        type="submit"
                        variant="contained"
                        size="small"
                        startIcon={isSaving ? <CircularProgress size={13} color="inherit" /> : <Save fontSize="small" />}
                        disabled={isSaving}
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Save Credentials
                    </Button>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                        Keys stored encrypted in your account — never exposed in API responses
                    </Typography>
                </Box>
            </Box>
        </Paper>
    );
}

function NotifForm({
    icon,
    name,
    description,
    accentColor,
    enabled,
    configured,
    detail,
    children,
    onSave,
    isSaving,
    helpSteps,
}: {
    icon: React.ReactElement;
    name: string;
    description: string;
    accentColor: string;
    enabled: boolean;
    configured: boolean;
    detail?: string | null;
    children: React.ReactNode;
    onSave: () => void;
    isSaving: boolean;
    helpSteps: string[];
}) {
    const [showHelp, setShowHelp] = useState(false);
    return (
        <Paper
            sx={{
                p: 3,
                border: '1px solid',
                borderColor: enabled ? `${accentColor}40` : 'divider',
                borderRadius: 3,
                transition: 'border-color 0.2s',
            }}
        >
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 2.5, gap: { xs: 1.5, sm: 0 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: `${accentColor}20`, color: accentColor, width: 42, height: 42 }}>
                        {icon}
                    </Avatar>
                    <Box>
                        <Typography fontWeight={700}>{name}</Typography>
                        <Typography variant="caption" color="text.secondary">{description}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    {configured && detail && (
                        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                            <StatusDot ok /> {detail}
                        </Typography>
                    )}
                    <Chip
                        label={enabled ? 'Active' : 'Off'}
                        color={enabled ? 'success' : 'default'}
                        size="small"
                        sx={{ fontWeight: 600 }}
                    />
                </Box>
            </Box>

            <Divider sx={{ mb: 2.5 }} />

            <Box component="form" autoComplete="off" onSubmit={e => { e.preventDefault(); onSave(); }}>
                <input type="text" autoComplete="username" style={{ display: 'none' }} readOnly tabIndex={-1} />
                <Stack spacing={2}>
                    {children}
                </Stack>

                <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Button
                        type="submit"
                        variant="contained"
                        size="small"
                        startIcon={isSaving ? <CircularProgress size={13} color="inherit" /> : <Save fontSize="small" />}
                        disabled={isSaving}
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Save
                    </Button>
                    <Button
                        size="small"
                        onClick={() => setShowHelp(p => !p)}
                        sx={{ textTransform: 'none', fontSize: 12, color: 'text.secondary', borderRadius: 2 }}
                    >
                        {showHelp ? 'Hide setup guide' : 'How to set up'}
                    </Button>
                </Box>
            </Box>

            {showHelp && (
                <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
                        Setup guide:
                    </Typography>
                    <Stack spacing={0.5}>
                        {helpSteps.map((step, i) => (
                            <Typography key={i} variant="caption" color="text.secondary">
                                {i + 1}. {step}
                            </Typography>
                        ))}
                    </Stack>
                </Box>
            )}
        </Paper>
    );
}

// ─── RISK TIER EDITOR ───────────────────────────────────────────────────────

function RiskTierCard({
    label,
    accentColor,
    data,
    onSave,
    isSaving,
}: {
    tier: string;
    label: string;
    accentColor: string;
    data: { stopLoss: number; profitTarget: number; positionSize: number; maxPositions: number };
    onSave: (vals: typeof data) => void;
    isSaving: boolean;
}) {
    const [vals, setVals] = useState(data);
    const dirty = JSON.stringify(vals) !== JSON.stringify(data);

    const rr = vals.stopLoss > 0 ? vals.profitTarget / vals.stopLoss : 0;

    return (
        <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
                    <Typography fontWeight={700}>{label}</Typography>
                </Box>
                <Chip
                    label={`${rr.toFixed(1)}:1 R:R`}
                    size="small"
                    sx={{ bgcolor: `${accentColor}20`, color: accentColor, fontWeight: 700, fontSize: 12 }}
                />
            </Box>

            <Stack spacing={3}>
                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Stop Loss</Typography>
                        <Typography variant="body2" fontWeight={600} color="error.main">
                            {(vals.stopLoss * 100).toFixed(1)}%
                        </Typography>
                    </Box>
                    <Slider
                        value={vals.stopLoss * 100}
                        min={1} max={15} step={0.5}
                        onChange={(_, v) => setVals(p => ({ ...p, stopLoss: (v as number) / 100 }))}
                        sx={{ color: '#ef4444' }}
                        size="small"
                    />
                </Box>

                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Profit Target</Typography>
                        <Typography variant="body2" fontWeight={600} color="success.main">
                            {(vals.profitTarget * 100).toFixed(1)}%
                        </Typography>
                    </Box>
                    <Slider
                        value={vals.profitTarget * 100}
                        min={2} max={40} step={0.5}
                        onChange={(_, v) => setVals(p => ({ ...p, profitTarget: (v as number) / 100 }))}
                        sx={{ color: '#10b981' }}
                        size="small"
                    />
                </Box>

                <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Position Size</Typography>
                        <Typography variant="body2" fontWeight={600}>
                            {(vals.positionSize * 100).toFixed(2)}% of equity
                        </Typography>
                    </Box>
                    <Slider
                        value={vals.positionSize * 100}
                        min={0.1} max={5} step={0.1}
                        onChange={(_, v) => setVals(p => ({ ...p, positionSize: (v as number) / 100 }))}
                        sx={{ color: accentColor }}
                        size="small"
                    />
                </Box>

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Max Positions</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Button
                            size="small"
                            sx={{ minWidth: 28, p: 0, color: 'text.secondary' }}
                            onClick={() => setVals(p => ({ ...p, maxPositions: Math.max(1, p.maxPositions - 1) }))}
                        >
                            <RemoveCircleOutline fontSize="small" />
                        </Button>
                        <Typography fontWeight={700} sx={{ minWidth: 24, textAlign: 'center' }}>
                            {vals.maxPositions}
                        </Typography>
                        <Button
                            size="small"
                            sx={{ minWidth: 28, p: 0, color: 'text.secondary' }}
                            onClick={() => setVals(p => ({ ...p, maxPositions: Math.min(10, p.maxPositions + 1) }))}
                        >
                            <AddCircleOutline fontSize="small" />
                        </Button>
                    </Box>
                </Box>
            </Stack>

            {dirty && (
                <Box sx={{ mt: 2.5, display: 'flex', gap: 1 }}>
                    <Button
                        variant="contained"
                        size="small"
                        disabled={isSaving}
                        onClick={() => onSave(vals)}
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, flex: 1 }}
                    >
                        {isSaving ? <CircularProgress size={14} sx={{ mr: 1 }} /> : null}
                        Apply
                    </Button>
                    <Button
                        variant="text"
                        size="small"
                        onClick={() => setVals(data)}
                        sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
                    >
                        Reset
                    </Button>
                </Box>
            )}
        </Paper>
    );
}

// ─── FUND MANAGEMENT ────────────────────────────────────────────────────────

async function fetchAllBalances() {
    const [stock, forex, crypto] = await Promise.allSettled([
        axios.get(`${SERVICE_URLS.stockBot}/api/accounts/summary`, { timeout: 4000 }),
        axios.get(`${SERVICE_URLS.forexBot}/api/forex/status`, { timeout: 4000 }),
        axios.get(`${SERVICE_URLS.cryptoBot}/api/crypto/status`, { timeout: 4000 }),
    ]);

    const stockData = stock.status === 'fulfilled' ? stock.value.data?.data : null;
    const forexData = forex.status === 'fulfilled' ? forex.value.data?.data || forex.value.data : null;
    const cryptoData = crypto.status === 'fulfilled' ? crypto.value.data?.data || crypto.value.data : null;

    return { stock: stockData, forex: forexData, crypto: cryptoData };
}

async function saveRiskLimits(payload: { maxDailyLoss: number; maxDrawdown: number; maxTradesPerDay: number }) {
    const res = await axios.post(`${SERVICE_URLS.stockBot}/api/config/risk-limits`, payload, { headers: authHeaders });
    return res.data;
}

function FundManagement({ config }: { config: import('@/types').BotConfig | null | undefined }) {
    const queryClient = useQueryClient();
    const isPaper = config?.trading?.mode !== 'live';

    // Risk limit state — initialise from config when it loads
    const [maxDailyLoss, setMaxDailyLoss] = useState<number>(config?.riskLimits?.maxDailyLoss ?? 500);
    const [maxDrawdown, setMaxDrawdown] = useState<number>(config?.riskLimits?.maxDrawdown ?? 10);
    const [maxTrades, setMaxTrades] = useState<number>(config?.riskLimits?.maxTradesPerDay ?? 15);

    // Sync slider values when config first loads
    React.useEffect(() => {
        if (config?.riskLimits) {
            setMaxDailyLoss(config.riskLimits.maxDailyLoss ?? 500);
            setMaxDrawdown(config.riskLimits.maxDrawdown ?? 10);
            setMaxTrades(config.riskLimits.maxTradesPerDay ?? 15);
        }
    }, [config?.riskLimits, config?.riskLimits?.maxDailyLoss, config?.riskLimits?.maxDrawdown, config?.riskLimits?.maxTradesPerDay]);

    const { data: balances, isLoading: balLoading } = useQuery({
        queryKey: ['allBalances'],
        queryFn: fetchAllBalances,
        refetchInterval: 15000,
    });

    const { mutate: applyLimits, isPending: savingLimits } = useMutation({
        mutationFn: saveRiskLimits,
        onSuccess: () => {
            toast.success('Risk limits updated');
            void queryClient.invalidateQueries({ queryKey: ['botConfig'] });
        },
        onError: () => { toast.error('Failed — is the Stock Bot running?'); },
    });

    const stockBalance = balances?.stock?.realAccount?.balance ?? balances?.stock?.demoAccount?.balance ?? null;
    const stockEquity = balances?.stock?.realAccount?.equity ?? balances?.stock?.demoAccount?.equity ?? null;
    const stockPnL = balances?.stock?.realAccount?.pnl ?? null;
    const forexBalance = balances?.forex?.account?.balance ?? balances?.forex?.equity ?? null;
    const cryptoBalance = balances?.crypto?.portfolioValue ?? balances?.crypto?.equity ?? null;

    const totalPortfolio = [stockEquity, forexBalance, cryptoBalance]
        .filter((v): v is number => v !== null)
        .reduce((a, b) => a + b, 0);

    const brokers = [
        {
            icon: <ShowChart />,
            name: 'Alpaca',
            label: isPaper ? 'Paper Account' : 'Live Account',
            color: '#10b981',
            configured: !!config?.brokers?.alpaca?.configured,
            balance: stockBalance,
            equity: stockEquity,
            pnl: stockPnL,
            depositUrl: 'https://app.alpaca.markets/account/transfers',
            depositLabel: 'Deposit via Alpaca',
        },
        {
            icon: <CurrencyExchange />,
            name: 'OANDA',
            label: 'Forex Account',
            color: '#3b82f6',
            configured: !!config?.brokers?.oanda?.configured,
            balance: forexBalance,
            equity: null,
            pnl: null,
            depositUrl: 'https://www.oanda.com/account/funds',
            depositLabel: 'Deposit via OANDA',
        },
        {
            icon: <CurrencyBitcoin />,
            name: config?.brokers?.crypto?.exchange
                ? config.brokers.crypto.exchange.charAt(0).toUpperCase() + config.brokers.crypto.exchange.slice(1)
                : 'Crypto Exchange',
            label: config?.brokers?.crypto?.testnet ? 'Testnet' : 'Live Exchange',
            color: '#f59e0b',
            configured: !!config?.brokers?.crypto?.configured,
            balance: cryptoBalance,
            equity: null,
            pnl: null,
            depositUrl: null,
            depositLabel: null,
        },
    ];

    return (
        <Stack spacing={3}>

            {/* Portfolio summary */}
            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 2.5, gap: { xs: 1, sm: 0 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountBalanceWallet sx={{ color: 'primary.main' }} />
                        <Typography fontWeight={700}>Portfolio Overview</Typography>
                    </Box>
                    {balLoading && <CircularProgress size={16} />}
                </Box>

                <Box sx={{ p: 2.5, borderRadius: 2, bgcolor: 'background.default', mb: 2.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        Total across all accounts
                    </Typography>
                    <Typography variant="h4" fontWeight={800}>
                        ${totalPortfolio > 0 ? totalPortfolio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                    </Typography>
                    {isPaper && (
                        <Chip label="Paper mode — simulated capital" size="small" color="primary" variant="outlined" sx={{ mt: 1, fontSize: 11 }} />
                    )}
                </Box>

                <Stack spacing={1.5}>
                    {brokers.map(b => (
                        <Box
                            key={b.name}
                            sx={{
                                display: 'flex',
                                flexDirection: { xs: 'column', sm: 'row' },
                                alignItems: { xs: 'flex-start', sm: 'center' },
                                justifyContent: 'space-between',
                                gap: { xs: 1.5, sm: 0 },
                                p: 2,
                                borderRadius: 2,
                                bgcolor: 'background.default',
                                border: '1px solid',
                                borderColor: b.configured ? `${b.color}30` : 'transparent',
                            }}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Avatar sx={{ bgcolor: `${b.color}20`, color: b.color, width: 34, height: 34 }}>
                                    {b.icon}
                                </Avatar>
                                <Box>
                                    <Typography variant="body2" fontWeight={600}>{b.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{b.label}</Typography>
                                </Box>
                            </Box>
                            <Box sx={{ textAlign: 'right' }}>
                                {b.configured && b.balance !== null ? (
                                    <>
                                        <Typography variant="body2" fontWeight={700}>
                                            ${b.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </Typography>
                                        {b.pnl !== null && (
                                            <Typography variant="caption" color={b.pnl >= 0 ? 'success.main' : 'error.main'}>
                                                {b.pnl >= 0 ? '+' : ''}${b.pnl.toFixed(2)} P&L
                                            </Typography>
                                        )}
                                    </>
                                ) : (
                                    <Chip
                                        label={b.configured ? 'Fetching…' : 'Not configured'}
                                        size="small"
                                        color={b.configured ? 'default' : 'default'}
                                        variant="outlined"
                                        sx={{ fontSize: 11 }}
                                    />
                                )}
                            </Box>
                        </Box>
                    ))}
                </Stack>
            </Paper>

            {/* Deposit / Withdraw */}
            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Typography fontWeight={700} sx={{ mb: 2 }}>Deposit & Withdrawal</Typography>

                {isPaper ? (
                    <Alert severity="info" icon={<ScienceOutlined />} sx={{ borderRadius: 2 }}>
                        You are in <strong>Paper Trading</strong> mode — no real funds involved. Switch to Live mode in the Trading Mode section, then connect a funded broker account to deposit real capital.
                    </Alert>
                ) : (
                    <Stack spacing={1.5}>
                        {brokers.filter(b => b.configured && b.depositUrl).map(b => (
                            <Box
                                key={b.name}
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: 'background.default',
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                    <Avatar sx={{ bgcolor: `${b.color}20`, color: b.color, width: 32, height: 32 }}>
                                        {b.icon}
                                    </Avatar>
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>{b.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Balance: {b.balance !== null ? `$${b.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    endIcon={<OpenInNew sx={{ fontSize: 13 }} />}
                                    href={b.depositUrl!}
                                    target="_blank"
                                    rel="noopener"
                                    sx={{ borderRadius: 2, textTransform: 'none', fontSize: 12 }}
                                >
                                    {b.depositLabel}
                                </Button>
                            </Box>
                        ))}
                        {brokers.filter(b => b.configured && b.depositUrl).length === 0 && (
                            <Alert severity="warning" sx={{ borderRadius: 2 }}>
                                No broker accounts configured yet. Add credentials in the Brokers section.
                            </Alert>
                        )}
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                            <Typography variant="caption" color="text.secondary">
                                Deposits and withdrawals are processed directly through your broker's platform. NexusTradeAI does not hold or transfer funds.
                            </Typography>
                        </Box>
                    </Stack>
                )}
            </Paper>

            {/* Risk limits */}
            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <WarningAmber sx={{ color: 'warning.main', fontSize: 20 }} />
                    <Typography fontWeight={700}>Risk Limits</Typography>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2.5 }}>
                    The bot automatically stops trading when these thresholds are hit.
                </Typography>

                <Stack spacing={3}>
                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">Max daily loss</Typography>
                            <Typography variant="body2" fontWeight={700} color="error.main">
                                ${maxDailyLoss.toLocaleString()}
                            </Typography>
                        </Box>
                        <Slider
                            value={maxDailyLoss}
                            min={100} max={5000} step={100}
                            onChange={(_, v) => setMaxDailyLoss(v as number)}
                            sx={{ color: '#ef4444' }}
                            size="small"
                        />
                        <Typography variant="caption" color="text.secondary">
                            Bot pauses for the day once cumulative losses reach this amount.
                        </Typography>
                    </Box>

                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">Max drawdown kill switch</Typography>
                            <Typography variant="body2" fontWeight={700} color="warning.main">
                                {maxDrawdown}%
                            </Typography>
                        </Box>
                        <Slider
                            value={maxDrawdown}
                            min={5} max={30} step={1}
                            onChange={(_, v) => setMaxDrawdown(v as number)}
                            sx={{ color: '#f59e0b' }}
                            size="small"
                        />
                        <Typography variant="caption" color="text.secondary">
                            All bots halt and close positions if portfolio drawdown exceeds this level.
                        </Typography>
                    </Box>

                    <Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                            <Typography variant="body2" color="text.secondary">Max trades per day</Typography>
                            <Typography variant="body2" fontWeight={700}>{maxTrades}</Typography>
                        </Box>
                        <Slider
                            value={maxTrades}
                            min={1} max={30} step={1}
                            onChange={(_, v) => setMaxTrades(v as number)}
                            sx={{ color: 'primary.main' }}
                            size="small"
                        />
                        <Typography variant="caption" color="text.secondary">
                            Anti-churning guard. Recommended: 10–15 trades per day.
                        </Typography>
                    </Box>

                    <Button
                        variant="contained"
                        size="small"
                        startIcon={savingLimits ? <CircularProgress size={13} color="inherit" /> : <Save fontSize="small" />}
                        disabled={savingLimits}
                        onClick={() => applyLimits({ maxDailyLoss, maxDrawdown, maxTradesPerDay: maxTrades })}
                        sx={{ alignSelf: 'flex-start', borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Apply Limits
                    </Button>
                </Stack>
            </Paper>

        </Stack>
    );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

type Section = 'mode' | 'risk' | 'brokers' | 'notifications' | 'funds';

const NAV: { id: Section; label: string }[] = [
    { id: 'mode', label: 'Trading Mode' },
    { id: 'risk', label: 'Risk & Strategy' },
    { id: 'brokers', label: 'Brokers' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'funds', label: 'Fund Management' },
];

export default function SettingsPage() {
    const { user, logout } = useAuth();
    const [activeSection, setActiveSection] = useState<Section>('mode');
    const queryClient = useQueryClient();

    // ── Alpaca credentials state ──
    const [alpacaKey, setAlpacaKey] = useState('');
    const [alpacaSecret, setAlpacaSecret] = useState('');
    const [alpacaMode, setAlpacaMode] = useState<'paper' | 'live'>('paper');

    // ── OANDA credentials state ──
    const [oandaAccount, setOandaAccount] = useState('');
    const [oandaToken, setOandaToken] = useState('');
    const [oandaPractice, setOandaPractice] = useState(true);

    // ── Crypto credentials state ──
    const [cryptoKey, setCryptoKey] = useState('');
    const [cryptoSecret, setCryptoSecret] = useState('');
    const [cryptoExchange, setCryptoExchange] = useState('kraken');
    const [cryptoTestnet, setCryptoTestnet] = useState(true);

    // ── Telegram credentials state ──
    const [telegramToken, setTelegramToken] = useState('');
    const [telegramChatId, setTelegramChatId] = useState('');
    const [telegramEnabled, setTelegramEnabled] = useState(false);

    // ── SMS credentials state ──
    const [smsSid, setSmsSid] = useState('');
    const [smsAuth, setSmsAuth] = useState('');
    const [smsFrom, setSmsFrom] = useState('');
    const [smsTo, setSmsTo] = useState('');
    const [smsEnabled, setSmsEnabled] = useState(false);

    const { data: config, isLoading } = useQuery({
        queryKey: ['botConfig'],
        queryFn: fetchConfig,
        refetchInterval: 30000,
        retry: 1,
    });

    // Seed broker/notification state from config on first load (bugs #4, #7, #8)
    React.useEffect(() => {
        if (!config) return;
        // OANDA practice toggle (#8)
        if (config.brokers?.oanda?.mode) {
            setOandaPractice(config.brokers.oanda.mode === 'practice');
        }
        // Crypto exchange dropdown (#7)
        if (config.brokers?.crypto?.exchange) {
            setCryptoExchange(config.brokers.crypto.exchange);
        }
        // Crypto testnet toggle
        if (config.brokers?.crypto?.testnet !== undefined) {
            setCryptoTestnet(config.brokers.crypto.testnet);
        }
        // Telegram enabled toggle (#4)
        if (config.notifications?.telegram?.enabled !== undefined) {
            setTelegramEnabled(config.notifications.telegram.enabled);
        }
        // SMS enabled toggle (#4)
        if (config.notifications?.sms?.enabled !== undefined) {
            setSmsEnabled(config.notifications.sms.enabled);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [!!config]);

    const { mutate: saveRisk, isPending: savingRisk } = useMutation({
        mutationFn: updateRisk,
        onSuccess: () => {
            toast.success('Risk parameters updated');
            void queryClient.invalidateQueries({ queryKey: ['botConfig'] });
        },
        onError: () => { toast.error('Failed to update — is the Stock Bot running?'); },
    });

    const [confirmLive, setConfirmLive] = useState(false);

    const { mutate: switchMode, isPending: switchingMode } = useMutation({
        mutationFn: setTradingMode,
        onSuccess: (_, mode) => {
            toast.success(`Switched to ${mode === 'live' ? 'Live' : 'Paper'} trading`);
            setConfirmLive(false);
            void queryClient.invalidateQueries({ queryKey: ['botConfig'] });
        },
        onError: () => { toast.error('Failed to switch mode — is the Stock Bot running?'); },
    });

    const { mutate: saveCreds, isPending: savingCreds, variables: savingFor } = useMutation<
        import('@/types').SaveCredentialsResult, Error, import('@/types').SaveCredentialsPayload
    >({
        mutationFn: saveCredentials,
        onSuccess: (data, vars) => {
            if (vars.broker === 'crypto') {
                if (data?.demoMode === false) toast.success('Kraken connected — live trading enabled');
                else if (data?.warning) toast.error(`Keys saved — ${data.warning}`);
                else toast.success('Crypto credentials saved');
            } else {
                const brokerLabel = vars.broker.charAt(0).toUpperCase() + vars.broker.slice(1);
                toast.success(`${brokerLabel} credentials saved`);
            }
            if (data?.engineStarted) {
                toast.success('Your personal trading engine is now active', { duration: 4000 });
            }
            void queryClient.invalidateQueries({ queryKey: ['botConfig'] });
        },
        onError: (_err, vars) => {
            const botName = vars.broker === 'crypto' ? 'Crypto Bot' : vars.broker === 'oanda' ? 'Forex Bot' : 'Stock Bot';
            toast.error(`Failed to save — is the ${botName} running?`);
        },
    });

    const isPaper = config?.trading?.mode !== 'live';

    return (
        <>
        <SEO title="Settings" description="Configure NexusTradeAI trading parameters, broker credentials, risk limits, and notification preferences." path="/settings" noindex />
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
            {/* ── Content ── */}
            <Box sx={{ flex: 1, p: { xs: 2, sm: 3, md: 4 }, maxWidth: 860, mx: 'auto', width: '100%', overflow: 'auto' }}>
                <Typography variant="h4" fontWeight={800} sx={{ mb: 3 }}>
                    Settings
                </Typography>

                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
                    <Tabs
                        value={activeSection}
                        onChange={(_, newValue) => setActiveSection(newValue)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{
                            '& .MuiTab-root': {
                                textTransform: 'none',
                                fontWeight: 600,
                                fontSize: '0.95rem',
                                minHeight: 48,
                            }
                        }}
                    >
                        {NAV.map(item => (
                            <Tab
                                key={item.id}
                                label={item.label}
                                value={item.id}
                            />
                        ))}
                    </Tabs>
                </Box>
                {isLoading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

                {/* ── TRADING MODE ── */}
                {activeSection === 'mode' && (
                    <Box>
                        <SectionTitle
                            label="Trading Mode"
                            sub="Switch between paper trading (simulated) and live trading with real capital."
                        />
                        <Stack spacing={3}>

                            {/* Mode toggle card */}
                            <Paper
                                sx={{
                                    p: 3,
                                    borderRadius: 3,
                                    border: '1px solid',
                                    borderColor: isPaper ? 'divider' : '#ef444440',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    '&::before': !isPaper ? {
                                        content: '""',
                                        position: 'absolute',
                                        top: 0, left: 0, right: 0,
                                        height: 3,
                                        background: 'linear-gradient(90deg, #ef4444, transparent)',
                                    } : {},
                                }}
                            >
                                {/* Current status */}
                                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', mb: 2.5, gap: { xs: 1.5, sm: 0 } }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                        <Avatar sx={{ bgcolor: isPaper ? '#3b82f620' : '#ef444420', color: isPaper ? '#3b82f6' : '#ef4444', width: 48, height: 48 }}>
                                            {isPaper ? <ScienceOutlined /> : <FlashOn />}
                                        </Avatar>
                                        <Box>
                                            <Typography fontWeight={700} variant="h6">
                                                {isPaper ? 'Paper Trading' : 'Live Trading'}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {isPaper
                                                    ? 'Simulated trades — no real money at risk'
                                                    : 'Real capital deployed — orders execute on your broker account'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip
                                        label={isPaper ? 'PAPER' : 'LIVE'}
                                        color={isPaper ? 'primary' : 'error'}
                                        sx={{ fontWeight: 800, fontSize: 13, px: 1 }}
                                    />
                                </Box>

                                <Divider sx={{ mb: 2.5 }} />

                                {!isPaper && (
                                    <Alert severity="error" sx={{ borderRadius: 2, mb: 2.5 }}>
                                        <strong>Live trading is active.</strong> Real money is at risk. Ensure your risk parameters and broker credentials are correct before running any bot.
                                    </Alert>
                                )}

                                {/* Mode selector */}
                                <Grid container spacing={2} sx={{ mb: 2.5 }}>
                                    {([
                                        {
                                            mode: 'paper' as const,
                                            label: 'Paper Trading',
                                            description: 'Simulated orders — no real capital at risk. Best for testing and development.',
                                            icon: <ScienceOutlined />,
                                            color: '#3b82f6',
                                            recommended: true,
                                        },
                                        {
                                            mode: 'live' as const,
                                            label: 'Live Trading',
                                            description: 'Real orders on your funded broker accounts. Only enable when consistently profitable.',
                                            icon: <FlashOn />,
                                            color: '#ef4444',
                                            recommended: false,
                                        },
                                    ]).map(opt => {
                                        const isActive = isPaper ? opt.mode === 'paper' : opt.mode === 'live';
                                        return (
                                            <Grid item xs={12} sm={6} key={opt.mode}>
                                                <Box
                                                    onClick={() => {
                                                        if (isActive) return;
                                                        if (opt.mode === 'live') {
                                                            setConfirmLive(true);
                                                        } else {
                                                            switchMode('paper');
                                                        }
                                                    }}
                                                    sx={{
                                                        p: 2.5,
                                                        borderRadius: 3,
                                                        border: '2px solid',
                                                        borderColor: isActive ? opt.color : 'divider',
                                                        bgcolor: isActive ? `${opt.color}10` : 'background.default',
                                                        cursor: isActive ? 'default' : 'pointer',
                                                        transition: 'all 0.15s',
                                                        '&:hover': !isActive ? { borderColor: opt.color, bgcolor: `${opt.color}08` } : {},
                                                    }}
                                                >
                                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                            <Avatar sx={{ bgcolor: `${opt.color}20`, color: opt.color, width: 32, height: 32 }}>
                                                                {opt.icon}
                                                            </Avatar>
                                                            <Typography fontWeight={700}>{opt.label}</Typography>
                                                        </Box>
                                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                            {opt.recommended && <Chip label="Recommended" size="small" color="primary" sx={{ height: 18, fontSize: 10 }} />}
                                                            {isActive && <Chip label="Active" size="small" color={opt.mode === 'paper' ? 'primary' : 'error'} sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />}
                                                        </Box>
                                                    </Box>
                                                    <Typography variant="caption" color="text.secondary">
                                                        {opt.description}
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                        );
                                    })}
                                </Grid>

                                {/* Live confirmation panel */}
                                {confirmLive && (
                                    <Box
                                        sx={{
                                            p: 2.5,
                                            borderRadius: 3,
                                            border: '1px solid',
                                            borderColor: '#ef444460',
                                            bgcolor: '#ef444408',
                                        }}
                                    >
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                            <WarningAmber sx={{ color: '#ef4444', fontSize: 20 }} />
                                            <Typography fontWeight={700} color="error.main">Confirm switch to Live Trading</Typography>
                                        </Box>
                                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                            Real money will be deployed on your next bot run. Make sure you have:
                                        </Typography>
                                        <Stack spacing={0.5} sx={{ mb: 2 }}>
                                            {[
                                                'Tested the strategy in paper mode for at least 2 weeks',
                                                'Connected a funded broker account in the Brokers section',
                                                'Reviewed your risk parameters (stop losses, position sizes)',
                                                'Set a daily loss limit you are comfortable with',
                                            ].map((item, i) => (
                                                <Box key={i} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                                                    <CheckCircle sx={{ fontSize: 14, color: 'text.disabled', mt: 0.3, flexShrink: 0 }} />
                                                    <Typography variant="caption" color="text.secondary">{item}</Typography>
                                                </Box>
                                            ))}
                                        </Stack>
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <Button
                                                variant="contained"
                                                color="error"
                                                size="small"
                                                disabled={switchingMode}
                                                startIcon={switchingMode ? <CircularProgress size={13} color="inherit" /> : <FlashOn fontSize="small" />}
                                                onClick={() => switchMode('live')}
                                                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                                            >
                                                Yes, switch to Live
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => setConfirmLive(false)}
                                                sx={{ borderRadius: 2, textTransform: 'none', color: 'text.secondary' }}
                                            >
                                                Cancel
                                            </Button>
                                        </Box>
                                    </Box>
                                )}
                            </Paper>

                            {/* Trading schedule */}
                            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                <Typography fontWeight={600} gutterBottom>Trading Schedule</Typography>
                                <Grid container spacing={1.5} sx={{ mt: 0.5 }}>
                                    {[
                                        { label: 'Stock Bot', hours: 'Mon–Fri  9:30 AM – 4:00 PM EST', color: '#10b981', active: true },
                                        { label: 'Forex Bot', hours: 'Sun 5 PM – Fri 5 PM EST (24/5)', color: '#3b82f6', active: !!config?.brokers?.oanda?.configured },
                                        { label: 'Crypto Bot', hours: '24 hours · 7 days a week', color: '#f59e0b', active: !!config?.brokers?.crypto?.configured },
                                    ].map(s => (
                                        <Grid item xs={12} key={s.label}>
                                            <Box
                                                sx={{
                                                    display: 'flex',
                                                    flexDirection: { xs: 'column', sm: 'row' },
                                                    alignItems: { xs: 'flex-start', sm: 'center' },
                                                    justifyContent: 'space-between',
                                                    gap: { xs: 1, sm: 0 },
                                                    p: 2,
                                                    borderRadius: 2,
                                                    bgcolor: 'background.default',
                                                }}
                                            >
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.active ? s.color : '#555', boxShadow: s.active ? `0 0 6px ${s.color}` : 'none' }} />
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={600}>{s.label}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{s.hours}</Typography>
                                                    </Box>
                                                </Box>
                                                <Chip label={s.active ? 'Configured' : 'Not configured'} color={s.active ? 'success' : 'default'} size="small" variant="outlined" />
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Paper>

                        </Stack>
                    </Box>
                )}

                {/* ── RISK & STRATEGY ── */}
                {activeSection === 'risk' && config?.risk && (
                    <Box>
                        <SectionTitle
                            label="Risk & Strategy"
                            sub="Adjust stop loss, profit targets, and position sizing per momentum tier. Changes apply instantly without restart."
                        />
                        <Alert severity="warning" sx={{ borderRadius: 2, mb: 3 }}>
                            <strong>Never widen stop losses</strong> during a losing streak. Tighten them. Position size should stay below 2% of equity per trade.
                        </Alert>
                        <Grid container spacing={2}>
                            {([
                                { id: 'tier1', label: 'Tier 1 — Standard Momentum (2.5%+)', color: '#10b981' },
                                { id: 'tier2', label: 'Tier 2 — Strong Momentum (5%+)', color: '#3b82f6' },
                                { id: 'tier3', label: 'Tier 3 — Extreme Momentum (10%+)', color: '#f59e0b' },
                            ] as const).map(t => (
                                <Grid item xs={12} key={t.id}>
                                    <RiskTierCard
                                        tier={t.id}
                                        label={t.label}
                                        accentColor={t.color}
                                        data={config.risk[t.id]}
                                        onSave={vals => saveRisk({ tier: t.id, ...vals })}
                                        isSaving={savingRisk}
                                    />
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                )}

                {/* ── BROKERS ── */}
                {activeSection === 'brokers' && (
                    <Box>
                        <SectionTitle
                            label="Brokers"
                            sub="Enter API credentials for each trading venue. Keys are encrypted and stored securely per-user in the database."
                        />
                        <Stack spacing={2.5}>

                            {/* Alpaca */}
                            <BrokerForm
                                icon={<ShowChart />}
                                name="Alpaca Markets"
                                description="US Stocks & ETFs · Paper and Live trading"
                                accentColor="#10b981"
                                configured={!!config?.brokers?.alpaca?.configured}
                                setupUrl="https://alpaca.markets"
                                setupLabel="Get API keys"
                                onSave={() => {
                                    const creds: Record<string, string> = {
                                        ALPACA_BASE_URL: alpacaMode === 'live'
                                            ? 'https://api.alpaca.markets'
                                            : 'https://paper-api.alpaca.markets',
                                    };
                                    if (alpacaKey) creds.ALPACA_API_KEY = alpacaKey;
                                    if (alpacaSecret) creds.ALPACA_SECRET_KEY = alpacaSecret;
                                    saveCreds({ broker: 'alpaca', credentials: creds });
                                }}
                                isSaving={savingCreds && savingFor?.broker === 'alpaca'}
                            >
                                {config?.brokers?.alpaca?.configured && (
                                    <Alert severity="success" sx={{ borderRadius: 2, py: 0.5 }}>
                                        Credentials on file — endpoint: {config.brokers.alpaca.baseURL ?? 'paper'}. Enter new keys below to replace.
                                    </Alert>
                                )}
                                <CredentialField
                                    label="API Key"
                                    value={alpacaKey}
                                    onChange={setAlpacaKey}
                                    secret
                                    placeholder={config?.brokers?.alpaca?.configured ? '••••••••  (leave blank to keep existing)' : 'PKTEST...'}
                                />
                                <CredentialField
                                    label="Secret Key"
                                    value={alpacaSecret}
                                    onChange={setAlpacaSecret}
                                    secret
                                    placeholder={config?.brokers?.alpaca?.configured ? '••••••••  (leave blank to keep existing)' : 'Your secret...'}
                                />
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Account Type</InputLabel>
                                    <Select
                                        value={alpacaMode}
                                        label="Account Type"
                                        onChange={e => setAlpacaMode(e.target.value as 'paper' | 'live')}
                                        sx={{ borderRadius: 2 }}
                                    >
                                        <MenuItem value="paper">Paper Trading (recommended)</MenuItem>
                                        <MenuItem value="live">Live Trading (real money)</MenuItem>
                                    </Select>
                                </FormControl>
                            </BrokerForm>

                            {/* OANDA */}
                            <BrokerForm
                                icon={<CurrencyExchange />}
                                name="OANDA"
                                description="Forex & CFDs · 12 currency pairs · 24/5"
                                accentColor="#3b82f6"
                                configured={!!config?.brokers?.oanda?.configured}
                                setupUrl="https://www.oanda.com/register/#/sign-up/demo"
                                setupLabel="Open free practice account"
                                onSave={() => {
                                    const creds: Record<string, string> = {
                                        OANDA_PRACTICE: oandaPractice ? 'true' : 'false',
                                    };
                                    if (oandaAccount) creds.OANDA_ACCOUNT_ID = oandaAccount;
                                    if (oandaToken) creds.OANDA_ACCESS_TOKEN = oandaToken;
                                    saveCreds({ broker: 'oanda', credentials: creds });
                                }}
                                isSaving={savingCreds && savingFor?.broker === 'oanda'}
                            >
                                {config?.brokers?.oanda?.configured && (
                                    <Alert severity="success" sx={{ borderRadius: 2, py: 0.5 }}>
                                        Credentials on file. Enter new values to replace.
                                    </Alert>
                                )}
                                <CredentialField
                                    label="Account ID"
                                    value={oandaAccount}
                                    onChange={setOandaAccount}
                                    placeholder={config?.brokers?.oanda?.configured ? '••••  (leave blank to keep existing)' : '001-001-1234567-001'}
                                />
                                <CredentialField
                                    label="Access Token"
                                    value={oandaToken}
                                    onChange={setOandaToken}
                                    secret
                                    placeholder={config?.brokers?.oanda?.configured ? '••••••••  (leave blank to keep existing)' : 'Your personal access token...'}
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={oandaPractice}
                                            onChange={e => setOandaPractice(e.target.checked)}
                                            size="small"
                                        />
                                    }
                                    label={
                                        <Typography variant="body2">
                                            Practice account {oandaPractice ? <Chip label="Recommended" size="small" color="primary" sx={{ ml: 0.5, height: 18, fontSize: 10 }} /> : null}
                                        </Typography>
                                    }
                                />
                            </BrokerForm>

                            {/* Crypto Exchange */}
                            <BrokerForm
                                icon={<CurrencyBitcoin />}
                                name="Crypto Exchange"
                                description="Crypto pairs · BTC-correlated momentum · 24/7"
                                accentColor="#f59e0b"
                                configured={!!config?.brokers?.crypto?.configured}
                                setupUrl="https://www.kraken.com/u/security/api"
                                setupLabel="Get Kraken API Key"
                                onSave={() => {
                                    const creds: Record<string, string> = {
                                        CRYPTO_EXCHANGE: cryptoExchange,
                                        CRYPTO_TESTNET: cryptoTestnet ? 'true' : 'false',
                                    };
                                    if (cryptoKey) creds.CRYPTO_API_KEY = cryptoKey;
                                    if (cryptoSecret) creds.CRYPTO_API_SECRET = cryptoSecret;
                                    saveCreds({ broker: 'crypto', credentials: creds });
                                }}
                                isSaving={savingCreds && savingFor?.broker === 'crypto'}
                            >
                                {config?.brokers?.crypto?.configured && (
                                    <Alert severity="success" sx={{ borderRadius: 2, py: 0.5 }}>
                                        Credentials on file — {config.brokers.crypto.exchange ?? 'exchange'}{config.brokers.crypto.testnet ? ' (testnet)' : ''}. Enter new values to replace.
                                    </Alert>
                                )}
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Exchange</InputLabel>
                                    <Select
                                        value={cryptoExchange}
                                        label="Exchange"
                                        onChange={e => setCryptoExchange(e.target.value)}
                                        sx={{ borderRadius: 2 }}
                                    >
                                        <MenuItem value="kraken">Kraken (Recommended)</MenuItem>
                                        <MenuItem value="coinbase">Coinbase Advanced</MenuItem>
                                        <MenuItem value="bybit">Bybit</MenuItem>
                                        <MenuItem value="binance">Binance (US blocked ⚠️)</MenuItem>
                                    </Select>
                                </FormControl>
                                <CredentialField
                                    label="API Key"
                                    value={cryptoKey}
                                    onChange={setCryptoKey}
                                    secret
                                    placeholder={config?.brokers?.crypto?.configured ? '••••••••  (leave blank to keep existing)' : 'Your API key...'}
                                />
                                <CredentialField
                                    label="API Secret"
                                    value={cryptoSecret}
                                    onChange={setCryptoSecret}
                                    secret
                                    placeholder={config?.brokers?.crypto?.configured ? '••••••••  (leave blank to keep existing)' : 'Your API secret...'}
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={cryptoTestnet}
                                            onChange={e => setCryptoTestnet(e.target.checked)}
                                            size="small"
                                        />
                                    }
                                    label={
                                        <Typography variant="body2">
                                            Use testnet {cryptoTestnet ? <Chip label="Recommended" size="small" color="primary" sx={{ ml: 0.5, height: 18, fontSize: 10 }} /> : null}
                                        </Typography>
                                    }
                                />
                            </BrokerForm>

                        </Stack>
                    </Box>
                )}

                {/* ── NOTIFICATIONS ── */}
                {activeSection === 'notifications' && (
                    <Box>
                        <SectionTitle
                            label="Notifications"
                            sub="Get alerted on trade entries, exits, stop losses, and daily summaries."
                        />
                        <Stack spacing={2.5}>

                            {/* Telegram */}
                            <NotifForm
                                icon={<Notifications />}
                                name="Telegram"
                                description="Free instant alerts via Telegram bot · Unlimited messages"
                                accentColor="#3b82f6"
                                enabled={!!config?.notifications?.telegram?.enabled}
                                configured={!!config?.notifications?.telegram?.configured}
                                detail={config?.notifications?.telegram?.chatId ? `Chat ID ···${String(config.notifications.telegram.chatId).slice(-4)}` : null}
                                onSave={() => {
                                    const creds: Record<string, string> = {
                                        TELEGRAM_ALERTS_ENABLED: telegramEnabled ? 'true' : 'false',
                                    };
                                    if (telegramToken) creds.TELEGRAM_BOT_TOKEN = telegramToken;
                                    if (telegramChatId) creds.TELEGRAM_CHAT_ID = telegramChatId;
                                    saveCreds({ broker: 'telegram', credentials: creds });
                                }}
                                isSaving={savingCreds && savingFor?.broker === 'telegram'}
                                helpSteps={[
                                    'Open Telegram and search for @BotFather',
                                    'Send /newbot — BotFather will ask for a name and username',
                                    'Copy the bot token it gives you (format: 123456789:AABBcc...)',
                                    'Search @userinfobot in Telegram and send /start to get your Chat ID',
                                    'Enter both below and enable alerts',
                                ]}
                            >
                                {config?.notifications?.telegram?.configured && (
                                    <Alert severity="success" sx={{ borderRadius: 2, py: 0.5 }}>
                                        Telegram is configured. Enter new values below to update credentials.
                                    </Alert>
                                )}
                                <CredentialField
                                    label="Bot Token"
                                    value={telegramToken}
                                    onChange={setTelegramToken}
                                    secret
                                    placeholder={config?.notifications?.telegram?.configured ? '••••••••  (leave blank to keep existing)' : '123456789:AABBccDDee...'}
                                />
                                <CredentialField
                                    label="Chat ID"
                                    value={telegramChatId}
                                    onChange={setTelegramChatId}
                                    placeholder={config?.notifications?.telegram?.configured ? '  (leave blank to keep existing)' : '-1001234567890'}
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={telegramEnabled}
                                            onChange={e => setTelegramEnabled(e.target.checked)}
                                            size="small"
                                        />
                                    }
                                    label={<Typography variant="body2">Enable Telegram alerts</Typography>}
                                />
                                {config?.notifications?.telegram?.configured && (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<Send fontSize="small" />}
                                        sx={{ borderRadius: 2, textTransform: 'none', alignSelf: 'flex-start' }}
                                        onClick={async () => {
                                            try {
                                                await axios.post(`${API_BASE}/api/config/test-notification`, { channel: 'telegram' }, { headers: authHeaders });
                                                toast.success('Test message sent to Telegram');
                                            } catch {
                                                toast.error('Failed to send test message — check bot token and chat ID');
                                            }
                                        }}
                                    >
                                        Send test message
                                    </Button>
                                )}
                            </NotifForm>

                            {/* SMS */}
                            <NotifForm
                                icon={<PhoneAndroid />}
                                name="SMS via Twilio"
                                description="Text message alerts for critical events (stop losses, circuit breakers)"
                                accentColor="#10b981"
                                enabled={!!config?.notifications?.sms?.enabled}
                                configured={!!config?.notifications?.sms?.configured}
                                detail={config?.notifications?.sms?.phone ? `Alerts to ···${String(config.notifications.sms.phone).slice(-4)}` : null}
                                onSave={() => {
                                    const creds: Record<string, string> = {
                                        SMS_ALERTS_ENABLED: smsEnabled ? 'true' : 'false',
                                    };
                                    if (smsSid) creds.TWILIO_ACCOUNT_SID = smsSid;
                                    if (smsAuth) creds.TWILIO_AUTH_TOKEN = smsAuth;
                                    if (smsFrom) creds.TWILIO_PHONE_NUMBER = smsFrom;
                                    if (smsTo) creds.ALERT_PHONE_NUMBER = smsTo;
                                    saveCreds({ broker: 'sms', credentials: creds });
                                }}
                                isSaving={savingCreds && savingFor?.broker === 'sms'}
                                helpSteps={[
                                    'Sign up at twilio.com — free trial credits included',
                                    'Create a Twilio phone number (free trial number available)',
                                    'From the Twilio Console, copy your Account SID and Auth Token',
                                    'Enter the Twilio number as "From number" and your mobile as "Alert number"',
                                ]}
                            >
                                {config?.notifications?.sms?.configured && (
                                    <Alert severity="success" sx={{ borderRadius: 2, py: 0.5 }}>
                                        SMS is configured. Enter new values below to update.
                                    </Alert>
                                )}
                                <CredentialField
                                    label="Twilio Account SID"
                                    value={smsSid}
                                    onChange={setSmsSid}
                                    placeholder={config?.notifications?.sms?.configured ? '  (leave blank to keep existing)' : 'ACxxxxxxxxxx'}
                                />
                                <CredentialField
                                    label="Auth Token"
                                    value={smsAuth}
                                    onChange={setSmsAuth}
                                    secret
                                    placeholder={config?.notifications?.sms?.configured ? '••••••••  (leave blank to keep existing)' : 'Your auth token...'}
                                />
                                <CredentialField
                                    label="From number (Twilio)"
                                    value={smsFrom}
                                    onChange={setSmsFrom}
                                    placeholder="+15550001234"
                                />
                                <CredentialField
                                    label="Alert number (your mobile)"
                                    value={smsTo}
                                    onChange={setSmsTo}
                                    placeholder="+15559876543"
                                />
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={smsEnabled}
                                            onChange={e => setSmsEnabled(e.target.checked)}
                                            size="small"
                                        />
                                    }
                                    label={<Typography variant="body2">Enable SMS alerts</Typography>}
                                />
                                {config?.notifications?.sms?.configured && (
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<Send fontSize="small" />}
                                        sx={{ borderRadius: 2, textTransform: 'none', alignSelf: 'flex-start' }}
                                        onClick={async () => {
                                            try {
                                                await axios.post(`${API_BASE}/api/config/test-notification`, { channel: 'sms' }, { headers: authHeaders });
                                                toast.success('Test SMS sent');
                                            } catch {
                                                toast.error('Failed to send SMS — check Twilio credentials');
                                            }
                                        }}
                                    >
                                        Send test SMS
                                    </Button>
                                )}
                            </NotifForm>

                            {/* Alert events reference */}
                            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                <Typography fontWeight={600} gutterBottom>What triggers alerts?</Typography>
                                <Grid container spacing={1} sx={{ mt: 0.5 }}>
                                    {[
                                        'Trade entry (buy signal)',
                                        'Trade exit (profit target hit)',
                                        'Stop loss triggered',
                                        'End-of-day position close',
                                        'Circuit breaker activated',
                                        'Daily P&L summary (9 PM EST)',
                                    ].map(event => (
                                        <Grid item xs={12} sm={6} key={event}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CheckCircle sx={{ fontSize: 14, color: 'success.main' }} />
                                                <Typography variant="body2" color="text.secondary">{event}</Typography>
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Paper>

                        </Stack>
                    </Box>
                )}

                {/* ── FUND MANAGEMENT ── */}
                {activeSection === 'funds' && (
                    <Box>
                        <SectionTitle
                            label="Fund Management"
                            sub="Deposit, withdraw, and track capital across all connected broker accounts."
                        />
                        <FundManagement config={config} />
                    </Box>
                )}

                {/* ── BOT STATUS / USER PROFILE FOOTER ── */}
                <Paper
                    sx={{
                        mt: 6,
                        p: 3,
                        borderRadius: 3,
                        border: '1px solid',
                        borderColor: 'divider',
                        background: 'rgba(13, 17, 23, 0.5)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    {/* Bot Status + Version */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                        <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                <Box
                                    sx={{
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        bgcolor: '#10b981',
                                        boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
                                        animation: 'pulseGlow 2s ease-in-out infinite',
                                    }}
                                />
                                <Typography variant="body1" fontWeight={600}>Bot Active</Typography>
                            </Box>
                            <Typography variant="caption" color="text.secondary">Version 1.0.0</Typography>
                        </Box>
                    </Box>

                    <Divider sx={{ mb: 2.5 }} />

                    {/* User Profile */}
                    {user && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Avatar
                                sx={{
                                    width: 48,
                                    height: 48,
                                    fontSize: '1.1rem',
                                    fontWeight: 700,
                                    bgcolor: alpha('#10b981', 0.15),
                                    color: '#34d399',
                                    border: `2px solid ${alpha('#10b981', 0.3)}`,
                                }}
                            >
                                {(user.name || user.email)?.[0]?.toUpperCase() || 'U'}
                            </Avatar>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography
                                    variant="body1"
                                    fontWeight={600}
                                    sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {user.name || user.email?.split('@')[0]}
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                    {user.email}
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {/* Logout Button */}
                    <Button
                        variant="outlined"
                        fullWidth
                        startIcon={<Logout />}
                        onClick={logout}
                        sx={{
                            mt: 2.5,
                            py: 1.2,
                            borderRadius: 2.5,
                            borderColor: alpha('#ef4444', 0.3),
                            color: '#f87171',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                borderColor: '#ef4444',
                                bgcolor: alpha('#ef4444', 0.08),
                            },
                        }}
                    >
                        Logout
                    </Button>
                </Paper>
            </Box>
        </Box>
        </>
    );
}
