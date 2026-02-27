# Preventing Service Disconnections

## What Was Fixed

### 1. Invalid API Key Handling
**Problem:** The data server was trying to use empty/placeholder API keys, causing 401 errors and potential crashes.

**Solution:** Updated `services/api/live-data-server.js` to:
- Only use API keys that are properly configured (>10 chars, no placeholders)
- Silently handle errors from optional providers (AlphaVantage, Finnhub)
- Rely primarily on Alpaca API which is properly configured

### 2. Disk Space Issues
**Problem:** Disk was 99% full, preventing the bot from writing logs/data.

**Solution:**
- Cleaned npm cache (freed 4.6GB)
- Now have 6.7GB free space
- **Recommendation:** Keep at least 10GB free at all times

## How to Prevent Future Issues

### 1. Use the Service Manager (Recommended)

The new service manager will automatically restart crashed services:

```bash
# Start all services
./services/service-manager.sh start

# Check service status
./services/service-manager.sh status

# Run continuous monitoring (auto-restart if crash)
./services/service-manager.sh monitor
```

**To run monitor in background:**
```bash
nohup ./services/service-manager.sh monitor > /dev/null 2>&1 &
```

### 2. Monitor Disk Space

Check disk space weekly:
```bash
df -h /Users/theophilusogieva/Desktop
```

**Warning signs:**
- ❌ >95% usage - Clean up immediately
- ⚠️  90-95% usage - Clean up soon
- ✅ <90% usage - Healthy

**Quick cleanup commands:**
```bash
# Clean npm cache
npm cache clean --force

# Remove old log files (older than 7 days)
find ~/Desktop/NexusTradeAI/services/*/logs -name "*.log" -mtime +7 -delete

# Check what's using space
du -sh ~/Desktop/* | sort -hr | head -10
```

### 3. Service Health Checks

Run this daily to verify all services:
```bash
./services/service-manager.sh status
```

Expected output:
```
✅ Trading Bot (port 3002): Running
✅ Data Server (port 3001): Running
✅ AI Service (port 5001): Running
✅ Dashboard (port 3000): Running
```

### 4. Log Monitoring

Check for errors in logs:
```bash
# Check data server errors
tail -100 services/api/logs/data-server-*.log | grep -i error

# Check trading bot errors
tail -100 services/trading/logs/trading-*.log | grep -i error
```

## Common Issues & Solutions

### Issue 1: Data Service Disconnecting
**Symptoms:** Dashboard shows "Data: Disconnected"

**Solutions:**
1. Check if process is running: `ps aux | grep live-data-server`
2. Restart: `./services/service-manager.sh restart`
3. Check logs: `tail -50 services/api/logs/data-server-*.log`

### Issue 2: Trading Bot Not Executing Trades
**Symptoms:** Bot running but 0 trades for multiple days

**Solutions:**
1. Check disk space: `df -h`
2. Check market conditions are weak (this is normal!)
3. Verify bot is scanning: `tail -50 services/trading/logs/trading-*.log | grep "Trend\|Volume"`

### Issue 3: Services Crash After Reboot
**Symptom:** All services stopped after restarting computer

**Solution:** Run the service manager:
```bash
cd ~/Desktop/NexusTradeAI
./services/service-manager.sh start
```

## Automated Monitoring Setup (Optional)

To run the service monitor automatically on startup:

1. Create a LaunchAgent file:
```bash
cat > ~/Library/LaunchAgents/com.nexustradeai.monitor.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.nexustradeai.monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/theophilusogieva/Desktop/NexusTradeAI/services/service-manager.sh</string>
        <string>monitor</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
EOF
```

2. Load the LaunchAgent:
```bash
launchctl load ~/Library/LaunchAgents/com.nexustradeai.monitor.plist
```

This will automatically start and monitor services on every reboot.

## Emergency Recovery

If all services crash:

```bash
# 1. Stop everything
./services/service-manager.sh stop

# 2. Check disk space
df -h

# 3. Clean if needed
npm cache clean --force

# 4. Restart everything
./services/service-manager.sh start

# 5. Verify status
./services/service-manager.sh status
```

## Support

If services keep crashing:
1. Check disk space first (most common issue)
2. Review error logs in `services/*/logs/`
3. Verify .env file has valid Alpaca API keys
4. Ensure no other programs are using ports 3000, 3001, 3002, 5001
