# Telegram Alerts Setup Guide

## Overview

Your NexusTradeAI trading bots can now send **FREE, UNLIMITED** Telegram messages to your phone when important events occur:
- 🚨 **Stop Loss hits** (when you lose money on a trade)
- 🎯 **Take Profit hits** (when you make money on a trade)

**Why Telegram over SMS?**
- ✅ **Completely FREE** - No cost whatsoever
- ✅ **Unlimited Messages** - Send as many alerts as you want
- ✅ **More Reliable** - Messages are delivered instantly
- ✅ **Richer Formatting** - Markdown support for better readability
- ✅ **No Trial Limitations** - Unlike SMS services, Telegram has no restrictions

This keeps you informed in real-time, even when you're away from your computer!

---

## Step 1: Install Telegram

If you don't have Telegram yet, download it:

**Mobile:**
- **iOS**: https://apps.apple.com/app/telegram-messenger/id686449807
- **Android**: https://play.google.com/store/apps/details?id=org.telegram.messenger

**Desktop:**
- **macOS/Windows/Linux**: https://desktop.telegram.org/

---

## Step 2: Create Your Telegram Bot (100% Free)

### 2.1 Open Telegram and Find BotFather

1. Open Telegram app
2. In the search bar, type: **@BotFather**
3. Open the chat with **BotFather** (official Telegram bot for creating bots)
   - ✅ It should have a blue checkmark (verified)

### 2.2 Create Your Bot

1. Send this command to BotFather:
   ```
   /newbot
   ```

2. BotFather will ask for a **name** for your bot:
   ```
   Example: NexusTradeAI Alerts
   ```
   (Can be anything you like)

3. BotFather will ask for a **username** for your bot:
   ```
   Example: nexustrade_alerts_bot
   ```
   - Must end with `bot`
   - Must be unique across all Telegram
   - Example: `yourname_trading_bot`

4. **Success!** BotFather will send you a message with your **Bot Token**:
   ```
   Done! Congratulations on your new bot...

   Use this token to access the HTTP API:
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789

   Keep your token secure and store it safely...
   ```

5. **COPY YOUR BOT TOKEN** - You'll need this for the `.env` file
   - Example format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789`

---

## Step 3: Get Your Chat ID

### 3.1 Start a Chat with Your Bot

1. Click the link BotFather sent (or search for your bot's username)
2. Click **START** button to start a conversation with your bot
3. Send any message to your bot (e.g., "Hello")
   - This is important! Your bot can't message you until you start the chat

### 3.2 Get Your Chat ID

**Option A: Using @userinfobot (Easiest)**

1. In Telegram search, type: **@userinfobot**
2. Click **START**
3. The bot will immediately send you your **Chat ID**:
   ```
   Id: 123456789
   ```
4. **COPY YOUR CHAT ID** - You'll need this for the `.env` file

**Option B: Using @getmyid_bot (Alternative)**

1. Search for **@getmyid_bot** in Telegram
2. Click **START**
3. The bot will send you your Chat ID

**Option C: Using API (Advanced)**

1. Send a message to your bot first
2. Visit this URL in your browser (replace `YOUR_BOT_TOKEN` with your actual token):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
3. Look for `"chat":{"id":123456789}` in the response
4. Copy the `id` number

---

## Step 4: Configure NexusTradeAI

### Edit your `.env` file:

Open `/Users/theophilusogieva/Desktop/NexusTradeAI/.env` and add these lines:

```bash
# ===================================
# Telegram Alert Configuration (FREE!)
# ===================================
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz123456789  # Replace with your bot token
TELEGRAM_CHAT_ID=123456789                                          # Replace with your chat ID
```

### Important Notes:
- Replace `TELEGRAM_BOT_TOKEN` with the token from BotFather (Step 2.2)
- Replace `TELEGRAM_CHAT_ID` with your chat ID (Step 3.2)
- Set `TELEGRAM_ALERTS_ENABLED=true` to enable alerts
- Keep your bot token secret - it's like a password

**Example (filled in):**
```bash
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_BOT_TOKEN=987654321:AAEhBB0z1234abcdEFGHijklMNOP5678xyz
TELEGRAM_CHAT_ID=987654321
```

---

## Step 5: Restart Your Bots

After updating `.env`, restart both bots to enable Telegram alerts:

```bash
# Stop current bots
lsof -ti :3002 | xargs kill -9  # Stock bot
lsof -ti :3005 | xargs kill -9  # Forex bot

# Restart with Telegram enabled
cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard

# Stock bot
node unified-trading-bot.js > /tmp/stock-bot.log 2>&1 &

# Forex bot
node unified-forex-bot.js > logs/forex-bot.log 2>&1 &
```

You should see this in the logs:
```
📱 Telegram Alert Service initialized
   Alerts will be sent to Chat ID: ****4321
```

---

## Step 6: Test Telegram Alerts

### Option A: Use the Test Endpoint

**For Stock Bot (port 3002):**
```bash
curl -X POST http://localhost:3002/test-telegram
```

**For Forex Bot (port 3005):**
```bash
curl -X POST http://localhost:3005/test-telegram
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Test Telegram message sent successfully! Check your Telegram app.",
  "timestamp": "2025-12-26T17:30:00.000Z"
}
```

You should receive a test message in Telegram within 1-2 seconds!

### Option B: Wait for Real Trades

Telegram alerts will automatically trigger when:
- A stock hits stop loss (4-6% loss)
- A stock hits profit target (8-15% profit)
- A forex pair hits stop loss (1.5-2.5% loss)
- A forex pair hits profit target (3-6% profit)

---

## What the Telegram Messages Look Like

### Stock Stop Loss Alert:
```
🚨 STOCK STOP LOSS HIT 🚨

📛 Symbol: AAPL
💰 Entry: $150.00
📉 Current: $144.00
🔻 Stop Loss: $144.00
💸 Loss: -4.0%

⏰ Time: 12/26/2025, 12:15:30 PM
```

### Stock Take Profit Alert:
```
🎯 STOCK PROFIT TARGET HIT 🎯

💎 Symbol: TSLA
💰 Entry: $250.00
📈 Current: $270.00
🎯 Target: $270.00
💵 Profit: +8.0%

⏰ Time: 12/26/2025, 3:45:15 PM
```

### Forex Stop Loss Alert:
```
🚨 FOREX STOP LOSS HIT 🚨

📛 Pair: EUR_USD
💰 Entry: 1.10500
🔻 Stop Loss Triggered
📉 Reason: Stale position (7.5 days)

⏰ Time: 12/26/2025, 12:20:45 PM
```

### Forex Take Profit Alert:
```
🎯 FOREX PROFIT TARGET HIT 🎯

💎 Pair: GBP_USD
💰 Entry: 1.26500
🎯 Take Profit Hit
📈 Reason: Day-2 target hit (+2.5%)

⏰ Time: 12/26/2025, 2:30:15 PM
```

---

## Troubleshooting

### "Telegram disabled - would have sent"
**Problem**: Telegram alerts are not enabled
**Solution**: Set `TELEGRAM_ALERTS_ENABLED=true` in `.env`

### "Telegram alerts enabled but missing credentials"
**Problem**: One or both credentials are missing
**Solution**: Double-check both variables in `.env`:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### "Failed to initialize Telegram bot"
**Problem**: Invalid bot token
**Solution**:
1. Verify bot token in Telegram with @BotFather
2. Send `/mybots` to BotFather
3. Select your bot → API Token
4. Copy the correct token to `.env`

### "Failed to send Telegram message"
**Problem**: Bot cannot send messages
**Solution**:
1. Make sure you clicked **START** in your bot's chat
2. Send at least one message to your bot first
3. Verify your Chat ID is correct
4. Check bot token is valid

### Not Receiving Messages
**Problem**: Messages not arriving
**Solution**:
1. Check bot logs for "✅ Telegram message sent successfully"
2. Verify you started the chat with your bot (click START)
3. Make sure Chat ID is correct (use @userinfobot to verify)
4. Check Telegram notifications are enabled on your device

### "Error: 401 Unauthorized"
**Problem**: Invalid bot token
**Solution**:
1. Get a new token from @BotFather
2. Send `/mybots` → select your bot → API Token
3. Update `TELEGRAM_BOT_TOKEN` in `.env`
4. Restart bots

---

## Telegram vs SMS Comparison

| Feature | Telegram | SMS (Twilio) |
|---------|----------|--------------|
| **Cost** | 🟢 FREE | 🔴 ~$0.0075 per message |
| **Messages/Month** | 🟢 Unlimited | 🟡 Trial: ~500, Paid: Unlimited |
| **Setup Complexity** | 🟢 Easy (5 min) | 🟡 Medium (sign up, verify) |
| **Message Format** | 🟢 Rich (Markdown) | 🔴 Plain text only |
| **Delivery Speed** | 🟢 Instant (1-2 sec) | 🟡 5-10 seconds |
| **Reliability** | 🟢 Very reliable | 🟢 Very reliable |
| **Global Support** | 🟢 Worldwide | 🟡 Most countries |
| **Privacy** | 🟢 E2E encryption | 🔴 SMS not encrypted |

**Recommendation:** Use Telegram! It's free, unlimited, and better in every way.

---

## Cost Comparison (Example Usage)

**Scenario:** 10 trades/day × 2 bots = 20 alerts/day

**Monthly Messages:** 20 × 30 days = 600 messages/month

**Cost:**
- **Telegram:** $0 (always free)
- **SMS (Twilio):** 600 × $0.0075 = **$4.50/month**

**Annual Cost:**
- **Telegram:** $0
- **SMS:** $54/year

**💡 Telegram saves you $54/year while being better!**

---

## Using Both SMS and Telegram (Optional)

You can enable both SMS and Telegram alerts simultaneously:

```bash
# SMS Alerts (Paid)
SMS_ALERTS_ENABLED=true
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890
ALERT_PHONE_NUMBER=+1234567890

# Telegram Alerts (Free)
TELEGRAM_ALERTS_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

**Why use both?**
- Redundancy: If one service is down, you still get alerts
- Different devices: SMS on phone, Telegram on tablet/computer
- Testing: Compare delivery speed and reliability

---

## Disable Telegram Alerts

To turn off Telegram alerts:

```bash
# Edit .env
TELEGRAM_ALERTS_ENABLED=false
```

Then restart the bots. Console alerts will still work.

---

## Security Best Practices

1. ✅ **Never commit `.env` to git** (already in `.gitignore`)
2. ✅ **Keep your bot token secret** - it's like a password
3. ✅ **Don't share your bot token** - anyone with it can send messages as your bot
4. ✅ **Use environment variables** - don't hardcode credentials in code
5. ✅ **Revoke and regenerate token if exposed:**
   - Send `/mybots` to @BotFather
   - Select your bot → API Token → Revoke Token
   - Generate new token and update `.env`

---

## Advanced: Multiple Chat IDs (Group Alerts)

You can send alerts to a Telegram group instead of just yourself:

**Step 1:** Create a Telegram group
1. Create a new group in Telegram
2. Add your bot to the group (search by username)
3. Make your bot an admin (recommended)

**Step 2:** Get the group Chat ID
1. Send a message in the group
2. Visit: `https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates`
3. Look for the group chat ID (negative number, e.g., `-987654321`)

**Step 3:** Update `.env`
```bash
TELEGRAM_CHAT_ID=-987654321  # Group chat ID (negative number)
```

Now all alerts will be sent to the group!

---

## Support

**Telegram Bot Documentation:**
- Bot API: https://core.telegram.org/bots/api
- BotFather Commands: https://core.telegram.org/bots#botfather
- Creating a Bot: https://core.telegram.org/bots/tutorial

**NexusTradeAI:**
- Check logs: `tail -f /tmp/stock-bot.log` or `tail -f logs/forex-bot.log`
- Test alerts: `curl -X POST http://localhost:3002/test-telegram`
- Verify bots running: `lsof -i :3002` and `lsof -i :3005`

---

## Summary

1. ✅ Install Telegram app (mobile or desktop)
2. ✅ Create bot with @BotFather
3. ✅ Get bot token from BotFather
4. ✅ Start chat with your bot (click START)
5. ✅ Get your Chat ID from @userinfobot
6. ✅ Add credentials to `.env`
7. ✅ Set `TELEGRAM_ALERTS_ENABLED=true`
8. ✅ Restart both bots
9. ✅ Test with curl or wait for real trades

You'll now receive instant, FREE, UNLIMITED alerts when your bots make trades! 🚀📱

---

**Questions?** Check the troubleshooting section or test with `curl -X POST http://localhost:3002/test-telegram`
