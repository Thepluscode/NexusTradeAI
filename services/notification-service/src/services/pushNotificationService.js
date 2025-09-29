// src/services/pushNotificationService.js
const admin = require('firebase-admin');

class PushNotificationService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Firebase configuration
    this.config = {
      serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
      databaseURL: process.env.FIREBASE_DATABASE_URL
    };
    
    this.initialized = false;
  }

  async initialize() {
    try {
      this.logger?.info('Initializing PushNotificationService...');
      
      if (!this.config.serviceAccountPath) {
        this.logger?.warn('Firebase service account not configured, push notifications will be disabled');
        return;
      }
      
      // Initialize Firebase Admin SDK
      const serviceAccount = require(this.config.serviceAccountPath);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: this.config.databaseURL
      });
      
      this.initialized = true;
      this.logger?.info('PushNotificationService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize PushNotificationService:', error);
      throw error;
    }
  }

  async sendNotification(notification, config = {}) {
    const startTime = Date.now();
    
    try {
      if (!this.initialized) {
        throw new Error('Push notification service not configured');
      }
      
      // Get user device tokens
      const deviceTokens = await this.getUserDeviceTokens(notification.userId);
      if (!deviceTokens || deviceTokens.length === 0) {
        throw new Error('No device tokens found for user');
      }
      
      // Generate push notification payload
      const payload = this.generatePushPayload(notification);
      
      // Send to multiple devices
      const results = await Promise.allSettled(
        deviceTokens.map(token => this.sendToDevice(token, payload))
      );
      
      // Process results
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(notification, processingTime, successful > 0 ? 'sent' : 'failed');
      
      this.logger?.info(`Push notification sent: ${notification.id}`, {
        successful,
        failed,
        totalDevices: deviceTokens.length
      });
      
      return {
        channel: 'push',
        status: successful > 0 ? 'sent' : 'failed',
        successful,
        failed,
        totalDevices: deviceTokens.length,
        timestamp: new Date()
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateMetrics(notification, processingTime, 'failed');
      
      this.logger?.error('Error sending push notification:', error);
      throw new Error(`Push notification delivery failed: ${error.message}`);
    }
  }

  async sendToDevice(deviceToken, payload) {
    try {
      const response = await admin.messaging().send({
        token: deviceToken,
        ...payload
      });
      
      return { success: true, messageId: response };
    } catch (error) {
      // Handle invalid tokens
      if (error.code === 'messaging/registration-token-not-registered' ||
          error.code === 'messaging/invalid-registration-token') {
        // Remove invalid token
        await this.removeInvalidDeviceToken(deviceToken);
      }
      
      throw error;
    }
  }

  generatePushPayload(notification) {
    const payload = {
      notification: {
        title: notification.title,
        body: notification.message
      },
      data: {
        notificationId: notification.id,
        type: notification.type,
        timestamp: new Date().toISOString()
      }
    };
    
    // Add custom data if present
    if (notification.data) {
      Object.keys(notification.data).forEach(key => {
        payload.data[key] = String(notification.data[key]);
      });
    }
    
    // Platform-specific configurations
    payload.android = {
      priority: notification.priority === 'critical' ? 'high' : 'normal',
      notification: {
        icon: 'ic_notification',
        color: '#1a365d',
        sound: 'default'
      }
    };
    
    payload.apns = {
      payload: {
        aps: {
          badge: 1,
          sound: 'default',
          alert: {
            title: notification.title,
            body: notification.message
          }
        }
      }
    };
    
    return payload;
  }

  updateMetrics(notification, processingTime, status) {
    if (this.metrics?.notificationCounter) {
      this.metrics.notificationCounter.inc({
        type: notification.type,
        channel: 'push',
        status
      });
    }
    
    if (this.metrics?.notificationLatency) {
      this.metrics.notificationLatency.observe(
        { type: notification.type, channel: 'push' },
        processingTime / 1000
      );
    }
  }

  // Helper methods - would integrate with user service
  async getUserDeviceTokens(userId) {
    // Mock implementation - would fetch from user service
    const mockTokens = {
      'user1': ['token1', 'token2'],
      'user2': ['token3']
    };
    return mockTokens[userId] || [];
  }

  async removeInvalidDeviceToken(token) {
    // Would remove invalid token from database
    this.logger?.info(`Removing invalid device token: ${token}`);
  }
}

module.exports = PushNotificationService;