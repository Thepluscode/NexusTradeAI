# 📡 NexusTradeAI - API Reference

Complete reference for all API endpoints provided by the unified trading bot.

---

## Base URL

```
http://localhost:3001
```

**Protocol:** HTTP
**Port:** 3001
**Content-Type:** application/json

---

## Table of Contents

1. [Health Check](#health-check)
2. [Trading Status](#trading-status)
3. [Account Summary](#account-summary)
4. [Market Data Status](#market-data-status)
5. [Error Handling](#error-handling)
6. [Rate Limits](#rate-limits)
7. [Examples](#examples)

---

## Health Check

### GET /health

Check if the bot API is running and responsive.

#### Request

```http
GET /health HTTP/1.1
Host: localhost:3001
```

```bash
curl http://localhost:3001/health
```

#### Response

**Success (200 OK):**
```json
{
  "status": "ok",
  "bot": "unified-trading-bot"
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | Always "ok" if API is running |
| `bot` | string | Bot identifier |

#### Use Cases

- **Monitoring:** Check if bot is alive
- **Deployment:** Verify bot started successfully
- **Load Balancer:** Health check endpoint

#### Example Usage

**Shell Script:**
```bash
#!/bin/bash
if curl -s http://localhost:3001/health | grep -q "ok"; then
    echo "✅ Bot is running"
else
    echo "❌ Bot is down"
fi
```

**Python:**
```python
import requests

response = requests.get('http://localhost:3001/health')
if response.json()['status'] == 'ok':
    print('✅ Bot is running')
```

---

## Trading Status

### GET /api/trading/status

Get all active positions and performance metrics.

#### Request

```http
GET /api/trading/status HTTP/1.1
Host: localhost:3001
```

```bash
curl -s http://localhost:3001/api/trading/status | python3 -m json.tool
```

#### Response

**Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "isRunning": true,
    "positions": [
      {
        "id": "b0b6dd9d-8b9b-48a9-ba46-b9d54906e415",
        "symbol": "LOW",
        "side": "long",
        "direction": "long",
        "quantity": 3,
        "size": 3,
        "entryPrice": 233.44,
        "entry": 233.44,
        "currentPrice": 248.47,
        "current": 248.47,
        "unrealizedPnL": 45.09,
        "unrealizedPLPercent": 6.44,
        "realizedPnL": 0,
        "pnl": 45.09,
        "profit": 45.09,
        "strategy": "unified",
        "openTime": 1733493600000,
        "confidence": 85,
        "qty": 3,
        "avgEntry": 233.44,
        "marketValue": 745.41
      }
    ],
    "performance": {
      "activePositions": 7,
      "totalTrades": 4,
      "winRate": 71.43,
      "profitFactor": 2.5,
      "totalPnL": 68.72,
      "dailyPnL": -1209.59
    }
  }
}
```

**Error (500 Internal Server Error):**
```json
{
  "success": false,
  "error": "Unable to fetch positions from Alpaca"
}
```

#### Response Fields

##### Root Object

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | true if request succeeded |
| `data` | object | Container for response data |

##### Data Object

| Field | Type | Description |
|-------|------|-------------|
| `isRunning` | boolean | Bot trading status (always true if responding) |
| `positions` | array | Array of position objects |
| `performance` | object | Performance metrics |

##### Position Object

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Alpaca asset ID | "b0b6dd9d-..." |
| `symbol` | string | Stock ticker | "AAPL" |
| `side` | string | Position direction | "long" or "short" |
| `direction` | string | Same as side | "long" or "short" |
| `quantity` | number | Number of shares | 100 |
| `size` | number | Same as quantity | 100 |
| `entryPrice` | number | Average entry price | 150.50 |
| `entry` | number | Same as entryPrice | 150.50 |
| `currentPrice` | number | Current market price | 165.25 |
| `current` | number | Same as currentPrice | 165.25 |
| `unrealizedPnL` | number | Unrealized P&L in dollars | 1475.00 |
| `unrealizedPLPercent` | number | Unrealized P&L percentage | 9.80 |
| `realizedPnL` | number | Realized P&L (always 0 for open positions) | 0 |
| `pnl` | number | Same as unrealizedPnL | 1475.00 |
| `profit` | number | Same as unrealizedPnL | 1475.00 |
| `strategy` | string | Entry strategy | "unified" |
| `openTime` | number | Unix timestamp (ms) | 1733493600000 |
| `confidence` | number | AI confidence score | 85 |
| `qty` | number | Same as quantity | 100 |
| `avgEntry` | number | Same as entryPrice | 150.50 |
| `marketValue` | number | Current position value | 16525.00 |

##### Performance Object

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `activePositions` | number | Count of open positions | 7 |
| `totalTrades` | number | Total trades today | 4 |
| `winRate` | number | Win rate percentage | 71.43 |
| `profitFactor` | number | Gross profit / Gross loss | 2.5 |
| `totalPnL` | number | Total unrealized P&L | 68.72 |
| `dailyPnL` | number | Today's P&L | -1209.59 |

#### Use Cases

- **Dashboard Display:** Show all open positions
- **Monitoring:** Track performance metrics
- **Alerts:** Trigger notifications on large P&L changes
- **Analytics:** Calculate portfolio statistics

#### Example Usage

**Get Position Count:**
```bash
curl -s http://localhost:3001/api/trading/status | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
print(f'Active Positions: {data[\"performance\"][\"activePositions\"]}')
"
```

**List All Positions:**
```bash
curl -s http://localhost:3001/api/trading/status | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
for p in data['positions']:
    print(f'{p[\"symbol\"]}: {p[\"unrealizedPLPercent\"]:+.2f}%')
"
```

**Check Win Rate:**
```bash
curl -s http://localhost:3001/api/trading/status | python3 -c "
import sys, json
data = json.load(sys.stdin)['data']
print(f'Win Rate: {data[\"performance\"][\"winRate\"]}%')
"
```

---

## Account Summary

### GET /api/accounts/summary

Get account balance, equity, and P&L information.

#### Request

```http
GET /api/accounts/summary HTTP/1.1
Host: localhost:3001
```

```bash
curl -s http://localhost:3001/api/accounts/summary | python3 -m json.tool
```

#### Response

**Success (200 OK):**
```json
{
  "success": true,
  "data": {
    "accountType": "paper",
    "realAccount": {
      "balance": 93150.94,
      "equity": 98854.45,
      "pnl": -1145.55,
      "pnlPercent": -1.15,
      "linkedBanks": []
    },
    "demoAccount": {
      "balance": 93150.94,
      "equity": 98854.45,
      "pnl": -1209.59,
      "pnlPercent": -1.21,
      "canReset": true
    },
    "equity": 98854.45,
    "cash": 93150.94,
    "buyingPower": 193454.43,
    "profitToday": -1209.59,
    "profitTodayPercent": -1.21,
    "totalProfit": -1145.55,
    "totalProfitPercent": -1.15
  }
}
```

**Error (500 Internal Server Error):**
```json
{
  "success": false,
  "error": "Unable to fetch account data from Alpaca"
}
```

#### Response Fields

##### Data Object

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `accountType` | string | Account type | "paper" or "live" |
| `realAccount` | object | Real account details (if applicable) | See below |
| `demoAccount` | object | Demo/paper account details | See below |
| `equity` | number | Total account value (cash + positions) | 98854.45 |
| `cash` | number | Available cash | 93150.94 |
| `buyingPower` | number | Total buying power (2x for margin) | 193454.43 |
| `profitToday` | number | Today's P&L in dollars | -1209.59 |
| `profitTodayPercent` | number | Today's P&L percentage | -1.21 |
| `totalProfit` | number | All-time P&L from $100k start | -1145.55 |
| `totalProfitPercent` | number | All-time P&L percentage | -1.15 |

##### Real Account Object

| Field | Type | Description |
|-------|------|-------------|
| `balance` | number | Cash balance |
| `equity` | number | Total account value |
| `pnl` | number | P&L from starting balance ($100k) |
| `pnlPercent` | number | P&L percentage |
| `linkedBanks` | array | Linked bank accounts (future) |

##### Demo Account Object

| Field | Type | Description |
|-------|------|-------------|
| `balance` | number | Cash balance |
| `equity` | number | Total account value |
| `pnl` | number | Today's P&L |
| `pnlPercent` | number | Today's P&L percentage |
| `canReset` | boolean | Can reset to $100k (paper only) |

#### Calculations

**Equity:**
```
equity = cash + market_value_of_all_positions
```

**Buying Power (Margin Account):**
```
buyingPower = cash × 2
```

**Total Profit:**
```
totalProfit = current_equity - 100000
totalProfitPercent = (totalProfit / 100000) × 100
```

**Today's Profit:**
```
profitToday = current_equity - yesterday_equity
profitTodayPercent = (profitToday / yesterday_equity) × 100
```

#### Use Cases

- **Portfolio Value:** Display total account value
- **P&L Tracking:** Monitor daily and total performance
- **Risk Management:** Check available cash and buying power
- **Performance Charts:** Plot equity over time

#### Example Usage

**Check Account Balance:**
```bash
curl -s http://localhost:3001/api/accounts/summary | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f'Equity: \${d[\"equity\"]:,.2f}')
print(f'Cash: \${d[\"cash\"]:,.2f}')
print(f'Buying Power: \${d[\"buyingPower\"]:,.2f}')
"
```

**Check Today's Performance:**
```bash
curl -s http://localhost:3001/api/accounts/summary | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f'Today: \${d[\"profitToday\"]:+,.2f} ({d[\"profitTodayPercent\"]:+.2f}%)')
print(f'Total: \${d[\"totalProfit\"]:+,.2f} ({d[\"totalProfitPercent\"]:+.2f}%)')
"
```

---

## Market Data Status

### GET /api/market/status

Check market data connection health and quality.

#### Request

```http
GET /api/market/status HTTP/1.1
Host: localhost:3001
```

```bash
curl -s http://localhost:3001/api/market/status | python3 -m json.tool
```

#### Response

**Success - Connected (200 OK):**
```json
{
  "success": true,
  "data": {
    "connected": true,
    "providers": {
      "alpaca": "connected"
    },
    "totalQuotes": 270,
    "dataQuality": "Real-time",
    "avgLatency": 0
  }
}
```

**Success - Disconnected (200 OK):**
```json
{
  "success": true,
  "data": {
    "connected": false,
    "providers": {
      "alpaca": "disconnected"
    },
    "totalQuotes": 0,
    "dataQuality": "Offline",
    "avgLatency": 0
  }
}
```

#### Response Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `connected` | boolean | Overall connection status | true |
| `providers` | object | Status per provider | `{"alpaca": "connected"}` |
| `totalQuotes` | number | Approximate quotes processed | 270 |
| `dataQuality` | string | Data quality level | "Real-time", "Delayed", "Offline" |
| `avgLatency` | number | Average latency in ms | 0 |

#### Data Quality Levels

| Level | Description |
|-------|-------------|
| **Real-time** | Live market data with minimal delay (<100ms) |
| **Delayed** | Market data delayed by 15+ minutes |
| **Offline** | No market data connection |

#### Use Cases

- **System Health:** Verify market data feed is working
- **Dashboard Status:** Show connection indicator
- **Alerts:** Notify if data feed disconnects
- **Diagnostics:** Troubleshoot trading issues

#### Example Usage

**Check Connection:**
```bash
curl -s http://localhost:3001/api/market/status | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
status = '✅ Connected' if d['connected'] else '❌ Disconnected'
print(f'Market Data: {status}')
print(f'Quality: {d[\"dataQuality\"]}')
"
```

---

## Error Handling

### Standard Error Response

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message describing what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning | When It Occurs |
|------|---------|---------------|
| **200** | OK | Request successful |
| **400** | Bad Request | Invalid parameters |
| **401** | Unauthorized | Invalid API credentials (Alpaca) |
| **404** | Not Found | Endpoint doesn't exist |
| **500** | Internal Server Error | Server/Alpaca API error |
| **503** | Service Unavailable | Bot is starting up or shutting down |

### Common Errors

#### 1. Alpaca API Credentials Invalid

**Error:**
```json
{
  "success": false,
  "error": "Forbidden: Invalid API credentials"
}
```

**Fix:**
- Check `.env` file has correct `ALPACA_API_KEY` and `ALPACA_SECRET_KEY`
- Verify keys in Alpaca dashboard
- Regenerate keys if compromised

#### 2. Market Data Unavailable

**Error:**
```json
{
  "success": false,
  "error": "Unable to fetch market data"
}
```

**Fix:**
- Check internet connection
- Verify Alpaca API is not down (https://status.alpaca.markets)
- Check if market is open

#### 3. No Positions Found

**Not an Error** - Returns empty array:
```json
{
  "success": true,
  "data": {
    "positions": [],
    "performance": {
      "activePositions": 0
    }
  }
}
```

---

## Rate Limits

### Alpaca API Limits

The bot uses Alpaca's API, which has rate limits:

| Endpoint Type | Limit | Time Window |
|--------------|-------|-------------|
| **Trading API** | 200 requests | per minute |
| **Market Data API** | 200 requests | per minute |
| **Account API** | 200 requests | per minute |

### Bot Internal Limits

The bot scans every 60 seconds, well within Alpaca limits:

- **Momentum Scan:** 135 API calls per 60 seconds
- **Position Updates:** 1-10 API calls per 60 seconds
- **Account Check:** 1 API call per request

**Total:** ~140-150 requests per minute maximum

### Best Practices

1. **Don't poll too frequently** - Dashboard refreshes every 5 seconds is plenty
2. **Cache responses** - Account data doesn't change instantly
3. **Use webhooks** - If implementing real-time updates (future)

---

## Examples

### Complete Dashboard Data Fetch

**Fetch all data for dashboard in one script:**

```bash
#!/bin/bash

echo "=== NexusTradeAI Dashboard Data ==="
echo ""

# Health Check
echo "🏥 Health Check:"
curl -s http://localhost:3001/health | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'  Status: {d[\"status\"]}')
print(f'  Bot: {d[\"bot\"]}')
"
echo ""

# Account Summary
echo "💰 Account Summary:"
curl -s http://localhost:3001/api/accounts/summary | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f'  Equity: \${d[\"equity\"]:,.2f}')
print(f'  Cash: \${d[\"cash\"]:,.2f}')
print(f'  Today P/L: \${d[\"profitToday\"]:+,.2f} ({d[\"profitTodayPercent\"]:+.2f}%)')
print(f'  Total P/L: \${d[\"totalProfit\"]:+,.2f} ({d[\"totalProfitPercent\"]:+.2f}%)')
"
echo ""

# Trading Status
echo "📊 Trading Status:"
curl -s http://localhost:3001/api/trading/status | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
print(f'  Active Positions: {d[\"performance\"][\"activePositions\"]}')
print(f'  Total Trades Today: {d[\"performance\"][\"totalTrades\"]}')
print(f'  Win Rate: {d[\"performance\"][\"winRate\"]}%')
print(f'  Profit Factor: {d[\"performance\"][\"profitFactor\"]}')
print('')
if d['positions']:
    print('  Positions:')
    for p in d['positions']:
        print(f'    {p[\"symbol\"]}: {p[\"quantity\"]} shares @ \${p[\"entryPrice\"]:.2f} | P/L: {p[\"unrealizedPLPercent\"]:+.2f}%')
else:
    print('  No positions')
"
echo ""

# Market Data
echo "📡 Market Data:"
curl -s http://localhost:3001/api/market/status | python3 -c "
import sys, json
d = json.load(sys.stdin)['data']
status = '✅ Connected' if d['connected'] else '❌ Disconnected'
print(f'  Status: {status}')
print(f'  Quality: {d[\"dataQuality\"]}')
print(f'  Quotes Processed: {d[\"totalQuotes\"]}')
"
echo ""
```

**Sample Output:**
```
=== NexusTradeAI Dashboard Data ===

🏥 Health Check:
  Status: ok
  Bot: unified-trading-bot

💰 Account Summary:
  Equity: $98,854.45
  Cash: $93,150.94
  Today P/L: -$1,209.59 (-1.21%)
  Total P/L: -$1,145.55 (-1.15%)

📊 Trading Status:
  Active Positions: 7
  Total Trades Today: 4
  Win Rate: 71.43%
  Profit Factor: 2.5

  Positions:
    CHPT: 96 shares @ $10.53 | P/L: -0.96%
    CMCSA: 30 shares @ $27.06 | P/L: +0.93%
    LOW: 3 shares @ $233.44 | P/L: +6.44%
    PFE: 33 shares @ $25.18 | P/L: +3.38%
    SMX: 2 shares @ $339.50 | P/L: -2.22%
    V: 2 shares @ $327.71 | P/L: +1.08%
    XLP: 10 shares @ $77.88 | P/L: +0.74%

📡 Market Data:
  Status: ✅ Connected
  Quality: Real-time
  Quotes Processed: 270
```

### Python Integration Example

```python
import requests
import json
from datetime import datetime

class NexusTradingAPI:
    def __init__(self, base_url='http://localhost:3001'):
        self.base_url = base_url

    def health_check(self):
        """Check if bot is running"""
        response = requests.get(f'{self.base_url}/health')
        return response.json()

    def get_positions(self):
        """Get all active positions"""
        response = requests.get(f'{self.base_url}/api/trading/status')
        data = response.json()
        return data['data']['positions'] if data['success'] else []

    def get_account(self):
        """Get account summary"""
        response = requests.get(f'{self.base_url}/api/accounts/summary')
        data = response.json()
        return data['data'] if data['success'] else None

    def get_market_status(self):
        """Get market data status"""
        response = requests.get(f'{self.base_url}/api/market/status')
        data = response.json()
        return data['data'] if data['success'] else None

    def display_dashboard(self):
        """Display complete dashboard"""
        # Check health
        health = self.health_check()
        print(f"Bot Status: {health['status']}")
        print()

        # Get account
        account = self.get_account()
        if account:
            print(f"Equity: ${account['equity']:,.2f}")
            print(f"Today's P/L: ${account['profitToday']:+,.2f} ({account['profitTodayPercent']:+.2f}%)")
            print()

        # Get positions
        positions = self.get_positions()
        print(f"Active Positions: {len(positions)}")
        for pos in positions:
            print(f"  {pos['symbol']}: {pos['unrealizedPLPercent']:+.2f}% (${pos['unrealizedPnL']:+,.2f})")

# Usage
api = NexusTradingAPI()
api.display_dashboard()
```

---

## WebSocket Support

**Status:** Not Currently Implemented

Future enhancement for real-time updates:

```javascript
// Future implementation
const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('position_update', (data) => {
    console.log('Position updated:', data);
});

ws.on('trade_executed', (data) => {
    console.log('Trade executed:', data);
});
```

---

## API Changelog

### Version 2.0 (Current - December 6, 2025)

**Added:**
- `/api/accounts/summary` - Complete account data endpoint
- `/api/market/status` - Market data health check
- Nested `realAccount` and `demoAccount` objects

**Changed:**
- Position data now includes all required fields for dashboard
- Performance metrics include win rate and profit factor

**Fixed:**
- Account summary structure matches Dashboard.tsx expectations
- Position side/strategy fields now populated

### Version 1.0 (December 5, 2025)

**Initial Release:**
- `/health` - Health check endpoint
- `/api/trading/status` - Basic trading status

---

*API Reference Version: 2.0*
*Last Updated: December 6, 2025*
*Base URL: http://localhost:3001*
