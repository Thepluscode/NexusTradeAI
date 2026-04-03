// Stub — local development only
// Provides a no-op implementation of the SMS alert service.
//
// All three bots obtain the service via:
//   const { getSMSAlertService } = require('./infrastructure/notifications/sms-alerts');
//   const smsAlerts = getSMSAlertService();
//
// Observed method calls across all bots:
//   smsAlerts.sendTestAlert()
//   smsAlerts.sendStockStopLoss(symbol, entry, currentPrice, unrealizedPL, stopLoss)
//   smsAlerts.sendStockTakeProfit(symbol, entry, currentPrice, unrealizedPL, target)
//   smsAlerts.sendForexStopLoss(pair, entry, reason)
//   smsAlerts.sendForexTakeProfit(pair, entry, reason)
//
// (The crypto bot imports getSMSAlertService but does not call any methods on it
//  in the current codebase — kept here for forward compatibility.)

const noop = () => Promise.resolve({ ok: false, stub: true });

const stubService = {
    sendTestAlert: noop,

    // Stock alerts
    sendStockStopLoss: noop,
    sendStockTakeProfit: noop,

    // Forex alerts
    sendForexStopLoss: noop,
    sendForexTakeProfit: noop,
};

/**
 * Factory used by all three bots.
 * Returns the same singleton stub on every call.
 */
function getSMSAlertService() {
    return stubService;
}

module.exports = { getSMSAlertService };
