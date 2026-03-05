/**
 * Comprehensive list of stocks that frequently make big moves
 * Includes mega-caps, mid-caps, small-caps, meme stocks, biotech, crypto-related, etc.
 *
 * Last audited: 2026-03-05
 * Removed: delisted/bankrupt tickers, all SPACs, leveraged/inverse ETFs,
 *          sub-volume penny stocks
 */

module.exports = {
    // Mega Cap Tech (can still have 5-10% moves)
    megaCap: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'INTC', 'ORCL', 'CRM', 'ADBE', 'NFLX'],

    // High Volatility Large Caps
    volatileLargeCaps: ['SHOP', 'COIN', 'MARA', 'RIOT', 'PLTR', 'SNOW', 'DDOG', 'NET', 'ZS', 'CRWD', 'GTLB', 'HUBS', 'TWLO', 'CFLT', 'BILL'],

    // Meme Stocks / Reddit Favorites (active, liquid)
    // Removed: BBBY (bankrupt/delisted), WISH (effectively delisted), CLOV (sub-volume)
    memeStocks: ['GME', 'AMC', 'BB', 'NOK', 'SOFI', 'HOOD', 'LCID', 'CLOV', 'FFIE', 'SPCE'],

    // Small Cap Runners (frequent 20-50%+ moves)
    // Removed: SMX (churning incident + erratic volume), ULTP/CLTP/ARBB/FLGC/AIXC/KDNC/CJET/PGY/PSTV/RBOT
    //          (delisted, sub-volume, or penny-stock territory)
    smallCapRunners: [
        'SMCI', 'QUBT', 'RGTI', 'IONQ', 'OKLO', 'RKLB', 'HIMS', 'RBLX', 'ROKU',
        'RDDT', 'PLTK', 'BGS', 'SXP', 'NHTC', 'OUST', 'ARBE', 'TEM',
        'SOUN', 'BBAI', 'ACHR', 'JOBY', 'LILM', 'LUNR', 'ASTS', 'RDW',
    ],

    // Biotech (explosive on FDA news)
    // Removed: CYDY (SEC enforcement, sub-penny OTC), SRNE (bankrupt/delisted)
    biotech: ['MRNA', 'BNTX', 'NVAX', 'SAVA', 'OCGN', 'INO', 'VXRT', 'ATOS', 'BEAM', 'CRSP', 'EDIT', 'NTLA', 'RXRX', 'ARDX'],

    // Energy / Oil (volatile sector)
    energy: ['XOM', 'CVX', 'OXY', 'SLB', 'HAL', 'COP', 'EOG', 'MRO', 'DVN', 'FANG', 'AR', 'RRC', 'EQT', 'SM'],

    // EV / Clean Energy
    // Removed duplicate TSLA (already in megaCap), LCID (already in memeStocks)
    ev: ['RIVN', 'NIO', 'XPEV', 'LI', 'PLUG', 'BLNK', 'CHPT', 'QS', 'FSR', 'NKLA', 'WKHS'],

    // Chinese Tech ADRs
    // Removed: DIDI (delisted from NYSE in 2022, now OTC only)
    // Removed duplicates NIO/XPEV/LI (already in ev)
    chinese: ['BABA', 'JD', 'PDD', 'BIDU', 'BILI', 'IQ', 'TCOM', 'TIGR', 'FUTU', 'TUYA'],

    // Financial / Fintech
    // Removed duplicates SOFI/HOOD/COIN (already in other categories)
    fintech: ['SQ', 'PYPL', 'AFRM', 'UPST', 'LC', 'NU', 'OPEN', 'RELY', 'DAVE', 'MQ'],

    // Semiconductor
    // Removed duplicates NVDA/AMD/INTC (already in megaCap)
    semiconductor: ['AVGO', 'QCOM', 'MU', 'AMAT', 'LRCX', 'KLAC', 'ASML', 'MRVL', 'SWKS', 'MPWR', 'ON', 'WOLF', 'AMBA'],

    // Cloud / SaaS
    // Removed duplicates SNOW/DDOG/NET/ZS (already in volatileLargeCaps)
    cloud: ['NOW', 'OKTA', 'ESTC', 'MDB', 'PATH', 'AI', 'VEEV', 'APPN', 'NCNO', 'BRZE'],

    // ETFs (non-leveraged only — leveraged ETFs have daily rebalancing decay
    // that destroys multi-day hold P&L, incompatible with trailing stop system)
    // Removed: TQQQ, SQQQ, UPRO, SPXU, TNA, TZA
    etfs: ['SPY', 'QQQ', 'IWM', 'DIA', 'XBI', 'ARKK', 'SOXX'],

    // High-Growth / New Momentum Names (added 2026-02-27)
    highGrowth: ['MSTR', 'ARM', 'CELH', 'APP', 'DUOL', 'CAVA', 'SPOT', 'UBER', 'ABNB', 'TTWO', 'RBRK', 'IREN', 'CORZ', 'HUT', 'BITF'],

    // Crypto-adjacent (Bitcoin proxies, high volatility)
    cryptoAdjacent: ['GBTC', 'MARA', 'RIOT', 'CLSK', 'CIFR', 'BTBT', 'WGMI'],

    // AI / Machine Learning pure-plays
    aiStocks: ['SOUN', 'BBAI', 'AGEN', 'GFAI', 'AIOT', 'BIGB', 'KCGI'],

    // Defense / Aerospace (geopolitical volatility)
    defense: ['LMT', 'RTX', 'NOC', 'BA', 'GD', 'KTOS', 'RCAT', 'BWXT', 'HII', 'TDG'],

    // Consumer Discretionary (earnings movers)
    consumer: ['LULU', 'NKE', 'DECK', 'CROX', 'SKX', 'ONON', 'UAA', 'PVH', 'RL'],

    // Healthcare / Medical Devices
    healthcare: ['ISRG', 'DXCM', 'IDXX', 'EW', 'ALGN', 'NVCR', 'ACAD', 'INVA'],

    /**
     * Get all symbols as a flat array (deduped)
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
