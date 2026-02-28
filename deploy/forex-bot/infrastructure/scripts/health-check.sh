#!/bin/bash
###############################################################################
# Comprehensive Health Check Script
# ==================================
# Monitors all services and alerts on failures
#
# Usage:
#   ./health-check.sh           # Run all checks
#   ./health-check.sh --watch   # Continuous monitoring
#   ./health-check.sh --json    # JSON output for monitoring tools
###############################################################################

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
WATCH_MODE=false
JSON_OUTPUT=false
WATCH_INTERVAL=10

# Health check endpoints
TRADING_BOT_HEALTH="http://localhost:9091/health"
TRADING_BOT_METRICS="http://localhost:9091/metrics"
PROMETHEUS_HEALTH="http://localhost:9090/-/healthy"
GRAFANA_HEALTH="http://localhost:3030/api/health"

# Thresholds
MAX_MEMORY_PERCENT=90
MAX_CPU_PERCENT=80
MAX_RESPONSE_TIME_MS=1000

# Results
declare -A RESULTS

###############################################################################
# Utility Functions
###############################################################################

log() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${BLUE}[$(date +'%H:%M:%S')]${NC} $*"
    fi
}

log_success() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${GREEN}✓${NC} $*"
    fi
}

log_error() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${RED}✗${NC} $*"
    fi
}

log_warning() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo -e "${YELLOW}⚠${NC} $*"
    fi
}

###############################################################################
# Health Check Functions
###############################################################################

check_docker() {
    local service="docker"
    log "Checking Docker..."

    if docker info &>/dev/null; then
        RESULTS[$service]="healthy"
        log_success "Docker is running"
        return 0
    else
        RESULTS[$service]="unhealthy"
        log_error "Docker is not running"
        return 1
    fi
}

check_docker_compose_services() {
    log "Checking Docker Compose services..."

    cd "$ROOT_DIR/infrastructure"

    local services=("postgres" "redis" "prometheus" "grafana")
    local all_healthy=true

    for service in "${services[@]}"; do
        if docker-compose ps "$service" | grep -q "Up"; then
            RESULTS["docker_$service"]="healthy"
            log_success "$service is running"
        else
            RESULTS["docker_$service"]="unhealthy"
            log_error "$service is not running"
            all_healthy=false
        fi
    done

    if [[ "$all_healthy" == "true" ]]; then
        return 0
    else
        return 1
    fi
}

check_database() {
    log "Checking PostgreSQL..."

    if [[ -f "$ROOT_DIR/.env" ]]; then
        source "$ROOT_DIR/.env"
    else
        RESULTS["database"]="unknown"
        log_warning "Cannot load .env file"
        return 1
    fi

    local start_time=$(date +%s%3N)

    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" &>/dev/null; then
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))

        RESULTS["database"]="healthy"
        RESULTS["database_latency"]="${response_time}ms"

        log_success "Database is healthy (${response_time}ms)"

        if [[ $response_time -gt $MAX_RESPONSE_TIME_MS ]]; then
            log_warning "Database response time is high: ${response_time}ms"
        fi

        return 0
    else
        RESULTS["database"]="unhealthy"
        log_error "Cannot connect to database"
        return 1
    fi
}

check_redis() {
    log "Checking Redis..."

    if docker-compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
        RESULTS["redis"]="healthy"
        log_success "Redis is healthy"
        return 0
    else
        RESULTS["redis"]="unhealthy"
        log_error "Redis is not responding"
        return 1
    fi
}

check_trading_bot() {
    log "Checking Trading Bot..."

    local start_time=$(date +%s%3N)

    if response=$(curl -s -f "$TRADING_BOT_HEALTH" 2>/dev/null); then
        local end_time=$(date +%s%3N)
        local response_time=$((end_time - start_time))

        RESULTS["trading_bot"]="healthy"
        RESULTS["trading_bot_latency"]="${response_time}ms"

        log_success "Trading Bot is healthy (${response_time}ms)"

        # Check memory usage from metrics
        if metrics=$(curl -s "$TRADING_BOT_METRICS" 2>/dev/null); then
            local memory_percent=$(echo "$metrics" | grep "trading_bot_memory_heap_usage_percent" | grep -v "#" | awk '{print $2}')

            if [[ -n "$memory_percent" ]]; then
                RESULTS["memory_usage"]="${memory_percent}%"

                if (( $(echo "$memory_percent > $MAX_MEMORY_PERCENT" | bc -l) )); then
                    log_warning "High memory usage: ${memory_percent}%"
                else
                    log "Memory usage: ${memory_percent}%"
                fi
            fi
        fi

        return 0
    else
        RESULTS["trading_bot"]="unhealthy"
        log_error "Trading Bot is not responding"
        return 1
    fi
}

check_prometheus() {
    log "Checking Prometheus..."

    if curl -s -f "$PROMETHEUS_HEALTH" &>/dev/null; then
        RESULTS["prometheus"]="healthy"
        log_success "Prometheus is healthy"
        return 0
    else
        RESULTS["prometheus"]="unhealthy"
        log_error "Prometheus is not responding"
        return 1
    fi
}

check_grafana() {
    log "Checking Grafana..."

    if response=$(curl -s "$GRAFANA_HEALTH" 2>/dev/null); then
        if echo "$response" | grep -q '"database": "ok"'; then
            RESULTS["grafana"]="healthy"
            log_success "Grafana is healthy"
            return 0
        fi
    fi

    RESULTS["grafana"]="unhealthy"
    log_error "Grafana is not responding"
    return 1
}

check_disk_space() {
    log "Checking disk space..."

    local disk_usage=$(df -h "$ROOT_DIR" | awk 'NR==2 {print $5}' | sed 's/%//')

    RESULTS["disk_usage"]="${disk_usage}%"

    if [[ $disk_usage -gt 90 ]]; then
        log_error "Critical disk usage: ${disk_usage}%"
        return 1
    elif [[ $disk_usage -gt 80 ]]; then
        log_warning "High disk usage: ${disk_usage}%"
        return 0
    else
        log_success "Disk usage: ${disk_usage}%"
        return 0
    fi
}

check_log_files() {
    log "Checking log files..."

    local log_dir="$ROOT_DIR/logs"
    if [[ -d "$log_dir" ]]; then
        local log_size=$(du -sh "$log_dir" | cut -f1)
        RESULTS["log_size"]="$log_size"
        log "Log directory size: $log_size"

        # Check for large log files
        local large_logs=$(find "$log_dir" -type f -size +100M)
        if [[ -n "$large_logs" ]]; then
            log_warning "Found large log files (>100MB)"
            while IFS= read -r file; do
                local size=$(du -h "$file" | cut -f1)
                log_warning "  $(basename "$file"): $size"
            done <<< "$large_logs"
        fi
    fi
}

check_system_resources() {
    log "Checking system resources..."

    # CPU usage
    if command -v top &>/dev/null; then
        local cpu_usage=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
        RESULTS["cpu_usage"]="${cpu_usage}%"

        if (( $(echo "$cpu_usage > $MAX_CPU_PERCENT" | bc -l) )); then
            log_warning "High CPU usage: ${cpu_usage}%"
        else
            log "CPU usage: ${cpu_usage}%"
        fi
    fi

    # Memory usage
    if command -v vm_stat &>/dev/null; then
        local mem_total=$(sysctl -n hw.memsize)
        local mem_active=$(vm_stat | grep "Pages active" | awk '{print $3}' | sed 's/\.//')
        local page_size=4096
        local mem_used=$((mem_active * page_size))
        local mem_percent=$(( (mem_used * 100) / mem_total ))

        RESULTS["system_memory"]="${mem_percent}%"
        log "System memory usage: ${mem_percent}%"
    fi
}

###############################################################################
# Reporting Functions
###############################################################################

print_summary() {
    if [[ "$JSON_OUTPUT" == "false" ]]; then
        echo ""
        echo "=========================================="
        echo "Health Check Summary"
        echo "=========================================="

        local total_checks=0
        local healthy_checks=0

        for key in "${!RESULTS[@]}"; do
            if [[ "${RESULTS[$key]}" == "healthy" ]]; then
                echo -e "${GREEN}✓${NC} $key: ${RESULTS[$key]}"
                ((healthy_checks++))
                ((total_checks++))
            elif [[ "${RESULTS[$key]}" == "unhealthy" ]]; then
                echo -e "${RED}✗${NC} $key: ${RESULTS[$key]}"
                ((total_checks++))
            else
                echo -e "${BLUE}ℹ${NC} $key: ${RESULTS[$key]}"
            fi
        done

        echo "=========================================="
        echo "Status: $healthy_checks/$total_checks services healthy"
        echo "Timestamp: $(date)"
        echo "=========================================="
    else
        # JSON output
        echo "{"
        echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
        echo "  \"status\": {"

        local first=true
        for key in "${!RESULTS[@]}"; do
            if [[ "$first" == "false" ]]; then
                echo ","
            fi
            echo -n "    \"$key\": \"${RESULTS[$key]}\""
            first=false
        done

        echo ""
        echo "  }"
        echo "}"
    fi
}

###############################################################################
# Main
###############################################################################

run_all_checks() {
    # Clear results
    RESULTS=()

    # Run all checks
    check_docker
    check_docker_compose_services
    check_database
    check_redis
    check_trading_bot
    check_prometheus
    check_grafana
    check_disk_space
    check_log_files
    check_system_resources

    # Print summary
    print_summary

    # Return overall status
    for value in "${RESULTS[@]}"; do
        if [[ "$value" == "unhealthy" ]]; then
            return 1
        fi
    done

    return 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --watch)
            WATCH_MODE=true
            shift
            ;;
        --json)
            JSON_OUTPUT=true
            shift
            ;;
        --interval)
            WATCH_INTERVAL="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--watch] [--json] [--interval SECONDS]"
            exit 1
            ;;
    esac
done

# Main execution
if [[ "$WATCH_MODE" == "true" ]]; then
    log "Starting continuous health monitoring (interval: ${WATCH_INTERVAL}s)"
    log "Press Ctrl+C to stop"
    echo ""

    while true; do
        run_all_checks
        sleep "$WATCH_INTERVAL"
        clear
    done
else
    run_all_checks
fi
