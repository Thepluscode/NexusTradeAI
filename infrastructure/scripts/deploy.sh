#!/bin/bash
###############################################################################
# Production Deployment Script
# =============================
# Institutional-grade deployment with safety checks and rollback capability
#
# Usage:
#   ./deploy.sh [environment] [version]
#   ./deploy.sh staging v1.2.3
#   ./deploy.sh production v1.2.3
#
# Environments: local, staging, production
###############################################################################

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-staging}"
VERSION="${2:-latest}"
PROJECT_NAME="nexustradeai"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
LOG_FILE="$ROOT_DIR/logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# Deployment settings
HEALTH_CHECK_TIMEOUT=60
HEALTH_CHECK_INTERVAL=5
ROLLBACK_ON_FAILURE=true

###############################################################################
# Utility Functions
###############################################################################

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $*" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓${NC} $*" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗${NC} $*" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠${NC} $*" | tee -a "$LOG_FILE"
}

confirm() {
    local message="$1"
    if [[ "$ENVIRONMENT" == "production" ]]; then
        read -p "$message (yes/no): " -r
        if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
            log_error "Deployment cancelled by user"
            exit 1
        fi
    fi
}

###############################################################################
# Pre-deployment Checks
###############################################################################

check_prerequisites() {
    log "Checking prerequisites..."

    # Check required commands
    local required_commands=("docker" "docker-compose" "git" "curl" "psql")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Required command not found: $cmd"
            exit 1
        fi
    done

    # Check environment file
    if [[ ! -f "$ROOT_DIR/.env" ]]; then
        log_error ".env file not found. Copy from .env.example and configure"
        exit 1
    fi

    # Check Docker is running
    if ! docker info &> /dev/null; then
        log_error "Docker is not running"
        exit 1
    fi

    log_success "Prerequisites check passed"
}

check_git_status() {
    log "Checking Git status..."

    cd "$ROOT_DIR"

    # Check for uncommitted changes (production only)
    if [[ "$ENVIRONMENT" == "production" ]]; then
        if [[ -n $(git status --porcelain) ]]; then
            log_error "Uncommitted changes detected. Commit or stash changes before deploying to production"
            exit 1
        fi
    fi

    # Check current branch
    local current_branch=$(git rev-parse --abbrev-ref HEAD)
    log "Current branch: $current_branch"

    if [[ "$ENVIRONMENT" == "production" && "$current_branch" != "main" ]]; then
        log_warning "Not on main branch. Production deployments should be from main"
        confirm "Continue anyway?"
    fi

    log_success "Git status check passed"
}

check_database_connection() {
    log "Checking database connection..."

    # Load environment variables
    source "$ROOT_DIR/.env"

    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &> /dev/null; then
        log_success "Database connection successful"
    else
        log_error "Cannot connect to database"
        exit 1
    fi
}

###############################################################################
# Backup Functions
###############################################################################

backup_database() {
    log "Creating database backup..."

    source "$ROOT_DIR/.env"
    mkdir -p "$BACKUP_DIR"

    local backup_file="$BACKUP_DIR/db-backup-$(date +%Y%m%d-%H%M%S).sql"

    if PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$backup_file"; then
        log_success "Database backup created: $backup_file"

        # Compress backup
        gzip "$backup_file"
        log_success "Backup compressed: $backup_file.gz"

        # Keep only last 10 backups
        cd "$BACKUP_DIR"
        ls -t db-backup-*.sql.gz | tail -n +11 | xargs -r rm
        log "Old backups cleaned up"
    else
        log_error "Database backup failed"
        exit 1
    fi
}

backup_config() {
    log "Backing up configuration..."

    mkdir -p "$BACKUP_DIR/config"
    local config_backup="$BACKUP_DIR/config/config-$(date +%Y%m%d-%H%M%S).tar.gz"

    tar -czf "$config_backup" \
        -C "$ROOT_DIR" \
        .env \
        infrastructure/docker-compose.yml \
        services/trading/data/config.json \
        2>/dev/null || true

    log_success "Configuration backed up: $config_backup"
}

###############################################################################
# Deployment Functions
###############################################################################

build_images() {
    log "Building Docker images..."

    cd "$ROOT_DIR/infrastructure"

    docker-compose build --no-cache

    log_success "Docker images built successfully"
}

run_migrations() {
    log "Running database migrations..."

    cd "$ROOT_DIR"

    # Check if migration is needed
    source .env
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1 FROM positions LIMIT 1" &> /dev/null; then
        log "Database already initialized, skipping migration"
    else
        log "Running initial migration..."
        node infrastructure/database/migrate.js
        log_success "Migration completed"
    fi
}

deploy_containers() {
    log "Deploying containers..."

    cd "$ROOT_DIR/infrastructure"

    # Stop existing containers
    docker-compose down

    # Start new containers
    docker-compose up -d

    log_success "Containers deployed"
}

###############################################################################
# Health Check Functions
###############################################################################

wait_for_service() {
    local service_name="$1"
    local health_url="$2"
    local timeout="$HEALTH_CHECK_TIMEOUT"
    local interval="$HEALTH_CHECK_INTERVAL"

    log "Waiting for $service_name to be healthy..."

    local elapsed=0
    while [[ $elapsed -lt $timeout ]]; do
        if curl -f -s "$health_url" &> /dev/null; then
            log_success "$service_name is healthy"
            return 0
        fi

        sleep "$interval"
        elapsed=$((elapsed + interval))
        echo -n "."
    done

    echo ""
    log_error "$service_name failed to become healthy within ${timeout}s"
    return 1
}

verify_deployment() {
    log "Verifying deployment..."

    # Wait for services to be healthy
    if ! wait_for_service "Trading Bot" "http://localhost:9091/health"; then
        return 1
    fi

    if ! wait_for_service "Prometheus" "http://localhost:9090/-/healthy"; then
        return 1
    fi

    if ! wait_for_service "Grafana" "http://localhost:3030/api/health"; then
        return 1
    fi

    # Check database connectivity
    cd "$ROOT_DIR/infrastructure"
    if docker-compose exec -T postgres pg_isready -U postgres &> /dev/null; then
        log_success "Database is healthy"
    else
        log_error "Database is not healthy"
        return 1
    fi

    # Check Redis connectivity
    if docker-compose exec -T redis redis-cli ping | grep -q PONG; then
        log_success "Redis is healthy"
    else
        log_error "Redis is not healthy"
        return 1
    fi

    log_success "All health checks passed"
    return 0
}

run_smoke_tests() {
    log "Running smoke tests..."

    # Test bot metrics endpoint
    if curl -s http://localhost:9091/metrics | grep -q "trading_bot"; then
        log_success "Bot metrics are being collected"
    else
        log_error "Bot metrics not found"
        return 1
    fi

    # Test database query
    source "$ROOT_DIR/.env"
    if PGPASSWORD="$DB_PASSWORD" psql -h localhost -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM positions" &> /dev/null; then
        log_success "Database queries working"
    else
        log_error "Database queries failing"
        return 1
    fi

    log_success "Smoke tests passed"
    return 0
}

###############################################################################
# Rollback Functions
###############################################################################

rollback() {
    log_error "Deployment failed. Initiating rollback..."

    cd "$ROOT_DIR/infrastructure"

    # Stop failed deployment
    docker-compose down

    # Find latest backup
    local latest_backup=$(ls -t "$BACKUP_DIR"/db-backup-*.sql.gz 2>/dev/null | head -n1)

    if [[ -n "$latest_backup" ]]; then
        log "Restoring database from: $latest_backup"

        gunzip -c "$latest_backup" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME"

        log_success "Database restored"
    fi

    # Restart previous version
    docker-compose up -d

    log_error "Rollback completed. System restored to previous state"
    exit 1
}

###############################################################################
# Main Deployment Flow
###############################################################################

main() {
    log "=========================================="
    log "NexusTradeAI Deployment Script"
    log "=========================================="
    log "Environment: $ENVIRONMENT"
    log "Version: $VERSION"
    log "Timestamp: $(date)"
    log "=========================================="

    # Pre-deployment phase
    check_prerequisites
    check_git_status

    # Confirmation for production
    if [[ "$ENVIRONMENT" == "production" ]]; then
        confirm "Deploy version $VERSION to PRODUCTION?"
    fi

    # Backup phase
    backup_database
    backup_config

    # Build phase
    build_images

    # Database phase
    check_database_connection
    run_migrations

    # Deployment phase
    deploy_containers

    # Verification phase
    if ! verify_deployment; then
        if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
            rollback
        else
            log_error "Deployment verification failed but rollback is disabled"
            exit 1
        fi
    fi

    # Smoke tests
    if ! run_smoke_tests; then
        log_warning "Smoke tests failed but deployment was successful"
    fi

    # Success
    log "=========================================="
    log_success "Deployment completed successfully!"
    log "=========================================="
    log ""
    log "Access your services:"
    log "  - Trading Bot: http://localhost:9091/health"
    log "  - Prometheus: http://localhost:9090"
    log "  - Grafana: http://localhost:3030 (admin/admin)"
    log "  - Metrics: http://localhost:9091/metrics"
    log ""
    log "View logs: docker-compose logs -f"
    log "Deployment log: $LOG_FILE"
    log "=========================================="
}

# Trap errors and run rollback if enabled
if [[ "$ROLLBACK_ON_FAILURE" == "true" ]]; then
    trap rollback ERR
fi

# Run main deployment
main "$@"
