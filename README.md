# Nexus Trade AI

[![License](https://img.shields.io/badge/License-Proprietary-blue.svg)](https://github.com/your-org/nexus-trade-ai)
[![Build Status](https://github.com/your-org/nexus-trade-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/your-org/nexus-trade-ai/actions)
[![Docker](https://img.shields.io/docker/pulls/your-org/nexus-trade-ai)](https://hub.docker.com/r/your-org/nexus-trade-ai)

An AI-Powered Cross-Market Trading & Risk Intelligence Platform that combines real-time market intelligence, automated trading, risk management, and regulatory compliance across all major financial markets.

## 🚀 Features

- **Unified Trading Interface**: Trade stocks, crypto, forex, and commodities from a single platform
- **AI-Powered Analytics**: Advanced machine learning models for market prediction and risk assessment
- **Institutional-Grade Tools**: Professional trading features previously only available to hedge funds
- **Real-Time Risk Management**: Comprehensive risk analysis and monitoring
- **Regulatory Compliance**: Built-in compliance with global financial regulations

## 🏗️ Project Structure

```
nexus-trade-ai/
├── services/                    # Core microservices
├── clients/                    # Frontend applications
├── ai-ml/                     # AI/ML pipeline and models
├── data-infrastructure/        # Data processing and storage
├── infrastructure/            # DevOps and deployment
├── shared/                    # Shared libraries and utilities
├── docs/                      # Documentation
└── tests/                     # Test suites
```

## 🛠️ Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- Node.js 18+
- Python 3.9+
- Kubernetes (for production deployment)

## 🚀 Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/nexus-trade-ai.git
   cd nexus-trade-ai
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the development environment**
   ```bash
   docker-compose up -d
   ```

4. **Access the applications**
   - Web UI: http://localhost:3000
   - API Documentation: http://localhost:3001/api-docs
   - Prometheus: http://localhost:9090
   - Grafana: http://localhost:3000 (admin/admin)

## 📦 Services

| Service | Port | Description |
|---------|------|-------------|
| Auth Service | 3001 | Authentication and user management |
| Market Data Service | 3002 | Real-time and historical market data |
| Trading Engine | 3003 | Order execution and trade management |
| Risk Management | 3004 | Real-time risk analysis |
| Web Application | 3000 | React-based frontend |
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Caching and pub/sub |
| Kafka | 9092 | Event streaming |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Monitoring dashboard |

## 🧪 Testing

Run the test suite:

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e
```

## 🏗️ Development

### Adding a new service

1. Create a new directory in `services/`
2. Initialize a new Node.js project
3. Follow the structure of existing services
4. Add the service to `docker-compose.yml`
5. Update the documentation

### Code Style

- JavaScript/TypeScript: ESLint + Prettier
- Python: Black + isort + flake8
- Git commit messages: Conventional Commits

## 📄 License

This project is proprietary and confidential. All rights reserved.

## 🤝 Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📫 Contact

- **Email**: contact@nexustrade.ai
- **Website**: https://nexustrade.ai
- **Twitter**: [@NexusTradeAI](https://twitter.com/NexusTradeAI)







📋 NEXUSTRADEAI SERVICES STATUS REPORT
🟢 CURRENTLY RUNNING SERVICES (6 Active)
Service	Port	Status	Terminal	Purpose
💹 Trading Server	3002	✅ Running	Terminal 1	Core trading engine with improved R:R ratios
🏛️ Institutional Performance API	3011	✅ Running	Terminal 2	Real-time performance data with dynamic calculations
📈 Market Data API	3001	✅ Running	Terminal 6	Live market data feeds (Alpaca, Alpha Vantage, Finnhub)
🔗 Broker API	3003	✅ Running	Terminal 7	Broker connectivity and order management
🏦 Banking Service	3012	✅ Running	Terminal 8	Banking integration with deposits/withdrawals
📊 Dashboard API	8080	✅ Running	Terminal 15	Main dashboard with enterprise integration
🎯 SERVICE DETAILS
💹 Trading Server (Port 3002)
File: services/trading/profitable-trading-server.js
Features:
Improved risk-reward ratios (2.67:1 to 3:1)
Advanced position sizing with Kelly Criterion
Real-time trading with 1,079 total trades
422 winning trades (39% win rate, now profitable)
Status: Active trading with $7.16M portfolio value
🏛️ Institutional Performance API (Port 3011)
File: services/trading/institutional-performance-api.js
Features:
Real-time performance calculations
Dynamic data integration from trading server
Institutional-grade metrics
Status: Healthy, serving real trading data
📈 Market Data API (Port 3001)
File: services/api/live-data-server.js
Features:
Multiple data providers (Alpaca, Alpha Vantage, Finnhub)
Real-time market data feeds
Symbol search and management
Status: All APIs connected and healthy
🔗 Broker API (Port 3003)
File: services/broker-api/ (npm start)
Features:
Broker connectivity
Order execution
Account management
Status: Connected and operational
🏦 Banking Service (Port 3012)
File: services/banking/banking-integration-service.js
Features:
Real money trading enabled
Deposits and withdrawals
Multi-currency support
Global banking integration
Status: All banking features enabled
📊 Dashboard API (Port 8080)
File: services/dashboard/dashboard-api-server.js
Features:
Main trading dashboard
Enterprise dashboard integration
Performance chart (recently fixed)
Multiple API endpoints
Status: Serving all dashboard interfaces
🌐 DASHBOARD ACCESS POINTS
Dashboard	URL	Purpose
Main Trading	http://localhost:8080/dashboard.html	Day-to-day trading operations
Enterprise	http://localhost:8080/enterprise	Institutional management features
Banking	http://localhost:3012/banking-dashboard.html	Financial operations
🔧 ADDITIONAL SERVICES (Available but not running)
Your project also contains these services that can be started if needed:

AI/ML Engine (ai-ml/ directory) - Python-based AI services
Strategy Engine (services/strategy-engine/) - Advanced trading strategies
Execution Engine (services/execution-engine/) - Order execution algorithms
Risk Management (services/risk-management/) - Risk analysis and monitoring
Compliance Service (services/compliance/) - Regulatory compliance
WebSocket Service (services/websocket/) - Real-time data streaming
Authentication Service (services/auth-service/) - User authentication
Notification Service (services/notification-service/) - Alerts and notifications
📊 CURRENT PERFORMANCE METRICS
Portfolio Value: $7,164,511
Total Trades: 1,079
Win Rate: 39% (now profitable with improved R:R)
Active Positions: Multiple strategies running
System Status: All core services operational# AITadingPlus
