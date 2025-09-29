/**
 * Kafka Client for NexusTradeAI
 * High-performance message streaming for trading applications
 */

const { Kafka, logLevel } = require('kafkajs');
const { v4: uuidv4 } = require('uuid');

class KafkaClient {
  constructor(config = {}) {
    this.config = {
      clientId: config.clientId || 'nexustrade-ai',
      brokers: config.brokers || [process.env.KAFKA_BROKERS || 'localhost:9092'],
      ssl: config.ssl || false,
      sasl: config.sasl || null,
      connectionTimeout: config.connectionTimeout || 3000,
      requestTimeout: config.requestTimeout || 30000,
      retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000,
        factor: 2,
        multiplier: 2,
        retryForever: false,
        ...config.retry
      },
      logLevel: config.logLevel || logLevel.INFO,
      ...config
    };

    this.kafka = new Kafka({
      clientId: this.config.clientId,
      brokers: this.config.brokers,
      ssl: this.config.ssl,
      sasl: this.config.sasl,
      connectionTimeout: this.config.connectionTimeout,
      requestTimeout: this.config.requestTimeout,
      retry: this.config.retry,
      logLevel: this.config.logLevel
    });

    this.producer = null;
    this.consumer = null;
    this.admin = null;
    this.isConnected = false;
    this.messageHandlers = new Map();
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      lastActivity: null
    };
  }

  /**
   * Initialize Kafka client
   */
  async initialize() {
    try {
      console.log('Initializing Kafka client...');

      // Create admin client for topic management
      this.admin = this.kafka.admin();
      await this.admin.connect();

      // Create producer
      this.producer = this.kafka.producer({
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 30000,
        // Performance optimizations for trading
        compression: 'gzip',
        batch: {
          size: 16384,
          lingerMs: 5
        }
      });

      await this.producer.connect();

      // Create consumer
      this.consumer = this.kafka.consumer({
        groupId: this.config.groupId || 'nexustrade-consumer-group',
        sessionTimeout: 30000,
        rebalanceTimeout: 60000,
        heartbeatInterval: 3000,
        maxBytesPerPartition: 1048576,
        minBytes: 1,
        maxBytes: 10485760,
        maxWaitTimeInMs: 5000,
        retry: {
          initialRetryTime: 100,
          retries: 8
        }
      });

      await this.consumer.connect();

      this.isConnected = true;
      console.log('Kafka client initialized successfully');

      // Set up error handlers
      this.setupErrorHandlers();

      return true;
    } catch (error) {
      console.error('Failed to initialize Kafka client:', error);
      throw error;
    }
  }

  /**
   * Publish message to topic
   */
  async publish(topic, message, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Kafka client not connected');
      }

      const messagePayload = {
        topic,
        messages: [{
          key: options.key || uuidv4(),
          value: JSON.stringify({
            ...message,
            timestamp: new Date().toISOString(),
            messageId: uuidv4(),
            source: this.config.clientId
          }),
          partition: options.partition,
          headers: {
            'content-type': 'application/json',
            'source': this.config.clientId,
            ...options.headers
          },
          timestamp: Date.now()
        }]
      };

      const result = await this.producer.send(messagePayload);

      this.metrics.messagesSent++;
      this.metrics.lastActivity = new Date();

      return {
        success: true,
        topic,
        partition: result[0].partition,
        offset: result[0].offset,
        messageId: messagePayload.messages[0].value.messageId
      };
    } catch (error) {
      this.metrics.errors++;
      console.error('Failed to publish message:', error);
      throw error;
    }
  }

  /**
   * Subscribe to topic with message handler
   */
  async subscribe(topic, handler, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('Kafka client not connected');
      }

      // Store handler for this topic
      this.messageHandlers.set(topic, handler);

      await this.consumer.subscribe({
        topic,
        fromBeginning: options.fromBeginning || false
      });

      console.log(`Subscribed to topic: ${topic}`);
    } catch (error) {
      console.error(`Failed to subscribe to topic ${topic}:`, error);
      throw error;
    }
  }
}

module.exports = KafkaClient;