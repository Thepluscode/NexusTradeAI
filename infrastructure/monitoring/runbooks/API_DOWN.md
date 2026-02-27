# Runbook: API Down

**Alert:** `APIDown`
**Severity:** Critical
**Threshold:** API not responding for 1 minute

## Description

One or more critical APIs (Alpaca, data providers) are not responding. This prevents the bot from trading and accessing market data.

## Impact

- **HIGH IMPACT:** Bot cannot execute trades
- **Data Loss:** Missing market data
- **Revenue:** Trading opportunities missed

## Investigation Steps

### 1. Identify Which API is Down

```bash
# Check all API health
curl -s http://localhost:9091/metrics | grep api_health

# Expected output:
# trading_bot_api_health{api_name="alpaca"} 1
# trading_bot_api_health{api_name="polygon"} 1
# 0 = down, 1 = up
```

### 2. Test API Connectivity Manually

```bash
# Test Alpaca API
curl -v https://paper-api.alpaca.markets/v2/account \
  -H "APCA-API-KEY-ID: ${ALPACA_API_KEY}" \
  -H "APCA-API-SECRET-KEY: ${ALPACA_SECRET_KEY}"

# Test Polygon (if configured)
curl "https://api.polygon.io/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-01-02?apiKey=${POLYGON_API_KEY}"

# Check DNS resolution
nslookup paper-api.alpaca.markets

# Check network connectivity
ping -c 3 paper-api.alpaca.markets
```

### 3. Check Bot Logs

```bash
# Check for API errors
tail -50 clients/bot-dashboard/logs/unified-bot-protected.log | grep -i "api\|error\|timeout"

# Check for rate limiting
grep -i "rate limit\|429\|too many requests" clients/bot-dashboard/logs/*.log
```

### 4. Check API Status Pages

- **Alpaca:** https://status.alpaca.markets
- **Polygon:** https://status.polygon.io
- **Alpha Vantage:** https://www.alphavantage.co/status/

## Resolution Steps

### If Alpaca API is Down

```bash
# 1. Check API keys are correct
cat .env | grep ALPACA

# 2. Verify account status
# Login to: https://app.alpaca.markets/paper/dashboard

# 3. Check for IP restrictions
# Alpaca may block certain IPs or require whitelisting

# 4. Switch to backup data source (if configured)
# Edit .env:
# PRIMARY_DATA_SOURCE=polygon  # instead of alpaca
```

### If External Provider Issue

```bash
# 1. Enable fallback mode in bot
curl -X POST http://localhost:3002/api/config \
  -H "Content-Type: application/json" \
  -d '{"fallback_mode": true}'

# 2. The bot should:
#    - Stop opening new positions
#    - Maintain existing positions with last known prices
#    - Queue orders for when API recovers

# 3. Monitor recovery
watch -n 30 'curl -s http://localhost:9091/metrics | grep api_health'
```

### If Network Issue

```bash
# 1. Check internet connectivity
ping -c 3 8.8.8.8

# 2. Check DNS
nslookup paper-api.alpaca.markets

# 3. Check firewall
sudo iptables -L | grep -i drop

# 4. Restart network (last resort)
sudo systemctl restart networking
```

### If API Keys Invalid

```bash
# 1. Regenerate API keys
# Login to: https://app.alpaca.markets/paper/dashboard
# Navigate to: API Keys > Regenerate

# 2. Update .env file
nano .env
# Update: ALPACA_API_KEY and ALPACA_SECRET_KEY

# 3. Restart bot
cd infrastructure
docker-compose restart trading-bot

# 4. Verify connection
curl -s http://localhost:9091/health
```

## Auto-Recovery

The bot has built-in retry logic:

```javascript
// In bot code:
- Retries: 3 attempts
- Backoff: Exponential (1s, 2s, 4s)
- Timeout: 10 seconds per attempt
- Fallback: Use cached data if available
```

If auto-recovery fails after 3 retries, manual intervention required.

## Prevention

1. **API Key Rotation:**
   - Set calendar reminder to rotate keys every 90 days
   - Store backup keys securely
   - Test new keys before deploying

2. **Multi-Provider Setup:**
   ```bash
   # Configure multiple data sources in .env:
   PRIMARY_DATA_SOURCE=alpaca
   FALLBACK_DATA_SOURCE=polygon
   TERTIARY_DATA_SOURCE=finnhub
   ```

3. **Monitoring:**
   - Set up uptime monitoring (UptimeRobot, Pingdom)
   - Subscribe to API status pages
   - Enable SMS alerts for critical APIs

4. **Rate Limit Management:**
   - Implement rate limiting in bot
   - Track API usage in metrics
   - Alert when approaching limits

## False Positive Scenarios

- **API Maintenance:** Planned outages (check status page)
- **Rate Limiting:** Temporary throttling, recovers automatically
- **Network Blip:** Brief connectivity issue < 60 seconds

## Escalation

Escalate if:
- API down > 5 minutes during market hours
- Multiple APIs down simultaneously
- Cannot access Alpaca dashboard
- Alpaca status page shows major outage

**Escalation Contact:**
- Alpaca Support: support@alpaca.markets
- Emergency: Check Alpaca status page for updates

## Related Alerts

- `HighAPILatency` - May precede full outage
- `HighErrorRate` - Often caused by API issues
- `BotDown` - Bot may crash if APIs down

## Post-Incident

1. **Review:**
   - Check total downtime
   - Calculate missed opportunities
   - Document lessons learned

2. **Improve:**
   - Add more fallback providers
   - Improve error handling
   - Update runbook with new findings

## References

- Alpaca API Docs: https://alpaca.markets/docs/api-documentation
- Bot API code: `clients/bot-dashboard/unified-trading-bot.js`
- Health check: http://localhost:9091/health
- Grafana: http://localhost:3030 (System Health dashboard)
