// Stub — local development only
// Provides no-op implementations of the MemoryManager interface.
// The real implementation would track heap usage, enforce maxSize/maxAge
// constraints on registered data structures, and emit warning/critical events.

const EventEmitter = require('events');

class MemoryManagerStub extends EventEmitter {
    /**
     * Register a data structure for memory tracking.
     * @param {string} name - Identifier for the data structure
     * @param {Map|Set|Array|Object} store - The data structure to track
     * @param {Object} options - { maxSize, maxAge }
     */
    register(name, store, options) {
        // no-op
    }

    /** Begin periodic heap monitoring. */
    start() {
        // no-op
    }

    /** Stop periodic heap monitoring. */
    stop() {
        // no-op
    }

    /**
     * Return a summary report compatible with the shutdown log line:
     *   `${finalReport.heap.used}MB used, ${finalReport.metrics.totalGCs} GCs performed`
     */
    getReport() {
        const heapMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
        return {
            heap: {
                used: heapMB,
                total: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(1),
            },
            metrics: {
                totalGCs: 0,
            },
        };
    }
}

module.exports = new MemoryManagerStub();
