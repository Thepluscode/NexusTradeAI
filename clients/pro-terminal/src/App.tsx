import React, { useState, useEffect } from 'react';
import styled, { ThemeProvider, createGlobalStyle } from 'styled-components';
import { Provider } from 'react-redux';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Components
import Level2OrderBook from './components/AdvancedCharts/Level2OrderBook';
import AlgorithmDashboard from './components/AlgorithmicTrading/AlgorithmDashboard';
import RealTimeRiskMonitor from './components/RiskDashboard/RealTimeRiskMonitor';
import MultiAssetTradingInterface from './components/MultiAssetTrading/MultiAssetTradingInterface';
import PortfolioRiskAnalytics from './components/InstitutionalTools/PortfolioRiskAnalytics';

// Services
import DirectMarketAccess from './low-latency/direct-market-access';
import { Level2DataManager } from './real-time/level2-data';
import { TimeAndSalesManager } from './real-time/time-and-sales';
import { OptionsFlowManager } from './real-time/options-flow';

// Store (would be implemented)
// import { store } from './store/store';

const theme = {
  colors: {
    primary: '#007bff',
    secondary: '#6c757d',
    success: '#00ff88',
    danger: '#ff5252',
    warning: '#ffc107',
    info: '#17a2b8',
    dark: '#0a0a0a',
    darker: '#1a1a1a',
    light: '#f8f9fa',
    border: '#333',
    text: '#fff',
    textSecondary: '#ccc',
    textMuted: '#888',
  },
  fonts: {
    primary: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif',
    mono: '"Monaco", "Menlo", "Ubuntu Mono", monospace',
  },
  breakpoints: {
    sm: '576px',
    md: '768px',
    lg: '992px',
    xl: '1200px',
    xxl: '1400px',
  },
};

const GlobalStyle = createGlobalStyle`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  html, body {
    height: 100%;
    font-family: ${theme.fonts.primary};
    background: ${theme.colors.dark};
    color: ${theme.colors.text};
    overflow: hidden;
  }

  #root {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  ::-webkit-scrollbar-track {
    background: ${theme.colors.darker};
  }

  ::-webkit-scrollbar-thumb {
    background: ${theme.colors.border};
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: #555;
  }

  /* AG Grid theme overrides */
  .ag-theme-alpine-dark {
    --ag-background-color: ${theme.colors.darker};
    --ag-header-background-color: #2a2a2a;
    --ag-odd-row-background-color: #1e1e1e;
    --ag-row-hover-color: ${theme.colors.border};
    --ag-border-color: ${theme.colors.border};
    --ag-foreground-color: ${theme.colors.text};
    --ag-secondary-foreground-color: ${theme.colors.textSecondary};
  }
`;

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: ${theme.colors.dark};
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: ${theme.colors.darker};
  border-bottom: 1px solid ${theme.colors.border};
  height: 48px;
  flex-shrink: 0;
`;

const Logo = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 700;
  color: ${theme.colors.primary};
`;

const LogoIcon = styled.div`
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, ${theme.colors.primary}, ${theme.colors.success});
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 14px;
`;

const Navigation = styled.nav`
  display: flex;
  gap: 4px;
`;

const NavButton = styled.button<{ active?: boolean }>`
  padding: 6px 12px;
  background: ${props => props.active ? theme.colors.primary : 'transparent'};
  border: 1px solid ${props => props.active ? theme.colors.primary : theme.colors.border};
  border-radius: 4px;
  color: ${props => props.active ? 'white' : theme.colors.textSecondary};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: ${props => props.active ? theme.colors.primary : theme.colors.border};
    color: white;
  }
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
`;

const StatusIndicator = styled.div<{ status: 'connected' | 'disconnected' | 'error' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  color: ${props => {
    switch (props.status) {
      case 'connected': return theme.colors.success;
      case 'error': return theme.colors.danger;
      default: return theme.colors.textMuted;
    }
  }};
`;

const StatusDot = styled.div<{ status: 'connected' | 'disconnected' | 'error' }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${props => {
    switch (props.status) {
      case 'connected': return theme.colors.success;
      case 'error': return theme.colors.danger;
      default: return theme.colors.textMuted;
    }
  }};
  animation: ${props => props.status === 'connected' ? 'pulse 2s infinite' : 'none'};

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;

const MainContent = styled.main`
  flex: 1;
  display: flex;
  overflow: hidden;
`;

interface AppState {
  currentView: 'trading' | 'algorithms' | 'risk' | 'analytics' | 'orderbook';
  connectionStatus: 'connected' | 'disconnected' | 'error';
  latency: number;
  orderCount: number;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>({
    currentView: 'trading',
    connectionStatus: 'connected',
    latency: 0.25,
    orderCount: 0,
  });

  // Initialize services
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // Initialize DMA
        const dmaConfig = {
          exchangeEndpoints: {
            'binance': 'wss://stream.binance.com:9443/ws',
            'coinbase': 'wss://ws-feed.pro.coinbase.com',
            'kraken': 'wss://ws.kraken.com',
          },
          apiKeys: {
            'binance': process.env.REACT_APP_BINANCE_API_KEY || '',
            'coinbase': process.env.REACT_APP_COINBASE_API_KEY || '',
            'kraken': process.env.REACT_APP_KRAKEN_API_KEY || '',
          },
          maxLatencyThreshold: 1000, // 1ms
          enableColocation: false,
          enableHardwareAcceleration: false,
          orderRateLimit: 100,
          riskLimits: {
            maxOrderValue: 1000000,
            maxDailyVolume: 10000000,
            maxPositionSize: 5000000,
          },
        };

        const dma = new DirectMarketAccess(dmaConfig);
        
        // Initialize real-time data managers
        const level2Manager = new Level2DataManager();
        const timeAndSalesManager = new TimeAndSalesManager();
        const optionsFlowManager = new OptionsFlowManager();

        // Set up event listeners
        dma.on('connection_established', ({ exchange }) => {
          console.log(`Connected to ${exchange}`);
          setAppState(prev => ({ ...prev, connectionStatus: 'connected' }));
        });

        dma.on('connection_error', ({ exchange, error }) => {
          console.error(`Connection error to ${exchange}:`, error);
          setAppState(prev => ({ ...prev, connectionStatus: 'error' }));
        });

        // Simulate latency updates
        const latencyInterval = setInterval(() => {
          const newLatency = 0.1 + Math.random() * 0.5; // 0.1-0.6ms
          setAppState(prev => ({ ...prev, latency: newLatency }));
        }, 1000);

        return () => {
          clearInterval(latencyInterval);
        };

      } catch (error) {
        console.error('Failed to initialize services:', error);
        setAppState(prev => ({ ...prev, connectionStatus: 'error' }));
      }
    };

    initializeServices();
  }, []);

  const handleViewChange = (view: AppState['currentView']) => {
    setAppState(prev => ({ ...prev, currentView: view }));
  };

  const renderCurrentView = () => {
    switch (appState.currentView) {
      case 'trading':
        return (
          <MultiAssetTradingInterface
            onPlaceOrder={(order) => {
              console.log('Placing order:', order);
              setAppState(prev => ({ ...prev, orderCount: prev.orderCount + 1 }));
            }}
            onCancelOrder={(orderId) => {
              console.log('Cancelling order:', orderId);
            }}
            onClosePosition={(symbol) => {
              console.log('Closing position:', symbol);
            }}
          />
        );
      
      case 'algorithms':
        return (
          <AlgorithmDashboard
            onCreateAlgorithm={(type, config) => {
              console.log('Creating algorithm:', type, config);
            }}
            onControlAlgorithm={(id, action) => {
              console.log('Controlling algorithm:', id, action);
            }}
          />
        );
      
      case 'risk':
        return (
          <RealTimeRiskMonitor
            portfolioId="main"
            refreshInterval={1000}
            onRiskAlert={(alert) => {
              console.log('Risk alert:', alert);
            }}
          />
        );
      
      case 'analytics':
        return (
          <PortfolioRiskAnalytics
            portfolioId="main"
            timeHorizon="1D"
            confidenceLevel={95}
          />
        );
      
      case 'orderbook':
        return (
          <Level2OrderBook
            symbol="BTC-USD"
            data={{
              bids: [
                { price: 43249.50, size: 1.25, total: 1.25, orders: 3, timestamp: Date.now() },
                { price: 43249.00, size: 2.50, total: 3.75, orders: 5, timestamp: Date.now() },
                { price: 43248.50, size: 0.75, total: 4.50, orders: 2, timestamp: Date.now() },
              ],
              asks: [
                { price: 43250.50, size: 0.85, total: 0.85, orders: 2, timestamp: Date.now() },
                { price: 43251.00, size: 1.50, total: 2.35, orders: 4, timestamp: Date.now() },
                { price: 43251.50, size: 2.25, total: 4.60, orders: 6, timestamp: Date.now() },
              ],
              spread: 1.00,
              midPrice: 43250.00,
              lastUpdate: Date.now(),
            }}
            maxLevels={20}
            showDepthChart={true}
            showHeatmap={true}
            precision={2}
            onPriceClick={(price, side) => {
              console.log('Price clicked:', price, side);
            }}
          />
        );
      
      default:
        return <div>Select a view</div>;
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <AppContainer>
        <Header>
          <Logo>
            <LogoIcon>NT</LogoIcon>
            NexusTrade Pro Terminal
          </Logo>
          
          <Navigation>
            <NavButton
              active={appState.currentView === 'trading'}
              onClick={() => handleViewChange('trading')}
            >
              Trading
            </NavButton>
            <NavButton
              active={appState.currentView === 'algorithms'}
              onClick={() => handleViewChange('algorithms')}
            >
              Algorithms
            </NavButton>
            <NavButton
              active={appState.currentView === 'risk'}
              onClick={() => handleViewChange('risk')}
            >
              Risk Monitor
            </NavButton>
            <NavButton
              active={appState.currentView === 'analytics'}
              onClick={() => handleViewChange('analytics')}
            >
              Analytics
            </NavButton>
            <NavButton
              active={appState.currentView === 'orderbook'}
              onClick={() => handleViewChange('orderbook')}
            >
              Order Book
            </NavButton>
          </Navigation>

          <StatusBar>
            <StatusIndicator status={appState.connectionStatus}>
              <StatusDot status={appState.connectionStatus} />
              {appState.connectionStatus.toUpperCase()}
            </StatusIndicator>
            <div>Latency: {appState.latency.toFixed(2)}ms</div>
            <div>Orders: {appState.orderCount}</div>
            <div>{new Date().toLocaleTimeString()}</div>
          </StatusBar>
        </Header>

        <MainContent>
          {renderCurrentView()}
        </MainContent>
      </AppContainer>
    </ThemeProvider>
  );
};

export default App;
