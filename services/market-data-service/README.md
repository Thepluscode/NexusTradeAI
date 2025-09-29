# Market Data Service

A high-performance, real-time market data collection, processing, and distribution service designed for financial trading platforms. Supports multiple asset classes including cryptocurrencies, stocks, forex, and commodities.

## Features

### 🚀 **High Performance**
- Sub-millisecond data processing
- Concurrent connections to multiple exchanges
- Efficient data buffering and batching
- Optimized WebSocket connections
- Memory-efficient data structures

### 📊 **Multi-Asset Support**
- **Cryptocurrencies**: Binance, Coinbase, Kraken, Huobi
- **Stocks**: IEX, Alpaca, Polygon, Finnhub
- **Forex**: OANDA, FXCM, Dukascopy
- **Commodities**: ICE, CME, LME, Quandl

### 🔄 **Real-time Data Processing**
- Price analytics and technical indicators
- Volume analysis and anomaly detection
- Correlation analysis between instruments
- Order book analytics
- VWAP calculations

### 📡 **Multiple Distribution Channels**
- WebSocket streaming to clients
- Kafka message publishing
- Redis caching and pub/sub
- REST API for historical data

### 🛡️ **Enterprise Features**
- Automatic reconnection and failover
- Rate limiting and backpressure handling
- Comprehensive monitoring and metrics
- Health check endpoints
- Error tracking and alerting

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Data Sources  │    │  Market Data     │    │   Distributors  │
│                 │    │    Manager       │    │                 │
│ • Binance       │───▶│                  │───▶│ • WebSocket     │
│ • Coinbase      │    │ • Collectors     │    │ • Kafka         │
│ • IEX           │    │ • Processors     │    │ • Redis         │
│ • OANDA         │    │ • Buffering      │    │ • REST API      │
│ • CME           │    │ • Analytics      │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Tech Stack

- **Runtime**: Node.js 18+
- **WebSocket**: ws, socket.io
- **Message Queue**: Kafka (KafkaJS)
- **Cache**: Redis (ioredis)
- **Database**: MongoDB (Mongoose)
- **External APIs**: CCXT, Axios
- **Monitoring**: Prometheus, Winston
- **Process Management**: PM2 compatible

## Installation

### Prerequisites
- Node.js 18+
- MongoDB 4.4+
- Redis 6+
- Kafka 2.8+ (optional)

### Environment Variables

```env
# Server Configuration
PORT=3002
NODE_ENV=production
LOG_LEVEL=info

# Database
MONGODB_URI=mongodb://localhost:27017/market-data

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Kafka
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=market-data-service

# API Keys - Crypto
BINANCE_API_KEY=your_binance_api_key
BINANCE_SECRET=your_binance_secret
COINBASE_API_KEY=your_coinbase_api_key
COINBASE_SECRET=your_coinbase_secret

# API Keys - Stocks
IEX_API_KEY=your_iex_api_key
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret
POLYGON_API_KEY=your_polygon_api_key
FINNHUB_API_KEY=your_finnhub_api_key

# API Keys - Forex
OANDA_API_KEY=your_oanda_api_key
OANDA_ACCOUNT_ID=your_oanda_account_id
FXCM_API_KEY=your_fxcm_api_key
FXCM_USERNAME=your_fxcm_username
FXCM_PASSWORD=your_fxcm_password

# API Keys - Commodities
QUANDL_API_KEY=your_quandl_api_key
CME_API_KEY=your_cme_api_key

# Admin
ADMIN_TOKEN=your_admin_token
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# Performance Tuning
BUFFER_SIZE=1000
FLUSH_INTERVAL=100
MAX_SUBSCRIPTIONS_PER_CLIENT=100
```

### Quick Start

```bash
# Clone and install
git clone <repository-url>
cd market-data-service
npm install

# Start dependencies (Docker Compose)
docker-compose up -d mongodb redis kafka

# Start the service
npm start

# Or in development mode
npm run dev
```

### Docker Deployment

```bash
# Build image
docker build -t market-data-service .

# Run container
docker run -d \
  --name market-data-service \
  -p 3002:3002 \
  -e MONGODB_URI=mongodb://host.docker.internal:27017/market-data \
  -e REDIS_HOST=host.docker.internal \
  market-data-service
```

## API Documentation

### REST Endpoints

#### Market Data
- `GET /api/data/price/:exchange/:symbol` - Get latest price
- `GET /api/data/history/:exchange/:symbol` - Get price history
- `GET /api/data/orderbook/:exchange/:symbol` - Get order book
- `GET /api/data/summary/:exchange` - Get market summary
- `GET /api/data/anomalies` - Get market anomalies
- `GET /api/data/exchanges` - Get supported exchanges

#### Health & Monitoring
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system status
- `GET /metrics` - Prometheus metrics
- `GET /metrics/json` - Metrics in JSON format

#### Admin (Requires Authentication)
- `GET /api/admin/stats` - System statistics
- `GET /api/admin/status` - Service status
- `POST /api/admin/collectors/:type/restart` - Restart collector
- `POST /api/admin/flush-buffers` - Flush data buffers
- `GET /api/admin/subscriptions` - Get active subscriptions
- `POST /api/admin/subscriptions` - Manage subscriptions

### WebSocket API

#### Connection
```javascript
const socket = io('http://localhost:3002');
```

#### Subscription
```javascript
// Subscribe to market data
socket.emit('subscribe', {
  action: 'subscribe',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  dataTypes: ['tick', 'orderbook', 'trade']
});

// Listen for market data
socket.on('market_data', (data) => {
  console.log('Received:', data);
});

// Unsubscribe
socket.emit('unsubscribe', {
  action: 'unsubscribe',
  symbol: 'BTCUSDT',
  exchange: 'binance',
  dataTypes: ['tick']
});
```

## Data Types

### Market Data Structure
```javascript
{
  exchange: 'binance',
  symbol: 'BTCUSDT',
  dataType: 'tick',
  price: 45000.50,
  volume: 1.25,
  timestamp: 1640995200000,
  
  // Analytics
  priceAnalytics: {
    change: 250.50,
    changePercent: 0.56,
    volatility: 0.025,
    vwap: 44950.25
  },
  
  // Technical Indicators
  technicalIndicators: {
    sma20: 44800.00,
    sma50: 44200.00,
    rsi: 65.5,
    bollingerBands: {
      upper: 45500.00,
      middle: 44800.00,
      lower: 44100.00
    }
  },
  
  // Volume Analytics
  volumeAnalytics: {
    averageVolume: 1.85,
    volumeRatio: 0.68,
    volumeTrend: 'increasing',
    cumulativeVolume: 125.50
  }
}
```

### Order Book Structure
```javascript
{
  exchange: 'binance',
  symbol: 'BTCUSDT',
  dataType: 'orderbook',
  bids: [
    [45000.00, 1.25],
    [44999.50, 0.85]
  ],
  asks: [
    [45000.50, 0.95],
    [45001.00, 1.15]
  ],
  orderBookAnalytics: {
    spread: 0.50,
    spreadPercent: 0.0011,
    bidDepth: 15.75,
    askDepth: 18.25,
    imbalance: -0.074
  }
}
```

## Supported Instruments

### Cryptocurrencies
- **Major**: BTC, ETH, ADA, DOT, LINK, UNI
- **DeFi**: AAVE, COMP, MKR, SNX, YFI
- **Exchanges**: Binance, Coinbase, Kraken, Huobi

### Stocks
- **Tech**: AAPL, GOOGL, MSFT, TSLA, AMZN, META
- **Finance**: JPM, BAC, WFC, GS, MS
- **Exchanges**: NASDAQ, NYSE, LSE

### Forex
- **Major Pairs**: EUR/USD, GBP/USD, USD/JPY, AUD/USD
- **Minor Pairs**: EUR/GBP, EUR/JPY, GBP/JPY
- **Exotic Pairs**: USD/TRY, USD/ZAR, EUR/TRY

### Commodities
- **Energy**: WTI Crude, Brent Crude, Natural Gas
- **Metals**: Gold, Silver, Copper, Platinum
- **Agriculture**: Corn, Wheat, Soybeans, Sugar

## Performance Metrics

### Benchmarks
- **Latency**: < 1ms data processing time
- **Throughput**: > 10,000 messages/second
- **Connections**: > 1,000 concurrent WebSocket clients
- **Memory**: < 512MB typical usage
- **CPU**: < 25% on 4-core system

### Monitoring
- Prometheus metrics export
- Custom dashboards in Grafana
- Real-time alerting for anomalies
- Performance tracking and optimization

## Configuration

### Exchange Configuration
Configure exchanges in `src/config/exchanges.json`:

```json
{
  "crypto": {
    "binance": {
      "wsUrl": "wss://stream.binance.com:9443/ws",
      "rateLimit": 1200,
      "supports": ["spot", "futures"],
      "dataTypes": ["tick", "trade", "orderbook"]
    }
  }
}
```

### Instrument Configuration
Configure instruments in `src/config/instruments.json`.

## Development

### Running Tests
```bash
npm test
npm run test:watch
npm run test:coverage
```

### Performance Testing
```bash
npm run benchmark
artillery run benchmarks/load-test.yml
```

### Code Quality
```bash
npm run lint
npm run format
```

## Deployment

### Production Deployment
```bash
# Build for production
npm run build

# Start with PM2
pm2 start src/app.js --name market-data-service

# Or use Docker
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment
```bash
kubectl apply -f k8s/
```

### Scaling Considerations
- Use Redis Cluster for high availability
- Deploy Kafka with multiple brokers
- Use MongoDB replica sets
- Implement horizontal pod autoscaling
- Configure load balancing

## Troubleshooting

### Common Issues

**Connection Issues**
- Check API keys and credentials
- Verify network connectivity
- Review rate limiting settings

**Performance Issues**
- Monitor memory usage
- Check buffer sizes
- Adjust flush intervals
- Review connection pooling

**Data Quality Issues**
- Validate data schemas
- Check exchange status
- Monitor error rates
- Review data processing logic

### Debugging
```bash
# Enable debug logging
DEBUG=market-data:* npm start

# Check service health
curl http://localhost:3002/health/detailed

# Monitor metrics
curl http://localhost:3002/metrics
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Run the test suite
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review the troubleshooting guide

---

**Built for high-frequency trading platforms requiring institutional-grade market data infrastructure.**
```