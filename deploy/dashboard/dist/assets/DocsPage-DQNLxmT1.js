import{e as A,j as e,r as k,h as m,T as t,P as j,t as v,l as a,D as x,I as w}from"./index-BYYqR0SS.js";import{T as P,a as h}from"./Tabs-C-8LNROO.js";import{S as z}from"./Security-BXJcycy4.js";import{T as g,a as y,b as f,c as l,d as s,e as b}from"./TableRow-CUJDRgj2.js";import{S as O}from"./Speed-jeruOQ3i.js";import{C as T}from"./Code-DyJY40Hl.js";import{C as R,S as N}from"./ContentCopy-CVFY-zon.js";const _=A(e.jsx("path",{d:"m14 12-2 2-2-2 2-2zm-2-6 2.12 2.12 2.5-2.5L12 1 7.38 5.62l2.5 2.5zm-6 6 2.12-2.12-2.5-2.5L1 12l4.62 4.62 2.5-2.5zm12 0-2.12 2.12 2.5 2.5L23 12l-4.62-4.62-2.5 2.5zm-6 6-2.12-2.12-2.5 2.5L12 23l4.62-4.62-2.5-2.5z"}),"Api"),S=A(e.jsx("path",{d:"M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z"}),"Warning"),p="https://nexus-strategy-bridge-production.up.railway.app";function n({code:r,language:o="bash"}){const[c,u]=k.useState(!1),I=()=>{navigator.clipboard.writeText(r),u(!0),setTimeout(()=>u(!1),2e3)};return e.jsxs(j,{sx:{position:"relative",bgcolor:"rgba(0,0,0,0.4)",borderRadius:2,border:"1px solid rgba(255,255,255,0.06)",overflow:"hidden"},children:[e.jsxs(m,{sx:{display:"flex",justifyContent:"space-between",alignItems:"center",px:2,py:.75,bgcolor:"rgba(255,255,255,0.03)",borderBottom:"1px solid rgba(255,255,255,0.06)"},children:[e.jsx(t,{variant:"caption",sx:{color:"text.secondary",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"},children:o}),e.jsx(w,{size:"small",onClick:I,sx:{color:"text.secondary"},children:e.jsx(R,{sx:{fontSize:14}})})]}),e.jsx(m,{component:"pre",sx:{m:0,p:2,overflowX:"auto",fontSize:"0.8rem",fontFamily:'"JetBrains Mono", "Fira Code", monospace',lineHeight:1.6,color:"#e6edf3"},children:r}),e.jsx(N,{open:c,autoHideDuration:1500,message:"Copied",onClose:()=>u(!1)})]})}function i({name:r,type:o,required:c,desc:u}){return e.jsxs(l,{children:[e.jsx(s,{children:e.jsx(t,{variant:"body2",sx:{fontFamily:"monospace",fontWeight:600,color:"#e6edf3"},children:r})}),e.jsx(s,{children:e.jsx(a,{label:o,size:"small",sx:{fontSize:"0.7rem",fontWeight:600,bgcolor:"rgba(59,130,246,0.1)",color:"#60a5fa"}})}),e.jsx(s,{children:c?e.jsx(a,{label:"Required",size:"small",sx:{fontSize:"0.65rem",fontWeight:700,bgcolor:"rgba(239,68,68,0.1)",color:"#f87171"}}):e.jsx(a,{label:"Optional",size:"small",sx:{fontSize:"0.65rem",fontWeight:700,bgcolor:"rgba(107,114,128,0.15)",color:"#9ca3af"}})}),e.jsx(s,{children:e.jsx(t,{variant:"body2",color:"text.secondary",children:u})})]})}function d({icon:r,title:o,children:c}){return e.jsxs(j,{sx:{p:3,mb:3},children:[e.jsxs(m,{sx:{display:"flex",alignItems:"center",gap:1,mb:2.5},children:[r,e.jsx(t,{variant:"h6",fontWeight:700,children:o})]}),c]})}function C(){return e.jsxs(e.Fragment,{children:[e.jsxs(d,{icon:e.jsx(_,{sx:{color:"#3b82f6"}}),title:"Introduction",children:[e.jsx(t,{variant:"body1",sx:{mb:2,lineHeight:1.8},children:"The NexusTradeAI API gives you programmatic access to our AI-powered trade signal evaluation engine. Send a proposed trade with market indicators and receive a GO/NO-GO decision with confidence score, reasoning, and risk flags — powered by the same multi-agent AI pipeline our bots use."}),e.jsx(m,{sx:{display:"grid",gridTemplateColumns:{xs:"1fr",md:"repeat(3, 1fr)"},gap:2},children:[{label:"Base URL",value:p,color:"#3b82f6"},{label:"Auth",value:"API Key via X-API-Key header",color:"#8b5cf6"},{label:"Format",value:"JSON request & response",color:"#10b981"}].map(r=>e.jsxs(j,{sx:{p:2,border:`1px solid ${v(r.color,.2)}`,bgcolor:v(r.color,.04)},children:[e.jsx(t,{variant:"caption",color:"text.secondary",fontWeight:600,children:r.label}),e.jsx(t,{variant:"body2",fontWeight:600,sx:{mt:.5,fontFamily:"monospace",fontSize:"0.78rem"},children:r.value})]},r.label))})]}),e.jsxs(d,{icon:e.jsx(z,{sx:{color:"#8b5cf6"}}),title:"Authentication",children:[e.jsxs(t,{variant:"body2",sx:{mb:2,lineHeight:1.8},children:["All API requests require an API key passed in the ",e.jsx("code",{children:"X-API-Key"})," header. Keys are generated from the API Access page and follow the format ",e.jsx("code",{children:"ntai_live_"})," + 32 hex characters. Keys are SHA-256 hashed before storage — the raw key is only shown once at creation."]}),e.jsx(n,{language:"bash",code:`curl -H "X-API-Key: ntai_live_your_key_here" \\
  ${p}/api/v1/evaluate`}),e.jsxs(m,{sx:{mt:2,display:"flex",gap:2,flexWrap:"wrap"},children:[e.jsx(a,{icon:e.jsx(S,{sx:{fontSize:14}}),label:"Never expose keys in client-side code",size:"small",color:"warning",variant:"outlined"}),e.jsx(a,{label:"Keys can be revoked instantly",size:"small",variant:"outlined"}),e.jsx(a,{label:"One key per environment recommended",size:"small",variant:"outlined"})]})]}),e.jsxs(d,{icon:e.jsx(O,{sx:{color:"#f59e0b"}}),title:"Rate Limits",children:[e.jsx(t,{variant:"body2",sx:{mb:2},children:"Rate limits are enforced per API key on a monthly billing cycle. Limits reset on the 1st of each month."}),e.jsx(g,{children:e.jsxs(y,{size:"small",children:[e.jsx(f,{children:e.jsxs(l,{children:[e.jsx(s,{children:"Tier"}),e.jsx(s,{align:"right",children:"Monthly Limit"}),e.jsx(s,{align:"right",children:"Price"}),e.jsx(s,{children:"Best For"})]})}),e.jsxs(b,{children:[e.jsxs(l,{children:[e.jsx(s,{children:e.jsx(a,{label:"FREE",size:"small",sx:{bgcolor:"rgba(107,114,128,0.15)",color:"#9ca3af",fontWeight:700,fontSize:"0.7rem"}})}),e.jsx(s,{align:"right",children:"100"}),e.jsx(s,{align:"right",children:"$0"}),e.jsx(s,{children:e.jsx(t,{variant:"body2",color:"text.secondary",children:"Testing & prototyping"})})]}),e.jsxs(l,{children:[e.jsx(s,{children:e.jsx(a,{label:"PRO",size:"small",sx:{bgcolor:"rgba(59,130,246,0.15)",color:"#60a5fa",fontWeight:700,fontSize:"0.7rem"}})}),e.jsx(s,{align:"right",children:"5,000"}),e.jsx(s,{align:"right",children:"$49/mo"}),e.jsx(s,{children:e.jsx(t,{variant:"body2",color:"text.secondary",children:"Active trading bots"})})]}),e.jsxs(l,{children:[e.jsx(s,{children:e.jsx(a,{label:"ENTERPRISE",size:"small",sx:{bgcolor:"rgba(139,92,246,0.15)",color:"#a78bfa",fontWeight:700,fontSize:"0.7rem"}})}),e.jsx(s,{align:"right",children:"Unlimited"}),e.jsx(s,{align:"right",children:"$499/mo"}),e.jsx(s,{children:e.jsx(t,{variant:"body2",color:"text.secondary",children:"Hedge funds & institutions"})})]})]})]})}),e.jsxs(t,{variant:"body2",color:"text.secondary",sx:{mt:2},children:["When rate limited, the API returns ",e.jsx("code",{children:"429 Too Many Requests"})," with a message indicating your limit."]})]})]})}function W(){return e.jsxs(e.Fragment,{children:[e.jsxs(d,{icon:e.jsx(_,{sx:{color:"#10b981"}}),title:"POST /api/v1/evaluate",children:[e.jsxs(m,{sx:{display:"flex",alignItems:"center",gap:1,mb:2},children:[e.jsx(a,{label:"POST",size:"small",sx:{bgcolor:"rgba(16,185,129,0.15)",color:"#34d399",fontWeight:700}}),e.jsx(t,{variant:"body2",sx:{fontFamily:"monospace"},children:"/api/v1/evaluate"})]}),e.jsx(t,{variant:"body2",sx:{mb:2,lineHeight:1.8},children:"Submit a trade signal for AI evaluation. The multi-agent pipeline analyzes your signal with market regime detection, risk assessment, and pattern matching from historical trades. Returns a structured GO/NO-GO decision."}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1,mt:3},children:"Request Headers"}),e.jsx(g,{sx:{mb:3},children:e.jsxs(y,{size:"small",children:[e.jsx(f,{children:e.jsxs(l,{children:[e.jsx(s,{children:"Header"}),e.jsx(s,{children:"Type"}),e.jsx(s,{children:"Required"}),e.jsx(s,{children:"Description"})]})}),e.jsxs(b,{children:[e.jsx(i,{name:"X-API-Key",type:"string",required:!0,desc:"Your API key (ntai_live_...)"}),e.jsx(i,{name:"Content-Type",type:"string",required:!0,desc:"application/json"})]})]})}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Request Body"}),e.jsx(g,{sx:{mb:3},children:e.jsxs(y,{size:"small",children:[e.jsx(f,{children:e.jsxs(l,{children:[e.jsx(s,{children:"Field"}),e.jsx(s,{children:"Type"}),e.jsx(s,{children:"Required"}),e.jsx(s,{children:"Description"})]})}),e.jsxs(b,{children:[e.jsx(i,{name:"symbol",type:"string",required:!0,desc:"Ticker symbol (AAPL, EUR_USD, BTC_USD)"}),e.jsx(i,{name:"price",type:"float",required:!0,desc:"Current market price (must be > 0)"}),e.jsx(i,{name:"direction",type:"string",desc:'"long" or "short" (default: "long")'}),e.jsx(i,{name:"asset_class",type:"string",desc:'"stock", "forex", or "crypto" (default: "stock")'}),e.jsx(i,{name:"rsi",type:"float",desc:"Relative Strength Index (0-100)"}),e.jsx(i,{name:"momentum_pct",type:"float",desc:"Price change % (e.g. 2.5 = +2.5%)"}),e.jsx(i,{name:"volume_ratio",type:"float",desc:"Volume relative to 20-day average"}),e.jsx(i,{name:"regime",type:"string",desc:"Market regime: trending_up, ranging, volatile, etc."}),e.jsx(i,{name:"macd_histogram",type:"float",desc:"MACD histogram value"}),e.jsx(i,{name:"atr_pct",type:"float",desc:"ATR as % of price"}),e.jsx(i,{name:"vwap",type:"float",desc:"Volume-weighted average price"}),e.jsx(i,{name:"trend_strength",type:"float",desc:"Trend strength (0.0 - 1.0)"}),e.jsx(i,{name:"stop_loss",type:"float",desc:"Proposed stop loss price"}),e.jsx(i,{name:"take_profit",type:"float",desc:"Proposed take profit price"}),e.jsx(i,{name:"tier",type:"string",desc:"Signal tier: tier1 (conservative) to tier3 (aggressive)"})]})]})}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Example Request"}),e.jsx(n,{language:"bash",code:`curl -X POST ${p}/api/v1/evaluate \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ntai_live_your_key_here" \\
  -d '{
    "symbol": "AAPL",
    "direction": "long",
    "asset_class": "stock",
    "price": 185.50,
    "rsi": 58.3,
    "momentum_pct": 2.8,
    "volume_ratio": 1.5,
    "regime": "trending_up",
    "atr_pct": 1.2,
    "trend_strength": 0.72
  }'`}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1,mt:3},children:"Response Body"}),e.jsx(g,{sx:{mb:3},children:e.jsxs(y,{size:"small",children:[e.jsx(f,{children:e.jsxs(l,{children:[e.jsx(s,{children:"Field"}),e.jsx(s,{children:"Type"}),e.jsx(s,{children:"Description"})]})}),e.jsx(b,{children:[["should_enter","boolean","GO (true) or NO-GO (false) decision"],["confidence","float","Confidence score (0.000 - 1.000)"],["direction","string","Echoed direction from request"],["reason","string","AI reasoning for the decision (2-4 sentences)"],["risk_flags","string[]",'Array of identified risks (e.g. "high_volatility", "low_volume")'],["position_size_multiplier","float","Suggested position size adjustment (0.25 - 2.0)"],["market_regime","string","Detected market regime"],["evaluation_id","string","Unique ID for this evaluation (for support)"],["latency_ms","float","Server-side processing time in milliseconds"]].map(([r,o,c])=>e.jsxs(l,{children:[e.jsx(s,{children:e.jsx(t,{variant:"body2",sx:{fontFamily:"monospace",fontWeight:600,color:"#e6edf3"},children:r})}),e.jsx(s,{children:e.jsx(a,{label:o,size:"small",sx:{fontSize:"0.7rem",fontWeight:600,bgcolor:"rgba(16,185,129,0.1)",color:"#34d399"}})}),e.jsx(s,{children:e.jsx(t,{variant:"body2",color:"text.secondary",children:c})})]},r))})]})}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Example Response"}),e.jsx(n,{language:"json",code:`{
  "should_enter": true,
  "confidence": 0.752,
  "direction": "long",
  "reason": "AAPL shows strong upward momentum with RSI at healthy levels. Volume confirmation and trending regime support entry. Pattern matches historical winners in this regime.",
  "risk_flags": ["earnings_proximity"],
  "position_size_multiplier": 1.25,
  "market_regime": "trending_up",
  "evaluation_id": "eval_1_1710234567890",
  "latency_ms": 8241.3
}`})]}),e.jsx(d,{icon:e.jsx(S,{sx:{color:"#ef4444"}}),title:"Error Codes",children:e.jsx(g,{children:e.jsxs(y,{size:"small",children:[e.jsx(f,{children:e.jsxs(l,{children:[e.jsx(s,{children:"Status"}),e.jsx(s,{children:"Meaning"}),e.jsx(s,{children:"Action"})]})}),e.jsx(b,{children:[["401","Invalid or revoked API key","Check your key or generate a new one"],["422","Validation error (bad request body)","Check field types and constraints"],["429","Monthly rate limit exceeded","Upgrade your plan or wait until next month"],["502","AI evaluation failed","Retry after 5 seconds; contact support if persistent"],["503","Service unavailable","Strategy engine is starting up; retry in 30 seconds"]].map(([r,o,c])=>e.jsxs(l,{children:[e.jsx(s,{children:e.jsx(a,{label:r,size:"small",sx:{fontWeight:700,fontSize:"0.75rem",fontFamily:"monospace",bgcolor:r==="401"||r==="422"?"rgba(239,68,68,0.1)":r==="429"?"rgba(245,158,11,0.1)":"rgba(107,114,128,0.1)",color:r==="401"||r==="422"?"#f87171":r==="429"?"#fbbf24":"#9ca3af"}})}),e.jsx(s,{children:e.jsx(t,{variant:"body2",fontWeight:600,children:o})}),e.jsx(s,{children:e.jsx(t,{variant:"body2",color:"text.secondary",children:c})})]},r))})]})})})]})}function E(){return e.jsx(e.Fragment,{children:e.jsxs(d,{icon:e.jsx(T,{sx:{color:"#3572A5"}}),title:"Python SDK",children:[e.jsx(t,{variant:"body2",sx:{mb:2,lineHeight:1.8},children:"Use the lightweight Python wrapper below to integrate NexusTradeAI into your trading bot. Copy the class into your project or install as a module."}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Install Dependencies"}),e.jsx(n,{language:"bash",code:"pip install httpx  # async HTTP client (or use requests for sync)"}),e.jsx(x,{sx:{my:3}}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"nexustrade.py"}),e.jsx(n,{language:"python",code:`"""NexusTradeAI Python SDK — lightweight wrapper for the evaluate API."""

import httpx
from dataclasses import dataclass
from typing import Optional, List


BASE_URL = "${p}"


@dataclass
class EvaluationResult:
    should_enter: bool
    confidence: float
    direction: str
    reason: str
    risk_flags: List[str]
    position_size_multiplier: float
    market_regime: Optional[str]
    evaluation_id: Optional[str]
    latency_ms: float


class NexusTradeAI:
    """Async client for the NexusTradeAI evaluate API."""

    def __init__(self, api_key: str, base_url: str = BASE_URL, timeout: float = 30.0):
        self.api_key = api_key
        self.client = httpx.AsyncClient(
            base_url=base_url,
            headers={"X-API-Key": api_key, "Content-Type": "application/json"},
            timeout=timeout,
        )

    async def evaluate(
        self,
        symbol: str,
        price: float,
        direction: str = "long",
        asset_class: str = "stock",
        rsi: Optional[float] = None,
        momentum_pct: Optional[float] = None,
        volume_ratio: Optional[float] = None,
        regime: Optional[str] = None,
        atr_pct: Optional[float] = None,
        trend_strength: Optional[float] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        tier: str = "tier1",
    ) -> EvaluationResult:
        """Evaluate a trade signal and get AI GO/NO-GO decision."""
        payload = {
            "symbol": symbol,
            "price": price,
            "direction": direction,
            "asset_class": asset_class,
            "tier": tier,
        }
        # Only send optional fields if provided
        for key, val in {
            "rsi": rsi, "momentum_pct": momentum_pct,
            "volume_ratio": volume_ratio, "regime": regime,
            "atr_pct": atr_pct, "trend_strength": trend_strength,
            "stop_loss": stop_loss, "take_profit": take_profit,
        }.items():
            if val is not None:
                payload[key] = val

        resp = await self.client.post("/api/v1/evaluate", json=payload)
        resp.raise_for_status()
        data = resp.json()

        return EvaluationResult(
            should_enter=data["should_enter"],
            confidence=data["confidence"],
            direction=data["direction"],
            reason=data["reason"],
            risk_flags=data.get("risk_flags", []),
            position_size_multiplier=data.get("position_size_multiplier", 1.0),
            market_regime=data.get("market_regime"),
            evaluation_id=data.get("evaluation_id"),
            latency_ms=data.get("latency_ms", 0),
        )

    async def close(self):
        await self.client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()`}),e.jsx(x,{sx:{my:3}}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Usage Example"}),e.jsx(n,{language:"python",code:`import asyncio
from nexustrade import NexusTradeAI


async def main():
    async with NexusTradeAI(api_key="ntai_live_your_key_here") as nexus:

        # Evaluate a stock trade
        result = await nexus.evaluate(
            symbol="NVDA",
            price=875.50,
            direction="long",
            asset_class="stock",
            rsi=62.4,
            momentum_pct=3.2,
            volume_ratio=1.8,
            regime="trending_up",
        )

        if result.should_enter and result.confidence > 0.6:
            size = base_position_size * result.position_size_multiplier
            print(f"GO: {result.reason}")
            print(f"Confidence: {result.confidence:.1%}")
            print(f"Risk flags: {result.risk_flags}")
            # ... execute your trade ...
        else:
            print(f"NO-GO: {result.reason}")


asyncio.run(main())`}),e.jsx(x,{sx:{my:3}}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Sync Version (requests)"}),e.jsx(n,{language:"python",code:`import requests

API_KEY = "ntai_live_your_key_here"

resp = requests.post(
    "${p}/api/v1/evaluate",
    headers={"X-API-Key": API_KEY},
    json={
        "symbol": "AAPL",
        "price": 185.50,
        "direction": "long",
        "asset_class": "stock",
        "rsi": 58.3,
        "momentum_pct": 2.8,
    },
    timeout=30,
)

data = resp.json()
print(f"Decision: {'GO' if data['should_enter'] else 'NO-GO'}")
print(f"Confidence: {data['confidence']:.1%}")
print(f"Reason: {data['reason']}")`})]})})}function q(){return e.jsx(e.Fragment,{children:e.jsxs(d,{icon:e.jsx(T,{sx:{color:"#3178c6"}}),title:"TypeScript / JavaScript SDK",children:[e.jsx(t,{variant:"body2",sx:{mb:2,lineHeight:1.8},children:"Typed client for Node.js and browser environments. Zero dependencies beyond the built-in fetch API."}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"nexustrade.ts"}),e.jsx(n,{language:"typescript",code:`/**
 * NexusTradeAI TypeScript SDK
 * Typed client for the AI trade signal evaluation API.
 */

const BASE_URL = "${p}";

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

export class NexusTradeAI {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(apiKey: string, opts?: { baseUrl?: string; timeout?: number }) {
    this.apiKey = apiKey;
    this.baseUrl = opts?.baseUrl ?? BASE_URL;
    this.timeout = opts?.timeout ?? 30000;
  }

  async evaluate(params: EvaluateParams): Promise<EvaluationResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const resp = await fetch(\`\${this.baseUrl}/api/v1/evaluate\`, {
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
        throw new Error(\`NexusTradeAI [\${resp.status}]: \${err.detail ?? JSON.stringify(err)}\`);
      }

      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }
}`}),e.jsx(x,{sx:{my:3}}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Usage Example"}),e.jsx(n,{language:"typescript",code:`import { NexusTradeAI } from "./nexustrade";

const nexus = new NexusTradeAI("ntai_live_your_key_here");

async function checkSignal() {
  const result = await nexus.evaluate({
    symbol: "BTC_USD",
    price: 67250.0,
    direction: "long",
    asset_class: "crypto",
    rsi: 55.2,
    momentum_pct: 4.1,
    volume_ratio: 2.3,
    regime: "trending_up",
  });

  console.log(\`Decision: \${result.should_enter ? "GO" : "NO-GO"}\`);
  console.log(\`Confidence: \${(result.confidence * 100).toFixed(1)}%\`);
  console.log(\`Reason: \${result.reason}\`);
  console.log(\`Risk flags: \${result.risk_flags.join(", ") || "none"}\`);

  if (result.should_enter && result.confidence > 0.6) {
    const adjustedSize = baseSize * result.position_size_multiplier;
    // ... execute trade with adjustedSize ...
  }
}

checkSignal();`}),e.jsx(x,{sx:{my:3}}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"Node.js (CommonJS)"}),e.jsx(n,{language:"javascript",code:`const https = require("https");

const API_KEY = "ntai_live_your_key_here";

const payload = JSON.stringify({
  symbol: "EUR_USD",
  price: 1.0892,
  direction: "long",
  asset_class: "forex",
  rsi: 45.7,
  momentum_pct: 0.3,
});

const req = https.request(
  "${p}/api/v1/evaluate",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
      "Content-Length": Buffer.byteLength(payload),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      const result = JSON.parse(data);
      console.log(result.should_enter ? "GO" : "NO-GO", result.confidence);
    });
  }
);

req.write(payload);
req.end();`})]})})}function K(){return e.jsx(e.Fragment,{children:e.jsxs(d,{icon:e.jsx(_,{sx:{color:"#f59e0b"}}),title:"Integration Patterns",children:[e.jsx(t,{variant:"body2",sx:{mb:3,lineHeight:1.8},children:"Common patterns for integrating NexusTradeAI into your trading workflow."}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"1. Pre-Trade Gate (Recommended)"}),e.jsx(t,{variant:"body2",color:"text.secondary",sx:{mb:1},children:"Use NexusTradeAI as a final check before executing trades. Your strategy generates signals, and the AI confirms or rejects them based on multi-factor analysis."}),e.jsx(n,{language:"python",code:`# Your existing strategy generates a signal
signal = my_strategy.scan()  # e.g. {"symbol": "TSLA", "direction": "long"}

# AI gate: confirm or reject
result = await nexus.evaluate(
    symbol=signal["symbol"],
    price=get_current_price(signal["symbol"]),
    direction=signal["direction"],
    rsi=get_rsi(signal["symbol"]),
    momentum_pct=get_momentum(signal["symbol"]),
)

# Only trade if AI agrees with high confidence
if result.should_enter and result.confidence > 0.65:
    execute_trade(
        symbol=signal["symbol"],
        size=base_size * result.position_size_multiplier,
    )
else:
    log.info(f"AI rejected {signal['symbol']}: {result.reason}")`}),e.jsx(x,{sx:{my:3}}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"2. Portfolio Scanner"}),e.jsx(t,{variant:"body2",color:"text.secondary",sx:{mb:1},children:"Evaluate multiple symbols in parallel to find the best opportunities."}),e.jsx(n,{language:"python",code:`import asyncio

symbols = ["AAPL", "NVDA", "TSLA", "MSFT", "GOOG"]

async def scan_portfolio():
    tasks = [
        nexus.evaluate(
            symbol=sym,
            price=prices[sym],
            rsi=indicators[sym]["rsi"],
            momentum_pct=indicators[sym]["momentum"],
            volume_ratio=indicators[sym]["volume_ratio"],
        )
        for sym in symbols
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Rank by confidence, filter for GO signals
    opportunities = [
        (sym, r) for sym, r in zip(symbols, results)
        if not isinstance(r, Exception) and r.should_enter
    ]
    opportunities.sort(key=lambda x: x[1].confidence, reverse=True)

    for sym, r in opportunities[:3]:  # Top 3
        print(f"{sym}: confidence={r.confidence:.1%}, regime={r.market_regime}")`}),e.jsx(x,{sx:{my:3}}),e.jsx(t,{variant:"subtitle2",fontWeight:700,sx:{mb:1},children:"3. TradingView Webhook"}),e.jsx(t,{variant:"body2",color:"text.secondary",sx:{mb:1},children:"Connect TradingView alerts to NexusTradeAI for AI-enhanced signal confirmation."}),e.jsx(n,{language:"python",code:`from fastapi import FastAPI, Request

app = FastAPI()

@app.post("/webhook/tradingview")
async def tradingview_webhook(request: Request):
    alert = await request.json()  # TradingView sends JSON

    result = await nexus.evaluate(
        symbol=alert["ticker"],
        price=float(alert["close"]),
        direction="long" if alert["strategy"]["action"] == "buy" else "short",
        asset_class="stock",
        volume_ratio=float(alert.get("volume", 1.0)),
    )

    if result.should_enter and result.confidence > 0.6:
        # Forward to your broker
        await broker.place_order(
            symbol=alert["ticker"],
            side=alert["strategy"]["action"],
            qty=calculate_qty(result.position_size_multiplier),
        )
        return {"status": "executed", "confidence": result.confidence}

    return {"status": "rejected", "reason": result.reason}`})]})})}function $(){const[r,o]=k.useState(0);return e.jsxs(m,{sx:{p:{xs:2,md:3},maxWidth:1200,mx:"auto"},children:[e.jsxs(m,{sx:{mb:3},children:[e.jsx(t,{variant:"h5",fontWeight:700,children:"API Documentation"}),e.jsx(t,{variant:"body2",color:"text.secondary",children:"Everything you need to integrate AI trade signal evaluation into your workflow"})]}),e.jsx(j,{sx:{mb:3},children:e.jsxs(P,{value:r,onChange:(c,u)=>o(u),variant:"scrollable",scrollButtons:"auto",sx:{"& .MuiTab-root":{textTransform:"none",fontWeight:600,fontSize:"0.875rem",minHeight:48}},children:[e.jsx(h,{label:"Overview"}),e.jsx(h,{label:"Endpoints"}),e.jsx(h,{label:"Python SDK"}),e.jsx(h,{label:"TypeScript SDK"}),e.jsx(h,{label:"Integration Patterns"})]})}),r===0&&e.jsx(C,{}),r===1&&e.jsx(W,{}),r===2&&e.jsx(E,{}),r===3&&e.jsx(q,{}),r===4&&e.jsx(K,{})]})}export{$ as default};
