const request = require('supertest');
const { expect } = require('chai');
const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const app = require('../../src/tradingEngine');
const TradeExecutionEngine = require('../../src/execution/TradeExecutionEngine');
const StrategyValidator = require('../../src/validation/strategyValidation');
const {
  TEST_USER,
  generateAuthToken,
  createTestExecutionPayload,
  createTestExecutionResponse,
  createTestExecutionHistory,
  testErrorResponse
} = require('../testHelpers');

// Mock the TradeExecutionEngine and StrategyValidator
jest.mock('../../src/execution/TradeExecutionEngine');
jest.mock('../../src/validation/strategyValidation');

// Test server
let server;
const baseUrl = '/api/strategy';

// Test data
const testToken = generateAuthToken();
const testExecutionId = uuidv4();
const testOrderId = 'test-order-123';

// Mock implementations
const mockTradeExecutionEngine = {
  executeStrategy: jest.fn(),
  cancelExecution: jest.fn(),
  getExecutionStatus: jest.fn(),
  getExecutionHistory: jest.fn()
};

const mockStrategyValidator = {
  validateExecutionRequest: jest.fn(),
  validateExecutionId: jest.fn(),
  validateHistoryQuery: jest.fn(),
  validateStrategyParameters: jest.fn()
};

// Setup test server before all tests
describe('Strategy Execution API - Integration Tests', () => {
  beforeAll((done) => {
    // Create a test server
    server = app.listen(0, () => {
      console.log(`Test server running on port ${server.address().port}`);
      done();
    });
    
    // Replace the actual implementations with mocks
    TradeExecutionEngine.mockImplementation(() => mockTradeExecutionEngine);
    StrategyValidator.mockImplementation(() => mockStrategyValidator);
  });

  afterAll((done) => {
    // Close the server after all tests
    server.close(done);
  });

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    
    // Setup default mock implementations
    mockStrategyValidator.validateExecutionRequest.mockReturnValue({
      error: null,
      value: createTestExecutionPayload()
    });
    
    mockStrategyValidator.validateExecutionId.mockReturnValue({
      error: null,
      value: testExecutionId
    });
    
    mockStrategyValidator.validateHistoryQuery.mockReturnValue({
      error: null,
      value: {
        limit: 10,
        offset: 0,
        status: ['completed']
      }
    });
    
    mockStrategyValidator.validateStrategyParameters.mockReturnValue({
      valid: true,
      errors: []
    });
    
    mockTradeExecutionEngine.executeStrategy.mockResolvedValue(
      createTestExecutionResponse('completed')
    );
    
    mockTradeExecutionEngine.getExecutionStatus.mockResolvedValue(
      createTestExecutionResponse('completed')
    );
    
    mockTradeExecutionEngine.cancelExecution.mockResolvedValue(true);
    
    mockTradeExecutionEngine.getExecutionHistory.mockResolvedValue(
      createTestExecutionHistory(2)
    );
  });

  describe('POST /strategy/execute', () => {
    it('should execute a strategy and return 202 Accepted', async () => {
      const payload = createTestExecutionPayload();
      
      const response = await request(server)
        .post(`${baseUrl}/execute`)
        .set('Authorization', `Bearer ${testToken}`)
        .send(payload);
      
      expect(response.status).to.equal(202);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('executionId');
      expect(response.body).to.have.property('status', 'pending');
      
      // Verify the trade execution engine was called
      expect(mockTradeExecutionEngine.executeStrategy).toHaveBeenCalledWith(
        expect.objectContaining({
          ...payload,
          userId: TEST_USER.id
        })
      );
    });

    it('should return 400 for invalid request payload', async () => {
      // Make validator return an error
      const validationError = new Error('Validation error');
      validationError.details = [{ message: 'Invalid strategy' }];
      mockStrategyValidator.validateExecutionRequest.mockReturnValue({
        error: validationError,
        value: null
      });
      
      const response = await request(server)
        .post(`${baseUrl}/execute`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({}); // Invalid payload
      
      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error', 'Validation error');
      expect(response.body).to.have.property('details');
    });

    it('should return 401 for missing or invalid token', async () => {
      // Test with no token
      let response = await request(server)
        .post(`${baseUrl}/execute`)
        .send(createTestExecutionPayload());
      
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error', 'No token provided');
      
      // Test with invalid token
      response = await request(server)
        .post(`${baseUrl}/execute`)
        .set('Authorization', 'Bearer invalid-token')
        .send(createTestExecutionPayload());
      
      expect(response.status).to.equal(401);
      expect(response.body).to.have.property('error', 'Invalid token');
    });
  });

  describe('GET /strategy/status/:executionId', () => {
    it('should return execution status for a valid execution ID', async () => {
      const execution = createTestExecutionResponse('completed');
      mockTradeExecutionEngine.getExecutionStatus.mockResolvedValue(execution);
      
      const response = await request(server)
        .get(`${baseUrl}/status/${testExecutionId}`)
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body.execution).toMatchObject({
        id: testExecutionId,
        status: 'completed',
        strategy: 'mean-reversion',
        symbol: 'BTC-USD'
      });
      
      // Verify the trade execution engine was called
      expect(mockTradeExecutionEngine.getExecutionStatus).toHaveBeenCalledWith(testExecutionId);
    });

    it('should return 404 for non-existent execution', async () => {
      mockTradeExecutionEngine.getExecutionStatus.mockResolvedValue(null);
      
      const response = await request(server)
        .get(`${baseUrl}/status/${testExecutionId}`)
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(response.status).to.equal(404);
      expect(response.body).to.have.property('error', 'Execution not found');
    });
  });

  describe('POST /strategy/:executionId/cancel', () => {
    it('should cancel a running execution and return 200', async () => {
      mockTradeExecutionEngine.cancelExecution.mockResolvedValue(true);
      
      const response = await request(server)
        .post(`${baseUrl}/${testExecutionId}/cancel`)
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body).to.have.property('message', 'Execution cancelled successfully');
      
      // Verify the trade execution engine was called
      expect(mockTradeExecutionEngine.cancelExecution).toHaveBeenCalledWith(testExecutionId);
    });

    it('should return 404 for non-existent or non-cancellable execution', async () => {
      mockTradeExecutionEngine.cancelExecution.mockResolvedValue(false);
      
      const response = await request(server)
        .post(`${baseUrl}/${testExecutionId}/cancel`)
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(response.status).to.equal(404);
      expect(response.body).to.have.property('error', 'Execution not found or already completed');
    });
  });

  describe('GET /strategy/history', () => {
    it('should return execution history with filters', async () => {
      const history = createTestExecutionHistory(3);
      mockTradeExecutionEngine.getExecutionHistory.mockResolvedValue(history);
      
      const response = await request(server)
        .get(`${baseUrl}/history`)
        .query({
          status: 'completed,failed',
          strategy: 'mean-reversion',
          symbol: 'BTC-USD',
          limit: '10',
          offset: '0'
        })
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(response.status).to.equal(200);
      expect(response.body).to.have.property('success', true);
      expect(response.body.data).to.be.an('array').with.lengthOf(3);
      expect(response.body.pagination).to.have.property('total', 3);
      
      // Verify the trade execution engine was called with the correct filters
      expect(mockTradeExecutionEngine.getExecutionHistory).toHaveBeenCalledWith(
        TEST_USER.id,
        {
          status: ['completed', 'failed'],
          strategy: 'mean-reversion',
          symbol: 'BTC-USD',
          limit: 10,
          offset: 0,
          startDate: undefined,
          endDate: undefined
        }
      );
    });

    it('should handle date range filters', async () => {
      const startDate = '2023-01-01T00:00:00Z';
      const endDate = '2023-12-31T23:59:59Z';
      
      await request(server)
        .get(`${baseUrl}/history`)
        .query({ startDate, endDate })
        .set('Authorization', `Bearer ${testToken}`);
      
      // Verify the trade execution engine was called with the date filters
      const callArgs = mockTradeExecutionEngine.getExecutionHistory.mock.calls[0][1];
      expect(callArgs.startDate).toEqual(new Date(startDate));
      expect(callArgs.endDate).toEqual(new Date(endDate));
    });

    it('should return 400 for invalid query parameters', async () => {
      // Make validator return an error for invalid query params
      const validationError = new Error('Invalid query parameters');
      validationError.details = [{ message: 'Invalid status value' }];
      mockStrategyValidator.validateHistoryQuery.mockReturnValue({
        error: validationError,
        value: null
      });
      
      const response = await request(server)
        .get(`${baseUrl}/history`)
        .query({ status: 'invalid-status' })
        .set('Authorization', `Bearer ${testToken}`);
      
      expect(response.status).to.equal(400);
      expect(response.body).to.have.property('error', 'Invalid query parameters');
    });
  });
});
