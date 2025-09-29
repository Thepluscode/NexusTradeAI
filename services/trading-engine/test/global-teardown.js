/**
 * Global teardown for tests
 * This file runs once after all tests complete
 */

module.exports = async () => {
  try {
    // Stop MongoDB Memory Server if it was started
    if (global.__MONGOD__) {
      await global.__MONGOD__.stop();
      console.log('MongoDB Memory Server stopped');
    }
    
    // Clean up any other global resources here
    
    console.log('Test environment teardown complete');
  } catch (error) {
    console.error('Error during test teardown:', error);
    process.exit(1);
  }
};
