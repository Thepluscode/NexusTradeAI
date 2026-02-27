import React from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Chip,
    CircularProgress,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Tooltip,
    LinearProgress,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScienceIcon from '@mui/icons-material/Science';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useStrategies, useTestStrategy } from '@/hooks/useStrategies';
import type { Strategy } from '@/types';
import toast from 'react-hot-toast';

const getStatusColor = (status: Strategy['status']): 'success' | 'warning' | 'error' | 'default' => {
    switch (status) {
        case 'active':
            return 'success';
        case 'paused':
            return 'warning';
        case 'inactive':
            return 'error';
        default:
            return 'default';
    }
};

export const StrategiesPanel: React.FC = () => {
    const { data: strategies, isLoading, isError, refetch } = useStrategies();
    const testMutation = useTestStrategy();

    const handleTest = async (strategyName: string) => {
        try {
            const result = await testMutation.mutateAsync(strategyName);
            toast.success(`${strategyName} test completed! Win Rate: ${result.winRate}%`);
        } catch (error) {
            toast.error(`Failed to test ${strategyName}`);
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

    if (isError) {
        return (
            <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
                <CardContent>
                    <Typography color="error">Failed to fetch strategies</Typography>
                </CardContent>
            </Card>
        );
    }

    const activeCount = strategies?.filter(s => s.status === 'active').length || 0;

    return (
        <Card sx={{ bgcolor: 'background.paper', mb: 2 }}>
            <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Box display="flex" alignItems="center" gap={1}>
                        <TrendingUpIcon color="primary" />
                        <Box>
                            <Typography variant="h6" fontWeight={600}>
                                Trading Strategies
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {activeCount} of {strategies?.length || 0} strategies active
                            </Typography>
                        </Box>
                    </Box>
                    <Tooltip title="Refresh">
                        <IconButton onClick={() => refetch()} size="small">
                            <RefreshIcon />
                        </IconButton>
                    </Tooltip>
                </Box>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Strategy</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="right">Win Rate</TableCell>
                                <TableCell align="right">Profit</TableCell>
                                <TableCell align="right">Trades</TableCell>
                                <TableCell align="center">Confidence</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {strategies?.map((strategy) => (
                                <TableRow key={strategy.name} hover>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={500}>
                                            {strategy.name}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={strategy.status}
                                            size="small"
                                            color={getStatusColor(strategy.status)}
                                            sx={{ textTransform: 'capitalize' }}
                                        />
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography
                                            variant="body2"
                                            color={strategy.winRate >= 60 ? 'success.main' : 'warning.main'}
                                        >
                                            {strategy.winRate.toFixed(1)}%
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography
                                            variant="body2"
                                            color={strategy.profit >= 0 ? 'success.main' : 'error.main'}
                                        >
                                            ${strategy.profit.toLocaleString()}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="body2">{strategy.trades}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <LinearProgress
                                                variant="determinate"
                                                value={strategy.confidence}
                                                sx={{ flex: 1, height: 6, borderRadius: 3 }}
                                                color={strategy.confidence >= 80 ? 'success' : strategy.confidence >= 60 ? 'warning' : 'error'}
                                            />
                                            <Typography variant="caption">{strategy.confidence}%</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Test Strategy">
                                            <IconButton
                                                size="small"
                                                onClick={() => handleTest(strategy.name)}
                                                disabled={testMutation.isLoading}
                                            >
                                                <ScienceIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </CardContent>
        </Card>
    );
};
