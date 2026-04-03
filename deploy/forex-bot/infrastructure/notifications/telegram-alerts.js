// Stub — local development only
// Provides a no-op implementation of the Telegram alert service.
//
// All three bots obtain the service via:
//   const { getTelegramAlertService } = require('./infrastructure/notifications/telegram-alerts');
//   let telegramAlerts = getTelegramAlertService();
//
// The returned object is also used as `this._telegram` or `this._userTelegram` inside
// bot strategy classes, so every method must return a Promise to be safely .catch()-able.
//
// Observed method calls across all bots:
//   telegramAlerts.enabled                    — boolean property (not a function)
//   telegramAlerts.send(message)
//   telegramAlerts.sendTestAlert()
//   telegramAlerts.sendHeartbeatAlert(botName, silentMinutes)
//   telegramAlerts.sendAgentApproval(botName, symbol, direction, confidence, sizeMult, regime)
//   telegramAlerts.sendAgentRejection(botName, symbol, direction, reason, confidence, riskFlags)
//   telegramAlerts.sendKillSwitchAlert(botName, reason)
//   telegramAlerts.sendStockEntry(symbol, price, stopPrice, targetPrice, shares, tier)
//   telegramAlerts.sendStockStopLoss(symbol, entry, currentPrice, unrealizedPL, stopLoss)
//   telegramAlerts.sendStockTakeProfit(symbol, entry, currentPrice, unrealizedPL, target)
//   telegramAlerts.sendForexEntry(pair, direction, entry, stopLoss, takeProfit, units, tier)
//   telegramAlerts.sendForexStopLoss(pair, entry, reason)
//   telegramAlerts.sendForexTakeProfit(pair, entry, reason)
//   telegramAlerts.sendCryptoEntry(symbol, ...)
//   telegramAlerts.sendCryptoStopLoss(symbol, entry, currentPrice, pnlPercent, stopLoss)
//   telegramAlerts.sendCryptoTakeProfit(symbol, entry, currentPrice, pnlPercent, takeProfit)

const noop = () => Promise.resolve({ ok: false, stub: true });

const stubService = {
    /** Set to false so bots skip re-initialisation branches that check `if (telegramAlerts.enabled)`. */
    enabled: false,

    send: noop,
    sendTestAlert: noop,
    sendHeartbeatAlert: noop,

    // Agent / AI decision alerts
    sendAgentApproval: noop,
    sendAgentRejection: noop,
    sendKillSwitchAlert: noop,

    // Stock alerts
    sendStockEntry: noop,
    sendStockStopLoss: noop,
    sendStockTakeProfit: noop,

    // Forex alerts
    sendForexEntry: noop,
    sendForexStopLoss: noop,
    sendForexTakeProfit: noop,

    // Crypto alerts
    sendCryptoEntry: noop,
    sendCryptoStopLoss: noop,
    sendCryptoTakeProfit: noop,
};

/**
 * Factory used by all three bots.
 * Returns the same singleton stub on every call, matching the pattern:
 *   telegramAlerts = getTelegramAlertService();
 * which is also called inside the bot's reconnect/reload logic.
 */
function getTelegramAlertService() {
    return stubService;
}

module.exports = { getTelegramAlertService };
