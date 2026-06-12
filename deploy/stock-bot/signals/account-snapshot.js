// Compact account-state snapshots per trade (OpenAlice borrow #2,
// 2026-06-12). Captures the open-positions picture at trade open/close so
// "what did the account look like at trade N" is queryable without replay —
// crash forensics + honesty-detector evidence format.
//
// Spec (Rule 1):
//   Input : a positions Map (or array of position records). Balance/equity
//           are deliberately OUT of scope — they live behind an async broker
//           call and the persistence path must stay free of external I/O.
//   Output: { ts, openPositions, symbols, exposureUsd } or null on anything
//           unusable (callers null-guard; a snapshot failure must never
//           block a trade INSERT — Rule 9).
//   Invariants: pure, synchronous, never throws; exposure uses
//           positionSizeUSD when present, falls back to quantity*entry,
//           else counts the position with 0 exposure (counted, not dropped).
'use strict';

function buildAccountSnapshot(positions) {
    try {
        let records;
        if (positions instanceof Map) records = [...positions.values()];
        else if (Array.isArray(positions)) records = positions;
        else return null;
        const symbols = [];
        let exposure = 0;
        for (const p of records) {
            if (!p || typeof p !== 'object') continue;
            symbols.push(p.symbol || p.instrument || '?');
            const usd = parseFloat(p.positionSizeUSD ?? p.position_size_usd
                ?? (p.quantity != null && p.entry != null ? p.quantity * p.entry : 0));
            if (Number.isFinite(usd)) exposure += Math.abs(usd);
        }
        return {
            ts: new Date().toISOString(),
            openPositions: symbols.length,
            symbols,
            exposureUsd: Math.round(exposure * 100) / 100,
        };
    } catch (e) {
        // Never let snapshot construction interfere with trade persistence.
        console.warn(`[account-snapshot] build failed (ignored): ${e.message}`);
        return null;
    }
}

module.exports = { buildAccountSnapshot };
