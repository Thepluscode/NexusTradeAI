"""
Training Scheduler for NexusTradeAI

This module implements an advanced training scheduler for managing ML model training jobs
with support for dependencies, priorities, and resource management.
"""

import asyncio
import schedule
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
import yaml
import json
import subprocess
import threading
import queue
from dataclasses import dataclass
from enum import Enum
import mlflow

class JobStatus(Enum):
    """Status of a training job"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class TrainingJob:
    """Training job configuration and state"""
    job_id: str
    job_type: str
    model_name: str
    config_path: str
    priority: int
    scheduled_time: datetime
    dependencies: List[str]
    retry_count: int = 0
    max_retries: int = 3
    status: JobStatus = JobStatus.PENDING
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    error_message: Optional[str] = None
    output_path: Optional[str] = None

class TrainingScheduler:
    """
    Advanced training scheduler for ML models with dependency management
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        Initialize training scheduler
        
        Args:
            config: Scheduler configuration
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Job management
        self.jobs: Dict[str, TrainingJob] = {}
        self.job_queue = queue.PriorityQueue()
        self.running_jobs: Dict[str, subprocess.Popen] = {}
        
        # Scheduler settings
        self.max_concurrent_jobs = config.get('max_concurrent_jobs', 3)
        self.check_interval = config.get('check_interval_seconds', 60)
        self.cleanup_interval = config.get('cleanup_interval_hours', 24)
        
        # Resource management
        self.gpu_resources = config.get('gpu_resources', 1)
        self.memory_limit_gb = config.get('memory_limit_gb', 16)
        self.cpu_cores = config.get('cpu_cores', 4)
        
        # Notification settings
        self.notification_config = config.get('notifications', {})
        
        # Job execution settings
        self.job_timeout = config.get('job_timeout_hours', 12)
        self.workspace_path = config.get('workspace_path', './training_workspace')
        
        # MLflow tracking
        self.mlflow_tracking_uri = config.get('mlflow_tracking_uri', 'http://localhost:5000')
        mlflow.set_tracking_uri(self.mlflow_tracking_uri)
        
        # Thread management
        self.scheduler_running = False
        self.scheduler_thread = None
        
    def start_scheduler(self):
        """Start the training scheduler"""
        self.logger.info("Starting training scheduler...")
        self.scheduler_running = True
        
        # Setup workspace
        self._setup_workspace()
        
        # Schedule recurring tasks
        self.setup_recurring_schedules()
        
        # Start scheduler thread
        self.scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
        self.scheduler_thread.start()
        
        self.logger.info("Training scheduler started")
    
    def stop_scheduler(self):
        """Stop the training scheduler"""
        self.logger.info("Stopping training scheduler...")
        self.scheduler_running = False
        
        # Cancel running jobs
        for job_id in list(self.running_jobs.keys()):
            self.cancel_job(job_id)
        
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=10)
        
        self.logger.info("Training scheduler stopped")
    
    def _setup_workspace(self):
        """Set up the workspace directory structure"""
        os.makedirs(self.workspace_path, exist_ok=True)
        os.makedirs(os.path.join(self.workspace_path, 'logs'), exist_ok=True)
        os.makedirs(os.path.join(self.workspace_path, 'configs'), exist_ok=True)
        os.makedirs(os.path.join(self.workspace_path, 'models'), exist_ok=True)
    
    def setup_recurring_schedules(self):
        """Setup recurring training schedules"""
        schedules_config = self.config.get('recurring_schedules', {})
        
        # Daily retraining
        if schedules_config.get('daily_retrain', {}).get('enabled', False):
            daily_config = schedules_config['daily_retrain']
            schedule.every().day.at(daily_config.get('time', '02:00')).do(
                self.schedule_daily_retrain
            )
        
        # Weekly model refresh
        if schedules_config.get('weekly_refresh', {}).get('enabled', False):
            weekly_config = schedules_config['weekly_refresh']
            schedule.every().week.do(self.schedule_weekly_refresh)
        
        # Monthly model comparison
        if schedules_config.get('monthly_comparison', {}).get('enabled', False):
            schedule.every().month.do(self.schedule_monthly_comparison)
        
        # Data drift checks
        if schedules_config.get('drift_check', {}).get('enabled', False):
            drift_config = schedules_config['drift_check']
            interval = drift_config.get('interval_hours', 6)
            schedule.every(interval).hours.do(self.schedule_drift_check)
    
    def schedule_job(self, job: TrainingJob) -> str:
        """
        Schedule a training job
        
        Args:
            job: Training job to schedule
            
        Returns:
            Job ID
        """
        self.logger.info(f"Scheduling job: {job.job_id} ({job.job_type})")
        
        # Validate job configuration
        if not self.validate_job(job):
            raise ValueError(f"Invalid job configuration: {job.job_id}")
        
        # Add to jobs registry
        self.jobs[job.job_id] = job
        
        # Add to queue with priority
        priority = -job.priority  # Negative for high priority first
        self.job_queue.put((priority, job.scheduled_time.timestamp(), job.job_id))
        
        self.logger.info(f"Job {job.job_id} scheduled for {job.scheduled_time}")
        
        return job.job_id
    
    def schedule_daily_retrain(self):
        """Schedule daily retraining jobs"""
        self.logger.info("Scheduling daily retraining jobs")
        
        daily_config = self.config.get('recurring_schedules', {}).get('daily_retrain', {})
        models = daily_config.get('models', ['lstm', 'transformer'])
        
        base_time = datetime.now().replace(hour=2, minute=0, second=0, microsecond=0) + timedelta(days=1)
        
        for i, model_name in enumerate(models):
            job = TrainingJob(
                job_id=f"daily_retrain_{model_name}_{datetime.now().strftime('%Y%m%d')}",
                job_type='retrain',
                model_name=model_name,
                config_path=f'configs/{model_name}_retrain_config.yaml',
                priority=5,  # Medium priority
                scheduled_time=base_time + timedelta(minutes=i*30),  # Stagger jobs
                dependencies=[]
            )
            
            self.schedule_job(job)
    
    def schedule_weekly_refresh(self):
        """Schedule weekly model refresh"""
        self.logger.info("Scheduling weekly model refresh")
        
        job = TrainingJob(
            job_id=f"weekly_refresh_{datetime.now().strftime('%Y%m%d')}",
            job_type='full_retrain',
            model_name='ensemble',
            config_path='configs/weekly_refresh_config.yaml',
            priority=8,  # High priority
            scheduled_time=datetime.now() + timedelta(hours=1),
            dependencies=[]
        )
        
        self.schedule_job(job)
    
    def schedule_monthly_comparison(self):
        """Schedule monthly model comparison"""
        self.logger.info("Scheduling monthly model comparison")
        
        job = TrainingJob(
            job_id=f"monthly_comparison_{datetime.now().strftime('%Y%m%d')}",
            job_type='model_comparison',
            model_name='all',
            config_path='configs/model_comparison_config.yaml',
            priority=3,  # Low priority
            scheduled_time=datetime.now() + timedelta(hours=2),
            dependencies=[]
        )
        
        self.schedule_job(job)
    
    def schedule_drift_check(self):
        """Schedule data drift check"""
        job = TrainingJob(
            job_id=f"drift_check_{datetime.now().strftime('%Y%m%d_%H%M')}",
            job_type='drift_check',
            model_name='all',
            config_path='configs/drift_check_config.yaml',
            priority=6,  # Medium-high priority
            scheduled_time=datetime.now() + timedelta(minutes=5),
            dependencies=[]
        )
        
        self.schedule_job(job)
    
    def cancel_job(self, job_id: str) -> bool:
        """
        Cancel a scheduled or running job
        
        Args:
            job_id: ID of job to cancel
            
        Returns:
            Success status
        """
        if job_id not in self.jobs:
            self.logger.warning(f"Job {job_id} not found")
            return False
        
        job = self.jobs[job_id]
        
        if job.status == JobStatus.RUNNING:
            # Cancel running job
            if job_id in self.running_jobs:
                process = self.running_jobs[job_id]
                try:
                    process.terminate()
                    process.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    process.kill()
                except:
                    pass
                
                del self.running_jobs[job_id]
            
            job.status = JobStatus.CANCELLED
            job.end_time = datetime.now()
            
        elif job.status == JobStatus.PENDING:
            job.status = JobStatus.CANCELLED
        
        self.logger.info(f"Job {job_id} cancelled")
        return True
    
    def get_job_status(self, job_id: str) -> Optional[TrainingJob]:
        """Get job status"""
        return self.jobs.get(job_id)
    
    def list_jobs(self, status_filter: Optional[JobStatus] = None) -> List[TrainingJob]:
        """List jobs with optional status filter"""
        jobs = list(self.jobs.values())
        
        if status_filter:
            jobs = [job for job in jobs if job.status == status_filter]
        
        return sorted(jobs, key=lambda x: x.scheduled_time, reverse=True)
    
    def _scheduler_loop(self):
        """Main scheduler loop"""
        while self.scheduler_running:
            try:
                # Run scheduled tasks
                schedule.run_pending()
                
                # Process job queue
                self._process_job_queue()
                
                # Check running jobs
                self._check_running_jobs()
                
                # Cleanup old jobs
                self._cleanup_old_jobs()
                
                time.sleep(self.check_interval)
                
            except Exception as e:
                self.logger.error(f"Error in scheduler loop: {e}")
                time.sleep(60)  # Wait longer on error
    
    def _process_job_queue(self):
        """Process pending jobs in queue"""
        current_time = datetime.now()
        
        # Check if we can start more jobs
        if len(self.running_jobs) >= self.max_concurrent_jobs:
            return
        
        # Get next job from queue
        try:
            while not self.job_queue.empty() and len(self.running_jobs) < self.max_concurrent_jobs:
                priority, scheduled_timestamp, job_id = self.job_queue.get_nowait()
                
                if job_id not in self.jobs:
                    continue  # Job was cancelled or removed
                
                job = self.jobs[job_id]
                
                # Check if job time has arrived
                if job.scheduled_time > current_time:
                    # Put back in queue
                    self.job_queue.put((priority, scheduled_timestamp, job_id))
                    break
                
                # Check dependencies
                if not self._check_dependencies(job):
                    # Reschedule for later
                    job.scheduled_time = current_time + timedelta(minutes=10)
                    self.job_queue.put((priority, job.scheduled_time.timestamp(), job_id))
                    continue
                
                # Start the job
                if self._start_job(job):
                    self.logger.info(f"Started job: {job_id}")
                else:
                    self.logger.error(f"Failed to start job: {job_id}")
                    job.status = JobStatus.FAILED
                    job.end_time = current_time
                    job.error_message = "Failed to start job"
        
        except queue.Empty:
            pass
    
    def _check_dependencies(self, job: TrainingJob) -> bool:
        """Check if job dependencies are satisfied"""
        for dep_id in job.dependencies:
            if dep_id in self.jobs:
                dep_job = self.jobs[dep_id]
                if dep_job.status != JobStatus.COMPLETED:
                    return False
            else:
                # Dependency not found
                self.logger.warning(f"Dependency {dep_id} not found for job {job.job_id}")
                return False
        
        return True
    
    def _start_job(self, job: TrainingJob) -> bool:
        """Start a training job"""
        try:
            job.status = JobStatus.RUNNING
            job.start_time = datetime.now()
            
            # Prepare job environment
            job_env = self._prepare_job_environment(job)
            
            # Build command
            command = self._build_job_command(job)
            
            # Start process
            process = subprocess.Popen(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=job_env,
                cwd=self.workspace_path
            )
            
            # Store process reference
            self.running_jobs[job.job_id] = process
            
            # Start monitoring thread
            monitor_thread = threading.Thread(
                target=self._monitor_job,
                args=(job, process),
                daemon=True
            )
            monitor_thread.start()
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error starting job {job.job_id}: {e}")
            job.status = JobStatus.FAILED
            job.end_time = datetime.now()
            job.error_message = str(e)
            return False
    
    def _prepare_job_environment(self, job: TrainingJob) -> Dict[str, str]:
        """Prepare environment variables for job"""
        import os
        
        env = os.environ.copy()
        
        # MLflow settings
        env['MLFLOW_TRACKING_URI'] = self.mlflow_tracking_uri
        env['MLFLOW_EXPERIMENT_NAME'] = f"scheduled_training_{job.model_name}"
        
        # Job-specific settings
        env['JOB_ID'] = job.job_id
        env['MODEL_NAME'] = job.model_name
        env['JOB_TYPE'] = job.job_type
        env['CONFIG_PATH'] = job.config_path
        
        # Resource limits
        env['OMP_NUM_THREADS'] = str(self.cpu_cores)
        env['CUDA_VISIBLE_DEVICES'] = '0' if self.gpu_resources > 0 else ''
        
        return env
    
    def _build_job_command(self, job: TrainingJob) -> List[str]:
        """Build command to execute job"""
        
        if job.job_type == 'retrain':
            return [
                'python', '-m', 'ai_ml.training.pipelines.model_training_pipeline',
                '--config', job.config_path,
                '--model', job.model_name,
                '--job-id', job.job_id
            ]
        
        elif job.job_type == 'full_retrain':
            return [
                'python', '-m', 'ai_ml.training.pipelines.model_training_pipeline',
                '--config', job.config_path,
                '--model', job.model_name,
                '--full-retrain',
                '--job-id', job.job_id
            ]
        
        elif job.job_type == 'hyperparameter_tuning':
            return [
                'python', '-m', 'ai_ml.training.pipelines.hyperparameter_tuning',
                '--config', job.config_path,
                '--model', job.model_name,
                '--job-id', job.job_id
            ]
        
        elif job.job_type == 'model_comparison':
            return [
                'python', '-m', 'ai_ml.training.pipelines.cross_validation',
                '--config', job.config_path,
                '--compare-all',
                '--job-id', job.job_id
            ]
        
        elif job.job_type == 'drift_check':
            return [
                'python', '-m', 'ai_ml.inference.monitoring.drift_detector',
                '--config', job.config_path,
                '--job-id', job.job_id
            ]
        
        else:
            raise ValueError(f"Unknown job type: {job.job_type}")
    
    def _monitor_job(self, job: TrainingJob, process: subprocess.Popen):
        """Monitor job execution"""
        try:
            # Set timeout
            timeout = self.job_timeout * 3600  # Convert to seconds
            
            # Wait for completion with timeout
            try:
                stdout, stderr = process.communicate(timeout=timeout)
                return_code = process.returncode
                
                # Log output
                output_file = f"{self.workspace_path}/logs/{job.job_id}.log"
                with open(output_file, 'w') as f:
                    f.write(stdout.decode('utf-8') if stdout else '')
                    if stderr:
                        f.write('\n--- STDERR ---\n')
                        f.write(stderr.decode('utf-8'))
                
                job.output_path = output_file
                
                # Update job status
                if return_code == 0:
                    job.status = JobStatus.COMPLETED
                    self.logger.info(f"Job {job.job_id} completed successfully")
                    
                    # Send success notification
                    self._send_notification(job, "completed")
                    
                else:
                    job.status = JobStatus.FAILED
                    job.error_message = f"Process exited with code {return_code}"
                    self.logger.error(f"Job {job.job_id} failed with return code {return_code}")
                    
                    # Retry if possible
                    if job.retry_count < job.max_retries:
                        self._retry_job(job)
                    else:
                        self._send_notification(job, "failed")
                
            except subprocess.TimeoutExpired:
                process.kill()
                job.status = JobStatus.FAILED
                job.error_message = f"Job timed out after {self.job_timeout} hours"
                self.logger.error(f"Job {job.job_id} timed out")
                
                self._send_notification(job, "timeout")
                
        except Exception as e:
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            self.logger.error(f"Error monitoring job {job.job_id}: {e}")
            
        finally:
            job.end_time = datetime.now()
            if job.job_id in self.running_jobs:
                del self.running_jobs[job.job_id]
    
    def _retry_job(self, job: TrainingJob):
        """Retry a failed job"""
        job.retry_count += 1
        job.status = JobStatus.PENDING
        job.scheduled_time = datetime.now() + timedelta(minutes=30 * job.retry_count)
        
        # Re-queue the job
        priority = -job.priority
        self.job_queue.put((priority, job.scheduled_time.timestamp(), job.job_id))
        
        self.logger.info(f"Retrying job {job.job_id} (attempt {job.retry_count + 1})")
    
    def _check_running_jobs(self):
        """Check status of running jobs"""
        for job_id in list(self.running_jobs.keys()):
            process = self.running_jobs[job_id]
            
            # Check if process is still running
            if process.poll() is not None:
                # Process has finished, monitoring thread should handle it
                continue
            
            # Check for stuck processes
            job = self.jobs[job_id]
            if job.start_time:
                runtime = datetime.now() - job.start_time
                if runtime > timedelta(hours=self.job_timeout):
                    self.logger.warning(f"Job {job_id} exceeded timeout, terminating")
                    self.cancel_job(job_id)
    
    def _cleanup_old_jobs(self):
        """Clean up old completed jobs"""
        cutoff_time = datetime.now() - timedelta(hours=self.cleanup_interval)
        
        jobs_to_remove = []
        for job_id, job in self.jobs.items():
            if (job.status in [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] and
                job.end_time and job.end_time < cutoff_time):
                jobs_to_remove.append(job_id)
        
        for job_id in jobs_to_remove:
            del self.jobs[job_id]
            self.logger.debug(f"Cleaned up old job: {job_id}")
    
    def _send_notification(self, job: TrainingJob, event_type: str):
        """Send notification about job event"""
        if not self.notification_config.get('enabled', False):
            return
        
        try:
            notification_data = {
                'job_id': job.job_id,
                'job_type': job.job_type,
                'model_name': job.model_name,
                'event_type': event_type,
                'status': job.status.value,
                'start_time': job.start_time.isoformat() if job.start_time else None,
                'end_time': job.end_time.isoformat() if job.end_time else None,
                'error_message': job.error_message
            }
            
            # Send to configured notification channels
            if self.notification_config.get('slack', {}).get('enabled', False):
                self._send_slack_notification(notification_data)
            
            if self.notification_config.get('email', {}).get('enabled', False):
                self._send_email_notification(notification_data)
                
        except Exception as e:
            self.logger.error(f"Error sending notification: {e}")
    
    def _send_slack_notification(self, data: Dict[str, Any]):
        """Send Slack notification"""
        # Placeholder for Slack integration
        self.logger.info(f"Would send Slack notification: {data}")
    
    def _send_email_notification(self, data: Dict[str, Any]):
        """Send email notification"""
        # Placeholder for email integration
        self.logger.info(f"Would send email notification: {data}")
    
    def validate_job(self, job: TrainingJob) -> bool:
        """Validate job configuration"""
        # Check required fields
        if not all([job.job_id, job.job_type, job.model_name, job.config_path]):
            return False
        
        # Check if config file exists
        import os
        if not os.path.exists(job.config_path):
            self.logger.error(f"Config file not found: {job.config_path}")
            return False
        
        # Check valid job type
        valid_types = ['retrain', 'full_retrain', 'hyperparameter_tuning', 'model_comparison', 'drift_check']
        if job.job_type not in valid_types:
            return False
        
        return True
    
    def get_scheduler_stats(self) -> Dict[str, Any]:
        """Get scheduler statistics"""
        total_jobs = len(self.jobs)
        
        status_counts = {}
        for status in JobStatus:
            status_counts[status.value] = len([j for j in self.jobs.values() if j.status == status])
        
        return {
            'total_jobs': total_jobs,
            'running_jobs': len(self.running_jobs),
            'queued_jobs': self.job_queue.qsize(),
            'status_breakdown': status_counts,
            'max_concurrent_jobs': self.max_concurrent_jobs,
            'scheduler_running': self.scheduler_running
        }
