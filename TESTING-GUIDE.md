# Nexus Trade AI - Comprehensive Testing Guide

## 🧪 Testing Strategy Overview

This document outlines the comprehensive testing strategy for Nexus Trade AI, covering unit tests, integration tests, performance tests, and end-to-end testing scenarios.

## 📁 Test Structure

```
tests/
├── unit/                          # Unit tests for individual components
│   ├── services/                  # Service-specific unit tests
│   │   ├── nexus-alpha.test.js   # Nexus Alpha algorithm tests
│   │   └── risk-manager.test.js  # Risk management tests
│   ├── ai-ml/                    # AI/ML component tests
│   │   └── strategy-ensemble.test.js
│   └── shared/                   # Shared utility tests
│       └── technical-indicators.test.js
├── integration/                  # Integration tests
│   ├── api-tests/               # API endpoint tests
│   │   └── automation-api.test.js
│   ├── database-tests/          # Database integration tests
│   │   └── trading-data.test.js
│   └── messaging-tests/         # Message queue tests
│       └── signal-processing.test.js
├── performance/                 # Performance and load tests
├── e2e/                        # End-to-end tests
└── setup/                      # Test configuration and utilities
    ├── jest.setup.js          # Global test setup
    ├── unit.setup.js          # Unit test setup
    ├── integration.setup.js   # Integration test setup
    └── performance.setup.js   # Performance test setup
```

## 🚀 Quick Start

### Prerequisites

1. **Node.js 18+** installed
2. **PostgreSQL** running (for integration tests)
3. **Redis** running (for integration tests)
4. **Test databases** created

### Setup Test Environment

```bash
# Install dependencies
npm install

# Setup test databases
npm run setup:test

# Run all tests
npm test

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:performance
```

### Environment Variables

Create a `.env.test` file:

```bash
NODE_ENV=test
LOG_LEVEL=error

# Test Database
TEST_DATABASE_URL=postgresql://localhost:5432/nexus_trade_test

# Test Redis
TEST_REDIS_URL=redis://localhost:6379/15

# Test API Keys (use sandbox/test keys)
ALPACA_API_KEY=test_key
ALPACA_SECRET_KEY=test_secret
ALPACA_PAPER=true

BINANCE_API_KEY=test_key
BINANCE_SECRET_KEY=test_secret
BINANCE_TESTNET=true
```

## 📊 Test Categories

### 1. Unit Tests

**Purpose**: Test individual components in isolation

**Coverage Areas**:
- ✅ Nexus Alpha algorithm logic
- ✅ Technical indicators calculations
- ✅ Risk management functions
- ✅ Strategy ensemble components
- ✅ Utility functions

**Example Commands**:
```bash
# Run all unit tests
npm run test:unit

# Run specific test file
npm test tests/unit/services/nexus-alpha.test.js

# Run with coverage
npm run test:coverage
```

**Key Test Files**:
- `nexus-alpha.test.js` - Core algorithm testing
- `risk-manager.test.js` - Risk management validation
- `technical-indicators.test.js` - TA function accuracy
- `strategy-ensemble.test.js` - Multi-strategy testing

### 2. Integration Tests

**Purpose**: Test component interactions and external integrations

**Coverage Areas**:
- ✅ API endpoint functionality
- ✅ Database operations
- ✅ Message queue processing
- ✅ Broker integrations
- ✅ Real-time data flows

**Example Commands**:
```bash
# Run all integration tests
npm run test:integration

# Run API tests only
npm test tests/integration/api-tests/

# Run database tests only
npm test tests/integration/database-tests/
```

**Key Test Files**:
- `automation-api.test.js` - API endpoint testing
- `trading-data.test.js` - Database integration
- `signal-processing.test.js` - Message queue testing

### 3. Performance Tests

**Purpose**: Validate system performance under load

**Coverage Areas**:
- ⏱️ Signal processing latency
- 📈 Throughput benchmarks
- 💾 Memory usage patterns
- 🔄 Concurrent operation handling

**Example Commands**:
```bash
# Run performance tests
npm run test:performance

# Run with detailed profiling
npm run test:debug
```

## 🎯 Test Coverage Goals

### Coverage Targets

| Component | Target Coverage |
|-----------|----------------|
| **Strategy Engine** | 85%+ |
| **Risk Management** | 90%+ |
| **Technical Indicators** | 95%+ |
| **API Endpoints** | 80%+ |
| **Overall Project** | 80%+ |

### Coverage Reports

```bash
# Generate coverage report
npm run test:coverage

# View HTML coverage report
open coverage/lcov-report/index.html
```

## 🔧 Test Configuration

### Jest Configuration

The project uses Jest with custom configuration in `jest.config.js`:

- **Multiple test projects** (unit, integration, performance)
- **Custom matchers** for trading-specific validations
- **Coverage thresholds** enforced per component
- **Parallel execution** for faster test runs

### Custom Matchers

```javascript
// Custom matchers for trading data validation
expect(signal).toBeValidSignal();
expect(marketData).toBeValidMarketData();
expect(value).toBeWithinRange(min, max);
```

### Mock Utilities

Global test utilities available in all tests:

```javascript
// Generate mock data
const marketData = testUtils.generateMockMarketData(50, 100);
const signal = testUtils.generateMockSignal({ symbol: 'AAPL' });
const position = testUtils.generateMockPosition({ quantity: 100 });

// Mock services
const mockRedis = testUtils.createMockRedis();
const mockDB = testUtils.createMockDatabase();
```

## 📋 Test Scenarios

### Critical Path Testing

1. **Signal Generation Flow**
   - Market data ingestion
   - Technical analysis calculation
   - Strategy signal generation
   - Risk validation
   - Order execution

2. **Risk Management Flow**
   - Position sizing calculation
   - Stop loss determination
   - Portfolio risk assessment
   - Limit enforcement

3. **Performance Monitoring**
   - Real-time metrics calculation
   - Performance tracking
   - Alert generation

### Edge Case Testing

1. **Data Quality Issues**
   - Missing market data
   - Invalid price feeds
   - Network interruptions
   - Malformed signals

2. **Market Conditions**
   - High volatility periods
   - Low liquidity scenarios
   - Market gaps and halts
   - After-hours trading

3. **System Limits**
   - High-frequency signal generation
   - Large position sizes
   - Multiple concurrent operations
   - Memory and CPU constraints

## 🚨 Continuous Integration

### GitHub Actions Workflow

```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run setup:test
      - run: npm run test:ci
      - uses: codecov/codecov-action@v3
```

### Pre-commit Hooks

```bash
# Install pre-commit hooks
npm run prepare

# Hooks will run:
# - Linting (ESLint)
# - Formatting (Prettier)
# - Unit tests
# - Type checking
```

## 📈 Performance Benchmarks

### Target Performance Metrics

| Metric | Target | Test Command |
|--------|--------|--------------|
| **Signal Generation** | < 100ms | `npm run test:performance -- --grep "signal generation"` |
| **Order Execution** | < 500ms | `npm run test:performance -- --grep "order execution"` |
| **Risk Calculation** | < 50ms | `npm run test:performance -- --grep "risk calculation"` |
| **API Response** | < 200ms | `npm run test:integration -- --grep "API response time"` |

### Load Testing

```bash
# Test high-frequency signal processing
npm test tests/performance/signal-load.test.js

# Test concurrent API requests
npm test tests/performance/api-load.test.js

# Test database performance
npm test tests/performance/database-load.test.js
```

## 🐛 Debugging Tests

### Debug Mode

```bash
# Run tests in debug mode
npm run test:debug

# Debug specific test
npm run test:debug -- --testNamePattern="should calculate position size"

# Debug with breakpoints
node --inspect-brk node_modules/.bin/jest --runInBand tests/unit/services/nexus-alpha.test.js
```

### Logging

```bash
# Enable verbose logging
LOG_LEVEL=debug npm test

# Test-specific logging
DEBUG=nexus:* npm test
```

## 📝 Writing New Tests

### Test File Template

```javascript
/**
 * Test Description
 */

describe('ComponentName', () => {
  let component;
  let mockDependency;

  beforeEach(() => {
    // Setup
    mockDependency = testUtils.createMockDependency();
    component = new ComponentName(mockDependency);
  });

  afterEach(() => {
    // Cleanup
    jest.clearAllMocks();
  });

  describe('methodName', () => {
    test('should handle normal case', () => {
      // Arrange
      const input = testUtils.generateMockInput();
      
      // Act
      const result = component.methodName(input);
      
      // Assert
      expect(result).toBeValidResult();
      expect(mockDependency.method).toHaveBeenCalledWith(input);
    });

    test('should handle edge case', () => {
      // Test edge cases
    });

    test('should handle error case', () => {
      // Test error handling
    });
  });
});
```

### Best Practices

1. **Arrange-Act-Assert** pattern
2. **Descriptive test names** that explain the scenario
3. **Mock external dependencies** appropriately
4. **Test both success and failure paths**
5. **Use custom matchers** for domain-specific validations
6. **Keep tests independent** and idempotent
7. **Test edge cases** and boundary conditions

## 🔍 Test Monitoring

### Test Results Dashboard

- **Coverage reports** generated after each run
- **Performance trends** tracked over time
- **Flaky test detection** and reporting
- **Test execution time** monitoring

### Alerts

- **Coverage drops** below threshold
- **Performance regressions** detected
- **Test failures** in CI/CD pipeline
- **Long-running tests** identified

---

## 📞 Support

For testing-related questions:

1. **Check existing tests** for similar patterns
2. **Review test utilities** in `tests/setup/`
3. **Run tests locally** before pushing
4. **Check CI logs** for detailed error information

**Happy Testing! 🚀**
