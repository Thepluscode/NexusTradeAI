import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Performance monitoring
const startTime = performance.now();

// Error boundary for the entire application
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Pro Terminal Error:', error, errorInfo);
    
    // In production, send error to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // sendErrorToMonitoring(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0a0a',
          color: '#fff',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '20px',
        }}>
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            borderRadius: '8px',
            padding: '40px',
            maxWidth: '500px',
          }}>
            <h1 style={{ 
              color: '#ff5252', 
              marginBottom: '16px',
              fontSize: '24px',
            }}>
              🚨 Terminal Error
            </h1>
            <p style={{ 
              marginBottom: '20px',
              color: '#ccc',
              lineHeight: '1.5',
            }}>
              The NexusTrade Pro Terminal encountered an unexpected error.
              Please refresh the page or contact support if the issue persists.
            </p>
            <details style={{ 
              marginBottom: '20px',
              textAlign: 'left',
              background: '#2a2a2a',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              fontFamily: 'monospace',
            }}>
              <summary style={{ cursor: 'pointer', marginBottom: '8px' }}>
                Error Details
              </summary>
              <pre style={{ 
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: '#ff8a65',
              }}>
                {this.state.error?.stack || this.state.error?.message || 'Unknown error'}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#007bff',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                padding: '10px 20px',
                fontSize: '14px',
                cursor: 'pointer',
                marginRight: '12px',
              }}
            >
              Reload Terminal
            </button>
            <button
              onClick={() => window.history.back()}
              style={{
                background: '#6c757d',
                border: 'none',
                borderRadius: '4px',
                color: 'white',
                padding: '10px 20px',
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              Go Back
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Initialize the application
const initializeApp = () => {
  const container = document.getElementById('root');
  
  if (!container) {
    throw new Error('Root container not found');
  }

  const root = createRoot(container);

  // Render the application with error boundary
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );

  // Log initialization time
  const endTime = performance.now();
  console.log(`🚀 NexusTrade Pro Terminal initialized in ${(endTime - startTime).toFixed(2)}ms`);

  // Performance monitoring
  if ('performance' in window && 'measure' in performance) {
    performance.mark('app-start');
    
    // Measure time to interactive
    setTimeout(() => {
      performance.mark('app-interactive');
      performance.measure('app-load-time', 'app-start', 'app-interactive');
      
      const measure = performance.getEntriesByName('app-load-time')[0];
      console.log(`📊 Time to Interactive: ${measure.duration.toFixed(2)}ms`);
    }, 0);
  }

  // Register service worker for caching (production only)
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }

  // Global error handlers
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    // Send to monitoring service in production
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    // Send to monitoring service in production
  });

  // Performance observer for monitoring
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'navigation') {
          console.log(`📈 Navigation timing:`, {
            domContentLoaded: entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart,
            loadComplete: entry.loadEventEnd - entry.loadEventStart,
            totalTime: entry.loadEventEnd - entry.fetchStart,
          });
        }
      }
    });
    
    observer.observe({ entryTypes: ['navigation'] });
  }

  // Memory usage monitoring (development only)
  if (process.env.NODE_ENV === 'development' && 'memory' in performance) {
    setInterval(() => {
      const memory = (performance as any).memory;
      if (memory) {
        console.log(`💾 Memory usage:`, {
          used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
          limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
        });
      }
    }, 30000); // Every 30 seconds
  }
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Hot module replacement for development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./App', () => {
    console.log('🔄 Hot reloading App component');
    initializeApp();
  });
}
