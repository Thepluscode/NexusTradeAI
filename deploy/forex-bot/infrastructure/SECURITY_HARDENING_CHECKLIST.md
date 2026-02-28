# Security Hardening Checklist

**Version:** 1.0
**Date:** December 24, 2024
**Status:** Production Ready
**Classification:** CONFIDENTIAL

---

## Executive Summary

This comprehensive security hardening checklist ensures NexusTradeAI production deployments meet institutional-grade security standards. All items must be completed before production deployment and verified quarterly.

### Compliance Standards

- ✅ **SOC 2 Type II** - Service Organization Control
- ✅ **ISO 27001** - Information Security Management
- ✅ **PCI DSS** - Payment Card Industry (if applicable)
- ✅ **GDPR** - General Data Protection Regulation (EU users)
- ✅ **OWASP Top 10** - Web Application Security Risks

### Security Layers

1. **Infrastructure** - OS, network, firewall (30 controls)
2. **Application** - Code, dependencies, APIs (25 controls)
3. **Data** - Encryption, backups, privacy (20 controls)
4. **Access** - Authentication, authorization, audit (15 controls)
5. **Monitoring** - Detection, alerting, response (10 controls)

**Total Controls:** 100

---

## Table of Contents

1. [Infrastructure Security](#infrastructure-security)
2. [Application Security](#application-security)
3. [Data Security](#data-security)
4. [Access Control](#access-control)
5. [Monitoring and Detection](#monitoring-and-detection)
6. [Compliance and Audit](#compliance-and-audit)
7. [Verification Procedures](#verification-procedures)

---

## Infrastructure Security

### Operating System Hardening

**Ubuntu/Debian Systems:**

- [ ] **OS-01:** Update system to latest stable version
  ```bash
  sudo apt-get update && sudo apt-get upgrade -y
  sudo apt-get dist-upgrade -y
  sudo reboot
  ```

- [ ] **OS-02:** Configure automatic security updates
  ```bash
  sudo apt-get install unattended-upgrades
  sudo dpkg-reconfigure --priority=low unattended-upgrades
  ```

- [ ] **OS-03:** Disable root login via SSH
  ```bash
  sudo vim /etc/ssh/sshd_config
  # Set: PermitRootLogin no
  sudo systemctl restart sshd
  ```

- [ ] **OS-04:** Configure SSH key-only authentication
  ```bash
  sudo vim /etc/ssh/sshd_config
  # Set: PasswordAuthentication no
  # Set: ChallengeResponseAuthentication no
  sudo systemctl restart sshd
  ```

- [ ] **OS-05:** Install and configure fail2ban
  ```bash
  sudo apt-get install fail2ban
  sudo systemctl enable fail2ban
  sudo systemctl start fail2ban
  ```

- [ ] **OS-06:** Set strong password policies
  ```bash
  sudo vim /etc/security/pwquality.conf
  # minlen = 14
  # dcredit = -1
  # ucredit = -1
  # ocredit = -1
  # lcredit = -1
  ```

- [ ] **OS-07:** Disable unused services
  ```bash
  sudo systemctl list-units --type=service
  # Disable unnecessary services
  sudo systemctl disable <service>
  sudo systemctl stop <service>
  ```

- [ ] **OS-08:** Configure system audit logging (auditd)
  ```bash
  sudo apt-get install auditd
  sudo systemctl enable auditd
  sudo auditctl -w /etc/passwd -p wa -k passwd_changes
  sudo auditctl -w /etc/shadow -p wa -k shadow_changes
  ```

- [ ] **OS-09:** Set file permissions correctly
  ```bash
  sudo chmod 600 /opt/nexustradeai/.env.production
  sudo chmod 700 /opt/nexustradeai/infrastructure/secrets
  sudo chmod 600 /opt/nexustradeai/infrastructure/ssl/privkey.pem
  ```

- [ ] **OS-10:** Enable SELinux or AppArmor
  ```bash
  # Ubuntu (AppArmor)
  sudo systemctl status apparmor
  sudo aa-status
  ```

### Network Security

- [ ] **NET-01:** Configure firewall (UFW)
  ```bash
  sudo ufw default deny incoming
  sudo ufw default allow outgoing
  sudo ufw allow 22/tcp    # SSH
  sudo ufw allow 80/tcp    # HTTP
  sudo ufw allow 443/tcp   # HTTPS
  sudo ufw enable
  ```

- [ ] **NET-02:** Restrict access to internal services
  ```bash
  # Prometheus only from internal network
  sudo ufw allow from 10.0.0.0/8 to any port 9090

  # PostgreSQL only from localhost
  sudo ufw deny 5432/tcp
  ```

- [ ] **NET-03:** Configure rate limiting for API endpoints
  ```nginx
  # In nginx.conf
  limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

  location /api/ {
      limit_req zone=api burst=20;
  }
  ```

- [ ] **NET-04:** Enable DDoS protection
  ```nginx
  # Connection limits
  limit_conn_zone $binary_remote_addr zone=addr:10m;
  limit_conn addr 10;
  ```

- [ ] **NET-05:** Configure intrusion detection (AIDE)
  ```bash
  sudo apt-get install aide
  sudo aideinit
  sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db
  ```

- [ ] **NET-06:** Disable IPv6 if not used
  ```bash
  sudo vim /etc/sysctl.conf
  # Add:
  net.ipv6.conf.all.disable_ipv6 = 1
  net.ipv6.conf.default.disable_ipv6 = 1
  sudo sysctl -p
  ```

- [ ] **NET-07:** Enable SYN flood protection
  ```bash
  sudo vim /etc/sysctl.conf
  # Add:
  net.ipv4.tcp_syncookies = 1
  net.ipv4.tcp_max_syn_backlog = 2048
  sudo sysctl -p
  ```

- [ ] **NET-08:** Disable ICMP redirects
  ```bash
  sudo vim /etc/sysctl.conf
  # Add:
  net.ipv4.conf.all.accept_redirects = 0
  net.ipv4.conf.default.accept_redirects = 0
  sudo sysctl -p
  ```

- [ ] **NET-09:** Enable reverse path filtering
  ```bash
  sudo vim /etc/sysctl.conf
  # Add:
  net.ipv4.conf.all.rp_filter = 1
  net.ipv4.conf.default.rp_filter = 1
  sudo sysctl -p
  ```

- [ ] **NET-10:** Configure network segmentation
  ```yaml
  # Docker networks isolated
  networks:
    nexustrade-network:
      driver: bridge
      internal: false  # External access
    database-network:
      driver: bridge
      internal: true   # No external access
  ```

### SSL/TLS Configuration

- [ ] **SSL-01:** Use TLS 1.2 or higher only
  ```nginx
  ssl_protocols TLSv1.2 TLSv1.3;
  ```

- [ ] **SSL-02:** Use strong cipher suites
  ```nginx
  ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
  ssl_prefer_server_ciphers on;
  ```

- [ ] **SSL-03:** Enable HSTS (HTTP Strict Transport Security)
  ```nginx
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
  ```

- [ ] **SSL-04:** Enable OCSP stapling
  ```nginx
  ssl_stapling on;
  ssl_stapling_verify on;
  ssl_trusted_certificate /path/to/fullchain.pem;
  resolver 8.8.8.8 8.8.4.4 valid=300s;
  ```

- [ ] **SSL-05:** Set strong DH parameters
  ```bash
  openssl dhparam -out /etc/nginx/dhparam.pem 4096
  ```
  ```nginx
  ssl_dhparam /etc/nginx/dhparam.pem;
  ```

- [ ] **SSL-06:** Enable session resumption
  ```nginx
  ssl_session_cache shared:SSL:50m;
  ssl_session_timeout 1d;
  ssl_session_tickets off;
  ```

- [ ] **SSL-07:** Configure certificate auto-renewal
  ```bash
  # Let's Encrypt auto-renewal
  sudo crontab -e
  0 3 * * * certbot renew --quiet --deploy-hook "/opt/nexustradeai/infrastructure/ssl/renewal-hook.sh"
  ```

- [ ] **SSL-08:** Verify SSL/TLS configuration
  ```bash
  # Test with SSLLabs
  # https://www.ssllabs.com/ssltest/

  # Or with testssl.sh
  ./testssl.sh nexustradeai.com
  ```

- [ ] **SSL-09:** Implement certificate pinning (for API clients)
  ```javascript
  const https = require('https');
  const agent = new https.Agent({
    ca: fs.readFileSync('/path/to/ca.pem'),
    checkServerIdentity: (host, cert) => {
      // Implement certificate pinning
    }
  });
  ```

- [ ] **SSL-10:** Monitor certificate expiration
  ```bash
  # Alert 30 days before expiration
  openssl x509 -in /path/to/cert.pem -noout -checkend 2592000
  ```

---

## Application Security

### Code Security

- [ ] **APP-01:** Update all dependencies to latest secure versions
  ```bash
  npm audit fix
  npm outdated
  npm update
  ```

- [ ] **APP-02:** Run security audit
  ```bash
  npm audit
  # Fix all HIGH and CRITICAL vulnerabilities
  ```

- [ ] **APP-03:** Enable npm audit in CI/CD
  ```yaml
  # .github/workflows/ci.yml
  - name: Security Audit
    run: npm audit --audit-level=high
  ```

- [ ] **APP-04:** Implement input validation
  ```javascript
  const Joi = require('joi');
  const schema = Joi.object({
    symbol: Joi.string().alphanum().min(1).max(5).required(),
    quantity: Joi.number().integer().min(1).max(10000).required(),
    price: Joi.number().positive().required()
  });
  ```

- [ ] **APP-05:** Sanitize user inputs
  ```javascript
  const sanitizeHtml = require('sanitize-html');
  const validator = require('validator');

  const clean = sanitizeHtml(userInput);
  const escaped = validator.escape(userInput);
  ```

- [ ] **APP-06:** Implement rate limiting
  ```javascript
  const rateLimit = require('express-rate-limit');
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
  app.use('/api/', limiter);
  ```

- [ ] **APP-07:** Use parameterized queries (prevent SQL injection)
  ```javascript
  // GOOD
  const result = await pool.query('SELECT * FROM positions WHERE id = $1', [positionId]);

  // BAD - Never use string concatenation
  // const result = await pool.query('SELECT * FROM positions WHERE id = ' + positionId);
  ```

- [ ] **APP-08:** Implement CSRF protection
  ```javascript
  const csrf = require('csurf');
  const csrfProtection = csrf({ cookie: true });
  app.use(csrfProtection);
  ```

- [ ] **APP-09:** Set security headers
  ```javascript
  const helmet = require('helmet');
  app.use(helmet());
  app.use(helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }));
  ```

- [ ] **APP-10:** Disable X-Powered-By header
  ```javascript
  app.disable('x-powered-by');
  ```

### API Security

- [ ] **API-01:** Implement API authentication (JWT)
  ```javascript
  const jwt = require('jsonwebtoken');

  function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  }
  ```

- [ ] **API-02:** Implement API authorization (RBAC)
  ```javascript
  function authorize(...roles) {
    return (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    };
  }

  app.get('/api/admin/users', authenticateToken, authorize('admin'), ...);
  ```

- [ ] **API-03:** Validate API keys securely
  ```javascript
  const crypto = require('crypto');

  function validateApiKey(apiKey) {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    // Compare hash with stored hash
  }
  ```

- [ ] **API-04:** Implement request size limits
  ```javascript
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  ```

- [ ] **API-05:** Log all API access
  ```javascript
  const morgan = require('morgan');
  app.use(morgan('combined', {
    stream: winston.stream
  }));
  ```

- [ ] **API-06:** Implement API versioning
  ```javascript
  app.use('/api/v1/', v1Routes);
  app.use('/api/v2/', v2Routes);
  ```

- [ ] **API-07:** Use HTTPS for all API endpoints
  ```javascript
  app.use((req, res, next) => {
    if (!req.secure && process.env.NODE_ENV === 'production') {
      return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
  });
  ```

- [ ] **API-08:** Implement timeout for API requests
  ```javascript
  const timeout = require('connect-timeout');
  app.use(timeout('30s'));
  ```

- [ ] **API-09:** Sanitize error messages
  ```javascript
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
      error: process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message
    });
  });
  ```

- [ ] **API-10:** Implement API documentation security
  ```javascript
  // Restrict Swagger/OpenAPI docs to internal IPs
  app.use('/api-docs', (req, res, next) => {
    const clientIp = req.ip;
    if (clientIp.startsWith('10.') || clientIp === '::1') {
      next();
    } else {
      res.status(403).send('Forbidden');
    }
  });
  ```

### Dependency Security

- [ ] **DEP-01:** Use npm lockfile
  ```bash
  # Commit package-lock.json to version control
  git add package-lock.json
  ```

- [ ] **DEP-02:** Audit dependencies regularly
  ```bash
  npm audit
  npm audit fix
  ```

- [ ] **DEP-03:** Use Snyk for continuous monitoring
  ```bash
  npm install -g snyk
  snyk auth
  snyk test
  snyk monitor
  ```

- [ ] **DEP-04:** Pin dependency versions
  ```json
  {
    "dependencies": {
      "express": "4.18.2",  // Exact version, not "^4.18.2"
      "pg": "8.11.0"
    }
  }
  ```

- [ ] **DEP-05:** Review dependency licenses
  ```bash
  npm install -g license-checker
  license-checker --summary
  ```

---

## Data Security

### Encryption

- [ ] **DATA-01:** Encrypt data at rest (database)
  ```bash
  # PostgreSQL - Enable encryption
  sudo vim /etc/postgresql/15/main/postgresql.conf
  # ssl = on
  # ssl_cert_file = '/path/to/cert.pem'
  # ssl_key_file = '/path/to/key.pem'
  ```

- [ ] **DATA-02:** Encrypt data in transit (TLS)
  ```javascript
  const dbConfig = {
    ssl: {
      rejectUnauthorized: true,
      ca: fs.readFileSync('/path/to/ca.pem').toString()
    }
  };
  ```

- [ ] **DATA-03:** Encrypt sensitive environment variables
  ```bash
  # Use encrypted secrets
  echo "password" | openssl enc -aes-256-cbc -salt -out password.enc
  ```

- [ ] **DATA-04:** Encrypt backups
  ```bash
  # Encrypt database backup
  pg_dump nexustradeai_prod | openssl enc -aes-256-cbc -salt -out backup.sql.enc
  ```

- [ ] **DATA-05:** Use field-level encryption for PII
  ```javascript
  const crypto = require('crypto');

  function encrypt(text) {
    const cipher = crypto.createCipher('aes-256-gcm', process.env.ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }
  ```

### Data Protection

- [ ] **DATA-06:** Implement data retention policies
  ```sql
  -- Delete old trades after 7 years
  DELETE FROM trades WHERE created_at < NOW() - INTERVAL '7 years';
  ```

- [ ] **DATA-07:** Anonymize sensitive data in logs
  ```javascript
  const winston = require('winston');
  winston.format.combine(
    winston.format((info) => {
      // Redact sensitive fields
      if (info.apiKey) info.apiKey = '***REDACTED***';
      if (info.password) info.password = '***REDACTED***';
      return info;
    })()
  );
  ```

- [ ] **DATA-08:** Implement data masking for non-production
  ```sql
  -- Mask email addresses
  UPDATE users SET email = CONCAT('user', id, '@example.com');
  ```

- [ ] **DATA-09:** Secure database credentials
  ```bash
  # Never hardcode credentials
  # Use environment variables or secrets manager
  DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id db_password)
  ```

- [ ] **DATA-10:** Implement database connection pooling limits
  ```javascript
  const pool = new Pool({
    max: 20,  // Maximum connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });
  ```

### Backup Security

- [ ] **BACKUP-01:** Encrypt all backups
  ```bash
  # See DATA-04
  ```

- [ ] **BACKUP-02:** Store backups off-site (S3)
  ```bash
  aws s3 cp backup.sql.enc s3://nexustradeai-backups-prod/ --sse AES256
  ```

- [ ] **BACKUP-03:** Test backup restoration monthly
  ```bash
  # Documented in disaster recovery procedures
  ```

- [ ] **BACKUP-04:** Implement backup retention policy
  ```bash
  # Keep daily backups for 30 days, weekly for 12 weeks, monthly for 7 years
  ```

- [ ] **BACKUP-05:** Secure backup access (S3 bucket policy)
  ```json
  {
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"AWS": "arn:aws:iam::ACCOUNT:role/backup-role"},
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::nexustradeai-backups-prod/*"
    }]
  }
  ```

---

## Access Control

### Authentication

- [ ] **AUTH-01:** Enforce strong password policy
  ```javascript
  const passwordValidator = require('password-validator');
  const schema = new passwordValidator();
  schema
    .is().min(14)
    .has().uppercase()
    .has().lowercase()
    .has().digits()
    .has().symbols()
    .has().not().spaces();
  ```

- [ ] **AUTH-02:** Implement multi-factor authentication (MFA)
  ```javascript
  const speakeasy = require('speakeasy');
  const QRCode = require('qrcode');

  // Generate MFA secret
  const secret = speakeasy.generateSecret({ name: 'NexusTradeAI' });

  // Verify MFA token
  const verified = speakeasy.totp.verify({
    secret: user.mfaSecret,
    encoding: 'base32',
    token: userToken
  });
  ```

- [ ] **AUTH-03:** Implement account lockout after failed attempts
  ```javascript
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCKOUT_TIME = 30 * 60 * 1000; // 30 minutes

  if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
    if (Date.now() - user.lastFailedLogin < LOCKOUT_TIME) {
      return res.status(429).json({ error: 'Account locked' });
    }
  }
  ```

- [ ] **AUTH-04:** Use bcrypt for password hashing
  ```javascript
  const bcrypt = require('bcrypt');
  const saltRounds = 12;
  const hashedPassword = await bcrypt.hash(password, saltRounds);
  ```

- [ ] **AUTH-05:** Implement session timeout
  ```javascript
  const session = require('express-session');
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 60 * 1000, // 30 minutes
      httpOnly: true,
      secure: true,
      sameSite: 'strict'
    }
  }));
  ```

### Authorization

- [ ] **AUTHZ-01:** Implement role-based access control (RBAC)
  ```javascript
  const roles = {
    admin: ['read', 'write', 'delete', 'admin'],
    trader: ['read', 'write'],
    viewer: ['read']
  };
  ```

- [ ] **AUTHZ-02:** Implement principle of least privilege
  ```bash
  # Database user has only required permissions
  GRANT SELECT, INSERT, UPDATE ON positions TO nexustrade_app;
  # No DELETE or DROP permissions
  ```

- [ ] **AUTHZ-03:** Implement resource-level authorization
  ```javascript
  // User can only access their own positions
  const positions = await pool.query(
    'SELECT * FROM positions WHERE user_id = $1',
    [req.user.id]
  );
  ```

- [ ] **AUTHZ-04:** Log all authorization failures
  ```javascript
  function authorize(resource, action) {
    return (req, res, next) => {
      if (!hasPermission(req.user, resource, action)) {
        logger.warn('Authorization failed', {
          user: req.user.id,
          resource,
          action,
          ip: req.ip
        });
        return res.status(403).json({ error: 'Forbidden' });
      }
      next();
    };
  }
  ```

- [ ] **AUTHZ-05:** Implement API key rotation policy
  ```javascript
  // Force API key rotation every 90 days
  if (Date.now() - apiKey.createdAt > 90 * 24 * 60 * 60 * 1000) {
    return res.status(401).json({ error: 'API key expired' });
  }
  ```

---

## Monitoring and Detection

### Security Monitoring

- [ ] **MON-01:** Enable application security logging
  ```javascript
  logger.info('Security event', {
    type: 'authentication',
    user: userId,
    ip: req.ip,
    success: true
  });
  ```

- [ ] **MON-02:** Monitor failed login attempts
  ```javascript
  if (!authenticated) {
    securityLogger.warn('Failed login', {
      username,
      ip: req.ip,
      timestamp: Date.now()
    });
  }
  ```

- [ ] **MON-03:** Alert on suspicious activity
  ```javascript
  // Alert if >10 failed logins from same IP in 5 minutes
  const failedLogins = await countFailedLogins(ip, 5 * 60 * 1000);
  if (failedLogins > 10) {
    alertManager.send('Brute force attack detected', { ip });
  }
  ```

- [ ] **MON-04:** Monitor API abuse
  ```javascript
  // Track API usage per key
  const usage = await redis.incr(`api:usage:${apiKey}:${hour}`);
  if (usage > 10000) {
    alertManager.send('API abuse detected', { apiKey });
  }
  ```

- [ ] **MON-05:** Implement intrusion detection alerts
  ```bash
  # AIDE reports
  sudo aide --check
  ```

- [ ] **MON-06:** Monitor SSL certificate expiration
  ```bash
  # Alert 30 days before expiration
  ```

- [ ] **MON-07:** Log all admin actions
  ```javascript
  logger.audit('Admin action', {
    admin: req.user.id,
    action: 'delete_position',
    resource: positionId,
    timestamp: Date.now()
  });
  ```

- [ ] **MON-08:** Implement anomaly detection
  ```javascript
  // Alert if trading volume 10x normal
  if (dailyVolume > averageVolume * 10) {
    alertManager.send('Abnormal trading volume', { volume: dailyVolume });
  }
  ```

- [ ] **MON-09:** Monitor privileged access
  ```bash
  # Log all sudo commands
  sudo grep sudo /var/log/auth.log
  ```

- [ ] **MON-10:** Set up security dashboard
  ```yaml
  # Grafana dashboard with:
  # - Failed login attempts
  # - API error rates
  # - Suspicious IP addresses
  # - SSL certificate status
  ```

---

## Compliance and Audit

### Compliance Requirements

- [ ] **COMP-01:** Document data flows
  ```
  User → HTTPS → Trading Bot → PostgreSQL
                           → Alpaca API (HTTPS)
                           → S3 Backups (encrypted)
  ```

- [ ] **COMP-02:** Maintain audit logs for 7 years
  ```bash
  # Configured in logrotate and S3 lifecycle policy
  ```

- [ ] **COMP-03:** Implement data privacy controls (GDPR)
  ```javascript
  // Right to erasure
  app.delete('/api/users/:id/data', async (req, res) => {
    await deleteUserData(req.params.id);
  });
  ```

- [ ] **COMP-04:** Create security incident response plan
  ```markdown
  # See infrastructure/INCIDENT_RESPONSE_PLAN.md
  ```

- [ ] **COMP-05:** Conduct quarterly security audits
  ```bash
  # Schedule: Jan 15, Apr 15, Jul 15, Oct 15
  # Run security audit script
  ./infrastructure/scripts/security-audit.sh
  ```

---

## Verification Procedures

### Automated Security Scan

```bash
#!/bin/bash
# infrastructure/scripts/security-audit.sh

echo "Security Audit - $(date)"

# 1. Check for updates
echo "=== OS Updates ==="
apt list --upgradable

# 2. Check firewall
echo "=== Firewall Status ==="
sudo ufw status verbose

# 3. Check SSH config
echo "=== SSH Configuration ==="
grep -E "PermitRootLogin|PasswordAuthentication" /etc/ssh/sshd_config

# 4. Check SSL certificates
echo "=== SSL Certificates ==="
openssl x509 -in /opt/nexustradeai/infrastructure/ssl/fullchain.pem -noout -dates

# 5. Check npm vulnerabilities
echo "=== NPM Audit ==="
cd /opt/nexustradeai && npm audit

# 6. Check Docker security
echo "=== Docker Security ==="
docker ps --format "table {{.Names}}\t{{.Status}}"

# 7. Check database access
echo "=== Database Access ==="
sudo grep "authentication" /var/log/postgresql/postgresql-*-*.log | tail -20

# 8. Check failed logins
echo "=== Failed Logins ==="
sudo grep "Failed password" /var/log/auth.log | tail -20

# 9. Generate report
echo "=== Security Score ==="
# Calculate score based on checks
```

### Manual Verification

**Quarterly Security Review Checklist:**

- [ ] Review all user accounts and permissions
- [ ] Verify all secrets rotated in last 90 days
- [ ] Test disaster recovery procedures
- [ ] Review audit logs for suspicious activity
- [ ] Update security documentation
- [ ] Conduct penetration testing (external)
- [ ] Review third-party security reports
- [ ] Update incident response procedures
- [ ] Verify backup integrity
- [ ] Review compliance requirements

---

**Document Version:** 1.0
**Last Updated:** December 24, 2024
**Next Audit:** March 24, 2025
**Owner:** Security Team

**Approval:**
- [ ] CISO
- [ ] Infrastructure Lead
- [ ] Compliance Officer
- [ ] CTO
