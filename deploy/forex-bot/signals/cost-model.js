const COST_MODELS = {
  stock:  { spreadPct: 0.02, slippagePct: 0.03, commissionPerShare: 0 },
  forex:  { spreadPips: 1.5, slippagePips: 0.5, commissionPct: 0 },
  crypto: { takerFeePct: 0.10, slippagePct: 0.05 }
};

function getRoundTripCost(bot, price) {
  const model = COST_MODELS[bot];
  if (!model) throw new Error(`Unknown bot type: ${bot}`);

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
