# NexusTradeAI Bot Dashboard

Modern React + TypeScript trading dashboard for NexusTradeAI automated trading platform, now connected to **ALL backend services**.

## Features

### Connected Services (8 Total)

| Service | Port | Purpose |
|---------|------|---------|
| Trading Engine | 3002 | Trading operations, positions |
| Risk Manager | 3004 | Risk metrics, alerts |
| AI Service | 5001 | Predictions, health status |
| Market Data | 3001 | Real-time quotes |
| Dashboard API | 8080 | Strategies, automation, compliance |
| Unified Positions | 3005 | Real Alpaca positions |
| Broker API | 3003 | Broker connections |
| Banking Service | 3012 | Deposits, withdrawals |

### Dashboard Tabs

1. **Overview** - Performance metrics, positions, controls
2. **Services** - Real-time health status of all 8 services
3. **Strategies** - Trading strategy management and testing
4. **Banking** - Account balances, deposits, withdrawals
5. **Compliance** - GDPR, AML compliance status
6. **AI Assistant** - Interactive AI chat for trading insights

## Tech Stack

- React 18.2 + TypeScript 5.3
- Vite 5.0 (build tool)
- Material-UI 5.15
- React Query 3.39
- Zustand 4.4
- Recharts 2.10
- Axios 1.6

## Quick Start

```bash
# Install dependencies
cd clients/bot-dashboard
npm install

# Development mode
npm run dev

# Build for production
npm run build
```

Dashboard available at: http://localhost:3000

## Project Structure

```
src/
├── components/          # UI components
│   ├── ServiceStatus.tsx      # All services health
│   ├── StrategiesPanel.tsx    # Strategy management
│   ├── BankingPanel.tsx       # Banking operations
│   ├── CompliancePanel.tsx    # Compliance status
│   ├── AIChat.tsx             # AI assistant
│   ├── AutomationControl.tsx  # Start/stop controls
│   ├── MetricCard.tsx
│   ├── RiskAlerts.tsx
│   ├── PositionsTable.tsx
│   └── ControlPanel.tsx
├── hooks/              # React Query hooks
│   ├── useServices.ts         # Service health
│   ├── useStrategies.ts       # Strategy data
│   ├── useBanking.ts          # Banking operations
│   ├── useCompliance.ts       # Compliance status
│   ├── usePortfolio.ts        # Portfolio data
│   ├── useAutomation.ts       # Automation control
│   ├── useTradingEngine.ts
│   └── useRiskManager.ts
├── pages/
│   └── Dashboard.tsx   # Main dashboard with tabs
├── services/
│   └── api.ts          # Comprehensive API client
├── types/
│   └── index.ts        # TypeScript definitions
└── App.tsx
```

## Starting Backend Services

Before running the dashboard, start the backend services:

```bash
# From project root
./START_ALL_SERVICES.sh

# Or individually:
node services/trading/enhanced-trading-engine.js    # Port 3002
node services/risk-management-service/mock-risk-server.js  # Port 3004
node services/ai-service/lightweight-ai-server.js  # Port 5001
node services/dashboard/dashboard-api-server.js    # Port 8080
node services/trading/unified-positions-server.js  # Port 3005
```

## API Endpoints

### Trading Engine (3002)
- `GET /api/trading/status` - Engine status
- `POST /api/trading/start` - Start trading
- `POST /api/trading/stop` - Stop trading

### Dashboard API (8080)
- `GET /api/strategies` - All strategies
- `POST /api/strategies/:name/test` - Test strategy
- `GET /api/automation/status` - Automation status
- `POST /api/automation/start` - Start automation
- `GET /api/compliance/gdpr/status` - GDPR status
- `POST /api/ai/chat` - AI chat

### Banking (3012)
- `GET /api/banking/accounts` - Bank accounts
- `POST /api/banking/deposit` - Deposit funds
- `POST /api/banking/withdraw` - Withdraw funds

## License

MIT
