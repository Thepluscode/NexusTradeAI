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
export interface EvaluateParams {
    symbol: string;
    price: number;
    direction?: "long" | "short";
    asset_class?: "stock" | "forex" | "crypto";
    rsi?: number;
    momentum_pct?: number;
    volume_ratio?: number;
    regime?: string;
    macd_histogram?: number;
    atr_pct?: number;
    vwap?: number;
    trend_strength?: number;
    stop_loss?: number;
    take_profit?: number;
    tier?: "tier1" | "tier2" | "tier3";
}
export interface EvaluationResult {
    should_enter: boolean;
    confidence: number;
    direction: string;
    reason: string;
    risk_flags: string[];
    position_size_multiplier: number;
    market_regime: string | null;
    evaluation_id: string | null;
    latency_ms: number;
}
export interface NexusTradeAIOptions {
    baseUrl?: string;
    timeout?: number;
}
export declare class NexusTradeAI {
    private apiKey;
    private baseUrl;
    private timeout;
    constructor(apiKey: string, opts?: NexusTradeAIOptions);
    /**
     * Evaluate a trade signal and get AI GO/NO-GO decision.
     *
     * @param params - Trade signal parameters (symbol and price required)
     * @returns AI evaluation with should_enter, confidence, reason, risk_flags
     */
    evaluate(params: EvaluateParams): Promise<EvaluationResult>;
}
export default NexusTradeAI;
