import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Box,
  AppBar,
  Toolbar,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  Tabs,
  Tab,
  Paper,
} from '@mui/material';
import {
  AccessTime,
  TrendingUp,
  Assessment,
  AccountBalance,
  Security,
  SmartToy,
  DataUsage,
  Speed,
  Dashboard as DashboardIcon,
  Storage,
  Policy,
  Psychology,
  CurrencyBitcoin,
} from '@mui/icons-material';
import { useTradingEngine } from '@/hooks/useTradingEngine';
import { useAIService } from '@/hooks/useAIService';
import { useMarketData } from '@/hooks/useMarketData';
import { MetricCard } from '@/components/MetricCard';
import { RiskAlerts } from '@/components/RiskAlerts';
import { PositionsTable } from '@/components/PositionsTable';
import { ControlPanel } from '@/components/ControlPanel';
import { StatusBadge } from '@/components/StatusBadge';
import { AccountSelector } from '@/components/AccountSelector';

// New Components for All Services
import { ServiceStatus } from '@/components/ServiceStatus';
import { StrategiesPanel } from '@/components/StrategiesPanel';
import { BankingPanel } from '@/components/BankingPanel';
import { CompliancePanel } from '@/components/CompliancePanel';
import { AIChat } from '@/components/AIChat';
import { AutomationControl } from '@/components/AutomationControl';
import { ForexPanel } from '@/components/ForexPanel';
import { AllPositionsPanel } from '@/components/AllPositionsPanel';
import CryptoBotPage from '@/pages/CryptoBotPage';

import { apiClient } from '@/services/api';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ py: 3 }}>{children}</Box>}
    </div>
  );
}

export const Dashboard: React.FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [accountSummary, setAccountSummary] = useState<any>(null);
  const [activeAccount, setActiveAccount] = useState<'real' | 'demo'>('demo');

  const {
    status,
    positions,
    isLoading: tradingLoading,
    error: tradingError,
    startEngine,
    stopEngine,
    realizeProfits,
    isStarting,
    isStopping,
  } = useTradingEngine();

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const summary = await apiClient.getAccountSummary();
        setAccountSummary(summary);
        setActiveAccount(summary.activeAccount as 'real' | 'demo');
      } catch (error) {
        console.error('Failed to fetch account summary:', error);
      }
    };

    fetchAccounts();
    const interval = setInterval(fetchAccounts, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status) {
      setLastUpdate(new Date());
    }
  }, [status]);

  const handleAccountSwitch = async (type: 'real' | 'demo') => {
    try {
      await apiClient.switchAccount(type);
      setActiveAccount(type);
      const summary = await apiClient.getAccountSummary();
      setAccountSummary(summary);
    } catch (error) {
      console.error('Failed to switch account:', error);
    }
  };

  const handleResetDemo = async () => {
    try {
      await apiClient.resetDemoAccount();
      const summary = await apiClient.getAccountSummary();
      setAccountSummary(summary);
    } catch (error) {
      console.error('Failed to reset demo account:', error);
    }
  };

  const report: any = null;
  const alerts: any[] = [];
  const riskLoading = false;
  const riskError = null;

  const { health: aiHealth } = useAIService();
  const { status: marketDataStatus } = useMarketData();

  const isLoading = tradingLoading || riskLoading;
  const error = tradingError || riskError;

  if (isLoading && !status && !report) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ flexGrow: 1, bgcolor: 'background.default', minHeight: '100vh' }}>
      <AppBar position="static" sx={{ bgcolor: 'background.paper' }}>
        <Toolbar>
          <DashboardIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            NexusTradeAI - Bot Dashboard
          </Typography>
          <StatusBadge
            status={status?.isRunning ? 'online' : 'offline'}
            label={`Engine: ${status?.isRunning ? 'Online' : 'Offline'}`}
          />
          <StatusBadge
            status={aiHealth?.healthy ? 'online' : 'offline'}
            label={`AI: ${aiHealth?.healthy ? 'Online' : 'Offline'}`}
          />
          <StatusBadge
            status={marketDataStatus?.connected ? 'online' : 'offline'}
            label={`Data: ${marketDataStatus?.connected ? 'Connected' : 'Disconnected'}`}
          />
          <Chip
            icon={<AccessTime />}
            label={`Updated: ${lastUpdate.toLocaleTimeString()}`}
            size="small"
            color={tradingLoading ? 'warning' : 'primary'}
            variant="outlined"
            sx={{ ml: 1 }}
          />
        </Toolbar>
      </AppBar>

      {/* Tab Navigation */}
      <Paper sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, v) => setTabValue(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2 }}
        >
          <Tab icon={<DashboardIcon />} iconPosition="start" label="Stocks" />
          <Tab icon={<Assessment />} iconPosition="start" label="Forex" />
          <Tab icon={<CurrencyBitcoin />} iconPosition="start" label="Crypto" />
          <Tab icon={<TrendingUp />} iconPosition="start" label="All Positions" />
          <Tab icon={<Storage />} iconPosition="start" label="Services" />
          <Tab icon={<AccountBalance />} iconPosition="start" label="Banking" />
          <Tab icon={<Policy />} iconPosition="start" label="Compliance" />
          <Tab icon={<Psychology />} iconPosition="start" label="AI Assistant" />
        </Tabs>
      </Paper>

      <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Error loading data. Please check if backend services are running.
          </Alert>
        )}

        {/* --- Tab 0: Overview --- */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            {accountSummary?.realAccount && accountSummary?.demoAccount && (
              <Grid item xs={12}>
                <AccountSelector
                  activeAccount={activeAccount}
                  realAccount={{
                    balance: accountSummary.realAccount.balance ?? 0,
                    equity: accountSummary.realAccount.equity ?? 0,
                    pnl: accountSummary.realAccount.pnl ?? 0,
                    pnlPercent: accountSummary.realAccount.pnlPercent ?? 0,
                    banksConnected: accountSummary.realAccount.linkedBanks?.length ?? 0,
                  }}
                  demoAccount={{
                    balance: accountSummary.demoAccount.balance ?? 0,
                    equity: accountSummary.demoAccount.equity ?? 0,
                    pnl: accountSummary.demoAccount.pnl ?? 0,
                    pnlPercent: accountSummary.demoAccount.pnlPercent ?? 0,
                    canReset: accountSummary.demoAccount.canReset ?? true,
                  }}
                  onSwitch={handleAccountSwitch}
                  onResetDemo={handleResetDemo}
                />
              </Grid>
            )}

            <Grid item xs={12}>
              <AutomationControl />
            </Grid>

            <Grid item xs={12}>
              <ControlPanel
                isRunning={status?.isRunning || false}
                circuitBreakerActive={status?.circuitBreakerActive || false}
                onStart={startEngine}
                onStop={stopEngine}
                onRealizeProfits={realizeProfits}
                isStarting={isStarting}
                isStopping={isStopping}
              />
            </Grid>

            {/* Performance Metrics */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Daily P&L"
                value={status?.dailyPnL?.toFixed(2) || '0.00'}
                color={status?.dailyPnL && status.dailyPnL >= 0 ? 'success' : 'error'}
                icon={<TrendingUp />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Total Profit"
                value={status?.performance?.totalProfit?.toFixed(2) || '0.00'}
                prefix="$"
                color={status?.performance?.totalProfit && status.performance.totalProfit >= 0 ? 'success' : 'error'}
                icon={<AccountBalance />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Win Rate"
                value={status?.performance?.winRate?.toFixed(1) || '0'}
                suffix="%"
                color="primary"
                icon={<Assessment />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Sharpe Ratio"
                value={status?.performance?.sharpeRatio?.toFixed(2) || '0.00'}
                color="info"
                icon={<Assessment />}
              />
            </Grid>

            {/* Risk Metrics */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Portfolio VaR"
                value={status?.portfolioVaR?.toFixed(2) || '0.00'}
                color="warning"
                icon={<Security />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Leverage"
                value={status?.leverage?.toFixed(2) || '0.00'}
                suffix="x"
                color="warning"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Max Drawdown"
                value={
                  status?.performance?.maxDrawdown
                    ? (status.performance.maxDrawdown * 100).toFixed(2)
                    : '0.00'
                }
                suffix="%"
                color="error"
                icon={<Security />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Active Positions"
                value={status?.performance?.activePositions || 0}
                color="primary"
              />
            </Grid>

            {/* AI Status */}
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="AI Status"
                value={aiHealth?.healthy ? 'Online' : 'Offline'}
                color={aiHealth?.healthy ? 'success' : 'error'}
                icon={<SmartToy />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Models Loaded"
                value={aiHealth?.models_loaded || 0}
                color="info"
                icon={<DataUsage />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="AI Latency"
                value={aiHealth?.avgLatency?.toFixed(0) || '0'}
                suffix="ms"
                color="primary"
                icon={<Speed />}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <MetricCard
                title="Data Connected"
                value={marketDataStatus?.connected ? 'Yes' : 'No'}
                color={marketDataStatus?.connected ? 'success' : 'error'}
                icon={<DataUsage />}
              />
            </Grid>

            {/* Positions & Alerts */}
            <Grid item xs={12}>
              <PositionsTable positions={positions || []} />
            </Grid>
            <Grid item xs={12}>
              <RiskAlerts alerts={alerts || []} />
            </Grid>
          </Grid>
        </TabPanel>

        {/* --- Tab 1: Forex --- */}
        <TabPanel value={tabValue} index={1}>
          <ForexPanel />
        </TabPanel>

        {/* --- Tab 2: Crypto --- */}
        <TabPanel value={tabValue} index={2}>
          <CryptoBotPage />
        </TabPanel>

        {/* --- Tab 3: All Positions --- */}
        <TabPanel value={tabValue} index={3}>
          <AllPositionsPanel />
        </TabPanel>

        {/* --- Tab 4: Services --- */}
        <TabPanel value={tabValue} index={4}>
          <ServiceStatus />
        </TabPanel>

        {/* --- Tab 5: Banking --- */}
        <TabPanel value={tabValue} index={5}>
          <BankingPanel />
        </TabPanel>

        {/* --- Tab 6: Compliance --- */}
        <TabPanel value={tabValue} index={6}>
          <CompliancePanel />
        </TabPanel>

        {/* --- Tab 7: AI Assistant --- */}
        <TabPanel value={tabValue} index={7}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <AIChat />
            </Grid>
            <Grid item xs={12} md={6}>
              <StrategiesPanel />
            </Grid>
          </Grid>
        </TabPanel>
      </Container>
    </Box>
  );
};
