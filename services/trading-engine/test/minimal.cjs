// Minimal test file with .cjs extension to bypass Babel

const { test, expect } = require('@jest/globals');

test('should pass a simple test', () => {
  console.log('Running minimal test...');
  expect(1 + 1).toBe(2);
});
