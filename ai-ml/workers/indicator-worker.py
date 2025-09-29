import asyncio
import json
import sys
import traceback
from typing import Dict, Any, Optional
import threading
import queue

# Import the technical indicators (assuming these are your Python modules)
from indicators.technical_indicators import TechnicalIndicators
from indicators.pattern_recognition import PatternRecognition

class IndicatorWorker:
    def __init__(self):
        self.indicators = TechnicalIndicators()
        self.pattern_recognition = PatternRecognition()
        self.message_queue = queue.Queue()
        self.running = True
    
    async def handle_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming messages and route to appropriate methods"""
        message_id = message_data.get('id')
        method = message_data.get('method')
        args = message_data.get('args', [])
        
        try:
            result = None
            
            # Route the method call to the appropriate handler
            if method == 'sma':
                result = self.indicators.sma(*args)
            elif method == 'ema':
                result = self.indicators.ema(*args)
            elif method == 'macd':
                result = self.indicators.macd(*args)
            elif method == 'rsi':
                result = self.indicators.rsi(*args)
            elif method == 'bollingerBands':
                result = self.indicators.bollinger_bands(*args)
            elif method == 'atr':
                result = self.indicators.atr(*args)
            elif method == 'supertrend':
                result = self.indicators.supertrend(*args)
            elif method == 'ichimoku':
                result = self.indicators.ichimoku(*args)
            elif method == 'volumeProfile':
                result = self.indicators.volume_profile(*args)
            elif method == 'fibonacciRetracement':
                result = self.indicators.fibonacci_retracement(*args)
            elif method == 'pivotPoints':
                result = self.indicators.pivot_points(*args)
            elif method == 'detectCandlestickPatterns':
                result = self.pattern_recognition.detect_candlestick_patterns(*args)
            elif method == 'calculateAllIndicators':
                result = self.indicators.calculate_all_indicators(*args)
            else:
                raise ValueError(f"Unknown method: {method}")
            
            # Return successful result
            return {
                'id': message_id,
                'result': result,
                'error': None
            }
            
        except Exception as error:
            # Return error response
            return {
                'id': message_id,
                'result': None,
                'error': str(error) or 'Unknown error occurred'
            }
    
    def post_message(self, response: Dict[str, Any]):
        """Send response back (implement based on your communication method)"""
        # For stdout communication (similar to web worker postMessage)
        print(json.dumps(response), flush=True)
    
    async def process_messages(self):
        """Main message processing loop"""
        while self.running:
            try:
                # Get message from queue (non-blocking with timeout)
                try:
                    message_data = self.message_queue.get(timeout=0.1)
                except queue.Empty:
                    continue
                
                # Process the message
                response = await self.handle_message(message_data)
                
                # Send response back
                self.post_message(response)
                
                # Mark task as done
                self.message_queue.task_done()
                
            except Exception as error:
                # Handle uncaught errors
                error_response = {
                    'id': -1,
                    'result': None,
                    'error': f'Worker error: {str(error) or "Unknown error"}'
                }
                self.post_message(error_response)
    
    def add_message(self, message_data: Dict[str, Any]):
        """Add a message to the processing queue"""
        self.message_queue.put(message_data)
    
    def stop(self):
        """Stop the worker"""
        self.running = False

# Alternative implementation for stdin/stdout communication (like a subprocess)
class StdinWorker(IndicatorWorker):
    def __init__(self):
        super().__init__()
    
    async def listen_stdin(self):
        """Listen for messages from stdin"""
        loop = asyncio.get_event_loop()
        
        while self.running:
            try:
                # Read from stdin in a non-blocking way
                line = await loop.run_in_executor(None, sys.stdin.readline)
                
                if not line:
                    break
                
                # Parse JSON message
                message_data = json.loads(line.strip())
                self.add_message(message_data)
                
            except json.JSONDecodeError as e:
                error_response = {
                    'id': -1,
                    'result': None,
                    'error': f'JSON decode error: {str(e)}'
                }
                self.post_message(error_response)
            except Exception as e:
                error_response = {
                    'id': -1,
                    'result': None,
                    'error': f'Stdin error: {str(e)}'
                }
                self.post_message(error_response)

# Threading-based implementation
class ThreadedIndicatorWorker:
    def __init__(self):
        self.indicators = TechnicalIndicators()
        self.pattern_recognition = PatternRecognition()
        self.message_queue = queue.Queue()
        self.response_queue = queue.Queue()
        self.running = True
        self.worker_thread = None
    
    def handle_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle incoming messages synchronously"""
        message_id = message_data.get('id')
        method = message_data.get('method')
        args = message_data.get('args', [])
        
        try:
            result = None
            
            # Route the method call to the appropriate handler
            method_map = {
                'sma': self.indicators.sma,
                'ema': self.indicators.ema,
                'macd': self.indicators.macd,
                'rsi': self.indicators.rsi,
                'bollingerBands': self.indicators.bollinger_bands,
                'atr': self.indicators.atr,
                'supertrend': self.indicators.supertrend,
                'ichimoku': self.indicators.ichimoku,
                'volumeProfile': self.indicators.volume_profile,
                'fibonacciRetracement': self.indicators.fibonacci_retracement,
                'pivotPoints': self.indicators.pivot_points,
                'detectCandlestickPatterns': self.pattern_recognition.detect_candlestick_patterns,
                'calculateAllIndicators': self.indicators.calculate_all_indicators,
            }
            
            if method in method_map:
                result = method_map[method](*args)
            else:
                raise ValueError(f"Unknown method: {method}")
            
            return {
                'id': message_id,
                'result': result,
                'error': None
            }
            
        except Exception as error:
            return {
                'id': message_id,
                'result': None,
                'error': str(error) or 'Unknown error occurred'
            }
    
    def worker_loop(self):
        """Worker thread main loop"""
        while self.running:
            try:
                # Get message from queue
                message_data = self.message_queue.get(timeout=1.0)
                
                # Process the message
                response = self.handle_message(message_data)
                
                # Put response in response queue
                self.response_queue.put(response)
                
                # Mark task as done
                self.message_queue.task_done()
                
            except queue.Empty:
                continue
            except Exception as error:
                error_response = {
                    'id': -1,
                    'result': None,
                    'error': f'Worker error: {str(error)}'
                }
                self.response_queue.put(error_response)
    
    def start(self):
        """Start the worker thread"""
        self.worker_thread = threading.Thread(target=self.worker_loop)
        self.worker_thread.daemon = True
        self.worker_thread.start()
    
    def post_message(self, message_data: Dict[str, Any]) -> Dict[str, Any]:
        """Post a message to the worker and get response"""
        self.message_queue.put(message_data)
        return self.response_queue.get()  # Block until response
    
    def stop(self):
        """Stop the worker"""
        self.running = False
        if self.worker_thread:
            self.worker_thread.join()

# Main execution for subprocess-style usage
async def main():
    """Main function for running as a subprocess worker"""
    worker = StdinWorker()
    
    # Start both stdin listener and message processor
    await asyncio.gather(
        worker.listen_stdin(),
        worker.process_messages()
    )

if __name__ == "__main__":
    # Run as a subprocess worker
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(json.dumps({
            'id': -1,
            'result': None,
            'error': 'Worker interrupted'
        }), flush=True)
    except Exception as e:
        print(json.dumps({
            'id': -1,
            'result': None,
            'error': f'Fatal error: {str(e)}'
        }), flush=True)
