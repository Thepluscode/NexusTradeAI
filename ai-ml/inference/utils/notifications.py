"""
Notification Service for NexusTradeAI

This module provides a notification service that can send alerts via multiple channels
(Slack, Email, etc.) when important events like data drift are detected.
"""

import logging
from typing import Dict, Any, Optional, List
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import json
import requests
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NotificationSeverity(Enum):
    """Severity levels for notifications."""
    DEBUG = 0
    INFO = 1
    WARNING = 2
    ERROR = 3
    CRITICAL = 4

class NotificationService:
    """
    Service for sending notifications via multiple channels.
    
    Supports:
    - Email
    - Slack
    - Webhooks
    - Logging
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize the notification service.
        
        Args:
            config: Configuration dictionary with notification settings
        """
        self.config = config or {}
        self.enabled = self.config.get('enabled', True)
        self.min_severity = self._parse_severity(self.config.get('min_severity', 'warning'))
        
        # Initialize channels
        self.channels = {}
        
        # Email
        if self.config.get('email', {}).get('enabled', False):
            self.channels['email'] = self._send_email
        
        # Slack
        if self.config.get('slack', {}).get('webhook_url'):
            self.channels['slack'] = self._send_slack_message
        
        # Webhook
        if self.config.get('webhook', {}).get('url'):
            self.channels['webhook'] = self._send_webhook
        
        # Always enable logging
        self.channels['log'] = self._log_message
    
    def _parse_severity(self, severity: str) -> NotificationSeverity:
        """Parse severity string to enum."""
        severity = severity.upper()
        try:
            return NotificationSeverity[severity]
        except KeyError:
            logger.warning(f"Invalid severity level: {severity}, defaulting to WARNING")
            return NotificationSeverity.WARNING
    
    def send_notification(self, 
                         message: Dict[str, Any], 
                         min_severity: str = None) -> bool:
        """
        Send a notification via all configured channels.
        
        Args:
            message: Dictionary containing notification details. Expected keys:
                - title: Short title/headline
                - message: Detailed message
                - severity: Severity level (debug, info, warning, error, critical)
                - details: Additional details (dict)
            min_severity: Minimum severity level to send the notification
            
        Returns:
            bool: True if notification was sent successfully to at least one channel
        """
        if not self.enabled:
            return False
        
        # Parse message
        title = message.get('title', 'Notification')
        content = message.get('message', '')
        severity = self._parse_severity(message.get('severity', 'info'))
        details = message.get('details', {})
        
        # Check minimum severity
        min_sev = self._parse_severity(min_severity) if min_severity else self.min_severity
        if severity.value < min_sev.value:
            return False
        
        # Prepare notification data
        notification = {
            'title': title,
            'message': content,
            'severity': severity.name.lower(),
            'timestamp': message.get('timestamp', self._get_timestamp()),
            'details': details
        }
        
        # Send via all channels
        success = False
        for channel_name, send_func in self.channels.items():
            try:
                channel_success = send_func(notification)
                if channel_success:
                    success = True
            except Exception as e:
                logger.error(f"Error sending notification via {channel_name}: {e}", 
                            exc_info=True)
        
        return success
    
    def _send_email(self, notification: Dict[str, Any]) -> bool:
        """Send notification via email."""
        if not self.config.get('email', {}).get('enabled', False):
            return False
        
        try:
            email_config = self.config['email']
            smtp_server = email_config.get('smtp_server', 'smtp.gmail.com')
            smtp_port = email_config.get('smtp_port', 587)
            sender_email = email_config.get('sender_email')
            sender_password = email_config.get('sender_password')
            recipients = email_config.get('recipients', [])
            
            if not sender_email or not sender_password or not recipients:
                logger.warning("Email configuration incomplete")
                return False
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = sender_email
            msg['To'] = ', '.join(recipients)
            msg['Subject'] = f"[{notification['severity'].upper()}] {notification['title']}"
            
            # Create email body
            body = f"""
            <h2>{notification['title']}</h2>
            <p><strong>Severity:</strong> {notification['severity'].upper()}</p>
            <p><strong>Time:</strong> {notification['timestamp']}</p>
            <hr>
            <p>{notification['message']}</p>
            """
            
            # Add details if present
            if notification['details']:
                body += "<h3>Details:</h3>"
                body += f"<pre>{json.dumps(notification['details'], indent=2)}</pre>"
            
            msg.attach(MIMEText(body, 'html'))
            
            # Send email
            with smtplib.SMTP(smtp_server, smtp_port) as server:
                server.starttls()
                server.login(sender_email, sender_password)
                server.send_message(msg)
            
            logger.info(f"Email notification sent to {', '.join(recipients)}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email notification: {e}")
            return False
    
    def _send_slack_message(self, notification: Dict[str, Any]) -> bool:
        """Send notification to Slack."""
        webhook_url = self.config.get('slack', {}).get('webhook_url')
        if not webhook_url:
            return False
        
        try:
            # Map severity to Slack message format
            severity = notification['severity'].upper()
            color = {
                'DEBUG': '#36A64F',    # Green
                'INFO': '#2B7BBA',     # Blue
                'WARNING': '#EBB424',  # Yellow
                'ERROR': '#D93F0B',    # Orange
                'CRITICAL': '#D40D12'  # Red
            }.get(severity, '#808080')  # Default to gray
            
            # Create Slack message
            slack_message = {
                'attachments': [
                    {
                        'fallback': f"[{severity}] {notification['title']}: {notification['message']}",
                        'color': color,
                        'title': notification['title'],
                        'text': notification['message'],
                        'fields': [
                            {
                                'title': 'Severity',
                                'value': severity,
                                'short': True
                            },
                            {
                                'title': 'Time',
                                'value': notification['timestamp'],
                                'short': True
                            }
                        ]
                    }
                ]
            }
            
            # Add details if present
            if notification['details']:
                slack_message['attachments'][0]['fields'].append({
                    'title': 'Details',
                    'value': f"```{json.dumps(notification['details'], indent=2)}```",
                    'short': False
                })
            
            # Send to Slack
            response = requests.post(
                webhook_url,
                data=json.dumps(slack_message),
                headers={'Content-Type': 'application/json'}
            )
            
            if response.status_code != 200:
                raise Exception(f"Slack API error: {response.status_code} - {response.text}")
            
            logger.info("Slack notification sent")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send Slack notification: {e}")
            return False
    
    def _send_webhook(self, notification: Dict[str, Any]) -> bool:
        """Send notification via webhook."""
        webhook_config = self.config.get('webhook', {})
        webhook_url = webhook_config.get('url')
        
        if not webhook_url:
            return False
        
        try:
            headers = webhook_config.get('headers', {})
            timeout = webhook_config.get('timeout', 10)
            
            # Add timestamp if not already in headers
            if 'timestamp' not in notification:
                notification['timestamp'] = self._get_timestamp()
            
            # Send webhook request
            response = requests.post(
                webhook_url,
                json=notification,
                headers=headers,
                timeout=timeout
            )
            
            if response.status_code >= 400:
                raise Exception(f"Webhook error: {response.status_code} - {response.text}")
            
            logger.info(f"Webhook notification sent to {webhook_url}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send webhook notification: {e}")
            return False
    
    def _log_message(self, notification: Dict[str, Any]) -> bool:
        """Log notification to the application log."""
        try:
            log_message = (
                f"[{notification['severity'].upper()}] {notification['title']}: "
                f"{notification['message']}"
            )
            
            if notification['details']:
                log_message += f"\nDetails: {json.dumps(notification['details'], indent=2)}"
            
            # Log with appropriate level
            log_level = notification['severity'].lower()
            if log_level == 'debug':
                logger.debug(log_message)
            elif log_level == 'info':
                logger.info(log_message)
            elif log_level == 'warning':
                logger.warning(log_message)
            elif log_level in ['error', 'critical']:
                logger.error(log_message)
            else:
                logger.info(log_message)  # Default to info
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to log notification: {e}")
            return False
    
    @staticmethod
    def _get_timestamp() -> str:
        """Get current timestamp in ISO format."""
        from datetime import datetime
        return datetime.utcnow().isoformat() + 'Z'


# Example usage
if __name__ == "__main__":
    # Example configuration
    config = {
        'enabled': True,
        'min_severity': 'info',  # debug, info, warning, error, critical
        'email': {
            'enabled': False,
            'smtp_server': 'smtp.example.com',
            'smtp_port': 587,
            'sender_email': 'alerts@example.com',
            'sender_password': 'your-password',
            'recipients': ['admin@example.com', 'team@example.com']
        },
        'slack': {
            'enabled': True,
            'webhook_url': 'https://hooks.slack.com/services/...'  # Replace with your webhook URL
        },
        'webhook': {
            'enabled': True,
            'url': 'https://example.com/api/notifications',
            'headers': {
                'Content-Type': 'application/json',
                'X-API-Key': 'your-api-key'
            },
            'timeout': 10
        }
    }
    
    # Initialize notification service
    notifier = NotificationService(config)
    
    # Send a test notification
    notifier.send_notification({
        'title': 'Test Notification',
        'message': 'This is a test notification from the NexusTradeAI monitoring system.',
        'severity': 'info',
        'details': {
            'component': 'monitoring',
            'status': 'operational',
            'timestamp': NotificationService._get_timestamp()
        }
    })
