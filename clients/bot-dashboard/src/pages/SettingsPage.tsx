import React from 'react';
import { useQuery } from 'react-query';
import {
    Box,
    Paper,
    Typography,
    Grid,
    Chip,
    Divider,
    CircularProgress,
    Alert,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
} from '@mui/material';
import {
    CheckCircle,
    Cancel,
    Settings,
    Security,
    Notifications,
    Hub,
} from '@mui/icons-material';
import { apiClient } from '@/services/api';

function SectionHeader({ icon, title }: { icon: React.ReactElement; title: string }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            {icon}
            <Typography variant="h6">{title}</Typography>
        </Box>
    );
}

function ConfigRow({ label, value, chip }: { label: string; value?: React.ReactNode; chip?: React.ReactElement }) {
    return (
        <ListItem sx={{ py: 0.75 }}>
            <ListItemText
                primary={label}
                primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
            />
            <ListItemSecondaryAction>
                {chip ?? <Typography variant="body2" fontWeight={500}>{value}</Typography>}
            </ListItemSecondaryAction>
        </ListItem>
    );
}

export default function SettingsPage() {
    const { data: config, isLoading, isError } = useQuery(
        'botConfig',
        () => apiClient.getBotConfig(),
        { refetchInterval: 30000 }
    );

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                <Settings fontSize="large" />
                <Typography variant="h4" fontWeight={700}>Settings</Typography>
            </Box>

            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                    <CircularProgress />
                </Box>
            )}

            {isError && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                    Could not load live config — stock bot may be offline. Showing last known values.
                </Alert>
            )}

            <Grid container spacing={3}>
                {/* Trading Limits */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3 }}>
                        <SectionHeader icon={<Security color="primary" />} title="Anti-Churning Limits" />
                        <Divider sx={{ mb: 1 }} />
                        <List disablePadding>
                            <ConfigRow
                                label="Max trades per day"
                                value={config?.trading?.maxTradesPerDay ?? 15}
                            />
                            <ConfigRow
                                label="Max trades per symbol"
                                value={config?.trading?.maxTradesPerSymbol ?? 3}
                            />
                            <ConfigRow
                                label="Min time between trades"
                                value={`${config?.trading?.minTimeBetweenTradesMins ?? 10} min`}
                            />
                            <ConfigRow
                                label="Stop-out cooldown"
                                value={`${config?.trading?.stopOutCooldownMins ?? 60} min`}
                            />
                            <ConfigRow
                                label="Real trading enabled"
                                chip={
                                    <Chip
                                        label={config?.trading?.realTradingEnabled ? 'LIVE' : 'PAPER'}
                                        color={config?.trading?.realTradingEnabled ? 'error' : 'success'}
                                        size="small"
                                    />
                                }
                            />
                        </List>
                    </Paper>
                </Grid>

                {/* Broker */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3 }}>
                        <SectionHeader icon={<Hub color="info" />} title="Broker Connection" />
                        <Divider sx={{ mb: 1 }} />
                        <List disablePadding>
                            <ConfigRow
                                label="Alpaca base URL"
                                value={config?.broker?.baseURL ?? 'https://paper-api.alpaca.markets'}
                            />
                            <ConfigRow
                                label="API key"
                                chip={
                                    config?.broker?.apiKeyConfigured
                                        ? <Chip icon={<CheckCircle />} label="Configured" color="success" size="small" />
                                        : <Chip icon={<Cancel />} label="Missing" color="error" size="small" />
                                }
                            />
                            <ConfigRow
                                label="Secret key"
                                chip={
                                    config?.broker?.secretKeyConfigured
                                        ? <Chip icon={<CheckCircle />} label="Configured" color="success" size="small" />
                                        : <Chip icon={<Cancel />} label="Missing" color="error" size="small" />
                                }
                            />
                        </List>
                    </Paper>
                </Grid>

                {/* Alerts */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3 }}>
                        <SectionHeader icon={<Notifications color="warning" />} title="Alerts" />
                        <Divider sx={{ mb: 1 }} />
                        <List disablePadding>
                            <ConfigRow
                                label="Telegram alerts"
                                chip={
                                    <Chip
                                        label={config?.alerts?.telegramEnabled ? 'Enabled' : 'Disabled'}
                                        color={config?.alerts?.telegramEnabled ? 'success' : 'default'}
                                        size="small"
                                    />
                                }
                            />
                            <ConfigRow
                                label="Telegram credentials"
                                chip={
                                    config?.alerts?.telegramConfigured
                                        ? <Chip icon={<CheckCircle />} label="Configured" color="success" size="small" />
                                        : <Chip icon={<Cancel />} label="Missing" color="default" size="small" />
                                }
                            />
                            <ConfigRow
                                label="SMS alerts"
                                chip={
                                    <Chip
                                        label={config?.alerts?.smsEnabled ? 'Enabled' : 'Disabled'}
                                        color={config?.alerts?.smsEnabled ? 'success' : 'default'}
                                        size="small"
                                    />
                                }
                            />
                        </List>
                    </Paper>
                </Grid>

                {/* Service Ports */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 3 }}>
                        <SectionHeader icon={<Hub color="secondary" />} title="Service Ports" />
                        <Divider sx={{ mb: 1 }} />
                        <List disablePadding>
                            <ConfigRow label="Stock Bot" value={`Port ${config?.ports?.stockBot ?? 3002}`} />
                            <ConfigRow label="Market Data" value={`Port ${config?.ports?.marketData ?? 3001}`} />
                            <ConfigRow label="Forex Bot" value={`Port ${config?.ports?.forexBot ?? 3005}`} />
                            <ConfigRow label="Crypto Bot" value={`Port ${config?.ports?.cryptoBot ?? 3006}`} />
                            <ConfigRow label="AI Service" value={`Port ${config?.ports?.aiService ?? 5001}`} />
                        </List>
                    </Paper>
                </Grid>

                {/* Edit reminder */}
                <Grid item xs={12}>
                    <Alert severity="info">
                        Trading parameters are set in <code>.env</code> and <code>unified-trading-bot.js</code>.
                        Restart the bot after making changes.
                    </Alert>
                </Grid>
            </Grid>
        </Box>
    );
}
