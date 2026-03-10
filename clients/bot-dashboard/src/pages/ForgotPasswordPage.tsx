import { useState } from 'react';
import SEO from '@/components/SEO';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  alpha,
} from '@mui/material';
import { Bolt, Email } from '@mui/icons-material';
import axios from 'axios';
import { SERVICE_URLS } from '@/services/api';

const AUTH_URL = SERVICE_URLS.stockBot;

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post(`${AUTH_URL}/api/auth/forgot-password`, { email });
      setSubmitted(true);
    } catch {
      // Always show success message for security — never reveal if email exists
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <SEO title="Forgot Password" description="Reset your NexusTradeAI account password." path="/forgot-password" noindex />
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        position: 'relative',
        overflow: 'hidden',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 20% 30%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),' +
            'radial-gradient(ellipse at 80% 70%, rgba(139, 92, 246, 0.12) 0%, transparent 50%),' +
            'radial-gradient(ellipse at 50% 50%, rgba(16, 185, 129, 0.06) 0%, transparent 60%)',
          animation: 'gradientShift 20s ease infinite',
          backgroundSize: '200% 200%',
          pointerEvents: 'none',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'radial-gradient(circle, rgba(255, 255, 255, 0.03) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
          pointerEvents: 'none',
        },
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 440,
          position: 'relative',
          zIndex: 1,
          animation: 'scaleIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both',
          background: 'rgba(13, 17, 23, 0.75)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05) inset',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          {/* Brand Header */}
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 4 }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 2.5,
                boxShadow: '0 8px 24px rgba(59, 130, 246, 0.35)',
                position: 'relative',
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: -3,
                  borderRadius: '21px',
                  background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(139, 92, 246, 0.4))',
                  filter: 'blur(8px)',
                  opacity: 0.5,
                  zIndex: -1,
                  animation: 'pulseGlow 3s ease-in-out infinite',
                },
              }}
            >
              <Bolt sx={{ color: '#fff', fontSize: 32 }} />
            </Box>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(135deg, #e6edf3 0%, #8b949e 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              NexusTradeAI
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, textAlign: 'center' }}>
              Reset your password
            </Typography>
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                borderRadius: '12px',
                bgcolor: alpha('#ef4444', 0.08),
                border: `1px solid ${alpha('#ef4444', 0.2)}`,
                '& .MuiAlert-icon': { color: '#ef4444' },
              }}
            >
              {error}
            </Alert>
          )}

          {submitted ? (
            <Box>
              <Alert
                severity="success"
                sx={{
                  mb: 3,
                  borderRadius: '12px',
                  bgcolor: alpha('#10b981', 0.08),
                  border: `1px solid ${alpha('#10b981', 0.2)}`,
                  '& .MuiAlert-icon': { color: '#10b981' },
                }}
              >
                If that email exists, a reset link has been sent. Check your inbox (and spam folder).
              </Alert>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => navigate('/login')}
                sx={{
                  py: 1.4,
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  color: 'text.secondary',
                  '&:hover': {
                    borderColor: '#3b82f6',
                    color: '#3b82f6',
                    bgcolor: alpha('#3b82f6', 0.06),
                  },
                }}
              >
                Back to Sign In
              </Button>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2.5, textAlign: 'center' }}>
                Enter your account email and we will send you a reset link.
              </Typography>
              <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  fullWidth
                  size="small"
                  autoComplete="email"
                  autoFocus
                  InputProps={{
                    startAdornment: <Email sx={{ color: 'text.secondary', mr: 1, fontSize: 18 }} />,
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading}
                  sx={{
                    mt: 1,
                    py: 1.4,
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                    boxShadow: '0 4px 16px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                      boxShadow: '0 6px 24px rgba(59, 130, 246, 0.45)',
                      transform: 'translateY(-1px)',
                    },
                    '&:disabled': {
                      background: 'rgba(255, 255, 255, 0.08)',
                    },
                  }}
                >
                  {loading ? (
                    <CircularProgress size={22} sx={{ color: 'rgba(255,255,255,0.7)' }} />
                  ) : 'Send Reset Link'}
                </Button>
              </Box>

              <Box sx={{ mt: 3, textAlign: 'center' }}>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => navigate('/login')}
                  sx={{
                    p: 0,
                    minWidth: 0,
                    fontWeight: 700,
                    textTransform: 'none',
                    color: '#3b82f6',
                    '&:hover': {
                      color: '#60a5fa',
                      background: 'transparent',
                    },
                  }}
                >
                  Back to Sign In
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
    </>
  );
}
