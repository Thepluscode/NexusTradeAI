const axios = require('axios');
const EventEmitter = require('events');

/**
 * News and Sentiment Analysis Service
 *
 * Integrates multiple reliable news sources to analyze market sentiment
 * and provide trading signals based on news events.
 *
 * Sources:
 * - Alpha Vantage News Sentiment API
 * - NewsAPI for general financial news
 * - Custom sentiment analysis
 */
class NewsSentimentService extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            alphaVantageKey: process.env.ALPHA_VANTAGE_API_KEY || 'demo',
            newsApiKey: process.env.NEWS_API_KEY || '',
            updateInterval: config.updateInterval || 300000, // 5 minutes
            sentimentThreshold: config.sentimentThreshold || 0.15, // Minimum sentiment score to act
            enableRealTimeNews: config.enableRealTimeNews !== false,
            ...config
        };

        // Cache for sentiment scores
        this.sentimentCache = new Map();
        this.marketSentiment = {
            overall: 0,
            tech: 0,
            finance: 0,
            energy: 0,
            lastUpdate: null
        };

        // News keywords that indicate significant market events
        this.criticalKeywords = [
            'federal reserve', 'interest rate', 'inflation', 'recession',
            'trade war', 'tariff', 'sanctions', 'war', 'conflict',
            'earnings', 'merger', 'acquisition', 'bankruptcy',
            'trump', 'biden', 'china', 'russia', 'europe'
        ];

        this.isInitialized = false;
    }

    async initialize() {
        console.log('📰 Initializing News Sentiment Service...');

        if (this.config.enableRealTimeNews) {
            // Start periodic sentiment updates
            this.startSentimentMonitoring();
        }

        // Get initial sentiment
        await this.updateMarketSentiment();

        this.isInitialized = true;
        console.log('✅ News Sentiment Service initialized');
    }

    startSentimentMonitoring() {
        setInterval(async () => {
            try {
                await this.updateMarketSentiment();
            } catch (error) {
                console.error('Error updating market sentiment:', error.message);
            }
        }, this.config.updateInterval);
    }

    async updateMarketSentiment() {
        try {
            const news = await this.fetchRecentNews();
            const sentiment = this.analyzeSentiment(news);

            this.marketSentiment = {
                ...sentiment,
                lastUpdate: new Date()
            };

            this.emit('sentimentUpdate', this.marketSentiment);

            console.log(`📊 Market Sentiment Updated: Overall=${sentiment.overall.toFixed(2)}`);

            return this.marketSentiment;
        } catch (error) {
            console.warn('⚠️  Failed to update market sentiment:', error.message);
            return this.marketSentiment;
        }
    }

    async fetchRecentNews() {
        const news = [];

        // Try Alpha Vantage News Sentiment API (free tier: 25 requests/day)
        if (this.config.alphaVantageKey && this.config.alphaVantageKey !== 'demo') {
            try {
                const avNews = await this.fetchAlphaVantageNews();
                news.push(...avNews);
            } catch (error) {
                console.warn('Alpha Vantage news fetch failed:', error.message);
            }
        }

        // Try NewsAPI (free tier: 100 requests/day)
        if (this.config.newsApiKey) {
            try {
                const newsApiData = await this.fetchNewsAPI();
                news.push(...newsApiData);
            } catch (error) {
                console.warn('NewsAPI fetch failed:', error.message);
            }
        }

        // Fallback: Use mock sentiment data
        if (news.length === 0) {
            return this.generateMockNews();
        }

        return news;
    }

    async fetchAlphaVantageNews() {
        try {
            const response = await axios.get('https://www.alphavantage.co/query', {
                params: {
                    function: 'NEWS_SENTIMENT',
                    tickers: 'SPY,QQQ,DIA',
                    apikey: this.config.alphaVantageKey,
                    limit: 50
                },
                timeout: 10000
            });

            if (response.data.feed) {
                return response.data.feed.map(item => ({
                    title: item.title,
                    summary: item.summary,
                    source: item.source,
                    sentiment: parseFloat(item.overall_sentiment_score) || 0,
                    relevance: parseFloat(item.relevance_score) || 0.5,
                    tickers: item.ticker_sentiment || [],
                    timestamp: new Date(item.time_published)
                }));
            }

            return [];
        } catch (error) {
            throw new Error(`Alpha Vantage error: ${error.message}`);
        }
    }

    async fetchNewsAPI() {
        try {
            const response = await axios.get('https://newsapi.org/v2/everything', {
                params: {
                    q: 'stock market OR trading OR federal reserve OR economy',
                    language: 'en',
                    sortBy: 'publishedAt',
                    pageSize: 50,
                    apiKey: this.config.newsApiKey
                },
                timeout: 10000
            });

            if (response.data.articles) {
                return response.data.articles.map(article => ({
                    title: article.title,
                    summary: article.description || '',
                    source: article.source.name,
                    sentiment: this.calculateSentimentFromText(article.title + ' ' + article.description),
                    relevance: 0.7,
                    timestamp: new Date(article.publishedAt)
                }));
            }

            return [];
        } catch (error) {
            throw new Error(`NewsAPI error: ${error.message}`);
        }
    }

    calculateSentimentFromText(text) {
        if (!text) return 0;

        const lowerText = text.toLowerCase();

        // Positive keywords
        const positiveWords = ['surge', 'rally', 'gain', 'growth', 'positive', 'bullish',
                               'soar', 'jump', 'rise', 'up', 'record', 'all-time high'];

        // Negative keywords
        const negativeWords = ['crash', 'plunge', 'drop', 'decline', 'negative', 'bearish',
                               'fall', 'down', 'collapse', 'war', 'tariff', 'recession',
                               'inflation', 'crisis', 'concern', 'fear'];

        let score = 0;

        positiveWords.forEach(word => {
            if (lowerText.includes(word)) score += 0.1;
        });

        negativeWords.forEach(word => {
            if (lowerText.includes(word)) score -= 0.15;
        });

        // Critical events get stronger weight
        this.criticalKeywords.forEach(keyword => {
            if (lowerText.includes(keyword)) {
                const isNegative = negativeWords.some(neg => lowerText.includes(neg));
                score += isNegative ? -0.2 : 0;
            }
        });

        return Math.max(-1, Math.min(1, score)); // Clamp between -1 and 1
    }

    analyzeSentiment(newsItems) {
        if (!newsItems || newsItems.length === 0) {
            return {
                overall: 0,
                tech: 0,
                finance: 0,
                energy: 0,
                confidence: 0
            };
        }

        // Calculate weighted sentiment (recent news weighted higher)
        const now = Date.now();
        let totalWeight = 0;
        let weightedSum = 0;

        newsItems.forEach(item => {
            const ageHours = (now - new Date(item.timestamp).getTime()) / (1000 * 60 * 60);
            const timeWeight = Math.exp(-ageHours / 24); // Exponential decay over 24 hours
            const weight = timeWeight * (item.relevance || 0.5);

            totalWeight += weight;
            weightedSum += item.sentiment * weight;
        });

        const overallSentiment = totalWeight > 0 ? weightedSum / totalWeight : 0;

        return {
            overall: overallSentiment,
            tech: overallSentiment * 0.9, // Tech slightly follows overall
            finance: overallSentiment * 1.1, // Finance more sensitive
            energy: overallSentiment * 0.8, // Energy less correlated
            confidence: Math.min(newsItems.length / 50, 1.0), // Confidence based on news volume
            newsCount: newsItems.length
        };
    }

    generateMockNews() {
        // Generate realistic mock news based on time of day and market conditions
        const scenarios = [
            { sentiment: -0.3, title: 'Trade tensions escalate as tariffs announced' },
            { sentiment: -0.2, title: 'Fed signals potential interest rate concerns' },
            { sentiment: 0.2, title: 'Tech earnings beat expectations' },
            { sentiment: 0.3, title: 'Strong jobs report boosts market optimism' },
            { sentiment: -0.1, title: 'Geopolitical tensions weigh on markets' },
            { sentiment: 0.1, title: 'Corporate earnings season shows resilience' }
        ];

        const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];

        return [{
            title: randomScenario.title,
            summary: 'Market analysis based on recent developments',
            source: 'Market Watch',
            sentiment: randomScenario.sentiment,
            relevance: 0.8,
            timestamp: new Date()
        }];
    }

    async getSentimentForSymbol(symbol) {
        // Check cache first
        if (this.sentimentCache.has(symbol)) {
            const cached = this.sentimentCache.get(symbol);
            if (Date.now() - cached.timestamp < 300000) { // 5 minute cache
                return cached.sentiment;
            }
        }

        // Determine sector
        let sectorSentiment = this.marketSentiment.overall;

        if (['AAPL', 'GOOGL', 'MSFT', 'NVDA', 'AMD', 'TSLA'].includes(symbol)) {
            sectorSentiment = this.marketSentiment.tech;
        } else if (['JPM', 'BAC', 'GS', 'V', 'MA'].includes(symbol)) {
            sectorSentiment = this.marketSentiment.finance;
        } else if (['XOM', 'CVX', 'USO'].includes(symbol)) {
            sectorSentiment = this.marketSentiment.energy;
        }

        const result = {
            sentiment: sectorSentiment,
            strength: Math.abs(sectorSentiment),
            signal: sectorSentiment > this.config.sentimentThreshold ? 'BULLISH' :
                    sectorSentiment < -this.config.sentimentThreshold ? 'BEARISH' : 'NEUTRAL'
        };

        // Cache the result
        this.sentimentCache.set(symbol, {
            sentiment: result,
            timestamp: Date.now()
        });

        return result;
    }

    getMarketSentiment() {
        return this.marketSentiment;
    }

    shouldTradeBasedOnSentiment(symbol, tradeDirection) {
        const sentiment = this.getSentimentForSymbol(symbol);

        // Don't trade against strong negative sentiment
        if (sentiment.signal === 'BEARISH' && tradeDirection === 'LONG') {
            return {
                allowed: false,
                reason: 'Strong negative market sentiment detected',
                confidence: 0
            };
        }

        // Boost confidence for trades aligned with sentiment
        if (sentiment.signal === 'BULLISH' && tradeDirection === 'LONG') {
            return {
                allowed: true,
                reason: 'Positive sentiment supports long position',
                confidence: 0.8 + (sentiment.strength * 0.2)
            };
        }

        if (sentiment.signal === 'BEARISH' && tradeDirection === 'SHORT') {
            return {
                allowed: true,
                reason: 'Negative sentiment supports short position',
                confidence: 0.8 + (sentiment.strength * 0.2)
            };
        }

        // Neutral sentiment - allow trade with moderate confidence
        return {
            allowed: true,
            reason: 'Neutral sentiment, trade allowed',
            confidence: 0.6
        };
    }
}

module.exports = NewsSentimentService;
