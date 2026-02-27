# ML Model Production Deployment Guide

**Author:** NexusTradeAI ML Team
**Version:** 1.0
**Date:** December 24, 2024
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Local Development Deployment](#local-development-deployment)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Configuration Management](#configuration-management)
7. [Monitoring and Observability](#monitoring-and-observability)
8. [Security Hardening](#security-hardening)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This guide covers deploying the NexusTradeAI ML model serving infrastructure to production. The deployment stack includes:

- **ML Model Serving API** (FastAPI + Uvicorn)
- **PostgreSQL** (for data persistence)
- **Redis** (for caching and session management)
- **Prometheus** (for metrics collection)
- **Grafana** (for visualization)

**Deployment Options:**
1. Local development (single machine)
2. Docker Compose (multi-container on single host)
3. Kubernetes (production-grade orchestration)

---

## Prerequisites

### Required Software

**For Docker Deployment:**
- Docker 20.10+
- Docker Compose 2.0+
- 8 GB RAM minimum
- 20 GB disk space

**For Kubernetes Deployment:**
- Kubernetes 1.24+
- kubectl CLI
- Helm 3.0+ (optional)
- Cloud provider account (AWS EKS, GCP GKE, or Azure AKS)

**For All Deployments:**
- Python 3.10+
- Git
- Make (optional, for automation)

### Environment Setup

1. **Clone the repository:**
```bash
git clone https://github.com/your-org/NexusTradeAI.git
cd NexusTradeAI
```

2. **Create environment file:**
```bash
cp .env.example .env
# Edit .env with your secrets
```

3. **Install Python dependencies:**
```bash
pip install -r ai-ml/requirements.txt
```

---

## Local Development Deployment

### Quick Start (Development)

1. **Generate development configuration:**
```bash
cd ai-ml/production
python deployment_config.py development
```

2. **Start the API server:**
```bash
cd ai-ml/services
python model_serving_api.py
```

3. **Test the API:**
```bash
curl http://localhost:8000/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-24T10:30:00",
  "models_loaded": 1,
  "uptime_seconds": 123.45
}
```

### Development Configuration

Development mode features:
- ✅ Hot-reload enabled
- ✅ Debug logging
- ✅ No authentication required
- ✅ Single worker process
- ❌ No TLS/HTTPS
- ❌ No monitoring

**Configuration file:** `ai-ml/production/config/development.yaml`

---

## Docker Deployment

### Docker Compose Setup

1. **Generate production configuration:**
```bash
cd ai-ml/production
python deployment_config.py production
```

This creates `docker-compose.yml` with all services configured.

2. **Set environment variables:**

Create `.env` file in project root:
```bash
# Database
DB_PASSWORD=your_secure_password_here

# Redis
REDIS_PASSWORD=your_redis_password_here

# Security
JWT_SECRET_KEY=your_jwt_secret_here
API_KEY=your_api_key_here

# Monitoring
GRAFANA_PASSWORD=your_grafana_password_here
```

3. **Build Docker images:**
```bash
docker-compose build
```

4. **Start all services:**
```bash
docker-compose up -d
```

5. **Check service health:**
```bash
docker-compose ps
```

All services should show "Up" status:
```
NAME                STATUS              PORTS
ml-api              Up 30 seconds       0.0.0.0:8000->8000/tcp
postgres            Up 31 seconds       0.0.0.0:5432->5432/tcp
redis               Up 31 seconds       0.0.0.0:6379->6379/tcp
prometheus          Up 30 seconds       0.0.0.0:9090->9090/tcp
grafana             Up 30 seconds       0.0.0.0:3000->3000/tcp
```

6. **View logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f ml-api
```

7. **Test the deployment:**
```bash
# Health check
curl http://localhost:8000/health

# Get model status
curl http://localhost:8000/models/ensemble_model/status

# Make prediction
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key_here" \
  -d '{
    "features": {
      "rsi_14": 45.23,
      "macd": 0.0234,
      "volume_sma_20": 1234567
    },
    "symbol": "AAPL"
  }'
```

### Docker Services

**ML API Service:**
- **Port:** 8000
- **Endpoint:** http://localhost:8000
- **Health:** http://localhost:8000/health
- **Docs:** http://localhost:8000/docs

**PostgreSQL:**
- **Port:** 5432
- **Default DB:** nexustrade
- **Connection:** `postgresql://nexustrade:password@localhost:5432/nexustrade`

**Redis:**
- **Port:** 6379
- **Connection:** `redis://localhost:6379/0`

**Prometheus:**
- **Port:** 9090
- **UI:** http://localhost:9090

**Grafana:**
- **Port:** 3000
- **UI:** http://localhost:3000
- **Default login:** admin / (your GRAFANA_PASSWORD)

### Docker Commands

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (⚠️ deletes all data)
docker-compose down -v

# Restart specific service
docker-compose restart ml-api

# Scale ML API to 3 instances
docker-compose up -d --scale ml-api=3

# View resource usage
docker stats

# Execute command in container
docker-compose exec ml-api bash
```

---

## Kubernetes Deployment

### Prerequisites

1. **Kubernetes cluster** (one of):
   - AWS EKS
   - GCP GKE
   - Azure AKS
   - Self-hosted (kubeadm, k3s, etc.)

2. **kubectl configured** to access your cluster:
```bash
kubectl cluster-info
```

3. **Storage class** for persistent volumes:
```bash
kubectl get storageclass
```

### Deployment Steps

#### 1. Create Namespace

```bash
kubectl apply -f ai-ml/production/k8s-deployment.yaml
# This creates the 'nexustrade' namespace
```

#### 2. Configure Secrets

**⚠️ IMPORTANT:** Replace placeholder secrets before deploying!

Edit `k8s-deployment.yaml` and replace:
- `REPLACE_WITH_ACTUAL_PASSWORD` → Your database password
- `REPLACE_WITH_ACTUAL_SECRET` → Your JWT secret key
- `REPLACE_WITH_ACTUAL_API_KEY` → Your API key

Or create secrets via kubectl:
```bash
kubectl create secret generic ml-model-secrets \
  --namespace=nexustrade \
  --from-literal=DB_PASSWORD='your_db_password' \
  --from-literal=DB_USER='nexustrade' \
  --from-literal=REDIS_PASSWORD='your_redis_password' \
  --from-literal=JWT_SECRET_KEY='your_jwt_secret' \
  --from-literal=API_KEY='your_api_key'
```

#### 3. Deploy All Resources

```bash
kubectl apply -f ai-ml/production/k8s-deployment.yaml
```

This deploys:
- ✅ Namespace
- ✅ ConfigMap
- ✅ Secret
- ✅ PersistentVolumeClaim
- ✅ Deployment (3 replicas)
- ✅ Service (LoadBalancer)
- ✅ HorizontalPodAutoscaler
- ✅ ServiceAccount
- ✅ RBAC (Role + RoleBinding)
- ✅ NetworkPolicy

#### 4. Wait for Deployment

```bash
# Watch pods starting
kubectl get pods -n nexustrade -w

# Check deployment status
kubectl rollout status deployment/ml-api-deployment -n nexustrade
```

Expected output:
```
deployment "ml-api-deployment" successfully rolled out
```

#### 5. Get Service Endpoint

```bash
kubectl get service ml-api-service -n nexustrade
```

**Output:**
```
NAME             TYPE           CLUSTER-IP      EXTERNAL-IP       PORT(S)
ml-api-service   LoadBalancer   10.100.123.45   a1b2c3.us-east   80:30123/TCP
```

The `EXTERNAL-IP` is your public endpoint.

#### 6. Test the Deployment

```bash
# Get external IP
EXTERNAL_IP=$(kubectl get service ml-api-service -n nexustrade -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Health check
curl http://$EXTERNAL_IP/health

# Model status
curl http://$EXTERNAL_IP/models/ensemble_model/status
```

### Kubernetes Management Commands

**View Resources:**
```bash
# All resources in namespace
kubectl get all -n nexustrade

# Pods with details
kubectl get pods -n nexustrade -o wide

# Deployment details
kubectl describe deployment ml-api-deployment -n nexustrade

# Service endpoints
kubectl get endpoints ml-api-service -n nexustrade
```

**Logs and Debugging:**
```bash
# View logs from all pods
kubectl logs -l app=ml-api -n nexustrade

# Follow logs from specific pod
kubectl logs -f pod-name -n nexustrade

# Get shell in pod
kubectl exec -it pod-name -n nexustrade -- bash

# Port forward for local access
kubectl port-forward service/ml-api-service 8000:80 -n nexustrade
```

**Scaling:**
```bash
# Manual scaling
kubectl scale deployment ml-api-deployment --replicas=5 -n nexustrade

# Check HPA status
kubectl get hpa -n nexustrade

# Describe HPA
kubectl describe hpa ml-api-hpa -n nexustrade
```

**Updates and Rollbacks:**
```bash
# Update image
kubectl set image deployment/ml-api-deployment ml-api=nexustrade/ml-api:v2 -n nexustrade

# Check rollout status
kubectl rollout status deployment/ml-api-deployment -n nexustrade

# Rollout history
kubectl rollout history deployment/ml-api-deployment -n nexustrade

# Rollback to previous version
kubectl rollout undo deployment/ml-api-deployment -n nexustrade

# Rollback to specific revision
kubectl rollout undo deployment/ml-api-deployment --to-revision=2 -n nexustrade
```

**Cleanup:**
```bash
# Delete all resources
kubectl delete -f ai-ml/production/k8s-deployment.yaml

# Or delete namespace (⚠️ deletes everything)
kubectl delete namespace nexustrade
```

---

## Configuration Management

### Environment-Specific Configurations

The `deployment_config.py` script generates configurations for three environments:

**1. Development:**
```bash
python deployment_config.py development
```
- Single replica
- Hot-reload enabled
- Debug logging
- No authentication
- No TLS

**2. Staging:**
```bash
python deployment_config.py staging
```
- 2 replicas minimum
- Authentication enabled
- INFO logging
- TLS optional
- Monitoring enabled

**3. Production:**
```bash
python deployment_config.py production
```
- 3 replicas minimum (auto-scales to 20)
- Authentication required
- WARNING logging
- TLS required
- Full monitoring + alerting

### Configuration Files

**Generated files:**
```
ai-ml/production/config/
├── development.yaml    # Development settings
├── staging.yaml        # Staging settings
└── production.yaml     # Production settings
```

**Example production.yaml:**
```yaml
database:
  host: postgres-service
  port: 5432
  database: nexustrade
  user: nexustrade
  pool_size: 10

redis:
  host: redis-service
  port: 6379
  max_connections: 50

model_serving:
  host: 0.0.0.0
  port: 8000
  workers: 8
  timeout: 60

security:
  api_key_required: true
  tls_enabled: true
  cors_enabled: true

resources:
  cpu_request: 1.0
  cpu_limit: 2.0
  memory_request: 2.0
  memory_limit: 4.0
  min_replicas: 3
  max_replicas: 20
```

### Updating Configuration

1. **Edit configuration:**
```bash
vim ai-ml/production/config/production.yaml
```

2. **Validate configuration:**
```bash
python deployment_config.py production
# Check for validation errors
```

3. **Apply to Docker:**
```bash
docker-compose down
python deployment_config.py production  # Regenerate docker-compose.yml
docker-compose up -d
```

4. **Apply to Kubernetes:**
```bash
kubectl apply -f ai-ml/production/k8s-deployment.yaml
kubectl rollout restart deployment/ml-api-deployment -n nexustrade
```

---

## Monitoring and Observability

### Prometheus Metrics

**Available metrics:**
- `ml_api_requests_total` - Total API requests
- `ml_api_request_duration_seconds` - Request latency
- `ml_api_predictions_total` - Total predictions
- `ml_api_errors_total` - Total errors
- `ml_model_accuracy` - Real-time model accuracy
- `ml_model_inference_time_ms` - Model inference latency

**Access Prometheus:**
- Docker: http://localhost:9090
- Kubernetes: Port-forward with `kubectl port-forward svc/prometheus 9090:9090 -n nexustrade`

**Example queries:**
```promql
# Request rate (per second)
rate(ml_api_requests_total[5m])

# 95th percentile latency
histogram_quantile(0.95, rate(ml_api_request_duration_seconds_bucket[5m]))

# Error rate
rate(ml_api_errors_total[5m]) / rate(ml_api_requests_total[5m])

# Model accuracy over time
ml_model_accuracy

# Requests per model
sum(rate(ml_api_predictions_total[5m])) by (model_name)
```

### Grafana Dashboards

**Access Grafana:**
- Docker: http://localhost:3000
- Login: admin / (your GRAFANA_PASSWORD)

**Pre-built dashboards:**
1. **ML Model Performance**
   - Accuracy, F1 score, precision, recall
   - Prediction distribution
   - Confidence scores
   - Drift detection

2. **API Performance**
   - Request rate
   - Latency (p50, p95, p99)
   - Error rate
   - Throughput

3. **Infrastructure**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network traffic

**Import dashboards:**
```bash
# Copy dashboard JSON to Grafana
kubectl cp dashboards/ml-model-dashboard.json \
  grafana-pod:/var/lib/grafana/dashboards/ -n nexustrade
```

### Logging

**Log levels by environment:**
- Development: DEBUG
- Staging: INFO
- Production: WARNING

**Docker logs:**
```bash
# View logs
docker-compose logs -f ml-api

# Search logs
docker-compose logs ml-api | grep ERROR

# Export logs
docker-compose logs ml-api > ml-api.log
```

**Kubernetes logs:**
```bash
# All pods
kubectl logs -l app=ml-api -n nexustrade

# Specific pod
kubectl logs pod-name -n nexustrade

# Previous pod instance
kubectl logs pod-name --previous -n nexustrade

# Stream logs
stern ml-api -n nexustrade  # Requires stern CLI
```

### Alerting

**Alert rules configured:**
- Accuracy drops below 55%
- Latency exceeds 200ms (2x baseline)
- Error rate > 5%
- Model not loaded
- API health check fails

**Alert channels:**
- Email (production)
- Slack (optional)
- PagerDuty (optional)

**Configure alerts:**
Edit `ai-ml/production/monitoring_system.py`:
```python
monitoring_config = MonitoringConfig(
    alert_on_accuracy_drop=0.05,  # 5% drop
    alert_on_latency_spike=2.0,   # 2x spike
    alert_on_error_rate=0.05,     # 5% errors
    email_alerts=True,
    slack_alerts=False
)
```

---

## Security Hardening

### Production Security Checklist

- [ ] **API authentication enabled** (API key or JWT)
- [ ] **TLS/HTTPS enabled** for all external endpoints
- [ ] **Database password** set to strong value
- [ ] **Secrets** stored in Kubernetes Secrets (not ConfigMaps)
- [ ] **Network policies** restricting traffic
- [ ] **Non-root user** running containers
- [ ] **Read-only filesystem** where possible
- [ ] **Resource limits** configured
- [ ] **Image scanning** enabled in CI/CD
- [ ] **Regular security updates** scheduled

### API Authentication

**API Key Authentication:**

Add to request headers:
```bash
curl -H "X-API-Key: your_api_key_here" http://api-endpoint/predict
```

**JWT Authentication:**

1. Get token:
```bash
curl -X POST http://api-endpoint/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "user", "password": "pass"}'
```

2. Use token:
```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://api-endpoint/predict
```

### TLS/HTTPS Setup

**Generate self-signed certificate (testing only):**
```bash
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout tls.key -out tls.crt -days 365 \
  -subj "/CN=ml-api.nexustrade.com"
```

**Create Kubernetes TLS secret:**
```bash
kubectl create secret tls ml-api-tls \
  --cert=tls.crt --key=tls.key -n nexustrade
```

**Update deployment to use TLS:**
```yaml
spec:
  tls:
    - secretName: ml-api-tls
      hosts:
        - ml-api.nexustrade.com
```

### Secret Rotation

**Rotate database password:**
```bash
# 1. Update password in database
psql -U postgres -c "ALTER USER nexustrade PASSWORD 'new_password';"

# 2. Update Kubernetes secret
kubectl create secret generic ml-model-secrets \
  --from-literal=DB_PASSWORD='new_password' \
  --dry-run=client -o yaml | kubectl apply -f -

# 3. Restart pods to pick up new secret
kubectl rollout restart deployment/ml-api-deployment -n nexustrade
```

---

## Troubleshooting

### Common Issues

**Issue 1: Pods not starting**

```bash
# Check pod status
kubectl get pods -n nexustrade

# Describe pod for events
kubectl describe pod pod-name -n nexustrade

# Check logs
kubectl logs pod-name -n nexustrade
```

**Common causes:**
- Image pull error → Check image name/tag
- Init container failure → Check database/redis connectivity
- OOMKilled → Increase memory limits
- CrashLoopBackOff → Check application logs

**Issue 2: Service not accessible**

```bash
# Check service
kubectl get svc ml-api-service -n nexustrade

# Check endpoints
kubectl get endpoints ml-api-service -n nexustrade

# Test from within cluster
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n nexustrade -- \
  curl http://ml-api-service/health
```

**Issue 3: High latency**

```bash
# Check HPA status
kubectl get hpa -n nexustrade

# Check resource usage
kubectl top pods -n nexustrade

# Scale up if needed
kubectl scale deployment ml-api-deployment --replicas=10 -n nexustrade
```

**Issue 4: Model not loading**

```bash
# Check model files exist
kubectl exec pod-name -n nexustrade -- ls -la /app/models

# Check logs for errors
kubectl logs pod-name -n nexustrade | grep -i "error\|warning"

# Reload model
curl -X POST http://api-endpoint/models/ensemble_model/reload
```

### Health Checks

**API Health:**
```bash
curl http://api-endpoint/health
```

**Expected response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-12-24T10:30:00",
  "models_loaded": 1,
  "uptime_seconds": 3600.0
}
```

**Database Health:**
```bash
# Docker
docker-compose exec postgres pg_isready

# Kubernetes
kubectl exec postgres-pod -n nexustrade -- pg_isready
```

**Redis Health:**
```bash
# Docker
docker-compose exec redis redis-cli ping

# Kubernetes
kubectl exec redis-pod -n nexustrade -- redis-cli ping
```

### Performance Tuning

**Increase workers:**
```yaml
# k8s-deployment.yaml
env:
  - name: API_WORKERS
    value: "16"  # Increase from 8
```

**Increase replicas:**
```bash
kubectl scale deployment ml-api-deployment --replicas=10 -n nexustrade
```

**Tune HPA:**
```yaml
spec:
  minReplicas: 5  # Increase minimum
  maxReplicas: 50  # Increase maximum
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: 60  # Lower threshold (more aggressive)
```

**Tune resource limits:**
```yaml
resources:
  requests:
    cpu: "2000m"    # 2 cores
    memory: "4Gi"   # 4 GB
  limits:
    cpu: "4000m"    # 4 cores
    memory: "8Gi"   # 8 GB
```

---

## Support and Maintenance

### Regular Maintenance Tasks

**Daily:**
- Check service health
- Review error logs
- Monitor resource usage

**Weekly:**
- Review performance metrics
- Check for failed predictions
- Verify backup completion

**Monthly:**
- Update dependencies
- Rotate secrets/credentials
- Review and optimize resource allocation
- Security audit

### Backup and Recovery

**Database backup:**
```bash
# Docker
docker-compose exec postgres pg_dump -U nexustrade nexustrade > backup.sql

# Kubernetes
kubectl exec postgres-pod -n nexustrade -- \
  pg_dump -U nexustrade nexustrade > backup.sql
```

**Restore database:**
```bash
# Docker
cat backup.sql | docker-compose exec -T postgres psql -U nexustrade nexustrade

# Kubernetes
cat backup.sql | kubectl exec -i postgres-pod -n nexustrade -- \
  psql -U nexustrade nexustrade
```

**Model backup:**
```bash
# Copy models from pod
kubectl cp nexustrade/pod-name:/app/models ./models-backup
```

---

## Additional Resources

- **API Documentation:** http://api-endpoint/docs (Swagger UI)
- **Kubernetes Docs:** https://kubernetes.io/docs/
- **Docker Docs:** https://docs.docker.com/
- **FastAPI Docs:** https://fastapi.tiangolo.com/
- **Prometheus Docs:** https://prometheus.io/docs/

---

**Questions or Issues?**
Contact: ml-team@nexustrade.ai
