// Mock StrategyValidator before any imports
jest.mock('../src/validation/StrategyValidator', () => {
  const { EventEmitter } = require('events');
  
  class MockStrategyValidator extends EventEmitter {
    constructor(options = {}) {
      super();
      this.logger = options.logger || {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      this.strategyPerformance = new Map();
    }

    async validateStrategy() {
      return {
        strategyName: 'mock-strategy',
        isValid: true,
        reasons: [],
        performance: {
          winRate: 0.85,
          profitFactor: 2.5,
          sharpeRatio: 1.8,
          maxDrawdown: 0.12,
          totalTrades: 150,
          winLossRatio: 2.1,
          lastUpdated: new Date().toISOString()
        },
        timestamp: new Date().toISOString()
      };
    }

    async validateExecutionRequest() {
      return { error: null, value: {} };
    }

    async validateStrategyParameters() {
      return { error: null, value: {} };
    }

    recordTradeResult() {
      return { wins: 1, losses: 0, totalTrades: 1, totalProfit: 100, totalLoss: 0, trades: [{}] };
    }

    getStrategyPerformance() {
      return Promise.resolve({
        strategyName: 'mock-strategy',
        winRate: 0.85,
        profitFactor: 2.5,
        sharpeRatio: 1.8,
        maxDrawdown: 0.12,
        totalTrades: 150,
        winLossRatio: 2.1,
        lastUpdated: new Date().toISOString()
      });
    }
  }

  return MockStrategyValidator;
});

const request = require('supertest');
const { expect } = require('chai');
const { v4: uuidv4 } = require('uuid');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const app = require('../src/tradingEngine');
const StrategyExecutionAPI = require('../src/api/strategyExecutionAPI');
const TradeExecutionEngine = require('../src/execution/TradeExecutionEngine');

// Mock the TradeExecutionEngine
const mockTradeExecutionEngine = {
  executeStrategy: sinon.stub(),
  cancelExecution: sinon.stub(),
  getExecutionStatus: sinon.stub(),
  getExecutionHistory: sinon.stub()
};

// Mock the logger
const mockLogger = {
  info: sinon.stub(),
  error: sinon.stub(),
  debug: sinon.stub()
};

// Create a test instance of StrategyExecutionAPI
const strategyExecutionAPI = new StrategyExecutionAPI({
  logger: mockLogger,
  tradeExecutionEngine: mockTradeExecutionEngine
});

// Helper function to generate a JWT token for testing
function generateAuthToken(userId = 'test-user-123') {
  return jwt.sign(
    { userId, email: 'test@example.com' },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Strategy Execution API', () => {
  let server;
  const baseUrl = '/api/strategy';
  const validToken = generateAuthToken();
  
  before((done) => {
    // Start the server on a test port
    server = app.listen(0, () => {
      console.log(`Test server running on port ${server.address().port}`);
      done();
    });
  });
  
  after((done) => {
    // Close the server after tests
    server.close(done);
  });
  
  beforeEach(() => {
    // Reset all stubs before each test
    sinon.resetHistory();
  });
  
  describe('POST /strategy/execute', () => {
    const validPayload = {
      strategy: 'mean-reversion',
      symbol: 'BTC-USD',
      timeframe: '1d',
      parameters: {
        lookbackPeriod: 14,
        threshold: 2.0
      },
      riskParameters: {
        maxPositionSize: 10,
        maxDailyLoss: 2,
        maxDrawdown: 5,
        maxLeverage: 5
      },
      dryRun: true
    };
    
    it('should return 401 if no token is provided', async () => {
      const response = await request(server)
        .post(`${baseUrl}/execute`)
        .send(validPayload);
      
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error', 'No token provided');
    });
    
    it('should return 400 for invalid request payload', async () => {
      const response = await request(server)
        .post(`${baseUrl}/execute`)
        .set('Authorization', `Bearer ${validToken}`)
        .send({}); // Missing required fields
      
      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error');
      expect(response.body.error).to.include('Validation Error');
    });
    
    it('should return 202 and start strategy execution for valid request', async () => {
      const executionId = uuidv4();
      const mockExecution = {
        id: executionId,
        status: 'pending',
        strategy: 'mean-reversion',
        symbol: 'BTC-USD',
        startedAt: new Date().toISOString()
      };
      
      // Mock the executeStrategy method to resolve with execution ID
      mockTradeExecutionEngine.executeStrategy.resolves(mockExecution);
      
      const response = await request(server)
        .post(`${baseUrl}/execute`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(validPayload);
      
      expect(response.status).to.equal(202);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('executionId', executionId);
      expect(response.body).to.have.property('status', 'pending');
      
      // Verify the trade execution engine was called with the correct parameters
      sinon.assert.calledOnce(mockTradeExecutionEngine.executeStrategy);
      const callArgs = mockTradeExecutionEngine.executeStrategy.firstCall.args[0];
      expect(callArgs.strategy).to.equal(validPayload.strategy);
      expect(callArgs.symbol).to.equal(validPayload.symbol);
      expect(callArgs.dryRun).to.be.true;
    });
    
    it('should handle errors during strategy execution', async () => {
      // Mock the executeStrategy method to reject with an error
      const error = new Error('Failed to execute strategy');
      mockTradeExecutionEngine.executeStrategy.rejects(error);
      
      const response = await request(server)
        .post(`${baseUrl}/execute`)
        .set('Authorization', `Bearer ${validToken}`)
        .send(validPayload);
      
      expect(response.status).to.equal(500);
      expect(response.body).to.have.property('error', 'Internal server error');
      
      // Verify the error was logged
      sinon.assert.calledWith(mockLogger.error, 'Error executing strategy:', error);
    });
  });
  
  describe('GET /strategy/status/:executionId', () => {
    const executionId = uuidv4();
    const mockExecution = {
      id: executionId,
      status: 'completed',
      strategy: 'mean-reversion',
      symbol: 'BTC-USD',
      startedAt: new Date(Date.now() - 60000).toISOString(),
      completedAt: new Date().toISOString(),
      result: {
        executed: true,
        orderId: 'order_1234567890',
        symbol: 'BTC-USD',
        side: 'BUY',
        quantity: 0.5,
        price: 30000.50,
        pnl: 150.25,
        fees: 4.50,
        timestamp: new Date().toISOString()
      }
    };
    
    it('should return 401 if no token is provided', async () => {
      const response = await request(server)
        .get(`${baseUrl}/status/${executionId}`);
      
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error', 'No token provided');
    });
    
    it('should return 400 for invalid execution ID format', async () => {
      const response = await request(server)
        .get(`${baseUrl}/status/invalid-id`)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error', 'Invalid execution ID format');
    });
    
    it('should return 404 if execution is not found', async () => {
      // Mock the getExecutionStatus method to resolve with null (not found)
      mockTradeExecutionEngine.getExecutionStatus.resolves(null);
      
      const response = await request(server)
        .get(`${baseUrl}/status/${executionId}`)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).to.equal(404);
      expect(response.body).to.have.property('error', 'Execution not found');
    });
    
    it('should return 200 with execution status for valid request', async () => {
      // Mock the getExecutionStatus method to resolve with mock execution
      mockTradeExecutionEngine.getExecutionStatus.resolves(mockExecution);
      
      const response = await request(server)
        .get(`${baseUrl}/status/${executionId}`)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('execution');
      expect(response.body.execution).to.have.property('id', executionId);
      expect(response.body.execution).to.have.property('status', 'completed');
      expect(response.body.execution).to.have.property('result');
      
      // Verify the trade execution engine was called with the correct parameters
      sinon.assert.calledWith(mockTradeExecutionEngine.getExecutionStatus, executionId);
    });
  });
  
  describe('POST /strategy/:executionId/cancel', () => {
    const executionId = uuidv4();
    
    it('should return 401 if no token is provided', async () => {
      const response = await request(server)
        .post(`${baseUrl}/${executionId}/cancel`);
      
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error', 'No token provided');
    });
    
    it('should return 400 for invalid execution ID format', async () => {
      const response = await request(server)
        .post(`${baseUrl}/invalid-id/cancel`)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error', 'Invalid execution ID format');
    });
    
    it('should return 404 if execution is not found', async () => {
      // Mock the cancelExecution method to resolve with false (not found or already completed)
      mockTradeExecutionEngine.cancelExecution.resolves(false);
      
      const response = await request(server)
        .post(`${baseUrl}/${executionId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).to.equal(404);
      expect(response.body).to.have.property('error', 'Execution not found or already completed');
    });
    
    it('should return 200 and cancel execution for valid request', async () => {
      // Mock the cancelExecution method to resolve with true (success)
      mockTradeExecutionEngine.cancelExecution.resolves(true);
      
      const response = await request(server)
        .post(`${baseUrl}/${executionId}/cancel`)
        .set('Authorization', `Bearer ${validToken}`);
      
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('message', 'Execution cancelled successfully');
      
      // Verify the trade execution engine was called with the correct parameters
      sinon.assert.calledWith(mockTradeExecutionEngine.cancelExecution, executionId);
    });
  });
  
  describe('GET /strategy/history', () => {
    const mockHistory = [
      {
        id: uuidv4(),
        status: 'completed',
        strategy: 'mean-reversion',
        symbol: 'BTC-USD',
        startedAt: new Date(Date.now() - 86400000).toISOString(),
        completedAt: new Date(Date.now() - 86340000).toISOString(),
        result: {
          executed: true,
          orderId: 'order_1234567890',
          symbol: 'BTC-USD',
          side: 'BUY',
          quantity: 0.5,
          price: 30000.50,
          pnl: 150.25,
          fees: 4.50
        }
      },
      {
        id: uuidv4(),
        status: 'failed',
        strategy: 'mean-reversion',
        symbol: 'ETH-USD',
        startedAt: new Date(Date.now() - 172800000).toISOString(),
        completedAt: new Date(Date.now() - 172794000).toISOString(),
        error: {
          reason: 'Insufficient funds',
          details: { availableBalance: 1000, requiredBalance: 1500 },
          code: 'INSUFFICIENT_FUNDS'
        }
      }
    ];
    
    it('should return 401 if no token is provided', async () => {
      const response = await request(server)
        .get(`${baseUrl}/history`);
      
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error', 'No token provided');
    });
    
    it('should return 200 with execution history for valid request', async () => {
      // Mock the getExecutionHistory method to resolve with mock history
      mockTradeExecutionEngine.getExecutionHistory.resolves({
        data: mockHistory,
        pagination: {
          limit: 50,
          offset: 0,
          total: 2,
          hasMore: false
        }
      });
      
      const response = await request(server)
        .get(`${baseUrl}/history`)
        .set('Authorization', `Bearer ${validToken}`)
        .query({
          limit: 50,
          offset: 0,
          status: 'completed,failed',
          strategy: 'mean-reversion'
        });
      
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('data').that.is.an('array').with.lengthOf(2);
      expect(response.body).to.have.property('pagination');
      expect(response.body.pagination).to.have.property('total', 2);
      
      // Verify the trade execution engine was called with the correct parameters
      sinon.assert.calledWith(mockTradeExecutionEngine.getExecutionHistory, {
        userId: 'test-user-123',
        limit: 50,
        offset: 0,
        status: ['completed', 'failed'],
        strategy: 'mean-reversion',
        symbol: undefined,
        startDate: undefined,
        endDate: undefined
      });
    });
    
    it('should handle date range filters', async () => {
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const endDate = new Date().toISOString();
      
      // Mock the getExecutionHistory method to resolve with mock history
      mockTradeExecutionEngine.getExecutionHistory.resolves({
        data: mockHistory,
        pagination: {
          limit: 10,
          offset: 0,
          total: 2,
          hasMore: false
        }
      });
      
      const response = await request(server)
        .get(`${baseUrl}/history`)
        .set('Authorization', `Bearer ${validToken}`)
        .query({
          limit: 10,
          offset: 0,
          startDate,
          endDate
        });
      
      expect(response.status).to.equal(200);
      
      // Verify the trade execution engine was called with the correct date parameters
      const expectedStartDate = new Date(startDate);
      const expectedEndDate = new Date(endDate);
      
      const callArgs = mockTradeExecutionEngine.getExecutionHistory.firstCall.args[0];
      expect(callArgs.startDate).to.be.a('date');
      expect(callArgs.endDate).to.be.a('date');
      
      // Check that the dates are within a small delta (allowing for some processing time)
      expect(callArgs.startDate.getTime()).to.be.closeTo(expectedStartDate.getTime(), 1000);
      expect(callArgs.endDate.getTime()).to.be.closeTo(expectedEndDate.getTime(), 1000);
    });
  });
});
