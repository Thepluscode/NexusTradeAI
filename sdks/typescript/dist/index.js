"use strict";
/**
 * NexusTradeAI TypeScript SDK
 * AI-powered trade signal evaluation API client.
 *
 * @example
 * ```ts
 * import { NexusTradeAI } from "nexustrade-ai";
 *
 * const nexus = new NexusTradeAI("ntai_live_your_key");
 * const result = await nexus.evaluate({ symbol: "AAPL", price: 185.50 });
 *
 * if (result.should_enter) {
 *   console.log(`GO (${(result.confidence * 100).toFixed(0)}%): ${result.reason}`);
 * }
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NexusTradeAI = void 0;
const DEFAULT_BASE_URL = "https://nexus-strategy-bridge-production.up.railway.app";
class NexusTradeAI {
    constructor(apiKey, opts) {
        this.apiKey = apiKey;
        this.baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
        this.timeout = opts?.timeout ?? 30000;
    }
    /**
     * Evaluate a trade signal and get AI GO/NO-GO decision.
     *
     * @param params - Trade signal parameters (symbol and price required)
     * @returns AI evaluation with should_enter, confidence, reason, risk_flags
     */
    async evaluate(params) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
            const resp = await fetch(`${this.baseUrl}/api/v1/evaluate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": this.apiKey,
                },
                body: JSON.stringify({
                    direction: "long",
                    asset_class: "stock",
                    tier: "tier1",
                    ...params,
                }),
                signal: controller.signal,
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: resp.statusText }));
                throw new Error(`NexusTradeAI [${resp.status}]: ${err.detail ?? JSON.stringify(err)}`);
            }
            return await resp.json();
        }
        finally {
            clearTimeout(timer);
        }
    }
}
exports.NexusTradeAI = NexusTradeAI;
exports.default = NexusTradeAI;
