import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
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
} from '@mui/icons-material';
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
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './hooks/useAuth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // No global onError — individual bots handle offline gracefully with fallback data.
      // A global handler would fire a toast every 5s for every offline bot.
      retry: 1,
    },
  },
});

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#3b82f6',
    },
    secondary: {
      main: '#8b5cf6',
    },
    success: {
      main: '#10b981',
    },
    error: {
      main: '#ef4444',
    },
    warning: {
      main: '#f59e0b',
    },
    background: {
      default: '#0a0a0f',
      paper: '#12121a',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700,
    },
    h5: {
      fontWeight: 600,
    },
    h6: {
      fontWeight: 600,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: 12,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});

const DRAWER_WIDTH = 260;

const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: <Dashboard /> },
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
      <Toolbar sx={{ px: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          🎯 NexusTradeAI
        </Typography>
      </Toolbar>
      <Divider />
      <List sx={{ flex: 1, px: 1 }}>
        {NAV_ITEMS.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              onClick={() => {
                navigate(item.path);
                if (isMobile) setMobileOpen(false);
              }}
              selected={location.pathname === item.path}
              sx={{
                borderRadius: 2,
                '&.Mui-selected': {
                  bgcolor: item.color ? `${item.color}20` : 'action.selected',
                  '&:hover': {
                    bgcolor: item.color ? `${item.color}30` : 'action.hover',
                  },
                },
              }}
            >
              <ListItemIcon sx={{ color: item.color || 'inherit', minWidth: 40 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  fontWeight: location.pathname === item.path ? 600 : 400,
                  color: item.color && location.pathname === item.path ? item.color : 'inherit',
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Divider />
      <List sx={{ px: 1, pb: 2 }}>
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => { navigate('/settings'); if (isMobile) setMobileOpen(false); }}
            selected={location.pathname === '/settings'}
            sx={{ borderRadius: 2 }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>
              <Settings />
            </ListItemIcon>
            <ListItemText primary="Settings" />
          </ListItemButton>
        </ListItem>
        {user && (
          <ListItem disablePadding sx={{ mt: 0.5 }}>
            <ListItemButton
              onClick={logout}
              sx={{
                borderRadius: 2,
                '&:hover': { bgcolor: 'error.dark' },
              }}
            >
              <ListItemIcon sx={{ color: 'error.main', minWidth: 40 }}>
                <Logout />
              </ListItemIcon>
              <ListItemText
                primary="Logout"
                secondary={user.email}
                primaryTypographyProps={{ color: 'error.main', fontWeight: 500 }}
                secondaryTypographyProps={{ fontSize: '0.7rem', noWrap: true }}
              />
            </ListItemButton>
          </ListItem>
        )}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Mobile AppBar */}
      {isMobile && (
        <AppBar
          position="fixed"
          sx={{
            display: { md: 'none' },
            bgcolor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Toolbar>
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setMobileOpen(!mobileOpen)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              🎯 NexusTradeAI
            </Typography>
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
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              bgcolor: 'background.paper',
            },
          }}
        >
          {drawer}
        </Drawer>
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: DRAWER_WIDTH,
              bgcolor: 'background.paper',
              borderRight: '1px solid',
              borderColor: 'divider',
            },
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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
          flexDirection: 'column'
        }}>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Navigation />
          </BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1a1a24',
                color: '#fff',
                borderRadius: '12px',
              },
            }}
          />
        </Box>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
