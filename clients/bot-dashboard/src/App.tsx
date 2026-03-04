import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider, CssBaseline, alpha } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  AppBar,
  Typography,
  IconButton,
  Divider,
  useMediaQuery,
  Avatar,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Dashboard,
  ShowChart,
  CurrencyExchange,
  CurrencyBitcoin,
  Assessment,
  Receipt,
  Menu as MenuIcon,
  Settings,
  Logout,
  Bolt,
  FiberManualRecord,
  AdminPanelSettings,
} from '@mui/icons-material';
import darkTheme from './theme';
import { Toaster } from 'react-hot-toast';

// Pages
import OverviewPage from './pages/OverviewPage';
import StockBotPage from './pages/StockBotPage';
import ForexBotPage from './pages/ForexBotPage';
import CryptoBotPage from './pages/CryptoBotPage';
import BacktestPage from './pages/BacktestPage';
import TradesPage from './pages/TradesPage';
import SettingsPage from './pages/SettingsPage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// ── Live UTC Clock ────────────────────────────────────────────────────────────
function LiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <Typography
      variant="caption"
      sx={{
        color: 'text.secondary',
        fontSize: '0.62rem',
        letterSpacing: '0.04em',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {time.toUTCString().slice(17, 25)} UTC
    </Typography>
  );
}

const DRAWER_WIDTH = 272;

const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: <Dashboard />, color: '#3b82f6' },
  { path: '/stock', label: 'Stock Bot', icon: <ShowChart />, color: '#10b981' },
  { path: '/forex', label: 'Forex Bot', icon: <CurrencyExchange />, color: '#3b82f6' },
  { path: '/crypto', label: 'Crypto Bot', icon: <CurrencyBitcoin />, color: '#f59e0b' },
  { path: '/backtest', label: 'Backtest', icon: <Assessment />, color: '#8b5cf6' },
  { path: '/trades', label: 'Trade History', icon: <Receipt />, color: '#ec4899' },
];

function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery(darkTheme.breakpoints.down('md'));
  const { user, logout } = useAuth();

  const drawer = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Brand Header ─────────────────────────────────────────── */}
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        {/* Logo with ambient glow */}
        <Box sx={{ position: 'relative', flexShrink: 0 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <Bolt sx={{ color: '#fff', fontSize: 22 }} />
          </Box>
          {/* Ambient glow behind logo */}
          <Box
            sx={{
              position: 'absolute',
              inset: -4,
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(59,130,246,0.3), rgba(139,92,246,0.3))',
              filter: 'blur(8px)',
              zIndex: 0,
              animation: 'pulseGlow 3s ease-in-out infinite',
            }}
          />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 800,
              fontSize: '0.95rem',
              letterSpacing: '-0.02em',
              background: 'linear-gradient(135deg, #e6edf3 0%, #8b949e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            NexusTradeAI
          </Typography>
          <LiveClock />
        </Box>

        {/* LIVE chip */}
        <Chip
          size="small"
          icon={
            <FiberManualRecord sx={{ fontSize: '7px !important', color: '#10b981 !important', animation: 'pulseDot 2s ease-in-out infinite' }} />
          }
          label="LIVE"
          sx={{
            height: 20,
            fontSize: '0.58rem',
            fontWeight: 700,
            letterSpacing: '0.05em',
            bgcolor: alpha('#10b981', 0.1),
            color: '#10b981',
            border: `1px solid ${alpha('#10b981', 0.25)}`,
            flexShrink: 0,
            '& .MuiChip-label': { px: 0.8 },
            '& .MuiChip-icon': { ml: 0.5 },
          }}
        />
      </Box>

      <Divider sx={{ mx: 2 }} />

      {/* ── Navigation Items ─────────────────────────────────────── */}
      <List sx={{ flex: 1, px: 1.5, py: 1.5, overflow: 'auto' }}>
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => {
                  navigate(item.path);
                  if (isMobile) setMobileOpen(false);
                }}
                selected={isActive}
                sx={{
                  borderRadius: '12px',
                  py: 1.2,
                  px: 1.5,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  '&::before': isActive ? {
                    content: '""',
                    position: 'absolute',
                    left: 0,
                    top: '20%',
                    bottom: '20%',
                    width: 3,
                    borderRadius: '0 4px 4px 0',
                    background: item.color,
                    boxShadow: `0 0 8px ${item.color}`,
                  } : {},
                  '&.Mui-selected': {
                    bgcolor: alpha(item.color, 0.08),
                    '&:hover': {
                      bgcolor: alpha(item.color, 0.12),
                    },
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255, 255, 255, 0.04)',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: isActive ? item.color : 'text.secondary',
                    minWidth: 40,
                    transition: 'color 0.2s ease',
                    '& svg': {
                      fontSize: 20,
                      filter: isActive ? `drop-shadow(0 0 6px ${item.color})` : 'none',
                      transition: 'filter 0.25s ease',
                    },
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: isActive ? 600 : 400,
                    fontSize: '0.875rem',
                    color: isActive ? '#e6edf3' : 'text.secondary',
                  }}
                  sx={{ '& .MuiListItemText-primary': { transition: 'all 0.2s ease' } }}
                />
                {isActive && (
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: item.color,
                      boxShadow: `0 0 6px ${item.color}`,
                      animation: 'pulseDot 2s ease-in-out infinite',
                    }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

        {user?.role === 'admin' && (
          <ListItem disablePadding sx={{ px: 1.5, mb: 0.5 }}>
            <ListItemButton
              onClick={() => { navigate('/admin'); if (isMobile) setMobileOpen(false); }}
              selected={location.pathname === '/admin'}
              sx={{
                borderRadius: '12px', py: 1.2, px: 1.5,
                '&.Mui-selected': { bgcolor: 'rgba(245, 158, 11, 0.08)' },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
              }}
            >
              <ListItemIcon sx={{ color: location.pathname === '/admin' ? '#f59e0b' : 'text.secondary', minWidth: 40 }}>
                <AdminPanelSettings />
              </ListItemIcon>
              <ListItemText primary="Admin" primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: location.pathname === '/admin' ? 600 : 400 }} />
            </ListItemButton>
          </ListItem>
        )}

      <Divider sx={{ mx: 2 }} />

      {/* ── Bottom Actions ────────────────────────────────────────── */}
      <List sx={{ px: 1.5, pb: 2, pt: 1, flexShrink: 0 }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => { navigate('/settings'); if (isMobile) setMobileOpen(false); }}
            selected={location.pathname === '/settings'}
            sx={{
              borderRadius: '12px',
              py: 1.2,
              '&.Mui-selected': {
                bgcolor: 'rgba(255, 255, 255, 0.06)',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>
              <Settings />
            </ListItemIcon>
            <ListItemText primary="Settings" primaryTypographyProps={{ fontSize: '0.875rem' }} />
          </ListItemButton>
        </ListItem>

        {/* Bot Status + Version */}
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.3 }}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: '#10b981',
                boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)',
                animation: 'pulseDot 2s ease-in-out infinite',
              }}
            />
            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>Bot Active</Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', pl: 2.2 }}>
            Version 1.0.0
          </Typography>
        </Box>

        {/* User Profile + Logout */}
        <ListItem disablePadding sx={{ mt: 0.5 }}>
          <Tooltip title="Sign out" placement="right" arrow>
            <ListItemButton
              onClick={logout}
              sx={{
                borderRadius: '12px',
                py: 1,
                px: 1.5,
                transition: 'all 0.2s ease',
                '&:hover': { bgcolor: alpha('#ef4444', 0.08) },
              }}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  mr: 1.5,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  bgcolor: alpha('#10b981', 0.15),
                  color: '#34d399',
                  border: `2px solid ${alpha('#10b981', 0.3)}`,
                }}
              >
                {(user?.name || user?.email)?.[0]?.toUpperCase() || 'U'}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    color: 'text.primary',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.name || user?.email?.split('@')[0] || 'User'}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    fontSize: '0.65rem',
                    color: 'text.secondary',
                    display: 'block',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.email || ''}
                </Typography>
              </Box>
              <Logout sx={{ fontSize: 16, color: 'text.secondary', ml: 0.5 }} />
            </ListItemButton>
          </Tooltip>
        </ListItem>
      </List>
    </Box>
  );

  const drawerStyles = {
    '& .MuiDrawer-paper': {
      width: DRAWER_WIDTH,
      boxShadow: '4px 0 24px rgba(0, 0, 0, 0.3)',
    },
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile AppBar */}
      {isMobile && (
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            display: { md: 'none' },
            background: 'rgba(13, 17, 23, 0.8)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <Toolbar sx={{ gap: 1.5 }}>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <MenuIcon />
            </IconButton>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bolt sx={{ color: '#fff', fontSize: 18 }} />
            </Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: '-0.02em' }}>
              NexusTradeAI
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Chip
              size="small"
              label="LIVE"
              sx={{
                height: 22,
                fontSize: '0.6rem',
                fontWeight: 700,
                bgcolor: alpha('#10b981', 0.15),
                color: '#10b981',
                border: '1px solid',
                borderColor: alpha('#10b981', 0.3),
                '& .MuiChip-label': { px: 1 },
              }}
            />
          </Toolbar>
        </AppBar>
      )}

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            ...drawerStyles,
          }}
        >
          {drawer}
        </Drawer>
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            ...drawerStyles,
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` },
          maxWidth: '100vw',
          mt: { xs: 7, md: 0 },
          minHeight: '100vh',
          bgcolor: 'background.default',
          position: 'relative',
          '&::before': {
            content: '""',
            position: 'fixed',
            top: 0,
            left: { xs: 0, md: `${DRAWER_WIDTH}px` },
            right: 0,
            bottom: 0,
            background:
              'radial-gradient(ellipse at 20% 0%, rgba(59, 130, 246, 0.04) 0%, transparent 50%),' +
              'radial-gradient(ellipse at 80% 100%, rgba(139, 92, 246, 0.03) 0%, transparent 50%)',
            pointerEvents: 'none',
            zIndex: 0,
          },
        }}
      >
        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            animation: 'fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) both',
          }}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><OverviewPage /></ProtectedRoute>} />
            <Route path="/stock" element={<ProtectedRoute><StockBotPage /></ProtectedRoute>} />
            <Route path="/forex" element={<ProtectedRoute><ForexBotPage /></ProtectedRoute>} />
            <Route path="/crypto" element={<ProtectedRoute><CryptoBotPage /></ProtectedRoute>} />
            <Route path="/backtest" element={<ProtectedRoute><BacktestPage /></ProtectedRoute>} />
            <Route path="/trades" element={<ProtectedRoute><TradesPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <Box sx={{
          minHeight: '100vh',
          width: '100vw',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Navigation />
          </BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'rgba(28, 35, 51, 0.95)',
                color: '#e6edf3',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                fontSize: '0.875rem',
                fontWeight: 500,
              },
            }}
          />
        </Box>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
