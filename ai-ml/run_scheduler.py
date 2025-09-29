#!/usr/bin/env python3
"""
NexusTradeAI Training Scheduler

This script initializes and runs the training scheduler with retraining trigger.
"""

import os
import sys
import signal
import logging
import argparse
from pathlib import Path
from typing import Dict, Any, Optional

# Add project root to Python path
project_root = str(Path(__file__).parent.absolute())
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from training.schedulers.training_scheduler import TrainingScheduler, TrainingJob, JobStatus
from training.schedulers.retraining_trigger import RetrainingTrigger, TriggerCondition
from training.schedulers.utils import load_config, setup_logging, ensure_directory_exists

# Global variables
scheduler = None
retraining_trigger = None

class SchedulerManager:
    """Manager for the training scheduler and retraining trigger"""
    
    def __init__(self, config_path: str):
        """Initialize the scheduler manager.
        
        Args:
            config_path: Path to the scheduler configuration file
        """
        self.config_path = config_path
        self.config = self._load_config()
        self.setup_logging()
        
        # Initialize components
        self.scheduler = TrainingScheduler(
            max_concurrent_jobs=self.config.get('max_concurrent_jobs', 3),
            workspace_path=self.config.get('workspace_path', './training_workspace'),
            mlflow_tracking_uri=self.config.get('mlflow_tracking_uri', 'http://localhost:5000')
        )
        
        # Initialize retraining trigger
        self.retraining_trigger = RetrainingTrigger(self.config)
        
        # Set up callbacks
        self._setup_callbacks()
        
        # Set up signal handlers
        self._setup_signal_handlers()
        
        self.logger = logging.getLogger(__name__)
    
    def _load_config(self) -> Dict[str, Any]:
        """Load and validate configuration."""
        config = load_config(self.config_path)
        
        # Set up logging as early as possible
        logging_config = config.get('logging', {})
        setup_logging(logging_config)
        
        self.logger = logging.getLogger(__name__)
        self.logger.info(f"Loaded configuration from {self.config_path}")
        
        return config
    
    def setup_logging(self):
        """Set up logging based on configuration."""
        logging_config = self.config.get('logging', {})
        setup_logging(logging_config)
    
    def _setup_callbacks(self):
        """Set up callbacks between scheduler and retraining trigger."""
        # Register retraining trigger callback for scheduler events
        self.scheduler.add_job_status_callback(self._handle_job_status_update)
        
        # Register scheduler callback for retraining trigger events
        self.retraining_trigger.add_trigger_callback(self._handle_retraining_trigger)
    
    def _setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown."""
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals."""
        self.logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.stop()
        sys.exit(0)
    
    def start(self):
        """Start the scheduler and retraining trigger."""
        self.logger.info("Starting NexusTradeAI Training Scheduler")
        
        # Set up workspace
        workspace_path = self.config.get('workspace_path', './training_workspace')
        ensure_directory_exists(workspace_path)
        
        # Set up model directories
        model_configs = self.config.get('model_configs', {})
        for model_name, model_config in model_configs.items():
            model_dir = os.path.join(workspace_path, 'models', model_name)
            ensure_directory_exists(model_dir)
        
        # Schedule recurring jobs
        self._schedule_recurring_jobs()
        
        # Start the scheduler
        self.scheduler.start()
        
        self.logger.info("Training Scheduler is running. Press Ctrl+C to exit.")
        
        # Keep the main thread alive
        try:
            while True:
                # Check for retraining triggers periodically
                self._check_retraining_triggers()
                
                # Sleep for a while to avoid busy waiting
                import time
                time.sleep(60)  # Check every minute
                
        except KeyboardInterrupt:
            self.logger.info("Shutting down...")
            self.stop()
    
    def stop(self):
        """Stop the scheduler and cleanup resources."""
        self.logger.info("Stopping NexusTradeAI Training Scheduler")
        if hasattr(self, 'scheduler') and self.scheduler:
            self.scheduler.stop()
        self.logger.info("Training Scheduler stopped")
    
    def _schedule_recurring_jobs(self):
        """Schedule recurring jobs based on configuration."""
        schedules = self.config.get('recurring_schedules', {})
        
        for schedule_name, schedule_config in schedules.items():
            if not schedule_config.get('enabled', True):
                self.logger.debug(f"Skipping disabled schedule: {schedule_name}")
                continue
            
            # Get job type and parameters
            job_type = self._get_job_type(schedule_name)
            
            # Get models to schedule (default to all if not specified)
            models = schedule_config.get('models', list(self.config.get('model_configs', {}).keys()))
            
            # Schedule each model
            for model_name in models:
                job_id = f"{schedule_name}_{model_name}"
                
                # Check if this job is already scheduled
                if self.scheduler.get_job(job_id):
                    self.logger.debug(f"Job {job_id} is already scheduled, skipping")
                    continue
                
                # Create job configuration
                job_config = self._create_job_config(model_name, job_type, schedule_config)
                
                # Schedule the job
                if 'time' in schedule_config:
                    # Daily at specific time
                    self.scheduler.schedule_daily_job(
                        job_id=job_id,
                        job_type=job_type,
                        time_str=schedule_config['time'],
                        model_name=model_name,
                        config=job_config,
                        priority=schedule_config.get('priority', 5)
                    )
                    self.logger.info(f"Scheduled daily job {job_id} at {schedule_config['time']}")
                    
                elif 'interval_hours' in schedule_config:
                    # At regular intervals
                    self.scheduler.schedule_interval_job(
                        job_id=job_id,
                        job_type=job_type,
                        interval_hours=schedule_config['interval_hours'],
                        model_name=model_name,
                        config=job_config,
                        priority=schedule_config.get('priority', 5)
                    )
                    self.logger.info(
                        f"Scheduled interval job {job_id} every "
                        f"{schedule_config['interval_hours']} hours"
                    )
                    
                elif 'day_of_week' in schedule_config:
                    # Weekly on a specific day
                    self.scheduler.schedule_weekly_job(
                        job_id=job_id,
                        job_type=job_type,
                        day_of_week=schedule_config['day_of_week'],
                        time_str=schedule_config.get('time', '00:00'),
                        model_name=model_name,
                        config=job_config,
                        priority=schedule_config.get('priority', 5)
                    )
                    self.logger.info(
                        f"Scheduled weekly job {job_id} on {schedule_config['day_of_week']}s "
                        f"at {schedule_config.get('time', '00:00')}"
                    )
                    
                elif 'day_of_month' in schedule_config:
                    # Monthly on a specific day
                    self.scheduler.schedule_monthly_job(
                        job_id=job_id,
                        job_type=job_type,
                        day_of_month=schedule_config['day_of_month'],
                        time_str=schedule_config.get('time', '00:00'),
                        model_name=model_name,
                        config=job_config,
                        priority=schedule_config.get('priority', 5)
                    )
                    self.logger.info(
                        f"Scheduled monthly job {job_id} on day {schedule_config['day_of_month']} "
                        f"at {schedule_config.get('time', '00:00')}"
                    )
    
    def _get_job_type(self, schedule_name: str) -> str:
        """Determine job type based on schedule name."""
        schedule_name = schedule_name.lower()
        
        if 'retrain' in schedule_name:
            return 'retrain'
        elif 'refresh' in schedule_name:
            return 'full_retrain'
        elif 'tune' in schedule_name or 'hyperparameter' in schedule_name:
            return 'hyperparameter_tuning'
        elif 'compare' in schedule_name or 'evaluate' in schedule_name:
            return 'model_comparison'
        elif 'drift' in schedule_name:
            return 'drift_check'
        else:
            return 'retrain'  # Default to retrain
    
    def _create_job_config(self, model_name: str, job_type: str, schedule_config: Dict) -> Dict:
        """Create job configuration based on model and job type."""
        model_config = self.config.get('model_configs', {}).get(model_name, {})
        
        # Start with base config
        config = {
            'model_name': model_name,
            'job_type': job_type,
            'config_path': model_config.get('config_path', ''),
            'resources': {
                'gpus': model_config.get('gpus', self.config.get('gpu_resources', 0)),
                'memory_gb': model_config.get('memory_gb', self.config.get('memory_limit_gb', 16)),
                'cpu_cores': model_config.get('cpu_cores', self.config.get('cpu_cores', 4))
            }
        }
        
        # Add job-specific configuration
        if job_type == 'hyperparameter_tuning':
            config.update({
                'n_trials': schedule_config.get('n_trials', 50),
                'timeout_hours': schedule_config.get('timeout_hours', 6),
                'metric': schedule_config.get('metric', 'validation_loss'),
                'direction': schedule_config.get('direction', 'minimize')
            })
        elif job_type == 'model_comparison':
            config.update({
                'compare_models': schedule_config.get('compare_models', ['lstm', 'transformer']),
                'metric': schedule_config.get('metric', 'directional_accuracy'),
                'promote_winner': schedule_config.get('promote_winner', True)
            })
        elif job_type == 'drift_check':
            config.update({
                'drift_threshold': schedule_config.get('drift_threshold', 0.1),
                'window_days': schedule_config.get('window_days', 7),
                'auto_retrain': schedule_config.get('auto_retrain', True)
            })
        
        return config
    
    def _check_retraining_triggers(self):
        """Check all models for retraining triggers."""
        models = self.config.get('model_configs', {}).keys()
        
        for model_name in models:
            try:
                trigger_result = self.retraining_trigger.check_triggers(model_name)
                
                if trigger_result.get('should_retrain'):
                    self.logger.info(
                        f"Retraining triggered for {model_name} due to: "
                        f"{[c['name'] for c in trigger_result['triggered_conditions']]}"
                    )
                    
                    # Create and submit retraining job
                    job_id = f"triggered_retrain_{model_name}_{int(time.time())}"
                    job_config = self._create_job_config(model_name, 'retrain', {})
                    
                    self.scheduler.submit_job(
                        job_id=job_id,
                        job_type='retrain',
                        model_name=model_name,
                        config=job_config,
                        priority=8  # Higher priority for triggered retraining
                    )
                    
            except Exception as e:
                self.logger.error(f"Error checking retraining triggers for {model_name}: {e}")
    
    def _handle_job_status_update(self, job_id: str, status: str, metadata: Dict = None):
        """Handle job status updates from the scheduler."""
        if not metadata:
            return
            
        model_name = metadata.get('model_name')
        job_type = metadata.get('job_type')
        
        if status == JobStatus.COMPLETED:
            self.logger.info(f"Job {job_id} completed successfully for {model_name}")
            
            # Update retraining trigger with new model information
            if job_type in ['retrain', 'full_retrain'] and model_name:
                self.retraining_trigger.update_model_info(model_name, {
                    'last_training_time': datetime.now().isoformat(),
                    'training_job_id': job_id,
                    'metrics': metadata.get('metrics', {})
                })
                
        elif status == JobStatus.FAILED:
            self.logger.error(f"Job {job_id} failed for {model_name}")
            
            # Handle job failure (e.g., send notification, retry, etc.)
            if job_type in ['retrain', 'full_retrain'] and model_name:
                self._handle_training_failure(job_id, model_name, metadata)
    
    def _handle_retraining_trigger(self, trigger_result: Dict):
        """Handle retraining trigger events."""
        model_name = trigger_result.get('model_name')
        triggered_conditions = trigger_result.get('triggered_conditions', [])
        
        if not model_name or not triggered_conditions:
            return
        
        self.logger.warning(
            f"Retraining triggered for {model_name} due to: "
            f"{[c['name'] for c in triggered_conditions]}"
        )
        
        # Submit a retraining job
        job_id = f"triggered_retrain_{model_name}_{int(time.time())}"
        job_config = self._create_job_config(model_name, 'retrain', {})
        
        self.scheduler.submit_job(
            job_id=job_id,
            job_type='retrain',
            model_name=model_name,
            config=job_config,
            priority=8  # Higher priority for triggered retraining
        )
    
    def _handle_training_failure(self, job_id: str, model_name: str, metadata: Dict):
        """Handle training job failures."""
        error_message = metadata.get('error', 'Unknown error')
        retry_count = metadata.get('retry_count', 0)
        max_retries = self.config.get('max_retry_attempts', 3)
        
        if retry_count < max_retries:
            # Retry the job with exponential backoff
            retry_delay_minutes = 5 * (2 ** retry_count)  # 5, 10, 20, ... minutes
            
            self.logger.info(
                f"Scheduling retry {retry_count + 1}/{max_retries} for {job_id} "
                f"in {retry_delay_minutes} minutes"
            )
            
            # Schedule retry
            self.scheduler.schedule_delayed_job(
                job_id=f"{job_id}_retry_{retry_count + 1}",
                job_type=metadata.get('job_type', 'retrain'),
                delay_minutes=retry_delay_minutes,
                model_name=model_name,
                config=metadata.get('config', {}),
                priority=9,  # High priority for retries
                metadata={
                    **metadata,
                    'retry_count': retry_count + 1,
                    'original_job_id': job_id
                }
            )
        else:
            # Max retries reached, send alert
            self.logger.error(
                f"Max retries reached for job {job_id}. "
                f"Manual intervention may be required. Error: {error_message}"
            )
            
            # Send notification
            self._send_alert(
                subject=f"Training Job Failed: {job_id}",
                message=(
                    f"Training job {job_id} for model {model_name} has failed after "
                    f"{max_retries} attempts.\n\n"
                    f"Error: {error_message}\n"
                    f"Job details: {metadata}"
                ),
                severity='critical'
            )
    
    def _send_alert(self, subject: str, message: str, severity: str = 'medium'):
        """Send an alert notification."""
        notifications = self.config.get('notifications', {})
        
        if not notifications.get('enabled', False):
            return
        
        # Email notification
        if notifications.get('email', {}).get('enabled', False):
            self._send_email_alert(subject, message, severity)
        
        # Slack notification
        if notifications.get('slack', {}).get('enabled', False):
            self._send_slack_alert(subject, message, severity)
    
    def _send_email_alert(self, subject: str, message: str, severity: str):
        """Send an email alert."""
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            email_config = self.config.get('notifications', {}).get('email', {})
            
            if not all(key in email_config for key in ['smtp_server', 'from_address', 'to_addresses']):
                self.logger.warning("Email notification enabled but required configuration is missing")
                return
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = email_config['from_address']
            msg['To'] = ', '.join(email_config['to_addresses'])
            msg['Subject'] = f"[{severity.upper()}] {subject}"
            
            # Add message body
            msg.attach(MIMEText(message, 'plain'))
            
            # Connect to SMTP server and send email
            with smtplib.SMTP(
                host=email_config['smtp_server'],
                port=email_config.get('smtp_port', 587)
            ) as server:
                if email_config.get('use_tls', True):
                    server.starttls()
                
                if 'username' in email_config and 'password' in email_config:
                    server.login(email_config['username'], email_config['password'])
                
                server.send_message(msg)
                
            self.logger.info(f"Email alert sent: {subject}")
            
        except Exception as e:
            self.logger.error(f"Failed to send email alert: {e}")
    
    def _send_slack_alert(self, subject: str, message: str, severity: str):
        """Send a Slack alert."""
        try:
            import requests
            
            slack_config = self.config.get('notifications', {}).get('slack', {})
            webhook_url = slack_config.get('webhook_url')
            
            if not webhook_url:
                self.logger.warning("Slack webhook URL not configured")
                return
            
            # Format message with severity
            emoji = {
                'critical': ':red_circle:',
                'high': ':large_orange_diamond:',
                'medium': ':large_yellow_circle:',
                'low': ':large_blue_circle:'
            }.get(severity.lower(), ':information_source:')
            
            payload = {
                'text': f"{emoji} *{severity.upper()}*: {subject}\n\n{message}",
                'username': 'NexusTradeAI Training Scheduler',
                'icon_emoji': ':robot_face:',
                'channel': slack_config.get('channel', '#alerts')
            }
            
            response = requests.post(webhook_url, json=payload)
            response.raise_for_status()
            
            self.logger.info(f"Slack alert sent: {subject}")
            
        except Exception as e:
            self.logger.error(f"Failed to send Slack alert: {e}")

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='NexusTradeAI Training Scheduler')
    parser.add_argument(
        '--config',
        type=str,
        default='config/scheduler_config.yaml',
        help='Path to scheduler configuration file'
    )
    parser.add_argument(
        '--log-level',
        type=str,
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
        default='INFO',
        help='Logging level'
    )
    
    return parser.parse_args()

def main():
    """Main entry point for the training scheduler."""
    # Parse command line arguments
    args = parse_args()
    
    # Set up basic logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    logger = logging.getLogger(__name__)
    
    try:
        # Initialize and start the scheduler
        scheduler_manager = SchedulerManager(args.config)
        scheduler_manager.start()
        
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.exception(f"Fatal error: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    import time
    sys.exit(main())
