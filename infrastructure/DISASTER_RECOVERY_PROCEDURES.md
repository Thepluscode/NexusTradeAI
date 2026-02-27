# Disaster Recovery Procedures

**Version:** 1.0
**Date:** December 24, 2024
**Status:** Production Ready
**Classification:** CRITICAL

---

## Executive Summary

This document provides comprehensive disaster recovery procedures for NexusTradeAI production systems. These procedures ensure business continuity in the event of catastrophic failures, data loss, or infrastructure outages.

### Recovery Objectives

- **Recovery Time Objective (RTO):** < 4 hours
- **Recovery Point Objective (RPO):** < 15 minutes
- **Data Loss Tolerance:** < 15 minutes of trades
- **Availability Target:** 99.9% uptime (8.76 hours downtime/year)

### Disaster Scenarios Covered

1. **Database Corruption** (RTO: 1 hour, RPO: 15 min)
2. **Complete Server Failure** (RTO: 4 hours, RPO: 15 min)
3. **Data Center Outage** (RTO: 8 hours, RPO: 1 hour)
4. **Ransomware Attack** (RTO: 8 hours, RPO: 24 hours)
5. **Accidental Data Deletion** (RTO: 2 hours, RPO: 1 hour)
6. **Application Corruption** (RTO: 30 minutes, RPO: 0)
7. **Security Breach** (RTO: variable, RPO: 0)

---

## Table of Contents

1. [Backup Strategy](#backup-strategy)
2. [Recovery Procedures](#recovery-procedures)
3. [Failover Procedures](#failover-procedures)
4. [Data Validation](#data-validation)
5. [Testing and Drills](#testing-and-drills)
6. [Emergency Contacts](#emergency-contacts)
7. [Post-Recovery](#post-recovery)

---

## Backup Strategy

### Backup Types

**1. Database Backups**
- **Frequency:** Every 15 minutes (incremental), Daily (full)
- **Retention:** 7 days (incremental), 30 days (daily), 12 months (monthly)
- **Location:** Local + S3 (multi-region)
- **Method:** PostgreSQL pg_dump + WAL archiving

**2. Application Backups**
- **Frequency:** On every deployment
- **Retention:** Last 10 deployments
- **Location:** S3
- **Method:** Docker image tags + configuration files

**3. Configuration Backups**
- **Frequency:** On every change + daily
- **Retention:** 90 days
- **Location:** S3 + Git repository
- **Method:** Automated commit and push

**4. Secrets Backups**
- **Frequency:** On every rotation + monthly
- **Retention:** 1 year (encrypted)
- **Location:** S3 (encrypted) + offline secure storage
- **Method:** Encrypted tar.gz

### Backup Verification

**Automated Checks (Daily):**
```bash
#!/bin/bash
# infrastructure/scripts/verify-backups.sh

# 1. Check backup exists
latest_backup=$(aws s3 ls s3://nexustradeai-backups-prod/database/ | sort | tail -1)

if [ -z "$latest_backup" ]; then
    echo "ERROR: No backups found"
    exit 1
fi

# 2. Check backup age
backup_date=$(echo "$latest_backup" | awk '{print $1" "$2}')
backup_age=$(( ($(date +%s) - $(date -d "$backup_date" +%s)) / 3600 ))

if [ $backup_age -gt 24 ]; then
    echo "ERROR: Latest backup is $backup_age hours old"
    exit 1
fi

# 3. Download and verify integrity
aws s3 cp "s3://nexustradeai-backups-prod/database/$backup_file" /tmp/verify.sql.gz
gunzip -t /tmp/verify.sql.gz

if [ $? -eq 0 ]; then
    echo "SUCCESS: Backup verified"
else
    echo "ERROR: Backup corrupted"
    exit 1
fi
```

**Manual Restoration Test (Monthly):**
- Restore latest backup to test environment
- Verify data integrity
- Run smoke tests
- Document results

---

## Recovery Procedures

### Scenario 1: Database Corruption

**Detection:**
- Database queries failing
- PostgreSQL error logs showing corruption
- Monitoring alerts: SlowDatabaseQueries, DatabaseDown

**Immediate Actions (0-5 minutes):**

```bash
# 1. Stop trading bot to prevent new trades
docker stop nexustrade-bot-prod

# 2. Verify database issue
docker exec nexustrade-postgres-prod pg_isready
docker logs nexustrade-postgres-prod --tail=100 | grep -i error

# 3. Assess damage
PGPASSWORD='<password>' psql -h localhost -U nexustrade_app -d nexustradeai_prod \
  -c "SELECT count(*) FROM positions;"

# If queries fail, proceed with restoration
```

**Restoration (5-60 minutes):**

```bash
#!/bin/bash
# Emergency database restoration

set -euo pipefail

log() {
    echo "[$(date +'%H:%M:%S')] $*"
}

log "DISASTER RECOVERY: Database Restoration"

# 1. Stop all services accessing database
docker stop nexustrade-bot-prod

# 2. Backup current (corrupted) database
log "Backing up corrupted database..."
PGPASSWORD='<password>' pg_dump -h localhost -U nexustrade_app -d nexustradeai_prod \
  > /opt/nexustradeai/backups/corrupted-$(date +%Y%m%d-%H%M%S).sql 2>/dev/null || true

# 3. Download latest good backup
log "Downloading latest backup from S3..."
latest_backup=$(aws s3 ls s3://nexustradeai-backups-prod/database/ --recursive | \
  grep ".sql.gz$" | sort | tail -1 | awk '{print $4}')

aws s3 cp "s3://nexustradeai-backups-prod/$latest_backup" /tmp/restore.sql.gz

# 4. Verify backup integrity
log "Verifying backup..."
gunzip -t /tmp/restore.sql.gz
if [ $? -ne 0 ]; then
    log "ERROR: Backup corrupted, trying previous backup..."
    # Try second-latest backup
    latest_backup=$(aws s3 ls s3://nexustradeai-backups-prod/database/ --recursive | \
      grep ".sql.gz$" | sort | tail -2 | head -1 | awk '{print $4}')
    aws s3 cp "s3://nexustradeai-backups-prod/$latest_backup" /tmp/restore.sql.gz
    gunzip -t /tmp/restore.sql.gz
fi

# 5. Drop and recreate database
log "Recreating database..."
PGPASSWORD='<password>' psql -h localhost -U postgres << EOF
DROP DATABASE IF EXISTS nexustradeai_prod;
CREATE DATABASE nexustradeai_prod;
GRANT ALL PRIVILEGES ON DATABASE nexustradeai_prod TO nexustrade_app;
EOF

# 6. Restore database
log "Restoring database..."
gunzip < /tmp/restore.sql.gz | PGPASSWORD='<password>' psql -h localhost \
  -U nexustrade_app -d nexustradeai_prod

# 7. Verify restoration
log "Verifying restoration..."
record_count=$(PGPASSWORD='<password>' psql -h localhost -U nexustrade_app \
  -d nexustradeai_prod -t -c "SELECT count(*) FROM positions;")

log "Restored $record_count position records"

# 8. Restart services
log "Restarting services..."
docker start nexustrade-bot-prod

# 9. Verify bot is working
sleep 10
curl -f http://localhost:3001/health

log "RECOVERY COMPLETE"
log "Backup restored: $latest_backup"
log "Records recovered: $record_count"
log "Downtime: $(( SECONDS / 60 )) minutes"
```

**Validation (60-70 minutes):**
- [ ] All tables present
- [ ] Record counts match expected
- [ ] Trading bot connects successfully
- [ ] Recent trades visible in dashboard
- [ ] No errors in application logs

**Communication:**
- Notify team via Slack: #trading-critical
- Email stakeholders
- Update status page (if public)

**Post-Recovery:**
- Document incident in `/infrastructure/incidents/`
- Identify root cause
- Implement preventive measures

---

### Scenario 2: Complete Server Failure

**Detection:**
- Server unreachable (ping fails)
- All services down
- Monitoring alerts: All systems critical

**Immediate Actions (0-15 minutes):**

```bash
# From local machine or backup server

# 1. Verify server is truly down
ping production-server.example.com
ssh nexustrade@production-server.example.com

# 2. Check cloud provider status
# AWS Console / Digital Ocean / etc.

# 3. Assess if server can be recovered or needs replacement
# If hardware failure or unrecoverable, proceed with new server setup
```

**New Server Setup (15-120 minutes):**

```bash
#!/bin/bash
# Complete server recovery to new hardware

set -euo pipefail

log() {
    echo "[$(date +'%H:%M:%S')] $*"
}

log "DISASTER RECOVERY: New Server Setup"

NEW_SERVER_IP="${1}"

if [ -z "$NEW_SERVER_IP" ]; then
    echo "Usage: $0 <new_server_ip>"
    exit 1
fi

log "Target server: $NEW_SERVER_IP"

# 1. Verify new server is accessible
log "Verifying new server..."
ssh root@$NEW_SERVER_IP "echo 'Server accessible'"

# 2. Run OS setup
log "Setting up OS..."
ssh root@$NEW_SERVER_IP << 'ENDSSH'
apt-get update
apt-get upgrade -y
apt-get install -y docker.io docker-compose git postgresql-client redis-tools
systemctl enable docker
systemctl start docker
ENDSSH

# 3. Create application user
log "Creating application user..."
ssh root@$NEW_SERVER_IP << 'ENDSSH'
useradd -m -s /bin/bash nexustrade
usermod -aG docker nexustrade
mkdir -p /opt/nexustradeai
chown nexustrade:nexustrade /opt/nexustradeai
ENDSSH

# 4. Clone repository
log "Cloning repository..."
ssh root@$NEW_SERVER_IP << 'ENDSSH'
su - nexustrade -c "cd /opt/nexustradeai && git clone https://github.com/yourusername/NexusTradeAI.git ."
su - nexustrade -c "cd /opt/nexustradeai && git checkout tags/v1.0.0"
ENDSSH

# 5. Restore configuration files
log "Restoring configuration..."
aws s3 cp s3://nexustradeai-backups-prod/config/latest/.env.production /tmp/
scp /tmp/.env.production nexustrade@$NEW_SERVER_IP:/opt/nexustradeai/

# 6. Restore secrets
aws s3 cp s3://nexustradeai-backups-prod/secrets/latest/secrets.tar.gz.enc /tmp/
# Decrypt locally (requires encryption key)
openssl enc -aes-256-cbc -d -in /tmp/secrets.tar.gz.enc -out /tmp/secrets.tar.gz
scp /tmp/secrets.tar.gz nexustrade@$NEW_SERVER_IP:/opt/nexustradeai/infrastructure/
ssh nexustrade@$NEW_SERVER_IP "cd /opt/nexustradeai/infrastructure && tar -xzf secrets.tar.gz"

# 7. Restore SSL certificates
aws s3 cp s3://nexustradeai-backups-prod/ssl/latest/ /tmp/ssl/ --recursive
scp -r /tmp/ssl/* nexustrade@$NEW_SERVER_IP:/opt/nexustradeai/infrastructure/ssl/

# 8. Deploy services
log "Deploying services..."
ssh nexustrade@$NEW_SERVER_IP << 'ENDSSH'
cd /opt/nexustradeai/infrastructure
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
ENDSSH

# 9. Restore database
log "Restoring database..."
ssh nexustrade@$NEW_SERVER_IP << 'ENDSSH'
# Wait for PostgreSQL to be ready
sleep 30

# Download latest backup
aws s3 cp s3://nexustradeai-backups-prod/database/latest.sql.gz /tmp/

# Restore
gunzip < /tmp/latest.sql.gz | PGPASSWORD='<password>' psql -h localhost -U nexustrade_app -d nexustradeai_prod
ENDSSH

# 10. Update DNS
log "Update DNS to point to $NEW_SERVER_IP"
log "Waiting for DNS propagation..."

# 11. Verify deployment
log "Verifying deployment..."
sleep 60
curl -f http://$NEW_SERVER_IP:3001/health

log "RECOVERY COMPLETE"
log "New server IP: $NEW_SERVER_IP"
log "Total downtime: $(( SECONDS / 60 )) minutes"
log ""
log "MANUAL STEPS REQUIRED:"
log "  1. Update DNS A record to $NEW_SERVER_IP"
log "  2. Verify SSL certificate valid"
log "  3. Test trading bot functionality"
log "  4. Notify team of IP change"
```

**Expected Downtime:** 2-4 hours
- Server provisioning: 15-30 minutes
- Software installation: 30-60 minutes
- Data restoration: 30-60 minutes
- DNS propagation: 5-60 minutes
- Verification: 15-30 minutes

---

### Scenario 3: Data Center Outage

**Detection:**
- Entire data center unreachable
- Cloud provider status page shows outage
- All services down for extended period

**Failover to Secondary Region (0-480 minutes):**

**Prerequisites:**
- Multi-region S3 backups
- Secondary server pre-provisioned (cold standby)
- DNS failover configured

**Procedure:**

```bash
#!/bin/bash
# Failover to secondary region

log() {
    echo "[$(date +'%H:%M:%S')] $*"
}

log "DISASTER RECOVERY: Multi-Region Failover"

SECONDARY_REGION="us-west-2"
SECONDARY_SERVER="secondary.nexustradeai.com"

# 1. Verify primary is truly down
log "Verifying primary region outage..."
if ping -c 5 production-server.example.com > /dev/null 2>&1; then
    log "WARNING: Primary seems reachable. Aborting failover."
    exit 1
fi

# 2. Activate secondary server
log "Activating secondary server in $SECONDARY_REGION..."
ssh nexustrade@$SECONDARY_SERVER << 'ENDSSH'
cd /opt/nexustradeai/infrastructure
docker-compose -f docker-compose.prod.yml up -d
ENDSSH

# 3. Restore latest data from S3 (cross-region replication)
log "Restoring data from replicated S3 bucket..."
ssh nexustrade@$SECONDARY_SERVER << 'ENDSSH'
aws s3 cp s3://nexustradeai-backups-prod-replica/database/latest.sql.gz /tmp/ --region us-west-2
gunzip < /tmp/latest.sql.gz | PGPASSWORD='<password>' psql -h localhost -U nexustrade_app -d nexustradeai_prod
ENDSSH

# 4. Update DNS to point to secondary
log "Updating DNS to secondary region..."
# Use DNS provider API or manual update

# 5. Verify secondary is operational
log "Verifying secondary..."
sleep 60
curl -f http://$SECONDARY_SERVER:3001/health

log "FAILOVER COMPLETE"
log "Now serving from: $SECONDARY_REGION"
log "Monitor primary region for recovery"
```

**Fallback to Primary:**

When primary region recovers:

```bash
# 1. Sync data from secondary to primary
# 2. Update DNS back to primary
# 3. Deactivate secondary
```

---

### Scenario 4: Ransomware Attack

**Detection:**
- Files encrypted with .locked or similar extension
- Ransom note found
- Services failing due to encrypted files

**Immediate Actions (0-5 minutes):**

```bash
# 1. ISOLATE IMMEDIATELY
sudo ufw deny out from any to any
docker stop $(docker ps -q)

# 2. Assess damage
find /opt/nexustradeai -name "*.locked" -o -name "RANSOM*"

# 3. Do NOT pay ransom
# 4. Do NOT delete encrypted files (evidence)

# 5. Notify authorities
# - Local law enforcement
# - FBI IC3 (Internet Crime Complaint Center)
# - Cyber insurance provider
```

**Recovery (5-480 minutes):**

```bash
#!/bin/bash
# Ransomware recovery

log() {
    echo "[$(date +'%H:%M:%S')] $*"
}

log "DISASTER RECOVERY: Ransomware Attack"

# 1. Provision new clean server
NEW_SERVER_IP="<new_clean_server>"

# 2. Restore from known-good backup (before attack)
# Determine attack time from file timestamps
ATTACK_TIME=$(stat *.locked | grep Modify | head -1 | cut -d' ' -f2-3)
log "Attack detected at: $ATTACK_TIME"

# Find backup before attack time
SAFE_BACKUP=$(aws s3 ls s3://nexustradeai-backups-prod/database/ | \
  awk '$1" "$2 < "'$ATTACK_TIME'" {last=$0} END {print last}' | awk '{print $4}')

log "Using safe backup: $SAFE_BACKUP"

# 3. Restore to new server (same as Scenario 2)
# ... (follow complete server restoration)

# 4. Scan restored data for malware
log "Scanning for malware..."
clamscan -r /opt/nexustradeai

# 5. Rotate ALL secrets
log "Rotating all secrets..."
./infrastructure/scripts/setup-secrets.sh rotate

# 6. Update all passwords
# - Database
# - API keys
# - SSH keys
# - SSL certificates

# 7. Forensic analysis (parallel to recovery)
# - Preserve encrypted server for investigation
# - Identify entry point
# - Check other systems

log "RECOVERY COMPLETE"
log "Security review required before resuming trading"
```

**Post-Recovery:**
- Complete security audit
- Implement additional security controls
- Review incident with security team
- Update security policies

---

### Scenario 5: Accidental Data Deletion

**Detection:**
- User reports missing data
- Database query returns fewer records than expected
- Application errors due to missing references

**Recovery (0-120 minutes):**

```bash
#!/bin/bash
# Point-in-time recovery for accidental deletion

log() {
    echo "[$(date +'%H:%M:%S')] $*"
}

DELETION_TIME="${1}"  # e.g., "2024-12-24 14:30:00"

if [ -z "$DELETION_TIME" ]; then
    echo "Usage: $0 'YYYY-MM-DD HH:MM:SS'"
    exit 1
fi

log "DISASTER RECOVERY: Point-in-Time Restoration"
log "Restoring to: $DELETION_TIME"

# 1. Find backup closest to deletion time
BACKUP_BEFORE=$(aws s3 ls s3://nexustradeai-backups-prod/database/ | \
  awk '$1" "$2 <= "'$DELETION_TIME'" {latest=$0} END {print latest}' | awk '{print $4}')

log "Using backup: $BACKUP_BEFORE"

# 2. Restore to temporary database
log "Restoring to temporary database..."
PGPASSWORD='<password>' psql -h localhost -U postgres -c "CREATE DATABASE nexustradeai_recovery;"

aws s3 cp "s3://nexustradeai-backups-prod/database/$BACKUP_BEFORE" /tmp/recovery.sql.gz
gunzip < /tmp/recovery.sql.gz | PGPASSWORD='<password>' psql -h localhost -U postgres -d nexustradeai_recovery

# 3. Identify deleted records
log "Comparing databases..."

# Get record IDs from recovery database
PGPASSWORD='<password>' psql -h localhost -U postgres -d nexustradeai_recovery \
  -c "\COPY (SELECT id FROM positions) TO '/tmp/recovery_ids.txt'"

# Get record IDs from production database
PGPASSWORD='<password>' psql -h localhost -U nexustrade_app -d nexustradeai_prod \
  -c "\COPY (SELECT id FROM positions) TO '/tmp/prod_ids.txt'"

# Find missing IDs
comm -23 <(sort /tmp/recovery_ids.txt) <(sort /tmp/prod_ids.txt) > /tmp/missing_ids.txt

MISSING_COUNT=$(wc -l < /tmp/missing_ids.txt)
log "Found $MISSING_COUNT missing records"

# 4. Restore missing records
log "Restoring missing records..."
while IFS= read -r id; do
    PGPASSWORD='<password>' psql -h localhost -U postgres -d nexustradeai_recovery \
      -c "SELECT * FROM positions WHERE id = $id" | \
      PGPASSWORD='<password>' psql -h localhost -U nexustrade_app -d nexustradeai_prod \
        -c "INSERT INTO positions SELECT * FROM stdin" || true
done < /tmp/missing_ids.txt

log "RECOVERY COMPLETE"
log "Restored $MISSING_COUNT record(s)"

# 5. Cleanup
PGPASSWORD='<password>' psql -h localhost -U postgres -c "DROP DATABASE nexustradeai_recovery;"
```

---

## Failover Procedures

### Automated Failover (Health Check Based)

```bash
#!/bin/bash
# infrastructure/scripts/automated-failover.sh
# Runs continuously, checks health, triggers failover if needed

while true; do
    if ! curl -f http://localhost:3001/health --max-time 10 > /dev/null 2>&1; then
        # Primary failed, check 3 more times
        failures=0
        for i in {1..3}; do
            sleep 10
            curl -f http://localhost:3001/health --max-time 10 > /dev/null 2>&1 || ((failures++))
        done

        if [ $failures -eq 3 ]; then
            # Trigger failover
            echo "CRITICAL: Primary failed health check 4 times"
            ./infrastructure/scripts/failover-to-secondary.sh
            break
        fi
    fi

    sleep 60
done
```

### Manual Failover

```bash
# When planned maintenance requires failover

# 1. Enable maintenance mode
echo "MAINTENANCE" > /opt/nexustradeai/status

# 2. Stop accepting new trades
docker exec nexustrade-bot-prod kill -USR1 1

# 3. Wait for active trades to complete (max 15 minutes)
timeout 900 bash -c 'while [ $(curl -s http://localhost:3001/api/trading/status | jq .data.activePositions) -gt 0 ]; do sleep 30; done'

# 4. Backup current state
./infrastructure/scripts/backup.sh

# 5. Activate secondary
./infrastructure/scripts/failover-to-secondary.sh

# 6. Verify secondary operational
curl -f http://secondary:3001/health

# 7. Update DNS
# Manual or automated

# 8. Perform maintenance on primary

# 9. Sync data from secondary to primary

# 10. Failback to primary when ready
```

---

## Data Validation

### Post-Recovery Validation Checklist

- [ ] **Database Integrity**
  ```sql
  -- Check for orphaned records
  SELECT COUNT(*) FROM positions WHERE account_id NOT IN (SELECT id FROM accounts);

  -- Check for negative balances (should not exist)
  SELECT * FROM accounts WHERE balance < 0;

  -- Verify trade count matches
  SELECT COUNT(*) FROM trades WHERE created_at > 'recovery_point';
  ```

- [ ] **Application Health**
  ```bash
  # All services running
  docker ps --filter "name=nexustrade"

  # API responding
  curl -f http://localhost:3001/health

  # Trading bot connected to broker
  curl -s http://localhost:3001/api/trading/status | jq '.data.isConnected'
  ```

- [ ] **Monitoring**
  ```bash
  # Prometheus scraping
  curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, health: .health}'

  # Alerts not firing
  curl -s http://localhost:9090/api/v1/alerts | jq '.data.alerts | length'
  ```

- [ ] **Data Consistency**
  ```bash
  # Compare record counts (before vs after)
  # Verify recent trades present
  # Check balances match
  ```

---

## Testing and Drills

### Monthly Drill Schedule

**First Monday: Database Restoration Test**
```bash
# 1. Create test database
# 2. Restore latest backup
# 3. Verify data integrity
# 4. Document time taken
# 5. Clean up test database
```

**Second Monday: Failover Test**
```bash
# 1. Activate secondary server
# 2. Restore data to secondary
# 3. Verify secondary operational
# 4. Test DNS failover
# 5. Failback to primary
```

**Third Monday: Point-in-Time Recovery**
```bash
# 1. Choose random timestamp
# 2. Restore to that point
# 3. Verify accuracy
# 4. Document process
```

**Fourth Monday: Full Disaster Scenario**
```bash
# Simulate complete outage
# Follow full recovery procedures
# Measure RTO/RPO achieved
# Update procedures based on findings
```

### Drill Documentation Template

```markdown
## Disaster Recovery Drill Report

**Date:** YYYY-MM-DD
**Scenario:** [Database Corruption / Server Failure / etc.]
**Conducted By:** [Name]

### Objectives
- [ ] Restore from backup
- [ ] Verify data integrity
- [ ] Minimize downtime

### Timeline
- 00:00 - Scenario initiated
- 00:05 - Backup download started
- 00:20 - Restoration began
- 00:45 - Services restarted
- 01:00 - Verification complete

### Results
- **RTO Achieved:** 60 minutes (Target: 240 minutes) ✓
- **RPO Achieved:** 15 minutes (Target: 15 minutes) ✓
- **Data Loss:** None
- **Issues Encountered:** [List any problems]

### Improvements Needed
1. [Action item 1]
2. [Action item 2]

### Next Drill
**Date:** YYYY-MM-DD
**Scenario:** [Next scenario to test]
```

---

## Emergency Contacts

### Internal Team

| Role | Name | Phone | Email | Slack |
|------|------|-------|-------|-------|
| On-Call Engineer | John Doe | +1-555-0100 | john@example.com | @john |
| Backup On-Call | Jane Smith | +1-555-0101 | jane@example.com | @jane |
| Database Admin | Bob Johnson | +1-555-0102 | bob@example.com | @bob |
| Security Lead | Alice Williams | +1-555-0103 | alice@example.com | @alice |
| CTO | Charlie Brown | +1-555-0104 | charlie@example.com | @charlie |
| CEO | Diana Prince | +1-555-0105 | diana@example.com | @diana |

### External Vendors

| Vendor | Purpose | Contact | Support Hours |
|--------|---------|---------|---------------|
| AWS Support | Infrastructure | 1-800-AWS-SUPPORT | 24/7 |
| Alpaca Markets | Trading API | support@alpaca.markets | 24/7 |
| PagerDuty | Alerting | support@pagerduty.com | 24/7 |
| Database Consultant | PostgreSQL | consultant@example.com | Business hours |

### Escalation Path

1. **On-Call Engineer** (0-15 min response)
2. **Backup On-Call** (15-30 min response)
3. **Database Admin** (for DB issues)
4. **Security Lead** (for security issues)
5. **CTO** (30-60 min, critical decisions)
6. **CEO** (business-critical only)

---

## Post-Recovery

### Post-Incident Review Template

```markdown
## Post-Incident Review: [INCIDENT_NAME]

**Date:** YYYY-MM-DD
**Incident ID:** INC-YYYY-###
**Severity:** [Critical / High / Medium]

### Summary
[Brief description of what happened]

### Timeline
- **Detection:** YYYY-MM-DD HH:MM
- **Response Started:** YYYY-MM-DD HH:MM
- **Recovery Complete:** YYYY-MM-DD HH:MM
- **Verification Complete:** YYYY-MM-DD HH:MM
- **Total Downtime:** X hours Y minutes

### Root Cause
[Detailed analysis of what caused the incident]

### Impact
- **Users Affected:** [Number or percentage]
- **Data Loss:** [Amount and type]
- **Revenue Impact:** [$X]
- **Trades Affected:** [Number]

### Response Evaluation
**What Went Well:**
- [Item 1]
- [Item 2]

**What Went Wrong:**
- [Item 1]
- [Item 2]

**RTO/RPO Performance:**
- RTO Target: X hours | Achieved: Y hours | Met: [Yes/No]
- RPO Target: X minutes | Achieved: Y minutes | Met: [Yes/No]

### Action Items
1. [ ] [Action item 1] - Assigned to: [Name] - Due: [Date]
2. [ ] [Action item 2] - Assigned to: [Name] - Due: [Date]
3. [ ] [Action item 3] - Assigned to: [Name] - Due: [Date]

### Prevention
[Steps to prevent recurrence]

### Documentation Updates
- [ ] Update runbooks
- [ ] Update disaster recovery procedures
- [ ] Update monitoring alerts

### Follow-Up
**Next Review:** YYYY-MM-DD
**Responsible:** [Name]
```

---

**Document Version:** 1.0
**Last Updated:** December 24, 2024
**Next Drill:** January 24, 2025
**Owner:** Infrastructure Team

**Approval:**
- [ ] CTO
- [ ] Infrastructure Lead
- [ ] Security Team
- [ ] Operations Team
