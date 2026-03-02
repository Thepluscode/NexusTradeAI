/**
 * Memory Management System - Production Grade
 * ==========================================
 * Prevents memory leaks, enforces limits, triggers garbage collection
 */

const EventEmitter = require('events');

class MemoryManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxHeapMB: options.maxHeapMB || 400,        // Max heap size in MB
      warningThresholdPct: options.warningThresholdPct || 0.75,  // 75% warning
      criticalThresholdPct: options.criticalThresholdPct || 0.90, // 90% critical
      checkIntervalMs: options.checkIntervalMs || 10000,  // Check every 10s
      cleanupIntervalMs: options.cleanupIntervalMs || 60000, // Cleanup every 60s
      forceGCThresholdPct: options.forceGCThresholdPct || 0.85  // 85% force GC
    };

    this.metrics = {
      heapUsed: 0,
      heapTotal: 0,
      heapUsedMB: 0,
      heapUsagePercent: 0,
      rss: 0,
      external: 0,
      lastGC: null,
      totalGCs: 0,
      warnings: 0,
      criticals: 0
    };

    this.dataStructures = new Map(); // Track registered data structures
    this.checkInterval = null;
    this.cleanupInterval = null;
  }

  /**
   * Start memory monitoring
   */
  start() {
    console.log(`🧠 Memory Manager started (Max heap: ${this.options.maxHeapMB}MB)`);

    // Check memory usage regularly
    this.checkInterval = setInterval(() => {
      this.checkMemory();
    }, this.options.checkIntervalMs);

    // Cleanup data structures regularly
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupIntervalMs);

    // Initial check
    this.checkMemory();
  }

  /**
   * Stop memory monitoring
   */
  stop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    console.log('🧠 Memory Manager stopped');
  }

  /**
   * Register a data structure for automatic cleanup
   */
  register(name, dataStructure, options = {}) {
    this.dataStructures.set(name, {
      data: dataStructure,
      maxSize: options.maxSize || 1000,
      maxAge: options.maxAge || 3600000, // 1 hour default
      cleanupStrategy: options.cleanupStrategy || 'lru', // lru, fifo, age
      lastCleanup: Date.now()
    });

    console.log(`📝 Registered data structure: ${name} (max: ${options.maxSize || 1000})`);
  }

  /**
   * Check current memory usage
   */
  checkMemory() {
    const usage = process.memoryUsage();

    this.metrics.heapUsed = usage.heapUsed;
    this.metrics.heapTotal = usage.heapTotal;
    this.metrics.heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    this.metrics.heapUsagePercent = (usage.heapUsed / usage.heapTotal);
    this.metrics.rss = usage.rss;
    this.metrics.external = usage.external;

    const heapLimitMB = this.options.maxHeapMB;
    const currentUsagePct = this.metrics.heapUsedMB / heapLimitMB;

    // Emit events based on thresholds
    if (currentUsagePct >= this.options.criticalThresholdPct) {
      this.metrics.criticals++;
      this.emit('critical', {
        heapUsedMB: this.metrics.heapUsedMB,
        heapLimitMB,
        usagePercent: currentUsagePct * 100
      });

      console.error(`🚨 CRITICAL: Memory usage at ${this.metrics.heapUsedMB}MB (${Math.round(currentUsagePct * 100)}%)`);

      // Force garbage collection if available
      if (currentUsagePct >= this.options.forceGCThresholdPct) {
        this.forceGC();
      }

    } else if (currentUsagePct >= this.options.warningThresholdPct) {
      this.metrics.warnings++;
      this.emit('warning', {
        heapUsedMB: this.metrics.heapUsedMB,
        heapLimitMB,
        usagePercent: currentUsagePct * 100
      });

      console.warn(`⚠️  WARNING: Memory usage at ${this.metrics.heapUsedMB}MB (${Math.round(currentUsagePct * 100)}%)`);
    }

    // Emit metrics for monitoring
    this.emit('metrics', this.metrics);

    return this.metrics;
  }

  /**
   * Force garbage collection
   */
  forceGC() {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freedMB = Math.round((before - after) / 1024 / 1024);

      this.metrics.lastGC = new Date();
      this.metrics.totalGCs++;

      console.log(`🗑️  Garbage collection freed ${freedMB}MB`);
      this.emit('gc', { freedMB, before, after });

      return freedMB;
    } else {
      console.warn('⚠️  Garbage collection not available. Start Node with --expose-gc flag');
      return 0;
    }
  }

  /**
   * Cleanup registered data structures
   */
  cleanup() {
    const startTime = Date.now();
    let totalCleaned = 0;

    console.log('🧹 Running memory cleanup cycle...');

    for (const [name, config] of this.dataStructures.entries()) {
      const cleaned = this.cleanupDataStructure(name, config);
      totalCleaned += cleaned;
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Cleanup complete: ${totalCleaned} items removed (${duration}ms)`);

    this.emit('cleanup', { totalCleaned, duration });

    // Force GC after cleanup if memory is high
    const currentUsage = this.metrics.heapUsedMB / this.options.maxHeapMB;
    if (currentUsage > 0.70) {
      this.forceGC();
    }
  }

  /**
   * Clean up a specific data structure
   */
  cleanupDataStructure(name, config) {
    const { data, maxSize, maxAge, cleanupStrategy } = config;
    let cleaned = 0;

    try {
      if (data instanceof Map) {
        cleaned = this.cleanupMap(data, maxSize, maxAge, cleanupStrategy);
      } else if (data instanceof Set) {
        cleaned = this.cleanupSet(data, maxSize, maxAge, cleanupStrategy);
      } else if (Array.isArray(data)) {
        cleaned = this.cleanupArray(data, maxSize, maxAge, cleanupStrategy);
      }

      if (cleaned > 0) {
        console.log(`  🧹 ${name}: Cleaned ${cleaned} items (${data.size || data.length} remaining)`);
      }

      config.lastCleanup = Date.now();
    } catch (error) {
      console.error(`❌ Error cleaning ${name}:`, error);
    }

    return cleaned;
  }

  /**
   * Clean up Map data structure
   */
  cleanupMap(map, maxSize, maxAge, strategy) {
    if (map.size <= maxSize && strategy !== 'age') {
      return 0;
    }

    const now = Date.now();
    let cleaned = 0;

    // Age-based cleanup
    if (maxAge) {
      for (const [key, value] of map.entries()) {
        const timestamp = value.timestamp || value.created_at || value.time;
        if (timestamp && (now - new Date(timestamp).getTime()) > maxAge) {
          map.delete(key);
          cleaned++;
        }
      }
    }

    // Size-based cleanup (remove oldest if strategy is LRU)
    if (map.size > maxSize) {
      const toRemove = map.size - maxSize;
      const entries = Array.from(map.entries());

      if (strategy === 'lru' || strategy === 'fifo') {
        // Remove oldest entries
        for (let i = 0; i < toRemove; i++) {
          map.delete(entries[i][0]);
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Clean up Set data structure
   */
  cleanupSet(set, maxSize, _maxAge, _strategy) {
    if (set.size <= maxSize) {
      return 0;
    }

    const toRemove = set.size - maxSize;
    const items = Array.from(set);
    let cleaned = 0;

    // Remove oldest items
    for (let i = 0; i < toRemove; i++) {
      set.delete(items[i]);
      cleaned++;
    }

    return cleaned;
  }

  /**
   * Clean up Array data structure
   */
  cleanupArray(array, maxSize, maxAge, strategy) {
    const originalLength = array.length;

    if (originalLength <= maxSize && strategy !== 'age') {
      return 0;
    }

    const now = Date.now();

    // Age-based cleanup
    if (maxAge) {
      const filtered = array.filter(item => {
        const timestamp = item.timestamp || item.created_at || item.time;
        if (!timestamp) return true;
        return (now - new Date(timestamp).getTime()) <= maxAge;
      });

      if (filtered.length < originalLength) {
        array.length = 0;
        array.push(...filtered);
      }
    }

    // Size-based cleanup
    if (array.length > maxSize) {
      if (strategy === 'fifo') {
        array.splice(0, array.length - maxSize);
      } else {
        array.splice(maxSize);
      }
    }

    return originalLength - array.length;
  }

  /**
   * Get detailed memory report
   */
  getReport() {
    const usage = process.memoryUsage();
    const heapLimitMB = this.options.maxHeapMB;
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);

    return {
      heap: {
        used: heapUsedMB,
        total: Math.round(usage.heapTotal / 1024 / 1024),
        limit: heapLimitMB,
        usagePercent: Math.round((heapUsedMB / heapLimitMB) * 100),
        external: Math.round(usage.external / 1024 / 1024)
      },
      process: {
        rss: Math.round(usage.rss / 1024 / 1024),
        pid: process.pid,
        uptime: Math.round(process.uptime())
      },
      dataStructures: Array.from(this.dataStructures.entries()).map(([name, config]) => ({
        name,
        size: config.data.size || config.data.length || 0,
        maxSize: config.maxSize,
        lastCleanup: config.lastCleanup
      })),
      metrics: {
        totalGCs: this.metrics.totalGCs,
        lastGC: this.metrics.lastGC,
        warnings: this.metrics.warnings,
        criticals: this.metrics.criticals
      },
      thresholds: {
        warning: `${Math.round(this.options.warningThresholdPct * 100)}%`,
        critical: `${Math.round(this.options.criticalThresholdPct * 100)}%`,
        forceGC: `${Math.round(this.options.forceGCThresholdPct * 100)}%`
      }
    };
  }

  /**
   * Get metrics for Prometheus
   */
  getPrometheusMetrics() {
    const usage = process.memoryUsage();

    return {
      memory_heap_used_bytes: usage.heapUsed,
      memory_heap_total_bytes: usage.heapTotal,
      memory_heap_usage_percent: this.metrics.heapUsagePercent * 100,
      memory_rss_bytes: usage.rss,
      memory_external_bytes: usage.external,
      memory_gc_total: this.metrics.totalGCs,
      memory_warnings_total: this.metrics.warnings,
      memory_criticals_total: this.metrics.criticals
    };
  }
}

// Singleton instance
const memoryManager = new MemoryManager({
  maxHeapMB: parseInt(process.env.MAX_HEAP_MB || '400'),
  warningThresholdPct: 0.75,
  criticalThresholdPct: 0.90,
  forceGCThresholdPct: 0.85,
  checkIntervalMs: 10000,
  cleanupIntervalMs: 60000
});

// Auto-start on require
if (process.env.NODE_ENV === 'production') {
  memoryManager.start();
}

module.exports = memoryManager;
