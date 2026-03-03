import { createTheme, alpha } from '@mui/material';

// ── NexusTradeAI Premium Dark Theme ──────────────────────────────────────────
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#3b82f6', light: '#60a5fa', dark: '#2563eb', contrastText: '#ffffff' },
    secondary:  { main: '#8b5cf6', light: '#a78bfa', dark: '#7c3aed', contrastText: '#ffffff' },
    success:    { main: '#10b981', light: '#34d399', dark: '#059669' },
    error:      { main: '#ef4444', light: '#f87171', dark: '#dc2626' },
    warning:    { main: '#f59e0b', light: '#fbbf24', dark: '#d97706' },
    info:       { main: '#06b6d4', light: '#22d3ee', dark: '#0891b2' },
    background: { default: '#06080d', paper: '#0d1117' },
    divider:    'rgba(255, 255, 255, 0.06)',
    text:       { primary: '#e6edf3', secondary: '#8b949e', disabled: 'rgba(255,255,255,0.28)' },
    grey: {
      50:  '#f9fafb', 100: '#f3f4f6', 200: '#e5e7eb', 300: '#d1d5db',
      400: '#9ca3af', 500: '#6b7280', 600: '#4b5563', 700: '#374151',
      800: '#1f2937', 900: '#111827',
    },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeightLight:   300,
    fontWeightRegular: 400,
    fontWeightMedium:  500,
    fontWeightBold:    700,
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.015em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600, letterSpacing: '-0.005em' },
    subtitle2: { fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.005em' },
    body1: { letterSpacing: '-0.005em' },
    body2: { color: '#8b949e', letterSpacing: '-0.005em' },
    caption: { letterSpacing: '0.02em' },
    button: { fontWeight: 600, textTransform: 'none' as const, letterSpacing: '0.01em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundImage: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          backgroundColor: 'rgba(13, 17, 23, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          transition:
            'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), ' +
            'box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1), ' +
            'border-color 0.3s ease',
          '&:hover': { borderColor: 'rgba(59, 130, 246, 0.22)' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(13, 17, 23, 0.72)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '16px',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '10px',
          textTransform: 'none' as const,
          fontWeight: 600,
          padding: '8px 20px',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 20px rgba(59, 130, 246, 0.35)',
            transform: 'translateY(-1px)',
          },
          '&:active': { transform: 'translateY(0)' },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.12)',
          '&:hover': {
            borderColor: 'rgba(59, 130, 246, 0.4)',
            backgroundColor: alpha('#3b82f6', 0.06),
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: '8px' },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: '10px',
            transition: 'box-shadow 0.25s ease, border-color 0.25s ease',
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: 'rgba(59, 130, 246, 0.4)',
            },
            '&.Mui-focused': {
              boxShadow: '0 0 0 3px rgba(59, 130, 246, 0.15)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: '#3b82f6',
              borderWidth: '1.5px',
            },
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: 'rgba(255, 255, 255, 0.06)' },
        head: {
          fontWeight: 600,
          fontSize: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#8b949e',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: { borderColor: 'rgba(255, 255, 255, 0.06)' },
      },
    },
    MuiSkeleton: {
      styleOverrides: {
        root: { backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: '8px' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#1c2333',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '8px',
          fontSize: '0.75rem',
          fontWeight: 500,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        },
        arrow: { color: '#1c2333' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: '12px' },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
          backgroundColor: 'rgba(9, 12, 18, 0.88)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      },
    },
  },
});

export default darkTheme;
