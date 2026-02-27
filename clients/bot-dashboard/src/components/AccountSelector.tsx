import React from 'react';
import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Card,
  CardContent,
  Chip,
  Button
} from '@mui/material';
import { AccountBalance, School, Refresh } from '@mui/icons-material';

interface Account {
  balance: number;
  equity: number;
  pnl: number;
  pnlPercent: number;
  banksConnected?: number;
  canReset?: boolean;
}

interface AccountSelectorProps {
  activeAccount: 'real' | 'demo';
  realAccount: Account;
  demoAccount: Account;
  onSwitch: (type: 'real' | 'demo') => void;
  onResetDemo?: () => void;
}

export const AccountSelector: React.FC<AccountSelectorProps> = ({
  activeAccount,
  realAccount,
  demoAccount,
  onSwitch,
  onResetDemo
}) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="h6" gutterBottom>Account Management</Typography>

      <ToggleButtonGroup
        value={activeAccount}
        exclusive
        onChange={(_, value) => value && onSwitch(value)}
        fullWidth
        sx={{ mb: 2 }}
      >
        <ToggleButton value="real">
          <AccountBalance sx={{ mr: 1 }} />
          Real Account
        </ToggleButton>
        <ToggleButton value="demo">
          <School sx={{ mr: 1 }} />
          Demo Account
        </ToggleButton>
      </ToggleButtonGroup>

      <Box sx={{ display: 'flex', gap: 2 }}>
        {/* Real Account Card */}
        <Card sx={{
          flex: 1,
          border: activeAccount === 'real' ? '2px solid' : 'none',
          borderColor: 'primary.main',
          bgcolor: activeAccount === 'real' ? 'primary.50' : 'background.paper'
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Real Account</Typography>
              {activeAccount === 'real' && <Chip label="ACTIVE" color="primary" size="small" />}
            </Box>
            <Typography variant="h4">{formatCurrency(realAccount.balance)}</Typography>
            <Typography variant="body2" color={realAccount.pnl >= 0 ? 'success.main' : 'error.main'}>
              {formatCurrency(realAccount.pnl)} ({formatPercent(realAccount.pnlPercent)})
            </Typography>
            {realAccount.banksConnected !== undefined && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                {realAccount.banksConnected} bank{realAccount.banksConnected !== 1 ? 's' : ''} connected
              </Typography>
            )}
          </CardContent>
        </Card>

        {/* Demo Account Card */}
        <Card sx={{
          flex: 1,
          border: activeAccount === 'demo' ? '2px solid' : 'none',
          borderColor: 'secondary.main',
          bgcolor: activeAccount === 'demo' ? 'secondary.50' : 'background.paper'
        }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Demo Account</Typography>
              {activeAccount === 'demo' && <Chip label="ACTIVE" color="secondary" size="small" />}
            </Box>
            <Typography variant="h4">{formatCurrency(demoAccount.balance)}</Typography>
            <Typography variant="body2" color={demoAccount.pnl >= 0 ? 'success.main' : 'error.main'}>
              {formatCurrency(demoAccount.pnl)} ({formatPercent(demoAccount.pnlPercent)})
            </Typography>
            {demoAccount.canReset && onResetDemo && (
              <Button
                size="small"
                startIcon={<Refresh />}
                onClick={onResetDemo}
                sx={{ mt: 1 }}
                variant="outlined"
                color="secondary"
              >
                Reset
              </Button>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};
