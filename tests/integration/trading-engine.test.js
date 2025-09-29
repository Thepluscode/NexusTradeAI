const request = require('supertest');
const { Pool } = require('pg');
const Redis = require('ioredis');
const { Kafka } = require('kafkajs');

describe('Trading Engine Integration Tests', () => {
  let app;
  let db;
  let redis;
  let kafka;
  
  beforeAll(async () => {
    // Setup test environment
    process.env.NODE_ENV = 'test';
    
    // Initialize database connection
    db = new Pool({
      connectionString: process.env.TEST_POSTGRESQL_URI || 'postgresql://test_user:test_password@localhost:5432/test_db'
    });
    
    // Initialize Redis
    redis = new Redis(process.env.TEST_REDIS_URL || 'redis://localhost:6379');
    
    // Initialize Kafka
    kafka = new Kafka({
      clientId: 'trading-engine-test',
      brokers: ['localhost:9092']
    });
    
    // Import the app after environment setup
    app = require('../../services/trading-engine/src/app');
    
    // Clean up test data
    await db.query('DELETE FROM trading.orders WHERE id LIKE \'test-%%\'');
    await db.query('DELETE FROM trading.trades WHERE id LIKE \'test-%%\'');
    await db.query('DELETE FROM trading.positions WHERE user_id LIKE \'test-%%\'');
    
    // Create test user account
    await db.query(`
      INSERT INTO trading.accounts (user_id, balance, available_balance) 
      VALUES ('test-user-1', 10000, 10000)
      ON CONFLICT (user_id) DO UPDATE SET 
        balance = 10000, available_balance = 10000
    `);
  });
  
  afterAll(async () => {
    // Cleanup
    await db.query('DELETE FROM trading.orders WHERE id LIKE \'test-%%\'');
    await db.query('DELETE FROM trading.trades WHERE id LIKE \'test-%%\'');
    await db.query('DELETE FROM trading.positions WHERE user_id LIKE \'test-%%\'');
    await db.end();
    await redis.disconnect();
  });

  describe('Order Management', () => {
    test('should create a market buy order', async () => {
      const orderData = {
        userId: 'test-user-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 0.1
      };

      const response = await request(app)
        .post('/orders')
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.order).toMatchObject({
        userId: orderData.userId,
        symbol: orderData.symbol,
        side: orderData.side,
        type: orderData.type,
        quantity: orderData.quantity.toString(),
        status: 'filled'
      });
      
      // Verify order was saved to database
      const dbOrder = await db.query(
        'SELECT * FROM trading.orders WHERE id = $1',
        [response.body.order.id]
      );
      expect(dbOrder.rows).toHaveLength(1);
    });

    test('should create a limit sell order', async () => {
      const orderData = {
        userId: 'test-user-1',
        symbol: 'BTC/USDT',
        side: 'sell',
        type: 'limit',
        quantity: 0.05,
        price: 50000
      };

      const response = await request(app)
        .post('/orders')
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.order.status).toBe('open');
      expect(response.body.order.price).toBe(orderData.price.toString());
    });

    test('should reject order with insufficient balance', async () => {
      const orderData = {
        userId: 'test-user-1',
        symbol: 'BTC/USDT',
        side: 'buy',
        type: 'market',
        quantity: 100 // Very large quantity
      };

      const response = await request(app)
        .post('/orders')
        .send(orderData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Insufficient');
    });
  });

  describe('Position Management', () => {
    test('should create position after trade execution', async () => {
      const orderData = {
        userId: 'test-user-2',
        symbol: 'ETH/USDT',
        side: 'buy',
        type: 'market',
        quantity: 1
      };

      // Create account for test user 2
      await db.query(`
        INSERT INTO trading.accounts (user_id, balance, available_balance) 
        VALUES ('test-user-2', 5000, 5000)
        ON CONFLICT (user_id) DO UPDATE SET 
          balance = 5000, available_balance = 5000
      `);

      await request(app)
        .post('/orders')
        .send(orderData)
        .expect(201);

      // Check position was created
      const response = await request(app)
        .get('/users/test-user-2/positions')
        .expect(200);

      const ethPosition = response.body.find(pos => pos.symbol === 'ETH/USDT');
      expect(ethPosition).toBeDefined();
      expect(ethPosition.quantity).toBe('1');
    });
  });

  describe('Order Book', () => {
    test('should retrieve order book for symbol', async () => {
      const response = await request(app)
        .get('/orderbook/BTC/USDT')
        .expect(200);

      expect(response.body).toHaveProperty('symbol', 'BTC/USDT');
      expect(response.body).toHaveProperty('bids');
      expect(response.body).toHaveProperty('asks');
      expect(Array.isArray(response.body.bids)).toBe(true);
      expect(Array.isArray(response.body.asks)).toBe(true);
    });
  });
});
