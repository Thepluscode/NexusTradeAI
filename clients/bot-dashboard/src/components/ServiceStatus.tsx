import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Chip,
    CircularProgress,
    Tooltip,
    IconButton,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import { useServicesHealth } from '@/hooks/useServices';
import type { ServiceHealth } from '@/types';

const getStatusIcon = (status: ServiceHealth['status']) => {
    switch (status) {
        case 'online':
            return <CheckCircleIcon sx={{ color: '#66bb6a' }} />;
        case 'degraded':
            return <WarningIcon sx={{ color: '#ffa726' }} />;
        case 'offline':
            return <ErrorIcon sx={{ color: '#f44336' }} />;
        default:
            return <WarningIcon sx={{ color: '#757575' }} />;
    }
};

const getStatusColor = (status: ServiceHealth['status']): 'success' | 'warning' | 'error' | 'default' => {
    switch (status) {
        case 'online':
            return 'success';
        case 'degraded':
            return 'warning';
        case 'offline':
            return 'error';
        default:
            return 'default';
    }
};

export const ServiceStatus: React.FC = () => {
    const { data: services, isLoading, isError, refetch } = useServicesHealth();

    if (isLoading) {
        return (
            <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
                <CardContent>
                    <Box display="flex" justifyContent="center" alignItems="center" p={3}>
                        <CircularProgress size={40} />
                        <Typography sx={{ ml: 2 }}>Checking service health...</Typography>
                    </Box>
                </CardContent>
            </Card>
        );
    }

    if (isError) {
        return (
            <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
                <CardContent>
                    <Typography color="error">Failed to fetch service status</Typography>
                </CardContent>
            </Card>
        );
    }

    const onlineCount = services?.filter(s => s.status === 'online').length || 0;
    const totalCount = services?.length || 0;

    return (
        <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box>
                        <Typography variant="h6" fontWeight={600}>
                            Backend Services
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {onlineCount} of {totalCount} services online
                        </Typography>
                    </Box>
                    <Tooltip title="Refresh">
                        <IconButton onClick={() => refetch()} size="small">
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Box>

                <Grid container spacing={2}>
                    {services?.map((service) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={service.name}>
                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: 2,
                                    bgcolor: 'background.default',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1.5,
                                    transition: 'all 0.2s',
                                    '&:hover': {
                                        transform: 'translateY(-2px)',
                                        boxShadow: 3,
                                    },
                                }}
                            >
                                {getStatusIcon(service.status)}
                                <Box flex={1}>
                                    <Typography variant="body2" fontWeight={500}>
                                        {service.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        Port: {service.port}
                                    </Typography>
                                </Box>
                                <Box textAlign="right">
                                    <Chip
                                        label={service.status}
                                        size="small"
                                        color={getStatusColor(service.status)}
                                        sx={{ textTransform: 'capitalize' }}
                                    />
                                    {service.latency && service.status === 'online' && (
                                        <Typography variant="caption" display="block" color="text.secondary">
                                            {service.latency}ms
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        </Grid>
                    ))}
                </Grid>
            </CardContent>
        </Card>
    );
};
