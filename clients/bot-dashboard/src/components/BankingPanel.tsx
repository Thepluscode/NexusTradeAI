import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Button,
    TextField,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import {
    useBankAccounts,
    useTradingAccountBalance,
    useTransactions,
    useDeposit,
    useWithdraw,
} from '@/hooks/useBanking';
import toast from 'react-hot-toast';

export const BankingPanel: React.FC = () => {
    const { isLoading: loadingAccounts, refetch: refetchAccounts } = useBankAccounts();
    const { data: tradingAccount, isLoading: loadingTrading, refetch: refetchTrading } = useTradingAccountBalance();
    const { data: transactions, isLoading: loadingTx, refetch: refetchTx } = useTransactions(10);

    const depositMutation = useDeposit();
    const withdrawMutation = useWithdraw();

    const [depositOpen, setDepositOpen] = useState(false);
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [amount, setAmount] = useState('');
    const [selectedAccount] = useState('default');

    const handleDeposit = async () => {
        try {
            await depositMutation.mutateAsync({ amount: parseFloat(amount), fromAccountId: selectedAccount });
            toast.success(`Successfully deposited $${amount}`);
            setDepositOpen(false);
            setAmount('');
        } catch {
            toast.error('Deposit failed');
        }
    };

    const handleWithdraw = async () => {
        try {
            await withdrawMutation.mutateAsync({ amount: parseFloat(amount), toAccountId: selectedAccount });
            toast.success(`Successfully withdrew $${amount}`);
            setWithdrawOpen(false);
            setAmount('');
        } catch {
            toast.error('Withdrawal failed');
        }
    };

    const isLoading = loadingAccounts || loadingTrading || loadingTx;

    if (isLoading) {
        return (
            <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
                <CardContent>
                    <Box display="flex" justifyContent="center" alignItems="center" p={3}>
                        <CircularProgress size={40} />
                    </Box>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <AccountBalanceIcon color="primary" />
                        <Typography variant="h6" fontWeight={600}>
                            Banking & Funds
                        </Typography>
                    </Box>
                    <Box>
                        <Button
                            variant="contained"
                            color="success"
                            size="small"
                            startIcon={<ArrowDownwardIcon />}
                            onClick={() => setDepositOpen(true)}
                            sx={{ mr: 1 }}
                        >
                            Deposit
                        </Button>
                        <Button
                            variant="outlined"
                            color="warning"
                            size="small"
                            startIcon={<ArrowUpwardIcon />}
                            onClick={() => setWithdrawOpen(true)}
                        >
                            Withdraw
                        </Button>
                        <Tooltip title="Refresh">
                            <IconButton onClick={() => { refetchAccounts(); refetchTrading(); refetchTx(); }} size="small" sx={{ ml: 1 }}>
                                <RefreshIcon />
                            </IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                <Grid container spacing={2} mb={3}>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                            <Typography variant="body2" color="text.secondary">Equity</Typography>
                            <Typography variant="h5" fontWeight={600} color="primary.main">
                                ${tradingAccount?.equity?.toLocaleString() || '0'}
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                            <Typography variant="body2" color="text.secondary">Cash</Typography>
                            <Typography variant="h5" fontWeight={600}>
                                ${tradingAccount?.cash?.toLocaleString() || '0'}
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                            <Typography variant="body2" color="text.secondary">Buying Power</Typography>
                            <Typography variant="h5" fontWeight={600} color="success.main">
                                ${tradingAccount?.buyingPower?.toLocaleString() || '0'}
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default' }}>
                            <Typography variant="body2" color="text.secondary">Today's P&L</Typography>
                            <Typography
                                variant="h5"
                                fontWeight={600}
                                color={(tradingAccount?.profitToday ?? 0) >= 0 ? 'success.main' : 'error.main'}
                            >
                                {tradingAccount?.profitToday != null
                                    ? `${tradingAccount.profitToday >= 0 ? '+' : ''}$${tradingAccount.profitToday.toFixed(2)}`
                                    : '—'}
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>

                <Typography variant="subtitle2" gutterBottom>
                    Recent Transactions
                </Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Type</TableCell>
                                <TableCell align="right">Amount</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Date</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {transactions?.length ? (
                                transactions.map((tx) => (
                                    <TableRow key={tx.id} hover>
                                        <TableCell>
                                            <Chip
                                                label={tx.type}
                                                size="small"
                                                color={tx.type === 'deposit' ? 'success' : tx.type === 'withdrawal' ? 'warning' : 'default'}
                                                sx={{ textTransform: 'capitalize' }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography
                                                variant="body2"
                                                color={tx.type === 'deposit' ? 'success.main' : 'warning.main'}
                                            >
                                                {tx.type === 'deposit' ? '+' : '-'}${tx.amount.toLocaleString()}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={tx.status}
                                                size="small"
                                                color={tx.status === 'completed' ? 'success' : tx.status === 'pending' ? 'warning' : 'error'}
                                            />
                                        </TableCell>
                                        <TableCell>{new Date(tx.timestamp).toLocaleDateString()}</TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={4} align="center">
                                        <Typography variant="body2" color="text.secondary">
                                            No recent transactions
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </CardContent>

            {/* Deposit Dialog */}
            <Dialog open={depositOpen} onClose={() => setDepositOpen(false)}>
                <DialogTitle>Deposit Funds</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Amount"
                        type="number"
                        fullWidth
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        InputProps={{ startAdornment: '$' }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDepositOpen(false)}>Cancel</Button>
                    <Button onClick={handleDeposit} variant="contained" color="success">
                        Deposit
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Withdraw Dialog */}
            <Dialog open={withdrawOpen} onClose={() => setWithdrawOpen(false)}>
                <DialogTitle>Withdraw Funds</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Amount"
                        type="number"
                        fullWidth
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        InputProps={{ startAdornment: '$' }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setWithdrawOpen(false)}>Cancel</Button>
                    <Button onClick={handleWithdraw} variant="contained" color="warning">
                        Withdraw
                    </Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
};
