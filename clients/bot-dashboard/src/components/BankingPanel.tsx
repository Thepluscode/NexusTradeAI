import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Button,
    Chip,
    Divider,
    Stack,
    Avatar,
    LinearProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    InputAdornment,
    IconButton,
    Tooltip,
} from '@mui/material';
import {
    AccountBalanceWallet,
    TrendingUp,
    TrendingDown,
    ShowChart,
    CurrencyExchange,
    CurrencyBitcoin,
    Refresh,
    AddCircleOutline,
    RemoveCircleOutline,
    ScienceOutlined,
    OpenInNew,
} from '@mui/icons-material';
import axios from 'axios';
import { useQuery } from 'react-query';
import toast from 'react-hot-toast';
import { SERVICE_URLS } from '@/services/api';

// ── Data fetching ──────────────────────────────────────────────────────────

async function fetchStockAccount() {
    const res = await axios.get(`${SERVICE_URLS.stockBot}/api/accounts/summary`, { timeout: 5000 });
    return res.data?.data || res.data;
}

async function fetchForexAccount() {
    try {
        const res = await axios.get(`${SERVICE_URLS.forexBot}/api/accounts/summary`, { timeout: 3000 });
        return res.data?.data || res.data;
    } catch {
        return null;
    }
}

async function fetchCryptoAccount() {
    try {
        const res = await axios.get(`${SERVICE_URLS.cryptoBot}/api/crypto/status`, { timeout: 3000 });
        const d = res.data?.data || res.data;
        return { equity: d?.equity || d?.portfolioValue || 0, mode: d?.mode || 'DEMO' };
    } catch {
        return null;
    }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
    return (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                {label}
            </Typography>
            <Typography variant="h6" fontWeight={700} color={color || 'text.primary'}>
                {value}
            </Typography>
        </Box>
    );
}

function BrokerRow({
    icon,
    name,
    mode,
    equity,
    pnl,
    pnlPercent,
    accentColor,
    online,
    infoUrl,
}: {
    icon: React.ReactElement;
    name: string;
    mode: string;
    equity: number | null;
    pnl?: number | null;
    pnlPercent?: number | null;
    accentColor: string;
    online: boolean;
    infoUrl?: string;
}) {
    return (
        <Box
            sx={{
                p: 2.5,
                borderRadius: 3,
                border: '1px solid',
                borderColor: online ? `${accentColor}40` : 'divider',
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                position: 'relative',
                overflow: 'hidden',
                '&::before': online ? {
                    content: '""',
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0,
                    width: 3,
                    bgcolor: accentColor,
                    borderRadius: '3px 0 0 3px',
                } : {},
            }}
        >
            <Avatar sx={{ bgcolor: `${accentColor}20`, color: accentColor, width: 44, height: 44 }}>
                {icon}
            </Avatar>

            <Box sx={{ flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography fontWeight={600}>{name}</Typography>
                    <Chip
                        label={mode}
                        size="small"
                        sx={{
                            bgcolor: `${accentColor}20`,
                            color: accentColor,
                            fontWeight: 700,
                            fontSize: 10,
                            height: 20,
                        }}
                    />
                    {!online && (
                        <Chip label="Offline" size="small" color="default" sx={{ height: 20, fontSize: 10 }} />
                    )}
                </Box>
                {online && equity != null && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3 }}>
                        Equity: <strong style={{ color: '#fff' }}>${equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                    </Typography>
                )}
                {!online && (
                    <Typography variant="caption" color="text.secondary">Bot not running</Typography>
                )}
            </Box>

            <Box sx={{ textAlign: 'right' }}>
                {online && pnl != null ? (
                    <>
                        <Typography
                            variant="h6"
                            fontWeight={700}
                            color={pnl >= 0 ? 'success.main' : 'error.main'}
                        >
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                        </Typography>
                        {pnlPercent != null && (
                            <Typography variant="caption" color={pnl >= 0 ? 'success.main' : 'error.main'}>
                                {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                            </Typography>
                        )}
                    </>
                ) : online ? (
                    <Typography variant="body2" color="text.secondary">—</Typography>
                ) : null}
                {infoUrl && (
                    <Tooltip title="Open broker dashboard">
                        <IconButton size="small" href={infoUrl} target="_blank" rel="noopener" sx={{ ml: 0.5 }}>
                            <OpenInNew sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
        </Box>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

export const BankingPanel: React.FC = () => {
    const [depositOpen, setDepositOpen] = useState(false);
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [amount, setAmount] = useState('');

    const {
        data: stockAcct,
        isLoading: stockLoading,
        refetch: refetchStock,
    } = useQuery('bankingStockAcct', fetchStockAccount, { refetchInterval: 15000 });

    const {
        data: forexAcct,
        refetch: refetchForex,
    } = useQuery('bankingForexAcct', fetchForexAccount, { refetchInterval: 15000 });

    const {
        data: cryptoAcct,
        refetch: refetchCrypto,
    } = useQuery('bankingCryptoAcct', fetchCryptoAccount, { refetchInterval: 15000 });

    const refetchAll = () => { refetchStock(); refetchForex(); refetchCrypto(); };

    const stockEquity = stockAcct?.realAccount?.equity ?? stockAcct?.demoAccount?.equity ?? 0;
    const stockPnl = stockAcct?.realAccount?.pnl ?? 0;
    const stockPnlPct = stockAcct?.realAccount?.pnlPercent ?? 0;
    const forexEquity = forexAcct?.balance ?? forexAcct?.equity ?? null;
    const cryptoEquity = cryptoAcct?.equity ?? null;

    const totalEquity = stockEquity + (forexEquity ?? 0) + (cryptoEquity ?? 0);
    const drawdownPct = stockEquity > 0 ? ((100000 - stockEquity) / 100000) * 100 : 0;

    const isPaper = true; // Always paper until REAL_TRADING_ENABLED=true

    const handleAction = (type: 'deposit' | 'withdraw') => {
        if (!amount || isNaN(parseFloat(amount))) {
            toast.error('Enter a valid amount');
            return;
        }
        toast.error(`Connect a live broker account to ${type} funds. Currently in Paper Trading mode.`);
        if (type === 'deposit') {
            setDepositOpen(false);
        } else {
            setWithdrawOpen(false);
        }
        setAmount('');
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <AccountBalanceWallet color="primary" />
                    <Typography variant="h6" fontWeight={700}>Banking & Funds</Typography>
                    {isPaper && (
                        <Chip
                            icon={<ScienceOutlined sx={{ fontSize: '14px !important' }} />}
                            label="Paper Mode"
                            color="primary"
                            size="small"
                            sx={{ fontWeight: 600 }}
                        />
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        variant="contained"
                        size="small"
                        color="success"
                        startIcon={<AddCircleOutline />}
                        onClick={() => setDepositOpen(true)}
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Deposit
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        color="warning"
                        startIcon={<RemoveCircleOutline />}
                        onClick={() => setWithdrawOpen(true)}
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
                    >
                        Withdraw
                    </Button>
                    <Tooltip title="Refresh">
                        <IconButton onClick={refetchAll} size="small">
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* Paper mode alert */}
            {isPaper && (
                <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                    All accounts are in <strong>paper trading mode</strong>. No real capital is at risk. Enable live trading in Settings → Trading Mode to trade with real funds.
                </Alert>
            )}

            {/* Portfolio summary */}
            <Card sx={{ mb: 3, background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)' }}>
                <CardContent>
                    <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1.5 }}>
                        Total Portfolio Value
                    </Typography>
                    <Typography variant="h3" fontWeight={800} sx={{ mt: 0.5, mb: 2 }}>
                        ${stockLoading ? '—' : totalEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </Typography>
                    {stockLoading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}
                    <Grid container spacing={2}>
                        <Grid item xs={6} sm={3}>
                            <StatBox
                                label="Stock Equity"
                                value={`$${stockEquity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
                                color="#10b981"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatBox
                                label="Total P&L"
                                value={`${stockPnl >= 0 ? '+' : ''}$${stockPnl.toFixed(2)}`}
                                color={stockPnl >= 0 ? '#10b981' : '#ef4444'}
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatBox
                                label="Return"
                                value={`${stockPnlPct >= 0 ? '+' : ''}${stockPnlPct.toFixed(2)}%`}
                                color={stockPnlPct >= 0 ? '#10b981' : '#ef4444'}
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <StatBox
                                label="Drawdown"
                                value={`${drawdownPct.toFixed(2)}%`}
                                color={drawdownPct > 10 ? '#ef4444' : drawdownPct > 5 ? '#f59e0b' : '#10b981'}
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Broker accounts */}
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1.5, textTransform: 'uppercase', letterSpacing: 1 }}>
                Connected Accounts
            </Typography>
            <Stack spacing={1.5} sx={{ mb: 3 }}>
                <BrokerRow
                    icon={<ShowChart />}
                    name="Alpaca Markets"
                    mode={stockAcct?.realAccount ? 'Paper' : 'Paper'}
                    equity={stockEquity}
                    pnl={stockPnl}
                    pnlPercent={stockPnlPct}
                    accentColor="#10b981"
                    online={!!stockAcct}
                    infoUrl="https://app.alpaca.markets/paper/dashboard/"
                />
                <BrokerRow
                    icon={<CurrencyExchange />}
                    name="OANDA"
                    mode={forexAcct ? 'Practice' : 'Not configured'}
                    equity={forexEquity}
                    accentColor="#3b82f6"
                    online={!!forexAcct}
                />
                <BrokerRow
                    icon={<CurrencyBitcoin />}
                    name="Crypto Exchange"
                    mode={cryptoAcct?.mode || 'Demo'}
                    equity={cryptoEquity}
                    accentColor="#f59e0b"
                    online={!!cryptoAcct}
                />
            </Stack>

            {/* Starting capital reference */}
            <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Starting capital</Typography>
                    <Typography variant="body2" fontWeight={600}>$100,000.00</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2" color="text.secondary">Current equity</Typography>
                    <Typography variant="body2" fontWeight={600}>${stockEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}</Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">Net P&L</Typography>
                    <Typography
                        variant="body1"
                        fontWeight={700}
                        color={stockPnl >= 0 ? 'success.main' : 'error.main'}
                        sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                    >
                        {stockPnl >= 0 ? <TrendingUp fontSize="small" /> : <TrendingDown fontSize="small" />}
                        {stockPnl >= 0 ? '+' : ''}${stockPnl.toFixed(2)}
                    </Typography>
                </Box>
            </Box>

            {/* Deposit dialog */}
            <Dialog open={depositOpen} onClose={() => setDepositOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Deposit Funds</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
                        In paper trading mode. Deposits are simulated.
                    </Alert>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Amount"
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                        sx={{ mt: 1 }}
                    />
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                        {['1000', '5000', '10000', '25000'].map(a => (
                            <Button key={a} size="small" variant="outlined" onClick={() => setAmount(a)}
                                sx={{ borderRadius: 2, textTransform: 'none', flex: 1 }}>
                                ${parseInt(a).toLocaleString()}
                            </Button>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDepositOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
                    <Button onClick={() => handleAction('deposit')} variant="contained" color="success"
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
                        Deposit
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Withdraw dialog */}
            <Dialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Withdraw Funds</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2, borderRadius: 2 }}>
                        Withdrawals require a live broker account with real funds.
                    </Alert>
                    <TextField
                        autoFocus
                        fullWidth
                        label="Amount"
                        type="number"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setWithdrawOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
                    <Button onClick={() => handleAction('withdraw')} variant="contained" color="warning"
                        sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}>
                        Withdraw
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
