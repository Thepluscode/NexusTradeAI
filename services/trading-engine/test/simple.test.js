// Simple test file to verify Jest setup

describe('Simple Test Suite', () => {
  test('should pass a simple test', () => {
    console.log('Running simple test...');
    expect(1 + 1).toBe(2);
  });

  test('should handle async code', async () => {
    const result = await Promise.resolve('test');
    expect(result).toBe('test');
  });
});
