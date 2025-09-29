/**
 * Integration Tests for Trading Data Storage
 * Tests database operations for trading data, positions, and performance metrics
 */

const { Pool } = require('pg');
const Redis = require('ioredis');

describe('Trading Data Integration Tests', () => {
  let pgPool;
  let redisClient;
  let testDatabaseUrl;
  let testRedisUrl;

  beforeAll(async () => {
    // Setup test database connections
    testDatabaseUrl = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/nexus_trade_test';
    testRedisUrl = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';

    pgPool = new Pool({
      connectionString: testDatabaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    redisClient = new Redis(testRedisUrl);

    // Create test tables
    await setupTestTables();
  });

  afterAll(async () => {
    // Cleanup test data
    await cleanupTestData();
    
    if (pgPool) {
      await pgPool.end();
    }
    
    if (redisClient) {
      await redisClient.disconnect();
    }
  });

  beforeEach(async () => {
    // Clear test data before each test
    await clearTestData();
  });

  async function setupTestTables() {
    const client = await pgPool.connect();
    
    try {
      // Create trades table
      await client.query(`
        CREATE TABLE IF NOT EXISTS trades (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL,
          side VARCHAR(4) NOT NULL CHECK (side IN ('BUY', 'SELL')),
          quantity DECIMAL(15,8) NOT NULL,
          price DECIMAL(15,8) NOT NULL,
          strategy VARCHAR(50) NOT NULL,
          confidence DECIMAL(3,2),
          entry_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          exit_time TIMESTAMP WITH TIME ZONE,
          pnl DECIMAL(15,8),
          status VARCHAR(20) DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create positions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS positions (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL UNIQUE,
          quantity DECIMAL(15,8) NOT NULL,
          avg_entry_price DECIMAL(15,8) NOT NULL,
          current_price DECIMAL(15,8),
          unrealized_pnl DECIMAL(15,8),
          stop_loss DECIMAL(15,8),
          take_profit DECIMAL(15,8),
          strategy VARCHAR(50) NOT NULL,
          confidence DECIMAL(3,2),
          opened_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create performance_metrics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS performance_metrics (
          id SERIAL PRIMARY KEY,
          date DATE NOT NULL,
          total_trades INTEGER DEFAULT 0,
          winning_trades INTEGER DEFAULT 0,
          total_pnl DECIMAL(15,8) DEFAULT 0,
          max_drawdown DECIMAL(15,8) DEFAULT 0,
          sharpe_ratio DECIMAL(8,4),
          win_rate DECIMAL(5,4),
          avg_trade_duration INTERVAL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(date)
        )
      `);

      // Create market_data table for time-series data
      await client.query(`
        CREATE TABLE IF NOT EXISTS market_data (
          id SERIAL PRIMARY KEY,
          symbol VARCHAR(10) NOT NULL,
          timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
          open_price DECIMAL(15,8) NOT NULL,
          high_price DECIMAL(15,8) NOT NULL,
          low_price DECIMAL(15,8) NOT NULL,
          close_price DECIMAL(15,8) NOT NULL,
          volume BIGINT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(symbol, timestamp)
        )
      `);

      // Create indexes for performance
      await client.query('CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)');
      await client.query('CREATE INDEX IF NOT EXISTS idx_market_data_symbol_timestamp ON market_data(symbol, timestamp)');
      
    } finally {
      client.release();
    }
  }

  async function clearTestData() {
    const client = await pgPool.connect();
    
    try {
      await client.query('DELETE FROM trades');
      await client.query('DELETE FROM positions');
      await client.query('DELETE FROM performance_metrics');
      await client.query('DELETE FROM market_data');
    } finally {
      client.release();
    }

    // Clear Redis test data
    await redisClient.flushdb();
  }

  async function cleanupTestData() {
    const client = await pgPool.connect();
    
    try {
      await client.query('DROP TABLE IF EXISTS trades CASCADE');
      await client.query('DROP TABLE IF EXISTS positions CASCADE');
      await client.query('DROP TABLE IF EXISTS performance_metrics CASCADE');
      await client.query('DROP TABLE IF EXISTS market_data CASCADE');
    } finally {
      client.release();
    }
  }

  describe('Trade Data Operations', () => {
    test('should insert new trade record', async () => {
      const client = await pgPool.connect();
      
      try {
        const tradeData = {
          symbol: 'AAPL',
          side: 'BUY',
          quantity: 100,
          price: 150.50,
          strategy: 'trend_following',
          confidence: 0.85
        };

        const result = await client.query(`
          INSERT INTO trades (symbol, side, quantity, price, strategy, confidence)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, created_at
        `, [tradeData.symbol, tradeData.side, tradeData.quantity, tradeData.price, tradeData.strategy, tradeData.confidence]);

        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toHaveProperty('id');
        expect(result.rows[0]).toHaveProperty('created_at');
      } finally {
        client.release();
      }
    });

    test('should update trade with exit information', async () => {
      const client = await pgPool.connect();
      
      try {
        // Insert initial trade
        const insertResult = await client.query(`
          INSERT INTO trades (symbol, side, quantity, price, strategy, confidence)
          VALUES ('AAPL', 'BUY', 100, 150.50, 'trend_following', 0.85)
          RETURNING id
        `);

        const tradeId = insertResult.rows[0].id;

        // Update with exit information
        const exitPrice = 155.75;
        const pnl = (exitPrice - 150.50) * 100; // $525 profit

        const updateResult = await client.query(`
          UPDATE trades 
          SET exit_time = NOW(), price = $1, pnl = $2, status = 'CLOSED', updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `, [exitPrice, pnl, tradeId]);

        expect(updateResult.rows).toHaveLength(1);
        expect(updateResult.rows[0].status).toBe('CLOSED');
        expect(updateResult.rows[0].pnl).toBe(pnl.toString());
        expect(updateResult.rows[0].exit_time).toBeTruthy();
      } finally {
        client.release();
      }
    });

    test('should retrieve trades by strategy', async () => {
      const client = await pgPool.connect();
      
      try {
        // Insert multiple trades with different strategies
        await client.query(`
          INSERT INTO trades (symbol, side, quantity, price, strategy, confidence)
          VALUES 
            ('AAPL', 'BUY', 100, 150.50, 'trend_following', 0.85),
            ('GOOGL', 'SELL', 50, 2750.00, 'mean_reversion', 0.75),
            ('MSFT', 'BUY', 75, 300.25, 'trend_following', 0.90)
        `);

        const result = await client.query(`
          SELECT * FROM trades WHERE strategy = $1 ORDER BY created_at
        `, ['trend_following']);

        expect(result.rows).toHaveLength(2);
        expect(result.rows[0].symbol).toBe('AAPL');
        expect(result.rows[1].symbol).toBe('MSFT');
        expect(result.rows.every(row => row.strategy === 'trend_following')).toBe(true);
      } finally {
        client.release();
      }
    });

    test('should calculate trade statistics', async () => {
      const client = await pgPool.connect();
      
      try {
        // Insert trades with known PnL
        await client.query(`
          INSERT INTO trades (symbol, side, quantity, price, strategy, confidence, pnl, status)
          VALUES 
            ('AAPL', 'BUY', 100, 150.50, 'trend_following', 0.85, 525.00, 'CLOSED'),
            ('GOOGL', 'SELL', 50, 2750.00, 'mean_reversion', 0.75, -125.50, 'CLOSED'),
            ('MSFT', 'BUY', 75, 300.25, 'trend_following', 0.90, 337.50, 'CLOSED'),
            ('TSLA', 'SELL', 25, 210.75, 'volatility_breakout', 0.80, -87.25, 'CLOSED')
        `);

        const result = await client.query(`
          SELECT 
            COUNT(*) as total_trades,
            COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
            SUM(pnl) as total_pnl,
            AVG(pnl) as avg_pnl,
            ROUND(COUNT(CASE WHEN pnl > 0 THEN 1 END)::DECIMAL / COUNT(*), 4) as win_rate
          FROM trades 
          WHERE status = 'CLOSED'
        `);

        const stats = result.rows[0];
        expect(parseInt(stats.total_trades)).toBe(4);
        expect(parseInt(stats.winning_trades)).toBe(2);
        expect(parseFloat(stats.total_pnl)).toBe(649.75);
        expect(parseFloat(stats.win_rate)).toBe(0.5);
      } finally {
        client.release();
      }
    });
  });

  describe('Position Data Operations', () => {
    test('should insert and update position', async () => {
      const client = await pgPool.connect();
      
      try {
        const positionData = {
          symbol: 'AAPL',
          quantity: 100,
          avg_entry_price: 150.50,
          current_price: 152.25,
          strategy: 'trend_following',
          confidence: 0.85,
          stop_loss: 147.50,
          take_profit: 157.50
        };

        // Insert position
        const insertResult = await client.query(`
          INSERT INTO positions (symbol, quantity, avg_entry_price, current_price, strategy, confidence, stop_loss, take_profit)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `, [positionData.symbol, positionData.quantity, positionData.avg_entry_price, 
            positionData.current_price, positionData.strategy, positionData.confidence,
            positionData.stop_loss, positionData.take_profit]);

        expect(insertResult.rows).toHaveLength(1);

        // Update position with new price
        const newPrice = 154.75;
        const unrealizedPnl = (newPrice - positionData.avg_entry_price) * positionData.quantity;

        const updateResult = await client.query(`
          UPDATE positions 
          SET current_price = $1, unrealized_pnl = $2, updated_at = NOW()
          WHERE symbol = $3
          RETURNING *
        `, [newPrice, unrealizedPnl, positionData.symbol]);

        expect(updateResult.rows).toHaveLength(1);
        expect(parseFloat(updateResult.rows[0].current_price)).toBe(newPrice);
        expect(parseFloat(updateResult.rows[0].unrealized_pnl)).toBe(unrealizedPnl);
      } finally {
        client.release();
      }
    });

    test('should handle position conflicts with upsert', async () => {
      const client = await pgPool.connect();
      
      try {
        const symbol = 'AAPL';
        
        // First insert
        await client.query(`
          INSERT INTO positions (symbol, quantity, avg_entry_price, current_price, strategy, confidence)
          VALUES ($1, 100, 150.50, 150.50, 'trend_following', 0.85)
          ON CONFLICT (symbol) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            avg_entry_price = EXCLUDED.avg_entry_price,
            updated_at = NOW()
        `, [symbol]);

        // Second insert (should update)
        await client.query(`
          INSERT INTO positions (symbol, quantity, avg_entry_price, current_price, strategy, confidence)
          VALUES ($1, 150, 151.25, 151.25, 'trend_following', 0.90)
          ON CONFLICT (symbol) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            avg_entry_price = EXCLUDED.avg_entry_price,
            updated_at = NOW()
        `, [symbol]);

        const result = await client.query('SELECT * FROM positions WHERE symbol = $1', [symbol]);
        
        expect(result.rows).toHaveLength(1);
        expect(parseFloat(result.rows[0].quantity)).toBe(150);
        expect(parseFloat(result.rows[0].avg_entry_price)).toBe(151.25);
      } finally {
        client.release();
      }
    });

    test('should calculate portfolio metrics', async () => {
      const client = await pgPool.connect();
      
      try {
        // Insert multiple positions
        await client.query(`
          INSERT INTO positions (symbol, quantity, avg_entry_price, current_price, unrealized_pnl, strategy, confidence)
          VALUES 
            ('AAPL', 100, 150.50, 152.25, 175.00, 'trend_following', 0.85),
            ('GOOGL', -50, 2750.00, 2725.50, 1225.00, 'mean_reversion', 0.75),
            ('MSFT', 75, 300.25, 305.75, 412.50, 'trend_following', 0.90)
        `);

        const result = await client.query(`
          SELECT 
            COUNT(*) as total_positions,
            SUM(ABS(quantity * current_price)) as total_exposure,
            SUM(unrealized_pnl) as total_unrealized_pnl,
            AVG(confidence) as avg_confidence
          FROM positions
        `);

        const metrics = result.rows[0];
        expect(parseInt(metrics.total_positions)).toBe(3);
        expect(parseFloat(metrics.total_unrealized_pnl)).toBe(1812.50);
        expect(parseFloat(metrics.avg_confidence)).toBeCloseTo(0.833, 2);
      } finally {
        client.release();
      }
    });
  });

  describe('Market Data Operations', () => {
    test('should insert market data efficiently', async () => {
      const client = await pgPool.connect();
      
      try {
        const marketData = [
          ['AAPL', '2024-01-01 10:00:00+00', 150.00, 152.50, 149.75, 151.25, 1000000],
          ['AAPL', '2024-01-01 10:01:00+00', 151.25, 153.00, 150.50, 152.75, 1100000],
          ['GOOGL', '2024-01-01 10:00:00+00', 2750.00, 2765.00, 2745.00, 2760.50, 500000]
        ];

        // Batch insert
        const query = `
          INSERT INTO market_data (symbol, timestamp, open_price, high_price, low_price, close_price, volume)
          VALUES ${marketData.map((_, i) => `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}, $${i*7+7})`).join(', ')}
          ON CONFLICT (symbol, timestamp) DO UPDATE SET
            open_price = EXCLUDED.open_price,
            high_price = EXCLUDED.high_price,
            low_price = EXCLUDED.low_price,
            close_price = EXCLUDED.close_price,
            volume = EXCLUDED.volume
        `;

        const values = marketData.flat();
        const result = await client.query(query, values);

        expect(result.rowCount).toBe(3);

        // Verify data
        const selectResult = await client.query('SELECT COUNT(*) FROM market_data');
        expect(parseInt(selectResult.rows[0].count)).toBe(3);
      } finally {
        client.release();
      }
    });

    test('should retrieve time-series data efficiently', async () => {
      const client = await pgPool.connect();
      
      try {
        // Insert time series data
        const timestamps = [];
        const values = [];
        
        for (let i = 0; i < 100; i++) {
          const timestamp = new Date(Date.now() + i * 60000).toISOString(); // 1 minute intervals
          const basePrice = 150 + Math.sin(i * 0.1) * 5;
          
          timestamps.push(timestamp);
          values.push(['AAPL', timestamp, basePrice, basePrice + 1, basePrice - 1, basePrice + 0.5, 1000000 + i * 1000]);
        }

        const query = `
          INSERT INTO market_data (symbol, timestamp, open_price, high_price, low_price, close_price, volume)
          VALUES ${values.map((_, i) => `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}, $${i*7+7})`).join(', ')}
        `;

        await client.query(query, values.flat());

        // Query recent data
        const result = await client.query(`
          SELECT * FROM market_data 
          WHERE symbol = 'AAPL' 
          ORDER BY timestamp DESC 
          LIMIT 10
        `);

        expect(result.rows).toHaveLength(10);
        expect(result.rows[0].symbol).toBe('AAPL');
        
        // Verify ordering
        for (let i = 1; i < result.rows.length; i++) {
          expect(new Date(result.rows[i-1].timestamp).getTime())
            .toBeGreaterThan(new Date(result.rows[i].timestamp).getTime());
        }
      } finally {
        client.release();
      }
    });
  });

  describe('Redis Cache Operations', () => {
    test('should cache and retrieve market data', async () => {
      const symbol = 'AAPL';
      const marketData = {
        symbol: symbol,
        price: 152.75,
        volume: 1500000,
        timestamp: Date.now()
      };

      // Cache data
      await redisClient.setex(`market:${symbol}`, 60, JSON.stringify(marketData));

      // Retrieve data
      const cachedData = await redisClient.get(`market:${symbol}`);
      const parsedData = JSON.parse(cachedData);

      expect(parsedData.symbol).toBe(symbol);
      expect(parsedData.price).toBe(152.75);
      expect(parsedData.volume).toBe(1500000);
    });

    test('should cache position data with expiration', async () => {
      const positionKey = 'position:AAPL';
      const positionData = {
        symbol: 'AAPL',
        quantity: 100,
        entryPrice: 150.50,
        currentPrice: 152.75,
        pnl: 225.00
      };

      // Cache with 5 minute expiration
      await redisClient.setex(positionKey, 300, JSON.stringify(positionData));

      // Verify TTL
      const ttl = await redisClient.ttl(positionKey);
      expect(ttl).toBeGreaterThan(290);
      expect(ttl).toBeLessThanOrEqual(300);

      // Retrieve and verify
      const cached = await redisClient.get(positionKey);
      const parsed = JSON.parse(cached);
      expect(parsed.symbol).toBe('AAPL');
      expect(parsed.pnl).toBe(225.00);
    });

    test('should handle Redis pub/sub for real-time updates', (done) => {
      const subscriber = new Redis(testRedisUrl);
      const publisher = new Redis(testRedisUrl);

      const testMessage = {
        type: 'price_update',
        symbol: 'AAPL',
        price: 153.25,
        timestamp: Date.now()
      };

      subscriber.subscribe('market_updates');
      
      subscriber.on('message', (channel, message) => {
        expect(channel).toBe('market_updates');
        
        const parsed = JSON.parse(message);
        expect(parsed.type).toBe('price_update');
        expect(parsed.symbol).toBe('AAPL');
        expect(parsed.price).toBe(153.25);
        
        subscriber.disconnect();
        publisher.disconnect();
        done();
      });

      // Publish after a short delay
      setTimeout(() => {
        publisher.publish('market_updates', JSON.stringify(testMessage));
      }, 100);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large batch inserts efficiently', async () => {
      const client = await pgPool.connect();
      
      try {
        const batchSize = 1000;
        const marketData = [];
        
        for (let i = 0; i < batchSize; i++) {
          marketData.push([
            'AAPL',
            new Date(Date.now() + i * 1000).toISOString(),
            150 + Math.random() * 10,
            155 + Math.random() * 10,
            145 + Math.random() * 10,
            150 + Math.random() * 10,
            1000000 + Math.floor(Math.random() * 500000)
          ]);
        }

        const startTime = Date.now();
        
        const query = `
          INSERT INTO market_data (symbol, timestamp, open_price, high_price, low_price, close_price, volume)
          VALUES ${marketData.map((_, i) => `($${i*7+1}, $${i*7+2}, $${i*7+3}, $${i*7+4}, $${i*7+5}, $${i*7+6}, $${i*7+7})`).join(', ')}
        `;

        await client.query(query, marketData.flat());
        
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should complete within reasonable time (adjust threshold as needed)
        expect(duration).toBeLessThan(5000); // 5 seconds

        // Verify all records inserted
        const countResult = await client.query('SELECT COUNT(*) FROM market_data WHERE symbol = $1', ['AAPL']);
        expect(parseInt(countResult.rows[0].count)).toBe(batchSize);
        
      } finally {
        client.release();
      }
    });

    test('should handle concurrent database operations', async () => {
      const concurrentOperations = 10;
      const operations = [];

      for (let i = 0; i < concurrentOperations; i++) {
        operations.push(
          (async () => {
            const client = await pgPool.connect();
            try {
              await client.query(`
                INSERT INTO trades (symbol, side, quantity, price, strategy, confidence)
                VALUES ($1, $2, $3, $4, $5, $6)
              `, [`STOCK${i}`, 'BUY', 100, 100 + i, 'test_strategy', 0.8]);
            } finally {
              client.release();
            }
          })()
        );
      }

      // All operations should complete successfully
      await Promise.all(operations);

      // Verify all records inserted
      const client = await pgPool.connect();
      try {
        const result = await client.query('SELECT COUNT(*) FROM trades');
        expect(parseInt(result.rows[0].count)).toBe(concurrentOperations);
      } finally {
        client.release();
      }
    });
  });
});
