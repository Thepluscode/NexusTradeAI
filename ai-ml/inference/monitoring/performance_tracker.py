"""
Performance Tracking for Model Inference

This module provides functionality to track and analyze the performance
of machine learning models during inference, including latency, throughput,
and error rates.
"""

import time
import logging
import statistics
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, Any, Tuple, Union
from datetime import datetime, timedelta
from collections import deque, defaultdict
import threading
import json
import psutil
import numpy as np

logger = logging.getLogger(__name__)

@dataclass
class InferenceStats:
    """Statistics for a single inference request."""
    request_id: str
    model_name: str
    start_time: float
    end_time: float
    success: bool
    error: Optional[str] = None
    input_size: Optional[int] = None
    output_size: Optional[int] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def latency_ms(self) -> float:
        """Calculate the latency in milliseconds."""
        return (self.end_time - self.start_time) * 1000
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        result = asdict(self)
        result['latency_ms'] = self.latency_ms
        return result
    
    def to_json(self) -> str:
        """Convert to JSON string."""
        return json.dumps(self.to_dict())

class PerformanceTracker:
    """
    Tracks and analyzes the performance of model inference.
    
    This class provides functionality to track metrics such as latency,
    throughput, and error rates, and can generate performance reports.
    """
    
    def __init__(
        self,
        window_size: int = 1000,
        aggregation_window_seconds: int = 60,
        enable_system_metrics: bool = True,
        max_history_hours: int = 24
    ):
        """
        Initialize the PerformanceTracker.
        
        Args:
            window_size: Number of recent requests to keep in memory.
            aggregation_window_seconds: Time window in seconds for aggregating metrics.
            enable_system_metrics: Whether to track system-level metrics.
            max_history_hours: Maximum number of hours to keep historical data.
        """
        self.window_size = window_size
        self.aggregation_window_seconds = aggregation_window_seconds
        self.enable_system_metrics = enable_system_metrics
        self.max_history_hours = max_history_hours
        
        # Thread safety
        self._lock = threading.RLock()
        
        # Request tracking
        self.requests = deque(maxlen=window_size)
        self.request_count = 0
        self.error_count = 0
        
        # Model-specific tracking
        self.model_stats: Dict[str, Dict] = defaultdict(lambda: {
            'request_count': 0,
            'error_count': 0,
            'latencies': [],
            'last_request_time': 0,
            'input_sizes': [],
            'output_sizes': []
        })
        
        # System metrics
        self.system_metrics = {
            'cpu_percent': [],
            'memory_percent': [],
            'disk_io': [],
            'network_io': []
        }
        
        # Start background thread for system metrics collection
        self._stop_event = threading.Event()
        if self.enable_system_metrics:
            self._metrics_thread = threading.Thread(
                target=self._collect_system_metrics,
                daemon=True
            )
            self._metrics_thread.start()
        
        logger.info("Performance tracker initialized")
    
    def start_request(
        self,
        request_id: str,
        model_name: str,
        input_size: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """
        Mark the start of an inference request.
        
        Args:
            request_id: Unique identifier for the request.
            model_name: Name of the model being used.
            input_size: Size of the input data (e.g., number of tokens).
            metadata: Additional metadata about the request.
        """
        with self._lock:
            stats = InferenceStats(
                request_id=request_id,
                model_name=model_name,
                start_time=time.time(),
                end_time=0,
                success=False,
                input_size=input_size,
                metadata=metadata or {}
            )
            
            # Store the request
            self.requests.append(stats)
            self.request_count += 1
            
            # Update model stats
            model_stat = self.model_stats[model_name]
            model_stat['request_count'] += 1
            model_stat['last_request_time'] = time.time()
            if input_size is not None:
                model_stat['input_sizes'].append(input_size)
            
            return stats
    
    def end_request(
        self,
        request_id: str,
        success: bool = True,
        error: Optional[str] = None,
        output_size: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Optional[InferenceStats]:
        """
        Mark the end of an inference request.
        
        Args:
            request_id: Unique identifier for the request.
            success: Whether the request was successful.
            error: Error message if the request failed.
            output_size: Size of the output data.
            metadata: Additional metadata about the request.
            
        Returns:
            The updated InferenceStats object, or None if the request was not found.
        """
        with self._lock:
            # Find the request
            stats = None
            for req in reversed(self.requests):
                if req.request_id == request_id:
                    stats = req
                    break
            
            if stats is None:
                logger.warning(f"Request {request_id} not found")
                return None
            
            # Update the request
            stats.end_time = time.time()
            stats.success = success
            stats.error = error
            stats.output_size = output_size
            
            if metadata:
                stats.metadata.update(metadata)
            
            # Update model stats
            model_stat = self.model_stats[stats.model_name]
            if not success:
                self.error_count += 1
                model_stat['error_count'] += 1
            
            latency = stats.latency_ms
            model_stat['latencies'].append(latency)
            
            if output_size is not None:
                model_stat['output_sizes'].append(output_size)
            
            return stats
    
    def get_performance_metrics(
        self,
        time_window_seconds: Optional[int] = None,
        model_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get performance metrics for the specified time window and model.
        
        Args:
            time_window_seconds: Time window in seconds to consider.
                               If None, consider all available data.
            model_name: Name of the model to filter by. If None, aggregate across all models.
            
        Returns:
            Dictionary containing performance metrics.
        """
        with self._lock:
            now = time.time()
            
            # Filter requests by time window and model
            if time_window_seconds is not None:
                cutoff = now - time_window_seconds
                recent_requests = [
                    req for req in self.requests
                    if req.end_time >= cutoff and 
                    (model_name is None or req.model_name == model_name)
                ]
            else:
                recent_requests = [
                    req for req in self.requests
                    if model_name is None or req.model_name == model_name
                ]
            
            if not recent_requests:
                return {
                    'request_count': 0,
                    'error_count': 0,
                    'throughput_rps': 0.0,
                    'avg_latency_ms': 0.0,
                    'p50_latency_ms': 0.0,
                    'p90_latency_ms': 0.0,
                    'p99_latency_ms': 0.0,
                    'error_rate': 0.0,
                    'model_name': model_name or 'all',
                    'time_window_seconds': time_window_seconds or 0,
                    'timestamp': datetime.utcnow().isoformat()
                }
            
            # Calculate basic metrics
            latencies = [req.latency_ms for req in recent_requests]
            error_count = sum(1 for req in recent_requests if not req.success)
            request_count = len(recent_requests)
            
            # Calculate percentiles
            if latencies:
                p50 = np.percentile(latencies, 50)
                p90 = np.percentile(latencies, 90)
                p99 = np.percentile(latencies, 99)
                avg_latency = sum(latencies) / len(latencies)
            else:
                p50 = p90 = p99 = avg_latency = 0.0
            
            # Calculate throughput (requests per second)
            if len(recent_requests) > 1:
                time_span = recent_requests[-1].end_time - recent_requests[0].end_time
                throughput = len(recent_requests) / time_span if time_span > 0 else 0.0
            else:
                throughput = 0.0
            
            # Calculate error rate
            error_rate = error_count / request_count if request_count > 0 else 0.0
            
            # Get input/output sizes if available
            input_sizes = [req.input_size for req in recent_requests if req.input_size is not None]
            output_sizes = [req.output_size for req in recent_requests if req.output_size is not None]
            
            result = {
                'request_count': request_count,
                'error_count': error_count,
                'throughput_rps': throughput,
                'avg_latency_ms': avg_latency,
                'p50_latency_ms': float(p50),
                'p90_latency_ms': float(p90),
                'p99_latency_ms': float(p99),
                'error_rate': error_rate,
                'model_name': model_name or 'all',
                'time_window_seconds': time_window_seconds or 0,
                'timestamp': datetime.utcnow().isoformat(),
                'input_size_avg': float(np.mean(input_sizes)) if input_sizes else None,
                'output_size_avg': float(np.mean(output_sizes)) if output_sizes else None,
                'input_size_total': int(sum(input_sizes)) if input_sizes else 0,
                'output_size_total': int(sum(output_sizes)) if output_sizes else 0
            }
            
            # Add system metrics if available
            if self.enable_system_metrics:
                result.update(self._get_system_metrics_summary(time_window_seconds))
            
            return result
    
    def get_model_metrics(self, model_name: str) -> Dict[str, Any]:
        """
        Get metrics for a specific model.
        
        Args:
            model_name: Name of the model.
            
        Returns:
            Dictionary containing model-specific metrics.
        """
        with self._lock:
            if model_name not in self.model_stats:
                return {}
                
            stats = self.model_stats[model_name]
            latencies = stats['latencies']
            
            if not latencies:
                return {
                    'model_name': model_name,
                    'request_count': 0,
                    'error_count': 0,
                    'error_rate': 0.0,
                    'avg_latency_ms': 0.0,
                    'p50_latency_ms': 0.0,
                    'p90_latency_ms': 0.0,
                    'p99_latency_ms': 0.0,
                    'throughput_rps': 0.0,
                    'last_request_time': stats['last_request_time'],
                    'input_size_avg': 0.0,
                    'output_size_avg': 0.0
                }
            
            # Calculate percentiles
            p50 = np.percentile(latencies, 50)
            p90 = np.percentile(latencies, 90)
            p99 = np.percentile(latencies, 99)
            avg_latency = sum(latencies) / len(latencies)
            
            # Calculate throughput (requests per second)
            time_window = 60  # 1 minute window
            recent_requests = [
                req for req in self.requests
                if req.model_name == model_name and 
                req.end_time >= (time.time() - time_window)
            ]
            
            if len(recent_requests) > 1:
                time_span = recent_requests[-1].end_time - recent_requests[0].end_time
                throughput = len(recent_requests) / time_span if time_span > 0 else 0.0
            else:
                throughput = 0.0
            
            # Calculate input/output sizes
            input_sizes = stats['input_sizes']
            output_sizes = stats['output_sizes']
            
            return {
                'model_name': model_name,
                'request_count': stats['request_count'],
                'error_count': stats['error_count'],
                'error_rate': stats['error_count'] / stats['request_count'] if stats['request_count'] > 0 else 0.0,
                'avg_latency_ms': avg_latency,
                'p50_latency_ms': float(p50),
                'p90_latency_ms': float(p90),
                'p99_latency_ms': float(p99),
                'throughput_rps': throughput,
                'last_request_time': datetime.fromtimestamp(stats['last_request_time']).isoformat(),
                'input_size_avg': float(np.mean(input_sizes)) if input_sizes else 0.0,
                'output_size_avg': float(np.mean(output_sizes)) if output_sizes else 0.0,
                'input_size_total': int(sum(input_sizes)) if input_sizes else 0,
                'output_size_total': int(sum(output_sizes)) if output_sizes else 0
            }
    
    def get_all_models_metrics(self) -> Dict[str, Dict[str, Any]]:
        """
        Get metrics for all models.
        
        Returns:
            Dictionary mapping model names to their metrics.
        """
        with self._lock:
            return {
                model_name: self.get_model_metrics(model_name)
                for model_name in self.model_stats.keys()
            }
    
    def _collect_system_metrics(self) -> None:
        """Background thread to collect system metrics."""
        io_counters = psutil.net_io_counters()
        last_net_io = {
            'bytes_sent': io_counters.bytes_sent,
            'bytes_recv': io_counters.bytes_recv,
            'time': time.time()
        }
        
        disk_io = psutil.disk_io_counters()
        last_disk_io = {
            'read_bytes': disk_io.read_bytes if disk_io else 0,
            'write_bytes': disk_io.write_bytes if disk_io else 0,
            'time': time.time()
        }
        
        while not self._stop_event.is_set():
            try:
                # CPU and memory
                cpu_percent = psutil.cpu_percent(interval=1)
                memory_percent = psutil.virtual_memory().percent
                
                # Network I/O
                io_counters = psutil.net_io_counters()
                now = time.time()
                time_diff = now - last_net_io['time']
                
                if time_diff > 0:
                    bytes_sent_rate = (io_counters.bytes_sent - last_net_io['bytes_sent']) / time_diff
                    bytes_recv_rate = (io_counters.bytes_recv - last_net_io['bytes_recv']) / time_diff
                    
                    last_net_io = {
                        'bytes_sent': io_counters.bytes_sent,
                        'bytes_recv': io_counters.bytes_recv,
                        'time': now
                    }
                else:
                    bytes_sent_rate = 0
                    bytes_recv_rate = 0
                
                # Disk I/O
                disk_io = psutil.disk_io_counters()
                time_diff_disk = now - last_disk_io['time']
                
                if time_diff_disk > 0 and disk_io is not None:
                    read_bytes_rate = (disk_io.read_bytes - last_disk_io['read_bytes']) / time_diff_disk
                    write_bytes_rate = (disk_io.write_bytes - last_disk_io['write_bytes']) / time_diff_disk
                    
                    last_disk_io = {
                        'read_bytes': disk_io.read_bytes,
                        'write_bytes': disk_io.write_bytes,
                        'time': now
                    }
                else:
                    read_bytes_rate = 0
                    write_bytes_rate = 0
                
                # Store metrics
                with self._lock:
                    timestamp = datetime.utcnow().isoformat()
                    self.system_metrics['cpu_percent'].append((timestamp, cpu_percent))
                    self.system_metrics['memory_percent'].append((timestamp, memory_percent))
                    self.system_metrics['network_io'].append((timestamp, {
                        'bytes_sent_rate': bytes_sent_rate,
                        'bytes_recv_rate': bytes_recv_rate
                    }))
                    self.system_metrics['disk_io'].append((timestamp, {
                        'read_bytes_rate': read_bytes_rate,
                        'write_bytes_rate': write_bytes_rate
                    }))
                    
                    # Trim old data
                    cutoff = datetime.utcnow() - timedelta(hours=self.max_history_hours)
                    for metric in self.system_metrics.values():
                        while metric and datetime.fromisoformat(metric[0][0]) < cutoff:
                            metric.pop(0)
                
                # Sleep until next collection
                self._stop_event.wait(5)  # Collect every 5 seconds
                
            except Exception as e:
                logger.error(f"Error collecting system metrics: {e}")
                self._stop_event.wait(5)  # Wait before retrying
    
    def _get_system_metrics_summary(self, time_window_seconds: Optional[int] = None) -> Dict[str, Any]:
        """
        Get a summary of system metrics.
        
        Args:
            time_window_seconds: Time window in seconds to consider.
                               If None, consider all available data.
        
        Returns:
            Dictionary containing system metrics summary.
        """
        if not self.enable_system_metrics:
            return {}
        
        with self._lock:
            now = datetime.utcnow()
            
            # Filter metrics by time window
            def filter_metrics(metrics):
                if time_window_seconds is None:
                    return [m[1] for m in metrics]
                cutoff = now - timedelta(seconds=time_window_seconds)
                return [m[1] for m in metrics if datetime.fromisoformat(m[0]) >= cutoff]
            
            # CPU and memory
            cpu_percent = filter_metrics(self.system_metrics['cpu_percent'])
            memory_percent = filter_metrics(self.system_metrics['memory_percent'])
            
            # Network I/O
            network_io = filter_metrics(self.system_metrics['network_io'])
            bytes_sent = [io['bytes_sent_rate'] for io in network_io]
            bytes_recv = [io['bytes_recv_rate'] for io in network_io]
            
            # Disk I/O
            disk_io = filter_metrics(self.system_metrics['disk_io'])
            read_bytes = [io['read_bytes_rate'] for io in disk_io]
            write_bytes = [io['write_bytes_rate'] for io in disk_io]
            
            # Calculate statistics
            def safe_stats(values):
                if not values:
                    return {
                        'avg': 0.0,
                        'max': 0.0,
                        'min': 0.0,
                        'count': 0
                    }
                return {
                    'avg': float(np.mean(values)),
                    'max': float(np.max(values)),
                    'min': float(np.min(values)),
                    'count': len(values)
                }
            
            return {
                'system': {
                    'cpu_percent': safe_stats(cpu_percent),
                    'memory_percent': safe_stats(memory_percent),
                    'network': {
                        'bytes_sent': safe_stats(bytes_sent),
                        'bytes_received': safe_stats(bytes_recv)
                    },
                    'disk': {
                        'read_bytes': safe_stats(read_bytes),
                        'write_bytes': safe_stats(write_bytes)
                    }
                }
            }
    
    def get_health_status(self) -> Dict[str, Any]:
        """
        Get the health status of the inference service.
        
        Returns:
            Dictionary containing health status information.
        """
        with self._lock:
            metrics = self.get_performance_metrics(time_window_seconds=300)  # Last 5 minutes
            
            # Check if we have recent requests
            is_healthy = True
            issues = []
            
            if metrics['request_count'] == 0:
                issues.append("No recent requests in the last 5 minutes")
            
            # Check error rate
            if metrics['error_rate'] > 0.1:  # More than 10% error rate
                is_healthy = False
                issues.append(f"High error rate: {metrics['error_rate']*100:.1f}%")
            
            # Check latency (example threshold: 95th percentile > 1000ms)
            if metrics['p99_latency_ms'] > 1000:
                is_healthy = False
                issues.append(f"High latency (p99: {metrics['p99_latency_ms']:.1f}ms)")
            
            # Check system metrics if available
            if self.enable_system_metrics and 'system' in metrics:
                sys_metrics = metrics['system']
                
                # CPU check
                if sys_metrics['cpu_percent']['avg'] > 90:
                    is_healthy = False
                    issues.append(f"High CPU usage: {sys_metrics['cpu_percent']['avg']:.1f}%")
                
                # Memory check
                if sys_metrics['memory_percent']['avg'] > 90:
                    is_healthy = False
                    issues.append(f"High memory usage: {sys_metrics['memory_percent']['avg']:.1f}%")
            
            return {
                'status': 'healthy' if is_healthy else 'unhealthy',
                'timestamp': datetime.utcnow().isoformat(),
                'metrics': metrics,
                'issues': issues
            }
    
    def reset(self) -> None:
        """Reset all metrics."""
        with self._lock:
            self.requests.clear()
            self.request_count = 0
            self.error_count = 0
            self.model_stats.clear()
            
            # Reset system metrics
            for key in self.system_metrics:
                self.system_metrics[key].clear()
    
    def stop(self) -> None:
        """Stop the performance tracker and clean up resources."""
        self._stop_event.set()
        if hasattr(self, '_metrics_thread'):
            self._metrics_thread.join(timeout=5)
        
        logger.info("Performance tracker stopped")

# Example usage
if __name__ == "__main__":
    import random
    import time
    
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Initialize the performance tracker
    tracker = PerformanceTracker(window_size=1000, enable_system_metrics=True)
    
    try:
        # Simulate some inference requests
        for i in range(100):
            request_id = f"req_{i}"
            model_name = random.choice(["model_a", "model_b", "model_c"])
            
            # Start request
            tracker.start_request(
                request_id=request_id,
                model_name=model_name,
                input_size=random.randint(10, 1000)
            )
            
            # Simulate processing time
            time.sleep(random.uniform(0.01, 0.1))
            
            # End request (randomly fail 5% of requests)
            success = random.random() > 0.05
            error = "Timeout" if not success else None
            
            tracker.end_request(
                request_id=request_id,
                success=success,
                error=error,
                output_size=random.randint(1, 100)
            )
        
        # Get performance metrics
        print("\n=== Performance Metrics (last 30 seconds) ===")
        metrics = tracker.get_performance_metrics(time_window_seconds=30)
        print(json.dumps(metrics, indent=2))
        
        print("\n=== Model Metrics ===")
        for model_name in ["model_a", "model_b", "model_c"]:
            model_metrics = tracker.get_model_metrics(model_name)
            print(f"\n{model_name}:")
            print(f"  Requests: {model_metrics['request_count']}")
            print(f"  Error rate: {model_metrics['error_rate']*100:.1f}%")
            print(f"  Avg latency: {model_metrics['avg_latency_ms']:.1f}ms")
        
        print("\n=== Health Status ===")
        health = tracker.get_health_status()
        print(f"Status: {health['status']}")
        if health['issues']:
            print("Issues:")
            for issue in health['issues']:
                print(f"- {issue}")
        
    finally:
        # Clean up
        tracker.stop()
