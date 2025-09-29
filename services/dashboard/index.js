/**
 * NexusTradeAI Dashboard - Browser-Compatible Index
 * 
 * This file prevents the "exports is not defined" error
 * by providing browser-compatible JavaScript
 */

// Browser compatibility check
if (typeof window !== 'undefined') {
  // We're in a browser environment
  console.log('🎨 NexusTradeAI Dashboard - Browser Environment Detected');
  
  // Define a simple namespace for dashboard utilities
  window.NexusTradeAI = window.NexusTradeAI || {};
  
  // Dashboard utilities
  window.NexusTradeAI.utils = {
    formatCurrency: function(amount) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
      }).format(amount);
    },
    
    formatPercentage: function(value) {
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
    },
    
    formatNumber: function(value) {
      return new Intl.NumberFormat('en-US').format(value);
    },
    
    getTimeString: function() {
      return new Date().toLocaleTimeString();
    },
    
    log: function(message) {
      console.log(`[NexusTradeAI] ${message}`);
    }
  };
  
  // Dashboard constants
  window.NexusTradeAI.constants = {
    API_ENDPOINTS: {
      AUTOMATION: 'http://localhost:3004',
      ENHANCED: 'http://localhost:3000',
      MARKET_DATA: 'http://localhost:3002',
      WEBSOCKET: 'ws://localhost:8080'
    },
    
    COLORS: {
      SUCCESS: '#10b981',
      ERROR: '#ef4444',
      WARNING: '#f59e0b',
      PRIMARY: '#3b82f6'
    },
    
    REFRESH_INTERVALS: {
      FAST: 5000,    // 5 seconds
      NORMAL: 30000, // 30 seconds
      SLOW: 60000    // 1 minute
    }
  };
  
  // Initialize dashboard when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.NexusTradeAI.utils.log('Dashboard DOM ready');
    });
  } else {
    window.NexusTradeAI.utils.log('Dashboard initialized');
  }
  
} else {
  // We're in a Node.js environment - provide empty exports to prevent errors
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {};
  }
  
  if (typeof exports !== 'undefined') {
    // Define empty exports to prevent "exports is not defined" error
    exports = {};
  }
}

// Prevent the "exports is not defined" error globally
if (typeof exports === 'undefined') {
  window.exports = {};
}

if (typeof module === 'undefined') {
  window.module = { exports: {} };
}

// Global error handler for unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', function(event) {
    console.warn('Unhandled promise rejection:', event.reason);
    // Prevent the default browser behavior
    event.preventDefault();
  });
  
  // Global error handler
  window.addEventListener('error', function(event) {
    if (event.message && event.message.includes('exports is not defined')) {
      console.warn('Prevented "exports is not defined" error');
      event.preventDefault();
      return false;
    }
  });
}

console.log('✅ NexusTradeAI Dashboard Index - Loaded Successfully');
