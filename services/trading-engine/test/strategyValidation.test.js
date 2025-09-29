console.log('=== strategyValidation.test.js is being loaded ===');
const { expect } = require('chai');
const sinon = require('sinon');
const { StrategyValidator } = require('../src/validation/strategyValidation');
const { createTestExecutionPayload } = require('./testHelpers');

console.log('=== Starting Strategy Validation tests ===');
describe('Strategy Validation', () => {
  let strategyValidator;
  
  beforeEach(() => {
    strategyValidator = new StrategyValidator();
  });
  
  afterEach(() => {
    sinon.restore();
  });
  
  describe('validateExecutionRequest', () => {
    it('should validate a valid execution request', () => {
      const payload = createTestExecutionPayload();
      const { error, value } = strategyValidator.validateExecutionRequest(payload);
      
      expect(error).to.be.undefined;
      expect(value).to.deep.equal(payload);
    });
    
    it('should return error for missing required fields', () => {
      const { error } = strategyValidator.validateExecutionRequest({});
      
      expect(error).to.exist;
      expect(error.details).to.be.an('array');
      expect(error.details.some(d => d.message.includes('strategy'))).to.be.true;
      expect(error.details.some(d => d.message.includes('symbol'))).to.be.true;
    });
    
    it('should validate timeframe enum values', () => {
      const payload = createTestExecutionPayload({ timeframe: 'invalid' });
      const { error } = strategyValidator.validateExecutionRequest(payload);
      
      expect(error).to.exist;
      expect(error.details[0].message).to.include('must be one of');
    });
    
    it('should validate risk parameters', () => {
      const payload = createTestExecutionPayload({
        riskParameters: {
          maxPositionSize: 0, // Invalid, must be >= 0.01
          maxDailyLoss: 0,    // Invalid, must be >= 0.1
          maxDrawdown: 0,     // Invalid, must be >= 0.1
          maxLeverage: 0      // Invalid, must be >= 1
        }
      });
      
      const { error } = strategyValidator.validateExecutionRequest(payload);
      
      expect(error).to.exist;
      const messages = error.details.map(d => d.message);
      
      expect(messages.some(m => m.includes('maxPositionSize') && m.includes('greater than or equal to 0.01'))).to.be.true;
      expect(messages.some(m => m.includes('maxDailyLoss') && m.includes('greater than or equal to 0.1'))).to.be.true;
      expect(messages.some(m => m.includes('maxDrawdown') && m.includes('greater than or equal to 0.1'))).to.be.true;
      expect(messages.some(m => m.includes('maxLeverage') && m.includes('greater than or equal to 1'))).to.be.true;
    });
  });
  
  describe('validateExecutionId', () => {
    it('should validate a valid UUID', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const { error, value } = strategyValidator.validateExecutionId(validUuid);
      
      expect(error).to.be.undefined;
      expect(value).to.equal(validUuid);
    });
    
    it('should return error for invalid UUID', () => {
      const { error } = strategyValidator.validateExecutionId('invalid-uuid');
      
      expect(error).to.exist;
      expect(error.details[0].message).to.include('must be a valid UUID');
    });
  });
  
  describe('validateHistoryQuery', () => {
    it('should validate a valid history query', () => {
      const query = {
        limit: 10,
        offset: 0,
        status: 'completed',
        strategy: 'mean-reversion',
        symbol: 'BTC-USD',
        startDate: '2023-01-01T00:00:00Z',
        endDate: '2023-12-31T23:59:59Z'
      };
      
      const { error, value } = strategyValidator.validateHistoryQuery(query);
      
      expect(error).to.be.undefined;
      expect(value).to.deep.equal({
        ...query,
        limit: 10,
        offset: 0,
        status: ['completed']
      });
    });
    
    it('should handle multiple status values', () => {
      const query = {
        status: 'completed,failed,cancelled'
      };
      
      const { value } = strategyValidator.validateHistoryQuery(query);
      
      expect(value.status).to.deep.equal(['completed', 'failed', 'cancelled']);
    });
    
    it('should validate date formats', () => {
      const query = {
        startDate: 'invalid-date',
        endDate: '2023-12-31T23:59:59Z'
      };
      
      const { error } = strategyValidator.validateHistoryQuery(query);
      
      expect(error).to.exist;
      expect(error.details[0].message).to.include('must be a valid ISO 8601 date');
    });
    
    it('should validate limit and offset ranges', () => {
      const query = {
        limit: 1001,  // Max is 1000
        offset: -1    // Min is 0
      };
      
      const { error } = strategyValidator.validateHistoryQuery(query);
      
      expect(error).to.exist;
      const messages = error.details.map(d => d.message);
      
      expect(messages.some(m => m.includes('limit') && m.includes('less than or equal to 1000'))).to.be.true;
      expect(messages.some(m => m.includes('offset') && m.includes('greater than or equal to 0'))).to.be.true;
    });
  });
  
  describe('validateStrategyParameters', () => {
    it('should validate strategy-specific parameters', () => {
      const strategy = 'mean-reversion';
      const parameters = {
        lookbackPeriod: 14,
        threshold: 2.0
      };
      
      const result = strategyValidator.validateStrategyParameters(strategy, parameters);
      
      expect(result.valid).to.be.true;
      expect(result.errors).to.be.an('array').that.is.empty;
    });
    
    it('should return errors for invalid parameters', () => {
      const strategy = 'mean-reversion';
      const parameters = {
        lookbackPeriod: 0,  // Invalid, must be > 0
        threshold: 0        // Invalid, must be > 0
      };
      
      const result = strategyValidator.validateStrategyParameters(strategy, parameters);
      
      expect(result.valid).to.be.false;
      expect(result.errors).to.be.an('array').with.lengthOf(2);
      expect(result.errors[0]).to.have.property('field');
      expect(result.errors[0]).to.have.property('message');
    });
    
    it('should handle unknown strategies', () => {
      const strategy = 'unknown-strategy';
      const parameters = { someParam: 'value' };
      
      const result = strategyValidator.validateStrategyParameters(strategy, parameters);
      
      expect(result.valid).to.be.false;
      expect(result.errors[0].message).to.include('Unknown strategy');
    });
  });
});
