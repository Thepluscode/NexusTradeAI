/**
 * Jest Configuration for Nexus Trade AI
 * Comprehensive test configuration for unit, integration, and performance tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Root directory for tests
  rootDir: '.',
  
  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/build/',
    '/.git/'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './services/strategy-engine/': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './services/risk-management/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './shared/libs/trading/': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  
  // Files to collect coverage from
  collectCoverageFrom: [
    'services/**/*.js',
    'shared/**/*.js',
    'automation-server.js',
    'trading-server.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/*.config.js',
    '!**/*.test.js',
    '!**/*.spec.js'
  ],
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/jest.setup.js'
  ],
  
  // Module paths
  modulePaths: [
    '<rootDir>',
    '<rootDir>/services',
    '<rootDir>/shared'
  ],
  
  // Module name mapping for aliases
  moduleNameMapping: {
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@shared/(.*)$': '<rootDir>/shared/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Test timeout
  testTimeout: 30000, // 30 seconds for integration tests
  
  // Verbose output
  verbose: true,
  
  // Clear mocks between tests
  clearMocks: true,
  
  // Restore mocks after each test
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Test projects for different types of tests
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/unit.setup.js']
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/integration.setup.js'],
      testTimeout: 60000 // Longer timeout for integration tests
    },
    {
      displayName: 'performance',
      testMatch: ['<rootDir>/tests/performance/**/*.test.js'],
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/performance.setup.js'],
      testTimeout: 120000 // Even longer timeout for performance tests
    }
  ],
  
  // Global variables
  globals: {
    'process.env.NODE_ENV': 'test',
    'process.env.LOG_LEVEL': 'error'
  },
  
  // Reporter configuration
  reporters: [
    'default',
    [
      'jest-html-reporters',
      {
        publicPath: './coverage/html-report',
        filename: 'test-report.html',
        expand: true,
        hideIcon: false,
        pageTitle: 'Nexus Trade AI Test Report'
      }
    ],
    [
      'jest-junit',
      {
        outputDirectory: './coverage',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ]
  ],
  
  // Watch mode configuration
  watchman: true,
  watchPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/logs/',
    '/.git/'
  ],
  
  // Notification configuration
  notify: true,
  notifyMode: 'failure-change',
  
  // Bail configuration
  bail: 0, // Don't bail on first failure
  
  // Max workers for parallel execution
  maxWorkers: '50%',
  
  // Cache configuration
  cache: true,
  cacheDirectory: '<rootDir>/.jest-cache',
  
  // Mock configuration
  mockPathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // Snapshot configuration
  snapshotSerializers: [],
  
  // Custom matchers
  setupFilesAfterEnv: [
    '<rootDir>/tests/setup/custom-matchers.js'
  ]
};
