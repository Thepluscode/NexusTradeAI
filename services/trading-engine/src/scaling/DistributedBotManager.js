// Distributed Bot Management System
// Scales to millions of concurrent users with Kubernetes auto-scaling and Redis clustering

const EventEmitter = require('events');
const Redis = require('ioredis');
const { Worker } = require('worker_threads');
const os = require('os');

class DistributedBotManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.nodeId = options.nodeId || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Redis cluster for distributed coordination
    this.redis = new Redis.Cluster(options.redisCluster || [
      { host: 'redis-cluster-0', port: 6379 },
      { host: 'redis-cluster-1', port: 6379 },
      { host: 'redis-cluster-2', port: 6379 }
    ], {
      enableOfflineQueue: false,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });
    
    // Bot distribution and load balancing
    this.botRegistry = new Map(); // Local bot instances
    this.workerPool = new Map(); // Worker threads for bot execution
    this.loadBalancer = new LoadBalancer(this.redis, this.nodeId);
    this.healthMonitor = new HealthMonitor(this.redis, this.nodeId);
    
    // Scaling configuration
    this.config = {
      maxBotsPerNode: options.maxBotsPerNode || 10000,
      maxWorkersPerNode: options.maxWorkersPerNode || os.cpus().length * 2,
      botDistributionStrategy: options.botDistributionStrategy || 'ROUND_ROBIN',
      autoScaling: {
        enabled: options.autoScaling?.enabled || true,
        scaleUpThreshold: options.autoScaling?.scaleUpThreshold || 0.8, // 80% CPU
        scaleDownThreshold: options.autoScaling?.scaleDownThreshold || 0.3, // 30% CPU
        cooldownPeriod: options.autoScaling?.cooldownPeriod || 300000, // 5 minutes
      },
      healthCheck: {
        interval: options.healthCheck?.interval || 30000, // 30 seconds
        timeout: options.healthCheck?.timeout || 5000, // 5 seconds
      }
    };
    
    // Performance metrics
    this.metrics = {
      totalBots: 0,
      activeBots: 0,
      totalUsers: 0,
      activeUsers: 0,
      ordersPerSecond: 0,
      averageLatency: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      lastScalingAction: null
    };
    
    this.initializeDistributedSystem();
  }

  /**
   * Initialize distributed system components
   */
  async initializeDistributedSystem() {
    try {
      // Connect to Redis cluster
      await this.redis.connect();
      
      // Register this node in the cluster
      await this.registerNode();
      
      // Start health monitoring
      this.healthMonitor.start();
      
      // Start load balancing
      this.loadBalancer.start();
      
      // Setup auto-scaling
      if (this.config.autoScaling.enabled) {
        this.startAutoScaling();
      }
      
      // Setup distributed event handling
      this.setupDistributedEvents();
      
      // Initialize worker pool
      this.initializeWorkerPool();
      
      this.logger?.info(`🚀 Distributed Bot Manager initialized on node ${this.nodeId}`);
      
    } catch (error) {
      this.logger?.error('Failed to initialize distributed system:', error);
      throw error;
    }
  }

  /**
   * Register this node in the distributed cluster
   */
  async registerNode() {
    const nodeInfo = {
      nodeId: this.nodeId,
      hostname: os.hostname(),
      pid: process.pid,
      startTime: Date.now(),
      capabilities: {
        maxBots: this.config.maxBotsPerNode,
        maxWorkers: this.config.maxWorkersPerNode,
        cpuCores: os.cpus().length,
        totalMemory: os.totalmem()
      },
      status: 'ACTIVE',
      lastHeartbeat: Date.now()
    };
    
    // Register in Redis with TTL
    await this.redis.setex(
      `nodes:${this.nodeId}`, 
      60, // 60 second TTL
      JSON.stringify(nodeInfo)
    );
    
    // Add to active nodes set
    await this.redis.sadd('active_nodes', this.nodeId);
    
    // Start heartbeat
    this.startHeartbeat();
    
    this.logger?.info(`Node ${this.nodeId} registered in cluster`);
  }

  /**
   * Start heartbeat to maintain node registration
   */
  startHeartbeat() {
    setInterval(async () => {
      try {
        await this.redis.setex(
          `nodes:${this.nodeId}:heartbeat`,
          60,
          Date.now().toString()
        );
        
        // Update node metrics
        await this.updateNodeMetrics();
        
      } catch (error) {
        this.logger?.error('Heartbeat failed:', error);
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Update node performance metrics
   */
  async updateNodeMetrics() {
    const metrics = {
      nodeId: this.nodeId,
      timestamp: Date.now(),
      bots: {
        total: this.botRegistry.size,
        active: Array.from(this.botRegistry.values()).filter(bot => bot.isActive).length
      },
      workers: {
        total: this.workerPool.size,
        active: Array.from(this.workerPool.values()).filter(worker => !worker.isIdle).length
      },
      system: {
        cpuUsage: await this.getCPUUsage(),
        memoryUsage: this.getMemoryUsage(),
        loadAverage: os.loadavg()[0]
      },
      performance: {
        ordersPerSecond: this.metrics.ordersPerSecond,
        averageLatency: this.metrics.averageLatency
      }
    };
    
    // Store metrics in Redis
    await this.redis.setex(
      `metrics:${this.nodeId}`,
      300, // 5 minute TTL
      JSON.stringify(metrics)
    );
    
    // Update local metrics
    this.metrics = { ...this.metrics, ...metrics.system };
  }

  /**
   * Create distributed bot instance
   */
  async createDistributedBot(userId, botConfig) {
    try {
      // Determine optimal node for bot placement
      const targetNode = await this.loadBalancer.selectOptimalNode(botConfig);
      
      if (targetNode === this.nodeId) {
        // Create bot on this node
        return await this.createLocalBot(userId, botConfig);
      } else {
        // Delegate to another node
        return await this.delegateBotCreation(targetNode, userId, botConfig);
      }
      
    } catch (error) {
      this.logger?.error('Error creating distributed bot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create bot locally on this node
   */
  async createLocalBot(userId, botConfig) {
    try {
      // Check capacity
      if (this.botRegistry.size >= this.config.maxBotsPerNode) {
        throw new Error('Node at maximum bot capacity');
      }
      
      const botId = `bot_${userId}_${Date.now()}_${this.nodeId}`;
      
      // Assign bot to worker
      const worker = await this.assignBotToWorker(botId, botConfig);
      
      const bot = {
        id: botId,
        userId,
        config: botConfig,
        nodeId: this.nodeId,
        workerId: worker.id,
        isActive: false,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        performance: {
          totalTrades: 0,
          totalPnL: 0,
          uptime: 0
        }
      };
      
      // Store bot locally
      this.botRegistry.set(botId, bot);
      
      // Register bot in distributed registry
      await this.redis.hset('global_bots', botId, JSON.stringify({
        nodeId: this.nodeId,
        userId,
        status: 'CREATED',
        createdAt: bot.createdAt
      }));
      
      // Add to user's bot list
      await this.redis.sadd(`user_bots:${userId}`, botId);
      
      this.logger?.info(`Created bot ${botId} on node ${this.nodeId}`);
      this.emit('botCreated', { botId, nodeId: this.nodeId });
      
      return {
        success: true,
        botId,
        nodeId: this.nodeId,
        workerId: worker.id
      };
      
    } catch (error) {
      this.logger?.error('Error creating local bot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Assign bot to optimal worker thread
   */
  async assignBotToWorker(botId, botConfig) {
    // Find worker with lowest load
    let optimalWorker = null;
    let minLoad = Infinity;
    
    for (const [workerId, worker] of this.workerPool) {
      if (worker.botCount < worker.maxBots && worker.load < minLoad) {
        optimalWorker = worker;
        minLoad = worker.load;
      }
    }
    
    // Create new worker if needed and capacity allows
    if (!optimalWorker && this.workerPool.size < this.config.maxWorkersPerNode) {
      optimalWorker = await this.createWorker();
    }
    
    if (!optimalWorker) {
      throw new Error('No available workers for bot assignment');
    }
    
    // Assign bot to worker
    optimalWorker.bots.add(botId);
    optimalWorker.botCount++;
    optimalWorker.load = optimalWorker.botCount / optimalWorker.maxBots;
    
    // Send bot configuration to worker
    optimalWorker.worker.postMessage({
      type: 'CREATE_BOT',
      botId,
      config: botConfig
    });
    
    return optimalWorker;
  }

  /**
   * Create new worker thread
   */
  async createWorker() {
    const workerId = `worker_${this.nodeId}_${Date.now()}`;
    
    const worker = new Worker('./BotWorker.js', {
      workerData: {
        workerId,
        nodeId: this.nodeId,
        redisConfig: this.redis.options
      }
    });
    
    const workerInfo = {
      id: workerId,
      worker,
      bots: new Set(),
      botCount: 0,
      maxBots: Math.floor(this.config.maxBotsPerNode / this.config.maxWorkersPerNode),
      load: 0,
      isIdle: true,
      createdAt: Date.now(),
      lastActivity: Date.now()
    };
    
    // Setup worker event handlers
    worker.on('message', (message) => {
      this.handleWorkerMessage(workerId, message);
    });
    
    worker.on('error', (error) => {
      this.logger?.error(`Worker ${workerId} error:`, error);
      this.handleWorkerError(workerId, error);
    });
    
    worker.on('exit', (code) => {
      this.logger?.warn(`Worker ${workerId} exited with code ${code}`);
      this.handleWorkerExit(workerId, code);
    });
    
    this.workerPool.set(workerId, workerInfo);
    
    this.logger?.info(`Created worker ${workerId}`);
    return workerInfo;
  }

  /**
   * Handle messages from worker threads
   */
  handleWorkerMessage(workerId, message) {
    const worker = this.workerPool.get(workerId);
    if (!worker) return;
    
    worker.lastActivity = Date.now();
    worker.isIdle = false;
    
    switch (message.type) {
      case 'BOT_STARTED':
        this.handleBotStarted(message.botId, workerId);
        break;
        
      case 'BOT_STOPPED':
        this.handleBotStopped(message.botId, workerId);
        break;
        
      case 'BOT_TRADE':
        this.handleBotTrade(message.botId, message.trade);
        break;
        
      case 'BOT_ERROR':
        this.handleBotError(message.botId, message.error);
        break;
        
      case 'WORKER_METRICS':
        this.updateWorkerMetrics(workerId, message.metrics);
        break;
        
      default:
        this.logger?.warn(`Unknown message type from worker ${workerId}:`, message.type);
    }
  }

  /**
   * Start bot on distributed system
   */
  async startDistributedBot(botId, userId) {
    try {
      // Check if bot exists locally
      const localBot = this.botRegistry.get(botId);
      
      if (localBot) {
        return await this.startLocalBot(botId);
      } else {
        // Find bot on other nodes
        const botInfo = await this.redis.hget('global_bots', botId);
        if (!botInfo) {
          throw new Error('Bot not found');
        }
        
        const { nodeId } = JSON.parse(botInfo);
        return await this.delegateBotStart(nodeId, botId, userId);
      }
      
    } catch (error) {
      this.logger?.error('Error starting distributed bot:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Start bot locally
   */
  async startLocalBot(botId) {
    const bot = this.botRegistry.get(botId);
    if (!bot) {
      throw new Error('Bot not found on this node');
    }
    
    const worker = this.workerPool.get(bot.workerId);
    if (!worker) {
      throw new Error('Worker not found for bot');
    }
    
    // Send start command to worker
    worker.worker.postMessage({
      type: 'START_BOT',
      botId
    });
    
    bot.isActive = true;
    bot.startedAt = Date.now();
    
    // Update distributed registry
    await this.redis.hset('global_bots', botId, JSON.stringify({
      ...JSON.parse(await this.redis.hget('global_bots', botId)),
      status: 'ACTIVE',
      startedAt: bot.startedAt
    }));
    
    this.logger?.info(`Started bot ${botId} on node ${this.nodeId}`);
    this.emit('botStarted', { botId, nodeId: this.nodeId });
    
    return { success: true, message: 'Bot started successfully' };
  }

  /**
   * Auto-scaling based on system metrics
   */
  startAutoScaling() {
    setInterval(async () => {
      try {
        const metrics = await this.getClusterMetrics();
        const scalingDecision = this.evaluateScalingNeeds(metrics);
        
        if (scalingDecision.action !== 'NONE') {
          await this.executeScalingAction(scalingDecision);
        }
        
      } catch (error) {
        this.logger?.error('Auto-scaling error:', error);
      }
    }, this.config.autoScaling.cooldownPeriod);
  }

  /**
   * Evaluate if scaling is needed
   */
  evaluateScalingNeeds(clusterMetrics) {
    const avgCpuUsage = clusterMetrics.avgCpuUsage;
    const avgMemoryUsage = clusterMetrics.avgMemoryUsage;
    const totalBots = clusterMetrics.totalBots;
    const activeNodes = clusterMetrics.activeNodes;
    
    // Scale up conditions
    if (avgCpuUsage > this.config.autoScaling.scaleUpThreshold ||
        avgMemoryUsage > this.config.autoScaling.scaleUpThreshold ||
        totalBots / activeNodes > this.config.maxBotsPerNode * 0.8) {
      
      return {
        action: 'SCALE_UP',
        reason: 'High resource usage or bot density',
        targetNodes: Math.ceil(activeNodes * 1.5),
        metrics: clusterMetrics
      };
    }
    
    // Scale down conditions
    if (avgCpuUsage < this.config.autoScaling.scaleDownThreshold &&
        avgMemoryUsage < this.config.autoScaling.scaleDownThreshold &&
        totalBots / activeNodes < this.config.maxBotsPerNode * 0.3 &&
        activeNodes > 1) {
      
      return {
        action: 'SCALE_DOWN',
        reason: 'Low resource usage',
        targetNodes: Math.max(1, Math.floor(activeNodes * 0.7)),
        metrics: clusterMetrics
      };
    }
    
    return { action: 'NONE' };
  }

  /**
   * Execute scaling action via Kubernetes
   */
  async executeScalingAction(scalingDecision) {
    try {
      if (scalingDecision.action === 'SCALE_UP') {
        await this.scaleUpCluster(scalingDecision.targetNodes);
      } else if (scalingDecision.action === 'SCALE_DOWN') {
        await this.scaleDownCluster(scalingDecision.targetNodes);
      }
      
      this.metrics.lastScalingAction = {
        action: scalingDecision.action,
        timestamp: Date.now(),
        reason: scalingDecision.reason,
        targetNodes: scalingDecision.targetNodes
      };
      
      this.logger?.info(`Executed scaling action: ${scalingDecision.action} to ${scalingDecision.targetNodes} nodes`);
      
    } catch (error) {
      this.logger?.error('Scaling action failed:', error);
    }
  }

  /**
   * Scale up cluster by adding nodes
   */
  async scaleUpCluster(targetNodes) {
    // This would integrate with Kubernetes API
    const k8sClient = require('./KubernetesClient');

    await k8sClient.scaleDeployment('nexus-trading-engine', targetNodes);

    // Wait for new nodes to come online
    await this.waitForNodesReady(targetNodes);
  }

  /**
   * Scale down cluster by removing nodes
   */
  async scaleDownCluster(targetNodes) {
    const currentNodes = await this.redis.smembers('active_nodes');
    const nodesToRemove = currentNodes.length - targetNodes;

    if (nodesToRemove <= 0) return;

    // Select nodes with lowest load for removal
    const nodeMetrics = await this.getNodeMetrics();
    const sortedNodes = nodeMetrics.sort((a, b) => a.load - b.load);
    const nodesToShutdown = sortedNodes.slice(0, nodesToRemove);

    // Gracefully migrate bots from nodes being removed
    for (const node of nodesToShutdown) {
      await this.migrateBots(node.nodeId);
    }

    // Scale down Kubernetes deployment
    const k8sClient = require('./KubernetesClient');
    await k8sClient.scaleDeployment('nexus-trading-engine', targetNodes);
  }

  /**
   * Migrate bots from one node to others
   */
  async migrateBots(sourceNodeId) {
    try {
      // Get all bots on the source node
      const bots = await this.getBotsOnNode(sourceNodeId);

      for (const bot of bots) {
        // Find optimal target node
        const targetNode = await this.loadBalancer.selectOptimalNode(bot.config);

        if (targetNode !== sourceNodeId) {
          await this.migrateBotToNode(bot.id, sourceNodeId, targetNode);
        }
      }

      this.logger?.info(`Migrated ${bots.length} bots from node ${sourceNodeId}`);

    } catch (error) {
      this.logger?.error(`Error migrating bots from node ${sourceNodeId}:`, error);
    }
  }

  /**
   * Get cluster-wide metrics
   */
  async getClusterMetrics() {
    const activeNodes = await this.redis.smembers('active_nodes');
    const nodeMetrics = [];

    for (const nodeId of activeNodes) {
      try {
        const metrics = await this.redis.get(`metrics:${nodeId}`);
        if (metrics) {
          nodeMetrics.push(JSON.parse(metrics));
        }
      } catch (error) {
        this.logger?.warn(`Failed to get metrics for node ${nodeId}`);
      }
    }

    if (nodeMetrics.length === 0) {
      return {
        activeNodes: 0,
        totalBots: 0,
        avgCpuUsage: 0,
        avgMemoryUsage: 0,
        avgLatency: 0
      };
    }

    return {
      activeNodes: nodeMetrics.length,
      totalBots: nodeMetrics.reduce((sum, m) => sum + m.bots.total, 0),
      avgCpuUsage: nodeMetrics.reduce((sum, m) => sum + m.system.cpuUsage, 0) / nodeMetrics.length,
      avgMemoryUsage: nodeMetrics.reduce((sum, m) => sum + m.system.memoryUsage, 0) / nodeMetrics.length,
      avgLatency: nodeMetrics.reduce((sum, m) => sum + m.performance.averageLatency, 0) / nodeMetrics.length,
      nodeMetrics
    };
  }

  /**
   * Get system resource usage
   */
  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const totalUsage = endUsage.user + endUsage.system;
        const cpuPercent = (totalUsage / 1000000) / 1; // Convert to percentage
        resolve(Math.min(cpuPercent, 100));
      }, 100);
    });
  }

  /**
   * Get memory usage percentage
   */
  getMemoryUsage() {
    const used = process.memoryUsage();
    const total = os.totalmem();
    return (used.rss / total) * 100;
  }

  /**
   * Setup distributed event handling
   */
  setupDistributedEvents() {
    // Subscribe to cluster events
    const subscriber = new Redis.Cluster(this.redis.options.nodes);

    subscriber.subscribe('bot_events', 'scaling_events', 'health_events');

    subscriber.on('message', (channel, message) => {
      try {
        const event = JSON.parse(message);
        this.handleDistributedEvent(channel, event);
      } catch (error) {
        this.logger?.error('Error handling distributed event:', error);
      }
    });
  }

  /**
   * Handle distributed events
   */
  handleDistributedEvent(channel, event) {
    switch (channel) {
      case 'bot_events':
        this.emit('distributedBotEvent', event);
        break;

      case 'scaling_events':
        this.handleScalingEvent(event);
        break;

      case 'health_events':
        this.handleHealthEvent(event);
        break;
    }
  }

  /**
   * Initialize worker pool
   */
  initializeWorkerPool() {
    const initialWorkers = Math.min(2, this.config.maxWorkersPerNode);

    for (let i = 0; i < initialWorkers; i++) {
      this.createWorker();
    }

    this.logger?.info(`Initialized worker pool with ${initialWorkers} workers`);
  }

  /**
   * Get distributed bot performance
   */
  async getDistributedBotPerformance(botId) {
    try {
      // Check if bot is local
      const localBot = this.botRegistry.get(botId);
      if (localBot) {
        return this.getLocalBotPerformance(botId);
      }

      // Find bot on other nodes
      const botInfo = await this.redis.hget('global_bots', botId);
      if (!botInfo) {
        return null;
      }

      const { nodeId } = JSON.parse(botInfo);
      return await this.requestBotPerformance(nodeId, botId);

    } catch (error) {
      this.logger?.error('Error getting distributed bot performance:', error);
      return null;
    }
  }

  /**
   * Get performance metrics for the distributed system
   */
  getDistributedSystemMetrics() {
    return {
      node: {
        id: this.nodeId,
        bots: this.botRegistry.size,
        workers: this.workerPool.size,
        uptime: Date.now() - this.startTime,
        ...this.metrics
      },
      cluster: {
        // These would be populated from Redis cluster data
        totalNodes: 0,
        totalBots: 0,
        totalUsers: 0,
        systemLoad: 0
      }
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    try {
      this.logger?.info(`Shutting down node ${this.nodeId}...`);

      // Stop accepting new bots
      await this.redis.srem('active_nodes', this.nodeId);

      // Migrate all bots to other nodes
      await this.migrateBots(this.nodeId);

      // Shutdown workers
      for (const [workerId, worker] of this.workerPool) {
        worker.worker.terminate();
      }

      // Cleanup Redis connections
      await this.redis.disconnect();

      this.logger?.info(`Node ${this.nodeId} shutdown complete`);

    } catch (error) {
      this.logger?.error('Error during shutdown:', error);
    }
  }
}

// Load Balancer for optimal bot placement
class LoadBalancer {
  constructor(redis, nodeId) {
    this.redis = redis;
    this.nodeId = nodeId;
    this.strategy = 'WEIGHTED_ROUND_ROBIN';
  }

  async selectOptimalNode(botConfig) {
    const activeNodes = await this.redis.smembers('active_nodes');
    if (activeNodes.length === 0) return this.nodeId;

    const nodeScores = [];

    for (const nodeId of activeNodes) {
      const score = await this.calculateNodeScore(nodeId, botConfig);
      nodeScores.push({ nodeId, score });
    }

    // Sort by score (higher is better)
    nodeScores.sort((a, b) => b.score - a.score);

    return nodeScores[0].nodeId;
  }

  async calculateNodeScore(nodeId, botConfig) {
    try {
      const metrics = await this.redis.get(`metrics:${nodeId}`);
      if (!metrics) return 0;

      const nodeMetrics = JSON.parse(metrics);
      let score = 100;

      // CPU usage penalty
      score -= nodeMetrics.system.cpuUsage;

      // Memory usage penalty
      score -= nodeMetrics.system.memoryUsage;

      // Bot density penalty
      const botDensity = nodeMetrics.bots.total / 10000; // Normalize to 0-1
      score -= botDensity * 20;

      // Latency penalty
      score -= nodeMetrics.performance.averageLatency / 100;

      return Math.max(score, 0);

    } catch (error) {
      return 0;
    }
  }

  start() {
    // Load balancer is now active
  }
}

// Health Monitor for cluster health
class HealthMonitor {
  constructor(redis, nodeId) {
    this.redis = redis;
    this.nodeId = nodeId;
  }

  start() {
    setInterval(async () => {
      await this.checkClusterHealth();
    }, 30000); // Every 30 seconds
  }

  async checkClusterHealth() {
    try {
      const activeNodes = await this.redis.smembers('active_nodes');
      const unhealthyNodes = [];

      for (const nodeId of activeNodes) {
        const lastHeartbeat = await this.redis.get(`nodes:${nodeId}:heartbeat`);

        if (!lastHeartbeat || Date.now() - parseInt(lastHeartbeat) > 120000) {
          unhealthyNodes.push(nodeId);
        }
      }

      // Remove unhealthy nodes
      for (const nodeId of unhealthyNodes) {
        await this.redis.srem('active_nodes', nodeId);
        await this.redis.publish('health_events', JSON.stringify({
          type: 'NODE_UNHEALTHY',
          nodeId,
          timestamp: Date.now()
        }));
      }

    } catch (error) {
      console.error('Health check failed:', error);
    }
  }
}

module.exports = DistributedBotManager;
