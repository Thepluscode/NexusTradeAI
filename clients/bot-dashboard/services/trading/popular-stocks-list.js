/**
 * popular-stocks-list.js — Stub module
 *
 * Provides the stock symbol universe for the momentum scanner.
 * Exported via getAllSymbols() to support the unified-trading-bot.js scan loop.
 *
 * This is a curated list of liquid, high-volume US equities across sectors.
 * Add or remove symbols here to adjust the scanner universe.
 */

const STOCK_UNIVERSE = [
  // Mega-cap tech
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'GOOG', 'AMZN', 'META', 'TSLA', 'AVGO', 'ORCL',
  // Large-cap tech
  'AMD', 'INTC', 'QCOM', 'TXN', 'MU', 'AMAT', 'LRCX', 'KLAC', 'MRVL', 'ON',
  'PANW', 'CRWD', 'ZS', 'FTNT', 'NET', 'SNOW', 'DDOG', 'MDB', 'PLTR', 'SHOP',
  'NOW', 'CRM', 'ADBE', 'INTU', 'WDAY', 'TEAM', 'HUBS', 'TTD', 'RBLX', 'U',
  // Semiconductors
  'SMCI', 'ARM', 'ASML', 'TSM', 'MCHP', 'MPWR', 'WOLF', 'ENPH', 'FSLR',
  // Financials
  'JPM', 'BAC', 'GS', 'MS', 'WFC', 'C', 'BLK', 'SCHW', 'V', 'MA', 'PYPL', 'AXP',
  'COF', 'DFS', 'SYF', 'SOFI', 'UPST', 'LC',
  // Healthcare / Biotech
  'UNH', 'JNJ', 'LLY', 'ABBV', 'MRK', 'PFE', 'AMGN', 'GILD', 'REGN', 'BIIB',
  'MRNA', 'BNTX', 'VRTX', 'ISRG', 'SYK', 'BSX', 'MDT', 'TMO', 'DHR', 'A',
  'DXCM', 'ALGN', 'HOLX',
  // Consumer
  'AMZN', 'HD', 'LOW', 'TGT', 'WMT', 'COST', 'TJX', 'ROST', 'LULU', 'NKE',
  'MCD', 'SBUX', 'CMG', 'YUM', 'DPZ', 'DKNG', 'MGM', 'WYNN', 'LVS',
  // Energy
  'XOM', 'CVX', 'COP', 'EOG', 'PXD', 'SLB', 'HAL', 'OXY', 'DVN', 'MPC', 'VLO',
  // Industrials / Transport
  'BA', 'LMT', 'RTX', 'NOC', 'GD', 'CAT', 'DE', 'UNP', 'CSX', 'NSC',
  'DAL', 'UAL', 'AAL', 'LUV', 'FDX', 'UPS',
  // ETFs (high liquidity momentum plays)
  'SPY', 'QQQ', 'IWM', 'XLK', 'XLF', 'XLE', 'XLV', 'ARKK', 'SQQQ', 'TQQQ',
  'SPXL', 'UPRO', 'LABU', 'SOXL',
  // High-beta momentum names
  'COIN', 'HOOD', 'MSTR', 'SMAR', 'AFRM', 'BILL', 'Z', 'RDFN', 'OPEN',
  'RIVN', 'LUCID', 'NIO', 'XPEV', 'LI', 'NKLA',
  // Commodities / Precious metals proxies
  'GLD', 'SLV', 'GDX', 'GDXJ', 'NEM', 'GOLD',
];

// Deduplicate in case any symbol appears twice
const UNIQUE_SYMBOLS = [...new Set(STOCK_UNIVERSE)];

/**
 * Returns the full list of symbols for the momentum scanner.
 * @returns {string[]}
 */
function getAllSymbols() {
  return UNIQUE_SYMBOLS;
}

module.exports = {
  getAllSymbols,
};
