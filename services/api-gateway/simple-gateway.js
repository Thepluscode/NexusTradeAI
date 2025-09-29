#!/usr/bin/env node
/**
 * NexusTradeAI API Gateway - Simplified Version
 * Main entry point for all client requests
 */

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Service endpoints
const services = {
  'ai-ml': 'http://localhost:8001',
  'auth': 'http://localhost:3001',
  'trading': 'http://localhost:3002',
  'market-data': 'http://localhost:3003',
  'portfolio': 'http://localhost:3004',
  'risk-management': 'http://localhost:3005'
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: Object.keys(services)
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'NexusTradeAI API Gateway',
    version: '1.0.0',
    description: 'Central API Gateway for NexusTradeAI Platform',
    endpoints: {
      '/health': 'Health check',
      '/api/ai-ml/*': 'AI/ML predictions and signals',
      '/api/auth/*': 'Authentication and authorization',
      '/api/trading/*': 'Trading operations',
      '/api/market-data/*': 'Market data and quotes',
      '/api/portfolio/*': 'Portfolio management',
      '/api/risk/*': 'Risk management'
    },
    timestamp: new Date().toISOString()
  });
});

// Proxy routes to microservices
app.use('/api/ai-ml', createProxyMiddleware({
  target: services['ai-ml'],
  changeOrigin: true,
  pathRewrite: { '^/api/ai-ml': '' },
  onError: (err, req, res) => {
    res.status(503).json({ error: 'AI-ML service unavailable', message: err.message });
  }
}));

app.use('/api/auth', createProxyMiddleware({
  target: services['auth'],
  changeOrigin: true,
  pathRewrite: { '^/api/auth': '' },
  onError: (err, req, res) => {
    res.status(503).json({ error: 'Auth service unavailable', message: err.message });
  }
}));

app.use('/api/trading', createProxyMiddleware({
  target: services['trading'],
  changeOrigin: true,
  pathRewrite: { '^/api/trading': '' },
  onError: (err, req, res) => {
    res.status(503).json({ error: 'Trading service unavailable', message: err.message });
  }
}));

app.use('/api/market-data', createProxyMiddleware({
  target: services['market-data'],
  changeOrigin: true,
  pathRewrite: { '^/api/market-data': '' },
  onError: (err, req, res) => {
    res.status(503).json({ error: 'Market data service unavailable', message: err.message });
  }
}));

app.use('/api/portfolio', createProxyMiddleware({
  target: services['portfolio'],
  changeOrigin: true,
  pathRewrite: { '^/api/portfolio': '' },
  onError: (err, req, res) => {
    res.status(503).json({ error: 'Portfolio service unavailable', message: err.message });
  }
}));

app.use('/api/risk', createProxyMiddleware({
  target: services['risk-management'],
  changeOrigin: true,
  pathRewrite: { '^/api/risk': '' },
  onError: (err, req, res) => {
    res.status(503).json({ error: 'Risk management service unavailable', message: err.message });
  }
}));

// Direct AI-ML endpoints for testing
app.get('/predict/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const steps = req.query.steps || 1;
    
    // Mock prediction for demo
    const prediction = {
      symbol: symbol.toUpperCase(),
      predicted_price: (Math.random() * 200 + 100).toFixed(2),
      confidence: (Math.random() * 0.3 + 0.7).toFixed(3),
      steps_ahead: parseInt(steps),
      timestamp: new Date().toISOString()
    };
    
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ error: 'Prediction failed', message: error.message });
  }
});

app.get('/signal/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const signals = ['BUY', 'SELL', 'HOLD'];
    
    const signal = {
      symbol: symbol.toUpperCase(),
      signal: signals[Math.floor(Math.random() * signals.length)],
      strength: (Math.random() * 0.5 + 0.5).toFixed(3),
      timestamp: new Date().toISOString()
    };
    
    res.json(signal);
  } catch (error) {
    res.status(500).json({ error: 'Signal generation failed', message: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Gateway Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    available_endpoints: [
      '/health',
      '/api/ai-ml/*',
      '/api/auth/*',
      '/api/trading/*',
      '/api/market-data/*',
      '/api/portfolio/*',
      '/api/risk/*'
    ],
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 NexusTradeAI API Gateway running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 AI-ML Proxy: http://localhost:${PORT}/api/ai-ml/*`);
  console.log(`🔐 Auth Proxy: http://localhost:${PORT}/api/auth/*`);
  console.log(`📈 Trading Proxy: http://localhost:${PORT}/api/trading/*`);
  console.log(`💹 Market Data Proxy: http://localhost:${PORT}/api/market-data/*`);
  console.log(`💼 Portfolio Proxy: http://localhost:${PORT}/api/portfolio/*`);
  console.log(`⚖️ Risk Management Proxy: http://localhost:${PORT}/api/risk/*`);
  console.log(`\n✅ Gateway ready to route requests to microservices!`);
});

module.exports = app;
