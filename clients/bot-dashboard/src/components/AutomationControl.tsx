import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    Switch,
    FormControlLabel,
    CircularProgress,
    Chip,
    Alert,
    Grid,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import WarningIcon from '@mui/icons-material/Warning';
import {
    useAutomationStatus,
    useStartAutomation,
    useStopAutomation,
    useEnableRealTrading,
    useDisableRealTrading,
} from '@/hooks/useAutomation';
import toast from 'react-hot-toast';

export const AutomationControl: React.FC = () => {
    const { data: status, isLoading } = useAutomationStatus();
    const startMutation = useStartAutomation();
    const stopMutation = useStopAutomation();
    const enableRealMutation = useEnableRealTrading();
    const disableRealMutation = useDisableRealTrading();

    const handleStart = async () => {
        try {
            await startMutation.mutateAsync(undefined);
            toast.success('Automation started!');
        } catch {
            toast.error('Failed to start automation');
        }
    };

    const handleStop = async () => {
        try {
            await stopMutation.mutateAsync();
            toast.success('Automation stopped');
        } catch {
            toast.error('Failed to stop automation');
        }
    };

    const handleRealTradingToggle = async (enabled: boolean) => {
        try {
            if (enabled) {
                const result = await enableRealMutation.mutateAsync();
                toast.success(result.confirmation);
            } else {
                const result = await disableRealMutation.mutateAsync();
                toast.success(result.confirmation);
            }
        } catch {
            toast.error('Failed to toggle real trading mode');
        }
    };

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
                <Typography variant="h6" fontWeight={600} mb={2}>
                    Automation Control
                </Typography>

                {status?.realTradingEnabled && (
                    <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
                        <strong>LIVE TRADING ACTIVE</strong> - Real money is being used for trades
                    </Alert>
                )}

                <Grid container spacing={2} mb={2}>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">Status</Typography>
                            <Chip
                                label={status?.isRunning ? 'Running' : 'Stopped'}
                                color={status?.isRunning ? 'success' : 'default'}
                                sx={{ mt: 1 }}
                            />
                        </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">Mode</Typography>
                            <Chip
                                label={status?.mode || 'Paper'}
                                color={status?.mode === 'LIVE' ? 'error' : 'info'}
                                sx={{ mt: 1 }}
                            />
                        </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">Strategies</Typography>
                            <Typography variant="h5" fontWeight={600}>{status?.strategiesActive || 0}</Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'background.default', textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">Today's Trades</Typography>
                            <Typography variant="h5" fontWeight={600}>{status?.tradesExecutedToday || 0}</Typography>
                        </Box>
                    </Grid>
                </Grid>

                <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                    {status?.isRunning ? (
                        <Button
                            variant="contained"
                            color="error"
                            startIcon={<StopIcon />}
                            onClick={handleStop}
                            disabled={stopMutation.isLoading}
                        >
                            Stop Automation
                        </Button>
                    ) : (
                        <Button
                            variant="contained"
                            color="success"
                            startIcon={<PlayArrowIcon />}
                            onClick={handleStart}
                            disabled={startMutation.isLoading}
                        >
                            Start Automation
                        </Button>
                    )}

                    <FormControlLabel
                        control={
                            <Switch
                                checked={status?.realTradingEnabled || false}
                                onChange={(e) => handleRealTradingToggle(e.target.checked)}
                                color="error"
                                disabled={enableRealMutation.isLoading || disableRealMutation.isLoading}
                            />
                        }
                        label={
                            <Box>
                                <Typography variant="body2" fontWeight={500}>
                                    Real Trading
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {status?.realTradingEnabled ? 'Using real money' : 'Paper trading mode'}
                                </Typography>
                            </Box>
                        }
                    />
                </Box>
            </CardContent>
        </Card>
    );
};
