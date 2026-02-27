# ML Infrastructure Operational Runbook

**Version:** 1.0
**Last Updated:** December 24, 2024
**Owner:** NexusTradeAI ML Team

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Deployment Procedures](#deployment-procedures)
4. [Incident Response](#incident-response)
5. [Monitoring and Alerting](#monitoring-and-alerting)
6. [Troubleshooting Guide](#troubleshooting-guide)
7. [Maintenance Procedures](#maintenance-procedures)
8. [Disaster Recovery](#disaster-recovery)
9. [Contact Information](#contact-information)

---

## Overview

This runbook provides operational procedures for the NexusTradeAI ML infrastructure, including deployment, monitoring, incident response, and maintenance.

### System Components

- **ML Model Serving API** (FastAPI, port 8000)
- **PostgreSQL Database** (port 5432)
- **Redis Cache** (port 6379)
- **Prometheus Monitoring** (port 9090)
- **Grafana Dashboards** (port 3000)

### Service Level Objectives (SLOs)

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| API Availability | 99.9% | < 99% |
| API Latency (p95) | < 100ms | > 200ms |
| Model Accuracy | > 58% | < 55% |
| Error Rate | < 1% | > 5% |

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│              Load Balancer / Ingress                │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐         ┌───────────────┐
│  ML API Pod 1 │         │  ML API Pod 2 │  ... (3-20 pods)
└───────┬───────┘         └───────┬───────┘
        │                         │
        └─────────┬───────────────┘
                  │
     ┌────────────┼────────────┐
     │            │            │
     ▼            ▼            ▼
┌─────────┐  ┌────────┐  ┌─────────┐
│PostgreSQL│  │ Redis  │  │Prometheus│
└─────────┘  └────────┘  └─────────┘
```

### Component Dependencies

- **ML API** depends on: PostgreSQL, Redis, Model files
- **Monitoring** depends on: ML API metrics endpoint
- **Retraining** depends on: Database, Model storage

---

## Deployment Procedures

### Standard Deployment (Zero Downtime)

**Pre-deployment Checklist:**
- [ ] Code reviewed and approved
- [ ] Tests passing (unit, integration, security)
- [ ] Changelog updated
- [ ] Team notified
- [ ] Backup completed

**Deployment Steps:**

1. **Build new Docker image:**
```bash
docker build -t nexustrade/ml-api:v2.0.0 -f ai-ml/production/Dockerfile.ml-api .
docker push nexustrade/ml-api:v2.0.0
```

2. **Update Kubernetes deployment:**
```bash
kubectl set image deployment/ml-api-deployment \
  ml-api=nexustrade/ml-api:v2.0.0 \
  -n nexustrade
```

3. **Monitor rollout:**
```bash
kubectl rollout status deployment/ml-api-deployment -n nexustrade
```

4. **Verify health:**
```bash
# Check pods are running
kubectl get pods -n nexustrade

# Test health endpoint
curl https://api.nexustrade.ai/health

# Check metrics
curl https://api.nexustrade.ai/models/ensemble_model/status
```

5. **Validate functionality:**
```bash
# Run smoke tests
python ai-ml/tests/test_integration.py

# Check error rates in Grafana
# Verify predictions are accurate
```

**Rollback Procedure:**
```bash
# If issues detected, rollback immediately
kubectl rollout undo deployment/ml-api-deployment -n nexustrade

# Verify rollback successful
kubectl rollout status deployment/ml-api-deployment -n nexustrade
```

### Emergency Hotfix Deployment

For critical security or data loss issues:

1. **Create hotfix branch:**
```bash
git checkout -b hotfix/critical-issue main
# Make minimal changes
git commit -m "Hotfix: Critical issue description"
```

2. **Fast-track review:**
- Get emergency approval from 2+ team members
- Run critical tests only

3. **Deploy immediately:**
```bash
# Build and push
docker build -t nexustrade/ml-api:hotfix-v2.0.1 .
docker push nexustrade/ml-api:hotfix-v2.0.1

# Deploy
kubectl set image deployment/ml-api-deployment \
  ml-api=nexustrade/ml-api:hotfix-v2.0.1 \
  -n nexustrade
```

4. **Post-deployment:**
- Monitor closely for 1 hour
- Document in incident report
- Schedule proper fix for next release

---

## Incident Response

### Severity Levels

**P0 - Critical (Response time: 15 minutes)**
- Complete service outage
- Data loss or corruption
- Security breach

**P1 - High (Response time: 1 hour)**
- Partial service degradation
- Error rate > 10%
- Latency > 500ms

**P2 - Medium (Response time: 4 hours)**
- Minor service degradation
- Non-critical feature broken
- Monitoring alerts firing

**P3 - Low (Response time: next business day)**
- Cosmetic issues
- Documentation errors
- Enhancement requests

### Incident Response Procedure

#### 1. Detection

**How incidents are detected:**
- Automated monitoring alerts (PagerDuty/Slack)
- User reports
- Scheduled health checks

#### 2. Initial Response (0-15 minutes)

1. **Acknowledge alert** in PagerDuty
2. **Assess severity** using criteria above
3. **Create incident channel** in Slack: `#incident-YYYY-MM-DD-description`
4. **Notify stakeholders:**
   - P0/P1: Page on-call engineer + manager
   - P2: Post in #ml-team channel
   - P3: Create ticket only

5. **Start incident log** (Google Doc or similar):
```
Incident: [One-line description]
Severity: P0/P1/P2/P3
Start Time: [Timestamp]
Incident Commander: [Name]

Timeline:
[HH:MM] - Incident detected
[HH:MM] - Team notified
[HH:MM] - Investigation started
```

#### 3. Investigation (15-60 minutes)

**Check these in order:**

1. **Service health:**
```bash
# Check pod status
kubectl get pods -n nexustrade

# Check pod logs
kubectl logs -f deployment/ml-api-deployment -n nexustrade

# Check recent deployments
kubectl rollout history deployment/ml-api-deployment -n nexustrade
```

2. **Metrics dashboards:**
- Open Grafana: http://grafana.nexustrade.ai
- Check "ML Model Performance" dashboard
- Look for anomalies in error rate, latency, throughput

3. **Database health:**
```bash
# Check PostgreSQL status
kubectl exec -it postgres-pod -n nexustrade -- pg_isready

# Check active connections
kubectl exec -it postgres-pod -n nexustrade -- \
  psql -U nexustrade -c "SELECT count(*) FROM pg_stat_activity;"
```

4. **External dependencies:**
- Check if third-party APIs are down
- Verify network connectivity

#### 4. Mitigation (immediate action)

**Common mitigations:**

**If API pods are crashing:**
```bash
# Check resource limits
kubectl describe pod <pod-name> -n nexustrade

# Scale up if OOM
kubectl scale deployment ml-api-deployment --replicas=10 -n nexustrade

# Rollback if bad deployment
kubectl rollout undo deployment/ml-api-deployment -n nexustrade
```

**If database is slow:**
```bash
# Check slow queries
kubectl exec -it postgres-pod -n nexustrade -- \
  psql -U nexustrade -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query FROM pg_stat_activity WHERE state = 'active' ORDER BY duration DESC LIMIT 10;"

# Kill long-running queries if needed
kubectl exec -it postgres-pod -n nexustrade -- \
  psql -U nexustrade -c "SELECT pg_terminate_backend(<pid>);"
```

**If model accuracy dropped:**
```bash
# Check if model file corrupted
kubectl exec -it ml-api-pod -n nexustrade -- ls -lh /app/models/

# Reload model
curl -X POST https://api.nexustrade.ai/models/ensemble_model/reload
```

#### 5. Resolution

1. **Implement permanent fix**
2. **Verify fix resolves issue**
3. **Monitor for 30 minutes to ensure stability**
4. **Update incident log with resolution**

#### 6. Post-Incident Review

Within 48 hours, conduct post-mortem:

```
Post-Mortem: [Incident Description]
Date: [Date]
Attendees: [Names]

What Happened:
[Timeline of events]

Root Cause:
[Technical root cause]

Impact:
- Downtime: X minutes
- Users affected: Y
- Revenue impact: $Z

What Went Well:
- [Positive aspects]

What Went Wrong:
- [Issues encountered]

Action Items:
1. [Action] - Owner: [Name] - Due: [Date]
2. [Action] - Owner: [Name] - Due: [Date]
```

---

## Monitoring and Alerting

### Key Metrics to Monitor

**Application Metrics:**
- Request rate (requests/second)
- Error rate (%)
- Latency (p50, p95, p99 in ms)
- Model accuracy (%)
- Prediction confidence (average)

**Infrastructure Metrics:**
- CPU usage (%)
- Memory usage (MB)
- Disk I/O (ops/sec)
- Network throughput (MB/s)

**Business Metrics:**
- Predictions per day
- Model retraining frequency
- A/B test win rate

### Alert Configuration

**Critical Alerts (Page immediately):**
```yaml
- name: API Down
  condition: health_check_failed for 2 minutes
  action: Page on-call

- name: High Error Rate
  condition: error_rate > 10% for 5 minutes
  action: Page on-call

- name: Model Accuracy Drop
  condition: accuracy < 50% for 10 minutes
  action: Page on-call
```

**Warning Alerts (Slack notification):**
```yaml
- name: Elevated Latency
  condition: p95_latency > 200ms for 10 minutes
  action: Slack #ml-alerts

- name: Model Accuracy Degradation
  condition: accuracy < 55% for 30 minutes
  action: Slack #ml-alerts

- name: High Memory Usage
  condition: memory_usage > 80% for 15 minutes
  action: Slack #ml-alerts
```

### Alert Response Playbooks

#### Alert: "API Down"

**Symptoms:** Health checks failing, API returning 5xx errors

**Investigation:**
1. Check pod status: `kubectl get pods -n nexustrade`
2. Check logs: `kubectl logs deployment/ml-api-deployment -n nexustrade`
3. Check recent changes: `kubectl rollout history`

**Resolution:**
- If pods crashing: Check logs for error, may need rollback
- If pods not running: Check resource limits, scale up if needed
- If database issue: Check PostgreSQL connection

#### Alert: "High Error Rate"

**Symptoms:** > 10% of requests failing

**Investigation:**
1. Check Grafana error dashboard
2. Review logs for common error patterns
3. Check if specific endpoint affected

**Resolution:**
- If model loading error: Reload model
- If database timeout: Check query performance
- If bad input data: Add validation

#### Alert: "Model Accuracy Drop"

**Symptoms:** Model accuracy below 50%

**Investigation:**
1. Check if model file corrupted: `ls -lh /app/models/`
2. Check recent data quality
3. Review prediction distribution

**Resolution:**
- Reload model from backup
- Trigger immediate retraining
- Rollback to previous model version

---

## Troubleshooting Guide

### Common Issues

#### Issue: Pods Stuck in CrashLoopBackOff

**Symptoms:**
```bash
kubectl get pods -n nexustrade
# NAME                    READY   STATUS             RESTARTS   AGE
# ml-api-xxx              0/1     CrashLoopBackOff   5          10m
```

**Diagnosis:**
```bash
# Check pod logs
kubectl logs ml-api-xxx -n nexustrade

# Check pod events
kubectl describe pod ml-api-xxx -n nexustrade
```

**Common Causes:**
1. **Missing model files**
   - Check if PVC mounted: `kubectl describe pod ml-api-xxx`
   - Verify model files exist: `kubectl exec ml-api-xxx -- ls /app/models`

2. **Database connection failure**
   - Check PostgreSQL is running: `kubectl get pods | grep postgres`
   - Test connection: `kubectl exec ml-api-xxx -- nc -zv postgres-service 5432`

3. **OOM (Out of Memory)**
   - Check logs for "killed" or "OOMKilled"
   - Increase memory limits in deployment

**Resolution:**
```bash
# Fix missing PVC
kubectl apply -f ai-ml/production/k8s-deployment.yaml

# Fix memory limits
kubectl patch deployment ml-api-deployment -n nexustrade \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"ml-api","resources":{"limits":{"memory":"8Gi"}}}]}}}}'
```

#### Issue: High Latency

**Symptoms:** p95 latency > 200ms

**Diagnosis:**
```bash
# Check current latency in Prometheus
# Query: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Check CPU/Memory usage
kubectl top pods -n nexustrade

# Check number of replicas
kubectl get deployment ml-api-deployment -n nexustrade
```

**Resolution:**
1. **Scale up pods:**
```bash
kubectl scale deployment ml-api-deployment --replicas=10 -n nexustrade
```

2. **Optimize database queries:**
```bash
# Check slow queries
kubectl exec postgres-pod -n nexustrade -- \
  psql -U nexustrade -c "\
    SELECT substring(query, 1, 50), mean_exec_time, calls \
    FROM pg_stat_statements \
    ORDER BY mean_exec_time DESC LIMIT 10;"
```

3. **Enable caching:**
- Verify Redis is running
- Check cache hit rate

#### Issue: Model Not Loading

**Symptoms:** API returns "Model not loaded" error

**Diagnosis:**
```bash
# Check model files
kubectl exec ml-api-pod -n nexustrade -- ls -lh /app/models/

# Check model loading logs
kubectl logs ml-api-pod -n nexustrade | grep -i "model"
```

**Resolution:**
```bash
# Reload model via API
curl -X POST https://api.nexustrade.ai/models/ensemble_model/reload

# If file missing, copy from backup
kubectl cp backup/ensemble_model.pth \
  ml-api-pod:/app/models/ -n nexustrade

# Restart pod to pick up new model
kubectl delete pod ml-api-pod -n nexustrade
```

---

## Maintenance Procedures

### Routine Maintenance

#### Daily Tasks (Automated)

- [ ] Database backup
- [ ] Log rotation
- [ ] Metric aggregation
- [ ] Health checks

#### Weekly Tasks

- [ ] Review error logs for patterns
- [ ] Check disk usage
- [ ] Review A/B test results
- [ ] Update dependencies (if needed)

#### Monthly Tasks

- [ ] Security audit
- [ ] Performance review
- [ ] Capacity planning review
- [ ] Update documentation

### Database Backup

**Automated daily backup:**
```bash
# Backup script runs daily at 2 AM UTC
# Retention: 7 daily, 4 weekly, 12 monthly

# Manual backup:
kubectl exec postgres-pod -n nexustrade -- \
  pg_dump -U nexustrade nexustrade > backup-$(date +%Y%m%d).sql

# Upload to S3
aws s3 cp backup-$(date +%Y%m%d).sql \
  s3://nexustrade-backups/postgres/
```

**Restore from backup:**
```bash
# Download backup
aws s3 cp s3://nexustrade-backups/postgres/backup-20241224.sql .

# Restore
cat backup-20241224.sql | kubectl exec -i postgres-pod -n nexustrade -- \
  psql -U nexustrade nexustrade
```

### Model Backup

**Backup models:**
```bash
# Copy current production model
kubectl cp nexustrade/ml-api-pod:/app/models/ensemble_model.pth \
  backup/ensemble_model_$(date +%Y%m%d).pth

# Upload to S3
aws s3 cp backup/ensemble_model_$(date +%Y%m%d).pth \
  s3://nexustrade-models/backups/
```

### Certificate Renewal

**TLS certificates expire every 90 days**

**Check expiration:**
```bash
kubectl get certificate -n nexustrade
```

**Renew (cert-manager auto-renews):**
```bash
# Force renewal if needed
kubectl delete certificate ml-api-tls -n nexustrade
kubectl apply -f ai-ml/production/k8s-deployment.yaml
```

---

## Disaster Recovery

### Recovery Time Objectives (RTO)

| Scenario | RTO | RPO |
|----------|-----|-----|
| Single pod failure | < 1 minute | 0 |
| Database failure | < 30 minutes | < 1 hour |
| Complete region failure | < 4 hours | < 24 hours |

### Disaster Scenarios

#### Scenario 1: Complete Database Loss

**Recovery Procedure:**

1. **Create new PostgreSQL instance:**
```bash
kubectl apply -f infrastructure/database/postgres.yaml
```

2. **Restore from latest backup:**
```bash
# Get latest backup
aws s3 ls s3://nexustrade-backups/postgres/ | tail -1

# Restore
aws s3 cp s3://nexustrade-backups/postgres/backup-latest.sql .
cat backup-latest.sql | kubectl exec -i postgres-pod -n nexustrade -- \
  psql -U nexustrade nexustrade
```

3. **Verify data integrity:**
```bash
# Check table counts
kubectl exec postgres-pod -n nexustrade -- \
  psql -U nexustrade -c "\dt+"

# Verify recent data
kubectl exec postgres-pod -n nexustrade -- \
  psql -U nexustrade -c "SELECT count(*) FROM predictions WHERE created_at > now() - interval '1 day';"
```

4. **Restart API pods to reconnect:**
```bash
kubectl rollout restart deployment/ml-api-deployment -n nexustrade
```

#### Scenario 2: Kubernetes Cluster Failure

**Recovery Procedure:**

1. **Provision new cluster** (AWS EKS, GCP GKE, etc.)

2. **Restore from infrastructure-as-code:**
```bash
kubectl apply -f ai-ml/production/k8s-deployment.yaml
```

3. **Restore database:**
```bash
# Follow database restoration procedure above
```

4. **Copy model files:**
```bash
aws s3 sync s3://nexustrade-models/production/ ./models/
kubectl cp models/ ml-api-pod:/app/models/ -n nexustrade
```

5. **Verify all services:**
```bash
kubectl get all -n nexustrade
curl https://api.nexustrade.ai/health
```

---

## Contact Information

### On-Call Rotation

**Primary On-Call:** [Name] - [Phone] - [Email]
**Secondary On-Call:** [Name] - [Phone] - [Email]
**Manager:** [Name] - [Phone] - [Email]

### Escalation Path

1. **L1 - On-call engineer** (0-30 minutes)
2. **L2 - Senior engineer** (30-60 minutes)
3. **L3 - Engineering manager** (60+ minutes)
4. **L4 - CTO** (critical only)

### Communication Channels

- **Slack:** #ml-team, #ml-alerts, #incidents
- **PagerDuty:** https://nexustrade.pagerduty.com
- **Status Page:** https://status.nexustrade.ai

### External Contacts

- **AWS Support:** [Account ID] - [Support plan]
- **Database DBA:** [Name] - [Contact]
- **Security Team:** security@nexustrade.ai

---

## Appendix

### Useful Commands

**Kubectl shortcuts:**
```bash
# Alias for faster access
alias k=kubectl
alias kn='kubectl -n nexustrade'

# Get all resources
kn get all

# Follow logs
kn logs -f deployment/ml-api-deployment

# Execute command in pod
kn exec -it <pod-name> -- bash

# Port forward for local access
kn port-forward svc/ml-api-service 8000:80
```

**Database queries:**
```sql
-- Check prediction count
SELECT count(*) FROM predictions WHERE DATE(created_at) = CURRENT_DATE;

-- Check model performance
SELECT model_version, avg(accuracy), count(*)
FROM model_metrics
WHERE created_at > now() - interval '24 hours'
GROUP BY model_version;

-- Check active experiments
SELECT * FROM ab_experiments WHERE status = 'active';
```

### Links

- **Grafana:** http://grafana.nexustrade.ai
- **Prometheus:** http://prometheus.nexustrade.ai
- **API Docs:** https://api.nexustrade.ai/docs
- **Runbook (this doc):** https://docs.nexustrade.ai/runbook
- **Architecture Docs:** https://docs.nexustrade.ai/architecture

---

**Document Version:** 1.0
**Last Review Date:** December 24, 2024
**Next Review Date:** January 24, 2025
