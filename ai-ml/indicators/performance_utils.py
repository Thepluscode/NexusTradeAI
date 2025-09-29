import multiprocessing as mp
import queue
import time
from typing import Any, Callable, List, Optional
import json

class PerformanceUtils:
    def create_worker(self, worker_function: Callable[[Any], Any]) -> dict:
        """
        Create a worker process for CPU-intensive calculations.
        
        Args:
            worker_function: Function to execute in the worker process.
        
        Returns:
            Dict with process and terminate methods.
        """
        def worker_loop(in_queue: mp.Queue, out_queue: mp.Queue):
            """Worker process loop to process tasks."""
            while True:
                try:
                    task = in_queue.get()
                    if task is None:  # Termination signal
                        break
                    task_id, data = task
                    try:
                        result = worker_function(data)
                        out_queue.put((task_id, result, None))
                    except Exception as e:
                        out_queue.put((task_id, None, str(e)))
                except Exception as e:
                    out_queue.put((task_id, None, str(e)))

        in_queue = mp.Queue()
        out_queue = mp.Queue()
        process = mp.Process(target=worker_loop, args=(in_queue, out_queue))
        process.start()
        callbacks = {}
        task_id = 0

        def process(data: Any, timeout: float = 30.0) -> Any:
            """
            Process data using the worker.
            
            Args:
                data: Data to process.
                timeout: Timeout in seconds (default: 30.0).
            
            Returns:
                Result of the worker function.
            
            Raises:
                TimeoutError: If the task times out.
                Exception: If the worker raises an error.
            """
            nonlocal task_id
            current_id = task_id
            task_id += 1

            in_queue.put((current_id, data))
            start_time = time.time()

            while True:
                if time.time() - start_time > timeout:
                    callbacks.pop(current_id, None)
                    raise TimeoutError(f"Worker timeout after {timeout}s")

                try:
                    id_, result, error = out_queue.get_nowait()
                    if id_ == current_id:
                        if error:
                            raise Exception(error)
                        return result
                except queue.Empty:
                    time.sleep(0.01)  # Prevent busy-waiting

        def terminate():
            """Terminate the worker process."""
            in_queue.put(None)
            process.terminate()
            process.join()
            for callback_id in list(callbacks.keys()):
                callbacks.pop(callback_id)

        return {
            "process": process,
            "terminate": terminate
        }

    def create_worker_pool(self, worker_function: Callable[[Any], Any], size: Optional[int] = None) -> dict:
        """
        Create a pool of worker processes for parallel processing.
        
        Args:
            worker_function: Function to execute in worker processes.
            size: Number of workers in the pool (default: CPU count).
        
        Returns:
            Dict with process, process_all, and terminate methods.
        """
        if size is None:
            size = mp.cpu_count()
        workers = [self.create_worker(worker_function) for _ in range(size)]
        worker_index = 0

        def process(data: Any, timeout: Optional[float] = None) -> Any:
            """
            Process data using the worker pool.
            
            Args:
                data: Data to process.
                timeout: Timeout in seconds per task.
            
            Returns:
                Result of the worker function.
            """
            nonlocal worker_index
            worker = workers[worker_index]
            worker_index = (worker_index + 1) % len(workers)
            return worker["process"](data, timeout if timeout is not None else 30.0)

        async def process_all(items: List[Any], progress_callback: Optional[Callable[[float], None]] = None,
                            timeout: Optional[float] = None) -> List[Any]:
            """
            Process multiple items in parallel using the worker pool.
            
            Args:
                items: List of items to process.
                progress_callback: Optional callback for progress updates.
                timeout: Timeout in seconds per item.
            
            Returns:
                List of results.
            """
            from asyncio import gather, create_task
            results = [None] * len(items)
            completed = 0

            async def process_item(index: int, item: Any):
                nonlocal completed
                result = await create_task(process(item, timeout))
                results[index] = result
                completed += 1
                if progress_callback:
                    progress_callback(completed / len(items))
                return result

            await gather(*(process_item(i, item) for i, item in enumerate(items)))
            return results

        def terminate():
            """Terminate all workers in the pool."""
            for worker in workers:
                worker["terminate"]()
            workers.clear()

        return {
            "process": process,
            "process_all": process_all,
            "terminate": terminate
        }

    def memoize(self, fn: Callable, key_fn: Callable = lambda x: json.dumps(x)) -> Callable:
        """
        Memoize function results.
        
        Args:
            fn: Function to memoize.
            key_fn: Function to generate cache key (default: JSON serialization).
        
        Returns:
            Memoized function.
        """
        cache = {}

        def memoized(*args):
            key = key_fn(args)
            if key in cache:
                return cache[key]
            result = fn(*args)
            cache[key] = result
            if len(cache) > 1000:  # Clean up cache if too large
                cache.pop(next(iter(cache)))
            return result

        return memoized

# Singleton instance
performance_utils = PerformanceUtils()