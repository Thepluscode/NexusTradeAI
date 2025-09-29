// src/services/smsService.js
const twilio = require('twilio');

class SMSService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Twilio configuration
    this.config = {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER
    };
    
    this.client = null;
  }

  async initialize() {
    try {
      this.logger?.info('Initializing SMSService...');
      
      if (!this.config.accountSid || !this.config.authToken) {
        this.logger?.warn('Twilio credentials not configured, SMS service will be disabled');
        return;
      }
      
      // Initialize Twilio client
      this.client = twilio(this.config.accountSid, this.config.authToken);
      
      this.logger?.info('SMSService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize SMSService:', error);
      throw error;
    }
  }

  async sendNotification(notification, config = {}) {
    const startTime = Date.now();
    
    try {
      if (!this.client) {
        throw new Error('SMS service not configured');
      }
      
      // Get user phone number
      const phoneNumber = await this.getUserPhoneNumber(notification.userId);
      if (!phoneNumber) {
        throw new Error('User phone number not found');
      }
      
      // Generate SMS content
      const smsContent = this.generateSMSContent(notification);
      
      // Send SMS
      const message = await this.client.messages.create({
        body: smsContent,
        from: this.config.fromNumber,
        to: phoneNumber
      });
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(notification, processingTime, 'sent');
      
      this.logger?.info(`SMS sent successfully: ${notification.id}`, {
        to: phoneNumber,
        sid: message.sid
      });
      
      return {
        channel: 'sms',
        status: 'sent',
        messageSid: message.sid,
        recipient: phoneNumber,
        timestamp: new Date()
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateMetrics(notification, processingTime, 'failed');
      
      this.logger?.error('Error sending SMS:', error);
      throw new Error(`SMS delivery failed: ${error.message}`);
    }
  }

  generateSMSContent(notification) {
    // SMS has character limits, so keep it concise
    let content = `${notification.title}: ${notification.message}`;
    
    // Truncate if too long (SMS limit is 160 characters for single message)
    if (content.length > 160) {
      content = content.substring(0, 157) + '...';
    }
    
    return content;
  }

  updateMetrics(notification, processingTime, status) {
    if (this.metrics?.notificationCounter) {
      this.metrics.notificationCounter.inc({
        type: notification.type,
        channel: 'sms',
        status
      });
    }
    
    if (this.metrics?.notificationLatency) {
      this.metrics.notificationLatency.observe(
        { type: notification.type, channel: 'sms' },
        processingTime / 1000
      );
    }
  }

  // Helper methods - would integrate with user service
  async getUserPhoneNumber(userId) {
    // Mock implementation - would fetch from user service
    const mockPhones = {
      'user1': '+1234567890',
      'user2': '+1234567891'
    };
    return mockPhones[userId];
  }
}

module.exports = SMSService;