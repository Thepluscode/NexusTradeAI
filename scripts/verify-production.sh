#!/bin/bash
# Production Verification Script — checks all services are actually working
# Run during trading hours to verify trades are executing end-to-end
# Usage: ./scripts/verify-production.sh

set -euo pipefail

STOCK_URL="https://nexus-stock-bot-production.up.railway.app"
FOREX_URL="https://nexus-forex-bot-production.up.railway.app"
CRYPTO_URL="https://nexus-crypto-bot-production.up.railway.app"
BRIDGE_URL="https://nexus-strategy-bridge-production.up.railway.app"
DASH_URL="https://nexus-dashboard-production-e6e6.up.railway.app"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}PASS${NC} $1"; }
fail() { echo -e "  ${RED}FAIL${NC} $1"; FAILURES=$((FAILURES + 1)); }
warn() { echo -e "  ${YELLOW}WARN${NC} $1"; }

FAILURES=0

echo "=========================================="
echo " NexusTradeAI Production Verification"
echo " $(date)"
echo "=========================================="

# 1. Health checks
echo ""
echo "--- Service Health ---"

STOCK_HEALTH=$(curl -sf "$STOCK_URL/health" 2>/dev/null || echo '{"status":"DOWN"}')
FOREX_HEALTH=$(curl -sf "$FOREX_URL/health" 2>/dev/null || echo '{"status":"DOWN"}')
CRYPTO_HEALTH=$(curl -sf "$CRYPTO_URL/health" 2>/dev/null || echo '{"status":"DOWN"}')
BRIDGE_HEALTH=$(curl -sf "$BRIDGE_URL/health" 2>/dev/null || echo '{"status":"DOWN"}')

for svc in "Stock:$STOCK_HEALTH" "Forex:$FOREX_HEALTH" "Crypto:$CRYPTO_HEALTH" "Bridge:$BRIDGE_HEALTH"; do
    name="${svc%%:*}"
    health="${svc#*:}"
    status=$(echo "$health" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','DOWN'))" 2>/dev/null || echo "DOWN")
    if [ "$status" = "ok" ] || [ "$status" = "degraded" ]; then
        pass "$name: $status"
    else
        fail "$name: $status"
    fi
done

# 2. Strategy Bridge — agent stats
echo ""
echo "--- Agent System ---"

STATS=$(curl -sf "$BRIDGE_URL/agent/stats" 2>/dev/null || echo '{}')
EVALS=$(echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('orchestrator',{}).get('total_evaluations',0))" 2>/dev/null || echo "0")
APPROVALS=$(echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('orchestrator',{}).get('total_approvals',0))" 2>/dev/null || echo "0")
OUTCOMES=$(echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('outcome_store',{}).get('total_outcomes_logged',0))" 2>/dev/null || echo "0")
REWARDS=$(echo "$STATS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('outcome_store',{}).get('total_rewards_calculated',0))" 2>/dev/null || echo "0")

echo "  Evaluations: $EVALS | Approvals: $APPROVALS | Outcomes: $OUTCOMES | Rewards: $REWARDS"

if [ "$EVALS" -gt 0 ] 2>/dev/null; then
    pass "Agent evaluations flowing ($EVALS)"
else
    warn "Zero evaluations (may be normal if just restarted)"
fi

if [ "$OUTCOMES" -gt 0 ] 2>/dev/null; then
    pass "Outcome feedback loop working ($OUTCOMES outcomes)"
else
    warn "Zero outcomes logged — feedback loop not yet confirmed"
fi

# 3. Stock bot — trading status
echo ""
echo "--- Stock Bot ---"

STOCK_STATUS=$(curl -sf "$STOCK_URL/api/trading/status" 2>/dev/null || echo '{}')
STOCK_TRADES=$(echo "$STOCK_STATUS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
data = d.get('data', d)
print(data.get('totalTradesToday', data.get('stats',{}).get('totalTradesToday', 0)))
" 2>/dev/null || echo "0")
STOCK_POS=$(echo "$STOCK_STATUS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
data = d.get('data', d)
pos = data.get('positions', data.get('activePositions', []))
print(len(pos) if isinstance(pos, list) else pos)
" 2>/dev/null || echo "0")

echo "  Trades today: $STOCK_TRADES | Positions: $STOCK_POS"

# 4. Crypto bot — trading status
echo ""
echo "--- Crypto Bot ---"

CRYPTO_STATUS=$(curl -sf "$CRYPTO_URL/api/crypto/status" 2>/dev/null || echo '{}')
CRYPTO_TRADES=$(echo "$CRYPTO_STATUS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('tradesToday', d.get('stats',{}).get('tradesToday', 0)))
" 2>/dev/null || echo "0")
CRYPTO_MODE=$(echo "$CRYPTO_STATUS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('mode', d.get('tradingMode', 'UNKNOWN')))
" 2>/dev/null || echo "UNKNOWN")

echo "  Mode: $CRYPTO_MODE | Trades today: $CRYPTO_TRADES"
if [ "$CRYPTO_MODE" = "DEMO" ]; then
    warn "Crypto in DEMO mode — no real trades"
fi

# 5. Forex bot — trading status
echo ""
echo "--- Forex Bot ---"

FOREX_STATUS=$(curl -sf "$FOREX_URL/api/forex/status" 2>/dev/null || echo '{}')
FOREX_TRADES=$(echo "$FOREX_STATUS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
stats = d.get('stats', {})
print(stats.get('totalTrades', 0))
" 2>/dev/null || echo "0")
FOREX_MODE=$(echo "$FOREX_STATUS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(d.get('mode', d.get('tradingMode', 'UNKNOWN')))
" 2>/dev/null || echo "UNKNOWN")

echo "  Mode: $FOREX_MODE | Total trades: $FOREX_TRADES"

# 6. Dashboard
echo ""
echo "--- Dashboard ---"

DASH_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$DASH_URL" 2>/dev/null || echo "000")
if [ "$DASH_STATUS" = "200" ]; then
    pass "Dashboard serving ($DASH_STATUS)"
else
    fail "Dashboard not serving ($DASH_STATUS)"
fi

# 7. Operator observability endpoints
echo ""
echo "--- Operator Status ---"

for entry in "Stock:$STOCK_URL/api/ops/status" "Forex:$FOREX_URL/api/ops/status" "Crypto:$CRYPTO_URL/api/ops/status"; do
    name="${entry%%:*}"
    url="${entry#*:}"
    OPS=$(curl -sf "$url" 2>/dev/null || echo '{}')
    OVERALL=$(echo "$OPS" | python3 -c "
import sys,json
d=json.load(sys.stdin)
data=d.get('data', d)
print(data.get('overall', 'missing'))
" 2>/dev/null || echo "missing")
    if [ "$OVERALL" = "ok" ] || [ "$OVERALL" = "degraded" ]; then
        pass "$name ops status available ($OVERALL)"
    else
        fail "$name ops status missing"
    fi
done

# Summary
echo ""
echo "=========================================="
if [ "$FAILURES" -eq 0 ]; then
    echo -e "${GREEN}All checks passed${NC} ($FAILURES failures)"
else
    echo -e "${RED}$FAILURES check(s) failed${NC}"
fi
echo "=========================================="

exit $FAILURES
