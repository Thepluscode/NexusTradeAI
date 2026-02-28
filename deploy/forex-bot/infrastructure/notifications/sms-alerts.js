/**
 * SMS ALERT SERVICE
 *
 * Sends SMS notifications for critical trading events:
 * - Stop Loss hits
 * - Take Profit hits
 * - Large position changes
 *
 * Uses Twilio for SMS delivery
 */

// Try to load Twilio, but don't crash if it's not installed
let twilio = null;
try {
    twilio = require('twilio');
} catch (error) {
    // Twilio not installed - SMS will be disabled
}

class SMSAlertService {
    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID;
        this.authToken = process.env.TWILIO_AUTH_TOKEN;
        this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
        this.toNumber = process.env.ALERT_PHONE_NUMBER;
        this.enabled = process.env.SMS_ALERTS_ENABLED === 'true';

        if (this.enabled) {
            if (!twilio) {
                console.log('📱 SMS alerts disabled - Twilio package not installed (using Telegram instead)');
                this.enabled = false;
            } else if (!this.accountSid || !this.authToken || !this.fromNumber || !this.toNumber) {
                console.warn('⚠️  SMS alerts enabled but missing credentials. Check .env file.');
                this.enabled = false;
            } else {
                this.client = twilio(this.accountSid, this.authToken);
                console.log('📱 SMS Alert Service initialized');
                console.log(`   Alerts will be sent to: ${this.maskPhoneNumber(this.toNumber)}`);
            }
        } else {
            console.log('📱 SMS alerts disabled (set SMS_ALERTS_ENABLED=true to enable)');
        }
    }

    maskPhoneNumber(phone) {
        if (!phone || phone.length < 4) return '***';
        return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
    }

    async sendStockStopLoss(symbol, entryPrice, currentPrice, loss, stopLoss) {
        if (!this.enabled) return false;

        const message = `🚨 STOCK STOP LOSS HIT 🚨

Symbol: ${symbol}
Entry: $${entryPrice.toFixed(2)}
Current: $${currentPrice.toFixed(2)}
Stop: $${stopLoss.toFixed(2)}
Loss: ${loss.toFixed(2)}%

Time: ${new Date().toLocaleTimeString()}`;

        return await this.send(message);
    }

    async sendStockTakeProfit(symbol, entryPrice, currentPrice, profit, target) {
        if (!this.enabled) return false;

        const message = `🎯 STOCK PROFIT TARGET HIT 🎯

Symbol: ${symbol}
Entry: $${entryPrice.toFixed(2)}
Current: $${currentPrice.toFixed(2)}
Target: $${target.toFixed(2)}
Profit: +${profit.toFixed(2)}%

Time: ${new Date().toLocaleTimeString()}`;

        return await this.send(message);
    }

    async sendForexStopLoss(pair, entry, reason) {
        if (!this.enabled) return false;

        const message = `🚨 FOREX STOP LOSS HIT 🚨

Pair: ${pair}
Entry: ${entry}
Reason: ${reason}

Time: ${new Date().toLocaleTimeString()}`;

        return await this.send(message);
    }

    async sendForexTakeProfit(pair, entry, reason) {
        if (!this.enabled) return false;

        const message = `🎯 FOREX PROFIT TARGET HIT 🎯

Pair: ${pair}
Entry: ${entry}
Reason: ${reason}

Time: ${new Date().toLocaleTimeString()}`;

        return await this.send(message);
    }

    async send(message) {
        if (!this.enabled) {
            console.log('📱 SMS disabled - would have sent:', message.split('\n')[0]);
            return false;
        }

        try {
            const result = await this.client.messages.create({
                body: message,
                from: this.fromNumber,
                to: this.toNumber
            });

            console.log(`✅ SMS sent successfully (SID: ${result.sid})`);
            return true;

        } catch (error) {
            console.error('❌ Failed to send SMS:', error.message);
            return false;
        }
    }

    // Test SMS
    async sendTestAlert() {
        const message = `📱 NexusTradeAI SMS Test

This is a test alert from your trading bot.

If you receive this, SMS alerts are working correctly!

Time: ${new Date().toLocaleString()}`;

        return await this.send(message);
    }
}

// Singleton instance
let instance = null;

module.exports = {
    getSMSAlertService: () => {
        if (!instance) {
            instance = new SMSAlertService();
        }
        return instance;
    }
};
