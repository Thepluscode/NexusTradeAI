import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Divider,
  CircularProgress,
} from '@mui/material';
import { Lock } from '@mui/icons-material';
import axios from 'axios';
import { SERVICE_URLS } from '@/services/api';

const AUTH_URL = SERVICE_URLS.stockBot;

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = mode === 'register'
        ? { email, password, name: name || undefined }
        : { email, password };
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const { data } = await axios.post(`${AUTH_URL}${endpoint}`, payload);
      localStorage.setItem('nexus_access_token', data.accessToken);
      localStorage.setItem('nexus_refresh_token', data.refreshToken);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 420 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 3 }}>
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2,
              }}
            >
              <Lock sx={{ color: '#fff', fontSize: 28 }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              NexusTradeAI
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {mode === 'register' && (
              <TextField
                label="Name (optional)"
                value={name}
                onChange={e => setName(e.target.value)}
                fullWidth
                size="small"
                autoComplete="name"
              />
            )}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete="email"
              autoFocus={mode === 'login'}
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              fullWidth
              size="small"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              helperText={mode === 'register' ? 'At least 8 characters' : undefined}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ mt: 1, py: 1.2, fontWeight: 600 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : mode === 'login' ? 'Sign In' : 'Create Account'}
            </Button>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <Button
                variant="text"
                size="small"
                onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
                sx={{ p: 0, minWidth: 0, fontWeight: 600, textTransform: 'none', verticalAlign: 'baseline' }}
              >
                {mode === 'login' ? 'Register' : 'Sign In'}
              </Button>
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
