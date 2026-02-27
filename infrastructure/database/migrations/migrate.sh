#!/bin/bash
###############################################################################
# Database Migration Script
# =========================
# Manages database schema evolution
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Load environment
if [[ -f "$ROOT_DIR/.env" ]]; then
    source "$ROOT_DIR/.env"
else
    echo -e "${RED}Error: .env file not found${NC}"
    exit 1
fi

###############################################################################
# Utility Functions
###############################################################################

log() {
    echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $*"
}

log_success() {
    echo -e "${GREEN}✓${NC} $*"
}

log_error() {
    echo -e "${RED}✗${NC} $*"
}

run_sql() {
    local sql="$1"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "$sql"
}

run_sql_file() {
    local file="$1"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$file"
}

###############################################################################
# Migration Functions
###############################################################################

init_migrations_table() {
    log "Initializing migrations table..."

    run_sql "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    "

    log_success "Migrations table ready"
}

get_current_version() {
    local version=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COALESCE(MAX(version), 0) FROM schema_migrations" 2>/dev/null || echo "0")
    echo "$version" | tr -d ' '
}

get_pending_migrations() {
    local current_version=$(get_current_version)

    for file in "$SCRIPT_DIR"/*.sql; do
        if [[ -f "$file" ]]; then
            local filename=$(basename "$file")
            local version=$(echo "$filename" | grep -o '^[0-9]\+')

            if [[ -n "$version" ]] && [[ $version -gt $current_version ]]; then
                echo "$file"
            fi
        fi
    done | sort
}

migrate_up() {
    init_migrations_table

    local pending=$(get_pending_migrations)

    if [[ -z "$pending" ]]; then
        log "No pending migrations"
        return 0
    fi

    log "Applying migrations..."

    while IFS= read -r file; do
        local filename=$(basename "$file")
        local version=$(echo "$filename" | grep -o '^[0-9]\+')
        local name=$(echo "$filename" | sed -E 's/^[0-9]+_(.+)\.sql$/\1/')

        log "Applying: $filename"

        if run_sql_file "$file"; then
            log_success "Applied: $filename"
        else
            log_error "Failed to apply: $filename"
            return 1
        fi
    done <<< "$pending"

    log_success "All migrations applied"
}

migrate_status() {
    init_migrations_table

    local current_version=$(get_current_version)

    log "Current schema version: $current_version"
    echo ""
    echo "Applied migrations:"

    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT
        version,
        name,
        applied_at
    FROM schema_migrations
    ORDER BY version
    "

    echo ""
    log "Pending migrations:"

    local pending=$(get_pending_migrations)
    if [[ -z "$pending" ]]; then
        echo "  None"
    else
        while IFS= read -r file; do
            echo "  $(basename "$file")"
        done <<< "$pending"
    fi
}

###############################################################################
# Main
###############################################################################

case "${1:-}" in
    up)
        migrate_up
        ;;

    status)
        migrate_status
        ;;

    init)
        init_migrations_table
        ;;

    *)
        echo "Database Migration Script"
        echo ""
        echo "Usage: $0 <command>"
        echo ""
        echo "Commands:"
        echo "  up        Apply all pending migrations"
        echo "  status    Show migration status"
        echo "  init      Initialize migrations table"
        echo ""
        exit 1
        ;;
esac
