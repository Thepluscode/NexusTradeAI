# Nexus Trade AI - Data Infrastructure

This repository contains the complete data infrastructure for the Nexus Trade AI platform, designed to handle millions of concurrent users, process terabytes of market data daily, and execute trades with sub-millisecond latency.

## 🏗️ Architecture Overview

The data infrastructure consists of several key components working together to provide a robust, scalable, and high-performance data platform:

### Core Components

1. **Streaming Layer** - Real-time data ingestion and processing
2. **Storage Layer** - Multi-tier storage for different data types and access patterns
3. **Processing Layer** - Batch and stream processing for analytics and ML
4. **Orchestration Layer** - Workflow management and scheduling

## 📊 Data Flow Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Sources  │───▶│  Kafka Streams  │───▶│   Processing    │
│                 │    │                 │    │                 │
│ • Exchanges     │    │ • Market Data   │    │ • Spark Jobs    │
│ • News Feeds    │    │ • Trade Events  │    │ • ML Pipelines  │
│ • Social Media  │    │ • User Actions  │    │ • Analytics     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Applications  │◀───│   Storage Layer │◀───│   Processed     │
│                 │    │                 │    │     Data        │
│ • Web App       │    │ • ClickHouse    │    │                 │
│ • Mobile App    │    │ • InfluxDB      │    │ • Aggregations  │
│ • Trading Bots  │    │ • PostgreSQL    │    │ • Indicators    │
│ • APIs          │    │ • Redis         │    │ • Alerts        │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- **Kubernetes cluster** (EKS, GKE, AKS, or local)
- **kubectl** configured and connected
- **Helm 3.x** installed
- **Docker** for local development
- **Terraform** for infrastructure provisioning
- **Minimum Resources**: 16 vCPUs, 32GB RAM, 500GB storage

### One-Click Deployment

```bash
# Clone the repository
git clone https://github.com/your-org/nexus-trade-ai.git
cd nexus-trade-ai/data-infrastructure

# Deploy the complete infrastructure
./scripts/deploy-infrastructure.sh

# Or deploy specific components
./scripts/deploy-infrastructure.sh kafka
./scripts/deploy-infrastructure.sh clickhouse
./scripts/deploy-infrastructure.sh monitoring
```

### Environment Configuration

Set environment variables for your deployment:

```bash
export ENVIRONMENT=production
export REGION=us-east-1
export NAMESPACE=nexus-trade-ai
export STORAGE_CLASS=fast-ssd
```

## Architecture

### Network Topology

```
┌───────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                   │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Zookeeper  │◄───┤   Kafka     │◄───┤  Producers  │   │
│  │  Ensemble   │    │   Brokers   │    │             │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
│         ▲                    ▲                  ▲        │
│         │                    │                  │        │
│         ▼                    ▼                  │        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐   │
│  │  Prometheus │    │   Grafana   │    │  Consumers  │   │
│  │  (Metrics)  │    │ (Dashboards)│    │             │   │
│  └─────────────┘    └─────────────┘    └─────────────┘   │
└───────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Data Sources** → **Kafka Streams** → **Processing Layer** → **Storage Layer** → **Applications**
2. **Real-time ingestion** from exchanges, news feeds, and user actions
3. **Stream processing** with Apache Spark for analytics and ML
4. **Multi-tier storage** optimized for different access patterns
5. **Real-time serving** to web, mobile, and API clients

## 🏗️ Component Details

### 1. Streaming Layer

#### Apache Kafka

- **Purpose**: Real-time data streaming and event processing
- **Configuration**: 3-broker cluster with replication factor 3
- **Topics**:
  - `market-data-crypto` - Cryptocurrency market data
  - `market-data-stocks` - Stock market data
  - `trades-crypto` - Cryptocurrency trade executions
  - `trades-stocks` - Stock trade executions
  - `news-sentiment` - News and sentiment data
  - `user-metrics` - User activity metrics
- **Throughput**: 1M+ messages/second
- **Latency**: <10ms end-to-end

#### Kafka Producers

- **Market Data Producer**: Streams real-time OHLCV data from exchanges
- **Trade Producer**: Streams trade execution events
- **News Producer**: Streams financial news and sentiment analysis

#### Kafka Consumers

- **Analytics Consumer**: Processes data for real-time analytics
- **Risk Consumer**: Calculates risk metrics and alerts
- **ML Consumer**: Feeds data to machine learning pipelines

### 2. Storage Layer

#### ClickHouse (Time Series Analytics)

- **Purpose**: High-performance analytics on time-series data
- **Configuration**: 2 shards, 2 replicas per shard
- **Storage**: Market data, trade history, technical indicators
- **Performance**: 100M+ rows/second ingestion, sub-second queries
- **Retention**:
  - Real-time data: 90 days
  - Aggregated data: 10 years

#### InfluxDB (Metrics & Monitoring)

- **Purpose**: Time-series metrics and system monitoring
- **Configuration**: Single instance with backup
- **Storage**: System metrics, performance data, alerts
- **Retention Policies**:
  - Real-time: 7 days
  - 5-minute: 30 days
  - 1-hour: 1 year
  - Daily: 10 years

#### PostgreSQL (Relational Data)

- **Purpose**: User data, configuration, compliance records
- **Configuration**: Primary with read replica
- **Storage**: User accounts, portfolios, risk profiles, audit logs
- **Backup**: Daily automated backups with point-in-time recovery

#### Redis (Caching & Session Store)

- **Purpose**: High-speed caching and session management
- **Configuration**: Master-replica with Sentinel
- **Storage**: Real-time prices, user sessions, temporary data
- **Performance**: <1ms response time, 100K+ ops/second

## Configuration

### Kafka Configuration

- **Replication Factor**: 3
- **Min In-Sync Replicas**: 2
- **Log Retention**: 7 days (configurable)
- **Partitions**: 10 per topic (configurable)

### Resource Requests/Limits

| Component      | CPU Request | CPU Limit | Memory Request | Memory Limit |
| -------------- | ----------- | --------- | -------------- | ------------ |
| Zookeeper      | 500m        | 2000m     | 1Gi            | 2Gi          |
| Kafka          | 1000m       | 4000m     | 2Gi            | 4Gi          |
| Prometheus     | 500m        | 1000m     | 512Mi          | 2Gi          |
| Grafana        | 100m        | 500m      | 256Mi          | 1Gi          |
| Kafka Exporter | 50m         | 100m      | 64Mi           | 128Mi        |

## Monitoring

### Pre-configured Dashboards

1. **Kafka Overview**: Cluster health, throughput, and latency
2. **Broker Metrics**: CPU, memory, disk usage, and network I/O
3. **Topic Metrics**: Message rates, partition sizes, and consumer lag
4. **Producer/Consumer**: Performance and error rates

### Alerts

- Broker down
- High disk usage
- Under-replicated partitions
- Consumer lag
- High request latency

## Scaling

### Horizontal Scaling

```bash
# Scale Kafka brokers
kubectl scale statefulset kafka -n kafka --replicas=5

# Scale Zookeeper (must be odd number)
kubectl scale statefulset zookeeper -n kafka --replicas=5
```

### Vertical Scaling

Update the resource requests/limits in the respective YAML files and apply the changes.

## Maintenance

### Upgrading Kafka

1. Update the Kafka version in the deployment YAML
2. Apply the changes with `kubectl apply`
3. Monitor the rolling update progress

### Backup and Restore

#### Backup

```bash
# Backup Zookeeper data
kubectl cp -n kafka zookeeper-0:/data /backup/zookeeper-0-data
kubectl cp -n kafka zookeeper-0:/datalog /backup/zookeeper-0-datalog

# Backup Kafka data
for pod in $(kubectl get pods -n kafka -l app=kafka -o name); do
  pod_name=${pod#pod/}
  kubectl cp -n kafka $pod_name:/var/lib/kafka/data /backup/kafka-$pod_name-data
```

#### Restore

```bash
# Restore Zookeeper data
kubectl cp /backup/zookeeper-0-data zookeeper-0:/data -n kafka
kubectl cp /backup/zookeeper-0-datalog zookeeper-0:/datalog -n kafka

# Restart Zookeeper pods
kubectl delete pod -n kafka -l app=zookeeper

# Restore Kafka data
for pod in $(kubectl get pods -n kafka -l app=kafka -o name); do
  pod_name=${pod#pod/}
  kubectl cp /backup/kafka-$pod_name-data $pod_name:/var/lib/kafka/data -n kafka
  kubectl delete pod -n kafka $pod_name
done
```

## Troubleshooting

### Common Issues

1. **Pods in CrashLoopBackOff**
   - Check logs: `kubectl logs -n <namespace> <pod-name>`
   - Check events: `kubectl describe pod -n <namespace> <pod-name>`

2. **Kafka not starting**
   - Verify Zookeeper is running: `kubectl get pods -n kafka`
   - Check Kafka logs: `kubectl logs -n kafka kafka-0`

3. **High disk usage**
   - Increase disk size in PersistentVolumeClaims
   - Adjust log retention: `kafka-configs.sh --zookeeper zookeeper:2181 --entity-type topics --entity-name <topic> --alter --add-config retention.ms=604800000`

### Logs

```bash
# Kafka logs
kubectl logs -n kafka -l app=kafka -f

# Zookeeper logs
kubectl logs -n kafka -l app=zookeeper -f

# Prometheus logs
kubectl logs -n monitoring -l app=prometheus -f

# Grafana logs
kubectl logs -n monitoring -l app=grafana -f

# Kafka Exporter logs
kubectl logs -n monitoring -l app=kafka-exporter -f
```

## Security

### Network Policies

By default, all pods in the `kafka` namespace can communicate with each other. For production, implement network policies to restrict traffic.

### TLS Encryption

TLS is enabled by default. To rotate certificates:

1. Generate new certificates
2. Update the Kubernetes secret
3. Restart Kafka brokers

### Authentication

SASL/PLAIN authentication is configured. To add/remove users:

1. Update the Kafka JAAS configuration
2. Restart Kafka brokers

## Monitoring and Alerting

### Custom Metrics

To add custom metrics:

1. Configure Prometheus to scrape the metrics endpoint
2. Create a new Grafana dashboard or add to an existing one

### Alert Rules

Alert rules are defined in Prometheus. To modify:

1. Edit the Prometheus configuration
2. Reload Prometheus: `curl -X POST http://prometheus-service.monitoring:9090/-/reload`

## Cleanup

To delete all resources:

```bash
# Delete Kafka resources
kubectl delete -f kubernetes/kafka/ --recursive

# Delete monitoring resources
kubectl delete -f kubernetes/monitoring/ --recursive

# Delete namespaces
kubectl delete namespace kafka monitoring
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
