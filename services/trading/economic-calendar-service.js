/**
 * NexusTradeAI - Economic Calendar Service
 * ==========================================
 *
 * Fetches economic events to avoid trading during high-impact news.
 * Critical for Forex trading success.
 *
 * Sources:
 * - Forex Factory (free, manual)
 * - Investing.com (free, scraping)
 * - Trading Economics API (paid, professional)
 */

const axios = require('axios');

// High-impact economic events (manually maintained)
const KNOWN_HIGH_IMPACT_EVENTS = {
    weekly: [
        { dayOfWeek: 5, hour: 13, minute: 30, name: 'NFP (Non-Farm Payrolls)', currency: 'USD' }
    ],
    monthly: [
        { week: 2, dayOfWeek: 3, hour: 19, minute: 0, name: 'FOMC Statement', currency: 'USD' },
        { week: 2, dayOfWeek: 3, hour: 13, minute: 30, name: 'CPI (Inflation)', currency: 'USD' },
        { week: 1, dayOfWeek: 4, hour: 13, minute: 30, name: 'PPI', currency: 'USD' },
        { week: 3, dayOfWeek: 4, hour: 8, minute: 0, name: 'ECB Rate Decision', currency: 'EUR' },
        { week: 2, dayOfWeek: 4, hour: 12, minute: 0, name: 'BOE Rate Decision', currency: 'GBP' },
        { week: 3, dayOfWeek: 3, hour: 3, minute: 0, name: 'BOJ Rate Decision', currency: 'JPY' }
    ]
};

// Impact on specific currency pairs
const CURRENCY_EVENT_IMPACT = {
    'USD': ['EUR_USD', 'GBP_USD', 'USD_JPY', 'USD_CHF', 'AUD_USD', 'USD_CAD', 'NZD_USD'],
    'EUR': ['EUR_USD', 'EUR_JPY', 'EUR_GBP', 'EUR_AUD', 'EUR_CHF'],
    'GBP': ['GBP_USD', 'GBP_JPY', 'EUR_GBP'],
    'JPY': ['USD_JPY', 'EUR_JPY', 'GBP_JPY', 'AUD_JPY'],
    'AUD': ['AUD_USD', 'AUD_JPY', 'EUR_AUD'],
    'CAD': ['USD_CAD'],
    'CHF': ['USD_CHF', 'EUR_CHF'],
    'NZD': ['NZD_USD']
};

class EconomicCalendarService {
    constructor(config = {}) {
        this.config = {
            avoidMinutesBefore: config.avoidMinutesBefore || 30,
            avoidMinutesAfter: config.avoidMinutesAfter || 15,
            tradingEconomicsApiKey: config.tradingEconomicsApiKey || process.env.TRADING_ECONOMICS_API_KEY,
            ...config
        };

        this.events = [];
        this.lastFetch = 0;
        this.fetchInterval = 60 * 60 * 1000; // 1 hour cache
    }

    // Get upcoming events (next 24 hours)
    async getUpcomingEvents() {
        const now = Date.now();

        // Use cached events if fresh
        if (now - this.lastFetch < this.fetchInterval && this.events.length > 0) {
            return this.filterUpcomingEvents(this.events);
        }

        // Try to fetch from Trading Economics API (if available)
        if (this.config.tradingEconomicsApiKey) {
            try {
                const events = await this.fetchFromTradingEconomics();
                if (events.length > 0) {
                    this.events = events;
                    this.lastFetch = now;
                    return this.filterUpcomingEvents(events);
                }
            } catch (error) {
                console.log('Trading Economics API error, using fallback');
            }
        }

        // Fallback: Use known events calendar
        this.events = this.generateKnownEvents();
        this.lastFetch = now;
        return this.filterUpcomingEvents(this.events);
    }

    // Filter to next 24 hours only
    filterUpcomingEvents(events) {
        const now = Date.now();
        const in24Hours = now + 24 * 60 * 60 * 1000;

        return events.filter(e => {
            const eventTime = new Date(e.datetime).getTime();
            return eventTime >= now && eventTime <= in24Hours;
        });
    }

    // Generate known events based on calendar patterns
    generateKnownEvents() {
        const events = [];
        const now = new Date();

        // Generate events for next 7 days
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const date = new Date(now);
            date.setDate(date.getDate() + dayOffset);

            // Weekly events
            for (const event of KNOWN_HIGH_IMPACT_EVENTS.weekly) {
                if (date.getDay() === event.dayOfWeek) {
                    const eventDate = new Date(date);
                    eventDate.setUTCHours(event.hour, event.minute, 0, 0);

                    events.push({
                        name: event.name,
                        currency: event.currency,
                        datetime: eventDate.toISOString(),
                        impact: 'high',
                        affectedPairs: CURRENCY_EVENT_IMPACT[event.currency] || []
                    });
                }
            }
        }

        // Add next occurrence of monthly events
        for (const event of KNOWN_HIGH_IMPACT_EVENTS.monthly) {
            const eventDate = this.getNextMonthlyEvent(event, now);
            if (eventDate) {
                events.push({
                    name: event.name,
                    currency: event.currency,
                    datetime: eventDate.toISOString(),
                    impact: 'high',
                    affectedPairs: CURRENCY_EVENT_IMPACT[event.currency] || []
                });
            }
        }

        return events.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));
    }

    getNextMonthlyEvent(event, fromDate) {
        const date = new Date(fromDate);

        // Try current month first
        for (let monthOffset = 0; monthOffset < 2; monthOffset++) {
            const targetMonth = new Date(date);
            targetMonth.setMonth(targetMonth.getMonth() + monthOffset);

            // Find the nth occurrence of dayOfWeek in the month
            const firstDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), 1);
            let dayCount = 0;

            for (let d = 1; d <= 31; d++) {
                const checkDate = new Date(targetMonth.getFullYear(), targetMonth.getMonth(), d);
                if (checkDate.getMonth() !== targetMonth.getMonth()) break;

                if (checkDate.getDay() === event.dayOfWeek) {
                    dayCount++;
                    if (dayCount === event.week) {
                        checkDate.setUTCHours(event.hour, event.minute, 0, 0);
                        if (checkDate > fromDate) {
                            return checkDate;
                        }
                    }
                }
            }
        }

        return null;
    }

    // Fetch from Trading Economics API (professional)
    async fetchFromTradingEconomics() {
        const response = await axios.get('https://api.tradingeconomics.com/calendar', {
            params: {
                c: this.config.tradingEconomicsApiKey,
                country: 'united states,eurozone,united kingdom,japan',
                importance: '3' // High impact only
            }
        });

        return response.data.map(event => ({
            name: event.Event,
            currency: this.getCurrencyFromCountry(event.Country),
            datetime: event.Date,
            impact: 'high',
            forecast: event.Forecast,
            previous: event.Previous,
            actual: event.Actual,
            affectedPairs: CURRENCY_EVENT_IMPACT[this.getCurrencyFromCountry(event.Country)] || []
        }));
    }

    getCurrencyFromCountry(country) {
        const map = {
            'United States': 'USD',
            'Eurozone': 'EUR',
            'United Kingdom': 'GBP',
            'Japan': 'JPY',
            'Australia': 'AUD',
            'Canada': 'CAD',
            'Switzerland': 'CHF',
            'New Zealand': 'NZD'
        };
        return map[country] || 'USD';
    }

    // Check if we should avoid trading a specific pair
    shouldAvoidTrading(instrument) {
        const now = new Date();
        const events = this.events;

        for (const event of events) {
            // Check if this event affects the instrument
            if (!event.affectedPairs.includes(instrument)) continue;

            const eventTime = new Date(event.datetime);
            const timeDiff = eventTime - now;
            const minutesDiff = timeDiff / 60000;

            // Check if we're in the avoidance window
            if (minutesDiff > -this.config.avoidMinutesAfter &&
                minutesDiff < this.config.avoidMinutesBefore) {

                return {
                    avoid: true,
                    event: event.name,
                    minutesUntil: Math.round(minutesDiff),
                    currency: event.currency
                };
            }
        }

        return { avoid: false };
    }

    // Get next high-impact event for a pair
    getNextEvent(instrument) {
        const now = new Date();

        for (const event of this.events) {
            if (!event.affectedPairs.includes(instrument)) continue;

            const eventTime = new Date(event.datetime);
            if (eventTime > now) {
                const timeDiff = eventTime - now;
                return {
                    name: event.name,
                    datetime: event.datetime,
                    minutesUntil: Math.round(timeDiff / 60000),
                    hoursUntil: Math.round(timeDiff / 3600000)
                };
            }
        }

        return null;
    }

    // Get summary of upcoming events
    getSummary() {
        return {
            totalEvents: this.events.length,
            upcoming24h: this.filterUpcomingEvents(this.events).length,
            events: this.filterUpcomingEvents(this.events).map(e => ({
                name: e.name,
                currency: e.currency,
                datetime: e.datetime,
                affectedPairs: e.affectedPairs.join(', ')
            }))
        };
    }
}

module.exports = { EconomicCalendarService, KNOWN_HIGH_IMPACT_EVENTS, CURRENCY_EVENT_IMPACT };
