import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter, HeatmapChart } from 'recharts';
import * as d3 from 'd3';

interface RiskAnalyticsProps {
  portfolioId: string;
  timeHorizon: '1D' | '1W' | '1M' | '3M' | '1Y';
  confidenceLevel: 95 | 99;
}

interface RiskMetrics {
  var: number;
  cvar: number;
  expectedShortfall: number;
  maxDrawdown: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  beta: number;
  alpha: number;
  trackingError: number;
  informationRatio: number;
  volatility: number;
  skewness: number;
  kurtosis: number;
}

interface CorrelationMatrix {
  assets: string[];
  correlations: number[][];
}

interface StressTestScenario {
  name: string;
  description: string;
  shocks: Record<string, number>;
  portfolioImpact: number;
  probability: number;
}

interface RiskContribution {
  asset: string;
  weight: number;
  marginalVar: number;
  componentVar: number;
  percentContribution: number;
}

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto 1fr;
  gap: 16px;
  height: 100vh;
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

const Title = styled.h1`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
`;

const Controls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const Select = styled.select`
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: #007bff;
  }
`;

const MetricsGrid = styled.div`
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
`;

const MetricCard = styled(motion.div)<{ alertLevel?: 'normal' | 'warning' | 'critical' }>`
  padding: 16px;
  background: #1a1a1a;
  border: 1px solid ${props => {
    switch (props.alertLevel) {
      case 'warning': return '#ffc107';
      case 'critical': return '#ff5252';
      default: return '#333';
    }
  }};
  border-radius: 8px;
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

const MetricSubtext = styled.div`
  font-size: 11px;
  color: #666;
`;

const ChartContainer = styled.div`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
`;

const ChartTitle = styled.h3`
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
`;

const TabContainer = styled.div`
  display: flex;
  border-bottom: 1px solid #333;
  margin-bottom: 16px;
`;

const Tab = styled.button<{ active: boolean }>`
  padding: 8px 16px;
  background: ${props => props.active ? '#2a2a2a' : 'transparent'};
  border: none;
  border-bottom: 2px solid ${props => props.active ? '#007bff' : 'transparent'};
  color: ${props => props.active ? '#fff' : '#888'};
  font-size: 14px;
  cursor: pointer;
  
  &:hover {
    color: #fff;
  }
`;

const CorrelationHeatmap = styled.div`
  display: grid;
  gap: 1px;
  background: #333;
  border-radius: 4px;
  overflow: hidden;
`;

const HeatmapCell = styled.div<{ value: number }>`
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  background: ${props => {
    const intensity = Math.abs(props.value);
    const hue = props.value >= 0 ? 120 : 0; // Green for positive, red for negative
    return `hsla(${hue}, 70%, 50%, ${intensity})`;
  }};
  color: ${props => Math.abs(props.value) > 0.5 ? '#fff' : '#000'};
`;

const StressTestTable = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const StressTestRow = styled.div<{ severity: 'low' | 'medium' | 'high' }>`
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
  padding: 12px;
  background: #2a2a2a;
  border-radius: 6px;
  border-left: 4px solid ${props => {
    switch (props.severity) {
      case 'high': return '#ff5252';
      case 'medium': return '#ffc107';
      default: return '#00ff88';
    }
  }};
`;

const PortfolioRiskAnalytics: React.FC<RiskAnalyticsProps> = ({
  portfolioId,
  timeHorizon,
  confidenceLevel,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'correlation' | 'stress' | 'decomposition'>('overview');
  const [riskMetrics, setRiskMetrics] = useState<RiskMetrics>({
    var: -125000,
    cvar: -187500,
    expectedShortfall: -156000,
    maxDrawdown: -0.18,
    sharpeRatio: 1.85,
    sortinoRatio: 2.34,
    calmarRatio: 1.67,
    beta: 1.12,
    alpha: 0.08,
    trackingError: 0.045,
    informationRatio: 1.78,
    volatility: 0.24,
    skewness: -0.35,
    kurtosis: 3.8,
  });

  const [correlationMatrix, setCorrelationMatrix] = useState<CorrelationMatrix>({
    assets: ['BTC', 'ETH', 'SOL', 'ADA', 'DOT'],
    correlations: [
      [1.00, 0.75, 0.68, 0.52, 0.48],
      [0.75, 1.00, 0.82, 0.67, 0.58],
      [0.68, 0.82, 1.00, 0.71, 0.63],
      [0.52, 0.67, 0.71, 1.00, 0.69],
      [0.48, 0.58, 0.63, 0.69, 1.00],
    ],
  });

  const [stressTestScenarios] = useState<StressTestScenario[]>([
    {
      name: 'Market Crash 2008',
      description: 'Severe market downturn similar to 2008 financial crisis',
      shocks: { 'BTC': -0.50, 'ETH': -0.45, 'SOL': -0.60 },
      portfolioImpact: -0.42,
      probability: 0.02,
    },
    {
      name: 'Crypto Winter',
      description: 'Extended bear market in cryptocurrency sector',
      shocks: { 'BTC': -0.70, 'ETH': -0.65, 'SOL': -0.75 },
      portfolioImpact: -0.58,
      probability: 0.05,
    },
    {
      name: 'Regulatory Crackdown',
      description: 'Major regulatory restrictions on cryptocurrency trading',
      shocks: { 'BTC': -0.30, 'ETH': -0.35, 'SOL': -0.40 },
      portfolioImpact: -0.28,
      probability: 0.15,
    },
    {
      name: 'Flash Crash',
      description: 'Sudden liquidity crisis causing rapid price decline',
      shocks: { 'BTC': -0.25, 'ETH': -0.20, 'SOL': -0.30 },
      portfolioImpact: -0.22,
      probability: 0.08,
    },
  ]);

  const [riskContributions] = useState<RiskContribution[]>([
    {
      asset: 'BTC',
      weight: 0.45,
      marginalVar: -67500,
      componentVar: -56250,
      percentContribution: 45.0,
    },
    {
      asset: 'ETH',
      weight: 0.30,
      marginalVar: -45000,
      componentVar: -33750,
      percentContribution: 27.0,
    },
    {
      asset: 'SOL',
      weight: 0.15,
      marginalVar: -30000,
      componentVar: -18750,
      percentContribution: 15.0,
    },
    {
      asset: 'ADA',
      weight: 0.10,
      marginalVar: -20000,
      componentVar: -16250,
      percentContribution: 13.0,
    },
  ]);

  // Mock historical VaR data
  const [varHistory] = useState(() => {
    const data = [];
    for (let i = 30; i >= 0; i--) {
      data.push({
        date: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        var95: -120000 + Math.random() * 20000,
        var99: -180000 + Math.random() * 30000,
        realized: -100000 + Math.random() * 40000,
      });
    }
    return data;
  });

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
      case 'var':
        if (value < -150000) return 'critical';
        if (value < -100000) return 'warning';
        return 'normal';
      case 'maxDrawdown':
        if (value < -0.20) return 'critical';
        if (value < -0.15) return 'warning';
        return 'normal';
      case 'sharpeRatio':
        if (value < 1.0) return 'critical';
        if (value < 1.5) return 'warning';
        return 'normal';
      default:
        return 'normal';
    }
  };

  const getStressSeverity = (impact: number): 'low' | 'medium' | 'high' => {
    if (Math.abs(impact) > 0.4) return 'high';
    if (Math.abs(impact) > 0.2) return 'medium';
    return 'low';
  };

  const renderCorrelationHeatmap = () => {
    const { assets, correlations } = correlationMatrix;
    const gridSize = assets.length;
    
    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridSize + 1}, 1fr)`, gap: '1px', marginBottom: '8px' }}>
          <div></div>
          {assets.map(asset => (
            <div key={asset} style={{ fontSize: '12px', textAlign: 'center', color: '#888' }}>
              {asset}
            </div>
          ))}
          {assets.map((rowAsset, i) => (
            <React.Fragment key={rowAsset}>
              <div style={{ fontSize: '12px', color: '#888', display: 'flex', alignItems: 'center' }}>
                {rowAsset}
              </div>
              {correlations[i].map((correlation, j) => (
                <HeatmapCell key={`${i}-${j}`} value={correlation}>
                  {correlation.toFixed(2)}
                </HeatmapCell>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  const renderOverviewTab = () => (
    <>
      <ChartContainer>
        <ChartTitle>Value at Risk Trend</ChartTitle>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={varHistory}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="date" stroke="#888" fontSize={10} />
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
            <Line type="monotone" dataKey="var95" stroke="#ff5252" strokeWidth={2} dot={false} name="VaR 95%" />
            <Line type="monotone" dataKey="var99" stroke="#ff8a65" strokeWidth={2} dot={false} name="VaR 99%" />
            <Line type="monotone" dataKey="realized" stroke="#00ff88" strokeWidth={2} dot={false} name="Realized P&L" />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>

      <ChartContainer>
        <ChartTitle>Risk Decomposition</ChartTitle>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={riskContributions}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="asset" stroke="#888" fontSize={10} />
            <YAxis stroke="#888" fontSize={10} tickFormatter={(value) => `${value}%`} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1a1a1a', 
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#fff'
              }}
            />
            <Area 
              type="monotone" 
              dataKey="percentContribution" 
              stackId="1"
              stroke="#007bff" 
              fill="#007bff"
              fillOpacity={0.6}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </>
  );

  const renderCorrelationTab = () => (
    <ChartContainer style={{ gridColumn: '1 / -1' }}>
      <ChartTitle>Asset Correlation Matrix</ChartTitle>
      {renderCorrelationHeatmap()}
      <div style={{ marginTop: '16px', fontSize: '12px', color: '#888' }}>
        <p>Correlation ranges from -1 (perfect negative correlation) to +1 (perfect positive correlation)</p>
        <p>High correlations indicate assets move together, reducing diversification benefits</p>
      </div>
    </ChartContainer>
  );

  const renderStressTab = () => (
    <ChartContainer style={{ gridColumn: '1 / -1' }}>
      <ChartTitle>Stress Test Scenarios</ChartTitle>
      <StressTestTable>
        {stressTestScenarios.map((scenario, index) => (
          <StressTestRow key={index} severity={getStressSeverity(scenario.portfolioImpact)}>
            <div>
              <div style={{ fontWeight: '600', marginBottom: '4px' }}>{scenario.name}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>{scenario.description}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: '600', color: scenario.portfolioImpact < 0 ? '#ff5252' : '#00ff88' }}>
                {formatPercentage(scenario.portfolioImpact)}
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>Portfolio Impact</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontWeight: '600' }}>{formatPercentage(scenario.probability)}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>Probability</div>
            </div>
          </StressTestRow>
        ))}
      </StressTestTable>
    </ChartContainer>
  );

  const renderDecompositionTab = () => (
    <ChartContainer style={{ gridColumn: '1 / -1' }}>
      <ChartTitle>Risk Contribution Analysis</ChartTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
        <div>
          <h4 style={{ margin: '0 0 12px 0', color: '#ccc' }}>Component VaR</h4>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={riskContributions}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="asset" stroke="#888" fontSize={10} />
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
              <Area 
                type="monotone" 
                dataKey="componentVar" 
                stroke="#ff5252" 
                fill="#ff5252"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div>
          <h4 style={{ margin: '0 0 12px 0', color: '#ccc' }}>Marginal VaR</h4>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={riskContributions}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="asset" stroke="#888" fontSize={10} />
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
              <Area 
                type="monotone" 
                dataKey="marginalVar" 
                stroke="#ffc107" 
                fill="#ffc107"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ChartContainer>
  );

  return (
    <Container>
      <Header>
        <Title>Portfolio Risk Analytics</Title>
        <Controls>
          <Select value={timeHorizon} onChange={() => {}}>
            <option value="1D">1 Day</option>
            <option value="1W">1 Week</option>
            <option value="1M">1 Month</option>
            <option value="3M">3 Months</option>
            <option value="1Y">1 Year</option>
          </Select>
          <Select value={confidenceLevel} onChange={() => {}}>
            <option value={95}>95% Confidence</option>
            <option value={99}>99% Confidence</option>
          </Select>
        </Controls>
      </Header>

      <MetricsGrid>
        <MetricCard
          alertLevel={getMetricAlertLevel('var', riskMetrics.var)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <MetricLabel>Value at Risk ({confidenceLevel}%)</MetricLabel>
          <MetricValue color="#ff5252">{formatCurrency(riskMetrics.var)}</MetricValue>
          <MetricSubtext>{timeHorizon} horizon</MetricSubtext>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <MetricLabel>Expected Shortfall</MetricLabel>
          <MetricValue color="#ff8a65">{formatCurrency(riskMetrics.expectedShortfall)}</MetricValue>
          <MetricSubtext>Conditional VaR</MetricSubtext>
        </MetricCard>

        <MetricCard
          alertLevel={getMetricAlertLevel('sharpeRatio', riskMetrics.sharpeRatio)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <MetricLabel>Sharpe Ratio</MetricLabel>
          <MetricValue color="#00ff88">{riskMetrics.sharpeRatio.toFixed(2)}</MetricValue>
          <MetricSubtext>Risk-adjusted return</MetricSubtext>
        </MetricCard>

        <MetricCard
          alertLevel={getMetricAlertLevel('maxDrawdown', riskMetrics.maxDrawdown)}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <MetricLabel>Max Drawdown</MetricLabel>
          <MetricValue color="#ffc107">{formatPercentage(riskMetrics.maxDrawdown)}</MetricValue>
          <MetricSubtext>Peak-to-trough decline</MetricSubtext>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <MetricLabel>Portfolio Beta</MetricLabel>
          <MetricValue>{riskMetrics.beta.toFixed(2)}</MetricValue>
          <MetricSubtext>Market sensitivity</MetricSubtext>
        </MetricCard>

        <MetricCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <MetricLabel>Volatility</MetricLabel>
          <MetricValue color="#64b5f6">{formatPercentage(riskMetrics.volatility)}</MetricValue>
          <MetricSubtext>Annualized</MetricSubtext>
        </MetricCard>
      </MetricsGrid>

      <div style={{ gridColumn: '1 / -1' }}>
        <TabContainer>
          <Tab active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
            Overview
          </Tab>
          <Tab active={activeTab === 'correlation'} onClick={() => setActiveTab('correlation')}>
            Correlation
          </Tab>
          <Tab active={activeTab === 'stress'} onClick={() => setActiveTab('stress')}>
            Stress Tests
          </Tab>
          <Tab active={activeTab === 'decomposition'} onClick={() => setActiveTab('decomposition')}>
            Risk Decomposition
          </Tab>
        </TabContainer>

        <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'overview' ? '1fr 1fr' : '1fr', gap: '16px' }}>
          {activeTab === 'overview' && renderOverviewTab()}
          {activeTab === 'correlation' && renderCorrelationTab()}
          {activeTab === 'stress' && renderStressTab()}
          {activeTab === 'decomposition' && renderDecompositionTab()}
        </div>
      </div>
    </Container>
  );
};

export default PortfolioRiskAnalytics;
