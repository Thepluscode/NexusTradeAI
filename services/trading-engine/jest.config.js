module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.integration.test.js'
  ],
  
  // Coverage configuration
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/index.js',
    '!src/**/__tests__/**',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],
  coverageReporters: [
    'text',
    'lcov',
    'clover',
    'json',
    'json-summary',
    'text-summary'
  ],
  coverageThreshold: null,
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/test/setup.js'],
  // Disable global setup/teardown for now as we're using mocks
  // globalSetup: '<rootDir>/test/global-setup.js',
  // globalTeardown: '<rootDir>/test/global-teardown.js',
  
  // Test configuration
  testTimeout: 15000, // 15 second timeout
  verbose: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/'
  ],
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleDirectories: ['node_modules', 'src'],
  
  // Transform configuration
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(my-esm-module|another-esm-module)/)',
  ],
  
  // Watch plugins - temporarily disabled due to dependency issues
  // watchPlugins: [
  //   'jest-watch-typeahead/filename',
  //   'jest-watch-typeahead/testname',
  // ],
  
  // Reporters - using default reporter only for now
  reporters: ['default'],
  
  // Test behavior
  clearMocks: true,
  resetModules: true,
  restoreMocks: true,
  
  // Coverage provider
  coverageProvider: 'v8',
  
  // Test results processing - disabled for now
  // testResultsProcessor: 'jest-sonar-reporter',
  
  // Watch mode configuration
  watchPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/.nyc_output/',
    '<rootDir>/coverage/',
    '<rootDir>/dist/'
  ]
};
