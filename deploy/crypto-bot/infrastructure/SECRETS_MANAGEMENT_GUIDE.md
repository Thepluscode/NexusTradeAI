# Secrets Management Guide

**Version:** 1.0
**Date:** December 24, 2024
**Status:** Production Ready
**Classification:** CONFIDENTIAL

---

## Executive Summary

This guide provides comprehensive procedures for managing secrets (passwords, API keys, certificates) in NexusTradeAI production environments. Proper secrets management is critical for security, compliance, and operational resilience.

### Key Principles

1. **Never commit secrets to version control**
2. **Encrypt secrets at rest and in transit**
3. **Rotate secrets regularly (every 90 days)**
4. **Use principle of least privilege**
5. **Audit all secret access**
6. **Maintain secure backups**

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Secrets Inventory](#secrets-inventory)
3. [Generation and Storage](#generation-and-storage)
4. [Deployment Methods](#deployment-methods)
5. [Rotation Procedures](#rotation-procedures)
6. [Access Control](#access-control)
7. [Audit and Compliance](#audit-and-compliance)
8. [Emergency Procedures](#emergency-procedures)
9. [Best Practices](#best-practices)

---

## Quick Start

### Initial Setup

```bash
# 1. Generate production secrets
cd /opt/nexustradeai/infrastructure/scripts
./setup-secrets.sh setup

# 2. Update .env.production with external credentials
vim /opt/nexustradeai/.env.production
# Add: ALPACA_API_KEY, SMTP credentials, Slack webhook, AWS keys

# 3. Verify secrets
./setup-secrets.sh validate

# 4. Create encrypted backup
./setup-secrets.sh backup

# 5. Store backup in password manager
# Upload infrastructure/secrets/backups/*.enc to 1Password/LastPass/Bitwarden
```

### Deploying Secrets

**Docker Compose:**
```bash
cd /opt/nexustradeai/infrastructure
docker secret create db_password secrets/db_password.txt
docker secret create redis_password secrets/redis_password.txt
docker-compose -f docker-compose.prod.yml up -d
```

**Environment Variables:**
```bash
export $(cat /opt/nexustradeai/.env.production | xargs)
node /opt/nexustradeai/clients/bot-dashboard/unified-trading-bot.js
```

**Kubernetes:**
```bash
kubectl create secret generic nexustrade-secrets \
  --from-env-file=/opt/nexustradeai/.env.production \
  --namespace=production
```

---

## Secrets Inventory

### Application Secrets

| Secret | Purpose | Rotation | Criticality |
|--------|---------|----------|-------------|
| `DB_PASSWORD` | PostgreSQL authentication | 90 days | CRITICAL |
| `REDIS_PASSWORD` | Redis authentication | 90 days | HIGH |
| `SESSION_SECRET` | Express session signing | 90 days | HIGH |
| `JWT_SECRET` | JWT token signing | 90 days | CRITICAL |
| `ENCRYPTION_KEY` | Data encryption (AES-256) | 180 days | CRITICAL |

### External API Credentials

| Secret | Purpose | Rotation | Criticality |
|--------|---------|----------|-------------|
| `ALPACA_API_KEY` | Trading broker API | Manual | CRITICAL |
| `ALPACA_SECRET_KEY` | Trading broker secret | Manual | CRITICAL |
| `POLYGON_API_KEY` | Market data provider | Manual | MEDIUM |
| `FINNHUB_API_KEY` | Market data provider | Manual | MEDIUM |

### Infrastructure Secrets

| Secret | Purpose | Rotation | Criticality |
|--------|---------|----------|-------------|
| `SMTP_PASSWORD` | Email notifications | 90 days | MEDIUM |
| `SLACK_WEBHOOK_URL` | Slack alerts | Manual | MEDIUM |
| `AWS_SECRET_ACCESS_KEY` | S3 backup access | 90 days | HIGH |
| `PAGERDUTY_INTEGRATION_KEY` | On-call alerts | Manual | MEDIUM |
| `GRAFANA_ADMIN_PASSWORD` | Monitoring dashboard | 90 days | HIGH |

### SSL/TLS Certificates

| Certificate | Purpose | Expiration | Renewal |
|------------|---------|------------|---------|
| `fullchain.pem` | HTTPS certificate | 90 days | Auto (Let's Encrypt) |
| `privkey.pem` | HTTPS private key | 90 days | Auto (Let's Encrypt) |

---

## Generation and Storage

### Automated Generation

Use the provided script for secure random generation:

```bash
# Generate all secrets
cd /opt/nexustradeai/infrastructure/scripts
./setup-secrets.sh setup

# Output:
# - infrastructure/secrets/db_password.txt
# - infrastructure/secrets/redis_password.txt
# - infrastructure/secrets/session_secret.txt
# - infrastructure/secrets/jwt_secret.txt
# - infrastructure/secrets/encryption_key.txt
# - infrastructure/secrets/grafana_password.txt
# - .env.production
```

### Manual Generation

For manual secret generation:

```bash
# Strong password (32 characters)
openssl rand -base64 32 | tr -d "=+/" | cut -c1-32

# Hex key for encryption (32 bytes = 64 hex chars)
openssl rand -hex 32

# JWT secret (64 bytes base64)
openssl rand -base64 64 | tr -d "\n"

# Using pwgen (alternative)
pwgen -s 32 1  # Secure random password
```

### Storage Locations

**Development:**
- File: `.env` (gitignored)
- Location: Project root
- Permissions: 600 (-rw-------)

**Production:**
- File: `.env.production`
- Location: `/opt/nexustradeai/`
- Permissions: 600
- Owner: nexustrade:nexustrade

**Backups:**
- Location: `infrastructure/secrets/backups/`
- Format: Encrypted tar.gz (.enc)
- Permissions: 600
- Retention: 1 year

**Password Manager:**
- Primary: 1Password/LastPass/Bitwarden
- Item: "NexusTradeAI Production Secrets"
- Shared: With authorized team only

---

## Deployment Methods

### Method 1: Docker Secrets (Recommended)

**Setup:**
```bash
# Create secrets
cd /opt/nexustradeai/infrastructure

echo "<password>" | docker secret create db_password -
echo "<password>" | docker secret create redis_password -
echo "<password>" | docker secret create session_secret -
echo "<password>" | docker secret create jwt_secret -
echo "<password>" | docker secret create encryption_key -

# List secrets
docker secret ls

# Verify
docker secret inspect db_password
```

**Reference in docker-compose.yml:**
```yaml
version: '3.8'

services:
  trading-bot:
    environment:
      - DB_PASSWORD_FILE=/run/secrets/db_password
      - REDIS_PASSWORD_FILE=/run/secrets/redis_password
    secrets:
      - db_password
      - redis_password

secrets:
  db_password:
    external: true
  redis_password:
    external: true
```

**Application Code:**
```javascript
// Read secret from file
const fs = require('fs');
const dbPassword = fs.readFileSync(process.env.DB_PASSWORD_FILE || '/run/secrets/db_password', 'utf8').trim();
```

### Method 2: Environment Variables

**Setup:**
```bash
# Load secrets into environment
export $(cat /opt/nexustradeai/.env.production | xargs)

# Verify
echo $DB_PASSWORD | wc -c  # Should be > 30

# Start application
node /opt/nexustradeai/clients/bot-dashboard/unified-trading-bot.js
```

**Systemd Service:**
```ini
[Unit]
Description=NexusTradeAI Trading Bot
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=nexustrade
WorkingDirectory=/opt/nexustradeai
EnvironmentFile=/opt/nexustradeai/.env.production
ExecStart=/usr/bin/node clients/bot-dashboard/unified-trading-bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Method 3: Kubernetes Secrets

**Create from file:**
```bash
kubectl create secret generic nexustrade-secrets \
  --from-env-file=/opt/nexustradeai/.env.production \
  --namespace=production

# Or from literals
kubectl create secret generic nexustrade-secrets \
  --from-literal=db-password='<password>' \
  --from-literal=redis-password='<password>' \
  --namespace=production
```

**Reference in Pod:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: trading-bot
spec:
  containers:
  - name: trading-bot
    image: nexustradeai:latest
    env:
    - name: DB_PASSWORD
      valueFrom:
        secretKeyRef:
          name: nexustrade-secrets
          key: db-password
    - name: REDIS_PASSWORD
      valueFrom:
        secretKeyRef:
          name: nexustrade-secrets
          key: redis-password
```

**Mount as files:**
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: trading-bot
spec:
  containers:
  - name: trading-bot
    volumeMounts:
    - name: secrets
      mountPath: "/etc/secrets"
      readOnly: true
    env:
    - name: DB_PASSWORD_FILE
      value: "/etc/secrets/db-password"
  volumes:
  - name: secrets
    secret:
      secretName: nexustrade-secrets
```

### Method 4: HashiCorp Vault

**Setup:**
```bash
# Install Vault CLI
brew install vault  # macOS
# or
sudo apt-get install vault  # Ubuntu

# Initialize Vault
export VAULT_ADDR='http://vault.example.com:8200'
vault login

# Store secrets
vault kv put secret/nexustradeai/prod \
  db_password="<password>" \
  redis_password="<password>" \
  alpaca_api_key="<key>" \
  alpaca_secret_key="<secret>"

# Retrieve secret
vault kv get -field=db_password secret/nexustradeai/prod
```

**Application Integration:**
```javascript
const vault = require('node-vault')({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN
});

async function getSecret(key) {
  const result = await vault.read('secret/nexustradeai/prod');
  return result.data[key];
}

// Usage
const dbPassword = await getSecret('db_password');
```

### Method 5: AWS Secrets Manager

**Setup:**
```bash
# Create secret
aws secretsmanager create-secret \
  --name nexustradeai/prod/database \
  --description "NexusTradeAI Production Database Credentials" \
  --secret-string '{"username":"nexustrade_app","password":"<password>"}'

# Retrieve secret
aws secretsmanager get-secret-value \
  --secret-id nexustradeai/prod/database \
  --query SecretString --output text | jq -r .password
```

**Application Integration:**
```javascript
const AWS = require('aws-sdk');
const client = new AWS.SecretsManager({region: 'us-east-1'});

async function getSecret(secretName) {
  const data = await client.getSecretValue({SecretId: secretName}).promise();
  return JSON.parse(data.SecretString);
}

// Usage
const dbCreds = await getSecret('nexustradeai/prod/database');
const dbPassword = dbCreds.password;
```

---

## Rotation Procedures

### Scheduled Rotation (Every 90 Days)

**Preparation:**
```bash
# 1. Schedule maintenance window
# 2. Notify team
# 3. Create backup
cd /opt/nexustradeai/infrastructure/scripts
./setup-secrets.sh backup
```

**Rotation Steps:**

**1. Generate New Secrets:**
```bash
# Rotate all auto-generated secrets
./setup-secrets.sh rotate

# Output:
# - New passwords generated
# - .env.production updated
# - Old secrets backed up to infrastructure/secrets/backups/pre-rotation-*
```

**2. Update Database Password:**
```bash
# Connect to database
PGPASSWORD='<OLD_PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod

# Change password
ALTER USER nexustrade_app WITH PASSWORD '<NEW_PASSWORD>';

# Test new password
PGPASSWORD='<NEW_PASSWORD>' psql -h localhost -U nexustrade_app -d nexustradeai_prod -c "SELECT 1;"
```

**3. Update Redis Password:**
```bash
# Connect to Redis
redis-cli -a <OLD_PASSWORD>

# Change password
CONFIG SET requirepass <NEW_PASSWORD>

# Test new password
redis-cli -a <NEW_PASSWORD> PING
```

**4. Restart Services:**
```bash
cd /opt/nexustradeai/infrastructure

# Rolling restart (zero downtime)
docker-compose -f docker-compose.prod.yml up -d --no-deps --build trading-bot

# Or full restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

**5. Verify:**
```bash
# Check all services healthy
docker ps --filter "name=nexustrade"

# Test API
curl -f http://localhost:3001/health

# Check database connection
curl -s http://localhost:3001/api/trading/status | jq '.data.isConnected'

# Monitor logs for errors
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

**6. Update Backups:**
```bash
# Create new encrypted backup
./setup-secrets.sh backup

# Upload to password manager
# Delete old secrets (keep encrypted backups only)
```

### Emergency Rotation (Suspected Compromise)

**Immediate Actions:**

```bash
# 1. STOP TRADING BOT IMMEDIATELY
docker stop nexustrade-bot-prod

# 2. Change critical passwords
./setup-secrets.sh rotate

# 3. Revoke API keys (Alpaca dashboard)
# Login to https://app.alpaca.markets
# Go to Settings > API Keys
# Delete compromised keys
# Generate new keys

# 4. Update .env.production with new Alpaca keys
vim /opt/nexustradeai/.env.production

# 5. Restart with new secrets
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# 6. Audit logs for unauthorized access
grep "authentication" /opt/nexustradeai/logs/*.log
docker-compose logs | grep -i "error\|unauthorized\|failed"

# 7. Report incident
# - Document what was compromised
# - When it was detected
# - Actions taken
# - Save to infrastructure/incidents/
```

### External API Key Rotation

**Alpaca Markets:**
```bash
# 1. Login to Alpaca dashboard
# https://app.alpaca.markets

# 2. Navigate to Settings > API Keys

# 3. Create new key pair
#    - Name: NexusTradeAI Production v2
#    - Permissions: Trading, Data
#    - Note: Rotating key on YYYY-MM-DD

# 4. Update .env.production
vim /opt/nexustradeai/.env.production
# Update ALPACA_API_KEY and ALPACA_SECRET_KEY

# 5. Restart bot
docker restart nexustrade-bot-prod

# 6. Verify connection
curl -s http://localhost:3001/api/accounts/summary | jq '.success'

# 7. Delete old key in Alpaca dashboard
```

**SMTP Credentials:**
```bash
# Gmail App Password rotation:
# 1. Go to https://myaccount.google.com/apppasswords
# 2. Delete old "NexusTradeAI" app password
# 3. Create new app password
# 4. Update .env.production SMTP_PASSWORD
# 5. Test email notification:
curl -X POST http://localhost:9093/api/v1/alerts -d '[{"labels":{"alertname":"TestRotation"}}]'
# 6. Verify email received
```

---

## Access Control

### Role-Based Access

| Role | Access Level | Secrets Allowed |
|------|--------------|-----------------|
| **Infrastructure Admin** | Full | All secrets, rotation, backup |
| **DevOps Engineer** | Read/Deploy | Application secrets, no API keys |
| **Developer** | Limited | Development secrets only |
| **Auditor** | Read-only | Audit logs, no secrets |
| **Support** | None | No access to secrets |

### Access Procedures

**Granting Access:**
```bash
# 1. Create user account
sudo useradd -m -s /bin/bash newuser

# 2. Add to nexustrade group (read-only)
sudo usermod -aG nexustrade newuser

# 3. Grant specific file access
sudo setfacl -m u:newuser:r /opt/nexustradeai/.env.production

# 4. Log access grant
echo "$(date): Granted .env read access to newuser" >> /opt/nexustradeai/infrastructure/secrets/access.log
```

**Revoking Access:**
```bash
# 1. Remove from group
sudo deluser newuser nexustrade

# 2. Remove file ACL
sudo setfacl -x u:newuser /opt/nexustradeai/.env.production

# 3. Log access revoke
echo "$(date): Revoked access for newuser" >> /opt/nexustradeai/infrastructure/secrets/access.log

# 4. Rotate secrets if user had write access
./setup-secrets.sh rotate
```

### Multi-Factor Authentication

**Require MFA for Secret Access:**

```bash
# Install Google Authenticator PAM module
sudo apt-get install libpam-google-authenticator

# Configure for user
google-authenticator

# Edit PAM config
sudo vim /etc/pam.d/sshd
# Add: auth required pam_google_authenticator.so

# Restart SSH
sudo systemctl restart sshd
```

---

## Audit and Compliance

### Access Logging

**Enable Audit Logging:**
```bash
# Create audit log directory
mkdir -p /opt/nexustradeai/logs/audit
chmod 700 /opt/nexustradeai/logs/audit

# Enable file access auditing (Linux)
sudo auditctl -w /opt/nexustradeai/.env.production -p rwa -k secrets_access
sudo auditctl -w /opt/nexustradeai/infrastructure/secrets/ -p rwa -k secrets_access

# View audit logs
sudo ausearch -k secrets_access
```

**Audit Log Format:**
```
2024-12-24 10:15:30 | USER: admin | ACTION: READ | FILE: .env.production | IP: 10.0.1.5
2024-12-24 10:20:45 | USER: devops | ACTION: ROTATE | FILE: db_password.txt | IP: 10.0.1.8
2024-12-24 10:25:12 | USER: system | ACTION: BACKUP | FILE: secrets-*.tar.gz | IP: localhost
```

### Compliance Requirements

**SOC 2 / ISO 27001:**
- ✅ Secrets encrypted at rest (AES-256)
- ✅ Secrets encrypted in transit (TLS 1.2+)
- ✅ Access controls (RBAC, ACLs)
- ✅ Audit logging (all access logged)
- ✅ Regular rotation (90 days)
- ✅ Secure backups (encrypted, off-site)

**PCI DSS (if processing payments):**
- ✅ Strong cryptography (256-bit encryption)
- ✅ Unique credentials per environment
- ✅ No default passwords
- ✅ Quarterly password changes
- ✅ Two-factor authentication

### Compliance Reporting

```bash
# Generate secrets audit report
cat > /opt/nexustradeai/infrastructure/scripts/secrets-audit-report.sh << 'EOF'
#!/bin/bash
echo "Secrets Audit Report - $(date)"
echo "========================================"
echo ""
echo "Secrets Files:"
ls -la /opt/nexustradeai/infrastructure/secrets/*.txt 2>/dev/null | awk '{print $1, $3, $9}'
echo ""
echo "Last Rotation:"
ls -lt /opt/nexustradeai/infrastructure/secrets/backups/ | grep "pre-rotation" | head -1
echo ""
echo "Active Docker Secrets:"
docker secret ls
echo ""
echo "Recent Access (last 7 days):"
sudo ausearch -k secrets_access --start recent | grep -i "type=SYSCALL" | tail -20
EOF

chmod +x /opt/nexustradeai/infrastructure/scripts/secrets-audit-report.sh
```

---

## Emergency Procedures

### Suspected Breach

**Immediate Response (Within 5 Minutes):**
```bash
# 1. STOP ALL TRADING
docker stop nexustrade-bot-prod

# 2. Disable external API access (if possible)
# - Alpaca: Disable API keys in dashboard
# - AWS: Rotate access keys immediately

# 3. Rotate all secrets
cd /opt/nexustradeai/infrastructure/scripts
./setup-secrets.sh rotate

# 4. Change all external passwords manually
# - SMTP
# - Slack webhook
# - Grafana admin

# 5. Enable network isolation
sudo iptables -A INPUT -s 0.0.0.0/0 -j DROP
sudo iptables -A INPUT -s 10.0.0.0/8 -j ACCEPT  # Allow internal only
```

**Investigation (Within 1 Hour):**
```bash
# Check for unauthorized access
sudo ausearch -k secrets_access --start today

# Check authentication logs
sudo grep -i "authentication" /var/log/auth.log | tail -100

# Check application logs
grep -i "unauthorized\|error\|failed" /opt/nexustradeai/logs/*.log

# Check database connections
PGPASSWORD='<password>' psql -h localhost -U nexustrade_app -d nexustradeai_prod \
  -c "SELECT * FROM pg_stat_activity WHERE usename = 'nexustrade_app';"

# Check Redis connections
redis-cli -a <password> CLIENT LIST
```

**Recovery (Within 4 Hours):**
```bash
# 1. Verify all secrets rotated
./setup-secrets.sh validate

# 2. Update all external services
# - New API keys
# - New webhooks
# - New passwords

# 3. Restore services with new secrets
docker-compose -f docker-compose.prod.yml up -d

# 4. Verify operations normal
./infrastructure/scripts/verify-deployment.sh

# 5. Document incident
vim /opt/nexustradeai/infrastructure/incidents/$(date +%Y%m%d)-breach.md
```

### Lost Secrets

**Recovery Procedure:**
```bash
# 1. Check encrypted backups
ls -la /opt/nexustradeai/infrastructure/secrets/backups/*.enc

# 2. Check password manager
# - 1Password
# - LastPass
# - Bitwarden

# 3. If no backups available, regenerate all secrets
./setup-secrets.sh rotate

# 4. Reconfigure all services
# - Database: ALTER USER ... WITH PASSWORD
# - Redis: CONFIG SET requirepass
# - External APIs: Regenerate keys in dashboards

# 5. Document recovery
echo "$(date): Secrets regenerated after loss" >> infrastructure/secrets/recovery.log
```

---

## Best Practices

### Do's

✅ **Always:**
- Use strong, randomly generated secrets (32+ characters)
- Encrypt secrets at rest
- Use TLS/HTTPS for transit
- Rotate secrets every 90 days
- Maintain encrypted backups
- Use separate secrets per environment
- Log all secret access
- Use secrets management tools (Vault, AWS Secrets Manager)
- Implement least privilege access
- Enable MFA for secret access

### Don'ts

❌ **Never:**
- Commit secrets to git
- Share secrets via email/chat
- Use weak or default passwords
- Reuse secrets across environments
- Store secrets in plaintext
- Share passwords between people
- Use production secrets in development
- Log secrets in application logs
- Hardcode secrets in code
- Use predictable secrets (dictionary words, dates)

### Checklist for New Secrets

When creating or deploying new secrets:

- [ ] Generated with cryptographically secure random (openssl, /dev/urandom)
- [ ] Minimum length met (passwords 32+, keys 256-bit)
- [ ] Stored with correct permissions (600 for files, 700 for directories)
- [ ] Encrypted backup created
- [ ] Added to password manager
- [ ] Documented in secrets inventory
- [ ] Rotation schedule set
- [ ] Access controls configured
- [ ] Audit logging enabled
- [ ] Tested in non-production first

---

## Appendix

### A. Secret Strength Requirements

| Secret Type | Min Length | Requirements |
|-------------|------------|--------------|
| Database Password | 32 chars | Alphanumeric + symbols |
| API Key | Provider-specific | As provided by vendor |
| JWT Secret | 64 bytes (base64) | Cryptographically random |
| Encryption Key | 32 bytes (256-bit) | Cryptographically random |
| Session Secret | 64 bytes | Cryptographically random |
| Human Password | 16+ chars | Passphrase or random |

### B. Rotation Schedule

| Secret | Frequency | Automated | Last Rotated |
|--------|-----------|-----------|--------------|
| Database passwords | 90 days | Yes | __________ |
| Redis password | 90 days | Yes | __________ |
| Session secret | 90 days | Yes | __________ |
| JWT secret | 90 days | Yes | __________ |
| Encryption key | 180 days | Yes | __________ |
| Alpaca API keys | Manual | No | __________ |
| SMTP password | 90 days | No | __________ |
| SSL certificates | 90 days | Yes (Let's Encrypt) | __________ |

### C. Compliance Mapping

**SOC 2 Controls:**
- CC6.1: Logical access controls → RBAC, ACLs
- CC6.2: Prior to access → MFA, authorization
- CC6.3: Removes access → Revocation procedures
- CC6.6: Encryption → AES-256, TLS 1.2+
- CC6.7: Credentials → Rotation, strength requirements

**ISO 27001 Controls:**
- A.9.2.1: User registration → Access control procedures
- A.9.2.4: Password management → Rotation, strength
- A.9.4.1: Restricted access → Least privilege
- A.10.1.1: Cryptographic controls → Encryption
- A.12.1.2: Change management → Rotation procedures

---

**Document Version:** 1.0
**Last Updated:** December 24, 2024
**Next Review:** March 24, 2025 (90 days)
**Owner:** Security Team

**Approval:**
- [ ] CISO
- [ ] Infrastructure Lead
- [ ] Compliance Officer
