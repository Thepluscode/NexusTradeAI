#!/bin/bash
###############################################################################
# Production Monitoring Setup Script
# ===================================
# Configures and validates production monitoring infrastructure
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
MONITORING_DIR="$ROOT_DIR/infrastructure/monitoring"

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

CHECKS_PASSED=0
CHECKS_FAILED=0

###############################################################################
# Check Prerequisites
###############################################################################

check_prerequisites() {
    log "Checking prerequisites..."

    local required_commands=("docker" "docker-compose" "curl" "jq")
    local missing=()

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing required commands: ${missing[*]}"
        exit 1
    fi

    log_success "Prerequisites met"
}

###############################################################################
# Validate Configuration Files
###############################################################################

validate_prometheus_config() {
    log "Validating Prometheus configuration..."

    if [ ! -f "$MONITORING_DIR/prometheus.yml" ]; then
        log_error "Prometheus config not found: prometheus.yml"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Validate YAML syntax
    docker run --rm -v "$MONITORING_DIR:/config" prom/prometheus:latest \
        promtool check config /config/prometheus.yml > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        log_success "Prometheus config valid"
        ((CHECKS_PASSED++))
    else
        log_error "Prometheus config invalid"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Check scrape targets configured
    local targets=$(grep -c "static_configs:" "$MONITORING_DIR/prometheus.yml" || true)
    if [ $targets -lt 1 ]; then
        log_warning "No scrape targets configured"
        ((CHECKS_FAILED++))
    else
        log_success "Found $targets scrape target(s)"
        ((CHECKS_PASSED++))
    fi
}

validate_alert_rules() {
    log "Validating alert rules..."

    if [ ! -f "$MONITORING_DIR/alerts.yml" ]; then
        log_error "Alert rules not found: alerts.yml"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Validate alert rules syntax
    docker run --rm -v "$MONITORING_DIR:/config" prom/prometheus:latest \
        promtool check rules /config/alerts.yml > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        log_success "Alert rules valid"
        ((CHECKS_PASSED++))
    else
        log_error "Alert rules invalid"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Count alert rules
    local rules=$(grep -c "^  - alert:" "$MONITORING_DIR/alerts.yml" || true)
    log "Found $rules alert rule(s)"

    if [ $rules -lt 10 ]; then
        log_warning "Less than 10 alert rules configured"
    else
        log_success "$rules alert rules configured"
        ((CHECKS_PASSED++))
    fi
}

validate_alertmanager_config() {
    log "Validating Alertmanager configuration..."

    if [ ! -f "$MONITORING_DIR/alertmanager.yml" ]; then
        log_error "Alertmanager config not found: alertmanager.yml"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Validate YAML syntax (basic check)
    docker run --rm -v "$MONITORING_DIR:/config" prom/alertmanager:latest \
        amtool check-config /config/alertmanager.yml > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        log_success "Alertmanager config valid"
        ((CHECKS_PASSED++))
    else
        log_error "Alertmanager config invalid"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Check receivers configured
    local receivers=$(grep -c "^  - name:" "$MONITORING_DIR/alertmanager.yml" || true)
    if [ $receivers -lt 2 ]; then
        log_warning "Less than 2 receivers configured"
        ((CHECKS_FAILED++))
    else
        log_success "Found $receivers receiver(s)"
        ((CHECKS_PASSED++))
    fi

    # Check SMTP configuration
    if grep -q "smtp_smarthost:" "$MONITORING_DIR/alertmanager.yml"; then
        log_success "SMTP configured"
        ((CHECKS_PASSED++))
    else
        log_warning "SMTP not configured - email alerts will not work"
        ((CHECKS_FAILED++))
    fi

    # Check Slack configuration
    if grep -q "slack_api_url:" "$MONITORING_DIR/alertmanager.yml"; then
        log_success "Slack configured"
        ((CHECKS_PASSED++))
    else
        log_warning "Slack not configured"
    fi
}

validate_grafana_dashboards() {
    log "Validating Grafana dashboards..."

    local dashboard_dir="$MONITORING_DIR/grafana/dashboards"

    if [ ! -d "$dashboard_dir" ]; then
        log_error "Dashboard directory not found"
        ((CHECKS_FAILED++))
        return 1
    fi

    local dashboard_count=$(find "$dashboard_dir" -name "*.json" | wc -l)

    if [ $dashboard_count -lt 4 ]; then
        log_warning "Less than 4 dashboards found"
        ((CHECKS_FAILED++))
    else
        log_success "Found $dashboard_count dashboard(s)"
        ((CHECKS_PASSED++))
    fi

    # Validate JSON syntax
    for dashboard in "$dashboard_dir"/*.json; do
        if jq empty "$dashboard" 2>/dev/null; then
            log_success "$(basename $dashboard) - valid JSON"
            ((CHECKS_PASSED++))
        else
            log_error "$(basename $dashboard) - invalid JSON"
            ((CHECKS_FAILED++))
        fi
    done
}

###############################################################################
# Validate Environment Variables
###############################################################################

validate_environment() {
    log "Validating environment variables..."

    local required_vars=(
        "SMTP_HOST"
        "SMTP_PORT"
        "SMTP_USER"
        "SMTP_PASSWORD"
        "SMTP_FROM"
        "ALERT_EMAIL_TO"
    )

    local env_file="$ROOT_DIR/.env.production"

    if [ ! -f "$env_file" ]; then
        log_error ".env.production not found"
        ((CHECKS_FAILED++))
        return 1
    fi

    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if ! grep -q "^$var=" "$env_file"; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        log_warning "Missing environment variables: ${missing_vars[*]}"
        ((CHECKS_FAILED++))
    else
        log_success "All required environment variables configured"
        ((CHECKS_PASSED++))
    fi

    # Check optional but recommended
    if grep -q "^SLACK_WEBHOOK_URL=" "$env_file"; then
        log_success "Slack webhook configured"
        ((CHECKS_PASSED++))
    else
        log_warning "Slack webhook not configured (optional)"
    fi

    if grep -q "^PAGERDUTY_INTEGRATION_KEY=" "$env_file"; then
        log_success "PagerDuty configured"
        ((CHECKS_PASSED++))
    else
        log_warning "PagerDuty not configured (optional)"
    fi
}

###############################################################################
# Test Services
###############################################################################

test_prometheus() {
    log "Testing Prometheus..."

    local prometheus_url="${PROMETHEUS_URL:-http://localhost:9090}"

    # Check if Prometheus is running
    if curl -sf "$prometheus_url/-/healthy" > /dev/null 2>&1; then
        log_success "Prometheus is healthy"
        ((CHECKS_PASSED++))
    else
        log_error "Prometheus is not responding"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Check targets
    local targets=$(curl -s "$prometheus_url/api/v1/targets" | jq '.data.activeTargets | length')
    if [ "$targets" -gt 0 ]; then
        log_success "Prometheus has $targets active target(s)"
        ((CHECKS_PASSED++))
    else
        log_error "No active targets"
        ((CHECKS_FAILED++))
    fi

    # Check rules loaded
    local rules=$(curl -s "$prometheus_url/api/v1/rules" | jq '.data.groups[].rules | length' | paste -sd+ | bc || echo 0)
    if [ "$rules" -gt 0 ]; then
        log_success "Loaded $rules alert rule(s)"
        ((CHECKS_PASSED++))
    else
        log_warning "No alert rules loaded"
        ((CHECKS_FAILED++))
    fi
}

test_alertmanager() {
    log "Testing Alertmanager..."

    local alertmanager_url="${ALERTMANAGER_URL:-http://localhost:9093}"

    # Check if Alertmanager is running
    if curl -sf "$alertmanager_url/-/healthy" > /dev/null 2>&1; then
        log_success "Alertmanager is healthy"
        ((CHECKS_PASSED++))
    else
        log_error "Alertmanager is not responding"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Check configuration
    local config=$(curl -s "$alertmanager_url/api/v1/status" | jq '.data.configYAML')
    if [ -n "$config" ] && [ "$config" != "null" ]; then
        log_success "Alertmanager configuration loaded"
        ((CHECKS_PASSED++))
    else
        log_error "Alertmanager configuration not loaded"
        ((CHECKS_FAILED++))
    fi

    # Check routes
    local routes=$(curl -s "$alertmanager_url/api/v1/status" | jq '.data.config.route.routes | length' || echo 0)
    if [ "$routes" -gt 0 ]; then
        log_success "Found $routes routing rule(s)"
        ((CHECKS_PASSED++))
    else
        log_warning "No custom routing rules configured"
    fi
}

test_grafana() {
    log "Testing Grafana..."

    local grafana_url="${GRAFANA_URL:-http://localhost:3030}"

    # Check if Grafana is running
    if curl -sf "$grafana_url/api/health" > /dev/null 2>&1; then
        log_success "Grafana is healthy"
        ((CHECKS_PASSED++))
    else
        log_error "Grafana is not responding"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Note: Cannot check dashboards without authentication
    log_warning "Dashboard validation requires manual check"
}

test_trading_bot_metrics() {
    log "Testing trading bot metrics..."

    local bot_url="${BOT_METRICS_URL:-http://localhost:9091}"

    # Check if metrics endpoint is accessible
    if curl -sf "$bot_url/metrics" > /dev/null 2>&1; then
        log_success "Trading bot metrics endpoint accessible"
        ((CHECKS_PASSED++))
    else
        log_error "Trading bot metrics not accessible"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Check for required metrics
    local metrics=$(curl -s "$bot_url/metrics")

    local required_metrics=(
        "trading_bot_active_positions"
        "trading_bot_pnl_total_usd"
        "trading_bot_memory_heap_usage_percent"
        "trading_bot_api_health"
    )

    for metric in "${required_metrics[@]}"; do
        if echo "$metrics" | grep -q "^$metric"; then
            log_success "Metric found: $metric"
            ((CHECKS_PASSED++))
        else
            log_warning "Metric missing: $metric"
            ((CHECKS_FAILED++))
        fi
    done
}

###############################################################################
# Test Alert Flow
###############################################################################

test_alert_end_to_end() {
    log "Testing end-to-end alert flow..."

    local prometheus_url="${PROMETHEUS_URL:-http://localhost:9090}"
    local alertmanager_url="${ALERTMANAGER_URL:-http://localhost:9093}"

    # Step 1: Check metric exists
    if ! curl -s "http://localhost:9091/metrics" | grep -q "trading_bot_memory_heap_usage_percent"; then
        log_error "Required metric not found"
        ((CHECKS_FAILED++))
        return 1
    fi
    log_success "Step 1: Metric exists"

    # Step 2: Check Prometheus is scraping
    local scraping=$(curl -s "$prometheus_url/api/v1/targets" | jq '.data.activeTargets[] | select(.labels.job=="trading-bot") | .health' | tr -d '"')
    if [ "$scraping" == "up" ]; then
        log_success "Step 2: Prometheus scraping bot metrics"
        ((CHECKS_PASSED++))
    else
        log_error "Step 2: Prometheus not scraping bot metrics"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Step 3: Check alert rules exist
    if curl -s "$prometheus_url/api/v1/rules" | jq -e '.data.groups[].rules[] | select(.name == "HighMemoryUsage")' > /dev/null; then
        log_success "Step 3: Alert rule configured"
        ((CHECKS_PASSED++))
    else
        log_error "Step 3: Alert rule not found"
        ((CHECKS_FAILED++))
        return 1
    fi

    # Step 4: Check Alertmanager connected
    local alertmanagers=$(curl -s "$prometheus_url/api/v1/alertmanagers" | jq '.data.activeAlertmanagers | length')
    if [ "$alertmanagers" -gt 0 ]; then
        log_success "Step 4: Alertmanager connected to Prometheus"
        ((CHECKS_PASSED++))
    else
        log_error "Step 4: Alertmanager not connected"
        ((CHECKS_FAILED++))
        return 1
    fi

    log_success "End-to-end alert flow validated"
}

###############################################################################
# Generate Report
###############################################################################

generate_report() {
    echo ""
    echo "=========================================="
    echo "Production Monitoring Setup Report"
    echo "=========================================="
    echo "Date: $(date)"
    echo "Hostname: $(hostname)"
    echo ""
    echo "Configuration Files:"
    echo "  - Prometheus: $MONITORING_DIR/prometheus.yml"
    echo "  - Alert Rules: $MONITORING_DIR/alerts.yml"
    echo "  - Alertmanager: $MONITORING_DIR/alertmanager.yml"
    echo "  - Dashboards: $MONITORING_DIR/grafana/dashboards/"
    echo ""
    echo "Services:"
    echo "  - Prometheus: ${PROMETHEUS_URL:-http://localhost:9090}"
    echo "  - Alertmanager: ${ALERTMANAGER_URL:-http://localhost:9093}"
    echo "  - Grafana: ${GRAFANA_URL:-http://localhost:3030}"
    echo "  - Trading Bot Metrics: ${BOT_METRICS_URL:-http://localhost:9091}"
    echo ""
    echo "=========================================="
    echo "Test Results"
    echo "=========================================="
    echo "  Passed:  $CHECKS_PASSED"
    echo "  Failed:  $CHECKS_FAILED"
    echo "  Total:   $((CHECKS_PASSED + CHECKS_FAILED))"
    echo ""

    if [ $CHECKS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All checks passed!${NC}"
        echo "Production monitoring is ready for deployment."
        echo ""
        echo "Next Steps:"
        echo "  1. Update .env.production with SMTP credentials"
        echo "  2. Test email notifications: $SCRIPT_DIR/test-notifications.sh email"
        echo "  3. Test Slack notifications: $SCRIPT_DIR/test-notifications.sh slack"
        echo "  4. Deploy to production: docker-compose -f docker-compose.prod.yml up -d"
        return 0
    else
        echo -e "${RED}✗ $CHECKS_FAILED check(s) failed${NC}"
        echo "Please review and fix the issues above before deployment."
        return 1
    fi
}

###############################################################################
# Main
###############################################################################

main() {
    log "=========================================="
    log "Production Monitoring Setup Validation"
    log "=========================================="
    echo ""

    check_prerequisites

    echo ""
    log "Configuration Validation"
    log "------------------------"
    validate_prometheus_config
    validate_alert_rules
    validate_alertmanager_config
    validate_grafana_dashboards
    validate_environment

    echo ""
    log "Service Testing"
    log "---------------"
    test_prometheus
    test_alertmanager
    test_grafana
    test_trading_bot_metrics

    echo ""
    log "Integration Testing"
    log "-------------------"
    test_alert_end_to_end

    echo ""
    generate_report
}

main "$@"
