/**
 * TELEGRAM ALERT SERVICE
 *
 * Sends Telegram notifications for critical trading events:
 * - Stop Loss hits
 * - Take Profit hits
 * - Large position changes
 *
 * COMPLETELY FREE - No cost, unlimited messages!
 */

const TelegramBot = require('node-telegram-bot-api');

class TelegramAlertService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = process.env.TELEGRAM_ALERTS_ENABLED === 'true';

        if (this.enabled) {
            if (!this.botToken || !this.chatId) {
                console.warn('⚠️  Telegram alerts enabled but missing credentials. Check .env file.');
                this.enabled = false;
            } else {
                try {
                    this.bot = new TelegramBot(this.botToken, { polling: false });
                    console.log('📱 Telegram Alert Service initialized');
                    console.log(`   Alerts will be sent to Chat ID: ${this.maskChatId(this.chatId)}`);
                } catch (error) {
                    console.error('❌ Failed to initialize Telegram bot:', error.message);
                    this.enabled = false;
                }
            }
        } else {
            console.log('📱 Telegram alerts disabled (set TELEGRAM_ALERTS_ENABLED=true to enable)');
        }
    }

    maskChatId(chatId) {
        if (!chatId) return '***';
        const str = chatId.toString();
        if (str.length < 4) return '***';
        return str.slice(0, -4).replace(/\d/g, '*') + str.slice(-4);
    }

    async sendStockStopLoss(symbol, entryPrice, currentPrice, loss, stopLoss) {
        if (!this.enabled) return false;

        const message = `🚨 *STOCK STOP LOSS HIT* 🚨

📛 *Symbol:* ${symbol}
💰 *Entry:* $${entryPrice.toFixed(2)}
📉 *Current:* $${currentPrice.toFixed(2)}
🔻 *Stop Loss:* $${stopLoss.toFixed(2)}
💸 *Loss:* ${loss.toFixed(2)}%

⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendStockTakeProfit(symbol, entryPrice, currentPrice, profit, target) {
        if (!this.enabled) return false;

        const message = `🎯 *STOCK PROFIT TARGET HIT* 🎯

💎 *Symbol:* ${symbol}
💰 *Entry:* $${entryPrice.toFixed(2)}
📈 *Current:* $${currentPrice.toFixed(2)}
🎯 *Target:* $${target.toFixed(2)}
💵 *Profit:* +${profit.toFixed(2)}%

⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendForexStopLoss(pair, entry, reason) {
        if (!this.enabled) return false;

        const message = `🚨 *FOREX STOP LOSS HIT* 🚨

📛 *Pair:* ${pair}
💰 *Entry:* ${entry}
🔻 *Stop Loss Triggered*
📉 *Reason:* ${reason}

⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendForexTakeProfit(pair, entry, reason) {
        if (!this.enabled) return false;

        const message = `🎯 *FOREX PROFIT TARGET HIT* 🎯

💎 *Pair:* ${pair}
💰 *Entry:* ${entry}
🎯 *Take Profit Hit*
📈 *Reason:* ${reason}

⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendStockEntry(symbol, entryPrice, stopLoss, takeProfit, shares, tier) {
        if (!this.enabled) return false;

        const riskPercent = ((entryPrice - stopLoss) / entryPrice * 100).toFixed(2);
        const rewardPercent = ((takeProfit - entryPrice) / entryPrice * 100).toFixed(2);
        const positionValue = (shares * entryPrice).toFixed(2);

        const message = `🚀 *NEW STOCK POSITION ENTERED* 🚀

💎 *Symbol:* ${symbol}
📊 *Tier:* ${tier.toUpperCase()}
📈 *Shares:* ${shares} ($${positionValue})

💰 *Entry Price:* $${entryPrice.toFixed(2)}
🔻 *Stop Loss:* $${stopLoss.toFixed(2)} (-${riskPercent}%)
🎯 *Take Profit:* $${takeProfit.toFixed(2)} (+${rewardPercent}%)

📊 *Risk/Reward:* 1:${(parseFloat(rewardPercent) / parseFloat(riskPercent)).toFixed(2)}

⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendForexEntry(pair, direction, entry, stopLoss, takeProfit, units, tier) {
        if (!this.enabled) return false;

        const directionEmoji = direction === 'long' ? '📈' : '📉';
        const directionText = direction.toUpperCase();

        const riskPips = Math.abs(entry - stopLoss);
        const rewardPips = Math.abs(takeProfit - entry);
        const riskPercent = (riskPips / entry * 100).toFixed(2);
        const rewardPercent = (rewardPips / entry * 100).toFixed(2);

        const message = `🚀 *NEW FOREX POSITION ENTERED* 🚀

💎 *Pair:* ${pair}
${directionEmoji} *Direction:* ${directionText}
📊 *Tier:* ${tier.toUpperCase()}
📈 *Units:* ${units}

💰 *Entry:* ${entry.toFixed(5)}
🔻 *Stop Loss:* ${stopLoss.toFixed(5)} (-${riskPercent}%)
🎯 *Take Profit:* ${takeProfit.toFixed(5)} (+${rewardPercent}%)

📊 *Risk/Reward:* 1:${(parseFloat(rewardPercent) / parseFloat(riskPercent)).toFixed(2)}

⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendCryptoEntry(symbol, entryPrice, stopLoss, takeProfit, quantity, tier) {
        if (!this.enabled) return false;

        const riskPercent = ((entryPrice - stopLoss) / entryPrice * 100).toFixed(2);
        const rewardPercent = ((takeProfit - entryPrice) / entryPrice * 100).toFixed(2);
        const positionValue = (quantity * entryPrice).toFixed(2);

        const message = `🚀 *NEW CRYPTO POSITION ENTERED* 🚀

💎 *Symbol:* ${symbol}
📊 *Tier:* ${tier.toUpperCase()}
📈 *Quantity:* ${quantity.toFixed(6)} ($${positionValue})

💰 *Entry Price:* $${entryPrice.toFixed(2)}
🔻 *Stop Loss:* $${stopLoss.toFixed(2)} (-${riskPercent}%)
🎯 *Take Profit:* $${takeProfit.toFixed(2)} (+${rewardPercent}%)

📊 *Risk/Reward:* 1:${(parseFloat(rewardPercent) / parseFloat(riskPercent)).toFixed(2)}

⚡ *24/7 Trading Active*
⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendCryptoStopLoss(symbol, entryPrice, currentPrice, loss, stopLoss) {
        if (!this.enabled) return false;

        const message = `🚨 *CRYPTO STOP LOSS HIT* 🚨

📛 *Symbol:* ${symbol}
💰 *Entry:* $${entryPrice.toFixed(2)}
📉 *Current:* $${currentPrice.toFixed(2)}
🔻 *Stop Loss:* $${stopLoss.toFixed(2)}
💸 *Loss:* ${loss.toFixed(2)}%

⚡ *High volatility asset - Risk managed*
⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async sendCryptoTakeProfit(symbol, entryPrice, currentPrice, profit, target) {
        if (!this.enabled) return false;

        const message = `🎯 *CRYPTO PROFIT TARGET HIT* 🎯

💎 *Symbol:* ${symbol}
💰 *Entry:* $${entryPrice.toFixed(2)}
📈 *Current:* $${currentPrice.toFixed(2)}
🎯 *Target:* $${target.toFixed(2)}
💵 *Profit:* +${profit.toFixed(2)}%

🚀 *Crypto volatility = Bigger gains!*
⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }

    async send(message) {
        if (!this.enabled) {
            console.log('📱 Telegram disabled - would have sent:', message.split('\n')[0]);
            return false;
        }

        try {
            await this.bot.sendMessage(this.chatId, message, {
                parse_mode: 'Markdown',
                disable_notification: false
            });

            console.log(`✅ Telegram message sent successfully`);
            return true;

        } catch (error) {
            console.error('❌ Failed to send Telegram message:', error.message);
            return false;
        }
    }

    async sendHeartbeatAlert(botName, silentMinutes) {
        const message = `⚠️ *${botName} SILENT ALERT*\n\nBot has not executed any scans in the last *${silentMinutes} minutes*.\n\nCheck Railway logs.\n⏰ ${new Date().toISOString()}`;
        return await this.send(message);
    }

    // Test Telegram
    async sendTestAlert() {
        const message = `📱 *NexusTradeAI Telegram Test*

✅ This is a test alert from your trading bot.

If you receive this, Telegram alerts are working correctly!

🚀 *FREE unlimited alerts!*

⏰ *Time:* ${new Date().toLocaleString()}`;

        return await this.send(message);
    }
}

// Singleton instance
let instance = null;

module.exports = {
    getTelegramAlertService: () => {
        if (!instance) {
            instance = new TelegramAlertService();
        }
        return instance;
    }
};
