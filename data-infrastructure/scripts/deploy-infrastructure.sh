#!/bin/bash

# Nexus Trade AI Data Infrastructure Deployment Script
# This script deploys the complete data infrastructure stack

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
NAMESPACE="nexus-trade-ai"
ENVIRONMENT="${ENVIRONMENT:-development}"
REGION="${REGION:-us-east-1}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=()
    
    # Check required tools
    command -v kubectl >/dev/null 2>&1 || missing_tools+=("kubectl")
    command -v helm >/dev/null 2>&1 || missing_tools+=("helm")
    command -v docker >/dev/null 2>&1 || missing_tools+=("docker")
    command -v terraform >/dev/null 2>&1 || missing_tools+=("terraform")
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    # Check Kubernetes connection
    if ! kubectl cluster-info >/dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Create namespace
create_namespace() {
    log_info "Creating namespace: $NAMESPACE"
    
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    kubectl label namespace "$NAMESPACE" environment="$ENVIRONMENT" --overwrite
    
    log_success "Namespace created/updated"
}

# Deploy Kafka cluster
deploy_kafka() {
    log_info "Deploying Kafka cluster..."
    
    # Add Confluent Helm repository
    helm repo add confluentinc https://confluentinc.github.io/cp-helm-charts/
    helm repo update
    
    # Create Kafka values file
    cat > /tmp/kafka-values.yaml << EOF
cp-zookeeper:
  servers: 3
  persistence:
    enabled: true
    size: 10Gi
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 2Gi

cp-kafka:
  brokers: 3
  persistence:
    enabled: true
    size: 50Gi
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 4000m
      memory: 4Gi
  configurationOverrides:
    "auto.create.topics.enable": false
    "default.replication.factor": 3
    "min.insync.replicas": 2
    "log.retention.hours": 168
    "log.segment.bytes": 1073741824
    "num.partitions": 10

cp-schema-registry:
  enabled: true
  replicaCount: 2

cp-kafka-connect:
  enabled: true
  replicaCount: 2

cp-ksql-server:
  enabled: false

cp-kafka-rest:
  enabled: false

cp-control-center:
  enabled: false
EOF
    
    # Deploy Kafka
    helm upgrade --install kafka confluentinc/cp-helm-charts \
        --namespace "$NAMESPACE" \
        --values /tmp/kafka-values.yaml \
        --wait --timeout=10m
    
    log_success "Kafka cluster deployed"
}

# Deploy ClickHouse
deploy_clickhouse() {
    log_info "Deploying ClickHouse..."
    
    # Add ClickHouse Helm repository
    helm repo add clickhouse https://docs.altinity.com/clickhouse-operator/
    helm repo update
    
    # Create ClickHouse values file
    cat > /tmp/clickhouse-values.yaml << EOF
clickhouse:
  cluster:
    name: nexus-clickhouse
    layout:
      shardsCount: 2
      replicasCount: 2
  
  persistence:
    enabled: true
    size: 100Gi
    storageClass: fast-ssd
  
  resources:
    requests:
      cpu: 2000m
      memory: 4Gi
    limits:
      cpu: 8000m
      memory: 16Gi
  
  settings:
    max_memory_usage: 8000000000
    max_query_size: 1000000000
    max_result_rows: 1000000
    max_result_bytes: 1000000000
EOF
    
    # Deploy ClickHouse operator first
    kubectl apply -f https://raw.githubusercontent.com/Altinity/clickhouse-operator/master/deploy/operator/clickhouse-operator-install-bundle.yaml
    
    # Wait for operator to be ready
    kubectl wait --for=condition=available --timeout=300s deployment/clickhouse-operator -n kube-system
    
    # Deploy ClickHouse cluster
    helm upgrade --install clickhouse clickhouse/clickhouse \
        --namespace "$NAMESPACE" \
        --values /tmp/clickhouse-values.yaml \
        --wait --timeout=15m
    
    log_success "ClickHouse deployed"
}

# Deploy InfluxDB
deploy_influxdb() {
    log_info "Deploying InfluxDB..."
    
    # Add InfluxData Helm repository
    helm repo add influxdata https://helm.influxdata.com/
    helm repo update
    
    # Create InfluxDB values file
    cat > /tmp/influxdb-values.yaml << EOF
image:
  tag: "2.7"

persistence:
  enabled: true
  size: 100Gi
  storageClass: fast-ssd

resources:
  requests:
    cpu: 1000m
    memory: 2Gi
  limits:
    cpu: 4000m
    memory: 8Gi

adminUser:
  organization: "nexus-trade-ai"
  bucket: "market-data"
  user: "admin"
  retention_policy: "7d"

config:
  http:
    bind-address: ":8086"
  storage:
    wal-fsync-delay: "0s"
    cache-max-memory-size: "1g"
    cache-snapshot-memory-size: "25m"
EOF
    
    # Deploy InfluxDB
    helm upgrade --install influxdb influxdata/influxdb2 \
        --namespace "$NAMESPACE" \
        --values /tmp/influxdb-values.yaml \
        --wait --timeout=10m
    
    log_success "InfluxDB deployed"
}

# Deploy Redis
deploy_redis() {
    log_info "Deploying Redis..."
    
    # Add Bitnami Helm repository
    helm repo add bitnami https://charts.bitnami.com/bitnami
    helm repo update
    
    # Create Redis values file
    cat > /tmp/redis-values.yaml << EOF
architecture: replication
auth:
  enabled: true
  password: "nexus-redis-password"

master:
  persistence:
    enabled: true
    size: 20Gi
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

replica:
  replicaCount: 2
  persistence:
    enabled: true
    size: 20Gi
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

sentinel:
  enabled: true

metrics:
  enabled: true
  serviceMonitor:
    enabled: true
EOF
    
    # Deploy Redis
    helm upgrade --install redis bitnami/redis \
        --namespace "$NAMESPACE" \
        --values /tmp/redis-values.yaml \
        --wait --timeout=10m
    
    log_success "Redis deployed"
}

# Deploy PostgreSQL
deploy_postgresql() {
    log_info "Deploying PostgreSQL..."
    
    # Create PostgreSQL values file
    cat > /tmp/postgresql-values.yaml << EOF
auth:
  postgresPassword: "nexus-postgres-password"
  database: "nexus_trade_ai"

primary:
  persistence:
    enabled: true
    size: 50Gi
    storageClass: fast-ssd
  resources:
    requests:
      cpu: 1000m
      memory: 2Gi
    limits:
      cpu: 4000m
      memory: 8Gi

readReplicas:
  replicaCount: 1
  persistence:
    enabled: true
    size: 50Gi
  resources:
    requests:
      cpu: 500m
      memory: 1Gi
    limits:
      cpu: 2000m
      memory: 4Gi

metrics:
  enabled: true
  serviceMonitor:
    enabled: true
EOF
    
    # Deploy PostgreSQL
    helm upgrade --install postgresql bitnami/postgresql \
        --namespace "$NAMESPACE" \
        --values /tmp/postgresql-values.yaml \
        --wait --timeout=10m
    
    log_success "PostgreSQL deployed"
}

# Deploy monitoring stack
deploy_monitoring() {
    log_info "Deploying monitoring stack..."
    
    # Add Prometheus community Helm repository
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    # Create monitoring values file
    cat > /tmp/monitoring-values.yaml << EOF
prometheus:
  prometheusSpec:
    retention: 30d
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: fast-ssd
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 50Gi

grafana:
  persistence:
    enabled: true
    size: 10Gi
  adminPassword: "nexus-grafana-password"
  
alertmanager:
  alertmanagerSpec:
    storage:
      volumeClaimTemplate:
        spec:
          storageClassName: fast-ssd
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 10Gi
EOF
    
    # Deploy Prometheus stack
    helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
        --namespace "$NAMESPACE" \
        --values /tmp/monitoring-values.yaml \
        --wait --timeout=15m
    
    log_success "Monitoring stack deployed"
}

# Deploy Airflow
deploy_airflow() {
    log_info "Deploying Apache Airflow..."
    
    # Add Apache Airflow Helm repository
    helm repo add apache-airflow https://airflow.apache.org
    helm repo update
    
    # Create Airflow values file
    cat > /tmp/airflow-values.yaml << EOF
executor: "KubernetesExecutor"

postgresql:
  enabled: false

externalDatabase:
  type: postgresql
  host: postgresql
  port: 5432
  database: airflow
  user: postgres
  passwordSecret: postgresql
  passwordSecretKey: postgres-password

redis:
  enabled: false

externalRedis:
  host: redis-master
  port: 6379
  passwordSecret: redis
  passwordSecretKey: redis-password

webserver:
  defaultUser:
    enabled: true
    role: Admin
    username: admin
    email: admin@nexustrade.ai
    firstName: Admin
    lastName: User
    password: nexus-airflow-password

scheduler:
  replicas: 2

workers:
  replicas: 3

dags:
  persistence:
    enabled: true
    size: 10Gi
  gitSync:
    enabled: false

logs:
  persistence:
    enabled: true
    size: 20Gi
EOF
    
    # Deploy Airflow
    helm upgrade --install airflow apache-airflow/airflow \
        --namespace "$NAMESPACE" \
        --values /tmp/airflow-values.yaml \
        --wait --timeout=15m
    
    log_success "Apache Airflow deployed"
}

# Initialize databases
initialize_databases() {
    log_info "Initializing databases..."
    
    # Wait for PostgreSQL to be ready
    kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=postgresql -n "$NAMESPACE" --timeout=300s
    
    # Create databases and schemas
    kubectl exec -n "$NAMESPACE" postgresql-0 -- psql -U postgres -c "CREATE DATABASE IF NOT EXISTS airflow;"
    kubectl exec -n "$NAMESPACE" postgresql-0 -- psql -U postgres -d nexus_trade_ai -f /tmp/core_schema.sql
    
    # Initialize ClickHouse tables
    kubectl cp "$PROJECT_ROOT/storage/timeseries/clickhouse/tables/market_data.sql" "$NAMESPACE/clickhouse-0:/tmp/"
    kubectl exec -n "$NAMESPACE" clickhouse-0 -- clickhouse-client --multiquery < /tmp/market_data.sql
    
    log_success "Databases initialized"
}

# Deploy Spark
deploy_spark() {
    log_info "Deploying Apache Spark..."
    
    # Add Spark operator Helm repository
    helm repo add spark-operator https://googlecloudplatform.github.io/spark-on-k8s-operator
    helm repo update
    
    # Deploy Spark operator
    helm upgrade --install spark-operator spark-operator/spark-operator \
        --namespace "$NAMESPACE" \
        --set sparkJobNamespace="$NAMESPACE" \
        --wait --timeout=10m
    
    log_success "Apache Spark deployed"
}

# Main deployment function
main() {
    log_info "Starting Nexus Trade AI data infrastructure deployment..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Namespace: $NAMESPACE"
    log_info "Region: $REGION"
    
    check_prerequisites
    create_namespace
    
    # Deploy infrastructure components
    deploy_kafka
    deploy_clickhouse
    deploy_influxdb
    deploy_redis
    deploy_postgresql
    deploy_monitoring
    deploy_airflow
    deploy_spark
    
    # Initialize databases
    initialize_databases
    
    log_success "Data infrastructure deployment completed successfully!"
    
    # Display access information
    echo ""
    log_info "Access Information:"
    echo "  Grafana: kubectl port-forward -n $NAMESPACE svc/monitoring-grafana 3000:80"
    echo "  Airflow: kubectl port-forward -n $NAMESPACE svc/airflow-webserver 8080:8080"
    echo "  Kafka: kubectl port-forward -n $NAMESPACE svc/kafka-cp-kafka 9092:9092"
    echo "  ClickHouse: kubectl port-forward -n $NAMESPACE svc/clickhouse 8123:8123"
    echo "  InfluxDB: kubectl port-forward -n $NAMESPACE svc/influxdb 8086:8086"
    echo "  Redis: kubectl port-forward -n $NAMESPACE svc/redis-master 6379:6379"
    echo "  PostgreSQL: kubectl port-forward -n $NAMESPACE svc/postgresql 5432:5432"
}

# Cleanup function
cleanup() {
    log_warning "Cleaning up data infrastructure..."
    
    helm uninstall airflow -n "$NAMESPACE" || true
    helm uninstall monitoring -n "$NAMESPACE" || true
    helm uninstall postgresql -n "$NAMESPACE" || true
    helm uninstall redis -n "$NAMESPACE" || true
    helm uninstall influxdb -n "$NAMESPACE" || true
    helm uninstall clickhouse -n "$NAMESPACE" || true
    helm uninstall kafka -n "$NAMESPACE" || true
    helm uninstall spark-operator -n "$NAMESPACE" || true
    
    kubectl delete namespace "$NAMESPACE" || true
    
    log_success "Cleanup completed"
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    cleanup)
        cleanup
        ;;
    *)
        echo "Usage: $0 [deploy|cleanup]"
        exit 1
        ;;
esac
