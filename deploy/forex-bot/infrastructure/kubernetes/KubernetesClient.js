// Kubernetes Client for Auto-Scaling
// Manages Kubernetes deployments for dynamic scaling of trading engine nodes

const k8s = require('@kubernetes/client-node');

class KubernetesClient {
  constructor(options = {}) {
    this.logger = options.logger;
    
    // Initialize Kubernetes client
    this.kc = new k8s.KubeConfig();
    
    if (process.env.NODE_ENV === 'production') {
      // Load from cluster (when running inside Kubernetes)
      this.kc.loadFromCluster();
    } else {
      // Load from kubeconfig file (for development)
      this.kc.loadFromDefault();
    }
    
    this.k8sApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.metricsApi = this.kc.makeApiClient(k8s.Metrics);
    
    this.namespace = options.namespace || 'nexus-trading';
    
    // Scaling configuration
    this.config = {
      minReplicas: options.minReplicas || 1,
      maxReplicas: options.maxReplicas || 100,
      scaleUpCooldown: options.scaleUpCooldown || 300000, // 5 minutes
      scaleDownCooldown: options.scaleDownCooldown || 600000, // 10 minutes
      lastScalingAction: null
    };
    
    this.logger?.info('🎛️ Kubernetes client initialized');
  }

  /**
   * Scale deployment to target replica count
   */
  async scaleDeployment(deploymentName, targetReplicas) {
    try {
      // Validate replica count
      const replicas = Math.max(
        this.config.minReplicas,
        Math.min(targetReplicas, this.config.maxReplicas)
      );
      
      // Check cooldown period
      if (this.isInCooldown()) {
        this.logger?.warn('Scaling action skipped due to cooldown period');
        return { success: false, reason: 'Cooldown period active' };
      }
      
      // Get current deployment
      const deployment = await this.k8sApi.readNamespacedDeployment(
        deploymentName,
        this.namespace
      );
      
      const currentReplicas = deployment.body.spec.replicas;
      
      if (currentReplicas === replicas) {
        return { success: true, message: 'Already at target replica count' };
      }
      
      // Update deployment
      deployment.body.spec.replicas = replicas;
      
      await this.k8sApi.patchNamespacedDeployment(
        deploymentName,
        this.namespace,
        deployment.body,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: { 'Content-Type': 'application/merge-patch+json' }
        }
      );
      
      // Update scaling history
      this.config.lastScalingAction = {
        timestamp: Date.now(),
        from: currentReplicas,
        to: replicas,
        deployment: deploymentName
      };
      
      this.logger?.info(`Scaled ${deploymentName} from ${currentReplicas} to ${replicas} replicas`);
      
      // Wait for rollout to complete
      await this.waitForRollout(deploymentName);
      
      return {
        success: true,
        previousReplicas: currentReplicas,
        newReplicas: replicas,
        message: `Successfully scaled to ${replicas} replicas`
      };
      
    } catch (error) {
      this.logger?.error('Error scaling deployment:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Wait for deployment rollout to complete
   */
  async waitForRollout(deploymentName, timeoutMs = 300000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const deployment = await this.k8sApi.readNamespacedDeployment(
          deploymentName,
          this.namespace
        );
        
        const status = deployment.body.status;
        const spec = deployment.body.spec;
        
        // Check if rollout is complete
        if (status.readyReplicas === spec.replicas &&
            status.updatedReplicas === spec.replicas &&
            status.availableReplicas === spec.replicas) {
          
          this.logger?.info(`Rollout completed for ${deploymentName}`);
          return true;
        }
        
        // Wait before next check
        await new Promise(resolve => setTimeout(resolve, 5000));
        
      } catch (error) {
        this.logger?.error('Error checking rollout status:', error);
      }
    }
    
    this.logger?.warn(`Rollout timeout for ${deploymentName}`);
    return false;
  }

  /**
   * Get deployment status and metrics
   */
  async getDeploymentStatus(deploymentName) {
    try {
      const deployment = await this.k8sApi.readNamespacedDeployment(
        deploymentName,
        this.namespace
      );
      
      const status = deployment.body.status;
      const spec = deployment.body.spec;
      
      return {
        name: deploymentName,
        namespace: this.namespace,
        replicas: {
          desired: spec.replicas,
          ready: status.readyReplicas || 0,
          available: status.availableReplicas || 0,
          updated: status.updatedReplicas || 0
        },
        conditions: status.conditions || [],
        isHealthy: status.readyReplicas === spec.replicas,
        lastUpdate: status.conditions?.[0]?.lastUpdateTime
      };
      
    } catch (error) {
      this.logger?.error('Error getting deployment status:', error);
      return null;
    }
  }

  /**
   * Get pod metrics for resource usage
   */
  async getPodMetrics(deploymentName) {
    try {
      // Get pods for deployment
      const pods = await this.coreApi.listNamespacedPod(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentName}`
      );
      
      const podMetrics = [];
      
      for (const pod of pods.body.items) {
        try {
          // Get metrics for each pod
          const metrics = await this.metricsApi.readNamespacedPodMetrics(
            pod.metadata.name,
            this.namespace
          );
          
          const containers = metrics.body.containers || [];
          let totalCpu = 0;
          let totalMemory = 0;
          
          for (const container of containers) {
            // Parse CPU usage (in nanocores)
            const cpuUsage = this.parseCpuUsage(container.usage.cpu);
            totalCpu += cpuUsage;
            
            // Parse memory usage (in bytes)
            const memoryUsage = this.parseMemoryUsage(container.usage.memory);
            totalMemory += memoryUsage;
          }
          
          podMetrics.push({
            name: pod.metadata.name,
            namespace: pod.metadata.namespace,
            node: pod.spec.nodeName,
            phase: pod.status.phase,
            cpu: totalCpu,
            memory: totalMemory,
            timestamp: metrics.body.timestamp
          });
          
        } catch (metricError) {
          this.logger?.warn(`Failed to get metrics for pod ${pod.metadata.name}`);
        }
      }
      
      return podMetrics;
      
    } catch (error) {
      this.logger?.error('Error getting pod metrics:', error);
      return [];
    }
  }

  /**
   * Create Horizontal Pod Autoscaler (HPA)
   */
  async createHPA(deploymentName, options = {}) {
    try {
      const hpaSpec = {
        apiVersion: 'autoscaling/v2',
        kind: 'HorizontalPodAutoscaler',
        metadata: {
          name: `${deploymentName}-hpa`,
          namespace: this.namespace
        },
        spec: {
          scaleTargetRef: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: deploymentName
          },
          minReplicas: options.minReplicas || this.config.minReplicas,
          maxReplicas: options.maxReplicas || this.config.maxReplicas,
          metrics: [
            {
              type: 'Resource',
              resource: {
                name: 'cpu',
                target: {
                  type: 'Utilization',
                  averageUtilization: options.targetCpuUtilization || 70
                }
              }
            },
            {
              type: 'Resource',
              resource: {
                name: 'memory',
                target: {
                  type: 'Utilization',
                  averageUtilization: options.targetMemoryUtilization || 80
                }
              }
            }
          ],
          behavior: {
            scaleUp: {
              stabilizationWindowSeconds: 60,
              policies: [
                {
                  type: 'Percent',
                  value: 100,
                  periodSeconds: 60
                }
              ]
            },
            scaleDown: {
              stabilizationWindowSeconds: 300,
              policies: [
                {
                  type: 'Percent',
                  value: 10,
                  periodSeconds: 60
                }
              ]
            }
          }
        }
      };
      
      const autoscalingApi = this.kc.makeApiClient(k8s.AutoscalingV2Api);
      
      await autoscalingApi.createNamespacedHorizontalPodAutoscaler(
        this.namespace,
        hpaSpec
      );
      
      this.logger?.info(`Created HPA for ${deploymentName}`);
      
      return { success: true, message: 'HPA created successfully' };
      
    } catch (error) {
      this.logger?.error('Error creating HPA:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get cluster resource usage
   */
  async getClusterResourceUsage() {
    try {
      // Get all nodes
      const nodes = await this.coreApi.listNode();
      
      let totalCpu = 0;
      let totalMemory = 0;
      let allocatableCpu = 0;
      let allocatableMemory = 0;
      
      for (const node of nodes.body.items) {
        const status = node.status;
        
        // Parse allocatable resources
        if (status.allocatable) {
          allocatableCpu += this.parseCpuUsage(status.allocatable.cpu);
          allocatableMemory += this.parseMemoryUsage(status.allocatable.memory);
        }
      }
      
      // Get pod metrics across all namespaces
      try {
        const allPodMetrics = await this.metricsApi.listPodMetricsForAllNamespaces();
        
        for (const podMetric of allPodMetrics.body.items) {
          for (const container of podMetric.containers || []) {
            totalCpu += this.parseCpuUsage(container.usage.cpu);
            totalMemory += this.parseMemoryUsage(container.usage.memory);
          }
        }
      } catch (metricsError) {
        this.logger?.warn('Failed to get cluster pod metrics');
      }
      
      return {
        cpu: {
          used: totalCpu,
          allocatable: allocatableCpu,
          utilization: allocatableCpu > 0 ? (totalCpu / allocatableCpu) * 100 : 0
        },
        memory: {
          used: totalMemory,
          allocatable: allocatableMemory,
          utilization: allocatableMemory > 0 ? (totalMemory / allocatableMemory) * 100 : 0
        },
        nodes: nodes.body.items.length
      };
      
    } catch (error) {
      this.logger?.error('Error getting cluster resource usage:', error);
      return null;
    }
  }

  /**
   * Parse CPU usage from Kubernetes format
   */
  parseCpuUsage(cpuString) {
    if (!cpuString) return 0;
    
    // Handle different CPU formats: "100m", "0.1", "1000n"
    if (cpuString.endsWith('n')) {
      return parseInt(cpuString) / 1000000000; // nanocores to cores
    } else if (cpuString.endsWith('m')) {
      return parseInt(cpuString) / 1000; // millicores to cores
    } else {
      return parseFloat(cpuString); // cores
    }
  }

  /**
   * Parse memory usage from Kubernetes format
   */
  parseMemoryUsage(memoryString) {
    if (!memoryString) return 0;
    
    const units = {
      'Ki': 1024,
      'Mi': 1024 * 1024,
      'Gi': 1024 * 1024 * 1024,
      'Ti': 1024 * 1024 * 1024 * 1024,
      'K': 1000,
      'M': 1000 * 1000,
      'G': 1000 * 1000 * 1000,
      'T': 1000 * 1000 * 1000 * 1000
    };
    
    for (const [suffix, multiplier] of Object.entries(units)) {
      if (memoryString.endsWith(suffix)) {
        return parseInt(memoryString) * multiplier;
      }
    }
    
    return parseInt(memoryString); // bytes
  }

  /**
   * Check if scaling is in cooldown period
   */
  isInCooldown() {
    if (!this.config.lastScalingAction) return false;
    
    const timeSinceLastAction = Date.now() - this.config.lastScalingAction.timestamp;
    const cooldownPeriod = this.config.scaleUpCooldown; // Use shorter cooldown for now
    
    return timeSinceLastAction < cooldownPeriod;
  }

  /**
   * Get scaling recommendations based on metrics
   */
  async getScalingRecommendations(deploymentName) {
    try {
      const status = await this.getDeploymentStatus(deploymentName);
      const podMetrics = await this.getPodMetrics(deploymentName);
      const clusterUsage = await this.getClusterResourceUsage();
      
      if (!status || !podMetrics.length) {
        return { recommendation: 'MAINTAIN', reason: 'Insufficient data' };
      }
      
      // Calculate average resource usage
      const avgCpu = podMetrics.reduce((sum, pod) => sum + pod.cpu, 0) / podMetrics.length;
      const avgMemory = podMetrics.reduce((sum, pod) => sum + pod.memory, 0) / podMetrics.length;
      
      // Convert to percentages (assuming 1 CPU core and 2GB memory per pod)
      const cpuUtilization = (avgCpu / 1) * 100;
      const memoryUtilization = (avgMemory / (2 * 1024 * 1024 * 1024)) * 100;
      
      // Scaling logic
      if (cpuUtilization > 80 || memoryUtilization > 85) {
        const recommendedReplicas = Math.ceil(status.replicas.desired * 1.5);
        return {
          recommendation: 'SCALE_UP',
          reason: `High resource usage: CPU ${cpuUtilization.toFixed(1)}%, Memory ${memoryUtilization.toFixed(1)}%`,
          currentReplicas: status.replicas.desired,
          recommendedReplicas: Math.min(recommendedReplicas, this.config.maxReplicas),
          metrics: { cpuUtilization, memoryUtilization }
        };
      }
      
      if (cpuUtilization < 30 && memoryUtilization < 40 && status.replicas.desired > this.config.minReplicas) {
        const recommendedReplicas = Math.max(Math.floor(status.replicas.desired * 0.7), this.config.minReplicas);
        return {
          recommendation: 'SCALE_DOWN',
          reason: `Low resource usage: CPU ${cpuUtilization.toFixed(1)}%, Memory ${memoryUtilization.toFixed(1)}%`,
          currentReplicas: status.replicas.desired,
          recommendedReplicas,
          metrics: { cpuUtilization, memoryUtilization }
        };
      }
      
      return {
        recommendation: 'MAINTAIN',
        reason: `Resource usage within normal range: CPU ${cpuUtilization.toFixed(1)}%, Memory ${memoryUtilization.toFixed(1)}%`,
        currentReplicas: status.replicas.desired,
        metrics: { cpuUtilization, memoryUtilization }
      };
      
    } catch (error) {
      this.logger?.error('Error getting scaling recommendations:', error);
      return { recommendation: 'MAINTAIN', reason: 'Error analyzing metrics' };
    }
  }
}

module.exports = KubernetesClient;
