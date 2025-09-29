/**
 * Global setup for tests
 * This file runs once before all tests start
 */

const fs = require('fs');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const redisMock = require('redis-mock');

// Create a test database directory if it doesn't exist
const testDbDir = path.join(__dirname, 'test-db');
if (!fs.existsSync(testDbDir)) {
  fs.mkdirSync(testDbDir, { recursive: true });
}

// Global variables to be used in tests
global.__MONGOD__ = null;

module.exports = async () => {
  try {
    // Start MongoDB Memory Server
    global.__MONGOD__ = await MongoMemoryServer.create({
      instance: {
        dbPath: testDbDir,
        port: 27017,
        dbName: 'testdb',
      },
      binary: {
        version: '6.0.5',
      },
    });

    // Set MongoDB connection string as environment variable
    process.env.MONGO_URI = global.__MONGOD__.getUri();
    
    // Mock Redis client
    const redisClient = redisMock.createClient();
    redisClient.connect = jest.fn().mockResolvedValue('OK');
    redisClient.quit = jest.fn().mockResolvedValue('OK');
    
    // Mock Redis methods used in the application
    redisClient.get = jest.fn().mockResolvedValue(null);
    redisClient.set = jest.fn().mockResolvedValue('OK');
    redisClient.del = jest.fn().mockResolvedValue(1);
    redisClient.expire = jest.fn().mockResolvedValue(1);
    
    // Mock the Redis client creation
    jest.mock('redis', () => ({
      createClient: jest.fn(() => redisClient)
    }));
    
    // Mock other Redis clients if needed
    jest.mock('ioredis', () => {
      return jest.fn().mockImplementation(() => ({
        connect: jest.fn().mockResolvedValue('OK'),
        quit: jest.fn().mockResolvedValue('OK'),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue('OK'),
        del: jest.fn().mockResolvedValue(1),
        expire: jest.fn().mockResolvedValue(1),
        on: jest.fn().mockImplementation((event, callback) => {
          if (event === 'connect') callback();
          if (event === 'error') callback(new Error('Redis error'));
          return this;
        })
      }));
    });
    
    console.log('Test environment setup complete');
  } catch (error) {
    console.error('Error setting up test environment:', error);
    process.exit(1);
  }
};
