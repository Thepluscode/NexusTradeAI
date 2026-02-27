# PM2 Management Guide - Never Shut Down Again!

**Date:** December 27, 2025
**Status:** ✅ Bots are now bulletproof with PM2

---

## What PM2 Does for You

✅ **Auto-restart on crashes** - If bot crashes, PM2 restarts it automatically  
✅ **Survives terminal closure** - Bot keeps running even if you close terminal  
✅ **Auto-start on reboot** - Bot starts when computer boots (after setup)  
✅ **Memory management** - Restarts if memory usage exceeds 500MB  
✅ **Log management** - Auto-rotates logs to prevent disk fill-up  
✅ **Easy monitoring** - Simple commands to check status

---

## Current Status

Run this command to see what's running:
```bash
pm2 list
```

You should see:
- **orb-trading-bot** - Status: online (ORB trading bot on port 3002)
- **bot-dashboard** - Status: online (Dashboard on port 3000)

---

## Essential PM2 Commands

### View Status
```bash
pm2 list                    # Show all processes
pm2 status                  # Same as list
```

### View Logs (Real-time)
```bash
pm2 logs orb-trading-bot    # View bot logs
pm2 logs bot-dashboard      # View dashboard logs
pm2 logs                    # View all logs
```

**Stop viewing logs:** Press `Ctrl+C`

### Restart Services
```bash
pm2 restart orb-trading-bot    # Restart bot only
pm2 restart bot-dashboard      # Restart dashboard only
pm2 restart all                # Restart everything
```

### Stop Services
```bash
pm2 stop orb-trading-bot       # Stop bot only
pm2 stop all                   # Stop everything
```

### Start Services (if stopped)
```bash
pm2 start orb-trading-bot      # Start bot only
pm2 start ecosystem.config.js  # Start everything from config
```

### Delete Services (complete removal)
```bash
pm2 delete orb-trading-bot     # Remove bot from PM2
pm2 delete all                 # Remove all from PM2
```

### Monitor Resources
```bash
pm2 monit    # Real-time dashboard (CPU, memory, logs)
```

**Exit monitoring:** Press `Ctrl+C`

---

## Auto-Start on Computer Reboot (One-Time Setup)

To make bots start automatically when your computer boots, run this command **once**:

```bash
sudo env PATH=$PATH:/Users/theophilusogieva/.nvm/versions/node/v22.20.0/bin /Users/theophilusogieva/.nvm/versions/node/v22.20.0/lib/node_modules/pm2/bin/pm2 startup launchd -u theophilusogieva --hp /Users/theophilusogieva
```

**You'll be asked for your computer password.**

After running this:
1. Your bots will start automatically when computer boots
2. They'll survive computer restarts
3. You never have to manually start them again

---

## Quick Start Scripts

### Start Everything with PM2
```bash
cd /Users/theophilusogieva/Desktop/NexusTradeAI
./START_BOT_PM2.sh
```

### Stop Everything
```bash
pm2 stop all
```

### Restart Everything
```bash
pm2 restart all
```

---

## Troubleshooting

### Bot not responding?
```bash
# Check if it's running
pm2 list

# View recent logs for errors
pm2 logs orb-trading-bot --lines 50

# Restart it
pm2 restart orb-trading-bot
```

### Dashboard not loading?
```bash
# Check if it's running
pm2 list

# Restart dashboard
pm2 restart bot-dashboard

# Check dashboard is on port 3000
lsof -i :3000
```

### Bot keeps crashing?
```bash
# View error logs
pm2 logs orb-trading-bot --err --lines 100

# Check memory usage
pm2 monit

# If memory issue, increase limit in ecosystem.config.js:
# max_memory_restart: '1G'  (change from 500M to 1G)
```

### Can't connect to ports?
```bash
# Check what's using the ports
lsof -i :3002    # Bot
lsof -i :3000    # Dashboard

# If something else is using ports, kill it:
lsof -ti :3002 | xargs kill -9
lsof -ti :3000 | xargs kill -9

# Restart PM2
pm2 restart all
```

---

## How Auto-Restart Works

**PM2 will automatically restart the bot if:**
- It crashes (exit code > 0)
- It uses more than 500MB memory
- It becomes unresponsive
- There's an uncaught exception

**Restart limits:**
- Max 10 restarts in 1 minute
- After 10 rapid restarts, PM2 stops trying (prevents infinite crash loop)
- Waits 4 seconds between restart attempts

---

## Log Files Location

**Bot logs:**
- Output: `clients/bot-dashboard/logs/orb-bot-out.log`
- Errors: `clients/bot-dashboard/logs/orb-bot-error.log`

**Dashboard logs:**
- Output: `clients/bot-dashboard/logs/dashboard-out.log`
- Errors: `clients/bot-dashboard/logs/dashboard-error.log`

**View logs directly:**
```bash
tail -f clients/bot-dashboard/logs/orb-bot-out.log
```

---

## Monday Morning Checklist

**Before market opens (9:00 AM):**

```bash
# 1. Check bot is running
pm2 list

# 2. If not running, start it
pm2 start orb-trading-bot

# 3. View logs to verify
pm2 logs orb-trading-bot --lines 20

# 4. Check health
curl http://localhost:3002/health

# 5. Open dashboard
open http://localhost:3000
```

**Everything should be automatic now!**

---

## Configuration File

Location: `/Users/theophilusogieva/Desktop/NexusTradeAI/ecosystem.config.js`

This file tells PM2 how to run your bots. If you need to change ports or settings, edit this file and run:
```bash
pm2 restart all
```

---

## Uninstall PM2 (if needed)

**To completely remove PM2:**
```bash
# Stop all processes
pm2 stop all

# Remove from startup
pm2 unstartup launchd

# Delete all processes
pm2 delete all

# Kill PM2 daemon
pm2 kill

# Uninstall globally
npm uninstall -g pm2
```

---

## Summary

**What you have now:**
- ✅ Bot runs in background 24/7
- ✅ Auto-restarts on crashes
- ✅ Survives terminal closures
- ✅ Can auto-start on computer boot (needs one-time setup)
- ✅ Easy monitoring with `pm2 list` and `pm2 logs`
- ✅ Memory protection (restarts if >500MB)

**What you DON'T need to do anymore:**
- ❌ Manually start bot every day
- ❌ Keep terminal open
- ❌ Worry about crashes
- ❌ Remember to restart after computer reboot

**Just set it and forget it! 🚀**
