//clients/web-app/README.md
# Nexus Trade AI - Web Application

## Overview

The Nexus Trade AI web application is a modern, responsive trading platform built with Next.js, TypeScript, and Tailwind CSS. It provides professional-grade trading tools with institutional-level features accessible to retail traders.

## Features

- **Real-time Market Data**: Live price feeds, order books, and trade execution
- **AI-Powered Insights**: Machine learning-driven trading signals and risk analysis
- **Advanced Trading**: Multiple order types, algorithmic trading, and portfolio management
- **Professional Charts**: TradingView-style charts with technical indicators
- **Risk Management**: Real-time risk metrics and portfolio analysis
- **Cross-Market Trading**: Stocks, crypto, forex, and commodities in one platform

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Redux Toolkit
- **Charts**: Recharts
- **Real-time**: WebSockets with Socket.io
- **Authentication**: NextAuth.js
- **Testing**: Jest + React Testing Library

## Getting Started

### Prerequisites

- Node.js 18.0.0 or later
- npm or yarn
- Git

### Installation

1. Clone the repository:
```bash
git clone https://github.com/nexus-trade/nexus-trade-ai.git
cd nexus-trade-ai/clients/web-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

4. Configure your environment variables in `.env.local`

5. Start the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Common/         # Layout, Header, Sidebar
│   ├── Trading/        # Trading-specific components
│   ├── Analytics/      # Charts and analysis tools
│   └── AI/            # AI insights and recommendations
├── pages/              # Next.js pages
├── store/              # Redux store and slices
├── services/           # API services and utilities
├── hooks/              # Custom React hooks
├── utils/              # Utility functions
├── styles/             # Global styles
└── types/              # TypeScript type definitions
```

## Key Components

### Trading Components
- `OrderEntry`: Advanced order placement with risk scoring
- `OrderBook`: Real-time order book visualization
- `TradeHistory`: Trade execution history and analytics

### Dashboard Components
- `DashboardOverview`: Main dashboard with key metrics
- `PortfolioView`: Portfolio performance and allocation
- `MarketSummary`: Market overview and watchlists

### AI Components
- `PredictionDashboard`: AI-powered price predictions
- `SentimentAnalysis`: Market sentiment indicators
- `RecommendationEngine`: Personalized trading recommendations

## Development

### Code Style

We use ESLint and Prettier for code formatting:

```bash
npm run lint
npm run format
```

### Testing

Run the test suite:

```bash
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Generate coverage report
```

### Type Checking

Ensure TypeScript types are correct:

```bash
npm run type-check
```

### Building

Build for production:

```bash
npm run build
npm start
```

## Configuration

### Environment Variables

Key environment variables for configuration:

- `REACT_APP_API_URL`: Backend API URL
- `REACT_APP_WS_URL`: WebSocket server URL
- `NEXTAUTH_SECRET`: Authentication secret
- `POLYGON_API_KEY`: Market data provider key

### Feature Flags

Control feature availability:

- `NEXT_PUBLIC_ENABLE_AI_FEATURES`: Enable AI-powered features
- `NEXT_PUBLIC_ENABLE_PAPER_TRADING`: Enable paper trading mode
- `NEXT_PUBLIC_ENABLE_CRYPTO_TRADING`: Enable cryptocurrency trading

## API Integration

The web app integrates with multiple APIs:

### Internal APIs
- Authentication service
- Trading engine
- Market data service
- Risk management service
- AI/ML service

### External APIs
- Polygon.io (market data)
- Alpha Vantage (market data)
- Coinbase (crypto data)
- OpenAI (AI features)

## Security

Security measures implemented:

- JWT-based authentication
- HTTPS enforcement
- CSRF protection
- Rate limiting
- Input validation and sanitization
- Secure cookie handling

## Performance

Performance optimizations:

- Next.js automatic code splitting
- Image optimization
- WebSocket connection pooling
- Redux state normalization
- Lazy loading of components
- Service worker for caching

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Configure environment variables
3. Deploy automatically on push

### Docker

Build and run with Docker:

```bash
docker build -t nexus-trade-web .
docker run -p 3000:3000 nexus-trade-web
```

### Manual Deployment

1. Build the application:
```bash
npm run build
```

2. Deploy the `out` directory to your hosting provider

## Monitoring

### Analytics
- Google Analytics integration
- Custom event tracking
- Performance monitoring

### Error Tracking
- Sentry integration
- Error boundary implementation
- Automated error reporting

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Submit a pull request

### Code Review Process

All changes require:
- Code review approval
- Passing tests
- TypeScript compliance
- Security review for sensitive changes

## License

This project is proprietary software. All rights reserved.

## Support

For support and questions:
- Technical issues: Create an issue on GitHub
- Business inquiries: contact@nexustrade.ai
- Documentation: [docs.nexustrade.ai](https://docs.nexustrade.ai)

---

**Built with ❤️ by the Nexus Trade AI Team**
# Environment Configuration
NODE_ENV=development
NEXT_PUBLIC_APP_ENV=development

# API Configuration
REACT_APP_API_URL=http://localhost:3001/api
REACT_APP_WS_URL=ws://localhost:3001

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/nexus_trade

# Redis
REDIS_URL=redis://localhost:6379

# External APIs
POLYGON_API_KEY=your-polygon-api-key
ALPHA_VANTAGE_API_KEY=your-alpha-vantage-api-key
COINBASE_API_KEY=your-coinbase-api-key
COINBASE_API_SECRET=your-coinbase-api-secret

# Market Data
MARKET_DATA_PROVIDER=polygon
CRYPTO_DATA_PROVIDER=coinbase

# AI/ML Services
OPENAI_API_KEY=your-openai-api-key
HUGGINGFACE_API_KEY=your-huggingface-api-key

# Analytics
GOOGLE_ANALYTICS_ID=GA-XXXXXXXXX
SENTRY_DSN=your-sentry-dsn

# Payment Processing
STRIPE_PUBLISHABLE_KEY=pk_test_your-stripe-key
STRIPE_SECRET_KEY=sk_test_your-stripe-secret

# Feature Flags
NEXT_PUBLIC_ENABLE_AI_FEATURES=true
NEXT_PUBLIC_ENABLE_PAPER_TRADING=true
NEXT_PUBLIC_ENABLE_CRYPTO_TRADING=true

# Development
ANALYZE=false
BUNDLE_ANALYZE=false
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Switch
} from 'react-native';
import {
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  PieChart,
  BarChart3,
  DollarSign,
  Target,
  Settings,
  Download
} from 'lucide-react-native';
import { PieChart as RNPieChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');

interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  market: string;
  allocation: number;
}

const PortfolioScreen: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [showBalances, setShowBalances] = useState(true);
  const [selectedView, setSelectedView] = useState<'overview' | 'positions' | 'allocation'>('overview');
  const [timeframe, setTimeframe] = useState('1D');

  const [portfolio] = useState({
    totalValue: 1250000,
    availableCash: 125000,
    dayChange: 15750,
    dayChangePercent: 1.28,
    totalPnL: 89500,
    totalPnLPercent: 7.71
  });

  const [positions] = useState<Position[]>([
    {
      symbol: 'AAPL',
      quantity: 500,
      avgPrice: 165.20,
      currentPrice: 175.84,
      unrealizedPnL: 5320,
      market: 'NASDAQ',
      allocation: 35.2
    },
    {
      symbol: 'BTC',
      quantity: 2.5,
      avgPrice: 41000,
      currentPrice: 43250,
      unrealizedPnL: 5625,
      market: 'Crypto',
      allocation: 28.7
    },
    {
      symbol: 'TSLA',
      quantity: 200,
      avgPrice: 245.60,
      currentPrice: 238.45,
      unrealizedPnL: -1430,
      market: 'NASDAQ',
      allocation: 19.1
    },
    {
      symbol: 'EUR/USD',
      quantity: 100000,
      avgPrice: 1.0820,
      currentPrice: 1.0875,
      unrealizedPnL: 550,
      market: 'Forex',
      allocation: 17.0
    }
  ]);

  const chartData = [
    {
      name: 'Stocks',
      population: 54.3,
      color: '#3b82f6',
      legendFontColor: '#94a3b8',
      legendFontSize: 12
    },
    {
      name: 'Crypto',
      population: 28.7,
      color: '#f59e0b',
      legendFontColor: '#94a3b8',
      legendFontSize: 12
    },
    {
      name: 'Forex',
      population: 17.0,
      color: '#10b981',
      legendFontColor: '#94a3b8',
      legendFontSize: 12
    }
  ];

  const timeframes = ['1D', '1W', '1M', '3M', '6M', '1Y'];

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 2000);
  };

  const formatCurrency = (amount: number): string => {
    if (!showBalances) return '••••••';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercent = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const renderOverview = () => (
    <View style={styles.tabContent}>
      {/* Portfolio Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <Text style={styles.summaryTitle}>Portfolio Value</Text>
          <TouchableOpacity onPress={() => setShowBalances(!showBalances)}>
            {showBalances ? (
              <Eye size={20} color="#94a3b8" />
            ) : (
              <EyeOff size={20} color="#94a3b8" />
            )}
          </TouchableOpacity>
        </View>
        
        <Text style={styles.summaryValue}>
          {formatCurrency(portfolio.totalValue)}
        </Text>
        
        <View style={styles.summaryChange}>
          {portfolio.dayChangePercent >= 0 ? (
            <TrendingUp size={16} color="#10b981" />
          ) : (
            <TrendingDown size={16} color="#ef4444" />
          )}
          <Text style={[
            styles.changeText,
            { color: portfolio.dayChangePercent >= 0 ? '#10b981' : '#ef4444' }
          ]}>
            {showBalances ? formatCurrency(portfolio.dayChange) : '••••'} 
            ({formatPercent(portfolio.dayChangePercent)})
          </Text>
        </View>
      </View>

      {/* Performance Metrics */}
      <View style={styles.metricsGrid}>
        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Text style={styles.metricTitle}>Available Cash</Text>
            <DollarSign size={16} color="#10b981" />
          </View>
          <Text style={styles.metricValue}>
            {formatCurrency(portfolio.availableCash)}
          </Text>
          <Text style={styles.metricSubtitle}>Ready to invest</Text>
        </View>

        <View style={styles.metricCard}>
          <View style={styles.metricHeader}>
            <Text style={styles.metricTitle}>Total P&L</Text>
            <Target size={16} color="#3b82f6" />
          </View>
          <Text style={[
            styles.metricValue,
            { color: portfolio.totalPnL >= 0 ? '#10b981' : '#ef4444' }
          ]}>
            {showBalances ? formatCurrency(portfolio.totalPnL) : '••••••'}
          </Text>
          <Text style={styles.metricSubtitle}>
            {formatPercent(portfolio.totalPnLPercent)}
          </Text>
        </View>
      </View>

      {/* Timeframe Selector */}
      <View style={styles.timeframeSelector}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.timeframeContainer}
        >
          {timeframes.map((tf) => (
            <TouchableOpacity
              key={tf}
              style={[
                styles.timeframeButton,
                timeframe === tf && styles.timeframeButtonActive
              ]}
              onPress={() => setTimeframe(tf)}
            >
              <Text style={[
                styles.timeframeText,
                timeframe === tf && styles.timeframeTextActive
              ]}>
                {tf}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Performance Chart Placeholder */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Performance Chart</Text>
        <View style={styles.chartPlaceholder}>
          <BarChart3 size={48} color="#64748b" />
          <Text style={styles.chartPlaceholderText}>
            Interactive chart would display here
          </Text>
        </View>
      </View>
    </View>
  );

  const renderPositions = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Your Positions</Text>
      {positions.map((position, index) => {
        const marketValue = position.quantity * position.currentPrice;
        const percentChange = ((position.currentPrice - position.avgPrice) / position.avgPrice) * 100;
        
        return (
          <View key={index} style={styles.positionCard}>
            <View style={styles.positionHeader}>
              <View>
                <Text style={styles.positionSymbol}>{position.symbol}</Text>
                <Text style={styles.positionMarket}>{position.market}</Text>
              </View>
              <View style={styles.positionRight}>
                <Text style={styles.positionValue}>
                  {showBalances ? formatCurrency(marketValue) : '••••••'}
                </Text>
                <Text style={[
                  styles.positionPnL,
                  { color: position.unrealizedPnL >= 0 ? '#10b981' : '#ef4444' }
                ]}>
                  {showBalances ? (
                    `${position.unrealizedPnL >= 0 ? '+' : ''}${formatCurrency(position.unrealizedPnL)}`
                  ) : '••••'}
                </Text>
              </View>
            </View>
            
            <View style={styles.positionDetails}>
              <View style={styles.positionDetailItem}>
                <Text style={styles.positionDetailLabel}>Quantity</Text>
                <Text style={styles.positionDetailValue}>
                  {position.quantity.toLocaleString()}
                </Text>
              </View>
              <View style={styles.positionDetailItem}>
                <Text style={styles.positionDetailLabel}>Avg Price</Text>
                <Text style={styles.positionDetailValue}>
                  {showBalances ? formatCurrency(position.avgPrice) : '••••'}
                </Text>
              </View>
              <View style={styles.positionDetailItem}>
                <Text style={styles.positionDetailLabel}>Current</Text>
                <Text style={styles.positionDetailValue}>
                  {showBalances ? formatCurrency(position.currentPrice) : '••••'}
                </Text>
              </View>
              <View style={styles.positionDetailItem}>
                <Text style={styles.positionDetailLabel}>% Change</Text>
                <Text style={[
                  styles.positionDetailValue,
                  { color: percentChange >= 0 ? '#10b981' : '#ef4444' }
                ]}>
                  {formatPercent(percentChange)}
                </Text>
              </View>
            </View>
            
            <View style={styles.allocationBar}>
              <View 
                style={[
                  styles.allocationFill,
                  { width: `${position.allocation}%` }
                ]}
              />
            </View>
            <Text style={styles.allocationText}>
              {position.allocation}% of portfolio
            </Text>
          </View>
        );
      })}
    </View>
  );

  const renderAllocation = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Asset Allocation</Text>
      
      <View style={styles.chartCard}>
        <RNPieChart
          data={chartData}
          width={width - 80}
          height={220}
          chartConfig={{
            color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
            labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`
          }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          center={[10, 0]}
          absolute
        />
      </View>

      <View style={styles.allocationList}>
        {chartData.map((item, index) => (
          <View key={index} style={styles.allocationItem}>
            <View style={styles.allocationItemLeft}>
              <View 
                style={[
                  styles.allocationDot,
                  { backgroundColor: item.color }
                ]}
              />
              <Text style={styles.allocationItemName}>{item.name}</Text>
            </View>
            <Text style={styles.allocationItemPercent}>
              {item.population.toFixed(1)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton}>
            <Download size={20} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Settings size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        {[
          { key: 'overview', label: 'Overview', icon: BarChart3 },
          { key: 'positions', label: 'Positions', icon: Target },
          { key: 'allocation', label: 'Allocation', icon: PieChart }
        ].map(({ key, label, icon: Icon }) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.tab,
              selectedView === key && styles.activeTab
            ]}
            onPress={() => setSelectedView(key as any)}
          >
            <Icon size={16} color={selectedView === key ? '#ffffff' : '#94a3b8'} />
            <Text style={[
              styles.tabText,
              selectedView === key && styles.activeTabText
            ]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {selectedView === 'overview' && renderOverview()}
        {selectedView === 'positions' && renderPositions()}
        {selectedView === 'allocation' && renderAllocation()}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: 50
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  headerButton: {
    padding: 8,
    marginLeft: 8
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    marginHorizontal: 20,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    space: 8
  },
  activeTab: {
    backgroundColor: '#3b82f6'
  },
  tabText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
    marginLeft: 6
  },
  activeTabText: {
    color: '#ffffff'
  },
  content: {
    flex: 1,
    paddingHorizontal: 20
  },
  tabContent: {
    paddingBottom: 20
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155'
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  summaryTitle: {
    fontSize: 16,
    color: '#94a3b8'
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8
  },
  summaryChange: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  metricCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    width: (width - 60) / 2,
    borderWidth: 1,
    borderColor: '#334155'
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  metricTitle: {
    fontSize: 12,
    color: '#94a3b8'
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4
  },
  metricSubtitle: {
    fontSize: 10,
    color: '#64748b'
  },
  timeframeSelector: {
    marginBottom: 20
  },
  timeframeContainer: {
    paddingHorizontal: 0
  },
  timeframeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  timeframeButtonActive: {
    backgroundColor: '#3b82f6'
  },
  timeframeText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500'
  },
  timeframeTextActive: {
    color: '#ffffff'
  },
  chartCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155'
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16
  },
  chartPlaceholder: {
    height: 200,
    alignItems: 'center',
    justifyContent: 'center'
  },
  chartPlaceholderText: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 8
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16
  },
  positionCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  positionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  positionSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  positionMarket: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  positionRight: {
    alignItems: 'flex-end'
  },
  positionValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  positionPnL: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2
  },
  positionDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  positionDetailItem: {
    alignItems: 'center'
  },
  positionDetailLabel: {
    fontSize: 10,
    color: '#64748b',
    marginBottom: 4
  },
  positionDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff'
  },
  allocationBar: {
    height: 4,
    backgroundColor: '#334155',
    borderRadius: 2,
    marginBottom: 6
  },
  allocationFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 2
  },
  allocationText: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center'
  },
  allocationList: {
    marginTop: 20
  },
  allocationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155'
  },
  allocationItemLeft: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  allocationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12
  },
  allocationItemName: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500'
  },
  allocationItemPercent: {
    fontSize: 16,
    color: '#94a3b8',
    fontWeight: '600'
  }
});

export default PortfolioScreen;
export interface TWAPParameters {
  symbol: string;
  side: 'buy' | 'sell';
  totalQuantity: number;
  duration: number; // minutes
  sliceSize?: number;
  randomization?: boolean;
  minInterval?: number; // seconds
  maxInterval?: number; // seconds
  priceLimit?: number;
  aggressiveness: 'passive' | 'neutral' | 'aggressive';
}

export interface TWAPState {
  id: string;
  parameters: TWAPParameters;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  startTime: Date;
  endTime: Date;
  executed: number;
  remaining: number;
  averagePrice: number;
  orders: TWAPOrder[];
  performance: TWAPPerformance;
}

export interface TWAPOrder {
  id: string;
  quantity: number;
  price?: number;
  timestamp: Date;
  status: 'pending' | 'sent' | 'filled' | 'cancelled';
  fillPrice?: number;
  fillQuantity?: number;
}

export interface TWAPPerformance {
  vwap: number;
  slippage: number;
  marketImpact: number;
  timingCost: number;
  totalCost: number;
  efficiency: number;
}

export class TWAPAlgorithm {
  private state: TWAPState;
  private intervalId: NodeJS.Timeout | null = null;
  private onUpdate?: (state: TWAPState) => void;
  private orderAPI: any;

  constructor(
    parameters: TWAPParameters,
    orderAPI: any,
    onUpdate?: (state: TWAPState) => void
  ) {
    this.state = {
      id: `twap_${Date.now()}`,
      parameters,
      status: 'running',
      startTime: new Date(),
      endTime: new Date(Date.now() + parameters.duration * 60000),
      executed: 0,
      remaining: parameters.totalQuantity,
      averagePrice: 0,
      orders: [],
      performance: {
        vwap: 0,
        slippage: 0,
        marketImpact: 0,
        timingCost: 0,
        totalCost: 0,
        efficiency: 0
      }
    };
    
    this.orderAPI = orderAPI;
    this.onUpdate = onUpdate;
    this.start();
  }

  private start() {
    const intervalMs = this.calculateInterval();
    
    this.intervalId = setInterval(() => {
      if (this.state.status === 'running') {
        this.executeSlice();
      }
    }, intervalMs);

    // Initial execution
    setTimeout(() => this.executeSlice(), 1000);
  }

  private calculateInterval(): number {
    const { duration, totalQuantity, sliceSize } = this.state.parameters;
    const defaultSliceSize = sliceSize || Math.max(1, Math.floor(totalQuantity / (duration * 2)));
    const numberOfSlices = Math.ceil(totalQuantity / defaultSliceSize);
    const intervalMs = (duration * 60000) / numberOfSlices;
    
    return Math.max(5000, intervalMs); // Minimum 5 seconds between orders
  }

  private calculateSliceSize(): number {
    const { sliceSize, randomization } = this.state.parameters;
    const timeRemaining = this.state.endTime.getTime() - Date.now();
    const timeElapsed = Date.now() - this.state.startTime.getTime();
    const totalTime = this.state.parameters.duration * 60000;
    
    if (timeRemaining <= 0 || this.state.remaining <= 0) {
      return 0;
    }

    let baseSize = sliceSize || Math.max(1, Math.floor(this.state.remaining / 5));
    
    // Adjust for time remaining
    const urgencyFactor = Math.min(2, (totalTime - timeRemaining) / totalTime + 0.5);
    baseSize = Math.floor(baseSize * urgencyFactor);
    
    // Apply randomization
    if (randomization) {
      const variance = 0.2; // ±20%
      const randomFactor = 1 + (Math.random() - 0.5) * variance * 2;
      baseSize = Math.floor(baseSize * randomFactor);
    }
    
    return Math.min(baseSize, this.state.remaining);
  }

  private async executeSlice() {
    const sliceSize = this.calculateSliceSize();
    
    if (sliceSize <= 0 || this.state.remaining <= 0) {
      this.complete();
      return;
    }

    const order: TWAPOrder = {
      id: `order_${Date.now()}`,
      quantity: sliceSize,
      timestamp: new Date(),
      status: 'pending'
    };

    // Determine order price based on aggressiveness
    const price = await this.calculateOrderPrice();
    if (price && this.state.parameters.priceLimit) {
      const withinLimit = this.state.parameters.side === 'buy' 
        ? price <= this.state.parameters.priceLimit
        : price >= this.state.parameters.priceLimit;
      
      if (!withinLimit) {
        // Skip this slice if price is outside limit
        return;
      }
    }

    order.price = price;
    this.state.orders.push(order);

    try {
      // Submit order through API
      order.status = 'sent';
      const orderResult = await this.submitOrder(order);
      
      if (orderResult.success) {
        order.status = 'filled';
        order.fillPrice = orderResult.fillPrice;
        order.fillQuantity = orderResult.fillQuantity;
        
        this.state.executed += order.fillQuantity;
        this.state.remaining -= order.fillQuantity;
        
        this.updatePerformance();
      } else {
        order.status = 'cancelled';
      }
    } catch (error) {
      console.error('TWAP order execution error:', error);
      order.status = 'cancelled';
    }

    this.notifyUpdate();
    
    if (this.state.remaining <= 0) {
      this.complete();
    }
  }

  private async calculateOrderPrice(): Promise<number | undefined> {
    // Get current market data
    const marketData = await this.getMarketData();
    if (!marketData) return undefined;

    const { aggressiveness } = this.state.parameters;
    const { bid, ask, mid } = marketData;

    switch (aggressiveness) {
      case 'passive':
        return this.state.parameters.side === 'buy' ? bid : ask;
      case 'neutral':
        return mid;
      case 'aggressive':
        return this.state.parameters.side === 'buy' ? ask : bid;
      default:
        return mid;
    }
  }

  private async submitOrder(order: TWAPOrder): Promise<any> {
    return this.orderAPI.submitOrder({
      symbol: this.state.parameters.symbol,
      side: this.state.parameters.side,
      type: order.price ? 'limit' : 'market',
      quantity: order.quantity,
      price: order.price,
      timeInForce: 'IOC' // Immediate or Cancel for TWAP slices
    });
  }

  private async getMarketData(): Promise<any> {
    // Implementation would fetch real market data
    return {
      bid: 100.00,
      ask: 100.05,
      mid: 100.025,
      last: 100.02
    };
  }

  private updatePerformance() {
    const filledOrders = this.state.orders.filter(o => o.status === 'filled');
    
    if (filledOrders.length === 0) return;

    // Calculate VWAP
    const totalValue = filledOrders.reduce((sum, order) => 
      sum + (order.fillPrice! * order.fillQuantity!), 0);
    const totalQuantity = filledOrders.reduce((sum, order) => 
      sum + order.fillQuantity!, 0);
    
    this.state.averagePrice = totalValue / totalQuantity;
    this.state.performance.vwap = this.state.averagePrice;
    
    // Calculate other performance metrics
    // Implementation would include market impact, slippage, etc.
  }

  private complete() {
    this.state.status = 'completed';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notifyUpdate();
  }

  private notifyUpdate() {
    if (this.onUpdate) {
      this.onUpdate({ ...this.state });
    }
  }

  public pause() {
    this.state.status = 'paused';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notifyUpdate();
  }

  public resume() {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.start();
      this.notifyUpdate();
    }
  }

  public cancel() {
    this.state.status = 'cancelled';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Cancel any pending orders
    this.state.orders
      .filter(o => o.status === 'pending' || o.status === 'sent')
      .forEach(order => {
        order.status = 'cancelled';
        // API call to cancel order would go here
      });
    
    this.notifyUpdate();
  }

  public getState(): TWAPState {
    return { ...this.state };
  }
}
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Trading from './pages/Trading';
import Portfolio from './pages/Portfolio';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import QuickOrderModal from './components/QuickOrderModal';
import './styles/globals.css';

declare global {
  interface Window {
    electronAPI: any;
  }
}

const App: React.FC = () => {
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);
  const [quickOrderType, setQuickOrderType] = useState<'buy' | 'sell'>('buy');

  useEffect(() => {
    // Listen for quick order requests from main process
    window.electronAPI?.on('show-quick-order', (type: 'buy' | 'sell') => {
      setQuickOrderType(type);
      setIsQuickOrderOpen(true);
    });

    return () => {
      window.electronAPI?.removeAllListeners('show-quick-order');
    };
  }, []);

  return (
    <Provider store={store}>
      <Router>
        <div className="h-screen bg-slate-900 text-white overflow-hidden">
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/trading" element={<Trading />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>

          <QuickOrderModal
            isOpen={isQuickOrderOpen}
            onClose={() => setIsQuickOrderOpen(false)}
            type={quickOrderType}
          />
        </div>
      </Router>
    </Provider>
  );
};

export default App;