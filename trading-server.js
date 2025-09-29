#!/usr/bin/env node
/**
 * NexusTradeAI Trading Interface Server
 * Serves the trading interface with proper CORS headers
 */

const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3003;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.static(__dirname));
app.use(express.json());

// Serve the complete demo as default
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'complete-demo.html'));
});

// Serve the authentication page
app.get('/auth', (req, res) => {
  res.sendFile(path.join(__dirname, 'simple-auth.html'));
});

// Serve login page (for compatibility)
app.get('/auth/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'simple-auth.html'));
});

// Serve the trading interface
app.get('/trading', (req, res) => {
  res.sendFile(path.join(__dirname, 'trading-demo.html'));
});

// Serve the demo page explicitly
app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'complete-demo.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'trading-interface-server',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Proxy endpoints to trading service (to avoid CORS issues)
app.get('/api/account', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:3002/account');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/positions', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:3002/positions');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/orders', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:3002/orders');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/market-prices', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:3002/market-prices');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('http://localhost:3002/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/orders/:orderId', async (req, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`http://localhost:3002/orders/${req.params.orderId}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    
    if (response.ok) {
      res.json(data);
    } else {
      res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 NexusTradeAI Trading Interface Server running on port ${PORT}`);
  console.log(`🚀 Trading Interface: http://localhost:${PORT}`);
  console.log(`📊 Health Check: http://localhost:${PORT}/health`);
  console.log(`\n✅ Ready to trade! Open http://localhost:${PORT} in your browser`);
});

module.exports = app;
