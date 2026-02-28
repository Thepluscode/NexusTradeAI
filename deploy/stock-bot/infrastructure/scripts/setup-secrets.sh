#!/bin/bash
###############################################################################
# Production Secrets Setup Script
# =================================
# Securely generates and configures production secrets
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SECRETS_DIR="$ROOT_DIR/infrastructure/secrets"
ENV_FILE="$ROOT_DIR/.env.production"

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $*"
}

###############################################################################
# Prerequisites Check
###############################################################################

check_prerequisites() {
    log "Checking prerequisites..."

    local required_commands=("openssl" "pwgen" "jq")
    local missing=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required commands: ${missing[*]}"
        echo ""
        echo "Install missing commands:"
        echo "  Ubuntu/Debian: sudo apt-get install ${missing[*]}"
        echo "  macOS: brew install ${missing[*]}"
        exit 1
    fi

    log_success "All prerequisites met"
}

###############################################################################
# Secrets Directory Setup
###############################################################################

setup_secrets_directory() {
    log "Setting up secrets directory..."

    # Create secrets directory with restricted permissions
    mkdir -p "$SECRETS_DIR"
    chmod 700 "$SECRETS_DIR"

    # Create subdirectories
    mkdir -p "$SECRETS_DIR/keys"
    mkdir -p "$SECRETS_DIR/certificates"
    mkdir -p "$SECRETS_DIR/backups"

    chmod 700 "$SECRETS_DIR"/*

    log_success "Secrets directory created"
}

###############################################################################
# Secret Generation Functions
###############################################################################

generate_random_password() {
    local length="${1:-32}"
    openssl rand -base64 "$length" | tr -d "=+/" | cut -c1-"$length"
}

generate_random_hex() {
    local bytes="${1:-32}"
    openssl rand -hex "$bytes"
}

generate_jwt_secret() {
    openssl rand -base64 64 | tr -d "\n"
}

generate_encryption_key() {
    openssl rand -hex 32
}

###############################################################################
# Generate Production Secrets
###############################################################################

generate_secrets() {
    log "Generating production secrets..."

    # Database password
    local db_password=$(generate_random_password 32)
    echo -n "$db_password" > "$SECRETS_DIR/db_password.txt"
    chmod 600 "$SECRETS_DIR/db_password.txt"
    log_success "Generated database password"

    # Redis password
    local redis_password=$(generate_random_password 32)
    echo -n "$redis_password" > "$SECRETS_DIR/redis_password.txt"
    chmod 600 "$SECRETS_DIR/redis_password.txt"
    log_success "Generated Redis password"

    # Session secret
    local session_secret=$(generate_jwt_secret)
    echo -n "$session_secret" > "$SECRETS_DIR/session_secret.txt"
    chmod 600 "$SECRETS_DIR/session_secret.txt"
    log_success "Generated session secret"

    # JWT secret
    local jwt_secret=$(generate_jwt_secret)
    echo -n "$jwt_secret" > "$SECRETS_DIR/jwt_secret.txt"
    chmod 600 "$SECRETS_DIR/jwt_secret.txt"
    log_success "Generated JWT secret"

    # Encryption key
    local encryption_key=$(generate_encryption_key)
    echo -n "$encryption_key" > "$SECRETS_DIR/encryption_key.txt"
    chmod 600 "$SECRETS_DIR/encryption_key.txt"
    log_success "Generated encryption key"

    # Grafana admin password
    local grafana_password=$(generate_random_password 24)
    echo -n "$grafana_password" > "$SECRETS_DIR/grafana_password.txt"
    chmod 600 "$SECRETS_DIR/grafana_password.txt"
    log_success "Generated Grafana password"

    # Create secrets summary
    cat > "$SECRETS_DIR/secrets_inventory.txt" << EOF
Production Secrets Inventory
============================
Generated: $(date)

Files:
- db_password.txt         : PostgreSQL database password
- redis_password.txt      : Redis cache password
- session_secret.txt      : Express session secret
- jwt_secret.txt          : JWT signing secret
- encryption_key.txt      : Data encryption key (32 bytes hex)
- grafana_password.txt    : Grafana admin password

IMPORTANT:
1. Never commit these files to version control
2. Store backups in secure password manager
3. Rotate secrets every 90 days
4. Use separate secrets for each environment

Next Steps:
1. Copy secrets to production .env file
2. Configure secrets in Docker/Kubernetes
3. Store backup in password manager (1Password, LastPass, etc.)
4. Delete local copies after deployment
EOF

    chmod 600 "$SECRETS_DIR/secrets_inventory.txt"
    log_success "Created secrets inventory"
}

###############################################################################
# Create Production .env File
###############################################################################

create_production_env() {
    log "Creating production .env template..."

    # Read generated secrets
    local db_password=$(cat "$SECRETS_DIR/db_password.txt")
    local redis_password=$(cat "$SECRETS_DIR/redis_password.txt")
    local session_secret=$(cat "$SECRETS_DIR/session_secret.txt")
    local jwt_secret=$(cat "$SECRETS_DIR/jwt_secret.txt")
    local encryption_key=$(cat "$SECRETS_DIR/encryption_key.txt")
    local grafana_password=$(cat "$SECRETS_DIR/grafana_password.txt")

    cat > "$ENV_FILE" << EOF
###############################################################################
# PRODUCTION ENVIRONMENT CONFIGURATION
# ====================================
# Generated: $(date)
# CRITICAL: Never commit this file to version control
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
DB_PASSWORD=$db_password
DB_POOL_MIN=5
DB_POOL_MAX=20
DB_SSL=true

# Redis Cache
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=$redis_password
REDIS_DB=0
REDIS_TLS=true

# Alpaca Markets (PRODUCTION - REAL MONEY)
# ⚠️  IMPORTANT: Update with your production API credentials
ALPACA_API_KEY=PKXXXXXXXXXXXXXXXXXXXXXX
ALPACA_SECRET_KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
ALPACA_BASE_URL=https://api.alpaca.markets
REAL_TRADING_ENABLED=false  # Set to true only after thorough testing

# Trading Configuration
MAX_DAILY_LOSS=-1000
MAX_POSITION_SIZE=5000
RISK_PER_TRADE=0.01
MAX_TRADES_PER_DAY=15
MAX_TRADES_PER_SYMBOL=3

# Monitoring - Prometheus
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9091

# Alerting - Email
# ⚠️  IMPORTANT: Update with your SMTP credentials
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourdomain.com
SMTP_PASSWORD=your_smtp_app_password_here
SMTP_FROM=NexusTradeAI Alerts <alerts@yourdomain.com>
ALERT_EMAIL_TO=team@yourdomain.com

# Alerting - Slack
# ⚠️  IMPORTANT: Update with your Slack webhook URL
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
SLACK_CHANNEL=#trading-alerts

# Alerting - PagerDuty (Optional)
PAGERDUTY_INTEGRATION_KEY=your_pagerduty_key_here

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"  # Daily at 2 AM
S3_BUCKET=nexustradeai-backups-prod
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key

# Security (Auto-generated - DO NOT CHANGE)
SESSION_SECRET=$session_secret
JWT_SECRET=$jwt_secret
ENCRYPTION_KEY=$encryption_key

# Grafana
GRAFANA_ADMIN_PASSWORD=$grafana_password

# SSL/TLS
SSL_CERT_PATH=/opt/nexustradeai/ssl/fullchain.pem
SSL_KEY_PATH=/opt/nexustradeai/ssl/privkey.pem

# External APIs (Optional)
POLYGON_API_KEY=
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
EOF

    chmod 600 "$ENV_FILE"
    log_success "Created production .env file"
}

###############################################################################
# Create Secrets Backup
###############################################################################

backup_secrets() {
    log "Creating secrets backup..."

    local backup_file="$SECRETS_DIR/backups/secrets-$(date +%Y%m%d-%H%M%S).tar.gz"

    tar -czf "$backup_file" \
        -C "$SECRETS_DIR" \
        db_password.txt \
        redis_password.txt \
        session_secret.txt \
        jwt_secret.txt \
        encryption_key.txt \
        grafana_password.txt \
        secrets_inventory.txt \
        2>/dev/null

    chmod 600 "$backup_file"

    log_success "Backup created: $backup_file"

    # Encrypt backup
    openssl enc -aes-256-cbc -salt \
        -in "$backup_file" \
        -out "$backup_file.enc" \
        -pass pass:"$(generate_random_password 48)"

    chmod 600 "$backup_file.enc"

    log_success "Encrypted backup: $backup_file.enc"
}

###############################################################################
# Secrets Validation
###############################################################################

validate_secrets() {
    log "Validating secrets..."

    local errors=0

    # Check file existence
    local required_files=(
        "db_password.txt"
        "redis_password.txt"
        "session_secret.txt"
        "jwt_secret.txt"
        "encryption_key.txt"
        "grafana_password.txt"
    )

    for file in "${required_files[@]}"; do
        if [ ! -f "$SECRETS_DIR/$file" ]; then
            log_error "Missing: $file"
            ((errors++))
        else
            # Check file permissions
            local perms=$(stat -c %a "$SECRETS_DIR/$file" 2>/dev/null || stat -f %A "$SECRETS_DIR/$file")
            if [ "$perms" != "600" ]; then
                log_error "Incorrect permissions on $file: $perms (should be 600)"
                ((errors++))
            fi

            # Check content not empty
            if [ ! -s "$SECRETS_DIR/$file" ]; then
                log_error "Empty file: $file"
                ((errors++))
            fi
        fi
    done

    # Check .env file
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Production .env file not found"
        ((errors++))
    else
        local env_perms=$(stat -c %a "$ENV_FILE" 2>/dev/null || stat -f %A "$ENV_FILE")
        if [ "$env_perms" != "600" ]; then
            log_error "Incorrect permissions on .env.production: $env_perms (should be 600)"
            ((errors++))
        fi
    fi

    if [ $errors -eq 0 ]; then
        log_success "All secrets validated"
        return 0
    else
        log_error "$errors validation error(s) found"
        return 1
    fi
}

###############################################################################
# Display Next Steps
###############################################################################

display_next_steps() {
    echo ""
    echo "=========================================="
    echo "Production Secrets Setup Complete"
    echo "=========================================="
    echo ""
    log_success "Secrets generated and stored securely"
    echo ""
    echo "Generated Files:"
    echo "  - $ENV_FILE"
    echo "  - $SECRETS_DIR/*.txt"
    echo ""
    echo "CRITICAL NEXT STEPS:"
    echo ""
    echo "1. UPDATE API CREDENTIALS in .env.production:"
    echo "   - ALPACA_API_KEY (production key)"
    echo "   - ALPACA_SECRET_KEY (production secret)"
    echo "   - SMTP_USER and SMTP_PASSWORD"
    echo "   - SLACK_WEBHOOK_URL"
    echo "   - AWS credentials (for backups)"
    echo ""
    echo "2. BACKUP SECRETS SECURELY:"
    echo "   - Store in password manager (1Password, LastPass, Bitwarden)"
    echo "   - Encrypted backup: $SECRETS_DIR/backups/*.enc"
    echo "   - Keep offline copy in secure location"
    echo ""
    echo "3. CONFIGURE DOCKER SECRETS:"
    echo "   cd infrastructure"
    echo "   docker secret create db_password $SECRETS_DIR/db_password.txt"
    echo "   docker secret create redis_password $SECRETS_DIR/redis_password.txt"
    echo ""
    echo "4. VERIFY PERMISSIONS:"
    echo "   ls -la $SECRETS_DIR/"
    echo "   ls -la $ENV_FILE"
    echo "   # All should be 600 (-rw-------)"
    echo ""
    echo "5. DELETE LOCAL SECRETS after deployment:"
    echo "   (Keep only encrypted backups)"
    echo ""
    echo "6. SET ROTATION REMINDER:"
    echo "   Calendar: $(date -d '+90 days' +%Y-%m-%d 2>/dev/null || date -v +90d +%Y-%m-%d)"
    echo "   Action: Rotate all secrets every 90 days"
    echo ""
    echo "⚠️  SECURITY WARNINGS:"
    echo "  - NEVER commit .env.production to version control"
    echo "  - NEVER share secrets via email or chat"
    echo "  - NEVER use these secrets in non-production environments"
    echo "  - ALWAYS use HTTPS/TLS in production"
    echo "  - ALWAYS enable 2FA on all production accounts"
    echo ""
    echo "=========================================="
    echo ""
}

###############################################################################
# Secrets Rotation
###############################################################################

rotate_secrets() {
    log "Rotating secrets..."
    log_warning "This will generate NEW secrets and invalidate old ones"

    read -p "Are you sure you want to rotate secrets? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Rotation cancelled"
        exit 0
    fi

    # Backup old secrets
    local rotation_backup="$SECRETS_DIR/backups/pre-rotation-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$rotation_backup"
    cp "$SECRETS_DIR"/*.txt "$rotation_backup/" 2>/dev/null || true
    cp "$ENV_FILE" "$rotation_backup/" 2>/dev/null || true

    log_success "Old secrets backed up to: $rotation_backup"

    # Generate new secrets
    generate_secrets
    create_production_env

    log_success "Secrets rotated successfully"
    log_warning "You must restart all services for new secrets to take effect"

    echo ""
    echo "Restart services:"
    echo "  cd /opt/nexustradeai/infrastructure"
    echo "  docker-compose -f docker-compose.prod.yml down"
    echo "  docker-compose -f docker-compose.prod.yml up -d"
}

###############################################################################
# Main
###############################################################################

main() {
    local command="${1:-setup}"

    case "$command" in
        setup)
            log "=========================================="
            log "Production Secrets Setup"
            log "=========================================="
            echo ""

            check_prerequisites
            setup_secrets_directory
            generate_secrets
            create_production_env
            backup_secrets
            validate_secrets

            display_next_steps
            ;;

        rotate)
            rotate_secrets
            ;;

        validate)
            validate_secrets
            ;;

        backup)
            backup_secrets
            log_success "Secrets backed up"
            ;;

        *)
            echo "Usage: $0 {setup|rotate|validate|backup}"
            echo ""
            echo "Commands:"
            echo "  setup     - Initial secrets generation (first time)"
            echo "  rotate    - Rotate all secrets (generates new ones)"
            echo "  validate  - Validate existing secrets"
            echo "  backup    - Create encrypted backup of secrets"
            exit 1
            ;;
    esac
}

main "$@"
