// Custom Jest configuration
module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/test/**/*.test.js',
    '**/test/**/*.test.cjs',
    '**/test/**/*.integration.test.js',
    '**/test/**/*.test.mjs'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/'
  ],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/index.js',
    '!src/**/__tests__/**',
    '!**/node_modules/**',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testTimeout: 15000,
  transform: {},
  
  // Module name mapper to handle module resolution for mocks
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^\\.\./risk/RiskManager$': '<rootDir>/src/__mocks__/risk/RiskManager.js',
    '^\\.\./analysis/MarketDataAnalyzer$': '<rootDir>/src/__mocks__/analysis/MarketDataAnalyzer.js',
    '^\\.\./indicators/TechnicalIndicators$': '<rootDir>/src/__mocks__/indicators/TechnicalIndicators.js',
    '^\\.\./validation/StrategyValidator$': '<rootDir>/src/__mocks__/validation/StrategyValidator.js',
  },
  
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,
  
  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    'src/**/*.js',
    '!**/node_modules/**',
    '!**/test/**',
    '!**/coverage/**',
    '!**/dist/**',
  ],
  
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  
  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'json',
    'text',
    'lcov',
    'clover'
  ],
  
  // Make calling deprecated APIs throw helpful error messages
  errorOnDeprecated: true,
  
  // A path to a module which exports an async function that is triggered once before all test suites
  // globalSetup: undefined,
  
  // A path to a module which exports an async function that is triggered once after all test suites
  // globalTeardown: undefined,
  
  // A set of global variables that need to be available in all test environments
  // globals: {},
  
  // The maximum amount of workers used to run your tests. Can be specified as % or a number. E.g. maxWorkers: 10% will use 10% of your CPU amount + 1 as the maximum worker number. maxWorkers: 2 will use a maximum of 2 workers.
  // maxWorkers: "50%",
  
  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources with a single module
  // moduleNameMapper: {},
  
  // An array of file extensions your modules use
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],
  
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    '<rootDir>'
  ],
  
  // The test environment that will be used for testing
  testEnvironment: 'node',
  
  // The glob patterns Jest uses to detect test files
  // testMatch: [
  //   '**/__tests__/**/*.[jt]s?(x)',
  //   '**/?(*.)+(spec|test).[tj]s?(x)'
  // ],
  
  // An array of regexp pattern strings that are matched against all test paths, matched tests are skipped
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // The regexp pattern or array of patterns that Jest uses to detect test files
  // testRegex: [],
  
  // This option allows the use of a custom results processor
  // testResultsProcessor: undefined,
  
  // This option allows use of a custom test runner
  // testRunner: 'jasmine2',
  
  // This option sets the URL for the jsdom environment. It is reflected in properties such as location.href
  // testURL: 'http://localhost',
  
  // Setting this value to 'fake' allows the use of fake timers for functions such as 'setTimeout'
  // timers: 'real',
  
  // A map from regular expressions to paths to transformers
  // transform: undefined,
  
  // An array of regexp pattern strings that are matched against all source file paths, matched files will skip transformation
  // transformIgnorePatterns: [
  //   '/node_modules/'
  // ],
  
  // An array of regexp pattern strings that are matched against all modules before the module loader will automatically return a mock for them
  // unmockedModulePathPatterns: undefined,
  
  // Indicates whether each individual test should be reported during the run
  verbose: true,
  
  // An array of regexp patterns that are matched against all source file paths before re-running tests in watch mode
  // watchPathIgnorePatterns: [],
  
  // Whether to use watchman for file crawling
  // watchman: true,
};
