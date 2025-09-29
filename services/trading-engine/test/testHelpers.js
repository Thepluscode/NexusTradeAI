/**
 * Test helper functions for the trading engine API tests
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const { expect } = require('chai');
const { v4: uuidv4 } = require('uuid');

// Default test user
const TEST_USER = {
  id: 'test-user-123',
  email: 'test@example.com',
  role: 'user'
};

/**
 * Generate a JWT token for testing
 * @param {Object} user - User object to encode in the token
 * @param {string} secret - JWT secret (defaults to test secret)
 * @returns {string} JWT token
 */
function generateAuthToken(user = TEST_USER, secret = 'test-secret') {
  return jwt.sign(user, secret, { expiresIn: '1h' });
}

/**
 * Create a test execution request payload
 * @param {Object} overrides - Properties to override in the default payload
 * @returns {Object} Test execution request payload
 */
function createTestExecutionPayload(overrides = {}) {
  const defaultPayload = {
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

  return { ...defaultPayload, ...overrides };
}

/**
 * Create a test execution response
 * @param {string} status - Execution status
 * @param {Object} overrides - Properties to override in the default response
 * @returns {Object} Test execution response
 */
function createTestExecutionResponse(status = 'completed', overrides = {}) {
  const executionId = uuidv4();
  const now = new Date().toISOString();
  
  const defaultResponse = {
    id: executionId,
    status,
    strategy: 'mean-reversion',
    symbol: 'BTC-USD',
    timeframe: '1d',
    startedAt: now,
    completedAt: status === 'pending' ? null : now,
    result: status === 'completed' ? {
      executed: true,
      orderId: `order_${Math.floor(Math.random() * 1000000000)}`,
      symbol: 'BTC-USD',
      side: 'BUY',
      quantity: 0.5,
      price: 30000.50,
      pnl: 150.25,
      fees: 4.50,
      timestamp: now
    } : null,
    error: status === 'failed' ? {
      reason: 'Insufficient funds',
      details: { availableBalance: 1000, requiredBalance: 1500 },
      code: 'INSUFFICIENT_FUNDS'
    } : null
  };

  return { ...defaultResponse, ...overrides };
}

/**
 * Create a test execution history response
 * @param {number} count - Number of executions to include
 * @param {string} status - Status of the executions
 * @returns {Object} Test execution history response
 */
function createTestExecutionHistory(count = 5, status = 'completed') {
  const executions = Array.from({ length: count }, (_, index) => 
    createTestExecutionResponse(status, { 
      id: uuidv4(),
      startedAt: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)).toISOString(),
      symbol: index % 2 === 0 ? 'BTC-USD' : 'ETH-USD',
      status: index % 3 === 0 ? 'completed' : index % 3 === 1 ? 'failed' : 'cancelled'
    })
  );

  return {
    data: executions,
    pagination: {
      limit: 10,
      offset: 0,
      total: count,
      hasMore: count > 10
    }
  };
}

/**
 * Helper to test error responses
 * @param {Object} t - Test context (this)
 * @param {Function} requestFn - Function that returns a supertest request
 * @param {number} expectedStatus - Expected HTTP status code
 * @param {string} expectedError - Expected error message
 * @param {string} expectedCode - Expected error code
 * @returns {Promise<void>}
 */
async function testErrorResponse(t, requestFn, expectedStatus, expectedError, expectedCode) {
  const response = await requestFn();
  
  expect(response.status).to.equal(expectedStatus);
  expect(response.body).to.have.property('success', false);
  
  if (expectedError) {
    expect(response.body).to.have.property('error').that.includes(expectedError);
  }
  
  if (expectedCode) {
    expect(response.body).to.have.property('code', expectedCode);
  }
}

module.exports = {
  TEST_USER,
  generateAuthToken,
  createTestExecutionPayload,
  createTestExecutionResponse,
  createTestExecutionHistory,
  testErrorResponse
};
