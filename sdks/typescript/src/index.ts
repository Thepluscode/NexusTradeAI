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

const DEFAULT_BASE_URL = "https://nexus-strategy-bridge-production.up.railway.app";

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

export class NexusTradeAI {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(apiKey: string, opts?: NexusTradeAIOptions) {
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
  async evaluate(params: EvaluateParams): Promise<EvaluationResult> {
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
        throw new Error(
          `NexusTradeAI [${resp.status}]: ${err.detail ?? JSON.stringify(err)}`
        );
      }

      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }
}

export default NexusTradeAI;
