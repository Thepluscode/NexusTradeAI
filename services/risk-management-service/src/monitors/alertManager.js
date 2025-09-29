// src/monitors/alertManager.js
const EventEmitter = require('events');
const Queue = require('bull');

class AlertManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.io = options.io;
    
    // Initialize alert queue
    this.alertQueue = new Queue('alert processing', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      }
    });
    
    // Alert configuration
    this.config = {
      maxAlertRate: 100,        // Max alerts per minute
      alertCooldown: 60000,     // 1 minute cooldown for duplicate alerts
      severityLevels: ['low', 'medium', 'high', 'critical'],
      channels: ['email', 'sms', 'webhook', 'websocket'],
      retryAttempts: 3,
      retryDelay: 5000
    };
    
    // Alert state management
    this.alertHistory = new Map();
    this.alertCooldowns = new Map();
    this.alertRateLimit = new Map();
    this.subscribedUsers = new Map();
  }

  async initialize() {
    try {
      this.logger?.info('Initializing AlertManager...');
      
      // Setup queue processors
      this.setupQueueProcessors();
      
      // Setup alert routing
      this.setupAlertRouting();
      
      this.logger?.info('AlertManager initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize AlertManager:', error);
      throw error;
    }
  }

  setupQueueProcessors() {
    // Process alerts
    this.alertQueue.process('send_alert', async (job) => {
      const { alert, channels, userId } = job.data;
      
      try {
        await this.processAlert(alert, channels, userId);
        return { success: true, alertId: alert.id };
      } catch (error) {
        this.logger?.error('Error processing alert:', error);
        throw error;
      }
    });
    
    // Process batch alerts
    this.alertQueue.process('send_batch_alerts', async (job) => {
      const { alerts, userId } = job.data;
      
      try {
        await this.processBatchAlerts(alerts, userId);
        return { success: true, processed: alerts.length };
      } catch (error) {
        this.logger?.error('Error processing batch alerts:', error);
        throw error;
      }
    });
  }

  setupAlertRouting() {
    // Listen for risk alerts from monitors
    this.on('risk_alert', async (alertData) => {
      await this.handleRiskAlert(alertData);
    });
    
    // Listen for system alerts
    this.on('system_alert', async (alertData) => {
      await this.handleSystemAlert(alertData);
    });
  }

  async createAlert(alertData) {
    try {
      const alert = {
        id: this.generateAlertId(),
        ...alertData,
        timestamp: new Date(),
        status: 'active'
      };
      
      // Validate alert
      if (!this.validateAlert(alert)) {
        throw new Error('Invalid alert data');
      }
      
      // Check rate limiting
      if (!this.checkRateLimit(alert.userId)) {
        this.logger?.warn(`Alert rate limit exceeded for user ${alert.userId}`);
        return null;
      }
      
      // Check for duplicate/cooldown
      if (this.isInCooldown(alert)) {
        this.logger?.debug(`Alert in cooldown: ${alert.type}`);
        return null;
      }
      
      // Store alert
      this.storeAlert(alert);
      
      // Determine delivery channels
      const channels = await this.determineChannels(alert);
      
      // Queue alert for processing
      await this.queueAlert(alert, channels);
      
      // Update metrics
      if (this.metrics?.alertCounter) {
        this.metrics.alertCounter.inc({
          alert_type: alert.type,
          severity: alert.severity,
          portfolio_id: alert.portfolioId || 'unknown'
        });
      }
      
      return alert;
      
    } catch (error) {
      this.logger?.error('Error creating alert:', error);
      throw error;
    }
  }

  async queueAlert(alert, channels) {
    const userId = alert.userId;
    
    // Add to processing queue
    await this.alertQueue.add('send_alert', {
      alert,
      channels,
      userId
    }, {
      priority: this.getSeverityPriority(alert.severity),
      delay: 0,
      attempts: this.config.retryAttempts,
      backoff: {
        type: 'exponential',
        delay: this.config.retryDelay
      }
    });
  }

  async processAlert(alert, channels, userId) {
    const results = [];
    
    for (const channel of channels) {
      try {
        const result = await this.sendAlertToChannel(alert, channel, userId);
        results.push({ channel, success: true, result });
      } catch (error) {
        this.logger?.error(`Failed to send alert via ${channel}:`, error);
        results.push({ channel, success: false, error: error.message });
      }
    }
    
    // Update alert status
    await this.updateAlertStatus(alert.id, {
      delivered: results.filter(r => r.success).length > 0,
      deliveryResults: results,
      deliveredAt: new Date()
    });
    
    return results;
  }

  async sendAlertToChannel(alert, channel, userId) {
    switch (channel) {
      case 'websocket':
        return this.sendWebSocketAlert(alert, userId);
      case 'email':
        return this.sendEmailAlert(alert, userId);
      case 'sms':
        return this.sendSMSAlert(alert, userId);
      case 'webhook':
        return this.sendWebhookAlert(alert, userId);
      default:
        throw new Error(`Unknown alert channel: ${channel}`);
    }
  }

  async sendWebSocketAlert(alert, userId) {
    if (this.io) {
      this.io.to(`alerts_${userId}`).emit('risk_alert', {
        alert,
        timestamp: new Date()
      });
      return { delivered: true, channel: 'websocket' };
    }
    throw new Error('WebSocket not available');
  }

  async sendEmailAlert(alert, userId) {
    // Email integration would be implemented here
    const userEmail = await this.getUserEmail(userId);
    const emailContent = this.generateEmailContent(alert);
    
    // Mock email service
    this.logger?.info(`Sending email alert to ${userEmail}:`, emailContent.subject);
    
    return {
      delivered: true,
      channel: 'email',
      recipient: userEmail,
      subject: emailContent.subject
    };
  }

  async sendSMSAlert(alert, userId) {
    // SMS integration would be implemented here
    const userPhone = await this.getUserPhone(userId);
    const smsContent = this.generateSMSContent(alert);
    
    // Mock SMS service
    this.logger?.info(`Sending SMS alert to ${userPhone}:`, smsContent);
    
    return {
      delivered: true,
      channel: 'sms',
      recipient: userPhone,
      message: smsContent
    };
  }

  async sendWebhookAlert(alert, userId) {
    // Webhook integration would be implemented here
    const webhookUrl = await this.getUserWebhook(userId);
    const payload = this.generateWebhookPayload(alert);
    
    // Mock webhook service
    this.logger?.info(`Sending webhook alert to ${webhookUrl}:`, payload);
    
    return {
      delivered: true,
      channel: 'webhook',
      url: webhookUrl,
      payload
    };
  }

  generateEmailContent(alert) {
    const subject = `Risk Alert: ${alert.type} - ${alert.severity.toUpperCase()}`;
    const body = `
      <h2>Risk Management Alert</h2>
      <p><strong>Alert Type:</strong> ${alert.type}</p>
      <p><strong>Severity:</strong> ${alert.severity}</p>
      <p><strong>Portfolio:</strong> ${alert.portfolioId}</p>
      <p><strong>Message:</strong> ${alert.message}</p>
      <p><strong>Timestamp:</strong> ${alert.timestamp}</p>
      ${alert.data ? `<p><strong>Details:</strong> ${JSON.stringify(alert.data, null, 2)}</p>` : ''}
    `;
    
    return { subject, body };
  }

  generateSMSContent(alert) {
    return `Risk Alert: ${alert.type} (${alert.severity}) - ${alert.message}`;
  }

  generateWebhookPayload(alert) {
    return {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      portfolioId: alert.portfolioId,
      message: alert.message,
      timestamp: alert.timestamp,
      data: alert.data
    };
  }

  async determineChannels(alert) {
    const userPreferences = await this.getUserAlertPreferences(alert.userId);
    const channels = [];
    
    // Default channels based on severity
    switch (alert.severity) {
      case 'critical':
        channels.push('websocket', 'email', 'sms');
        break;
      case 'high':
        channels.push('websocket', 'email');
        break;
      case 'medium':
        channels.push('websocket');
        break;
      case 'low':
        channels.push('websocket');
        break;
    }
    
    // Filter by user preferences
    return channels.filter(channel => 
      userPreferences.channels.includes(channel)
    );
  }

  validateAlert(alert) {
    const required = ['type', 'severity', 'message', 'userId'];
    return required.every(field => alert[field] !== undefined);
  }

  checkRateLimit(userId) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = `${userId}_${minute}`;
    
    const count = this.alertRateLimit.get(key) || 0;
    if (count >= this.config.maxAlertRate) {
      return false;
    }
    
    this.alertRateLimit.set(key, count + 1);
    
    // Cleanup old entries
    setTimeout(() => {
      this.alertRateLimit.delete(key);
    }, 60000);
    
    return true;
  }

  isInCooldown(alert) {
    const cooldownKey = `${alert.userId}_${alert.type}_${alert.portfolioId}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    
    if (!lastAlert) {
      this.alertCooldowns.set(cooldownKey, Date.now());
      return false;
    }
    
    const timeSinceLastAlert = Date.now() - lastAlert;
    if (timeSinceLastAlert < this.config.alertCooldown) {
      return true;
    }
    
    this.alertCooldowns.set(cooldownKey, Date.now());
    return false;
  }

  getSeverityPriority(severity) {
    const priorities = {
      'critical': 1,
      'high': 2,
      'medium': 3,
      'low': 4
    };
    return priorities[severity] || 4;
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  storeAlert(alert) {
    const userId = alert.userId;
    if (!this.alertHistory.has(userId)) {
      this.alertHistory.set(userId, []);
    }
    
    const userAlerts = this.alertHistory.get(userId);
    userAlerts.push(alert);
    
    // Keep only recent alerts
    if (userAlerts.length > 1000) {
      userAlerts.splice(0, userAlerts.length - 500);
    }
  }

  async updateAlertStatus(alertId, updates) {
    // Update alert status in storage
    for (const [userId, alerts] of this.alertHistory) {
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        Object.assign(alert, updates);
        break;
      }
    }
  }

  async handleRiskAlert(alertData) {
    const { portfolioId, userId, alerts } = alertData;
    
    for (const alertInfo of alerts) {
      await this.createAlert({
        ...alertInfo,
        portfolioId,
        userId,
        category: 'risk'
      });
    }
  }

  async handleSystemAlert(alertData) {
    await this.createAlert({
      ...alertData,
      category: 'system'
    });
  }

  // Mock methods - would integrate with actual user service
  async getUserEmail(userId) {
    const userEmails = {
      'user1': 'user1@example.com',
      'user2': 'user2@example.com'
    };
    return userEmails[userId] || 'admin@example.com';
  }

  async getUserPhone(userId) {
    const userPhones = {
      'user1': '+1234567890',
      'user2': '+1234567891'
    };
    return userPhones[userId] || '+1234567892';
  }

  async getUserWebhook(userId) {
    const webhooks = {
      'user1': 'https://webhook.example.com/user1',
      'user2': 'https://webhook.example.com/user2'
    };
    return webhooks[userId] || 'https://webhook.example.com/default';
  }

  async getUserAlertPreferences(userId) {
    return {
      channels: ['websocket', 'email', 'sms'],
      severityFilter: ['medium', 'high', 'critical'],
      quietHours: { start: '22:00', end: '08:00' }
    };
  }

  getAlertHistory(userId, limit = 100) {
    const userAlerts = this.alertHistory.get(userId) || [];
    return userAlerts.slice(-limit);
  }

  getAlertStats(userId) {
    const userAlerts = this.alertHistory.get(userId) || [];
    const stats = {
      total: userAlerts.length,
      bySeverity: {},
      byType: {},
      recent: userAlerts.filter(a => 
        Date.now() - new Date(a.timestamp).getTime() < 24 * 60 * 60 * 1000
      ).length
    };
    
    userAlerts.forEach(alert => {
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
    });
    
    return stats;
  }
}

module.exports = AlertManager;