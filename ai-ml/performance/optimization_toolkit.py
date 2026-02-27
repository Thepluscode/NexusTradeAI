"""
Performance Optimization Toolkit
=================================
Tools for profiling, benchmarking, and optimizing ML model performance.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Model inference profiling
- API response time analysis
- Database query optimization
- Cache performance monitoring
- Resource usage tracking
- Automated optimization recommendations
"""

import time
import cProfile
import pstats
import io
import psutil
import numpy as np
import pandas as pd
from typing import Dict, List, Callable, Any, Optional, Tuple
from dataclasses import dataclass, field
from datetime import datetime
import logging
from contextlib import contextmanager
import functools
import tracemalloc
import gc

logger = logging.getLogger(__name__)


@dataclass
class PerformanceMetrics:
    """Performance metrics for a function or operation"""
    name: str
    execution_time_ms: float
    memory_used_mb: float
    cpu_percent: float
    call_count: int = 1
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'name': self.name,
            'execution_time_ms': self.execution_time_ms,
            'memory_used_mb': self.memory_used_mb,
            'cpu_percent': self.cpu_percent,
            'call_count': self.call_count,
            'timestamp': self.timestamp.isoformat()
        }


@dataclass
class BenchmarkResult:
    """Result of a benchmark run"""
    operation_name: str
    iterations: int
    min_time_ms: float
    max_time_ms: float
    mean_time_ms: float
    median_time_ms: float
    std_time_ms: float
    p95_time_ms: float
    p99_time_ms: float
    throughput_ops_per_sec: float

    def print_summary(self):
        """Print benchmark summary"""
        print(f"\n{'='*60}")
        print(f"BENCHMARK RESULTS: {self.operation_name}")
        print(f"{'='*60}")
        print(f"Iterations: {self.iterations}")
        print(f"Mean time: {self.mean_time_ms:.2f}ms")
        print(f"Median time: {self.median_time_ms:.2f}ms")
        print(f"Min time: {self.min_time_ms:.2f}ms")
        print(f"Max time: {self.max_time_ms:.2f}ms")
        print(f"Std dev: {self.std_time_ms:.2f}ms")
        print(f"p95: {self.p95_time_ms:.2f}ms")
        print(f"p99: {self.p99_time_ms:.2f}ms")
        print(f"Throughput: {self.throughput_ops_per_sec:.2f} ops/sec")
        print(f"{'='*60}\n")


class PerformanceProfiler:
    """
    Profiler for tracking performance metrics
    """

    def __init__(self):
        self.metrics: List[PerformanceMetrics] = []
        self.process = psutil.Process()

    @contextmanager
    def profile(self, operation_name: str):
        """
        Context manager for profiling an operation

        Usage:
            with profiler.profile("my_operation"):
                # code to profile
                result = expensive_function()
        """
        # Start tracking
        gc.collect()  # Force garbage collection for accurate memory measurement
        tracemalloc.start()
        start_time = time.time()
        start_memory = self.process.memory_info().rss / 1024 / 1024  # MB
        start_cpu = self.process.cpu_percent()

        try:
            yield
        finally:
            # End tracking
            end_time = time.time()
            end_memory = self.process.memory_info().rss / 1024 / 1024  # MB
            end_cpu = self.process.cpu_percent()

            current, peak = tracemalloc.get_traced_memory()
            tracemalloc.stop()

            # Calculate metrics
            execution_time_ms = (end_time - start_time) * 1000
            memory_used_mb = max(end_memory - start_memory, peak / 1024 / 1024)
            cpu_percent = end_cpu

            # Store metrics
            metric = PerformanceMetrics(
                name=operation_name,
                execution_time_ms=execution_time_ms,
                memory_used_mb=memory_used_mb,
                cpu_percent=cpu_percent
            )
            self.metrics.append(metric)

            logger.info(f"Profiled {operation_name}: {execution_time_ms:.2f}ms, {memory_used_mb:.2f}MB")

    def get_metrics(self, operation_name: Optional[str] = None) -> List[PerformanceMetrics]:
        """Get recorded metrics, optionally filtered by operation name"""
        if operation_name:
            return [m for m in self.metrics if m.name == operation_name]
        return self.metrics

    def get_summary(self) -> pd.DataFrame:
        """Get summary statistics for all profiled operations"""
        if not self.metrics:
            return pd.DataFrame()

        data = [m.to_dict() for m in self.metrics]
        df = pd.DataFrame(data)

        summary = df.groupby('name').agg({
            'execution_time_ms': ['count', 'mean', 'min', 'max', 'std'],
            'memory_used_mb': ['mean', 'max'],
            'cpu_percent': ['mean', 'max']
        }).round(2)

        return summary

    def clear(self):
        """Clear all recorded metrics"""
        self.metrics = []


def profile_function(func: Callable) -> Callable:
    """
    Decorator for profiling a function

    Usage:
        @profile_function
        def my_expensive_function(x):
            # expensive computation
            return result
    """
    profiler = PerformanceProfiler()

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with profiler.profile(func.__name__):
            result = func(*args, **kwargs)
        return result

    wrapper.profiler = profiler
    return wrapper


class PerformanceBenchmark:
    """
    Benchmark tool for measuring operation performance
    """

    @staticmethod
    def benchmark(
        func: Callable,
        iterations: int = 100,
        warmup: int = 10,
        **kwargs
    ) -> BenchmarkResult:
        """
        Benchmark a function

        Args:
            func: Function to benchmark
            iterations: Number of iterations to run
            warmup: Number of warmup iterations
            **kwargs: Arguments to pass to function

        Returns:
            BenchmarkResult with timing statistics
        """
        # Warmup
        for _ in range(warmup):
            func(**kwargs)

        # Benchmark
        times = []
        for _ in range(iterations):
            start_time = time.time()
            func(**kwargs)
            end_time = time.time()
            times.append((end_time - start_time) * 1000)  # Convert to ms

        # Calculate statistics
        times_array = np.array(times)

        result = BenchmarkResult(
            operation_name=func.__name__,
            iterations=iterations,
            min_time_ms=float(np.min(times_array)),
            max_time_ms=float(np.max(times_array)),
            mean_time_ms=float(np.mean(times_array)),
            median_time_ms=float(np.median(times_array)),
            std_time_ms=float(np.std(times_array)),
            p95_time_ms=float(np.percentile(times_array, 95)),
            p99_time_ms=float(np.percentile(times_array, 99)),
            throughput_ops_per_sec=1000.0 / np.mean(times_array) if np.mean(times_array) > 0 else 0
        )

        return result

    @staticmethod
    def compare_functions(
        functions: List[Tuple[str, Callable]],
        iterations: int = 100,
        **kwargs
    ) -> pd.DataFrame:
        """
        Compare performance of multiple functions

        Args:
            functions: List of (name, function) tuples
            iterations: Number of iterations per function
            **kwargs: Arguments to pass to functions

        Returns:
            DataFrame with comparison results
        """
        results = []

        for name, func in functions:
            result = PerformanceBenchmark.benchmark(func, iterations, **kwargs)
            results.append({
                'Function': name,
                'Mean (ms)': result.mean_time_ms,
                'Median (ms)': result.median_time_ms,
                'Std (ms)': result.std_time_ms,
                'p95 (ms)': result.p95_time_ms,
                'p99 (ms)': result.p99_time_ms,
                'Throughput (ops/s)': result.throughput_ops_per_sec
            })

        df = pd.DataFrame(results)
        df = df.round(2)

        # Add relative performance
        fastest_mean = df['Mean (ms)'].min()
        df['Relative Speed'] = (df['Mean (ms)'] / fastest_mean).round(2)

        return df


class ModelInferenceOptimizer:
    """
    Optimizer for model inference performance
    """

    @staticmethod
    def profile_inference(model, X: pd.DataFrame, iterations: int = 100) -> Dict[str, Any]:
        """
        Profile model inference performance

        Args:
            model: Model to profile
            X: Input data
            iterations: Number of inference iterations

        Returns:
            Dictionary with profiling results
        """
        print(f"\n{'='*60}")
        print("MODEL INFERENCE PROFILING")
        print(f"{'='*60}")

        # Single prediction benchmark
        def single_prediction():
            return model.predict(X.iloc[[0]])

        single_result = PerformanceBenchmark.benchmark(single_prediction, iterations)

        # Batch prediction benchmarks (different batch sizes)
        batch_sizes = [1, 10, 50, 100, min(500, len(X))]
        batch_results = {}

        for batch_size in batch_sizes:
            if batch_size > len(X):
                continue

            def batch_prediction():
                return model.predict(X.iloc[:batch_size])

            result = PerformanceBenchmark.benchmark(batch_prediction, iterations=50)
            batch_results[batch_size] = result

        # Calculate throughput
        throughput_data = []
        for batch_size, result in batch_results.items():
            throughput = (batch_size * 1000) / result.mean_time_ms  # predictions per second
            throughput_data.append({
                'Batch Size': batch_size,
                'Latency (ms)': result.mean_time_ms,
                'Throughput (pred/s)': throughput,
                'Latency per Pred (ms)': result.mean_time_ms / batch_size
            })

        throughput_df = pd.DataFrame(throughput_data)

        print(f"\nSingle Prediction Performance:")
        print(f"  Mean latency: {single_result.mean_time_ms:.2f}ms")
        print(f"  p95 latency: {single_result.p95_time_ms:.2f}ms")
        print(f"  p99 latency: {single_result.p99_time_ms:.2f}ms")

        print(f"\nBatch Performance:")
        print(throughput_df.to_string(index=False))

        # Find optimal batch size
        optimal_idx = throughput_df['Throughput (pred/s)'].idxmax()
        optimal_batch_size = throughput_df.loc[optimal_idx, 'Batch Size']

        print(f"\nOptimal batch size: {optimal_batch_size}")
        print(f"Max throughput: {throughput_df.loc[optimal_idx, 'Throughput (pred/s)']:.2f} pred/s")

        print(f"{'='*60}\n")

        return {
            'single_prediction': single_result,
            'batch_results': batch_results,
            'throughput_analysis': throughput_df,
            'optimal_batch_size': int(optimal_batch_size)
        }

    @staticmethod
    def recommend_optimizations(profiling_results: Dict[str, Any]) -> List[str]:
        """
        Generate optimization recommendations based on profiling results

        Args:
            profiling_results: Results from profile_inference

        Returns:
            List of optimization recommendations
        """
        recommendations = []

        single_result = profiling_results['single_prediction']
        throughput_df = profiling_results['throughput_analysis']

        # Check latency
        if single_result.mean_time_ms > 100:
            recommendations.append(
                f"⚠️  High latency detected ({single_result.mean_time_ms:.2f}ms). "
                "Consider model pruning or quantization."
            )

        if single_result.p99_time_ms > 200:
            recommendations.append(
                f"⚠️  High p99 latency ({single_result.p99_time_ms:.2f}ms). "
                "Investigate outliers and optimize worst-case performance."
            )

        # Check batch efficiency
        batch_1_throughput = throughput_df[throughput_df['Batch Size'] == 1]['Throughput (pred/s)'].values[0]
        max_throughput = throughput_df['Throughput (pred/s)'].max()
        efficiency = batch_1_throughput / max_throughput

        if efficiency < 0.3:
            recommendations.append(
                f"✅ Batching provides {1/efficiency:.1f}x throughput improvement. "
                f"Use batch size = {profiling_results['optimal_batch_size']} for best performance."
            )

        # Check variance
        if single_result.std_time_ms > single_result.mean_time_ms * 0.5:
            recommendations.append(
                "⚠️  High variance in inference time. Consider caching frequent predictions."
            )

        if not recommendations:
            recommendations.append("✅ Model inference performance looks good!")

        return recommendations


class APIPerformanceAnalyzer:
    """
    Analyzer for API endpoint performance
    """

    def __init__(self):
        self.request_times: List[float] = []
        self.request_sizes: List[int] = []

    def record_request(self, response_time_ms: float, request_size_bytes: int = 0):
        """Record API request metrics"""
        self.request_times.append(response_time_ms)
        self.request_sizes.append(request_size_bytes)

    def analyze(self) -> Dict[str, Any]:
        """Analyze recorded API performance"""
        if not self.request_times:
            return {}

        times = np.array(self.request_times)

        analysis = {
            'total_requests': len(times),
            'mean_time_ms': float(np.mean(times)),
            'median_time_ms': float(np.median(times)),
            'p95_time_ms': float(np.percentile(times, 95)),
            'p99_time_ms': float(np.percentile(times, 99)),
            'min_time_ms': float(np.min(times)),
            'max_time_ms': float(np.max(times)),
            'std_time_ms': float(np.std(times)),
            'throughput_req_per_sec': 1000.0 / np.mean(times) if np.mean(times) > 0 else 0
        }

        if self.request_sizes:
            sizes = np.array(self.request_sizes)
            analysis['mean_request_size_kb'] = float(np.mean(sizes)) / 1024
            analysis['total_data_mb'] = float(np.sum(sizes)) / 1024 / 1024

        return analysis

    def print_report(self):
        """Print performance analysis report"""
        analysis = self.analyze()

        if not analysis:
            print("No data to analyze")
            return

        print(f"\n{'='*60}")
        print("API PERFORMANCE ANALYSIS")
        print(f"{'='*60}")
        print(f"Total requests: {analysis['total_requests']}")
        print(f"Mean response time: {analysis['mean_time_ms']:.2f}ms")
        print(f"Median response time: {analysis['median_time_ms']:.2f}ms")
        print(f"p95 response time: {analysis['p95_time_ms']:.2f}ms")
        print(f"p99 response time: {analysis['p99_time_ms']:.2f}ms")
        print(f"Throughput: {analysis['throughput_req_per_sec']:.2f} req/sec")

        if 'mean_request_size_kb' in analysis:
            print(f"Mean request size: {analysis['mean_request_size_kb']:.2f} KB")
            print(f"Total data processed: {analysis['total_data_mb']:.2f} MB")

        print(f"{'='*60}\n")

        # Recommendations
        if analysis['p95_time_ms'] > 100:
            print("⚠️  p95 latency > 100ms. Consider:")
            print("   - Adding caching layer")
            print("   - Optimizing database queries")
            print("   - Scaling API workers")

        if analysis['p99_time_ms'] > 200:
            print("⚠️  p99 latency > 200ms. Investigate outliers.")


class ResourceMonitor:
    """
    Monitor system resource usage
    """

    def __init__(self):
        self.process = psutil.Process()
        self.samples: List[Dict[str, float]] = []

    def record_snapshot(self):
        """Record current resource usage"""
        snapshot = {
            'timestamp': time.time(),
            'cpu_percent': self.process.cpu_percent(),
            'memory_mb': self.process.memory_info().rss / 1024 / 1024,
            'num_threads': self.process.num_threads(),
            'open_files': len(self.process.open_files()),
        }

        # System-wide metrics
        snapshot['system_cpu_percent'] = psutil.cpu_percent()
        snapshot['system_memory_percent'] = psutil.virtual_memory().percent

        self.samples.append(snapshot)

    def get_report(self) -> Dict[str, Any]:
        """Get resource usage report"""
        if not self.samples:
            return {}

        df = pd.DataFrame(self.samples)

        report = {
            'avg_cpu_percent': float(df['cpu_percent'].mean()),
            'max_cpu_percent': float(df['cpu_percent'].max()),
            'avg_memory_mb': float(df['memory_mb'].mean()),
            'max_memory_mb': float(df['memory_mb'].max()),
            'avg_threads': float(df['num_threads'].mean()),
            'samples_count': len(self.samples)
        }

        return report

    def print_report(self):
        """Print resource usage report"""
        report = self.get_report()

        if not report:
            print("No resource data collected")
            return

        print(f"\n{'='*60}")
        print("RESOURCE USAGE REPORT")
        print(f"{'='*60}")
        print(f"Average CPU: {report['avg_cpu_percent']:.1f}%")
        print(f"Peak CPU: {report['max_cpu_percent']:.1f}%")
        print(f"Average Memory: {report['avg_memory_mb']:.1f} MB")
        print(f"Peak Memory: {report['max_memory_mb']:.1f} MB")
        print(f"Average Threads: {report['avg_threads']:.1f}")
        print(f"Samples collected: {report['samples_count']}")
        print(f"{'='*60}\n")


# Example usage
if __name__ == "__main__":
    print("Performance Optimization Toolkit")
    print("="*60)

    # Example 1: Profile a function
    profiler = PerformanceProfiler()

    with profiler.profile("example_computation"):
        # Simulate expensive computation
        result = sum([i**2 for i in range(1000000)])

    print("\nProfiler Summary:")
    print(profiler.get_summary())

    # Example 2: Benchmark functions
    def method_a():
        return sum([i**2 for i in range(10000)])

    def method_b():
        return sum(i**2 for i in range(10000))

    comparison = PerformanceBenchmark.compare_functions([
        ("List Comprehension", method_a),
        ("Generator", method_b)
    ], iterations=100)

    print("\nFunction Comparison:")
    print(comparison)

    # Example 3: Resource monitoring
    monitor = ResourceMonitor()

    for _ in range(10):
        monitor.record_snapshot()
        time.sleep(0.1)

    monitor.print_report()
