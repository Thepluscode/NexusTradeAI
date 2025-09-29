# NexusTradeAI Shared Library

A comprehensive shared library containing common utilities, types, and configurations for the NexusTradeAI trading platform.

## 📦 Installation

```bash
npm install @nexustrade/shared
```

## 🚀 Quick Start

```javascript
const { 
  MarketCalculations, 
  TechnicalIndicators, 
  JWTHandler,
  DatabaseConnectionPools,
  KafkaClient,
  MarketConstants 
} = require('@nexustrade/shared');

// Calculate position size
const positionSize = MarketCalculations.calculatePositionSize(
  100000, // account balance
  2,      // risk percentage
  150.50, // entry price
  147.00  // stop loss
);

// Calculate technical indicators
const prices = [100, 102, 101, 103, 105, 104, 106];
const sma = TechnicalIndicators.sma(prices, 5);
const rsi = TechnicalIndicators.rsi(prices, 14);

// JWT token management
const jwtHandler = new JWTHandler({
  secretKey: 'your-secret-key',
  refreshSecretKey: 'your-refresh-secret'
});

const tokenPair = await jwtHandler.generateTokenPair({
  userId: 'user123',
  tradingPermissions: ['EQUITY', 'OPTION']
});
```

## 📚 Library Structure

### 🔐 Authentication (`libs/authentication/`)
- **JWTHandler**: JWT token management with trading-specific features
- **OAuthClient**: OAuth 2.0 client implementation
- **SecurityUtils**: Security utilities and helpers

### 🗄️ Database (`libs/database/`)
- **ConnectionPools**: High-performance database connection management
- **QueryBuilders**: SQL query builders for trading data
- **Migrations**: Database migration utilities

### 📨 Messaging (`libs/messaging/`)
- **KafkaClient**: High-throughput message streaming
- **RedisClient**: Redis client with trading optimizations
- **WebSocketClient**: Real-time WebSocket connections

### 📊 Monitoring (`libs/monitoring/`)
- **MetricsCollector**: Trading metrics collection
- **ErrorTracker**: Error tracking and reporting
- **PerformanceMonitor**: Performance monitoring utilities

### 💹 Trading (`libs/trading/`)
- **MarketCalculations**: Financial calculations and risk metrics
- **TechnicalIndicators**: Technical analysis indicators
- **OrderTypes**: Order type definitions and utilities
- **RiskCalculations**: Risk management calculations

### 🛠️ Utilities (`libs/utils/`)
- **DateTime**: Date and time utilities for trading
- **Formatters**: Data formatting utilities
- **Validators**: Comprehensive validation functions
- **Encryption**: Encryption and security utilities

## 🔧 Configuration

### Database Configuration

```javascript
const { database } = require('@nexustrade/shared');

const dbPools = database.getConnectionPools({
  postgres: {
    host: 'localhost',
    port: 5432,
    database: 'nexustrade',
    user: 'postgres',
    password: 'password',
    max: 20
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: 'redis-password'
  }
});

await dbPools.initialize();
```

### Kafka Configuration

```javascript
const { KafkaClient } = require('@nexustrade/shared');

const kafka = new KafkaClient({
  clientId: 'nexustrade-app',
  brokers: ['localhost:9092'],
  groupId: 'trading-group'
});

await kafka.initialize();
await kafka.subscribe('market-data', (message) => {
  console.log('Received market data:', message.value);
});
```

## 📈 Trading Examples

### Position Size Calculation

```javascript
const { MarketCalculations } = require('@nexustrade/shared');

const position = MarketCalculations.calculatePositionSize(
  50000,  // Account balance: $50,000
  2,      // Risk: 2% of account
  100.50, // Entry price: $100.50
  98.00   // Stop loss: $98.00
);

console.log(`Position size: ${position.shares} shares`);
console.log(`Risk amount: $${position.riskAmount}`);
console.log(`Position value: $${position.positionValue}`);
```

### Technical Analysis

```javascript
const { TechnicalIndicators } = require('@nexustrade/shared');

const prices = [45.15, 46.26, 46.50, 46.23, 46.08, 46.03, 46.83, 47.69, 47.54, 47.70];

// Simple Moving Average
const sma5 = TechnicalIndicators.sma(prices, 5);

// Exponential Moving Average
const ema5 = TechnicalIndicators.ema(prices, 5);

// Relative Strength Index
const rsi = TechnicalIndicators.rsi(prices, 14);

// MACD
const macd = TechnicalIndicators.macd(prices, 12, 26, 9);

// Bollinger Bands
const bb = TechnicalIndicators.bollingerBands(prices, 20, 2);
```

### Risk Calculations

```javascript
const { MarketCalculations } = require('@nexustrade/shared');

// Calculate portfolio metrics
const positions = [
  { symbol: 'AAPL', entryPrice: 150, currentPrice: 155, quantity: 100, side: 'long' },
  { symbol: 'GOOGL', entryPrice: 2800, currentPrice: 2750, quantity: 10, side: 'long' }
];

const portfolio = MarketCalculations.calculatePortfolioMetrics(positions);
console.log(`Total P&L: $${portfolio.totalPnL}`);
console.log(`Total Return: ${portfolio.totalReturn}%`);

// Calculate Sharpe Ratio
const returns = [0.02, -0.01, 0.03, 0.01, -0.02, 0.04];
const sharpe = MarketCalculations.calculateSharpeRatio(returns, 0.02);
console.log(`Sharpe Ratio: ${sharpe.sharpeRatio}`);
```

## 🔍 Validation

```javascript
const { Validators } = require('@nexustrade/shared');

// Validate order data
const orderData = {
  symbol: 'AAPL',
  side: 'BUY',
  orderType: 'LIMIT',
  timeInForce: 'DAY',
  quantity: 100,
  limitPrice: 150.50
};

const validation = Validators.validateOrder(orderData);
if (!validation.valid) {
  console.error('Order validation errors:', validation.errors);
}

// Validate email
const isValidEmail = Validators.isValidEmail('user@example.com');

// Validate symbol
const isValidSymbol = Validators.isValidSymbol('AAPL');
```

## 📊 Constants

```javascript
const { constants } = require('@nexustrade/shared');

// Market constants
console.log(constants.Market.EXCHANGES.NYSE); // 'NYSE'
console.log(constants.Market.ORDER_TYPES.LIMIT); // 'LIMIT'
console.log(constants.Market.ASSET_CLASSES.EQUITY); // 'EQUITY'

// Trading limits
console.log(constants.Market.TRADING_LIMITS.PDT.MIN_EQUITY); // 25000
```

## 🏗️ TypeScript Support

The library includes comprehensive TypeScript definitions:

```typescript
import { 
  TradingAccount, 
  Order, 
  Position, 
  MarketData,
  OrderType,
  AssetClass 
} from '@nexustrade/shared/types/typescript/trading';

const account: TradingAccount = {
  id: 'acc123',
  userId: 'user456',
  accountType: 'MARGIN',
  balance: 50000,
  // ... other properties
};

const order: Order = {
  id: 'ord789',
  symbol: 'AAPL',
  side: 'BUY',
  orderType: 'LIMIT',
  // ... other properties
};
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 📝 Development

```bash
# Install dependencies
npm install

# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Build TypeScript
npm run build

# Generate documentation
npm run docs
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## 📄 License

This project is proprietary software owned by NexusTradeAI.

## 🆘 Support

For support and questions:
- Email: support@nexustrade.ai
- Documentation: https://docs.nexustrade.ai
- Issues: https://github.com/nexustrade-ai/shared/issues

---

**NexusTradeAI Shared Library** - Powering the future of algorithmic trading 🚀
