# SMS Alerts Setup Guide

## Overview

Your NexusTradeAI trading bots can now send SMS text messages to your phone when important events occur:
- 🚨 **Stop Loss hits** (when you lose money on a trade)
- 🎯 **Take Profit hits** (when you make money on a trade)

This keeps you informed in real-time, even when you're away from your computer!

---

## Step 1: Get a Twilio Account (FREE)

Twilio is the SMS service provider. They offer a **free trial** with $15 credit.

### Sign Up:
1. Go to: **https://www.twilio.com/try-twilio**
2. Fill out the sign-up form
3. Verify your email address
4. Verify your phone number (this will be your alert number)

### Get Your Credentials:
After signing up, you'll see your **Console Dashboard**:

1. **Account SID**: Copy this (looks like `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
2. **Auth Token**: Click "Show" and copy it
3. **Phone Number**: Click "Get a Trial Number" (free) or "Buy a Number" ($1/month)

---

## Step 2: Configure NexusTradeAI

### Edit your `.env` file:

Open `/Users/theophilusogieva/Desktop/NexusTradeAI/.env` and add these lines at the bottom:

```bash
# ===================================
# SMS Alert Configuration
# ===================================
SMS_ALERTS_ENABLED=true
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  # Replace with your Account SID
TWILIO_AUTH_TOKEN=your_auth_token_here                 # Replace with your Auth Token
TWILIO_PHONE_NUMBER=+15551234567                       # Replace with your Twilio number
ALERT_PHONE_NUMBER=+15559876543                        # Replace with YOUR phone number
```

### Important Notes:
- **Phone numbers MUST include country code** (e.g., `+1` for US/Canada)
- **Remove spaces and dashes** from phone numbers
- **Keep your Auth Token secret** - never share it publicly

**Example (US):**
```bash
TWILIO_PHONE_NUMBER=+12025551234  # Twilio number
ALERT_PHONE_NUMBER=+13105559876   # Your phone
```

**Example (UK):**
```bash
TWILIO_PHONE_NUMBER=+442071234567  # Twilio number (UK)
ALERT_PHONE_NUMBER=+447911123456   # Your mobile
```

---

## Step 3: Restart Your Bots

After updating `.env`, restart both bots to enable SMS alerts:

```bash
# Stop current bots
lsof -ti :3002 | xargs kill -9  # Stock bot
lsof -ti :3005 | xargs kill -9  # Forex bot

# Restart with SMS enabled
cd /Users/theophilusogieva/Desktop/NexusTradeAI/clients/bot-dashboard

# Stock bot
node unified-trading-bot.js > /tmp/stock-bot.log 2>&1 &

# Forex bot
node unified-forex-bot.js > logs/forex-bot.log 2>&1 &
```

You should see this in the logs:
```
📱 SMS Alert Service initialized
   Alerts will be sent to: ****9876
```

---

## Step 4: Test SMS Alerts

### Option A: Use the Test Endpoint

```bash
# Test from command line
curl -X POST http://localhost:3002/test-sms
```

You should receive a test SMS within 5-10 seconds!

### Option B: Wait for Real Trades

SMS alerts will automatically trigger when:
- A stock hits stop loss (4-6% loss)
- A stock hits profit target (8-15% profit)
- A forex pair hits stop loss (1.5-2.5% loss)
- A forex pair hits profit target (3-6% profit)

---

## What the SMS Messages Look Like

### Stop Loss Alert:
```
🚨 STOCK STOP LOSS HIT 🚨

Symbol: AAPL
Entry: $150.00
Current: $144.00
Stop: $144.00
Loss: -4.0%

Time: 12:15:30 PM
```

### Take Profit Alert:
```
🎯 STOCK PROFIT TARGET HIT 🎯

Symbol: TSLA
Entry: $250.00
Current: $270.00
Target: $270.00
Profit: +8.0%

Time: 3:45:15 PM
```

### Forex Alerts:
```
🚨 FOREX STOP LOSS HIT 🚨

Pair: EUR_USD
Entry: 1.10500
Reason: Stale position (7.5 days)

Time: 12:20:45 PM
```

---

## Troubleshooting

### "SMS disabled - would have sent"
**Problem**: SMS alerts are not enabled
**Solution**: Set `SMS_ALERTS_ENABLED=true` in `.env`

### "SMS alerts enabled but missing credentials"
**Problem**: One or more Twilio credentials are missing
**Solution**: Double-check all 4 variables in `.env`:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `ALERT_PHONE_NUMBER`

### "Failed to send SMS"
**Problem**: Invalid credentials or phone numbers
**Solution**:
1. Verify credentials in Twilio Console
2. Check phone numbers have `+` prefix
3. Ensure your phone is verified in Twilio (trial accounts)

### Not Receiving SMS
**Problem**: Messages not arriving
**Solution**:
1. Check bot logs for "✅ SMS sent successfully"
2. Verify your phone number in Twilio Console
3. Trial accounts can only send to verified numbers
4. Check your phone's spam/blocked messages

---

## Twilio Trial Limitations

**Free Trial:**
- $15 credit (~500 messages)
- Can only send to verified phone numbers
- Messages include "Sent from your Twilio trial account"

**Upgrade ($20 minimum):**
- Send to any number
- No trial message prefix
- ~$0.0075 per SMS (super cheap!)

---

## Cost Estimation

**SMS Pricing:**
- US/Canada: ~$0.0075 per message
- UK: ~$0.04 per message
- Most countries: $0.01-0.05 per message

**Example Monthly Cost:**
- 10 trades/day × 2 bots = 20 alerts/day
- 20 × 30 days = 600 messages/month
- 600 × $0.0075 = **$4.50/month** (US)

Very affordable for peace of mind! 📱

---

## Disable SMS Alerts

To turn off SMS alerts:

```bash
# Edit .env
SMS_ALERTS_ENABLED=false
```

Then restart the bots. Console alerts will still work.

---

## Security Best Practices

1. ✅ **Never commit `.env` to git** (already in `.gitignore`)
2. ✅ **Keep Auth Token secret** - it's like a password
3. ✅ **Use environment variables** - don't hardcode credentials
4. ✅ **Regenerate tokens if exposed** - do this in Twilio Console

---

## Support

**Twilio Documentation:**
- Getting Started: https://www.twilio.com/docs/sms/quickstart/node
- Console: https://console.twilio.com
- Pricing: https://www.twilio.com/sms/pricing

**NexusTradeAI:**
- Check logs: `tail -f /tmp/stock-bot.log`
- Test alerts: `curl -X POST http://localhost:3002/test-sms`

---

## Summary

1. ✅ Sign up for Twilio (free trial)
2. ✅ Get Account SID, Auth Token, and Phone Number
3. ✅ Add credentials to `.env`
4. ✅ Set `SMS_ALERTS_ENABLED=true`
5. ✅ Restart both bots
6. ✅ Test with curl or wait for real trades

You'll now receive instant SMS alerts when your bots make trades! 🚀📱
