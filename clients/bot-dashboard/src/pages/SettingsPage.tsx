import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
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
    LockOutlined,
    OpenInNew,
    Visibility,
    VisibilityOff,
    Save,
    Send,
} from '@mui/icons-material';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = 'http://localhost:3002';

// ─── API ────────────────────────────────────────────────────────────────────

async function fetchConfig() {
    const res = await axios.get(`${API_BASE}/api/config`, { timeout: 5000 });
    return res.data.data;
}

async function updateRisk(payload: { tier: string; stopLoss?: number; profitTarget?: number; positionSize?: number; maxPositions?: number }) {
    const res = await axios.post(`${API_BASE}/api/config/risk`, payload);
    return res.data;
}

async function saveCredentials(payload: { broker: string; credentials: Record<string, string> }) {
    const res = await axios.post(`${API_BASE}/api/config/credentials`, payload);
    return res.data;
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
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    secret?: boolean;
    placeholder?: string;
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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: `${accentColor}20`, color: accentColor, width: 42, height: 42 }}>
                        {icon}
                    </Avatar>
                    <Box>
                        <Typography fontWeight={700}>{name}</Typography>
                        <Typography variant="caption" color="text.secondary">{description}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

            <Stack spacing={2}>
                {children}
            </Stack>

            <Box sx={{ mt: 2.5 }}>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={isSaving ? <CircularProgress size={13} color="inherit" /> : <Save fontSize="small" />}
                    disabled={isSaving}
                    onClick={onSave}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                >
                    Save Credentials
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1.5 }}>
                    Keys saved to <code style={{ background: '#ffffff12', padding: '1px 5px', borderRadius: 3 }}>.env</code> — never transmitted externally
                </Typography>
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
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Avatar sx={{ bgcolor: `${accentColor}20`, color: accentColor, width: 42, height: 42 }}>
                        {icon}
                    </Avatar>
                    <Box>
                        <Typography fontWeight={700}>{name}</Typography>
                        <Typography variant="caption" color="text.secondary">{description}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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

            <Stack spacing={2}>
                {children}
            </Stack>

            <Box sx={{ mt: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <Button
                    variant="contained"
                    size="small"
                    startIcon={isSaving ? <CircularProgress size={13} color="inherit" /> : <Save fontSize="small" />}
                    disabled={isSaving}
                    onClick={onSave}
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

    const rr = vals.profitTarget / vals.stopLoss;

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

function FundManagement({ config }: { config: any }) {
    const [depositAmt, setDepositAmt] = useState('');
    const [withdrawAmt, setWithdrawAmt] = useState('');

    const isPaper = config?.trading?.mode !== 'live';

    return (
        <Stack spacing={3}>
            {isPaper && (
                <Alert
                    severity="info"
                    icon={<ScienceOutlined />}
                    sx={{ borderRadius: 2 }}
                >
                    You are in <strong>Paper Trading</strong> mode. No real funds are at risk. Switch to Live mode and connect a funded broker account to trade with real capital.
                </Alert>
            )}

            <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <AddCircleOutline sx={{ color: 'success.main' }} />
                            <Typography fontWeight={600}>Deposit Funds</Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            label="Amount"
                            value={depositAmt}
                            onChange={e => setDepositAmt(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start">$</InputAdornment>,
                            }}
                            sx={{ mb: 2 }}
                        />
                        <Stack spacing={1} sx={{ mb: 2 }}>
                            {['100', '500', '1000', '5000'].map(amt => (
                                <Button
                                    key={amt}
                                    variant="outlined"
                                    size="small"
                                    onClick={() => setDepositAmt(amt)}
                                    sx={{ borderRadius: 2, textTransform: 'none', justifyContent: 'flex-start' }}
                                >
                                    ${parseInt(amt).toLocaleString()}
                                </Button>
                            ))}
                        </Stack>
                        <Button
                            variant="contained"
                            fullWidth
                            disabled={!depositAmt || isPaper}
                            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                            onClick={() => toast.error('Connect a live broker account to deposit funds')}
                        >
                            {isPaper ? 'Requires Live Mode' : 'Deposit'}
                        </Button>
                    </Paper>
                </Grid>

                <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                            <RemoveCircleOutline sx={{ color: 'warning.main' }} />
                            <Typography fontWeight={600}>Withdraw Funds</Typography>
                        </Box>
                        <TextField
                            fullWidth
                            size="small"
                            label="Amount"
                            value={withdrawAmt}
                            onChange={e => setWithdrawAmt(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start">$</InputAdornment>,
                            }}
                            sx={{ mb: 2 }}
                        />
                        <Box sx={{ mb: 2, p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                            <Typography variant="caption" color="text.secondary">
                                Withdrawals route through your connected broker. Processing time: 1–3 business days.
                            </Typography>
                        </Box>
                        <Button
                            variant="outlined"
                            color="warning"
                            fullWidth
                            disabled={!withdrawAmt || isPaper}
                            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                            onClick={() => toast.error('Connect a live broker account to withdraw funds')}
                        >
                            {isPaper ? 'Requires Live Mode' : 'Withdraw'}
                        </Button>
                    </Paper>
                </Grid>
            </Grid>

            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <AccountBalanceWallet sx={{ color: 'primary.main' }} />
                    <Typography fontWeight={600}>Linked Broker Accounts</Typography>
                </Box>
                <Stack spacing={1.5}>
                    {[
                        { name: 'Alpaca Paper Account', balance: null, configured: config?.brokers?.alpaca?.configured, color: '#10b981' },
                        { name: 'OANDA Practice Account', balance: null, configured: config?.brokers?.oanda?.configured, color: '#3b82f6' },
                        { name: 'Crypto Exchange (Binance)', balance: null, configured: config?.brokers?.crypto?.configured, color: '#f59e0b' },
                    ].map(acct => (
                        <Box
                            key={acct.name}
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
                                <StatusDot ok={!!acct.configured} />
                                <Typography variant="body2" fontWeight={500}>{acct.name}</Typography>
                            </Box>
                            <Chip
                                label={acct.configured ? 'Connected' : 'Not configured'}
                                color={acct.configured ? 'success' : 'default'}
                                size="small"
                                variant={acct.configured ? 'filled' : 'outlined'}
                            />
                        </Box>
                    ))}
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
    const [cryptoExchange, setCryptoExchange] = useState('binance');
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

    const { data: config, isLoading } = useQuery('botConfig', fetchConfig, {
        refetchInterval: 30000,
        retry: 1,
    });

    const { mutate: saveRisk, isLoading: savingRisk } = useMutation(updateRisk, {
        onSuccess: () => {
            toast.success('Risk parameters updated');
            void queryClient.invalidateQueries('botConfig');
        },
        onError: () => { toast.error('Failed to update — is the Stock Bot running?'); },
    });

    const { mutate: saveCreds, isLoading: savingCreds, variables: savingFor } = useMutation(saveCredentials, {
        onSuccess: (_, vars) => {
            toast.success(`${vars.broker.charAt(0).toUpperCase() + vars.broker.slice(1)} credentials saved`);
            void queryClient.invalidateQueries('botConfig');
        },
        onError: () => { toast.error('Failed to save — is the Stock Bot running?'); },
    });

    const isPaper = config?.trading?.mode !== 'live';

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
            {/* ── Left nav ── */}
            <Box
                sx={{
                    width: 220,
                    flexShrink: 0,
                    borderRight: '1px solid',
                    borderColor: 'divider',
                    pt: 4,
                    px: 2,
                }}
            >
                <Typography variant="overline" color="text.secondary" sx={{ px: 1, letterSpacing: 1.5, fontSize: 11 }}>
                    Settings
                </Typography>
                <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                    {NAV.map(item => (
                        <Button
                            key={item.id}
                            onClick={() => setActiveSection(item.id)}
                            sx={{
                                justifyContent: 'flex-start',
                                textTransform: 'none',
                                borderRadius: 2,
                                px: 1.5,
                                py: 1,
                                fontWeight: activeSection === item.id ? 700 : 400,
                                color: activeSection === item.id ? 'primary.main' : 'text.secondary',
                                bgcolor: activeSection === item.id ? 'primary.main' + '15' : 'transparent',
                                '&:hover': { bgcolor: activeSection === item.id ? 'primary.main' + '20' : 'action.hover' },
                            }}
                        >
                            {item.label}
                        </Button>
                    ))}
                </Stack>
            </Box>

            {/* ── Content ── */}
            <Box sx={{ flex: 1, p: 4, maxWidth: 860, overflow: 'auto' }}>
                {isLoading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

                {/* ── TRADING MODE ── */}
                {activeSection === 'mode' && (
                    <Box>
                        <SectionTitle
                            label="Trading Mode"
                            sub="Switch between paper trading (simulated) and live trading with real capital."
                        />
                        <Stack spacing={3}>
                            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                                    : 'Real capital deployed — trades execute on your broker account'}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Chip
                                        label={isPaper ? 'PAPER' : 'LIVE'}
                                        color={isPaper ? 'primary' : 'error'}
                                        sx={{ fontWeight: 800, fontSize: 13, px: 1 }}
                                    />
                                </Box>

                                <Divider sx={{ my: 2.5 }} />

                                <Alert severity={isPaper ? 'info' : 'warning'} sx={{ borderRadius: 2, mb: 2 }}>
                                    {isPaper
                                        ? 'Paper trading is the safe default. All bots use virtual capital. Switching to live requires a funded broker account and changes REAL_TRADING_ENABLED in your .env file.'
                                        : '⚠️ Live trading is active. Real money is at risk. Ensure your risk parameters and position sizes are correct before running the bot.'}
                                </Alert>

                                <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                                    <Typography variant="body2" color="text.secondary" gutterBottom>
                                        To toggle trading mode, update <code style={{ background: '#ffffff12', padding: '2px 6px', borderRadius: 4 }}>REAL_TRADING_ENABLED</code> in your <code style={{ background: '#ffffff12', padding: '2px 6px', borderRadius: 4 }}>.env</code> file, then restart the bot.
                                    </Typography>
                                    <Box sx={{ mt: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        <Chip icon={<LockOutlined sx={{ fontSize: 14 }} />} label="Paper: REAL_TRADING_ENABLED=false" size="small" variant="outlined" />
                                        <Chip icon={<FlashOn sx={{ fontSize: 14 }} />} label="Live: REAL_TRADING_ENABLED=true" size="small" variant="outlined" color="error" />
                                    </Box>
                                </Box>
                            </Paper>

                            {/* Trading hours summary */}
                            <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                                <Typography fontWeight={600} gutterBottom>Trading Schedule</Typography>
                                <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                    {[
                                        { label: 'Stock Bot', hours: 'Mon–Fri  9:30 AM – 4:00 PM EST', color: '#10b981', active: true },
                                        { label: 'Forex Bot', hours: 'Sun 5 PM – Fri 5 PM EST (24/5)', color: '#3b82f6', active: config?.brokers?.oanda?.configured },
                                        { label: 'Crypto Bot', hours: '24 hours · 7 days a week', color: '#f59e0b', active: config?.brokers?.crypto?.configured },
                                    ].map(s => (
                                        <Grid item xs={12} key={s.label}>
                                            <Box
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
                                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.active ? s.color : '#555', boxShadow: s.active ? `0 0 6px ${s.color}` : 'none' }} />
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={600}>{s.label}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{s.hours}</Typography>
                                                    </Box>
                                                </Box>
                                                <Chip label={s.active ? 'Active' : 'Inactive'} color={s.active ? 'success' : 'default'} size="small" variant="outlined" />
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
                            sub="Enter API credentials for each trading venue. Keys are stored in your local .env file and never transmitted to third parties."
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
                                isSaving={savingCreds && (savingFor as any)?.broker === 'alpaca'}
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
                                isSaving={savingCreds && (savingFor as any)?.broker === 'oanda'}
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
                                setupUrl="https://testnet.binance.vision/"
                                setupLabel="Binance Testnet"
                                onSave={() => {
                                    const creds: Record<string, string> = {
                                        CRYPTO_EXCHANGE: cryptoExchange,
                                        CRYPTO_TESTNET: cryptoTestnet ? 'true' : 'false',
                                    };
                                    if (cryptoKey) creds.CRYPTO_API_KEY = cryptoKey;
                                    if (cryptoSecret) creds.CRYPTO_API_SECRET = cryptoSecret;
                                    saveCreds({ broker: 'crypto', credentials: creds });
                                }}
                                isSaving={savingCreds && (savingFor as any)?.broker === 'crypto'}
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
                                        <MenuItem value="binance">Binance</MenuItem>
                                        <MenuItem value="coinbase">Coinbase Advanced</MenuItem>
                                        <MenuItem value="kraken">Kraken</MenuItem>
                                        <MenuItem value="bybit">Bybit</MenuItem>
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
                                isSaving={savingCreds && (savingFor as any)?.broker === 'telegram'}
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
                                                await axios.post(`${API_BASE}/api/config/test-notification`, { channel: 'telegram' });
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
                                isSaving={savingCreds && (savingFor as any)?.broker === 'sms'}
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
            </Box>
        </Box>
    );
}
