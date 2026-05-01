/**
 * Round-trip transaction cost model per asset class.
 *
 * Costs are expressed as PERCENTAGE NUMBERS (e.g. 0.10 = 0.10%, NOT 10%).
 * Consumers (entry-qualifier.js) compare against avgWinPct / avgLossPct
 * which are also percentage numbers (e.g. 2.0 = 2.0%).
 *
 * [2026-04-30] Crypto fees corrected from 0.10% → 0.26% (Kraken paper-mode
 * taker fee at tier 0). The old 0.10% under-estimated round-trip cost by
 * ~0.6% (real round-trip = (0.26+0.10)*2 = 0.72%, old model said 0.30%).
 * EV calc is now closer to reality and will reject more marginal setups.
 *
 * Source for crypto: https://www.kraken.com/features/fee-schedule
 * Source for stock: typical liquid US-equity spread/slippage on 5-min bars.
 * Source for forex: typical major-pair spread + practice-mode slippage.
 */
const COST_MODELS = {
  stock:  { spreadPct: 0.02, slippagePct: 0.03, commissionPerShare: 0 },
  forex:  { spreadPips: 1.5, slippagePips: 0.5, commissionPct: 0 },
  crypto: { takerFeePct: 0.26, slippagePct: 0.10 } // [2026-04-30] was 0.10/0.05; Kraken tier 0 taker = 0.26%
};

function getRoundTripCost(bot, price) {
  const model = COST_MODELS[bot];
  if (!model) throw new Error(`Unknown bot type: ${bot}`);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid price for cost model: ${price}`);
  }

  if (bot === 'forex') {
    const totalPips = (model.spreadPips + model.slippagePips) * 2;
    const pipValue = price > 10 ? 0.01 : 0.0001; // JPY pairs vs others
    return { costPct: (totalPips * pipValue / price) * 100, costPips: totalPips, costUsd: 0 };
  }

  const costPct = bot === 'stock'
    ? (model.spreadPct + model.slippagePct) * 2
    : (model.takerFeePct + model.slippagePct) * 2;

  return { costPct, costPips: 0, costUsd: (costPct / 100) * price };
}

module.exports = { getRoundTripCost, COST_MODELS };
