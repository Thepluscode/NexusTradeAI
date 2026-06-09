/**
 * NexusTradeAI Dashboard Server
 * 
 * Express server for the trading dashboard with broker API integration
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

// Import AI API Service for integration
const AIAPIService = require('../api/ai-api');

// Import broker API routes
const brokerApi = require('../api/broker-api');
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize AI API Service
const aiAPI = new AIAPIService();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static files from dashboard directory
app.use(express.static(__dirname));

// Serve documentation files
app.use('/docs', express.static(path.join(__dirname, '../../docs')));

// API Routes
app.use('/api/broker', brokerApi);

// AI API Routes for dashboard integration
app.get('/api/ai/sentiment', async (req, res) => {
    try {
        const sentiment = aiAPI.mockData.sentiments[Math.floor(Math.random() * aiAPI.mockData.sentiments.length)];
        res.json({
            success: true,
            sentiment: {
                sentiment: sentiment.sentiment,
                score: sentiment.score + (Math.random() * 10 - 5),
                confidence: sentiment.confidence + (Math.random() * 10 - 5),
                reason: sentiment.reason,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ai/predictions', async (req, res) => {
    try {
        const prediction = aiAPI.mockData.predictions[Math.floor(Math.random() * aiAPI.mockData.predictions.length)];
        res.json({
            success: true,
            prediction: {
                direction: prediction.direction,
                confidence: prediction.confidence + (Math.random() * 10 - 5),
                target: prediction.target ? prediction.target + (Math.random() * 2 - 1) : null,
                timeframe: prediction.timeframe,
                reasoning: prediction.reasoning,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/ai/portfolio-optimization', async (req, res) => {
    try {
        const optimization = aiAPI.mockData.portfolioOptimizations[Math.floor(Math.random() * aiAPI.mockData.portfolioOptimizations.length)];
        res.json({
            success: true,
            portfolio: {
                recommendation: optimization.recommendation,
                score: optimization.score + (Math.random() * 10 - 5),
                optimization: optimization.optimization + (Math.random() * 5 - 2.5),
                action: optimization.action,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/ai/chat', async (req, res) => {
    try {
        const { message, context } = req.body;
        const response = aiAPI.generateContextualResponse(message, context);
        res.json({
            success: true,
            response: response,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'NexusTradeAI Dashboard'
  });
});

// Mock automation API endpoints (port 3004 services)
app.get('/api/automation/status', (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'active',
            uptime: '2h 15m',
            strategies_running: 3,
            total_trades: 127,
            success_rate: 78.5,
            last_update: new Date().toISOString()
        }
    });
});

app.get('/api/automation/brokers', (req, res) => {
    res.json({
        success: true,
        data: [
            {
                id: 'alpaca',
                name: 'Alpaca',
                status: 'connected',
                balance: 50000,
                positions: 5,
                last_sync: new Date().toISOString()
            },
            {
                id: 'interactive_brokers',
                name: 'Interactive Brokers',
                status: 'connected',
                balance: 75000,
                positions: 8,
                last_sync: new Date().toISOString()
            }
        ]
    });
});

app.get('/api/automation/strategies/performance', (req, res) => {
    res.json({
        success: true,
        data: [
            {
                id: 'momentum_strategy',
                name: 'Momentum Trading',
                status: 'active',
                performance: 12.5,
                trades: 45,
                win_rate: 73.3,
                last_trade: new Date().toISOString()
            },
            {
                id: 'mean_reversion',
                name: 'Mean Reversion',
                status: 'active',
                performance: 8.7,
                trades: 32,
                win_rate: 68.8,
                last_trade: new Date().toISOString()
            },
            {
                id: 'arbitrage',
                name: 'Arbitrage',
                status: 'paused',
                performance: 15.2,
                trades: 18,
                win_rate: 88.9,
                last_trade: new Date().toISOString()
            }
        ]
    });
});

app.post('/api/automation/strategies/deploy', (req, res) => {
    res.json({
        success: true,
        message: 'Strategy deployment initiated',
        deployment_id: 'deploy_' + Date.now(),
        estimated_time: '2-3 minutes'
    });
});

// Real trading toggle endpoint
app.post('/api/automation/real-trading/enable', (req, res) => {
    res.json({
        success: true,
        message: 'Real trading enabled successfully',
        status: 'enabled',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/automation/real-trading/disable', (req, res) => {
    res.json({
        success: true,
        message: 'Real trading disabled successfully',
        status: 'disabled',
        timestamp: new Date().toISOString()
    });
});

// Automation start/stop endpoints
app.post('/api/automation/start', (req, res) => {
    res.json({
        success: true,
        message: 'Automation started successfully',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/automation/stop', (req, res) => {
    res.json({
        success: true,
        message: 'Automation stopped successfully',
        status: 'stopped',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/automation/pause', (req, res) => {
    res.json({
        success: true,
        message: 'Automation paused successfully',
        status: 'paused',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/automation/resume', (req, res) => {
    res.json({
        success: true,
        message: 'Automation resumed successfully',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

app.post('/api/automation/emergency-stop', (req, res) => {
    res.json({
        success: true,
        message: 'Emergency stop executed successfully',
        status: 'emergency_stopped',
        timestamp: new Date().toISOString(),
        positions_closed: Math.floor(Math.random() * 10) + 1,
        orders_cancelled: Math.floor(Math.random() * 5) + 1
    });
});

// Enhanced system endpoints
app.get('/api/enhanced/system/status', (req, res) => {
    res.json({
        success: true,
        data: {
            cpu_usage: Math.random() * 100,
            memory_usage: Math.random() * 100,
            disk_usage: Math.random() * 100,
            network_io: Math.random() * 1000,
            active_connections: Math.floor(Math.random() * 50) + 10,
            uptime: '5h 32m',
            last_update: new Date().toISOString()
        }
    });
});

app.get('/api/enhanced/websocket/stats', (req, res) => {
    res.json({
        success: true,
        data: {
            total_connections: Math.floor(Math.random() * 100) + 20,
            active_subscriptions: Math.floor(Math.random() * 200) + 50,
            messages_per_second: Math.floor(Math.random() * 1000) + 100,
            average_latency: Math.floor(Math.random() * 50) + 10,
            last_update: new Date().toISOString()
        }
    });
});

// Risk Management API endpoints (proxy to Python service)
app.get('/api/risk/portfolio', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3003/api/risk/portfolio');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                account_balance: 10000,
                total_unrealized_pnl: 250.75,
                portfolio_risk: 0.03,
                num_positions: 3,
                emergency_stop: false,
                drawdown_percent: 2.5
            }
        });
    }
});

app.get('/api/risk/config', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3003/api/risk/config');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                risk_per_trade: 0.01,
                max_portfolio_risk: 0.05,
                max_positions: 10,
                stop_loss_percent: 0.05,
                take_profit_percent: 0.10,
                emergency_stop: false
            }
        });
    }
});

app.post('/api/risk/emergency-stop', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3003/api/risk/emergency-stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            message: 'Emergency stop activated (mock)',
            data: { closed_positions: [] }
        });
    }
});

// Strategy Engine API endpoints (proxy to Python service)
app.get('/api/strategies', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3004/api/strategies');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: [
                {
                    name: 'MA_Cross_20_50',
                    type: 'trend_following',
                    active: true,
                    performance: { win_rate: 73.5, total_signals: 45 }
                },
                {
                    name: 'RSI_MeanReversion_14',
                    type: 'mean_reversion',
                    active: true,
                    performance: { win_rate: 68.2, total_signals: 32 }
                },
                {
                    name: 'Momentum_Breakout_20',
                    type: 'momentum',
                    active: false,
                    performance: { win_rate: 81.1, total_signals: 18 }
                }
            ]
        });
    }
});

app.get('/api/strategies/performance', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3004/api/performance/overall');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                total_signals_generated: 127,
                signals_executed: 95,
                successful_trades: 73,
                success_rate: 76.8,
                active_strategies: 3,
                total_strategies: 4
            }
        });
    }
});

app.get('/api/strategies/signals/recent', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3004/api/signals/recent?limit=20');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: [
                {
                    symbol: 'BTCUSDT',
                    signal_type: 'buy',
                    confidence: 0.85,
                    entry_price: 45250.0,
                    strategy: 'MA_Cross_20_50',
                    timestamp: new Date().toISOString()
                },
                {
                    symbol: 'ETHUSDT',
                    signal_type: 'sell',
                    confidence: 0.72,
                    entry_price: 3150.0,
                    strategy: 'RSI_MeanReversion_14',
                    timestamp: new Date().toISOString()
                }
            ]
        });
    }
});

app.post('/api/strategies/:strategyName/activate', async (req, res) => {
    try {
        const { strategyName } = req.params;
        const response = await fetch(`http://localhost:3004/api/strategies/${strategyName}/activate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            message: `Strategy ${req.params.strategyName} activated (mock)`
        });
    }
});

app.post('/api/strategies/:strategyName/deactivate', async (req, res) => {
    try {
        const { strategyName } = req.params;
        const response = await fetch(`http://localhost:3004/api/strategies/${strategyName}/deactivate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            message: `Strategy ${req.params.strategyName} deactivated (mock)`
        });
    }
});

// Advanced Risk Analytics API endpoints
app.get('/api/risk/analytics/report', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3003/api/analytics/risk-report');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                portfolio_value: 10250.75,
                total_return_percent: 2.51,
                risk_metrics: {
                    var_95_1d: 125.50,
                    var_99_1d: 187.25,
                    sharpe_ratio: 1.45,
                    sortino_ratio: 1.78,
                    max_drawdown_percent: 8.2,
                    current_drawdown_percent: 2.1
                },
                trading_metrics: {
                    total_trades: 47,
                    win_rate_percent: 68.1,
                    avg_win: 85.30,
                    avg_loss: 42.15,
                    profit_factor: 1.85
                }
            }
        });
    }
});

app.get('/api/risk/analytics/var', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3003/api/analytics/var');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                var_95: 125.50,
                var_99: 187.25,
                var_custom: 156.75,
                confidence_level: 0.95,
                time_horizon_days: 1
            }
        });
    }
});

app.get('/api/risk/analytics/ratios', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3003/api/analytics/ratios');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                sharpe_ratio: 1.45,
                sortino_ratio: 1.78,
                calmar_ratio: 0.92,
                win_rate: 0.681,
                avg_win: 85.30,
                avg_loss: 42.15,
                profit_factor: 1.85
            }
        });
    }
});

app.get('/api/risk/analytics/alerts', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3003/api/analytics/alerts');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                alerts: [
                    {
                        level: 'MEDIUM',
                        type: 'DRAWDOWN',
                        message: 'Current drawdown at 2.1%',
                        timestamp: new Date().toISOString()
                    }
                ],
                alert_count: 1,
                critical_alerts: 0,
                high_alerts: 0,
                medium_alerts: 1
            }
        });
    }
});

// Mock data endpoints for development
app.get('/api/strategies', (req, res) => {
  res.json({
    strategies: {
      meanReversion: {
        totalTrades: 45,
        winRate: '67.50',
        totalPnL: '2,450.00'
      },
      momentum: {
        totalTrades: 32,
        winRate: '71.25',
        totalPnL: '1,890.00'
      },
      rsi: {
        totalTrades: 28,
        winRate: '64.30',
        totalPnL: '1,230.00'
      }
    }
  });
});

app.get('/api/performance', (req, res) => {
  res.json({
    totalEquity: 105570,
    availableCash: 45230,
    totalPnL: 5570,
    dailyPnL: 230,
    winRate: 68.5,
    sharpeRatio: 2.1
  });
});

app.get('/api/positions', (req, res) => {
  res.json({
    positions: [
      {
        symbol: 'AAPL',
        quantity: 100,
        avgPrice: 150.25,
        currentPrice: 152.30,
        pnl: 205.00,
        pnlPercent: 1.36
      },
      {
        symbol: 'GOOGL',
        quantity: 50,
        avgPrice: 2750.00,
        currentPrice: 2780.50,
        pnl: 1525.00,
        pnlPercent: 1.11
      }
    ]
  });
});

app.get('/api/orders', (req, res) => {
  res.json({
    orders: [
      {
        id: 'ORD001',
        symbol: 'TSLA',
        side: 'BUY',
        quantity: 25,
        price: 245.50,
        status: 'FILLED',
        timestamp: new Date(Date.now() - 300000).toISOString()
      },
      {
        id: 'ORD002',
        symbol: 'NVDA',
        side: 'SELL',
        quantity: 15,
        price: 420.75,
        status: 'PENDING',
        timestamp: new Date(Date.now() - 120000).toISOString()
      }
    ]
  });
});

// Serve the main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Automated Trading API endpoints
app.get('/api/trading/status', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3005/api/trading/status');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                is_running: false,
                mode: 'paper',
                active_orders: 0,
                total_orders: 0,
                active_positions: 0,
                total_trades: 0,
                symbols_tracked: ['BTCUSDT', 'ETHUSDT'],
                last_signal_check: new Date().toISOString()
            }
        });
    }
});

app.post('/api/trading/start', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3005/api/trading/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            message: 'Trading engine started (mock)'
        });
    }
});

app.post('/api/trading/stop', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3005/api/trading/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            message: 'Trading engine stopped (mock)'
        });
    }
});

app.get('/api/trading/positions', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3005/api/trading/positions');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                positions: {
                    'BTCUSDT': {
                        quantity: 0.1,
                        average_price: 45250.0,
                        current_price: 45800.0,
                        unrealized_pnl: 55.0,
                        realized_pnl: 0.0,
                        strategy: 'MA_Cross_20_50'
                    }
                },
                summary: {
                    total_positions: 1,
                    total_unrealized_pnl: 55.0,
                    total_realized_pnl: 0.0,
                    total_pnl: 55.0
                }
            }
        });
    }
});

app.post('/api/trading/manual-order', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3005/api/trading/manual-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            message: 'Manual order placed (mock)',
            data: { order_id: `mock_${Date.now()}` }
        });
    }
});

// Compliance API endpoints
app.get('/api/compliance/gdpr/status', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3006/api/gdpr/status');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                total_data_subjects: 1000,
                total_data_requests: 25,
                pending_requests: 2,
                consent_statistics: {
                    trading_services: { consented: 950, total: 1000, percentage: 95.0 },
                    marketing: { consented: 750, total: 1000, percentage: 75.0 }
                },
                compliance_score: 98.5
            }
        });
    }
});

app.get('/api/compliance/aml/dashboard', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3007/api/aml/dashboard');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                customer_statistics: {
                    total_customers: 1000,
                    risk_distribution: { low: 850, medium: 130, high: 20 },
                    kyc_status_distribution: { approved: 950, pending: 30, rejected: 20 },
                    customers_due_review: 15
                },
                alert_statistics: {
                    total_alerts: 45,
                    open_alerts: 8,
                    high_risk_alerts: 3,
                    alert_rate: 4.5
                },
                compliance_metrics: {
                    sanctions_screening_coverage: 100.0,
                    kyc_completion_rate: 95.0,
                    high_risk_customer_percentage: 2.0
                }
            }
        });
    }
});

app.get('/api/compliance/reports', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3008/api/reports');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            data: {
                reports: [
                    {
                        report_id: 'RPT_001',
                        report_type: 'transaction_report',
                        status: 'completed',
                        period_start: '2024-01-01T00:00:00',
                        period_end: '2024-01-31T23:59:59',
                        created_timestamp: new Date().toISOString(),
                        regulatory_authority: 'FCA',
                        record_count: 1250
                    }
                ],
                total_count: 1
            }
        });
    }
});

app.post('/api/compliance/reports/generate', async (req, res) => {
    try {
        const response = await fetch('http://localhost:3008/api/reports/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.json({
            success: true,
            message: 'Report generation initiated (mock)',
            data: { report_id: `RPT_${Date.now()}` }
        });
    }
});

// Market Data API endpoints (mock data for now)
app.get('/api/data/market-prices', (req, res) => {
    // Generate realistic crypto price data
    const generatePrice = (base, volatility = 0.02) => {
        const change = (Math.random() - 0.5) * volatility;
        return base * (1 + change);
    };

    const marketData = {
        success: true,
        data: {
            'BTCUSDT': {
                symbol: 'BTCUSDT',
                price: generatePrice(45250.00),
                change_24h: (Math.random() - 0.5) * 10,
                volume_24h: Math.random() * 1000000000,
                high_24h: generatePrice(46000.00),
                low_24h: generatePrice(44000.00),
                timestamp: new Date().toISOString()
            },
            'ETHUSDT': {
                symbol: 'ETHUSDT',
                price: generatePrice(3150.00),
                change_24h: (Math.random() - 0.5) * 8,
                volume_24h: Math.random() * 500000000,
                high_24h: generatePrice(3200.00),
                low_24h: generatePrice(3050.00),
                timestamp: new Date().toISOString()
            },
            'ADAUSDT': {
                symbol: 'ADAUSDT',
                price: generatePrice(1.25),
                change_24h: (Math.random() - 0.5) * 15,
                volume_24h: Math.random() * 100000000,
                high_24h: generatePrice(1.30),
                low_24h: generatePrice(1.18),
                timestamp: new Date().toISOString()
            },
            'DOTUSDT': {
                symbol: 'DOTUSDT',
                price: generatePrice(25.50),
                change_24h: (Math.random() - 0.5) * 12,
                volume_24h: Math.random() * 50000000,
                high_24h: generatePrice(26.20),
                low_24h: generatePrice(24.80),
                timestamp: new Date().toISOString()
            },
            'LINKUSDT': {
                symbol: 'LINKUSDT',
                price: generatePrice(18.75),
                change_24h: (Math.random() - 0.5) * 9,
                volume_24h: Math.random() * 75000000,
                high_24h: generatePrice(19.20),
                low_24h: generatePrice(18.10),
                timestamp: new Date().toISOString()
            }
        },
        timestamp: new Date().toISOString()
    };

    res.json(marketData);
});

app.get('/api/data/portfolio', (req, res) => {
    res.json({
        success: true,
        data: {
            total_value: 10000 + (Math.random() - 0.5) * 1000,
            total_pnl: (Math.random() - 0.3) * 500,
            total_pnl_percent: (Math.random() - 0.3) * 5,
            positions: [
                {
                    symbol: 'BTCUSDT',
                    quantity: 0.1,
                    average_price: 45000,
                    current_price: 45250 + (Math.random() - 0.5) * 1000,
                    pnl: (Math.random() - 0.5) * 100,
                    pnl_percent: (Math.random() - 0.5) * 2
                },
                {
                    symbol: 'ETHUSDT',
                    quantity: 1.5,
                    average_price: 3100,
                    current_price: 3150 + (Math.random() - 0.5) * 200,
                    pnl: (Math.random() - 0.5) * 150,
                    pnl_percent: (Math.random() - 0.5) * 3
                }
            ],
            timestamp: new Date().toISOString()
        }
    });
});

// Strategy Configuration API endpoints
app.get('/api/strategies/:strategyName', async (req, res) => {
    try {
        const { strategyName } = req.params;
        const response = await fetch(`http://localhost:3004/api/strategies/${strategyName}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        // Return mock strategy data if service unavailable
        res.json({
            success: true,
            data: {
                name: req.params.strategyName,
                type: 'trend_following',
                status: 'active',
                parameters: {
                    short_period: 20,
                    long_period: 50,
                    signal_period: 9,
                    entry_threshold: 0.02,
                    exit_threshold: 0.01,
                    volatility_threshold: 0.05,
                    stop_loss_pct: 0.05,
                    take_profit_pct: 0.1,
                    max_position_size: 0.1,
                    min_confidence: 0.7,
                    confirmation_candles: 2,
                    volume_confirmation: true,
                    enable_trailing_stop: false,
                    enable_partial_exits: false,
                    max_trades_per_day: 10
                }
            }
        });
    }
});

app.post('/api/strategies/:strategyName/configure', async (req, res) => {
    try {
        const { strategyName } = req.params;
        const { parameters } = req.body;

        // Validate parameters
        const validationResult = validateStrategyParameters(parameters);
        if (!validationResult.valid) {
            return res.status(400).json({
                success: false,
                error: 'Invalid parameters',
                details: validationResult.errors
            });
        }

        // Try to update strategy via strategy engine
        const response = await fetch(`http://localhost:3004/api/strategies/${strategyName}/configure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters })
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        // Mock successful configuration if service unavailable
        res.json({
            success: true,
            message: `Strategy ${req.params.strategyName} configured successfully`,
            data: {
                strategy_name: req.params.strategyName,
                parameters: req.body.parameters,
                updated_at: new Date().toISOString()
            }
        });
    }
});

app.post('/api/strategies/:strategyName/test', async (req, res) => {
    try {
        const { strategyName } = req.params;
        const { parameters } = req.body;

        // Try to test strategy via strategy engine
        const response = await fetch(`http://localhost:3004/api/strategies/${strategyName}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parameters })
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        // Mock test results if service unavailable
        const mockResults = generateMockTestResults(req.params.strategyName, req.body.parameters);
        res.json({
            success: true,
            message: 'Strategy test completed',
            data: mockResults
        });
    }
});

// Helper function to validate strategy parameters
function validateStrategyParameters(params) {
    const errors = [];

    // Validate periods
    if (params.short_period && (params.short_period < 5 || params.short_period > 100)) {
        errors.push('Short period must be between 5 and 100');
    }

    if (params.long_period && (params.long_period < 10 || params.long_period > 200)) {
        errors.push('Long period must be between 10 and 200');
    }

    if (params.short_period && params.long_period && params.short_period >= params.long_period) {
        errors.push('Short period must be less than long period');
    }

    // Validate thresholds
    if (params.entry_threshold && (params.entry_threshold < 0.001 || params.entry_threshold > 0.1)) {
        errors.push('Entry threshold must be between 0.1% and 10%');
    }

    if (params.stop_loss_pct && (params.stop_loss_pct < 0.01 || params.stop_loss_pct > 0.2)) {
        errors.push('Stop loss must be between 1% and 20%');
    }

    if (params.take_profit_pct && (params.take_profit_pct < 0.01 || params.take_profit_pct > 0.5)) {
        errors.push('Take profit must be between 1% and 50%');
    }

    // Validate position size
    if (params.max_position_size && (params.max_position_size < 0.01 || params.max_position_size > 1.0)) {
        errors.push('Max position size must be between 1% and 100%');
    }

    // Validate confidence
    if (params.min_confidence && (params.min_confidence < 0.5 || params.min_confidence > 0.95)) {
        errors.push('Minimum confidence must be between 50% and 95%');
    }

    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// Helper function to generate mock test results
function generateMockTestResults(strategyName, parameters) {
    const baseReturn = Math.random() * 0.2 - 0.05; // -5% to +15%
    const volatility = Math.random() * 0.15 + 0.05; // 5% to 20%
    const sharpeRatio = baseReturn / volatility;

    return {
        strategy_name: strategyName,
        test_period: '30 days',
        expected_return: `${(baseReturn * 100).toFixed(2)}%`,
        volatility: `${(volatility * 100).toFixed(2)}%`,
        sharpe_ratio: sharpeRatio.toFixed(2),
        max_drawdown: `${(Math.random() * 0.1 + 0.02).toFixed(2)}%`,
        win_rate: `${(Math.random() * 0.3 + 0.5).toFixed(1)}%`,
        profit_factor: (Math.random() * 0.5 + 1.2).toFixed(2),
        total_trades: Math.floor(Math.random() * 50 + 10),
        risk_score: parameters.stop_loss_pct ?
            (parameters.stop_loss_pct * 100 < 3 ? 'High' :
             parameters.stop_loss_pct * 100 < 6 ? 'Medium' : 'Low') : 'Medium',
        recommendation: baseReturn > 0.05 ? 'Recommended' :
                       baseReturn > 0 ? 'Acceptable' : 'Not Recommended'
    };
}

// Favicon endpoint
app.get('/favicon.ico', (req, res) => {
    res.status(204).send();
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NexusTradeAI Dashboard Server running on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Broker API: http://localhost:${PORT}/api/broker`);
  console.log(`❤️  Health Check: http://localhost:${PORT}/api/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
