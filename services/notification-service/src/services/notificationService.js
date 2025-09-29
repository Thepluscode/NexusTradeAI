// src/services/notificationService.js
const EventEmitter = require('events');
const Queue = require('bull');
const NotificationModel = require('../models/Notification');
const UserPreference = require('../models/UserPreference');

class NotificationService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.emailService = options.emailService;
    this.smsService = options.smsService;
    this.pushNotificationService = options.pushNotificationService;
    this.templateService = options.templateService;
    this.io = options.io;
    
    // Notification queue
    this.notificationQueue = new Queue('notification processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }
    });
    
    // Configuration
    this.config = {
      maxRetries: 3,
      retryDelay: 5000,
      batchSize: 100,
      rateLimits: {
        email: { max: 1000, window: 3600000 }, // 1000 emails per hour
        sms: { max: 100, window: 3600000 },    // 100 SMS per hour
        push: { max: 10000, window: 3600000 }  // 10000 push notifications per hour
      },
      priorities: {
        critical: 1,
        high: 2,
        medium: 3,
        low: 4
      }
    };
    
    // Rate limiting storage
    this.rateLimitCounters = new Map();
    
    // Performance tracking
    this.stats = {
      totalNotifications: 0,
      successfulNotifications: 0,
      failedNotifications: 0,
      avgProcessingTime: 0,
      notificationsByChannel: new Map()
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing NotificationService...');
      
      // Setup queue processors
      this.setupQueueProcessors();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Setup rate limit cleanup
      this.setupRateLimitCleanup();
      
      this.logger?.info('NotificationService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize NotificationService:', error);
      throw error;
    }
  }

  setupQueueProcessors() {
    // Single notification processor
    this.notificationQueue.process('send_notification', async (job) => {
      const { notification, options } = job.data;
      
      try {
        const result = await this.processNotification(notification, options);
        return result;
      } catch (error) {
        this.logger?.error('Error processing notification:', error);
        throw error;
      }
    });
    
    // Bulk notification processor
    this.notificationQueue.process('send_bulk_notifications', async (job) => {
      const { notifications, options } = job.data;
      
      try {
        const results = await this.processBulkNotifications(notifications, options);
        return results;
      } catch (error) {
        this.logger?.error('Error processing bulk notifications:', error);
        throw error;
      }
    });
  }

  setupEventListeners() {
    // Listen for trading events
    this.on('trade_executed', async (data) => {
      await this.handleTradeNotification(data);
    });
    
    // Listen for price alerts
    this.on('price_alert', async (data) => {
      await this.handlePriceAlert(data);
    });
    
    // Listen for risk alerts
    this.on('risk_alert', async (data) => {
      await this.handleRiskAlert(data);
    });
    
    // Listen for portfolio updates
    this.on('portfolio_update', async (data) => {
      await this.handlePortfolioUpdate(data);
    });
  }

  setupRateLimitCleanup() {
    // Clean up rate limit counters every hour
    setInterval(() => {
      this.cleanupRateLimitCounters();
    }, 3600000); // 1 hour
  }

  async sendNotification(notificationData, options = {}) {
    const startTime = process.hrtime.bigint();
    
    try {
      // Validate notification data
      this.validateNotificationData(notificationData);
      
      // Create notification record
      const notification = await this.createNotificationRecord(notificationData);
      
      // Get user preferences
      const userPreferences = await this.getUserPreferences(notificationData.userId);
      
      // Determine delivery channels
      const channels = this.determineDeliveryChannels(notificationData, userPreferences, options);
      
      // Check rate limits
      const rateLimitChecks = await this.checkRateLimits(notificationData.userId, channels);
      if (!rateLimitChecks.allowed) {
        throw new Error(`Rate limit exceeded for channels: ${rateLimitChecks.blockedChannels.join(', ')}`);
      }
      
      // Queue notification for processing
      await this.queueNotification(notification, channels, options);
      
      // Update metrics
      const processingTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.updateMetrics(notification, processingTime, 'queued');
      
      this.logger?.info(`Notification queued: ${notification.id}`, {
        userId: notification.userId,
        type: notification.type,
        channels: channels.map(c => c.type)
      });
      
      return {
        notificationId: notification.id,
        status: 'queued',
        channels: channels.map(c => c.type),
        estimatedDelivery: new Date(Date.now() + 30000) // 30 seconds estimate
      };
      
    } catch (error) {
      this.logger?.error('Error sending notification:', error);
      throw error;
    }
  }

  async sendBulkNotifications(notifications, options = {}) {
    try {
      // Validate all notifications
      notifications.forEach(notification => {
        this.validateNotificationData(notification);
      });
      
      // Group notifications by user for batching
      const notificationsByUser = this.groupNotificationsByUser(notifications);
      
      // Queue bulk processing
      await this.notificationQueue.add('send_bulk_notifications', {
        notifications: notificationsByUser,
        options
      }, {
        priority: this.config.priorities[options.priority] || this.config.priorities.medium,
        attempts: this.config.maxRetries,
        backoff: {
          type: 'exponential',
          delay: this.config.retryDelay
        }
      });
      
      this.logger?.info(`Bulk notifications queued: ${notifications.length} notifications`);
      
      return {
        status: 'queued',
        count: notifications.length,
        estimatedDelivery: new Date(Date.now() + 60000) // 1 minute estimate for bulk
      };
      
    } catch (error) {
      this.logger?.error('Error sending bulk notifications:', error);
      throw error;
    }
  }

  async processNotification(notification, options) {
    const startTime = Date.now();
    
    try {
      // Get user preferences
      const userPreferences = await this.getUserPreferences(notification.userId);
      
      // Determine delivery channels
      const channels = this.determineDeliveryChannels(notification, userPreferences, options);
      
      // Process each channel
      const deliveryResults = [];
      
      for (const channel of channels) {
        try {
          const result = await this.deliverNotification(notification, channel);
          deliveryResults.push(result);
          
          // Update rate limit counters
          this.updateRateLimitCounter(notification.userId, channel.type);
          
        } catch (error) {
          this.logger?.error(`Error delivering notification via ${channel.type}:`, error);
          deliveryResults.push({
            channel: channel.type,
            status: 'failed',
            error: error.message
          });
        }
      }
      
      // Update notification status
      const overallStatus = deliveryResults.some(r => r.status === 'sent') ? 'sent' : 'failed';
      await this.updateNotificationStatus(notification.id, overallStatus, deliveryResults);
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(notification, processingTime, overallStatus);
      
      // Send real-time update via WebSocket
      if (this.io && overallStatus === 'sent') {
        this.io.to(`user_${notification.userId}`).emit('notification_delivered', {
          notificationId: notification.id,
          type: notification.type,
          timestamp: new Date()
        });
      }
      
      return {
        notificationId: notification.id,
        status: overallStatus,
        deliveryResults,
        processingTime
      };
      
    } catch (error) {
      this.logger?.error('Error processing notification:', error);
      
      // Update notification as failed
      await this.updateNotificationStatus(notification.id, 'failed', [{
        error: error.message
      }]);
      
      throw error;
    }
  }

  async deliverNotification(notification, channel) {
    switch (channel.type) {
      case 'email':
        return await this.emailService.sendNotification(notification, channel.config);
      
      case 'sms':
        return await this.smsService.sendNotification(notification, channel.config);
      
      case 'push':
        return await this.pushNotificationService.sendNotification(notification, channel.config);
      
      case 'websocket':
        return await this.sendWebSocketNotification(notification, channel.config);
      
      default:
        throw new Error(`Unknown notification channel: ${channel.type}`);
    }
  }

  async sendWebSocketNotification(notification, config) {
    try {
      if (!this.io) {
        throw new Error('WebSocket server not available');
      }
      
      const room = `user_${notification.userId}`;
      
      this.io.to(room).emit('notification', {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        data: notification.data,
        timestamp: notification.createdAt
      });
      
      return {
        channel: 'websocket',
        status: 'sent',
        timestamp: new Date()
      };
      
    } catch (error) {
      throw new Error(`WebSocket delivery failed: ${error.message}`);
    }
  }

  async queueNotification(notification, channels, options) {
    await this.notificationQueue.add('send_notification', {
      notification,
      options: { ...options, channels }
    }, {
      priority: this.config.priorities[options.priority] || this.config.priorities.medium,
      delay: options.delay || 0,
      attempts: this.config.maxRetries,
      backoff: {
        type: 'exponential',
        delay: this.config.retryDelay
      }
    });
  }

  validateNotificationData(notification) {
    const required = ['userId', 'type', 'title', 'message'];
    
    for (const field of required) {
      if (!notification[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate notification type
    const validTypes = [
      'trade_execution',
      'price_alert',
      'risk_alert',
      'portfolio_update',
      'system_alert',
      'marketing',
      'security'
    ];
    
    if (!validTypes.includes(notification.type)) {
      throw new Error(`Invalid notification type: ${notification.type}`);
    }
  }

  async createNotificationRecord(notificationData) {
    const notification = new NotificationModel({
      id: require('uuid').v4(),
      ...notificationData,
      status: 'pending',
      createdAt: new Date()
    });
    
    await notification.save();
    
    return notification;
  }

  async getUserPreferences(userId) {
    try {
      let preferences = await UserPreference.findOne({ userId });
      
      if (!preferences) {
        // Create default preferences
        preferences = new UserPreference({
          userId,
          channels: {
            email: { enabled: true },
            sms: { enabled: false },
            push: { enabled: true },
            websocket: { enabled: true }
          },
          types: {
            trade_execution: { enabled: true, channels: ['email', 'websocket'] },
            price_alert: { enabled: true, channels: ['push', 'websocket'] },
            risk_alert: { enabled: true, channels: ['email', 'sms', 'push', 'websocket'] },
            portfolio_update: { enabled: true, channels: ['websocket'] },
            system_alert: { enabled: true, channels: ['email', 'websocket'] },
            marketing: { enabled: false, channels: [] },
            security: { enabled: true, channels: ['email', 'sms', 'websocket'] }
          },
          quietHours: {
            enabled: false,
            start: '22:00',
            end: '08:00',
            timezone: 'UTC'
          }
        });
        
        await preferences.save();
      }
      
      return preferences;
      
    } catch (error) {
      this.logger?.error(`Error getting user preferences for ${userId}:`, error);
      // Return default preferences
      return {
        channels: {
          email: { enabled: true },
          websocket: { enabled: true }
        }
      };
    }
  }

  determineDeliveryChannels(notification, userPreferences, options) {
    const channels = [];
    
    // Check if notification type is enabled
    const typePrefs = userPreferences.types[notification.type];
    if (!typePrefs || !typePrefs.enabled) {
      return channels; // No delivery if type is disabled
    }
    
    // Check quiet hours
    if (this.isInQuietHours(userPreferences.quietHours)) {
      // Only allow critical notifications during quiet hours
      if (notification.priority !== 'critical') {
        return channels;
      }
    }
    
    // Add enabled channels for this notification type
    const enabledChannels = typePrefs.channels || [];
    
    enabledChannels.forEach(channelType => {
      const channelPrefs = userPreferences.channels[channelType];
      if (channelPrefs && channelPrefs.enabled) {
        channels.push({
          type: channelType,
          config: channelPrefs
        });
      }
    });
    
    // Override with options if provided
    if (options.forceChannels) {
      return options.forceChannels.map(type => ({ type, config: {} }));
    }
    
    return channels;
  }

  isInQuietHours(quietHours) {
    if (!quietHours || !quietHours.enabled) {
      return false;
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    const startHour = parseInt(quietHours.start.split(':')[0]);
    const endHour = parseInt(quietHours.end.split(':')[0]);
    
    if (startHour < endHour) {
      return currentHour >= startHour && currentHour < endHour;
    } else {
      return currentHour >= startHour || currentHour < endHour;
    }
  }

  async checkRateLimits(userId, channels) {
    const result = {
      allowed: true,
      blockedChannels: []
    };
    
    for (const channel of channels) {
      const limit = this.config.rateLimits[channel.type];
      if (!limit) continue;
      
      const key = `${userId}_${channel.type}`;
      const count = this.rateLimitCounters.get(key) || 0;
      
      if (count >= limit.max) {
        result.allowed = false;
        result.blockedChannels.push(channel.type);
      }
    }
    
    return result;
  }

  updateRateLimitCounter(userId, channelType) {
    const key = `${userId}_${channelType}`;
    const current = this.rateLimitCounters.get(key) || 0;
    this.rateLimitCounters.set(key, current + 1);
  }

  cleanupRateLimitCounters() {
    this.rateLimitCounters.clear();
    this.logger?.info('Rate limit counters cleaned up');
  }

  async updateNotificationStatus(notificationId, status, deliveryResults) {
    await NotificationModel.findOneAndUpdate(
      { id: notificationId },
      {
        status,
        deliveryResults,
        deliveredAt: status === 'sent' ? new Date() : undefined,
        updatedAt: new Date()
      }
    );
  }

  updateMetrics(notification, processingTime, status) {
    this.stats.totalNotifications++;
    
    if (status === 'sent') {
      this.stats.successfulNotifications++;
    } else if (status === 'failed') {
      this.stats.failedNotifications++;
    }
    
    // Update average processing time
    const totalTime = this.stats.avgProcessingTime * (this.stats.totalNotifications - 1) + processingTime;
    this.stats.avgProcessingTime = totalTime / this.stats.totalNotifications;
    
    // Update Prometheus metrics
    if (this.metrics?.notificationCounter) {
      this.metrics.notificationCounter.inc({
        type: notification.type,
        channel: 'multiple',
        status
      });
    }
    
    if (this.metrics?.notificationLatency) {
      this.metrics.notificationLatency.observe(
        { type: notification.type, channel: 'multiple' },
        processingTime / 1000
      );
    }
  }

  groupNotificationsByUser(notifications) {
    const grouped = new Map();
    
    notifications.forEach(notification => {
      const userId = notification.userId;
      if (!grouped.has(userId)) {
        grouped.set(userId, []);
      }
      grouped.get(userId).push(notification);
    });
    
    return Object.fromEntries(grouped);
  }

  // Event handlers
  async handleTradeNotification(data) {
    const { userId, trade } = data;
    
    await this.sendNotification({
      userId,
      type: 'trade_execution',
      title: 'Trade Executed',
      message: `Your ${trade.side} order for ${trade.quantity} ${trade.symbol} has been executed at $${trade.price}`,
      data: trade,
      priority: 'high'
    });
  }

  async handlePriceAlert(data) {
    const { userId, alert } = data;
    
    await this.sendNotification({
      userId,
      type: 'price_alert',
      title: 'Price Alert',
      message: `${alert.symbol} has ${alert.direction} $${alert.price}`,
      data: alert,
      priority: 'medium'
    });
  }

  async handleRiskAlert(data) {
    const { userId, alert } = data;
    
    await this.sendNotification({
      userId,
      type: 'risk_alert',
      title: 'Risk Alert',
      message: alert.message,
      data: alert,
      priority: 'critical'
    });
  }

  async handlePortfolioUpdate(data) {
    const { userId, portfolio } = data;
    
    await this.sendNotification({
      userId,
      type: 'portfolio_update',
      title: 'Portfolio Update',
      message: `Your portfolio value is now $${portfolio.totalValue.toFixed(2)}`,
      data: portfolio,
      priority: 'low'
    });
  }

  // Public API methods
  async getNotificationHistory(userId, options = {}) {
    const query = { userId };
    
    if (options.type) {
      query.type = options.type;
    }
    
    if (options.status) {
      query.status = options.status;
    }
    
    const notifications = await NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 100);
    
    return notifications;
  }

  async updateUserPreferences(userId, preferences) {
    await UserPreference.findOneAndUpdate(
      { userId },
      preferences,
      { upsert: true, new: true }
    );
    
    this.logger?.info(`User preferences updated for ${userId}`);
  }

  getStats() {
    return {
      ...this.stats,
      queueStats: {
        waiting: this.notificationQueue.waiting,
        active: this.notificationQueue.active,
        completed: this.notificationQueue.completed,
        failed: this.notificationQueue.failed
      },
      rateLimitCounters: this.rateLimitCounters.size
    };
  }
}

module.exports = NotificationService;