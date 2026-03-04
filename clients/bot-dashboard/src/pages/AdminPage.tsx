import {
    Box, Paper, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, Alert,
    CircularProgress, Avatar,
} from '@mui/material';
import { AdminPanelSettings, Person, CheckCircle, Cancel } from '@mui/icons-material';
import { apiClient } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from 'react-query';

export default function AdminPage() {
    const { user } = useAuth();

    const { data: users = [], isLoading, error } = useQuery(
        'adminUsers',
        () => apiClient.getAdminUsers(),
        { refetchInterval: 15000, retry: false }
    );

    if (user?.role !== 'admin') {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="error">Access denied — admin role required.</Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <AdminPanelSettings sx={{ fontSize: 32, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h5" fontWeight={700}>Admin Panel</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Registered users &amp; engine status
                    </Typography>
                </Box>
                <Chip
                    label={`${users.length} Users`}
                    size="small"
                    color="primary"
                    sx={{ ml: 'auto' }}
                />
            </Box>

            {isLoading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            )}

            {Boolean(error) && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    Failed to load users — check admin credentials.
                </Alert>
            )}

            {!isLoading && users.length > 0 && (
                <Paper elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>User</TableCell>
                                    <TableCell>Role</TableCell>
                                    <TableCell align="center">Brokers</TableCell>
                                    <TableCell align="center">Engine</TableCell>
                                    <TableCell align="center">Active</TableCell>
                                    <TableCell>Joined</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {(users as Record<string, unknown>[]).map((u) => (
                                    <TableRow key={String(u.id)} hover>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Avatar sx={{ width: 28, height: 28, fontSize: '0.75rem', bgcolor: 'primary.dark' }}>
                                                    {(String(u.name || u.email || 'U'))[0].toUpperCase()}
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>
                                                        {String(u.name || u.email)}
                                                    </Typography>
                                                    {Boolean(u.name) && (
                                                        <Typography variant="caption" color="text.secondary">
                                                            {String(u.email)}
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={String(u.role)}
                                                size="small"
                                                color={u.role === 'admin' ? 'warning' : 'default'}
                                                icon={u.role === 'admin' ? <AdminPanelSettings /> : <Person />}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Chip
                                                label={String(u.brokersConfigured ?? 0)}
                                                size="small"
                                                color={Number(u.brokersConfigured) > 0 ? 'success' : 'default'}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            {u.engineRunning
                                                ? <CheckCircle sx={{ color: 'success.main', fontSize: 18 }} />
                                                : <Cancel sx={{ color: 'text.disabled', fontSize: 18 }} />}
                                        </TableCell>
                                        <TableCell align="center">
                                            {u.activeInRegistry
                                                ? <Chip label="In Memory" size="small" color="info" />
                                                : <Typography variant="caption" color="text.disabled">—</Typography>}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">
                                                {u.createdAt
                                                    ? new Date(String(u.createdAt)).toLocaleDateString()
                                                    : '—'}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {!isLoading && users.length === 0 && !error && (
                <Alert severity="info">No users registered yet.</Alert>
            )}
        </Box>
    );
}
