#!/bin/bash

# Nexus Trade AI - Production Deployment Script
# Enterprise-grade deployment automation for financial services

set -euo pipefail

# Configuration
CLUSTER_NAME="nexus-trade-ai-prod"
REGION="us-east-1"
ENVIRONMENT="production"
NAMESPACE="nexus-trade-ai"
MONITORING_NAMESPACE="nexus-monitoring"

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
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed. Please install kubectl first."
        exit 1
    fi
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        log_error "helm is not installed. Please install helm first."
        exit 1
    fi
    
    # Check if AWS CLI is installed
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed. Please install AWS CLI first."
        exit 1
    fi
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    log_success "All prerequisites are met"
}

# Setup AWS EKS cluster
setup_eks_cluster() {
    log_info "Setting up AWS EKS cluster..."
    
    # Check if cluster already exists
    if aws eks describe-cluster --name $CLUSTER_NAME --region $REGION &> /dev/null; then
        log_warning "EKS cluster $CLUSTER_NAME already exists"
    else
        log_info "Creating EKS cluster $CLUSTER_NAME..."
        
        # Create EKS cluster
        eksctl create cluster \
            --name $CLUSTER_NAME \
            --region $REGION \
            --version 1.24 \
            --nodegroup-name nexus-workers \
            --node-type m5.2xlarge \
            --nodes 5 \
            --nodes-min 3 \
            --nodes-max 20 \
            --managed \
            --enable-ssm \
            --asg-access \
            --external-dns-access \
            --full-ecr-access \
            --alb-ingress-access
        
        log_success "EKS cluster created successfully"
    fi
    
    # Update kubeconfig
    aws eks update-kubeconfig --region $REGION --name $CLUSTER_NAME
    
    # Verify cluster connection
    kubectl cluster-info
    log_success "Connected to EKS cluster"
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    # Get AWS account ID
    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
    
    # Login to ECR
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ECR_REGISTRY
    
    # Create ECR repositories if they don't exist
    repositories=("nexus-alpha" "nexus-api" "market-data")
    
    for repo in "${repositories[@]}"; do
        if ! aws ecr describe-repositories --repository-names $repo --region $REGION &> /dev/null; then
            log_info "Creating ECR repository: $repo"
            aws ecr create-repository --repository-name $repo --region $REGION
        fi
    done
    
    # Build and push Nexus Alpha Algorithm
    log_info "Building Nexus Alpha Algorithm image..."
    docker build -t nexus-alpha:2.0.0 -f services/trading-engine/Dockerfile .
    docker tag nexus-alpha:2.0.0 $ECR_REGISTRY/nexus-alpha:2.0.0
    docker push $ECR_REGISTRY/nexus-alpha:2.0.0
    
    # Build and push API Platform
    log_info "Building API Platform image..."
    docker build -t nexus-api:2.0.0 -f services/api-platform/Dockerfile .
    docker tag nexus-api:2.0.0 $ECR_REGISTRY/nexus-api:2.0.0
    docker push $ECR_REGISTRY/nexus-api:2.0.0
    
    # Build and push Market Data Engine
    log_info "Building Market Data Engine image..."
    docker build -t market-data:2.0.0 -f services/market-data/Dockerfile .
    docker tag market-data:2.0.0 $ECR_REGISTRY/market-data:2.0.0
    docker push $ECR_REGISTRY/market-data:2.0.0
    
    log_success "All Docker images built and pushed successfully"
}

# Install necessary Kubernetes addons
install_k8s_addons() {
    log_info "Installing Kubernetes addons..."
    
    # Install AWS Load Balancer Controller
    log_info "Installing AWS Load Balancer Controller..."
    helm repo add eks https://aws.github.io/eks-charts
    helm repo update
    
    kubectl apply -k "github.com/aws/eks-charts/stable/aws-load-balancer-controller//crds?ref=master"
    
    helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
        -n kube-system \
        --set clusterName=$CLUSTER_NAME \
        --set serviceAccount.create=false \
        --set serviceAccount.name=aws-load-balancer-controller
    
    # Install NGINX Ingress Controller
    log_info "Installing NGINX Ingress Controller..."
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    
    helm install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.type=LoadBalancer
    
    # Install Cert Manager for SSL certificates
    log_info "Installing Cert Manager..."
    helm repo add jetstack https://charts.jetstack.io
    helm repo update
    
    helm install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --version v1.10.0 \
        --set installCRDs=true
    
    # Install Cluster Autoscaler
    log_info "Installing Cluster Autoscaler..."
    helm repo add autoscaler https://kubernetes.github.io/autoscaler
    helm repo update
    
    helm install cluster-autoscaler autoscaler/cluster-autoscaler \
        --namespace kube-system \
        --set autoDiscovery.clusterName=$CLUSTER_NAME \
        --set awsRegion=$REGION
    
    log_success "Kubernetes addons installed successfully"
}

# Deploy application
deploy_application() {
    log_info "Deploying Nexus Trade AI application..."
    
    # Create namespaces
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    kubectl create namespace $MONITORING_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply secrets (you should replace these with actual secrets)
    log_warning "Please update the secrets in kubernetes-deployment.yaml with actual values before production use"
    
    # Deploy application
    kubectl apply -f infrastructure/production/kubernetes-deployment.yaml
    
    # Wait for deployments to be ready
    log_info "Waiting for deployments to be ready..."
    kubectl wait --for=condition=available --timeout=600s deployment/nexus-alpha-algorithm -n $NAMESPACE
    kubectl wait --for=condition=available --timeout=600s deployment/nexus-api-platform -n $NAMESPACE
    kubectl wait --for=condition=available --timeout=600s deployment/nexus-market-data -n $NAMESPACE
    
    log_success "Application deployed successfully"
}

# Deploy monitoring stack
deploy_monitoring() {
    log_info "Deploying monitoring stack..."
    
    # Create persistent volumes for monitoring
    kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: prometheus-pvc
  namespace: $MONITORING_NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: grafana-pvc
  namespace: $MONITORING_NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: elasticsearch-pvc
  namespace: $MONITORING_NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 200Gi
EOF
    
    # Deploy monitoring stack
    kubectl apply -f infrastructure/production/monitoring-stack.yaml
    
    # Wait for monitoring deployments
    log_info "Waiting for monitoring stack to be ready..."
    kubectl wait --for=condition=available --timeout=600s deployment/prometheus -n $MONITORING_NAMESPACE
    kubectl wait --for=condition=available --timeout=600s deployment/grafana -n $MONITORING_NAMESPACE
    
    log_success "Monitoring stack deployed successfully"
}

# Setup SSL certificates
setup_ssl() {
    log_info "Setting up SSL certificates..."
    
    # Create ClusterIssuer for Let's Encrypt
    kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@nexustrade.ai
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
    
    log_success "SSL certificates configured"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Check pod status
    log_info "Checking pod status..."
    kubectl get pods -n $NAMESPACE
    kubectl get pods -n $MONITORING_NAMESPACE
    
    # Check services
    log_info "Checking services..."
    kubectl get services -n $NAMESPACE
    
    # Check ingress
    log_info "Checking ingress..."
    kubectl get ingress -n $NAMESPACE
    
    # Get external IP
    EXTERNAL_IP=$(kubectl get service ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
    
    if [ -n "$EXTERNAL_IP" ]; then
        log_success "Deployment verification complete!"
        log_info "External IP/Hostname: $EXTERNAL_IP"
        log_info "API Endpoint: https://api.nexustrade.ai"
        log_info "Grafana Dashboard: https://monitoring.nexustrade.ai"
        log_info "Kibana Logs: https://logs.nexustrade.ai"
    else
        log_warning "External IP not yet assigned. Please check later."
    fi
}

# Main deployment function
main() {
    log_info "Starting Nexus Trade AI production deployment..."
    
    check_prerequisites
    setup_eks_cluster
    build_and_push_images
    install_k8s_addons
    deploy_application
    deploy_monitoring
    setup_ssl
    verify_deployment
    
    log_success "🚀 Nexus Trade AI production deployment completed successfully!"
    log_info "Next steps:"
    log_info "1. Update DNS records to point to the load balancer"
    log_info "2. Configure monitoring alerts"
    log_info "3. Run integration tests"
    log_info "4. Begin API onboarding process"
}

# Run main function
main "$@"
