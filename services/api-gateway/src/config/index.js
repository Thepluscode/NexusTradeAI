import dotenv from 'dotenv';

dotenv.config();

export default {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 8000,
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your_jwt_secret',
    accessExpiration: process.env.JWT_ACCESS_EXPIRATION || '15m',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  
  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://redis:6379',
    ttl: 60 * 60 * 24, // 24 hours
  },
  
  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 1000, // limit each IP to 1000 requests per windowMs
  },
  
  // Services
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    marketData: process.env.MARKET_DATA_SERVICE_URL || 'http://market-data-service:3002',
    trading: process.env.TRADING_ENGINE_URL || 'http://trading-engine:3003',
    risk: process.env.RISK_SERVICE_URL || 'http://risk-service:3004',
  },
  
  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN 
      ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) 
      : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  },
  
  // WebSocket
  ws: {
    path: '/ws',
    pingInterval: 30000, // 30 seconds
    clientTimeout: 300000, // 5 minutes
  },
};
