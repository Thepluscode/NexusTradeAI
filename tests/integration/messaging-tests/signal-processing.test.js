/**
 * Integration Tests for Signal Processing and Messaging
 * Tests the complete signal flow from generation to execution
 */

const Redis = require('ioredis');
const EventEmitter = require('events');

describe('Signal Processing Integration Tests', () => {
  let redisPublisher;
  let redisSubscriber;
  let testRedisUrl;
  let signalProcessor;

  beforeAll(async () => {
    testRedisUrl = process.env.TEST_REDIS_URL || 'redis://localhost:6379/2';
    
    redisPublisher = new Redis(testRedisUrl);
    redisSubscriber = new Redis(testRedisUrl);
    
    // Mock signal processor
    signalProcessor = new EventEmitter();
    signalProcessor.processedSignals = [];
    signalProcessor.errors = [];
  });

  afterAll(async () => {
    if (redisPublisher) {
      await redisPublisher.disconnect();
    }
    if (redisSubscriber) {
      await redisSubscriber.disconnect();
    }
  });

  beforeEach(async () => {
    // Clear Redis test database
    await redisPublisher.flushdb();
    
    // Reset processor state
    signalProcessor.processedSignals = [];
    signalProcessor.errors = [];
  });

  describe('Signal Generation and Publishing', () => {
    test('should publish trading signals to Redis', async () => {
      const signal = {
        id: 'signal_001',
        symbol: 'AAPL',
        action: 'BUY',
        price: 152.75,
        quantity: 100,
        strategy: 'trend_following',
        confidence: 0.85,
        timestamp: new Date().toISOString(),
        stopLoss: 149.50,
        takeProfit: 158.25
      };

      // Publish signal
      await redisPublisher.publish('trading_signals', JSON.stringify(signal));

      // Verify signal was published (by checking if we can retrieve it from a list)
      await redisPublisher.lpush('signal_history', JSON.stringify(signal));
      const retrievedSignal = await redisPublisher.lindex('signal_history', 0);
      const parsedSignal = JSON.parse(retrievedSignal);

      expect(parsedSignal.id).toBe('signal_001');
      expect(parsedSignal.symbol).toBe('AAPL');
      expect(parsedSignal.action).toBe('BUY');
      expect(parsedSignal.confidence).toBe(0.85);
    });

    test('should handle multiple signals in sequence', async () => {
      const signals = [
        {
          id: 'signal_001',
          symbol: 'AAPL',
          action: 'BUY',
          price: 152.75,
          strategy: 'trend_following',
          confidence: 0.85,
          timestamp: new Date().toISOString()
        },
        {
          id: 'signal_002',
          symbol: 'GOOGL',
          action: 'SELL',
          price: 2750.50,
          strategy: 'mean_reversion',
          confidence: 0.78,
          timestamp: new Date().toISOString()
        },
        {
          id: 'signal_003',
          symbol: 'MSFT',
          action: 'BUY',
          price: 305.25,
          strategy: 'volatility_breakout',
          confidence: 0.92,
          timestamp: new Date().toISOString()
        }
      ];

      // Publish all signals
      for (const signal of signals) {
        await redisPublisher.publish('trading_signals', JSON.stringify(signal));
        await redisPublisher.lpush('signal_history', JSON.stringify(signal));
      }

      // Verify all signals were stored
      const signalCount = await redisPublisher.llen('signal_history');
      expect(signalCount).toBe(3);

      // Verify signal order and content
      for (let i = 0; i < signals.length; i++) {
        const retrievedSignal = await redisPublisher.lindex('signal_history', signals.length - 1 - i);
        const parsedSignal = JSON.parse(retrievedSignal);
        expect(parsedSignal.id).toBe(signals[i].id);
        expect(parsedSignal.symbol).toBe(signals[i].symbol);
      }
    });

    test('should validate signal format before publishing', async () => {
      const validSignal = {
        id: 'signal_001',
        symbol: 'AAPL',
        action: 'BUY',
        price: 152.75,
        strategy: 'trend_following',
        confidence: 0.85,
        timestamp: new Date().toISOString()
      };

      const invalidSignals = [
        { id: 'signal_002' }, // Missing required fields
        { symbol: 'AAPL', action: 'INVALID_ACTION' }, // Invalid action
        { symbol: 'AAPL', action: 'BUY', price: 'not_a_number' }, // Invalid price
        { symbol: 'AAPL', action: 'BUY', price: 152.75, confidence: 1.5 } // Invalid confidence
      ];

      // Function to validate signal
      const validateSignal = (signal) => {
        const requiredFields = ['symbol', 'action', 'price', 'strategy', 'confidence'];
        const validActions = ['BUY', 'SELL', 'HOLD'];
        
        // Check required fields
        for (const field of requiredFields) {
          if (!signal.hasOwnProperty(field)) {
            return false;
          }
        }
        
        // Validate action
        if (!validActions.includes(signal.action)) {
          return false;
        }
        
        // Validate price
        if (typeof signal.price !== 'number' || signal.price <= 0) {
          return false;
        }
        
        // Validate confidence
        if (typeof signal.confidence !== 'number' || signal.confidence < 0 || signal.confidence > 1) {
          return false;
        }
        
        return true;
      };

      // Valid signal should pass
      expect(validateSignal(validSignal)).toBe(true);

      // Invalid signals should fail
      for (const invalidSignal of invalidSignals) {
        expect(validateSignal(invalidSignal)).toBe(false);
      }
    });
  });

  describe('Signal Subscription and Processing', () => {
    test('should subscribe to and process trading signals', (done) => {
      const testSignal = {
        id: 'signal_001',
        symbol: 'AAPL',
        action: 'BUY',
        price: 152.75,
        quantity: 100,
        strategy: 'trend_following',
        confidence: 0.85,
        timestamp: new Date().toISOString()
      };

      // Subscribe to signals
      redisSubscriber.subscribe('trading_signals');
      
      redisSubscriber.on('message', (channel, message) => {
        expect(channel).toBe('trading_signals');
        
        const signal = JSON.parse(message);
        expect(signal.id).toBe('signal_001');
        expect(signal.symbol).toBe('AAPL');
        expect(signal.action).toBe('BUY');
        
        signalProcessor.processedSignals.push(signal);
        signalProcessor.emit('signalProcessed', signal);
        
        done();
      });

      // Publish signal after subscription is established
      setTimeout(() => {
        redisPublisher.publish('trading_signals', JSON.stringify(testSignal));
      }, 100);
    });

    test('should handle signal processing errors gracefully', (done) => {
      const invalidSignal = {
        id: 'signal_002',
        symbol: 'INVALID',
        action: 'BUY',
        price: 'invalid_price'
      };

      let errorHandled = false;

      redisSubscriber.subscribe('trading_signals');
      
      redisSubscriber.on('message', (channel, message) => {
        try {
          const signal = JSON.parse(message);
          
          // Simulate processing error for invalid price
          if (typeof signal.price !== 'number') {
            throw new Error(`Invalid price: ${signal.price}`);
          }
          
          signalProcessor.processedSignals.push(signal);
        } catch (error) {
          signalProcessor.errors.push({
            error: error.message,
            signal: JSON.parse(message),
            timestamp: new Date().toISOString()
          });
          errorHandled = true;
        }
        
        if (errorHandled) {
          expect(signalProcessor.errors).toHaveLength(1);
          expect(signalProcessor.errors[0].error).toContain('Invalid price');
          done();
        }
      });

      setTimeout(() => {
        redisPublisher.publish('trading_signals', JSON.stringify(invalidSignal));
      }, 100);
    });

    test('should process multiple concurrent signals', (done) => {
      const signals = [
        { id: 'signal_001', symbol: 'AAPL', action: 'BUY', price: 152.75, strategy: 'trend', confidence: 0.85 },
        { id: 'signal_002', symbol: 'GOOGL', action: 'SELL', price: 2750.50, strategy: 'mean_rev', confidence: 0.78 },
        { id: 'signal_003', symbol: 'MSFT', action: 'BUY', price: 305.25, strategy: 'breakout', confidence: 0.92 }
      ];

      let processedCount = 0;

      redisSubscriber.subscribe('trading_signals');
      
      redisSubscriber.on('message', (channel, message) => {
        const signal = JSON.parse(message);
        signalProcessor.processedSignals.push(signal);
        processedCount++;
        
        if (processedCount === signals.length) {
          expect(signalProcessor.processedSignals).toHaveLength(3);
          
          // Verify all signals were processed
          const processedIds = signalProcessor.processedSignals.map(s => s.id);
          expect(processedIds).toContain('signal_001');
          expect(processedIds).toContain('signal_002');
          expect(processedIds).toContain('signal_003');
          
          done();
        }
      });

      // Publish all signals rapidly
      setTimeout(() => {
        signals.forEach(signal => {
          redisPublisher.publish('trading_signals', JSON.stringify(signal));
        });
      }, 100);
    });
  });

  describe('Signal Routing and Filtering', () => {
    test('should route signals to appropriate strategy channels', async () => {
      const signals = [
        { id: 'signal_001', symbol: 'AAPL', strategy: 'trend_following', action: 'BUY', price: 152.75, confidence: 0.85 },
        { id: 'signal_002', symbol: 'GOOGL', strategy: 'mean_reversion', action: 'SELL', price: 2750.50, confidence: 0.78 },
        { id: 'signal_003', symbol: 'MSFT', strategy: 'trend_following', action: 'BUY', price: 305.25, confidence: 0.92 }
      ];

      // Simulate signal routing
      for (const signal of signals) {
        const strategyChannel = `signals:${signal.strategy}`;
        await redisPublisher.publish(strategyChannel, JSON.stringify(signal));
        await redisPublisher.lpush(`${strategyChannel}:history`, JSON.stringify(signal));
      }

      // Verify signals were routed correctly
      const trendSignals = await redisPublisher.llen('signals:trend_following:history');
      const meanRevSignals = await redisPublisher.llen('signals:mean_reversion:history');

      expect(trendSignals).toBe(2); // AAPL and MSFT
      expect(meanRevSignals).toBe(1); // GOOGL

      // Verify signal content in trend following channel
      const trendSignal1 = JSON.parse(await redisPublisher.lindex('signals:trend_following:history', 0));
      const trendSignal2 = JSON.parse(await redisPublisher.lindex('signals:trend_following:history', 1));
      
      expect([trendSignal1.symbol, trendSignal2.symbol]).toContain('AAPL');
      expect([trendSignal1.symbol, trendSignal2.symbol]).toContain('MSFT');
    });

    test('should filter signals by confidence threshold', async () => {
      const signals = [
        { id: 'signal_001', symbol: 'AAPL', action: 'BUY', price: 152.75, confidence: 0.95 }, // High confidence
        { id: 'signal_002', symbol: 'GOOGL', action: 'SELL', price: 2750.50, confidence: 0.45 }, // Low confidence
        { id: 'signal_003', symbol: 'MSFT', action: 'BUY', price: 305.25, confidence: 0.85 } // High confidence
      ];

      const confidenceThreshold = 0.7;
      const highConfidenceSignals = [];

      // Filter signals by confidence
      for (const signal of signals) {
        if (signal.confidence >= confidenceThreshold) {
          highConfidenceSignals.push(signal);
          await redisPublisher.lpush('high_confidence_signals', JSON.stringify(signal));
        } else {
          await redisPublisher.lpush('low_confidence_signals', JSON.stringify(signal));
        }
      }

      expect(highConfidenceSignals).toHaveLength(2);
      
      const highConfCount = await redisPublisher.llen('high_confidence_signals');
      const lowConfCount = await redisPublisher.llen('low_confidence_signals');
      
      expect(highConfCount).toBe(2);
      expect(lowConfCount).toBe(1);
    });

    test('should handle signal priority queues', async () => {
      const signals = [
        { id: 'signal_001', symbol: 'AAPL', action: 'BUY', price: 152.75, priority: 'high', confidence: 0.95 },
        { id: 'signal_002', symbol: 'GOOGL', action: 'SELL', price: 2750.50, priority: 'medium', confidence: 0.78 },
        { id: 'signal_003', symbol: 'MSFT', action: 'BUY', price: 305.25, priority: 'low', confidence: 0.65 },
        { id: 'signal_004', symbol: 'TSLA', action: 'SELL', price: 210.50, priority: 'high', confidence: 0.88 }
      ];

      // Add signals to priority queues
      for (const signal of signals) {
        const queueName = `signals:${signal.priority}_priority`;
        
        if (signal.priority === 'high') {
          // Use LPUSH for high priority (FIFO from left)
          await redisPublisher.lpush(queueName, JSON.stringify(signal));
        } else {
          // Use RPUSH for lower priority (FIFO from right)
          await redisPublisher.rpush(queueName, JSON.stringify(signal));
        }
      }

      // Verify queue lengths
      const highPriorityCount = await redisPublisher.llen('signals:high_priority');
      const mediumPriorityCount = await redisPublisher.llen('signals:medium_priority');
      const lowPriorityCount = await redisPublisher.llen('signals:low_priority');

      expect(highPriorityCount).toBe(2);
      expect(mediumPriorityCount).toBe(1);
      expect(lowPriorityCount).toBe(1);

      // Process high priority signals first
      const highPrioritySignal = JSON.parse(await redisPublisher.lpop('signals:high_priority'));
      expect(['signal_001', 'signal_004']).toContain(highPrioritySignal.id);
      expect(highPrioritySignal.priority).toBe('high');
    });
  });

  describe('Signal Persistence and Recovery', () => {
    test('should persist signals for recovery', async () => {
      const signal = {
        id: 'signal_001',
        symbol: 'AAPL',
        action: 'BUY',
        price: 152.75,
        strategy: 'trend_following',
        confidence: 0.85,
        timestamp: new Date().toISOString(),
        status: 'pending'
      };

      // Persist signal with expiration
      const signalKey = `signal:${signal.id}`;
      await redisPublisher.setex(signalKey, 3600, JSON.stringify(signal)); // 1 hour expiration

      // Add to processing queue
      await redisPublisher.lpush('signal_processing_queue', signal.id);

      // Verify persistence
      const retrievedSignal = await redisPublisher.get(signalKey);
      const parsedSignal = JSON.parse(retrievedSignal);
      
      expect(parsedSignal.id).toBe('signal_001');
      expect(parsedSignal.status).toBe('pending');

      // Verify queue
      const queueLength = await redisPublisher.llen('signal_processing_queue');
      expect(queueLength).toBe(1);

      const queuedSignalId = await redisPublisher.lindex('signal_processing_queue', 0);
      expect(queuedSignalId).toBe('signal_001');
    });

    test('should handle signal processing acknowledgments', async () => {
      const signalId = 'signal_001';
      const signal = {
        id: signalId,
        symbol: 'AAPL',
        action: 'BUY',
        price: 152.75,
        status: 'pending'
      };

      // Store signal
      await redisPublisher.setex(`signal:${signalId}`, 3600, JSON.stringify(signal));
      await redisPublisher.lpush('signal_processing_queue', signalId);

      // Simulate processing
      const processingSignalId = await redisPublisher.rpop('signal_processing_queue');
      expect(processingSignalId).toBe(signalId);

      // Update signal status to processing
      signal.status = 'processing';
      signal.processingStarted = new Date().toISOString();
      await redisPublisher.setex(`signal:${signalId}`, 3600, JSON.stringify(signal));

      // Add to processing set (for tracking)
      await redisPublisher.sadd('signals_processing', signalId);

      // Simulate completion
      signal.status = 'completed';
      signal.processingCompleted = new Date().toISOString();
      await redisPublisher.setex(`signal:${signalId}`, 3600, JSON.stringify(signal));

      // Remove from processing set
      await redisPublisher.srem('signals_processing', signalId);

      // Add to completed set
      await redisPublisher.sadd('signals_completed', signalId);

      // Verify final state
      const finalSignal = JSON.parse(await redisPublisher.get(`signal:${signalId}`));
      expect(finalSignal.status).toBe('completed');
      expect(finalSignal.processingCompleted).toBeTruthy();

      const isProcessing = await redisPublisher.sismember('signals_processing', signalId);
      const isCompleted = await redisPublisher.sismember('signals_completed', signalId);
      
      expect(isProcessing).toBe(0); // Not in processing set
      expect(isCompleted).toBe(1);  // In completed set
    });

    test('should handle signal processing timeouts', async () => {
      const signalId = 'signal_timeout_test';
      const signal = {
        id: signalId,
        symbol: 'AAPL',
        action: 'BUY',
        price: 152.75,
        status: 'processing',
        processingStarted: new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
      };

      // Store signal in processing state
      await redisPublisher.setex(`signal:${signalId}`, 3600, JSON.stringify(signal));
      await redisPublisher.sadd('signals_processing', signalId);

      // Simulate timeout check
      const processingSignals = await redisPublisher.smembers('signals_processing');
      const timeoutThreshold = 5 * 60 * 1000; // 5 minutes
      const now = Date.now();

      for (const id of processingSignals) {
        const signalData = await redisPublisher.get(`signal:${id}`);
        if (signalData) {
          const parsedSignal = JSON.parse(signalData);
          const processingTime = now - new Date(parsedSignal.processingStarted).getTime();
          
          if (processingTime > timeoutThreshold) {
            // Mark as timed out
            parsedSignal.status = 'timeout';
            parsedSignal.timeoutAt = new Date().toISOString();
            
            await redisPublisher.setex(`signal:${id}`, 3600, JSON.stringify(parsedSignal));
            await redisPublisher.srem('signals_processing', id);
            await redisPublisher.sadd('signals_timeout', id);
          }
        }
      }

      // Verify timeout handling
      const timeoutSignal = JSON.parse(await redisPublisher.get(`signal:${signalId}`));
      expect(timeoutSignal.status).toBe('timeout');
      expect(timeoutSignal.timeoutAt).toBeTruthy();

      const isInTimeout = await redisPublisher.sismember('signals_timeout', signalId);
      expect(isInTimeout).toBe(1);
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle high-frequency signal publishing', async () => {
      const signalCount = 1000;
      const signals = [];

      // Generate signals
      for (let i = 0; i < signalCount; i++) {
        signals.push({
          id: `signal_${i.toString().padStart(4, '0')}`,
          symbol: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'][i % 4],
          action: ['BUY', 'SELL'][i % 2],
          price: 100 + Math.random() * 100,
          confidence: 0.5 + Math.random() * 0.5,
          timestamp: new Date().toISOString()
        });
      }

      const startTime = Date.now();

      // Publish all signals
      const pipeline = redisPublisher.pipeline();
      signals.forEach(signal => {
        pipeline.publish('trading_signals', JSON.stringify(signal));
        pipeline.lpush('signal_history', JSON.stringify(signal));
      });
      
      await pipeline.exec();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds

      // Verify all signals were stored
      const storedCount = await redisPublisher.llen('signal_history');
      expect(storedCount).toBe(signalCount);
    });

    test('should maintain signal ordering under load', async () => {
      const signalCount = 100;
      const signals = [];

      // Generate ordered signals
      for (let i = 0; i < signalCount; i++) {
        signals.push({
          id: `signal_${i.toString().padStart(3, '0')}`,
          sequence: i,
          symbol: 'AAPL',
          action: 'BUY',
          price: 150 + i * 0.1,
          timestamp: new Date(Date.now() + i * 1000).toISOString()
        });
      }

      // Publish signals in order
      for (const signal of signals) {
        await redisPublisher.lpush('ordered_signals', JSON.stringify(signal));
      }

      // Retrieve and verify order
      const retrievedSignals = [];
      for (let i = 0; i < signalCount; i++) {
        const signalData = await redisPublisher.rpop('ordered_signals');
        if (signalData) {
          retrievedSignals.push(JSON.parse(signalData));
        }
      }

      expect(retrievedSignals).toHaveLength(signalCount);

      // Verify sequence order
      for (let i = 0; i < retrievedSignals.length; i++) {
        expect(retrievedSignals[i].sequence).toBe(i);
      }
    });
  });
});
