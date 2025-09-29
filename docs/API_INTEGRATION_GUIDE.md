# 🔗 NexusTradeAI API Integration Guide

This guide provides step-by-step instructions for integrating real backend APIs with your enhanced trading platform components.

## 📋 Table of Contents

1. [Setup & Configuration](#setup--configuration)
2. [Component Integration](#component-integration)
3. [Real-time Data](#real-time-data)
4. [Error Handling](#error-handling)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)

## 🚀 Setup & Configuration

### 1. Environment Setup

Copy the example environment file and configure your API credentials:

```bash
cp .env.example .env.local
```

Update `.env.local` with your actual API credentials:

```env
# Trading APIs
NEXT_PUBLIC_API_BASE_URL=https://your-api-domain.com/api
NEXT_PUBLIC_WS_URL=wss://your-api-domain.com/ws

# Exchange APIs
BINANCE_API_KEY=your_binance_api_key
BINANCE_API_SECRET=your_binance_api_secret
COINBASE_API_KEY=your_coinbase_api_key
```

### 2. Install Dependencies

```bash
npm install axios ws
npm install --save-dev @types/ws
```

## 🔧 Component Integration

### OrderEntry Component

Replace mock data with real API calls:

```typescript
// Before (Mock)
const handleSubmitOrder = async (orderData: OrderData) => {
  // Mock implementation
  console.log('Mock order submitted:', orderData);
};

// After (Real API)
import { useOrderManagement } from '@/hooks/useTradingAPI';

const OrderEntry = () => {
  const { submitOrder, submitting } = useOrderManagement();
  
  const handleSubmitOrder = async (orderData: OrderData) => {
    const orderRequest: OrderRequest = {
      symbol: orderData.symbol,
      side: orderData.side,
      type: orderData.orderType,
      quantity: orderData.quantity,
      price: orderData.limitPrice,
      timeInForce: orderData.timeInForce,
      assetType: orderData.assetType,
    };
    
    const result = await submitOrder(orderRequest);
    if (result) {
      // Order submitted successfully
      console.log('Order submitted:', result.orderId);
    }
  };
  
  return (
    // Component JSX with submitting state
    <button disabled={submitting}>
      {submitting ? 'Submitting...' : 'Submit Order'}
    </button>
  );
};
```

### PositionManager Component

```typescript
// Replace mock positions with real data
import { usePositions } from '@/hooks/useTradingAPI';

const PositionManager = () => {
  const { positions, loading, error, closePosition, closing } = usePositions();
  
  const handleClosePosition = async (symbol: string, quantity?: number) => {
    const success = await closePosition(symbol, quantity);
    if (success) {
      // Position closed successfully
    }
  };
  
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage error={error} />;
  
  return (
    <div>
      {positions.map(position => (
        <PositionRow 
          key={position.symbol}
          position={position}
          onClose={handleClosePosition}
          closing={closing === position.symbol}
        />
      ))}
    </div>
  );
};
```

### TradingDashboard Component

```typescript
// Integrate multiple data sources
import { usePortfolio, useMarketData, useRiskMetrics } from '@/hooks/useTradingAPI';

const TradingDashboard = () => {
  const { portfolio, loading: portfolioLoading } = usePortfolio();
  const { data: marketData } = useMultipleMarketData(['BTC-USDT', 'ETH-USDT']);
  const { riskMetrics } = useRiskMetrics();
  
  return (
    <div>
      <PortfolioSummary portfolio={portfolio} loading={portfolioLoading} />
      <MarketOverview data={marketData} />
      <RiskDashboard metrics={riskMetrics} />
    </div>
  );
};
```

### TradeHistory Component

```typescript
// Replace mock trade data
import { useTradeHistory } from '@/hooks/useTradingAPI';

const TradeHistory = ({ symbol, dateRange }: TradeHistoryProps) => {
  const { trades, loading, error } = useTradeHistory({
    symbol,
    startTime: dateRange.start,
    endTime: dateRange.end,
    limit: 100,
  });
  
  return (
    <TradeTable trades={trades} loading={loading} error={error} />
  );
};
```

## 📡 Real-time Data Integration

### WebSocket Setup

```typescript
// Real-time market data and order updates
import { useWebSocket } from '@/hooks/useTradingAPI';

const RealTimeDataProvider = ({ children }: { children: React.ReactNode }) => {
  const { connected, data, connect, disconnect } = useWebSocket();
  
  useEffect(() => {
    connect();
    return () => disconnect();
  }, []);
  
  useEffect(() => {
    if (data) {
      // Handle real-time updates
      switch (data.type) {
        case 'market_data':
          // Update market data in state/context
          break;
        case 'order_update':
          // Update order status
          break;
        case 'position_update':
          // Update position data
          break;
      }
    }
  }, [data]);
  
  return (
    <WebSocketContext.Provider value={{ connected, data }}>
      {children}
    </WebSocketContext.Provider>
  );
};
```

## 🛡️ Error Handling

### API Error Handling

```typescript
// Centralized error handling
const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [error, setError] = useState<string | null>(null);
  
  const handleError = useCallback((error: Error) => {
    console.error('Trading API Error:', error);
    setError(error.message);
    
    // Send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // Sentry.captureException(error);
    }
  }, []);
  
  if (error) {
    return <ErrorFallback error={error} onRetry={() => setError(null)} />;
  }
  
  return <>{children}</>;
};
```

### Network Error Handling

```typescript
// Retry logic for failed requests
const useRetryableAPI = <T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3
) => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const execute = useCallback(async () => {
    let retries = 0;
    setLoading(true);
    
    while (retries < maxRetries) {
      try {
        const result = await apiCall();
        setData(result);
        setError(null);
        break;
      } catch (err) {
        retries++;
        if (retries === maxRetries) {
          setError(err instanceof Error ? err.message : 'API call failed');
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    }
    
    setLoading(false);
  }, [apiCall, maxRetries]);
  
  return { data, loading, error, execute };
};
```

## 🧪 Testing API Integration

### Mock API for Development

```typescript
// Create mock API service for development
class MockTradingAPI {
  async submitOrder(orderRequest: OrderRequest): Promise<OrderResponse> {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      orderId: `mock_${Date.now()}`,
      clientOrderId: orderRequest.symbol,
      symbol: orderRequest.symbol,
      status: 'NEW',
      executedQty: 0,
      cummulativeQuoteQty: 0,
      avgPrice: 0,
      timestamp: Date.now(),
    };
  }
  
  // ... other mock methods
}

// Use mock in development
const api = process.env.NODE_ENV === 'development' 
  ? new MockTradingAPI() 
  : new TradingAPIService();
```

### Integration Tests

```typescript
// Test API integration
describe('Trading API Integration', () => {
  beforeEach(() => {
    // Setup test environment
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:3001/api';
  });
  
  it('should submit order successfully', async () => {
    const orderRequest: OrderRequest = {
      symbol: 'BTC-USDT',
      side: 'buy',
      type: 'market',
      quantity: 0.001,
      timeInForce: 'GTC',
      assetType: 'crypto',
    };
    
    const result = await tradingAPI.submitOrder(orderRequest);
    expect(result).toBeDefined();
    expect(result?.orderId).toBeTruthy();
  });
});
```

## 🚀 Production Deployment

### Environment Configuration

```bash
# Production environment variables
NEXT_PUBLIC_API_BASE_URL=https://api.nexustrade.ai/v1
NEXT_PUBLIC_WS_URL=wss://ws.nexustrade.ai/v1
NODE_ENV=production
```

### Performance Optimization

```typescript
// Implement caching for market data
const useMarketDataWithCache = (symbol: string) => {
  const cacheKey = `market_data_${symbol}`;
  const cachedData = localStorage.getItem(cacheKey);
  
  const { data, loading, error } = useMarketData(symbol);
  
  useEffect(() => {
    if (data) {
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now(),
      }));
    }
  }, [data, cacheKey]);
  
  // Return cached data if fresh (< 5 seconds old)
  if (cachedData && !loading) {
    const { data: cached, timestamp } = JSON.parse(cachedData);
    if (Date.now() - timestamp < 5000) {
      return { data: cached, loading: false, error: null };
    }
  }
  
  return { data, loading, error };
};
```

### Monitoring & Analytics

```typescript
// Add performance monitoring
const useAPIMetrics = () => {
  const trackAPICall = useCallback((endpoint: string, duration: number, success: boolean) => {
    // Send metrics to analytics service
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', 'api_call', {
        endpoint,
        duration,
        success,
      });
    }
  }, []);
  
  return { trackAPICall };
};
```

## 📝 Next Steps

1. **Set up your backend API** following the provided interfaces
2. **Replace mock data** in components with real API calls
3. **Implement WebSocket** for real-time updates
4. **Add comprehensive error handling** and retry logic
5. **Set up monitoring** and analytics
6. **Test thoroughly** in development environment
7. **Deploy to production** with proper environment configuration

## 🔗 Additional Resources

- [Trading API Documentation](./API_DOCUMENTATION.md)
- [WebSocket Protocol Guide](./WEBSOCKET_GUIDE.md)
- [Error Handling Best Practices](./ERROR_HANDLING.md)
- [Performance Optimization](./PERFORMANCE_GUIDE.md)
