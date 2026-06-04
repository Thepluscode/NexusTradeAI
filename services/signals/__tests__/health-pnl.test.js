/**
 * health-pnl — DB-backed P&L summary for GET /api/health/detailed.
 *
 * Contract under test (services/signals/health-pnl.js → getPnlSummary):
 *   - Read-only single query against `trades`, parameterized by bot.
 *   - Never throws: null/failed DB degrades to { available:false, error }.
 *   - Numeric coercion: counts (pg int8 → JS string) → int; pnl → round2;
 *     win rate = winners / (winners+losers), null when no decided trades.
 *   - "Today" bucketed by DATE(COALESCE(exit_time, created_at)) = CURRENT_DATE.
 *
 * Covers Rule 2 categories: normal, boundary, malformed, adversarial,
 * regression, and failure (dependency error).
 */
const { getPnlSummary } = require('../health-pnl');

// Minimal pg.Pool stub. `rows` is the single aggregate row the real query returns.
// node-postgres returns COUNT(*) (int8) as STRINGS and ::FLOAT as numbers, so the
// happy-path fixtures deliberately use strings for counts to mirror production.
function mockPool(rows, capture) {
  return {
    query: async (sql, params) => {
      if (capture) { capture.sql = sql; capture.params = params; }
      return { rows };
    },
  };
}

const ZERO_SHAPE = {
  available: false,
  pnlToday: 0,
  pnlTotal: 0,
  tradesToday: 0,
  tradesTotal: 0,
  winnersTotal: 0,
  losersTotal: 0,
  winRatePct: null,
  openPositions: 0,
};

describe('health-pnl — getPnlSummary', () => {
  // ── Failure / guard cases ────────────────────────────────────────────────
  describe('failure & guards', () => {
    it('returns unavailable zeros when dbPool is null (DB not configured)', async () => {
      const r = await getPnlSummary(null, 'crypto');
      expect(r).toEqual({ ...ZERO_SHAPE, error: 'DB not configured' });
    });

    it('returns unavailable when bot name is missing', async () => {
      const r = await getPnlSummary(mockPool([{}]), '');
      expect(r.available).toBe(false);
      expect(r.error).toBe('bot name required');
    });

    it('never throws when the query rejects — surfaces error, returns zeros', async () => {
      const throwingPool = { query: async () => { throw new Error('connection terminated'); } };
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const r = await getPnlSummary(throwingPool, 'stock');
      expect(r.available).toBe(false);
      expect(r.error).toBe('connection terminated');
      expect(r.openPositions).toBe(0);
      // Rule 8 — failure is logged, not silent.
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("bot='stock'"));
      warn.mockRestore();
    });

    it('logs the bot name and underlying message on failure', async () => {
      const throwingPool = { query: async () => { throw new Error('boom'); } };
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      await getPnlSummary(throwingPool, 'forex');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
      warn.mockRestore();
    });
  });

  // ── Normal cases ─────────────────────────────────────────────────────────
  describe('normal aggregation', () => {
    it('maps a typical aggregate row (pg string counts + float pnl)', async () => {
      const r = await getPnlSummary(mockPool([{
        open_positions: '3',
        trades_total: '100',
        trades_today: '4',
        winners_total: '40',
        losers_total: '55',
        pnl_total: -28.67,
        pnl_today: 1.23,
      }]), 'crypto');
      expect(r).toEqual({
        available: true,
        pnlToday: 1.23,
        pnlTotal: -28.67,
        tradesToday: 4,
        tradesTotal: 100,
        winnersTotal: 40,
        losersTotal: 55,
        winRatePct: 42.1, // 40 / (40+55) = 0.42105 → 42.1
        openPositions: 3,
      });
    });

    it('computes a clean win rate for a profitable book', async () => {
      const r = await getPnlSummary(mockPool([{
        open_positions: '1', trades_total: '10', trades_today: '2',
        winners_total: '6', losers_total: '4', pnl_total: 152.5, pnl_today: 12.0,
      }]), 'stock');
      expect(r.winRatePct).toBe(60); // 6/10
      expect(r.pnlTotal).toBe(152.5);
    });

    it('passes the bot through as a bound parameter — no string interpolation (SQLi-safe)', async () => {
      const cap = {};
      await getPnlSummary(mockPool([{}], cap), 'forex');
      expect(cap.params).toEqual(['forex']);
      expect(cap.sql).toContain('WHERE bot=$1');
      expect(cap.sql).not.toContain("'forex'");
    });

    it('only ever issues a read query (no INSERT/UPDATE/DELETE)', async () => {
      const cap = {};
      await getPnlSummary(mockPool([{}], cap), 'crypto');
      expect(cap.sql).toMatch(/^\s*SELECT/i);
      expect(cap.sql).not.toMatch(/INSERT|UPDATE|DELETE/i);
    });
  });

  // ── Boundary cases ───────────────────────────────────────────────────────
  describe('boundaries', () => {
    it('win rate is null when there are zero decided trades', async () => {
      const r = await getPnlSummary(mockPool([{
        open_positions: '0', trades_total: '0', trades_today: '0',
        winners_total: '0', losers_total: '0', pnl_total: 0, pnl_today: 0,
      }]), 'crypto');
      expect(r.winRatePct).toBeNull();
      expect(r.available).toBe(true);
    });

    it('100% win rate when there are no losers', async () => {
      const r = await getPnlSummary(mockPool([{
        winners_total: '5', losers_total: '0', trades_total: '5',
      }]), 'crypto');
      expect(r.winRatePct).toBe(100);
    });

    it('0% win rate when there are no winners', async () => {
      const r = await getPnlSummary(mockPool([{
        winners_total: '0', losers_total: '7', trades_total: '7',
      }]), 'crypto');
      expect(r.winRatePct).toBe(0);
    });

    it('breakeven trades are excluded from the win-rate denominator', async () => {
      // 4 winners, 4 losers, 92 breakeven → decided=8 → 50%, not 4%.
      const r = await getPnlSummary(mockPool([{
        trades_total: '100', winners_total: '4', losers_total: '4',
      }]), 'crypto');
      expect(r.winRatePct).toBe(50);
    });

    it('rounds P&L to 2 decimals', async () => {
      const r = await getPnlSummary(mockPool([{ pnl_total: -28.674, pnl_today: 1.236 }]), 'crypto');
      expect(r.pnlTotal).toBe(-28.67); // -28.674 → -28.67
      expect(r.pnlToday).toBe(1.24);   // 1.236 → 1.24
    });

    it('rounding follows IEEE-754 Math.round (1.005 → 1.00, the float-repr reality)', async () => {
      // Locks documented behavior: 1.005*100 = 100.4999… in IEEE-754, so this floors.
      // Asserted explicitly so a future "fix" to round2 is a conscious, reviewed change.
      const r = await getPnlSummary(mockPool([{ pnl_today: 1.005 }]), 'crypto');
      expect(r.pnlToday).toBe(1);
    });
  });

  // ── Malformed input ──────────────────────────────────────────────────────
  describe('malformed rows', () => {
    it('an empty rows array yields available:true with all zeros', async () => {
      const r = await getPnlSummary(mockPool([]), 'crypto');
      expect(r.available).toBe(true);
      expect(r.tradesTotal).toBe(0);
      expect(r.winRatePct).toBeNull();
      expect(r.pnlTotal).toBe(0);
    });

    it('missing columns default to zero / null', async () => {
      const r = await getPnlSummary(mockPool([{ pnl_total: 5 }]), 'crypto');
      expect(r.pnlTotal).toBe(5);
      expect(r.tradesTotal).toBe(0);
      expect(r.openPositions).toBe(0);
      expect(r.winRatePct).toBeNull();
    });

    it('NaN / null / non-numeric pnl coerces to 0 (never NaN in the payload)', async () => {
      const r = await getPnlSummary(mockPool([{
        pnl_total: NaN, pnl_today: null, winners_total: 'not-a-number',
      }]), 'crypto');
      expect(r.pnlTotal).toBe(0);
      expect(r.pnlToday).toBe(0);
      expect(Number.isNaN(r.pnlTotal)).toBe(false);
      expect(r.winnersTotal).toBe(0);
    });

    it('fractional count strings are truncated, not rounded', async () => {
      const r = await getPnlSummary(mockPool([{ trades_total: '7.9', open_positions: '2.4' }]), 'crypto');
      expect(r.tradesTotal).toBe(7);
      expect(r.openPositions).toBe(2);
    });
  });

  // ── Adversarial ──────────────────────────────────────────────────────────
  describe('adversarial', () => {
    it('a row of all-null fields produces the zero shape (available:true)', async () => {
      const r = await getPnlSummary(mockPool([{
        open_positions: null, trades_total: null, trades_today: null,
        winners_total: null, losers_total: null, pnl_total: null, pnl_today: null,
      }]), 'crypto');
      expect(r).toEqual({ ...ZERO_SHAPE, available: true });
    });

    it('preserves the sign of a net-negative book (does not abs)', async () => {
      const r = await getPnlSummary(mockPool([{ pnl_total: -744.87, pnl_today: -12.34 }]), 'forex');
      expect(r.pnlTotal).toBe(-744.87);
      expect(r.pnlToday).toBe(-12.34);
    });

    it('handles very large trade counts and P&L without overflow', async () => {
      const r = await getPnlSummary(mockPool([{
        trades_total: '1000000', winners_total: '600000', losers_total: '400000',
        pnl_total: 1234567.891,
      }]), 'crypto');
      expect(r.tradesTotal).toBe(1000000);
      expect(r.winRatePct).toBe(60);
      expect(r.pnlTotal).toBe(1234567.89);
    });

    it('Infinity pnl coerces to 0 (Number.isFinite guard)', async () => {
      const r = await getPnlSummary(mockPool([{ pnl_total: Infinity }]), 'crypto');
      expect(r.pnlTotal).toBe(0);
    });
  });

  // ── Regression ───────────────────────────────────────────────────────────
  describe('regression', () => {
    it('matches the documented June 2026 crypto baseline shape (213 trades, 35.7% WR, -$28.67)', async () => {
      // winners/losers chosen so winners/(winners+losers) ≈ 35.7% on decided trades.
      const r = await getPnlSummary(mockPool([{
        open_positions: '0', trades_total: '213', trades_today: '0',
        winners_total: '76', losers_total: '137', pnl_total: -28.67, pnl_today: 0,
      }]), 'crypto');
      expect(r.tradesTotal).toBe(213);
      expect(r.pnlTotal).toBe(-28.67);
      expect(r.winRatePct).toBe(35.7); // 76 / 213
    });

    it('today and all-time figures are independent (today is a subset, not the same number)', async () => {
      const r = await getPnlSummary(mockPool([{
        trades_total: '100', trades_today: '3',
        pnl_total: -28.67, pnl_today: 4.10,
      }]), 'crypto');
      expect(r.tradesToday).toBe(3);
      expect(r.tradesTotal).toBe(100);
      expect(r.pnlToday).toBe(4.10);
      expect(r.pnlTotal).toBe(-28.67);
    });
  });
});
