# Production Deployment Guide

**Version:** 1.0
**Date:** December 24, 2024
**Status:** Production Ready
**Owner:** Infrastructure Team

---

## Executive Summary

This guide provides step-by-step procedures for deploying NexusTradeAI to production environments with institutional-grade reliability and security. The deployment process is designed for zero-downtime deployments, automated rollbacks, and comprehensive monitoring.

### Deployment Timeline

- **Initial Setup:** 4-6 hours
- **Subsequent Deployments:** 15-20 minutes
- **Rollback Time:** < 5 minutes

### Success Criteria

- ✅ All services healthy and passing health checks
- ✅ Database migrations successful
- ✅ Monitoring and alerting operational
- ✅ SSL/TLS certificates valid
- ✅ Notification channels tested
- ✅ Zero data loss
- ✅ < 30 seconds downtime (during deployment)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Secrets Management](#secrets-management)
4. [SSL/TLS Configuration](#ssltls-configuration)
5. [Database Deployment](#database-deployment)
6. [Service Deployment](#service-deployment)
7. [Monitoring Setup](#monitoring-setup)
8. [Verification](#verification)
9. [Rollback Procedures](#rollback-procedures)
10. [Post-Deployment](#post-deployment)
11. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Infrastructure Requirements

**Minimum Server Specifications:**
- **CPU:** 4 cores (8 cores recommended)
- **RAM:** 8 GB (16 GB recommended)
- **Storage:** 100 GB SSD (500 GB recommended)
- **Network:** 100 Mbps (1 Gbps recommended)
- **OS:** Ubuntu 22.04 LTS or RHEL 8+

**Required Software:**
```bash
# Docker (version 24.0+)
docker --version

# Docker Compose (version 2.20+)
docker-compose --version

# PostgreSQL client (version 15+)
psql --version

# Redis CLI (version 7+)
redis-cli --version

# Git (version 2.40+)
git --version

# SSL tools
openssl version
certbot --version
```

**Network Requirements:**
- Inbound ports: 80 (HTTP), 443 (HTTPS), 9090 (Prometheus), 3030 (Grafana)
- Outbound ports: 443 (HTTPS for APIs), 587 (SMTP), 5432 (Postgres backup)
- Firewall rules configured
- Load balancer (optional but recommended)

**External Dependencies:**
- Alpaca Markets API account (production credentials)
- SMTP server for email notifications
- Slack workspace for alerts (optional)
- PagerDuty account (optional)
- S3-compatible storage for backups (recommended)

### Pre-Deployment Checklist

**Code Preparation:**
- [ ] All tests passing (`npm run test`)
- [ ] Linting clean (`npm run lint`)
- [ ] Security audit clean (`npm audit`)
- [ ] Git tag created for release (e.g., `v1.0.0`)
- [ ] CHANGELOG.md updated
- [ ] Database migrations tested in staging

**Configuration:**
- [ ] Production `.env` file prepared (see template)
- [ ] API credentials validated
- [ ] SSL certificates obtained
- [ ] Backup storage configured
- [ ] Monitoring credentials prepared

**Team Readiness:**
- [ ] Deployment window scheduled
- [ ] Stakeholders notified
- [ ] On-call engineer assigned
- [ ] Runbooks reviewed
- [ ] Rollback plan understood

---

## Environment Setup

### 1. Create Production User

```bash
# Create dedicated user for application
sudo useradd -m -s /bin/bash nexustrade
sudo usermod -aG docker nexustrade

# Set up SSH key authentication
sudo mkdir -p /home/nexustrade/.ssh
sudo cp ~/.ssh/authorized_keys /home/nexustrade/.ssh/
sudo chown -R nexustrade:nexustrade /home/nexustrade/.ssh
sudo chmod 700 /home/nexustrade/.ssh
sudo chmod 600 /home/nexustrade/.ssh/authorized_keys

# Switch to nexustrade user
sudo su - nexustrade
```

### 2. Clone Repository

```bash
# Navigate to application directory
cd /opt
sudo mkdir -p nexustradeai
sudo chown nexustrade:nexustrade nexustradeai
cd nexustradeai

# Clone repository
git clone https://github.com/yourusername/NexusTradeAI.git .

# Checkout production tag
git checkout tags/v1.0.0
```

### 3. Create Directory Structure

```bash
# Create required directories
mkdir -p /opt/nexustradeai/logs/{archive,deploy,backup,health}
mkdir -p /opt/nexustradeai/data/{postgres,redis,prometheus,grafana}
mkdir -p /opt/nexustradeai/backups
mkdir -p /opt/nexustradeai/ssl

# Set permissions
chmod 755 /opt/nexustradeai/logs
chmod 700 /opt/nexustradeai/data
chmod 700 /opt/nexustradeai/backups
chmod 700 /opt/nexustradeai/ssl
```

### 4. Configure Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable

# For monitoring (restrict to internal network)
sudo ufw allow from 10.0.0.0/8 to any port 9090  # Prometheus
sudo ufw allow from 10.0.0.0/8 to any port 3030  # Grafana
sudo ufw allow from 10.0.0.0/8 to any port 9093  # Alertmanager

# Verify rules
sudo ufw status verbose
```

---

## Secrets Management

### Production Environment Variables

Create `/opt/nexustradeai/.env.production`:

```bash
###############################################################################
# PRODUCTION ENVIRONMENT CONFIGURATION
# ====================================
# CRITICAL: Never commit this file to version control
# Store securely in password manager or secrets management system
###############################################################################

# Environment
NODE_ENV=production
LOG_LEVEL=info

# Server Configuration
PORT=3001
HOST=0.0.0.0

# PostgreSQL Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=nexustradeai_prod
DB_USER=nexustrade_app
DB_PASSWORD=<STRONG_RANDOM_PASSWORD_HERE>
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_SSL=true

# Redis Cache
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<STRONG_RANDOM_PASSWORD_HERE>
REDIS_DB=0
REDIS_TLS=true

# Alpaca Markets (PRODUCTION - REAL MONEY)
ALPACA_API_KEY=<PRODUCTION_API_KEY>
ALPACA_SECRET_KEY=<PRODUCTION_SECRET_KEY>
ALPACA_BASE_URL=https://api.alpaca.markets
REAL_TRADING_ENABLED=true

# Trading Configuration
MAX_DAILY_LOSS=-1000
MAX_POSITION_SIZE=5000
RISK_PER_TRADE=0.01
MAX_TRADES_PER_DAY=15

# Monitoring - Prometheus
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9091

# Alerting - Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=<APP_SPECIFIC_PASSWORD>
SMTP_FROM=NexusTradeAI Alerts <alerts@yourdomain.com>
ALERT_EMAIL_TO=team@yourdomain.com

# Alerting - Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#trading-alerts

# Alerting - PagerDuty (Optional)
PAGERDUTY_INTEGRATION_KEY=<YOUR_INTEGRATION_KEY>

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"  # Daily at 2 AM
S3_BUCKET=nexustradeai-backups-prod
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=<AWS_ACCESS_KEY>
AWS_SECRET_ACCESS_KEY=<AWS_SECRET_KEY>

# Security
SESSION_SECRET=<STRONG_RANDOM_SECRET_64_CHARS>
JWT_SECRET=<STRONG_RANDOM_SECRET_64_CHARS>
ENCRYPTION_KEY=<STRONG_RANDOM_KEY_32_BYTES_HEX>

# SSL/TLS
SSL_CERT_PATH=/opt/nexustradeai/ssl/fullchain.pem
SSL_KEY_PATH=/opt/nexustradeai/ssl/privkey.pem

# External APIs (Optional)
POLYGON_API_KEY=<POLYGON_KEY>
FINNHUB_API_KEY=<FINNHUB_KEY>
ALPHA_VANTAGE_API_KEY=<ALPHA_VANTAGE_KEY>
```

### Generate Strong Passwords

```bash
# Generate random passwords (32 characters)
openssl rand -base64 32

# Generate random hex key (32 bytes for encryption)
openssl rand -hex 32

# Generate session secret (64 characters)
openssl rand -base64 48
```

### Secure Storage

```bash
# Restrict file permissions
chmod 600 /opt/nexustradeai/.env.production
chown nexustrade:nexustrade /opt/nexustradeai/.env.production

# Verify permissions
ls -la /opt/nexustradeai/.env.production
# Should show: -rw------- 1 nexustrade nexustrade
```

### Secrets Management Systems (Recommended)

**Option 1: HashiCorp Vault**
```bash
# Install Vault CLI
curl -fsSL https://apt.releases.hashicorp.com/gpg | sudo apt-key add -
sudo apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
sudo apt-get update && sudo apt-get install vault

# Store secrets
vault kv put secret/nexustradeai/prod \
  db_password="<PASSWORD>" \
  alpaca_api_key="<KEY>" \
  alpaca_secret_key="<SECRET>"

# Retrieve secrets
vault kv get -field=db_password secret/nexustradeai/prod
```

**Option 2: AWS Secrets Manager**
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Store secrets
aws secretsmanager create-secret \
  --name nexustradeai/prod/database \
  --secret-string '{"password":"<PASSWORD>"}'

# Retrieve secrets
aws secretsmanager get-secret-value \
  --secret-id nexustradeai/prod/database \
  --query SecretString --output text | jq -r .password
```

**Option 3: Docker Secrets**
```bash
# Create Docker secrets
echo "<DB_PASSWORD>" | docker secret create db_password -
echo "<ALPACA_KEY>" | docker secret create alpaca_api_key -

# Reference in docker-compose.yml
secrets:
  db_password:
    external: true
  alpaca_api_key:
    external: true
```

---

## SSL/TLS Configuration

### Option 1: Let's Encrypt (Recommended for Public Deployments)

```bash
# Install Certbot
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate (DNS challenge for wildcard)
sudo certbot certonly --manual \
  --preferred-challenges=dns \
  --email admin@yourdomain.com \
  --server https://acme-v02.api.letsencrypt.org/directory \
  --agree-tos \
  -d nexustradeai.yourdomain.com \
  -d *.nexustradeai.yourdomain.com

# Certificates will be saved to:
# /etc/letsencrypt/live/nexustradeai.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/nexustradeai.yourdomain.com/privkey.pem

# Copy to application directory
sudo cp /etc/letsencrypt/live/nexustradeai.yourdomain.com/fullchain.pem \
  /opt/nexustradeai/ssl/
sudo cp /etc/letsencrypt/live/nexustradeai.yourdomain.com/privkey.pem \
  /opt/nexustradeai/ssl/
sudo chown nexustrade:nexustrade /opt/nexustradeai/ssl/*
sudo chmod 600 /opt/nexustradeai/ssl/privkey.pem
sudo chmod 644 /opt/nexustradeai/ssl/fullchain.pem

# Set up auto-renewal
sudo crontab -e
# Add: 0 3 * * * certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

### Option 2: Self-Signed Certificate (For Internal/Testing)

```bash
# Generate self-signed certificate (valid for 365 days)
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /opt/nexustradeai/ssl/privkey.pem \
  -out /opt/nexustradeai/ssl/fullchain.pem \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=nexustradeai.local"

# Set permissions
chmod 600 /opt/nexustradeai/ssl/privkey.pem
chmod 644 /opt/nexustradeai/ssl/fullchain.pem
```

### Option 3: Commercial Certificate

```bash
# Generate CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout /opt/nexustradeai/ssl/privkey.pem \
  -out /opt/nexustradeai/ssl/domain.csr \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=nexustradeai.yourdomain.com"

# Submit CSR to Certificate Authority (e.g., DigiCert, GlobalSign)
# Receive certificate and intermediate certificates

# Combine certificates
cat domain.crt intermediate.crt root.crt > /opt/nexustradeai/ssl/fullchain.pem
```

### Configure Nginx Reverse Proxy

Create `/etc/nginx/sites-available/nexustradeai`:

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name nexustradeai.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS Server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name nexustradeai.yourdomain.com;

    # SSL Configuration
    ssl_certificate /opt/nexustradeai/ssl/fullchain.pem;
    ssl_certificate_key /opt/nexustradeai/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Trading Bot API
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Prometheus (restrict access)
    location /prometheus/ {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://localhost:9090/;
    }

    # Grafana
    location /grafana/ {
        proxy_pass http://localhost:3030/;
        proxy_set_header Host $host;
    }

    # Health Check (allow from load balancer)
    location /health {
        proxy_pass http://localhost:3001/health;
        access_log off;
    }

    # Access Logs
    access_log /var/log/nginx/nexustradeai_access.log;
    error_log /var/log/nginx/nexustradeai_error.log;
}
```

Enable and test:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/nexustradeai /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Verify SSL
curl -I https://nexustradeai.yourdomain.com/health
openssl s_client -connect nexustradeai.yourdomain.com:443 -servername nexustradeai.yourdomain.com
```

---

## Database Deployment

### 1. Initialize Production Database

```bash
# Create database and user
sudo -u postgres psql << EOF
-- Create production database
CREATE DATABASE nexustradeai_prod;

-- Create application user with strong password
CREATE USER nexustrade_app WITH ENCRYPTED PASSWORD '<STRONG_PASSWORD>';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE nexustradeai_prod TO nexustrade_app;

-- Connect to database
\c nexustradeai_prod

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO nexustrade_app;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO nexustrade_app;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nexustrade_app;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Verify
SELECT current_database(), current_user;
EOF
```

### 2. Run Database Migrations

```bash
cd /opt/nexustradeai/infrastructure/database

# Backup before migration (just in case)
PGPASSWORD='<PASSWORD>' pg_dump -h localhost -U nexustrade_app nexustradeai_prod > /opt/nexustradeai/backups/pre-migration-$(date +%Y%m%d-%H%M%S).sql

# Run migrations
node migrate.js up

# Verify migration
PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 10;"
```

### 3. Configure Database Performance

```bash
# Edit postgresql.conf
sudo vim /etc/postgresql/15/main/postgresql.conf

# Recommended settings for production
shared_buffers = 4GB                    # 25% of RAM
effective_cache_size = 12GB             # 75% of RAM
maintenance_work_mem = 1GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1                  # For SSD
effective_io_concurrency = 200          # For SSD
work_mem = 20MB
min_wal_size = 1GB
max_wal_size = 4GB
max_connections = 100

# Logging
log_destination = 'csvlog'
logging_collector = on
log_directory = '/var/log/postgresql'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000       # Log queries > 1 second
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_duration = off
log_lock_waits = on

# Restart PostgreSQL
sudo systemctl restart postgresql

# Verify settings
sudo -u postgres psql -c "SHOW shared_buffers;"
sudo -u postgres psql -c "SHOW effective_cache_size;"
```

### 4. Set Up Automated Backups

```bash
# Create backup script
cat > /opt/nexustradeai/scripts/backup-production-db.sh << 'EOF'
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/nexustradeai/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/nexustradeai-prod-$TIMESTAMP.sql"

# Create backup
PGPASSWORD='<PASSWORD>' pg_dump \
  -h localhost \
  -U nexustrade_app \
  -d nexustradeai_prod \
  -F c \
  -f "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"

# Upload to S3 (optional)
if [ -n "${S3_BUCKET:-}" ]; then
  aws s3 cp "$BACKUP_FILE.gz" "s3://$S3_BUCKET/database/$(basename $BACKUP_FILE.gz)"
fi

# Keep last 30 days locally
find "$BACKUP_DIR" -name "nexustradeai-prod-*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE.gz"
EOF

chmod +x /opt/nexustradeai/scripts/backup-production-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
# Add: 0 2 * * * /opt/nexustradeai/scripts/backup-production-db.sh >> /opt/nexustradeai/logs/backup/backup.log 2>&1
```

---

## Service Deployment

### 1. Update Docker Compose for Production

Create `infrastructure/docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  trading-bot:
    build:
      context: ../
      dockerfile: infrastructure/Dockerfile
      args:
        NODE_ENV: production
    container_name: nexustrade-bot-prod
    restart: unless-stopped
    env_file:
      - ../.env.production
    ports:
      - "3001:3001"
      - "9091:9091"  # Prometheus metrics
    volumes:
      - ../logs:/app/logs
      - ../services/trading/data:/app/services/trading/data
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - nexustrade-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  postgres:
    image: postgres:15-alpine
    container_name: nexustrade-postgres-prod
    restart: unless-stopped
    environment:
      POSTGRES_DB: nexustradeai_prod
      POSTGRES_USER: nexustrade_app
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    ports:
      - "127.0.0.1:5432:5432"  # Only localhost
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - nexustrade-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexustrade_app -d nexustradeai_prod"]
      interval: 10s
      timeout: 5s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    command:
      - "postgres"
      - "-c"
      - "max_connections=100"
      - "-c"
      - "shared_buffers=2GB"
      - "-c"
      - "effective_cache_size=6GB"
      - "-c"
      - "maintenance_work_mem=512MB"
      - "-c"
      - "checkpoint_completion_target=0.9"
      - "-c"
      - "wal_buffers=16MB"
      - "-c"
      - "default_statistics_target=100"
      - "-c"
      - "random_page_cost=1.1"
      - "-c"
      - "effective_io_concurrency=200"
      - "-c"
      - "work_mem=10MB"

  redis:
    image: redis:7-alpine
    container_name: nexustrade-redis-prod
    restart: unless-stopped
    command: >
      redis-server
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 2gb
      --maxmemory-policy allkeys-lru
      --appendonly yes
      --appendfsync everysec
    ports:
      - "127.0.0.1:6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - nexustrade-network
    healthcheck:
      test: ["CMD", "redis-cli", "--raw", "incr", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 1G

  prometheus:
    image: prom/prometheus:latest
    container_name: nexustrade-prometheus-prod
    restart: unless-stopped
    ports:
      - "127.0.0.1:9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/alerts.yml:/etc/prometheus/alerts.yml:ro
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=90d'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--web.enable-lifecycle'
    networks:
      - nexustrade-network
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 2G

  alertmanager:
    image: prom/alertmanager:latest
    container_name: nexustrade-alertmanager-prod
    restart: unless-stopped
    ports:
      - "127.0.0.1:9093:9093"
    volumes:
      - ./monitoring/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - ./monitoring/templates:/etc/alertmanager/templates:ro
      - alertmanager-data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    networks:
      - nexustrade-network
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  grafana:
    image: grafana/grafana:latest
    container_name: nexustrade-grafana-prod
    restart: unless-stopped
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_SERVER_ROOT_URL=https://nexustradeai.yourdomain.com/grafana
      - GF_SERVER_SERVE_FROM_SUB_PATH=true
      - GF_INSTALL_PLUGINS=grafana-clock-panel,grafana-simple-json-datasource
    ports:
      - "127.0.0.1:3030:3000"
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/var/lib/grafana/dashboards:ro
      - grafana-data:/var/lib/grafana
    networks:
      - nexustrade-network
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G

networks:
  nexustrade-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16

volumes:
  postgres-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/nexustradeai/data/postgres
  redis-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/nexustradeai/data/redis
  prometheus-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /opt/nexustradeai/data/prometheus
  alertmanager-data:
    driver: local
  grafana-data:
    driver: local

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### 2. Deploy Services

```bash
cd /opt/nexustradeai/infrastructure

# Pull latest images
docker-compose -f docker-compose.prod.yml pull

# Build application image
docker-compose -f docker-compose.prod.yml build --no-cache

# Start services (detached mode)
docker-compose -f docker-compose.prod.yml up -d

# Watch logs
docker-compose -f docker-compose.prod.yml logs -f

# Verify all services are running
docker-compose -f docker-compose.prod.yml ps
```

### 3. Verify Deployment

```bash
# Check service health
curl http://localhost:3001/health
curl http://localhost:9090/-/healthy
curl http://localhost:9093/-/healthy
curl http://localhost:3030/api/health

# Check trading bot status
curl -s http://localhost:3001/api/trading/status | jq .

# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Check active alerts
curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts[] | {name: .labels.alertname, state: .state}'
```

---

## Monitoring Setup

### Configure Production Alert Thresholds

Update `infrastructure/monitoring/alerts.yml` for production:

```yaml
groups:
  - name: production_critical
    interval: 15s
    rules:
      # Trading Performance
      - alert: NegativePnL
        expr: trading_bot_pnl_total_usd < -2000  # More strict
        for: 5m
        labels:
          severity: critical
          component: trading
        annotations:
          summary: "Significant trading losses detected"
          description: "Total P&L is ${{ $value }}, exceeding -$2000 threshold"

      - alert: HighDrawdown
        expr: trading_bot_max_drawdown_percent > 15  # More strict
        for: 3m
        labels:
          severity: critical
          component: risk
        annotations:
          summary: "Dangerous drawdown level"
          description: "Max drawdown is {{ $value }}%, exceeding 15% limit"

      # System Health
      - alert: HighMemoryUsage
        expr: trading_bot_memory_heap_usage_percent > 80  # Production threshold
        for: 2m
        labels:
          severity: warning
          component: memory
        annotations:
          summary: "High memory usage"
          description: "Memory usage is {{ $value }}%"

      - alert: CriticalMemoryUsage
        expr: trading_bot_memory_heap_usage_percent > 90
        for: 1m
        labels:
          severity: critical
          component: memory
        annotations:
          summary: "CRITICAL: Memory exhaustion imminent"
          description: "Memory usage is {{ $value }}%. Bot may crash."

      # Database
      - alert: SlowDatabaseQueries
        expr: trading_bot_db_query_duration_ms > 50  # Strict latency
        for: 2m
        labels:
          severity: warning
          component: database
        annotations:
          summary: "Database queries slow"
          description: "Database query duration is {{ $value }}ms"
```

### Configure Production Notifications

Update `infrastructure/monitoring/alertmanager.yml`:

```yaml
global:
  smtp_smarthost: '${SMTP_HOST}:${SMTP_PORT}'
  smtp_from: '${SMTP_FROM}'
  smtp_auth_username: '${SMTP_USER}'
  smtp_auth_password: '${SMTP_PASSWORD}'
  smtp_require_tls: true
  slack_api_url: '${SLACK_WEBHOOK_URL}'
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  receiver: 'default'
  group_by: ['alertname', 'component', 'severity']
  group_wait: 10s
  group_interval: 5m
  repeat_interval: 4h

  routes:
    # Critical alerts - immediate notification, all channels
    - match:
        severity: critical
      receiver: 'critical-alerts'
      repeat_interval: 15m
      continue: true

    # Trading alerts - during market hours
    - match:
        component: trading
      receiver: 'trading-team'
      active_time_intervals:
        - market-hours

    # Infrastructure alerts - 24/7
    - match:
        component: infrastructure
      receiver: 'infrastructure-team'

receivers:
  - name: 'default'
    email_configs:
      - to: '${ALERT_EMAIL_TO}'
        headers:
          Subject: '[NexusTradeAI] {{ .GroupLabels.alertname }}'
        html: '{{ template "email.default.html" . }}'

  - name: 'critical-alerts'
    email_configs:
      - to: '${ALERT_EMAIL_TO}'
        headers:
          Subject: '[CRITICAL] NexusTradeAI Alert - {{ .GroupLabels.alertname }}'
          Priority: 'urgent'
        html: '{{ template "email.critical.html" . }}'
    slack_configs:
      - channel: '${SLACK_CHANNEL}'
        title: 'CRITICAL: {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
        send_resolved: true
    pagerduty_configs:
      - service_key: '${PAGERDUTY_INTEGRATION_KEY}'
        description: '{{ .GroupLabels.alertname }}: {{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

  - name: 'trading-team'
    email_configs:
      - to: 'trading@yourdomain.com'
        html: '{{ template "email.default.html" . }}'
    slack_configs:
      - channel: '#trading-alerts'
        send_resolved: true

  - name: 'infrastructure-team'
    email_configs:
      - to: 'infrastructure@yourdomain.com'
        html: '{{ template "email.default.html" . }}'
    slack_configs:
      - channel: '#infrastructure-alerts'
        send_resolved: true

time_intervals:
  - name: market-hours
    time_intervals:
      - times:
          - start_time: '14:30'  # 9:30 AM EST in UTC
            end_time: '21:00'    # 4:00 PM EST in UTC
        weekdays: ['monday:friday']
```

### Test Notifications

```bash
# Test email notification
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{
    "labels": {
      "alertname": "TestAlert",
      "severity": "warning"
    },
    "annotations": {
      "summary": "This is a test alert",
      "description": "Testing notification system"
    }
  }]'

# Check Alertmanager status
curl -s http://localhost:9093/api/v1/status | jq .

# Verify email was sent (check logs)
docker-compose -f docker-compose.prod.yml logs alertmanager | grep "TestAlert"
```

---

## Verification

### Post-Deployment Checklist

**1. Service Health:**
```bash
# All containers running
docker ps --filter "name=nexustrade" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Health checks passing
docker inspect --format='{{.State.Health.Status}}' nexustrade-bot-prod
docker inspect --format='{{.State.Health.Status}}' nexustrade-postgres-prod
docker inspect --format='{{.State.Health.Status}}' nexustrade-redis-prod
```

**2. Database:**
```bash
# Database accessible
PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT version();"

# Tables created
PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "\dt"

# Migrations applied
PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT * FROM schema_migrations ORDER BY version DESC LIMIT 5;"
```

**3. Trading Bot:**
```bash
# API responding
curl -f http://localhost:3001/health

# Trading status
curl -s http://localhost:3001/api/trading/status | jq '.success, .data.isConnected'

# Account connected
curl -s http://localhost:3001/api/accounts/summary | jq '.success, .data.realAccount.balance'
```

**4. Monitoring:**
```bash
# Prometheus scraping
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Alertmanager configured
curl -s http://localhost:9093/api/v1/status | jq '.data.config.route.receiver'

# Grafana accessible
curl -f http://localhost:3030/api/health
```

**5. SSL/TLS:**
```bash
# Certificate valid
openssl s_client -connect nexustradeai.yourdomain.com:443 -servername nexustradeai.yourdomain.com < /dev/null 2>/dev/null | openssl x509 -noout -dates

# HTTPS working
curl -I https://nexustradeai.yourdomain.com/health

# TLS version
nmap --script ssl-enum-ciphers -p 443 nexustradeai.yourdomain.com
```

**6. Backups:**
```bash
# Backup script executable
test -x /opt/nexustradeai/scripts/backup-production-db.sh && echo "OK" || echo "FAIL"

# Run manual backup
/opt/nexustradeai/scripts/backup-production-db.sh

# Verify backup created
ls -lh /opt/nexustradeai/backups/*.sql.gz | tail -1
```

**7. Logs:**
```bash
# Log rotation configured
logrotate -d /opt/nexustradeai/infrastructure/logging/logrotate.conf

# Logs being written
tail -20 /opt/nexustradeai/logs/combined.log

# No errors in logs
grep -i error /opt/nexustradeai/logs/error.log | tail -20
```

### Automated Verification Script

```bash
#!/bin/bash
# infrastructure/scripts/verify-deployment.sh

set -euo pipefail

ERRORS=0

echo "========================================="
echo "NexusTradeAI Deployment Verification"
echo "========================================="

# 1. Services
echo "Checking services..."
docker ps --filter "name=nexustrade" --format "{{.Names}}" | while read service; do
  health=$(docker inspect --format='{{.State.Health.Status}}' "$service" 2>/dev/null || echo "no healthcheck")
  if [ "$health" = "healthy" ] || [ "$health" = "no healthcheck" ]; then
    echo "✓ $service: $health"
  else
    echo "✗ $service: $health"
    ((ERRORS++))
  fi
done

# 2. API Health
echo "Checking API..."
if curl -sf http://localhost:3001/health > /dev/null; then
  echo "✓ Trading Bot API"
else
  echo "✗ Trading Bot API"
  ((ERRORS++))
fi

# 3. Database
echo "Checking database..."
if PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT 1" > /dev/null 2>&1; then
  echo "✓ PostgreSQL"
else
  echo "✗ PostgreSQL"
  ((ERRORS++))
fi

# 4. Monitoring
echo "Checking monitoring..."
if curl -sf http://localhost:9090/-/healthy > /dev/null; then
  echo "✓ Prometheus"
else
  echo "✗ Prometheus"
  ((ERRORS++))
fi

if curl -sf http://localhost:9093/-/healthy > /dev/null; then
  echo "✓ Alertmanager"
else
  echo "✗ Alertmanager"
  ((ERRORS++))
fi

# 5. SSL
echo "Checking SSL..."
if curl -sf https://nexustradeai.yourdomain.com/health > /dev/null; then
  echo "✓ HTTPS"
else
  echo "✗ HTTPS"
  ((ERRORS++))
fi

echo "========================================="
if [ $ERRORS -eq 0 ]; then
  echo "✓ All checks passed!"
  exit 0
else
  echo "✗ $ERRORS check(s) failed"
  exit 1
fi
```

---

## Rollback Procedures

### Automated Rollback

The deployment script (`infrastructure/scripts/deploy.sh`) includes automated rollback:

```bash
# If deployment fails, rollback is automatic
cd /opt/nexustradeai/infrastructure
./scripts/deploy.sh --rollback
```

### Manual Rollback Steps

**1. Stop Current Deployment:**
```bash
cd /opt/nexustradeai/infrastructure
docker-compose -f docker-compose.prod.yml down
```

**2. Restore Previous Version:**
```bash
# List available tags
git tag -l

# Checkout previous version
git checkout tags/v0.9.0

# Rebuild containers
docker-compose -f docker-compose.prod.yml build --no-cache
```

**3. Restore Database (if needed):**
```bash
# Find backup
ls -lh /opt/nexustradeai/backups/*.sql.gz

# Restore
gunzip < /opt/nexustradeai/backups/nexustradeai-prod-20241224-020000.sql.gz | \
  PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod
```

**4. Restart Services:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

**5. Verify Rollback:**
```bash
# Check version
curl -s http://localhost:3001/api/trading/status | jq '.data.version'

# Run verification
./infrastructure/scripts/verify-deployment.sh
```

### Emergency Procedures

**Complete System Restart:**
```bash
# Stop all services
docker-compose -f docker-compose.prod.yml down

# Clear volumes (DANGER: Data loss)
docker volume prune -f

# Restore from backup
./infrastructure/scripts/restore-backup.sh /opt/nexustradeai/backups/latest.tar.gz

# Restart
docker-compose -f docker-compose.prod.yml up -d
```

**Database Corruption:**
```bash
# Stop trading bot
docker stop nexustrade-bot-prod

# Restore database
gunzip < /opt/nexustradeai/backups/latest.sql.gz | \
  PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod

# Verify data
PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT COUNT(*) FROM positions;"

# Restart bot
docker start nexustrade-bot-prod
```

---

## Post-Deployment

### 1. Update Documentation

```bash
# Update CHANGELOG
cat >> CHANGELOG.md << EOF
## [1.0.0] - $(date +%Y-%m-%d)

### Deployed to Production
- Initial production deployment
- All infrastructure components operational
- Monitoring and alerting configured
- Automated backups enabled

### Configuration
- Server: production.example.com
- Environment: Production
- Version: 1.0.0
EOF

# Commit changes
git add CHANGELOG.md
git commit -m "docs: Update CHANGELOG for v1.0.0 production deployment"
git push origin main
```

### 2. Team Notification

Send deployment notification email:

```
Subject: [DEPLOYED] NexusTradeAI v1.0.0 to Production

Team,

NexusTradeAI v1.0.0 has been successfully deployed to production.

Deployment Details:
- Time: 2024-12-24 10:00 UTC
- Version: v1.0.0
- Environment: Production
- Server: production.example.com

Services Deployed:
✓ Trading Bot (port 3001)
✓ PostgreSQL Database
✓ Redis Cache
✓ Prometheus Monitoring
✓ Alertmanager
✓ Grafana Dashboards

Access:
- Dashboard: https://nexustradeai.yourdomain.com/grafana
- Prometheus: https://nexustradeai.yourdomain.com/prometheus (internal only)
- API Health: https://nexustradeai.yourdomain.com/health

Monitoring:
- Critical alerts: team@yourdomain.com + #trading-critical Slack
- Warning alerts: #trading-alerts Slack
- PagerDuty: Configured for critical alerts

Next Steps:
1. Monitor dashboard for 24 hours
2. Verify trading operations during market hours
3. Review alert notifications
4. Schedule post-deployment review (48 hours)

Rollback:
If issues arise, contact on-call engineer immediately.
Automated rollback available: ./scripts/deploy.sh --rollback

On-Call:
- Primary: John Doe (john@example.com)
- Secondary: Jane Smith (jane@example.com)

Best regards,
Infrastructure Team
```

### 3. Monitoring Dashboard

Create production monitoring dashboard checklist:

**First 24 Hours:**
- [ ] Check dashboard every 2 hours
- [ ] Verify no critical alerts
- [ ] Monitor memory usage trends
- [ ] Review trading activity logs
- [ ] Check database performance
- [ ] Verify backup completion

**First Week:**
- [ ] Daily health check review
- [ ] Weekly performance analysis
- [ ] Alert threshold adjustment (if needed)
- [ ] Team feedback collection
- [ ] Post-deployment review meeting

**Ongoing:**
- [ ] Monthly performance review
- [ ] Quarterly security audit
- [ ] Backup restoration test
- [ ] Disaster recovery drill
- [ ] Capacity planning review

### 4. Incident Response Readiness

Ensure team is ready:

```bash
# Verify runbooks accessible
ls -la /opt/nexustradeai/infrastructure/monitoring/runbooks/

# Test alert notifications
curl -X POST http://localhost:9093/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '[{"labels":{"alertname":"ProductionTest","severity":"warning"},"annotations":{"summary":"Production deployment test"}}]'

# Review on-call rotation
cat > /opt/nexustradeai/docs/on-call-schedule.md << EOF
# On-Call Schedule

## Week of Dec 24-30, 2024
- Primary: John Doe
- Secondary: Jane Smith

## Escalation
1. Primary on-call (15 min response)
2. Secondary on-call (30 min response)
3. Engineering Manager (1 hour response)
4. CTO (critical only)

## Contact
- Slack: #trading-critical
- PagerDuty: Auto-notification
- Phone: Emergency contact list
EOF
```

---

## Troubleshooting

### Common Issues

**Issue: Container won't start**
```bash
# Check logs
docker logs nexustrade-bot-prod --tail=100

# Common causes:
# 1. Environment variable missing
docker exec nexustrade-bot-prod env | grep ALPACA

# 2. Port already in use
lsof -i :3001
kill -9 <PID>

# 3. Database connection failed
docker exec nexustrade-bot-prod nc -zv postgres 5432
```

**Issue: High memory usage**
```bash
# Check memory
docker stats nexustrade-bot-prod --no-stream

# Force garbage collection
curl -X POST http://localhost:3001/api/system/gc

# Restart if needed
docker restart nexustrade-bot-prod
```

**Issue: Database connection timeout**
```bash
# Check PostgreSQL
docker exec nexustrade-postgres-prod pg_isready

# Check connections
PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT count(*) FROM pg_stat_activity;"

# Kill idle connections
PGPASSWORD='<PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < now() - interval '10 minutes';"
```

**Issue: Alerts not firing**
```bash
# Check Prometheus targets
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

# Check alert rules
curl -s http://localhost:9090/api/v1/rules | jq '.data.groups[].rules[] | {alert: .name, state: .state}'

# Test Alertmanager
curl -X POST http://localhost:9093/api/v1/alerts -d '[{"labels":{"alertname":"test"}}]'
```

**Issue: SSL certificate expired**
```bash
# Check expiration
openssl s_client -connect nexustradeai.yourdomain.com:443 -servername nexustradeai.yourdomain.com < /dev/null 2>/dev/null | openssl x509 -noout -dates

# Renew Let's Encrypt
sudo certbot renew --force-renewal

# Copy new certificates
sudo cp /etc/letsencrypt/live/nexustradeai.yourdomain.com/*.pem /opt/nexustradeai/ssl/
sudo chown nexustrade:nexustrade /opt/nexustradeai/ssl/*

# Reload Nginx
sudo systemctl reload nginx
```

### Emergency Contacts

**24/7 Support:**
- On-Call Engineer: See PagerDuty
- Slack: #trading-critical
- Email: critical@yourdomain.com

**Vendor Support:**
- Alpaca Markets: support@alpaca.markets
- AWS Support: See AWS Console
- Database Consultant: (if contracted)

**Escalation Path:**
1. On-Call Engineer (0-15 min)
2. Engineering Manager (15-30 min)
3. CTO (30-60 min)
4. CEO (critical business impact only)

---

## Appendix

### A. Production Checklist Summary

**Pre-Deployment:**
- [ ] All tests passing
- [ ] Security audit complete
- [ ] Production `.env` configured
- [ ] SSL certificates obtained
- [ ] Database backed up
- [ ] Team notified
- [ ] Runbooks reviewed

**Deployment:**
- [ ] Services deployed
- [ ] Database migrated
- [ ] SSL configured
- [ ] Monitoring enabled
- [ ] Backups scheduled
- [ ] Health checks passing

**Post-Deployment:**
- [ ] Verification script passed
- [ ] Notifications tested
- [ ] Documentation updated
- [ ] Team trained
- [ ] On-call scheduled
- [ ] 24-hour monitoring complete

### B. Performance Baselines

Record these after first 24 hours:

- Average API response time: _____ ms
- Database query 95th percentile: _____ ms
- Memory usage baseline: _____ %
- CPU usage baseline: _____ %
- Trades per day average: _____
- Win rate: _____ %

### C. Maintenance Windows

**Regular Maintenance:**
- **Weekly:** Sunday 2:00-3:00 AM UTC (database maintenance)
- **Monthly:** First Sunday 1:00-4:00 AM UTC (system updates)
- **Quarterly:** Announced 2 weeks in advance (major upgrades)

**Emergency Maintenance:**
- Critical security patches: Immediate
- Critical bug fixes: < 4 hours notice
- All others: 24 hours notice minimum

---

**Document Version:** 1.0
**Last Updated:** December 24, 2024
**Next Review:** January 24, 2025
**Owner:** Infrastructure Team

**Approval:**
- [ ] Engineering Lead
- [ ] Security Team
- [ ] Operations Team
- [ ] CTO
