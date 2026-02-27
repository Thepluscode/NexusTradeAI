/**
 * Position Repository Tests
 * =========================
 * Comprehensive test suite for PositionRepository
 * Following institutional testing standards
 */

const PositionRepository = require('../database/repositories/PositionRepository');
const db = require('../database/db');

// Mock database
jest.mock('../database/db');

describe('PositionRepository', () => {
  beforeEach(() => {
    // Clear cache before each test
    PositionRepository.clearCache();
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  describe('create', () => {
    it('should create a new position with valid data', async () => {
      const mockPosition = {
        account_id: 'test-account',
        symbol: 'AAPL',
        side: 'long',
        quantity: 10,
        average_entry_price: 150.00,
        strategy: 'momentum'
      };

      const mockResult = {
        rows: [{
          id: 1,
          ...mockPosition,
          current_price: null,
          unrealized_pnl: 0,
          realized_pnl: 0,
          total_pnl: 0,
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      const result = await PositionRepository.create(mockPosition);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.symbol).toBe('AAPL');
      expect(result.quantity).toBe(10);
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should throw error when account_id is missing', async () => {
      const invalidPosition = {
        symbol: 'AAPL',
        side: 'long',
        quantity: 10,
        average_entry_price: 150.00
      };

      await expect(PositionRepository.create(invalidPosition))
        .rejects.toThrow('account_id is required');
    });

    it('should throw error when symbol is missing', async () => {
      const invalidPosition = {
        account_id: 'test-account',
        side: 'long',
        quantity: 10,
        average_entry_price: 150.00
      };

      await expect(PositionRepository.create(invalidPosition))
        .rejects.toThrow('symbol is required');
    });

    it('should throw error when quantity is zero', async () => {
      const invalidPosition = {
        account_id: 'test-account',
        symbol: 'AAPL',
        side: 'long',
        quantity: 0,
        average_entry_price: 150.00
      };

      await expect(PositionRepository.create(invalidPosition))
        .rejects.toThrow('quantity must be > 0');
    });

    it('should throw error when quantity is negative', async () => {
      const invalidPosition = {
        account_id: 'test-account',
        symbol: 'AAPL',
        side: 'long',
        quantity: -10,
        average_entry_price: 150.00
      };

      await expect(PositionRepository.create(invalidPosition))
        .rejects.toThrow('quantity must be > 0');
    });

    it('should throw error when side is invalid', async () => {
      const invalidPosition = {
        account_id: 'test-account',
        symbol: 'AAPL',
        side: 'invalid',
        quantity: 10,
        average_entry_price: 150.00
      };

      await expect(PositionRepository.create(invalidPosition))
        .rejects.toThrow('side must be long or short');
    });
  });

  describe('getById', () => {
    it('should retrieve position by id', async () => {
      const mockResult = {
        rows: [{
          id: 1,
          account_id: 'test-account',
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          average_entry_price: 150.00,
          current_price: 155.00,
          unrealized_pnl: 50.00,
          realized_pnl: 0,
          total_pnl: 50.00,
          strategy: 'momentum',
          status: 'open',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      const result = await PositionRepository.getById(1);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(result.symbol).toBe('AAPL');
      expect(db.query).toHaveBeenCalledWith(
        'SELECT * FROM positions WHERE id = $1',
        [1]
      );
    });

    it('should return null when position not found', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await PositionRepository.getById(999);

      expect(result).toBeNull();
    });

    it('should use cache on second call', async () => {
      const mockResult = {
        rows: [{
          id: 1,
          account_id: 'test-account',
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          average_entry_price: 150.00,
          current_price: 155.00,
          unrealized_pnl: 50.00,
          realized_pnl: 0,
          total_pnl: 50.00,
          strategy: 'momentum',
          status: 'open',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      // First call - should query database
      await PositionRepository.getById(1);
      expect(db.query).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await PositionRepository.getById(1);
      expect(db.query).toHaveBeenCalledTimes(1); // Still 1, not 2
    });
  });

  describe('update', () => {
    it('should update position with valid data', async () => {
      const updates = {
        current_price: 155.00,
        stop_loss: 145.00
      };

      const mockResult = {
        rows: [{
          id: 1,
          account_id: 'test-account',
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          average_entry_price: 150.00,
          current_price: 155.00,
          stop_loss: 145.00,
          unrealized_pnl: 50.00,
          realized_pnl: 0,
          total_pnl: 50.00,
          strategy: 'momentum',
          status: 'open',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      const result = await PositionRepository.update(1, updates);

      expect(result).toBeDefined();
      expect(result.current_price).toBe(155.00);
      expect(result.stop_loss).toBe(145.00);
    });

    it('should throw error when position not found', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await expect(PositionRepository.update(999, { current_price: 155.00 }))
        .rejects.toThrow('Position 999 not found');
    });

    it('should throw error when no valid fields to update', async () => {
      await expect(PositionRepository.update(1, { invalid_field: 'value' }))
        .rejects.toThrow('No valid fields to update');
    });

    it('should clear cache after update', async () => {
      const mockResult = {
        rows: [{
          id: 1,
          account_id: 'test-account',
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          average_entry_price: 150.00,
          current_price: 155.00,
          unrealized_pnl: 50.00,
          realized_pnl: 0,
          total_pnl: 50.00,
          strategy: 'momentum',
          status: 'open',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      // Cache should be cleared after update
      const cacheSpy = jest.spyOn(PositionRepository, 'clearCache');
      await PositionRepository.update(1, { current_price: 155.00 });

      expect(cacheSpy).toHaveBeenCalled();
    });
  });

  describe('getActive', () => {
    it('should retrieve all active positions for account', async () => {
      const mockResult = {
        rows: [
          {
            id: 1,
            account_id: 'test-account',
            symbol: 'AAPL',
            side: 'long',
            quantity: 10,
            average_entry_price: 150.00,
            current_price: 155.00,
            unrealized_pnl: 50.00,
            realized_pnl: 0,
            total_pnl: 50.00,
            strategy: 'momentum',
            status: 'open',
            created_at: new Date(),
            updated_at: new Date()
          },
          {
            id: 2,
            account_id: 'test-account',
            symbol: 'TSLA',
            side: 'long',
            quantity: 5,
            average_entry_price: 200.00,
            current_price: 210.00,
            unrealized_pnl: 50.00,
            realized_pnl: 0,
            total_pnl: 50.00,
            strategy: 'momentum',
            status: 'open',
            created_at: new Date(),
            updated_at: new Date()
          }
        ]
      };

      db.query.mockResolvedValue(mockResult);

      const result = await PositionRepository.getActive('test-account');

      expect(result).toHaveLength(2);
      expect(result[0].symbol).toBe('AAPL');
      expect(result[1].symbol).toBe('TSLA');
    });

    it('should filter by symbol when provided', async () => {
      const mockResult = {
        rows: [{
          id: 1,
          account_id: 'test-account',
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          average_entry_price: 150.00,
          current_price: 155.00,
          unrealized_pnl: 50.00,
          realized_pnl: 0,
          total_pnl: 50.00,
          strategy: 'momentum',
          status: 'open',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      const result = await PositionRepository.getActive('test-account', 'AAPL');

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
    });
  });

  describe('close', () => {
    it('should close position with exit price', async () => {
      const mockResult = {
        rows: [{
          id: 1,
          account_id: 'test-account',
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          average_entry_price: 150.00,
          current_price: 160.00,
          unrealized_pnl: 0,
          realized_pnl: 100.00,
          total_pnl: 100.00,
          strategy: 'momentum',
          status: 'closed',
          closed_at: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      const result = await PositionRepository.close(1, 160.00);

      expect(result).toBeDefined();
      expect(result.status).toBe('closed');
      expect(result.realized_pnl).toBe(100.00);
    });

    it('should throw error when position not found', async () => {
      db.query.mockResolvedValue({ rows: [] });

      await expect(PositionRepository.close(999, 160.00))
        .rejects.toThrow('Position 999 not found');
    });
  });

  describe('getStatistics', () => {
    it('should calculate statistics correctly', async () => {
      const mockResult = {
        rows: [{
          total_positions: '10',
          open_positions: '3',
          closed_positions: '7',
          total_pnl: '500.00',
          avg_pnl: '71.43',
          max_profit: '200.00',
          max_loss: '-100.00'
        }]
      };

      db.query.mockResolvedValue(mockResult);

      const result = await PositionRepository.getStatistics('test-account');

      expect(result).toBeDefined();
      expect(result.total_positions).toBe(10);
      expect(result.open_positions).toBe(3);
      expect(result.closed_positions).toBe(7);
      expect(result.total_pnl).toBe(500.00);
      expect(result.avg_pnl).toBe(71.43);
    });
  });

  describe('cache management', () => {
    it('should expire cache after TTL', async () => {
      const mockResult = {
        rows: [{
          id: 1,
          account_id: 'test-account',
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          average_entry_price: 150.00,
          current_price: 155.00,
          unrealized_pnl: 50.00,
          realized_pnl: 0,
          total_pnl: 50.00,
          strategy: 'momentum',
          status: 'open',
          created_at: new Date(),
          updated_at: new Date()
        }]
      };

      db.query.mockResolvedValue(mockResult);

      // First call
      await PositionRepository.getById(1);
      expect(db.query).toHaveBeenCalledTimes(1);

      // Mock time passing beyond TTL (60 seconds)
      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 61000);

      // Second call after TTL should query again
      await PositionRepository.getById(1);
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache entries', () => {
      PositionRepository.setCache('test1', { data: 'value1' });
      PositionRepository.setCache('test2', { data: 'value2' });

      expect(PositionRepository.cache.size).toBe(2);

      PositionRepository.clearCache();

      expect(PositionRepository.cache.size).toBe(0);
    });
  });

  describe('data mapping', () => {
    it('should correctly map database row to position object', () => {
      const dbRow = {
        id: 1,
        account_id: 'test-account',
        symbol: 'AAPL',
        side: 'long',
        quantity: '10',
        average_entry_price: '150.00',
        current_price: '155.00',
        unrealized_pnl: '50.00',
        realized_pnl: '0.00',
        total_pnl: '50.00',
        stop_loss: '145.00',
        take_profit: '165.00',
        strategy: 'momentum',
        status: 'open',
        metadata: { test: 'value' },
        created_at: new Date(),
        updated_at: new Date()
      };

      const position = PositionRepository.mapRow(dbRow);

      expect(typeof position.quantity).toBe('number');
      expect(typeof position.average_entry_price).toBe('number');
      expect(typeof position.current_price).toBe('number');
      expect(typeof position.unrealized_pnl).toBe('number');
      expect(position.quantity).toBe(10);
      expect(position.average_entry_price).toBe(150.00);
    });

    it('should handle null values correctly', () => {
      const dbRow = {
        id: 1,
        account_id: 'test-account',
        symbol: 'AAPL',
        side: 'long',
        quantity: '10',
        average_entry_price: '150.00',
        current_price: null,
        unrealized_pnl: '0',
        realized_pnl: '0',
        total_pnl: '0',
        stop_loss: null,
        take_profit: null,
        strategy: 'momentum',
        status: 'open',
        metadata: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      const position = PositionRepository.mapRow(dbRow);

      expect(position.current_price).toBeNull();
      expect(position.stop_loss).toBeNull();
      expect(position.take_profit).toBeNull();
      expect(position.metadata).toBeNull();
    });
  });
});
