import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import React from 'react';
import {
    Box, Typography, Button, Paper, Chip, Divider, Container, alpha, Accordion,
    AccordionSummary, AccordionDetails, Link,
} from '@mui/material';
import {
    Bolt, CheckCircle, Speed, Security, Psychology, TrendingUp,
    Code, ArrowForward, ExpandMore, QueryStats, Public, Timer,
} from '@mui/icons-material';

const BRIDGE_URL = 'https://nexus-strategy-bridge-production.up.railway.app';

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
    return (
        <Paper sx={{
            p: 3, height: '100%',
            border: '1px solid rgba(255,255,255,0.06)',
            transition: 'border-color 0.3s, transform 0.3s',
            '&:hover': { borderColor: 'rgba(59,130,246,0.3)', transform: 'translateY(-2px)' },
        }}>
            <Box sx={{ mb: 2, color: '#3b82f6' }}>{icon}</Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>{desc}</Typography>
        </Paper>
    );
}

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <>
            <Helmet>
                <title>NexusTradeAI — AI Trade Signal Evaluator API</title>
                <meta name="description" content="Get AI-powered GO/NO-GO decisions on any trade signal. Multi-agent pipeline analyzes stocks, forex, and crypto with confidence scores, risk flags, and reasoning." />
                <meta property="og:title" content="NexusTradeAI — AI Trade Signal Evaluator API" />
                <meta property="og:description" content="AI-powered trade evaluation for stocks, forex, and crypto. One API call, instant GO/NO-GO decision." />
                <meta property="og:type" content="website" />
            </Helmet>

            <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
                {/* ── Nav Bar ──────────────────────────────────────────── */}
                <Box sx={{
                    position: 'sticky', top: 0, zIndex: 100,
                    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    bgcolor: 'rgba(13,17,23,0.85)',
                }}>
                    <Container maxWidth="lg">
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                <Box sx={{
                                    width: 36, height: 36, borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Bolt sx={{ color: '#fff', fontSize: 20 }} />
                                </Box>
                                <Typography variant="subtitle1" sx={{ fontWeight: 800, letterSpacing: '-0.02em' }}>
                                    NexusTradeAI
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1.5 }}>
                                <Button
                                    variant="text"
                                    onClick={() => navigate('/login')}
                                    sx={{ textTransform: 'none', fontWeight: 600, color: 'text.secondary' }}
                                >
                                    Log in
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={() => navigate('/login')}
                                    sx={{
                                        textTransform: 'none', fontWeight: 600, borderRadius: 2,
                                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    }}
                                >
                                    Get API Key — Free
                                </Button>
                            </Box>
                        </Box>
                    </Container>
                </Box>

                {/* ── Hero ─────────────────────────────────────────────── */}
                <Box sx={{
                    pt: { xs: 8, md: 14 }, pb: { xs: 6, md: 10 },
                    textAlign: 'center', position: 'relative', overflow: 'hidden',
                    '&::before': {
                        content: '""', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.08) 0%, transparent 60%)',
                        pointerEvents: 'none',
                    },
                }}>
                    <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
                        <Chip
                            label="BETA — Free 100 calls/month"
                            size="small"
                            sx={{
                                mb: 3, fontWeight: 700, fontSize: '0.7rem', letterSpacing: '0.03em',
                                bgcolor: alpha('#3b82f6', 0.1), color: '#60a5fa',
                                border: `1px solid ${alpha('#3b82f6', 0.25)}`,
                            }}
                        />
                        <Typography variant="h2" sx={{
                            fontWeight: 900, letterSpacing: '-0.03em',
                            fontSize: { xs: '2.2rem', md: '3.5rem' },
                            lineHeight: 1.15, mb: 2.5,
                            background: 'linear-gradient(135deg, #e6edf3 0%, #8b949e 100%)',
                            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                        }}>
                            AI-Powered GO/NO-GO<br />for Every Trade Signal
                        </Typography>
                        <Typography variant="h6" sx={{
                            color: 'text.secondary', fontWeight: 400, maxWidth: 600, mx: 'auto', mb: 4,
                            lineHeight: 1.6, fontSize: { xs: '1rem', md: '1.15rem' },
                        }}>
                            Send your trade signal. Get an instant decision with confidence score,
                            reasoning, and risk flags — powered by a multi-agent AI pipeline that
                            learns from every outcome.
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Button
                                variant="contained" size="large"
                                endIcon={<ArrowForward />}
                                onClick={() => navigate('/login')}
                                sx={{
                                    textTransform: 'none', fontWeight: 700, borderRadius: 2,
                                    px: 4, py: 1.5, fontSize: '1rem',
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    boxShadow: '0 4px 24px rgba(59,130,246,0.35)',
                                }}
                            >
                                Start Free
                            </Button>
                            <Button
                                variant="outlined" size="large"
                                startIcon={<Code />}
                                onClick={() => navigate('/public-docs')}
                                sx={{
                                    textTransform: 'none', fontWeight: 600, borderRadius: 2,
                                    px: 4, py: 1.5, fontSize: '1rem',
                                    borderColor: 'rgba(255,255,255,0.15)',
                                    '&:hover': { borderColor: 'rgba(255,255,255,0.3)' },
                                }}
                            >
                                View API Docs
                            </Button>
                        </Box>
                    </Container>
                </Box>

                {/* ── Code Example ─────────────────────────────────────── */}
                <Container maxWidth="md" sx={{ pb: { xs: 6, md: 10 } }}>
                    <Paper sx={{
                        bgcolor: 'rgba(0,0,0,0.4)', borderRadius: 3,
                        border: '1px solid rgba(255,255,255,0.08)',
                        overflow: 'hidden',
                    }}>
                        <Box sx={{
                            px: 2.5, py: 1, display: 'flex', alignItems: 'center', gap: 1,
                            bgcolor: 'rgba(255,255,255,0.03)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#ef4444' }} />
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#f59e0b' }} />
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#10b981' }} />
                            <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>Terminal</Typography>
                        </Box>
                        <Box component="pre" sx={{
                            m: 0, p: 2.5, fontSize: '0.82rem', lineHeight: 1.7,
                            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                            color: '#e6edf3', overflowX: 'auto',
                        }}>
                            <Box component="span" sx={{ color: '#8b949e' }}>{'# One API call → AI GO/NO-GO decision\n'}</Box>
                            <Box component="span" sx={{ color: '#79c0ff' }}>{'curl '}</Box>
                            {`-X POST ${BRIDGE_URL}/api/v1/evaluate \\\n`}
                            {'  -H "X-API-Key: ntai_live_your_key" \\\n'}
                            {'  -d \'{"symbol":"NVDA","price":875,"direction":"long","rsi":62}\'\n\n'}
                            <Box component="span" sx={{ color: '#8b949e' }}>{'# Response:\n'}</Box>
                            <Box component="span" sx={{ color: '#7ee787' }}>{`{\n  "should_enter": true,\n  "confidence": 0.78,\n  "reason": "Strong upward momentum with healthy RSI...",\n  "risk_flags": ["earnings_proximity"],\n  "position_size_multiplier": 1.25\n}`}</Box>
                        </Box>
                    </Paper>
                </Container>

                {/* ── Features Grid ────────────────────────────────────── */}
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.01)', py: { xs: 6, md: 10 }, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <Container maxWidth="lg">
                        <Typography variant="h4" fontWeight={800} textAlign="center" sx={{ mb: 1, letterSpacing: '-0.02em' }}>
                            Why NexusTradeAI?
                        </Typography>
                        <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 6, maxWidth: 550, mx: 'auto' }}>
                            Not another signal service. A decision engine that gets smarter with every trade.
                        </Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3 }}>
                            <FeatureCard
                                icon={<Psychology sx={{ fontSize: 32 }} />}
                                title="Multi-Agent AI Pipeline"
                                desc="Market Agent detects regime. Decision Agent evaluates signal. Learning Agent extracts patterns from outcomes. All coordinated by an orchestrator."
                            />
                            <FeatureCard
                                icon={<TrendingUp sx={{ fontSize: 32 }} />}
                                title="Learns from Every Trade"
                                desc="Report outcomes back and the system adapts. Pattern tracking, contextual bandits, and analyst rankings continuously improve decision quality."
                            />
                            <FeatureCard
                                icon={<Speed sx={{ fontSize: 32 }} />}
                                title="One API Call"
                                desc="Send symbol, price, and whatever indicators you have. Get GO/NO-GO with confidence, reasoning, and risk flags in ~8 seconds."
                            />
                            <FeatureCard
                                icon={<Security sx={{ fontSize: 32 }} />}
                                title="Built-in Safety"
                                desc="3-layer kill switch, adaptive guardrails, position correlation checks. The system protects you even when the market won't."
                            />
                            <FeatureCard
                                icon={<Code sx={{ fontSize: 32 }} />}
                                title="Drop-in SDKs"
                                desc="Python and TypeScript SDKs ready to copy-paste. Works with any broker, any strategy, any timeframe. 5 minutes to first evaluation."
                            />
                            <FeatureCard
                                icon={<Bolt sx={{ fontSize: 32 }} />}
                                title="All Asset Classes"
                                desc="Stocks, forex, crypto — one unified API. Regime detection adapts to each market's characteristics automatically."
                            />
                        </Box>
                    </Container>
                </Box>

                {/* ── Pricing ──────────────────────────────────────────── */}
                <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
                    <Typography variant="h4" fontWeight={800} textAlign="center" sx={{ mb: 1, letterSpacing: '-0.02em' }}>
                        Simple Pricing
                    </Typography>
                    <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 6 }}>
                        Start free. Upgrade when you need more evaluations.
                    </Typography>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 3, maxWidth: 900, mx: 'auto' }}>
                        {[
                            { tier: 'Free', price: '$0', period: 'forever', limit: '100 evaluations/mo', cta: 'Start Free', primary: false, features: ['All asset classes', 'AI reasoning + risk flags', 'Python & TS SDKs'] },
                            { tier: 'Pro', price: '$49', period: '/month', limit: '5,000 evaluations/mo', cta: 'Subscribe', primary: true, features: ['Everything in Free', 'Learning from your trades', 'Priority evaluation queue'] },
                            { tier: 'Enterprise', price: '$499', period: '/month', limit: 'Unlimited evaluations', cta: 'Subscribe', primary: false, features: ['Everything in Pro', 'Priority support + SLA', 'Custom model tuning'] },
                        ].map(plan => (
                            <Paper key={plan.tier} sx={{
                                p: 3.5, position: 'relative', overflow: 'hidden',
                                border: plan.primary ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.08)',
                            }}>
                                {plan.primary && (
                                    <Chip label="MOST POPULAR" size="small" sx={{
                                        position: 'absolute', top: 12, right: 12,
                                        bgcolor: alpha('#3b82f6', 0.15), color: '#60a5fa',
                                        fontWeight: 700, fontSize: '0.6rem',
                                    }} />
                                )}
                                <Typography variant="overline" color="text.secondary" fontWeight={700}>{plan.tier}</Typography>
                                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, my: 1 }}>
                                    <Typography variant="h3" fontWeight={900}>{plan.price}</Typography>
                                    <Typography variant="body2" color="text.secondary">{plan.period}</Typography>
                                </Box>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{plan.limit}</Typography>
                                <Divider sx={{ mb: 2 }} />
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, mb: 3 }}>
                                    {plan.features.map(f => (
                                        <Box key={f} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <CheckCircle sx={{ fontSize: 16, color: '#10b981' }} />
                                            <Typography variant="body2">{f}</Typography>
                                        </Box>
                                    ))}
                                </Box>
                                <Button
                                    fullWidth
                                    variant={plan.primary ? 'contained' : 'outlined'}
                                    onClick={() => navigate('/login')}
                                    sx={{
                                        textTransform: 'none', fontWeight: 600, borderRadius: 2, py: 1.2,
                                        ...(plan.primary ? {
                                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                        } : {}),
                                    }}
                                >
                                    {plan.cta}
                                </Button>
                            </Paper>
                        ))}
                    </Box>
                </Container>

                {/* ── How It Works ─────────────────────────────────────── */}
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.01)', py: { xs: 6, md: 10 }, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <Container maxWidth="md">
                        <Typography variant="h4" fontWeight={800} textAlign="center" sx={{ mb: 6, letterSpacing: '-0.02em' }}>
                            3 Steps to Smarter Trades
                        </Typography>
                        {[
                            { step: '1', title: 'Get your API key', desc: 'Sign up, create a key from the dashboard. Takes 30 seconds.' },
                            { step: '2', title: 'Send your signal', desc: 'POST to /api/v1/evaluate with symbol, price, and indicators. Get back GO/NO-GO with reasoning.' },
                            { step: '3', title: 'Report outcomes', desc: 'Tell us how the trade went. The AI learns your patterns and gets better over time.' },
                        ].map((item, i) => (
                            <Box key={item.step} sx={{
                                display: 'flex', gap: 3, mb: i < 2 ? 4 : 0,
                                alignItems: 'flex-start',
                            }}>
                                <Box sx={{
                                    width: 44, height: 44, borderRadius: '12px', flexShrink: 0,
                                    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <Typography variant="h6" fontWeight={800} sx={{ color: '#fff' }}>{item.step}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>{item.title}</Typography>
                                    <Typography variant="body1" color="text.secondary">{item.desc}</Typography>
                                </Box>
                            </Box>
                        ))}
                    </Container>
                </Box>

                {/* ── Trust Signals ───────────────────────────────────── */}
                <Container maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
                        gap: 3,
                    }}>
                        {[
                            { icon: <QueryStats sx={{ fontSize: 28 }} />, value: '1,000+', label: 'API Evaluations Served' },
                            { icon: <Public sx={{ fontSize: 28 }} />, value: '3 Markets', label: 'Stocks, Forex & Crypto' },
                            { icon: <Timer sx={{ fontSize: 28 }} />, value: '99.9%', label: 'Uptime SLA' },
                            { icon: <Speed sx={{ fontSize: 28 }} />, value: '<8s', label: 'Avg Response Time' },
                        ].map(stat => (
                            <Paper key={stat.label} sx={{
                                p: 3, textAlign: 'center',
                                border: '1px solid rgba(255,255,255,0.06)',
                                bgcolor: 'rgba(255,255,255,0.02)',
                            }}>
                                <Box sx={{ color: '#3b82f6', mb: 1.5 }}>{stat.icon}</Box>
                                <Typography variant="h4" fontWeight={900} sx={{
                                    mb: 0.5,
                                    background: 'linear-gradient(135deg, #e6edf3 0%, #8b949e 100%)',
                                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                }}>
                                    {stat.value}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">{stat.label}</Typography>
                            </Paper>
                        ))}
                    </Box>
                </Container>

                {/* ── FAQ ─────────────────────────────────────────────── */}
                <Box sx={{ bgcolor: 'rgba(255,255,255,0.01)', py: { xs: 6, md: 10 }, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <Container maxWidth="md">
                        <Typography variant="h4" fontWeight={800} textAlign="center" sx={{ mb: 1, letterSpacing: '-0.02em' }}>
                            Frequently Asked Questions
                        </Typography>
                        <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 5 }}>
                            Everything you need to know before getting started.
                        </Typography>
                        {[
                            {
                                q: 'What is NexusTradeAI?',
                                a: 'NexusTradeAI is an AI-powered trade signal evaluator API. You send us a trade signal (symbol, price, direction, indicators) and our multi-agent AI pipeline returns a GO/NO-GO decision with a confidence score, reasoning, and risk flags.',
                            },
                            {
                                q: 'How accurate are the signals?',
                                a: 'Accuracy depends on market conditions and the quality of your input signals. Our AI evaluates each trade against current market regime, technical factors, and historical patterns. The confidence score (0-1) tells you how sure the model is. We recommend treating it as a second opinion, not a guarantee.',
                            },
                            {
                                q: 'Is it free to use?',
                                a: 'Yes! The Free tier gives you 100 evaluations per month at no cost, forever. No credit card required. When you need more volume, Pro ($49/mo) offers 5,000 evaluations and Enterprise ($499/mo) is unlimited.',
                            },
                            {
                                q: 'What markets are supported?',
                                a: 'NexusTradeAI supports stocks, forex, and cryptocurrency — all through a single unified API endpoint. The AI automatically adapts its regime detection and analysis to each market\'s characteristics.',
                            },
                            {
                                q: 'How do I get started?',
                                a: 'Sign up, create an API key from the dashboard, and make your first POST request to /api/v1/evaluate. We have copy-paste Python and TypeScript SDKs. Most developers are up and running in under 5 minutes.',
                            },
                            {
                                q: 'What are the rate limits?',
                                a: 'Free tier: 100 evaluations per month. Pro tier: 5,000 evaluations per month with priority queue. Enterprise: unlimited evaluations with dedicated capacity. All tiers share the same AI pipeline quality.',
                            },
                        ].map((item, i) => (
                            <Accordion
                                key={i}
                                disableGutters
                                elevation={0}
                                sx={{
                                    bgcolor: 'transparent',
                                    '&::before': { display: 'none' },
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                }}
                            >
                                <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'text.secondary' }} />} sx={{ px: 0 }}>
                                    <Typography variant="subtitle1" fontWeight={600}>{item.q}</Typography>
                                </AccordionSummary>
                                <AccordionDetails sx={{ px: 0, pt: 0, pb: 2 }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.7 }}>
                                        {item.a}
                                    </Typography>
                                </AccordionDetails>
                            </Accordion>
                        ))}
                    </Container>
                </Box>

                {/* ── CTA ──────────────────────────────────────────────── */}
                <Container maxWidth="sm" sx={{ py: { xs: 8, md: 12 }, textAlign: 'center' }}>
                    <Typography variant="h4" fontWeight={800} sx={{ mb: 2, letterSpacing: '-0.02em' }}>
                        Stop guessing. Start evaluating.
                    </Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
                        100 free evaluations per month. No credit card required.
                    </Typography>
                    <Button
                        variant="contained" size="large"
                        endIcon={<ArrowForward />}
                        onClick={() => navigate('/login')}
                        sx={{
                            textTransform: 'none', fontWeight: 700, borderRadius: 2,
                            px: 5, py: 1.5, fontSize: '1.05rem',
                            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                            boxShadow: '0 4px 24px rgba(59,130,246,0.35)',
                        }}
                    >
                        Get Your Free API Key
                    </Button>
                </Container>

                {/* ── Footer ───────────────────────────────────────────── */}
                <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.06)', py: { xs: 4, md: 5 } }}>
                    <Container maxWidth="lg">
                        <Box sx={{
                            display: 'flex',
                            flexDirection: { xs: 'column', md: 'row' },
                            justifyContent: 'space-between',
                            alignItems: { xs: 'center', md: 'flex-start' },
                            gap: 3,
                            mb: 3,
                        }}>
                            {/* Brand */}
                            <Box sx={{ textAlign: { xs: 'center', md: 'left' } }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: { xs: 'center', md: 'flex-start' }, mb: 1 }}>
                                    <Box sx={{
                                        width: 28, height: 28, borderRadius: '8px',
                                        background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Bolt sx={{ color: '#fff', fontSize: 16 }} />
                                    </Box>
                                    <Typography variant="body2" fontWeight={700}>NexusTradeAI</Typography>
                                </Box>
                                <Typography variant="caption" color="text.secondary">
                                    AI-powered trade signal evaluation
                                </Typography>
                            </Box>

                            {/* Links */}
                            <Box sx={{ display: 'flex', gap: { xs: 3, md: 5 }, flexWrap: 'wrap', justifyContent: 'center' }}>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Product
                                    </Typography>
                                    <Link href="/public-docs" underline="hover" variant="body2" color="text.secondary" sx={{ '&:hover': { color: '#e6edf3' } }}>
                                        API Docs
                                    </Link>
                                    <Link href="/login" underline="hover" variant="body2" color="text.secondary" sx={{ '&:hover': { color: '#e6edf3' } }}>
                                        Dashboard
                                    </Link>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Legal
                                    </Typography>
                                    <Link href="/privacy" underline="hover" variant="body2" color="text.secondary" sx={{ '&:hover': { color: '#e6edf3' } }}>
                                        Privacy Policy
                                    </Link>
                                    <Link href="/terms" underline="hover" variant="body2" color="text.secondary" sx={{ '&:hover': { color: '#e6edf3' } }}>
                                        Terms of Service
                                    </Link>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Support
                                    </Typography>
                                    <Link href="mailto:support@nexustradeai.com" underline="hover" variant="body2" color="text.secondary" sx={{ '&:hover': { color: '#e6edf3' } }}>
                                        Contact Us
                                    </Link>
                                    <Link href="https://github.com/NexusTradeAI" underline="hover" variant="body2" color="text.secondary" sx={{ '&:hover': { color: '#e6edf3' } }}>
                                        GitHub
                                    </Link>
                                </Box>
                            </Box>
                        </Box>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mt: 2.5 }}>
                            {new Date().getFullYear()} NexusTradeAI. All rights reserved. Not financial advice.
                        </Typography>
                    </Container>
                </Box>
            </Box>
        </>
    );
}
