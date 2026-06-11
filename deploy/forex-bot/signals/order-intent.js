// Deterministic client-order IDs (idempotency keys) for broker orders.
//
// Borrowed from the OpenAlice study (2026-06-11): brokers dedupe orders
// server-side when given a client order ID. Without one, a concurrent race
// (manage-loop vs close-all), a rapid restart, or a network-ambiguous retry
// can double-submit — a double SELL turns a flat book into a short.
//
// Spec (Rule 1):
//   Inputs : { bot, action, symbol, side?, qty?|units?, now?, bucketMs?, maxLen? }
//   Output : "ntai-" + 16 hex chars of sha256 over the canonical intent string,
//            or null on missing required fields (callers spread-omit the field;
//            an absent ID degrades to today's behavior — Rule 9, never blocks).
//   Invariants:
//     - Deterministic for identical inputs within the same time bucket.
//     - Bucket = 10 min (= the anti-churn cooldown), so a legitimate
//       post-cooldown re-entry ALWAYS gets a fresh ID — this module can
//       dedupe but can never false-block a trade the cooldown permits.
//     - Length <= maxLen (Alpaca cap 48; OANDA 128). Prefix "ntai-".
//   Residual risk (documented): a race straddling a bucket boundary is not
//   deduped. Accepted — the alternative (longer buckets) risks blocking
//   legitimate trades, which is worse than the rare straddle.
'use strict';

const crypto = require('crypto');

const DEFAULT_BUCKET_MS = 10 * 60 * 1000;

function computeOrderIntentId(parts) {
    const { bot, action, symbol } = parts || {};
    if (!bot || !action || !symbol) return null;
    const bucketMs = parts.bucketMs || DEFAULT_BUCKET_MS;
    const now = parts.now != null ? parts.now : Date.now();
    const canonical = [
        String(bot), String(action), String(symbol),
        String(parts.side || ''), String(parts.qty != null ? parts.qty : (parts.units != null ? parts.units : '')),
        String(Math.floor(now / bucketMs)),
    ].join('|');
    const digest = crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
    const id = `ntai-${digest}`;
    const maxLen = parts.maxLen || 48;
    return id.length <= maxLen ? id : id.slice(0, maxLen);
}

module.exports = { computeOrderIntentId, DEFAULT_BUCKET_MS };
