const { Kafka } = require('kafkajs');

class KafkaDistributor {
  constructor(options = {}) {
    this.logger = options.logger;
    this.config = {
      clientId: options.clientId || 'market-data-service',
      brokers: options.brokers || (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      topics: {
        marketData: options.marketDataTopic || 'market-data',
        priceAlerts: options.priceAlertsTopic || 'price-alerts',
        anomalies: options.anomaliesTopic || 'market-anomalies'
      }
    };
    
    this.kafka = null;
    this.producer = null;
    this.isConnected = false;
    this.messageBuffer = [];
    this.bufferSize = options.bufferSize || 1000;
    this.flushInterval = options.flushInterval || 1000; // 1 second
    this.compressionType = options.compression || 'gzip';
  }

  async initialize() {
    try {
      this.logger?.info('Initializing Kafka distributor...');
      
      this.kafka = new Kafka({
        clientId: this.config.clientId,
        brokers: this.config.brokers,
        retry: {
          initialRetryTime: 100,
          retries: 8
        },
        connectionTimeout: 3000,
        requestTimeout: 30000
      });

      this.producer = this.kafka.producer({
        maxInFlightRequests: 1,
        idempotent: true,
        transactionTimeout: 30000,
        compression: this.compressionType
      });

      await this.producer.connect();
      this.isConnected = true;
      
      // Start buffer flushing
      this.startBufferFlushing();
      
      this.logger?.info('Kafka distributor initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize Kafka distributor:', error);
      throw error;
    }
  }

  async disconnect() {
    try {
      this.logger?.info('Disconnecting Kafka distributor...');
      
      // Flush remaining messages
      await this.flushBuffer();
      
      // Stop buffer flushing
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }
      
      if (this.producer) {
        await this.producer.disconnect();
      }
      
      this.isConnected = false;
      this.logger?.info('Kafka distributor disconnected');
      
    } catch (error) {
      this.logger?.error('Error disconnecting Kafka distributor:', error);
      throw error;
    }
  }

  async distribute(dataArray) {
    if (!this.isConnected || !Array.isArray(dataArray) || dataArray.length === 0) {
      return;
    }

    try {
      // Add data to buffer
      for (const data of dataArray) {
        this.bufferMessage(data);
      }
      
      // Flush if buffer is full
      if (this.messageBuffer.length >= this.bufferSize) {
        await this.flushBuffer();
      }
      
    } catch (error) {
      this.logger?.error('Error distributing to Kafka:', error);
    }
  }

  bufferMessage(data) {
    const topic = this.getTopicForData(data);
    const key = this.getMessageKey(data);
    const value = this.formatMessage(data);
    
    this.messageBuffer.push({
      topic,
      key,
      value,
      timestamp: Date.now().toString(),
      headers: {
        'source': 'market-data-service',
        'exchange': data.exchange || 'unknown',
        'symbol': data.symbol || 'unknown',
        'dataType': data.dataType || 'unknown'
      }
    });
  }

  startBufferFlushing() {
    this.flushTimer = setInterval(async () => {
      if (this.messageBuffer.length > 0) {
        await this.flushBuffer();
      }
    }, this.flushInterval);
  }

  async flushBuffer() {
    if (this.messageBuffer.length === 0 || !this.isConnected) {
      return;
    }

    const messages = [...this.messageBuffer];
    this.messageBuffer = [];

    try {
      await this.producer.sendBatch({
        topicMessages: this.groupMessagesByTopic(messages)
      });
      
      this.logger?.debug(`Flushed ${messages.length} messages to Kafka`);
      
    } catch (error) {
      this.logger?.error('Error flushing messages to Kafka:', error);
      
      // Re-add messages to buffer on failure (with limit to prevent memory issues)
      if (this.messageBuffer.length < this.bufferSize) {
        this.messageBuffer.unshift(...messages.slice(0, this.bufferSize - this.messageBuffer.length));
      }
    }
  }

  groupMessagesByTopic(messages) {
    const topicMessages = {};
    
    for (const message of messages) {
      if (!topicMessages[message.topic]) {
        topicMessages[message.topic] = [];
      }
      
      topicMessages[message.topic].push({
        key: message.key,
        value: message.value,
        timestamp: message.timestamp,
        headers: message.headers
      });
    }
    
    return Object.entries(topicMessages).map(([topic, messages]) => ({
      topic,
      messages
    }));
  }

  getTopicForData(data) {
    // Route to different topics based on data type or conditions
    if (data.anomaly) {
      return this.config.topics.anomalies;
    }
    
    if (data.priceAnalytics && Math.abs(data.priceAnalytics.changePercent) > 5) {
      return this.config.topics.priceAlerts;
    }
    
    return this.config.topics.marketData;
  }

  getMessageKey(data) {
    // Use exchange-symbol as key for partitioning
    return `${data.exchange || 'unknown'}-${data.symbol || 'unknown'}`;
  }

  formatMessage(data) {
    return JSON.stringify({
      ...data,
      messageId: this.generateMessageId(),
      serviceTimestamp: Date.now()
    });
  }

  generateMessageId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  async sendPriceAlert(alertData) {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.producer.send({
        topic: this.config.topics.priceAlerts,
        messages: [{
          key: this.getMessageKey(alertData),
          value: JSON.stringify({
            ...alertData,
            alertType: 'price_movement',
            timestamp: Date.now()
          }),
          headers: {
            'source': 'market-data-service',
            'alertType': 'price_movement'
          }
        }]
      });
      
    } catch (error) {
      this.logger?.error('Error sending price alert to Kafka:', error);
    }
  }

  async sendAnomalyAlert(anomalyData) {
    if (!this.isConnected) {
      return;
    }

    try {
      await this.producer.send({
        topic: this.config.topics.anomalies,
        messages: [{
          key: this.getMessageKey(anomalyData),
          value: JSON.stringify({
            ...anomalyData,
            alertType: 'anomaly_detection',
            timestamp: Date.now()
          }),
          headers: {
            'source': 'market-data-service',
            'alertType': 'anomaly_detection'
          }
        }]
      });
      
    } catch (error) {
      this.logger?.error('Error sending anomaly alert to Kafka:', error);
    }
  }

  getStats() {
    return {
      isConnected: this.isConnected,
      bufferSize: this.messageBuffer.length,
      maxBufferSize: this.bufferSize,
      topics: this.config.topics
    };
  }

  async createTopics() {
    if (!this.kafka) {
      throw new Error('Kafka not initialized');
    }

    try {
      const admin = this.kafka.admin();
      await admin.connect();
      
      const topics = Object.values(this.config.topics).map(topic => ({
        topic,
        numPartitions: 10,
        replicationFactor: 3,
        configEntries: [
          { name: 'compression.type', value: 'gzip' },
          { name: 'retention.ms', value: '604800000' }, // 7 days
          { name: 'segment.ms', value: '86400000' } // 1 day
        ]
      }));
      
      await admin.createTopics({ topics });
      await admin.disconnect();
      
      this.logger?.info('Kafka topics created successfully');
      
    } catch (error) {
      this.logger?.error('Error creating Kafka topics:', error);
      throw error;
    }
  }
}

module.exports = KafkaDistributor;