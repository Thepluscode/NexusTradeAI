import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

interface RiskMetrics {
  portfolioValue: number;
  var95: number; // Value at Risk 95%
  var99: number; // Value at Risk 99%
  expectedShortfall: number;
  maxDrawdown: number;
  sharpeRatio: number;
  beta: number;
  volatility: number;
  correlation: Record<string, number>;
  concentrationRisk: number;
  leverageRatio: number;
  marginUtilization: number;
  liquidityRisk: number;
  counterpartyRisk: number;
}

interface PositionRisk {
  symbol: string;
  exposure: number;
  var: number;
  beta: number;
  volatility: number;
  correlation: number;
  concentration: number;
  liquidity: 'high' | 'medium' | 'low';
  riskScore: number;
}

interface RiskAlert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  message: string;
  timestamp: number;
  acknowledged: boolean;
  metric: string;
  threshold: number;
  currentValue: number;
}

interface RealTimeRiskMonitorProps {
  portfolioId: string;
  refreshInterval?: number;
  onRiskAlert?: (alert: RiskAlert) => void;
}

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  height: 100%;
  padding: 16px;
  background: #0a0a0a;
  color: #fff;
`;

const Header = styled.div`
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
`;

const StatusIndicator = styled.div<{ status: 'healthy' | 'warning' | 'critical' }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  background: ${props => {
    switch (props.status) {
      case 'healthy': return 'rgba(0, 255, 136, 0.1)';
      case 'warning': return 'rgba(255, 193, 7, 0.1)';
      case 'critical': return 'rgba(255, 82, 82, 0.1)';
    }
  }};
  color: ${props => {
    switch (props.status) {
      case 'healthy': return '#00ff88';
      case 'warning': return '#ffc107';
      case 'critical': return '#ff5252';
    }
  }};
  border: 1px solid ${props => {
    switch (props.status) {
      case 'healthy': return '#00ff88';
      case 'warning': return '#ffc107';
      case 'critical': return '#ff5252';
    }
  }};
`;

const MetricsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  padding: 16px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
`;

const MetricCard = styled(motion.div)<{ alertLevel?: 'normal' | 'warning' | 'critical' }>`
  padding: 16px;
  background: #2a2a2a;
  border: 1px solid ${props => {
    switch (props.alertLevel) {
      case 'warning': return '#ffc107';
      case 'critical': return '#ff5252';
      default: return '#444';
    }
  }};
  border-radius: 6px;
`;

const MetricLabel = styled.div`
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
`;

const MetricValue = styled.div<{ color?: string }>`
  font-size: 18px;
  font-weight: 600;
  color: ${props => props.color || '#fff'};
  margin-bottom: 4px;
`;

const MetricChange = styled.div<{ positive: boolean }>`
  font-size: 11px;
  color: ${props => props.positive ? '#00ff88' : '#ff5252'};
`;

const ChartContainer = styled.div`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
`;

const ChartTitle = styled.h3`
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
`;

const AlertsPanel = styled.div`
  grid-column: 1 / -1;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  max-height: 200px;
  overflow-y: auto;
`;

const AlertsHeader = styled.div`
  padding: 12px 16px;
  border-bottom: 1px solid #333;
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
`;

const AlertItem = styled(motion.div)<{ type: 'warning' | 'critical' | 'info' }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #333;
  border-left: 3px solid ${props => {
    switch (props.type) {
      case 'critical': return '#ff5252';
      case 'warning': return '#ffc107';
      default: return '#007bff';
    }
  }};
  
  &:last-child {
    border-bottom: none;
  }
`;

const AlertContent = styled.div`
  flex: 1;
`;

const AlertMessage = styled.div`
  font-size: 13px;
  color: #fff;
  margin-bottom: 4px;
`;

const AlertTime = styled.div`
  font-size: 11px;
  color: #888;
`;

const AlertActions = styled.div`
  display: flex;
  gap: 8px;
`;

const AlertButton = styled.button`
  padding: 4px 8px;
  font-size: 11px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #444;
  color: #ccc;
  
  &:hover {
    background: #555;
  }
`;

const RealTimeRiskMonitor: React.FC<RealTimeRiskMonitorProps> = ({
  portfolioId,
  refreshInterval = 1000,
  onRiskAlert,
}) => {
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    portfolioValue: 1250000,
    var95: -45000,
    var99: -67500,
    expectedShortfall: -78000,
    maxDrawdown: -0.15,
    sharpeRatio: 1.85,
    beta: 1.12,
    volatility: 0.24,
    correlation: { 'SPY': 0.75, 'QQQ': 0.82, 'BTC': 0.45 },
    concentrationRisk: 0.35,
    leverageRatio: 2.1,
    marginUtilization: 0.68,
    liquidityRisk: 0.12,
    counterpartyRisk: 0.08,
  });

  const [positionRisks, setPositionRisks] = useState<PositionRisk[]>([
    {
      symbol: 'BTC-USD',
      exposure: 450000,
      var: -22500,
      beta: 1.8,
      volatility: 0.65,
      correlation: 0.45,
      concentration: 0.36,
      liquidity: 'high',
      riskScore: 7.2,
    },
    {
      symbol: 'ETH-USD',
      exposure: 280000,
      var: -16800,
      beta: 1.5,
      volatility: 0.58,
      correlation: 0.72,
      concentration: 0.22,
      liquidity: 'high',
      riskScore: 6.8,
    },
    {
      symbol: 'SOL-USD',
      exposure: 150000,
      var: -12000,
      beta: 2.2,
      volatility: 0.78,
      correlation: 0.68,
      concentration: 0.12,
      liquidity: 'medium',
      riskScore: 8.1,
    },
  ]);

  const [alerts, setAlerts] = useState<RiskAlert[]>([
    {
      id: '1',
      type: 'warning',
      message: 'Portfolio concentration risk exceeds 30% threshold',
      timestamp: Date.now() - 300000,
      acknowledged: false,
      metric: 'concentrationRisk',
      threshold: 0.30,
      currentValue: 0.35,
    },
    {
      id: '2',
      type: 'critical',
      message: 'VaR 95% limit breached: -$45,000 vs limit -$40,000',
      timestamp: Date.now() - 600000,
      acknowledged: false,
      metric: 'var95',
      threshold: -40000,
      currentValue: -45000,
    },
  ]);

  const [varHistory, setVarHistory] = useState<Array<{ time: string; var95: number; var99: number }>>([]);

  // Calculate overall risk status
  const riskStatus = useMemo(() => {
    const criticalAlerts = alerts.filter(a => a.type === 'critical' && !a.acknowledged).length;
    const warningAlerts = alerts.filter(a => a.type === 'warning' && !a.acknowledged).length;
    
    if (criticalAlerts > 0) return 'critical';
    if (warningAlerts > 0) return 'warning';
    return 'healthy';
  }, [alerts]);

  // Simulate real-time data updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Update VaR history
      setVarHistory(prev => {
        const newPoint = {
          time: new Date().toLocaleTimeString(),
          var95: riskMetrics.var95 + (Math.random() - 0.5) * 5000,
          var99: riskMetrics.var99 + (Math.random() - 0.5) * 7500,
        };
        return [...prev.slice(-19), newPoint];
      });

      // Simulate metric updates
      setRiskMetrics(prev => ({
        ...prev,
        var95: prev.var95 + (Math.random() - 0.5) * 2000,
        var99: prev.var99 + (Math.random() - 0.5) * 3000,
        volatility: Math.max(0.1, prev.volatility + (Math.random() - 0.5) * 0.02),
        marginUtilization: Math.max(0, Math.min(1, prev.marginUtilization + (Math.random() - 0.5) * 0.05)),
      }));
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, riskMetrics.var95, riskMetrics.var99]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const getMetricAlertLevel = (metric: string, value: number): 'normal' | 'warning' | 'critical' => {
    switch (metric) {
      case 'var95':
        if (value < -50000) return 'critical';
        if (value < -40000) return 'warning';
        return 'normal';
      case 'concentrationRisk':
        if (value > 0.4) return 'critical';
        if (value > 0.3) return 'warning';
        return 'normal';
      case 'marginUtilization':
        if (value > 0.8) return 'critical';
        if (value > 0.7) return 'warning';
        return 'normal';
      default:
        return 'normal';
    }
  };

  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    ));
  };

  const dismissAlert = (alertId: string) => {
    setAlerts(prev => prev.filter(alert => alert.id !== alertId));
  };

  return (
    <Container>
      <Header>
        <Title>Real-Time Risk Monitor</Title>
        <StatusIndicator status={riskStatus}>
          <div style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            backgroundColor: 'currentColor' 
          }} />
          Risk Status: {riskStatus.toUpperCase()}
        </StatusIndicator>
      </Header>

      <MetricsGrid>
        <MetricCard
          alertLevel={getMetricAlertLevel('var95', riskMetrics.var95)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <MetricLabel>VaR 95% (1D)</MetricLabel>
          <MetricValue color="#ff5252">{formatCurrency(riskMetrics.var95)}</MetricValue>
          <MetricChange positive={false}>Daily risk exposure</MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MetricLabel>Expected Shortfall</MetricLabel>
          <MetricValue color="#ff8a65">{formatCurrency(riskMetrics.expectedShortfall)}</MetricValue>
          <MetricChange positive={false}>Tail risk</MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <MetricLabel>Sharpe Ratio</MetricLabel>
          <MetricValue color="#00ff88">{riskMetrics.sharpeRatio.toFixed(2)}</MetricValue>
          <MetricChange positive={true}>Risk-adjusted return</MetricChange>
        </MetricCard>

        <MetricCard
          alertLevel={getMetricAlertLevel('concentrationRisk', riskMetrics.concentrationRisk)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <MetricLabel>Concentration Risk</MetricLabel>
          <MetricValue color="#ffc107">{formatPercentage(riskMetrics.concentrationRisk)}</MetricValue>
          <MetricChange positive={false}>Portfolio concentration</MetricChange>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <MetricLabel>Portfolio Beta</MetricLabel>
          <MetricValue>{riskMetrics.beta.toFixed(2)}</MetricValue>
          <MetricChange positive={riskMetrics.beta > 1}>Market sensitivity</MetricChange>
        </MetricCard>

        <MetricCard
          alertLevel={getMetricAlertLevel('marginUtilization', riskMetrics.marginUtilization)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <MetricLabel>Margin Utilization</MetricLabel>
          <MetricValue color="#64b5f6">{formatPercentage(riskMetrics.marginUtilization)}</MetricValue>
          <MetricChange positive={false}>Leverage usage</MetricChange>
        </MetricCard>
      </MetricsGrid>

      <ChartContainer>
        <ChartTitle>Value at Risk Trend</ChartTitle>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={varHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="time" stroke="#888" fontSize={10} />
            <YAxis stroke="#888" fontSize={10} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1a1a1a', 
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff'
              }}
              formatter={(value: number) => [formatCurrency(value), '']}
            />
            <Line 
              type="monotone" 
              dataKey="var95" 
              stroke="#ff5252" 
              strokeWidth={2}
              dot={false}
              name="VaR 95%"
            />
            <Line 
              type="monotone" 
              dataKey="var99" 
              stroke="#ff8a65" 
              strokeWidth={2}
              dot={false}
              name="VaR 99%"
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartContainer>
        <ChartTitle>Position Risk Scores</ChartTitle>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={positionRisks}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="symbol" stroke="#888" fontSize={10} />
            <YAxis stroke="#888" fontSize={10} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1a1a1a', 
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff'
              }}
            />
            <Bar dataKey="riskScore" fill="#007bff" />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>

      <AlertsPanel>
        <AlertsHeader>Risk Alerts ({alerts.filter(a => !a.acknowledged).length} active)</AlertsHeader>
        {alerts.map((alert) => (
          <AlertItem
            key={alert.id}
            type={alert.type}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            style={{ opacity: alert.acknowledged ? 0.5 : 1 }}
          >
            <AlertContent>
              <AlertMessage>{alert.message}</AlertMessage>
              <AlertTime>{new Date(alert.timestamp).toLocaleString()}</AlertTime>
            </AlertContent>
            <AlertActions>
              {!alert.acknowledged && (
                <AlertButton onClick={() => acknowledgeAlert(alert.id)}>
                  Acknowledge
                </AlertButton>
              )}
              <AlertButton onClick={() => dismissAlert(alert.id)}>
                Dismiss
              </AlertButton>
            </AlertActions>
          </AlertItem>
        ))}
      </AlertsPanel>
    </Container>
  );
};

export default RealTimeRiskMonitor;
