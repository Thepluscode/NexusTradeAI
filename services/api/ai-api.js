#!/usr/bin/env node

/**
 * NexusTradeAI - AI API Service
 * Provides AI-powered endpoints for frontend integration
 */

const express = require('express');
const cors = require('cors');

class AIAPIService {
    constructor() {
        this.app = express();
        this.port = process.env.AI_API_PORT || 5000;
        this.setupMiddleware();
        this.setupRoutes();
        this.mockData = this.initializeMockData();
    }

    setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
        
        // Logging middleware
        this.app.use((req, res, next) => {
            console.log(`🤖 AI API: ${req.method} ${req.path}`);
            next();
        });
    }

    initializeMockData() {
        return {
            sentiments: [
                { sentiment: 'Bullish', score: 75, confidence: 85, reason: 'Strong earnings reports and positive economic indicators' },
                { sentiment: 'Bearish', score: 35, confidence: 70, reason: 'Market volatility and geopolitical tensions' },
                { sentiment: 'Neutral', score: 50, confidence: 60, reason: 'Mixed signals from technical and fundamental analysis' },
                { sentiment: 'Volatile', score: 65, confidence: 80, reason: 'High trading volume and conflicting market signals' }
            ],
            predictions: [
                { direction: 'Buy', confidence: 78, target: 5.2, timeframe: '1-3 days', reasoning: 'Neural networks detect strong momentum patterns' },
                { direction: 'Sell', confidence: 82, target: -3.8, timeframe: '2-5 days', reasoning: 'LSTM models predict downward trend reversal' },
                { direction: 'Hold', confidence: 65, target: 0, timeframe: 'Current', reasoning: 'Conflicting signals suggest sideways movement' }
            ],
            portfolioOptimizations: [
                { recommendation: 'Rebalance', score: 85, optimization: 92, action: 'Reduce tech exposure by 15%' },
                { recommendation: 'Diversify', score: 70, optimization: 78, action: 'Add defensive sectors and international exposure' },
                { recommendation: 'Concentrate', score: 60, optimization: 65, action: 'Focus on top-performing strategies' },
                { recommendation: 'Hedge', score: 75, optimization: 80, action: 'Add protective puts for downside protection' }
            ],
            chatResponses: [
                "Based on current market analysis, I recommend monitoring volatility levels closely. The VIX is showing elevated readings.",
                "Your portfolio shows good diversification. Consider taking profits on overperforming positions and rebalancing.",
                "Market sentiment is shifting. The neural networks detect increased buying pressure in growth stocks.",
                "Risk management suggests reducing position sizes in high-beta stocks during this period of uncertainty.",
                "Technical indicators show potential breakout patterns in several of your holdings. Consider increasing exposure.",
                "The AI models are detecting unusual options flow that could indicate institutional positioning.",
                "Earnings season is approaching. Historical patterns suggest increased volatility in the next 2 weeks.",
                "Correlation analysis shows your portfolio is becoming more concentrated. Diversification could improve risk-adjusted returns."
            ]
        };
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                service: 'NexusTradeAI AI API',
                status: 'healthy',
                timestamp: new Date().toISOString(),
                ai_enabled: process.env.AI_ENABLED === 'true',
                models_loaded: this.getLoadedModels()
            });
        });

        // Market sentiment analysis
        this.app.get('/api/ai/sentiment', (req, res) => {
            try {
                const sentiment = this.mockData.sentiments[Math.floor(Math.random() * this.mockData.sentiments.length)];
                
                res.json({
                    success: true,
                    sentiment: {
                        sentiment: sentiment.sentiment,
                        score: sentiment.score + (Math.random() * 10 - 5), // Add some variation
                        confidence: sentiment.confidence + (Math.random() * 10 - 5),
                        reason: sentiment.reason,
                        timestamp: new Date().toISOString(),
                        sources: ['news_analysis', 'social_media', 'market_data'],
                        model: 'FinBERT + Sentiment Transformer'
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to analyze market sentiment',
                    details: error.message
                });
            }
        });

        // AI predictions
        this.app.get('/api/ai/predictions', (req, res) => {
            try {
                const prediction = this.mockData.predictions[Math.floor(Math.random() * this.mockData.predictions.length)];
                
                res.json({
                    success: true,
                    prediction: {
                        direction: prediction.direction,
                        confidence: prediction.confidence + (Math.random() * 10 - 5),
                        target: prediction.target ? prediction.target + (Math.random() * 2 - 1) : null,
                        timeframe: prediction.timeframe,
                        reasoning: prediction.reasoning,
                        timestamp: new Date().toISOString(),
                        models_used: ['LSTM', 'Transformer', 'CNN'],
                        accuracy_last_30_days: 72.5
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate predictions',
                    details: error.message
                });
            }
        });

        // Portfolio optimization
        this.app.get('/api/ai/portfolio-optimization', (req, res) => {
            try {
                const optimization = this.mockData.portfolioOptimizations[Math.floor(Math.random() * this.mockData.portfolioOptimizations.length)];
                
                res.json({
                    success: true,
                    portfolio: {
                        recommendation: optimization.recommendation,
                        score: optimization.score + (Math.random() * 10 - 5),
                        optimization: optimization.optimization + (Math.random() * 5 - 2.5),
                        action: optimization.action,
                        expected_improvement: `${(Math.random() * 15 + 5).toFixed(1)}%`,
                        risk_reduction: `${(Math.random() * 20 + 10).toFixed(1)}%`,
                        timestamp: new Date().toISOString(),
                        algorithm: 'Reinforcement Learning + Modern Portfolio Theory'
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to optimize portfolio',
                    details: error.message
                });
            }
        });

        // AI Chat
        this.app.post('/api/ai/chat', (req, res) => {
            try {
                const { message, context, history } = req.body;
                
                // Simple keyword-based response selection
                let response = this.generateContextualResponse(message, context);
                
                res.json({
                    success: true,
                    response: response,
                    timestamp: new Date().toISOString(),
                    model: 'NexusTradeAI Conversational AI',
                    confidence: Math.random() * 30 + 70 // 70-100% confidence
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to process chat message',
                    details: error.message
                });
            }
        });

        // AI Signals for specific symbols
        this.app.get('/api/ai/signals/:symbol', (req, res) => {
            try {
                const { symbol } = req.params;
                const signal = this.generateAISignal(symbol);
                
                res.json({
                    success: true,
                    symbol: symbol,
                    signal: signal,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate AI signal',
                    details: error.message
                });
            }
        });

        // Bulk AI signals
        this.app.post('/api/ai/signals/bulk', (req, res) => {
            try {
                const { symbols } = req.body;
                const signals = {};
                
                symbols.forEach(symbol => {
                    signals[symbol] = this.generateAISignal(symbol);
                });
                
                res.json({
                    success: true,
                    signals: signals,
                    timestamp: new Date().toISOString(),
                    model_performance: {
                        accuracy_7d: 68.5,
                        accuracy_30d: 72.1,
                        sharpe_ratio: 1.85
                    }
                });
            } catch (error) {
                res.status(500).json({
                    success: false,
                    error: 'Failed to generate bulk AI signals',
                    details: error.message
                });
            }
        });
    }

    generateContextualResponse(message, context) {
        const lowerMessage = message.toLowerCase();

        // Extract stock symbols from message (e.g., RDDT, AAPL, TSLA)
        const stockSymbolRegex = /\b[A-Z]{1,5}\b/g;
        const stockSymbols = message.match(stockSymbolRegex) || [];

        // Stock-specific analysis
        if (stockSymbols.length > 0) {
            const symbol = stockSymbols[0];
            return this.generateStockSpecificResponse(symbol, lowerMessage);
        }

        // Keyword-based response generation
        if (lowerMessage.includes('sentiment') || lowerMessage.includes('market')) {
            return `Current market sentiment is ${context?.sentiment?.sentiment || 'neutral'} with ${Math.round(context?.sentiment?.confidence || 60)}% confidence. This is based on analysis of news sentiment, social media trends, and market momentum indicators.`;
        }

        if (lowerMessage.includes('portfolio') || lowerMessage.includes('allocation')) {
            return `Your portfolio analysis suggests ${context?.portfolio?.recommendation || 'rebalancing'} to optimize risk-adjusted returns. The AI models recommend ${context?.portfolio?.action || 'reviewing your current allocation'} for better performance.`;
        }

        if (lowerMessage.includes('prediction') || lowerMessage.includes('forecast')) {
            return `AI prediction models suggest a ${context?.prediction?.direction || 'hold'} signal with ${Math.round(context?.prediction?.confidence || 65)}% confidence. This is based on neural network analysis of price patterns and market indicators.`;
        }

        if (lowerMessage.includes('risk') || lowerMessage.includes('volatility')) {
            return `Risk analysis shows elevated volatility in current market conditions. Consider reducing position sizes and implementing protective strategies. The VIX is indicating increased uncertainty.`;
        }

        if (lowerMessage.includes('strategy') || lowerMessage.includes('trading')) {
            return `Based on current market conditions, momentum strategies are showing strong performance. Consider focusing on trend-following approaches while maintaining proper risk management.`;
        }

        // Default responses
        const responses = this.mockData.chatResponses;
        return responses[Math.floor(Math.random() * responses.length)];
    }

    generateStockSpecificResponse(symbol, lowerMessage) {
        // Stock-specific data (in a real implementation, this would come from APIs)
        const stockData = this.getStockAnalysis(symbol);

        if (lowerMessage.includes('next move') || lowerMessage.includes('prediction') || lowerMessage.includes('forecast')) {
            return `For ${symbol}: ${stockData.analysis} The AI models show ${stockData.signal} signal with ${stockData.confidence}% confidence. Key factors: ${stockData.keyFactors.join(', ')}. Target timeframe: ${stockData.timeframe}.`;
        }

        if (lowerMessage.includes('buy') || lowerMessage.includes('sell') || lowerMessage.includes('hold')) {
            return `${symbol} Analysis: ${stockData.recommendation}. Current technical indicators show ${stockData.technicalSignal}. Risk level: ${stockData.riskLevel}. ${stockData.reasoning}`;
        }

        if (lowerMessage.includes('price') || lowerMessage.includes('target')) {
            return `${symbol} price analysis: ${stockData.priceAnalysis} The neural networks suggest ${stockData.priceDirection} movement with ${stockData.priceTarget} target over ${stockData.timeframe}.`;
        }

        // Default stock response
        return `${symbol} Analysis: ${stockData.analysis} Current sentiment: ${stockData.sentiment}. The AI models are monitoring ${stockData.monitoringFactors.join(', ')} for this stock.`;
    }

    getStockAnalysis(symbol) {
        // Enhanced stock-specific analysis (this would integrate with real market data APIs)
        const stockDatabase = {
            'RDDT': {
                analysis: 'Reddit (RDDT) shows strong social media momentum and growing user engagement metrics.',
                signal: 'bullish',
                confidence: 78,
                keyFactors: ['increasing user engagement', 'advertising revenue growth', 'platform expansion'],
                timeframe: '2-4 weeks',
                recommendation: 'Moderate Buy - Social media stocks showing renewed interest',
                technicalSignal: 'bullish momentum with volume confirmation',
                riskLevel: 'Medium-High',
                reasoning: 'Strong fundamentals but high volatility typical of social media stocks.',
                priceAnalysis: 'Technical breakout above key resistance levels',
                priceDirection: 'upward',
                priceTarget: '15-20% upside potential',
                sentiment: 'Bullish (72%)',
                monitoringFactors: ['user growth metrics', 'advertising revenue', 'competitive positioning']
            },
            'AAPL': {
                analysis: 'Apple (AAPL) maintains strong fundamentals with consistent innovation pipeline.',
                signal: 'bullish',
                confidence: 85,
                keyFactors: ['iPhone sales resilience', 'services growth', 'AI integration'],
                timeframe: '1-3 months',
                recommendation: 'Strong Buy - Blue chip with growth potential',
                technicalSignal: 'consolidation near all-time highs',
                riskLevel: 'Low-Medium',
                reasoning: 'Stable cash flows and strong brand loyalty provide downside protection.',
                priceAnalysis: 'Trading in established uptrend channel',
                priceDirection: 'gradual upward',
                priceTarget: '8-12% upside potential',
                sentiment: 'Bullish (81%)',
                monitoringFactors: ['iPhone demand', 'China market performance', 'AI product launches']
            },
            'TSLA': {
                analysis: 'Tesla (TSLA) shows mixed signals with EV market leadership but valuation concerns.',
                signal: 'neutral',
                confidence: 65,
                keyFactors: ['EV market competition', 'autonomous driving progress', 'energy business growth'],
                timeframe: '3-6 months',
                recommendation: 'Hold - Wait for clearer direction',
                technicalSignal: 'range-bound with high volatility',
                riskLevel: 'High',
                reasoning: 'Innovation potential offset by execution risks and market competition.',
                priceAnalysis: 'Volatile trading pattern with support at key levels',
                priceDirection: 'sideways to slightly positive',
                priceTarget: '5-15% range potential',
                sentiment: 'Neutral (58%)',
                monitoringFactors: ['delivery numbers', 'FSD progress', 'energy storage growth']
            }
        };

        // Return specific stock data or generate generic analysis
        if (stockDatabase[symbol]) {
            return stockDatabase[symbol];
        }

        // Generic analysis for unknown stocks
        return {
            analysis: `${symbol} is being analyzed by our AI models for technical and fundamental patterns.`,
            signal: ['bullish', 'bearish', 'neutral'][Math.floor(Math.random() * 3)],
            confidence: Math.floor(Math.random() * 30) + 60,
            keyFactors: ['technical indicators', 'market sentiment', 'sector performance'],
            timeframe: '1-2 weeks',
            recommendation: 'Under Analysis - Monitoring key indicators',
            technicalSignal: 'mixed signals requiring further analysis',
            riskLevel: 'Medium',
            reasoning: 'Comprehensive analysis in progress using multiple AI models.',
            priceAnalysis: 'Technical patterns being evaluated',
            priceDirection: 'monitoring for directional signals',
            priceTarget: 'target being calculated',
            sentiment: 'Analyzing (65%)',
            monitoringFactors: ['price action', 'volume patterns', 'news sentiment']
        };
    }

    generateAISignal(symbol) {
        // Mock AI signal generation
        const signals = ['Buy', 'Sell', 'Hold'];
        const signal = signals[Math.floor(Math.random() * signals.length)];
        const confidence = Math.random() * 40 + 60; // 60-100%
        const strength = Math.random() * 10 + 1; // 1-10
        
        return {
            signal: signal,
            confidence: Math.round(confidence),
            strength: Math.round(strength),
            reasoning: this.getSignalReasoning(signal),
            timeframe: '1-5 days',
            risk_level: confidence > 80 ? 'Low' : confidence > 60 ? 'Medium' : 'High'
        };
    }

    getSignalReasoning(signal) {
        const reasons = {
            'Buy': [
                'Strong momentum indicators and positive sentiment',
                'Technical breakout pattern detected',
                'Fundamental analysis shows undervaluation',
                'Neural networks detect accumulation pattern'
            ],
            'Sell': [
                'Overbought conditions and negative divergence',
                'Technical resistance level reached',
                'Fundamental concerns about valuation',
                'AI models detect distribution pattern'
            ],
            'Hold': [
                'Mixed signals from technical and fundamental analysis',
                'Consolidation pattern suggests sideways movement',
                'Waiting for clearer directional signals',
                'Risk-reward ratio not favorable for entry'
            ]
        };
        
        const reasonArray = reasons[signal] || reasons['Hold'];
        return reasonArray[Math.floor(Math.random() * reasonArray.length)];
    }

    getLoadedModels() {
        return {
            predictive_analytics: process.env.PREDICTIVE_ANALYTICS_ENABLED === 'true',
            neural_networks: process.env.NEURAL_NETWORKS_ENABLED === 'true',
            reinforcement_learning: process.env.REINFORCEMENT_LEARNING_ENABLED === 'true',
            nlp: process.env.NLP_ENABLED === 'true',
            time_series: process.env.TIME_SERIES_FORECASTING_ENABLED === 'true'
        };
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`🤖 NexusTradeAI AI API Service running on port ${this.port}`);
            console.log(`🔗 AI API: http://localhost:${this.port}`);
            console.log(`❤️  Health Check: http://localhost:${this.port}/health`);
            console.log(`🧠 AI Models: ${Object.values(this.getLoadedModels()).filter(Boolean).length} enabled`);
        });
    }
}

// Start the AI API service if run directly
if (require.main === module) {
    const aiAPI = new AIAPIService();
    aiAPI.start();
}

module.exports = AIAPIService;
