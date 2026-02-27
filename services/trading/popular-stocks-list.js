/**
 * Comprehensive list of stocks that frequently make big moves
 * Includes mega-caps, mid-caps, small-caps, meme stocks, biotech, crypto-related, etc.
 */

module.exports = {
    // Mega Cap Tech (can still have 5-10% moves)
    megaCap: ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC'],

    // High Volatility Large Caps
    volatileLargeCaps: ['SHOP', 'COIN', 'MARA', 'RIOT', 'PLTR', 'SNOW', 'DDOG', 'NET', 'ZS', 'CRWD'],

    // Meme Stocks / Reddit Favorites
    memeStocks: ['GME', 'AMC', 'BBBY', 'BB', 'NOK', 'CLOV', 'WISH', 'SOFI', 'HOOD', 'LCID'],

    // Small Cap Runners (frequent 20-50%+ moves)
    smallCapRunners: [
        'SMX', 'SMCI', 'QUBT', 'RGTI', 'IONQ', 'OKLO', 'RKLB', 'HIMS', 'RBLX', 'ROKU',
        'RDDT', 'AGM', 'PSTV', 'PLTK', 'BGS', 'SXP', 'NHTC', 'ULTP', 'CLTP', 'ARBB',
        'RBOT', 'OUST', 'ARBE', 'ARCI', 'TEM', 'FLGC', 'AIXC', 'KDNC', 'CJET', 'PGY'
    ],

    // Biotech (explosive on FDA news)
    biotech: ['MRNA', 'BNTX', 'NVAX', 'SAVA', 'OCGN', 'INO', 'VXRT', 'ATOS', 'CYDY', 'SRNE'],

    // Energy / Oil (volatile sector)
    energy: ['XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'COP', 'EOG', 'MRO', 'DVN', 'FANG'],

    // EV / Clean Energy
    ev: ['TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI', 'PLUG', 'BLNK', 'CHPT', 'QS'],

    // SPACs / Recent IPOs
    spacs: ['DWAC', 'PSTH', 'IPOF', 'IPOD', 'CCIV', 'CLII', 'ACTC', 'SOAC', 'SRAC', 'HZON'],

    // Chinese Tech ADRs
    chinese: ['BABA', 'JD', 'PDD', 'BIDU', 'NIO', 'XPEV', 'LI', 'BILI', 'IQ', 'DIDI'],

    // Financial/Fintech
    fintech: ['SQ', 'PYPL', 'SOFI', 'AFRM', 'UPST', 'LC', 'COIN', 'HOOD', 'NU', 'OPEN'],

    // Semiconductor
    semiconductor: ['NVDA', 'AMD', 'INTC', 'AVGO', 'QCOM', 'MU', 'AMAT', 'LRCX', 'KLAC', 'ASML'],

    // Cloud/SaaS
    cloud: ['CRM', 'NOW', 'SNOW', 'DDOG', 'NET', 'ZS', 'OKTA', 'ESTC', 'MDB', 'PATH'],

    // ETFs that move
    etfs: ['SPY', 'QQQ', 'IWM', 'DIA', 'TQQQ', 'SQQQ', 'UPRO', 'SPXU', 'TNA', 'TZA'],

    /**
     * Get all symbols as a flat array
     */
    getAllSymbols() {
        const all = [];
        for (const category of Object.keys(this)) {
            if (Array.isArray(this[category])) {
                all.push(...this[category]);
            }
        }
        // Remove duplicates
        return [...new Set(all)];
    },

    /**
     * Get symbols by category
     */
    getByCategory(category) {
        return this[category] || [];
    }
};
