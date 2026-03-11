import { useState } from 'react';
import {
    Box, Paper, Typography, Tabs, Tab, Chip, Divider, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Snackbar, alpha,
} from '@mui/material';
import { ContentCopy, Api, Code, Security, Speed, Warning } from '@mui/icons-material';

const BASE_URL = 'https://nexus-strategy-bridge-production.up.railway.app';

// ── Code block component ─────────────────────────────────────────────
function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <Paper sx={{
            position: 'relative', bgcolor: 'rgba(0,0,0,0.4)', borderRadius: 2,
            border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden',
        }}>
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                px: 2, py: 0.75, bgcolor: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {language}
                </Typography>
                <IconButton size="small" onClick={handleCopy} sx={{ color: 'text.secondary' }}>
                    <ContentCopy sx={{ fontSize: 14 }} />
                </IconButton>
            </Box>
            <Box component="pre" sx={{
                m: 0, p: 2, overflowX: 'auto', fontSize: '0.8rem',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                lineHeight: 1.6, color: '#e6edf3',
            }}>
                {code}
            </Box>
            <Snackbar open={copied} autoHideDuration={1500} message="Copied" onClose={() => setCopied(false)} />
        </Paper>
    );
}

// ── Param row ────────────────────────────────────────────────────────
function ParamRow({ name, type, required, desc }: { name: string; type: string; required?: boolean; desc: string }) {
    return (
        <TableRow>
            <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#e6edf3' }}>
                    {name}
                </Typography>
            </TableCell>
            <TableCell>
                <Chip label={type} size="small" sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: 'rgba(59,130,246,0.1)', color: '#60a5fa' }} />
            </TableCell>
            <TableCell>
                {required
                    ? <Chip label="Required" size="small" sx={{ fontSize: '0.65rem', fontWeight: 700, bgcolor: 'rgba(239,68,68,0.1)', color: '#f87171' }} />
                    : <Chip label="Optional" size="small" sx={{ fontSize: '0.65rem', fontWeight: 700, bgcolor: 'rgba(107,114,128,0.15)', color: '#9ca3af' }} />
                }
            </TableCell>
            <TableCell>
                <Typography variant="body2" color="text.secondary">{desc}</Typography>
            </TableCell>
        </TableRow>
    );
}

// ── Section wrapper ──────────────────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                {icon}
                <Typography variant="h6" fontWeight={700}>{title}</Typography>
            </Box>
            {children}
        </Paper>
    );
}

// ── Tab panels ───────────────────────────────────────────────────────

function OverviewTab() {
    return (
        <>
            <Section icon={<Api sx={{ color: '#3b82f6' }} />} title="Introduction">
                <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.8 }}>
                    The NexusTradeAI API gives you programmatic access to our AI-powered trade signal evaluation engine.
                    Send a proposed trade with market indicators and receive a GO/NO-GO decision with confidence score,
                    reasoning, and risk flags — powered by the same multi-agent AI pipeline our bots use.
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
                    {[
                        { label: 'Base URL', value: BASE_URL, color: '#3b82f6' },
                        { label: 'Auth', value: 'API Key via X-API-Key header', color: '#8b5cf6' },
                        { label: 'Format', value: 'JSON request & response', color: '#10b981' },
                    ].map(item => (
                        <Paper key={item.label} sx={{ p: 2, border: `1px solid ${alpha(item.color, 0.2)}`, bgcolor: alpha(item.color, 0.04) }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>{item.label}</Typography>
                            <Typography variant="body2" fontWeight={600} sx={{ mt: 0.5, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                {item.value}
                            </Typography>
                        </Paper>
                    ))}
                </Box>
            </Section>

            <Section icon={<Security sx={{ color: '#8b5cf6' }} />} title="Authentication">
                <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.8 }}>
                    All API requests require an API key passed in the <code>X-API-Key</code> header.
                    Keys are generated from the API Access page and follow the format <code>ntai_live_</code> + 32 hex characters.
                    Keys are SHA-256 hashed before storage — the raw key is only shown once at creation.
                </Typography>
                <CodeBlock language="bash" code={`curl -H "X-API-Key: ntai_live_your_key_here" \\
  ${BASE_URL}/api/v1/evaluate`} />
                <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Chip icon={<Warning sx={{ fontSize: 14 }} />} label="Never expose keys in client-side code" size="small" color="warning" variant="outlined" />
                    <Chip label="Keys can be revoked instantly" size="small" variant="outlined" />
                    <Chip label="One key per environment recommended" size="small" variant="outlined" />
                </Box>
            </Section>

            <Section icon={<Speed sx={{ color: '#f59e0b' }} />} title="Rate Limits">
                <Typography variant="body2" sx={{ mb: 2 }}>
                    Rate limits are enforced per API key on a monthly billing cycle. Limits reset on the 1st of each month.
                </Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Tier</TableCell>
                                <TableCell align="right">Monthly Limit</TableCell>
                                <TableCell align="right">Price</TableCell>
                                <TableCell>Best For</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            <TableRow>
                                <TableCell><Chip label="FREE" size="small" sx={{ bgcolor: 'rgba(107,114,128,0.15)', color: '#9ca3af', fontWeight: 700, fontSize: '0.7rem' }} /></TableCell>
                                <TableCell align="right">100</TableCell>
                                <TableCell align="right">$0</TableCell>
                                <TableCell><Typography variant="body2" color="text.secondary">Testing & prototyping</Typography></TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell><Chip label="PRO" size="small" sx={{ bgcolor: 'rgba(59,130,246,0.15)', color: '#60a5fa', fontWeight: 700, fontSize: '0.7rem' }} /></TableCell>
                                <TableCell align="right">5,000</TableCell>
                                <TableCell align="right">$49/mo</TableCell>
                                <TableCell><Typography variant="body2" color="text.secondary">Active trading bots</Typography></TableCell>
                            </TableRow>
                            <TableRow>
                                <TableCell><Chip label="ENTERPRISE" size="small" sx={{ bgcolor: 'rgba(139,92,246,0.15)', color: '#a78bfa', fontWeight: 700, fontSize: '0.7rem' }} /></TableCell>
                                <TableCell align="right">Unlimited</TableCell>
                                <TableCell align="right">$499/mo</TableCell>
                                <TableCell><Typography variant="body2" color="text.secondary">Hedge funds & institutions</Typography></TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </TableContainer>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                    When rate limited, the API returns <code>429 Too Many Requests</code> with a message indicating your limit.
                </Typography>
            </Section>
        </>
    );
}

function EndpointsTab() {
    return (
        <>
            {/* POST /evaluate */}
            <Section icon={<Api sx={{ color: '#10b981' }} />} title="POST /api/v1/evaluate">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <Chip label="POST" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 700 }} />
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>/api/v1/evaluate</Typography>
                </Box>
                <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.8 }}>
                    Submit a trade signal for AI evaluation. The multi-agent pipeline analyzes your signal with market regime detection,
                    risk assessment, and pattern matching from historical trades. Returns a structured GO/NO-GO decision.
                </Typography>

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, mt: 3 }}>Request Headers</Typography>
                <TableContainer sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Header</TableCell><TableCell>Type</TableCell><TableCell>Required</TableCell><TableCell>Description</TableCell></TableRow></TableHead>
                        <TableBody>
                            <ParamRow name="X-API-Key" type="string" required desc="Your API key (ntai_live_...)" />
                            <ParamRow name="Content-Type" type="string" required desc="application/json" />
                        </TableBody>
                    </Table>
                </TableContainer>

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Request Body</Typography>
                <TableContainer sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Field</TableCell><TableCell>Type</TableCell><TableCell>Required</TableCell><TableCell>Description</TableCell></TableRow></TableHead>
                        <TableBody>
                            <ParamRow name="symbol" type="string" required desc="Ticker symbol (AAPL, EUR_USD, BTC_USD)" />
                            <ParamRow name="price" type="float" required desc="Current market price (must be > 0)" />
                            <ParamRow name="direction" type="string" desc={'"long" or "short" (default: "long")'} />
                            <ParamRow name="asset_class" type="string" desc={'"stock", "forex", or "crypto" (default: "stock")'} />
                            <ParamRow name="rsi" type="float" desc="Relative Strength Index (0-100)" />
                            <ParamRow name="momentum_pct" type="float" desc="Price change % (e.g. 2.5 = +2.5%)" />
                            <ParamRow name="volume_ratio" type="float" desc="Volume relative to 20-day average" />
                            <ParamRow name="regime" type="string" desc="Market regime: trending_up, ranging, volatile, etc." />
                            <ParamRow name="macd_histogram" type="float" desc="MACD histogram value" />
                            <ParamRow name="atr_pct" type="float" desc="ATR as % of price" />
                            <ParamRow name="vwap" type="float" desc="Volume-weighted average price" />
                            <ParamRow name="trend_strength" type="float" desc="Trend strength (0.0 - 1.0)" />
                            <ParamRow name="stop_loss" type="float" desc="Proposed stop loss price" />
                            <ParamRow name="take_profit" type="float" desc="Proposed take profit price" />
                            <ParamRow name="tier" type="string" desc="Signal tier: tier1 (conservative) to tier3 (aggressive)" />
                        </TableBody>
                    </Table>
                </TableContainer>

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Example Request</Typography>
                <CodeBlock language="bash" code={`curl -X POST ${BASE_URL}/api/v1/evaluate \\
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
  }'`} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, mt: 3 }}>Response Body</Typography>
                <TableContainer sx={{ mb: 3 }}>
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Field</TableCell><TableCell>Type</TableCell><TableCell>Description</TableCell></TableRow></TableHead>
                        <TableBody>
                            {[
                                ['should_enter', 'boolean', 'GO (true) or NO-GO (false) decision'],
                                ['confidence', 'float', 'Confidence score (0.000 - 1.000)'],
                                ['direction', 'string', 'Echoed direction from request'],
                                ['reason', 'string', 'AI reasoning for the decision (2-4 sentences)'],
                                ['risk_flags', 'string[]', 'Array of identified risks (e.g. "high_volatility", "low_volume")'],
                                ['position_size_multiplier', 'float', 'Suggested position size adjustment (0.25 - 2.0)'],
                                ['market_regime', 'string', 'Detected market regime'],
                                ['evaluation_id', 'string', 'Unique ID for this evaluation (for support)'],
                                ['latency_ms', 'float', 'Server-side processing time in milliseconds'],
                            ].map(([name, type, desc]) => (
                                <TableRow key={name}>
                                    <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#e6edf3' }}>{name}</Typography></TableCell>
                                    <TableCell><Chip label={type} size="small" sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: 'rgba(16,185,129,0.1)', color: '#34d399' }} /></TableCell>
                                    <TableCell><Typography variant="body2" color="text.secondary">{desc}</Typography></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Example Response</Typography>
                <CodeBlock language="json" code={`{
  "should_enter": true,
  "confidence": 0.752,
  "direction": "long",
  "reason": "AAPL shows strong upward momentum with RSI at healthy levels. Volume confirmation and trending regime support entry. Pattern matches historical winners in this regime.",
  "risk_flags": ["earnings_proximity"],
  "position_size_multiplier": 1.25,
  "market_regime": "trending_up",
  "evaluation_id": "eval_1_1710234567890",
  "latency_ms": 8241.3
}`} />
            </Section>

            {/* Error Codes */}
            <Section icon={<Warning sx={{ color: '#ef4444' }} />} title="Error Codes">
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Status</TableCell>
                                <TableCell>Meaning</TableCell>
                                <TableCell>Action</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {[
                                ['401', 'Invalid or revoked API key', 'Check your key or generate a new one'],
                                ['422', 'Validation error (bad request body)', 'Check field types and constraints'],
                                ['429', 'Monthly rate limit exceeded', 'Upgrade your plan or wait until next month'],
                                ['502', 'AI evaluation failed', 'Retry after 5 seconds; contact support if persistent'],
                                ['503', 'Service unavailable', 'Strategy engine is starting up; retry in 30 seconds'],
                            ].map(([code, meaning, action]) => (
                                <TableRow key={code}>
                                    <TableCell>
                                        <Chip
                                            label={code}
                                            size="small"
                                            sx={{
                                                fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace',
                                                bgcolor: code === '401' || code === '422' ? 'rgba(239,68,68,0.1)' : code === '429' ? 'rgba(245,158,11,0.1)' : 'rgba(107,114,128,0.1)',
                                                color: code === '401' || code === '422' ? '#f87171' : code === '429' ? '#fbbf24' : '#9ca3af',
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell><Typography variant="body2" fontWeight={600}>{meaning}</Typography></TableCell>
                                    <TableCell><Typography variant="body2" color="text.secondary">{action}</Typography></TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Section>
        </>
    );
}

function PythonSDKTab() {
    return (
        <>
            <Section icon={<Code sx={{ color: '#3572A5' }} />} title="Python SDK">
                <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.8 }}>
                    Use the lightweight Python wrapper below to integrate NexusTradeAI into your trading bot.
                    Copy the class into your project or install as a module.
                </Typography>

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Install Dependencies</Typography>
                <CodeBlock language="bash" code="pip install httpx  # async HTTP client (or use requests for sync)" />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>nexustrade.py</Typography>
                <CodeBlock language="python" code={`"""NexusTradeAI Python SDK — lightweight wrapper for the evaluate API."""

import httpx
from dataclasses import dataclass
from typing import Optional, List


BASE_URL = "${BASE_URL}"


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
        await self.close()`} />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Usage Example</Typography>
                <CodeBlock language="python" code={`import asyncio
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


asyncio.run(main())`} />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Sync Version (requests)</Typography>
                <CodeBlock language="python" code={`import requests

API_KEY = "ntai_live_your_key_here"

resp = requests.post(
    "${BASE_URL}/api/v1/evaluate",
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
print(f"Reason: {data['reason']}")`} />
            </Section>
        </>
    );
}

function TypeScriptSDKTab() {
    return (
        <>
            <Section icon={<Code sx={{ color: '#3178c6' }} />} title="TypeScript / JavaScript SDK">
                <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.8 }}>
                    Typed client for Node.js and browser environments. Zero dependencies beyond the built-in fetch API.
                </Typography>

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>nexustrade.ts</Typography>
                <CodeBlock language="typescript" code={`/**
 * NexusTradeAI TypeScript SDK
 * Typed client for the AI trade signal evaluation API.
 */

const BASE_URL = "${BASE_URL}";

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
}`} />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Usage Example</Typography>
                <CodeBlock language="typescript" code={`import { NexusTradeAI } from "./nexustrade";

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

checkSignal();`} />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Node.js (CommonJS)</Typography>
                <CodeBlock language="javascript" code={`const https = require("https");

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
  "${BASE_URL}/api/v1/evaluate",
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
req.end();`} />
            </Section>
        </>
    );
}

function WebhooksTab() {
    return (
        <>
            <Section icon={<Api sx={{ color: '#f59e0b' }} />} title="Integration Patterns">
                <Typography variant="body2" sx={{ mb: 3, lineHeight: 1.8 }}>
                    Common patterns for integrating NexusTradeAI into your trading workflow.
                </Typography>

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>1. Pre-Trade Gate (Recommended)</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Use NexusTradeAI as a final check before executing trades. Your strategy generates signals,
                    and the AI confirms or rejects them based on multi-factor analysis.
                </Typography>
                <CodeBlock language="python" code={`# Your existing strategy generates a signal
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
    log.info(f"AI rejected {signal['symbol']}: {result.reason}")`} />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>2. Portfolio Scanner</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Evaluate multiple symbols in parallel to find the best opportunities.
                </Typography>
                <CodeBlock language="python" code={`import asyncio

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
        print(f"{sym}: confidence={r.confidence:.1%}, regime={r.market_regime}")`} />

                <Divider sx={{ my: 3 }} />

                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>3. TradingView Webhook</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Connect TradingView alerts to NexusTradeAI for AI-enhanced signal confirmation.
                </Typography>
                <CodeBlock language="python" code={`from fastapi import FastAPI, Request

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

    return {"status": "rejected", "reason": result.reason}`} />
            </Section>
        </>
    );
}

// ── Main Page ────────────────────────────────────────────────────────

export default function DocsPage() {
    const [tab, setTab] = useState(0);

    return (
        <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="h5" fontWeight={700}>
                    API Documentation
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Everything you need to integrate AI trade signal evaluation into your workflow
                </Typography>
            </Box>

            <Paper sx={{ mb: 3 }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => setTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        '& .MuiTab-root': {
                            textTransform: 'none', fontWeight: 600, fontSize: '0.875rem',
                            minHeight: 48,
                        },
                    }}
                >
                    <Tab label="Overview" />
                    <Tab label="Endpoints" />
                    <Tab label="Python SDK" />
                    <Tab label="TypeScript SDK" />
                    <Tab label="Integration Patterns" />
                </Tabs>
            </Paper>

            {tab === 0 && <OverviewTab />}
            {tab === 1 && <EndpointsTab />}
            {tab === 2 && <PythonSDKTab />}
            {tab === 3 && <TypeScriptSDKTab />}
            {tab === 4 && <WebhooksTab />}
        </Box>
    );
}
