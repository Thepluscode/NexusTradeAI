// src/services/emailService.js
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const path = require('path');
const fs = require('fs').promises;

class EmailService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Email configuration
    this.config = {
      smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      },
      from: {
        name: process.env.FROM_NAME || 'Nexus Trade AI',
        email: process.env.FROM_EMAIL || 'noreply@nexustrade.ai'
      }
    };
    
    // Template cache
    this.templateCache = new Map();
    this.transporter = null;
  }

  async initialize() {
    try {
      this.logger?.info('Initializing EmailService...');
      
      // Create SMTP transporter
      this.transporter = nodemailer.createTransporter(this.config.smtp);
      
      // Verify SMTP connection
      await this.transporter.verify();
      
      // Load email templates
      await this.loadEmailTemplates();
      
      this.logger?.info('EmailService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize EmailService:', error);
      throw error;
    }
  }

  async loadEmailTemplates() {
    try {
      const templatesDir = path.join(__dirname, '../templates/email');
      const templateFiles = await fs.readdir(templatesDir);
      
      for (const file of templateFiles) {
        if (file.endsWith('.hbs')) {
          const templateName = path.basename(file, '.hbs');
          const templatePath = path.join(templatesDir, file);
          const templateContent = await fs.readFile(templatePath, 'utf8');
          
          this.templateCache.set(templateName, handlebars.compile(templateContent));
        }
      }
      
      this.logger?.info(`Loaded ${this.templateCache.size} email templates`);
    } catch (error) {
      this.logger?.error('Error loading email templates:', error);
    }
  }

  async sendNotification(notification, config = {}) {
    const startTime = Date.now();
    
    try {
      // Get user email
      const userEmail = await this.getUserEmail(notification.userId);
      if (!userEmail) {
        throw new Error('User email not found');
      }
      
      // Generate email content
      const emailContent = await this.generateEmailContent(notification);
      
      // Prepare email options
      const mailOptions = {
        from: `${this.config.from.name} <${this.config.from.email}>`,
        to: userEmail,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: emailContent.attachments || []
      };
      
      // Add custom headers
      if (notification.id) {
        mailOptions.headers = {
          'X-Notification-ID': notification.id,
          'X-Notification-Type': notification.type
        };
      }
      
      // Send email
      const result = await this.transporter.sendMail(mailOptions);
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(notification, processingTime, 'sent');
      
      this.logger?.info(`Email sent successfully: ${notification.id}`, {
        to: userEmail,
        messageId: result.messageId
      });
      
      return {
        channel: 'email',
        status: 'sent',
        messageId: result.messageId,
        recipient: userEmail,
        timestamp: new Date()
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.updateMetrics(notification, processingTime, 'failed');
      
      this.logger?.error('Error sending email:', error);
      throw new Error(`Email delivery failed: ${error.message}`);
    }
  }

  async generateEmailContent(notification) {
    try {
      // Get template for notification type
      const template = this.getTemplate(notification.type);
      
      if (template) {
        // Use template
        const context = {
          title: notification.title,
          message: notification.message,
          data: notification.data,
          user: await this.getUserInfo(notification.userId),
          timestamp: new Date(),
          year: new Date().getFullYear()
        };
        
        const html = template(context);
        const text = this.htmlToText(html);
        
        return {
          subject: notification.title,
          html,
          text
        };
      } else {
        // Use default template
        return this.generateDefaultEmailContent(notification);
      }
      
    } catch (error) {
      this.logger?.error('Error generating email content:', error);
      return this.generateDefaultEmailContent(notification);
    }
  }

  generateDefaultEmailContent(notification) {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${notification.title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1a365d; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f8f9fa; }
          .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
          .button { display: inline-block; padding: 10px 20px; background: #2d3748; color: white; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Nexus Trade AI</h1>
          </div>
          <div class="content">
            <h2>${notification.title}</h2>
            <p>${notification.message}</p>
            ${notification.data ? `<p><strong>Details:</strong> ${JSON.stringify(notification.data, null, 2)}</p>` : ''}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Nexus Trade AI. All rights reserved.</p>
            <p>You received this email because you have notifications enabled.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
      ${notification.title}
      
      ${notification.message}
      
      ${notification.data ? `Details: ${JSON.stringify(notification.data, null, 2)}` : ''}
      
      ---
      Nexus Trade AI
      ${new Date().getFullYear()}
    `;
    
    return {
      subject: notification.title,
      html,
      text
    };
  }

  getTemplate(notificationType) {
    return this.templateCache.get(notificationType) || this.templateCache.get('default');
  }

  htmlToText(html) {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  updateMetrics(notification, processingTime, status) {
    if (this.metrics?.notificationCounter) {
      this.metrics.notificationCounter.inc({
        type: notification.type,
        channel: 'email',
        status
      });
    }
    
    if (this.metrics?.notificationLatency) {
      this.metrics.notificationLatency.observe(
        { type: notification.type, channel: 'email' },
        processingTime / 1000
      );
    }
  }

  // Helper methods - would integrate with user service
  async getUserEmail(userId) {
    // Mock implementation - would fetch from user service
    const mockEmails = {
      'user1': 'user1@example.com',
      'user2': 'user2@example.com'
    };
    return mockEmails[userId] || 'test@example.com';
  }

  async getUserInfo(userId) {
    // Mock implementation - would fetch from user service
    return {
      id: userId,
      name: 'John Doe',
      email: await this.getUserEmail(userId)
    };
  }
}

module.exports = EmailService;