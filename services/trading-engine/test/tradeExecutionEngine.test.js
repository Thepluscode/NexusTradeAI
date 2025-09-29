const { expect } = require('chai');
const sinon = require('sinon');
const { v4: uuidv4 } = require('uuid');
const TradeExecutionEngine = require('../src/execution/TradeExecutionEngine');
const { createTestExecutionPayload } = require('./testHelpers');

// Mock dependencies
const mockLogger = {
  info: sinon.stub(),
  error: sinon.stub(),
  debug: sinon.stub(),
  warn: sinon.stub()
};

const mockMarketDataService = {
  getMarketData: sinon.stub()
};

const mockOrderService = {
  createOrder: sinon.stub(),
  cancelOrder: sinon.stub()
};

const mockRiskManagementService = {
  calculatePositionSize: sinon.stub(),
  validateRiskParameters: sinon.stub()
};

const mockStrategyFactory = {
  createStrategy: sinon.stub()
};

describe('TradeExecutionEngine', () => {
  let tradeExecutionEngine;
  let clock;
  
  const testUserId = 'test-user-123';
  const testExecutionId = uuidv4();
  const testOrderId = 'test-order-123';
  const testSymbol = 'BTC-USD';
  const testPrice = 30000.50;
  
  // Setup test data
  const testMarketData = {
    symbol: testSymbol,
    timeframe: '1d',
    data: [
      { timestamp: '2023-01-01T00:00:00Z', open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      { timestamp: '2023-01-02T00:00:00Z', open: 102, high: 108, low: 98, close: 105, volume: 1200 },
      { timestamp: '2023-01-03T00:00:00Z', open: 105, high: 110, low: 100, close: 98, volume: 1500 },
    ]
  };
  
  const testStrategyResult = {
    signal: 'buy',
    confidence: 0.85,
    price: testPrice,
    stopLoss: 29500.00,
    takeProfit: 31000.00,
    timestamp: new Date().toISOString()
  };
  
  const testOrderResult = {
    id: testOrderId,
    status: 'filled',
    symbol: testSymbol,
    side: 'buy',
    quantity: 0.5,
    price: testPrice,
    timestamp: new Date().toISOString()
  };
  
  beforeEach(() => {
    // Create a sandbox for stubs
    const sandbox = sinon.createSandbox();
    
    // Setup clock for time-dependent tests
    clock = sinon.useFakeTimers({
      now: new Date('2023-06-15T14:30:00Z'),
      shouldAdvanceTime: true
    });
    
    // Reset stubs
    mockMarketDataService.getMarketData.reset();
    mockOrderService.createOrder.reset();
    mockOrderService.cancelOrder.reset();
    mockRiskManagementService.calculatePositionSize.reset();
    mockRiskManagementService.validateRiskParameters.reset();
    mockStrategyFactory.createStrategy.reset();
    
    // Setup default stub behaviors
    mockMarketDataService.getMarketData.resolves(testMarketData);
    mockOrderService.createOrder.resolves(testOrderResult);
    mockRiskManagementService.calculatePositionSize.resolves(0.5);
    mockRiskManagementService.validateRiskParameters.resolves({ valid: true, errors: [] });
    
    // Mock strategy
    const mockStrategy = {
      execute: sinon.stub().resolves(testStrategyResult)
    };
    mockStrategyFactory.createStrategy.returns(mockStrategy);
    
    // Create a new instance of the TradeExecutionEngine for each test
    tradeExecutionEngine = new TradeExecutionEngine({
      logger: mockLogger,
      marketDataService: mockMarketDataService,
      orderService: mockOrderService,
      riskManagementService: mockRiskManagementService,
      strategyFactory: mockStrategyFactory
    });
  });
  
  afterEach(() => {
    // Restore the original functions
    sinon.restore();
    clock.restore();
  });
  
  describe('executeStrategy', () => {
    it('should execute a strategy and return the execution result', async () => {
      // Setup test data
      const executionRequest = {
        id: testExecutionId,
        userId: testUserId,
        ...createTestExecutionPayload()
      };
      
      // Execute the strategy
      const result = await tradeExecutionEngine.executeStrategy(executionRequest);
      
      // Verify the result
      expect(result).to.have.property('id', testExecutionId);
      expect(result).to.have.property('status', 'completed');
      expect(result).to.have.property('strategy', executionRequest.strategy);
      expect(result).to.have.property('symbol', executionRequest.symbol);
      expect(result).to.have.property('result');
      expect(result.result).to.have.property('orderId', testOrderId);
      
      // Verify market data was fetched
      sinon.assert.calledWith(
        mockMarketDataService.getMarketData,
        executionRequest.symbol,
        executionRequest.timeframe,
        sinon.match.object // options
      );
      
      // Verify position size was calculated
      sinon.assert.calledWith(
        mockRiskManagementService.calculatePositionSize,
        sinon.match({
          symbol: executionRequest.symbol,
          price: testStrategyResult.price,
          stopLoss: testStrategyResult.stopLoss,
          takeProfit: testStrategyResult.takeProfit,
          riskParameters: executionRequest.riskParameters
        })
      );
      
      // Verify order was created
      sinon.assert.calledWith(
        mockOrderService.createOrder,
        sinon.match({
          symbol: executionRequest.symbol,
          side: testStrategyResult.signal,
          quantity: 0.5, // From calculatePositionSize stub
          price: testStrategyResult.price,
          stopLoss: testStrategyResult.stopLoss,
          takeProfit: testStrategyResult.takeProfit,
          dryRun: executionRequest.dryRun
        })
      );
    });
    
    it('should handle dry run mode without placing orders', async () => {
      // Setup test data with dryRun = true
      const executionRequest = {
        id: testExecutionId,
        userId: testUserId,
        ...createTestExecutionPayload({ dryRun: true })
      };
      
      // Execute the strategy
      const result = await tradeExecutionEngine.executeStrategy(executionRequest);
      
      // Verify the result
      expect(result).to.have.property('status', 'completed');
      expect(result.result).to.have.property('dryRun', true);
      
      // Verify no order was created
      sinon.assert.notCalled(mockOrderService.createOrder);
    });
    
    it('should handle strategy execution errors', async () => {
      // Setup test data
      const executionRequest = {
        id: testExecutionId,
        userId: testUserId,
        ...createTestExecutionPayload()
      };
      
      // Make strategy execution fail
      const error = new Error('Strategy execution failed');
      mockStrategyFactory.createStrategy().execute.rejects(error);
      
      // Execute the strategy and expect it to throw
      const result = await tradeExecutionEngine.executeStrategy(executionRequest);
      
      // Verify the error was handled
      expect(result).to.have.property('status', 'failed');
      expect(result).to.have.property('error');
      expect(result.error).to.have.property('message', 'Strategy execution failed');
      
      // Verify the error was logged
      sinon.assert.calledWith(
        mockLogger.error,
        'Error executing strategy:', 
        sinon.match({ message: 'Strategy execution failed' })
      );
    });
    
    it('should handle invalid market data', async () => {
      // Setup test data
      const executionRequest = {
        id: testExecutionId,
        userId: testUserId,
        ...createTestExecutionPayload()
      };
      
      // Make market data service return empty data
      mockMarketDataService.getMarketData.resolves({
        ...testMarketData,
        data: [] // Empty market data
      });
      
      // Execute the strategy
      const result = await tradeExecutionEngine.executeStrategy(executionRequest);
      
      // Verify the error was handled
      expect(result).to.have.property('status', 'failed');
      expect(result).to.have.property('error');
      expect(result.error).to.have.property('message', 'Insufficient market data');
    });
  });
  
  describe('cancelExecution', () => {
    it('should cancel a running execution', async () => {
      // Setup test data
      const executionId = testExecutionId;
      const orderId = testOrderId;
      
      // Mock the execution in progress
      const execution = {
        id: executionId,
        status: 'running',
        result: {
          orderId
        },
        cancel: sinon.stub().resolves(true)
      };
      
      // Add to active executions
      tradeExecutionEngine.activeExecutions.set(executionId, execution);
      
      // Cancel the execution
      const result = await tradeExecutionEngine.cancelExecution(executionId);
      
      // Verify the result
      expect(result).to.be.true;
      
      // Verify the order was cancelled
      sinon.assert.calledWith(mockOrderService.cancelOrder, orderId);
      
      // Verify the execution was removed from active executions
      expect(tradeExecutionEngine.activeExecutions.has(executionId)).to.be.false;
    });
    
    it('should return false for non-existent execution', async () => {
      // Try to cancel a non-existent execution
      const result = await tradeExecutionEngine.cancelExecution('non-existent-id');
      
      // Verify the result
      expect(result).to.be.false;
      
      // Verify no order was cancelled
      sinon.assert.notCalled(mockOrderService.cancelOrder);
    });
    
    it('should handle cancellation errors', async () => {
      // Setup test data
      const executionId = testExecutionId;
      const orderId = testOrderId;
      
      // Mock the execution in progress
      const execution = {
        id: executionId,
        status: 'running',
        result: {
          orderId
        },
        cancel: sinon.stub().rejects(new Error('Failed to cancel'))
      };
      
      // Add to active executions
      tradeExecutionEngine.activeExecutions.set(executionId, execution);
      
      // Cancel the execution and expect it to handle the error
      const result = await tradeExecutionEngine.cancelExecution(executionId);
      
      // Verify the result
      expect(result).to.be.false;
      
      // Verify the error was logged
      sinon.assert.calledWith(
        mockLogger.error,
        'Error cancelling execution:', 
        sinon.match({ message: 'Failed to cancel' })
      );
      
      // Verify the execution was removed from active executions even on error
      expect(tradeExecutionEngine.activeExecutions.has(executionId)).to.be.false;
    });
  });
  
  describe('getExecutionStatus', () => {
    it('should return the status of an active execution', async () => {
      // Setup test data
      const executionId = testExecutionId;
      const execution = {
        id: executionId,
        status: 'running',
        strategy: 'mean-reversion',
        symbol: testSymbol,
        startedAt: new Date().toISOString()
      };
      
      // Add to active executions
      tradeExecutionEngine.activeExecutions.set(executionId, execution);
      
      // Get the execution status
      const result = await tradeExecutionEngine.getExecutionStatus(executionId);
      
      // Verify the result
      expect(result).to.deep.equal(execution);
    });
    
    it('should return null for non-existent execution', async () => {
      // Try to get status of a non-existent execution
      const result = await tradeExecutionEngine.getExecutionStatus('non-existent-id');
      
      // Verify the result
      expect(result).to.be.null;
    });
  });
  
  describe('getExecutionHistory', () => {
    it('should return execution history with filters', async () => {
      // Setup test data
      const userId = testUserId;
      const filters = {
        status: ['completed', 'failed'],
        strategy: 'mean-reversion',
        symbol: testSymbol,
        limit: 10,
        offset: 0
      };
      
      // Mock the database response
      const mockHistory = [
        {
          id: uuidv4(),
          userId,
          status: 'completed',
          strategy: 'mean-reversion',
          symbol: testSymbol,
          startedAt: new Date(Date.now() - 86400000).toISOString(),
          completedAt: new Date().toISOString(),
          result: {
            orderId: 'order-123',
            side: 'buy',
            quantity: 0.5,
            price: 30000.50,
            pnl: 150.25
          }
        }
      ];
      
      // Stub the database method
      tradeExecutionEngine.db.getExecutions = sinon.stub().resolves({
        data: mockHistory,
        total: 1
      });
      
      // Get execution history
      const result = await tradeExecutionEngine.getExecutionHistory(userId, filters);
      
      // Verify the result
      expect(result).to.have.property('data').that.is.an('array').with.lengthOf(1);
      expect(result).to.have.property('pagination');
      expect(result.pagination).to.have.property('total', 1);
      
      // Verify the database was called with the correct filters
      sinon.assert.calledWith(
        tradeExecutionEngine.db.getExecutions,
        userId,
        {
          status: ['completed', 'failed'],
          strategy: 'mean-reversion',
          symbol: testSymbol,
          limit: 10,
          offset: 0,
          startDate: undefined,
          endDate: undefined,
          sortBy: 'startedAt',
          sortOrder: 'desc'
        }
      );
    });
  });
});
