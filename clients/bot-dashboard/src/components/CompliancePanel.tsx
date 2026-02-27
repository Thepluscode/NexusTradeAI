import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Chip,
    CircularProgress,
    LinearProgress,
    IconButton,
    Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';
import { useComplianceStatus } from '@/hooks/useCompliance';

export const CompliancePanel: React.FC = () => {
    const { gdpr, aml, isLoading, isError, refetch } = useComplianceStatus();

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

    if (isError) {
        return (
            <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
                <CardContent>
                    <Typography color="error">Failed to fetch compliance status</Typography>
                </CardContent>
            </Card>
        );
    }

    const getStatusIcon = (status: string) => {
        const isCompliant = status.toLowerCase().includes('compliant');
        return isCompliant ? (
            <CheckCircleIcon sx={{ color: '#66bb6a' }} />
        ) : (
            <WarningIcon sx={{ color: '#ffa726' }} />
        );
    };

    return (
        <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <SecurityIcon color="primary" />
                        <Typography variant="h6" fontWeight={600}>
                            Compliance Status
                        </Typography>
                    </Box>
                    <Tooltip title="Refresh">
                        <IconButton onClick={refetch} size="small">
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Grid container spacing={2}>
                    {/* GDPR */}
                    <Grid item xs={12} md={6}>
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: 'background.default',
                                border: '1px solid',
                                borderColor: gdpr?.status === 'compliant' ? 'success.main' : 'warning.main',
                            }}
                        >
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    GDPR
                                </Typography>
                                {getStatusIcon(gdpr?.status || '')}
                            </Box>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="body2" color="text.secondary">Status</Typography>
                                <Chip
                                    label={gdpr?.status?.toUpperCase() || 'Unknown'}
                                    size="small"
                                    color={gdpr?.status === 'compliant' ? 'success' : 'warning'}
                                />
                            </Box>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="body2" color="text.secondary">Last Audit</Typography>
                                <Typography variant="body2">
                                    {gdpr?.lastAudit ? new Date(gdpr.lastAudit).toLocaleDateString() : 'N/A'}
                                </Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="body2" color="text.secondary">Violations</Typography>
                                <Typography
                                    variant="body2"
                                    color={(gdpr?.violations || 0) === 0 ? 'success.main' : 'error.main'}
                                >
                                    {gdpr?.violations || 0}
                                </Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2" color="text.secondary">Data Retention</Typography>
                                <Chip
                                    label={gdpr?.dataRetentionCompliance ? 'Compliant' : 'Non-Compliant'}
                                    size="small"
                                    color={gdpr?.dataRetentionCompliance ? 'success' : 'error'}
                                />
                            </Box>
                        </Box>
                    </Grid>

                    {/* AML */}
                    <Grid item xs={12} md={6}>
                        <Box
                            sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: 'background.default',
                                border: '1px solid',
                                borderColor: aml?.status === 'Compliant' ? 'success.main' : 'warning.main',
                            }}
                        >
                            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="subtitle1" fontWeight={600}>
                                    AML
                                </Typography>
                                {getStatusIcon(aml?.status || '')}
                            </Box>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="body2" color="text.secondary">Status</Typography>
                                <Chip
                                    label={aml?.status || 'Unknown'}
                                    size="small"
                                    color={aml?.status === 'Compliant' ? 'success' : 'warning'}
                                />
                            </Box>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="body2" color="text.secondary">Risk Score</Typography>
                                <Chip
                                    label={aml?.riskScore || 'N/A'}
                                    size="small"
                                    color={
                                        aml?.riskScore === 'Low' ? 'success' :
                                            aml?.riskScore === 'Medium' ? 'warning' : 'error'
                                    }
                                />
                            </Box>
                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="body2" color="text.secondary">Flagged Transactions</Typography>
                                <Typography
                                    variant="body2"
                                    color={(aml?.flaggedTransactions || 0) === 0 ? 'success.main' : 'error.main'}
                                >
                                    {aml?.flaggedTransactions || 0}
                                </Typography>
                            </Box>
                            <Box>
                                <Box display="flex" justifyContent="space-between" mb={0.5}>
                                    <Typography variant="body2" color="text.secondary">Compliance Rate</Typography>
                                    <Typography variant="body2">{aml?.complianceRate?.toFixed(1) || 0}%</Typography>
                                </Box>
                                <LinearProgress
                                    variant="determinate"
                                    value={aml?.complianceRate || 0}
                                    sx={{ height: 6, borderRadius: 3 }}
                                    color={(aml?.complianceRate || 0) >= 95 ? 'success' : 'warning'}
                                />
                            </Box>
                        </Box>
                    </Grid>
                </Grid>
            </CardContent>
        </Card>
    );
};
