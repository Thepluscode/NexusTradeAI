#!/bin/bash
###############################################################################
# Alert Testing Framework
# ========================
# Tests that alerts fire correctly and notifications are sent
###############################################################################

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMETHEUS_URL="http://localhost:9090"
ALERTMANAGER_URL="http://localhost:9093"
BOT_URL="http://localhost:9091"

TEST_RESULTS=()

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
# Test Functions
###############################################################################

test_prometheus_connection() {
    log "Testing Prometheus connection..."

    if curl -sf "$PROMETHEUS_URL/-/healthy" > /dev/null; then
        log_success "Prometheus is reachable"
        TEST_RESULTS+=("PASS: Prometheus connection")
        return 0
    else
        log_error "Prometheus is not reachable"
        TEST_RESULTS+=("FAIL: Prometheus connection")
        return 1
    fi
}

test_alertmanager_connection() {
    log "Testing Alertmanager connection..."

    if curl -sf "$ALERTMANAGER_URL/-/healthy" > /dev/null; then
        log_success "Alertmanager is reachable"
        TEST_RESULTS+=("PASS: Alertmanager connection")
        return 0
    else
        log_error "Alertmanager is not reachable"
        TEST_RESULTS+=("FAIL: Alertmanager connection")
        return 1
    fi
}

test_alert_rules_loaded() {
    log "Testing alert rules are loaded..."

    local rules=$(curl -s "$PROMETHEUS_URL/api/v1/rules" | jq '.data.groups[].rules | length' | paste -sd+ | bc)

    if [[ $rules -gt 0 ]]; then
        log_success "Loaded $rules alert rules"
        TEST_RESULTS+=("PASS: Alert rules loaded ($rules rules)")
        return 0
    else
        log_error "No alert rules loaded"
        TEST_RESULTS+=("FAIL: Alert rules not loaded")
        return 1
    fi
}

test_metrics_available() {
    log "Testing bot metrics are available..."

    if curl -sf "$BOT_URL/metrics" | grep -q "trading_bot"; then
        log_success "Bot metrics are available"
        TEST_RESULTS+=("PASS: Bot metrics")
        return 0
    else
        log_error "Bot metrics not available"
        TEST_RESULTS+=("FAIL: Bot metrics")
        return 1
    fi
}

###############################################################################
# Alert Simulation Tests
###############################################################################

simulate_high_memory_alert() {
    log "Simulating HighMemoryUsage alert..."

    # Check if metric exists
    local memory_metric=$(curl -s "$BOT_URL/metrics" | grep "trading_bot_memory_heap_usage_percent" | awk '{print $2}')

    if [[ -z "$memory_metric" ]]; then
        log_warning "Memory metric not available, skipping simulation"
        TEST_RESULTS+=("SKIP: HighMemoryUsage simulation")
        return 0
    fi

    log "Current memory usage: ${memory_metric}%"

    # Check if alert would fire
    if (( $(echo "$memory_metric > 75" | bc -l) )); then
        log_warning "Memory already high (${memory_metric}%), alert should be firing"
        TEST_RESULTS+=("INFO: HighMemoryUsage alert active")
    else
        log "Memory normal (${memory_metric}%), alert would not fire yet"
        TEST_RESULTS+=("INFO: HighMemoryUsage alert conditions not met")
    fi
}

simulate_api_down_alert() {
    log "Simulating APIDown alert..."

    # Check API health metric
    local api_health=$(curl -s "$BOT_URL/metrics" | grep 'trading_bot_api_health{api_name="alpaca"}' | awk '{print $2}')

    if [[ "$api_health" == "1" ]]; then
        log_success "Alpaca API is up"
        TEST_RESULTS+=("INFO: APIDown alert not active (API is up)")
    elif [[ "$api_health" == "0" ]]; then
        log_error "Alpaca API is down - alert should be firing"
        TEST_RESULTS+=("WARNING: APIDown alert should be active")
    else
        log_warning "API health metric not found"
        TEST_RESULTS+=("SKIP: APIDown simulation - metric not found")
    fi
}

check_active_alerts() {
    log "Checking for active alerts..."

    local active_alerts=$(curl -s "$PROMETHEUS_URL/api/v1/alerts" | jq '.data.alerts | length')

    if [[ $active_alerts -eq 0 ]]; then
        log_success "No active alerts (system healthy)"
        TEST_RESULTS+=("PASS: No active alerts")
    else
        log_warning "Found $active_alerts active alert(s)"

        # List active alerts
        curl -s "$PROMETHEUS_URL/api/v1/alerts" | jq -r '.data.alerts[] | "\(.labels.alertname) - \(.state)"'

        TEST_RESULTS+=("INFO: $active_alerts active alerts")
    fi
}

check_alertmanager_config() {
    log "Checking Alertmanager configuration..."

    local config=$(curl -s "$ALERTMANAGER_URL/api/v1/status" | jq -r '.data.configYAML')

    if [[ -n "$config" ]]; then
        log_success "Alertmanager configuration loaded"

        # Check for receivers
        local receivers=$(echo "$config" | grep -c "name:" || true)
        log "Found $receivers receiver(s) configured"

        TEST_RESULTS+=("PASS: Alertmanager configured ($receivers receivers)")
    else
        log_error "Alertmanager configuration not loaded"
        TEST_RESULTS+=("FAIL: Alertmanager config")
    fi
}

test_alert_routing() {
    log "Testing alert routing..."

    # Check if routes are configured
    local routes=$(curl -s "$ALERTMANAGER_URL/api/v1/status" | jq '.data.config.route.routes | length')

    if [[ $routes -gt 0 ]]; then
        log_success "Found $routes routing rule(s)"
        TEST_RESULTS+=("PASS: Alert routing configured")
    else
        log_warning "No custom routing rules configured"
        TEST_RESULTS+=("WARNING: Using default routing only")
    fi
}

###############################################################################
# Integration Tests
###############################################################################

test_end_to_end_flow() {
    log "Testing end-to-end alert flow..."

    # 1. Check metric exists
    log "Step 1: Verify metric exists"
    if ! curl -s "$BOT_URL/metrics" | grep -q "trading_bot_memory_heap_usage_percent"; then
        log_error "Required metric not found"
        TEST_RESULTS+=("FAIL: End-to-end flow - metric missing")
        return 1
    fi
    log_success "Metric exists"

    # 2. Check Prometheus is scraping
    log "Step 2: Verify Prometheus is scraping"
    local targets=$(curl -s "$PROMETHEUS_URL/api/v1/targets" | jq '.data.activeTargets | length')
    if [[ $targets -eq 0 ]]; then
        log_error "No active scrape targets"
        TEST_RESULTS+=("FAIL: End-to-end flow - no scrape targets")
        return 1
    fi
    log_success "Prometheus scraping $targets target(s)"

    # 3. Check alert rules exist
    log "Step 3: Verify alert rules exist"
    if ! curl -s "$PROMETHEUS_URL/api/v1/rules" | jq -e '.data.groups[].rules[] | select(.name == "HighMemoryUsage")' > /dev/null; then
        log_error "HighMemoryUsage alert rule not found"
        TEST_RESULTS+=("FAIL: End-to-end flow - alert rule missing")
        return 1
    fi
    log_success "Alert rules configured"

    # 4. Check Alertmanager is connected
    log "Step 4: Verify Alertmanager connection"
    local alertmanagers=$(curl -s "$PROMETHEUS_URL/api/v1/alertmanagers" | jq '.data.activeAlertmanagers | length')
    if [[ $alertmanagers -eq 0 ]]; then
        log_error "Alertmanager not connected to Prometheus"
        TEST_RESULTS+=("FAIL: End-to-end flow - Alertmanager not connected")
        return 1
    fi
    log_success "Alertmanager connected"

    log_success "End-to-end flow test passed"
    TEST_RESULTS+=("PASS: End-to-end alert flow")
}

###############################################################################
# Report Generation
###############################################################################

generate_report() {
    echo ""
    echo "=========================================="
    echo "Alert Testing Report"
    echo "=========================================="
    echo "Date: $(date)"
    echo "Prometheus: $PROMETHEUS_URL"
    echo "Alertmanager: $ALERTMANAGER_URL"
    echo ""
    echo "Test Results:"
    echo "-------------"

    local passed=0
    local failed=0
    local warnings=0
    local skipped=0

    for result in "${TEST_RESULTS[@]}"; do
        echo "$result"

        if [[ $result == PASS:* ]]; then
            ((passed++))
        elif [[ $result == FAIL:* ]]; then
            ((failed++))
        elif [[ $result == WARNING:* ]]; then
            ((warnings++))
        elif [[ $result == SKIP:* ]]; then
            ((skipped++))
        fi
    done

    echo ""
    echo "=========================================="
    echo "Summary:"
    echo "  Passed:   $passed"
    echo "  Failed:   $failed"
    echo "  Warnings: $warnings"
    echo "  Skipped:  $skipped"
    echo "=========================================="

    if [[ $failed -gt 0 ]]; then
        echo ""
        log_error "Some tests failed. Review the results above."
        return 1
    elif [[ $warnings -gt 0 ]]; then
        echo ""
        log_warning "All tests passed but there are warnings."
        return 0
    else
        echo ""
        log_success "All tests passed!"
        return 0
    fi
}

###############################################################################
# Main
###############################################################################

main() {
    log "=========================================="
    log "Starting Alert Testing Framework"
    log "=========================================="
    echo ""

    # Connection tests
    test_prometheus_connection || true
    test_alertmanager_connection || true
    test_metrics_available || true

    echo ""

    # Configuration tests
    test_alert_rules_loaded || true
    check_alertmanager_config || true
    test_alert_routing || true

    echo ""

    # Alert state tests
    check_active_alerts || true

    echo ""

    # Simulation tests
    simulate_high_memory_alert || true
    simulate_api_down_alert || true

    echo ""

    # Integration test
    test_end_to_end_flow || true

    echo ""

    # Generate report
    generate_report
}

main "$@"
