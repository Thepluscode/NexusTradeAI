import React, { useState, useRef, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    TextField,
    IconButton,
    Chip,
    Avatar,
    CircularProgress,
    Stack,
} from '@mui/material';
import {
    Send,
    SmartToy,
    Person,
} from '@mui/icons-material';
import axios from 'axios';
import { useQuery } from 'react-query';

// ── Pull real context from all running bots ────────────────────────────────

async function fetchBotContext() {
    const results = await Promise.allSettled([
        axios.get('http://localhost:3002/api/trading/status', { timeout: 3000 }),
        axios.get('http://localhost:3002/api/config', { timeout: 3000 }),
        axios.get('http://localhost:3005/api/forex/status', { timeout: 3000 }),
        axios.get('http://localhost:3006/api/crypto/status', { timeout: 3000 }),
    ]);

    const stock = results[0].status === 'fulfilled' ? results[0].value.data?.data || results[0].value.data : null;
    const config = results[1].status === 'fulfilled' ? results[1].value.data?.data : null;
    const forex = results[2].status === 'fulfilled' ? results[2].value.data?.data || results[2].value.data : null;
    const crypto = results[3].status === 'fulfilled' ? results[3].value.data?.data || results[3].value.data : null;

    return { stock, config, forex, crypto };
}

// ── Local AI answering from live bot data ──────────────────────────────────

function generateResponse(message: string, ctx: any): string {
    const q = message.toLowerCase();
    const stock = ctx?.stock;
    const config = ctx?.config;
    const forex = ctx?.forex;
    const crypto = ctx?.crypto;

    const stats = stock?.stats || stock?.performance || {};
    const totalTrades = stats.totalTrades ?? 0;
    const winners = stats.winners ?? stats.winningTrades ?? 0;
    const winRate = totalTrades > 0 ? (winners / totalTrades * 100).toFixed(1) : '0';
    const totalPnL = (stats.totalPnL ?? stats.totalProfit ?? 0).toFixed(2);
    const equity = stock?.equity ?? 0;
    const positions = stock?.positions?.length ?? 0;
    const profitFactor = (stats.profitFactor ?? 0).toFixed(2);

    if (q.includes('performance') || q.includes('how am i doing') || q.includes('results') || q.includes('p&l')) {
        return `📊 Stock Bot Performance\n\n` +
            `• Total trades: ${totalTrades}\n` +
            `• Win rate: ${winRate}%\n` +
            `• Net P&L: $${totalPnL}\n` +
            `• Profit factor: ${profitFactor}\n` +
            `• Open positions: ${positions}\n` +
            `• Equity: $${equity.toLocaleString()}\n\n` +
            (totalTrades < 30
                ? `Note: Less than 30 trades — not yet statistically significant. Keep running.`
                : parseFloat(winRate) >= 50
                    ? `✅ Win rate above 50% — strategy showing edge.`
                    : `⚠️ Win rate below 50% — monitor closely.`);
    }

    if (q.includes('risk') || q.includes('drawdown') || q.includes('safe') || q.includes('loss')) {
        const dd = (stats.maxDrawdown ?? 0);
        const ddPct = (dd * 100).toFixed(2);
        return `🛡️ Risk Summary\n\n` +
            `• Max drawdown: ${ddPct}%\n` +
            `• Stop loss T1: ${config?.risk?.tier1?.stopLoss ? (config.risk.tier1.stopLoss * 100).toFixed(1) + '%' : '4%'}\n` +
            `• Stop loss T2: ${config?.risk?.tier2?.stopLoss ? (config.risk.tier2.stopLoss * 100).toFixed(1) + '%' : '5%'}\n` +
            `• Stop loss T3: ${config?.risk?.tier3?.stopLoss ? (config.risk.tier3.stopLoss * 100).toFixed(1) + '%' : '6%'}\n` +
            `• Daily trade limit: ${config?.trading?.maxTradesPerDay ?? 15}/day\n` +
            `• Per-symbol limit: ${config?.trading?.maxTradesPerSymbol ?? 3}/day\n\n` +
            (dd > 0.15 ? `🚨 Drawdown over 15% — consider pausing and reviewing.`
                : dd > 0.10 ? `⚠️ Approaching warning threshold (10%). Monitor closely.`
                    : `✅ Drawdown within safe range.`);
    }

    if (q.includes('position') || q.includes('holding') || q.includes('open trade')) {
        if (positions === 0) {
            return `📭 No open positions right now.\n\nThe bot scans 110+ symbols every 60 seconds for momentum setups. Trades open when a stock meets all entry criteria: momentum threshold, volume ratio, RSI range (30–70), and price above VWAP.`;
        }
        const posDetails = (stock?.positions || []).slice(0, 5).map((p: any) =>
            `• ${p.symbol}: ${p.qty || p.quantity} shares @ $${(p.avg_entry_price || p.entryPrice || 0).toFixed(2)}`
        ).join('\n');
        return `📈 ${positions} Open Position${positions > 1 ? 's' : ''}\n\n${posDetails}`;
    }

    if (q.includes('strateg') || q.includes('how does') || q.includes('how it work') || q.includes('entry')) {
        return `🧠 3-Tier Momentum Strategy\n\n` +
            `Tier 1 (2.5%+ move):\n  Stop ${config?.risk?.tier1?.stopLoss ? (config.risk.tier1.stopLoss*100).toFixed(0) : 4}% / Target ${config?.risk?.tier1?.profitTarget ? (config.risk.tier1.profitTarget*100).toFixed(0) : 8}%\n\n` +
            `Tier 2 (5%+ move):\n  Stop ${config?.risk?.tier2?.stopLoss ? (config.risk.tier2.stopLoss*100).toFixed(0) : 5}% / Target ${config?.risk?.tier2?.profitTarget ? (config.risk.tier2.profitTarget*100).toFixed(0) : 10}%\n\n` +
            `Tier 3 (10%+ move):\n  Stop ${config?.risk?.tier3?.stopLoss ? (config.risk.tier3.stopLoss*100).toFixed(0) : 6}% / Target ${config?.risk?.tier3?.profitTarget ? (config.risk.tier3.profitTarget*100).toFixed(0) : 15}%\n\n` +
            `Entry filters: volume ratio, RSI 30–70, above VWAP, not overextended through daily range.\nExit: trailing stop locks 60–92% of gain as price advances. EOD close at 3:50 PM EST.`;
    }

    if (q.includes('forex') || q.includes('oanda') || q.includes('currency')) {
        if (!forex) {
            return `🔌 Forex bot is offline.\n\nStart it: node unified-forex-bot.js\n\nTrades 12 major/cross pairs on OANDA, 24/5. Optimised for London/NY overlap (best session).`;
        }
        const fp = forex?.performance || {};
        return `💱 Forex Bot\n\n` +
            `• Running: ${forex?.isRunning ? 'Yes' : 'No'}\n` +
            `• Session: ${forex?.session || 'Unknown'}\n` +
            `• Trades: ${fp.totalTrades ?? 0}\n` +
            `• Win rate: ${fp.winRate != null ? fp.winRate.toFixed(1) + '%' : '—'}\n` +
            `• Open positions: ${(forex?.positions?.length ?? 0)}`;
    }

    if (q.includes('crypto') || q.includes('bitcoin') || q.includes('btc') || q.includes('coin')) {
        if (!crypto) {
            return `🔌 Crypto bot is offline.\n\nStart it: node unified-crypto-bot.js\n\nTrades 12 crypto pairs 24/7. Uses BTC trend as market regime filter.`;
        }
        return `🪙 Crypto Bot\n\n` +
            `• Running: ${crypto?.isRunning ? 'Yes' : 'No'}\n` +
            `• Mode: ${crypto?.mode || 'DEMO'}\n` +
            `• Open positions: ${(crypto?.positions?.length ?? 0)}\n` +
            `• Total trades: ${crypto?.performance?.totalTrades ?? 0}`;
    }

    if (q.includes('today') || q.includes('daily') || q.includes('this session')) {
        const todayTrades = stats.totalTradesToday ?? 0;
        const limit = config?.trading?.maxTradesPerDay ?? 15;
        return `📅 Today's Activity\n\n` +
            `• Trades: ${todayTrades} / ${limit}\n` +
            `• Remaining today: ${limit - todayTrades}\n` +
            `• Open positions: ${positions}\n` +
            `• Bot: ${stock?.isRunning ? 'Running' : 'Stopped'}\n` +
            `• Market hours: 9:30 AM – 4:00 PM EST`;
    }

    if (q.includes('help') || q.includes('what can') || q.includes('commands')) {
        return `💡 Ask me anything about:\n\n` +
            `• Performance & P&L\n` +
            `• Risk & drawdown\n` +
            `• Open positions\n` +
            `• Trading strategy\n` +
            `• Forex bot status\n` +
            `• Crypto bot status\n` +
            `• Today's activity\n\n` +
            `All answers come from live bot data.`;
    }

    return `I can answer questions about your bots using live data. Try asking about performance, risk, open positions, or the trading strategy.`;
}

// ── Message renderer ───────────────────────────────────────────────────────

function MessageText({ text }: { text: string }) {
    return (
        <Box>
            {text.split('\n').map((line, i) => {
                if (line === '') return <Box key={i} sx={{ height: 5 }} />;
                return (
                    <Typography key={i} variant="body2" sx={{ mb: 0.2, lineHeight: 1.6 }}>
                        {line}
                    </Typography>
                );
            })}
        </Box>
    );
}

// ── Main component ─────────────────────────────────────────────────────────

interface Message {
    role: 'user' | 'assistant';
    text: string;
}

const QUICK_PROMPTS = [
    'Show performance',
    "What's my risk?",
    'Open positions',
    'How does the strategy work?',
    "Today's activity",
    'Crypto bot status',
];

export const AIChat: React.FC = () => {
    const [messages, setMessages] = useState<Message[]>([
        {
            role: 'assistant',
            text: "👋 Hi! I have live access to all your bot data. Ask me about performance, risk, positions, or strategy.",
        },
    ]);
    const [input, setInput] = useState('');
    const [thinking, setThinking] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    const { data: ctx } = useQuery('aiChatContext', fetchBotContext, {
        refetchInterval: 15000,
        staleTime: 10000,
    });

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, thinking]);

    const send = (text: string) => {
        if (!text.trim()) return;
        setMessages(prev => [...prev, { role: 'user', text: text.trim() }]);
        setInput('');
        setThinking(true);
        setTimeout(() => {
            const response = generateResponse(text.trim(), ctx);
            setMessages(prev => [...prev, { role: 'assistant', text: response }]);
            setThinking(false);
        }, 350);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: 520 }}>
            <Box sx={{ flex: 1, overflowY: 'auto', pr: 0.5, mb: 1.5 }}>
                {messages.map((msg, i) => (
                    <Box
                        key={i}
                        sx={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            mb: 1.5,
                            gap: 1,
                            alignItems: 'flex-start',
                        }}
                    >
                        {msg.role === 'assistant' && (
                            <Avatar sx={{ bgcolor: '#3b82f620', color: '#3b82f6', width: 32, height: 32, mt: 0.3, flexShrink: 0 }}>
                                <SmartToy sx={{ fontSize: 18 }} />
                            </Avatar>
                        )}
                        <Paper
                            sx={{
                                p: 1.5,
                                maxWidth: '80%',
                                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                bgcolor: msg.role === 'user' ? 'primary.main' : 'background.paper',
                                border: '1px solid',
                                borderColor: msg.role === 'user' ? 'primary.dark' : 'divider',
                            }}
                        >
                            <MessageText text={msg.text} />
                        </Paper>
                        {msg.role === 'user' && (
                            <Avatar sx={{ bgcolor: '#10b98120', color: '#10b981', width: 32, height: 32, mt: 0.3, flexShrink: 0 }}>
                                <Person sx={{ fontSize: 18 }} />
                            </Avatar>
                        )}
                    </Box>
                ))}
                {thinking && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                        <Avatar sx={{ bgcolor: '#3b82f620', color: '#3b82f6', width: 32, height: 32, flexShrink: 0 }}>
                            <SmartToy sx={{ fontSize: 18 }} />
                        </Avatar>
                        <Paper sx={{ p: 1.5, borderRadius: '18px 18px 18px 4px', border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                            <CircularProgress size={14} />
                        </Paper>
                    </Box>
                )}
                <div ref={bottomRef} />
            </Box>

            <Stack direction="row" sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.75 }}>
                {QUICK_PROMPTS.map(p => (
                    <Chip
                        key={p}
                        label={p}
                        size="small"
                        variant="outlined"
                        onClick={() => send(p)}
                        sx={{ cursor: 'pointer', fontSize: 11, '&:hover': { bgcolor: 'action.hover' } }}
                    />
                ))}
            </Stack>

            <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Ask about performance, risk, positions..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
                    }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
                />
                <IconButton
                    onClick={() => send(input)}
                    disabled={!input.trim() || thinking}
                    sx={{
                        bgcolor: 'primary.main',
                        color: '#fff',
                        borderRadius: 2,
                        '&:hover': { bgcolor: 'primary.dark' },
                        '&:disabled': { bgcolor: 'action.disabledBackground' },
                    }}
                >
                    <Send fontSize="small" />
                </IconButton>
            </Box>
        </Box>
    );
};
